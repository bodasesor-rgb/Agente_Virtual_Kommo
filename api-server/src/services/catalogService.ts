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
  type SheetCatalogRow,
} from "./googleSheetsCatalog.js";
import { loadGammaCatalog, loadGammaKnowledgeFromSheet } from "./gammaCatalog.js";

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

const REFRESH_MS = Number(process.env["CATALOG_REFRESH_MINUTES"] ?? "30") * 60_000;

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

export function startCatalogAutoRefresh(): void {
  void refreshCatalog().catch(() => {
    /* logged inside */
  });

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
  return normalizeForMatch(`${row.servicio} ${row.categoria}`).replace(/\s+/g, " ");
}

function scoreCatalogRow(
  row: SheetCatalogRow,
  tokens: string[],
  filters: CatalogQueryFilters,
  query: string
): number {
  const haystack = rowHaystack(row).replace(/\s+/g, "");
  let score = 0;

  for (const token of tokens) {
    const tok = token.replace(/\s+/g, "");
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
    const nivel = normalizeForMatch(extractNivelLabel(row.servicio));
    if (nivel === normalizeForMatch(filters.nivel)) score += 8;
    else score -= 4;
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
  const tokens = queryTokens(query);
  if (!tokens.length) return [];

  const filters = parseCatalogQueryFilters(query);
  const scored = rows
    .filter((row) => !requirePrice || (row.tienePrecio && row.precio))
    .map((row) => ({ row, score: scoreCatalogRow(row, tokens, filters, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return [];

  const top = scored[0]!.score;
  const minScore = filters.nivel || filters.cuatroTiempos || filters.tresTiempos ? top - 1 : top - 3;
  return scored.filter((item) => item.score >= minScore).map((item) => item.row);
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

function extractNivelLabel(servicio: string): string {
  const match = servicio.match(/\(([^)]+)\)\s*$/);
  return match?.[1]?.trim() || servicio;
}

function pickGammaLink(_rows: SheetCatalogRow[]): string | undefined {
  return undefined;
}

function buildInclusionBlock(rows: SheetCatalogRow[], maxPerLevel = 220): string {
  const inclusionByLevel = rows.map((row) => ({
    nivel: extractNivelLabel(row.servicio),
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
  const filters = parseCatalogQueryFilters(query);
  const matches = lookupCatalogServices(query);
  if (!matches.length) return null;

  const unique = [...new Map(matches.map((row) => [row.servicio, row])).values()];
  const specificQuery = !!(filters.nivel || filters.cuatroTiempos || filters.tresTiempos);

  if (specificQuery && unique.length >= 1) {
    const row = unique[0]!;
    const parsed = parseRowNotes(row.notas);
    const nivel = extractNivelLabel(row.servicio);
    const baseName = row.categoria || row.servicio.split(" (")[0] || row.servicio;
    const price =
      row.tienePrecio && row.precio
        ? `\n*Precio:* ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${parsed.minimo ? ` (mín. ${parsed.minimo})` : ""}`
        : "";
    const inclusion = parsed.inclusion || "Alejandro puede darte el detalle completo del menú.";
    return `Te comparto qué incluye *${baseName} — ${nivel}*:${price}\n\n${inclusion}`;
  }

  const baseName = unique[0]!.categoria || unique[0]!.servicio.split(" (")[0] || unique[0]!.servicio;
  const blocks = unique.slice(0, 5).map((row) => {
    const parsed = parseRowNotes(row.notas);
    const nivel = extractNivelLabel(row.servicio);
    const price =
      row.tienePrecio && row.precio
        ? ` — ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${parsed.minimo ? `, mín. ${parsed.minimo}` : ""}`
        : "";
    const inclusion = parsed.inclusion || "Alejandro puede darte el detalle completo del menú.";
    return `*${nivel}*${price}\n${inclusion}`;
  });

  let msg = `Te comparto qué incluye *${baseName}*:\n\n${blocks.join("\n\n")}`;
  return msg;
}

/** Respuesta con precios + inclusiones del Sheet. */
export function buildCatalogPriceAnswer(query: string): string | null {
  const matches = lookupCatalogPrices(query);
  if (!matches.length) return null;

  const unique = [...new Map(matches.map((row) => [row.servicio, row])).values()];
  const baseName = unique[0]!.categoria || unique[0]!.servicio.split(" (")[0] || unique[0]!.servicio;

  const priceLines = unique
    .slice(0, 6)
    .map((row) => {
      const parsed = parseRowNotes(row.notas);
      const nivel = extractNivelLabel(row.servicio);
      const unit = row.unidad ? ` ${row.unidad}` : "";
      const min = parsed.minimo ? ` (mín. ${parsed.minimo})` : "";
      return `• *${nivel}* — ${row.precio}${unit}${min}`;
    })
    .join("\n");

  const inclusionBlock = buildInclusionBlock(unique, 280);
  return `Sí, manejamos ${baseName}:\n\n${priceLines}${inclusionBlock}`;
}

function summarizeServicePrices(serviceKey: string, maxLevels = 4): string | null {
  const rows = snapshot?.rows.filter(
    (r) =>
      r.tienePrecio &&
      r.precio &&
      normalizeForMatch(`${r.categoria} ${r.servicio}`).includes(normalizeForMatch(serviceKey))
  );
  if (!rows?.length) return null;

  const unique = [...new Map(rows.map((row) => [row.servicio, row])).values()];
  const label = unique[0]!.categoria || unique[0]!.servicio.split(" (")[0] || serviceKey;

  const lines = unique.slice(0, maxLevels).map((row) => {
    const nivel = extractNivelLabel(row.servicio);
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

/** Cuando dicen catering, orientar a opciones de alimentos del Sheet. */
export function buildCatalogCateringAnswer(): string | null {
  if (!snapshot?.rows.length) return null;

  const taquizaLine = summarizeServicePrices("taquiza", 1);
  const banqueteLine = summarizeServicePrices("banquete 3 tiempos", 1);
  const brunchLine = summarizeServicePrices("brunch", 1);
  const coffeeLine = summarizeServicePrices("coffee", 1);

  const options = [
    taquizaLine ? `• *Taquiza* — desde ${taquizaLine.match(/\$[\d,.]+/)?.[0] ?? "consultar"}/pp` : "",
    banqueteLine ? `• *Banquete* — desde ${banqueteLine.match(/\$[\d,.]+/)?.[0] ?? "consultar"}/pp` : "",
    brunchLine ? `• *Brunch*` : "",
    coffeeLine ? `• *Coffee break*` : "",
    "• *Barras temáticas* (pizzas, sushi, mariscos, etc.)",
  ].filter(Boolean);

  return [
    "Sí, manejamos catering para eventos. Estas son las opciones más pedidas:",
    "",
    ...options,
    "",
    "¿Cuál te interesa? Con eso te paso precios e inclusiones por nivel.",
  ].join("\n");
}

/** Si preguntan qué incluye / menú, responde con detalle del Sheet. */
export function injectCatalogInclusionIfAsked(
  clientMessage: string | undefined,
  aiResponse: string
): string {
  if (!clientMessage?.trim() || !clientAsksInclusion(clientMessage)) return aiResponse;
  return buildCatalogInclusionAnswer(clientMessage) ?? aiResponse;
}

/** Si preguntan catering, orientar a opciones de alimentos del Sheet. */
export function injectCatalogCateringIfAsked(
  clientMessage: string | undefined,
  aiResponse: string
): string {
  if (!clientMessage?.trim() || !/\bcatering\b/i.test(clientMessage)) return aiResponse;
  return buildCatalogCateringAnswer() ?? aiResponse;
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

/** Snapshot en memoria (para PDF resolver y health). */
export function getCatalogSnapshot(): CatalogSnapshot | null {
  return snapshot;
}
