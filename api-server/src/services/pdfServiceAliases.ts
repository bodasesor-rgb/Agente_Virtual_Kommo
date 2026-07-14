/**
 * Sinónimos / alias para emparejar lo que dice el cliente
 * con el PDF correcto (evita confusiones banquete↔taquiza, sushi↔comida, etc.).
 */

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
  /** Clave canónica corta usada en matching. */
  key: string;
  /** Tokens/frases que apuntan a esta familia. */
  aliases: string[];
  /** Palabras que DEBEN aparecer en el PDF/label para cerrar el match (opcional). */
  pdfHints: string[];
  /** Si el query trae estos exclusores, no forzar esta familia. */
  excludeIf?: string[];
};

/**
 * Familias alineadas a los PDFs de "Catalogó bodasesor 2026 finales".
 * Orden: más específicas primero.
 */
export const PDF_ALIAS_FAMILIES: PdfAliasFamily[] = [
  {
    key: "banquete_kosher",
    aliases: ["kosher", "banquete kosher", "comida kosher", "menu kosher"],
    pdfHints: ["kosher"],
  },
  {
    key: "banquete_navideno",
    aliases: ["navideno", "navideño", "cena navidad", "banquete navidad", "navidad"],
    pdfHints: ["navideno", "navideño", "navidad"],
  },
  {
    key: "banquete_mexicano",
    aliases: ["banquete mexicano", "comida mexicana", "mexicano formal", "menu mexicano"],
    pdfHints: ["mexicano"],
    excludeIf: ["taquiza", "tacos", "antojitos"],
  },
  {
    key: "banquete_formal",
    aliases: [
      "banquete formal",
      "banquete",
      "comida formal",
      "menu formal",
      "servicio a la rusa",
      "4 tiempos",
      "tres tiempos",
      "3 tiempos",
      "plated",
      "emplatado",
    ],
    pdfHints: ["banquete formal", "banquete"],
    excludeIf: ["mexicano", "navideno", "navideño", "kosher", "taquiza", "tacos"],
  },
  {
    key: "taquiza",
    aliases: [
      "taquiza",
      "tacos",
      "taco",
      "taquiza de",
      "estacion de tacos",
      "barra de tacos",
      "tacos al pastor",
      "guisados",
    ],
    pdfHints: ["taquiza"],
    excludeIf: ["parrillada tacos", "parrillada"],
  },
  {
    key: "parrillada_argentina",
    aliases: [
      "parrillada argentina",
      "parillada argentina",
      "asado argentino",
      "asado",
      "carne argentina",
      "cortes argentinos",
      "argentino",
    ],
    pdfHints: ["parrillada argentina", "parillada argentina", "argentina"],
  },
  {
    key: "parrillada_tacos",
    aliases: ["parrillada tacos", "parrillada de tacos", "tacos parrilla"],
    pdfHints: ["parrillada tacos", "parrillada"],
  },
  {
    key: "sushi",
    aliases: [
      "sushi",
      "poke",
      "poke bowl",
      "barra de sushi",
      "comida japonesa",
      "japones",
      "japonés",
      "rolls",
      "rollos",
      "nigiri",
      "sashimi",
      "makis",
    ],
    pdfHints: ["sushi", "poke"],
  },
  {
    key: "coffee_break",
    aliases: [
      "coffee break",
      "coffeebreak",
      "coffee",
      "barra de cafe",
      "barra de café",
      "cafe para junta",
      "café para junta",
      "stand de cafe",
      "stand de café",
      "coffee station",
      "breaks",
      "coffee breaks",
    ],
    pdfHints: ["coffee break", "cafe", "café"],
  },
  {
    key: "barra_bebidas",
    aliases: [
      "barra de bebidas",
      "barra de alcohol",
      "bebidas alcoholicas",
      "bebidas alcohólicas",
      "open bar",
      "barra libre",
      "barra alcohol",
    ],
    pdfHints: ["barra de bebidas", "bebidas"],
    excludeIf: ["mocteles", "mocktail", "sin alcohol", "cafe", "café"],
  },
  {
    key: "mocteles",
    aliases: ["mocteles", "mocktails", "mocktail", "sin alcohol", "barra sin alcohol"],
    pdfHints: ["mocteles"],
  },
  {
    key: "cocteles",
    aliases: ["cocteles", "cócteles", "mixologia", "mixología", "bartender", "cocteleria", "coctelería"],
    pdfHints: ["cocteles", "mixologia", "mixología"],
  },
  {
    key: "barra_americana",
    aliases: ["barra americana", "americana", "comida americana", "hot dogs", "hamburguesas"],
    pdfHints: ["americana"],
  },
  {
    key: "barra_yucateca",
    aliases: ["barra yucateca", "yucateca", "comida yucateca", "cochinita"],
    pdfHints: ["yucateca"],
  },
  {
    key: "pizza",
    aliases: ["pizza", "pizzas", "barra de pizzas", "barra pizza"],
    pdfHints: ["pizza"],
  },
  {
    key: "crepas",
    aliases: ["crepas", "crepes", "barra de crepas"],
    pdfHints: ["crepas", "crepa"],
  },
  {
    key: "mariscos",
    aliases: ["mariscos", "barra de mariscos", "seafood", "camaron", "camarón", "ostiones"],
    pdfHints: ["mariscos"],
  },
  {
    key: "paninis",
    aliases: ["paninis", "panini", "sandwiches", "sándwiches"],
    pdfHints: ["paninis", "panini"],
  },
  {
    key: "pastas",
    aliases: ["pastas", "ensaladas", "barra de pastas", "pasta", "italian food", "italiana"],
    pdfHints: ["pastas", "ensaladas"],
  },
  {
    key: "paella",
    aliases: ["paella", "paellas", "comida española", "española"],
    pdfHints: ["paella"],
  },
  {
    key: "pozole",
    aliases: ["pozole", "tostadas", "pozole y tostadas"],
    pdfHints: ["pozole", "tostadas"],
  },
  {
    key: "antojitos",
    aliases: ["antojitos", "puestos de comida", "street food", "comida mexicana casual"],
    pdfHints: ["antojitos", "puestos"],
  },
  {
    key: "canapes",
    aliases: ["canapes", "canapés", "bocadillos", "botanas finas", "finger food"],
    pdfHints: ["canapes", "canapés", "bocadillos"],
  },
  {
    key: "bocadillos",
    aliases: ["bocadillos", "bocadillo"],
    pdfHints: ["bocadillos"],
  },
  {
    key: "desayuno",
    aliases: ["desayuno", "desayunos", "breakfast", "getting ready desayuno"],
    pdfHints: ["desayuno"],
  },
  {
    key: "comida_corrida",
    aliases: ["comida corrida", "menu del dia", "menú del día"],
    pdfHints: ["comida corrida", "corrida"],
  },
  {
    key: "snacks",
    aliases: ["snacks", "carrito de snacks", "botanas", "snack"],
    pdfHints: ["snacks", "snack"],
  },
  {
    key: "mesa_dulces",
    aliases: ["mesa de dulces", "dulces", "candy bar"],
    pdfHints: ["mesa de dulces", "dulces"],
    excludeIf: ["postres", "cupcakes"],
  },
  {
    key: "mesa_postres",
    aliases: ["mesa de postres", "postres", "dessert bar"],
    pdfHints: ["mesa de postres", "postres"],
  },
  {
    key: "mesa_quesos",
    aliases: ["mesa de quesos", "quesos", "tabla de quesos", "grazing"],
    pdfHints: ["quesos"],
  },
  {
    key: "cupcakes",
    aliases: ["cupcakes", "cupcake", "pastelitos"],
    pdfHints: ["cupcakes"],
  },
  {
    key: "helados",
    aliases: ["helados", "paletas", "paletas de hielo", "nieve"],
    pdfHints: ["helados", "paletas"],
  },
  {
    key: "mobiliario",
    aliases: ["mobiliario", "mesas y sillas", "mesas", "sillas", "renta de mesas"],
    pdfHints: ["mesas", "sillas", "mobiliario"],
  },
  {
    key: "salas_periqueras",
    aliases: ["periqueras", "salas lounge", "lounge", "salas"],
    pdfHints: ["periqueras", "salas"],
  },
  {
    key: "pista_tarima",
    aliases: ["pista", "pista de baile", "tarima", "dance floor"],
    pdfHints: ["pista", "tarima"],
  },
  {
    key: "audio_video",
    aliases: ["audio", "iluminacion", "iluminación", "video", "pantallas", "dj setup", "sonido"],
    pdfHints: ["audio", "iluminacion", "video"],
  },
  {
    key: "colgantes",
    aliases: ["colgantes", "decoracion aerea", "decoración aérea", "aerea"],
    pdfHints: ["colgantes", "aerea", "aérea"],
  },
  {
    key: "entelados",
    aliases: ["entelados", "entelado", "toldo techo", "techo tela"],
    pdfHints: ["entelados", "entelado"],
  },
  {
    key: "vajillas",
    aliases: ["vajillas", "vajilla", "loza", "cristaleria", "cristalería"],
    pdfHints: ["vajillas", "vajilla"],
  },
  {
    key: "fiesta_infantil",
    aliases: ["fiesta infantil", "infantil", "kids", "niños", "ninos", "softplay", "inflables"],
    pdfHints: ["infantil", "fiesta infantil"],
  },
];

/** Expande el query del cliente con sinónimos / familias de PDF. */
export function expandQueryWithPdfSynonyms(query: string): {
  tokens: string[];
  familyKeys: string[];
  boostedHints: string[];
} {
  const q = norm(query);
  const baseTokens = q.split(" ").filter((w) => w.length >= 3);
  const familyKeys: string[] = [];
  const boostedHints: string[] = [];
  const extraTokens = new Set<string>(baseTokens);

  for (const fam of PDF_ALIAS_FAMILIES) {
    if (fam.excludeIf?.some((ex) => q.includes(norm(ex)))) {
      // si hay exclusor fuerte y el alias no es muy específico, saltar
      const specificHit = fam.aliases.some((a) => {
        const na = norm(a);
        return na.includes(" ") && q.includes(na);
      });
      if (!specificHit) continue;
    }

    const hit = fam.aliases.some((a) => {
      const na = norm(a);
      if (na.includes(" ")) return q.includes(na);
      return new RegExp(`\\b${na}\\b`).test(q);
    });
    if (!hit) continue;

    familyKeys.push(fam.key);
    for (const h of fam.pdfHints) {
      const nh = norm(h);
      boostedHints.push(nh);
      for (const t of nh.split(" ")) if (t.length >= 3) extraTokens.add(t);
    }
    for (const a of fam.aliases) {
      const na = norm(a);
      for (const t of na.split(" ")) if (t.length >= 3) extraTokens.add(t);
    }
  }

  return {
    tokens: [...extraTokens],
    familyKeys,
    boostedHints: [...new Set(boostedHints)],
  };
}

/** Alias derivados del nombre del PDF para indexar la ficha. */
export function aliasesForPdfLabel(fileName: string, serviceLabel: string): string[] {
  const hay = norm(`${fileName} ${serviceLabel}`);
  const out = new Set<string>();
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
  const expanded = expandQueryWithPdfSynonyms(query);
  if (!expanded.familyKeys.length && !expanded.boostedHints.length) return 0;

  const hay = norm(`${fileName} ${serviceLabel} ${aliases.join(" ")}`);
  let score = 0;

  for (const hint of expanded.boostedHints) {
    if (hay.includes(hint)) score += hint.includes(" ") ? 22 : 14;
  }

  for (const key of expanded.familyKeys) {
    if (aliases.includes(key) || hay.includes(key.replace(/_/g, " "))) score += 18;
  }

  // Penaliza mismatch clásico: cliente pide taquiza y el PDF es banquete formal
  if (expanded.familyKeys.includes("taquiza") && /banquete/.test(hay) && !/taquiza/.test(hay)) {
    score -= 25;
  }
  if (expanded.familyKeys.includes("banquete_formal") && /taquiza/.test(hay)) {
    score -= 25;
  }
  if (expanded.familyKeys.includes("sushi") && /banquete|taquiza/.test(hay) && !/sushi|poke/.test(hay)) {
    score -= 25;
  }
  if (
    expanded.familyKeys.includes("banquete_mexicano") &&
    /banquete formal/.test(hay) &&
    !/mexicano/.test(hay)
  ) {
    score -= 20;
  }

  return score;
}
