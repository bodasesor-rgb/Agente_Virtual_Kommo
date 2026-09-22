/**
 * Smoke A16244 Diana — Lucy nunca mata la conversación (siempre `?`);
 * techo ≠ ubicación; 25m2 cuenta como medida; Seguimos con… sin `?` se reabre.
 * node ./scripts/run-a16244-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  applyLucyMessageGuards,
  looksLikeDeadEndAck,
  ensureOutboundAlwaysAsks,
  buildContinueEngagementQuestion,
} from "../lucy-flow-guards.js";
import {
  isUsableDireccionEvento,
  parseSpaceDimensions,
  clientRequestsCallback,
} from "../conversation-understanding.js";
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

assert.equal(isUsableDireccionEvento("techo"), false);
assert.equal(isUsableDireccionEvento("el techo"), false);
assert.ok(parseSpaceDimensions("Recuerdo que mide 25m2"));
assert.ok(parseSpaceDimensions("Es de 20x20m"));
assert.ok(clientRequestsCallback("Necesito que me llamen lo más pronto posible por favor"));

assert.ok(
  looksLikeDeadEndAck(
    "Perfecto, Diana. Anoto la ubicación en *Ciudad de México*. Seguimos con *Colgantes Premium* y lo demás que platicamos."
  )
);
assert.ok(
  looksLikeDeadEndAck(
    "Claro. Te dejo el catálogo general para que veas montajes, menús y opciones:\nhttps://bodasesor.com/catalogos"
  )
);

const extracted = emptyExtracted({
  nombre: "Diana",
  correo: "diana@dif3r3nte.com",
  direccion_evento: "Ciudad de México",
  fecha_evento: "4 de diciembre",
  horario_evento: "de 3 a 11pm",
  num_invitados: 50,
  requerimientos_evento: "Colgantes Premium, Carpas (espacio 20m x 20m), Tarima",
  tipo_evento: "evento",
  presupuesto: "Sin definir (cliente indicó que no tiene)",
});

const filled = new Set([
  "Nombre del cliente",
  "Correo electrónico",
  "Lugar/dirección del evento",
  "Fecha del evento",
  "Horario del evento",
  "Número de invitados",
  "Requerimientos o servicios",
  "Tipo de evento",
  "Presupuesto (MXN)",
]);

const dead = applyLucyMessageGuards({
  aiResponse:
    "Perfecto, Diana. Anoto la ubicación en *Ciudad de México*. Seguimos con *Colgantes Premium* y lo demás que platicamos.",
  extracted,
  filledSet: filled,
  readyForClosing: true,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: [] as OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: "Ciudad de México",
  buildClosing: () => "CIERRE",
});
assert.ok(/\?/.test(dead), `debe preguntar: ${dead}`);

const catalogOnly = applyLucyMessageGuards({
  aiResponse:
    "Claro. Te dejo el catálogo general para que veas montajes, menús y opciones:\nhttps://bodasesor.com/catalogos",
  extracted,
  filledSet: filled,
  readyForClosing: true,
  cierreYaEnviado: true,
  emailRefusedThisTurn: false,
  history: [
    {
      role: "assistant",
      content: "Claro, te paso los números:\nVentas: 55 4008 0373",
    },
  ] as OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: "Okay",
  buildClosing: () => "CIERRE",
});
assert.ok(/\?/.test(catalogOnly), catalogOnly);
assert.ok(!/^claro\.\s*te dejo el cat[aá]logo/i.test(catalogOnly.trim()), catalogOnly);

const hooked = ensureOutboundAlwaysAsks(
  "Perfecto, ya tengo todo. He anotado la tarima.",
  {
    extracted,
    filledSet: filled,
    ctx: { extracted, filledSet: filled, history: [], currentMessage: "Si" },
    currentMessage: "Si",
    cierreYaEnviado: true,
  }
);
assert.ok(/\?/.test(hooked), hooked);
assert.ok(buildContinueEngagementQuestion(extracted).includes("?"));

// A16244b: early-return de ubicación (rama directa) también debe salir con `?`
// aunque el AI/cuerpo no pregunte — el wrapper global lo fuerza.
const earlyBranch = applyLucyMessageGuards({
  aiResponse: "Ok.",
  extracted: emptyExtracted({
    nombre: "Diana",
    requerimientos_evento: "Carpas",
    num_invitados: 50,
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Número de invitados",
  ]),
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: [
    { role: "assistant", content: "¿En qué ciudad lo arman?" },
  ] as OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: "Ciudad de México",
  buildClosing: () => "CIERRE sin pregunta",
});
assert.ok(/\?/.test(earlyBranch), `early branch must ask: ${earlyBranch}`);
assert.ok(/ciudad de m[eé]xico|ubicaci/i.test(earlyBranch), earlyBranch);

console.log("A16244 smoke OK —", LUCY_PROMPT_VERSION);
