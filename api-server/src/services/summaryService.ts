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
import { formatRequerimientoLabelFromQuery } from "./catalogService.js";

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

/** Lee un valor de las líneas CRM tipo "- Etiqueta: valor". */
function pickFromMergedLines(mergedLines: string[], labelPattern: RegExp): string | null {
  const line = mergedLines.find((l) => labelPattern.test(l));
  if (!line) return null;
  const val = line.replace(/^- /, "").split(":").slice(1).join(":").trim();
  return val || null;
}

/**
 * Resumen ejecutivo para el campo texto largo de Kommo (1048786).
 * Se actualiza en cada mensaje con todo lo capturado hasta el momento.
 */
export function buildResumenClienteLargo(
  extracted: ExtractedData,
  mergedLines: string[],
  conversationText?: string
): string {
  // IMPORTANTE: se prioriza el valor YA GUARDADO en el CRM (mergedLines) sobre
  // la extracción del turno actual. La extracción de GPT es inestable mensaje
  // a mensaje (p.ej. "Coffee Break para Eventos Corporativos" un turno y solo
  // "Coffee Break" al siguiente) — usar siempre el valor estable evita que el
  // resumen pierda información ya confirmada.
  const nombre = pickFromMergedLines(mergedLines, /Nombre del cliente/i) || extracted.nombre?.trim() || null;
  const correo = pickFromMergedLines(mergedLines, /Correo electrónico/i) || extracted.correo?.trim() || null;
  const emailWaived = mergedLines.some((l) => /continuar por whatsapp/i.test(l));
  const evento = pickFromMergedLines(mergedLines, /Tipo de evento/i) || extracted.tipo_evento?.trim() || null;
  const fecha = pickFromMergedLines(mergedLines, /Fecha y horario/i) || extracted.fecha_horario?.trim() || null;
  const invitados =
    pickFromMergedLines(mergedLines, /Número de invitados/i) ||
    (extracted.num_invitados !== null && extracted.num_invitados > 0 ? String(extracted.num_invitados) : null);
  const ubicacion =
    pickFromMergedLines(mergedLines, /Lugar\/dirección/i) || extracted.direccion_evento?.trim() || null;
  const pptoFromLine = pickFromMergedLines(mergedLines, /Presupuesto/i);
  const ppto =
    pptoFromLine ||
    (extracted.presupuesto !== null && extracted.presupuesto > 0
      ? `$${extracted.presupuesto.toLocaleString("es-MX")} MXN`
      : null);

  const reqFromLines = pickFromMergedLines(mergedLines, /Requerimientos/i);
  const reqFromServices = extracted.requerimientos_evento?.trim();
  const reqFromCatalog =
    conversationText && conversationText.trim().length > 3
      ? formatRequerimientoLabelFromQuery(conversationText)
      : null;
  const reqFromConversation =
    conversationText && conversationText.trim().length > 20
      ? parseServicesFromText(conversationText).slice(0, 3).join(", ")
      : null;
  const reqs =
    (reqFromLines && reqFromLines !== "Info pendiente" ? reqFromLines : null) ||
    reqFromCatalog ||
    (reqFromServices && reqFromServices !== extracted.tipo_evento ? reqFromServices : null) ||
    (reqFromConversation && reqFromConversation.length > 0 ? reqFromConversation : null);

  const lineas: string[] = ["RESUMEN LUCY — lo que el cliente quiere:", ""];

  if (nombre) lineas.push(`• Nombre: ${nombre}`);
  if (correo) lineas.push(`• Correo: ${correo}`);
  else if (emailWaived) lineas.push("• Correo: no proporcionó (continúa por WhatsApp)");
  if (evento) lineas.push(`• Tipo de evento: ${evento}`);
  if (reqs) lineas.push(`• El cliente quiere: ${reqs}`);
  if (invitados) lineas.push(`• Invitados: ${invitados}`);
  if (ubicacion) lineas.push(`• Ubicación: ${ubicacion}`);
  if (fecha) lineas.push(`• Fecha: ${fecha}`);
  if (ppto) lineas.push(`• Presupuesto: ${ppto}`);

  if (lineas.length <= 2) {
    return "RESUMEN LUCY\n\n(Captura en progreso — aún faltan datos del cliente)";
  }

  lineas.push("", "— Actualizado automáticamente por Lucy en cada mensaje —");
  return lineas.join("\n").slice(0, 8000);
}
