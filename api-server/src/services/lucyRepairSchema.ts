import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

let ensured = false;

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS lucy_repairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommo_lead_id TEXT,
  category VARCHAR(40) NOT NULL DEFAULT 'other',
  severity VARCHAR(20) NOT NULL DEFAULT 'warn',
  evidence TEXT NOT NULL,
  proposed_repair TEXT NOT NULL,
  applied_repair TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  source VARCHAR(20) NOT NULL DEFAULT 'heuristic',
  model TEXT,
  dedupe_key TEXT UNIQUE,
  resolved_at TIMESTAMP,
  resolved_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
)`;

export async function ensureLucyRepairSchema(): Promise<void> {
  if (ensured) return;
  try {
    await db.execute(sql.raw(CREATE_TABLE));
    await db.execute(
      sql.raw(
        `CREATE INDEX IF NOT EXISTS lucy_repairs_status_idx ON lucy_repairs (status, created_at DESC)`
      )
    );
  } catch (err) {
    logger.warn({ err }, "lucyRepairSchema: falló");
  }
  ensured = true;
}
