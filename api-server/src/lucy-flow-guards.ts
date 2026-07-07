import type { OpenAI } from "openai";
import type { ExtractedData } from "./types.js";
import { resolveClientDisplayName } from "./contact-name.js";

export const EMAIL_WAIVED_LABEL = "Correo (prefiere no compartir)";
export const BODASESOR_EMAIL = "hola@bodasesor.com";

const EMAIL_REFUSAL_PATTERN =
  /\b(no\s+tengo(\s+un?)?\s+correo|no\s+quiero(\s+dar|\s+compartir)?(\s+mi)?\s+correo|sin\s+correo|no\s+uso\s+correo|no\s+dispongo\s+de\s+correo|por\s+este\s+medio|prefiero\s+(por\s+)?whatsapp|aqu[ií]\s+(est[aá]|por)|no\s+me\s+gusta\s+dar|no\s+es\s+necesario|no\s+hace\s+falta|no\s+quiero\s+darlo)\b/i;

/** Orden estricto del embudo de calificación (correo es opcional). */
export const CLOSING_CORE_FIELDS = [
  "Nombre del cliente",
  "Requerimientos o servicios",
  "Tipo de evento",
  "Número de invitados",
  "Lugar/dirección del evento",
  "Fecha y horario",
] as const;

const SERVICE_HINT =
  /banquete|taquiza|tacos|barra|bebida|dj|carpa|men[uú]|mobiliario|pizza|sushi|parrillada|postre|dulce|iluminaci[oó]n|pantalla|coffee|brunch|kosher|formal|mexican|coctel|mixolog|canap|crep|queso|inflable|softplay|estructura/i;

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

export function requerimientosNeedsFollowUp(
  extracted: ExtractedData,
  filledSet: Set<string>
): boolean {
  const req = extracted.requerimientos_evento?.trim() ?? "";
  if (!req) return false;

  const onlyTipoEvento =
    req.length < 28 &&
    !SERVICE_HINT.test(req) &&
    !/\d/.test(req);

  return onlyTipoEvento || !SERVICE_HINT.test(req);
}

function getDisplayName(
  extracted: ExtractedData,
  whatsappName?: string | null
): string {
  return resolveClientDisplayName(extracted.nombre, null, whatsappName) ?? "ti";
}

export function buildRequerimientosFollowUp(
  extracted: ExtractedData,
  filledSet?: Set<string>
): string {
  const ref = extracted.tipo_evento?.trim() || extracted.requerimientos_evento?.trim() || "tu evento";

  if (!filledSet?.has("Tipo de evento") && !extracted.tipo_evento?.trim()) {
    return `Qué bien. Para ${ref}, ¿qué tipo de evento es? Por ejemplo boda, XV años, baby shower o cumpleaños.`;
  }
  if (!filledSet?.has("Número de invitados")) {
    return `Perfecto. Para ${ref}, ¿cuánta gente más o menos serían?`;
  }
  if (!filledSet?.has("Lugar/dirección del evento")) {
    return `¿En qué zona o ciudad sería ${ref}?`;
  }
  if (!filledSet?.has("Fecha y horario")) {
    return "¿Ya tienen fecha definida o la están viendo todavía?";
  }
  return `Para ${ref}, ¿qué servicios te gustaría cotizar? Tenemos banquete, taquiza, barras de comida y bebidas, DJ, carpas y más.`;
}

export function nextFieldQuestion(
  extracted: ExtractedData,
  filledSet?: Set<string>,
  whatsappName?: string | null
): string | null {
  const nombre = getDisplayName(extracted, whatsappName);

  if (!filledSet?.has("Nombre del cliente")) {
    return "¿Me dices tu nombre para empezar?";
  }

  if (!isEmailSatisfied(filledSet ?? new Set())) {
    return `Mucho gusto, ${nombre}. Para mandarte toda la información y que Rodrigo te arme una propuesta, ¿a qué correo te lo envío?`;
  }

  if (!filledSet?.has("Requerimientos o servicios") && !isValidRequerimientosValue(extracted.requerimientos_evento)) {
    return "Perfecto. Platícame, ¿qué tienes pensado para tu evento?";
  }

  if (filledSet && requerimientosNeedsFollowUp(extracted, filledSet)) {
    return buildRequerimientosFollowUp(extracted, filledSet);
  }

  if (!filledSet?.has("Tipo de evento") && !extracted.tipo_evento?.trim()) {
    return "¿Qué tipo de evento es? Por ejemplo boda, XV años, baby shower, cumpleaños o corporativo.";
  }

  if (!filledSet?.has("Número de invitados")) {
    return "¿Cuánta gente más o menos?";
  }

  if (!filledSet?.has("Lugar/dirección del evento")) {
    return "¿En qué zona sería?";
  }

  if (!filledSet?.has("Fecha y horario")) {
    return "¿Ya tienen fecha definida o la están viendo todavía?";
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

export function emailRefusalAckMessage(): string {
  return "Sin problema, seguimos por aquí. Platícame, ¿qué tienes pensado para tu evento?";
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
  return /platícame|qué tienes pensado|otro servicio|qué servicios|qué tipo de evento/i.test(lastAssistant);
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

  const justAnsweredReq = clientJustAnsweredRequerimientosQuestion(history, currentMessage);
  const tieneRequerimientos =
    isValidRequerimientosValue(extracted.requerimientos_evento) ||
    filledSet.has("Requerimientos o servicios");
  const emailOk = isEmailSatisfied(filledSet);
  const forzarRequerimientos =
    emailOk && !tieneRequerimientos && !readyForClosing && !cierreYaEnviado;

  let mensaje: string;

  if (emailRefusedThisTurn && !extracted.correo?.trim()) {
    mensaje = emailRefusalAckMessage();
    log?.info({ entityId }, "GUARD: cliente no quiere dar correo — se continúa el flujo");
  } else if (forzarRequerimientos) {
    mensaje = "Perfecto. Platícame, ¿qué tienes pensado para tu evento?";
    log?.info({ entityId }, "GUARD: correo ok pero requerimientos vacío");
  } else if (
    readyForClosing &&
    !cierreYaEnviado &&
    (justAnsweredReq || requerimientosNeedsFollowUp(extracted, filledSet))
  ) {
    mensaje = buildRequerimientosFollowUp(extracted, filledSet);
    log?.info({ entityId }, "GUARD: profundizar requerimientos antes del cierre");
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
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName) ?? emailRefusalAckMessage();
    log?.warn({ entityId }, "GUARD: correo forzado tras rechazo — reemplazando respuesta");
    mensaje = nextQ;
  }

  const correoYaTenido = !!(extracted.correo?.trim()) || filledSet.has("Correo electrónico");
  if (
    correoYaTenido &&
    /correo/i.test(mensaje) &&
    mensaje.includes("?") &&
    !readyForClosing
  ) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName);
    if (nextQ) {
      log?.warn({ entityId }, "GUARD: GPT preguntó correo ya capturado");
      mensaje = nextQ;
    }
  }

  if (filledSet.has(EMAIL_WAIVED_LABEL) && /correo/i.test(mensaje) && mensaje.includes("?") && !readyForClosing) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName) ?? emailRefusalAckMessage();
    log?.warn({ entityId }, "GUARD: GPT insistió en correo tras rechazo");
    mensaje = nextQ;
  }

  // Forzar el siguiente paso del embudo cuando GPT salta preguntas o cierra antes de tiempo.
  if (!readyForClosing && !cierreYaEnviado && !clientAskedFreeformQuestion(currentMessage)) {
    const forcedNext = nextFieldQuestion(extracted, filledSet, whatsappDisplayName);
    if (forcedNext && (responseLooksLikePrematureClose(mensaje) || !mensaje.includes("?"))) {
      log?.info({ entityId }, "GUARD: forzando siguiente paso del embudo");
      mensaje = forcedNext;
    }
  }

  if (!readyForClosing && responseLooksLikePrematureClose(mensaje)) {
    const forcedNext = nextFieldQuestion(extracted, filledSet, whatsappDisplayName);
    if (forcedNext) {
      log?.warn({ entityId }, "GUARD: bloqueando cierre prematuro");
      mensaje = forcedNext;
    }
  }

  return mensaje;
}
