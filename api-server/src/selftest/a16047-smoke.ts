/**
 * Smoke A16047 Alan — Banquete vago + nombre no debe cortar el chat sin `?`.
 * node ./scripts/run-a16047-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  applyLucyMessageGuards,
  looksLikeDeadEndAck,
  isValidRequerimientosValue,
} from "../lucy-flow-guards.js";
import { hasSpecificFoodService } from "../conversation-understanding.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.07");

function emptyExtracted(partial: Partial<ExtractedData> = {}): ExtractedData {
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
    ...partial,
  };
}

assert.equal(isValidRequerimientosValue("Banquete"), false);
assert.equal(hasSpecificFoodService("Banquete"), false);
assert.ok(looksLikeDeadEndAck("¡Mucho gusto, Alan! Claro que sí."));
assert.ok(looksLikeDeadEndAck("¡Mucho gusto, Alan! De acuerdo."));
assert.equal(looksLikeDeadEndAck("¡Mucho gusto, Alan! ¿Cuántos invitados tienen?"), false);

const extracted = emptyExtracted({
  nombre: "Alan Olivares",
  direccion_evento: "Tlalpan, CDMX",
  requerimientos_evento: "Banquete",
  fecha_evento: "3 de octubre",
  tipo_evento: "boda",
});

const filled = new Set([
  "Nombre",
  "Tipo de evento",
  "Zona / Dirección",
  "Fecha",
  "Requerimientos o servicios",
]);

const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "assistant",
    content:
      "Perfecto. Anoto la ubicación en *Tlalpan, CDMX*. Seguimos con *Banquete* y lo demás que platicamos. ¿Cuál es tu nombre?",
  },
];

const out = applyLucyMessageGuards({
  aiResponse: "¡Mucho gusto, Alan! ¿Cuántos invitados?",
  extracted,
  filledSet: filled,
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history,
  currentMessage: "Alan Olivares",
  forceFirstPresentation: true,
  buildClosing: () => "CIERRE",
});

assert.match(out, /\?/, out);
assert.match(out, /mucho\s+gusto,\s*Alan/i, out);
assert.ok(
  /comida|formal|casual|banquete|invitad/i.test(out),
  `expected follow-up funnel, got: ${out}`
);
assert.ok(!/^¡?mucho\s+gusto,\s*Alan!\s*(claro\s+que\s+s[ií]|de\s+acuerdo)\.?\s*$/i.test(out.trim()), out);

console.log("A16047 smoke OK —", LUCY_PROMPT_VERSION);
