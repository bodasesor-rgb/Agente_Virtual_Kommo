/**
 * Divulgación progresiva de servicios (V8.68 / A14967 generalizado):
 * 1) Menú corto de opciones + ¿quieres detalles de alguno?
 * 2) Tras elegir / pedir detalle → precios, inclusiones y link de catálogo.
 *
 * V8.92: banquete/catering pregunta formal vs casual ANTES del menú Formal/Mexicano.
 *         mobiliario pregunta pieza (mesas/sillas/…) ANTES de modelos.
 */

import type { OpenAI } from "openai";

/** CTA único para TODAS las ramas (niveles Sheet + menús progresivos). A14982. */
export const SERVICE_NIVEL_DETAIL_CTA = "¿Quieres que te dé detalles de alguno?";

/** Menú formal vs casual (A15160 Cecilia). */
export const ALIMENTOS_MODO_CTA =
  "¿Qué te gustaría: un *banquete* más formal, o algo más *casual* tipo catering?";

export type ProgressiveFamily =
  | "banquete"
  | "coffee_break"
  | "barra_bebidas"
  | "barra_alimentos"
  | "barra_cafe"
  | "barra_sushi"
  | "taquiza"
  | "parrillada"
  | "mesa_dulces"
  | "cupcakes_betun"
  | "gastronomia"
  | "mobiliario";

type FamilyDef = {
  family: ProgressiveFamily;
  /** Match familia sin variante concreta. */
  familyPattern: RegExp;
  /** Si matchea, ya eligió variante → ir a detalle. */
  variantPattern: RegExp;
  /** Query Sheet/PDF para el detalle tras elección. */
  detailQueryFromText: (text: string) => string;
  buildMenu: (hint?: string | null) => string;
};

/** Resuelve variante concreta de banquete (Formal/Mexicano/Kosher/Navideño × tiempos). */
export function banqueteDetailQuery(text: string): string {
  const tiempos4 = /\b(4\s*tiempos?|cuatro\s*tiempos?)\b/i.test(text);
  const tiempos3 = /\b(3\s*tiempos?|tres\s*tiempos?)\b/i.test(text);
  if (/\bkosher\b/i.test(text)) {
    if (/\bbuffet\b/i.test(text)) return "Banquete Kosher Buffet";
    if (tiempos4) return "Banquete Kosher 4 tiempos";
    if (tiempos3) return "Banquete Kosher 3 tiempos";
    return "Banquete Kosher";
  }
  if (/\bnavide/i.test(text)) {
    if (tiempos4) return "Banquete Navideño 4 tiempos";
    if (tiempos3) return "Banquete Navideño 3 tiempos";
    return "Banquete Navideño";
  }
  if (/\bmexicano\b/i.test(text)) {
    if (tiempos4) return "Banquete Mexicano 4 tiempos";
    if (tiempos3) return "Banquete Mexicano 3 tiempos";
    // Sin tiempos: familia mexicana (Sheet tiene 3 y 4).
    return "Banquete Mexicano";
  }
  if (/\bformal\b/i.test(text)) {
    if (tiempos4) return "Banquete Formal 4 tiempos";
    if (tiempos3) return "Banquete Formal 3 tiempos";
    return "Banquete Formal";
  }
  // "De tres/cuatro tiempos" sin estilo → Formal (A14947).
  if (tiempos4) return "Banquete Formal 4 tiempos";
  if (tiempos3) return "Banquete Formal 3 tiempos";
  return "banquete";
}

const FAMILIES: FamilyDef[] = [
  {
    family: "banquete",
    familyPattern: /\bbanquetes?\b|\bcatering\b/i,
    variantPattern:
      /\b(formal|mexicano|kosher|navide[nñ]o|buffet|\d\s*tiempos?|tres\s*tiempos?|cuatro\s*tiempos?|3\s*tiempos?|4\s*tiempos?)\b/i,
    detailQueryFromText: banqueteDetailQuery,
    buildMenu: () =>
      [
        "Claro. En *banquete* manejamos varias opciones:",
        "• *Formal* (3 o 4 tiempos)",
        "• *Mexicano* (3 o 4 tiempos)",
        "• *Kosher* (3/4 tiempos o buffet)",
        "• *Navideño* (3 o 4 tiempos)",
        "",
        SERVICE_NIVEL_DETAIL_CTA,
      ].join("\n"),
  },
  {
    family: "coffee_break",
    familyPattern: /\bcoffee\s*break\b|\bcoffeebreak\b|\bcoffe\s*break\b/i,
    variantPattern:
      /\b(?:coffee\s*break|coffe{1,2}e?\s*break)\s*[1-9]\b|\bnivel\s*[1-9]\b|\bopci[oó]n(?:es)?\s*[1-9]\b|\bpaquete\s*[1-9]\b|^(?:el\s+|la\s+)?[1-9]$/i,
    detailQueryFromText: (text) => {
      const m =
        text.match(/\b(?:coffee\s*break|coffe{1,2}e?\s*break)\s*([1-9])\b/i) ||
        text.match(/\b(?:opci[oó]n(?:es)?|paquete|nivel)\s*([1-9])\b/i) ||
        text.match(/^(?:el\s+|la\s+)?([1-9])$/i);
      if (m) return `Coffee Break ${m[1]}`;
      // "quiero ver las opciones" → listar CB 1–5 (no un SKU vacío).
      if (/\b(ver|muestr|muéstr|dame|quiero)\b.{0,24}\bopciones?\b/i.test(text)) {
        return "Coffee Break";
      }
      return "Coffee Break";
    },
    buildMenu: () =>
      [
        "Claro. En *Coffee Break* manejamos estos paquetes (del más esencial al más completo):",
        "1. *Coffee Break 1*",
        "2. *Coffee Break 2*",
        "3. *Coffee Break 3*",
        "4. *Coffee Break 4*",
        "5. *Coffee Break 5*",
        "",
        "El detalle de menús e inclusiones está en el catálogo:",
        "https://bodasesor.com/catalogos/coffee-break",
        "",
        SERVICE_NIVEL_DETAIL_CTA,
      ].join("\n"),
  },
  {
    family: "barra_sushi",
    familyPattern: /\bbarra\s+de\s+sushi\b|\bsushi\b|\bpoke\b/i,
    variantPattern:
      /\b(solo\s+alimentos|b[aá]sic[oa]|tradicional|premium)\b/i,
    detailQueryFromText: (text) => withCatalogNivelQuery("Barra de sushi", text),
    buildMenu: () =>
      [
        "Claro. En *Barra de sushi* manejamos varios niveles (Solo Alimentos, Básico, Tradicional, Premium).",
        "",
        SERVICE_NIVEL_DETAIL_CTA,
      ].join("\n"),
  },
  {
    family: "barra_cafe",
    familyPattern: /\bbarra\s+de\s+caf[eé](?!\p{L})|\bcafeter[ií]a\b|\bbarista\b/iu,
    variantPattern: /\b(solo\s+alimentos|b[aá]sic[oa]|tradicional|premium)\b/i,
    detailQueryFromText: (text) => withCatalogNivelQuery("Barra de Café", text),
    buildMenu: () =>
      [
        "Claro. En *Barra de Café* manejamos niveles con baristas y bebidas artesanales.",
        "",
        SERVICE_NIVEL_DETAIL_CTA,
      ].join("\n"),
  },
  {
    family: "barra_bebidas",
    familyPattern:
      /\bbarra\s+(de\s+)?bebidas?\b|\bbebidas?\s+alcoh[oó]licas?\b|\bmixolog|\bcocteler|\bm[oó]cteles?\b/i,
    variantPattern:
      /\b(solo\s+alimentos|b[aá]sic[oa]|tradicional|premium|americana|yucateca|mixolog|cocteler|m[oó]cteles?|con\s+alcohol|sin\s+alcohol)\b/i,
    detailQueryFromText: (text) => {
      if (/yucateca/i.test(text)) return withCatalogNivelQuery("Barra Yucateca", text);
      if (/americana/i.test(text)) return withCatalogNivelQuery("Barra Americana", text);
      if (/m[oó]cteles?/i.test(text)) return "Mócteles";
      if (/mixolog|cocteler/i.test(text)) return "Coctelería y Mixología";
      if (/con\s+alcohol/i.test(text)) return "Barra de bebidas con Alcohol";
      return withCatalogNivelQuery("Barra de bebidas", text);
    },
    buildMenu: () =>
      [
        "Claro. En bebidas manejamos:",
        "• *Barra de bebidas* (con o sin alcohol)",
        "• *Barra Americana* / *Barra Yucateca*",
        "• *Coctelería / Mixología* y *Mócteles*",
        "",
        SERVICE_NIVEL_DETAIL_CTA,
      ].join("\n"),
  },
  {
    family: "barra_alimentos",
    familyPattern:
      /\bbarra\s+de\s+(alimentos|pizzas?|pastas?|crepas?|mariscos?|paninis?)\b|\bbarras?\s+tem[aá]ticas?\b/i,
    variantPattern:
      /\b(pizzas?|pastas?|ensaladas?|crepas?|mariscos?|paninis?|americana|yucateca|solo\s+alimentos|b[aá]sic|tradicional|premium)\b/i,
    detailQueryFromText: (text) => {
      if (/pizza/i.test(text)) return withCatalogNivelQuery("Barra de pizzas", text);
      if (/pasta|ensalada/i.test(text)) {
        return withCatalogNivelQuery("Barra de pastas y ensaladas", text);
      }
      if (/crepa/i.test(text)) return withCatalogNivelQuery("Barra de Crepas", text);
      if (/marisco/i.test(text)) return withCatalogNivelQuery("Barra de mariscos", text);
      if (/panini/i.test(text)) return withCatalogNivelQuery("Barra de paninis", text);
      if (/yucateca/i.test(text)) return withCatalogNivelQuery("Barra Yucateca", text);
      if (/americana/i.test(text)) return withCatalogNivelQuery("Barra Americana", text);
      return withCatalogNivelQuery("Barra de alimentos", text);
    },
    buildMenu: () =>
      [
        "Claro. En barras de alimentos manejamos varias:",
        "• Pizzas, pastas y ensaladas, crepas, mariscos, paninis",
        "• Americana, Yucateca y más",
        "",
        SERVICE_NIVEL_DETAIL_CTA,
      ].join("\n"),
  },
  {
    family: "taquiza",
    familyPattern: /\btaquiza\b/i,
    variantPattern: /\b(solo\s+alimentos|b[aá]sic[oa]|tradicional|premium)\b/i,
    detailQueryFromText: (text) => withCatalogNivelQuery("taquiza", text),
    buildMenu: () =>
      [
        "Claro. En *taquiza* manejamos varios niveles (Solo Alimentos, Básico, Tradicional, Premium).",
        "",
        SERVICE_NIVEL_DETAIL_CTA,
      ].join("\n"),
  },
  {
    family: "parrillada",
    familyPattern: /\bparrillada\b/i,
    variantPattern: /\bargentina\b|\btacos?\b|\b(solo\s+alimentos|b[aá]sic|tradicional|premium)\b/i,
    detailQueryFromText: (text) => {
      if (/argentina/i.test(text)) {
        return withCatalogNivelQuery("Parrillada Argentina", text);
      }
      if (/\btacos?\b/i.test(text)) {
        return withCatalogNivelQuery("Parrillada Tacos", text);
      }
      return withCatalogNivelQuery("parrillada", text);
    },
    buildMenu: () =>
      [
        "Claro. En *parrillada* tenemos *Parrillada Argentina* y *Parrillada Tacos*.",
        "",
        SERVICE_NIVEL_DETAIL_CTA,
      ].join("\n"),
  },
  {
    family: "cupcakes_betun",
    familyPattern: /\bcupcakes?\b|\bbet[uú]n(es)?(?!\p{L})/iu,
    variantPattern: /\b(cl[aá]sico|decorado|cupcakes?|bet[uú]n)\b/i,
    detailQueryFromText: (text) => {
      if (/decorado/i.test(text)) return "Betún Decorado";
      if (/cl[aá]sico|bet[uú]n/i.test(text) && !/cupcake/i.test(text)) return "Betún Clásico";
      if (/cupcake/i.test(text)) return "Cupcakes";
      return "Cupcakes y Betún";
    },
    buildMenu: () =>
      [
        "Claro. En *Cupcakes y Betún* manejamos *Cupcakes*, *Betún Clásico* y *Betún Decorado*.",
        "",
        SERVICE_NIVEL_DETAIL_CTA,
      ].join("\n"),
  },
  {
    family: "mesa_dulces",
    familyPattern: /\bmesa\s+de\s+(dulces|postres|quesos)\b|\bcarrito\s+de\s+snacks?\b/i,
    variantPattern: /\bmesa\s+de\s+(quesos|postres|dulces)\b|\bcarrito\s+de\s+snacks?\b/i,
    detailQueryFromText: (text) => {
      if (/carrito/i.test(text)) return "Carrito de Snacks";
      if (/queso/i.test(text)) return "Mesa de quesos";
      if (/postre/i.test(text)) return "Mesa de postres";
      return "Mesa de dulces";
    },
    buildMenu: () =>
      [
        "Claro. En dulce manejamos *mesa de dulces*, *mesa de postres*, *mesa de quesos* y *carrito de snacks*.",
        "",
        SERVICE_NIVEL_DETAIL_CTA,
      ].join("\n"),
  },
  {
    family: "gastronomia",
    familyPattern:
      /\bpaellas?\b|\bpozole|\bpuestos?\s+de\s+comida\b|\bantojitos?\b|\bcanap[eé]s?(?!\p{L})|\bbocadillos?\b|\bpaletas?|\bhelados?\b|\bcomida\s+corrida\b/iu,
    variantPattern:
      /\b(paella|pozole|puestos?|antojitos?|canap|bocadillo|paleta|helado|comida\s+corrida)\b/i,
    detailQueryFromText: (text) => {
      if (/paella/i.test(text)) return "Paella";
      if (/pozole/i.test(text)) return "Pozole y Tostadas";
      if (/puesto|antojito/i.test(text)) return "Puestos de Comida";
      if (/canap/i.test(text)) return "Canapés";
      if (/bocadillo/i.test(text)) return "Bocadillos";
      if (/paleta|helado/i.test(text)) return "Paletas de Hielo y Helados";
      if (/comida\s+corrida/i.test(text)) return "Comida Corrida";
      return "gastronomía";
    },
    buildMenu: () =>
      [
        "Claro. En gastronomía manejamos varias opciones:",
        "• Paella, pozole y tostadas, puestos de comida",
        "• Canapés, bocadillos, paletas/helados",
        "• Comida corrida (corporativo)",
        "",
        SERVICE_NIVEL_DETAIL_CTA,
      ].join("\n"),
  },
  {
    family: "mobiliario",
    familyPattern:
      /\bmobiliario\b|\bperiqueras?\b|\bsalas?\s+lounge\b|\bmesas?\s+y\s+sillas?\b|\brenta\s+de\s+(mesas?|sillas?|mobiliario)|\bentelados?\b|\bcolgantes?\b|\bvajillas?\b|\bbarras?\s+de\s+mobiliario\b/i,
    // Pieza concreta (mesas/sillas/…) o modelo (Tiffany/Crossback…).
    variantPattern:
      /\b(periqueras?|lounge|luxor|tiffany|crossback|imperial|ghost|wishbone|tolix|camila|antonella|basket|cabos|caroline|mar[ií]a|avant\s*garde|louis\s*xv|mariantonieta|manteler[ií]a|vajilla|sillas?|mesas?|picnic|bancos?|renta\s+de\s+mesas|entelado|colgante|wisteria)\b/i,
    detailQueryFromText: (text) => {
      if (/entelado|tela\s+(en\s+|de\s+|para\s+)?techo/i.test(text)) {
        return "Entelados para Techo";
      }
      if (/colgante|wisteria|a[eé]rea/i.test(text)) return "Colgantes Premium";
      if (/vajilla|cuberter|cristaler/i.test(text)) return "Vajillas";
      if (/periquera/i.test(text)) return "periqueras";
      if (/lounge|luxor/i.test(text)) return "salas lounge";
      if (/\bsillas?\b/i.test(text)) return "sillas";
      if (/\bmesas?\b|picnic/i.test(text)) return "mesas";
      return "mobiliario";
    },
    buildMenu: () =>
      [
        "Sí, contamos con *mobiliario*. ¿Qué es lo que buscas?",
        "• Mesas",
        "• Sillas",
        "• Periqueras",
        "• Salas lounge",
        "También manejamos vajillas, mantelería, entelados y colgantes.",
        "",
        "Dime qué pieza te interesa y te paso modelos.",
      ].join("\n"),
  },
];

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

// ─── V8.92: formal vs casual (alimentos) + pieza mobiliario ─────────────────

/** Primer paso cuando el cliente dice "banquetes o catering" sin estilo. */
export function buildAlimentosModoMenu(): string {
  return [
    "Claro. ¿Qué te gustaría?",
    "• Un *banquete* para eventos formales (servicio a la mesa, varios tiempos)",
    "• Algo más *casual* tipo catering — por ejemplo: barra de pastas y ensaladas, barra de pizzas, taquiza…",
    "",
    "También manejamos más opciones de alimentos. Dime qué estilo te late y te paso el detalle (o el catálogo general si buscas algo especial).",
  ].join("\n");
}

export function isAlimentosModoMenuReply(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return (
    /banquete.*formal|formal.*banquete|algo m[aá]s \*?casual\*?\s+tipo\s+catering/i.test(text) &&
    /barra de pastas|barra de pizzas|taquiza/i.test(text)
  );
}

export function historyOfferedAlimentosModoMenu(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  return history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .some((m) => isAlimentosModoMenuReply(m.content as string));
}

/** Cliente eligió banquete / formal tras el menú modo. */
export function clientChoseBanqueteFormal(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/\b(casual|barra\s+de|taquiza|pizza|pasta|sushi|pozole|panini|catering\s+casual)\b/i.test(t) &&
      !/\bbanquete\b|\bformal\b/i.test(t)) {
    return false;
  }
  return (
    /\b(quiero|busco|prefiero|mejor|me\s+late|el|un|una)?\s*(banquete|formal)\b/i.test(t) ||
    /^(banquete|formal|el\s+banquete|m[aá]s\s+formal)[\s.!]*$/i.test(t) ||
    /\bbanquete\s+(formal|mexicano|kosher|navide)/i.test(t)
  );
}

/** Cliente eligió catering casual tras el menú modo. */
export function clientChoseCateringCasual(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/\bbanquete\b|\bformal\b/i.test(t) && !/\bcasual\b|\bcatering\b|\bbarra\b|\btaquiza\b/i.test(t)) {
    return false;
  }
  return (
    /\b(casual|catering|barra\s+de|taquiza|pizza|pastas?|sushi|pozole|paninis?|algo\s+m[aá]s\s+(ligero|informal|relajado))\b/i.test(
      t
    ) || /^(casual|catering|m[aá]s\s+casual|algo\s+casual)[\s.!]*$/i.test(t)
  );
}

/** Menú de catering casual tras elegir "casual". */
export function buildCateringCasualMenu(): string {
  return [
    "Perfecto. En *catering* más casual manejamos varias estaciones, por ejemplo:",
    "• Barra de sushi",
    "• Pozole y tostadas",
    "• Barra de paninis",
    "• Barra de pizzas / pastas y ensaladas",
    "• Taquiza, parrillada y más",
    "",
    "Si buscas algo especial, te paso el *catálogo general* para que veas todas las opciones.",
    SERVICE_NIVEL_DETAIL_CTA,
  ].join("\n");
}

export function isMobiliarioPieceMenuReply(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return (
    /contamos con \*mobiliario\*|en \*mobiliario\* manejamos/i.test(text) &&
    /\bmesas\b/i.test(text) &&
    /\bsillas\b/i.test(text) &&
    /qu[eé] es lo que buscas|qu[eé] pieza|dime qu[eé]/i.test(text)
  );
}

export function historyOfferedMobiliarioPieceMenu(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  return history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .some((m) => isMobiliarioPieceMenuReply(m.content as string));
}

/** Cliente eligió pieza de mobiliario (sillas, mesas, periqueras…). */
export function parseMobiliarioPieceChoice(text: string | null | undefined): string | null {
  const t = text?.trim() ?? "";
  if (!t) return null;
  if (/\b(periqueras?)\b/i.test(t)) return "periqueras";
  if (/\b(salas?\s+lounge|lounge)\b/i.test(t)) return "salas lounge";
  if (/\b(vajillas?|manteler[ií]a)\b/i.test(t)) return "vajillas";
  if (/\b(entelados?)\b/i.test(t)) return "entelados";
  if (/\b(colgantes?)\b/i.test(t)) return "colgantes";
  if (/\bsillas?\b/i.test(t)) return "sillas";
  if (/\bmesas?\b|\bpicnic\b/i.test(t)) return "mesas";
  return null;
}

/** Menú de modelos de sillas (tras elegir "sillas"). */
export function buildSillasModelMenu(): string {
  return [
    "Claro. En *sillas* manejamos varios modelos; por ejemplo:",
    "• *Tiffany* (clásica / versátil)",
    "• *Crossback* (rústico / vintage)",
    "• *Ghost* (minimalista)",
    "• *Camila*, *Tolix*, *Wishbone*, *Louis XV* y más",
    "",
    "¿De cuál te paso detalle, o te mando el *catálogo de mesas y sillas*?",
  ].join("\n");
}

export function isSillasModelMenuReply(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return (
    /en \*sillas\* manejamos|modelos.*sillas|sillas.*modelos/i.test(text) &&
    /tiffany/i.test(text) &&
    /crossback|ghost/i.test(text)
  );
}

export function buildMesasModelMenu(): string {
  return [
    "Claro. En *mesas* manejamos varias líneas; por ejemplo:",
    "• Mesas *Vintage* (blanco luminoso)",
    "• Mesas *Caoba Natural*",
    "• Mesas *Mármol*",
    "• Mesas *picnic* / tablones y más",
    "",
    "¿De cuál te paso detalle, o te mando el *catálogo de mesas y sillas*?",
  ].join("\n");
}

export function buildMobiliarioPieceFollowUp(piece: string): string {
  const p = piece.toLowerCase();
  if (p === "sillas") return buildSillasModelMenu();
  if (p === "mesas") return buildMesasModelMenu();
  if (p === "periqueras") {
    return [
      "Claro. En *periqueras* manejamos varios estilos y colores para barra o zona de pie.",
      "",
      "¿Quieres que te dé detalles o te paso el catálogo de salas y periqueras?",
    ].join("\n");
  }
  if (p === "salas lounge") {
    return [
      "Claro. En *salas lounge* manejamos varios sets (Vintage Capitoneada, Black Trendy, Luxor y más).",
      "",
      "¿Quieres que te dé detalles de alguno o te paso el catálogo?",
    ].join("\n");
  }
  return [
    `Claro. Anoto *${piece}*.`,
    "",
    SERVICE_NIVEL_DETAIL_CTA,
  ].join("\n");
}

/**
 * Extrae etiqueta de nivel para queries Sheet (A14975).
 * "Nivel tradicional" → "Tradicional"; "básico" → "Basico".
 */
export function catalogNivelLabelFromText(text: string | null | undefined): string | null {
  const t = fold(text ?? "");
  if (!t) return null;
  if (/\bsolo\s+alimentos?\b/.test(t)) return "Solo Alimentos";
  if (/\btradicional\b/.test(t)) return "Tradicional";
  if (/\bpremium\b/.test(t)) return "Premium";
  if (/\bbasic[ao]\b/.test(t)) return "Basico";
  return null;
}

/** "Barra de sushi" + "Nivel tradicional" → "Barra de sushi Tradicional". */
export function withCatalogNivelQuery(
  baseService: string,
  text: string | null | undefined
): string {
  const base = baseService.trim();
  const nivel = catalogNivelLabelFromText(text);
  if (!nivel) return base;
  if (new RegExp(`\\b${nivel.replace(/\s+/g, "\\s+")}\\b`, "i").test(base)) return base;
  return `${base} ${nivel}`;
}

/**
 * Fingerprint del menú progresivo (opciones ANTES del dump de precios).
 * No confundir con dump Sheet "Para *X* manejamos estos niveles… ¿detalles de alguno?" (A14982).
 */
export function isProgressiveOptionsMenuReply(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text;
  // V8.92: formal vs casual / pieza de mobiliario / modelos de sillas.
  if (isAlimentosModoMenuReply(t) || isMobiliarioPieceMenuReply(t) || isSillasModelMenuReply(t)) {
    return true;
  }
  // Menú corto de familia: "Claro. En *banquete/taquiza/…*"
  if (
    /claro\.\s*en\s+\*|claro\.\s*en\s+(bebidas|barras|dulce|gastronom)/i.test(t) ||
    /opciones principales|¿Cu[aá]l estilo te late|s[ií],?\s+contamos con \*mobiliario\*/i.test(t) ||
    /manejamos estos paquetes|coffee\s*break\s*1[\s\S]{0,120}coffee\s*break\s*5/i.test(t)
  ) {
    return /detalles de alguno|info m[aá]s detallada|te paso la info|de cu[aá]l te paso|estilo te late|diferencia entre ellos|qu[eé] es lo que buscas|dime qu[eé] pieza|modelos|catalogos\/coffee-break|cat[aá]logo/i.test(
      t
    );
  }
  return false;
}

/** Menú de opciones ya ofrecido por Lucy (anti-repetición). */
export function historyOfferedServiceOptionsMenu(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  return history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .some((m) => isProgressiveOptionsMenuReply(m.content as string));
}

/** SKUs a detallar cuando el cliente dice "sí" sin elegir variante. */
const FAMILY_ALL_DETAIL_QUERIES: Record<ProgressiveFamily, string[]> = {
  banquete: [
    "Banquete Formal 3 tiempos",
    "Banquete Formal 4 tiempos",
    "Banquete Mexicano 3 tiempos",
    "Banquete Mexicano 4 tiempos",
    "Banquete Kosher 3 tiempos",
    "Banquete Kosher 4 tiempos",
    "Banquete Kosher Buffet",
    "Banquete Navideño 3 tiempos",
    "Banquete Navideño 4 tiempos",
  ],
  coffee_break: ["Coffee Break"],
  barra_bebidas: [
    "Barra de bebidas",
    "Barra Americana",
    "Barra Yucateca",
    "Mócteles",
    "Coctelería y Mixología",
  ],
  barra_alimentos: [
    "Barra de pizzas",
    "Barra de pastas y ensaladas",
    "Barra de Crepas",
    "Barra de mariscos",
    "Barra de paninis",
  ],
  barra_cafe: ["Barra de Café"],
  barra_sushi: ["Barra de sushi"],
  taquiza: ["taquiza"],
  parrillada: ["Parrillada Argentina", "Parrillada Tacos"],
  mesa_dulces: ["Mesa de dulces", "Mesa de postres", "Mesa de quesos", "Carrito de Snacks"],
  cupcakes_betun: ["Cupcakes", "Betún Clásico", "Betún Decorado"],
  gastronomia: [
    "Paella",
    "Pozole y Tostadas",
    "Puestos de Comida",
    "Canapés",
    "Bocadillos",
    "Paletas de Hielo y Helados",
    "Comida Corrida",
  ],
  mobiliario: [
    "mesas y sillas",
    "salas lounge",
    "periqueras",
    "Entelados para Techo",
    "Colgantes Premium",
    "Vajillas",
  ],
};

export function progressiveFamilyDetailQueries(family: ProgressiveFamily): string[] {
  return FAMILY_ALL_DETAIL_QUERIES[family] ?? [family];
}

/** Cliente afirmó el menú sin nombrar variante ("sí", "dale", "todos"). */
export function isBareProgressiveAffirmation(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /^(si|sí|dale|ok|okay|claro|por\s+favor|porfa|va|jalo|me\s+late|todos|todas|el\s+detalle|detallame|detállame|m[aá]ndame\s+(la\s+)?info|dame\s+(la\s+)?info|quiero\s+(ver\s+)?(el\s+)?detalle)[\s.!]*$/i.test(
    t
  );
}

/** Cliente pide detalle / elige tras el menú. */
export function clientWantsServiceDetail(
  text: string | null | undefined,
  history?: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  const n = fold(t);
  if (
    /^(si|sí|dale|ok|okay|claro|por\s+favor|porfa|va|jalo|me\s+late|todos|todas|el\s+detalle|detallame|detállame|m[aá]ndame\s+(la\s+)?info|dame\s+(la\s+)?info|quiero\s+(ver\s+)?(el\s+)?detalle)[\s.!]*$/i.test(
      t
    )
  ) {
    return !!(history && historyOfferedServiceOptionsMenu(history));
  }
  // A15168: "quiero ver las opciones" / "muéstrame las opciones" tras menú Coffee/banquete.
  if (
    /\b(quiero|necesito|me\s+gustar[ií]a|puedes?|me\s+puedes?)\b.{0,30}\b(ver|verlas|conocer)\b.{0,20}\b(las\s+)?opciones?\b/i.test(
      t
    ) ||
    /^(ver|muestra|muéstra|muestrame|muéstrame|dame|pasa|manda)\s+(las\s+)?opciones?\b/i.test(t) ||
    /^las\s+opciones?\b/i.test(t)
  ) {
    return !!(history && historyOfferedServiceOptionsMenu(history));
  }
  if (
    /\b(dame|pasa|manda|quiero|necesito|me\s+interes[ao])\b.{0,40}\b(detalle|info|informaci[oó]n|precios?|incluye|inclusiones)\b/i.test(
      t
    )
  ) {
    return true;
  }
  // Eligió variante concreta (3 tiempos, formal, coffee break 5, LED…).
  for (const fam of FAMILIES) {
    if (fam.variantPattern.test(t) && fam.familyPattern.test(t + " " + (history ? "" : ""))) {
      return true;
    }
    if (history && historyOfferedServiceOptionsMenu(history) && fam.variantPattern.test(t)) {
      return true;
    }
  }
  // Tras menú de banquete: "el formal", "3 tiempos", "el mexicano"
  // A15168: "opción 1" / "paquete 2" / "el 3" tras Coffee Break 1–5.
  if (history && historyOfferedServiceOptionsMenu(history)) {
    if (
      /\b(formal|mexicano|kosher|navide|3\s*tiempos|4\s*tiempos|tres|cuatro|led|iluminada|pintada|vinil|logo|charol|madera|premium|b[aá]sic|tradicional|solo\s+alimentos|opci[oó]n(?:es)?\s*[1-9]|paquete\s*[1-9]|nivel\s*[1-9]|(?:el\s+|la\s+)?[1-9])\b/i.test(
        t
      ) ||
      /^(?:el\s+|la\s+)?[1-9]$/i.test(t)
    ) {
      return true;
    }
  }
  return false;
}

export function detectProgressiveFamily(
  text: string | null | undefined
): ProgressiveFamily | null {
  const t = text?.trim() ?? "";
  if (!t) return null;
  // Más específico primero (sushi/café antes que alimentos/bebidas).
  for (const fam of FAMILIES) {
    if (fam.familyPattern.test(t)) return fam.family;
  }
  return null;
}

function defFor(family: ProgressiveFamily): FamilyDef {
  return FAMILIES.find((f) => f.family === family)!;
}

/** True si el mensaje ya nombra variante/nivel concreto (puede ir a detalle). */
export function hasConcreteServiceVariant(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  for (const fam of FAMILIES) {
    if (fam.familyPattern.test(t) && fam.variantPattern.test(t)) return true;
  }
  // Nivel suelto con servicio en contexto se maneja en clientWantsServiceDetail.
  return false;
}

export function buildProgressiveOptionsMenu(
  family: ProgressiveFamily,
  hint?: string | null
): string {
  return defFor(family).buildMenu(hint);
}

export function resolveDetailQueryForFamily(
  family: ProgressiveFamily,
  text: string
): string {
  return defFor(family).detailQueryFromText(text);
}

/**
 * ¿Debemos mostrar solo el menú (sin dump de precios/inclusiones)?
 * - Familia mencionada sin variante, y aún no ofrecimos menú.
 * - O cliente no ha pedido detalle explícito.
 */
export function shouldOfferOptionsBeforeDetail(opts: {
  currentMessage?: string | null;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  serviceHint?: string | null;
}): { family: ProgressiveFamily; menu: string } | null {
  const msg = opts.currentMessage?.trim() ?? "";
  const blob = `${msg} ${opts.serviceHint ?? ""}`.trim();
  if (!blob) return null;

  const lastAsst = [...opts.history]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  const lastAsstText =
    lastAsst && typeof lastAsst.content === "string" ? lastAsst.content : "";

  // Ya está en paso de niveles / inclusiones → detalle, no menú de familia.
  if (
    /cu[aá]l\s+nivel|qu[eé]\s+nivel|nivel\s+(prefieres|te\s+interes)|niveles disponibles|qu[eé]\s+incluye\s+cada/i.test(
      lastAsstText
    )
  ) {
    return null;
  }

  const family =
    detectProgressiveFamily(msg) ||
    detectProgressiveFamily(opts.serviceHint) ||
    detectProgressiveFamily(blob);
  if (!family) return null;

  // A14982: CRM con 2+ familias (Yucateca + Taquiza) y el mensaje no elige una →
  // no devolver menú de una sola familia (rompe dump de paquetes / embudo).
  const hintHasMultipleFamilies = (() => {
    const hint = opts.serviceHint?.trim() ?? "";
    if (!hint || !/,| y /.test(hint)) return false;
    const families = new Set(
      hint
        .split(/,|\by\b/i)
        .map((p) => detectProgressiveFamily(p.trim()))
        .filter(Boolean)
    );
    return families.size >= 2;
  })();
  if (hintHasMultipleFamilies && !detectProgressiveFamily(msg)) {
    return null;
  }

  // Variante/nivel en el MENSAJE del cliente (no en el hint CRM expandido "Banquete Formal").
  // Pedir "info/detalle" de la familia SIN variante → igual menú primero.
  const famDef = defFor(family);
  const hasVariantNow =
    hasConcreteServiceVariant(msg) ||
    famDef.variantPattern.test(msg) ||
    /\b(b[aá]sic[oa]|tradicional|premium|solo\s+alimentos)\b/i.test(msg);

  if (hasVariantNow) {
    return null;
  }

  // V8.92: "banquetes o catering" / servicio de banquetes → formal vs casual
  // (buildVagueFoodOptionsReply / buildAlimentosModoMenu), no Formal/Mexicano aún.
  if (
    family === "banquete" &&
    /\bbanquetes?\s+o\s+catering\b|\bcatering\s+o\s+banquetes?\b|\bservicio\s+de\s+banquetes?\b/i.test(
      msg
    ) &&
    !/\b(formal|mexicano|kosher|navide|\d\s*tiempos)\b/i.test(msg)
  ) {
    return null;
  }

  // Tras menú: "sí" / "dame el detalle" → no volver a listar opciones.
  if (
    historyOfferedServiceOptionsMenu(opts.history) &&
    clientWantsServiceDetail(msg, opts.history)
  ) {
    return null;
  }

  // "sí el banquete" / confirmación del servicio ya capturado → embudo, no menú.
  // Ojo: \b NO funciona tras "sí" (í no es \w en JS).
  if (
    /^(si|sí)(?:\s|$|[.!,])/i.test(msg) &&
    famDef.familyPattern.test(msg) &&
    !/\b(detalle|info|informaci[oó]n|precio|incluye|opciones|cotiz)/i.test(msg) &&
    (detectProgressiveFamily(opts.serviceHint) === family ||
      (opts.serviceHint && famDef.familyPattern.test(opts.serviceHint)))
  ) {
    return null;
  }

  // Si el historial ya ofreció menú de ESTA familia y el cliente no eligió, re-preguntar.
  // A14982: menú de otra familia (barra) + pide taquiza → no re-preguntar la anterior.
  if (historyOfferedServiceOptionsMenu(opts.history) && msg.length < 80) {
    const msgFamily = detectProgressiveFamily(msg);
    const hintFamily = detectProgressiveFamily(opts.serviceHint);
    const menuWasOtherFamily =
      !!msgFamily && !!hintFamily && msgFamily !== hintFamily;
    if (menuWasOtherFamily) {
      return { family: msgFamily, menu: buildProgressiveOptionsMenu(msgFamily) };
    }
    if (!msgFamily || msgFamily === family) {
      return {
        family,
        menu: SERVICE_NIVEL_DETAIL_CTA,
      };
    }
  }

  if (historyOfferedServiceOptionsMenu(opts.history)) return null;

  return { family, menu: buildProgressiveOptionsMenu(family, opts.serviceHint) };
}

/** Query de detalle tras menú (mensaje actual o hint). */
export function resolveProgressiveDetailQuery(opts: {
  currentMessage?: string | null;
  serviceHint?: string | null;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
}): string | null {
  const msg = opts.currentMessage?.trim() ?? "";
  const hint = opts.serviceHint?.trim() ?? "";
  const userBlob = [
    ...opts.history
      .filter((m) => m.role === "user" && typeof m.content === "string")
      .map((m) => m.content as string)
      .slice(-6),
    msg,
    hint,
  ]
    .filter(Boolean)
    .join(" ");

  const family =
    detectProgressiveFamily(msg) ||
    detectProgressiveFamily(hint) ||
    detectProgressiveFamily(userBlob);
  if (!family) return null;

  if (hasConcreteServiceVariant(msg)) {
    return resolveDetailQueryForFamily(family, `${msg} ${userBlob}`);
  }
  if (clientWantsServiceDetail(msg, opts.history)) {
    const def = defFor(family);
    // "sí" / "dale" sin elegir variante → no armar detalle genérico (re-preguntar afuera).
    if (
      /^(si|sí|dale|ok|okay|claro|por\s+favor|porfa|va|jalo|me\s+late|todos|todas)[\s.!]*$/i.test(
        msg
      ) &&
      !def.variantPattern.test(msg)
    ) {
      return null;
    }
    if (def.variantPattern.test(msg) || def.familyPattern.test(msg)) {
      return resolveDetailQueryForFamily(family, `${msg} ${userBlob}`);
    }
    // Eligió por palabra clave tras el menú ("formal", "3 tiempos", "LED"…).
    if (historyOfferedServiceOptionsMenu(opts.history) && def.variantPattern.test(msg)) {
      return resolveDetailQueryForFamily(family, `${msg} ${userBlob}`);
    }
    if (
      historyOfferedServiceOptionsMenu(opts.history) &&
      /\b(formal|mexicano|kosher|navide|\d\s*tiempos|tres|cuatro|coffee\s*break\s*[1-9]|b[aá]sic|tradicional|premium|solo\s+alimentos)\b/i.test(
        msg
      )
    ) {
      return resolveDetailQueryForFamily(family, `${msg} ${userBlob}`);
    }
  }
  return null;
}
