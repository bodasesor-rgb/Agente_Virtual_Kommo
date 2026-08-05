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
  const { readFileSync, existsSync: exists } = await import("node:fs");
  const { join: j } = await import("node:path");
  const metaPath = j(deployDir, "build-meta.json");
  if (exists(metaPath)) {
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
