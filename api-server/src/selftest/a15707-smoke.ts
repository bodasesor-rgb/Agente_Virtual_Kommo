/**
 * Smoke A15707 danymelgozza — primer mensaje con cotización ≠ "ya platicamos".
 * node ./scripts/run-a15707-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  clientWantsQuoteDelivery,
} from "../conversation-understanding.js";
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

function runGuards(opts: {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  currentMessage: string;
  history?: { role: string; content: string }[];
  forceFirstPresentation?: boolean;
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: (opts.history ?? []) as never,
    currentMessage: opts.currentMessage,
    whatsappDisplayName: "danymelgozza",
    buildClosing: () => "Listo, el equipo arma tu cotización.",
    emailRefusedThisTurn: false,
    forceFirstPresentation: opts.forceFirstPresentation,
  });
}

const opening =
  "Quiero hacer una cotización de barra de sushis y nigiris para 25 personas";

assert.equal(LUCY_PROMPT_VERSION, "V9.70");
assert.equal(clientWantsQuoteDelivery(opening), false);
assert.ok(clientWantsQuoteDelivery("Si, mándame la cotización por favor, y te confirmo todo"));

const reply = runGuards({
  aiResponse:
    "Claro, danymelgozza. Nuestro equipo te arma la cotización con lo que ya platicamos. ¿Me regalas tu nombre?",
  extracted: emptyExtracted({
    requerimientos_evento: "Barra de sushi",
    num_invitados: 25,
  }),
  filledSet: new Set(["Requerimientos o servicios", "Número de invitados"]),
  currentMessage: opening,
  forceFirstPresentation: true,
  history: [],
});

assert.ok(!/ya platicamos/i.test(reply), reply.slice(0, 500));
assert.ok(/sushi|nigiri|25|personas|nombre|Lucy|Bodasesor/i.test(reply), reply.slice(0, 500));

console.log("A15707 smoke OK —", LUCY_PROMPT_VERSION);
