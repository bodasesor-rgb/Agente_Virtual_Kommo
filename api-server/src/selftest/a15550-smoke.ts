/**
 * Smoke A15550 José — salón ya incluye mobiliario/vajilla/mesero + bufet.
 * node ./scripts/run-a15550-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseServicesFromText,
  buildRichBriefAcknowledgment,
} from "../conversation-understanding.js";
import {
  isVenueProvidesContext,
  venueProvidedServiceLabels,
  removeVenueProvidedFromRequirements,
  buildVenueProvidedAck,
} from "../services/serviceDecline.js";
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

function runGuards(opts: {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  currentMessage: string;
  history?: { role: string; content: string }[];
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: (opts.history ?? []) as never,
    currentMessage: opts.currentMessage,
    whatsappDisplayName: null,
    buildClosing: () => "Listo, el equipo arma tu cotización.",
    emailRefusedThisTurn: false,
  });
}

const brief =
  "cotización para una fiesta de cumpleaños el 3 de octubre con 50 personas, en un salón en Nezahualcóyotl, el salón suministra mesas, sillas, mantelería, platos, vasos y un mesero";

assert.equal(LUCY_PROMPT_VERSION, "V9.68");
assert.ok(isVenueProvidesContext(brief));
assert.deepEqual(venueProvidedServiceLabels(brief).sort(), ["Meseros", "Mobiliario", "Vajillas"].sort());

const parsed = parseServicesFromText(brief);
assert.ok(!parsed.some((s) => /mobiliario|meseros|vajillas/i.test(s)), parsed.join(", "));

const ack = buildRichBriefAcknowledgment(brief);
assert.ok(!/mobiliario|meseros|vajillas/i.test(ack), ack.slice(0, 400));

assert.ok(parseServicesFromText("me interesa el bufet").some((s) => /banquete/i.test(s)));

const correction =
  "Espera en la información que te envié escribí que ya hay mesas, sillas, mantelería, cubiertos y vasos";
assert.ok(isVenueProvidesContext(correction));
assert.equal(
  removeVenueProvidedFromRequirements("Mobiliario, Meseros, Vajillas", correction),
  null
);

const fixReply = runGuards({
  aiResponse: "Perfecto, veo que necesitas Vajillas y Mobiliario. Te cotizamos todo eso.",
  extracted: emptyExtracted({
    nombre: "José Angeles",
    tipo_evento: "cumpleaños",
    requerimientos_evento: "Mobiliario, Meseros",
    num_invitados: 50,
    fecha_evento: "3 de octubre",
    direccion_evento: "Nezahualcóyotl",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Número de invitados",
    "Fecha del evento",
    "Lugar/dirección del evento",
  ]),
  currentMessage: correction,
});
assert.ok(/sal[oó]n ya incluye/i.test(fixReply), fixReply.slice(0, 500));
assert.ok(!/necesitas.*vajillas|te cotizamos todo/i.test(fixReply), fixReply.slice(0, 500));

const bufetReply = runGuards({
  aiResponse: "• Mesas\n• Sillas\n• Periqueras",
  extracted: emptyExtracted({
    nombre: "José Angeles",
    tipo_evento: "cumpleaños",
    requerimientos_evento: "Mobiliario, Meseros",
    num_invitados: 50,
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Número de invitados",
  ]),
  currentMessage: "Soy José Angeles y se olvidó mencionar que me interesa el bufet",
  history: [{ role: "assistant", content: ack }],
});
assert.ok(/banquete|bufet|solo\s+alimentos|servicio\s+completo/i.test(bufetReply), bufetReply.slice(0, 500));
assert.ok(!/^•\s*Mesas/m.test(bufetReply), bufetReply.slice(0, 400));

assert.ok(buildVenueProvidedAck(brief).includes("salón ya incluye"));

console.log("A15550 smoke OK —", LUCY_PROMPT_VERSION);
