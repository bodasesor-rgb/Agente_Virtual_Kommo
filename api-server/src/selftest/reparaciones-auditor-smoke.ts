/**
 * Smoke: heurísticas del auditor Lucy (sin LLM, sin outbound).
 */
import assert from "node:assert/strict";
import { runAuditorHeuristics } from "../services/lucyAuditorHeuristics.js";
import { getAuditorModel, DEFAULT_AUDITOR_MODEL } from "../services/lucyAuditorLlm.js";

assert.equal(getAuditorModel(), DEFAULT_AUDITOR_MODEL);

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

console.log("reparaciones-auditor smoke OK");
