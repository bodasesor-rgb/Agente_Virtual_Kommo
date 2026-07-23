/**
 * Caché en memoria del material PDF del panel Aprendizaje.
 * Sirve para: (1) permitir precios reales de PDFs en el price-guard,
 * (2) armar respuestas cortas cuando el Sheet no tiene tarifa (pista/mobiliario),
 * (3) inclusiones/detalle de paquetes cuando el Sheet no trae "Que Incluye".
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type LucyInfoCacheDoc = {
  title: string;
  content: string;
  kind?: string;
};

type LucyInfoCacheState = {
  docs: LucyInfoCacheDoc[];
  corpusFold: string;
};

/** globalThis evita estado vacío si el bundler duplicara el módulo. */
function cacheState(): LucyInfoCacheState {
  const g = globalThis as typeof globalThis & { __lucyInfoPriceCache?: LucyInfoCacheState };
  if (!g.__lucyInfoPriceCache) {
    g.__lucyInfoPriceCache = { docs: [], corpusFold: "" };
  }
  return g.__lucyInfoPriceCache;
}

function fold(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n");
}

export function refreshLucyInfoPriceCache(input: LucyInfoCacheDoc[]): void {
  const state = cacheState();
  state.docs = (input || [])
    .filter((d) => d?.content?.trim())
    .map((d) => ({
      title: (d.title || "").trim() || "Catálogo",
      content: d.content.trim(),
      kind: d.kind,
    }));
  state.corpusFold = fold(state.docs.map((d) => `${d.title}\n${d.content}`).join("\n\n"));
}

export function getLucyInfoCachedDocs(): LucyInfoCacheDoc[] {
  return cacheState().docs.slice();
}

export function lucyInfoCacheReady(): boolean {
  return cacheState().docs.length > 0;
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
  const { corpusFold } = cacheState();
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
    "incluye",
    "incluir",
    "incluiria",
    "detalle",
    "descripcion",
    "descripciones",
    "cada",
    "nivel",
    "niveles",
    "paquete",
    "paquetes",
    "dime",
    "cual",
    "cuales",
    "trae",
    "lleva",
    "menu",
    "opcion",
    "opciones",
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw.split(/\s+/)) {
    if (t.length < 3 || stop.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  // Números de nivel tipo "5", "3" (coffee break 5 / 3 tiempos) — útiles como ancla.
  for (const t of raw.split(/\s+/)) {
    if (/^\d{1,2}$/.test(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, 40);
}

/** Anclas típicas de paquetes/niveles dentro de un PDF de catálogo. */
function findInclusionSection(content: string, query: string, maxChars = 1100): string | null {
  if (!content?.trim()) return null;
  const q = fold(query);
  const c = content;
  const f = fold(c);

  const anchors: string[] = [];
  // Coffee Break N
  const cb = q.match(/coffee\s*break\s*(\d)/);
  if (cb) {
    anchors.unshift(`coffee break ${cb[1]} —`, `coffee break ${cb[1]}`, `cb${cb[1]}`);
  }
  if (/gourmet con sandwich|sandwich/.test(q) && /coffee|break/.test(q)) {
    anchors.push("coffee break 5", "gourmet con sandwich");
  }
  // Banquete N tiempos + nivel
  const tiempos = q.match(/(\d)\s*tiempos?/);
  const nivel = /\bpremium\b/.test(q)
    ? "premium"
    : /\bbasic|\bb[aá]sic/.test(q)
      ? "basico"
      : /\btradicional\b/.test(q)
        ? "tradicional"
        : "";
  if (tiempos && /banquete|formal|mexicano/.test(q)) {
    anchors.push(`menu ${tiempos[1]} tiempos ${nivel}`.trim());
    anchors.push(`${tiempos[1]} tiempos ${nivel}`.trim());
    if (nivel === "tradicional" && tiempos[1] === "3") {
      // Ancla al bloque Tradicional (no al Básico que aparece antes en el mismo apartado).
      anchors.unshift("tradicional $830 por persona", "tradicional $830");
    }
    if (nivel === "tradicional" && tiempos[1] === "4") {
      anchors.unshift("tradicional $880 por persona", "tradicional $880");
    }
    if (nivel === "basico" && tiempos[1] === "3") {
      anchors.unshift("basico $780 por persona", "basico $780");
    }
    if (nivel === "premium" && tiempos[1] === "3") {
      anchors.unshift("premium $880 por persona", "premium $880");
    }
  }
  if (/banquete/.test(q) && nivel) {
    anchors.push(`tradicional $830`, `basico $780`, `premium $880`);
  }

  // Tokens fuertes del query como ancla
  for (const tok of tokenize(query)) {
    if (tok.length >= 4) anchors.push(tok);
  }

  let bestIdx = -1;
  let bestScore = -1;
  for (const a of anchors) {
    const fa = fold(a);
    if (fa.length < 2) continue;
    let from = 0;
    while (from < f.length) {
      const i = f.indexOf(fa, from);
      if (i < 0) break;
      let score = fa.length;
      // Preferir coincidencias cerca de "incluye", bebidas, alimentos, meseros.
      const window = f.slice(Math.max(0, i - 40), i + 200);
      if (/incluye|bebidas|alimentos|meseros|vajilla|persona/.test(window)) score += 40;
      if (/coffee break \d|menu \d tiempos|tradicional \$\d|basico \$\d|premium \$\d/.test(window)) {
        score += 30;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
      from = i + fa.length;
    }
  }

  if (bestIdx < 0) {
    // Fallback: primer bloque con $ cerca del inicio del doc si el título ya matcheó.
    const dollar = c.search(/\$\s*\d/);
    if (dollar < 0) return null;
    bestIdx = dollar;
  }

  // Retroceder poco solo si no empezamos en el nombre del paquete/nivel.
  const atHeading =
    /coffee break \d|tradicional \$\d|basico \$\d|premium \$\d|menu \d tiempos/i.test(
      f.slice(bestIdx, bestIdx + 48),
    );
  let start = atHeading ? bestIdx : Math.max(0, bestIdx - 40);
  // Avanzar al siguiente límite razonable
  let end = Math.min(c.length, start + maxChars);
  // Preferir cortar en un límite de paquete siguiente (Coffee Break N+1, Premium $, etc.)
  const tail = c.slice(Math.max(start, bestIdx) + 40, end);
  const nextPkg = tail.search(
    /Coffee Break \d|Men[uú] \d tiempos|B[aá]sico \$\s*\d|Tradicional \$\s*\d|Premium \$\s*\d|Ideal para:|Condiciones del Servicio/i,
  );
  // Don't cut too early — only if we find another package heading after enough content
  if (nextPkg > 200) {
    end = Math.max(start, bestIdx) + 40 + nextPkg;
  }

  let slice = c.slice(start, end).replace(/\s+/g, " ").trim();
  // Quitar basura previa al título del paquete si quedó cortado.
  slice = slice.replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9🥐☕🍽*•]+/, "");
  if (slice.length < 80) return null;
  return slice.slice(0, maxChars);
}

/**
 * Respuesta de inclusiones/detalle desde PDFs del panel Aprendizaje.
 * Se usa cuando el Sheet no trae "Que Incluye" pero el PDF sí describe el paquete.
 */
export function buildLucyInfoInclusionReply(query: string, maxChars = 1100): string | null {
  ensureCacheFromSeedSync();
  const docs = cacheState().docs;
  if (!docs.length || !query?.trim()) return null;
  const tokens = tokenize(query);
  if (!tokens.length) return null;

  const ranked = [...docs]
    .map((d) => ({ d, s: scoreDoc(d, tokens) }))
    .filter((x) => x.s >= 6)
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return null;

  // Preferir docs cuyo título matchee el servicio (coffee, banquete, taquiza…).
  const serviceHints = ["coffee", "banquete", "taquiza", "sushi", "paella", "pozole", "pista", "sala", "barra"];
  const qf = fold(query);
  const preferred = ranked.filter((x) => {
    const title = fold(x.d.title);
    return serviceHints.some((h) => qf.includes(h) && title.includes(h));
  });
  const pool = preferred.length ? preferred : ranked;

  for (const { d } of pool.slice(0, 4)) {
    const section = findInclusionSection(d.content, query, maxChars);
    if (!section) continue;
    const label = d.title.replace(/[-_]+/g, " ").replace(/\s+2026.*$/i, "").trim();
    return (
      `Según el catálogo que ya tenemos de *${label}*:\n\n` +
      `${section}\n\n` +
      `¿Te late este nivel o quieres que te detalle otro?`
    );
  }
  return null;
}

/** Si la caché está vacía (carrera al arranque), carga el seed JSON de forma síncrona. */
function ensureCacheFromSeedSync(): void {
  if (cacheState().docs.length > 0) return;
  try {
    let moduleDir = "";
    try {
      moduleDir = dirname(fileURLToPath(import.meta.url));
    } catch {
      /* ignore */
    }
    let argvDir = "";
    try {
      const entry = process.argv[1];
      if (entry) argvDir = dirname(entry);
    } catch {
      /* ignore */
    }
    const here =
      (typeof __dirname === "string" && __dirname) || moduleDir || argvDir || process.cwd();
    const candidates = [
      process.env["LUCY_INFO_SEED_PATH"]?.trim(),
      join(here, "config", "lucy-info-seed.json"),
      join(here, "lucy-info-seed.json"),
      join(here, "data", "lucy-info-seed.json"),
      join(moduleDir, "config", "lucy-info-seed.json"),
      join(moduleDir, "lucy-info-seed.json"),
      join(argvDir, "lucy-info-seed.json"),
      join(argvDir, "config", "lucy-info-seed.json"),
      join(process.cwd(), "config", "lucy-info-seed.json"),
      join(process.cwd(), "lucy-info-seed.json"),
      join(process.cwd(), "data", "lucy-info-seed.json"),
      join(process.cwd(), "api-server", "config", "lucy-info-seed.json"),
      join(process.cwd(), "api-server", "dist", "lucy-info-seed.json"),
      join(process.cwd(), "deploy", "lucy-info-seed.json"),
    ].filter(Boolean) as string[];
    for (const p of candidates) {
      if (!existsSync(p)) continue;
      const raw = JSON.parse(readFileSync(p, "utf8")) as {
        documents?: LucyInfoCacheDoc[];
      };
      const docs = (raw.documents || []).filter((d) => d?.content?.trim());
      if (docs.length) {
        refreshLucyInfoPriceCache(docs);
        return;
      }
    }
  } catch {
    /* ignore */
  }
}

/** Ventanas de texto con precio (los PDFs a veces vienen en un solo párrafo). */
function extractPriceWindows(content: string, max = 8): string[] {
  const windows: string[] = [];
  const re = /.{0,55}\$\s*[\d,.]+.{0,55}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content || "")) && windows.length < max) {
    const w = m[0]!.replace(/\s+/g, " ").trim();
    if (w.length > 12) windows.push(w);
  }
  if (windows.length) return windows;
  // Fallback por líneas
  return (content || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8 && /\$\s*\d/.test(l))
    .slice(0, max);
}

/** Líneas con precio del PDF más relevante a la pregunta. */
export function buildLucyInfoPriceSnippet(query: string, maxChars = 520): string | null {
  const docs = cacheState().docs;
  if (!docs.length || !query?.trim()) return null;
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  const ranked = [...docs]
    .map((d) => ({ d, s: scoreDoc(d, tokens) }))
    .filter((x) => x.s >= 8)
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return null;

  const top = ranked[0]!.d;
  const windows = extractPriceWindows(top.content, 10);

  const scored = windows
    .map((l) => {
      const f = fold(l);
      let s = 0;
      for (const tok of tokens) if (f.includes(tok)) s += 3;
      if (/\$\s*\d/.test(l)) s += 1;
      return { l, s };
    })
    .sort((a, b) => b.s - a.s);

  const picked = (scored.some((x) => x.s > 1) ? scored.filter((x) => x.s > 1) : scored)
    .map((x) => x.l)
    .slice(0, 5);
  if (!picked.length) return null;
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
