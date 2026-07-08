/**
 * Evita que Lucy invente precios para servicios sin tarifa en catálogo.
 * Solo servicios listados en catalogo.ts (alimentos, barras con $/pp, etc.) pueden citarse.
 */

/** Servicios sin precio publicado — Alejandro cotiza. */
const NO_LISTED_PRICE_PATTERN =
  /\bdj\b|disc\s*jockey|iluminaci[oó]n|mobiliario|carpas?|lonas?|toldos?|pantallas?|led\s*wall|pista(\s+de\s+baile)?|tarimas?|estructuras?|inflables?|soft\s*play|florister[ií]a|flores|decoraci[oó]n\s+floral|audio|sonido|valet|niñeras?|valet\s+parking/i;

/** Servicios con precios en catálogo (pueden mencionarse si el dato coincide). */
const LISTED_PRICE_PATTERN =
  /banquete|taquiza|parrillada|barra\s+(de\s+)?(bebidas?|alimentos?|caf[eé]|pizzas?|sushi|crepas?|mariscos?|pastas?)|mesa\s+de\s+dulces|cocteler[ií]a|mixolog[ií]a|coffee\s*break|brunch|paella|m[oó]cteles?|canap[eé]s|pozole|americana|kosher|navide[nñ]o/i;

const PRICE_CLAIM_PATTERN =
  /\$\s*[\d,.]+(?:\s*\/\s*pp)?|\b[\d,.]+\s*(?:mil|k)\b(?:\s*pesos?)?|\bentre\s*\$?\s*[\d,.]+\s*y\s*\$?\s*[\d,.]+|\bdesde\s*\$[\d,.]+|\b[\d,.]+\s*pesos?\b/i;

const PRICE_QUESTION_PATTERN =
  /\bcu[aá]nto\s+cuesta|\bprecio\b|\bcosto\b|\bm[aá]s\s+o\s+menos\s+cu[aá]nto|\bcu[aá]nto\s+sale|\bcu[aá]nto\s+cobran|\btarifa\b/i;

export function clientAsksPrice(message?: string): boolean {
  if (!message?.trim()) return false;
  return PRICE_QUESTION_PATTERN.test(message);
}

export function mentionsNoListedPriceService(text: string): boolean {
  return NO_LISTED_PRICE_PATTERN.test(text);
}

export function mentionsListedPriceService(text: string): boolean {
  return LISTED_PRICE_PATTERN.test(text);
}

/** True si el mensaje afirma un monto monetario. */
export function messageClaimsPrice(mensaje: string): boolean {
  return PRICE_CLAIM_PATTERN.test(mensaje);
}

/**
 * True si Lucy está dando precios que no debe (ej. DJ $3,000–$5,000).
 */
export function responseHasInventedPrice(
  mensaje: string,
  currentMessage?: string,
  recentContext?: string
): boolean {
  if (!messageClaimsPrice(mensaje)) return false;

  const ctx = `${currentMessage ?? ""} ${mensaje} ${recentContext ?? ""}`.toLowerCase();

  if (mentionsNoListedPriceService(ctx)) return true;

  // Precio genérico sin servicio de catálogo claro — sospechoso
  if (!mentionsListedPriceService(ctx) && messageClaimsPrice(mensaje)) {
    return true;
  }

  return false;
}

function detectServiceLabel(text: string): string {
  const t = text.toLowerCase();
  if (/\bdj\b/.test(t)) return "DJ";
  if (/iluminaci[oó]n/.test(t)) return "iluminación";
  if (/mobiliario/.test(t)) return "mobiliario";
  if (/carpas?|lonas?/.test(t)) return "carpas";
  if (/pantallas?/.test(t)) return "pantallas";
  if (/pista(\s+de\s+baile)?|tarimas?/.test(t)) return "pista de baile";
  if (/flor/.test(t)) return "floristería";
  return "ese servicio";
}

/** Quita oraciones con montos inventados. */
export function stripPriceSentences(mensaje: string): string {
  const sentences = mensaje.split(/(?<=[.!?])\s+|\n+/);
  const kept = sentences.filter((s) => !PRICE_CLAIM_PATTERN.test(s));
  return kept.join(" ").replace(/\s{2,}/g, " ").trim();
}

export function stripStalePriceTalk(mensaje: string, currentMessage?: string): string {
  if (!currentMessage?.trim() || clientAsksPrice(currentMessage)) return mensaje;
  if (/\bdj\b|precio|cu[aá]nto\s+cuesta/i.test(currentMessage)) return mensaje;
  return mensaje
    .replace(/[^.!?\n]*\b(dj|precio)[^.!?\n]*alejandro[^.!?\n]*[.!?]?\s*/gi, "")
    .replace(/[^.!?\n]*alejandro te (incluye|da) el precio[^.!?\n]*[.!?]?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildAlejandroPriceReply(serviceHint?: string): string {
  const svc = serviceHint?.trim() || "ese servicio";
  return `Sí, manejamos ${svc}. El precio exacto depende del evento — Alejandro te lo incluye en tu cotización personalizada.`;
}

/**
 * Reemplaza precios inventados por respuesta segura.
 * Si el cliente preguntó precio de un servicio sin tarifa en catálogo, no se cita monto.
 */
export function sanitizeInventedPrices(
  mensaje: string,
  currentMessage?: string,
  recentContext?: string
): string {
  if (!responseHasInventedPrice(mensaje, currentMessage, recentContext)) {
    return mensaje;
  }

  const ctx = `${currentMessage ?? ""} ${mensaje} ${recentContext ?? ""}`;
  const service = detectServiceLabel(ctx);
  const cleaned = stripPriceSentences(mensaje);

  const safe = buildAlejandroPriceReply(service);

  if (!cleaned || cleaned.length < 15) return safe;

  // Conservar texto útil sin precios + aclaración
  const withoutCorreoInsist = cleaned.replace(/[^.!?\n]*correo[^.!?\n]*\?[^.!?\n]*/gi, "").trim();
  const base = withoutCorreoInsist.length > 20 ? withoutCorreoInsist : "";
  if (base && !/alejandro/i.test(base)) {
    return `${base} ${safe}`.trim();
  }
  return safe;
}
