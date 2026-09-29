/**
 * Citas / videollamadas: Lucy manda el link de reservas de Google Calendar y,
 * si el cliente escribe día y hora ("el jueves a las 5"), lo entiende y lo anota
 * en Kommo (nota con botón "Agregar a Google Calendar" + tarea).
 */

export const DEFAULT_BOOKING_URL = "https://calendar.app.google/LMFvik7YS4xuUu9L6";
export const MEETING_TIMEZONE = "America/Mexico_City";
/** CDMX no tiene horario de verano desde 2022: UTC-6 todo el año. */
const MX_OFFSET_HOURS = -6;
export const MEETING_DURATION_MIN = 90;

export function getBookingUrl(): string {
  return process.env["LUCY_BOOKING_URL"]?.trim() || DEFAULT_BOOKING_URL;
}

export type MeetingKind = "videollamada" | "llamada" | "cita";

export interface MeetingSlot {
  /** Día resuelto (hora local CDMX). */
  date: { y: number; m: number; d: number } | null;
  time: { h: number; min: number } | null;
}

export type MeetingDecision =
  | { kind: "offer_link"; meetingKind: MeetingKind; reply: string }
  | { kind: "needs_detail"; meetingKind: MeetingKind; reply: string }
  | {
      kind: "slot";
      meetingKind: MeetingKind;
      reply: string;
      startMs: number;
      label: string;
    }
  | { kind: "booked"; meetingKind: MeetingKind; reply: string };

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const WEEKDAYS_DISPLAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Hoy" en CDMX como {y, m (0-11), d, weekday}. */
function mxToday(nowMs: number): { y: number; m: number; d: number; wd: number } {
  const local = new Date(nowMs + MX_OFFSET_HOURS * 3600_000);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth(),
    d: local.getUTCDate(),
    wd: local.getUTCDay(),
  };
}

function addDays(base: { y: number; m: number; d: number }, days: number) {
  const dt = new Date(Date.UTC(base.y, base.m, base.d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

export function slotStartMs(date: { y: number; m: number; d: number }, time: { h: number; min: number }): number {
  return Date.UTC(date.y, date.m, date.d, time.h - MX_OFFSET_HOURS, time.min);
}

/** El cliente pide cita / videollamada / reunión con el equipo. */
export function clientAsksForMeeting(message?: string | null): boolean {
  if (!message?.trim()) return false;
  const t = normalize(message);
  // "reunión familiar / de 15 años / de ex alumnos" es tipo de evento, no una cita.
  const tNoEventReunion = t.replace(
    /\breunion(es)?\s+(familiar(es)?|de\s+(\d+|ex|egresados|trabajo|fin|amigos|generacion)|anual|empresarial|corporativa)\b/g,
    " "
  );
  // "cita en la iglesia / con el juez" es parte del evento, no con Bodasesor.
  const tNoEventCita = t.replace(
    /\bcitas?\s+(en|con|para)\s+(la|el)?\s*(iglesia|civil|registro|juez|misa|parroquia|notari[ao])\b/g,
    " "
  );
  return (
    /\bvideo\s*-?\s*llamadas?\b/.test(t) ||
    /\bvideo\s*conferencias?\b/.test(t) ||
    /\b(por|en|un|una|link\s+de)\s+(zoom|meet|google\s+meet|teams)\b/.test(t) ||
    /\b(hablar|platicar|vernos|conectarnos)\s+por\s+video\b/.test(t) ||
    /\bcitas?\b/.test(tNoEventCita) ||
    /\b(agendar|agendamos|agendemos|agendo|programar|hacer|tener|podemos\s+tener)\s+(una\s+)?llamada\b/.test(t) ||
    /\b(agendar|agendamos|agendemos|agendo|programar)\s+(una\s+)?reunion\b/.test(tNoEventReunion) ||
    /\b(una|la)\s+llamada\s+(para|con)\s+(platicar|ver|revisar|ustedes|un\s+asesor|alguien|el\s+equipo)\b/.test(t) ||
    /\breunion\s+(virtual|en\s+linea|online|por\s+(zoom|meet|video|llamada)|con\s+(ustedes|un\s+asesor|alguien|el\s+equipo)|para\s+(platicar|ver|revisar))\b/.test(
      tNoEventReunion
    ) ||
    /\b(me\s+)?(pueden|puedes)\s+agendar\b/.test(t) ||
    /\bagendar(nos|me)?\b.{0,25}\b(llamada|reunion|cita|videollamada|asesor)\b/.test(t)
  );
}

/** Pide que le llamen ("márquenme", "me pueden llamar") — solo cuenta si además da día y hora. */
function clientAsksToBeCalled(t: string): boolean {
  return /\b(marquenme|llamenme|llamarme|me\s+marcan|me\s+llaman|me\s+(pueden|podrian)\s+(marcar|llamar)|que\s+me\s+(marquen|llamen))\b/.test(
    t
  );
}

export function detectMeetingKind(...texts: Array<string | null | undefined>): MeetingKind {
  const t = normalize(texts.filter(Boolean).join(" "));
  if (/\bvideo\s*-?\s*llamada|video\s*conferencia|\bzoom\b|\bmeet\b|\bteams\b|por\s+video\b/.test(t)) {
    return "videollamada";
  }
  if (/\bllamada\b|\bllamar|\bmarcar|\bmarquen|\bllamen/.test(t)) return "llamada";
  return "cita";
}

/** Día y hora escritos por el cliente (hora local CDMX). */
export function parseMeetingSlot(message: string, nowMs: number = Date.now()): MeetingSlot {
  let t = normalize(message);
  const today = mxToday(nowMs);

  let dayPart: "am" | "pm" | null = null;
  if (/\b(de|en|por)\s+la\s+(tarde|noche)\b/.test(t)) dayPart = "pm";
  else if (/\b(de|en|por)\s+la\s+manana\b/.test(t)) dayPart = "am";
  t = t.replace(/\b(de|en|por)\s+la\s+(manana|tarde|noche)\b/g, " ");

  let date: MeetingSlot["date"] = null;
  const monthRe = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTHS.join("|")})\\b`);
  const monthMatch = t.match(monthRe);
  if (monthMatch) {
    const d = Number(monthMatch[1]);
    const m = MONTHS.indexOf(monthMatch[2]!);
    if (d >= 1 && d <= 31) {
      let y = today.y;
      if (Date.UTC(y, m, d) < Date.UTC(today.y, today.m, today.d)) y += 1;
      date = { y, m, d };
    }
    t = t.replace(monthMatch[0], " ");
  }
  if (!date) {
    const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/);
    if (slash) {
      const d = Number(slash[1]);
      const m = Number(slash[2]) - 1;
      if (d >= 1 && d <= 31 && m >= 0 && m <= 11) {
        let y = today.y;
        if (Date.UTC(y, m, d) < Date.UTC(today.y, today.m, today.d)) y += 1;
        date = { y, m, d };
      }
      t = t.replace(slash[0], " ");
    }
  }
  if (!date) {
    if (/\bpasado\s+manana\b/.test(t)) date = addDays(today, 2);
    else if (/\bmanana\b/.test(t)) date = addDays(today, 1);
    else if (/\bhoy\b/.test(t)) date = addDays(today, 0);
    else {
      const wdMatch = t.match(new RegExp(`\\b(este|esta|el|proximo|pr[oó]ximo)?\\s*(${WEEKDAYS.join("|")})\\b`));
      if (wdMatch) {
        const target = WEEKDAYS.indexOf(wdMatch[2]!);
        let diff = (target - today.wd + 7) % 7;
        if (diff === 0 && !/^est[ea]$/.test(wdMatch[1] ?? "")) diff = 7;
        date = addDays(today, diff);
      }
    }
  }

  let time: MeetingSlot["time"] = null;
  let h: number | null = null;
  let min = 0;
  let marker: "am" | "pm" | null = null;
  const withMarker = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?=\s|$|[,!?])/);
  const withPrefix = t.match(/\b(?:a\s+las?|alas|tipo|como\s+a\s+las?|las)\s+(\d{1,2})(?:[:.](\d{2}))?\b/);
  const bare = t.match(/\b(\d{1,2}):(\d{2})\b/);
  const tm = withMarker ?? withPrefix ?? bare;
  if (tm) {
    h = Number(tm[1]);
    min = tm[2] ? Number(tm[2]) : 0;
    const mk = withMarker && tm === withMarker ? tm[3] ?? "" : "";
    if (/^a/.test(mk)) marker = "am";
    else if (/^p/.test(mk)) marker = "pm";
  } else if (/\bmedio\s*dia\b/.test(t)) {
    h = 12;
  }
  if (h !== null && h >= 0 && h <= 23 && min >= 0 && min <= 59) {
    const part = marker ?? dayPart;
    if (part === "pm" && h < 12) h += 12;
    else if (part === "am" && h === 12) h = 0;
    else if (!part && h >= 1 && h <= 7) h += 12;
    time = { h, min };
  }

  return { date, time };
}

export function formatSlotDate(date: { y: number; m: number; d: number }): string {
  const wd = new Date(Date.UTC(date.y, date.m, date.d)).getUTCDay();
  return `${WEEKDAYS_DISPLAY[wd]} ${date.d} de ${MONTHS[date.m]}`;
}

export function formatSlotTime(time: { h: number; min: number }): string {
  const suffix = time.h >= 12 ? "pm" : "am";
  const h12 = time.h % 12 === 0 ? 12 : time.h % 12;
  return `${h12}:${String(time.min).padStart(2, "0")} ${suffix}`;
}

/** Hora local CDMX en formato de Google Calendar (YYYYMMDDTHHMMSS). */
function toCalendarStamp(utcMs: number): string {
  const dt = new Date(utcMs + MX_OFFSET_HOURS * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}` +
    `T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00`
  );
}

/** Link "Agregar a Google Calendar" (un clic, sin credenciales). */
export function buildGoogleCalendarAddUrl(opts: {
  title: string;
  startMs: number;
  details?: string;
  durationMin?: number;
}): string {
  const start = toCalendarStamp(opts.startMs);
  const end = toCalendarStamp(opts.startMs + (opts.durationMin ?? MEETING_DURATION_MIN) * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${start}/${end}`,
    ctz: MEETING_TIMEZONE,
  });
  if (opts.details) params.set("details", opts.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const EVENT_SCHEDULE_WORDS =
  /\b(evento|fiesta|boda|xv|quince|cumple\w*|celebracion|misa|ceremonia|recepcion|banquete|empieza|empezaria|inicia|iniciaria|termina|terminaria|invitados|montaje|servicio)\b/;

/** "10:30?", "mañana a las 5", "sí, a las 10 está bien" — solo día/hora, sin hablar del evento. */
function isBareMeetingTimeReply(t: string): boolean {
  if (EVENT_SCHEDULE_WORDS.test(t)) return false;
  const rest = t
    .replace(/\b\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?\s?m\.?|p\.?\s?m\.?|hrs?|horas?)?(?=\s|$|[,!?¿¡.])/g, " ")
    .replace(
      new RegExp(
        `\\b(?:${WEEKDAYS.join("|")}|hoy|pasado|manana|tarde|noche|medio\\s*dia|mediodia|de|la|el|las|a|alas|en|por|este|esta|proximo|si|ok|okay|va|vale|sale|dale|claro|perfecto|esta|bien|me|queda|quedaria|acomoda|funciona|puedo|puede|ser|mejor|entonces|que|tal|como|tipo|favor|porfa|gracias|y|o)\\b`,
        "g"
      ),
      " "
    )
    .replace(/[\s¿?¡!.,:;👍🙏😊]+/gu, "");
  return rest.length === 0;
}

/**
 * Lead con el equipo (Lucy en silencio): el cliente propone / confirma día y hora de la
 * llamada o videollamada que le ofreció un asesor. Kommo no nos pasa el texto del asesor,
 * así que solo se usa lo que escribe el cliente.
 */
export function detectSilentMeetingProposal(
  message: string,
  nowMs: number = Date.now()
): { meetingKind: MeetingKind | null; startMs: number; label: string } | null {
  if (!message?.trim()) return null;
  const t = normalize(message);
  const asks = clientAsksForMeeting(message);
  if (!asks && !isBareMeetingTimeReply(t)) return null;
  const slot = parseMeetingSlot(message, nowMs);
  if (!slot.time) return null;
  let date = slot.date;
  if (!date) {
    const today = mxToday(nowMs);
    date = addDays(today, 0);
    if (slotStartMs(date, slot.time) < nowMs + 15 * 60_000) date = addDays(today, 1);
  }
  const startMs = slotStartMs(date, slot.time);
  if (startMs < nowMs) return null;
  const meetingKind = /\bvideo|zoom|meet\b|teams|llamada|llamar|marcar|marquen|llamen|cita\b/.test(t)
    ? detectMeetingKind(message)
    : null;
  return {
    meetingKind,
    startMs,
    label: `${formatSlotDate(date)} a las ${formatSlotTime(slot.time)}`,
  };
}

function clientSaysAlreadyBooked(t: string): boolean {
  return /\b(ya\s+(agende|la\s+agende|lo\s+agende|aparte|la\s+aparte|reserve|la\s+reserve|quedo|quedo\s+agendad[ao]|esta\s+agendad[ao]|lo\s+hice|la\s+hice|escogi|elegi|seleccione))\b/.test(
    t
  );
}

/**
 * Decide si este turno es de cita. `null` = seguir el flujo normal.
 * Continúa la plática solo si el último mensaje de Lucy traía el link de reservas.
 */
export function decideMeetingTurn(opts: {
  messageText: string;
  lastAssistantText?: string | null;
  clientName?: string | null;
  nowMs?: number;
}): MeetingDecision | null {
  const { messageText } = opts;
  if (!messageText?.trim()) return null;
  const nowMs = opts.nowMs ?? Date.now();
  const url = getBookingUrl();
  const t = normalize(messageText);
  const lastAssistant = opts.lastAssistantText ?? "";
  const lucyOfferedLink = lastAssistant.includes(url);
  const asks = clientAsksForMeeting(messageText);
  const slot = parseMeetingSlot(messageText, nowMs);
  const fullSlot = !!(slot.date && slot.time);
  const askedToBeCalled = clientAsksToBeCalled(t) && fullSlot;

  if (!asks && !lucyOfferedLink && !askedToBeCalled) return null;

  const meetingKind = detectMeetingKind(messageText, lucyOfferedLink ? lastAssistant : null);
  const first = opts.clientName?.trim().split(/\s+/)[0] ?? "";
  const hi = first ? `, ${first}` : "";
  const tipo = meetingKind === "cita" ? "cita" : meetingKind;

  if (lucyOfferedLink && !asks && clientSaysAlreadyBooked(t)) {
    return {
      kind: "booked",
      meetingKind,
      reply: `¡Perfecto${hi}! Con eso ya queda en la agenda del equipo y te llega la confirmación por correo. ¿Hay algo más en lo que te pueda ayudar mientras tanto?`,
    };
  }

  if (fullSlot) {
    const startMs = slotStartMs(slot.date!, slot.time!);
    const label = `${formatSlotDate(slot.date!)} a las ${formatSlotTime(slot.time!)}`;
    if (startMs < nowMs + 30 * 60_000) {
      return {
        kind: "needs_detail",
        meetingKind,
        reply: `Ese horario ya no nos alcanza${hi}. ¿Qué otro día y hora te acomodan? También puedes escoger directo aquí:\n${url}`,
      };
    }
    return {
      kind: "slot",
      meetingKind,
      startMs,
      label,
      reply: `Perfecto${hi}, anoto tu ${tipo} para el *${label}* (hora del centro de México). El equipo la confirma en la agenda y te avisa por aquí.`,
    };
  }

  if (slot.date && (asks || lucyOfferedLink)) {
    return {
      kind: "needs_detail",
      meetingKind,
      reply: `Va${hi}, el *${formatSlotDate(slot.date)}*. ¿A qué hora te acomoda? También puedes escoger el horario directo aquí:\n${url}`,
    };
  }
  if (slot.time && (asks || lucyOfferedLink)) {
    return {
      kind: "needs_detail",
      meetingKind,
      reply: `Va${hi}, a las *${formatSlotTime(slot.time)}*. ¿Qué día te acomoda? También puedes escoger el horario directo aquí:\n${url}`,
    };
  }

  if (asks) {
    return {
      kind: "offer_link",
      meetingKind,
      reply:
        `Claro${hi}. Para tu ${tipo} con el equipo, escoge aquí el día y la hora que mejor te acomoden y queda agendada en automático:\n${url}\n\n` +
        "¿O prefieres decirme por aquí qué día y a qué hora te acomoda y yo lo anoto?",
    };
  }

  return null;
}
