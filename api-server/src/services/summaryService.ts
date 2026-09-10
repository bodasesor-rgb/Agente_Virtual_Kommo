/**
 * summaryService.ts — Resumen del lead para Kommo (campo largo).
 * Debe dar claves operativas para cotizar, no copiar basura ni concatenar montos.
 */

import type { ExtractedData } from "../types.js";
import {
  enrichExtractedFromConversation,
  parseServicesFromText,
  parseTipoEventoFromText,
  parseInvitadosFromText,
  parseFechaFromText,
  parsePresupuestoFromText,
  isServiceRelatedMessage,
  isUsableDireccionEvento,
  isNonLocationBusinessPhrase,
  sanitizeDireccionCapture,
  parseZonaFromText,
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

/** A15841: "2026" del "8 de octubre del 2026" no es presupuesto. */
function isCalendarYearOnlyAmount(value: string | null | undefined): boolean {
  const t = value?.trim() ?? "";
  if (!/^(19|20)\d{2}$/.test(t)) return false;
  const n = parseInt(t, 10);
  return n >= 1990 && n <= 2100;
}

function isUsableResumenUbicacion(value: string | null | undefined): boolean {
  const t = value?.trim() ?? "";
  if (!t) return false;
  if (isNonLocationBusinessPhrase(t)) return false;
  if (/\b(buscando|proveedor|se\s+llama|nos\s+encontramos\s+en|coordino\s+eventos)\b/i.test(t)) {
    const cleaned = sanitizeDireccionCapture(t);
    if (!cleaned) return false;
    return isUsableDireccionEvento(cleaned);
  }
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
  return parsePresupuestoFromText(texto, { askedField: "presupuesto" });
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
  const presupuesto = extraerPresupuesto(conversationText);

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
  if (
    !pickFromMergedLines(mergedLines, /Fecha del evento/i) &&
    !extracted.fecha_evento?.trim()
  ) {
    pending.push("fecha");
  }
  if (
    !pickFromMergedLines(mergedLines, /Horario del evento/i) &&
    !extracted.horario_evento?.trim()
  ) {
    pending.push("horario");
  }
  if (!pickFromMergedLines(mergedLines, /Número de invitados/i) && !extracted.num_invitados) {
    pending.push("invitados");
  }
  if (!pickFromMergedLines(mergedLines, /Presupuesto/i) && extracted.presupuesto == null) {
    pending.push("presupuesto");
  }
  return pending;
}

/** Piezas a rentar (sillas/mesas/carpas) — distinto de aforo del evento. */
export function extractRentalPieceCount(text: string | null | undefined): {
  count: number;
  unit: string;
} | null {
  const t = text ?? "";
  const m = t.match(
    /\b(?:alrededor\s+de|aprox(?:imadamente)?|ocupamos|necesitamos?|buscamos?|renta(?:r|mos)?|son|de)?\s*(\d{1,3})\s*(sillas?|mesas?|periqueras?|carpas?|lounges?|piezas?)\b/i
  );
  if (!m) return null;
  const count = parseInt(m[1]!, 10);
  if (!Number.isFinite(count) || count < 1 || count > 500) return null;
  return { count, unit: m[2]!.toLowerCase() };
}

/** Modelo/color de mobiliario u otros detalles de producto. */
export function extractProductSpecHints(text: string | null | undefined): string[] {
  const t = text ?? "";
  const out: string[] = [];
  const chair = t.match(
    /\b(?:silla|tipo\s+de\s+silla)\s+(?:que\s+es\s+|es\s+)?(basket(?:\s+tony)?|tiffany|vers[aá]til|chiavari|cross\s*back|napole[oó]n)(?:\s+de\s+color\s+(\w+(?:\s+\w+)?))?/i
  );
  if (chair) {
    let spec = `Silla ${chair[1]}`.replace(/\s+/g, " ");
    if (chair[2]) spec += ` color ${chair[2]}`;
    else {
      const color = t.match(
        /\b(?:color\s+)?(gris(?:\s+oscuro)?|blanc[oa]|negr[oa]|dorad[oa]|natural|madera)\b/i
      );
      if (color && /silla|basket|tiffany/i.test(t)) spec += ` ${color[1]}`;
    }
    out.push(spec);
  } else if (/\bbasket(?:\s+tony)?\b/i.test(t) && /\bsilla/i.test(t)) {
    const color = t.match(/\b(gris(?:\s+oscuro)?|blanc[oa]|negr[oa])\b/i);
    out.push(`Silla basket${color ? ` ${color[1]}` : ""}`.trim());
  }
  const carpa = t.match(/\bcarpa\s+(tela|transparente|stretch|tipos?\s*\d)[^\n.]{0,40}/i);
  if (carpa) out.push(carpa[0]!.replace(/\s+/g, " ").trim().slice(0, 60));
  const nivel = t.match(
    /\b((?:banquete|coffee\s*break|taquiza|brunch|desayuno)\s+\d(?:\s+tiempos?)?)\b/i
  );
  if (nivel) out.push(nivel[1]!.replace(/\s+/g, " "));
  if (/\bsolo\s+alimentos?\b/i.test(t)) out.push("Modalidad: solo alimentos");
  if (
    /\b(entregar?|entrega|montar?)\s+(?:un\s+)?d[ií]a\s+antes\b|\bd[ií]a\s+antes\s+del\s+evento\b/i.test(
      t
    )
  ) {
    out.push("Pide entrega/montaje un día antes");
  }
  if (
    /\bcomplemento\s+de\s+sillas?\b|\bya\s+contamos\s+con\s+(?:el\s+)?sal[oó]n\b/i.test(t)
  ) {
    out.push("Complemento: el salón ya tiene sillas; rentan faltantes");
  }
  return [...new Set(out)].slice(0, 6);
}

/**
 * Presupuesto legible para el resumen: prioriza texto del cliente, nunca 130150.
 */
export function resolveResumenPresupuesto(
  extracted: ExtractedData,
  mergedLines: string[],
  conversationText?: string
): string | null {
  const pptoFromLine = pickFromMergedLines(mergedLines, /Presupuesto/i);
  if (pptoFromLine && !isCalendarYearOnlyAmount(pptoFromLine)) {
    const digitsOnly = pptoFromLine.replace(/[^\d]/g, "");
    const looksConcat =
      digitsOnly === "130150" ||
      (/^\d{5,6}$/.test(digitsOnly) &&
        digitsOnly.length % 2 === 0 &&
        digitsOnly.slice(0, digitsOnly.length / 2) === digitsOnly.slice(digitsOnly.length / 2));
    if (!looksConcat) {
      if (/–|-|por\s+|acarreo|desplazamiento|flexible|sin definir|propong|econ/i.test(pptoFromLine)) {
        return pptoFromLine;
      }
      if (/^\d+$/.test(pptoFromLine.trim()) && Number(pptoFromLine) >= 1000) {
        return `$${Number(pptoFromLine).toLocaleString("es-MX")} MXN`;
      }
      if (!/^[\d]{5,}$/.test(digitsOnly)) return pptoFromLine;
    }
  }

  if (conversationText?.trim()) {
    for (const chunk of conversationText.split(/\n+/).reverse()) {
      if (!/\b(presupuesto|silla|acarreo|desplazamiento|\$|pesos|por\s+cada)\b/i.test(chunk)) {
        continue;
      }
      const p = parsePresupuestoFromText(chunk, { askedField: "presupuesto" });
      if (p) return p;
    }
    const fromConv = parsePresupuestoFromText(conversationText, { askedField: "presupuesto" });
    if (fromConv) return fromConv;
  }

  if (typeof extracted.presupuesto === "number" && extracted.presupuesto > 0) {
    const n = extracted.presupuesto;
    const s = String(n);
    if (
      n === 130150 ||
      (s.length === 6 && s.slice(0, 3) === s.slice(3)) ||
      (s.length === 4 && s.slice(0, 2) === s.slice(2))
    ) {
      return null;
    }
    return `$${n.toLocaleString("es-MX")} MXN`;
  }
  if (typeof extracted.presupuesto === "string" && (extracted.presupuesto as string).trim()) {
    const s = String(extracted.presupuesto).trim();
    if (/130150/.test(s.replace(/[^\d]/g, ""))) return null;
    return s;
  }
  return null;
}

function formatUbicacionResumen(
  raw: string | null | undefined,
  conversationText?: string
): string | null {
  const cleaned = sanitizeDireccionCapture(raw) ?? raw?.trim() ?? null;
  if (
    cleaned &&
    isUsableResumenUbicacion(cleaned) &&
    !/\b(se\s+llama|buscando|nos\s+encontramos\s+en)\b/i.test(cleaned)
  ) {
    return cleaned;
  }
  if (conversationText) {
    const fromMsg = parseZonaFromText(conversationText);
    const san = sanitizeDireccionCapture(fromMsg) ?? fromMsg;
    if (san && isUsableResumenUbicacion(san)) return san;
  }
  return cleaned && isUsableResumenUbicacion(cleaned) ? cleaned : null;
}

/**
 * Resumen estilo Conversation Summary para Kommo (campo 1048786).
 * Claves operativas + datos limpios (A15944: no basura, no 130150).
 */
export function buildResumenClienteLargo(
  extracted: ExtractedData,
  mergedLines: string[],
  conversationText?: string
): string {
  const nombre =
    pickFromMergedLines(mergedLines, /Nombre del cliente/i) || extracted.nombre?.trim() || null;
  const correo =
    pickFromMergedLines(mergedLines, /Correo electrónico/i) || extracted.correo?.trim() || null;
  const emailWaived = mergedLines.some((l) => /continuar por whatsapp/i.test(l));
  const evento =
    pickFromMergedLines(mergedLines, /Tipo de evento/i) || extracted.tipo_evento?.trim() || null;
  const fecha =
    pickFromMergedLines(mergedLines, /Fecha del evento/i) ||
    extracted.fecha_evento?.trim() ||
    pickFromMergedLines(mergedLines, /Fecha y horario/i) ||
    extracted.fecha_horario?.trim() ||
    null;
  const horario =
    pickFromMergedLines(mergedLines, /Horario del evento/i) ||
    extracted.horario_evento?.trim() ||
    null;
  const fechaResumen = horario && fecha ? `${fecha}, ${horario}` : fecha;
  const invitados =
    pickFromMergedLines(mergedLines, /Número de invitados/i) ||
    (extracted.num_invitados !== null && extracted.num_invitados > 0
      ? String(extracted.num_invitados)
      : null);
  const ubicacionRaw =
    pickFromMergedLines(mergedLines, /Lugar\/dirección/i) ||
    extracted.direccion_evento?.trim() ||
    null;
  const ubicacion = formatUbicacionResumen(ubicacionRaw, conversationText);

  const reqFromLinesRaw = pickFromMergedLines(mergedLines, /Requerimientos/i);
  const reqFromLines = isUsableResumenServicio(reqFromLinesRaw) ? reqFromLinesRaw : null;
  const reqFromServicesRaw = extracted.requerimientos_evento?.trim();
  const reqFromServices = isUsableResumenServicio(reqFromServicesRaw) ? reqFromServicesRaw : null;
  const convServices =
    conversationText && conversationText.trim().length > 20
      ? parseServicesFromText(conversationText).slice(0, 6)
      : [];
  const reqFromConversation = convServices.length > 0 ? convServices.join(", ") : null;
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

  const blob = [conversationText, reqs, reqFromLinesRaw].filter(Boolean).join("\n");
  const pieces = extractRentalPieceCount(blob);
  const specs = extractProductSpecHints(blob);
  const ppto = resolveResumenPresupuesto(extracted, mergedLines, conversationText);

  let serviciosLine = reqs || "(aún por definir con más detalle)";
  if (pieces && reqs && /mobiliario|silla|mesa|carpa|lounge/i.test(`${reqs} ${blob}`)) {
    serviciosLine = `${reqs} — ${pieces.count} ${pieces.unit}`;
  }
  if (specs.length) {
    const tip = specs.find((s) => /silla|carpa|banquete|coffee|taquiza|solo alimentos/i.test(s));
    if (tip && !/basket|tiffany|silla\s+\d/i.test(serviciosLine)) {
      serviciosLine = `${serviciosLine} (${tip})`;
    }
  }

  const modo = extracted.modo_servicio?.trim();
  const pendientes = pendingFields(mergedLines, extracted);

  const lineas: string[] = ["RESUMEN DE CONVERSACIÓN — Lucy", ""];

  lineas.push("Qué busca el cliente:");
  lineas.push(`• Servicios: ${serviciosLine}`);
  if (modo) lineas.push(`• Modalidad: ${modo}`);
  if (evento) lineas.push(`• Evento: ${evento}`);
  if (invitados) {
    const escalaAbierta = /sin definir|afluencia|no dispone|no (?:lo )?sabe/i.test(invitados);
    lineas.push(escalaAbierta ? `• Invitados: ${invitados}` : `• Invitados del evento: ${invitados}`);
  }
  if (pieces) {
    lineas.push(`• Piezas a cotizar: ${pieces.count} ${pieces.unit}`);
  }
  lineas.push("");

  if (specs.length) {
    lineas.push("Claves para cotizar:");
    for (const s of specs) lineas.push(`• ${s}`);
    lineas.push("");
  }

  lineas.push("Datos capturados:");
  if (nombre) lineas.push(`• Nombre: ${nombre}`);
  if (correo) lineas.push(`• Correo: ${correo}`);
  else if (emailWaived) lineas.push("• Correo: no compartió (sigue por WhatsApp)");
  if (ubicacion) lineas.push(`• Ubicación: ${ubicacion}`);
  if (fechaResumen) lineas.push(`• Fecha/horario: ${fechaResumen}`);
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
