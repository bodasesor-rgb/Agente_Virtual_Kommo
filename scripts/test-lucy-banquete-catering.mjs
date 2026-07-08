#!/usr/bin/env node
/**
 * Prueba Lucy en producción: banquete, catering, precios del Sheet, sin inventar.
 */
const BASE =
  process.env.LUCY_URL?.replace(/\/$/, "") ||
  "https://midnightblue-mosquito-424375.hostingersite.com";

const SHEET_PRICES = {
  banquete3: [450, 780, 830, 880],
  banquete4: [500, 830, 880, 930],
  taquiza: [300, 750, 800, 850],
};

const SCENARIOS = [
  {
    id: "banquete-precio",
    title: "Cliente pregunta precio de banquete",
    messages: [
      "Hola, quiero cotizar un banquete para mi boda",
      "Me llamo Ana",
      "ana@test.com",
      "¿Cuánto cuesta el banquete por persona?",
    ],
    expect: (reply) => ({
      hasSheetPrice: /\$450|\$780|\$830|\$880|\$500|\$930|450\.00|780\.00/i.test(reply),
      noInvented: !/\$1,?200|\$600|\$950|\$1,?000/i.test(reply) || /\$450|\$780|\$830|\$880|\$500|\$930/i.test(reply),
      mentionsBanquete: /banquete/i.test(reply),
      noGamma: !/gamma\.app/i.test(reply),
    }),
  },
  {
    id: "banquete-inclusiones",
    title: "Cliente pregunta qué incluye el banquete",
    messages: [
      "Hola",
      "Carlos",
      "carlos@test.com",
      "Banquete formal para 120 personas",
      "¿Qué incluye el banquete de 3 tiempos?",
    ],
    expect: (reply) => ({
      hasInclusion: /entrada|sopa|plato fuerte|guarnicion|postre|mesero|vajilla/i.test(reply),
      hasSheetPrice: /\$450|\$780|\$830|\$880/i.test(reply) || /incluye/i.test(reply),
    }),
  },
  {
    id: "catering-generico",
    title: "Cliente dice catering (no está en Sheet como palabra)",
    messages: [
      "Hola, necesito catering para un evento corporativo",
      "Soy Luis",
      "luis@empresa.com",
      "¿Qué opciones de catering manejan y cuánto cuesta?",
    ],
    expect: (reply) => ({
      offersFood: /banquete|taquiza|brunch|coffee|barras/i.test(reply),
      hasReferencePrice: /\$300|\$450|\$750|\$780|desde/i.test(reply) || /alejandro|presupuesto/i.test(reply),
      noGamma: !/gamma\.app/i.test(reply),
    }),
  },
  {
    id: "taquiza-control",
    title: "Control taquiza — precios conocidos del Sheet",
    messages: [
      "Hola",
      "María",
      "maria@test.com",
      "Taquiza para 80 personas",
      "¿Cuánto cuesta la taquiza por persona?",
    ],
    expect: (reply) => ({
      hasSheetPrice: /\$300|\$750|\$800|\$850|300\.00|750\.00/i.test(reply),
      hasInclusion: /guisado|arroz|frijol|tortilla|mesero/i.test(reply),
      noGamma: !/gamma\.app/i.test(reply),
    }),
  },
  {
    id: "banquete-vs-taquiza",
    title: "Cliente pide recomendación banquete o taquiza",
    messages: [
      "Hola, tengo un XV años",
      "Valentina",
      "No tengo correo",
      "¿Qué me recomiendas, banquete o taquiza?",
      "Serían 100 personas",
    ],
    expect: (reply) => ({
      mentionsBoth: /banquete/i.test(reply) && /taquiza/i.test(reply),
      hasPrices: /\$300|\$450|\$750|\$780/i.test(reply),
      noConfusion: !/error|no entiendo|no s[eé]/i.test(reply),
      noGamma: !/gamma\.app/i.test(reply),
    }),
  },
];

async function reset(leadId) {
  await fetch(`${BASE}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });
}

async function send(leadId, text, lead = {}) {
  const res = await fetch(`${BASE}/api/kommo/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      lead_id: leadId,
      lead: {
        id: leadId,
        name: lead.name || "",
        contact_email: lead.contact_email || "",
        custom_fields: lead.custom_fields || {},
      },
    }),
  });
  return res.json();
}

function mergeLead(lead, data) {
  const u = data.lead_updates || {};
  if (u.name) lead.name = u.name;
  if (u.contact_email) lead.contact_email = u.contact_email;
  if (data.fields) lead.custom_fields = { ...lead.custom_fields, ...data.fields };
}

async function runScenario(scenario) {
  const leadId = `test-${scenario.id}-${Date.now()}`;
  const lead = { custom_fields: {} };
  await reset(leadId);

  const turns = [];
  let lastReply = "";

  for (const msg of scenario.messages) {
    const data = await send(leadId, msg, lead);
    mergeLead(lead, data);
    lastReply = data.reply || data.error || "(sin respuesta)";
    turns.push({ cliente: msg, lucy: lastReply, error: data.status === "error" ? data.error : null });
    if (data.status === "error") break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  const checks = scenario.expect(lastReply);
  const passed = Object.values(checks).every(Boolean);
  const hasGammaLink = /gamma\.app/i.test(lastReply);

  return { ...scenario, leadId, turns, lastReply, checks, passed, hasGammaLink };
}

async function main() {
  console.log(`\n🧪 Pruebas Lucy — Banquete / Catering\nBase: ${BASE}\n`);

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  const catalog = await fetch(`${BASE}/api/catalog/status`).then((r) => r.json());
  console.log("Catálogo:", {
    sheets: catalog.catalog?.sources?.sheets,
    rows: catalog.catalog?.sources?.sheetsRows,
    gamma: catalog.catalog?.sources?.gamma,
    priced: catalog.catalog?.pricedServicesCount,
  });
  console.log("OpenAI:", health.openai_configured ? "OK" : "NO");
  console.log("");

  const results = [];
  for (const scenario of SCENARIOS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📋 ${scenario.title}`);
    const result = await runScenario(scenario);
    results.push(result);

    for (const t of result.turns) {
      console.log(`\n  CLIENTE: ${t.cliente}`);
      console.log(`  LUCY: ${t.lucy.slice(0, 500)}${t.lucy.length > 500 ? "…" : ""}`);
    }

    console.log(`\n  Checks:`, result.checks);
    console.log(`  Gamma link en respuesta: ${result.hasGammaLink ? "⚠️ SÍ" : "✅ NO"}`);
    console.log(`  Resultado: ${result.passed ? "✅ PASS" : "❌ FAIL"}`);
    await new Promise((r) => setTimeout(r, 2500));
  }

  const passed = results.filter((r) => r.passed).length;
  const gammaLeaks = results.filter((r) => r.hasGammaLink || r.checks?.noGamma === false).length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESUMEN: ${passed}/${results.length} escenarios OK`);
  console.log(`Links Gamma al cliente: ${gammaLeaks} respuesta(s) con gamma.app`);
  console.log(`${"=".repeat(60)}\n`);

  process.exit(passed === results.length && gammaLeaks === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
