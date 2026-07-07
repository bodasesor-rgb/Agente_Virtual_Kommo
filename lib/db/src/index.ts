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

export const db = await createDb();
export { pool };
export * from "./schema/index.js";
