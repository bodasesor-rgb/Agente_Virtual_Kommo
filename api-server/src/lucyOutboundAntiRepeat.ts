/**
 * Filtro global de anti-repetición — última malla antes de WhatsApp.
 * Cubre respuestas directas, de venta, cierre y post-cierre que se saltan
 * los guards internos de applyLucyMessageGuards.
 */
import type OpenAI from "openai";
import type { ExtractedData } from "./types.js";
import { inferLucyAskedField } from "./conversation-understanding.js";
import {
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

const CATALOG_SEND_PATTERN =
  /bodasesor\.com\/catalogos|te dejo el cat[aá]logo general|mande el cat[aá]logo/i;

/** Pitch de entretenimiento/show — no tratar como menú genérico repetido. */
const ENTERTAINMENT_PITCH_PATTERN =
  /shows?\s+en\s+vivo|hora\s+loca|maestro\s+de\s+ceremonias|entretenimiento/i;

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

function firstName(clientName?: string | null): string | null {
  const n = clientName?.trim();
  if (!n) return null;
  return n.split(/\s+/)[0] ?? null;
}

function questionLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.includes("?"));
}

function detectAskedFields(text: string): PendingField[] {
  return FIELD_ORDER.filter((f) => mensajeAsksForField(text, f));
}

function stripRepeatedQuestionLines(mensaje: string, previous: string[]): string {
  const lines = mensaje
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return mensaje.trim();

  const kept = lines.filter((line) => {
    if (!line.includes("?")) return true;
    return !previous.some((p) => lucyTextOverlapRatio(line, p) >= 0.62);
  });
  if (kept.length === 0) return lines[lines.length - 1]!;
  return kept.join("\n").trim();
}

function shortPostCierreAck(clientName?: string | null, thanks = false): string {
  const nombre = firstName(clientName);
  if (thanks) {
    return nombre
      ? `¡Con gusto, ${nombre}! Aquí seguimos cuando lo necesites.`
      : "¡Con gusto! Aquí seguimos cuando lo necesites.";
  }
  return nombre
    ? `Queda anotado, ${nombre}. Nuestro equipo sigue con tu cotización.`
    : "Queda anotado. Nuestro equipo sigue con tu cotización.";
}

/** Quita bloques rotos tipo "Hola, Nicole. con la cotización." */
export function cleanupBrokenOutboundFragments(text: string): string {
  let t = text.trim();
  if (!t) return t;

  // "Hola, X. con la cotización." / "Perfecto, X. para tu evento." (huérfano tras strip)
  t = t.replace(
    /\b((?:Hola|Perfecto|Excelente|Genial|Claro|Listo),?\s+[A-Za-zÁÉÍÓÚáéíóúüñÑ]{2,})\.\s+(con|para|de|en|a|y|la|el|las|los)\s+[^.?!\n]{0,40}\.\s*/gi,
    "$1. "
  );

  // Frase que empieza en minúscula tras un saludo (resto de strip malo)
  t = t.replace(
    /\b((?:Hola|Perfecto|Excelente|Genial|Claro),?\s+[A-Za-zÁÉÍÓÚáéíóúüñÑ]{2,})\.\s+([a-záéíóúüñ])/g,
    (_m, greet: string, letter: string) => `${greet}. ${letter.toUpperCase()}`
  );

  // Doble "Perfecto, Name." seguidos
  t = t.replace(
    /\b((?:Perfecto|Excelente|Genial|Claro),?\s+[A-Za-zÁÉÍÓÚáéíóúüñÑ]{2,}\.)\s+\1/gi,
    "$1"
  );

  return t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function stripCatalogOfferBlock(text: string): string {
  let t = text
    .replace(
      /\n*Te dejo el cat[aá]logo general[^\n]*\n?https?:\/\/\S*bodasesor\.com\/catalogos\S*\n*/gi,
      "\n"
    )
    .replace(/\n*https?:\/\/\S*bodasesor\.com\/catalogos\S*\n*/gi, "\n")
    .replace(/\n*¿Quieres que te mande el cat[aá]logo[^\n?]*\?\n*/gi, "\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function isEntertainmentCatalogReply(mensaje: string): boolean {
  return CATALOG_SEND_PATTERN.test(mensaje) && ENTERTAINMENT_PITCH_PATTERN.test(mensaje);
}

/**
 * Última malla anti-repetición. Idempotente: si no hay solape ni re-pregunta, no toca el mensaje.
 */
export function applyLucyGlobalAntiRepetition(input: LucyAntiRepeatInput): LucyAntiRepeatResult {
  let mensaje = (input.mensaje ?? "").trim();
  const applied: string[] = [];
  if (!mensaje) return { mensaje, applied };

  const previous = recentAssistantTexts(input.history);
  const lastPrev = previous.length ? previous[previous.length - 1]! : null;
  const filled = input.filledSet ?? new Set<string>();
  const extracted = asExtracted(input.extracted);
  const cierre = !!input.cierreYaEnviado;
  const nombre = input.clientName ?? extracted.nombre;
  const display = firstName(nombre);

  const clientAskedInclusion =
    /\bqu[eé]\s+incluye|\bdescripci[oó]n(es)?\b|\bmen[uú]s?\b|\bdetalle\b|\bqu[eé]\s+trae|\bqu[eé]\s+lleva/i.test(
      input.currentMessage ?? ""
    );
  const hasCatalogNow = CATALOG_SEND_PATTERN.test(mensaje);
  const isEntertainmentCatalog = isEntertainmentCatalogReply(mensaje);
  // Catálogo "de detalle" (inclusiones/niveles/show) — proteger salvo reenvío idéntico.
  const isCatalogDetailReply =
    /\bincluye\s*:|qu[eé]\s+incluye\s+cada|detalle completo de men[uú]s|niveles?\s*:|cu[aá]l nivel prefieres/i.test(
      mensaje
    ) || isEntertainmentCatalog;

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
      mensaje = display
        ? `Perfecto, ${display}. Ya lo tengo anotado.`
        : "Perfecto, ya lo tengo anotado.";
      applied.push("filled-field-ack");
    }
  }

  // 4) Catálogo ya enviado en un turno reciente → no reenviar el bloque completo.
  // (A14920 show/MC: primer envío se conserva; A14924 cumpleaños: segundo se corta.)
  if (
    !cierre &&
    hasCatalogNow &&
    !clientAskedInclusion &&
    !/\b(s[ií]|manda|env[ií]a|pásame|pasame|quiero)\b/i.test(input.currentMessage ?? "") &&
    previous.some((p) => CATALOG_SEND_PATTERN.test(p))
  ) {
    const without = stripCatalogOfferBlock(mensaje);
    const qs = questionLines(without).filter(
      (q) => !/cat[aá]logo/i.test(q) && previous.every((p) => lucyTextOverlapRatio(q, p) < 0.68)
    );
    if (without && lucyTextOverlapRatio(without, mensaje) < 0.95) {
      if (qs.length) {
        mensaje = display ? `Perfecto, ${display}. ${qs[qs.length - 1]}` : qs[qs.length - 1]!;
      } else if (without.includes("?") && lucyTextOverlapRatio(without, lastPrev ?? "") < 0.7) {
        mensaje = without;
      } else {
        mensaje = display
          ? `Perfecto, ${display}. ¿Seguimos con el siguiente dato del evento?`
          : "Perfecto. ¿Seguimos con el siguiente dato del evento?";
      }
      applied.push("catalog-resend-dedupe");
    }
  }

  // 5) Misma pregunta de embudo (campo semántico) aunque el wording cambie.
  // Ej: "¿qué tipo de evento estás planeando?" → "…organizando?"
  if (!cierre && lastPrev && !applied.includes("catalog-resend-dedupe")) {
    const nowFields = detectAskedFields(mensaje);
    const prevField =
      (inferLucyAskedField(lastPrev) as PendingField | null) ||
      detectAskedFields(lastPrev)[0] ||
      null;
    const repeatedField =
      prevField && nowFields.includes(prevField) && !isFieldSatisfied(prevField, filled, extracted)
        ? prevField
        : null;

    if (repeatedField) {
      const nowQs = questionLines(mensaje).filter((q) => mensajeAsksForField(q, repeatedField));
      const prevQs = questionLines(lastPrev).filter((q) => mensajeAsksForField(q, repeatedField));
      const qOverlap = Math.max(
        0,
        ...nowQs.flatMap((nq) => prevQs.map((pq) => lucyTextOverlapRatio(nq, pq))),
        lucyTextOverlapRatio(mensaje, lastPrev)
      );
      // Paráfrasis típica ~0.50–0.75; cortar si ya preguntamos ese campo.
      if (qOverlap >= 0.48 || prevQs.length > 0) {
        const freshQ = nowQs.find((q) =>
          previous.every((p) => lucyTextOverlapRatio(q, p) < 0.62)
        );
        if (freshQ && qOverlap < 0.85) {
          mensaje = display ? `Perfecto, ${display}. ${freshQ}` : freshQ;
          applied.push("same-field-reask-trim");
        } else {
          // Misma pregunta: no reenviar; acuse corto (el cliente aún no respondió).
          mensaje = display
            ? `Sigo aquí, ${display}. Cuando puedas, ¿me confirmas ese dato?`
            : "Sigo aquí. Cuando puedas, ¿me confirmas ese dato?";
          applied.push("same-field-reask-ack");
        }
      }
    }
  }

  // 6) Casi idéntico a una respuesta reciente del asistente.
  const nearDupThreshold =
    questionLines(mensaje).length > 0 && mensaje.length < 220 ? 0.55 : 0.62;
  if (!isCatalogDetailReply && previous.length > 0) {
    const maxOverlap = Math.max(...previous.map((p) => lucyTextOverlapRatio(mensaje, p)));
    if (maxOverlap >= nearDupThreshold) {
      const trimmed = stripRepeatedQuestionLines(mensaje, previous);
      if (trimmed && lucyTextOverlapRatio(trimmed, lastPrev ?? "") < 0.6) {
        mensaje = trimmed;
        applied.push("near-duplicate-trim");
      } else if (cierre) {
        mensaje = shortPostCierreAck(nombre, THANKS_ACK_PATTERN.test(mensaje));
        applied.push("near-duplicate-postcierre");
      } else {
        const q = questionLines(mensaje).find((l) =>
          previous.every((p) => lucyTextOverlapRatio(l, p) < 0.62)
        );
        if (q) {
          mensaje = display ? `Perfecto, ${display}. ${q}` : q;
          applied.push("near-duplicate-keep-question");
        } else if (!applied.some((a) => a.startsWith("same-field"))) {
          mensaje = display
            ? `Entendido, ${display}. Seguimos con lo que ya platicamos.`
            : "Entendido. Seguimos con lo que ya platicamos.";
          applied.push("near-duplicate-ack");
        }
      }
    }
  }

  // 7) Segundo menú genérico de servicios en historial reciente.
  if (
    !cierre &&
    !isCatalogDetailReply &&
    !applied.includes("catalog-resend-dedupe") &&
    SERVICES_MENU_PATTERN.test(mensaje) &&
    /¿/.test(mensaje) &&
    previous.some((p) => SERVICES_MENU_PATTERN.test(p) && /¿/.test(p))
  ) {
    const qOnly = questionLines(mensaje).filter((l) => !SERVICES_MENU_PATTERN.test(l));
    if (qOnly.length) {
      mensaje = qOnly[qOnly.length - 1]!;
      applied.push("services-menu-dedupe");
    }
  }

  // 8) Limpieza de fragmentos rotos tras strips.
  const cleaned = cleanupBrokenOutboundFragments(mensaje);
  if (cleaned !== mensaje) {
    mensaje = cleaned;
    applied.push("broken-fragment-cleanup");
  }

  // Evitar mensaje vacío.
  if (!mensaje.trim()) {
    mensaje = display
      ? `Gracias, ${display}. ¿En qué más te ayudo con tu evento?`
      : "Gracias. ¿En qué más te ayudo con tu evento?";
    applied.push("empty-fallback");
  }

  return { mensaje: mensaje.trim(), applied };
}

/** Atajo: solo el texto final. */
export function filterLucyAntiRepetition(input: LucyAntiRepeatInput): string {
  return applyLucyGlobalAntiRepetition(input).mensaje;
}
