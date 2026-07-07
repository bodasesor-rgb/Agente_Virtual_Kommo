import type { OpenAI } from "openai";
import type { ExtractedData } from "./types.js";
import { resolveClientDisplayName } from "./contact-name.js";

export const EMAIL_WAIVED_LABEL = "Correo (prefiere no compartir)";
export const BODASESOR_EMAIL = "hola@bodasesor.com";

const EMAIL_REFUSAL_PATTERN =
  /\b(no\s+tengo(\s+un?)?\s+correo|no\s+quiero(\s+dar|\s+compartir)?(\s+mi)?\s+correo|sin\s+correo|no\s+uso\s+correo|no\s+dispongo\s+de\s+correo|por\s+este\s+medio|prefiero\s+(por\s+)?whatsapp|aqu[ií]\s+(est[aá]|por)|no\s+me\s+gusta\s+dar|no\s+es\s+necesario|no\s+hace\s+falta|no\s+quiero\s+darlo)\b/i;

/** 6 pasos obligatorios para cierre (correo es opcional pero se intenta en paso 2). */
export const CLOSING_CORE_FIELDS = [
  "Nombre del cliente",
  "Requerimientos o servicios",
  "Número de invitados",
  "Lugar/dirección del evento",
  "Fecha y horario",
] as const;

export const FLOW_QUESTIONS = {
  nombre: "¿Me regalas tu nombre para iniciar?",
  requerimientos: "Perfecto. Platícame, ¿qué tienes pensado para tu evento?",
  invitados: "¿Cuántos invitados tienes contemplados para tu evento?",
  zona: "¿En qué ciudad sería tu evento, si tienes dirección exacta sería mejor?",
  fecha: "¿Ya tienen fecha definida o siguen sin fecha?",
  serviciosExtra:
    "También manejamos bebidas, DJ, iluminación, carpas, mobiliario, pantallas, mesas de dulces y barras de alimentos.",
} as const;

const SERVICE_HINT =
  /banquete|taquiza|tacos|barra|bebida|dj|carpa|men[uú]|mobiliario|pizza|sushi|parrillada|postre|dulce|iluminaci[oó]n|pantalla|coffee|brunch|kosher|formal|mexican|coctel|mixolog|canap|crep|queso|inflable|softplay|estructura/i;

const SERVICE_PATTERNS: Array<[string, RegExp]> = [
  ["banquete", /\bbanquete\b/i],
  ["taquiza", /\b(taquiza|tacos)\b/i],
  ["barra de bebidas", /\b(barra.*bebida|bebidas?)\b/i],
  ["DJ", /\bdj\b/i],
  ["carpa", /\bcarpa\b/i],
  ["mobiliario", /\bmobiliario\b/i],
  ["iluminación", /\biluminaci[oó]n\b/i],
  ["pantalla", /\bpantalla\b/i],
  ["pizzas", /\bpizza\b/i],
  ["sushi", /\bsushi\b/i],
];

export function isValidRequerimientosValue(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || /^info pendiente$/i.test(trimmed)) return false;
  return SERVICE_HINT.test(trimmed);
}

const CLOSING_SIGNATURE = "Perfecto, ya tengo todo.";

export function collectUserTexts(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string[] {
  const fromHistory = history
    .filter((m) => m.role === "user" && typeof m.content === "string")
    .map((m) => m.content as string);
  return currentMessage?.trim() ? [...fromHistory, currentMessage.trim()] : fromHistory;
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

export function isEmailSatisfied(filledSet: Set<string>): boolean {
  return filledSet.has("Correo electrónico") || filledSet.has(EMAIL_WAIVED_LABEL);
}

export function isReadyForClosing(filledSet: Set<string>): boolean {
  return CLOSING_CORE_FIELDS.every((label) => filledSet.has(label)) && isEmailSatisfied(filledSet);
}

function findMentionedService(text: string): string | null {
  for (const [label, pattern] of SERVICE_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

export function buildRequerimientosQuestion(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string {
  const userText = collectUserTexts(history, currentMessage).join(" ");
  const fromExtracted =
    isValidRequerimientosValue(extracted.requerimientos_evento)
      ? extracted.requerimientos_evento!.trim()
      : null;
  const service = fromExtracted ?? findMentionedService(userText);

  if (service) {
    return (
      `Perfecto. Además del ${service}, ¿te gustaría cotizar algún otro servicio? ` +
      FLOW_QUESTIONS.serviciosExtra
    );
  }
  return FLOW_QUESTIONS.requerimientos;
}

export function requerimientosNeedsFollowUp(
  extracted: ExtractedData,
  filledSet: Set<string>
): boolean {
  if (filledSet.has("Requerimientos o servicios")) return false;
  const req = extracted.requerimientos_evento?.trim() ?? "";
  if (!req) return true;
  return !isValidRequerimientosValue(req);
}

function getDisplayName(extracted: ExtractedData, whatsappName?: string | null): string {
  return resolveClientDisplayName(extracted.nombre, null, whatsappName) ?? "ti";
}

export function buildCorreoQuestion(nombre: string): string {
  return `Mucho gusto, ${nombre}. Para mandarte toda la información y que Alejandro te arme una propuesta, ¿a qué correo te lo envío?`;
}

export function buildRequerimientosFollowUp(
  extracted: ExtractedData,
  filledSet?: Set<string>,
  history?: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string {
  if (filledSet && requerimientosNeedsFollowUp(extracted, filledSet)) {
    return buildRequerimientosQuestion(extracted, history ?? [], currentMessage);
  }
  if (!filledSet?.has("Número de invitados")) return FLOW_QUESTIONS.invitados;
  if (!filledSet?.has("Lugar/dirección del evento")) return FLOW_QUESTIONS.zona;
  if (!filledSet?.has("Fecha y horario")) return FLOW_QUESTIONS.fecha;
  return buildRequerimientosQuestion(extracted, history ?? [], currentMessage);
}

export function nextFieldQuestion(
  extracted: ExtractedData,
  filledSet?: Set<string>,
  whatsappName?: string | null,
  history?: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string | null {
  const nombre = getDisplayName(extracted, whatsappName);

  if (!filledSet?.has("Nombre del cliente")) {
    return FLOW_QUESTIONS.nombre;
  }

  if (!isEmailSatisfied(filledSet ?? new Set())) {
    return buildCorreoQuestion(nombre);
  }

  if (!filledSet?.has("Requerimientos o servicios") && !isValidRequerimientosValue(extracted.requerimientos_evento)) {
    return buildRequerimientosQuestion(extracted, history ?? [], currentMessage);
  }

  if (!filledSet?.has("Número de invitados")) {
    return FLOW_QUESTIONS.invitados;
  }

  if (!filledSet?.has("Lugar/dirección del evento")) {
    return FLOW_QUESTIONS.zona;
  }

  if (!filledSet?.has("Fecha y horario")) {
    return FLOW_QUESTIONS.fecha;
  }

  return null;
}

export function shouldReplaceForcedEmailQuestion(
  mensaje: string,
  filledSet: Set<string>
): boolean {
  if (!filledSet.has(EMAIL_WAIVED_LABEL)) return false;
  if (!/correo|e-?mail/i.test(mensaje) || !mensaje.includes("?")) return false;
  return /obligatorio|necesito|necesario|forzoso|indispensable|debes|tienes que|es importante/i.test(mensaje);
}

export function emailRefusalAckMessage(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string {
  return `Sin problema, seguimos por aquí. ${buildRequerimientosQuestion(extracted, history, currentMessage)}`;
}

export function clientJustGaveEmail(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): boolean {
  if (!currentMessage?.trim() || !/\S+@\S+\.\S+/.test(currentMessage)) return false;
  const lastAssistant = history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .slice(-1)[0]?.content as string | undefined;
  if (!lastAssistant) return false;
  return /correo|e-?mail|envío|envio/i.test(lastAssistant);
}

export function clientJustAnsweredRequerimientosQuestion(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): boolean {
  if (!currentMessage?.trim()) return false;
  const lastAssistant = history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .slice(-1)[0]?.content as string | undefined;
  if (!lastAssistant) return false;
  return /platícame|qué tienes pensado|otro servicio|te gustaría cotizar/i.test(lastAssistant);
}

function clientAskedFreeformQuestion(message?: string): boolean {
  if (!message?.trim()) return false;
  if (/\?/.test(message)) return true;
  return /cu[aá]nto|precio|costo|cat[aá]logo|men[uú]|tienen|incluye|kosher|horario|tel[eé]fono|correo\s+de\s+bodasesor|hola@/i.test(
    message
  );
}

function responseLooksLikePrematureClose(mensaje: string): boolean {
  return (
    mensaje.includes(CLOSING_SIGNATURE) ||
    /cotizaci[oó]n personalizada/i.test(mensaje) ||
    /cdn\.shopify\.com/i.test(mensaje) ||
    /cat[aá]logo completo/i.test(mensaje)
  );
}

function mensajeLooksOnTrack(mensaje: string, filledSet: Set<string>): boolean {
  if (!mensaje.includes("?")) return false;
  if (
    !filledSet.has("Requerimientos o servicios") &&
    /pensado|servicio|banquete|taquiza|cotizar|además del/i.test(mensaje)
  ) {
    return true;
  }
  if (!filledSet.has("Número de invitados") && /invitados|contemplados/i.test(mensaje)) return true;
  if (!filledSet.has("Lugar/dirección del evento") && /ciudad|dirección|direccion/i.test(mensaje)) return true;
  if (!filledSet.has("Fecha y horario") && /fecha|siguen sin fecha/i.test(mensaje)) return true;
  return false;
}

export interface LucyMessageGuardsInput {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  readyForClosing: boolean;
  cierreYaEnviado: boolean;
  emailRefusedThisTurn: boolean;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  currentMessage?: string;
  whatsappDisplayName?: string | null;
  buildClosing: (servicios: string | null | undefined) => string;
  log?: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
  entityId?: string | number;
}

export function applyLucyMessageGuards(input: LucyMessageGuardsInput): string {
  const {
    aiResponse,
    extracted,
    filledSet,
    readyForClosing,
    cierreYaEnviado,
    emailRefusedThisTurn,
    history,
    currentMessage,
    whatsappDisplayName,
    buildClosing,
    log,
    entityId,
  } = input;

  const justGaveEmail = clientJustGaveEmail(history, currentMessage);
  const justAnsweredReq = clientJustAnsweredRequerimientosQuestion(history, currentMessage);
  const emailOk = isEmailSatisfied(filledSet);
  const needsNextStep = emailOk && !readyForClosing && !cierreYaEnviado;

  let mensaje: string;

  if (justGaveEmail && !filledSet.has("Requerimientos o servicios")) {
    mensaje = buildRequerimientosQuestion(extracted, history, currentMessage);
    log?.info({ entityId }, "GUARD: correo capturado — pregunta requerimientos");
  } else if (emailRefusedThisTurn && !extracted.correo?.trim()) {
    mensaje = emailRefusalAckMessage(extracted, history, currentMessage);
    log?.info({ entityId }, "GUARD: cliente no quiere dar correo — se continúa el flujo");
  } else if (needsNextStep && !mensajeLooksOnTrack(aiResponse, filledSet)) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage);
    mensaje = nextQ ?? aiResponse;
    if (nextQ) log?.info({ entityId }, "GUARD: forzando siguiente paso del embudo");
  } else if (
    readyForClosing &&
    !cierreYaEnviado &&
    (justAnsweredReq || requerimientosNeedsFollowUp(extracted, filledSet))
  ) {
    mensaje = buildRequerimientosFollowUp(extracted, filledSet, history, currentMessage);
    log?.info({ entityId }, "GUARD: profundizar antes del cierre");
  } else if (readyForClosing && !cierreYaEnviado) {
    mensaje = buildClosing(extracted.tipo_evento ?? extracted.requerimientos_evento ?? null);
    log?.info({ entityId }, "Datos completos — mensaje de cierre desde plantilla");
  } else {
    mensaje = aiResponse;
    if (aiResponse.includes("DATOS DEL CLIENTE:")) {
      mensaje = buildClosing(extracted.tipo_evento ?? extracted.requerimientos_evento ?? null);
      log?.warn({ entityId }, "GPT generó nota interna — usando cierre desde plantilla");
    }
  }

  if (shouldReplaceForcedEmailQuestion(mensaje, filledSet)) {
    const nextQ =
      nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage) ??
      emailRefusalAckMessage(extracted, history, currentMessage);
    log?.warn({ entityId }, "GUARD: correo forzado tras rechazo — reemplazando respuesta");
    mensaje = nextQ;
  }

  const correoYaTenido = !!(extracted.correo?.trim()) || filledSet.has("Correo electrónico");
  if (correoYaTenido && /correo/i.test(mensaje) && mensaje.includes("?") && !readyForClosing) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage);
    if (nextQ) {
      log?.warn({ entityId }, "GUARD: GPT preguntó correo ya capturado");
      mensaje = nextQ;
    }
  }

  if (filledSet.has(EMAIL_WAIVED_LABEL) && /correo/i.test(mensaje) && mensaje.includes("?") && !readyForClosing) {
    const nextQ =
      nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage) ??
      emailRefusalAckMessage(extracted, history, currentMessage);
    log?.warn({ entityId }, "GUARD: GPT insistió en correo tras rechazo");
    mensaje = nextQ;
  }

  if (!readyForClosing && !cierreYaEnviado && !clientAskedFreeformQuestion(currentMessage)) {
    const forcedNext = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage);
    if (forcedNext && (responseLooksLikePrematureClose(mensaje) || !mensaje.includes("?"))) {
      log?.info({ entityId }, "GUARD: forzando siguiente paso del embudo");
      mensaje = forcedNext;
    }
  }

  if (!readyForClosing && responseLooksLikePrematureClose(mensaje)) {
    const forcedNext = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage);
    if (forcedNext) {
      log?.warn({ entityId }, "GUARD: bloqueando cierre prematuro");
      mensaje = forcedNext;
    }
  }

  return mensaje;
}
