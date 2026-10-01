/**
 * Smoke A16555 Sarai — "Quiero saber si vendes mobiliario" / "Mesas para comprarles":
 * compra de mobiliario, no renta para un evento. Lucy no pregunta tipo de evento, fecha,
 * horario ni invitados, ni habla de "tu evento"/"montaje"; pide piezas, ciudad de entrega,
 * correo y presupuesto.
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { clientWantsToBuyMobiliario, isVentaMobiliarioReq } from "../conversation-understanding.js";
import {
  applyLucyMessageGuards,
  buildNaturalQuestion,
  getNextPendingField,
  isReadyForClosing,
  markVentaMobiliarioMode,
  VENTA_MOBILIARIO_MARK,
} from "../lucy-flow-guards.js";
import type { ExtractedData } from "../types.js";

const u = (c: string) => ({ role: "user", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;
const a = (c: string) => ({ role: "assistant", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;

assert.equal(clientWantsToBuyMobiliario("Mesas para comprarles"), true);
assert.equal(clientWantsToBuyMobiliario("Quiero saber si vendes mobiliario"), true);
assert.equal(clientWantsToBuyMobiliario("quiero comprar 20 sillas tiffany"), true);
assert.equal(clientWantsToBuyMobiliario("quiero rentar mesas para mi boda"), false);
assert.equal(clientWantsToBuyMobiliario("necesito 10 mesas y 100 sillas"), false);
assert.equal(isVentaMobiliarioReq("Mobiliario (venta)"), true);
assert.equal(isVentaMobiliarioReq("Mobiliario"), false);

const EVENT_Q = /tipo de evento|celebr|qu[eé] fecha|horario|invitados|tu evento|montaje/i;

{
  const extracted: ExtractedData = { tipo_contacto: "cliente", nombre: "Sarai", requerimientos_evento: "Mobiliario" };
  const filledSet = new Set(["Nombre del cliente", "Requerimientos o servicios"]);
  const history = [u("Quiero saber si vendes mobiliario"), a("¡Hola! ¿Cuál es tu nombre?")];
  assert.equal(markVentaMobiliarioMode({ extracted, filledSet, history, currentMessage: "Mesas para comprarles" }), true);
  assert.equal(extracted.requerimientos_evento, "Mobiliario (venta)");
  assert.ok(filledSet.has(VENTA_MOBILIARIO_MARK));
  assert.equal(getNextPendingField(extracted, filledSet), "zona");
  const q = buildNaturalQuestion("zona", { extracted, filledSet, history, currentMessage: "Mesas para comprarles" } as any);
  assert.match(q, /piezas.*entrega/i, q);

  extracted.direccion_evento = "Monterrey";
  filledSet.add("Lugar/dirección del evento");
  assert.equal(getNextPendingField(extracted, filledSet), "correo");
  assert.equal(isReadyForClosing(filledSet), false);
  filledSet.add("Correo electrónico");
  filledSet.add("Presupuesto (MXN)");
  assert.equal(isReadyForClosing(filledSet), true, "venta cierra sin tipo/fecha/invitados");
}

function run(
  aiResponse: string,
  currentMessage: string,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  ex: Partial<ExtractedData>,
  filled: string[]
) {
  const extracted = { tipo_contacto: "cliente", ...ex } as ExtractedData;
  const out = applyLucyMessageGuards({
    aiResponse,
    extracted,
    filledSet: new Set(filled),
    history,
    currentMessage,
    entityId: "A16555",
    readyForClosing: false,
    cierreYaEnviado: false,
    emailRefusedThisTurn: false,
    forceFirstPresentation: false,
    buildClosing: () => "CIERRE",
    whatsappDisplayName: "Sarai",
  } as any);
  return { out, extracted };
}

const H = [
  u("Quiero saber si vendes mobiliario"),
  a("¡Hola, Sarai! Nos enfocamos más en *renta*, pero con gusto te podemos cotizar para *venta*. ¿Qué piezas te interesan?"),
  u("Mesas para comprarles"),
  a("De acuerdo. ¿Cuántas piezas de cada modelo necesitas y a qué ciudad sería la entrega?"),
];

{
  const { out } = run(
    "¡Qué buen gusto tienes! Esa combinación de la mesa de mármol con las sillas Camila se ve increíble. Ya la anoté en tu carpeta para que la consideremos en el montaje de tu evento. ¿Qué tipo de evento es?",
    "[Imagen] Me interesan de esos 2 modelos",
    H,
    { nombre: "Sarai", requerimientos_evento: "Mobiliario" },
    ["Nombre del cliente", "Requerimientos o servicios"]
  );
  assert.doesNotMatch(out, EVENT_Q, out);
  assert.match(out, /\?/, out);
}

{
  const { out, extracted } = run(
    "Perfecto. ¿Para qué fecha sería tu evento?",
    "Unas 10 mesas y 80 sillas, en Monterrey",
    [...H, u("[Imagen] Me interesan de esos 2 modelos"), a("Claro que sí. Sarai, ¿me confirmas la *ciudad* de entrega?")],
    { nombre: "Sarai", requerimientos_evento: "Mobiliario", direccion_evento: "Monterrey" },
    ["Nombre del cliente", "Requerimientos o servicios", "Lugar/dirección del evento"]
  );
  assert.doesNotMatch(out, EVENT_Q, out);
  assert.match(out, /correo/i, out);
  assert.ok(isVentaMobiliarioReq(extracted.requerimientos_evento), String(extracted.requerimientos_evento));
}

// Renta normal: sigue el embudo de evento.
{
  const extracted: ExtractedData = { tipo_contacto: "cliente", nombre: "Ana", requerimientos_evento: "Mobiliario" };
  const filledSet = new Set(["Nombre del cliente", "Requerimientos o servicios"]);
  assert.equal(
    markVentaMobiliarioMode({ extracted, filledSet, history: [u("quiero rentar mesas para mi boda")], currentMessage: "somos 100" }),
    false
  );
  assert.ok(!filledSet.has(VENTA_MOBILIARIO_MARK));
}

console.log("a16555-smoke OK");
