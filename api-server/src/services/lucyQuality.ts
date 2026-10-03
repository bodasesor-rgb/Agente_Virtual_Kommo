/**
 * Reporte de calidad del supervisor (panel Reparaciones):
 * qué reglas dan falsas alarmas, cuántos chats se revisan, cómo le va a Cursor y qué aprendió.
 */
import { db, lucyRepairs } from "@workspace/db";
import { ensureLucyRepairSchema } from "./lucyRepairSchema.js";
import { listAuditorRuns, type AuditorRunRecord } from "./lucyAuditorLog.js";
import { listRepairJobs, type RepairJob } from "./cursorRepairAgent.js";
import { mexicoCityDayKey } from "./lucyAuditorTime.js";

const DAY = 24 * 3600_000;

export interface QualityRuleRow {
  source: string;
  category: string;
  total: number;
  pending: number;
  fixed: number;
  falseAlarm: number;
  /** Falsas alarmas / (arregladas + falsas alarmas); null si aún no hay decididas. */
  falseAlarmRate: number | null;
  noisy: boolean;
}

type RepairRowLite = {
  source: string;
  category: string;
  status: string;
  appliedRepair: string | null;
  createdAt: Date;
};

export function summarizeRules(rows: RepairRowLite[]): QualityRuleRow[] {
  const by = new Map<string, QualityRuleRow>();
  for (const r of rows) {
    const key = `${r.source}|${r.category}`;
    const row =
      by.get(key) ??
      ({ source: r.source, category: r.category, total: 0, pending: 0, fixed: 0, falseAlarm: 0 } as QualityRuleRow);
    row.total += 1;
    if (r.status === "resolved") row.fixed += 1;
    else if (r.status === "dismissed") {
      if (/falso positivo/i.test(r.appliedRepair ?? "")) row.falseAlarm += 1;
    } else row.pending += 1;
    by.set(key, row);
  }
  return [...by.values()]
    .map((row) => {
      const decided = row.fixed + row.falseAlarm;
      const rate = decided ? row.falseAlarm / decided : null;
      return { ...row, falseAlarmRate: rate, noisy: rate != null && decided >= 3 && rate >= 0.4 };
    })
    .sort((a, b) => b.total - a.total);
}

export function summarizeCoverage(runs: AuditorRunRecord[], now: Date) {
  const recent = runs.filter((r) => now.getTime() - new Date(r.at).getTime() <= 14 * DAY);
  const nightDays = new Set(
    recent
      .filter((r) => r.kind === "daily" && now.getTime() - new Date(r.at).getTime() <= 7 * DAY)
      .map((r) => mexicoCityDayKey(new Date(r.at)))
  );
  return {
    nightsLast7: nightDays.size,
    runs: recent.slice(-14).reverse(),
  };
}

export function summarizeCursor(jobs: RepairJob[], now: Date) {
  const recent = jobs.filter((j) => now.getTime() - new Date(j.createdAt).getTime() <= 30 * DAY);
  const count = (s: RepairJob["status"][]) => recent.filter((j) => s.includes(j.status)).length;
  const ids = (k: "fixed" | "falsePositive" | "notFixed") =>
    recent.reduce((n, j) => n + (j.outcome?.[k] ?? []).reduce((m, x) => m + x.ids.length, 0), 0);
  const retries = recent.filter((j) => j.escalatedFrom);
  return {
    jobs: recent.length,
    published: count(["published"]),
    failed: count(["no_changes", "error", "discarded"]),
    active: count(["creating", "running", "publishing", "fix_ready"]),
    problemsFixed: ids("fixed"),
    problemsFalsePositive: ids("falsePositive"),
    problemsNotFixed: ids("notFixed"),
    retries: retries.length,
    retriesPublished: retries.filter((j) => j.status === "published").length,
    learned: recent
      .flatMap((j) => (j.outcome?.newRules ?? []).map((text) => ({ at: j.finishedAt ?? j.updatedAt, text })))
      .slice(0, 30),
  };
}

export async function buildQualityReport(now = new Date()) {
  await ensureLucyRepairSchema();
  const rows = (await db.select().from(lucyRepairs)).filter(
    (r) => now.getTime() - r.createdAt.getTime() <= 30 * DAY
  );
  return {
    windowDays: 30,
    rules: summarizeRules(rows),
    coverage: summarizeCoverage(listAuditorRuns(), now),
    cursor: summarizeCursor(listRepairJobs(60), now),
  };
}
