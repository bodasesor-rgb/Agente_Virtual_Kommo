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
  parseHorarioFromText,
  parseInvitadosFromText,
  parseServicesFromText,
  parseTipoEventoFromText,
  mergeServiceRequirements,
  isUsableDireccionEvento,
  isUsableFechaEvento,
  isUsableHorarioEvento,
  shouldReplaceCrmDireccion,
  applyLocationCorrectionToAddress,
  clientCorrectsLocation,
  isVenueSpaceDetail,
  isServiceLabelNotTipoEvento,
  isUnusableTipoEventoReply,
  CRM_FECHA_LABEL,
  CRM_HORARIO_LABEL,
} from "./conversation-understanding.js";

/** IDs Kommo usados por el PATCH silencioso. */
export const SILENT_WATCH_FIELD = {
  direccion_evento: 1048774,
  requerimientos_evento: 1048776,
  fecha_evento: 1048778,
  horario_evento: 1049358,
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
  if (fechaFromMsg && isUsableFechaEvento(fechaFromMsg)) {
    const crmFecha = crmStoredValue(crmLines, CRM_FECHA_LABEL);
    if (fechaFromMsg !== (crmFecha ?? "").trim()) {
      customFields.push({
        field_id: SILENT_WATCH_FIELD.fecha_evento,
        values: [{ value: cap255(fechaFromMsg) }],
      });
    }
  }

  const horarioFromMsg = parseHorarioFromText(msg);
  if (horarioFromMsg && isUsableHorarioEvento(horarioFromMsg)) {
    const crmHorario = crmStoredValue(crmLines, CRM_HORARIO_LABEL);
    if (horarioFromMsg !== (crmHorario ?? "").trim()) {
      customFields.push({
        field_id: SILENT_WATCH_FIELD.horario_evento,
        values: [{ value: cap255(horarioFromMsg) }],
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

  const services = parseServicesFromText(msg);
  if (services.length > 0) {
    const crmReq = crmStoredValue(crmLines, "Requerimientos o servicios");
    const merged = mergeServiceRequirements(crmReq, msg, 6);
    if (merged && merged !== (crmReq ?? "").trim()) {
      customFields.push({
        field_id: SILENT_WATCH_FIELD.requerimientos_evento,
        values: [{ value: cap255(merged) }],
      });
    }
  }

  const inv = applyCrmWriteInvariants(extracted, [msg]);
  const payload: Record<string, unknown> = { custom_fields_values: customFields };

  const fromExtract =
    sanitizeCrmNombre(inv.extracted.nombre) ?? sanitizeDisplayName(inv.extracted.nombre);
  const nombrePatch = resolveKommoLeadNamePatch(currentLeadName, fromExtract ?? null);
  if (nombrePatch) payload["name"] = cap255(nombrePatch);

  return customFields.length || payload["name"] ? payload : null;
}
