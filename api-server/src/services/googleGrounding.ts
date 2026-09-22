/**
 * Google Search Grounding (Gemini) — OPT-IN, fuera del turno principal.
 *
 * Default OFF: no gasta tokens extra.
 * Activar en Hostinger: LUCY_GOOGLE_GROUNDING=1
 * Requiere la misma gemini_ia / GEMINI_API_KEY (Google AI Studio).
 *
 * Solo se llama cuando el cliente pide ideas/tendencias.
 * El resultado se inyecta como bloque corto; el turno unificado sigue siendo 1 call.
 */

import { GoogleGenAI } from "@google/genai";
import { DEFAULT_GEMINI_MODEL, getGeminiApiKey } from "../lib/llmEnv.js";
import { clientWantsIdeasOrTrends } from "./trendKnowledge.js";

const groundingStats = {
  attempts: 0,
  hits: 0,
  skips: 0,
  errors: 0,
  lastAt: null as string | null,
  lastChars: 0,
};

export function getGoogleGroundingStats() {
  return { ...groundingStats };
}

/** ¿Grounding habilitado por env? */
export function isGoogleGroundingEnabled(): boolean {
  const raw = (process.env["LUCY_GOOGLE_GROUNDING"] ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

/**
 * Fetch corto de tendencias vía Google Search tool de Gemini.
 * Devuelve null si está off, no aplica intent, o falla (silencioso).
 */
export async function fetchTrendGroundingSnippet(opts: {
  messageText: string;
  tipoEvento?: string | null;
}): Promise<string | null> {
  if (!isGoogleGroundingEnabled()) {
    groundingStats.skips += 1;
    return null;
  }
  if (!clientWantsIdeasOrTrends(opts.messageText)) {
    groundingStats.skips += 1;
    return null;
  }
  const key = getGeminiApiKey();
  if (!key) {
    groundingStats.skips += 1;
    return null;
  }

  groundingStats.attempts += 1;
  groundingStats.lastAt = new Date().toISOString();

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const eventHint = opts.tipoEvento?.trim() ? ` (evento: ${opts.tipoEvento.trim()})` : "";
    const prompt =
      `Eres asesora de eventos en México. Resume en máximo 3 viñetas cortas ` +
      `tendencias o ideas de ambientación relevantes a: "${opts.messageText.slice(0, 280)}"${eventHint}. ` +
      `Sin precios ni marcas inventadas. Solo ideas accionables. Español neutro MX.`;

    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.4,
        maxOutputTokens: 280,
        tools: [{ googleSearch: {} }],
      },
    });

    const text = (response.text ?? "").trim().replace(/\s+/g, " ");
    if (!text || text.length < 20) {
      groundingStats.errors += 1;
      return null;
    }
    const clipped = text.length > 480 ? `${text.slice(0, 477)}…` : text;
    groundingStats.hits += 1;
    groundingStats.lastChars = clipped.length;
    return clipped;
  } catch {
    groundingStats.errors += 1;
    return null;
  }
}
