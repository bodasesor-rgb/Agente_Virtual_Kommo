import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

let ensured = false;

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommo_lead_id TEXT,
  question TEXT NOT NULL,
  topic TEXT,
  gap_type VARCHAR(30) NOT NULL DEFAULT 'unknown',
  lucy_response TEXT,
  answer TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  context_snippet TEXT,
  dedupe_key TEXT UNIQUE,
  answered_at TIMESTAMP,
  answered_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
)`;

export async function ensureKnowledgeGapSchema(): Promise<void> {
  if (ensured) return;
  try {
    await db.execute(sql.raw(CREATE_TABLE));
    await db.execute(sql.raw(
      `CREATE INDEX IF NOT EXISTS knowledge_gaps_status_idx ON knowledge_gaps (status, created_at DESC)`
    ));
    ensured = true;
  } catch (err) {
    logger.warn({ err }, "knowledgeGapSchema: falló — se reintentará en la próxima petición");
  }
}
