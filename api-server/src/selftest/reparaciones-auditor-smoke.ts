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

const resumenCompleto =
  "📋 RESUMEN LUCY\n".padEnd(400, "·") + `\n${"— Actualizado por Lucy en cada mensaje —"}`;
const resumenOk = runCrmFieldHeuristics({ resumen_ia: resumenCompleto });
assert.ok(
  !resumenOk.some((f) => /Resumen IA parece truncado/i.test(f.evidence)),
  JSON.stringify(resumenOk)
);

const resumenCortado = "📋 RESUMEN\n".padEnd(7990, "x") + "...";
const resumenBad = runCrmFieldHeuristics({ resumen_ia: resumenCortado });
assert.ok(
  resumenBad.some((f) => /Resumen IA parece truncado/i.test(f.evidence)),
  JSON.stringify(resumenBad)
);

const reqLargo = "x".repeat(260);
const reqBad = runCrmFieldHeuristics({ requerimientos: reqLargo });
assert.ok(reqBad.some((f) => /Requerimientos parece truncado/i.test(f.evidence)), JSON.stringify(reqBad));

console.log("reparaciones-auditor smoke OK");
