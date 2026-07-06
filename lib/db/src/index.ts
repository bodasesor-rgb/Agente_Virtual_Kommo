import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema.js";

const { Pool } = pg;

const connectionString =
  process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/lucy";

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

export {
  conversations,
  followUpEvents,
  leadScores,
  messages,
  users,
} from "./schema.js";
