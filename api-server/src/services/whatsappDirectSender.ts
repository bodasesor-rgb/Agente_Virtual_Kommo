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
 *   registrarMensajeSalienteKommo(opts) → Promise<boolean>
 */

import axios, { type AxiosError } from "axios";
import { logger } from "../lib/logger.js";

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
): Promise<{ phone: string | null; displayName: string | null; email: string | null } | null> {
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
    const emailField = contactData.custom_fields_values?.find(
      (f) => f.field_code === "EMAIL"
    );
    const emailRaw = emailField?.values[0]?.value;
    const email = typeof emailRaw === "string" && emailRaw.trim() ? emailRaw.trim() : null;
    const displayName =
      typeof contactData.name === "string" && contactData.name.trim()
        ? contactData.name.trim()
        : null;

    logger.info(
      { leadId, phone: !!phone, displayName: !!displayName, email: !!email },
      "Contacto principal obtenido de Kommo"
    );
    return { phone, displayName, email };
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

/** EMAIL del contacto principal (Lucy lo escribe ahí; no hay CF de correo en el lead). */
export async function fetchContactEmail(
  subdomain: string,
  accessToken: string,
  leadId: string | number
): Promise<string | null> {
  const contact = await fetchLeadMainContact(subdomain, accessToken, leadId);
  return contact?.email ?? null;
}

// ─── Registrar mensaje saliente en el historial de chat de Kommo ───────────────
// Se llama después de un envío exitoso via Meta API para que el mensaje
// aparezca en el historial del lead/contacto dentro de Kommo CRM.
// Fire-and-forget: nunca bloquea el flujo principal.
//
// Endpoint: POST /api/v4/chats/messages
// Kommo usa este endpoint para registrar mensajes en conversaciones existentes.
// El campo `author.type = "bot"` identifica el mensaje como saliente automático.

export interface KommoOutgoingMessageOpts {
  subdomain:      string;
  accessToken:    string;
  chatId:         string;          // chat_id de Kommo (del webhook entrante)
  texto:          string;          // contenido exacto enviado al cliente
  toPhone:        string;          // número normalizado (521XXXXXXXXXX)
  metaMessageId?: string;          // wamid.XXX de Meta — referencia cruzada
  entityId?:      string | number; // lead ID — solo para logs
}

interface KommoChatsMessageResponse {
  id?: string | number;
  created_at?: number;
}

export async function registrarMensajeSalienteKommo(
  opts: KommoOutgoingMessageOpts
): Promise<boolean> {
  const { subdomain, accessToken, chatId, texto, toPhone, metaMessageId, entityId } = opts;

  const url = `https://${subdomain}.kommo.com/api/v4/chats/messages`;
  const body = {
    chat_id:    chatId,
    text:       texto,
    created_at: Math.floor(Date.now() / 1000),
    author: {
      type: "bot",
      id:   PHONE_NUMBER_ID ?? "lucy-bot",
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body:   JSON.stringify(body),
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(no body)");
      logger.warn(
        {
          entityId,
          chatId,
          toPhone,
          metaMessageId,
          httpStatus: res.status,
          errBody,
        },
        "registrarMensajeSalienteKommo: Kommo rechazó el registro ⚠️"
      );
      return false;
    }

    const data = (await res.json()) as KommoChatsMessageResponse;
    logger.info(
      {
        entityId,
        chatId,
        toPhone,
        metaMessageId,
        kommoMessageId: data?.id,
        kommoTimestamp: data?.created_at,
        preview:        texto.slice(0, 80),
      },
      "Mensaje saliente registrado en Kommo ✅"
    );
    return true;

  } catch (err) {
    logger.warn(
      { entityId, chatId, toPhone, metaMessageId, err },
      "registrarMensajeSalienteKommo: excepción (timeout o red) ⚠️"
    );
    return false;
  }
}
