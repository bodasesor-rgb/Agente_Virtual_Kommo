/**
 * Fecha/hora del evento con referencia a "hoy" en CDMX.
 * - resolveFechaEvento: "este sábado", "el 15", "03 de octubre" → fecha absoluta en texto.
 * - inferHorarioAmPm: "7:30 a 12:30" + contexto → "7:30 pm a 12:30 am" o ambiguo.
 * Los campos de Kommo son texto: se guarda legible ("sábado 3 de octubre de 2026").
 */

const TZ = "America/Mexico_City";
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

export function mexicoNowParts(now: Date = new Date()): Ymd & { hh: number; mm: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour") % 24, mm: get("minute") };
}

function weekdayOf({ y, m, d }: Ymd): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays({ y, m, d }: Ymd, n: number): Ymd {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function cmp(a: Ymd, b: Ymd): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

function formatYmd(date: Ymd): string {
  return `${DIAS[weekdayOf(date)]} ${date.d} de ${MESES[date.m - 1]} de ${date.y}`;
}

/** "domingo 27 de septiembre de 2026, 16:10" (hora CDMX) — para el contexto del turno. */
export function formatMexicoNowForPrompt(now: Date = new Date()): string {
  const p = mexicoNowParts(now);
  return `${formatYmd(p)}, ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

const MES_RE = MESES.map((m) => stripAccents(m)).join("|");
const DIA_RE = "domingo|lunes|martes|miercoles|jueves|viernes|sabado";

/**
 * Convierte la fecha capturada a fecha absoluta legible.
 * Devuelve null si no hay nada que resolver con seguridad (se deja el texto tal cual).
 */
export function resolveFechaEvento(
  text: string | null | undefined,
  now: Date = new Date()
): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const t = stripAccents(raw.toLowerCase()).replace(/[.,;:!?¡¿]+/g, " ").replace(/\s+/g, " ").trim();
  const today = mexicoNowParts(now);
  const aprox = /\b(aprox|aproximadamente|mas o menos|tentativ)/.test(t);

  if (/^(?:para\s+|es\s+|seria\s+)?hoy(?:\s+mismo)?$/.test(t)) return formatYmd(today);
  if (/^(?:para\s+|es\s+|seria\s+)?pasado\s+manana$/.test(t)) return formatYmd(addDays(today, 2));
  if (/^(?:para\s+|es\s+|seria\s+)?manana$/.test(t)) return formatYmd(addDays(today, 1));

  const yearM = t.match(/\b(20\d{2})\b/);
  const explicitYear = yearM ? Number(yearM[1]) : null;
  const monthM = t.match(new RegExp(`\\b(${MES_RE})\\b`));
  const month = monthM ? MESES.findIndex((m) => stripAccents(m) === monthM[1]) + 1 : 0;
  const dayM = t.match(/\b(\d{1,2})\b(?!\s*(?::|am|pm|hrs?|horas?|personas?|invitad))/);
  const weekdayM = t.match(new RegExp(`\\b(${DIA_RE})\\b`));
  const weekday = weekdayM ? DIAS.findIndex((d) => stripAccents(d) === weekdayM[1]) : -1;

  // Día + mes (con o sin año / día de la semana).
  if (month && dayM) {
    const d = Number(dayM[1]);
    let y = explicitYear ?? today.y;
    if (d < 1 || d > 31) return null;
    if (!explicitYear && cmp({ y, m: month, d }, today) < 0) y += 1;
    if (d > daysInMonth(y, month)) return null;
    const date = { y, m: month, d };
    // "sábado 4 de octubre" cuando el 4 es domingo → no afirmar nada.
    if (weekday >= 0 && weekdayOf(date) !== weekday) return null;
    const out = formatYmd(date);
    return aprox ? `${out} (aprox.)` : out;
  }

  // Solo mes ("marzo", "por marzo aprox", "noviembre 2027").
  if (month && !dayM) {
    let y = explicitYear ?? today.y;
    if (!explicitYear && month < today.m) y += 1;
    const out = `${MESES[month - 1]} de ${y}`;
    return aprox ? `${out} (aprox.)` : out;
  }

  // Día de la semana sin número ("este sábado", "el próximo viernes").
  if (weekday >= 0 && !dayM) {
    let ahead = (weekday - weekdayOf(today) + 7) % 7;
    if (ahead === 0 && !/\b(este|esta|hoy)\b/.test(t)) ahead = 7;
    if (/\b(siguiente|que\s+viene)\b/.test(t) && ahead < 7 && /\bsemana\b/.test(t)) ahead += 7;
    return formatYmd(addDays(today, ahead));
  }

  // Solo día ("el 15", "el día 15").
  const onlyDay = t.match(/^(?:el\s+)?(?:dia\s+)?(\d{1,2})$/);
  if (onlyDay) {
    const d = Number(onlyDay[1]);
    if (d < 1 || d > 31) return null;
    let y = today.y;
    let m = today.m;
    if (d < today.d) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    if (d > daysInMonth(y, m)) return null;
    return formatYmd({ y, m, d });
  }

  return null;
}

const PERIOD_WORDS =
  /\b(am|pm|hrs?|horas?|tarde|noche|ma[nñ]ana|mediod[ií]a|medio\s*d[ií]a|madrugada)\b|\b[ap]\.\s*m\.?/i;

export interface HorarioAmPmResult {
  value: string;
  /** true → no se puede saber si es mañana o noche; conviene confirmar. */
  ambiguous: boolean;
}

function contextPeriod(context: string): "am" | "pm" | null {
  const c = context.toLowerCase();
  const pm =
    /\b\d{1,2}(?::\d{2})?\s*(?:pm|p\.\s*m)/.test(c) ||
    /\bde\s+la\s+(tarde|noche)\b|\b(cena|noche|nocturn)/.test(c);
  const am =
    /\b\d{1,2}(?::\d{2})?\s*(?:am|a\.\s*m)/.test(c) ||
    /\bde\s+la\s+ma[nñ]ana\b|\b(desayuno|brunch|almuerzo|matutin)/.test(c);
  if (pm && !am) return "pm";
  if (am && !pm) return "am";
  return null;
}

/**
 * "7:30 a 12:30" sin am/pm: infiere con reglas seguras o con el contexto
 * (p. ej. el cliente ya dijo "7:40pm"). Si no se puede, marca ambiguo.
 */
export function inferHorarioAmPm(
  horario: string | null | undefined,
  context: string = ""
): HorarioAmPmResult {
  const value = (horario ?? "").trim();
  if (!value || PERIOD_WORDS.test(value)) return { value, ambiguous: false };
  const m = value.match(
    /^(?:de\s+(?:las?\s+)?)?(\d{1,2})(?::(\d{2}))?(?:\s*(?:a|-|–|hasta)\s*(?:las?\s+)?(\d{1,2})(?::(\d{2}))?)?$/i
  );
  if (!m) return { value, ambiguous: false };
  const h1 = Number(m[1]);
  const m1 = m[2];
  const h2 = m[3] !== undefined ? Number(m[3]) : null;
  const m2 = m[4];
  if (h1 > 12 || (h2 !== null && h2 > 12) || h1 === 0) return { value, ambiguous: false };

  let p1: "am" | "pm" | null = null;
  if (h1 >= 1 && h1 <= 6) p1 = "pm";
  else if (h1 === 12) p1 = "pm";
  else p1 = contextPeriod(context);
  if (!p1) return { value, ambiguous: true };

  const fmt = (h: number, mm: string | undefined, p: string) => `${h}${mm ? `:${mm}` : ""} ${p}`;
  if (h2 === null) return { value: fmt(h1, m1, p1), ambiguous: false };

  const start24 = (h1 % 12) + (p1 === "pm" ? 12 : 0) + (m1 ? Number(m1) / 60 : 0);
  const endPm = (h2 % 12) + 12 + (m2 ? Number(m2) / 60 : 0);
  const p2 = endPm > start24 && endPm - start24 <= 14 ? "pm" : "am";
  return { value: `${fmt(h1, m1, p1)} a ${fmt(h2, m2, p2)}`, ambiguous: false };
}

/**
 * Horario nuevo + horario previo + contexto → valor a guardar.
 * "de la noche" tras "7:30 a 12:30" → "7:30 pm a 12:30 am" (no pisa las horas).
 */
export function resolveHorarioWithContext(
  incoming: string | null | undefined,
  previous: string | null | undefined,
  context: string = ""
): string | null {
  const inc = (incoming ?? "").trim();
  if (!inc) return null;
  const prev = (previous ?? "").trim();
  if (/\d/.test(inc)) return inferHorarioAmPm(inc, `${context} ${prev}`).value;
  if (prev && /\d/.test(prev) && PERIOD_WORDS.test(inc)) {
    const r = inferHorarioAmPm(prev, inc);
    if (!r.ambiguous && r.value !== prev) return r.value;
  }
  return inc;
}

/** ¿El horario del mensaje queda ambiguo (am/pm) aun con el contexto? */
export function horarioNeedsAmPmConfirmation(
  horario: string | null | undefined,
  context: string = ""
): boolean {
  return inferHorarioAmPm(horario, context).ambiguous;
}
