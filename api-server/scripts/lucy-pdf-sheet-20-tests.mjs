#!/usr/bin/env node
/**
 * 20 pruebas: inclusiones PDF + precio Sheet + bugs conocidos.
 *
 *   node scripts/lucy-pdf-sheet-20-tests.mjs [baseUrl]
 */
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = (process.argv[2] || "https://midnightblue-mosquito-424375.hostingersite.com").replace(
  /\/$/,
  ""
);
const DELAY = Number(process.env.LUCY_TEST_DELAY_MS ?? 850);

async function reset(leadId) {
  await fetch(`${BASE}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });
}

async function send(leadId, text, prev = null) {
  const res = await fetch(`${BASE}/api/kommo/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      lead_id: leadId,
      lead: {
        id: leadId,
        name: prev?.lead_updates?.name || "Ana Prueba",
        pipeline_id: "pipeline_bodasesor",
        stage_id: "stage_datos_intereses",
        contact_phone: "+5215500000999",
        contact_email: prev?.lead_updates?.contact_email ?? "",
        custom_fields: { ...(prev?.fields ?? {}) },
      },
    }),
  });
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runCase(id, messages) {
  const leadId = `pdf20-${id}-${Date.now()}`;
  await reset(leadId);
  await sleep(300);
  let prev = null;
  let last = "";
  for (const msg of messages) {
    prev = await send(leadId, msg, prev);
    last = prev?.reply || "";
    await sleep(DELAY);
  }
  return last;
}

function count(re, text) {
  return (text.match(re) || []).length;
}

const tests = [
  {
    id: 1,
    name: "CB5 inclusiones desde PDF (no solo link)",
    messages: ["qué incluye el Coffee Break 5?"],
    check: (t) =>
      /Según el catálogo|Coffee Break 5/i.test(t) &&
      /Sandwich|Chapata|Croissant|Bebidas incluidas/i.test(t) &&
      !/manejamos estos niveles/i.test(t) &&
      count(/¿Te late este nivel/g, t) <= 1,
  },
  {
    id: 2,
    name: "CB5 precio: Sheet gana (no $350 PDF si Sheet difiere)",
    messages: ["cuánto cuesta el Coffee Break 5?"],
    check: (t) => {
      const hasSheet = /\$\s*400/.test(t) || /400\.00/.test(t);
      const pdfOnly350 = /\$\s*350/.test(t) && !/\$\s*400/.test(t);
      // Debe citar precio de lista (Sheet) o listar niveles con $400 en CB5
      return (
        (hasSheet || /Coffee Break 5/i.test(t)) &&
        !pdfOnly350 &&
        !/¿Te late este nivel/i.test(t) // no debe ser bloque de inclusiones
      );
    },
  },
  {
    id: 3,
    name: "Banquete Formal 3 tiempos Tradicional inclusiones PDF",
    messages: ["qué incluye el Banquete Formal 3 tiempos Tradicional?"],
    check: (t) =>
      /Tradicional/i.test(t) &&
      /Meseros|Vajilla|Tiffany|cristaler/i.test(t) &&
      /\$\s*830/.test(t) &&
      !/bet[uú]n|cupcakes?/i.test(t) &&
      count(/¿Te late este nivel/g, t) <= 1,
  },
  {
    id: 4,
    name: "Banquete precio Sheet Tradicional $830",
    messages: ["precio Banquete Formal 3 tiempos Tradicional"],
    check: (t) => /\$\s*830/.test(t) && /Tradicional/i.test(t) && !/bet[uú]n/i.test(t),
  },
  {
    id: 5,
    name: "No mashup lista niveles + PDF CB1 en inclusiones CB5",
    messages: ["qué incluye Coffee Break 5"],
    check: (t) =>
      /Coffee Break 5/i.test(t) &&
      !/manejamos estos niveles[\s\S]*Coffee Break 1 — Lo Esencial/i.test(t),
  },
  {
    id: 6,
    name: "Banquete no cae en Betún/Cupcakes",
    messages: ["Hola, quiero banquete para mi boda", "qué incluye cada nivel?"],
    check: (t) => !/bet[uú]n|cupcakes?/i.test(t) && (/banquete|tradicional|premium|incluye|catálogo/i.test(t)),
  },
  {
    id: 7,
    name: "Oferta coffee break con detalle real",
    messages: ["Me interesa coffee break para junta corporativa", "qué opciones manejan?"],
    check: (t) =>
      /coffee/i.test(t) &&
      (/\$\s*\d|incluye|nivel|Break|catálogo/i.test(t)) &&
      !/DATOS DEL CLIENTE/i.test(t),
  },
  {
    id: 8,
    name: "Taquiza inclusiones o detalle",
    messages: ["qué incluye la taquiza?"],
    check: (t) =>
      /taquiza/i.test(t) &&
      (/Según el catálogo|incluye|nivel|\$\s*\d|catálogo/i.test(t)) &&
      !/solo te mando el link/i.test(t),
  },
  {
    id: 9,
    name: "Barra de bebidas detalle",
    messages: ["qué incluye la barra de bebidas básica?"],
    check: (t) =>
      /barra|bebida/i.test(t) &&
      (/Según el catálogo|incluye|\$\s*\d|nivel|catálogo/i.test(t)) &&
      !/bet[uú]n/i.test(t),
  },
  {
    id: 10,
    name: "Pista de baile: info sin inventar de más",
    messages: ["qué incluye la pista de baile?"],
    check: (t) =>
      /pista/i.test(t) &&
      (/\$\s*\d|m²|metro|catálogo|Según el catálogo|medida/i.test(t)) &&
      !/DATOS DEL CLIENTE/i.test(t),
  },
  {
    id: 11,
    name: "Sin duplicar bloque ¿Te late?",
    messages: ["qué incluye Banquete Formal 3 tiempos Premium?"],
    check: (t) => count(/¿Te late este nivel/g, t) <= 1 && !/bet[uú]n/i.test(t),
  },
  {
    id: 12,
    name: "CB4: PDF si existe; si no, Sheet (nunca CB1 disfrazado)",
    messages: ["qué incluye el Coffee Break 4?"],
    check: (t) => {
      const wrongCb1 =
        /Coffee Break 1 — Lo Esencial/i.test(t) && !/Coffee Break 4/i.test(t);
      const ok =
        /Coffee Break 4/i.test(t) ||
        (/\$\s*350|350\.00/i.test(t) && /coffee|break|incluye|nivel/i.test(t));
      return ok && !wrongCb1;
    },
  },
  {
    id: 13,
    name: "Precio CB4 desde Sheet (no PDF CB1)",
    messages: ["cuánto cuesta el Coffee Break 4?"],
    check: (t) =>
      (/\$\s*350|350\.00|Coffee Break 4/i.test(t) || /manejamos|precio|\$\s*\d/i.test(t)) &&
      !(/Según el catálogo[\s\S]*Coffee Break 1 — Lo Esencial/i.test(t) && !/Coffee Break 4/i.test(t)),
  },
  {
    id: 14,
    name: "Sushi oferta/detalle",
    messages: ["tienen barra de sushi? qué incluye?"],
    check: (t) =>
      /sushi/i.test(t) &&
      (/incluye|\$\s*\d|nivel|catálogo|Según/i.test(t)) &&
      !/no lo tenemos/i.test(t),
  },
  {
    id: 15,
    name: "Inclusiones no solo link web",
    messages: ["qué incluye el banquete formal tradicional?"],
    check: (t) => {
      const onlyLink =
        /bodasesor\.com\/catalogos/i.test(t) &&
        !/Meseros|Vajilla|incluye|Tradicional \$\s*\d|Según el catálogo/i.test(t);
      return !onlyLink && /banquete|tradicional|incluye|Según|Meseros|\$\s*\d/i.test(t);
    },
  },
  {
    id: 16,
    name: "Banquete Básico inclusiones",
    messages: ["qué incluye Banquete Formal 3 tiempos Básico?"],
    check: (t) =>
      (/[Bb][aá]sic|Basico/i.test(t) || /Según el catálogo/i.test(t)) &&
      !/bet[uú]n|cupcakes?/i.test(t) &&
      count(/¿Te late este nivel/g, t) <= 1,
  },
  {
    id: 17,
    name: "Oferta corporativa con servicios reales",
    messages: ["Hola, evento corporativo 80 personas, qué me recomiendas?"],
    check: (t) =>
      (/coffee|banquete|coffee break|barra|catering|servicio/i.test(t) || /recomiend|opci[oó]n|podemos/i.test(t)) &&
      !/DATOS DEL CLIENTE|Información completa obtenida/i.test(t),
  },
  {
    id: 18,
    name: "Pozole / servicio PDF si existe",
    messages: ["qué incluye la pozolada?"],
    check: (t) =>
      /pozole|pozolada/i.test(t) &&
      (/Según el catálogo|incluye|\$\s*\d|catálogo|nivel/i.test(t)) &&
      !/no lo tenemos/i.test(t),
  },
  {
    id: 19,
    name: "No inventar precios fuera de Sheet/PDF",
    messages: ["cuánto cuesta el DJ?"],
    check: (t) =>
      !/\$\s*(9|8|7)\d{3}(?!\d)/.test(t) || /equipo|cotiz|confirma|catálogo|sin precio|medida/i.test(t),
  },
  {
    id: 20,
    name: "CB5 inclusión con precio Sheet reconciliado",
    messages: ["qué incluye Coffee Break 5 gourmet?"],
    check: (t) => {
      const hasDetail = /Sandwich|Chapata|Croissant|Bebidas incluidas|Gourmet/i.test(t);
      const noNivelList = !/manejamos estos niveles/i.test(t);
      // Si menciona $, preferir Sheet ($400) sobre PDF ($350) cuando ambos podrían aparecer
      const sheetOk = !/\$\s*350/.test(t) || /\$\s*400/.test(t);
      return hasDetail && noNivelList && sheetOk && count(/¿Te late este nivel/g, t) <= 1;
    },
  },
];

async function main() {
  const health = await (await fetch(`${BASE}/api/health`)).json();
  console.log(
    `Servidor: ${health.status} · prompt ${health.lucy_prompt} · cache ${health.lucy_info_cache?.docs ?? "?"} · ${health.built_at_display}\n`
  );

  const results = [];
  for (const t of tests) {
    process.stdout.write(`#${t.id} ${t.name} ... `);
    let reply = "";
    let ok = false;
    let err = null;
    try {
      reply = await runCase(t.id, t.messages);
      ok = !!t.check(reply);
    } catch (e) {
      err = e?.message || String(e);
    }
    console.log(ok ? "PASS" : "FAIL");
    if (!ok) {
      console.log("--- reply ---\n" + (reply || err || "(vacío)").slice(0, 700) + "\n");
    }
    results.push({ id: t.id, name: t.name, ok, reply: reply.slice(0, 1500), err });
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\nSUMMARY ${passed}/${results.length} PASS · ${failed} FAIL`);

  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  const out = "/opt/cursor/artifacts/lucy-pdf-sheet-20-tests.json";
  writeFileSync(
    out,
    JSON.stringify(
      { base: BASE, health: { lucy_prompt: health.lucy_prompt, cache: health.lucy_info_cache }, passed, failed, results },
      null,
      2
    )
  );
  console.log(`Reporte: ${out}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
