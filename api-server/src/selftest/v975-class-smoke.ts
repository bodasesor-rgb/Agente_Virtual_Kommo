/**
 * Smoke V9.75 — A15841 Santeco:
 * - medidas "(espacio 15m x 15m)" sobreviven al sumar otro servicio
 * - "no requiero comida de tiempos, sólo snaks gourmet" cambia banquete por canapés
 * - el año del evento (2026) no se vuelve presupuesto en el resumen CRM
 * node ./scripts/run-v975-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  clientSwapsPlatedMealForSnacks,
  mergeServiceRequirements,
  parseServicesFromText,
  parseSpaceDimensions,
} from "../conversation-understanding.js";
import { requiredServiceDimensionsMissing } from "../lucy-flow-guards.js";
import { buildResumenClienteLargo } from "../services/summaryService.js";
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

assert.equal(LUCY_PROMPT_VERSION, "V9.75");

// 1) Medidas de carpa no se pierden al sumar servicios → no se re-pregunta.
{
  const withDims = "Banquete Formal, Canapés, Carpas, Meseros (espacio 15m x 15m)";
  const conPaella = mergeServiceRequirements(withDims, "Paella", 6);
  assert.ok(conPaella);
  assert.match(conPaella!, /espacio 15m x 15m/i);
  assert.equal(parseSpaceDimensions(conPaella!), "15m x 15m");
  assert.equal(
    requiredServiceDimensionsMissing(emptyExtracted({ requerimientos_evento: conPaella })),
    false
  );

  const conMusica = mergeServiceRequirements(withDims, "música y personal de servicio", 6);
  assert.match(conMusica ?? "", /espacio 15m x 15m/i);

  // Sin carpa/pista previa no inventa anotación de espacio.
  assert.equal(
    /espacio/i.test(mergeServiceRequirements("Banquete Formal", "DJ", 6) ?? ""),
    false
  );
}

// 2) "no requiero comida de tiempos, sólo snaks tipo gourmet" → canapés, sin banquete.
{
  const msg = "no requiero comida de tiempos, sólo quiero de snaks tipo gourmet";
  assert.ok(clientSwapsPlatedMealForSnacks(msg));
  assert.deepEqual(parseServicesFromText(msg), ["Canapés"]);

  const merged = mergeServiceRequirements("Banquete Formal, Carpas", msg, 6);
  assert.ok(merged);
  assert.match(merged!, /Canap/i);
  assert.equal(/Banquete/i.test(merged!), false);
  assert.match(merged!, /Carpas/i);

  // Un pedido normal de banquete no dispara el cambio.
  assert.equal(clientSwapsPlatedMealForSnacks("Quiero banquete formal para 120 personas"), false);
}

// 3) El año del evento no se reporta como presupuesto.
{
  const resumen = buildResumenClienteLargo(
    emptyExtracted({
      nombre: "Santeco",
      correo: "alejandraex@santeco.mx",
      requerimientos_evento: "Canapés, Carpas, Meseros",
      num_invitados: 120,
      fecha_evento: "8 de octubre",
      horario_evento: "de 18 a 22 hrs",
      direccion_evento: "CDMX",
    }),
    ["- Nombre del cliente: Santeco"],
    "Tengo interés en Banquete Gourmet para el jueves 8 de octubre del 2026, de 18 a 22 hrs para 120 personas."
  );
  assert.equal(/Presupuesto:\s*2026/i.test(resumen), false, resumen);
  assert.match(resumen, /Completar:.*presupuesto/i);

  // Un monto real sí se reporta.
  const conMonto = buildResumenClienteLargo(
    emptyExtracted({ nombre: "Santeco", fecha_evento: "8 de octubre" }),
    ["- Nombre del cliente: Santeco"],
    "El evento es en 2026 y tenemos un presupuesto de $180,000 MXN"
  );
  assert.match(conMonto, /Presupuesto:\s*180000/i);
}

console.log("V9.75 class smoke OK");
