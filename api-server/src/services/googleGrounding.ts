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

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { DEFAULT_GEMINI_MODEL, getGeminiApiKey } from "../lib/llmEnv.js";
import { getLucyDataRoot } from "../lib/lucyDataPaths.js";
import { clientAcceptsIdeasOffer, clientWantsIdeasOrTrends } from "./trendKnowledge.js";

const groundingStats = {
  attempts: 0,
  hits: 0,
  skips: 0,
  errors: 0,
  cacheHits: 0,
  cacheSize: 0,
  lastAt: null as string | null,
  lastChars: 0,
};

export function getGoogleGroundingStats() {
  return { ...groundingStats };
}

/**
 * A16567: memoria de lo investigado. "Bautizo de abejitas" ya buscado → se reutiliza
 * para el siguiente cliente sin volver a gastar la búsqueda (30 días).
 */
export interface TrendResearchEntry {
  tipo: string;
  words: string[];
  snippet: string;
  savedAt: string;
  uses: number;
}

const RESEARCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESEARCH_MAX = 300;
const TOPIC_STOPWORDS = new Set(
  "para como pero esta este esto esos esas unos unas sobre tienes tienen quiero queria quisiera puedes pueden ideas idea algo cosa cosas hacer hacemos podemos tambien tengo tenemos mucho muchos poco bien porfa favor gracias hola evento fiesta moda ubicas vimos visto donde cuando cual cuales seria sería esta están estan".split(
    " "
  )
);

function foldText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Palabras que definen el tema ("abejas", "osos", "nino") — sin muletillas. */
export function trendTopicWords(text: string): string[] {
  const words = foldText(text)
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !TOPIC_STOPWORDS.has(w))
    .map((w) => w.replace(/(es|s)$/, (m) => (w.length - m.length >= 4 ? "" : m)));
  return [...new Set(words)].sort().slice(0, 8);
}

function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  const inter = a.filter((w) => sb.has(w)).length;
  return inter / Math.max(a.length, b.length);
}

export function findTrendResearch(
  store: TrendResearchEntry[],
  tipo: string | null | undefined,
  words: string[],
  now = Date.now()
): TrendResearchEntry | null {
  const t = foldText(tipo?.trim() ?? "");
  if (words.length < 1) return null;
  let best: TrendResearchEntry | null = null;
  let bestScore = 0;
  for (const e of store) {
    if (now - Date.parse(e.savedAt) > RESEARCH_TTL_MS) continue;
    if (foldText(e.tipo) !== t) continue;
    const s = overlap(words, e.words);
    if (s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

let researchPathOverride: string | null = null;
let researchStore: TrendResearchEntry[] | null = null;

/** Solo pruebas: memoria en otra ruta (o null = en memoria, sin archivo). */
export function setTrendResearchStoreForTests(entries: TrendResearchEntry[] | null, path: string | null = null) {
  researchStore = entries;
  researchPathOverride = path;
}

function researchPath(): string | null {
  if (researchPathOverride !== null) return researchPathOverride || null;
  return join(getLucyDataRoot(), "trend-research.json");
}

function loadResearchStore(): TrendResearchEntry[] {
  if (researchStore) return researchStore;
  const p = researchPath();
  try {
    researchStore = p ? (JSON.parse(readFileSync(p, "utf8")) as TrendResearchEntry[]) : [];
  } catch {
    researchStore = [];
  }
  groundingStats.cacheSize = researchStore.length;
  return researchStore;
}

async function persistResearchStore(): Promise<void> {
  const p = researchPath();
  if (!p || !researchStore) return;
  try {
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify(researchStore, null, 1), "utf8");
  } catch {
    /* sin disco: la memoria sigue en RAM */
  }
}

export function rememberTrendResearch(tipo: string | null | undefined, words: string[], snippet: string): void {
  if (!words.length || !snippet.trim()) return;
  const store = loadResearchStore();
  const now = Date.now();
  const fresh = store.filter((e) => now - Date.parse(e.savedAt) <= RESEARCH_TTL_MS);
  fresh.push({ tipo: tipo?.trim() ?? "", words, snippet, savedAt: new Date(now).toISOString(), uses: 0 });
  researchStore = fresh.slice(-RESEARCH_MAX);
  groundingStats.cacheSize = researchStore.length;
  void persistResearchStore();
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
  // Con "sí" a secas, el tema real está en lo que el cliente contó antes.
  const clientContext = (accepted
    ? textOf("user").slice(-5).join(" | ")
    : opts.messageText
  ).slice(0, 400);
  const topicWords = trendTopicWords(clientContext);
  const remembered = findTrendResearch(loadResearchStore(), opts.tipoEvento, topicWords);
  if (remembered) {
    remembered.uses += 1;
    groundingStats.cacheHits += 1;
    return remembered.snippet;
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
    const prompt =
      `Eres asesora de eventos en México. ${eventHint}${invHint}` +
      `Lo que dijo el cliente: "${clientContext}". ` +
      `Busca tendencias actuales (${new Date().getFullYear()}) y da exactamente 2 viñetas, ` +
      `sobre la temática concreta que menciona el cliente si la hay (ej. abejitas, ositos, safari), ` +
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
    rememberTrendResearch(opts.tipoEvento, topicWords, clipped);
    return clipped;
  } catch {
    groundingStats.errors += 1;
    return null;
  }
}
