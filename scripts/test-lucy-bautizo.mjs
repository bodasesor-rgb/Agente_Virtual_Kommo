#!/usr/bin/env node
/**
 * Prueba E2E de Lucy en producción — cliente Alejandro, bautizo 100 pax CDMX.
 */
const BASE =
  process.env.LUCY_URL?.replace(/\/$/, "") ||
  "https://midnightblue-mosquito-424375.hostingersite.com";

const leadId = `test-alejandro-${Date.now()}`;

let lead = {
  id: leadId,
  name: "Contacto WhatsApp",
  contact_phone: "5512345678",
  stage_id: "stage_leads_entrantes",
  custom_fields: {},
};

const DATA = {
  nombre: "Alejandro",
  correo: "alejandro.garcia@gmail.com",
  tipo: "bautizo",
  invitados: "100 personas",
  zona: "CDMX, Ciudad de México",
  fecha: "20 de septiembre de 2026 a las 2pm",
  presupuesto: "como 80 mil pesos",
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
  if (/tipo\s+de|qu[eé]\s+tipo|celebraci[oó]n|festejan|boda|bautizo|xv/.test(r)) return "tipo";
  if (/servicios|requerimientos|cotizar|qu[eé]\s+necesitas|qu[eé]\s+te\s+gustar[ií]a/.test(r)) return "servicios";
  if (/cu[aá]ntas?\s+personas|invitados|para\s+cu[aá]ntos/.test(r)) return "invitados";
  if (/d[oó]nde|zona|ubicaci[oó]n|ciudad|lugar/.test(r)) return "zona";
  if (/fecha|cu[aá]ndo|d[ií]a/.test(r)) return "fecha";
  if (/presupuesto|rango|cu[aá]nto/.test(r)) return "presupuesto";
  if (/ya tengo todo|cat[aá]logo/.test(r)) return "cierre";
  return null;
}

function clientReply(asked, turnIndex) {
  if (turnIndex === 0) {
    return "Hola, quiero cotizar un bautizo para mi hijo";
  }
  switch (asked) {
    case "nombre":
      return `Me llamo ${DATA.nombre}`;
    case "correo":
      return DATA.correo;
    case "tipo":
      return `Es un ${DATA.tipo}`;
    case "servicios":
      return "¿Qué me recomiendas meter en el bautizo? Banquete, pastel, mesa de dulces, algo más?";
    case "invitados":
      return `Serían ${DATA.invitados}`;
    case "zona":
      return DATA.zona;
    case "fecha":
      return DATA.fecha;
    case "presupuesto":
      return DATA.presupuesto;
    case "cierre":
      return "Gracias, por ahora eso es todo";
    default:
      return "Sí, claro";
  }
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

  if (i === 0 && !/lucy|bodasesor/i.test(reply)) {
    issues.push("Primer mensaje sin presentación Lucy");
  }
  if (i === 0 && asked !== "nombre" && !/nombre/.test(reply.toLowerCase())) {
    issues.push("Primer turno no pidió nombre primero");
  }
  if (userMsg.includes("recomiendas") && !/alimentos|banquete|mobiliario|carpa|pista|dj|mesas|taquiza|barra/i.test(reply.toLowerCase())) {
    issues.push("No listó opciones de servicios al hablar de requerimientos");
  }
  if (data.status === "error") {
    issues.push(`Error API: ${data.error}`);
  }
  if (/error|fall[oó]/i.test(reply) && reply.length < 200) {
    issues.push("Respuesta parece error");
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

  let lastAsked = null;
  const maxTurns = 12;

  for (let i = 0; i < maxTurns; i++) {
    const userMsg = clientReply(lastAsked, i);
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

    lastAsked = analysis.asked;

    if (analysis.all_fields_filled && analysis.asked === "cierre") break;
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

  const expected = ["nombre", "correo", "tipo", "servicios", "invitados", "zona", "fecha", "presupuesto"];
  const missing = expected.filter((f) => !fieldOrder.includes(f));
  if (missing.length) console.log(`Campos no preguntados en la prueba: ${missing.join(", ")}`);

  process.exit(allIssues.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
