/**
 * A16438 Carmen: shows con nombre del formulario ("Blue Man Show", "Tambores con Agua")
 * no deben sumar Animación / Hora loca; "solo quiero el show" / "no quiero animación"
 * editan servicios y no cuentan como bucle de no-entendí.
 */
import {
  parseServicesFromText,
  parseNamedShowLabels,
  mergeServiceRequirements,
  clientNarrowsToOnlyService,
} from "../src/conversation-understanding.ts";
import { clientDeclinesServiceFamilies } from "../src/services/serviceDecline.ts";
import { applyLucyMessageGuards } from "../src/lucy-flow-guards.ts";
import { finalizeLucyOutboundMessage } from "../src/lucyOutboundPipeline.ts";
import { isStuckLoopTurn } from "../src/lucyUnclearStreak.ts";

let fail = 0;
function ok(c, m) {
  if (!c) {
    console.error("FAIL", m);
    fail++;
  } else console.log("ok", m);
}

const m1 = 'Hola, me interesa cotizar el show "Blue Man Show" para mi evento.';
const m2 = 'Hola, me interesa cotizar el show "Tambores con Agua" para mi evento.';

ok(JSON.stringify(parseServicesFromText(m1)) === '["Show Blue Man"]', `m1 → ${parseServicesFromText(m1)}`);
ok(JSON.stringify(parseServicesFromText(m2)) === '["Show Tambores con Agua"]', `m2 → ${parseServicesFromText(m2)}`);
ok(parseNamedShowLabels("Show Blue Man, Show Tambores con Agua").length === 2, "etiquetas CRM round-trip");
ok(parseServicesFromText("quiero hora loca y show de magia").includes("Animación / Hora loca"), "hora loca explícita se conserva");

let req = mergeServiceRequirements(null, m1);
req = mergeServiceRequirements(req, m2);
req = mergeServiceRequirements(req, "Necesito saber el costo y la duración del show");
ok(req === "Show Blue Man, Show Tambores con Agua", `merge sin animación → ${req}`);
ok(clientNarrowsToOnlyService("Solo quiero el show") === null, "solo el show no se vuelve Animación");
ok(clientDeclinesServiceFamilies("No quiero animación").join() === "animacion", "decline animación ≠ entretenimiento");
ok(!clientDeclinesServiceFamilies("No quiero animación").includes("entretenimiento"), "shows no se quitan");

const base = () => ({
  tipo_contacto: "cliente", nombre: "Carmen", empresa: null, telefono: null, correo: null,
  presupuesto: null, direccion_evento: null, requerimientos_evento: null, fecha_evento: null,
  horario_evento: null, fecha_horario: null, num_invitados: null, tipo_evento: null, modo_servicio: null,
  proveedor_oferta: null, proveedor_estado: null, proveedor_catalogo: null,
});
const hist = [];
const ex = base();
const filled = new Set(["Nombre del cliente"]);
const outs = {};
for (const [msg, ai] of [
  [m1, "¡Hola! Soy Lucy. ¿Con quién tengo el gusto?"],
  [m2, "Claro. ¿Qué van a celebrar?"],
  ["XV", "¡Va! ¿Cuántos invitados?"],
  ["Solo quiero el show", "Entendido. ¿Cuántos invitados?"],
  ["No quiero animación", "Claro. ¿Cuántos invitados?"],
  ["Solo el shows", "Ok. ¿Cuántos invitados?"],
]) {
  if (msg === "XV") {
    ex.tipo_evento = "XV años";
    filled.add("Tipo de evento");
  }
  const reqBefore = ex.requerimientos_evento;
  const filledBefore = new Set(filled);
  const out = applyLucyMessageGuards({
    aiResponse: ai, extracted: ex, filledSet: filled, readyForClosing: false, cierreYaEnviado: false,
    emailRefusedThisTurn: false, history: [...hist], presentationHistory: [...hist], currentMessage: msg,
    whatsappDisplayName: "Carmen", buildClosing: () => "cierre", forceFirstPresentation: hist.length === 0,
  });
  const fin = await finalizeLucyOutboundMessage({
    mensaje: out, extracted: ex, readyForClosing: false, cierreYaEnviado: false,
    currentMessage: msg, history: [...hist, { role: "user", content: msg }], filledSet: filled,
  });
  outs[msg] = { fin, req: ex.requerimientos_evento, reqBefore, filledBefore };
  hist.push({ role: "user", content: msg }, { role: "assistant", content: fin });
}

ok(!/Animaci[oó]n/.test(outs[m1].fin) && /Show Blue Man/.test(outs[m1].fin), `turno 1 → ${outs[m1].fin}`);
ok(/Tambores con Agua/.test(outs[m2].fin) && !/formato en mente/.test(outs[m2].fin), `turno 2 → ${outs[m2].fin}`);
ok(/solo los shows/.test(outs["Solo quiero el show"].fin), `solo el show → ${outs["Solo quiero el show"].fin}`);
ok(/sin animación/.test(outs["No quiero animación"].fin) && !/formato en mente/.test(outs["No quiero animación"].fin), `no animación → ${outs["No quiero animación"].fin}`);
ok(outs["Solo el shows"].req === "Show Blue Man, Show Tambores con Agua", `req final → ${outs["Solo el shows"].req}`);
ok(!/Animaci[oó]n/.test(outs["Solo el shows"].req ?? ""), "sin Animación en CRM");

ok(
  !isStuckLoopTurn({
    outboundMessage: "Listo, sin animación. ¿Cuántos invitados tienen contemplados?",
    history: [{ role: "assistant", content: "¿Cuántos invitados tienen contemplados?" }],
    filledBefore: new Set(["Tipo de evento"]),
    filledAfter: new Set(["Tipo de evento"]),
    requerimientosBefore: "Animación / Hora loca, Show Blue Man",
    requerimientosAfter: "Show Blue Man",
  }),
  "editar servicios ≠ bucle"
);
ok(
  isStuckLoopTurn({
    outboundMessage: "¿Cuántos invitados tienen contemplados?",
    history: [{ role: "assistant", content: "¿Cuántos invitados tienen contemplados?" }],
    filledBefore: new Set(["Tipo de evento"]),
    filledAfter: new Set(["Tipo de evento"]),
    requerimientosBefore: "Show Blue Man",
    requerimientosAfter: "Show Blue Man",
  }),
  "mismo req + misma pregunta = bucle"
);

if (fail) {
  console.error(`\n${fail} FAIL`);
  process.exit(1);
}
console.log("\nALL OK");
