/**
 * Smoke V9.82 — A15907 Paola:
 * - brief con dos carpas (tela 2x2 + transparente 8x6) guarda ambas medidas
 * - "6x8" / "6m x 8m" / "6 x 8" tras ask de medidas se anotan y NO re-preguntan
 * - merge de servicios no pierde "(espacio …)" ni bare "(6m x 8m)"
 * node ./scripts/run-v982-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseSpaceDimensions,
  parseAllSpaceDimensions,
  isDimensionText,
  buildCarpaRequirementsFromText,
  mergeServiceRequirements,
  attachEspacioToRequirements,
  parseCarpaVariantFromText,
} from "../conversation-understanding.js";
import {
  applyLucyMessageGuards,
  requiredServiceDimensionsMissing,
  buildRequiredServiceDimensionsQuestion,
} from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.89");

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

const PAOLA_BRIEF =
  "Hola, Estoy buscando dos carpas. Una de tela 2x2 y una transparente 8x6 para un evento el 17 de octubre en el Pedregal. ¿Tiene disponibles?";

// 1) Parse de medidas sueltas.
{
  for (const t of ["6x8", "6 x 8", "6m x 8m", "6m x 8m", "De 6 x 8"]) {
    assert.ok(isDimensionText(t) || parseSpaceDimensions(t), t);
    assert.equal(parseSpaceDimensions(t), "6m x 8m", t);
  }
}

// 2) Brief multi-carpa: ambas medidas + transparente.
{
  const all = parseAllSpaceDimensions(PAOLA_BRIEF);
  assert.deepEqual(all, ["2m x 2m", "8m x 6m"], all.join("|"));
  const brief = buildCarpaRequirementsFromText(PAOLA_BRIEF);
  assert.ok(brief, "brief");
  assert.match(brief!, /2m x 2m/);
  assert.match(brief!, /8m x 6m/);
  assert.ok(parseSpaceDimensions(brief!), brief!);
  assert.equal(parseCarpaVariantFromText(PAOLA_BRIEF), "Carpa transparente");
  assert.equal(requiredServiceDimensionsMissing(emptyExtracted({ requerimientos_evento: brief })), false);
}

// 3) Merge no pierde medidas al anotar "(6m x 8m)" sin la palabra espacio.
{
  const merged = mergeServiceRequirements("Carpas", "Carpas (6m x 8m)", 6);
  assert.ok(merged && /espacio\s+6m x 8m/i.test(merged), merged ?? "");
  assert.equal(requiredServiceDimensionsMissing(emptyExtracted({ requerimientos_evento: merged })), false);
}

// 4) Respuesta "6x8" tras ask: anota y no vuelve a pedir medidas.
{
  const extracted = emptyExtracted({
    nombre: "Paola Bautista",
    correo: "gabriela.bautistaf@gmail.com",
    direccion_evento: "Pedregal",
    fecha_evento: "17 de octubre",
    horario_evento: "11 am",
    num_invitados: 75,
    tipo_evento: "bautizo",
    presupuesto: "Sin definir (cliente indicó que no tiene)",
    requerimientos_evento: "Carpas (espacio 2m x 2m)",
  });
  const filled = new Set([
    "Nombre del cliente",
    "Correo electrónico",
    "Lugar/dirección del evento",
    "Fecha y horario",
    "Número de invitados",
    "Tipo de evento",
    "Presupuesto (MXN)",
    "Requerimientos o servicios",
  ]);
  const reply = applyLucyMessageGuards({
    aiResponse: buildRequiredServiceDimensionsQuestion(extracted),
    extracted,
    filledSet: filled,
    readyForClosing: true,
    cierreYaEnviado: false,
    history: [
      {
        role: "assistant",
        content: buildRequiredServiceDimensionsQuestion(extracted),
      },
    ] as never,
    currentMessage: "6x8",
    whatsappDisplayName: "Paola Bautista",
    buildClosing: () => "Perfecto, ya tengo todo para cotizar.",
  });
  assert.ok(!/necesito las medidas aproximadas/i.test(reply), reply.slice(0, 400));
  assert.ok(parseSpaceDimensions(extracted.requerimientos_evento ?? ""), extracted.requerimientos_evento);
  assert.match(extracted.requerimientos_evento ?? "", /6m x 8m/);
  assert.ok(
    /6\s*m?\s*x\s*8|anoto medidas|ya tengo todo|cotizar/i.test(reply),
    reply.slice(0, 500)
  );
}

// 5) Si el CRM perdió espacio pero el historial tiene 8x6, no re-pide al cerrar.
{
  const extracted = emptyExtracted({
    nombre: "Paola Bautista",
    correo: "gabriela.bautistaf@gmail.com",
    direccion_evento: "Pedregal",
    fecha_evento: "17 de octubre",
    horario_evento: "11 am",
    num_invitados: 75,
    tipo_evento: "bautizo",
    presupuesto: "Sin definir (cliente indicó que no tiene)",
    requerimientos_evento: "Carpas",
  });
  const filled = new Set([
    "Nombre del cliente",
    "Correo electrónico",
    "Lugar/dirección del evento",
    "Fecha y horario",
    "Número de invitados",
    "Tipo de evento",
    "Presupuesto (MXN)",
    "Requerimientos o servicios",
  ]);
  const reply = applyLucyMessageGuards({
    aiResponse: "Perfecto, ya tengo todo.",
    extracted,
    filledSet: filled,
    readyForClosing: true,
    cierreYaEnviado: false,
    history: [
      { role: "user", content: PAOLA_BRIEF },
      { role: "assistant", content: "¿Qué tipo de evento?" },
    ] as never,
    currentMessage: "Prefiero la propuesta base",
    whatsappDisplayName: "Paola Bautista",
    buildClosing: () => "Perfecto, ya tengo todo para cotizar.",
  });
  assert.ok(parseSpaceDimensions(extracted.requerimientos_evento ?? ""), extracted.requerimientos_evento);
  assert.ok(!/necesito las medidas aproximadas/i.test(reply), reply.slice(0, 400));
}

// 6) attach helper.
{
  assert.equal(
    attachEspacioToRequirements("Carpas", ["6m x 8m"]),
    "Carpas (espacio 6m x 8m)"
  );
  assert.match(
    attachEspacioToRequirements("Carpas (espacio 2m x 2m)", ["6m x 8m"]),
    /6m x 8m/
  );
}

console.log("V9.82 class smoke OK —", LUCY_PROMPT_VERSION);
