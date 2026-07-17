import { createHash } from "crypto";
import OpenAI from "openai";
import { db, conversations, messages, learningCandidates } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { getOpenAiApiKeyForClient, isOpenAiConfigured } from "../lib/openaiEnv.js";
import { logger } from "../lib/logger.js";
import { ensureLearningSchema } from "./learningSchema.js";
import { approveLearningCandidate } from "./learningStore.js";

const openai = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });

/** Confianza mínima para promover automáticamente a training_examples (Lucy lo usa al responder). */
const AUTO_APPROVE_CONFIDENCE = 0.85;
/** Mínimo entre extracciones aunque haya mensajes nuevos (evita spam OpenAI). */
const MIN_EXTRACT_GAP_MS = 15 * 60 * 1000;
/** Si no hay mensajes humanos nuevos, no re-extraer antes de este idle. */
const IDLE_EXTRACT_GAP_MS = 45 * 60 * 1000;

interface ExtractedPair {
  user_message: string;
  suggested_response: string;
  label?: string;
  confidence?: number;
  context_snippet?: string;
}

function dedupeKey(leadId: string, userMsg: string, response: string): string {
  return createHash("sha256")
    .update(`${leadId}|${userMsg.trim()}|${response.trim()}`)
    .digest("hex");
}

function messageTimeMs(m: { timestamp?: Date | null }): number {
  return m.timestamp ? new Date(m.timestamp).getTime() : 0;
}

export async function extractLearningCandidatesForLead(
  kommoLeadId: string,
  options: { force?: boolean } = {}
): Promise<number> {
  await ensureLearningSchema();
  if (!isOpenAiConfigured()) {
    logger.warn("learningExtractor: OpenAI no configurado");
    return 0;
  }

  const leadId = String(kommoLeadId);
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.kommoLeadId, leadId),
  });

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.kommoLeadId, leadId))
    .orderBy(asc(messages.timestamp));

  const humanMsgs = rows.filter((m) => m.authorType === "human_agent" || m.role === "human");
  if (humanMsgs.length === 0) return 0;

  const lastExtract = conv?.lastLearningExtractAt?.getTime() ?? 0;
  const newestHuman = humanMsgs.reduce((max, m) => Math.max(max, messageTimeMs(m)), 0);
  const hasNewHuman = newestHuman > lastExtract;
  const sinceLast = Date.now() - lastExtract;

  if (!options.force && lastExtract > 0) {
    if (sinceLast < MIN_EXTRACT_GAP_MS) return 0;
    if (!hasNewHuman && sinceLast < IDLE_EXTRACT_GAP_MS) return 0;
  }

  const transcript = rows
    .slice(-40)
    .map((m) => {
      const who =
        m.authorType === "human_agent" || m.role === "human"
          ? "ALEJANDRO"
          : m.authorType === "lucy" || m.role === "assistant"
            ? "LUCY"
            : "CLIENTE";
      return `${who}: ${m.content}`;
    })
    .join("\n");

  const system = `Eres un analista de entrenamiento para Lucy, agente virtual de Bodasesor (banquetes y eventos).
Extrae pares útiles para few-shot learning a partir de conversaciones donde ALEJANDRO (humano) atendió al cliente.

Reglas:
- Solo pares donde la respuesta de ALEJANDRO sea útil para futuros clientes (precios, servicios, cobertura, tiempos, objeciones, tono).
- NO incluyas saludos vacíos, "ok", "gracias" solos, ni datos personales sensibles.
- La suggested_response debe sonar natural en español mexicano, como Lucy (profesional, cálida, sin emojis excesivos).
- Máximo 5 pares.
- Responde SOLO JSON: { "pairs": [ { "user_message", "suggested_response", "label", "confidence" (0-1), "context_snippet" } ] }`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env["OPENAI_MODEL"] ?? "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Transcript:\n${transcript}` },
      ],
      max_tokens: 2000,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { pairs?: ExtractedPair[] };
    const pairs = (parsed.pairs ?? []).filter(
      (p) => p.user_message?.trim() && p.suggested_response?.trim()
    );

    let created = 0;
    let autoApproved = 0;
    for (const pair of pairs.slice(0, 5)) {
      const key = dedupeKey(leadId, pair.user_message, pair.suggested_response);
      const confidence = typeof pair.confidence === "number" ? pair.confidence : null;
      try {
        const [inserted] = await db
          .insert(learningCandidates)
          .values({
            kommoLeadId: leadId,
            userMessage: pair.user_message.trim(),
            suggestedResponse: pair.suggested_response.trim(),
            label: pair.label?.trim() || "Aprendido de chat humano",
            status: "pending",
            source: "human_chat",
            confidence: confidence != null ? String(confidence) : null,
            contextSnippet: pair.context_snippet?.trim() || null,
            dedupeKey: key,
          })
          .returning({ id: learningCandidates.id });
        created++;

        // Alta confianza → pasa a training_examples sin esperar revisión manual.
        if (inserted?.id && confidence != null && confidence >= AUTO_APPROVE_CONFIDENCE) {
          const approved = await approveLearningCandidate(inserted.id, "auto-learning@lucy");
          if (approved) autoApproved++;
        }
      } catch {
        // dedupe_key conflict — ya existe
      }
    }

    await db
      .update(conversations)
      .set({ lastLearningExtractAt: new Date(), updatedAt: new Date() })
      .where(eq(conversations.kommoLeadId, leadId));

    logger.info(
      { leadId, created, autoApproved, hasNewHuman },
      "learningExtractor: candidatos generados"
    );
    return created;
  } catch (err) {
    logger.warn({ err, leadId }, "learningExtractor: extracción falló");
    return 0;
  }
}
