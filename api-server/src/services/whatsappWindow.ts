/**
 * Ventana de sesión de WhatsApp Cloud API (24h desde el último mensaje del cliente).
 * Fuera de ventana, los mensajes libres no se entregan — solo plantillas (costo).
 */

/** Margen de seguridad: 23h para no rozar el límite de Meta. */
export const WA_SAFE_SESSION_MS = 23 * 60 * 60 * 1000;

export const WA_SESSION_MS = 24 * 60 * 60 * 1000;

export function parseMessageTime(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True si aún podemos enviar mensajes de sesión (gratis) por WhatsApp. */
export function isWhatsAppSessionOpen(
  lastClientMessageAt: Date | string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const last = parseMessageTime(lastClientMessageAt);
  if (!last) return false;
  return nowMs - last.getTime() < WA_SAFE_SESSION_MS;
}

export function msSinceLastClientMessage(
  lastClientMessageAt: Date | string | null | undefined,
  nowMs: number = Date.now()
): number | null {
  const last = parseMessageTime(lastClientMessageAt);
  if (!last) return null;
  return nowMs - last.getTime();
}

export function formatWindowStatus(lastClientMessageAt: Date | string | null | undefined): string {
  if (isWhatsAppSessionOpen(lastClientMessageAt)) {
    const ms = msSinceLastClientMessage(lastClientMessageAt);
    const h = ms != null ? Math.floor(ms / 3_600_000) : 0;
    return `abierta (~${h}h desde último mensaje del cliente)`;
  }
  return "cerrada (>23h sin mensaje del cliente — requiere plantilla de pago)";
}

export function allowPaidWhatsAppTemplates(): boolean {
  const raw = process.env["WHATSAPP_ALLOW_PAID_TEMPLATES"]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function getFollowupTemplateName(): string | null {
  return process.env["WHATSAPP_TEMPLATE_FOLLOWUP"]?.trim() || null;
}

export function getTemplateLanguage(): string {
  return process.env["WHATSAPP_TEMPLATE_LANG"]?.trim() || "es_MX";
}

export function getClientActivityTime(conv: {
  lastClientMessageAt?: Date | string | null;
  updatedAt?: Date | string;
}): Date | null {
  return parseMessageTime(conv.lastClientMessageAt) ?? parseMessageTime(conv.updatedAt);
}

/** True si conviene renovar ventana (último mensaje cliente hace 21–23h). */
export function shouldRenewWhatsAppWindow(
  lastClientMessageAt: Date | string | null | undefined,
  lastRenewalAt: Date | string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const last = parseMessageTime(lastClientMessageAt);
  if (!last || !isWhatsAppSessionOpen(last, nowMs)) return false;

  const ms = nowMs - last.getTime();
  const h21 = 21 * 3_600_000;
  const h23 = WA_SAFE_SESSION_MS;
  if (ms < h21 || ms >= h23) return false;

  const renewal = parseMessageTime(lastRenewalAt);
  if (renewal && nowMs - renewal.getTime() < 20 * 3_600_000) return false;

  return true;
}
