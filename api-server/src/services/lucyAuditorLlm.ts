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

export function buildAuditorPrompt(transcript: string, mode: AuditorLlmMode = "daily"): string {
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
    "- contestó encima del equipo humano, o no pasó a humano cuando el cliente lo pidió o se molestó (handoff)",
    ...(mode === "silent"
      ? [
          "",
          "IMPORTANTE: el cliente dejó de contestar justo después del último mensaje de Lucy.",
          "Revisa si algo de Lucy pudo causarlo. Si el silencio parece normal (ya tenía lo que necesitaba,",
          "dijo que lo pensaría, se despidió), responde [].",
        ]
      : []),
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

/** La cita de Lucy tiene que existir de verdad en algún mensaje de LUCY (filtra hallazgos inventados). */
export function lucyQuoteIsReal(transcript: string, quote: string): boolean {
  const q = normQuote(quote);
  if (q.length < 8) return false;
  const lines = transcript.split("\n");
  const marker = lines.lastIndexOf(AUDITOR_NEW_MARKER);
  return lines
    .slice(marker + 1)
    .filter((line) => line.startsWith("LUCY:"))
    .some((line) => normQuote(line).includes(q));
}

export function parseAuditorLlmFindings(text: string, transcript: string): AuditorLlmFinding[] {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) return [];
  const allowed = new Set<string>(AUDITOR_LLM_CATEGORIES);
  const out: AuditorLlmFinding[] = [];
  for (const x of parsed.slice(0, 8)) {
    if (out.length >= 3) break;
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const lucyQuote = String(o.lucy_quote ?? "").trim().slice(0, 160);
    if (!lucyQuoteIsReal(transcript, lucyQuote)) continue;
    const problem = String(o.problem ?? o.evidence ?? "").trim().slice(0, 140);
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
  return out;
}

/**
 * Una llamada Flash barata. Solo lectura de transcript → JSON.
 * Hard rule: este módulo no importa senders de WhatsApp/Kommo.
 */
export async function runAuditorLlm(
  transcript: string,
  mode: AuditorLlmMode = "daily"
): Promise<AuditorLlmFinding[]> {
  if (!canSpendAuditorCall()) return [];
  const model = getAuditorModel();
  const key = getGeminiApiKey();
  if (!key) return [];

  noteAuditorCall();
  const ai = new GoogleGenAI({ apiKey: key });
  const prompt = buildAuditorPrompt(transcript, mode);

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
    const text = (result.text ?? "").trim();
    if (!text) return [];
    return parseAuditorLlmFindings(text, transcript.slice(-MAX_TRANSCRIPT_CHARS));
  } catch (err) {
    logger.warn({ err, model }, "runAuditorLlm falló");
    return [];
  }
}
