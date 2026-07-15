/**
 * Conocimiento de catálogos web (bodasesor.com/catalogos).
 * Las páginas son SPA con embeds Gamma; embeds.json mapea slug → Gamma.
 * Usamos título/descripción Gamma + URL pública como complemento cuando el Sheet
 * no trae inclusiones detalladas.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CATALOG_WEB_HUB = "https://bodasesor.com/catalogos";

export interface CatalogEmbedEntry {
  slug: string;
  title: string;
  embedSrc: string;
  gammaId: string | null;
  webUrl: string;
}

export interface CatalogWebKnowledgeEntry extends CatalogEmbedEntry {
  gammaTitle: string;
  gammaDescription: string;
}

let embedsCache: CatalogEmbedEntry[] | null = null;
let knowledgeCache: CatalogWebKnowledgeEntry[] = [];
let knowledgeBlockCache = "";

function embedsJsonPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../public/catalogos-light/embeds.json"),
    path.resolve(here, "../catalogos-light/embeds.json"),
    path.resolve(process.cwd(), "public/catalogos-light/embeds.json"),
    path.resolve(process.cwd(), "dist/catalogos-light/embeds.json"),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p, "utf8");
      return p;
    } catch {
      /* try next */
    }
  }
  return candidates[0]!;
}

function extractGammaIdFromEmbed(embedSrc: string): string | null {
  const m = embedSrc.match(/gamma\.app\/embed\/([a-z0-9]+)/i);
  return m?.[1] ?? null;
}

export function loadCatalogEmbeds(): CatalogEmbedEntry[] {
  if (embedsCache) return embedsCache;
  try {
    const raw = readFileSync(embedsJsonPath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, { title?: string; embedSrc?: string }>;
    embedsCache = Object.entries(parsed).map(([slug, v]) => {
      const embedSrc = (v.embedSrc ?? "").trim();
      return {
        slug,
        title: (v.title ?? slug).trim(),
        embedSrc,
        gammaId: extractGammaIdFromEmbed(embedSrc),
        webUrl: `${CATALOG_WEB_HUB}/${slug}`,
      };
    });
  } catch {
    embedsCache = [];
  }
  return embedsCache;
}

/** Resuelve slug de catálogo web desde query/servicio/URL. */
export function resolveCatalogWebSlug(query: string | null | undefined): string | null {
  if (!query?.trim()) return null;
  const t = query.trim().toLowerCase();

  const urlMatch = t.match(/bodasesor\.com\/catalogos\/([a-z0-9-]+)/i);
  if (urlMatch?.[1]) return urlMatch[1];

  const embeds = loadCatalogEmbeds();
  const exact = embeds.find((e) => e.slug === t.replace(/\s+/g, "-"));
  if (exact) return exact.slug;

  const norm = t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  let best: { slug: string; score: number } | null = null;
  for (const e of embeds) {
    const titleNorm = e.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const slugNorm = e.slug.replace(/-/g, " ");
    let score = 0;
    if (norm.includes(titleNorm) || titleNorm.includes(norm)) score += 5;
    if (norm.includes(slugNorm) || slugNorm.includes(norm)) score += 4;
    for (const tok of norm.split(" ").filter((w) => w.length > 3)) {
      if (titleNorm.includes(tok) || slugNorm.includes(tok)) score += 1;
    }
    if (!best || score > best.score) best = { slug: e.slug, score };
  }
  return best && best.score >= 4 ? best.slug : null;
}

export function getCatalogWebUrlForQuery(query: string | null | undefined): string | null {
  const slug = resolveCatalogWebSlug(query);
  return slug ? `${CATALOG_WEB_HUB}/${slug}` : null;
}

export function getCatalogEmbed(slug: string): CatalogEmbedEntry | null {
  return loadCatalogEmbeds().find((e) => e.slug === slug) ?? null;
}

async function fetchGammaMeta(
  gammaId: string,
  apiKey: string
): Promise<{ title: string; description: string }> {
  try {
    const res = await fetch(`https://public-api.gamma.app/v1.0/gammas/${encodeURIComponent(gammaId)}`, {
      headers: { "X-API-KEY": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { title: "", description: "" };
    const data = (await res.json()) as { title?: string; description?: string | null };
    return {
      title: typeof data.title === "string" ? data.title.trim() : "",
      description: typeof data.description === "string" ? data.description.trim() : "",
    };
  } catch {
    return { title: "", description: "" };
  }
}

/**
 * Refresca conocimiento de catálogos web (embeds + meta Gamma).
 * No envía links gamma.app al cliente; sí guarda títulos/descripciones.
 */
export async function refreshCatalogWebKnowledge(limit = 40): Promise<string> {
  const embeds = loadCatalogEmbeds();
  const apiKey = process.env["GAMMA_API_KEY"]?.trim() || "";
  const withGamma = embeds.filter((e) => e.gammaId).slice(0, limit);

  const entries: CatalogWebKnowledgeEntry[] = [];
  if (apiKey && withGamma.length) {
    const chunkSize = 8;
    for (let i = 0; i < withGamma.length; i += chunkSize) {
      const chunk = withGamma.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(async (e) => {
          const meta = await fetchGammaMeta(e.gammaId!, apiKey);
          return {
            ...e,
            gammaTitle: meta.title,
            gammaDescription: meta.description,
          };
        })
      );
      entries.push(...results);
    }
  } else {
    for (const e of embeds.slice(0, limit)) {
      entries.push({ ...e, gammaTitle: "", gammaDescription: "" });
    }
  }

  knowledgeCache = entries;

  const lines = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "CATÁLOGOS WEB BODASESOR (fuente completa de menús e inclusiones)",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "Fuente viva: https://bodasesor.com/catalogos/{slug}",
    "Reglas:",
    "- Si el Sheet no trae 'Que Incluye' o el detalle es pobre, USA esta lista + el catálogo web.",
    "- Explica niveles/menús con lo que sepas aquí; si falta detalle, ofrece el link de bodasesor.com (NO gamma.app).",
    "- Un link a la vez, solo cuando ayude o el cliente lo pida.",
    "",
  ];

  for (const e of entries) {
    lines.push(`## ${e.title}`);
    lines.push(`Slug: ${e.slug}`);
    lines.push(`URL cliente: ${e.webUrl}`);
    if (e.gammaTitle) lines.push(`Título catálogo: ${e.gammaTitle}`);
    if (e.gammaDescription) lines.push(e.gammaDescription);
    lines.push("");
  }

  knowledgeBlockCache = lines.join("\n").trim();
  return knowledgeBlockCache;
}

export function getCatalogWebKnowledgeBlock(): string {
  return knowledgeBlockCache;
}

export function getCatalogWebKnowledgeForQuery(query: string): CatalogWebKnowledgeEntry | null {
  const slug = resolveCatalogWebSlug(query);
  if (!slug) return null;
  return knowledgeCache.find((e) => e.slug === slug) ?? null;
}

/** Bloque corto para enriquecer oferta de niveles sin inclusiones en Sheet. */
export function buildCatalogWebDetailHint(query: string): string | null {
  const entry =
    getCatalogWebKnowledgeForQuery(query) ||
    (() => {
      const slug = resolveCatalogWebSlug(query);
      const embed = slug ? getCatalogEmbed(slug) : null;
      if (!embed) return null;
      return {
        ...embed,
        gammaTitle: "",
        gammaDescription: "",
      } satisfies CatalogWebKnowledgeEntry;
    })();

  if (!entry) return null;

  const parts: string[] = [];
  if (entry.gammaDescription) {
    parts.push(entry.gammaDescription.slice(0, 500));
  }
  parts.push(
    `El detalle completo de menús e inclusiones está en el catálogo: ${entry.webUrl}`
  );
  return parts.join("\n");
}

/** Solo tests. */
export function resetCatalogWebKnowledgeForTests(): void {
  embedsCache = null;
  knowledgeCache = [];
  knowledgeBlockCache = "";
}
