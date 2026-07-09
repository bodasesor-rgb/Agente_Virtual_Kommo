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
 * Envía al cliente por Meta/WhatsApp y espeja el mensaje en Kommo para que el equipo lo vea.
 */
export async function deliverLucyOutbound(
  opts: DeliverLucyOutboundOpts
): Promise<"meta" | "kommo_talks" | "failed"> {
  const { subdomain, accessToken, talkId, chatId, whatsappPhone, texto, entityId } = opts;

  let clientDelivered = false;

  if (whatsappPhone) {
    const result = await sendWhatsAppDirect(whatsappPhone, texto, entityId);
    if (result.success) {
      clientDelivered = true;
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

  if (talkId) {
    const ok = await enviarMensaje(subdomain, accessToken, talkId, texto);
    if (ok) {
      logger.info({ entityId, talkId }, "Lucy: mensaje via Kommo Talks ✅");
      return "kommo_talks";
    }
  }

  if (clientDelivered) return "meta";
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

  // Fallback: nota visible para el equipo (Meta envía al cliente pero Kommo no espeja solo)
  const preview = texto.length > 500 ? `${texto.slice(0, 497)}…` : texto;
  try {
    await agregarNota(subdomain, accessToken, entityId, `📤 Lucy → cliente:\n${preview}`);
    logger.info({ entityId, talkId, chatId }, "Lucy: espejo en nota Kommo (chat API no disponible)");
  } catch (err) {
    logger.warn({ entityId, talkId, chatId, err }, "Lucy: no se pudo espejar mensaje en Kommo");
  }
}
