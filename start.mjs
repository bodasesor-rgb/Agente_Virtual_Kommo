#!/usr/bin/env node
/**
 * Arranque Hostinger desde la raíz del repo (directorio raíz fijo en ./).
 * Los binarios precompilados viven en deploy/.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const deployDir = join(root, "deploy");

const required = ["index.mjs", "postgres.data", "postgres.wasm"];
for (const file of required) {
  const path = join(deployDir, file);
  if (!existsSync(path)) {
    console.error(`[start] FALTA archivo requerido: deploy/${file}`);
    console.error(`[start] Ruta esperada: ${path}`);
    process.exit(1);
  }
}

// Sin NODE_ENV, pino arranca un worker con la ruta absoluta de la máquina que hizo el build → crash.
if (!process.env.NODE_ENV?.trim()) process.env.NODE_ENV = "production";

if (!process.env.OPENAI_API_KEY?.trim() && process.env.OPEN_AI?.trim()) {
  process.env.OPENAI_API_KEY = process.env.OPEN_AI.trim();
}

// Alias Gemini → GEMINI_API_KEY canónica (Hostinger usa gemini_ia en otros proyectos)
if (!process.env.GEMINI_API_KEY?.trim()) {
  const alt =
    process.env.gemini_ia?.trim() ||
    process.env.GEMINI_IA?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_KEY?.trim() ||
    "";
  if (alt) process.env.GEMINI_API_KEY = alt;
}

const hasGemini = !!(
  process.env.gemini_ia?.trim() ||
  process.env.GEMINI_IA?.trim() ||
  process.env.GEMINI_API_KEY?.trim() ||
  process.env.GOOGLE_API_KEY?.trim() ||
  process.env.GEMINI_KEY?.trim()
);
const hasOpenAi = !!(process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_AI?.trim());

if (!hasGemini && !hasOpenAi) {
  console.warn(
    "[start] AVISO: falta gemini_ia / GEMINI_API_KEY (o OPEN_AI de fallback) — Lucy no podrá responder"
  );
} else if (hasGemini) {
  // Pin fijo: Lucy ignora GEMINI_MODEL si apunta a Nano Banana / Imagen / Pro.
  console.log("[start] LLM: Gemini pin gemini-3.1-flash-lite (sin generateImages / Nano Banana)");
} else {
  console.log("[start] LLM: OpenAI (fallback — sin gemini_ia)");
}

console.log("[start] Archivos OK, arrancando Lucy desde deploy/...");

try {
  const { readFileSync, existsSync: exists, mkdirSync } = await import("node:fs");
  const { join: j } = await import("node:path");
  const metaPath = j(deployDir, "build-meta.json");
  if (exists(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    console.log(
      `[start] Build: prompt ${meta.lucy_prompt} · ${meta.built_at_display ?? meta.built_at}` +
        (meta.git_commit_short ? ` · commit ${meta.git_commit_short}` : ""),
    );
  }
  // Hostinger reemplaza hbuilds/versions/<id>/nodejs en cada deploy; <dominio>/persistent sobrevive.
  const hbuildsMatch = root.match(/^(.*)[\\/]hbuilds[\\/]versions[\\/][^\\/]+[\\/]nodejs$/);
  const domainDir = hbuildsMatch?.[1] ?? null;
  const dataDirFromEnv = !!process.env.LUCY_DATA_DIR?.trim();
  const preferred =
    process.env.LUCY_DATA_DIR?.trim() ||
    (domainDir ? j(domainDir, "persistent", "lucy-data") : j(root, "lucy-data"));
  let dataRoot = preferred;
  try {
    mkdirSync(preferred, { recursive: true });
  } catch (err) {
    dataRoot = j(root, "lucy-data-local");
    mkdirSync(dataRoot, { recursive: true });
    console.warn("[start] Fallback datos →", dataRoot, err?.message || err);
  }
  process.env.LUCY_DATA_DIR = dataRoot;
  if (!process.env.LUCY_LOCAL_DB_PATH?.trim()) {
    process.env.LUCY_LOCAL_DB_PATH = j(dataRoot, "pgdata");
  }
  if (!process.env.LUCY_CHAT_HISTORY_PATH?.trim()) {
    process.env.LUCY_CHAT_HISTORY_PATH = j(dataRoot, "chat-history.json");
  }
  mkdirSync(process.env.LUCY_LOCAL_DB_PATH, { recursive: true });
  if (domainDir && !dataDirFromEnv) migrateJsonFromOldVersions(domainDir, dataRoot);
  if (domainDir) restoreRelayEndpoint(domainDir);
  // PGlite es de un solo proceso y abajo se borran sus locks: la instancia vieja debe cerrar antes.
  await takeOverDataDir(j(dataRoot, "lucy.pid"));
  // Evitar 503: locks de PGlite tras restart Hostinger (auditor / lucy-data).
  try {
    const { readdirSync, unlinkSync } = await import("node:fs");
    const dbDir = process.env.LUCY_LOCAL_DB_PATH;
    for (const name of ["postmaster.pid", "postmaster.opts", "PG_VERSION.lock"]) {
      try {
        unlinkSync(j(dbDir, name));
      } catch {
        /* ok */
      }
    }
    for (const ent of readdirSync(dbDir)) {
      if (ent.startsWith(".s.PGSQL") || ent.endsWith(".lock") || ent.endsWith(".lock.out")) {
        try {
          unlinkSync(j(dbDir, ent));
        } catch {
          /* ok */
        }
      }
    }
    console.log("[start] Locks PGlite limpiados en", dbDir);
  } catch (lockErr) {
    console.warn("[start] Limpieza locks:", lockErr?.message || lockErr);
  }
  console.log(`[start] Datos persistentes → ${dataRoot}`);
} catch {
  /* opcional */
}

process.chdir(deployDir);
await import(new URL("./index.mjs", import.meta.resolve("./deploy/")).href);

/** Una sola vez: trae chat-history y demás JSON de lucy-data de versiones anteriores. */
function migrateJsonFromOldVersions(domain, dataRoot) {
  try {
    const versionsDir = join(domain, "hbuilds", "versions");
    const newest = new Map();
    for (const version of readdirSync(versionsDir)) {
      const oldData = join(versionsDir, version, "nodejs", "lucy-data");
      if (oldData === dataRoot || !existsSync(oldData)) continue;
      for (const name of readdirSync(oldData)) {
        if (!name.endsWith(".json")) continue;
        const file = join(oldData, name);
        const mtime = statSync(file).mtimeMs;
        if (!newest.has(name) || newest.get(name).mtime < mtime) newest.set(name, { file, mtime });
      }
    }
    for (const [name, { file }] of newest) {
      const dest = join(dataRoot, name);
      if (existsSync(dest)) continue;
      copyFileSync(file, dest);
      console.log(`[start] Migrado ${name} → ${dataRoot}`);
    }
  } catch (err) {
    console.warn("[start] Migración de lucy-data:", err?.message || err);
  }
}

/**
 * Buzón PHP de respaldo (hostinger-relay/kommo-relay.php) en public_html/<nombre secreto>/.
 * La copia maestra vive en persistent/relay-endpoint/ (name.txt, index.php, .htaccess);
 * si un deploy limpia public_html se vuelve a poner.
 */
function restoreRelayEndpoint(domain) {
  try {
    const src = join(domain, "persistent", "relay-endpoint");
    const nameFile = join(src, "name.txt");
    if (!existsSync(nameFile)) return;
    const name = readFileSync(nameFile, "utf8").trim();
    if (!/^kr-[0-9a-f]{32}$/.test(name)) return;
    const dest = join(domain, "public_html", name);
    let restored = false;
    for (const file of ["index.php", ".htaccess"]) {
      if (existsSync(join(dest, file))) continue;
      mkdirSync(dest, { recursive: true });
      copyFileSync(join(src, file), join(dest, file));
      restored = true;
    }
    console.log(restored ? "[start] Buzón de respaldo restaurado en public_html" : "[start] Buzón de respaldo OK");
  } catch (err) {
    console.warn("[start] Buzón de respaldo:", err?.message || err);
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isLucyProcess(pid) {
  if (!isAlive(pid)) return false;
  try {
    return /lsnode:|start\.mjs/.test(readFileSync(`/proc/${pid}/cmdline`, "utf8"));
  } catch {
    return false;
  }
}

async function takeOverDataDir(pidFile) {
  try {
    const oldPid = Number(readFileSync(pidFile, "utf8").trim());
    if (oldPid && oldPid !== process.pid && isLucyProcess(oldPid)) {
      console.log(`[start] Instancia anterior (pid ${oldPid}) usa lucy-data; esperando a que cierre…`);
      process.kill(oldPid, "SIGTERM");
      for (let i = 0; i < 30 && isAlive(oldPid); i++) await new Promise((r) => setTimeout(r, 500));
      if (isAlive(oldPid)) {
        console.warn(`[start] pid ${oldPid} no cerró en 15 s; forzando`);
        process.kill(oldPid, "SIGKILL");
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } catch {
    /* sin pid previo */
  }
  try {
    writeFileSync(pidFile, String(process.pid));
  } catch (err) {
    console.warn("[start] No se pudo escribir lucy.pid:", err?.message || err);
  }
}
