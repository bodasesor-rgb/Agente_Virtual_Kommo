/**
 * Smoke V9.84 — A15917 Carlos:
 * - "So/Solo mobiliario" → pregunta mesas y sillas vs periqueras
 * - envía ambos catálogos (no hub genérico solo)
 * - formato con saltos de línea (URL no pegada a la pregunta)
 * node ./scripts/run-v984-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  buildBareMobiliarioOfferBlock,
  buildBareMobiliarioCatalogLinks,
  isMobiliarioPieceMenuReply,
} from "../services/serviceProgressiveOffer.js";
import {
  applyLucyMessageGuards,
  buildPackageCatalogOfferBlock,
  buildMappedCatalogOfferBlock,
} from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.84");

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

// 1) Bloque bare: ambos links + pregunta de pieza.
{
  const block = buildBareMobiliarioOfferBlock();
  assert.ok(isMobiliarioPieceMenuReply(block), block);
  assert.match(block, /mesas y sillas/i);
  assert.match(block, /periqueras/i);
  assert.match(block, /mesas-y-sillas/);
  assert.match(block, /salas-y-periqueras/);
  assert.ok(!/^https?:\/\/[^\s]+ ¿/m.test(block), block);
  const links = buildBareMobiliarioCatalogLinks();
  assert.match(links, /mesas-y-sillas/);
  assert.match(links, /salas-y-periqueras/);
}

// 2) Mapped "Mobiliario" suelto ≠ hub genérico.
{
  const mapped = buildMappedCatalogOfferBlock(["Mobiliario"], "So mobiliario");
  assert.match(mapped, /mesas-y-sillas/);
  assert.match(mapped, /salas-y-periqueras/);
  assert.ok(!/^Te dejo el catálogo general/i.test(mapped), mapped);
  const pkg = buildPackageCatalogOfferBlock(["Mobiliario"], "Solo mobiliario");
  assert.match(pkg, /mesas-y-sillas/);
  assert.match(pkg, /salas-y-periqueras/);
}

// 3) Turno completo: "So mobiliario" tras fin de año.
{
  const extracted = emptyExtracted({
    nombre: "Carlos Pizá",
    tipo_evento: "evento corporativo de fin de año",
    requerimientos_evento: null,
  });
  const filled = new Set(["Nombre del cliente", "Tipo de evento"]);
  const reply = applyLucyMessageGuards({
    aiResponse: "https://bodasesor.com/catalogos ¿Tienen un estimado de invitados?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      {
        role: "assistant",
        content:
          "Excelente. Para ir armando la propuesta… banquetes, barras, mobiliario… ¿Qué te gustaría revisar primero?",
      },
    ] as never,
    currentMessage: "So mobiliario",
    whatsappDisplayName: "Carlos Pizá",
    buildClosing: () => "Perfecto, ya tengo todo.",
  });
  assert.match(reply, /mobiliario/i);
  assert.match(reply, /mesas y sillas/i);
  assert.match(reply, /periqueras/i);
  assert.match(reply, /mesas-y-sillas/);
  assert.match(reply, /salas-y-periqueras/);
  assert.ok(!/catalogos ¿Tienen/i.test(reply), reply.slice(0, 300));
  assert.ok(
    extracted.requerimientos_evento && /mobiliario/i.test(extracted.requerimientos_evento),
    String(extracted.requerimientos_evento)
  );
}

console.log("V9.84 class smoke OK —", LUCY_PROMPT_VERSION);
