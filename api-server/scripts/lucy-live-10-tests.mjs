/**
 * 10 pruebas en vivo contra el simulador de Lucy (producción o local).
 * Uso: node scripts/lucy-live-10-tests.mjs [baseUrl]
 */
const BASE =
  process.argv[2]?.replace(/\/$/, "") ||
  "https://midnightblue-mosquito-424375.hostingersite.com";

const FIELD_PATTERNS = {
  nombre: /nombre|llamas|qui[eé]n/i,
  correo: /correo|e-?mail/i,
  tipo_evento: /tipo de evento|festejan|qu[eé] celebr/i,
  requerimientos: /servicios|cotizar|banquete|taquiza|pensado/i,
  invitados: /invitados|personas|cu[aá]ntos/i,
  zona: /ciudad|d[oó]nde|zona|lugar|ubicaci[oó]n/i,
  fecha: /fecha|cu[aá]ndo|d[ií]a|definiendo/i,
  presupuesto: /presupuesto|rango|estimado|inversi[oó]n/i,
};

const SALES_MARKERS =
  /banquete|taquiza|catering|alimentos|show|entretenimiento|pista|tarima|mobiliario|carpa|dj|iluminaci|cat[aá]logo|opciones|te ayudo|con gusto/i;

const ROBOT_MARKERS =
  /informaci[oó]n completa obtenida|DATOS DEL CLIENTE|paso \d|campo obligatorio|debes proporcionar|error de sistema/i;

const STEP_ORDER = [
  "nombre",
  "correo",
  "tipo_evento",
  "requerimientos",
  "invitados",
  "zona",
  "fecha",
  "presupuesto",
];

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
        contact_phone: "+5215500000001",
        contact_email: "",
        custom_fields: {},
      },
    }),
  });
  const data = await res.json();
  return data;
}

function detectAskedFields(reply) {
  const asked = [];
  if (!reply.includes("?")) return asked;
  for (const [field, pattern] of Object.entries(FIELD_PATTERNS)) {
    if (pattern.test(reply)) asked.push(field);
  }
  return asked;
}

function analyzeConversation(turns) {
  const issues = [];
  const wins = [];
  const askedCounts = Object.fromEntries(STEP_ORDER.map((f) => [f, 0]));
  let lastAsked = null;
  let salesHits = 0;
  let robotHits = 0;
  let introOk = false;

  for (let i = 0; i < turns.length; i++) {
    const { user, reply } = turns[i];
    if (i === 0 && /hola,?\s*soy\s+lucy/i.test(reply)) introOk = true;
    if (SALES_MARKERS.test(reply)) salesHits++;
    if (ROBOT_MARKERS.test(reply)) robotHits++;

    const asked = detectAskedFields(reply);
    for (const f of asked) {
      askedCounts[f]++;
      if (askedCounts[f] > 1) {
        issues.push(`REPITE ${f} (${askedCounts[f]}ª vez) tras: "${user.slice(0, 40)}"`);
      }
      if (lastAsked && STEP_ORDER.indexOf(f) > STEP_ORDER.indexOf(lastAsked) + 2) {
        issues.push(`SALTA paso: de ${lastAsked} a ${f}`);
      }
      lastAsked = f;
    }

    if (/rango de presupuesto|presupuesto estimado|presupuesto en mente/i.test(reply)) {
      const presCount = turns
        .slice(0, i + 1)
        .filter((t) => /presupuesto|rango|estimado/i.test(t.reply))
        .length;
      if (presCount >= 3) issues.push(`BUCLE presupuesto (${presCount} preguntas)`);
    }
  }

  if (introOk) wins.push("presentación Lucy");
  if (salesHits > 0) wins.push(`orientación venta (${salesHits} turnos)`);
  if (robotHits === 0) wins.push("sin texto robot");
  if (issues.length === 0) wins.push("sin repeticiones ni saltos detectados");

  return { issues, wins, askedCounts, salesHits, robotHits, introOk };
}

const SCENARIOS = [
  {
    id: "T1-boda-comida",
    name: "Boda + comida — flujo completo",
    leadId: 91001,
    turns: [
      "Hola, quiero cotizar banquete para mi boda",
      "Mariana",
      "mariana@gmail.com",
      "Boda",
      "Banquete y barra de bebidas",
      "120 personas",
      "CDMX, Polanco",
      "15 de agosto",
      "Entre 150 y 200 mil",
    ],
  },
  {
    id: "T2-pista-tarima",
    name: "Pista/tarima — debe vender (Fer A14756)",
    leadId: 91002,
    turns: [
      "Hola, me gustaría cotizar una pista de baile o tarima para mi evento",
      "Fer",
      "ferramlun2206@gmail.com",
      "Cumpleaños",
      "Pista de baile",
      "50 personas",
      "Son 50 personas. El espacio es de 6 metros por 12",
      "15 de julio",
      "Lo más económico posible",
    ],
  },
  {
    id: "T3-baby-brunch",
    name: "Baby shower brunch — presupuesto sin bucle (A14751)",
    leadId: 91003,
    turns: [
      "Quiero hacer una cotizacion de brunch para baby shower",
      "Fer",
      "fer.barrientost2892@gmail.com",
      "Baby shower",
      "Brunch/ desayuno para 35 personas",
      "35",
      "Jardines del pedregal",
      "Todavía la vamos a definir",
      "Tu mándame el presupuesto y si quieres vemos",
    ],
  },
  {
    id: "T4-show",
    name: "Show entretenimiento — orientación venta",
    leadId: 91004,
    turns: [
      "Hola, requerimos un show de grupo versatil para evento corporativo",
      "Bakar",
      "compras1@scabakar.com",
      "Evento corporativo",
      "Show de grupo versátil",
      "30 personas",
      "Club de Golf Mexico",
      "18 de diciembre a las 20:00",
      "no",
    ],
  },
  {
    id: "T5-correo-waiver",
    name: "Correo — prefiere por aquí (Verónica)",
    leadId: 91005,
    turns: [
      "Hola, cotización para cumpleaños con taquiza",
      "Verónica Camarillo",
      "Si me la pueden mandar por aquí porfa",
      "Cumpleaños",
      "Taquiza",
      "80 personas",
      "Naucalpan",
      "Próximo mes",
      "Sin presupuesto fijo",
    ],
  },
  {
    id: "T6-taquiza",
    name: "Taquiza directa — vendedor natural",
    leadId: 91006,
    turns: [
      "Taquiza para 60 personas en Puebla el 20 de septiembre",
      "Carlos",
      "carlos@test.com",
      "Fiesta familiar",
      "Taquiza",
      "60",
      "Puebla centro",
      "20 de septiembre",
      "80 mil pesos",
    ],
  },
  {
    id: "T7-recomendaciones",
    name: "Pide recomendaciones — bautizo",
    leadId: 91007,
    turns: [
      "Hola, ¿qué me recomiendas para un bautizo?",
      "Lucía",
      "lucia@test.com",
      "Bautizo",
      "Lo que recomiendes para 40 personas",
      "40",
      "Querétaro",
      "En 3 semanas",
      "Flexible",
    ],
  },
  {
    id: "T8-telefonos",
    name: "Pregunta teléfonos en medio del flujo",
    leadId: 91008,
    turns: [
      "Hola, evento corporativo con coffee break",
      "Roberto",
      "¿Me pasas los teléfonos de bodasesor?",
      "roberto@empresa.com",
      "Corporativo",
      "Coffee break y canapés",
      "50",
      "Santa Fe CDMX",
      "10 de octubre",
      "40 mil",
    ],
  },
  {
    id: "T9-xv",
    name: "XV años — flujo ordenado",
    leadId: 91009,
    turns: [
      "Cotización para XV años",
      "Sofía",
      "sofia@test.com",
      "XV años",
      "Banquete, DJ y mesa de dulces",
      "150",
      "Tlalnepantla",
      "Julio del año que entra",
      "200 mil",
    ],
  },
  {
    id: "T10-presupuesto-bucle",
    name: "Presupuesto — resiste 3 intentos de no dar monto",
    leadId: 91010,
    turns: [
      "Hola, banquete para aniversario",
      "Pedro",
      "pedro@test.com",
      "Aniversario",
      "Banquete",
      "70",
      "Coyoacán",
      "Diciembre",
      "No sé",
      "Mejor mándame opciones",
      "Cuando veamos",
    ],
  },
];

async function runScenario(scenario) {
  await reset(scenario.leadId);
  const turns = [];
  let lastError = null;

  for (const userMsg of scenario.turns) {
    const data = await send(scenario.leadId, userMsg);
    if (data.status === "error" || data.error) {
      lastError = data.reply || data.error;
      turns.push({ user: userMsg, reply: `[ERROR] ${lastError}` });
      break;
    }
    turns.push({ user: userMsg, reply: data.reply || "" });
    await new Promise((r) => setTimeout(r, 800));
  }

  const analysis = analyzeConversation(turns);
  const ok = !lastError && analysis.issues.length === 0 && analysis.salesHits > 0;

  return { ...scenario, turns, analysis, ok, lastError };
}

async function main() {
  console.log(`\nLucy — 10 pruebas en vivo\nBase: ${BASE}\n${"=".repeat(60)}\n`);

  const results = [];
  for (const sc of SCENARIOS) {
    process.stdout.write(`▶ ${sc.id} ${sc.name}... `);
    try {
      const r = await runScenario(sc);
      results.push(r);
      console.log(r.ok ? "OK" : "REVISAR");
      if (!r.ok) {
        if (r.lastError) console.log(`   error: ${r.lastError.slice(0, 120)}`);
        for (const iss of r.analysis.issues.slice(0, 3)) console.log(`   ⚠ ${iss}`);
      }
    } catch (e) {
      console.log("FALLÓ");
      results.push({ ...sc, ok: false, error: e.message, turns: [], analysis: { issues: [e.message], wins: [] } });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Resultado: ${passed}/10 OK\n`);

  // Ejemplo completo — T3 baby shower brunch
  const ejemplo = results.find((r) => r.id === "T3-baby-brunch") || results[0];
  console.log("EJEMPLO COMPLETO (conversación real):\n");
  console.log(`Escenario: ${ejemplo.name}\n`);
  for (const t of ejemplo.turns) {
    console.log(`👤 Cliente: ${t.user}`);
    console.log(`🤖 Lucy:    ${t.reply.replace(/\n/g, "\n           ")}\n`);
  }

  console.log("\n--- RESUMEN POR PRUEBA ---\n");
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.id}: ${r.name}`);
    if (r.analysis?.wins?.length) console.log(`   + ${r.analysis.wins.join(", ")}`);
    if (r.analysis?.issues?.length) console.log(`   - ${r.analysis.issues.join("; ")}`);
  }

  process.exit(passed >= 8 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
