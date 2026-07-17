/**
 * Resolución de talk_id de Kommo para sincronizar transcripts (aprendizaje).
 * chat_id ≠ talk_id; sin talk_id el sync de mensajes humanos falla en silencio.
 */
import { logger } from "../lib/logger.js";

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
