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
  isServiceRelatedMessage,
  isUsableDireccionEvento,
  isNonLocationBusinessPhrase,
} from "../conversation-understanding.js";
import { isGreetingOnlyMessage, isQuoteIntentMessage, sanitizeCrmNombre } from "../contact-name.js";

/** No meter saludos / nombres / "quiero cotizar" como si fueran el servicio. */
function isUsableResumenServicio(value: string | null | undefined): boolean {
  const t = value?.trim() ?? "";
  if (!t || t === "Info pendiente") return false;
  if (isGreetingOnlyMessage(t) || isQuoteIntentMessage(t)) return false;
  if (sanitizeCrmNombre(t) && parseServicesFromText(t).length === 0 && !isServiceRelatedMessage(t)) {
    return false;
  }
  if (parseTipoEventoFromText(t) && parseServicesFromText(t).length === 0 && !isServiceRelatedMessage(t)) {
    return false;
  }
  return true;
}

function isUsableResumenUbicacion(value: string | null | undefined): boolean {
  const t = value?.trim() ?? "";
  if (!t) return false;
  if (isNonLocationBusinessPhrase(t)) return false;
  return isUsableDireccionEvento(t);
}

function extraerEstilo(texto: string): string | null {
  const estilos: Array<[string, RegExp]> = [
    ["elegante", /\b(elegante|formal|sofisticado|lujoso|lujo)\b/i],
    ["moderno", /\b(moderno|contemporáneo|vanguardia|innovador)\b/i],
    ["rústico", /\b(rústico|campestre|campo)\b/i],
    ["vintage", /\bvintage\b/i],
    ["juvenil", /\b(juvenil|dinámico|divertido)\b/i],
    ["casual", /\b(casual|sencillo|informal)\b/i],
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
      if (num >= 1_000) return `$${Math.round(num / 1_000)}k`;
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

/**
 * Genera un resumen estructurado de hasta 240 caracteres con los
 * requerimientos del cliente, listo para el campo de Kommo.
 */
export function generateSummary(conversationText: string): string {
  const texto = conversationText.toLowerCase();

  const tipoEvento = extraerTipoEvento(texto);
  const fecha = extraerFecha(texto);
  const invitados = extraerInvitados(texto);
  const servicios = extraerServicios(texto);
  const estilo = extraerEstilo(texto);
  const presupuesto = extraerPresupuesto(texto);

  const partes: string[] = [];

  const encabezado = [tipoEvento, fecha].filter(Boolean).join(" ");
  if (encabezado) partes.push(encabezado);

  if (invitados !== null) partes.push(`${invitados} pax`);

  if (servicios.length > 0) {
    partes.push(`Quiere: ${servicios.slice(0, 3).join(", ")}`);
  }

  if (estilo) partes.push(`Estilo ${estilo}`);
  if (presupuesto) partes.push(`Presup: ${presupuesto}`);

  const resumen = partes.join(". ");

  if (!resumen.trim()) return "Info pendiente";

  return resumen.length <= 240 ? resumen : `${resumen.slice(0, 237)}...`;
}

function pickFromMergedLines(mergedLines: string[], labelPattern: RegExp): string | null {
  const line = mergedLines.find((l) => labelPattern.test(l));
  if (!line) return null;
  const val = line.replace(/^- /, "").split(":").slice(1).join(":").trim();
  return val || null;
}

function pendingFields(mergedLines: string[], extracted: ExtractedData): string[] {
  const pending: string[] = [];
  if (!pickFromMergedLines(mergedLines, /Nombre del cliente/i) && !extracted.nombre?.trim()) {
    pending.push("nombre");
  }
  if (
    !pickFromMergedLines(mergedLines, /Correo electrónico/i) &&
    !mergedLines.some((l) => /continuar por whatsapp/i.test(l)) &&
    !extracted.correo?.trim()
  ) {
    pending.push("correo");
  }
  if (!pickFromMergedLines(mergedLines, /Tipo de evento/i) && !extracted.tipo_evento?.trim()) {
    pending.push("tipo de evento");
  }
  if (
    !pickFromMergedLines(mergedLines, /Requerimientos/i) &&
    !extracted.requerimientos_evento?.trim()
  ) {
    pending.push("servicios / requerimientos");
  }
  if (
    !isUsableResumenUbicacion(pickFromMergedLines(mergedLines, /Lugar\/dirección/i)) &&
    !isUsableResumenUbicacion(extracted.direccion_evento)
  ) {
    pending.push("ubicación");
  }
  if (!pickFromMergedLines(mergedLines, /Fecha y horario/i) && !extracted.fecha_horario?.trim()) {
    pending.push("fecha");
  }
  if (!pickFromMergedLines(mergedLines, /Número de invitados/i) && !extracted.num_invitados) {
    pending.push("invitados");
  }
  if (!pickFromMergedLines(mergedLines, /Presupuesto/i) && extracted.presupuesto == null) {
    pending.push("presupuesto");
  }
  return pending;
}

/**
 * Resumen estilo Conversation Summary para Kommo (campo 1048786).
 * Puntos clave + qué quiere el cliente (con detalle) + próximos pasos.
 */
export function buildResumenClienteLargo(
  extracted: ExtractedData,
  mergedLines: string[],
  conversationText?: string
): string {
  const nombre = pickFromMergedLines(mergedLines, /Nombre del cliente/i) || extracted.nombre?.trim() || null;
  const correo = pickFromMergedLines(mergedLines, /Correo electrónico/i) || extracted.correo?.trim() || null;
  const emailWaived = mergedLines.some((l) => /continuar por whatsapp/i.test(l));
  const evento = pickFromMergedLines(mergedLines, /Tipo de evento/i) || extracted.tipo_evento?.trim() || null;
  const fecha = pickFromMergedLines(mergedLines, /Fecha y horario/i) || extracted.fecha_horario?.trim() || null;
  const invitados =
    pickFromMergedLines(mergedLines, /Número de invitados/i) ||
    (extracted.num_invitados !== null && extracted.num_invitados > 0 ? String(extracted.num_invitados) : null);
  const ubicacionRaw =
    pickFromMergedLines(mergedLines, /Lugar\/dirección/i) || extracted.direccion_evento?.trim() || null;
  const ubicacion = isUsableResumenUbicacion(ubicacionRaw) ? ubicacionRaw : null;
  const pptoFromLine = pickFromMergedLines(mergedLines, /Presupuesto/i);

  const reqFromLinesRaw = pickFromMergedLines(mergedLines, /Requerimientos/i);
  const reqFromLines = isUsableResumenServicio(reqFromLinesRaw) ? reqFromLinesRaw : null;
  const reqFromServicesRaw = extracted.requerimientos_evento?.trim();
  const reqFromServices = isUsableResumenServicio(reqFromServicesRaw) ? reqFromServicesRaw : null;
  // NUNCA formatRequerimientoLabelFromQuery(conversationText completo):
  // un "comida" suelto en el hilo mapeaba a Comida Corrida (A14943).
  const convServices =
    conversationText && conversationText.trim().length > 20
      ? parseServicesFromText(conversationText).slice(0, 6)
      : [];
  const reqFromConversation =
    convServices.length > 0 ? convServices.join(", ") : null;
  // Preferir lista de servicios más completa (A14929: banquete+mobiliario+DJ vs "banquetes o catering").
  // Si el conteo es igual, conservar el detalle ya guardado en CRM (Coffee Break para Eventos…).
  const lineSvcCount = reqFromLines ? parseServicesFromText(reqFromLines).length : 0;
  const convSvcCount = convServices.length;
  const extractedSvcCount = reqFromServices ? parseServicesFromText(reqFromServices).length : 0;
  let reqs: string | null = null;
  if (convSvcCount > lineSvcCount && convSvcCount > extractedSvcCount) {
    reqs = reqFromConversation;
  } else if (extractedSvcCount > lineSvcCount && reqFromServices) {
    reqs = reqFromServices !== extracted.tipo_evento ? reqFromServices : null;
  } else {
    reqs =
      reqFromLines ||
      (reqFromServices && reqFromServices !== extracted.tipo_evento ? reqFromServices : null) ||
      reqFromConversation;
  }

  // Presupuesto: tomar el mayor entre línea CRM, extracted y montos en la conversación.
  let ppto: string | null = pptoFromLine;
  const convAmounts = conversationText
    ? [...conversationText.matchAll(/\$?\s*([\d][\d,]{2,})\b/g)]
        .map((m) => parseInt(m[1]!.replace(/,/g, ""), 10))
        .filter((n) => !isNaN(n) && n >= 1000 && n <= 50_000_000)
    : [];
  const maxConv = convAmounts.length ? Math.max(...convAmounts) : 0;
  const lineNum = pptoFromLine ? parseInt(pptoFromLine.replace(/[^\d]/g, ""), 10) : 0;
  const extNum =
    extracted.presupuesto !== null && extracted.presupuesto > 0 ? extracted.presupuesto : 0;
  const bestPpto = Math.max(lineNum || 0, extNum || 0, maxConv || 0);
  if (bestPpto >= 1000) {
    ppto = String(bestPpto);
  } else if (!ppto && extNum > 0) {
    ppto = `$${extNum.toLocaleString("es-MX")} MXN`;
  }

  const modo = extracted.modo_servicio?.trim();
  const pendientes = pendingFields(mergedLines, extracted);

  const lineas: string[] = ["RESUMEN DE CONVERSACIÓN — Lucy", ""];

  lineas.push("Qué busca el cliente:");
  if (reqs) lineas.push(`• Servicios: ${reqs}`);
  else lineas.push("• Servicios: (aún por definir con más detalle)");
  if (modo) lineas.push(`• Modalidad: ${modo}`);
  if (evento) lineas.push(`• Evento: ${evento}`);
  if (invitados) lineas.push(`• Escala: ${invitados} personas / piezas`);
  lineas.push("");

  lineas.push("Datos capturados:");
  if (nombre) lineas.push(`• Nombre: ${nombre}`);
  if (correo) lineas.push(`• Correo: ${correo}`);
  else if (emailWaived) lineas.push("• Correo: no compartió (sigue por WhatsApp)");
  if (ubicacion) lineas.push(`• Ubicación: ${ubicacion}`);
  if (fecha) lineas.push(`• Fecha/horario: ${fecha}`);
  if (ppto) lineas.push(`• Presupuesto: ${ppto}`);
  lineas.push("");

  if (pendientes.length) {
    lineas.push("Pendiente / próximo paso:");
    lineas.push(`• Completar: ${pendientes.join(", ")}`);
    lineas.push("• Equipo: armar cotización con lo ya platicado.");
  } else {
    lineas.push("Estado: datos completos — listo para cotización del equipo.");
  }

  lineas.push("", "— Actualizado por Lucy en cada mensaje —");
  return lineas.join("\n").slice(0, 8000);
}
