/**
 * Lee catálogo/precios desde Google Sheets vía export CSV público.
 * Config (en orden de prioridad):
 * - GOOGLE_SHEETS_CATALOG_CSV_URL / GOOGLE_SHEETS_PRECIOS (URL CSV o link del doc)
 * - GOOGLE_SHEETS_CATALOG_ID / GOOGLE_SHEETS_PRECIOS (ID del spreadsheet) + GID
 */

export interface SheetCatalogRow {
  servicio: string;
  categoria: string;
  precio: string;
  unidad: string;
  notas: string;
  tienePrecio: boolean;
  /** Link PDF para enviar al cliente (Drive, Shopify, etc.) */
  linkPdf: string;
}

export interface SheetCatalogResult {
  rows: SheetCatalogRow[];
  sourceUrl: string;
  fetchedAt: string;
}

/** ID del spreadsheet de precios Bodasesor (compartido públicamente). */
export const BODASESOR_PRECIOS_SHEET_ID = "1s3DGZZXm3VXxqxyq1cKDnD3DfhGUrVw6ZkpYuN5_pBQ";

const HEADER_ALIASES: Record<string, keyof Omit<SheetCatalogRow, "tienePrecio">> = {
  servicio: "servicio",
  service: "servicio",
  nombre: "servicio",
  producto: "servicio",
  categoria: "categoria",
  categoría: "categoria",
  category: "categoria",
  tipo: "categoria",
  nivel: "categoria",
  precio: "precio",
  "precio unitario": "precio",
  price: "precio",
  costo: "precio",
  tarifa: "precio",
  unidad: "unidad",
  unit: "unidad",
  pp: "unidad",
  notas: "notas",
  nota: "notas",
  notes: "notas",
  descripcion: "notas",
  descripción: "notas",
  detalle: "notas",
  "que incluye": "notas",
  extras: "notas",
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      if (ch === "\r") i++;
      continue;
    }
    cell += ch;
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((c) => c.trim())) rows.push(row);
  }

  return rows;
}

function truthyPrecioFlag(raw: string | undefined): boolean | null {
  if (!raw?.trim()) return null;
  const v = raw.trim().toLowerCase();
  if (/^(s[ií]|yes|true|1|x|con\s+precio)$/.test(v)) return true;
  if (/^(no|false|0|sin\s+precio|alejandro|cotizar)$/.test(v)) return false;
  return null;
}

function rowHasPriceValue(precio: string): boolean {
  return /\$|\/pp|\/\s*pp|mil|pesos|mxn|\d/.test(precio);
}

function extractSheetId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed) && !trimmed.startsWith("http")) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

function resolveSheetIdEnv(): string | null {
  for (const key of ["GOOGLE_SHEETS_CATALOG_ID", "GOOGLE_SHEETS_PRECIOS"]) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;
    const id = extractSheetId(raw);
    if (id) return id;
  }
  return BODASESOR_PRECIOS_SHEET_ID;
}

function resolveDirectCsvUrl(): string | null {
  for (const key of ["GOOGLE_SHEETS_CATALOG_CSV_URL", "GOOGLE_SHEETS_PRECIOS_CSV_URL"]) {
    const url = process.env[key]?.trim();
    if (url) return url;
  }

  const precios = process.env["GOOGLE_SHEETS_PRECIOS"]?.trim();
  if (precios?.includes("export?format=csv")) return precios;

  return null;
}

export function buildSheetsCsvUrl(): string | null {
  const direct = resolveDirectCsvUrl();
  if (direct) return direct;

  const sheetId = resolveSheetIdEnv();
  if (!sheetId) return null;

  const sheetName = process.env["GOOGLE_SHEETS_CATALOG_SHEET_NAME"]?.trim();
  const gvizBase = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  if (sheetName) {
    return `${gvizBase}&sheet=${encodeURIComponent(sheetName)}`;
  }

  // gviz funciona en hojas compartidas cuando /export?format=csv devuelve 400
  return gvizBase;
}

export function buildSheetsTextCsvUrl(): string | null {
  const direct = process.env["GOOGLE_SHEETS_CATALOG_TEXT_CSV_URL"]?.trim();
  if (direct) return direct;

  const sheetId = resolveSheetIdEnv();
  const textGid = process.env["GOOGLE_SHEETS_CATALOG_TEXT_GID"]?.trim();
  if (!sheetId || !textGid) return null;

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${textGid}`;
}

export async function fetchCsvText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Lucy-Bodasesor-Catalog/1.0" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`Sheets CSV HTTP ${res.status}`);
  }
  return res.text();
}

export function parseSheetCatalogCsv(csvText: string): SheetCatalogRow[] {
  const matrix = parseCsvRows(csvText);
  if (matrix.length < 2) return [];

  const headers = matrix[0]!.map(normalizeHeader);
  const idx: Partial<Record<keyof SheetCatalogRow, number>> = {};
  let tienePrecioCol: number | null = null;
  let catalogoRevisadoCol: number | null = null;
  let precioMinimoCol: number | null = null;
  let linkCatalogoCol: number | null = null;
  let linkPdfCol: number | null = null;
  let extrasCol: number | null = null;

  headers.forEach((h, i) => {
    if (h === "tiene_precio" || h === "tiene precio" || h === "con_precio" || h === "listed_price") {
      tienePrecioCol = i;
      return;
    }
    if (h === "catalogo revisado" || h === "catalogo_revisado") {
      catalogoRevisadoCol = i;
      return;
    }
    if (h === "precio minimo de salida" || h === "precio minimo") {
      precioMinimoCol = i;
      return;
    }
    if (h === "link catalogo" || h === "link_catalogo") {
      linkCatalogoCol = i;
      return;
    }
    if (
      h === "link pdf catalogo" ||
      h === "link pdf" ||
      h === "link_pdf" ||
      h === "pdf catalogo" ||
      h === "pdf" ||
      h === "catalogo pdf"
    ) {
      linkPdfCol = i;
      return;
    }
    if (h === "extras") {
      extrasCol = i;
      return;
    }
    const mapped = HEADER_ALIASES[h];
    if (mapped && idx[mapped] === undefined) idx[mapped] = i;
  });

  if (idx.servicio === undefined) return [];

  const rows: SheetCatalogRow[] = [];

  for (const line of matrix.slice(1)) {
    const get = (key: keyof Omit<SheetCatalogRow, "tienePrecio">) => {
      const col = idx[key];
      return col === undefined ? "" : (line[col] ?? "").trim();
    };

    const servicioBase = get("servicio");
    if (!servicioBase || /^#|comentario|ignore/i.test(servicioBase)) continue;

    if (catalogoRevisadoCol !== null) {
      const revisado = (line[catalogoRevisadoCol] ?? "").trim().toLowerCase();
      if (revisado === "false" || revisado === "no" || revisado === "0") continue;
    }

    const nivel = get("categoria");
    const servicio = nivel ? `${servicioBase} (${nivel})` : servicioBase;

    const precio = get("precio");
    const flag =
      tienePrecioCol !== null ? truthyPrecioFlag(line[tienePrecioCol]) : null;
    const tienePrecio =
      flag === true || (flag === null && rowHasPriceValue(precio));

    const notasParts: string[] = [];
    const notasBase = get("notas");
    if (notasBase) notasParts.push(notasBase);

    let linkPdf = "";
    if (linkPdfCol !== null) {
      linkPdf = (line[linkPdfCol] ?? "").trim();
    }

    if (precioMinimoCol !== null) {
      const min = (line[precioMinimoCol] ?? "").trim();
      if (min) notasParts.push(`Mínimo de salida: ${min}`);
    }
    if (linkCatalogoCol !== null) {
      const link = (line[linkCatalogoCol] ?? "").trim();
      if (link) {
        // Gamma / conocimiento interno — no va a linkPdf del cliente
        if (/gamma\.app/i.test(link)) {
          notasParts.push(`Catálogo: ${link}`);
        } else if (!linkPdf && /\.pdf|drive\.google/i.test(link)) {
          linkPdf = link;
        } else if (!linkPdf) {
          notasParts.push(`Catálogo: ${link}`);
        }
      }
    }
    if (extrasCol !== null) {
      const extras = (line[extrasCol] ?? "").trim();
      if (extras) notasParts.push(`Extras: ${extras}`);
    }

    let unidad = get("unidad");
    if (!unidad && /\$/.test(precio)) unidad = "/pp";

    rows.push({
      servicio,
      categoria: servicioBase,
      precio,
      unidad,
      notas: notasParts.join(" | "),
      tienePrecio,
      linkPdf,
    });
  }

  return rows;
}

export function sheetRowsToMarkdown(rows: SheetCatalogRow[]): string {
  if (!rows.length) return "";

  const byCategory = new Map<string, SheetCatalogRow[]>();
  for (const row of rows) {
    const cat = row.categoria || "Servicios";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(row);
  }

  const lines: string[] = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "CATÁLOGO BODASESOR — GOOGLE SHEETS (fuente viva)",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "REGLA: Solo cita precios que aparecen en esta tabla. Si no hay precio → Alejandro cotiza.",
    "",
  ];

  for (const [cat, items] of byCategory) {
    lines.push(`## ${cat}`, "");
    for (const item of items) {
      if (item.tienePrecio && item.precio) {
        const unit = item.unidad ? ` ${item.unidad}` : "";
        lines.push(`• **${item.servicio}**: ${item.precio}${unit}`);
      } else {
        lines.push(`• **${item.servicio}**: sin precio listado — Alejandro cotiza`);
      }
      if (item.notas) {
        const parsed = parseRowNotes(item.notas);
        const clientNotes = [parsed.inclusion, parsed.minimo ? `Mínimo de salida: ${parsed.minimo}` : ""]
          .filter(Boolean)
          .join(" | ");
        if (clientNotes) lines.push(`  ${clientNotes}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export interface ParsedRowNotes {
  inclusion: string;
  minimo: string;
  gammaLink: string;
  linkPdf: string;
  extras: string;
}

/** Limpia texto de inclusiones del Sheet para WhatsApp. */
export function formatInclusionForWhatsApp(text: string, maxLen = 420): string {
  let cleaned = text
    .replace(/\s+/g, " ")
    .replace(/ incluido\s+/gi, ". ")
    .replace(/ servicio base incluye:/gi, " Incluye:")
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚ])/g, "$1. $2")
    .trim();

  if (cleaned.length > maxLen) {
    cleaned = `${cleaned.slice(0, maxLen - 1).trim()}…`;
  }
  return cleaned;
}

export function parseRowNotes(notas: string): ParsedRowNotes {
  const result: ParsedRowNotes = { inclusion: "", minimo: "", gammaLink: "", linkPdf: "", extras: "" };
  if (!notas?.trim()) return result;

  for (const part of notas.split("|").map((s) => s.trim())) {
    if (!part) continue;
    if (/^cat[aá]logo:\s*https?:/i.test(part)) {
      const link = part.replace(/^cat[aá]logo:\s*/i, "").trim();
      if (/gamma\.app/i.test(link)) {
        result.gammaLink = link;
      } else if (/\.pdf|drive\.google/i.test(link)) {
        result.linkPdf = link;
      } else {
        result.gammaLink = link;
      }
    } else if (/^m[ií]nimo de salida:/i.test(part)) {
      result.minimo = part.replace(/^m[ií]nimo de salida:\s*/i, "").trim();
    } else if (/^extras:/i.test(part)) {
      result.extras = part.replace(/^extras:\s*/i, "").trim();
    } else if (!result.inclusion) {
      result.inclusion = formatInclusionForWhatsApp(part);
    } else {
      result.inclusion = formatInclusionForWhatsApp(`${result.inclusion} ${part}`);
    }
  }

  if (result.extras) {
    const extraText = formatInclusionForWhatsApp(result.extras, 180);
    result.inclusion = result.inclusion
      ? `${result.inclusion} Extras: ${extraText}`
      : `Extras: ${extraText}`;
  }

  return result;
}

/** @deprecated Reemplazado por loadGammaKnowledgeFromSheet — no exponer URLs al cliente. */
export function sheetRowsToGammaIndex(_rows: SheetCatalogRow[]): string {
  return "";
}
