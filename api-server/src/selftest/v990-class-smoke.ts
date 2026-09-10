/**
 * Smoke V9.90 — A15944 Carol: no discurso como venue; Lemon + Green Plaza limpios.
 * node ./scripts/run-v990-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseZonaFromText,
  extractVenueNameHint,
  extractLocatedPlaceHint,
  looksLikeSupplierSearchNotVenue,
  isVenueWithoutCity,
  enrichExtractedFromConversation,
  sanitizeDireccionCapture,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.90");

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

const supplierMsg =
  "Buenas noches coordino eventos en un salón de fiestas y estamos buscando a un proveedor que nos apoye ya que contamos con un tipo de silla que es basket Tony de color gris";
const lemonMsg =
  "En el Estado de México, el salón se llama Lemon Salón Terraza y nos encontramos en Green Plaza Lomas verdes";
const guestsMsg =
  "Contamos con 66 invitados realmente buscamos un proveedor que nos apoye con el complemento de sillas que ya contamos con el salón";

{
  assert.equal(extractVenueNameHint(supplierMsg), null);
  assert.ok(looksLikeSupplierSearchNotVenue(supplierMsg));
  assert.ok(!isVenueWithoutCity(supplierMsg));
  assert.equal(parseZonaFromText(supplierMsg), null);
}

{
  assert.equal(extractVenueNameHint(lemonMsg), "Lemon Salón Terraza");
  assert.match(extractLocatedPlaceHint(lemonMsg) ?? "", /Green Plaza/i);
  const zona = parseZonaFromText(lemonMsg);
  assert.ok(zona);
  assert.match(zona!, /Estado de M[eé]xico/i);
  assert.match(zona!, /Lemon Sal[oó]n Terraza/i);
  assert.match(zona!, /Green Plaza/i);
  assert.ok(!/se llama|nos encontramos|buscando|proveedor/i.test(zona!));
}

{
  const dirty =
    "Estado de México, salón se llama Lemon Salón Terraza y nos encontramos en, Contamos con 66 invitados realmente buscamos un proveedor";
  const clean = sanitizeDireccionCapture(dirty);
  assert.ok(clean);
  assert.match(clean!, /Lemon|Estado/i);
  assert.ok(!/se llama|Contamos con 66|buscamos un proveedor/i.test(clean!));
}

{
  const extracted = emptyExtracted();
  enrichExtractedFromConversation(extracted, [supplierMsg, lemonMsg, guestsMsg].join("\n"));
  assert.match(extracted.direccion_evento ?? "", /Lemon/i);
  assert.match(extracted.direccion_evento ?? "", /Green Plaza/i);
  assert.ok(!/buscando|se llama|Contamos con 66/i.test(extracted.direccion_evento ?? ""));
}

{
  const extracted = emptyExtracted({ nombre: "Carol" });
  const filled = new Set(["Nombre del cliente"]);
  const r1 = applyLucyMessageGuards({
    aiResponse: "¿Qué tipo de evento tienes en puerta?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      {
        role: "assistant",
        content: "¡Mucho gusto, Carol! ¿Qué tipo de evento tienes en puerta?",
      },
    ] as never,
    currentMessage: supplierMsg,
    whatsappDisplayName: "Carol",
    buildClosing: () => "cierre",
  });
  assert.ok(!/Anoto \*sal[oó]n de fiestas/i.test(r1), r1.slice(0, 300));
  assert.ok(!extracted.direccion_evento || !/buscando/i.test(extracted.direccion_evento));
}

{
  const extracted = emptyExtracted({
    nombre: "Carol",
    requerimientos_evento: "Mobiliario / sillas",
  });
  const filled = new Set(["Nombre del cliente", "Requerimientos o servicios"]);
  const reply = applyLucyMessageGuards({
    aiResponse: "¿Cuántos invitados?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      {
        role: "assistant",
        content: "Para cotizar bien necesito al menos la ciudad del evento. ¿En qué ciudad está?",
      },
    ] as never,
    currentMessage: lemonMsg,
    whatsappDisplayName: "Carol",
    buildClosing: () => "cierre",
  });
  assert.match(extracted.direccion_evento ?? "", /Lemon/i);
  assert.match(extracted.direccion_evento ?? "", /Green Plaza/i);
  assert.match(reply, /Lemon|Green Plaza|Estado de M[eé]xico/i);
  assert.ok(!/se llama|nos encontramos en \*/i.test(reply), reply.slice(0, 400));
  assert.ok(!/Contamos con 66/i.test(reply));
}

{
  // Regresión A15942 Diana
  const diana =
    "En Guadalajara.\nAdentro del Hospital General Regional 46\nEntre 8 de Julio y Lázaro Cárdenas";
  const zona = parseZonaFromText(diana);
  assert.match(zona ?? "", /Guadalajara/i);
  assert.match(zona ?? "", /Hospital/i);
  assert.match(zona ?? "", /8 de Julio/i);
}

console.log("V9.90 class smoke OK —", LUCY_PROMPT_VERSION);
