/**
 * Smoke A16096 Naomi — "pastel" / "Solo pastel" se captura como servicio (Cupcakes y Betún).
 * node ./scripts/run-a16096-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  clientNarrowsToOnlyService,
  isServiceRelatedMessage,
  parsePrimaryService,
  parseServicesFromText,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { getCatalogWebUrlForQuery } from "../services/catalogWebKnowledge.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.19");

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

for (const msg of ["pastel", "Solo pastel", "Quiero cotizar un pastel", "Pastel"]) {
  assert.ok(isServiceRelatedMessage(msg), msg);
  assert.ok(parseServicesFromText(msg).includes("Cupcakes y Betún"), msg);
  assert.equal(parsePrimaryService(msg), "Cupcakes y Betún", msg);
}

assert.equal(clientNarrowsToOnlyService("Solo pastel"), "Cupcakes y Betún");
assert.ok(getCatalogWebUrlForQuery("pastel")?.includes("cupcakes-y-betun"));

const extracted = emptyExtracted({
  nombre: "Naomi",
  tipo_evento: "cumpleaños",
});
const filled = new Set(["Nombre del cliente", "Tipo de evento"]);
const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "user", content: "Hola! Quiero hacer una cotizacion de un pastel" },
  { role: "assistant", content: "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. ¿Me regalas tu nombre?" },
  { role: "user", content: "Naomi" },
  { role: "assistant", content: "¡Mucho gusto, Naomi! ¿Qué van a celebrar?" },
  { role: "user", content: "Un cumpleaños" },
  { role: "assistant", content: "Con gusto te apoyo con tu cumpleaños. ¿Qué servicios te gustaría?" },
];

const out = applyLucyMessageGuards({
  aiResponse: "¿Qué necesitas cotizar?",
  extracted,
  filledSet: filled,
  history,
  currentMessage: "Solo pastel",
  entityId: "A16096",
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  forceFirstPresentation: false,
  buildClosing: () => "CIERRE",
  whatsappDisplayName: "Naomi",
});

assert.ok(!/qu[eé] necesitas cotizar|ir armando|qu[eé] servicios/i.test(out), out);
assert.ok(/pastel|cupcakes|bet[uú]n/i.test(out), out);
assert.ok(
  /cupcakes-y-betun|Catálogo/i.test(out) || /anoto|Perfecto/i.test(out),
  out
);
assert.ok(
  extracted.requerimientos_evento &&
    /Cupcakes y Bet[uú]n|pastel/i.test(extracted.requerimientos_evento),
  extracted.requerimientos_evento
);

console.log("a16096-smoke OK", LUCY_PROMPT_VERSION);
