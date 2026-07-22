import { db, lucyInfoDocuments, type LucyInfoDocumentRecord } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { ensureLucyInfoSchema } from "./lucyInfoSchema.js";

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
  if (kind) {
    return db
      .select()
      .from(lucyInfoDocuments)
      .where(eq(lucyInfoDocuments.kind, kind))
      .orderBy(desc(lucyInfoDocuments.updatedAt))
      .limit(capped);
  }
  return db
    .select()
    .from(lucyInfoDocuments)
    .orderBy(desc(lucyInfoDocuments.updatedAt))
    .limit(capped);
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
  return deleted.length > 0;
}

/** Texto plano para el system prompt de Lucy (recortado). */
export async function buildLucyInfoPromptBlock(opts?: {
  maxCatalogChars?: number;
  maxTipsChars?: number;
}): Promise<string> {
  await ensureLucyInfoSchema();
  const maxCatalog = opts?.maxCatalogChars ?? 7000;
  const maxTips = opts?.maxTipsChars ?? 4500;

  const docs = await listLucyInfoDocuments(undefined, 40);
  if (!docs.length) return "";

  const catalogParts: string[] = [];
  const tipParts: string[] = [];
  let catalogUsed = 0;
  let tipsUsed = 0;

  for (const doc of docs) {
    const header = `### ${doc.title}${doc.sourceFilename ? ` (${doc.sourceFilename})` : ""}`;
    const body = `${header}\n${doc.content}`.trim();
    if (doc.kind === "tips") {
      if (tipsUsed >= maxTips) continue;
      const slice = body.slice(0, Math.max(0, maxTips - tipsUsed));
      tipParts.push(slice);
      tipsUsed += slice.length + 2;
    } else {
      if (catalogUsed >= maxCatalog) continue;
      const slice = body.slice(0, Math.max(0, maxCatalog - catalogUsed));
      catalogParts.push(slice);
      catalogUsed += slice.length + 2;
    }
  }

  if (!catalogParts.length && !tipParts.length) return "";

  const sections: string[] = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "INFORMACIÓN MANUAL PARA LUCY (panel Aprendizaje → Información para Lucy)",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "Usa este material para conocer mejor catálogos/servicios y dar consejos naturales (tendencias, modas, tipologías).",
    "NO inventes precios ni inclusiones fuera del Sheet + este texto. Si el Sheet y este texto chocan en precio, gana el Sheet.",
    "No copies bloques enteros: resume con naturalidad y ofrece lo relevante al cliente.",
  ];

  if (catalogParts.length) {
    sections.push("", "—— Catálogos y detalle de servicios ——", ...catalogParts);
  }
  if (tipParts.length) {
    sections.push("", "—— Tendencias, modas y consejos ——", ...tipParts);
  }

  return sections.join("\n");
}
