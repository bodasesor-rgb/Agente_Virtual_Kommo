/**
 * Canal LLM solo para el auditor offline.
 * NUNCA usar para WhatsApp / Kommo outbound.
 * Modelo barato: gemini-2.5-flash (override LUCY_AUDITOR_MODEL).
 */
import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, isLlmConfigured } from "../lib/llmEnv.js";
import { recordGeminiSpend } from "../lib/lucyGeminiSpend.js";
import { logger } from "../lib/logger.js";

export const DEFAULT_AUDITOR_MODEL = "gemini-2.5-flash";

/** Prohibidos: caros / imagen / pro. */
const BLOCKED_AUDITOR =
  /(?:^|\/)(imagen|nano[-\s]?banana|gemini-[\w.-]*-image|gemini-.*-pro|gemini-ultra|gemini-3\.6)(?:$|\/|-)/i;

export function getAuditorModel(): string {
  const raw = (process.env["LUCY_AUDITOR_MODEL"] ?? DEFAULT_AUDITOR_MODEL).trim();
  if (!raw || BLOCKED_AUDITOR.test(raw)) return DEFAULT_AUDITOR_MODEL;
  return raw;
}

export function getAuditorMaxCallsPerDay(): number {
  const n = Number(process.env["LUCY_AUDITOR_MAX_CALLS_PER_DAY"] ?? "40");
  if (!Number.isFinite(n) || n < 0) return 40;
  return Math.min(Math.floor(n), 200);
}

let dayKey = "";
let callsToday = 0;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getAuditorQuotaSnapshot(): {
  callsToday: number;
  maxPerDay: number;
  model: string;
  remaining: number;
} {
  const key = todayKey();
  if (key !== dayKey) {
    dayKey = key;
    callsToday = 0;
  }
  const maxPerDay = getAuditorMaxCallsPerDay();
  return {
    callsToday,
    maxPerDay,
    model: getAuditorModel(),
    remaining: Math.max(0, maxPerDay - callsToday),
  };
}

export function canSpendAuditorCall(): boolean {
  return getAuditorQuotaSnapshot().remaining > 0 && isLlmConfigured();
}

function noteAuditorCall(): void {
  const key = todayKey();
  if (key !== dayKey) {
    dayKey = key;
    callsToday = 0;
  }
  callsToday += 1;
}

export interface AuditorLlmFinding {
  category: string;
  severity: "info" | "warn" | "error";
  evidence: string;
  proposedRepair: string;
}

/**
 * Una llamada Flash barata. Solo lectura de transcript → JSON.
 * Hard rule: este módulo no importa senders de WhatsApp/Kommo.
 */
export async function runAuditorLlm(transcript: string): Promise<AuditorLlmFinding[]> {
  if (!canSpendAuditorCall()) return [];
  const model = getAuditorModel();
  const key = getGeminiApiKey();
  if (!key) return [];

  noteAuditorCall();
  const ai = new GoogleGenAI({ apiKey: key });
  const prompt = [
    "Eres auditor de calidad de Lucy (agente Bodasesor). NUNCA escribes al cliente.",
    "Revisa el transcript y detecta SOLO: bucles de links, respuestas repetidas,",
    "cierre prematuro (ya tengo todo) cuando pedían precio/detalle, campos mal",
    "(cena ocasión como SKU), embudo trabado (misma pregunta 3+ veces).",
    "Responde JSON array: [{category,severity,evidence,proposedRepair}]",
    "category: loop_links|repeat_reply|premature_close|bad_field|stuck_funnel|other",
    "severity: info|warn|error. proposedRepair: acción concreta para el equipo/código.",
    "Si no hay problemas, responde [].",
    "",
    "TRANSCRIPT:",
    transcript.slice(0, 6000),
  ].join("\n");

  try {
    const result = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 800,
        responseMimeType: "application/json",
      },
    });
    try {
      const usage = (result as { usageMetadata?: Record<string, unknown> })
        .usageMetadata;
      recordGeminiSpend({
        channel: "auditor",
        model,
        usage: usage
          ? {
              promptTokenCount: Number(usage.promptTokenCount ?? 0),
              candidatesTokenCount: Number(usage.candidatesTokenCount ?? 0),
              cachedContentTokenCount: Number(
                usage.cachedContentTokenCount ?? 0
              ),
              totalTokenCount: Number(usage.totalTokenCount ?? 0),
            }
          : null,
      });
    } catch {
      /* métricas no deben tumbar el auditor */
    }
    const text = (result.text ?? "").trim();
    if (!text) return [];
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const o = x as Record<string, unknown>;
        return {
          category: String(o.category ?? "other").slice(0, 40),
          severity: (["info", "warn", "error"].includes(String(o.severity))
            ? o.severity
            : "warn") as "info" | "warn" | "error",
          evidence: String(o.evidence ?? "").slice(0, 800),
          proposedRepair: String(o.proposedRepair ?? "").slice(0, 800),
        };
      })
      .filter((f) => f.evidence && f.proposedRepair);
  } catch (err) {
    logger.warn({ err, model }, "runAuditorLlm falló");
    return [];
  }
}
