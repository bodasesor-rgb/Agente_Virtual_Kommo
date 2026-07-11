/**
 * Limpieza de datos que vienen de fuera de Lucy (Kommo CRM, webhooks, contactos).
 * Objetivo: que bugs del CRM o datos viejos no reinicien el flujo ni contaminen capturas.
 */
import type { ExtractedData } from "../types.js";
import {
  isQuoteIntentMessage,
  sanitizeCrmNombre,
} from "../contact-name.js";
import { filterClientEmail, isOwnCompanyEmail } from "../client-email.js";
import { isStaffAdvisorName } from "../lib/bodasesorAdvisor.js";
import { resolveTipoContacto } from "../tipoContacto.js";
import { isDimensionText } from "../conversation-understanding.js";

function lineLabel(line: string): string {
  return line.replace(/^-?\s*/, "").split(":")[0]?.trim() ?? "";
}

function lineValue(line: string, label: string): string {
  const re = new RegExp(`^-?\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*`, "i");
  return line.replace(re, "").trim();
}

/** Correos corporativos de Bodasesor que Kommo a veces guarda como correo del cliente. */
export function purgeOwnCompanyEmailLines(lines: string[]): string[] {
  return lines.filter((line) => {
    if (!/^-?\s*Correo electrónico:/i.test(line)) return true;
    const raw = lineValue(line, "Correo electrónico");
    return !isOwnCompanyEmail(raw) && !!filterClientEmail(raw);
  });
}

/** "6m x 12m" u otras medidas no son ubicación del evento. */
export function purgeDimensionUbicacionLines(lines: string[]): string[] {
  return lines.filter((line) => {
    if (!/^-?\s*Lugar\/dirección del evento:/i.test(line)) return true;
    const raw = lineValue(line, "Lugar/dirección del evento");
    return !isDimensionText(raw);
  });
}

/** Nombres basura del CRM ("Quiero cotización", saludos, placeholders, nombres del equipo). */
export function purgeInvalidNombreLines(lines: string[]): string[] {
  return lines.filter((line) => {
    if (!/^-?\s*Nombre del cliente:/i.test(line)) return true;
    const raw = lineValue(line, "Nombre del cliente");
    if (isStaffAdvisorName(raw)) return false;
    return !!sanitizeCrmNombre(raw) && !isQuoteIntentMessage(raw);
  });
}

/** Tipo de evento copiado por error como requerimiento (ej. "bautizo"). */
export function purgeRequerimientosEqualsTipoLines(lines: string[]): string[] {
  const tipoLine = lines.find((l) => /^-?\s*Tipo de evento:/i.test(l));
  const tipo = tipoLine ? lineValue(tipoLine, "Tipo de evento").toLowerCase() : "";
  if (!tipo) return lines;
  return lines.filter((line) => {
    if (!/^-?\s*Requerimientos o servicios:/i.test(line)) return true;
    const req = lineValue(line, "Requerimientos o servicios").toLowerCase();
    return req !== tipo;
  });
}

/** Sanitiza líneas CRM justo después de leerlas de Kommo. */
export function sanitizeKommoCrmLines(lines: string[]): string[] {
  let out = [...lines];
  out = purgeInvalidNombreLines(out);
  out = purgeOwnCompanyEmailLines(out);
  out = purgeDimensionUbicacionLines(out);
  out = purgeRequerimientosEqualsTipoLines(out);
  return out;
}

/** Limpia extracción GPT antes de fusionar con CRM (tipo contacto, correos propios, medidas). */
export function sanitizeExtractedFromExternal(
  extracted: ExtractedData,
  conversationText?: string
): ExtractedData {
  const out: ExtractedData = { ...extracted };

  out.tipo_contacto =
    resolveTipoContacto(out.tipo_contacto, conversationText ?? "") ?? "cliente";

  const correo = filterClientEmail(out.correo);
  out.correo = correo;

  const nombre = sanitizeCrmNombre(out.nombre);
  out.nombre = nombre && !isQuoteIntentMessage(nombre) ? nombre : null;

  if (out.direccion_evento && isDimensionText(out.direccion_evento)) {
    out.direccion_evento = null;
  }

  if (
    out.requerimientos_evento?.trim() &&
    out.tipo_evento?.trim() &&
    out.requerimientos_evento.trim().toLowerCase() === out.tipo_evento.trim().toLowerCase()
  ) {
    out.requerimientos_evento = null;
  }

  return out;
}

/** Etiquetas CRM que ya pasaron sanitización (para filledSet inicial). */
export function filledLabelsFromCrmLines(lines: string[]): Set<string> {
  return new Set(lines.map((l) => lineLabel(l)).filter(Boolean));
}
