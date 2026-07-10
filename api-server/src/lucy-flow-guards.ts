import type { OpenAI } from "openai";
import type { ExtractedData } from "./types.js";
import {
  isAffirmativeOnlyMessage,
  isGreetingOnlyMessage,
  resolveClientDisplayName,
  sanitizeDisplayName,
} from "./contact-name.js";
import { normalizeAdvisorReferences, advisorLabelForClient } from "./lib/bodasesorAdvisor.js";
import {
  buildAlejandroPriceReply,
  clientAsksPrice,
  getPriceServiceLabel,
  mentionsListedPriceService,
  mentionsNoListedPriceService,
  messageClaimsPrice,
  responseHasInventedPrice,
  sanitizeInventedPrices,
  stripStalePriceTalk,
} from "./price-guard.js";
import {
  buildCatalogPriceAnswer,
  buildCatalogInclusionAnswer,
  buildCatalogComparisonAnswer,
  buildCatalogCateringAnswer,
  clientAsksInclusion,
} from "./services/catalogService.js";
import {
  BODASESOR_SERVICE_PATTERNS,
  clientAsksForRecommendations,
  clientAsksAboutTeam,
  clientAsksPhone,
  clientDeclinesMoreServices,
  clientMentionsEntertainment,
  clientMentionsPistaTarima,
  detectPresupuestoRefusal,
  findPresupuestoInTexts,
  countLucyFieldAsks,
  PRESUPUESTO_MAX_ASKS,
  PRESUPUESTO_AUTO_WAIVER,
  parsePresupuestoFromText,
  clientAddsToQuote,
  clientAsksBanqueteVsTaquiza,
  clientMentionsCatering,
  inferLucyAskedField,
  isServiceRelatedMessage,
  parsePrimaryService,
  parseSpaceDimensions,
  parseFechaFromText,
} from "./conversation-understanding.js";

export const EMAIL_WAIVED_LABEL = "Correo (prefiere no compartir)";
export const BODASESOR_EMAIL = "hola@bodasesor.com";
/** Sufijo CRM cuando el nombre viene de WhatsApp porque el cliente no lo escribió. */
export const WHATSAPP_NOMBRE_NOTE = "(nombre de WhatsApp — el cliente no lo escribió)";

const EMAIL_REFUSAL_PATTERN =
  /(?:no\s+tengo(\s+un?)?\s+correo|no\s+quiero(\s+dar|\s+compartir)?(\s+mi)?\s+correo|sin\s+correo|no\s+uso\s+correo|no\s+dispongo\s+de\s+correo|por\s+este\s+medio|prefiero\s+(?:por\s+)?whatsapp|por\s+aqu[ií]|mandar.*por\s+aqu[ií]|me\s+la\s+(?:pueden\s+)?mandar\s+por\s+aqu[ií]|aqu[ií]\s+(?:est[aá]|por)|por\s+aqu[ií]\s+por\s+fa|no\s+me\s+gusta\s+dar|no\s+es\s+necesario|no\s+hace\s+falta|no\s+quiero\s+darlo)/i;

/** 8 pasos obligatorios para cierre (correo es opcional pero se intenta en paso 2). */
export const CLOSING_CORE_FIELDS = [
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Número de invitados",
  "Lugar/dirección del evento",
  "Fecha y horario",
  "Presupuesto (MXN)",
] as const;

/** Presentación obligatoria en el primer mensaje de Lucy. */
export const LUCY_INTRO = "Hola, soy Lucy, agente virtual de Bodasesor.";

/** Opciones de evento para orientar al cliente. */
export const TIPO_EVENTO_HINT =
  "Manejamos bodas, XV años, baby showers, cumpleaños, eventos corporativos, bautizos y celebraciones familiares.";

/** Texto para que el cliente sepa qué ofrece Bodasesor al preguntar por servicios. */
export const SERVICIOS_CATALOGO_HINT =
  "Manejamos alimentos y barras (banquetes, taquizas, barras temáticas), mobiliario, carpas, pistas de baile, DJ, iluminación, pantallas, mesas de dulces y más.";

/** Variante corta cuando el cliente ya mencionó un servicio. */
export const SERVICIOS_CATALOGO_HINT_ADICIONAL =
  "También manejamos bebidas, DJ, iluminación, carpas, mobiliario, pantallas, mesas de dulces y barras de alimentos.";

/** True si el mensaje ya menciona opciones del catálogo (evita repetir el bloque). */
export function mensajeMencionaCatalogoServicios(mensaje: string): boolean {
  return /alimentos?|mobiliario|carpas?|pistas?(\s+de\s+baile)?|bebidas?|banquete|taquiza|iluminaci[oó]n|pantallas?|mesas?\s+de\s+dulces|dj\b|barras?\s+(de\s+)?alimentos|estaciones?\s+de\s+comida/i.test(
    mensaje
  );
}

function appendServiciosCatalogoHint(pregunta: string, adicional = false): string {
  if (mensajeMencionaCatalogoServicios(pregunta)) return pregunta;
  const hint = adicional ? SERVICIOS_CATALOGO_HINT_ADICIONAL : SERVICIOS_CATALOGO_HINT;
  return `${pregunta.trim()} ${hint}`.trim();
}

/** Plantillas legacy — preferir variantes naturales vía buildNaturalQuestion(). */
export const FLOW_QUESTIONS = {
  nombre: "¿Me regalas tu nombre para iniciar?",
  tipoEvento: "¿Qué festejan o qué tipo de evento sería?",
  tipoEventoTrasCorreo: "¿Qué tipo de celebración están planeando?",
  requerimientos: "Platícame, ¿qué tienes pensado para tu evento?",
  invitados: "¿Más o menos para cuántas personas sería?",
  zona: "¿Dónde lo están planeando?",
  fecha: "¿Ya tienen fecha o todavía la van definiendo?",
  presupuesto: "¿Tienen algún rango de presupuesto en mente?",
  serviciosExtra: SERVICIOS_CATALOGO_HINT_ADICIONAL,
} as const;

export type PendingField =
  | "nombre"
  | "correo"
  | "tipo_evento"
  | "requerimientos"
  | "invitados"
  | "zona"
  | "fecha"
  | "presupuesto";

const QUESTION_VARIANTS: Record<PendingField, string[]> = {
  nombre: [
    "¿Me regalas tu nombre para iniciar?",
    "¿Con quién tengo el gusto?",
    "¿Cómo te llamas?",
  ],
  correo: [
    "Para mandarte la info y que nuestro equipo te arme la propuesta, ¿a qué correo te lo envío?",
    "¿Me compartes un correo para enviarte los detalles de la cotización?",
    "¿A qué correo te mando la información?",
  ],
  tipo_evento: [
    "¿Qué tipo de celebración es?",
    "¿Qué festejan o qué evento están planeando?",
    "Cuéntame, ¿de qué se trata el evento?",
  ],
  requerimientos: [
    "Platícame, ¿qué tienes pensado para tu evento?",
    "¿Qué servicios te gustaría cotizar?",
    "¿Qué necesitas para el evento?",
  ],
  invitados: [
    "¿Más o menos para cuántas personas sería?",
    "¿Cuántos invitados tienen contemplados?",
    "¿Tienen un estimado de invitados? Si aún no lo saben, sin problema — pueden darme un rango aproximado.",
  ],
  zona: [
    "¿Dónde lo están planeando?",
    "¿En qué ciudad o zona sería el evento?",
    "¿Tienen ya el lugar o al menos la ciudad?",
  ],
  fecha: [
    "¿Ya tienen fecha o todavía la van definiendo?",
    "¿Para cuándo lo tienen pensado?",
    "¿Ya hay día definido o siguen viendo opciones?",
  ],
  presupuesto: [
    "¿Tienen algún rango de presupuesto en mente?",
    "¿Manejan algún presupuesto estimado para el evento?",
    "¿Tienen idea del presupuesto o prefieren que Alejandro les proponga opciones?",
  ],
};

const FIELD_ASK_PATTERNS: Record<PendingField, RegExp> = {
  nombre: /regalas?\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|con\s+qui[eé]n\s+tengo|tu\s+nombre|me\s+das\s+tu\s+nombre/i,
  correo: /correo|e-?mail|env[ií]o|mandarte|mandar(te)?\s+la\s+info|compartes?\s+un\s+correo/i,
  tipo_evento:
    /festejan|tipo\s+de\s+(evento|celebraci[oó]n)|qu[eé]\s+evento|qu[eé]\s+celebr|de\s+qu[eé]\s+se\s+trata|qu[eé]\s+tipo\s+de\s+celebr/i,
  requerimientos:
    /pensado|servicios?|banquete|taquiza|cotizar|adem[aá]s\s+del|qu[eé]\s+necesitas|qu[eé]\s+buscas|men[uú]|plat[ií]came/i,
  invitados:
    /invitados|personas|gente|cu[aá]ntos|cu[aá]ntas|aproximadamente|m[aá]s\s+o\s+menos|para\s+cu[aá]ntas|ser[ií]an/i,
  zona: /ciudad|d[oó]nde\s+(lo|ser[ií]|ser[aá]|queda|est[aá]n)|en\s+qu[eé]\s+(ciudad|zona|lugar)|lugar|direcci[oó]n|ubicaci[oó]n|zona|sal[oó]n/i,
  fecha: /fecha|cu[aá]ndo|d[ií]a|agenda|definiendo|definido|definir|siguen\s+viendo|opciones\s+de\s+fecha|para\s+cu[aá]ndo/i,
  presupuesto: /presupuesto|estimado|rango|inversi[oó]n|budget|monto/i,
};

export function isValidRequerimientosValue(value: string | null | undefined): boolean {
  return isServiceRelatedMessage(value);
}

const CLOSING_SIGNATURE = "Perfecto, ya tengo todo.";

export function collectUserTexts(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string[] {
  const fromHistory = history
    .filter((m) => m.role === "user" && typeof m.content === "string")
    .map((m) => m.content as string);
  return currentMessage?.trim() ? [...fromHistory, currentMessage.trim()] : fromHistory;
}

export function detectEmailRefusal(texts: string[]): boolean {
  return texts.some((t) => EMAIL_REFUSAL_PATTERN.test(t));
}

export function applyEmailWaiver(filledSet: Set<string>, mergedLines: string[], texts: string[]): void {
  if (filledSet.has("Correo electrónico") || filledSet.has(EMAIL_WAIVED_LABEL)) return;
  if (!detectEmailRefusal(texts)) return;
  mergedLines.push(`- ${EMAIL_WAIVED_LABEL}: continuar por WhatsApp/chat`);
  filledSet.add(EMAIL_WAIVED_LABEL);
}

/** Marca presupuesto como capturado cuando el cliente dijo que no tiene / no le dieron. */
export function applyPresupuestoWaiver(
  filledSet: Set<string>,
  mergedLines: string[],
  texts: string[],
  history?: OpenAI.Chat.ChatCompletionMessageParam[]
): void {
  if (filledSet.has("Presupuesto (MXN)")) return;

  const pres = findPresupuestoInTexts(texts, history);
  if (pres) {
    mergedLines.push(`- Presupuesto (MXN): ${pres}`);
    filledSet.add("Presupuesto (MXN)");
    return;
  }

  if (history && countLucyFieldAsks(history, "presupuesto") >= PRESUPUESTO_MAX_ASKS) {
    mergedLines.push(`- Presupuesto (MXN): ${PRESUPUESTO_AUTO_WAIVER}`);
    filledSet.add("Presupuesto (MXN)");
  }
}

/** Evita insistir con presupuesto cuando ya se capturó o Lucy ya preguntó demasiadas veces. */
function blockExcessivePresupuestoAsk(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: string | undefined,
  buildClosing: (servicios: string | null | undefined, clientName?: string | null) => string,
  cierreYaEnviado: boolean,
  whatsappDisplayName: string | null | undefined,
  entityId: string | number | undefined,
  log?: { info: (obj: unknown, msg?: string) => void }
): string {
  const asksPresupuesto =
    mensajeAsksForField(mensaje, "presupuesto") ||
    (/presupuesto|rango\s+de\s+inversi/i.test(mensaje) && mensaje.includes("?"));

  if (!asksPresupuesto) return mensaje;

  if (!filledSet.has("Presupuesto (MXN)")) {
    applyPresupuestoWaiver(filledSet, [], collectUserTexts(history, currentMessage), history);
  }

  if (!filledSet.has("Presupuesto (MXN)")) return mensaje;

  const presValue = findPresupuestoInTexts(collectUserTexts(history, currentMessage), history);
  if (presValue && /econ[oó]mic/i.test(presValue) && !isReadyForClosing(filledSet)) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
    log?.info({ entityId }, "GUARD: presupuesto económico — no repetir pregunta");
    return nextQ
      ? `Entendido, buscamos opciones económicas. ${nextQ}`
      : "Entendido, buscamos opciones económicas. Nuestro equipo te propone alternativas según lo que platicamos.";
  }

  if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
    log?.info({ entityId }, "GUARD: presupuesto — cierre tras waiver");
    return buildClosing(extracted.requerimientos_evento ?? extracted.tipo_evento ?? null, extracted.nombre);
  }

  const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
  if (nextQ && !mensajeAsksForField(nextQ, "presupuesto")) {
    log?.info({ entityId }, "GUARD: presupuesto capturado — no repetir pregunta");
    return nextQ;
  }

  log?.info({ entityId }, "GUARD: presupuesto capturado — continuar sin re-preguntar");
  return "Entendido, sin problema. Nuestro equipo te propone opciones según lo que platicamos y te arma la cotización.";
}

export function isEmailSatisfied(filledSet: Set<string>): boolean {
  return filledSet.has("Correo electrónico") || filledSet.has(EMAIL_WAIVED_LABEL);
}

export function isReadyForClosing(filledSet: Set<string>): boolean {
  return CLOSING_CORE_FIELDS.every((label) => filledSet.has(label)) && isEmailSatisfied(filledSet);
}

/**
 * Lee un valor ya confirmado de las líneas CRM ("- Etiqueta: valor").
 * Se usa para no dejar que una extracción inestable del turno actual (GPT
 * malinterpretando un mensaje corto como "Fiesta dinámica" o "Show en vivo")
 * sobrescriba un dato de un campo core que ya estaba guardado correctamente.
 */
export function crmStoredValue(mergedLines: string[], label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^-?\\s*${escaped}:`, "i");
  const line = mergedLines.find((l) => pattern.test(l));
  if (!line) return null;
  const val = line.replace(pattern, "").trim();
  return val || null;
}

function findMentionedService(text: string): string | null {
  for (const [label, pattern] of BODASESOR_SERVICE_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return parsePrimaryService(text);
}

/** Servicio mencionado en texto libre del cliente (para CRM en tiempo real). */
export function parseServiceFromUserText(text: string): string | null {
  return findMentionedService(text);
}

function hasTipoEvento(filledSet: Set<string>, extracted: ExtractedData): boolean {
  return filledSet.has("Tipo de evento") || !!(extracted.tipo_evento?.trim());
}

function getDisplayName(extracted: ExtractedData, whatsappName?: string | null): string | null {
  return resolveClientDisplayName(extracted.nombre, null, whatsappName);
}

function lucyHasPresented(history: OpenAI.Chat.ChatCompletionMessageParam[]): boolean {
  return history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .some((m) => /hola,?\s*soy\s+lucy/i.test(m.content as string));
}

/** True si la conversación ya avanzó más allá del saludo inicial. */
function conversationAlreadyStarted(
  filledSet: Set<string>,
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  if (history.some((m) => m.role === "assistant")) return true;
  if (filledSet.has("Nombre del cliente")) return true;
  if (filledSet.has("Correo electrónico") || filledSet.has(EMAIL_WAIVED_LABEL)) return true;
  return false;
}

function presentationHistoryFrom(ctx: NaturalQuestionContext): OpenAI.Chat.ChatCompletionMessageParam[] {
  return ctx.presentationHistory ?? ctx.history ?? [];
}

function stripRepeatLucyIntro(
  mensaje: string,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  alreadyStarted: boolean
): string {
  if (!alreadyStarted && !lucyHasPresented(history)) return mensaje;
  return mensaje
    .replace(/Hola,?\s*soy\s+Lucy(?:,\s*agente\s+virtual)?\s+de\s+Bodasesor\.?\s*/gi, "")
    .replace(/Estoy aquí para ayudarte con lo que necesites para tu evento\.?\s*/gi, "")
    .replace(/Con gusto te ayudo\.?\s*/gi, "")
    .replace(/^\s+/, "")
    .trim();
}

function variantIndex(
  field: PendingField,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number
): number {
  const variants = QUESTION_VARIANTS[field];
  const assistantTurns = history.filter((m) => m.role === "assistant").length;
  const seed = entityId != null ? String(entityId).length : 0;
  return (assistantTurns + seed) % variants.length;
}

function pickVariant(
  field: PendingField,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number
): string {
  const variants = QUESTION_VARIANTS[field];
  const lastAssistant = history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .slice(-1)[0]?.content as string | undefined;
  const start = variantIndex(field, history, entityId);
  for (let i = 0; i < variants.length; i++) {
    const candidate = variants[(start + i) % variants.length]!;
    if (!lastAssistant || !mensajeAsksForField(lastAssistant, field)) return candidate;
    if (!mensajeAsksForField(candidate, field)) return candidate;
    const snippet = candidate.slice(0, 24);
    if (snippet && !lastAssistant.includes(snippet)) return candidate;
  }
  return variants[start % variants.length]!;
}

/** Respuesta cuando preguntan por teléfonos de Bodasesor. */
export function buildPhoneAnswer(): string {
  return [
    "Claro, te paso los números:",
    "Ventas (solo línea telefónica, sin WhatsApp): 55 4008 0373",
    "Gerencia / corporativo (línea telefónica y WhatsApp): 56 4671 0585",
    "Por aquí por chat también te podemos ayudar con lo que necesites.",
  ].join("\n");
}

function buildPistaTarimaSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  entityId?: string | number
): string {
  const dims =
    parseSpaceDimensions(currentMessage ?? "") ||
    (extracted.requerimientos_evento?.match(/\d+m\s*x\s*\d+m/i)?.[0] ?? null);
  const spaceNote = dims ? ` Veo que el espacio es de unos ${dims.replace(/m/g, " metros")} — con eso podemos recomendar el tamaño ideal.` : "";
  const intro =
    "Manejamos pistas de baile y tarimas en varios tamaños: tarima básica, pista iluminada, y combinaciones con DJ o iluminación.";
  const follow = pickVariant("requerimientos", history, entityId);
  return `${intro}${spaceNote} ${follow}`.trim();
}

function buildEntertainmentSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number,
  currentMessage?: string
): string {
  const tipo = (extracted.tipo_evento ?? "").trim().toLowerCase();
  const eventLabel =
    /corporativo|empresa/.test(tipo) || /empresa|corporativo/i.test(currentMessage ?? "")
      ? "tu evento corporativo"
      : tipo
        ? `tu ${tipo}`
        : "tu evento";

  const intro = `Para ${eventLabel}, manejamos shows en vivo, animación, hora loca, happening, espejos, láser y más opciones de entretenimiento.`;
  const ideas =
    "Lo más pedido para eventos así es un show de grupo versátil o animación tipo hora loca según el estilo que busquen — desde ambiente elegante hasta fiesta más dinámica.";
  const follow = pickVariant("requerimientos", history, entityId);
  return `${intro} ${ideas} ${follow}`.trim();
}

function buildFoodSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number,
  currentMessage?: string
): string {
  const tipo = (extracted.tipo_evento ?? "").trim().toLowerCase();
  const eventLabel =
    tipo === "cumpleaños"
      ? "un cumpleaños"
      : tipo === "boda"
        ? "una boda"
        : tipo === "xv años"
          ? "XV años"
          : tipo
            ? `un ${tipo}`
            : "tu evento";

  const catering = buildCatalogCateringAnswer();
  const intro = `Para ${eventLabel}, lo más pedido es banquete o taquiza según el estilo que busquen — banquete es más formal con servicio de meseros; taquiza es más casual y flexible.`;
  if (catering) {
    return `${intro}\n\n${catering}`;
  }
  return buildRecommendationsReply(extracted, history, entityId, currentMessage);
}

/** Sugerencias por tipo de evento cuando el cliente pide recomendaciones. */
export function buildRecommendationsReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number,
  currentMessage?: string
): string {
  if (clientAsksBanqueteVsTaquiza(currentMessage)) {
    const comparison = buildCatalogComparisonAnswer();
    if (comparison) return comparison;
  }

  const texts = collectUserTexts(history, currentMessage).join(" ").toLowerCase();
  const tipo = (extracted.tipo_evento ?? "").toLowerCase();

  let ideas: string;
  if (/bautizo/.test(tipo) || /\bbautizo\b/.test(texts)) {
    ideas =
      "Para un bautizo suele funcionar muy bien: banquete o brunch, pastel de bautizo, mesa de dulces, mobiliario y sillas, y si es en jardín o terraza carpas o sombrillas. Muchos también agregan DJ suave o iluminación.";
  } else if (/boda/.test(tipo) || /\bboda\b/.test(texts)) {
    ideas =
      "Para boda lo más pedido es banquete o taquiza, barra de bebidas, mobiliario, carpas o pista de baile, DJ e iluminación. También mesa de dulces o quesos.";
  } else if (/xv|quince/.test(tipo) || /\bxv\b|quince/.test(texts)) {
    ideas =
      "Para XV años suele ir banquete o taquiza, mesa de dulces, mobiliario, DJ, iluminación y pista de baile.";
  } else {
    ideas =
      "Lo más común es banquete o taquiza, barra de bebidas, mobiliario, carpas, DJ, iluminación y mesa de dulces según el estilo del evento.";
  }

  const comparison = buildCatalogComparisonAnswer();
  if (comparison && /banquete|taquiza|recomiendas?/i.test(currentMessage ?? "")) {
    return `${ideas}\n\n${comparison}`;
  }

  const follow = pickVariant("requerimientos", history, entityId);
  return appendServiciosCatalogoHint(`${ideas} ${follow}`.trim());
}

function contextualPrefix(
  field: PendingField,
  extracted: ExtractedData,
  currentMessage?: string
): string {
  const msg = currentMessage?.trim() ?? "";
  if (!msg) return "";

  if (field === "requerimientos" && clientMentionsCatering(currentMessage)) {
    return "Perfecto. ";
  }
  if (field === "invitados" && (extracted.tipo_evento || /boda|xv|cumple|corporativo|baby/i.test(msg))) {
    return "Perfecto. ";
  }
  if (field === "zona" && /\d+/.test(msg)) {
    return "Entendido. ";
  }
  if (field === "fecha" && /ciudad|zona|polanco|cdmx|puebla|monterrey|reforma/i.test(msg)) {
    return "Muy bien. ";
  }
  if (field === "presupuesto" && /fecha|junio|julio|agosto|s[aá]bado|domingo|\d{1,2}\s+de/i.test(msg)) {
    return "Genial. ";
  }
  return "";
}

export interface NaturalQuestionContext {
  extracted: ExtractedData;
  filledSet?: Set<string>;
  whatsappName?: string | null;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  /** Historial completo (sin slice) para detectar si Lucy ya se presentó. */
  presentationHistory?: OpenAI.Chat.ChatCompletionMessageParam[];
  currentMessage?: string;
  entityId?: string | number;
  afterEmail?: boolean;
}

export function getNextPendingField(
  extracted: ExtractedData,
  filledSet?: Set<string>
): PendingField | null {
  const filled = filledSet ?? new Set<string>();

  if (!filled.has("Nombre del cliente")) return "nombre";
  if (!isEmailSatisfied(filled)) return "correo";

  const hasReq =
    filled.has("Requerimientos o servicios") || isValidRequerimientosValue(extracted.requerimientos_evento);
  const hasInv = filled.has("Número de invitados") || !!extracted.num_invitados;

  if (!hasTipoEvento(filled, extracted)) return "tipo_evento";
  if (!hasReq) return "requerimientos";
  if (!hasInv) return "invitados";
  if (!filled.has("Lugar/dirección del evento")) return "zona";
  if (!filled.has("Fecha y horario")) return "fecha";
  if (!filled.has("Presupuesto (MXN)")) return "presupuesto";
  return null;
}

function isFirstLucyReply(history: OpenAI.Chat.ChatCompletionMessageParam[]): boolean {
  return !history.some((m) => m.role === "assistant");
}

/** True si Lucy ya preguntó el nombre en algún mensaje anterior. */
export function lucyAskedForNombre(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  return history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .some((m) => mensajeAsksForField(m.content as string, "nombre"));
}

/**
 * Respaldo: usa nombre de WhatsApp solo si Lucy ya preguntó el nombre
 * y el cliente nunca lo escribió. No salta el paso — solo completa el dato.
 */
export function applyWhatsappNombreFallback(
  filledSet: Set<string>,
  mergedLines: string[],
  whatsappDisplayName: string | null | undefined,
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  if (filledSet.has("Nombre del cliente")) return false;
  if (!lucyAskedForNombre(history)) return false;

  const waName = sanitizeDisplayName(whatsappDisplayName);
  if (!waName) return false;

  mergedLines.push(`- Nombre del cliente: ${waName} ${WHATSAPP_NOMBRE_NOTE}`);
  filledSet.add("Nombre del cliente");
  return true;
}

/** Lee el nombre capturado en líneas CRM (incluye fallback de WhatsApp). */
export function parseNombreFromCrmLines(mergedLines: string[]): string | null {
  const line = mergedLines.find((l) => /^-?\s*Nombre del cliente:/i.test(l));
  if (!line) return null;
  const raw = line
    .replace(/^-?\s*Nombre del cliente:\s*/i, "")
    .replace(WHATSAPP_NOMBRE_NOTE, "")
    .trim();
  return sanitizeDisplayName(raw);
}

/** Reconocimiento breve del primer mensaje del cliente (sin pedir otros datos). */
export function buildOpeningAcknowledgment(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string {
  const texts = collectUserTexts(history, currentMessage);
  const userText = texts[texts.length - 1] ?? texts.join(" ");
  const t = userText.toLowerCase();

  if (/taquiza|tacos/.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    const zona = userText.match(/\ben\s+([A-Za-zÁÉÍÓÚáéíóúñ][\w\s.-]{2,24})/i);
    const fecha = userText.match(
      /(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))/i
    );
    let ack = "Te ayudo con la taquiza";
    if (inv) ack += ` para ${inv[1]} personas`;
    if (zona) ack += ` en ${zona[1].trim()}`;
    if (fecha) ack += ` el ${fecha[1]}`;
    return `${ack}.`;
  }

  if (/\bboda\b/.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    const fecha = userText.match(
      /(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))/i
    );
    let ack = "Te ayudo con la cotización para tu boda";
    if (fecha) ack += ` del ${fecha[1]}`;
    if (inv) ack += ` para ${inv[1]} personas`;
    return `${ack}.`;
  }

  if (/baby\s*shower/.test(t)) return "Claro que te ayudamos con tu baby shower.";
  if (/\bbautizo\b/.test(t)) return "Con gusto te ayudo con la cotización para tu bautizo.";
  if (/banquete/.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    return inv
      ? `Te ayudo con el banquete para ${inv[1]} personas.`
      : "Con gusto te ayudo con información de banquetes.";
  }
  if (/kosher/.test(t)) return "Sí tenemos opciones kosher.";
  if (/\bpista(\s+de\s+baile)?\b|\btarima/i.test(t)) {
    return "Claro, te ayudo con pista de baile o tarima para tu evento.";
  }
  if (/cotiz|evento/.test(t)) return "Claro que te ayudo con tu evento.";
  if (/^hola[.!?\s]*$/i.test(userText.trim())) {
    return "Estoy aquí para ayudarte con lo que necesites para tu evento.";
  }
  if (userText.trim().length > 0) return "Con gusto te ayudo.";

  return "Estoy aquí para ayudarte con lo que necesites para tu evento.";
}

/** Primer mensaje: presentación Lucy + reconocimiento breve + pedir nombre. */
export function buildFirstInteractionMessage(
  ctx: NaturalQuestionContext,
  withIntro = true
): string {
  const history = ctx.history ?? [];
  const filledSet = ctx.filledSet ?? new Set<string>();
  const ack = buildOpeningAcknowledgment(history, ctx.currentMessage);
  const intro = withIntro ? `${LUCY_INTRO} ` : "";

  if (isFieldSatisfied("nombre", filledSet, ctx.extracted)) {
    const nombre = getDisplayName(ctx.extracted, ctx.whatsappName);
    const pending = getNextPendingField(ctx.extracted, filledSet);
    if (pending === "correo") {
      const correoQ = buildCorreoQuestion(nombre, history, ctx.entityId);
      return withIntro ? `${intro}${ack} ${correoQ}`.trim() : correoQ;
    }
    if (pending) {
      const greet = nombre ? `Mucho gusto, ${nombre}. ` : "";
      const q = buildNaturalQuestion(pending, ctx);
      return withIntro ? `${intro}${ack} ${greet}${q}`.trim() : `${greet}${q}`.trim();
    }
    return nombre
      ? `${intro}${ack} Mucho gusto, ${nombre}.`.trim()
      : `${intro}${ack}`.trim();
  }

  const nameQ = pickVariant("nombre", history, ctx.entityId);
  return `${intro}${ack} ${nameQ}`.trim();
}

function usesLegacyLucyIntro(mensaje: string): boolean {
  return /te\s+saluda\s+lucy/i.test(mensaje);
}

/** Respuestas guardadas en CRM/caché con el saludo V5 no cuentan como interacción previa. */
export function isLegacyStoredLucyResponse(text: string | null | undefined): boolean {
  return typeof text === "string" && text.trim().length > 0 && usesLegacyLucyIntro(text);
}

/** Mientras falte el nombre, solo se permite pedir el nombre (nunca correo, fecha, etc.). */
export function enforceNombreFirst(
  _mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData,
  ctx: NaturalQuestionContext,
  forceFirstPresentation = false
): string {
  const presHistory = presentationHistoryFrom(ctx);
  const alreadyStarted = conversationAlreadyStarted(filledSet, presHistory);
  const isTrueFirstTurn =
    (forceFirstPresentation || isFirstLucyReply(presHistory)) && !alreadyStarted;

  if (!isFieldSatisfied("nombre", filledSet, extracted)) {
    if (isAffirmativeOnlyMessage(ctx.currentMessage)) {
      return "Perfecto. ¿Me regalas tu nombre?";
    }
    if (isTrueFirstTurn || usesLegacyLucyIntro(_mensaje)) {
      return buildFirstInteractionMessage(ctx, true);
    }
    return buildNaturalQuestion("nombre", ctx);
  }

  return stripRepeatLucyIntro(_mensaje, presHistory, alreadyStarted);
}

export function mensajeAsksForField(mensaje: string, field: PendingField): boolean {
  if (!mensaje.includes("?")) return false;
  return FIELD_ASK_PATTERNS[field].test(mensaje);
}

export function isFieldSatisfied(
  field: PendingField,
  filledSet: Set<string>,
  extracted: ExtractedData
): boolean {
  switch (field) {
    case "nombre":
      return filledSet.has("Nombre del cliente");
    case "correo":
      return isEmailSatisfied(filledSet);
    case "tipo_evento":
      return hasTipoEvento(filledSet, extracted);
    case "requerimientos":
      return (
        filledSet.has("Requerimientos o servicios") ||
        isValidRequerimientosValue(extracted.requerimientos_evento)
      );
    case "invitados":
      return filledSet.has("Número de invitados") || !!extracted.num_invitados;
    case "zona":
      return filledSet.has("Lugar/dirección del evento");
    case "fecha":
      return filledSet.has("Fecha y horario");
    case "presupuesto":
      return filledSet.has("Presupuesto (MXN)");
  }
}

const FIELD_ORDER: PendingField[] = [
  "nombre",
  "correo",
  "tipo_evento",
  "requerimientos",
  "invitados",
  "zona",
  "fecha",
  "presupuesto",
];

/** True si el mensaje pregunta por un dato que ya está capturado. */
export function mensajeAsksForFilledField(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData
): boolean {
  if (!mensaje.includes("?")) return false;
  for (const field of FIELD_ORDER) {
    if (isFieldSatisfied(field, filledSet, extracted) && mensajeAsksForField(mensaje, field)) {
      return true;
    }
  }
  return false;
}

function lastAssistantAskedField(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  field: PendingField
): boolean {
  const lastAssistant = history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .slice(-1)[0]?.content as string | undefined;
  return !!lastAssistant && mensajeAsksForField(lastAssistant, field);
}

/** Prefiere la respuesta de GPT si cubre el dato pendiente o respondió una duda del cliente. */
function shouldPreferAiResponse(
  aiResponse: string,
  filledSet: Set<string>,
  extracted: ExtractedData,
  currentMessage?: string
): boolean {
  const trimmed = aiResponse.trim();
  if (!trimmed) return false;
  if (responseLooksLikePrematureClose(trimmed)) return false;
  if (responseHasInventedPrice(trimmed, currentMessage)) return false;
  if (mensajeAsksForFilledField(trimmed, filledSet, extracted)) return false;
  if (mensajeAsksWrongField(trimmed, filledSet, extracted)) return false;

  const pending = getNextPendingField(extracted, filledSet);
  if (!pending) return true;

  if (mensajeLooksOnTrack(trimmed, filledSet, extracted)) return true;

  // Cliente hizo una pregunta o dio contexto útil — priorizar GPT sobre plantilla rígida
  if (currentMessage && currentMessage.trim().length > 12 && trimmed.length > 25) {
    if (clientAskedFreeformQuestion(currentMessage)) return true;
    if (clientMentionsCatering(currentMessage) && !mensajeAsksForField(trimmed, pending)) return true;
    if (justAnsweredReqContext(currentMessage, trimmed)) return true;
  }

  return false;
}

function justAnsweredReqContext(currentMessage: string, aiResponse: string): boolean {
  if (!clientMentionsCatering(currentMessage) && !isServiceRelatedMessage(currentMessage)) return false;
  return aiResponse.length > 40 && !/^\s*¿/.test(aiResponse);
}

/** Si hay texto útil sin pregunta, añade la pregunta pendiente en lugar de reemplazar todo. */
function mergeWithPendingQuestion(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData,
  ctx: NaturalQuestionContext
): string {
  const pending = getNextPendingField(extracted, filledSet);
  if (!pending) return mensaje;

  const base = mensaje.trim();
  if (!base) return buildNaturalQuestion(pending, ctx);

  // GPT ya respondió bien a una pregunta del cliente — no machacar con plantilla
  if (clientAskedFreeformQuestion(ctx.currentMessage) && base.length > 50) {
    if (base.includes("?") && !mensajeAsksWrongField(mensaje, filledSet, extracted)) return base;
    if (!mensajeAsksForField(base, pending)) return base;
  }

  const nextQ = buildNaturalQuestion(pending, ctx);
  if (
    base.includes("?") &&
    !mensajeAsksWrongField(mensaje, filledSet, extracted) &&
    !mensajeAsksForFilledField(mensaje, filledSet, extracted)
  ) {
    return mensaje;
  }
  return `${base}\n\n${nextQ}`;
}

/** Evita re-preguntar lo ya capturado; si hace falta, pide solo el siguiente dato pendiente. */
export function sanitizeOutboundMessage(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData,
  ctx: NaturalQuestionContext,
  log?: { warn: (obj: unknown, msg?: string) => void }
): string {
  const pending = getNextPendingField(extracted, filledSet);

  // Respuesta de venta (comida/servicios/show/pista) — no reemplazar por plantilla
  if (
    ctx.currentMessage &&
    (clientMentionsCatering(ctx.currentMessage) ||
      clientMentionsEntertainment(ctx.currentMessage) ||
      clientMentionsPistaTarima(ctx.currentMessage) ||
      isServiceRelatedMessage(ctx.currentMessage)) &&
    /banquete|taquiza|catering|alimentos|show|animaci|hora\s+loca|entretenimiento|vers[aá]til|pista|tarima|iluminada/i.test(
      mensaje
    )
  ) {
    return mensaje.trim();
  }

  const repeatsFilled = mensajeAsksForFilledField(mensaje, filledSet, extracted);
  const asksWrong = mensajeAsksWrongField(mensaje, filledSet, extracted);

  if ((repeatsFilled || asksWrong) && pending && !isInformativeClientAnswer(ctx.currentMessage)) {
    log?.warn({ pending, repeatsFilled, asksWrong }, "GUARD: bloqueando repetición — dato ya capturado");
    return mergeWithPendingQuestion("", filledSet, extracted, ctx);
  }

  if (pending === "requerimientos" && mensaje.includes("?") && !mensajeMencionaCatalogoServicios(mensaje)) {
    mensaje = appendServiciosCatalogoHint(mensaje);
  }

  if (
    pending &&
    !mensaje.includes("?") &&
    !clientAskedFreeformQuestion(ctx.currentMessage) &&
    !isInformativeClientAnswer(ctx.currentMessage)
  ) {
    return mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx);
  }

  return mensaje;
}

export function buildNaturalQuestion(field: PendingField, ctx: NaturalQuestionContext): string {
  const history = ctx.history ?? [];
  const nombre = getDisplayName(ctx.extracted, ctx.whatsappName);
  const prefix = contextualPrefix(field, ctx.extracted, ctx.currentMessage);
  const variant = pickVariant(field, history, ctx.entityId);

  if (field === "correo") {
    const correoCore = pickVariant("correo", history, ctx.entityId);
    return nombre ? `Mucho gusto, ${nombre}. ${correoCore}` : correoCore;
  }

  if (field === "requerimientos") {
    return buildRequerimientosQuestion(ctx.extracted, history, ctx.currentMessage, ctx.entityId);
  }

  if (field === "tipo_evento") {
    const tipoVariant = pickVariant("tipo_evento", history, ctx.entityId);
    const withHint = `${tipoVariant} ${TIPO_EVENTO_HINT}`.trim();
    if (ctx.afterEmail) {
      return nombre ? `Muchas gracias. ${withHint}` : `Muchas gracias. ${withHint}`;
    }
    return prefix ? `${prefix}${withHint}` : withHint;
  }

  return prefix ? `${prefix}${variant}` : variant;
}

export function buildRequerimientosQuestion(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  entityId?: string | number
): string {
  const userText = collectUserTexts(history, currentMessage).join(" ");
  const fromExtracted =
    isValidRequerimientosValue(extracted.requerimientos_evento)
      ? extracted.requerimientos_evento!.trim()
      : null;
  const service = fromExtracted ?? findMentionedService(userText);
  const prefix = contextualPrefix("requerimientos", extracted, currentMessage);

  if (service) {
    const idx = variantIndex("requerimientos", history, entityId);
    const followUps = [
      `Además del ${service}, ¿te gustaría cotizar algún otro servicio?`,
      `¿Solo el ${service} o también algo más?`,
      `Perfecto. Con el ${service}, ¿necesitan algún otro servicio?`,
    ];
    return appendServiciosCatalogoHint(
      `${prefix}${followUps[idx % followUps.length]}`,
      true
    );
  }

  const variant = pickVariant("requerimientos", history, entityId);
  const core = prefix ? `${prefix}${variant}` : variant;
  return appendServiciosCatalogoHint(core);
}

export function requerimientosNeedsFollowUp(
  extracted: ExtractedData,
  filledSet: Set<string>
): boolean {
  if (filledSet.has("Requerimientos o servicios")) return false;
  const req = extracted.requerimientos_evento?.trim() ?? "";
  if (!req) return true;
  return !isValidRequerimientosValue(req);
}

export function buildCorreoQuestion(
  nombre: string | null,
  history: OpenAI.Chat.ChatCompletionMessageParam[] = [],
  entityId?: string | number
): string {
  const advisor = advisorLabelForClient(nombre);
  let correoCore = pickVariant("correo", history, entityId);
  if (advisor === "nuestro equipo") {
    correoCore = correoCore
      .replace(/\bpara que Alejandro te arme\b/gi, "para que nuestro equipo te arme")
      .replace(/\bAlejandro\b/gi, "nuestro equipo");
  }
  if (nombre) return `Mucho gusto, ${nombre}. ${correoCore}`;
  return correoCore;
}

export function buildRequerimientosFollowUp(
  extracted: ExtractedData,
  filledSet?: Set<string>,
  history?: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  entityId?: string | number
): string {
  const ctx: NaturalQuestionContext = {
    extracted,
    filledSet,
    history: history ?? [],
    currentMessage,
    entityId,
  };

  if (filledSet && !hasTipoEvento(filledSet, extracted)) {
    return buildNaturalQuestion("tipo_evento", ctx);
  }
  if (filledSet && requerimientosNeedsFollowUp(extracted, filledSet)) {
    return buildRequerimientosQuestion(extracted, history ?? [], currentMessage, entityId);
  }

  const pending = getNextPendingField(extracted, filledSet);
  if (pending) return buildNaturalQuestion(pending, ctx);
  return buildRequerimientosQuestion(extracted, history ?? [], currentMessage, entityId);
}

export function nextFieldQuestion(
  extracted: ExtractedData,
  filledSet?: Set<string>,
  whatsappName?: string | null,
  history?: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  entityId?: string | number
): string | null {
  const pending = getNextPendingField(extracted, filledSet);
  if (!pending) return null;

  return buildNaturalQuestion(pending, {
    extracted,
    filledSet,
    whatsappName,
    history: history ?? [],
    currentMessage,
    entityId,
  });
}

export function shouldReplaceForcedEmailQuestion(
  mensaje: string,
  filledSet: Set<string>
): boolean {
  if (!filledSet.has(EMAIL_WAIVED_LABEL)) return false;
  if (!/correo|e-?mail/i.test(mensaje) || !mensaje.includes("?")) return false;
  return /obligatorio|necesito|necesario|forzoso|indispensable|debes|tienes que|es importante/i.test(mensaje);
}

export function emailRefusalAckMessage(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  entityId?: string | number,
  filledSet?: Set<string>
): string {
  const ctx: NaturalQuestionContext = {
    extracted,
    filledSet,
    history,
    currentMessage,
    entityId,
  };
  const pending = getNextPendingField(extracted, filledSet);
  if (pending && pending !== "correo") {
    return `Sin problema, seguimos por aquí. ${buildNaturalQuestion(pending, ctx)}`;
  }
  const tipoQ = buildNaturalQuestion("tipo_evento", ctx);
  return `Sin problema, seguimos por aquí. ${tipoQ}`;
}

export function clientJustGaveEmail(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): boolean {
  if (!currentMessage?.trim() || !/\S+@\S+\.\S+/.test(currentMessage)) return false;
  const lastAssistant = history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .slice(-1)[0]?.content as string | undefined;
  if (!lastAssistant) return false;
  return /correo|e-?mail|envío|envio/i.test(lastAssistant);
}

export function clientJustAnsweredRequerimientosQuestion(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): boolean {
  if (!currentMessage?.trim()) return false;
  const lastAssistant = history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .slice(-1)[0]?.content as string | undefined;
  if (!lastAssistant) return false;
  if (inferLucyAskedField(lastAssistant) === "requerimientos") return true;
  return /platícame|qué tienes pensado|otro servicio|te gustaría cotizar|festejan|tipo de evento|servicios te gustaría|qué necesitas/i.test(
    lastAssistant
  );
}

export function clientSaysThanks(message?: string): boolean {
  if (!message?.trim()) return false;
  return /\b(muchas\s+gracias|gracias|thank\s+you|mil\s+gracias|te\s+agradezco)\b/i.test(message);
}

export function buildPostCierreThanksReply(clientName?: string | null): string {
  const nombre = clientName?.trim();
  return nombre
    ? `¡Con gusto, ${nombre}! Nuestro equipo ya tiene tus datos para la cotización. Si necesitas algo más, aquí estamos.`
    : "¡Con gusto! Nuestro equipo ya tiene tus datos para la cotización. Si necesitas algo más, aquí estamos.";
}

function isInformativeClientAnswer(currentMessage?: string): boolean {
  if (!currentMessage?.trim()) return false;
  return (
    clientAsksForRecommendations(currentMessage) ||
    clientAsksBanqueteVsTaquiza(currentMessage) ||
    clientMentionsCatering(currentMessage) ||
    clientMentionsEntertainment(currentMessage) ||
    clientMentionsPistaTarima(currentMessage) ||
    isServiceRelatedMessage(currentMessage) ||
    clientAsksPhone(currentMessage) ||
    clientAsksPrice(currentMessage) ||
    clientAsksInclusion(currentMessage) ||
    clientAskedFreeformQuestion(currentMessage)
  );
}

function clientAskedFreeformQuestion(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  if (/\?/.test(message)) return true;
  return (
    /cu[aá]nto|precio|costo|cat[aá]logo|men[uú]|tienen|incluye|kosher|horario|tel[eé]fono|correo\s+de\s+bodasesor|hola@/i.test(
      message
    ) ||
    /qu[eé]\s+ofrecen|qu[eé]\s+tienen|qu[eé]\s+manejan|qu[eé]\s+servicios|cu[aá]les\s+son|informaci[oó]n|recomiendas?|sugieres|ayudas?\s+con|pueden\s+hacer/i.test(
      t
    )
  );
}

function responseLooksLikePrematureClose(mensaje: string): boolean {
  return (
    mensaje.includes(CLOSING_SIGNATURE) ||
    /cotizaci[oó]n personalizada/i.test(mensaje) ||
    /cdn\.shopify\.com/i.test(mensaje) ||
    /cat[aá]logo completo/i.test(mensaje) ||
    /ya tengo todos los datos/i.test(mensaje)
  );
}

function mensajeLooksOnTrack(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData
): boolean {
  const pending = getNextPendingField(extracted, filledSet);
  if (!pending) return true;
  return mensajeAsksForField(mensaje, pending);
}

function mensajeAsksWrongField(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData
): boolean {
  if (!mensaje.includes("?")) return false;

  const pending = getNextPendingField(extracted, filledSet);
  if (!pending) return false;

  const fieldOrder: PendingField[] = FIELD_ORDER;
  const pendingIdx = fieldOrder.indexOf(pending);

  for (let i = pendingIdx + 1; i < fieldOrder.length; i++) {
    const field = fieldOrder[i]!;
    if (mensajeAsksForField(mensaje, field)) return true;
  }
  return false;
}

export interface LucyMessageGuardsInput {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  readyForClosing: boolean;
  cierreYaEnviado: boolean;
  emailRefusedThisTurn: boolean;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  /** Historial completo (sin slice) para no perder la presentación inicial. */
  presentationHistory?: OpenAI.Chat.ChatCompletionMessageParam[];
  currentMessage?: string;
  whatsappDisplayName?: string | null;
  buildClosing: (servicios: string | null | undefined, clientName?: string | null) => string;
  log?: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
  entityId?: string | number;
  /** True cuando Lucy nunca ha respondido a este lead (sin historial ni CRM previo). */
  forceFirstPresentation?: boolean;
}

function makeQuestionCtx(input: LucyMessageGuardsInput): NaturalQuestionContext {
  return {
    extracted: input.extracted,
    filledSet: input.filledSet,
    whatsappName: input.whatsappDisplayName,
    history: input.history,
    presentationHistory: input.presentationHistory ?? input.history,
    currentMessage: input.currentMessage,
    entityId: input.entityId,
  };
}

export function applyLucyMessageGuards(input: LucyMessageGuardsInput): string {
  const {
    aiResponse,
    extracted,
    filledSet,
    readyForClosing,
    cierreYaEnviado,
    emailRefusedThisTurn,
    history,
    currentMessage,
    whatsappDisplayName,
    buildClosing,
    log,
    entityId,
    forceFirstPresentation,
  } = input;

  const ctx = makeQuestionCtx(input);
  const presHistory = input.presentationHistory ?? history;

  applyPresupuestoWaiver(
    filledSet,
    [],
    collectUserTexts(presHistory),
    presHistory
  );

  const pendingBeforeClose = getNextPendingField(extracted, filledSet);
  const trulyReadyForClosing = readyForClosing && !pendingBeforeClose;
  const justGaveEmail = clientJustGaveEmail(history, currentMessage);
  const justAnsweredReq = clientJustAnsweredRequerimientosQuestion(history, currentMessage);
  const emailOk = isEmailSatisfied(filledSet);
  const needsNextStep = emailOk && !trulyReadyForClosing && !cierreYaEnviado;

  // Cuando ya se puede cerrar y los requerimientos ya son válidos, no re-abrir
  // la venta (show/comida/pista) por una simple palabra clave repetida — solo
  // si el cliente hace una pregunta real (con "?") dejamos pasar la respuesta de venta.
  const readyToCloseAndReqDone =
    trulyReadyForClosing && !cierreYaEnviado && !requerimientosNeedsFollowUp(extracted, filledSet);
  const allowSalesReplyOverride =
    !readyToCloseAndReqDone || (currentMessage?.includes("?") ?? false);
  // El follow-up "¿algún otro servicio?" solo se pregunta una vez — si ya aparece
  // en el historial, no se vuelve a preguntar (evita el bucle infinito).
  const requerimientosFollowUpAlreadyAsked = presHistory.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      /alg[uú]n\s+otro\s+servicio|otro\s+servicio\b/i.test(m.content as string)
  );

  let mensaje: string;
  let appliedSalesReply = false;

  if (cierreYaEnviado && clientAddsToQuote(currentMessage)) {
    const nombre = extracted.nombre?.trim();
    mensaje = nombre
      ? `Perfecto, ${nombre}. Lo anoto para que nuestro equipo lo incluya en tu cotización. ¿Hay algo más que quieras agregar?`
      : "Perfecto. Lo anoto para que nuestro equipo lo incluya en tu cotización. ¿Hay algo más que quieras agregar?";
    log?.info({ entityId }, "GUARD: post-cierre — servicios adicionales");
  } else if (cierreYaEnviado && clientSaysThanks(currentMessage)) {
    mensaje = buildPostCierreThanksReply(extracted.nombre);
    log?.info({ entityId }, "GUARD: post-cierre — agradecimiento del cliente");
  } else if (cierreYaEnviado && /DATOS DEL CLIENTE:|Información completa obtenida/i.test(aiResponse)) {
    mensaje =
      "Gracias. Nuestro equipo ya tiene tu información para la cotización. ¿Hay algo más que quieras agregar o alguna duda?";
    log?.warn({ entityId }, "GUARD: bloqueó nota interna post-cierre");
  } else if (clientAsksAboutTeam(currentMessage, extracted.nombre)) {
    const advisor = advisorLabelForClient(extracted.nombre);
    mensaje =
      advisor === "nuestro equipo"
        ? "Sí, nuestro equipo de Bodasesor arma las cotizaciones personalizadas. Yo te ayudo a recopilar la información y ellos te envían la propuesta."
        : `${advisor} es parte del equipo de Bodasesor; arma las cotizaciones personalizadas con base en lo que platicamos. Yo te ayudo a recopilar los datos y te envían la propuesta.`;
    log?.info({ entityId }, "GUARD: cliente preguntó por el asesor/equipo");
  } else if (justGaveEmail && !hasTipoEvento(filledSet, extracted)) {
    if (shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage)) {
      mensaje = mergeWithPendingQuestion(aiResponse, filledSet, extracted, { ...ctx, afterEmail: true });
    } else {
      mensaje = buildNaturalQuestion("tipo_evento", { ...ctx, afterEmail: true });
    }
    log?.info({ entityId }, "GUARD: correo capturado — tipo de evento con opciones");
  } else if (justGaveEmail && hasTipoEvento(filledSet, extracted)) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
    mensaje = nextQ ?? aiResponse;
    if (nextQ) log?.info({ entityId }, "GUARD: correo capturado — tipo ya tenido, siguiente dato");
  } else if (emailRefusedThisTurn && !extracted.correo?.trim()) {
    mensaje = emailRefusalAckMessage(extracted, history, currentMessage, entityId, filledSet);
    log?.info({ entityId }, "GUARD: cliente no quiere dar correo — se continúa el flujo");
  } else if (clientAsksPhone(currentMessage)) {
    const phoneAnswer = buildPhoneAnswer();
    const pending = getNextPendingField(extracted, filledSet);
    mensaje =
      needsNextStep && pending && pending !== "correo"
        ? `${phoneAnswer}\n\n${buildNaturalQuestion(pending, ctx)}`
        : phoneAnswer;
    log?.info({ entityId }, "GUARD: cliente preguntó teléfonos");
  } else if (readyToCloseAndReqDone && clientDeclinesMoreServices(currentMessage)) {
    mensaje = buildClosing(
      extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
      extracted.nombre
    );
    log?.info({ entityId }, "GUARD: cliente no quiere más servicios — cierre");
  } else if (
    allowSalesReplyOverride &&
    (clientMentionsEntertainment(currentMessage) ||
      (justAnsweredReq && clientMentionsEntertainment(currentMessage)))
  ) {
    mensaje = buildEntertainmentSalesReply(extracted, history, entityId, currentMessage);
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: show/entretenimiento — orientación de venta");
  } else if (allowSalesReplyOverride && clientMentionsPistaTarima(currentMessage)) {
    mensaje = buildPistaTarimaSalesReply(extracted, history, currentMessage, entityId);
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: pista/tarima — orientación de venta");
  } else if (
    allowSalesReplyOverride &&
    (clientMentionsCatering(currentMessage) ||
      (justAnsweredReq && isServiceRelatedMessage(currentMessage)))
  ) {
    const cateringAnswer = buildFoodSalesReply(extracted, history, entityId, currentMessage);
    mensaje = cateringAnswer ?? buildRecommendationsReply(extracted, history, entityId, currentMessage);
    appliedSalesReply = true;
    log?.info(
      { entityId, justAnsweredReq, food: clientMentionsCatering(currentMessage) },
      "GUARD: comida/servicio — orientación de venta"
    );
  } else if (allowSalesReplyOverride && clientAsksForRecommendations(currentMessage)) {
    mensaje = buildRecommendationsReply(extracted, history, entityId, currentMessage);
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: cliente pidió recomendaciones — sugerencias + servicios");
  } else if (clientAsksPrice(currentMessage)) {
    const ctxText = collectUserTexts(input.presentationHistory ?? history, currentMessage).join(" ");
    const pending = getNextPendingField(extracted, filledSet);
    const needsAlejandroQuote =
      mentionsNoListedPriceService(currentMessage) ||
      (responseHasInventedPrice(aiResponse, currentMessage, ctxText) &&
        !mentionsListedPriceService(currentMessage));

    if (needsAlejandroQuote) {
      const priceReply = buildAlejandroPriceReply(getPriceServiceLabel(currentMessage));
      mensaje =
        needsNextStep && pending && pending !== "correo"
          ? `${priceReply}\n\n${buildNaturalQuestion(pending, ctx)}`
          : priceReply;
      log?.info({ entityId, pending }, "GUARD: precio sin catálogo — Alejandro cotiza");
    } else {
      const safe = sanitizeInventedPrices(aiResponse, currentMessage, ctxText);
      let priceContent = safe;
      const fromCatalog = buildCatalogPriceAnswer(currentMessage);
      if (fromCatalog && mentionsListedPriceService(currentMessage)) {
        priceContent = fromCatalog;
      } else if (!messageClaimsPrice(safe) && fromCatalog) {
        priceContent = fromCatalog;
      }
      mensaje = needsNextStep
        ? mergeWithPendingQuestion(priceContent, filledSet, extracted, ctx)
        : priceContent.trim() || aiResponse;
      log?.info({ entityId, fromCatalog: priceContent !== safe }, "GUARD: respuesta a precio con catálogo");
    }
  } else if (needsNextStep && shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage)) {
    mensaje = aiResponse;
    log?.info({ entityId }, "GUARD: respuesta GPT natural aceptada");
  } else if (needsNextStep && aiResponse.trim() && !mensajeAsksForFilledField(aiResponse, filledSet, extracted)) {
    mensaje = mergeWithPendingQuestion(aiResponse, filledSet, extracted, ctx);
    log?.info({ entityId }, "GUARD: GPT + pregunta pendiente fusionados");
  } else if (needsNextStep && aiResponse.trim() && mensajeAsksForFilledField(aiResponse, filledSet, extracted)) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
    mensaje = nextQ ?? aiResponse;
    log?.info({ entityId }, "GUARD: GPT repitió dato ya capturado — siguiente paso");
  } else if (needsNextStep) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
    if (clientAsksPrice(currentMessage)) {
      const fromCatalog = buildCatalogPriceAnswer(currentMessage);
      if (fromCatalog && nextQ) {
        mensaje = `${fromCatalog}\n\n${nextQ}`;
      } else if (fromCatalog) {
        mensaje = fromCatalog;
      } else {
        mensaje = nextQ ?? aiResponse;
      }
    } else {
      mensaje = nextQ ?? aiResponse;
    }
    if (nextQ) log?.info({ entityId }, "GUARD: forzando siguiente paso del embudo (semántico)");
  } else if (
    trulyReadyForClosing &&
    !cierreYaEnviado &&
    (requerimientosNeedsFollowUp(extracted, filledSet) ||
      (justAnsweredReq && !requerimientosFollowUpAlreadyAsked))
  ) {
    mensaje = buildRequerimientosFollowUp(extracted, filledSet, history, currentMessage, entityId);
    log?.info({ entityId }, "GUARD: profundizar antes del cierre");
  } else if (trulyReadyForClosing && !cierreYaEnviado) {
    mensaje = buildClosing(
      extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
      extracted.nombre
    );
    log?.info({ entityId }, "Datos completos — mensaje de cierre desde plantilla");
  } else {
    mensaje = aiResponse;
    if (aiResponse.includes("DATOS DEL CLIENTE:") || aiResponse.includes("Información completa obtenida")) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
      log?.warn({ entityId }, "GPT generó nota interna — usando cierre desde plantilla");
    }
  }

  if (filledSet.has("Presupuesto (MXN)") && mensajeAsksForField(mensaje, "presupuesto")) {
    mensaje = blockExcessivePresupuestoAsk(
      mensaje,
      filledSet,
      extracted,
      presHistory,
      currentMessage,
      buildClosing,
      cierreYaEnviado,
      whatsappDisplayName,
      entityId,
      log
    );
  }

  const presFromCurrentMsg = currentMessage
    ? parsePresupuestoFromText(currentMessage, {
        askedField:
          inferLucyAskedField(
            presHistory
              .filter((m) => m.role === "assistant")
              .slice(-1)[0]?.content as string | undefined
          ) === "presupuesto"
            ? "presupuesto"
            : null,
      })
    : null;
  if (
    presFromCurrentMsg &&
    !filledSet.has("Presupuesto (MXN)") &&
    (mensajeAsksForField(mensaje, "presupuesto") ||
      (/presupuesto|rango/i.test(mensaje) && mensaje.includes("?")))
  ) {
    applyPresupuestoWaiver(filledSet, [], collectUserTexts(presHistory, currentMessage), presHistory);
    if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
      log?.info({ entityId }, "GUARD: presupuesto capturado en turno — cierre");
    } else if (/econ[oó]mic/i.test(presFromCurrentMsg)) {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, presHistory, currentMessage, entityId);
      mensaje = nextQ
        ? `Entendido, buscamos opciones económicas. ${nextQ}`
        : "Entendido, buscamos opciones económicas. Nuestro equipo te propone alternativas según lo que platicamos.";
      log?.info({ entityId }, "GUARD: presupuesto económico — no repetir pregunta");
    } else {
      mensaje =
        "Entendido, sin problema. Nuestro equipo te propone opciones según lo que platicamos y te arma la cotización.";
      log?.info({ entityId }, "GUARD: cliente sin presupuesto fijo — continuar");
    }
  } else if (
    !filledSet.has("Presupuesto (MXN)") &&
    countLucyFieldAsks(presHistory, "presupuesto") >= PRESUPUESTO_MAX_ASKS &&
    mensajeAsksForField(mensaje, "presupuesto")
  ) {
    applyPresupuestoWaiver(filledSet, [], collectUserTexts(presHistory, currentMessage), presHistory);
    mensaje = blockExcessivePresupuestoAsk(
      mensaje,
      filledSet,
      extracted,
      presHistory,
      currentMessage,
      buildClosing,
      cierreYaEnviado,
      whatsappDisplayName,
      entityId,
      log
    );
    log?.info({ entityId }, "GUARD: tope de preguntas presupuesto — auto-waiver");
  }

  if (filledSet.has("Fecha y horario") && mensajeAsksForField(mensaje, "fecha")) {
    if (trulyReadyForClosing && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
      log?.info({ entityId }, "GUARD: fecha capturada — cierre");
    } else {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
      if (nextQ && !mensajeAsksForField(nextQ, "fecha")) {
        mensaje = nextQ;
        log?.info({ entityId }, "GUARD: fecha ya capturada — no repetir pregunta");
      } else if (!nextQ && isReadyForClosing(filledSet) && !cierreYaEnviado) {
        mensaje = buildClosing(
          extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
          extracted.nombre
        );
        log?.info({ entityId }, "GUARD: todos los datos listos — cierre tras fecha");
      }
    }
  }

  const fechaFromMsg = currentMessage ? parseFechaFromText(currentMessage) : null;
  if (
    fechaFromMsg &&
    mensajeAsksForField(mensaje, "fecha") &&
    !filledSet.has("Fecha y horario")
  ) {
    filledSet.add("Fecha y horario");
    if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
      log?.info({ entityId }, "GUARD: fecha capturada en turno — cierre");
    } else {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
      mensaje = nextQ ?? "Entendido, sin problema con la fecha.";
      log?.info({ entityId }, "GUARD: fecha pendiente — continuar flujo");
    }
  }

  if (filledSet.has("Tipo de evento") && mensajeAsksForField(mensaje, "tipo_evento") && !trulyReadyForClosing) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && pending !== "tipo_evento") {
      const nextQ = buildNaturalQuestion(pending, ctx);
      mensaje = nextQ;
      log?.info({ entityId, pending }, "GUARD: tipo de evento ya capturado — siguiente dato");
    }
  }

  if (shouldReplaceForcedEmailQuestion(mensaje, filledSet)) {
    const nextQ =
      nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId) ??
      emailRefusalAckMessage(extracted, history, currentMessage, entityId, filledSet);
    log?.warn({ entityId }, "GUARD: correo forzado tras rechazo — reemplazando respuesta");
    mensaje = nextQ;
  }

  const correoYaTenido = !!(extracted.correo?.trim()) || filledSet.has("Correo electrónico");
  if (correoYaTenido && /correo/i.test(mensaje) && mensaje.includes("?") && !trulyReadyForClosing) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && pending !== "correo" && !mensajeAsksForField(mensaje, pending)) {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
      if (nextQ) {
        log?.warn({ entityId }, "GUARD: GPT preguntó correo ya capturado");
        mensaje = nextQ;
      }
    }
  }

  if (filledSet.has(EMAIL_WAIVED_LABEL) && /correo/i.test(mensaje) && mensaje.includes("?") && !trulyReadyForClosing) {
    const nextQ =
      nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId) ??
      emailRefusalAckMessage(extracted, history, currentMessage, entityId, filledSet);
    log?.warn({ entityId }, "GUARD: GPT insistió en correo tras rechazo");
    mensaje = nextQ;
  }

  if (!trulyReadyForClosing && !cierreYaEnviado && !clientAskedFreeformQuestion(currentMessage)) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && !mensaje.includes("?")) {
      if (responseLooksLikePrematureClose(mensaje)) {
        mensaje = buildNaturalQuestion(pending, ctx);
        log?.info({ entityId, pending }, "GUARD: bloqueando cierre — pregunta pendiente");
      } else if (mensaje.trim()) {
        mensaje = mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx);
        log?.info({ entityId, pending }, "GUARD: añadiendo pregunta pendiente a respuesta");
      }
    }
  }

  if (!trulyReadyForClosing && responseLooksLikePrematureClose(mensaje)) {
    const forcedNext = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
    if (forcedNext) {
      log?.warn({ entityId }, "GUARD: bloqueando cierre prematuro");
      mensaje = forcedNext;
    }
  }

  if (mensajeAsksWrongField(mensaje, filledSet, extracted) && !isInformativeClientAnswer(currentMessage) && !appliedSalesReply) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending) {
      log?.warn({ entityId, pending }, "GUARD: pregunta fuera de orden — corrigiendo");
      mensaje = buildNaturalQuestion(pending, ctx);
    }
  }

  mensaje = sanitizeOutboundMessage(mensaje, filledSet, extracted, ctx, log);

  if (appliedSalesReply) {
    return normalizeAdvisorReferences(mensaje, extracted.nombre);
  }

  mensaje = enforceNombreFirst(mensaje, filledSet, extracted, ctx, forceFirstPresentation);

  const presHistoryForIntro = input.presentationHistory ?? history;
  const isOpeningTurn =
    (forceFirstPresentation || isFirstLucyReply(presHistoryForIntro)) &&
    !conversationAlreadyStarted(filledSet, presHistoryForIntro);
  if (isOpeningTurn && !/hola,?\s*soy\s+lucy/i.test(mensaje)) {
    mensaje = `${LUCY_INTRO} ${mensaje}`.trim();
    log?.info({ entityId }, "GUARD: presentación Lucy añadida al primer mensaje");
  }

  if (conversationAlreadyStarted(filledSet, presHistoryForIntro)) {
    mensaje = stripRepeatLucyIntro(mensaje, presHistoryForIntro, true);
  }

  const ctxText = collectUserTexts(input.presentationHistory ?? history, currentMessage).join(" ");
  const priceSanitized = sanitizeInventedPrices(mensaje, currentMessage, ctxText);
  if (priceSanitized !== mensaje) {
    log?.info({ entityId }, "GUARD: precios inventados eliminados de la respuesta");
    mensaje = priceSanitized;
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && !mensaje.includes("?") && !trulyReadyForClosing) {
      mensaje = mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx);
    }
  }

  mensaje = stripStalePriceTalk(mensaje, currentMessage);
  if (!mensaje.includes("?") && !trulyReadyForClosing && !clientAskedFreeformQuestion(currentMessage)) {
    let pendingAfter = getNextPendingField(extracted, filledSet);
    if (
      pendingAfter === "presupuesto" &&
      countLucyFieldAsks(presHistory, "presupuesto") >= PRESUPUESTO_MAX_ASKS
    ) {
      applyPresupuestoWaiver(filledSet, [], collectUserTexts(presHistory, currentMessage), presHistory);
      pendingAfter = getNextPendingField(extracted, filledSet);
    }
    if (pendingAfter && !(pendingAfter === "presupuesto" && filledSet.has("Presupuesto (MXN)"))) {
      mensaje = mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx);
    }
  }

  mensaje = blockExcessivePresupuestoAsk(
    mensaje,
    filledSet,
    extracted,
    presHistory,
    currentMessage,
    buildClosing,
    cierreYaEnviado,
    whatsappDisplayName,
    entityId,
    log
  );

  if (
    clientAsksPrice(currentMessage) &&
    mentionsListedPriceService(currentMessage)
  ) {
    const fromCatalog = buildCatalogPriceAnswer(currentMessage);
    if (fromCatalog) {
      const pendingFinal = getNextPendingField(extracted, filledSet);
      if (pendingFinal && needsNextStep && !trulyReadyForClosing) {
        mensaje = `${fromCatalog}\n\n${buildNaturalQuestion(pendingFinal, ctx)}`;
      } else {
        mensaje = fromCatalog;
      }
      log?.info({ entityId }, "GUARD: precio del Sheet aplicado al cierre");
    }
  } else if (
    clientAsksPrice(currentMessage) &&
    !messageClaimsPrice(mensaje) &&
    !mentionsNoListedPriceService(currentMessage)
  ) {
    const fromCatalog = buildCatalogPriceAnswer(currentMessage);
    if (fromCatalog) {
      const pendingFinal = getNextPendingField(extracted, filledSet);
      if (pendingFinal && needsNextStep && !trulyReadyForClosing) {
        mensaje = `${fromCatalog}\n\n${buildNaturalQuestion(pendingFinal, ctx)}`;
      } else {
        mensaje = fromCatalog;
      }
      log?.info({ entityId }, "GUARD: precio del Sheet aplicado al cierre");
    }
  } else if (clientAsksInclusion(currentMessage)) {
    const inclusionAnswer = buildCatalogInclusionAnswer(currentMessage);
    if (inclusionAnswer) {
      const pendingFinal = getNextPendingField(extracted, filledSet);
      if (pendingFinal && needsNextStep && !trulyReadyForClosing) {
        mensaje = `${inclusionAnswer}\n\n${buildNaturalQuestion(pendingFinal, ctx)}`;
      } else {
        mensaje = inclusionAnswer;
      }
      log?.info({ entityId }, "GUARD: inclusiones del Sheet aplicadas al cierre");
    }
  }

  const withoutGammaLinks = stripGammaLinks(mensaje);
  if (withoutGammaLinks !== mensaje) {
    log?.info({ entityId }, "GUARD: enlaces gamma.app eliminados de la respuesta");
    mensaje = withoutGammaLinks;
  }

  return normalizeAdvisorReferences(mensaje, extracted.nombre);
}

/** Los links Gamma son solo conocimiento interno — nunca deben llegar al cliente. */
export function stripGammaLinks(text: string): string {
  if (!text || !/gamma\.app/i.test(text)) return text;
  return text
    .replace(/https?:\/\/[^\s]*gamma\.app[^\s]*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
