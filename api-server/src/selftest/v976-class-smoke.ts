/**
 * Smoke V9.76 — cuando el cliente quiere ver fotos, Lucy pasa el Instagram
 * junto al catálogo; y "¿tienen Instagram?" se responde con la cuenta.
 * node ./scripts/run-v976-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  BODASESOR_INSTAGRAM_URL,
  buildConcreteProductQuestionReply,
  clientAsksConcreteProductQuestion,
  clientAsksForPhotos,
  clientAsksForSocialMedia,
} from "../services/concreteProductQuestion.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.91");

// 1) Pedido de fotos → catálogo + Instagram (los dos, no uno u otro).
{
  for (const msg of [
    "¿Me mandas fotos de las carpas?",
    "Fotos de lo solicitado y si la carpa cuenta con luz",
    "Tienen imágenes de los montajes?",
  ]) {
    assert.ok(clientAsksForPhotos(msg), msg);
    const reply = buildConcreteProductQuestionReply(msg, "Carpas");
    assert.ok(reply, msg);
    assert.match(reply!, /instagram/i, reply!);
    assert.ok(reply!.includes(BODASESOR_INSTAGRAM_URL), reply!);
    assert.match(reply!, /catalogos|cat[aá]logo/i, reply!);
  }
}

// 2) "¿Tienen Instagram?" se responde con la cuenta aunque no pidan fotos.
{
  for (const msg of [
    "¿Tienen Instagram?",
    "Pásame su instagram porfa",
    "¿Cuál es su Facebook?",
    "Me compartes sus redes sociales?",
  ]) {
    assert.ok(clientAsksForSocialMedia(msg), msg);
    assert.ok(clientAsksConcreteProductQuestion(msg), msg);
    const reply = buildConcreteProductQuestionReply(msg);
    assert.ok(reply, msg);
    assert.ok(reply!.includes(BODASESOR_INSTAGRAM_URL), reply!);
  }
}

// 3) Mencionar Instagram como origen no secuestra el turno.
{
  for (const msg of [
    "Hola, los vi en Instagram y quiero cotizar una boda",
    "Vengo de instagram",
    "Los encontré por Facebook, ¿cuánto cuesta un banquete para 100?",
  ]) {
    assert.equal(clientAsksForSocialMedia(msg), false, msg);
  }
}

console.log("V9.76 class smoke OK");
