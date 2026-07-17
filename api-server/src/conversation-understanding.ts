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
  isLikelyUbicacionNotNombre,
  isQuoteIntentMessage,
  sanitizeDisplayName,
} from "./contact-name.js";
import { filterClientEmail } from "./client-email.js";
import { getAdvisorName, LEGACY_ADVISOR_NAMES } from "./lib/bodasesorAdvisor.js";

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
    // No usar "cotización" suelta: "la anoto para tu cotización" NO es pregunta de servicios.
    /pensado|servicios?|banquete|taquiza|adem[aá]s\s+del|qu[eé]\s+necesitas|qu[eé]\s+buscas|plat[ií]came|otro\s+servicio|te\s+gustar[ií]a\s+cotizar|qu[eé].{0,40}cotizar|animaci[oó]n|hora\s+loca|happening|show|incluir\s+en\s+la\s+cotiz|\bmen[uú]\b(?!\s+staff)/i,
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
  ["Coffee break", /\b(barra\s+de\s+caf[eé]|coffee\s*break|coffeebreak)\b/i],
  // Tiempos de comida corporativos (briefs con varios servicios).
  ["Desayuno", /\bdesayunos?\b/i],
  ["Snack", /\bsnacks?\b/i],
  ["Comida", /\bcomidas?\b/i],
  ["Cena", /\bcenas?\b/i],
  ["Menú staff", /\bmen[uú]\s+(para\s+)?staff\b/i],
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
  ["Meseros", /\b(meseros?|staff|personal\s+de\s+servicio)\b/i],
  ["DJ", /\bdj\b/i],
  ["Mixología", /\bmixolog[ií]a\b/i],
  ["Coctelería", /\bcocteler[ií]a\b/i],
  ["Mócteles", /\bm[oó]cteles?\b/i],
  ["Canapés", /\b(canap[eé]s?|bocadillos?)\b/i],
  ["Barra de pizzas", /\b(barra\s+de\s+pizzas?|barra\s+pizza|pizzas?\s+en\s+barra)\b/i],
  ["Pizzas", /\bpizza/i],
  ["Sushi", /\b(sushi|poke)\b/i],
  ["Taquiza", /\b(taquiza|tacos?)\b/i],
  ["Parrillada", /\bparrillada\b/i],
  ["Crepas", /\bcrep[aá]s?\b/i],
  ["Brunch", /\bbrunch\b/i],
  ["Poptails", /\bpoptails?\b/i],
  ["Renta de letras", /\b(renta\s+de\s+letras?|letras?\s+(xv|gigantes?)|letra\s+xv)\b/i],
  ["Valet parking", /\b(valet|estacionamiento\s+valet)\b/i],
  ["Pirotecnia fría", /\b(pirotecnia\s+fr[ií]a|fuegos?\s+fr[ií]os?|cold\s+spark)\b/i],
  ["Mesa imperial", /\bmesa\s+imperial\b/i],
];

export const SERVICE_HINT =
  /banquete|taquiza|tacos|barra|bebida|dj|carpa|men[uú]|comida|alimentos?|mobiliario|pizza|sushi|parrillada|postre|dulce|iluminaci[oó]n|pantalla|coffee|brunch|kosher|formal|mexican|coctel|mixolog|canap|crep|queso|inflable|softplay|estructura|pista|tarima|baile|mesas?|sillas?|mesero|staff|desayuno|snack|cena|decoraci[oó]n|flor|renta\s+de|letras?|valet|pirotecnia|imperial/i;

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
  letras: "renta de letras",
  "renta de letras": "renta de letras",
  "letra xv": "renta de letras",
};

const TIPO_EVENTO_PATTERNS: Array<[string, RegExp]> = [
  [/\b(expo(sición)?|feria|stand\s+de|congreso)\b/i, "evento corporativo"],
  [/\b(boda|bodas|matrimonio|casamiento|nupcial)\b/i, "boda"],
  [/\b(baby\s*shower)\b/i, "baby shower"],
  [/\b(xv\s*a[nñ]os?|quincea[nñ]era|quince|xv)\b/i, "XV años"],
  [/\b(fin\s+de\s+a[nñ]o|fiesta\s+de\s+empresa|eventos?\s+de\s+empresa|de\s+empresa)\b/i, "evento corporativo"],
  [/\b(eventos?\s+corporativos?|convenci[oó]n(es)?|conferencias?|corporativos?)\b/i, "evento corporativo"],
  [/\b(cumplea[nñ]os?|cumple)\b/i, "cumpleaños"],
  [/\b(bautizos?)\b/i, "bautizo"],
  [/\b(comuni[oó]n|graduaci[oó]n)\b/i, "celebración"],
  [/\bpozolada\b/i, "pozolada"],
  [/\bpaellada\b/i, "paellada"],
  [/\btaquiza\b/i, "taquiza"],
  [/\bparrillada\b/i, "parrillada"],
  [/\bcarne\s+asada\b/i, "carne asada"],
  [/\bposada\b/i, "posada"],
  [/\bcena\s+navide[nñ]a\b/i, "cena navideña"],
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

  // Presentación: "Alejandro", "Alejandro!" — no es pregunta por el asesor
  if (/^[a-záéíóúñ]{2,30}!?$/i.test(normalized)) return false;

  const legacyTeamAsk = LEGACY_ADVISOR_NAMES.some((legacy) => {
    const esc = legacy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
      new RegExp(`^${esc}$`, "i").test(normalized) ||
      new RegExp(`\\bqui[eé]n\\s+es\\s+${esc}\\b`, "i").test(t) ||
      new RegExp(`\\best[aá]\\s+${esc}\\b`, "i").test(t)
    );
  });

  return (
    legacyTeamAsk ||
    (new RegExp(`^${advisorEsc}$`, "i").test(normalized) && !(name && name === advisor)) ||
    new RegExp(`\\bqui[eé]n\\s+es\\s+${advisorEsc}\\b`, "i").test(t) ||
    /\bqui[eé]n\s+es\s+alejandro\b/i.test(t) ||
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

export interface AmbiguousNumberContext {
  lastAskedField?: UnderstandingField | null;
}

/** Cliente elige nivel de barra/catálogo (1, 2, 3, básica, tradicional, premium). */
export function isCatalogLevelSelection(
  text: string | null | undefined,
  lastAssistantText?: string | null
): boolean {
  const t = text?.trim().toLowerCase() ?? "";
  if (!t) return false;
  const last = lastAssistantText?.toLowerCase() ?? "";
  const askedNivel =
    /nivel\s+prefieres|cu[aá]l\s+nivel|b[aá]sica.*tradicional.*premium|1\.\s*\*?b[aá]sica/i.test(
      last
    );
  if (!askedNivel) return false;
  return /^(b[aá]sica|tradicional|premium|[123])$/.test(t);
}

/** Número suelto ambiguo — solo dígitos 1-9 (día vs pocos invitados), nunca 10+. */
export function isAmbiguousShortNumber(
  text: string | null | undefined,
  ctx?: AmbiguousNumberContext
): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;

  if (ctx?.lastAskedField === "invitados") return false;

  const guestCount = t.match(/^(?:son\s+)?(\d+)\s*(?:personas?|invitados?|pax|gente)?$/i);
  if (guestCount) {
    const n = parseInt(guestCount[1]!, 10);
    if (n >= 10) return false;
  }

  const elMatch = t.match(/^el\s+(\d{1,2})$/i);
  if (elMatch) {
    const n = parseInt(elMatch[1]!, 10);
    return n >= 1 && n <= 9;
  }

  const bareMatch = t.match(/^(\d+)$/);
  if (bareMatch) {
    const n = parseInt(bareMatch[1]!, 10);
    if (n >= 10) return false;
    return n >= 1 && n <= 9;
  }

  return false;
}

/** Brief pre-llenado desde el formulario web de Bodasesor. */
export interface WebLeadBrief {
  tipo_evento?: string;
  requerimientos_evento?: string;
  fecha_horario?: string;
  direccion_evento?: string;
  num_invitados?: number;
}

export function parseWebLeadBrief(text: string): WebLeadBrief | null {
  const t = text.trim();
  if (!/me\s+interesa\s+cotizar|cotizar\s+para\s+mi\s+evento/i.test(t)) return null;

  const result: WebLeadBrief = {};

  const eventoMatch = t.match(
    /(?:evento|celebraci[oó]n)\s*:\s*([^.\n]+?)(?:\.|,|\s+ser[ií]a|\s+para\s+\d|\s+en\s+)/i
  );
  if (eventoMatch) {
    const chunk = eventoMatch[1]!.trim();
    const tipo = parseTipoEventoFromText(chunk);
    if (tipo) result.tipo_evento = tipo;
    const services = parseServicesFromText(chunk);
    if (services.length) result.requerimientos_evento = services.slice(0, 6).join(", ");
    else if (!tipo) result.requerimientos_evento = chunk;
  }

  const seriaMatch = t.match(/ser[ií]a\s+(?:el\s+)?([^,.\n]+?)\s+en\s+([^,.\n]+?)(?:\.|,|\s+para\s+)/i);
  if (seriaMatch) {
    const fechaPart = seriaMatch[1]!.trim();
    const lugarPart = seriaMatch[2]!.trim();
    result.fecha_horario = parseFechaFromText(fechaPart) ?? fechaPart;
    result.direccion_evento = parseZonaFromText(lugarPart) ?? lugarPart;
  }

  const invMatch = t.match(/para\s+(\d{1,4})\s*(?:personas?|invitados?|pax|gente)/i);
  if (invMatch) result.num_invitados = parseInt(invMatch[1]!, 10);

  return Object.keys(result).length > 0 ? result : null;
}

/** Aplica el brief web a extracted sin sobrescribir datos ya capturados. */
export function applyWebLeadBrief(extracted: ExtractedData, text: string): boolean {
  const brief = parseWebLeadBrief(text);
  if (!brief) return false;
  if (!extracted.tipo_evento?.trim() && brief.tipo_evento) extracted.tipo_evento = brief.tipo_evento;
  if (brief.requerimientos_evento) {
    const merged = mergeServiceRequirements(
      extracted.requerimientos_evento,
      brief.requerimientos_evento,
      6
    );
    if (merged) extracted.requerimientos_evento = merged;
  }
  if (!extracted.fecha_horario?.trim() && brief.fecha_horario) {
    extracted.fecha_horario = brief.fecha_horario;
  }
  if (
    !isUsableDireccionEvento(extracted.direccion_evento) &&
    brief.direccion_evento &&
    isUsableDireccionEvento(brief.direccion_evento)
  ) {
    extracted.direccion_evento = brief.direccion_evento;
  }
  if (!extracted.num_invitados && brief.num_invitados) extracted.num_invitados = brief.num_invitados;
  return true;
}

/** Getting ready / arreglo de novia — evento pequeño, catering ligero. */
export function isGettingReadyContext(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return /\b(getting\s*ready|nos\s+arreglamos|arreglo\s+de\s+novia|donde\s+nos\s+arreglamos|d[ií]a\s+de\s+la\s+boda\s+en\s+casa)\b/i.test(
    text
  );
}

function hasSpecificFoodService(text: string): boolean {
  return /\b(banquete|taquiza|coffee\s*break|barra\s+de\s+(caf[eé]|pizzas?|alimentos)|mesa\s+de\s+(dulces|quesos|postres)|canap[eé]s?|bocadillos?|parrillada|brunch\s+buf[eé]|desayuno\s+(?:buffet|ejecutivo|continental))\b/i.test(
    text
  );
}

/** Término general de comida sin servicio concreto — indagar, no asumir. */
export function isVagueFoodTerm(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (hasSpecificFoodService(t)) return false;
  const services = parseServicesFromText(t);
  // Brief con varios servicios (coffee break + desayuno + …) no es "comida vaga".
  if (services.length >= 2) return false;
  if (
    services.length > 0 &&
    !/^(comida|alimentos?|men[uú]|desayuno|brunch|catering)$/i.test(t) &&
    !/^(quiero|necesito|busco)\s+(comida|alimentos?|men[uú]|desayuno|brunch|catering)$/i.test(t)
  ) {
    // "quiero desayuno" solo → Desayuno concreto (ya no vago).
    if (services.length === 1 && /^(Desayuno|Snack|Cena|Coffee break|Brunch)$/i.test(services[0]!)) {
      return false;
    }
    if (services.length === 1 && !/^(Comida)$/i.test(services[0]!)) {
      return false;
    }
  }
  const cleaned = t
    .replace(/^(quiero|necesito|busco|solo|solamente|nada\s+m[aá]s|me\s+interesa|dame|cotiza(?:r)?)\s+/i, "")
    .replace(/^(una?|el|la|los|las)\s+/i, "")
    .trim();
  if (/^(comida|alimentos?|men[uú]s?|catering|algo\s+de\s+comer)$/i.test(cleaned)) {
    return true;
  }
  return /\b(quiero|necesito|busco)\s+(comida|alimentos?|algo\s+de\s+comer)\b/i.test(t);
}

/** Limpia extracción GPT cuando el turno es un número suelto ambiguo. */
export function sanitizeExtractedAmbiguousNumbers(
  extracted: { num_invitados?: number | null },
  messageText: string | null | undefined,
  ctx?: AmbiguousNumberContext
): void {
  if (isAmbiguousShortNumber(messageText, ctx)) {
    extracted.num_invitados = null;
  }
}

/** Recupera el nombre que el cliente dio cuando Lucy lo pidió (persistencia entre turnos). */
export function recoverClienteNombreFromHistory(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string | null {
  let lastAssistant = "";
  for (const msg of history) {
    if (msg.role === "assistant" && typeof msg.content === "string") {
      lastAssistant = msg.content;
      continue;
    }
    if (msg.role !== "user" || typeof msg.content !== "string") continue;
    const asked = inferLucyAskedField(lastAssistant);
    if (asked !== "nombre" && !LUCY_FIELD_ASK_PATTERNS.nombre.test(lastAssistant)) continue;

    const raw = msg.content.trim();
    if (!raw || isAffirmativeOnlyMessage(raw) || isAmbiguousShortNumber(raw)) continue;
    const soyMatch = raw.match(/^\s*soy\s+(.+)$/i);
    const candidato = soyMatch ? soyMatch[1]!.trim() : raw;
    const nombre = sanitizeDisplayName(candidato);
    if (nombre && candidato.length < 40 && !/\?/.test(candidato) && !/@/.test(candidato)) {
      return nombre;
    }
  }

  if (currentMessage?.trim()) {
    const asked = inferLucyAskedField(lastAssistant);
    if (asked === "nombre" || LUCY_FIELD_ASK_PATTERNS.nombre.test(lastAssistant)) {
      const raw = currentMessage.trim();
      if (!isAffirmativeOnlyMessage(raw) && !isAmbiguousShortNumber(raw)) {
        const soyMatch = raw.match(/^\s*soy\s+(.+)$/i);
        const candidato = soyMatch ? soyMatch[1]!.trim() : raw;
        const nombre = sanitizeDisplayName(candidato);
        if (nombre && candidato.length < 40 && !/\?/.test(candidato) && !/@/.test(candidato)) {
          return nombre;
        }
      }
    }
  }

  return null;
}

/** Cliente pregunta ubicación o cobertura de Bodasesor. */
export function clientAsksLocation(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /d[oó]nde\s+(se\s+)?ubican/i.test(t) ||
    /d[oó]nde\s+est[aá]n\s+ubicados/i.test(t) ||
    /cu[aá]l\s+es\s+su\s+ubicaci[oó]n/i.test(t) ||
    /zona\s+de\s+cobertura/i.test(t) ||
    /en\s+qu[eé]\s+ciudad\s+est[aá]n/i.test(t)
  );
}

/** Temática o comida italiana (incluye partido de Italia, mafia italiana, etc.). */
export function clientMentionsItalianTheme(message?: string): boolean {
  if (!message?.trim()) return false;
  return /\b(italian[ao]?|italia|mafia\s+italiana|pastas?|pizzas?|selecci[oó]n\s+de\s+italia|partido.*italia)\b/i.test(
    message
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

/** Cliente responde que no quiere más servicios (cierra el follow-up de requerimientos). */
export function clientDeclinesMoreServices(message?: string | null): boolean {
  if (!message?.trim()) return false;
  const t = message.trim().toLowerCase();
  return (
    /^(no|nop)[\s.,!]*$/i.test(t) ||
    /\bsolo\s+(con\s+)?eso\b/i.test(t) ||
    /\bsolo\s+ese\b/i.test(t) ||
    /\bsolamente\s+eso\b/i.test(t) ||
    /\bnada\s+m[aá]s\b/i.test(t) ||
    /\bning[uú]n[a]?\b/i.test(t) ||
    /\bning[uú]n\s+otro\b/i.test(t) ||
    /\bno\s+gracias\b/i.test(t) ||
    /\bas[ií]\s+est[aá]\s+bien\b/i.test(t) ||
    /\beso\s+es\s+todo\b/i.test(t) ||
    /\bes\s+todo\b/i.test(t) ||
    /\bya\s+no\b/i.test(t) ||
    /\bno\s+m[aá]s\b/i.test(t) ||
    /\blisto\s+as[ií]\b/i.test(t) ||
    /\bcon\s+eso(\s+est[aá]\s+bien)?\b/i.test(t) ||
    /\bno\s+me\s+interesa\b/i.test(t) ||
    /\bno\s+necesito\s+(nada\s+)?m[aá]s\b/i.test(t) ||
    /\bpor\s+(el\s+)?momento\s+no\b/i.test(t) ||
    /\bpor\s+ahora\s+no\b/i.test(t)
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
    /\bcoffee\s*break\b/i.test(t) ||
    /\bbarra\s+de\s+caf[eé](?!\w)/i.test(t) ||
    /\b(busco|necesito|quiero|cotizar|interesa)\s+(cotizar\s+)?(comida|alimentos?|men[uú])\b/i.test(t) ||
    /\bcomida\s+para\b/i.test(t) ||
    /\b(solo|nada\s+m[aá]s)\s+(comida|alimentos?)\b/i.test(t) ||
    /\b(comida|alimentos?|men[uú])\s+(para|del)\b/i.test(t)
  );
}

/** Cliente pide información, precio o detalle de un servicio concreto. */
export function clientAsksServiceInfo(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  if (!isServiceRelatedMessage(message)) return false;
  return (
    /\b(informaci[oó]n|info|detalle|detalles|qu[eé]\s+incluye|inclusiones?|men[uú]|opciones?)\b/i.test(t) ||
    /\b(cu[aá]nto\s+cuesta|precio|costo|cotizar|cotizaci[oó]n)\b/i.test(t) ||
    /\b(quiero|necesito|me\s+interesa)\s+(informaci[oó]n|saber|cotizar)\b/i.test(t)
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

/**
 * En etapas donde Lucy NO escribe (Humano Trabaja, Cotización, etc.),
 * la ÚNICA excepción es pedir contacto/ayuda de emergencia → pasar teléfonos.
 * No confundir con "ayúdame con el banquete" (pedido de servicio).
 */
export function clientNeedsEmergencyContact(message?: string): boolean {
  if (!message?.trim()) return false;
  if (clientAsksPhone(message)) return true;
  const t = message.trim();
  // Pedido de servicio con "ayuda" no es emergencia.
  if (
    /\b(ayuda|ayudar|ayudame|ayúdame)\b/i.test(t) &&
    isServiceRelatedMessage(t) &&
    !/\b(emergencia|urgente|me\s+urge|auxilio|nadie\s+(me\s+)?(contesta|atiende))\b/i.test(t)
  ) {
    return false;
  }
  return (
    /\b(emergencia|urgente|me\s+urge|es\s+urgente|auxilio)\b/i.test(t) ||
    /\b(contacto\s+(de\s+)?emergencia|n[uú]mero\s+de\s+emergencia)\b/i.test(t) ||
    /\b(necesito|quiero|puedo)\s+(hablar|contactar|llamar).{0,40}(alguien|humano|asesor|persona|equipo|ustedes)\b/i.test(
      t
    ) ||
    /\b(nadie\s+(me\s+)?(contesta|atiende)|no\s+me\s+(contesta|atiende|responde))\b/i.test(t) ||
    /\b(ayuda|auxilio).{0,25}(urgente|emergencia|humano|asesor|persona)\b/i.test(t) ||
    /\b(pasame|pásame|dame|necesito)\s+(un\s+)?(contacto|tel[eé]fono|n[uú]mero)\b/i.test(t) ||
    /\bhablar\s+con\s+(un\s+)?(asesor|humano|persona)\b/i.test(t)
  );
}

/**
 * Cliente pide el catálogo web (link bodasesor.com/catalogos/…).
 * No confundir con "qué incluye" ni con pedir precio.
 */
export function clientAsksForCatalog(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  if (
    /\b(manda|env[ií]a|pasa|comparte|m[aá]ndame|env[ií]ame|pasame|pásame|quiero|necesito|dame)\b.{0,40}\bcat[aá]logo/i.test(
      t
    )
  ) {
    return true;
  }
  if (/\bel\s+cat[aá]logo\s+(de|con|completo|general|web)/i.test(t)) return true;
  if (/\bcat[aá]logo\s+(de|web|completo|general)\b/i.test(t)) return true;
  if (/\blink\s+(del\s+)?cat[aá]logo/i.test(t)) return true;
  if (/bodasesor\.com\/catalogos/i.test(t)) return true;
  // "mándame el de la barra de pizzas" / "pásame el de colgantes"
  if (
    /\b(m[aá]ndame|env[ií]ame|pasa(me)?|pásame|dame)\s+el\s+(de|del)\b/i.test(t) ||
    /\b(m[aá]ndame|env[ií]ame|pasa(me)?|pásame)\s+el\s+link\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Cliente quiere el catálogo general / todos los servicios. */
export function clientWantsFullCatalog(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  if (/\b(m[aá]ndame|env[ií]ame|pasa(me)?|pásame)\s+todo\b/i.test(t)) return true;
  if (/\bcat[aá]logo\s+(completo|general|todo|todos)\b/i.test(t)) return true;
  if (/\b(todo|todos)\s+(el\s+)?cat[aá]logo/i.test(t)) return true;
  if (/\bno\s+s[eé]\s+cu[aá]l\b/i.test(t) && /\bcat[aá]logo/i.test(t)) return true;
  if (/\bindeciso|todas\s+las\s+opciones/i.test(t) && /\bcat[aá]logo/i.test(t)) return true;
  return false;
}

/** Lucy ofreció mandar el catálogo y el cliente acepta con un sí corto. */
export function clientAffirmsCatalogOffer(
  message: string | undefined,
  lastAssistantText: string | null | undefined
): boolean {
  if (!message?.trim() || !lastAssistantText?.trim()) return false;
  if (
    !/cat[aá]logo\s+con\s+m[aá]s\s+detalle|te\s+mande\s+el\s+cat[aá]logo|quieres\s+que\s+te\s+mande\s+el\s+cat[aá]logo/i.test(
      lastAssistantText
    )
  ) {
    return false;
  }
  const t = message.trim().toLowerCase();
  if (clientAsksForCatalog(message)) return true;
  return /^(s[ií]|sip|sep|dale|claro|ok|okay|va|por\s+favor|pls|please|mande|mándame|env[ií]a|envíame)([.!?]|\s|$)/i.test(
    t
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
  /\b(cdmx|ciudad\s+de\s+m[eé]xico|df|polanco|reforma|santa\s+fe|interlomas|monterrey|guadalajara|puebla|quer[eé]taro|canc[uú]n|tijuana|le[oó]n|m[eé]rida|toluca|cuernavaca|acapulco|veracruz|tulum|playa\s+del\s+carmen|nezahualc[oó]yotl|corregidor|centro\s+hist[oó]rico|estado\s+de\s+m[eé]xico|edo\.?\s*m[eé]x|naucalpan|coyoac[aá]n|xochimilco)\b/i;

/** Fragmentos (sin artículo) que NO son ubicación, aunque vengan tras "en …". */
const NON_LOCATION_WORDS =
  /^(total|este|esta|ese|esa|medio|mente|general|particular|comida|pista|baile|solo|m[ií]o|tu|su|sal[oó]n|edificio|venue|jard[ií]n|casa|lugar|sitio|aqu[ií]|all[aá])\b/i;

/**
 * "salón", "edificio", "en el salón" sin nombre propio / ciudad / colonia
 * NO cuentan como ubicación completa del evento.
 */
export function isVagueVenueOnly(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;
  const cleaned = t
    .replace(/^(el|la|los|las|un|una|en\s+(el|la|los|las)?)\s+/i, "")
    .trim();
  if (!cleaned) return true;
  if (
    /^(sal[oó]n|edificio|venue|jard[ií]n|casa|lugar|sitio|aqu[ií]|all[aá])$/i.test(
      cleaned
    )
  ) {
    return true;
  }
  // Compuestos genéricos sin nombre propio.
  if (
    /^(sal[oó]n|edificio|venue|jard[ií]n)(\s+de)?(\s+(eventos?|oficinas?|corporativo|privado|la\s+empresa|la\s+compa[nñ][ií]a))?$/i.test(
      cleaned
    )
  ) {
    return true;
  }
  return false;
}

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

  // "Comida" como tiempo de menú solo en briefs con varios servicios/tiempos.
  // Si el cliente dice solo "busco comida", sigue el alias banquete/taquiza.
  const hasMealListContext =
    /\b(desayuno|snack|cena|coffee\s*break|coffeebreak|men[uú]\s+staff)\b/i.test(text) ||
    (text.match(/,/g) ?? []).length >= 1 ||
    /\b(desayuno|snack|comida|cena)\b.+\b(desayuno|snack|comida|cena)\b/i.test(text);

  for (const [label, pattern] of BODASESOR_SERVICE_PATTERNS) {
    if (label === "Comida" && !hasMealListContext) continue;
    if (pattern.test(lower)) found.push(label);
  }

  // Evita duplicar "Menú staff" + "Meseros" cuando el cliente dijo "menú staff".
  if (found.includes("Menú staff")) {
    const meserosIdx = found.indexOf("Meseros");
    if (meserosIdx >= 0) found.splice(meserosIdx, 1);
  }

  const normalized = normalizeShortServicePhrase(text);
  if (normalized) {
    const normLower = normalized.toLowerCase();
    const already = found.some(
      (s) => s.toLowerCase().includes(normLower) || normLower.includes(s.toLowerCase())
    );
    // No expandir "comida"→banquete/taquiza si ya hay tiempos de comida u otros servicios.
    const isVagueFoodAlias = /banquete\s*\/\s*taquiza/i.test(normalized);
    if (!already && !(isVagueFoodAlias && found.length > 0)) {
      found.push(normalized);
    }
  }

  return [...new Set(found)];
}

/** Lista natural en español: "A, B y C". */
export function formatServicesList(services: string[]): string {
  const clean = services.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0]!;
  if (clean.length === 2) return `${clean[0]} y ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} y ${clean[clean.length - 1]}`;
}

/** Une servicios de un texto con los ya capturados (hasta max). */
export function mergeServiceRequirements(
  existing: string | null | undefined,
  text: string | null | undefined,
  max = 6
): string | null {
  const fromExisting = existing?.trim() ? parseServicesFromText(existing) : [];
  const fromText = text?.trim() ? parseServicesFromText(text) : [];
  const merged = [...new Set([...fromExisting, ...fromText])].slice(0, max);
  if (merged.length === 0) {
    const fallback = existing?.trim() || text?.trim() || "";
    return fallback ? fallback.slice(0, 250) : null;
  }
  return merged.join(", ");
}

/** Ack cuando el cliente pidió varios servicios en un brief. */
export function buildMultiServiceAck(services: string[]): string {
  const list = formatServicesList(services);
  if (!list) return "Perfecto, anoto lo que necesitas para tu evento.";
  if (services.length === 1) {
    return `Perfecto, veo que necesitas ${list}.`;
  }
  return `Perfecto, veo que necesitas ${list}. Te cotizamos todo eso.`;
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
  if (/\bservicio\s+completo\b/i.test(trimmed)) return true;
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

  // "N personas/invitados" siempre, aunque el brief también nombre servicios.
  const numMatchEarly = trimmed.match(
    /\b(\d+)\s*(personas?|invitados?|pax|guests?|gentes?|cabezas?)\b/i
  );
  if (numMatchEarly) return numMatchEarly[1]!;

  if (isServiceRelatedMessage(trimmed)) return null;

  if (
    /\b(no\s+s[eé](\s+a[uú]n)?|a[uú]n\s+no(\s+s[eé])?|sin\s+definir|por\s+definir|no\s+tenemos|no\s+damos|depende|todav[ií]a\s+no|m[aá]s\s+adelante|no\s+lo\s+sabemos|van\s+viendo)\b/i.test(
      trimmed
    )
  ) {
    return "Sin definir (cliente indicó aproximación pendiente)";
  }

  // "entre 90 y 100" — guarda el mayor de los dos números
  const rangoMatch = trimmed.match(/\bentre\s+(\d+)\s+y\s+(\d+)\b/i);
  if (rangoMatch) {
    const a = parseInt(rangoMatch[1]!, 10);
    const b = parseInt(rangoMatch[2]!, 10);
    return String(Math.max(a, b));
  }

  const numMatch = trimmed.match(/\b(\d+)\s*(personas?|invitados?|pax|guests?|gentes?|cabezas?)\b/i);
  if (numMatch) return numMatch[1]!;

  const paraMatch = trimmed.match(/\b(?:para|somos|ser[ií]an?|como|unos?|unas?)\s+(\d+)\b/i);
  if (paraMatch) return paraMatch[1]!;

  // "más o menos 120", "aproximadamente 80" — número suelto con calificador aproximado
  const aproxMatch = trimmed.match(
    /\b(?:m[aá]s\s+o\s+menos|aproximadamente|al\s+rededor\s+de|alrededor\s+de|cerca\s+de)\s+(\d+)\b/i
  );
  if (aproxMatch) return aproxMatch[1]!;

  const writtenMatch = trimmed.match(
    /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos)\s+(personas?|invitados?)\b/i
  );
  if (writtenMatch) {
    return WRITTEN_NUMBERS[writtenMatch[1]!.toLowerCase()] ?? null;
  }

  if (/^el\s+\d{1,2}$/i.test(trimmed)) return null;

  if (/^\d{1,4}$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    if (n < 10) return null;
    return trimmed;
  }

  return null;
}

/** Texto que describe medidas del espacio, NO ubicación geográfica. */
export function isDimensionText(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return (
    /\b\d+\s*metros?\s*(por|x)\s*\d+\s*metros?\b/i.test(t) ||
    /\b\d+\s*m\s*(por|x)\s*\d+\s*m\b/i.test(t) ||
    /\bespacio\s+(es\s+de|de|mide)\s+\d+/i.test(t) ||
    /^\d+\s*x\s*\d+\s*(m|metros?)?$/i.test(t) ||
    /^\d+m\s*x\s*\d+m$/i.test(t)
  );
}

/** Ubicación usable: no vacía, no medidas, no venue genérico ("salón"/"edificio"). */
export function isUsableDireccionEvento(value: string | null | undefined): boolean {
  const t = value?.trim() ?? "";
  if (!t) return false;
  if (isDimensionText(t)) return false;
  if (isVagueVenueOnly(t)) return false;
  return true;
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

  const expoMatch = trimmed.match(/\bexpo\s+[A-Za-zÁÉÍÓÚáéíóúñ][\w\s.-]{2,40}/i);
  if (expoMatch?.[0]) return expoMatch[0].trim();

  if (KNOWN_ZONES.test(trimmed)) {
    const m = trimmed.match(KNOWN_ZONES);
    if (m) return m[0]!.trim();
  }

  // "colonia Roma", "delegación Coyoacán", "alcaldía Benito Juárez", "fraccionamiento X"
  const coloniaMatch = trimmed.match(
    /\b((?:colonia|delegaci[oó]n|alcald[ií]a|fraccionamiento)\s+[A-Za-zÁÉÍÓÚáéíóúñ][A-Za-zÁÉÍÓÚáéíóúñ\s.-]{1,28})/i
  );
  if (coloniaMatch?.[1]) return coloniaMatch[1].trim();

  const enMatch = trimmed.match(
    /\ben\s+([A-Za-zÁÉÍÓÚáéíóúñ][A-Za-zÁÉÍÓÚáéíóúñ\s.-]{2,28})(?:\s|,|\.|$)/i
  );
  if (enMatch) {
    const lugar = enMatch[1]!.trim();
    // Quita el artículo antes de validar (pero lo conserva del resultado si aplica),
    // así "en el Estado de México" o "en la colonia Roma" ya no se descartan.
    const sinArticulo = lugar.replace(/^(el|la|los|las)\s+/i, "").trim();
    const candidato = sinArticulo || lugar;
    if (
      !MONTH_PATTERN.test(candidato) &&
      !/^\d/.test(candidato) &&
      !isGreetingOnlyMessage(candidato) &&
      !NON_LOCATION_WORDS.test(candidato) &&
      !isVagueVenueOnly(candidato) &&
      !/\b(solo|para\s+la|total|comida|pista)\b/i.test(candidato)
    ) {
      return candidato;
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

const CORREO_DICTADO_STOPWORDS = new Set([
  "es",
  "mi",
  "correo",
  "el",
  "mail",
  "email",
  "de",
  "ser[ií]a",
  "seria",
  "sería",
]);

/** Convierte un correo dictado por voz ("ana arroba gmail punto com") a formato estándar. */
function normalizeDictatedCorreo(text: string): string | null {
  const lower = text.toLowerCase().replace(/[¿?¡!,.;:]+$/g, "");
  if (!/\barroba\b/.test(lower)) return null;

  const tokens = lower.split(/\s+/);
  const arrobaIdx = tokens.indexOf("arroba");
  if (arrobaIdx === -1) return null;

  const localParts: string[] = [];
  for (let i = arrobaIdx - 1; i >= 0; ) {
    const tok = tokens[i]!;
    if (tok === "bajo" && i - 1 >= 0 && (tokens[i - 1] === "guion" || tokens[i - 1] === "guión")) {
      localParts.unshift("_");
      i -= 2;
      continue;
    }
    if (tok === "guion" || tok === "guión") {
      localParts.unshift("-");
      i -= 1;
      continue;
    }
    if (CORREO_DICTADO_STOPWORDS.has(tok)) break;
    if (!/^[a-z0-9]+$/.test(tok)) break;
    localParts.unshift(tok);
    i -= 1;
  }
  if (localParts.length === 0) return null;

  const domainParts: string[] = [];
  for (let i = arrobaIdx + 1; i < tokens.length; ) {
    const tok = tokens[i]!;
    if (tok === "punto") {
      domainParts.push(".");
      i += 1;
      continue;
    }
    if (tok === "guion" || tok === "guión") {
      if (tokens[i + 1] === "bajo") {
        domainParts.push("_");
        i += 2;
        continue;
      }
      domainParts.push("-");
      i += 1;
      continue;
    }
    if (!/^[a-z0-9]+$/.test(tok)) break;
    domainParts.push(tok);
    i += 1;
  }
  if (domainParts.length === 0) return null;

  const candidate = `${localParts.join("")}@${domainParts.join("")}`;
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(candidate) ? candidate : null;
}

export function parseCorreoFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  const raw = m ? m[1]! : normalizeDictatedCorreo(text);
  if (!raw) return null;
  return filterClientEmail(raw);
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

/** Tras cuántas preguntas de Lucy por presupuesto se deja de insistir. */
export const PRESUPUESTO_MAX_ASKS = 2;

/** Valor CRM cuando el cliente no dio monto tras varios intentos. */
export const PRESUPUESTO_AUTO_WAIVER = "Sin definir (no indicó monto)";

/** Cuenta cuántas veces Lucy preguntó por un dato en el historial. */
export function countLucyFieldAsks(
  history: import("openai").OpenAI.Chat.ChatCompletionMessageParam[],
  field: UnderstandingField
): number {
  const pattern = LUCY_FIELD_ASK_PATTERNS[field];
  return history.filter(
    (m) => m.role === "assistant" && typeof m.content === "string" && pattern.test(m.content as string)
  ).length;
}

/** Cliente rechazó dar presupuesto (incluye "no" suelto tras pregunta de Lucy). */
export function detectPresupuestoRefusal(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/^(no|nop)[\s.,!]*$/i.test(t)) return true;
  if (/^(no\s+tengo|no\s+tenemos|no\s+cuento)[\s.,!]*$/i.test(t)) return true;
  if (/^(opciones?|propuestas?)[\s.,!]*$/i.test(t)) return true;
  if (/^\.{2,}$/.test(t)) return true;
  return (
    /\bno\s+(tengo|tenemos|cuento|sabemos)\s+(un\s+)?presupuesto\b/i.test(t) ||
    /\bno\s+me\s+brindaron\b/i.test(t) ||
    /\bno\s+nos\s+(dieron|brindaron)\b/i.test(t) ||
    /\bsin\s+presupuesto\b/i.test(t) ||
    /\b(sin\s+rango|no\s+tengo\s+rango)\b/i.test(t) ||
    /\b(m[aá]ndame|m[aá]nden)\s+(el\s+)?presupuesto\b/i.test(t) ||
    /\b(m[aá]ndame|m[aá]nden)\s+(la\s+)?cotiz/i.test(t) ||
    /\bt[uú]\s+m[aá]ndame\b/i.test(t) ||
    /\bsi\s+quieres\s+vemos\b/i.test(t) ||
    /\b(no\s+s[eé]|no\s+lo\s+s[eé]|ni\s+idea|no\s+tengo\s+idea)(?:\s|$|[.,!?])/i.test(t) ||
    /\ba[uú]n\s+no\s+(?:s[eé]|lo\s+s[eé]|s[eé]\s+cu[aá]nto)/i.test(t) ||
    /\btodav[ií]a\s+no\b/i.test(t) ||
    /\bdespu[eé]s\s+(vemos|platicamos|veo)\b/i.test(t) ||
    /\bcuando\s+(veamos|tengamos|me\s+manden)\b/i.test(t) ||
    /\bustedes\s+me\s+(mandan|env[ií]an|pasan)\b/i.test(t) ||
    /\bmejor\s+(que\s+)?(me\s+)?mand/i.test(t) ||
    /\bque\s+(nos|me|ustedes|ellos)\s+propong/i.test(t) ||
    /\bpropong(an|a)\s+(opciones|algo)\b/i.test(t) ||
    /\bque\s+(nos|me)\s+(den|de)\s+opciones\b/i.test(t) ||
    /\b(el\s+)?equipo\s+(me\s+)?propong/i.test(t) ||
    (/\bno\b/i.test(t) && /\bpresupuesto\b/i.test(t))
  );
}

/** Flag único: presupuesto ya resuelto (monto, waiver o “que propongan”). */
export function isPresupuestoResuelto(
  filledSet: Set<string>,
  texts: string[] = [],
  history?: import("openai").OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  if (filledSet.has("Presupuesto (MXN)")) return true;
  if (findPresupuestoInTexts(texts, history)) return true;
  if (texts.some((t) => detectPresupuestoRefusal(t))) return true;
  return false;
}

/** Busca presupuesto (monto o waiver) en mensajes del cliente con contexto de la pregunta previa. */
export function findPresupuestoInTexts(
  texts: string[],
  history?: import("openai").OpenAI.Chat.ChatCompletionMessageParam[]
): string | null {
  if (history?.length) {
    let lastAssistant = "";
    for (const msg of history) {
      if (msg.role === "assistant" && typeof msg.content === "string") {
        lastAssistant = msg.content;
      }
      if (msg.role === "user" && typeof msg.content === "string") {
        const asked = inferLucyAskedField(lastAssistant);
        const pres = parsePresupuestoFromText(msg.content, {
          askedField: asked === "presupuesto" ? "presupuesto" : null,
        });
        if (pres) return pres;
      }
    }
  }
  for (const t of texts) {
    const pres = parsePresupuestoFromText(t);
    if (pres) return pres;
  }
  return null;
}

export function parsePresupuestoFromText(text: string, opts?: PresupuestoParseOptions): string | null {
  const trimmed = text.trim();

  if (
    /\b(m[aá]ndame|m[aá]nden)\s+(el\s+)?(presupuesto|cotiz)/i.test(trimmed) ||
    /\bt[uú]\s+m[aá]ndame\b/i.test(trimmed)
  ) {
    return "Sin definir (cliente pidió que propongamos)";
  }

  if (/^(opciones?|propuestas?)[\s.,!]*$/i.test(trimmed)) {
    return "Sin definir (cliente pidió que propongamos)";
  }

  if (
    /\b(que\s+(me\s+)?propongan|el\s+equipo\s+(me\s+)?propong|ustedes\s+(me\s+)?propong)/i.test(
      trimmed
    )
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

  if (/\b(poquito|lo\s+que\s+sea\s+necesario|flexible|lo\s+que\s+se\s+necesite)\b/i.test(trimmed)) {
    return "Flexible (sin monto fijo)";
  }

  if (opts?.askedField === "presupuesto" && /^(no|nop)[\s.,!]*$/i.test(trimmed)) {
    return "Sin definir (cliente indicó que no tiene)";
  }

  if (opts?.askedField === "presupuesto") {
    if (/^(s[ií]|ok|vale|bueno|est[aá]\s+bien|perfecto|claro|de\s+acuerdo|opciones?|propuestas?)[\s.,!]*$/i.test(trimmed)) {
      return trimmed.match(/^opciones?|^propuestas?/i)
        ? "Sin definir (cliente pidió que propongamos)"
        : PRESUPUESTO_AUTO_WAIVER;
    }
    if (/^(no\s+s[eé]|no\s+lo\s+s[eé]|ni\s+idea|no\s+tengo\s+idea|\.\.+)[\s.,!]*$/i.test(trimmed)) {
      return "Sin definir (cliente indicó que no tiene)";
    }
  }

  if (
    /\b(no\s+tengo|no\s+s[eé]|sin\s+presupuesto|a[uú]n\s+no|no\s+cuento|no\s+sabemos|depende|no\s+lo\s+s[eé]|no,?\s+a[uú]n\s+no|que\s+alejandro\s+de\s+opciones|que\s+nos\s+propong|ver\s+opciones|todav[ií]a\s+no|despu[eé]s\s+vemos)\b/i.test(
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

  // "$500 por persona", "500 por cabeza", "500 x persona", "unos 600 pp", "500 c/u"
  const perPersonMatch = trimmed.match(
    /\$?\s*([\d][\d,.]*)\s*(?:mxn|mnx|pesos)?\s*(?:por\s+(?:persona|cabeza)|x\s+persona|pp\b|c\/u\b)/i
  );
  if (perPersonMatch) {
    const num = parseInt(perPersonMatch[1]!.replace(/,/g, ""), 10);
    if (!isNaN(num) && num > 0) return `$${num.toLocaleString("es-MX")} MXN por persona`;
  }

  const menosDeMatch = trimmed.match(
    /\b(?:menos\s+de|hasta|m[aá]ximo|max\.?)\s+\$?\s*([\d][\d,.]*)\s*(mxn|mnx|pesos)?\b/i
  );
  if (menosDeMatch) {
    return `Hasta $${menosDeMatch[1]!.replace(/,/g, "")} MXN`;
  }

  const topeMatch = trimmed.match(
    /\btope\s+(?:es\s+)?(?:de\s+)?\$?\s*([\d][\d,.]*)\s*(mxn|mnx|pesos|k)?\b/i
  );
  if (topeMatch) {
    const suffix = topeMatch[2]?.toLowerCase() === "k" ? "k" : "";
    return `Hasta $${topeMatch[1]!.replace(/,/g, "")}${suffix} MXN`;
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
    /\b(presupuesto|rango|inversi[oó]n|budget|monto|pesos|mxn|mnx|tope)\b/i.test(trimmed) ||
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
    !isAmbiguousShortNumber(msg) &&
    !isLikelyUbicacionNotNombre(msg) &&
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
    const services = parseServicesFromText(msg);
    const service =
      services.length > 0 ? services.slice(0, 6).join(", ") : parsePrimaryService(msg);
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
    if (zona && isUsableDireccionEvento(zona)) {
      captures.push({ label: "Lugar/dirección del evento", value: zona });
    }
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

  if (!pending.has("Nombre del cliente")) {
    const nombre = recoverClienteNombreFromHistory(history, currentMessage);
    if (nombre) {
      captures.push({ label: "Nombre del cliente", value: nombre });
      pending.add("Nombre del cliente");
    }
  }

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
      const services = parseServicesFromText(msg);
      const service = services.length > 0 ? services.slice(0, 6).join(", ") : parsePrimaryService(msg);
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

    if (!pending.has("Número de invitados") && !isAmbiguousShortNumber(msg)) {
      const inv = parseInvitadosFromText(msg);
      if (inv) {
        captures.push({ label: "Número de invitados", value: inv });
        pending.add("Número de invitados");
      }
    }

    if (!pending.has("Lugar/dirección del evento")) {
      const zona = parseZonaFromText(msg);
      if (zona && isUsableDireccionEvento(zona)) {
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

  if (!isUsableDireccionEvento(extracted.direccion_evento)) {
    if (isVagueVenueOnly(extracted.direccion_evento) || isDimensionText(extracted.direccion_evento)) {
      extracted.direccion_evento = null;
    }
    const zona = parseZonaFromText(conversationText);
    if (zona && isUsableDireccionEvento(zona)) extracted.direccion_evento = zona;
  }

  {
    const merged = mergeServiceRequirements(
      extracted.requerimientos_evento,
      conversationText,
      6
    );
    if (merged) extracted.requerimientos_evento = merged;
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
