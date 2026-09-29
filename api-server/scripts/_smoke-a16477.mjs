import assert from "node:assert/strict";
import {
  applyEmailWaiver,
  applyLucyMessageGuards,
  buildContinueEngagementQuestion,
  detectEmailRefusalInContext,
  EMAIL_WAIVED_LABEL,
  isShortNoToEmailAsk,
} from "../src/lucy-flow-guards.ts";
import { relativeYearPhrase, resolveFechaEvento } from "../src/lib/eventDateTime.ts";
import {
  extractDeclinedServiceObjects,
  removeSpecificDeclinedServices,
} from "../src/services/serviceDecline.ts";
import {
  appendPostCierreRequirements,
  clientChoosesChatDelivery,
  clientChoosesEmailDelivery,
  expandOrdinalListChoice,
  mergeServiceRequirements,
  parseServicesFromText,
} from "../src/conversation-understanding.ts";

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

console.log("parse pozole:", parseServicesFromText("pozole"));

// ── 1. "No quiero pozole" quita solo ese SKU ──
assert.deepEqual(extractDeclinedServiceObjects("No quiero pozole", "Pozole y Tostadas"), ["pozole"]);
assert.equal(removeSpecificDeclinedServices("Pozole y Tostadas, Mesa de dulces", "No quiero pozole"), "Mesa de dulces");
assert.equal(removeSpecificDeclinedServices("Pozole y Tostadas", "No quiero pozole"), null);
assert.equal(mergeServiceRequirements("Pozole y Tostadas, Barra de sushi", "No quiero pozole"), "Barra de sushi");
assert.equal(appendPostCierreRequirements("Pozole y Tostadas", "No quiero pozole"), null);
// No confundir con cosas que no son servicio
assert.deepEqual(extractDeclinedServiceObjects("no quiero dar mi correo", "Pozole y Tostadas"), []);
assert.deepEqual(extractDeclinedServiceObjects("No quiero pagar tanto", "Pozole y Tostadas"), []);
assert.deepEqual(extractDeclinedServiceObjects("no quiero comida", "Pozole y Tostadas"), []);

const base = {
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Número de invitados",
    "Requerimientos o servicios",
    "Lugar/dirección del evento",
    "Fecha del evento",
    "Correo electrónico",
  ]),
  readyForClosing: true,
  emailRefusedThisTurn: false,
  buildClosing: () => "CIERRE",
};

const post = applyLucyMessageGuards({
  ...base,
  aiResponse: "Perfecto, Rosalia. Va, Pozole y Tostadas para que el equipo lo sume a tu cotización.",
  extracted: ext({
    nombre: "Rosalia",
    tipo_evento: "boda",
    num_invitados: 100,
    requerimientos_evento: "Pozole y Tostadas",
    direccion_evento: "Ocean Events, Cancún",
    fecha_evento: "noviembre 2027",
    correo: "rosaliavera12@gmail.com",
  }),
  cierreYaEnviado: true,
  history: [
    { role: "user", content: "rosaliavera12@gmail.com" },
    {
      role: "assistant",
      content:
        "Perfecto, ya tengo todo. He anotado el pozole y las tostadas. ¿Hay algo más que quieras sumar a la cotización?",
    },
  ],
  currentMessage: "No quiero pozole",
});
console.log("post-cierre:", post);
assert.ok(/quito \*Pozole/i.test(post), post);
assert.ok(!/sume/i.test(post), post);

console.log("OK smoke A16477 (quitar servicio)");

// ── 2. "No" al correo = no quiere dar correo ──
const askCorreo =
  "¡Perfecto, la ubicación en *Ocean Events, Cancún*! ¿Me compartes un correo para enviarte los detalles de la cotización?";
assert.ok(isShortNoToEmailAsk("No", askCorreo));
assert.ok(isShortNoToEmailAsk("No\nSegunda opción", askCorreo));
assert.ok(!isShortNoToEmailAsk("No", "¿Ya tienen fecha o todavía la van definiendo?"));
assert.ok(!isShortNoToEmailAsk("No sé todavía", askCorreo));
assert.ok(detectEmailRefusalInContext("No", [{ role: "assistant", content: askCorreo }]));
{
  const filled = new Set(["Nombre del cliente"]);
  const merged = [];
  applyEmailWaiver(filled, merged, ["No"], [{ role: "assistant", content: askCorreo }], "No");
  assert.ok(filled.has(EMAIL_WAIVED_LABEL), [...filled].join(","));
}
{
  const filled = new Set(["Nombre del cliente"]);
  const merged = [];
  applyEmailWaiver(
    filled,
    merged,
    ["No", "Cotización"],
    [
      { role: "assistant", content: askCorreo },
      { role: "user", content: "No" },
      { role: "assistant", content: "Claro, sin problema." },
    ],
    "Cotización"
  );
  assert.ok(filled.has(EMAIL_WAIVED_LABEL), "waiver también desde historial");
}

// ── 3. "El correo 📧 por favor" = eligió correo; no volver a preguntar "algo más" ──
assert.ok(clientChoosesEmailDelivery("El correo 📧 por favor"));
assert.ok(clientChoosesEmailDelivery("Por correo porfa"));
assert.ok(!clientChoosesEmailDelivery("No gracias"));
assert.ok(clientChoosesChatDelivery("Por aquí por favor 🙏"));
const cierreHist = [
  {
    role: "assistant",
    content: "Perfecto, ya tengo todo. ¿Hay algo más que quieras sumar a la cotización?",
  },
  { role: "user", content: "No quiero pozole" },
  { role: "assistant", content: "He retirado el pozole. ¿Hay algo más que quieras sumar a la cotización?" },
  { role: "user", content: "No gracias Haci está bien" },
  {
    role: "assistant",
    content:
      "¡Con gusto, Rosalia! ¿Quieres que te confirmen por aquí cuando te contacten, o prefieres esperar el correo?",
  },
];
const qCorreo = buildContinueEngagementQuestion(ext({ nombre: "Rosalia" }), "El correo 📧 por favor", cierreHist);
console.log("tras 'El correo':", qCorreo);
assert.ok(!/algo m[aá]s/i.test(qCorreo), qCorreo);
const qNoGracias = buildContinueEngagementQuestion(
  ext({ nombre: "Rosalia" }),
  "No gracias",
  cierreHist
);
console.log("tras 'No gracias' (canal ya preguntado):", qNoGracias);
assert.ok(!/algo m[aá]s|prefieres esperar el correo/i.test(qNoGracias), qNoGracias);

// ── 4. Menores ──
const listaCatering =
  "Con gusto. En *catering* más casual manejamos varias estaciones, por ejemplo:\n• Barra de sushi\n• Pozole y tostadas\n• Taquiza\n¿Cuál te late?";
assert.equal(
  expandOrdinalListChoice("Segunda opción", listaCatering),
  "Segunda opción (Pozole y tostadas)"
);
assert.equal(expandOrdinalListChoice("la 3", listaCatering), "la 3");
assert.equal(expandOrdinalListChoice("opción 3", listaCatering), "opción 3 (Taquiza)");
assert.equal(expandOrdinalListChoice("la última", listaCatering), "la última (Taquiza)");
assert.equal(expandOrdinalListChoice("Segunda opción", "¿Me compartes tu correo?"), "Segunda opción");

const now = new Date("2026-09-29T18:00:00Z");
assert.equal(resolveFechaEvento("Noviembre siguiente año", now), "noviembre de 2027");
assert.equal(resolveFechaEvento("noviembre", now), "noviembre de 2026");
assert.equal(resolveFechaEvento("15 de marzo del próximo año", now), "lunes 15 de marzo de 2027");
assert.equal(relativeYearPhrase("Noviembre siguiente año"), "siguiente ano");

const comida = applyLucyMessageGuards({
  aiResponse: "¡Perfecto, que es *comida*! Para *comida* del evento, ¿qué te gustaría?",
  extracted: ext({ nombre: "Rosalia", tipo_evento: "boda", num_invitados: 100 }),
  filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Número de invitados"]),
  readyForClosing: false,
  emailRefusedThisTurn: false,
  buildClosing: () => "CIERRE",
  currentMessage: "Comida",
  history: [
    { role: "user", content: "Hola, me interesa cotizar un servicio para boda 100 personas" },
    { role: "assistant", content: "¿Con quién tengo el gusto?" },
    { role: "user", content: "Rosalia" },
    { role: "assistant", content: "¡Mucho gusto, Rosalia! ¿Qué servicios te interesan para tu boda?" },
  ],
});
console.log("comida:", comida);
assert.ok(!/que es \*comida\*/i.test(comida), comida);
assert.ok(!/Anoto que es \*comida\*/i.test(comida), comida);

console.log("OK smoke A16477 (correo, cierre, menores)");
