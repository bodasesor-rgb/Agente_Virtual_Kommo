/**
 * Smoke A16095 Jhony — cumpleaños ≠ dirección; visita mid-funnel; no cierre sin zona real.
 * node ./scripts/run-a16095-smoke.mjs
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  clientAsksLocation,
  inferLucyAskedField,
  isUsableDireccionEvento,
  parseTipoEventoFromText,
  sanitizeDireccionCapture,
} from "../conversation-understanding.js";
import {
  applyLucyMessageGuards,
  buildLocationAnswer,
  getNextPendingField,
  isReadyForClosing,
} from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.07");

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

const suegra = "Un cumpleaños de mi suegra";
assert.equal(parseTipoEventoFromText(suegra), "cumpleaños");
assert.equal(sanitizeDireccionCapture(suegra), null);
assert.equal(isUsableDireccionEvento(suegra), false);
assert.equal(
  inferLucyAskedField("¡Mucho gusto, Jhony! ¿Qué van a celebrar?"),
  "tipo_evento"
);

const visit = "Disculpe tendrá un lugar para poder visitarlos";
assert.ok(clientAsksLocation(visit), visit);
assert.ok(/digital|showroom|visitar/i.test(buildLocationAnswer(visit)), buildLocationAnswer(visit));

// Basura en dirección no debe cerrar ni saltar zona.
const filledJunk = new Set<string>([
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Lugar/dirección del evento",
  "Fecha del evento",
  "Horario del evento",
  "Número de invitados",
  "Correo electrónico",
  "Presupuesto (MXN)",
]);
const extractedJunk = emptyExtracted({
  nombre: "Jhony",
  tipo_evento: "cumpleaños",
  requerimientos_evento: "Barra de bebidas",
  direccion_evento: suegra,
  fecha_evento: "31 de octubre",
  horario_evento: "5pm",
  num_invitados: 50,
  correo: "jhonbarbax@gmail.com",
  presupuesto: "Sin definir (cliente pidió que propongamos)",
});
assert.equal(getNextPendingField(extractedJunk, filledJunk), "zona");
assert.equal(extractedJunk.direccion_evento, null);
assert.equal(isReadyForClosing(filledJunk), false);

// Mid-funnel visita: responder sede + seguir embudo (pedir zona), no presupuesto/cierre.
const filledMid = new Set<string>([
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Fecha del evento",
  "Horario del evento",
  "Número de invitados",
  "Correo electrónico",
]);
const extractedMid = emptyExtracted({
  nombre: "Jhony",
  tipo_evento: "cumpleaños",
  requerimientos_evento: "Barra de bebidas",
  fecha_evento: "31 de octubre",
  horario_evento: "5pm",
  num_invitados: 50,
  correo: "jhonbarbax@gmail.com",
});
const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "user", content: "Quiero hacer una cotizacion" },
  { role: "assistant", content: "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. ¿Me regalas tu nombre?" },
  { role: "user", content: "Jhony" },
  { role: "assistant", content: "¡Mucho gusto, Jhony! ¿Qué van a celebrar?" },
  { role: "user", content: suegra },
  { role: "assistant", content: "Con gusto te apoyo con tu cumpleaños. ¿Qué servicios necesitas?" },
  { role: "user", content: "Solo quiero la barra de bebidas" },
  { role: "assistant", content: "Con gusto. ¿Tienen un estimado de invitados?" },
  { role: "user", content: "50 personas" },
  { role: "assistant", content: "¿Ya tienen fecha o todavía la van definiendo?" },
  { role: "user", content: "31 de octubre" },
  { role: "assistant", content: "Perfecto, Jhony. ¿En qué horario lo planean?" },
  { role: "user", content: "5pm" },
  { role: "assistant", content: "Perfecto. Anoto el horario *5pm*. Si gustas, ¿a qué correo le paso la info a nuestro equipo?" },
  { role: "user", content: "jhonbarbax@gmail.com" },
];

const out = applyLucyMessageGuards({
  aiResponse:
    "Gracias por tu correo. Para terminar de armar la propuesta, ¿tienes algún presupuesto estimado?",
  extracted: extractedMid,
  filledSet: filledMid,
  history,
  currentMessage: visit,
  entityId: "A16095",
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  forceFirstPresentation: false,
  buildClosing: () => "Perfecto, ya tengo todo. Voy a compartir esta información con nuestro equipo.",
  whatsappDisplayName: "Jhony",
});

assert.ok(!/Perfecto, ya tengo todo/i.test(out), out);
assert.ok(!/presupuesto estimado/i.test(out), out);
assert.ok(/Ciudad de M[eé]xico|rep[uú]blica|digital|showroom/i.test(out), out);
assert.ok(/ciudad|zona|lugar|ubicaci[oó]n|d[oó]nde/i.test(out), out);

console.log("a16095-smoke OK", LUCY_PROMPT_VERSION);
