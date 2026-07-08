import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Ruta única al JSON de few-shot — misma lógica en lectura y escritura (dev + deploy). */
export function resolveTrainingJsonFile(): string {
  const candidates = [
    join(moduleDir, "training-examples.json"),
    join(moduleDir, "data/training-examples.json"),
    join(moduleDir, "../../data/training-examples.json"),
    join(moduleDir, "../data/training-examples.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return candidates[1]!;
}
