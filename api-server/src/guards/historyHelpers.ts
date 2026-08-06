/**
 * Helpers de historial de chat (textos de usuario, cierre, último reply de teléfono).
 */
import type OpenAI from "openai";
import { CLOSING_SIGNATURE } from "./embudoConstants.js";

/** Detecta cierre en historial completo o última respuesta persistida (no solo slice reciente). */
export function detectCierreEnviado(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  lastStoredResponse?: string | null
): boolean {
  const looksLikeCierre = (t: string) =>
    t.includes(CLOSING_SIGNATURE) ||
    /\bya tengo todo\b/i.test(t) ||
    /\bcompartir esta informaci[oó]n con nuestro equipo\b/i.test(t) ||
    /\bcotizaci[oó]n personalizada\b/i.test(t);
  if (lastStoredResponse && looksLikeCierre(lastStoredResponse)) return true;
  return history.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      looksLikeCierre(m.content as string)
  );
}

export function collectUserTexts(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string[] {
  const fromHistory = history
    .filter((m) => m.role === "user" && typeof m.content === "string")
    .map((m) => m.content as string);
  return currentMessage?.trim() ? [...fromHistory, currentMessage.trim()] : fromHistory;
}

export function lastAssistantWasPhoneAnswer(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  const last = [...history]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  if (!last || typeof last.content !== "string") return false;
  return /55\s*4008\s*0373|56\s*4671\s*0585|l[ií]nea telef[oó]nica/i.test(last.content);
}
