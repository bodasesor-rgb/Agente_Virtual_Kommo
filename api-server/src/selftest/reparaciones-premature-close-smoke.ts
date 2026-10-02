/**
 * Smoke — reparaciones premature_close + stuck_funnel (correo).
 * Ramas Cursor 2026-09-30 / 2026-10-02 (revisadas): no cerrar «ya tengo todo» si el
 * cliente pide precio EN ESTE mensaje; sí cerrar si el precio se pidió turnos atrás
 * (si no, Lucy repetiría el precio en bucle). Tras CORREO_MAX_ASKS no re-pedir correo.
 *
 * npx --yes tsx ./src/selftest/reparaciones-premature-close-smoke.ts
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  applyLucyMessageGuards,
  buildStandardClosingMessage,
  detectEmailRefusal,
} from "../lucy-flow-guards.js";
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
  nombre: "Rafaela",
  correo: "test@example.com",
  tipo_evento: "corporativo",
  requerimientos_evento: "Banquete Formal",
  direccion_evento: "CDMX",
  fecha_evento: "15 de octubre",
  horario_evento: "14:00",
  fecha_horario: null,
  num_invitados: 80,
  presupuesto: 50000,
  tipo_contacto: "cliente",
  empresa: null,
  telefono: null,
  modo_servicio: null,
};

assert.ok(detectEmailRefusal(["Ahorita no tengo correo, mi compu está en reparación"]), "correo diferido");

// Pide precio en este mensaje → no cerrar con «ya tengo todo».
const blocked = runGuards({
  aiResponse: "Perfecto, ya tengo todo. Le paso esta información al equipo para preparar la cotización.",
  extracted,
  filledSet: coreFilled,
  readyForClosing: true,
  currentMessage: "Cuál es el costo de la yucateca",
  history: [{ role: "user", content: "Cuál es el costo de la yucateca" }],
});
assert.ok(!/ya tengo todo/i.test(blocked), blocked.slice(0, 300));

// Precio pedido turnos atrás y ya contestado; ahora solo da el último dato → sí cierra.
const closing = buildStandardClosingMessage(extracted.requerimientos_evento, extracted.nombre);
const closes = runGuards({
  aiResponse: "Gracias, Rafaela.",
  extracted,
  filledSet: coreFilled,
  readyForClosing: true,
  currentMessage: "test@example.com",
  history: [
    { role: "user", content: "¿Cuánto cuesta el banquete formal?" },
    { role: "assistant", content: "El Banquete Formal va desde $450 por persona. ¿A qué correo te mando la propuesta?" },
    { role: "user", content: "test@example.com" },
  ],
});
assert.equal(closes, closing, `debe cerrar, no repetir el precio: ${closes.slice(0, 200)}`);

// Correo pedido CORREO_MAX_ASKS veces sin respuesta → el borrador que lo vuelve a pedir pasa al siguiente dato.
const filledNoEmail = new Set([...coreFilled]);
filledNoEmail.delete("Correo electrónico");
filledNoEmail.delete("Número de invitados");
const afterMax = runGuards({
  aiResponse: "Perfecto, CDMX. ¿Me compartes tu correo electrónico para la cotización?",
  extracted: { ...extracted, correo: null, num_invitados: null },
  filledSet: filledNoEmail,
  readyForClosing: false,
  currentMessage: "Es en CDMX",
  history: [
    { role: "assistant", content: "¿Me compartes tu correo para enviarte la propuesta?" },
    { role: "user", content: "Hola" },
    { role: "assistant", content: "¿Cuál es tu correo electrónico?" },
    { role: "user", content: "Aún no" },
  ],
});
assert.ok(!/correo|e-?mail/i.test(afterMax), afterMax);
assert.match(afterMax, /\?/, afterMax);

// Sin correo ahora (compu en reparación) → waiver, no cierre «ya tengo todo» con embudo incompleto.
const noEmailFilled = new Set([...coreFilled]);
noEmailFilled.delete("Correo electrónico");
noEmailFilled.delete("Presupuesto (MXN)");
const rafaelaMsg =
  "No tengo correo ahorita ,si tengo pero mi compu la mandé arreglar soy escritora me llamo Rafaela de";
assert.ok(detectEmailRefusal([rafaelaMsg]));
const noEmailClose = runGuards({
  aiResponse: "Perfecto, ya tengo todo. Le paso esta información al equipo para preparar la cotización.",
  extracted: { ...extracted, correo: null, presupuesto: null },
  filledSet: noEmailFilled,
  readyForClosing: false,
  currentMessage: rafaelaMsg,
});
assert.ok(!/ya tengo todo/i.test(noEmailClose), noEmailClose.slice(0, 300));
assert.ok(
  noEmailClose.includes("?") || noEmailClose.toLowerCase().includes("whatsapp"),
  noEmailClose
);

// Pide asesor + cotización con datos incompletos → embudo, no cierre.
const partialFilled = new Set(["Nombre del cliente", "Requerimientos o servicios"]);
const advisorQuote = runGuards({
  aiResponse: "Perfecto, ya tengo todo. Nuestro equipo preparará una cotización personalizada.",
  extracted: {
    ...extracted,
    correo: null,
    tipo_evento: null,
    fecha_evento: null,
    horario_evento: null,
    num_invitados: null,
    presupuesto: null,
    direccion_evento: null,
  },
  filledSet: partialFilled,
  readyForClosing: false,
  currentMessage: "Quiero un asesor que me envíe la cotización por favor",
});
assert.ok(!/ya tengo todo/i.test(advisorQuote), advisorQuote.slice(0, 300));
assert.ok(
  /\?/.test(advisorQuote) || /asesor|equipo|0373/i.test(advisorQuote),
  advisorQuote.slice(0, 200)
);

console.log("reparaciones-premature-close smoke OK");
