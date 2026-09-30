/**
 * Datos del cliente y del evento para el evento de Google Calendar de una cita / videollamada,
 * para que al abrir el link ya venga todo (nombre, WhatsApp, correo, evento, requerimientos).
 */
import { logger } from "../lib/logger.js";

export interface MeetingContactInfo {
  nombre: string | null;
  telefono: string | null;
  correo: string | null;
  tipoEvento: string | null;
  fechaEvento: string | null;
  horarioEvento: string | null;
  invitados: string | null;
  direccion: string | null;
  requerimientos: string | null;
  presupuesto: string | null;
}

const LEAD_FIELDS = {
  direccion: 1048774,
  requerimientos: 1048776,
  fechaEvento: 1048778,
  horarioEvento: 1049358,
  invitados: 1048780,
  tipoEvento: 1048782,
  presupuesto: 1048784,
} as const;

type Cfv = Array<{ field_id?: number; field_code?: string; values?: Array<{ value?: unknown }> }>;

function firstValue(cfv: Cfv | undefined, match: (f: Cfv[number]) => boolean): string | null {
  const v = cfv?.find(match)?.values?.[0]?.value;
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v.trim() && v.trim() !== "-" ? v.trim() : null;
}

/** "Lead #123" / "Contacto nuevo" no sirven como nombre del cliente. */
function usableName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = name.trim();
  if (!n || /^(lead|contacto|contact|nuevo|new)\b|#\d+/i.test(n) || /^\+?\d[\d\s-]+$/.test(n)) return null;
  return n;
}

export async function fetchMeetingContactInfo(
  subdomain: string,
  accessToken: string,
  leadId: string | number
): Promise<MeetingContactInfo | null> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  try {
    const leadRes = await fetch(`https://${subdomain}.kommo.com/api/v4/leads/${leadId}?with=contacts`, { headers });
    if (!leadRes.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lead = (await leadRes.json()) as any;
    const lcfv = lead.custom_fields_values as Cfv | undefined;
    const byId = (id: number) => firstValue(lcfv, (f) => f.field_id === id);

    const info: MeetingContactInfo = {
      nombre: usableName(lead.name),
      telefono: null,
      correo: null,
      tipoEvento: byId(LEAD_FIELDS.tipoEvento),
      fechaEvento: byId(LEAD_FIELDS.fechaEvento),
      horarioEvento: byId(LEAD_FIELDS.horarioEvento),
      invitados: byId(LEAD_FIELDS.invitados),
      direccion: byId(LEAD_FIELDS.direccion),
      requerimientos: byId(LEAD_FIELDS.requerimientos),
      presupuesto: byId(LEAD_FIELDS.presupuesto),
    };

    const contacts: Array<{ id: number; is_main?: boolean }> = lead._embedded?.contacts ?? [];
    const contactId = (contacts.find((c) => c.is_main) ?? contacts[0])?.id;
    if (contactId) {
      const cRes = await fetch(`https://${subdomain}.kommo.com/api/v4/contacts/${contactId}`, { headers });
      if (cRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = (await cRes.json()) as any;
        const ccfv = c.custom_fields_values as Cfv | undefined;
        info.nombre = usableName(c.name) ?? info.nombre;
        info.telefono = firstValue(ccfv, (f) => f.field_code === "PHONE");
        info.correo = firstValue(ccfv, (f) => f.field_code === "EMAIL");
      }
    }
    return info;
  } catch (err) {
    logger.warn({ err, leadId }, "fetchMeetingContactInfo: no se pudieron leer los datos del cliente");
    return null;
  }
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function isValidEmail(s: string | null | undefined): s is string {
  return !!s && /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(s.trim());
}

/** Descripción del evento de Google Calendar: datos del cliente arriba, contexto de la cita abajo. */
export function buildMeetingDetails(
  info: MeetingContactInfo | null,
  opts: { kommoUrl: string; footer: string[] }
): string {
  const lines: string[] = [];
  if (info) {
    if (info.nombre) lines.push(`Cliente: ${info.nombre}`);
    if (info.telefono) {
      const digits = info.telefono.replace(/\D/g, "");
      lines.push(`WhatsApp: ${info.telefono}${digits.length >= 10 ? ` (https://wa.me/${digits})` : ""}`);
    }
    if (info.correo) lines.push(`Correo: ${info.correo}`);
    const evento = [
      info.tipoEvento,
      [info.fechaEvento, info.horarioEvento].filter(Boolean).join(", "),
      info.invitados ? `${info.invitados.replace(/\s*(personas?|invitados?)\s*$/i, "")} invitados` : null,
    ].filter((x): x is string => !!x && !!x.trim());
    if (evento.length) lines.push(`Evento: ${evento.join(" · ")}`);
    if (info.direccion) lines.push(`Lugar: ${clip(info.direccion, 150)}`);
    if (info.requerimientos) lines.push(`Requerimientos: ${clip(info.requerimientos, 400)}`);
    if (info.presupuesto) lines.push(`Presupuesto: ${info.presupuesto}`);
  }
  if (lines.length) lines.push("");
  lines.push(`Lead en Kommo: ${opts.kommoUrl}`);
  lines.push(...opts.footer);
  return lines.join("\n");
}
