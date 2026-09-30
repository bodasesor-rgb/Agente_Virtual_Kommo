import assert from "node:assert/strict";
import { applyLucyMessageGuards, applyEmailWaiver, detectEmailRefusalInContext } from "../src/lucy-flow-guards.ts";
import { finalizeLucyOutboundMessage } from "../src/lucyOutboundPipeline.ts";

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

const history = [];
const base = { tipo_evento: "boda" };

async function turn(currentMessage, aiResponse, extra = {}, filled = []) {
  const extracted = ext({ ...base, ...extra });
  const filledSet = new Set(filled);
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
    whatsappDisplayName: "Olga Vargas",
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
    entityId: "A16503",
    log: null,
  });
  console.log(`\n> ${currentMessage}\n${final}\n  [req: ${extracted.requerimientos_evento ?? "-"} | nombre: ${extracted.nombre ?? "-"}]`);
  history.push({ role: "user", content: currentMessage }, { role: "assistant", content: final });
  return { final, extracted, filledSet };
}

const checks = [];
const check = (name, ok) => checks.push([name, !!ok]);
const asksEmail = (t) => /correo/i.test(t) && /\?/.test(t) && /(compartes|qu[eé]\s+correo|tu\s+correo)/i.test(t);

history.push(
  { role: "user", content: "Hola, me interesa cotizar para mi evento: Catering para Comidas y Almuerzos" },
  {
    role: "assistant",
    content:
      "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. Para *comida* del evento, ¿qué te gustaría?\n• Un *banquete* más formal (servicio a la mesa, varios tiempos)\n• Algo más *casual* tipo catering — por ejemplo: barra de pastas y ensaladas, barra de pizzas, taquiza, sushi…",
  }
);

const t1 = await turn(
  "Para una boda\nSra olga",
  "¡Mucho gusto, Sra Olga! Para afinar el banquete/catering, ¿lo prefieres más *formal* (tiempos) o *casual* (taquiza / barras)?",
  { nombre: "Sra Olga", requerimientos_evento: "Comida" },
  ["Nombre del cliente", "Tipo de evento"]
);
check("nombre sin 'Sra'", t1.extracted.nombre === "Olga");
check("saludo no dice 'Sra!'", !/gusto,\s*Sra\b/i.test(t1.final));

const t2 = await turn(
  "Puede mostrar traerme los paquetes de platillo",
  "Claro que sí. Para afinar el banquete/catering, ¿lo prefieres más *formal* (tiempos) o *casual* (taquiza / barras)?",
  { nombre: "Olga", requerimientos_evento: "Comida" },
  ["Nombre del cliente", "Tipo de evento"]
);
check("paquetes → manda catálogo", /bodasesor\.com\/catalogos/.test(t2.final));

const t3 = await turn("Qformar\nFormal", "Perfecto. ¿Más o menos para cuántas personas sería?", {
  nombre: "Olga",
  requerimientos_evento: "Comida",
}, ["Nombre del cliente", "Tipo de evento"]);
check("formal → Banquete Formal", /Banquete Formal/.test(t3.extracted.requerimientos_evento ?? ""));

const t4 = await turn(
  "Puede mandarme foto de los platillos",
  "Perfecto, Olga. Para el banquete formal, contamos con opciones de 3 y 4 tiempos. Puedes ver el detalle de los platillos y las inclusiones en nuestro catálogo aquí: . ¿Cuántos invitados tienen contemplados para su evento?",
  { nombre: "Olga", requerimientos_evento: "Comida" },
  ["Nombre del cliente", "Tipo de evento"]
);
check("fotos → link banquete formal (no vacío)", /catalogos\/banquete-formal/.test(t4.final) && !/aqu[ií]:\s*\./.test(t4.final));

const full = { nombre: "Olga", requerimientos_evento: "Comida", num_invitados: 170, fecha_evento: "28 de noviembre de 2026", horario_evento: "9:00 pm", direccion_evento: "Cabo San Lucas" };
const filledFull = ["Nombre del cliente", "Tipo de evento", "Número de invitados", "Fecha del evento", "Horario del evento", "Lugar/dirección del evento"];

const t5 = await turn(
  "Muéstrame los platillos y cuando los puede mandar xq watsap x favor",
  "Perfecto. Olga. Puedes ver las opciones de nuestros menús formales en este enlace:. Como prefieres que lo revisemos por aquí, dime si te gustaría que te mande alguna información específica. ¿A qué correo te mando la información?",
  full,
  filledFull
);
check("watsap → link", /bodasesor\.com\/catalogos/.test(t5.final) && !/enlace:\s*\./.test(t5.final));
check("watsap → no pide correo", !asksEmail(t5.final));

const t6 = await turn(
  "Mi cel está llena la memoria y no me deja entrar",
  "Perfecto, Olga. ¡Claro, Sra. Olga, no se preocupe! Lo revisamos todo por este mismo chat. ¿Me compartes un correo para enviarte los detalles de la cotización?",
  full,
  filledFull
);
check("cel lleno → no pide correo", !asksEmail(t6.final));
check("sin doble acuse", !/Perfecto,?\s*(Olga)?[.!]\s*¡Claro/i.test(t6.final));

const t7 = await turn(
  "Me gustaría solo el platillo fuerte",
  "Perfecto, Sra. Para afinar el banquete/catering, ¿lo prefieres más *formal* (tiempos) o *casual* (taquiza / barras)?",
  full,
  filledFull
);
check("platillo fuerte → no repite formal/casual", !/\*formal\*.*\*casual\*/i.test(t7.final));

const t8 = await turn(
  "Taquiza no quiero",
  "¡Perfecto! Vamos con *Taquiza*. Para *Taquiza* tenemos dos caminos. ¿A qué correo te mando la información?",
  { ...full, requerimientos_evento: "Banquete Formal" },
  [...filledFull, "Requerimientos o servicios"]
);
check("taquiza no quiero → no la suma", !/Vamos con \*Taquiza\*/i.test(t8.final) && !/taquiza/i.test(t8.extracted.requerimientos_evento ?? ""));
check("taquiza no quiero → deja banquete", /Banquete Formal/.test(t8.extracted.requerimientos_evento ?? ""));

const t9 = await turn(
  "Mi correo no me permite abrirlo",
  "Perfecto. ¡Claro, sin problema, Sra. Olga! Lo revisamos todo por este chat. ¿Hay algún otro detalle de montaje o decoración que le gustaría incluir? ¿Me compartes un correo para enviarte los detalles de la cotización?",
  { ...full, requerimientos_evento: "Banquete Formal" },
  [...filledFull, "Requerimientos o servicios"]
);
check("correo no abre → no pide correo", !asksEmail(t9.final));
check("sin 'problema. Olga!'", !/problema\.\s*Olga/i.test(t9.final));

console.log("");
for (const [n, ok] of checks) console.log(ok ? "OK  " : "FAIL", n);
assert.ok(checks.every(([, ok]) => ok), "hay fallas");
console.log("OK smoke A16503");
