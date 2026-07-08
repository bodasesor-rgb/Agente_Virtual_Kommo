#!/usr/bin/env node
/**
 * Prueba E2E de Lucy — cliente Alejandro, bautizo 100 pax CDMX.
 */
const BASE =
  process.env.LUCY_URL?.replace(/\/$/, "") ||
  "https://midnightblue-mosquito-424375.hostingersite.com";

const leadId = `test-alejandro-${Date.now()}`;

let lead = {
  id: leadId,
  name: "",
  contact_phone: "5512345678",
  stage_id: "stage_leads_entrantes",
  custom_fields: {},
};

const turns = [];

async function reset() {
  await fetch(`${BASE}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });
}

function detectAskedField(reply) {
  const r = reply.toLowerCase();
  if (/regalas?\s+tu\s+nombre|tu\s+nombre|c[oó]mo\s+te\s+llamas|con\s+qui[eé]n/.test(r)) return "nombre";
  if (/correo|e-?mail/.test(r)) return "correo";
  if (/tipo\s+de|qu[eé]\s+tipo|celebraci[oó]n|festejan/.test(r) && !/bautizo\s+suele/.test(r)) return "tipo";
  if (/servicios|requerimientos|cotizar|qu[eé]\s+necesitas|qu[eé]\s+te\s+gustar[ií]a|plat[ií]came/.test(r)) return "servicios";
  if (/cu[aá]ntas?\s+personas|invitados|para\s+cu[aá]ntos|m[aá]s\s+o\s+menos/.test(r)) return "invitados";
  if (/d[oó]nde|zona|ubicaci[oó]n|ciudad|lugar/.test(r)) return "zona";
  if (/fecha|cu[aá]ndo|d[ií]a|definiendo/.test(r)) return "fecha";
  if (/presupuesto|rango|inversi[oó]n/.test(r)) return "presupuesto";
  if (/ya tengo todo|cat[aá]logo completo|cotizaci[oó]n personalizada/.test(r)) return "cierre";
  return null;
}

/** Guión fijo del cliente */
const SCRIPT = [
  "Hola, quiero cotizar un bautizo para mi hijo",
  "Me llamo Alejandro",
  "alejandro.garcia@gmail.com",
  "¿Qué me recomiendas para el bautizo? ¿Banquete, pastel, mesa de dulces?",
  "Sí, banquete con pastel y mesa de dulces por favor",
  "Serían 100 personas",
  "En CDMX, Ciudad de México",
  "20 de septiembre de 2026 a las 2 de la tarde",
  "Como 80 mil pesos",
];

function clientReply(turnIndex) {
  if (turnIndex < SCRIPT.length) return SCRIPT[turnIndex];
  return "Gracias Lucy";
}

function mergeLead(data) {
  const u = data.lead_updates || {};
  if (u.name) lead.name = u.name;
  if (u.contact_email) lead.contact_email = u.contact_email;
  if (u.contact_phone) lead.contact_phone = u.contact_phone;
  if (data.fields) {
    lead.custom_fields = { ...lead.custom_fields, ...data.fields };
  }
  if (data.stage_id) lead.stage_id = data.stage_id;
}

function analyzeTurn(i, userMsg, reply, data) {
  const issues = [];
  const asked = detectAskedField(reply);
  const r = reply.toLowerCase();

  if (i === 0 && !/hola,?\s*soy\s+lucy\s+de\s+bodasesor/i.test(reply)) {
    issues.push("Primer mensaje sin presentación Lucy");
  }
  if (i === 0 && asked !== "nombre" && !/nombre/.test(r)) {
    issues.push("Primer turno no pidió nombre primero");
  }
  if (userMsg.includes("recomiendas") && !/banquete|pastel|mesa|mobiliario|carpa|dj|taquiza|brunch/i.test(r)) {
    issues.push("No respondió con recomendaciones de servicios");
  }
  if (userMsg.includes("recomiendas") && asked === "invitados") {
    issues.push("Saltó a invitados sin responder recomendaciones");
  }
  if (/septiembre|20 de/.test(userMsg) && asked === "cierre") {
    issues.push("Cerró sin pedir presupuesto");
  }
  if (/septiembre|20 de/.test(userMsg) && /ya tengo todo|cat[aá]logo/.test(r) && !/presupuesto/.test(r)) {
    issues.push("Cierre prematuro tras fecha (falta presupuesto)");
  }
  if (data.status === "error") {
    issues.push(`Error API: ${data.error}`);
  }

  return { asked, issues, all_fields_filled: data.all_fields_filled };
}

async function send(text) {
  const res = await fetch(`${BASE}/api/kommo/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lead_id: leadId, lead, message: { text } }),
  });
  const data = await res.json();
  mergeLead(data);
  return data;
}

async function main() {
  console.log(`\n=== Prueba Lucy — ${BASE} ===`);
  console.log(`Lead: ${leadId}\n`);

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log(`Health: v${health.version} openai=${health.openai_configured}\n`);

  await reset();

  const maxTurns = 12;

  for (let i = 0; i < maxTurns; i++) {
    const userMsg = clientReply(i);
    const data = await send(userMsg);
    const reply = data.reply || data.error || "(sin respuesta)";
    const analysis = analyzeTurn(i, userMsg, reply, data);

    turns.push({
      turn: i + 1,
      cliente: userMsg,
      lucy: reply,
      asked: analysis.asked,
      fields: data.fields,
      all_fields_filled: analysis.all_fields_filled,
      issues: analysis.issues,
    });

    console.log(`--- Turno ${i + 1} ---`);
    console.log(`Cliente: ${userMsg}`);
    console.log(`Lucy: ${reply.slice(0, 500)}${reply.length > 500 ? "…" : ""}`);
    console.log(`Detectado: pide → ${analysis.asked ?? "?"}`);
    if (analysis.issues.length) console.log(`⚠️  ${analysis.issues.join("; ")}`);
    console.log("");

    if (analysis.all_fields_filled && analysis.asked === "cierre") break;
    if (analysis.all_fields_filled && i >= 8) break;
    if (data.status === "error") break;

    await new Promise((r) => setTimeout(r, 1500));
  }

  const allIssues = turns.flatMap((t) => t.issues);
  const fieldOrder = turns.map((t) => t.asked).filter(Boolean);

  console.log("\n=== RESUMEN ===");
  console.log(`Turnos: ${turns.length}`);
  console.log(`Orden de preguntas: ${fieldOrder.join(" → ")}`);
  console.log(`Campos completos: ${turns.at(-1)?.all_fields_filled ? "SÍ" : "NO"}`);
  console.log(`Problemas: ${allIssues.length ? allIssues.join(" | ") : "ninguno detectado"}`);

  const expected = ["nombre", "correo", "servicios", "invitados", "zona", "fecha", "presupuesto", "cierre"];
  const missing = expected.filter((f) => !fieldOrder.includes(f));
  if (missing.length) console.log(`Campos no cubiertos en la prueba: ${missing.join(", ")}`);

  const failed = allIssues.length > 0 || missing.some((f) => f !== "tipo");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
