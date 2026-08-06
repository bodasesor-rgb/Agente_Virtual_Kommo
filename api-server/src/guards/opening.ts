/**
 * Opening / nombre helpers (primer turno + WhatsApp nombre fallback).
 * Extraído de lucy-flow-guards para reducir el monolito.
 *
 * getNextPendingField / buildNaturalQuestion siguen en lucy-flow-guards (orquestador):
 * se inyectan vía configureOpeningDeps para evitar ciclo opening ↔ lucy-flow-guards.
 */
import type OpenAI from "openai";
import type { ExtractedData } from "../types.js";
import {
  sanitizeCrmNombre,
  sanitizeDisplayName,
  resolveClientDisplayName,
} from "../contact-name.js";
import {
  isRichQuoteBrief,
  buildRichBriefAcknowledgment,
  parseServicesFromText,
  buildMultiServiceAck,
  isVagueFoodTerm,
  formatServicesList,
  parseTipoEventoFromText,
  isGettingReadyContext,
  clientAsksLocation,
  clientMentionsItalianTheme,
  clientAsksForRecommendations,
  parsePrimaryService,
} from "../conversation-understanding.js";
import { attachAvailableSheetDetail } from "../services/catalogService.js";
import { shouldOfferOptionsBeforeDetail } from "../services/serviceProgressiveOffer.js";
import type { PendingField } from "./embudoConstants.js";
import { LUCY_INTRO, WHATSAPP_NOMBRE_NOTE } from "./embudoConstants.js";
import { pickVariant, mensajeAsksForField } from "./embudoQuestions.js";
import { collectUserTexts } from "./historyHelpers.js";
import { buildLocationAnswer } from "./contactAnswers.js";
import { buildPackageCatalogOfferBlock } from "./catalogOffer.js";
import { buildItalianFoodPitch } from "./salesReplies.js";
import { isValidRequerimientosValue } from "./crmAndClosing.js";

/** Compatible con NaturalQuestionContext de lucy-flow-guards (evita import cíclico). */
export type OpeningQuestionContext = {
  extracted: ExtractedData;
  filledSet?: Set<string>;
  whatsappName?: string | null;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  presentationHistory?: OpenAI.Chat.ChatCompletionMessageParam[];
  currentMessage?: string;
  entityId?: string | number;
  afterEmail?: boolean;
};

export type OpeningDeps = {
  getNextPendingField: (
    extracted: ExtractedData,
    filledSet?: Set<string>
  ) => PendingField | null;
  buildNaturalQuestion: (field: PendingField, ctx: OpeningQuestionContext) => string;
};

let _openingDeps: OpeningDeps | null = null;

export function configureOpeningDeps(deps: OpeningDeps): void {
  _openingDeps = deps;
}

function openingDeps(): OpeningDeps {
  if (!_openingDeps) {
    throw new Error(
      "opening: configureOpeningDeps() must run from lucy-flow-guards before buildFirstInteractionMessage"
    );
  }
  return _openingDeps;
}

function nombreSatisfied(filledSet: Set<string>, extracted: ExtractedData): boolean {
  return filledSet.has("Nombre del cliente") || !!sanitizeCrmNombre(extracted.nombre);
}

function getDisplayName(extracted: ExtractedData, whatsappName?: string | null): string | null {
  return resolveClientDisplayName(extracted.nombre, null, whatsappName);
}

/** Correo question local (misma lógica que buildCorreoQuestion en lucy-flow-guards). */
function buildCorreoQuestionLocal(
  nombre: string | null,
  history: OpenAI.Chat.ChatCompletionMessageParam[] = [],
  entityId?: string | number
): string {
  const correoCore = pickVariant("correo", history, entityId);
  if (nombre) return `Mucho gusto, ${nombre}. ${correoCore}`;
  return correoCore;
}

/** True si Lucy ya preguntó el nombre en algún mensaje anterior. */
export function lucyAskedForNombre(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  return history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .some((m) => mensajeAsksForField(m.content as string, "nombre"));
}

/**
 * Respaldo: usa nombre de WhatsApp solo si Lucy ya preguntó el nombre
 * y el cliente nunca lo escribió. No salta el paso — solo completa el dato.
 */
export function applyWhatsappNombreFallback(
  filledSet: Set<string>,
  mergedLines: string[],
  whatsappDisplayName: string | null | undefined,
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  if (filledSet.has("Nombre del cliente")) return false;
  if (!lucyAskedForNombre(history)) return false;

  // WhatsApp a menudo trae nombre + apellido: guardar completo en CRM.
  const waName = sanitizeCrmNombre(whatsappDisplayName) ?? sanitizeDisplayName(whatsappDisplayName);
  if (!waName) return false;

  mergedLines.push(`- Nombre del cliente: ${waName} ${WHATSAPP_NOMBRE_NOTE}`);
  filledSet.add("Nombre del cliente");
  return true;
}

/** Lee el nombre capturado en líneas CRM (incluye fallback de WhatsApp). Nombre completo. */
export function parseNombreFromCrmLines(mergedLines: string[]): string | null {
  const line = mergedLines.find((l) => /^-?\s*Nombre del cliente:/i.test(l));
  if (!line) return null;
  const raw = line
    .replace(/^-?\s*Nombre del cliente:\s*/i, "")
    .replace(WHATSAPP_NOMBRE_NOTE, "")
    .trim();
  return sanitizeCrmNombre(raw) ?? sanitizeDisplayName(raw);
}

/** Reconocimiento breve del primer mensaje del cliente (sin pedir otros datos). */
export function buildOpeningAcknowledgment(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string {
  const texts = collectUserTexts(history, currentMessage);
  const userText = texts[texts.length - 1] ?? texts.join(" ");
  const t = userText.toLowerCase();

  // RFQ largo (Alejandra / B2B): reconocer fecha, zona, menús y paquete completo.
  if (isRichQuoteBrief(userText)) {
    return buildRichBriefAcknowledgment(userText);
  }

  // Brief con varios servicios → reconocer la lista completa (no solo el primero).
  const multiServices = parseServicesFromText(userText);
  if (multiServices.length >= 2) {
    return buildMultiServiceAck(multiServices);
  }

  if (/taquiza|tacos/.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    const zona = userText.match(/\ben\s+([A-Za-zÁÉÍÓÚáéíóúñ][\w\s.-]{2,24})/i);
    const fecha = userText.match(
      /(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))/i
    );
    let ack = "Te ayudo con la taquiza";
    if (inv) ack += ` para ${inv[1]} personas`;
    if (zona) ack += ` en ${zona[1].trim()}`;
    if (fecha) ack += ` el ${fecha[1]}`;
    return `${ack}.`;
  }

  if (/\bboda\b/.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    const fecha = userText.match(
      /(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))/i
    );
    let ack = "Te ayudo con la cotización para tu boda";
    if (fecha) ack += ` del ${fecha[1]}`;
    if (inv) ack += ` para ${inv[1]} personas`;
    return `${ack}.`;
  }

  if (/baby\s*shower/.test(t)) return "Claro que te ayudamos con tu baby shower.";
  if (/\bbautizo\b/.test(t)) return "Con gusto te ayudo con la cotización para tu bautizo.";
  // A14929: antes de "me interesa cotizar…", detectar banquetes/catering vago.
  if (isVagueFoodTerm(userText)) {
    return "Para alimentos manejamos banquete, taquiza, brunch o coffee break — ¿cuál te interesa?";
  }
  if (/me\s+interesa\s+cotizar|cotizar\s+para\s+mi\s+evento/i.test(t)) {
    const colonMatch = userText.match(
      /(?:me\s+interesa\s+cotizar|cotizar\s+para\s+mi\s+evento)\s*:\s*(.+)/i
    );
    // A14934: cotizar "Barra Yucateca" en CDMX (sin dos puntos).
    const quotedMatch = userText.match(
      /(?:me\s+interesa\s+)?cotizar\s*[“"']([^”"']+)[”"']/i
    );
    const enZonaMatch = userText.match(
      /(?:me\s+interesa\s+)?cotizar\s+(.+?)\s+en\s+(?:ciudad\s+de\s+m[eé]xico|cdmx|[A-Za-zÁÉÍÓÚáéíóúñÑ])/i
    );
    const serviceChunk = (
      colonMatch?.[1] ??
      quotedMatch?.[1] ??
      enZonaMatch?.[1] ??
      ""
    )
      .trim()
      .replace(/\.$/, "")
      .replace(/^["'“”]+|["'“”]+$/g, "");
    if (serviceChunk) {
      const services = parseServicesFromText(serviceChunk);
      if (services.length >= 2) {
        return `Vi que necesitas ${formatServicesList(services)}. Te cotizamos todo eso.`;
      }
      if (/coffee\s*break/i.test(serviceChunk) && services.length <= 1) {
        return "Vi que te interesa un coffee break para eventos corporativos.";
      }
      if (/\b(mesas?|sillas?|mobiliario|periquera)\b/i.test(serviceChunk) && services.length <= 1) {
        return "Vi tu solicitud de renta de mesas y sillas para el evento.";
      }
      if (services.length === 1) {
        return `Vi que te interesa cotizar ${services[0]}.`;
      }
      const short = serviceChunk.split(/[,.]/)[0]!.trim();
      if (short.length > 3) return `Vi tu solicitud de ${short}.`;
    }
    const tipo = parseTipoEventoFromText(userText);
    const inv = userText.match(/para\s+(\d+)\s*(?:personas?|invitados?)/i);
    if (tipo) {
      let ack = `Vi tu solicitud para ${tipo}`;
      if (inv) ack += ` para ${inv[1]} personas`;
      return `${ack}.`;
    }
    return "Vi los datos de tu evento en la solicitud.";
  }
  if (isGettingReadyContext(userText)) return "Te ayudo con el catering para el getting ready.";
  // (isVagueFoodTerm se evalúa más arriba, antes de "me interesa cotizar")
  if (/\b(mesas?|sillas?|periqueras?|mobiliario|salas?\s*(lounge)?)\b/i.test(t)) {
    if (/periqueras?/.test(t)) return "Te ayudo con la renta de periqueras y mesas tipo bar.";
    if (/salas?/.test(t)) return "Te ayudo con salas lounge y mobiliario para tu evento.";
    return "Te ayudo con la renta de mesas, sillas y mobiliario.";
  }
  if (/banquete/.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    return inv
      ? `Te ayudo con el banquete para ${inv[1]} personas.`
      : "Con gusto te ayudo con información de banquetes.";
  }
  if (/kosher/.test(t)) return "Sí tenemos opciones kosher.";
  if (/\bshows?\b|\banimaci[oó]n\b|\bhora\s+loca\b|\bentretenimiento\b/i.test(t)) {
    return "Claro — manejamos shows, animación y performance para eventos.";
  }
  if (/\bpista(\s+de\s+baile)?\b|\btarima/i.test(t)) {
    return "Claro, te ayudo con pista de baile o tarima para tu evento.";
  }
  if (/expo|stand\s+de\s+caf[eé]|feria|congreso/i.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    return inv
      ? `Te ayudo con el stand de café para tu expo (${inv[1]} personas).`
      : "Te ayudo con el stand de café para tu expo.";
  }
  if (/italian|italia|toscana|toscano|mafia\s+italiana|men[uú]\s+italiano|pastas?|pizzas?|antipasti/i.test(t)) {
    return buildItalianFoodPitch(userText).replace(/\.$/, "");
  }
  if (/cotiz|evento/.test(t)) return "Claro que te ayudo con tu evento.";
  if (/^hola[.!?\s]*$/i.test(userText.trim())) {
    return "Estoy aquí para ayudarte con lo que necesites para tu evento.";
  }
  if (userText.trim().length > 0) return "Con gusto te ayudo.";

  return "Estoy aquí para ayudarte con lo que necesites para tu evento.";
}

/** Primer mensaje: presentación Lucy + reconocimiento breve + pedir nombre. */
export function buildFirstInteractionMessage(
  ctx: OpeningQuestionContext,
  withIntro = true
): string {
  const { getNextPendingField, buildNaturalQuestion } = openingDeps();
  const history = ctx.history ?? [];
  const filledSet = ctx.filledSet ?? new Set<string>();
  const ack = buildOpeningAcknowledgment(history, ctx.currentMessage);
  const intro = withIntro ? `${LUCY_INTRO} ` : "";
  const userText = collectUserTexts(history, ctx.currentMessage).join(" ");
  const richBrief = isRichQuoteBrief(ctx.currentMessage) || isRichQuoteBrief(userText);
  const multiServices = parseServicesFromText(userText);
  const includeCatalog =
    richBrief || multiServices.length >= 2;

  if (clientAsksLocation(ctx.currentMessage)) {
    const nameQ = pickVariant("nombre", history, ctx.entityId);
    return `${intro}${buildLocationAnswer()} ${nameQ}`.trim();
  }

  if (
    clientMentionsItalianTheme(ctx.currentMessage) ||
    (clientAsksForRecommendations(ctx.currentMessage) && clientMentionsItalianTheme(userText))
  ) {
    const nameQ = pickVariant("nombre", history, ctx.entityId);
    return `${intro}${buildItalianFoodPitch(ctx.currentMessage)} ${nameQ}`.trim();
  }

  // V8.68: familia sin variante → menú de opciones (detalle + link tras elegir / "sí").
  // Multi-servicio / brief rico sigue con bloque de catálogo.
  const svcHint =
    (isValidRequerimientosValue(ctx.extracted.requerimientos_evento)
      ? ctx.extracted.requerimientos_evento
      : null) ||
    parsePrimaryService(userText) ||
    parsePrimaryService(ctx.currentMessage ?? "") ||
    (multiServices.length === 1 ? multiServices[0]! : null);
  const progressiveFirst =
    !includeCatalog && svcHint
      ? shouldOfferOptionsBeforeDetail({
          currentMessage: ctx.currentMessage ?? svcHint,
          history,
          serviceHint: svcHint,
        })
      : null;
  const sheetDetail =
    !includeCatalog && !progressiveFirst && svcHint
      ? attachAvailableSheetDetail(svcHint, svcHint)
      : null;
  const catalogBlock = includeCatalog
    ? `\n\n${buildPackageCatalogOfferBlock(multiServices, userText)}`
    : progressiveFirst
      ? `\n\n${progressiveFirst.menu}`
      : sheetDetail
        ? `\n\n${sheetDetail}`
        : "";

  if (nombreSatisfied(filledSet, ctx.extracted)) {
    const nombre = getDisplayName(ctx.extracted, ctx.whatsappName);
    const pending = getNextPendingField(ctx.extracted, filledSet);
    if (pending === "correo") {
      const correoQ = buildCorreoQuestionLocal(nombre, history, ctx.entityId);
      const body = `${ack}${catalogBlock}\n\n${correoQ}`.trim();
      return withIntro ? `${intro}${body}`.trim() : body;
    }
    if (pending) {
      const greet = nombre ? `Mucho gusto, ${nombre}. ` : "";
      const q = buildNaturalQuestion(pending, ctx);
      const body = `${ack}${catalogBlock}\n\n${greet}${q}`.trim();
      return withIntro ? `${intro}${body}`.trim() : body;
    }
    const body = nombre
      ? `${ack}${catalogBlock}\n\nMucho gusto, ${nombre}.`.trim()
      : `${ack}${catalogBlock}`.trim();
    return withIntro ? `${intro}${body}`.trim() : body;
  }

  const nameQ = pickVariant("nombre", history, ctx.entityId);
  return `${intro}${ack}${catalogBlock}\n\n${nameQ}`.trim();
}
