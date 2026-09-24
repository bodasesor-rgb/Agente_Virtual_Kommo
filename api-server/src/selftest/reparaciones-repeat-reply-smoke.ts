/**
 * Smoke — Reparaciones panel: repair 47a7e9a2-234f-409d-acb7-2b963d8f3900 (lead 27458154).
 * "repeat_reply" (severity warn): evidencia real — «¡mucho gusto, cynthia! para poder
 * orientarte mejor con la propuesta de entelado, ¿nos podrías contar qué tipo de
 * evento…» se repitió casi textual porque el cliente volvió a nombrar el servicio en
 * turnos seguidos sin contestar el dato que Lucy seguía pidiendo. Este smoke reproduce
 * el mismo patrón (servicio + pregunta de embudo repetida casi textual) con un caso
 * genérico (iluminación / invitados) para no acoplarse a la lógica especial de medidas
 * de entelado/carpas.
 *
 * avoidRepeatPreviousReply() (lucy-flow-guards.ts) detectaba el solape alto pero,
 * si ninguna variante corta bajaba el solape, igual devolvía el mismo cuerpo — el
 * fix la hace avanzar el embudo con una redacción distinta (buildNaturalQuestion)
 * en vez de reenviar la pregunta idéntica.
 *
 * node ./scripts/run-reparaciones-repeat-reply-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { lucyTextOverlapRatio } from "../lucyOutboundAntiRepeat.js";
import type { ExtractedData } from "../types.js";

function emptyExtracted(partial: Partial<ExtractedData> = {}): ExtractedData {
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
    ...partial,
  };
}

const PREV_LUCY_REPLY =
  "¡Mucho gusto, Cynthia! Para armar bien la propuesta de iluminación, cuéntame, " +
  "¿para cuántas personas sería el evento?";

const extracted = emptyExtracted({
  nombre: "Cynthia",
  tipo_evento: "boda",
  requerimientos_evento: "Iluminación decorativa",
});
const filled = new Set([
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
]);
const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "user", content: "Hola, me llamo Cynthia, mi boda necesita iluminación decorativa" },
  { role: "assistant", content: PREV_LUCY_REPLY },
  // El cliente vuelve a mencionar el servicio sin contestar cuántos invitados son.
  { role: "user", content: "Sí, la iluminación decorativa es justo lo que quiero para mi boda" },
];

// El LLM redacta casi lo mismo que el turno anterior (misma estructura "propuesta de
// iluminación" + "cuántas personas") porque el cliente volvió a mencionar el servicio.
const aiResponseNearDuplicate =
  "¡Mucho gusto, Cynthia! Para armar bien la propuesta de iluminación, platícame, " +
  "¿para cuántas personas sería tu evento?";

const out = applyLucyMessageGuards({
  aiResponse: aiResponseNearDuplicate,
  extracted,
  filledSet: filled,
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history,
  currentMessage: "Sí, la iluminación decorativa es justo lo que quiero para mi boda",
  buildClosing: () => "CIERRE",
});

assert.match(out, /\?/, out);

const overlapWithPrev = lucyTextOverlapRatio(out, PREV_LUCY_REPLY);
assert.ok(
  overlapWithPrev < 0.72,
  `no debe reenviar casi el mismo cuerpo que la pregunta previa (overlap=${overlapWithPrev}): ${out}`
);

// Sigue pidiendo invitados (dato real pendiente) — no lo brincamos, solo cambia
// la redacción para no repetir el mismo texto.
assert.ok(
  /cu[aá]ntos?\s+(invitados|personas)|personas\s+(tienen|ser[ií]a)|invitados/i.test(out),
  out
);

console.log("reparaciones-repeat-reply smoke OK");
