/**
 * Smoke V9.70 — clase A15735+: cargo WA ≠ nombre; periqueras (no mesas/sillas);
 * 👆 = solo eso; cdmx + colonia.
 * node ./scripts/run-v969-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  isReferentialPriorAnswer,
  isPointingReferentialEmoji,
  clientDeclinesMoreServices,
  parseZonaFromText,
  stripNombrePresentationPrefix,
} from "../conversation-understanding.js";
import {
  isRoleOrDepartmentAsNombre,
  sanitizeCrmNombre,
  shouldUpdateName,
  rewriteJunkClientVocative,
} from "../contact-name.js";
import { parseMobiliarioPieceChoice } from "../services/serviceProgressiveOffer.js";
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

assert.equal(LUCY_PROMPT_VERSION, "V9.71");

// ── Cargo / área WA ≠ nombre ──
assert.ok(isRoleOrDepartmentAsNombre("Recepción"));
assert.ok(isRoleOrDepartmentAsNombre("Recepción OFM"));
assert.ok(isRoleOrDepartmentAsNombre("Hospitality"));
assert.equal(sanitizeCrmNombre("Recepción OFM"), null);
assert.equal(sanitizeCrmNombre("soy Bea"), "Bea");
assert.equal(sanitizeCrmNombre("que tal, soy Bea"), "Bea");
assert.equal(sanitizeCrmNombre("soy Bea, no recepción. 🙂"), "Bea");
assert.equal(stripNombrePresentationPrefix("soy Bea, no recepción"), "Bea");
assert.ok(shouldUpdateName("Recepción", "Bea"));
assert.match(
  rewriteJunkClientVocative("Perfecto, Recepción. Anoto carpas.", "Bea"),
  /Perfecto,\s*Bea/i
);

// ── Periqueras ≠ mesas/sillas genérico ──
assert.equal(parseMobiliarioPieceChoice("unas 15 mesas periqueras"), "periqueras");
{
  const filled = new Set<string>([
    "Nombre del cliente",
    "Tipo de evento",
    "Número de invitados",
    "Fecha del evento",
    "Horario del evento",
    "Lugar/dirección del evento",
    "Correo electrónico",
    "Requerimientos o servicios",
  ]);
  const extracted = emptyExtracted({
    nombre: "Bea",
    tipo_evento: "fiesta",
    num_invitados: 100,
    fecha_evento: "15 de septiembre",
    horario_evento: "6:30pm a 12am",
    direccion_evento: "cdmx, polanco",
    correo: "hospitality@orientalfilms.tv",
    requerimientos_evento: "Carpas (15x25)",
  });
  const reply = applyLucyMessageGuards({
    aiResponse: "¿Necesitan algún otro servicio?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      {
        role: "assistant",
        content: "Perfecto. Con el Carpas, ¿necesitan algún otro servicio?",
      },
    ],
    currentMessage: "busco mobiliario también, unas 15 mesas periqueras",
    whatsappDisplayName: "Recepción OFM",
    entityId: "A15735-peri",
  });
  assert.ok(/periqueras/i.test(reply), reply);
  assert.ok(!/\*mesas,\s*sillas\*/i.test(reply), reply);
}

// ── 👆 referencial / decline extras ──
assert.ok(isPointingReferentialEmoji("👆"));
assert.ok(isReferentialPriorAnswer("👆"));
assert.ok(clientDeclinesMoreServices("👆"));
{
  const filled = new Set<string>([
    "Nombre del cliente",
    "Tipo de evento",
    "Número de invitados",
    "Fecha del evento",
    "Horario del evento",
    "Lugar/dirección del evento",
    "Correo electrónico",
    "Requerimientos o servicios",
  ]);
  const extracted = emptyExtracted({
    nombre: "Bea",
    tipo_evento: "fiesta",
    num_invitados: 100,
    fecha_evento: "15 de septiembre",
    horario_evento: "6:30pm a 12am",
    direccion_evento: "cdmx, polanco",
    correo: "hospitality@orientalfilms.tv",
    requerimientos_evento: "Carpas",
  });
  const reply = applyLucyMessageGuards({
    aiResponse: "Queda anotado lo de Carpas.",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      {
        role: "assistant",
        content: "Perfecto. Con el Carpas, ¿necesitan algún otro servicio?",
      },
    ],
    currentMessage: "👆",
    whatsappDisplayName: "Bea",
    entityId: "A15735-point",
  });
  assert.ok(!/Queda anotado lo de Carpas/i.test(reply), reply);
}

// ── Zona: cdmx + polanco ──
const zona = parseZonaFromText("cdmx polanco");
assert.ok(zona && /cdmx/i.test(zona) && /polanco/i.test(zona), zona ?? "");

console.log("V9.71 class smoke OK");
