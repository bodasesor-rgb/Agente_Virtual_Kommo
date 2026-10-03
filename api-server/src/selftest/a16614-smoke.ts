/**
 * Smoke A16614 Emmanuel (posada de empresa, 115 colaboradores):
 * «Busco cotizar un paquete todo incluido, desde el lugar…» → confirmar paquete con lugar y
 * preguntar zona; no repetir «¿Qué te gustaría revisar primero?».
 *
 * npx --yes tsx ./src/selftest/a16614-smoke.ts
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { clientAsksAllInclusiveWithVenue } from "../conversation-understanding.js";
import { applyLucyMessageGuards, buildStandardClosingMessage } from "../lucy-flow-guards.js";
import { buildBroadLevel1Offer } from "../services/catalogService.js";
import type { ExtractedData } from "../types.js";

const MSG =
  "Busco cotizar un paquete todo incluído, desde el lugar. Necesitamos este disponible en un viernes, cualquiera a partir del 20 de noviembre";

assert.ok(clientAsksAllInclusiveWithVenue(MSG));
assert.ok(clientAsksAllInclusiveWithVenue("¿Nos ayudan a buscar salón para la boda?"));
assert.ok(clientAsksAllInclusiveWithVenue("Necesitamos un lugar para 80 personas"));
assert.ok(!clientAsksAllInclusiveWithVenue("Quiero el paquete completo de banquete"));
assert.ok(!clientAsksAllInclusiveWithVenue("El salón ya incluye mesas y sillas"));
assert.ok(!clientAsksAllInclusiveWithVenue("Necesito mesas y sillas para el jardín"));

const broad = buildBroadLevel1Offer("fiesta de fin de año");
const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "user", content: "Hola, me gustaría cotizar un evento" },
  { role: "assistant", content: "¡Hola! Buenas noches. Soy Lucy, agente virtual de Bodasesor. ¿Con quién tengo el gusto?" },
  { role: "user", content: "Emmanuel Luna" },
  { role: "assistant", content: "¡Mucho gusto, Emmanuel! ¿Qué van a celebrar?" },
  { role: "user", content: "Posada/fiesta de fin de año, para una empresa de 115 colaboradores" },
  { role: "assistant", content: broad },
];
const extracted: ExtractedData = {
  nombre: "Emmanuel Luna",
  correo: null,
  tipo_evento: "Fiesta de fin de año",
  requerimientos_evento: null,
  direccion_evento: null,
  fecha_evento: "20 de noviembre",
  horario_evento: null,
  fecha_horario: null,
  num_invitados: 115,
  presupuesto: null,
  tipo_contacto: "cliente",
  empresa: null,
  telefono: null,
  modo_servicio: null,
};
const filled = new Set(["Nombre del cliente", "Tipo de evento", "Número de invitados", "Fecha del evento"]);
const reply = applyLucyMessageGuards({
  aiResponse: broad,
  extracted,
  filledSet: filled,
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history,
  currentMessage: MSG,
  buildClosing: (svc, name) => buildStandardClosingMessage(svc, name),
});
assert.match(reply, /todo incluido/i, reply);
assert.match(reply, /lugar/i, reply);
assert.match(reply, /zona|ciudad/i, reply);
assert.match(reply, /115 personas/, reply);
assert.match(reply, /un viernes a partir del 20 de noviembre/, reply);
assert.equal((reply.match(/\?/g) ?? []).length, 1, `una sola pregunta: ${reply}`);
assert.ok(!/revisar primero/i.test(reply), reply);
assert.ok(!/•\s*\*Alimentos\*/.test(reply), reply);
assert.match(String(extracted.requerimientos_evento), /todo incluido con lugar/i);

console.log(reply);
console.log("a16614 smoke OK");
