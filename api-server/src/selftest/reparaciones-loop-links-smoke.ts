/**
 * Smoke — loop_links cuando el cliente pide precio/detalle.
 *
 * node ./scripts/run-reparaciones-loop-links-smoke.mjs
 */
import assert from "node:assert/strict";
import { applyLucyGlobalAntiRepetition } from "../lucyOutboundAntiRepeat.js";
import { clientAsksPrice } from "../price-guard.js";

assert.ok(clientAsksPrice("Cuál es el costo del moctel?"), "clientAsksPrice");

const catalogUrl = "https://bodasesor.com/catalogos/mocteles";
const history = [
  { role: "user", content: "Quiero mocteles" },
  {
    role: "assistant",
    content: `Claro. Mocteles: ${catalogUrl} ¿Quieres detalles?`,
  },
  { role: "user", content: "Cuál es el costo del moctel?" },
];

const draft = `Claro. Mocteles: ${catalogUrl} El precio depende del paquete. ¿Te mando opciones solo o completo?`;

const catalogPat = /bodasesor\.com\/catalogos|te dejo el cat[aá]logo general|mande el cat[aá]logo/i;
const prevAssistant = history[1]!.content as string;
assert.ok(catalogPat.test(draft), "draft catalog");
assert.ok(catalogPat.test(prevAssistant), "prev catalog");
assert.ok(/\bcostos?\b/i.test("Cuál es el costo del moctel?"), "inline costo");

const currentMessage = "Cuál es el costo del moctel?";
const clientAskedPriceLocal =
  /\bprecios?\b|\bcostos?\b|\bcu[aá]nto\s+cuesta|\btarifa\b|\bver\s+(los\s+)?precios?\b/i.test(
    currentMessage
  );
assert.ok(clientAskedPriceLocal, "local clientAskedPrice");

const { mensaje, applied } = applyLucyGlobalAntiRepetition({
  mensaje: draft,
  history,
  currentMessage,
  filledSet: new Set<string>(),
  extracted: {},
});

assert.ok(applied.includes("catalog-link-loop-price-detail"), applied.join(","));
assert.ok(!mensaje.includes(catalogUrl), mensaje);

console.log("reparaciones-loop-links smoke OK");
