/**
 * 10 pruebas detalladas por rama de flujo Lucy.
 * Uso: node ./scripts/probe-10-ramas.mjs
 */
import { buildSync } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = "/tmp/lucy-probe-10-ramas.mjs";

buildSync({
  entryPoints: [path.join(root, "scripts/probe-10-ramas-entry.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "error",
  // Keep embudo/db out: entry must not import DB-backed modules.
});

const mod = await import(outfile + "?t=" + Date.now());
const report = await mod.runTenBranchProbes();

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "lucy-10-ramas-report.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("\n========== 10 RAMAS DE FLUJO ==========");
console.log(JSON.stringify(report.summary, null, 2));
for (const r of report.results) {
  console.log(`\n${r.ok ? "✅ OK" : "❌ FAIL"}  ${r.name}`);
  if (!r.ok) console.log("   ERROR:", r.error);
  for (const note of r.notes || []) console.log("   ·", note);
}
console.log("\nReporte JSON:", outPath);
if (report.summary.failed > 0) process.exit(1);
