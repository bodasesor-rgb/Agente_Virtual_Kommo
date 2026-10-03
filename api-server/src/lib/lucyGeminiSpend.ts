/**
 * Medidor de gasto de IA por canal: Gemini chat, Gemini auditor y respaldo OpenAI.
 * Estimación Lucy a partir del uso de tokens — no es la factura de Google/OpenAI.
 * Por día civil Mexico City; se guarda en lucy-data/llm-spend.json (sobrevive redeploys)
 * cuando el servidor llama enableSpendPersistence() al arrancar.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mexicoCityDayKey } from "../services/lucyAuditorTime.js";
import { getLucyLlmSpendPath } from "./lucyDataPaths.js";

export type GeminiSpendChannel = "chat" | "auditor";

export type GeminiUsageLike = {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  cachedContentTokenCount?: number | null;
  totalTokenCount?: number | null;
};

export type ChannelSpend = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  usdEstimate: number;
  lastModel: string | null;
  lastAt: string | null;
};

/** Respaldo OpenAI: solo entra si Gemini falla (chat → gpt-4o-mini, voz → Whisper). */
export type OpenAiSpend = ChannelSpend & {
  chatCalls: number;
  voiceCalls: number;
  audioSeconds: number;
  lastReason: string | null;
};

export type SpendDayTotals = {
  chatUsd: number;
  auditorUsd: number;
  openaiUsd: number;
  chatCalls: number;
  auditorCalls: number;
  openaiCalls: number;
};

export type GeminiSpendSnapshot = {
  dayKey: string;
  note: string;
  chat: ChannelSpend;
  auditor: ChannelSpend;
  openai: OpenAiSpend;
  /** Suma de los últimos 7 días (incluye hoy). */
  last7: SpendDayTotals & { days: number };
  persisted: boolean;
  totalUsdEstimate: number;
  warn: {
    chat: boolean;
    auditor: boolean;
    chatUsdLimit: number;
    auditorUsdLimit: number;
  };
};

type ModelRates = {
  inputPerM: number;
  outputPerM: number;
  cachedPerM: number;
};

/** Defaults publicados aproximados (USD / 1M tokens). Override vía env. */
const DEFAULT_RATES: Record<string, ModelRates> = {
  "gemini-3.1-flash-lite": { inputPerM: 0.1, outputPerM: 0.4, cachedPerM: 0.025 },
  "gemini-2.5-flash": { inputPerM: 0.15, outputPerM: 0.6, cachedPerM: 0.0375 },
  "gemini-2.0-flash": { inputPerM: 0.1, outputPerM: 0.4, cachedPerM: 0.025 },
  "gemini-2.0-flash-lite": { inputPerM: 0.075, outputPerM: 0.3, cachedPerM: 0.01875 },
};

const FALLBACK_RATES: ModelRates = {
  inputPerM: 0.15,
  outputPerM: 0.6,
  cachedPerM: 0.0375,
};

function emptyChannel(): ChannelSpend {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    usdEstimate: 0,
    lastModel: null,
    lastAt: null,
  };
}

function emptyOpenAi(): OpenAiSpend {
  return { ...emptyChannel(), chatCalls: 0, voiceCalls: 0, audioSeconds: 0, lastReason: null };
}

let spendDayKey = "";
let chatSpend = emptyChannel();
let auditorSpend = emptyChannel();
let openaiSpend = emptyOpenAi();
let history: Record<string, SpendDayTotals> = {};
let loaded = false;

const HISTORY_DAYS = 14;

let persistOn = false;

/** El servidor lo activa al arrancar; las pruebas no (no tocan lucy-data). */
export function enableSpendPersistence(on = true): void {
  persistOn = on;
  loaded = false;
}

function persistEnabled(): boolean {
  return persistOn;
}

type SpendFile = {
  dayKey?: string;
  chat?: ChannelSpend;
  auditor?: ChannelSpend;
  openai?: OpenAiSpend;
  history?: Record<string, SpendDayTotals>;
};

function loadFromDisk(): void {
  loaded = true;
  if (!persistEnabled()) return;
  const path = getLucyLlmSpendPath();
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as SpendFile;
    history = raw.history && typeof raw.history === "object" ? raw.history : {};
    if (raw.dayKey === mexicoCityDayKey()) {
      spendDayKey = raw.dayKey;
      chatSpend = { ...emptyChannel(), ...raw.chat };
      auditorSpend = { ...emptyChannel(), ...raw.auditor };
      openaiSpend = { ...emptyOpenAi(), ...raw.openai };
    }
  } catch {
    /* archivo dañado: empezar en cero */
  }
}

function todayTotals(): SpendDayTotals {
  return {
    chatUsd: chatSpend.usdEstimate,
    auditorUsd: auditorSpend.usdEstimate,
    openaiUsd: openaiSpend.usdEstimate,
    chatCalls: chatSpend.calls,
    auditorCalls: auditorSpend.calls,
    openaiCalls: openaiSpend.calls,
  };
}

function saveToDisk(): void {
  history[spendDayKey] = todayTotals();
  const keep = Object.keys(history).sort().slice(-HISTORY_DAYS);
  history = Object.fromEntries(keep.map((k) => [k, history[k]!]));
  if (!persistEnabled()) return;
  const path = getLucyLlmSpendPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const data: SpendFile = { dayKey: spendDayKey, chat: chatSpend, auditor: auditorSpend, openai: openaiSpend, history };
    writeFileSync(path, JSON.stringify(data), "utf8");
  } catch {
    /* el medidor nunca debe tumbar a Lucy */
  }
}

function ensureToday(): void {
  if (!loaded) loadFromDisk();
  const key = mexicoCityDayKey();
  if (key !== spendDayKey) {
    spendDayKey = key;
    chatSpend = emptyChannel();
    auditorSpend = emptyChannel();
    openaiSpend = emptyOpenAi();
  }
}

/** Solo pruebas: reinicia el estado en memoria (relee disco en la siguiente llamada). */
export function resetSpendForTests(): void {
  spendDayKey = "";
  chatSpend = emptyChannel();
  auditorSpend = emptyChannel();
  openaiSpend = emptyOpenAi();
  history = {};
  loaded = false;
}

function envRate(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function getModelRates(model: string): ModelRates {
  const m = model.trim().toLowerCase();
  const base = DEFAULT_RATES[m] ?? FALLBACK_RATES;
  // Overrides globales opcionales
  const inputPerM = envRate("LUCY_GEMINI_USD_INPUT_PER_M", base.inputPerM);
  const outputPerM = envRate("LUCY_GEMINI_USD_OUTPUT_PER_M", base.outputPerM);
  const cachedPerM = envRate("LUCY_GEMINI_USD_CACHED_PER_M", base.cachedPerM);
  // Si hay override por modelo específico (chat lite / auditor flash)
  if (m.includes("flash-lite") || m.includes("3.1-flash-lite")) {
    return {
      inputPerM: envRate("LUCY_CHAT_USD_INPUT_PER_M", inputPerM),
      outputPerM: envRate("LUCY_CHAT_USD_OUTPUT_PER_M", outputPerM),
      cachedPerM: envRate("LUCY_CHAT_USD_CACHED_PER_M", cachedPerM),
    };
  }
  if (m.includes("2.5-flash") || m.includes("auditor")) {
    return {
      inputPerM: envRate("LUCY_AUDITOR_USD_INPUT_PER_M", inputPerM),
      outputPerM: envRate("LUCY_AUDITOR_USD_OUTPUT_PER_M", outputPerM),
      cachedPerM: envRate("LUCY_AUDITOR_USD_CACHED_PER_M", cachedPerM),
    };
  }
  return { inputPerM, outputPerM, cachedPerM };
}

export function estimateUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number
): number {
  const rates = getModelRates(model);
  // Tokens en caché suelen ir aparte / más baratos; el billable input ≈ prompt - cached.
  const billableInput = Math.max(0, inputTokens - cachedTokens);
  const usd =
    (billableInput / 1_000_000) * rates.inputPerM +
    (cachedTokens / 1_000_000) * rates.cachedPerM +
    (outputTokens / 1_000_000) * rates.outputPerM;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

function asNonNegInt(n: unknown): number {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

export function recordGeminiSpend(opts: {
  channel: GeminiSpendChannel;
  model: string;
  usage?: GeminiUsageLike | null;
}): void {
  ensureToday();
  const model = (opts.model || "unknown").trim() || "unknown";
  const usage = opts.usage ?? {};
  const inputTokens = asNonNegInt(usage.promptTokenCount);
  const outputTokens = asNonNegInt(usage.candidatesTokenCount);
  const cachedTokens = asNonNegInt(usage.cachedContentTokenCount);
  const usd = estimateUsd(model, inputTokens, outputTokens, cachedTokens);

  const bucket = opts.channel === "auditor" ? auditorSpend : chatSpend;
  bucket.calls += 1;
  bucket.inputTokens += inputTokens;
  bucket.outputTokens += outputTokens;
  bucket.cachedTokens += cachedTokens;
  bucket.usdEstimate =
    Math.round((bucket.usdEstimate + usd) * 1_000_000) / 1_000_000;
  bucket.lastModel = model;
  bucket.lastAt = new Date().toISOString();
  saveToDisk();
}

/** USD / 1M tokens (OpenAI, aprox. publicados). Whisper: USD por minuto. */
const OPENAI_RATES: Record<string, { inputPerM: number; outputPerM: number }> = {
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10 },
};
const WHISPER_USD_PER_MIN = 0.006;

export function recordOpenAiSpend(opts: {
  kind: "chat" | "voice";
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  audioSeconds?: number | null;
  reason?: string | null;
}): void {
  ensureToday();
  const model = (opts.model || "unknown").trim() || "unknown";
  const inputTokens = asNonNegInt(opts.inputTokens);
  const outputTokens = asNonNegInt(opts.outputTokens);
  const audioSeconds = asNonNegInt(opts.audioSeconds);
  let usd: number;
  if (opts.kind === "voice") {
    usd = (audioSeconds / 60) * WHISPER_USD_PER_MIN;
  } else {
    const r = OPENAI_RATES[model.toLowerCase()] ?? OPENAI_RATES["gpt-4o-mini"]!;
    usd = (inputTokens / 1_000_000) * r.inputPerM + (outputTokens / 1_000_000) * r.outputPerM;
  }
  const b = openaiSpend;
  b.calls += 1;
  if (opts.kind === "voice") {
    b.voiceCalls += 1;
    b.audioSeconds += audioSeconds;
  } else {
    b.chatCalls += 1;
  }
  b.inputTokens += inputTokens;
  b.outputTokens += outputTokens;
  b.usdEstimate = Math.round((b.usdEstimate + usd) * 1_000_000) / 1_000_000;
  b.lastModel = model;
  b.lastAt = new Date().toISOString();
  b.lastReason = opts.reason?.replace(/\s+/g, " ").trim().slice(0, 160) || null;
  saveToDisk();
}

function warnLimit(envName: string, fallback: number): number {
  const raw = process.env[envName]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function cloneChannel(c: ChannelSpend): ChannelSpend {
  return { ...c };
}

export function getGeminiSpendSnapshot(): GeminiSpendSnapshot {
  ensureToday();
  const chatUsdLimit = warnLimit("LUCY_COST_WARN_CHAT_USD", 2);
  const auditorUsdLimit = warnLimit("LUCY_COST_WARN_AUDITOR_USD", 0.5);
  const chat = cloneChannel(chatSpend);
  const auditor = cloneChannel(auditorSpend);
  const openai = { ...openaiSpend };
  const days = { ...history, [spendDayKey]: todayTotals() };
  const cutoff = new Date(`${spendDayKey}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 6);
  const cutoffKey = Number.isNaN(cutoff.getTime()) ? "" : cutoff.toISOString().slice(0, 10);
  const recent = Object.keys(days)
    .sort()
    .filter((d) => d >= cutoffKey && d <= spendDayKey);
  const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
  const sum = (k: keyof SpendDayTotals) => round(recent.reduce((n, d) => n + (days[d]?.[k] ?? 0), 0));
  return {
    dayKey: spendDayKey,
    note: persistEnabled()
      ? "Estimado Lucy (tokens × precios publicados). No es la factura de Google/OpenAI. Se guarda por día (no se borra al redeploy)."
      : "Estimado Lucy (tokens × precios publicados). Solo en memoria: se reinicia al redeploy.",
    chat,
    auditor,
    openai,
    last7: {
      days: recent.length,
      chatUsd: sum("chatUsd"),
      auditorUsd: sum("auditorUsd"),
      openaiUsd: sum("openaiUsd"),
      chatCalls: sum("chatCalls"),
      auditorCalls: sum("auditorCalls"),
      openaiCalls: sum("openaiCalls"),
    },
    persisted: persistEnabled(),
    totalUsdEstimate: round(chat.usdEstimate + auditor.usdEstimate + openai.usdEstimate),
    warn: {
      chat: chat.usdEstimate >= chatUsdLimit,
      auditor: auditor.usdEstimate >= auditorUsdLimit,
      chatUsdLimit,
      auditorUsdLimit,
    },
  };
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (n > 0 && n < 0.01) return `~$${n.toFixed(4)}`;
  return `~$${n.toFixed(2)}`;
}
