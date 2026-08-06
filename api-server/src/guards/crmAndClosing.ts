/**
 * Preparación de CRM e invariantes de cierre del embudo.
 * Mantiene dependencias de hoja para que no dependa del orquestador.
 */
import type { OpenAI } from "openai";
import type { ExtractedData } from "../types.js";
import {
  isGreetingOnlyMessage,
  isQuoteIntentMessage,
  resolveClientDisplayName,
  sanitizeCrmNombre,
} from "../contact-name.js";
import { filterClientEmail, looksLikeValidClientEmail } from "../client-email.js";
import {
  BODASESOR_SERVICE_PATTERNS,
  clientMentionsItalianTheme,
  countLucyFieldAsks,
  detectPresupuestoRefusal,
  findPresupuestoInTexts,
  inferLucyAskedField,
  isGenericQuoteIntentRequerimiento,
  isLikelyProductNameNotLocation,
  isServiceRelatedMessage,
  isUsableDireccionEvento,
  parsePrimaryService,
  parseServicesFromText,
  parseTipoEventoFromText,
  PRESUPUESTO_AUTO_WAIVER,
  PRESUPUESTO_MAX_ASKS,
} from "../conversation-understanding.js";
import { CLOSING_CORE_FIELDS, EMAIL_WAIVED_LABEL } from "./embudoConstants.js";
import { mensajeAsksForField } from "./embudoQuestions.js";
import { collectUserTexts } from "./historyHelpers.js";

const EMAIL_REFUSAL_PATTERN =
  /(?:no\s+tengo(\s+un?)?\s+correo|no\s+quiero(\s+dar|\s+compartir)?(\s+mi)?\s+correo|sin\s+correo|no\s+uso\s+correo|no\s+dispongo\s+de\s+correo|por\s+este\s+medio|prefiero\s+(?:por\s+)?whatsapp|por\s+aqu[ií]|mandar.*por\s+aqu[ií]|me\s+la\s+(?:pueden\s+)?mandar\s+por\s+aqu[ií]|aqu[ií]\s+(?:est[aá]|por)|por\s+aqu[ií]\s+por\s+fa|no\s+me\s+gusta\s+dar|no\s+es\s+necesario|no\s+hace\s+falta|no\s+quiero\s+darlo)/i;

function hasPresupuestoValue(extracted: ExtractedData): boolean {
  const p = extracted.presupuesto as unknown;
  if (p == null || p === "") return false;
  if (typeof p === "number") return Number.isFinite(p);
  return String(p).trim().length > 0;
}

export function syncFilledFromExtracted(filledSet: Set<string>, extracted: ExtractedData): void {
  if (sanitizeCrmNombre(extracted.nombre)) filledSet.add("Nombre del cliente");
  const email = filterClientEmail(extracted.correo);
  if (email && looksLikeValidClientEmail(email)) filledSet.add("Correo electrónico");
  if (extracted.tipo_evento?.trim()) filledSet.add("Tipo de evento");
  if (isValidRequerimientosValue(extracted.requerimientos_evento)) {
    filledSet.add("Requerimientos o servicios");
  }
  if (extracted.direccion_evento?.trim()) {
    if (
      !isUsableDireccionEvento(extracted.direccion_evento) ||
      isLikelyProductNameNotLocation(extracted.direccion_evento)
    ) {
      extracted.direccion_evento = null;
      filledSet.delete("Lugar/dirección del evento");
    } else {
      filledSet.add("Lugar/dirección del evento");
    }
  }
  if (extracted.fecha_horario?.trim()) filledSet.add("Fecha y horario");
  if (extracted.num_invitados) filledSet.add("Número de invitados");
  if (hasPresupuestoValue(extracted)) filledSet.add("Presupuesto (MXN)");
}

export function isValidRequerimientosValue(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  if (isGenericQuoteIntentRequerimiento(trimmed) || isQuoteIntentMessage(trimmed)) return false;
  if (isGreetingOnlyMessage(trimmed)) return false;
  if (
    /^(hola|buen[oa]s?\b|me\s+llamo|soy|mi\s+nombre\s+es)\b/i.test(trimmed) &&
    parseServicesFromText(trimmed).length === 0 &&
    !isServiceRelatedMessage(trimmed)
  ) {
    return false;
  }
  if (
    sanitizeCrmNombre(trimmed) &&
    parseServicesFromText(trimmed).length === 0 &&
    !isServiceRelatedMessage(trimmed) &&
    trimmed.split(/\s+/).length <= 4 &&
    !/\d/.test(trimmed)
  ) {
    return false;
  }
  if (parseServicesFromText(trimmed).length > 0 || isServiceRelatedMessage(trimmed)) return true;
  if (parseTipoEventoFromText(trimmed)) return false;
  if (clientMentionsItalianTheme(trimmed) && trimmed.length < 48) return false;
  return trimmed.length >= 4;
}

export function detectEmailRefusal(texts: string[]): boolean {
  return texts.some((t) => EMAIL_REFUSAL_PATTERN.test(t));
}

export function applyEmailWaiver(filledSet: Set<string>, mergedLines: string[], texts: string[]): void {
  if (filledSet.has("Correo electrónico") || filledSet.has(EMAIL_WAIVED_LABEL)) return;
  if (!detectEmailRefusal(texts)) return;
  mergedLines.push(`- ${EMAIL_WAIVED_LABEL}: continuar por WhatsApp/chat`);
  filledSet.add(EMAIL_WAIVED_LABEL);
}

export function applyPresupuestoWaiver(
  filledSet: Set<string>,
  mergedLines: string[],
  texts: string[],
  history?: OpenAI.Chat.ChatCompletionMessageParam[]
): void {
  if (filledSet.has("Presupuesto (MXN)")) return;
  const pres = findPresupuestoInTexts(texts, history);
  if (pres) {
    mergedLines.push(`- Presupuesto (MXN): ${pres}`);
    filledSet.add("Presupuesto (MXN)");
    return;
  }
  if (texts.some((t) => detectPresupuestoRefusal(t))) {
    const last = texts[texts.length - 1] ?? "";
    const label = /^(opciones?|propuestas?)[\s.,!]*$/i.test(last.trim())
      ? "Sin definir (cliente pidió que propongamos)"
      : "Sin definir (cliente indicó que no tiene)";
    mergedLines.push(`- Presupuesto (MXN): ${label}`);
    filledSet.add("Presupuesto (MXN)");
    return;
  }
  const lastAssistant = [...(history ?? [])]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  const lastAsked = lastAssistant ? inferLucyAskedField(lastAssistant.content as string) : null;
  if (
    lastAsked === "presupuesto" &&
    texts.some((t) =>
      /^(no\s+tengo|no\s+tenemos|no\s+cuento|sin|opciones?|propuestas?)[\s.,!]*$/i.test(t.trim())
    )
  ) {
    mergedLines.push(`- Presupuesto (MXN): Sin definir (cliente pidió que propongamos)`);
    filledSet.add("Presupuesto (MXN)");
    return;
  }
  if (history && countLucyFieldAsks(history, "presupuesto") >= PRESUPUESTO_MAX_ASKS) {
    mergedLines.push(`- Presupuesto (MXN): ${PRESUPUESTO_AUTO_WAIVER}`);
    filledSet.add("Presupuesto (MXN)");
  }
}

export function isEmailSatisfied(filledSet: Set<string>, extracted?: ExtractedData): boolean {
  if (filledSet.has("Correo electrónico") || filledSet.has(EMAIL_WAIVED_LABEL)) return true;
  if (!extracted) return false;
  const email = filterClientEmail(extracted.correo);
  return !!(email && looksLikeValidClientEmail(email));
}

export function isReadyForClosing(filledSet: Set<string>): boolean {
  return CLOSING_CORE_FIELDS.every((label) => filledSet.has(label)) && isEmailSatisfied(filledSet);
}

export function crmStoredValue(mergedLines: string[], label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^-?\\s*${escaped}:`, "i");
  const line = mergedLines.find((l) => pattern.test(l));
  if (!line) return null;
  const val = line.replace(pattern, "").trim();
  return val || null;
}

function findMentionedService(text: string): string | null {
  for (const [label, pattern] of BODASESOR_SERVICE_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return parsePrimaryService(text);
}

export function parseServiceFromUserText(text: string): string | null {
  return findMentionedService(text);
}

export function hasTipoEvento(filledSet: Set<string>, extracted: ExtractedData): boolean {
  return filledSet.has("Tipo de evento") || !!(extracted.tipo_evento?.trim());
}

export function getDisplayName(extracted: ExtractedData, whatsappName?: string | null): string | null {
  return resolveClientDisplayName(extracted.nombre, null, whatsappName);
}

type PresupuestoAskDeps = {
  nextFieldQuestion: (
    extracted: ExtractedData,
    filledSet: Set<string>,
    whatsappDisplayName: string | null | undefined,
    history: OpenAI.Chat.ChatCompletionMessageParam[],
    currentMessage: string | undefined,
    entityId: string | number | undefined
  ) => string | null;
};

export function blockExcessivePresupuestoAsk(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: string | undefined,
  buildClosing: (servicios: string | null | undefined, clientName?: string | null) => string,
  cierreYaEnviado: boolean,
  whatsappDisplayName: string | null | undefined,
  entityId: string | number | undefined,
  deps: PresupuestoAskDeps,
  log?: { info: (obj: unknown, msg?: string) => void }
): string {
  const asksPresupuesto =
    mensajeAsksForField(mensaje, "presupuesto") ||
    (/presupuesto|rango\s+de\s+inversi/i.test(mensaje) && mensaje.includes("?"));
  if (!asksPresupuesto) return mensaje;
  if (!filledSet.has("Presupuesto (MXN)")) {
    applyPresupuestoWaiver(filledSet, [], collectUserTexts(history, currentMessage), history);
  }
  if (!filledSet.has("Presupuesto (MXN)")) return mensaje;
  const presValue = findPresupuestoInTexts(collectUserTexts(history, currentMessage), history);
  if (presValue && /econ[oó]mic/i.test(presValue) && !isReadyForClosing(filledSet)) {
    const nextQ = deps.nextFieldQuestion(
      extracted,
      filledSet,
      whatsappDisplayName,
      history,
      currentMessage,
      entityId
    );
    log?.info({ entityId }, "GUARD: presupuesto económico — no repetir pregunta");
    return nextQ
      ? `Entendido, buscamos opciones económicas. ${nextQ}`
      : "Entendido, buscamos opciones económicas. Nuestro equipo te propone alternativas según lo que platicamos.";
  }
  if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
    log?.info({ entityId }, "GUARD: presupuesto — cierre tras waiver");
    return buildClosing(extracted.requerimientos_evento ?? extracted.tipo_evento ?? null, extracted.nombre);
  }
  const nextQ = deps.nextFieldQuestion(
    extracted,
    filledSet,
    whatsappDisplayName,
    history,
    currentMessage,
    entityId
  );
  if (nextQ && !mensajeAsksForField(nextQ, "presupuesto")) {
    log?.info({ entityId }, "GUARD: presupuesto capturado — no repetir pregunta");
    return nextQ;
  }
  log?.info({ entityId }, "GUARD: presupuesto capturado — continuar sin re-preguntar");
  return "Entendido, sin problema. Nuestro equipo te propone opciones según lo que platicamos y te arma la cotización.";
}

