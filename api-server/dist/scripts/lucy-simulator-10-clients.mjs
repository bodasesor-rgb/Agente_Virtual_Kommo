#!/usr/bin/env node
/**
 * 10 clientes automáticos contra el simulador Lucy.
 *
 * Uso:
 *   node scripts/lucy-simulator-10-clients.mjs [baseUrl]
 *   node scripts/lucy-simulator-10-clients.mjs --client 1,3,9
 *   node scripts/lucy-simulator-10-clients.mjs --no-judge
 *
 * Requiere OPEN_AI u OPENAI_API_KEY (cliente LLM + juez).
 * El servidor destino también necesita OPEN_AI para que Lucy responda.
 */
import { writeFileSync } from "node:fs";
import {
  AUTO_CLIENTS,
  DEFAULT_BASE,
  formatReportTable,
  runAutoClient,
} from "./simulator-auto-client-lib.mjs";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const BASE = (args[0] || DEFAULT_BASE).replace(/\/$/, "");
const USE_JUDGE = !flags.has("--no-judge");

const CLIENT_FILTER = (() => {
  const f = process.argv.find((a) => a.startsWith("--client="));
  if (!f) return null;
  return f.replace("--client=", "").split(",").map((n) => Number(n.trim()));
})();

async function main() {
  const list = CLIENT_FILTER
    ? AUTO_CLIENTS.filter((c) => CLIENT_FILTER.includes(c.id))
    : AUTO_CLIENTS;

  console.log(`\nLucy — 10 clientes automáticos (simulador)`);
  console.log(`Base: ${BASE}`);
  console.log(`Clientes: ${list.map((c) => c.name).join(", ")}`);
  console.log(`Juez LLM: ${USE_JUDGE ? "activo" : "desactivado"}`);
  console.log("=".repeat(72));

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
  console.log(
    `Servidor: ${health.status ?? "?"} · prompt ${health.lucy_prompt ?? "?"} · ${health.built_at_display ?? "?"}\n`,
  );

  const results = [];
  for (const client of list) {
    process.stdout.write(`Cliente ${client.id} — ${client.name}… `);
    try {
      const r = await runAutoClient(BASE, client, { useJudge: USE_JUDGE });
      results.push(r);
      console.log(r.pass ? "PASA" : "FALLA");
    } catch (e) {
      console.log("ERROR");
      results.push({
        client: { id: client.id, name: client.name, leadId: client.leadId },
        pass: false,
        reason: e.message,
        failureType: "CODIGO",
        transcript: [],
        run: { turns: [] },
      });
    }
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${"=".repeat(72)}`);
  console.log(`RESULTADO GLOBAL: ${passed}/${results.length} PASA\n`);
  console.log(formatReportTable(results));

  for (const r of results) {
    console.log(`\n--- ${r.client.name} (${r.pass ? "PASA" : "FALLA"}) ---`);
    console.log(`Motivo: ${r.reason}`);
    if (r.summary?.good?.length) console.log(`Bien: ${r.summary.good.join("; ")}`);
    if (r.summary?.bad?.length) console.log(`Mal: ${r.summary.bad.join("; ")}`);
  }

  const reportPath = process.env.LUCY_SIM_REPORT ?? "lucy-simulator-10-clients-report.json";
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        base: BASE,
        at: new Date().toISOString(),
        passed,
        total: results.length,
        results: results.map((r) => ({
          client: r.client,
          pass: r.pass,
          reason: r.reason,
          failureType: r.failureType,
          globals: r.globals,
          summary: r.summary,
          transcript: r.transcript,
          crm_snapshot: r.run?.lastData?.fields?.cf_crm_snapshot,
          extracted: r.run?.lastData?.extracted,
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
