/**
 * Evita que Lucy invente precios para servicios sin tarifa en catálogo.
 * Solo servicios listados en catalogo.ts (alimentos, barras con $/pp, etc.) pueden citarse.
 * Excepción: montos que aparecen en PDFs del panel Aprendizaje (lucyInfoPriceCache).
 */

import {
  buildLucyInfoLearnedPriceReply,
  lucyInfoSupportsPriceClaim,
} from "./services/lucyInfoPriceCache.js";

/** Servicios sin precio publicado — Alejandro cotiza (fallback estático). */
const NO_LISTED_PRICE_PATTERN =
  /\bdj\b|disc\s*jockey|iluminaci[oó]n|mobiliario|mesas?|sillas?|periqueras?|salas?\s*(lounge)?|carpas?|lonas?|toldos?|pantallas?|led\s*wall|pista(\s+de\s+baile)?|tarimas?|estructuras?|inflables?|soft\s*play|florister[ií]a|flores|decoraci[oó]n\s+floral|audio|sonido|valet|niñeras?|valet\s+parking/i;

/** Servicios con precios en catálogo (fallback estático). */
const LISTED_PRICE_PATTERN =
  /banquete|taquiza|parrillada|barra\s+(de\s+)?(bebidas?|alimentos?|caf[eé]|pizzas?|sushi|crepas?|mariscos?|pastas?)|mesa\s+de\s+dulces|cocteler[ií]a|mixolog[ií]a|coffee\s*break|brunch|paella|m[oó]cteles?|canap[eé]s|pozole|americana|kosher|navide[nñ]o/i;

let dynamicListedPattern: RegExp | null = null;
let dynamicNoListedPattern: RegExp | null = null;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildServicePattern(labels: string[]): RegExp | null {
  const terms = labels
    .map((label) => label.trim().toLowerCase())
    .filter((label) => label.length >= 2)
    .map((label) => escapeRegex(label).replace(/\s+/g, "\\s+"));

  if (!terms.length) return null;
  return new RegExp(`\\b(?:${terms.join("|")})\\b`, "i");
}

/** Actualiza índice de precios desde Google Sheets (vía catalogService). */
export function setCatalogPriceIndex(priced: string[], noPrice: string[]): void {
  dynamicListedPattern = buildServicePattern(priced);
  dynamicNoListedPattern = buildServicePattern(noPrice);
}

const PRICE_CLAIM_PATTERN =
  /\$\s*[\d,.]+(?:\s*\/\s*pp)?|\b[\d,.]+\s*(?:mil|k)\b(?:\s*pesos?)?|\bentre\s*\$?\s*[\d,.]+\s*y\s*\$?\s*[\d,.]+|\bdesde\s*\$[\d,.]+|\b[\d,.]+\s*pesos?\b/i;

const PRICE_QUESTION_PATTERN =
  /\bcu[aá]nto\s+cuesta|\bprecios?\b|\bcostos?\b|\bm[aá]s\s+o\s+menos\s+cu[aá]nto|\bcu[aá]nto\s+sale|\bcu[aá]nto\s+cobran|\btarifa\b|\bver\s+(los\s+)?precios?\b|\bpasar?(me)?\s+(los\s+)?precios?\b/i;

/**
 * Cliente pregunta el precio de un servicio concreto (SKU / lista).
 * No aplica a RFQs largos ni a "precio distribuidor" (eso lo cotiza el equipo).
 */
export function clientAsksPrice(message?: string): boolean {
  if (!message?.trim()) return false;
  if (!PRICE_QUESTION_PATTERN.test(message)) return false;
  // Briefs multi-línea con "rangos de precio" / "precio distribuidor" no son pregunta de SKU.
  if (message.trim().length > 220 && /\b(cotiz|propuestas?|opci[oó]n\s*[123]|distribuidor)\b/i.test(message)) {
    return false;
  }
  if (/\bprecio\s+(para\s+)?distribuidor\b/i.test(message)) return false;
  if (/\bmejor\s+precio\s+(para\s+)?distribuidor\b/i.test(message)) return false;
  if (/\brangos?\s+de\s+precio\b/i.test(message) && /\b(propuestas?|opci[oó]n|men[uú])\b/i.test(message)) {
    return false;
  }
  return true;
}

export function mentionsNoListedPriceService(text: string): boolean {
  if (dynamicNoListedPattern?.test(text)) return true;
  return NO_LISTED_PRICE_PATTERN.test(text);
}

export function mentionsListedPriceService(text: string): boolean {
  if (dynamicListedPattern?.test(text)) return true;
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

  // Precios que ya están en PDFs del panel Aprendizaje = conocimiento real, no invento.
  if (lucyInfoSupportsPriceClaim(mensaje)) return false;

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
  if (/periqueras?/.test(t)) return "periqueras";
  if (/mesas?/.test(t) && /sillas?/.test(t)) return "mesas y sillas";
  if (/mesas?/.test(t)) return "mesas";
  if (/sillas?/.test(t)) return "sillas";
  if (/salas?\s*lounge|lounge/.test(t)) return "salas lounge";
  if (/mobiliario/.test(t)) return "mobiliario";
  if (/carpas?|lonas?/.test(t)) return "carpas";
  if (/pantallas?/.test(t)) return "pantallas";
  if (/pista(\s+de\s+baile)?|tarimas?/.test(t)) return "pista de baile";
  if (/flor/.test(t)) return "floristería";
  return "ese servicio";
}

export function getPriceServiceLabel(text: string): string {
  return detectServiceLabel(text);
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
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((s) => !/\bdj\b/i.test(s) || clientAsksPrice(currentMessage))
    .filter((s) => !/alejandro te (incluye|da) el precio/i.test(s))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

import { advisorLabelForClient } from "./lib/bodasesorAdvisor.js";

/** Respuesta consultiva (Replit) para servicios sin precio en catálogo — info útil + cotización. */
export function buildConsultativeNoPriceReply(message?: string): string | null {
  if (!message?.trim()) return null;
  const t = message.toLowerCase();
  const team = advisorLabelForClient();

  // Si el panel ya cargó el PDF de ese servicio, citar precios aprendidos (no “sin tarifa”).
  if (/pista(\s+de\s+baile)?|tarimas?\b|periqueras?|mesas?|sillas?|mobiliario|salas?\s*lounge|luxor/.test(t)) {
    const fromPdf = buildLucyInfoLearnedPriceReply(message);
    if (fromPdf) return fromPdf;
  }

  if (/\bcarpas?\b|lonas?\b|toldos?\b/.test(t)) {
    const transparent = /transparent/i.test(t);
    const head = transparent
      ? "Sí, contamos con *carpas transparentes* (y también Cathedral, Pirámide y Planas)."
      : "Sí, manejamos carpas para jardín o terraza: Cathedral (techos altos), Pirámide, Planas y transparentes.";
    return (
      `${head} Se cotizan según medidas, montaje y sede. ` +
      `${team} arma el precio. ¿Quieres que las agregue a tu cotización? ¿Qué medidas aproximadas necesitas?`
    );
  }
  if (/\bdj\b|disc\s*jockey|audio\b|sonido\b/.test(t)) {
    return (
      `El DJ incluye equipo completo, micrófono para brindis e iluminación básica; puedes mandar playlist. ` +
      `${team} incluirá el precio en tu cotización. ¿Ya tienes estilo de música o prefieres que lea el ambiente?`
    );
  }
  if (/iluminaci[oó]n/.test(t)) {
    return (
      `Opciones: uplighting LED en paredes, luces colgantes tipo edison o luces de pista. ` +
      `${team} cotiza según el espacio. ¿Qué ambiente buscas: elegante, romántico o fiesta?`
    );
  }
  if (/pista(\s+de\s+baile)?|tarimas?\b/.test(t)) {
    return (
      `Sí, manejamos pistas de baile y tarimas en varios tamaños, con opción iluminada. ` +
      `${team} cotiza según las medidas. ¿Quieres que lo agregue a tu cotización? ¿Qué medidas aproximadas tiene el espacio?`
    );
  }
  if (/periqueras?|mesas?\s+(peque[nñ]as?|tipo\s+bar)|mesas?\s+periqueras?/.test(t)) {
    return (
      `Sí, rentamos periqueras y mesas tipo bar en distintos acabados. ` +
      `El precio depende de cantidad, estilo y si llevan montaje en sitio. ` +
      `${team} cotiza según lo que necesites. ¿Cuántas periqueras/mesas necesitas y para cuándo?`
    );
  }
  if (/mesas?|sillas?|mobiliario|salas?\s*lounge/.test(t)) {
    return (
      `Manejamos mesas, sillas, periqueras y salas lounge para eventos en distintos estilos. ` +
      `${team} cotiza según cantidad y tipo. ¿Qué mobiliario necesitas y para cuántas personas?`
    );
  }
  return null;
}

export function buildAlejandroPriceReply(serviceHint?: string, clientMessage?: string): string {
  const consultative = clientMessage ? buildConsultativeNoPriceReply(clientMessage) : null;
  if (consultative) return consultative;

  const svc = serviceHint?.trim() || "ese servicio";
  const team = advisorLabelForClient();
  return `Sí, manejamos ${svc}. El precio depende del evento — ${team} te lo incluye en tu cotización.`;
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

  const safe = buildAlejandroPriceReply(service, currentMessage);

  if (!cleaned || cleaned.length < 15) return safe;

  // Conservar texto útil sin precios + aclaración
  const withoutCorreoInsist = cleaned.replace(/[^.!?\n]*correo[^.!?\n]*\?[^.!?\n]*/gi, "").trim();
  const base = withoutCorreoInsist.length > 20 ? withoutCorreoInsist : "";
  if (base && !/alejandro/i.test(base)) {
    return `${base} ${safe}`.trim();
  }
  return safe;
}
