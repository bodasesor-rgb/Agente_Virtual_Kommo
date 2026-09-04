/**
 * Smoke V9.69 — generalización por *clase* de error (no un ticket literal).
 * Variantes × rutas: meal-tipo, ciudad, cotización prematura, nombre-basura, intro.
 * node ./scripts/run-v967-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  isServicePreferenceAsNombre,
  isLikelyNotPersonNameMessage,
  sanitizeCrmNombre,
  sanitizeDisplayName,
} from "../contact-name.js";
import {
  isEventTypeMealPhrase,
  clientWantsQuoteDelivery,
  hasCityOrMetroSignal,
  parseZonaFromText,
  parseInvitadosFromText,
  stripPromoTemplateMetadata,
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

assert.equal(LUCY_PROMPT_VERSION, "V9.69");

// ── Clase meal-as-event-type (A15642+) ──
for (const phrase of [
  "Es una comida para el sábado 12 de septiembre",
  "Es una cena para el viernes 20 de octubre",
  "Sería un brunch para el domingo",
  "Es un almuerzo para el 5 de noviembre",
]) {
  assert.ok(isEventTypeMealPhrase(phrase), phrase);
}

assert.equal(isEventTypeMealPhrase("Quiero cotizar comida para 80 personas"), false);
assert.equal(isEventTypeMealPhrase("Necesito catering de banquete"), false);

{
  const filled = new Set<string>(["Nombre del cliente", "Requerimientos o servicios"]);
  const extracted = emptyExtracted({
    nombre: "Paloma",
    requerimientos_evento: "Mesas, sillas, plato trinche",
  });
  const reply = applyLucyMessageGuards({
    aiResponse:
      "Perfecto. Te paso opciones de *alimentos*: banquete, taquiza o coffee break. ¿Cuál te late?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      { role: "assistant", content: "Hola, soy Lucy de Bodasesor. ¿Qué necesitas?" },
      { role: "user", content: "Mesas y sillas" },
    ],
    currentMessage: "Es una cena para el sábado 12 de septiembre",
    whatsappDisplayName: "Paloma",
    buildClosing: () => "Cierre",
    cierreYaEnviado: false,
  });
  assert.ok(/cena/i.test(reply), reply.slice(0, 400));
  assert.ok(!/banquete|taquiza|coffee\s*break/i.test(reply), reply.slice(0, 400));
}

// ── Clase ciudad usable (A15701+) ──
for (const city of ["Puerto Vallarta", "Sayulita", "Huatulco", "Cancún", "San Miguel de Allende"]) {
  assert.ok(hasCityOrMetroSignal(city), city);
  const z = parseZonaFromText(city);
  assert.ok(z && hasCityOrMetroSignal(z), `${city} → ${z}`);
}

{
  const filled = new Set<string>(["Nombre del cliente", "Tipo de evento"]);
  const extracted = emptyExtracted({
    nombre: "Alejandra",
    tipo_evento: "boda",
  });
  const reply = applyLucyMessageGuards({
    aiResponse: "¿En qué ciudad sería tu evento?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      { role: "assistant", content: "Hola, soy Lucy. ¿Qué tipo de evento?" },
      { role: "user", content: "Boda" },
      { role: "assistant", content: "¿En qué ciudad sería?" },
    ],
    currentMessage: "Huatulco",
    whatsappDisplayName: "Alejandra",
    buildClosing: () => "Cierre",
    cierreYaEnviado: false,
  });
  assert.ok(/Huatulco/i.test(reply), reply.slice(0, 400));
  assert.ok(!/qu[eé] ciudad|en qu[eé] ciudad/i.test(reply), reply.slice(0, 400));
}

// ── Clase cotización ≠ entrega prematura (A15707+) ──
assert.equal(
  clientWantsQuoteDelivery("Quiero hacer una cotización de sushi para 40 personas"),
  false
);
assert.equal(clientWantsQuoteDelivery("Mándame la cotización por favor"), true);

{
  const filled = new Set<string>();
  const extracted = emptyExtracted({ nombre: "Dany" });
  const reply = applyLucyMessageGuards({
    aiResponse:
      "Claro, Dany. Nuestro equipo te arma la cotización con lo que ya platicamos. ¿Me regalas tu nombre?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [],
    currentMessage: "Quiero hacer una cotización de barra de sushi para 50 personas",
    whatsappDisplayName: "danymelgozza",
    buildClosing: () => "Cierre",
    cierreYaEnviado: false,
    forceFirstPresentation: true,
  });
  assert.ok(!/ya platicamos/i.test(reply), reply.slice(0, 500));
}

// Early-return path (asistente ya habló, sin embudo) tampoco debe decir "ya platicamos".
{
  const filled = new Set<string>(["Nombre del cliente"]);
  const extracted = emptyExtracted({ nombre: "Itzel" });
  const reply = applyLucyMessageGuards({
    aiResponse: "¿En qué te ayudo?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [{ role: "assistant", content: "Hola, soy Lucy de Bodasesor. ¿Cómo te llamas?" }],
    currentMessage: "Mándame la cotización por favor",
    whatsappDisplayName: "Itzel",
    buildClosing: () => "Cierre",
    cierreYaEnviado: false,
  });
  assert.ok(!/ya platicamos/i.test(reply), reply.slice(0, 500));
}

// ── Clase intro repetida (A15708+) — early return de ventas también strippea ──
{
  const filled = new Set<string>(["Nombre del cliente", "Tipo de evento"]);
  const extracted = emptyExtracted({ nombre: "Itzel", tipo_evento: "XV años" });
  const reply = applyLucyMessageGuards({
    aiResponse:
      "¡Hola! Soy Lucy de Bodasesor. Perfecto, Itzel. ¿Cuántos invitados aproximadamente?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      {
        role: "assistant",
        content: "¡Hola! Soy Lucy de Bodasesor. Estoy aquí para ayudarte. ¿Cómo te llamas?",
      },
      { role: "user", content: "Itzel" },
    ],
    currentMessage: "XV años",
    whatsappDisplayName: "Itzel",
    buildClosing: () => "Cierre",
    cierreYaEnviado: false,
  });
  const soyLucyCount = (reply.match(/Soy Lucy/gi) ?? []).length;
  assert.equal(soyLucyCount, 0, reply.slice(0, 500));
}

// ── Clase preferencia-servicio ≠ nombre (A15705+) ──
for (const junk of [
  "Sería De Catering",
  "Prefiero banquete",
  "Solo mobiliario",
  "De Taquiza",
  "Sería coffee break",
]) {
  assert.ok(isServicePreferenceAsNombre(junk), junk);
  assert.ok(isLikelyNotPersonNameMessage(junk), junk);
  assert.equal(sanitizeCrmNombre(junk), null, junk);
  assert.equal(sanitizeDisplayName(junk), null, junk);
}

assert.ok(!isServicePreferenceAsNombre("Karla Rodríguez"));
assert.ok(!isLikelyNotPersonNameMessage("Karla Rodríguez"));

// ── Clase promo mínimo ≠ invitados (A15620+) ──
assert.equal(parseInvitadosFromText("Pedido mínimo: 30 personas"), null);
assert.equal(parseInvitadosFromText("Mínimo 50 personas — horario en que envío este mensaje: 10:00"), null);
assert.equal(
  parseInvitadosFromText(
    stripPromoTemplateMetadata("Pedido mínimo: 30 personas. Serían 120 invitados")
  ),
  "120"
);

console.log("V9.69 class smoke OK");
