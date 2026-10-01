/**
 * Smoke — repeat_reply (auditor reparaciones, severity warn).
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

const nextDraft =
  "¡Mucho gusto, Cynthia! Para poder orientarte mejor con la propuesta de entelado, " +
  "¿me podrías contar qué tipo de evento vas a celebrar?";

const out = avoidRepeatPreviousReply(nextDraft, history);

assert.notEqual(out, nextDraft, `debería recortar el pitch repetido: "${out}"`);
assert.ok(out.length < nextDraft.length, out);
assert.ok(!/mucho gusto/i.test(out), out);
assert.match(out, /\?/, out);

const identicalOut = avoidRepeatPreviousReply(previousReply, history);
assert.notEqual(identicalOut, previousReply, identicalOut);

console.log("reparaciones-repeat-reply smoke OK");
