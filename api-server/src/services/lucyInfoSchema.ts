import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

let ensured = false;

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS lucy_info_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(30) NOT NULL DEFAULT 'catalog',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_filename TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
)`;

export async function ensureLucyInfoSchema(): Promise<void> {
  if (ensured) return;
  try {
    await db.execute(sql.raw(CREATE_TABLE));
    await db.execute(
      sql.raw(
        `CREATE INDEX IF NOT EXISTS lucy_info_documents_kind_idx ON lucy_info_documents (kind, updated_at DESC)`,
      ),
    );
  } catch (err) {
    logger.warn({ err }, "lucyInfoSchema: falló");
  }
  ensured = true;
}
