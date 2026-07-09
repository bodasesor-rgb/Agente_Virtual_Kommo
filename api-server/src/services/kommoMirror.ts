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

/** Meta directo desactivado por defecto — prueba Talks-only para ver mensajes en el chat. */
function metaFallbackEnabled(): boolean {
  const v = process.env["LUCY_META_WHATSAPP_FALLBACK"]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Envía la respuesta de Lucy al cliente.
 *
 * Modo prueba (default): solo Kommo Talks → el mensaje debe verse en el inbox.
 * Si Talks falla, nota en el lead con el texto (el equipo ve qué iba a decir Lucy).
 * Meta API solo si LUCY_META_WHATSAPP_FALLBACK=true en Hostinger.
 */
export async function deliverLucyOutbound(
  opts: DeliverLucyOutboundOpts
): Promise<"meta" | "kommo_talks" | "failed"> {
  const { subdomain, accessToken, talkId, chatId, whatsappPhone, texto, entityId } = opts;

  if (talkId) {
    const ok = await enviarMensaje(subdomain, accessToken, talkId, texto);
    if (ok) {
      logger.info(
        { entityId, talkId, chatId, mode: "talks-only" },
        "Lucy: mensaje enviado via Kommo Talks ✅ (sin nota — debe verse en el chat)"
      );
      return "kommo_talks";
    }
    logger.warn({ entityId, talkId, chatId }, "Lucy: Kommo Talks rechazó el envío ⚠️");
  } else {
    logger.warn({ entityId, chatId }, "Lucy: sin talkId en el webhook — Talks no disponible");
  }

  if (metaFallbackEnabled() && whatsappPhone) {
    const result = await sendWhatsAppDirect(whatsappPhone, texto, entityId);
    if (result.success) {
      logger.info({ entityId, phone: whatsappPhone }, "Lucy: fallback Meta API ✅");
      await logLucyMessageNote(subdomain, accessToken, entityId, texto, "meta", talkId, chatId);
      return "meta";
    }
    logger.warn({ entityId, error: result.error }, "Lucy: Meta API fallback falló");
  }

  await logTalksFailureNote(subdomain, accessToken, entityId, texto, talkId, chatId);
  logger.error(
    { entityId, talkId, chatId, whatsappPhone, metaFallback: metaFallbackEnabled() },
    "Lucy: mensaje no enviado — Talks falló y Meta fallback desactivado ❌"
  );
  return "failed";
}

/** Solo cuando Talks/Meta no pudieron enviar — para que el equipo vea el texto y el error. */
async function logTalksFailureNote(
  subdomain: string,
  accessToken: string,
  entityId: string | number,
  texto: string,
  talkId: string | null | undefined,
  chatId: string | null | undefined
): Promise<void> {
  const preview = texto.length > 800 ? `${texto.slice(0, 797)}…` : texto;
  const reason = talkId
    ? "Kommo Talks rechazó el envío (revisar permisos del token o ventana 24h)."
    : "Webhook sin talk_id — no se pudo usar Kommo Talks.";
  const noted = await agregarNota(
    subdomain,
    accessToken,
    entityId,
    `⚠️ Lucy NO pudo enviar al chat:\n${reason}\n\nTexto que iba a enviar:\n${preview}`
  );
  if (noted) {
    logger.info({ entityId, talkId, chatId }, "Lucy: nota de fallo Talks registrada en Kommo");
  }
}

/** Nota de respaldo cuando el envío fue por Meta (fuera del chat de Kommo). */
async function logLucyMessageNote(
  subdomain: string,
  accessToken: string,
  entityId: string | number,
  texto: string,
  channel: "meta",
  talkId: string | null | undefined,
  chatId: string | null | undefined
): Promise<void> {
  const preview = texto.length > 800 ? `${texto.slice(0, 797)}…` : texto;
  const noted = await agregarNota(
    subdomain,
    accessToken,
    entityId,
    `💬 Lucy (WhatsApp Meta):\n${preview}`
  );
  if (noted) {
    logger.info({ entityId, channel, talkId, chatId }, "Lucy: espejo en nota (envío por Meta)");
  }
}
