/**
 * Smoke A16018 Guadalupe — "Claro con gusto" ≠ nombre "Con";
 * "Guadalupe Bastida servidora" → Guadalupe Bastida y puede reemplazar basura CRM.
 * node ./scripts/run-a16018-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  sanitizeCrmNombre,
  sanitizeDisplayName,
  isAffirmativeOnlyMessage,
  isLikelyNotPersonNameMessage,
  isWeakOrJunkNombre,
  shouldUpdateName,
  pickBetterNombre,
  resolveKommoLeadNamePatch,
} from "../contact-name.js";
import { isInvalidCrmNombre, applyCrmWriteInvariants } from "../lucyCrmInvariants.js";
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

assert.equal(LUCY_PROMPT_VERSION, "V10.11");

assert.ok(isAffirmativeOnlyMessage("Claro con gusto"));
assert.ok(isAffirmativeOnlyMessage("claro con gusto"));
assert.ok(isAffirmativeOnlyMessage("con gusto"));
assert.ok(isLikelyNotPersonNameMessage("Claro con gusto"));
assert.ok(isWeakOrJunkNombre("Con"));
assert.ok(isWeakOrJunkNombre("con gusto"));

assert.equal(sanitizeCrmNombre("Claro con gusto"), null);
assert.equal(sanitizeDisplayName("Claro con gusto"), null);
assert.equal(sanitizeCrmNombre("Con"), null);
assert.equal(sanitizeDisplayName("Con"), null);
assert.ok(isInvalidCrmNombre("Con"));
assert.ok(isInvalidCrmNombre("Claro con gusto"));

assert.equal(sanitizeCrmNombre("Guadalupe Bastida servidora"), "Guadalupe Bastida");
assert.equal(sanitizeDisplayName("Guadalupe Bastida servidora"), "Guadalupe");
assert.equal(shouldUpdateName("Con", "Guadalupe Bastida"), true);
assert.equal(shouldUpdateName("Con", "Guadalupe Bastida servidora"), true);
assert.equal(shouldUpdateName("Lupita Bastida", "Con"), false);
assert.equal(pickBetterNombre("Guadalupe Bastida servidora", "Con"), "Guadalupe Bastida");
assert.equal(resolveKommoLeadNamePatch("Con", "Guadalupe Bastida servidora"), "Guadalupe Bastida");
assert.equal(resolveKommoLeadNamePatch("Lupita Bastida", "Claro con gusto"), null);
assert.equal(resolveKommoLeadNamePatch("Lupita Bastida", "Con"), null);

const cleared = applyCrmWriteInvariants(emptyExtracted({ nombre: "Con" }), ["Claro con gusto"]);
assert.equal(cleared.extracted.nombre, null);
assert.ok(cleared.applied.includes("nombre-invalid-cleared"));

const keepGuadalupe = applyCrmWriteInvariants(
  emptyExtracted({ nombre: "Guadalupe Bastida servidora" }),
  ["Guadalupe Bastida servidora"]
);
assert.equal(keepGuadalupe.extracted.nombre, "Guadalupe Bastida");

console.log("A16018 smoke OK —", LUCY_PROMPT_VERSION);
