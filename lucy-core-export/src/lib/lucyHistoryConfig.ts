import type OpenAI from "openai";

type Message = OpenAI.Chat.ChatCompletionMessageParam;

const DEFAULT_PROMPT_MESSAGES = 18;
const DEFAULT_STORED_MESSAGES = 60;
const DEFAULT_SCAN_USER_MESSAGES = 20;
const DEFAULT_EXTRACT_MESSAGES = 40;

function readLimit(envKey: string, fallback: number, max: number): number {
  const raw = process.env[envKey]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2) return fallback;
  return Math.min(Math.floor(n), max);
}

/** Mensajes user+assistant que Lucy ve en el prompt de redacción (pares ≈ valor/2). */
export function getPromptHistoryLimit(): number {
  return readLimit("LUCY_PROMPT_HISTORY_MESSAGES", DEFAULT_PROMPT_MESSAGES, 40);
}

/** Mensajes guardados en disco por lead/chat. */
export function getStoredHistoryLimit(): number {
  return readLimit("LUCY_STORED_HISTORY_MESSAGES", DEFAULT_STORED_MESSAGES, 120);
}

/** Mensajes de usuario para escaneo pasivo de capturas. */
export function getScanUserMessagesLimit(): number {
  return readLimit("LUCY_SCAN_USER_MESSAGES", DEFAULT_SCAN_USER_MESSAGES, 40);
}

/** Mensajes enviados al extractor estructurado (JSON). */
export function getExtractHistoryLimit(): number {
  return readLimit("LUCY_EXTRACT_HISTORY_MESSAGES", DEFAULT_EXTRACT_MESSAGES, 80);
}

export function slicePromptHistory(full: Message[]): Message[] {
  return full.slice(-getPromptHistoryLimit());
}

export function sliceExtractHistory(full: Message[]): Message[] {
  return full.slice(-getExtractHistoryLimit());
}

export function getLucyHistoryConfig() {
  return {
    prompt_messages: getPromptHistoryLimit(),
    stored_messages: getStoredHistoryLimit(),
    scan_user_messages: getScanUserMessagesLimit(),
    extract_messages: getExtractHistoryLimit(),
  };
}
