/**
 * Proveedor LLM de Lucy: Gemini (default) u OpenAI (fallback).
 * Voz (Whisper) sigue en OpenAI si hay OPEN_AI.
 */

import { getOpenAiApiKey, isOpenAiConfigured } from "./openaiEnv.js";

export type LlmProvider = "gemini" | "openai";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const DEFAULT_OPENAI_CHAT_MODEL = "gpt-4o-mini";

/** Keys aceptadas (Hostinger / otros proyectos): gemini_ia, GEMINI_API_KEY, etc. */
export function getGeminiApiKey(): string {
  return (
    process.env["gemini_ia"]?.trim() ||
    process.env["GEMINI_IA"]?.trim() ||
    process.env["GEMINI_API_KEY"]?.trim() ||
    process.env["GOOGLE_API_KEY"]?.trim() ||
    process.env["GEMINI_KEY"]?.trim() ||
    ""
  );
}

export function isGeminiConfigured(): boolean {
  return getGeminiApiKey().length > 0;
}

/**
 * Proveedor activo:
 * - LLM_PROVIDER=gemini|openai fuerza la elección
 * - si no: Gemini si hay key; si no, OpenAI
 */
export function getLlmProvider(): LlmProvider {
  const forced = (process.env["LLM_PROVIDER"] ?? process.env["LUCY_LLM_PROVIDER"] ?? "")
    .trim()
    .toLowerCase();
  if (forced === "gemini" || forced === "google") return "gemini";
  if (forced === "openai" || forced === "gpt") return "openai";
  if (isGeminiConfigured()) return "gemini";
  return "openai";
}

export function getChatModel(): string {
  const provider = getLlmProvider();
  if (provider === "gemini") {
    return (
      process.env["GEMINI_MODEL"]?.trim() ||
      process.env["LLM_MODEL"]?.trim() ||
      DEFAULT_GEMINI_MODEL
    );
  }
  return (
    process.env["OPENAI_MODEL"]?.trim() ||
    process.env["LLM_MODEL"]?.trim() ||
    DEFAULT_OPENAI_CHAT_MODEL
  );
}

/** Lucy puede redactar/extraer si Gemini u OpenAI está configurado para el provider activo. */
export function isLlmConfigured(): boolean {
  const provider = getLlmProvider();
  if (provider === "gemini") return isGeminiConfigured();
  return isOpenAiConfigured();
}

export function llmConfigSummary(): {
  provider: LlmProvider;
  model: string;
  configured: boolean;
  gemini_configured: boolean;
  openai_configured: boolean;
  voice_whisper_available: boolean;
} {
  return {
    provider: getLlmProvider(),
    model: getChatModel(),
    configured: isLlmConfigured(),
    gemini_configured: isGeminiConfigured(),
    openai_configured: isOpenAiConfigured(),
    voice_whisper_available: isOpenAiConfigured(),
  };
}

export function missingLlmConfigMessage(): string {
  const provider = getLlmProvider();
  if (provider === "gemini") {
    return "Lucy no tiene gemini_ia (o GEMINI_API_KEY) configurada. Añádela en Hostinger y reinicia.";
  }
  return "Lucy no tiene OPEN_AI (o OPENAI_API_KEY) configurada. Añádela en Hostinger y reinicia.";
}

/** Prefijo seguro para health (sin filtrar la key). */
export function llmKeyPrefix(): string | null {
  if (getLlmProvider() === "gemini") {
    const key = getGeminiApiKey();
    return key ? `${key.slice(0, 6)}…` : null;
  }
  const key = getOpenAiApiKey();
  return key.startsWith("sk-") ? `${key.slice(0, 8)}…` : key ? `${key.slice(0, 6)}…` : null;
}
