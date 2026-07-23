import { db, lucyInfoDocuments, type LucyInfoDocumentRecord } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureLucyInfoSchema } from "./lucyInfoSchema.js";
import { refreshLucyInfoPriceCache } from "./lucyInfoPriceCache.js";
import { logger } from "../lib/logger.js";

export type LucyInfoKind = "catalog" | "tips";

function normalizeKind(kind: string | undefined): LucyInfoKind {
  return kind === "tips" ? "tips" : "catalog";
}

function normalizeTitle(title: string | undefined, kind: LucyInfoKind, filename?: string | null): string {
  const t = title?.trim();
  if (t) return t.slice(0, 200);
  if (filename?.trim()) return filename.trim().replace(/\.pdf$/i, "").slice(0, 200);
  return kind === "tips" ? "Tendencias y consejos" : "Catálogo / servicio";
}

function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function listLucyInfoDocuments(
  kind?: LucyInfoKind,
  limit = 50,
): Promise<LucyInfoDocumentRecord[]> {
  await ensureLucyInfoSchema();
  const capped = Math.min(Math.max(limit, 1), 100);
  const rows = kind
    ? await db
        .select()
        .from(lucyInfoDocuments)
        .where(eq(lucyInfoDocuments.kind, kind))
        .orderBy(desc(lucyInfoDocuments.updatedAt))
        .limit(capped)
    : await db
        .select()
        .from(lucyInfoDocuments)
        .orderBy(desc(lucyInfoDocuments.updatedAt))
        .limit(capped);
  // Mantener caché de precios PDF para el price-guard (no inventados si están del panel).
  if (!kind || kind === "catalog") {
    refreshLucyInfoPriceCache(
      rows
        .filter((r) => r.kind !== "tips")
        .map((r) => ({ title: r.title, content: r.content, kind: r.kind })),
    );
  }
  return rows;
}

export async function getLucyInfoStats(): Promise<{
  catalog: number;
  tips: number;
  total: number;
}> {
  await ensureLucyInfoSchema();
  const rows = await db
    .select({
      kind: lucyInfoDocuments.kind,
      count: sql<number>`count(*)::int`,
    })
    .from(lucyInfoDocuments)
    .groupBy(lucyInfoDocuments.kind);

  let catalog = 0;
  let tips = 0;
  for (const row of rows) {
    const n = Number(row.count) || 0;
    if (row.kind === "tips") tips = n;
    else catalog += n;
  }
  return { catalog, tips, total: catalog + tips };
}

export async function createLucyInfoDocument(input: {
  kind?: string;
  title?: string;
  content: string;
  sourceFilename?: string | null;
}): Promise<LucyInfoDocumentRecord> {
  await ensureLucyInfoSchema();
  const kind = normalizeKind(input.kind);
  const content = normalizeContent(input.content);
  if (!content) {
    throw new Error("content_required");
  }
  if (content.length > 200_000) {
    throw new Error("content_too_large");
  }
  const title = normalizeTitle(input.title, kind, input.sourceFilename);
  const [row] = await db
    .insert(lucyInfoDocuments)
    .values({
      kind,
      title,
      content,
      sourceFilename: input.sourceFilename?.trim() || null,
      updatedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("insert_failed");
  // Refresco best-effort del índice de precios aprendidos.
  void listLucyInfoDocuments(undefined, 100).catch(() => undefined);
  return row;
}

export async function updateLucyInfoDocument(
  id: string,
  input: { title?: string; content?: string },
): Promise<LucyInfoDocumentRecord | null> {
  await ensureLucyInfoSchema();
  const patch: Partial<typeof lucyInfoDocuments.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error("title_required");
    patch.title = t.slice(0, 200);
  }
  if (input.content !== undefined) {
    const content = normalizeContent(input.content);
    if (!content) throw new Error("content_required");
    if (content.length > 200_000) throw new Error("content_too_large");
    patch.content = content;
  }
  const [row] = await db
    .update(lucyInfoDocuments)
    .set(patch)
    .where(eq(lucyInfoDocuments.id, id))
    .returning();
  return row ?? null;
}

export async function deleteLucyInfoDocument(id: string): Promise<boolean> {
  await ensureLucyInfoSchema();
  const deleted = await db
    .delete(lucyInfoDocuments)
    .where(eq(lucyInfoDocuments.id, id))
    .returning({ id: lucyInfoDocuments.id });
  if (deleted.length > 0) {
    void listLucyInfoDocuments(undefined, 100).catch(() => undefined);
  }
  return deleted.length > 0;
}

function foldLucyInfoText(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n");
}

/** Tokens útiles para rankear PDFs según la pregunta del cliente. */
export function tokenizeLucyInfoQuery(text: string): string[] {
  const raw = foldLucyInfoText(text).replace(/[^a-z0-9\s]/g, " ");
  const stop = new Set([
    "de",
    "del",
    "la",
    "el",
    "los",
    "las",
    "un",
    "una",
    "y",
    "o",
    "en",
    "para",
    "por",
    "con",
    "que",
    "me",
    "mi",
    "tu",
    "su",
    "al",
    "es",
    "son",
    "hay",
    "tiene",
    "tienen",
    "quiero",
    "queria",
    "necesito",
    "busco",
    "hola",
    "buenas",
    "buen",
    "dia",
    "dias",
    "tarde",
    "noches",
    "info",
    "informacion",
    "precio",
    "precios",
    "costo",
    "cuanto",
    "como",
    "persona",
    "personas",
    "invitados",
    "evento",
    "eventos",
    "servicio",
    "servicios",
    "bodasesor",
    "lucy",
    "pdf",
    "catalogo",
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw.split(/\s+/)) {
    if (t.length < 3 || stop.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.slice(0, 40);
}

function scoreLucyInfoDoc(
  doc: Pick<LucyInfoDocumentRecord, "title" | "content" | "sourceFilename" | "kind">,
  tokens: string[],
): number {
  if (!tokens.length) return 0;
  const title = foldLucyInfoText(`${doc.title} ${doc.sourceFilename || ""}`);
  const body = foldLucyInfoText(doc.content);
  let score = 0;
  for (const tok of tokens) {
    if (title.includes(tok)) score += 12;
    // Coincidencia fuerte en primeras líneas del PDF (título/resumen).
    if (body.slice(0, 800).includes(tok)) score += 4;
    else if (body.includes(tok)) score += 1;
  }
  if (doc.kind === "tips") score += 0.5;
  return score;
}

function formatDocBody(doc: LucyInfoDocumentRecord): string {
  const header = `### ${doc.title}${doc.sourceFilename ? ` (${doc.sourceFilename})` : ""}`;
  return `${header}\n${doc.content}`.trim();
}

/** Carga PDFs a la caché de precios (para guards de pista/mobiliario). */
export async function warmLucyInfoPriceCache(): Promise<number> {
  const docs = await listLucyInfoDocuments(undefined, 100);
  return docs.filter((d) => d.kind !== "tips").length;
}

function resolveLucyInfoSeedPath(): string | null {
  const candidates = [
    process.env["LUCY_INFO_SEED_PATH"]?.trim(),
    join(process.cwd(), "config", "lucy-info-seed.json"),
    join(process.cwd(), "data", "lucy-info-seed.json"),
    join(process.cwd(), "lucy-info-seed.json"),
    join(process.cwd(), "dist", "config", "lucy-info-seed.json"),
    join(process.cwd(), "dist", "data", "lucy-info-seed.json"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Si la tabla está vacía (redeploy PGlite / DB nueva), restaura catálogos
 * desde data/lucy-info-seed.json. No sobrescribe docs existentes.
 */
export async function seedLucyInfoIfEmpty(): Promise<{ seeded: number; skipped: boolean }> {
  await ensureLucyInfoSchema();
  const stats = await getLucyInfoStats();
  if (stats.total > 0) {
    return { seeded: 0, skipped: true };
  }
  const seedPath = resolveLucyInfoSeedPath();
  if (!seedPath) {
    logger.warn("lucyInfo seed: tabla vacía y no hay lucy-info-seed.json");
    return { seeded: 0, skipped: false };
  }
  let payload: { documents?: Array<{ kind?: string; title?: string; content?: string; sourceFilename?: string | null }> };
  try {
    payload = JSON.parse(readFileSync(seedPath, "utf8")) as typeof payload;
  } catch (err) {
    logger.warn({ err, seedPath }, "lucyInfo seed: no se pudo leer JSON");
    return { seeded: 0, skipped: false };
  }
  const docs = payload.documents || [];
  let seeded = 0;
  for (const d of docs) {
    const content = normalizeContent(d.content || "");
    if (!content) continue;
    const kind = normalizeKind(d.kind);
    const title = normalizeTitle(d.title, kind, d.sourceFilename);
    try {
      await db.insert(lucyInfoDocuments).values({
        kind,
        title,
        content,
        sourceFilename: d.sourceFilename?.trim() || null,
        updatedAt: new Date(),
      });
      seeded += 1;
    } catch (err) {
      logger.warn({ err, title }, "lucyInfo seed: falló un documento");
    }
  }
  if (seeded > 0) {
    await warmLucyInfoPriceCache().catch(() => 0);
  }
  logger.info({ seeded, seedPath }, "lucyInfo seed: restaurados catálogos PDF");
  return { seeded, skipped: false };
}

/**
 * Texto plano para el system prompt de Lucy (recortado). Prioridad alta: va primero.
 * Con queryText: rankea PDFs por relevancia (no solo los más recientes).
 * Siempre incluye un índice de TODOS los títulos aprendidos (no se pierden al editar Lucy).
 */
export async function buildLucyInfoPromptBlock(opts?: {
  maxCatalogChars?: number;
  maxTipsChars?: number;
  queryText?: string;
}): Promise<string> {
  await ensureLucyInfoSchema();
  // Presupuesto: varios PDFs relevantes + tips (el system prompt ya va primero).
  const maxCatalog = opts?.maxCatalogChars ?? 22_000;
  const maxTips = opts?.maxTipsChars ?? 6_000;

  const docs = await listLucyInfoDocuments(undefined, 100);
  if (!docs.length) return "";

  const tokens = tokenizeLucyInfoQuery(opts?.queryText || "");
  const catalogs = docs.filter((d) => d.kind !== "tips");
  const tips = docs.filter((d) => d.kind === "tips");

  const rankedCatalogs = [...catalogs].sort((a, b) => {
    const sb = scoreLucyInfoDoc(b, tokens);
    const sa = scoreLucyInfoDoc(a, tokens);
    if (sb !== sa) return sb - sa;
    // Empate: más reciente primero (updatedAt ya viene en orden desc de list).
    return 0;
  });

  const rankedTips = [...tips].sort((a, b) => scoreLucyInfoDoc(b, tokens) - scoreLucyInfoDoc(a, tokens));

  const catalogParts: string[] = [];
  const tipParts: string[] = [];
  let catalogUsed = 0;
  let tipsUsed = 0;

  for (const doc of rankedCatalogs) {
    if (catalogUsed >= maxCatalog) break;
    const body = formatDocBody(doc);
    const slice = body.slice(0, Math.max(0, maxCatalog - catalogUsed));
    if (!slice) continue;
    catalogParts.push(slice);
    catalogUsed += slice.length + 2;
  }

  for (const doc of rankedTips) {
    if (tipsUsed >= maxTips) break;
    const body = formatDocBody(doc);
    const slice = body.slice(0, Math.max(0, maxTips - tipsUsed));
    if (!slice) continue;
    tipParts.push(slice);
    tipsUsed += slice.length + 2;
  }

  if (!catalogParts.length && !tipParts.length && !catalogs.length) return "";

  const indexLines = catalogs.map((d, i) => `${i + 1}. ${d.title}`).slice(0, 80);

  const sections: string[] = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "PRIORIDAD 1 — INFORMACIÓN MANUAL PARA LUCY (PDFs y tips del panel Aprendizaje)",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "LEE ESTO PRIMERO. Es el material que el equipo cargó para que ofrezcas servicios con conocimiento real (catálogos, inclusiones, tendencias).",
    "Estos PDFs viven en base de datos: editar el prompt de Lucy o redesplegar NO los borra. Solo se eliminan si alguien los borra a mano en Aprendizaje.",
    "Úsalo activamente al recomendar y explicar. Resume con naturalidad; no copies bloques enteros.",
    "Si este texto y el Sheet chocan en PRECIO, gana el Sheet. En descripción/inclusiones/estilo, prioriza este material.",
  ];

  if (indexLines.length) {
    sections.push(
      "",
      `—— Índice de catálogos ya aprendidos (${indexLines.length}) ——`,
      ...indexLines,
      "Si el cliente pregunta por uno del índice, ofrécelo con lo que tengas abajo (detalle completo de los más relevantes a esta conversación).",
    );
  }

  if (catalogParts.length) {
    sections.push("", "—— Detalle de catálogos relevantes a esta conversación ——", ...catalogParts);
  }
  if (tipParts.length) {
    sections.push("", "—— Tendencias, modas y consejos ——", ...tipParts);
  }

  return sections.join("\n");
}
