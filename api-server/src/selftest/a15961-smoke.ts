/**
 * A15961 — mesa de dulces ≠ mesas y sillas; catálogo real; presupuesto una vez.
 * Aplica a todas las ramas (no solo este chat).
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  clientAsksTeamOptionsInsteadOfBudget,
  parseServicesFromText,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards, buildOpeningAcknowledgment } from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";
import { buildGuardServiceAck } from "../services/serviceKnowledge.js";
import {
  getCatalogWebUrlForQuery,
  resolveCatalogWebSlug,
} from "../services/catalogWebKnowledge.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.98");

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
    forceFirstPresentation: true,
    buildClosing: () => "CIERRE",
  });
}

console.log("A15961 smoke — mesa de dulces + catálogo + presupuesto\n");

for (const msg of [
  "mesa de dulces",
  "Mesa de Dulces para Eventos",
  "Hola, me interesa cotizar: Mesa de Dulces para Eventos",
  "Es una mesa de dulces por favor",
]) {
  const slug = resolveCatalogWebSlug(msg);
  assert.equal(slug, "mesa-de-dulces", msg);
  const url = getCatalogWebUrlForQuery(msg) ?? "";
  assert.match(url, /mesa-de-dulces/i, url);
  assert.ok(!/mesas-y-sillas/i.test(url), url);
  const services = parseServicesFromText(msg);
  assert.ok(services.includes("Mesa de dulces"), services.join(","));
  assert.ok(!services.includes("Mobiliario"), services.join(","));
}

const opening = buildOpeningAcknowledgment(
  [],
  "Hola, me interesa cotizar: Mesa de Dulces para Eventos"
);
assert.match(opening, /mesa de dulces/i, opening);
assert.match(opening, /mesa-de-dulces/i, opening);
assert.ok(!/renta de mesas y sillas/i.test(opening), opening);

const first = runGuards({
  aiResponse: "Vi tu solicitud de renta de mesas y sillas para el evento. ¿Me regalas tu nombre?",
  extracted: emptyExtracted(),
  filledSet: new Set(),
  currentMessage: "Hola, me interesa cotizar: Mesa de Dulces para Eventos",
});
assert.match(first, /mesa de dulces/i, first);
assert.match(first, /mesa-de-dulces/i, first);
assert.ok(!/renta de mesas y sillas/i.test(first), first);

const clarify = buildGuardServiceAck("Es una mesa de dulces por favor");
assert.ok(!/no lo tengo listado/i.test(clarify), clarify);
assert.match(clarify, /mesa-de-dulces/i, clarify);
assert.ok(!/mesas-y-sillas/i.test(clarify), clarify);

const falseNotListed = runGuards({
  aiResponse:
    "Perfecto — *Mesa de dulces* no lo tengo listado en el catálogo. Lo anoto y nuestro equipo confirma si lo podemos armar. Te dejo el catálogo general por si quieres ver otras opciones:\nhttps://bodasesor.com/catalogos ¿Lo dejamos anotado?",
  extracted: emptyExtracted({
    nombre: "Andrea Miranda",
    requerimientos_evento: "Mesa de dulces",
  }),
  filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
  currentMessage: "Es una mesa de dulces por favor",
  history: [
    { role: "user", content: "Hola, me interesa cotizar: Mesa de Dulces para Eventos" },
    { role: "assistant", content: "¡Hola! Soy Lucy. ¿Me regalas tu nombre?" },
  ],
});
assert.ok(!/no lo tengo listado/i.test(falseNotListed), falseNotListed);
assert.match(falseNotListed, /mesa-de-dulces/i, falseNotListed);

assert.ok(clientAsksTeamOptionsInsteadOfBudget("Opciones por favor"));

const optionsReply = runGuards({
  aiResponse:
    "Claro. Te comparto el enlace de nuestro catálogo de mesa de dulces:. Nuestro equipo revisará los detalles. ¿Manejan algún presupuesto estimado?",
  extracted: emptyExtracted({
    nombre: "Andrea Miranda",
    correo: "miranda.biologiafc@gmail.com",
    tipo_evento: "boda",
    requerimientos_evento: "Mesa de dulces",
    num_invitados: 130,
    direccion_evento: "Querétaro",
    fecha_evento: "28 de noviembre",
    horario_evento: "5 pm",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Correo electrónico",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Lugar/dirección del evento",
    "Fecha del evento",
    "Horario del evento",
    "Número de invitados",
  ]),
  currentMessage: "Opciones por favor",
  history: [
    {
      role: "assistant",
      content:
        "Gracias por tu correo, Andrea. ¿Tienes algún presupuesto estimado en mente o prefieres que nuestro equipo te presente una opción base?",
    },
  ],
});
assert.ok(!/presupuesto/i.test(optionsReply), optionsReply);
assert.match(optionsReply, /mesa-de-dulces/i, optionsReply);
assert.ok(!/catálogo de mesa de dulces:\s*\./i.test(optionsReply), optionsReply);

const hanging = runGuards({
  aiResponse: "Claro. Te comparto el enlace de nuestro catálogo de barra de pizzas:.",
  extracted: emptyExtracted({ requerimientos_evento: "Barra de pizzas" }),
  filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
  currentMessage: "Opciones por favor",
  history: [
    {
      role: "assistant",
      content: "¿Tienes algún presupuesto estimado en mente?",
    },
  ],
});
assert.match(hanging, /barra-de-pizzas/i, hanging);
assert.ok(!/presupuesto/i.test(hanging), hanging);

console.log("A15961 smoke OK —", LUCY_PROMPT_VERSION);
