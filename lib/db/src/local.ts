import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import fs from "node:fs";
import path from "node:path";

import * as schema from "./schema/index.js";

/** Mutable: en crash de arranque rotamos a carpeta limpia. */
let LOCAL_DB_DIR =
  process.env["LUCY_LOCAL_DB_PATH"]?.trim() ||
  path.resolve(process.cwd(), "..", "lucy-data", "pgdata");

let client: PGlite | null = null;
let localDb: ReturnType<typeof drizzle> | null = null;

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommo_lead_id TEXT UNIQUE NOT NULL,
  kommo_chat_id TEXT NOT NULL,
  kommo_talk_id TEXT,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  stage VARCHAR(50) NOT NULL DEFAULT 'discovery',
  event_type TEXT,
  event_date TIMESTAMP,
  guest_count INTEGER,
  budget DECIMAL(10, 2),
  message_count INTEGER NOT NULL DEFAULT 0,
  unclear_streak INTEGER NOT NULL DEFAULT 0,
  last_intent VARCHAR(100),
  sentiment VARCHAR(50) DEFAULT 'neutral',
  learning_phase VARCHAR(30),
  last_kommo_sync_at TIMESTAMP,
  last_learning_extract_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommo_lead_id TEXT UNIQUE NOT NULL,
  total_score INTEGER NOT NULL DEFAULT 0,
  priority VARCHAR(20) NOT NULL DEFAULT 'cold',
  budget_score INTEGER NOT NULL DEFAULT 0,
  urgency_score INTEGER NOT NULL DEFAULT 0,
  engagement_score INTEGER NOT NULL DEFAULT 0,
  completeness_score INTEGER NOT NULL DEFAULT 0,
  intent_score INTEGER NOT NULL DEFAULT 0,
  reasoning TEXT,
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommo_lead_id TEXT NOT NULL,
  role VARCHAR(20) NOT NULL,
  author_type VARCHAR(20),
  content TEXT NOT NULL,
  kommo_message_id TEXT,
  source VARCHAR(30),
  intent VARCHAR(100),
  sentiment DECIMAL(3, 2),
  extracted_data JSONB,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TIMESTAMP NOT NULL,
  conversations_started INTEGER NOT NULL DEFAULT 0,
  conversations_closed INTEGER NOT NULL DEFAULT 0,
  leads_qualified INTEGER NOT NULL DEFAULT 0,
  average_response_time INTEGER,
  average_lead_score DECIMAL(5, 2),
  hot_leads INTEGER NOT NULL DEFAULT 0,
  warm_leads INTEGER NOT NULL DEFAULT 0,
  cold_leads INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follow_up_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommo_lead_id TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  scheduled_for TIMESTAMP NOT NULL,
  executed BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_message TEXT NOT NULL,
  lucy_response TEXT NOT NULL,
  label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learning_candidates (
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
);

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
);

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
);
`;

const MIGRATION_SQL = `
ALTER TABLE messages ADD COLUMN IF NOT EXISTS author_type VARCHAR(20);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS kommo_message_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source VARCHAR(30);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS learning_phase VARCHAR(30);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_kommo_sync_at TIMESTAMP;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_learning_extract_at TIMESTAMP;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unclear_streak INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS messages_kommo_message_id_idx ON messages (kommo_message_id) WHERE kommo_message_id IS NOT NULL;
`;

/**
 * Hostinger reinicia Node dejando locks/pids que tumban PGlite al boot (503).
 * Borramos agresivo: process.kill(pid,0) puede dar falso positivo si el PID se reusa.
 */
export function clearPgdataLocks(dir: string): void {
  if (!fs.existsSync(dir)) return;
  const victims = ["postmaster.pid", "postmaster.opts", "PG_VERSION.lock"];
  for (const name of victims) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      /* ok */
    }
  }
  try {
    for (const ent of fs.readdirSync(dir)) {
      if (
        ent.startsWith(".s.PGSQL") ||
        ent.endsWith(".lock") ||
        ent.endsWith(".lock.out")
      ) {
        try {
          fs.unlinkSync(path.join(dir, ent));
        } catch {
          /* ok */
        }
      }
    }
  } catch {
    /* ok */
  }
}

async function openPgAt(dir: string): Promise<ReturnType<typeof drizzle>> {
  fs.mkdirSync(dir, { recursive: true });
  clearPgdataLocks(dir);
  const pg = new PGlite(dir);
  await pg.exec(INIT_SQL);
  try {
    await pg.exec(MIGRATION_SQL);
  } catch {
    // columnas/index pueden existir en instalaciones nuevas
  }
  client = pg;
  const db = drizzle(pg, { schema });
  console.info(`[db] Modo local activo → ${dir}`);
  return db;
}

export async function getLocalDb() {
  if (localDb) return localDb;

  try {
    localDb = await openPgAt(LOCAL_DB_DIR);
    return localDb;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[db] Falló abrir ${LOCAL_DB_DIR}: ${msg}`);
    // Renombrar carpeta rota (si se puede) y abrir una limpia — Lucy debe escuchar el puerto.
    const broken = `${LOCAL_DB_DIR}-broken-${Date.now()}`;
    try {
      if (fs.existsSync(LOCAL_DB_DIR)) {
        fs.renameSync(LOCAL_DB_DIR, broken);
        console.warn(`[db] pgdata movida a ${broken}`);
      }
    } catch (renameErr) {
      console.warn(
        "[db] No se pudo renombrar pgdata:",
        renameErr instanceof Error ? renameErr.message : renameErr
      );
    }
    const fresh = path.join(path.dirname(LOCAL_DB_DIR), `pgdata-boot-${Date.now()}`);
    LOCAL_DB_DIR = fresh;
    process.env["LUCY_LOCAL_DB_PATH"] = fresh;
    localDb = await openPgAt(fresh);
    return localDb;
  }
}

export function isLocalDbMode() {
  return !process.env["DATABASE_URL"]?.trim();
}
