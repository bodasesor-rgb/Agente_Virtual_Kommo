/**
 * Smoke — reparaciones bad_field fecha vs horario (supervisor 2026-10-02).
 *
 * npx --yes tsx ./src/selftest/reparaciones-fecha-horario-smoke.ts
 */
import assert from "node:assert/strict";
import {
  isUsableFechaEvento,
  parseFechaFromText,
  parseHorarioFromText,
  polishHorarioEventoCapture,
  splitCombinedFechaHorario,
} from "../conversation-understanding.js";
import { runCrmFieldHeuristics } from "../services/lucyAuditorHeuristics.js";

const multiFecha = "3 fechas diferentes a las 10am";
assert.equal(parseFechaFromText(multiFecha), null);
assert.equal(isUsableFechaEvento(multiFecha), false);
assert.equal(splitCombinedFechaHorario(multiFecha).fecha, null);

const seriaPm = "sería aproximadamente a las 9:30 pm";
assert.equal(parseHorarioFromText(seriaPm), "9:30 pm");
assert.equal(isUsableFechaEvento(seriaPm), false);
assert.equal(polishHorarioEventoCapture(seriaPm), "9:30 pm");
assert.equal(parseHorarioFromText("Sería a las 8 de la noche"), "8 de la noche");
// «es una mesa de dulces» no es «es a la 1».
assert.equal(parseHorarioFromText("Es una mesa de dulces por favor"), null);
assert.equal(parseHorarioFromText("es un evento para 100 personas"), null);
assert.equal(parseHorarioFromText("Sería a las 8 de la noche"), "8 de la noche");
// «es una mesa de dulces» no es «es a la 1».
assert.equal(parseHorarioFromText("Es una mesa de dulces por favor"), null);
assert.equal(parseHorarioFromText("es un evento para 100 personas"), null);

const novCocktail =
  "06 de noviembre El cóctel empieza a las 6.30 termina 1.00 de la mañana";
assert.equal(parseFechaFromText(novCocktail), "06 de noviembre");
const horarioNov = parseHorarioFromText(novCocktail);
assert.ok(horarioNov, horarioNov ?? "");
assert.ok(!/noviembre/i.test(horarioNov!), horarioNov);
assert.match(horarioNov!, /6:30/i, horarioNov);

const crmHorarioFecha = runCrmFieldHeuristics({
  fecha_evento: "06 de noviembre",
  horario_evento: polishHorarioEventoCapture(novCocktail)!,
});
assert.ok(
  !crmHorarioFecha.some((f) => /Sería/.test(f.evidence)),
  JSON.stringify(crmHorarioFecha)
);
assert.ok(
  !crmHorarioFecha.some((f) => /Horario parece fecha/.test(f.evidence)),
  JSON.stringify(crmHorarioFecha)
);

console.log("reparaciones-fecha-horario smoke OK");
