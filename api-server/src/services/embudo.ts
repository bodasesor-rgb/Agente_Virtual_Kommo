// ══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE EMBUDO BODASESOR
// Pipeline: Embudo de ventas (ID: 9335963)
// ══════════════════════════════════════════════════════════════════════════════

import { db, followUpEvents, conversations } from "@workspace/db";
import { eq, lte, gte, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// ─── IDs de etapas del pipeline ───────────────────────────────────────────────
export const ETAPA = {
  LEADS_ENTRANTES:       72336719,
  DATOS_E_INTERESES:     80344783,
  HUMANO_TRABAJA:        105583875,
  COTIZACION_REALIZADA:  72336827,
  NO_CONTESTA:           105583415,
  CLIENTE_PERDIDO:       143,
} as const;

export const PIPELINE_ID = 9335963;

// Etapas donde Lucy está ACTIVA
const ETAPAS_LUCY_ACTIVA = new Set<number>([
  ETAPA.LEADS_ENTRANTES,
  ETAPA.DATOS_E_INTERESES,
  ETAPA.NO_CONTESTA,
]);

// Tiempos
const MS_INACTIVIDAD = 5 * 60 * 60 * 1000;    // 5 horas
const MS_SEGUIMIENTO = 22 * 60 * 60 * 1000;   // 22 horas
const MS_VENTANA_MIN = 22 * 60 * 60 * 1000;   // 22h — inicio de la ventana de alerta
const MS_VENTANA_MAX = 23 * 60 * 60 * 1000;   // 23h — límite antes de los 24h de WhatsApp

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface LeadKommo {
  id: number;
  pipeline_id: number;
  status_id: number;
  name: string;
  chatId: string | null;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  fecha_evento: string | null;
  num_invitados: string | null;
  tipo_evento: string | null;
  presupuesto: string | null;
  tags: string[];
}

// ─── Helpers Kommo API ────────────────────────────────────────────────────────
function kommoHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

export async function fetchLead(
  subdomain: string,
  accessToken: string,
  leadId: string | number
): Promise<LeadKommo | null> {
  try {
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/leads/${leadId}?with=contacts,tags`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const cfv: Array<{ field_id: number; values: Array<{ value: unknown }> }> =
      data.custom_fields_values ?? [];

    const getField = (id: number): string | null => {
      const f = cfv.find((x) => x.field_id === id);
      const v = f?.values[0]?.value;
      return v && typeof v === "string" && v.trim() ? v.trim() : null;
    };

    return {
      id: data.id,
      pipeline_id: data.pipeline_id,
      status_id: data.status_id,
      name: data.name ?? "",
      chatId: data._embedded?.chats?.[0]?.id ?? null,
      nombre: getField(1048782) ?? null, // se rellena desde extractedData — usamos nombre del lead
      correo: null,  // no hay campo correo en lead — viene del contacto
      telefono: null,
      direccion: getField(1048774),
      fecha_evento: getField(1048778),
      num_invitados: getField(1048780),
      tipo_evento: getField(1048782),
      presupuesto: getField(1048784),
      tags: (data._embedded?.tags ?? []).map((t: { name: string }) => t.name),
    };
  } catch {
    return null;
  }
}

export async function moverEtapa(
  subdomain: string,
  accessToken: string,
  leadId: string | number,
  statusId: number
): Promise<boolean> {
  const res = await fetch(
    `https://${subdomain}.kommo.com/api/v4/leads/${leadId}`,
    {
      method: "PATCH",
      headers: kommoHeaders(accessToken),
      body: JSON.stringify({ pipeline_id: PIPELINE_ID, status_id: statusId }),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    logger.warn({ leadId, statusId, httpStatus: res.status, errText }, "moverEtapa: PATCH fallido");
  }
  return res.ok;
}

export async function agregarNota(
  subdomain: string,
  accessToken: string,
  leadId: string | number,
  texto: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/leads/notes`,
      {
        method: "POST",
        headers: kommoHeaders(accessToken),
        body: JSON.stringify([{
          entity_id: Number(leadId),
          note_type: "common",
          params: { text: texto },
        }]),
      }
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "(no body)");
      logger.warn({ leadId, status: res.status, errBody }, "agregarNota: Kommo rechazó la nota");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ leadId, err }, "agregarNota: excepción (timeout o red)");
    return false;
  }
}

export async function agregarTag(
  subdomain: string,
  accessToken: string,
  leadId: string | number,
  tags: string[],
  existingTags: string[] = []
): Promise<void> {
  const merged = [...new Set([...existingTags, ...tags])].map((n) => ({ name: n }));
  await fetch(
    `https://${subdomain}.kommo.com/api/v4/leads/${leadId}`,
    {
      method: "PATCH",
      headers: kommoHeaders(accessToken),
      body: JSON.stringify({ _embedded: { tags: merged } }),
    }
  );
}

/**
 * Limpia el campo 1048786 (respuesta_ia_largo) escribiendo "-".
 * Evita que el SalesBot reenvíe el último mensaje de Lucy al cliente.
 */
export async function limpiarCampoRespuesta(
  subdomain: string,
  accessToken: string,
  leadId: string | number
): Promise<void> {
  try {
    await fetch(
      `https://${subdomain}.kommo.com/api/v4/leads/${leadId}`,
      {
        method: "PATCH",
        headers: kommoHeaders(accessToken),
        body: JSON.stringify({
          custom_fields_values: [
            { field_id: 1048786, values: [{ value: "-" }] },
          ],
        }),
      }
    );
    logger.info({ leadId }, "Embudo: campo 1048786 limpiado (SalesBot no reenviará)");
  } catch (err) {
    logger.warn({ leadId, err }, "Embudo: no se pudo limpiar campo 1048786");
  }
}

export async function removerTag(
  subdomain: string,
  accessToken: string,
  leadId: string | number,
  tagToRemove: string,
  existingTags: string[]
): Promise<void> {
  const filtered = existingTags.filter((t) => t !== tagToRemove).map((n) => ({ name: n }));
  await fetch(
    `https://${subdomain}.kommo.com/api/v4/leads/${leadId}`,
    {
      method: "PATCH",
      headers: kommoHeaders(accessToken),
      body: JSON.stringify({ _embedded: { tags: filtered } }),
    }
  );
}

// Enviar mensaje al lead via Kommo Talks API
export async function enviarMensaje(
  subdomain: string,
  accessToken: string,
  talkId: string | number,
  texto: string
): Promise<boolean> {
  // El endpoint correcto de Kommo para enviar mensajes outbound es:
  // POST /api/v4/talks/{talkId}/messages  (NO /api/v4/chats/messages — ese da 404)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/talks/${talkId}/messages`,
      {
        method: "POST",
        headers: kommoHeaders(accessToken),
        signal: controller.signal,
        body: JSON.stringify({ text: texto }),
      }
    );
    clearTimeout(timer);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "(no body)");
      logger.warn({ status: res.status, errBody, talkId }, "enviarMensaje: Kommo rechazó la solicitud");
    }
    return res.ok;
  } catch (err) {
    logger.warn({ err, talkId }, "enviarMensaje: excepción (timeout o red)");
    return false;
  }
}

// ─── Lógica de embudo ─────────────────────────────────────────────────────────

/**
 * Verifica si Lucy debe responder a este lead.
 * Lucy está activa si:
 *  1. La etapa es una de las permitidas (Leads Entrantes, Datos e Intereses, No Contesta)
 *  2. El lead NO tiene el tag "lucy_desactivada"
 */
export function lucyDebeResponder(statusId: number, tags: string[]): boolean {
  if (!ETAPAS_LUCY_ACTIVA.has(statusId)) return false;
  if (tags.includes("lucy_desactivada")) return false;
  return true;
}

/**
 * Verifica si el lead tiene TODOS los datos necesarios para pasar a Humano Trabaja.
 * Campos requeridos: correo, fecha_evento, num_invitados, tipo_evento, direccion
 * (nombre y teléfono son deseables pero no bloqueantes)
 */
export interface DatosLead {
  // Cliente
  correo?: string | null;
  fecha_evento?: string | null;
  num_invitados?: string | number | null;
  tipo_evento?: string | null;
  direccion?: string | null;
  // Proveedor
  tipo_contacto?: "cliente" | "proveedor" | "incierto" | null;
  empresa?: string | null;
  requerimientos_evento?: string | null;
}

/**
 * Verifica si el lead tiene TODOS los datos necesarios para avanzar.
 * - CLIENTE: correo + fecha + num_invitados + tipo_evento + direccion
 * - PROVEEDOR: correo + empresa + requerimientos_evento (descripción de productos)
 */
export function tieneInformacionCompleta(datos: DatosLead): boolean {
  if (datos.tipo_contacto === "proveedor") {
    const correoOk = !!datos.correo?.trim();
    const empresaOk = !!datos.empresa?.trim();
    const descOk = !!datos.requerimientos_evento && datos.requerimientos_evento.trim().length > 20;
    return correoOk && empresaOk && descOk;
  }
  // Default: flujo cliente
  const correoOk = !!datos.correo?.trim();
  const fechaOk = !!datos.fecha_evento?.trim();
  const invitadosOk = !!datos.num_invitados && String(datos.num_invitados).trim() !== "";
  const tipoOk = !!datos.tipo_evento?.trim();
  const dirOk = !!datos.direccion?.trim();
  return correoOk && fechaOk && invitadosOk && tipoOk && dirOk;
}

/**
 * Mueve lead a "Humano Trabaja", desactiva Lucy, agrega nota para Alejandro.
 * No envía mensaje — Lucy ya debió enviar el cierre en su respuesta AI.
 */
export async function moverAHumanoTrabaja(
  subdomain: string,
  accessToken: string,
  leadId: string | number,
  datos: {
    nombre?: string | null;
    correo?: string | null;
    tipo_evento?: string | null;
    fecha_evento?: string | null;
    num_invitados?: string | number | null;
    direccion?: string | null;
    presupuesto?: string | number | null;
  },
  tags: string[]
): Promise<void> {
  logger.info({ leadId }, "Embudo: moviendo lead a Humano Trabaja");

  const [etapaOk] = await Promise.all([
    moverEtapa(subdomain, accessToken, leadId, ETAPA.HUMANO_TRABAJA),
    agregarTag(subdomain, accessToken, leadId, ["lucy_desactivada"], tags),
    limpiarCampoRespuesta(subdomain, accessToken, leadId),
  ]);

  if (!etapaOk) {
    logger.warn({ leadId }, "Embudo: no se pudo mover etapa a Humano Trabaja");
  }

  const nota = `🤖 Lucy: Información completa — listo para cotizar.

📋 DATOS DEL CLIENTE:
• Nombre: ${datos.nombre ?? "—"}
• Correo: ${datos.correo ?? "—"}
• Tipo de evento: ${datos.tipo_evento ?? "—"}
• Fecha: ${datos.fecha_evento ?? "—"}
• Invitados: ${datos.num_invitados ?? "—"}
• Dirección: ${datos.direccion ?? "—"}
• Presupuesto: ${datos.presupuesto ?? "—"}

✅ Lead calificado — Listo para cotizar`;

  await agregarNota(subdomain, accessToken, leadId, nota);

  // Marcar en BD
  try {
    await db.update(conversations)
      .set({ stage: "humano_trabaja", status: "qualified", updatedAt: new Date() })
      .where(eq(conversations.kommoLeadId, String(leadId)));
  } catch {
    // no crítico
  }

  logger.info({ leadId }, "Embudo: lead movido a Humano Trabaja");
}

/**
 * Mueve lead inactivo (>5h) a "No Contesta".
 * Lucy sigue activa en esa etapa para intentar recuperar.
 */
export async function moverANoContesta(
  subdomain: string,
  accessToken: string,
  leadId: string | number,
  chatId: string
): Promise<void> {
  logger.info({ leadId }, "Embudo: moviendo lead a No Contesta por inactividad");

  await moverEtapa(subdomain, accessToken, leadId, ETAPA.NO_CONTESTA);

  const mensaje = `Hola! Vi que no terminamos de platicar sobre tu evento.

¿Sigues interesado en la cotización? Me encantaría ayudarte.

Si ya no necesitas el servicio no hay problema, solo avísame.`;

  const enviado = await enviarMensaje(subdomain, accessToken, chatId, mensaje);

  await agregarNota(
    subdomain, accessToken, leadId,
    `⏰ Lucy: Cliente inactivo >5h. Movido a No Contesta. Mensaje de recuperación ${enviado ? "enviado" : "NO enviado"}.`
  );

  logger.info({ leadId, mensajeEnviado: enviado }, "Embudo: lead movido a No Contesta");
}

/**
 * Recupera un lead de "No Contesta" cuando responde.
 * Si ya tiene datos completos → Humano Trabaja. Si no → Datos e Intereses.
 */
export async function recuperarDeNoContesta(
  subdomain: string,
  accessToken: string,
  leadId: string | number,
  datos: DatosLead,
  tags: string[]
): Promise<void> {
  logger.info({ leadId }, "Embudo: recuperando lead de No Contesta");

  // Siempre regresa a Datos e Intereses — movimiento a Humano Trabaja es solo manual.
  await moverEtapa(subdomain, accessToken, leadId, ETAPA.DATOS_E_INTERESES);
  await agregarNota(
    subdomain, accessToken, leadId,
    "Lucy: Lead recuperado de No Contesta. Regresó a Datos e Intereses."
  );
}

/**
 * Programa un seguimiento post-cotización (22h) en la tabla followUpEvents.
 */
export async function programarSeguimiento(
  leadId: string | number,
  chatId: string,
  nombre: string | null,
  tipoEvento: string | null,
  fechaEvento: string | null
): Promise<void> {
  const scheduledFor = new Date(Date.now() + MS_SEGUIMIENTO);

  const mensaje = `Hola ${nombre ?? ""}! Soy Lucy, agente virtual de Bodasesor.

Vi que Alejandro te envió la cotización para tu ${tipoEvento ?? "evento"} del ${fechaEvento ?? ""}.

¿Tuviste oportunidad de revisarla? ¿Tienes alguna duda o te gustaría ajustar algo?

Estoy aquí para ayudarte.`;

  try {
    await db.insert(followUpEvents).values({
      kommoLeadId: String(leadId),
      type: "cotizacion_followup",
      scheduledFor,
      message: JSON.stringify({ chatId, texto: mensaje }),
      priority: 1,
    });
    logger.info({ leadId, scheduledFor }, "Embudo: seguimiento programado 22h");
  } catch (err) {
    logger.warn({ err, leadId }, "Embudo: no se pudo programar seguimiento");
  }
}

/**
 * Procesa seguimientos pendientes (llamar cada hora desde cron).
 * Busca followUpEvents con scheduledFor <= NOW() y executed = false.
 */
export async function procesarSeguimientosPendientes(
  subdomain: string,
  accessToken: string
): Promise<void> {
  let pendientes;
  try {
    pendientes = await db.query.followUpEvents.findMany({
      where: and(
        lte(followUpEvents.scheduledFor, new Date()),
        eq(followUpEvents.executed, false)
      ),
    });
  } catch (err) {
    logger.warn({ err }, "Embudo: error leyendo seguimientos pendientes");
    return;
  }

  logger.info({ count: pendientes.length }, "Embudo: procesando seguimientos pendientes");

  for (const seg of pendientes) {
    try {
      let chatId: string | null = null;
      let texto = "";

      if (seg.message) {
        const parsed = JSON.parse(seg.message) as { chatId?: string; texto?: string };
        chatId = parsed.chatId ?? null;
        texto = parsed.texto ?? "";
      }

      if (chatId && texto) {
        const ok = await enviarMensaje(subdomain, accessToken, chatId, texto);
        if (ok) {
          // Reactivar Lucy (remover tag lucy_desactivada)
          const lead = await fetchLead(subdomain, accessToken, seg.kommoLeadId);
          if (lead) {
            await removerTag(subdomain, accessToken, seg.kommoLeadId, "lucy_desactivada", lead.tags);
          }
          await agregarNota(subdomain, accessToken, seg.kommoLeadId, "🔄 Lucy: Seguimiento automático 22h enviado. Lucy reactivada.");
          logger.info({ leadId: seg.kommoLeadId }, "Embudo: seguimiento 22h enviado OK");
        }
      }

      await db.update(followUpEvents)
        .set({ executed: true, executedAt: new Date() })
        .where(eq(followUpEvents.id, seg.id));
    } catch (err) {
      logger.warn({ err, seguimientoId: seg.id }, "Embudo: error procesando seguimiento");
    }
  }
}

/**
 * Reactiva Lucy manualmente para un lead:
 *  - Quita el tag lucy_desactivada
 *  - Si el lead estaba en Humano Trabaja, lo mueve de regreso a Datos e Intereses
 *  - Envía mensaje de reactivación personalizado al cliente
 */
export async function reactivarLucy(
  subdomain: string,
  accessToken: string,
  leadId: string | number
): Promise<{ ok: boolean; mensaje?: string }> {
  const lead = await fetchLead(subdomain, accessToken, leadId);
  if (!lead) return { ok: false };

  // Quitar tag lucy_desactivada
  await removerTag(subdomain, accessToken, leadId, "lucy_desactivada", lead.tags);

  // Si estaba en Humano Trabaja, regresarlo a Datos e Intereses
  if (lead.status_id === ETAPA.HUMANO_TRABAJA) {
    await moverEtapa(subdomain, accessToken, leadId, ETAPA.DATOS_E_INTERESES);
    logger.info({ leadId }, "Embudo: lead regresado a Datos e Intereses al reactivar Lucy");
  }

  // Generar mensaje personalizado
  const nombre = lead.nombre ? ` ${lead.nombre}` : "";
  const tieneContexto = !!(lead.tipo_evento || lead.fecha_evento);

  const mensaje = tieneContexto
    ? `Hola${nombre}! Soy Lucy, agente virtual de Bodasesor.\n\nVi que estábamos platicando sobre tu ${lead.tipo_evento ?? "evento"}${lead.fecha_evento ? " del " + lead.fecha_evento : ""}.\n\n¿Tuviste oportunidad de pensar en lo que platicamos? ¿Te gustaría retomar la cotización?\n\nEstoy aquí para ayudarte.`
    : `Hola${nombre}! Soy Lucy, agente virtual de Bodasesor.\n\n¿Sigues interesado en nuestros servicios de banquetes y eventos? Me encantaría ayudarte a planear algo especial.\n\n¿En qué puedo apoyarte?`;

  // Enviar solo si hay chatId
  let enviado = false;
  if (lead.chatId) {
    enviado = await enviarMensaje(subdomain, accessToken, lead.chatId, mensaje);
  }

  await agregarNota(
    subdomain, accessToken, leadId,
    `🔄 Lucy: Reactivada manualmente. Mensaje de reactivación ${enviado ? "enviado" : "NO enviado (sin chatId)"}.`
  );

  logger.info({ leadId, enviado }, "Embudo: Lucy reactivada manualmente");
  return { ok: true, mensaje };
}

/**
 * Verifica leads cuya última actividad del cliente fue hace 22-23h.
 * Envía un mensaje proactivo para renovar la ventana de 24h de WhatsApp.
 * Llamar cada hora desde el cron.
 */
export async function verificarVentanas24h(
  subdomain: string,
  accessToken: string
): Promise<void> {
  const ahora = new Date();
  const hace22h = new Date(ahora.getTime() - MS_VENTANA_MAX); // 23h atrás (límite superior)
  const hace23h = new Date(ahora.getTime() - MS_VENTANA_MIN); // 22h atrás (límite inferior)

  // Buscar conversaciones activas actualizadas entre 22h y 23h atrás
  let convs;
  try {
    convs = await db.query.conversations.findMany({
      where: and(
        gte(conversations.updatedAt, hace22h),
        lte(conversations.updatedAt, hace23h)
      ),
    });
  } catch (err) {
    logger.warn({ err }, "Embudo: error leyendo conversaciones para ventana 24h");
    return;
  }

  logger.info({ count: convs.length }, "Embudo: verificando ventana 24h de WhatsApp");

  for (const conv of convs) {
    try {
      // Solo actuar si tiene chatId y Lucy está activa
      if (!conv.kommoChatId) continue;

      const lead = await fetchLead(subdomain, accessToken, conv.kommoLeadId);
      if (!lead) continue;

      // Solo si Lucy está activa y el lead sigue en etapas donde puede escribir
      const activa = ETAPAS_LUCY_ACTIVA.has(lead.status_id) && !lead.tags.includes("lucy_desactivada");
      if (!activa) continue;

      const nombre = (conv.clientName ?? lead.nombre) ? ` ${conv.clientName ?? lead.nombre}` : "";
      const tipoEvento = conv.eventType ?? lead.tipo_evento;
      const fechaEvento = lead.fecha_evento;

      const mensaje = tipoEvento
        ? `Hola${nombre}! Solo quería recordarte que seguimos aquí para ayudarte con tu ${tipoEvento}${fechaEvento ? " del " + fechaEvento : ""}.\n\n¿Tienes alguna duda o te gustaría avanzar con la cotización? Estoy disponible.`
        : `Hola${nombre}! Soy Lucy, agente virtual de Bodasesor.\n\n¿Sigues interesado en cotizar tu evento? Estamos aquí para ayudarte cuando gustes.`;

      const enviado = await enviarMensaje(subdomain, accessToken, conv.kommoChatId, mensaje);

      if (enviado) {
        await agregarNota(
          subdomain, accessToken, conv.kommoLeadId,
          "⏰ Lucy: Mensaje automático enviado para renovar ventana de 24h de WhatsApp."
        );
        // Actualizar updatedAt para no volver a disparar en el siguiente ciclo
        await db.update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.kommoLeadId, conv.kommoLeadId));

        logger.info({ leadId: conv.kommoLeadId }, "Embudo: mensaje de ventana 24h enviado");
      }
    } catch (err) {
      logger.warn({ err, leadId: conv.kommoLeadId }, "Embudo: error procesando ventana 24h");
    }
  }
}

/**
 * Verifica leads inactivos en etapa "Datos e Intereses" (llamar cada hora desde cron).
 * Si un lead lleva >5h sin responder → mover a No Contesta.
 * Usa la tabla conversations.updatedAt como proxy del último mensaje del cliente.
 */
export async function verificarLeadsInactivos(
  subdomain: string,
  accessToken: string
): Promise<void> {
  const umbral = new Date(Date.now() - MS_INACTIVIDAD);

  let convInactivas;
  try {
    convInactivas = await db.query.conversations.findMany({
      where: and(
        eq(conversations.stage, "discovery"),
        lte(conversations.updatedAt, umbral)
      ),
    });
  } catch (err) {
    logger.warn({ err }, "Embudo: error leyendo conversaciones inactivas");
    return;
  }

  logger.info({ count: convInactivas.length }, "Embudo: revisando leads inactivos");

  for (const conv of convInactivas) {
    try {
      const lead = await fetchLead(subdomain, accessToken, conv.kommoLeadId);
      if (!lead) continue;

      // Solo actuar si está en Datos e Intereses y Lucy activa
      if (lead.status_id !== ETAPA.DATOS_E_INTERESES) continue;
      if (lead.tags.includes("lucy_desactivada")) continue;
      if (!conv.kommoChatId) continue;

      await moverANoContesta(subdomain, accessToken, conv.kommoLeadId, conv.kommoChatId);

      // Marcar en BD para no volver a procesar
      await db.update(conversations)
        .set({ stage: "no_contesta", updatedAt: new Date() })
        .where(eq(conversations.kommoLeadId, conv.kommoLeadId));
    } catch (err) {
      logger.warn({ err, leadId: conv.kommoLeadId }, "Embudo: error procesando inactividad");
    }
  }
}
