import { logger } from "../lib/logger.js";
import {
  allowPaidWhatsAppTemplates,
  formatWindowStatus,
  getFollowupTemplateName,
  getTemplateLanguage,
  isWhatsAppSessionOpen,
} from "./whatsappWindow.js";
import {
  fetchContactPhone,
  sendWhatsAppDirect,
  sendWhatsAppTemplate,
  type SendResult,
} from "./whatsappDirectSender.js";
import { agregarNota, enviarMensaje } from "./embudo.js";
import { crearTareaLead } from "./kommoTasks.js";

export type OutboundMode = "session" | "template" | "kommo_only" | "skipped";

export interface SmartWhatsAppSendResult {
  sent: boolean;
  mode: OutboundMode;
  reason?: string;
  metaResult?: SendResult;
}

export interface SmartWhatsAppSendOpts {
  subdomain: string;
  accessToken: string;
  leadId: string | number;
  text: string;
  /** Último mensaje del CLIENTE (no de Lucy) */
  lastClientMessageAt: Date | string | null | undefined;
  talkId?: string | null;
  phone?: string | null;
  /** Si false, nunca usa plantillas de pago */
  allowPaidTemplate?: boolean;
  /** Contexto para tarea cuando se omite envío */
  skipTaskText?: string;
  /** Intentar Kommo Talks si Meta no aplica (correo u otro canal) */
  preferKommoTalks?: boolean;
}

/**
 * Envía por WhatsApp solo si la ventana de 24h está abierta.
 * Fuera de ventana: omite el envío (evita costo) y crea tarea + nota en Kommo.
 */
export async function smartWhatsAppSend(opts: SmartWhatsAppSendOpts): Promise<SmartWhatsAppSendResult> {
  const {
    subdomain,
    accessToken,
    leadId,
    text,
    lastClientMessageAt,
    talkId,
    allowPaidTemplate = allowPaidWhatsAppTemplates(),
    skipTaskText,
    preferKommoTalks = false,
  } = opts;

  const windowOpen = isWhatsAppSessionOpen(lastClientMessageAt);
  const windowLabel = formatWindowStatus(lastClientMessageAt);

  let phone = opts.phone ?? null;
  if (!phone) {
    phone = await fetchContactPhone(subdomain, accessToken, leadId);
  }

  // ── Ventana abierta: mensaje de sesión gratis vía Meta ───────────────────
  if (windowOpen && phone) {
    const metaResult = await sendWhatsAppDirect(phone, text, leadId);
    if (metaResult.success) {
      return { sent: true, mode: "session", metaResult };
    }
    logger.warn({ leadId, error: metaResult.error }, "smartWhatsAppSend: Meta falló con ventana abierta");
  }

  // ── Ventana cerrada + plantilla permitida ─────────────────────────────────
  if (!windowOpen && allowPaidTemplate && phone) {
    const templateName = getFollowupTemplateName();
    if (templateName) {
      const metaResult = await sendWhatsAppTemplate(phone, templateName, getTemplateLanguage(), leadId);
      if (metaResult.success) {
        await agregarNota(
          subdomain,
          accessToken,
          leadId,
          `💰 Lucy: plantilla WhatsApp de pago enviada (${templateName}). Ventana: ${windowLabel}`
        );
        return { sent: true, mode: "template", metaResult };
      }
    }
  }

  // ── Kommo Talks (correo u otro — no aplica ventana WA) ───────────────────
  if (preferKommoTalks && talkId && !phone) {
    const ok = await enviarMensaje(subdomain, accessToken, talkId, text);
    if (ok) return { sent: true, mode: "kommo_only" };
  }

  // ── Omitir: ventana cerrada — evitar costo ───────────────────────────────
  const motivo =
    skipTaskText ??
    `Seguimiento omitido — ventana WhatsApp ${windowLabel}. Esperar que el cliente escriba o contactar manualmente.`;

  await agregarNota(
    subdomain,
    accessToken,
    leadId,
    `⏸️ Lucy: ${motivo}`
  );

  void crearTareaLead(subdomain, accessToken, {
    leadId,
    texto: `📱 WA ventana cerrada — ${motivo}`.slice(0, 480),
    completeTillHours: 24,
  });

  logger.info({ leadId, windowLabel }, "smartWhatsAppSend: envío omitido (ventana cerrada)");

  return {
    sent: false,
    mode: "skipped",
    reason: windowOpen ? "no_phone_or_meta_failed" : "window_closed",
  };
}
