/**
 * Smoke — repeat_reply (leads 27492132, 27488772…) y stuck_funnel correo (27518738, 27518768).
 *
 * npx --yes tsx ./src/selftest/reparaciones-repeat-stuck-smoke.ts
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  applyLucyMessageGuards,
  avoidRepeatPreviousReply,
  buildStandardClosingMessage,
} from "../lucy-flow-guards.js";
import { applyLucyGlobalAntiRepetition } from "../lucyOutboundAntiRepeat.js";
import { lucyTextOverlapRatio } from "../lucyOutboundAntiRepeat.js";
import { resolveClientEmailForFunnel } from "../conversation-understanding.js";
import type { ExtractedData } from "../types.js";

const previousReply =
  "¡Mucho gusto, Areli! Qué buena elección, la sala lounge blanca le da un toque muy limpio y elegante a cualquier espacio. " +
  "¿Qué tipo de evento vas a celebrar?";

const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "user", content: "Me interesa la sala lounge blanca" },
  { role: "assistant", content: previousReply },
  { role: "user", content: "Es para un cumpleaños" },
];

const nextDraft =
  "¡Mucho gusto, Areli! Qué buena elección, la sala lounge blanca le da un toque muy limpio y elegante a cualquier espacio. " +
  "¿Me cuentas qué tipo de evento vas a celebrar?";

const out = avoidRepeatPreviousReply(nextDraft, history);
assert.ok(lucyTextOverlapRatio(out, previousReply) < 0.75, out);
assert.ok(!/^¡?\s*mucho\s+gusto/i.test(out), out);

const anti = applyLucyGlobalAntiRepetition({
  mensaje: nextDraft,
  history,
  currentMessage: "Es para un cumpleaños",
  filledSet: new Set(["Nombre del cliente"]),
  extracted: { nombre: "Areli" },
});
assert.ok(lucyTextOverlapRatio(anti.mensaje, previousReply) < 0.75, anti.mensaje);

assert.equal(
  resolveClientEmailForFunnel(
    [
      { role: "assistant", content: "¿A qué correo te mando la propuesta?" },
      { role: "user", content: "maria.eventos@gmail.com" },
    ],
    "¿Y el banquete?"
  ),
  "maria.eventos@gmail.com"
);

assert.equal(
  resolveClientEmailForFunnel(
    [
      { role: "assistant", content: "¿Tu correo es *paola.eventos@gmail.com*?" },
      { role: "user", content: "Sí, correcto" },
    ],
    "Sí, correcto"
  ),
  "paola.eventos@gmail.com"
);

const extracted: ExtractedData = {
  nombre: "Lucía",
  correo: "lucia@test.com",
  tipo_evento: "boda",
  requerimientos_evento: "Banquete Formal",
  direccion_evento: "Mérida",
  fecha_evento: "20 de noviembre",
  horario_evento: "19:00",
  fecha_horario: null,
  num_invitados: 120,
  presupuesto: 80000,
  tipo_contacto: "cliente",
  empresa: null,
  telefono: null,
  modo_servicio: null,
  proveedor_oferta: null,
  proveedor_estado: null,
  proveedor_catalogo: null,
};

const filled = new Set([
  "Nombre del cliente",
  "Correo electrónico",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Lugar/dirección del evento",
  "Fecha del evento",
  "Horario del evento",
  "Número de invitados",
]);

const afterCorreo = applyLucyMessageGuards({
  aiResponse: "Perfecto. ¿A qué correo te envío la cotización?",
  extracted,
  filledSet: filled,
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history: [
    { role: "assistant", content: "¿A qué correo te mando la propuesta?" },
    { role: "user", content: "lucia@test.com" },
    { role: "user", content: "Somos 120 invitados" },
  ],
  currentMessage: "Somos 120 invitados",
  buildClosing: (svc, name) => buildStandardClosingMessage(svc, name),
});

assert.ok(!/correo|e-?mail/i.test(afterCorreo), afterCorreo);

console.log("reparaciones-repeat-stuck smoke OK");
