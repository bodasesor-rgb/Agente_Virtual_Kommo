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
  runCrmFieldHeuristics,
  transcriptNeedsFlash,
  type CrmFieldSnapshot,
  type TranscriptTurn,
} from "./lucyAuditorHeuristics.js";
import {
  AUDITOR_NEW_MARKER,
  canSpendAuditorCall,
  getAuditorModel,
  getAuditorQuotaSnapshot,
  runAuditorLlm,
  takeAuditorLlmStats,
  type AuditorLlmStats,
} from "./lucyAuditorLlm.js";
import {
  getFlashSeen,
  getLastDailyAuditAt,
  markFlashSeen,
  recordAuditorRun,
  type AuditorRunKind,
} from "./lucyAuditorLog.js";
import { recordLucyRepair } from "./lucyRepairStore.js";
import { buildSupervisorLessonsBlock } from "./lucySupervisorLessons.js";
import { mexicoCityDayKey, startOfMexicoCityDay } from "./lucyAuditorTime.js";
import { hydrateMessagesFromChatHistory } from "./chatIngest.js";
import { ETAPA, PIPELINE_ID } from "./embudo.js";

export { getAuditorQuotaSnapshot } from "./lucyAuditorLlm.js";
export { mexicoCityDayKey, startOfMexicoCityDay } from "./lucyAuditorTime.js";

export type AuditorRunResult = {
  scanned: number;
  /** Leads con chat local revisable. */
  scannedChats?: number;
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
  /** Inicio de la ventana revisada (ISO). */
  since?: string;
  /** Revisión de puntos ciegos: chats donde el cliente dejó de contestar tras Lucy. */
  silentReviewed?: number;
  silentFindings?: number;
  gemini?: AuditorLlmStats;
  quota: ReturnType<typeof getAuditorQuotaSnapshot>;
};

function geminiRunFields(g: AuditorLlmStats) {
  return {
    geminiProposed: g.proposed,
    geminiDroppedNoQuote: g.droppedNoQuote,
    geminiErrors: g.errors,
    geminiLastError: g.lastError,
  };
}

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

type AuditTurn = TranscriptTurn & { at: Date | null };

/** Los últimos `limit` mensajes del lead, en orden cronológico. */
async function loadTurnsForLead(
  leadId: string,
  since: Date | null,
  limit = 80
): Promise<AuditTurn[]> {
  const rows = await db
    .select({
      role: messages.role,
      content: messages.content,
      at: messages.timestamp,
    })
    .from(messages)
    .where(
      since
        ? and(eq(messages.kommoLeadId, leadId), gte(messages.timestamp, since))
        : eq(messages.kommoLeadId, leadId)
    )
    .orderBy(desc(messages.timestamp))
    .limit(limit);
  return rows.reverse().map((r) => ({
    role: r.role,
    content: r.content ?? "",
    at: r.at ? new Date(r.at) : null,
  }));
}

function normFp(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim()
    .slice(0, 80);
}

export function turnFingerprint(t: TranscriptTurn): string {
  return `${t.role}|${normFp(t.content)}`;
}

/**
 * Índice del primer mensaje que Gemini aún no leyó: tras la huella guardada,
 * o (sin huella) el primero dentro de la ventana. turns.length = nada nuevo.
 */
export function findNewTurnsStart(
  turns: Array<TranscriptTurn & { at?: Date | null }>,
  seenFp: string | undefined,
  since: Date | null
): number {
  if (seenFp) {
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turnFingerprint(turns[i]!) === seenFp) return i + 1;
    }
  }
  if (!since) return 0;
  const i = turns.findIndex((t) => t.at != null && t.at >= since);
  return i < 0 ? turns.length : i;
}

/** Lee campos del panel Kommo (CRM). No requiere External chat history. */
async function fetchCrmFieldSnapshot(leadId: string): Promise<CrmFieldSnapshot | null> {
  const subdomain = getKommoSubdomain();
  const accessToken = getKommoAccessToken();
  if (!subdomain || !accessToken) return null;
  try {
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/leads/${leadId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      custom_fields_values?: Array<{
        field_id?: number;
        values?: Array<{ value?: unknown }>;
      }>;
    };
    const get = (id: number): string | null => {
      const f = data.custom_fields_values?.find((x) => x.field_id === id);
      const v = f?.values?.[0]?.value;
      if (v == null) return null;
      if (typeof v === "number") return String(v);
      if (typeof v === "string" && v.trim()) return v.trim();
      return null;
    };
    return {
      direccion: get(1048774),
      requerimientos: get(1048776),
      fecha_evento: get(1048778),
      horario_evento: get(1049358),
      num_invitados: get(1048780),
      tipo_evento: get(1048782),
      presupuesto: get(1048784),
      resumen_ia: get(1048786),
    };
  } catch (err) {
    logger.warn({ err, leadId }, "lucyAuditor: no se pudo leer CRM del lead");
    return null;
  }
}

/**
 * Lista leads actualizados hoy en Kommo (solo IDs; no lee mensajes).
 */
async function listTodayLeadIdsFromKommo(
  limitLeads: number,
  since: Date,
  onProgress?: (ev: AuditorProgressEvent) => void
): Promise<string[]> {
  const subdomain = getKommoSubdomain();
  const accessToken = getKommoAccessToken();
  if (!subdomain || !accessToken) {
    logger.warn("lucyAuditor: sin Kommo — no se listan leads del día");
    return [];
  }

  const sinceSec = Math.floor(since.getTime() / 1000);
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

/** Transcript para Gemini (máx. 6000 caracteres, se conserva lo más reciente). */
export function formatTranscript(turns: TranscriptTurn[], newStart = 0): string {
  const lines = turns.map((t) => {
    const who =
      t.role === "assistant"
        ? "LUCY"
        : t.role === "human"
          ? "HUMANO"
          : "CLIENTE";
    return `${who}: ${t.content.replace(/\s*\n\s*/g, " ")}`;
  });
  if (newStart > 0 && newStart < lines.length) lines.splice(newStart, 0, AUDITOR_NEW_MARKER);
  let total = lines.reduce((n, l) => n + l.length + 1, 0);
  while (lines.length > 1 && total > 6000) total -= lines.shift()!.length + 1;
  return lines.join("\n").slice(-6000);
}

export async function runLucyAuditorBatch(opts?: {
  limitLeads?: number;
  useFlash?: boolean;
  onlyToday?: boolean;
  oncePerDay?: boolean;
  /** Lista IDs del día en Kommo (no lee mensajes). */
  syncFromKommo?: boolean;
  forceFlash?: boolean;
  /** Inicio de ventana explícito (cron: desde la última auditoría). Implica onlyToday. */
  since?: Date;
  /** Llamadas Gemini que se dejan libres (revisión de puntos ciegos). */
  flashReserve?: number;
  kind?: AuditorRunKind;
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

  const onlyToday = opts?.onlyToday === true || opts?.since != null;
  const limitLeads = opts?.limitLeads ?? (onlyToday ? 50 : 20);
  const useFlash = opts?.useFlash !== false;
  const forceFlash = opts?.forceFlash === true;
  const listKommo = opts?.syncFromKommo !== false && onlyToday;
  const flashReserve = Math.max(0, opts?.flashReserve ?? 0);
  const since = onlyToday ? (opts?.since ?? startOfMexicoCityDay()) : null;
  const isDaily = (opts?.kind ?? "manual") === "daily";
  if (!isDaily) takeAuditorLlmStats();

  report({
    type: "phase",
    phase: "sync",
    message: "Cargando historial local (webhook / chat-history)…",
  });
  const hydrated = await hydrateMessagesFromChatHistory();
  const historyKeys = listHistoryKeys().length;

  let kommoLeadIds: string[] = [];
  if (listKommo) {
    kommoLeadIds = await listTodayLeadIdsFromKommo(limitLeads, since!, report);
  }

  const fromDb = onlyToday
    ? await loadLeadIdsWithMessagesSince(since!, limitLeads)
    : await loadLeadIdsRecent(limitLeads);

  // Preferir leads con transcript local; incluir IDs Kommo del día (CRM).
  const localSet = new Set(fromDb);
  const historySet = new Set(listHistoryKeys());
  const preferred = [
    ...fromDb,
    ...kommoLeadIds,
    ...[...historySet].filter((id) => !localSet.has(id)),
  ];
  const leadIds = [...new Set(preferred)].slice(0, limitLeads);

  let flashCalls = 0;
  let findings = 0;
  let recorded = 0;
  let withLucy = 0;
  let tooShort = 0;
  let noReply = 0;
  let scannedChats = 0;

  report({
    type: "phase",
    phase: "scan",
    message: `Revisando ${leadIds.length} lead(s) (chat local + CRM)…`,
  });

  for (let i = 0; i < leadIds.length; i++) {
    const leadId = leadIds[i]!;
    let chatFindings = 0;
    const turns = await loadTurnsForLead(leadId, null);
    const hasReply = turns.some(
      (t) => t.role === "assistant" || t.role === "human"
    );

    if (turns.length >= 2 && hasReply) {
      scannedChats += 1;
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

      // Gemini solo lee lo que no ha leído antes (y solo si Lucy habló ahí).
      const newStart = findNewTurnsStart(turns, getFlashSeen(leadId), since);
      const hasNewLucy = turns.slice(newStart).some((t) => t.role === "assistant");
      const shouldFlash =
        useFlash &&
        hasNewLucy &&
        canSpendAuditorCall() &&
        getAuditorQuotaSnapshot().remaining > flashReserve &&
        turns.length >= 3 &&
        (forceFlash
          ? lucyLike || turns.length >= 4
          : lucyLike && transcriptNeedsFlash(turns, heuristic.length));

      if (shouldFlash) {
        const llmFindings = await runAuditorLlm(
          formatTranscript(turns, newStart),
          "daily",
          buildSupervisorLessonsBlock()
        );
        markFlashSeen(leadId, turnFingerprint(turns[turns.length - 1]!));
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
    } else if (turns.length >= 2 && !hasReply) {
      noReply += 1;
    }

    // Panel Kommo: siempre (bugs de mapeo aunque no haya chat local).
    const crm = await fetchCrmFieldSnapshot(leadId);
    if (crm) {
      const crmFindings = runCrmFieldHeuristics(crm);
      for (const f of crmFindings) {
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
          source: "crm",
        });
      }
    }

    report({
      type: "chat",
      current: i + 1,
      total: leadIds.length,
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

  try {
    const { cleanupRepairQueue } = await import("./cursorRepairAgent.js");
    await cleanupRepairQueue();
  } catch (err) {
    logger.warn({ err }, "lucyAuditor: limpieza de cola falló");
  }

  const modeHint =
    " Modo local: chat por webhook + campos CRM del panel Kommo (sin leer Talks).";

  const summary =
    leadIds.length === 0
      ? `No encontré leads para auditar` +
        (hydrated.keys ? ` (${hydrated.keys} en chat-history, +${hydrated.inserted} importados)` : "") +
        `.` +
        modeHint
      : findings === 0
        ? `Revisé ${leadIds.length} lead(s) (${scannedChats} con chat local)` +
          (hydrated.inserted ? ` (+${hydrated.inserted} del historial)` : "") +
          `. Flash ${flashCalls}. Sin errores detectados` +
          (withLucy ? ` (${withLucy} con Lucy).` : ".") +
          modeHint
        : `Revisé ${leadIds.length} lead(s) (${scannedChats} con chat): ${findings} hallazgo(s), ${recorded} registrado(s), Flash ${flashCalls}.` +
          modeHint;

  const result: AuditorRunResult = {
    scanned: leadIds.length,
    scannedChats,
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
    since: since?.toISOString(),
    quota: getAuditorQuotaSnapshot(),
  };
  if (!isDaily) {
    const gemini = takeAuditorLlmStats();
    result.gemini = gemini;
    recordAuditorRun({
      at: new Date().toISOString(),
      kind: "manual",
      since: result.since,
      scanned: result.scanned,
      scannedChats,
      withLucy,
      flashCalls,
      findings,
      recorded,
      ...geminiRunFields(gemini),
    });
  }
  report({ type: "phase", phase: "done", message: summary });
  report({ type: "result", result });
  logger.info(result, "lucyAuditor batch finished");
  return result;
}

const HOUR = 3600_000;

export function getControlMaxPerDay(): number {
  const n = Number(process.env["LUCY_CONTROL_MAX_PER_DAY"] ?? "8");
  if (!Number.isFinite(n) || n < 0) return 8;
  return Math.min(Math.floor(n), 40);
}

/**
 * Ventana del cron: desde la última auditoría nocturna (mín. 24 h, máx. 48 h).
 * GitHub retrasa el cron horas; con «solo hoy» se perdía casi todo el día.
 */
export function dailyAuditSince(now: Date, lastDailyAt: Date | null): Date {
  const minus24 = now.getTime() - 24 * HOUR;
  const minus48 = now.getTime() - 48 * HOUR;
  const last = lastDailyAt?.getTime() ?? minus24;
  return new Date(Math.max(minus48, Math.min(minus24, last)));
}

async function loadSilentCandidateLeadIds(now: Date, limit: number): Promise<string[]> {
  const rows = await db
    .select({ leadId: messages.kommoLeadId })
    .from(messages)
    .where(gte(messages.timestamp, new Date(now.getTime() - 7 * 24 * HOUR)))
    .groupBy(messages.kommoLeadId)
    .having(
      sql`max(${messages.timestamp}) <= ${new Date(now.getTime() - 18 * HOUR).toISOString()}::timestamp`
    )
    .orderBy(desc(sql`max(${messages.timestamp})`))
    .limit(limit);
  return rows.map((r) => String(r.leadId)).filter(Boolean);
}

/** Cliente que sí platicó (2+ mensajes) y dejó de contestar tras el último mensaje de Lucy. */
export function isSilentAfterLucy(turns: TranscriptTurn[]): boolean {
  const last = turns[turns.length - 1];
  if (!last || last.role !== "assistant") return false;
  return turns.filter((t) => t.role === "user").length >= 2;
}

/**
 * Puntos ciegos: chats de la semana que Gemini no ha leído donde el cliente
 * dejó de contestar justo después de Lucy. Pregunta: ¿fue culpa de Lucy?
 */
export async function runSilentLeadReview(opts: {
  max: number;
  now?: Date;
  onProgress?: (ev: AuditorProgressEvent) => void;
}): Promise<{ reviewed: number; findings: number; recorded: number }> {
  const out = { reviewed: 0, findings: 0, recorded: 0 };
  if (opts.max <= 0) return out;
  const now = opts.now ?? new Date();
  const dayKey = mexicoCityDayKey(now);
  const candidates = await loadSilentCandidateLeadIds(now, 120);
  for (const leadId of candidates) {
    if (out.reviewed >= opts.max || !canSpendAuditorCall()) break;
    const turns = await loadTurnsForLead(leadId, null);
    if (!isSilentAfterLucy(turns)) continue;
    const lastFp = turnFingerprint(turns[turns.length - 1]!);
    if (getFlashSeen(leadId) === lastFp) continue;

    let lastClient = turns.length - 1;
    while (lastClient > 0 && turns[lastClient]!.role !== "user") lastClient -= 1;
    const llmFindings = await runAuditorLlm(
      formatTranscript(turns, lastClient),
      "silent",
      buildSupervisorLessonsBlock()
    );
    markFlashSeen(leadId, lastFp);
    out.reviewed += 1;
    for (const f of llmFindings) {
      out.findings += 1;
      const ok = await recordLucyRepair({
        kommoLeadId: leadId,
        category: f.category,
        severity: f.severity,
        evidence: `[${dayKey}] ${f.evidence}`,
        proposedRepair: `El cliente dejó de contestar después de esto. ${f.proposedRepair}`,
        status: "open",
        source: "flash",
        model: getAuditorModel(),
      });
      if (ok) out.recorded += 1;
      opts.onProgress?.({
        type: "finding",
        leadId,
        category: f.category,
        severity: f.severity,
        evidence: f.evidence,
        source: "flash",
      });
    }
  }
  return out;
}

/** Cron diario: ventana desde la última auditoría + puntos ciegos + siguiente envío a Cursor. */
export async function runLucyAuditorDaily(opts?: { now?: Date }): Promise<AuditorRunResult> {
  const now = opts?.now ?? new Date();
  const lastDailyAt = getLastDailyAuditAt();
  if (lastDailyAt && now.getTime() - lastDailyAt.getTime() < 12 * HOUR) {
    return {
      scanned: 0,
      findings: 0,
      recorded: 0,
      flashCalls: 0,
      skipped: "already_ran_today",
      dayKey: mexicoCityDayKey(now),
      summary: "Ya se corrió la auditoría automática en las últimas 12 horas.",
      quota: getAuditorQuotaSnapshot(),
    };
  }

  const controlMax = getControlMaxPerDay();
  const since = dailyAuditSince(now, lastDailyAt);
  takeAuditorLlmStats();
  const result = await runLucyAuditorBatch({
    since,
    syncFromKommo: true,
    forceFlash: true,
    limitLeads: 80,
    useFlash: true,
    flashReserve: controlMax,
    kind: "daily",
  });

  let silent = { reviewed: 0, findings: 0, recorded: 0 };
  try {
    silent = await runSilentLeadReview({ max: controlMax, now });
  } catch (err) {
    logger.warn({ err }, "lucyAuditor: revisión de puntos ciegos falló");
  }
  lastDailyRunDay = mexicoCityDayKey(now);
  const gemini = takeAuditorLlmStats();

  const merged: AuditorRunResult = {
    ...result,
    findings: result.findings + silent.findings,
    recorded: result.recorded + silent.recorded,
    flashCalls: result.flashCalls + silent.reviewed,
    silentReviewed: silent.reviewed,
    silentFindings: silent.findings,
    gemini,
    summary:
      `${result.summary ?? ""} Puntos ciegos: ${silent.reviewed} chat(s) donde el cliente dejó de contestar` +
      (silent.findings ? `, ${silent.findings} hallazgo(s).` : ", sin hallazgos.") +
      ` Gemini propuso ${gemini.proposed}, se quedaron ${gemini.kept}` +
      (gemini.droppedNoQuote ? ` (${gemini.droppedNoQuote} sin cita real)` : "") +
      (gemini.errors ? `; ${gemini.errors} llamada(s) fallaron: ${gemini.lastError ?? "?"}` : "") +
      ".",
    quota: getAuditorQuotaSnapshot(),
  };
  recordAuditorRun(
    {
      at: now.toISOString(),
      kind: "daily",
      since: since.toISOString(),
      scanned: merged.scanned,
      scannedChats: merged.scannedChats ?? 0,
      withLucy: merged.withLucy ?? 0,
      flashCalls: merged.flashCalls,
      findings: merged.findings,
      recorded: merged.recorded,
      silentReviewed: silent.reviewed,
      silentFindings: silent.findings,
      ...geminiRunFields(gemini),
    },
    { daily: true }
  );

  try {
    const { cleanupRepairQueue, autoSendNextRepairJob } = await import("./cursorRepairAgent.js");
    if (silent.recorded > 0) await cleanupRepairQueue();
    await autoSendNextRepairJob("auditoría nocturna");
  } catch (err) {
    logger.warn({ err }, "lucyAuditor: envío automático a Cursor falló");
  }
  logger.info(merged, "lucyAuditor daily finished");
  return merged;
}

export type DailyAuditState = {
  running: boolean;
  startedAt?: string;
  finishedAt?: string;
  result?: AuditorRunResult;
  error?: string;
};

let dailyState: DailyAuditState = { running: false };

export function getDailyAuditState(): DailyAuditState {
  return dailyState;
}

/** El cron responde al instante y la auditoría sigue en segundo plano (curl cortaba a los 120 s). */
export function startLucyAuditorDailyInBackground(): DailyAuditState {
  if (dailyState.running) return dailyState;
  dailyState = { running: true, startedAt: new Date().toISOString() };
  void runLucyAuditorDaily()
    .then((result) => {
      dailyState = { ...dailyState, running: false, finishedAt: new Date().toISOString(), result };
    })
    .catch((err: unknown) => {
      logger.error({ err }, "lucyAuditor daily (background) falló");
      dailyState = {
        ...dailyState,
        running: false,
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    });
  return dailyState;
}
