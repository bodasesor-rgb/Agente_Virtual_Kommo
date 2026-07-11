import type { ExtractedData } from "./types.js";

/** Señales fuertes de que OFRECE algo a Bodasesor (proveedor). */
const PROVEEDOR_OFFER =
  /\b(les\s+ofrezco|ofrecemos\s+a\s+ustedes|soy\s+proveedor|quiero\s+venderles|busco\s+clientes|manejo\s+.+\s+y\s+busco\s+clientes|distribuidor\s+de|mi\s+empresa\s+ofrece|vendo\s+.+\s+a\s+eventos)\b/i;

/** Pide/compra servicio — es CLIENTE aunque mencione empresa o producto. */
const CLIENTE_BUY =
  /\b(solicit[oa]\s+(una\s+)?cotizaci[oó]n|quiero\s+cotizar|necesito\s+(servicio|cotiz|un\s+|una\s+)|requiero\s+(servicio|cotiz)|me\s+das\s+precio|me\s+interesa\s+contratar|busco\s+(servicio|cotiz|proveedor\s+de\s+catering|banquete|taquiza|caf[eé])|cotizaci[oó]n\s+de|precio\s+de)\b/i;

/**
 * Resuelve tipo de contacto con regla: ante la duda → CLIENTE.
 * Mencionar Saint-Gobain u otra empresa grande NO es proveedor.
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
