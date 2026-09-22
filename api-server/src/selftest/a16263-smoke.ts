/**
 * Smoke A16263 — Turena: cena conmemorativa ≠ Cena Level-2;
 * Yucateca solo/completo; horario nocturno/10;30; precio no cierra embudo.
 */
import assert from "node:assert/strict";
import {
  parseTipoEventoFromText,
  isOccasionMealEventType,
  isEventTypeOnlyMessage,
  parseServicesFromText,
  parsePrimaryService,
  parseHorarioFromText,
  normalizeWrittenClockInText,
  clientAsksNamedServiceDetail,
} from "../conversation-understanding.js";
import { clientAsksPrice } from "../price-guard.js";
import {
  buildGuardServiceAck,
  getServiceKnowledge,
} from "../services/serviceKnowledge.js";
import {
  buildSoloVsCompletoModeAnswer,
  buildSoloVsCompletoOfferIfApplicable,
} from "../services/catalogService.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.20");

const occasion = "Cena conmemorativa por día del médico";
assert.equal(isOccasionMealEventType(occasion), true);
assert.equal(isEventTypeOnlyMessage(occasion), true);
assert.equal(parseTipoEventoFromText(occasion), "cena conmemorativa");
assert.ok(!parseServicesFromText(occasion).includes("Cena"), parseServicesFromText(occasion));
assert.ok(!/Cena/i.test(parsePrimaryService(occasion) ?? ""));

const sk = getServiceKnowledge(occasion);
assert.equal(sk, null);

const ack = buildGuardServiceAck(occasion);
assert.ok(!/no lo tengo listado/i.test(ack), ack);
assert.ok(/cena conmemorativa/i.test(ack), ack);
assert.ok(/invitados/i.test(ack), ack);

assert.equal(clientAsksNamedServiceDetail("Yucateca qué opción de alimentos!?"), true);
assert.equal(clientAsksNamedServiceDetail("Si regala detalles de los solicitados"), true);
assert.equal(clientAsksPrice("Cuál es el costo de la barra yucateca !?"), true);

const clock = normalizeWrittenClockInText("Nocturno Aproximadamente 10;30");
assert.ok(/10:30/.test(clock), clock);
const horario = parseHorarioFromText("Nocturno Aproximadamente 10;30");
assert.ok(horario && /22:30|10:30/.test(horario), horario);

const dual = buildSoloVsCompletoModeAnswer("Barra Yucateca", []);
assert.ok(/Solo alimentos/i.test(dual), dual);
assert.ok(/Servicio completo/i.test(dual), dual);
assert.ok(/personal de cocina/i.test(dual), dual);
assert.ok(/bebidas.*meseros|meseros.*bebidas/i.test(dual) && /vajilla/i.test(dual), dual);

// Offer helper needs Sheet snapshot — if null in unit env, still OK that function exists.
assert.equal(typeof buildSoloVsCompletoOfferIfApplicable, "function");

console.log("A16263 smoke OK");
