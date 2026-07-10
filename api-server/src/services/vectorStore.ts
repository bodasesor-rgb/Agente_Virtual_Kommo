import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

export interface VectorPayload {
  preguntaCliente: string;
  respuestaHumano: string;
  contexto?: string | null;
  source: string;
  kommoLeadId?: string | null;
}

export interface VectorSearchHit {
  id: string;
  score: number;
  payload: VectorPayload;
}

interface StoredVector {
  id: string;
  embedding: number[];
  payload: VectorPayload;
  indexedAt: string;
}

interface IndexMeta {
  lastRunAt: string | null;
  lastRunAdded: number;
  lastRunSkipped: number;
  total: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const VECTORS_FILE = path.join(DATA_DIR, "learning-vectors.json");
const META_FILE = path.join(DATA_DIR, "learning-index-meta.json");

let cache: StoredVector[] | null = null;

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadVectors(): StoredVector[] {
  if (cache) return cache;
  ensureDataDir();
  if (!existsSync(VECTORS_FILE)) {
    cache = [];
    return cache;
  }
  try {
    const raw = readFileSync(VECTORS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as { vectors?: StoredVector[] };
    cache = parsed.vectors ?? [];
    return cache;
  } catch (err) {
    logger.warn({ err }, "vectorStore: no se pudo leer learning-vectors.json");
    cache = [];
    return cache;
  }
}

function saveVectors(vectors: StoredVector[]): void {
  ensureDataDir();
  cache = vectors;
  writeFileSync(VECTORS_FILE, JSON.stringify({ vectors }, null, 0), "utf-8");
}

function loadMeta(): IndexMeta {
  ensureDataDir();
  if (!existsSync(META_FILE)) {
    return { lastRunAt: null, lastRunAdded: 0, lastRunSkipped: 0, total: 0 };
  }
  try {
    return JSON.parse(readFileSync(META_FILE, "utf-8")) as IndexMeta;
  } catch {
    return { lastRunAt: null, lastRunAdded: 0, lastRunSkipped: 0, total: 0 };
  }
}

function saveMeta(meta: IndexMeta): void {
  ensureDataDir();
  writeFileSync(META_FILE, JSON.stringify(meta, null, 2), "utf-8");
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function pairHash(pregunta: string, respuesta: string): string {
  return createHash("sha256")
    .update(`${pregunta.trim()}|${respuesta.trim()}`)
    .digest("hex")
    .slice(0, 40);
}

export async function upsertVector(
  id: string,
  vector: number[],
  payload: VectorPayload
): Promise<void> {
  const vectors = loadVectors();
  const entry: StoredVector = {
    id,
    embedding: vector,
    payload,
    indexedAt: new Date().toISOString(),
  };
  const idx = vectors.findIndex((v) => v.id === id);
  if (idx >= 0) vectors[idx] = entry;
  else vectors.push(entry);
  saveVectors(vectors);
}

export async function vectorExists(id: string): Promise<boolean> {
  return loadVectors().some((v) => v.id === id);
}

export async function countVectors(): Promise<number> {
  return loadVectors().length;
}

export async function searchVectors(
  queryVector: number[],
  k: number
): Promise<VectorSearchHit[]> {
  const hits: VectorSearchHit[] = loadVectors().map((row) => ({
    id: row.id,
    score: cosineSimilarity(queryVector, row.embedding),
    payload: row.payload,
  }));
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

export async function setIndexMeta(partial: Partial<IndexMeta>): Promise<void> {
  const meta = { ...loadMeta(), ...partial, total: loadVectors().length };
  saveMeta(meta);
}

export async function getIndexEstado(): Promise<IndexMeta> {
  const meta = loadMeta();
  meta.total = loadVectors().length;
  return meta;
}

export function invalidateVectorCache(): void {
  cache = null;
}
