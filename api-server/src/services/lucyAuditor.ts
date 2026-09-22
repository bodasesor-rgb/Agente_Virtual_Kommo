/**
 * Auditor offline de Lucy.
 * REGLA: nunca envía WhatsApp, nunca escribe en Kommo talks, nunca reescribe al cliente.
 */
import { db, conversations, messages } from "@workspace/db";
import { and, desc, eq, gte } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  runAuditorHeuristics,
  transcriptNeedsFlash,
  type TranscriptTurn,
} from "./lucyAuditorHeuristics.js";
import {
  canSpendAuditorCall,
  getAuditorModel,
  getAuditorQuotaSnapshot,
  runAuditorLlm,
} from "./lucyAuditorLlm.js";
import { recordLucyRepair } from "./lucyRepairStore.js";
import { mexicoCityDayKey, startOfMexicoCityDay } from "./lucyAuditorTime.js";

export { getAuditorQuotaSnapshot } from "./lucyAuditorLlm.js";
export { mexicoCityDayKey, startOfMexicoCityDay } from "./lucyAuditorTime.js";

export type AuditorRunResult = {
  scanned: number;
  findings: number;
  recorded: number;
  flashCalls: number;
  skipped?: string;
  dayKey?: string;
  quota: ReturnType<typeof getAuditorQuotaSnapshot>;
};

let lastDailyRunDay: string | null = null;

export function getLastDailyAuditDay(): string | null {
  return lastDailyRunDay;
}

async function loadTodayTranscripts(limitLeads = 40): Promise<
  Array<{ leadId: string; turns: TranscriptTurn[] }>
> {
  const since = startOfMexicoCityDay();
  const convs = await db
    .select({ leadId: conversations.kommoLeadId })
    .from(conversations)
    .where(gte(conversations.updatedAt, since))
    .orderBy(desc(conversations.updatedAt))
    .limit(limitLeads);

  const out: Array<{ leadId: string; turns: TranscriptTurn[] }> = [];
  for (const c of convs) {
    const rows = await db
      .select({
        role: messages.role,
        content: messages.content,
      })
      .from(messages)
      .where(
        and(eq(messages.kommoLeadId, c.leadId), gte(messages.timestamp, since))
      )
      .orderBy(messages.timestamp)
      .limit(60);
    if (rows.length < 2) continue;
    if (!rows.some((r) => r.role === "assistant")) continue;
    out.push({
      leadId: c.leadId,
      turns: rows.map((r) => ({
        role: r.role,
        content: r.content ?? "",
      })),
    });
  }
  return out;
}

async function loadRecentTranscripts(limitLeads = 12): Promise<
  Array<{ leadId: string; turns: TranscriptTurn[] }>
> {
  const convs = await db
    .select({ leadId: conversations.kommoLeadId })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(limitLeads);

  const out: Array<{ leadId: string; turns: TranscriptTurn[] }> = [];
  for (const c of convs) {
    const rows = await db
      .select({
        role: messages.role,
        content: messages.content,
      })
      .from(messages)
      .where(eq(messages.kommoLeadId, c.leadId))
      .orderBy(messages.timestamp)
      .limit(40);
    if (rows.length < 2) continue;
    out.push({
      leadId: c.leadId,
      turns: rows.map((r) => ({
        role: r.role,
        content: r.content ?? "",
      })),
    });
  }
  return out;
}

function formatTranscript(turns: TranscriptTurn[]): string {
  return turns
    .map((t) => `${t.role === "assistant" ? "LUCY" : "CLIENTE"}: ${t.content}`)
    .join("\n")
    .slice(0, 6000);
}

export async function runLucyAuditorBatch(opts?: {
  limitLeads?: number;
  useFlash?: boolean;
  /** Solo chats con actividad hoy (Mexico City). */
  onlyToday?: boolean;
  /** Si ya corrió el daily hoy, no repetir (cron diario). */
  oncePerDay?: boolean;
}): Promise<AuditorRunResult> {
  const dayKey = mexicoCityDayKey();
  if (opts?.oncePerDay && lastDailyRunDay === dayKey) {
    return {
      scanned: 0,
      findings: 0,
      recorded: 0,
      flashCalls: 0,
      skipped: "already_ran_today",
      dayKey,
      quota: getAuditorQuotaSnapshot(),
    };
  }

  const limitLeads = opts?.limitLeads ?? (opts?.onlyToday ? 40 : 12);
  const useFlash = opts?.useFlash !== false;
  const onlyToday = opts?.onlyToday === true;
  let flashCalls = 0;
  let findings = 0;
  let recorded = 0;

  const transcripts = onlyToday
    ? await loadTodayTranscripts(limitLeads)
    : await loadRecentTranscripts(limitLeads);

  for (const { leadId, turns } of transcripts) {
    const heuristic = runAuditorHeuristics(turns);
    for (const f of heuristic) {
      findings += 1;
      const ok = await recordLucyRepair({
        kommoLeadId: leadId,
        category: f.category,
        severity: f.severity,
        evidence: `[${dayKey}] ${f.evidence}`,
        proposedRepair: f.proposedRepair,
        status: "auto_flagged",
        source: "heuristic",
      });
      if (ok) recorded += 1;
    }

    if (
      useFlash &&
      transcriptNeedsFlash(turns, heuristic.length) &&
      canSpendAuditorCall()
    ) {
      const llmFindings = await runAuditorLlm(formatTranscript(turns));
      flashCalls += 1;
      for (const f of llmFindings) {
        findings += 1;
        const ok = await recordLucyRepair({
          kommoLeadId: leadId,
          category: f.category,
          severity: f.severity,
          evidence: `[${dayKey}] ${f.evidence}`,
          proposedRepair: f.proposedRepair,
          status: "open",
          source: "flash",
          model: getAuditorModel(),
        });
        if (ok) recorded += 1;
      }
    }
  }

  if (opts?.oncePerDay) {
    lastDailyRunDay = dayKey;
  }

  const result: AuditorRunResult = {
    scanned: transcripts.length,
    findings,
    recorded,
    flashCalls,
    dayKey,
    quota: getAuditorQuotaSnapshot(),
  };
  logger.info(result, "lucyAuditor batch finished");
  return result;
}

/** Cron diario: chats del día (Mexico), una vez. */
export async function runLucyAuditorDaily(): Promise<AuditorRunResult> {
  return runLucyAuditorBatch({
    onlyToday: true,
    oncePerDay: true,
    limitLeads: 50,
    useFlash: true,
  });
}
