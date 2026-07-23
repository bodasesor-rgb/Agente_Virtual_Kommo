#!/usr/bin/env node
/**
 * Verifica que el simulador exponga los mismos campos que Kommo
 * y que Lucy los guarde con valores coherentes tras una conversación.
 *
 * Uso:
 *   node scripts/probe-sim-campos-kommo.mjs [baseUrl]
 */
import { writeFileSync } from "node:fs";

const BASE = (process.argv[2] || "https://midnightblue-mosquito-424375.hostingersite.com").replace(
  /\/$/,
  "",
);

/** Nombres exactos como aparecen en la UI de Kommo (lead). */
const KOMMO_UI_FIELDS = [
  { cf: "cf_direccion", kommo_id: 1048774, name: "Dirección del evento", lucy: "Lugar/dirección del evento" },
  { cf: "cf_requerimiento", kommo_id: 1048776, name: "Requerimientos para el evento", lucy: "Requerimientos o servicios" },
  { cf: "cf_fecha_horario", kommo_id: 1048778, name: "Fecha Y horario del evento", lucy: "Fecha y horario" },
  { cf: "cf_num_invitados", kommo_id: 1048780, name: "Numero de Invitados", lucy: "Número de invitados" },
  { cf: "cf_tipo_evento", kommo_id: 1048782, name: "Tipo de evento", lucy: "Tipo de evento" },
  { cf: "cf_presupuesto", kommo_id: 1048784, name: "Presupuesto", lucy: "Presupuesto (MXN)" },
  { cf: "cf_respuesta_ia_1", kommo_id: 1048786, name: "Respuesta IA Texto Largo", lucy: "Resumen / respuesta IA" },
];

const LEAD_ID = 94077;
const PHONE = "+5215519407707";

const TURNS = [
  "Hola, quiero cotizar un evento",
  "Me llamo Patricia Campos",
  "prefiero por WhatsApp, sin correo",
  "Es una boda",
  "Necesito mobiliario lounge y carpas",
  "Somos 180 invitados",
  "En Querétaro, Jardín El Marqués",
  "El 15 de noviembre a las 5pm",
  "Presupuesto de 120000 pesos",
];

async function postSimulator(text, lead) {
  const res = await fetch(`${BASE}/api/kommo/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lead }),
  });
  const data = await res.json();
  if (!res.ok || data.status === "error") {
    throw new Error(data.error || data.reply || `HTTP ${res.status}`);
  }
  return data;
}

async function resetLead() {
  await fetch(`${BASE}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: LEAD_ID }),
  }).catch(() => {});
}

function applyUpdates(lead, data) {
  const next = {
    ...lead,
    custom_fields: { ...(lead.custom_fields || {}), ...(data.fields || {}) },
  };
  if (data.lead_updates?.name) next.name = data.lead_updates.name;
  if (data.lead_updates?.contact_email) next.contact_email = data.lead_updates.contact_email;
  if (data.lead_updates?.contact_phone) next.contact_phone = data.lead_updates.contact_phone;
  if (data.stage_id) next.stage_id = data.stage_id;
  return next;
}

function checkLabels(demoFields) {
  const issues = [];
  for (const expected of KOMMO_UI_FIELDS) {
    const found = demoFields.find((f) => f.id === expected.cf);
    if (!found) {
      issues.push(`Falta campo ${expected.cf}`);
      continue;
    }
    if (Number(found.kommo_field_id) !== expected.kommo_id) {
      issues.push(`${expected.cf}: kommo_field_id=${found.kommo_field_id} esperado ${expected.kommo_id}`);
    }
    if (found.name !== expected.name) {
      issues.push(`${expected.cf}: name="${found.name}" esperado "${expected.name}"`);
    }
  }
  return issues;
}

function snapshotHas(snapshot, lucyLabel, hint) {
  if (!snapshot) return false;
  const re = new RegExp(`^-\\s*${lucyLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*.+`, "im");
  const line = snapshot.split("\n").find((l) => re.test(l.trim()) || re.test(l));
  if (!line) return false;
  if (!hint) return true;
  return line.toLowerCase().includes(String(hint).toLowerCase());
}

async function main() {
  const report = {
    base: BASE,
    at: new Date().toISOString(),
    health: null,
    label_checks: [],
    save_checks: [],
    final_fields: {},
    crm_snapshot: "",
    transcript: [],
    pass: false,
  };

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
  report.health = {
    status: health.status,
    lucy_prompt: health.lucy_prompt,
    git_commit_short: health.git_commit_short,
  };
  console.log(`\nProbe campos simulador ↔ Kommo`);
  console.log(`Base: ${BASE}`);
  console.log(`Prompt: ${health.lucy_prompt ?? "?"} · commit ${health.git_commit_short ?? "?"}\n`);

  const demo = await fetch(`${BASE}/simulador/demo.json`).then((r) => r.json());
  report.demo_pack_version = demo.demo_pack_version;
  const labelIssues = checkLabels(demo.config?.custom_fields || []);
  report.label_checks = labelIssues.length
    ? labelIssues.map((m) => ({ ok: false, detail: m }))
    : KOMMO_UI_FIELDS.map((f) => ({ ok: true, detail: `${f.cf} = "${f.name}" (ID ${f.kommo_id})` }));

  console.log("— Labels demo.json vs Kommo UI —");
  for (const c of report.label_checks) {
    console.log(`${c.ok ? "OK" : "FAIL"}  ${c.detail}`);
  }

  await resetLead();
  let lead = {
    id: LEAD_ID,
    name: PHONE,
    contact_phone: PHONE,
    contact_email: "",
    pipeline_id: "pipeline_bodasesor",
    stage_id: "stage_datos_intereses",
    custom_fields: {},
  };

  console.log("\n— Conversación de captura —");
  for (const text of TURNS) {
    const data = await postSimulator(text, lead);
    lead = applyUpdates(lead, data);
    report.transcript.push({
      user: text,
      reply: (data.reply || "").slice(0, 180),
      fields: data.fields || {},
      lead_updates: data.lead_updates || {},
    });
    process.stdout.write(".");
  }
  console.log("\n");

  report.final_fields = lead.custom_fields || {};
  report.crm_snapshot = String(lead.custom_fields?.cf_crm_snapshot || "");

  const saveExpect = [
    { cf: "cf_tipo_evento", hint: "boda", lucy: "Tipo de evento" },
    { cf: "cf_requerimiento", hint: "mobiliario", lucy: "Requerimientos o servicios" },
    { cf: "cf_num_invitados", hint: "180", lucy: "Número de invitados" },
    { cf: "cf_direccion", hint: "marqués", lucy: "Lugar/dirección del evento" },
    { cf: "cf_fecha_horario", hint: "noviembre", lucy: "Fecha y horario" },
    { cf: "cf_presupuesto", hint: "120", lucy: "Presupuesto (MXN)" },
    { cf: "cf_respuesta_ia_1", hint: null, lucy: null },
  ];

  console.log("— Valores guardados (cf_* + snapshot Lucy) —");
  for (const exp of saveExpect) {
    const val = lead.custom_fields?.[exp.cf];
    const hasVal =
      val !== undefined &&
      val !== null &&
      String(val).trim() !== "" &&
      (!exp.hint || String(val).toLowerCase().includes(exp.hint.toLowerCase()));
    const snapOk = !exp.lucy || snapshotHas(report.crm_snapshot, exp.lucy, exp.hint);
    const ok = hasVal && snapOk;
    const detail = `${exp.cf}=${JSON.stringify(val)} · snapshot[${exp.lucy || "n/a"}]=${snapOk}`;
    report.save_checks.push({ ok, detail });
    console.log(`${ok ? "OK" : "FAIL"}  ${detail}`);
  }

  const nameOk = /patricia/i.test(String(lead.name || ""));
  report.save_checks.push({
    ok: nameOk,
    detail: `lead.name=${JSON.stringify(lead.name)} (espejo contacto Kommo)`,
  });
  console.log(`${nameOk ? "OK" : "FAIL"}  lead.name=${JSON.stringify(lead.name)}`);

  const labelsOk = report.label_checks.every((c) => c.ok);
  const savesOk = report.save_checks.every((c) => c.ok);
  report.pass = labelsOk && savesOk;

  console.log(`\nRESULTADO: ${report.pass ? "PASA" : "FALLA"}`);
  console.log(`Labels: ${labelsOk ? "OK" : "FAIL"} · Guardado: ${savesOk ? "OK" : "FAIL"}`);

  const out = process.env.PROBE_REPORT || "/opt/cursor/artifacts/probe-sim-campos-kommo.json";
  try {
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`Reporte: ${out}`);
  } catch {
    writeFileSync("/tmp/probe-sim-campos-kommo.json", JSON.stringify(report, null, 2));
    console.log("Reporte: /tmp/probe-sim-campos-kommo.json");
  }

  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
