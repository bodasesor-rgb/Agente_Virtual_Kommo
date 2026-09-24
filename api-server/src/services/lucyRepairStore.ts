import { db, lucyRepairs } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { ensureLucyRepairSchema } from "./lucyRepairSchema.js";
import { dumpRepairsToBackup } from "./lucyRepairPersist.js";
import { logger } from "../lib/logger.js";

export type LucyRepairStatus =
  | "open"
  | "auto_flagged"
  | "in_progress"
  | "resolved"
  | "dismissed";
export type LucyRepairCategory =
  | "loop_links"
  | "repeat_reply"
  | "premature_close"
  | "bad_field"
  | "stuck_funnel"
  | "other";
export type LucyRepairSource = "heuristic" | "flash";

export interface LucyRepairDto {
  id: string;
  kommoLeadId?: string;
  category: string;
  severity: string;
  evidence: string;
  proposedRepair: string;
  appliedRepair?: string;
  status: LucyRepairStatus;
  source: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

function rowToDto(row: typeof lucyRepairs.$inferSelect): LucyRepairDto {
  return {
    id: row.id,
    kommoLeadId: row.kommoLeadId ?? undefined,
    category: row.category,
    severity: row.severity,
    evidence: row.evidence,
    proposedRepair: row.proposedRepair,
    appliedRepair: row.appliedRepair ?? undefined,
    status: row.status as LucyRepairStatus,
    source: row.source,
    model: row.model ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString(),
    resolvedBy: row.resolvedBy ?? undefined,
  };
}

function normalizeDedupeKey(
  category: string,
  leadId: string | undefined,
  evidence: string
): string {
  const e = evidence.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
  return `${category}:${leadId ?? "none"}:${e}`;
}

async function persistBackupSafe(): Promise<void> {
  try {
    await dumpRepairsToBackup();
  } catch (err) {
    logger.warn({ err }, "lucyRepairStore: backup JSON falló");
  }
}

export async function listLucyRepairs(
  status: LucyRepairStatus | "all" = "open",
  limit = 50
): Promise<LucyRepairDto[]> {
  await ensureLucyRepairSchema();
  // Resueltas: historial largo (no se borran al auditar).
  const capped =
    status === "resolved" || status === "all"
      ? Math.min(Math.max(limit, 50), 300)
      : Math.min(limit, 100);
  const q = db.select().from(lucyRepairs).orderBy(desc(lucyRepairs.createdAt)).limit(capped);
  if (status === "all") {
    const rows = await q;
    return rows.map(rowToDto);
  }
  const rows = await db
    .select()
    .from(lucyRepairs)
    .where(eq(lucyRepairs.status, status))
    .orderBy(desc(status === "resolved" ? lucyRepairs.resolvedAt : lucyRepairs.createdAt))
    .limit(capped);
  return rows.map(rowToDto);
}

export async function getLucyRepairStats(): Promise<{
  open: number;
  auto_flagged: number;
  in_progress: number;
  resolved: number;
  dismissed: number;
  auditor_calls_today: number;
  auditor_max_per_day: number;
  auditor_model: string;
  auditor_usd_today: number;
  auditor_tokens_today: number;
  spend_day_key: string;
}> {
  await ensureLucyRepairSchema();
  const rows = await db.select().from(lucyRepairs);
  const { getAuditorQuotaSnapshot } = await import("./lucyAuditorLlm.js");
  const { getGeminiSpendSnapshot } = await import("../lib/lucyGeminiSpend.js");
  const quota = getAuditorQuotaSnapshot();
  const spend = getGeminiSpendSnapshot();
  return {
    open: rows.filter((r) => r.status === "open").length,
    auto_flagged: rows.filter((r) => r.status === "auto_flagged").length,
    in_progress: rows.filter((r) => r.status === "in_progress").length,
    resolved: rows.filter((r) => r.status === "resolved").length,
    dismissed: rows.filter((r) => r.status === "dismissed").length,
    auditor_calls_today: quota.callsToday,
    auditor_max_per_day: quota.maxPerDay,
    auditor_model: quota.model,
    auditor_usd_today: spend.auditor.usdEstimate,
    auditor_tokens_today:
      spend.auditor.inputTokens + spend.auditor.outputTokens,
    spend_day_key: spend.dayKey,
  };
}

export interface RecordLucyRepairInput {
  kommoLeadId?: string | number;
  category: LucyRepairCategory | string;
  severity?: "info" | "warn" | "error";
  evidence: string;
  proposedRepair: string;
  status?: LucyRepairStatus;
  source?: LucyRepairSource;
  model?: string;
}

export async function recordLucyRepair(input: RecordLucyRepairInput): Promise<boolean> {
  const evidence = input.evidence?.trim();
  const proposed = input.proposedRepair?.trim();
  if (!evidence || !proposed) return false;

  await ensureLucyRepairSchema();
  const category = (input.category || "other").trim().slice(0, 40);
  const leadId = input.kommoLeadId ? String(input.kommoLeadId) : undefined;
  const dedupeKey = normalizeDedupeKey(category, leadId, evidence);

  try {
    const [existing] = await db
      .select()
      .from(lucyRepairs)
      .where(eq(lucyRepairs.dedupeKey, dedupeKey))
      .limit(1);

    if (existing) {
      if (existing.status === "dismissed" || existing.status === "resolved") return false;
      // No pisar un arreglo que Cursor ya está trabajando.
      if (existing.status === "in_progress") return false;
      await db
        .update(lucyRepairs)
        .set({
          evidence,
          proposedRepair: proposed,
          updatedAt: new Date(),
        })
        .where(eq(lucyRepairs.id, existing.id));
      await persistBackupSafe();
      return true;
    }

    await db.insert(lucyRepairs).values({
      kommoLeadId: leadId ?? null,
      category,
      severity: input.severity ?? "warn",
      evidence,
      proposedRepair: proposed,
      status: input.status ?? "auto_flagged",
      source: input.source ?? "heuristic",
      model: input.model ?? null,
      dedupeKey,
    });
    logger.info({ category, leadId, source: input.source }, "lucy_repair registrado");
    await persistBackupSafe();
    return true;
  } catch (err) {
    logger.warn({ err, dedupeKey }, "recordLucyRepair: falló");
    return false;
  }
}

export async function markLucyRepairsInProgress(
  ids: string[],
  startedBy = "cursor"
): Promise<number> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return 0;
  await ensureLucyRepairSchema();
  let marked = 0;
  const now = new Date();
  for (const id of unique) {
    const [row] = await db
      .select()
      .from(lucyRepairs)
      .where(eq(lucyRepairs.id, id))
      .limit(1);
    if (!row) continue;
    if (row.status !== "open" && row.status !== "auto_flagged" && row.status !== "in_progress") {
      continue;
    }
    await db
      .update(lucyRepairs)
      .set({
        status: "in_progress",
        resolvedBy: startedBy,
        updatedAt: now,
      })
      .where(eq(lucyRepairs.id, id));
    marked += 1;
  }
  if (marked > 0) await persistBackupSafe();
  return marked;
}

export async function resolveLucyRepair(
  id: string,
  appliedRepair?: string,
  reviewer?: string
): Promise<LucyRepairDto | null> {
  await ensureLucyRepairSchema();
  const note = appliedRepair?.trim();
  if (!note) return null;
  const [updated] = await db
    .update(lucyRepairs)
    .set({
      status: "resolved",
      appliedRepair: note,
      resolvedAt: new Date(),
      resolvedBy: reviewer ?? null,
      updatedAt: new Date(),
    })
    .where(eq(lucyRepairs.id, id))
    .returning();
  if (updated) await persistBackupSafe();
  return updated ? rowToDto(updated) : null;
}

export async function dismissLucyRepair(id: string, reviewer?: string): Promise<boolean> {
  await ensureLucyRepairSchema();
  const updated = await db
    .update(lucyRepairs)
    .set({
      status: "dismissed",
      resolvedBy: reviewer ?? null,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(lucyRepairs.id, id))
    .returning({ id: lucyRepairs.id });
  if (updated.length > 0) await persistBackupSafe();
  return updated.length > 0;
}

export async function getLucyRepair(id: string): Promise<LucyRepairDto | null> {
  await ensureLucyRepairSchema();
  const [row] = await db.select().from(lucyRepairs).where(eq(lucyRepairs.id, id)).limit(1);
  return row ? rowToDto(row) : null;
}

export async function countOpenRepairs(): Promise<number> {
  await ensureLucyRepairSchema();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lucyRepairs)
    .where(eq(lucyRepairs.status, "open"));
  return Number(rows[0]?.n ?? 0);
}
