import { logger } from "../lib/logger.js";
import { stripInternalCrmBlock } from "../lib/bodasesorAdvisor.js";
import { agregarNota } from "./embudo.js";
import {
  registrarMensajeSalienteKommo,
  sendWhatsAppDirect,
} from "./whatsappDirectSender.js";

export interface DeliverLucyOutboundOpts {
  subdomain: string;
  accessToken: string;
  talkId: string | null | undefined;
  chatId: string | null | undefined;
  whatsappPhone: string | null;
  texto: string;
  entityId: string | number;
}

/**
 * Envía la respuesta de Lucy al cliente y la deja visible para el equipo.
 *
 * Kommo NO permite enviar WhatsApp con POST /api/v4/talks/{id}/messages
 * (ese endpoint es solo para leer historial). Con Meta API directa el cliente
 * recibe el mensaje pero Kommo no lo refleja en el chat — por eso siempre
 * dejamos una nota en el timeline del lead.
 */
export async function deliverLucyOutbound(
  opts: DeliverLucyOutboundOpts
): Promise<"meta" | "kommo_talks" | "failed"> {
  const { subdomain, accessToken, talkId, chatId, whatsappPhone, texto, entityId } = opts;

  const trimmed = stripInternalCrmBlock(texto?.trim() ?? "");
  if (!trimmed) {
    logger.warn({ entityId, talkId, chatId }, "Lucy: texto vacío — omitiendo envío Meta");
    await logDeliveryFailureNote(
      subdomain,
      accessToken,
      entityId,
      texto,
      "Mensaje vacío — text.body requerido por Meta API."
    );
    return "failed";
  }

  if (!whatsappPhone) {
    logger.error({ entityId, talkId, chatId }, "Lucy: sin teléfono — no se puede enviar ❌");
    await logDeliveryFailureNote(
      subdomain,
      accessToken,
      entityId,
      texto,
      "No se encontró teléfono del contacto en Kommo."
    );
    return "failed";
  }

  const result = await sendWhatsAppDirect(whatsappPhone, trimmed, entityId);
  if (!result.success) {
    logger.error({ entityId, error: result.error }, "Lucy: Meta API no pudo enviar ❌");
    await logDeliveryFailureNote(
      subdomain,
      accessToken,
      entityId,
      texto,
      `Meta API: ${result.error ?? "error desconocido"}`
    );
    return "failed";
  }

  logger.info({ entityId, phone: whatsappPhone }, "Lucy: WhatsApp enviado via Meta ✅");

  // Intento opcional de espejo en chat (suele fallar — no bloquea el flujo)
  if (chatId) {
    void registrarMensajeSalienteKommo({
      subdomain,
      accessToken,
      chatId,
      texto,
      toPhone: whatsappPhone,
      metaMessageId: result.messageId,
      entityId,
    });
  }

  await logLucyMessageNote(subdomain, accessToken, entityId, trimmed, talkId, chatId);
  return "meta";
}

async function logLucyMessageNote(
  subdomain: string,
  accessToken: string,
  entityId: string | number,
  texto: string,
  talkId: string | null | undefined,
  chatId: string | null | undefined
): Promise<void> {
  const preview = texto.length > 800 ? `${texto.slice(0, 797)}…` : texto;
  const noted = await agregarNota(
    subdomain,
    accessToken,
    entityId,
    `💬 Lucy → cliente:\n${preview}`
  );
  if (noted) {
    logger.info({ entityId, talkId, chatId }, "Lucy: mensaje registrado en nota Kommo ✅");
  } else {
    logger.warn({ entityId, talkId, chatId }, "Lucy: envió WhatsApp pero la nota en Kommo falló ⚠️");
  }
}

async function logDeliveryFailureNote(
  subdomain: string,
  accessToken: string,
  entityId: string | number,
  texto: string,
  reason: string
): Promise<void> {
  const preview = texto.length > 800 ? `${texto.slice(0, 797)}…` : texto;
  await agregarNota(
    subdomain,
    accessToken,
    entityId,
    `⚠️ Lucy NO pudo enviar:\n${reason}\n\nTexto que iba a enviar:\n${preview}`
  );
}
