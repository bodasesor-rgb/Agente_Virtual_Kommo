import assert from "node:assert/strict";
import { applyLucyMessageGuards } from "../src/lucy-flow-guards.ts";
import { finalizeLucyOutboundMessage } from "../src/lucyOutboundPipeline.ts";
import { parseServicesFromText } from "../src/conversation-understanding.ts";

const ext = (p = {}) => ({
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
  ...p,
});

async function turn({ aiResponse, extracted, filled, currentMessage, history }) {
  const filledSet = new Set(filled);
  const guarded = applyLucyMessageGuards({
    aiResponse,
    extracted,
    filledSet,
    readyForClosing: false,
    cierreYaEnviado: false,
    emailRefusedThisTurn: false,
    buildClosing: () => "CIERRE",
    currentMessage,
    history,
    whatsappDisplayName: "Mariel A",
    log: process.env.DEBUG_GUARDS
      ? {
          info: (_o, m) => console.log("   ·", m),
          warn: (_o, m) => console.log("   !", m),
          error: (_o, m) => console.log("   x", m),
          debug: () => {},
        }
      : undefined,
  });
  const final = await finalizeLucyOutboundMessage({
    mensaje: guarded,
    extracted,
    readyForClosing: false,
    cierreYaEnviado: false,
    currentMessage,
    history,
    filledSet,
    openai: null,
    entityId: "test",
    log: null,
  });
  return { final, extracted, filledSet };
}

const h1 = [
  { role: "user", content: "Hola, me interesa cotizar un servicio" },
  { role: "assistant", content: "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. ¿Con quién tengo el gusto?" },
  { role: "user", content: "Mariel Aranza" },
  { role: "assistant", content: "¡Mucho gusto, Mariel! ¿Qué van a celebrar?" },
];

// ── Turno 1: "Una boda" ──
const t1 = await turn({
  aiResponse: "¡Perfecto, *boda*! Platícame qué te gustaría armar para el evento.",
  extracted: ext({ nombre: "Mariel Aranza", tipo_evento: "boda" }),
  filled: ["Nombre del cliente", "Tipo de evento"],
  currentMessage: "Una boda",
  history: h1,
});
console.log("\n[1] Una boda →\n" + t1.final);

// ── Turno 2: sillas crossback + colgante; entelado ya lo tiene ──
const msg2 =
  "Iluminación natural y calida. 100 invitados. Quiero cotizar sillas crossback nogal y colgante de techo sencillo para complementar con entelado pero en flor artificial";
console.log("\nparse msg2:", parseServicesFromText(msg2));
const h2 = [...h1, { role: "user", content: "Una boda" }, { role: "assistant", content: t1.final }];
const t2 = await turn({
  aiResponse: "¡Perfecto! Anoto sillas crossback nogal y un colgante de techo con flor artificial. ¿Qué día tienen en mente?",
  extracted: ext({ nombre: "Mariel Aranza", tipo_evento: "boda", num_invitados: 100 }),
  filled: ["Nombre del cliente", "Tipo de evento", "Número de invitados"],
  currentMessage: msg2,
  history: h2,
});
console.log("\n[2] crossback/colgante →\n" + t2.final);
console.log("req:", t2.extracted.requerimientos_evento);

// ── Turno 3: "No quiero el entelado, ese ya lo tengo" ──
const msg3 =
  "No quiero el entelado, ese ya lo tengo. Quiero cotizar un adorno colgante central con flor artificial. No tan grande.";
console.log("\nparse msg3:", parseServicesFromText(msg3));
const h3 = [...h2, { role: "user", content: msg2 }, { role: "assistant", content: t2.final }];
const t3 = await turn({
  aiResponse: "Entendido, quitamos el entelado. Anoto un colgante central con flor artificial, no tan grande. ¿Qué día tienen en mente?",
  extracted: ext({
    nombre: "Mariel Aranza",
    tipo_evento: "boda",
    num_invitados: 100,
    requerimientos_evento: t2.extracted.requerimientos_evento,
  }),
  filled: ["Nombre del cliente", "Tipo de evento", "Número de invitados", "Requerimientos o servicios"],
  currentMessage: msg3,
  history: h3,
});
console.log("\n[3] no quiero entelado →\n" + t3.final);
console.log("req:", t3.extracted.requerimientos_evento);

const checks = [
  ["1 sin idea no pedida", !/Una idea que funciona/i.test(t1.final)],
  ["1 sin 'Claro que sí.' suelto", !/Claro que s[ií]\.\s*$/m.test(t1.final)],
  ["1 una sola pregunta", (t1.final.match(/\?/g) ?? []).length <= 1],
  ["2 no suma entelado", !/Sumamos \*Entelados|anoto \*Entelados/i.test(t2.final)],
  ["2 menciona sillas/colgante", /crossback|sillas|colgante/i.test(t2.final)],
  ["3 no suma entelado", !/Sumamos \*Entelados|anoto \*Entelados/i.test(t3.final)],
  ["3 req sin entelado", !/entelado/i.test(t3.extracted.requerimientos_evento ?? "")],
];
const has = (msg, re) => parseServicesFromText(msg).some((s) => re.test(s));
checks.push(
  ["neg: quiero taquiza, no quiero DJ", has("quiero taquiza, no quiero DJ", /taquiza/i) && !has("quiero taquiza, no quiero DJ", /\bdj\b/i)],
  ["neg: ya tengo DJ, me falta mobiliario", !has("ya tengo DJ, me falta mobiliario", /\bdj\b/i)],
  ["neg: no quiero gastar mucho en banquete (sí banquete)", has("no quiero gastar mucho en el banquete", /banquete/i)],
  ["neg: sin alcohol (sigue mocteles)", has("barra de mocteles sin alcohol", /m[oó]ctel/i)],
  ["neg: quítale el DJ", !has("quítale el DJ y deja la taquiza", /\bdj\b/i) && has("quítale el DJ y deja la taquiza", /taquiza/i)],
);
for (const [name, ok] of checks) console.log(ok ? "OK  " : "FAIL", name);
assert.ok(checks.every(([, ok]) => ok), "hay fallas");
console.log("OK smoke A16484");
