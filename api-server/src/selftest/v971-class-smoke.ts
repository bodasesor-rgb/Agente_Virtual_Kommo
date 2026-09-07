/**
 * Smoke V9.71 — clase A15775+: municipios GDL (Tlaquepaque) = ciudad;
 * "esa es la ciudad" = meta-referencia (recuperar topónimo previo, nunca guardar literal).
 * node ./scripts/run-v971-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  hasCityOrMetroSignal,
  isLocationMetaReferential,
  isReferentialPriorAnswer,
  isUsableDireccionEvento,
  mergeZonaDetail,
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

// Lexicón metro GDL / municipios
for (const city of [
  "San Pedro Tlaquepaque",
  "Tlaquepaque",
  "Zapopan",
  "Tonal\u00e1",
  "Tlajomulco",
  "Jalisco",
]) {
  assert.ok(hasCityOrMetroSignal(city), city);
  const z = parseZonaFromText(city);
  assert.ok(z && hasCityOrMetroSignal(z), `${city} \u2192 ${z}`);
  assert.ok(isUsableDireccionEvento(z!), city);
}

// Palabra suelta "ciudad" / meta no son geo
assert.ok(!hasCityOrMetroSignal("ciudad"));
assert.ok(!hasCityOrMetroSignal("esa es la ciudad"));
assert.ok(isLocationMetaReferential("esa es la ciudad"));
assert.ok(isLocationMetaReferential("Esa es la ciudad."));
assert.ok(isReferentialPriorAnswer("esa es la ciudad"));
assert.equal(parseZonaFromText("esa es la ciudad"), null);
assert.ok(!isUsableDireccionEvento("esa es la ciudad"));

// Merge: meta no se concatena al top\u00f3nimo
assert.match(
  mergeZonaDetail("esa es la ciudad", "San Pedro Tlaquepaque") ?? "",
  /tlaquepaque/i
);
assert.ok(!/esa es la ciudad/i.test(mergeZonaDetail("esa es la ciudad", "Zapopan") ?? ""));

// Recuperar del historial (ignorar el meta del \u00faltimo mensaje)
{
  const recovered = recoverZonaFromUserTexts(
    ["San Pedro Tlaquepaque", "esa es la ciudad"],
    "esa es la ciudad"
  );
  assert.match(recovered ?? "", /tlaquepaque/i);
}

// Guard: tras "esa es la ciudad", ack con Tlaquepaque — no el literal meta
{
  const filled = new Set<string>([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Tipo de evento",
    "Fecha del evento",
    "N\u00famero de invitados",
  ]);
  const extracted = emptyExtracted({
    nombre: "Pamela Ale",
    requerimientos_evento: "Puestos de Comida",
    tipo_evento: "Corporativo",
    fecha_evento: "2026-10-15",
    num_invitados: 80,
    direccion_evento: "esa es la ciudad",
  });
  const reply = applyLucyMessageGuards({
    aiResponse:
      "Perfecto, Pamela. Anoto la ubicaci\u00f3n en *esa es la ciudad*. Seguimos con *Puestos de Comida*. Si gustas, \u00bfa qu\u00e9 correo le paso la info?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      { role: "user", content: "San Pedro Tlaquepaque" },
      {
        role: "assistant",
        content: "Perfecto, Pamela. Claro que s\u00ed. Pamela, \u00bfen qu\u00e9 ciudad ser\u00eda?",
      },
    ],
    currentMessage: "esa es la ciudad",
    whatsappDisplayName: "Pamela Ale",
  });
  assert.match(reply, /tlaquepaque/i);
  assert.ok(!/\*esa es la ciudad\*/i.test(reply), reply.slice(0, 500));
  assert.match(extracted.direccion_evento ?? "", /tlaquepaque/i);
  assert.ok(!isLocationMetaReferential(extracted.direccion_evento));
}

// Primer mensaje ciudad: San Pedro Tlaquepaque no debe repreguntar ciudad
{
  const filled = new Set<string>(["Nombre del cliente", "Requerimientos o servicios"]);
  const extracted = emptyExtracted({
    nombre: "Pamela",
    requerimientos_evento: "Puestos de Comida",
  });
  const reply = applyLucyMessageGuards({
    aiResponse: "Perfecto, Pamela. \u00bfEn qu\u00e9 ciudad ser\u00eda?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      {
        role: "assistant",
        content: "Perfecto. \u00bfEn qu\u00e9 ciudad ser\u00eda el evento?",
      },
    ],
    currentMessage: "San Pedro Tlaquepaque",
    whatsappDisplayName: "Pamela Ale",
  });
  assert.match(extracted.direccion_evento ?? "", /tlaquepaque/i);
  assert.ok(
    !/\ben qu[e\u00e9]\s+ciudad\b/i.test(reply) || /correo|fecha|invitad|presupuesto|tipo/i.test(reply),
    reply.slice(0, 500)
  );
}

console.log("V9.72 class smoke OK");
