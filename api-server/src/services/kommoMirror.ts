import { logger } from "../lib/logger.js";
import { stripInternalCrmBlock } from "../lib/bodasesorAdvisor.js";
import { agregarNota } from "./embudo.js";
import {
  classifyKommoOrigin,
  fetchTalkOrigin,
  sendKommoTalkMessage,
  usesKommoExternalSend,
  type KommoChatChannel,
} from "./kommoTalks.js";
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
  /** Origin del webhook/talk si ya se conoce (facebook, instagram, whatsapp…). */
  channelOrigin?: string | null;
}

/**
 * Envía la respuesta de Lucy al cliente y la deja visible para el equipo.
 *
 * - WhatsApp → Meta Cloud API (PHONE_NUMBER_ID) + nota en timeline.
 * - Facebook / Instagram / otros → Kommo POST /talks/{id}/send_message
 *   (requiere scope «Sending to external chats»).
 *
 * Sin teléfono en WA se intenta Kommo si hay talkId (útil en FB/IG).
 */
export async function deliverLucyOutbound(
  opts: DeliverLucyOutboundOpts
): Promise<"meta" | "kommo_talks" | "failed"> {
  const { subdomain, accessToken, talkId, chatId, whatsappPhone, texto, entityId } = opts;

  const trimmed = stripInternalCrmBlock(texto?.trim() ?? "");
  if (!trimmed) {
    logger.warn({ entityId, talkId, chatId }, "Lucy: texto vacío — omitiendo envío");
    await logDeliveryFailureNote(
      subdomain,
      accessToken,
      entityId,
      texto,
      "Mensaje vacío — no hay texto para enviar."
    );
    return "failed";
  }

  const channel = await resolveOutboundChannel(opts);
  logger.info(
    { entityId, talkId, chatId, channel, hasPhone: !!whatsappPhone },
    "Lucy: canal de salida resuelto"
  );

  // Facebook / Instagram / Telegram / otros chats externos → Kommo.
  if (usesKommoExternalSend(channel)) {
    return sendViaKommoTalk({
      subdomain,
      accessToken,
      talkId,
      chatId,
      texto: trimmed,
      entityId,
      channel,
    });
  }

  // WhatsApp (o desconocido con teléfono) → Meta.
  if (whatsappPhone) {
    const result = await sendWhatsAppDirect(whatsappPhone, trimmed, entityId);
    if (!result.success) {
      logger.error({ entityId, error: result.error }, "Lucy: Meta API no pudo enviar ❌");
      // Si Meta falla y hay talkId, último intento por Kommo (por si el canal no era WA).
      if (talkId) {
        logger.info({ entityId, talkId }, "Lucy: fallback Meta→Kommo send_message");
        const fb = await sendViaKommoTalk({
          subdomain,
          accessToken,
          talkId,
          chatId,
          texto: trimmed,
          entityId,
          channel: "unknown",
        });
        if (fb !== "failed") return fb;
      }
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

    await logLucyMessageNote(
      subdomain,
      accessToken,
      entityId,
      trimmed,
      talkId,
      chatId,
      "whatsapp"
    );
    return "meta";
  }

  // Sin teléfono: intentar Kommo (FB/IG suelen no tener PHONE en el contacto).
  if (talkId) {
    logger.info(
      { entityId, talkId },
      "Lucy: sin teléfono — intentando envío por Kommo (FB/IG/otros)"
    );
    return sendViaKommoTalk({
      subdomain,
      accessToken,
      talkId,
      chatId,
      texto: trimmed,
      entityId,
      channel,
    });
  }

  logger.error({ entityId, talkId, chatId }, "Lucy: sin teléfono ni talkId — no se puede enviar ❌");
  await logDeliveryFailureNote(
    subdomain,
    accessToken,
    entityId,
    texto,
    "No se encontró teléfono ni talk_id. En Facebook/Instagram el contacto suele no tener WhatsApp; revisa que el webhook traiga talk_id y que Facebook/Instagram estén conectados en Kommo."
  );
  return "failed";
}

async function resolveOutboundChannel(opts: DeliverLucyOutboundOpts): Promise<KommoChatChannel> {
  if (opts.channelOrigin) {
    const fromHint = classifyKommoOrigin(opts.channelOrigin);
    if (fromHint !== "unknown") return fromHint;
  }
  if (opts.talkId) {
    const origin = await fetchTalkOrigin(opts.subdomain, opts.accessToken, opts.talkId);
    return classifyKommoOrigin(origin);
  }
  // Sin talk: si hay teléfono asumimos WhatsApp; si no, unknown (se intentará Kommo).
  return opts.whatsappPhone ? "whatsapp" : "unknown";
}

async function sendViaKommoTalk(opts: {
  subdomain: string;
  accessToken: string;
  talkId: string | null | undefined;
  chatId: string | null | undefined;
  texto: string;
  entityId: string | number;
  channel: KommoChatChannel;
}): Promise<"kommo_talks" | "failed"> {
  const { subdomain, accessToken, talkId, chatId, texto, entityId, channel } = opts;
  if (!talkId) {
    await logDeliveryFailureNote(
      subdomain,
      accessToken,
      entityId,
      texto,
      `Canal ${channel}: falta talk_id para enviar por Kommo (Facebook/Instagram).`
    );
    return "failed";
  }

  const sent = await sendKommoTalkMessage({
    subdomain,
    accessToken,
    talkId,
    texto,
    entityId,
  });
  if (!sent.ok) {
    await logDeliveryFailureNote(
      subdomain,
      accessToken,
      entityId,
      texto,
      `Kommo send_message (${channel}): ${sent.error ?? "error"}`
    );
    return "failed";
  }

  await logLucyMessageNote(subdomain, accessToken, entityId, texto, talkId, chatId, channel);
  return "kommo_talks";
}

async function logLucyMessageNote(
  subdomain: string,
  accessToken: string,
  entityId: string | number,
  texto: string,
  talkId: string | null | undefined,
  chatId: string | null | undefined,
  channel: string = "whatsapp"
): Promise<void> {
  const preview = texto.length > 800 ? `${texto.slice(0, 797)}…` : texto;
  const channelLabel =
    channel === "facebook"
      ? "Facebook"
      : channel === "instagram"
        ? "Instagram"
        : channel === "telegram"
          ? "Telegram"
          : channel === "whatsapp"
            ? "WhatsApp"
            : channel;
  const noted = await agregarNota(
    subdomain,
    accessToken,
    entityId,
    `💬 Lucy → cliente (${channelLabel}):\n${preview}`
  );
  if (noted) {
    logger.info({ entityId, talkId, chatId, channel }, "Lucy: mensaje registrado en nota Kommo ✅");
  } else {
    logger.warn({ entityId, talkId, chatId, channel }, "Lucy: envío OK pero la nota en Kommo falló ⚠️");
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
