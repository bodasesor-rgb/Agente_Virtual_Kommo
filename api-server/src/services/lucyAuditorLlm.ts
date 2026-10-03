/**
 * Canal LLM solo para el auditor offline.
 * NUNCA usar para WhatsApp / Kommo outbound.
 * Modelo barato: gemini-2.5-flash (override LUCY_AUDITOR_MODEL).
 */
import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, isLlmConfigured } from "../lib/llmEnv.js";
import { recordGeminiSpend } from "../lib/lucyGeminiSpend.js";
import { logger } from "../lib/logger.js";
import { readAuditorQuota, writeAuditorQuota } from "./lucyAuditorLog.js";

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

/** El cupo se guarda en disco: cada publicación reinicia el servidor y no debe regalar 40 llamadas más. */
function syncQuotaDay(): void {
  const key = todayKey();
  if (key === dayKey) return;
  dayKey = key;
  callsToday = readAuditorQuota(key);
}

export function getAuditorQuotaSnapshot(): {
  callsToday: number;
  maxPerDay: number;
  model: string;
  remaining: number;
} {
  syncQuotaDay();
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
  syncQuotaDay();
  callsToday += 1;
  writeAuditorQuota(dayKey, callsToday);
}

/** Qué pasó con las respuestas de Gemini (para saber si encuentra poco o si se tiran sus hallazgos). */
export interface AuditorLlmStats {
  calls: number;
  errors: number;
  proposed: number;
  droppedNoQuote: number;
  kept: number;
  lastError?: string;
}

let llmStats: AuditorLlmStats = { calls: 0, errors: 0, proposed: 0, droppedNoQuote: 0, kept: 0 };

export function takeAuditorLlmStats(): AuditorLlmStats {
  const out = llmStats;
  llmStats = { calls: 0, errors: 0, proposed: 0, droppedNoQuote: 0, kept: 0 };
  return out;
}

export interface AuditorLlmFinding {
  category: string;
  severity: "info" | "warn" | "error";
  evidence: string;
  proposedRepair: string;
}

export const AUDITOR_LLM_CATEGORIES = [
  "loop_links",
  "repeat_reply",
  "premature_close",
  "bad_field",
  "stuck_funnel",
  "ignored_question",
  "asked_known_data",
  "misunderstood",
  "wrong_info",
  "tone",
  "handoff",
  "other",
] as const;

/** «silent»: el cliente dejó de contestar justo después de Lucy (búsqueda de puntos ciegos). */
export type AuditorLlmMode = "daily" | "silent";

/** Separa lo ya revisado (contexto) de lo nuevo; solo se reportan errores debajo. */
export const AUDITOR_NEW_MARKER = "=== MENSAJES NUEVOS: revisa solo desde aquí ===";

const MAX_TRANSCRIPT_CHARS = 6000;

export function buildAuditorPrompt(
  transcript: string,
  mode: AuditorLlmMode = "daily",
  lessonsBlock = ""
): string {
  return [
    "Eres el supervisor de calidad de Lucy, la vendedora virtual de Bodasesor por WhatsApp",
    "(renta de mobiliario, banquetes, barras, decoración y servicios para eventos). NUNCA escribes al cliente.",
    "El trabajo de Lucy: entender qué quiere el cliente, contestar sus dudas (precios, catálogo, qué incluye)",
    "y juntar los datos (nombre, tipo de evento, servicios, fecha, horario, invitados, lugar, presupuesto, correo)",
    "para pasarlo a un asesor humano. Líneas HUMANO son del equipo, no de Lucy.",
    "",
    "Busca CUALQUIER cosa que Lucy hizo mal y que pueda costar la venta o verse mal. Ejemplos, no te limites a ellos:",
    "- ignoró o no contestó una pregunta del cliente (ignored_question)",
    "- pidió un dato que el cliente ya había dado (asked_known_data)",
    "- entendió mal lo que el cliente pidió (misunderstood)",
    "- dio información que suena inventada o contradice algo dicho antes (wrong_info)",
    "- repitió la misma respuesta o se quedó en bucle (repeat_reply, loop_links, stuck_funnel)",
    "- cerró («ya tengo todo», «un asesor te contacta») cuando el cliente seguía preguntando (premature_close)",
    "- anotó mal un dato del evento (bad_field)",
    "- mensaje demasiado largo, confuso, frío o robótico; nombre mal usado (tone)",
    "- elogio forzado o exagerado («¡Qué buen plan!», «suena increíble», «¡Qué padre!», «¡Qué emoción!») o anglicismos como «vibe»:",
    "  Bodasesor quiere tono cordial y profesional, p. ej. «Perfecto, con gusto te ayudamos con…».",
    "  Esto NO es gusto menor: repórtalo siempre (tone)",
    "- ofreció o desaconsejó algo que el cliente no pidió, o supuso un estilo/tipo de evento sin que lo dijera (misunderstood)",
    "- contestó encima del equipo humano, o no pasó a humano cuando el cliente lo pidió o se molestó (handoff)",
    ...(mode === "silent"
      ? [
          "",
          "IMPORTANTE: el cliente dejó de contestar justo después del último mensaje de Lucy.",
          "Revisa si algo de Lucy pudo causarlo. Si el silencio parece normal (ya tenía lo que necesitaba,",
          "dijo que lo pensaría, se despidió), responde [].",
        ]
      : []),
    ...(lessonsBlock.trim() ? ["", lessonsBlock.trim()] : []),
    "",
    "REGLAS ESTRICTAS:",
    `- Si aparece la línea «${AUDITOR_NEW_MARKER}», lo de arriba es solo contexto ya revisado: reporta errores solo en mensajes de Lucy debajo de esa línea.`,
    "- Solo reporta si puedes copiar TEXTUAL un fragmento del mensaje de LUCY que estuvo mal (lucy_quote, 8-120 caracteres).",
    "- Nada de gustos de estilo menores. Si el chat está bien, responde [].",
    "- Máximo 3 hallazgos, el más grave primero.",
    "",
    "Responde SOLO un JSON array:",
    '[{"category":"…","severity":"info|warn|error","problem":"el error en general, máx. 12 palabras, sin datos del cliente",',
    '"client_quote":"lo que dijo el cliente antes (textual, corto)","lucy_quote":"fragmento textual de Lucy",',
    '"proposedRepair":"qué regla general debe cambiar en Lucy (no algo para este cliente)"}]',
    `category: ${AUDITOR_LLM_CATEGORIES.join("|")}`,
    "",
    "TRANSCRIPT:",
    transcript.slice(-MAX_TRANSCRIPT_CHARS),
  ].join("\n");
}

function normQuote(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

/**
 * La cita de Lucy tiene que existir de verdad en algún mensaje de LUCY (filtra hallazgos inventados).
 * Tolera «…» entre fragmentos y diferencias mínimas (≥85 % de las palabras, en un mismo mensaje).
 */
export function lucyQuoteIsReal(transcript: string, quote: string): boolean {
  const cleaned = quote.replace(/^\s*lucy\s*:\s*/i, "");
  const fragments = cleaned
    .split(/\.{3}|…/)
    .map(normQuote)
    .filter((f) => f.length >= 8);
  if (!fragments.length) return false;
  const lines = transcript.split("\n");
  const marker = lines.lastIndexOf(AUDITOR_NEW_MARKER);
  const lucyLines = lines
    .slice(marker + 1)
    .filter((line) => line.startsWith("LUCY:"))
    .map(normQuote);
  if (lucyLines.some((line) => fragments.every((f) => line.includes(f)))) return true;
  const words = normQuote(cleaned).split(" ").filter((w) => w.length >= 3);
  if (words.length < 4) return false;
  return lucyLines.some((line) => {
    const have = new Set(line.split(" "));
    return words.filter((w) => have.has(w)).length / words.length >= 0.85;
  });
}

export function parseAuditorLlmFindings(text: string, transcript: string): AuditorLlmFinding[] {
  return parseAuditorLlmDetailed(text, transcript).findings;
}

function parseAuditorLlmDetailed(
  text: string,
  transcript: string
): { findings: AuditorLlmFinding[]; proposed: number; droppedNoQuote: number } {
  const parsed = JSON.parse(text) as unknown;
  const list = Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  const allowed = new Set<string>(AUDITOR_LLM_CATEGORIES);
  const out: AuditorLlmFinding[] = [];
  let droppedNoQuote = 0;
  for (const x of list) {
    if (out.length >= 3) break;
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const lucyQuote = String(o.lucy_quote ?? "").trim().slice(0, 160);
    if (!lucyQuoteIsReal(transcript, lucyQuote)) {
      droppedNoQuote += 1;
      continue;
    }
    const problem = String(o.problem ?? o.evidence ?? "")
      .trim()
      .replace(/[.\s]+$/, "")
      .slice(0, 140);
    const proposedRepair = String(o.proposedRepair ?? "").trim().slice(0, 800);
    if (!problem || !proposedRepair) continue;
    const clientQuote = String(o.client_quote ?? "").trim().slice(0, 200);
    const category = String(o.category ?? "other").trim();
    out.push({
      category: allowed.has(category) ? category : "other",
      severity: (["info", "warn", "error"].includes(String(o.severity)) ? o.severity : "warn") as
        | "info"
        | "warn"
        | "error",
      // La descripción va primero: agrupa el mismo bug sin mezclar errores distintos.
      evidence: `${problem}. ${clientQuote ? `Cliente: «${clientQuote}» → ` : ""}Lucy: «${lucyQuote}»`.slice(0, 800),
      proposedRepair,
    });
  }
  return { findings: out, proposed: list.length, droppedNoQuote };
}

/**
 * Una llamada Flash barata. Solo lectura de transcript → JSON.
 * Hard rule: este módulo no importa senders de WhatsApp/Kommo.
 */
export async function runAuditorLlm(
  transcript: string,
  mode: AuditorLlmMode = "daily",
  lessonsBlock = ""
): Promise<AuditorLlmFinding[]> {
  if (!canSpendAuditorCall()) return [];
  const model = getAuditorModel();
  const key = getGeminiApiKey();
  if (!key) return [];

  noteAuditorCall();
  const ai = new GoogleGenAI({ apiKey: key });
  const prompt = buildAuditorPrompt(transcript, mode, lessonsBlock);

  try {
    const result = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.1,
        // Incluye el «pensamiento» de 2.5 Flash: con 800 el JSON salía cortado.
        maxOutputTokens: 1500,
        thinkingConfig: { thinkingBudget: 384 },
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
    llmStats.calls += 1;
    const text = (result.text ?? "").trim();
    if (!text) {
      llmStats.errors += 1;
      llmStats.lastError = "respuesta vacía";
      return [];
    }
    let detailed: ReturnType<typeof parseAuditorLlmDetailed>;
    try {
      detailed = parseAuditorLlmDetailed(text, transcript.slice(-MAX_TRANSCRIPT_CHARS));
    } catch {
      llmStats.errors += 1;
      llmStats.lastError = `JSON inválido o cortado (${text.length} caracteres)`;
      return [];
    }
    llmStats.proposed += detailed.proposed;
    llmStats.droppedNoQuote += detailed.droppedNoQuote;
    llmStats.kept += detailed.findings.length;
    return detailed.findings;
  } catch (err) {
    llmStats.calls += 1;
    llmStats.errors += 1;
    llmStats.lastError = (err instanceof Error ? err.message : String(err)).slice(0, 200);
    logger.warn({ err, model }, "runAuditorLlm falló");
    return [];
  }
}
