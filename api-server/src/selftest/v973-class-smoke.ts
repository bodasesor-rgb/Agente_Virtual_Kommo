/**
 * Smoke V9.73 — carpas: 1.5 m² por invitado (100 → 150 m²).
 * node ./scripts/run-v973-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  buildCarpaGuestRecommendationLine,
  recommendCarpaAreaM2ForGuests,
  recommendCarpaDimensionsForGuests,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards, buildDimensionRecommendationReply } from "../lucy-flow-guards.js";
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

assert.equal(recommendCarpaAreaM2ForGuests(100), 150);
assert.equal(recommendCarpaAreaM2ForGuests(60), 90);
assert.match(recommendCarpaDimensionsForGuests(100), /150\s*m/i);
assert.match(buildCarpaGuestRecommendationLine(100) ?? "", /150\s*m/i);
assert.match(buildCarpaGuestRecommendationLine(100) ?? "", /1\.5/);

{
  const extracted = emptyExtracted({
    nombre: "Ismael",
    requerimientos_evento: "Carpas",
    num_invitados: 100,
  });
  const reply = buildDimensionRecommendationReply(
    extracted,
    "Qu\u00e9 tama\u00f1o de carpa me recomiendas seg\u00fan los invitados?"
  );
  assert.ok(reply);
  assert.match(reply!, /150/i);
  assert.match(reply!, /c\u00f3modos|comodos/i);
}

{
  const filled = new Set<string>(["Nombre del cliente", "Requerimientos o servicios", "Tipo de evento"]);
  const extracted = emptyExtracted({
    nombre: "Ismael",
    tipo_evento: "boda",
    requerimientos_evento: "Carpas",
  });
  const reply = applyLucyMessageGuards({
    aiResponse: "Perfecto. \u00bfQu\u00e9 d\u00eda tienen en mente?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      {
        role: "assistant",
        content:
          "Anoto tu boda, Ismael. Con gusto te apoyamos con la carpa; \u00bfaproximadamente cu\u00e1ntos invitados tienen contemplados?",
      },
    ],
    currentMessage: "100 personas",
    whatsappDisplayName: "Ismael Garcia Reza",
    entityId: "A15791-carpa-m2",
  });
  assert.equal(extracted.num_invitados, 100);
  assert.match(reply, /150/i);
  assert.match(reply, /1\.5|m\u00b2|m2|metros/i);
  assert.match(extracted.requerimientos_evento ?? "", /150|ref\./i);
}

console.log("V9.73 class smoke OK");
