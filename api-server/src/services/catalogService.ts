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

      const useStatic = !status.sources.sheets;
      status.sources.staticFallback = useStatic;

      const promptBlock = buildPromptBlock({
        sheetsMd,
        sheetsTextCsv: sheetsTextExtra,
        gammaBlock,
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
  if (/\bbarra\b/.test(q) && !/\bbarra de bebida/.test(q)) {
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

/** Opt-in al link web del Sheet — no enviar el URL sin que lo pidan. */
export const CATALOG_OFFER_QUESTION = "¿Quieres que te mande el catálogo con más detalle?";

function withCatalogOfferQuestion(text: string): string {
  const body = text.trim();
  if (!body) return body;
  if (/quieres\s+que\s+te\s+mande\s+el\s+cat[aá]logo/i.test(body)) return body;
  return `${body}\n\n${CATALOG_OFFER_QUESTION}`;
}

function buildServiceNivelChoiceAnswer(result: CatalogMatchResult): string {
  const svc = result.serviceName ?? uniqueServicios(result.rows)[0] ?? "ese servicio";
  const svcRows = result.rows.filter((r) => r.servicio === svc || result.rows.length <= 6);
  const niveles = uniqueNiveles(svcRows.length ? svcRows : result.rows);

  if (niveles.length <= 1) {
    const row = (svcRows[0] ?? result.rows[0])!;
    return buildExactRowDetailAnswer(row);
  }

  const nivelList = niveles.slice(0, 6).map((n) => `*${n}*`).join(", ");
  if (uniqueServicios(result.rows).length > 1) {
    const variants = simplifyServiceNamesForList(uniqueServicios(result.rows)).slice(0, 8).join(", ");
    return `Manejamos *${svc}* en varias opciones: ${variants}. Cada una tiene niveles como ${nivelList}. ¿Cuál variante y nivel prefieres?`;
  }
  // Una pregunta: nivel; el catálogo web se ofrece cuando el cliente afina o lo pide.
  return `*${svc}* lo tenemos en: ${nivelList}. ¿Cuál prefieres?`;
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
    `Sí, manejamos *${label}*.${price ? `\n${price}` : ""}${inclusion}`.trim()
  );
}

function buildExactRowPriceAnswer(row: SheetCatalogRow): string {
  const label = formatCatalogRowLabel(row);
  const parsed = parseRowNotes(row.notas);
  const unit = row.unidad ? ` ${row.unidad}` : "";
  const min = parsed.minimo ? ` (mín. ${parsed.minimo})` : "";
  const inclusion = parsed.inclusion ? `\n\n*Incluye:* ${parsed.inclusion}` : "";
  return `*${label}* — ${row.precio}${unit}${min}${inclusion}`;
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

  if (nivel) {
    return `El detalle exacto de lo que incluye la barra *${nivel}* te lo confirma nuestro equipo en la cotización. ¿Te la preparo con ese nivel?`;
  }
  return `El detalle exacto de lo que incluye *${label}* te lo confirma nuestro equipo en la cotización. ¿Te la preparo con ese nivel?`;
}

/** Respuesta de inclusiones: Sheet con dato, o confirmación del equipo si está vacío. */
export function resolveCatalogInclusionReply(query: string): string | null {
  return buildCatalogInclusionAnswer(query) ?? buildInclusionTeamConfirmationAnswer(query);
}

export function clientAsksInclusion(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /\bqu[eé]\s+incluye|\bqu[eé]\s+trae|\bqu[eé]\s+lleva|\bmen[uú]s?\b|\bdetalle\b|\bopci[oó]nes?\s+incluyen|\bincluye\s+(la|el|un|una|el\s+paquete)\b/i.test(
      t
    ) && !/\bcu[aá]nto\s+cuesta|\bprecio\b/i.test(t)
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

  if (resolved.kind === "category") {
    return buildCategoryServicesAnswer(resolved);
  }
  if (resolved.kind === "service_nivel" && resolved.rows[0]) {
    return buildExactRowPriceAnswer(resolved.rows[0]);
  }
  if (resolved.kind === "service") {
    const priced = resolved.rows.filter((r) => r.tienePrecio && r.precio);
    if (priced.length > 1) {
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
  return `Sí, manejamos ${baseName}:\n\n${priceLines}${inclusionBlock}`;
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
    return [
      "DATOS DEL SERVICIO (Google Sheet — elegir nivel):",
      `Servicio: ${svc}`,
      `Niveles: ${uniqueNiveles(resolved.rows).join(", ")}`,
      "Pregunta cuál nivel prefiere antes de dar precio detallado.",
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
    servicePatterns: [/brunch/i, /banquete/i, /mesa de dulce/i, /pastel/i, /mobiliario/i, /carpa/i],
  },
  {
    match: /corporativ|empresarial|empresa/i,
    servicePatterns: [/coffee/i, /banquete/i, /catering/i, /mobiliario/i, /mixolog/i, /barra de beb/i, /coctel/i],
  },
  {
    match: /xv|quince/i,
    servicePatterns: [/banquete/i, /taquiza/i, /mesa de dulce/i, /mobiliario/i, /\bdj\b/i, /ilumin/i, /pista/i],
  },
  {
    match: /cumple/i,
    servicePatterns: [/banquete/i, /taquiza/i, /brunch/i, /mesa de dulce/i, /mobiliario/i, /barra de beb/i, /\bdj\b/i],
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

const EVENT_OFFER_FALLBACK: Record<string, string[]> = {
  boda: [
    "Banquete",
    "Taquiza",
    "Barras de bebidas y temáticas",
    "Mobiliario",
    "DJ e iluminación",
    "Mesa de postres / dulces",
  ],
  "baby shower": ["Brunch", "Banquete ligero", "Mesa de dulces", "Bocadillos", "Mobiliario"],
  corporativo: ["Coffee Break", "Catering / banquete", "Mobiliario", "Mixología / barras"],
  "xv años": ["Banquete", "Taquiza", "Mesa de dulces", "Mobiliario", "DJ", "Iluminación"],
  bautizo: ["Brunch", "Banquete", "Mesa de dulces", "Mobiliario"],
  cumpleaños: ["Banquete", "Taquiza", "Mesa de dulces", "Mobiliario", "Barras de bebidas"],
};

function normalizeEventKey(tipo: string): string {
  const t = tipo.trim().toLowerCase();
  if (/baby\s*shower/.test(t)) return "baby shower";
  if (/xv|quince/.test(t)) return "xv años";
  if (/corporativ|empresarial/.test(t)) return "corporativo";
  if (/bautizo/.test(t)) return "bautizo";
  if (/cumple/.test(t)) return "cumpleaños";
  if (/boda/.test(t)) return "boda";
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

  if (names.length >= 3) return names;

  const fallback = EVENT_OFFER_FALLBACK[key];
  if (fallback) return fallback;

  // Evento desconocido: NO caer a banquete/taquiza por defecto.
  return ["Mobiliario", "Barras de bebidas", "Mesa de dulces"];
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
    "Servicios del catálogo que suelen encajar (SOLO estos y otros que existan en el Sheet inyectado):",
    ...services.map((s) => `• ${s}`),
    "",
    "Instrucción: propón con criterio 4–6 de estos servicios para ESTE evento, con tono de asesora cálida y natural.",
    "Pregunta qué le gustaría ir armando. Varía tus palabras; NO uses siempre la misma frase.",
    "NUNCA digas solo «¿qué servicios quieres cotizar?» o «¿qué tienes pensado?» sin haber propuesto nada.",
    "NO inventes servicios fuera del catálogo. Precios/inclusiones solo si el cliente pregunta y están en el Sheet; si no, «el equipo confirma».",
  ].join("\n");
}

/** @deprecated Usar buildCatalogServiceDetailAnswer o buildCatalogCateringOverviewFromSheet. */
export function buildCatalogCateringAnswer(): string | null {
  return buildCatalogCateringOverviewFromSheet();
}

/** Si preguntan qué incluye / menú, responde SOLO con dato del Sheet o aviso al equipo. */
export function injectCatalogInclusionIfAsked(
  clientMessage: string | undefined,
  aiResponse: string
): string {
  if (!clientMessage?.trim() || !clientAsksInclusion(clientMessage)) return aiResponse;
  const fromCatalog = resolveCatalogInclusionReply(clientMessage);
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
  return /cat[aá]logo\s+con\s+m[aá]s\s+detalle|te\s+mande\s+el\s+cat[aá]logo|quieres\s+que\s+te\s+mande\s+el\s+cat[aá]logo/i.test(
    text
  );
}
