/**
 * summaryService.ts — Genera resumen automático de hasta 240 caracteres
 * con los requerimientos del cliente para guardarlo en el campo
 * "Requerimientos para el evento" de Kommo (field_id 1048776).
 *
 * Se usa SIEMPRE como valor del campo requerimientos_evento porque es
 * más fiable y estructurado que lo que extrae el LLM libremente.
 */

import type { ExtractedData } from "../types.js";
import {
  enrichExtractedFromConversation,
  parseServicesFromText,
  parseTipoEventoFromText,
  parseInvitadosFromText,
  parseFechaFromText,
} from "../conversation-understanding.js";

function extraerEstilo(texto: string): string | null {
  const estilos: Array<[string, RegExp]> = [
    ["elegante",  /\b(elegante|formal|sofisticado|lujoso|lujo)\b/i],
    ["moderno",   /\b(moderno|contemporáneo|vanguardia|innovador)\b/i],
    ["rústico",   /\b(rústico|campestre|campo)\b/i],
    ["vintage",   /\bvintage\b/i],
    ["juvenil",   /\b(juvenil|dinámico|divertido)\b/i],
    ["casual",    /\b(casual|sencillo|informal)\b/i],
  ];
  for (const [nombre, patron] of estilos) {
    if (patron.test(texto)) return nombre;
  }
  return null;
}

function extraerPresupuesto(texto: string): string | null {
  const patrones = [
    /presupuesto\s*(?:de|es)?\s*\$?\s*([\d,]+)\s*k?/i,
    /tengo\s+\$?\s*([\d,]+)\s*k?/i,
    /\$\s*([\d,]+)\s*k\b/i,
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    if (m) {
      const num = parseInt(m[1]!.replace(/,/g, ""), 10);
      if (isNaN(num) || num <= 0) continue;
      if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
      if (num >= 1_000)     return `$${Math.round(num / 1_000)}k`;
      return `$${num}`;
    }
  }
  return null;
}

/**
 * Enriquece datos extraídos desde el texto completo de la conversación
 * (sin contaminar el flujo con "Info pendiente").
 */
export function enrichExtractedFromText(extracted: ExtractedData, conversationText: string): void {
  enrichExtractedFromConversation(extracted, conversationText);
}

function extraerTipoEvento(texto: string): string | null {
  return parseTipoEventoFromText(texto);
}

function extraerFecha(texto: string): string | null {
  return parseFechaFromText(texto);
}

function extraerInvitados(texto: string): number | null {
  const inv = parseInvitadosFromText(texto);
  return inv ? parseInt(inv, 10) : null;
}

function extraerServicios(texto: string): string[] {
  return parseServicesFromText(texto);
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Genera un resumen estructurado de hasta 240 caracteres con los
 * requerimientos del cliente, listo para el campo de Kommo.
 *
 * @param conversationText Texto completo de la conversación (history + mensaje actual)
 * @returns Resumen de hasta 240 chars, nunca vacío
 */
export function generateSummary(conversationText: string): string {
  const texto = conversationText.toLowerCase();

  const tipoEvento  = extraerTipoEvento(texto);
  const fecha       = extraerFecha(texto);
  const invitados   = extraerInvitados(texto);
  const servicios   = extraerServicios(texto);
  const estilo      = extraerEstilo(texto);
  const presupuesto = extraerPresupuesto(texto);

  const partes: string[] = [];

  // Encabezado: tipo + fecha
  const encabezado = [tipoEvento, fecha].filter(Boolean).join(" ");
  if (encabezado) partes.push(encabezado);

  // Invitados
  if (invitados !== null) partes.push(`${invitados} pax`);

  // Servicios (máx 3 para no exceder 240)
  if (servicios.length > 0) {
    partes.push(`Quiere: ${servicios.slice(0, 3).join(", ")}`);
  }

  // Estilo
  if (estilo) partes.push(`Estilo ${estilo}`);

  // Presupuesto
  if (presupuesto) partes.push(`Presup: ${presupuesto}`);

  const resumen = partes.join(". ");

  if (!resumen.trim()) return "Info pendiente";

  // Hard-cap en 240 caracteres (límite del campo en Kommo)
  return resumen.length <= 240 ? resumen : `${resumen.slice(0, 237)}...`;
}
