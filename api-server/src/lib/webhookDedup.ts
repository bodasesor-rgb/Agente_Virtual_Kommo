/**
 * Evita procesar dos veces el mismo webhook de Kommo (reintentos / duplicados).
 * Kommo no garantiza entrega única; sin esto se repite Vision, notas y Lucy.
 */

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10_000;

const processedAt = new Map<string, number>();

function prune(): void {
  const now = Date.now();
  for (const [key, at] of processedAt) {
    if (now - at > TTL_MS) processedAt.delete(key);
  }
  if (processedAt.size <= MAX_ENTRIES) return;
  const sorted = [...processedAt.entries()].sort((a, b) => a[1] - b[1]);
  const toDrop = sorted.length - MAX_ENTRIES;
  for (let i = 0; i < toDrop; i++) {
    processedAt.delete(sorted[i]![0]);
  }
}

/** Clave estable para un mensaje entrante de Kommo. */
export function webhookMessageKey(message: Record<string, unknown>): string | null {
  const id = message["id"];
  if (typeof id === "string" && id.trim()) return `id:${id.trim()}`;
  if (typeof id === "number") return `id:${id}`;

  const nested = message["message"];
  if (typeof nested === "object" && nested !== null) {
    const mid = (nested as Record<string, unknown>)["id"];
    if (typeof mid === "string" && mid.trim()) return `id:${mid.trim()}`;
  }

  const chatId = String(message["chat_id"] ?? "");
  const entityId = String(message["entity_id"] ?? "");
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const link = (att as Record<string, unknown>)["link"] ?? (att as Record<string, unknown>)["url"];
    if (typeof link === "string" && link.trim() && chatId) {
      return `media:${chatId}:${link.trim()}`;
    }
  }

  const text = typeof message["text"] === "string" ? message["text"].trim() : "";
  const created = message["created_at"] ?? message["timestamp"];
  if (chatId && text && created) return `text:${chatId}:${created}:${text.slice(0, 120)}`;

  return null;
}

/** True si este mensaje entrante ya se procesó en esta instancia. */
export function isDuplicateWebhookMessage(key: string): boolean {
  const at = processedAt.get(key);
  if (!at) return false;
  if (Date.now() - at > TTL_MS) {
    processedAt.delete(key);
    return false;
  }
  return true;
}

export function markWebhookMessageProcessed(key: string): void {
  processedAt.set(key, Date.now());
  if (processedAt.size > MAX_ENTRIES * 0.9) prune();
}

/** Solo mensajes del cliente — ignora salientes / internos de Lucy o el equipo. */
export function isIncomingClientMessage(message: Record<string, unknown>): boolean {
  const msgType = String(message["type"] ?? "").toLowerCase();
  if (msgType === "outgoing") return false;

  const author = message["author"];
  if (typeof author === "object" && author !== null) {
    const authorType = String((author as Record<string, unknown>)["type"] ?? "").toLowerCase();
    if (authorType === "internal" || authorType === "user") return false;
  }

  return true;
}

/** Limpia el registro (solo para tests). */
export function resetWebhookDedupForTests(): void {
  processedAt.clear();
}
