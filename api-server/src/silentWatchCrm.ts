/**
 * Vigilancia CRM mientras Lucy está en silencio (Humano Trabaja / Cotización).
 * Conservador: solo escribe datos claros del mensaje actual; no pisa CRM bueno con basura.
 */
import type { ExtractedData } from "./types.js";
import {
  applyCrmWriteInvariants,
} from "./lucyCrmInvariants.js";
import { crmStoredValue } from "./lucy-flow-guards.js";
import {
  sanitizeDisplayName,
  sanitizeCrmNombre,
  resolveKommoLeadNamePatch,
} from "./contact-name.js";
import {
  parseZonaFromText,
  parseFechaFromText,
  parseInvitadosFromText,
  parseServicesFromText,
  parseTipoEventoFromText,
  mergeServiceRequirements,
  isUsableDireccionEvento,
  isUsableFechaHorario,
  mergeFechaHorario,
  shouldReplaceCrmDireccion,
  applyLocationCorrectionToAddress,
  clientCorrectsLocation,
  isVenueSpaceDetail,
  isServiceLabelNotTipoEvento,
  isUnusableTipoEventoReply,
} from "./conversation-understanding.js";

/** IDs Kommo usados por el PATCH silencioso. */
export const SILENT_WATCH_FIELD = {
  direccion_evento: 1048774,
  requerimientos_evento: 1048776,
  fecha_horario: 1048778,
  num_invitados: 1048780,
  tipo_evento: 1048782,
} as const;

function cap255(s: string): string {
  return s.length <= 255 ? s : s.slice(0, 255);
}

/**
 * PATCH solo con campos que el cliente acaba de cambiar en este mensaje.
 * Conservador en Humano Trabaja: no pisar CRM bueno con basura GPT / fragmentos "en …".
 */
export function buildSilentWatchPatchPayload(
  text: string,
  extracted: ExtractedData,
  currentLeadName?: string | null,
  crmLines: string[] = []
): Record<string, unknown> | null {
  const customFields: Array<{ field_id: number; values: Array<{ value: unknown }> }> = [];
  const msg = text.trim();

  // Ubicación: parseZona del mensaje, o corrección explícita (A15210 patio/piso/otra ubicación).
  const crmDireccion = crmStoredValue(crmLines, "Lugar/dirección del evento");
  const correctedZona =
    clientCorrectsLocation(msg) || isVenueSpaceDetail(msg)
      ? applyLocationCorrectionToAddress(crmDireccion, msg)
      : null;
  const zonaFromMsg = correctedZona ?? parseZonaFromText(msg);
  if (
    zonaFromMsg &&
    isUsableDireccionEvento(zonaFromMsg) &&
    (correctedZona
      ? zonaFromMsg !== (crmDireccion ?? "").trim()
      : shouldReplaceCrmDireccion(crmDireccion, zonaFromMsg))
  ) {
    customFields.push({
      field_id: SILENT_WATCH_FIELD.direccion_evento,
      values: [{ value: cap255(zonaFromMsg) }],
    });
  }

  const fechaFromMsg = parseFechaFromText(msg);
  if (fechaFromMsg && isUsableFechaHorario(fechaFromMsg)) {
    const crmFecha = crmStoredValue(crmLines, "Fecha y horario");
    const mergedFecha = mergeFechaHorario(crmFecha, fechaFromMsg) ?? fechaFromMsg;
    if (isUsableFechaHorario(mergedFecha) && mergedFecha !== (crmFecha ?? "").trim()) {
      customFields.push({
        field_id: SILENT_WATCH_FIELD.fecha_horario,
        values: [{ value: cap255(mergedFecha) }],
      });
    }
  }

  const invRaw = parseInvitadosFromText(msg);
  const invitados = invRaw ? parseInt(invRaw, 10) : null;
  if (invitados && invitados > 0) {
    customFields.push({
      field_id: SILENT_WATCH_FIELD.num_invitados,
      values: [{ value: String(invitados) }],
    });
  }

  const tipoFromMsg = parseTipoEventoFromText(msg);
  if (
    tipoFromMsg &&
    !isServiceLabelNotTipoEvento(tipoFromMsg) &&
    !isUnusableTipoEventoReply(tipoFromMsg)
  ) {
    customFields.push({
      field_id: SILENT_WATCH_FIELD.tipo_evento,
      values: [{ value: cap255(tipoFromMsg) }],
    });
  }

  // Requerimientos: solo etiquetas de servicio parseadas (nunca el mensaje crudo).
  const services = parseServicesFromText(msg);
  if (services.length > 0) {
    const crmReq = crmStoredValue(crmLines, "Requerimientos o servicios");
    const merged = mergeServiceRequirements(
      crmReq || extracted.requerimientos_evento,
      services.join(", "),
      6
    );
    const prevCount = parseServicesFromText(crmReq || extracted.requerimientos_evento || "").length;
    const nextCount = merged ? parseServicesFromText(merged).length : 0;
    if (merged && nextCount > prevCount) {
      customFields.push({
        field_id: SILENT_WATCH_FIELD.requerimientos_evento,
        values: [{ value: cap255(merged) }],
      });
    }
  }

  // Nombre: solo si extract trajo nombre limpio — NUNCA sanitizar el mensaje entero.
  const nombreCandidate =
    sanitizeCrmNombre(extracted.nombre) ?? sanitizeDisplayName(extracted.nombre);
  let nombrePatch: string | null = null;
  if (nombreCandidate) {
    const invNombre = applyCrmWriteInvariants(
      { ...extracted, nombre: nombreCandidate, direccion_evento: null },
      [msg]
    );
    if (invNombre.extracted.nombre) {
      nombrePatch = resolveKommoLeadNamePatch(currentLeadName, invNombre.extracted.nombre);
    }
  }

  if (customFields.length === 0 && !nombrePatch) return null;

  // Invariantes: tumbar zona si quedó inválida.
  if (zonaFromMsg) {
    const invZona = applyCrmWriteInvariants(
      {
        ...extracted,
        direccion_evento: zonaFromMsg,
        nombre: null,
      },
      [msg]
    );
    if (!invZona.extracted.direccion_evento) {
      const idx = customFields.findIndex(
        (f) => f.field_id === SILENT_WATCH_FIELD.direccion_evento
      );
      if (idx >= 0) customFields.splice(idx, 1);
    }
  }

  if (customFields.length === 0 && !nombrePatch) return null;

  const payload: Record<string, unknown> = {};
  if (customFields.length > 0) payload["custom_fields_values"] = customFields;
  if (nombrePatch) payload["name"] = cap255(nombrePatch);
  return payload;
}
