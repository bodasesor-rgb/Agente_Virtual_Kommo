/**
 * Smoke V9.88 — A15941: día+mes completo para CUALQUIER mes (no solo octubre).
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
  const months = [
    ["15 enero", "15 de enero"],
    ["3 febrero", "3 de febrero"],
    ["28 marzo", "28 de marzo"],
    ["1 abril", "1 de abril"],
    ["5 mayo", "5 de mayo"],
    ["12 junio", "12 de junio"],
    ["20 julio", "20 de julio"],
    ["8 agosto", "8 de agosto"],
    ["30 septiembre", "30 de septiembre"],
    ["10 octubre", "10 de octubre"],
    ["9 noviembre", "9 de noviembre"],
    ["22 diciembre", "22 de diciembre"],
  ] as const;
  for (const [raw, expected] of months) {
    assert.equal(parseFechaFromText(raw), expected, raw);
  }
  assert.equal(parseFechaFromText("10 de octubre"), "10 de octubre");
  assert.equal(parseFechaFromText("el 10 octubre 2026"), "10 de octubre 2026");
  assert.equal(parseFechaFromText("el 3 enero 2027"), "3 de enero 2027");
  assert.equal(parseFechaFromText("10/10"), "10 de octubre");
  assert.equal(parseFechaFromText("12/03"), "12 de marzo");
  assert.equal(parseFechaFromText("1-8-2026"), "1 de agosto 2026");
  for (const m of [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ]) {
    assert.ok(isMonthOnlyFecha(m), m);
  }
  assert.ok(isRicherFechaCapture("15 de marzo", "Marzo"));
  assert.ok(isRicherFechaCapture("10 de octubre", "Octubre"));
  assert.ok(!isRicherFechaCapture("Marzo", "15 de marzo"));
  assert.ok(!isRicherFechaCapture("Octubre", "10 de octubre"));
}

{
  const extracted = emptyExtracted({ fecha_evento: "Octubre" });
  enrichExtractedFromConversation(extracted, "10 octubre");
  assert.equal(extracted.fecha_evento, "10 de octubre");
}

{
  const extracted = emptyExtracted({ fecha_evento: "Marzo" });
  enrichExtractedFromConversation(extracted, "15 marzo");
  assert.equal(extracted.fecha_evento, "15 de marzo");
}

{
  const extracted = emptyExtracted({ fecha_evento: "Mayo" });
  enrichExtractedFromConversation(extracted, "5 mayo");
  assert.equal(extracted.fecha_evento, "5 de mayo");
}

{
  const target = emptyExtracted({ fecha_evento: "10 de octubre" });
  mergeExtractedPatch(target, { fecha_evento: "Octubre" });
  assert.equal(target.fecha_evento, "10 de octubre");
}

{
  const target = emptyExtracted({ fecha_evento: "28 de marzo" });
  mergeExtractedPatch(target, { fecha_evento: "Marzo" });
  assert.equal(target.fecha_evento, "28 de marzo");
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

{
  const extracted = emptyExtracted({
    nombre: "Ana",
    num_invitados: 80,
    fecha_evento: "Marzo",
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
    currentMessage: "28 marzo",
    whatsappDisplayName: "Ana",
    buildClosing: () => "Perfecto, ya tengo todo.",
  });
  assert.equal(extracted.fecha_evento, "28 de marzo");
  assert.match(reply, /28 de marzo/i);
  assert.ok(!/\bAnoto la fecha:\s*\*Marzo\*/i.test(reply), reply.slice(0, 300));
}

console.log("V9.88 class smoke OK —", LUCY_PROMPT_VERSION);
