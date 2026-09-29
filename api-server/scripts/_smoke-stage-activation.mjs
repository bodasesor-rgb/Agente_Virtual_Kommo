import assert from "node:assert/strict";
import {
  decideWhatsAppWindow,
  extractLeadStageEvents,
  isManualMoveToDatosEIntereses,
  pendingClientMessages,
} from "../src/services/stageActivation.ts";

const DATOS = 80344783;
const HUMANO = 105583875;
const now = Date.now();
const H = 60 * 60 * 1000;

// Webhook Kommo: leads[status] y leads[update] (form-urlencoded → objetos con claves "0").
assert.deepEqual(
  extractLeadStageEvents({
    account: { subdomain: "bodasesor" },
    leads: { status: { 0: { id: "27486136", status_id: String(DATOS), old_status_id: String(HUMANO) } } },
  }),
  [{ leadId: "27486136", statusId: DATOS, kind: "status" }]
);
assert.deepEqual(
  extractLeadStageEvents({ leads: { update: [{ id: 1, status_id: DATOS }, { id: 1, status_id: DATOS }] } }),
  [{ leadId: "1", statusId: DATOS, kind: "update" }]
);
assert.deepEqual(extractLeadStageEvents({ talk: {} }), []);

// Manual (usuario Bodasesor) vs Lucy (created_by 0) vs otra etapa vs viejo.
const manual = { eventId: "e1", createdBy: 11742195, createdAtMs: now - 30_000, statusId: DATOS };
assert.equal(isManualMoveToDatosEIntereses(manual, now), true);
assert.equal(isManualMoveToDatosEIntereses({ ...manual, createdBy: 0 }, now), false);
assert.equal(isManualMoveToDatosEIntereses({ ...manual, statusId: HUMANO }, now), false);
assert.equal(isManualMoveToDatosEIntereses({ ...manual, createdAtMs: now - 6 * 60_000 }, now), false);
assert.equal(isManualMoveToDatosEIntereses(null, now), false);

// Ventana de WhatsApp.
assert.equal(decideWhatsAppWindow(now - 30_000, now), "client_just_wrote");
assert.equal(decideWhatsAppWindow(now - 3 * H, now), "send");
assert.equal(decideWhatsAppWindow(now - 24 * H, now), "outside_window");
assert.equal(decideWhatsAppWindow(null, now), "outside_window");

// Mensajes pendientes (formato real de GET /api/v4/talks/{id}/messages).
const t0 = Math.floor(now / 1000) - 3 * 3600;
const cli = (s, text, extra = {}) => ({ type: "incoming", author: { type: "external" }, text, created_at: t0 + s, ...extra });
const ase = (s, text, type = "internal") => ({ type: "outgoing", author: { type }, text, created_at: t0 + s });

// Caso A16470: el cliente escribió durante la caída y nadie contestó.
const caida = [
  cli(0, "Busco rentar pista de baile de madera.\n24 y 31 de octubre para bodas de día.\n35 mts2 de pista\nTepozotlan centro"),
];
assert.deepEqual(pendingClientMessages(caida).texts, [caida[0].text]);

// Varios mensajes seguidos sin respuesta → todos, en orden (aunque Kommo los mande desordenados).
const varios = [cli(60, "¿tienen disponible?"), cli(0, "hola"), ase(-100, "Hola, soy Lucy", "bot")];
assert.deepEqual(pendingClientMessages(varios).texts, ["hola", "¿tienen disponible?"]);

// Ya contestó un asesor después → nada pendiente.
assert.deepEqual(pendingClientMessages([cli(0, "hola"), ase(30, "Hola, te atiendo")]).texts, []);

// Lucy contestó por Meta (no aparece en el chat, solo en la nota) → no repetir.
assert.deepEqual(pendingClientMessages([cli(0, "hola")], (t0 + 20) * 1000).texts, []);
assert.deepEqual(pendingClientMessages([cli(0, "hola"), cli(40, "¿sigues ahí?")], (t0 + 20) * 1000).texts, ["¿sigues ahí?"]);

// Solo audio/foto → sin texto, se cuenta como media.
assert.deepEqual(pendingClientMessages([cli(0, "", { message_type: "voice" })]), { texts: [], mediaCount: 1 });

console.log("OK _smoke-stage-activation");
