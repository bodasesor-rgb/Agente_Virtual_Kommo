/**
 * Smoke A15566 Lynn — rangos de horario / a partir de / waiver.
 * node ./scripts/run-a15566-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseHorarioFromText,
  clientDefersHorario,
  isClockTimeOnlySchedule,
  isSimpleClockTime,
  isUsableHorarioEvento,
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
    buildClosing: () => "Listo, el equipo arma tu cotización.",
    emailRefusedThisTurn: false,
  });
}

assert.equal(LUCY_PROMPT_VERSION, "V9.62");

const cases: Array<[string, RegExp]> = [
  ["El evento sería de 3:00 pm a 11:00 pm", /3:00\s*pm.*11:00\s*pm/i],
  ["El evento es a partir de las 3:00 pm", /3:00\s*pm|a partir/i],
  ["Partir de las 16:00 pm", /16:00/i],
  ["De 15:00 p.m a 11:00 p.m", /15:00.*11:00/i],
  ["El evento es a partir de las 15:00 hrs", /15:00/i],
  ["A partir de las 16:00 hrs", /16:00/i],
  ["A partir de las 16 hrs", /16\s*hrs/i],
  ["No cuento con el horario aún", /sin definir|pendiente/i],
  ["A las 4:00 pm", /4:00\s*pm|4:00/i],
  ["de 3:00 pm a 11:00 pm", /3:00.*11:00/i],
];

for (const [msg, re] of cases) {
  const h = parseHorarioFromText(msg);
  assert.ok(h && re.test(h), `fail "${msg}" => ${h}`);
  assert.ok(isUsableHorarioEvento(h!), `usable "${msg}" => ${h}`);
}

assert.ok(clientDefersHorario("No cuento con el horario aún"));
assert.ok(isClockTimeOnlySchedule("de 3:00 pm a 11:00 pm"));
assert.ok(isSimpleClockTime("a partir de las 16:00 hrs"));
assert.ok(isSimpleClockTime("A las 4:00 pm"));

const rangeReply = runGuards({
  aiResponse: "¿En qué horario lo planean?",
  extracted: emptyExtracted({
    nombre: "Lynn",
    tipo_evento: "XV años",
    requerimientos_evento: "Barra de pastas y ensaladas",
    num_invitados: 100,
    fecha_evento: "16 de enero 2027",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Número de invitados",
    "Fecha del evento",
  ]),
  currentMessage: "El evento sería de 3:00 pm a 11:00 pm",
  history: [{ role: "assistant", content: "¿En qué horario lo planean?" }],
});
assert.ok(
  !/horario lo planean|a qu[eé] hora|Sigo aqu[ií]|confirmas ese dato/i.test(rangeReply),
  rangeReply.slice(0, 500)
);
assert.ok(/3:00|11:00|horario|correo|ciudad|ubicaci/i.test(rangeReply), rangeReply.slice(0, 500));

const deferReply = runGuards({
  aiResponse: "¿En qué horario lo planean?",
  extracted: emptyExtracted({
    nombre: "Lynn",
    tipo_evento: "XV años",
    requerimientos_evento: "Barra de pastas y ensaladas",
    fecha_evento: "16 de enero 2027",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Fecha del evento",
  ]),
  currentMessage: "No cuento con el horario aún",
  history: [{ role: "assistant", content: "¿En qué horario lo planean?" }],
});
assert.ok(!/horario lo planean|a qu[eé] hora ser[ií]a/i.test(deferReply), deferReply.slice(0, 500));

const aPartirReply = runGuards({
  aiResponse: "Sigo aquí, Lynn. Cuando puedas, ¿me confirmas ese dato?",
  extracted: emptyExtracted({
    nombre: "Lynn",
    fecha_evento: "16 de enero 2027",
    requerimientos_evento: "Barra de pastas y ensaladas",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Fecha del evento",
    "Requerimientos o servicios",
  ]),
  currentMessage: "A partir de las 16:00 hrs",
  history: [{ role: "assistant", content: "¿En qué horario lo planean?" }],
});
assert.ok(
  !/Sigo aqu[ií]|confirmas ese dato|horario lo planean/i.test(aPartirReply),
  aPartirReply.slice(0, 500)
);
assert.ok(/16:00|horario|anot/i.test(aPartirReply), aPartirReply.slice(0, 500));

console.log("A15566 smoke OK —", LUCY_PROMPT_VERSION);
