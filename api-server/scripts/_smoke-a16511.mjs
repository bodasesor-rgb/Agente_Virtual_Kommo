import assert from "node:assert/strict";
import { applyLucyMessageGuards, applyEmailWaiver, detectEmailRefusalInContext, buildOpeningAcknowledgment } from "../src/lucy-flow-guards.ts";
import { finalizeLucyOutboundMessage } from "../src/lucyOutboundPipeline.ts";
import { clientChoosesChatDelivery, parseSalaProductFromText, parseZonaFromText } from "../src/conversation-understanding.ts";
import { buildGuardServiceAck, getServiceKnowledge, serviceLabelFromQuery } from "../src/services/serviceKnowledge.ts";
import { softenRobotAcks } from "../src/lucyNaturalTone.ts";
import { formatForWhatsApp } from "../src/lib/formatForWhatsApp.ts";

const ext = (p = {}) => ({
  tipo_contacto: "cliente",
  nombre: "Rosy",
  empresa: null,
  telefono: null,
  correo: null,
  presupuesto: null,
  direccion_evento: "casa en bosques de las lomas, Ciudad de México",
  requerimientos_evento: "Animación / Hora loca",
  fecha_evento: "5 de diciembre",
  horario_evento: "8pm",
  fecha_horario: null,
  num_invitados: 30,
  tipo_evento: "XV años",
  modo_servicio: null,
  ...p,
});
const FILLED = [
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Número de invitados",
  "Fecha del evento",
  "Horario del evento",
  "Lugar/dirección del evento",
];

const history = [];
async function turn(currentMessage, aiResponse, extra = {}) {
  const extracted = ext(extra);
  const filledSet = new Set(FILLED);
  const userTexts = [...history.filter((m) => m.role === "user").map((m) => m.content), currentMessage];
  applyEmailWaiver(filledSet, [], userTexts, history, currentMessage);
  const guarded = applyLucyMessageGuards({
    aiResponse,
    extracted,
    filledSet,
    readyForClosing: false,
    cierreYaEnviado: false,
    emailRefusedThisTurn: detectEmailRefusalInContext(currentMessage, history),
    buildClosing: () => "CIERRE",
    currentMessage,
    history: [...history],
    whatsappDisplayName: "Rosy",
    log: process.env.DEBUG_GUARDS
      ? { info: (_o, m) => console.log("   ·", m), warn: (_o, m) => console.log("   !", m), error: () => {}, debug: () => {} }
      : undefined,
  });
  const final = await finalizeLucyOutboundMessage({
    mensaje: guarded,
    extracted,
    readyForClosing: false,
    cierreYaEnviado: false,
    currentMessage,
    history: [...history],
    filledSet,
    openai: null,
    entityId: "A16511",
    log: process.env.DEBUG_GUARDS
      ? { info: (_o, m) => console.log("   ·", m), warn: (_o, m) => console.log("   !", m), error: () => {}, debug: () => {} }
      : null,
  });
  if (process.env.DEBUG_GUARDS) console.log(`   [guards] ${JSON.stringify(guarded)}`);
  console.log(`\n> ${currentMessage}\n${final}`);
  history.push({ role: "user", content: currentMessage }, { role: "assistant", content: final });
  return { final, extracted, filledSet };
}

const checks = [];
const check = (name, ok) => checks.push([name, !!ok]);
const asksEmail = (t) => /correo/i.test(t) && /\?/.test(t);

// --- unidades ---
check("chat: 'En la Ciudad de México\\nEn chat' elige chat", clientChoosesChatDelivery("En la Ciudad de México\nEn chat"));
check("chat: 'Por chat' elige chat", clientChoosesChatDelivery("Por chat"));
check("chat: refusal de correo", detectEmailRefusalInContext("En chat", []));

check("luxor: sala", parseSalaProductFromText("Hola, me interesa cotizar la: Luxor Rosa") === "Sala Luxor Rosa");
check("luxor: etiqueta", serviceLabelFromQuery("Hola, me interesa cotizar la: Luxor Rosa") === "Sala Luxor Rosa");
const luxAck = buildGuardServiceAck("Hola, me interesa cotizar la: Luxor Rosa");
check("luxor: sin 'no lo tengo listado'", !/no lo tengo listado/i.test(luxAck) && /luxor/i.test(luxAck));
const luxK = getServiceKnowledge("Hola, me interesa cotizar la: Luxor Rosa");
check("luxor: knowledge ack", !!luxK && !/no lo tengo listado|Hola, me interesa/i.test(luxK.guardAck));
check("luxor: etiqueta sin formulario", serviceLabelFromQuery("Hola, me interesa cotizar la: Carrito de algodones") === "Carrito de algodones");

check("tono: 'Lo anoto' no queda 'Lo Va,'", !/Lo Va,/i.test(softenRobotAcks("Lo anoto y nuestro equipo confirma si lo podemos armar.")));
const hor = softenRobotAcks("Perfecto, Rosy. Anoto horario *8pm*. Entendido. ¿Me compartes ciudad y colonia?");
check("tono: horario sin 'Entendido' suelto", !/Entendido/.test(hor) && /a las \*8pm\*/i.test(hor));
const solo = softenRobotAcks("Perfecto. Anoto *solo alimentos* para Banquete Kosher. Sí, manejamos…");
check("tono: sin '*. para'", !/\*\.\s+para/i.test(solo) && /solo alimentos\* para Banquete Kosher\./i.test(solo));

check("zona: bosques de las lomas completo", /bosques de las lomas/i.test(parseZonaFromText("Es en una casa en bosques de las lomas") ?? ""));

const hello = buildOpeningAcknowledgment([], "Hola, me interesa cotizar un show de entretenimiento para mi evento. ¿Me pueden dar información?");
check("saludo menciona el show", /show/i.test(hello) && !/Vi los datos de tu evento/i.test(hello));

const moc = formatForWhatsApp(
  "Perfecto. Te detallo *Mócteles* para XV años. Para *Mocteles* manejamos estos niveles: 1. *Moctelería* — $200.00 /pp\n2. *con mixologo* — $400.00 /pp ¿Quieres que te dé detalles de alguno? Catálogo de *Mocteles*:\nhttps://bodasesor.com/catalogos/mocteles"
);
check("mocteles: lista en renglones", /niveles:\n\n1\. /.test(moc) && /\/pp\n\n¿Quieres/.test(moc) && /\?\n\nCatálogo de/.test(moc));

// --- conversación ---
history.push(
  { role: "assistant", content: "¿A qué hora sería el evento?" },
  { role: "user", content: "8pm" },
  { role: "assistant", content: "Perfecto, Rosy. Queda a las *8pm*. ¿Me compartes ciudad y colonia o el nombre del salón donde sería?" },
  { role: "user", content: "Es en una casa en bosques de las lomas" },
  {
    role: "assistant",
    content:
      "Para ir armando la propuesta, ¿tienes algún correo electrónico donde pueda enviarte la información o prefieres que lo revisemos todo por este chat?",
  }
);

const t1 = await turn("En la Ciudad de México\nEn chat", "Perfecto. ¿Me compartes un correo para enviarte los detalles de la cotización?");
check("t1: no pide correo tras 'En chat'", !asksEmail(t1.final));

const t2 = await turn(
  "Qué opciones tienes de show",
  "Claro — para entretenimiento en tu xv años te apoyamos con shows, animación y performance. ¿Buscas algo más tipo show en vivo, hora loca, o ya tienes un formato en mente?"
);
check("t2: lista opciones de show", /opciones de entretenimiento/i.test(t2.final) && /hora loca/i.test(t2.final));
check("t2: sin hub genérico 'montajes, menús'", !/montajes, men/i.test(t2.final));
check("t2: no pide correo", !asksEmail(t2.final));

const t3 = await turn(
  "Dónde puedo ver los shows",
  "Claro — para entretenimiento en tu xv años te apoyamos con shows, animación y performance. ¿Buscas algo más tipo show en vivo, hora loca, o ya tienes un formato en mente?"
);
check("t3: no repite idéntico", t3.final.trim() !== t2.final.trim());
check("t3: no pide correo", !asksEmail(t3.final));

const t4 = await turn(
  "Hola, me interesa cotizar la: Luxor Rosa",
  "De acuerdo. Perfecto — *Hola, me interesa cotizar la: Luxor Rosa* no lo tengo listado en el catálogo. Lo anoto y nuestro equipo confirma si lo podemos armar (descripción, precio e inclusiones).",
  { requerimientos_evento: "Animación / Hora loca, Mócteles" }
);
check("t4: no cita el mensaje del formulario", !/Hola, me interesa cotizar la/i.test(t4.final));
check("t4: sin 'Lo Va,'", !/Lo Va,/i.test(t4.final));
check("t4: catálogo de salas + número de salas", /salas-y-periqueras/.test(t4.final) && /n[uú]mero de salas/i.test(t4.final));
check("t2: menú de shows en renglones", /entretenimiento:\n\n• \*Hora loca\*/.test(t2.final) && /\n\n¿Cuál te llama más\?$/.test(t2.final));

const menu =
  "Para *Banquete Kosher* tenemos dos caminos:\n\n1. *Solo alimentos* — comida con personal de cocina\n2. *Servicio completo* — bebidas, meseros, decoración y vajilla incluidos\n\n¿Cuál te late más?";
const fin = await finalizeLucyOutboundMessage({
  mensaje: menu,
  extracted: ext({ requerimientos_evento: "Animación / Hora loca, Mócteles, Banquete Kosher" }),
  readyForClosing: false,
  cierreYaEnviado: false,
  currentMessage: 'Hola, me interesa cotizar "Banquete Kosher" para mi evento.',
  history: [...history],
  filledSet: new Set(FILLED),
  openai: null,
  entityId: "A16511",
  log: null,
});
console.log(`\n[menú kosher tras finalize]\n${fin}`);
check("caminos: conserva opción 1 y 2", /1\.\s+\*Solo alimentos\*/.test(fin) && /2\.\s+\*Servicio completo\*/.test(fin));

console.log("\n=== checks ===");
let fail = 0;
for (const [n, ok] of checks) {
  console.log(`${ok ? "OK  " : "FAIL"} ${n}`);
  if (!ok) fail++;
}
assert.equal(fail, 0, `${fail} checks fallaron`);
console.log(`\n${checks.length} checks OK`);
