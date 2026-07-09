import { logger } from "../lib/logger.js";
import { agregarNota, enviarMensaje } from "./embudo.js";
import { sendWhatsAppDirect } from "./whatsappDirectSender.js";

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
 * Envía al cliente y registra el mensaje en Kommo como nota (timeline del lead).
 *
 * Kommo Talks puede mostrar el mensaje en el chat si el canal WhatsApp está bien
 * conectado; si no, Meta API entrega al cliente pero Kommo no lo refleja solo.
 * La nota garantiza que el equipo siempre vea qué escribió Lucy.
 */
export async function deliverLucyOutbound(
  opts: DeliverLucyOutboundOpts
): Promise<"meta" | "kommo_talks" | "failed"> {
  const { subdomain, accessToken, talkId, chatId, whatsappPhone, texto, entityId } = opts;

  let channel: "meta" | "kommo_talks" | "failed" = "failed";

  if (talkId) {
    const ok = await enviarMensaje(subdomain, accessToken, talkId, texto);
    if (ok) {
      channel = "kommo_talks";
      logger.info({ entityId, talkId }, "Lucy: mensaje via Kommo Talks ✅");
    } else {
      logger.warn({ entityId, talkId }, "Lucy: Kommo Talks falló — probando Meta API");
    }
  }

  if (channel === "failed" && whatsappPhone) {
    const result = await sendWhatsAppDirect(whatsappPhone, texto, entityId);
    if (result.success) {
      channel = "meta";
      logger.info({ entityId, phone: whatsappPhone }, "Lucy: WhatsApp enviado via Meta ✅");
    } else {
      logger.warn({ entityId, error: result.error }, "Lucy: Meta API falló");
    }
  }

  if (channel === "failed") {
    logger.error({ entityId, talkId, chatId, whatsappPhone }, "Lucy: mensaje no enviado ❌");
    return "failed";
  }

  await logLucyMessageNote(subdomain, accessToken, entityId, texto, channel, talkId, chatId);
  return channel;
}

/** Nota en el lead — visible en el timeline de Kommo para todo el equipo. */
async function logLucyMessageNote(
  subdomain: string,
  accessToken: string,
  entityId: string | number,
  texto: string,
  channel: "meta" | "kommo_talks",
  talkId: string | null | undefined,
  chatId: string | null | undefined
): Promise<void> {
  const preview = texto.length > 800 ? `${texto.slice(0, 797)}…` : texto;
  const via = channel === "kommo_talks" ? "Talks" : "WhatsApp";
  const noted = await agregarNota(
    subdomain,
    accessToken,
    entityId,
    `💬 Lucy (${via}):\n${preview}`
  );
  if (noted) {
    logger.info({ entityId, channel, talkId, chatId }, "Lucy: mensaje registrado en nota Kommo ✅");
  } else {
    logger.warn({ entityId, channel, talkId, chatId }, "Lucy: no se pudo crear nota en Kommo ⚠️");
  }
}
