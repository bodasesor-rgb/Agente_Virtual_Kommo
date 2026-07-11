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
import { buildLevel2Ack, buildLevel3Ack, classifyServiceKnowledgeLevel } from "./serviceKnowledge.js";

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
        }
      }

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
  else if (/\bbasico\b/.test(t)) nivel = "Basico";
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
  if (/\b(banquete|taquiza|barra de|coffee break|brunch)\b/.test(q)) return true;
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
  if (/\bbasico\b/.test(q) && /\bbasico\b/.test(nivelHay)) return true;
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
  const rows = snapshot.rows;
  const trimmed = query.trim();
  if (!trimmed) return null;

  const macro = detectMacroCategoryQuery(trimmed);
  if (macro && !matchesSpecificServicioInQuery(trimmed, rows)) {
    const catRows = rows.filter((r) => macro.servicePattern.test(r.servicio));
    if (catRows.length) {
      return { kind: "category", categoryLabel: macro.label, rows: catRows };
    }
  }

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

  const hasNivelFilter = !!(filters.nivel || filters.cuatroTiempos || filters.tresTiempos || /\bpremium\b|\bbasico\b|\btradicional\b/i.test(query));
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
  return `*${svc}* lo tenemos en: ${nivelList}. ¿Cuál prefieres?`;
}

function buildExactRowDetailAnswer(row: SheetCatalogRow): string {
  const label = formatCatalogRowLabel(row);
  const parsed = parseRowNotes(row.notas);
  const price =
    row.tienePrecio && row.precio
      ? `*Precio:* ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${parsed.minimo ? ` (mín. ${parsed.minimo})` : ""}`
      : "";
  const inclusion = parsed.inclusion ? `\n\n${parsed.inclusion}` : "";
  return `Sí, manejamos *${label}*.${price ? `\n${price}` : ""}${inclusion}`.trim();
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
    inclusion: parseRowNotes(row.notas).inclusion,
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
        `• *${r.nivel}:* ${r.inclusion.slice(0, maxPerLevel)}${r.inclusion.length > maxPerLevel ? "…" : ""}`
    );

  return lines.length ? `\n\n*Qué incluye cada nivel:*\n${lines.join("\n")}` : "";
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

/** Respuesta detallada cuando preguntan qué incluye / menú / detalle. */
export function buildCatalogInclusionAnswer(query: string): string | null {
  const resolved = resolveCatalogQuery(query);
  if (!resolved) return null;

  if (resolved.kind === "category") {
    return buildCategoryServicesAnswer(resolved);
  }
  if (resolved.kind === "service_nivel" && resolved.rows[0]) {
    const row = resolved.rows[0];
    const parsed = parseRowNotes(row.notas);
    const label = formatCatalogRowLabel(row);
    const price =
      row.tienePrecio && row.precio
        ? `\n*Precio:* ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${parsed.minimo ? ` (mín. ${parsed.minimo})` : ""}`
        : "";
    const inclusion = parsed.inclusion || "Nuestro equipo puede darte el detalle completo del menú.";
    return `Te comparto qué incluye *${label}*:${price}\n\n${inclusion}`;
  }
  if (resolved.kind === "service") {
    return buildServiceNivelChoiceAnswer(resolved);
  }

  const unique = [...new Map(resolved.rows.map((row) => [`${row.servicio}|${row.nivel}`, row])).values()];
  const baseName = resolved.serviceName ?? unique[0]!.servicio;
  const blocks = unique.slice(0, 5).map((row) => {
    const parsed = parseRowNotes(row.notas);
    const nivel = extractNivelLabel(row);
    const price =
      row.tienePrecio && row.precio
        ? ` — ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${parsed.minimo ? `, mín. ${parsed.minimo}` : ""}`
        : "";
    const inclusion = parsed.inclusion || "Nuestro equipo puede darte el detalle completo del menú.";
    return `*${nivel}*${price}\n${inclusion}`;
  });

  return `Te comparto qué incluye *${baseName}*:\n\n${blocks.join("\n\n")}`;
}

/** Respuesta con precios + inclusiones del Sheet. */
export function buildCatalogPriceAnswer(query: string): string | null {
  const resolved = resolveCatalogQuery(query);
  if (!resolved) return null;

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
    const inclusion = parsed.inclusion ? `Incluye: ${parsed.inclusion}` : "";
    return `- ${formatCatalogRowLabel(row)} | ${price}${inclusion ? ` | ${inclusion}` : ""}`;
  });

  return ["DATOS DEL SERVICIO (fuente Google Sheet — usar solo esto, no inventar):", ...lines].join("\n");
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

/** @deprecated Usar buildCatalogServiceDetailAnswer o buildCatalogCateringOverviewFromSheet. */
export function buildCatalogCateringAnswer(): string | null {
  return buildCatalogCateringOverviewFromSheet();
}

/** Si preguntan qué incluye / menú, responde con detalle del Sheet. */
export function injectCatalogInclusionIfAsked(
  clientMessage: string | undefined,
  aiResponse: string
): string {
  if (!clientMessage?.trim() || !clientAsksInclusion(clientMessage)) return aiResponse;
  return buildCatalogInclusionAnswer(clientMessage) ?? aiResponse;
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
