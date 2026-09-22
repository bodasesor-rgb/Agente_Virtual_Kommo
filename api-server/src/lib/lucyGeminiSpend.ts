/**
 * Medidor de gasto Gemini por canal (chat vs auditor).
 * Estimación Lucy a partir de usageMetadata — no es la factura de Google.
 * Contadores en memoria; se reinician con el proceso Node y cada día civil Mexico City.
 */
import { mexicoCityDayKey } from "../services/lucyAuditorTime.js";

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

export type GeminiSpendSnapshot = {
  dayKey: string;
  note: string;
  chat: ChannelSpend;
  auditor: ChannelSpend;
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

let spendDayKey = "";
let chatSpend = emptyChannel();
let auditorSpend = emptyChannel();

function ensureToday(): void {
  const key = mexicoCityDayKey();
  if (key !== spendDayKey) {
    spendDayKey = key;
    chatSpend = emptyChannel();
    auditorSpend = emptyChannel();
  }
}

function envRate(name: string, fallback: number): number {
  const n = Number(process.env[name] ?? "");
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
}

function warnLimit(envName: string, fallback: number): number {
  const n = Number(process.env[envName] ?? fallback);
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
  return {
    dayKey: spendDayKey,
    note: "Estimado Lucy (tokens × precios publicados). No es la factura de Google. Se reinicia al redeploy / nuevo día Mexico.",
    chat,
    auditor,
    totalUsdEstimate:
      Math.round((chat.usdEstimate + auditor.usdEstimate) * 1_000_000) /
      1_000_000,
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
