/**
 * Mensaje automático de Lucy cuando el equipo mueve MANUALMENTE un lead a
 * "Datos e Intereses" (sin esperar a que el cliente escriba).
 *
 * - Manual vs Lucy: evento Kommo lead_status_changed → created_by 0 = API/robot (Lucy).
 * - WhatsApp solo permite texto libre ≤24 h desde el último mensaje del cliente;
 *   fuera de esa ventana no se envía y se deja nota en el lead.
 */
import type OpenAI from "openai";
import { sanitizeCrmNombre, sanitizeDisplayName } from "../contact-name.js";
import { CRM_FECHA_LABEL, CRM_HORARIO_LABEL } from "../conversation-understanding.js";
import { nextFieldQuestion } from "../lucy-flow-guards.js";
import { emptyExtractedData, type ExtractedData } from "../types.js";
import { ETAPA } from "./embudo.js";

export const STAGE_ACTIVATION_TAG = "lucy_inicio_auto";

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

export interface CrmState {
  filledLabels: Set<string>;
  extracted: Partial<ExtractedData>;
}

/** Líneas "- Etiqueta: valor" de fetchLeadCurrentFields → etiquetas llenas + datos. */
export function crmLinesToState(crmLines: string[]): CrmState {
  const filledLabels = new Set<string>();
  const extracted: Partial<ExtractedData> = {};
  for (const line of crmLines) {
    const m = /^-\s*([^:]+):\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const label = m[1]!.trim();
    const value = m[2]!.trim();
    if (!value) continue;
    filledLabels.add(label);
    if (label === "Nombre del cliente") extracted.nombre = value;
    else if (label === "Tipo de evento") extracted.tipo_evento = value;
    else if (label === "Requerimientos o servicios") extracted.requerimientos_evento = value;
    else if (label === "Lugar/dirección del evento") extracted.direccion_evento = value;
    else if (label === CRM_FECHA_LABEL) extracted.fecha_evento = value;
    else if (label === CRM_HORARIO_LABEL) extracted.horario_evento = value;
    else if (label === "Número de invitados") {
      const n = parseInt(value.replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(n)) extracted.num_invitados = n;
    } else if (label === "Presupuesto (MXN)") {
      const n = parseFloat(value.replace(/[^\d.]/g, ""));
      if (Number.isFinite(n)) extracted.presupuesto = n;
    }
  }
  return { filledLabels, extracted };
}

/**
 * Mensaje de arranque: saludo (con nombre si es confiable), contexto del evento
 * si ya está en CRM y solo el siguiente dato pendiente (nunca re-pregunta lo que ya hay).
 */
export function composeStageActivationMessage(opts: {
  contactName: string | null;
  crm: CrmState;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  leadId?: string | number;
}): string {
  const crmNombre = sanitizeCrmNombre(opts.crm.extracted.nombre ?? null);
  const nombre = sanitizeDisplayName(crmNombre) || sanitizeDisplayName(opts.contactName);
  const tipoEvento = opts.crm.extracted.tipo_evento ?? null;
  const extracted = emptyExtractedData({ ...opts.crm.extracted, nombre: crmNombre || nombre });
  const filled = new Set(opts.crm.filledLabels);
  // Saludar por nombre y luego preguntar "¿con quién tengo el gusto?" se contradice.
  if (nombre) filled.add("Nombre del cliente");
  const question = nextFieldQuestion(
    extracted,
    filled,
    nombre,
    opts.history ?? [],
    "",
    opts.leadId
  );

  const yaSePresento = (opts.history ?? []).some((m) => m.role === "assistant");
  const tipo = tipoEvento?.trim().replace(/[.!?]+$/, "");
  const tipoTexto = tipo && (/[A-ZÁÉÍÓÚÑ]{2,}/.test(tipo) ? tipo : tipo.toLowerCase());
  const saludo = yaSePresento
    ? nombre
      ? `¡Hola de nuevo, ${nombre}! Soy Lucy de Bodasesor.`
      : "¡Hola de nuevo! Soy Lucy de Bodasesor."
    : nombre
      ? `¡Hola, ${nombre}! Soy Lucy, agente virtual de Bodasesor.`
      : "¡Hola! Soy Lucy, agente virtual de Bodasesor.";
  const contexto = yaSePresento
    ? `Sigamos con la cotización de tu ${tipoTexto || "evento"}.`
    : `Te escribo para ayudarte con la cotización de tu ${tipoTexto || "evento"}.`;
  const cierre =
    question?.trim() ||
    "Ya tengo los datos principales de tu evento; ¿hay algo más que quieras agregar a tu cotización?";
  return `${saludo} ${contexto} ${cierre}`.replace(/\s+/g, " ").trim();
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

interface KommoLeadContactsResponse {
  _embedded?: { contacts?: Array<{ id: number; is_main?: boolean }> };
}

/** Conversación de WhatsApp más reciente del lead; si no hay talk, al menos el contacto principal. */
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
  if (t?.contact_id) {
    return {
      talkId: t.talk_id != null ? String(t.talk_id) : t.id != null ? String(t.id) : null,
      chatId: t.chat_id ?? null,
      contactId: t.contact_id,
      origin: t.origin ?? null,
    };
  }
  const lead = await kommoGet<KommoLeadContactsResponse>(
    subdomain,
    accessToken,
    `/api/v4/leads/${encodeURIComponent(leadId)}?with=contacts`
  );
  const contacts = lead?._embedded?.contacts ?? [];
  const main = contacts.find((c) => c.is_main) ?? contacts[0];
  return { talkId: null, chatId: null, contactId: main?.id ?? null, origin: null };
}
