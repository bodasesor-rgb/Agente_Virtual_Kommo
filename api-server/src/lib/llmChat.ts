/**
 * Capa unificada de chat: Gemini 3.1 Flash-Lite (default) u OpenAI.
 * Misma API de mensajes estilo OpenAI para no reescribir todo el pipeline.
 *
 * V9.00 costo:
 * - Explicit Context Caching del system prompt (cachedContent).
 * - Multimedia (imagen/audio) solo en purpose vision/voice; historial = texto.
 */
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { getOpenAiApiKeyForClient } from "./openaiEnv.js";
import {
  DEFAULT_GEMINI_MODEL,
  getChatModel,
  getGeminiApiKey,
  getLlmProvider,
  isBlockedGeminiModel,
  isLlmConfigured,
  resolveGeminiModel,
  type LlmProvider,
} from "./llmEnv.js";
import {
  getGeminiContextCacheStats,
  getOrCreateSystemCache,
} from "./geminiContextCache.js";

/** Contadores en memoria para /api/health (diagnóstico de gasto). */
const geminiCallStats = {
  total: 0,
  byPurpose: {} as Record<string, number>,
  lastModel: null as string | null,
  lastAt: null as string | null,
  blockedOverrides: 0,
  /** Turnos donde se omitió reenviar imagen/audio del historial. */
  mediaStripped: 0,
  /** Llamadas que usaron cachedContent. */
  contextCacheUsed: 0,
  /** Llamadas con systemInstruction inline (sin cache). */
  contextCacheSkipped: 0,
};

export function getGeminiCallStats(): typeof geminiCallStats & {
  context_cache: ReturnType<typeof getGeminiContextCacheStats>;
} {
  return {
    ...geminiCallStats,
    byPurpose: { ...geminiCallStats.byPurpose },
    context_cache: getGeminiContextCacheStats(),
  };
}

export type GeminiCallPurpose =
  | "chat"
  | "extract"
  | "vision"
  | "voice"
  | "learning"
  | "redaction"
  | "other";

export type ChatRole = "system" | "user" | "assistant";

export type ChatTextPart = { type: "text"; text: string };
export type ChatImagePart = {
  type: "image_url";
  image_url: { url: string };
  /** mime opcional si ya tenemos el buffer aparte */
  mimeType?: string;
  /** base64 sin data: prefix */
  base64?: string;
};
export type ChatAudioPart = {
  type: "input_audio";
  mimeType: string;
  /** base64 sin data: prefix */
  base64: string;
};

export type ChatContent = string | Array<ChatTextPart | ChatImagePart | ChatAudioPart>;

export interface ChatMessage {
  role: ChatRole;
  content: ChatContent;
}

export interface CompleteChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  model?: string;
  /** frequency/presence solo aplican en OpenAI */
  frequencyPenalty?: number;
  presencePenalty?: number;
  topP?: number;
  /** Etiqueta para métricas/logs (no cambia el modelo). */
  purpose?: GeminiCallPurpose;
}

export interface CompleteChatResult {
  text: string;
  provider: LlmProvider;
  model: string;
}

function asText(content: ChatContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is ChatTextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function splitSystem(messages: ChatMessage[]): {
  system: string;
  rest: ChatMessage[];
} {
  const systemParts: string[] = [];
  const rest: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      const t = asText(m.content).trim();
      if (t) systemParts.push(t);
    } else {
      rest.push(m);
    }
  }
  return { system: systemParts.join("\n\n"), rest };
}

function parseDataUrl(url: string): { mimeType: string; base64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(url);
  if (!m) return null;
  return { mimeType: m[1]!, base64: m[2]! };
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  }
  return geminiClient;
}

let openaiClient: OpenAI | null = null;
function getOpenAiClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });
  }
  return openaiClient;
}

/** Solo vision/voice reenvían binarios; el resto del pipeline guarda texto. */
function purposeAllowsMedia(purpose: GeminiCallPurpose): boolean {
  return purpose === "vision" || purpose === "voice";
}

async function completeWithGemini(opts: CompleteChatOptions): Promise<CompleteChatResult> {
  // V8.98: pin estricto — nunca Nano Banana / Imagen / Pro caros.
  const requested = opts.model ?? getChatModel();
  const model = resolveGeminiModel(requested);
  if (isBlockedGeminiModel(requested) || requested !== model) {
    geminiCallStats.blockedOverrides += 1;
  }
  const purpose = opts.purpose ?? "other";
  const allowMedia = purposeAllowsMedia(purpose);
  geminiCallStats.total += 1;
  geminiCallStats.byPurpose[purpose] = (geminiCallStats.byPurpose[purpose] ?? 0) + 1;
  geminiCallStats.lastModel = model;
  geminiCallStats.lastAt = new Date().toISOString();

  const { system, rest } = splitSystem(opts.messages);

  const contents = rest.map((m) => {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") {
      return { role, parts: [{ text: m.content }] };
    }
    const parts: Array<Record<string, unknown>> = [];
    for (const p of m.content) {
      if (p.type === "text") {
        parts.push({ text: p.text });
      } else if (p.type === "image_url") {
        if (!allowMedia) {
          geminiCallStats.mediaStripped += 1;
          parts.push({
            text: "[imagen ya analizada — ver texto del turno; no reenviar binario]",
          });
          continue;
        }
        // Visión = LEER foto del cliente con flash-lite (NO generateImages).
        const fromUrl = parseDataUrl(p.image_url.url);
        const mimeType = p.mimeType || fromUrl?.mimeType || "image/jpeg";
        const data = p.base64 || fromUrl?.base64;
        if (data) {
          parts.push({ inlineData: { mimeType, data } });
        }
      } else if (p.type === "input_audio") {
        if (!allowMedia) {
          geminiCallStats.mediaStripped += 1;
          parts.push({
            text: "[audio ya transcrito — ver texto del turno; no reenviar binario]",
          });
          continue;
        }
        parts.push({
          inlineData: { mimeType: p.mimeType || "audio/ogg", data: p.base64 },
        });
      }
    }
    if (!parts.length) parts.push({ text: "" });
    return { role, parts };
  });

  // Gemini exige que el primer turno sea user; si el historial empieza con assistant, prepend.
  if (contents.length && contents[0]!.role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "(continúa la conversación)" }] });
  }
  if (!contents.length) {
    contents.push({ role: "user", parts: [{ text: "Hola" }] });
  }

  const ai = getGeminiClient();
  // Solo generateContent con flash-lite. Nunca generateImages / editImage.
  if (model !== DEFAULT_GEMINI_MODEL) {
    throw new Error(`Modelo Gemini no permitido: ${model} (solo ${DEFAULT_GEMINI_MODEL})`);
  }

  // V9.00: cachedContent si el system es largo; si no, systemInstruction inline.
  let cachedContent: string | null = null;
  if (system) {
    cachedContent = await getOrCreateSystemCache(ai, system, DEFAULT_GEMINI_MODEL);
  }
  if (cachedContent) {
    geminiCallStats.contextCacheUsed += 1;
  } else if (system) {
    geminiCallStats.contextCacheSkipped += 1;
  }

  const response = await ai.models.generateContent({
    model: DEFAULT_GEMINI_MODEL,
    contents,
    config: {
      ...(cachedContent
        ? { cachedContent }
        : system
          ? { systemInstruction: system }
          : {}),
      temperature: opts.temperature ?? 0.6,
      maxOutputTokens: opts.maxTokens ?? 1200,
      ...(opts.topP != null ? { topP: opts.topP } : {}),
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  });

  const text = (response.text ?? "").trim();
  return { text, provider: "gemini", model: DEFAULT_GEMINI_MODEL };
}

async function completeWithOpenAi(opts: CompleteChatOptions): Promise<CompleteChatResult> {
  const model = opts.model ?? getChatModel();
  const openai = getOpenAiClient();

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = opts.messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const p of m.content) {
      if (p.type === "text") {
        parts.push({ type: "text", text: p.text });
      } else if (p.type === "image_url") {
        parts.push({ type: "image_url", image_url: { url: p.image_url.url } });
      } else if (p.type === "input_audio") {
        // OpenAI chat no acepta audio inline aquí — Whisper es el fallback de voz.
        parts.push({
          type: "text",
          text: "[audio adjunto — usar Whisper para transcribir]",
        });
      }
    }
    return { role: m.role, content: parts } as OpenAI.Chat.ChatCompletionMessageParam;
  });

  const completion = await openai.chat.completions.create({
    model,
    messages,
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.maxTokens ?? 1200,
    ...(opts.frequencyPenalty != null ? { frequency_penalty: opts.frequencyPenalty } : {}),
    ...(opts.presencePenalty != null ? { presence_penalty: opts.presencePenalty } : {}),
    ...(opts.topP != null ? { top_p: opts.topP } : {}),
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
  });

  const text = (completion.choices[0]?.message?.content ?? "").trim();
  return { text, provider: "openai", model };
}

/**
 * Completa un chat con el proveedor activo.
 * Si Gemini falla y hay OpenAI, intenta fallback (salvo LLM_PROVIDER forzado a gemini
 * y LLM_NO_FALLBACK=1).
 */
export async function completeChat(opts: CompleteChatOptions): Promise<CompleteChatResult> {
  if (!isLlmConfigured()) {
    throw new Error("LLM no configurado (GEMINI_API_KEY u OPEN_AI)");
  }

  const provider = getLlmProvider();
  const noFallback = (process.env["LLM_NO_FALLBACK"] ?? "").trim() === "1";

  try {
    if (provider === "gemini") {
      return await completeWithGemini(opts);
    }
    return await completeWithOpenAi(opts);
  } catch (err) {
    // Fallback a OpenAI solo si Gemini falló y hay key (salvo LLM_NO_FALLBACK=1).
    if (
      provider === "gemini" &&
      !noFallback &&
      getOpenAiApiKeyForClient() !== "lucy-not-configured"
    ) {
      try {
        return await completeWithOpenAi({
          ...opts,
          model: process.env["OPENAI_MODEL"]?.trim() || "gpt-4o-mini",
        });
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

/** Convierte mensajes OpenAI del pipeline a ChatMessage. */
export function fromOpenAiMessages(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role !== "system" && m.role !== "user" && m.role !== "assistant") continue;
    const role = m.role as ChatRole;
    const c = m.content;
    if (typeof c === "string") {
      out.push({ role, content: c });
      continue;
    }
    if (Array.isArray(c)) {
      const parts: Array<ChatTextPart | ChatImagePart> = [];
      for (const p of c) {
        if (!p || typeof p !== "object") continue;
        if ("type" in p && p.type === "text" && "text" in p && typeof p.text === "string") {
          parts.push({ type: "text", text: p.text });
        } else if (
          "type" in p &&
          p.type === "image_url" &&
          "image_url" in p &&
          p.image_url &&
          typeof p.image_url === "object" &&
          "url" in p.image_url &&
          typeof (p.image_url as { url: unknown }).url === "string"
        ) {
          parts.push({
            type: "image_url",
            image_url: { url: (p.image_url as { url: string }).url },
          });
        }
      }
      out.push({ role, content: parts.length ? parts : "" });
    }
  }
  return out;
}
