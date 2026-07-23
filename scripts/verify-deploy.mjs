#!/usr/bin/env node
/**
 * Verifica que Hostinger desplegó el commit esperado y Lucy responde.
 *
 * Uso:
 *   node scripts/verify-deploy.mjs
 *   EXPECTED_COMMIT=abc123 LUCY_PUBLIC_URL=https://... node scripts/verify-deploy.mjs
 *
 * Nota: el bundle en `deploy/build-meta.json` suele llevar el SHA del commit
 * que regeneró el bundle (a menudo el padre del merge/push). Hostinger sirve
 * ese SHA embebido — se acepta tanto GITHUB_SHA como el de build-meta.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE =
  process.env.LUCY_PUBLIC_URL?.trim() ||
  "https://midnightblue-mosquito-424375.hostingersite.com";
const URL = `${BASE.replace(/\/$/, "")}/api/health`;
const EXPECTED_COMMIT = (
  process.env.EXPECTED_COMMIT ||
  process.env.GITHUB_SHA ||
  ""
).trim();
const MAX_ATTEMPTS = Number(process.env.VERIFY_ATTEMPTS ?? 36);
const INTERVAL_MS = Number(process.env.VERIFY_INTERVAL_MS ?? 10_000);
/** Si es 1/true: cualquier /api/health OK cuenta (recuperación 503; el SHA puede ir atrasado). */
const ACCEPT_ANY_OK = /^(1|true|yes)$/i.test(process.env.VERIFY_ACCEPT_ANY_OK ?? "");

function shortSha(sha) {
  return (sha || "").trim().slice(0, 7);
}

function loadAcceptedCommits() {
  const set = new Set();
  if (EXPECTED_COMMIT) set.add(shortSha(EXPECTED_COMMIT));
  const metaPath = path.join(ROOT, "deploy/build-meta.json");
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      if (meta.git_commit) set.add(shortSha(meta.git_commit));
      if (meta.git_commit_short) set.add(shortSha(meta.git_commit_short));
    } catch {
      /* ignore */
    }
  }
  return [...set].filter(Boolean);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHealth() {
  const res = await fetch(URL, { signal: AbortSignal.timeout(45_000) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { http: res.status, error: "not_json", preview: text.slice(0, 200) };
  }
  return { http: res.status, data };
}

async function main() {
  const accepted = loadAcceptedCommits();
  console.log(`[verify] URL: ${URL}`);
  if (accepted.length) {
    console.log(`[verify] Commits aceptados: ${accepted.join(", ")}`);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await fetchHealth();
      if (result.http === 200 && result.data?.status === "ok") {
        const h = result.data;
        console.log(`[verify] OK — prompt ${h.lucy_prompt} · ${h.built_at_display ?? h.built_at}`);
        if (h.git_commit_short) console.log(`[verify] Commit en servidor: ${h.git_commit_short}`);

        if (accepted.length && !ACCEPT_ANY_OK) {
          const got = shortSha(h.git_commit || h.git_commit_short || "");
          if (got && !accepted.includes(got)) {
            console.log(
              `[verify] Intento ${attempt}/${MAX_ATTEMPTS} — commit en servidor (${got}) ≠ aceptados (${accepted.join("|")}); esperando redeploy…`,
            );
            if (attempt < MAX_ATTEMPTS) {
              await sleep(INTERVAL_MS);
              continue;
            }
            console.error(
              `[verify] ERROR: commit en servidor (${got}) ≠ aceptados (${accepted.join("|")})`,
            );
            console.error("[verify] Hostinger aún no aplicó el último push — redeploy manual en hPanel.");
            process.exit(1);
          }
        } else if (accepted.length && ACCEPT_ANY_OK) {
          const got = shortSha(h.git_commit || h.git_commit_short || "");
          if (got && !accepted.includes(got)) {
            console.log(
              `[verify] AVISO: commit en servidor (${got}) ≠ aceptados (${accepted.join("|")}) — OK por VERIFY_ACCEPT_ANY_OK`,
            );
          }
        }

        console.log("[verify] Deploy verificado correctamente.");
        return;
      }

      console.log(
        `[verify] Intento ${attempt}/${MAX_ATTEMPTS} — HTTP ${result.http} ${result.error ?? result.data?.status ?? ""}`,
      );
    } catch (err) {
      console.log(
        `[verify] Intento ${attempt}/${MAX_ATTEMPTS} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (attempt < MAX_ATTEMPTS) await sleep(INTERVAL_MS);
  }

  console.error(`[verify] FALLO: Lucy no respondió OK tras ${MAX_ATTEMPTS} intentos (~${Math.round((MAX_ATTEMPTS * INTERVAL_MS) / 60000)} min).`);
  console.error("[verify] Revisa hPanel → Node.js → Registros. Causas: 503, OPEN_AI faltante, o deploy no ejecutado.");
  process.exit(1);
}

main();
