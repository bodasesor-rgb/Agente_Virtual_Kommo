import assert from "node:assert/strict";
import { detectSilentMeetingProposal } from "../src/services/meetingBooking.ts";
import { buildSilentWatchPatchPayload } from "../src/silentWatchCrm.ts";

// Ayer 28 sep 19:58 CDMX = 29 sep 01:58 UTC
const yesterday1958 = Date.UTC(2026, 8, 29, 1, 58);

const p = detectSilentMeetingProposal("10:30?", yesterday1958);
console.log("10:30? →", p);
assert.ok(p);
assert.equal(p.label, "martes 29 de septiembre a las 10:30 am");
assert.equal(p.meetingKind, null);

const p2 = detectSilentMeetingProposal("Sí, mañana a las 5 está bien", yesterday1958);
console.log("mañana a las 5 →", p2);
assert.equal(p2?.label, "martes 29 de septiembre a las 5:00 pm");

const p3 = detectSilentMeetingProposal("la videollamada el jueves a las 11 am porfa", yesterday1958);
console.log("videollamada jueves 11 →", p3);
assert.equal(p3?.meetingKind, "videollamada");
assert.equal(p3?.label, "jueves 1 de octubre a las 11:00 am");

// No es cita: datos del evento, números sueltos, texto normal
for (const msg of [
  "el evento empieza a las 5",
  "la boda es a las 6 pm",
  "100",
  "15",
  "Pero ya son 11:42",
  "gracias",
  "sí",
  "las mesas redondas",
]) {
  assert.equal(detectSilentMeetingProposal(msg, yesterday1958), null, msg);
}

// El Horario del evento NO se toca cuando es la hora de la videollamada
const crmLines = ["- Horario del evento: 3 de la tarde"];
const ext = { tipo_contacto: "cliente", nombre: null, requerimientos_evento: null };
const before = buildSilentWatchPatchPayload("10:30?", ext, "Ale", crmLines);
console.log("sin skip:", JSON.stringify(before));
const after = buildSilentWatchPatchPayload("10:30?", ext, "Ale", crmLines, { skipSchedule: true });
console.log("con skip:", JSON.stringify(after));
assert.equal(after, null);

console.log("OK smoke cita en silencio");
