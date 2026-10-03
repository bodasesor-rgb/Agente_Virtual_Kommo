/**
 * Smoke A16612 Jacobo (cafetín de cumpleaños, Huixquilucan):
 * - Promo «CierreRapido / pedido mínimo 35» pegada a mitad de chat: no borrar invitados/fecha/horario
 *   ya dados, no desaconsejar el banquete ni hablar de «junta»; acusar el código.
 * - «Estado de México» no es estilo «mexicano»; «Me encanta esta idea» no pide ideas.
 * - Nunca «vibe»: «estilo».
 *
 * npx --yes tsx ./src/selftest/a16612-smoke.ts
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  buildBelowMinimumGuestReply,
  buildPromoCodeAck,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards, buildStandardClosingMessage } from "../lucy-flow-guards.js";
import { softenRobotAcks } from "../lucyNaturalTone.js";
import {
  buildSalesIdeasSnippet,
  clientReactsToIdea,
  enrichReplyWithSalesIdeas,
  extractStyleCues,
} from "../services/trendKnowledge.js";
import { runAuditorHeuristics } from "../services/lucyAuditorHeuristics.js";
import type { ExtractedData } from "../types.js";

const PROMO =
  "Hola, escribo por la promo de cierre rápido (10% de descuento).\nCódigo: CierreRapido\nPedido mínimo: 35 personas.\n" +
  "Horario en que envío este mensaje: 2 oct 2026, 7:08 p.m. (hora Ciudad de México).\nMe gustaría cotizar un evento.";

// 1) Respuestas de plantilla sin desaconsejar ni suponer «junta».
const below = buildBelowMinimumGuestReply(25);
assert.ok(!/pr[aá]ctico|junta/i.test(below), below);
assert.match(below, /25 personas/);
const ack = buildPromoCodeAck(PROMO, 25);
assert.match(ack, /\*CierreRapido\*/);
assert.match(ack, /35 personas/);
assert.match(ack, /25 invitados/);

// 2) Flujo completo: promo a mitad de chat con datos ya dados.
const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "user", content: "Soy Jacobo Zebak" },
  { role: "assistant", content: "¡Mucho gusto, Jacobo! ¿Qué tipo de evento tienes en mente?" },
  { role: "user", content: "Me gustaría cotizar un cafetín para este día domingo 4 de octubre" },
  { role: "user", content: "Es un cumpleaños" },
  { role: "assistant", content: "Perfecto, Jacobo. ¿Cuántos invitados tienen contemplados?" },
  { role: "user", content: "25" },
  { role: "assistant", content: "¿En qué horario lo planean?" },
  { role: "user", content: "16:00 hrs" },
  { role: "assistant", content: "Perfecto, Jacobo. ¿Me compartes ciudad y colonia o el nombre del salón donde sería?" },
  { role: "user", content: "Sería en el residencial manigua av Jesús del monte 32A" },
  { role: "user", content: "Estado de México huixquilucan" },
  { role: "assistant", content: "¿Manejan algún presupuesto estimado?" },
  { role: "user", content: "15,000 aprox" },
  { role: "assistant", content: "Perfecto, ya tengo todo. ¿Hay algo más que quieras sumar a la cotización?" },
];
const filled = new Set([
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Lugar/dirección del evento",
  "Fecha del evento",
  "Horario del evento",
  "Número de invitados",
  "Presupuesto (MXN)",
]);
const extracted: ExtractedData = {
  nombre: "Jacobo Zebak",
  correo: null,
  tipo_evento: "Cumpleaños",
  requerimientos_evento: "Brunch, Canapés, Mesa de postres",
  direccion_evento: "Residencial Manigua, Av. Jesús del Monte 32A, Huixquilucan, Estado de México",
  fecha_evento: "2 de octubre",
  horario_evento: "19:08",
  fecha_horario: null,
  num_invitados: 35,
  presupuesto: 15000,
  tipo_contacto: "cliente",
  empresa: null,
  telefono: null,
  modo_servicio: null,
};
const reply = applyLucyMessageGuards({
  aiResponse:
    "Para grupos más pequeños el banquete formal suele no ser lo más práctico. ¿Tienen un estimado de invitados?",
  extracted,
  filledSet: filled,
  readyForClosing: false,
  cierreYaEnviado: false,
  emailRefusedThisTurn: false,
  history,
  currentMessage: PROMO,
  buildClosing: (svc, name) => buildStandardClosingMessage(svc, name),
});
assert.match(reply, /CierreRapido/, reply);
assert.ok(!/cu[aá]ntos invitados|estimado de invitados/i.test(reply), reply);
assert.ok(!/pr[aá]ctico|junta/i.test(reply), reply);
assert.equal(Number(extracted.num_invitados), 25, `invitados: ${extracted.num_invitados}`);
assert.match(String(extracted.fecha_evento ?? ""), /4 de octubre/i, `fecha: ${extracted.fecha_evento}`);
assert.match(String(extracted.horario_evento ?? ""), /16/, `horario: ${extracted.horario_evento}`);

// 3) Estilo: ubicación/comida no es estilo; pedido explícito sí.
assert.ok(!extractStyleCues("Huixquilucan, Estado de México").includes("mexicano"));
assert.ok(!extractStyleCues("Quiero comida mexicana").includes("mexicano"));
assert.ok(extractStyleCues("Queremos una fiesta mexicana").includes("mexicano"));
const snippet = buildSalesIdeasSnippet({ tipoEvento: "boda", messageText: "algo rústico" }) ?? "";
assert.ok(snippet && !/vibe/i.test(snippet), snippet);
assert.match(snippet, /estilo \*rústico\*/, snippet);

// 4) «Me encanta esta idea» es reacción, no pedido de ideas.
assert.ok(clientReactsToIdea("Me encanta esta idea"));
assert.ok(!clientReactsToIdea("¿Alguna idea para decorar?"));
const base = "¡Excelente! Me da gusto que te agrade la propuesta. ¿Hay algo más que quieras sumar a la cotización?";
assert.equal(
  enrichReplyWithSalesIdeas(base, {
    tipoEvento: "Cumpleaños",
    messageText: "Me encanta esta idea",
    contextText: "Estado de México huixquilucan",
  }),
  base
);

// 5) «vibe» → «estilo» en lo que escribe el modelo; el supervisor lo detecta.
const toned = softenRobotAcks("Para un vibe elegante te sugiero iluminación cálida.");
assert.ok(!/vibe/i.test(toned), toned);
assert.match(toned, /un estilo elegante/, toned);
const aud = runAuditorHeuristics([
  { role: "assistant", content: "Para un vibe *mexicana*: algunas ideas.", at: new Date("2026-10-04T01:00:00Z") },
]);
assert.ok(aud.some((f) => f.category === "tone"), JSON.stringify(aud));

console.log("a16612 smoke OK");
