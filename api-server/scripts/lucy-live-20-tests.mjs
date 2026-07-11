#!/usr/bin/env node
/**
 * Batería de 20 pruebas en vivo contra el simulador Lucy (pipeline real).
 *
 * Uso:
 *   node scripts/lucy-live-20-tests.mjs [baseUrl]
 *   node scripts/lucy-live-20-tests.mjs --test 1,4,10
 *   node scripts/lucy-live-20-tests.mjs --no-judge
 *
 * Requiere OPEN_AI u OPENAI_API_KEY en el entorno para el juez LLM (opcional con --no-judge).
 * El servidor destino también necesita OPEN_AI para generar respuestas.
 */
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const BASE = (args[0] || "https://midnightblue-mosquito-424375.hostingersite.com").replace(/\/$/, "");
const TEST_FILTER = (() => {
  const f = process.argv.find((a) => a.startsWith("--test="));
  if (!f) return null;
  return new Set(f.replace("--test=", "").split(",").map((n) => Number(n.trim())));
})();
const USE_JUDGE = !flags.has("--no-judge");
const DELAY_MS = Number(process.env.LUCY_TEST_DELAY_MS ?? 900);
const JUDGE_MODEL = process.env.LUCY_JUDGE_MODEL ?? "gpt-4o-mini";

const OWN_EMAILS = /bodasesor@gmail|capybaraeventos@gmail|@bodasesor\.com/i;
const ROBOT_MARKERS = /DATOS DEL CLIENTE|Información completa obtenida|paso \d|campo obligatorio/i;
const PRICE_RE = /\$\s*[\d,.]+|[\d,.]+\s*(?:mil|mxn|pesos)|desde\s+\$?\s*[\d,.]+/i;
const MENU_DUMP_RE = /banquete.*taquiza.*(dj|bebidas|iluminaci)/i;

// ─── Helpers ───────────────────────────────────────────────────────────────

async function reset(leadId) {
  await fetch(`${BASE}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });
}

async function send(leadId, text, leadName = "") {
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
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSnapshot(snapshot = "") {
  const map = {};
  for (const line of String(snapshot).split("\n")) {
    const m = line.match(/^-?\s*(.+?):\s*(.+)$/);
    if (m) map[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return map;
}

function snapVal(run, ...labels) {
  const map = run.snapshot;
  for (const label of labels) {
    const key = label.toLowerCase();
    if (map[key]) return map[key];
    const hit = Object.entries(map).find(([k]) => k.includes(key));
    if (hit) return hit[1];
  }
  const ex = run.lastData?.extracted ?? {};
  for (const label of labels) {
    const k = label.replace(/\s+/g, "_").toLowerCase();
    if (ex[k] != null && ex[k] !== "") return String(ex[k]);
  }
  return null;
}

function normalizeBlock(text) {
  return String(text)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[¿?¡!.,]/g, "")
    .trim();
}

function blockSimilarity(a, b) {
  const na = normalizeBlock(a);
  const nb = normalizeBlock(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (!wordsA.size || !wordsB.size) return 0;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  return shared / Math.max(wordsA.size, wordsB.size);
}

function hasRepeatedBlocks(replies, threshold = 0.72) {
  for (let i = 0; i < replies.length; i++) {
    for (let j = i + 1; j < replies.length; j++) {
      if (blockSimilarity(replies[i], replies[j]) >= threshold) return true;
    }
  }
  return false;
}

function countFieldAsks(replies, pattern) {
  return replies.filter((r) => pattern.test(r) && r.includes("?")).length;
}

function transcriptText(run) {
  return run.turns.map((t) => `Cliente: ${t.user}\nLucy: ${t.reply}`).join("\n\n");
}

function fail(reason, observed, failureType = "CODIGO") {
  return { pass: false, observed, reason, failureType };
}

function pass(observed, reason = "Cumple criterio") {
  return { pass: true, observed, reason, failureType: null };
}

async function llmJudge(criterion, run) {
  const key = process.env.OPEN_AI?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!USE_JUDGE || !key) {
    return { pass: null, reason: "Juez LLM omitido (--no-judge o sin OPEN_AI)", failureType: null };
  }
  const body = {
    model: JUDGE_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Eres evaluador QA de Lucy (bot Bodasesor). Responde SOLO JSON: {"pass":boolean,"reason":string,"failure_type":"PROMPT"|"CODIGO"|null}',
      },
      {
        role: "user",
        content: `Criterio:\n${criterion}\n\nTranscripción:\n${transcriptText(run)}\n\nEstado CRM:\n${run.lastData?.fields?.cf_crm_snapshot ?? ""}\n\nÚltima respuesta Lucy:\n${run.turns.at(-1)?.reply ?? ""}`,
      },
    ],
  };
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return {
      pass: !!parsed.pass,
      reason: parsed.reason ?? raw,
      failureType: parsed.failure_type ?? (parsed.pass ? null : "PROMPT"),
    };
  } catch (err) {
    return { pass: null, reason: `Juez falló: ${err.message}`, failureType: null };
  }
}

function checkGlobalRules(run) {
  const issues = [];
  const replies = run.replies;
  if (hasRepeatedBlocks(replies)) issues.push("GLOBAL: repite bloque de texto muy similar");
  if (replies.some((r) => ROBOT_MARKERS.test(r))) issues.push("GLOBAL: texto robot/CRM al cliente");
  if (replies.join(" ").match(/Quiere:\s*Quiere:/i)) issues.push("GLOBAL: duplicación Quiere:");
  return issues;
}

async function runScenario(scenario) {
  await reset(scenario.leadId);
  const turns = [];
  let lastData = null;
  let lastError = null;

  for (const msg of scenario.messages) {
    const text = typeof msg === "string" ? msg : msg.text;
    const data = await send(scenario.leadId, text, scenario.leadName ?? "");
    lastData = data;
    if (data.status === "error" || data.error) {
      lastError = data.reply || data.error;
      turns.push({ user: text, reply: `[ERROR] ${lastError}`, data });
      break;
    }
    turns.push({ user: text, reply: data.reply || "", data });
    await sleep(DELAY_MS);
  }

  const run = {
    turns,
    replies: turns.map((t) => t.reply),
    lastData,
    snapshot: parseSnapshot(lastData?.fields?.cf_crm_snapshot ?? ""),
    lastError,
  };

  let result;
  if (lastError) {
    result = fail(`Error de pipeline: ${lastError}`, lastError, "CODIGO");
  } else {
    result = await scenario.evaluate(run);
    const globals = checkGlobalRules(run);
    if (globals.length && result.pass) {
      result = fail(globals.join("; "), result.observed, "CODIGO");
    } else if (globals.length && !result.pass) {
      result.reason += ` | ${globals.join("; ")}`;
    }
  }

  return { ...scenario, run, ...result };
}

// ─── Escenarios ────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    id: 1,
    name: "Cliente empresa — coffee break (no proveedor)",
    leadId: 92001,
    messages: ["Hola, soy Laura de Grupo Bimbo, quiero cotizar un coffee break para una junta."],
    async evaluate(run) {
      const ex = run.lastData?.extracted ?? {};
      const tipo = ex.tipo_contacto;
      const allText = run.replies.join(" ");
      if (tipo === "proveedor") return fail("Etiquetado como proveedor", `tipo=${tipo}`, "CODIGO");
      if (/proveedor/i.test(allText) && /etiquet|nota.*proveedor/i.test(allText)) {
        return fail("Menciona proveedor al cliente", allText.slice(0, 200), "PROMPT");
      }
      const coffee = /coffee\s*break/i.test(allText) || /coffee\s*break/i.test(snapVal(run, "requerimientos") ?? "");
      if (!coffee) return fail("No reconoció coffee break", allText.slice(0, 200), "PROMPT");
      return pass(`tipo=${tipo ?? "cliente"}, coffee break reconocido`);
    },
  },
  {
    id: 2,
    name: "Correo propio bodasesor — no guardar",
    leadId: 92002,
    messages: ["Mandé mi solicitud a bodasesor@gmail.com, ¿es el correo correcto?"],
    async evaluate(run) {
      const email = snapVal(run, "correo electrónico", "correo") ?? run.lastData?.lead_updates?.contact_email ?? "";
      const exEmail = run.lastData?.extracted?.correo ?? "";
      if (OWN_EMAILS.test(email) || OWN_EMAILS.test(exEmail)) {
        return fail("Guardó correo propio", email || exEmail, "CODIGO");
      }
      const reply = run.replies[0] ?? "";
      const confirms = /sí|correcto|ese es|nuestro correo|llegó/i.test(reply);
      const asksClient = /tu correo|correo electrónico|a qué correo/i.test(reply);
      if (!confirms && !asksClient) {
        const judge = await llmJudge(
          "Confirma que bodasesor@gmail.com es nuestro correo y pide el correo del cliente; NO guarda bodasesor@gmail.com como correo del cliente.",
          run,
        );
        if (judge.pass === false) return { ...judge, observed: reply.slice(0, 200) };
      }
      return pass(`No guardó correo propio; respuesta: ${reply.slice(0, 120)}…`);
    },
  },
  {
    id: 3,
    name: "Corrige correo — nunca el nuestro",
    leadId: 92003,
    messages: [
      "Quiero una cotización.",
      "no sé, mándalo a bodasesor@gmail.com",
      "mejor a laura.mtz@empresa.com",
    ],
    async evaluate(run) {
      const email = (
        snapVal(run, "correo electrónico") ??
        run.lastData?.lead_updates?.contact_email ??
        run.lastData?.extracted?.correo ??
        ""
      ).toLowerCase();
      if (!email.includes("laura.mtz@empresa.com")) {
        return fail("Correo final incorrecto", email || "(vacío)", "CODIGO");
      }
      if (OWN_EMAILS.test(email)) return fail("Quedó correo propio", email, "CODIGO");
      return pass(`Correo final: ${email}`);
    },
  },
  {
    id: 4,
    name: "Brief completo en un mensaje",
    leadId: 92004,
    messages: [
      "Boda para 150 personas en Coyoacán, el 12 de diciembre, quiero banquete y barra de bebidas, mi correo es ana@mail.com y soy Ana Torres.",
    ],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      const nombre = snapVal(run, "nombre del cliente") ?? run.lastData?.extracted?.nombre ?? "";
      const inv = snapVal(run, "número de invitados", "invitados") ?? run.lastData?.extracted?.num_invitados;
      const zona = snapVal(run, "lugar", "dirección", "ubicación") ?? run.lastData?.extracted?.direccion_evento ?? "";
      const correo = snapVal(run, "correo") ?? run.lastData?.extracted?.correo ?? "";
      const missing = [];
      if (!/ana\s+torres/i.test(nombre)) missing.push(`nombre=${nombre}`);
      if (!/ana@mail\.com/i.test(correo)) missing.push(`correo=${correo}`);
      if (!/150/.test(String(inv)) && !/150/.test(run.snapshot ? Object.values(run.snapshot).join(" ") : "")) {
        missing.push(`invitados=${inv}`);
      }
      if (!/coyoac/i.test(zona) && !/coyoac/i.test(reply)) missing.push(`zona=${zona}`);
      const reask = [
        [/nombre|llamas/i, /ana\s+torres/i.test(nombre)],
        [/correo|e-?mail/i, /ana@mail/i.test(correo)],
        [/invitados|personas/i, /150/.test(String(inv ?? ""))],
        [/ciudad|dónde|zona|ubicación/i, /coyoac/i.test(zona + reply)],
        [/fecha|cuándo/i, /diciembre|12/i.test(reply + JSON.stringify(run.snapshot))],
      ];
      for (const [pat, has] of reask) {
        if (!has && pat.test(reply) && reply.includes("?")) {
          missing.push(`repregunta ${pat}`);
        }
      }
      if (missing.length) return fail("No capturó todo o repreguntó", missing.join(", "), "CODIGO");
      return pass("Capturó datos del brief sin repreguntar lo obvio");
    },
  },
  {
    id: 5,
    name: "Pregunta de ubicación",
    leadId: 92005,
    messages: ["¿Dónde se ubican?"],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      const ubic = /cdmx|ciudad de méxico|área metropolitana|cobertura|zona|ubicad|trabajamos en/i.test(reply);
      const menuDump = MENU_DUMP_RE.test(reply) || (reply.length > 600 && /banquete/i.test(reply) && /taquiza/i.test(reply));
      if (!ubic) {
        const judge = await llmJudge("Responde ubicación o cobertura geográfica; NO recita menú genérico completo de servicios.", run);
        if (judge.pass === false) return { ...judge, observed: reply.slice(0, 200) };
        if (judge.pass !== true) return fail("Sin ubicación clara", reply.slice(0, 200), "PROMPT");
      }
      if (menuDump) return fail("Volcó menú genérico", reply.slice(0, 200), "PROMPT");
      return pass(reply.slice(0, 150));
    },
  },
  {
    id: 6,
    name: "Tema italiano — no taquiza",
    leadId: 92006,
    messages: ["Quiero un menú italiano para una fiesta temática de mafia italiana, 40 personas."],
    async evaluate(run) {
      const reply = run.replies.join(" ");
      const italian = /pasta|pizza|italian/i.test(reply);
      const mex = /taquiza|banquete mexicano/i.test(reply) && !/italian/i.test(reply);
      const inv = run.lastData?.extracted?.num_invitados ?? snapVal(run, "invitados");
      if (!italian) return fail("No ofreció comida italiana", reply.slice(0, 200), "PROMPT");
      if (mex) return fail("Ofreció taquiza/banquete mexicano", reply.slice(0, 200), "PROMPT");
      if (inv != 40 && !/40/.test(JSON.stringify(run.snapshot))) {
        return fail("No capturó 40 personas", `inv=${inv}`, "CODIGO");
      }
      return pass("Italiano + 40 personas");
    },
  },
  {
    id: 7,
    name: "Razonamiento fútbol Italia",
    leadId: 92007,
    messages: ["Vamos a ver el partido de la selección de Italia, ¿qué me recomiendas de comida?"],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      if (/no entiendo|no puedo ayudar|no sé qué/i.test(reply)) {
        return fail("Se trabó", reply.slice(0, 200), "PROMPT");
      }
      const judge = await llmJudge(
        "Deduce cocina italiana (pizzas/pastas) en tono casual; no se traba ni dice que no entiende.",
        run,
      );
      if (judge.pass === true) return pass(judge.reason);
      if (judge.pass === false) return { ...judge, observed: reply.slice(0, 200) };
      const italian = /pizza|pasta|italian/i.test(reply);
      return italian ? pass("Heurística: mencionó italiano") : fail("Sin recomendación italiana", reply.slice(0, 200), "PROMPT");
    },
  },
  {
    id: 8,
    name: "Anti-bucle menú sushi",
    leadId: 92008,
    messages: ["quiero cotizar sushi", "sushi", "barra de sushi"],
    async evaluate(run) {
      if (hasRepeatedBlocks(run.replies, 0.65)) {
        return fail("Repitió bloque de menú", run.replies.map((r) => r.slice(0, 80)).join(" | "), "PROMPT");
      }
      const third = run.replies[2] ?? "";
      if (/cuál te interesa|qué servicio te interesa/i.test(third) && /sushi/i.test(run.replies[0])) {
        return fail("Volvió a preguntar cuál servicio tras sushi repetido", third.slice(0, 200), "PROMPT");
      }
      return pass("Sin repetir menú; avanza en sushi");
    },
  },
  {
    id: 9,
    name: "Pedido/entrega sushi (no barra pp)",
    leadId: 92009,
    messages: ["Solo quiero 50 rollos de sushi y que me los dejen en mi casa, ¿cuánto?"],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      const modo = run.lastData?.extracted?.modo_servicio ?? "";
      const perPersonBar = /por persona|pp\b|chefs en sitio|montaje de barra/i.test(reply);
      if (perPersonBar && !/pedido|entrega|domicilio/i.test(reply)) {
        return fail("Cotizó como barra por persona", reply.slice(0, 200), "PROMPT");
      }
      const hasPriceOrHandoff = PRICE_RE.test(reply) || /nuestro equipo|alejandro|cotización exacta/i.test(reply);
      if (!hasPriceOrHandoff) {
        const judge = await llmJudge(
          "Trata como PEDIDO/ENTREGA a domicilio, no barra con chefs; da precio/rango o pasa a asesor con cifra.",
          run,
        );
        if (judge.pass === false) return { ...judge, observed: reply.slice(0, 200) };
      }
      return pass(`modo=${modo || "pedido/entrega"}, ${reply.slice(0, 120)}…`);
    },
  },
  {
    id: 10,
    name: "Precio taquiza con número",
    leadId: 92010,
    messages: ["¿Cuánto cuesta la taquiza?"],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      if (PRICE_RE.test(reply)) return pass(`Precio: ${reply.match(PRICE_RE)?.[0]}`);
      if (/depende del evento/i.test(reply) && !PRICE_RE.test(reply)) {
        return fail("Solo 'depende' sin cifra", reply.slice(0, 200), "PROMPT");
      }
      const judge = await llmJudge("Da cifra de referencia (ej. desde $300/pp), no solo 'depende' sin número.", run);
      if (judge.pass === true) return pass(judge.reason);
      return fail("Sin cifra de taquiza", reply.slice(0, 200), "PROMPT");
    },
  },
  {
    id: 11,
    name: "Número ambiguo «el 5»",
    leadId: 92011,
    messages: ["quiero cotizar un cumpleaños", "el 5"],
    async evaluate(run) {
      const inv = run.lastData?.extracted?.num_invitados;
      if (inv === 5) return fail("Guardó 5 como invitados", "num_invitados=5", "CODIGO");
      const reply = run.replies[1] ?? "";
      const clarifies = /invitados|fecha|día 5|5 de|aclara|te refieres/i.test(reply);
      if (!clarifies) return fail("No pidió aclaración", reply.slice(0, 200), "PROMPT");
      return pass("Pide aclaración invitados vs fecha");
    },
  },
  {
    id: 12,
    name: "No reiniciar tras cierre",
    leadId: 92012,
    messages: [
      "Hola, quiero banquete para mi boda",
      "Elena",
      "elena@test.com",
      "Boda",
      "Banquete y barra de bebidas",
      "100 personas",
      "CDMX, Polanco",
      "20 de agosto",
      "150 mil pesos",
      "gracias, mándalo a mi correo",
    ],
    async evaluate(run) {
      const last = run.replies.at(-1) ?? "";
      const all = run.replies.join(" ");
      if (/qué tienes pensado para tu evento/i.test(last)) {
        return fail("Reinició flujo tras cierre", last.slice(0, 200), "PROMPT");
      }
      if (MENU_DUMP_RE.test(last) || (last.length > 500 && /banquete.*taquiza/i.test(last))) {
        return fail("Reenvió catálogo tras cierre", last.slice(0, 200), "PROMPT");
      }
      const closed = run.turns.some((t) => /ya tengo todo|perfecto.*tengo/i.test(t.reply));
      if (!closed) {
        return fail("No llegó a cierre antes del gracias", `última: ${last.slice(0, 120)}`, "PROMPT");
      }
      const judge = await llmJudge(
        "Tras cierre, cliente dice gracias/mándalo a mi correo: responde en contexto de cierre (confirma/agradece), NO reinicia discovery ni catálogo.",
        run,
      );
      if (judge.pass === false) return { ...judge, observed: last.slice(0, 200) };
      return pass(closed ? "Cierre + respuesta post-gracias OK" : all.slice(0, 100));
    },
  },
  {
    id: 13,
    name: "Nombre completo Ana Pérez",
    leadId: 92013,
    messages: ["Me llamo Ana Pérez."],
    async evaluate(run) {
      const nombre = snapVal(run, "nombre del cliente") ?? run.lastData?.extracted?.nombre ?? run.lastData?.lead_updates?.name ?? "";
      if (!/ana\s+p[eé]rez/i.test(nombre)) {
        return fail("Nombre recortado", nombre || "(vacío)", "CODIGO");
      }
      return pass(`Nombre: ${nombre}`);
    },
  },
  {
    id: 14,
    name: "Precio a media captura",
    leadId: 92014,
    messages: ["quiero un banquete para mi boda", "¿cuánto cuesta el banquete?"],
    async evaluate(run) {
      const reply = run.replies[1] ?? "";
      if (!PRICE_RE.test(reply) && !/desde|precio|costo|\$/i.test(reply)) {
        return fail("No respondió precio del banquete", reply.slice(0, 200), "PROMPT");
      }
      const stillCaptures = /nombre|correo|invitados|fecha|zona|personas/i.test(reply);
      const judge = await llmJudge(
        "Responde precio del banquete Y sigue capturando datos; no ignora la pregunta de precio.",
        run,
      );
      if (judge.pass === false) return { ...judge, observed: reply.slice(0, 200) };
      return pass(`Precio + captura: ${reply.slice(0, 120)}…`);
    },
  },
  {
    id: 15,
    name: "Valet y flores — nunca «no tenemos»",
    leadId: 92015,
    messages: ["¿También manejan valet parking y flores?"],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      if (/no tenemos|no manejamos|no ofrecemos|no contamos con/i.test(reply)) {
        return fail("Rechazó servicio", reply.slice(0, 200), "PROMPT");
      }
      const coordinates = /coordin|inclu|podemos|nuestro equipo|alejandro|rodrigo|anot/i.test(reply);
      if (!coordinates) {
        const judge = await llmJudge("No rechaza; dice que lo coordinan/incluyen y lo anota para el asesor.", run);
        if (judge.pass === false) return { ...judge, observed: reply.slice(0, 200) };
      }
      return pass(reply.slice(0, 150));
    },
  },
  {
    id: 16,
    name: "Tres servicios juntos",
    leadId: 92016,
    messages: ["Quiero taquiza, barra de bebidas y DJ."],
    async evaluate(run) {
      const req = (snapVal(run, "requerimientos") ?? run.lastData?.extracted?.requerimientos_evento ?? run.replies.join(" ")).toLowerCase();
      const missing = [];
      if (!/taquiza/i.test(req)) missing.push("taquiza");
      if (!/barra|bebidas/i.test(req)) missing.push("barra");
      if (!/\bdj\b/i.test(req)) missing.push("dj");
      if (missing.length) return fail("No capturó los 3 servicios", `falta: ${missing.join(", ")} | ${req.slice(0, 120)}`, "CODIGO");
      return pass(`Requerimientos: ${req.slice(0, 120)}`);
    },
  },
  {
    id: 17,
    name: "Presentación correcta (Hola)",
    leadId: 92017,
    messages: ["Hola."],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      if (!/agente virtual de bodasesor/i.test(reply)) {
        return fail("No se presentó como agente virtual de Bodasesor", reply.slice(0, 200), "PROMPT");
      }
      if (/\bsoy una ia\b|\binteligencia artificial\b/i.test(reply) && !/agente virtual/i.test(reply)) {
        return fail('Dijo "IA" en lugar de agente virtual', reply.slice(0, 200), "PROMPT");
      }
      if (!/nombre|llamas/i.test(reply)) return fail("No pidió nombre", reply.slice(0, 200), "PROMPT");
      if (reply.length > 450 && /banquete.*taquiza.*dj/i.test(reply)) {
        return fail("Volcó catálogo en saludo", reply.slice(0, 200), "PROMPT");
      }
      return pass(reply.slice(0, 120));
    },
  },
  {
    id: 18,
    name: "Expo corporativa / stand café",
    leadId: 92018,
    messages: [
      "Necesito un stand de café para una expo, montaje domingo, evento martes y miércoles, desmontaje jueves, 200 personas por día, en Expo Santa Fe.",
    ],
    async evaluate(run) {
      const snap = JSON.stringify(run.snapshot).toLowerCase();
      const reply = run.replies[0] ?? "";
      const expo = /expo|corporativo|stand|café|coffee/i.test(reply + snap);
      const inv = /200/.test(snap + reply + JSON.stringify(run.lastData?.extracted ?? {}));
      const loc = /santa\s*fe|expo/i.test(snap + reply);
      const missing = [];
      if (!expo) missing.push("tipo expo");
      if (!inv) missing.push("200 personas");
      if (!loc) missing.push("ubicación");
      if (/boda|xv\s*años/i.test(reply) && !/expo|corporativo/i.test(reply)) {
        missing.push("forzó categoría boda");
      }
      if (missing.length) return fail("No entendió expo corporativa", missing.join(", "), "CODIGO");
      return pass("Expo + 200 + Santa Fe");
    },
  },
  {
    id: 19,
    name: "Saludo vago «buenas, información»",
    leadId: 92019,
    messages: ["buenas, información"],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      if (reply.length > 500 && /banquete.*taquiza/i.test(reply)) {
        return fail("Volcó catálogo", reply.slice(0, 200), "PROMPT");
      }
      if (!/lucy|bodasesor|agente virtual/i.test(reply)) {
        return fail("No se presentó", reply.slice(0, 200), "PROMPT");
      }
      const judge = await llmJudge("Saluda, se presenta una vez, pide nombre o de qué se trata; no vuelca catálogo ni asume datos.", run);
      if (judge.pass === false) return { ...judge, observed: reply.slice(0, 200) };
      return pass(reply.slice(0, 120));
    },
  },
  {
    id: 20,
    name: "Presupuesto «aún no sé» — sin bucle",
    leadId: 92020,
    messages: [
      "Hola, banquete para aniversario",
      "Mario",
      "mario@test.com",
      "Aniversario",
      "Banquete",
      "60 personas",
      "Narvarte CDMX",
      "Próximo mes",
      "aún no sé cuánto",
    ],
    async evaluate(run) {
      const presAsks = countFieldAsks(run.replies, /presupuesto|rango|inversión/i);
      const presLine = snapVal(run, "presupuesto") ?? "";
      const porDefinir = /por definir|sin definir|aún no|flexible|pendiente/i.test(presLine + run.replies.join(" "));
      if (presAsks >= 3) return fail(`Bucle presupuesto (${presAsks} preguntas)`, `asks=${presAsks}`, "CODIGO");
      if (!porDefinir && presAsks >= 2) {
        return fail("Insistió en presupuesto sin registrar por definir", presLine, "PROMPT");
      }
      const progressed = run.replies.length >= 8;
      if (!progressed) return fail("No completó flujo", `${run.replies.length} turnos`, "PROMPT");
      return pass(`Presupuesto flexible, ${presAsks} pregunta(s), flujo avanzó`);
    },
  },
];

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const list = TEST_FILTER ? SCENARIOS.filter((s) => TEST_FILTER.has(s.id)) : SCENARIOS;
  console.log(`\nLucy — Batería de ${list.length} pruebas en vivo`);
  console.log(`Base: ${BASE}`);
  console.log(`Juez LLM: ${USE_JUDGE ? JUDGE_MODEL : "desactivado"}`);
  console.log("=".repeat(72));

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
  console.log(
    `Servidor: ${health.status ?? "?"} · prompt ${health.lucy_prompt ?? "?"} · ${health.built_at_display ?? "?"}\n`,
  );

  const results = [];
  for (const sc of list) {
    process.stdout.write(`Test ${String(sc.id).padStart(2, "0")} — ${sc.name}… `);
    try {
      const r = await runScenario(sc);
      results.push(r);
      console.log(r.pass ? "PASA" : "FALLA");
    } catch (e) {
      console.log("ERROR");
      results.push({
        id: sc.id,
        name: sc.name,
        pass: false,
        observed: e.message,
        reason: e.message,
        failureType: "CODIGO",
        run: { turns: [] },
      });
    }
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${"=".repeat(72)}`);
  console.log(`RESULTADO GLOBAL: ${passed}/${results.length} PASA\n`);

  console.log("| Test | Resultado | Qué se observó | Motivo | Tipo |");
  console.log("|------|-----------|----------------|--------|------|");
  for (const r of results) {
    const obs = (r.observed ?? "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 80);
    const reason = (r.reason ?? "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 80);
    console.log(
      `| ${r.id} | ${r.pass ? "PASA" : "FALLA"} | ${obs} | ${reason} | ${r.failureType ?? "-"} |`,
    );
  }

  const reportPath = process.env.LUCY_TEST_REPORT ?? "lucy-20-tests-report.json";
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        base: BASE,
        at: new Date().toISOString(),
        passed,
        total: results.length,
        results: results.map((r) => ({
          id: r.id,
          name: r.name,
          pass: r.pass,
          observed: r.observed,
          reason: r.reason,
          failureType: r.failureType,
          transcript: r.run?.turns?.map((t) => ({ user: t.user, reply: t.reply })),
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nReporte JSON: ${reportPath}`);

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
