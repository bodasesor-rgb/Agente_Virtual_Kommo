/**
 * Smoke A16228 Erika — RFQ largo con nombre: Lucy SIEMPRE se presenta;
 * "¿con quién tengo el gusto?" responde identidad (también post-cierre).
 * node ./scripts/run-a16228-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  clientAsksLucyIdentity,
  buildLucyIdentityReply,
} from "../contact-name.js";
import { applyLucyMessageGuards, LUCY_INTRO } from "../lucy-flow-guards.js";
import { isRichQuoteBrief } from "../conversation-understanding.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.18");

assert.ok(clientAsksLucyIdentity("con quién tengo el gusto?"));
assert.ok(clientAsksLucyIdentity("¿Quién eres?"));
assert.ok(clientAsksLucyIdentity("con quien hablo"));
assert.ok(!clientAsksLucyIdentity("¿Es Cap&Bara?"));
assert.ok(/Lucy/i.test(buildLucyIdentityReply("Erika")));

const brief = `Hola, buen día.

Mi nombre es Erika Mancilla Morales y me pongo en contacto con ustedes porque actualmente estoy organizando el evento de fin de año de nuestra organización.

El evento se llevará a cabo en el SUM de la Alcaldía Álvaro Obregón, y estamos contemplando como posibles fechas el sábado 5 o sábado 19 de diciembre, aún por confirmar, con un horario aproximado de 14:00 horas.

Me gustaría solicitar información y cotización para los siguientes servicios:

Mobiliario
Vajilla, cristalería y cubiertos
Meseros
Mantelería
Centros de mesa
Refrescos
Menú de dos tiempos

Agradecería mucho si pudieran compartirnos sus paquetes disponibles, opciones de menú, costo por persona.

Erika Mancilla Morales
RRHH
Proyecto Comunitario Obregonense`;

assert.ok(isRichQuoteBrief(brief), "brief must count as rich RFQ");

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

const extracted = emptyExtracted({
  nombre: "Erika Mancilla Morales",
  tipo_evento: "evento corporativo",
  fecha_evento: "19 de diciembre",
  horario_evento: "14:00",
  direccion_evento: "Alcaldía Álvaro Obregón",
  requerimientos_evento: "Vajillas, Centros de mesa, Meseros, Mobiliario, Mantelería",
});
const filled = new Set([
  "Nombre del cliente",
  "Tipo de evento",
  "Fecha del evento",
  "Horario del evento",
  "Lugar/dirección del evento",
  "Requerimientos o servicios",
]);

const first = applyLucyMessageGuards({
  aiResponse:
    "De acuerdo, revisé tu solicitud para evento corporativo. Anoto Vajillas, Centros de mesa y Meseros.",
  extracted,
  filledSet: filled,
  history: [],
  currentMessage: brief,
  entityId: "A16228",
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  forceFirstPresentation: true,
  buildClosing: () => "CIERRE",
  whatsappDisplayName: "Erika Mancilla Morales",
});

assert.ok(
  /Soy Lucy,\s*agente virtual de Bodasesor/i.test(first) || /Soy Lucy/i.test(first),
  `first outbound must introduce Lucy: ${first.slice(0, 280)}`
);
assert.ok(first.includes("Lucy") || first.startsWith(LUCY_INTRO.slice(0, 20)), first.slice(0, 200));

const identity = applyLucyMessageGuards({
  aiResponse: "Como te comentaba, ya tengo todos los detalles…",
  extracted: emptyExtracted({
    nombre: "Erika Mancilla Morales",
    tipo_evento: "evento corporativo",
    correo: "erikamancillamorales@gmail.com",
    num_invitados: 135,
    requerimientos_evento: "Banquete Navideño, Vajillas, Meseros",
    fecha_evento: "19 de diciembre",
    horario_evento: "14:00 a 15:00hrs",
    direccion_evento: "Alcaldía Álvaro Obregón",
    presupuesto: "Sin definir (cliente indicó que no tiene)",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Correo electrónico",
    "Número de invitados",
    "Requerimientos o servicios",
    "Fecha del evento",
    "Horario del evento",
    "Lugar/dirección del evento",
    "Presupuesto (MXN)",
  ]),
  history: [
    { role: "user", content: brief },
    {
      role: "assistant",
      content:
        "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. Perfecto, Erika…",
    },
    { role: "user", content: "así esta bien... mil gracias" },
    {
      role: "assistant",
      content: "¡Con gusto! Nuestro equipo ya tiene tus datos para la cotización.",
    },
  ] as OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: "con quién tengo el gusto?",
  entityId: "A16228b",
  readyForClosing: true,
  cierreYaEnviado: true,
  emailRefusedThisTurn: false,
  forceFirstPresentation: false,
  buildClosing: () => "CIERRE",
  whatsappDisplayName: "Erika Mancilla Morales",
});

assert.ok(/Lucy/i.test(identity), identity);
assert.ok(/agente virtual/i.test(identity), identity);
assert.ok(!/ya tengo todos los detalles|como te comentaba/i.test(identity), identity);

console.log("a16228-smoke OK", LUCY_PROMPT_VERSION);
