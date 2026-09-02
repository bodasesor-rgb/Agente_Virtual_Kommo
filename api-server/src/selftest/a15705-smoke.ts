/**
 * Smoke A15705 Karla — "Sería De Catering" ≠ nombre; no pisar Karla Rodríguez.
 * node ./scripts/run-a15705-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  sanitizeCrmNombre,
  sanitizeDisplayName,
  isLikelyNotPersonNameMessage,
  isServicePreferenceAsNombre,
  shouldUpdateName,
  pickBetterNombre,
  resolveKommoLeadNamePatch,
} from "../contact-name.js";
import { looksLikeNameAnswerMessage } from "../conversation-understanding.js";
import { isInvalidCrmNombre, applyCrmWriteInvariants } from "../lucyCrmInvariants.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

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

assert.equal(LUCY_PROMPT_VERSION, "V9.66");

assert.ok(isServicePreferenceAsNombre("Sería De Catering"));
assert.ok(isServicePreferenceAsNombre("Sería de catering"));
assert.ok(isServicePreferenceAsNombre("Sería banquete"));
assert.ok(isLikelyNotPersonNameMessage("Sería De Catering"));
assert.equal(sanitizeCrmNombre("Sería De Catering"), null);
assert.equal(sanitizeDisplayName("Sería De Catering"), null);
assert.ok(isInvalidCrmNombre("Sería De Catering"));
assert.equal(looksLikeNameAnswerMessage("Sería De Catering"), false);
assert.ok(looksLikeNameAnswerMessage("Karla Rodríguez"));

assert.equal(shouldUpdateName("Karla Rodríguez", "Sería De Catering"), false);
assert.equal(shouldUpdateName("Sería De Catering", "Karla Rodríguez"), true);
assert.equal(pickBetterNombre("Sería De Catering", "Karla Rodríguez"), "Karla Rodríguez");
assert.equal(resolveKommoLeadNamePatch("Karla Rodríguez", "Sería De Catering"), null);
assert.equal(resolveKommoLeadNamePatch("Sería De Catering", "Karla Rodríguez"), "Karla Rodríguez");

const cleared = applyCrmWriteInvariants(
  emptyExtracted({ nombre: "Sería De Catering" }),
  ["Sería De Catering"]
);
assert.equal(cleared.extracted.nombre, null);
assert.ok(cleared.applied.includes("nombre-invalid-cleared"));

const keepKarla = applyCrmWriteInvariants(
  emptyExtracted({ nombre: "Karla Rodríguez" }),
  ["Karla Rodríguez"]
);
assert.equal(keepKarla.extracted.nombre, "Karla Rodríguez");

const reply = applyLucyMessageGuards({
  aiResponse: "¡Con gusto, Sería! Aquí seguimos cuando lo necesites.",
  extracted: emptyExtracted({
    nombre: "Karla Rodríguez",
    requerimientos_evento: "Coffee break",
    direccion_evento: "Ciudad de México",
    presupuesto: 55000,
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Lugar/dirección del evento",
    "Presupuesto (MXN)",
  ]),
  readyForClosing: true,
  cierreYaEnviado: true,
  history: [
    { role: "assistant", content: "Perfecto, ya tengo todo." },
    { role: "user", content: "Muchas gracias, quedo atenta" },
  ] as never,
  currentMessage: "Muchas gracias, quedo atenta",
  whatsappDisplayName: "Sería De Catering",
  buildClosing: () => "Listo, el equipo arma tu cotización.",
  emailRefusedThisTurn: false,
});

assert.ok(/Con gusto,\s*Karla/i.test(reply), reply.slice(0, 400));
assert.ok(!/Con gusto,\s*Ser[ií]a/i.test(reply), reply.slice(0, 400));

console.log("A15705 smoke OK —", LUCY_PROMPT_VERSION);
