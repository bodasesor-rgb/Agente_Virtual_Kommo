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

export interface LeadBriefOptions {
  /** Líneas CRM ya fusionadas (Nombre, Fecha, etc.) */
  mergedLines?: string[];
  /** Último mensaje que Lucy envió al cliente */
  lastLucyMessage?: string | null;
  /** true cuando ya se envió el mensaje de cierre */
  leadCalificado?: boolean;
}

function lineValue(mergedLines: string[], labelPattern: RegExp): string | null {
  const line = mergedLines.find((l) => labelPattern.test(l));
  if (!line) return null;
  const value = line.replace(/^- /, "").split(":").slice(1).join(":").trim();
  return value || null;
}

function pickField(
  extracted: ExtractedData,
  mergedLines: string[],
  labelPattern: RegExp,
  value: string | null | undefined | number
): string | null {
  if (typeof value === "number" && value > 0) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return lineValue(mergedLines, labelPattern);
}

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

/**
 * Resumen completo para el campo de texto largo (1048786) en Kommo.
 * Solo lectura interna para Alejandro — NO se usa para enviar al cliente.
 */
export function buildLeadBriefForKommo(
  extracted: ExtractedData,
  conversationText?: string,
  opts: LeadBriefOptions = {}
): string {
  const merged = opts.mergedLines ?? [];
  const nombre = pickField(extracted, merged, /Nombre del cliente/i, extracted.nombre);
  const correo = pickField(extracted, merged, /Correo electrónico/i, extracted.correo);
  const evento = pickField(extracted, merged, /Tipo de evento/i, extracted.tipo_evento);
  const fecha = pickField(extracted, merged, /Fecha y horario/i, extracted.fecha_horario);
  const invitados = pickField(
    extracted,
    merged,
    /Número de invitados/i,
    extracted.num_invitados
  );
  const ubicacion = pickField(extracted, merged, /Lugar\/dirección/i, extracted.direccion_evento);
  const presupuesto = pickField(extracted, merged, /Presupuesto/i, extracted.presupuesto);
  let requerimientos =
    pickField(extracted, merged, /Requerimientos/i, extracted.requerimientos_evento) ??
    (conversationText ? generateSummary(conversationText) : null);
  if (requerimientos === "Info pendiente") requerimientos = null;

  const servicios = conversationText ? extraerServicios(conversationText.toLowerCase()) : [];
  if (!requerimientos && servicios.length > 0) {
    requerimientos = servicios.slice(0, 5).join(", ");
  }

  const pendientes: string[] = [];
  if (!nombre) pendientes.push("nombre");
  if (!correo) pendientes.push("correo");
  if (!requerimientos) pendientes.push("servicios/requerimientos");
  if (!invitados) pendientes.push("número de invitados");
  if (!ubicacion) pendientes.push("ubicación/zona");
  if (!fecha) pendientes.push("fecha");
  if (!presupuesto) pendientes.push("presupuesto (opcional)");

  const now = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "short",
    timeStyle: "short",
  });

  const lines: string[] = [
    "📋 RESUMEN LUCY — Lead",
    `Actualizado: ${now}`,
    "",
    "── DATOS DEL CLIENTE ──",
    nombre ? `• Nombre: ${nombre}` : "• Nombre: (pendiente)",
    correo ? `• Correo: ${correo}` : "• Correo: (pendiente / sigue por WhatsApp)",
    evento ? `• Tipo de evento: ${evento}` : null,
    fecha ? `• Fecha: ${fecha}` : "• Fecha: (pendiente)",
    invitados ? `• Invitados: ${invitados}` : "• Invitados: (pendiente)",
    ubicacion ? `• Ubicación/zona: ${ubicacion}` : "• Ubicación/zona: (pendiente)",
    presupuesto ? `• Presupuesto: $${presupuesto}` : "• Presupuesto: (sin definir)",
    requerimientos ? `• Servicios/requerimientos: ${requerimientos}` : "• Servicios: (pendiente)",
    "",
  ].filter((l): l is string => l !== null);

  if (opts.leadCalificado) {
    lines.push("✅ Lead calificado — listo para cotizar con Alejandro");
  } else if (pendientes.length > 0) {
    lines.push(`⏳ Falta capturar: ${pendientes.join(", ")}`);
  }

  if (opts.lastLucyMessage?.trim()) {
    const preview = opts.lastLucyMessage.trim().replace(/\s+/g, " ");
    lines.push("", "── ÚLTIMA RESPUESTA DE LUCY AL CLIENTE ──");
    lines.push(preview.length <= 500 ? preview : `${preview.slice(0, 497)}...`);
  }

  const brief = lines.join("\n").trim();
  return brief.length <= 3500 ? brief : `${brief.slice(0, 3497)}...`;
}

const BRIEF_LAST_MSG_MARKER = "── ÚLTIMA RESPUESTA DE LUCY AL CLIENTE ──";

/** Extrae el último mensaje al cliente embebido en el resumen 1048786 (bootstrap tras reinicio). */
export function extractLastMessageFromBrief(brief: string): string | null {
  const idx = brief.indexOf(BRIEF_LAST_MSG_MARKER);
  if (idx < 0) return null;
  const after = brief.slice(idx + BRIEF_LAST_MSG_MARKER.length).trim();
  return after || null;
}
