/**
 * Smoke V9.70 — clase A15758+: Sofy Zavala no se acorta; solo seria barra = solo alimentos;
 * no dump de catalogo al capturar horario.
 * node ./scripts/run-v970-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  stripNombrePresentationPrefix,
  parseHorarioFromText,
} from "../conversation-understanding.js";
import { stripUnsolicitedCatalogWebLinks } from "../services/catalogService.js";
import {
  shouldUpdateName,
  pickBetterNombre,
  resolveKommoLeadNamePatch,
  namesAreLikelySamePerson,
  namesShareNicknameRoot,
  sanitizeCrmNombre,
} from "../contact-name.js";
import {
  clientChoseSoloFoodStation,
  messageHasSoloCompletoNivelOrMode,
} from "../services/serviceProgressiveOffer.js";
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

assert.equal(LUCY_PROMPT_VERSION, "V9.70");

// Nombre: Sofy Zavala no degradar a Sofia / Sofia con tilde
assert.ok(namesShareNicknameRoot("Sofy", "Sofia"));
assert.ok(namesShareNicknameRoot("Sofy", "Sof\u00eda"));
assert.ok(namesAreLikelySamePerson("Sofy Zavala", "Sof\u00eda"));
assert.equal(shouldUpdateName("Sofy Zavala", "Sof\u00eda"), false);
assert.equal(resolveKommoLeadNamePatch("Sofy Zavala", "Sof\u00eda"), null);
assert.equal(pickBetterNombre("Sof\u00eda", "Sofy Zavala"), "Sofy Zavala");
assert.equal(sanitizeCrmNombre("Es Sof\u00eda"), "Sof\u00eda");
assert.equal(stripNombrePresentationPrefix("Es Sof\u00eda"), "Sof\u00eda");

// Solo seria barra de pizzas = solo alimentos
assert.ok(clientChoseSoloFoodStation("Solo ser\u00eda barra de pizzas"));
assert.ok(messageHasSoloCompletoNivelOrMode("Solo ser\u00eda barra de pizzas"));
{
  const filled = new Set<string>(["Nombre del cliente", "Requerimientos o servicios"]);
  const extracted = emptyExtracted({
    nombre: "Sofy Zavala",
    requerimientos_evento: "Barra de pizzas",
  });
  const reply = applyLucyMessageGuards({
    aiResponse:
      "Claro. En *Barra de pizzas* tenemos *solo alimentos* o *servicio completo*. \u00bfCu\u00e1l te late m\u00e1s? \u00bfQu\u00e9 tipo de evento es?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      {
        role: "assistant",
        content:
          "Claro. En *Barra de pizzas* tenemos *solo alimentos* o *servicio completo* (bebidas, mobiliario y meseros). \u00bfCu\u00e1l te late m\u00e1s? \u00bfMe regalas tu nombre?",
      },
    ],
    currentMessage: "Solo ser\u00eda barra de pizzas",
    whatsappDisplayName: "Sofy Zavala",
    entityId: "A15758-solo",
  });
  assert.ok(/solo alimentos/i.test(reply), reply);
  assert.ok(!/cu[a\u00e1]l te late m[a\u00e1]s/i.test(reply), reply);
  assert.ok(/tipo de evento|celebr|evento/i.test(reply), reply);
  assert.ok(
    /solo alimentos/i.test(extracted.requerimientos_evento ?? ""),
    extracted.requerimientos_evento
  );
  assert.ok(
    !/pastas/i.test(extracted.requerimientos_evento ?? ""),
    extracted.requerimientos_evento
  );
}

// Horario: no dump catalogo
{
  const filled = new Set<string>([
    "Nombre del cliente",
    "Tipo de evento",
    "N\u00famero de invitados",
    "Fecha del evento",
    "Requerimientos o servicios",
  ]);
  const extracted = emptyExtracted({
    nombre: "Sofy Zavala",
    tipo_evento: "despedida de soltero",
    num_invitados: 70,
    fecha_evento: "28 de noviembre",
    requerimientos_evento: "Barra de pizzas (solo alimentos)",
  });
  const reply = applyLucyMessageGuards({
    aiResponse:
      "https://bodasesor.com/catalogos/barra-de-pizzas Entendido. \u00bfEn qu\u00e9 ciudad lo arman?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [{ role: "assistant", content: "\u00bfEn qu\u00e9 horario lo planean?" }],
    currentMessage: "Necesitar\u00edamos las pizzas a las 7 pm",
    whatsappDisplayName: "Sofy Zavala",
    entityId: "A15758-horario",
  });
  assert.ok(parseHorarioFromText("Necesitar\u00edamos las pizzas a las 7 pm"));
  assert.ok(!/bodasesor\.com\/catalogos/i.test(reply), reply);
  assert.ok(/ciudad|ubicaci|d[o\u00f3]nde|arman/i.test(reply), reply);
}

assert.ok(
  !/catalogos/i.test(
    stripUnsolicitedCatalogWebLinks(
      "https://bodasesor.com/catalogos/barra-de-pizzas Entendido. Ciudad?",
      false
    )
  )
);

console.log("V9.70 class smoke OK");
