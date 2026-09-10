/**
 * A15956 — Verónica: entelado para techo ≠ mobiliario / mesas / periqueras.
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  isEnteladoRequestText,
  parseServicesFromText,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import type { ExtractedData } from "../types.js";
import { buildGuardServiceAck } from "../services/serviceKnowledge.js";
import {
  resolveDetailQueryForFamily,
  shouldOfferOptionsBeforeDetail,
} from "../services/serviceProgressiveOffer.js";
import {
  getCatalogWebUrlForQuery,
  resolveCatalogWebSlug,
} from "../services/catalogWebKnowledge.js";

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

function runGuards(opts: {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  currentMessage?: string;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  whatsappDisplayName?: string | null;
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: false,
    cierreYaEnviado: false,
    emailRefusedThisTurn: false,
    history: opts.history ?? [],
    currentMessage: opts.currentMessage,
    whatsappDisplayName: opts.whatsappDisplayName,
    forceFirstPresentation: true,
    buildClosing: () => "CIERRE",
  });
}

console.log("A15956 smoke — entelado ≠ mobiliario\n");

for (const msg of [
  "entelado",
  "entelados",
  "entelado para techo",
  "me interesa cotizar un entelado para techo para mi evento",
  "tela para techo",
]) {
  assert.ok(isEnteladoRequestText(msg), msg);
  const services = parseServicesFromText(msg);
  assert.ok(services.includes("Entelados para Techo"), `${msg} → ${services.join(",")}`);
  assert.ok(!services.includes("Mobiliario"), `${msg} no Mobiliario: ${services.join(",")}`);
  assert.equal(resolveDetailQueryForFamily("mobiliario", msg), "Entelados para Techo", msg);
  assert.equal(
    shouldOfferOptionsBeforeDetail({ currentMessage: msg, history: [] }),
    null,
    msg
  );
}

const ack = buildGuardServiceAck(
  "Hola, me interesa cotizar un entelado para techo para mi evento"
);
assert.ok(/Entelados para Techo/i.test(ack), ack);
assert.ok(/entelados-para-techo|entelado/i.test(ack), ack);
assert.ok(!/mesas y sillas|periqueras|¿Qué es lo que buscas/i.test(ack), ack);

assert.equal(resolveCatalogWebSlug("entelado para techo"), "entelados-para-techo");
assert.ok(/entelados-para-techo/i.test(getCatalogWebUrlForQuery("entelado") ?? ""));

const early = runGuards({
  aiResponse:
    "Perfecto — anoto *mobiliario* para tu cotización.\n¿Te gustaría *mesas y sillas*, *periqueras*, o ambas?\n• *Mesas y sillas*: https://bodasesor.com/catalogos/mesas-y-sillas\n• *Periqueras / salas*: https://bodasesor.com/catalogos/salas-y-periqueras",
  extracted: emptyExtracted({ nombre: "Verónica" }),
  filledSet: new Set(["Nombre del cliente"]),
  currentMessage: "Hola, me interesa cotizar un entelado para techo para mi evento",
  whatsappDisplayName: "Verónica",
});
assert.ok(/Entelados para Techo/i.test(early), early.slice(0, 500));
assert.ok(!/anoto \*mobiliario\*/i.test(early), early.slice(0, 500));
assert.ok(!/mesas-y-sillas/i.test(early), early.slice(0, 500));
assert.ok(!/salas-y-periqueras/i.test(early), early.slice(0, 500));

const afterMedidas = runGuards({
  aiResponse:
    "Perfecto, Verónica. Perfecto — anoto *mobiliario* para tu cotización.\n¿Te gustaría *mesas y sillas*, *periqueras*, o ambas?",
  extracted: emptyExtracted({
    nombre: "Verónica",
    requerimientos_evento: "Entelados para Techo",
  }),
  filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
  currentMessage: "Estas son las medidas",
  whatsappDisplayName: "Verónica",
  history: [
    {
      role: "user",
      content: "Hola, me interesa cotizar un entelado para techo para mi evento",
    },
    {
      role: "assistant",
      content: "¡Hola! Buen día. Soy Lucy. ¿Me regalas tu nombre?",
    },
  ],
});
assert.ok(/Entelados para Techo|entelado/i.test(afterMedidas), afterMedidas.slice(0, 500));
assert.ok(!/anoto \*mobiliario\*/i.test(afterMedidas), afterMedidas.slice(0, 500));
assert.ok(
  !/mesas y sillas.*periqueras|periqueras.*ambas/i.test(afterMedidas),
  afterMedidas.slice(0, 500)
);

console.log("OK — A15956 smoke passed");
console.log("\nEjemplo respuesta corregida:\n");
console.log(early.slice(0, 600));
