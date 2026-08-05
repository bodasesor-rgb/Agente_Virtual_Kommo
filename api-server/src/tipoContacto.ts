import type { ExtractedData } from "./types.js";

/**
 * Señales fuertes de que OFRECE algo a Bodasesor (proveedor / alianza / venue).
 * Incluye invitaciones a "red de aliados" (A14936 Lety — Hacienda).
 */
const PROVEEDOR_SELL =
  /\b(les\s+ofrezco|ofrecemos\s+a\s+ustedes|soy\s+proveedor|quiero\s+venderles|busco\s+clientes|manejo\s+.+\s+y\s+busco\s+clientes|distribuidor\s+de|mi\s+empresa\s+ofrece|vendo\s+.+\s+a\s+eventos)\b/i;

/** Invitación a alianza / red de proveedores / venue B2B (no pide cotización a Lucy). */
const PROVEEDOR_ALLIANCE =
  /\b(red\s+de\s+aliados|aliados?\s+comerciales?|alianza\s+comercial|aliado\s+comercial|registrarte\s+en\s+nuestra\s+base|invitarte\s+a\s+registrarte|te\s+invito\s+a\s+registrarte|ser\s+parte\s+de\s+nuestra\s+red|sumarte\s+a\s+(nuestra\s+)?red|formar\s+parte\s+de\s+nuestra\s+red|proveedores?\s+aliados?|cat[aá]logo\s+de\s+proveedores|beneficios\s+y\s+tarifas.{0,80}(?:venue|hacienda|sal[oó]n)|ejecutiv[oa]\s+de\s+ventas\s+en\s+(?:hacienda|sal[oó]n|venue|hotel)|nuestro\s+venue|red\s+de\s+proveedores|quiero\s+ser\s+proveedor|ofrecerles\s+(nuestro|mis|nuestros)|los\s+invito\s+a\s+(conocer|registr|formar)|invitarlos\s+a\s+(nuestra|formar|registr))\b/i;

export const PROVEEDOR_OFFER = new RegExp(
  `(?:${PROVEEDOR_SELL.source})|(?:${PROVEEDOR_ALLIANCE.source})`,
  "i"
);

/** Pide/compra servicio — es CLIENTE aunque mencione empresa o producto. */
const CLIENTE_BUY =
  /\b(solicit[oa]\s+(una\s+)?cotizaci[oó]n|quiero\s+cotizar|necesito\s+(servicio|cotiz|un\s+|una\s+)|requiero\s+(servicio|cotiz)|me\s+das\s+precio|me\s+interesa\s+contratar|busco\s+(servicio|cotiz|proveedor\s+de\s+catering|banquete|taquiza|caf[eé])|cotizaci[oó]n\s+de|precio\s+de|para\s+mi\s+(boda|evento|xv|fiesta)|mi\s+boda|nuestro\s+evento)\b/i;

export function looksLikeProveedorOutreach(text: string): boolean {
  if (!text?.trim()) return false;
  if (CLIENTE_BUY.test(text)) return false;
  return PROVEEDOR_OFFER.test(text);
}

/**
 * Resuelve tipo de contacto.
 * - Compra/cotización explícita → cliente (Saint-Gobain café, etc.)
 * - Oferta / alianza / venue invite → proveedor
 * - LLM dijo proveedor pero sin señal → cliente (evita falsos positivos)
 * - Señal fuerte de proveedor → proveedor aunque el LLM diga cliente
 */
export function resolveTipoContacto(
  extracted: ExtractedData["tipo_contacto"],
  conversationText: string
): "cliente" | "proveedor" | null {
  const text = conversationText.trim();
  if (!text) return extracted === "incierto" ? "cliente" : extracted;

  if (CLIENTE_BUY.test(text)) return "cliente";
  if (PROVEEDOR_OFFER.test(text)) return "proveedor";

  if (extracted === "proveedor" && !PROVEEDOR_OFFER.test(text)) {
    return "cliente";
  }

  if (extracted === "incierto" || !extracted) return "cliente";
  return extracted;
}

export function clientMentionsOwnCompanyEmail(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return /\b(capybaraeventos@gmail\.com|bodasesor@gmail\.com|hola@bodasesor\.com)\b/i.test(text);
}

export function clientAsksIfCompanyEmailCorrect(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.toLowerCase();
  return (
    clientMentionsOwnCompanyEmail(text) ||
    /es\s+el\s+correo\s+correcto|ese\s+correo\s+es\s+correcto|correo\s+correcto|es\s+ese\s+el\s+correo/i.test(
      t
    )
  );
}

export function buildCompanyEmailConfirmReply(): string {
  return (
    "Sí, capybaraeventos@gmail.com es el correo de Bodasesor — tu solicitud ya nos llegó bien. " +
    "Para enviarte la cotización personalizada, ¿me compartes tu correo de trabajo?"
  );
}
