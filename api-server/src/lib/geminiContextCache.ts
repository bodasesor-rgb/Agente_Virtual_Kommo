/**
 * Explicit Context Caching de Gemini para el system prompt de Lucy.
 * Reutiliza `cachedContent` entre turnos cuando el system instruction no cambia
 * (mismo hash → mismo cache). Si create falla o el prompt es corto, fallback
 * a systemInstruction inline (sin romper el chat).
 */
import { createHash } from "node:crypto";
import type { GoogleGenAI } from "@google/genai";
import { DEFAULT_GEMINI_MODEL } from "./llmEnv.js";

/** Flash-Lite exige ~1024 tokens mínimos; ~3500 chars es un umbral seguro. */
const MIN_CACHE_CHARS = 3500;
const DEFAULT_TTL_SEC = 3600;

type CacheEntry = {
  name: string;
  expireAtMs: number;
  tokenCount?: number;
};

const cacheByHash = new Map<string, CacheEntry>();

const stats = {
  hits: 0,
  creates: 0,
  misses: 0,
  errors: 0,
  disabled: 0,
  tooShort: 0,
  lastCacheName: null as string | null,
  lastHash: null as string | null,
};

export function getGeminiContextCacheStats(): typeof stats {
  return { ...stats };
}

export function resetGeminiContextCacheForTests(): void {
  cacheByHash.clear();
  stats.hits = 0;
  stats.creates = 0;
  stats.misses = 0;
  stats.errors = 0;
  stats.disabled = 0;
  stats.tooShort = 0;
  stats.lastCacheName = null;
  stats.lastHash = null;
}

/**
 * V9.32: default OFF.
 * El system dinámico (catálogo/CRM) invalidaba el hash en cada turno → thrashing
 * (creates >> hits) y cobro de storage. Solo activar con GEMINI_CONTEXT_CACHE=1
 * cuando el system sea estático (buildStaticSystemPrompt).
 */
function isCacheEnabled(): boolean {
  const raw = (process.env["GEMINI_CONTEXT_CACHE"] ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function ttlSec(): number {
  const n = Number(process.env["GEMINI_CONTEXT_CACHE_TTL_SEC"] ?? DEFAULT_TTL_SEC);
  if (!Number.isFinite(n) || n < 120) return DEFAULT_TTL_SEC;
  return Math.min(Math.floor(n), 24 * 3600);
}

export function hashSystemInstruction(system: string): string {
  return createHash("sha256").update(system).digest("hex").slice(0, 24);
}

/**
 * Devuelve el resource name del cache (`cachedContents/...`) o null para
 * enviar systemInstruction inline.
 */
export async function getOrCreateSystemCache(
  ai: GoogleGenAI,
  system: string,
  model: string = DEFAULT_GEMINI_MODEL
): Promise<string | null> {
  if (!system.trim()) return null;
  if (!isCacheEnabled()) {
    stats.disabled += 1;
    return null;
  }
  if (system.length < MIN_CACHE_CHARS) {
    stats.tooShort += 1;
    return null;
  }

  const hash = hashSystemInstruction(system);
  stats.lastHash = hash;
  const existing = cacheByHash.get(hash);
  // Renovar margen: no usar cache a <90s de expirar.
  if (existing && existing.expireAtMs > Date.now() + 90_000) {
    stats.hits += 1;
    stats.lastCacheName = existing.name;
    return existing.name;
  }

  const ttl = ttlSec();
  try {
    const cached = await ai.caches.create({
      model,
      config: {
        displayName: `lucy-sys-${hash}`,
        systemInstruction: system,
        ttl: `${ttl}s`,
      },
    });
    if (!cached.name) {
      stats.errors += 1;
      stats.misses += 1;
      return null;
    }
    const entry: CacheEntry = {
      name: cached.name,
      expireAtMs: Date.now() + ttl * 1000,
      tokenCount: cached.usageMetadata?.totalTokenCount,
    };
    cacheByHash.set(hash, entry);
    stats.creates += 1;
    stats.lastCacheName = cached.name;
    return cached.name;
  } catch {
    stats.errors += 1;
    stats.misses += 1;
    return null;
  }
}
