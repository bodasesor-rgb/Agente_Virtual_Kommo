import assert from "node:assert/strict";
import {
  composeStageActivationMessage,
  crmLinesToState,
  decideWhatsAppWindow,
  extractLeadStageEvents,
  isManualMoveToDatosEIntereses,
} from "../src/services/stageActivation.ts";

const DATOS = 80344783;
const HUMANO = 105583875;
const now = Date.now();
const H = 60 * 60 * 1000;

// Webhook Kommo: leads[status] y leads[update] (form-urlencoded → objetos con claves "0").
const evs = extractLeadStageEvents({
  account: { subdomain: "bodasesor" },
  leads: { status: { 0: { id: "27486136", status_id: String(DATOS), old_status_id: String(HUMANO) } } },
});
assert.deepEqual(evs, [{ leadId: "27486136", statusId: DATOS, kind: "status" }]);
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
assert.equal(decideWhatsAppWindow(now - 23 * H, now), "send");
assert.equal(decideWhatsAppWindow(now - 24 * H, now), "outside_window");
assert.equal(decideWhatsAppWindow(null, now), "outside_window");

// CRM → estado.
const st = crmLinesToState([
  "- Nombre del cliente: Carmen López",
  "- Tipo de evento: Boda",
  "- Número de invitados: 150",
  "- Presupuesto (MXN): 25,000",
]);
assert.deepEqual([...st.filledLabels].sort(), ["Nombre del cliente", "Número de invitados", "Presupuesto (MXN)", "Tipo de evento"]);
assert.equal(st.extracted.num_invitados, 150);
assert.equal(st.extracted.presupuesto, 25000);
assert.equal(st.extracted.tipo_evento, "Boda");

// Mensajes personalizados.
const casos = [
  { name: "sin nada", contactName: null, lines: [] },
  { name: "solo nombre WA", contactName: "Fer Pastrana", lines: [] },
  { name: "nombre + tipo", contactName: "Carmen", lines: ["- Tipo de evento: XV años"] },
  {
    name: "CRM con nombre, tipo, servicios, invitados",
    contactName: "Cliente WhatsApp",
    lines: [
      "- Nombre del cliente: Carmen López",
      "- Tipo de evento: Boda",
      "- Requerimientos o servicios: Barra de mixología",
      "- Número de invitados: 150",
    ],
  },
  { name: "nombre basura", contactName: "Boutique", lines: [] },
  {
    name: "Lucy ya habló antes",
    contactName: "Fer",
    lines: ["- Tipo de evento: Cumpleaños"],
    history: [{ role: "user", content: "hola" }, { role: "assistant", content: "¡Hola! Soy Lucy..." }],
  },
];
for (const c of casos) {
  const msg = composeStageActivationMessage({
    contactName: c.contactName,
    crm: crmLinesToState(c.lines),
    history: c.history ?? [],
    leadId: 1,
  });
  console.log(`[${c.name}] ${msg}`);
  assert.match(msg, /Soy Lucy/);
  if (/¡Hola, \p{L}+!/u.test(msg)) assert.ok(!/tu nombre|con qui[eé]n tengo el gusto/i.test(msg), "no pide nombre si ya saludó por nombre");
  if (c.lines.some((l) => l.includes("Tipo de evento"))) assert.ok(!/qu[eé] tipo de evento/i.test(msg), "no re-pregunta tipo");
  if (c.lines.some((l) => l.includes("invitados"))) assert.ok(!/invitados/i.test(msg), "no re-pregunta invitados");
  if (c.history) assert.match(msg, /de nuevo/);
}
assert.match(
  composeStageActivationMessage({ contactName: "x", crm: crmLinesToState(["- Nombre del cliente: Carmen López"]) }),
  /¡Hola, Carmen!/
);
assert.ok(!/Boutique/.test(composeStageActivationMessage({ contactName: "Boutique", crm: crmLinesToState([]) })));

console.log("OK _smoke-stage-activation");
