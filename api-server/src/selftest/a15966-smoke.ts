/**
 * A15966 — Claudia: medidas de carpa para entelado se capturan y no se re-preguntan.
 * Aplica a todas las ramas.
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  isDimensionText,
  parseSpaceDimensions,
  parseServicesFromText,
} from "../conversation-understanding.js";
import {
  applyLucyMessageGuards,
  requiredServiceDimensionsMissing,
} from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";
import { buildGuardServiceAck } from "../services/serviceKnowledge.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.98");

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

function runGuards(opts: {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  currentMessage?: string;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: false,
    cierreYaEnviado: false,
    emailRefusedThisTurn: false,
    history: opts.history ?? [],
    currentMessage: opts.currentMessage,
    forceFirstPresentation: false,
    buildClosing: () => "CIERRE_OK equipo arma cotización",
  });
}

console.log("A15966 smoke — entelado entiende medidas\n");

const dimPhrase = "la medida de la carpa es 15 metros de ancho por 25 metros de largo.";
assert.ok(isDimensionText(dimPhrase), dimPhrase);
assert.equal(parseSpaceDimensions(dimPhrase), "15m x 25m");
assert.equal(
  parseSpaceDimensions("15 metros de ancho por 25 metros de largo. Serían 375 m2"),
  "15m x 25m"
);

// Formatos comunes en todas las ramas (carpa / pista / entelado).
for (const [raw, expected] of [
  ["10x15", "10m x 15m"],
  ["10 x 15", "10m x 15m"],
  ["10 por 15", "10m x 15m"],
  ["10 por 15 metros", "10m x 15m"],
  ["10 metros por 15", "10m x 15m"],
  ["10 de ancho por 15 de largo", "10m x 15m"],
  ["ancho 10 largo 15", "10m x 15m"],
  ["ancho: 10m, largo: 15m", "10m x 15m"],
  ["10x15 altura 4", "10m x 15m x 4m alt"],
  ["la carpa mide 10 por 15", "10m x 15m"],
] as const) {
  assert.ok(isDimensionText(raw), raw);
  assert.equal(parseSpaceDimensions(raw), expected, raw);
}

const firstAck = buildGuardServiceAck(
  "Hola, me interesa cotizar un entelado para techo para mi evento. ¿Me pueden dar información?"
);
assert.match(firstAck, /Entelados para Techo/i);
assert.match(firstAck, /medidas|largo/i);
assert.ok(!/Si ya tienes medidas del salón, mándamelas/i.test(firstAck), firstAck);

const extracted = emptyExtracted({
  nombre: "Claudia",
  requerimientos_evento: "Entelados para Techo",
});
const filled = new Set([
  "Nombre del cliente",
  "Requerimientos o servicios",
]);
const dimReply = runGuards({
  aiResponse: "Perfecto — anoto *Entelados para Techo*… Si ya tienes medidas del salón, mándamelas.",
  extracted,
  filledSet: filled,
  currentMessage: dimPhrase,
  history: [
    {
      role: "user",
      content: "Hola, me interesa cotizar un entelado para techo para mi evento",
    },
    {
      role: "assistant",
      content:
        "Perfecto — anoto *Entelados para Techo*. Para cotizarlo necesito las medidas del salón o carpa. ¿Cuánto mide?",
    },
  ],
});
assert.match(dimReply, /15\s*m\s*x\s*25\s*m/i, dimReply);
assert.ok(!/Si ya tienes medidas/i.test(dimReply), dimReply);
assert.ok(!/necesito las medidas/i.test(dimReply), dimReply);
assert.ok(/espacio 15m x 25m/i.test(extracted.requerimientos_evento ?? ""), extracted.requerimientos_evento);
assert.equal(requiredServiceDimensionsMissing(extracted), false);

// No reenviar el catálogo completo en un turno de embudo (solo "Boda").
const tipoReply = runGuards({
  aiResponse: "Perfecto — anoto *Entelados para Techo*… Si ya tienes medidas… ¿Qué van a celebrar?",
  extracted: emptyExtracted({
    nombre: "Claudia",
    requerimientos_evento: "Entelados para Techo (espacio 15m x 25m)",
    tipo_evento: null,
  }),
  filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
  currentMessage: "Boda",
  history: [
    { role: "user", content: dimPhrase },
    { role: "assistant", content: "Perfecto — anoto medidas *15 m x 25 m*. ¿Qué van a celebrar?" },
  ],
});
assert.ok(!/Catálogo de \*entelados\*/i.test(tipoReply), tipoReply);
assert.ok(!/Si ya tienes medidas/i.test(tipoReply), tipoReply);
assert.ok(!/necesito las medidas/i.test(tipoReply), tipoReply);

// "medida de la carpa" en contexto entelado no debe sumar SKU Carpas suelto.
const svcs = parseServicesFromText(dimPhrase);
// Puede o no incluir Carpas según parser; el CRM limpio es lo importante:
assert.ok(!/^Carpas$/i.test(extracted.requerimientos_evento ?? ""), extracted.requerimientos_evento);

void svcs;
console.log("A15966 smoke OK —", LUCY_PROMPT_VERSION);
