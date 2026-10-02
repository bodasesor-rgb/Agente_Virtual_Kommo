/**
 * Saludo según la hora de CDMX ("Buen día" / "Buenas tardes" / "Buenas noches").
 * Si el cliente ya saludó con uno, se le responde igual (puede estar en otra zona horaria).
 */

export type TimeOfDayGreeting = "Buen día" | "Buenas tardes" | "Buenas noches";

function mexicoCityHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(h);
}

export function timeOfDayGreeting(now = new Date(), clientMessage?: string | null): TimeOfDayGreeting {
  const m = clientMessage ?? "";
  if (/\bbuenas\s+noches\b/i.test(m)) return "Buenas noches";
  if (/\bbuenas\s+tardes\b/i.test(m)) return "Buenas tardes";
  if (/\bbuen(?:os)?\s+d[ií]as?\b/i.test(m)) return "Buen día";
  const h = mexicoCityHour(now);
  if (h >= 5 && h < 12) return "Buen día";
  if (h >= 12 && h < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** Cambia el "¡Hola! Buen día." de la presentación por el saludo de la hora. */
export function applyTimeOfDayGreeting(
  text: string,
  opts: { now?: Date; clientMessage?: string | null } = {}
): string {
  if (!/¡Hola!\s*Buen\s+d[ií]a\b/.test(text)) return text;
  const g = timeOfDayGreeting(opts.now, opts.clientMessage);
  return g === "Buen día" ? text : text.replace(/¡Hola!\s*Buen\s+d[ií]a\b/, `¡Hola! ${g}`);
}
