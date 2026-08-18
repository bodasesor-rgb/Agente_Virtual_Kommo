import OpenAI from "openai";
import { getOpenAiApiKeyForClient, isOpenAiConfigured } from "../lib/openaiEnv.js";
import { completeChat } from "../lib/llmChat.js";
import { getChatModel, getLlmProvider, isGeminiConfigured } from "../lib/llmEnv.js";
import {
  isImageMessage,
  getImageUrl,
  getImageCaption,
  analyzeImageFull,
  formatImageTurnText,
  formatImageTeamNote,
  type ImageAnalysis,
} from "./imageProcessor.js";
import type pino from "pino";

type Log = pino.Logger;
type Msg = Record<string, unknown>;
type Att = Record<string, unknown>;

const AUDIO_TYPES = new Set(["audio", "voice"]);

const VOICE_TRANSCRIBE_PROMPT =
  "Transcribe esta nota de voz en español mexicano. Devuelve SOLO el texto hablado, " +
  "sin comillas, sin prefijos ni comentarios. Si no se entiende, responde exactamente: [inaudible]";

function detectAudioMime(contentType: string | null, audioUrl: string): string {
  const ct = (contentType || "").split(";")[0]?.trim().toLowerCase() || "";
  if (ct.startsWith("audio/")) {
    if (ct === "audio/mpeg") return "audio/mp3";
    return ct;
  }
  if (/\.mp3(\?|$)/i.test(audioUrl)) return "audio/mp3";
  if (/\.wav(\?|$)/i.test(audioUrl)) return "audio/wav";
  if (/\.m4a(\?|$)/i.test(audioUrl)) return "audio/mp4";
  if (/\.webm(\?|$)/i.test(audioUrl)) return "audio/webm";
  // WhatsApp / Kommo suelen mandar ogg/opus
  return "audio/ogg";
}

async function transcribeWithGemini(
  base64: string,
  mimeType: string,
  log: Log
): Promise<string | null> {
  const result = await completeChat({
    model: getChatModel(),
    purpose: "voice",
    temperature: 0,
    maxTokens: 800,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VOICE_TRANSCRIBE_PROMPT },
          { type: "input_audio", mimeType, base64 },
        ],
      },
    ],
  });
  const text = result.text.trim().replace(/^["«]|["»]$/g, "");
  if (!text || /^\[inaudible\]$/i.test(text)) {
    log.warn({ chars: text.length }, "Gemini no pudo transcribir la nota de voz");
    return null;
  }
  log.info({ chars: text.length, provider: result.provider }, "Nota de voz transcrita (Gemini)");
  return text;
}

async function transcribeWithWhisper(
  audioBuffer: ArrayBuffer,
  mimeType: string,
  log: Log
): Promise<string | null> {
  if (!isOpenAiConfigured()) return null;
  const openai = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });
  const ext = mimeType.includes("mpeg") || mimeType.includes("mp3") ? "mp3" : "ogg";
  const audioBlob = new Blob([audioBuffer], { type: mimeType || "audio/ogg" });
  const audioFile = new File([audioBlob], `voice.${ext}`, {
    type: mimeType || "audio/ogg",
  });
  const transcription = (await openai.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
    language: "es",
    response_format: "text",
  })) as unknown as string;
  log.info({ chars: transcription.length }, "Nota de voz transcrita (Whisper fallback)");
  return transcription;
}

// ─── Core functions ───────────────────────────────────────────────────────────

export async function transcribeVoiceNote(
  audioUrl: string,
  accessToken: string,
  log: Log
): Promise<string | null> {
  try {
    const audioResponse = await fetch(audioUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!audioResponse.ok) {
      log.warn(
        { status: audioResponse.status, audioUrl },
        "Error descargando audio de nota de voz"
      );
      return null;
    }

    const contentType = audioResponse.headers.get("content-type");
    const mimeType = detectAudioMime(contentType, audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString("base64");

    // Preferir Gemini (mismo proveedor que chat/visión). Whisper solo si Gemini falla.
    if (isGeminiConfigured() || getLlmProvider() === "gemini") {
      try {
        const geminiText = await transcribeWithGemini(base64, mimeType, log);
        if (geminiText) return geminiText;
      } catch (err) {
        log.warn({ err }, "Gemini falló transcribiendo voz — intento Whisper");
      }
    }

    return await transcribeWithWhisper(audioBuffer, mimeType, log);
  } catch (err) {
    log.error({ err }, "Error transcribiendo nota de voz");
    return null;
  }
}

export function isVoiceNote(message: Msg): boolean {
  // Pattern 1 (Kommo): "attachment" singular con type "voice"/"audio"
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const a = att as Att;
    if (AUDIO_TYPES.has(String(a["type"] ?? ""))) return true;
    if (typeof a["mime_type"] === "string" && a["mime_type"].startsWith("audio/")) return true;
  }

  // Pattern 2: "attachments" array
  const atts = message["attachments"];
  if (Array.isArray(atts)) {
    for (const item of atts) {
      if (typeof item === "object" && item !== null) {
        const a = item as Att;
        if (AUDIO_TYPES.has(String(a["type"] ?? ""))) return true;
        if (typeof a["mime_type"] === "string" && a["mime_type"].startsWith("audio/")) return true;
      }
    }
  }

  // Pattern 3: top-level media_type (NOT "type" — that's "incoming"/"outgoing" in Kommo)
  const mediaType = String(message["media_type"] ?? "");
  if (AUDIO_TYPES.has(mediaType)) return true;

  // Pattern 4: top-level mime_type
  const mimeType = String(message["mime_type"] ?? "");
  if (mimeType.startsWith("audio/")) return true;

  return false;
}

export function getVoiceNoteUrl(message: Msg): string | null {
  // Pattern 1 (Kommo): attachment.link (singular)
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const a = att as Att;
    for (const key of ["link", "url", "media_url"]) {
      if (typeof a[key] === "string" && (a[key] as string).length > 0) return a[key] as string;
    }
  }

  // Pattern 2: attachments array
  const atts = message["attachments"];
  if (Array.isArray(atts)) {
    for (const item of atts) {
      if (typeof item === "object" && item !== null) {
        const a = item as Att;
        if (AUDIO_TYPES.has(String(a["type"] ?? ""))) {
          for (const key of ["link", "url", "media_url"]) {
            if (typeof a[key] === "string" && (a[key] as string).length > 0) return a[key] as string;
          }
        }
      }
    }
  }

  // Pattern 3: top-level URL fields
  for (const key of ["media_url", "file_url", "url"]) {
    if (typeof message[key] === "string" && (message[key] as string).length > 0) {
      return message[key] as string;
    }
  }

  // Pattern 4: nested media object
  const media = message["media"];
  if (typeof media === "object" && media !== null) {
    const m = media as Att;
    if (typeof m["url"] === "string" && m["url"].length > 0) return m["url"] as string;
  }

  return null;
}

export interface ProcessedMessage {
  text: string;
  isVoice: boolean;
  isImage: boolean;
  /** Texto crudo de la transcripción/descripción, para guardar como nota interna en Kommo. */
  mediaNote: string | null;
  /** Respuesta accionable al cliente cuando el mensaje es una imagen. */
  imageClientReply?: string | null;
  imageIntent?: ImageAnalysis["intent"] | null;
  amountMxn?: number | null;
  paymentMethod?: ImageAnalysis["paymentMethod"];
}

export async function processMessage(
  message: Msg,
  accessToken: string,
  log: Log
): Promise<ProcessedMessage> {
  if (isVoiceNote(message)) {
    log.info(
      { attachmentType: (message["attachment"] as Att | undefined)?.["type"] },
      "Nota de voz detectada"
    );
    const audioUrl = getVoiceNoteUrl(message);
    if (audioUrl) {
      const transcription = await transcribeVoiceNote(audioUrl, accessToken, log);
      if (transcription) {
        return { text: transcription, isVoice: true, isImage: false, mediaNote: transcription };
      }
    } else {
      log.warn({ messageKeys: Object.keys(message) }, "Nota de voz sin URL — revisar estructura");
    }
    return {
      text: "[El cliente envió una nota de voz pero no se pudo procesar]",
      isVoice: true,
      isImage: false,
      mediaNote: null,
    };
  }

  if (isImageMessage(message)) {
    log.info(
      { attachmentType: (message["attachment"] as Att | undefined)?.["type"] },
      "Imagen detectada"
    );
    const imageUrl = getImageUrl(message);
    const caption = getImageCaption(message);
    if (imageUrl) {
      const analysis = await analyzeImageFull(imageUrl, accessToken, log);
      if (analysis) {
        return {
          text: formatImageTurnText(analysis, caption),
          isVoice: false,
          isImage: true,
          mediaNote: formatImageTeamNote(analysis, caption),
          imageClientReply: analysis.clientReply,
          imageIntent: analysis.intent,
          amountMxn: analysis.amountMxn ?? null,
          paymentMethod: analysis.paymentMethod ?? null,
        };
      }
    } else {
      log.warn({ messageKeys: Object.keys(message) }, "Imagen sin URL — revisar estructura");
    }
    const fallback =
      caption?.trim() ||
      "[El cliente envió una imagen. Pregúntale qué quiere mostrar o cotizar con esa foto.]";
    return {
      text: fallback,
      isVoice: false,
      isImage: true,
      mediaNote: caption?.trim() || null,
      imageClientReply: null,
      imageIntent: null,
    };
  }

  const nested = message["message"];
  const nestedText =
    nested && typeof nested === "object"
      ? String((nested as Record<string, unknown>)["text"] ?? "")
      : "";
  const text =
    (typeof message["text"] === "string" && message["text"]) ||
    (typeof message["message"] === "string" && message["message"]) ||
    nestedText ||
    "";
  return { text, isVoice: false, isImage: false, mediaNote: null };
}

/** Frase corta mientras se procesa audio (si el webhook responde en dos tiempos). */
export function getVoiceAcknowledgment(): string {
  return "Dame un segundo, estoy escuchando tu nota de voz…";
}
