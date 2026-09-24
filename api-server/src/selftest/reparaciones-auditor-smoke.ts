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

const bad = runAuditorHeuristics([
  { role: "user", content: "Cena conmemorativa por día del médico" },
  {
    role: "assistant",
    content: "Perfecto — *Cena* no lo tengo listado en el catálogo.",
  },
]);
assert.ok(bad.some((f) => f.category === "bad_field"), JSON.stringify(bad));

// A16311: "Resumen IA" (1048786 / Respuesta IA Largo) es un campo de texto
// LARGO por diseño (buildResumenClienteLargo, hasta 8000 chars). Un resumen
// completo y corto (lead recién iniciado) NO debe marcarse como truncado
// solo por superar 250 chars — el heurístico solo aplica a Requerimientos /
// Dirección (cap255). Regresión del batch webhook 2026-09-24 (12 leads
// falsos positivos, ej. kommoLeadId 27436790, 27457514).
const resumenCompletoCorto = [
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
assert.ok(resumenCompletoCorto.length >= 250, "fixture debe superar 250 chars para probar el umbral");
const okResumen = runCrmFieldHeuristics({ resumen_ia: resumenCompletoCorto });
assert.ok(
  !okResumen.some((f) => /Resumen IA/.test(f.evidence)),
  `Resumen IA completo (con firma de cierre) no debe marcarse truncado: ${JSON.stringify(okResumen)}`
);

// Truncación real: se corta a media frase, SIN la firma de cierre esperada.
const resumenTruncadoDeVerdad = resumenCompletoCorto.slice(0, 260);
const badResumen = runCrmFieldHeuristics({ resumen_ia: resumenTruncadoDeVerdad });
assert.ok(
  badResumen.some((f) => /Resumen IA/.test(f.evidence)),
  `Resumen IA cortado antes de la firma de cierre sí debe marcarse truncado: ${JSON.stringify(badResumen)}`
);

// Requerimientos / Dirección (cap255) siguen usando el umbral de 250 chars.
const badReq = runCrmFieldHeuristics({ requerimientos: "x".repeat(255) });
assert.ok(
  badReq.some((f) => /Requerimientos/.test(f.evidence)),
  `Requerimientos ≥250 chars sí debe marcarse truncado: ${JSON.stringify(badReq)}`
);

console.log("reparaciones-auditor smoke OK");
