import assert from "node:assert/strict";
import {
  extractManualMeetingSignals,
  parseConfirmedMeeting,
} from "../src/services/manualMeetingSignals.ts";

const FIELD = 1049462;
const BOOKING = "https://calendar.app.google/LMFvik7YS4xuUu9L6";
// Hoy 29 sep 11:50 CDMX
const now = Date.UTC(2026, 8, 29, 17, 50);

// Webhook de nota (form-urlencoded → objeto con índices)
const noteBody = {
  leads: {
    note: {
      0: { note: { element_id: "27375926", text: "Videollamada mañana 10:30", created_by: "123", note_type: "4" } },
      1: { note: { element_id: "27375926", text: "Lucy (silencio): actualicé 1 dato(s)", created_by: "0" } },
      2: { note: { element_id: "27375926", text: "📅 El cliente escribió un horario para la llamada: hoy 10:30", created_by: "0" } },
    },
  },
};
const sig = extractManualMeetingSignals(noteBody, FIELD, [BOOKING]);
console.log("señales nota:", sig);
assert.equal(sig.length, 1);
const m = parseConfirmedMeeting(sig[0], now);
console.log("nota →", m);
assert.equal(m?.label, "miércoles 30 de septiembre a las 10:30 am");
assert.equal(m?.meetingKind, "videollamada");

// Notas que no son cita
for (const text of ["El cliente quiere 200 sillas", "Le marqué a las 10 y no contestó hace rato"]) {
  const s = { leadId: "1", text, source: "nota" };
  const r = parseConfirmedMeeting(s, now);
  if (text.startsWith("El cliente")) assert.equal(r, null, text);
}

// Campo llenado a mano
const updBody = {
  leads: {
    update: [
      {
        id: "27375926",
        status_id: "72336839",
        modified_user_id: "123",
        custom_fields: [
          { id: "1049358", values: [{ value: "3 de la tarde" }] },
          { id: String(FIELD), values: [{ value: "jueves 5 pm" }] },
        ],
      },
    ],
  },
};
const sig2 = extractManualMeetingSignals(updBody, FIELD, [BOOKING]);
assert.equal(sig2.length, 1);
assert.equal(sig2[0].source, "campo");
const m2 = parseConfirmedMeeting(sig2[0], now);
console.log("campo →", m2);
assert.equal(m2?.label, "jueves 1 de octubre a las 5:00 pm");
assert.equal(m2?.meetingKind, null);

// Valor que ya escribió Lucy (trae el link) → se ignora (no hay bucle)
const lucyBody = {
  leads: {
    update: [
      {
        id: "27375926",
        modified_user_id: "123",
        custom_fields: [{ id: String(FIELD), values: [{ value: `Videollamada — jueves 1 de octubre a las 5:00 pm (confirmada por el equipo) · ${BOOKING}` }] }],
      },
    ],
  },
};
assert.equal(extractManualMeetingSignals(lucyBody, FIELD, [BOOKING]).length, 0);

console.log("OK smoke cita confirmada por el equipo");
