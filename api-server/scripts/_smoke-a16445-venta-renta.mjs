/**
 * A16445 Fer: "¿Es para venta o renta de mobiliario?" → "Nos enfocamos más en renta,
 * pero con gusto te podemos cotizar para venta" (no "¡Va! Sumamos mobiliario" + 2 preguntas).
 */
import {
  clientAsksVentaOrRenta,
  clientChoosesVenta,
  mergeServiceRequirements,
} from "../src/conversation-understanding.ts";
import { isOccasionOrStyleAsNombre } from "../src/contact-name.ts";
import { applyLucyMessageGuards } from "../src/lucy-flow-guards.ts";
import { finalizeLucyOutboundMessage } from "../src/lucyOutboundPipeline.ts";

let fail = 0;
function ok(c, m) {
  if (!c) {
    console.error("FAIL", m);
    fail++;
  } else console.log("ok", m);
}

ok(clientAsksVentaOrRenta("Hola buen dkaa! Es para venta o renta de mobiliario?"), "detecta venta o renta");
ok(clientAsksVentaOrRenta("¿Venden sillas tiffany?"), "detecta venden");
ok(clientAsksVentaOrRenta("rentan o venden periqueras?"), "detecta rentan o venden");
ok(!clientAsksVentaOrRenta("Quiero renta de mesas y sillas"), "renta simple no dispara");
ok(!clientAsksVentaOrRenta("Soy ejecutiva de ventas en Hacienda Los Arcos"), "ventas de proveedor no dispara");
ok(!clientAsksVentaOrRenta("quiero venderles mis sillas"), "proveedor no dispara");
ok(clientChoosesVenta("Para venta"), "elige venta");
ok(clientChoosesVenta("Sí, comprarlas"), "elige comprar");
ok(!clientChoosesVenta("Renta"), "renta ≠ venta");
ok(isOccasionOrStyleAsNombre("Para venta") && isOccasionOrStyleAsNombre("Renta"), "venta/renta ≠ nombre");
const kept = mergeServiceRequirements("Mobiliario (venta)", "100 sillas tiffany");
ok(/\(venta\)/.test(kept ?? ""), `merge conserva (venta) → ${kept}`);

const base = () => ({
  tipo_contacto: "cliente", nombre: null, empresa: null, telefono: null, correo: null,
  presupuesto: null, direccion_evento: null, requerimientos_evento: null, fecha_evento: null,
  horario_evento: null, fecha_horario: null, num_invitados: null, tipo_evento: null, modo_servicio: null,
  proveedor_oferta: null, proveedor_estado: null, proveedor_catalogo: null,
});

async function turn(ex, filled, hist, msg, ai) {
  const out = applyLucyMessageGuards({
    aiResponse: ai, extracted: ex, filledSet: filled, readyForClosing: false, cierreYaEnviado: false,
    emailRefusedThisTurn: false, history: [...hist], presentationHistory: [...hist], currentMessage: msg,
    whatsappDisplayName: "Fer Pastrana", buildClosing: () => "cierre", forceFirstPresentation: hist.length === 0,
  });
  const fin = await finalizeLucyOutboundMessage({
    mensaje: out, extracted: ex, readyForClosing: false, cierreYaEnviado: false,
    currentMessage: msg, history: [...hist, { role: "user", content: msg }], filledSet: filled,
  });
  hist.push({ role: "user", content: msg }, { role: "assistant", content: fin });
  return fin;
}

{
  const ex = base();
  const filled = new Set();
  const hist = [
    { role: "user", content: "Quiero hacer una cotizacion" },
    { role: "assistant", content: "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. Claro que te ayudo con tu evento. ¿Con quién tengo el gusto?" },
  ];
  const fin = await turn(
    ex, filled, hist,
    "Hola buen dkaa! Es para venta o renta de mobiliario?",
    "Perfecto, Fer. ¡Va! Sumamos *mobiliario* para tu cotización. ¿Qué van a celebrar?"
  );
  ok(/enfocamos m[aá]s en \*renta\*/.test(fin) && /cotizar para \*venta\*/.test(fin), `respuesta venta/renta → ${fin}`);
  ok(!/Sumamos \*mobiliario\*/.test(fin), "sin '¡Va! Sumamos mobiliario'");
  ok((fin.match(/\?/g) ?? []).length === 1, `una sola pregunta → ${fin}`);
  ok(/mobiliario/i.test(ex.requerimientos_evento ?? ""), `req → ${ex.requerimientos_evento}`);

  const fin2 = await turn(ex, filled, hist, "Para venta", "Perfecto. ¿Qué van a celebrar?");
  ok(/cotizamos para \*venta\*/.test(fin2), `elige venta → ${fin2}`);
  ok(/\(venta\)/.test(ex.requerimientos_evento ?? ""), `req venta → ${ex.requerimientos_evento}`);
}

if (fail) {
  console.error(`\n${fail} FAIL`);
  process.exit(1);
}
console.log("\nALL OK");
