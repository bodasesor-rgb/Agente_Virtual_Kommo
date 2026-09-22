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
  /** Chats con respuesta de Lucy (role assistant). */
  withLucy?: number;
  /** Chats demasiado cortos para Flash. */
  tooShort?: number;
  /** Resumen legible para el panel. */
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
 * @returns { synced, leadIds } leadIds = candidatos del día (aunque no insertara msgs nuevos).
 */
async function syncTodayLeadsFromKommo(
  limitLeads: number,
  onProgress?: (ev: AuditorProgressEvent) => void
): Promise<{ synced: number; leadIds: string[] }> {
  const subdomain = getKommoSubdomain();
  const accessToken = getKommoAccessToken();
  if (!subdomain || !accessToken) {
    logger.warn("lucyAuditor: sin Kommo — no se puede sync del día");
    return { synced: 0, leadIds: [] };
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
    message: "Buscando leads del día en Kommo…",
  });

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
  for (let i = 0; i < ids.length; i++) {
    const leadId = ids[i]!;
    onProgress?.({
      type: "sync",
      current: i + 1,
      total: ids.length,
      leadId,
      synced,
    });
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
  return { synced, leadIds: ids };
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
  /**
   * Panel / auditoría forzada: gasta Flash en chats con ida y vuelta
   * aunque no pasen el umbral estricto (hasta el cupo diario).
   */
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
  const syncFromKommo = opts?.syncFromKommo !== false && onlyToday;

  let syncedFromKommo = 0;
  let kommoLeadIds: string[] = [];
  if (syncFromKommo) {
    const sync = await syncTodayLeadsFromKommo(limitLeads, report);
    syncedFromKommo = sync.synced;
    kommoLeadIds = sync.leadIds;
  }

  const since = onlyToday ? startOfMexicoCityDay() : null;
  // Tras sync Kommo: auditar esos leads (transcript completo), no solo msgs
  // con timestamp "hoy" — muchos ya estaban en BD con fecha vieja.
  const fromDb = onlyToday
    ? await loadLeadIdsWithMessagesSince(since!, limitLeads)
    : await loadLeadIdsRecent(limitLeads);
  const leadIds = [
    ...new Set([...(kommoLeadIds.length ? kommoLeadIds : []), ...fromDb]),
  ].slice(0, limitLeads);

  let flashCalls = 0;
  let findings = 0;
  let recorded = 0;
  let withLucy = 0;
  let tooShort = 0;

  // Si vinieron de Kommo sync, leer historial completo (since=null).
  const turnsSince = kommoLeadIds.length > 0 ? null : since;
  const transcripts = await loadTranscriptsForLeadIds(leadIds, turnsSince);
  report({
    type: "phase",
    phase: "scan",
    message: `Revisando ${transcripts.length} chat(s)…`,
  });

  for (let i = 0; i < transcripts.length; i++) {
    const { leadId, turns } = transcripts[i]!;
    let chatFindings = 0;

    const assistantTurns = turns.filter((t) => t.role === "assistant").length;
    // A veces Kommo marca a Lucy como "internal"/humano; si hay links de catálogo
    // en mensajes no-user, trátalos como Lucy para el umbral de Flash.
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

  const summary =
    transcripts.length === 0
      ? `No encontré chats del día${syncedFromKommo ? ` (sync Kommo ${syncedFromKommo})` : ""}.`
      : findings === 0
        ? `Revisé ${transcripts.length} chat(s)${syncedFromKommo ? `, sync ${syncedFromKommo}` : ""}. ` +
          `Flash en ${flashCalls}. Sin errores detectados` +
          (withLucy ? ` (${withLucy} con Lucy).` : " (pocos con rol Lucy reconocible).")
        : `Revisé ${transcripts.length} chat(s): ${findings} hallazgo(s), ${recorded} registrado(s), Flash ${flashCalls}.`;

  const result: AuditorRunResult = {
    scanned: transcripts.length,
    findings,
    recorded,
    flashCalls,
    syncedFromKommo,
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

/** Cron diario / botón: chats del día (Mexico), sync Kommo, una vez en cron. */
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
