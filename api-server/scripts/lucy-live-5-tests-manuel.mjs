/**
 * 5 pruebas en vivo contra el simulador de Lucy — foco en el bucle
 * de "¿algún otro servicio?" (caso real A14770 - Manuel) y en que
 * Lucy siga ofreciendo/vendiendo con tono natural.
 * Uso: node scripts/lucy-live-5-tests-manuel.mjs [baseUrl]
 */
const BASE =
  process.argv[2]?.replace(/\/$/, "") ||
  "https://midnightblue-mosquito-424375.hostingersite.com";

async function reset(leadId) {
  await fetch(`${BASE}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });
}

async function send(leadId, text, leadName = "Cliente prueba") {
  const res = await fetch(`${BASE}/api/kommo/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      lead_id: leadId,
      lead: {
        id: leadId,
        name: leadName,
        pipeline_id: "pipeline_bodasesor",
        stage_id: "stage_datos_intereses",
        contact_phone: "+5215500000002",
        contact_email: "",
        custom_fields: {},
      },
    }),
  });
  return res.json();
}

function countOtroServicioAsks(replies) {
  return replies.filter((r) => /alg[uú]n\s+otro\s+servicio|otro\s+servicio\b/i.test(r)).length;
}

const SCENARIOS = [
  {
    id: "M1-manuel-real",
    name: 'Manuel A14770 — secuencia real completa hasta "No"',
    leadId: 94001,
    turns: [
      "Quiero hacer una cotizacion",
      "Manuel Arteaga",
      "arteagamanuel714@gmail.com",
      "Es un cumpleaños para un menor de edad (3 años). Me gustaría que hubiera mucha distracción visual",
      "De acuerdo, me gustaría todo, excepto las pantallas de proyección",
      "Sin catering",
      "Ninguno me interesa",
      "Contemplo de 100 a 150 invitados",
      "Naucalpan de Juárez. Edo Mex",
      "La vamos definiendo",
      "Para el próximo año",
      "Entre 10 mil a 15 mil pesos, dependiendo de lo que ofrezca el show",
      "No me interesa",
      "No",
      "No",
      "Gracias",
    ],
  },
  {
    id: "M2-decline-directo",
    name: 'Declina servicios extra con "Solo con eso" — debe cerrar de inmediato',
    leadId: 94002,
    turns: [
      "Hola, quiero cotizar taquiza para cumpleaños",
      "Laura",
      "laura@test.com",
      "Cumpleaños",
      "Taquiza para 60 personas",
      "60",
      "Toluca",
      "20 de agosto",
      "50 mil pesos",
      "Solo con eso",
    ],
  },
  {
    id: "M3-pregunta-real-tras-cierre",
    name: "Pregunta real sobre un servicio no bloquea el cierre",
    leadId: 94003,
    turns: [
      "Hola, cotización de XV años con show en vivo",
      "Karla",
      "karla@test.com",
      "XV años",
      "Show en vivo y animación",
      "100",
      "Puebla",
      "Marzo",
      "80 mil",
      "¿Cómo funciona el show en vivo, traen su propio equipo de sonido?",
    ],
  },
  {
    id: "M4-tipo-evento-no-se-contamina",
    name: "Tipo de evento no se contamina con mensaje corto posterior",
    leadId: 94004,
    turns: [
      "Hola, cotización para bautizo",
      "Jorge",
      "jorge@test.com",
      "Bautizo",
      "Banquete y mobiliario",
      "80",
      "Ciudad de México",
      "Septiembre",
      "60 mil",
      "Fiesta dinámica",
      "No",
    ],
  },
  {
    id: "M5-varios-no-seguidos",
    name: 'Varios "No" seguidos no reabren venta ni repiten pregunta',
    leadId: 94005,
    turns: [
      "Hola, banquete para corporativo",
      "Ana",
      "ana@test.com",
      "Corporativo",
      "Banquete y DJ",
      "90",
      "Santa Fe",
      "Noviembre",
      "70 mil",
      "No",
      "No",
      "Ninguno",
    ],
  },
];

async function runScenario(scenario) {
  await reset(scenario.leadId);
  const transcript = [];
  let lastError = null;

  for (const userMsg of scenario.turns) {
    const data = await send(scenario.leadId, userMsg);
    if (data.status === "error" || data.error) {
      lastError = data.reply || data.error;
      transcript.push({ user: userMsg, reply: `[ERROR] ${lastError}` });
      break;
    }
    transcript.push({ user: userMsg, reply: data.reply || "" });
    await new Promise((r) => setTimeout(r, 1100));
  }

  const replies = transcript.map((t) => t.reply);
  const otroServicioAsks = countOtroServicioAsks(replies);
  const closed = replies.some((r) => /Perfecto, ya tengo todo/i.test(r));
  const salesHits = replies.filter((r) =>
    /banquete|taquiza|show|animaci|entretenimiento|pista|tarima|mobiliario|dj|nuestro equipo|catálogo/i.test(r)
  ).length;

  const ok = !lastError && otroServicioAsks <= 1 && closed && salesHits > 0;

  return { ...scenario, transcript, otroServicioAsks, closed, salesHits, ok, lastError };
}

async function main() {
  console.log(`\nLucy — 5 pruebas en vivo (foco: bucle "algún otro servicio")\nBase: ${BASE}\n${"=".repeat(60)}\n`);

  const results = [];
  for (const sc of SCENARIOS) {
    process.stdout.write(`▶ ${sc.id} ${sc.name}... `);
    try {
      const r = await runScenario(sc);
      results.push(r);
      console.log(r.ok ? "OK" : "REVISAR");
      if (!r.ok) {
        if (r.lastError) console.log(`   error: ${r.lastError.slice(0, 150)}`);
        console.log(`   otroServicioAsks=${r.otroServicioAsks} closed=${r.closed} salesHits=${r.salesHits}`);
      }
    } catch (e) {
      console.log("FALLÓ");
      results.push({ ...sc, ok: false, error: e.message, transcript: [] });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Resultado: ${passed}/5 OK\n`);

  console.log("EJEMPLO COMPLETO — M1 (secuencia real de Manuel A14770):\n");
  const m1 = results.find((r) => r.id === "M1-manuel-real");
  if (m1) {
    for (const t of m1.transcript) {
      console.log(`👤 Cliente: ${t.user}`);
      console.log(`🤖 Lucy:    ${t.reply.replace(/\n/g, "\n           ")}\n`);
    }
  }

  console.log("\n--- RESUMEN POR PRUEBA ---\n");
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.id}: ${r.name}`);
    console.log(`   preguntas "algún otro servicio": ${r.otroServicioAsks} | cerró: ${r.closed} | vende: ${r.salesHits > 0}`);
  }

  process.exit(passed >= 4 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
