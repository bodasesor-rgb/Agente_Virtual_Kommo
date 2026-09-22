/**
 * Smoke A16097 Ana — links: texto antes de URL; mesas-y-sillas no hub; sin URL+CTA misma línea al inicio.
 * node ./scripts/run-a16097-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  applyLucyMessageGuards,
  preferSpecificCatalogOverHub,
  reorderLeadingCatalogUrls,
} from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.16");

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

const leading =
  "https://bodasesor.com/catalogos ¿Quieres que te mande el catálogo con más detalle? ¿Qué tipo de evento es?";
const reordered = reorderLeadingCatalogUrls(leading);
assert.ok(!/^https?:\/\//i.test(reordered.trim()), reordered);
assert.ok(/tipo de evento/i.test(reordered), reordered);
assert.ok(/bodasesor\.com\/catalogos/i.test(reordered), reordered);

const preferred = preferSpecificCatalogOverHub(
  "https://bodasesor.com/catalogos ¿Quieres que te mande el catálogo?",
  "60 sillas Tiffany y 6 mesas redondas"
);
assert.ok(/mesas-y-sillas/i.test(preferred), preferred);
assert.ok(!/bodasesor\.com\/catalogos\/?(?=\s|$|\?)/i.test(preferred), preferred);

const extracted = emptyExtracted({
  nombre: "Ana",
  requerimientos_evento: "Mobiliario",
});
const filled = new Set(["Nombre del cliente", "Requerimientos o servicios"]);
const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "user",
    content: "Hola, me interesa cotizar: Renta de Mesas y Sillas para Eventos",
  },
  {
    role: "assistant",
    content:
      "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. Vi tu solicitud de renta de mesas y sillas. ¿Me regalas tu nombre?",
  },
  { role: "user", content: "Ana" },
  {
    role: "assistant",
    content:
      "Perfecto, Ana. ¿Te gustaría *mesas y sillas*, *periqueras*, o ambas?\n• *Mesas y sillas*: https://bodasesor.com/catalogos/mesas-y-sillas",
  },
];

const out = applyLucyMessageGuards({
  aiResponse: leading,
  extracted,
  filledSet: filled,
  history,
  currentMessage: "60 sillas Tiffany y 6 mesas redondas",
  entityId: "A16097",
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  forceFirstPresentation: false,
  buildClosing: () => "CIERRE",
  whatsappDisplayName: "Ana",
});

assert.ok(!/^https?:\/\//i.test(out.trim()), out);
assert.ok(/mesas-y-sillas|sillas|mesas|Tiffany|anoto/i.test(out), out);
assert.ok(!/^https:\/\/bodasesor\.com\/catalogos\s/i.test(out), out);
// No hub genérico solo (sin slug) al inicio ni como único link.
const hubBare = out.match(/https?:\/\/(?:www\.)?bodasesor\.com\/catalogos\/?(?=\s|$|\?)/gi) ?? [];
assert.equal(hubBare.length, 0, `hub residual: ${out}`);

console.log("a16097-smoke OK", LUCY_PROMPT_VERSION);
