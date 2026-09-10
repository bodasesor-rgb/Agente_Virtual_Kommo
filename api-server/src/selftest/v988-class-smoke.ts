/**
 * Smoke V9.88 — A15941 Edgar: "10 octubre" debe guardarse completo (no solo "Octubre").
 * node ./scripts/run-v988-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseFechaFromText,
  isRicherFechaCapture,
  isMonthOnlyFecha,
  enrichExtractedFromConversation,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { mergeExtractedPatch } from "../services/lucyRedaction.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.88");

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
  assert.equal(parseFechaFromText("10 octubre"), "10 de octubre");
  assert.equal(parseFechaFromText("10 de octubre"), "10 de octubre");
  assert.equal(parseFechaFromText("el 10 octubre 2026"), "10 de octubre 2026");
  assert.equal(parseFechaFromText("10/10"), "10 de octubre");
  assert.ok(isMonthOnlyFecha("Octubre"));
  assert.ok(isRicherFechaCapture("10 de octubre", "Octubre"));
  assert.ok(!isRicherFechaCapture("Octubre", "10 de octubre"));
}

{
  const extracted = emptyExtracted({ fecha_evento: "Octubre" });
  enrichExtractedFromConversation(extracted, "10 octubre");
  assert.equal(extracted.fecha_evento, "10 de octubre");
}

{
  const target = emptyExtracted({ fecha_evento: "10 de octubre" });
  mergeExtractedPatch(target, { fecha_evento: "Octubre" });
  assert.equal(target.fecha_evento, "10 de octubre");
}

{
  const extracted = emptyExtracted({
    nombre: "Edgar",
    num_invitados: 100,
    fecha_evento: "Octubre",
  });
  const filled = new Set([
    "Nombre del cliente",
    "Número de invitados",
    "Fecha del evento",
  ]);
  const reply = applyLucyMessageGuards({
    aiResponse: "Perfecto. ¿A qué hora sería el evento?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      {
        role: "assistant",
        content: "¿Ya tienen fecha o todavía la van definiendo?",
      },
    ] as never,
    currentMessage: "10 octubre",
    whatsappDisplayName: "Edgar",
    buildClosing: () => "Perfecto, ya tengo todo.",
  });
  assert.equal(extracted.fecha_evento, "10 de octubre");
  assert.match(reply, /10 de octubre/i);
  assert.ok(!/\bAnoto la fecha:\s*\*Octubre\*/i.test(reply), reply.slice(0, 300));
}

console.log("V9.88 class smoke OK —", LUCY_PROMPT_VERSION);
