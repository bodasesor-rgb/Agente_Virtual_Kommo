/**
 * A16433: "El sábado 03 de octubre 7:40pm" → Lucy volvió a pedir horario.
 */
import { parseHorarioFromText, parseFechaFromText } from "../src/conversation-understanding.ts";
import { softenRobotAcks } from "../src/lucyNaturalTone.ts";
import { finalizeLucyOutboundMessage } from "../src/lucyOutboundPipeline.ts";

let fail = 0;
function ok(c, m) {
  if (!c) {
    console.error("FAIL", m);
    fail++;
  } else console.log("ok", m);
}

const h1 = parseHorarioFromText("El sábado 03 de octubre 7:40pm");
ok(!!h1 && /7:40/.test(h1), `fecha+hora sin 'a las' → ${h1}`);
ok(/octubre/i.test(parseFechaFromText("El sábado 03 de octubre 7:40pm") ?? ""), "fecha sigue saliendo");
const h2 = parseHorarioFromText("7:30 a 12:30");
ok(!!h2 && /7:30/.test(h2) && /12:30/.test(h2), `rango H:MM → ${h2}`);
ok(/19:40|7:40/.test(parseHorarioFromText("sábado 3 de octubre 19:40") ?? ""), "24h junto a fecha");

// No romper aforos / fechas sin hora.
ok(parseHorarioFromText("10-12 personas") === null, "10-12 personas ≠ horario");
ok(parseHorarioFromText("El sábado 03 de octubre") === null, "solo fecha ≠ horario");
ok(parseHorarioFromText("Para 80-90 personas 2-3 tiempos") === null, "invitados/tiempos ≠ horario");
ok(parseHorarioFromText("somos 25") === null, "somos 25 ≠ horario");

const soft = softenRobotAcks(
  "¡Mucho gusto! Anoto tu cumpleaños para 25 personas con la barra de mocteles. Para ir avanzando, ¿tienes ya pensada la fecha?"
);
console.log("soft:", soft);
ok(!/\bAnoto\b/i.test(soft), "sin 'Anoto'");
ok(/fecha\?/.test(soft), "conserva pregunta");

const out = await finalizeLucyOutboundMessage({
  mensaje:
    "¡Mucho gusto! Anoto tu cumpleaños para 25 personas con la barra de mocteles. Para ir avanzando, ¿tienes ya pensada la fecha y el horario?",
  extracted: { nombre: "Isel", tipo_evento: "Cumpleaños", num_invitados: 25 },
  readyForClosing: false,
  cierreYaEnviado: false,
  currentMessage:
    "Cumpleaños de 25 personas y son menores de edad así que necesito una barra de cócteles sin alcohol",
  history: [
    { role: "assistant", content: "¡Hola! Buen día. Soy Lucy. ¿Con quién tengo el gusto?" },
    { role: "user", content: "Isel" },
    { role: "assistant", content: "¡Mucho gusto, Isel! ¿Qué van a celebrar?" },
  ],
  filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Número de invitados"]),
  openai: null,
});
console.log("pipeline:", out);
ok(!/^¡?mucho gusto/i.test(out), "no repite ¡Mucho gusto!");
ok(!/\bAnoto\b/i.test(out), "pipeline sin Anoto");

process.exit(fail ? 1 : 0);
