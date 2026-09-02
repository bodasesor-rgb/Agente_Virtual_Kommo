/**
 * Smoke A15620 Mara — promo CierreRapido: pedido mínimo ≠ invitados; hora de envío ≠ horario evento.
 * node ./scripts/run-a15620-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseHorarioFromText,
  parseInvitadosFromText,
  isPromoTemplateMessage,
  isPromoMinimumGuestLine,
  buildRichBriefAcknowledgment,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards, buildOpeningAcknowledgment } from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

const MARA_PROMO = [
  "Hola, escribo por la promo de cierre rápido (10% de descuento).",
  "Código: CierreRapido",
  "Pedido mínimo: 35 personas.",
  "Horario en que envío este mensaje: 28 ago 2026, 8:30 a.m. (hora Ciudad de México).",
  "Me gustaría cotizar un evento.",
].join("\n");

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
    forceFirstPresentation: true,
  });
}

assert.equal(LUCY_PROMPT_VERSION, "V9.68");

assert.ok(isPromoTemplateMessage(MARA_PROMO));
assert.ok(isPromoMinimumGuestLine("Pedido mínimo: 35 personas."));
assert.equal(parseInvitadosFromText(MARA_PROMO), null);
assert.equal(parseInvitadosFromText("Mínimo: 35 personas."), null);
assert.equal(parseHorarioFromText(MARA_PROMO), null);

const richAck = buildRichBriefAcknowledgment(MARA_PROMO);
assert.ok(!/35\s*personas/i.test(richAck), richAck);
assert.ok(/cotizaci[oó]n|evento/i.test(richAck), richAck);

const openingAck = buildOpeningAcknowledgment([], MARA_PROMO);
assert.ok(!/35\s*personas/i.test(openingAck), openingAck);
assert.ok(/cotizaci[oó]n|evento/i.test(openingAck), openingAck);

const promoReply = runGuards({
  aiResponse: "Con gusto, te ayudo con la cotización para tu evento de 35 personas.",
  extracted: emptyExtracted({ num_invitados: 35 }),
  filledSet: new Set(["Número de invitados"]),
  currentMessage: MARA_PROMO,
});
assert.equal(promoReply.match(/35\s*personas/gi)?.length ?? 0, 0, promoReply.slice(0, 500));
assert.ok(!/N[uú]mero de invitados/i.test(promoReply) || !/35/.test(promoReply), promoReply.slice(0, 500));

console.log("A15620 smoke OK —", LUCY_PROMPT_VERSION);
