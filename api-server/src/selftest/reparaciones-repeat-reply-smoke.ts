/**
 * Smoke — repeat_reply (lead 27458154): saludo + pitch + pregunta en una sola línea se
 * reenviaba casi textual porque avoidRepeatPreviousReply solo recortaba por líneas.
 *
 * npx --yes tsx ./src/selftest/reparaciones-repeat-reply-smoke.ts
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

const nextDraft =
  "¡Mucho gusto, Cynthia! Para poder orientarte mejor con la propuesta de entelado, " +
  "¿me podrías contar qué tipo de evento vas a celebrar?";

const out = avoidRepeatPreviousReply(nextDraft, history);
assert.notEqual(out, nextDraft, out);
assert.ok(!/mucho gusto/i.test(out), out);
assert.ok(!/propuesta de entelado/i.test(out), out);
assert.match(out, /tipo de evento/i, out);

const identicalOut = avoidRepeatPreviousReply(previousReply, history);
assert.notEqual(identicalOut, previousReply, identicalOut);
assert.ok(!/mucho gusto/i.test(identicalOut), identicalOut);

const distinctDraft = "Perfecto, anoto que es una boda. ¿Cuántos invitados esperan?";
assert.equal(avoidRepeatPreviousReply(distinctDraft, history), distinctDraft);

const multiLinePrev =
  "Perfecto — anoto *Entelados para Techo* para tu cotización.\n\n" +
  "Catálogo de *entelados*:\nhttps://bodasesor.com/catalogos/entelados-para-techo\n\n" +
  "¿Cuánto mide el espacio (largo × ancho)?";
const multiLineDraft =
  "Perfecto — anoto *Entelados para Techo* para tu cotización.\n\n" +
  "Catálogo de *entelados*:\nhttps://bodasesor.com/catalogos/entelados-para-techo\n\n" +
  "¿A qué correo te comparto la propuesta?";
const multiLineOut = avoidRepeatPreviousReply(multiLineDraft, [{ role: "assistant", content: multiLinePrev }]);
assert.match(multiLineOut, /correo/i, multiLineOut);

console.log("reparaciones-repeat-reply smoke OK");
