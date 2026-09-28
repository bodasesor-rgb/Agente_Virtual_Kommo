/**
 * V10.22: fecha relativa → absoluta (CDMX), am/pm ambiguo, festejado ≠ cliente.
 */
import {
  resolveFechaEvento,
  inferHorarioAmPm,
  resolveHorarioWithContext,
  formatMexicoNowForPrompt,
} from "../src/lib/eventDateTime.ts";
import { parseFestejadoFromText } from "../src/contact-name.ts";
import { nombreIsOnlyFestejado, applyCrmWriteInvariants } from "../src/lucyCrmInvariants.ts";
import { applyCapturesToCrm } from "../src/conversation-understanding.ts";
import { finalizeLucyOutboundMessage } from "../src/lucyOutboundPipeline.ts";

let fail = 0;
function ok(c, m) {
  if (!c) {
    console.error("FAIL", m);
    fail++;
  } else console.log("ok", m);
}

// Domingo 27 sep 2026, 16:10 CDMX (22:10 UTC).
const NOW = new Date("2026-09-27T22:10:00Z");
ok(formatMexicoNowForPrompt(NOW) === "domingo 27 de septiembre de 2026, 16:10", `hoy → ${formatMexicoNowForPrompt(NOW)}`);

const cases = [
  ["este sábado", "sábado 3 de octubre de 2026"],
  ["el próximo viernes", "viernes 2 de octubre de 2026"],
  ["03 de octubre", "sábado 3 de octubre de 2026"],
  ["El sábado 03 de octubre", "sábado 3 de octubre de 2026"],
  ["el 15", "jueves 15 de octubre de 2026"],
  ["mañana", "lunes 28 de septiembre de 2026"],
  ["15 de marzo", "lunes 15 de marzo de 2027"],
  ["marzo aprox", "marzo de 2027 (aprox.)"],
  ["diciembre", "diciembre de 2026"],
  ["domingo 4 de octubre", "domingo 4 de octubre de 2026"],
];
for (const [inp, exp] of cases) {
  const got = resolveFechaEvento(inp, NOW);
  ok(got === exp, `"${inp}" → ${got}`);
}
ok(resolveFechaEvento("sábado 4 de octubre", NOW) === null, "día de semana no cuadra → null");
ok(resolveFechaEvento("en un mes", NOW) === null, "vago → null");
ok(resolveFechaEvento("31 de febrero", NOW) === null, "fecha imposible → null");

// Am/pm
const amb = inferHorarioAmPm("7:30 a 12:30", "");
ok(amb.ambiguous, "7:30 a 12:30 sin contexto → ambiguo");
const ctx = inferHorarioAmPm("7:30 a 12:30", "El sábado 03 de octubre 7:40pm");
ok(!ctx.ambiguous && ctx.value === "7:30 pm a 12:30 am", `con 7:40pm previo → ${ctx.value}`);
ok(inferHorarioAmPm("3 a 8", "").value === "3 pm a 8 pm", "3 a 8 → tarde");
ok(inferHorarioAmPm("8 a 11", "desayuno").value === "8 am a 11 am", "desayuno → am");
ok(inferHorarioAmPm("8 a 2", "cena").value === "8 pm a 2 am", "cena 8 a 2 → pm a am");
ok(inferHorarioAmPm("7:40pm", "").value === "7:40pm", "ya trae pm → intacto");
ok(
  resolveHorarioWithContext("de la noche", "7:30 a 12:30") === "7:30 pm a 12:30 am",
  "respuesta 'de la noche' completa el horario guardado"
);

// Capturas CRM: fecha relativa se guarda absoluta; "de la noche" no pisa horas.
{
  const lines = [];
  const filled = new Set();
  applyCapturesToCrm(lines, filled, [{ label: "Fecha del evento", value: "03 de octubre" }]);
  ok(/octubre de 20\d\d/.test(lines.join("\n")), `captura fecha → ${lines.join(" | ")}`);
  const lines2 = ["- Horario del evento: 7:30 a 12:30"];
  const filled2 = new Set(["Horario del evento"]);
  applyCapturesToCrm(lines2, filled2, [{ label: "Horario del evento", value: "de la noche" }]);
  ok(lines2[0] === "- Horario del evento: 7:30 pm a 12:30 am", `combina → ${lines2[0]}`);
}

// Festejado
const f1 = parseFestejadoFromText("Es para mi hija Sofía, cumple 15");
ok(f1?.nombre === "Sofía" && f1.relacion === "hija", `mi hija Sofía → ${JSON.stringify(f1)}`);
ok(parseFestejadoFromText("Son los XV de Valeria")?.nombre === "Valeria", "XV de Valeria");
ok(parseFestejadoFromText("la boda de Ana y Luis")?.nombre === "Ana y Luis", "boda de Ana y Luis");
ok(parseFestejadoFromText("Boda de Ana y Luis")?.nombre === "Ana y Luis", "Boda (mayúscula) de Ana y Luis");
ok(parseFestejadoFromText("XV años de Valeria Ruiz")?.nombre === "Valeria Ruiz", "XV años de Valeria Ruiz");
ok(parseFestejadoFromText("Cumpleaños de Mi hijo") === null, "Cumpleaños de Mi hijo → null");
ok(parseFestejadoFromText("boda de playa y jardín") === null, "boda de playa y jardín → null");
ok(parseFestejadoFromText("cumpleaños de mi esposo juan")?.nombre === "Juan", "cumpleaños de mi esposo juan");
ok(parseFestejadoFromText("cumpleaños de 25 personas") === null, "sin nombre → null");
ok(parseFestejadoFromText("mi hija que cumple 5") === null, "mi hija que… → null");
ok(parseFestejadoFromText("Quiero cotizar un cumpleaños") === null, "sin festejado");

ok(nombreIsOnlyFestejado("Sofía", ["Es para mi hija Sofía"]), "Sofía solo festejado → true");
ok(!nombreIsOnlyFestejado("Sofía", ["Soy Sofía", "es para mi hija Sofía"]), "se presentó como Sofía → false");
ok(!nombreIsOnlyFestejado("Laura", ["Es para mi hija Sofía"]), "otro nombre → false");
const inv = applyCrmWriteInvariants(
  { nombre: "Sofía", tipo_evento: "XV años" },
  ["Hola, quiero cotizar", "Es para mi hija Sofía"]
);
ok(inv.extracted.nombre === null, "invariante borra nombre = festejado");

// Pipeline: horario ambiguo → una sola pregunta de confirmación.
{
  const out = await finalizeLucyOutboundMessage({
    mensaje: "¡Perfecto! Tu evento suena increíble. ¿Cuántos invitados esperas?",
    extracted: { nombre: "Isel", tipo_evento: "Cumpleaños" },
    readyForClosing: false,
    cierreYaEnviado: false,
    currentMessage: "7:30 a 12:30",
    history: [
      { role: "user", content: "Hola quiero cotizar" },
      { role: "assistant", content: "¡Hola! Soy Lucy. ¿Cómo te llamas?" },
    ],
    filledSet: new Set(),
  });
  ok(/7:30 de la mañana o de la noche\?/.test(out) && !/invitados/i.test(out), `pregunta am/pm → ${out}`);

  const out2 = await finalizeLucyOutboundMessage({
    mensaje: "¡Perfecto! ¿Cuántos invitados esperas?",
    extracted: { nombre: "Isel", tipo_evento: "Cumpleaños" },
    readyForClosing: false,
    cierreYaEnviado: false,
    currentMessage: "7:30 a 12:30",
    history: [
      { role: "user", content: "El sábado 03 de octubre 7:40pm" },
      { role: "assistant", content: "¡Va! ¿En qué horario?" },
    ],
    filledSet: new Set(),
  });
  ok(!/mañana o de la noche/.test(out2), "con 7:40pm previo no pregunta am/pm");
}

if (fail) {
  console.error(`\n${fail} FAIL`);
  process.exit(1);
}
console.log("\nALL OK");
