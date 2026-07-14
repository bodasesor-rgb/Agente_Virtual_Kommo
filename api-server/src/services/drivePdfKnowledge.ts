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

/** Ficha aprendida: de qué trata cada PDF (resumen + temas). */
export interface DrivePdfCard {
  fileId: string;
  fileName: string;
  serviceLabel: string;
  about: string;
  topics: string[];
  charCount: number;
}

export interface DrivePdfStatus {
  enabled: boolean;
  loaded: boolean;
  folderId: string | null;
  fileCount: number;
  chunkCount: number;
  cardCount: number;
  lastRefresh: string | null;
  lastError: string | null;
  files: string[];
  /** Primeras fichas para diagnóstico. */
  learnedPreview?: string[];
}

interface DrivePdfSnapshot {
  folderId: string;
  files: DrivePdfFile[];
  chunks: DrivePdfChunk[];
  cards: DrivePdfCard[];
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
    cardCount: 0,
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

const TOPIC_PATTERNS: Array<{ topic: string; re: RegExp }> = [
  { topic: "menú", re: /\bmen[uú]s?\b/i },
  { topic: "niveles", re: /\b(b[aá]sico|premium|tradicional|nivel|paquete)\b/i },
  { topic: "entrada", re: /\bentradas?\b/i },
  { topic: "plato fuerte", re: /\b(plato\s+(fuerte|principal)|lomo|pollo|res)\b/i },
  { topic: "postre", re: /\bpostres?\b/i },
  { topic: "barra", re: /\bbarra\b/i },
  { topic: "chefs", re: /\bchefs?\b/i },
  { topic: "montaje", re: /\bmontaje\b/i },
  { topic: "bebidas", re: /\b(bebidas?|licores?|vino|cerveza|coctel|mixolog)\b/i },
  { topic: "mobiliario", re: /\b(mesas?|sillas?|mobiliario|periqueras?)\b/i },
  { topic: "pista", re: /\b(pista|tarima)\b/i },
  { topic: "audio", re: /\b(audio|dj|iluminaci|pantalla|video)\b/i },
  { topic: "dulces", re: /\b(dulces?|cupcakes?|postres?|helados?)\b/i },
  { topic: "corporativo", re: /\b(coffee\s*break|corporativ|junta|expo)\b/i },
  { topic: "kosher", re: /\bkosher\b/i },
  { topic: "infantil", re: /\b(infantil|ni[nñ]os?)\b/i },
];

/** Aprende una ficha compacta: de qué habla el PDF. */
export function buildDrivePdfCard(file: DrivePdfFile, fullText: string): DrivePdfCard {
  const label = serviceLabelFromPdfName(file.name);
  const cleaned = fullText.replace(/\s+/g, " ").trim();
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 280)
    .filter((s) => !/^https?:\/\//i.test(s));

  const labelTokens = normalizeSearch(label)
    .split(" ")
    .filter((w) => w.length >= 3);
  const scoreSentence = (s: string): number => {
    const n = normalizeSearch(s);
    let score = 0;
    for (const t of labelTokens) if (n.includes(t)) score += 3;
    if (/especialistas|experiencia|incluye|men[uú]|prepar|ofrecemos/i.test(s)) score += 1;
    if (s.length < 60) score -= 1;
    return score;
  };
  const preferred =
    [...sentences].sort((a, b) => scoreSentence(b) - scoreSentence(a))[0] ??
    cleaned.slice(0, 220);

  let about = preferred.replace(/\s+/g, " ").trim();
  const aboutNorm = normalizeSearch(about);
  const missingLabel = labelTokens.filter((t) => !aboutNorm.includes(t));
  if (missingLabel.length === labelTokens.length) {
    about = `${label}. ${about}`;
  }
  if (about.length > 220) about = `${about.slice(0, 217).trim()}…`;
  if (!about) about = `Catálogo ${label} Bodasesor 2026.`;

  const topics = TOPIC_PATTERNS.filter((t) => t.re.test(cleaned))
    .map((t) => t.topic)
    .slice(0, 6);

  // Palabras distintivas del label
  for (const w of normalizeSearch(label).split(" ").filter((x) => x.length >= 4)) {
    if (!topics.includes(w)) topics.unshift(w);
  }

  return {
    fileId: file.id,
    fileName: file.name,
    serviceLabel: label,
    about: stripPriceClaims(about),
    topics: [...new Set(topics)].slice(0, 8),
    charCount: cleaned.length,
  };
}

export function getDrivePdfCards(): DrivePdfCard[] {
  return snapshot?.cards ?? [];
}

/** Busca fichas (de qué trata) por query — no el texto completo. */
export function searchDrivePdfCards(query: string, limit = 5): DrivePdfCard[] {
  if (!snapshot?.cards.length) return [];
  const tokens = tokenizeQuery(query);
  const queryNorm = normalizeSearch(query);
  if (!tokens.length && !queryNorm) return snapshot.cards.slice(0, limit);

  const ranked = snapshot.cards
    .map((card) => {
      const hay = normalizeSearch(`${card.serviceLabel} ${card.fileName} ${card.about} ${card.topics.join(" ")}`);
      let score = 0;
      for (const t of tokens) {
        if (normalizeSearch(card.serviceLabel).includes(t)) score += 10;
        if (hay.includes(t)) score += 3;
        if (card.topics.some((tp) => normalizeSearch(tp).includes(t))) score += 4;
      }
      for (const hint of [
        "banquete",
        "taquiza",
        "sushi",
        "coffee",
        "pizza",
        "parrillada",
        "desayuno",
        "canapes",
        "bebidas",
        "paella",
        "pista",
        "mobiliario",
      ]) {
        if (queryNorm.includes(hint) && hay.includes(hint)) score += 12;
      }
      return { card, score };
    })
    .filter((r) => r.score >= 6)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit).map((r) => r.card);
}

/**
 * Mapa aprendido: todos los PDFs que Lucy conoce y de qué hablan.
 * compact=true → solo nombres (recomendaciones vagas).
 */
export function formatDrivePdfLearnedCatalogForPrompt(opts?: {
  query?: string;
  compact?: boolean;
  maxItems?: number;
}): string | null {
  if (!snapshot?.cards.length) return null;
  const maxItems = opts?.maxItems ?? (opts?.compact ? 24 : 16);
  const query = opts?.query?.trim();

  let cards = snapshot.cards;
  if (query && tokenizeQuery(query).length) {
    const matched = searchDrivePdfCards(query, maxItems);
    cards = matched.length ? matched : cards;
  }

  cards = [...cards].sort((a, b) => a.serviceLabel.localeCompare(b.serviceLabel, "es"));
  cards = cards.slice(0, maxItems);

  if (opts?.compact) {
    const names = cards.map((c) => c.serviceLabel).join(", ");
    return [
      "CATÁLOGO APRENDIDO (PDFs Drive — servicios que conoces):",
      names,
      "Si el cliente pide opciones, sugiere 2–4 relevantes al tipo de evento. Detalle fino solo del PDF/Sheet del servicio elegido.",
      "NO cites precios de los PDF.",
    ].join("\n");
  }

  const lines = cards.map(
    (c) => `• *${c.serviceLabel}* — ${c.about}${c.topics.length ? ` [temas: ${c.topics.slice(0, 4).join(", ")}]` : ""}`
  );
  return [
    "FICHAS APRENDIDAS DE PDFs (sabes de qué habla cada uno):",
    ...lines,
    "Usa estas fichas para orientar. Para detalle de menú, usa los chunks del PDF del servicio. Precios SOLO del Sheet.",
  ].join("\n");
}

/** True si conviene inyectar el mapa aprendido (pregunta vaga / recomendaciones). */
export function shouldInjectLearnedPdfCatalog(message?: string): boolean {
  if (!message?.trim() || !snapshot?.cards.length) return false;
  if (searchDrivePdfChunks(message, 1).length > 0) return false; // ya hay detalle puntual
  return (
    /qu[eé]\s+(servicios|opciones|tienen|ofrecen|manejan)|cat[aá]logo|recomiend|suger|opciones|ideas\s+de\s+comida|qu[eé]\s+me\s+recomiend/i.test(
      message
    ) ||
    /\b(comida|alimentos?|catering)\b/i.test(message)
  );
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

  const card = snapshot?.cards.find((c) => c.fileId === chunk.fileId);
  const aboutNorm = card ? normalizeSearch(card.about) : "";
  const topicsNorm = card ? normalizeSearch(card.topics.join(" ")) : "";

  for (const t of tokens) {
    if (labelNorm.includes(t)) score += 8;
    if (fileNorm.includes(t)) score += 6;
    if (aboutNorm.includes(t)) score += 5;
    if (topicsNorm.includes(t)) score += 4;
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
  return searchDrivePdfChunks(query, 1).length > 0 || searchDrivePdfCards(query, 1).length > 0;
}

/** Bloque para el prompt GPT — menús/descripciones; precios censurados. */
export function formatDrivePdfKnowledgeForPrompt(query: string): string | null {
  const cards = searchDrivePdfCards(query, 2);
  const chunks = searchDrivePdfChunks(query);
  if (!chunks.length && !cards.length) return null;

  const parts: string[] = [
    "CONOCIMIENTO PDF (Google Drive — menús / inclusiones / descripción):",
    "Usa este texto para describir el servicio. NO cites precios del PDF: los precios salen SOLO del Google Sheet o los confirma el equipo.",
  ];

  if (cards.length) {
    parts.push(
      "Ficha(s) del servicio:",
      ...cards.map((c) => `• *${c.serviceLabel}* — ${c.about}`)
    );
  }

  let used = parts.join("\n").length;
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

export function setDrivePdfSnapshotForTests(chunks: DrivePdfChunk[], cards?: DrivePdfCard[]): void {
  const inferredCards =
    cards ??
    [...new Map(chunks.map((c) => [c.fileId, c])).values()].map((c) =>
      buildDrivePdfCard({ id: c.fileId, name: c.fileName }, c.text)
    );
  snapshot = {
    folderId: "test",
    files: [...new Map(chunks.map((c) => [c.fileId, { id: c.fileId, name: c.fileName }])).values()],
    chunks,
    cards: inferredCards,
    status: {
      enabled: true,
      loaded: true,
      folderId: "test",
      fileCount: new Set(chunks.map((c) => c.fileId)).size,
      chunkCount: chunks.length,
      cardCount: inferredCards.length,
      lastRefresh: new Date().toISOString(),
      lastError: null,
      files: [...new Set(chunks.map((c) => c.fileName))],
      learnedPreview: inferredCards.slice(0, 5).map((c) => `${c.serviceLabel}: ${c.about.slice(0, 80)}`),
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
      const cards: DrivePdfCard[] = [];
      const errors: string[] = [];

      await mapPool(files, DOWNLOAD_CONCURRENCY, async (file) => {
        try {
          const buf = await downloadDriveFile(file.id);
          const text = await extractPdfText(buf);
          const fileChunks = chunkText(text, file);
          const card = buildDrivePdfCard(file, text);
          chunks.push(...fileChunks);
          cards.push(card);
          logger.info(
            {
              file: file.name,
              chars: text.length,
              chunks: fileChunks.length,
              about: card.about.slice(0, 100),
            },
            "Drive PDF: aprendido e indexado"
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
      status.cardCount = cards.length;
      status.lastRefresh = new Date().toISOString();
      status.lastError = errors.length ? `${errors.length} PDF(s) fallaron` : null;
      status.files = [...new Set(chunks.map((c) => c.fileName))].sort();
      status.learnedPreview = cards
        .slice(0, 8)
        .map((c) => `${c.serviceLabel}: ${c.about.slice(0, 90)}`);

      snapshot = { folderId, files, chunks, cards, status };
      logger.info(
        {
          files: status.fileCount,
          chunks: status.chunkCount,
          cards: status.cardCount,
          errors: errors.length,
        },
        "Drive PDF: índice + fichas aprendidas listas"
      );
      return snapshot;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      status.lastError = msg;
      status.loaded = !!snapshot?.chunks.length;
      if (snapshot) {
        snapshot = { ...snapshot, status: { ...snapshot.status, lastError: msg } };
      } else {
        snapshot = { folderId, files: [], chunks: [], cards: [], status };
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
