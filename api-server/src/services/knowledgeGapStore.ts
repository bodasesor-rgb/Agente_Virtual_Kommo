import { db, knowledgeGaps } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { ensureKnowledgeGapSchema } from "./knowledgeGapSchema.js";
import { createTrainingExample } from "./trainingStore.js";
import { logger } from "../lib/logger.js";

export type KnowledgeGapStatus = "pending" | "answered" | "dismissed";

export interface KnowledgeGapDto {
  id: string;
  kommoLeadId?: string;
  question: string;
  topic?: string;
  gapType: string;
  lucyResponse?: string;
  answer?: string;
  status: KnowledgeGapStatus;
  contextSnippet?: string;
  createdAt: string;
  answeredAt?: string;
}

function rowToDto(row: typeof knowledgeGaps.$inferSelect): KnowledgeGapDto {
  return {
    id: row.id,
    kommoLeadId: row.kommoLeadId ?? undefined,
    question: row.question,
    topic: row.topic ?? undefined,
    gapType: row.gapType,
    lucyResponse: row.lucyResponse ?? undefined,
    answer: row.answer ?? undefined,
    status: row.status as KnowledgeGapStatus,
    contextSnippet: row.contextSnippet ?? undefined,
    createdAt: row.createdAt.toISOString(),
    answeredAt: row.answeredAt?.toISOString(),
  };
}

function normalizeDedupeKey(question: string, gapType: string): string {
  const q = question.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
  return `${gapType}:${q}`;
}

export async function listKnowledgeGaps(
  status: KnowledgeGapStatus = "pending",
  limit = 50
): Promise<KnowledgeGapDto[]> {
  await ensureKnowledgeGapSchema();
  const rows = await db
    .select()
    .from(knowledgeGaps)
    .where(eq(knowledgeGaps.status, status))
    .orderBy(desc(knowledgeGaps.createdAt))
    .limit(limit);
  return rows.map(rowToDto);
}

export async function getKnowledgeGapStats(): Promise<{
  pending: number;
  answered: number;
  dismissed: number;
}> {
  await ensureKnowledgeGapSchema();
  const rows = await db.select().from(knowledgeGaps);
  return {
    pending: rows.filter((r) => r.status === "pending").length,
    answered: rows.filter((r) => r.status === "answered").length,
    dismissed: rows.filter((r) => r.status === "dismissed").length,
  };
}

export interface RecordKnowledgeGapInput {
  kommoLeadId?: string | number;
  question: string;
  topic?: string;
  gapType?: string;
  lucyResponse?: string;
  contextSnippet?: string;
}

export async function recordKnowledgeGap(input: RecordKnowledgeGapInput): Promise<boolean> {
  const question = input.question?.trim();
  if (!question || question.length < 4) return false;

  await ensureKnowledgeGapSchema();
  const gapType = input.gapType?.trim() || "unknown";
  const dedupeKey = normalizeDedupeKey(question, gapType);

  try {
    const [existing] = await db
      .select()
      .from(knowledgeGaps)
      .where(eq(knowledgeGaps.dedupeKey, dedupeKey))
      .limit(1);

    if (existing) {
      if (existing.status !== "pending") return false;
      await db
        .update(knowledgeGaps)
        .set({
          lucyResponse: input.lucyResponse?.trim() || existing.lucyResponse,
          kommoLeadId: input.kommoLeadId ? String(input.kommoLeadId) : existing.kommoLeadId,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeGaps.id, existing.id));
      return true;
    }

    await db.insert(knowledgeGaps).values({
      kommoLeadId: input.kommoLeadId ? String(input.kommoLeadId) : null,
      question,
      topic: input.topic?.trim() || null,
      gapType,
      lucyResponse: input.lucyResponse?.trim() || null,
      contextSnippet: input.contextSnippet?.trim() || null,
      dedupeKey,
    });
    logger.info({ topic: input.topic, gapType }, "Knowledge gap registrado");
    return true;
  } catch (err) {
    logger.warn({ err, dedupeKey }, "recordKnowledgeGap: falló");
    return false;
  }
}

export async function answerKnowledgeGap(
  id: string,
  answer: string,
  reviewerEmail?: string
): Promise<KnowledgeGapDto | null> {
  const text = answer.trim();
  if (!text) return null;

  await ensureKnowledgeGapSchema();
  const [row] = await db.select().from(knowledgeGaps).where(eq(knowledgeGaps.id, id)).limit(1);
  if (!row || row.status !== "pending") return null;

  const topic = row.topic ?? "Pregunta sin catálogo";

  await createTrainingExample({
    userMessage: row.question,
    lucyResponse: text,
    label: topic.startsWith("Aprendizaje") ? topic : `Aprendizaje: ${topic}`,
  });

  const [updated] = await db
    .update(knowledgeGaps)
    .set({
      answer: text,
      status: "answered",
      answeredAt: new Date(),
      answeredBy: reviewerEmail ?? null,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeGaps.id, id))
    .returning();

  return updated ? rowToDto(updated) : null;
}

export async function dismissKnowledgeGap(
  id: string,
  reviewerEmail?: string
): Promise<boolean> {
  await ensureKnowledgeGapSchema();
  const updated = await db
    .update(knowledgeGaps)
    .set({
      status: "dismissed",
      answeredBy: reviewerEmail ?? null,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeGaps.id, id))
    .returning({ id: knowledgeGaps.id });
  return updated.length > 0;
}
