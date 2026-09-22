/**
 * Smoke A16254 Marlen — bailarines / hombres que bailen = entretenimiento;
 * no "no lo tengo listado" con fecha pegada; "Voy a ver otra opción" sin dump.
 * node ./scripts/run-a16254-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  applyLucyMessageGuards,
} from "../lucy-flow-guards.js";
import {
  clientMentionsEntertainment,
  clientChoosesOtherCatalogOption,
  parseServicesFromText,
  parsePrimaryService,
} from "../conversation-understanding.js";
import {
  buildGuardServiceAck,
  serviceLabelFromQuery,
} from "../services/serviceKnowledge.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.19");

assert.ok(clientMentionsEntertainment("Necesito bailarines"));
assert.ok(clientMentionsEntertainment("Bailarines"));
assert.ok(clientMentionsEntertainment("Necesito hombres q bailen"));
assert.ok(clientMentionsEntertainment("hombres que bailen"));
assert.ok(parseServicesFromText("bailarines").includes("Bailarinas"));
assert.equal(parsePrimaryService("Necesito bailarines"), "Bailarinas");

assert.equal(
  serviceLabelFromQuery("Necesito hombres q bailen\n24 de octubre"),
  "Bailarinas"
);
assert.ok(!/hombres q bailen/i.test(serviceLabelFromQuery("Necesito hombres q bailen\n24 de octubre")));

const ack = buildGuardServiceAck("Necesito hombres q bailen\n24 de octubre");
assert.ok(!/no lo tengo listado/i.test(ack), ack);
assert.ok(/bailar/i.test(ack), ack);

assert.ok(clientChoosesOtherCatalogOption("Voy a ver otra opción"));

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

const filled = new Set([
  "Nombre del cliente",
  "Tipo de evento",
  "Número de invitados",
]);

const bailOut = applyLucyMessageGuards({
  aiResponse: "¿Qué servicios te gustaría ir armando?",
  extracted: emptyExtracted({
    nombre: "Marlen",
    tipo_evento: "cumpleaños",
    num_invitados: 30,
  }),
  filledSet: new Set(filled),
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: [
    { role: "assistant", content: "¿Qué te gustaría revisar primero?" },
  ] as OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: "Necesito bailarines",
  buildClosing: () => "CIERRE",
});
assert.ok(/bailar/i.test(bailOut), bailOut);
assert.ok(!/qu[eé] servicios te gustar[ií]a ir armando/i.test(bailOut), bailOut);
assert.ok(/\?/.test(bailOut), bailOut);

const blobOut = applyLucyMessageGuards({
  aiResponse:
    "Perfecto — *Necesito hombres q bailen\n24 de octubre* no lo tengo listado en el catálogo.",
  extracted: emptyExtracted({
    nombre: "Marlen",
    tipo_evento: "cumpleaños",
    num_invitados: 30,
    requerimientos_evento: "Bailarinas",
  }),
  filledSet: new Set([...filled, "Requerimientos o servicios"]),
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: [] as OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: "Necesito hombres q bailen\n24 de octubre",
  buildClosing: () => "CIERRE",
});
assert.ok(!/no lo tengo listado/i.test(blobOut), blobOut);
assert.ok(!/\*Necesito hombres/i.test(blobOut), blobOut);
assert.ok(/\?/.test(blobOut), blobOut);

const other = applyLucyMessageGuards({
  aiResponse:
    "Con gusto te apoyo con tu cumpleaños. Manejamos varias líneas: Alimentos, Barras…",
  extracted: emptyExtracted({
    nombre: "Marlen",
    tipo_evento: "cumpleaños",
    num_invitados: 30,
    fecha_evento: "24 de octubre",
    requerimientos_evento: "Bailarinas",
  }),
  filledSet: new Set([
    ...filled,
    "Requerimientos o servicios",
    "Fecha del evento",
  ]),
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: [
    {
      role: "assistant",
      content:
        "¿Lo dejamos anotado o prefieres revisar otra opción del catálogo?",
    },
  ] as OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: "Voy a ver otra opción",
  buildClosing: () => "CIERRE",
});
assert.ok(/otra opci|qu[eé] otra|dejamos eso/i.test(other), other);
assert.ok(!/alimentos.*banquete.*taquiza.*brunch/i.test(other), other);
assert.ok(/\?/.test(other), other);

console.log("A16254 smoke OK —", LUCY_PROMPT_VERSION);
