import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { getLocalDb, isLocalDbMode } from "./local.js";
import * as schema from "./schema/index.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

async function createDb() {
  if (isLocalDbMode()) {
    console.info("[db] Sin DATABASE_URL → usando base de datos local (PGlite)");
    return getLocalDb();
  }

  pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  return drizzle(pool, { schema });
}

/** Si PGlite falla del todo, no tumbar el proceso: Lucy debe responder WhatsApp. */
let db;
try {
  db = await createDb();
} catch (err) {
  console.error(
    "[db] FATAL al crear DB — Lucy arranca sin persistencia local:",
    err instanceof Error ? err.message : err
  );
  // Reintento único en carpeta efímera bajo /tmp-equivalent
  process.env["LUCY_LOCAL_DB_PATH"] = `${process.env["LUCY_LOCAL_DB_PATH"] || "pgdata"}-emergency-${Date.now()}`;
  try {
    db = await getLocalDb();
  } catch (err2) {
    console.error("[db] Emergency PGlite también falló:", err2);
    throw err2;
  }
}
export { db };
export { pool };
export * from "./schema/index.js";
