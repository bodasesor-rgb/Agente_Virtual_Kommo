import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

let ensured = false;

const STATEMENTS = [
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_client_message_at TIMESTAMP`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_window_renewal_at TIMESTAMP`,
];

export async function ensureWhatsAppWindowSchema(): Promise<void> {
  if (ensured) return;
  for (const stmt of STATEMENTS) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (err) {
      logger.warn({ err, stmt }, "whatsappWindowSchema: ALTER falló (puede existir)");
    }
  }
  ensured = true;
}
