/**
 * Citas confirmadas por el equipo. Kommo no manda a Lucy el texto de lo que escribe
 * el vendedor en el chat, así que el equipo avisa con:
 *  - una nota en el lead ("videollamada mañana 10:30"), o
 *  - escribiendo directo en el campo "Cita o videollamada" (1049462).
 * Lucy lo lee del webhook (leads[note] / leads[update]) y lo deja en campo + nota + tarea.
 */
import {
  detectMeetingKind,
  formatSlotDate,
  formatSlotTime,
  parseMeetingSlot,
  slotStartMs,
  type MeetingKind,
} from "./meetingBooking.js";

export interface ManualMeetingSignal {
  leadId: string;
  text: string;
  source: "nota" | "campo";
}

export interface ConfirmedMeeting {
  meetingKind: MeetingKind | null;
  startMs: number;
  label: string;
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(
      (v): v is Record<string, unknown> => !!v && typeof v === "object"
    );
  }
  return [];
}

function str(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

/** Notas y valores del campo de cita que escribió una persona (no Lucy / API). */
export function extractManualMeetingSignals(
  rawBody: Record<string, unknown>,
  fieldId: number,
  lucyMarkers: string[]
): ManualMeetingSignal[] {
  const leads = rawBody?.["leads"];
  if (!leads || typeof leads !== "object") return [];
  const out: ManualMeetingSignal[] = [];
  const writtenByLucy = (text: string) =>
    /\blucy\b/i.test(text) ||
    /^\s*📅/u.test(text) ||
    /calendar\.google\.com/i.test(text) ||
    lucyMarkers.some((m) => m && text.includes(m));

  for (const entry of asArray((leads as Record<string, unknown>)["note"])) {
    const note = (entry["note"] && typeof entry["note"] === "object"
      ? entry["note"]
      : entry) as Record<string, unknown>;
    const leadId = str(note["element_id"] ?? entry["element_id"] ?? entry["id"]);
    const text = str(note["text"]);
    const createdBy = str(note["created_by"] ?? note["main_user_id"]);
    if (!/^\d+$/.test(leadId) || !text || createdBy === "0" || writtenByLucy(text)) continue;
    out.push({ leadId, text, source: "nota" });
  }

  for (const kind of ["update", "add"] as const) {
    for (const entry of asArray((leads as Record<string, unknown>)[kind])) {
      const leadId = str(entry["id"]);
      if (!/^\d+$/.test(leadId)) continue;
      if (str(entry["modified_user_id"]) === "0") continue;
      const field = asArray(entry["custom_fields"]).find((f) => str(f["id"]) === String(fieldId));
      if (!field) continue;
      const value = str(asArray(field["values"])[0]?.["value"]);
      if (!value || writtenByLucy(value)) continue;
      if (out.some((s) => s.leadId === leadId && s.source === "campo")) continue;
      out.push({ leadId, text: value, source: "campo" });
    }
  }
  return out;
}

const MEETING_WORDS =
  /\b(video\s*-?\s*llamada|videollamada|llamada|llamar|marcar|cita|reunion|junta|zoom|meet|agend\w*)\b/;

/**
 * Día y hora de la cita. En notas exige palabra de cita ("videollamada", "cita", "agendada"…);
 * en el campo basta con día/hora porque el campo ya es de cita.
 */
export function parseConfirmedMeeting(
  signal: Pick<ManualMeetingSignal, "text" | "source">,
  nowMs: number = Date.now()
): ConfirmedMeeting | null {
  const t = signal.text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (signal.source === "nota" && (!MEETING_WORDS.test(t) || t.length > 300)) return null;
  const slot = parseMeetingSlot(signal.text, nowMs);
  if (!slot.time) return null;
  let date = slot.date;
  if (!date) {
    const local = new Date(nowMs - 6 * 3600_000);
    const today = { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate() };
    date = today;
    if (slotStartMs(date, slot.time) < nowMs) {
      const next = new Date(Date.UTC(today.y, today.m, today.d + 1));
      date = { y: next.getUTCFullYear(), m: next.getUTCMonth(), d: next.getUTCDate() };
    }
  }
  const startMs = slotStartMs(date, slot.time);
  if (startMs < nowMs - 60 * 60_000) return null;
  const meetingKind = /\bvideo|zoom|meet\b|teams|llamada|llamar|marcar|cita\b/.test(t)
    ? detectMeetingKind(signal.text)
    : null;
  return {
    meetingKind,
    startMs,
    label: `${formatSlotDate(date)} a las ${formatSlotTime(slot.time)}`,
  };
}
