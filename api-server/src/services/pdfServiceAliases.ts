/**
 * Sinónimos / alias PDF — delega a serviceSynonyms (defaults + Sheet).
 */
import {
  defaultFamiliesAsPdfAliases,
  expandQueryWithServiceSynonyms,
  synonymScoreForService,
  synonymsForServiceName,
} from "./serviceSynonyms.js";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type PdfAliasFamily = {
  key: string;
  aliases: string[];
  pdfHints: string[];
  excludeIf?: string[];
};

export const PDF_ALIAS_FAMILIES: PdfAliasFamily[] = defaultFamiliesAsPdfAliases();

/** Expande el query del cliente con sinónimos / familias de PDF. */
export function expandQueryWithPdfSynonyms(query: string): {
  tokens: string[];
  familyKeys: string[];
  boostedHints: string[];
} {
  const expanded = expandQueryWithServiceSynonyms(query);
  return {
    tokens: expanded.tokens,
    familyKeys: expanded.familyKeys,
    boostedHints: expanded.boostedHints,
  };
}

/** Alias derivados del nombre del PDF para indexar la ficha. */
export function aliasesForPdfLabel(fileName: string, serviceLabel: string): string[] {
  const hay = norm(`${fileName} ${serviceLabel}`);
  const out = new Set<string>(synonymsForServiceName(serviceLabel).map(norm));
  for (const t of hay.split(" ").filter((w) => w.length >= 3)) out.add(t);

  for (const fam of PDF_ALIAS_FAMILIES) {
    const matchesHint = fam.pdfHints.some((h) => hay.includes(norm(h)));
    if (!matchesHint) continue;
    out.add(fam.key);
    for (const a of fam.aliases) {
      const na = norm(a);
      out.add(na);
      for (const t of na.split(" ")) if (t.length >= 3) out.add(t);
    }
  }
  return [...out];
}

/** Bonus de score si el query (vía sinónimos) apunta a este PDF. */
export function synonymScoreForPdf(
  query: string,
  fileName: string,
  serviceLabel: string,
  aliases: string[] = []
): number {
  const base = synonymScoreForService(query, `${serviceLabel} ${fileName}`, aliases.join(", "));
  return base;
}
