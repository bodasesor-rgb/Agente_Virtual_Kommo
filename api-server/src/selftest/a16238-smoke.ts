/**
 * Smoke A16238 Paola — Banquete + invitados no debe morir en
 * "Queda anotado lo de Banquete." sin pregunta; ni basura de ubicación.
 * node ./scripts/run-a16238-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  applyLucyMessageGuards,
  buildRequerimientosQuestion,
  looksLikeDeadEndAck,
  getNextPendingField,
} from "../lucy-flow-guards.js";
import {
  isUsableDireccionEvento,
  looksLikeDiscourseNotPlace,
  looksLikeMxMunicipalityToponym,
  clientRequestsDualProposals,
} from "../conversation-understanding.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.16");

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

assert.ok(looksLikeDeadEndAck("Queda anotado lo de Banquete."));
assert.ok(looksLikeDeadEndAck("Perfecto. Queda anotado lo de Banquete."));
assert.equal(
  looksLikeDeadEndAck("Queda anotado lo de Banquete. ¿Qué día tienen en mente?"),
  false
);

assert.ok(looksLikeDiscourseNotPlace("Podrías darme información de ambos"));
assert.equal(isUsableDireccionEvento("Podrías darme información de ambos"), false);
assert.equal(looksLikeMxMunicipalityToponym("Podrías darme información de ambos"), false);
assert.ok(clientRequestsDualProposals("Podrías darme información de ambos"));
assert.ok(clientRequestsDualProposals("me das info de ambos"));
assert.ok(clientRequestsDualProposals("las dos opciones"));

const historyConMenu: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "assistant",
    content:
      "Claro. Para *comida* del evento, ¿qué te gustaría?\n" +
      "• Un *banquete* más formal (servicio a la mesa, varios tiempos)\n" +
      "• Algo más *casual* tipo catering — por ejemplo: barra de pastas y ensaladas, barra de pizzas, taquiza, sushi…\n\n" +
      "También manejamos desayuno, brunch, canapés y otras estaciones. Dime qué estilo te late y te paso el detalle.",
  },
  { role: "user", content: "Banquete" },
  {
    role: "assistant",
    content: "Además del Banquete, ¿te gustaría cotizar algún otro servicio?",
  },
];

const extracted = emptyExtracted({
  nombre: "Paola",
  tipo_evento: "boda",
  requerimientos_evento: "Banquete",
  num_invitados: 50,
});

const filled = new Set([
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Número de invitados",
]);

// buildRequerimientosQuestion: menú ya ofrecido + invitados → clarifier con `?`, no ack muerto.
const reqQ = buildRequerimientosQuestion(
  extracted,
  historyConMenu,
  "50 personas",
  "a16238"
);
assert.ok(/\?/.test(reqQ), `debe preguntar: ${reqQ}`);
assert.ok(!/^queda anotado lo de banquete\.?$/i.test(reqQ.trim()), reqQ);
assert.ok(/formal|casual/i.test(reqQ), reqQ);

// Guards: AI suelta ack muerto → reabrir embudo con pregunta.
const out = applyLucyMessageGuards({
  aiResponse: "Queda anotado lo de Banquete.",
  extracted,
  filledSet: filled,
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: historyConMenu,
  currentMessage: "50 personas",
  buildClosing: () => "CIERRE",
});

assert.ok(/\?/.test(out), `guards deben abrir embudo: ${out}`);
assert.ok(
  !/^queda anotado lo de banquete\.?$/i.test(out.trim()),
  `no debe quedar solo el ack: ${out}`
);

const pending = getNextPendingField(extracted, filled);
assert.equal(pending, "requerimientos");

// Tras "Y la cotización?" tampoco debe salir ack muerto sin `?`.
const outCotiza = applyLucyMessageGuards({
  aiResponse: "Queda anotado lo de Banquete.",
  extracted,
  filledSet: filled,
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: [
    ...historyConMenu,
    { role: "user", content: "50 personas" },
    { role: "assistant", content: "Queda anotado lo de Banquete." },
  ],
  currentMessage: "Y la cotización?",
  buildClosing: () => "CIERRE",
});
assert.ok(/\?/.test(outCotiza), `cotización no mata chat: ${outCotiza}`);

// A16238b: "información de ambos" → dual propuesta, no "Además del Banquete".
const dual = applyLucyMessageGuards({
  aiResponse: "Además del Banquete, ¿te gustaría cotizar algún otro servicio?",
  extracted: emptyExtracted({
    nombre: "Paola",
    tipo_evento: "boda",
    requerimientos_evento: "Banquete",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
  ]),
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: [
    {
      role: "assistant",
      content:
        "Claro. Para *comida* del evento, ¿qué te gustaría?\n" +
        "• Un *banquete* más formal\n• Algo más *casual* tipo catering",
    },
  ],
  currentMessage: "Podrías darme información de ambos",
  buildClosing: () => "CIERRE",
});
assert.ok(/dos propuestas|formal.*casual|casual.*formal/i.test(dual), dual);
assert.ok(!/adem[aá]s del banquete/i.test(dual), dual);
assert.ok(!/queda anotado lo de banquete/i.test(dual), dual);

console.log("A16238 smoke OK —", LUCY_PROMPT_VERSION);
