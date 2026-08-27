/**
 * Smoke A15581 Mariana César — horario en palabras, dos propuestas, DJ inclusión/acotado.
 * node ./scripts/run-a15581-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseHorarioFromText,
  isUsableHorarioEvento,
  clientRequestsDualProposals,
  clientScopesServiceToProposalOption,
  clientAsksHorarioExactitud,
  clientAsksDjClarification,
} from "../conversation-understanding.js";
import { clientAsksInclusion } from "../services/catalogService.js";
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

assert.equal(LUCY_PROMPT_VERSION, "V9.59");

const horarioCuatro = parseHorarioFromText("Sería temprano, a partir de las cuatro");
assert.ok(horarioCuatro && /4|cuatro/i.test(horarioCuatro), horarioCuatro ?? "null");
assert.ok(isUsableHorarioEvento(horarioCuatro!), horarioCuatro ?? "null");

assert.ok(
  clientRequestsDualProposals(
    "dos propuestas: la del banquete formal y otra casual, por favor"
  )
);
assert.equal(clientScopesServiceToProposalOption("solo lo agregara en la opción más casual"), "casual");
assert.ok(clientAsksHorarioExactitud("¿Requiere una hora exacta?"));
assert.ok(clientAsksDjClarification("¿De algún DJ?"));
assert.ok(
  clientAsksInclusion("Vi en su página que hay la opción de DJ ¿qué es lo que incluiría?")
);

const baseFilled = new Set([
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Número de invitados",
  "Fecha del evento",
]);
const baseExtracted = emptyExtracted({
  nombre: "Mariana César",
  tipo_evento: "evento corporativo",
  requerimientos_evento: "Banquete Formal, Mobiliario",
  num_invitados: 15,
  fecha_evento: "4 de diciembre",
  direccion_evento: "colonia Claveria",
});

const dualReply = runGuards({
  aiResponse: "¿A qué hora sería el evento?",
  extracted: { ...baseExtracted },
  filledSet: new Set(baseFilled),
  currentMessage:
    "Pienso que sería bueno para nosotros que nos apoye con dos propuestas: la del banquete que suena más adoc para el evento y otra casual, por favor",
});
assert.ok(/dos propuestas|formal.*casual/i.test(dualReply), dualReply.slice(0, 500));
assert.ok(!/la anoto para tu cotizaci/i.test(dualReply), dualReply.slice(0, 500));

const horarioReply = runGuards({
  aiResponse: "¿En qué horario lo planean?",
  extracted: { ...baseExtracted },
  filledSet: new Set(baseFilled),
  currentMessage: "Sería temprano, a partir de las cuatro",
  history: [{ role: "assistant", content: "¿A qué hora sería el evento?" }],
});
assert.ok(!/horario lo planean|a qu[eé] hora ser[ií]a/i.test(horarioReply), horarioReply.slice(0, 500));
assert.ok(/4|partir|horario|presupuesto/i.test(horarioReply), horarioReply.slice(0, 500));

const exactitudReply = runGuards({
  aiResponse: "¿En qué horario lo planean?",
  extracted: { ...baseExtracted },
  filledSet: new Set(baseFilled),
  currentMessage: "¿Requiere una hora exacta?",
  history: [
    { role: "assistant", content: "¿En qué horario lo planean?" },
    { role: "user", content: "Sería temprano, a partir de las cuatro" },
  ],
});
assert.ok(/suficiente|log[ií]stica/i.test(exactitudReply), exactitudReply.slice(0, 500));
assert.ok(!/horario lo planean|a qu[eé] hora ser[ií]a/i.test(exactitudReply), exactitudReply.slice(0, 500));

const djInclusionReply = runGuards({
  aiResponse: "¡Claro! *DJ* la anoto para tu cotización.",
  extracted: { ...baseExtracted, horario_evento: "a partir de las 4" },
  filledSet: new Set([...baseFilled, "Horario del evento"]),
  currentMessage: "Vi en su página que hay la opción de DJ ¿qué es lo que incluiría?",
  history: [{ role: "assistant", content: "¿En qué horario lo planean?" }],
});
assert.ok(/equipo|micr[oó]fono|iluminaci/i.test(djInclusionReply), djInclusionReply.slice(0, 500));
assert.ok(!/la anoto para tu cotizaci/i.test(djInclusionReply), djInclusionReply.slice(0, 500));
assert.ok(!/a qu[eé] hora ser[ií]a/i.test(djInclusionReply), djInclusionReply.slice(0, 500));

const scopedDjReply = runGuards({
  aiResponse: "Perfecto, Mariana. ¿Quieres que te dé detalles de alguno? ¿En qué horario lo planean?",
  extracted: { ...baseExtracted, horario_evento: "a partir de las 4" },
  filledSet: new Set([...baseFilled, "Horario del evento"]),
  currentMessage: "Está bien, me gustaría que solo lo agregara en la opción más casual, por favor",
});
assert.ok(/solo.*casual|propuesta casual/i.test(scopedDjReply), scopedDjReply.slice(0, 500));
assert.ok(!/la anoto para tu cotizaci/i.test(scopedDjReply), scopedDjReply.slice(0, 500));
assert.ok(!/horario lo planean|a qu[eé] hora ser[ií]a/i.test(scopedDjReply), scopedDjReply.slice(0, 500));

const djClarifyReply = runGuards({
  aiResponse: "¡Claro! *DJ* la anoto para tu cotización.",
  extracted: { ...baseExtracted, horario_evento: "a partir de las 4" },
  filledSet: new Set([...baseFilled, "Horario del evento"]),
  currentMessage: "¿De algún DJ?",
});
assert.ok(/nuestro servicio de \*DJ\*|no es un DJ externo/i.test(djClarifyReply), djClarifyReply.slice(0, 500));
assert.ok(!/la anoto para tu cotizaci/i.test(djClarifyReply), djClarifyReply.slice(0, 500));

console.log("A15581 smoke OK —", LUCY_PROMPT_VERSION);
