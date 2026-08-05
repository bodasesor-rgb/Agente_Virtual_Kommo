/**
 * Proveedor LLM de Lucy: Gemini (default) u OpenAI (fallback).
 *
 * Política de gasto (V8.98):
 * - ÚNICO modelo Gemini permitido: gemini-3.1-flash-lite (texto, visión lectura, voz).
 * - NO se usan modelos de generación de imagen (Nano Banana / Imagen / *-image / imagen-*).
 * - Lucy nunca llama generateImages ni edita renders; solo LEE fotos del cliente con flash-lite.
 */

import { getOpenAiApiKey, isOpenAiConfigured } from "./openaiEnv.js";

export type LlmProvider = "gemini" | "openai";

/** Único modelo Gemini permitido para chat / visión / voz. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const DEFAULT_OPENAI_CHAT_MODEL = "gpt-4o-mini";

/**
 * Model IDs / aliases de generación de imagen (Nano Banana, Imagen, etc.).
 * Si GEMINI_MODEL apunta a alguno, se ignora y se fuerza flash-lite.
 */
const BLOCKED_IMAGE_GEN_MODEL =
  /(?:^|\/)(imagen[\w.-]*|nano[-\s]?banana[\w.-]*|gemini-[\w.-]*-image(?:-preview)?|gemini-2\.5-flash-image|gemini-3\.1-flash(?:-lite)?-image)(?:$|\/)/i;

/** Modelos de texto caros / no autorizados que no deben usarse por accidente. */
const BLOCKED_TEXT_MODEL =
  /(?:^|\/)(gemini-3\.6|gemini-2\.5-pro|gemini-3(?:\.1)?-pro|gemini-ultra|gemini-exp)(?:$|\/|-)/i;

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

/** True si el model ID es generador de imagen (Nano Banana / Imagen). */
export function isImageGenerationModel(model: string | null | undefined): boolean {
  const m = model?.trim() ?? "";
  if (!m) return false;
  return BLOCKED_IMAGE_GEN_MODEL.test(m);
}

/** True si el model ID está bloqueado por política de costo. */
export function isBlockedGeminiModel(model: string | null | undefined): boolean {
  const m = model?.trim() ?? "";
  if (!m) return false;
  return isImageGenerationModel(m) || BLOCKED_TEXT_MODEL.test(m);
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

/**
 * Modelo de chat activo.
 * Gemini: siempre pin a gemini-3.1-flash-lite (ignora overrides a Nano Banana / Imagen / Pro).
 */
export function getChatModel(): string {
  const provider = getLlmProvider();
  if (provider === "gemini") {
    return DEFAULT_GEMINI_MODEL;
  }
  return (
    process.env["OPENAI_MODEL"]?.trim() ||
    process.env["LLM_MODEL"]?.trim() ||
    DEFAULT_OPENAI_CHAT_MODEL
  );
}

/** Resuelve el model ID final para una llamada Gemini (forzado a allowlist). */
export function resolveGeminiModel(_requested?: string | null): string {
  return DEFAULT_GEMINI_MODEL;
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
  /** Transcripción: Gemini primero; Whisper solo fallback si hay OPEN_AI. */
  voice_transcriber: "gemini" | "whisper" | "none";
  voice_whisper_fallback: boolean;
  /** @deprecated usar voice_transcriber / voice_whisper_fallback */
  voice_whisper_available: boolean;
  /** Lucy NO genera imágenes; solo lee fotos del cliente con flash-lite. */
  gemini_image_generation: false;
  gemini_allowed_model: string;
  gemini_blocked_image_models: true;
} {
  const gemini = isGeminiConfigured();
  const openai = isOpenAiConfigured();
  return {
    provider: getLlmProvider(),
    model: getChatModel(),
    configured: isLlmConfigured(),
    gemini_configured: gemini,
    openai_configured: openai,
    voice_transcriber: gemini ? "gemini" : openai ? "whisper" : "none",
    voice_whisper_fallback: openai,
    voice_whisper_available: openai,
    gemini_image_generation: false,
    gemini_allowed_model: DEFAULT_GEMINI_MODEL,
    gemini_blocked_image_models: true,
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
