/**
 * Smoke — loop_links: si el cliente pide precio/detalle, no reenviar el mismo link de catálogo.
 *
 * npx --yes tsx ./src/selftest/reparaciones-loop-links-smoke.ts
 */
import assert from "node:assert/strict";
import { applyLucyGlobalAntiRepetition } from "../lucyOutboundAntiRepeat.js";

const catalogUrl = "https://bodasesor.com/catalogos/mocteles";
const history = [
  { role: "user" as const, content: "Quiero mocteles" },
  { role: "assistant" as const, content: `Claro. Mocteles: ${catalogUrl} ¿Quieres detalles?` },
  { role: "user" as const, content: "Cuál es el costo del moctel?" },
];

const draft = `Claro. Mocteles: ${catalogUrl} El precio depende del paquete. ¿Te mando opciones solo o completo?`;
const { mensaje, applied } = applyLucyGlobalAntiRepetition({
  mensaje: draft,
  history,
  currentMessage: "Cuál es el costo del moctel?",
  filledSet: new Set<string>(),
  extracted: {},
});
assert.ok(applied.includes("catalog-link-loop-price-detail"), applied.join(","));
assert.ok(!mensaje.includes(catalogUrl), mensaje);
assert.match(mensaje, /precio depende del paquete/, mensaje);

// Link nuevo (otro servicio) sí se manda.
const otherUrl = "https://bodasesor.com/catalogos/barra-yucateca";
const fresh = applyLucyGlobalAntiRepetition({
  mensaje: `Barra Yucateca: ${otherUrl} El precio depende del número de invitados. ¿Te mando opciones?`,
  history,
  currentMessage: "Cuál es el costo de la yucateca?",
  filledSet: new Set<string>(),
  extracted: {},
});
assert.ok(!fresh.applied.includes("catalog-link-loop-price-detail"), fresh.applied.join(","));
assert.ok(fresh.mensaje.includes(otherUrl), `${fresh.applied.join(",")} :: ${fresh.mensaje}`);

console.log("reparaciones-loop-links smoke OK");
