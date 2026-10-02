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

/** Quita el prefijo de día «[2026-10-01] » que pone el auditor en cada hallazgo. */
export function stripRepairDayPrefix(evidence: string): string {
  return evidence.replace(/^\s*\[\d{4}-\d{2}-\d{2}\]\s*/, "");
}

/** Mismo problema en el mismo lead = misma fila, aunque cambie el día o un conteo. */
export function normalizeDedupeKey(
  category: string,
  leadId: string | undefined,
  evidence: string
): string {
  const e = stripRepairDayPrefix(evidence)
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${category}:${leadId ?? "none"}:${e}`;
}

/** Firma del problema sin lead ni citas: agrupa el mismo bug visto en varios leads. */
export function repairSignature(category: string, evidence: string): string {
  const e = stripRepairDayPrefix(evidence)
    .toLowerCase()
    .replace(/«[^»]*»?/g, "«…»")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
  return `${category}:${e}`;
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
      : Math.min(limit, 300);
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

export async function dismissLucyRepair(
  id: string,
  reviewer?: string,
  reason?: string
): Promise<boolean> {
  await ensureLucyRepairSchema();
  const updated = await db
    .update(lucyRepairs)
    .set({
      status: "dismissed",
      resolvedBy: reviewer ?? null,
      resolvedAt: new Date(),
      updatedAt: new Date(),
      ...(reason?.trim() ? { appliedRepair: reason.trim().slice(0, 2000) } : {}),
    })
    .where(eq(lucyRepairs.id, id))
    .returning({ id: lucyRepairs.id });
  if (updated.length > 0) await persistBackupSafe();
  return updated.length > 0;
}

/** Devuelve a pendientes (auto_flagged) reparaciones que estaban «En Cursor». */
export async function releaseLucyRepairs(ids: string[]): Promise<number> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return 0;
  await ensureLucyRepairSchema();
  let released = 0;
  for (const id of unique) {
    const updated = await db
      .update(lucyRepairs)
      .set({ status: "auto_flagged", resolvedBy: null, updatedAt: new Date() })
      .where(sql`${lucyRepairs.id} = ${id} AND ${lucyRepairs.status} = 'in_progress'`)
      .returning({ id: lucyRepairs.id });
    released += updated.length;
  }
  if (released > 0) await persistBackupSafe();
  return released;
}

const ACTIVE_STATUSES = new Set(["open", "auto_flagged", "in_progress"]);

/** Hallazgos de reglas viejas del supervisor que ya no aplican (se descartan, no se borran). */
const RETIRED_RULES: Array<{ category: string; re: RegExp; reason: string }> = [
  {
    category: "bad_field",
    re: /^CRM Resumen IA parece truncado/i,
    reason:
      "Descartado por limpieza: Resumen IA es un campo largo; la regla vieja lo marcaba solo por pasar de 250 letras.",
  },
  {
    category: "stuck_funnel",
    re: /^Pregunta de embudo «[^»]+» repetida \d+ veces/i,
    reason:
      "Descartado por limpieza: la regla vieja marcaba 3 preguntas iguales aunque el cliente no hubiera contestado; ahora solo se marca si el cliente ya dio el dato o tras 4+ intentos.",
  },
];

export interface RepairCleanupResult {
  retired: number;
  duplicates: number;
  released: number;
  rekeyed: number;
}

/**
 * Limpia la cola: descarta hallazgos de reglas retiradas y duplicados (mismo problema
 * en el mismo lead, distinto día), y devuelve a pendientes lo que quedó «En Cursor»
 * sin un trabajo vivo. Nunca borra filas.
 */
export async function cleanupLucyRepairBacklog(opts: {
  trackedRepairIds: Set<string>;
  staleInProgressMs?: number;
  now?: Date;
}): Promise<RepairCleanupResult> {
  await ensureLucyRepairSchema();
  const now = opts.now ?? new Date();
  const staleMs = opts.staleInProgressMs ?? 6 * 60 * 60 * 1000;
  const rows = await db.select().from(lucyRepairs);
  const result: RepairCleanupResult = { retired: 0, duplicates: 0, released: 0, rekeyed: 0 };

  const dismiss = async (id: string, by: string, reason: string) => {
    await db
      .update(lucyRepairs)
      .set({ status: "dismissed", resolvedBy: by, resolvedAt: now, updatedAt: now, appliedRepair: reason })
      .where(eq(lucyRepairs.id, id));
  };

  const active: typeof rows = [];
  for (const row of rows) {
    if (!ACTIVE_STATUSES.has(row.status)) continue;
    const evidence = stripRepairDayPrefix(row.evidence);
    const retired = RETIRED_RULES.find((r) => r.category === row.category && r.re.test(evidence));
    if (retired && !opts.trackedRepairIds.has(row.id)) {
      await dismiss(row.id, "limpieza-supervisor", retired.reason);
      result.retired += 1;
      continue;
    }
    active.push(row);
  }

  const groups = new Map<string, typeof rows>();
  for (const row of active) {
    const key = normalizeDedupeKey(row.category, row.kommoLeadId ?? undefined, row.evidence);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const [key, list] of groups) {
    list.sort((a, b) => {
      const ta = opts.trackedRepairIds.has(a.id) ? 1 : 0;
      const tb = opts.trackedRepairIds.has(b.id) ? 1 : 0;
      if (ta !== tb) return tb - ta;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const [keep, ...dupes] = list;
    for (const d of dupes) {
      if (opts.trackedRepairIds.has(d.id)) continue;
      await dismiss(d.id, "limpieza-duplicado", `Descartado por limpieza: duplicado de ${keep!.id}.`);
      result.duplicates += 1;
    }
    if (keep && keep.dedupeKey !== key) {
      try {
        await db.update(lucyRepairs).set({ dedupeKey: key }).where(eq(lucyRepairs.id, keep.id));
        result.rekeyed += 1;
      } catch {
        /* otra fila (resuelta/descartada) ya tiene esa llave */
      }
    }
    if (
      keep &&
      keep.status === "in_progress" &&
      !opts.trackedRepairIds.has(keep.id) &&
      Math.abs(now.getTime() - keep.updatedAt.getTime()) > staleMs
    ) {
      await db
        .update(lucyRepairs)
        .set({ status: "auto_flagged", resolvedBy: null, updatedAt: now })
        .where(eq(lucyRepairs.id, keep.id));
      result.released += 1;
    }
  }

  if (result.retired || result.duplicates || result.released || result.rekeyed) {
    await persistBackupSafe();
    logger.info(result, "lucyRepairStore: limpieza de cola");
  }
  return result;
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
