/**
 * Recuperación al mover MANUALMENTE un lead a "Datos e Intereses" (p. ej. tras una
 * caída de Lucy): se leen los mensajes del cliente que nadie contestó y entran al
 * flujo normal de Lucy como si acabaran de llegar. Sin mensajes pendientes no se envía nada.
 *
 * - Manual vs Lucy: evento Kommo lead_status_changed → created_by 0 = API/robot (Lucy).
 * - WhatsApp solo permite texto libre ≤24 h desde el último mensaje del cliente;
 *   fuera de esa ventana no se envía y se deja nota en el lead.
 * - Leer el texto por API requiere el scope "External chat history" (la cuenta no lo
 *   ofrece); por eso la fuente principal es el buzón PHP de respaldo.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getKommoRelayDir } from "../lib/lucyDataPaths.js";
import { ETAPA } from "./embudo.js";

/** Margen bajo 24 h: el mensaje debe llegar antes de que Meta cierre la ventana. */
export const WHATSAPP_WINDOW_MS = 23.5 * 60 * 60 * 1000;
/** Si el cliente acaba de escribir, Lucy ya le contesta por el flujo normal. */
export const CLIENT_JUST_WROTE_MS = 2 * 60 * 1000;
/** Solo movimientos recientes (evita reaccionar a eventos viejos reintentados por Kommo). */
export const MANUAL_MOVE_MAX_AGE_MS = 5 * 60 * 1000;

export interface LeadStageEvent {
  leadId: string;
  statusId: number;
  kind: "status" | "update" | "add";
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(
      (v): v is Record<string, unknown> => !!v && typeof v === "object"
    );
  }
  return [];
}

/** leads[status|update|add][n] del webhook de Kommo → lead + etapa actual. */
export function extractLeadStageEvents(rawBody: Record<string, unknown>): LeadStageEvent[] {
  const leads = rawBody?.["leads"];
  if (!leads || typeof leads !== "object") return [];
  const out: LeadStageEvent[] = [];
  for (const kind of ["status", "update", "add"] as const) {
    for (const entry of asArray((leads as Record<string, unknown>)[kind])) {
      const leadId = String(entry["id"] ?? "").trim();
      const statusId = Number(entry["status_id"] ?? 0);
      if (!/^\d+$/.test(leadId) || !statusId) continue;
      if (out.some((e) => e.leadId === leadId)) continue;
      out.push({ leadId, statusId, kind });
    }
  }
  return out;
}

export interface KommoStatusChange {
  eventId: string;
  createdBy: number;
  createdAtMs: number;
  statusId: number;
}

export function isManualMoveToDatosEIntereses(
  change: KommoStatusChange | null,
  now = Date.now()
): boolean {
  if (!change) return false;
  if (change.statusId !== ETAPA.DATOS_E_INTERESES) return false;
  if (!change.createdBy) return false;
  return now - change.createdAtMs <= MANUAL_MOVE_MAX_AGE_MS;
}

export type WindowDecision = "send" | "client_just_wrote" | "outside_window";

export function decideWhatsAppWindow(lastInboundMs: number | null, now = Date.now()): WindowDecision {
  if (!lastInboundMs) return "outside_window";
  const age = now - lastInboundMs;
  if (age < CLIENT_JUST_WROTE_MS) return "client_just_wrote";
  if (age > WHATSAPP_WINDOW_MS) return "outside_window";
  return "send";
}

export function describeAge(lastInboundMs: number | null, now = Date.now()): string {
  if (!lastInboundMs) return "sin mensajes del cliente registrados";
  const hours = Math.floor((now - lastInboundMs) / (60 * 60 * 1000));
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} días`;
}

export interface TalkMessage {
  type?: string;
  message_type?: string;
  author?: { type?: string; name?: string };
  text?: string;
  created_at?: number;
  sec_created_at?: number;
}

function isClientMessage(m: TalkMessage): boolean {
  if (m.author?.type) return m.author.type === "external";
  return m.type === "incoming";
}

function messageTimeMs(m: TalkMessage): number {
  return Number(m.sec_created_at ?? 0) || Number(m.created_at ?? 0) * 1000;
}

export interface PendingClientMessages {
  texts: string[];
  /** Mensajes sin texto (audio, foto…) que Lucy no puede recuperar por aquí. */
  mediaCount: number;
}

/**
 * Mensajes del cliente posteriores a la última respuesta. Las respuestas de Lucy salen
 * por Meta y pueden no aparecer en el chat de Kommo, por eso también cuenta
 * `lastLucyReplyMs` (nota "Lucy → cliente").
 */
export function pendingClientMessages(
  messages: TalkMessage[],
  lastLucyReplyMs: number | null = null
): PendingClientMessages {
  const sorted = [...messages].sort((a, b) => messageTimeMs(a) - messageTimeMs(b));
  let boundaryMs = lastLucyReplyMs ?? 0;
  for (const m of sorted) {
    if (!isClientMessage(m)) boundaryMs = Math.max(boundaryMs, messageTimeMs(m));
  }
  const texts: string[] = [];
  let mediaCount = 0;
  for (const m of sorted) {
    if (!isClientMessage(m) || messageTimeMs(m) <= boundaryMs) continue;
    const text = m.text?.trim();
    if (text) texts.push(text);
    else mediaCount += 1;
  }
  return { texts, mediaCount };
}

// ─── Buzón de respaldo (hostinger-relay/kommo-relay.php) ─────────────────────

interface RelayLine {
  id?: string;
  lead_id?: string;
  type?: string;
  text?: string;
  created_at?: number;
}

/** Mensajes del lead guardados por el buzón PHP (sigue recibiendo aunque Lucy esté caída). */
export function readRelayMessages(leadId: string, sinceMs: number, dir = getKommoRelayDir()): TalkMessage[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const sinceDay = new Date(sinceMs).toISOString().slice(0, 10);
  const byId = new Map<string, TalkMessage>();
  for (const f of files) {
    if (f.slice(0, 10) < sinceDay) continue;
    let raw: string;
    try {
      raw = readFileSync(join(dir, f), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let r: RelayLine;
      try {
        r = JSON.parse(line) as RelayLine;
      } catch {
        continue;
      }
      if (String(r.lead_id ?? "") !== leadId) continue;
      const createdAt = Number(r.created_at ?? 0);
      if (createdAt * 1000 < sinceMs) continue;
      const incoming = String(r.type ?? "").toLowerCase() !== "outgoing";
      byId.set(r.id || `${createdAt}|${r.text ?? ""}`, {
        type: incoming ? "incoming" : "outgoing",
        author: { type: incoming ? "external" : "internal" },
        text: r.text ?? "",
        created_at: createdAt,
      });
    }
  }
  return [...byId.values()];
}

// ─── Kommo API ────────────────────────────────────────────────────────────────

async function kommoGet<T>(subdomain: string, accessToken: string, path: string): Promise<T | null> {
  const res = await fetch(`https://${subdomain}.kommo.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 204 || !res.ok) return null;
  return (await res.json()) as T;
}

export type TalkMessagesResult =
  | { ok: true; messages: TalkMessage[] }
  | { ok: false; scopeDenied: boolean; status: number };

/** GET /api/v4/talks/{id}/messages (scope "External chat history"). */
export async function fetchTalkMessagesSince(
  subdomain: string,
  accessToken: string,
  talkId: string,
  fromMs: number
): Promise<TalkMessagesResult> {
  const from = Math.floor(fromMs / 1000);
  const res = await fetch(
    `https://${subdomain}.kommo.com/api/v4/talks/${encodeURIComponent(talkId)}` +
      `/messages?limit=250&filter[created_at][from]=${from}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) }
  );
  if (res.status === 204) return { ok: true, messages: [] };
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, scopeDenied: res.status === 403 && /scope/i.test(body), status: res.status };
  }
  const data = (await res.json()) as { _embedded?: { messages?: TalkMessage[] } };
  return { ok: true, messages: data._embedded?.messages ?? [] };
}

interface KommoNotesResponse {
  _embedded?: {
    notes?: Array<{ created_at?: number; params?: { text?: string } }>;
  };
}

/** Hora de la última respuesta de Lucy registrada como nota "Lucy → cliente". */
export async function fetchLastLucyReplyAt(
  subdomain: string,
  accessToken: string,
  leadId: string,
  fromMs: number
): Promise<number | null> {
  const q =
    `filter[note_type]=common&filter[updated_at][from]=${Math.floor(fromMs / 1000)}&limit=250`;
  const data = await kommoGet<KommoNotesResponse>(
    subdomain,
    accessToken,
    `/api/v4/leads/${encodeURIComponent(leadId)}/notes?${q}`
  );
  let last = 0;
  for (const n of data?._embedded?.notes ?? []) {
    if (!/Lucy → cliente/.test(n.params?.text ?? "")) continue;
    last = Math.max(last, Number(n.created_at ?? 0) * 1000);
  }
  return last || null;
}

interface KommoEventsResponse {
  _embedded?: {
    events?: Array<{
      id?: string;
      created_by?: number;
      created_at?: number;
      value_after?: Array<{ lead_status?: { id?: number } }>;
    }>;
  };
}

/** Último cambio de etapa del lead (Kommo devuelve el más reciente primero). */
export async function fetchLatestStatusChange(
  subdomain: string,
  accessToken: string,
  leadId: string
): Promise<KommoStatusChange | null> {
  const q =
    `filter[entity][]=lead&filter[entity_id][]=${encodeURIComponent(leadId)}` +
    `&filter[type][]=lead_status_changed&limit=1`;
  const data = await kommoGet<KommoEventsResponse>(subdomain, accessToken, `/api/v4/events?${q}`);
  const ev = data?._embedded?.events?.[0];
  if (!ev) return null;
  return {
    eventId: String(ev.id ?? ""),
    createdBy: Number(ev.created_by ?? 0),
    createdAtMs: Number(ev.created_at ?? 0) * 1000,
    statusId: Number(ev.value_after?.[0]?.lead_status?.id ?? 0),
  };
}

/** Último mensaje entrante del cliente (el filtro por lead no funciona para este tipo; va por contacto). */
export async function fetchLastInboundAt(
  subdomain: string,
  accessToken: string,
  contactId: number
): Promise<number | null> {
  const q =
    `filter[entity][]=contact&filter[entity_id][]=${contactId}` +
    `&filter[type][]=incoming_chat_message&limit=1`;
  const data = await kommoGet<KommoEventsResponse>(subdomain, accessToken, `/api/v4/events?${q}`);
  const at = Number(data?._embedded?.events?.[0]?.created_at ?? 0);
  return at ? at * 1000 : null;
}

export interface LeadTalk {
  talkId: string | null;
  chatId: string | null;
  contactId: number | null;
  origin: string | null;
}

interface KommoTalksResponse {
  _embedded?: {
    talks?: Array<{
      talk_id?: number | string;
      id?: number | string;
      chat_id?: string;
      contact_id?: number;
      origin?: string;
      updated_at?: number;
    }>;
  };
}

/** Conversación de WhatsApp más reciente del lead. */
export async function fetchLeadTalk(
  subdomain: string,
  accessToken: string,
  leadId: string
): Promise<LeadTalk> {
  const data = await kommoGet<KommoTalksResponse>(
    subdomain,
    accessToken,
    `/api/v4/talks?filter[entity_id]=${encodeURIComponent(leadId)}&filter[entity_type]=lead`
  );
  const talks = [...(data?._embedded?.talks ?? [])].sort(
    (a, b) => Number(b.updated_at ?? 0) - Number(a.updated_at ?? 0)
  );
  const t = talks[0];
  return {
    talkId: t?.talk_id != null ? String(t.talk_id) : t?.id != null ? String(t.id) : null,
    chatId: t?.chat_id ?? null,
    contactId: t?.contact_id ?? null,
    origin: t?.origin ?? null,
  };
}
