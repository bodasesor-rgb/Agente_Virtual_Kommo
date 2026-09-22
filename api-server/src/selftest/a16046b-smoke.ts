/**
 * Smoke A16046b — tipo de evento ≠ servicio; ubicación ≠ bautizo/boda.
 * node ./scripts/run-a16046b-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  applyLucyMessageGuards,
} from "../lucy-flow-guards.js";
import {
  parseTipoEventoFromText,
  isEventTypeOnlyMessage,
  isUsableDireccionEvento,
} from "../conversation-understanding.js";
import {
  getServiceKnowledge,
  formatServiceKnowledgeForPrompt,
  buildGuardServiceAck,
} from "../services/serviceKnowledge.js";
import { applyCrmWriteInvariants } from "../lucyCrmInvariants.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.15");

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

assert.equal(parseTipoEventoFromText("Boda civil"), "boda");
assert.equal(parseTipoEventoFromText("bautizo de niña"), "bautizo");
assert.ok(isEventTypeOnlyMessage("Boda civil"));
assert.ok(isEventTypeOnlyMessage("bautizo de niña"));
assert.equal(isEventTypeOnlyMessage("quiero banquete para mi boda"), false);

assert.equal(getServiceKnowledge("Boda civil"), null);
assert.equal(formatServiceKnowledgeForPrompt("Boda civil"), null);
assert.ok(!/no lo tengo listado/i.test(buildGuardServiceAck("Boda civil")));

assert.equal(isUsableDireccionEvento("Bautizo de niña"), false);
assert.equal(isUsableDireccionEvento("Boda civil"), false);
assert.ok(isUsableDireccionEvento("CDMX"));
assert.ok(isUsableDireccionEvento("Tlalpan, CDMX"));

const cleared = applyCrmWriteInvariants(
  emptyExtracted({ direccion_evento: "Bautizo de niña" }),
  ["Bautizo de niña"]
);
assert.equal(cleared.extracted.direccion_evento, null);

const extracted = emptyExtracted({
  nombre: "Susana",
  requerimientos_evento: "Pista de baile",
});
const filled = new Set(["Nombre del cliente", "Requerimientos o servicios"]);
const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "assistant",
    content:
      "¡Mucho gusto, Susana! Para poder orientarte con las opciones de pistas que tenemos, ¿qué tipo de evento vas a celebrar?",
  },
];

const out = applyLucyMessageGuards({
  aiResponse:
    "Anoto tu boda civil. Sobre el servicio de boda civil, te comento que no lo tengo listado en mi catálogo, pero lo registro para que el equipo lo valide. ¿Cuántos invitados tienen?",
  extracted,
  filledSet: filled,
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history,
  currentMessage: "Boda civil",
  forceFirstPresentation: true,
  buildClosing: () => "CIERRE",
});

assert.match(out, /\?/, out);
assert.ok(!/no lo tengo listado/i.test(out), out);
assert.ok(!/sobre el servicio/i.test(out), out);
assert.match(out, /boda/i, out);
assert.ok(/boda/i.test(extracted.tipo_evento ?? ""), extracted.tipo_evento);

console.log("A16046b smoke OK —", LUCY_PROMPT_VERSION);
