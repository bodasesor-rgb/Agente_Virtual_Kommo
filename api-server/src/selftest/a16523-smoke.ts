/**
 * Smoke A16523 Nelly — premiación 70 personas, mesas media luna:
 * "7 personas por mesa" ≠ invitados; "no" suelto ≠ presupuesto; centros de mesa (10) no se
 * vuelven (7)/(1); "una sala lounge" en singular; barra nacional; ideas sin DJ rechazado,
 * sin ideas tras "es todo" ni por texto de Lucy pegado; "espera" / "se eleva el costo".
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  parseInvitadosFromText,
  parsePresupuestoFromText,
  parseCentrosDeMesaRequirement,
  parseSalaProductFromText,
  parseServicesFromText,
  clientAsksToWaitWhileBrowsing,
  clientWorriesAboutCost,
  dedupeServiceHierarchy,
} from "../conversation-understanding.js";
import { clientAsksPrice } from "../price-guard.js";
import { softenRobotAcks } from "../lucyNaturalTone.js";
import {
  stripEchoedLucyText,
  clientClosedServiceList,
  clientWantsIdeasOrTrends,
  buildSalesIdeasSnippet,
  enrichReplyWithSalesIdeas,
} from "../services/trendKnowledge.js";
import { declinedFamiliesInTexts } from "../services/serviceDecline.js";
import { extractRentalPieceList } from "../services/summaryService.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.ok(/^V10\.\d{2}$/.test(LUCY_PROMPT_VERSION), LUCY_PROMPT_VERSION);

// Invitados: capacidad por mesa ≠ afluencia.
assert.equal(parseInvitadosFromText("para 7 personas en cada mesa"), null);
assert.equal(parseInvitadosFromText("no son 10 mesas de 7 personas 10 centros de mesa"), null);
assert.equal(parseInvitadosFromText("es un evento empresarial para 70 personas"), "70");

// Presupuesto: "no" tras "¿cuántos invitados?" ≠ sin presupuesto; 70k + IVA legible.
assert.equal(parsePresupuestoFromText("no"), null);
assert.equal(
  parsePresupuestoFromText("no", { askedField: "presupuesto" }),
  "Sin definir (cliente indicó que no tiene)"
);
assert.equal(
  parsePresupuestoFromText(
    "eh no, lamentablemente no, hay una referencia del año pasado de 70k, pero ahorita no hay referencia más I.V.A."
  ),
  "$70,000 MXN + IVA (referencia)"
);

// Centros de mesa: la cantidad pegada gana; nunca "7 personas" ni "1 sala".
assert.equal(parseCentrosDeMesaRequirement("10 centros de mesa, una sala lounge"), "Centros de mesa (10)");
assert.equal(parseCentrosDeMesaRequirement("Centros de mesa (10), 1 salas lounge"), "Centros de mesa (10)");
assert.equal(
  parseCentrosDeMesaRequirement("el centro de mesa que te mandé, mesas media luna 10 7 personas por mesa"),
  "Centros de mesa"
);
assert.equal(parseCentrosDeMesaRequirement("los centros de mesa serían 20"), "Centros de mesa (20)");

// Sala lounge singular + sin duplicar el genérico.
assert.equal(parseSalaProductFromText("una sala lounge"), "Sala lounge (1)");
assert.equal(parseSalaProductFromText("Cena, Sala lounge (1), Meseros"), "Sala lounge (1)");
assert.deepEqual(dedupeServiceHierarchy(["Cena", "Salas lounge", "Sala lounge (1)"]), ["Cena", "Sala lounge (1)"]);

// Barra nacional = barra de bebidas.
assert.ok(parseServicesFromText("mira es cena de 4 tiempos con barra nacional").includes("Barra de bebidas"));

// Tono / intención.
assert.ok(clientAsksToWaitWhileBrowsing("espera dejo veo en tu sirio las sillas"));
assert.ok(!clientAsksToWaitWhileBrowsing("espera, ¿tienen barra nacional?"));
assert.ok(clientWorriesAboutCost("las otras están padres pero se me puede elevar al costo"));
assert.equal(clientAsksPrice("las otras están padres pero se me puede elevar al costo"), false);
assert.equal(
  softenRobotAcks("Perfecto, Nelly. Anoto Cena para que el equipo lo sume a tu cotización. ¿Algo más?"),
  "Perfecto, Nelly. Sumo Cena a tu cotización. ¿Algo más?"
);

// Resumen: todas las piezas, no solo la última.
assert.equal(extractRentalPieceList("necesitaría 10 mesas\n70 sillas"), "10 mesas, 70 sillas");

// Ideas: texto de Lucy pegado ≠ pedir ideas; "es todo" corta; DJ rechazado no se sugiere.
const lucyIdeas =
  "Lo que se está usando para un vibe *elegante*:\n• Integra iluminación arquitectónica cálida sobre las mesas media luna para resaltar el contraste dorado y negro, creando un ambiente sofisticado y envolvente.";
const pasted =
  "Lo que se está usando para un vibe elegante:\n•⁠ ⁠Integra iluminación arquitectónica cálida sobre las mesas media luna para resaltar el contraste dorado y negro, creando un ambiente sofisticado y envolvente.\nok";
const own = stripEchoedLucyText(pasted, [lucyIdeas]);
assert.equal(own, "ok");
assert.ok(clientWantsIdeasOrTrends(pasted));
assert.ok(!clientWantsIdeasOrTrends(own));
assert.ok(clientClosedServiceList("es todo\nel resto de producción ya lo tengo"));
assert.equal(
  enrichReplyWithSalesIdeas("¡Con gusto! Nuestro equipo ya tiene tus datos.", {
    tipoEvento: "premiación",
    messageText: "es todo, el resto de producción ya lo tengo",
    force: true,
  }),
  "¡Con gusto! Nuestro equipo ya tiene tus datos."
);
const declined = declinedFamiliesInTexts(["DJ no, sala lounge puede ser pero costos por separado"]);
assert.deepEqual(declined, ["entretenimiento"]);
for (let i = 0; i < 3; i++) {
  const tips = buildSalesIdeasSnippet({
    tipoEvento: i === 0 ? "premiación" : i === 1 ? "cumpleaños" : null,
    messageText: "ideas",
    maxTips: 3,
    declinedFamilies: declined,
  });
  assert.ok(!/\bDJ\b/i.test(tips ?? ""), tips ?? "");
}

// Guards: fecha + Pedregal en el mismo mensaje; invitados=70 no se borra por "70 sillas".
function ex(partial: Partial<ExtractedData> = {}): ExtractedData {
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
const u = (c: string) => ({ role: "user", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;
const a = (c: string) => ({ role: "assistant", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;
const guard = (o: {
  ai: string;
  cur: string;
  hist: OpenAI.Chat.ChatCompletionMessageParam[];
  extracted: ExtractedData;
  filled: string[];
  closed?: boolean;
}) =>
  applyLucyMessageGuards({
    aiResponse: o.ai,
    extracted: o.extracted,
    filledSet: new Set(o.filled),
    history: o.hist,
    currentMessage: o.cur,
    entityId: "A16523",
    readyForClosing: o.closed ?? false,
    cierreYaEnviado: o.closed ?? false,
    emailRefusedThisTurn: false,
    forceFirstPresentation: false,
    buildClosing: () => "CIERRE",
    whatsappDisplayName: "Nelly Montes",
  });

{
  const extracted = ex({
    nombre: "Nelly",
    tipo_evento: "premiación",
    num_invitados: 70,
    requerimientos_evento: "Mobiliario",
    horario_evento: "5 horas",
  });
  const out = guard({
    ai: "Claro. ¿Cuántos invitados tienen contemplados?",
    cur: "tentativamente 1 de diciembre\n70 sillas\nen el Pedregal es una casa/oficina",
    hist: [u("mantelería vino o negro por favor"), a("Listo. Nelly, ¿tienen ya el día del evento?")],
    extracted,
    filled: ["Nombre del cliente", "Tipo de evento", "Número de invitados", "Requerimientos o servicios", "Horario del evento"],
  });
  assert.equal(extracted.num_invitados, 70);
  assert.ok(!/invitados|cu[aá]ntas personas/i.test(out), out);
  assert.ok(/1 de diciembre/.test(out) && /Pedregal/.test(out), out);
}

const full = () =>
  ex({
    nombre: "Nelly",
    tipo_evento: "premiación",
    num_invitados: 70,
    requerimientos_evento: "Mobiliario, Sillas Tiffany",
    horario_evento: "5 horas",
    fecha_evento: "1 de diciembre",
    direccion_evento: "Pedregal, CDMX",
    correo: "nelly@mktl.mx",
  });
const fullFilled = [
  "Nombre del cliente", "Tipo de evento", "Número de invitados", "Requerimientos o servicios",
  "Horario del evento", "Fecha del evento", "Lugar/dirección del evento", "Correo electrónico",
];
const lateHist = [u("nelly@mktl.mx"), a("¿Hay algo más que te gustaría sumar a la propuesta?")];

{
  const out = guard({
    ai: "¿Hay algún otro elemento que te gustaría sumar a la propuesta?",
    cur: "espera dejo veo en tu sirio las sillas",
    hist: lateHist,
    extracted: full(),
    filled: fullFilled,
    closed: true,
  });
  assert.ok(/con calma|te espero/i.test(out), out);
}
{
  const out = guard({
    ai: "Claro. ¿De cuál te paso precios de referencia: Sillas Tiffany, Mobiliario?",
    cur: "las otras están padres pero se me puede elevar al costo",
    hist: lateHist,
    extracted: full(),
    filled: fullFilled,
    closed: true,
  });
  assert.ok(/cuidamos el costo/i.test(out) && /Tiffany/.test(out), out);
  assert.ok(!/precios de referencia/i.test(out), out);
}
{
  const out = guard({
    ai: "¡Sí! Manejamos barra libre nacional.",
    cur: "estoy viendo que hacen banquetes\ntienen barra nacional?",
    hist: lateHist,
    extracted: full(),
    filled: fullFilled,
    closed: true,
  });
  assert.ok(/barra de bebidas/i.test(out), out);
  assert.ok(!/catalogos\/banquete/i.test(out), out);
}
{
  const out = guard({
    ai: "¡Con gusto! Nuestro equipo ya tiene tus datos para la cotización. ¿Quieres que te confirmen por aquí o prefieres el correo?",
    cur: "es una sala lounge, sigue diciendo salas en plural\nes todo",
    hist: lateHist,
    extracted: { ...full(), requerimientos_evento: "Cena, Centros de mesa (10), Salas lounge, Meseros" },
    filled: fullFilled,
    closed: true,
  });
  assert.ok(/una sala lounge/i.test(out) && /correg/i.test(out), out);
}

console.log("a16523-smoke OK", LUCY_PROMPT_VERSION);
