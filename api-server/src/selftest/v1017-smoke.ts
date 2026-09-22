/**
 * Smoke V10.20 — invita ideas + precio solo bajo demanda + tips + grounding opt-in off.
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

assert.equal(LUCY_PROMPT_VERSION, "V10.20");
assert.equal(isGoogleGroundingEnabled(), false);
assert.equal(lucyCostControlsSummary().google_grounding, false);

assert.equal(clientWantsIdeasOrTrends("hola"), false);
assert.equal(clientWantsIdeasOrTrends("que tendencias hay para bodas en jardin"), true);
assert.equal(clientWantsIdeasOrTrends("dame ideas de decoracion elegantes"), true);
assert.equal(clientWantsIdeasOrTrends("si dame ideas"), true);
assert.equal(clientWantsIdeasOrTrends("claro, quiero ideas"), true);
assert.ok(extractStyleCues("quiero algo boho y elegante").includes("boho"));

const block = buildTrendContextBlock({
  messageText: "ideas de decoracion boho",
  tipoEvento: "Boda",
  requerimientos: null,
});
assert.ok(/IDEAS|TENDENCIAS/i.test(block));
assert.ok(!/\$\s*\d/.test(block), "tips no deben traer precios");
assert.ok(block.length <= 900);

const inviteBlock = buildTrendContextBlock({
  messageText: "es para mi boda",
  tipoEvento: "Boda",
  requerimientos: null,
});
assert.ok(/INVITA ideas/i.test(inviteBlock), inviteBlock);

const staticP = buildStaticSystemPrompt();
assert.ok(/OFRECE ideas|ideas de lo que se puede/i.test(staticP), "prompt debe ofrecer ideas");
assert.ok(/ideas y criterio de venta|ROL DE VENTA|no chatbot de pasos/i.test(staticP));

assert.equal(shouldInjectTrendBlock("hola", "Boda"), true);
assert.equal(clientAsksPrice("cuanto cuesta la taquiza"), true);
assert.equal(clientAsksPrice("quiero ideas para mi boda"), false);

const stripped = stripUnsolicitedPriceClaims(
  "Para tu boda recomiendo lounge. La taquiza esta desde $289 MXN. Cuantos invitados van?",
  "quiero ideas para mi boda"
);
assert.ok(!/\$\s*289/.test(stripped), stripped);
assert.ok(/invitados/i.test(stripped), stripped);

const kept = stripUnsolicitedPriceClaims(
  "La taquiza esta desde $289 MXN. Te late?",
  "cuanto cuesta la taquiza"
);
assert.ok(/\$\s*289/.test(kept), "si pidio precio, no strip");

const dyn = buildDynamicTurnContext({
  stage: "incoming",
  priority: "warm",
  extracted: emptyExtractedData({ tipo_evento: "Boda", nombre: "Ana" }),
  crmContext: "ESTADO ACTUAL — nombre Ana, tipo Boda",
  slimCatalog: true,
  messageText: "dame ideas de estilo jardin",
  trendGroundingSnippet: null,
});
assert.ok(/IDEAS|TENDENCIAS|Estilo|Ideas utiles|Ideas útiles|INVITA/i.test(dyn), dyn.slice(0, 500));

assert.ok(typeof getGoogleGroundingStats().attempts === "number");
console.log("V10.20 smoke OK");