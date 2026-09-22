/**
 * Smoke A16074 Verónica — tarima ≠ pista; declines; Comida tipo ≠ catering; zona limpia.
 * node ./scripts/run-a16074-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  parsePrimaryService,
  parseServicesFromText,
  clientNarrowsToOnlyService,
  clientMentionsTarimaOnly,
  preferTarimaLabelOverPista,
  isEventTypeMealPhrase,
  isVagueFoodTerm,
  sanitizeDireccionCapture,
  mergeZonaDetail,
  stripServiceDeclineClausesFromDireccion,
} from "../conversation-understanding.js";
import {
  clientDeclinesServiceFamilies,
  serviceIsDeclined,
} from "../services/serviceDecline.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.18");

function emptyExtracted(partial: Partial<ExtractedData> = {}): ExtractedData {
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
    ...partial,
  };
}

assert.equal(parsePrimaryService("cotizar una tarima"), "Tarima");
assert.ok(parseServicesFromText("SOLO LA TARIMA").includes("Tarima"));
assert.ok(!parseServicesFromText("SOLO LA TARIMA").includes("Pista de baile"));
assert.ok(clientMentionsTarimaOnly("entarimado"));
assert.equal(clientNarrowsToOnlyService("SOLO LA TARIMA"), "Tarima");
assert.equal(
  clientNarrowsToOnlyService("No requiero nada más que entarimado"),
  "Tarima"
);

const declined = clientDeclinesServiceFamilies("No quiero pista de baile");
assert.ok(declined.includes("pista"), String(declined));
assert.equal(serviceIsDeclined("Tarima", ["pista"]), false);
assert.equal(serviceIsDeclined("Pista de baile", ["pista"]), true);
assert.ok(clientDeclinesServiceFamilies("NO quiero el servicio de catering").includes("alimentos"));

assert.ok(isEventTypeMealPhrase("Comida"));
assert.equal(isVagueFoodTerm("Comida"), false);

const zona = sanitizeDireccionCapture(
  "CDMX, jardín con un carril de nado, No quiero pista de baile"
);
assert.ok(zona && /cdmx/i.test(zona), zona);
assert.ok(zona && !/no quiero pista/i.test(zona), zona);
assert.equal(
  mergeZonaDetail("CDMX, jardín con un carril de nado", "No quiero pista de baile"),
  "CDMX, jardín con un carril de nado"
);
assert.ok(
  !/no quiero/i.test(
    stripServiceDeclineClausesFromDireccion("CDMX, No quiero pista de baile")
  )
);

const extracted = emptyExtracted({
  nombre: "Verónica",
  requerimientos_evento: "Tarima",
  direccion_evento: "CDMX",
});
const filled = new Set([
  "Nombre del cliente",
  "Requerimientos o servicios",
  "Lugar/dirección del evento",
]);
const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "assistant",
    content: "Perfecto. ¿Qué tipo de evento es?",
  },
];

const comidaReply = applyLucyMessageGuards({
  aiResponse: "Perfecto. Para comida del evento, ¿banquete o casual?",
  extracted: { ...extracted },
  filledSet: new Set(filled),
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history,
  currentMessage: "Comida",
  forceFirstPresentation: true,
  buildClosing: () => "CIERRE",
});
assert.ok(!/banquete|formal|casual|estaciones|catering/i.test(comidaReply), comidaReply);

const noPista = emptyExtracted({
  nombre: "Verónica",
  requerimientos_evento: "Pista de baile",
  direccion_evento: "CDMX, jardín con un carril de nado",
});
const noPistaReply = applyLucyMessageGuards({
  aiResponse: "Seguimos con Pista de baile.",
  extracted: noPista,
  filledSet: new Set(filled),
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: [
    ...history,
    { role: "user", content: "cotizar tarima" },
    { role: "assistant", content: "¿Qué medidas?" },
  ],
  currentMessage: "No quiero pista de baile",
  forceFirstPresentation: true,
  buildClosing: () => "CIERRE",
});
assert.ok(!/Queda anotado lo de Pista de baile/i.test(noPistaReply), noPistaReply);
assert.ok(!/no quiero pista/i.test(noPista.direccion_evento ?? ""), noPista.direccion_evento);
assert.ok(/tarima/i.test(noPista.requerimientos_evento ?? ""), noPista.requerimientos_evento);
assert.ok(!/pista de baile/i.test(noPista.requerimientos_evento ?? ""), noPista.requerimientos_evento);

assert.ok(preferTarimaLabelOverPista("SIlo requiero tarima", "Pista de baile"));

console.log("A16074 smoke OK —", LUCY_PROMPT_VERSION);
