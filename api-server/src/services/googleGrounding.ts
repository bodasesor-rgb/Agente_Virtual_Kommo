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
import { clientAcceptsIdeasOffer, clientWantsIdeasOrTrends } from "./trendKnowledge.js";

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
  history?: Array<{ role?: string; content?: unknown }>;
  numInvitados?: number | string | null;
}): Promise<string | null> {
  if (!isGoogleGroundingEnabled()) {
    groundingStats.skips += 1;
    return null;
  }
  const textOf = (role: string) =>
    (opts.history ?? [])
      .filter((m) => m.role === role && typeof m.content === "string")
      .map((m) => m.content as string);
  const lucyTexts = textOf("assistant");
  const lastLucy = lucyTexts[lucyTexts.length - 1] ?? "";
  // A16427: "Si, por favor" a una oferta de ideas también cuenta como intent.
  const accepted = clientAcceptsIdeasOffer(opts.messageText, lastLucy);
  if (!accepted && !clientWantsIdeasOrTrends(opts.messageText)) {
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
    const eventHint = opts.tipoEvento?.trim() ? `Evento: ${opts.tipoEvento.trim()}. ` : "";
    const invHint = opts.numInvitados ? `Invitados: ${opts.numInvitados}. ` : "";
    // Con "sí" a secas, el tema real está en lo que el cliente contó antes.
    const clientContext = (accepted
      ? textOf("user").slice(-5).join(" | ")
      : opts.messageText
    ).slice(0, 400);
    const prompt =
      `Eres asesora de eventos en México. ${eventHint}${invHint}` +
      `Lo que dijo el cliente: "${clientContext}". ` +
      `Busca tendencias actuales (${new Date().getFullYear()}) y da exactamente 2 viñetas, ` +
      `cada una en su propia línea iniciando con "- ", máximo 22 palabras cada una. ` +
      `Ideas de ambientación, comida, decoración o dinámica que se puedan armar con banquetes, ` +
      `barras, mobiliario, DJ, iluminación, carpas o mesa de dulces. ` +
      `Sin precios, sin marcas, sin links, sin introducción. Español MX.`;

    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.4,
        maxOutputTokens: 280,
        tools: [{ googleSearch: {} }],
      },
    });

    // Conservar saltos de línea: el outbound separa las viñetas.
    const text = (response.text ?? "")
      .trim()
      .replace(/\[\d+(?:,\s*\d+)*\]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n");
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
