/**
 * A16434 Eduardo: "De 5:00 de la tarde a 10:00 / De la noche" no se capturaba → Lucy
 * pidió horario 5 veces y escaló. También "atardecer" como fecha y tip "vibe" repetido.
 */
import {
  parseHorarioFromText,
  isUsableHorarioEvento,
  isUsableFechaEvento,
  applyCapturesToCrm,
} from "../src/conversation-understanding.ts";
import { softenRobotAcks } from "../src/lucyNaturalTone.ts";
import { finalizeLucyOutboundMessage } from "../src/lucyOutboundPipeline.ts";

let fail = 0;
function ok(c, m) {
  if (!c) {
    console.error("FAIL", m);
    fail++;
  } else console.log("ok", m);
}

const cases = [
  ["De 5:00 de la tarde a 10:00\nDe la noche", "5:00 pm a 10:00 pm"],
  ["5 de la tarde a 10\nDe la noche", "5 pm a 10 pm"],
  ["5:00PM 10PM", "5:00 pm a 10 pm"],
  ["de 7 a 12 de la noche", "7 pm a 12 am"],
  ["El 8 de octubre de 5 de la tarde a 10 de la noche", "5 pm a 10 pm"],
  ["de 9 de la mañana a 2", "9 am a 2 pm"],
];
for (const [inp, exp] of cases) {
  const got = parseHorarioFromText(inp);
  ok(got === exp, `${JSON.stringify(inp)} → ${got}`);
}
ok(parseHorarioFromText("80 a 100 personas") === null, "aforo ≠ horario");
ok(parseHorarioFromText("10-12 personas") === null, "10-12 personas ≠ horario");
ok(parseHorarioFromText("El sábado 03 de octubre") === null, "solo fecha ≠ horario");
ok(isUsableHorarioEvento("5:00 de la tarde a 10:00 de la noche"), "LLM largo tarde/noche → usable");
ok(isUsableHorarioEvento("5:00PM 10PM"), "5:00PM 10PM usable");
ok(!isUsableFechaEvento("atardecer"), "atardecer ≠ fecha");
ok(!isUsableFechaEvento("sería en el atardecer 🌅"), "sería en el atardecer ≠ fecha");
ok(isUsableFechaEvento("8 de octubre"), "8 de octubre sí fecha");

{
  const lines = ["- Fecha del evento: atardecer"];
  const filled = new Set(["Fecha del evento"]);
  applyCapturesToCrm(lines, filled, [{ label: "Fecha del evento", value: "8 de octubre" }]);
  ok(/8 de octubre/.test(lines[0]), `fecha atardecer reemplazada → ${lines[0]}`);
  const lines2 = ["- Horario del evento: tarde"];
  const filled2 = new Set(["Horario del evento"]);
  applyCapturesToCrm(lines2, filled2, [{ label: "Horario del evento", value: "5:00 pm a 10:00 pm" }]);
  ok(lines2[0] === "- Horario del evento: 5:00 pm a 10:00 pm", `horario 'tarde' reemplazado → ${lines2[0]}`);
}

ok(!/Armamos \*terraza\*/.test(softenRobotAcks("Perfecto. Anoto *terraza*. ¿Me confirmas la ciudad?")), "sin 'Armamos *terraza*'");

// Tip no se repite en turnos seguidos ni el mismo dos veces.
{
  const prevTip =
    "Excelente. Cóctel de bienvenida con canapés y barra de mixología: la gente recorre el espacio con copa en mano. ¿Ya tienen fecha?";
  const out = await finalizeLucyOutboundMessage({
    mensaje: "¡Excelente! Ya tengo CDMX. ¿Qué necesitas cotizar?",
    extracted: { nombre: "Eduardo", tipo_evento: "apertura de negocio" },
    readyForClosing: false,
    cierreYaEnviado: false,
    currentMessage: "Sería en CDMX",
    history: [
      { role: "user", content: "La apertura de un showroom" },
      { role: "assistant", content: prevTip },
    ],
    filledSet: new Set(),
  });
  ok(!/vibe/i.test(out) && !/Cóctel de bienvenida/.test(out), `sin tip repetido → ${out.replace(/\n/g, " ")}`);
}

if (fail) {
  console.error(`\n${fail} FAIL`);
  process.exit(1);
}
console.log("\nALL OK");
