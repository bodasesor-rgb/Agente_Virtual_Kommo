/**
 * A16610 — "aniversario de empresa": Lucy respondió "¡Qué buen plan! Tu aniversario de empresa
 * suena increíble." Se oye forzado; debe ser cordial y profesional:
 * "Perfecto, con gusto te ayudamos con tu aniversario de empresa."
 *
 * npx --yes tsx ./src/selftest/a16610-smoke.ts
 */
import assert from "node:assert/strict";
import { softenRobotAcks } from "../lucyNaturalTone.js";
import { buildGuardServiceAck } from "../services/serviceKnowledge.js";

const FORCED = /buen plan|suena incre[ií]ble|qu[eé] padre/i;
const RESTO =
  "Para este tipo de evento podemos armar algo muy especial con alimentos, barras de bebidas, mesa de postres y mobiliario. ¿Qué servicios te gustaría revisar primero?";

// El guard de tono convertía "Anoto tu…" en el elogio forzado.
const fromAnoto = softenRobotAcks(`Anoto tu aniversario de empresa. ${RESTO}`);
assert.ok(!FORCED.test(fromAnoto), fromAnoto);
assert.ok(fromAnoto.startsWith("Perfecto, con gusto te ayudamos con tu aniversario de empresa."), fromAnoto);
assert.ok(fromAnoto.includes("¿Qué servicios te gustaría revisar primero?"), "conserva la pregunta");

// Sin doble "Perfecto".
const dup = softenRobotAcks("Perfecto. Anoto tu boda. ¿Cuántos invitados tienen contemplados?");
assert.equal(dup, "Perfecto, con gusto te ayudamos con tu boda. ¿Cuántos invitados tienen contemplados?");

// Si el modelo lo escribe solo, también se corrige.
const fromLlm = softenRobotAcks(`¡Qué buen plan! Tu aniversario de empresa suena increíble. ${RESTO}`);
assert.ok(!FORCED.test(fromLlm), fromLlm);
assert.ok(fromLlm.startsWith("Perfecto, con gusto te ayudamos con tu aniversario de empresa."), fromLlm);
const suelto = softenRobotAcks("¡Mucho gusto, Jennifer! ¡Qué padre! ¿Qué van a celebrar?");
assert.ok(!FORCED.test(suelto), suelto);
assert.ok(suelto.includes("¿Qué van a celebrar?"), suelto);

// El acuse por tipo de evento del guard de servicios.
const ack = buildGuardServiceAck("boda");
assert.ok(!FORCED.test(ack), ack);
assert.match(ack, /^Perfecto, con gusto te ayudamos con tu \*boda\*/i);

console.log("a16610 smoke OK");
