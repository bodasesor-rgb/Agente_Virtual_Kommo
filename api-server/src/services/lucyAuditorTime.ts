/** Día civil America/Mexico_City — sin dependencias DB. */

export function mexicoCityDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Inicio del día actual en Mexico City (cota CST UTC-6). */
export function startOfMexicoCityDay(d = new Date()): Date {
  const day = mexicoCityDayKey(d);
  return new Date(`${day}T00:00:00-06:00`);
}
