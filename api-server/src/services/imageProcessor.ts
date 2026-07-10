import OpenAI from "openai";
import { getOpenAiApiKeyForClient } from "../lib/openaiEnv.js";
import type pino from "pino";

const openai = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });

type Log = pino.Logger;
type Msg = Record<string, unknown>;
type Att = Record<string, unknown>;

const IMAGE_TYPES = new Set(["picture", "image", "photo"]);
const VISION_MODEL = "gpt-4o-mini";

// ─── Detection ────────────────────────────────────────────────────────────────

export function isImageMessage(message: Msg): boolean {
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const a = att as Att;
    if (IMAGE_TYPES.has(String(a["type"] ?? ""))) return true;
    if (typeof a["mime_type"] === "string" && a["mime_type"].startsWith("image/")) return true;
  }

  const atts = message["attachments"];
  if (Array.isArray(atts)) {
    for (const item of atts) {
      if (typeof item === "object" && item !== null) {
        const a = item as Att;
        if (IMAGE_TYPES.has(String(a["type"] ?? ""))) return true;
        if (typeof a["mime_type"] === "string" && a["mime_type"].startsWith("image/")) return true;
      }
    }
  }

  const mediaType = String(message["media_type"] ?? "");
  if (IMAGE_TYPES.has(mediaType)) return true;

  const mimeType = String(message["mime_type"] ?? "");
  if (mimeType.startsWith("image/")) return true;

  return false;
}

export function getImageUrl(message: Msg): string | null {
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const a = att as Att;
    for (const key of ["link", "url", "media_url"]) {
      if (typeof a[key] === "string" && (a[key] as string).length > 0) return a[key] as string;
    }
  }

  const atts = message["attachments"];
  if (Array.isArray(atts)) {
    for (const item of atts) {
      if (typeof item === "object" && item !== null) {
        const a = item as Att;
        if (IMAGE_TYPES.has(String(a["type"] ?? ""))) {
          for (const key of ["link", "url", "media_url"]) {
            if (typeof a[key] === "string" && (a[key] as string).length > 0) return a[key] as string;
          }
        }
      }
    }
  }

  for (const key of ["media_url", "file_url", "url"]) {
    if (typeof message[key] === "string" && (message[key] as string).length > 0) {
      return message[key] as string;
    }
  }

  const media = message["media"];
  if (typeof media === "object" && media !== null) {
    const m = media as Att;
    if (typeof m["url"] === "string" && m["url"].length > 0) return m["url"] as string;
  }

  return null;
}

/** Caption/texto que el cliente escribió junto con la imagen (si lo hay). */
export function getImageCaption(message: Msg): string | null {
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const a = att as Att;
    const caption =
      (typeof a["text"] === "string" ? a["text"] : "") ||
      (typeof a["caption"] === "string" ? a["caption"] : "") ||
      (typeof a["title"] === "string" ? a["title"] : "");
    if (caption.trim()) return caption.trim();
  }
  const rawText = message["text"];
  if (typeof rawText === "string" && rawText.trim()) return rawText.trim();
  return null;
}

// ─── Vision analysis ────────────────────────────────────────────────────────

const VISION_PROMPT =
  "Describe brevemente esta imagen enviada por un cliente de Bodasesor (empresa de organización de bodas y eventos sociales en México). " +
  "Enfócate en lo relevante para cotizar un evento: tipo de espacio o salón, decoración, mobiliario, comida, capacidad aproximada de personas, " +
  "si parece ser una referencia/inspiración de estilo, una foto del lugar del evento, una captura de pantalla de otra cotización, un comprobante de pago, " +
  "una identificación/documento, o algo no relacionado con un evento. Responde en español, en 1-2 oraciones concretas, sin rodeos ni frases como 'la imagen muestra'.";

/**
 * Analiza una imagen enviada por WhatsApp usando GPT-4o-mini Vision.
 * Descarga el binario con el token de Kommo (la URL suele requerir auth)
 * y lo manda como data URL en base64 — evita depender de que la URL de
 * Kommo sea accesible públicamente desde OpenAI.
 */
export async function analyzeImage(
  imageUrl: string,
  accessToken: string,
  log: Log
): Promise<string | null> {
  try {
    const imgResponse = await fetch(imageUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!imgResponse.ok) {
      log.warn({ status: imgResponse.status, imageUrl }, "Error descargando imagen del cliente");
      return null;
    }

    const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
    const buffer = await imgResponse.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;

    const completion = await openai.chat.completions.create({
      model: VISION_MODEL,
      max_tokens: 200,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const description = completion.choices[0]?.message?.content?.trim() ?? null;
    if (description) {
      log.info({ chars: description.length }, "Imagen analizada exitosamente (Vision)");
    }
    return description;
  } catch (err) {
    log.error({ err }, "Error analizando imagen con Vision");
    return null;
  }
}

export function getImageAcknowledgment(clientName?: string): string {
  const suffix = clientName ? `, ${clientName}` : "";
  const options = [
    `Ya vi tu imagen${suffix}. `,
    `Perfecto, recibí la foto${suffix}. `,
    `Listo${suffix}, ya la revisé. `,
  ];
  return options[Math.floor(Math.random() * options.length)]!;
}
