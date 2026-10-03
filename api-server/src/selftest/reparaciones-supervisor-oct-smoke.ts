/**
 * Smoke — reparaciones supervisor (leads 27510744, 27519170, 27519466).
 * npx --yes tsx ./src/selftest/reparaciones-supervisor-oct-smoke.ts
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  applyLucyMessageGuards,
  buildStandardClosingMessage,
  clientAsksPaymentOrQuoteDelivery,
} from "../lucy-flow-guards.js";
import {
  looksLikeEventDescriptionNotTipoEvento,
  isUnusableTipoEventoReply,
  countLucyFieldAsks,
  isPresupuestoResuelto,
  isLucyOutgoingHistoryRole,
} from "../conversation-understanding.js";
import { applyCrmWriteInvariants } from "../lucyCrmInvariants.js";
import { runCrmFieldHeuristics } from "../services/lucyAuditorHeuristics.js";
import type { ExtractedData } from "../types.js";

function runGuards(opts: {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  readyForClosing: boolean;
  currentMessage?: string;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: new Set(opts.filledSet),
    readyForClosing: opts.readyForClosing,
    cierreYaEnviado: false,
    emailRefusedThisTurn: false,
    history: opts.history ?? [],
    currentMessage: opts.currentMessage,
    buildClosing: (svc, name) => buildStandardClosingMessage(svc, name),
  });
}

const coreFilled = new Set([
  "Nombre del cliente",
  "Correo electrónico",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Lugar/dirección del evento",
  "Fecha del evento",
  "Horario del evento",
  "Número de invitados",
  "Presupuesto (MXN)",
]);

const extracted: ExtractedData = {
  nombre: "Cliente",
  correo: "test@example.com",
  tipo_evento: "corporativo",
  requerimientos_evento: "Banquete Formal",
  direccion_evento: "CDMX",
  fecha_evento: "15 de octubre",
  horario_evento: "14:00",
  fecha_horario: null,
  num_invitados: 900,
  presupuesto: null,
  tipo_contacto: "cliente",
  empresa: null,
  telefono: null,
  modo_servicio: null,
};

// 27510744 — «cuándo me compartes la cotización» ≠ cierre «ya tengo todo».
const quoteWhen =
  "Mira a este cuando crees que me puedas compartir la cotizacion";
assert.ok(clientAsksPaymentOrQuoteDelivery(quoteWhen));
const noClose = runGuards({
  aiResponse: "Perfecto, ya tengo todo. Le paso esta información al equipo para preparar la cotización.",
  extracted,
  filledSet: coreFilled,
  readyForClosing: true,
  currentMessage: quoteWhen,
  history: [{ role: "user", content: quoteWhen }],
});
assert.ok(!/ya tengo todo/i.test(noClose), noClose.slice(0, 320));
assert.ok(/cotizaci[oó]n|equipo/i.test(noClose), noClose.slice(0, 320));

// 27519170 — descripción logística no es tipo de evento en CRM.
const logisticsTipo = "Un evento para aproximadamente 900 personas en un colegio";
assert.ok(looksLikeEventDescriptionNotTipoEvento(logisticsTipo));
assert.ok(isUnusableTipoEventoReply(logisticsTipo));
const inv = applyCrmWriteInvariants(
  { ...extracted, tipo_evento: logisticsTipo },
  [logisticsTipo]
);
assert.equal(inv.extracted.tipo_evento, null);
const crmBad = runCrmFieldHeuristics({ tipo_evento: logisticsTipo });
assert.ok(crmBad.some((f) => f.category === "bad_field"), JSON.stringify(crmBad));

// 27519466 — presupuesto repetido (role human) cuenta y deja de insistir.
assert.ok(isLucyOutgoingHistoryRole("human"));
const presHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "human", content: "¿Tienen algún rango de presupuesto en mente?" },
  { role: "user", content: "Ok" },
  { role: "human", content: "¿Manejan algún presupuesto estimado para el evento?" },
];
assert.equal(countLucyFieldAsks(presHistory, "presupuesto"), 2);
assert.ok(isPresupuestoResuelto(new Set(), [], presHistory));
const filledNoPres = new Set([
  "Nombre del cliente",
  "Correo electrónico",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Lugar/dirección del evento",
  "Fecha del evento",
  "Horario del evento",
  "Número de invitados",
]);
const loopReply = runGuards({
  aiResponse: "¿Tienen idea del presupuesto o prefieren que les propongamos opciones?",
  extracted: { ...extracted, presupuesto: null },
  filledSet: filledNoPres,
  readyForClosing: false,
  currentMessage: "gracias",
  history: presHistory,
});
assert.ok(!/presupuesto|rango|estimado|inversi/i.test(loopReply), loopReply.slice(0, 280));

console.log("reparaciones-supervisor-oct smoke OK");
