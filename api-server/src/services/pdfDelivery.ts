/**
 * Envío de PDFs al cliente vía Meta WhatsApp Cloud API (documento adjunto).
 * Fallback: mensaje de texto con el link si el adjunto falla.
 */

import axios, { type AxiosError } from "axios";
import { logger } from "../lib/logger.js";
import { normalizeWhatsAppNumber, sendWhatsAppDirect, type SendResult } from "./whatsappDirectSender.js";

const WHATSAPP_TOKEN = process.env["WHATSAPP_TOKEN"];
const PHONE_NUMBER_ID = process.env["PHONE_NUMBER_ID"];
const META_API_VERSION = "v25.0";

const PDF_ENABLED = process.env["LUCY_PDF_SEND_ENABLED"]?.trim().toLowerCase() !== "false";

export interface PdfDeliveryOpts {
  to:           string;
  pdfUrl:       string;
  filename?:    string;
  caption?:     string;
  entityId?:    string | number;
  /** Si el adjunto falla, enviar link en texto */
  fallbackText?: boolean;
}

export interface PdfDeliveryResult {
  delivered: boolean;
  method:    "document" | "link" | "none" | "disabled";
  error?:    string;
  messageId?: string;
}

export function isPdfDeliveryEnabled(): boolean {
  return PDF_ENABLED && !!WHATSAPP_TOKEN && !!PHONE_NUMBER_ID;
}

export function isPdfUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u.startsWith("http")) return false;
  if (/\.pdf(\?|#|$)/i.test(u)) return true;
  if (/drive\.google\.com|docs\.google\.com\/uc|usercontent\.google/i.test(u)) return true;
  if (/cdn\.shopify\.com.*\.pdf/i.test(u)) return true;
  return false;
}

/** Bloquea links Gamma u otros no aptos para envío al cliente. */
export function isClientSafePdfUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u.startsWith("http")) return false;
  if (/gamma\.app/i.test(u)) return false;
  return isPdfUrl(u) || /\.pdf/i.test(u);
}

/**
 * Convierte links compartidos (Drive, Dropbox) a URL descargable para Meta API.
 */
export function normalizePublicPdfUrl(url: string): string | null {
  const raw = url.trim();
  if (!raw.startsWith("http")) return null;
  if (!isClientSafePdfUrl(raw)) return null;

  // Google Drive — varios formatos
  const driveFile = raw.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFile?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${driveFile[1]}`;
  }
  const driveOpen = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (/drive\.google\.com\/open/i.test(raw) && driveOpen?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${driveOpen[1]}`;
  }

  // Dropbox — forzar descarga directa
  if (/dropbox\.com/i.test(raw)) {
    return raw.replace(/[?&]dl=0/g, "").replace(/\?$/, "") + (raw.includes("?") ? "&dl=1" : "?dl=1");
  }

  // URL directa (Shopify, Hostinger, etc.)
  return raw.split("#")[0]!;
}

export function pdfFilenameFromUrl(url: string, label?: string): string {
  if (label) {
    const safe = label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);
    if (safe) return safe.endsWith(".pdf") ? safe : `${safe}.pdf`;
  }

  try {
    const path = new URL(url).pathname;
    const base = path.split("/").pop() ?? "catalogo-bodasesor.pdf";
    return base.includes(".") ? base : `${base}.pdf`;
  } catch {
    return "catalogo-bodasesor.pdf";
  }
}

export async function sendWhatsAppDocument(
  to: string,
  pdfUrl: string,
  filename: string,
  caption?: string,
  entityId?: string | number,
  maxRetries = 2
): Promise<SendResult> {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    return { success: false, error: "Missing WHATSAPP_TOKEN / PHONE_NUMBER_ID" };
  }

  const normalized = normalizeWhatsAppNumber(to);
  if (!normalized) {
    return { success: false, error: `Número inválido: ${to}` };
  }

  const link = normalizePublicPdfUrl(pdfUrl);
  if (!link) {
    return { success: false, error: `URL PDF no válida o no permitida: ${pdfUrl}` };
  }

  const url = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: normalized,
    type: "document",
    document: {
      link,
      filename: pdfFilenameFromUrl(link, filename),
      ...(caption?.trim() ? { caption: caption.trim().slice(0, 1024) } : {}),
    },
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post<{ messages?: Array<{ id: string }> }>(url, payload, {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 20_000,
      });

      const messageId = response.data?.messages?.[0]?.id;
      logger.info(
        { entityId, to: normalized, messageId, filename, pdfUrl: link.slice(0, 120) },
        "WhatsApp PDF enviado via Meta API ✅"
      );
      return { success: true, messageId };
    } catch (err) {
      const axErr = err as AxiosError<{ error?: { message?: string } }>;
      const status = axErr.response?.status;
      const metaError = axErr.response?.data?.error;

      logger.warn(
        {
          entityId,
          attempt,
          maxRetries,
          httpStatus: status,
          metaMessage: metaError?.message,
          pdfUrl: link.slice(0, 120),
        },
        "sendWhatsAppDocument: intento fallido"
      );

      if (status === 401 || status === 400 || status === 403) {
        return {
          success: false,
          error: `Meta API ${status}: ${metaError?.message ?? "error"}`,
        };
      }

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  return { success: false, error: `PDF falló tras ${maxRetries} reintentos` };
}

/** Envía PDF como documento; si falla, opcionalmente manda el link en texto. */
export async function deliverPdfToClient(opts: PdfDeliveryOpts): Promise<PdfDeliveryResult> {
  if (!isPdfDeliveryEnabled()) {
    return { delivered: false, method: "disabled", error: "PDF delivery disabled or missing Meta credentials" };
  }

  const filename = opts.filename ?? pdfFilenameFromUrl(opts.pdfUrl, opts.filename);
  const docResult = await sendWhatsAppDocument(
    opts.to,
    opts.pdfUrl,
    filename,
    opts.caption,
    opts.entityId
  );

  if (docResult.success) {
    return { delivered: true, method: "document", messageId: docResult.messageId };
  }

  if (opts.fallbackText !== false) {
    const link = normalizePublicPdfUrl(opts.pdfUrl) ?? opts.pdfUrl;
    const text =
      opts.caption?.trim() ||
      `Te comparto el catálogo en PDF:\n${link}`;
    const textResult = await sendWhatsAppDirect(opts.to, text, opts.entityId, 2);
    if (textResult.success) {
      logger.info({ entityId: opts.entityId }, "PDF fallback: link enviado por texto ✅");
      return { delivered: true, method: "link", messageId: textResult.messageId };
    }
    return { delivered: false, method: "none", error: textResult.error ?? docResult.error };
  }

  return { delivered: false, method: "none", error: docResult.error };
}
