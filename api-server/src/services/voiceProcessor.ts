import OpenAI from "openai";
import { getOpenAiApiKeyForClient } from "../lib/openaiEnv.js";
import { isImageMessage, getImageUrl, getImageCaption, analyzeImage } from "./imageProcessor.js";
import type pino from "pino";

const openai = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });

type Log = pino.Logger;
type Msg = Record<string, unknown>;
type Att = Record<string, unknown>;

const AUDIO_TYPES = new Set(["audio", "voice"]);

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

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });
    const audioFile = new File([audioBlob], "voice.ogg", { type: "audio/ogg" });

    const transcription = (await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "es",
      response_format: "text",
    })) as unknown as string;

    log.info({ chars: transcription.length }, "Nota de voz transcrita exitosamente");
    return transcription;
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
  /** Análisis Vision estructurado — solo briefing interno de Lucy, no va al mensaje del cliente. */
  imageContext: string | null;
  /** Texto crudo de la transcripción/descripción, para guardar como nota interna en Kommo. */
  mediaNote: string | null;
}

/** Texto que Lucy ve como mensaje del cliente cuando solo hay imagen (sin caption). */
export const IMAGE_ONLY_USER_TEXT = "[El cliente envió una imagen]";

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
        return {
          text: transcription,
          isVoice: true,
          isImage: false,
          imageContext: null,
          mediaNote: transcription,
        };
      }
    } else {
      log.warn({ messageKeys: Object.keys(message) }, "Nota de voz sin URL — revisar estructura");
    }
    return {
      text: "[El cliente envió una nota de voz pero no se pudo procesar]",
      isVoice: true,
      isImage: false,
      imageContext: null,
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
      const description = await analyzeImage(imageUrl, accessToken, log);
      if (description) {
        const text = caption?.trim() ? caption.trim() : IMAGE_ONLY_USER_TEXT;
        return {
          text,
          isVoice: false,
          isImage: true,
          imageContext: description,
          mediaNote: description,
        };
      }
    } else {
      log.warn({ messageKeys: Object.keys(message) }, "Imagen sin URL — revisar estructura");
    }
    return {
      text: caption?.trim() ? caption.trim() : "[El cliente envió una imagen pero no se pudo analizar]",
      isVoice: false,
      isImage: true,
      imageContext: null,
      mediaNote: null,
    };
  }

  // Primary: plain text field
  const rawText = message["text"];
  if (typeof rawText === "string" && rawText.trim()) {
    return { text: rawText, isVoice: false, isImage: false, imageContext: null, mediaNote: null };
  }

  // Fallback: Kommo sometimes sends URL-rich messages as a "link" type attachment
  // with the user's caption in attachment.text or attachment.title
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const a = att as Att;
    const attType = String(a["type"] ?? "");
    if (attType === "link" || attType === "picture" || attType === "document") {
      const caption =
        (typeof a["text"] === "string" ? a["text"] : "") ||
        (typeof a["caption"] === "string" ? a["caption"] : "") ||
        (typeof a["title"] === "string" ? a["title"] : "");
      if (caption.trim()) {
        return { text: caption.trim(), isVoice: false, isImage: false, imageContext: null, mediaNote: null };
      }

      // If there is a URL but no caption, return the URL so Lucy sees something
      const url =
        (typeof a["link"] === "string" ? a["link"] : "") ||
        (typeof a["url"] === "string" ? a["url"] : "");
      if (url.trim()) {
        return { text: url.trim(), isVoice: false, isImage: false, imageContext: null, mediaNote: null };
      }
    }
  }

  return { text: "", isVoice: false, isImage: false, imageContext: null, mediaNote: null };
}

export { getImageAcknowledgment } from "./imageProcessor.js";

export function getVoiceAcknowledgment(clientName?: string): string {
  const suffix = clientName ? `, ${clientName}` : "";
  const options = [
    `Escuché tu nota de voz${suffix}. `,
    `Perfecto, recibí tu audio${suffix}. `,
    `Listo${suffix}, escuché tu mensaje. `,
  ];
  return options[Math.floor(Math.random() * options.length)]!;
}
