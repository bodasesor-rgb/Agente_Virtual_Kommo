/**
 * RAG de PDFs del catálogo Bodasesor en Google Drive (carpeta pública).
 *
 * Flujo: lista PDFs → descarga → extrae texto → chunks → búsqueda por tokens.
 * Se inserta entre Sheet (precios) y nivel 2/3 en serviceKnowledge.
 *
 * Env:
 * - GOOGLE_DRIVE_CATALOG_FOLDER_ID (default: carpeta "Catalogó bodasesor 2026 finales")
 * - GOOGLE_DRIVE_PDF_DISABLED=1 para apagar
 * - DRIVE_PDF_REFRESH_MINUTES (default 60)
 */
import { extractText, getDocumentProxy } from "unpdf";
import { logger } from "../lib/logger.js";

/** Carpeta compartida: Catalogó bodasesor 2026 finales */
export const DEFAULT_DRIVE_CATALOG_FOLDER_ID = "1Z_qYCwmu1y9t5WcapjhizcVzW_xAEfag";

const CHUNK_SIZE = 1100;
const CHUNK_OVERLAP = 120;
const MAX_CHUNKS_IN_PROMPT = 3;
const MAX_PROMPT_CHARS = 2800;
const DOWNLOAD_CONCURRENCY = 3;

export interface DrivePdfFile {
  id: string;
  name: string;
}

export interface DrivePdfChunk {
  fileId: string;
  fileName: string;
  serviceLabel: string;
  text: string;
  index: number;
}

export interface DrivePdfStatus {
  enabled: boolean;
  loaded: boolean;
  folderId: string | null;
  fileCount: number;
  chunkCount: number;
  lastRefresh: string | null;
  lastError: string | null;
  files: string[];
}

interface DrivePdfSnapshot {
  folderId: string;
  files: DrivePdfFile[];
  chunks: DrivePdfChunk[];
  status: DrivePdfStatus;
}

let snapshot: DrivePdfSnapshot | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let refreshing: Promise<DrivePdfSnapshot | null> | null = null;

function isDisabled(): boolean {
  const v = process.env["GOOGLE_DRIVE_PDF_DISABLED"]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function getDriveCatalogFolderId(): string | null {
  if (isDisabled()) return null;
  const fromEnv = process.env["GOOGLE_DRIVE_CATALOG_FOLDER_ID"]?.trim();
  if (fromEnv === "" || fromEnv === "0" || fromEnv === "off") return null;
  return fromEnv || DEFAULT_DRIVE_CATALOG_FOLDER_ID;
}

function emptyStatus(folderId: string | null = null): DrivePdfStatus {
  return {
    enabled: !isDisabled() && !!folderId,
    loaded: false,
    folderId,
    fileCount: 0,
    chunkCount: 0,
    lastRefresh: null,
    lastError: null,
    files: [],
  };
}

export function getDrivePdfStatus(): DrivePdfStatus {
  if (snapshot) return snapshot.status;
  return emptyStatus(getDriveCatalogFolderId());
}

/** Etiqueta de servicio desde el nombre del PDF. */
export function serviceLabelFromPdfName(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bBodasesor\b/gi, "")
    .replace(/\b2026\b/g, "")
    .replace(/\bbodaseor\b/gi, "")
    .trim();
}

function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(query: string): string[] {
  return normalizeSearch(query)
    .split(" ")
    .filter((w) => w.length >= 3)
    .filter((w) => !/^(quiero|necesito|busco|cotizar|cuanto|cuesta|precio|incluye|para|tiene|como|tiene|me|del|los|las|una|uno|con|por|the|and)$/.test(w));
}

function chunkText(text: string, file: DrivePdfFile): DrivePdfChunk[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const label = serviceLabelFromPdfName(file.name);
  const chunks: DrivePdfChunk[] = [];
  let i = 0;
  let index = 0;
  while (i < cleaned.length) {
    const end = Math.min(i + CHUNK_SIZE, cleaned.length);
    const slice = cleaned.slice(i, end).trim();
    if (slice.length >= 80) {
      chunks.push({
        fileId: file.id,
        fileName: file.name,
        serviceLabel: label,
        text: slice,
        index,
      });
      index += 1;
    }
    if (end >= cleaned.length) break;
    i = Math.max(end - CHUNK_OVERLAP, i + 1);
  }
  return chunks;
}

/** Lista PDFs de una carpeta pública vía embeddedfolderview (sin API key). */
export async function listPublicDrivePdfs(folderId: string): Promise<DrivePdfFile[]> {
  const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
  const res = await fetch(url, {
    headers: { "User-Agent": "BodasesorLucy/1.0" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`Drive folderview HTTP ${res.status}`);
  }
  const html = await res.text();
  const ids = [...html.matchAll(/entry-([A-Za-z0-9_-]{20,})/g)].map((m) => m[1]!);
  const titles = [...html.matchAll(/class="flip-entry-title"[^>]*>([^<]+)/g)].map((m) =>
    m[1]!.replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim()
  );

  const files: DrivePdfFile[] = [];
  const seen = new Set<string>();
  const n = Math.min(ids.length, titles.length);
  for (let i = 0; i < n; i++) {
    const id = ids[i]!;
    const name = titles[i]!;
    if (seen.has(id)) continue;
    if (!/\.pdf$/i.test(name)) continue;
    seen.add(id);
    files.push({ id, name });
  }
  return files;
}

async function downloadDriveFile(fileId: string): Promise<Uint8Array> {
  const url = `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(fileId)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "BodasesorLucy/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`Download HTTP ${res.status} for ${fileId}`);
  }
  const ctype = res.headers.get("content-type") ?? "";
  const buf = new Uint8Array(await res.arrayBuffer());
  if (ctype.includes("text/html") || buf.length < 500) {
    const head = new TextDecoder().decode(buf.slice(0, 200));
    if (/<!DOCTYPE html|<html/i.test(head)) {
      throw new Error(`Drive interstitial HTML for ${fileId}`);
    }
  }
  return buf;
}

async function extractPdfText(buf: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join(" ") : String(text ?? "");
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function stripPriceClaims(text: string): string {
  return text
    .replace(/\$\s*[\d,.]+(?:\s*(?:\/\s*)?pp)?/gi, "[precio — ver Sheet / equipo]")
    .replace(/\bdesde\s+\$[\d,.]+/gi, "precio según cotización")
    .replace(/\b[\d,]+\s*pesos?\b/gi, "[precio — ver Sheet / equipo]");
}

function scoreChunk(chunk: DrivePdfChunk, tokens: string[], queryNorm: string): number {
  const labelNorm = normalizeSearch(chunk.serviceLabel);
  const fileNorm = normalizeSearch(chunk.fileName);
  const textNorm = normalizeSearch(chunk.text);
  let score = 0;

  for (const t of tokens) {
    if (labelNorm.includes(t)) score += 8;
    if (fileNorm.includes(t)) score += 6;
    if (textNorm.includes(t)) score += 2;
  }

  if (tokens.length && tokens.every((t) => labelNorm.includes(t) || fileNorm.includes(t))) {
    score += 12;
  }

  // Preferencia por coincidencia fuerte del servicio principal
  const primaryHints = [
    "banquete",
    "taquiza",
    "sushi",
    "coffee",
    "pizza",
    "parrillada",
    "brunch",
    "desayuno",
    "canapes",
    "dulces",
    "bebidas",
    "mocteles",
    "paella",
    "crepas",
    "mariscos",
    "pastas",
    "mobiliario",
    "pista",
    "tarima",
    "dj",
    "audio",
  ];
  for (const hint of primaryHints) {
    if (queryNorm.includes(hint) && (labelNorm.includes(hint) || fileNorm.includes(hint))) {
      score += 15;
    }
  }

  return score;
}

/** Búsqueda de chunks relevantes para una pregunta de servicio. */
export function searchDrivePdfChunks(query: string, limit = MAX_CHUNKS_IN_PROMPT): DrivePdfChunk[] {
  if (!snapshot?.chunks.length) return [];
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return [];
  const queryNorm = normalizeSearch(query);

  const ranked = snapshot.chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, tokens, queryNorm) }))
    .filter((r) => r.score >= 8)
    .sort((a, b) => b.score - a.score);

  const picked: DrivePdfChunk[] = [];
  const seenFiles = new Set<string>();
  for (const { chunk } of ranked) {
    if (picked.length >= limit) break;
    // Máx 2 chunks del mismo PDF
    const countSame = picked.filter((p) => p.fileId === chunk.fileId).length;
    if (countSame >= 2) continue;
    if (seenFiles.size >= 2 && !seenFiles.has(chunk.fileId) && picked.length >= 2) continue;
    picked.push(chunk);
    seenFiles.add(chunk.fileId);
  }
  return picked;
}

export function hasDrivePdfKnowledge(query: string): boolean {
  return searchDrivePdfChunks(query, 1).length > 0;
}

/** Bloque para el prompt GPT — menús/descripciones; precios censurados. */
export function formatDrivePdfKnowledgeForPrompt(query: string): string | null {
  const chunks = searchDrivePdfChunks(query);
  if (!chunks.length) return null;

  const parts: string[] = [
    "CONOCIMIENTO PDF (Google Drive — menús / inclusiones / descripción):",
    "Usa este texto para describir el servicio. NO cites precios del PDF: los precios salen SOLO del Google Sheet o los confirma el equipo.",
  ];

  let used = 0;
  for (const chunk of chunks) {
    const body = stripPriceClaims(chunk.text);
    const block = `— Fuente: ${chunk.fileName} (${chunk.serviceLabel})\n${body}`;
    if (used + block.length > MAX_PROMPT_CHARS) break;
    parts.push(block);
    used += block.length;
  }

  return parts.join("\n\n");
}

/** Respuesta corta al cliente con detalle del PDF (sin precios inventados). */
export function buildDrivePdfServiceAnswer(query: string): string | null {
  const chunks = searchDrivePdfChunks(query, 2);
  if (!chunks.length) return null;

  const label = chunks[0]!.serviceLabel || "ese servicio";
  const detail = stripPriceClaims(chunks.map((c) => c.text).join(" ").slice(0, 700)).trim();
  if (!detail) return null;

  return (
    `Sí manejamos *${label}*. Del catálogo 2026:\n\n${detail}` +
    `\n\nEl precio exacto te lo confirma nuestro equipo según invitados y nivel.`
  );
}

export function setDrivePdfSnapshotForTests(chunks: DrivePdfChunk[]): void {
  snapshot = {
    folderId: "test",
    files: [...new Map(chunks.map((c) => [c.fileId, { id: c.fileId, name: c.fileName }])).values()],
    chunks,
    status: {
      enabled: true,
      loaded: true,
      folderId: "test",
      fileCount: new Set(chunks.map((c) => c.fileId)).size,
      chunkCount: chunks.length,
      lastRefresh: new Date().toISOString(),
      lastError: null,
      files: [...new Set(chunks.map((c) => c.fileName))],
    },
  };
}

export function clearDrivePdfSnapshotForTests(): void {
  snapshot = null;
}

export async function refreshDrivePdfKnowledge(force = false): Promise<DrivePdfSnapshot | null> {
  const folderId = getDriveCatalogFolderId();
  if (!folderId) {
    snapshot = null;
    return null;
  }

  if (!force && refreshing) return refreshing;
  if (!force && snapshot?.status.loaded && snapshot.folderId === folderId) {
    return snapshot;
  }

  refreshing = (async () => {
    const status = emptyStatus(folderId);
    status.enabled = true;
    try {
      logger.info({ folderId }, "Drive PDF: listando carpeta");
      const files = await listPublicDrivePdfs(folderId);
      if (!files.length) {
        throw new Error("Carpeta Drive sin PDFs visibles (¿privada?)");
      }

      const chunks: DrivePdfChunk[] = [];
      const errors: string[] = [];

      await mapPool(files, DOWNLOAD_CONCURRENCY, async (file) => {
        try {
          const buf = await downloadDriveFile(file.id);
          const text = await extractPdfText(buf);
          const fileChunks = chunkText(text, file);
          chunks.push(...fileChunks);
          logger.info(
            { file: file.name, chars: text.length, chunks: fileChunks.length },
            "Drive PDF: indexado"
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${file.name}: ${msg}`);
          logger.warn({ file: file.name, err: msg }, "Drive PDF: fallo al indexar");
        }
      });

      if (!chunks.length) {
        throw new Error(errors[0] ?? "No se pudo extraer texto de ningún PDF");
      }

      status.loaded = true;
      status.fileCount = new Set(chunks.map((c) => c.fileId)).size;
      status.chunkCount = chunks.length;
      status.lastRefresh = new Date().toISOString();
      status.lastError = errors.length ? `${errors.length} PDF(s) fallaron` : null;
      status.files = [...new Set(chunks.map((c) => c.fileName))].sort();

      snapshot = { folderId, files, chunks, status };
      logger.info(
        { files: status.fileCount, chunks: status.chunkCount, errors: errors.length },
        "Drive PDF: índice listo"
      );
      return snapshot;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      status.lastError = msg;
      status.loaded = !!snapshot?.chunks.length;
      if (snapshot) {
        snapshot = { ...snapshot, status: { ...snapshot.status, lastError: msg } };
      } else {
        snapshot = { folderId, files: [], chunks: [], status };
      }
      logger.warn({ err: msg, folderId }, "Drive PDF: refresh falló");
      return snapshot;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

export async function bootstrapDrivePdfKnowledge(): Promise<void> {
  if (!getDriveCatalogFolderId()) {
    logger.info("Drive PDF RAG desactivado (sin folder ID)");
    return;
  }
  await refreshDrivePdfKnowledge(true);
}

export function startDrivePdfAutoRefresh(): void {
  if (refreshTimer) return;
  const minutes = Number(process.env["DRIVE_PDF_REFRESH_MINUTES"] ?? "60");
  const ms = Math.max(15, minutes) * 60_000;
  refreshTimer = setInterval(() => {
    void refreshDrivePdfKnowledge(true).catch(() => undefined);
  }, ms);
  if (typeof refreshTimer === "object" && "unref" in refreshTimer) {
    refreshTimer.unref();
  }
}
