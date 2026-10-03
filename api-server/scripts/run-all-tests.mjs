#!/usr/bin/env node
/**
 * Todas las pruebas de Lucy: selftest de conversación + cada *-smoke.ts.
 * Lo usan el deploy (bloquea si falla), el agente de reparaciones de Cursor y los humanos.
 *
 *   cd api-server && node scripts/run-all-tests.mjs
 *
 * Con TESTS_BASE_REF=<sha> también falla si se borró alguna prueba respecto a ese commit:
 * un arreglo no puede «pasar» quitando la prueba de algo que ya funcionaba.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

const hasTsx = spawnSync(isWin ? "tsx.cmd" : "tsx", ["--version"], { shell: isWin, encoding: "utf8" }).status === 0;
const [cmd, ...baseArgs] = hasTsx ? [isWin ? "tsx.cmd" : "tsx"] : [isWin ? "npx.cmd" : "npx", "--yes", "tsx"];

function run(file) {
  const started = Date.now();
  const r = spawnSync(cmd, [...baseArgs, file], {
    cwd: root,
    encoding: "utf8",
    shell: isWin,
    env: { ...process.env, NODE_ENV: "test" },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  return { ok: r.status === 0, ms: Date.now() - started, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const failures = [];

const deletedCheck = process.env.TESTS_BASE_REF?.trim();
if (deletedCheck && !/^0+$/.test(deletedCheck)) {
  const diff = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=D", deletedCheck, "HEAD", "--", "src/selftest"],
    { cwd: root, encoding: "utf8" }
  );
  if (diff.status === 0) {
    const deleted = diff.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
    if (deleted.length) {
      failures.push({ name: "pruebas borradas", out: deleted.join("\n") });
      console.log(`FAIL se borraron pruebas existentes:\n  ${deleted.join("\n  ")}`);
    }
  } else {
    console.log(`(no pude comparar contra ${deletedCheck}: ${diff.stderr.trim()})`);
  }
}

const selftest = run("./src/selftest/lucy-flow-selftest.ts");
const summary = selftest.out.match(/\d+ OK, \d+ fallidas de \d+ escenarios/)?.[0] ?? "sin resumen";
console.log(`${selftest.ok ? "ok  " : "FAIL"} lucy-flow-selftest (${summary})`);
if (!selftest.ok) failures.push({ name: "lucy-flow-selftest", out: selftest.out });

const smokes = [
  ...readdirSync(join(root, "src/selftest"))
    .filter((f) => f.endsWith("-smoke.ts"))
    .map((f) => `./src/selftest/${f}`),
  ...(existsSync(join(root, "scripts"))
    ? readdirSync(join(root, "scripts"))
        .filter((f) => /^_smoke-.*\.mjs$/.test(f))
        .map((f) => `./scripts/${f}`)
    : []),
].sort();

for (const file of smokes) {
  const r = run(file);
  console.log(`${r.ok ? "ok  " : "FAIL"} ${file} (${(r.ms / 1000).toFixed(1)}s)`);
  if (!r.ok) failures.push({ name: file, out: r.out });
}

console.log(`\n${smokes.length + 1 - failures.filter((f) => f.name !== "pruebas borradas").length}/${smokes.length + 1} pruebas OK`);
if (failures.length) {
  for (const f of failures) {
    console.log(`\n──── ${f.name} ────\n${f.out.split("\n").slice(-30).join("\n")}`);
  }
  console.log(`\nFALLARON ${failures.length}: ${failures.map((f) => f.name).join(", ")}`);
  process.exit(1);
}
console.log("TODOS OK");
