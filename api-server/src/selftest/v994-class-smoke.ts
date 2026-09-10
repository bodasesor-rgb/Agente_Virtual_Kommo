/**
 * Smoke V9.94 — fuera de catálogo: ack calmado, sin inventar ni dump wrong catalog.
 * node ./scripts/run-v994-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  buildLevel2Ack,
  buildLevel3Ack,
  buildGuardServiceAck,
  classifyServiceKnowledgeLevel,
  getServiceKnowledge,
  SERVICE_KNOWLEDGE_GOLDEN_RULE,
} from "../services/serviceKnowledge.js";
import { buildCatalogNotFoundAnswer } from "../services/catalogService.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.94");
assert.ok(/no está listado en el catálogo/i.test(SERVICE_KNOWLEDGE_GOLDEN_RULE));
assert.ok(/NO inventes|no inventes/i.test(SERVICE_KNOWLEDGE_GOLDEN_RULE));

{
  assert.equal(classifyServiceKnowledgeLevel("castillo inflable para fiesta"), 2);
  assert.equal(classifyServiceKnowledgeLevel("renta de letras gigantes"), 2);
  assert.equal(classifyServiceKnowledgeLevel("quiero seguro de auto"), 3);
}

{
  for (const label of ["castillo inflable", "letras gigantes", "Parrillada Argentina"]) {
    const ack = buildLevel2Ack(label);
    assert.match(ack, /no lo tengo listado en el cat[aá]logo/i, ack);
    assert.match(ack, /anoto/i, ack);
    assert.match(ack, /equipo/i, ack);
    assert.match(ack, /bodasesor\.com\/catalogos/i, ack);
    assert.match(ack, /anotado|otra opci[oó]n/i, ack);
    assert.ok(!/manejamos \*/i.test(ack), ack);
    assert.ok(!/mesas y sillas|periqueras/i.test(ack), ack);
    assert.ok(!/no lo hacemos|no te puedo ayudar/i.test(ack), ack);
  }
}

{
  const notFound = buildCatalogNotFoundAnswer("castillo inflable", "quiero castillo inflable");
  assert.match(notFound, /listado en el cat[aá]logo/i, notFound);
  assert.match(notFound, /castillo inflable/i, notFound);
}

{
  const guard = buildGuardServiceAck("necesito letras gigantes para XV");
  // Puede ser Level2 calmado (sin Sheet). Si parsea como algo con menú, no dump mobiliario.
  assert.ok(!/mesas-y-sillas|anoto \*mobiliario\*/i.test(guard), guard);
  if (/letras/i.test(guard)) {
    assert.match(guard, /listado|anoto|equipo|cat[aá]logo/i, guard);
  }
}

{
  const kn = getServiceKnowledge("renta de letras");
  assert.ok(kn);
  assert.equal(kn!.level, 2);
  assert.match(kn!.guardAck, /listado en el cat[aá]logo/i, kn!.guardAck);
  assert.match(kn!.promptBlock, /NIVEL 2/i, kn!.promptBlock);
  assert.match(kn!.promptBlock, /no lo tengo listado|NO inventes|NUNCA inventes/i, kn!.promptBlock);
}

{
  const l3 = buildLevel3Ack("seguro de auto");
  assert.match(l3, /solicitud especial/i, l3);
  assert.ok(!/listado en el cat[aá]logo/i.test(l3), l3);
}

console.log("V9.94 class smoke OK —", LUCY_PROMPT_VERSION);
