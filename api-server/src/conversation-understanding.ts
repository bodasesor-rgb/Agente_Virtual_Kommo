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
  sanitizeDisplayName,
} from "./contact-name.js";

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
    /pensado|servicios?|banquete|taquiza|cotizar|adem[aá]s\s+del|qu[eé]\s+necesitas|qu[eé]\s+buscas|men[uú]|plat[ií]came|otro\s+servicio|te\s+gustar[ií]a\s+cotizar/i,
  invitados:
    /invitados|personas|gente|cu[aá]ntos|cu[aá]ntas|aproximadamente|m[aá]s\s+o\s+menos|para\s+cu[aá]ntas|ser[ií]an/i,
  zona: /ciudad|d[oó]nde\s+(lo|ser[ií]|ser[aá]|queda|est[aá]n)|en\s+qu[eé]\s+(ciudad|zona|lugar)|lugar|direcci[oó]n|ubicaci[oó]n|zona|sal[oó]n/i,
  fecha: /fecha|cu[aá]ndo|d[ií]a|agenda|definiendo|opciones\s+de\s+fecha|para\s+cu[aá]ndo/i,
  presupuesto: /presupuesto|estimado|rango|inversi[oó]n|budget|monto/i,
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
  ["Iluminación", /\biluminaci[oó]n\b/i],
  ["Decoración", /\bdecoraci[oó]n\b/i],
  ["Floristería", /\b(florer[ií]a|flores|arreglos?\s+florales?)\b/i],
  ["Mobiliario", /\b(mobiliario|m[aá]rmol|sillas?|mesas?)\b/i],
  ["Carpas", /\b(carpa|carpas|toldo)\b/i],
  ["Pantallas", /\b(pantalla|pantallas|led\s*wall)\b/i],
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
  /banquete|taquiza|tacos|barra|bebida|dj|carpa|men[uú]|mobiliario|pizza|sushi|parrillada|postre|dulce|iluminaci[oó]n|pantalla|coffee|brunch|kosher|formal|mexican|coctel|mixolog|canap|crep|queso|inflable|softplay|estructura|pista|tarima|baile|mesas?|sillas?|mesero|decoraci[oó]n|flor|brunch/i;

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
};

const TIPO_EVENTO_PATTERNS: Array<[string, RegExp]> = [
  [/\b(boda|bodas|matrimonio|casamiento|nupcial)\b/i, "boda"],
  [/\b(baby\s*shower)\b/i, "baby shower"],
  [/\b(xv\s*a[nñ]os?|quincea[nñ]era|quince|xv)\b/i, "XV años"],
  [/\b(evento\s+corporativo|convenci[oó]n|conferencia|corporativo)\b/i, "evento corporativo"],
  [/\b(cumplea[nñ]os?|cumple)\b/i, "cumpleaños"],
  [/\b(bautizo)\b/i, "bautizo"],
  [/\b(comuni[oó]n|graduaci[oó]n)\b/i, "celebración"],
];

/** Cliente pide ideas o recomendaciones (no está confirmando servicios aún). */
export function clientAsksForRecommendations(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /recomendaciones?|recomiendas?/i.test(t) ||
    /qu[eé]\s+me\s+(recomiendas?|recomendaciones?|sugieres|conviene|puedes\s+dar)/i.test(t) ||
    /qu[eé]\s+(puedo|podemos)\s+(meter|incluir|poner|agregar)/i.test(t) ||
    /qu[eé]\s+opciones/i.test(t) ||
    /qu[eé]\s+servicios\s+me\s+conviene/i.test(t) ||
    /banquete\s+o\s+taquiza|taquiza\s+o\s+banquete/i.test(t) ||
    /algo\s+m[aá]s\s*\?/i.test(t)
  );
}

/** Cliente pregunta catering (no es fila del Sheet — mapear a alimentos). */
export function clientMentionsCatering(message?: string): boolean {
  if (!message?.trim()) return false;
  return /\bcatering\b/i.test(message);
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
  /\b(cdmx|ciudad\s+de\s+m[eé]xico|df|polanco|reforma|santa\s+fe|interlomas|monterrey|guadalajara|puebla|quer[eé]taro|canc[uú]n|tijuana|le[oó]n|m[eé]rida|toluca|cuernavaca|acapulco|veracruz|tulum|playa\s+del\s+carmen)\b/i;

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

export function parseZonaFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /@/.test(trimmed)) return null;
  if (isGreetingOnlyMessage(trimmed)) return null;
  if (isAffirmativeOnlyMessage(trimmed)) return null;

  if (KNOWN_ZONES.test(trimmed)) {
    const m = trimmed.match(KNOWN_ZONES);
    if (m) return m[0]!.trim();
  }

  const enMatch = trimmed.match(
    /\ben\s+([A-Za-zÁÉÍÓÚáéíóúñ][A-Za-zÁÉÍÓÚáéíóúñ\s.-]{2,28})(?:\s|,|\.|$)/i
  );
  if (enMatch) {
    const lugar = enMatch[1]!.trim();
    if (!MONTH_PATTERN.test(lugar) && !/^\d/.test(lugar) && !isGreetingOnlyMessage(lugar)) {
      return lugar;
    }
  }

  return null;
}

export function parseFechaFromText(text: string): string | null {
  const trimmed = text.trim();
  const fechaMatch = trimmed.match(
    /\b(?:el\s+)?(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?)\b/i
  );
  if (fechaMatch) return fechaMatch[1]!;

  if (
    /\b(pr[oó]ximo\s+s[aá]bado|pr[oó]ximo\s+domingo|sin\s+fecha|a[uú]n\s+no\s+tenemos\s+fecha|todav[ií]a\s+no|por\s+definir)\b/i.test(
      trimmed
    )
  ) {
    return trimmed.slice(0, 80);
  }

  if (MONTH_PATTERN.test(trimmed) && /\d/.test(trimmed)) return trimmed.slice(0, 80);

  return null;
}

export function parsePresupuestoFromText(text: string): string | null {
  const trimmed = text.trim();
  if (
    /\b(no\s+tengo|no\s+s[eé]|sin\s+presupuesto|a[uú]n\s+no|no\s+cuento|no\s+sabemos|depende|no\s+lo\s+s[eé])\b/i.test(
      trimmed
    )
  ) {
    return "Sin definir (cliente indicó que no tiene)";
  }

  // Fechas, invitados u horarios no son presupuesto
  if (parseFechaFromText(trimmed) && !/\b(presupuesto|mil|pesos|mxn|\$|k\b)/i.test(trimmed)) {
    return null;
  }
  if (/\b\d+\s*(personas?|invitados?|pax)\b/i.test(trimmed) && !/\b(presupuesto|mil|pesos|mxn|\$|k\b)/i.test(trimmed)) {
    return null;
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
    /\b(presupuesto|rango|inversi[oó]n|budget|monto|pesos|mxn)\b/i.test(trimmed) ||
    /\b(como|aprox|alrededor|cerca\s+de)\b/i.test(trimmed)
  ) {
    const amountMatch = trimmed.match(/\$?\s*([\d][\d,.]*)/);
    if (amountMatch) return trimmed.slice(0, 80);
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
    if (service || isServiceRelatedMessage(msg)) {
      captures.push({
        label: "Requerimientos o servicios",
        value: service ?? msg.slice(0, 120),
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

  if (!filledSet.has("Presupuesto (MXN)") && asked === "presupuesto") {
    const pres = parsePresupuestoFromText(msg);
    if (pres) captures.push({ label: "Presupuesto (MXN)", value: pres });
  }

  // Zona en respuesta libre aunque Lucy haya preguntado otro dato
  if (!filledSet.has("Lugar/dirección del evento") && asked !== "zona") {
    const zona = parseZonaFromText(msg);
    if (zona && !parseInvitadosFromText(msg) && !parseFechaFromText(msg)) {
      captures.push({ label: "Lugar/dirección del evento", value: zona });
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
      captures.push({
        label: "Requerimientos o servicios",
        value: service ?? msg.trim().slice(0, 120),
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
      if (zona) {
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
      const pres = parsePresupuestoFromText(msg);
      if (pres) {
        captures.push({ label: "Presupuesto (MXN)", value: pres });
        pending.add("Presupuesto (MXN)");
      }
    }
  }

  return captures;
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
    const pres = parsePresupuestoFromText(conversationText);
    if (pres?.startsWith("$")) {
      const num = parseInt(pres.replace(/[^\d]/g, ""), 10);
      if (!isNaN(num) && num > 0) extracted.presupuesto = num;
    }
  }
}
