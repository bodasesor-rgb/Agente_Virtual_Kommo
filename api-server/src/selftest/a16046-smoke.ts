/**
 * Smoke A16046 Susana — pista de baile ≠ carpa (medidas y corrección).
 * node ./scripts/run-a16046-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  applyLucyMessageGuards,
  buildRequiredServiceDimensionsQuestion,
} from "../lucy-flow-guards.js";
import {
  clientMentionsCarpas,
  clientMentionsPistaTarima,
  clientCorrectsCarpaToPista,
  resolveSpaceMeasureServiceBase,
  stripAccidentalCarpasFromPistaRequirements,
  captureContextualAnswer,
} from "../conversation-understanding.js";
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

assert.equal(clientMentionsCarpas("No carpa"), false);
assert.equal(clientMentionsCarpas("Es Pista\nNo carpa"), false);
assert.ok(clientMentionsPistaTarima("Es Pista\nNo carpa"));
assert.ok(clientCorrectsCarpaToPista("Es Pista\nNo carpa"));
assert.ok(clientMentionsCarpas("quiero carpa blanca"));
assert.equal(
  resolveSpaceMeasureServiceBase({
    requerimientos: "Pista de baile",
    lastLucy: "¿Cuánto debe medir la pista?",
    currentMessage: "6 x 5 mts",
  }),
  "pista"
);
assert.equal(
  stripAccidentalCarpasFromPistaRequirements("Pista de baile; Carpas (espacio 6m x 5m)"),
  "Pista de baile (espacio 6m x 5m)"
);
assert.match(
  buildRequiredServiceDimensionsQuestion(
    emptyExtracted({ requerimientos_evento: "Pista de baile" })
  ),
  /pista|tarima/i
);
assert.ok(
  !/para la carpa/i.test(
    buildRequiredServiceDimensionsQuestion(
      emptyExtracted({ requerimientos_evento: "Pista de baile" })
    )
  )
);

const historyAsk: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "assistant",
    content:
      "Antes de cerrar la solicitud necesito las medidas aproximadas de la pista o tarima (largo × ancho). ¿Cuánto debe medir?",
  },
];

const captures = captureContextualAnswer(historyAsk, "6 x 5 mts", new Set(["Nombre"]));
const reqCap = captures.find((c) => c.label === "Requerimientos o servicios");
assert.ok(reqCap, `expected requerimientos capture, got ${JSON.stringify(captures)}`);
assert.match(reqCap!.value, /pista/i, reqCap!.value);
assert.ok(!/\bcarpas?\b/i.test(reqCap!.value), reqCap!.value);

const extracted = emptyExtracted({
  nombre: "Susana",
  tipo_evento: "boda",
  num_invitados: 100,
  fecha_evento: "17 de enero 2027",
  horario_evento: "12 pm",
  direccion_evento: "CDMX",
  requerimientos_evento: "Pista de baile",
});
const filled = new Set([
  "Nombre del cliente",
  "Tipo de evento",
  "Número de invitados",
  "Fecha",
  "Horario",
  "Lugar/dirección del evento",
  "Requerimientos o servicios",
]);

const dimsReply = applyLucyMessageGuards({
  aiResponse: "Perfecto. ¿Presupuesto?",
  extracted: { ...extracted },
  filledSet: new Set(filled),
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: historyAsk,
  currentMessage: "6 x 5 mts",
  forceFirstPresentation: true,
  buildClosing: () => "CIERRE",
});
assert.match(dimsReply, /pista/i, dimsReply);
assert.ok(!/para la carpa/i.test(dimsReply), dimsReply);
assert.ok(!/blancas|negras|transparentes|domo/i.test(dimsReply), dimsReply);

const contaminated = emptyExtracted({
  ...extracted,
  requerimientos_evento: "Pista de baile; Carpas (espacio 6m x 5m)",
});
const correction = applyLucyMessageGuards({
  aiResponse: "De acuerdo.",
  extracted: contaminated,
  filledSet: new Set(filled),
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: [
    ...historyAsk,
    { role: "user", content: "6 x 5 mts" },
    {
      role: "assistant",
      content: "Perfecto — anoto medidas *6 m x 5 m* para la carpa. ¿Presupuesto?",
    },
  ],
  currentMessage: "Es Pista\nNo carpa",
  forceFirstPresentation: true,
  buildClosing: () => "CIERRE",
});
assert.match(correction, /pista/i, correction);
assert.ok(!/blancas|negras|transparentes|domo/i.test(correction), correction);
assert.ok(!/\bcarpas?\b/i.test(contaminated.requerimientos_evento ?? ""), contaminated.requerimientos_evento);

console.log("A16046 smoke OK —", LUCY_PROMPT_VERSION);
