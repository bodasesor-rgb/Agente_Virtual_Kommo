import type { ExtractedData } from "./types.js";

/**
 * Normaliza typos frecuentes (provedor → proveedor) para matching.
 */
export function normalizeProveedorText(text: string): string {
  return (text ?? "")
    .replace(/\bprovedores?\b/gi, (m) => (m.toLowerCase().endsWith("s") ? "proveedores" : "proveedor"))
    .replace(/\bprovvedores?\b/gi, (m) => (m.toLowerCase().endsWith("s") ? "proveedores" : "proveedor"));
}

/**
 * Señales fuertes de que OFRECE algo a Bodasesor (proveedor / alianza / venue).
 * Incluye invitaciones a "red de aliados" (A14936 Lety — Hacienda).
 * A16121: "nos gustaría ser uno de sus provedores" / typo provedor.
 */
const PROVEEDOR_SELL =
  /\b(les\s+ofrezco|ofrecemos\s+a\s+ustedes|soy\s+proveedor|somos\s+proveedores|quiero\s+venderles|busco\s+clientes|manejo\s+.+\s+y\s+busco\s+clientes|distribuidor\s+de|mi\s+empresa\s+ofrece|vendo\s+.+\s+a\s+eventos)\b/i;

/** Invitación a alianza / red de proveedores / venue B2B (no pide cotización a Lucy). */
const PROVEEDOR_ALLIANCE =
  /\b(red\s+de\s+aliados|aliados?\s+comerciales?|alianza\s+comercial|aliado\s+comercial|registrarte\s+en\s+nuestra\s+base|invitarte\s+a\s+registrarte|te\s+invito\s+a\s+registrarte|ser\s+parte\s+de\s+nuestra\s+red|sumarte\s+a\s+(nuestra\s+)?red|formar\s+parte\s+de\s+nuestra\s+red|proveedores?\s+aliados?|cat[aá]logo\s+de\s+proveedores|beneficios\s+y\s+tarifas.{0,80}(?:venue|hacienda|sal[oó]n)|ejecutiv[oa]\s+de\s+ventas\s+en\s+(?:hacienda|sal[oó]n|venue|hotel)|nuestro\s+venue|red\s+de\s+proveedores|quiero\s+ser\s+proveedor|ofrecerles\s+(nuestro|mis|nuestros)|los\s+invito\s+a\s+(conocer|registr|formar)|invitarlos\s+a\s+(nuestra|formar|registr))\b/i;

/** A16121: "ser (uno de) sus proveedores" / "nos gustaría ser proveedor". */
const PROVEEDOR_BECOME =
  /\b((nos\s+|me\s+)?(gustar[ií]a|dese[oa]mos?|queremos|quiero|quisiera)\s+ser(\s+uno\s+de)?\s+(sus\s+|los\s+|vuestros\s+)?proveedores?|ser(\s+uno\s+de)?\s+(sus\s+|los\s+)?proveedores?|como\s+(su\s+|uno\s+de\s+sus\s+)?proveedores?|unirme\s+como\s+proveedor|registrarme\s+como\s+proveedor)\b/i;

export const PROVEEDOR_OFFER = new RegExp(
  `(?:${PROVEEDOR_SELL.source})|(?:${PROVEEDOR_ALLIANCE.source})|(?:${PROVEEDOR_BECOME.source})`,
  "i"
);

/** Pide/compra servicio — es CLIENTE aunque mencione empresa o producto. */
const CLIENTE_BUY =
  /\b(solicit[oa]\s+(una\s+)?cotizaci[oó]n|quiero\s+cotizar|necesito\s+(servicio|cotiz|un\s+|una\s+)|requiero\s+(servicio|cotiz)|me\s+das\s+precio|me\s+interesa\s+contratar|busco\s+(servicio|cotiz|proveedor\s+de\s+catering|banquete|taquiza|caf[eé])|cotizaci[oó]n\s+de|precio\s+de|para\s+mi\s+(boda|evento|xv|fiesta)|mi\s+boda|nuestro\s+evento)\b/i;

export function looksLikeProveedorOutreach(text: string): boolean {
  if (!text?.trim()) return false;
  const n = normalizeProveedorText(text);
  if (CLIENTE_BUY.test(n)) return false;
  return PROVEEDOR_OFFER.test(n);
}

/** A16075: el contacto aclara que es cliente (no proveedor). */
export function looksLikeClienteCorrection(text: string | null | undefined): boolean {
  const t = normalizeProveedorText((text ?? "").trim());
  if (!t) return false;
  if (
    /\b(no\s+soy\s+proveedor|no\s+somos\s+proveedores|me\s+confund[ií]|soy\s+cliente|somos\s+clientes|yo\s+no\s+vendo)\b/i.test(
      t
    )
  ) {
    return true;
  }
  return CLIENTE_BUY.test(t);
}

/**
 * Resuelve tipo de contacto.
 * - Compra/cotización explícita → cliente (Saint-Gobain café, etc.)
 * - Oferta / alianza / venue invite → proveedor
 * - LLM dijo proveedor pero sin señal → cliente (evita falsos positivos)
 * - Señal fuerte de proveedor → proveedor aunque el LLM diga cliente
 * - A16075: corrección "no soy proveedor" / cotizar evento → cliente
 */
export function resolveTipoContacto(
  extracted: ExtractedData["tipo_contacto"],
  conversationText: string,
  latestMessage?: string | null
): "cliente" | "proveedor" | null {
  const text = normalizeProveedorText(conversationText.trim());
  const latest = normalizeProveedorText((latestMessage ?? "").trim());
  if (!text && !latest) return extracted === "incierto" ? "cliente" : extracted;

  // Último mensaje gana si aclara que es cliente.
  if (latest && looksLikeClienteCorrection(latest)) return "cliente";
  if (CLIENTE_BUY.test(text) && !PROVEEDOR_OFFER.test(latest || text)) return "cliente";
  if (latest && PROVEEDOR_OFFER.test(latest) && !CLIENTE_BUY.test(latest)) return "proveedor";
  if (PROVEEDOR_OFFER.test(text) && !CLIENTE_BUY.test(text)) return "proveedor";

  if (extracted === "proveedor" && !PROVEEDOR_OFFER.test(text) && !PROVEEDOR_OFFER.test(latest)) {
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
