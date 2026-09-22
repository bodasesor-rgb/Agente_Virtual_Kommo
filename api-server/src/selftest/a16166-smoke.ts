/**
 * Smoke A16166 — modelos de silla: captura + precio PDF anclado (no mesas Vintage).
 * Cubre Wishbone, Tiffany, Ghost, Crossback, Louis XV, Tiffany Infantil, etc.
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

assert.equal(LUCY_PROMPT_VERSION, "V10.12");

// Ambiguos: nombre propio ≠ modelo
assert.equal(parseChairModelFromText("Hola Lucy! Mi nombre es María"), null);
assert.equal(parseChairModelFromText("Soy Caroline"), null);

const cases: Array<{ msg: string; model: string; sku: string; priceRe: RegExp }> = [
  {
    msg: "me interesa cotizar 100 Sillas Wishbone para mi boda",
    model: "Wishbone",
    sku: "100 Sillas Wishbone",
    priceRe: /200|Wishbone/i,
  },
  {
    msg: "Requiero 80 sillas tiffany",
    model: "Tiffany",
    sku: "80 Sillas Tiffany",
    priceRe: /45|Tiffany/i,
  },
  {
    msg: "precio de las sillas ghost",
    model: "Ghost",
    sku: "Sillas Ghost",
    priceRe: /150|Ghost/i,
  },
  {
    msg: "100 sillas crossback",
    model: "Crossback",
    sku: "100 Sillas Crossback",
    priceRe: /95|Crossback/i,
  },
  {
    msg: "cotizar sillas louis xv",
    model: "Louis XV",
    sku: "Sillas Louis XV",
    priceRe: /200|Louis/i,
  },
  {
    msg: "necesito sillas tiffany infantil",
    model: "Tiffany Infantil",
    sku: "Sillas Tiffany Infantil",
    priceRe: /25|Infantil|Tiffany/i,
  },
  {
    msg: "precio sillas tolix",
    model: "Tolix",
    sku: "Sillas Tolix",
    priceRe: /195|Tolix/i,
  },
];

for (const c of cases) {
  assert.equal(parseChairModelFromText(c.msg), c.model, c.msg);
  assert.equal(parseFurnitureCatalogSkuFromText(c.msg), c.sku, c.msg);
  assert.ok(hasConcreteServiceVariant(c.msg), c.msg);
  const services = parseServicesFromText(c.msg);
  assert.ok(
    services.some((s) => s.includes(c.model)),
    `${c.msg} → ${services.join(", ")}`
  );
  const price =
    buildLucyInfoLearnedPriceReply(`precio de las sillas ${c.model}`) ||
    buildConsultativeNoPriceReply(`precio de las sillas ${c.model}`);
  assert.ok(price, `price for ${c.model}`);
  assert.ok(c.priceRe.test(price!), `${c.model}: ${price}`);
  assert.ok(!/\$\s*750/i.test(price!), `${c.model} must not dump Vintage $750: ${price}`);
  assert.ok(!/\$\s*900/i.test(price!), `${c.model} must not dump Caoba $900: ${price}`);
}

// Mesa homónima no debe virar a sillas
assert.equal(parseChairModelFromText("mesa crossback caoba rectangular"), null);

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

const tiffanyAsk = applyLucyMessageGuards({
  aiResponse: "¿Qué necesitas cotizar?",
  extracted: emptyExtracted({ nombre: "Ana", tipo_evento: "boda" }),
  filledSet: new Set(["Nombre del cliente", "Tipo de evento"]),
  history: [
    { role: "user", content: "Hola" },
    { role: "assistant", content: "¿Me regalas tu nombre?" },
    { role: "user", content: "Ana" },
    { role: "assistant", content: "¿Qué van a celebrar?" },
    { role: "user", content: "Boda" },
  ],
  currentMessage: "Quiero 50 sillas Tiffany",
  entityId: "A16166-tiffany",
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  forceFirstPresentation: false,
  buildClosing: () => "CIERRE",
  whatsappDisplayName: "Ana",
});
assert.ok(/Tiffany/i.test(tiffanyAsk), tiffanyAsk);
assert.ok(!/anoto \*mobiliario\*/i.test(tiffanyAsk), tiffanyAsk);

console.log("a16166-smoke OK", LUCY_PROMPT_VERSION);
