/**
 * Auditor offline de Lucy.
 * REGLA: nunca envía WhatsApp, nunca escribe en Kommo talks, nunca reescribe al cliente.
 */
import { db, conversations, messages } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getKommoAccessToken, getKommoSubdomain } from "../lib/kommoEnv.js";
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
import { syncLeadTranscript } from "./chatIngest.js";
import { resolveKommoTalkId } from "./kommoTalks.js";
import { ETAPA, PIPELINE_ID } from "./embudo.js";

export { getAuditorQuotaSnapshot } from "./lucyAuditorLlm.js";
export { mexicoCityDayKey, startOfMexicoCityDay } from "./lucyAuditorTime.js";

export type AuditorRunResult = {
  scanned: number;
  findings: number;
  recorded: number;
  flashCalls: number;
  syncedFromKommo?: number;
  skipped?: string;
  dayKey?: string;
  quota: ReturnType<typeof getAuditorQuotaSnapshot>;
};

let lastDailyRunDay: string | null = null;

export function getLastDailyAuditDay(): string | null {
  return lastDailyRunDay;
}

/** Leads con mensajes reales desde `since` (BD), no por conversations.updatedAt. */
async function loadLeadIdsWithMessagesSince(
  since: Date,
  limitLeads: number
): Promise<string[]> {
  const rows = await db
    .select({
      leadId: messages.kommoLeadId,
      lastAt: sql<string>`max(${messages.timestamp})`.as("last_at"),
    })
    .from(messages)
    .where(gte(messages.timestamp, since))
    .groupBy(messages.kommoLeadId)
    .orderBy(desc(sql`max(${messages.timestamp})`))
    .limit(limitLeads);
  return rows.map((r) => String(r.leadId)).filter(Boolean);
}

async function loadLeadIdsRecent(limitLeads: number): Promise<string[]> {
  const rows = await db
    .select({
      leadId: messages.kommoLeadId,
      lastAt: sql<string>`max(${messages.timestamp})`.as("last_at"),
    })
    .from(messages)
    .groupBy(messages.kommoLeadId)
    .orderBy(desc(sql`max(${messages.timestamp})`))
    .limit(limitLeads);
  return rows.map((r) => String(r.leadId)).filter(Boolean);
}

async function loadTurnsForLead(
  leadId: string,
  since: Date | null,
  limit = 60
): Promise<TranscriptTurn[]> {
  const rows = await db
    .select({
      role: messages.role,
      content: messages.content,
    })
    .from(messages)
    .where(
      since
        ? and(eq(messages.kommoLeadId, leadId), gte(messages.timestamp, since))
        : eq(messages.kommoLeadId, leadId)
    )
    .orderBy(messages.timestamp)
    .limit(limit);
  return rows.map((r) => ({
    role: r.role,
    content: r.content ?? "",
  }));
}

/**
 * Trae de Kommo los leads tocados hoy y sincroniza transcripts a BD.
 * Así el auditor ve los chats del día aunque el webhook no haya persistido todos.
 */
async function syncTodayLeadsFromKommo(limitLeads: number): Promise<number> {
  const subdomain = getKommoSubdomain();
  const accessToken = getKommoAccessToken();
  if (!subdomain || !accessToken) {
    logger.warn("lucyAuditor: sin Kommo — no se puede sync del día");
    return 0;
  }

  const sinceSec = Math.floor(startOfMexicoCityDay().getTime() / 1000);
  const leadIds = new Set<string>();

  const urls = [
    `https://${subdomain}.kommo.com/api/v4/leads` +
      `?filter[pipeline_id]=${PIPELINE_ID}&limit=${Math.min(limitLeads, 100)}&order[updated_at]=desc`,
    ...[ETAPA.DATOS_E_INTERESES, ETAPA.LEADS_ENTRANTES, ETAPA.NO_CONTESTA, ETAPA.HUMANO_TRABAJA].map(
      (statusId) =>
        `https://${subdomain}.kommo.com/api/v4/leads` +
        `?filter[statuses][0][pipeline_id]=${PIPELINE_ID}` +
        `&filter[statuses][0][status_id]=${statusId}` +
        `&limit=50&order[updated_at]=desc`
    ),
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        _embedded?: {
          leads?: Array<{ id?: number; updated_at?: number }>;
        };
      };
      for (const lead of data._embedded?.leads ?? []) {
        if (lead.id == null) continue;
        if (lead.updated_at != null && lead.updated_at < sinceSec) continue;
        leadIds.add(String(lead.id));
        if (leadIds.size >= limitLeads) break;
      }
      if (leadIds.size >= Math.min(20, limitLeads)) break;
    } catch (err) {
      logger.warn({ err }, "lucyAuditor: list leads Kommo falló");
    }
  }

  let synced = 0;
  const ids = [...leadIds].slice(0, limitLeads);
  // Secuencial con tope: evita saturar Kommo / Hostinger timeout.
  for (const leadId of ids) {
    try {
      const conv = await db.query.conversations.findFirst({
        where: eq(conversations.kommoLeadId, leadId),
      });
      const talkId = await resolveKommoTalkId({
        subdomain,
        accessToken,
        leadId,
        knownTalkId: conv?.kommoTalkId ?? null,
        knownChatId: conv?.kommoChatId ?? null,
      });
      if (!talkId) continue;
      if (!conv) {
        await db.insert(conversations).values({
          kommoLeadId: leadId,
          kommoChatId: leadId,
          kommoTalkId: String(talkId),
          status: "active",
          stage: "discovery",
        });
      } else {
        await db
          .update(conversations)
          .set({ kommoTalkId: String(talkId), updatedAt: new Date() })
          .where(eq(conversations.kommoLeadId, leadId));
      }
      await syncLeadTranscript({
        kommoLeadId: leadId,
        talkId: String(talkId),
        subdomain,
        accessToken,
      });
      synced += 1;
    } catch (err) {
      logger.warn({ err, leadId }, "lucyAuditor: sync lead falló");
    }
  }

  logger.info({ synced, candidates: ids.length }, "lucyAuditor: sync Kommo del día");
  return synced;
}

async function loadTranscriptsForLeadIds(
  leadIds: string[],
  since: Date | null
): Promise<Array<{ leadId: string; turns: TranscriptTurn[] }>> {
  const out: Array<{ leadId: string; turns: TranscriptTurn[] }> = [];
  for (const leadId of leadIds) {
    const turns = await loadTurnsForLead(leadId, since);
    if (turns.length < 2) continue;
    // Lucy o agente: hace falta al menos una respuesta no-cliente.
    const hasReply = turns.some(
      (t) => t.role === "assistant" || t.role === "human"
    );
    if (!hasReply) continue;
    // Para auditar calidad de Lucy preferimos chats con assistant; si no, igual
    // contamos si hay humano (Alejandro) para no perder el lead del día.
    out.push({ leadId, turns });
  }
  return out;
}

function formatTranscript(turns: TranscriptTurn[]): string {
  return turns
    .map((t) => {
      const who =
        t.role === "assistant"
          ? "LUCY"
          : t.role === "human"
            ? "HUMANO"
            : "CLIENTE";
      return `${who}: ${t.content}`;
    })
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
  /** Antes de escanear, sincroniza leads del día desde Kommo → BD. */
  syncFromKommo?: boolean;
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

  const onlyToday = opts?.onlyToday === true;
  const limitLeads = opts?.limitLeads ?? (onlyToday ? 50 : 20);
  const useFlash = opts?.useFlash !== false;
  const syncFromKommo = opts?.syncFromKommo !== false && onlyToday;

  let syncedFromKommo = 0;
  if (syncFromKommo) {
    syncedFromKommo = await syncTodayLeadsFromKommo(limitLeads);
  }

  const since = onlyToday ? startOfMexicoCityDay() : null;
  const leadIds = onlyToday
    ? await loadLeadIdsWithMessagesSince(since!, limitLeads)
    : await loadLeadIdsRecent(limitLeads);

  let flashCalls = 0;
  let findings = 0;
  let recorded = 0;

  const transcripts = await loadTranscriptsForLeadIds(leadIds, since);

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

    const hasLucy = turns.some((t) => t.role === "assistant");
    if (
      useFlash &&
      hasLucy &&
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
    syncedFromKommo,
    dayKey,
    quota: getAuditorQuotaSnapshot(),
  };
  logger.info(result, "lucyAuditor batch finished");
  return result;
}

/** Cron diario / botón: chats del día (Mexico), sync Kommo, una vez en cron. */
export async function runLucyAuditorDaily(): Promise<AuditorRunResult> {
  return runLucyAuditorBatch({
    onlyToday: true,
    oncePerDay: true,
    syncFromKommo: true,
    limitLeads: 50,
    useFlash: true,
  });
}
