/**
 * Sinónimos por servicio Bodasesor.
 *
 * Fuente 1 (código): defaults abajo — siempre disponibles.
 * Fuente 2 (Sheet): columna "Sinónimos" / "Sinonimos" — se registra al refrescar el catálogo.
 *
 * El matcher de Sheet + el índice PDF los usan para no confundir servicios.
 */

export type ServiceSynonymFamily = {
  /** Clave interna. */
  key: string;
  /** Nombres de servicio en Sheet/PDF que cubre esta familia. */
  serviceHints: string[];
  /** Frases/palabras del cliente. */
  aliases: string[];
  /** Si el query trae estos, no aplicar esta familia (salvo alias multi-palabra específico). */
  excludeIf?: string[];
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Defaults — lista Bodasesor (10 frases por servicio). */
export const DEFAULT_SERVICE_SYNONYM_FAMILIES: ServiceSynonymFamily[] = [
  {
    key: "banquete_formal",
    serviceHints: ["banquete formal", "banquete 3", "banquete 4", "banquete"],
    aliases: [
      "menu formal",
      "menú formal",
      "comida servida",
      "banquete sentado",
      "menu de tiempos",
      "menú de tiempos",
      "comida de plato",
      "servicio a la mesa",
      "comida formal",
      "menu emplatado",
      "menú emplatado",
      "cena formal",
      "banquete de boda",
      "banquete formal",
      "banquete",
      "4 tiempos",
      "3 tiempos",
      "plated",
      "emplatado",
    ],
    excludeIf: ["mexicano", "navideno", "navideño", "kosher", "taquiza", "tacos"],
  },
  {
    key: "banquete_kosher",
    serviceHints: ["kosher"],
    aliases: [
      "kosher",
      "kasher",
      "comida kosher",
      "comida judia",
      "comida judía",
      "menu kosher",
      "menú kosher",
      "certificado rabinico",
      "certificado rabínico",
      "supervision rabinica",
      "supervisión rabínica",
      "banquete judio",
      "banquete judío",
      "comida para evento judio",
      "comida para evento judío",
      "cocina kosher",
    ],
  },
  {
    key: "banquete_mexicano",
    serviceHints: ["banquete mexicano", "mexicano"],
    aliases: [
      "comida mexicana",
      "menu mexicano",
      "menú mexicano",
      "banquete tipico",
      "banquete típico",
      "cena mexicana",
      "comida tradicional",
      "platillos mexicanos",
      "buffet mexicano",
      "banquete mexicano",
      "fiesta mexicana",
      "comida tipica",
      "comida típica",
    ],
    excludeIf: ["taquiza", "tacos", "antojitos", "yucateca"],
  },
  {
    key: "banquete_navideno",
    serviceHints: ["navideno", "navideño", "navidad"],
    aliases: [
      "cena navideña",
      "cena navadena",
      "posada",
      "cena de fin de año",
      "cena de fin de ano",
      "evento decembrino",
      "pavo navideño",
      "pavo navideno",
      "cena de temporada",
      "banquete de navidad",
      "fiesta navideña",
      "fiesta navadena",
      "cena de diciembre",
      "brindis navideño",
      "brindis navideno",
      "navidad",
    ],
  },
  {
    key: "barra_americana",
    serviceHints: ["barra americana", "americana"],
    aliases: [
      "hamburguesas",
      "hot dogs",
      "hotdogs",
      "alitas",
      "comida americana",
      "boneless",
      "sliders",
      "papas y hamburguesas",
      "comida rapida gourmet",
      "comida rápida gourmet",
      "barra americana",
    ],
  },
  {
    key: "barra_bebidas_sin_alcohol",
    serviceHints: ["barra de bebidas", "sin alcohol"],
    aliases: [
      "refrescos",
      "aguas frescas",
      "barra de refrescos",
      "bebidas sin alcohol",
      "vitroleros",
      "solo bebidas",
      "barra de aguas",
      "sodas",
      "bebidas para el evento",
      "barra sin alcohol",
    ],
    excludeIf: ["open bar", "barra libre", "tragos", "licores", "alcohol"],
  },
  {
    key: "barra_bebidas_alcohol",
    serviceHints: ["barra de bebidas", "con alcohol", "bebidas con alcohol"],
    aliases: [
      "barra libre",
      "open bar",
      "bar",
      "cocteleria con alcohol",
      "coctelería con alcohol",
      "tragos",
      "barra de licores",
      "barra con alcohol",
      "bebidas con alcohol",
      "barra de tragos",
      "servicio de bar",
      "barra de bebidas",
    ],
    excludeIf: ["sin alcohol", "mocteles", "mocktail", "cafe", "café"],
  },
  {
    key: "barra_cafe",
    serviceHints: ["barra de cafe", "barra de café", "cafe"],
    aliases: [
      "cafeteria",
      "cafetería",
      "barista",
      "cafe gourmet",
      "café gourmet",
      "estacion de cafe",
      "estación de café",
      "cafe de especialidad",
      "café de especialidad",
      "barra de cafe",
      "barra de café",
      "cafe artesanal",
      "café artesanal",
      "carrito de cafe",
      "carrito de café",
      "cafe para invitados",
      "café para invitados",
      "coffee",
    ],
    excludeIf: ["coffee break", "coffeebreak", "receso", "junta"],
  },
  {
    key: "coffee_break",
    serviceHints: ["coffee break", "coffeebreak"],
    aliases: [
      "coffee break",
      "coffeebreak",
      "receso de cafe",
      "receso de café",
      "cafe para junta",
      "café para junta",
      "break corporativo",
      "estacion de cafe y snacks",
      "estación de café y snacks",
      "pausa de cafe",
      "pausa de café",
      "break de cafe",
      "break de café",
      "receso corporativo",
      "cafe y galletas",
      "café y galletas",
      "stand de cafe",
      "stand de café",
    ],
  },
  {
    key: "barra_crepas",
    serviceHints: ["crepas", "crepa"],
    aliases: [
      "crepas",
      "creperia",
      "crepería",
      "crepes",
      "waffles",
      "postres calientes",
      "estacion de crepas",
      "estación de crepas",
      "crepas dulces",
      "crepas saladas",
      "barra de crepas",
      "crepas gourmet",
    ],
  },
  {
    key: "barra_mariscos",
    serviceHints: ["mariscos"],
    aliases: [
      "mariscos",
      "ceviches",
      "aguachile",
      "coctel de camaron",
      "coctel de camarón",
      "pescados y mariscos",
      "barra de mar",
      "ostiones",
      "tostadas de mariscos",
      "comida del mar",
      "barra de mariscos",
    ],
  },
  {
    key: "barra_paninis",
    serviceHints: ["paninis", "panini"],
    aliases: [
      "paninis",
      "sandwiches",
      "sándwiches",
      "sandwiches gourmet",
      "sándwiches gourmet",
      "baguettes",
      "molletes gourmet",
      "sandwicheria",
      "sandwichería",
      "tortas gourmet",
      "paninos",
      "barra de sandwiches",
      "barra de sándwiches",
      "panini",
    ],
  },
  {
    key: "barra_pastas",
    serviceHints: ["pastas", "ensaladas"],
    aliases: [
      "pastas",
      "espagueti",
      "estacion de pastas",
      "estación de pastas",
      "pasta italiana",
      "ensaladas",
      "barra de pastas",
      "fettuccine",
      "lasana",
      "lasaña",
      "pasta al momento",
      "comida italiana",
      "italiana",
    ],
  },
  {
    key: "barra_pizzas",
    serviceHints: ["pizza", "pizzas"],
    aliases: [
      "pizzas",
      "pizza artesanal",
      "estacion de pizza",
      "estación de pizza",
      "horno de pizza",
      "pizzas gourmet",
      "barra de pizzas",
      "pizza al momento",
      "pizza italiana",
      "pizzeria",
      "pizzería",
      "pizza",
    ],
  },
  {
    key: "barra_sushi",
    serviceHints: ["sushi", "poke"],
    aliases: [
      "sushi",
      "rollos",
      "poke",
      "poke bowls",
      "comida japonesa",
      "makis",
      "barra de sushi",
      "sushi al momento",
      "rollos japoneses",
      "comida oriental",
      "japones",
      "japonés",
      "nigiri",
      "sashimi",
    ],
  },
  {
    key: "barra_yucateca",
    serviceHints: ["yucateca", "yucatan"],
    aliases: [
      "comida yucateca",
      "cochinita",
      "cochinita pibil",
      "panuchos",
      "salbutes",
      "comida del sureste",
      "comida de yucatan",
      "comida de yucatán",
      "papadzules",
      "barra yucateca",
      "comida maya",
    ],
  },
  {
    key: "bocadillos",
    serviceHints: ["bocadillos", "bocadillo"],
    aliases: [
      "botana",
      "botanas",
      "snacks",
      "aperitivos",
      "finger food",
      "bocadillos",
      "entradas",
      "pasabocas",
      "tentempies",
      "tentempiés",
      "comida para picar",
    ],
    excludeIf: ["canapes", "canapés", "carrito"],
  },
  {
    key: "canapes",
    serviceHints: ["canapes", "canapés"],
    aliases: [
      "canapes",
      "canapés",
      "bocaditos",
      "entremeses",
      "bocadillos finos",
      "pasapalos",
      "bocados gourmet",
      "canape",
      "canapé",
      "entradas frias",
      "entradas frías",
    ],
  },
  {
    key: "carrito_snacks",
    serviceHints: ["carrito de snacks", "snacks"],
    aliases: [
      "carrito de botana",
      "snacks",
      "dulces y frituras",
      "carrito de golosinas",
      "botanas para llevar",
      "estacion de snacks",
      "estación de snacks",
      "carrito de dulces",
      "chucherias",
      "chucherías",
      "papitas y dulces",
      "carrito de snacks",
    ],
  },
  {
    key: "cocteles_mixologia",
    serviceHints: ["cocteles", "mixologia", "mixología", "cocteleria"],
    aliases: [
      "cocteles",
      "cócteles",
      "cocteleria",
      "coctelería",
      "mixologia",
      "mixología",
      "bartender",
      "cantinero",
      "tragos de autor",
      "cocktails",
      "barra de cocteles",
      "barra de cócteles",
      "mixologo",
      "mixólogo",
      "cocteles de autor",
      "cócteles de autor",
    ],
    excludeIf: ["sin alcohol", "mocteles", "mocktail"],
  },
  {
    key: "comida_corrida",
    serviceHints: ["comida corrida", "corrida"],
    aliases: [
      "comida corrida",
      "menu del dia",
      "menú del día",
      "comida economica",
      "comida económica",
      "comida para empleados",
      "comida corporativa",
      "menu corporativo",
      "menú corporativo",
      "comida sencilla",
      "comida de oficina",
      "menu ejecutivo",
      "menú ejecutivo",
      "comida rapida",
      "comida rápida",
    ],
  },
  {
    key: "desayuno_brunch",
    serviceHints: ["desayuno", "brunch"],
    aliases: [
      "desayuno",
      "brunch",
      "almuerzo",
      "desayuno buffet",
      "getting ready",
      "desayuno para evento",
      "desayuno social",
      "chilaquiles",
      "huevos",
      "brunch de boda",
    ],
  },
  {
    key: "cupcakes",
    serviceHints: ["cupcakes", "cupcake"],
    aliases: [
      "cupcakes",
      "panquecitos",
      "pastelitos",
      "muffins",
      "cup cakes decorados",
      "postrecitos",
      "cupcakes personalizados",
      "mini pasteles",
      "ponquesitos",
      "cupcakes tematicos",
      "cupcakes temáticos",
      "betun",
      "betún",
      "fondant",
    ],
  },
  {
    key: "mesa_dulces",
    serviceHints: ["mesa de dulces", "dulces"],
    aliases: [
      "mesa de dulces",
      "candy bar",
      "mesa de golosinas",
      "dulcero",
      "mesa de dulces mexicanos",
      "barra de dulces",
      "dulces para evento",
      "mesa de caramelos",
      "estacion de dulces",
      "estación de dulces",
      "candy",
    ],
    excludeIf: ["postres", "cupcakes", "helados"],
  },
  {
    key: "mesa_postres",
    serviceHints: ["mesa de postres", "postres"],
    aliases: [
      "mesa de postres",
      "postres",
      "reposteria",
      "repostería",
      "mesa de pasteles",
      "estacion de postres",
      "estación de postres",
      "dulces finos",
      "postres para evento",
      "pasteleria",
      "pastelería",
      "mesa de dulces finos",
      "barra de postres",
    ],
  },
  {
    key: "mesa_quesos",
    serviceHints: ["mesa de quesos", "quesos"],
    aliases: [
      "tabla de quesos",
      "mesa de quesos",
      "quesos y carnes frias",
      "quesos y carnes frías",
      "charcuteria",
      "charcutería",
      "tabla de embutidos",
      "quesos gourmet",
      "tabla de fiambres",
      "mesa de quesos y vinos",
      "degustacion de quesos",
      "degustación de quesos",
      "tabla gourmet",
      "grazing",
    ],
  },
  {
    key: "mocteles",
    serviceHints: ["mocteles", "mócteles"],
    aliases: [
      "mocteles",
      "mócteles",
      "cocteles sin alcohol",
      "cócteles sin alcohol",
      "bebidas sin alcohol",
      "cocteleria sin alcohol",
      "coctelería sin alcohol",
      "tragos sin alcohol",
      "barra de mocteles",
      "barra de mócteles",
      "bebidas de autor sin alcohol",
      "cocteles virgenes",
      "cócteles vírgenes",
      "mixologia sin alcohol",
      "mixología sin alcohol",
      "mocktails",
      "mocktail",
    ],
  },
  {
    key: "paella",
    serviceHints: ["paella"],
    aliases: [
      "paella",
      "arroz espanol",
      "arroz español",
      "paella valenciana",
      "paella de mariscos",
      "arroz a la valenciana",
      "comida espanola",
      "comida española",
      "paella en vivo",
      "paellera",
      "arroz espanol al momento",
      "arroz español al momento",
      "paellas",
    ],
  },
  {
    key: "paletas_helados",
    serviceHints: ["paletas", "helados"],
    aliases: [
      "paletas",
      "paletas de hielo",
      "helados",
      "nieves",
      "sorbetes",
      "carrito de helados",
      "paletas artesanales",
      "neveria",
      "nevería",
      "paletas heladas",
      "helado para evento",
    ],
  },
  {
    key: "parrillada_argentina",
    serviceHints: ["parrillada argentina", "parillada argentina", "argentina"],
    aliases: [
      "asado argentino",
      "cortes argentinos",
      "parrilla argentina",
      "carnes asadas",
      "asador",
      "parrillada argentina",
      "parillada argentina",
      "cortes finos",
      "asador en vivo",
      "carne al carbon",
      "carne al carbón",
      "parrilla de cortes",
      "asado",
      "carne asada",
      "argentino",
    ],
  },
  {
    key: "taquiza",
    serviceHints: ["taquiza", "parrillada tacos"],
    aliases: [
      "taquiza",
      "tacos",
      "tacos de guisado",
      "taquiza para evento",
      "puesto de tacos",
      "tacos al pastor",
      "tacos de canasta",
      "taquiza a domicilio",
      "tacos de carne asada",
      "taqueria",
      "taquería",
      "estacion de tacos",
      "estación de tacos",
      "barra de tacos",
      "guisados",
      "parrillada tacos",
    ],
    excludeIf: ["parrillada argentina", "asado argentino"],
  },
  {
    key: "pozole_tostadas",
    serviceHints: ["pozole", "tostadas"],
    aliases: [
      "pozole",
      "tostadas",
      "pozole rojo",
      "pozole verde",
      "pozole blanco",
      "pozole y tostadas",
      "pozolada",
      "antojito mexicano",
      "pozole para evento",
      "tostadas de tinga",
      "pozoleria",
      "pozolería",
    ],
  },
  {
    key: "antojitos",
    serviceHints: ["antojitos", "puestos de comida"],
    aliases: [
      "antojitos",
      "puesto de antojitos",
      "esquites",
      "elotes",
      "quesadillas",
      "kermes",
      "kermés",
      "sopes",
      "gorditas",
      "garnachas",
      "feria de antojitos",
      "puestos de comida",
      "street food",
    ],
  },
];

/** Overlay desde Sheet: servicio normalizado → aliases. */
let sheetSynonymIndex: Map<string, string[]> = new Map();

export function clearSheetSynonymIndex(): void {
  sheetSynonymIndex = new Map();
}

export function registerSheetSynonyms(
  rows: Array<{ servicio: string; sinonimos?: string | null }>
): void {
  const next = new Map<string, string[]>();
  for (const row of rows) {
    const svc = norm(row.servicio || "");
    if (!svc) continue;
    const raw = (row.sinonimos ?? "").trim();
    if (!raw) continue;
    const parts = raw
      .split(/[,;|/]/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2);
    if (!parts.length) continue;
    const prev = next.get(svc) ?? [];
    next.set(svc, [...new Set([...prev, ...parts])]);
  }
  sheetSynonymIndex = next;
}

export function getSheetSynonymIndexSize(): number {
  return sheetSynonymIndex.size;
}

export function parseSynonymList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;|/]/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
}

/** Todos los aliases default + sheet para un servicio del catálogo. */
export function synonymsForServiceName(servicio: string): string[] {
  const n = norm(servicio);
  const out = new Set<string>();
  for (const fam of DEFAULT_SERVICE_SYNONYM_FAMILIES) {
    if (fam.serviceHints.some((h) => n.includes(norm(h)) || norm(h).includes(n))) {
      for (const a of fam.aliases) out.add(a);
    }
  }
  for (const [svc, aliases] of sheetSynonymIndex) {
    if (n.includes(svc) || svc.includes(n)) {
      for (const a of aliases) out.add(a);
    }
  }
  return [...out];
}

/** Haystack de matching: servicio + sinónimos default + sheet. */
export function synonymHaystackForService(servicio: string, sheetSinonimos?: string | null): string {
  const parts = [
    servicio,
    sheetSinonimos ?? "",
    ...synonymsForServiceName(servicio),
  ];
  return norm(parts.join(" "));
}

export function expandQueryWithServiceSynonyms(query: string): {
  tokens: string[];
  familyKeys: string[];
  boostedHints: string[];
  matchedServiceHints: string[];
} {
  const q = norm(query);
  const baseTokens = q.split(" ").filter((w) => w.length >= 3);
  const familyKeys: string[] = [];
  const boostedHints: string[] = [];
  const matchedServiceHints: string[] = [];
  const extraTokens = new Set<string>(baseTokens);

  for (const fam of DEFAULT_SERVICE_SYNONYM_FAMILIES) {
    if (fam.excludeIf?.some((ex) => q.includes(norm(ex)))) {
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
    for (const h of fam.serviceHints) {
      const nh = norm(h);
      boostedHints.push(nh);
      matchedServiceHints.push(h);
      for (const t of nh.split(" ")) if (t.length >= 3) extraTokens.add(t);
    }
    for (const a of fam.aliases) {
      for (const t of norm(a).split(" ")) if (t.length >= 3) extraTokens.add(t);
    }
  }

  // Sheet overlay: si el cliente dijo un sinónimo registrado en una fila
  for (const [svc, aliases] of sheetSynonymIndex) {
    for (const a of aliases) {
      const na = norm(a);
      const matched = na.includes(" ") ? q.includes(na) : new RegExp(`\\b${na}\\b`).test(q);
      if (!matched) continue;
      matchedServiceHints.push(svc);
      boostedHints.push(svc);
      for (const t of svc.split(" ")) if (t.length >= 3) extraTokens.add(t);
      for (const t of na.split(" ")) if (t.length >= 3) extraTokens.add(t);
    }
  }

  return {
    tokens: [...extraTokens],
    familyKeys: [...new Set(familyKeys)],
    boostedHints: [...new Set(boostedHints)],
    matchedServiceHints: [...new Set(matchedServiceHints)],
  };
}

/** Bonus si el query (vía sinónimos) apunta a este servicio/PDF. */
export function synonymScoreForService(
  query: string,
  serviceLabel: string,
  sheetSinonimos?: string | null
): number {
  const expanded = expandQueryWithServiceSynonyms(query);
  if (!expanded.familyKeys.length && !expanded.boostedHints.length) return 0;

  const hay = synonymHaystackForService(serviceLabel, sheetSinonimos);
  let score = 0;

  for (const hint of expanded.boostedHints) {
    if (hay.includes(hint)) score += hint.includes(" ") ? 22 : 14;
  }
  for (const hint of expanded.matchedServiceHints) {
    if (hay.includes(norm(hint))) score += 10;
  }

  // Penalizaciones clásicas
  if (expanded.familyKeys.includes("taquiza") && /banquete/.test(hay) && !/taquiza/.test(hay)) {
    score -= 25;
  }
  if (expanded.familyKeys.includes("banquete_formal") && /taquiza/.test(hay)) score -= 25;
  if (
    expanded.familyKeys.includes("barra_sushi") &&
    /banquete|taquiza/.test(hay) &&
    !/sushi|poke/.test(hay)
  ) {
    score -= 25;
  }
  if (
    expanded.familyKeys.includes("banquete_mexicano") &&
    /banquete/.test(hay) &&
    !/mexicano/.test(hay)
  ) {
    score -= 20;
  }
  if (
    expanded.familyKeys.includes("coffee_break") &&
    /barra de cafe|barra de café/.test(hay) &&
    !/coffee/.test(hay)
  ) {
    // coffee break ≠ solo barra de café menu-only; soft penalty
    score -= 5;
  }

  return score;
}

/** Adaptador para el índice PDF (mismas familias default). */
export function defaultFamiliesAsPdfAliases(): Array<{
  key: string;
  aliases: string[];
  pdfHints: string[];
  excludeIf?: string[];
}> {
  return DEFAULT_SERVICE_SYNONYM_FAMILIES.map((f) => ({
    key: f.key,
    aliases: f.aliases,
    pdfHints: f.serviceHints,
    excludeIf: f.excludeIf,
  }));
}

const FAMILY_DISPLAY: Record<string, { label: string; complements: string[] }> = {
  pozole_tostadas: {
    label: "Pozole y Tostadas",
    complements: ["Barras de bebidas", "Mobiliario"],
  },
  taquiza: {
    label: "Taquiza",
    complements: ["Barras de bebidas", "Mobiliario"],
  },
  paella: {
    label: "Paella",
    complements: ["Barras de bebidas", "Mobiliario"],
  },
  parrillada_argentina: {
    label: "Parrillada Argentina",
    complements: ["Barras de bebidas", "Mobiliario"],
  },
  banquete_navideno: {
    label: "Banquete Navideño",
    complements: ["Barras de bebidas", "Mobiliario", "Mesa de dulces"],
  },
};

/**
 * Si el texto del evento ES un servicio (pozolada, taquiza, paella…),
 * devuelve el foco: ese servicio + complementos opcionales — no banquete/taquiza genéricos.
 */
export function resolveServiceFocusFromText(text: string | null | undefined): {
  familyKey: string;
  label: string;
  serviceHints: string[];
  complements: string[];
} | null {
  if (!text?.trim()) return null;
  const expanded = expandQueryWithServiceSynonyms(text);
  if (!expanded.familyKeys.length) return null;

  // Prefer food-event families over generic banquet when the query is a food-event word.
  const preferredOrder = [
    "pozole_tostadas",
    "taquiza",
    "paella",
    "parrillada_argentina",
    "banquete_navideno",
    "barra_americana",
    "barra_sushi",
  ];
  const familyKey =
    preferredOrder.find((k) => expanded.familyKeys.includes(k)) ?? expanded.familyKeys[0]!;
  const fam = DEFAULT_SERVICE_SYNONYM_FAMILIES.find((f) => f.key === familyKey);
  if (!fam) return null;
  const display = FAMILY_DISPLAY[familyKey] ?? {
    label: fam.serviceHints[0] ?? familyKey,
    complements: ["Barras de bebidas", "Mobiliario"],
  };
  return {
    familyKey,
    label: display.label,
    serviceHints: fam.serviceHints,
    complements: display.complements,
  };
}

/** Carga overlays desde sinonimos.json (servicio → lista de aliases). */
export function loadSinonimosJson(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const obj = raw as Record<string, unknown>;
  const map = (obj.sinonimos ?? obj.synonyms ?? obj) as Record<string, unknown>;
  if (!map || typeof map !== "object") return 0;
  const rows: Array<{ servicio: string; sinonimos: string }> = [];
  for (const [servicio, aliases] of Object.entries(map)) {
    if (servicio === "version" || servicio === "note") continue;
    if (Array.isArray(aliases)) {
      rows.push({ servicio, sinonimos: aliases.map(String).join(", ") });
    } else if (typeof aliases === "string") {
      rows.push({ servicio, sinonimos: aliases });
    }
  }
  if (!rows.length) return 0;
  // Merge with existing sheet index
  const merged = new Map(sheetSynonymIndex);
  for (const row of rows) {
    const svc = norm(row.servicio);
    const parts = parseSynonymList(row.sinonimos);
    const prev = merged.get(svc) ?? [];
    merged.set(svc, [...new Set([...prev, ...parts])]);
  }
  sheetSynonymIndex = merged;
  return rows.length;
}
