/**
 * Resolución de talk_id de Kommo para sincronizar transcripts (aprendizaje).
 * chat_id ≠ talk_id; sin talk_id el sync de mensajes humanos falla en silencio.
 *
 * También: origen del canal (WhatsApp / Facebook / Instagram) y envío por
 * POST /api/v4/talks/{id}/send_message (FB/IG y otros chats externos).
 */
import { logger } from "../lib/logger.js";

/** Canal de mensajería del talk Kommo. */
export type KommoChatChannel =
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "telegram"
  | "other"
  | "unknown";

/** Normaliza el campo `origin` de un talk Kommo. */
export function classifyKommoOrigin(origin: string | null | undefined): KommoChatChannel {
  const o = (origin ?? "").trim().toLowerCase();
  if (!o) return "unknown";
  if (/whats?app|waba|wa_/.test(o)) return "whatsapp";
  if (/instagram|ig_/.test(o)) return "instagram";
  if (/facebook|messenger|fb_/.test(o)) return "facebook";
  if (/telegram|tg_/.test(o)) return "telegram";
  return "other";
}

/** Canales que NO usan Meta WhatsApp Cloud API (van por Kommo send_message). */
export function usesKommoExternalSend(channel: KommoChatChannel): boolean {
  return channel === "facebook" || channel === "instagram" || channel === "telegram" || channel === "other";
}

/** GET /api/v4/talks/{id} → origin del canal. */
export async function fetchTalkOrigin(
  subdomain: string,
  accessToken: string,
  talkId: string | number
): Promise<string | null> {
  try {
    const res = await fetch(`https://${subdomain}.kommo.com/api/v4/talks/${talkId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      logger.warn(
        { talkId, status: res.status },
        "kommoTalks: no se pudo leer origin del talk"
      );
      return null;
    }
    const data = (await res.json()) as { origin?: string; talk_id?: number; id?: number };
    const origin = typeof data.origin === "string" ? data.origin.trim() : "";
    return origin || null;
  } catch (err) {
    logger.warn({ err, talkId }, "kommoTalks: excepción leyendo origin");
    return null;
  }
}

/**
 * Envía un mensaje al chat externo (Facebook, Instagram, etc.) vía Kommo.
 * Endpoint: POST /api/v4/talks/{talk_id}/send_message
 * Requiere scope OAuth "Sending to external chats".
 */
export async function sendKommoTalkMessage(opts: {
  subdomain: string;
  accessToken: string;
  talkId: string | number;
  texto: string;
  entityId?: string | number;
}): Promise<{ ok: boolean; messageId?: string; error?: string; status?: number }> {
  const { subdomain, accessToken, talkId, texto, entityId } = opts;
  const url = `https://${subdomain}.kommo.com/api/v4/talks/${talkId}/send_message`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({ text: texto }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "(no body)");
      logger.warn(
        { entityId, talkId, status: res.status, errBody: errBody.slice(0, 400) },
        "sendKommoTalkMessage: Kommo rechazó el envío"
      );
      let hint = errBody.slice(0, 200);
      if (res.status === 403) {
        hint =
          "403 Forbidden — el token necesita el scope «Sending to external chats» en la integración Kommo.";
      } else if (res.status === 402) {
        hint = "402 — límite de Chats API o plan insuficiente para enviar a chats externos.";
      } else if (res.status === 422) {
        hint = "422 — el talk está cerrado; reabre la conversación en Kommo.";
      }
      return { ok: false, error: hint, status: res.status };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    logger.info(
      { entityId, talkId, messageId: data.id },
      "sendKommoTalkMessage: mensaje aceptado por Kommo ✅"
    );
    return { ok: true, messageId: data.id };
  } catch (err) {
    logger.warn({ err, talkId, entityId }, "sendKommoTalkMessage: excepción de red");
    return { ok: false, error: err instanceof Error ? err.message : "error de red" };
  }
}

export async function fetchTalkIdFromLeadChats(
  subdomain: string,
  accessToken: string,
  leadId: string | number
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/leads/${leadId}?with=contacts,tags,chats`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      _embedded?: { chats?: Array<{ id?: string | number; chat_id?: string | number }> };
    };
    const chats = data._embedded?.chats ?? [];
    for (const chat of chats) {
      const id = chat.id ?? chat.chat_id;
      if (id != null && String(id).trim()) return String(id);
    }
    return null;
  } catch (err) {
    logger.warn({ err, leadId }, "kommoTalks: error leyendo chats del lead");
    return null;
  }
}

/** Lista talks ligados al lead (entity_type lead). */
export async function fetchTalkIdFromTalksFilter(
  subdomain: string,
  accessToken: string,
  leadId: string | number
): Promise<string | null> {
  const entityId = String(leadId);
  const urls = [
    `https://${subdomain}.kommo.com/api/v4/talks?filter[entity_id]=${entityId}&filter[entity_type]=leads&limit=10`,
    `https://${subdomain}.kommo.com/api/v4/talks?filter[entity_id]=${entityId}&filter[entity_type]=lead&limit=10`,
    `https://${subdomain}.kommo.com/api/v4/talks?filter[entity_id]=${entityId}&limit=10`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        _embedded?: { talks?: Array<{ id?: string | number; talk_id?: string | number }> };
      };
      const talks = data._embedded?.talks ?? [];
      for (const talk of talks) {
        const id = talk.id ?? talk.talk_id;
        if (id != null && String(id).trim()) return String(id);
      }
    } catch {
      // probar siguiente URL
    }
  }
  return null;
}

/**
 * Resuelve el mejor talkId disponible para un lead.
 * Orden: known → chats del lead → filtro de talks.
 */
export async function resolveKommoTalkId(opts: {
  subdomain: string;
  accessToken: string;
  leadId: string | number;
  knownTalkId?: string | null;
  knownChatId?: string | null;
}): Promise<string | null> {
  if (opts.knownTalkId?.trim()) return opts.knownTalkId.trim();
  if (opts.knownChatId?.trim()) {
    // En muchos webhooks Kommo el chat_id sirve para Talks; lo usamos como candidato.
    // Si falla el sync, el cron reintentará con resolve desde API.
  }

  const fromChats = await fetchTalkIdFromLeadChats(
    opts.subdomain,
    opts.accessToken,
    opts.leadId
  );
  if (fromChats) return fromChats;

  const fromTalks = await fetchTalkIdFromTalksFilter(
    opts.subdomain,
    opts.accessToken,
    opts.leadId
  );
  if (fromTalks) return fromTalks;

  if (opts.knownChatId?.trim()) return opts.knownChatId.trim();
  return null;
}
