import assert from "node:assert/strict";
import {
  runAuditorHeuristics,
  runCrmFieldHeuristics,
} from "../services/lucyAuditorHeuristics.js";
import {
  getAuditorModel,
  DEFAULT_AUDITOR_MODEL,
} from "../services/lucyAuditorLlm.js";
import { mexicoCityDayKey, startOfMexicoCityDay } from "../services/lucyAuditorTime.js";

assert.equal(getAuditorModel(), DEFAULT_AUDITOR_MODEL);
assert.match(mexicoCityDayKey(), /^\d{4}-\d{2}-\d{2}$/);
assert.ok(startOfMexicoCityDay() instanceof Date);
assert.ok(startOfMexicoCityDay().getTime() <= Date.now());

const loop = runAuditorHeuristics([
  { role: "user", content: "Si por favor Yucateca" },
  {
    role: "assistant",
    content:
      "Claro. Barra Yucateca: https://bodasesor.com/catalogos/barra-yucateca ¿Quieres detalles?",
  },
  { role: "user", content: "Cuál es el costo de la barra yucateca!?" },
  {
    role: "assistant",
    content:
      "Claro. Barra Yucateca: https://bodasesor.com/catalogos/barra-yucateca ¿Quieres detalles?",
  },
]);
assert.ok(
  loop.some((f) => f.category === "loop_links" || f.category === "repeat_reply"),
  JSON.stringify(loop)
);

const close = runAuditorHeuristics([
  { role: "user", content: "Cuál es el costo de la yucateca" },
  {
    role: "assistant",
    content: "Perfecto, ya tengo todo. Nuestro equipo preparará una cotización personalizada.",
  },
]);
assert.ok(close.some((f) => f.category === "premature_close"), JSON.stringify(close));

const advisorHandoff = runAuditorHeuristics([
  { role: "user", content: "Quiero un asesor que me envíe la cotización por favor" },
  {
    role: "assistant",
    content: "Perfecto, ya tengo todo. Nuestro equipo preparará una cotización personalizada.",
  },
]);
assert.ok(
  !advisorHandoff.some((f) => f.category === "premature_close"),
  JSON.stringify(advisorHandoff)
);

const bad = runAuditorHeuristics([
  { role: "user", content: "Cena conmemorativa por día del médico" },
  {
    role: "assistant",
    content: "Perfecto — *Cena* no lo tengo listado en el catálogo.",
  },
]);
assert.ok(bad.some((f) => f.category === "bad_field"), JSON.stringify(bad));

// Resumen IA es campo largo: completo con firma no es «truncado» aunque pase de 250.
const resumenCompleto = [
  "RESUMEN DE CONVERSACIÓN — Lucy",
  "",
  "Qué busca el cliente:",
  "• Servicios: (aún por definir con más detalle)",
  "",
  "Datos capturados:",
  "• Nombre: Maria",
  "",
  "Pendiente / próximo paso:",
  "• Completar: correo, tipo de evento, servicios / requerimientos, ubicación, fecha, horario, invitados, presupuesto",
  "• Equipo: armar cotización con lo ya platicado.",
  "",
  "— Actualizado por Lucy en cada mensaje —",
].join("\n");
assert.ok(resumenCompleto.length >= 250);
const okResumen = runCrmFieldHeuristics({ resumen_ia: resumenCompleto });
assert.ok(!okResumen.some((f) => /Resumen IA/.test(f.evidence)), JSON.stringify(okResumen));
const cortado = runCrmFieldHeuristics({ resumen_ia: resumenCompleto.slice(0, 260) });
assert.ok(cortado.some((f) => /Resumen IA cortado/.test(f.evidence)), JSON.stringify(cortado));
const req255 = runCrmFieldHeuristics({ requerimientos: "x".repeat(255) });
assert.ok(req255.some((f) => /Requerimientos/.test(f.evidence)), JSON.stringify(req255));

// stuck_funnel: 3 veces «correo» sin que el cliente lo diera ya NO es hallazgo…
const askCorreo = "¿Me compartes tu correo para enviarte la cotización?";
const sinDar = runAuditorHeuristics([
  { role: "user", content: "Hola, quiero cotizar carpas" },
  { role: "assistant", content: `Claro. ${askCorreo}` },
  { role: "user", content: "¿Cuánto cuesta?" },
  { role: "assistant", content: `Depende del tamaño. ${askCorreo}` },
  { role: "user", content: "Ok" },
  { role: "assistant", content: `Perfecto. ${askCorreo}` },
]);
assert.ok(!sinDar.some((f) => f.category === "stuck_funnel"), JSON.stringify(sinDar));

// …pero volver a pedirlo cuando el cliente YA lo dio sí.
const yaLoDio = runAuditorHeuristics([
  { role: "assistant", content: askCorreo },
  { role: "user", content: "ana.lopez@gmail.com" },
  { role: "assistant", content: `Gracias. ${askCorreo}` },
]);
assert.ok(
  yaLoDio.some((f) => f.category === "stuck_funnel" && /ya lo dio/.test(f.evidence)),
  JSON.stringify(yaLoDio)
);

// repeat_reply: mismo arranque con contenido distinto no es repetición.
const mismoArranque = runAuditorHeuristics([
  {
    role: "assistant",
    content:
      "Perfecto — anoto *Carpas* para tu cotización. Catálogo: https://bodasesor.com/catalogos/carpas ¿Cuánto mide el espacio?",
  },
  { role: "user", content: "10x20" },
  {
    role: "assistant",
    content:
      "Perfecto — anoto *Carpas* para tu cotización. Con 10x20 cabe una carpa árabe para 150 personas. ¿Para qué fecha sería tu evento?",
  },
]);
assert.ok(!mismoArranque.some((f) => f.category === "repeat_reply"), JSON.stringify(mismoArranque));

// A16610: elogio forzado de Lucy → tone.
const forzado = runAuditorHeuristics([
  { role: "user", content: "Es para el aniversario de mi empresa" },
  {
    role: "assistant",
    content: "¡Qué buen plan! Tu aniversario de empresa suena increíble. ¿Qué servicios te interesan?",
    at: new Date("2026-10-04T02:00:00Z"),
  },
]);
const tono = forzado.find((f) => f.category === "tone");
assert.ok(tono && /elogio forzado/.test(tono.evidence), JSON.stringify(forzado));

// Tono cordial correcto, mensajes viejos (ya corregidos en código) y textos del equipo humano no cuentan.
const cordial = runAuditorHeuristics([
  { role: "assistant", content: "Perfecto, con gusto te ayudamos con tu aniversario de empresa. ¿Qué te gustaría armar?" },
  { role: "assistant", content: "¡Qué padre! Tu boda suena genial.", at: new Date("2026-10-02T12:00:00Z") },
  { role: "human", content: "¡Qué buen plan! Te paso la cotización." },
]);
assert.ok(!cordial.some((f) => f.category === "tone"), JSON.stringify(cordial));

console.log("reparaciones-auditor smoke OK");
