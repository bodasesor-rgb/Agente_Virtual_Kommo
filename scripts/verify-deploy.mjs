#!/usr/bin/env node
/**
 * Verifica que Hostinger desplegó el commit esperado y Lucy responde.
 *
 * Uso:
 *   node scripts/verify-deploy.mjs
 *   EXPECTED_COMMIT=abc123 LUCY_PUBLIC_URL=https://... node scripts/verify-deploy.mjs
 */
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
  console.log(`[verify] URL: ${URL}`);
  if (EXPECTED_COMMIT) {
    console.log(`[verify] Commit esperado: ${EXPECTED_COMMIT.slice(0, 7)}…`);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await fetchHealth();
      if (result.http === 200 && result.data?.status === "ok") {
        const h = result.data;
        console.log(`[verify] OK — prompt ${h.lucy_prompt} · ${h.built_at_display ?? h.built_at}`);
        if (h.git_commit_short) console.log(`[verify] Commit en servidor: ${h.git_commit_short}`);

        if (EXPECTED_COMMIT && h.git_commit && !h.git_commit.startsWith(EXPECTED_COMMIT.slice(0, 7))) {
          const got = h.git_commit.slice(0, 7);
          const want = EXPECTED_COMMIT.slice(0, 7);
          if (got !== want) {
            console.log(
              `[verify] Intento ${attempt}/${MAX_ATTEMPTS} — commit en servidor (${got}) ≠ esperado (${want}); esperando redeploy…`,
            );
            if (attempt < MAX_ATTEMPTS) {
              await sleep(INTERVAL_MS);
              continue;
            }
            console.error(`[verify] ERROR: commit en servidor (${got}) ≠ esperado (${want})`);
            console.error("[verify] Hostinger aún no aplicó el último push — redeploy manual en hPanel.");
            process.exit(1);
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
