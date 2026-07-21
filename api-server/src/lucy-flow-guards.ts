import type { OpenAI } from "openai";
import type { ExtractedData } from "./types.js";
import {
  isAffirmativeOnlyMessage,
  isGreetingOnlyMessage,
  isQuoteIntentMessage,
  isNombreMoreComplete,
  pickBetterNombre,
  resolveClientDisplayName,
  sanitizeDisplayName,
  sanitizeCrmNombre,
  buildNameConfirmationPrompt,
  namesAreLikelySamePerson,
  isLikelyNotPersonNameMessage,
  clientAsksCompanyIdentity,
  buildCompanyIdentityReply,
} from "./contact-name.js";
import {
  buildEmailConfirmationPrompt,
  filterClientEmail,
  looksLikeValidClientEmail,
} from "./client-email.js";
import {
  buildModoServicioClarificationQuestion,
  needsModoServicioClarification,
} from "./modoServicio.js";
import { normalizeAdvisorReferences, advisorLabelForClient, stripInternalCrmBlock } from "./lib/bodasesorAdvisor.js";
import {
  buildCompanyEmailConfirmReply,
  clientAsksIfCompanyEmailCorrect,
} from "./tipoContacto.js";
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
  resolveCatalogInclusionReply,
  buildCatalogComparisonAnswer,
  buildCatalogServiceDetailAnswer,
  catalogAnswerMatchesRequestedService,
  responseLooksLikeGenericCateringMenu,
  clientAsksInclusion,
  buildCatalogWebLinkReply,
  stripUnsolicitedCatalogWebLinks,
  CATALOG_OFFER_QUESTION,
  messageOffersCatalogLink,
  enrichBareNivelOffer,
  messageOffersLevelsWithoutInclusions,
  getCatalogWebHubDeliveryUrl,
  buildBroadLevel1Offer,
  isNarrowSocialEventOffer,
} from "./services/catalogService.js";
import { resolveServiceFocusFromText } from "./services/serviceSynonyms.js";
import { buildGuardServiceAck, buildMobiliarioRentDetailReply } from "./services/serviceKnowledge.js";
import {
  extractImageClientReply,
  extractImageIntent,
  looksLikeImageInternalSummary,
} from "./services/imageProcessor.js";
import {
  BODASESOR_SERVICE_PATTERNS,
  clientAsksForRecommendations,
  clientAsksAboutTeam,
  clientAsksPhone,
  clientAsksLocation,
  clientMentionsItalianTheme,
  isAmbiguousShortNumber,
  isCatalogLevelSelection,
  clientDeclinesMoreServices,
  clientMentionsEntertainment,
  clientMentionsPistaTarima,
  clientMentionsCarpas,
  clientAsksServiceInfo,
  parseSalaProductFromText,
  isLikelyProductNameNotLocation,
  detectPresupuestoRefusal,
  findPresupuestoInTexts,
  countLucyFieldAsks,
  PRESUPUESTO_MAX_ASKS,
  PRESUPUESTO_AUTO_WAIVER,
  parsePresupuestoFromText,
  isPresupuestoResuelto,
  clientAddsToQuote,
  clientAsksBanqueteVsTaquiza,
  parseCorreoFromText,
  clientMentionsCatering,
  inferLucyAskedField,
  isServiceRelatedMessage,
  parsePrimaryService,
  parseSpaceDimensions,
  parseFechaFromText,
  parseTipoEventoFromText,
  parseServicesFromText,
  mergeServiceRequirements,
  buildMultiServiceAck,
  buildRichBriefAcknowledgment,
  formatServicesList,
  isUsableDireccionEvento,
  isVagueVenueOnly,
  recoverClienteNombreFromHistory,
  isVagueFoodTerm,
  isGettingReadyContext,
  parseWebLeadBrief,
  clientAsksForCatalog,
  clientWantsFullCatalog,
  clientAffirmsCatalogOffer,
  isRichQuoteBrief,
  clientAsksToRereadBrief,
  clientAsksDistributorPricing,
  clientRequestsCallback,
  isGenericQuoteIntentRequerimiento,
  FECHA_MAX_ASKS,
  FECHA_AUTO_WAIVER,
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
  "Lugar/dirección del evento",
  "Fecha y horario",
  "Número de invitados",
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

/** Follow-up de "¿otro servicio?" en cualquier variante (para anti-bucle). */
export const OTRO_SERVICIO_ASK_PATTERN =
  /alg[uú]n\s+otro\s+servicio|otro\s+servicio\b|qu[eé]\s+otros\s+servicios|algo\s+m[aá]s\s+para\s+(el\s+)?evento|solo\s+el\s+.+\s+o\s+tambi[eé]n|necesitan?\s+alg[uú]n\s+otro|cotizar\s+alg[uú]n\s+otro/i;

/** Lista genérica de servicios / "¿otro servicio?" — para cortar el bucle anti-menú. */
export function looksLikeServicesMenuDump(text: string): boolean {
  if (!text?.trim()) return false;
  const t = text.toLowerCase();
  if (OTRO_SERVICIO_ASK_PATTERN.test(t)) return true;
  if (/tambi[eé]n\s+manejamos\s+(bebidas|alimentos|mobiliario|dj)/i.test(t)) return true;
  if (
    /manejamos\s+(alimentos|bebidas|mobiliario|pistas?|banquetes?).{0,80}(dj|iluminaci|carpas?|pantallas?)/i.test(
      t
    )
  ) {
    return true;
  }
  // Fingerprint del hint hardcodeado (alimentos + mobiliario + DJ/luz).
  if (/alimentos\s+y\s+barras/.test(t) && /mobiliario/.test(t) && /\bdj\b|iluminaci/.test(t)) {
    return true;
  }
  return false;
}

/** True si Lucy ya tiró el menú / "¿otro servicio?" en el historial. */
export function historyAlreadyHadServicesCatalog(
  history?: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  if (!history?.length) return false;
  return history.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      looksLikeServicesMenuDump(m.content as string)
  );
}

function appendServiciosCatalogoHint(
  pregunta: string,
  adicional = false,
  history?: OpenAI.Chat.ChatCompletionMessageParam[]
): string {
  if (mensajeMencionaCatalogoServicios(pregunta)) return pregunta;
  // No volver a inyectar el catálogo si ya salió en un turno anterior.
  if (historyAlreadyHadServicesCatalog(history)) return pregunta.trim();
  const hint = adicional ? SERVICIOS_CATALOGO_HINT_ADICIONAL : SERVICIOS_CATALOGO_HINT;
  return `${pregunta.trim()} ${hint}`.trim();
}

function hasPresupuestoValue(extracted: ExtractedData): boolean {
  const p = extracted.presupuesto as unknown;
  if (p == null || p === "") return false;
  if (typeof p === "number") return Number.isFinite(p);
  return String(p).trim().length > 0;
}

/**
 * Sincroniza filledSet desde extracted cuando la captura GPT/CRM vino desfasada.
 * Evita re-preguntar correo/zona/fecha/servicios ya presentes en extracted.
 */
/** Máx. intentos de correo con redacción distinta — no spamear el mismo ask. */
export const CORREO_MAX_ASKS = 2;

export function syncFilledFromExtracted(filledSet: Set<string>, extracted: ExtractedData): void {
  if (sanitizeCrmNombre(extracted.nombre)) filledSet.add("Nombre del cliente");
  const email = filterClientEmail(extracted.correo);
  if (email && looksLikeValidClientEmail(email)) filledSet.add("Correo electrónico");
  if (extracted.tipo_evento?.trim()) filledSet.add("Tipo de evento");
  if (isValidRequerimientosValue(extracted.requerimientos_evento)) {
    filledSet.add("Requerimientos o servicios");
  }
  // Solo invalidar zona si extracted trae un valor NO usable (salón/edificio/medidas/producto).
  // Si extracted viene vacío, respetar lo ya marcado en CRM/filledSet.
  if (extracted.direccion_evento?.trim()) {
    if (
      !isUsableDireccionEvento(extracted.direccion_evento) ||
      isLikelyProductNameNotLocation(extracted.direccion_evento)
    ) {
      extracted.direccion_evento = null;
      filledSet.delete("Lugar/dirección del evento");
    } else {
      filledSet.add("Lugar/dirección del evento");
    }
  }
  if (extracted.fecha_horario?.trim()) filledSet.add("Fecha y horario");
  if (extracted.num_invitados) filledSet.add("Número de invitados");
  if (hasPresupuestoValue(extracted)) filledSet.add("Presupuesto (MXN)");
}

/** Plantillas legacy — preferir variantes naturales vía buildNaturalQuestion(). */
export const FLOW_QUESTIONS = {
  nombre: "¿Me regalas tu nombre para iniciar?",
  tipoEvento: "¿Qué festejan o qué tipo de evento sería?",
  tipoEventoTrasCorreo: "¿Qué tipo de celebración están planeando?",
  requerimientos: "Platícame, ¿qué tienes pensado para tu evento?",
  invitados: "¿Más o menos para cuántas personas sería?",
  zona: "¿En qué ciudad y colonia (o salón) sería tu evento? Si tienes la dirección exacta, mejor.",
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

import { advisorLabelForClient } from "./lib/bodasesorAdvisor.js";

function getQuestionVariants(): Record<PendingField, string[]> {
  const team = advisorLabelForClient();
  return {
  nombre: [
    "¿Me regalas tu nombre para iniciar?",
    "¿Con quién tengo el gusto?",
    "¿Cómo te llamas?",
  ],
  correo: [
    `Para mandarte la info y que ${team} te arme la propuesta, ¿a qué correo te lo envío?`,
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
    "¿En qué ciudad y colonia (o salón) sería tu evento? Si tienes la dirección exacta, mejor.",
    "¿Me compartes ciudad y colonia o el nombre del salón donde sería?",
    "¿Cuál sería la ubicación del evento? Necesito ciudad y colonia o salón para cotizar bien.",
  ],
  fecha: [
    "¿Ya tienen fecha o todavía la van definiendo?",
    "¿Para cuándo lo tienen pensado?",
    "¿Ya hay día definido o siguen viendo opciones?",
  ],
  presupuesto: [
    "¿Tienen algún rango de presupuesto en mente?",
    "¿Manejan algún presupuesto estimado para el evento?",
    `¿Tienen idea del presupuesto o prefieren que ${team} les proponga opciones?`,
  ],
};
}

const FIELD_ASK_PATTERNS: Record<PendingField, RegExp> = {
  nombre: /regalas?\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|con\s+qui[eé]n\s+tengo|tu\s+nombre|me\s+das\s+tu\s+nombre/i,
  correo: /correo|e-?mail|env[ií]o|mandarte|mandar(te)?\s+la\s+info|compartes?\s+un\s+correo/i,
  tipo_evento:
    /festejan|tipo\s+de\s+(evento|celebraci[oó]n)|qu[eé]\s+evento|qu[eé]\s+celebr|de\s+qu[eé]\s+se\s+trata|qu[eé]\s+tipo\s+de\s+celebr/i,
  requerimientos:
    // No usar "menú" suelto: el bloque de catálogo dice "montajes, menús y opciones" (A14924).
    /pensado|servicios?|banquete|taquiza|cotizar|adem[aá]s\s+del|qu[eé]\s+necesitas|qu[eé]\s+buscas|qu[eé]\s+men[uú]|men[uú]\s+(prefieres|te\s+gustar|quieres)|plat[ií]came/i,
  invitados:
    /invitados|personas|gente|cu[aá]ntos|cu[aá]ntas|aproximadamente|m[aá]s\s+o\s+menos|para\s+cu[aá]ntas|ser[ií]an/i,
  zona: /ciudad|direcci[oó]n\s+exacta|d[oó]nde\s+(lo|ser[ií]|ser[aá]|queda|est[aá]n)|en\s+qu[eé]\s+(ciudad|zona|lugar)|lugar|direcci[oó]n|ubicaci[oó]n|zona|sal[oó]n/i,
  fecha: /fecha|cu[aá]ndo|d[ií]a|agenda|definiendo|definido|definir|siguen\s+viendo|opciones\s+de\s+fecha|para\s+cu[aá]ndo/i,
  presupuesto: /presupuesto|estimado|rango|inversi[oó]n|budget|monto/i,
};

export function isValidRequerimientosValue(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  // "Quiero una cotización" / intención genérica ≠ servicio real (Núria A14894).
  if (isGenericQuoteIntentRequerimiento(trimmed) || isQuoteIntentMessage(trimmed)) return false;
  if (isGreetingOnlyMessage(trimmed)) return false;
  // "Hola soy Ana" / solo nombre ≠ requerimientos.
  if (
    /^(hola|buen[oa]s?\b|me\s+llamo|soy|mi\s+nombre\s+es)\b/i.test(trimmed) &&
    parseServicesFromText(trimmed).length === 0 &&
    !isServiceRelatedMessage(trimmed)
  ) {
    return false;
  }
  if (
    sanitizeCrmNombre(trimmed) &&
    parseServicesFromText(trimmed).length === 0 &&
    !isServiceRelatedMessage(trimmed) &&
    trimmed.split(/\s+/).length <= 4 &&
    !/\d/.test(trimmed)
  ) {
    return false;
  }
  // Servicios reales del catálogo siempre cuentan.
  if (parseServicesFromText(trimmed).length > 0 || isServiceRelatedMessage(trimmed)) return true;
  // Tipo de evento o temática sola ("fiesta toscana") ≠ requerimientos.
  if (parseTipoEventoFromText(trimmed)) return false;
  if (clientMentionsItalianTheme(trimmed) && trimmed.length < 48) return false;
  // Texto libre capturado (p. ej. servicio fuera de catálogo).
  if (trimmed.length >= 4) return true;
  return false;
}

export const CLOSING_SIGNATURE = "Perfecto, ya tengo todo.";

/** Detecta cierre en historial completo o última respuesta persistida (no solo slice reciente). */
export function detectCierreEnviado(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  lastStoredResponse?: string | null
): boolean {
  if (lastStoredResponse?.includes(CLOSING_SIGNATURE)) return true;
  return history.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      (m.content as string).includes(CLOSING_SIGNATURE)
  );
}

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

  if (texts.some((t) => detectPresupuestoRefusal(t))) {
    const last = texts[texts.length - 1] ?? "";
    const label = /^(opciones?|propuestas?)[\s.,!]*$/i.test(last.trim())
      ? "Sin definir (cliente pidió que propongamos)"
      : "Sin definir (cliente indicó que no tiene)";
    mergedLines.push(`- Presupuesto (MXN): ${label}`);
    filledSet.add("Presupuesto (MXN)");
    return;
  }

  const lastAssistant = [...(history ?? [])]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  const lastAsked = lastAssistant
    ? inferLucyAskedField(lastAssistant.content as string)
    : null;
  if (
    lastAsked === "presupuesto" &&
    texts.some((t) =>
      /^(no\s+tengo|no\s+tenemos|no\s+cuento|sin|opciones?|propuestas?)[\s.,!]*$/i.test(t.trim())
    )
  ) {
    mergedLines.push(`- Presupuesto (MXN): Sin definir (cliente pidió que propongamos)`);
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

export function isEmailSatisfied(filledSet: Set<string>, extracted?: ExtractedData): boolean {
  if (filledSet.has("Correo electrónico") || filledSet.has(EMAIL_WAIVED_LABEL)) return true;
  if (!extracted) return false;
  const email = filterClientEmail(extracted.correo);
  return !!(email && looksLikeValidClientEmail(email));
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
/**
 * Quita SOLO la URL/frase del catálogo de una respuesta (no la línea completa).
 * GPT a menudo mezcla el link con contenido real en un solo párrafo/línea
 * ("No hay problema, ya anoté X. Aquí tienes el catálogo: <url>") — borrar
 * la línea entera dejaba la respuesta completamente vacía.
 */
export function stripCatalogBlockShared(text: string): string {
  let result = text.replace(
    /\s*(mientras\s+tanto,?\s*)?(aqu[ií]\s+(est[aá]|tienes)\s+nuestro\s+cat[aá]logo\s+completo:?\s*)?https?:\/\/\S*cdn\.shopify\.com\S*/gi,
    ""
  );
  result = result.replace(/\bcomparto\s+el\s+link\s+del\s+cat[aá]logo\b[.:]?/gi, "");

  // Encabezados del listado completo del catálogo — sí se quitan como línea
  // entera porque solo aparecen cuando GPT reprodujo el bloque de precios.
  const lines = result.split("\n");
  const filtered = lines.filter(
    (l) =>
      !l.toLowerCase().includes("banquetes:") &&
      !l.toLowerCase().includes("barras temáticas:") &&
      !l.toLowerCase().includes("bebidas:") &&
      !l.toLowerCase().includes("mesas especiales:") &&
      !l.toLowerCase().includes("mobiliario:") &&
      !l.toLowerCase().includes("entretenimiento:") &&
      !l.toLowerCase().includes("estructuras:") &&
      !l.toLowerCase().includes("cdn.shopify.com")
  );
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

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
  // No usar Tipo/Requerimientos aquí: el merge del mismo turno los llena antes
  // del branch de primer mensaje y rompía intro+ack en RFQ (tests 38/44/66/69).
  // El anti-reinicio A14924 vive en kommo.ts (isFirstInteraction + CRM).
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
  const variants = getQuestionVariants()[field];
  const assistantTurns = history.filter((m) => m.role === "assistant").length;
  const seed = entityId != null ? String(entityId).length : 0;
  return (assistantTurns + seed) % variants.length;
}

function pickVariant(
  field: PendingField,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number
): string {
  const variants = getQuestionVariants()[field];
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
    "Ventas: 55 4008 0373 — solo por línea telefónica (no WhatsApp).",
    "Gerencia / corporativo: 56 4671 0585 — sí aceptamos llamadas por WhatsApp y por línea telefónica.",
    "Por aquí por chat también te podemos ayudar con lo que necesites.",
  ].join("\n");
}

/**
 * Única respuesta permitida cuando Lucy está en silencio (Humano Trabaja, etc.)
 * y el cliente pide ayuda/contacto/emergencia.
 */
export function buildEmergencyContactAnswer(): string {
  return [
    "Claro, te paso los contactos de emergencia del equipo:",
    "Ventas: 55 4008 0373 — solo por línea telefónica (no WhatsApp).",
    "Gerencia / corporativo: 56 4671 0585 — sí aceptamos llamadas por WhatsApp y por línea telefónica.",
    "Un asesor te puede atender por ahí. Tu caso sigue en seguimiento con el equipo.",
  ].join("\n");
}

/** Respuesta estándar de ubicación y cobertura (prompt sección 7). */
export function buildLocationAnswer(): string {
  return "Estamos en Ciudad de México y trabajamos en toda la república. Según la fecha y el lugar de tu evento, coordinamos el servicio.";
}

/** Pitch de comida italiana para temáticas o recomendaciones contextuales. */
export function buildItalianFoodPitch(message?: string): string {
  const inv = message?.match(/(\d+)\s*(?:personas?|invitados?)/i);
  let pitch =
    "Para temática italiana manejamos pastas, pizzas, barras de antipasti y estaciones de comida italiana";
  if (inv) pitch += ` para ${inv[1]} personas`;
  return `${pitch}.`;
}

function buildPistaTarimaSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  entityId?: string | number,
  filledSet?: Set<string>,
  ctx?: NaturalQuestionContext
): string {
  const dims =
    parseSpaceDimensions(currentMessage ?? "") ||
    (extracted.requerimientos_evento?.match(/\d+m\s*x\s*\d+m/i)?.[0] ?? null);
  const intro = dims
    ? `Sí, anoto la pista/tarima (${dims.replace(/m/gi, " m")}) para tu cotización. El equipo confirma el precio según esas medidas.`
    : `Sí, manejamos pista de baile y tarima (opción iluminada). ¿Quieres que lo agregue a tu cotización? ¿Qué medidas aproximadas tiene el espacio?`;

  if (filledSet) {
    filledSet.add("Requerimientos o servicios");
  }
  if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
    extracted.requerimientos_evento = dims
      ? `pista/tarima ${dims.replace(/m/gi, " m")}`
      : "pista de baile / tarima";
  } else if (dims && !extracted.requerimientos_evento.includes(dims)) {
    extracted.requerimientos_evento = `${extracted.requerimientos_evento}; pista/tarima ${dims}`;
  }

  // Sin medidas: prioriza la pregunta de medidas (no saltar al siguiente campo).
  if (!dims) {
    return `${pickTransition(history)} ${intro}`.trim();
  }

  const filledAfter = new Set(filledSet ?? []);
  filledAfter.add("Requerimientos o servicios");
  const pending = getNextPendingField(extracted, filledAfter);
  if (pending && pending !== "requerimientos" && ctx) {
    const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
    return `${pickTransition(history)} ${intro}\n\n${nextQ}`.trim();
  }
  return `${pickTransition(history)} ${intro}`.trim();
}

/** Carpas: sí/no real + agregar a cotización + medidas (María A14906). */
function buildCarpasSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  filledSet?: Set<string>,
  ctx?: NaturalQuestionContext
): string {
  const dims =
    parseSpaceDimensions(currentMessage ?? "") ||
    (extracted.requerimientos_evento?.match(/\d+m\s*x\s*\d+m/i)?.[0] ?? null);
  const transparent = /transparent/i.test(currentMessage ?? "");
  const ack = buildGuardServiceAck(currentMessage ?? "carpas transparentes");

  if (filledSet) filledSet.add("Requerimientos o servicios");
  const baseLabel = transparent ? "Carpas transparentes" : "Carpas";
  if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
    extracted.requerimientos_evento = dims ? `${baseLabel} (${dims})` : baseLabel;
  } else if (!/carpa/i.test(extracted.requerimientos_evento)) {
    extracted.requerimientos_evento = dims
      ? `${extracted.requerimientos_evento}; ${baseLabel} (${dims})`
      : `${extracted.requerimientos_evento}; ${baseLabel}`;
  }

  if (!dims) {
    // Ya incluye pregunta de medidas en buildGuardServiceAck / consultive.
    return `${pickTransition(history)} ${ack}`.trim();
  }

  const filledAfter = new Set(filledSet ?? []);
  filledAfter.add("Requerimientos o servicios");
  const pending = getNextPendingField(extracted, filledAfter);
  if (pending && pending !== "requerimientos" && ctx) {
    const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
    return `${pickTransition(history)} ${ack}\n\n${nextQ}`.trim();
  }
  return `${pickTransition(history)} ${ack}`.trim();
}

function buildEntertainmentSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number,
  currentMessage?: string,
  filledSet?: Set<string>,
  ctx?: NaturalQuestionContext
): string {
  const tipo = (extracted.tipo_evento ?? "").trim().toLowerCase();
  const eventLabel =
    /corporativo|empresa/.test(tipo) || /empresa|corporativo/i.test(currentMessage ?? "")
      ? "tu evento corporativo"
      : tipo
        ? `tu ${tipo}`
        : "tu evento";

  const wantsMc = /\b(maestro\s+de\s+ceremonias?|master\s+of\s+ceremonies|\bmc\b|presentador)\b/i.test(
    currentMessage ?? ""
  );
  const services = parseServicesFromText(currentMessage ?? "");
  const label =
    (services.length ? services.join(", ") : null) ||
    (wantsMc ? "Maestro de ceremonias y show" : "Animación / Hora loca y shows");

  if (filledSet) {
    filledSet.add("Requerimientos o servicios");
    const merged = mergeServiceRequirements(extracted.requerimientos_evento, label, 6);
    if (merged) extracted.requerimientos_evento = merged;
  }

  const intro = wantsMc
    ? `Sí, para ${eventLabel} también manejamos *maestro de ceremonias*, shows en vivo, animación y hora loca.`
    : `Para ${eventLabel}, manejamos shows en vivo, animación, hora loca, happening, espejos, láser y más opciones de entretenimiento.`;
  const ideas =
    "Lo más pedido es un show de grupo versátil o animación tipo hora loca, según el estilo que busquen.";

  // Entretenimiento no tiene precios en Sheet: mandar catálogo general (A14920).
  const catalog = buildPackageCatalogOfferBlock();
  let body = `${intro} ${ideas}\n\n${catalog}`;

  if (filledSet && ctx) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && pending !== "requerimientos") {
      const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet });
      if (nextQ && !body.includes(nextQ)) body = `${body}\n\n${nextQ}`;
    }
  } else {
    const follow = pickVariant("requerimientos", history, entityId);
    body = `${body}\n\n${follow}`.trim();
  }

  return body.trim();
}

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

function stripLeadingTransition(text: string): string {
  return text
    .replace(/^(Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro que sí|Claro|Qué padre|De acuerdo|Con gusto)\.\s*/i, "")
    .trim();
}

/** Normaliza una pregunta de follow-up de servicios para comparar plantilla, no texto literal. */
function requerimientosFollowUpTemplate(text: string, clientName?: string | null): string | null {
  let s = stripLeadingTransition(text);
  s = stripAccents(s.toLowerCase());
  if (clientName?.trim()) {
    const name = stripAccents(clientName.trim().toLowerCase());
    s = s.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ");
  }
  s = s
    .replace(/\b(adem[aá]s del|con el|solo el|la renta de la?|las?)\s+[^,?]+/gi, "__svc__")
    .replace(/\s+/g, " ")
    .trim();

  if (
    /__svc__.*(alg[uú]n\s+otro\s+servicio|otro\s+servicio|algo\s+m[aá]s|te\s+gustar[ií]a\s+cotizar)/i.test(
      s
    ) ||
    /qu[eé]\s+otros\s+servicios/i.test(s) ||
    /necesitan\s+alg[uú]n\s+otro\s+servicio/i.test(s)
  ) {
    return "followup_otro_servicio";
  }
  return null;
}

function bodyEqualsLastAssistant(
  msg: string,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  clientName?: string | null
): boolean {
  const last = [...history].reverse().find((m) => m.role === "assistant");
  if (!last || typeof last.content !== "string") return false;

  const norm = (s: string) => stripLeadingTransition(s).trim();
  const a = norm(msg);
  const b = norm(last.content as string);
  if (a === b) return true;

  const templateA = requerimientosFollowUpTemplate(a, clientName);
  const templateB = requerimientosFollowUpTemplate(b, clientName);
  if (templateA && templateB && templateA === templateB) return true;

  const normText = (s: string) =>
    stripAccents(stripLeadingTransition(s).toLowerCase()).replace(/\s+/g, " ").trim();
  return normText(a) === normText(b);
}

function hasMeaningfulRequerimientos(extracted: ExtractedData, filledSet: Set<string>): boolean {
  if (filledSet.has("Requerimientos o servicios")) return true;
  const req = extracted.requerimientos_evento?.trim() ?? "";
  return req.length > 0;
}

function lastAssistantAskedMoreServices(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  const lastAssistant = history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .slice(-1)[0]?.content as string | undefined;
  if (!lastAssistant) return false;
  return (
    inferLucyAskedField(lastAssistant) === "requerimientos" &&
    /alg[uú]n\s+otro\s+servicio|otro\s+servicio|algo\s+m[aá]s|qu[eé]\s+otros\s+servicios/i.test(
      lastAssistant
    )
  );
}

function buildFoodServiceAckIntro(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string | null {
  if (!currentMessage) return null;
  const mentionedService = findMentionedService(currentMessage);
  if (!mentionedService && !clientMentionsCatering(currentMessage)) return null;

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

  if (mentionedService) {
    return `${pickTransition(history)} Sí manejamos ${mentionedService} para ${eventLabel}.`;
  }
  if (/coffee\s*break/i.test(currentMessage)) {
    return `${pickTransition(history)} Sí manejamos Coffee Break para eventos corporativos y particulares.`;
  }
  return `${pickTransition(history)} Con gusto te ayudo con catering para ${eventLabel}.`;
}

/** Opciones acotadas cuando el cliente dice solo "comida", "desayuno", etc. */
export function buildVagueFoodOptionsReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  entityId?: string | number
): string {
  const texts = collectUserTexts(history, currentMessage).join(" ").toLowerCase();
  const tipo = (extracted.tipo_evento ?? parseTipoEventoFromText(texts) ?? "").toLowerCase();
  const inv = extracted.num_invitados ?? 0;
  const gettingReady = isGettingReadyContext(texts) || isGettingReadyContext(currentMessage);

  let options: string;
  if (gettingReady || (/\bboda\b/.test(tipo) && inv > 0 && inv <= 30)) {
    options =
      "Para el getting ready suele ir desayuno o brunch ligero, canapés o coffee break — sin pista ni DJ.";
  } else if (/baby\s*shower/.test(tipo) || /baby\s*shower/.test(texts)) {
    options = "Para baby shower van bien brunch o banquete ligero, mesa de dulces o bocadillos.";
  } else if (/\bboda\b/.test(tipo) && inv >= 150) {
    options = "Para boda grande lo más pedido es banquete, taquiza o barra de bebidas.";
  } else if (/bautizo/.test(tipo) || /\bbautizo\b/.test(texts)) {
    options = "Para bautizo suele ir banquete o brunch, mesa de dulces o bocadillos.";
  } else if (/corporativo/.test(tipo) || /corporativ/.test(texts)) {
    options = "Para eventos corporativos manejamos coffee break, banquete o barra de alimentos.";
  } else {
    options = "Según el evento podemos ofrecerte banquete, taquiza o brunch — ¿cuál te interesa?";
    return `${pickTransition(history)} ${options}`;
  }

  const follow = pickVariant("requerimientos", history, entityId);
  return `${pickTransition(history)} ${options} ${follow}`.trim();
}

function buildFoodSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number,
  currentMessage?: string,
  filledSet?: Set<string>,
  ctx?: NaturalQuestionContext
): string | null {
  if (isVagueFoodTerm(currentMessage)) {
    return buildVagueFoodOptionsReply(extracted, history, currentMessage, entityId);
  }

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

  const mentionedService = currentMessage ? findMentionedService(currentMessage) : null;
  const query = currentMessage?.trim() || mentionedService || "";

  const appendNext = (body: string, acceptedService?: string | null): string => {
    if (!filledSet || !ctx) return body;
    if (acceptedService) {
      filledSet.add("Requerimientos o servicios");
      const merged = mergeServiceRequirements(extracted.requerimientos_evento, acceptedService, 6);
      if (merged) extracted.requerimientos_evento = merged;
    }
    const pending = getNextPendingField(extracted, filledSet);
    if (!pending) return body;
    const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet });
    if (body.includes(nextQ)) return body;
    return `${body}\n\n${nextQ}`;
  };

  const allServices = currentMessage ? parseServicesFromText(currentMessage) : [];
  if (allServices.length >= 2 || (currentMessage && isRichQuoteBrief(currentMessage))) {
    const listLabel = allServices.join(", ");
    const packageReply = buildMultiServicePackageReply(
      allServices,
      currentMessage
    );
    return appendNext(`${pickTransition(history)} ${packageReply}`, listLabel || null);
  }

  if (mentionedService || (currentMessage && isServiceRelatedMessage(currentMessage))) {
    let detail = query ? buildCatalogServiceDetailAnswer(query) : null;
    if (detail && mentionedService && !catalogAnswerMatchesRequestedService(currentMessage ?? "", detail)) {
      detail = null;
    }
    const serviceLabel =
      (allServices.length > 0 ? allServices.join(", ") : null) ||
      mentionedService ||
      parsePrimaryService(currentMessage ?? "") ||
      (currentMessage?.trim() ? currentMessage.trim().slice(0, 80) : null);

    if (detail) {
      const intro = mentionedService
        ? `${pickTransition(history)} Sí manejamos ${mentionedService} para ${eventLabel}.`
        : `${pickTransition(history)} Con gusto te ayudo con ${eventLabel}.`;
      // Tras explicar: ofrecer el link web solo si el cliente lo pide.
      const body = `${intro}\n\n${detail}`.trim();
      return messageOffersCatalogLink(body)
        ? body
        : `${body}\n\n${CATALOG_OFFER_QUESTION}`;
    }

    if (serviceLabel && currentMessage) {
      return appendNext(
        `${pickTransition(history)} ${buildGuardServiceAck(currentMessage)}`,
        serviceLabel
      );
    }

    return null;
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
  const inv = extracted.num_invitados ?? 0;
  const gettingReady = isGettingReadyContext(texts) || isGettingReadyContext(currentMessage);

  // Evento = servicio (pozolada, taquiza…) → ofrecer ESE servicio.
  const focus = resolveServiceFocusFromText(
    `${extracted.tipo_evento ?? ""} ${currentMessage ?? ""} ${texts}`
  );
  if (focus && /pozole|taquiza|paella|parrillada|navide|posada|carne\s+asada/i.test(focus.familyKey + focus.label + (extracted.tipo_evento ?? ""))) {
    const primary = focus.label;
    const comps = focus.complements.slice(0, 2).join(" y ");
    const ideas = `Para tu ${extracted.tipo_evento || focus.label} tenemos *${primary}*. Si quieres, también podemos sumar ${comps} — sin compromiso.`;
    const follow = pickVariant("invitados", history, entityId);
    // Prefer asking invitados when offering a focused food event
    return `${pickTransition(history)} ${ideas} ${follow}`.trim();
  }

  let ideas: string;
  if (gettingReady || (/\bboda\b/.test(tipo) && inv > 0 && inv <= 30)) {
    ideas =
      "Para el getting ready suele ir desayuno o brunch ligero, canapés o coffee break. Mobiliario básico si hace falta, sin pista ni DJ.";
  } else if (/baby\s*shower/.test(tipo) || /baby\s*shower/.test(texts)) {
    ideas =
      "Para baby shower suele ir brunch o banquete ligero, mesa de dulces, bocadillos y mobiliario.";
  } else if (/bautizo/.test(tipo) || /\bbautizo\b/.test(texts)) {
    ideas =
      "Para un bautizo suele funcionar muy bien: banquete o brunch, pastel de bautizo, mesa de dulces, mobiliario y sillas. En jardín o terraza, carpas o sombrillas.";
  } else if (/boda/.test(tipo) || /\bboda\b/.test(texts)) {
    if (inv >= 150) {
      ideas =
        "Para boda grande lo más pedido es banquete, barra de bebidas, mobiliario, carpas o pista de baile, DJ e iluminación.";
    } else {
      ideas =
        "Para boda lo más pedido es banquete o taquiza, barra de bebidas, mobiliario y mesa de dulces según el tamaño del evento.";
    }
  } else if (/xv|quince/.test(tipo) || /\bxv\b|quince/.test(texts)) {
    ideas =
      "Para XV años suele ir banquete o taquiza, mesa de dulces, mobiliario, DJ, iluminación y pista de baile.";
  } else if (/graduaci|celebraci/.test(tipo) || /graduaci|celebraci/.test(texts)) {
    // Ofrecimiento amplio Nivel 1 (no solo 3 ítems).
    return buildBroadLevel1Offer(extracted.tipo_evento || "graduación");
  } else if (clientMentionsItalianTheme(texts) || clientMentionsItalianTheme(currentMessage)) {
    ideas =
      "Para algo con temática italiana van muy bien pastas, pizzas, barras de antipasti o estaciones de comida italiana.";
  } else {
    // Default social: abanico completo, no 3 líneas cortas.
    return buildBroadLevel1Offer(extracted.tipo_evento || "evento");
  }

  const comparison = buildCatalogComparisonAnswer();
  if (comparison && /banquete|taquiza|recomiendas?/i.test(currentMessage ?? "")) {
    return `${ideas}\n\n${comparison}`;
  }

  const follow = pickVariant("requerimientos", history, entityId);
  return appendServiciosCatalogoHint(`${ideas} ${follow}`.trim());
}

const LUCY_TRANSITIONS = [
  "Perfecto.",
  "De acuerdo.",
  "Claro que sí.",
  "Con gusto.",
  "Listo.",
  "Claro.",
] as const;

const TRANSITION_START_PATTERN =
  /^(Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro que sí|Claro|Qué padre|De acuerdo|Con gusto)\./i;

/** Rota transiciones — nunca la misma dos veces seguidas (regla Replit). */
export function pickTransition(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): string {
  const assistants = history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .map((m) => (m.content as string).trim());

  const last = assistants[assistants.length - 1] ?? "";
  const lastMatch = last.match(TRANSITION_START_PATTERN);
  const lastTransition = lastMatch ? lastMatch[0] : null;

  const start = assistants.length % LUCY_TRANSITIONS.length;
  for (let i = 0; i < LUCY_TRANSITIONS.length; i++) {
    const candidate = LUCY_TRANSITIONS[(start + i) % LUCY_TRANSITIONS.length]!;
    if (candidate !== lastTransition) return candidate;
  }
  return LUCY_TRANSITIONS[0]!;
}

/** Evita "Suena muy bien. … Suena muy bien. …" en el mismo mensaje. */
export function dedupeTransitionsInMessage(mensaje: string): string {
  if (!mensaje?.trim()) return mensaje;
  const pattern =
    /\b(Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro que sí|Claro|Qué padre|De acuerdo|Con gusto)\./gi;
  let seen: string | null = null;
  return mensaje
    .replace(pattern, (match) => {
      const key = match.toLowerCase();
      if (seen === key) return "";
      if (!seen) seen = key;
      return match;
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim();
}

/** Quita "Ya tengo tu correo/zona..." antes de la siguiente pregunta (anti-robot Replit). */
export function stripRobotAcknowledgments(mensaje: string): string {
  let out = mensaje;
  out = out.replace(
    /(?:Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro que sí|Claro|Qué padre|De acuerdo|Con gusto)[,.]?\s+(?:\w+[,.]?\s+)?ya\s+tengo\s+(?:tu|su|el|la)\s+[^.?!]+\.\s*/gi,
    ""
  );
  out = out.replace(/\bYa\s+tengo\s+(?:tu|su|el|la)\s+[^.?!]+\.\s*/gi, "");
  out = out.replace(/\bPerfecto,\s+\w+\.\s+Ya\s+tengo\b[^.?!]+\.\s*/gi, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

function contextualPrefix(
  field: PendingField,
  extracted: ExtractedData,
  currentMessage?: string,
  history: OpenAI.Chat.ChatCompletionMessageParam[] = []
): string {
  const msg = currentMessage?.trim() ?? "";
  if (!msg) return "";

  if (field === "requerimientos" && clientMentionsCatering(currentMessage)) {
    return `${pickTransition(history)} `;
  }
  if (field === "invitados" && (extracted.tipo_evento || /boda|xv|cumple|corporativo|baby/i.test(msg))) {
    return `${pickTransition(history)} `;
  }
  if (field === "zona" && /\d+/.test(msg)) {
    return "Entendido. ";
  }
  if (field === "fecha" && /ciudad|zona|polanco|cdmx|puebla|monterrey|reforma/i.test(msg)) {
    return "Muy bien. ";
  }
  if (field === "presupuesto" && /fecha|junio|julio|agosto|s[aá]bado|domingo|\d{1,2}\s+de/i.test(msg)) {
    return `${pickTransition(history)} `;
  }
  return "";
}

function emailThanksPrefix(ctx: NaturalQuestionContext): string {
  if (!ctx.afterEmail) return "";
  const nombre = getDisplayName(ctx.extracted, ctx.whatsappName);
  return nombre ? `Gracias por tu correo, ${nombre}. ` : "Gracias por tu correo. ";
}

/** Quita un nombre suelto al inicio para no duplicar "Núria. Núria.". */
function stripLeadingDisplayName(mensaje: string, displayName: string | null | undefined): string {
  const nombre = displayName?.trim();
  if (!nombre) return mensaje;
  const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return mensaje
    .replace(new RegExp(`^${escaped}\\s*[.!,:—\\-]*\\s*`, "i"), "")
    .replace(new RegExp(`^${escaped}\\s+`, "i"), "")
    .trim();
}

/** Tras capturar correo: agradecer y quitar aperturas casuales (Genial, Perfecto…). */
function applyEmailCaptureTone(mensaje: string, ctx: NaturalQuestionContext): string {
  const thanks = emailThanksPrefix(ctx);
  if (!thanks) return mensaje;
  let out = mensaje.trim();
  if (/gracias por tu correo/i.test(out)) return out;
  const nombre = getDisplayName(ctx.extracted, ctx.whatsappName);
  out = out
    .replace(/^(genial|perfecto|excelente|muy bien),?\s+/i, "")
    .replace(/^mucho gusto,?\s+[^.!?]+[.!?]\s*/i, "");
  out = stripLeadingDisplayName(out, nombre);
  return `${thanks}${out}`.trim();
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

  if (!filled.has("Nombre del cliente") && !sanitizeCrmNombre(extracted.nombre)) return "nombre";
  if (!isEmailSatisfied(filled, extracted)) return "correo";

  const hasReq =
    filled.has("Requerimientos o servicios") || isValidRequerimientosValue(extracted.requerimientos_evento);
  const hasInv = filled.has("Número de invitados") || !!extracted.num_invitados;
  const hasZona =
    filled.has("Lugar/dirección del evento") || isUsableDireccionEvento(extracted.direccion_evento);
  const hasFecha = filled.has("Fecha y horario") || !!extracted.fecha_horario?.trim();

  if (!hasTipoEvento(filled, extracted)) return "tipo_evento";
  if (!hasReq) return "requerimientos";
  if (!hasZona) return "zona";
  if (!hasFecha) return "fecha";
  if (!hasInv) return "invitados";
  if (!filled.has("Presupuesto (MXN)") && !hasPresupuestoValue(extracted)) return "presupuesto";
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

  // WhatsApp a menudo trae nombre + apellido: guardar completo en CRM.
  const waName = sanitizeCrmNombre(whatsappDisplayName) ?? sanitizeDisplayName(whatsappDisplayName);
  if (!waName) return false;

  mergedLines.push(`- Nombre del cliente: ${waName} ${WHATSAPP_NOMBRE_NOTE}`);
  filledSet.add("Nombre del cliente");
  return true;
}

/** Lee el nombre capturado en líneas CRM (incluye fallback de WhatsApp). Nombre completo. */
export function parseNombreFromCrmLines(mergedLines: string[]): string | null {
  const line = mergedLines.find((l) => /^-?\s*Nombre del cliente:/i.test(l));
  if (!line) return null;
  const raw = line
    .replace(/^-?\s*Nombre del cliente:\s*/i, "")
    .replace(WHATSAPP_NOMBRE_NOTE, "")
    .trim();
  return sanitizeCrmNombre(raw) ?? sanitizeDisplayName(raw);
}

/** Reconocimiento breve del primer mensaje del cliente (sin pedir otros datos). */
export function buildOpeningAcknowledgment(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string {
  const texts = collectUserTexts(history, currentMessage);
  const userText = texts[texts.length - 1] ?? texts.join(" ");
  const t = userText.toLowerCase();

  // RFQ largo (Alejandra / B2B): reconocer fecha, zona, menús y paquete completo.
  if (isRichQuoteBrief(userText)) {
    return buildRichBriefAcknowledgment(userText);
  }

  // Brief con varios servicios → reconocer la lista completa (no solo el primero).
  const multiServices = parseServicesFromText(userText);
  if (multiServices.length >= 2) {
    return buildMultiServiceAck(multiServices);
  }

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
  // A14929: antes de "me interesa cotizar…", detectar banquetes/catering vago.
  if (isVagueFoodTerm(userText)) {
    return "Para alimentos manejamos banquete, taquiza, brunch o coffee break — ¿cuál te interesa?";
  }
  if (/me\s+interesa\s+cotizar|cotizar\s+para\s+mi\s+evento/i.test(t)) {
    const colonMatch = userText.match(
      /(?:me\s+interesa\s+cotizar|cotizar\s+para\s+mi\s+evento)\s*:\s*(.+)/i
    );
    if (colonMatch) {
      const serviceChunk = colonMatch[1]!.trim().replace(/\.$/, "");
      const services = parseServicesFromText(serviceChunk);
      if (services.length >= 2) {
        return `Vi que necesitas ${formatServicesList(services)}. Te cotizamos todo eso.`;
      }
      if (/coffee\s*break/i.test(serviceChunk) && services.length <= 1) {
        return "Vi que te interesa un coffee break para eventos corporativos.";
      }
      if (/\b(mesas?|sillas?|mobiliario|periquera)\b/i.test(serviceChunk) && services.length <= 1) {
        return "Vi tu solicitud de renta de mesas y sillas para el evento.";
      }
      if (services.length === 1) {
        return `Vi que te interesa cotizar ${services[0]}.`;
      }
      const short = serviceChunk.split(/[,.]/)[0]!.trim();
      if (short.length > 3) return `Vi tu solicitud de ${short}.`;
    }
    const tipo = parseTipoEventoFromText(userText);
    const inv = userText.match(/para\s+(\d+)\s*(?:personas?|invitados?)/i);
    if (tipo) {
      let ack = `Vi tu solicitud para ${tipo}`;
      if (inv) ack += ` para ${inv[1]} personas`;
      return `${ack}.`;
    }
    return "Vi los datos de tu evento en la solicitud.";
  }
  if (isGettingReadyContext(userText)) return "Te ayudo con el catering para el getting ready.";
  // (isVagueFoodTerm se evalúa más arriba, antes de "me interesa cotizar")
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
  if (/expo|stand\s+de\s+caf[eé]|feria|congreso/i.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    return inv
      ? `Te ayudo con el stand de café para tu expo (${inv[1]} personas).`
      : "Te ayudo con el stand de café para tu expo.";
  }
  if (/italian|italia|toscana|toscano|mafia\s+italiana|men[uú]\s+italiano|pastas?|pizzas?|antipasti/i.test(t)) {
    return buildItalianFoodPitch(userText).replace(/\.$/, "");
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
  const userText = collectUserTexts(history, ctx.currentMessage).join(" ");
  const richBrief = isRichQuoteBrief(ctx.currentMessage) || isRichQuoteBrief(userText);
  const multiServices = parseServicesFromText(userText);
  const includeCatalog =
    richBrief || multiServices.length >= 2;

  if (clientAsksLocation(ctx.currentMessage)) {
    const nameQ = pickVariant("nombre", history, ctx.entityId);
    return `${intro}${buildLocationAnswer()} ${nameQ}`.trim();
  }

  if (
    clientMentionsItalianTheme(ctx.currentMessage) ||
    (clientAsksForRecommendations(ctx.currentMessage) && clientMentionsItalianTheme(userText))
  ) {
    const nameQ = pickVariant("nombre", history, ctx.entityId);
    return `${intro}${buildItalianFoodPitch(ctx.currentMessage)} ${nameQ}`.trim();
  }

  const catalogBlock = includeCatalog ? `\n\n${buildPackageCatalogOfferBlock()}` : "";

  if (isFieldSatisfied("nombre", filledSet, ctx.extracted)) {
    const nombre = getDisplayName(ctx.extracted, ctx.whatsappName);
    const pending = getNextPendingField(ctx.extracted, filledSet);
    if (pending === "correo") {
      const correoQ = buildCorreoQuestion(nombre, history, ctx.entityId);
      const body = `${ack}${catalogBlock}\n\n${correoQ}`.trim();
      return withIntro ? `${intro}${body}`.trim() : body;
    }
    if (pending) {
      const greet = nombre ? `Mucho gusto, ${nombre}. ` : "";
      const q = buildNaturalQuestion(pending, ctx);
      const body = `${ack}${catalogBlock}\n\n${greet}${q}`.trim();
      return withIntro ? `${intro}${body}`.trim() : body;
    }
    const body = nombre
      ? `${ack}${catalogBlock}\n\nMucho gusto, ${nombre}.`.trim()
      : `${ack}${catalogBlock}`.trim();
    return withIntro ? `${intro}${body}`.trim() : body;
  }

  const nameQ = pickVariant("nombre", history, ctx.entityId);
  return `${intro}${ack}${catalogBlock}\n\n${nameQ}`.trim();
}

function usesLegacyLucyIntro(mensaje: string): boolean {
  return (
    /te\s+saluda\s+lucy/i.test(mensaje) ||
    /¡?hola,?\s+lead\s*#/i.test(mensaje)
  );
}

/** Campo 1048786 guarda el resumen interno del CRM, no el mensaje WhatsApp al cliente. */
export function isResumenClienteLargo(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (!t || t === "-") return true;
  return (
    /^RESUMEN\s+(DE\s+CONVERSACI[ÓO]N\s+—\s+)?LUCY/i.test(t) ||
    /lo que el cliente quiere:/i.test(t) ||
    /qu[eé]\s+busca el cliente:/i.test(t) ||
    /actualizado (autom[aá]ticamente )?por lucy/i.test(t) ||
    /captura en progreso/i.test(t)
  );
}

/** Texto que no debe usarse como "última respuesta de Lucy" (legacy, resumen CRM, campo vacío). */
export function isLegacyStoredLucyResponse(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (!t || t === "-") return true;
  if (isResumenClienteLargo(t)) return true;
  return usesLegacyLucyIntro(t);
}

export function lastAssistantOutboundFromHistory(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "assistant" || typeof m.content !== "string") continue;
    const text = m.content.trim();
    if (!text || isLegacyStoredLucyResponse(text)) continue;
    return text;
  }
  return null;
}

/** Prioridad: caché en memoria → historial en disco/Kommo → campo CRM (solo si no es resumen). */
export function resolveEffectiveLastLucyResponse(opts: {
  entityId?: string | number | null;
  fullHistory: OpenAI.Chat.ChatCompletionMessageParam[];
  cachedResponse?: string | null;
  crmFieldValue?: string | null;
}): string | null {
  const cached = opts.cachedResponse?.trim();
  if (cached && !isLegacyStoredLucyResponse(cached)) return cached;

  const fromHistory = lastAssistantOutboundFromHistory(opts.fullHistory);
  if (fromHistory) return fromHistory;

  const crm = opts.crmFieldValue?.trim();
  if (crm && !isLegacyStoredLucyResponse(crm)) return crm;

  return null;
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
    const recovered = recoverClienteNombreFromHistory(presHistory, ctx.currentMessage);
    if (recovered) {
      filledSet.add("Nombre del cliente");
      extracted.nombre = recovered;
      return stripRepeatLucyIntro(_mensaje, presHistory, true);
    }
    if (isAffirmativeOnlyMessage(ctx.currentMessage)) {
      return `${pickTransition(presHistory)} ¿Me regalas tu nombre?`;
    }
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && pending !== "nombre") {
      return stripRepeatLucyIntro(_mensaje, presHistory, alreadyStarted);
    }
    if (isTrueFirstTurn || usesLegacyLucyIntro(_mensaje)) {
      return buildFirstInteractionMessage(ctx, true);
    }
    return buildNaturalQuestion("nombre", ctx);
  }

  return stripRepeatLucyIntro(_mensaje, presHistory, alreadyStarted);
}

export function mensajeAsksForField(mensaje: string, field: PendingField): boolean {
  const questionParts = mensaje
    .split(/[.!]\s+/)
    .map((p) => p.trim())
    .filter((p) => p.includes("?"));
  const toCheck = questionParts.length ? questionParts.join(" ") : mensaje;
  if (!toCheck.includes("?")) return false;
  return FIELD_ASK_PATTERNS[field].test(toCheck);
}

export function isFieldSatisfied(
  field: PendingField,
  filledSet: Set<string>,
  extracted: ExtractedData
): boolean {
  switch (field) {
    case "nombre":
      return filledSet.has("Nombre del cliente") || !!sanitizeCrmNombre(extracted.nombre);
    case "correo":
      return isEmailSatisfied(filledSet, extracted);
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
      return (
        filledSet.has("Lugar/dirección del evento") ||
        isUsableDireccionEvento(extracted.direccion_evento)
      );
    case "fecha":
      return filledSet.has("Fecha y horario") || !!extracted.fecha_horario?.trim();
    case "presupuesto":
      return filledSet.has("Presupuesto (MXN)") || hasPresupuestoValue(extracted);
  }
}

/** Pedidos suaves de correo/presupuesto sin "?" (GPT a veces no pone interrogación). */
function softAsksFilledField(mensaje: string, field: PendingField): boolean {
  if (field === "correo") {
    return /(?:regalas?|compartes?|me\s+das|necesito|podr[ií]as?\s+(?:darme|compartir)|pasa(?:rme)?).{0,40}(?:correo|e-?mail)|(?:correo|e-?mail).{0,40}(?:por\s+favor|para\s+(?:enviarte|mandarte|enviar))/i.test(
      mensaje
    );
  }
  if (field === "presupuesto") {
    return /(?:tienen|tienen?\s+alg[uú]n|me\s+compartes?|necesito|cu[aá]l\s+es).{0,40}(?:presupuesto|rango\s+de\s+inversi)|rango\s+de\s+presupuesto/i.test(
      mensaje
    );
  }
  return false;
}

const FIELD_ORDER: PendingField[] = [
  "nombre",
  "correo",
  "tipo_evento",
  "requerimientos",
  "zona",
  "fecha",
  "invitados",
  "presupuesto",
];

/** True si el mensaje pregunta por un dato que ya está capturado. */
export function mensajeAsksForFilledField(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData
): boolean {
  for (const field of FIELD_ORDER) {
    if (!isFieldSatisfied(field, filledSet, extracted)) continue;
    if (mensaje.includes("?") && mensajeAsksForField(mensaje, field)) return true;
    if (softAsksFilledField(mensaje, field)) return true;
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

  // Ofrecimiento temprano: dejar que OpenAI redacte la propuesta por tipo de evento.
  if (
    pending === "requerimientos" &&
    hasTipoEvento(filledSet, extracted) &&
    aiLooksLikeEventServiceOffer(trimmed)
  ) {
    return true;
  }

  if (mensajeLooksOnTrack(trimmed, filledSet, extracted)) return true;

  // Cliente hizo una pregunta o dio contexto útil — priorizar GPT sobre plantilla rígida
  if (currentMessage && currentMessage.trim().length > 12 && trimmed.length > 25) {
    if (clientAskedFreeformQuestion(currentMessage)) return true;
    if (clientMentionsCatering(currentMessage) && !mensajeAsksForField(trimmed, pending)) return true;
    if (justAnsweredReqContext(currentMessage, trimmed)) return true;
  }

  return false;
}

/** Pregunta seca de formulario — NO sirve como ofrecimiento. */
export function isDryRequerimientosAsk(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  if (
    /qu[eé]\s+servicios?\s+(te\s+)?(gustar[ií]a|quieres|deseas|necesitas)\s+(cotizar|para)/i.test(t)
  ) {
    return true;
  }
  if (/plat[ií]came,?\s*[¿?]?\s*qu[eé]\s+tienes\s+pensado/i.test(t) && t.length < 120) {
    return true;
  }
  if (/^[^.!?]{0,40}qu[eé]\s+necesitas\s+para\s+el\s+evento\s*\?/i.test(t) && t.length < 100) {
    return true;
  }
  return false;
}

/** Respuesta de asesora que propone servicios según el evento. */
export function aiLooksLikeEventServiceOffer(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  if (isDryRequerimientosAsk(t)) return false;
  if (t.length < 50) return false;
  const mentionsService =
    /\b(banquete|taquiza|brunch|coffee\s*break|mobiliario|mesa\s+de\s+(dulces|postres)|barra|bebidas?|mixolog|\bdj\b|iluminaci|pista|carpa|bocadillo|canap|catering|pozole|tostadas|paella|parrillada|asado)\b/i.test(
      t
    );
  const invitesChoice =
    /\?/.test(t) ||
    /\b(armando|armar|gustar[ií]a|te\s+late|interes|propon|inclu|cotiz)/i.test(t);
  return mentionsService && invitesChoice;
}

/**
 * Cuando ya hay tipo de evento y falta servicios: preferir redacción OpenAI.
 * Solo cae a plantilla si el modelo no propuso nada útil.
 */
export function preferEventOfferReply(opts: {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  currentMessage?: string;
  entityId?: string | number;
}): string | null {
  const { aiResponse, extracted, filledSet, history, currentMessage, entityId } = opts;
  if (!hasTipoEvento(filledSet, extracted)) return null;
  if (getNextPendingField(extracted, filledSet) !== "requerimientos") return null;
  if (isValidRequerimientosValue(extracted.requerimientos_evento)) return null;

  // Si el cliente ya eligió un servicio concreto, no reemplazar con oferta genérica.
  const msg = currentMessage?.trim() ?? "";
  if (msg) {
    const namedService = !!(findMentionedService(msg) || parsePrimaryService(msg));
    const onlyEventType =
      !!parseTipoEventoFromText(msg) &&
      !namedService &&
      !isServiceRelatedMessage(msg);
    if (!onlyEventType && (namedService || isServiceRelatedMessage(msg))) {
      return null;
    }
  }

  const ai = aiResponse.trim();
  const tipo = extracted.tipo_evento ?? "";

  // Oferta del modelo demasiado corta (ej. solo mobiliario + bebidas + dulces) → ampliar.
  if (aiLooksLikeEventServiceOffer(ai) && isNarrowSocialEventOffer(ai, tipo)) {
    return buildBroadLevel1Offer(tipo);
  }

  if (aiLooksLikeEventServiceOffer(ai) && !responseHasInventedPrice(ai, currentMessage)) {
    return ai;
  }

  // Oferta del modelo enfocada al servicio-evento (pozole, etc.) aunque pregunte invitados.
  const focus = resolveServiceFocusFromText(
    `${extracted.tipo_evento ?? ""} ${currentMessage ?? ""}`
  );
  if (
    focus &&
    ai.length > 40 &&
    new RegExp(focus.serviceHints.map((h) => h.replace(/\s+/g, "\\s+")).join("|"), "i").test(ai) &&
    !responseHasInventedPrice(ai, currentMessage) &&
    !isDryRequerimientosAsk(ai)
  ) {
    return ai;
  }

  // AI vacía o pregunta seca → no devolver dry ask; usar propuesta tipada solo como red de seguridad.
  if (!ai || isDryRequerimientosAsk(ai)) {
    return buildRecommendationsReply(extracted, history, entityId, currentMessage);
  }

  // AI dijo algo útil pero estrecho para evento social → ampliar.
  if (
    ai.length > 40 &&
    !mensajeAsksForFilledField(ai, filledSet, extracted) &&
    isNarrowSocialEventOffer(ai, tipo)
  ) {
    return buildBroadLevel1Offer(tipo);
  }

  // AI dijo algo útil (pregunta abierta no seca) — respetar redacción.
  if (ai.length > 40 && !mensajeAsksForFilledField(ai, filledSet, extracted)) {
    if (!mensajeAsksWrongField(ai, filledSet, extracted) || mensajeAsksForField(ai, "requerimientos")) {
      return ai;
    }
  }
  return null;
}

function justAnsweredReqContext(currentMessage: string, aiResponse: string): boolean {
  if (!clientMentionsCatering(currentMessage) && !isServiceRelatedMessage(currentMessage)) return false;
  return aiResponse.length > 40 && !/^\s*¿/.test(aiResponse);
}

/** Si hay texto útil sin pregunta, añade la pregunta pendiente en lugar de reemplazar todo. */
/** Si el mensaje pregunta el mismo campo dos veces, deja solo la primera. */
function collapseDuplicateFieldQuestions(mensaje: string, field: PendingField): string {
  const blocks = mensaje
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length <= 1) return mensaje.trim();
  let seen = false;
  const kept: string[] = [];
  for (const block of blocks) {
    if (block.includes("?") && FIELD_ASK_PATTERNS[field].test(block)) {
      if (seen) continue;
      seen = true;
    }
    kept.push(block);
  }
  return kept.join("\n\n").trim();
}

function mergeWithPendingQuestion(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData,
  ctx: NaturalQuestionContext
): string {
  const pending = getNextPendingField(extracted, filledSet);
  const base = mensaje.trim();
  if (!pending) {
    // Embudo completo: no devolver vacío al cortar una re-pregunta.
    return base || "Entendido, sin problema. Nuestro equipo te propone opciones según lo que platicamos.";
  }

  if (!base) return buildNaturalQuestion(pending, ctx);

  // Ya pregunta el campo pendiente — no duplicar (A14924: doble "¿qué tipo de evento?").
  if (mensajeAsksForField(base, pending)) {
    return collapseDuplicateFieldQuestions(base, pending);
  }

  // GPT ya respondió bien a una pregunta del cliente — no machacar con plantilla
  if (clientAskedFreeformQuestion(ctx.currentMessage) && base.length > 50) {
    if (base.includes("?") && !mensajeAsksWrongField(mensaje, filledSet, extracted)) return base;
    if (!mensajeAsksForField(base, pending)) return base;
  }

  // Ofrecimiento temprano ya redactado — no anexar «¿qué servicios quieres?».
  if (
    pending === "requerimientos" &&
    hasTipoEvento(filledSet, extracted) &&
    aiLooksLikeEventServiceOffer(base)
  ) {
    return base;
  }

  const nextQ = buildNaturalQuestion(pending, ctx);
  if (
    pending === "requerimientos" &&
    hasTipoEvento(filledSet, extracted) &&
    isDryRequerimientosAsk(nextQ)
  ) {
    return base;
  }
  if (
    base.includes("?") &&
    !mensajeAsksWrongField(mensaje, filledSet, extracted) &&
    !mensajeAsksForFilledField(mensaje, filledSet, extracted)
  ) {
    return collapseDuplicateFieldQuestions(mensaje, pending);
  }
  return collapseDuplicateFieldQuestions(`${base}\n\n${nextQ}`, pending);
}

function textOverlapRatio(a: string, b: string): number {
  const na = a.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (!wordsA.size || !wordsB.size) return 0;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  return shared / Math.max(wordsA.size, wordsB.size);
}

/** Evita enviar al cliente el mismo bloque casi idéntico que un turno anterior. */
function avoidRepeatPreviousReply(
  mensaje: string,
  presHistory: OpenAI.Chat.ChatCompletionMessageParam[]
): string {
  const prev = presHistory
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .map((m) => (m.content as string).trim())
    .filter(Boolean);
  if (prev.length === 0) return mensaje;

  const maxOverlap = Math.max(...prev.map((p) => textOverlapRatio(mensaje, p)));
  const last = prev[prev.length - 1]!;
  if (maxOverlap < 0.68) return mensaje;

  let out = mensaje
    .replace(/^Hola,?\s*soy\s+Lucy[^.]*\.\s*/i, "")
    .replace(TRANSITION_START_PATTERN, pickTransition(presHistory));
  const outOverlap = Math.max(...prev.map((p) => textOverlapRatio(out, p)));
  if (outOverlap < 0.65) return out.trim();

  const questionLine =
    mensaje.split("\n").find((l) => l.includes("?")) ?? mensaje.split("\n").pop();
  const q = questionLine?.trim() || mensaje;
  const qOverlap = Math.max(...prev.map((p) => textOverlapRatio(q, p)));
  if (qOverlap >= 0.72) {
    const pendingLine = mensaje
      .split("\n")
      .filter((l) => l.includes("?"))
      .pop();
    if (pendingLine && textOverlapRatio(pendingLine, last) < 0.65) return pendingLine.trim();
  }
  return q;
}

/** Si ya capturamos un dato, no volver a preguntarlo — pide el siguiente pendiente. */
function redirectIfAskingFilledField(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData,
  ctx: NaturalQuestionContext
): string {
  // Respuestas de catálogo (Incluye / niveles / link) a veces matchean
  // "requerimientos" por la palabra menú — no reemplazar por la siguiente pregunta.
  if (
    /\bincluye\s*:|bodasesor\.com\/catalogos|qu[eé]\s+incluye\s+cada|cu[aá]l nivel prefieres|detalle completo de men[uú]s/i.test(
      mensaje
    )
  ) {
    return mensaje;
  }
  const fields: PendingField[] = [
    "nombre",
    "correo",
    "tipo_evento",
    "requerimientos",
    "invitados",
    "zona",
    "fecha",
    "presupuesto",
  ];
  for (const field of fields) {
    if (!isFieldSatisfied(field, filledSet, extracted)) continue;
    if (!mensajeAsksForField(mensaje, field)) continue;
    const next = getNextPendingField(extracted, filledSet);
    if (next && next !== field) return buildNaturalQuestion(next, ctx);
    const trimmed = mensaje
      .split("\n")
      .filter((line) => !mensajeAsksForField(line, field))
      .join("\n")
      .trim();
    if (trimmed) return trimmed;
  }
  return mensaje;
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

  const isSalesishBody =
    !!ctx.currentMessage &&
    (clientMentionsCatering(ctx.currentMessage) ||
      clientMentionsEntertainment(ctx.currentMessage) ||
      clientMentionsPistaTarima(ctx.currentMessage) ||
      isServiceRelatedMessage(ctx.currentMessage)) &&
    /banquete|taquiza|catering|alimentos|show|animaci|hora\s+loca|entretenimiento|vers[aá]til|pista|tarima|iluminada|anoto/i.test(
      mensaje
    );

  const repeatsFilled = mensajeAsksForFilledField(mensaje, filledSet, extracted);
  const asksWrong = mensajeAsksWrongField(mensaje, filledSet, extracted);

  // Siempre cortar re-pregunta de dato ya capturado (correo, presupuesto, etc.),
  // incluso dentro de una respuesta de venta.
  if (repeatsFilled || asksWrong) {
    log?.warn({ pending, repeatsFilled, asksWrong }, "GUARD: bloqueando repetición — dato ya capturado");
    if (isSalesishBody) {
      const body = mensaje
        .split(/\n+/)
        .filter(
          (line) =>
            !mensajeAsksForFilledField(line, filledSet, extracted) &&
            !(line.includes("?") && mensajeAsksWrongField(line, filledSet, extracted))
        )
        .join("\n")
        .trim();
      // A14929: oferta banquete/taquiza/"¿cuál te interesa?" matchea requerimientos y
      // vaciaba todo el pitch → solo quedaba "¿nombre?". Conservar el cuerpo de venta.
      let kept = body;
      if (!kept && /banquete|taquiza|brunch|coffee\s*break|alimentos/i.test(mensaje)) {
        kept = mensaje
          .replace(/\s*¿\s*cu[aá]l\s+(te\s+interesa|prefieres|variante)[^?]*\?/gi, "")
          .replace(/\?\s*$/g, ".")
          .trim();
      }
      return mergeWithPendingQuestion(kept || mensaje, filledSet, extracted, ctx);
    }
    if (!isInformativeClientAnswer(ctx.currentMessage)) {
      if (!pending) {
        const texts = collectUserTexts(ctx.history ?? [], ctx.currentMessage);
        const pres = findPresupuestoInTexts(texts, ctx.history);
        if (pres && /econ[oó]mic/i.test(pres)) {
          return "Entendido, buscamos opciones económicas. Nuestro equipo te propone alternativas según lo que platicamos.";
        }
        // Ya no falta nada: si GPT re-preguntó un dato lleno, avanzamos a ack corto.
        return (
          mensaje
            .split(/\n+/)
            .filter((line) => !mensajeAsksForFilledField(line, filledSet, extracted))
            .join("\n")
            .trim() ||
          "Entendido, sin problema. Nuestro equipo te propone opciones según lo que platicamos."
        );
      }
      return mergeWithPendingQuestion("", filledSet, extracted, ctx);
    }
  }

  // Respuesta de venta limpia — no forzar plantilla ni re-inyectar menú.
  if (isSalesishBody) {
    return mensaje.trim();
  }

  if (
    pending === "requerimientos" &&
    mensaje.includes("?") &&
    !mensajeMencionaCatalogoServicios(mensaje) &&
    !historyAlreadyHadServicesCatalog(ctx.presentationHistory ?? ctx.history)
  ) {
    mensaje = appendServiciosCatalogoHint(
      mensaje,
      false,
      ctx.presentationHistory ?? ctx.history
    );
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
  const prefix = contextualPrefix(field, ctx.extracted, ctx.currentMessage, history);
  const variant = pickVariant(field, history, ctx.entityId);
  const thanks = emailThanksPrefix(ctx);

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
      return nombre ? `Gracias por tu correo, ${nombre}. ${withHint}` : `Gracias por tu correo. ${withHint}`;
    }
    return prefix ? `${prefix}${withHint}` : withHint;
  }

  if (thanks && (field === "zona" || field === "fecha" || field === "invitados" || field === "presupuesto")) {
    return `${thanks}${variant}`;
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
  const prefix = contextualPrefix("requerimientos", extracted, currentMessage, history);
  const alreadyFollowedUp = history.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      OTRO_SERVICIO_ASK_PATTERN.test(m.content as string)
  );
  const alreadyDumpedMenu = historyAlreadyHadServicesCatalog(history);

  if (service) {
    // Ya preguntamos "¿otro servicio?" o tiramos el menú → no repetir el follow-up.
    if (alreadyFollowedUp || alreadyDumpedMenu) {
      return `${prefix}Queda anotado lo de ${service}.`.trim();
    }
    const idx = variantIndex("requerimientos", history, entityId);
    const followUps = [
      `Además del ${service}, ¿te gustaría cotizar algún otro servicio?`,
      `¿Solo el ${service} o también algo más?`,
      `Perfecto. Con el ${service}, ¿necesitan algún otro servicio?`,
    ];
    return appendServiciosCatalogoHint(
      `${prefix}${followUps[idx % followUps.length]}`,
      true,
      history
    );
  }

  const variant = pickVariant("requerimientos", history, entityId);
  const core = prefix ? `${prefix}${variant}` : variant;
  return appendServiciosCatalogoHint(core, false, history);
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
  const correoCore = pickVariant("correo", history, entityId);
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

  const followUpAlreadyAsked = (history ?? []).some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      OTRO_SERVICIO_ASK_PATTERN.test(m.content as string)
  );
  if (followUpAlreadyAsked) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending) return buildNaturalQuestion(pending, ctx);
  }

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
  const nombre = sanitizeDisplayName(clientName);
  return nombre
    ? `¡Con gusto, ${nombre}! Nuestro equipo ya tiene tus datos para la cotización. Si necesitas algo más, aquí estamos.`
    : "¡Con gusto! Nuestro equipo ya tiene tus datos para la cotización. Si necesitas algo más, aquí estamos.";
}

/** Tras pasar teléfonos / pedir llamada: no cerrar otra vez con plantilla genérica. */
export function buildPostCierreCallbackAck(clientName?: string | null): string {
  const nombre = sanitizeDisplayName(clientName);
  return nombre
    ? `Con gusto, ${nombre}. Un asesor te puede atender por esos números; tu caso ya quedó con el equipo.`
    : "Con gusto. Un asesor te puede atender por esos números; tu caso ya quedó con el equipo.";
}

function lastAssistantWasPhoneAnswer(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  const last = [...history]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  if (!last || typeof last.content !== "string") return false;
  return /55\s*4008\s*0373|56\s*4671\s*0585|l[ií]nea telef[oó]nica/i.test(last.content);
}

/** Bloque de catálogo para paquetes multi-servicio / RFQ (sí se envía el link). */
export function buildPackageCatalogOfferBlock(): string {
  return [
    "Te dejo el catálogo general para que veas montajes, menús y opciones:",
    getCatalogWebHubDeliveryUrl(),
    "",
    CATALOG_OFFER_QUESTION,
  ].join("\n");
}

/** ¿Lucy ya ofreció niveles / precios / catálogo de un servicio en esta conversación? */
export function historyAlreadyOfferedServiceDetail(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  return history.some((m) => {
    if (m.role !== "assistant" || typeof m.content !== "string") return false;
    const t = m.content;
    if (messageOffersCatalogLink(t)) return true;
    if (/manejamos estos niveles|¿cu[aá]l nivel prefieres/i.test(t)) return true;
    if (/\*precio:\*/i.test(t) && /manejamos/i.test(t)) return true;
    // Oferta con precios de niveles (Básico/Tradicional/Premium).
    if (
      /\$\s*\d/.test(t) &&
      /\b(b[aá]sic|tradicional|premium|solo alimentos)\b/i.test(t) &&
      /\b(nivel|manejamos|pp|\/pp|por persona)\b/i.test(t)
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Tras capturar el nombre en un lead con servicio ya conocido (formulario web),
 * ofrecer niveles/precios + pregunta de catálogo ANTES de seguir el embudo (correo…).
 * Cubre A14916 Liliana / Barra de Sushi: antes solo pedía correo y cerraba sin oferta.
 */
export function buildDeferredKnownServiceOffer(opts: {
  extracted: ExtractedData;
  filledSet: Set<string>;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  ctx: NaturalQuestionContext;
  whatsappName?: string | null;
}): string | null {
  const { extracted, filledSet, history, ctx, whatsappName } = opts;
  if (!isFieldSatisfied("nombre", filledSet, extracted)) return null;
  if (!isValidRequerimientosValue(extracted.requerimientos_evento)) return null;
  if (historyAlreadyOfferedServiceDetail(history)) return null;

  const svc = extracted.requerimientos_evento!.trim();
  const detail = buildCatalogServiceDetailAnswer(svc);
  if (!detail || !/nivel|precio|manejamos|\$/i.test(detail)) return null;

  const nombre = getDisplayName(extracted, whatsappName);
  const intro = nombre ? `Perfecto, ${nombre}.` : "Perfecto.";
  let body = `${intro} ${detail}`.trim();
  if (!messageOffersCatalogLink(body)) {
    body = `${body}\n\n${CATALOG_OFFER_QUESTION}`;
  }

  const pending = getNextPendingField(extracted, filledSet);
  if (pending && pending !== "requerimientos" && pending !== "nombre") {
    const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet });
    if (nextQ && !body.includes(nextQ)) {
      body = `${body}\n\n${nextQ}`;
    }
  }
  return body;
}

/**
 * Cierre estándar + ofrecimiento final de complementos.
 * En paquetes multi-servicio incluye link de catálogo (el cliente ya pidió propuestas).
 */
export function buildStandardClosingMessage(
  serviciosPedidos: string | null | undefined,
  clientName?: string | null
): string {
  const asesor = advisorLabelForClient(clientName);
  const handoff =
    asesor === "nuestro equipo"
      ? "Le paso estos datos a nuestro equipo para que te arme una cotización personalizada."
      : `Le paso estos datos a ${asesor} para que te arme una cotización personalizada.`;
  const servicioRaw = serviciosPedidos?.trim() || "";
  // Solo listar servicios concretos parseables — evita "además de la taquiza" inventada (A14929).
  // "banquete / taquiza" es alternativa (1 pedido), no paquete multi-servicio con catálogo.
  const isSlashFoodAlias = /banquete\s*\/\s*taquiza/i.test(servicioRaw);
  const parsed = parseServicesFromText(servicioRaw);
  const servicio = isSlashFoodAlias
    ? "banquete / taquiza"
    : parsed.length > 0
      ? parsed.slice(0, 4).join(", ")
      : isValidRequerimientosValue(servicioRaw) &&
          !/banquetes?\s+o\s+catering|servicio\s+de\s+banquetes?/i.test(servicioRaw)
        ? servicioRaw
        : "";
  const serviceParts = servicio
    ? servicio.split(/,\s*/).map((s) => s.trim()).filter(Boolean)
    : [];
  const multiPackage = !isSlashFoodAlias && serviceParts.length >= 2;
  const complements = servicio
    ? `Si quieres sumar algo además de ${servicio} (alimentos, mobiliario, DJ o iluminación), dímelo.`
    : `Si quieres sumar alimentos, mobiliario, DJ o iluminación, dímelo.`;

  const parts = [`Perfecto, ya tengo todo. ${handoff}`, "", complements];
  if (multiPackage) {
    parts.push("", buildPackageCatalogOfferBlock());
  }
  parts.push("", "Si necesitas algo más, con gusto te apoyo.");
  return parts.join("\n");
}

/** Ack de paquete + catálogo (multi-servicio o RFQ). */
export function buildMultiServicePackageReply(
  services: string[],
  sourceText?: string
): string {
  const ack =
    sourceText && isRichQuoteBrief(sourceText)
      ? buildRichBriefAcknowledgment(sourceText)
      : buildMultiServiceAck(services);
  return `${ack}\n\n${buildPackageCatalogOfferBlock()}`;
}

function isInformativeClientAnswer(currentMessage?: string): boolean {
  if (!currentMessage?.trim()) return false;
  if (parseWebLeadBrief(currentMessage)) return true;
  if (/me\s+interesa\s+cotizar|cotizar\s+para\s+mi\s+evento/i.test(currentMessage)) return true;
  return (
    clientAsksLocation(currentMessage) ||
    clientMentionsItalianTheme(currentMessage) ||
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
    clientAsksLocation(message) ||
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

/** Pedido mínimo (ej. solo mesa y sillas) → ofrecer 1-2 complementos UNA vez. */
const MINIMAL_SERVICE_PATTERN =
  /\b(solo\s+)?(mesas?\s+y\s+sillas?|sillas?\s+y\s+mesas?|renta\s+de\s+(mesas?|sillas?)|solo\s+(mesas?|sillas?|mobiliario))\b/i;

function historyAlreadyOfferedComplements(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  return history.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      /si\s+te\s+parece,?\s+tambi[eé]n\s+podemos|como\s+complemento\s+suele\s+ir|te\s+sugerir[ií]a\s+(tambi[eé]n|agregar)|opcional(es)?:\s*(mantel|postre|bebida)/i.test(
        m.content as string
      )
  );
}

export function looksLikeMinimalServiceAsk(text: string | null | undefined): boolean {
  return !!text && MINIMAL_SERVICE_PATTERN.test(text);
}

/** Ofrece 1-2 complementos acordes al evento, sin forzar. Null si ya se ofreció o no aplica. */
export function buildSoftComplementOffer(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string | null {
  if (historyAlreadyOfferedComplements(history)) return null;
  const req = `${extracted.requerimientos_evento ?? ""} ${currentMessage ?? ""}`;
  if (!looksLikeMinimalServiceAsk(req)) return null;

  const tipo = (extracted.tipo_evento ?? "").toLowerCase();
  const inv = extracted.num_invitados ?? 0;

  if (/cumple|infantil|bautizo|baby/i.test(tipo) || (inv > 0 && inv <= 30)) {
    return (
      "Lo anoto (mesa y sillas). Si te parece, también podemos sumar mantelería o mesa de postres, " +
      "y bebidas — es opcional, solo si te late."
    );
  }
  if (/boda|xv|quince/i.test(tipo)) {
    return (
      "Perfecto, mesa y sillas anotadas. Como complemento suele ir mantelería y, si quieres, " +
      "barra de bebidas o iluminación — dime si te interesa alguno."
    );
  }
  return (
    "Anoto mesa y sillas. Si quieres, como opcional: mantelería o bebidas para redondear el montaje — " +
    "sin compromiso."
  );
}

function buildImageActionReply(
  currentMessage: string | undefined,
  extracted: ExtractedData,
  filledSet: Set<string>,
  ctx: NaturalQuestionContext
): string | null {
  const action = extractImageClientReply(currentMessage);
  if (!action) return null;
  const intent = extractImageIntent(currentMessage);
  // Comprobante: thank + follow-up del equipo; no empujar captura pesada en el mismo turno.
  if (intent === "comprobante_pago") {
    return action;
  }
  const pending = getNextPendingField(extracted, filledSet);
  if (pending && !isFieldSatisfied(pending, filledSet, extracted)) {
    const nextQ = buildNaturalQuestion(pending, ctx);
    if (nextQ && !mensajeAsksForField(action, pending)) {
      return `${action} ${nextQ}`;
    }
  }
  return action;
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

function buildNameMismatchReplyIfNeeded(
  currentMessage: string | undefined,
  extracted: ExtractedData,
  filledSet: Set<string>,
  whatsappDisplayName: string | null | undefined,
  lastAskedField: ReturnType<typeof inferLucyAskedField>
): string | null {
  if (
    !currentMessage ||
    isFieldSatisfied("nombre", filledSet, extracted) ||
    isGreetingOnlyMessage(currentMessage) ||
    isLikelyNotPersonNameMessage(currentMessage) ||
    isQuoteIntentMessage(currentMessage) ||
    clientAsksCompanyIdentity(currentMessage) ||
    isAmbiguousShortNumber(currentMessage, { lastAskedField })
  ) {
    return null;
  }

  const existingNombre =
    sanitizeCrmNombre(extracted.nombre) ?? sanitizeCrmNombre(whatsappDisplayName) ?? null;
  const soyMatch = currentMessage.trim().match(/^\s*(?:soy|me\s+llamo|c[oó]mo)\s+(.+)$/i);
  const rawIncoming = soyMatch ? soyMatch[1]!.trim() : currentMessage.trim();
  const incomingNombre = sanitizeCrmNombre(rawIncoming) ?? sanitizeDisplayName(rawIncoming);
  if (
    existingNombre &&
    incomingNombre &&
    !namesAreLikelySamePerson(existingNombre, incomingNombre) &&
    rawIncoming.length < 50 &&
    !/@/.test(rawIncoming) &&
    !isLikelyNotPersonNameMessage(rawIncoming)
  ) {
    // Preferir no acortar "Omar Ponce" → preguntar con el nombre más completo.
    const askExisting = isNombreMoreComplete(existingNombre, incomingNombre)
      ? existingNombre
      : existingNombre;
    return buildNameConfirmationPrompt(askExisting, incomingNombre);
  }
  return null;
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

  syncFilledFromExtracted(filledSet, extracted);

  // Salida temprana: "qué incluye / descripción de cada nivel" no debe perderse
  // por redirect a zona ni anti-repeat de embudo.
  if (clientAsksInclusion(currentMessage) && !cierreYaEnviado) {
    const serviceHint =
      (isValidRequerimientosValue(extracted.requerimientos_evento)
        ? extracted.requerimientos_evento
        : null) ||
      parsePrimaryService(collectUserTexts(presHistory, currentMessage).join(" ")) ||
      findMentionedService(collectUserTexts(presHistory, currentMessage).join(" "));
    const inclusionAnswer = resolveCatalogInclusionReply(
      currentMessage ?? "",
      serviceHint
    );
    if (inclusionAnswer) {
      const pending = getNextPendingField(extracted, filledSet);
      const emailOkEarly = isEmailSatisfied(filledSet, extracted);
      const withNext =
        pending && emailOkEarly && pending !== "requerimientos"
          ? `${inclusionAnswer}\n\n${buildNaturalQuestion(pending, ctx)}`
          : inclusionAnswer;
      log?.info({ entityId, serviceHint }, "GUARD: inclusiones — return temprano");
      return normalizeAdvisorReferences(
        withNext,
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
  }

  applyPresupuestoWaiver(
    filledSet,
    [],
    collectUserTexts(presHistory, currentMessage),
    presHistory
  );

  // "4 salas" ≠ 4 invitados; "Luxor Rosa" ≠ ubicación.
  {
    const blob = collectUserTexts(presHistory, currentMessage).join(" ");
    if (
      extracted.num_invitados != null &&
      new RegExp(
        `\\b${extracted.num_invitados}\\s*(salas?|mesas?|sillas?|carpas?|pistas?|tarimas?)\\b`,
        "i"
      ).test(blob)
    ) {
      extracted.num_invitados = null;
      filledSet.delete("Número de invitados");
    }
    if (
      extracted.direccion_evento &&
      (isLikelyProductNameNotLocation(extracted.direccion_evento) ||
        (/\bsala\s*:/i.test(blob) &&
          new RegExp(
            extracted.direccion_evento.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i"
          ).test(blob)))
    ) {
      const sala = parseSalaProductFromText(blob);
      if (sala) {
        extracted.requerimientos_evento = mergeServiceRequirements(
          extracted.requerimientos_evento,
          sala,
          6
        );
        if (extracted.requerimientos_evento) filledSet.add("Requerimientos o servicios");
      }
      extracted.direccion_evento = null;
      filledSet.delete("Lugar/dirección del evento");
    }
  }

  // Captura canónica: servicios del mensaje + historial (CRM).
  // La RESPUESTA multi-servicio solo mira el mensaje actual (A14924: "cumpleaños"
  // no debe reenviar el paquete pizza/pasta del turno anterior).
  const reqBeforeServiceMerge = extracted.requerimientos_evento?.trim() ?? "";
  const userBlobForServices = collectUserTexts(presHistory, currentMessage).join(" ");
  const servicesFromCurrentMessage = parseServicesFromText(currentMessage ?? "");
  const servicesFromTurn = parseServicesFromText(
    `${currentMessage ?? ""} ${userBlobForServices}`
  );
  if (servicesFromTurn.length > 0 && !isVagueFoodTerm(currentMessage)) {
    const mergeMax =
      isRichQuoteBrief(currentMessage) || servicesFromTurn.length >= 4 ? 8 : 6;
    const mergedReq = mergeServiceRequirements(
      extracted.requerimientos_evento,
      servicesFromTurn.join(", "),
      mergeMax
    );
    if (mergedReq) {
      extracted.requerimientos_evento = mergedReq;
      filledSet.add("Requerimientos o servicios");
    }
  }
  const salaTurn = parseSalaProductFromText(currentMessage ?? "");
  if (salaTurn) {
    extracted.requerimientos_evento = mergeServiceRequirements(
      extracted.requerimientos_evento,
      salaTurn,
      6
    );
    if (extracted.requerimientos_evento) filledSet.add("Requerimientos o servicios");
  }

  // Tras un menú / "¿otro servicio?", si el cliente ya nombró algo, no reabrir requisitos.
  if (
    !filledSet.has("Requerimientos o servicios") &&
    historyAlreadyHadServicesCatalog(presHistory)
  ) {
    const userBlob = collectUserTexts(presHistory, currentMessage).join(" ");
    const allMentioned = parseServicesFromText(userBlob);
    const mentioned =
      (allMentioned.length > 0 ? allMentioned.join(", ") : null) ||
      findMentionedService(userBlob) ||
      (isValidRequerimientosValue(extracted.requerimientos_evento)
        ? extracted.requerimientos_evento
        : null) ||
      (clientMentionsPistaTarima(currentMessage) || mentionsNoListedPriceService(currentMessage)
        ? (currentMessage ?? "").trim().slice(0, 80)
        : null);
    if (mentioned || isServiceRelatedMessage(currentMessage) || isValidRequerimientosValue(extracted.requerimientos_evento)) {
      filledSet.add("Requerimientos o servicios");
      if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
        extracted.requerimientos_evento = mentioned || "servicios solicitados";
      }
    }
  }

  const pendingBeforeClose = getNextPendingField(extracted, filledSet);
  const trulyReadyForClosing = readyForClosing && !pendingBeforeClose;

  if (
    trulyReadyForClosing &&
    !cierreYaEnviado &&
    !requerimientosNeedsFollowUp(extracted, filledSet)
  ) {
    return normalizeAdvisorReferences(
      buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      ),
      extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
    );
  }

  const justGaveEmail = clientJustGaveEmail(history, currentMessage);
  const justAnsweredReq = clientJustAnsweredRequerimientosQuestion(history, currentMessage);
  const emailOk = isEmailSatisfied(filledSet, extracted);
  const needsNextStep = emailOk && !trulyReadyForClosing && !cierreYaEnviado;

  // Cuando ya se puede cerrar y los requerimientos ya son válidos, no re-abrir
  // la venta (show/comida/pista) por una simple palabra clave repetida — solo
  // si el cliente hace una pregunta real (con "?") dejamos pasar la respuesta de venta.
  const readyToCloseAndReqDone =
    trulyReadyForClosing && !cierreYaEnviado && !requerimientosNeedsFollowUp(extracted, filledSet);
  const allowSalesReplyOverride =
    !readyToCloseAndReqDone || (currentMessage?.includes("?") ?? false);
  const mentionedServiceNow = currentMessage ? findMentionedService(currentMessage) : null;
  // Solo "ya capturado" si venía de turnos previos — no por el merge de este mismo turno
  // (si no, se salta el ack de venta y solo queda la siguiente pregunta del embudo).
  const serviceAlreadyCaptured =
    !!mentionedServiceNow &&
    !!reqBeforeServiceMerge &&
    reqBeforeServiceMerge.toLowerCase().includes(mentionedServiceNow.toLowerCase());
  // El follow-up "¿algún otro servicio?" solo se pregunta una vez — si ya aparece
  // en el historial, no se vuelve a preguntar (evita el bucle infinito).
  const requerimientosFollowUpAlreadyAsked = historyAlreadyHadServicesCatalog(presHistory);

  const lastAssistantMsg = [...presHistory]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  const lastAskedField = lastAssistantMsg
    ? inferLucyAskedField(lastAssistantMsg.content as string)
    : null;

  // Lead formulario (sushi, barras, etc.): tras el nombre, ofrecer niveles+catálogo
  // antes de correo — evita A14916 (embudo completo sin nunca ofertar).
  const deferredKnownServiceOffer =
    !cierreYaEnviado &&
    lastAskedField === "nombre" &&
    isFieldSatisfied("nombre", filledSet, extracted) &&
    !clientAsksInclusion(currentMessage) &&
    !clientAsksPrice(currentMessage) &&
    !clientAsksForCatalog(currentMessage) &&
    !clientAffirmsCatalogOffer(
      currentMessage,
      lastAssistantMsg && typeof lastAssistantMsg.content === "string"
        ? (lastAssistantMsg.content as string)
        : null
    )
      ? buildDeferredKnownServiceOffer({
          extracted,
          filledSet,
          history: presHistory,
          ctx,
          whatsappName: whatsappDisplayName,
        })
      : null;

  const nameMismatchReply = buildNameMismatchReplyIfNeeded(
    currentMessage,
    extracted,
    filledSet,
    whatsappDisplayName,
    lastAskedField
  );

  let mensaje: string;
  let appliedSalesReply = false;
  let appliedDirectReply = false;

  if (cierreYaEnviado && clientAsksPhone(currentMessage)) {
    mensaje = `${buildPhoneAnswer()}\n\nUn asesor te puede atender por ahí; tu caso ya quedó con el equipo.`;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: post-cierre — cliente pidió llamada/teléfonos");
  } else if (
    cierreYaEnviado &&
    clientSaysThanks(currentMessage) &&
    lastAssistantWasPhoneAnswer(presHistory)
  ) {
    mensaje = buildPostCierreCallbackAck(extracted.nombre);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: post-cierre — gracias tras pedir llamada");
  } else if (
    cierreYaEnviado &&
    !clientDeclinesMoreServices(currentMessage) &&
    !clientSaysThanks(currentMessage) &&
    (clientAddsToQuote(currentMessage) ||
      (parseServicesFromText(currentMessage ?? "").length >= 1 &&
        !isRichQuoteBrief(currentMessage) &&
        /\b(queremos|quisiera|sumamos|adem[aá]s|tambi[eé]n|helado|frutas?|crepas?)\b/i.test(
          currentMessage ?? ""
        )))
  ) {
    // Lista corta post-cierre ("helado, crepas y frutas") — anotar, NO re-mandar niveles.
    const services = parseServicesFromText(currentMessage ?? "");
    const list =
      services.length > 0
        ? formatServicesList(services)
        : (currentMessage ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
    const nombre = getDisplayName(extracted, whatsappDisplayName);
    mensaje = nombre
      ? `Perfecto, ${nombre}. Anoto ${list} para que el equipo lo sume a tu cotización. ¿Algo más que quieras agregar?`
      : `Perfecto. Anoto ${list} para que el equipo lo sume a tu cotización. ¿Algo más que quieras agregar?`;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: post-cierre — servicios adicionales (ack corto)");
  } else if (
    cierreYaEnviado &&
    !clientDeclinesMoreServices(currentMessage) &&
    !clientSaysThanks(currentMessage) &&
    (isRichQuoteBrief(currentMessage) ||
      parseServicesFromText(currentMessage ?? "").length >= 2)
  ) {
    // RFQ largo post-cierre (brief completo), no una lista corta de extras.
    const pkg = buildMultiServicePackageReply(
      parseServicesFromText(currentMessage ?? ""),
      currentMessage
    );
    const nombre = getDisplayName(extracted, whatsappDisplayName);
    const distributorNote = clientAsksDistributorPricing(currentMessage)
      ? "\n\nEl precio de mayoreo lo confirma el equipo; no te paso un precio de lista suelto."
      : "";
    mensaje = nombre
      ? `${pkg}${distributorNote}\n\nPerfecto, ${nombre}. Actualizo tu cotización con esto. ¿Algo más que quieras agregar?`
      : `${pkg}${distributorNote}\n\nActualizo tu cotización con esto. ¿Algo más que quieras agregar?`;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: post-cierre — RFQ/paquete completo (no SKU suelto)");
  } else if (
    cierreYaEnviado &&
    !clientDeclinesMoreServices(currentMessage) &&
    !clientSaysThanks(currentMessage) &&
    isServiceRelatedMessage(currentMessage) &&
    currentMessage?.trim()
  ) {
    // Post-cierre: anotar sin re-dump de niveles/precios (A14918 helado+crepas+frutas).
    const services = parseServicesFromText(currentMessage);
    const list =
      services.length > 0
        ? formatServicesList(services)
        : currentMessage.trim().replace(/\s+/g, " ").slice(0, 80);
    const nombre = getDisplayName(extracted, whatsappDisplayName);
    mensaje = nombre
      ? `Perfecto, ${nombre}. Anoto ${list} para que el equipo lo sume a tu cotización. ¿Algo más que quieras agregar?`
      : `Perfecto. Anoto ${list} para que el equipo lo sume a tu cotización. ¿Algo más que quieras agregar?`;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: post-cierre — servicio adicional (ack corto, sin niveles)");
  } else if (
    cierreYaEnviado &&
    (clientSaysThanks(currentMessage) || clientDeclinesMoreServices(currentMessage))
  ) {
    mensaje = buildPostCierreThanksReply(extracted.nombre);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: post-cierre — agradecimiento o sin más que agregar");
  } else if (clientAsksIfCompanyEmailCorrect(currentMessage)) {
    mensaje = buildCompanyEmailConfirmReply();
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: cliente preguntó por correo de Bodasesor");
  } else if (clientAsksCompanyIdentity(currentMessage)) {
    const knownName =
      sanitizeCrmNombre(extracted.nombre) ??
      sanitizeCrmNombre(whatsappDisplayName) ??
      sanitizeDisplayName(whatsappDisplayName);
    mensaje = buildCompanyIdentityReply(knownName);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: cliente preguntó si es Cap&Bara/Bodasesor");
  } else if (
    clientAsksForCatalog(currentMessage) ||
    clientAffirmsCatalogOffer(
      currentMessage,
      lastAssistantMsg && typeof lastAssistantMsg.content === "string"
        ? (lastAssistantMsg.content as string)
        : null
    )
  ) {
    const wantFull = clientWantsFullCatalog(currentMessage);
    const hintParts: string[] = [];
    if (extracted.requerimientos_evento?.trim()) hintParts.push(extracted.requerimientos_evento);
    if (mentionedServiceNow) hintParts.push(mentionedServiceNow);
    if (
      lastAssistantMsg &&
      typeof lastAssistantMsg.content === "string" &&
      messageOffersCatalogLink(lastAssistantMsg.content as string)
    ) {
      hintParts.push(lastAssistantMsg.content as string);
    }
    const historyHint = [
      ...presHistory
        .filter((m) => m.role === "user" && typeof m.content === "string")
        .slice(-4)
        .map((m) => m.content as string),
      currentMessage ?? "",
    ]
      .join(" ")
      .trim();
    mensaje = buildCatalogWebLinkReply({
      query: wantFull ? "catálogo general" : historyHint || (currentMessage ?? ""),
      wantFull,
      serviceHint: hintParts.join(" ") || null,
    });
    appliedDirectReply = true;
    log?.info({ entityId, wantFull }, "GUARD: cliente pidió catálogo web — link del Sheet");
  } else if (
    isCatalogLevelSelection(
      currentMessage,
      lastAssistantMsg && typeof lastAssistantMsg.content === "string"
        ? (lastAssistantMsg.content as string)
        : null
    )
  ) {
    const nivelMap: Record<string, string> = {
      "1": "basica",
      "2": "tradicional",
      "3": "premium",
      basica: "basica",
      básica: "basica",
      tradicional: "tradicional",
      premium: "premium",
    };
    const key = currentMessage!.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    const nivel = nivelMap[key] ?? key;
    const hint = extracted.requerimientos_evento ?? "barra de bebidas";
    const detail = buildCatalogServiceDetailAnswer(`${hint} ${nivel}`);
    mensaje =
      detail ??
      `Perfecto, anoto *${nivel}* para tu cotización. Nuestro equipo te confirma el detalle y precio.`;
    appliedDirectReply = true;
    log?.info({ entityId, nivel }, "GUARD: selección de nivel de catálogo");
  } else if (isAmbiguousShortNumber(currentMessage, { lastAskedField })) {
    mensaje = "¿Te refieres a 5 invitados o al día 5 del mes?";
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: número ambiguo — pedir aclaración");
  } else if (
    currentMessage &&
    (() => {
      const pendingEmail = filterClientEmail(parseCorreoFromText(currentMessage));
      return (
        !!pendingEmail &&
        !looksLikeValidClientEmail(pendingEmail) &&
        !filledSet.has("Correo electrónico") &&
        !filledSet.has(EMAIL_WAIVED_LABEL)
      );
    })()
  ) {
    const pendingEmail = filterClientEmail(parseCorreoFromText(currentMessage))!;
    mensaje = buildEmailConfirmationPrompt(pendingEmail);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: correo sospechoso — pedir confirmación");
  } else if (nameMismatchReply) {
    mensaje = nameMismatchReply;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: nombre distinto al del contacto — confirmar");
  } else if (deferredKnownServiceOffer) {
    mensaje = deferredKnownServiceOffer;
    appliedSalesReply = true;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: servicio conocido — oferta niveles/catálogo tras nombre");
  } else if (extractImageClientReply(currentMessage)) {
    const imageReply = buildImageActionReply(currentMessage, extracted, filledSet, ctx);
    mensaje = imageReply ?? extractImageClientReply(currentMessage)!;
    appliedDirectReply = true;
    log?.info(
      { entityId, intent: extractImageIntent(currentMessage) },
      "GUARD: imagen accionable — respuesta al cliente"
    );
  } else if (
    looksLikeImageInternalSummary(aiResponse) &&
    (/imagen|foto|montaje|comprobante/i.test(currentMessage ?? "") ||
      /\[Imagen/i.test(currentMessage ?? ""))
  ) {
    const fromMarkers = extractImageClientReply(currentMessage);
    mensaje =
      fromMarkers ||
      "Recibí tu imagen. ¿Me confirmas qué te gustaría de esta foto para tu evento?";
    appliedDirectReply = true;
    log?.warn({ entityId }, "GUARD: bloqueó resumen interno de imagen — respuesta al cliente");
  } else if (
    (forceFirstPresentation || isFirstLucyReply(presHistory)) &&
    !conversationAlreadyStarted(filledSet, presHistory) &&
    !!parseWebLeadBrief(currentMessage ?? "")
  ) {
    mensaje = buildFirstInteractionMessage(ctx, true);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: primer mensaje — brief web con datos del formulario");
  } else if (clientAsksToRereadBrief(currentMessage) && !cierreYaEnviado) {
    const blob = collectUserTexts(presHistory, currentMessage).join(" ");
    const services = parseServicesFromText(
      `${blob} ${extracted.requerimientos_evento ?? ""}`
    );
    const ack =
      isRichQuoteBrief(blob) || isRichQuoteBrief(currentMessage)
        ? buildRichBriefAcknowledgment(blob || (currentMessage ?? ""))
        : buildMultiServiceAck(
            services.length
              ? services
              : parseServicesFromText(extracted.requerimientos_evento ?? "")
          );
    mensaje = mergeWithPendingQuestion(
      `Claro, lo reviso con calma.\n\n${ack}\n\n${buildPackageCatalogOfferBlock()}`,
      filledSet,
      extracted,
      ctx
    );
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: cliente pidió releer especificaciones — ack completo + catálogo");
  } else if (
    allowSalesReplyOverride &&
    // Solo servicios del MENSAJE ACTUAL (no historial) — A14924: "cumpleaños" no re-dump.
    (servicesFromCurrentMessage.length >= 2 || isRichQuoteBrief(currentMessage)) &&
    !cierreYaEnviado &&
    // Pregunta puntual (carpas/pista/"¿cuentan con…?") NO es un RFQ multi-servicio.
    !clientAsksServiceInfo(currentMessage) &&
    !clientMentionsCarpas(currentMessage) &&
    !clientMentionsPistaTarima(currentMessage) &&
    // Show / MC / hora loca → rama de entretenimiento (manda catálogo propio).
    !clientMentionsEntertainment(currentMessage) &&
    // Primer turno sin nombre: buildFirstInteractionMessage ya reconoce la lista + intro + catálogo.
    !(
      (forceFirstPresentation || isFirstLucyReply(presHistory)) &&
      !conversationAlreadyStarted(filledSet, presHistory) &&
      !isFieldSatisfied("nombre", filledSet, extracted)
    )
  ) {
    // Brief con múltiples servicios / RFQ: reconocer TODOS + enviar catálogo.
    const packageServices =
      servicesFromCurrentMessage.length >= 2
        ? servicesFromCurrentMessage
        : servicesFromTurn;
    const packageReply = buildMultiServicePackageReply(
      packageServices,
      currentMessage ?? collectUserTexts(presHistory, currentMessage).join(" ")
    );
    const aiIsUselessAck =
      /ya\s+lo\s+tengo\s+anotado|perfecto,?\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]+\.?$/i.test(
        aiResponse.trim()
      ) || aiResponse.trim().length < 40;
    if (shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage) && !aiIsUselessAck) {
      const aiAlreadyLists =
        packageServices.filter((s) =>
          aiResponse.toLowerCase().includes(s.toLowerCase().split(/\s+/)[0]!)
        ).length >= Math.min(2, packageServices.length);
      const aiHasCatalog = /bodasesor\.com\/catalogos|cat[aá]logo/i.test(aiResponse);
      mensaje = aiAlreadyLists && aiHasCatalog
        ? mergeWithPendingQuestion(aiResponse, filledSet, extracted, ctx)
        : mergeWithPendingQuestion(
            `${packageReply}\n\n${aiAlreadyLists ? "" : aiResponse}`.trim(),
            filledSet,
            extracted,
            ctx
          );
    } else {
      mensaje = mergeWithPendingQuestion(
        `${pickTransition(presHistory)} ${packageReply}`,
        filledSet,
        extracted,
        ctx
      );
    }
    appliedDirectReply = true;
    log?.info(
      { entityId, services: packageServices.length },
      "GUARD: brief multi-servicio — lista completa + catálogo"
    );
  } else if (
    allowSalesReplyOverride &&
    isVagueFoodTerm(currentMessage) &&
    !clientAsksForRecommendations(currentMessage)
  ) {
    mensaje = buildVagueFoodOptionsReply(extracted, history, currentMessage, entityId);
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: término vago de comida — ofrecer opciones");
  } else if (
    preferEventOfferReply({
      aiResponse,
      extracted,
      filledSet,
      history: presHistory,
      currentMessage,
      entityId,
    })
  ) {
    mensaje = preferEventOfferReply({
      aiResponse,
      extracted,
      filledSet,
      history: presHistory,
      currentMessage,
      entityId,
    })!;
    appliedDirectReply = true;
    log?.info({ entityId, tipo: extracted.tipo_evento }, "GUARD: ofrecimiento temprano — redacción OpenAI");
  } else if (
    (forceFirstPresentation || isFirstLucyReply(presHistory)) &&
    !conversationAlreadyStarted(filledSet, presHistory) &&
    clientMentionsItalianTheme(currentMessage) &&
    !isFieldSatisfied("nombre", filledSet, extracted)
  ) {
    mensaje = buildFirstInteractionMessage(ctx, true);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: primer mensaje — temática italiana");
  } else if (
    (forceFirstPresentation || isFirstLucyReply(presHistory)) &&
    !conversationAlreadyStarted(filledSet, presHistory) &&
    isRichQuoteBrief(currentMessage) &&
    !isFieldSatisfied("nombre", filledSet, extracted)
  ) {
    mensaje = buildFirstInteractionMessage(ctx, true);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: primer mensaje — RFQ largo (ack + catálogo + nombre)");
  } else if (
    currentMessage &&
    detectPresupuestoRefusal(currentMessage) &&
    !isRichQuoteBrief(currentMessage)
  ) {
    if (!filledSet.has("Presupuesto (MXN)")) {
      applyPresupuestoWaiver(
        filledSet,
        [],
        collectUserTexts(presHistory, currentMessage),
        presHistory
      );
    }
    const pending = getNextPendingField(extracted, filledSet);
    if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
    } else if (pending) {
      mensaje = `Sin problema, lo dejamos por definir. ${buildNaturalQuestion(pending, ctx)}`;
    } else {
      mensaje =
        "Sin problema, lo dejamos por definir. Nuestro equipo te propone opciones según lo que platicamos.";
    }
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: cliente sin presupuesto — waiver directo");
  } else if (
    (forceFirstPresentation || isFirstLucyReply(presHistory)) &&
    !conversationAlreadyStarted(filledSet, presHistory) &&
    isServiceRelatedMessage(currentMessage) &&
    (currentMessage?.includes("?") ?? false) &&
    !clientAsksForRecommendations(currentMessage) &&
    !clientAsksLocation(currentMessage) &&
    !isFieldSatisfied("nombre", filledSet, extracted)
  ) {
    mensaje = `${LUCY_INTRO} ${buildGuardServiceAck(currentMessage)} ${pickVariant("nombre", presHistory, entityId)}`;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: servicio consultivo en primer turno");
  } else if (
    (forceFirstPresentation || isFirstLucyReply(presHistory)) &&
    !conversationAlreadyStarted(filledSet, presHistory) &&
    !isFieldSatisfied("nombre", filledSet, extracted)
  ) {
    mensaje = buildFirstInteractionMessage(ctx, true);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: primer mensaje — presentación Lucy + nombre (sin oferta)");
  } else if (
    (justAnsweredReq || looksLikeMinimalServiceAsk(currentMessage)) &&
    !cierreYaEnviado &&
    isFieldSatisfied("nombre", filledSet, extracted) &&
    !clientMentionsEntertainment(currentMessage) &&
    buildSoftComplementOffer(extracted, presHistory, currentMessage)
  ) {
    const soft = buildSoftComplementOffer(extracted, presHistory, currentMessage)!;
    const pending = getNextPendingField(extracted, filledSet);
    const nextQ =
      pending && pending !== "requerimientos" ? buildNaturalQuestion(pending, ctx) : null;
    mensaje = nextQ ? `${soft} ${nextQ}` : soft;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: pedido mínimo — ofrecer complementos una vez");
  } else if (clientAsksLocation(currentMessage) && !isFieldSatisfied("nombre", filledSet, extracted)) {
    mensaje = `${buildLocationAnswer()} ${pickVariant("nombre", presHistory, entityId)}`;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: ubicación + pedir nombre");
  } else if (
    !cierreYaEnviado &&
    buildMobiliarioRentDetailReply(currentMessage ?? "") &&
    needsModoServicioClarification(currentMessage, extracted.modo_servicio ?? null)
  ) {
    mensaje = `${buildMobiliarioRentDetailReply(currentMessage ?? "")}\n\n${buildModoServicioClarificationQuestion()}`;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: mobiliario — detalle técnico + aclarar montado/entrega");
  } else if (
    !cierreYaEnviado &&
    isFieldSatisfied("nombre", filledSet, extracted) &&
    buildMobiliarioRentDetailReply(currentMessage ?? "") &&
    !needsModoServicioClarification(currentMessage, extracted.modo_servicio ?? null)
  ) {
    const detail = buildMobiliarioRentDetailReply(currentMessage ?? "")!;
    const pending = getNextPendingField(extracted, filledSet);
    mensaje =
      pending && pending !== "requerimientos"
        ? `${detail}\n\n${buildNaturalQuestion(pending, ctx)}`
        : detail;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: mobiliario — detalle técnico y avanzar");
  } else if (
    needsModoServicioClarification(currentMessage, extracted.modo_servicio ?? null)
  ) {
    mensaje = buildModoServicioClarificationQuestion();
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: aclarar pedido vs servicio montado");
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
    const emailCtx = { ...ctx, afterEmail: true };
    if (shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage)) {
      mensaje = applyEmailCaptureTone(
        mergeWithPendingQuestion(aiResponse, filledSet, extracted, emailCtx),
        emailCtx
      );
    } else {
      mensaje = buildNaturalQuestion("tipo_evento", emailCtx);
    }
    log?.info({ entityId }, "GUARD: correo capturado — tipo de evento con opciones");
  } else if (justGaveEmail && hasTipoEvento(filledSet, extracted)) {
    const emailCtx = { ...ctx, afterEmail: true };
    const eventOffer = preferEventOfferReply({
      aiResponse,
      extracted,
      filledSet,
      history: presHistory,
      currentMessage,
      entityId,
    });
    if (eventOffer) {
      mensaje = eventOffer;
    } else if (shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage)) {
      mensaje = applyEmailCaptureTone(aiResponse, emailCtx);
    } else {
      const nextQ = nextFieldQuestion(
        extracted,
        filledSet,
        whatsappDisplayName,
        history,
        currentMessage,
        entityId
      );
      const pending = getNextPendingField(extracted, filledSet);
      if (nextQ && pending) {
        mensaje = buildNaturalQuestion(pending, emailCtx);
      } else {
        mensaje = applyEmailCaptureTone(nextQ ?? aiResponse, emailCtx);
      }
    }
    log?.info({ entityId }, "GUARD: correo capturado — siguiente dato tras agradecer");
  } else if (emailRefusedThisTurn && !extracted.correo?.trim()) {
    mensaje = emailRefusalAckMessage(extracted, history, currentMessage, entityId, filledSet);
    log?.info({ entityId }, "GUARD: cliente no quiere dar correo — se continúa el flujo");
  } else if (clientAsksPhone(currentMessage) || clientRequestsCallback(currentMessage)) {
    const phoneAnswer = buildPhoneAnswer();
    const callbackNote = clientRequestsCallback(currentMessage)
      ? "\n\nUn asesor te puede atender por ahí."
      : "";
    const pending = getNextPendingField(extracted, filledSet);
    mensaje =
      needsNextStep && pending && pending !== "correo"
        ? `${phoneAnswer}${callbackNote}\n\n${buildNaturalQuestion(pending, ctx)}`
        : `${phoneAnswer}${callbackNote}`;
    log?.info({ entityId }, "GUARD: cliente preguntó teléfonos / pidió llamada");
  } else if (
    clientDeclinesMoreServices(currentMessage) &&
    hasMeaningfulRequerimientos(extracted, filledSet) &&
    (requerimientosFollowUpAlreadyAsked ||
      justAnsweredReq ||
      lastAssistantAskedMoreServices(presHistory))
  ) {
    if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
    } else {
      const pending = getNextPendingField(extracted, filledSet);
      mensaje = pending
        ? buildNaturalQuestion(pending, ctx)
        : buildClosing(
            extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
            extracted.nombre
          );
    }
    log?.info({ entityId }, "GUARD: cliente no quiere más servicios — avanzar o cierre");
  } else if (
    allowSalesReplyOverride &&
    (clientMentionsEntertainment(currentMessage) ||
      (justAnsweredReq && clientMentionsEntertainment(currentMessage)))
  ) {
    mensaje = buildEntertainmentSalesReply(
      extracted,
      history,
      entityId,
      currentMessage,
      filledSet,
      ctx
    );
    appliedSalesReply = true;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: show/entretenimiento — orientación + catálogo");
  } else if (allowSalesReplyOverride && clientMentionsCarpas(currentMessage)) {
    mensaje = buildCarpasSalesReply(extracted, history, currentMessage, filledSet, ctx);
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: carpas — responder, agregar y pedir medidas");
  } else if (allowSalesReplyOverride && clientMentionsPistaTarima(currentMessage)) {
    mensaje = buildPistaTarimaSalesReply(
      extracted,
      history,
      currentMessage,
      entityId,
      filledSet,
      ctx
    );
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: pista/tarima — aceptar, anotar y pedir medidas");
  } else if (clientAsksInclusion(currentMessage) && !cierreYaEnviado) {
    // Prioridad absoluta: describir paquetes (no depende de allowSalesReplyOverride).
    const serviceHint =
      (isValidRequerimientosValue(extracted.requerimientos_evento)
        ? extracted.requerimientos_evento
        : null) ||
      parsePrimaryService(collectUserTexts(presHistory, currentMessage).join(" ")) ||
      findMentionedService(collectUserTexts(presHistory, currentMessage).join(" "));
    const inclusionAnswer = resolveCatalogInclusionReply(
      currentMessage ?? "",
      serviceHint
    );
    if (inclusionAnswer) {
      const pending = getNextPendingField(extracted, filledSet);
      // Tras describir paquetes, puede seguir el embudo (zona), pero NUNCA borrar el detalle.
      mensaje =
        pending && needsNextStep && !trulyReadyForClosing
          ? `${inclusionAnswer}\n\n${buildNaturalQuestion(pending, ctx)}`
          : inclusionAnswer;
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info({ entityId }, "GUARD: inclusiones/descripciones de paquete (temprano)");
    }
  } else if (
    allowSalesReplyOverride &&
    clientAsksServiceInfo(currentMessage) &&
    isServiceRelatedMessage(currentMessage) &&
    !cierreYaEnviado
  ) {
    // Preferir oferta con niveles + pregunta de catálogo (como food-sales),
    // no solo un ack corto que salta al embudo.
    const cateringAnswer = buildFoodSalesReply(
      extracted,
      history,
      entityId,
      currentMessage,
      filledSet,
      ctx
    );
    if (cateringAnswer && /nivel|precio|manejamos|cat[aá]logo|\$/i.test(cateringAnswer)) {
      const pending = getNextPendingField(extracted, filledSet);
      const asksMeasures = /medidas?/i.test(cateringAnswer);
      if (!asksMeasures && pending && pending !== "requerimientos" && ctx) {
        const nextQ = buildNaturalQuestion(pending, ctx);
        mensaje = cateringAnswer.includes(nextQ)
          ? cateringAnswer
          : `${cateringAnswer}\n\n${nextQ}`;
      } else {
        mensaje = cateringAnswer;
      }
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info({ entityId }, "GUARD: pregunta de servicio — detalle Sheet + oferta catálogo");
    } else {
    // Pregunta de disponibilidad/detalle: NUNCA ignorar con solo "lo anoto".
    const ack = buildGuardServiceAck(currentMessage ?? "");
    const sala = parseSalaProductFromText(currentMessage ?? "");
    if (sala && !isValidRequerimientosValue(extracted.requerimientos_evento)) {
      extracted.requerimientos_evento = sala;
      filledSet.add("Requerimientos o servicios");
    }
    const pending = getNextPendingField(extracted, filledSet);
    // Si el ack ya pide medidas (carpas/pista), no apilar otra pregunta del embudo.
    const asksMeasures = /medidas?/i.test(ack);
    if (!asksMeasures && pending && ctx) {
      const nextQ = buildNaturalQuestion(pending, ctx);
      // Evita repetir el mismo campo que ya preguntó el turno anterior.
      const lastAsk = inferLucyAskedField(
        [...presHistory]
          .reverse()
          .find((m) => m.role === "assistant" && typeof m.content === "string")
          ?.content as string | undefined
      );
      if (lastAsk && pending === lastAsk && countLucyFieldAsks(presHistory, pending) >= 1) {
        mensaje = `${pickTransition(presHistory)} ${ack}`.trim();
      } else {
        mensaje = `${pickTransition(presHistory)} ${ack}\n\n${nextQ}`.trim();
      }
    } else {
      mensaje = `${pickTransition(presHistory)} ${ack}`.trim();
    }
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: pregunta de servicio — responder con detalle");
    }
  } else if (
    allowSalesReplyOverride &&
    !serviceAlreadyCaptured &&
    (clientMentionsCatering(currentMessage) ||
      (justAnsweredReq && isServiceRelatedMessage(currentMessage)) ||
      (!!parsePrimaryService(currentMessage ?? "") && isServiceRelatedMessage(currentMessage)))
  ) {
    const cateringAnswer = buildFoodSalesReply(
      extracted,
      history,
      entityId,
      currentMessage,
      filledSet,
      ctx
    );
    if (cateringAnswer) {
      mensaje = cateringAnswer;
    } else {
      const ack = buildFoodServiceAckIntro(extracted, history, currentMessage);
      const aiMentionsService =
        !!ack &&
        /coffee\s*break|manejamos|banquete|taquiza|catering|sí\s+tenemos/i.test(aiResponse);
      if (shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage)) {
        const base =
          ack && !aiMentionsService ? `${ack} ${aiResponse}`.trim() : aiResponse;
        mensaje = mergeWithPendingQuestion(base, filledSet, extracted, ctx);
      } else if (ack) {
        mensaje = mergeWithPendingQuestion(ack, filledSet, extracted, ctx);
      } else {
        mensaje = buildRecommendationsReply(extracted, history, entityId, currentMessage);
      }
    }
    if (bodyEqualsLastAssistant(mensaje, history, extracted.nombre)) {
      const nextQ = nextFieldQuestion(
        extracted,
        filledSet,
        whatsappDisplayName,
        history,
        currentMessage,
        entityId
      );
      if (nextQ) mensaje = nextQ;
    }
    appliedSalesReply = true;
    log?.info(
      { entityId, justAnsweredReq, food: clientMentionsCatering(currentMessage) },
      "GUARD: comida/servicio — orientación de venta"
    );
  } else if (allowSalesReplyOverride && clientAsksForRecommendations(currentMessage)) {
    const offer = preferEventOfferReply({
      aiResponse,
      extracted,
      filledSet,
      history: presHistory,
      currentMessage,
      entityId,
    });
    if (offer && aiLooksLikeEventServiceOffer(offer)) {
      mensaje = offer;
    } else if (shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage)) {
      mensaje = aiResponse;
    } else {
      mensaje = buildRecommendationsReply(extracted, history, entityId, currentMessage);
    }
    if (bodyEqualsLastAssistant(mensaje, history, extracted.nombre)) {
      const nextQ = nextFieldQuestion(
        extracted,
        filledSet,
        whatsappDisplayName,
        history,
        currentMessage,
        entityId
      );
      if (nextQ) mensaje = nextQ;
    }
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: cliente pidió recomendaciones — preferir OpenAI");
  } else if (
    clientAsksPrice(currentMessage) ||
    clientAsksDistributorPricing(currentMessage)
  ) {
    const ctxText = collectUserTexts(input.presentationHistory ?? history, currentMessage).join(" ");
    const pending = getNextPendingField(extracted, filledSet);

    // RFQ / precio distribuidor: el equipo cotiza; no tirar un SKU retail.
    if (
      isRichQuoteBrief(currentMessage) ||
      clientAsksDistributorPricing(currentMessage) ||
      (clientAsksDistributorPricing(ctxText) && parseServicesFromText(ctxText).length >= 2)
    ) {
      const services = parseServicesFromText(
        `${currentMessage ?? ""} ${extracted.requerimientos_evento ?? ""}`
      );
      const packageReply = buildMultiServicePackageReply(
        services,
        currentMessage ?? ctxText
      );
      const teamNote =
        "El precio de mayoreo / la propuesta a la medida la arma nuestro equipo; no te paso un precio de lista suelto.";
      mensaje = needsNextStep
        ? mergeWithPendingQuestion(
            `${packageReply}\n\n${teamNote}`,
            filledSet,
            extracted,
            ctx
          )
        : `${packageReply}\n\n${teamNote}`;
      log?.info({ entityId }, "GUARD: precio distribuidor / RFQ — sin SKU retail");
    } else {
      const needsAlejandroQuote =
        mentionsNoListedPriceService(currentMessage) ||
        (responseHasInventedPrice(aiResponse, currentMessage, ctxText) &&
          !mentionsListedPriceService(currentMessage));

      if (needsAlejandroQuote) {
        const priceReply = buildAlejandroPriceReply(getPriceServiceLabel(currentMessage), currentMessage);
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
    }
  } else if (needsNextStep && shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage)) {
    mensaje = aiResponse;
    log?.info({ entityId }, "GUARD: respuesta GPT natural aceptada");
  } else if (needsNextStep) {
    const earlyOffer = preferEventOfferReply({
      aiResponse,
      extracted,
      filledSet,
      history: presHistory,
      currentMessage,
      entityId,
    });
    if (earlyOffer) {
      mensaje = earlyOffer;
      log?.info({ entityId }, "GUARD: ofrecimiento temprano en needsNextStep");
    } else if (aiResponse.trim() && !mensajeAsksForFilledField(aiResponse, filledSet, extracted)) {
      mensaje = mergeWithPendingQuestion(aiResponse, filledSet, extracted, ctx);
      log?.info({ entityId }, "GUARD: GPT + pregunta pendiente fusionados");
    } else if (aiResponse.trim() && mensajeAsksForFilledField(aiResponse, filledSet, extracted)) {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
      mensaje = nextQ ?? aiResponse;
      log?.info({ entityId }, "GUARD: GPT repitió dato ya capturado — siguiente paso");
    } else {
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
    }
  } else if (
    trulyReadyForClosing &&
    !cierreYaEnviado &&
    !requerimientosFollowUpAlreadyAsked &&
    (requerimientosNeedsFollowUp(extracted, filledSet) || justAnsweredReq)
  ) {
    mensaje = buildRequerimientosFollowUp(extracted, filledSet, history, currentMessage, entityId);
    log?.info({ entityId }, "GUARD: profundizar antes del cierre");
  } else if (
    trulyReadyForClosing &&
    !cierreYaEnviado &&
    requerimientosFollowUpAlreadyAsked &&
    requerimientosNeedsFollowUp(extracted, filledSet)
  ) {
    const pending = getNextPendingField(extracted, filledSet);
    mensaje = pending
      ? buildNaturalQuestion(pending, ctx)
      : buildClosing(
          extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
          extracted.nombre
        );
    log?.info({ entityId }, "GUARD: follow-up de servicios ya hecho — avanzar");
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

  if (appliedDirectReply) {
    return normalizeAdvisorReferences(
      mensaje,
      extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
    );
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

  // Correo pendiente: si el cliente aportó salas/servicios, acusar y NO repetir el mismo ask.
  // Tras CORREO_MAX_ASKS sin respuesta, avanza al siguiente dato (el correo se vuelve a pedir
  // cuando toque por getNextPendingField / cierre — no se olvida del embudo).
  if (
    !cierreYaEnviado &&
    !appliedDirectReply &&
    !isEmailSatisfied(filledSet, extracted) &&
    !detectEmailRefusal([currentMessage ?? ""]) &&
    !parseCorreoFromText(currentMessage ?? "")
  ) {
    const correoAsks = countLucyFieldAsks(presHistory, "correo");
    const lastAskedCorreo =
      inferLucyAskedField(
        [...presHistory]
          .reverse()
          .find((m) => m.role === "assistant" && typeof m.content === "string")
          ?.content as string | undefined
      ) === "correo";
    const usefulNow =
      !!parseSalaProductFromText(currentMessage ?? "") ||
      parseServicesFromText(currentMessage ?? "").length > 0 ||
      isServiceRelatedMessage(currentMessage) ||
      !!parseTipoEventoFromText(currentMessage ?? "");

    if (usefulNow && (mensajeAsksForField(mensaje, "correo") || lastAskedCorreo)) {
      const ackBits: string[] = [];
      const sala = parseSalaProductFromText(currentMessage ?? "");
      if (sala) ackBits.push(`Perfecto, anoto *${sala}*.`);
      else if (parseServicesFromText(currentMessage ?? "").length) {
        ackBits.push(
          `Perfecto, anoto ${formatServicesList(parseServicesFromText(currentMessage ?? ""))}.`
        );
      } else if (parseTipoEventoFromText(currentMessage ?? "")) {
        ackBits.push(`Perfecto, anoto el tipo de evento.`);
      }
      const ack = ackBits.join(" ") || "Perfecto, lo anoto.";

      if (correoAsks >= CORREO_MAX_ASKS) {
        // Ya preguntamos correo bastante: sigue el embudo (tipo/servicios/zona…).
        const skipEmail = new Set(filledSet);
        // Marca temporal solo para elegir siguiente pregunta; NO waiver permanente.
        skipEmail.add("Correo electrónico");
        const pending = getNextPendingField(extracted, skipEmail);
        const nextQ =
          pending && pending !== "correo"
            ? buildNaturalQuestion(pending, { ...ctx, filledSet: skipEmail })
            : null;
        mensaje = nextQ ? `${ack} ${nextQ}`.trim() : ack;
        log?.info({ entityId, correoAsks }, "GUARD: correo — tope de asks, avanza embudo");
      } else if (correoAsks >= 1 || lastAskedCorreo) {
        const emailQ = pickVariant("correo", presHistory, entityId);
        mensaje = `${ack} ${emailQ}`.trim();
        log?.info({ entityId }, "GUARD: correo — acusa dato útil + variante distinta");
      }
    } else if (
      correoAsks >= CORREO_MAX_ASKS &&
      mensajeAsksForField(mensaje, "correo")
    ) {
      const skipEmail = new Set(filledSet);
      skipEmail.add("Correo electrónico");
      const pending = getNextPendingField(extracted, skipEmail);
      if (pending && pending !== "correo") {
        mensaje = buildNaturalQuestion(pending, { ...ctx, filledSet: skipEmail });
        log?.info({ entityId, correoAsks }, "GUARD: correo — evita 3ª repetición");
      }
    }
  }

  const correoYaTenido = isEmailSatisfied(filledSet, extracted);
  if (
    correoYaTenido &&
    (mensajeAsksForField(mensaje, "correo") || softAsksFilledField(mensaje, "correo")) &&
    !trulyReadyForClosing
  ) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && pending !== "correo") {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
      if (nextQ) {
        log?.warn({ entityId }, "GUARD: GPT preguntó correo ya capturado");
        mensaje = nextQ;
      }
    }
  }

  if (
    filledSet.has(EMAIL_WAIVED_LABEL) &&
    (mensajeAsksForField(mensaje, "correo") || softAsksFilledField(mensaje, "correo")) &&
    !trulyReadyForClosing
  ) {
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

  if (
    !trulyReadyForClosing &&
    !appliedDirectReply &&
    responseLooksLikePrematureClose(mensaje)
  ) {
    const forcedNext = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
    if (forcedNext) {
      log?.warn({ entityId }, "GUARD: bloqueando cierre prematuro");
      mensaje = forcedNext;
    }
  }

  // Zona/ubicación REQUERIDA antes del cierre (ciudad + colonia/salón).
  // Usar isFieldSatisfied (no solo filledSet): si extracted ya tiene Querétaro,
  // no volver a preguntar zona al avanzar a fecha (Núria A14894).
  // No pisar respuestas de "qué incluye / descripción de paquetes".
  if (
    !cierreYaEnviado &&
    !clientAsksInclusion(currentMessage) &&
    !appliedDirectReply &&
    !/\bincluye\s*:|bodasesor\.com\/catalogos/i.test(mensaje) &&
    !isFieldSatisfied("zona", filledSet, extracted) &&
    (responseLooksLikePrematureClose(mensaje) ||
      trulyReadyForClosing ||
      mensajeAsksForField(mensaje, "presupuesto") ||
      mensajeAsksForField(mensaje, "fecha") ||
      mensajeAsksForField(mensaje, "invitados"))
  ) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending === "zona" || !mensajeAsksForField(mensaje, "zona")) {
      mensaje = buildNaturalQuestion("zona", ctx);
      log?.info({ entityId }, "GUARD: forzar ubicación antes de avance/cierre");
    }
  }

  if (mensajeAsksWrongField(mensaje, filledSet, extracted) && !isInformativeClientAnswer(currentMessage) && !appliedSalesReply) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending) {
      log?.warn({ entityId, pending }, "GUARD: pregunta fuera de orden — corrigiendo");
      mensaje = buildNaturalQuestion(pending, ctx);
    }
  }

  if (!cierreYaEnviado && !appliedDirectReply) {
    mensaje = sanitizeOutboundMessage(mensaje, filledSet, extracted, ctx, log);
  }

  // Ventas: sanitizar + cortar re-preguntas, pero no pasar por enforceNombreFirst
  // (si no, el pitch de coffee break / pista en el primer turno se sustituye por "¿nombre?").
  if (appliedSalesReply) {
    // Preguntas de inclusiones/descripciones: nunca redirect al siguiente campo del embudo.
    if (!clientAsksInclusion(currentMessage)) {
      mensaje = redirectIfAskingFilledField(mensaje, filledSet, extracted, ctx);
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
      isPresupuestoResuelto(filledSet, collectUserTexts(presHistory, currentMessage), presHistory) ||
      filledSet.has("Presupuesto (MXN)")
    ) {
      if (
        mensajeAsksForField(mensaje, "presupuesto") ||
        softAsksFilledField(mensaje, "presupuesto") ||
        /rango\s+de\s+(presupuesto|inversi)/i.test(mensaje)
      ) {
        const pending = getNextPendingField(extracted, filledSet);
        mensaje =
          pending && pending !== "presupuesto"
            ? buildNaturalQuestion(pending, ctx)
            : isReadyForClosing(filledSet) && !cierreYaEnviado
              ? buildClosing(
                  extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
                  extracted.nombre
                )
              : "Entendido, sin problema. Nuestro equipo te propone opciones según lo que platicamos.";
      }
    }
    const historyHadGenericMenu = presHistory.some(
      (m) =>
        m.role === "assistant" &&
        typeof m.content === "string" &&
        (responseLooksLikeGenericCateringMenu(m.content as string) ||
          looksLikeServicesMenuDump(m.content as string))
    );
    if (
      (responseLooksLikeGenericCateringMenu(mensaje) || looksLikeServicesMenuDump(mensaje)) &&
      (historyHadGenericMenu ||
        clientMentionsPistaTarima(currentMessage) ||
        mentionsNoListedPriceService(currentMessage)) &&
      currentMessage?.trim()
    ) {
      if (
        clientMentionsPistaTarima(currentMessage) ||
        mentionsNoListedPriceService(currentMessage)
      ) {
        const ack = buildGuardServiceAck(currentMessage);
        filledSet.add("Requerimientos o servicios");
        const pending = getNextPendingField(extracted, filledSet);
        mensaje =
          pending && pending !== "requerimientos"
            ? `${ack}\n\n${buildNaturalQuestion(pending, { ...ctx, filledSet })}`
            : ack;
      }
    }
    // Primer turno con pitch de venta: intro Lucy + nombre si falta (A14929).
    if (
      (forceFirstPresentation || isFirstLucyReply(presHistory)) &&
      !conversationAlreadyStarted(filledSet, presHistory) &&
      !isFieldSatisfied("nombre", filledSet, extracted)
    ) {
      if (!/hola,?\s*soy\s+lucy/i.test(mensaje)) {
        mensaje = `${LUCY_INTRO} ${mensaje}`.trim();
      }
      if (
        !mensajeAsksForField(mensaje, "nombre") &&
        !/\b(c[oó]mo\s+te\s+llamas|me\s+regalas\s+tu\s+nombre)\b/i.test(mensaje)
      ) {
        mensaje = `${mensaje}\n\n${pickVariant("nombre", history, entityId)}`.trim();
      }
    }
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
    if (pending && !mensaje.includes("?") && !trulyReadyForClosing && !cierreYaEnviado) {
      mensaje = mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx);
    }
  }

  mensaje = stripStalePriceTalk(mensaje, currentMessage);
  if (
    !mensaje.includes("?") &&
    !trulyReadyForClosing &&
    !cierreYaEnviado &&
    !clientAskedFreeformQuestion(currentMessage)
  ) {
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
    const serviceHint =
      (isValidRequerimientosValue(extracted.requerimientos_evento)
        ? extracted.requerimientos_evento
        : null) ||
      parsePrimaryService(collectUserTexts(presHistory, currentMessage).join(" ")) ||
      findMentionedService(collectUserTexts(presHistory, currentMessage).join(" "));
    const inclusionAnswer = resolveCatalogInclusionReply(currentMessage, serviceHint);
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

  const withoutImageAnnotation = stripImageAnnotation(mensaje);
  if (withoutImageAnnotation !== mensaje) {
    log?.warn({ entityId }, "GUARD: anotación interna de imagen filtrada al cliente — removida");
    mensaje = withoutImageAnnotation || "Gracias por la imagen.";
  }

  if (conversationAlreadyStarted(filledSet, presHistoryForIntro)) {
    const stripped = stripRobotAcknowledgments(mensaje);
    if (stripped !== mensaje) {
      log?.info({ entityId }, "GUARD: reconocimiento robot de dato capturado eliminado");
      mensaje = stripped;
    }
  }

  mensaje = avoidRepeatPreviousReply(mensaje, presHistory);

  // No pisar una respuesta de catálogo (Incluye / niveles / precios / entretenimiento) solo para variar la zona.
  if (
    mensajeAsksForField(mensaje, "zona") &&
    countLucyFieldAsks(presHistory, "zona") >= 1 &&
    !isFieldSatisfied("zona", filledSet, extracted) &&
    !/\bincluye\b|\bniveles?\b|\$\s*\d|bodasesor\.com\/catalogos|cat[aá]logo general|shows?\s+en\s+vivo|maestro\s+de\s+ceremonias/i.test(
      mensaje
    )
  ) {
    const nombre = getDisplayName(extracted, whatsappDisplayName);
    const zonaAsks = countLucyFieldAsks(presHistory, "zona");
    const zonaVariants = nombre
      ? [
          `${pickTransition(presHistory)} ${nombre}, ¿me confirmas la ciudad o colonia del evento?`,
          `${pickTransition(presHistory)} ${nombre}, ¿en qué zona o salón lo tendrían?`,
          `${pickTransition(presHistory)} ${nombre}, ¿ya tienen el lugar del evento?`,
        ]
      : [
          `${pickTransition(presHistory)} ¿Me confirmas la ciudad o colonia del evento?`,
          `${pickTransition(presHistory)} ¿En qué zona o salón lo tendrían?`,
          `${pickTransition(presHistory)} ¿Ya tienen el lugar del evento?`,
        ];
    mensaje = zonaVariants[Math.min(zonaAsks - 1, zonaVariants.length - 1)]!;
    log?.info({ entityId, zonaAsks }, "GUARD: pregunta de zona — variante alterna");
  }

  if (
    mensajeAsksForField(mensaje, "fecha") &&
    countLucyFieldAsks(presHistory, "fecha") >= FECHA_MAX_ASKS &&
    !isFieldSatisfied("fecha", filledSet, extracted)
  ) {
    // Ya preguntamos fecha suficiente veces: no repetir, avanzar o waiver.
    filledSet.add("Fecha y horario");
    if (!extracted.fecha_horario?.trim()) extracted.fecha_horario = FECHA_AUTO_WAIVER;
    const nextQ = nextFieldQuestion(
      extracted,
      filledSet,
      whatsappDisplayName,
      history,
      currentMessage,
      entityId
    );
    if (nextQ && !mensajeAsksForField(nextQ, "fecha")) {
      mensaje = nextQ;
    } else if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
    } else {
      const nombre = getDisplayName(extracted, whatsappDisplayName);
      mensaje = nombre
        ? `Sin problema, ${nombre}. Seguimos sin fecha fija por ahora.`
        : "Sin problema. Seguimos sin fecha fija por ahora.";
    }
    log?.info({ entityId }, "GUARD: tope de preguntas fecha — auto-waiver");
  } else if (
    mensajeAsksForField(mensaje, "fecha") &&
    countLucyFieldAsks(presHistory, "fecha") >= 1 &&
    !isFieldSatisfied("fecha", filledSet, extracted)
  ) {
    const nombre = getDisplayName(extracted, whatsappDisplayName);
    const lastFechaAsk = [...presHistory]
      .reverse()
      .find(
        (m) =>
          m.role === "assistant" &&
          typeof m.content === "string" &&
          mensajeAsksForField(m.content as string, "fecha")
      )?.content as string | undefined;
    const variant = nombre
      ? `${pickTransition(presHistory)} ${nombre}, ¿tienen día u horario ya definido?`
      : `${pickTransition(presHistory)} ¿Tienen día u horario ya definido?`;
    // Si la variante sigue casi idéntica a la pregunta previa, no reenviar otra fecha.
    if (lastFechaAsk && textOverlapRatio(variant, lastFechaAsk) >= 0.72) {
      filledSet.add("Fecha y horario");
      if (!extracted.fecha_horario?.trim()) extracted.fecha_horario = FECHA_AUTO_WAIVER;
      const nextQ = nextFieldQuestion(
        extracted,
        filledSet,
        whatsappDisplayName,
        history,
        currentMessage,
        entityId
      );
      mensaje =
        nextQ && !mensajeAsksForField(nextQ, "fecha")
          ? nextQ
          : nombre
            ? `Sin problema, ${nombre}. Seguimos sin fecha fija por ahora.`
            : "Sin problema. Seguimos sin fecha fija por ahora.";
      log?.info({ entityId }, "GUARD: fecha casi idéntica — avanzar sin repetir");
    } else {
      mensaje = variant;
      log?.info({ entityId }, "GUARD: segunda pregunta de fecha — variante corta");
    }
  }

  if (
    mensajeAsksForField(mensaje, "nombre") &&
    isFieldSatisfied("nombre", filledSet, extracted)
  ) {
    const pendingNombre = getNextPendingField(extracted, filledSet);
    if (pendingNombre && pendingNombre !== "nombre") {
      mensaje = buildNaturalQuestion(pendingNombre, ctx);
      log?.info({ entityId, pending: pendingNombre }, "GUARD: nombre ya capturado — siguiente dato");
    }
  }

  if (!clientAsksInclusion(currentMessage)) {
    mensaje = redirectIfAskingFilledField(mensaje, filledSet, extracted, ctx);
  }

  const historyHadGenericMenu = presHistory.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      (responseLooksLikeGenericCateringMenu(m.content as string) ||
        looksLikeServicesMenuDump(m.content as string))
  );
  if (
    (responseLooksLikeGenericCateringMenu(mensaje) || looksLikeServicesMenuDump(mensaje)) &&
    (historyHadGenericMenu || clientMentionsPistaTarima(currentMessage) || mentionsNoListedPriceService(currentMessage)) &&
    currentMessage?.trim()
  ) {
    // Servicio concreto sin precio en Sheet (pista, DJ, etc.) → aceptar-anotar-avanzar, no otro menú.
    if (
      clientMentionsPistaTarima(currentMessage) ||
      mentionsNoListedPriceService(currentMessage)
    ) {
      const ack = buildGuardServiceAck(currentMessage);
      filledSet.add("Requerimientos o servicios");
      if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
        const mentioned = findMentionedService(currentMessage) || currentMessage.trim().slice(0, 80);
        extracted.requerimientos_evento = mentioned;
      }
      const pending = getNextPendingField(extracted, filledSet);
      mensaje =
        pending && pending !== "requerimientos"
          ? `${ack}\n\n${buildNaturalQuestion(pending, { ...ctx, filledSet })}`
          : ack;
      log?.info({ entityId }, "GUARD: servicio sin precio — aceptar y avanzar (anti-menú)");
    } else {
      const detail = buildCatalogServiceDetailAnswer(currentMessage);
      if (detail) {
        mensaje = detail;
        log?.info({ entityId }, "GUARD: menú genérico repetido — detalle del Sheet");
      } else {
        const pending = getNextPendingField(extracted, filledSet);
        if (pending) {
          mensaje = buildNaturalQuestion(pending, ctx);
          log?.info({ entityId }, "GUARD: menú genérico repetido — avanzar flujo");
        }
      }
    }
  }

  // presupuesto_resuelto: ninguna ruta re-pregunta.
  if (
    isPresupuestoResuelto(filledSet, collectUserTexts(presHistory, currentMessage), presHistory) ||
    filledSet.has("Presupuesto (MXN)")
  ) {
    if (mensajeAsksForField(mensaje, "presupuesto") || /rango\s+de\s+(presupuesto|inversi)/i.test(mensaje)) {
      applyPresupuestoWaiver(
        filledSet,
        [],
        collectUserTexts(presHistory, currentMessage),
        presHistory
      );
      const pending = getNextPendingField(extracted, filledSet);
      if (pending && pending !== "presupuesto") {
        mensaje = buildNaturalQuestion(pending, ctx);
      } else if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
        mensaje = buildClosing(
          extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
          extracted.nombre
        );
      } else {
        mensaje =
          "Sin problema, lo dejamos por definir. Nuestro equipo te propone opciones según lo que platicamos.";
      }
      log?.info({ entityId }, "GUARD: presupuesto_resuelto — no re-preguntar");
    }
  }

  // Quitar bloque enlatado VIEJO de cierre si el modelo lo inventó (lista robótica).
  // Permitimos la mención natural de alimentos/mobiliario/DJ en buildClosing.
  if (
    /tambi[eé]n manejamos bebidas,?\s*DJ,?\s*iluminaci[oó]n,?\s*carpas,?\s*pantallas/i.test(mensaje)
  ) {
    mensaje = mensaje
      .replace(/Por cierto,?[^.]*bebidas[^.]*\./gi, "")
      .replace(/tambi[eé]n manejamos bebidas[^.]*\./gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    log?.info({ entityId }, "GUARD: quitó bloque genérico fijo del cierre");
  }

  mensaje = dedupeTransitionsInMessage(mensaje);

  const clientWantedCatalog =
    clientAsksForCatalog(currentMessage) ||
    clientAffirmsCatalogOffer(
      currentMessage,
      lastAssistantMsg && typeof lastAssistantMsg.content === "string"
        ? (lastAssistantMsg.content as string)
        : null
    );
  // Entretenimiento / RFQ: el bloque "Te dejo el catálogo general" es intencional (A14920).
  const intentionalCatalogSend =
    /te dejo el cat[aá]logo general/i.test(mensaje) ||
    /detalle completo de men[uú]s e inclusiones est[aá] en el cat[aá]logo/i.test(mensaje) ||
    /el detalle de (lo que incluye|inclusiones).{0,40}cat[aá]logo/i.test(mensaje) ||
    (/bodasesor\.com\/catalogos/i.test(mensaje) &&
      (/shows?\s+en\s+vivo|hora\s+loca|maestro\s+de\s+ceremonias|entretenimiento|niveles?|incluye|men[uú]s/i.test(
        mensaje
      ) ||
        messageOffersCatalogLink(mensaje)));
  mensaje = stripUnsolicitedCatalogWebLinks(
    mensaje,
    clientWantedCatalog || intentionalCatalogSend || clientAsksInclusion(currentMessage)
  );

  // A14929: si dijo que manda enlace/catálogo pero no hay URL, forzar link del Sheet.
  if (
    (clientWantedCatalog || intentionalCatalogSend) &&
    /cat[aá]logo|enlace|link/i.test(mensaje) &&
    !/bodasesor\.com\/catalogos/i.test(mensaje)
  ) {
    const wantFull = clientWantsFullCatalog(currentMessage) || /cat[aá]logo\s+(completo|general)/i.test(currentMessage ?? "");
    mensaje = buildCatalogWebLinkReply({
      query: wantFull ? "catálogo general" : (currentMessage ?? "catálogo general"),
      wantFull,
      serviceHint: extracted.requerimientos_evento ?? null,
    });
    log?.info({ entityId }, "GUARD: forzó URL de catálogo (mensaje sin link)");
  }

  // A14929: no inventar "banquete Premium" cuando Premium es el nombre de WhatsApp, no un nivel elegido.
  const waRaw = (whatsappDisplayName ?? "").trim();
  const waIsCatalogLevel = /^(premium|b[aá]sic[ao]|tradicional|solo\s*alimentos?|deluxe|vip)$/i.test(waRaw);
  if (
    waIsCatalogLevel &&
    /banquete\s+premium/i.test(mensaje) &&
    currentMessage &&
    !/\bpremium\b/i.test(currentMessage) &&
    !isCatalogLevelSelection(
      currentMessage,
      lastAssistantMsg && typeof lastAssistantMsg.content === "string"
        ? (lastAssistantMsg.content as string)
        : null
    )
  ) {
    mensaje = mensaje
      .replace(/[^.!?]*\bbanquete\s+premium\b[^.!?]*[.!?]/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    log?.info({ entityId }, "GUARD: quitó banquete Premium inventado desde nombre WA");
  }

  // Oferta de niveles sin inclusiones → reemplazar con detalle del Sheet.
  if (messageOffersLevelsWithoutInclusions(mensaje)) {
    const hint = [
      extracted.requerimientos_evento,
      currentMessage,
      ...presHistory
        .filter((m) => m.role === "user" && typeof m.content === "string")
        .slice(-3)
        .map((m) => m.content as string),
    ]
      .filter(Boolean)
      .join(" ");
    const enriched = enrichBareNivelOffer(mensaje, hint);
    if (enriched) {
      mensaje = enriched;
      log?.info({ entityId }, "GUARD: niveles sin inclusiones — detalle del Sheet");
    }
  }

  mensaje = stripInternalCrmBlock(mensaje);
  if (
    !mensaje.trim() &&
    (/Información completa obtenida|DATOS DEL CLIENTE/i.test(aiResponse) ||
      isReadyForClosing(filledSet))
  ) {
    mensaje = buildClosing(
      extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
      extracted.nombre
    );
    log?.warn({ entityId }, "GUARD: bloqueó nota interna CRM — solo cierre al cliente");
  }

  // "estos/los servicios" sin enumerar → anexar lista capturada (Núria A14894).
  if (/\b(estos|los)\s+servicios\b/i.test(mensaje)) {
    const listed = parseServicesFromText(
      [extracted.requerimientos_evento, currentMessage].filter(Boolean).join(" ")
    );
    if (listed.length > 0 && !listed.some((s) => mensaje.toLowerCase().includes(s.toLowerCase()))) {
      const lista = formatServicesList(listed);
      mensaje = mensaje.replace(
        /\b(estos|los)\s+servicios\b/i,
        `$1 servicios (${lista})`
      );
      log?.info({ entityId, lista }, "GUARD: enumeró servicios vagos");
    }
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

/** Evita que GPT repita literalmente anotaciones internas de imagen. */
export function stripImageAnnotation(text: string): string {
  if (!text) return text;
  if (
    !/\[imagen\s+adjunta:/i.test(text) &&
    !/\[imagen\s+respuesta\s+cliente\]:/i.test(text) &&
    !/\[imagen\s+nota\s+interna\]:/i.test(text) &&
    !/\[imagen\s+intent\]:/i.test(text)
  ) {
    return text;
  }
  return text
    .replace(/\[imagen\s+adjunta:[^\]]*\]/gi, "")
    .replace(/\[imagen\s+respuesta\s+cliente\]:\s*[^\n]*/gi, "")
    .replace(/\[imagen\s+nota\s+interna\]:\s*[^\n]*/gi, "")
    .replace(/\[imagen\s+intent\]:\s*[^\n]*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
