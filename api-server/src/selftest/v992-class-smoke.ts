/**
 * Smoke V9.92 — resumen con claves completas en banquete, barras, CB, mobiliario.
 * node ./scripts/run-v992-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  extractQuoteKeyPoints,
  extractProductSpecHints,
  buildResumenClienteLargo,
} from "../services/summaryService.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.98");
assert.deepEqual(extractQuoteKeyPoints("banquete formal 3 tiempos"), extractProductSpecHints("banquete formal 3 tiempos"));

function emptyExtracted(overrides: Partial<ExtractedData> = {}): ExtractedData {
  return {
    tipo_contacto: "cliente",
    nombre: "Ana",
    empresa: null,
    telefono: null,
    correo: "ana@test.com",
    presupuesto: null,
    direccion_evento: "Polanco, CDMX",
    requerimientos_evento: null,
    fecha_evento: "15 de noviembre",
    horario_evento: "14:00",
    fecha_horario: null,
    num_invitados: 120,
    tipo_evento: "corporativo",
    modo_servicio: null,
    ...overrides,
  };
}

{
  const banquete = extractQuoteKeyPoints(
    "Queremos banquete formal 3 tiempos solo alimentos, 120 personas, presupuesto 450 por persona, sin gluten, con meseros"
  );
  assert.ok(banquete.some((s) => /Banquete Formal 3 tiempos/i.test(s)), String(banquete));
  assert.ok(banquete.some((s) => /solo alimentos/i.test(s)), String(banquete));
  assert.ok(banquete.some((s) => /sin gluten/i.test(s)), String(banquete));
  assert.ok(banquete.some((s) => /mesero/i.test(s)), String(banquete));
}

{
  const barras = extractQuoteKeyPoints(
    "Necesitamos barra de pizzas, barra de crepas y mesa de dulces para la boda, también coctelería"
  );
  assert.ok(barras.some((s) => /barra de pizzas/i.test(s)), String(barras));
  assert.ok(barras.some((s) => /barra de crepas/i.test(s)), String(barras));
  assert.ok(barras.some((s) => /mesa de dulces/i.test(s)), String(barras));
  assert.ok(barras.some((s) => /cocteler|mixolog/i.test(s)), String(barras));
}

{
  const cb = extractQuoteKeyPoints(
    "Coffee Break 4 para junta, vegetariano, entregar un día antes"
  );
  assert.ok(cb.some((s) => /Coffee Break 4/i.test(s)), String(cb));
  assert.ok(cb.some((s) => /vegetariano/i.test(s)), String(cb));
  assert.ok(cb.some((s) => /d[ií]a antes/i.test(s)), String(cb));
}

{
  const mob = extractQuoteKeyPoints(
    "4 sillas basket Tony gris oscuro, periqueras, salas lounge, acarreo de 600"
  );
  assert.ok(mob.some((s) => /basket/i.test(s)), String(mob));
  assert.ok(mob.some((s) => /Periqueras/i.test(s)), String(mob));
  assert.ok(mob.some((s) => /lounge/i.test(s)), String(mob));
  assert.ok(mob.some((s) => /600|acarreo|desplazamiento/i.test(s)), String(mob));
}

{
  const carpa = extractQuoteKeyPoints("Carpa transparente 8x6 y DJ con pista de baile");
  assert.ok(carpa.some((s) => /carpa|transparente/i.test(s)), String(carpa));
  assert.ok(carpa.some((s) => /8m x 6m|8.*6/i.test(s)), String(carpa));
  assert.ok(carpa.some((s) => /\bDJ\b/i.test(s)), String(carpa));
  assert.ok(carpa.some((s) => /Pista/i.test(s)), String(carpa));
}

{
  const conv = `
Queremos banquete formal 3 tiempos solo alimentos
También barra de quesos y canapés
Sin gluten por favor
Presupuesto 450 por persona
Polanco CDMX, 15 de noviembre a las 14:00, 120 invitados
`;
  const resumen = buildResumenClienteLargo(
    emptyExtracted({
      requerimientos_evento: "Banquete Formal",
      presupuesto: null,
    }),
    [
      "- Nombre del cliente: Ana",
      "- Correo electrónico: ana@test.com",
      "- Tipo de evento: corporativo",
      "- Requerimientos o servicios: Banquete Formal",
      "- Número de invitados: 120",
      "- Lugar/dirección del evento: Polanco, CDMX",
      "- Fecha del evento: 15 de noviembre",
      "- Horario del evento: 14:00",
      "- Presupuesto (MXN): $450 MXN por persona",
    ],
    conv
  );
  assert.match(resumen, /Claves para cotizar/i);
  assert.match(resumen, /Banquete Formal 3 tiempos|3 tiempos/i);
  assert.match(resumen, /solo alimentos/i);
  assert.match(resumen, /barra de quesos|Canap/i);
  assert.match(resumen, /sin gluten/i);
  assert.match(resumen, /450/);
  assert.ok(!/130150/.test(resumen));
}

{
  // Regresión Carol mobiliario
  const carol = buildResumenClienteLargo(
    emptyExtracted({
      nombre: "Carol",
      requerimientos_evento: "Mobiliario",
      num_invitados: 66,
      direccion_evento: "Estado de México, Lemon Salón Terraza, Green Plaza Lomas verdes",
      fecha_evento: "26 de septiembre",
      horario_evento: "8:00 p.m",
      presupuesto: 130150 as unknown as number,
    }),
    [
      "- Nombre del cliente: Carol",
      "- Requerimientos o servicios: Mobiliario",
      "- Número de invitados: 66",
      "- Lugar/dirección del evento: Estado de México, Lemon Salón Terraza, Green Plaza Lomas verdes",
      "- Fecha del evento: 26 de septiembre",
      "- Horario del evento: 8:00 p.m",
      "- Presupuesto (MXN): 130150",
    ],
    "Ocupamos alrededor de 4 sillas basket gris oscuro, presupuesto 130 a 150 por cada silla y desplazamiento de $600, Lemon Salón Terraza Green Plaza"
  );
  assert.match(carol, /4\s+sillas/i);
  assert.match(carol, /basket/i);
  assert.ok(!/Presupuesto: 130150/i.test(carol), carol);
}

console.log("V9.92 class smoke OK —", LUCY_PROMPT_VERSION);
