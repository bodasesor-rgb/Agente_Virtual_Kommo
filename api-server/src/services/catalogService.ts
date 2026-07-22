/**
 * Catálogo unificado para Lucy — Google Sheets + Gamma + fallback estático.
 */
import { CATALOGO_BODASESOR } from "../catalogo.js";
import {
  clientAsksPrice,
  mentionsListedPriceService,
  mentionsNoListedPriceService,
  messageClaimsPrice,
  setCatalogPriceIndex,
} from "../price-guard.js";
import {
  buildSheetsCsvUrl,
  buildSheetsTextCsvUrl,
  fetchCsvText,
  parseSheetCatalogCsv,
  sheetRowsToMarkdown,
  parseRowNotes,
  formatCatalogRowLabel,
  type SheetCatalogRow,
} from "./googleSheetsCatalog.js";
import { loadGammaCatalog, loadGammaKnowledgeFromSheet } from "./gammaCatalog.js";
import {
  refreshCatalogWebKnowledge,
  getCatalogWebKnowledgeBlock,
  buildCatalogWebDetailHint,
  getCatalogWebUrlForQuery,
} from "./catalogWebKnowledge.js";
import {
  clientMentionsCatering,
  clientAsksServiceInfo,
  parsePrimaryService,
  isServiceRelatedMessage,
} from "../conversation-understanding.js";
import {
  buildLevel2Ack,
  buildLevel3Ack,
  classifyServiceKnowledgeLevel,
} from "./serviceKnowledge.js";
import {
  registerSheetSynonyms,
  loadSinonimosJson,
  resolveServiceFocusFromText,
  synonymScoreForService,
} from "./serviceSynonyms.js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GENERIC_CATERING_MENU_MARKERS =
  /estas son las opciones m[aá]s pedidas|cu[aá]l te interesa\?\s*con eso te paso precios/i;

export interface CatalogStatus {
  loaded: boolean;
  lastRefresh: string | null;
  lastError: string | null;
  sources: {
    sheets: boolean;
    sheetsRows: number;
    sheetsUrl: string | null;
    gamma: boolean;
    gammaUrl: string | null;
    staticFallback: boolean;
  };
  pricedServicesCount: number;
  noPriceServicesCount: number;
}

export interface CatalogSnapshot {
  promptBlock: string;
  rows: SheetCatalogRow[];
  status: CatalogStatus;
}

const REFRESH_MS = Number(process.env["CATALOG_REFRESH_MINUTES"] ?? "10") * 60_000;

let snapshot: CatalogSnapshot | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let refreshing: Promise<CatalogSnapshot> | null = null;

function emptyStatus(): CatalogStatus {
  return {
    loaded: false,
    lastRefresh: null,
    lastError: null,
    sources: {
      sheets: false,
      sheetsRows: 0,
      sheetsUrl: null,
      gamma: false,
      gammaUrl: null,
      staticFallback: true,
    },
    pricedServicesCount: 0,
    noPriceServicesCount: 0,
  };
}

function applyPriceIndex(rows: SheetCatalogRow[]): void {
  const priced = rows.filter((r) => r.tienePrecio && r.precio).map((r) => r.servicio);
  const noPrice = rows.filter((r) => !r.tienePrecio || !r.precio).map((r) => r.servicio);
  setCatalogPriceIndex(priced, noPrice);
}

function buildPromptBlock(parts: {
  sheetsMd: string;
  sheetsTextCsv: string;
  gammaBlock: string;
  webCatalogBlock: string;
  useStatic: boolean;
}): string {
  const blocks: string[] = [];

  if (parts.sheetsMd) blocks.push(parts.sheetsMd);
  if (parts.sheetsTextCsv) {
    blocks.push(
      [
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "INFORMACIÓN ADICIONAL — GOOGLE SHEETS (texto)",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        parts.sheetsTextCsv,
      ].join("\n")
    );
  }
  if (parts.webCatalogBlock) blocks.push(parts.webCatalogBlock);
  if (parts.gammaBlock) blocks.push(parts.gammaBlock);

  if (!blocks.length && parts.useStatic) {
    return CATALOGO_BODASESOR;
  }

  if (parts.useStatic) {
    blocks.push(
      [
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "CATÁLOGO ESTÁTICO DE RESPALDO (usar solo si no contradice Sheets/Gamma)",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        CATALOGO_BODASESOR,
      ].join("\n")
    );
  }

  return blocks.join("\n\n");
}

export async function refreshCatalog(force = false): Promise<CatalogSnapshot> {
  if (refreshing && !force) return refreshing;

  refreshing = (async () => {
    const status = emptyStatus();
    let rows: SheetCatalogRow[] = [];
    let sheetsMd = "";
    let sheetsTextExtra = "";

    try {
      const sheetsUrl = buildSheetsCsvUrl();
      status.sources.sheetsUrl = sheetsUrl;

      if (sheetsUrl) {
        const csv = await fetchCsvText(sheetsUrl);
        rows = parseSheetCatalogCsv(csv);
        if (rows.length) {
          sheetsMd = sheetRowsToMarkdown(rows);
          status.sources.sheets = true;
          status.sources.sheetsRows = rows.length;
          registerSheetSynonyms(
            rows.map((r) => ({ servicio: r.servicio, sinonimos: r.sinonimos ?? null }))
          );
        }
      }

      tryLoadSinonimosJsonFile();

      const textUrl = buildSheetsTextCsvUrl();
      if (textUrl) {
        const textCsv = await fetchCsvText(textUrl);
        sheetsTextExtra = textCsv.trim().slice(0, 12_000);
      }

      let gammaBlock = "";
      try {
        const gamma = await loadGammaCatalog();
        if (gamma) {
          gammaBlock = gamma.textBlock;
          status.sources.gamma = true;
          status.sources.gammaUrl = gamma.gammaUrl;
        }
      } catch (gammaErr) {
        status.lastError =
          gammaErr instanceof Error ? gammaErr.message : String(gammaErr);
      }

      const sheetGammaKnowledge = await loadGammaKnowledgeFromSheet(rows).catch(() => "");
      if (sheetGammaKnowledge) {
        gammaBlock = [gammaBlock, sheetGammaKnowledge].filter(Boolean).join("\n\n");
        status.sources.gamma = true;
      }

      // Catálogos web (bodasesor.com/catalogos) — fuente completa de menús/inclusiones.
      const webCatalogBlock = await refreshCatalogWebKnowledge().catch(
        () => getCatalogWebKnowledgeBlock() || ""
      );
      if (webCatalogBlock) status.sources.gamma = status.sources.gamma || true;

      const useStatic = !status.sources.sheets;
      status.sources.staticFallback = useStatic;

      const promptBlock = buildPromptBlock({
        sheetsMd,
        sheetsTextCsv: sheetsTextExtra,
        gammaBlock,
        webCatalogBlock,
        useStatic,
      });

      applyPriceIndex(rows);
      status.loaded = true;
      status.lastRefresh = new Date().toISOString();
      status.pricedServicesCount = rows.filter((r) => r.tienePrecio && r.precio).length;
      status.noPriceServicesCount = rows.filter((r) => !r.tienePrecio || !r.precio).length;

      snapshot = { promptBlock, rows, status };
      return snapshot;
    } catch (err) {
      status.lastError = err instanceof Error ? err.message : String(err);
      status.sources.staticFallback = true;
      applyPriceIndex([]);
      snapshot = {
        promptBlock: CATALOGO_BODASESOR,
        rows: [],
        status: { ...status, loaded: true, lastRefresh: new Date().toISOString() },
      };
      return snapshot;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

export async function getCatalogPromptBlock(): Promise<string> {
  const now = Date.now();
  const stale =
    !snapshot?.status.lastRefresh ||
    now - new Date(snapshot.status.lastRefresh).getTime() > REFRESH_MS;

  if (!snapshot || stale) {
    await refreshCatalog();
  }

  return snapshot?.promptBlock ?? CATALOGO_BODASESOR;
}

export function getCatalogStatus(): CatalogStatus {
  return snapshot?.status ?? emptyStatus();
}

/** Solo para selftest — inyecta filas del catálogo sin red. */
export function setCatalogSnapshotForTests(rows: SheetCatalogRow[]): void {
  const status = emptyStatus();
  status.loaded = true;
  status.sources.sheets = true;
  status.sources.sheetsRows = rows.length;
  status.pricedServicesCount = rows.filter((r) => r.tienePrecio && r.precio).length;
  snapshot = { rows, promptBlock: "", status };
  applyPriceIndex(rows);
  registerSheetSynonyms(
    rows.map((r) => ({ servicio: r.servicio, sinonimos: r.sinonimos ?? null }))
  );
  tryLoadSinonimosJsonFile();
}

function tryLoadSinonimosJsonFile(): void {
  const candidates = [
    path.resolve(process.cwd(), "config/sinonimos.json"),
    path.resolve(process.cwd(), "data/sinonimos.json"),
    path.resolve(process.cwd(), "dist/data/sinonimos.json"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../config/sinonimos.json"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/sinonimos.json"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/sinonimos.json"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, "utf8"));
      const n = loadSinonimosJson(raw);
      if (n > 0) return;
    } catch {
      /* ignore */
    }
  }
}

export async function bootstrapCatalog(): Promise<CatalogSnapshot> {
  return refreshCatalog(true);
}

export function startCatalogAutoRefresh(): void {
  if (refreshTimer) return;

  refreshTimer = setInterval(() => {
    void refreshCatalog().catch(() => undefined);
  }, REFRESH_MS);
}

/** Compatibilidad síncrona — solo fallback estático antes del primer refresh. */
export function getCatalogPromptBlockSync(): string {
  return snapshot?.promptBlock ?? CATALOGO_BODASESOR;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    // A14947: "tres/cuatro tiempos" ≡ "3/4 tiempos" para Sheet.
    .replace(/\btres\s*tiempos\b/g, "3 tiempos")
    .replace(/\bcuatro\s*tiempos\b/g, "4 tiempos")
    .replace(/\bdos\s*tiempos\b/g, "2 tiempos")
    .trim();
}

function queryTokens(query: string): string[] {
  const stop =
    /^(cuanto|cuanta|cuesta|cuestan|precio|costo|sale|cobran|tarifa|persona|personas|por|para|una|uno|un|el|la|los|las|de|del|me|te|se|si|no|que|como|donde|cuando|con|incluye|trae|lleva)$/;
  const normalized = normalizeForMatch(query);
  const compounds: string[] = [];
  if (/\b4\s*tiempos\b/.test(normalized)) compounds.push("4tiempos");
  if (/\b3\s*tiempos\b/.test(normalized)) compounds.push("3tiempos");

  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .filter((t) => (t.length >= 3 || /^\d$/.test(t)) && !stop.test(t));

  if (/\bcatering\b/.test(normalized)) {
    tokens.push("banquete", "taquiza", "brunch", "coffee");
  }

  return [...new Set([...compounds, ...tokens])];
}

interface CatalogQueryFilters {
  banquete: boolean;
  taquiza: boolean;
  cuatroTiempos: boolean;
  tresTiempos: boolean;
  nivel: string | null;
}

function parseCatalogQueryFilters(query: string): CatalogQueryFilters {
  const t = normalizeForMatch(query);
  let nivel: string | null = null;
  if (/\bpremium\b/.test(t)) nivel = "Premium";
  else if (/\bbasic[ao]\b/.test(t)) nivel = "Basica";
  else if (/\btradicional\b/.test(t)) nivel = "Tradicional";
  else if (/\bsolo\s*alimentos\b/.test(t)) nivel = "Solo Alimentos";

  return {
    banquete: /\bbanquete\b/.test(t),
    taquiza: /\btaquiza\b/.test(t),
    cuatroTiempos: /\b4\s*tiempos\b/.test(t) || /\b4tiempos\b/.test(t),
    tresTiempos: /\b3\s*tiempos\b/.test(t) || /\b3tiempos\b/.test(t),
    nivel,
  };
}

function rowHaystack(row: SheetCatalogRow): string {
  return normalizeForMatch(`${row.categoria} ${row.servicio} ${row.nivel}`).replace(/\s+/g, " ");
}

function extractNivelLabel(row: SheetCatalogRow | string): string {
  if (typeof row === "string") {
    const match = row.match(/\(([^)]+)\)\s*$/);
    return match?.[1]?.trim() || row;
  }
  return row.nivel?.trim() || row.servicio.match(/\(([^)]+)\)\s*$/)?.[1]?.trim() || row.servicio;
}

const MACRO_CATEGORIES: ReadonlyArray<{
  label: string;
  queryPattern: RegExp;
  servicePattern: RegExp;
}> = [
  {
    label: "Alimentos",
    queryPattern: /^(alimentos?|comida|catering|men[uú]s?)$/i,
    servicePattern:
      /banquete|taquiza|brunch|coffee|barra(?! de bebida)|comida|desayuno|canap|bocadillo|parrillada|pizza|sushi|crepa|marisco|pasta|paella|pozole|mesa de|carrito|snak/i,
  },
  {
    label: "Bebidas",
    queryPattern: /^(bebidas?|barra\s+de\s+bebidas?)$/i,
    servicePattern: /barra de bebida|cocteler|mixolog|m[oó]ctel/i,
  },
  {
    label: "Barras temáticas",
    queryPattern: /^(barras?|barras?\s+tem[aá]ticas?)$/i,
    servicePattern: /^barra(?! de bebida)/i,
  },
  {
    label: "Mobiliario",
    queryPattern: /^mobiliario$/i,
    servicePattern: /mobiliario|silla/i,
  },
];

export type CatalogQueryKind = "category" | "service" | "service_nivel";

export interface CatalogMatchResult {
  kind: CatalogQueryKind;
  categoryLabel?: string;
  serviceName?: string;
  nivel?: string;
  rows: SheetCatalogRow[];
}

function uniqueServicios(rows: SheetCatalogRow[]): string[] {
  return [...new Set(rows.map((r) => r.servicio.trim()).filter(Boolean))].sort();
}

function uniqueNiveles(rows: SheetCatalogRow[]): string[] {
  return [...new Set(rows.map((r) => r.nivel.trim()).filter(Boolean))];
}

/** True si la fila del Sheet corresponde al servicio que el cliente pidió por nombre. */
export function rowMatchesServiceLabel(row: SheetCatalogRow, label: string): boolean {
  const normLabel = normalizeForMatch(label).replace(/\s+/g, "");
  const normSvc = normalizeForMatch(row.servicio).replace(/\s+/g, "");
  if (!normLabel || !normSvc) return false;
  if (normSvc.includes(normLabel) || normLabel.includes(normSvc)) return true;
  const labelTokens = normalizeForMatch(label).split(/\s+/).filter((t) => t.length >= 4);
  if (labelTokens.length >= 2) {
    return labelTokens.every((t) => normSvc.includes(t));
  }
  return normSvc.includes(normLabel);
}

/** Palabras clave del servicio en el texto del cliente (más fiable que alias CRM como "Banquete Formal"). */
function catalogKeywordsFromQuery(query: string): string[] {
  if (isVagueCatalogFoodQuery(query.trim())) return [];

  const q = normalizeForMatch(query);
  const keys: string[] = [];

  if (/\bparrillada\b/.test(q)) keys.push("parrillada");
  if (/\bargentina\b/.test(q) && keys.includes("parrillada")) keys.push("argentina");
  if (/\bbanquete\b/.test(q)) return ["banquete"];
  if (/\btaquiza\b/.test(q)) return ["taquiza"];
  // Barra específica: no devolver solo "barra" (A14934 Yucateca vs dump de todas).
  if (/\byucateca\b/.test(q)) return ["yucateca"];
  if (/\bamericana\b/.test(q) && /\bbarra\b/.test(q)) return ["americana"];
  if (keys.length) return keys;

  const requested = parsePrimaryService(query);
  if (!requested?.trim()) return [];
  return normalizeForMatch(requested)
    .split(/\s+/)
    .filter((t) => t.length >= 4);
}

function rowMatchesCatalogKeywords(row: SheetCatalogRow, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const hay = normalizeForMatch(row.servicio);
  return keywords.every((k) => hay.includes(k));
}

/** Filas del Sheet para el servicio pedido; null = pedido explícito pero no está en catálogo. */
function rowsForRequestedService(allRows: SheetCatalogRow[], query: string): SheetCatalogRow[] | null {
  if (isVagueCatalogFoodQuery(query.trim())) return allRows;

  const keywords = catalogKeywordsFromQuery(query);
  if (keywords.length) {
    const matched = allRows.filter((r) => rowMatchesCatalogKeywords(r, keywords));
    return matched.length ? matched : null;
  }

  const requested = parsePrimaryService(query);
  if (!requested) return allRows;
  const matched = allRows.filter((r) => rowMatchesServiceLabel(r, requested));
  return matched.length ? matched : null;
}

/** Evita sustituir el servicio pedido (ej. parrillada) por otro (ej. banquete) en la respuesta. */
export function catalogAnswerMatchesRequestedService(query: string, answer: string): boolean {
  const keywords = catalogKeywordsFromQuery(query);
  if (!keywords.length) return true;
  const norm = normalizeForMatch(answer);
  return keywords.every((k) => norm.includes(k));
}

function catalogResultMatchesRequestedService(
  query: string,
  result: CatalogMatchResult | null
): boolean {
  const keywords = catalogKeywordsFromQuery(query);
  if (!keywords.length || !result) return true;
  return result.rows.some((r) => rowMatchesCatalogKeywords(r, keywords));
}

function isVagueCatalogFoodQuery(query: string): boolean {
  const q = normalizeForMatch(query.trim());
  return /^(comida|alimentos?|men[uú]s?|desayuno|catering)$/.test(q);
}

function matchesSpecificServicioInQuery(query: string, rows: SheetCatalogRow[]): boolean {
  const q = normalizeForMatch(query);
  if (isVagueCatalogFoodQuery(query)) return false;
  for (const svc of uniqueServicios(rows)) {
    const normSvc = normalizeForMatch(svc);
    if (q === normSvc || q.includes(normSvc)) return true;
    if (normSvc.includes(q) && q.length >= 4) return true;
    const svcTokens = normSvc.split(/\s+/).filter((t) => t.length >= 4);
    if (svcTokens.some((t) => q.includes(t))) return true;
  }
  if (/\b(banquete|taquiza|barra de|coffee break|brunch|parrillada)\b/.test(q)) return true;
  return false;
}

function detectMacroCategoryQuery(
  query: string
): { label: string; servicePattern: RegExp } | null {
  const trimmed = query.trim();
  for (const cat of MACRO_CATEGORIES) {
    if (cat.queryPattern.test(trimmed)) return { label: cat.label, servicePattern: cat.servicePattern };
  }
  const q = normalizeForMatch(query);
  if (/^alimentos?$/.test(q) || q === "comida" || q === "catering") {
    return { label: "Alimentos", servicePattern: MACRO_CATEGORIES[0]!.servicePattern };
  }
  return null;
}

function matchesNivelFilter(row: SheetCatalogRow, filters: CatalogQueryFilters, query: string): boolean {
  const nivelHay = normalizeForMatch(row.nivel || extractNivelLabel(row.servicio));
  const svcHay = normalizeForMatch(row.servicio);
  if (filters.nivel) {
    const want = normalizeForMatch(filters.nivel);
    if (nivelHay.includes(want) || want.includes(nivelHay)) return true;
  }
  if (filters.cuatroTiempos && /\b4\s*tiempos\b/.test(svcHay)) return true;
  if (filters.tresTiempos && /\b3\s*tiempos\b/.test(svcHay)) return true;
  const q = normalizeForMatch(query);
  if (/\bpremium\b/.test(q) && /\bpremium\b/.test(nivelHay)) return true;
  if (/\bbasic[ao]\b/.test(q) && /\bbasic[ao]\b/.test(nivelHay)) return true;
  if (/\btradicional\b/.test(q) && /\btradicional\b/.test(nivelHay)) return true;
  return false;
}

function simplifyServiceNamesForList(servicios: string[]): string[] {
  const out = new Set<string>();
  for (const svc of servicios) {
    if (/^banquete\b/i.test(svc) && !/kosher|mexicano|navide/i.test(svc)) {
      if (/\b3\s*tiempos\b/i.test(svc)) out.add("banquete 3 tiempos");
      else if (/\b4\s*tiempos\b/i.test(svc)) out.add("banquete 4 tiempos");
      else out.add(svc);
    } else {
      out.add(svc);
    }
  }
  return [...out];
}

export function resolveCatalogQuery(query: string): CatalogMatchResult | null {
  if (!snapshot?.rows.length) return null;
  const allRows = snapshot.rows;
  const trimmed = query.trim();
  if (!trimmed) return null;

  const macro = detectMacroCategoryQuery(trimmed);
  if (macro && !matchesSpecificServicioInQuery(trimmed, allRows)) {
    const catRows = allRows.filter((r) => macro.servicePattern.test(r.servicio));
    if (catRows.length) {
      return { kind: "category", categoryLabel: macro.label, rows: catRows };
    }
  }

  const serviceScoped = rowsForRequestedService(allRows, trimmed);
  if (serviceScoped === null) return null;
  const rows = serviceScoped;

  const tokens = queryTokens(query);
  if (!tokens.length) return null;

  const filters = parseCatalogQueryFilters(query);
  const scored = rows
    .map((row) => ({ row, score: scoreCatalogRow(row, tokens, filters, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  const top = scored[0]!.score;
  const minScore = filters.nivel || filters.cuatroTiempos || filters.tresTiempos ? top - 1 : top - 3;
  let matchedRows = scored.filter((item) => item.score >= minScore).map((item) => item.row);

  const hasNivelFilter = !!(filters.nivel || filters.cuatroTiempos || filters.tresTiempos || /\bpremium\b|\bbasic[ao]\b|\btradicional\b/i.test(query));
  if (hasNivelFilter) {
    const nivelRows = matchedRows.filter((r) => matchesNivelFilter(r, filters, query));
    if (nivelRows.length) matchedRows = nivelRows;
  }

  const servicios = uniqueServicios(matchedRows);
  if (!servicios.length) return null;

  if (hasNivelFilter && matchedRows.length === 1) {
    const row = matchedRows[0]!;
    return {
      kind: "service_nivel",
      serviceName: row.servicio,
      nivel: row.nivel,
      rows: [row],
    };
  }

  if (servicios.length === 1) {
    const svc = servicios[0]!;
    const svcRows = matchedRows.filter((r) => r.servicio === svc);
    const niveles = uniqueNiveles(svcRows);
    if (niveles.length > 1 && !hasNivelFilter) {
      return { kind: "service", serviceName: svc, rows: svcRows };
    }
    if (svcRows.length === 1) {
      return {
        kind: "service_nivel",
        serviceName: svc,
        nivel: svcRows[0]!.nivel,
        rows: svcRows,
      };
    }
    return { kind: "service", serviceName: svc, rows: svcRows };
  }

  const q = normalizeForMatch(query);
  if (/\bbanquete\b/.test(q)) {
    return { kind: "service", serviceName: "Banquete", rows: matchedRows };
  }
  // Solo colapsar a "Barra" multi-variante si NO hay subtipo concreto (A14934).
  if (
    /\bbarra\b/.test(q) &&
    !/\bbarra de bebida/.test(q) &&
    !/\b(yucateca|americana|crepas?|mariscos?|paninis?|pastas?|sushi|poke|caf[eé])\b/.test(q)
  ) {
    return { kind: "service", serviceName: "Barra", rows: matchedRows };
  }

  return { kind: "service", serviceName: servicios[0], rows: matchedRows };
}

function buildCategoryServicesAnswer(result: CatalogMatchResult): string {
  const label = result.categoryLabel ?? "esa categoría";
  const servicios = simplifyServiceNamesForList(uniqueServicios(result.rows));
  const list = servicios.slice(0, 10).join(", ");
  return `Para *${label.toLowerCase()}* tenemos: ${list}. ¿Cuál te interesa?`;
}

/** Pregunta legacy (aún válida si el cliente afirma); el link ya se manda con el detalle. */
export const CATALOG_OFFER_QUESTION = "¿Quieres que te mande el catálogo con más detalle?";

/**
 * Asegura URL de catálogo en el mensaje (servicio del Sheet o hub).
 * Política V8.34: al explicar servicio/precio/inclusiones, SIEMPRE va el link.
 */
export function ensureCatalogWebLink(
  text: string,
  query?: string | null
): string {
  const body = text.trim();
  if (!body) return body;
  if (/bodasesor\.com\/catalogos|hostingersite\.com\/catalogos/i.test(body)) {
    return body;
  }
  const q = (query ?? "").trim();
  const match = q
    ? resolveCatalogWebLink(q)
    : { url: null as string | null, serviceName: null as string | null, kind: "missing" as const };
  const embedUrl = q ? getCatalogWebUrlForQuery(q) : null;
  const url = match.url || embedUrl || null;
  if (url) {
    const label = match.serviceName ? ` de *${match.serviceName}*` : "";
    return `${body}\n\nCatálogo${label}:\n${toDeliverableCatalogUrl(url)}`;
  }
  return `${body}\n\nCatálogo:\n${getCatalogWebHubDeliveryUrl()}`;
}

/**
 * True si el texto ya trae detalle real del Sheet (niveles / Incluye / precio),
 * no solo un link de catálogo ni el fallback genérico.
 */
export function messageHasSheetServiceDetail(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text;
  // Fallback vacío ("detalle… está en el catálogo" + URL) ≠ detalle Sheet.
  if (
    /detalle de lo que incluye cada nivel est[aá] en el cat[aá]logo/i.test(t) &&
    !/\$\s*\d/.test(t) &&
    !/incluye\s*:\s*\S.{7,}/i.test(t)
  ) {
    return false;
  }
  if (/incluye\s*:\s*\S.{7,}/i.test(t) && !/el\s+equipo\s+lo\s+confirma/i.test(t)) return true;
  if (/qu[eé]\s+incluye\s+cada\s+nivel\s*:/i.test(t)) return true;
  if (/manejamos estos niveles/i.test(t)) return true;
  if (/\*precio:\*/i.test(t) && /manejamos/i.test(t)) return true;
  if (
    /\$\s*\d/.test(t) &&
    /\b(b[aá]sic|tradicional|premium|solo alimentos)\b/i.test(t) &&
    /\b(nivel|manejamos|pp|\/pp|por persona)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Mejor detalle disponible del Sheet para un servicio (niveles + incluye + precio + link).
 * Usar en primer turno, food-sales, info y cuando el ACK genérico no alcanza.
 * No usa el fallback genérico de inclusiones (hub sin datos).
 */
export function attachAvailableSheetDetail(
  query: string,
  serviceHint?: string | null
): string | null {
  const attempts = [
    serviceHint?.trim() || null,
    query.trim() || null,
    [serviceHint, query].filter(Boolean).join(" ").trim() || null,
  ].filter((a): a is string => !!a);

  for (const a of attempts) {
    const candidates = [
      buildCatalogServiceDetailAnswer(a),
      buildCatalogPriceAnswer(a),
      buildCatalogInclusionAnswer(a),
      buildInclusionTeamConfirmationAnswer(a),
    ].filter((d): d is string => !!d);

    for (const detail of candidates) {
      if (
        /detalle de lo que incluye cada nivel est[aá] en el cat[aá]logo/i.test(detail) &&
        !/\$\s*\d/.test(detail) &&
        !/incluye\s*:\s*\S.{7,}/i.test(detail)
      ) {
        continue;
      }
      if (
        messageHasSheetServiceDetail(detail) ||
        (/\$\s*\d/.test(detail) &&
          /\b(nivel|Basico|Básico|Premium|Tradicional|manejamos|pp)\b/i.test(detail))
      ) {
        return ensureCatalogWebLink(detail, a);
      }
    }
  }
  return null;
}

function withCatalogOfferQuestion(text: string, query?: string | null): string {
  const body = text.trim();
  if (!body) return body;
  return ensureCatalogWebLink(body, query);
}

/**
 * Oferta de niveles con detalle de inclusiones (y precio si hay en Sheet).
 * El cliente no puede elegir "Tradicional vs Premium" sin saber qué incluye cada una.
 */
function buildServiceNivelChoiceAnswer(result: CatalogMatchResult): string {
  const svc = result.serviceName ?? uniqueServicios(result.rows)[0] ?? "ese servicio";
  const svcRows = result.rows.filter((r) => r.servicio === svc || result.rows.length <= 6);
  const rowsForChoice = (svcRows.length ? svcRows : result.rows).slice(0, 6);
  const niveles = uniqueNiveles(rowsForChoice);

  if (niveles.length <= 1) {
    const row = (svcRows[0] ?? result.rows[0])!;
    return buildExactRowDetailAnswer(row);
  }

  if (uniqueServicios(result.rows).length > 1) {
    // Si el servicio pedido es concreto (Barra Yucateca), no listar hermanas (A14934).
    const svcOnly = result.rows.filter(
      (r) => normalizeForMatch(r.servicio) === normalizeForMatch(svc) || rowMatchesServiceLabel(r, svc)
    );
    if (svcOnly.length && uniqueServicios(svcOnly).length === 1) {
      const nivelesOnly = uniqueNiveles(svcOnly);
      if (nivelesOnly.length > 1) {
        const lines = nivelesOnly.slice(0, 6).map((n, i) => {
          const row = svcOnly.find(
            (r) => normalizeForMatch(extractNivelLabel(r)) === normalizeForMatch(n)
          );
          const incl = row ? getInclusionFromRow(row) : null;
          const price =
            row?.tienePrecio && row.precio
              ? ` — ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}`
              : "";
          const inclTxt = incl ? `: ${incl.slice(0, 120)}` : "";
          return `${i + 1}. *${n}*${price}${inclTxt}`;
        });
        return withCatalogOfferQuestion(
          `Para *${svc}* manejamos estos niveles:\n${lines.join("\n")}\n\n¿Cuál nivel prefieres?`,
          svc
        );
      }
    }
    const variants = simplifyServiceNamesForList(uniqueServicios(result.rows)).slice(0, 8).join(", ");
    const inclusionBlock = buildInclusionBlock(rowsForChoice, 180).trim();
    const detail = inclusionBlock
      ? `${inclusionBlock}\n\n`
      : `Niveles disponibles: ${niveles
          .slice(0, 6)
          .map((n) => `*${n}*`)
          .join(", ")}.\n\n`;
    return withCatalogOfferQuestion(
      `Manejamos *${svc}* en varias opciones: ${variants}. ${detail}¿Cuál variante y nivel prefieres?`,
      svc
    );
  }

  const lines = niveles.slice(0, 6).map((n, i) => {
    const row = rowsForChoice.find(
      (r) => normalizeForMatch(extractNivelLabel(r)) === normalizeForMatch(n)
    );
    const incl = row ? getInclusionFromRow(row) : null;
    const price =
      row?.tienePrecio && row.precio
        ? ` — ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}`
        : "";
    if (incl) {
      const clipped = incl.length > 220 ? `${incl.slice(0, 217)}…` : incl;
      return `${i + 1}. *${n}*${price}\n   Incluye: ${clipped}`;
    }
    // Sin texto de Incluye en Sheet: no inventar "el equipo confirma" en cada nivel (A14932).
    return `${i + 1}. *${n}*${price}`;
  });

  const hasAnyIncl = rowsForChoice.some((r) => !!getInclusionFromRow(r));
  const footer = hasAnyIncl
    ? "¿Cuál nivel prefieres para tu evento?"
    : "¿Cuál nivel prefieres? Te paso el catálogo con el detalle de lo que incluye cada uno.";

  let body = `Para *${svc}* manejamos estos niveles:\n\n${lines.join("\n")}\n\n${footer}`;

  // Si el Sheet no trae (o trae poco) Incluye, complementar con catálogo web bodasesor.com.
  if (!hasAnyIncl || rowsForChoice.filter((r) => getInclusionFromRow(r)).length < niveles.length) {
    const webHint = buildCatalogWebDetailHint(svc) ?? buildCatalogWebDetailHint(result.serviceName ?? svc);
    const webUrl =
      getCatalogWebUrlForQuery(svc) ??
      getCatalogWebUrlForQuery(result.serviceName ?? "") ??
      resolveCatalogWebLink(svc).url ??
      resolveCatalogWebLink(result.serviceName ?? svc).url;
    if (webHint) {
      body += `\n\n${webHint}`;
    } else if (webUrl) {
      body += `\n\nEl detalle completo de menús e inclusiones está en el catálogo:\n${toDeliverableCatalogUrl(webUrl)}`;
    } else {
      body += `\n\nCatálogo general:\n${getCatalogWebHubDeliveryUrl()}`;
    }
  }

  // Siempre incluir link del servicio (V8.34 — no solo pregunta opt-in).
  return withCatalogOfferQuestion(body, svc);
}

/** Detecta oferta de niveles solo con nombres/precios (sin explicar Incluye). */
export function messageOffersLevelsWithoutInclusions(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  // "Incluye: el equipo lo confirma…" NO es detalle real (A14932 Paola).
  const hasIncluyeLine = /incluye\s*:/i.test(t);
  const hasTeamPlaceholder = /el\s+equipo\s+lo\s+confirma/i.test(t);
  const hasRealInclusionLine = t.split(/\n/).some(
    (line) =>
      /incluye\s*:/i.test(line) &&
      !/el\s+equipo\s+lo\s+confirma/i.test(line) &&
      /incluye\s*:\s*\S.{7,}/i.test(line)
  );
  const onlyTeamPlaceholder = hasIncluyeLine && hasTeamPlaceholder && !hasRealInclusionLine;
  // Tiene "Incluye: …" real del Sheet → ya está bien.
  if (hasIncluyeLine && !onlyTeamPlaceholder) return false;
  // "el equipo confirma lo que incluye" NO cuenta como descripción real.
  const mentionsTriad =
    /\bb[aá]sic/i.test(t) && /\btradicional\b/i.test(t) && /\bpremium\b/i.test(t);
  return (
    onlyTeamPlaceholder ||
    /(?:tres|varios|estos)?\s*niveles?\s*:/i.test(t) ||
    /lo tenemos en:\s*\*?b[aá]sic/i.test(t) ||
    (/1\.\s*\*?b[aá]sic/i.test(t) && /2\.\s*\*?tradicional/i.test(t)) ||
    (/\*b[aá]sica?\*.*\*tradicional\*.*\*premium\*/i.test(t) && /prefieres|nivel/i.test(t)) ||
    // "Básica $150, Tradicional $220, Premium $320 ¿cuál prefieres?"
    (mentionsTriad &&
      (/\$\s*\d|\d+\s*(pesos|mxn)|precio/i.test(t) || /prefieres|nivel|opci[oó]n/i.test(t))) ||
    (mentionsTriad && /confirma\s+(nuestro\s+)?equipo|el\s+equipo\s+te\s+confirma/i.test(t))
  );
}

/** Si GPT listó niveles sin inclusiones, reemplaza con detalle del Sheet. */
export function enrichBareNivelOffer(
  mensaje: string,
  serviceHint?: string | null
): string | null {
  if (!messageOffersLevelsWithoutInclusions(mensaje)) return null;
  const hint = (serviceHint?.trim() || mensaje).slice(0, 400);
  const detail = buildCatalogServiceDetailAnswer(hint);
  if (!detail || messageOffersLevelsWithoutInclusions(detail)) return null;
  if (!/incluye|nivel/i.test(detail)) return null;
  return detail;
}

function buildExactRowDetailAnswer(row: SheetCatalogRow): string {
  const label = formatCatalogRowLabel(row);
  const parsed = parseRowNotes(row.notas);
  const price =
    row.tienePrecio && row.precio
      ? `*Precio:* ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${parsed.minimo ? ` (mín. ${parsed.minimo})` : ""}`
      : "";
  const inclusion = parsed.inclusion ? `\n\n*Incluye:* ${parsed.inclusion}` : "";
  return withCatalogOfferQuestion(
    `Sí, manejamos *${label}*.${price ? `\n${price}` : ""}${inclusion}`.trim(),
    row.servicio
  );
}

function buildExactRowPriceAnswer(row: SheetCatalogRow): string {
  const label = formatCatalogRowLabel(row);
  const parsed = parseRowNotes(row.notas);
  const unit = row.unidad ? ` ${row.unidad}` : "";
  const min = parsed.minimo ? ` (mín. ${parsed.minimo})` : "";
  const inclusion = parsed.inclusion ? `\n\n*Incluye:* ${parsed.inclusion}` : "";
  return ensureCatalogWebLink(
    `*${label}* — ${row.precio}${unit}${min}${inclusion}`,
    row.servicio
  );
}

/** Etiqueta servicio+nivel para CRM/resumen cuando el texto del cliente matchea el catálogo. */
export function formatRequerimientoLabelFromQuery(query: string): string | null {
  const resolved = resolveCatalogQuery(query);
  if (!resolved) return null;
  if (resolved.kind === "category") return null;
  if (resolved.kind === "service_nivel" && resolved.rows[0]) {
    return formatCatalogRowLabel(resolved.rows[0]);
  }
  if (resolved.rows.length === 1) {
    return formatCatalogRowLabel(resolved.rows[0]!);
  }
  if (resolved.serviceName && resolved.kind === "service") {
    const niveles = uniqueNiveles(resolved.rows);
    if (niveles.length === 1 && resolved.rows[0]) {
      return formatCatalogRowLabel(resolved.rows[0]);
    }
    return resolved.serviceName;
  }
  return null;
}

function scoreCatalogRow(
  row: SheetCatalogRow,
  tokens: string[],
  filters: CatalogQueryFilters,
  query: string
): number {
  const haystack = rowHaystack(row).replace(/\s+/g, "");
  let score = 0;
  const vagueFood = isVagueCatalogFoodQuery(query);

  for (const token of tokens) {
    const tok = token.replace(/\s+/g, "");
    // "comida" suelta NUNCA puntúa Comida Corrida (A14943 Marco: corporativo ≠ corrida).
    if (tok === "comida" && /comidacorrida/.test(haystack) && !/\bcomida\s+corrida\b/i.test(query)) {
      continue;
    }
    if (vagueFood && tok === "comida" && /comidacorrida/.test(haystack)) continue;
    if (haystack.includes(tok)) score += 2;
  }

  if (filters.banquete && /\bbanquete\b/.test(rowHaystack(row))) score += 4;
  if (filters.banquete && /\btaquiza\b/.test(rowHaystack(row))) score -= 12;
  if (filters.taquiza && /\btaquiza\b/.test(rowHaystack(row))) score += 4;
  if (filters.taquiza && /\bbanquete\b/.test(rowHaystack(row))) score -= 12;

  if (filters.cuatroTiempos) {
    if (/\b4\s*tiempos\b/.test(rowHaystack(row))) score += 6;
    if (/\b3\s*tiempos\b/.test(rowHaystack(row))) score -= 8;
  }
  if (filters.tresTiempos) {
    if (/\b3\s*tiempos\b/.test(rowHaystack(row))) score += 6;
    if (/\b4\s*tiempos\b/.test(rowHaystack(row))) score -= 8;
  }

  if (filters.nivel) {
    const nivelHay = normalizeForMatch(row.nivel || extractNivelLabel(row.servicio));
    if (nivelHay === normalizeForMatch(filters.nivel) || nivelHay.includes(normalizeForMatch(filters.nivel))) {
      score += 8;
    } else {
      score -= 4;
    }
  }

  const hay = rowHaystack(row);
  const q = normalizeForMatch(query);
  const keywords = catalogKeywordsFromQuery(query);
  if (keywords.length) {
    if (rowMatchesCatalogKeywords(row, keywords)) score += 12;
    else if (keywords.includes("parrillada") && /\bbanquete\b/.test(hay) && !/parrillada/.test(hay)) {
      score -= 20;
    } else if (keywords.includes("banquete") && /parrillada/.test(hay) && !/banquete/.test(hay)) {
      score -= 20;
    } else {
      score -= 8;
    }
  }
  if (!/\bmexicano\b/.test(q) && /\bmexicano\b/.test(hay)) score -= 6;
  if (!/\bkosher\b/.test(q) && /\bkosher\b/.test(hay)) score -= 6;
  if (!/\bnavide/.test(q) && /\bnavide/.test(hay)) score -= 6;

  return score;
}

function rankCatalogMatches(
  query: string,
  rows: SheetCatalogRow[],
  requirePrice = false
): SheetCatalogRow[] {
  const resolved = resolveCatalogQuery(query);
  if (!resolved) return [];
  if (resolved.kind === "category") return [];
  const filtered = requirePrice
    ? resolved.rows.filter((r) => r.tienePrecio && r.precio)
    : resolved.rows;
  return filtered;
}

/** Busca filas del Sheet que coincidan con la pregunta del cliente. */
export function lookupCatalogPrices(query: string): SheetCatalogRow[] {
  if (!snapshot?.rows.length) return [];
  return rankCatalogMatches(query, snapshot.rows, true);
}

/** Busca servicios del Sheet (con o sin precio). */
export function lookupCatalogServices(query: string): SheetCatalogRow[] {
  if (!snapshot?.rows.length) return [];
  return rankCatalogMatches(query, snapshot.rows, false);
}

function buildInclusionBlock(rows: SheetCatalogRow[], maxPerLevel = 220): string {
  const inclusionByLevel = rows.map((row) => ({
    nivel: extractNivelLabel(row),
    inclusion: getInclusionFromRow(row),
  }));

  const uniqueTexts = [...new Set(inclusionByLevel.map((r) => r.inclusion).filter(Boolean))];
  if (!uniqueTexts.length) return "";

  if (uniqueTexts.length === 1) {
    return `\n\n*Incluye:* ${uniqueTexts[0]}`;
  }

  const lines = inclusionByLevel
    .filter((r) => r.inclusion)
    .slice(0, 5)
    .map(
      (r) =>
        `• *${r.nivel}:* ${r.inclusion!.slice(0, maxPerLevel)}${r.inclusion!.length > maxPerLevel ? "…" : ""}`
    );

  return lines.length ? `\n\n*Qué incluye cada nivel:*\n${lines.join("\n")}` : "";
}

function getInclusionFromRow(row: SheetCatalogRow): string | null {
  const text = parseRowNotes(row.notas).inclusion?.trim();
  return text || null;
}

function resolvedHasInclusionData(resolved: CatalogMatchResult): boolean {
  return resolved.rows.some((r) => !!getInclusionFromRow(r));
}

function inclusionLabelForResolved(resolved: CatalogMatchResult): string {
  if (resolved.kind === "service_nivel" && resolved.rows[0]) {
    return formatCatalogRowLabel(resolved.rows[0]);
  }
  return resolved.serviceName ?? formatCatalogRowLabel(resolved.rows[0]!);
}

/** Cuando el servicio está en el Sheet pero el campo Incluye está vacío. */
export function buildInclusionTeamConfirmationAnswer(query: string): string | null {
  const resolved = resolveCatalogQuery(query);
  if (!resolved || resolved.kind === "category") return null;
  if (resolvedHasInclusionData(resolved)) return null;

  const label = inclusionLabelForResolved(resolved);
  const nivel =
    resolved.kind === "service_nivel" && resolved.rows[0]
      ? extractNivelLabel(resolved.rows[0])
      : parseCatalogQueryFilters(query).nivel;

  const webHint =
    buildCatalogWebDetailHint(label) ??
    buildCatalogWebDetailHint(resolved.serviceName ?? query) ??
    buildCatalogWebDetailHint(query);
  const webUrl =
    getCatalogWebUrlForQuery(label) ??
    getCatalogWebUrlForQuery(resolved.serviceName ?? "") ??
    getCatalogWebUrlForQuery(query) ??
    resolveCatalogWebLink(label).url ??
    resolveCatalogWebLink(resolved.serviceName ?? query).url ??
    resolveCatalogWebLink(query).url;

  // Preferir catálogo web (ahí suele estar el detalle de cada nivel) vs solo "el equipo confirma".
  if (webHint || webUrl) {
    const head = nivel
      ? `Para *${label}* el detalle de lo que incluye cada nivel (incl. *${nivel}*) está en el catálogo web.`
      : `Para *${label}* el detalle de lo que incluye cada nivel está en el catálogo web.`;
    const linkBlock = webHint ?? `Catálogo: ${toDeliverableCatalogUrl(webUrl!)}`;
    return `${head}\n\n${linkBlock}\n\n¿Cuál nivel prefieres?`;
  }

  // Último recurso: hub general — nunca dejar a la clienta sin link (A14932).
  const hub = getCatalogWebHubDeliveryUrl();
  const head = nivel
    ? `Para *${label}* (*${nivel}*) el detalle de inclusiones está en el catálogo.`
    : `Para *${label}* el detalle de inclusiones está en el catálogo.`;
  return `${head}\n\n${hub}\n\n¿Cuál nivel prefieres?`;
}

/**
 * Respuesta de inclusiones: Sheet con dato, o confirmación del equipo si está vacío.
 * `serviceHint` = requerimiento ya capturado (ej. "barra de bebidas") cuando el cliente
 * pregunta solo "qué incluye cada nivel" sin repetir el servicio.
 */
export function resolveCatalogInclusionReply(
  query: string,
  serviceHint?: string | null
): string | null {
  const wantsAllLevels =
    /\bcada\s+(nivel|cosa|paquete|uno|una)|todos\s+los\s+niveles|\blos\s+tres\s+niveles|\bb[aá]sic\w*.*tradicional.*premium|descripci[oó]n(es)?\s+de\s+cada|qu[eé]\s+incluye\s+cada/i.test(
      query
    );

  // "qué incluye cada nivel Básica/Tradicional/Premium" → detalle multi-nivel del servicio,
  // no un solo nivel porque la frase menciona "Premium".
  const linkQ = serviceHint?.trim() || query;
  const withLink = (text: string | null): string | null =>
    text ? ensureCatalogWebLink(text, linkQ) : null;

  if (wantsAllLevels && serviceHint?.trim()) {
    const detail = buildCatalogServiceDetailAnswer(serviceHint);
    // Con o sin Que Incluye en Sheet: el detalle trae precios + link web si falta texto.
    if (detail) return withLink(detail);
    const all = buildCatalogInclusionAnswer(serviceHint);
    if (all) return withLink(all);
    const team = buildInclusionTeamConfirmationAnswer(serviceHint);
    if (team) return withLink(team);
  }

  const attempts = [
    serviceHint ? `${serviceHint} ${query}` : null,
    serviceHint || null,
    // Solo usar el mensaje crudo si menciona un servicio; si no, evita match basura (Betún).
    /\b(banquete|taquiza|barra|coffee|brunch|pizza|sushi|crepas?|mesa\s+de|dj|carpa|pista)\b/i.test(
      query
    )
      ? query
      : null,
  ].filter((q): q is string => !!q?.trim());

  for (const q of attempts) {
    if (wantsAllLevels) {
      const detail = buildCatalogServiceDetailAnswer(q);
      if (detail && !/bet[uú]n|cupcakes?/i.test(detail)) return withLink(detail);
    }
    const hit = buildCatalogInclusionAnswer(q) ?? buildInclusionTeamConfirmationAnswer(q);
    if (hit && !/bet[uú]n|cupcakes?/i.test(hit)) return withLink(hit);
    const detail = buildCatalogServiceDetailAnswer(q);
    if (detail && !/bet[uú]n|cupcakes?/i.test(detail)) return withLink(detail);
  }

  // Último recurso: link del catálogo web aunque resolve falle.
  const webQ = serviceHint || query;
  // A14947: no mandar Betún/Cupcakes si el hint es banquete.
  if (/\bbanquete|\bcatering\b/i.test(webQ) || /\bbanquete|\bcatering\b/i.test(serviceHint ?? "")) {
    const banqueteQ = /\b4\s*tiempos|mexicano/i.test(`${webQ} ${serviceHint ?? ""}`)
      ? "Banquete Mexicano 4 tiempos"
      : /\b3\s*tiempos|formal/i.test(`${webQ} ${serviceHint ?? ""}`)
        ? "Banquete Formal 3 tiempos"
        : "banquete";
    const detail = buildCatalogServiceDetailAnswer(banqueteQ) ?? buildCatalogPriceAnswer(banqueteQ);
    return ensureCatalogWebLink(detail || "Claro, te dejo el catálogo de banquetes.", banqueteQ);
  }
  const webHint = buildCatalogWebDetailHint(webQ) ?? buildCatalogWebDetailHint(query);
  const webUrl = getCatalogWebUrlForQuery(webQ) ?? getCatalogWebUrlForQuery(query);
  if (webHint || webUrl) {
    return ensureCatalogWebLink(
      `El detalle de lo que incluye cada nivel está en el catálogo web.\n\n${webHint ?? `Catálogo: ${webUrl}`}\n\n¿Cuál nivel prefieres?`,
      webQ
    );
  }
  return ensureCatalogWebLink(
    "El detalle de lo que incluye cada nivel está en el catálogo.",
    linkQ
  );
}

export function clientAsksInclusion(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  // "descripción", "qué incluye/incluiría", "detalle", "paquetes/niveles".
  return /\bqu[eé]\s+incluye|\bqu[eé]\s+incluir[ií]a|\bincluir[ií]a\b|\bqu[eé]\s+trae|\bqu[eé]\s+lleva|\bmen[uú]s?\b|\bdetalle\b|\bdescripci[oó]n(es)?\b|\bopci[oó]nes?\s+incluyen|\bincluye\s+(la|el|un|una|el\s+paquete)\b|\bqu[eé]\s+trae\s+cada\b|\bqu[eé]\s+incluye\s+cada\b|\b(ver|quiero|dame|pasar?)\s+(los\s+)?paquetes?\b|\b(ver|quiero|dame)\s+(los\s+)?niveles?\b|\bpaquetes?\s+(disponibles?|que\s+manejan)\b|\bno\s+s[eé]\s+(muy\s+bien\s+)?cu[aá]l\b.{0,40}\b(incluir|nivel|opci[oó]n|variante|paquete)\b|\bcu[aá]l\s+podr[ií]a\s+ser\b/i.test(
    t
  );
}

/** Respuesta detallada cuando preguntan qué incluye / menú / detalle. Solo texto del Sheet. */
export function buildCatalogInclusionAnswer(query: string): string | null {
  const resolved = resolveCatalogQuery(query);
  if (!resolved || resolved.kind === "category") return null;

  if (resolved.kind === "service_nivel" && resolved.rows[0]) {
    const row = resolved.rows[0];
    const inclusion = getInclusionFromRow(row);
    if (!inclusion) return null;
    const label = formatCatalogRowLabel(row);
    return `*${label}* — *Incluye:* ${inclusion}`;
  }

  if (resolved.kind === "service") {
    const rowsWithInclusion = resolved.rows.filter((r) => getInclusionFromRow(r));
    if (!rowsWithInclusion.length) return null;

    if (rowsWithInclusion.length === 1) {
      const row = rowsWithInclusion[0]!;
      return `*${formatCatalogRowLabel(row)}* — *Incluye:* ${getInclusionFromRow(row)}`;
    }

    const baseName = resolved.serviceName ?? rowsWithInclusion[0]!.servicio;
    const blocks = rowsWithInclusion.slice(0, 5).map((row) => {
      const nivel = extractNivelLabel(row);
      return `• *${nivel}:* ${getInclusionFromRow(row)}`;
    });
    return `*Incluye:* — *${baseName}*:\n${blocks.join("\n")}`;
  }

  return null;
}

/** Respuesta con precios + inclusiones del Sheet. */
export function buildCatalogPriceAnswer(query: string): string | null {
  const resolved = resolveCatalogQuery(query);
  if (!resolved) return null;
  if (!catalogResultMatchesRequestedService(query, resolved)) return null;

  const svcHint = resolved.serviceName ?? query;
  const withLink = (text: string | null): string | null =>
    text ? ensureCatalogWebLink(text, svcHint) : null;

  if (resolved.kind === "category") {
    return withLink(buildCategoryServicesAnswer(resolved));
  }
  if (resolved.kind === "service_nivel" && resolved.rows[0]) {
    return buildExactRowPriceAnswer(resolved.rows[0]); // ya trae link
  }
  if (resolved.kind === "service") {
    const priced = resolved.rows.filter((r) => r.tienePrecio && r.precio);
    if (priced.length > 1) {
      // Pregunta de precio: siempre citar cifras ($), no solo nombres de nivel/variante.
      const unique = [
        ...new Map(priced.map((row) => [`${row.servicio}|${row.nivel}`, row])).values(),
      ];
      const baseName = resolved.serviceName ?? unique[0]!.servicio;
      const priceLines = unique
        .slice(0, 6)
        .map((row) => {
          const parsed = parseRowNotes(row.notas);
          const nivel = extractNivelLabel(row);
          const unit = row.unidad ? ` ${row.unidad}` : "";
          const min = parsed.minimo ? ` (mín. ${parsed.minimo})` : "";
          const svcBit =
            uniqueServicios(unique).length > 1 ? `${row.servicio} — ` : "";
          return `• *${svcBit}${nivel}* — ${row.precio}${unit}${min}`;
        })
        .join("\n");
      if (priceLines) {
        // V8.35: precios + qué incluye cada nivel (no solo cifras).
        const inclusionBlock = buildInclusionBlock(unique, 220);
        return withLink(
          `Sí, manejamos ${baseName}:\n\n${priceLines}${inclusionBlock}\n\n¿Qué nivel te interesa?`
        );
      }
      return buildServiceNivelChoiceAnswer({ ...resolved, rows: priced });
    }
    if (priced.length === 1) {
      return buildExactRowPriceAnswer(priced[0]!);
    }
    return buildServiceNivelChoiceAnswer(resolved);
  }

  const unique = [...new Map(resolved.rows.map((row) => [`${row.servicio}|${row.nivel}`, row])).values()];
  const baseName = resolved.serviceName ?? unique[0]!.servicio;
  const priceLines = unique
    .filter((r) => r.tienePrecio && r.precio)
    .slice(0, 6)
    .map((row) => {
      const parsed = parseRowNotes(row.notas);
      const nivel = extractNivelLabel(row);
      const unit = row.unidad ? ` ${row.unidad}` : "";
      const min = parsed.minimo ? ` (mín. ${parsed.minimo})` : "";
      return `• *${nivel}* — ${row.precio}${unit}${min}`;
    })
    .join("\n");

  if (!priceLines) return buildServiceNivelChoiceAnswer(resolved);
  const inclusionBlock = buildInclusionBlock(unique, 280);
  return withLink(`Sí, manejamos ${baseName}:\n\n${priceLines}${inclusionBlock}`);
}

function summarizeServicePrices(serviceKey: string, maxLevels = 4): string | null {
  const rows = snapshot?.rows.filter(
    (r) =>
      r.tienePrecio &&
      r.precio &&
      normalizeForMatch(`${r.servicio} ${r.nivel}`).includes(normalizeForMatch(serviceKey))
  );
  if (!rows?.length) return null;

  const unique = [...new Map(rows.map((row) => [`${row.servicio}|${row.nivel}`, row])).values()];
  const label = unique[0]!.servicio;

  const lines = unique.slice(0, maxLevels).map((row) => {
    const nivel = extractNivelLabel(row);
    const parsed = parseRowNotes(row.notas);
    const min = parsed.minimo ? ` (mín. ${parsed.minimo})` : "";
    return `• *${nivel}:* ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${min}`;
  });

  return `*${label}*\n${lines.join("\n")}`;
}

/** Comparación banquete vs taquiza con precios del Sheet. */
export function buildCatalogComparisonAnswer(): string | null {
  if (!snapshot?.rows.length) return null;

  const taquiza = summarizeServicePrices("taquiza", 4);
  const banquete = summarizeServicePrices("banquete 3 tiempos", 4);
  if (!taquiza && !banquete) return null;

  const parts = [
    "Te comparto una comparación rápida con precios de referencia:",
    "",
    taquiza ?? "",
    taquiza && banquete ? "" : "",
    banquete ?? "",
    "",
    "*En general:* taquiza es más casual y flexible; banquete es más formal con servicio de meseros y vajilla.",
    "¿Cuál te late más para tu evento?",
  ];

  return parts.filter((l) => l !== undefined && l !== "").join("\n").trim();
}

export function getCatalogoServicios(): SheetCatalogRow[] {
  return snapshot?.rows ?? [];
}

export async function ensureCatalogLoaded(): Promise<SheetCatalogRow[]> {
  if (!snapshot?.rows.length) await refreshCatalog();
  return snapshot?.rows ?? [];
}

/** Bloque para inyectar en briefing/LLM con datos reales del Sheet. */
export function formatServiceDataForPrompt(query: string): string | null {
  const resolved = resolveCatalogQuery(query);
  if (!resolved) return null;

  if (resolved.kind === "category") {
    return [
      "DATOS DEL SERVICIO (Google Sheet — consulta de categoría, NO listar todo):",
      `Categoría: ${resolved.categoryLabel}`,
      `Servicios disponibles: ${simplifyServiceNamesForList(uniqueServicios(resolved.rows)).join(", ")}`,
      "Pide al cliente que elija UN servicio concreto antes de dar precios.",
    ].join("\n");
  }

  if (resolved.kind === "service" && uniqueNiveles(resolved.rows).length > 1) {
    const svc = resolved.serviceName ?? uniqueServicios(resolved.rows)[0];
    const levelLines = uniqueNiveles(resolved.rows).slice(0, 6).map((n) => {
      const row = resolved.rows.find(
        (r) => normalizeForMatch(extractNivelLabel(r)) === normalizeForMatch(n)
      );
      const incl = row ? getInclusionFromRow(row) : null;
      const price =
        row?.tienePrecio && row.precio
          ? ` | Precio: ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}`
          : "";
      return incl
        ? `- ${n}${price} | Incluye: ${incl}`
        : `- ${n}${price} | Incluye: (vacío en catálogo — di que el equipo confirma; NO inventes)`;
    });
    return [
      "DATOS DEL SERVICIO (Google Sheet — elegir nivel):",
      `Servicio: ${svc}`,
      "Al ofrecer niveles, EXPLICA qué incluye cada uno con el texto del Sheet. NUNCA digas solo los nombres.",
      ...levelLines,
      "Pregunta cuál nivel prefiere DESPUÉS de mostrar inclusiones. No inventes inclusiones ni marcas.",
    ].join("\n");
  }

  const unique = [...new Map(resolved.rows.map((row) => [`${row.servicio}|${row.nivel}`, row])).values()].slice(
    0,
    6
  );
  const lines = unique.map((row) => {
    const parsed = parseRowNotes(row.notas);
    const price =
      row.tienePrecio && row.precio
        ? `Precio: ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${parsed.minimo ? ` (mín. ${parsed.minimo})` : ""}`
        : "Precio: sin listar — Alejandro cotiza";
    const inclusion = parsed.inclusion
      ? `Incluye: ${parsed.inclusion}`
      : "Incluye: (vacío en catálogo — equipo confirma en cotización)";
    const link = row.linkCatalogo
      ? ` | Link catálogo (SOLO si lo piden): ${row.linkCatalogo}`
      : "";
    return `- ${formatCatalogRowLabel(row)} | ${price} | ${inclusion}${link}`;
  });

  return [
    "DATOS DEL SERVICIO (fuente Google Sheet — usar SOLO esto; no inventar precios ni inclusiones):",
    ...lines,
  ].join("\n");
}

function mentionedServiceLabel(query: string): string | null {
  return parsePrimaryService(query);
}

export function buildCatalogNotFoundAnswer(serviceLabel: string, query?: string): string {
  if (query && classifyServiceKnowledgeLevel(query) === 3) {
    return buildLevel3Ack(serviceLabel);
  }
  return buildLevel2Ack(serviceLabel);
}

/** Respuesta con datos reales del Sheet para un servicio concreto (precio y/o inclusiones). */
export function buildCatalogServiceDetailAnswer(query: string): string | null {
  if (!snapshot?.rows.length) return null;

  const resolved = resolveCatalogQuery(query);
  if (!resolved) return null;
  if (!catalogResultMatchesRequestedService(query, resolved)) return null;
  if (resolved?.kind === "category") {
    return buildCategoryServicesAnswer(resolved);
  }
  if (resolved?.kind === "service") {
    return buildServiceNivelChoiceAnswer(resolved);
  }
  if (resolved?.kind === "service_nivel" && resolved.rows[0]) {
    return buildExactRowDetailAnswer(resolved.rows[0]);
  }

  const priceAnswer = buildCatalogPriceAnswer(query);
  if (priceAnswer) return priceAnswer;

  const inclusionAnswer = buildCatalogInclusionAnswer(query);
  if (inclusionAnswer) return inclusionAnswer;

  const matches = lookupCatalogServices(query);
  if (!matches.length) return null;

  const row = matches[0]!;
  if (!catalogResultMatchesRequestedService(query, { kind: "service_nivel", rows: [row] })) {
    return null;
  }
  const parsed = parseRowNotes(row.notas);
  if (parsed.inclusion) {
    return `Sí, manejamos *${formatCatalogRowLabel(row)}*.\n\n${parsed.inclusion}`;
  }

  return null;
}

function responseLooksLikeGenericCateringMenu(text: string): boolean {
  return GENERIC_CATERING_MENU_MARKERS.test(text);
}

export { responseLooksLikeGenericCateringMenu };

/** Overview de categorías del Sheet — solo cuando el cliente pregunta genérico por catering. */
export function buildCatalogCateringOverviewFromSheet(): string | null {
  if (!snapshot?.rows.length) return null;

  const byCategory = new Map<string, SheetCatalogRow>();
  for (const row of snapshot.rows) {
    const cat = row.categoria || row.servicio.split(" (")[0] || "Servicio";
    if (!byCategory.has(cat)) byCategory.set(cat, row);
  }

  const foodCats = [...byCategory.entries()]
    .filter(([cat]) =>
      /taquiza|banquete|brunch|coffee|pizza|sushi|barra|parrillada|canap|crep|paella|pozole|americana|kosher|navide/i.test(
        cat
      )
    )
    .slice(0, 8);

  if (!foodCats.length) return null;

  const options = foodCats.map(([cat, row]) => {
    const desde =
      row.tienePrecio && row.precio
        ? ` — desde ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}`
        : "";
    return `• *${cat}*${desde}`;
  });

  return [
    "Sí, manejamos catering para eventos. Del catálogo actual, estas son algunas opciones:",
    "",
    ...options,
    "",
    "¿Cuál te interesa? Te paso precios e inclusiones de la que elijas.",
  ].join("\n");
}

/**
 * Nombres de servicios del Sheet relevantes para un tipo de evento.
 * Solo hechos del catálogo — para inyectar al LLM al ofrecer temprano.
 */
const EVENT_OFFER_PATTERNS: Array<{ match: RegExp; servicePatterns: RegExp[] }> = [
  {
    match: /baby\s*shower/i,
    servicePatterns: [/brunch/i, /banquete/i, /mesa de dulce/i, /bocadillo/i, /canap/i, /mobiliario/i, /silla/i],
  },
  {
    match: /bautizo/i,
    servicePatterns: [
      /brunch/i,
      /banquete/i,
      /mesa de dulce/i,
      /pastel/i,
      /mobiliario/i,
      /carpa/i,
      /barra de beb/i,
      /ilumin/i,
    ],
  },
  {
    match: /graduaci|celebraci[oó]n/i,
    servicePatterns: [
      /banquete/i,
      /taquiza/i,
      /brunch/i,
      /barra de beb/i,
      /mixolog/i,
      /mesa de (dulce|postre)/i,
      /mobiliario/i,
      /\bdj\b/i,
      /ilumin/i,
      /pista/i,
      /carpa/i,
      /pantalla/i,
      /audio|sonido/i,
    ],
  },
  {
    match: /corporativ|empresarial|empresa/i,
    servicePatterns: [/coffee/i, /banquete/i, /catering/i, /mobiliario/i, /mixolog/i, /barra de beb/i, /coctel/i],
  },
  {
    match: /xv|quince/i,
    servicePatterns: [/banquete/i, /taquiza/i, /mesa de dulce/i, /mobiliario/i, /\bdj\b/i, /ilumin/i, /pista/i, /barra de beb/i],
  },
  {
    match: /cumple/i,
    servicePatterns: [
      /banquete/i,
      /taquiza/i,
      /brunch/i,
      /mesa de dulce/i,
      /mobiliario/i,
      /barra de beb/i,
      /\bdj\b/i,
      /ilumin/i,
      /pista/i,
    ],
  },
  {
    match: /boda/i,
    servicePatterns: [
      /banquete/i,
      /taquiza/i,
      /barra de beb/i,
      /mixolog/i,
      /mobiliario/i,
      /\bdj\b/i,
      /ilumin/i,
      /mesa de (dulce|postre)/i,
      /carpa/i,
      /pista/i,
    ],
  },
];

/** Nivel 1 amplio para eventos sociales (graduación, fiesta, celebración…). */
export const BROAD_SOCIAL_OFFER: readonly string[] = [
  "Alimentos (banquete, taquiza, brunch o barras temáticas)",
  "Barras de bebidas / coctelería",
  "Mesa de dulces o postres",
  "Mobiliario (mesas, sillas, periqueras)",
  "DJ e iluminación",
  "Pista de baile o tarima",
  "Carpas (si es exterior)",
  "Pantallas y audio",
];

const EVENT_OFFER_FALLBACK: Record<string, string[]> = {
  boda: [
    "Banquete / taquiza",
    "Barras de bebidas y temáticas",
    "Mobiliario",
    "DJ e iluminación",
    "Mesa de postres / dulces",
    "Carpas y pista de baile",
  ],
  "baby shower": ["Brunch", "Banquete ligero", "Mesa de dulces", "Bocadillos", "Mobiliario", "Decoración ligera"],
  corporativo: ["Coffee Break", "Catering / banquete", "Mobiliario", "Mixología / barras", "Pantallas / audio"],
  "xv años": [
    "Banquete / taquiza",
    "Barras de bebidas",
    "Mesa de dulces",
    "Mobiliario",
    "DJ e iluminación",
    "Pista de baile",
  ],
  bautizo: ["Brunch / banquete", "Mesa de dulces", "Mobiliario", "Barras de bebidas", "Carpas (exterior)"],
  cumpleaños: [
    "Banquete / taquiza",
    "Barras de bebidas",
    "Mesa de dulces",
    "Mobiliario",
    "DJ e iluminación",
    "Pista de baile",
  ],
  graduación: [...BROAD_SOCIAL_OFFER],
  celebración: [...BROAD_SOCIAL_OFFER],
};

function normalizeEventKey(tipo: string): string {
  const t = tipo.trim().toLowerCase();
  if (/baby\s*shower/.test(t)) return "baby shower";
  if (/xv|quince/.test(t)) return "xv años";
  if (/corporativ|empresarial/.test(t)) return "corporativo";
  if (/bautizo/.test(t)) return "bautizo";
  if (/cumple/.test(t)) return "cumpleaños";
  if (/boda/.test(t)) return "boda";
  if (/graduaci/.test(t)) return "graduación";
  if (/celebraci/.test(t)) return "celebración";
  return t.slice(0, 40);
}

/** Lista corta de servicios del Sheet (o fallback tipado) para el ofrecimiento temprano. */
export function listCatalogServicesForEvent(tipoEvento: string | null | undefined): string[] {
  const tipo = (tipoEvento ?? "").trim();
  if (!tipo) return [];

  // Evento = servicio (pozolada, taquiza, paella…): ofrecer ESE servicio, no banquete genérico.
  const focus = resolveServiceFocusFromText(tipo);
  if (focus) {
    const names: string[] = [];
    const seen = new Set<string>();
    if (snapshot?.rows.length) {
      for (const row of snapshot.rows) {
        const blob = `${row.categoria} ${row.servicio} ${row.nivel}`.toLowerCase();
        if (!focus.serviceHints.some((h) => blob.includes(h.toLowerCase()))) continue;
        const base = row.servicio.trim();
        const n = base.toLowerCase();
        if (seen.has(n)) continue;
        seen.add(n);
        names.push(base);
        if (names.length >= 6) break;
      }
    }
    if (!names.length) names.push(focus.label);
    for (const c of focus.complements) {
      if (!names.some((n) => n.toLowerCase().includes(c.toLowerCase().split(" ")[0]!))) {
        names.push(c);
      }
    }
    return names;
  }

  const key = normalizeEventKey(tipo);
  const patterns =
    EVENT_OFFER_PATTERNS.find((p) => p.match.test(tipo))?.servicePatterns ??
    EVENT_OFFER_PATTERNS.find((p) => p.match.test(key))?.servicePatterns;

  const names: string[] = [];
  const seen = new Set<string>();

  if (snapshot?.rows.length && patterns) {
    for (const row of snapshot.rows) {
      const label = formatCatalogRowLabel(row);
      const blob = `${row.categoria} ${row.servicio} ${row.nivel}`;
      if (!patterns.some((re) => re.test(blob))) continue;
      const base = row.servicio.trim() || label;
      const normed = base.toLowerCase();
      if (seen.has(normed)) continue;
      seen.add(normed);
      names.push(base);
      if (names.length >= 10) break;
    }
  }

  if (names.length >= 5) return names;

  const fallback = EVENT_OFFER_FALLBACK[key];
  if (fallback) return fallback;

  // Evento social desconocido: menú Nivel 1 amplio (no solo 3 ítems).
  return [...BROAD_SOCIAL_OFFER];
}

/**
 * Ofrecimiento Nivel 1 amplio (plantilla) — graduación, fiesta, celebración, etc.
 * Evita respuestas cortas tipo solo mobiliario + bebidas + dulces.
 */
export function buildBroadLevel1Offer(tipoEvento: string | null | undefined): string {
  const tipo = (tipoEvento ?? "").trim() || "evento";
  const lines = [
    `Con gusto te apoyo con tu ${tipo}. Manejamos varias líneas para armarlo completo:`,
    "",
    "• *Alimentos*: banquete, taquiza, brunch o barras temáticas.",
    "• *Barras de bebidas*: coctelería, mócteles o barra de café.",
    "• *Mesa de dulces o postres*: para un cierre especial.",
    "• *Mobiliario*: mesas, sillas, periqueras y montaje.",
    "• *DJ e iluminación*: ambiente y baile.",
    "• *Pista de baile o tarima*: si quieren pista definida.",
    "• *Carpas*: si el evento es en jardín o exterior.",
    "• *Pantallas y audio*: proyecciones, micrófonos, sonido.",
    "",
    "¿Qué te gustaría revisar primero? También podemos armar un paquete con varias opciones.",
  ];
  return ensureCatalogWebLink(lines.join("\n"), null);
}

/** Cuenta cuántas macro-categorías menciona un ofrecimiento (para detectar ofertas demasiado cortas). */
export function countOfferCategories(text: string | null | undefined): number {
  if (!text?.trim()) return 0;
  const t = text.toLowerCase();
  let n = 0;
  if (/\b(alimento|banquete|taquiza|brunch|catering|parrillada|barra\s+de\s+(pizzas?|alimentos?))\b/i.test(t))
    n++;
  if (/\b(bebida|coctel|mixolog|m[oó]ctel|barra\s+de\s+bebidas?)\b/i.test(t)) n++;
  if (/\b(mesa\s+de\s+(dulces?|postres?)|postres?|cupcakes?)\b/i.test(t)) n++;
  if (/\b(mobiliario|mesas?|sillas?|periquera)\b/i.test(t)) n++;
  if (/\bdj\b/i.test(t)) n++;
  if (/\biluminaci[oó]n\b/i.test(t)) n++;
  if (/\b(pista|tarima)\b/i.test(t)) n++;
  if (/\b(carpa|toldo)\b/i.test(t)) n++;
  if (/\b(pantalla|audio|sonido|microfon)\b/i.test(t)) n++;
  return n;
}

/** True si el ofrecimiento es demasiado estrecho para un evento social. */
export function isNarrowSocialEventOffer(
  text: string | null | undefined,
  tipoEvento?: string | null
): boolean {
  const tipo = (tipoEvento ?? "").toLowerCase();
  const social =
    /graduaci|celebraci|cumple|boda|xv|quince|bautizo|fiesta|aniversario|baby\s*shower/.test(tipo) ||
    !tipo.trim();
  if (!social) return false;
  // Corporativo puede ser más corto (coffee + mobiliario).
  if (/corporativ|empresarial|coffee/.test(tipo)) return false;
  return countOfferCategories(text) > 0 && countOfferCategories(text) < 5;
}

/**
 * Bloque de prompt: servicios del catálogo que encajan con el tipo de evento.
 * Hechos solamente — la redacción la hace OpenAI.
 */
export function buildEventOfferCatalogHint(tipoEvento: string | null | undefined): string | null {
  const tipo = (tipoEvento ?? "").trim();
  if (!tipo) return null;
  const focus = resolveServiceFocusFromText(tipo);
  const services = listCatalogServicesForEvent(tipo);
  if (!services.length) return null;

  if (focus) {
    return [
      "━━━━━━━━ OFRECIMIENTO — EVENTO = SERVICIO ━━━━━━━━",
      `El cliente describió su evento como «${tipo}» → sirve el servicio *${focus.label}* (no banquete/taquiza genéricos salvo que pidan eso).`,
      `Servicios del catálogo a proponer:`,
      ...services.map((s) => `• ${s}`),
      "",
      `Prioriza *${focus.label}* (variantes si hay). Puedes sugerir 1–2 complementos (bebidas, mobiliario) sin forzar.`,
      "Pregunta invitados o qué armar. Varía palabras. NO ofrezcas banquete/taquiza si no aplican a este evento.",
      "Precios/inclusiones solo del Sheet; si no hay dato, «el equipo confirma».",
    ].join("\n");
  }

  return [
    "━━━━━━━━ OFRECIMIENTO TEMPRANO (tipo de evento ya conocido) ━━━━━━━━",
    `Tipo de evento: ${tipo}`,
    "Servicios / categorías a proponer (AMPLIO — mínimo 6 líneas distintas):",
    ...services.map((s) => `• ${s}`),
    "",
    "Instrucción CRÍTICA: ofrece un menú Nivel 1 AMPLIO (alimentos, bebidas, dulces/postres, mobiliario, DJ, iluminación, pista/tarima, carpas si aplica, pantallas/audio).",
    "NUNCA te limites a solo 2–3 cosas (ej. solo mobiliario + bebidas + mesa de dulces).",
    "Pregunta qué le gustaría revisar primero o si arman un paquete. Tono asesora sobria.",
    "NUNCA digas solo «¿qué servicios quieres cotizar?» sin haber propuesto el abanico.",
    "NO inventes precios. Inclusiones solo del Sheet.",
  ].join("\n");
}

/** @deprecated Usar buildCatalogServiceDetailAnswer o buildCatalogCateringOverviewFromSheet. */
export function buildCatalogCateringAnswer(): string | null {
  return buildCatalogCateringOverviewFromSheet();
}

/** Si preguntan qué incluye / menú, responde SOLO con dato del Sheet o aviso al equipo. */
export function injectCatalogInclusionIfAsked(
  clientMessage: string | undefined,
  aiResponse: string,
  serviceHint?: string | null
): string {
  if (!clientMessage?.trim() || !clientAsksInclusion(clientMessage)) return aiResponse;
  const fromCatalog = resolveCatalogInclusionReply(clientMessage, serviceHint);
  if (fromCatalog) return fromCatalog;
  return aiResponse;
}

/** Si preguntan catering/servicio, enriquece con datos del Sheet (sin menú fijo). */
export function injectCatalogCateringIfAsked(
  clientMessage: string | undefined,
  aiResponse: string
): string {
  if (!clientMessage?.trim()) return aiResponse;

  const asksService = clientAsksServiceInfo(clientMessage) || clientAsksPrice(clientMessage);
  const genericCatering =
    clientMentionsCatering(clientMessage) && !parsePrimaryService(clientMessage);
  const mentionsService =
    isServiceRelatedMessage(clientMessage) && !!parsePrimaryService(clientMessage);

  if (!asksService && !genericCatering && !mentionsService) return aiResponse;

  const primary = parsePrimaryService(clientMessage);
  if (primary && /sushi|coffee\s*break|barra de bebidas/i.test(primary)) {
    const detail = buildCatalogServiceDetailAnswer(clientMessage);
    if (detail && !responseLooksLikeGenericCateringMenu(aiResponse)) {
      return aiResponse;
    }
    if (detail && responseLooksLikeGenericCateringMenu(aiResponse)) {
      return detail;
    }
  }

  if (responseLooksLikeGenericCateringMenu(aiResponse)) {
    const detail = buildCatalogServiceDetailAnswer(clientMessage);
    if (detail) return detail;
  }

  const detail = buildCatalogServiceDetailAnswer(clientMessage);
  if (detail) {
    if (
      asksService ||
      clientAsksInclusion(clientMessage) ||
      responseLooksLikeGenericCateringMenu(aiResponse) ||
      !aiResponse.trim()
    ) {
      return detail;
    }
    return aiResponse;
  }

  const label = mentionedServiceLabel(clientMessage);
  if (label && (asksService || mentionsService)) {
    return buildCatalogNotFoundAnswer(label, clientMessage);
  }

  if (genericCatering && !responseLooksLikeGenericCateringMenu(aiResponse)) {
    const overview = buildCatalogCateringOverviewFromSheet();
    if (overview) return overview;
  }

  return aiResponse;
}

/** Si el cliente preguntó precio, sustituye la respuesta GPT por tarifas del Sheet. */
export function injectCatalogPriceIfAsked(
  clientMessage: string | undefined,
  aiResponse: string
): string {
  if (!clientMessage?.trim()) return aiResponse;
  if (!clientAsksPrice(clientMessage)) return aiResponse;

  const fromCatalog = buildCatalogPriceAnswer(clientMessage);
  if (fromCatalog && mentionsListedPriceService(clientMessage)) return fromCatalog;

  if (messageClaimsPrice(aiResponse)) return aiResponse;

  if (fromCatalog) return fromCatalog;

  if (mentionsNoListedPriceService(clientMessage) && !mentionsListedPriceService(clientMessage)) {
    return aiResponse;
  }

  return aiResponse;
}

/** Hub general de catálogos web (no PDF Shopify). */
export const CATALOG_WEB_HUB_URL = "https://bodasesor.com/catalogos";

const BODASESOR_CATALOG_WEB_URL =
  /^https?:\/\/(?:www\.)?bodasesor\.com\/catalogos(?:\/[a-z0-9-]+)?\/?(?:[?#].*)?$/i;

export function isBodasesorCatalogWebUrl(url: string | null | undefined): boolean {
  return !!url?.trim() && BODASESOR_CATALOG_WEB_URL.test(url.trim());
}

/**
 * Entrega al cliente la URL del Sheet (bodasesor.com por defecto).
 * Solo reescribe a Hostinger si CATALOG_USE_LIGHT_PAGES=1 (páginas click-to-load).
 */
export function toDeliverableCatalogUrl(sheetUrl: string): string {
  if (process.env["CATALOG_USE_LIGHT_PAGES"] !== "1") return sheetUrl;
  const base = (
    process.env["CATALOG_LIGHT_BASE_URL"] ||
    process.env["LUCY_PUBLIC_URL"] ||
    "https://midnightblue-mosquito-424375.hostingersite.com"
  ).replace(/\/+$/, "");

  const m = sheetUrl.trim().match(
    /^https?:\/\/(?:www\.)?bodasesor\.com\/catalogos(?:\/([a-z0-9-]+))?\/?/i
  );
  if (!m) return sheetUrl;
  return m[1] ? `${base}/catalogos/${m[1]}` : `${base}/catalogos`;
}

export function getCatalogWebHubDeliveryUrl(): string {
  return toDeliverableCatalogUrl(CATALOG_WEB_HUB_URL);
}

/** Extrae link web válido de la fila (columna o legacy en notas). Nunca inventa slug. */
export function getRowCatalogWebLink(row: SheetCatalogRow): string | null {
  const direct = row.linkCatalogo?.trim();
  if (isBodasesorCatalogWebUrl(direct)) return direct!.replace(/\/+$/, "");
  const fromNotes = parseRowNotes(row.notas).gammaLink?.trim();
  if (isBodasesorCatalogWebUrl(fromNotes)) return fromNotes!.replace(/\/+$/, "");
  return null;
}

export type CatalogWebLinkMatch = {
  url: string | null;
  serviceName: string | null;
  kind: "service" | "hub" | "missing";
};

function scoreServiceForWebLink(query: string, row: SheetCatalogRow): number {
  const nq = normalizeForMatch(query);
  const ns = normalizeForMatch(row.servicio);
  let score = synonymScoreForService(query, row.servicio, row.sinonimos);

  if (!nq || !ns) return score;
  if (nq === ns) score += 80;
  else if (nq.includes(ns) || ns.includes(nq)) score += 45;

  const svcTokens = ns.split(/\s+/).filter((t) => t.length >= 4);
  const hitTokens = svcTokens.filter((t) => nq.includes(t));
  score += hitTokens.length * 8;

  // Distinciones críticas
  if (/\bcolgante/.test(nq) && /entelado|tela/.test(ns)) score -= 60;
  if (/\bentelad|tela\s+(en\s+)?techo/.test(nq) && /colgante/.test(ns)) score -= 60;
  if (/\btaquiza\b/.test(nq) && /parrillada\s+tacos/.test(ns)) score -= 40;
  if (/parrillada\s+tacos/.test(nq) && /^taquiza$/.test(ns)) score -= 40;
  if (/\bargentina\b/.test(nq) && /parrillada\s+tacos/.test(ns)) score -= 30;

  return score;
}

/**
 * Resuelve UN link de catálogo web desde el Sheet para el servicio pedido.
 * No construye URLs a partir de slugs hardcodeados.
 */
export function resolveCatalogWebLink(
  query: string,
  opts?: { preferHub?: boolean }
): CatalogWebLinkMatch {
  if (opts?.preferHub) {
    return { url: CATALOG_WEB_HUB_URL, serviceName: null, kind: "hub" };
  }

  const trimmed = query?.trim() ?? "";
  if (!trimmed || !snapshot?.rows.length) {
    return { url: null, serviceName: null, kind: "missing" };
  }

  const byService = new Map<string, SheetCatalogRow>();
  for (const row of snapshot.rows) {
    const key = row.servicio.trim();
    if (!key) continue;
    const existing = byService.get(key);
    if (!existing) {
      byService.set(key, row);
      continue;
    }
    if (!getRowCatalogWebLink(existing) && getRowCatalogWebLink(row)) {
      byService.set(key, row);
    }
  }

  const scored = [...byService.values()]
    .map((row) => ({ row, score: scoreServiceForWebLink(trimmed, row) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    const resolved = resolveCatalogQuery(trimmed);
    if (resolved && resolved.kind !== "category") {
      for (const row of resolved.rows) {
        const url = getRowCatalogWebLink(row);
        if (url) {
          return { url, serviceName: row.servicio, kind: "service" };
        }
      }
      const name = resolved.serviceName ?? resolved.rows[0]?.servicio ?? null;
      return { url: null, serviceName: name, kind: "missing" };
    }
    return { url: null, serviceName: null, kind: "missing" };
  }

  const best = scored[0]!;
  if (best.score < 14) {
    return { url: null, serviceName: null, kind: "missing" };
  }

  const url = getRowCatalogWebLink(best.row);
  if (url) {
    return { url, serviceName: best.row.servicio, kind: "service" };
  }
  return { url: null, serviceName: best.row.servicio, kind: "missing" };
}

/** Construye el mensaje WhatsApp con el link web (o fallback sin URL rota). */
export function buildCatalogWebLinkReply(opts: {
  query: string;
  wantFull?: boolean;
  serviceHint?: string | null;
}): string {
  if (opts.wantFull) {
    return [
      "Claro. Aquí tienes el catálogo general con todos los servicios:",
      getCatalogWebHubDeliveryUrl(),
      "",
      "Si luego quieres el de un servicio en concreto, dímelo y te mando ese link.",
    ].join("\n");
  }

  const query = [opts.query, opts.serviceHint].filter(Boolean).join(" ").trim() || opts.query;
  const match = resolveCatalogWebLink(query);

  if (match.kind === "service" && match.url) {
    const label = match.serviceName ? ` de *${match.serviceName}*` : "";
    return [
      `Claro, aquí tienes el catálogo${label}:`,
      toDeliverableCatalogUrl(match.url),
      "",
      "Si quieres el de otro servicio, dímelo y te mando ese.",
    ].join("\n");
  }

  if (match.serviceName) {
    return [
      `Para *${match.serviceName}* aún no tengo el link web en el catálogo vivo.`,
      `Te dejo el índice general mientras el equipo te comparte el detalle:`,
      getCatalogWebHubDeliveryUrl(),
    ].join("\n");
  }

  return [
    "Con gusto te paso el catálogo. ¿De qué servicio lo quieres, o te mando el general?",
    getCatalogWebHubDeliveryUrl(),
  ].join("\n");
}

/** Quita links de catálogo web si el cliente NO los pidió (evita spam). */
export function stripUnsolicitedCatalogWebLinks(text: string, clientAsked: boolean): string {
  if (!text || clientAsked) return text;
  if (!/bodasesor\.com\/catalogos|hostingersite\.com\/catalogos/i.test(text)) return text;
  return text
    .replace(
      /https?:\/\/(?:www\.)?bodasesor\.com\/catalogos(?:\/[a-z0-9-]*)?\/?(?:[?#][^\s]*)?/gi,
      ""
    )
    .replace(
      /https?:\/\/[^\s]*hostingersite\.com\/catalogos(?:\/[a-z0-9-]*)?\/?(?:[?#][^\s]*)?/gi,
      ""
    )
    .replace(/[ \t]*\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function messageOffersCatalogLink(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  // URL ya enviada cuenta como oferta (anti-repeat + strip intencional).
  if (/bodasesor\.com\/catalogos|hostingersite\.com\/catalogos/i.test(text)) return true;
  return /cat[aá]logo\s+con\s+m[aá]s\s+detalle|te\s+mande\s+el\s+cat[aá]logo|quieres\s+que\s+te\s+mande\s+el\s+cat[aá]logo|\bCat[aá]logo(?:\s+de\s+\*[^*]+\*)?:\s*\n?\s*https?:\/\//i.test(
    text
  );
}
