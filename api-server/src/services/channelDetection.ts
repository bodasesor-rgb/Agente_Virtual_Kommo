/**
 * Detecta el canal de comunicación del mensaje entrante en Kommo.
 */

export type LucyChannel = "whatsapp" | "email";

export interface ChannelHints {
  channelHint?: string;
  senderHint?: string;
}

/** True si el mensaje entró por correo conectado en Kommo. */
export function isEmailChannel(hints: ChannelHints): boolean {
  const ch = (hints.channelHint ?? "").toLowerCase();
  const sender = (hints.senderHint ?? "").toLowerCase();

  if (
    ch.includes("mail") ||
    ch.includes("email") ||
    ch.includes("correo") ||
    ch === "incoming_email" ||
    ch === "email"
  ) {
    return true;
  }

  // Remitente con @ y sin señal explícita de WhatsApp
  if (/\S+@\S+\.\S+/.test(sender) && !ch.includes("whatsapp") && !ch.includes("waba")) {
    return true;
  }

  return false;
}

export function detectLucyChannel(hints: ChannelHints): LucyChannel {
  return isEmailChannel(hints) ? "email" : "whatsapp";
}
