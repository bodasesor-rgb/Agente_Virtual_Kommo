#!/usr/bin/env node
/**
 * Despliega Lucy en Hostinger vía API (Node.js build from archive).
 *
 * Requiere:
 *   HOSTINGER_API_TOKEN  — hPanel → Perfil → API
 *   HOSTINGER_DOMAIN     — opcional, default: midnightblue-mosquito-424375.hostingersite.com
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://developers.hostinger.com";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOMAIN = process.env.HOSTINGER_DOMAIN?.trim() || "midnightblue-mosquito-424375.hostingersite.com";
const TOKEN = process.env.HOSTINGER_API_TOKEN?.trim() || process.env.API_TOKEN?.trim();

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
    json = { raw: text };
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
  const archiveBuffer = readFileSync(archivePath);
  const form = new FormData();
  form.append("archive", new Blob([archiveBuffer]), "lucy-deploy.zip");
  form.append("build_script", "echo ok");
  form.append("entry_file", "start.mjs");
  form.append("output_directory", ".");
  form.append("package_manager", "npm");
  form.append("node_version", "22");

  const res = await fetch(
    `${API_BASE}/api/hosting/v1/accounts/${encodeURIComponent(username)}/websites/${encodeURIComponent(DOMAIN)}/nodejs/builds/from-archive`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
    }
  );
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Upload failed ${res.status}: ${JSON.stringify(json)}`);
  }
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
    if (state === "failed") throw new Error("Build falló en Hostinger");
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error("Timeout esperando build en Hostinger");
}

async function main() {
  console.log(`[deploy] Dominio: ${DOMAIN}`);
  const username = await resolveUsername();
  console.log(`[deploy] Cuenta: ${username}`);

  const archive = await createArchive();
  console.log("[deploy] Subiendo a Hostinger...");
  const result = await uploadBuild(username, archive);
  const buildUuid = result?.data?.uuid ?? result?.uuid;
  console.log("[deploy] Build iniciado:", buildUuid ?? result);

  if (buildUuid) {
    await pollBuild(username, buildUuid);
  }

  console.log("[deploy] Listo. Verifica: https://" + DOMAIN + "/api/health");
}

main().catch((err) => {
  console.error("[deploy] Error:", err.message || err);
  process.exit(1);
});
