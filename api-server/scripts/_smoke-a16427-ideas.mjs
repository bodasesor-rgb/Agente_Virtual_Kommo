/**
 * A16427: Lucy ofreció ideas, cliente "Si, por favor" → deben salir ideas.
 */
import {
  clientAcceptsIdeasOffer,
  lucyOfferedIdeas,
  enrichReplyWithSalesIdeas,
} from "../src/services/trendKnowledge.ts";
import { finalizeLucyOutboundMessage } from "../src/lucyOutboundPipeline.ts";

let fail = 0;
function ok(c, m) {
  if (!c) {
    console.error("FAIL", m);
    fail++;
  } else console.log("ok", m);
}

const offer =
  "Perfecto, anotado para marzo. Para ir aterrizando la propuesta, ¿tienes pensado en qué horario te gustaría realizarlo? Si quieres, te puedo dar algunas ideas de lo que podemos armar para un grupo de ese tamaño.\n\nTemática clara (color/estilo) + mesa de dulces + DJ suele cerrar bien.";

ok(lucyOfferedIdeas(offer), "detecta oferta de ideas");
ok(clientAcceptsIdeasOffer("Si, por favor", offer), "Si, por favor acepta");
ok(clientAcceptsIdeasOffer("sí porfa", offer), "sí porfa acepta");
ok(!clientAcceptsIdeasOffer("no gracias", offer), "no gracias no acepta");
ok(!clientAcceptsIdeasOffer("Si, por favor", "¿En qué horario lo planean?"), "sin oferta no aplica");

const enriched = enrichReplyWithSalesIdeas("¿En qué horario lo planean?", {
  tipoEvento: "Cumpleaños",
  messageText: "Si, por favor",
  accepted: true,
  alreadySent: offer,
  contextText: "Quiero algo muy familiar, tipo 20-25 personas",
  numInvitados: 25,
});
console.log("---\n" + enriched + "\n---");
ok(/ideas/i.test(enriched), "trae ideas");
ok((enriched.match(/•/g) ?? []).length >= 2, "≥2 bullets");
ok(!/Temática clara/i.test(enriched), "no repite tip ya enviado");
ok(/horario/i.test(enriched), "conserva pregunta de horario");
ok(/familiar/i.test(enriched), "usa vibe familiar");

const history = [
  { role: "assistant", content: "¿Con quién tengo el gusto?" },
  { role: "user", content: "Hola, con Giovanni" },
  { role: "user", content: "Quiero algo muy familiar, tipo 20-25 personas" },
  { role: "user", content: "Por marzo, aprox" },
  { role: "assistant", content: offer },
];
const out = await finalizeLucyOutboundMessage({
  mensaje: "¿En qué horario lo planean?",
  extracted: { nombre: "Giovanni", tipo_evento: "Cumpleaños", num_invitados: 25 },
  readyForClosing: false,
  cierreYaEnviado: false,
  currentMessage: "Si, por favor",
  history,
  filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Número de invitados"]),
  openai: null,
});
console.log("=== pipeline ===\n" + out + "\n===");
ok(/•/.test(out), "pipeline entrega ideas");
ok(/\?/.test(out), "pipeline sigue preguntando");

// Con Google Grounding: viñetas frescas primero.
const grounding =
  "- Mesas largas estilo sobremesa con centros de flores de temporada y velas.\n- Barra de antojitos mexicanos gourmet con estaciones interactivas.\n- $500 por persona no debe salir.";
const withTrends = enrichReplyWithSalesIdeas("¿En qué horario lo planean?", {
  tipoEvento: "Cumpleaños",
  messageText: "Si, por favor",
  accepted: true,
  alreadySent: offer,
  contextText: "Quiero algo muy familiar",
  numInvitados: 25,
  groundingSnippet: grounding,
});
console.log("--- trends ---\n" + withTrends + "\n---");
ok(/se está usando/i.test(withTrends), "lead de tendencias");
ok(/sobremesa/i.test(withTrends) && /antojitos/i.test(withTrends), "incluye viñetas de Google");
ok(!/\$/.test(withTrends), "filtra precios de Google");
ok((withTrends.match(/•/g) ?? []).length === 3, "2 tendencias + 1 tip fijo");

process.exit(fail ? 1 : 0);
