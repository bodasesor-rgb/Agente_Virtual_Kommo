/**
 * Handoff de contactos que NO son clientes de eventos:
 * proveedores, venues e invitaciones a red de aliados.
 */
import type { ExtractedData } from "../types.js";
import {
  buildProveedorCompletionReply,
  formatProveedorRequirements,
  hydrateProveedorFieldsFromRequirements,
  proveedorQuestionnaireComplete,
} from "./proveedorQuestionnaire.js";

/** Campos que Lucy puede pedir a un proveedor (nunca embudo de evento). */
export const PROVEEDOR_FIELDS = [
  "Nombre del contacto",
  "Empresa",
  "Correo o teléfono",
  "Qué ofrece / alianza",
  "Estado / cobertura",
  "Catálogo o lista de precios",
] as const;

export function extractEmpresaFromText(text: string): string | null {
  if (!text?.trim()) return null;
  const patterns = [
    /\b(?:en|de|desde)\s+(Hacienda\s+[^,.\n]{3,60})/i,
    /\b((?:Hacienda|Sal[oó]n|Venue|Hotel|Jard[ií]n)\s+[^,.\n]{2,50})/i,
    /\bsoy\s+ejecutiv[oa]\s+de\s+ventas\s+en\s+([^,.\n]{3,60})/i,
    /\b(?:empresa|compa[nñ][ií]a)\s+([A-ZÁÉÍÓÚÑ][^,.\n]{2,50})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const raw = m?.[1]?.trim();
    if (raw && raw.length >= 3 && raw.length <= 80) {
      return raw.replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim();
    }
  }
  return null;
}

/**
 * Mensaje final cuando el cuestionario ya está completo
 * (o fallback legacy si se llama sin datos).
 */
export function buildProveedorHandoffReply(opts: {
  nombre?: string | null;
  empresa?: string | null;
  conversationText?: string | null;
  extracted?: ExtractedData | null;
}): string {
  if (opts.extracted && proveedorQuestionnaireComplete(opts.extracted)) {
    return buildProveedorCompletionReply(opts.extracted);
  }

  const name = opts.nombre?.trim().split(/\s+/)[0] || null;
  const empresa =
    opts.empresa?.trim() ||
    extractEmpresaFromText(opts.conversationText ?? "") ||
    null;

  const greet = name ? `Gracias, ${name}.` : "Gracias por escribirnos.";
  const who = empresa
    ? `Recibimos la invitación / propuesta de *${empresa}*.`
    : "Recibimos tu mensaje de alianza / proveedor.";

  return (
    `${greet} ${who} ` +
    "Para canalizarte con el equipo de *proveedores / alianzas*, " +
    "necesito unos datos rápidos (qué ofrecen, cobertura y catálogo). " +
    "¿Qué servicios o productos ofrecen?"
  );
}

/** Limpia campos de embudo cliente cuando el contacto es proveedor. */
export function scrubClientFieldsForProveedor(extracted: ExtractedData): ExtractedData {
  const out = { ...extracted };
  out.tipo_contacto = "proveedor";
  // Venue propio del proveedor ≠ dirección del evento del cliente.
  out.direccion_evento = null;
  out.tipo_evento = null;
  out.num_invitados = null;
  out.presupuesto = null;
  out.fecha_evento = null;
  out.horario_evento = null;
  out.fecha_horario = null;
  if (!out.empresa?.trim()) {
    const fromReq = out.requerimientos_evento?.match(/PROVEEDOR:\s*([^-]+)\s*-/i)?.[1]?.trim();
    out.empresa = fromReq || null;
  }
  hydrateProveedorFieldsFromRequirements(out);
  if (!out.proveedor_oferta?.trim()) {
    const desc = (out.requerimientos_evento ?? "").replace(/^PROVEEDOR:\s*/i, "").trim();
    if (desc && desc.length > 8 && !/^Ofrece:\s*—/i.test(desc)) {
      const offer = desc.match(/Ofrece:\s*([^|]+)/i)?.[1]?.trim();
      if (offer && offer !== "—") out.proveedor_oferta = offer;
    }
  }
  out.requerimientos_evento = formatProveedorRequirements(out);
  return out;
}
