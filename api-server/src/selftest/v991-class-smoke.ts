/**
 * Smoke V9.91 — A15944 resumen lead: claves reales, no 130150, ubicación limpia.
 * node ./scripts/run-v991-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parsePresupuestoFromText,
  presupuestoToSafeNumber,
  sanitizeDireccionCapture,
} from "../conversation-understanding.js";
import {
  buildResumenClienteLargo,
  extractRentalPieceCount,
  extractProductSpecHints,
  resolveResumenPresupuesto,
} from "../services/summaryService.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.91");

function emptyExtracted(overrides: Partial<ExtractedData> = {}): ExtractedData {
  return {
    tipo_contacto: "cliente",
    nombre: "Carol",
    empresa: null,
    telefono: null,
    correo: "carol.angelicagar@gmail.com",
    presupuesto: 130150 as unknown as number,
    direccion_evento:
      "Estado de México, salón de fiestas y estamos buscando a un proveedor que, Estado de México, salón se llama Lemon Salón Terraza y nos encontramos en",
    requerimientos_evento: "Mobiliario",
    fecha_evento: "26 de septiembre",
    horario_evento: "8:00 p.m",
    fecha_horario: null,
    num_invitados: 66,
    tipo_evento: "evento en salón de fiestas",
    modo_servicio: null,
    ...overrides,
  };
}

const conv = `
Hola Lucy claro mi nombre es Carol
Buenas noches coordino eventos en un salón de fiestas y estamos buscando a un proveedor que nos apoye ya que contamos con un tipo de silla que es basket Tony de color gris
En el Estado de México, el salón se llama Lemon Salón Terraza y nos encontramos en Green Plaza Lomas verdes
Contamos con 66 invitados realmente buscamos un proveedor que nos apoye con el complemento de sillas que ya contamos con el salón
Ocupamos alrededor de 4 sillas para el día 26 de septiembre ya que es un evento importante!
Si por fa me compartes el catálogo y el evento sería a las 8:00 p.m pero justo vi en su página que se puede entregar un día antes del evento
carol.angelicagar@gmail.com
Muchas gracias contamos con un presupuesto de 130 a 150 por cada silla y el desplazamiento de $600 aprox
Gracias si para confirmar el tipo de silla que buscamos es Silla basket de color gris oscuro
`;

{
  const p = parsePresupuestoFromText(
    "Muchas gracias contamos con un presupuesto de 130 a 150 por cada silla y el desplazamiento de $600 aprox",
    { askedField: "presupuesto" }
  );
  assert.ok(p, "presupuesto null");
  assert.match(p!, /130/);
  assert.match(p!, /150/);
  assert.match(p!, /silla/i);
  assert.match(p!, /600/);
  assert.ok(!/130150/.test(p!.replace(/\D/g, "")) || /130.*150/.test(p!));
  assert.equal(presupuestoToSafeNumber(p), null);
}

{
  assert.deepEqual(extractRentalPieceCount(conv), { count: 4, unit: "sillas" });
  const specs = extractProductSpecHints(conv);
  assert.ok(specs.some((s) => /basket/i.test(s)), String(specs));
  assert.ok(specs.some((s) => /d[ií]a antes|Complemento/i.test(s)), String(specs));
}

{
  const dirty =
    "Estado de México, salón de fiestas y estamos buscando a un proveedor que, Estado de México, salón se llama Lemon Salón Terraza y nos encontramos en";
  const clean = sanitizeDireccionCapture(dirty);
  assert.ok(clean);
  assert.match(clean!, /Lemon|Estado/i);
  assert.ok(!/buscando|se llama|nos encontramos en$/i.test(clean!));
}

{
  const extracted = emptyExtracted();
  const merged = [
    "- Nombre del cliente: Carol",
    "- Correo electrónico: carol.angelicagar@gmail.com",
    "- Tipo de evento: evento en salón de fiestas",
    "- Requerimientos o servicios: Mobiliario",
    "- Número de invitados: 66",
    "- Lugar/dirección del evento: Estado de México, salón de fiestas y estamos buscando a un proveedor que, Estado de México, salón se llama Lemon Salón Terraza y nos encontramos en",
    "- Fecha del evento: 26 de septiembre",
    "- Horario del evento: 8:00 p.m",
    "- Presupuesto (MXN): 130150",
  ];
  const ppto = resolveResumenPresupuesto(extracted, merged, conv);
  assert.ok(ppto);
  assert.match(ppto!, /130/);
  assert.match(ppto!, /150/);
  assert.ok(!/^130150$/.test(ppto!.replace(/\D/g, "")) || /silla/i.test(ppto!));
  assert.ok(!/Presupuesto: 130150/.test(`Presupuesto: ${ppto}`));

  const resumen = buildResumenClienteLargo(extracted, merged, conv);
  assert.match(resumen, /4\s+sillas/i);
  assert.match(resumen, /basket/i);
  assert.match(resumen, /Lemon|Green Plaza|Estado de M[eé]xico/i);
  assert.ok(!/buscando a un proveedor/i.test(resumen), resumen);
  assert.ok(!/Presupuesto: 130150/i.test(resumen), resumen);
  assert.match(resumen, /Presupuesto:.*130/i);
  assert.match(resumen, /Claves para cotizar/i);
  assert.match(resumen, /Invitados del evento: 66/);
  assert.match(resumen, /Piezas a cotizar: 4/);
}

console.log("V9.91 class smoke OK —", LUCY_PROMPT_VERSION);
