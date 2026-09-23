#!/usr/bin/env node
/**
 * Arranque Hostinger — verifica archivos y lanza Lucy.
 * Datos persistentes viven en ../lucy-data (fuera de deploy/) para no
 * borrarse en cada git pull / redeploy.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const required = ["index.mjs", "postgres.data", "postgres.wasm"];
for (const file of required) {
  const path = join(here, file);
  if (!existsSync(path)) {
    console.error(`[start] FALTA archivo requerido: ${file}`);
    console.error(`[start] Ruta esperada: ${path}`);
    process.exit(1);
  }
}

if (!process.env.OPENAI_API_KEY?.trim() && process.env.OPEN_AI?.trim()) {
  process.env.OPENAI_API_KEY = process.env.OPEN_AI.trim();
}

if (!process.env.OPENAI_API_KEY && !process.env.OPEN_AI) {
  console.warn("[start] AVISO: OPEN_AI / OPENAI_API_KEY no configurada — Lucy no podrá usar GPT");
}

// Persistencia: preferir ../lucy-data (sobrevive redeploy). Si el padre no
// es escribible (Hostinger a veces monta solo deploy/), caer a ./lucy-data.
function resolveDataRoot() {
  if (process.env.LUCY_DATA_DIR?.trim()) return process.env.LUCY_DATA_DIR.trim();
  const preferred = join(here, "..", "lucy-data");
  const fallback = join(here, "lucy-data");
  try {
    mkdirSync(preferred, { recursive: true });
    return preferred;
  } catch (err) {
    console.warn("[start] No se pudo crear ../lucy-data, usando deploy/lucy-data:", err?.message || err);
    mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

const dataRoot = resolveDataRoot();
process.env.LUCY_DATA_DIR = dataRoot;
if (!process.env.LUCY_LOCAL_DB_PATH?.trim()) {
  process.env.LUCY_LOCAL_DB_PATH = join(dataRoot, "pgdata");
}
if (!process.env.LUCY_CHAT_HISTORY_PATH?.trim()) {
  process.env.LUCY_CHAT_HISTORY_PATH = join(dataRoot, "chat-history.json");
}
mkdirSync(process.env.LUCY_LOCAL_DB_PATH, { recursive: true });
console.log(`[start] Datos persistentes → ${dataRoot}`);

console.log("[start] Archivos OK, arrancando Lucy...");
await import("./index.mjs");
