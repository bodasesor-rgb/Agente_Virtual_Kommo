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

const leadState = new Map();

async function reset(leadId) {
  leadState.delete(leadId);
  await fetch(`${BASE}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });
}

async function send(leadId, text, leadName = "") {
  const prev = leadState.get(leadId);
  const custom_fields = { ...(prev?.fields ?? {}) };
  const body = JSON.stringify({
    text,
    lead_id: leadId,
    lead: {
      id: leadId,
      name: prev?.lead_updates?.name || leadName || "",
      pipeline_id: "pipeline_bodasesor",
      stage_id: "stage_datos_intereses",
      contact_phone: `+52155${String(leadId).slice(-8).padStart(8, "0")}`,
      contact_email: prev?.lead_updates?.contact_email ?? "",
      custom_fields,
    },
  });
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/kommo/simulator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        lastErr = `HTTP ${res.status}: ${raw.slice(0, 120)}`;
        await sleep(1500 * attempt);
        continue;
      }
      if (data.status === "success") leadState.set(leadId, data);
      return data;
    } catch (e) {
      lastErr = e.message;
      await sleep(1500 * attempt);
    }
  }
  return { status: "error", error: lastErr || "send failed", reply: lastErr || "send failed" };
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

// ─── Escenarios (casos problemáticos reales V9.10–V9.13) ───────────────────

const SCENARIOS = [
  {
    id: 1,
    name: "Voz — intro Buen día + pide nombre (no formulario)",
    leadId: 93101,
    leadName: "",
    messages: ["Hola"],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      if (!/buen\s+d[ií]a/i.test(reply) || !/lucy/i.test(reply) || !/bodasesor/i.test(reply)) {
        return fail("Intro incorrecta (falta Buen día / Lucy / Bodasesor)", reply.slice(0, 220), "PROMPT");
      }
      if (!/nombre|llamas/i.test(reply)) return fail("No pidió nombre", reply.slice(0, 200), "PROMPT");
      if ((reply.match(/\?/g) ?? []).length > 2) {
        return fail("Demasiadas preguntas en saludo", reply.slice(0, 200), "PROMPT");
      }
      if (MENU_DUMP_RE.test(reply) || reply.length > 450) {
        return fail("Saludo tipo formulario/catálogo", reply.slice(0, 200), "PROMPT");
      }
      return pass(reply.slice(0, 140));
    },
  },
  {
    id: 2,
    name: "Memoria — boda+fecha: no repregunta tipo",
    leadId: 93102,
    leadName: "",
    messages: ["Hola", "Hola, soy Ana, es para mi boda el 20 de septiembre"],
    async evaluate(run) {
      const reply = run.replies[1] ?? "";
      if (!/mucho gusto,\s*ana/i.test(reply)) {
        return fail("Falta ¡Mucho gusto, Ana!", reply.slice(0, 220), "PROMPT");
      }
      if (/qu[eé]\s+tipo\s+de\s+(evento|celebraci)|qu[eé]\s+van\s+a\s+celebrar|qu[eé]\s+festejan/i.test(reply)) {
        return fail("Repreguntó tipo (ya dijo boda)", reply.slice(0, 220), "PROMPT");
      }
      return pass(reply.slice(0, 160));
    },
  },
  {
    id: 3,
    name: "Correo — rechazo amable sin insistir",
    leadId: 93103,
    leadName: "",
    // Embudo V9.13: correo va después de tipo/servicios/fecha/zona.
    messages: [
      "Hola",
      "Sandra",
      "Cumpleaños",
      "Banquete",
      "15 de agosto",
      "Narvarte CDMX",
      "Prefiero no dar mi correo por ahora",
    ],
    async evaluate(run) {
      const reply = run.replies.at(-1) ?? "";
      if (!/sin problema/i.test(reply) || !/(este chat|por aqu[ií])/i.test(reply)) {
        return fail("No aceptó rechazo de correo con calidez", reply.slice(0, 220), "PROMPT");
      }
      if (/necesito tu correo|es obligatorio|me compartes.*correo|a qu[eé] correo/i.test(reply)) {
        return fail("Insistió en correo", reply.slice(0, 220), "PROMPT");
      }
      return pass(reply.slice(0, 160));
    },
  },
  {
    id: 4,
    name: "Embudo — tras nombre NO pide correo de inmediato",
    leadId: 93104,
    leadName: "",
    messages: ["Hola", "Carlos Ruiz"],
    async evaluate(run) {
      const reply = run.replies[1] ?? "";
      if (!/mucho gusto,\s*carlos/i.test(reply)) {
        return fail("Falta Mucho gusto, Carlos", reply.slice(0, 200), "PROMPT");
      }
      if (/correo|e-?mail/i.test(reply) && reply.includes("?")) {
        return fail("Pidió correo justo tras el nombre", reply.slice(0, 220), "PROMPT");
      }
      if (!/celebr|evento|servicio|armar|festej/i.test(reply)) {
        return fail("No avanzó a tipo/servicios", reply.slice(0, 200), "PROMPT");
      }
      return pass(reply.slice(0, 160));
    },
  },
  {
    id: 5,
    name: "A15210 — desayuno mexicano ≠ Banquete Mexicano",
    leadId: 93105,
    leadName: "",
    messages: ["Hola, soy Hernán, quiero un desayuno temático mexicano para un evento corporativo"],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      const req = snapVal(run, "requerimientos") ?? run.lastData?.extracted?.requerimientos_evento ?? "";
      const blob = `${reply}\n${req}`;
      if (/banquete\s+mexicano/i.test(blob) && !/desayuno/i.test(blob)) {
        return fail("Lo trató como Banquete Mexicano", blob.slice(0, 220), "PROMPT");
      }
      if (!/desayuno/i.test(blob)) return fail("No reconoció desayuno", blob.slice(0, 220), "PROMPT");
      return pass(reply.slice(0, 160));
    },
  },
  {
    id: 6,
    name: "A15210 — 2026/patio no es presupuesto",
    leadId: 93106,
    leadName: "",
    messages: ["Hola", "Hernán", "Es corporativo", "Desayuno mexicano", "Sería en un patio, no en piso 15", "En 2026"],
    async evaluate(run) {
      const pres = snapVal(run, "presupuesto") ?? run.lastData?.extracted?.presupuesto ?? "";
      if (/2026/.test(String(pres)) || /^2026$/.test(String(pres).trim())) {
        return fail("Guardó 2026 como presupuesto", String(pres), "CODIGO");
      }
      return pass(`presupuesto=${pres || "(vacío)"}; última=${(run.replies.at(-1) ?? "").slice(0, 80)}`);
    },
  },
  {
    id: 7,
    name: "A15212 — Puestos Servicio completo ≠ taquiza $750",
    leadId: 93107,
    leadName: "",
    messages: [
      "Hola, me interesa cotizar: Puestos de Antojitos para Evento",
      "Sandra Carbajal",
      "carbajalsandra@hotmail.com",
      "Es una fiesta de 50 años",
      "2. Servicio completo",
    ],
    async evaluate(run) {
      const reply = run.replies.at(-1) ?? "";
      if (/\btaquiza\b/i.test(reply) && /\$\s*750|750\.00/i.test(reply)) {
        return fail("Mapeó nivel Puestos a taquiza $750", reply.slice(0, 240), "CODIGO");
      }
      const all = run.replies.join(" ");
      if (/puesto|antojito|servicio completo/i.test(all + reply)) return pass(reply.slice(0, 160));
      const judge = await llmJudge(
        "Cliente eligió '2. Servicio completo' del menú de Puestos. NO debe responder con taquiza $750.",
        run,
      );
      if (judge.pass === false) return { ...judge, observed: reply.slice(0, 200) };
      return pass(reply.slice(0, 160));
    },
  },
  {
    id: 8,
    name: "A15212 — 'al mismo que ya te he enviado' no repregunta correo",
    leadId: 93108,
    leadName: "",
    messages: ["Hola, soy Luis, quiero taquiza", "luis.prueba@mail.com", "Es una boda", "Taquiza", "al mismo que ya te he enviado"],
    async evaluate(run) {
      const last = run.replies.at(-1) ?? "";
      if (/a qu[eé] correo|me compartes.*correo|correo te mando/i.test(last) && last.includes("?")) {
        return fail("Repreguntó correo", last.slice(0, 220), "PROMPT");
      }
      return pass(last.slice(0, 140));
    },
  },
  {
    id: 9,
    name: "Comida vaga — formal vs casual",
    leadId: 93109,
    leadName: "",
    messages: ["Hola, busco comida para mi evento"],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      if (/banquete\s+premium|\$\s*\d{3}/i.test(reply) && !/formal|casual|prefieres/i.test(reply)) {
        return fail("Asumió banquete con precio sin preguntar modo", reply.slice(0, 220), "PROMPT");
      }
      if (!/formal|casual|banquete|estaci[oó]n|taquiza|puestos?|nombre|llamas|comida/i.test(reply)) {
        return fail("No orientó opciones de comida", reply.slice(0, 200), "PROMPT");
      }
      return pass(reply.slice(0, 160));
    },
  },
  {
    id: 10,
    name: "No inventar inclusiones (meseros mixología)",
    leadId: 93110,
    leadName: "",
    messages: ["Hola, soy Paty", "Boda", "Barra de mixología", "¿La barra de mixología incluye meseros?"],
    async evaluate(run) {
      const reply = run.replies.at(-1) ?? "";
      if (/s[ií],?\s+(incluye|traen|vienen)\s+meseros/i.test(reply) && !/confirm|equipo|cat[aá]logo/i.test(reply)) {
        return fail("Inventó inclusiones de meseros", reply.slice(0, 220), "PROMPT");
      }
      const safe = /confirm|equipo|cat[aá]logo|te digo|dato incorrecto|exacto|incluye/i.test(reply);
      if (!safe) {
        const judge = await llmJudge("No inventa meseros; confirma con equipo/catálogo o cita inclusiones reales.", run);
        if (judge.pass === false) return { ...judge, observed: reply.slice(0, 200) };
      }
      return pass(reply.slice(0, 160));
    },
  },
  {
    id: 11,
    name: "Cierre — nuestro equipo, nunca Rodrigo",
    leadId: 93111,
    leadName: "",
    messages: [
      "Hola, banquete para boda",
      "Elena Gómez",
      "Boda",
      "Banquete",
      "15 de octubre a las 8pm",
      "Polanco CDMX",
      "elena.gomez@test.com",
      "120 personas",
      "200 mil pesos",
    ],
    async evaluate(run) {
      const all = run.replies.join(" ");
      if (/\brodrigo\b/i.test(all)) {
        return fail("Mencionó Rodrigo al cliente", all.match(/[^.]*rodrigo[^.]*/i)?.[0] ?? "Rodrigo", "PROMPT");
      }
      if (!run.replies.some((r) => /ya tengo todo|nuestro equipo/i.test(r))) {
        return fail("No cerró / no pasó a nuestro equipo", run.replies.at(-1)?.slice(0, 180) ?? "", "PROMPT");
      }
      return pass("Cierre sin Rodrigo");
    },
  },
  {
    id: 12,
    name: "Cliente Alejandro — captura nombre",
    leadId: 93112,
    leadName: "",
    messages: ["Hola", "Alejandro"],
    async evaluate(run) {
      const reply = run.replies[1] ?? "";
      const nombre = snapVal(run, "nombre del cliente") ?? run.lastData?.extracted?.nombre ?? "";
      if (!/alejandro/i.test(nombre) && !/mucho gusto,\s*alejandro/i.test(reply)) {
        return fail("No capturó Alejandro", `nombre=${nombre} | ${reply.slice(0, 160)}`, "CODIGO");
      }
      if (/cu[aá]l es tu nombre|c[oó]mo te llamas/i.test(reply)) {
        return fail("Repreguntó nombre", reply.slice(0, 200), "PROMPT");
      }
      return pass(reply.slice(0, 140));
    },
  },
  {
    id: 13,
    name: "Ubicación — cobertura, no menú",
    leadId: 93113,
    leadName: "",
    messages: ["¿Dónde se ubican?"],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      if (!/cdmx|ciudad de m[eé]xico|rep[uú]blica|cobertura|trabajamos en/i.test(reply)) {
        return fail("Sin cobertura/ubicación", reply.slice(0, 200), "PROMPT");
      }
      if (MENU_DUMP_RE.test(reply)) return fail("Volcó menú", reply.slice(0, 200), "PROMPT");
      return pass(reply.slice(0, 150));
    },
  },
  {
    id: 14,
    name: "Italiano — pastas/pizzas, no taquiza",
    leadId: 93114,
    leadName: "",
    messages: ["Quiero menú italiano para fiesta temática, 40 personas"],
    async evaluate(run) {
      const reply = run.replies.join(" ");
      if (!/pasta|pizza|italian/i.test(reply)) return fail("No ofreció italiano", reply.slice(0, 200), "PROMPT");
      if (/\btaquiza\b/i.test(reply) && !/italian|pasta|pizza/i.test(reply)) {
        return fail("Ofreció taquiza", reply.slice(0, 200), "PROMPT");
      }
      return pass(reply.slice(0, 150));
    },
  },
  {
    id: 15,
    name: "Correo propio bodasesor — no guardar",
    leadId: 93115,
    leadName: "",
    messages: ["Mandé mi solicitud a bodasesor@gmail.com, ¿es el correo correcto?"],
    async evaluate(run) {
      const email =
        snapVal(run, "correo electrónico", "correo") ??
        run.lastData?.lead_updates?.contact_email ??
        run.lastData?.extracted?.correo ??
        "";
      if (OWN_EMAILS.test(email)) return fail("Guardó correo propio", email, "CODIGO");
      return pass(`No guardó propio; ${(run.replies[0] ?? "").slice(0, 100)}`);
    },
  },
  {
    id: 16,
    name: "Carpas — pide medidas",
    leadId: 93116,
    leadName: "",
    messages: ["Hola, soy María", "Cumpleaños", "¿Cuentan con carpas transparentes?"],
    async evaluate(run) {
      const reply = run.replies.at(-1) ?? "";
      if (!/s[ií]|contamos|manejamos|carpa/i.test(reply)) return fail("No afirmó carpas", reply.slice(0, 200), "PROMPT");
      if (!/medidas?/i.test(reply)) return fail("No pidió medidas", reply.slice(0, 200), "PROMPT");
      return pass(reply.slice(0, 160));
    },
  },
  {
    id: 17,
    name: "Brief rico — sin repregunta obvia",
    leadId: 93117,
    leadName: "",
    messages: [
      "Soy Ana Torres, boda para 150 en Coyoacán el 12 de diciembre, banquete y barra de bebidas, ana.torres@mail.com",
    ],
    async evaluate(run) {
      const reply = run.replies[0] ?? "";
      const missing = [];
      if (/qu[eé]\s+tipo de evento|qu[eé]\s+van a celebrar/i.test(reply)) missing.push("repregunta tipo");
      if (/a qu[eé] correo|me compartes.*correo/i.test(reply)) missing.push("repregunta correo");
      if (missing.length) return fail("Brief mal manejado", missing.join(", ") + " | " + reply.slice(0, 120), "PROMPT");
      return pass(reply.slice(0, 140));
    },
  },
  {
    id: 18,
    name: "Coffee break — reconoce (no proveedor)",
    leadId: 93118,
    leadName: "",
    messages: ["Hola, soy Laura de Grupo Bimbo, quiero cotizar un coffee break para una junta"],
    async evaluate(run) {
      const ex = run.lastData?.extracted ?? {};
      const all = run.replies.join(" ");
      if (ex.tipo_contacto === "proveedor") return fail("Etiquetado proveedor", "proveedor", "CODIGO");
      if (!/coffee\s*break/i.test(all + (ex.requerimientos_evento ?? ""))) {
        return fail("No reconoció coffee break", all.slice(0, 200), "PROMPT");
      }
      return pass(all.slice(0, 140));
    },
  },
  {
    id: 19,
    name: "Post-cierre gracias — no reinicia",
    leadId: 93119,
    leadName: "",
    messages: [
      "Hola, banquete boda",
      "Elena",
      "Boda",
      "Banquete",
      "20 de agosto",
      "Polanco CDMX",
      "elena@test.com",
      "100 personas",
      "150 mil",
      "gracias, mándalo a mi correo",
    ],
    async evaluate(run) {
      const last = run.replies.at(-1) ?? "";
      if (/qu[eé]\s+te gustar[ií]a armar|qu[eé]\s+tienen pensado|qu[eé]\s+servicios/i.test(last)) {
        return fail("Reinició discovery", last.slice(0, 200), "PROMPT");
      }
      if (!run.replies.some((r) => /ya tengo todo/i.test(r))) {
        return fail("No hubo cierre", last.slice(0, 160), "PROMPT");
      }
      return pass(last.slice(0, 140));
    },
  },
  {
    id: 20,
    name: "Presupuesto 'aún no sé' — sin bucle",
    leadId: 93120,
    leadName: "",
    messages: [
      "Hola, banquete aniversario",
      "Mario",
      "Aniversario",
      "Banquete",
      "Próximo mes",
      "Narvarte CDMX",
      "mario@test.com",
      "60 personas",
      "aún no sé cuánto",
    ],
    async evaluate(run) {
      const budgetAsks = countFieldAsks(run.replies, /presupuesto|rango de inversi/i);
      if (budgetAsks >= 3) return fail(`Bucle presupuesto (${budgetAsks})`, `asks=${budgetAsks}`, "CODIGO");
      const last = run.replies.at(-1) ?? "";
      if (/presupuesto|rango/i.test(last) && last.includes("?") && /a[uú]n no s[eé]/i.test(run.turns.at(-1)?.user ?? "")) {
        return fail("Repreguntó presupuesto tras 'aún no sé'", last.slice(0, 200), "PROMPT");
      }
      return pass(`asks=${budgetAsks}; ${last.slice(0, 100)}`);
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
