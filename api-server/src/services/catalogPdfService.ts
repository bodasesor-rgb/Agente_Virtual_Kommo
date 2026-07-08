/**
 * Resuelve qué PDF enviar al cliente según el Sheet, la conversación o el cierre.
 */

import type { ExtractedData } from "../types.js";
import {
  lookupCatalogServices,
  getCatalogSnapshot,
} from "./catalogService.js";
import { parseRowNotes, type SheetCatalogRow } from "./googleSheetsCatalog.js";
import {
  deliverPdfToClient,
  isClientSafePdfUrl,
  isPdfDeliveryEnabled,
  pdfFilenameFromUrl,
  type PdfDeliveryResult,
} from "./pdfDelivery.js";

/** PDF general de cierre (Shopify) — override con LUCY_DEFAULT_CATALOG_PDF_URL */
export const DEFAULT_CATALOG_PDF_URL =
  process.env["LUCY_DEFAULT_CATALOG_PDF_URL"]?.trim() ||
  "https://cdn.shopify.com/s/files/1/0809/1215/4936/files/Catalogo-Menus-Bodasesor-2026_4_b5efa97c-ce47-4bef-b189-aca2d91fefa7.pdf?v=1778695499";

const PDF_ON_CLOSING = process.env["LUCY_PDF_ON_CLOSING"]?.trim().toLowerCase() !== "false";

/** Evita reenviar el mismo PDF al mismo lead en la misma sesión del servidor. */
const pdfSentByLead = new Map<string, Set<string>>();

export interface ResolvedCatalogPdf {
  url:      string;
  filename: string;
  label:    string;
  source:   "sheet" | "default" | "env";
}

export function clientAsksForCatalogPdf(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /\b(cat[aá]logo|catalogo)\b/i.test(t) ||
    /\b(pdf|folleto|brochure)\b/i.test(t) ||
    /\b(men[uú]|menues)\b/i.test(t) ||
    /\b(m[aá]ndame|m[aá]ndenme|env[ií]ame|env[ií]enme|p[aá]same|p[aá]senme|comp[aá]rteme)\b.*\b(cat[aá]logo|pdf|men[uú])\b/i.test(t) ||
    /\b(tienen|tienes|hay)\b.*\b(cat[aá]logo|pdf|men[uú])\b/i.test(t)
  );
}

function pdfFromRow(row: SheetCatalogRow): string | null {
  if (row.linkPdf?.trim() && isClientSafePdfUrl(row.linkPdf)) {
    return row.linkPdf.trim();
  }
  const parsed = parseRowNotes(row.notas);
  if (parsed.linkPdf && isClientSafePdfUrl(parsed.linkPdf)) return parsed.linkPdf;
  // Link legacy en notas que sea PDF directo (no Gamma)
  if (parsed.gammaLink && isClientSafePdfUrl(parsed.gammaLink)) return parsed.gammaLink;
  return null;
}

function serviceLabel(row: SheetCatalogRow): string {
  return row.categoria || row.servicio.split(" (")[0] || row.servicio;
}

/** Busca PDF en el Sheet según lo que preguntó el cliente o los requerimientos capturados. */
export function resolveCatalogPdfForQuery(
  query: string,
  extracted?: ExtractedData | null
): ResolvedCatalogPdf | null {
  const searchText = [query, extracted?.requerimientos_evento, extracted?.tipo_evento]
    .filter(Boolean)
    .join(" ");

  const matches = lookupCatalogServices(searchText);
  const seen = new Set<string>();

  for (const row of matches) {
    const url = pdfFromRow(row);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const label = serviceLabel(row);
    return {
      url,
      filename: pdfFilenameFromUrl(url, `Catalogo-${label}`),
      label,
      source: "sheet",
    };
  }

  return null;
}

export function resolveDefaultCatalogPdf(): ResolvedCatalogPdf | null {
  if (!isClientSafePdfUrl(DEFAULT_CATALOG_PDF_URL)) return null;
  return {
    url: DEFAULT_CATALOG_PDF_URL,
    filename: pdfFilenameFromUrl(DEFAULT_CATALOG_PDF_URL, "Catalogo-Bodasesor"),
    label: "Catálogo Bodasesor",
    source: DEFAULT_CATALOG_PDF_URL === process.env["LUCY_DEFAULT_CATALOG_PDF_URL"]?.trim() ? "env" : "default",
  };
}

export interface MaybeSendPdfOpts {
  to:                string;
  entityId:          string | number;
  clientMessage:     string;
  /** true en el turno donde se envía el mensaje de cierre */
  sendClosingCatalog?: boolean;
  extracted?:        ExtractedData | null;
}

export interface MaybeSendPdfResult {
  attempted: boolean;
  results:   PdfDeliveryResult[];
  pdfs:      ResolvedCatalogPdf[];
}

function markPdfSent(entityKey: string, url: string): boolean {
  let set = pdfSentByLead.get(entityKey);
  if (!set) {
    set = new Set();
    pdfSentByLead.set(entityKey, set);
  }
  if (set.has(url)) return false;
  set.add(url);
  return true;
}

/**
 * Decide si enviar PDF y lo entrega al cliente.
 * - Cierre: catálogo general (una vez por lead)
 * - Pregunta explícita: PDF del servicio en Sheet o catálogo general
 */
export async function maybeSendCatalogPdf(opts: MaybeSendPdfOpts): Promise<MaybeSendPdfResult> {
  const empty: MaybeSendPdfResult = { attempted: false, results: [], pdfs: [] };

  if (!isPdfDeliveryEnabled()) return empty;

  const entityKey = String(opts.entityId);
  const toSend: ResolvedCatalogPdf[] = [];

  if (opts.sendClosingCatalog && PDF_ON_CLOSING) {
    const def = resolveDefaultCatalogPdf();
    if (def) toSend.push(def);
  }

  if (clientAsksForCatalogPdf(opts.clientMessage)) {
    const fromSheet = resolveCatalogPdfForQuery(opts.clientMessage, opts.extracted);
    if (fromSheet) {
      toSend.push(fromSheet);
    } else if (!opts.sendClosingCatalog) {
      const def = resolveDefaultCatalogPdf();
      if (def) toSend.push(def);
    }
  }

  // Dedupe por URL
  const unique = [...new Map(toSend.map((p) => [p.url, p])).values()];
  if (!unique.length) return empty;

  const results: PdfDeliveryResult[] = [];
  const sent: ResolvedCatalogPdf[] = [];

  for (const pdf of unique) {
    if (!markPdfSent(entityKey, pdf.url)) continue;

    const caption =
      pdf.source === "sheet"
        ? `Te envío el catálogo de *${pdf.label}* 📄`
        : "Te envío nuestro catálogo de menús y servicios 📄";

    const result = await deliverPdfToClient({
      to: opts.to,
      pdfUrl: pdf.url,
      filename: pdf.filename,
      caption,
      entityId: opts.entityId,
      fallbackText: true,
    });

    results.push(result);
    if (result.delivered) sent.push(pdf);
    else {
      // Permitir reintento en siguiente mensaje si falló
      pdfSentByLead.get(entityKey)?.delete(pdf.url);
    }
  }

  return {
    attempted: results.length > 0,
    results,
    pdfs: sent,
  };
}

/** Estado para /api/health */
export function getCatalogPdfStatus(): {
  enabled: boolean;
  defaultPdf: boolean;
  sheetRowsWithPdf: number;
  onClosing: boolean;
} {
  const rows = getCatalogSnapshot()?.rows ?? [];
  const withPdf = rows.filter((r) => pdfFromRow(r)).length;
  return {
    enabled: isPdfDeliveryEnabled(),
    defaultPdf: isClientSafePdfUrl(DEFAULT_CATALOG_PDF_URL),
    sheetRowsWithPdf: withPdf,
    onClosing: PDF_ON_CLOSING,
  };
}
