/**
 * Smoke A16116 Joelle — "Únicamente servicio de catering" no debe caer en "Sigo aquí".
 * node ./scripts/run-a16116-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  SERVICE_HINT,
  clientMentionsCatering,
  isServiceRelatedMessage,
  isVagueFoodTerm,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { applyLucyGlobalAntiRepetition } from "../lucyOutboundAntiRepeat.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.20");

const cateringMsg = "Únicamente servicio de catering";
assert.ok(SERVICE_HINT.test(cateringMsg), "SERVICE_HINT must match catering");
assert.ok(clientMentionsCatering(cateringMsg));
assert.ok(isVagueFoodTerm(cateringMsg), cateringMsg);
assert.ok(isServiceRelatedMessage(cateringMsg));

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

const extracted = emptyExtracted({ nombre: "Joelle" });
const filled = new Set(["Nombre del cliente"]);
const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "user", content: "Quiero hacer una cotizacion" },
  {
    role: "assistant",
    content:
      "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. Claro que te ayudo con tu evento. ¿Me regalas tu nombre?",
  },
  { role: "user", content: "Joelle" },
  { role: "assistant", content: "¡Mucho gusto, Joelle! ¿Qué van a celebrar?" },
  { role: "user", content: "Es un evento pequeño" },
  {
    role: "assistant",
    content:
      "Entendido. Para ir armando tu propuesta, ¿qué servicios tienen en mente? Podemos apoyarte con alimentos, mobiliario, carpas, pistas de baile, DJ, iluminación o mesas de dulces, entre otros.",
  },
];

const guarded = applyLucyMessageGuards({
  aiResponse:
    "Entendido. Para ir armando tu propuesta, ¿qué servicios tienen en mente?",
  extracted,
  filledSet: filled,
  history,
  currentMessage: cateringMsg,
  entityId: "A16116",
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  forceFirstPresentation: false,
  buildClosing: () => "CIERRE",
  whatsappDisplayName: "Joelle",
});

assert.ok(!/Sigo aqu[ií]|confirmas ese dato/i.test(guarded), guarded);
assert.ok(
  /comida|alimentos|formal|casual|banquete|catering|opciones|gustar[ií]a/i.test(guarded),
  guarded
);

const anti = applyLucyGlobalAntiRepetition({
  mensaje: guarded,
  extracted,
  filledSet: filled,
  history: [
    ...history,
    { role: "assistant", content: guarded },
  ],
  currentMessage: cateringMsg,
  cierreYaEnviado: false,
  clientName: "Joelle",
});

assert.ok(!/Sigo aqu[ií]|confirmas ese dato/i.test(anti.mensaje), anti.mensaje);
assert.ok(
  /comida|alimentos|formal|casual|banquete|catering|opciones|gustar[ií]a|anoto/i.test(
    anti.mensaje
  ),
  anti.mensaje
);

// Segunda insistencia (como en el chat real) tampoco debe ser "Sigo aquí".
const guarded2 = applyLucyMessageGuards({
  aiResponse: "Sigo aquí. Cuando puedas, ¿me confirmas ese dato?",
  extracted: emptyExtracted({
    nombre: "Joelle",
    requerimientos_evento: null,
  }),
  filledSet: new Set(["Nombre del cliente"]),
  history: [
    ...history,
    { role: "user", content: cateringMsg },
    { role: "assistant", content: "Sigo aquí. Cuando puedas, ¿me confirmas ese dato?" },
  ],
  currentMessage: cateringMsg,
  entityId: "A16116b",
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  forceFirstPresentation: false,
  buildClosing: () => "CIERRE",
  whatsappDisplayName: "Joelle",
});
assert.ok(!/Sigo aqu[ií]|confirmas ese dato/i.test(guarded2), guarded2);

console.log("a16116-smoke OK", LUCY_PROMPT_VERSION);
