/**
 * Auditor offline de Lucy.
 * REGLA: nunca envía WhatsApp, nunca escribe en Kommo talks, nunca reescribe al cliente.
 */
import { db, conversations, messages } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
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

export { getAuditorQuotaSnapshot } from "./lucyAuditorLlm.js";

export type AuditorRunResult = {
  scanned: number;
  findings: number;
  recorded: number;
  flashCalls: number;
  quota: ReturnType<typeof getAuditorQuotaSnapshot>;
};

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
}): Promise<AuditorRunResult> {
  const limitLeads = opts?.limitLeads ?? 12;
  const useFlash = opts?.useFlash !== false;
  let flashCalls = 0;
  let findings = 0;
  let recorded = 0;

  const transcripts = await loadRecentTranscripts(limitLeads);

  for (const { leadId, turns } of transcripts) {
    const heuristic = runAuditorHeuristics(turns);
    for (const f of heuristic) {
      findings += 1;
      const ok = await recordLucyRepair({
        kommoLeadId: leadId,
        category: f.category,
        severity: f.severity,
        evidence: f.evidence,
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
          evidence: f.evidence,
          proposedRepair: f.proposedRepair,
          status: "open",
          source: "flash",
          model: getAuditorModel(),
        });
        if (ok) recorded += 1;
      }
    }
  }

  const result: AuditorRunResult = {
    scanned: transcripts.length,
    findings,
    recorded,
    flashCalls,
    quota: getAuditorQuotaSnapshot(),
  };
  logger.info(result, "lucyAuditor batch finished");
  return result;
}
