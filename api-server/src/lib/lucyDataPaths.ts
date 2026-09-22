/**
 * Rutas de datos persistentes (sobreviven redeploy de `deploy/`).
 * Default: carpeta hermana `../lucy-data` relativa al cwd de Hostinger.
 */
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function getLucyDataRoot(): string {
  const fromEnv = process.env["LUCY_DATA_DIR"]?.trim();
  if (fromEnv) return resolve(fromEnv);
  return resolve(process.cwd(), "..", "lucy-data");
}

export function ensureLucyDataRoot(): string {
  const root = getLucyDataRoot();
  mkdirSync(root, { recursive: true });
  return root;
}

export function getLucyPgDataPath(): string {
  const fromEnv = process.env["LUCY_LOCAL_DB_PATH"]?.trim();
  if (fromEnv) return resolve(fromEnv);
  return join(getLucyDataRoot(), "pgdata");
}

export function getLucyChatHistoryPath(): string {
  const fromEnv = process.env["LUCY_CHAT_HISTORY_PATH"]?.trim();
  if (fromEnv) return resolve(fromEnv);
  return join(getLucyDataRoot(), "chat-history.json");
}

/** Asegura dirs y exporta env canónicos antes de abrir PGlite / history. */
export function bootstrapLucyDataEnv(): void {
  const root = ensureLucyDataRoot();
  if (!process.env["LUCY_DATA_DIR"]?.trim()) {
    process.env["LUCY_DATA_DIR"] = root;
  }
  if (!process.env["LUCY_LOCAL_DB_PATH"]?.trim()) {
    process.env["LUCY_LOCAL_DB_PATH"] = join(root, "pgdata");
  }
  if (!process.env["LUCY_CHAT_HISTORY_PATH"]?.trim()) {
    process.env["LUCY_CHAT_HISTORY_PATH"] = join(root, "chat-history.json");
  }
  mkdirSync(dirname(process.env["LUCY_CHAT_HISTORY_PATH"]!), { recursive: true });
  mkdirSync(process.env["LUCY_LOCAL_DB_PATH"]!, { recursive: true });
}
