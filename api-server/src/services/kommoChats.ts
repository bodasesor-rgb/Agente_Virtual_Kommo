import { db, messages, trainingExamples, learningCandidates } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import type { ParAprendizaje } from "./filtroCalidad.js";

function isHuman(m: { authorType?: string | null; role: string }): boolean {
  return m.authorType === "human_agent" || m.role === "human";
}

function isClient(m: { authorType?: string | null; role: string }): boolean {
  return m.authorType === "client" || m.role === "user";
}

function isLucy(m: { authorType?: string | null; role: string }): boolean {
  return m.authorType === "lucy" || m.role === "assistant";
}

/** Construye pares cliente→humano desde el transcript persistido en `messages`. */
export function buildPairsFromTranscript(
  rows: Array<{ authorType?: string | null; role: string; content: string }>,
  kommoLeadId?: string
): ParAprendizaje[] {
  const pairs: ParAprendizaje[] = [];

  for (let i = 0; i < rows.length; i++) {
    const msg = rows[i]!;
    if (!isClient(msg)) continue;

    const pregunta = msg.content.trim();
    if (!pregunta) continue;

    for (let j = i + 1; j < rows.length; j++) {
      const reply = rows[j]!;
      if (isLucy(reply)) continue;
      if (isHuman(reply)) {
        const contexto = rows
          .slice(Math.max(0, i - 3), i)
          .map((m) => {
            const who = isHuman(m) ? "HUMANO" : isLucy(m) ? "LUCY" : "CLIENTE";
            return `${who}: ${m.content}`;
          })
          .join("\n");
        pairs.push({
          preguntaCliente: pregunta,
          respuestaHumano: reply.content.trim(),
          contextoPrevio: contexto || null,
          source: "human_chat",
          kommoLeadId,
        });
        break;
      }
      if (isClient(reply)) break;
    }
  }

  return pairs;
}

/** Extrae pares de todos los leads con mensajes humanos en BD. */
export async function extraerParesDesdeMensajes(): Promise<ParAprendizaje[]> {
  const rows = await db.select().from(messages).orderBy(asc(messages.kommoLeadId), asc(messages.timestamp));

  const byLead = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byLead.get(row.kommoLeadId) ?? [];
    list.push(row);
    byLead.set(row.kommoLeadId, list);
  }

  const all: ParAprendizaje[] = [];
  for (const [leadId, leadRows] of byLead) {
    const humanCount = leadRows.filter(isHuman).length;
    if (humanCount === 0) continue;
    all.push(...buildPairsFromTranscript(leadRows, leadId));
  }
  return all;
}

/** Pares desde ejemplos few-shot (training_examples) — enseñanzas manuales y semilla. */
export async function extraerParesDesdeTraining(): Promise<ParAprendizaje[]> {
  const rows = await db.select().from(trainingExamples);
  return rows.map((row) => ({
    preguntaCliente: row.userMessage,
    respuestaHumano: row.lucyResponse,
    contextoPrevio: row.label ? `Etiqueta: ${row.label}` : null,
    source: row.label?.match(/^Aprendizaje:|^Aprendido:/i) ? "manual_teach" : "training_seed",
  }));
}

/** Pares aprobados en lucy-admin (candidatos de chat humano). */
export async function extraerParesDesdeCandidatos(): Promise<ParAprendizaje[]> {
  const rows = await db
    .select()
    .from(learningCandidates)
    .where(eq(learningCandidates.status, "approved"));
  return rows.map((row) => ({
    preguntaCliente: row.userMessage,
    respuestaHumano: row.suggestedResponse,
    contextoPrevio: row.contextSnippet,
    source: "candidate_approved",
    kommoLeadId: row.kommoLeadId,
  }));
}

/** Une todas las fuentes de aprendizaje disponibles. */
export async function recolectarParesAprendizaje(): Promise<ParAprendizaje[]> {
  const [fromMsgs, fromTraining, fromCandidates] = await Promise.all([
    extraerParesDesdeMensajes().catch(() => [] as ParAprendizaje[]),
    extraerParesDesdeTraining().catch(() => [] as ParAprendizaje[]),
    extraerParesDesdeCandidatos().catch(() => [] as ParAprendizaje[]),
  ]);
  return [...fromMsgs, ...fromTraining, ...fromCandidates];
}
