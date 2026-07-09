import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

let ensured = false;

const STATEMENTS = [
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS author_type VARCHAR(20)`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS kommo_message_id TEXT`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS source VARCHAR(30)`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS learning_phase VARCHAR(30)`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_kommo_sync_at TIMESTAMP`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_learning_extract_at TIMESTAMP`,
  `CREATE UNIQUE INDEX IF NOT EXISTS messages_kommo_message_id_idx ON messages (kommo_message_id) WHERE kommo_message_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS learning_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kommo_lead_id TEXT NOT NULL,
    user_message TEXT NOT NULL,
    suggested_response TEXT NOT NULL,
    label TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    source VARCHAR(30) NOT NULL DEFAULT 'human_chat',
    confidence DECIMAL(3, 2),
    context_snippet TEXT,
    dedupe_key TEXT UNIQUE,
    reviewed_at TIMESTAMP,
    reviewed_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS knowledge_gaps (
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
  )`,
];

export async function ensureLearningSchema(): Promise<void> {
  if (ensured) return;
  for (const statement of STATEMENTS) {
    try {
      await db.execute(sql.raw(statement));
    } catch (err) {
      logger.warn({ err, statement: statement.slice(0, 60) }, "learningSchema: statement falló");
    }
  }
  ensured = true;
}
