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

try {
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const metaPath = join(deployDir, "build-meta.json");
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    console.log(
      `[start] Build: prompt ${meta.lucy_prompt} · ${meta.built_at_display ?? meta.built_at}` +
        (meta.git_commit_short ? ` · commit ${meta.git_commit_short}` : ""),
    );
  }
} catch {
  /* opcional */
}

process.chdir(deployDir);
await import(new URL("./index.mjs", import.meta.resolve("./deploy/")).href);
