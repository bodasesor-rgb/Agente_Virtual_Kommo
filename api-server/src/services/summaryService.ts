/**
 * summaryService.ts — Genera resumen automático de hasta 240 caracteres
 * con los requerimientos del cliente para guardarlo en el campo
 * "Requerimientos para el evento" de Kommo (field_id 1048776).
 *
 * Se usa SIEMPRE como valor del campo requerimientos_evento porque es
 * más fiable y estructurado que lo que extrae el LLM libremente.
 */

import type { ExtractedData } from "../types.js";

const MESES_CORTO: Record<string, string> = {
  enero: "ene", febrero: "feb", marzo: "mar", abril: "abr",
  mayo: "may", junio: "jun", julio: "jul", agosto: "ago",
  septiembre: "sep", octubre: "oct", noviembre: "nov", diciembre: "dic",
};

// ─── Extractores individuales ─────────────────────────────────────────────────

function extraerTipoEvento(texto: string): string | null {
  const tipos: Array<[string, RegExp]> = [
    ["Boda",        /\b(boda|matrimonio|casamiento|nupcial)\b/i],
    ["XV años",     /\b(xv|quince|quinceañera|quinceaños)\b/i],
    ["Corporativo", /\b(corporativo|empresa|lanzamiento|conferencia|capacitación)\b/i],
    ["Cumpleaños",  /\b(cumpleaños|cumple|aniversario)\b/i],
    ["Bautizo",     /\b(bautizo|bautismo)\b/i],
    ["Baby shower", /\bbaby\s*shower\b/i],
    ["Graduación",  /\b(graduación|egreso)\b/i],
  ];
  for (const [nombre, patron] of tipos) {
    if (patron.test(texto)) return nombre;
  }
  return null;
}

function extraerFecha(texto: string): string | null {
  // "15 de junio" → "15 jun"
  const m = texto.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);
  if (m) return `${m[1]} ${MESES_CORTO[m[2]!.toLowerCase()] ?? m[2]!.substring(0, 3).toLowerCase()}`;

  // Solo mes
  for (const [mes, corto] of Object.entries(MESES_CORTO)) {
    if (texto.includes(mes)) return corto;
  }
  return null;
}

function extraerInvitados(texto: string): number | null {
  const patrones = [
    /(\d+)\s*(personas|invitados|gente|asistentes|pax)/i,
    /para\s+(\d+)\s*(personas|invitados)?/i,
    /somos\s+(\d+)/i,
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    if (m) return parseInt(m[1]!);
  }
  return null;
}

function extraerServicios(texto: string): string[] {
  // Orden importa: más específico primero
  const servicios: Array<[string, RegExp]> = [
    ["Parrillada Argentina", /parrillada\s+argentina/i],
    ["Parrillada",           /\bparrillada\b/i],
    ["Banquete",             /\bbanquete\b/i],
    ["Pizzas",               /\bpizza\b/i],
    ["Sushi",                /\b(sushi|poke)\b/i],
    ["Taquiza",              /\b(taquiza|taco)\b/i],
    ["Crepas",               /\bcrep[a]?\b/i],
    ["Canapés",              /\b(canapé|bocadillo)\b/i],
    ["Mesa Quesos",          /\b(quesos|grazing)\b/i],
    ["Mesa Postres",         /\b(postres|dulces)\b/i],
    ["Mixología",            /\bmixología\b/i],
    ["Coctelería",           /\bcocteler[íi]a\b/i],
    ["Mócteles",             /\bmócteles?\b/i],
    ["Café",                 /\b(barra de café|coffee break)\b/i],
    ["Poptails",             /\bpoptail\b/i],
    ["Estructuras",          /\b(estructura|colgante|wisteria)\b/i],
    ["Inflables",            /\binflable\b/i],
    ["Softplay",             /\bsoftplay\b/i],
    ["Mobiliario",           /\b(mobiliario|mármol|sillas)\b/i],
  ];

  const encontrados: string[] = [];
  for (const [nombre, patron] of servicios) {
    if (patron.test(texto)) encontrados.push(nombre);
  }
  return encontrados;
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

function extraerZona(texto: string): string | null {
  const m = texto.match(
    /\b(en|para|zona|lugar|ciudad|colonia)\s+([A-ZÁÉÍÓÚÑa-záéíóúüñ][\wáéíóúüñ\s.-]{2,40})/i
  );
  if (!m) return null;
  const zona = m[2]!.trim().replace(/\s+(para|el|la|un|una)\b.*$/i, "").trim();
  return zona.length >= 3 ? zona : null;
}

/**
 * Enriquece datos extraídos desde el texto completo de la conversación
 * (sin contaminar el flujo con "Info pendiente").
 */
export function enrichExtractedFromText(extracted: ExtractedData, conversationText: string): void {
  const texto = conversationText.toLowerCase();

  if (!extracted.tipo_evento?.trim()) {
    const tipo = extraerTipoEvento(texto);
    if (tipo) extracted.tipo_evento = tipo;
  }
  if (!extracted.fecha_horario?.trim()) {
    const fecha = extraerFecha(texto);
    if (fecha) extracted.fecha_horario = fecha;
  }
  if (!extracted.num_invitados) {
    const inv = extraerInvitados(texto);
    if (inv) extracted.num_invitados = inv;
  }
  if (!extracted.direccion_evento?.trim()) {
    const zona = extraerZona(conversationText);
    if (zona) extracted.direccion_evento = zona;
  }
  if (!extracted.requerimientos_evento?.trim()) {
    const servicios = extraerServicios(texto);
    if (servicios.length > 0) {
      extracted.requerimientos_evento = servicios.slice(0, 3).join(", ");
    }
  }
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
