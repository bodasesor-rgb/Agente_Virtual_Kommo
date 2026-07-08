import { db, learningCandidates } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { ensureLearningSchema } from "./learningSchema.js";
import { createTrainingExample } from "./trainingStore.js";

export type LearningCandidateStatus = "pending" | "approved" | "rejected";

export interface LearningCandidateDto {
  id: string;
  kommoLeadId: string;
  userMessage: string;
  suggestedResponse: string;
  label?: string;
  status: LearningCandidateStatus;
  source: string;
  confidence?: string;
  contextSnippet?: string;
  createdAt: string;
}

function rowToDto(row: typeof learningCandidates.$inferSelect): LearningCandidateDto {
  return {
    id: row.id,
    kommoLeadId: row.kommoLeadId,
    userMessage: row.userMessage,
    suggestedResponse: row.suggestedResponse,
    label: row.label ?? undefined,
    status: row.status as LearningCandidateStatus,
    source: row.source,
    confidence: row.confidence ?? undefined,
    contextSnippet: row.contextSnippet ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listLearningCandidates(
  status: LearningCandidateStatus = "pending",
  limit = 50
): Promise<LearningCandidateDto[]> {
  await ensureLearningSchema();
  const rows = await db
    .select()
    .from(learningCandidates)
    .where(eq(learningCandidates.status, status))
    .orderBy(desc(learningCandidates.createdAt))
    .limit(limit);
  return rows.map(rowToDto);
}

export async function getLearningStats(): Promise<{
  pending: number;
  approved: number;
  rejected: number;
}> {
  await ensureLearningSchema();
  const rows = await db.select().from(learningCandidates);
  return {
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };
}

export async function approveLearningCandidate(
  id: string,
  reviewerEmail?: string,
  patch?: { userMessage?: string; suggestedResponse?: string; label?: string }
): Promise<LearningCandidateDto | null> {
  await ensureLearningSchema();
  const [row] = await db
    .select()
    .from(learningCandidates)
    .where(eq(learningCandidates.id, id))
    .limit(1);
  if (!row || row.status !== "pending") return null;

  const userMessage = patch?.userMessage?.trim() ?? row.userMessage;
  const suggestedResponse = patch?.suggestedResponse?.trim() ?? row.suggestedResponse;
  const label = patch?.label?.trim() ?? row.label ?? "Aprendido de chat humano";

  await createTrainingExample({
    userMessage,
    lucyResponse: suggestedResponse,
    label: label.startsWith("Aprendido") ? label : `Aprendido: ${label}`,
  });

  const [updated] = await db
    .update(learningCandidates)
    .set({
      status: "approved",
      userMessage,
      suggestedResponse,
      label,
      reviewedAt: new Date(),
      reviewedBy: reviewerEmail ?? null,
      updatedAt: new Date(),
    })
    .where(eq(learningCandidates.id, id))
    .returning();

  return updated ? rowToDto(updated) : null;
}

export async function rejectLearningCandidate(
  id: string,
  reviewerEmail?: string
): Promise<boolean> {
  await ensureLearningSchema();
  const updated = await db
    .update(learningCandidates)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: reviewerEmail ?? null,
      updatedAt: new Date(),
    })
    .where(eq(learningCandidates.id, id))
    .returning({ id: learningCandidates.id });
  return updated.length > 0;
}
