import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  applyLucyMessageGuards,
  detectEmailRefusal,
  buildStandardClosingMessage,
} from "../lucy-flow-guards.js";
import type { ExtractedData } from "../types.js";

function runGuards(opts: {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  readyForClosing: boolean;
  currentMessage?: string;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  emailRefusedThisTurn?: boolean;
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: opts.readyForClosing,
    cierreYaEnviado: false,
    emailRefusedThisTurn: opts.emailRefusedThisTurn ?? false,
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
  num_invitados: "80",
  presupuesto: "50000",
  tipo_contacto: "cliente",
  empresa: null,
  modo_servicio: null,
};

assert.ok(
  detectEmailRefusal([
    "No tengo correo ahorita, si tengo pero mi compu la mandé arreglar soy escritora",
  ]),
  "deferred email refusal"
);

const blockedClose = runGuards({
  aiResponse:
    "Perfecto, ya tengo todo. Le paso esta información al equipo para preparar la cotización.",
  extracted,
  filledSet: coreFilled,
  readyForClosing: true,
  currentMessage: "Cuál es el costo de la yucateca",
  history: [
    { role: "user", content: "Cuál es el costo de la yucateca" },
  ],
});
assert.ok(!/ya tengo todo/i.test(blockedClose), blockedClose.slice(0, 300));

const correoHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "assistant", content: "¿Me compartes tu correo para enviarte la propuesta?" },
  { role: "user", content: "Hola" },
  { role: "assistant", content: "¿Cuál es tu correo electrónico?" },
  { role: "user", content: "Aún no" },
  { role: "assistant", content: "¿Me das tu correo, por favor?" },
];

const filledNoEmail = new Set([...coreFilled]);
filledNoEmail.delete("Correo electrónico");

const afterMaxCorreo = runGuards({
  aiResponse: "¿Me compartes tu correo electrónico para la cotización?",
  extracted: { ...extracted, correo: null },
  filledSet: filledNoEmail,
  readyForClosing: false,
  currentMessage: "Somos 80 personas en CDMX",
  history: correoHistory,
});
assert.ok(!/correo|e-?mail/i.test(afterMaxCorreo) || /invitados|presupuesto|fecha/i.test(afterMaxCorreo), afterMaxCorreo);

console.log("reparaciones-premature-close smoke OK");
