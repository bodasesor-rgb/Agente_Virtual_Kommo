/**
 * Smoke V9.72 — clase A15791+: municipio tipo Huasca de Ocampo; venue+ciudad;
 * refinamiento de horario am/pm; no "Queda anotado" tras decline.
 * node ./scripts/run-v972-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  hasCityOrMetroSignal,
  isRicherHorarioCapture,
  isUsableDireccionEvento,
  isVenueWithoutCity,
  looksLikeMxMunicipalityToponym,
  mergeZonaDetail,
  parseHorarioFromText,
  parseZonaFromText,
  recoverZonaFromUserTexts,
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

assert.equal(LUCY_PROMPT_VERSION, "V9.73");

function check(label: string, cond: unknown, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", label, detail ?? "");
    throw new assert.AssertionError({ message: label, actual: cond, expected: true });
  }
  console.log("OK", label);
}

// Municipio / pueblo mágico
check("topo", looksLikeMxMunicipalityToponym("Huasca de Ocampo"));
check("city", hasCityOrMetroSignal("Huasca de Ocampo"));
check("usable", isUsableDireccionEvento("Huasca de Ocampo"));
check("parse", /huasca/i.test(parseZonaFromText("Huasca de Ocampo") ?? ""));
check("si", /huasca/i.test(parseZonaFromText("Si Huasca de Ocampo") ?? ""));
check("not pizza", !looksLikeMxMunicipalityToponym("barra de pizzas"));

// Venue cabañas + ciudad
check("venue", isVenueWithoutCity("Caba\u00f1as Alcatraces"));
{
  const merged = mergeZonaDetail("Huasca de Ocampo", "Caba\u00f1as Alcatraces") ?? "";
  check("merge huasca", /huasca/i.test(merged), merged);
  check("merge venue", /alcatraces/i.test(merged), merged);
  check("usable merge", isUsableDireccionEvento(merged), merged);
  check(
    "recover",
    /huasca/i.test(
      recoverZonaFromUserTexts(
        ["Huasca de Ocampo", "Caba\u00f1as Alcatraces"],
        "Caba\u00f1as Alcatraces"
      ) ?? ""
    )
  );
}

// Horario más claro con am/pm
check("hor1", !!parseHorarioFromText("De 3 a 1am"), parseHorarioFromText("De 3 a 1am"));
check("hor2", !!parseHorarioFromText("3pm a 1am"), parseHorarioFromText("3pm a 1am"));
check("richer", isRicherHorarioCapture("3pm a 1am", "De 3 a 1am"));

// Guard: Huasca no repregunta ciudad
{
  const filled = new Set<string>([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "N\u00famero de invitados",
    "Fecha del evento",
    "Horario del evento",
  ]);
  const extracted = emptyExtracted({
    nombre: "Ismael Garcia Reza",
    tipo_evento: "boda",
    requerimientos_evento: "Carpas",
    num_invitados: 60,
    fecha_evento: "21 noviembre",
    horario_evento: "De 3 a 1am",
  });
  const reply = applyLucyMessageGuards({
    aiResponse: "Perfecto, Ismael. \u00bfen qu\u00e9 ciudad ser\u00eda?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      {
        role: "assistant",
        content: "Perfecto, Ismael. Anoto el horario *De 3 a 1am*. \u00bfEn qu\u00e9 ciudad lo arman?",
      },
    ],
    currentMessage: "Huasca de Ocampo",
    whatsappDisplayName: "Ismael Garcia Reza",
    entityId: "A15791-huasca",
  });
  assert.match(extracted.direccion_evento ?? "", /huasca/i);
  assert.match(reply, /huasca/i);
  assert.ok(!/\ben qu[e\u00e9]\s+ciudad\b/i.test(reply) || /correo|presupuesto/i.test(reply), reply);
}

// Guard: caba\u00f1as tras Huasca fusiona, no repregunta
{
  const filled = new Set<string>([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "N\u00famero de invitados",
    "Fecha del evento",
    "Horario del evento",
  ]);
  const extracted = emptyExtracted({
    nombre: "Ismael",
    tipo_evento: "boda",
    requerimientos_evento: "Carpas",
    num_invitados: 60,
    fecha_evento: "21 noviembre",
    horario_evento: "De 3 a 1am",
    direccion_evento: "Huasca de Ocampo",
  });
  filled.add("Lugar/direcci\u00f3n del evento");
  const reply = applyLucyMessageGuards({
    aiResponse: "Claro. Ismael, \u00bfme confirmas la *ciudad* del evento?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      { role: "user", content: "Huasca de Ocampo" },
      {
        role: "assistant",
        content: "Si gustas, \u00bfa qu\u00e9 correo le paso la info a nuestro equipo?",
      },
    ],
    currentMessage: "Caba\u00f1as Alcatraces",
    whatsappDisplayName: "Ismael Garcia Reza",
    entityId: "A15791-cabanas",
  });
  assert.match(extracted.direccion_evento ?? "", /huasca/i);
  assert.ok(!/\bconfirmas la \*ciudad\*/i.test(reply), reply);
}

// Guard: refinamiento horario 3pm
{
  const filled = new Set<string>([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "N\u00famero de invitados",
    "Fecha del evento",
    "Horario del evento",
  ]);
  const extracted = emptyExtracted({
    nombre: "Ismael",
    tipo_evento: "boda",
    requerimientos_evento: "Carpas",
    num_invitados: 60,
    fecha_evento: "21 noviembre",
    horario_evento: "De 3 a 1am",
  });
  const reply = applyLucyMessageGuards({
    aiResponse: "Sigo aqu\u00ed, Ismael. Cuando puedas, \u00bfme confirmas ese dato?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      {
        role: "assistant",
        content: "Perfecto, Ismael. Anoto el horario *De 3 a 1am*. \u00bfEn qu\u00e9 ciudad lo arman?",
      },
    ],
    currentMessage: "3pm a 1am",
    whatsappDisplayName: "Ismael Garcia Reza",
    entityId: "A15791-horario",
  });
  assert.match(extracted.horario_evento ?? "", /pm/i);
  assert.ok(!/Sigo aqu[i\u00ed]/i.test(reply), reply);
  assert.ok(/ciudad|ubicaci|arman|correo/i.test(reply), reply);
}

// Guard: por el momento no → cierre o presupuesto, no "Queda anotado lo de Carpas"
{
  const filled = new Set<string>([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "N\u00famero de invitados",
    "Fecha del evento",
    "Horario del evento",
    "Lugar/direcci\u00f3n del evento",
  ]);
  const extracted = emptyExtracted({
    nombre: "Ismael",
    tipo_evento: "boda",
    requerimientos_evento: "Carpas",
    num_invitados: 60,
    fecha_evento: "21 noviembre",
    horario_evento: "3pm a 1am",
    direccion_evento: "Huasca de Ocampo",
    correo: "no comparti\u00f3 (sigue por WhatsApp)",
  });
  filled.add("Correo electrónico");
  filled.add("Correo (prefiere no compartir)");
  const reply = applyLucyMessageGuards({
    aiResponse: "Queda anotado lo de Carpas.",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: true,
    history: [
      {
        role: "assistant",
        content:
          "\u00a1Claro, sin problema, Ismael! Lo revisamos todo por este chat. Perfecto. Con el Carpas, \u00bfnecesitan alg\u00fan otro servicio?",
      },
    ],
    currentMessage: "Por el momento no",
    whatsappDisplayName: "Ismael Garcia Reza",
    entityId: "A15791-decline",
  });
  assert.ok(!/^Queda anotado lo de Carpas\.?$/i.test(reply.trim()), reply);
  assert.ok(
    /cotizaci|presupuesto|equipo|propuesta|gracias|listo/i.test(reply),
    reply
  );
}

console.log("V9.72 class smoke OK");
