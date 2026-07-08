/**
 * whatsappDirectSender.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Envía mensajes directamente via Meta WhatsApp Cloud API.
 * Reemplaza la dependencia del SalesBot de Kommo que leía campo 1048786.
 *
 * Exporta:
 *   normalizeWhatsAppNumber(phone) → string | null
 *   sendWhatsAppDirect(to, message, entityId?, maxRetries?) → Promise<SendResult>
 *   fetchContactPhone(subdomain, accessToken, leadId) → Promise<string | null>
 *   sendLucyMessageToClient(opts) → Promise<LucySendResult>
 */

import axios, { type AxiosError } from "axios";
import { logger } from "../lib/logger.js";
import { enviarMensaje } from "./embudo.js";

const WHATSAPP_TOKEN  = process.env["WHATSAPP_TOKEN"];
const PHONE_NUMBER_ID = process.env["PHONE_NUMBER_ID"];
const META_API_VERSION = "v25.0";

export interface SendResult {
  success:    boolean;
  messageId?: string;
  error?:     string;
}

// ─── Normalización de teléfono ────────────────────────────────────────────────
// México: código de país 52, formato WhatsApp: 521XXXXXXXXXX (13 dígitos)
export function normalizeWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) {
    return `521${digits}`;                       // local 10 dígitos → 521XXXXXXXXXX
  }
  if (digits.length === 12 && digits.startsWith("52")) {
    return `521${digits.slice(2)}`;              // 52XXXXXXXXXX → 521XXXXXXXXXX
  }
  if (digits.length === 13 && digits.startsWith("521")) {
    return digits;                               // ya en formato WhatsApp MX
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `52${digits}`;                        // 1XXXXXXXXXX → 521XXXXXXXXXX
  }
  // Otros números internacionales: aceptar si longitud razonable
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }

  return null; // inválido
}

// ─── Sleep para backoff ───────────────────────────────────────────────────────
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ─── Envío principal con reintentos ──────────────────────────────────────────
export async function sendWhatsAppDirect(
  to: string,
  message: string,
  entityId?: string | number,
  maxRetries = 3
): Promise<SendResult> {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    logger.error(
      { entityId },
      "sendWhatsAppDirect: WHATSAPP_TOKEN o PHONE_NUMBER_ID no configurados"
    );
    return { success: false, error: "Missing env vars: WHATSAPP_TOKEN / PHONE_NUMBER_ID" };
  }

  const normalized = normalizeWhatsAppNumber(to);
  if (!normalized) {
    logger.warn({ to, entityId }, "sendWhatsAppDirect: número inválido — no se puede enviar");
    return { success: false, error: `Número inválido: ${to}` };
  }

  const url     = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: normalized,
    type: "text",
    text: { body: message },
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post<{ messages?: Array<{ id: string }> }>(
        url,
        payload,
        {
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
          timeout: 15_000,
        }
      );

      const messageId = response.data?.messages?.[0]?.id;

      logger.info(
        {
          entityId,
          to: normalized,
          messageId,
          attempt,
          preview: message.slice(0, 100),
          metaStatus: response.status,
        },
        "WhatsApp enviado via Meta API ✅"
      );

      return { success: true, messageId };

    } catch (err) {
      const axErr = err as AxiosError<{ error?: { message?: string; code?: number; type?: string } }>;
      const status   = axErr.response?.status;
      const metaError = axErr.response?.data?.error;

      logger.warn(
        {
          entityId,
          to: normalized,
          attempt,
          maxRetries,
          httpStatus: status,
          metaCode:    metaError?.code,
          metaType:    metaError?.type,
          metaMessage: metaError?.message,
          preview:     message.slice(0, 100),
        },
        `sendWhatsAppDirect: intento ${attempt}/${maxRetries} fallido`
      );

      // No reintentar en errores de autenticación o request inválido
      if (status === 401 || status === 400 || status === 403) {
        logger.error(
          { entityId, httpStatus: status, metaError },
          "sendWhatsAppDirect: error no recuperable — abortando reintentos"
        );
        return {
          success: false,
          error: `Meta API ${status}: ${metaError?.message ?? "error desconocido"}`,
        };
      }

      if (attempt < maxRetries) {
        const delay = 1000 * attempt; // 1s, 2s, 3s
        logger.info({ entityId, delay, nextAttempt: attempt + 1 }, "Reintentando en...");
        await sleep(delay);
      }
    }
  }

  logger.error(
    { entityId, to: normalized, maxRetries },
    "sendWhatsAppDirect: todos los reintentos agotados ❌"
  );
  return { success: false, error: `Falló tras ${maxRetries} reintentos` };
}

// ─── Obtener teléfono del contacto principal de un lead en Kommo ──────────────
interface KommoContactDetail {
  name?: string;
  custom_fields_values?: Array<{
    field_code?: string;
    values: Array<{ value: unknown }>;
  }>;
}

interface KommoLeadContacts {
  _embedded?: { contacts?: Array<{ id: number; is_main?: boolean }> };
}

export async function fetchContactPhone(
  subdomain: string,
  accessToken: string,
  leadId: string | number
): Promise<string | null> {
  const contact = await fetchLeadMainContact(subdomain, accessToken, leadId);
  return contact?.phone ?? null;
}

async function fetchLeadMainContact(
  subdomain: string,
  accessToken: string,
  leadId: string | number
): Promise<{ phone: string | null; displayName: string | null } | null> {
  try {
    const leadRes = await fetch(
      `https://${subdomain}.kommo.com/api/v4/leads/${leadId}?with=contacts`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!leadRes.ok) return null;

    const leadData = (await leadRes.json()) as KommoLeadContacts;
    const contacts = leadData._embedded?.contacts ?? [];
    const contactId = (contacts.find((c) => c.is_main) ?? contacts[0])?.id;
    if (!contactId) return null;

    const contactRes = await fetch(
      `https://${subdomain}.kommo.com/api/v4/contacts/${contactId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!contactRes.ok) return null;

    const contactData = (await contactRes.json()) as KommoContactDetail;
    const phoneField = contactData.custom_fields_values?.find(
      (f) => f.field_code === "PHONE"
    );
    const phoneRaw = phoneField?.values[0]?.value;
    const phone = typeof phoneRaw === "string" && phoneRaw.trim() ? phoneRaw.trim() : null;
    const displayName =
      typeof contactData.name === "string" && contactData.name.trim()
        ? contactData.name.trim()
        : null;

    logger.info({ leadId, phone: !!phone, displayName: !!displayName }, "Contacto principal obtenido de Kommo");
    return { phone, displayName };
  } catch (err) {
    logger.warn({ leadId, err }, "fetchLeadMainContact: no se pudo obtener contacto");
    return null;
  }
}

export async function fetchContactDisplayName(
  subdomain: string,
  accessToken: string,
  leadId: string | number
): Promise<string | null> {
  const contact = await fetchLeadMainContact(subdomain, accessToken, leadId);
  return contact?.displayName ?? null;
}

// ─── Envío unificado de Lucy al cliente ──────────────────────────────────────
// Prioridad:
//  1. Kommo Talks API — mismo canal que mensajes humanos (burbuja azul en chat).
//  2. Meta WhatsApp Cloud API — fallback si Talks falla o no hay talkId.

export interface LucySendOpts {
  subdomain:   string;
  accessToken: string;
  talkId:      string | null;
  phone:       string | null;
  texto:       string;
  entityId?:   string | number;
}

export interface LucySendResult {
  success:    boolean;
  channel?:   "kommo-talks" | "meta";
  error?:     string;
  messageId?: string;
}

export async function sendLucyMessageToClient(opts: LucySendOpts): Promise<LucySendResult> {
  const { subdomain, accessToken, talkId, phone, texto, entityId } = opts;

  if (talkId) {
    const ok = await enviarMensaje(subdomain, accessToken, talkId, texto);
    if (ok) {
      logger.info({ entityId, talkId }, "Lucy: mensaje enviado via Kommo Talks API ✅");
      return { success: true, channel: "kommo-talks" };
    }
    logger.warn({ entityId, talkId }, "Lucy: Kommo Talks falló — intentando Meta API");
  }

  if (phone) {
    const result = await sendWhatsAppDirect(phone, texto, entityId);
    if (result.success) {
      logger.info({ entityId, phone }, "Lucy: mensaje enviado via Meta API (fallback) ✅");
      return { success: true, channel: "meta", messageId: result.messageId };
    }
    return { success: false, channel: "meta", error: result.error };
  }

  const error = talkId
    ? "Kommo Talks falló y no hay teléfono para fallback Meta"
    : "Sin talkId ni teléfono — mensaje no enviado";
  logger.error({ entityId, talkId, phone: !!phone }, error);
  return { success: false, error };
}
