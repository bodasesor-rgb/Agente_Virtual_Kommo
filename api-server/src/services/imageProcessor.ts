import OpenAI from "openai";
import { getOpenAiApiKeyForClient } from "../lib/openaiEnv.js";
import type pino from "pino";

const openai = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });

type Log = pino.Logger;
type Msg = Record<string, unknown>;
type Att = Record<string, unknown>;

const IMAGE_TYPES = new Set(["picture", "image", "photo"]);
const VISION_MODEL = "gpt-4o-mini";
const IMAGE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const IMAGE_CACHE_MAX = 500;

/** Intenciones accionables para responder al CLIENTE (no descripción para el dueño). */
export type ImageIntent =
  | "montaje_referencia"
  | "comprobante_pago"
  | "comida_producto"
  | "lugar_evento"
  | "documento"
  | "otro"
  | "no_claro";

export interface ImageAnalysis {
  intent: ImageIntent;
  /** Descripción técnica solo para logs / nota interna en Kommo. */
  internalDescription: string;
  /** Respuesta lista para el cliente: confirma, liga a servicio, agradece, o pregunta. */
  clientReply: string;
}

const imageAnalysisCache = new Map<string, { analysis: ImageAnalysis; at: number }>();

function pruneImageCache(): void {
  const now = Date.now();
  for (const [url, entry] of imageAnalysisCache) {
    if (now - entry.at > IMAGE_CACHE_TTL_MS) imageAnalysisCache.delete(url);
  }
  if (imageAnalysisCache.size <= IMAGE_CACHE_MAX) return;
  const sorted = [...imageAnalysisCache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (let i = 0; i < sorted.length - IMAGE_CACHE_MAX; i++) {
    imageAnalysisCache.delete(sorted[i]![0]);
  }
}

function parseCachedLegacyDescription(raw: string): ImageAnalysis {
  return buildAnalysisFromParts("otro", raw, null);
}

/** Compat: tests y callers antiguos que solo necesitan el texto interno. */
export function getCachedImageDescription(imageUrl: string): string | null {
  const entry = imageAnalysisCache.get(imageUrl);
  if (!entry) return null;
  if (Date.now() - entry.at > IMAGE_CACHE_TTL_MS) {
    imageAnalysisCache.delete(imageUrl);
    return null;
  }
  return entry.analysis.internalDescription;
}

export function getCachedImageAnalysis(imageUrl: string): ImageAnalysis | null {
  const entry = imageAnalysisCache.get(imageUrl);
  if (!entry) return null;
  if (Date.now() - entry.at > IMAGE_CACHE_TTL_MS) {
    imageAnalysisCache.delete(imageUrl);
    return null;
  }
  return entry.analysis;
}

export function cacheImageDescription(imageUrl: string, description: string): void {
  cacheImageAnalysis(imageUrl, parseCachedLegacyDescription(description));
}

export function cacheImageAnalysis(imageUrl: string, analysis: ImageAnalysis): void {
  imageAnalysisCache.set(imageUrl, { analysis, at: Date.now() });
  if (imageAnalysisCache.size > IMAGE_CACHE_MAX * 0.9) pruneImageCache();
}

/** Limpia caché (solo para tests). */
export function resetImageAnalysisCacheForTests(): void {
  imageAnalysisCache.clear();
}

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

// ─── Vision analysis (respuesta accionable al cliente) ───────────────────────

const VALID_INTENTS = new Set<ImageIntent>([
  "montaje_referencia",
  "comprobante_pago",
  "comida_producto",
  "lugar_evento",
  "documento",
  "otro",
  "no_claro",
]);

const VISION_PROMPT =
  "Eres Lucy de Bodasesor (bodas y eventos en México). Un cliente envió una imagen por WhatsApp.\n" +
  "Tu trabajo: interpretar la INTENCIÓN de la imagen y producir una RESPUESTA ACCIONABLE PARA EL CLIENTE.\n" +
  "NO escribas una descripción técnica para el dueño del negocio (prohibido: 'El espacio es un área al aire libre…').\n\n" +
  "Clasifica intent como UNO de:\n" +
  "- montaje_referencia: foto de montaje, mesas/sillas, decoración o estilo de referencia ('¿tendrán de este estilo?')\n" +
  "- comprobante_pago: captura de transferencia, SPEI, ticket o comprobante de pago\n" +
  "- comida_producto: comida, menú, taquiza, pastel, bebida u otro producto de catering de referencia\n" +
  "- lugar_evento: foto del salón, jardín o venue del evento\n" +
  "- documento: INE, contrato u otro documento\n" +
  "- otro: relacionado con el evento pero no encaja arriba\n" +
  "- no_claro: no se entiende qué quiere el cliente con la foto\n\n" +
  "Responde SOLO JSON válido (sin markdown) con exactamente estas claves:\n" +
  '{"intent":"...","internal_description":"1-2 oraciones técnicas para el equipo interno","client_reply":"1-2 oraciones amables al cliente"}\n\n' +
  "Reglas para client_reply:\n" +
  "- montaje_referencia: confirma que se puede lograr ese estilo/mobiliario y anótalo para la cotización.\n" +
  "- comprobante_pago: agradece el pago, di que lo registras y que el equipo da seguimiento. NO pidas datos que ya se ven en el comprobante.\n" +
  "- comida_producto: nombra qué parece ser y ligalo a un servicio cotizable (taquiza, banquete, barra, etc.).\n" +
  "- lugar_evento: reconoce el espacio y pregunta si ahí sería el evento (o anótalo).\n" +
  "- documento: confirma recepción sin leer datos sensibles en voz alta.\n" +
  "- no_claro / otro: pregunta amable qué le gustaría de esa imagen.\n" +
  "- Habla de tú, español mexicano, cálida y breve. Sin mencionarle al cliente el JSON ni 'internal_description'.";

const FALLBACK_REPLIES: Record<ImageIntent, string> = {
  montaje_referencia:
    "¡Sí! Manejamos mesas, sillas y montajes de ese estilo. Lo anoto para tu cotización.",
  comprobante_pago:
    "¡Gracias por tu pago! Lo registro y el equipo da seguimiento.",
  comida_producto:
    "¡Qué rico! Lo tomo como referencia de lo que buscas y lo anoto para tu cotización.",
  lugar_evento:
    "Recibí la foto del lugar. ¿Confirmas que ahí sería tu evento?",
  documento: "Listo, recibí el documento. El equipo lo revisa y te confirma.",
  otro: "Recibí tu imagen. ¿Me confirmas qué te gustaría de esta foto para tu evento?",
  no_claro: "Recibí tu imagen. ¿Me confirmas qué te gustaría de esta foto?",
};

function normalizeIntent(raw: unknown): ImageIntent {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (VALID_INTENTS.has(s as ImageIntent)) return s as ImageIntent;
  if (/montaje|referencia|estilo|mobiliario|mesa|silla|decor/i.test(s)) return "montaje_referencia";
  if (/comprobante|pago|transfer|spei|ticket/i.test(s)) return "comprobante_pago";
  if (/comida|producto|menu|taquiza|banquete|pastel/i.test(s)) return "comida_producto";
  if (/lugar|salon|salón|venue|jard[ií]n/i.test(s)) return "lugar_evento";
  if (/documento|ine|identific/i.test(s)) return "documento";
  return "no_claro";
}

function looksLikeOwnerDescription(text: string): boolean {
  return (
    /^(el|la|los|las)\s+(espacio|área|area|imagen|foto|sal[oó]n|jard[ií]n|mesa)/i.test(text.trim()) ||
    /\b(se observa|se aprecia|la imagen muestra|en la fotograf[ií]a)\b/i.test(text)
  );
}

export function buildAnalysisFromParts(
  intentRaw: unknown,
  internalRaw: unknown,
  clientRaw: unknown
): ImageAnalysis {
  const intent = normalizeIntent(intentRaw);
  const internalDescription =
    String(internalRaw ?? "")
      .trim()
      .slice(0, 500) || "Imagen recibida sin detalle.";
  let clientReply = String(clientRaw ?? "").trim().slice(0, 400);
  if (!clientReply || looksLikeOwnerDescription(clientReply)) {
    clientReply = FALLBACK_REPLIES[intent];
  }
  return { intent, internalDescription, clientReply };
}

export function parseVisionImageJson(raw: string): ImageAnalysis | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return buildAnalysisFromParts(
      parsed.intent ?? parsed.Intent,
      parsed.internal_description ?? parsed.internalDescription ?? parsed.description,
      parsed.client_reply ?? parsed.clientReply ?? parsed.reply
    );
  } catch {
    return null;
  }
}

/**
 * Analiza una imagen: produce respuesta accionable al cliente + nota interna.
 * Descarga el binario con el token de Kommo y lo manda como data URL en base64.
 */
export async function analyzeImageFull(
  imageUrl: string,
  accessToken: string,
  log: Log
): Promise<ImageAnalysis | null> {
  const cached = getCachedImageAnalysis(imageUrl);
  if (cached) {
    log.info({ imageUrl: imageUrl.slice(0, 80), intent: cached.intent }, "Imagen en caché (Vision)");
    return cached;
  }

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
      max_tokens: 320,
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

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = raw ? parseVisionImageJson(raw) : null;
    const analysis =
      parsed ??
      buildAnalysisFromParts(
        "no_claro",
        raw || "No se pudo parsear la visión",
        FALLBACK_REPLIES.no_claro
      );

    cacheImageAnalysis(imageUrl, analysis);
    log.info(
      { intent: analysis.intent, chars: analysis.clientReply.length },
      "Imagen analizada (Vision accionable)"
    );
    return analysis;
  } catch (err) {
    log.error({ err }, "Error analizando imagen con Vision");
    return null;
  }
}

/** Compat: devuelve solo el texto interno (nota/logs). Preferir analyzeImageFull. */
export async function analyzeImage(
  imageUrl: string,
  accessToken: string,
  log: Log
): Promise<string | null> {
  const full = await analyzeImageFull(imageUrl, accessToken, log);
  return full?.internalDescription ?? null;
}

/** Marcadores embebidos en el texto del turno para guards / historial. */
export const IMAGE_ACTION_MARKER = "[Imagen respuesta cliente]:";
export const IMAGE_NOTE_MARKER = "[Imagen nota interna]:";
export const IMAGE_INTENT_MARKER = "[Imagen intent]:";

export function formatImageTurnText(
  analysis: ImageAnalysis,
  caption?: string | null
): string {
  const parts = [
    `${IMAGE_INTENT_MARKER} ${analysis.intent}`,
    `${IMAGE_ACTION_MARKER} ${analysis.clientReply}`,
    `${IMAGE_NOTE_MARKER} ${analysis.internalDescription}`,
  ];
  if (caption?.trim()) {
    return `${caption.trim()}\n\n${parts.join("\n")}`;
  }
  return parts.join("\n");
}

export function extractImageClientReply(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/\[Imagen respuesta cliente\]:\s*([^\n\[]+)/i);
  return m?.[1]?.trim() || null;
}

export function extractImageIntent(text: string | null | undefined): ImageIntent | null {
  if (!text) return null;
  const m = text.match(/\[Imagen intent\]:\s*([a-z_]+)/i);
  if (!m?.[1]) return null;
  return normalizeIntent(m[1]);
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
