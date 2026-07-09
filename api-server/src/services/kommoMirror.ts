import { logger } from "../lib/logger.js";
import { agregarNota, enviarMensaje } from "./embudo.js";
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
 * Envía al cliente y deja el mensaje visible en Kommo.
 * 1. Kommo Talks — aparece en el chat del inbox y llega al cliente.
 * 2. Meta API — fallback si Talks falla; espeja en nota para el equipo.
 */
export async function deliverLucyOutbound(
  opts: DeliverLucyOutboundOpts
): Promise<"meta" | "kommo_talks" | "failed"> {
  const { subdomain, accessToken, talkId, chatId, whatsappPhone, texto, entityId } = opts;

  if (talkId) {
    const ok = await enviarMensaje(subdomain, accessToken, talkId, texto);
    if (ok) {
      logger.info({ entityId, talkId }, "Lucy: mensaje via Kommo Talks ✅");
      return "kommo_talks";
    }
    logger.warn({ entityId, talkId }, "Lucy: Kommo Talks falló — probando Meta API");
  }

  if (whatsappPhone) {
    const result = await sendWhatsAppDirect(whatsappPhone, texto, entityId);
    if (result.success) {
      logger.info({ entityId, phone: whatsappPhone }, "Lucy: WhatsApp enviado via Meta ✅");
      await mirrorOutboundInKommo({
        subdomain,
        accessToken,
        talkId,
        chatId,
        whatsappPhone,
        texto,
        entityId,
        metaMessageId: result.messageId,
      });
      return "meta";
    }
    logger.warn({ entityId, error: result.error }, "Lucy: Meta API falló");
  }

  logger.error({ entityId, talkId, chatId, whatsappPhone }, "Lucy: mensaje no enviado ❌");
  return "failed";
}

async function mirrorOutboundInKommo(opts: {
  subdomain: string;
  accessToken: string;
  talkId: string | null | undefined;
  chatId: string | null | undefined;
  whatsappPhone: string;
  texto: string;
  entityId: string | number;
  metaMessageId?: string;
}): Promise<void> {
  const { subdomain, accessToken, talkId, chatId, whatsappPhone, texto, entityId, metaMessageId } =
    opts;

  if (chatId) {
    const registered = await registrarMensajeSalienteKommo({
      subdomain,
      accessToken,
      chatId,
      texto,
      toPhone: whatsappPhone,
      metaMessageId,
      entityId,
    });
    if (registered) {
      logger.info({ entityId, chatId }, "Lucy: mensaje espejado en chat Kommo ✅");
      return;
    }
  }

  // Meta envía al cliente pero Kommo no lo refleja solo — nota en timeline del lead
  const preview = texto.length > 500 ? `${texto.slice(0, 497)}…` : texto;
  const noted = await agregarNota(
    subdomain,
    accessToken,
    entityId,
    `📤 Lucy → cliente:\n${preview}`
  );
  if (noted) {
    logger.info({ entityId, talkId, chatId }, "Lucy: espejo en nota Kommo (Meta sin Talks)");
  } else {
    logger.warn({ entityId, talkId, chatId }, "Lucy: no se pudo espejar mensaje en Kommo");
  }
}
