/**
 * Smoke V9.85 — A15918 Choa Lozano:
 * - RFQ genérico "qué incluye su servicio" ≠ dump Mixología/coctelería
 * - "Choa Lozano" ≠ Vajillas (loza⊂Lozano)
 * - "quiero loza" sí = Vajillas
 * - "No se sabe" pospone horario
 * node ./scripts/run-v985-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  applyLucyMessageGuards,
} from "../lucy-flow-guards.js";
import {
  clientDefersHorario,
  isTablewareRequestText,
  parseHorarioFromText,
} from "../conversation-understanding.js";
import { buildLucyInfoInclusionReply } from "../services/lucyInfoPriceCache.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.87");

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

const CHOICE_MSG =
  "Hola, muy buen día\nQuisiera apoyo con una cotización y saber exactamente que incluye su servicio";

// 1) Ancla PDF: genérico no rankea Mixología.
{
  const dump = buildLucyInfoInclusionReply(CHOICE_MSG);
  assert.equal(dump, null, "genérico no debe volcar PDF");
  assert.ok(
    buildLucyInfoInclusionReply("qué incluye mixología premium") ||
      buildLucyInfoInclusionReply("cocteles qué incluye"),
    "con ancla de coctelería sí puede responder"
  );
}

// 2) Guard: RFQ genérico → pregunta servicio, no Mixología.
{
  const extracted = emptyExtracted();
  const filled = new Set<string>();
  const reply = applyLucyMessageGuards({
    aiResponse: "Según el catálogo… Mixología Premium $35…",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [] as never,
    currentMessage: CHOICE_MSG,
    whatsappDisplayName: "Choa Lozano",
    buildClosing: () => "Perfecto, ya tengo todo.",
  });
  assert.match(reply, /qu[eé] te interesa cotizar/i);
  assert.ok(!/mixolog|c[oó]ctel|\$35/i.test(reply), reply.slice(0, 400));
}

// 3) Lozano ≠ loza; loza sí.
{
  assert.ok(!isTablewareRequestText("Choa Lozano"));
  assert.ok(!isTablewareRequestText("Lozano"));
  assert.ok(isTablewareRequestText("quiero loza"));
  assert.ok(isTablewareRequestText("vajillas para 30"));

  const extracted = emptyExtracted({
    tipo_evento: "baby shower",
  });
  const filled = new Set(["Tipo de evento"]);
  const reply = applyLucyMessageGuards({
    aiResponse: "¿Cuántos invitados?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      {
        role: "assistant",
        content: "¿Cuál es tu nombre?",
      },
    ] as never,
    currentMessage: "Choa Lozano",
    whatsappDisplayName: "Choa Lozano",
    buildClosing: () => "Perfecto, ya tengo todo.",
  });
  assert.ok(!/vajillas/i.test(reply), reply.slice(0, 400));
  assert.ok(
    !extracted.requerimientos_evento || !/vajilla/i.test(extracted.requerimientos_evento),
    String(extracted.requerimientos_evento)
  );
}

// 4) Horario deferral.
{
  assert.ok(clientDefersHorario("No se sabe"));
  assert.ok(clientDefersHorario("no sé"));
  assert.equal(parseHorarioFromText("No se sabe"), "Sin definir (pendiente)");

  const extracted = emptyExtracted({
    nombre: "Choa Lozano",
    tipo_evento: "baby shower",
    num_invitados: 30,
    fecha_evento: "17 de octubre 2026",
  });
  const filled = new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Número de invitados",
    "Fecha del evento",
  ]);
  const reply = applyLucyMessageGuards({
    aiResponse: "Perfecto, Choa. ¿En qué horario lo planean?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      { role: "assistant", content: "¿A qué hora sería el evento?" },
    ] as never,
    currentMessage: "No se sabe",
    whatsappDisplayName: "Choa Lozano",
    buildClosing: () => "Perfecto, ya tengo todo.",
  });
  assert.ok(
    !/\b(horario|hora)\b/i.test(reply) || /sin definir|pendiente|cuando lo tengas|más adelante/i.test(reply),
    reply.slice(0, 500)
  );
  // No debe re-preguntar el mismo horario de inmediato.
  assert.ok(!/¿A qué hora|¿En qué horario/i.test(reply), reply.slice(0, 500));
}

console.log("V9.85 class smoke OK —", LUCY_PROMPT_VERSION);
