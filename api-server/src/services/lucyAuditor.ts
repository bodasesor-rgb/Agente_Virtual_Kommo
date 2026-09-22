/**
 * Auditor offline de Lucy.
 * REGLA: nunca envía WhatsApp, nunca escribe en Kommo talks, nunca reescribe al cliente.
 *
 * Fuente de transcripts: historial local del webhook (BD + chat-history.json).
 * Kommo no otorga «External chat history» → no se lee /talks/.../messages.
 */
import { db, messages } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getKommoAccessToken, getKommoSubdomain } from "../lib/kommoEnv.js";
import { logger } from "../lib/logger.js";
import { listHistoryKeys } from "../chat-history.js";
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
import { hydrateMessagesFromChatHistory } from "./chatIngest.js";
import { ETAPA, PIPELINE_ID } from "./embudo.js";

export { getAuditorQuotaSnapshot } from "./lucyAuditorLlm.js";
export { mexicoCityDayKey, startOfMexicoCityDay } from "./lucyAuditorTime.js";

export type AuditorRunResult = {
  scanned: number;
  findings: number;
  recorded: number;
  flashCalls: number;
  /** Leads del día listados en Kommo (solo IDs). */
  syncedFromKommo?: number;
  /** Mensajes nuevos importados desde chat-history.json. */
  hydratedFromHistory?: number;
  /** Claves en chat-history.json. */
  historyKeys?: number;
  /** Siempre true: no usamos Talks messages (scope no disponible). */
  kommoMessagesScopeDenied?: boolean;
  noReply?: number;
  skipped?: string;
  dayKey?: string;
  withLucy?: number;
  tooShort?: number;
  summary?: string;
  quota: ReturnType<typeof getAuditorQuotaSnapshot>;
};

export type AuditorProgressEvent =
  | { type: "phase"; phase: "sync" | "scan" | "done"; message: string }
  | {
      type: "sync";
      current: number;
      total: number;
      leadId?: string;
      synced: number;
    }
  | {
      type: "chat";
      current: number;
      total: number;
      leadId: string;
      findings: number;
      recorded: number;
      flashCalls: number;
      ok: boolean;
    }
  | {
      type: "finding";
      leadId: string;
      category: string;
      severity: string;
      evidence: string;
      source: string;
    }
  | { type: "result"; result: AuditorRunResult };

let lastDailyRunDay: string | null = null;

export function getLastDailyAuditDay(): string | null {
  return lastDailyRunDay;
}

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
 * Lista leads actualizados hoy en Kommo (solo IDs; no lee mensajes).
 */
async function listTodayLeadIdsFromKommo(
  limitLeads: number,
  onProgress?: (ev: AuditorProgressEvent) => void
): Promise<string[]> {
  const subdomain = getKommoSubdomain();
  const accessToken = getKommoAccessToken();
  if (!subdomain || !accessToken) {
    logger.warn("lucyAuditor: sin Kommo — no se listan leads del día");
    return [];
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

  onProgress?.({
    type: "phase",
    phase: "sync",
    message: "Listando leads del día en Kommo (sin leer mensajes)…",
  });

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        _embedded?: { leads?: Array<{ id?: number; updated_at?: number }> };
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

  const ids = [...leadIds].slice(0, limitLeads);
  logger.info({ candidates: ids.length }, "lucyAuditor: leads Kommo del día (solo IDs)");
  return ids;
}

async function loadTranscriptsForLeadIds(
  leadIds: string[],
  since: Date | null
): Promise<{
  transcripts: Array<{ leadId: string; turns: TranscriptTurn[] }>;
  emptyOrShort: number;
  noReply: number;
}> {
  const out: Array<{ leadId: string; turns: TranscriptTurn[] }> = [];
  let emptyOrShort = 0;
  let noReply = 0;
  for (const leadId of leadIds) {
    // Historial local completo: el webhook puede haber guardado con timestamps
    // de hydratación; no filtrar por "hoy" si el lead ya es candidato.
    const turns = await loadTurnsForLead(leadId, since);
    if (turns.length < 2) {
      emptyOrShort += 1;
      continue;
    }
    const hasReply = turns.some(
      (t) => t.role === "assistant" || t.role === "human"
    );
    if (!hasReply) {
      noReply += 1;
      continue;
    }
    out.push({ leadId, turns });
  }
  return { transcripts: out, emptyOrShort, noReply };
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
  onlyToday?: boolean;
  oncePerDay?: boolean;
  /** Lista IDs del día en Kommo (no lee mensajes). */
  syncFromKommo?: boolean;
  forceFlash?: boolean;
  onProgress?: (ev: AuditorProgressEvent) => void;
}): Promise<AuditorRunResult> {
  const dayKey = mexicoCityDayKey();
  const report = (ev: AuditorProgressEvent) => {
    try {
      opts?.onProgress?.(ev);
    } catch {
      /* UI no debe tumbar el batch */
    }
  };

  if (opts?.oncePerDay && lastDailyRunDay === dayKey) {
    const result: AuditorRunResult = {
      scanned: 0,
      findings: 0,
      recorded: 0,
      flashCalls: 0,
      skipped: "already_ran_today",
      dayKey,
      summary: "Ya se corrió la auditoría automática hoy.",
      quota: getAuditorQuotaSnapshot(),
    };
    report({ type: "result", result });
    return result;
  }

  const onlyToday = opts?.onlyToday === true;
  const limitLeads = opts?.limitLeads ?? (onlyToday ? 50 : 20);
  const useFlash = opts?.useFlash !== false;
  const forceFlash = opts?.forceFlash === true;
  const listKommo = opts?.syncFromKommo !== false && onlyToday;

  report({
    type: "phase",
    phase: "sync",
    message: "Cargando historial local (webhook / chat-history)…",
  });
  const hydrated = await hydrateMessagesFromChatHistory();
  const historyKeys = listHistoryKeys().length;

  let kommoLeadIds: string[] = [];
  if (listKommo) {
    kommoLeadIds = await listTodayLeadIdsFromKommo(limitLeads, report);
  }

  const since = onlyToday ? startOfMexicoCityDay() : null;
  const fromDb = onlyToday
    ? await loadLeadIdsWithMessagesSince(since!, limitLeads)
    : await loadLeadIdsRecent(limitLeads);

  // Preferir leads con transcript local; cruzar con IDs Kommo del día.
  const localSet = new Set(fromDb);
  const historySet = new Set(listHistoryKeys());
  const preferred = [
    ...fromDb,
    ...kommoLeadIds.filter((id) => localSet.has(id) || historySet.has(id)),
    ...[...historySet].filter((id) => !localSet.has(id)),
  ];
  const leadIds = [...new Set(preferred)].slice(0, limitLeads);

  let flashCalls = 0;
  let findings = 0;
  let recorded = 0;
  let withLucy = 0;
  let tooShort = 0;

  // Tras hydrate, leer historial completo de esos leads (since=null).
  const loaded = await loadTranscriptsForLeadIds(leadIds, null);
  const transcripts = loaded.transcripts;
  const noReply = loaded.noReply;
  report({
    type: "phase",
    phase: "scan",
    message: `Revisando ${transcripts.length} chat(s) locales…`,
  });

  for (let i = 0; i < transcripts.length; i++) {
    const { leadId, turns } = transcripts[i]!;
    let chatFindings = 0;

    const assistantTurns = turns.filter((t) => t.role === "assistant").length;
    const lucyLike =
      assistantTurns > 0 ||
      turns.some(
        (t) =>
          t.role !== "user" &&
          /bodasesor\.com\/catalogos|perfect[oa],?\s*ya tengo todo/i.test(t.content)
      );
    if (lucyLike) withLucy += 1;
    else if (turns.length < 4) tooShort += 1;

    const heuristic = runAuditorHeuristics(turns);
    for (const f of heuristic) {
      findings += 1;
      chatFindings += 1;
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
      report({
        type: "finding",
        leadId,
        category: f.category,
        severity: f.severity,
        evidence: f.evidence,
        source: "heuristic",
      });
    }

    const shouldFlash =
      useFlash &&
      canSpendAuditorCall() &&
      turns.length >= 3 &&
      (forceFlash
        ? lucyLike || turns.length >= 4
        : lucyLike && transcriptNeedsFlash(turns, heuristic.length));

    if (shouldFlash) {
      const llmFindings = await runAuditorLlm(formatTranscript(turns));
      flashCalls += 1;
      for (const f of llmFindings) {
        findings += 1;
        chatFindings += 1;
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
        report({
          type: "finding",
          leadId,
          category: f.category,
          severity: f.severity,
          evidence: f.evidence,
          source: "flash",
        });
      }
    }

    report({
      type: "chat",
      current: i + 1,
      total: transcripts.length,
      leadId,
      findings,
      recorded,
      flashCalls,
      ok: chatFindings === 0,
    });
  }

  if (opts?.oncePerDay) {
    lastDailyRunDay = dayKey;
  }

  const modeHint =
    " Modo local: historial del webhook/Hostinger (Kommo no permite leer Talks).";

  const summary =
    transcripts.length === 0
      ? `No encontré chats locales auditables` +
        (hydrated.keys ? ` (${hydrated.keys} en chat-history, +${hydrated.inserted} importados)` : "") +
        `.` +
        modeHint
      : findings === 0
        ? `Revisé ${transcripts.length} chat(s) locales` +
          (hydrated.inserted ? ` (+${hydrated.inserted} del historial)` : "") +
          `. Flash ${flashCalls}. Sin errores detectados` +
          (withLucy ? ` (${withLucy} con Lucy).` : ".") +
          modeHint
        : `Revisé ${transcripts.length} chat(s) locales: ${findings} hallazgo(s), ${recorded} registrado(s), Flash ${flashCalls}.` +
          modeHint;

  const result: AuditorRunResult = {
    scanned: transcripts.length,
    findings,
    recorded,
    flashCalls,
    syncedFromKommo: kommoLeadIds.length,
    hydratedFromHistory: hydrated.inserted,
    historyKeys,
    kommoMessagesScopeDenied: true,
    noReply,
    dayKey,
    withLucy,
    tooShort,
    summary,
    quota: getAuditorQuotaSnapshot(),
  };
  report({ type: "phase", phase: "done", message: summary });
  report({ type: "result", result });
  logger.info(result, "lucyAuditor batch finished");
  return result;
}

/** Cron diario / botón: chats locales del día + Flash forzado. */
export async function runLucyAuditorDaily(): Promise<AuditorRunResult> {
  return runLucyAuditorBatch({
    onlyToday: true,
    oncePerDay: true,
    syncFromKommo: true,
    forceFlash: true,
    limitLeads: 50,
    useFlash: true,
  });
}
