/**
 * Invariantes duros de escritura CRM / extracción.
 * Evita que el modelo o mensajes de Lucy contaminen nombre, presupuesto o zona
 * aunque el regex del ticket concreto no exista aún.
 */
import type { ExtractedData } from "./types.js";
import {
  isLikelyUbicacionNotNombre,
  isLikelyNotPersonNameMessage,
  isQuoteIntentMessage,
  sanitizeCrmNombre,
} from "./contact-name.js";
import {
  isUsableDireccionEvento,
  parsePresupuestoFromText,
  parseZonaFromText,
} from "./conversation-understanding.js";

export interface CrmInvariantResult {
  extracted: ExtractedData;
  /** Motivos aplicados (logs / selftest). */
  applied: string[];
}

function userTextsBlob(userTexts: string[]): string {
  return userTexts.filter(Boolean).join("\n");
}

/** ¿Algún mensaje del CLIENTE justifica un presupuesto numérico? */
export function userJustifiesPresupuesto(userTexts: string[]): boolean {
  for (const t of userTexts) {
    // Sin askedField: evita tomar "$300 por persona" de pitches de catálogo como presupuesto.
    const pres = parsePresupuestoFromText(t, { askedField: null });
    if (!pres) continue;
    // Waiver / sin monto fijo sí cuenta como “respondió presupuesto”.
    if (/sin definir|econ[oó]mic|flexible|opciones|propong/i.test(pres)) return true;
    const n = parseInt(pres.replace(/[^\d]/g, ""), 10);
    if (!isNaN(n) && n > 0) return true;
  }
  // Respuesta corta solo si el texto tiene intención explícita de presupuesto.
  for (const t of userTexts) {
    if (!/\b(presupuesto|rango|inversi[oó]n|budget|tope|menos\s+de|hasta)\b/i.test(t)) {
      continue;
    }
    if (parsePresupuestoFromText(t, { askedField: "presupuesto" })) return true;
  }
  return false;
}

/** Nombre candidato inválido para CRM (ubicación, servicio, saludo…). */
export function isInvalidCrmNombre(value: string | null | undefined): boolean {
  const raw = value?.trim() ?? "";
  if (!raw) return true;
  if (isQuoteIntentMessage(raw)) return true;
  if (isLikelyUbicacionNotNombre(raw)) return true;
  if (isLikelyNotPersonNameMessage(raw) && !/^(soy|me\s+llamo|mi\s+nombre\s+es)\s+/i.test(raw)) {
    return true;
  }
  const zona = parseZonaFromText(raw);
  if (zona && isUsableDireccionEvento(zona) && raw.split(/\s+/).length <= 6) {
    // "en Tlalnepantla" / ciudad sola → nunca nombre.
    if (/^en\s+/i.test(raw) || raw.toLowerCase() === zona.toLowerCase()) return true;
  }
  return !sanitizeCrmNombre(raw);
}

/**
 * Aplica invariantes sobre ExtractedData antes de fusionar/escribir Kommo.
 * No inventa datos: solo borra o re-enruta lo inválido.
 */
export function applyCrmWriteInvariants(
  extracted: ExtractedData,
  userTexts: string[] = []
): CrmInvariantResult {
  const out: ExtractedData = { ...extracted };
  const applied: string[] = [];
  const blob = userTextsBlob(userTexts);

  // 1) Nombre ≠ ubicación / basura.
  if (out.nombre && isInvalidCrmNombre(out.nombre)) {
    const zona = parseZonaFromText(out.nombre) ?? parseZonaFromText(blob);
    if (zona && isUsableDireccionEvento(zona) && !isUsableDireccionEvento(out.direccion_evento)) {
      out.direccion_evento = zona;
      applied.push("nombre-to-zona");
    }
    out.nombre = null;
    applied.push("nombre-invalid-cleared");
  } else if (out.nombre) {
    const cleaned = sanitizeCrmNombre(out.nombre);
    if (!cleaned) {
      out.nombre = null;
      applied.push("nombre-sanitize-null");
    } else if (cleaned !== out.nombre) {
      out.nombre = cleaned;
      applied.push("nombre-sanitized");
    }
  }

  // 2) Presupuesto solo si el CLIENTE lo justificó (nunca eco de Lucy "$300 pp").
  if (out.presupuesto !== null && out.presupuesto !== undefined) {
    if (!userJustifiesPresupuesto(userTexts)) {
      out.presupuesto = null;
      applied.push("presupuesto-no-user-source");
    } else if (typeof out.presupuesto === "number" && out.presupuesto > 0 && out.presupuesto < 1000) {
      // Montos < 1000 suelen ser precio/pp de catálogo mal leídos como total.
      const userSaidSmall =
        userTexts.some((t) => {
          const p = parsePresupuestoFromText(t, { askedField: "presupuesto" });
          if (!p) return false;
          const n = parseInt(p.replace(/[^\d]/g, ""), 10);
          return n === out.presupuesto;
        }) &&
        userTexts.some((t) =>
          /\b(presupuesto|rango|inversi[oó]n|tope|menos\s+de|hasta)\b/i.test(t)
        );
      if (!userSaidSmall) {
        out.presupuesto = null;
        applied.push("presupuesto-too-small-cleared");
      }
    }
  }

  // 3) Dirección basura (producto / cotización) ya se limpia en external-ingest;
  //    aquí: si nombre era zona y ya la movimos, ok.
  if (out.direccion_evento && !isUsableDireccionEvento(out.direccion_evento)) {
    out.direccion_evento = null;
    applied.push("zona-unusable-cleared");
  }

  return { extracted: out, applied };
}

/** Quita líneas CRM de presupuesto sin respaldo del cliente. */
export function purgeUnjustifiedPresupuestoLines(
  lines: string[],
  userTexts: string[]
): string[] {
  if (userJustifiesPresupuesto(userTexts)) return lines;
  return lines.filter((line) => !/^-?\s*Presupuesto \(MXN\):/i.test(line));
}

/** Quita líneas de nombre inválidas (ubicación, etc.). */
export function purgeInvalidNombreInvariantLines(lines: string[]): string[] {
  return lines.filter((line) => {
    if (!/^-?\s*Nombre del cliente:/i.test(line)) return true;
    const raw = line.replace(/^-?\s*Nombre del cliente:\s*/i, "").trim();
    return !isInvalidCrmNombre(raw);
  });
}
