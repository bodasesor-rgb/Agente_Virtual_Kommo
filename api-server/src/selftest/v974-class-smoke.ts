/**
 * Smoke V9.74 — A15815 Yasmin:
 * - "Ok gracias" tras link de catálogo ≠ reenviar el mismo link
 * - "De 6:30pm" captura horario
 * - "No hemos cotizado… son los primeros" = waiver presupuesto
 * node ./scripts/run-v974-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  clientAffirmsCatalogOffer,
  detectPresupuestoRefusal,
  parseHorarioFromText,
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

assert.equal(LUCY_PROMPT_VERSION, "V9.74");

{
  const closingWithLink = `Perfecto, ya tengo todo. He anotado la promoción de cierre rápido del 10% de descuento con el código CierreRapido. Con esta información, le pediré a mi equipo que prepare una cotización personalizada para ti.

Mientras tanto, te comparto nuestro catálogo general donde puedes ver los montajes, menús y otras opciones disponibles: https://bodasesor.com/catalogos

¿Te gustaría que te envíe el catálogo con más detalle? Quedo a tu disposición por si necesitas cualquier otra cosa.`;
  assert.equal(clientAffirmsCatalogOffer("Ok gracias", closingWithLink), false);
  assert.equal(clientAffirmsCatalogOffer("ok", closingWithLink), false);
  assert.equal(clientAffirmsCatalogOffer("gracias", closingWithLink), false);
  assert.ok(clientAffirmsCatalogOffer("Si mándamelo", closingWithLink));
  assert.ok(
    clientAffirmsCatalogOffer("Si", "¿Te gustaría que te envíe el catálogo con más detalle?")
  );
}

{
  const h = parseHorarioFromText("De 6:30pm");
  assert.ok(h, "De 6:30pm debe capturar horario");
  assert.match(h!, /6:30/i);
  assert.match(h!, /partir|6:30/i);
}

assert.ok(
  detectPresupuestoRefusal("No hemos cotizado nada aún Uds son los primeros")
);
assert.ok(detectPresupuestoRefusal("De hecho ustedes son los primeros"));

{
  const filled = new Set<string>([
    "Nombre del cliente",
    "Correo electrónico",
    "Tipo de evento",
    "Número de invitados",
    "Fecha del evento",
    "Horario del evento",
    "Dirección / ubicación",
    "Requerimientos o servicios",
  ]);
  const extracted = emptyExtracted({
    nombre: "Yasmin García",
    correo: "dra_yasmin@hotmail.com",
    tipo_evento: "15 años",
    num_invitados: 120,
    fecha_evento: "marzo 2027",
    horario_evento: "Noche",
    direccion_evento: "Pachuca",
  });
  const closingWithLink = `Perfecto, ya tengo todo. He anotado la promoción. Con esta información, le pediré a mi equipo que prepare una cotización personalizada para ti.

Mientras tanto, te comparto nuestro catálogo general: https://bodasesor.com/catalogos

¿Te gustaría que te envíe el catálogo con más detalle?`;
  const reply = applyLucyMessageGuards({
    aiResponse: "Claro. Aquí tienes el catálogo general:\nhttps://bodasesor.com/catalogos",
    extracted,
    filledSet: filled,
    readyForClosing: true,
    emailRefusedThisTurn: false,
    history: [{ role: "assistant", content: closingWithLink }],
    currentMessage: "Ok gracias",
    whatsappDisplayName: "Yasmin García",
    entityId: "A15815-no-resend-catalog",
  });
  assert.ok(!/bodasesor\.com\/catalogos/i.test(reply), `no debe reenviar link: ${reply}`);
  assert.match(reply, /gusto|equipo|cotizaci/i);
}

console.log("V9.74 class smoke OK");
