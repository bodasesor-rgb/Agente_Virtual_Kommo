/**
 * Comprensión conversacional centralizada para Lucy.
 * Unifica catálogo de servicios, detección de campos y captura contextual
 * (respuestas cortas cuando Lucy acaba de preguntar algo concreto).
 */
import type { OpenAI } from "openai";
import type { ExtractedData } from "./types.js";
import {
  isAffirmativeOnlyMessage,
  isGreetingOnlyMessage,
  isQuoteIntentMessage,
  sanitizeDisplayName,
} from "./contact-name.js";
import { getAdvisorName } from "./lib/bodasesorAdvisor.js";

export type UnderstandingField =
  | "nombre"
  | "correo"
  | "tipo_evento"
  | "requerimientos"
  | "invitados"
  | "zona"
  | "fecha"
  | "presupuesto";

/** Patrones cuando Lucy preguntó por un dato (no exige signo de interrogación). */
export const LUCY_FIELD_ASK_PATTERNS: Record<UnderstandingField, RegExp> = {
  nombre: /regalas?\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|con\s+qui[eé]n\s+tengo|tu\s+nombre|me\s+das\s+tu\s+nombre/i,
  correo: /correo|e-?mail|env[ií]o|mandarte|mandar(te)?\s+la\s+info|compartes?\s+un\s+correo/i,
  tipo_evento:
    /festejan|tipo\s+de\s+(evento|celebraci[oó]n)|qu[eé]\s+evento|qu[eé]\s+celebr|de\s+qu[eé]\s+se\s+trata|qu[eé]\s+tipo\s+de\s+celebr/i,
  requerimientos:
    /pensado|servicios?|banquete|taquiza|cotizar|cotizaci[oó]n|adem[aá]s\s+del|qu[eé]\s+necesitas|qu[eé]\s+buscas|men[uú]|plat[ií]came|otro\s+servicio|te\s+gustar[ií]a\s+cotizar|animaci[oó]n|hora\s+loca|happening|show|incluir\s+en\s+la\s+cotiz/i,
  invitados:
    /invitados|personas|gente|pax|cu[aá]ntos|cu[aá]ntas|aproximadamente|m[aá]s\s+o\s+menos|para\s+cu[aá]ntas|ser[ií]an|asistir[aá]n/i,
  zona: /ciudad|d[oó]nde\s+(lo|ser[ií]|ser[aá]|queda|est[aá]n|es)|en\s+qu[eé]\s+(ciudad|zona|lugar)|lugar|direcci[oó]n|ubicaci[oó]n|zona|sal[oó]n|venue|sede|colonia|municipio/i,
  fecha: /fecha|cu[aá]ndo|d[ií]a|agenda|definiendo|opciones\s+de\s+fecha|para\s+cu[aá]ndo|qu[eé]\s+d[ií]a/i,
  presupuesto:
    /presupuesto|estimado|rango|inversi[oó]n|budget|monto|cu[aá]nto\s+cuesta|precio\s+total|para\s+la\s+comida|menos\s+de|hasta\s+\$?|opciones\s+de\s+precio/i,
};

/** Catálogo unificado Bodasesor — orden: más específico primero. */
export const BODASESOR_SERVICE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Parrillada Argentina", /parrillada\s+argentina/i],
  ["Banquete Kosher", /\bkosher\b/i],
  ["Banquete Navideño", /\bnavide[nñ]o\b/i],
  ["Banquete Mexicano", /\b(banquete\s+mexicano|mexicano)\b/i],
  ["Banquete Formal", /\b(banquete\s+formal|banquete)\b/i],
  ["Barra de bebidas", /\b(barra\s*(de\s*)?bebidas?|bebidas?\s+alcoh[oó]licas?)\b/i],
  ["Barra de alimentos", /\b(barra\s+de\s+alimentos|barras?\s+tem[aá]ticas?)\b/i],
  ["Mesa de dulces", /\b(mesa\s+de\s+dulces|mesas?\s+de\s+dulces)\b/i],
  ["Mesa de postres", /\b(mesa\s+de\s+postres|postres|dulces)\b/i],
  ["Mesa de quesos", /\b(mesa\s+de\s+quesos|quesos|grazing)\b/i],
  ["Coffee break", /\b(barra\s+de\s+caf[eé]|coffee\s*break)\b/i],
  ["Pista de baile", /\b(pista(\s+de\s+baile)?|tarima)\b/i],
  ["Animación / Hora loca", /\b(hora\s+loca|happening|animaci[oó]n|animador|show|pixel|espejos|l[aá]ser|laser)\b/i],
  ["Iluminación", /\biluminaci[oó]n\b/i],
  ["Decoración", /\bdecoraci[oó]n\b/i],
  ["Floristería", /\b(florer[ií]a|flores|arreglos?\s+florales?)\b/i],
  ["Mobiliario", /\b(mobiliario|m[aá]rmol|sillas?|mesas?)\b/i],
  ["Carpas", /\b(carpa|carpas|toldo)\b/i],
  ["Pantallas", /\b(pantalla|pantallas|led\s*wall|pantallas?\s+led)\b/i],
  ["Audio y sonido", /\b(audio|microfon[ií]a|sonido|bocinas|amplificaci[oó]n)\b/i],
  ["Estructuras", /\b(estructura|colgante|wisteria)\b/i],
  ["Inflables", /\binflable/i],
  ["Softplay", /\bsoft\s*play\b/i],
  ["Meseros", /\bmeseros?\b/i],
  ["DJ", /\bdj\b/i],
  ["Mixología", /\bmixolog[ií]a\b/i],
  ["Coctelería", /\bcocteler[ií]a\b/i],
  ["Mócteles", /\bm[oó]cteles?\b/i],
  ["Canapés", /\b(canap[eé]s?|bocadillos?)\b/i],
  ["Pizzas", /\bpizza/i],
  ["Sushi", /\b(sushi|poke)\b/i],
  ["Taquiza", /\b(taquiza|tacos?)\b/i],
  ["Parrillada", /\bparrillada\b/i],
  ["Crepas", /\bcrep[aá]s?\b/i],
  ["Brunch", /\bbrunch\b/i],
  ["Poptails", /\bpoptails?\b/i],
];

export const SERVICE_HINT =
  /banquete|taquiza|tacos|barra|bebida|dj|carpa|men[uú]|comida|alimentos?|mobiliario|pizza|sushi|parrillada|postre|dulce|iluminaci[oó]n|pantalla|coffee|brunch|kosher|formal|mexican|coctel|mixolog|canap|crep|queso|inflable|softplay|estructura|pista|tarima|baile|mesas?|sillas?|mesero|decoraci[oó]n|flor|brunch/i;

const SHORT_SERVICE_ALIASES: Record<string, string> = {
  pista: "pista de baile",
  tarima: "pista de baile",
  dj: "DJ",
  mesa: "mobiliario",
  mesas: "mobiliario",
  silla: "mobiliario",
  sillas: "mobiliario",
  carpa: "carpas",
  bebidas: "barra de bebidas",
  bebida: "barra de bebidas",
  banquete: "banquete",
  taquiza: "taquiza",
  tacos: "taquiza",
  pizza: "pizzas",
  pizzas: "pizzas",
  sushi: "sushi",
  kosher: "banquete kosher",
  meseros: "meseros",
  mesero: "meseros",
  decoracion: "decoración",
  iluminacion: "iluminación",
  pantalla: "pantallas",
  inflable: "inflables",
  mobiliario: "mobiliario",
  comida: "banquete / taquiza",
  alimentos: "banquete / taquiza",
  alimento: "banquete / taquiza",
  menu: "banquete / taquiza",
  menú: "banquete / taquiza",
};

const TIPO_EVENTO_PATTERNS: Array<[string, RegExp]> = [
  [/\b(boda|bodas|matrimonio|casamiento|nupcial)\b/i, "boda"],
  [/\b(baby\s*shower)\b/i, "baby shower"],
  [/\b(xv\s*a[nñ]os?|quincea[nñ]era|quince|xv)\b/i, "XV años"],
  [/\b(fin\s+de\s+a[nñ]o|fiesta\s+de\s+empresa|evento\s+de\s+empresa|de\s+empresa)\b/i, "evento corporativo"],
  [/\b(evento\s+corporativo|convenci[oó]n|conferencia|corporativo)\b/i, "evento corporativo"],
  [/\b(cumplea[nñ]os?|cumple)\b/i, "cumpleaños"],
  [/\b(bautizo)\b/i, "bautizo"],
  [/\b(comuni[oó]n|graduaci[oó]n)\b/i, "celebración"],
];

/** Normaliza para comparar presentaciones ("Alejandro?", "¿Alejandro"). */
function normalizePresentationText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[¿?.,!]/g, "")
    .trim();
}

/** Cliente pregunta por el asesor humano (NO cuando dice su propio nombre). */
export function clientAsksAboutTeam(message?: string, clientName?: string | null): boolean {
  if (!message?.trim()) return false;
  const t = message.trim();
  const normalized = normalizePresentationText(t);
  const name = clientName?.trim().toLowerCase() ?? "";
  const advisor = getAdvisorName().toLowerCase();
  const advisorEsc = advisor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Presentación con su propio nombre: "Alejandro", "Alejandro?", "soy Alejandro"
  if (name) {
    if (normalized === name || normalized === `soy ${name}` || normalized === `me llamo ${name}`) {
      return false;
    }
  }

  // Presentación genérica sin pregunta explícita por el asesor
  if (/^(soy\s+)?[a-záéíóúñ]{2,30}$/i.test(normalized)) return false;
  if (/^hola,?\s+[a-záéíóúñ]{2,30}$/i.test(normalized)) return false;

  // Solo el nombre del asesor (con o sin ?) NO es pregunta si el cliente se llama igual
  if (name && name === advisor && new RegExp(`^${advisorEsc}$`, "i").test(normalized)) {
    return false;
  }

  return (
    (new RegExp(`^${advisorEsc}$`, "i").test(normalized) && !(name && name === advisor)) ||
    new RegExp(`\\bqui[eé]n\\s+es\\s+${advisorEsc}\\b`, "i").test(t) ||
    new RegExp(`\\best[aá]\\s+${advisorEsc}\\b`, "i").test(t) ||
    new RegExp(`\\bhablo\\s+con\\s+${advisorEsc}\\b`, "i").test(t) ||
    new RegExp(`\\bpuedo\\s+hablar\\s+con\\s+${advisorEsc}\\b`, "i").test(t) ||
    new RegExp(`\\bd[oó]nde\\s+est[aá]\\s+${advisorEsc}\\b`, "i").test(t) ||
    /\bel\s+asesor\b/i.test(t)
  );
}

/** Tras el cierre, cliente pide agregar servicios a la cotización. */
export function clientAddsToQuote(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /\b(incluir|agregar|sumar|tambi[eé]n|adem[aá]s)\b/i.test(t) &&
    /\b(cotizaci[oó]n|propuesta|cotizar)\b/i.test(t)
  ) || /\bincluir\b.+\b(en\s+la\s+)?cotiz/i.test(t);
}

/** Cliente pide ideas, recomendaciones o pregunta qué ofrece Bodasesor. */
export function clientAsksForRecommendations(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /recomendaciones?|recomiendas?/i.test(t) ||
    /qu[eé]\s+me\s+(recomiendas?|recomendaciones?|sugieres|conviene|puedes\s+dar)/i.test(t) ||
    /qu[eé]\s+(puedo|podemos)\s+(meter|incluir|poner|agregar)/i.test(t) ||
    /qu[eé]\s+opciones/i.test(t) ||
    /qu[eé]\s+servicios\s+me\s+conviene/i.test(t) ||
    /qu[eé]\s+ofrecen|qu[eé]\s+tienen|qu[eé]\s+manejan|qu[eé]\s+hacen/i.test(t) ||
    /cu[aá]les\s+son\s+(sus\s+)?servicios|informaci[oó]n\s+de\s+(sus\s+)?servicios/i.test(t) ||
    /banquete\s+o\s+taquiza|taquiza\s+o\s+banquete/i.test(t) ||
    /algo\s+m[aá]s\s*\?/i.test(t)
  );
}

/** Cliente pide show, animación o entretenimiento en vivo. */
export function clientMentionsEntertainment(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /\bshow\b/i.test(t) ||
    /\bgrupo\s+vers[aá]til\b/i.test(t) ||
    /\b(banda|m[uú]sica\s+en\s+vivo|artista|cantante|dj\s+en\s+vivo)\b/i.test(t) ||
    /\b(animaci[oó]n|hora\s+loca|happening|entretenimiento)\b/i.test(t) ||
    /\b(requerimos|necesitamos|buscamos)\s+un\s+show\b/i.test(t)
  );
}

/** Cliente pregunta catering o comida (mapear a opciones de alimentos del catálogo). */
export function clientMentionsCatering(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /\bcatering\b/i.test(t) ||
    /\b(brunch|desayuno)\b/i.test(t) ||
    /\bbrunch\s*\/\s*desayuno/i.test(t) ||
    /\b(busco|necesito|quiero|cotizar)\s+(comida|alimentos?|men[uú])\b/i.test(t) ||
    /\bcomida\s+para\b/i.test(t) ||
    /\b(solo|nada\s+m[aá]s)\s+(comida|alimentos?)\b/i.test(t) ||
    /\b(comida|alimentos?|men[uú])\s+(para|del)\b/i.test(t)
  );
}

/** Cliente pregunta por teléfonos de contacto. */
export function clientAsksPhone(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /\btel[eé]fono/i.test(t) ||
    /\bn[uú]mero\s+(de\s+)?(contacto|atenci[oó]n|ventas|gerencia)/i.test(t) ||
    /\b(llamar|marcar|contestar|contestan|nadie\s+contesta|me\s+urge)\b/i.test(t) ||
    /\bwhatsapp\s+(de\s+)?(ventas|gerencia|corporativo|bodasesor)/i.test(t) ||
    /\btienen\s+whatsapp/i.test(t)
  );
}

/** Comparación directa banquete vs taquiza. */
export function clientAsksBanqueteVsTaquiza(message?: string): boolean {
  if (!message?.trim()) return false;
  return /banquete\s+o\s+taquiza|taquiza\s+o\s+banquete/i.test(message.toLowerCase());
}

const WRITTEN_NUMBERS: Record<string, string> = {
  uno: "1",
  una: "1",
  dos: "2",
  tres: "3",
  cuatro: "4",
  cinco: "5",
  seis: "6",
  siete: "7",
  ocho: "8",
  nueve: "9",
  diez: "10",
  once: "11",
  doce: "12",
  quince: "15",
  veinte: "20",
  treinta: "30",
  cuarenta: "40",
  cincuenta: "50",
  sesenta: "60",
  setenta: "70",
  ochenta: "80",
  noventa: "90",
  cien: "100",
  ciento: "100",
  doscientos: "200",
  trescientos: "300",
  cuatrocientos: "400",
  quinientos: "500",
};

const MONTH_PATTERN =
  /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i;

const KNOWN_ZONES =
  /\b(cdmx|ciudad\s+de\s+m[eé]xico|df|polanco|reforma|santa\s+fe|interlomas|monterrey|guadalajara|puebla|quer[eé]taro|canc[uú]n|tijuana|le[oó]n|m[eé]rida|toluca|cuernavaca|acapulco|veracruz|tulum|playa\s+del\s+carmen|nezahualc[oó]yotl|corregidor|centro\s+hist[oó]rico)\b/i;

/** Fragmentos tras "en …" que NO son ubicación. */
const NON_LOCATION_EN_PREFIX =
  /^(la|el|los|las|total|este|esta|ese|esa|medio|mente|general|particular|comida|pista|baile|mente|mente\s+para|solo|m[ií]o|tu|su)\b/i;

export interface CrmCapture {
  label: string;
  value: string;
}

export function inferLucyAskedField(lastLucyMessage: string | null | undefined): UnderstandingField | null {
  const msg = lastLucyMessage?.trim() ?? "";
  if (!msg) return null;

  const priority: UnderstandingField[] = [
    "nombre",
    "correo",
    "tipo_evento",
    "requerimientos",
    "invitados",
    "zona",
    "fecha",
    "presupuesto",
  ];

  for (const field of priority) {
    if (LUCY_FIELD_ASK_PATTERNS[field].test(msg)) return field;
  }
  return null;
}

export function parseServicesFromText(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();

  for (const [label, pattern] of BODASESOR_SERVICE_PATTERNS) {
    if (pattern.test(lower)) found.push(label);
  }

  const normalized = normalizeShortServicePhrase(text);
  if (normalized && !found.some((s) => s.toLowerCase().includes(normalized.toLowerCase()))) {
    found.push(normalized);
  }

  return [...new Set(found)];
}

/** Tras el cierre, anexa servicios o detalles nuevos al campo requerimientos. */
export function appendPostCierreRequirements(
  existing: string | null | undefined,
  message: string
): string | null {
  const t = message.trim();
  if (!t) return existing?.trim() || null;

  const services = parseServicesFromText(t);
  const hasServiceIntent =
    services.length > 0 ||
    clientAddsToQuote(t) ||
    /\b(pantalla|audio|microfon|led|dj)\b/i.test(t);

  if (!hasServiceIntent) return existing?.trim() || null;

  const snippet = t.replace(/\s+/g, " ").slice(0, 250);
  const base = existing?.trim() || "";
  if (base && base.toLowerCase().includes(snippet.toLowerCase().slice(0, 40))) return base;
  return base ? `${base}; ${snippet}` : snippet;
}

export function parsePrimaryService(text: string): string | null {
  const services = parseServicesFromText(text);
  if (services.length > 0) return services[0]!;

  const normalized = normalizeShortServicePhrase(text);
  return normalized;
}

function normalizeShortServicePhrase(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let cleaned = trimmed
    .replace(/^(quiero|necesito|busco|solo|solamente|nada\s+m[aá]s|me\s+interesa|dame|cotiza(?:r)?)\s+/i, "")
    .replace(/^(una?|el|la|los|las)\s+/i, "")
    .trim();

  const lower = cleaned.toLowerCase();
  if (SHORT_SERVICE_ALIASES[lower]) return SHORT_SERVICE_ALIASES[lower]!;

  if (/^pista$/i.test(cleaned)) return "pista de baile";
  if (/^dj$/i.test(cleaned)) return "DJ";

  return null;
}

export function isServiceRelatedMessage(text: string | null | undefined): boolean {
  const trimmed = text?.trim() ?? "";
  if (!trimmed || /^info pendiente$/i.test(trimmed)) return false;
  if (SERVICE_HINT.test(trimmed)) return true;
  if (parsePrimaryService(trimmed)) return true;
  if (/^(una?\s+)?(pista|tarima|dj|mesas?|sillas?|carpa|banquete|taquiza)\b/i.test(trimmed)) return true;
  return false;
}

export function parseTipoEventoFromText(text: string): string | null {
  for (const [pattern, label] of TIPO_EVENTO_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

export function parseInvitadosFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (isServiceRelatedMessage(trimmed)) return null;

  if (
    /\b(no\s+s[eé](\s+a[uú]n)?|a[uú]n\s+no(\s+s[eé])?|sin\s+definir|por\s+definir|no\s+tenemos|no\s+damos|depende|todav[ií]a\s+no|m[aá]s\s+adelante|no\s+lo\s+sabemos|van\s+viendo)\b/i.test(
      trimmed
    )
  ) {
    return "Sin definir (cliente indicó aproximación pendiente)";
  }

  const numMatch = trimmed.match(/\b(\d+)\s*(personas?|invitados?|pax|guests?)\b/i);
  if (numMatch) return numMatch[1]!;

  const paraMatch = trimmed.match(/\b(?:para|somos|ser[ií]an?|como)\s+(\d+)\b/i);
  if (paraMatch) return paraMatch[1]!;

  const writtenMatch = trimmed.match(
    /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos)\s+(personas?|invitados?)\b/i
  );
  if (writtenMatch) {
    return WRITTEN_NUMBERS[writtenMatch[1]!.toLowerCase()] ?? null;
  }

  if (/^\d{1,4}$/.test(trimmed)) return trimmed;

  return null;
}

/** Texto que describe medidas del espacio, NO ubicación geográfica. */
export function isDimensionText(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return (
    /\b\d+\s*metros?\s*(por|x)\s*\d+\s*metros?\b/i.test(t) ||
    /\bespacio\s+(es\s+de|de|mide)\s+\d+/i.test(t) ||
    /^\d+\s*x\s*\d+\s*(m|metros?)?$/i.test(t)
  );
}

/** Medidas del espacio para tarima/pista (ej. 6 metros por 12). */
export function parseSpaceDimensions(text: string): string | null {
  const m = text.match(/\b(\d+)\s*metros?\s*(por|x)\s*(\d+)\s*metros?\b/i);
  if (m) return `${m[1]}m x ${m[3]}m`;
  const m2 = text.match(/\bespacio\s+(?:es\s+de|de|mide)\s+(\d+)\s*metros?\s*(por|x)\s*(\d+)/i);
  if (m2) return `${m2[1]}m x ${m2[3]}m`;
  return null;
}

/** Cliente pide pista de baile o tarima. */
export function clientMentionsPistaTarima(message?: string): boolean {
  if (!message?.trim()) return false;
  return /\bpista(\s+de\s+baile)?\b|\btarima/i.test(message);
}

export function parseZonaFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /@/.test(trimmed)) return null;
  if (isGreetingOnlyMessage(trimmed)) return null;
  if (isAffirmativeOnlyMessage(trimmed)) return null;
  if (isDimensionText(trimmed)) return null;

  if (KNOWN_ZONES.test(trimmed)) {
    const m = trimmed.match(KNOWN_ZONES);
    if (m) return m[0]!.trim();
  }

  const enMatch = trimmed.match(
    /\ben\s+([A-Za-zÁÉÍÓÚáéíóúñ][A-Za-zÁÉÍÓÚáéíóúñ\s.-]{2,28})(?:\s|,|\.|$)/i
  );
  if (enMatch) {
    const lugar = enMatch[1]!.trim();
    if (
      !MONTH_PATTERN.test(lugar) &&
      !/^\d/.test(lugar) &&
      !isGreetingOnlyMessage(lugar) &&
      !NON_LOCATION_EN_PREFIX.test(lugar) &&
      !/\b(solo|para\s+la|total|comida|pista)\b/i.test(lugar)
    ) {
      return lugar;
    }
  }

  // "cd nezahualcoyotl", "la casa del corregidor"
  const venueMatch = trimmed.match(
    /\b((?:la\s+)?casa\s+del\s+corregidor|cd\.?\s*nezahualc[oó]yotl)\b/i
  );
  if (venueMatch?.[1]) return venueMatch[1].trim();

  const clubMatch = trimmed.match(/\b(club\s+de\s+golf\s+[A-Za-zÁÉÍÓÚáéíóúñ\s]{2,30})/i);
  if (clubMatch?.[1]) return clubMatch[1].trim();

  if (/\b(se\s+llevar[aá]|llevaremos|ser[aá])\s+(a\s+cabo\s+)?en\s+(el\s+)?/i.test(trimmed)) {
    const enVenue = trimmed.match(/\ben\s+(el\s+)?([A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚáéíóúñ\s]{4,40})/);
    if (enVenue?.[2] && !MONTH_PATTERN.test(enVenue[2])) return enVenue[2].trim();
  }

  return null;
}

/** Etiquetas de servicio que GPT a veces confunde con tipo de evento. */
export const SERVICE_LABELS_NOT_TIPO =
  /^(brunch|banquete|taquiza|desayuno|catering|pista de baile|dj|mobiliario|bebidas?)$/i;

export function parseCorreoFromText(text: string | null | undefined): string | null {
  const m = text?.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return m ? m[1]! : null;
}

export function isServiceLabelNotTipoEvento(label: string | null | undefined): boolean {
  if (!label?.trim()) return false;
  const t = label.trim();
  if (SERVICE_LABELS_NOT_TIPO.test(t)) return true;
  if (parseTipoEventoFromText(t)) return false;
  return !!parsePrimaryService(t);
}

export function parseFechaFromText(text: string): string | null {
  const trimmed = text.trim();
  const fechaMatch = trimmed.match(
    /\b(?:el\s+)?(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?)(?:\s+a\s+las\s+(\d{1,2}:\d{2}|\d{1,2})\s*horas?)?\b/i
  );
  if (fechaMatch) {
    const base = fechaMatch[1]!;
    const hora = fechaMatch[2];
    return hora ? `${base} a las ${hora}${hora.includes(":") ? "" : ":00"} horas` : base;
  }

  if (
    /\b(todav[ií]a\s+la\s+vamos\s+a\s+definir|todav[ií]a\s+(no\s+)?la\s+van?\s+a\s+definir|vamos\s+a\s+definir|siguen\s+viendo\s+opciones?|a[uú]n\s+sin\s+fecha)\b/i.test(
      trimmed
    )
  ) {
    return "Sin definir (pendiente)";
  }

  if (
    /\b(pr[oó]ximo\s+s[aá]bado|pr[oó]ximo\s+domingo|sin\s+fecha|a[uú]n\s+no\s+tenemos\s+fecha|todav[ií]a\s+no|por\s+definir)\b/i.test(
      trimmed
    )
  ) {
    return trimmed.slice(0, 80);
  }

  if (MONTH_PATTERN.test(trimmed) && !/\b(pedregal|zona|ciudad|lugar|sal[oó]n|jard[ií]n)\b/i.test(trimmed)) {
    return trimmed.slice(0, 80);
  }

  return null;
}

export interface PresupuestoParseOptions {
  /** Si Lucy acaba de preguntar presupuesto, aceptar respuestas cortas con contexto. */
  askedField?: UnderstandingField | null;
}

function bareNumberLooksLikeInvitados(num: number, trimmed: string): boolean {
  if (/\$|k\b|mil\b|pesos|mxn|mnx/i.test(trimmed)) return false;
  return num >= 5 && num <= 999;
}

/** Cliente rechazó dar presupuesto (incluye "no" suelto tras pregunta de Lucy). */
export function detectPresupuestoRefusal(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/^(no|nop)[\s.,!]*$/i.test(t)) return true;
  return (
    /\bno\s+(tengo|tenemos|cuento|sabemos)\s+(un\s+)?presupuesto\b/i.test(t) ||
    /\bno\s+me\s+brindaron\b/i.test(t) ||
    /\bno\s+nos\s+(dieron|brindaron)\b/i.test(t) ||
    /\bsin\s+presupuesto\b/i.test(t) ||
    /\b(sin\s+rango|no\s+tengo\s+rango)\b/i.test(t) ||
    /\b(m[aá]ndame|m[aá]nden)\s+(el\s+)?presupuesto\b/i.test(t) ||
    /\bt[uú]\s+m[aá]ndame\b/i.test(t) ||
    /\bsi\s+quieres\s+vemos\b/i.test(t) ||
    (/\bno\b/i.test(t) && /\bpresupuesto\b/i.test(t))
  );
}

export function parsePresupuestoFromText(text: string, opts?: PresupuestoParseOptions): string | null {
  const trimmed = text.trim();

  if (
    /\b(m[aá]ndame|m[aá]nden)\s+(el\s+)?(presupuesto|cotiz)/i.test(trimmed) ||
    /\bt[uú]\s+m[aá]ndame\b/i.test(trimmed)
  ) {
    return "Sin definir (cliente pidió que propongamos)";
  }

  if (detectPresupuestoRefusal(trimmed)) {
    return "Sin definir (cliente indicó que no tiene)";
  }

  if (
    /\b(lo\s+m[aá]s\s+)?econ[oó]mic[oa]s?\b/i.test(trimmed) ||
    /\b(barato|accesible|ajustad[oa]|menor\s+costo|lo\s+m[aá]s\s+barato)\b/i.test(trimmed)
  ) {
    return "Opciones económicas (sin monto fijo)";
  }

  if (/\b(sin\s+rango|no\s+tengo\s+rango)\b/i.test(trimmed)) {
    return "Sin definir (cliente indicó que no tiene)";
  }

  if (opts?.askedField === "presupuesto" && /^(no|nop)[\s.,!]*$/i.test(trimmed)) {
    return "Sin definir (cliente indicó que no tiene)";
  }

  if (
    /\b(no\s+tengo|no\s+s[eé]|sin\s+presupuesto|a[uú]n\s+no|no\s+cuento|no\s+sabemos|depende|no\s+lo\s+s[eé]|no,?\s+a[uú]n\s+no|que\s+alejandro\s+de\s+opciones|que\s+nos\s+propong|ver\s+opciones)\b/i.test(
      trimmed
    )
  ) {
    return "Sin definir (cliente indicó que no tiene)";
  }

  // Fechas, invitados u horarios no son presupuesto
  if (parseFechaFromText(trimmed) && !/\b(presupuesto|mil|pesos|mxn|mnx|\$|k\b)/i.test(trimmed)) {
    return null;
  }
  if (/\b\d+\s*(personas?|invitados?|pax)\b/i.test(trimmed) && !/\b(presupuesto|mil|pesos|mxn|mnx|\$|k\b)/i.test(trimmed)) {
    return null;
  }

  const rangeMatch = trimmed.match(/\b(\d[\d,.]*)\s*[-–a]\s*(\d[\d,.]*)\s*(mxn|mnx|pesos)?\b/i);
  if (rangeMatch) {
    return `${rangeMatch[1]!.replace(/,/g, "")} - ${rangeMatch[2]!.replace(/,/g, "")} MXN`;
  }

  const menosDeMatch = trimmed.match(
    /\b(?:menos\s+de|hasta|m[aá]ximo|max\.?)\s+\$?\s*([\d][\d,.]*)\s*(mxn|mnx|pesos)?\b/i
  );
  if (menosDeMatch) {
    return `Hasta $${menosDeMatch[1]!.replace(/,/g, "")} MXN`;
  }

  const kMatch = trimmed.match(/\$?\s*([\d,.]+)\s*k\b/i);
  if (kMatch) {
    const num = parseInt(kMatch[1]!.replace(/[,.]/g, ""), 10);
    if (!isNaN(num) && num > 0) return `$${num}k`;
  }

  const milMatch = trimmed.match(/([\d,.]+)\s*mil\b/i);
  if (milMatch) {
    const num = parseInt(milMatch[1]!.replace(/[,.]/g, ""), 10);
    if (!isNaN(num) && num > 0) return `$${num * 1000}`;
  }

  if (
    /\$/.test(trimmed) ||
    /\b(presupuesto|rango|inversi[oó]n|budget|monto|pesos|mxn|mnx)\b/i.test(trimmed) ||
    /\b(como|aprox|alrededor|cerca\s+de|menos\s+de|hasta)\b/i.test(trimmed)
  ) {
    const amountMatch = trimmed.match(/\$?\s*([\d][\d,.]*)/);
    if (amountMatch) return trimmed.slice(0, 80);
  }

  const bareMatch = trimmed.match(/^\$?\s*([\d][\d,.]*)\s*(k|mxn|mnx|pesos)?$/i);
  if (bareMatch) {
    const num = parseInt(bareMatch[1]!.replace(/,/g, ""), 10);
    if (isNaN(num) || num <= 0) return null;
    if (opts?.askedField === "presupuesto") return trimmed.slice(0, 80);
    if (bareNumberLooksLikeInvitados(num, trimmed)) return null;
    if (num >= 1000) return `$${num.toLocaleString("es-MX")} MXN`;
    return null;
  }

  return null;
}

function getLastLucyMessage(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): string {
  return (
    (history
      .filter((m) => m.role === "assistant" && typeof m.content === "string")
      .slice(-1)[0]?.content as string | undefined) ?? ""
  );
}

function collectUserMessages(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string[] {
  const fromHistory = history
    .filter((m) => m.role === "user" && typeof m.content === "string")
    .map((m) => m.content as string);
  return currentMessage?.trim() ? [...fromHistory, currentMessage.trim()] : fromHistory;
}

/** Captura contextual: si Lucy preguntó X, una respuesta corta cuenta como X. */
export function captureContextualAnswer(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: string,
  filledSet: Set<string>
): CrmCapture[] {
  const msg = currentMessage.trim();
  if (!msg) return [];

  const lastLucy = getLastLucyMessage(history);
  const asked = inferLucyAskedField(lastLucy);
  const captures: CrmCapture[] = [];

  if (
    !filledSet.has("Nombre del cliente") &&
    (asked === "nombre" || (!history.some((m) => m.role === "assistant") && !isGreetingOnlyMessage(msg))) &&
    !isAffirmativeOnlyMessage(msg) &&
    !isQuoteIntentMessage(msg) &&
    /[a-záéíóúüñ]/i.test(msg) &&
    !/@/.test(msg) &&
    !/\d{4,}/.test(msg)
  ) {
    const soyMatch = msg.match(/^\s*soy\s+(.+)$/i);
    const candidato = soyMatch ? soyMatch[1]!.trim() : msg;
    const nombre = sanitizeDisplayName(candidato);
    if (nombre && candidato.length < 40 && !/\?/.test(candidato)) {
      captures.push({ label: "Nombre del cliente", value: nombre });
    }
  }

  if (!filledSet.has("Tipo de evento") && asked === "tipo_evento") {
    const tipo = parseTipoEventoFromText(msg) ?? (isServiceRelatedMessage(msg) ? null : msg);
    if (tipo && tipo.length >= 2 && !/@/.test(tipo)) {
      captures.push({ label: "Tipo de evento", value: tipo });
    } else if (isServiceRelatedMessage(msg)) {
      const service = parsePrimaryService(msg);
      const inv = parseInvitadosFromText(msg);
      if (service) {
        captures.push({ label: "Requerimientos o servicios", value: service });
      }
      if (inv) {
        captures.push({ label: "Número de invitados", value: inv });
      }
      const tipoHist = parseTipoEventoFromText(
        history
          .filter((m) => m.role === "user" && typeof m.content === "string")
          .map((m) => m.content as string)
          .join(" ")
      );
      if (tipoHist) {
        captures.push({ label: "Tipo de evento", value: tipoHist });
      }
    }
  }

  if (
    !filledSet.has("Requerimientos o servicios") &&
    !clientAsksForRecommendations(msg) &&
    (asked === "requerimientos" || isServiceRelatedMessage(msg))
  ) {
    const service = parsePrimaryService(msg);
    const dims = parseSpaceDimensions(msg);
    if (service || isServiceRelatedMessage(msg)) {
      let value = service ?? msg.slice(0, 120);
      if (dims && service) value = `${service} (espacio ${dims})`;
      else if (dims) value = `Tarima/pista — espacio ${dims}`;
      captures.push({
        label: "Requerimientos o servicios",
        value,
      });
    }
  }

  if (!filledSet.has("Número de invitados") && asked === "invitados") {
    const inv = parseInvitadosFromText(msg);
    if (inv) captures.push({ label: "Número de invitados", value: inv });
  }

  if (!filledSet.has("Lugar/dirección del evento") && asked === "zona") {
    const zona = parseZonaFromText(msg);
    if (zona) captures.push({ label: "Lugar/dirección del evento", value: zona });
  }

  if (!filledSet.has("Fecha y horario") && asked === "fecha") {
    const fecha = parseFechaFromText(msg);
    if (fecha) captures.push({ label: "Fecha y horario", value: fecha });
  }

  if (!filledSet.has("Presupuesto (MXN)") && (asked === "presupuesto" || detectPresupuestoRefusal(msg))) {
    const pres = parsePresupuestoFromText(msg, { askedField: asked === "presupuesto" ? "presupuesto" : null });
    if (pres) {
      captures.push({ label: "Presupuesto (MXN)", value: pres });
    } else if (
      /\b(s[ií]|ok|dale|claro)\b/i.test(msg) &&
      /\b(alejandro|opciones|propong)\b/i.test(msg)
    ) {
      captures.push({
        label: "Presupuesto (MXN)",
        value: "Sin definir (cliente pidió opciones)",
      });
    }
  }

  return captures;
}

/** Escaneo pasivo de mensajes recientes (sin depender de la última pregunta de Lucy). */
export function scanConversationForCaptures(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: string | undefined,
  filledSet: Set<string>
): CrmCapture[] {
  const captures: CrmCapture[] = [];
  const pending = new Set(filledSet);
  const userTexts = collectUserMessages(history, currentMessage).slice(-12);

  for (const msg of userTexts) {
    if (!pending.has("Tipo de evento")) {
      const tipo = parseTipoEventoFromText(msg);
      if (tipo) {
        captures.push({ label: "Tipo de evento", value: tipo });
        pending.add("Tipo de evento");
      }
    }

    if (
      !pending.has("Requerimientos o servicios") &&
      !clientAsksForRecommendations(msg) &&
      isServiceRelatedMessage(msg)
    ) {
      const service = parsePrimaryService(msg);
      const dims = parseSpaceDimensions(msg);
      let value = service ?? msg.trim().slice(0, 120);
      if (dims && service) value = `${service} (espacio ${dims})`;
      else if (dims && /pista|tarima/i.test(msg)) value = `Pista de baile (espacio ${dims})`;
      captures.push({
        label: "Requerimientos o servicios",
        value,
      });
      pending.add("Requerimientos o servicios");
    }

    if (!pending.has("Número de invitados")) {
      const inv = parseInvitadosFromText(msg);
      if (inv) {
        captures.push({ label: "Número de invitados", value: inv });
        pending.add("Número de invitados");
      }
    }

    if (!pending.has("Lugar/dirección del evento")) {
      const zona = parseZonaFromText(msg);
      if (zona && !isDimensionText(zona)) {
        captures.push({ label: "Lugar/dirección del evento", value: zona });
        pending.add("Lugar/dirección del evento");
      }
    }

    if (!pending.has("Fecha y horario")) {
      const fecha = parseFechaFromText(msg);
      if (fecha) {
        captures.push({ label: "Fecha y horario", value: fecha });
        pending.add("Fecha y horario");
      }
    }

    if (!pending.has("Presupuesto (MXN)")) {
      const invMatch = parseInvitadosFromText(msg);
      const looksLikeInvitadosOnly =
        !!invMatch && !/\$|presupuesto|mil\b|pesos|mxn|mnx/i.test(msg);
      if (!looksLikeInvitadosOnly) {
        const pres = parsePresupuestoFromText(msg);
        if (pres) {
          captures.push({ label: "Presupuesto (MXN)", value: pres });
          pending.add("Presupuesto (MXN)");
        }
      }
    }

    const dims = parseSpaceDimensions(msg);
    if (dims && /pista|tarima/i.test(userTexts.join(" "))) {
      const reqIdx = captures.findIndex((c) => c.label === "Requerimientos o servicios");
      if (reqIdx >= 0) {
        if (!captures[reqIdx]!.value.includes(dims)) {
          const base = captures[reqIdx]!.value.replace(/\s*\(espacio [^)]+\)/, "").trim();
          captures[reqIdx]!.value = `${base} (espacio ${dims})`;
        }
      } else if (!pending.has("Requerimientos o servicios")) {
        const service = parsePrimaryService(userTexts.join(" ")) ?? "Pista de baile";
        captures.push({
          label: "Requerimientos o servicios",
          value: `${service} (espacio ${dims})`,
        });
        pending.add("Requerimientos o servicios");
      }
    }
  }

  return captures;
}

export function appendSpaceDimensionsToRequerimientos(
  mergedLines: string[],
  filledSet: Set<string>,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): void {
  const userTexts = collectUserMessages(history, currentMessage);
  const contextText = userTexts.join(" ");
  if (!/pista|tarima/i.test(contextText)) return;

  const dims = userTexts.map((t) => parseSpaceDimensions(t)).find(Boolean);
  if (!dims) return;

  const idx = mergedLines.findIndex((l) => /^-?\s*Requerimientos o servicios:/i.test(l));
  if (idx >= 0) {
    if (!mergedLines[idx]!.includes(dims)) {
      const base = mergedLines[idx]!
        .replace(/^-?\s*Requerimientos o servicios:\s*/i, "")
        .replace(/\s*\(espacio [^)]+\)/, "")
        .trim();
      mergedLines[idx] = `- Requerimientos o servicios: ${base} (espacio ${dims})`;
    }
    return;
  }

  if (!filledSet.has("Requerimientos o servicios")) {
    const service = parsePrimaryService(contextText) ?? "Pista de baile";
    mergedLines.push(`- Requerimientos o servicios: ${service} (espacio ${dims})`);
    filledSet.add("Requerimientos o servicios");
  }
}

export function applyCapturesToCrm(
  mergedLines: string[],
  filledSet: Set<string>,
  captures: CrmCapture[]
): void {
  for (const { label, value } of captures) {
    if (filledSet.has(label) || !value?.trim()) continue;
    mergedLines.push(`- ${label}: ${value}`);
    filledSet.add(label);
  }
}

/** Enriquece ExtractedData desde el texto completo de la conversación. */
export function enrichExtractedFromConversation(
  extracted: ExtractedData,
  conversationText: string
): void {
  if (!extracted.tipo_evento?.trim()) {
    const tipo = parseTipoEventoFromText(conversationText);
    if (tipo) extracted.tipo_evento = tipo;
  }

  if (!extracted.fecha_horario?.trim()) {
    const fecha = parseFechaFromText(conversationText);
    if (fecha) extracted.fecha_horario = fecha;
  }

  if (!extracted.num_invitados) {
    const inv = parseInvitadosFromText(conversationText);
    if (inv) extracted.num_invitados = parseInt(inv, 10);
  }

  if (!extracted.direccion_evento?.trim()) {
    const zona = parseZonaFromText(conversationText);
    if (zona) extracted.direccion_evento = zona;
  }

  if (!extracted.requerimientos_evento?.trim()) {
    const services = parseServicesFromText(conversationText);
    if (services.length > 0) {
      extracted.requerimientos_evento = services.slice(0, 3).join(", ");
    }
  }

  if (extracted.presupuesto === null || extracted.presupuesto === undefined) {
    const presChunks = conversationText
      .split(/\n|\.|;/)
      .map((s) => s.trim())
      .filter((s) => /\b(presupuesto|mil\b|pesos|\$|k\b|inversi[oó]n|rango)\b/i.test(s));
    for (const chunk of presChunks) {
      const pres = parsePresupuestoFromText(chunk);
      if (!pres) continue;
      const num = parseInt(pres.replace(/[^\d]/g, ""), 10);
      if (!isNaN(num) && num >= 1000) {
        extracted.presupuesto = num;
        break;
      }
    }
  }

  if (
    extracted.presupuesto !== null &&
    extracted.num_invitados !== null &&
    extracted.presupuesto === extracted.num_invitados &&
    extracted.presupuesto < 1000
  ) {
    extracted.presupuesto = null;
  }

  if (
    extracted.requerimientos_evento?.trim() &&
    extracted.tipo_evento?.trim() &&
    extracted.requerimientos_evento.trim().toLowerCase() === extracted.tipo_evento.trim().toLowerCase()
  ) {
    extracted.requerimientos_evento = null;
  }
}
