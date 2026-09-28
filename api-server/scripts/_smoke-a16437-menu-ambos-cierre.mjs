/**
 * A16437 Alejandra: menú solo/completo mutilado por anti-repeat (tip "pista"),
 * "cotizar ambos" → "Sigo aquí", ubicación duplicada, gmaio.com, cierre repetido tras "Es todo".
 */
import { finalizeLucyOutboundMessage } from "../src/lucyOutboundPipeline.ts";
import { parseFechaFromText, mergeZonaDetail, isRicherFechaCapture } from "../src/conversation-understanding.ts";
import { dedupeLocationParts } from "../src/lib/locationDedupe.ts";
import { suggestEmailDomainFix } from "../src/client-email.ts";
import { buildSalesIdeasSnippet } from "../src/services/trendKnowledge.ts";
import { applyCrmWriteInvariants } from "../src/lucyCrmInvariants.ts";
import { applyLucyMessageGuards } from "../src/lucy-flow-guards.ts";

let fail = 0;
function ok(c, m) {
  if (!c) {
    console.error("FAIL", m);
    fail++;
  } else console.log("ok", m);
}

const menu = [
  "Para *Banquete Formal 3 tiempos* tenemos dos caminos:",
  "",
  "1. *Solo alimentos* — comida con personal de cocina",
  "2. *Servicio completo* — bebidas, meseros, decoración y vajilla incluidos",
  "",
  "¿Cuál te late más?",
  "",
  "Catálogo de *Banquete Formal 3 tiempos*:",
  "https://bodasesor.com/catalogos/banquetes",
].join("\n");
const prevTip =
  "¡Perfecto, *XV años*! Platícame qué te gustaría armar para el evento.\n\nEntrada con luces o LED wall + pista grande marca el momento del vals.\n\n¿Para cuándo lo tienen pensado?";

{
  const out = await finalizeLucyOutboundMessage({
    mensaje: menu,
    extracted: { nombre: "Alejandra", tipo_evento: "XV años", num_invitados: 100, requerimientos_evento: "Banquete" },
    readyForClosing: false,
    cierreYaEnviado: false,
    currentMessage: "Me gustaria el servicio de banquete para el abril de 2027",
    history: [
      { role: "user", content: "Una xv con aproximadamente 80-100 personas" },
      { role: "assistant", content: prevTip },
    ],
    filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Número de invitados"]),
  });
  ok(/1\. \*Solo alimentos\*/.test(out) && /2\. \*Servicio completo\*/.test(out), "menú con las 2 opciones");
  ok(/bodasesor\.com\/catalogos\/banquetes/.test(out), "catálogo sobrevive");
}

const snip = buildSalesIdeasSnippet({ tipoEvento: "XV años", messageText: "Una xv con 80-100 personas" });
ok(!!snip && !/vibe \*XV años\*/i.test(snip), `sin 'vibe *XV años*' → ${snip}`);

ok(parseFechaFromText("Me gustaria el servicio de banquete para el abril de 2027") === "Abril de 2027", "abril de 2027 conserva año");
ok(isRicherFechaCapture("Abril de 2027", "Abril"), "Abril de 2027 > Abril");

ok(dedupeLocationParts("Ciénaga de Flores, CIENEGA de flores") === "Ciénaga de Flores", "dedupe Ciénaga/CIENEGA");
ok(mergeZonaDetail("Ciénaga de Flores", "CIENEGA de flores") === "Ciénaga de Flores", "merge no duplica");
ok(dedupeLocationParts("Colonia Roma, CDMX") === "Colonia Roma, CDMX", "no toca ubicaciones distintas");
ok(dedupeLocationParts("San Pedro, San Pablo") === "San Pedro, San Pablo", "San Pedro ≠ San Pablo");
ok(
  applyCrmWriteInvariants({ direccion_evento: "Ciénaga de Flores, CIENEGA de flores" }, []).extracted.direccion_evento ===
    "Ciénaga de Flores",
  "invariante dedupe dirección"
);

ok(suggestEmailDomainFix("Ruizmimi508@gmaio.com") === "ruizmimi508@gmail.com", "gmaio → gmail");
ok(suggestEmailDomainFix("ana@hotmial.com") === "ana@hotmail.com", "hotmial → hotmail");
ok(suggestEmailDomainFix("ana@gmail.com") === null, "gmail correcto → null");
ok(suggestEmailDomainFix("ana@empresa.com.mx") === null, "dominio empresa → null");
ok(suggestEmailDomainFix("ana@hotmail.es") === null, "hotmail.es → null");

{
  const out = await finalizeLucyOutboundMessage({
    mensaje: "Gracias por tu correo. ¿Tienes algún presupuesto estimado en mente?",
    extracted: { nombre: "Alejandra" },
    readyForClosing: false,
    cierreYaEnviado: false,
    currentMessage: "Ruizmimi508@gmaio.com",
    history: [{ role: "assistant", content: "¿Me compartes un correo para enviarte los detalles?" }],
    filledSet: new Set(),
  });
  ok(/¿Tu correo es \*ruizmimi508@gmail\.com\*\?/.test(out), `confirma dominio → ${out.replace(/\n/g, " ")}`);
}

{
  const closing =
    "Perfecto, ya tengo todo. Quedó anotado *Banquete Formal*. Le paso estos datos a nuestro equipo.\n\n¿Confirmamos que el equipo te escriba por aquí con la propuesta, o prefieres esperar el correo?";
  const out = await finalizeLucyOutboundMessage({
    mensaje: closing,
    extracted: { nombre: "Alejandra" },
    readyForClosing: true,
    cierreYaEnviado: true,
    currentMessage: "Es todo",
    history: [
      { role: "assistant", content: closing },
      { role: "user", content: "Por aquí esta bien" },
      { role: "assistant", content: "¡Perfecto! ¿Quieres agregar algo más a la cotización?" },
    ],
    filledSet: new Set(),
  });
  ok(/te escribe por aquí/.test(out) && !/prefieres esperar el correo/.test(out), `despedida corta → ${out}`);
}

{
  const extracted = {
    tipo_contacto: "cliente", nombre: "Alejandra", empresa: null, telefono: null, correo: null,
    presupuesto: null, direccion_evento: null, requerimientos_evento: "Banquete", fecha_evento: "Abril de 2027",
    horario_evento: null, fecha_horario: null, num_invitados: 100, tipo_evento: "XV años", modo_servicio: null,
    proveedor_oferta: null, proveedor_estado: null, proveedor_catalogo: null,
  };
  const hist = [
    { role: "user", content: "Me gustaria el servicio de banquete para el abril de 2027" },
    { role: "assistant", content: menu },
  ];
  const out = applyLucyMessageGuards({
    aiResponse: "Perfecto. ¿Me confirmas ese dato?",
    extracted,
    filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Número de invitados", "Fecha del evento", "Requerimientos o servicios"]),
    readyForClosing: false,
    cierreYaEnviado: false,
    emailRefusedThisTurn: false,
    history: hist,
    presentationHistory: hist,
    currentMessage: "Me puedes cotizar ambos",
    whatsappDisplayName: "Alejandra",
    buildClosing: () => "cierre",
  });
  ok(/dos opciones/.test(out) && !/Sigo aquí/.test(out), `cotizar ambos → ${out}`);
  ok(/solo alimentos y servicio completo/i.test(extracted.requerimientos_evento ?? ""), `req → ${extracted.requerimientos_evento}`);
}

if (fail) {
  console.error(`\n${fail} FAIL`);
  process.exit(1);
}
console.log("\nALL OK");
