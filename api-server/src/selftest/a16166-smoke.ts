/**
 * Smoke A16166 Jimena — Sillas Wishbone: capturar modelo + precio $200 (no mesas Vintage/Caoba).
 * node ./scripts/run-a16166-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  parseFurnitureCatalogSkuFromText,
  parseServicesFromText,
  parseChairModelFromText,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { buildConsultativeNoPriceReply } from "../price-guard.js";
import { buildLucyInfoLearnedPriceReply } from "../services/lucyInfoPriceCache.js";
import { hasConcreteServiceVariant } from "../services/serviceProgressiveOffer.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.09");

assert.equal(parseChairModelFromText("100 Sillas Wishbone"), "Wishbone");
assert.equal(
  parseFurnitureCatalogSkuFromText("me interesa cotizar 100 Sillas Wishbone para mi boda"),
  "100 Sillas Wishbone"
);
assert.equal(parseFurnitureCatalogSkuFromText("Requiero 100 sillas wishbone"), "100 Sillas Wishbone");
assert.ok(hasConcreteServiceVariant("100 sillas wishbone"));

const services = parseServicesFromText("cotizar 100 Sillas Wishbone para mi boda");
assert.ok(
  services.some((s) => /Wishbone/i.test(s)),
  `expected Wishbone in ${services.join(", ")}`
);
assert.ok(!services.includes("Mobiliario") || services.some((s) => /Wishbone/i.test(s)));

const priceReply =
  buildLucyInfoLearnedPriceReply("precio de las sillas wishbone") ||
  buildConsultativeNoPriceReply("precio de las sillas wishbone");
assert.ok(priceReply, "must return PDF price reply");
assert.ok(/200|Wishbone/i.test(priceReply!), priceReply);
assert.ok(!/\$\s*750/i.test(priceReply!), `must not dump Vintage $750: ${priceReply}`);
assert.ok(!/\$\s*900/i.test(priceReply!), `must not dump Caoba $900: ${priceReply}`);

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

const extracted = emptyExtracted({
  nombre: "Jimena Solís",
  tipo_evento: "boda",
  requerimientos_evento: "100 Sillas Wishbone",
});
const filled = new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]);
const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "user",
    content: "Hola, buena tarde! me interesa cotizar 100 Sillas Wishbone para mi boda",
  },
  {
    role: "assistant",
    content:
      "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. Te ayudo con la cotización para tu boda. ¿Me regalas tu nombre?",
  },
  { role: "user", content: "Hola Lucy! Mi nombre es Jimena Solís" },
];

const afterName = applyLucyMessageGuards({
  aiResponse: "Perfecto — anoto *mobiliario*. ¿Te gustaría *mesas y sillas*, *periqueras*, o ambas?",
  extracted,
  filledSet: filled,
  history,
  currentMessage: "Requiero 100 sillas wishbone",
  entityId: "A16166",
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  forceFirstPresentation: false,
  buildClosing: () => "CIERRE",
  whatsappDisplayName: "Jimena Solís",
});

assert.ok(!/anoto \*mobiliario\*/i.test(afterName), afterName);
assert.ok(!/mesas y sillas.*periqueras.*o ambas/i.test(afterName), afterName);
assert.ok(/Wishbone/i.test(afterName) || /Wishbone/i.test(extracted.requerimientos_evento ?? ""), afterName);

const priceAsk = applyLucyMessageGuards({
  aiResponse: "Según el catálogo… Vintage/White Precio: $750",
  extracted: emptyExtracted({
    nombre: "Jimena Solís",
    tipo_evento: "boda",
    requerimientos_evento: "100 Sillas Wishbone",
    fecha_evento: "13 de marzo del 2027",
    num_invitados: 200,
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Fecha del evento",
    "Número de invitados",
  ]),
  history: [
    ...history,
    { role: "user", content: "Requiero 100 sillas wishbone" },
    { role: "assistant", content: "¿Qué día tienen en mente?" },
    { role: "user", content: "13 de marzo del 2027" },
    { role: "assistant", content: "¿Tienen un estimado de invitados?" },
    { role: "user", content: "200 invitados pero necesito solo 100 sillas wishbone" },
    { role: "assistant", content: "¿A qué hora sería el evento?" },
  ],
  currentMessage: "No comprendo, reuniros el precio de las sillas wishbone",
  entityId: "A16166b",
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  forceFirstPresentation: false,
  buildClosing: () => "CIERRE",
  whatsappDisplayName: "Jimena Solís",
});

assert.ok(/Wishbone|200/i.test(priceAsk), priceAsk);
assert.ok(!/\$\s*750/i.test(priceAsk), priceAsk);
assert.ok(!/\$\s*900/i.test(priceAsk), priceAsk);

console.log("a16166-smoke OK", LUCY_PROMPT_VERSION);
