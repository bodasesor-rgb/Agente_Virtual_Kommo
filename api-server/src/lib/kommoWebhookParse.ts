/**
 * Normaliza el webhook de Kommo (JSON o x-www-form-urlencoded).
 * Kommo documenta varias formas: message.add, add en raíz, unsorted.add, talk.add.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Primer elemento de un array o de un objeto { "0": ... } (form-urlencoded). */
export function firstWebhookItem(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return asRecord(value[0]);
  }
  const obj = asRecord(value);
  if (!obj) return null;
  return asRecord(obj["0"]);
}

function pickId(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

/** Mensaje entrante desde las formas oficiales de Kommo. */
export function extractKommoIncomingMessage(
  body: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!body) return null;

  const nestedMessage = asRecord(body["message"]);
  const fromMessage = firstWebhookItem(nestedMessage?.["add"]);
  if (fromMessage) return fromMessage;

  const nestedMessages = asRecord(body["messages"]);
  const fromMessages = firstWebhookItem(nestedMessages?.["add"]);
  if (fromMessages) return fromMessages;

  // Docs Kommo: "Incoming message received" trae `add` en la raíz (no bajo message).
  if (!body["leads"] && !body["unsorted"] && !body["talk"] && !body["outgoing_message"]) {
    const fromRoot = firstWebhookItem(body["add"]);
    if (fromRoot && (fromRoot["chat_id"] || fromRoot["text"] || fromRoot["entity_id"] || fromRoot["element_id"])) {
      return fromRoot;
    }
  }

  return null;
}

export function extractKommoTalkAdd(
  body: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  const talk = asRecord(body?.["talk"]);
  return firstWebhookItem(talk?.["add"]);
}

export function extractKommoUnsortedAdd(
  body: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  const unsorted = asRecord(body?.["unsorted"]);
  return firstWebhookItem(unsorted?.["add"]);
}

export function extractKommoEntityId(msg: Record<string, unknown> | null | undefined): string | number | null {
  if (!msg) return null;
  return pickId(msg["entity_id"]) ?? pickId(msg["element_id"]) ?? pickId(msg["lead_id"]);
}

export function extractKommoChatId(msg: Record<string, unknown> | null | undefined): string | null {
  if (!msg) return null;
  const id = pickId(msg["chat_id"]);
  return id == null ? null : String(id);
}

export function extractKommoTalkId(msg: Record<string, unknown> | null | undefined): string | null {
  if (!msg) return null;
  const id = pickId(msg["talk_id"]);
  return id == null ? null : String(id);
}

/** Texto del cliente: top-level o anidado en message.text (payload amojo). */
export function extractKommoMessageText(msg: Record<string, unknown> | null | undefined): string {
  if (!msg) return "";
  if (typeof msg["text"] === "string" && msg["text"].trim()) return msg["text"];
  if (typeof msg["message"] === "string" && msg["message"].trim()) return msg["message"];
  const nested = asRecord(msg["message"]);
  if (typeof nested?.["text"] === "string" && nested["text"].trim()) return nested["text"];
  return typeof msg["text"] === "string" ? msg["text"] : "";
}

export function isChatUnsortedCategory(category: unknown): boolean {
  const c = String(category ?? "").toLowerCase();
  if (!c) return true; // sin categoría: tratar como chat (WhatsApp suele ser "chats")
  return /chat|whats|waba|telegram|facebook|instagram|messenger|sip/.test(c);
}

export function webhookBodyShape(body: Record<string, unknown> | null | undefined): {
  keys: string[];
  hasMessageAdd: boolean;
  hasRootAdd: boolean;
  hasUnsorted: boolean;
  hasTalk: boolean;
} {
  const keys = body ? Object.keys(body) : [];
  return {
    keys,
    hasMessageAdd: Boolean(asRecord(body?.["message"])?.["add"]),
    hasRootAdd: Array.isArray(body?.["add"]) || Boolean(asRecord(body?.["add"])?.["0"]),
    hasUnsorted: Boolean(body?.["unsorted"]),
    hasTalk: Boolean(body?.["talk"]),
  };
}
