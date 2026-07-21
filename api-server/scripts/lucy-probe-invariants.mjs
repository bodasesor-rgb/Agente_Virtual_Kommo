#!/usr/bin/env node
/**
 * Prueba rápida de invariantes V8.28 + regresión A14938 (Ilana) en el simulador live.
 *
 *   node scripts/lucy-probe-invariants.mjs [baseUrl]
 */
const BASE = (process.argv[2] || "https://midnightblue-mosquito-424375.hostingersite.com").replace(
  /\/$/,
  ""
);
const DELAY = 1000;

async function reset(leadId) {
  await fetch(`${BASE}/api/kommo/simulator/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });
}

async function send(leadId, text, leadName = "", prev = null) {
  const custom_fields = { ...(prev?.fields ?? {}) };
  const res = await fetch(`${BASE}/api/kommo/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      lead_id: leadId,
      lead: {
        id: leadId,
        name: prev?.lead_updates?.name || leadName,
        pipeline_id: "pipeline_bodasesor",
        stage_id: "stage_datos_intereses",
        contact_phone: "+5215500000099",
        contact_email: prev?.lead_updates?.contact_email ?? "",
        custom_fields,
      },
    }),
  });
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function snap(data) {
  const map = {};
  for (const line of String(data?.fields?.cf_crm_snapshot ?? "").split("\n")) {
    const m = line.match(/^-?\s*(.+?):\s*(.+)$/);
    if (m) map[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return map;
}

function val(map, ...keys) {
  for (const k of keys) {
    const hit = Object.entries(map).find(([kk]) => kk.includes(k.toLowerCase()));
    if (hit) return hit[1];
  }
  return null;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function runScenario(name, leadId, messages, check) {
  process.stdout.write(`• ${name}… `);
  await reset(leadId);
  let prev = null;
  const turns = [];
  for (const m of messages) {
    const text = typeof m === "string" ? m : m.text;
    const leadName = typeof m === "object" ? m.leadName ?? "" : "";
    prev = await send(leadId, text, leadName || prev?.lead_updates?.name || "", prev);
    turns.push({ user: text, reply: prev.reply || "", data: prev });
    if (prev.status === "error" || prev.error) {
      console.log("FAIL");
      console.log(`  ERROR: ${prev.reply || prev.error}`);
      return { pass: false, name, reason: prev.reply || prev.error, turns };
    }
    await sleep(DELAY);
  }
  try {
    check({ turns, last: prev, snap: snap(prev), extracted: prev.extracted ?? {} });
    console.log("PASA");
    return { pass: true, name, turns };
  } catch (e) {
    console.log("FAIL");
    console.log(`  ${e.message}`);
    const lastReply = turns.at(-1)?.reply?.slice(0, 220);
    if (lastReply) console.log(`  Última Lucy: ${lastReply}`);
    console.log(`  Snapshot: ${JSON.stringify(snap(prev))}`);
    return { pass: false, name, reason: e.message, turns };
  }
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log(`\nProbe invariantes Lucy`);
  console.log(`Base: ${BASE}`);
  console.log(
    `Health: ${health.status} · ${health.lucy_prompt} · ${health.git_commit_short} · ${health.built_at_display}\n`
  );

  const results = [];

  results.push(
    await runScenario(
      "A14938 Ilana — ubicación ≠ nombre",
      99003801,
      [
        {
          text: "Quiero hacer una cotizacion de pizzas para un evento empresarial de 550 personas el 12 de dic",
          leadName: "Ilana Berman",
        },
        "en Tlalnepantla",
        "Ilana Berman",
        "Hacen las pizzas en el evento?",
        "iberman@eiqsa.com.mx",
      ],
      ({ snap: s, turns, extracted }) => {
        const nombre = val(s, "nombre") || extracted.nombre || "";
        const zona = val(s, "lugar", "dirección", "direccion") || extracted.direccion_evento || "";
        const pres = val(s, "presupuesto") || String(extracted.presupuesto ?? "");
        assert(
          !/tlalnepantla/i.test(nombre),
          `Nombre no debe ser ubicación: "${nombre}"`
        );
        assert(/ilana/i.test(nombre) || !nombre, `Nombre raro: "${nombre}"`);
        assert(/tlalnepantla/i.test(zona), `Zona no capturada: "${zona}"`);
        assert(
          !pres || /sin definir|econ|flexible|opciones/i.test(pres) || Number(pres) >= 1000 || Number(pres) === 0,
          `Presupuesto contaminado: "${pres}"`
        );
        const pizzaAsk = turns.find((t) => /hacen las pizzas/i.test(t.user));
        assert(pizzaAsk, "Falta turno de pregunta pizza");
        assert(
          /\b(s[ií]|monta|prepar|cocin|evento|momento)\b/i.test(pizzaAsk.reply),
          `No respondió pizza en evento: ${pizzaAsk.reply.slice(0, 180)}`
        );
        assert(
          !/\btaquiza/i.test(turns.map((t) => t.reply).join(" ")) ||
            /pizza/i.test(turns.map((t) => t.reply).join(" ")),
          "Inventó taquiza sin contexto de pizza"
        );
      }
    )
  );

  results.push(
    await runScenario(
      "Invariante — en Naucalpan no es nombre",
      99003802,
      [
        { text: "Hola, quiero cotizar banquete para 100 personas", leadName: "Ana López" },
        "en Naucalpan",
        "Ana López",
      ],
      ({ snap: s, extracted }) => {
        const nombre = val(s, "nombre") || extracted.nombre || "";
        const zona = val(s, "lugar", "dirección", "direccion") || extracted.direccion_evento || "";
        assert(!/naucalpan/i.test(nombre), `Nombre=ubicación: "${nombre}"`);
        assert(/naucalpan/i.test(zona), `Zona no capturada: "${zona}"`);
        assert(/ana/i.test(nombre), `No capturó Ana: "${nombre}"`);
      }
    )
  );

  results.push(
    await runScenario(
      "Invariante — pregunta de servicio no se ignora",
      99003803,
      [
        { text: "Hola, me interesa barra de sushi para 80 personas", leadName: "Pedro Ruiz" },
        "Pedro Ruiz",
        "pedro.ruiz@test.com",
        "Qué incluye la barra de sushi?",
      ],
      ({ turns }) => {
        const last = turns.at(-1);
        assert(
          /incluye|nivel|basica|tradicional|premium|roll|sushi|\$/i.test(last.reply),
          `Solo embudo, sin detalle: ${last.reply.slice(0, 200)}`
        );
      }
    )
  );

  const ok = results.filter((r) => r.pass).length;
  const fail = results.length - ok;
  console.log(`\n${"=".repeat(56)}`);
  console.log(`${ok} PASA · ${fail} FALLA de ${results.length}`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
