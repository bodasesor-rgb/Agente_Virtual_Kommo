/**
 * Smoke A15539 (sin embudo/PGlite).
 * node ./scripts/run-a15539-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseTipoEventoFromText,
  isScheduleLabeledClock,
  isVagueFoodTerm,
  parseHorarioFromText,
  clientMentionsCarpas,
  parseServicesFromText,
  parseZonaFromText,
  isVenueSpaceDetail,
  clientRequestsCallback,
  CRM_FECHA_LABEL,
  CRM_HORARIO_LABEL,
} from "../conversation-understanding.js";
import { clientDeclinesServiceFamilies } from "../services/serviceDecline.js";
import { applyCrmWriteInvariants, isBodasesorCompanyPhone } from "../lucyCrmInvariants.js";
import { buildSpecificInclusionItemReply } from "../services/catalogService.js";
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
  readyForClosing?: boolean;
  cierreYaEnviado?: boolean;
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: opts.readyForClosing ?? false,
    cierreYaEnviado: opts.cierreYaEnviado ?? false,
    history: (opts.history ?? []) as never,
    currentMessage: opts.currentMessage,
    whatsappDisplayName: null,
    buildClosing: () => "Listo, el equipo arma tu cotización.",
    emailRefusedThisTurn: false,
  });
}

assert.equal(LUCY_PROMPT_VERSION, "V9.73");
assert.equal(parseTipoEventoFromText("primera comunión"), "primera comunión");
assert.ok(isScheduleLabeledClock("a medio día"));
assert.ok(isScheduleLabeledClock("cocktail a las 12:00\ncomida a las 2:00"));
assert.ok(!isVagueFoodTerm("comida a las 2:00"));
assert.ok(
  /cocktail|12|comida|2/i.test(
    parseHorarioFromText("cocktail a las 12:00\ncomida a las 2:00") ?? ""
  )
);
assert.equal(parseHorarioFromText("a medio día"), "a medio día");
assert.ok(clientMentionsCarpas("carpa?"));
assert.ok(clientMentionsCarpas("capra sí"));
const svc = parseServicesFromText("necesito bar tender, DJ no, capra sí");
assert.ok(svc.includes("Coctelería"), String(svc));
assert.ok(svc.includes("Carpas"), String(svc));
assert.ok(!svc.some((s) => /^DJ$/i.test(s)), String(svc));
assert.ok(
  clientDeclinesServiceFamilies("necesito bar tender, DJ no, capra sí").includes(
    "entretenimiento"
  )
);
assert.ok(/Atlixco/i.test(parseZonaFromText("atlixco") ?? ""));
assert.ok(isVenueSpaceDetail("será en un jardin"));
assert.ok(clientRequestsCallback("que me llamen si están interesados"));
assert.ok(clientRequestsCallback("este es mi tel"));
assert.ok(isBodasesorCompanyPhone("55 4008 0373"));
assert.equal(
  applyCrmWriteInvariants(emptyExtracted({ telefono: "55 4008 0373" }), [
    "este es mi tel",
  ]).extracted.telefono,
  null
);

const mobiliarioInc = buildSpecificInclusionItemReply(
  "el servicio completo incluye mobiliario correcto?",
  "Paella"
);
assert.ok(
  mobiliarioInc && /mobiliario/i.test(mobiliarioInc),
  mobiliarioInc ?? ""
);

const carpaQ = runGuards({
  aiResponse: "¿Qué tipo de evento es?",
  extracted: emptyExtracted({
    nombre: "Jorge",
    requerimientos_evento: "Paella",
    num_invitados: 100,
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Número de invitados",
  ]),
  currentMessage: "carpa?",
  history: [{ role: "assistant", content: "¿Cuál te late más?" }],
});
assert.ok(/carpa/i.test(carpaQ), carpaQ.slice(0, 300));
assert.ok(/Manejamos \*carpas\*|anoto.*[Cc]arpas/i.test(carpaQ), carpaQ.slice(0, 300));

const horarioReply = runGuards({
  aiResponse: "Para *comida* del evento, ¿qué te gustaría?",
  extracted: emptyExtracted({
    nombre: "Jorge",
    tipo_evento: "primera comunión",
    requerimientos_evento: "Paella",
    fecha_evento: "Marzo-Abril 2027",
    num_invitados: 100,
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    CRM_FECHA_LABEL,
    "Número de invitados",
  ]),
  currentMessage: "cocktail a las 12:00\ncomida a las 2:00",
  history: [{ role: "assistant", content: "¿En qué horario lo planean?" }],
});
assert.ok(/horario|12|cocktail|2/i.test(horarioReply), horarioReply.slice(0, 400));
assert.ok(!/banquete|taquiza|casual/i.test(horarioReply), horarioReply.slice(0, 400));

const checklist = emptyExtracted({
  nombre: "Jorge",
  tipo_evento: "primera comunión",
  requerimientos_evento: "Paella, Mobiliario, Carpas",
  num_invitados: 100,
});
const djNo = runGuards({
  aiResponse: "¡Claro! *DJ* la anoto para tu cotización.",
  extracted: checklist,
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Número de invitados",
  ]),
  currentMessage: "necesito bar tender, DJ no, capra sí",
  history: [{ role: "assistant", content: "¿Necesitan algún otro servicio?" }],
});
assert.ok(!/\*DJ\*\s+la anoto|DJ.*anoto/i.test(djNo), djNo.slice(0, 400));
assert.ok(
  /sin\s+DJ|no\s+incluimos\s+entretenimiento|Cocteler|bartender|carpa/i.test(djNo),
  djNo.slice(0, 400)
);

const mobiliarioQ = runGuards({
  aiResponse: "Sí, contamos con *mobiliario*. ¿Qué es lo que buscas?",
  extracted: emptyExtracted({ nombre: "Jorge", requerimientos_evento: "Paella" }),
  filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
  currentMessage: "el servicio completo incluye mobiliario correcto?",
  history: [{ role: "assistant", content: "¿Cuál te late más?" }],
});
assert.ok(
  /incluye|correcto|s[ií]/i.test(mobiliarioQ) && /mobiliario/i.test(mobiliarioQ),
  mobiliarioQ.slice(0, 400)
);

const ciudad = runGuards({
  aiResponse: "Para *comida* del evento, ¿qué te gustaría? • Un *banquete*…",
  extracted: emptyExtracted({
    nombre: "Jorge",
    tipo_evento: "primera comunión",
    requerimientos_evento: "Paella, Mobiliario, Carpas, Coctelería",
    fecha_evento: "Marzo-Abril 2027",
    horario_evento: "cocktail 12:00; comida 14:00",
    num_invitados: 100,
    direccion_evento: "jardín",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    CRM_FECHA_LABEL,
    CRM_HORARIO_LABEL,
    "Número de invitados",
  ]),
  currentMessage: "atlixco",
  history: [
    {
      role: "assistant",
      content:
        "Para cotizar bien necesito al menos la *ciudad* del evento. ¿En qué ciudad está?",
    },
  ],
});
assert.ok(/Atlixco/i.test(ciudad), ciudad.slice(0, 400));
assert.ok(!/banquete|taquiza|¿qu[eé] te gustar[ií]a/i.test(ciudad), ciudad.slice(0, 400));

const callback = runGuards({
  aiResponse: "¿Qué servicios te gustaría ir armando?",
  extracted: emptyExtracted({
    nombre: "Jorge",
    telefono: "+5212227391899",
    requerimientos_evento: "Paella, Carpas, Coctelería",
    direccion_evento: "Atlixco",
    num_invitados: 100,
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Lugar/dirección del evento",
    "Número de invitados",
  ]),
  currentMessage: "que me llamen si están interesados. este es mi tel",
  history: [{ role: "assistant", content: "¿Qué necesitas cotizar?" }],
});
assert.ok(/asesor|canalizo|55\s*4008/i.test(callback), callback.slice(0, 400));
assert.ok(!/servicios te gustar[ií]a|ir armando/i.test(callback), callback.slice(0, 400));

console.log("A15539 smoke OK —", LUCY_PROMPT_VERSION);
