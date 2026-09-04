/**
 * Smoke A15701 Alejandra — Puerto Vallarta = ciudad, no bucle de confirmación.
 * node ./scripts/run-a15701-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseZonaFromText,
  isUsableDireccionEvento,
} from "../conversation-understanding.js";
import {
  applyLucyMessageGuards,
  isFieldSatisfied,
} from "../lucy-flow-guards.js";
import { isLikelyUbicacionNotNombre } from "../contact-name.js";
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

assert.equal(LUCY_PROMPT_VERSION, "V9.69");

assert.equal(parseZonaFromText("Puerto Vallarta")?.toLowerCase(), "puerto vallarta");
assert.ok(isUsableDireccionEvento("Puerto Vallarta"));
assert.ok(isLikelyUbicacionNotNombre("Puerto Vallarta"));

const filled = new Set([
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Número de invitados",
  "Fecha y horario",
]);
const extracted = emptyExtracted({
  nombre: "Alejandra",
  tipo_evento: "evento corporativo",
  requerimientos_evento: "Coffee break",
  num_invitados: 25,
  fecha_evento: "7, 8 y 9 de septiembre",
  horario_evento: "8 a 3 pm",
});

const reply = runGuards({
  aiResponse: "Listo. Alejandra, ¿me confirmas la *ciudad* del evento?",
  extracted,
  filledSet: filled,
  currentMessage: "Puerto Vallarta",
  history: [
    {
      role: "assistant",
      content:
        "Perfecto, Alejandra. Anoto las fechas 7, 8 y 9 de septiembre en el horario de 8 a 3 pm para tu evento de 25 personas. ¿Podrías indicarme en qué lugar o alcaldía se llevará a cabo?",
    },
    { role: "user", content: "Puerto Vallarta" },
    { role: "assistant", content: "Listo. Alejandra, ¿me confirmas la *ciudad* del evento?" },
    { role: "user", content: "Puerto Vallarta" },
  ],
});

assert.ok(isFieldSatisfied("zona", filled, extracted));
assert.match(extracted.direccion_evento ?? "", /puerto\s+vallarta/i);
assert.ok(!/confirmas la \*ciudad\*|en qu[eé] ciudad|ya tienen ciudad/i.test(reply), reply.slice(0, 400));
assert.ok(/puerto\s+vallarta|anoto/i.test(reply), reply.slice(0, 400));

console.log("A15701 smoke OK —", LUCY_PROMPT_VERSION);
