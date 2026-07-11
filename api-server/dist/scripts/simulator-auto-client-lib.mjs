/**
 * Clientes automáticos para el simulador Lucy: perfiles LLM + juez QA.
 */

export const DEFAULT_BASE =
  process.env.LUCY_SIM_BASE?.replace(/\/$/, "") ||
  "https://midnightblue-mosquito-424375.hostingersite.com";

export const CLIENT_MODEL = process.env.LUCY_CLIENT_MODEL ?? "gpt-4o-mini";
export const JUDGE_MODEL = process.env.LUCY_JUDGE_MODEL ?? "gpt-4o-mini";
export const DELAY_MS = Number(process.env.LUCY_TEST_DELAY_MS ?? 900);
export const MAX_TURNS = Number(process.env.LUCY_AUTO_MAX_TURNS ?? 15);

const ROBOT_MARKERS = /DATOS DEL CLIENTE|Información completa obtenida|paso \d|campo obligatorio/i;
const LUCY_CLOSE_RE =
  /ya tengo todo|tengo toda la información|nuestro equipo te contact|te contactará|cotización exacta|alejandro|rodrigo/i;
const CLIENT_BYE_RE = /gracias|adiós|hasta luego|bye|nos vemos|eso es todo|perfecto gracias/i;

// ─── Perfiles ───────────────────────────────────────────────────────────────

export const AUTO_CLIENTS = [
  {
    id: 1,
    slug: "sofia",
    name: "Sofía",
    leadId: 93001,
    phone: "+5215519300101",
    scenario: "Quiere cotizar una boda.",
    style:
      'Contesta cortísimo: "sí", "aja", "una boda", "en marzo". Nunca das varios datos juntos; hay que sacártelos de a uno. A veces una sola palabra ambigua.',
    behavior:
      "Responde solo lo mínimo a cada pregunta, sin elaborar. No inventes datos que Lucy no preguntó.",
    observe:
      "Lucy avanza dato por dato con paciencia, sin repetir ni frustrarse, sin inventar lo que Sofía no dijo.",
    hiddenFacts: {
      nombre: "Sofía",
      correo: "sofia.m@gmail.com",
      tipo_evento: "boda",
      requerimientos: "banquete y barra de bebidas",
      invitados: "120",
      lugar: "Jardín Santa Fe, CDMX",
      fecha: "marzo, sábado por la tarde",
      presupuesto: "no sé aún",
    },
    opening: "hola quiero cotizar",
  },
  {
    id: 2,
    slug: "ricardo",
    name: "Ricardo",
    leadId: 93002,
    phone: "+5215519300202",
    scenario: "Evento corporativo de fin de año.",
    style:
      "Primer mensaje larguísimo con TODOS los datos: nombre, correo, tipo, fecha, lugar, invitados, servicios, presupuesto.",
    behavior:
      'Si Lucy vuelve a preguntar algo que ya dijiste, te molestas un poco: "ya te lo dije", "te acabo de decir".',
    observe:
      "Lucy captura TODO del primer mensaje y NO vuelve a preguntar nada ya dado; pasa directo al cierre.",
    hiddenFacts: {
      nombre: "Ricardo Méndez",
      correo: "ricardo.mendez@techcorp.mx",
      tipo_evento: "evento corporativo fin de año",
      requerimientos: "taquiza, barra de bebidas y DJ",
      invitados: "80",
      lugar: "Oficinas TechCorp, Polanco CDMX",
      fecha: "15 de diciembre, 7pm",
      presupuesto: "120 mil pesos",
    },
    opening:
      "Hola, soy Ricardo Méndez de TechCorp, ricardo.mendez@techcorp.mx. Necesito cotizar un evento corporativo de fin de año para 80 personas el 15 de diciembre a las 7pm en nuestras oficinas en Polanco CDMX. Quiero taquiza, barra de bebidas y DJ. Presupuesto aproximado 120 mil pesos.",
  },
  {
    id: 3,
    slug: "mariana",
    name: "Mariana",
    leadId: 93003,
    phone: "+5215519300303",
    scenario: "Cumpleaños de 50 personas.",
    style:
      'Solo te importa cuánto cuesta. Preguntas precio en casi cada mensaje: "¿pero cuánto sale?", "primero dime el precio".',
    behavior:
      "Te resistes a dar datos hasta tener cifras. Presionas por números pero eventualmente das un dato si Lucy insiste.",
    observe:
      "Lucy da cifras o rangos (no esquiva con solo 'depende del evento'), maneja la presión y aun así captura lo necesario.",
    hiddenFacts: {
      nombre: "Mariana",
      correo: "mariana.luna@hotmail.com",
      tipo_evento: "cumpleaños",
      requerimientos: "taquiza",
      invitados: "50",
      lugar: "Coyoacán",
      fecha: "próximo sábado",
      presupuesto: "lo más barato posible",
    },
    opening: "cuánto cuesta una taquiza?",
  },
  {
    id: 4,
    slug: "don-beto",
    name: "Don Beto",
    leadId: 93004,
    phone: "+5215519300404",
    scenario: 'Quiere "hacer una fiesta" pero está indeciso.',
    style: "Confundido, pides recomendaciones, no sabes ni el tipo de evento ni el menú.",
    behavior: '"no sé, ¿tú qué me recomiendas?", "¿qué se me vería bien?".',
    observe:
      "Lucy guía con preguntas y opciones según la ocasión, sin volcar el catálogo entero ni abrumar.",
    hiddenFacts: {
      nombre: "Roberto García",
      correo: "beto.garcia@gmail.com",
      tipo_evento: "fiesta familiar",
      requerimientos: "aún no decide — acepta sugerencia de taquiza o banquete",
      invitados: "35",
      lugar: "azotea en Narvarte",
      fecha: "en un mes, sábado",
      presupuesto: "flexible, unos 40 mil",
    },
    opening: "buenas, quiero hacer una fiesta pero la verdad no sé por dónde empezar",
  },
  {
    id: 5,
    slug: "valeria",
    name: "Valeria",
    leadId: 93005,
    phone: "+5215519300505",
    scenario: "Fiesta temática de los años 80 / rockera.",
    style: "Hablas del TEMA y la vibra, nunca mencionas qué comida quieres.",
    behavior: '"es una fiesta ochentera bien retro", esperas que Lucy proponga comida que encaje.',
    observe:
      "Lucy deduce opciones de comida que encajen o pregunta con inteligencia, sin trabarse ni decir que no entiende.",
    hiddenFacts: {
      nombre: "Valeria",
      correo: "valeria.rock@outlook.com",
      tipo_evento: "fiesta temática años 80",
      requerimientos: "comida que vaya con ambiente retro/rock (acepta pizzas, hamburguesas, finger food)",
      invitados: "45",
      lugar: "salón en Condesa",
      fecha: "14 de agosto, noche",
      presupuesto: "60 mil",
    },
    opening: "hola! es una fiesta ochentera bien retro, tipo rock de los 80, necesito catering",
  },
  {
    id: 6,
    slug: "lic-gomez",
    name: "Lic. Gómez",
    leadId: 93006,
    phone: "+5215519300606",
    scenario:
      "Stand de café para una expo; requiere factura; montaje, evento y desmontaje en fechas distintas.",
    style: 'Formal, usas "usted", mencionas correo de empresa y pides factura.',
    behavior:
      "Das requerimientos técnicos: medidas del stand 3x2m, horarios por día (montaje domingo, evento martes y miércoles, desmontaje jueves).",
    observe:
      "Lucy te trata como CLIENTE (no proveedor), captura fechas múltiples y requisitos, maneja factura sin confundirse.",
    hiddenFacts: {
      nombre: "Lic. Fernando Gómez",
      correo: "fgomez@expoindustrial.mx",
      empresa: "Expo Industrial SA",
      tipo_evento: "expo corporativa / stand de café",
      requerimientos: "stand de café, coffee break, montaje y desmontaje",
      invitados: "200 por día",
      lugar: "Expo Santa Fe, CDMX",
      fecha: "montaje domingo, evento martes y miércoles 8am-6pm, desmontaje jueves",
      presupuesto: "requiero factura, presupuesto por definir",
    },
    opening:
      "Buenos días. Soy el Lic. Fernando Gómez de Expo Industrial, fgomez@expoindustrial.mx. Requiero cotizar un stand de café para expo con factura.",
  },
  {
    id: 7,
    slug: "karen",
    name: "Karen",
    leadId: 93007,
    phone: "+5215519300707",
    scenario: "Fiesta, aún decidiendo el menú.",
    style: "Te contradices. Empiezas con taquiza, luego mejor sushi, luego no banquete.",
    behavior: "Cambias el servicio 2-3 veces durante la charla.",
    observe:
      "Lucy actualiza al ÚLTIMO servicio elegido sin repetir el menú ni entrar en loop.",
    hiddenFacts: {
      nombre: "Karen",
      correo: "karen.party@gmail.com",
      tipo_evento: "fiesta",
      requerimientos: "banquete (última elección tras cambiar de taquiza y sushi)",
      invitados: "70",
      lugar: "San Ángel",
      fecha: "20 de septiembre",
      presupuesto: "80 mil",
    },
    opening: "hola quiero una fiesta con taquiza",
  },
  {
    id: 8,
    slug: "emilio",
    name: "Emilio",
    leadId: 93008,
    phone: "+5215519300808",
    scenario: "Dice querer info pero en realidad testea a Lucy.",
    style: 'Escéptico y algo sarcástico. "¿eres un robot?", "¿eres real?", preguntas fuera de lugar.',
    behavior: "Intentas descarrilar la conversación con preguntas trampa, pero eventualmente cooperas si Lucy reencauza.",
    observe:
      "Lucy responde con naturalidad (agente virtual), no se rompe ni entra en loops, y reencauza hacia el evento.",
    hiddenFacts: {
      nombre: "Emilio",
      correo: "emilio.test@gmail.com",
      tipo_evento: "aniversario de bodas",
      requerimientos: "banquete",
      invitados: "40",
      lugar: "CDMX",
      fecha: "próximo mes",
      presupuesto: "50 mil",
    },
    opening: "hola, ¿eres un robot o una persona real?",
  },
  {
    id: 9,
    slug: "paty",
    name: "Paty",
    leadId: 93009,
    phone: "+5215519300909",
    scenario: "Solo quiere 30 cupcakes entregados en su casa.",
    style: "Directa, quieres un producto para llevar, no un servicio montado.",
    behavior: '"nada más los cupcakes, que me los dejen", preguntas el costo.',
    observe:
      "Lucy distingue PEDIDO/ENTREGA de servicio por persona (no cotiza pp ni chefs), da precio o pasa a asesor con cifra.",
    hiddenFacts: {
      nombre: "Paty Morales",
      correo: "paty.morales@gmail.com",
      tipo_evento: "pedido a domicilio",
      requerimientos: "30 cupcakes de vainilla con betún, entrega a domicilio",
      invitados: "30 unidades (no personas en evento)",
      lugar: "entrega en mi casa, Del Valle CDMX",
      fecha: "este viernes por la tarde",
      presupuesto: "lo más económico",
    },
    opening: "hola, solo quiero 30 cupcakes que me los dejen en mi casa, ¿cuánto sale?",
  },
  {
    id: 10,
    slug: "jorge",
    name: "Jorge",
    leadId: 93010,
    phone: "+5215519301010",
    scenario: "Boda, pero se va por las ramas.",
    style:
      "Platicador, cuentas anécdotas y sueltas preguntas sueltas no relacionadas (playa, DJ, montaje).",
    behavior: "Mezclas datos útiles con desvíos; cambias de tema seguido.",
    observe:
      "Lucy responde tus preguntas sin perder el hilo de la calificación, no ignora ni se abruma, mantiene el flujo.",
    hiddenFacts: {
      nombre: "Jorge Ramírez",
      correo: "jorge.ramirez@mail.com",
      tipo_evento: "boda",
      requerimientos: "banquete, barra de bebidas, DJ",
      invitados: "150",
      lugar: "hacienda en Cuernavaca",
      fecha: "10 de noviembre",
      presupuesto: "200 mil",
    },
    opening: "qué onda! ando viendo lo de mi boda, oye ¿hacen bodas en la playa?",
  },
];

export function getClientById(id) {
  const n = Number(id);
  return AUTO_CLIENTS.find((c) => c.id === n || c.leadId === n || c.slug === id);
}

// ─── Simulator API ──────────────────────────────────────────────────────────

const leadState = new Map();

export async function resetSimulator(base, leadId) {
  leadState.delete(leadId);
  await fetch(`${base}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });
}

export async function sendToLucy(base, leadId, text, client) {
  const prev = leadState.get(leadId);
  const custom_fields = { ...(prev?.fields ?? {}) };
  const res = await fetch(`${base}/api/kommo/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      lead_id: leadId,
      lead: {
        id: leadId,
        name: prev?.lead_updates?.name || client.name,
        pipeline_id: "pipeline_bodasesor",
        stage_id: prev?.stage_id || "stage_datos_intereses",
        contact_phone: client.phone,
        contact_email: prev?.lead_updates?.contact_email ?? "",
        custom_fields,
        tags: ["whatsapp_business", "auto_client"],
        responsible: "Bodasesor",
      },
    }),
  });
  const data = await res.json();
  if (data.status === "success") leadState.set(leadId, data);
  return data;
}

export function clearLeadState(leadId) {
  leadState.delete(leadId);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function openAiKey() {
  return process.env.OPEN_AI?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
}

async function chatCompletion({ model, messages, temperature = 0.7, json = false }) {
  const key = openAiKey();
  if (!key) throw new Error("Falta OPEN_AI u OPENAI_API_KEY para el cliente/juez LLM");
  const body = { model, temperature, messages };
  if (json) body.response_format = { type: "json_object" };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// ─── LLM Cliente ────────────────────────────────────────────────────────────

function buildClientSystemPrompt(client) {
  return `Eres ${client.name}, un CLIENTE real de WhatsApp hablando con Lucy de Bodasesor (catering/eventos).

ESCENARIO: ${client.scenario}
ESTILO: ${client.style}
COMPORTAMIENTO: ${client.behavior}

REGLAS:
- Escribe en español mexicano, mensajes CORTOS (1-3 oraciones máx), SIN emojis.
- NO eres Lucy ni un asistente; eres el cliente.
- Responde SOLO al último mensaje de Lucy según tu perfil.
- Revela datos de tu perfil de forma natural cuando Lucy pregunte o cuando encaje con tu estilo.
- No inventes servicios que Bodasesor no ofrezca; si Lucy propone algo, reacciona según tu personaje.
- Si Lucy ya cerró (dice que tiene todo / equipo te contactará) o ya diste todo, despídete brevemente.
- Si llevas muchos turnos y ya cooperaste, puedes cerrar con "gracias, eso es todo".

DATOS QUE PUEDES REVELAR (no todos de golpe salvo que tu estilo lo indique):
${JSON.stringify(client.hiddenFacts, null, 2)}`;
}

async function generateClientMessage(client, turns, lucyReply) {
  const history = turns.flatMap((t) => [
    { role: "assistant", content: t.reply },
    { role: "user", content: t.user },
  ]);
  if (lucyReply) history.push({ role: "assistant", content: lucyReply });

  const opening = client.opening;
  const isFirst = turns.length === 0;

  const messages = [
    { role: "system", content: buildClientSystemPrompt(client) },
    ...history,
    {
      role: "user",
      content: isFirst
        ? `Lucy aún no ha respondido. Escribe tu PRIMER mensaje como cliente. Sugerencia de apertura: "${opening}" (puedes adaptarla a tu estilo).`
        : `Último mensaje de Lucy:\n"${lucyReply}"\n\nEscribe tu respuesta como ${client.name}.`,
    },
  ];

  const text = await chatCompletion({ model: CLIENT_MODEL, messages, temperature: 0.85 });
  return text.replace(/^["']|["']$/g, "").trim();
}

function shouldStop(turns, lastData) {
  if (turns.length >= MAX_TURNS) return "max_turns";
  const lastUser = turns.at(-1)?.user ?? "";
  const lastReply = turns.at(-1)?.reply ?? "";
  if (CLIENT_BYE_RE.test(lastUser) && turns.length >= 3) return "client_bye";
  if (LUCY_CLOSE_RE.test(lastReply) && turns.length >= 4) {
    if (CLIENT_BYE_RE.test(lastUser)) return "closed";
    if (turns.length >= 6) return "lucy_closed";
  }
  if (lastData?.all_fields_filled && turns.length >= 5) return "fields_filled";
  return null;
}

// ─── Heurísticas globales ───────────────────────────────────────────────────

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

export function hasRepeatedBlocks(replies, threshold = 0.72) {
  for (let i = 0; i < replies.length; i++) {
    for (let j = i + 1; j < replies.length; j++) {
      if (blockSimilarity(replies[i], replies[j]) >= threshold) return true;
    }
  }
  return false;
}

export function checkGlobalRules(run) {
  const issues = [];
  const replies = run.replies ?? [];
  if (hasRepeatedBlocks(replies)) issues.push("Repite bloque de texto muy similar");
  if (replies.some((r) => ROBOT_MARKERS.test(r))) issues.push("Texto robot/CRM al cliente");
  if (replies.join(" ").match(/Quiere:\s*Quiere:/i)) issues.push("Duplicación Quiere:");
  return issues;
}

function transcriptText(turns) {
  return turns.map((t) => `Cliente: ${t.user}\nLucy: ${t.reply}`).join("\n\n");
}

function parseSnapshot(snapshot = "") {
  const map = {};
  for (const line of String(snapshot).split("\n")) {
    const m = line.match(/^-?\s*(.+?):\s*(.+)$/);
    if (m) map[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return map;
}

// ─── Juez LLM ───────────────────────────────────────────────────────────────

export async function judgeConversation(client, run, useJudge = true) {
  const globals = checkGlobalRules(run);
  const crmSnapshot = run.lastData?.fields?.cf_crm_snapshot ?? "";
  const extracted = run.lastData?.extracted ?? {};

  const criterion = `Evalúa cómo respondió Lucy ante el cliente "${client.name}".

PERFIL DEL CLIENTE:
- Escenario: ${client.scenario}
- Estilo: ${client.style}
- Qué observar: ${client.observe}

CRITERIOS GLOBALES (todas las conversaciones):
- No repetir el mismo bloque de texto
- Responder la pregunta del cliente ANTES de seguir con otras cosas
- No volver a pedir datos ya dados por el cliente
- Mensajes cortos sin emojis
- No inventar precios fuera del catálogo
- Avanzar el flujo hacia cotización/cierre
- No rechazar servicios con "no tenemos" / "no manejamos"

EVALÚA:
1. ¿Lucy repitió mensajes?
2. ¿Ignoró alguna pregunta directa del cliente?
3. ¿Capturó bien los datos en CRM? (snapshot y extracted)
4. ¿Dio precios o rangos cuando el cliente los pidió?
5. ¿Avanzó el flujo o se trabó/en loop?
6. ¿Algún dato mal guardado o inventado?

Responde pass=true solo si Lucy cumple razonablemente para ESTE perfil de cliente.
failure_type: "PROMPT" si es comportamiento/redacción de Lucy; "CODIGO" si es estado CRM, extracción o lógica dura.

Problemas heurísticos detectados: ${globals.length ? globals.join("; ") : "ninguno"}`;

  if (!useJudge || !openAiKey()) {
    const pass = globals.length === 0 && !run.lastError;
    return {
      pass,
      reason: pass ? "Heurística OK (sin juez LLM)" : globals.join("; ") || run.lastError || "Sin juez",
      failureType: pass ? null : "CODIGO",
      globals,
      summary: { good: [], bad: globals },
    };
  }

  try {
    const raw = await chatCompletion({
      model: JUDGE_MODEL,
      temperature: 0,
      json: true,
      messages: [
        {
          role: "system",
          content:
            'Eres evaluador QA de Lucy (bot Bodasesor). Responde SOLO JSON: {"pass":boolean,"reason":string,"failure_type":"PROMPT"|"CODIGO"|null,"summary":{"good":string[],"bad":string[]}}',
        },
        {
          role: "user",
          content: `${criterion}\n\nTranscripción:\n${transcriptText(run.turns)}\n\nEstado CRM:\n${crmSnapshot}\n\nExtracted JSON:\n${JSON.stringify(extracted, null, 2)}\n\nÚltima respuesta Lucy:\n${run.turns.at(-1)?.reply ?? ""}`,
        },
      ],
    });
    const parsed = JSON.parse(raw);
    let pass = !!parsed.pass;
    let reason = parsed.reason ?? "";
    let failureType = parsed.failure_type ?? (pass ? null : "PROMPT");

    if (globals.length && pass) {
      pass = false;
      reason = `${reason} | ${globals.join("; ")}`;
      failureType = "CODIGO";
    }
    if (run.lastError) {
      pass = false;
      reason = `Error pipeline: ${run.lastError}`;
      failureType = "CODIGO";
    }

    return {
      pass,
      reason,
      failureType,
      globals,
      summary: parsed.summary ?? { good: [], bad: [] },
    };
  } catch (err) {
    const pass = globals.length === 0 && !run.lastError;
    return {
      pass,
      reason: `Juez falló (${err.message}); heurística: ${globals.join("; ") || "OK"}`,
      failureType: pass ? null : "CODIGO",
      globals,
      summary: { good: [], bad: globals },
    };
  }
}

// ─── Corrida completa ───────────────────────────────────────────────────────

export async function runAutoClient(base, client, options = {}) {
  const { useJudge = true, onTurn = null, delayMs = DELAY_MS } = options;

  clearLeadState(client.leadId);
  await resetSimulator(base, client.leadId);

  const turns = [];
  let lastData = null;
  let lastError = null;
  let lucyReply = "";

  for (let i = 0; i < MAX_TURNS; i++) {
    let userText;
    try {
      userText = await generateClientMessage(client, turns, lucyReply);
    } catch (err) {
      lastError = `Cliente LLM: ${err.message}`;
      break;
    }
    if (!userText) {
      lastError = "Cliente LLM devolvió mensaje vacío";
      break;
    }

    const data = await sendToLucy(base, client.leadId, userText, client);
    lastData = data;

    if (data.status === "error" || data.error) {
      lastError = data.reply || data.error;
      turns.push({ user: userText, reply: `[ERROR] ${lastError}`, data });
      if (onTurn) onTurn({ turn: turns.length, user: userText, reply: turns.at(-1).reply, error: lastError });
      break;
    }

    lucyReply = data.reply || "";
    turns.push({ user: userText, reply: lucyReply, data });
    if (onTurn) onTurn({ turn: turns.length, user: userText, reply: lucyReply, data });

    const stop = shouldStop(turns, data);
    if (stop === "closed" || stop === "client_bye") break;
    if (stop === "lucy_closed" || stop === "fields_filled" || stop === "max_turns") {
      if (stop !== "max_turns" && i < MAX_TURNS - 1) {
        try {
          const bye = await generateClientMessage(client, turns, lucyReply);
          if (bye && CLIENT_BYE_RE.test(bye)) {
            const byeData = await sendToLucy(base, client.leadId, bye, client);
            lastData = byeData;
            turns.push({
              user: bye,
              reply: byeData.reply || "",
              data: byeData,
            });
            if (onTurn) onTurn({ turn: turns.length, user: bye, reply: byeData.reply || "" });
          }
        } catch {
          /* optional farewell */
        }
      }
      break;
    }

    await sleep(delayMs);
  }

  const run = {
    turns,
    replies: turns.map((t) => t.reply),
    lastData,
    lastError,
    snapshot: parseSnapshot(lastData?.fields?.cf_crm_snapshot ?? ""),
  };

  const verdict = await judgeConversation(client, run, useJudge);

  return {
    client: {
      id: client.id,
      slug: client.slug,
      name: client.name,
      leadId: client.leadId,
      scenario: client.scenario,
      observe: client.observe,
    },
    run,
    ...verdict,
    transcript: turns.map((t) => ({ user: t.user, reply: t.reply })),
  };
}

export async function runAllAutoClients(base, options = {}) {
  const filter = options.clientIds
    ? new Set(options.clientIds.map((x) => Number(x)))
    : null;
  const list = filter ? AUTO_CLIENTS.filter((c) => filter.has(c.id)) : AUTO_CLIENTS;
  const results = [];
  for (const client of list) {
    const r = await runAutoClient(base, client, options);
    results.push(r);
  }
  const passed = results.filter((r) => r.pass).length;
  return { base, at: new Date().toISOString(), passed, total: results.length, results };
}

export function formatReportTable(results) {
  const lines = ["| Cliente | Resultado | Motivo | Tipo |", "|---------|-----------|--------|------|"];
  for (const r of results) {
    const reason = (r.reason ?? "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 90);
    lines.push(
      `| ${r.client.name} | ${r.pass ? "PASA" : "FALLA"} | ${reason} | ${r.failureType ?? "-"} |`,
    );
  }
  return lines.join("\n");
}
