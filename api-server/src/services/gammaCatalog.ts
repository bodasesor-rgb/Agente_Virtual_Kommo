/**
 * Integración Gamma — metadatos + texto publicado/exportado.
 * La API REST de Gamma expone metadatos; el contenido completo se obtiene de:
 * - GAMMA_CATALOG_TEXT_URL (texto/markdown publicado)
 * - export API (PDF) → solo enlace de descarga en el bloque de catálogo
 */

export interface GammaCatalogResult {
  gammaId: string | null;
  title: string | null;
  gammaUrl: string | null;
  exportUrl: string | null;
  textBlock: string;
  fetchedAt: string;
}

const GAMMA_API_BASE = "https://public-api.gamma.app/v1.0";

function gammaApiKey(): string | null {
  const key = process.env["GAMMA_API_KEY"]?.trim();
  return key || null;
}

export function resolveGammaId(): string | null {
  const direct = process.env["GAMMA_CATALOG_GAMMA_ID"]?.trim();
  if (direct) return direct;

  const url = process.env["GAMMA_CATALOG_URL"]?.trim();
  if (!url) return null;

  const match = url.match(/gamma\.app\/docs\/[^/?#]+-([a-z0-9]+)/i);
  return match?.[1] ?? null;
}

export function resolveGammaPublicUrl(): string | null {
  return process.env["GAMMA_CATALOG_URL"]?.trim() || null;
}

async function fetchGammaMetadata(gammaId: string): Promise<{ title?: string; url?: string }> {
  const apiKey = gammaApiKey();
  if (!apiKey) return {};

  const res = await fetch(`${GAMMA_API_BASE}/gammas/${encodeURIComponent(gammaId)}`, {
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) return {};

  const data = (await res.json()) as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title : undefined;
  const url =
    typeof data.gammaUrl === "string"
      ? data.gammaUrl
      : typeof data.url === "string"
        ? data.url
        : undefined;

  return { title, url };
}

async function tryGammaExportUrl(gammaId: string): Promise<string | null> {
  const apiKey = gammaApiKey();
  if (!apiKey) return null;

  try {
    const res = await fetch(`${GAMMA_API_BASE}/gammas/${encodeURIComponent(gammaId)}/export`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ format: "pdf" }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { exportId?: string };
    if (!data.exportId) return null;

    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const poll = await fetch(`${GAMMA_API_BASE}/exports/${data.exportId}`, {
        headers: { "X-API-KEY": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!poll.ok) continue;
      const status = (await poll.json()) as { status?: string; exportUrl?: string };
      if (status.status === "completed" && status.exportUrl) return status.exportUrl;
      if (status.status === "failed") break;
    }
  } catch {
    return null;
  }

  return null;
}

async function fetchPublishedText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Lucy-Bodasesor-Catalog/1.0" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Gamma text URL HTTP ${res.status}`);
  return res.text();
}

export async function loadGammaCatalog(): Promise<GammaCatalogResult | null> {
  const gammaId = resolveGammaId();
  const publicUrl = resolveGammaPublicUrl();
  const textUrl = process.env["GAMMA_CATALOG_TEXT_URL"]?.trim();
  const staticExport = process.env["GAMMA_CATALOG_EXPORT_URL"]?.trim();

  if (!gammaId && !publicUrl && !textUrl && !staticExport) return null;

  const meta = gammaId ? await fetchGammaMetadata(gammaId) : {};
  const enableExport = process.env["GAMMA_ENABLE_EXPORT_API"]?.trim().toLowerCase() === "true";
  const exportUrl =
    staticExport || (gammaId && enableExport ? await tryGammaExportUrl(gammaId) : null);

  let publishedText = "";
  if (textUrl) {
    try {
      publishedText = await fetchPublishedText(textUrl).then((t) => t.trim());
    } catch {
      publishedText = "";
    }
  }

  const lines: string[] = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "CATÁLOGO VISUAL GAMMA",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
  ];

  if (meta.title) lines.push(`Título: ${meta.title}`, "");
  if (publicUrl || meta.url) {
    lines.push(`Enlace Gamma: ${publicUrl || meta.url}`, "");
  }
  if (exportUrl) {
    lines.push(`Export PDF Gamma: ${exportUrl}`, "");
  }
  if (publishedText) {
    lines.push("Contenido publicado:", "", publishedText);
  } else if (!exportUrl && !publicUrl) {
    lines.push(
      "Configura GAMMA_CATALOG_TEXT_URL o GAMMA_CATALOG_URL para que Lucy tenga el contenido visual."
    );
  }

  return {
    gammaId: gammaId ?? null,
    title: meta.title ?? null,
    gammaUrl: publicUrl || meta.url || null,
    exportUrl,
    textBlock: lines.join("\n").trim(),
    fetchedAt: new Date().toISOString(),
  };
}
