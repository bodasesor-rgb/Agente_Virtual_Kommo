#!/usr/bin/env node
/**
 * Despliega / recupera Lucy en Hostinger vía API (Node.js).
 *
 * Requiere:
 *   HOSTINGER_API_TOKEN  — hPanel → Perfil → API
 *   HOSTINGER_DOMAIN     — opcional, default: midnightblue-mosquito-424375.hostingersite.com
 *
 * Modos:
 *   node scripts/deploy-hostinger.mjs              — zip + upload + poll build (+ restart al final)
 *   node scripts/deploy-hostinger.mjs --restart     — solo reinicia el proceso Node (recupera 503)
 *   node scripts/deploy-hostinger.mjs --restart-only — alias de --restart
 *
 * Nota: el upload multipart desde GitHub Actions suele chocar con Cloudflare (HTTP 403).
 * En ese caso se hace restart automático para levantar el proceso (p. ej. tras git auto-deploy).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://developers.hostinger.com";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOMAIN = process.env.HOSTINGER_DOMAIN?.trim() || "midnightblue-mosquito-424375.hostingersite.com";
const TOKEN = process.env.HOSTINGER_API_TOKEN?.trim() || process.env.API_TOKEN?.trim();
const ARGS = new Set(process.argv.slice(2));
const RESTART_ONLY = ARGS.has("--restart") || ARGS.has("--restart-only");

if (!TOKEN) {
  console.error("[deploy] Falta HOSTINGER_API_TOKEN (hPanel → Perfil → API)");
  process.exit(1);
}

async function api(pathname, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
      ...headers,
    },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text?.slice(0, 500) };
  }
  if (!res.ok) {
    throw new Error(`API ${method} ${pathname} → ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function resolveUsername() {
  const data = await api(`/api/hosting/v1/websites?domain=${encodeURIComponent(DOMAIN)}`);
  const site = data?.data?.[0];
  if (!site?.username) {
    throw new Error(`No se encontró sitio para dominio ${DOMAIN}`);
  }
  return site.username;
}

async function restartNode(username) {
  const pathname =
    `/api/hosting/v1/accounts/${encodeURIComponent(username)}` +
    `/websites/${encodeURIComponent(DOMAIN)}/nodejs/server/restart`;
  console.log("[deploy] Reiniciando Node.js en Hostinger…");
  const result = await api(pathname, { method: "POST" });
  console.log("[deploy] Restart OK:", JSON.stringify(result).slice(0, 400));
  return result;
}

function isCloudflareBlock(errMsg) {
  const s = String(errMsg || "");
  return (
    s.includes("Just a moment") ||
    s.includes("challenges.cloudflare.com") ||
    /Upload failed HTTP 403/.test(s)
  );
}

async function createArchive() {
  const outDir = path.join(ROOT, ".deploy-tmp");
  const archive = path.join(outDir, "lucy-deploy.zip");
  const deployBundle = path.join(ROOT, "deploy/index.mjs");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  if (!existsSync(deployBundle)) {
    console.log("[deploy] deploy/index.mjs no existe — ejecutando npm run build...");
    execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  } else {
    console.log("[deploy] Usando bundle precompilado en deploy/ (sin rebuild en CI).");
  }

  console.log("[deploy] Creando archivo zip...");
  execSync(
    `zip -r "${archive}" . ` +
      `-x "node_modules/*" ` +
      `-x ".git/*" ` +
      `-x "api-server/dist/*" ` +
      `-x "api-server/data/*" ` +
      `-x ".deploy-tmp/*" ` +
      `-x "app/*" ` +
      `-x "whatsapp-sender/*" ` +
      `-x "lib/*" ` +
      `-x "data/*" ` +
      `-x "*.map"`,
    { cwd: ROOT, stdio: "inherit" }
  );

  return archive;
}

async function uploadBuild(username, archivePath) {
  const url =
    `${API_BASE}/api/hosting/v1/accounts/${encodeURIComponent(username)}` +
    `/websites/${encodeURIComponent(DOMAIN)}/nodejs/builds/from-archive`;

  const cmd = [
    "curl -sS",
    `-w "\\nHTTP:%{http_code}"`,
    `-X POST "${url}"`,
    `-H "Authorization: Bearer ${TOKEN}"`,
    `-H "Accept: application/json"`,
    `-F "archive=@${archivePath};type=application/zip"`,
    `-F "build_script=echo ok"`,
    `-F "entry_file=start.mjs"`,
    `-F "output_directory=."`,
    `-F "package_manager=npm"`,
    `-F "node_version=22"`,
    `-F "app_type=express"`,
  ].join(" ");

  console.log("[deploy] Subiendo a Hostinger (multipart)...");
  const raw = execSync(cmd, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const httpMatch = raw.match(/HTTP:(\d+)\s*$/);
  const httpCode = httpMatch ? Number(httpMatch[1]) : 0;
  const body = raw.replace(/\nHTTP:\d+\s*$/, "").trim();

  if (httpCode < 200 || httpCode >= 300) {
    throw new Error(`Upload failed HTTP ${httpCode}: ${body.slice(0, 1500)}`);
  }

  let json;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    throw new Error(`Respuesta inválida de Hostinger: ${body.slice(0, 500)}`);
  }
  console.log("[deploy] Respuesta API:", JSON.stringify(json).slice(0, 500));
  return json;
}

async function pollBuild(username, buildUuid) {
  for (let i = 0; i < 60; i++) {
    const data = await api(
      `/api/hosting/v1/accounts/${encodeURIComponent(username)}/websites/${encodeURIComponent(DOMAIN)}/nodejs/builds?per_page=5`
    );
    const build = data?.data?.find((b) => b.uuid === buildUuid) ?? data?.data?.[0];
    const state = build?.state ?? "unknown";
    console.log(`[deploy] Build ${buildUuid?.slice(0, 8) ?? "?"}… estado: ${state}`);
    if (state === "completed") return build;
    if (state === "failed") {
      try {
        const logs = await api(
          `/api/hosting/v1/accounts/${encodeURIComponent(username)}/websites/${encodeURIComponent(DOMAIN)}/nodejs/builds/${buildUuid}/logs`
        );
        console.error("[deploy] Logs:", JSON.stringify(logs).slice(0, 2000));
      } catch {
        /* optional */
      }
      throw new Error("Build falló en Hostinger");
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error("Timeout esperando build en Hostinger");
}

async function main() {
  console.log(`[deploy] Dominio: ${DOMAIN}`);
  const username = await resolveUsername();
  console.log(`[deploy] Cuenta: ${username}`);

  if (RESTART_ONLY) {
    await restartNode(username);
    console.log("[deploy] Restart listo. Verifica: https://" + DOMAIN + "/api/health");
    return;
  }

  let uploaded = false;
  try {
    const archive = await createArchive();
    const result = await uploadBuild(username, archive);
    const buildUuid = result?.data?.uuid ?? result?.uuid;
    console.log("[deploy] Build iniciado:", buildUuid ?? result);
    if (buildUuid) {
      await pollBuild(username, buildUuid);
    }
    uploaded = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isCloudflareBlock(msg)) {
      console.warn("[deploy] Upload bloqueado por Cloudflare (esperado desde GitHub Actions).");
      console.warn("[deploy] Continuando con restart — Hostinger debe tener el código vía Git auto-deploy.");
    } else {
      console.warn("[deploy] Upload/build falló:", msg.slice(0, 500));
      console.warn("[deploy] Intentando restart de recuperación…");
    }
  }

  // Siempre reiniciar: recupera 503 y aplica código ya presente tras git pull.
  try {
    await restartNode(username);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[deploy] Restart falló:", msg);
    if (!uploaded) process.exit(1);
    throw err;
  }

  console.log("[deploy] Listo. Verifica: https://" + DOMAIN + "/api/health");
}

main().catch((err) => {
  console.error("[deploy] Error:", err.message || err);
  process.exit(1);
});
