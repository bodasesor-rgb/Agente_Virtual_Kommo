#!/usr/bin/env node
/**
 * 3 escenarios E2E en producción — reporte completo cliente vs Lucy.
 */
const BASE =
  process.env.LUCY_URL?.replace(/\/$/, "") ||
  "https://midnightblue-mosquito-424375.hostingersite.com";

const SCENARIOS = [
  {
    id: "con-correo",
    title: "Cliente cooperativo CON correo",
    script: [
      "Hola, quiero cotizar una boda",
      "Me llamo María López",
      "maria.lopez@gmail.com",
      "Banquete y barra de bebidas",
      "150 invitados",
      "En Polanco, CDMX",
      "15 de junio de 2027",
      "Como 200 mil pesos",
    ],
  },
  {
    id: "sin-correo-preguntas",
    title: "Cliente SIN correo + hace preguntas libres",
    script: [
      "Buenas, necesito info para un XV años",
      "Soy Valentina",
      "No tengo correo, prefiero por WhatsApp",
      "¿Qué me recomiendas? ¿Banquete o taquiza?",
      "Taquiza con mesa de dulces",
      "¿Tienen DJ? ¿Cuánto cuesta más o menos?",
      "Serían 80 personas",
      "En Guadalajara",
      "Sábado 10 de agosto de 2026",
      "No sé el presupuesto, que me propongan opciones",
    ],
  },
  {
    id: "solo-sigue-lucy",
    title: "Cliente que SOLO responde lo que Lucy pregunta (sin preguntas extra)",
    script: [
      "Hola",
      "Roberto",
      "roberto.mendez@hotmail.com",
      "Cumpleaños de 50 años",
      "Taquiza y DJ",
      "60 personas",
      "Toluca",
      "20 de marzo de 2027",
      "50 mil pesos",
    ],
  },
];

async function reset(leadId) {
  await fetch(`${BASE}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });
}

async function send(leadId, lead, text) {
  const res = await fetch(`${BASE}/api/kommo/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lead_id: leadId, lead, message: { text } }),
  });
  return res.json();
}

function mergeLead(lead, data) {
  const u = data.lead_updates || {};
  if (u.name) lead.name = u.name;
  if (u.contact_email) lead.contact_email = u.contact_email;
  if (data.fields) lead.custom_fields = { ...lead.custom_fields, ...data.fields };
  if (data.stage_id) lead.stage_id = data.stage_id;
}

async function runScenario(scenario) {
  const leadId = `test-${scenario.id}-${Date.now()}`;
  const lead = {
    id: leadId,
    name: "",
    contact_phone: "5512345678",
    stage_id: "stage_leads_entrantes",
    custom_fields: {},
  };

  await reset(leadId);

  const turns = [];
  const maxTurns = Math.max(scenario.script.length + 2, 12);

  for (let i = 0; i < maxTurns; i++) {
    const userMsg = i < scenario.script.length ? scenario.script[i] : null;
    if (!userMsg) break;

    const data = await send(leadId, lead, userMsg);
    mergeLead(lead, data);
    const reply = data.reply || data.error || "(sin respuesta)";

    turns.push({ turn: i + 1, cliente: userMsg, lucy: reply, all_fields_filled: data.all_fields_filled });

    if (data.all_fields_filled && /ya tengo todo|cotizaci[oó]n personalizada/i.test(reply)) break;
    if (data.status === "error") break;

    await new Promise((r) => setTimeout(r, 1800));
  }

  return { leadId, turns, final: turns.at(-1) };
}

async function main() {
  console.log(`Base: ${BASE}\n`);
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log(`Health: v${health.version}\n`);

  const results = [];
  for (const scenario of SCENARIOS) {
    console.log(`\n${"=".repeat(60)}\nEjecutando: ${scenario.title}\n${"=".repeat(60)}`);
    const result = await runScenario(scenario);
    results.push({ ...scenario, ...result });
    for (const t of result.turns) {
      console.log(`\n[Turno ${t.turn}]`);
      console.log(`CLIENTE: ${t.cliente}`);
      console.log(`LUCY: ${t.lucy}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  // JSON para el agente
  const reportPath = "/tmp/lucy-3-escenarios.json";
  const fs = await import("fs");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n\nReporte JSON: ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
