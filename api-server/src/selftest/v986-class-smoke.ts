/**
 * Smoke V9.86 — A15935 Fernanda Roldán:
 * - "Solo es el banquete" → menú Formal/Mexicano (conversa)
 * - NO pegar URL de banquete-formal suelta
 * - bare "banquete" ≠ Banquete Formal en el parser
 * node ./scripts/run-v986-class-smoke.mjs
 */
import assert from "node:assert/strict";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { parseServicesFromText } from "../conversation-understanding.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.86");

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

{
  const bare = parseServicesFromText("Solo es el banquete");
  assert.ok(bare.includes("Banquete"), String(bare));
  assert.ok(!bare.includes("Banquete Formal"), String(bare));
  assert.ok(parseServicesFromText("banquete formal").includes("Banquete Formal"));
  assert.ok(!parseServicesFromText("banquete formal").includes("Banquete"));
}

{
  const extracted = emptyExtracted({
    nombre: "Fernanda Roldán",
    tipo_evento: "evento corporativo de integración",
  });
  const filled = new Set(["Nombre del cliente", "Tipo de evento"]);
  const reply = applyLucyMessageGuards({
    aiResponse:
      "https://bodasesor.com/catalogos/banquete-formal Con gusto. ¿Tienen un estimado de invitados? Si aún no, un rango sirve.",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      {
        role: "assistant",
        content:
          "Excelente. Para este tipo de eventos corporativos podemos apoyarte con banquetes formales o mexicanos, barras de bebidas, mobiliario, pistas, audio e iluminación, entre otros. ¿Qué te gustaría revisar primero para tu integración?",
      },
    ] as never,
    currentMessage: "Solo es el banquete",
    whatsappDisplayName: "Fernanda Roldán",
    buildClosing: () => "Perfecto, ya tengo todo.",
  });
  assert.ok(!/bodasesor\.com\/catalogos/i.test(reply), reply.slice(0, 500));
  assert.match(reply, /formal/i);
  assert.match(reply, /mexicano/i);
  assert.ok(!/Anoto \*Banquete Formal\*/i.test(reply), reply.slice(0, 400));
}

console.log("V9.86 class smoke OK —", LUCY_PROMPT_VERSION);
