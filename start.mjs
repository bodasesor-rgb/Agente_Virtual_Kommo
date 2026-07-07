#!/usr/bin/env node
/**
 * Arranque Hostinger desde la raíz del repo (directorio raíz fijo en ./).
 * Los binarios precompilados viven en deploy/.
 */
import { existsSync } from "node:fs";
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

if (!process.env.OPENAI_API_KEY?.trim() && process.env.OPEN_AI?.trim()) {
  process.env.OPENAI_API_KEY = process.env.OPEN_AI.trim();
}

if (!process.env.OPENAI_API_KEY && !process.env.OPEN_AI) {
  console.warn("[start] AVISO: OPEN_AI / OPENAI_API_KEY no configurada — Lucy no podrá usar GPT");
}

console.log("[start] Archivos OK, arrancando Lucy desde deploy/...");
process.chdir(deployDir);
await import(new URL("./index.mjs", import.meta.resolve("./deploy/")).href);
