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

// Webhook-reparaciones 2026-09-24 (12 hallazgos, ej. c8e7e521-4522-43d4-94b7-60292870505b,
// 40c5f7a9-8466-4572-8840-676dab2faa84, e32f5e99-d947-443f-b29d-e7a29f15a553):
// "CRM Resumen IA parece truncado" era un falso positivo — Resumen IA
// (campo 1048786 = Respuesta IA Largo) es intencionalmente largo
// (buildResumenClienteLargo, cap real 8000 chars) y siempre cierra con el
// marcador "— Actualizado por Lucy en cada mensaje —". No debe dispararse
// solo por pasar de 250 chars.
{
  const normalResumen =
    "RESUMEN DE CONVERSACIÓN — Lucy\n\n" +
    "Qué busca el cliente:\n• Servicios: Banquete formal, DJ, carpa\n\n" +
    "Datos capturados:\n• Nombre: Ana\n• Correo: ana@example.com\n" +
    "• Ubicación: CDMX\n• Fecha/horario: 10 de mayo, 18:00\n\n" +
    "Estado: datos completos — listo para cotización del equipo.\n\n" +
    "— Actualizado por Lucy en cada mensaje —";
  assert.ok(normalResumen.length >= 250, "fixture debe superar 250 chars");
  const findings = runCrmFieldHeuristics({ resumen_ia: normalResumen });
  assert.ok(
    !findings.some((f) => /Resumen IA/i.test(f.evidence)),
    `Resumen IA normal no debe marcarse como truncado: ${JSON.stringify(findings)}`
  );
}

// Un corte real (sin el marcador de cierre, tocando el cap de 8000) sí debe
// seguir detectándose.
{
  const cutResumen = "RESUMEN DE CONVERSACIÓN — Lucy\n\n".padEnd(7990, "x") + "...";
  const findings = runCrmFieldHeuristics({ resumen_ia: cutResumen });
  assert.ok(
    findings.some((f) => /Resumen IA/i.test(f.evidence)),
    `Corte real de Resumen IA debe seguir detectándose: ${JSON.stringify(findings)}`
  );
}

// Requerimientos/Dirección (campos cortos con cap255 real) siguen igual.
{
  const findings = runCrmFieldHeuristics({
    requerimientos: "x".repeat(255),
  });
  assert.ok(
    findings.some((f) => /Requerimientos/i.test(f.evidence)),
    `Requerimientos largo debe seguir marcándose como truncado: ${JSON.stringify(findings)}`
  );
}

console.log("reparaciones-auditor smoke OK");
