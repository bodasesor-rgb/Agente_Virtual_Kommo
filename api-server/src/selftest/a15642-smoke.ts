/**
 * Smoke A15642 Paloma — comida = tipo evento; mesas/sillas ≠ menú alimentos.
 * node ./scripts/run-a15642-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  isVagueFoodTerm,
  isEventTypeMealPhrase,
  clientMentionsCatering,
  parseTipoEventoFromText,
  parseFechaFromText,
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
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: (opts.history ?? []) as never,
    currentMessage: opts.currentMessage,
    whatsappDisplayName: null,
    buildClosing: () => "Listo, el equipo arma tu cotización.",
    emailRefusedThisTurn: false,
  });
}

assert.equal(LUCY_PROMPT_VERSION, "V9.73");

assert.ok(isEventTypeMealPhrase("Es una comida para el sábado 12 de septiembre"));
assert.ok(!isVagueFoodTerm("Es una comida para el sábado 12 de septiembre"));
assert.ok(!clientMentionsCatering("Es una comida para el sábado 12 de septiembre"));
assert.ok(isVagueFoodTerm("Quiero cotizar comida para un evento"));
assert.equal(parseTipoEventoFromText("Es una comida para el sábado"), "comida");
assert.ok(/septiembre|12/i.test(parseFechaFromText("Es una comida para el sábado 12 de septiembre") ?? ""));

const comidaReply = runGuards({
  aiResponse: "Claro. Para *comida* del evento, ¿qué te gustaría?",
  extracted: emptyExtracted({
    nombre: "Paloma Fuente Campo",
    requerimientos_evento: "Mobiliario",
  }),
  filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
  currentMessage: "Es una comida para el sábado 12 de septiembre",
  history: [
    { role: "assistant", content: "¿Qué tipo de celebración están planeando?" },
  ],
});
assert.ok(!/banquete|casual|catering|barra de pastas/i.test(comidaReply), comidaReply.slice(0, 500));
assert.ok(/comida|septiembre|12|correo|ciudad|ubicaci|invitad|horario/i.test(comidaReply), comidaReply.slice(0, 500));

const piecesReply = runGuards({
  aiResponse:
    "Claro que sí. Claro. Para *comida* del evento, ¿qué te gustaría?\n• Un *banquete* más formal\n• Algo más *casual* tipo catering — por ejemplo: barra de pastas",
  extracted: emptyExtracted({
    nombre: "Paloma Fuente Campo",
    requerimientos_evento: "Mobiliario",
    tipo_evento: "comida",
    fecha_evento: "12 de septiembre",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Tipo de evento",
    "Fecha del evento",
  ]),
  currentMessage: "Mesas, sillas, plato trinche,",
  history: [
    {
      role: "assistant",
      content:
        "Claro. Para *comida* del evento, ¿qué te gustaría?\n• Un *banquete* más formal\n• Algo más *casual* tipo catering — barra de pastas, taquiza, sushi…",
    },
  ],
});
assert.ok(!/banquete|casual tipo catering|barra de pastas/i.test(piecesReply), piecesReply.slice(0, 500));
assert.ok(/mesas|sillas|trinche|anot/i.test(piecesReply), piecesReply.slice(0, 500));

console.log("A15642 smoke OK —", LUCY_PROMPT_VERSION);
