/**
 * Smoke A15708 Itzel — no repetir presentación Lucy tras dar el nombre.
 * node ./scripts/run-a15708-smoke.mjs
 */
import assert from "node:assert/strict";
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
    whatsappDisplayName: "Itzel Mendoza",
    buildClosing: () => "Listo, el equipo arma tu cotización.",
    emailRefusedThisTurn: false,
  });
}

assert.equal(LUCY_PROMPT_VERSION, "V9.72");

const firstIntro =
  "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. Claro que te ayudo con tu evento. ¿Me regalas tu nombre?";

const reply = runGuards({
  aiResponse:
    "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. ¡Mucho gusto, Itzel! ¿Qué tipo de evento tienes en mente celebrar?",
  extracted: emptyExtracted({ nombre: "Itzel Mendoza" }),
  filledSet: new Set(["Nombre del cliente"]),
  currentMessage: "itzel mendoza",
  history: [
    { role: "user", content: "Hola, me gustaría cotizar un evento" },
    { role: "assistant", content: firstIntro },
  ],
});

assert.ok(/Mucho gusto,\s*Itzel/i.test(reply), reply.slice(0, 400));
assert.ok(!/Soy Lucy.*Soy Lucy/is.test(reply), reply.slice(0, 400));
assert.equal((reply.match(/Soy Lucy/gi) ?? []).length, 0, reply.slice(0, 400));
assert.ok(/tipo de evento/i.test(reply), reply.slice(0, 400));

console.log("A15708 smoke OK —", LUCY_PROMPT_VERSION);
