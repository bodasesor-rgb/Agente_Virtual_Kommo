/**
 * Smoke — repeat_reply (auditor reparaciones, severity warn).
 *
 * Repair (lead 27458154): Lucy reenviaba casi textual el mismo saludo + pitch de
 * servicio + pregunta de embudo en dos turnos seguidos porque el mensaje era una
 * sola línea (sin "\n"), y `avoidRepeatPreviousReply` solo sabía recortar por
 * líneas — con todo en una línea, el "último recurso" devolvía el mensaje
 * prácticamente sin cambios.
 *
 * Evidencia real: «¡mucho gusto, cynthia! para poder orientarte mejor con la
 * propuesta de entelado, ¿nos podrías contar qué tipo de evento…»
 *
 * node ./scripts/run-reparaciones-repeat-reply-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { avoidRepeatPreviousReply } from "../lucy-flow-guards.js";

const previousReply =
  "¡Mucho gusto, Cynthia! Para poder orientarte mejor con la propuesta de entelado, " +
  "¿nos podrías contar qué tipo de evento vas a celebrar?";

const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "user", content: "Hola, quiero información de entelado" },
  { role: "assistant", content: previousReply },
  { role: "user", content: "mmm no sé, cuéntame más" },
];

// GPT vuelve a redactar casi lo mismo (mismo saludo + mismo pitch de entelado +
// misma pregunta de tipo de evento) porque el cliente no contestó el dato pedido.
const nextDraft =
  "¡Mucho gusto, Cynthia! Para poder orientarte mejor con la propuesta de entelado, " +
  "¿me podrías contar qué tipo de evento vas a celebrar?";

const out = avoidRepeatPreviousReply(nextDraft, history);

assert.notEqual(out, nextDraft, `debería recortar el pitch repetido, no reenviarlo tal cual: "${out}"`);
assert.ok(out.length < nextDraft.length, `la salida debe ser más corta que el borrador repetido: "${out}"`);
assert.ok(!/mucho gusto/i.test(out), `no debe repetir el saludo: "${out}"`);
assert.ok(!/propuesta de entelado/i.test(out), `no debe repetir el pitch de servicio: "${out}"`);
assert.match(out, /\?/, `debe conservar una pregunta: "${out}"`);
assert.match(out, /tipo de evento/i, `debe conservar la pregunta de fondo: "${out}"`);

// Reproducción exacta del caso reportado (mismo texto, sin variación alguna):
// tampoco debe reenviarse íntegro.
const identicalOut = avoidRepeatPreviousReply(previousReply, history);
assert.notEqual(identicalOut, previousReply, `mensaje idéntico no debe reenviarse tal cual: "${identicalOut}"`);
assert.ok(!/mucho gusto/i.test(identicalOut), identicalOut);

// Control: mensaje sin solape real con el historial no debe tocarse.
const distinctDraft = "Perfecto, anoto que es una boda. ¿Cuántos invitados esperan?";
assert.equal(avoidRepeatPreviousReply(distinctDraft, history), distinctDraft);

// Control: comportamiento previo con mensajes multilínea (recorte por línea de
// pregunta) sigue funcionando sin regresión.
const multiLinePrev =
  "Perfecto — anoto *Entelados para Techo* para tu cotización.\n\n" +
  "Catálogo de *entelados*:\nhttps://bodasesor.com/catalogos/entelados-para-techo\n\n" +
  "¿Cuánto mide el espacio (largo × ancho)?";
const multiLineHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "assistant", content: multiLinePrev },
];
const multiLineDraft =
  "Perfecto — anoto *Entelados para Techo* para tu cotización.\n\n" +
  "Catálogo de *entelados*:\nhttps://bodasesor.com/catalogos/entelados-para-techo\n\n" +
  "¿A qué correo te comparto la propuesta?";
const multiLineOut = avoidRepeatPreviousReply(multiLineDraft, multiLineHistory);
assert.match(multiLineOut, /correo/i, multiLineOut);

console.log("reparaciones-repeat-reply smoke OK");
