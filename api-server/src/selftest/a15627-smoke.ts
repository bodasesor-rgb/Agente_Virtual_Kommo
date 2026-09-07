/**
 * Smoke A15627 Erika — sin dump de precios, "a la 1", cotización ≠ catálogo.
 * node ./scripts/run-a15627-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseHorarioFromText,
  isUsableHorarioEvento,
  isSimpleClockTime,
  clientAsksForCatalog,
  clientWantsQuoteDelivery,
} from "../conversation-understanding.js";
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
    buildClosing: () =>
      "Perfecto, ya tengo todo. Quedó anotado *Paletas de Hielo y Helados*. Le paso estos datos a nuestro equipo para que te arme una cotización personalizada.",
    emailRefusedThisTurn: false,
  });
}

assert.equal(LUCY_PROMPT_VERSION, "V9.72");

assert.ok(isSimpleClockTime("A la 1"));
assert.ok(isSimpleClockTime("alrededor de la 1"));
const h1 = parseHorarioFromText("A la 1");
assert.ok(h1 && isUsableHorarioEvento(h1), h1 ?? "null");
const hAround = parseHorarioFromText(
  "Alrededor de la 1, pero, apenas te confirme la orden, te daría todos los detalles por favor"
);
assert.ok(hAround && /1/.test(hAround), hAround ?? "null");
assert.ok(isUsableHorarioEvento(hAround!));

assert.equal(clientAsksForCatalog("Si, mándame la cotización por favor, y te confirmo todo"), false);
assert.ok(clientWantsQuoteDelivery("Si, mándame la cotización por favor, y te confirmo todo"));

const dumpReply = runGuards({
  aiResponse:
    "Perfecto, Erika. Según el catálogo que ya tenemos de *Paletas de hielo y helados*: 00 100 PZAS $330.00 NO INCLUYE ENVÍO HELADO POR LITRO DESDE $330.00",
  extracted: emptyExtracted({
    nombre: "Erika Biz",
    requerimientos_evento: "Paletas de Hielo y Helados",
    fecha_evento: "7 y 8 de septiembre",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Fecha del evento",
  ]),
  currentMessage:
    "Erika Biz, buen día\nNecesito cotizar el servicio de un carrito con paletas heladas por favor, para el 7 y 8 de septiembre",
  history: [{ role: "assistant", content: "¿Me regalas tu nombre?" }],
});
assert.ok(!/\$\s*\d/.test(dumpReply), dumpReply.slice(0, 500));
assert.ok(!/\bPZAS\b/i.test(dumpReply), dumpReply.slice(0, 500));
assert.ok(!/NO INCLUYE ENV[IÍ]O/i.test(dumpReply), dumpReply.slice(0, 500));

const horarioReply = runGuards({
  aiResponse: "¿En qué horario lo planean?",
  extracted: emptyExtracted({
    nombre: "Erika Biz",
    requerimientos_evento: "Paletas de Hielo y Helados",
    fecha_evento: "7 y 8 de septiembre",
    correo: "erikabizpaier@yahoo.com.mx",
    direccion_evento: "Valle de Bravo",
    tipo_evento: "expo",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Fecha del evento",
    "Correo electrónico",
    "Lugar/dirección del evento",
    "Tipo de evento",
  ]),
  currentMessage: "A la 1",
  history: [{ role: "assistant", content: "¿En qué horario lo planean?" }],
});
assert.ok(
  !/horario lo planean|a qu[eé] hora ser[ií]a|Sigo aqu[ií]|confirmas ese dato/i.test(horarioReply),
  horarioReply.slice(0, 500)
);
assert.ok(/1|horario|presupuesto|cotizaci|equipo/i.test(horarioReply), horarioReply.slice(0, 500));

const quoteReply = runGuards({
  aiResponse: "Te dejo el *catálogo*:\nhttps://bodasesor.com/catalogos",
  extracted: emptyExtracted({
    nombre: "Erika Biz",
    requerimientos_evento: "Paletas de Hielo y Helados",
    fecha_evento: "7 y 8 de septiembre",
    horario_evento: "a la 1",
    correo: "erikabizpaier@yahoo.com.mx",
    direccion_evento: "Valle de Bravo",
    tipo_evento: "expo",
    num_invitados: 65,
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Fecha del evento",
    "Horario del evento",
    "Correo electrónico",
    "Lugar/dirección del evento",
    "Tipo de evento",
    "Número de invitados",
  ]),
  currentMessage: "Si, mándame la cotización por favor, y te confirmo todo",
});
assert.ok(!/bodasesor\.com\/catalogos/i.test(quoteReply), quoteReply.slice(0, 500));
assert.ok(/equipo|cotizaci|ya tengo todo|anotad/i.test(quoteReply), quoteReply.slice(0, 500));

console.log("A15627 smoke OK —", LUCY_PROMPT_VERSION);
