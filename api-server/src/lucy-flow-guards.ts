import type { OpenAI } from "openai";
import type { ExtractedData } from "./types.js";

export const EMAIL_WAIVED_LABEL = "Correo (prefiere no compartir)";
export const BODASESOR_EMAIL = "hola@bodasesor.com";

const EMAIL_REFUSAL_PATTERN =
  /\b(no\s+tengo(\s+un?)?\s+correo|no\s+quiero(\s+dar|\s+compartir)?(\s+mi)?\s+correo|sin\s+correo|no\s+uso\s+correo|no\s+dispongo\s+de\s+correo|por\s+este\s+medio|prefiero\s+(por\s+)?whatsapp|aqu[ií]\s+(est[aá]|por)|no\s+me\s+gusta\s+dar|no\s+es\s+necesario|no\s+hace\s+falta|no\s+quiero\s+darlo)\b/i;

export const CLOSING_CORE_FIELDS = [
  "Nombre del cliente",
  "Requerimientos o servicios",
  "Lugar/dirección del evento",
  "Fecha y horario",
  "Número de invitados",
] as const;

const SERVICE_HINT =
  /banquete|taquiza|tacos|barra|bebida|dj|carpa|men[uú]|mobiliario|pizza|sushi|parrillada|postre|dulce|iluminaci[oó]n|pantalla|coffee|brunch|kosher|formal|mexican/i;

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

  const missingEventData =
    !filledSet.has("Número de invitados") ||
    !filledSet.has("Lugar/dirección del evento") ||
    !filledSet.has("Fecha y horario");

  if (!missingEventData) return false;

  const onlyTipoEvento =
    req.length < 28 &&
    !SERVICE_HINT.test(req) &&
    !/\d/.test(req);

  return onlyTipoEvento || (missingEventData && !SERVICE_HINT.test(req));
}

export function buildRequerimientosFollowUp(extracted: ExtractedData): string {
  const ref = extracted.tipo_evento?.trim() || extracted.requerimientos_evento?.trim() || "tu evento";
  return `Qué bien. Para ${ref}, ¿qué servicios te gustaría cotizar? Tenemos banquete, taquiza, barras de comida y bebidas, DJ, carpas y más. Si me dices más o menos cuántos invitados serían y en qué zona, Rodrigo te arma algo más a la medida.`;
}

export function nextFieldQuestion(
  extracted: ExtractedData,
  filledSet?: Set<string>
): string | null {
  if (!extracted.requerimientos_evento?.trim()) {
    return "Perfecto. Platícame, ¿qué tienes pensado para tu evento?";
  }
  if (filledSet && requerimientosNeedsFollowUp(extracted, filledSet)) {
    return buildRequerimientosFollowUp(extracted);
  }
  if (!filledSet?.has("Número de invitados")) return "¿Cuánta gente más o menos?";
  if (!filledSet?.has("Lugar/dirección del evento")) return "¿En qué zona sería?";
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
  return /platícame|qué tienes pensado|otro servicio|qué servicios/i.test(lastAssistant);
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
    buildClosing,
    log,
    entityId,
  } = input;

  const justAnsweredReq = clientJustAnsweredRequerimientosQuestion(history, currentMessage);
  const tieneRequerimientos = !!(extracted.requerimientos_evento?.trim());
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
    mensaje = buildRequerimientosFollowUp(extracted);
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
    const nextQ = nextFieldQuestion(extracted, filledSet) ?? emailRefusalAckMessage();
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
    const nextQ = nextFieldQuestion(extracted, filledSet);
    if (nextQ) {
      log?.warn({ entityId }, "GUARD: GPT preguntó correo ya capturado");
      mensaje = nextQ;
    }
  }

  if (filledSet.has(EMAIL_WAIVED_LABEL) && /correo/i.test(mensaje) && mensaje.includes("?") && !readyForClosing) {
    const nextQ = nextFieldQuestion(extracted, filledSet) ?? emailRefusalAckMessage();
    log?.warn({ entityId }, "GUARD: GPT insistió en correo tras rechazo");
    mensaje = nextQ;
  }

  return mensaje;
}
