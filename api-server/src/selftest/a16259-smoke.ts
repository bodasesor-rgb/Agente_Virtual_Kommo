/**
 * Smoke A16259 — nombre≠tipo, entrada salón≠Entradas, upsell No, ubicación limpia.
 */
import assert from "node:assert/strict";
import {
  parseTipoEventoFromText,
  isUnusableTipoEventoReply,
  looksLikePersonNameAsEventType,
  parseServicesFromText,
  parsePrimaryService,
  sanitizeDireccionCapture,
  clientDeclinesMoreServices,
  parseSpecialLiveActLabel,
  clientMentionsSpecialLiveAct,
} from "../conversation-understanding.js";
import { preferRicherClientNombre } from "../contact-name.js";
import {
  OTRO_SERVICIO_ASK_PATTERN,
  buildContinueEngagementQuestion,
  lastAssistantAskedMoreServices,
} from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import { emptyExtractedData } from "../types.js";
import type OpenAI from "openai";

assert.equal(LUCY_PROMPT_VERSION, "V10.20");

assert.equal(looksLikePersonNameAsEventType("Betsy Alejandra Ancona Perrusquia"), true);
assert.equal(isUnusableTipoEventoReply("Betsy Alejandra Ancona Perrusquia"), true);
assert.equal(parseTipoEventoFromText("Fiesta de fin de año"), "fiesta de fin de año");
assert.ok(!looksLikePersonNameAsEventType("Fiesta de fin de año"));

assert.ok(!parseServicesFromText("Buscamos decoración para la entrada del salón y show").includes("Entradas"));
assert.ok(!/entradas/i.test(parsePrimaryService("decoración para la entrada del salón") ?? ""));

const zona = sanitizeDireccionCapture("CDMX, piso y algo");
assert.ok(zona && /^CDMX$/i.test(zona.trim()), zona);
const zona2 = sanitizeDireccionCapture("CDMX, para la entrada del salón");
assert.ok(zona2 && !/entrada/i.test(zona2), zona2);

assert.equal(preferRicherClientNombre("Ale", "Betsy Alejandra Ancona Perrusquia"), "Betsy Alejandra Ancona Perrusquia");

assert.equal(clientDeclinesMoreServices("No"), true);
assert.equal(clientDeclinesMoreServices("Ya con eso"), true);
assert.equal(clientDeclinesMoreServices("Sería todo"), true);
assert.equal(clientDeclinesMoreServices("Solo eso"), true);

assert.ok(OTRO_SERVICIO_ASK_PATTERN.test("¿Te sumo mobiliario, iluminación o audio, o seguimos solo con lo que ya anotamos?"));

const hist: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "assistant", content: "Perfecto — anoto medidas *4 m x 3 m* para el entelado.\n\n¿Te sumo mobiliario, iluminación o audio, o seguimos solo con lo que ya anotamos?" },
];
assert.equal(lastAssistantAskedMoreServices(hist), true);

const q = buildContinueEngagementQuestion(emptyExtractedData({ requerimientos_evento: "Entelados para Techo (espacio 4m x 3m)" }), "No");
assert.ok(!/Te sumo mobiliario/i.test(q), q);
assert.ok(/\?/.test(q), q);

assert.equal(parseSpecialLiveActLabel("Quiero cotizar el show crudo wheel"), "Show crudo wheel");
assert.equal(parseSpecialLiveActLabel("show acrobacia aérea"), "Show acrobacia aérea");
assert.ok(clientMentionsSpecialLiveAct("show crudo wheel"));

console.log("A16259 smoke OK");