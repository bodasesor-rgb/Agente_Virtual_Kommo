/**
 * Smoke V9.70 — clase A15727+: comida concreta (paninis/sandwich) no reabre menú vago;
 * no acortar nombre completo CRM.
 * node ./scripts/run-v968-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  isVagueFoodTerm,
  hasSpecificFoodService,
  parsePrimaryService,
  parseServicesFromText,
  isReferentialPriorAnswer,
} from "../conversation-understanding.js";
import {
  shouldUpdateName,
  pickBetterNombre,
  resolveKommoLeadNamePatch,
} from "../contact-name.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

function emptyExtracted(overrides: Partial<ExtractedData> = {}): ExtractedData {
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
    ...overrides,
  };
}

assert.equal(LUCY_PROMPT_VERSION, "V9.74");

// ── Parser: paninis / typos sandwich ──
const paniniMsg =
  "Estoy buscando solo alimentos. Queria algo sencillo como unos paninis o sanwichitos porque seria poner muchos!";
assert.ok(hasSpecificFoodService(paniniMsg), "hasSpecificFoodService paninis");
assert.ok(!isVagueFoodTerm(paniniMsg), "no vague with paninis");
assert.ok(/panini/i.test(parsePrimaryService(paniniMsg) || ""), parsePrimaryService(paniniMsg));
assert.ok(
  parseServicesFromText(paniniMsg).some((s) => /panini/i.test(s)),
  parseServicesFromText(paniniMsg).join(",")
);

assert.ok(isReferentialPriorAnswer("lo que mencione, algo como paninis"));
assert.ok(isReferentialPriorAnswer("esa seria la comida"));

// ── Guard: no loop "Para comida ¿qué te gustaría?" ──
{
  const filled = new Set<string>(["Nombre del cliente", "Tipo de evento"]);
  const extracted = emptyExtracted({
    nombre: "Daniela Loustaunau",
    tipo_evento: "aniversario",
  });
  const reply = applyLucyMessageGuards({
    aiResponse: "Con gusto. Claro. Para *comida* del evento, ¿qué te gustaría?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      { role: "assistant", content: "Excelente, Daniela. ¿Qué te gustaría revisar primero?" },
      {
        role: "user",
        content: paniniMsg,
      },
    ],
    currentMessage: paniniMsg,
    whatsappDisplayName: "Daniela Loustaunau",
    buildClosing: () => "Cierre",
    cierreYaEnviado: false,
  });
  assert.ok(/panini/i.test(reply), reply.slice(0, 500));
  assert.ok(!/Para \*?comida\*? del evento/i.test(reply), reply.slice(0, 500));
  assert.ok(/Barra de paninis|paninis/i.test(extracted.requerimientos_evento || ""), extracted.requerimientos_evento);
}

// Referencial tras menú vago: recupera paninis del historial
{
  const filled = new Set<string>(["Nombre del cliente", "Tipo de evento"]);
  const extracted = emptyExtracted({
    nombre: "Daniela",
    tipo_evento: "aniversario",
    requerimientos_evento: "Barra de paninis",
  });
  filled.add("Requerimientos o servicios");
  const reply = applyLucyMessageGuards({
    aiResponse: "Con gusto. Claro. Para *comida* del evento, ¿qué te gustaría?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      { role: "assistant", content: "Para *comida* del evento, ¿qué te gustaría?" },
      { role: "user", content: paniniMsg },
      { role: "assistant", content: "Para *comida* del evento, ¿qué te gustaría?" },
    ],
    currentMessage: "esa seria la comida",
    whatsappDisplayName: "Daniela",
    buildClosing: () => "Cierre",
    cierreYaEnviado: false,
  });
  assert.ok(!/Para \*?comida\*? del evento.*qu[eé] te gustar/i.test(reply), reply.slice(0, 500));
  assert.ok(/panini|ciudad|invitados|fecha|correo|ubicaci/i.test(reply), reply.slice(0, 500));
}

// Variantes pizza / sushi / crepas
for (const msg of [
  "Busco solo alimentos, algo como pizzas",
  "Quiero sushi para el evento",
  "Me late una barra de crepas",
]) {
  assert.ok(!isVagueFoodTerm(msg), msg);
  const filled = new Set<string>(["Nombre del cliente"]);
  const extracted = emptyExtracted({ nombre: "Ana" });
  const reply = applyLucyMessageGuards({
    aiResponse: "Para *comida* del evento, ¿qué te gustaría?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [{ role: "assistant", content: "¿Qué servicios necesitas?" }],
    currentMessage: msg,
    whatsappDisplayName: "Ana",
    buildClosing: () => "Cierre",
    cierreYaEnviado: false,
  });
  assert.ok(!/Para \*?comida\*? del evento/i.test(reply), `${msg} → ${reply.slice(0, 300)}`);
}

// ── Nombre: no acortar ──
assert.equal(shouldUpdateName("daniela loustaunau", "Daniela"), false);
assert.match(pickBetterNombre("Daniela", "daniela loustaunau") ?? "", /daniela\s+loustaunau/i);
assert.equal(resolveKommoLeadNamePatch("daniela loustaunau", "Daniela"), null);
assert.ok(!!resolveKommoLeadNamePatch("Daniela", "Daniela Loustaunau"));

console.log("V9.72 class smoke OK");
