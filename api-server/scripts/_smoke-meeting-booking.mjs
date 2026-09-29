import assert from "node:assert/strict";
import {
  clientAsksForMeeting,
  parseMeetingSlot,
  decideMeetingTurn,
  buildGoogleCalendarAddUrl,
  getBookingUrl,
} from "../src/services/meetingBooking.ts";

// Martes 29 sep 2026, 9:12 am CDMX (15:12 UTC).
const NOW = Date.UTC(2026, 8, 29, 15, 12);
const URL = getBookingUrl();

// ── Detección de petición de cita ──
for (const s of [
  "¿Podemos hacer una videollamada?",
  "quisiera agendar una cita",
  "me gustaría una video llamada para ver detalles",
  "podemos tener una llamada con un asesor",
  "¿hacen reunión por zoom?",
  "quiero agendar una reunión con ustedes",
]) {
  assert.ok(clientAsksForMeeting(s), `debe detectar: ${s}`);
}
for (const s of [
  "Es una reunión familiar de 80 personas",
  "vamos a hacer una reunión de 15 años",
  "la boda es el 15 de noviembre",
  "la cita en la iglesia es a las 5",
  "hola, precio de la barra de tacos",
]) {
  assert.ok(!clientAsksForMeeting(s), `NO debe detectar: ${s}`);
}

// ── Día y hora ──
const s1 = parseMeetingSlot("el jueves a las 5", NOW);
assert.deepEqual(s1.date, { y: 2026, m: 9, d: 1 });
assert.deepEqual(s1.time, { h: 17, min: 0 });
const s2 = parseMeetingSlot("mañana a las 11 de la mañana", NOW);
assert.deepEqual(s2.date, { y: 2026, m: 8, d: 30 });
assert.deepEqual(s2.time, { h: 11, min: 0 });
const s3 = parseMeetingSlot("el 2 de octubre 12:30", NOW);
assert.deepEqual(s3.date, { y: 2026, m: 9, d: 2 });
assert.deepEqual(s3.time, { h: 12, min: 30 });
const s4 = parseMeetingSlot("hoy 4pm", NOW);
assert.deepEqual(s4.date, { y: 2026, m: 8, d: 29 });
assert.deepEqual(s4.time, { h: 16, min: 0 });
const s5 = parseMeetingSlot("el viernes en la tarde a las 3:30", NOW);
assert.deepEqual(s5.date, { y: 2026, m: 9, d: 2 });
assert.deepEqual(s5.time, { h: 15, min: 30 });
const s6 = parseMeetingSlot("para 5 amigos", NOW);
assert.equal(s6.time, null);

// ── Decisiones ──
const offer = decideMeetingTurn({ messageText: "¿Podemos hacer una videollamada?", clientName: "Ana López", nowMs: NOW });
assert.equal(offer?.kind, "offer_link");
assert.equal(offer.meetingKind, "videollamada");
assert.ok(offer.reply.includes(URL));
assert.ok(offer.reply.startsWith("Claro, Ana."));
console.log("offer:", offer.reply);

const slot = decideMeetingTurn({
  messageText: "el jueves a las 5 pm",
  lastAssistantText: offer.reply,
  clientName: "Ana",
  nowMs: NOW,
});
assert.equal(slot?.kind, "slot");
assert.equal(slot.meetingKind, "videollamada");
assert.equal(slot.label, "jueves 1 de octubre a las 5:00 pm");
assert.equal(slot.startMs, Date.UTC(2026, 9, 1, 23, 0));
console.log("slot:", slot.reply);

const direct = decideMeetingTurn({ messageText: "Quiero una cita mañana a las 12:30", nowMs: NOW });
assert.equal(direct?.kind, "slot");
assert.equal(direct.label, "miércoles 30 de septiembre a las 12:30 pm");

const dayOnly = decideMeetingTurn({ messageText: "el viernes", lastAssistantText: offer.reply, nowMs: NOW });
assert.equal(dayOnly?.kind, "needs_detail");
assert.ok(/A qué hora/.test(dayOnly.reply));

const past = decideMeetingTurn({ messageText: "videollamada hoy a las 8 am", nowMs: NOW });
assert.equal(past?.kind, "needs_detail");

const booked = decideMeetingTurn({ messageText: "listo, ya agendé", lastAssistantText: offer.reply, nowMs: NOW });
assert.equal(booked?.kind, "booked");

const callMe = decideMeetingTurn({ messageText: "márquenme mañana a las 11", nowMs: NOW });
assert.equal(callMe?.kind, "slot");
assert.equal(callMe.meetingKind, "llamada");

assert.equal(decideMeetingTurn({ messageText: "márquenme por favor", nowMs: NOW }), null);
assert.equal(decideMeetingTurn({ messageText: "la boda es el 15 de noviembre a las 5", nowMs: NOW }), null);
assert.equal(
  decideMeetingTurn({ messageText: "somos 100 invitados", lastAssistantText: "¿Cuántos invitados?", nowMs: NOW }),
  null
);

// ── Link a Google Calendar ──
const cal = buildGoogleCalendarAddUrl({ title: "Videollamada Bodasesor — Ana", startMs: slot.startMs });
assert.ok(cal.includes("dates=20261001T170000%2F20261001T183000"), cal);
assert.ok(cal.includes("ctz=America%2FMexico_City"));
console.log("calendar:", cal);

console.log("OK smoke meeting booking");
