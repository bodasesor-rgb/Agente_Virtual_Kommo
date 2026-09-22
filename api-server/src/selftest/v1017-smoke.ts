/**
 * Smoke V10.17 — ideas-first, precio solo bajo demanda, tips, grounding opt-in off.
 * node ./scripts/run-v1017-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  clientWantsIdeasOrTrends,
  buildTrendContextBlock,
  extractStyleCues,
  shouldInjectTrendBlock,
} from "../services/trendKnowledge.js";
import { isGoogleGroundingEnabled, getGoogleGroundingStats } from "../services/googleGrounding.js";
import { stripUnsolicitedPriceClaims, clientAsksPrice } from "../price-guard.js";
import { buildDynamicTurnContext, buildStaticSystemPrompt } from "../services/promptBuilder.js";
import { lucyCostControlsSummary } from "../lib/lucyCostControls.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import { emptyExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.17");
assert.equal(isGoogleGroundingEnabled(), false);
assert.ok(lucyCostControlsSummary().google_grounding === false);

assert.equal(clientWantsIdeasOrTrends("hola"), false);
assert.equal(clientWantsIdeasOrTrends("¿qué tendencias hay para bodas en jardín?"), true);
assert.equal(clientWantsIdeasOrTrends("dame ideas de decoración elegantes"), true);
assert.ok(extractStyleCues("quiero algo boho y elegante").includes("boho"));

const block = buildTrendContextBlock({
  messageText: "ideas de decoración boho",
  tipoEvento: "Boda",
  requerimientos: null,
});
assert.ok(/IDEAS|TENDENCIAS/i.test(block));
assert.ok(!/\$\s*\d/.test(block), "tips no deben traer precios");
assert.ok(block.length <= 900);
assert.equal(shouldInjectTrendBlock("hola", "Boda"), true);

assert.equal(clientAsksPrice("¿cuánto cuesta la taquiza?"), true);
assert.equal(clientAsksPrice("quiero ideas para mi boda"), false);

const stripped = stripUnsolicitedPriceClaims(
  "Para tu boda recomiendo lounge. La taquiza está desde $289 MXN. ¿Cuántos invitados van?",
  "quiero ideas para mi boda"
);
assert.ok(!/\$\s*289/.test(stripped), stripped);
assert.ok(/invitados/i.test(stripped), stripped);

const kept = stripUnsolicitedPriceClaims(
  "La taquiza está desde $289 MXN. ¿Te late?",
  "¿cuánto cuesta la taquiza?"
);
assert.ok(/\$\s*289/.test(kept), "si pidió precio, no strip");

const staticP = buildStaticSystemPrompt();
assert.ok(/ideas y criterio de venta|ROL DE VENTA|no chatbot de pasos/i.test(staticP));

const dyn = buildDynamicTurnContext({
  stage: "incoming",
  priority: "warm",
  extracted: emptyExtractedData({ tipo_evento: "Boda", nombre: "Ana" }),
  crmContext: "ESTADO ACTUAL — nombre Ana, tipo Boda",
  slimCatalog: true,
  messageText: "dame ideas de estilo jardín",
  trendGroundingSnippet: null,
});
assert.ok(/IDEAS \/ TENDENCIAS|IDEAS\/TENDENCIAS|Estilo\/vibe|Ideas útiles/i.test(dyn), dyn.slice(0, 400));

const stats = getGoogleGroundingStats();
assert.ok(typeof stats.attempts === "number");

console.log("V10.17 smoke OK");