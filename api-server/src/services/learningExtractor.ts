import { createHash } from "crypto";
import OpenAI from "openai";
import { db, conversations, messages, learningCandidates } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { getOpenAiApiKeyForClient, isOpenAiConfigured } from "../lib/openaiEnv.js";
import { logger } from "../lib/logger.js";
import { ensureLearningSchema } from "./learningSchema.js";

const openai = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });

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

  if (
    !options.force &&
    conv?.lastLearningExtractAt &&
    Date.now() - conv.lastLearningExtractAt.getTime() < 6 * 60 * 60 * 1000
  ) {
    return 0;
  }

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.kommoLeadId, leadId))
    .orderBy(asc(messages.timestamp));

  const humanMsgs = rows.filter((m) => m.authorType === "human_agent" || m.role === "human");
  if (humanMsgs.length === 0) return 0;

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
    for (const pair of pairs.slice(0, 5)) {
      const key = dedupeKey(leadId, pair.user_message, pair.suggested_response);
      try {
        await db.insert(learningCandidates).values({
          kommoLeadId: leadId,
          userMessage: pair.user_message.trim(),
          suggestedResponse: pair.suggested_response.trim(),
          label: pair.label?.trim() || "Aprendido de chat humano",
          status: "pending",
          source: "human_chat",
          confidence: pair.confidence != null ? String(pair.confidence) : null,
          contextSnippet: pair.context_snippet?.trim() || null,
          dedupeKey: key,
        });
        created++;
      } catch {
        // dedupe_key conflict — ya existe
      }
    }

    await db
      .update(conversations)
      .set({ lastLearningExtractAt: new Date(), updatedAt: new Date() })
      .where(eq(conversations.kommoLeadId, leadId));

    logger.info({ leadId, created }, "learningExtractor: candidatos generados");
    return created;
  } catch (err) {
    logger.warn({ err, leadId }, "learningExtractor: extracción falló");
    return 0;
  }
}
