/**
 * Caché en memoria del material PDF del panel Aprendizaje.
 * Sirve para: (1) permitir precios reales de PDFs en el price-guard,
 * (2) armar respuestas cortas cuando el Sheet no tiene tarifa (pista/mobiliario).
 */

export type LucyInfoCacheDoc = {
  title: string;
  content: string;
  kind?: string;
};

let docs: LucyInfoCacheDoc[] = [];
let corpusFold = "";

function fold(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n");
}

export function refreshLucyInfoPriceCache(input: LucyInfoCacheDoc[]): void {
  docs = (input || [])
    .filter((d) => d?.content?.trim())
    .map((d) => ({
      title: (d.title || "").trim() || "Catálogo",
      content: d.content.trim(),
      kind: d.kind,
    }));
  corpusFold = fold(docs.map((d) => `${d.title}\n${d.content}`).join("\n\n"));
}

export function getLucyInfoCachedDocs(): LucyInfoCacheDoc[] {
  return docs.slice();
}

export function lucyInfoCacheReady(): boolean {
  return docs.length > 0;
}

/** Extrae montos normalizados ($3,650 → 3650). */
export function extractPriceAmounts(text: string): string[] {
  const out: string[] = [];
  const re = /\$\s*([\d]{1,3}(?:,[\d]{3})*(?:\.\d+)?|[\d]+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ""))) {
    const raw = m[1]!.replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 10) continue;
    out.push(String(Math.round(n)));
  }
  return out;
}

/** True si los $ del mensaje aparecen en los PDFs aprendidos (no son inventados). */
export function lucyInfoSupportsPriceClaim(mensaje: string): boolean {
  if (!corpusFold || !mensaje?.trim()) return false;
  const amounts = extractPriceAmounts(mensaje);
  if (!amounts.length) return false;
  let hits = 0;
  for (const a of amounts) {
    if (corpusFold.includes(a)) hits += 1;
    else if (a.length >= 4 && corpusFold.includes(a.replace(/(\d)(?=(\d{3})+$)/g, "$1,"))) hits += 1;
  }
  // Al menos 1 monto del mensaje debe existir en el corpus PDF.
  return hits >= 1 && hits >= Math.ceil(amounts.length * 0.4);
}

function scoreDoc(doc: LucyInfoCacheDoc, tokens: string[]): number {
  if (!tokens.length) return 0;
  const title = fold(doc.title);
  const body = fold(doc.content);
  let s = 0;
  for (const tok of tokens) {
    if (title.includes(tok)) s += 14;
    if (body.slice(0, 900).includes(tok)) s += 5;
    else if (body.includes(tok)) s += 1;
  }
  return s;
}

function tokenize(text: string): string[] {
  const raw = fold(text).replace(/[^a-z0-9\s]/g, " ");
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
    "precio",
    "precios",
    "cuanto",
    "cuesta",
    "costo",
    "persona",
    "personas",
    "quiero",
    "necesito",
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw.split(/\s+/)) {
    if (t.length < 3 || stop.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.slice(0, 30);
}

/** Líneas con precio del PDF más relevante a la pregunta. */
export function buildLucyInfoPriceSnippet(query: string, maxChars = 520): string | null {
  if (!docs.length || !query?.trim()) return null;
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  const ranked = [...docs]
    .map((d) => ({ d, s: scoreDoc(d, tokens) }))
    .filter((x) => x.s >= 12)
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return null;

  const top = ranked[0]!.d;
  const lines = top.content
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8 && /\$\s*\d/.test(l));

  // Prefer lines that mention query tokens.
  const scoredLines = lines
    .map((l) => {
      const f = fold(l);
      let s = 0;
      for (const tok of tokens) if (f.includes(tok)) s += 3;
      if (/\$\s*\d/.test(l)) s += 1;
      return { l, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  const picked = (scoredLines.length ? scoredLines.map((x) => x.l) : lines).slice(0, 6);
  if (!picked.length) {
    // Fallback: primeras líneas con $ del doc
    const any = lines.slice(0, 5);
    if (!any.length) return null;
    const body = any.join(" · ").slice(0, maxChars);
    return `*${top.title}*: ${body}`;
  }
  const body = picked.join(" · ").slice(0, maxChars);
  return `*${top.title}*: ${body}`;
}

/**
 * Respuesta corta con precios del PDF aprendido (cuando el Sheet no lista tarifa).
 * Null si no hay match útil.
 */
export function buildLucyInfoLearnedPriceReply(message: string): string | null {
  const snip = buildLucyInfoPriceSnippet(message);
  if (!snip) return null;
  const t = fold(message);
  let ask = "¿Lo agregamos a tu cotización?";
  if (/pista|tarima|baile/.test(t)) {
    ask = "¿Qué medidas aproximadas tiene el espacio?";
  } else if (/periquera|mesa|silla|sala|mobiliario|lounge|luxor/.test(t)) {
    ask = "¿Cuántas piezas necesitas y para cuándo?";
  }
  return `Según el catálogo que ya cargamos en Aprendizaje:\n${snip}\n${ask}`;
}
