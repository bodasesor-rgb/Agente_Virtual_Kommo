#!/usr/bin/env node
/**
 * Arranque Hostinger — verifica archivos y lanza Lucy.
 */
import { existsSync } from "node:fs";
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

if (!process.env.OPENAI_API_KEY) {
  console.warn("[start] AVISO: OPENAI_API_KEY no está configurada — Lucy no podrá usar GPT");
}

console.log("[start] Archivos OK, arrancando Lucy...");
await import("./index.mjs");
