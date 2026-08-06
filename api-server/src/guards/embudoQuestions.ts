/**
 * Variantes de preguntas del embudo + helpers de menú de servicios.
 * Extraído de lucy-flow-guards para que salesReplies (y otros) no ciclen.
 */
import type OpenAI from "openai";
import { advisorLabelForClient } from "../lib/bodasesorAdvisor.js";
import {
  OTRO_SERVICIO_ASK_PATTERN,
  SERVICIOS_CATALOGO_HINT,
  SERVICIOS_CATALOGO_HINT_ADICIONAL,
  type PendingField,
} from "./embudoConstants.js";

/** True si el mensaje ya menciona opciones del catálogo (evita repetir el bloque). */
export function mensajeMencionaCatalogoServicios(mensaje: string): boolean {
  return /alimentos?|mobiliario|carpas?|pistas?(\s+de\s+baile)?|bebidas?|banquete|taquiza|iluminaci[oó]n|pantallas?|mesas?\s+de\s+dulces|dj\b|barras?\s+(de\s+)?alimentos|estaciones?\s+de\s+comida/i.test(
    mensaje
  );
}

/** Lista genérica de servicios / "¿otro servicio?" — para cortar el bucle anti-menú. */
export function looksLikeServicesMenuDump(text: string): boolean {
  if (!text?.trim()) return false;
  const t = text.toLowerCase();
  if (OTRO_SERVICIO_ASK_PATTERN.test(t)) return true;
  if (/tambi[eé]n\s+manejamos\s+(bebidas|alimentos|mobiliario|dj)/i.test(t)) return true;
  if (
    /manejamos\s+(alimentos|bebidas|mobiliario|pistas?|banquetes?).{0,80}(dj|iluminaci|carpas?|pantallas?)/i.test(
      t
    )
  ) {
    return true;
  }
  // Fingerprint del hint hardcodeado (alimentos + mobiliario + DJ/luz).
  if (/alimentos\s+y\s+barras/.test(t) && /mobiliario/.test(t) && /\bdj\b|iluminaci/.test(t)) {
    return true;
  }
  return false;
}

/** True si Lucy ya tiró el menú / "¿otro servicio?" en el historial. */
export function historyAlreadyHadServicesCatalog(
  history?: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  if (!history?.length) return false;
  return history.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      looksLikeServicesMenuDump(m.content as string)
  );
}

export function appendServiciosCatalogoHint(
  pregunta: string,
  adicional = false,
  history?: OpenAI.Chat.ChatCompletionMessageParam[]
): string {
  if (mensajeMencionaCatalogoServicios(pregunta)) return pregunta;
  // No volver a inyectar el catálogo si ya salió en un turno anterior.
  if (historyAlreadyHadServicesCatalog(history)) return pregunta.trim();
  const hint = adicional ? SERVICIOS_CATALOGO_HINT_ADICIONAL : SERVICIOS_CATALOGO_HINT;
  return `${pregunta.trim()} ${hint}`.trim();
}

function getQuestionVariants(): Record<PendingField, string[]> {
  const team = advisorLabelForClient();
  return {
    nombre: [
      "¿Me regalas tu nombre para iniciar?",
      "¿Con quién tengo el gusto?",
      "¿Cómo te llamas?",
    ],
    correo: [
      `Para mandarte la info y que ${team} te arme la propuesta, ¿a qué correo te lo envío?`,
      "¿Me compartes un correo para enviarte los detalles de la cotización?",
      "¿A qué correo te mando la información?",
    ],
    tipo_evento: [
      "¿Qué tipo de celebración es?",
      "¿Qué festejan o qué evento están planeando?",
      "Cuéntame, ¿de qué se trata el evento?",
    ],
    requerimientos: [
      "Platícame, ¿qué tienes pensado para tu evento?",
      "¿Qué servicios te gustaría cotizar?",
      "¿Qué necesitas para el evento?",
    ],
    invitados: [
      "¿Más o menos para cuántas personas sería?",
      "¿Cuántos invitados tienen contemplados?",
      "¿Tienen un estimado de invitados? Si aún no lo saben, sin problema — pueden darme un rango aproximado.",
    ],
    zona: [
      "¿En qué ciudad y colonia (o salón) sería tu evento? Si tienes la dirección exacta, mejor.",
      "¿Me compartes ciudad y colonia o el nombre del salón donde sería?",
      "¿Cuál sería la ubicación del evento? Necesito ciudad y colonia o salón para cotizar bien.",
    ],
    fecha: [
      "¿Ya tienen fecha o todavía la van definiendo?",
      "¿Para cuándo lo tienen pensado?",
      "¿Ya hay día definido o siguen viendo opciones?",
    ],
    presupuesto: [
      "¿Tienen algún rango de presupuesto en mente?",
      "¿Manejan algún presupuesto estimado para el evento?",
      `¿Tienen idea del presupuesto o prefieren que ${team} les proponga opciones?`,
    ],
  };
}

export const FIELD_ASK_PATTERNS: Record<PendingField, RegExp> = {
  nombre: /regalas?\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|con\s+qui[eé]n\s+tengo|tu\s+nombre|me\s+das\s+tu\s+nombre/i,
  correo: /correo|e-?mail|env[ií]o|mandarte|mandar(te)?\s+la\s+info|compartes?\s+un\s+correo/i,
  tipo_evento:
    /festejan|tipo\s+de\s+(evento|celebraci[oó]n)|qu[eé]\s+evento|qu[eé]\s+celebr|de\s+qu[eé]\s+se\s+trata|qu[eé]\s+tipo\s+de\s+celebr/i,
  requerimientos:
    // No usar "menú" suelto: el bloque de catálogo dice "montajes, menús y opciones" (A14924).
    /pensado|servicios?|banquete|taquiza|cotizar|adem[aá]s\s+del|qu[eé]\s+necesitas|qu[eé]\s+buscas|qu[eé]\s+men[uú]|men[uú]\s+(prefieres|te\s+gustar|quieres)|plat[ií]came/i,
  invitados:
    /invitados|personas|gente|cu[aá]ntos|cu[aá]ntas|aproximadamente|m[aá]s\s+o\s+menos|para\s+cu[aá]ntas|ser[ií]an/i,
  zona: /ciudad|direcci[oó]n\s+exacta|d[oó]nde\s+(lo|ser[ií]|ser[aá]|queda|est[aá]n)|en\s+qu[eé]\s+(ciudad|zona|lugar)|lugar|direcci[oó]n|ubicaci[oó]n|zona|sal[oó]n/i,
  fecha: /fecha|cu[aá]ndo|d[ií]a|agenda|definiendo|definido|definir|siguen\s+viendo|opciones\s+de\s+fecha|para\s+cu[aá]ndo/i,
  presupuesto: /presupuesto|estimado|rango|inversi[oó]n|budget|monto/i,
};

export function variantIndex(
  field: PendingField,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number
): number {
  const variants = getQuestionVariants()[field];
  const assistantTurns = history.filter((m) => m.role === "assistant").length;
  const seed = entityId != null ? String(entityId).length : 0;
  return (assistantTurns + seed) % variants.length;
}

export function pickVariant(
  field: PendingField,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number
): string {
  const variants = getQuestionVariants()[field];
  const lastAssistant = history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .slice(-1)[0]?.content as string | undefined;
  const start = variantIndex(field, history, entityId);
  for (let i = 0; i < variants.length; i++) {
    const candidate = variants[(start + i) % variants.length]!;
    if (!lastAssistant || !mensajeAsksForField(lastAssistant, field)) return candidate;
    if (!mensajeAsksForField(candidate, field)) return candidate;
    const snippet = candidate.slice(0, 24);
    if (snippet && !lastAssistant.includes(snippet)) return candidate;
  }
  return variants[start % variants.length]!;
}

export function mensajeAsksForField(mensaje: string, field: PendingField): boolean {
  const questionParts = mensaje
    .split(/[.!]\s+/)
    .map((p) => p.trim())
    .filter((p) => p.includes("?"));
  const toCheck = questionParts.length ? questionParts.join(" ") : mensaje;
  if (!toCheck.includes("?")) return false;
  return FIELD_ASK_PATTERNS[field].test(toCheck);
}
