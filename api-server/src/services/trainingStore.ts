import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { db, trainingExamples } from "@workspace/db";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import type { TrainingExample } from "../lib/training.js";
import { resolveTrainingJsonFile } from "../lib/trainingPaths.js";
import { logger } from "../lib/logger.js";

const CACHE_TTL_MS = 30_000;

let cache: TrainingExample[] = [];
let cacheLoadedAt = 0;
let initialized = false;

const ENSURE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS training_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_message TEXT NOT NULL,
  lucy_response TEXT NOT NULL,
  label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

function rowToExample(row: {
  id: string;
  userMessage: string;
  lucyResponse: string;
  label: string | null;
  createdAt: Date;
}): TrainingExample {
  return {
    id: row.id,
    userMessage: row.userMessage,
    lucyResponse: row.lucyResponse,
    label: row.label ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function loadExamplesFromJsonFile(): TrainingExample[] {
  try {
    const raw = readFileSync(resolveTrainingJsonFile(), "utf-8");
    const parsed = JSON.parse(raw) as { examples?: TrainingExample[] };
    return parsed.examples ?? [];
  } catch {
    return [];
  }
}

async function ensureTable(): Promise<void> {
  try {
    await db.execute(sql.raw(ENSURE_TABLE_SQL));
  } catch (err) {
    logger.warn({ err }, "trainingStore: no se pudo crear tabla training_examples");
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function seedFromJsonIfEmpty(): Promise<void> {
  try {
    const [{ value: total }] = await db.select({ value: count() }).from(trainingExamples);
    if (Number(total) > 0) return;

    const fromJson = loadExamplesFromJsonFile();
    if (fromJson.length === 0) return;

    await db.insert(trainingExamples).values(
      fromJson.map((ex, idx) => ({
        id: ex.id && isUuid(ex.id) ? ex.id : randomUUID(),
        userMessage: ex.userMessage,
        lucyResponse: ex.lucyResponse,
        label: ex.label ?? null,
        sortOrder: fromJson.length - idx,
      }))
    );
    logger.info({ count: fromJson.length }, "trainingStore: ejemplos sembrados desde JSON");
  } catch (err) {
    logger.warn({ err }, "trainingStore: seed desde JSON falló — se usará archivo");
  }
}

async function loadFromDb(): Promise<TrainingExample[]> {
  try {
    const rows = await db
      .select()
      .from(trainingExamples)
      .orderBy(desc(trainingExamples.sortOrder), asc(trainingExamples.createdAt));
    if (rows.length > 0) return rows.map(rowToExample);
  } catch (err) {
    logger.warn({ err }, "trainingStore: lectura DB falló — fallback JSON");
  }
  return loadExamplesFromJsonFile();
}

export async function initializeTrainingStore(): Promise<void> {
  if (initialized) return;
  await ensureTable();
  await seedFromJsonIfEmpty();
  cache = await loadFromDb();
  cacheLoadedAt = Date.now();
  initialized = true;
  logger.info({ count: cache.length }, "trainingStore: listo");
}

function invalidateCache(): void {
  cacheLoadedAt = 0;
}

async function refreshCacheIfStale(): Promise<void> {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS && cache.length > 0) return;
  cache = await loadFromDb();
  cacheLoadedAt = Date.now();
}

export async function getTrainingExamples(): Promise<TrainingExample[]> {
  if (!initialized) await initializeTrainingStore();
  await refreshCacheIfStale();
  return cache;
}

export async function listTrainingExamples(): Promise<TrainingExample[]> {
  return getTrainingExamples();
}

export async function getTrainingStats(): Promise<{
  total: number;
  byLabel: Record<string, number>;
  lastUpdated: string | null;
}> {
  const examples = await listTrainingExamples();
  const byLabel: Record<string, number> = {};
  for (const ex of examples) {
    const lbl = ex.label ?? "Sin etiqueta";
    byLabel[lbl] = (byLabel[lbl] ?? 0) + 1;
  }
  const lastUpdated =
    examples.length > 0
      ? examples.reduce((latest, ex) => {
          const exDate = ex.createdAt ?? "";
          return exDate > (latest ?? "") ? exDate : latest;
        }, examples[0]?.createdAt ?? "")
      : null;
  return { total: examples.length, byLabel, lastUpdated };
}

export async function createTrainingExample(input: {
  userMessage: string;
  lucyResponse: string;
  label?: string;
}): Promise<TrainingExample> {
  const id = randomUUID();
  const now = new Date();
  try {
    const [row] = await db
      .insert(trainingExamples)
      .values({
        id,
        userMessage: input.userMessage.trim(),
        lucyResponse: input.lucyResponse.trim(),
        label: input.label?.trim() || null,
        sortOrder: Math.floor(Date.now() / 1000),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    invalidateCache();
    return rowToExample(row!);
  } catch (err) {
    logger.warn({ err }, "trainingStore: create en DB falló");
    throw err;
  }
}

export async function updateTrainingExample(
  id: string,
  patch: { userMessage?: string; lucyResponse?: string; label?: string }
): Promise<TrainingExample | null> {
  const [existing] = await db
    .select()
    .from(trainingExamples)
    .where(eq(trainingExamples.id, id))
    .limit(1);
  if (!existing) return null;

  const [row] = await db
    .update(trainingExamples)
    .set({
      userMessage: patch.userMessage?.trim() ?? existing.userMessage,
      lucyResponse: patch.lucyResponse?.trim() ?? existing.lucyResponse,
      label: patch.label !== undefined ? patch.label.trim() || null : existing.label,
      updatedAt: new Date(),
    })
    .where(eq(trainingExamples.id, id))
    .returning();

  invalidateCache();
  return row ? rowToExample(row) : null;
}

export async function deleteTrainingExample(id: string): Promise<boolean> {
  const deleted = await db
    .delete(trainingExamples)
    .where(eq(trainingExamples.id, id))
    .returning({ id: trainingExamples.id });
  if (deleted.length === 0) return false;
  invalidateCache();
  return true;
}
