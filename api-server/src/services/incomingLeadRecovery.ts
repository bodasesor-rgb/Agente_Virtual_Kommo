/**
 * Recupera Incoming Leads (unsorted + etapa Leads Entrantes) a los que Lucy
 * no les escribió porque Kommo desactivó el webhook.
 */
import { logger } from "../lib/logger.js";
import { appendHistory, getHistory } from "../chat-history.js";
import { LUCY_INTRO } from "../lucy-flow-guards.js";
import { deliverLucyOutbound } from "./kommoMirror.js";
import { fetchContactPhone } from "./whatsappDirectSender.js";
import {
  ETAPA,
  PIPELINE_ID,
  acceptUnsortedLead,
  agregarTag,
  fetchLead,
  moverEtapa,
} from "./embudo.js";

const MAX_PER_RUN = 40;
const PAUSE_MS = 700;

export interface RecoverIncomingResult {
  lookedBackHours: number;
  unsortedFound: number;
  accepted: number;
  wrote: number;
  skipped: number;
  failed: number;
  details: Array<{
    leadId: string;
    status: "wrote" | "skipped" | "failed" | "accepted_no_chat";
    reason?: string;
  }>;
}

export function isWithinLookback(createdAt: unknown, lookbackMs: number, now = Date.now()): boolean {
  const ts = Number(createdAt);
  if (!Number.isFinite(ts) || ts <= 0) return true;
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return ms >= now - lookbackMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isChatCategory(category: unknown): boolean {
  const c = String(category ?? "").toLowerCase();
  if (!c) return true;
  return /chat|whats|waba|telegram|facebook|instagram|messenger/.test(c);
}

interface UnsortedRow {
  uid?: string;
  category?: string;
  created_at?: number | string;
  lead_id?: number | string;
  chat_id?: string;
}

async function listUnsorted(
  subdomain: string,
  accessToken: string
): Promise<UnsortedRow[]> {
  const rows: UnsortedRow[] = [];
  for (let page = 1; page <= 6; page++) {
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/leads/unsorted?limit=50&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      logger.warn({ status: res.status, page }, "recoverIncoming: no se pudo listar unsorted");
      break;
    }
    const data = (await res.json()) as { _embedded?: { unsorted?: UnsortedRow[] } };
    const batch = data._embedded?.unsorted ?? [];
    rows.push(...batch);
    if (batch.length < 50) break;
  }
  return rows;
}

async function listIncomingStageLeads(
  subdomain: string,
  accessToken: string
): Promise<Array<{ id: number; updated_at?: number }>> {
  const url =
    `https://${subdomain}.kommo.com/api/v4/leads` +
    `?filter[statuses][0][pipeline_id]=${PIPELINE_ID}` +
    `&filter[statuses][0][status_id]=${ETAPA.LEADS_ENTRANTES}` +
    `&order[updated_at]=desc&limit=250`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    logger.warn({ status: res.status }, "recoverIncoming: no se pudo listar Leads Entrantes");
    return [];
  }
  const data = (await res.json()) as {
    _embedded?: { leads?: Array<{ id?: number; updated_at?: number }> };
  };
  return (data._embedded?.leads ?? []).filter((l): l is { id: number; updated_at?: number } => l.id != null);
}

async function lastCustomerText(
  subdomain: string,
  accessToken: string,
  talkId: string | null
): Promise<string> {
  if (!talkId) return "";
  try {
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/talks/${talkId}/messages?limit=15&order=desc`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return "";
    const data = (await res.json()) as {
      _embedded?: { messages?: Array<{ text?: string; author?: { type?: string } }> };
    };
    const incoming = (data._embedded?.messages ?? []).find(
      (m) => m.text?.trim() && m.author?.type === "external"
    );
    return incoming?.text?.trim() ?? "";
  } catch {
    return "";
  }
}

function composeLucyReply(userText: string): string {
  const trimmed = userText.trim();
  const sawRealMessage = trimmed.length > 0 && !/^hola!?$/i.test(trimmed);
  const ack = sawRealMessage ? "Vi tu mensaje. " : "";
  return `${LUCY_INTRO} ${ack}Disculpa la espera — se había quedado pendiente. ¿Me compartes tu nombre y qué necesitas cotizar para tu evento?`.trim();
}

async function writeToLead(opts: {
  subdomain: string;
  accessToken: string;
  leadId: string | number;
  userText: string;
}): Promise<{ status: "wrote" | "skipped" | "failed" | "accepted_no_chat"; reason?: string }> {
  const leadId = opts.leadId;
  const histKey = String(leadId);
  if (getHistory(histKey).some((m) => m.role === "assistant")) {
    return { status: "skipped", reason: "lucy_ya_escribio" };
  }

  const lead = await fetchLead(opts.subdomain, opts.accessToken, leadId);
  if (!lead) return { status: "failed", reason: "lead_no_encontrado" };
  if (lead.tags.includes("lucy_recovery")) {
    return { status: "skipped", reason: "ya_recuperado" };
  }

  if (lead.status_id === ETAPA.LEADS_ENTRANTES) {
    await moverEtapa(opts.subdomain, opts.accessToken, leadId, ETAPA.DATOS_E_INTERESES);
  }

  const phone = await fetchContactPhone(opts.subdomain, opts.accessToken, leadId);
  const chatId = lead.chatId;
  if (!phone && !chatId) {
    await agregarTag(opts.subdomain, opts.accessToken, leadId, ["lucy_recovery"], lead.tags);
    return { status: "accepted_no_chat", reason: "sin_telefono_ni_chat" };
  }

  const texto = composeLucyReply(opts.userText);

  const channel = await deliverLucyOutbound({
    subdomain: opts.subdomain,
    accessToken: opts.accessToken,
    talkId: null,
    chatId,
    whatsappPhone: phone,
    texto,
    entityId: leadId,
    channelOrigin: "waba",
  });
  if (channel === "failed") {
    return { status: "failed", reason: "envio_fallo" };
  }

  appendHistory(histKey, opts.userText || "Hola", texto);
  await agregarTag(opts.subdomain, opts.accessToken, leadId, ["lucy_recovery"], lead.tags);
  logger.info({ leadId, channel }, "recoverIncoming: Lucy escribió al lead");
  return { status: "wrote" };
}

export async function recoverStuckIncomingLeads(opts: {
  subdomain: string;
  accessToken: string;
  hours?: number;
}): Promise<RecoverIncomingResult> {
  const hours = opts.hours && opts.hours > 0 ? opts.hours : 15;
  const lookbackMs = hours * 60 * 60 * 1000;
  const result: RecoverIncomingResult = {
    lookedBackHours: hours,
    unsortedFound: 0,
    accepted: 0,
    wrote: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  if (!opts.subdomain || !opts.accessToken) {
    result.failed = 1;
    result.details.push({ leadId: "-", status: "failed", reason: "kommo_no_configurado" });
    return result;
  }

  const seen = new Set<string>();
  const queue: Array<{ leadId: string; userText: string }> = [];

  try {
    const unsorted = await listUnsorted(opts.subdomain, opts.accessToken);
    for (const row of unsorted) {
      if (!isChatCategory(row.category)) continue;
      if (!isWithinLookback(row.created_at, lookbackMs)) continue;
      result.unsortedFound += 1;
      const uid = String(row.uid ?? "").trim();
      if (!uid) continue;
      const acceptedId = await acceptUnsortedLead(opts.subdomain, opts.accessToken, uid);
      const leadId = String(acceptedId ?? row.lead_id ?? "");
      if (!leadId) {
        result.failed += 1;
        result.details.push({ leadId: uid, status: "failed", reason: "accept_fallo" });
        continue;
      }
      result.accepted += 1;
      if (seen.has(leadId)) continue;
      seen.add(leadId);
      const talkGuess = row.chat_id ? String(row.chat_id) : null;
      const userText = (await lastCustomerText(opts.subdomain, opts.accessToken, talkGuess)) || "Hola";
      queue.push({ leadId, userText });
    }
  } catch (err) {
    logger.warn({ err }, "recoverIncoming: error listando/aceptando unsorted");
  }

  try {
    const incoming = await listIncomingStageLeads(opts.subdomain, opts.accessToken);
    for (const lead of incoming) {
      if (!isWithinLookback(lead.updated_at, lookbackMs)) continue;
      const leadId = String(lead.id);
      if (seen.has(leadId)) continue;
      seen.add(leadId);
      queue.push({ leadId, userText: "Hola" });
    }
  } catch (err) {
    logger.warn({ err }, "recoverIncoming: error listando etapa Incoming");
  }

  const toProcess = queue.slice(0, MAX_PER_RUN);
  for (const item of toProcess) {
    try {
      const out = await writeToLead({
        subdomain: opts.subdomain,
        accessToken: opts.accessToken,
        leadId: item.leadId,
        userText: item.userText,
      });
      result.details.push({ leadId: item.leadId, status: out.status, reason: out.reason });
      if (out.status === "wrote") result.wrote += 1;
      else if (out.status === "skipped") result.skipped += 1;
      else result.failed += 1;
    } catch (err) {
      result.failed += 1;
      result.details.push({
        leadId: item.leadId,
        status: "failed",
        reason: err instanceof Error ? err.message : "error",
      });
    }
    await sleep(PAUSE_MS);
  }

  logger.info(
    {
      hours,
      unsortedFound: result.unsortedFound,
      accepted: result.accepted,
      wrote: result.wrote,
      skipped: result.skipped,
      failed: result.failed,
    },
    "recoverIncoming: corrida terminada"
  );
  return result;
}
