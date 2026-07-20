/**
 * Filtro global de anti-repetición — última malla antes de WhatsApp.
 * Cubre respuestas directas, de venta, cierre y post-cierre que se saltan
 * los guards internos de applyLucyMessageGuards.
 */
import type OpenAI from "openai";
import type { ExtractedData } from "./types.js";
import {
  buildPostCierreThanksReply,
  isFieldSatisfied,
  mensajeAsksForField,
  mensajeAsksForFilledField,
  type PendingField,
} from "./lucy-flow-guards.js";

const FIELD_ORDER: PendingField[] = [
  "nombre",
  "correo",
  "tipo_evento",
  "requerimientos",
  "invitados",
  "zona",
  "fecha",
  "presupuesto",
];

const ALGO_MAS_PATTERN =
  /\b(algo\s+m[aá]s|hay\s+algo\s+m[aá]s|alg[uú]n\s+otro\s+servicio|quieres\s+agregar|deseas\s+agregar)\b/i;

const THANKS_ACK_PATTERN =
  /\b(con\s+gusto|nuestro\s+equipo\s+ya\s+tiene|si\s+necesitas\s+algo\s+m[aá]s|aqu[ií]\s+estamos)\b/i;

const SERVICES_MENU_PATTERN =
  /\b(manejamos|tambi[eé]n\s+(ofrecemos|manejamos)|alimentos?|mobiliario|carpas?|pista|iluminaci[oó]n|pantallas?)\b/i;

export interface LucyAntiRepeatInput {
  mensaje: string;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  filledSet?: Set<string>;
  extracted?: Partial<ExtractedData> | null;
  currentMessage?: string;
  cierreYaEnviado?: boolean;
  clientName?: string | null;
}

export interface LucyAntiRepeatResult {
  mensaje: string;
  /** Motivos aplicados (para logs/selftests). */
  applied: string[];
}

/** Overlap de palabras (>3 chars). 1 = idéntico. */
export function lucyTextOverlapRatio(a: string, b: string): number {
  const na = normalizeForOverlap(a);
  const nb = normalizeForOverlap(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (!wordsA.size || !wordsB.size) return 0;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  return shared / Math.max(wordsA.size, wordsB.size);
}

function normalizeForOverlap(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recentAssistantTexts(
  history: OpenAI.Chat.ChatCompletionMessageParam[] | undefined,
  limit = 6
): string[] {
  if (!history?.length) return [];
  return history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .map((m) => (m.content as string).trim())
    .filter(Boolean)
    .slice(-limit);
}

function asExtracted(partial?: Partial<ExtractedData> | null): ExtractedData {
  return {
    tipo_contacto: partial?.tipo_contacto ?? null,
    nombre: partial?.nombre ?? null,
    empresa: partial?.empresa ?? null,
    telefono: partial?.telefono ?? null,
    correo: partial?.correo ?? null,
    presupuesto: partial?.presupuesto ?? null,
    direccion_evento: partial?.direccion_evento ?? null,
    requerimientos_evento: partial?.requerimientos_evento ?? null,
    fecha_horario: partial?.fecha_horario ?? null,
    num_invitados: partial?.num_invitados ?? null,
    tipo_evento: partial?.tipo_evento ?? null,
    modo_servicio: partial?.modo_servicio ?? null,
  };
}

function stripRepeatedQuestionLines(mensaje: string, previous: string[]): string {
  const lines = mensaje
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return mensaje.trim();

  const kept = lines.filter((line) => {
    if (!line.includes("?")) return true;
    return !previous.some((p) => lucyTextOverlapRatio(line, p) >= 0.72);
  });
  if (kept.length === 0) return lines[lines.length - 1]!;
  return kept.join("\n").trim();
}

function shortPostCierreAck(clientName?: string | null, thanks = false): string {
  const nombre = clientName?.trim();
  if (thanks) {
    return nombre
      ? `¡Con gusto, ${nombre}! Aquí seguimos cuando lo necesites.`
      : "¡Con gusto! Aquí seguimos cuando lo necesites.";
  }
  return nombre
    ? `Queda anotado, ${nombre}. Nuestro equipo sigue con tu cotización.`
    : "Queda anotado. Nuestro equipo sigue con tu cotización.";
}

/**
 * Última malla anti-repetición. Idempotente: si no hay solape ni re-pregunta, no toca el mensaje.
 */
export function applyLucyGlobalAntiRepetition(input: LucyAntiRepeatInput): LucyAntiRepeatResult {
  let mensaje = (input.mensaje ?? "").trim();
  const applied: string[] = [];
  if (!mensaje) return { mensaje, applied };

  const previous = recentAssistantTexts(input.history);
  const filled = input.filledSet ?? new Set<string>();
  const extracted = asExtracted(input.extracted);
  const cierre = !!input.cierreYaEnviado;
  const nombre = input.clientName ?? extracted.nombre;

  // 1) Post-cierre: no repetir el mismo agradecimiento.
  if (cierre && THANKS_ACK_PATTERN.test(mensaje) && previous.some((p) => THANKS_ACK_PATTERN.test(p))) {
    const lastThanks = [...previous].reverse().find((p) => THANKS_ACK_PATTERN.test(p));
    if (lastThanks && lucyTextOverlapRatio(mensaje, lastThanks) >= 0.55) {
      mensaje = shortPostCierreAck(nombre, true);
      applied.push("postcierre-thanks-dedupe");
    }
  }

  // 2) Post-cierre: no insistir otra vez con "¿algo más?".
  if (cierre && ALGO_MAS_PATTERN.test(mensaje)) {
    const prevAlgoMas = previous.filter((p) => ALGO_MAS_PATTERN.test(p));
    if (prevAlgoMas.length >= 1 && prevAlgoMas.some((p) => lucyTextOverlapRatio(mensaje, p) >= 0.5)) {
      mensaje = shortPostCierreAck(nombre, false);
      applied.push("postcierre-algo-mas-dedupe");
    }
  }

  // 3) Re-pregunta de campo ya capturado (aunque el cuerpo sea distinto).
  // No tocar respuestas de catálogo: "menús e inclusiones" / Incluye / link bodasesor
  // matchean el patrón de requerimientos y se destruían con "Ya lo tengo anotado".
  const clientAskedInclusion =
    /\bqu[eé]\s+incluye|\bdescripci[oó]n(es)?\b|\bmen[uú]s?\b|\bdetalle\b|\bqu[eé]\s+trae|\bqu[eé]\s+lleva/i.test(
      input.currentMessage ?? ""
    );
  const isCatalogDetailReply =
    /\bincluye\s*:|bodasesor\.com\/catalogos|qu[eé]\s+incluye\s+cada|detalle completo de men[uú]s|niveles?\s*:|cu[aá]l nivel prefieres|te dejo el cat[aá]logo|mande el cat[aá]logo|shows?\s+en\s+vivo|hora\s+loca|maestro\s+de\s+ceremonias/i.test(
      mensaje
    );
  if (
    !cierre &&
    !isCatalogDetailReply &&
    !clientAskedInclusion &&
    mensajeAsksForFilledField(mensaje, filled, extracted)
  ) {
    const stripped = mensaje
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (!t) return false;
        for (const field of FIELD_ORDER) {
          if (isFieldSatisfied(field, filled, extracted) && mensajeAsksForField(t, field)) {
            return false;
          }
        }
        return true;
      })
      .join("\n")
      .trim();
    if (stripped && stripped !== mensaje) {
      mensaje = stripped;
      applied.push("filled-field-strip");
    } else if (!stripped || mensajeAsksForFilledField(mensaje, filled, extracted)) {
      // Si solo quedaba la re-pregunta, acuse corto sin volver a pedir el dato.
      mensaje = nombre
        ? `Perfecto, ${nombre}. Ya lo tengo anotado.`
        : "Perfecto, ya lo tengo anotado.";
      applied.push("filled-field-ack");
    }
  }

  // 4) Casi idéntico a una respuesta reciente del asistente.
  // No tocar pitch de show/MC + catálogo (A14920): "manejamos" solapa con menús previos.
  if (!isCatalogDetailReply && previous.length > 0) {
    const maxOverlap = Math.max(...previous.map((p) => lucyTextOverlapRatio(mensaje, p)));
    if (maxOverlap >= 0.72) {
      const trimmed = stripRepeatedQuestionLines(mensaje, previous);
      if (trimmed && lucyTextOverlapRatio(trimmed, previous[previous.length - 1]!) < 0.65) {
        mensaje = trimmed;
        applied.push("near-duplicate-trim");
      } else if (cierre) {
        mensaje = shortPostCierreAck(nombre, THANKS_ACK_PATTERN.test(mensaje));
        applied.push("near-duplicate-postcierre");
      } else {
        // Evita reenviar el mismo bloque: deja un acuse + la pregunta distinta si existe.
        const q = mensaje
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.includes("?"))
          .find((l) => previous.every((p) => lucyTextOverlapRatio(l, p) < 0.68));
        if (q) {
          mensaje = q;
          applied.push("near-duplicate-keep-question");
        } else {
          mensaje = nombre
            ? `Entendido, ${nombre}. Seguimos con lo que ya platicamos.`
            : "Entendido. Seguimos con lo que ya platicamos.";
          applied.push("near-duplicate-ack");
        }
      }
    }
  }

  // 5) Segundo menú genérico de servicios en historial reciente.
  // Excluir entretenimiento + link de catálogo (A14920 Karina): si no, "manejamos
  // maestro de ceremonias… + catálogo" se reduce a solo la pregunta de zona.
  if (
    !cierre &&
    !isCatalogDetailReply &&
    SERVICES_MENU_PATTERN.test(mensaje) &&
    /¿/.test(mensaje) &&
    previous.some((p) => SERVICES_MENU_PATTERN.test(p) && /¿/.test(p))
  ) {
    const qOnly = mensaje
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes("?") && !SERVICES_MENU_PATTERN.test(l));
    if (qOnly.length) {
      mensaje = qOnly[qOnly.length - 1]!;
      applied.push("services-menu-dedupe");
    }
  }

  return { mensaje: mensaje.trim(), applied };
}

/** Atajo: solo el texto final. */
export function filterLucyAntiRepetition(input: LucyAntiRepeatInput): string {
  return applyLucyGlobalAntiRepetition(input).mensaje;
}
