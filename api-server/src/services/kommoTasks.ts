import { logger } from "../lib/logger.js";

function kommoHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

function defaultCompleteTill(hoursFromNow: number): number {
  return Math.floor(Date.now() / 1000) + hoursFromNow * 3600;
}

function parseResponsibleUserId(): number | undefined {
  const raw = process.env["KOMMO_RESPONSIBLE_USER_ID"]?.trim();
  if (!raw) return undefined;
  const id = Number(raw);
  return Number.isFinite(id) ? id : undefined;
}

export interface CrearTareaOpts {
  leadId: string | number;
  texto: string;
  /** Unix timestamp o horas desde ahora (default 4h) */
  completeTillHours?: number;
  responsibleUserId?: number;
}

/**
 * Crea una tarea en Kommo vinculada a un lead.
 * POST /api/v4/tasks
 */
export async function crearTareaLead(
  subdomain: string,
  accessToken: string,
  opts: CrearTareaOpts
): Promise<boolean> {
  const completeTill =
    opts.completeTillHours != null
      ? defaultCompleteTill(opts.completeTillHours)
      : defaultCompleteTill(4);

  const task: Record<string, unknown> = {
    text: opts.texto.slice(0, 500),
    complete_till: completeTill,
    entity_id: Number(opts.leadId),
    entity_type: "leads",
  };

  const responsible = opts.responsibleUserId ?? parseResponsibleUserId();
  if (responsible) task.responsible_user_id = responsible;

  try {
    const res = await fetch(`https://${subdomain}.kommo.com/api/v4/tasks`, {
      method: "POST",
      headers: kommoHeaders(accessToken),
      body: JSON.stringify([task]),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      logger.warn({ leadId: opts.leadId, status: res.status, errBody }, "crearTareaLead: falló");
      return false;
    }

    logger.info({ leadId: opts.leadId }, "crearTareaLead: tarea creada en Kommo");
    return true;
  } catch (err) {
    logger.warn({ err, leadId: opts.leadId }, "crearTareaLead: excepción");
    return false;
  }
}

export async function crearTareaLeadCaliente(
  subdomain: string,
  accessToken: string,
  leadId: string | number,
  resumen: string
): Promise<boolean> {
  return crearTareaLead(subdomain, accessToken, {
    leadId,
    texto: `🔥 LEAD CALIENTE — ${resumen}`,
    completeTillHours: 2,
  });
}

export async function crearTareaCotizacion(
  subdomain: string,
  accessToken: string,
  leadId: string | number,
  nombre: string | null,
  tipoEvento: string | null,
  invitados: string | number | null
): Promise<boolean> {
  const quien = nombre?.trim() || "Cliente";
  const evento = tipoEvento?.trim() || "evento";
  const pax = invitados != null ? ` — ${invitados} invitados` : "";
  return crearTareaLead(subdomain, accessToken, {
    leadId,
    texto: `📋 Cotizar ${evento} para ${quien}${pax}. Lucy completó datos.`,
    completeTillHours: 4,
  });
}
