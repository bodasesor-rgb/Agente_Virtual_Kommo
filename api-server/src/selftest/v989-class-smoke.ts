/**
 * Smoke V9.89 — A15942 Diana: dirección completa (ciudad + venue + calles), no solo ciudad.
 * node ./scripts/run-v989-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseZonaFromText,
  isRicherDireccionCapture,
  isCityOnlyDireccion,
  extractVenueNameHint,
  extractStreetDetailHint,
  enrichExtractedFromConversation,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { mergeExtractedPatch } from "../services/lucyRedaction.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.91");

function emptyExtracted(overrides: Partial<ExtractedData> = {}): ExtractedData {
  return {
    tipo_contacto: "cliente",
    nombre: null,
    empresa: null,
    telefono: null,
    correo: null,
    presupuesto: null,
    direccion_evento: null,
    requerimientos_evento: null,
    fecha_evento: null,
    horario_evento: null,
    fecha_horario: null,
    num_invitados: null,
    tipo_evento: null,
    modo_servicio: null,
    ...overrides,
  };
}

const dianaMsg = `En Guadalajara.
Adentro del Hospital General Regional 46
Entre 8 de Julio y Lázaro Cárdenas`;

{
  assert.ok(isCityOnlyDireccion("Guadalajara"));
  assert.ok(isCityOnlyDireccion("Monterrey"));
  assert.ok(isCityOnlyDireccion("Puebla"));
  assert.ok(!isCityOnlyDireccion("Guadalajara, Hospital General Regional 46"));

  const venue = extractVenueNameHint(dianaMsg);
  assert.ok(venue && /hospital/i.test(venue), venue ?? "null");
  const street = extractStreetDetailHint(dianaMsg);
  assert.ok(street && /8 de Julio/i.test(street) && /L[aá]zaro/i.test(street), street ?? "null");

  const zona = parseZonaFromText(dianaMsg);
  assert.ok(zona, "parseZona null");
  assert.match(zona!, /Guadalajara/i);
  assert.match(zona!, /Hospital/i);
  assert.match(zona!, /8 de Julio/i);
  assert.ok(!isCityOnlyDireccion(zona));
  assert.ok(isRicherDireccionCapture(zona, "Guadalajara"));
  assert.ok(!isRicherDireccionCapture("Guadalajara", zona));
}

{
  const extracted = emptyExtracted({ direccion_evento: "Guadalajara" });
  enrichExtractedFromConversation(extracted, dianaMsg);
  assert.match(extracted.direccion_evento ?? "", /Hospital/i);
  assert.match(extracted.direccion_evento ?? "", /8 de Julio/i);
}

{
  const target = emptyExtracted({
    direccion_evento: "Guadalajara, Hospital General Regional 46, entre 8 de Julio y Lázaro Cárdenas",
  });
  mergeExtractedPatch(target, { direccion_evento: "Guadalajara" });
  assert.match(target.direccion_evento ?? "", /Hospital/i);
}

{
  // Otras ciudades también: Monterrey + hotel + calle
  const msg = "En Monterrey. Hotel Fiesta Americana. Av. Lázaro Cárdenas 2500";
  const zona = parseZonaFromText(msg);
  assert.ok(zona && /Monterrey/i.test(zona) && /Fiesta|Hotel|L[aá]zaro|C[aá]rdenas/i.test(zona), zona);
}

{
  const extracted = emptyExtracted({
    nombre: "Diana",
    num_invitados: 50,
    direccion_evento: "Guadalajara",
  });
  const filled = new Set([
    "Nombre del cliente",
    "Número de invitados",
    "Lugar/dirección del evento",
  ]);
  const reply = applyLucyMessageGuards({
    aiResponse: "Perfecto. ¿Qué tipo de evento es?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      {
        role: "assistant",
        content: "¿En qué ciudad y colonia será el evento?",
      },
    ] as never,
    currentMessage: dianaMsg,
    whatsappDisplayName: "Diana Rios",
    buildClosing: () => "Perfecto, ya tengo todo.",
  });
  assert.match(extracted.direccion_evento ?? "", /Guadalajara/i);
  assert.match(extracted.direccion_evento ?? "", /Hospital/i);
  assert.match(extracted.direccion_evento ?? "", /8 de Julio/i);
  assert.match(reply, /Hospital|Guadalajara|8 de Julio/i);
  assert.ok(!/\bAnoto la ubicaci[oó]n en \*Guadalajara\*/i.test(reply), reply.slice(0, 400));
}

console.log("V9.89 class smoke OK —", LUCY_PROMPT_VERSION);
