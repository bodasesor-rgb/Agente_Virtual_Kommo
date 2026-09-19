/**
 * Modelos de silla del catálogo Mesas-y-Sillas (A16166+).
 * Fuente única: captura CRM, menús, y precios PDF anclados al modelo.
 */

/** Alias → nombre canónico (orden: más específico primero). */
export const CHAIR_MODEL_ALIASES: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /\btiffany\s+infantil\b/i, canonical: "Tiffany Infantil" },
  { pattern: /\blouis\s*xv\b|\bluis\s*xv\b/i, canonical: "Louis XV" },
  { pattern: /\bavant\s*garde\b/i, canonical: "Avant Garde" },
  { pattern: /\bmariantonieta\b/i, canonical: "Mariantonieta" },
  { pattern: /\bmar[ií]a\b/i, canonical: "María" },
  { pattern: /\bwishbone\b/i, canonical: "Wishbone" },
  { pattern: /\btiffany\b/i, canonical: "Tiffany" },
  { pattern: /\bcrossback\b/i, canonical: "Crossback" },
  { pattern: /\bghost\b/i, canonical: "Ghost" },
  { pattern: /\btolix\b/i, canonical: "Tolix" },
  { pattern: /\bcamila\b/i, canonical: "Camila" },
  { pattern: /\bantonella\b/i, canonical: "Antonella" },
  { pattern: /\bbasket\b/i, canonical: "Basket" },
  { pattern: /\bcabos\b/i, canonical: "Cabos" },
  { pattern: /\bcaroline\b/i, canonical: "Caroline" },
  { pattern: /\bsmith\b/i, canonical: "Smith" },
];

/** Fragmento regex de modelos (para familyPattern / guards). */
export function chairModelAlternation(): string {
  return [
    "tiffany\\s+infantil",
    "louis\\s*xv",
    "luis\\s*xv",
    "avant\\s*garde",
    "mariantonieta",
    "wishbone",
    "tiffany",
    "crossback",
    "ghost",
    "tolix",
    "camila",
    "antonella",
    "basket",
    "cabos",
    "caroline",
    "smith",
    "mar[ií]a",
  ].join("|");
}

/** Regex de cualquier modelo (para guards / CRM bare). */
export const CHAIR_MODEL_PATTERN = new RegExp(`\\b(?:${chairModelAlternation()})\\b`, "i");

/** Tokens plegados para ranking de ventanas PDF (más largos primero). */
export const CHAIR_MODEL_FOLD_TOKENS: string[] = [
  "tiffany infantil",
  "louis xv",
  "luis xv",
  "avant garde",
  "mariantonieta",
  "wishbone",
  "tiffany",
  "crossback",
  "ghost",
  "tolix",
  "camila",
  "antonella",
  "basket",
  "cabos",
  "caroline",
  "smith",
  "maria",
];

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** True si el texto nombra un modelo de silla del catálogo. */
export function textMentionsChairModel(text: string | null | undefined): boolean {
  return parseChairModelFromText(text) != null;
}

/**
 * Detecta el modelo de silla (canónico).
 * Evita mesas homónimas (Crossback Caoba mesa) si no hay contexto de silla/precio.
 * Modelos que también son nombres propios (María, Caroline…) exigen contexto de silla/cotización.
 */
export function parseChairModelFromText(text: string | null | undefined): string | null {
  const t = String(text || "").trim();
  if (!t) return null;

  const hasSillas = /\bsillas?\b/i.test(t);
  const hasMesa = /\bmesas?\b/i.test(t);
  const priceOrCotizar =
    /\b(precio|cotiz|cu[aá]nto\s+cuesta|requiero|necesito|quiero|anoto|renta)\b/i.test(t) ||
    /\bmobiliario\b/i.test(t);
  // "mesa crossback caoba" ≠ sillas Crossback
  if (hasMesa && !hasSillas && !priceOrCotizar) return null;
  if (
    hasMesa &&
    !hasSillas &&
    /\bmesa\s+(rectangular|redonda|cuadrada|picnic|centro)\b/i.test(t)
  ) {
    return null;
  }

  const ambiguousNames = new Set([
    "María",
    "Smith",
    "Caroline",
    "Camila",
    "Antonella",
    "Cabos",
    "Basket",
  ]);

  for (const { pattern, canonical } of CHAIR_MODEL_ALIASES) {
    if (!pattern.test(t)) continue;
    if (ambiguousNames.has(canonical) && !hasSillas && !priceOrCotizar) continue;
    return canonical;
  }
  return null;
}

/** Tokens del query que corresponden a modelos (para anclar precios PDF). */
export function chairModelTokensFromQuery(query: string): string[] {
  const f = fold(query);
  const hits: string[] = [];
  for (const tok of CHAIR_MODEL_FOLD_TOKENS) {
    if (f.includes(tok) && !hits.includes(tok)) hits.push(tok);
  }
  const model = parseChairModelFromText(query);
  if (model) {
    const mf = fold(model);
    if (!hits.includes(mf)) hits.unshift(mf);
  }
  return hits;
}

/** Cantidad de sillas si viene junto al modelo / "N sillas". */
export function parseChairQtyFromText(text: string): number | null {
  const t = String(text || "");
  const model = parseChairModelFromText(t);
  if (model) {
    const esc = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const withModel =
      t.match(new RegExp(`(\\d+)\\s*sillas?(?:\\s+\\w+){0,4}\\s*${esc}`, "i")) ||
      t.match(new RegExp(`(\\d+)\\s*(?:sillas?\\s+)?${esc}`, "i"));
    if (withModel?.[1]) return parseInt(withModel[1], 10);
  }
  const plain = t.match(/(\d+)\s*sillas?\b/i);
  return plain?.[1] ? parseInt(plain[1], 10) : null;
}

/** SKU CRM: "100 Sillas Wishbone" / "Sillas Tiffany". */
export function formatChairSku(text: string): string | null {
  const model = parseChairModelFromText(text);
  if (!model) return null;
  const qty = parseChairQtyFromText(text);
  return qty && qty > 0 ? `${qty} Sillas ${model}` : `Sillas ${model}`;
}
