/**
 * Backup JSON de lucy_repairs fuera de pgdata.
 * Hostinger rota/rompe PGlite al restart → sin esto el panel queda vacío.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { db, lucyRepairs } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getLucyRepairsJsonPath, ensureLucyDataRoot } from "../lib/lucyDataPaths.js";
import { logger } from "../lib/logger.js";

type LucyRepairStatus =
  | "open"
  | "auto_flagged"
  | "in_progress"
  | "resolved"
  | "dismissed";

type PersistedRepair = {
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
  dedupeKey?: string;
};

let restoredOnce = false;

function repairsPath(): string {
  ensureLucyDataRoot();
  return getLucyRepairsJsonPath();
}

export function readRepairsBackup(): PersistedRepair[] {
  const path = repairsPath();
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { repairs?: PersistedRepair[] } | PersistedRepair[];
    const list = Array.isArray(parsed) ? parsed : parsed.repairs ?? [];
    return list.filter((r) => r && typeof r.id === "string" && r.evidence && r.proposedRepair);
  } catch (err) {
    logger.warn({ err, path }, "lucyRepairPersist: no se pudo leer backup");
    return [];
  }
}

export async function dumpRepairsToBackup(): Promise<number> {
  try {
    const rows = await db.select().from(lucyRepairs);
    const repairs: PersistedRepair[] = rows.map((row) => ({
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
      dedupeKey: row.dedupeKey ?? undefined,
    }));
    const path = repairsPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify(
        {
          savedAt: new Date().toISOString(),
          count: repairs.length,
          repairs,
        },
        null,
        2
      ),
      "utf8"
    );
    return repairs.length;
  } catch (err) {
    logger.warn({ err }, "lucyRepairPersist: dump falló");
    return 0;
  }
}

/**
 * Si la tabla está vacía (pgdata nueva) y hay JSON, restaura.
 * Idempotente: no duplica por id / dedupe_key.
 */
export async function restoreRepairsFromBackupIfNeeded(): Promise<number> {
  if (restoredOnce) return 0;
  restoredOnce = true;
  try {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(lucyRepairs);
    const count = Number(n ?? 0);
    const backup = readRepairsBackup();
    if (backup.length === 0) return 0;

    // Si DB tiene datos pero menos que backup (rotación parcial), merge faltantes.
    let inserted = 0;
    for (const r of backup) {
      const [byId] = await db
        .select({ id: lucyRepairs.id })
        .from(lucyRepairs)
        .where(eq(lucyRepairs.id, r.id))
        .limit(1);
      if (byId) continue;

      if (r.dedupeKey) {
        const [byKey] = await db
          .select({ id: lucyRepairs.id })
          .from(lucyRepairs)
          .where(eq(lucyRepairs.dedupeKey, r.dedupeKey))
          .limit(1);
        if (byKey) continue;
      }

      try {
        await db.insert(lucyRepairs).values({
          id: r.id,
          kommoLeadId: r.kommoLeadId ?? null,
          category: (r.category || "other").slice(0, 40),
          severity: r.severity || "warn",
          evidence: r.evidence,
          proposedRepair: r.proposedRepair,
          appliedRepair: r.appliedRepair ?? null,
          status: r.status || "open",
          source: r.source || "heuristic",
          model: r.model ?? null,
          dedupeKey: r.dedupeKey ?? null,
          resolvedAt: r.resolvedAt ? new Date(r.resolvedAt) : null,
          resolvedBy: r.resolvedBy ?? null,
          createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
          updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
        });
        inserted += 1;
      } catch (err) {
        logger.warn({ err, id: r.id }, "lucyRepairPersist: skip insert");
      }
    }

    if (inserted > 0 || (count === 0 && backup.length > 0)) {
      logger.info(
        { inserted, backup: backup.length, hadDb: count },
        "lucyRepairPersist: restaurado desde JSON"
      );
    }
    return inserted;
  } catch (err) {
    logger.warn({ err }, "lucyRepairPersist: restore falló");
    return 0;
  }
}
