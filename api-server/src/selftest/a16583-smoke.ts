/**
 * Smoke A16583 — boda, mobiliario, 2 fotos de montaje:
 * - "de noche" (respuesta al horario) no es dirección → Lucy sí pregunta la ubicación.
 * - "Necesitaba Moviliario" (respuesta a "¿con quién tengo el gusto?") no es nombre.
 * - Foto sin texto: la descripción de Vision ("luces tipo verbena… montaje") no es pregunta de
 *   iluminación, ni servicio nuevo (*Iluminación*), ni pedido de ideas.
 * - "cotízame esas dos imágenes" no es pedir fotos; "solo ocupo lo de las 2 fotos" no recibe
 *   "¿Hay algo más que te gustaría sumar?".
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { isUsableDireccionEvento, parseZonaFromText } from "../conversation-understanding.js";
import { isLikelyNotPersonNameMessage, sanitizeCrmNombre } from "../contact-name.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { finalizeLucyOutboundMessage } from "../lucyOutboundPipeline.js";
import { clientOwnText, formatImageTurnText } from "../services/imageProcessor.js";
import {
  clientAsksAboutLighting,
  clientAsksConcreteProductQuestion,
  clientAsksForPhotos,
} from "../services/concreteProductQuestion.js";
import { clientClosedServiceList, clientWantsIdeasOrTrends } from "../services/trendKnowledge.js";

const u = (c: string) => ({ role: "user", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;
const a = (c: string) => ({ role: "assistant", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;

// Dirección.
for (const t of ["de noche", "De noche", "de tarde", "por la mañana", "de día"]) {
  assert.equal(isUsableDireccionEvento(t), false, t);
  assert.equal(parseZonaFromText(t), null, t);
}
assert.equal(parseZonaFromText("de Puebla"), "Puebla");
assert.ok(isUsableDireccionEvento("Tlalpan"));

// Nombre.
assert.ok(isLikelyNotPersonNameMessage("Necesitaba Moviliario"));
assert.equal(sanitizeCrmNombre("Necesitaba Moviliario"), null);
assert.equal(sanitizeCrmNombre("Rosa María"), "Rosa María");

// Foto sin texto.
const visionReply =
  "¡Qué increíble elección! Me encanta ese estilo de ceremonia con las flores en canastas y la iluminación de verbena entre los árboles. Podemos lograr un montaje así de romántico para tu evento, ¿te gustaría que lo incluyamos en tu cotización?";
const photoTurn = formatImageTurnText({ intent: "montaje_referencia", internalDescription: "x", clientReply: visionReply } as any, "");
assert.equal(clientOwnText(photoTurn), "");
assert.equal(clientOwnText("  hola "), "hola");
assert.ok(!clientAsksAboutLighting(photoTurn));
assert.ok(!clientAsksConcreteProductQuestion(photoTurn));
assert.ok(!clientWantsIdeasOrTrends(photoTurn));
assert.ok(clientAsksAboutLighting("¿la carpa cuenta con luz?"));

// Fotos del cliente vs pedido de fotos.
assert.ok(!clientAsksForPhotos("No, solamente quiero que me cotices, efectivamente esas dos imágenes"));
assert.ok(!clientAsksForPhotos("Pues solo ocupo lo de las 2 fotos"));
assert.ok(clientAsksForPhotos("mándame fotos de las sillas"));
assert.ok(clientAsksForPhotos("pásame esas fotos"));
assert.ok(clientClosedServiceList("Pues solo ocupo lo de las 2 fotos"));
assert.ok(!clientClosedServiceList("quiero mesas y sillas"));

const H = [
  u("hola que tal buenas tardes"),
  a("¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. ¿Con quién tengo el gusto?"),
  u("Rafa, necesito mobiliario"),
  a("¡Mucho gusto, Rafa! ¿Qué tipo de evento van a celebrar?"),
  u("Boda"),
  a("¿Cuántos invitados tienen contemplados?"),
  u("100"),
  a("¿Para qué fecha y en qué horario sería?"),
  u("marzo del 2027"),
  a("¿A qué hora sería el evento?"),
  u("de noche"),
  a("¿A qué correo te lo envío?"),
  u("rp1.isn@gmail.com"),
  a("Gracias. ¿En qué ciudad o zona sería la boda?"),
];
const filled = [
  "Nombre del cliente", "Tipo de evento", "Requerimientos o servicios", "Número de invitados",
  "Fecha del evento", "Horario del evento", "Correo electrónico",
];

async function turn(aiResponse: string, currentMessage: string, history: OpenAI.Chat.ChatCompletionMessageParam[]) {
  const extracted: any = {
    tipo_contacto: "cliente", nombre: "Rafa", tipo_evento: "boda", requerimientos_evento: "Mobiliario",
    num_invitados: 100, fecha_evento: "marzo 2027", horario_evento: "de noche",
    correo: "rp1.isn@gmail.com", direccion_evento: null,
  };
  const filledSet = new Set(filled);
  const guarded = applyLucyMessageGuards({
    aiResponse, extracted, filledSet, history, currentMessage, entityId: "A16583",
    readyForClosing: false, cierreYaEnviado: false, emailRefusedThisTurn: false,
    forceFirstPresentation: false, buildClosing: () => "CIERRE", whatsappDisplayName: "Rafa",
  } as any);
  return finalizeLucyOutboundMessage({
    mensaje: guarded, extracted, readyForClosing: false, cierreYaEnviado: false,
    currentMessage, history, filledSet, openai: null,
  } as any);
}

(async () => {
  const photo = await turn(visionReply, photoTurn, H);
  assert.doesNotMatch(photo, /iluminaci[oó]n\*|lo confirmo con|audio-iluminacion|ideas que funcionan/i, photo);
  assert.match(photo, /ceremonia|montaje/i, photo);
  assert.match(photo, /ubicaci[oó]n|ciudad|colonia|sal[oó]n/i, photo);

  const H2 = [...H, u(photoTurn), a(visionReply), u(photoTurn), a(visionReply)];
  const cotiza = await turn("¡Claro! Con gusto te cotizo ese montaje.", "No, solamente quiero que me cotices, efectivamente esas dos imágenes", H2);
  assert.doesNotMatch(cotiza, /referencias visuales|instagram|catalogos\/mesas-y-sillas/i, cotiza);

  const H3 = [...H2, u("No, solamente quiero que me cotices, efectivamente esas dos imágenes"), a("Perfecto, lo cotizamos.")];
  const solo = await turn(
    "¿Hay algo más que te gustaría sumar a la propuesta? Si necesitas cualquier otra cosa, cuenta conmigo para ayudarte.",
    "Pues solo ocupo lo de las 2 fotos",
    H3
  );
  assert.doesNotMatch(solo, /algo m[aá]s que te gustar|otra cosa/i, solo);
  assert.match(solo, /fotos/i, solo);
  assert.match(solo, /ubicaci[oó]n|ciudad|colonia|sal[oó]n/i, solo);
  console.log("a16583-smoke OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
