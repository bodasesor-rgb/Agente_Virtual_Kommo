import { logger } from "../lib/logger.js";

function kommoHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

/**
 * Cierra una conversación en Kommo (equivale a marcarla como leída/atendida).
 * Usa force_close para no disparar bots NPS.
 */
export async function cerrarTalk(
  subdomain: string,
  accessToken: string,
  talkId: string | number
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/talks/${talkId}/close`,
      {
        method: "POST",
        headers: kommoHeaders(accessToken),
        signal: controller.signal,
        body: JSON.stringify({ force_close: true }),
      }
    );
    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(no body)");
      // 422 = ya cerrada — tratar como éxito
      if (res.status === 422) {
        logger.info({ talkId }, "cerrarTalk: conversación ya estaba cerrada");
        return true;
      }
      logger.warn({ status: res.status, errBody, talkId }, "cerrarTalk: Kommo rechazó la solicitud");
      return false;
    }

    logger.info({ talkId }, "cerrarTalk: conversación cerrada (marcada como leída)");
    return true;
  } catch (err) {
    logger.warn({ err, talkId }, "cerrarTalk: excepción");
    return false;
  }
}

/**
 * Marca publicidad como atendida: cierra el talk y opcionalmente agrega nota interna.
 */
export async function descartarPublicidad(
  subdomain: string,
  accessToken: string,
  talkId: string | null,
  leadId: string | number,
  reason: string,
  agregarNotaFn: (
    subdomain: string,
    accessToken: string,
    leadId: string | number,
    texto: string
  ) => Promise<void>
): Promise<void> {
  if (talkId) {
    await cerrarTalk(subdomain, accessToken, talkId);
  }

  await agregarNotaFn(
    subdomain,
    accessToken,
    leadId,
    `📢 Publicidad descartada automáticamente\nMotivo: ${reason}`
  ).catch((err: unknown) => {
    logger.warn({ err, leadId }, "descartarPublicidad: no se pudo agregar nota");
  });
}
