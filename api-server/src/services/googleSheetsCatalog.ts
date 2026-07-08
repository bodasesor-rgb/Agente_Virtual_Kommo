/**
 * Lee catálogo/precios desde Google Sheets vía export CSV público.
 * Config: GOOGLE_SHEETS_CATALOG_CSV_URL o GOOGLE_SHEETS_CATALOG_ID + GID.
 */

export interface SheetCatalogRow {
  servicio: string;
  categoria: string;
  precio: string;
  unidad: string;
  notas: string;
  tienePrecio: boolean;
}

export interface SheetCatalogResult {
  rows: SheetCatalogRow[];
  sourceUrl: string;
  fetchedAt: string;
}

const HEADER_ALIASES: Record<string, keyof Omit<SheetCatalogRow, "tienePrecio">> = {
  servicio: "servicio",
  service: "servicio",
  nombre: "servicio",
  producto: "servicio",
  categoria: "categoria",
  categoría: "categoria",
  category: "categoria",
  tipo: "categoria",
  precio: "precio",
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

export function buildSheetsCsvUrl(): string | null {
  const direct = process.env["GOOGLE_SHEETS_CATALOG_CSV_URL"]?.trim();
  if (direct) return direct;

  const sheetId = process.env["GOOGLE_SHEETS_CATALOG_ID"]?.trim();
  if (!sheetId) return null;

  const gid = process.env["GOOGLE_SHEETS_CATALOG_GID"]?.trim() || "0";
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

export function buildSheetsTextCsvUrl(): string | null {
  const direct = process.env["GOOGLE_SHEETS_CATALOG_TEXT_CSV_URL"]?.trim();
  if (direct) return direct;

  const sheetId = process.env["GOOGLE_SHEETS_CATALOG_ID"]?.trim();
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

  headers.forEach((h, i) => {
    if (h === "tiene_precio" || h === "tiene precio" || h === "con_precio" || h === "listed_price") {
      tienePrecioCol = i;
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

    const servicio = get("servicio");
    if (!servicio || /^#|comentario|ignore/i.test(servicio)) continue;

    const precio = get("precio");
    const flag =
      tienePrecioCol !== null ? truthyPrecioFlag(line[tienePrecioCol]) : null;
    const tienePrecio =
      flag === true || (flag === null && rowHasPriceValue(precio));

    rows.push({
      servicio,
      categoria: get("categoria"),
      precio,
      unidad: get("unidad"),
      notas: get("notas"),
      tienePrecio,
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
      if (item.notas) lines.push(`  ${item.notas}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
