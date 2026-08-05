/**
 * Plantillas post-cierre (ack cortos, pago/anticipo, gracias).
 * La orquestación sigue en applyLucyMessageGuards; aquí solo el copy estable.
 */
import { sanitizeDisplayName } from "../contact-name.js";

/** Cliente pide cotización / anticipo / datos de pago (post-cierre → equipo). */
export function clientAsksPaymentOrQuoteDelivery(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /\b(anticipo|50\s*%|porcentaje|dep[oó]sito|se[nñ]a)\b/i.test(t) ||
    /\b(donde|dónde|a\s+d[oó]nde)\s+(mando|deposit|transfer|pag)/i.test(t) ||
    /\b(manda|env[ií]a|pasa).{0,30}\b(presupuesto|cotizaci[oó]n|datos\s+de\s+pago)\b/i.test(t) ||
    /\b(presupuesto|cotizaci[oó]n).{0,40}\b(anticipo|pago|transfer)/i.test(t) ||
    /\bdatos\s+(para\s+el\s+)?pago\b/i.test(t)
  );
}

export function buildPostCierreThanksReply(clientName?: string | null): string {
  const nombre = sanitizeDisplayName(clientName);
  return nombre
    ? `¡Con gusto, ${nombre}! Nuestro equipo ya tiene tus datos para la cotización. Si necesitas algo más, aquí estamos.`
    : "¡Con gusto! Nuestro equipo ya tiene tus datos para la cotización. Si necesitas algo más, aquí estamos.";
}

export function buildPostCierrePaymentHandoffReply(clientName?: string | null): string {
  const nombre = sanitizeDisplayName(clientName);
  const hi = nombre ? `${nombre}, ` : "";
  return [
    `Claro que sí, ${hi}nuestro equipo te envía la cotización y los datos para el anticipo (50%) por el correo que ya tenemos.`,
    "En breve te atienden para confirmar montos y forma de pago.",
  ].join(" ");
}

/** Tras pasar teléfonos / pedir llamada: no cerrar otra vez con plantilla genérica. */
export function buildPostCierreCallbackAck(clientName?: string | null): string {
  const nombre = sanitizeDisplayName(clientName);
  return nombre
    ? `Con gusto, ${nombre}. Un asesor te puede atender por esos números; tu caso ya quedó con el equipo.`
    : "Con gusto. Un asesor te puede atender por esos números; tu caso ya quedó con el equipo.";
}
