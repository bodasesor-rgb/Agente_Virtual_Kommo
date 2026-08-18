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
  isLikelyUbicacionNotNombre,
  looksLikePersonFullName,
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
  buildPedidoEntregaReply,
  detectModoServicio,
  isMobiliarioRentalPedido,
  needsModoServicioClarification,
} from "./modoServicio.js";
import { normalizeAdvisorReferences, advisorLabelForClient, stripInternalCrmBlock } from "./lib/bodasesorAdvisor.js";
import {
  buildCompanyEmailConfirmReply,
  clientAsksIfCompanyEmailCorrect,
} from "./tipoContacto.js";
import {
  buildAlejandroPriceReply,
  buildConsultativeNoPriceReply,
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
  buildLucyInfoLearnedPriceReply,
  collapseDuplicatedInclusionReply,
} from "./services/lucyInfoPriceCache.js";
import {
  buildCatalogPriceAnswer,
  resolveCatalogInclusionReply,
  buildCatalogComparisonAnswer,
  buildCatalogServiceDetailAnswer,
  catalogAnswerMatchesRequestedService,
  responseLooksLikeGenericCateringMenu,
  clientAsksInclusion,
  clientAsksSpecificInclusionItem,
  buildSpecificInclusionItemReply,
  buildCatalogWebLinkReply,
  buildServicePlusGeneralCatalogReply,
  withServiceAndGeneralCatalogLinks,
  stripUnsolicitedCatalogWebLinks,
  CATALOG_OFFER_QUESTION,
  SERVICE_NIVEL_DETAIL_CTA,
  messageOffersCatalogLink,
  buildPdfInclusionReply,
  ensureCatalogWebLink,
  attachAvailableSheetDetail,
  messageHasSheetServiceDetail,
  enrichBareNivelOffer,
  messageOffersLevelsWithoutInclusions,
  getCatalogWebHubDeliveryUrl,
  buildBroadLevel1Offer,
  isNarrowSocialEventOffer,
  resolveCatalogWebLink,
  toDeliverableCatalogUrl,
  buildSoloVsCompletoOfferIfApplicable,
} from "./services/catalogService.js";
import { getCatalogWebUrlForQuery } from "./services/catalogWebKnowledge.js";
import { resolveServiceFocusFromText } from "./services/serviceSynonyms.js";
import {
  buildGuardServiceAck,
  buildMobiliarioRentDetailReply,
  parseMobiliarioRentItems,
} from "./services/serviceKnowledge.js";
import {
  shouldOfferOptionsBeforeDetail,
  resolveProgressiveDetailQuery,
  clientWantsServiceDetail,
  historyOfferedServiceOptionsMenu,
  isProgressiveOptionsMenuReply,
  isBareProgressiveAffirmation,
  detectProgressiveFamily,
  progressiveFamilyDetailQueries,
  catalogNivelLabelFromText,
  withCatalogNivelQuery,
  resolveDetailQueryForFamily,
  resolveSoloVsCompletoStationLabel,
  buildAlimentosModoMenu,
  buildCateringCasualMenu,
  buildProgressiveOptionsMenu,
  historyOfferedAlimentosModoMenu,
  isAlimentosModoMenuReply,
  clientChoseBanqueteFormal,
  clientChoseCateringCasual,
  historyOfferedMobiliarioPieceMenu,
  parseMobiliarioPieceChoice,
  buildMobiliarioPieceFollowUp,
} from "./services/serviceProgressiveOffer.js";
import {
  buildConcreteProductQuestionReply,
  clientAsksCapacityLayout,
  clientAsksConcreteProductQuestion,
  shouldSkipSalesMenuForConcreteQuestion,
} from "./services/concreteProductQuestion.js";
import {
  buildServiceDeclineAck,
  clientDeclinesAnyService,
  clientDeclinesServiceFamilies,
  clientDeclinesServiceFamiliesWithContext,
  looksLikeThemeColorNotLocation,
  removeDeclinedFamiliesFromRequirements,
  stripThemeColorsFromZona,
} from "./services/serviceDecline.js";
import {
  extractImageClientReply,
  extractImageIntent,
  looksLikeImageInternalSummary,
  clientCaptionForServiceParse,
} from "./services/imageProcessor.js";
import {
  BODASESOR_SERVICE_PATTERNS,
  clientAsksForRecommendations,
  clientAsksAboutTeam,
  clientAsksForHumanAdvisor,
  clientAsksPhone,
  clientSignalsUrgency,
  clientAsksLocation,
  clientMentionsItalianTheme,
  isAmbiguousShortNumber,
  isCatalogLevelSelection,
  extractCatalogNivelFromText,
  sanitizeExtractedAmbiguousNumbers,
  clientDeclinesMoreServices,
  clientWantsFoodOnlyQuote,
  dedupeServiceHierarchy,
  looksLikeConflictingFoodAlternatives,
  preferPrimaryCatalogService,
  clientMentionsEntertainment,
  clientMentionsSpecialLiveAct,
  parseSpecialLiveActLabel,
  clientConfirmsOfferReview,
  clientMentionsLedRobotsOrBatucada,
  clientMentionsPistaTarima,
  clientMentionsCarpas,
  clientAsksServiceInfo,
  parseSalaProductFromText,
  parseFurnitureCatalogSkuFromText,
  clientAffirmsEmbudoContinue,
  assistantAskedVagueEmbudoContinue,
  parseCarpaVariantFromText,
  isLikelyProductNameNotLocation,
  isNonLocationBusinessPhrase,
  detectPresupuestoRefusal,
  findPresupuestoInTexts,
  countLucyFieldAsks,
  PRESUPUESTO_MAX_ASKS,
  PRESUPUESTO_AUTO_WAIVER,
  parsePresupuestoFromText,
  isPresupuestoResuelto,
  clientAddsToQuote,
  isServicePreferenceRefinement,
  clientAsksBanqueteVsTaquiza,
  parseCorreoFromText,
  recoverCorreoFromUserTexts,
  isReferentialPriorAnswer,
  clientComplainsAboutRepeat,
  clientMentionsCatering,
  inferLucyAskedField,
  isServiceRelatedMessage,
  parsePrimaryService,
  parseCentrosDeMesaRequirement,
  parseSpaceDimensions,
  isDimensionText,
  parseFechaFromText,
  parseTipoEventoFromText,
  parseInvitadosFromText,
  parseZonaFromText,
  mergeZonaDetail,
  parseServicesFromText,
  mergeServiceRequirements,
  buildMultiServiceAck,
  buildRichBriefAcknowledgment,
  formatServicesList,
  isUsableDireccionEvento,
  isVagueVenueOnly,
  isLocationDeferralOrVagueWorkplace,
  isVenueWithoutCity,
  extractVenueNameHint,
  hasCityOrMetroSignal,
  clientCorrectsLocation,
  isVenueSpaceDetail,
  applyLocationCorrectionToAddress,
  recoverClienteNombreFromHistory,
  isVagueFoodTerm,
  needsAlimentosTipoClarification,
  clientAsksForFoodMenu,
  isGettingReadyContext,
  parseWebLeadBrief,
  clientAsksForCatalog,
  clientAsksGenericMenuCatalog,
  clientWantsFullCatalog,
  clientAffirmsCatalogOffer,
  assistantOfferedCatalogDetail,
  looksLikeCompanyLocationQuestionFragment,
  isRichQuoteBrief,
  clientAsksToRereadBrief,
  clientAsksDistributorPricing,
  clientRequestsCallback,
  isGenericQuoteIntentRequerimiento,
  clientAsksCafeOrCateringChoice,
  looksLikeNameAnswerMessage,
  FECHA_MAX_ASKS,
  FECHA_AUTO_WAIVER,
} from "./conversation-understanding.js";

export const EMAIL_WAIVED_LABEL = "Correo (prefiere no compartir)";
export const BODASESOR_EMAIL = "hola@bodasesor.com";
/** Sufijo CRM cuando el nombre viene de WhatsApp porque el cliente no lo escribió. */
export const WHATSAPP_NOMBRE_NOTE = "(nombre de WhatsApp — el cliente no lo escribió)";

const EMAIL_REFUSAL_PATTERN =
  /(?:no\s+tengo(\s+un?)?\s+correo|no\s+quiero(\s+dar|\s+compartir)?(\s+mi)?\s+correo|sin\s+correo|no\s+uso\s+correo|no\s+dispongo\s+de\s+correo|por\s+este\s+medio|por\s+whatsapp|a\s+qui(?:[eé])?\s+por\s+whatsapp|whatsapp\s+no\s+se\s+puede|prefiero\s+(?:por\s+)?whatsapp|prefiero\s+no\s+(?:dar|compartir|pasar|enviar)(\s+mi)?\s+correo|mejor\s+no\s+(?:doy|comparto|paso)(\s+mi)?\s+correo|por\s+ahora\s+no\s+(?:doy|comparto|paso|quiero\s+dar)(\s+mi)?\s+correo|por\s+aqu[ií]|mandar.*por\s+aqu[ií]|me\s+la\s+(?:pueden\s+)?mandar\s+por\s+aqu[ií]|aqu[ií]\s+(?:est[aá]|por)|por\s+aqu[ií]\s+por\s+fa|no\s+me\s+gusta\s+dar|no\s+es\s+necesario|no\s+hace\s+falta|no\s+quiero\s+darlo)/i;

/** Campos clave de cierre (correo es importante pero opcional si prefiere WhatsApp). */
export const CLOSING_CORE_FIELDS = [
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Lugar/dirección del evento",
  "Fecha y horario",
  "Número de invitados",
  "Presupuesto (MXN)",
] as const;

/** Presentación obligatoria en el primer mensaje de Lucy (voz natural, marca Bodasesor). */
export const LUCY_INTRO = "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor.";

/** Opciones de evento — solo si el cliente pide ejemplos, no en cada pregunta. */
export const TIPO_EVENTO_HINT =
  "Por ejemplo bodas, XV, baby shower, cumpleaños o corporativo.";

/** Texto para que el cliente sepa qué ofrece Bodasesor al preguntar por servicios. */
export const SERVICIOS_CATALOGO_HINT =
  "Manejamos alimentos y barras, mobiliario, carpas, pistas, DJ, iluminación y más.";

/** Variante corta cuando el cliente ya mencionó un servicio. */
export const SERVICIOS_CATALOGO_HINT_ADICIONAL =
  "También podemos sumar bebidas, DJ, iluminación, carpas o mobiliario si te hace falta.";

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
  // V9.12: no pegar el catálogo en cada pregunta (suena a formulario).
  // Solo un tip corto la primera vez que pedimos "otro servicio".
  if (!adicional) return pregunta.trim();
  const hint = SERVICIOS_CATALOGO_HINT_ADICIONAL;
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
  } else if (extracted.requerimientos_evento?.trim()) {
    filledSet.delete("Requerimientos o servicios");
  }
  // Solo invalidar zona si extracted trae un valor NO usable (salón/edificio/medidas/producto).
  // Si extracted viene vacío, respetar lo ya marcado en CRM/filledSet.
  if (extracted.direccion_evento?.trim()) {
    if (
      !isUsableDireccionEvento(extracted.direccion_evento) ||
      isLikelyProductNameNotLocation(extracted.direccion_evento) ||
      (looksLikePersonFullName(extracted.direccion_evento) &&
        !hasCityOrMetroSignal(extracted.direccion_evento))
    ) {
      extracted.direccion_evento = null;
      filledSet.delete("Lugar/dirección del evento");
    } else if (
      extracted.nombre &&
      namesAreLikelySamePerson(extracted.nombre, extracted.direccion_evento)
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

/**
 * V9.23: vuelca un RFQ largo al extracted/filledSet para no re-preguntar
 * fecha/zona/invitados/servicios/correo que el cliente ya mandó.
 */
export function syncRichBriefIntoExtracted(
  extracted: ExtractedData,
  filledSet: Set<string>,
  message: string
): void {
  const text = message?.trim() ?? "";
  if (!text) return;

  if (!isUsableDireccionEvento(extracted.direccion_evento)) {
    const zonaBrief = parseZonaFromText(text);
    if (zonaBrief && isUsableDireccionEvento(zonaBrief)) {
      extracted.direccion_evento = zonaBrief;
      filledSet.add("Lugar/dirección del evento");
    }
  }
  if (!extracted.fecha_horario?.trim()) {
    const f = parseFechaFromText(text);
    if (f) {
      extracted.fecha_horario = f;
      filledSet.add("Fecha y horario");
    }
  }
  if (!extracted.num_invitados) {
    const inv = parseInvitadosFromText(text);
    if (inv) {
      extracted.num_invitados = Number(inv) || (inv as unknown as number);
      filledSet.add("Número de invitados");
    }
  }
  if (!extracted.tipo_evento?.trim()) {
    const tipo = parseTipoEventoFromText(text);
    if (tipo) {
      extracted.tipo_evento = tipo;
      filledSet.add("Tipo de evento");
    }
  }
  const mergedReq = mergeServiceRequirements(
    extracted.requerimientos_evento,
    text,
    8
  );
  if (mergedReq && isValidRequerimientosValue(mergedReq)) {
    extracted.requerimientos_evento = mergedReq;
    filledSet.add("Requerimientos o servicios");
  }
  if (!isEmailSatisfied(filledSet, extracted)) {
    const correo = filterClientEmail(parseCorreoFromText(text));
    if (correo && looksLikeValidClientEmail(correo)) {
      extracted.correo = correo;
      filledSet.add("Correo electrónico");
    }
  }
  if (!sanitizeCrmNombre(extracted.nombre) && looksLikeNameAnswerMessage(text)) {
    // Solo si el mensaje es casi solo el nombre (no el RFQ entero).
    /* skip — RFQ largo ≠ nombre */
  }
  const pres = parsePresupuestoFromText(text);
  if (pres && !filledSet.has("Presupuesto (MXN)")) {
    extracted.presupuesto = pres;
    filledSet.add("Presupuesto (MXN)");
  }
  syncFilledFromExtracted(filledSet, extracted);
}

/** Plantillas legacy — preferir variantes naturales vía buildNaturalQuestion(). */
export const FLOW_QUESTIONS = {
  nombre: "¿Me regalas tu nombre para iniciar?",
  tipoEvento: "¿Qué festejan o qué tipo de evento sería?",
  tipoEventoTrasCorreo: "¿Qué tipo de celebración están planeando?",
  requerimientos: "Platícame, ¿qué te gustaría armar para tu evento?",
  invitados: "¿Más o menos para cuántas personas sería?",
  zona: "¿En qué ciudad sería tu evento? Con la ciudad basta para cotizar; si tienes colonia o salón, mejor.",
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

function getQuestionVariants(): Record<PendingField, string[]> {
  const team = advisorLabelForClient();
  return {
  nombre: [
    "¿Cuál es tu nombre?",
    "¿Cómo te llamas?",
    "¿Me regalas tu nombre?",
  ],
  correo: [
    "¿A qué correo te mando la información?",
    "¿Me compartes un correo para enviarte los detalles?",
    `Si gustas, ¿a qué correo le paso la info a ${team}?`,
  ],
  tipo_evento: [
    "¿Qué van a celebrar?",
    "¿Qué tipo de evento es?",
    "Cuéntame, ¿de qué se trata el evento?",
  ],
  requerimientos: [
    "¿Qué servicios te gustaría ir armando?",
    "Platícame qué te gustaría armar para el evento.",
    "¿Qué necesitas cotizar?",
  ],
  invitados: [
    "¿Más o menos para cuántas personas sería?",
    "¿Cuántos invitados tienen contemplados?",
    "¿Tienen un estimado de invitados? Si aún no, un rango sirve.",
  ],
  zona: [
    "¿En qué ciudad sería tu evento?",
    "¿Me confirmas la ciudad? Con eso cotizamos; colonia o salón si ya lo tienen.",
    "¿En qué ciudad lo arman?",
  ],
  fecha: [
    "¿Ya tienen fecha o todavía la van definiendo?",
    "¿Para cuándo sería el evento?",
    "¿Ya hay día y hora, o siguen viendo opciones?",
  ],
  presupuesto: [
    "¿Tienen algún rango de presupuesto en mente?",
    `¿Prefieren que ${team} les proponga opciones?`,
    "¿Manejan algún presupuesto estimado?",
  ],
};
}

const FIELD_ASK_PATTERNS: Record<PendingField, RegExp> = {
  nombre:
    /cu[aá]l\s+es\s+tu\s+nombre|regalas?\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|con\s+qui[eé]n\s+tengo|tu\s+nombre|me\s+das\s+tu\s+nombre/i,
  correo: /correo|e-?mail|env[ií]o|mandarte|mandar(te)?\s+la\s+info|compartes?\s+un\s+correo/i,
  tipo_evento:
    /festejan|tipo\s+de\s+(evento|celebraci[oó]n)|qu[eé]\s+evento|qu[eé]\s+celebr|de\s+qu[eé]\s+se\s+trata|qu[eé]\s+tipo\s+de\s+celebr/i,
  requerimientos:
    // No usar "pensado" suelto: choca con fechas ("¿para cuándo lo tienen pensado?").
    // No usar "menú" suelto: el bloque de catálogo dice "montajes, menús y opciones" (A14924).
    /qu[eé]\s+(tienes|tienen)\s+pensado|servicios?\s+te\s+gustar|qu[eé]\s+servicios?|banquete|taquiza|cotizar|adem[aá]s\s+del|qu[eé]\s+necesitas|qu[eé]\s+buscas|qu[eé]\s+men[uú]|men[uú]\s+(prefieres|te\s+gustar|quieres)|plat[ií]came\s+qu[eé]/i,
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
  // "banquetes o catering" sigue vago: hay que elegir formal vs casual (Isai A15378).
  if (
    /\bbanquetes?\s+o\s+catering\b|\bcatering\s+o\s+banquetes?\b|\bservicio\s+de\s+banquetes?\b/i.test(
      trimmed
    ) &&
    !/\b(formal|mexicano|\d\s*tiempos?|taquiza|coffee\s*break)\b/i.test(trimmed)
  ) {
    return false;
  }
  // V9.40 A15380: "alimentos" / "comida" sin estilo ≠ requerimientos cerrados.
  if (needsAlimentosTipoClarification(trimmed)) return false;
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
  const looksLikeCierre = (t: string) =>
    t.includes(CLOSING_SIGNATURE) ||
    /\bya tengo todo\b/i.test(t) ||
    /\bcompartir esta informaci[oó]n con nuestro equipo\b/i.test(t) ||
    /\bcotizaci[oó]n personalizada\b/i.test(t);
  if (lastStoredResponse && looksLikeCierre(lastStoredResponse)) return true;
  return history.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      looksLikeCierre(m.content as string)
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

export const INVITADOS_UNAVAILABLE_VALUE =
  "Sin definir (afluencia abierta / cliente no dispone del dato)";

/** El cliente no organiza el evento o atiende un stand y no puede conocer la afluencia. */
export function detectInvitadosUnavailable(
  texts: string[],
  history: OpenAI.Chat.ChatCompletionMessageParam[] = []
): boolean {
  const last = texts[texts.length - 1]?.trim() ?? "";
  const lastAssistant = [...history]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  const askedInvitados =
    !!lastAssistant &&
    (inferLucyAskedField(lastAssistant.content as string) === "invitados" ||
      /cu[aá]nt(?:os|a)\s+(?:invitados|personas)|cu[aá]nta\s+gente|asistir[aá]n/i.test(
        lastAssistant.content as string
      ));
  const explicitUnknown =
    /\bno\s+(?:lo\s+)?sabemos\b|\bno\s+tenemos\s+(?:ese\s+)?dato\b|\bno\s+(?:te\s+)?(?:lo\s+)?(?:puedo|podr[ií]a)\s+(?:decir|confirmar)\b|\bafluencia\s+(?:abierta|desconocida|por\s+definir)\b/i;
  const guestContext =
    /\b(invitados?|personas?|gente|asistentes?|afluencia|cu[aá]nt[oa]s?)\b/i;
  const sponsorContext =
    /\bno\s+organizamos\b[\s\S]{0,80}\bevento\b|\b(?:vamos|asistimos)\s+(?:como|de)\s+patrocinadores?\b|\b(?:stand|expo)\b[\s\S]{0,100}\blleguen\b/i;

  if (texts.some((text) => explicitUnknown.test(text) && guestContext.test(text))) return true;
  if (texts.some((text) => sponsorContext.test(text) && explicitUnknown.test(text))) return true;
  return askedInvitados && (explicitUnknown.test(last) || sponsorContext.test(last));
}

export function applyInvitadosWaiver(
  filledSet: Set<string>,
  mergedLines: string[],
  texts: string[],
  history: OpenAI.Chat.ChatCompletionMessageParam[] = []
): void {
  if (filledSet.has("Número de invitados")) return;
  if (!detectInvitadosUnavailable(texts, history)) return;
  if (!mergedLines.some((line) => /^-?\s*Número de invitados:/i.test(line))) {
    mergedLines.push(`- Número de invitados: ${INVITADOS_UNAVAILABLE_VALUE}`);
  }
  filledSet.add("Número de invitados");
}

function blockResolvedInvitadosAsk(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage: string | undefined,
  buildClosing: (servicios: string | null | undefined, clientName?: string | null) => string,
  cierreYaEnviado: boolean,
  whatsappDisplayName?: string | null,
  entityId?: string | number,
  log?: { info: (obj: unknown, msg?: string) => void }
): string {
  if (!mensajeAsksForField(mensaje, "invitados")) return mensaje;
  applyInvitadosWaiver(
    filledSet,
    [],
    collectUserTexts(history, currentMessage),
    history
  );
  // A15286: si el historial ya trae "N personas", sincronizar antes de re-preguntar.
  if (!isFieldSatisfied("invitados", filledSet, extracted)) {
    const fromHist =
      parseInvitadosFromText(currentMessage ?? "") ||
      collectUserTexts(history, currentMessage)
        .map((t) => parseInvitadosFromText(t))
        .find(Boolean) ||
      null;
    if (fromHist && /^\d+$/.test(fromHist)) {
      extracted.num_invitados = Number(fromHist);
      filledSet.add("Número de invitados");
    }
  }
  if (!isFieldSatisfied("invitados", filledSet, extracted)) return mensaje;

  const pending = getNextPendingField(extracted, filledSet);
  log?.info({ entityId, pending }, "GUARD: afluencia desconocida — no repetir invitados");
  if (pending) {
    return buildNaturalQuestion(pending, {
      extracted,
      filledSet,
      whatsappName: whatsappDisplayName,
      history,
      currentMessage,
      entityId,
    });
  }
  if (!cierreYaEnviado && isReadyForClosing(filledSet)) {
    return buildClosing(
      extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
      extracted.nombre
    );
  }
  return "Entendido. Anoto que la afluencia es abierta y que no disponen de ese dato.";
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
    const label =
      /propuesta|opciones?/i.test(last) && !/\bno\s+(tengo|tenemos|cuento)\b/i.test(last)
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
    texts.some(
      (t) =>
        /^(no\s+tengo|no\s+tenemos|no\s+cuento|sin|opciones?|propuestas?)[\s.,!]*$/i.test(
          t.trim()
        ) ||
        (t.length <= 100 && /\b(una\s+)?propuesta\b/i.test(t))
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
    .some((m) =>
      /hola[!.,]?\s*(?:buen\s+d[ií]a[.!]?\s*)?soy\s+lucy|soy\s+lucy,\s*agente\s+virtual\s+de\s+bodasesor/i.test(
        m.content as string
      )
    );
}

/** True si la conversación ya avanzó más allá del saludo inicial. */
function conversationAlreadyStarted(
  filledSet: Set<string>,
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  if (history.some((m) => m.role === "assistant")) return true;
  // Nombre desde WhatsApp/Kommo NO cuenta como conversación iniciada (A15370 Allison).
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
    .replace(
      /¡?Hola!?\.?\s*(?:Buen\s+d[ií]a\.?\s*)?Soy\s+Lucy(?:,\s*agente\s+virtual)?\s+de\s+Bodasesor\.?\s*/gi,
      ""
    )
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

/** Cliente pide asesor humano (A15000): confirma handoff + teléfonos; no sigue embudo. */
export function buildHumanAdvisorHandoffAnswer(clientName?: string | null): string {
  const name = sanitizeDisplayName(clientName);
  const hi = name ? `${name}, ` : "";
  return [
    `Claro que sí, ${hi}con gusto te canalizo con un asesor de Bodasesor para que te atiendan de forma personalizada.`,
    "",
    "Mientras te contactan, también puedes marcar:",
    "Ventas: 55 4008 0373 — solo por línea telefónica (no WhatsApp).",
    "Gerencia / corporativo: 56 4671 0585 — WhatsApp o línea telefónica.",
    "",
    "Ya dejé tu caso listo para el equipo.",
  ].join("\n");
}

/** Respuesta estándar de ubicación y cobertura (prompt sección 7). */
export function buildLocationAnswer(): string {
  return "Estamos en Ciudad de México y trabajamos en toda la república. Según la fecha y el lugar de tu evento, coordinamos el servicio.";
}

/** Pitch / menú de comida italiana (A15302: barra italiana → pastas/pizzas, no bebidas). */
export function buildItalianFoodPitch(message?: string): string {
  const inv = message?.match(/(\d+)\s*(?:personas?|invitados?)/i);
  const asksBarra = /\bbarra\b/i.test(message ?? "");
  if (asksBarra) {
    return buildProgressiveOptionsMenu("barra_alimentos", message ?? "barra italiana");
  }
  let pitch =
    "Para temática italiana manejamos *barra de pastas y ensaladas*, *barra de pizzas*, antipasti y estaciones italianas";
  if (inv) pitch += ` para ${inv[1]} personas`;
  return `${pitch}. ¿Te late más pastas, pizzas, o te detallo ambas?`;
}

/** Variantes concretas del catálogo Pistas/Tarimas (A14967 — menú primero, detalle después). */
const PISTA_TARIMA_VARIANTS: ReadonlyArray<{
  key: string;
  label: string;
  pattern: RegExp;
  query: string;
}> = [
  {
    key: "pista_pintada",
    label: "Pista Pintada a Mano",
    pattern: /\bpista\s+pintada|\bpintada\s+a\s+mano\b/i,
    query: "pista pintada a mano",
  },
  {
    key: "pista_led",
    label: "Pista LED Interactiva",
    pattern: /\bpista\s+led\b|\bled\s+interactiva\b|\bpista\s+interactiva\b/i,
    query: "pista LED interactiva",
  },
  {
    key: "pista_iluminada",
    label: "Pista Iluminada",
    pattern: /\bpista\s+iluminada\b/i,
    query: "pista iluminada",
  },
  {
    key: "pista_madera_premium",
    label: "Pista Madera Premium",
    pattern: /\bpista\s+madera\s+premium\b/i,
    query: "pista madera premium",
  },
  {
    key: "pista_logo",
    label: "Pista Vinil con Logo",
    pattern:
      /\bpista\s+(vinil|charol)\b|\bcon\s+logo\b|\bmonograma\b|\blogotipo\b|\blogos?\s+en\s+vinil\b/i,
    query: "pista vinil logo charol personalizado",
  },
  {
    key: "pista_madera",
    label: "Pista Madera",
    pattern: /\bpista\s+madera\b(?!\s+premium)/i,
    query: "pista madera",
  },
  {
    key: "tarima_charol",
    label: "Tarima Charol",
    pattern: /\btarima\s+charol\b/i,
    query: "tarima charol",
  },
  {
    key: "tarima_madera",
    label: "Tarima Básica Madera",
    pattern: /\btarima\s+(b[aá]sica\s+)?madera\b/i,
    query: "tarima básica madera",
  },
  {
    key: "tarima_gris",
    label: "Tarima Básica Gris/Blanco",
    pattern: /\btarima\s+(b[aá]sica\s+)?(gris|blanco)\b|\btarima\s+b[aá]sica\b/i,
    query: "tarima básica gris blanco",
  },
  {
    key: "escenario",
    label: "Escenario / Estrado",
    pattern: /\bescenario\b|\bestrado\b/i,
    query: "escenario estrado",
  },
];

/** Detecta si el cliente ya eligió un tipo concreto de pista/tarima. */
export function parsePistaTarimaVariant(
  text: string | null | undefined
): { key: string; label: string; query: string } | null {
  const t = text?.trim() ?? "";
  if (!t) return null;
  // "personalizada" sola es vaga — no elegir variante (A14967 Angélica).
  for (const v of PISTA_TARIMA_VARIANTS) {
    if (v.pattern.test(t)) return { key: v.key, label: v.label, query: v.query };
  }
  // Respuestas cortas tras el menú ("la LED", "charol", "pintada").
  const short = t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:]+/g, "")
    .trim();
  if (/^(la\s+)?led(\s+interactiva)?$/.test(short) || /^interactiva$/.test(short)) {
    return { key: "pista_led", label: "Pista LED Interactiva", query: "pista LED interactiva" };
  }
  if (/^(la\s+)?iluminada$/.test(short)) {
    return { key: "pista_iluminada", label: "Pista Iluminada", query: "pista iluminada" };
  }
  if (/^(la\s+)?pintada(\s+a\s+mano)?$/.test(short)) {
    return { key: "pista_pintada", label: "Pista Pintada a Mano", query: "pista pintada a mano" };
  }
  if (/^(con\s+)?logo|vinil|monograma$/.test(short)) {
    return {
      key: "pista_logo",
      label: "Pista Vinil con Logo",
      query: "pista vinil logo charol personalizado",
    };
  }
  if (/^charol$/.test(short)) {
    return { key: "tarima_charol", label: "Tarima Charol", query: "tarima charol" };
  }
  if (/^(pista\s+)?madera(\s+premium)?$/.test(short)) {
    return /\bpremium\b/.test(short)
      ? { key: "pista_madera_premium", label: "Pista Madera Premium", query: "pista madera premium" }
      : { key: "pista_madera", label: "Pista Madera", query: "pista madera" };
  }
  return null;
}

function buildPistaTarimaOptionsMenu(currentMessage?: string, dims?: string | null): string {
  const personalizada = /\bpersonalizad/i.test(currentMessage ?? "");
  const dimsNote = dims
    ? ` Anoto espacio aprox. *${dims.replace(/m/gi, " m")}*.`
    : "";
  const personalHint = personalizada
    ? " Para personalizada suelen ir *Vinil con logo* o *Pintada a mano*."
    : "";
  return (
    `Sí, manejamos *pista de baile* y *tarima* a medida.${dimsNote}${personalHint}\n\n` +
    `Opciones principales:\n` +
    `• *Tarimas básicas* — gris/blanco, madera o charol\n` +
    `• *Pista madera* / madera premium\n` +
    `• *Pista LED* o *iluminada*\n` +
    `• *Pista vinil con logo* o *pintada a mano*\n` +
    `• Escenarios / estrados\n\n` +
    `${SERVICE_NIVEL_DETAIL_CTA}` +
    (dims ? "" : " Si ya tienes medidas del espacio, mándamelas y afinamos.")
  );
}

function collapseDuplicateMedidasAsk(text: string): string {
  if (!text?.trim()) return text;
  const askRe = /¿Qué medidas aproximadas tiene el espacio\?/gi;
  const matches = [...text.matchAll(askRe)];
  if (matches.length <= 1) return text;
  // Dejar solo la primera aparición de la pregunta.
  let seen = false;
  return text
    .replace(askRe, (m) => {
      if (seen) return "";
      seen = true;
      return m;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  // Buscar variante en el mensaje actual o en el historial reciente del cliente.
  const histBlob = collectUserTexts(history, currentMessage).slice(-6).join(" ");
  const variant =
    parsePistaTarimaVariant(currentMessage) || parsePistaTarimaVariant(histBlob);

  if (filledSet) {
    filledSet.add("Requerimientos o servicios");
  }
  const reqLabel = variant
    ? dims
      ? `${variant.label} (${dims.replace(/m/gi, " m")})`
      : variant.label
    : dims
      ? `pista/tarima ${dims.replace(/m/gi, " m")}`
      : "pista de baile / tarima";
  if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
    extracted.requerimientos_evento = reqLabel;
  } else if (variant && extracted.requerimientos_evento && !new RegExp(variant.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(
    extracted.requerimientos_evento
  )) {
    extracted.requerimientos_evento = dims
      ? `${extracted.requerimientos_evento}; ${variant.label} (${dims.replace(/m/gi, " m")})`
      : `${extracted.requerimientos_evento}; ${variant.label}`;
  } else if (dims && extracted.requerimientos_evento && !extracted.requerimientos_evento.includes(dims)) {
    extracted.requerimientos_evento = `${extracted.requerimientos_evento}; pista/tarima ${dims}`;
  }

  // A14967: sin tipo elegido → menú corto (NO bombardear precios del PDF).
  if (!variant) {
    const menu = buildPistaTarimaOptionsMenu(currentMessage, dims);
    return collapseDuplicateMedidasAsk(`${pickTransition(history)} ${menu}`.trim());
  }

  // Ya eligieron estilo → detalle técnico/precios de ESA variante.
  const fromPdf = buildLucyInfoLearnedPriceReply(variant.query);
  let intro: string;
  if (fromPdf) {
    const focused = fromPdf
      .replace(
        /Según el catálogo que ya cargamos en Aprendizaje:/i,
        `Perfecto, te detallo *${variant.label}*:`
      )
      .trim();
    intro = dims
      ? `${focused}\nAnoto medidas ${dims.replace(/m/gi, " m")} para afinar la cotización.`
      : focused;
  } else if (dims) {
    intro = `Perfecto, anoto *${variant.label}* (${dims.replace(/m/gi, " m")}) para tu cotización. El equipo confirma el precio según esas medidas.`;
  } else {
    intro = `Perfecto, anoto *${variant.label}*. ¿Qué medidas aproximadas tiene el espacio?`;
  }

  intro = collapseDuplicateMedidasAsk(intro);

  if (!dims) {
    // Asegurar una sola pregunta de medidas.
    if (!/medidas aproximadas/i.test(intro)) {
      intro = `${intro}\n\n¿Qué medidas aproximadas tiene el espacio?`;
    }
    return collapseDuplicateMedidasAsk(`${pickTransition(history)} ${intro}`.trim());
  }

  const filledAfter = new Set(filledSet ?? []);
  filledAfter.add("Requerimientos o servicios");
  const pending = getNextPendingField(extracted, filledAfter);
  if (pending && pending !== "requerimientos" && ctx) {
    const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
    return collapseDuplicateMedidasAsk(
      `${pickTransition(history)} ${intro}\n\n${nextQ}`.trim()
    );
  }
  return collapseDuplicateMedidasAsk(`${pickTransition(history)} ${intro}`.trim());
}

/** Carpas: sí/no real + agregar a cotización + medidas (María A14906 / A15016 / A15007). */
function buildCarpasSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  filledSet?: Set<string>,
  ctx?: NaturalQuestionContext
): string {
  const msg = currentMessage ?? "";
  // A15286: pregunta concreta (fotos/luz/capacidad) gana sobre plantilla de medidas.
  {
    const concrete = buildConcreteProductQuestionReply(
      msg,
      extracted.requerimientos_evento
    );
    if (concrete) {
      if (filledSet) filledSet.add("Requerimientos o servicios");
      if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
        extracted.requerimientos_evento = "Carpas";
      } else if (!/\bcarpas?\b/i.test(extracted.requerimientos_evento ?? "")) {
        const merged = mergeServiceRequirements(
          extracted.requerimientos_evento,
          "Carpas",
          6
        );
        if (merged) extracted.requerimientos_evento = merged;
      }
      const filledAfter = new Set(filledSet ?? []);
      filledAfter.add("Requerimientos o servicios");
      const pending = getNextPendingField(extracted, filledAfter);
      if (pending && pending !== "requerimientos" && ctx) {
        const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
        return `${pickTransition(history)} ${concrete}\n\n${nextQ}`.trim();
      }
      return `${pickTransition(history)} ${concrete}`.trim();
    }
  }
  const dims =
    parseSpaceDimensions(msg) ||
    (extracted.requerimientos_evento?.match(/\d+m\s*x\s*\d+m/i)?.[0] ?? null) ||
    collectUserTexts(history, msg)
      .map((t) => parseSpaceDimensions(t))
      .find(Boolean) ||
    null;
  const variant = parseCarpaVariantFromText(msg);
  const transparent = /transparent/i.test(msg) || /transparent/i.test(variant ?? "");
  const alreadyHasCarpas = /\bcarpas?\b/i.test(extracted.requerimientos_evento ?? "");
  const alreadyPitched = history.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      /carpas?\s+(?:blancas?|negras?|transparentes?)|tipo\s+domo/i.test(m.content)
  );
  // A14994: "Carpas o mobiliario" — anotar ambos + catálogo (no saltar solo a zona).
  // A15286: "3 mesas por carpa???" ≠ pedir mobiliario.
  const asksCapacity = clientAsksCapacityLayout(msg);
  const alsoMobiliario =
    !asksCapacity &&
    /\bmobiliario\b|\bmesas?\b|\bsillas?\b|\bperiqueras?\b/i.test(msg);

  if (filledSet) filledSet.add("Requerimientos o servicios");
  const baseLabel =
    variant || (transparent ? "Carpas transparentes" : "Carpas");
  const label = alsoMobiliario ? `${baseLabel}, Mobiliario` : baseLabel;
  if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
    extracted.requerimientos_evento = dims ? `${label} (${dims})` : label;
  } else {
    const merged = mergeServiceRequirements(
      extracted.requerimientos_evento,
      dims ? `${label} (${dims})` : label,
      6
    );
    if (merged) extracted.requerimientos_evento = merged;
  }

  // Ya presentó las opciones reales y carpas está en CRM — no repetir el listado.
  if (alreadyHasCarpas && alreadyPitched && !variant && !alsoMobiliario) {
    const filledAfter = new Set(filledSet ?? []);
    filledAfter.add("Requerimientos o servicios");
    const pending = getNextPendingField(extracted, filledAfter);
    let ack: string;
    if (dims) {
      ack = `Perfecto — anoto la carpa de *${dims.replace(/m/gi, " m")}*.`;
    } else if (/sencill|solo\s+la\s+carpa|nada\s+m[aá]s|tenemos\s+mesas/i.test(msg)) {
      ack =
        "Perfecto — nos quedamos solo con la *carpa* (sin mobiliario extra). El equipo cotiza según medidas y sede.";
    } else {
      ack = "Claro — seguimos con tu cotización de *carpas*.";
    }
    if (!dims) {
      // Solo pedir medidas si aún no las tenemos.
      const histHasDims = !!collectUserTexts(history, msg)
        .map((t) => parseSpaceDimensions(t))
        .find(Boolean);
      if (!histHasDims && !/\d+\s*x\s*\d+/i.test(extracted.requerimientos_evento ?? "")) {
        return `${pickTransition(history)} ${ack} ¿Qué medidas aproximadas necesitas?`.trim();
      }
    }
    if (pending && pending !== "requerimientos" && ctx) {
      const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
      return `${pickTransition(history)} ${ack}\n\n${nextQ}`.trim();
    }
    return `${pickTransition(history)} ${ack}`.trim();
  }

  if (alsoMobiliario) {
    const ack = `Perfecto — anoto *carpas* y *mobiliario* para tu evento.${
      transparent ? " Incluyo la opción de carpas transparentes." : ""
    }`;
    const catalog = buildPackageCatalogOfferBlock(
      ["Carpas", "Mobiliario"],
      `${msg} ${extracted.requerimientos_evento ?? ""}`
    );
    let body = `${ack}\n\n${catalog}`;
    if (!dims) {
      body = `${body}\n\nPara cotizar bien las carpas, ¿me compartes medidas aproximadas del área a cubrir (o del espacio)?`;
      return `${pickTransition(history)} ${body}`.trim();
    }
    const filledAfter = new Set(filledSet ?? []);
    filledAfter.add("Requerimientos o servicios");
    const pending = getNextPendingField(extracted, filledAfter);
    if (pending && pending !== "requerimientos" && ctx) {
      const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
      return `${pickTransition(history)} ${body}\n\n${nextQ}`.trim();
    }
    return `${pickTransition(history)} ${body}`.trim();
  }

  // Solo medidas tras ask de carpas (A15016: "De 6 x20").
  if (dims && isDimensionText(msg)) {
    const filledAfter = new Set(filledSet ?? []);
    filledAfter.add("Requerimientos o servicios");
    const pending = getNextPendingField(extracted, filledAfter);
    const ack = `Perfecto — anoto medidas *${dims.replace(/m/gi, " m")}* para la carpa.`;
    if (pending && pending !== "requerimientos" && ctx) {
      const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
      return `${pickTransition(history)} ${ack}\n\n${nextQ}`.trim();
    }
    return `${pickTransition(history)} ${ack}`.trim();
  }

  // Variante disponible tras el listado.
  if (variant && !/carpas?/i.test(msg)) {
    const filledAfter = new Set(filledSet ?? []);
    filledAfter.add("Requerimientos o servicios");
    const pending = getNextPendingField(extracted, filledAfter);
    const ack = dims
      ? `Perfecto — anoto *${variant}* (${dims.replace(/m/gi, " m")}) para tu cotización.`
      : `Perfecto — anoto *${variant}* para tu cotización.`;
    if (!dims) {
      return `${pickTransition(history)} ${ack} ¿Qué medidas aproximadas necesitas?`.trim();
    }
    if (pending && pending !== "requerimientos" && ctx) {
      const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
      return `${pickTransition(history)} ${ack}\n\n${nextQ}`.trim();
    }
    return `${pickTransition(history)} ${ack}`.trim();
  }

  // Carpas solas (A14906): ack consultivo + medidas; sin volcar catálogo genérico.
  const ack = buildGuardServiceAck(msg || "carpas transparentes");
  // Si ya trajeron medidas en el mismo turno, no re-preguntar medidas.
  if (dims && /medidas/i.test(ack)) {
    const withoutMedidasAsk = ack
      .replace(/\s*¿Qué medidas aproximadas necesitas\?/gi, "")
      .replace(/\s*¿Qué medidas aproximadas tiene el espacio\?/gi, "")
      .trim();
    const filledAfter = new Set(filledSet ?? []);
    filledAfter.add("Requerimientos o servicios");
    const pending = getNextPendingField(extracted, filledAfter);
    const body = `${withoutMedidasAsk} Anoto medidas *${dims.replace(/m/gi, " m")}*.`;
    if (pending && pending !== "requerimientos" && ctx) {
      const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
      return `${pickTransition(history)} ${body}\n\n${nextQ}`.trim();
    }
    return `${pickTransition(history)} ${body}`.trim();
  }
  if (!dims) {
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
  const msg = currentMessage ?? "";
  const eventLabel =
    /corporativo|empresa|convenci[oó]n|convencion/.test(tipo) ||
    /empresa|corporativo|convenci[oó]n/i.test(msg)
      ? "tu evento corporativo"
      : tipo
        ? `tu ${tipo}`
        : "tu evento";

  const wantsMc = /\b(maestro\s+de\s+ceremonias?|master\s+of\s+ceremonies|\bmc\b|presentador)\b/i.test(
    msg
  );
  const wantsRobots = /\brobots?\s*leds?\b|\bled\s*robots?\b|\brobots?\s+less\b/i.test(msg);
  const wantsBatucada = /\bbatucada\b/i.test(msg);
  // A14988: bailarinas / dancers para concierto u otro evento.
  const wantsBailarinas = /\bbailarinas?\b|\bdancers?\b|\bvedettes?\b/i.test(msg);
  // A15003: photo booth / cabina de fotos.
  const wantsPhotoBooth =
    /\b(photo\s*booths?|photobooths?|cabina(s)?\s+de\s+fotos?|cabina(s)?\s+fotogr[aá]ficas?|espejo\s+m[aá]gico|mirror\s+booth)\b/i.test(
      msg
    );
  // A15009: circo / Blue Man / actos especiales.
  const specialActLabel = parseSpecialLiveActLabel(msg);
  const wantsSpecialAct = !!specialActLabel || clientMentionsSpecialLiveAct(msg);
  const services = parseServicesFromText(msg);
  const label =
    (services.length ? services.join(", ") : null) ||
    (wantsPhotoBooth ? "Photo Booth" : null) ||
    specialActLabel ||
    (wantsBailarinas ? "Bailarinas" : null) ||
    (wantsRobots ? "Robots LED" : null) ||
    (wantsBatucada ? "Batucada" : null) ||
    (wantsMc ? "Maestro de ceremonias y show" : "Animación / Hora loca y shows");

  if (filledSet) {
    filledSet.add("Requerimientos o servicios");
    const merged = mergeServiceRequirements(extracted.requerimientos_evento, label, 6);
    if (merged) extracted.requerimientos_evento = merged;
  }

  let intro: string;
  let ideas: string;
  if (wantsPhotoBooth) {
    intro = `Perfecto — anoto *Photo Booth* (cabina de fotos) para ${eventLabel}.`;
    ideas = "El equipo te confirma modelos, props, fondo y tiempo de renta.";
  } else if (wantsSpecialAct) {
    const act = specialActLabel || "ese show / acto";
    intro = `Perfecto — anoto *${act}* para ${eventLabel}.`;
    ideas =
      "Es entretenimiento / show en vivo: el equipo confirma disponibilidad, formato y propuesta.";
  } else if (wantsBailarinas) {
    intro = `Perfecto — anoto *bailarinas* para ${eventLabel}.`;
    ideas =
      "Es entretenimiento / show en vivo: el equipo arma la propuesta según duración, estilo y el espacio.";
  } else if (wantsRobots && wantsBatucada) {
    intro = `Perfecto — anoto *robots LED* para ambientar la *batucada* en ${eventLabel}.`;
    ideas =
      "Nuestro equipo arma la propuesta según duración, cantidad de robots y el espacio.";
  } else if (wantsRobots) {
    intro = `Perfecto — anoto *robots LED* para ${eventLabel}.`;
    ideas =
      "Es un servicio de entretenimiento/activación: el equipo confirma disponibilidad, duración y montaje.";
  } else if (wantsBatucada) {
    intro = `Claro — podemos ayudarte a *ambientar una batucada* en ${eventLabel}.`;
    ideas =
      "Para eso solemos sumar activaciones (robots LED, show, iluminación o animación) según el vibe que busquen.";
  } else if (wantsMc) {
    intro = `Sí, para ${eventLabel} también manejamos *maestro de ceremonias* y shows en vivo.`;
    ideas = "¿Buscas más bien presentador, show de grupo, o animación tipo hora loca?";
  } else {
    // V8.93 / A15165: descubrir estilo antes de listar todo; siempre hub de catálogos.
    intro = `Claro — para entretenimiento en ${eventLabel} te apoyamos con shows, animación y performance.`;
    ideas =
      "¿Buscas algo más tipo show en vivo, hora loca, o ya tienes un formato en mente?";
  }

  // Entretenimiento: catálogos mapeados si hay SKUs; si no, hub (A14920 / V8.79 / A15165).
  const entServices = collectServicesForCatalogOffer({
    services: [
      ...services,
      ...(wantsPhotoBooth ? ["Photo Booth"] : []),
      ...(wantsSpecialAct && specialActLabel ? [specialActLabel] : []),
      ...(wantsBailarinas ? ["Bailarinas", "Animación / Hora loca"] : []),
      ...(wantsRobots ? ["Robots LED"] : []),
      ...(wantsBatucada ? ["Batucada"] : []),
      ...(wantsMc ? ["Maestro de ceremonias"] : []),
      ...(!wantsPhotoBooth && !wantsSpecialAct && !wantsBailarinas && !wantsRobots && !wantsBatucada && !wantsMc
        ? ["Animación / Hora loca", "show"]
        : []),
    ],
    extracted,
    history,
    currentMessage,
  });
  // Photo Booth / actos especiales: no dump de banquete — hub sí para shows genéricos.
  let catalog =
    wantsPhotoBooth || wantsSpecialAct
      ? ""
      : buildPackageCatalogOfferBlock(
          entServices,
          `${currentMessage ?? ""} ${extracted.requerimientos_evento ?? ""}`
        );
  if (!catalog && !wantsPhotoBooth) {
    catalog = [
      "Te dejo el catálogo general (shows, animación y más servicios):",
      getCatalogWebHubDeliveryUrl(),
    ].join("\n");
  }
  let body = catalog ? `${intro} ${ideas}\n\n${catalog}` : `${intro} ${ideas}`;

  if (filledSet && ctx) {
    const pending = getNextPendingField(extracted, filledSet);
    // Si ya dieron correo/nombre/etc., pedir el siguiente dato útil (no repreguntar servicios).
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
  const tipoFromMsg = parseTipoEventoFromText(currentMessage ?? "");
  if (tipoFromMsg && !extracted.tipo_evento?.trim()) {
    extracted.tipo_evento = tipoFromMsg;
  }
  const tipo = (extracted.tipo_evento ?? parseTipoEventoFromText(texts) ?? "").toLowerCase();
  const inv = extracted.num_invitados ?? 0;
  const gettingReady = isGettingReadyContext(texts) || isGettingReadyContext(currentMessage);
  const msg = currentMessage ?? "";

  // A15302: cumpleaños pequeño + "tu menú" → formal vs casual (sesgo casual), sin dump banquete.
  if (
    clientAsksForFoodMenu(msg) ||
    isVagueFoodTerm(msg) ||
    /\b(comidas?|alimentos?|catering|banquetes?)\b/i.test(msg)
  ) {
    if (historyOfferedAlimentosModoMenu(history)) {
      if (clientChoseBanqueteFormal(msg)) {
        return `${pickTransition(history)} ${buildProgressiveOptionsMenu("banquete")}`.trim();
      }
      if (clientChoseCateringCasual(msg)) {
        return `${pickTransition(history)} ${buildCateringCasualMenu()}`.trim();
      }
    }
    if (!historyOfferedAlimentosModoMenu(history) && !historyOfferedServiceOptionsMenu(history)) {
      const smallBirthday =
        /\bcumplea/i.test(tipo) && (inv > 0 ? inv <= 50 : /\bpeque[nñ]o\b/i.test(msg));
      if (smallBirthday) {
        return [
          pickTransition(history),
          "Para un cumpleaños más pequeño suele ir muy bien algo *casual* (barra de pastas/pizzas, taquiza, canapés…) o un *banquete* más formal si lo prefieres.",
          "",
          buildAlimentosModoMenu(),
        ]
          .join("\n")
          .trim();
      }
      return `${pickTransition(history)} ${buildAlimentosModoMenu()}`.trim();
    }
  }

  let options: string;
  let linkHint = "banquete";
  if (gettingReady || (/\bboda\b/.test(tipo) && inv > 0 && inv <= 30)) {
    options =
      "Para el getting ready suele ir desayuno o brunch ligero, canapés o coffee break — sin pista ni DJ.";
    linkHint = "coffee break";
  } else if (/baby\s*shower/.test(tipo) || /baby\s*shower/.test(texts)) {
    options = "Para baby shower van bien brunch o banquete ligero, mesa de dulces o bocadillos.";
    linkHint = "brunch";
  } else if (/\bboda\b/.test(tipo) && inv >= 150) {
    options = "Para boda grande lo más pedido es banquete, taquiza o barra de bebidas.";
    linkHint = "banquete";
  } else if (/bautizo/.test(tipo) || /\bbautizo\b/.test(texts)) {
    options = "Para bautizo suele ir banquete o brunch, mesa de dulces o bocadillos.";
    linkHint = "banquete";
  } else if (/corporativo|campamento/.test(tipo) || /corporativ|campamento|atletas/.test(texts)) {
    options =
      "Para este tipo de evento manejamos desayuno, comida corrida, banquete o estaciones casuales. ¿Lo ves más formal o más casual?";
    linkHint = "comida corrida";
  } else if (clientAsksCafeOrCateringChoice(msg)) {
    // A14964 Victor: no volcar solo banquete ni anotar taquiza por "comida".
    options =
      "Manejamos ambas: *Barra de Café* (baristas y bebidas artesanales) y *catering de comida* (banquete, barras de alimentos, meseros). ¿Qué te late más para tu evento?";
    linkHint = "banquete";
  } else {
    return `${pickTransition(history)} ${buildAlimentosModoMenu()}`.trim();
  }

  const follow = pickVariant("requerimientos", history, entityId);
  return `${pickTransition(history)} ${options} ${follow}`.trim();
}

/** Tras menú de opciones: detalle + link de catálogo (o re-pregunta cuál). */
function buildProgressiveDetailAfterMenu(opts: {
  extracted: ExtractedData;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  currentMessage?: string;
  filledSet?: Set<string>;
  serviceHint?: string | null;
}): string | null {
  const { extracted, history, currentMessage, filledSet, serviceHint } = opts;
  if (!historyOfferedServiceOptionsMenu(history)) return null;
  if (!clientWantsServiceDetail(currentMessage, history)) return null;

  const hint = serviceHint || extracted.requerimientos_evento;
  const detailQuery = resolveProgressiveDetailQuery({
    currentMessage,
    serviceHint: hint,
    history,
  });

  // "Sí" / "dale" / "todos" sin elegir → toda la info de la familia + link aparte.
  if (!detailQuery && isBareProgressiveAffirmation(currentMessage)) {
    const family =
      detectProgressiveFamily(hint) ||
      detectProgressiveFamily(
        collectUserTexts(history, currentMessage).join(" ")
      );
    if (family) {
      const queries = progressiveFamilyDetailQueries(family);
      const chunks: string[] = [];
      for (const q of queries) {
        const d =
          buildCatalogServiceDetailAnswer(q) ||
          buildCatalogPriceAnswer(q) ||
          attachAvailableSheetDetail(q, q);
        if (d) chunks.push(d);
      }
      const linkQ = queries[0] || family;
      const link = buildServicePlusGeneralCatalogReply({
        query: linkQ,
        serviceHint: hint || linkQ,
      });
      if (filledSet) {
        filledSet.add("Requerimientos o servicios");
        const merged = mergeServiceRequirements(
          extracted.requerimientos_evento,
          queries[0] || family,
          6
        );
        if (merged) extracted.requerimientos_evento = merged;
      }
      if (chunks.length) {
        const body = withServiceAndGeneralCatalogLinks(
          chunks.join("\n\n"),
          linkQ,
          hint || linkQ
        );
        return `${pickTransition(history)} Claro, te paso el detalle de las opciones:\n\n${body}`.trim();
      }
      return `${pickTransition(history)} ${link}`.trim();
    }
  }

  if (!detailQuery) {
    return `${pickTransition(history)} ${SERVICE_NIVEL_DETAIL_CTA}`.trim();
  }
  if (filledSet) {
    filledSet.add("Requerimientos o servicios");
    const merged = mergeServiceRequirements(
      extracted.requerimientos_evento,
      detailQuery,
      6
    );
    if (merged) extracted.requerimientos_evento = merged;
  }
  const detail =
    buildCatalogServiceDetailAnswer(detailQuery) ||
    buildCatalogPriceAnswer(detailQuery) ||
    attachAvailableSheetDetail(detailQuery, detailQuery);
  // A14975: no re-listar niveles ni duplicar el mismo URL; servicio + general.
  const body = withServiceAndGeneralCatalogLinks(
    detail || `Anoto *${detailQuery}*.`,
    detailQuery,
    detailQuery
  );
  if (detail) {
    return `${pickTransition(history)} Te detallo *${detailQuery}*:\n\n${body}`.trim();
  }
  return `${pickTransition(history)} ${body}`.trim();
}

function buildFoodSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number,
  currentMessage?: string,
  filledSet?: Set<string>,
  ctx?: NaturalQuestionContext
): string | null {
  // A14962: batucada / robots LED ≠ catering. No volcar banquete.
  const blob = `${currentMessage ?? ""} ${extracted.requerimientos_evento ?? ""}`;
  if (
    clientMentionsLedRobotsOrBatucada(currentMessage) ||
    clientMentionsLedRobotsOrBatucada(extracted.requerimientos_evento ?? "") ||
    (clientMentionsEntertainment(currentMessage) &&
      !/\b(banquete|taquiza|coffee|brunch|catering|barra\s+de\s+alimentos)\b/i.test(blob))
  ) {
    return null;
  }

  if (isVagueFoodTerm(currentMessage)) {
    return buildVagueFoodOptionsReply(extracted, history, currentMessage, entityId);
  }

  const tipo = (extracted.tipo_evento ?? "").trim().toLowerCase();
  // A14982: no usar servicio (taquiza/parrillada) como "tipo" → "para un taquiza".
  const tipoIsServiceSku =
    /^(taquiza|parrillada|pozolada|paellada|banquete|barra|coffee\s*break)$/i.test(tipo) ||
    (/taquiza|parrillada|banquete|barra de/i.test(tipo) &&
      !/boda|cumplea|bautizo|xv|corporativ|gradu|baby/i.test(tipo));
  const eventLabel =
    !tipo || tipoIsServiceSku
      ? "tu evento"
      : tipo === "cumpleaños"
        ? "un cumpleaños"
        : tipo === "boda"
          ? "una boda"
          : tipo === "xv años"
            ? "XV años"
            : `un ${tipo}`;
  const eventPhrase = eventLabel === "tu evento" ? "" : ` para ${eventLabel}`;

  const mentionedService = currentMessage ? findMentionedService(currentMessage) : null;

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

  const allServices = currentMessage
    ? dedupeServiceHierarchy(parseServicesFromText(clientCaptionForServiceParse(currentMessage)))
    : [];
  const crmService = isValidRequerimientosValue(extracted.requerimientos_evento)
    ? extracted.requerimientos_evento!.trim()
    : null;
  // A14970: nunca usar el mensaje crudo (slice 80) como nombre de servicio.
  const resolvedServiceLabel =
    preferPrimaryCatalogService(allServices) ||
    mentionedService ||
    parsePrimaryService(clientCaptionForServiceParse(currentMessage) || currentMessage || "") ||
    (crmService ? preferPrimaryCatalogService(parseServicesFromText(crmService)) || crmService : null);

  if (
    (allServices.length >= 2 || (currentMessage && isRichQuoteBrief(currentMessage))) &&
    !looksLikeConflictingFoodAlternatives(allServices)
  ) {
    const listLabel =
      preferPrimaryCatalogService(allServices) ||
      allServices.join(", ");
    const packageReply = buildMultiServicePackageReply(
      allServices,
      currentMessage
    );
    return appendNext(`${pickTransition(history)} ${packageReply}`, listLabel || null);
  }

  // Preferencias sobre servicio ya capturado (bebidas de la barra de café) — ack, no dump.
  if (
    currentMessage &&
    isServicePreferenceRefinement(currentMessage, crmService || resolvedServiceLabel)
  ) {
    const label = resolvedServiceLabel || crmService || "tu cotización";
    if (filledSet) {
      filledSet.add("Requerimientos o servicios");
      const snippet = currentMessage.trim().replace(/\s+/g, " ").slice(0, 180);
      const merged = mergeServiceRequirements(
        extracted.requerimientos_evento,
        `preferencia: ${snippet}`,
        6
      );
      if (merged) extracted.requerimientos_evento = merged;
    }
    return appendNext(
      `${pickTransition(history)} Perfecto, anoto esa preferencia para *${label}* y se la paso al equipo.`,
      resolvedServiceLabel
    );
  }

  // A15205: "cotizar comidas" → formal vs casual, no Formal/Mexicano.
  if (currentMessage && isVagueFoodTerm(currentMessage)) {
    return buildVagueFoodOptionsReply(extracted, history, currentMessage, entityId);
  }

  if (mentionedService || resolvedServiceLabel || (currentMessage && isServiceRelatedMessage(currentMessage))) {
    const serviceLabel = resolvedServiceLabel;

    // V8.68: menú de opciones ANTES del dump de precios/inclusiones.
    const optionsFirst = shouldOfferOptionsBeforeDetail({
      currentMessage,
      history,
      serviceHint: mentionedService || serviceLabel || crmService,
    });
    if (optionsFirst) {
      if (filledSet && serviceLabel) {
        filledSet.add("Requerimientos o servicios");
        const merged = mergeServiceRequirements(
          extracted.requerimientos_evento,
          serviceLabel,
          6
        );
        if (merged) extracted.requerimientos_evento = merged;
      }
      // A15168: Coffee Break — menú Sheet con precios/inclusiones + catálogo
      // (no solo "paquetes 1 a 5" sin significado).
      let menu = optionsFirst.menu;
      if (optionsFirst.family === "coffee_break") {
        const sheetMenu =
          buildCatalogServiceDetailAnswer("Coffee Break") ||
          buildCatalogPriceAnswer("Coffee Break");
        if (sheetMenu && /coffee\s*break\s*[1-5]|manejamos estos niveles|\$\s*\d/i.test(sheetMenu)) {
          menu = withServiceAndGeneralCatalogLinks(sheetMenu, "Coffee Break", "Coffee Break");
        } else if (!/bodasesor\.com\/catalogos\/coffee-break/i.test(menu)) {
          menu = `${menu}\n\nCatálogo:\nhttps://bodasesor.com/catalogos/coffee-break`;
        }
      } else {
        // V9.28: estaciones Solo+completo → embudo con precios del Sheet.
        const station =
          resolveSoloVsCompletoStationLabel(
            currentMessage,
            optionsFirst.family
          ) ||
          resolveSoloVsCompletoStationLabel(
            mentionedService || serviceLabel || crmService,
            optionsFirst.family
          );
        const sheetMode = station ? buildSoloVsCompletoOfferIfApplicable(station) : null;
        if (sheetMode) menu = sheetMode;
      }
      return appendNext(`${pickTransition(history)} ${menu}`.trim(), serviceLabel);
    }

    // Tras elegir / pedir detalle → query concreto + detalle + link aparte.
    const detailQuery = resolveProgressiveDetailQuery({
      currentMessage,
      serviceHint: mentionedService || serviceLabel || crmService,
      history,
    });
    if (
      !detailQuery &&
      historyOfferedServiceOptionsMenu(history) &&
      clientWantsServiceDetail(currentMessage, history)
    ) {
    return `${pickTransition(history)} ${SERVICE_NIVEL_DETAIL_CTA}`.trim();
  }
  // A14970: jamás usar el mensaje completo como query de catálogo.
    const queryForDetail =
      detailQuery || mentionedService || serviceLabel || crmService || null;
    if (!queryForDetail) {
      return appendNext(
        `${pickTransition(history)} Claro. ¿De qué servicio te paso el detalle?`,
        null
      );
    }

    let detail = buildCatalogServiceDetailAnswer(queryForDetail);
    if (
      detail &&
      mentionedService &&
      !catalogAnswerMatchesRequestedService(currentMessage ?? "", detail)
    ) {
      detail = null;
    }

    if (detail) {
      const introLabel = detailQuery || mentionedService || serviceLabel;
      // A14982: pickTransition ya trae "Perfecto./De acuerdo." — no duplicar.
      const intro = introLabel
        ? `${pickTransition(history)} Te detallo *${introLabel}*${eventPhrase}.`
        : `${pickTransition(history)} Te detallo la opción.`;
      const body = withServiceAndGeneralCatalogLinks(detail, queryForDetail, queryForDetail);
      return `${intro}\n\n${body}`.trim();
    }

    // Fallback: precio/inclusiones si el detail principal falló el match filter.
    const forced =
      attachAvailableSheetDetail(queryForDetail, mentionedService || serviceLabel) || null;
    if (forced) {
      const introLabel = detailQuery || mentionedService || serviceLabel;
      const intro = introLabel
        ? `${pickTransition(history)} Te detallo *${introLabel}*${eventPhrase}.`
        : `${pickTransition(history)} Te detallo la opción.`;
      const body = withServiceAndGeneralCatalogLinks(forced, queryForDetail, queryForDetail);
      return `${intro}\n\n${body}`.trim();
    }

    if (serviceLabel && currentMessage) {
      const ack = buildGuardServiceAck(currentMessage);
      // Si el ack ya trae Sheet detail, acompañar con link (post-elección).
      if (messageHasSheetServiceDetail(ack)) {
        const body = withServiceAndGeneralCatalogLinks(ack, serviceLabel, serviceLabel);
        return body;
      }
      // Ack corto sin dump: no forzar link aún.
      return appendNext(`${pickTransition(history)} ${ack}`, serviceLabel);
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
    return ensureCatalogWebLink(
      `${pickTransition(history)} ${ideas} ${follow}`.trim(),
      primary
    );
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
    return ensureCatalogWebLink(`${ideas}\n\n${comparison}`, "banquete");
  }

  const follow = pickVariant("requerimientos", history, entityId);
  return ensureCatalogWebLink(
    appendServiciosCatalogoHint(`${ideas} ${follow}`.trim()),
    /\bboda|xv|bautizo|banquete/i.test(`${tipo} ${texts}`)
      ? "banquete"
      : /\bcoffee|corporativ/i.test(`${tipo} ${texts}`)
        ? "coffee break"
        : null
  );
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
/**
 * V9.25 / A15308: quita "Qué emoción, felicidades" y similares cuando el cliente
 * solo dio el nombre o aún no hay tipo de evento que felicitar.
 */
export function stripPrematureCelebrationFluff(
  mensaje: string,
  opts?: {
    currentMessage?: string | null;
    tipoEvento?: string | null;
    force?: boolean;
  }
): string {
  if (!mensaje?.trim()) return mensaje;
  const msg = opts?.currentMessage?.trim() ?? "";
  const tipo = opts?.tipoEvento?.trim() ?? "";
  const nameOnly =
    !!msg &&
    (looksLikeNameAnswerMessage(msg) ||
      (/^(soy|me\s+llamo|mi\s+nombre\s+es)\s+/i.test(msg) &&
        !/\b(boda|cumplea|xv|bautizo|baby|corporativ|graduaci|evento)\b/i.test(msg)));
  const noEventYet = !tipo || /^cotizaci[oó]n|evento$/i.test(tipo);
  if (!opts?.force && !nameOnly && !noEventYet) return mensaje;

  let out = mensaje;
  // Casos pegados: "¡Mucho gusto, Carlota! Qué emoción, felicidades. ¿Qué…"
  out = out.replace(
    /(¡?Mucho gusto,\s*[^!]{1,40}!)\s*(?:¡?\s*)?(?:Qu[eé]\s+emoción|Qu[eé]\s+padre|Qu[eé]\s+bonito|Felicidades)(?:\s*,\s*(?:felicidades|qu[eé]\s+emoción))?[^.?!]{0,40}[.!]?\s*/gi,
    "$1 "
  );
  // Frases emotivas sueltas (sin comerse el "!" del Mucho gusto).
  out = out.replace(
    /\s+(?:¡?\s*)?(?:qu[eé]\s+emoción|qu[eé]\s+padre|qu[eé]\s+bonito|qu[eé]\s+genial|felicidades|me\s+da\s+mucho\s+gusto|qu[eé]\s+alegre|qu[eé]\s+ilusi[oó]n)\b[^.?!¡¿\n]{0,40}[.!…]?/gi,
    ""
  );
  out = out.replace(
    /^(?:¡?\s*)?(?:qu[eé]\s+emoción|felicidades)\b[^.?!¡¿\n]{0,40}[.!…]?\s*/gi,
    ""
  );
  return out.replace(/\s{2,}/g, " ").replace(/\s+\n/g, "\n").trim();
}

export function dedupeTransitionsInMessage(mensaje: string): string {
  if (!mensaje?.trim()) return mensaje;
  const pattern =
    /\b(Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro que sí|Claro|Qué padre|De acuerdo|Con gusto)\./gi;
  let seen: string | null = null;
  let out = mensaje
    .replace(pattern, (match) => {
      const key = match.toLowerCase();
      if (seen === key) return "";
      if (!seen) seen = key;
      return match;
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim();
  // A15016 / V9.12: "Perfecto, X. Mucho gusto, X." / doble Mucho gusto.
  out = out.replace(
    /\b(¡?Mucho gusto,\s+([A-Za-zÁÉÍÓÚáéíóúüñÑ]{2,})[.!])(?:\s+\1)+/gi,
    "$1"
  );
  out = out.replace(
    /\b(Perfecto|Excelente|Genial|Claro),\s+([A-Za-zÁÉÍÓÚáéíóúüñÑ]{2,})\.\s+¡?Mucho gusto,\s+\2[.!]/gi,
    "$1, $2."
  );
  out = out.replace(
    /(¡Mucho gusto,\s+([A-Za-zÁÉÍÓÚáéíóúüñÑ]{2,})!)\s+¡?Mucho gusto,\s+\2[.!]/gi,
    "$1"
  );
  // A15308: "¡Mucho gusto, X! Qué emoción, felicidades." → quitar emotivo pegado.
  out = out.replace(
    /(¡?Mucho gusto,\s*[^!]{1,40}!)\s*(?:¡?\s*)?(?:Qu[eé]\s+emoción|Qu[eé]\s+padre|Qu[eé]\s+bonito|Felicidades)(?:\s*,\s*(?:felicidades|qu[eé]\s+emoción))?[^.?!]{0,40}[.!]?\s*/gi,
    "$1 "
  );
  return out.replace(/\s{2,}/g, " ").trim();
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

/**
 * Siguiente dato del embudo en orden de conversación natural (V9.39).
 * Invitados va justo después de servicios (A15380: no dejarlo al final ni confundirlo con "aún no hay horario").
 * Correo va después de tipo/servicios/fecha/ubicación — no justo tras el nombre.
 */
export function getNextPendingField(
  extracted: ExtractedData,
  filledSet?: Set<string>
): PendingField | null {
  const filled = filledSet ?? new Set<string>();

  if (!isFieldSatisfied("nombre", filled, extracted)) return "nombre";
  if (!hasTipoEvento(filled, extracted)) return "tipo_evento";

  if (!isFieldSatisfied("requerimientos", filled, extracted)) return "requerimientos";

  const hasInv = filled.has("Número de invitados") || !!extracted.num_invitados;
  if (!hasInv) return "invitados";

  const hasFecha = filled.has("Fecha y horario") || !!extracted.fecha_horario?.trim();
  if (!hasFecha) return "fecha";

  const hasZona =
    filled.has("Lugar/dirección del evento") ||
    isUsableDireccionEvento(extracted.direccion_evento);
  if (!hasZona) return "zona";

  if (!isEmailSatisfied(filled, extracted)) return "correo";

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
    // A14934: cotizar "Barra Yucateca" en CDMX (sin dos puntos).
    const quotedMatch = userText.match(
      /(?:me\s+interesa\s+)?cotizar\s*[“"']([^”"']+)[”"']/i
    );
    const enZonaMatch = userText.match(
      /(?:me\s+interesa\s+)?cotizar\s+(.+?)\s+en\s+(?:ciudad\s+de\s+m[eé]xico|cdmx|[A-Za-zÁÉÍÓÚáéíóúñÑ])/i
    );
    const serviceChunk = (
      colonMatch?.[1] ??
      quotedMatch?.[1] ??
      enZonaMatch?.[1] ??
      ""
    )
      .trim()
      .replace(/\.$/, "")
      .replace(/^["'“”]+|["'“”]+$/g, "");
    if (serviceChunk) {
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
  if (/\b(mesas?|sillas?|periqueras?|mobiliario|salas?\s*(lounge)?)\b/i.test(t)) {
    if (/periqueras?/.test(t)) return "Te ayudo con la renta de periqueras y mesas tipo bar.";
    if (/salas?/.test(t)) return "Te ayudo con salas lounge y mobiliario para tu evento.";
    return "Te ayudo con la renta de mesas, sillas y mobiliario.";
  }
  if (/banquete/.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    return inv
      ? `Te ayudo con el banquete para ${inv[1]} personas.`
      : "Con gusto te ayudo con información de banquetes.";
  }
  if (/kosher/.test(t)) return "Sí tenemos opciones kosher.";
  if (/\bshows?\b|\banimaci[oó]n\b|\bhora\s+loca\b|\bentretenimiento\b/i.test(t)) {
    return "Claro — manejamos shows, animación y performance para eventos.";
  }
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

  // V8.68: familia sin variante → menú de opciones (detalle + link tras elegir / "sí").
  // Multi-servicio / brief rico sigue con bloque de catálogo.
  const svcHint =
    (isValidRequerimientosValue(ctx.extracted.requerimientos_evento)
      ? ctx.extracted.requerimientos_evento
      : null) ||
    parsePrimaryService(userText) ||
    parsePrimaryService(ctx.currentMessage ?? "") ||
    (multiServices.length === 1 ? multiServices[0]! : null);
  // A15205: comida vaga en primer contacto → formal vs casual (no banquete Formal/Mexicano).
  const vagueFoodFirst =
    !includeCatalog &&
    (isVagueFoodTerm(ctx.currentMessage) || isVagueFoodTerm(userText));
  const progressiveFirst =
    !includeCatalog && !vagueFoodFirst && svcHint
      ? shouldOfferOptionsBeforeDetail({
          currentMessage: ctx.currentMessage ?? svcHint,
          history,
          serviceHint: svcHint,
        })
      : null;
  // Una solicitud de cotización en el primer contacto se reconoce y continúa con
  // el embudo; no se vuelca un PDF completo si el cliente no pidió detalle/precio.
  const requestedCatalogDetail =
    clientAsksInclusion(ctx.currentMessage) ||
    clientAsksPrice(ctx.currentMessage) ||
    clientAsksForCatalog(ctx.currentMessage);
  const sheetDetail =
    !includeCatalog && !progressiveFirst && !vagueFoodFirst && requestedCatalogDetail && svcHint
      ? attachAvailableSheetDetail(svcHint, svcHint)
      : null;
  const catalogBlock = includeCatalog
    ? `\n\n${buildPackageCatalogOfferBlock(multiServices, userText)}`
    : vagueFoodFirst
      ? `\n\n${buildAlimentosModoMenu()}`
      : progressiveFirst
        ? `\n\n${
            (() => {
              const station =
                resolveSoloVsCompletoStationLabel(svcHint ?? "", progressiveFirst.family) ||
                resolveSoloVsCompletoStationLabel(svcHint ?? "");
              return (
                (station ? buildSoloVsCompletoOfferIfApplicable(station) : null) ||
                progressiveFirst.menu
              );
            })()
          }`
        : sheetDetail
          ? `\n\n${sheetDetail}`
          : "";

  if (isFieldSatisfied("nombre", filledSet, ctx.extracted)) {
    const nombre = getDisplayName(ctx.extracted, ctx.whatsappName);
    const pending = getNextPendingField(ctx.extracted, filledSet);
    // Si el ack ya nombra al cliente ("Perfecto, Ana."), no anteponer otro saludo.
    const ackHasName =
      !!nombre &&
      new RegExp(
        `\\b(Perfecto|Excelente|Genial),\\s*${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i"
      ).test(ack);
    const greet =
      nombre && !ackHasName ? buildNameGreeting(nombre, history) : "";
    if (pending) {
      const q = buildNaturalQuestion(pending, ctx);
      const body = `${ack}${catalogBlock}\n\n${greet ? `${greet} ` : ""}${q}`.trim();
      return withIntro ? `${intro}${body}`.trim() : body;
    }
    const body = greet
      ? `${ack}${catalogBlock}\n\n${greet}`.trim()
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
      // A15164: si el modelo sigue pidiendo nombre, avanzar al siguiente dato.
      if (
        mensajeAsksForField(_mensaje, "nombre") ||
        /\b(c[oó]mo\s+te\s+llamas|me\s+regalas\s+tu\s+nombre|con\s+qui[eé]n\s+tengo)\b/i.test(
          _mensaje
        )
      ) {
        const pending = getNextPendingField(extracted, filledSet);
        if (pending && pending !== "nombre") {
          return buildNaturalQuestion(pending, ctx);
        }
      }
      return stripRepeatLucyIntro(_mensaje, presHistory, true);
    }
    if (isAffirmativeOnlyMessage(ctx.currentMessage)) {
      return `${pickTransition(presHistory)} ¿Me regalas tu nombre?`;
    }
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && pending !== "nombre") {
      return stripRepeatLucyIntro(_mensaje, presHistory, alreadyStarted);
    }
    // V8.35: si ya hay detalle Sheet (niveles/incluye/precio), no borrarlo —
    // pedir nombre al final (igual que precio mid-captura).
    if (
      messageHasSheetServiceDetail(_mensaje) ||
      (clientAsksPrice(ctx.currentMessage) &&
        _mensaje.trim().length > 40 &&
        (messageClaimsPrice(_mensaje) || /\$\s*\d|precio|costo|nivel|manejamos/i.test(_mensaje))) ||
      (clientAsksServiceInfo(ctx.currentMessage) &&
        _mensaje.trim().length > 40 &&
        /\$\s*\d|nivel|incluye|manejamos/i.test(_mensaje))
    ) {
      if (
        !mensajeAsksForField(_mensaje, "nombre") &&
        !/\b(c[oó]mo\s+te\s+llamas|me\s+regalas\s+tu\s+nombre|con\s+qui[eé]n\s+tengo)\b/i.test(
          _mensaje
        )
      ) {
        return `${_mensaje}\n\n${buildNaturalQuestion("nombre", ctx)}`.trim();
      }
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
      if (needsAlimentosTipoClarification(extracted.requerimientos_evento)) return false;
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

/** Orden de conversación natural (alineado a getNextPendingField). */
const FIELD_ORDER: PendingField[] = [
  "nombre",
  "tipo_evento",
  "requerimientos",
  "invitados",
  "fecha",
  "zona",
  "correo",
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
  if (trimmed.length < 20) return false;
  if (
    isVagueFoodTerm(currentMessage) &&
    !isAlimentosModoMenuReply(trimmed) &&
    !/\b(banquete|taquiza|casual|barra de pastas|pizzas|sushi|brunch|desayuno)\b/i.test(trimmed)
  ) {
    return false;
  }
  if (responseLooksLikePrematureClose(trimmed)) return false;
  if (responseHasInventedPrice(trimmed, currentMessage)) return false;
  if (mensajeAsksForFilledField(trimmed, filledSet, extracted)) return false;
  if (mensajeAsksWrongField(trimmed, filledSet, extracted)) return false;
  // Dump de menú genérico: no preferir (tampoco si vino del modelo).
  if (looksLikeServicesMenuDump(trimmed) || responseLooksLikeGenericCateringMenu(trimmed)) {
    return false;
  }
  if (isDryRequerimientosAsk(trimmed)) return false;
  // Niveles sin inclusiones: no preferir — el enrich del Sheet debe completar.
  if (messageOffersLevelsWithoutInclusions(trimmed)) return false;
  // A15165: never prefer Level-2 stub over catalog/template knowledge.
  if (
    /\bla\s+anoto\s+para\s+tu\s+cotizaci[oó]n\b/i.test(trimmed) &&
    /Nuestro equipo te confirma/i.test(trimmed)
  ) {
    return false;
  }

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

  // V8.93: voz humana — priorizar GPT sobre plantilla si respondió de forma útil.
  if (currentMessage && currentMessage.trim().length > 8 && trimmed.length >= 40) {
    if (clientAskedFreeformQuestion(currentMessage)) return true;
    if (clientMentionsCatering(currentMessage) && !mensajeAsksForField(trimmed, pending)) return true;
    if (justAnsweredReqContext(currentMessage, trimmed)) return true;
    if (
      isServiceRelatedMessage(currentMessage) &&
      !mensajeAsksForFilledField(trimmed, filledSet, extracted)
    ) {
      return true;
    }
  }

  // Redacción sustantiva con pregunta útil (asesora humana), aunque no matchee el campo exacto.
  if (trimmed.length >= 55 && /\?/.test(trimmed) && !isDryRequerimientosAsk(trimmed)) {
    return true;
  }

  return false;
}

/** OpenAI ya orientó entretenimiento/show sin inventar precios ni dump genérico. */
function aiLooksLikeEntertainmentReply(
  text: string | null | undefined,
  clientMessage?: string
): boolean {
  if (!text?.trim() || text.trim().length < 40) return false;
  if (looksLikeServicesMenuDump(text) || responseLooksLikeGenericCateringMenu(text)) return false;
  if (responseHasInventedPrice(text)) return false;
  // A15165: Level-2 vacío ("la anoto… equipo confirma") no sustituye plantilla + catálogo.
  if (
    /\bla\s+anoto\s+para\s+tu\s+cotizaci[oó]n\b/i.test(text) ||
    /Nuestro equipo te confirma descripci[oó]n, precio e inclusiones/i.test(text)
  ) {
    return false;
  }
  // Stubs / dumps genéricos — no sustituyen plantilla de acto concreto.
  if (
    /manejamos shows|Te dejo el cat[aá]logo general|happening,? espejos|l[aá]ser y m[aá]s opciones/i.test(
      text
    )
  ) {
    return false;
  }
  if (
    !/show|animaci|entretenimiento|hora\s+loca|robots?\s*leds?|batucada|bailarinas?|photo\s*booth|cabina|maestro\s+de\s+ceremonias|happening|vers[aá]til|circo|blue\s*man|blueman/i.test(
      text
    )
  ) {
    return false;
  }
  const msg = clientMessage?.trim() ?? "";
  if (!msg) return true;
  const special = parseSpecialLiveActLabel(msg);
  if (special) {
    const token = special.split(/\s+/).find((w) => w.length >= 4) || special.slice(0, 8);
    return new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text);
  }
  if (/\b(blue\s*man|blueman)\b/i.test(msg)) return /blue\s*man|blueman/i.test(text);
  if (/\bcirco\b/i.test(msg)) return /\bcirco\b/i.test(text);
  if (/\brobots?\s*leds?\b|\bled\s*robots?\b/i.test(msg)) return /robots?|leds?/i.test(text);
  if (/\bbatucada\b/i.test(msg)) return /\bbatucada\b/i.test(text);
  if (/\bbailarinas?\b|\bdancers?\b/i.test(msg)) return /bailarinas?|dancers?|show/i.test(text);
  if (/\b(photo\s*booth|cabina)/i.test(msg)) return /photo\s*booth|cabina/i.test(text);
  return true;
}

/** OpenAI ya respondió carpas/medidas de forma útil (sin dump repetido). */
function aiLooksLikeCarpasReply(text: string | null | undefined): boolean {
  if (!text?.trim() || text.trim().length < 35) return false;
  if (responseHasInventedPrice(text)) return false;
  return /\bcarpas?\b/i.test(text) && (/medidas?|metros?|transparent|cubrir|jard[ií]n|terraza|\d+\s*x\s*\d+/i.test(text) || /\?/.test(text));
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

  // A14943: precios/paquetes no son "ofrecimiento temprano" — no tapar con upsell.
  if (clientAsksPrice(currentMessage) || clientAsksInclusion(currentMessage)) return null;

  // A14947: dump Betún/Cupcakes/Helados cuando el cliente pidió banquete/catering → rechazar.
  const msg = currentMessage?.trim() ?? "";
  const userBlob = collectUserTexts(history, currentMessage).join(" ");
  if (
    /bet[uú]n|cupcakes?|paletas?\s+de\s+hielo|helados?/i.test(aiResponse) &&
    /\bbanquetes?\b|\bcatering\b/i.test(`${msg} ${userBlob} ${extracted.requerimientos_evento ?? ""}`)
  ) {
    return null;
  }

  // A14988: entretenimiento / "Revisar" tras CTA → no re-ofrecer Nivel 1.
  if (clientMentionsEntertainment(msg) || clientMentionsLedRobotsOrBatucada(msg)) {
    return null;
  }
  const lastAsstOffer = lastAssistantOutboundFromHistory(history);
  if (
    clientConfirmsOfferReview(msg) &&
    lastAsstOffer &&
    /revisar\s+primero|armar\s+un\s+paquete/i.test(lastAsstOffer)
  ) {
    return null;
  }

  // Si el cliente ya eligió un servicio concreto, no reemplazar con oferta genérica.
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

  // Menú progresivo: ofrece variantes pero sigue el embudo (fecha, invitados…).
  if (isProgressiveOptionsMenuReply(base)) {
    if (pending && pending !== "requerimientos" && pending !== "nombre") {
      const nextQ = buildNaturalQuestion(pending, ctx);
      if (nextQ && !mensajeAsksForField(base, pending) && !base.includes(nextQ)) {
        return `${base}\n\n${nextQ}`;
      }
    }
    return base;
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
  // A14982: "¿Quieres que te dé detalles de alguno?" NO bloquea pedir correo/tipo/fecha.
  const onlyServiceDetailCta =
    /quieres que te d[eé] detalles de alguno/i.test(base) &&
    !mensajeAsksForField(base, pending);
  if (
    base.includes("?") &&
    !onlyServiceDetailCta &&
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
    isProgressiveOptionsMenuReply(mensaje) ||
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
    "fecha",
    "zona",
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
  // Menú progresivo (opciones antes de detalle): no pisar con correo/embudo.
  // Contiene "banquete"/"servicios" y FIELD_ASK_PATTERNS.requerimientos lo confunde.
  // Sí pedimos nombre si aún falta (primer contacto).
  if (isProgressiveOptionsMenuReply(mensaje)) {
    const body = mensaje.trim();
    if (!isFieldSatisfied("nombre", filledSet, extracted) && !mensajeAsksForField(body, "nombre")) {
      return `${body}\n\n${pickVariant("nombre", ctx.history ?? [], ctx.entityId)}`.trim();
    }
    return body;
  }

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

/** True si Lucy ya dijo "Mucho gusto, [Nombre]" en el historial. */
export function historyHasNameGreeting(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  firstName?: string | null
): boolean {
  const first = firstName?.trim().split(/\s+/)[0];
  if (!first) {
    return history.some(
      (m) =>
        m.role === "assistant" &&
        typeof m.content === "string" &&
        /¡?Mucho gusto,/i.test(m.content as string)
    );
  }
  const re = new RegExp(
    `¡?Mucho gusto,\\s*${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i"
  );
  return history.some(
    (m) => m.role === "assistant" && typeof m.content === "string" && re.test(m.content as string)
  );
}

/** Saludo post-nombre; vacío si ya se saludó. */
export function buildNameGreeting(
  nombre: string | null | undefined,
  history: OpenAI.Chat.ChatCompletionMessageParam[] = []
): string {
  const first = nombre?.trim().split(/\s+/)[0] ?? null;
  if (!first || historyHasNameGreeting(history, first)) return "";
  return `¡Mucho gusto, ${first}!`;
}

export function buildNaturalQuestion(field: PendingField, ctx: NaturalQuestionContext): string {
  const history = ctx.history ?? [];
  const nombre = getDisplayName(ctx.extracted, ctx.whatsappName);
  const prefix = contextualPrefix(field, ctx.extracted, ctx.currentMessage, history);
  const variant = pickVariant(field, history, ctx.entityId);
  const thanks = emailThanksPrefix(ctx);

  if (field === "correo") {
    // Mucho gusto lo antepone el turno de captura de nombre; aquí solo la pregunta.
    return pickVariant("correo", history, ctx.entityId);
  }

  if (field === "requerimientos") {
    if (
      needsAlimentosTipoClarification(ctx.extracted.requerimientos_evento) ||
      isVagueFoodTerm(ctx.currentMessage)
    ) {
      if (!historyOfferedAlimentosModoMenu(history)) {
        return `${pickTransition(history)} ${buildAlimentosModoMenu()}`.trim();
      }
    }
    return buildRequerimientosQuestion(ctx.extracted, history, ctx.currentMessage, ctx.entityId);
  }

  if (field === "tipo_evento") {
    const tipoVariant = pickVariant("tipo_evento", history, ctx.entityId);
    if (ctx.afterEmail) {
      return nombre
        ? `Gracias por tu correo, ${nombre}. ${tipoVariant}`
        : `Gracias por tu correo. ${tipoVariant}`;
    }
    return prefix ? `${prefix}${tipoVariant}` : tipoVariant;
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
  if (
    needsAlimentosTipoClarification(extracted.requerimientos_evento) ||
    isVagueFoodTerm(currentMessage)
  ) {
    if (historyOfferedAlimentosModoMenu(history)) {
      if (clientChoseBanqueteFormal(currentMessage)) {
        return `${pickTransition(history)} ${buildProgressiveOptionsMenu("banquete")}`.trim();
      }
      if (clientChoseCateringCasual(currentMessage)) {
        return `${pickTransition(history)} ${buildCateringCasualMenu()}`.trim();
      }
    }
    if (!historyOfferedAlimentosModoMenu(history) && !historyOfferedServiceOptionsMenu(history)) {
      return `${pickTransition(history)} ${buildAlimentosModoMenu()}`.trim();
    }
  }

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

/** Carpas, pistas y tarimas no pueden pasar a cierre sin largo × ancho. */
export function requiredServiceDimensionsMissing(extracted: ExtractedData): boolean {
  const req = extracted.requerimientos_evento?.trim() ?? "";
  if (!req) return false;
  const requiresDimensions =
    clientMentionsCarpas(req) || clientMentionsPistaTarima(req);
  return requiresDimensions && !parseSpaceDimensions(req);
}

export function buildRequiredServiceDimensionsQuestion(extracted: ExtractedData): string {
  const req = extracted.requerimientos_evento?.trim() ?? "";
  if (clientMentionsCarpas(req)) {
    return (
      "Antes de cerrar la solicitud necesito las medidas aproximadas de la carpa " +
      "(largo × ancho) o del área que quieres cubrir. ¿Cuánto mide?"
    );
  }
  return (
    "Antes de cerrar la solicitud necesito las medidas aproximadas de la pista o tarima " +
    "(largo × ancho). ¿Cuánto debe medir?"
  );
}

export function requerimientosNeedsFollowUp(
  extracted: ExtractedData,
  filledSet: Set<string>
): boolean {
  const req = extracted.requerimientos_evento?.trim() ?? "";
  if (requiredServiceDimensionsMissing(extracted)) return true;
  if (needsAlimentosTipoClarification(req)) return true;
  if (filledSet.has("Requerimientos o servicios")) return false;
  if (!req) return true;
  return !isValidRequerimientosValue(req);
}

export function buildCorreoQuestion(
  nombre: string | null,
  history: OpenAI.Chat.ChatCompletionMessageParam[] = [],
  entityId?: string | number
): string {
  const correoCore = pickVariant("correo", history, entityId);
  const greet = buildNameGreeting(nombre, history);
  return greet ? `${greet} ${correoCore}` : correoCore;
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
  if (requiredServiceDimensionsMissing(extracted)) {
    return buildRequiredServiceDimensionsQuestion(extracted);
  }
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
  const nombre = getDisplayName(extracted, undefined);
  const warm = nombre
    ? `¡Claro, sin problema, ${nombre.split(/\s+/)[0]}! Lo revisamos todo por este chat.`
    : "¡Claro, sin problema! Lo revisamos todo por este chat.";
  const pending = getNextPendingField(extracted, filledSet);
  if (pending && pending !== "correo") {
    return `${warm} ${buildNaturalQuestion(pending, ctx)}`;
  }
  const tipoQ = buildNaturalQuestion("tipo_evento", ctx);
  return `${warm} ${tipoQ}`;
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

/** Cliente pide cotización / anticipo / datos de pago (post-cierre → equipo). */
export function clientAsksPaymentOrQuoteDelivery(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /\b(anticipo|50\s*%|porcentaje|dep[oó]sito|se[nñ]a)\b/i.test(t) ||
    /\b(donde|dónde|a\s+d[oó]nde)\s+(mando|deposit|transfer|pag)/i.test(t) ||
    /\b(manda|env[ií]a|pasa).{0,30}\b(presupuesto|cotizaci[oó]n|datos\s+de\s+pago)\b/i.test(t) ||
    /\b(presupuesto|cotizaci[oó]n).{0,40}\b(anticipo|pago|transfer)/i.test(t) ||
    /\bdatos\s+(para\s+el\s+)?pago\b/i.test(t)
  );
}

export function buildPostCierreThanksReply(clientName?: string | null): string {
  const nombre = sanitizeDisplayName(clientName);
  return nombre
    ? `¡Con gusto, ${nombre}! Nuestro equipo ya tiene tus datos para la cotización. Si necesitas algo más, aquí estamos.`
    : "¡Con gusto! Nuestro equipo ya tiene tus datos para la cotización. Si necesitas algo más, aquí estamos.";
}

export function buildPostCierrePaymentHandoffReply(clientName?: string | null): string {
  const nombre = sanitizeDisplayName(clientName);
  const hi = nombre ? `${nombre}, ` : "";
  return [
    `Claro que sí, ${hi}nuestro equipo te envía la cotización y los datos para el anticipo (50%) por el correo que ya tenemos.`,
    "En breve te atienden para confirmar montos y forma de pago.",
  ].join(" ");
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

/** Hub genérico (solo cuando no hay SKUs mapeables). */
export function buildGenericCatalogHubBlock(): string {
  return [
    "Te dejo el catálogo general para que veas montajes, menús y opciones:",
    getCatalogWebHubDeliveryUrl(),
    "",
    CATALOG_OFFER_QUESTION,
  ].join("\n");
}

/**
 * Une servicios de mensaje / CRM / historial para ofrecer catálogos concretos
 * en CUALQUIER rama (no solo RFQ multi-servicio).
 */
export function collectServicesForCatalogOffer(opts: {
  services?: string[] | null;
  extracted?: { requerimientos_evento?: string | null } | null;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  currentMessage?: string | null;
  sourceText?: string | null;
}): string[] {
  const fromArg = (opts.services ?? []).map((s) => s.trim()).filter(Boolean);
  const fromCrm = opts.extracted?.requerimientos_evento
    ? parseServicesFromText(opts.extracted.requerimientos_evento)
    : [];
  const blob =
    opts.sourceText ||
    [
      opts.currentMessage ?? "",
      ...(opts.history
        ? collectUserTexts(opts.history, opts.currentMessage ?? undefined)
        : []),
    ]
      .filter(Boolean)
      .join(" ");
  const fromBlob = blob ? parseServicesFromText(blob) : [];
  return dedupeServiceHierarchy([...fromArg, ...fromCrm, ...fromBlob], blob);
}

/**
 * Bloque de catálogo para paquetes / RFQ / cierre / primer turno / entretenimiento.
 * V8.79: si hay SKUs concretos → links mapeados; si no → hub genérico.
 */
export function buildPackageCatalogOfferBlock(
  services?: string[] | null,
  sourceText?: string
): string {
  const list = collectServicesForCatalogOffer({
    services,
    sourceText,
    currentMessage: sourceText,
  });
  if (list.length >= 1) {
    const mapped = buildMappedCatalogOfferBlock(list, sourceText);
    if (mapped && !/^Te dejo el catálogo general/i.test(mapped)) {
      return mapped;
    }
  }
  return buildGenericCatalogHubBlock();
}

/**
 * A14985 / V8.79: con servicios concretos, ofrecer links del catálogo que aplican
 * (Barra de bebidas, Puestos de comida, Periqueras…), no solo el hub genérico.
 * Se usa desde TODAS las ramas vía buildPackageCatalogOfferBlock.
 */
export function buildMappedCatalogOfferBlock(
  services: string[],
  sourceText?: string
): string {
  const text = sourceText ?? "";
  const list = dedupeServiceHierarchy(
    services.map((s) => s.trim()).filter(Boolean),
    text
  ).slice(0, 6);
  if (!list.length) return buildGenericCatalogHubBlock();

  const lines: string[] = [
    "Con lo que pediste, estas opciones del catálogo te pueden servir:",
    "",
  ];
  let linked = 0;
  const seenUrls = new Set<string>();
  for (const svc of list) {
    let query = svc;
    let label = svc;
    if (/mobiliario/i.test(svc) && /\bperiqueras?\b/i.test(text)) {
      query = "periqueras";
      label = "Periqueras (mobiliario)";
    } else if (/^periqueras?$/i.test(svc)) {
      // Evitar duplicar el mismo link si ya va como Mobiliario/Periqueras.
      if (list.some((s) => /mobiliario/i.test(s)) && /\bperiqueras?\b/i.test(text)) {
        continue;
      }
      query = "periqueras";
      label = "Periqueras";
    } else if (/puestos?\s+de\s+comida/i.test(svc)) {
      query = "puestos de comida";
      label = /\bbanderillas?\b/i.test(text)
        ? "Puestos de comida / antojitos (banderillas)"
        : "Puestos de comida / antojitos";
    } else if (/barra\s+de\s+bebidas/i.test(svc)) {
      query = "barra de bebidas";
      label = "Barra de bebidas";
    } else if (/^meseros?$/i.test(svc)) {
      // Sin página propia → no forzar link roto.
      lines.push(`• *${label}*`);
      continue;
    }
    // Preferir slug web (embeds) — no depende del Sheet cargado (A14985).
    const sheetMatch = resolveCatalogWebLink(query);
    const webUrl =
      getCatalogWebUrlForQuery(query) ||
      (sheetMatch.kind === "service" ? sheetMatch.url : null);
    if (webUrl) {
      const deliverable = toDeliverableCatalogUrl(webUrl);
      if (seenUrls.has(deliverable)) continue;
      seenUrls.add(deliverable);
      lines.push(`• *${label}*: ${deliverable}`);
      linked++;
    } else {
      lines.push(`• *${label}*`);
    }
  }
  if (linked === 0) return buildGenericCatalogHubBlock();

  lines.push("", "Catálogo general:", getCatalogWebHubDeliveryUrl(), "");
  lines.push(SERVICE_NIVEL_DETAIL_CTA);
  return lines.join("\n");
}

/** ¿Lucy ya ofreció niveles / Incluye / precios del Sheet (no solo un link)? */
export function historyAlreadyOfferedServiceDetail(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  return history.some((m) => {
    if (m.role !== "assistant" || typeof m.content !== "string") return false;
    // V8.35: URL sola (ensureCatalogWebLink) NO cuenta como detalle Sheet.
    return messageHasSheetServiceDetail(m.content);
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
  if (historyOfferedServiceOptionsMenu(history)) return null;

  const svc = extracted.requerimientos_evento!.trim();
  const nombre = getDisplayName(extracted, whatsappName);
  const intro = nombre ? `Perfecto, ${nombre}.` : "Perfecto.";

  // V8.68: menú de opciones primero; detalle + link cuando elijan.
  const optionsFirst = shouldOfferOptionsBeforeDetail({
    currentMessage: svc,
    history,
    serviceHint: svc,
  });
  if (optionsFirst) {
    // V9.28: si el Sheet tiene precios, usa el embudo con $ (todas las estaciones).
    const station =
      resolveSoloVsCompletoStationLabel(svc, optionsFirst.family) ||
      resolveSoloVsCompletoStationLabel(svc);
    const sheetMode = station ? buildSoloVsCompletoOfferIfApplicable(station) : null;
    const menu = sheetMode || optionsFirst.menu;
    let body = `${intro} ${menu}`.trim();
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && pending !== "requerimientos" && pending !== "nombre") {
      const nextQ = buildNaturalQuestion(pending, { ...ctx, filledSet });
      if (nextQ && !body.includes(nextQ)) {
        body = `${body}\n\n${nextQ}`;
      }
    }
    return body;
  }

  const detail = buildCatalogServiceDetailAnswer(svc);
  if (!detail || !/nivel|precio|manejamos|\$/i.test(detail)) return null;

  const link = buildCatalogWebLinkReply({ query: svc, serviceHint: svc });
  let body = `${intro}\n\n${detail}\n\n${link}`.trim();

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
  const parsed = dedupeServiceHierarchy(parseServicesFromText(servicioRaw), servicioRaw);
  // A14981: alternativas de comida contaminadas → cerrar solo con el primario.
  const primaryFood = preferPrimaryCatalogService(parsed);
  const closingServices = looksLikeConflictingFoodAlternatives(parsed)
    ? primaryFood
      ? [primaryFood]
      : parsed.slice(0, 1)
    : parsed;
  const servicio = isSlashFoodAlias
    ? "banquete / taquiza"
    : closingServices.length > 0
      ? closingServices.slice(0, 4).join(", ")
      : isValidRequerimientosValue(servicioRaw) &&
          !/banquetes?\s+o\s+catering|servicio\s+de\s+banquetes?/i.test(servicioRaw)
        ? servicioRaw
        : "";
  const serviceParts = servicio
    ? servicio.split(/,\s*/).map((s) => s.trim()).filter(Boolean)
    : [];
  const multiPackage = !isSlashFoodAlias && serviceParts.length >= 2;
  // V8.93: cierre humano — reconoce el servicio, sin empujar extras.
  // Mantener firma "Perfecto, ya tengo todo." (CLOSING_SIGNATURE / detectCierreEnviado).
  const head = servicio
    ? `Perfecto, ya tengo todo. Quedó anotado *${servicio}*. ${handoff}`
    : `Perfecto, ya tengo todo. ${handoff}`;
  const parts = [head];
  if (multiPackage) {
    // V8.79: cierre con links de los SKUs pedidos, no solo hub.
    parts.push("", buildPackageCatalogOfferBlock(serviceParts, servicioRaw));
  }
  parts.push("", "Si necesitas algo más, con gusto te apoyo.");
  return parts.join("\n");
}

/**
 * A14982: 2 servicios de comida con Sheet → dump de niveles/precios (no solo hub genérico).
 * RFQs largos / 3+ / sin precio en Sheet → null (cae a catálogo general).
 */
export function buildMultiServiceSheetLevelsReply(
  services: string[],
  sourceText?: string
): string | null {
  if (sourceText && isRichQuoteBrief(sourceText)) return null;
  const cleaned = dedupeServiceHierarchy(
    services.map((s) => s.trim()).filter(Boolean),
    sourceText
  );
  // A14995 Hortensia: paquete amplio (banquete+barra+dulces+mobiliario) → ack todos +
  // catálogos mapeados, NO dump solo de Banquete Mexicano 4 tiempos.
  if (cleaned.length >= 3) return null;
  const hasFood = cleaned.some((s) =>
    /barra|taquiza|banquete|coffee|parrillada|paella|mesa\s+de|cupcake|sushi|crepa|pizza|pasta|pozole/i.test(
      s
    )
  );
  const hasNonFood = cleaned.some((s) =>
    /mobiliario|carpas?|pista|tarima|\bdj\b|iluminaci|pantallas?/i.test(s)
  );
  if (hasFood && hasNonFood) return null;

  const foodish = cleaned.filter((s) =>
    /barra|taquiza|banquete|coffee|parrillada|paella|mesa\s+de|cupcake|sushi|crepa|pizza|pasta|pozole|canap|bocadillo/i.test(
      s
    )
  );
  const list = (foodish.length >= 2 ? foodish : cleaned).slice(0, 2);
  if (list.length < 2) return null;

  const blocks: string[] = [];
  for (const svc of list) {
    const detail =
      buildCatalogServiceDetailAnswer(svc) || buildCatalogPriceAnswer(svc);
    if (!detail || !/\$|nivel|Solo Alimentos|Basico|Tradicional|Premium|Coffee Break/i.test(detail)) {
      return null;
    }
    const cleanedDetail = detail
      .replace(/¿Quieres que te d[eé] detalles de alguno\??/gi, "")
      .replace(/¿Cu[aá]l nivel prefieres[^\n]*/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    blocks.push(`*${svc}*\n${cleanedDetail}`);
  }

  const ack = buildMultiServiceAck(list);
  const body = [ack, "", blocks.join("\n\n———\n\n"), "", SERVICE_NIVEL_DETAIL_CTA].join(
    "\n"
  );
  return withServiceAndGeneralCatalogLinks(body, list[0]!, list.join(" "));
}

/** Ack de paquete + niveles Sheet (2 food SKUs) o catálogos mapeados (RFQ). */
export function buildMultiServicePackageReply(
  services: string[],
  sourceText?: string
): string {
  const levels = buildMultiServiceSheetLevelsReply(services, sourceText);
  if (levels) return levels;
  const cleaned = dedupeServiceHierarchy(
    services.map((s) => s.trim()).filter(Boolean),
    sourceText
  );
  const ack =
    sourceText && isRichQuoteBrief(sourceText)
      ? buildRichBriefAcknowledgment(sourceText)
      : buildMultiServiceAck(cleaned.length ? cleaned : services);
  // V8.79: misma lógica de catálogos mapeados que el resto de ramas.
  return `${ack}\n\n${buildPackageCatalogOfferBlock(
    cleaned.length ? cleaned : services,
    sourceText
  )}`;
}

/** Extrae servicios mencionados en una oferta reciente de Lucy (bullets). */
function extractOfferedServicesFromHistory(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): string[] {
  const lastAsst = [...history]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  if (!lastAsst || typeof lastAsst.content !== "string") return [];
  const text = lastAsst.content;
  const fromParse = parseServicesFromText(text);
  if (fromParse.length) return fromParse.slice(0, 6);
  const bullets = [...text.matchAll(/^[•\-*]\s*\*?([^*\n]{3,60})\*?/gm)].map((m) =>
    m[1]!.trim().replace(/\s+/g, " ")
  );
  return bullets.slice(0, 6);
}

/**
 * Cliente pide precios sin SKU concreto (A14943: "ver los precios" / "Precios!!").
 * Aclara de cuál servicio, o cotiza el único ya anotado.
 */
export function buildGenericPriceClarifyReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string {
  const fromReq = parseServicesFromText(extracted.requerimientos_evento ?? "");
  const fromCtx = parseServicesFromText(
    collectUserTexts(history, currentMessage).join(" ")
  );
  const fromOffer = extractOfferedServicesFromHistory(history);
  const options = [...new Set([...fromReq, ...fromCtx, ...fromOffer])].filter(
    (s) => !/comida\s+corrida/i.test(s)
  );
  if (options.length === 1) {
    const priced = buildCatalogPriceAnswer(options[0]!);
    if (priced && messageClaimsPrice(priced)) return priced;
  }
  if (options.length >= 2) {
    const list = options.slice(0, 5).join(", ");
    return `Claro. ¿De cuál te paso precios de referencia: ${list}?`;
  }
  return "Claro. ¿De qué servicio te paso precios: coffee break, banquete, barra de bebidas, taquiza u otro?";
}

/** Cliente pide ver paquetes/niveles sin servicio concreto. */
export function buildGenericPackagesOverviewReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string
): string {
  const fromCrm = isValidRequerimientosValue(extracted.requerimientos_evento)
    ? parseServicesFromText(extracted.requerimientos_evento!)
    : [];
  const fromMsg = currentMessage ? parseServicesFromText(currentMessage) : [];
  const fromHist = extractOfferedServicesFromHistory(history);
  const multi = dedupeServiceHierarchy([...fromMsg, ...fromCrm, ...fromHist]);
  // A14982: si ya hay 2+ servicios (Yucateca + Taquiza), volcar niveles de ambos.
  const multiLevels = buildMultiServiceSheetLevelsReply(multi, currentMessage);
  if (multiLevels) {
    return `Claro, te dejo los paquetes/niveles con precios:\n\n${multiLevels}`;
  }
  const hint =
    preferPrimaryCatalogService(multi) ||
    (isValidRequerimientosValue(extracted.requerimientos_evento)
      ? extracted.requerimientos_evento
      : null) ||
    parsePrimaryService(collectUserTexts(history, currentMessage).join(" ")) ||
    fromHist[0] ||
    null;
  if (hint) {
    const detail =
      buildCatalogPriceAnswer(hint) ||
      resolveCatalogInclusionReply(hint, hint) ||
      buildCatalogServiceDetailAnswer(hint);
    if (detail) {
      return ensureCatalogWebLink(
        `Claro. Para *${hint}* manejamos varios paquetes/niveles:\n\n${detail}`,
        hint
      );
    }
  }
  return ensureCatalogWebLink(
    "Claro. Armamos paquetes a la medida (por ejemplo coffee break, banquete, barra de bebidas, mobiliario y DJ). " +
      "¿Con cuál servicio quieres empezar a ver paquetes y precios?",
    null
  );
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
  if (/\?|¿/.test(message)) return true;
  if (clientAsksConcreteProductQuestion(message)) return true;
  return (
    clientAsksLocation(message) ||
    /cu[aá]nto|precio|costo|cat[aá]logo|c+t?a+l+[oó]+g+|men[uú]|tienen|incluye|kosher|horario|tel[eé]fono|correo\s+de\s+bodasesor|hola@|fotos?|iluminaci|luz|cuenta\s+con/i.test(
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

/**
 * V9.26: acuse muerto sin pregunta ("Perfecto, ya lo tengo anotado.") —
 * Lucy corta el embudo y "termina" ella en vez de seguir pidiendo datos.
 * Si hay `?` no aplica (ack + pregunta OK).
 */
export function looksLikeDeadEndAck(mensaje: string): boolean {
  const t = (mensaje || "").trim();
  if (!t) return true;
  if (/\?/.test(t)) return false;
  // Cierre / handoff con "ya tengo todo" no es un ack muerto si hay `?`;
  // sin pregunta, applyLucyMessageGuards reabre el embudo si faltan datos.
  if (
    /ya tengo todo|paso (estos )?datos|cotizaci[oó]n personalizada|nuestro equipo (ya )?(tiene|sigue)/i.test(
      t
    )
  ) {
    return false;
  }
  return (
    /\b(ya\s+lo\s+tengo\s+anotad[oa]?|lo\s+tengo\s+anotad[oa]?|ya\s+lo\s+anoto|ya\s+anot[eé]|ya\s+tengo\s+lo\s+principal|seguimos\s+con\s+lo\s+que\s+ya\s+platicamos)\b/i.test(
      t
    ) || (/^perfecto[^.!]*[.!]?\s*$/i.test(t) && t.length < 60)
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

  // A15296: caption con centros de mesa (+ qty) → CRM antes del embudo.
  const caption = clientCaptionForServiceParse(currentMessage);
  const centros = parseCentrosDeMesaRequirement(caption);
  if (centros) {
    const merged = mergeServiceRequirements(extracted.requerimientos_evento, centros, 6);
    if (merged) {
      extracted.requerimientos_evento = merged;
      filledSet.add("Requerimientos o servicios");
    }
  } else if (caption && parseServicesFromText(caption).length > 0) {
    const merged = mergeServiceRequirements(
      extracted.requerimientos_evento,
      parseServicesFromText(caption).join(", "),
      6
    );
    if (merged) {
      extracted.requerimientos_evento = merged;
      filledSet.add("Requerimientos o servicios");
    }
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

  for (const field of FIELD_ORDER) {
    if (field === pending) continue;
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
    emailRefusedThisTurn,
    history,
    currentMessage,
    whatsappDisplayName,
    buildClosing,
    log,
    entityId,
    forceFirstPresentation,
  } = input;
  let { cierreYaEnviado } = input;

  const ctx = makeQuestionCtx(input);
  const presHistory = input.presentationHistory ?? history;

  syncFilledFromExtracted(filledSet, extracted);
  // A15295: colores de temática (foto) nunca deben vivir en zona.
  if (extracted.direccion_evento) {
    if (looksLikeThemeColorNotLocation(extracted.direccion_evento)) {
      extracted.direccion_evento = null;
      filledSet.delete("Lugar/dirección del evento");
    } else {
      const cleanedZona = stripThemeColorsFromZona(extracted.direccion_evento);
      if (cleanedZona) extracted.direccion_evento = cleanedZona;
    }
  }
  applyInvitadosWaiver(
    filledSet,
    [],
    collectUserTexts(presHistory, currentMessage),
    presHistory
  );

  // V9.36: si Lucy "cerró" pero aún faltan datos reales, reabre el embudo.
  if (cierreYaEnviado && getNextPendingField(extracted, filledSet)) {
    cierreYaEnviado = false;
    log?.info({ entityId }, "GUARD: V9.36 — cierre prematuro, se reabre el chat");
  }

  // Captura estructural antes de cualquier rama: una respuesta "3 x 4" completa
  // carpa/pista/tarima y evita que el cierre vuelva a pedir las medidas.
  const dimensionsNow = parseSpaceDimensions(currentMessage ?? "");
  if (
    dimensionsNow &&
    (clientMentionsCarpas(extracted.requerimientos_evento ?? "") ||
      clientMentionsPistaTarima(extracted.requerimientos_evento ?? ""))
  ) {
    const req = extracted.requerimientos_evento?.trim() || "Servicio";
    if (!parseSpaceDimensions(req)) {
      extracted.requerimientos_evento = `${req} (espacio ${dimensionsNow})`;
    }
    filledSet.add("Requerimientos o servicios");
  }

  // A15164: recuperar nombre del historial/mensaje actual antes del embudo.
  if (!isFieldSatisfied("nombre", filledSet, extracted)) {
    const recoveredNombre = recoverClienteNombreFromHistory(presHistory, currentMessage);
    if (recoveredNombre) {
      extracted.nombre = recoveredNombre;
      filledSet.add("Nombre del cliente");
      log?.info({ entityId, recoveredNombre }, "GUARD: A15164 — nombre recuperado al inicio");
    }
  }

  // A15007: correo no es CF durable — recuperar del historial ANTES del embudo.
  if (!isEmailSatisfied(filledSet, extracted)) {
    const recovered = recoverCorreoFromUserTexts(
      collectUserTexts(presHistory, currentMessage),
      currentMessage
    );
    if (recovered && looksLikeValidClientEmail(recovered)) {
      extracted.correo = recovered;
      filledSet.add("Correo electrónico");
      log?.info({ entityId, recovered }, "GUARD: A15007 — correo recuperado del historial");
    }
  }

  // A15007: "A este" / "ya me preguntaste" → resolver al campo pedido, no reiniciar.
  {
    const lastAsstEarly = [...presHistory]
      .reverse()
      .find((m) => m.role === "assistant" && typeof m.content === "string");
    const askedEarly = lastAsstEarly
      ? inferLucyAskedField(lastAsstEarly.content as string)
      : null;
    const msgEarly = currentMessage?.trim() ?? "";
    const referential = isReferentialPriorAnswer(msgEarly);
    const complains = clientComplainsAboutRepeat(msgEarly);
    if (msgEarly && (referential || complains)) {
      // A15164: recuperar nombre del historial antes del ack (nunca re-preguntar nombre).
      if (!isFieldSatisfied("nombre", filledSet, extracted)) {
        const recoveredNombre = recoverClienteNombreFromHistory(presHistory, undefined);
        if (recoveredNombre) {
          extracted.nombre = recoveredNombre;
          filledSet.add("Nombre del cliente");
          log?.info(
            { entityId, recoveredNombre },
            "GUARD: A15164 — nombre recuperado tras queja/referencia"
          );
        }
      }
      // A15212: "Al mismo que ya te he enviado" / queja → recuperar correo SIEMPRE si falta.
      if (!isEmailSatisfied(filledSet, extracted)) {
        const recovered = recoverCorreoFromUserTexts(
          collectUserTexts(presHistory, currentMessage),
          currentMessage
        );
        if (recovered && looksLikeValidClientEmail(recovered)) {
          extracted.correo = recovered;
          filledSet.add("Correo electrónico");
          log?.info(
            { entityId, recovered, askedEarly },
            "GUARD: A15212 — correo recuperado tras referencia/queja"
          );
        }
      }
      // Medidas ya dadas en historial (carpas/pista).
      if (
        askedEarly === "requerimientos" ||
        (lastAsstEarly && /medidas/i.test(lastAsstEarly.content as string))
      ) {
        const histDims = collectUserTexts(presHistory, undefined)
          .map((t) => parseSpaceDimensions(t))
          .find(Boolean);
        if (histDims && /carpa/i.test(extracted.requerimientos_evento ?? "")) {
          const merged = mergeServiceRequirements(
            extracted.requerimientos_evento,
            `Carpas (espacio ${histDims})`,
            6
          );
          if (merged) extracted.requerimientos_evento = merged;
          filledSet.add("Requerimientos o servicios");
        }
      }
    }
  }

  // A14934: "40" tras pregunta de invitados — sincronizar antes de que GPT re-pregunte.
  {
    const lastAsst = [...presHistory]
      .reverse()
      .find((m) => m.role === "assistant" && typeof m.content === "string");
    const askedNow = lastAsst
      ? inferLucyAskedField(lastAsst.content as string)
      : null;
    if (
      currentMessage &&
      !filledSet.has("Número de invitados") &&
      !extracted.num_invitados &&
      (askedNow === "invitados" ||
        (lastAsst &&
          /invitados|cu[aá]ntos|asistir[aá]n/i.test(lastAsst.content as string)))
    ) {
      const inv = parseInvitadosFromText(currentMessage);
      if (inv) {
        const n = parseInt(inv, 10);
        if (Number.isFinite(n) && n >= 1) {
          extracted.num_invitados = n;
          filledSet.add("Número de invitados");
          log?.info({ entityId, n }, "GUARD: invitados desde mensaje actual");
        }
      }
    }
  }

  // A15007: "A este" / "ya me preguntaste" — no reiniciar embudo ni "Sigo aquí".
  // V9.26: nunca devolver solo el ack (corta la conversación).
  if (
    !cierreYaEnviado &&
    currentMessage &&
    (isReferentialPriorAnswer(currentMessage) || clientComplainsAboutRepeat(currentMessage))
  ) {
    const pending = getNextPendingField(extracted, filledSet);
    const nombre = getDisplayName(extracted, whatsappDisplayName);
    const ack = nombre
      ? `Perfecto, ${nombre}. Ya lo tengo anotado.`
      : "Perfecto. Ya lo tengo anotado.";
    let body: string;
    if (pending) {
      body = `${ack}\n\n${buildNaturalQuestion(pending, ctx)}`;
    } else if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      body = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
    } else {
      // filledSet desfasado vs extracted: mantener el chat abierto
      body = nombre
        ? `Perfecto, ${nombre}. ¿Me confirmas la fecha, zona, invitados o presupuesto que aún falte?`
        : "Perfecto. ¿Me confirmas la fecha, zona, invitados o presupuesto que aún falte?";
    }
    log?.info({ entityId, pending }, "GUARD: A15007 — referencia/queja de repetición → avanzar");
    return normalizeAdvisorReferences(
      body,
      extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
    );
  }

  // A14938: "¿Hacen las pizzas en el evento?" — responder operativo antes del embudo.
  if (
    !cierreYaEnviado &&
    currentMessage &&
    clientAsksServiceInfo(currentMessage) &&
    /\b(hacen|preparan|cocinan|montan|sirven|elaboran)\b/i.test(currentMessage) &&
    /\b(pizza|barra|estaci[oó]n|evento)\b/i.test(currentMessage)
  ) {
    const ack = buildGuardServiceAck(currentMessage);
    const pending = getNextPendingField(extracted, filledSet);
    const nextQ =
      pending && pending !== "requerimientos"
        ? buildNaturalQuestion(pending, ctx)
        : null;
    const body = nextQ && !ack.includes(nextQ) ? `${ack}\n\n${nextQ}` : ack;
    log?.info({ entityId }, "GUARD: servicio en el evento — respuesta operativa");
    return normalizeAdvisorReferences(
      body,
      extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
    );
  }

  // A15210: corrección de ubicación (piso/torre/patio/otra) — actualizar y pedir dirección exacta.
  if (
    !cierreYaEnviado &&
    currentMessage &&
    isUsableDireccionEvento(extracted.direccion_evento) &&
    (clientCorrectsLocation(currentMessage) || isVenueSpaceDetail(currentMessage))
  ) {
    const nextDir = applyLocationCorrectionToAddress(
      extracted.direccion_evento,
      currentMessage
    );
    if (nextDir) {
      extracted.direccion_evento = nextDir;
      filledSet.add("Lugar/dirección del evento");
    }
    const display = getDisplayName(extracted, whatsappDisplayName);
    const needsExactAddress =
      /\botra\s+ubicaci[oó]n\b|\bno\s+es\s+en\s+(el\s+)?piso\b|\bme\s+equivoqu/i.test(
        currentMessage
      ) &&
      (!nextDir ||
        (!/\b(patio|calle|av\.?|sal[oó]n|torre|colonia)\b/i.test(nextDir) &&
          nextDir.split(/\s+/).length <= 3));
    let body: string;
    if (/\bpatio\b/i.test(currentMessage) && !/\botra\s+ubicaci[oó]n\b/i.test(currentMessage)) {
      body = [
        display ? `Entendido, ${display}.` : "Entendido.",
        nextDir ? `Anoto *${nextDir}*.` : "Anoto que es en un patio.",
        "¿Me confirmas la dirección o el nombre del lugar exacto?",
      ].join(" ");
    } else if (isVenueSpaceDetail(currentMessage) && nextDir) {
      body = [
        display ? `Perfecto, ${display}.` : "Perfecto.",
        `Anoto *${nextDir}*.`,
        getNextPendingField(extracted, filledSet)
          ? buildNaturalQuestion(getNextPendingField(extracted, filledSet)!, ctx)
          : null,
      ]
        .filter(Boolean)
        .join(" ");
    } else if (needsExactAddress) {
      body = [
        display ? `Gracias por la corrección, ${display}.` : "Gracias por la corrección.",
        nextDir && !/\bpiso\s*\d+/i.test(nextDir)
          ? `Quito el dato anterior y dejo *${nextDir}*.`
          : "Quito el dato anterior de la ubicación.",
        "¿Me compartes la dirección o el nombre del lugar correcto?",
      ].join(" ");
    } else {
      body = [
        display ? `Listo, ${display}.` : "Listo.",
        nextDir ? `Actualizo la ubicación a *${nextDir}*.` : "Actualizo la ubicación.",
        getNextPendingField(extracted, filledSet)
          ? buildNaturalQuestion(getNextPendingField(extracted, filledSet)!, ctx)
          : "¿Me confirmas la dirección exacta del evento?",
      ]
        .filter(Boolean)
        .join(" ");
    }
    log?.info(
      { entityId, nextDir, msg: currentMessage.slice(0, 80) },
      "GUARD: A15210 — corrección de ubicación"
    );
    return normalizeAdvisorReferences(body, display);
  }

  // V9.30: salón/hacienda sin ciudad → no cerrar ubicación; pedir ciudad.
  if (
    !cierreYaEnviado &&
    currentMessage &&
    isVenueWithoutCity(currentMessage) &&
    !isUsableDireccionEvento(currentMessage)
  ) {
    const lastAsstZona = [...presHistory]
      .reverse()
      .find((m) => m.role === "assistant" && typeof m.content === "string");
    const askedZona = lastAsstZona
      ? inferLucyAskedField(lastAsstZona.content as string)
      : null;
    const zonaPending = !isFieldSatisfied("zona", filledSet, extracted);
    if (
      askedZona === "zona" ||
      (zonaPending &&
        /sal[oó]n|hacienda|hotel|club|expo|jard[ií]n/i.test(currentMessage))
    ) {
      if (
        extracted.direccion_evento &&
        (isVenueWithoutCity(extracted.direccion_evento) ||
          !isUsableDireccionEvento(extracted.direccion_evento))
      ) {
        extracted.direccion_evento = null;
        filledSet.delete("Lugar/dirección del evento");
      }
      const venue = extractVenueNameHint(currentMessage);
      const display = getDisplayName(extracted, whatsappDisplayName);
      const body = [
        display ? `Listo, ${display}.` : "Listo.",
        venue ? `Anoto *${venue}*.` : null,
        "Para cotizar bien necesito al menos la *ciudad* del evento. ¿En qué ciudad está?",
      ]
        .filter(Boolean)
        .join(" ");
      log?.info(
        { entityId, venue, msg: currentMessage.slice(0, 80) },
        "GUARD: V9.30 — venue sin ciudad → pedir ciudad"
      );
      return normalizeAdvisorReferences(body, display);
    }
  }

  // V9.34: anotar ciudad cuando el cliente responde con topónimo (evita bucle "¿en qué ciudad?").
  if (
    !cierreYaEnviado &&
    currentMessage &&
    !isFieldSatisfied("zona", filledSet, extracted)
  ) {
    const zonaNow = parseZonaFromText(currentMessage);
    if (zonaNow && isUsableDireccionEvento(zonaNow)) {
      extracted.direccion_evento = mergeZonaDetail(extracted.direccion_evento, zonaNow) ?? zonaNow;
      filledSet.add("Lugar/dirección del evento");
    }
  }

  // A14938: "en Tlalnepantla" con pizzas ya pedidas — anotar zona, no inventar taquiza.
  if (
    !cierreYaEnviado &&
    currentMessage &&
    (() => {
      const z = parseZonaFromText(currentMessage);
      return (
        !!z &&
        currentMessage.trim().split(/\s+/).length <= 6 &&
        (/^en\s+/i.test(currentMessage.trim()) || isLikelyUbicacionNotNombre(currentMessage))
      );
    })()
  ) {
    const zonaNow = parseZonaFromText(currentMessage)!;
    if (!isUsableDireccionEvento(extracted.direccion_evento)) {
      extracted.direccion_evento = zonaNow;
      filledSet.add("Lugar/dirección del evento");
    }
    const wantsPizza =
      /pizza/i.test(extracted.requerimientos_evento ?? "") ||
      /pizza/i.test(
        collectUserTexts(presHistory, currentMessage).join(" ")
      );
    if (wantsPizza) {
      const pending = getNextPendingField(extracted, filledSet);
      const nextQ = pending ? buildNaturalQuestion(pending, ctx) : null;
      const display = getDisplayName(extracted, whatsappDisplayName);
      const body = [
        display ? `Perfecto, ${display}.` : "Perfecto.",
        `Anoto la ubicación en *${zonaNow}*.`,
        "Seguimos con la cotización de *pizzas* para tu evento.",
        nextQ,
      ]
        .filter(Boolean)
        .join(" ");
      log?.info({ entityId, zonaNow }, "GUARD: zona + pizzas — ack sin taquiza");
      return normalizeAdvisorReferences(body, display);
    }
  }

  // V9.23 / A15298+: RFQ largo completo → sync campos + ack + 1 pregunta embudo.
  // ANTES de fotos/inclusiones: "Fotografías del mobiliario" dentro del brief
  // no debe secuestrar el turno hacia catálogo de mesas.
  if (
    !cierreYaEnviado &&
    currentMessage &&
    isRichQuoteBrief(currentMessage) &&
    !(
      isMobiliarioRentalPedido(currentMessage) &&
      parseMobiliarioRentItems(currentMessage).length >= 1 &&
      parseServicesFromText(currentMessage).filter((s) => !/mobiliario/i.test(s)).length === 0
    )
  ) {
    // Primer contacto: intro aunque el brief ya traiga correo (A15007 lo llena antes).
    const isOpening =
      (forceFirstPresentation || isFirstLucyReply(presHistory)) &&
      !filledSet.has("Nombre del cliente") &&
      !presHistory.some((m) => m.role === "assistant");
    syncRichBriefIntoExtracted(extracted, filledSet, currentMessage);
    const services = parseServicesFromText(
      `${extracted.requerimientos_evento ?? ""} ${currentMessage}`
    );
    const ack = buildRichBriefAcknowledgment(currentMessage);
    const pending = getNextPendingField(extracted, filledSet);
    const wantsCatalog =
      clientAsksForCatalog(currentMessage) ||
      clientAsksInclusion(currentMessage) ||
      clientWantsFullCatalog(currentMessage) ||
      /\b(opci[oó]n\s*[123]|tres\s+propuestas|propuestas?\s+de\s+men[uú]|paquetes?|niveles?)\b/i.test(
        currentMessage
      ) ||
      (isOpening && services.length >= 2);
    const catalogBlock = wantsCatalog
      ? `\n\n${buildPackageCatalogOfferBlock(services, currentMessage)}`
      : "";
    if (
      pending === "presupuesto" &&
      !filledSet.has("Presupuesto (MXN)") &&
      /\b(propuesta|cotizaci[oó]n|env[ií]en|manden)\b/i.test(currentMessage) &&
      !parsePresupuestoFromText(currentMessage) &&
      !/\bsin\s+perder\s+de\s+vista\s+el\s+presupuesto\b/i.test(currentMessage)
    ) {
      filledSet.add("Presupuesto (MXN)");
      if (!extracted.presupuesto) {
        extracted.presupuesto = "Sin definir (cliente pidió que propongamos)";
      }
    }
    const pendingAfter = getNextPendingField(extracted, filledSet);
    if (isReadyForClosing(filledSet)) {
      log?.info({ entityId }, "GUARD: V9.23 — RFQ rico completo → cierre");
      return normalizeAdvisorReferences(
        buildClosing(
          extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
          extracted.nombre
        ),
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
    const nextQ = pendingAfter
      ? buildNaturalQuestion(pendingAfter, ctx)
      : null;
    const intro = isOpening && !/hola,?\s*soy\s+lucy/i.test(ack) ? `${LUCY_INTRO} ` : "";
    const body = nextQ
      ? `${intro}${ack}${catalogBlock}\n\n${nextQ}`.trim()
      : `${intro}${ack}${catalogBlock}`.trim();
    log?.info(
      { entityId, pending: pendingAfter, catalog: !!catalogBlock, opening: isOpening },
      "GUARD: V9.23 — RFQ rico: sync + ack + embudo (sin dump)"
    );
    return normalizeAdvisorReferences(
      body,
      extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
    );
  }

  // A15286: pregunta concreta (fotos/luz/capacidad/catálogo typo) — ANTES de
  // carpas/progresivo/embudo. Responder o diferir; no "¿Seguimos…?" vacío.
  // A15296: turno con imagen (Vision) → rama de imagen, no path "manda fotos".
  if (
    !cierreYaEnviado &&
    currentMessage?.trim() &&
    !isRichQuoteBrief(currentMessage) &&
    !extractImageClientReply(currentMessage) &&
    clientAsksConcreteProductQuestion(currentMessage)
  ) {
    const serviceHintConcrete =
      (isValidRequerimientosValue(extracted.requerimientos_evento)
        ? extracted.requerimientos_evento
        : null) ||
      parsePrimaryService(collectUserTexts(presHistory, currentMessage).join(" ")) ||
      findMentionedService(collectUserTexts(presHistory, currentMessage).join(" "));
    const concreteReply = buildConcreteProductQuestionReply(
      currentMessage,
      serviceHintConcrete
    );
    if (concreteReply) {
      log?.info(
        { entityId },
        "GUARD: A15286 — pregunta concreta (return temprano global)"
      );
      return normalizeAdvisorReferences(
        mergeWithPendingQuestion(
          `${pickTransition(presHistory)} ${concreteReply}`,
          filledSet,
          extracted,
          ctx
        ),
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
  }

  // A15296 (todas las ramas): imagen + caption → ack Vision + capturar servicio + embudo.
  // Debe ir ANTES de "3 tiempos"/inclusiones/deferredKnownServiceOffer (evita dump de niveles).
  if (!cierreYaEnviado && extractImageClientReply(currentMessage)) {
    const imageReply = buildImageActionReply(
      currentMessage,
      extracted,
      filledSet,
      ctx
    );
    const body = imageReply ?? extractImageClientReply(currentMessage)!;
    log?.info(
      { entityId, intent: extractImageIntent(currentMessage) },
      "GUARD: A15296 — imagen accionable (return temprano, cualquier servicio)"
    );
    return normalizeAdvisorReferences(
      body,
      extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
    );
  }

  // A15297: "Sí" tras "¿seguimos con el siguiente dato?" / "¿detalles de alguno?"
  // → pregunta REAL del embudo (nunca catálogo general / colgantes / filler otra vez).
  {
    const lastAsstForContinue = [...presHistory]
      .reverse()
      .find((m) => m.role === "assistant" && typeof m.content === "string");
    const lastContinueText =
      lastAsstForContinue && typeof lastAsstForContinue.content === "string"
        ? (lastAsstForContinue.content as string)
        : null;
    const shortYes = /^(s[ií]|sip|sep|dale|claro|ok|okay|va|por\s+favor)([.!?]|\s|$)/i.test(
      (currentMessage ?? "").trim()
    );
    const detalleCtaWithoutCatalog =
      !!lastContinueText &&
      /quieres que te d[eé] detalles de alguno/i.test(lastContinueText) &&
      !assistantOfferedCatalogDetail(lastContinueText);
    if (
      !cierreYaEnviado &&
      currentMessage?.trim() &&
      (clientAffirmsEmbudoContinue(currentMessage, lastContinueText) ||
        (shortYes && detalleCtaWithoutCatalog))
    ) {
      const pending = getNextPendingField(extracted, filledSet);
      const nextQ = pending
        ? buildNaturalQuestion(pending, ctx)
        : "¿Me compartes un correo para enviarte los detalles?";
      log?.info(
        { entityId, pending },
        "GUARD: A15297 — afirma continuar embudo (pregunta real)"
      );
      return normalizeAdvisorReferences(
        nextQ,
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
  }

  // A15297: SKU concreto (Sala Ariel / Mesa Centro Mármol) → anotar + siguiente dato real.
  {
    const sku = parseFurnitureCatalogSkuFromText(currentMessage ?? "");
    if (!cierreYaEnviado && sku && currentMessage?.trim()) {
      extracted.requerimientos_evento = mergeServiceRequirements(
        extracted.requerimientos_evento,
        sku,
        6
      );
      if (extracted.requerimientos_evento) {
        filledSet.add("Requerimientos o servicios");
      }
      // También capturar fecha si vino en el mismo turno / historial cercano.
      if (!extracted.fecha_horario?.trim()) {
        const fechaNow = parseFechaFromText(currentMessage);
        if (fechaNow) {
          extracted.fecha_horario = fechaNow;
          filledSet.add("Fecha y horario");
        }
      }
      const pending = getNextPendingField(extracted, filledSet);
      const nextQ = pending
        ? buildNaturalQuestion(pending, ctx)
        : null;
      const ack = `Perfecto, anoto *${sku}* para tu cotización.`;
      log?.info(
        { entityId, sku, pending },
        "GUARD: A15297 — SKU mobiliario anotado + embudo"
      );
      return normalizeAdvisorReferences(
        nextQ ? `${ack} ${nextQ}` : ack,
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
  }

  // A15297: respuesta de fecha clara → anotar y avanzar (no "¿detalles de alguno?").
  {
    const lastAsstFecha = [...presHistory]
      .reverse()
      .find((m) => m.role === "assistant" && typeof m.content === "string");
    const lastFechaTxt =
      lastAsstFecha && typeof lastAsstFecha.content === "string"
        ? (lastAsstFecha.content as string)
        : "";
    const fechaNow = currentMessage ? parseFechaFromText(currentMessage) : null;
    const lucyAskedFecha =
      inferLucyAskedField(lastFechaTxt) === "fecha" ||
      /d[ií]a u horario|para cu[aá]ndo|fecha/i.test(lastFechaTxt);
    const fechaPending = getNextPendingField(extracted, filledSet) === "fecha";
    const looksLikeFechaOnly =
      !!fechaNow &&
      !parseFurnitureCatalogSkuFromText(currentMessage ?? "") &&
      !parseCorreoFromText(currentMessage ?? "") &&
      (lucyAskedFecha ||
        fechaPending ||
        /^(el\s+)?\d{1,2}\s+de\s+\w+/i.test((currentMessage ?? "").trim()));
    if (
      !cierreYaEnviado &&
      fechaNow &&
      looksLikeFechaOnly &&
      !filledSet.has("Fecha y horario")
    ) {
      // Conservar horario si lo dijo ("a partir de 4:00 pm").
      const withTime = (currentMessage ?? "").match(
        /\b(?:a\s+partir\s+de|a\s+las)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?|horas?)?)/i
      );
      extracted.fecha_horario = withTime
        ? `${fechaNow} a partir de ${withTime[1]!.trim()}`
        : fechaNow;
      filledSet.add("Fecha y horario");
      const pending = getNextPendingField(extracted, filledSet);
      const nextQ = pending ? buildNaturalQuestion(pending, ctx) : null;
      const ack = `Perfecto, anoto la fecha: *${extracted.fecha_horario}*.`;
      log?.info(
        { entityId, fecha: extracted.fecha_horario, pending },
        "GUARD: A15297 — fecha capturada + embudo real"
      );
      return normalizeAdvisorReferences(
        nextQ ? `${ack} ${nextQ}` : ack,
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
  }

  // A15295 (todas las ramas): "no quiero comida / quítale alimentos" → quitar + ack + embudo.
  // Debe ir ANTES de isVagueFoodTerm / catálogo pizza / re-anotar Alimentos.
  {
    const recentUserForDecline = collectUserTexts(presHistory, undefined).slice(-4);
    const declineFamilies = clientDeclinesServiceFamiliesWithContext(
      currentMessage,
      recentUserForDecline
    );
    if (!cierreYaEnviado && currentMessage?.trim() && declineFamilies.length > 0) {
      extracted.requerimientos_evento = removeDeclinedFamiliesFromRequirements(
        extracted.requerimientos_evento,
        declineFamilies
      );
      // Merge puede re-parsear "Comida" (typo fix) → volver a stripear familias declinadas.
      const afterRaw = mergeServiceRequirements(
        extracted.requerimientos_evento,
        clientCaptionForServiceParse(currentMessage) || currentMessage,
        6
      );
      const after = removeDeclinedFamiliesFromRequirements(afterRaw, declineFamilies);
      extracted.requerimientos_evento = after;
      if (after) filledSet.add("Requerimientos o servicios");
      else filledSet.delete("Requerimientos o servicios");

      const ack = buildServiceDeclineAck(declineFamilies);
      const pending = getNextPendingField(extracted, filledSet);
      const nextQ =
        pending && pending !== "requerimientos"
          ? buildNaturalQuestion(pending, ctx)
          : pending === "requerimientos"
            ? "¿Qué más te gustaría incluir en la cotización (sin alimentos, si así lo prefieres)?"
            : null;
      log?.info(
        { entityId, families: declineFamilies },
        "GUARD: A15295 — declina familia de servicio (return temprano)"
      );
      return normalizeAdvisorReferences(
        nextQ ? `${ack} ${nextQ}` : ack,
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
  }

  // Salida temprana: "qué incluye / descripción de cada nivel" no debe perderse
  // por redirect a zona ni anti-repeat de embudo.
  if (clientAsksInclusion(currentMessage) && !cierreYaEnviado && !isRichQuoteBrief(currentMessage)) {
    // Precio SKU concreto → dejar que la rama de precio use Sheet.
    if (clientAsksPrice(currentMessage)) {
      /* fall through */
    } else {
    // A14982: "ofreces los paquetes" con 2+ SKUs en CRM → niveles Sheet de ambos.
    // Debe ir ANTES del menú progresivo: si el hint es "Yucateca, Taquiza",
    // shouldOfferOptionsBeforeDetail caía en menú solo de taquiza y nunca pedía correo.
    const multiForPackagesEarly = dedupeServiceHierarchy([
      ...parseServicesFromText(extracted.requerimientos_evento ?? ""),
      ...parseServicesFromText(currentMessage ?? ""),
    ]);
    const asksPackagesListEarly =
      /\bpaquetes?\b|\bniveles?\b|\bofreces?\b|idea\s+m[aá]s\s+clara/i.test(
        currentMessage ?? ""
      );
    const multiPackageDumpEarly =
      asksPackagesListEarly && multiForPackagesEarly.length >= 2
        ? buildMultiServiceSheetLevelsReply(
            multiForPackagesEarly,
            currentMessage
          )
        : null;
    if (multiPackageDumpEarly) {
      log?.info(
        { entityId, n: multiForPackagesEarly.length },
        "GUARD: paquetes multi-servicio — niveles Sheet (return temprano) + embudo"
      );
      return normalizeAdvisorReferences(
        mergeWithPendingQuestion(
          `${pickTransition(presHistory)} Claro, te dejo los paquetes/niveles con precios:\n\n${multiPackageDumpEarly}`,
          filledSet,
          extracted,
          ctx
        ),
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
    const userBlobEarly = collectUserTexts(presHistory, currentMessage).join(" ");
    const serviceHintEarly =
      (isValidRequerimientosValue(extracted.requerimientos_evento)
        ? extracted.requerimientos_evento
        : null) ||
      parsePrimaryService(userBlobEarly) ||
      findMentionedService(userBlobEarly) ||
      (/\bcanap/i.test(`${currentMessage ?? ""} ${userBlobEarly}`)
        ? "Canapés"
        : null);
    // A15251: "¿incluye bebidas?" ANTES del menú progresivo (no re-listar familias).
    const specificItemEarly = buildSpecificInclusionItemReply(
      currentMessage ?? "",
      serviceHintEarly
    );
    if (specificItemEarly) {
      log?.info(
        { entityId, item: clientAsksSpecificInclusionItem(currentMessage) },
        "GUARD: A15251 — inclusión puntual (return temprano)"
      );
      return normalizeAdvisorReferences(
        mergeWithPendingQuestion(
          `${pickTransition(presHistory)} ${specificItemEarly}`,
          filledSet,
          extracted,
          ctx
        ),
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
    // A15286: pregunta concreta (fotos/luz/capacidad/catálogo typo) ANTES de menús.
    const concreteEarly = buildConcreteProductQuestionReply(
      currentMessage ?? "",
      serviceHintEarly
    );
    if (concreteEarly) {
      log?.info(
        { entityId },
        "GUARD: A15286 — pregunta concreta (return temprano)"
      );
      return normalizeAdvisorReferences(
        mergeWithPendingQuestion(
          `${pickTransition(presHistory)} ${concreteEarly}`,
          filledSet,
          extracted,
          ctx
        ),
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
    // V8.68: sin variante → menú de opciones (no dump PDF completo).
    // No usar hint multi-SKU: evita menú de una sola familia con 2 servicios en CRM.
    const earlyOptionsHint =
      multiForPackagesEarly.length >= 2
        ? null
        : extracted.requerimientos_evento;
    const earlyOptions = shouldOfferOptionsBeforeDetail({
      currentMessage,
      history: presHistory,
      serviceHint: earlyOptionsHint,
    });
    if (earlyOptions) {
      log?.info({ entityId }, "GUARD: inclusiones — menú opciones (return temprano)");
      return normalizeAdvisorReferences(
        `${pickTransition(presHistory)} ${earlyOptions.menu}`.trim(),
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
    // Nivel concreto (CB4, Tradicional…): solo el query del mensaje — no fallback
    // a "Coffee Break" genérico (devolvía CB1 cuando el PDF no tiene CB4).
    const specificNivelAsk =
      /\bcoffee\s*break\s*\d|\b\d\s*tiempos?\b|\b(tradicional|premium|b[aá]sic[ao]?)\b/i.test(
        currentMessage ?? ""
      );
    const pdfOnly =
      buildPdfInclusionReply(currentMessage ?? "") ||
      (!specificNivelAsk && serviceHintEarly
        ? buildPdfInclusionReply(`${serviceHintEarly} ${currentMessage ?? ""}`) ||
          buildPdfInclusionReply(serviceHintEarly)
        : null);
    if (pdfOnly && !/bet[uú]n|cupcakes?/i.test(pdfOnly)) {
      const withLink = ensureCatalogWebLink(
        collapseDuplicatedInclusionReply(pdfOnly),
        serviceHintEarly || currentMessage || ""
      );
      log?.info({ entityId }, "GUARD: inclusiones — PDF aprendido (return temprano)");
      return normalizeAdvisorReferences(
        withLink,
        extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
      );
    }
    const serviceHint = serviceHintEarly;
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
  }

  applyPresupuestoWaiver(
    filledSet,
    [],
    collectUserTexts(presHistory, currentMessage),
    presHistory
  );

  // "4 salas" ≠ 4 invitados; "Luxor Rosa" ≠ ubicación.
  // A15286: NO borrar invitados=300 solo porque el historial también dice "300 sillas".
  {
    const blob = collectUserTexts(presHistory, currentMessage).join(" ");
    if (extracted.num_invitados != null) {
      const n = String(extracted.num_invitados).replace(/[^\d]/g, "");
      if (n) {
        const asGuests = new RegExp(
          `\\b${n}\\s*(personas?|invitados?|pax|guests?)\\b`,
          "i"
        ).test(blob);
        const asFurnitureOnly = new RegExp(
          `\\b${n}\\s*(salas?|mesas?|sillas?|carpas?|pistas?|tarimas?)\\b`,
          "i"
        ).test(blob);
        if (asFurnitureOnly && !asGuests) {
          extracted.num_invitados = null;
          filledSet.delete("Número de invitados");
        }
      }
    }
    if (
      extracted.direccion_evento &&
      (isLikelyProductNameNotLocation(extracted.direccion_evento) ||
        isVagueVenueOnly(extracted.direccion_evento) ||
        isLocationDeferralOrVagueWorkplace(extracted.direccion_evento) ||
        looksLikeCompanyLocationQuestionFragment(extracted.direccion_evento) ||
        !isUsableDireccionEvento(extracted.direccion_evento) ||
        parseCarpaVariantFromText(extracted.direccion_evento) ||
        (/\bsala\s*:/i.test(blob) &&
          new RegExp(
            extracted.direccion_evento.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i"
          ).test(blob)))
    ) {
      const sala = parseSalaProductFromText(blob);
      const carpaVar =
        parseCarpaVariantFromText(extracted.direccion_evento) ||
        parseCarpaVariantFromText(currentMessage ?? "") ||
        parseCarpaVariantFromText(blob);
      const product = sala || carpaVar;
      if (product) {
        extracted.requerimientos_evento = mergeServiceRequirements(
          extracted.requerimientos_evento,
          product,
          6
        );
        if (extracted.requerimientos_evento) filledSet.add("Requerimientos o servicios");
      }
      extracted.direccion_evento = null;
      filledSet.delete("Lugar/dirección del evento");
    }
    // A14995: pregunta de sede este turno no debe quedar como zona.
    if (
      (clientAsksLocation(currentMessage) ||
        looksLikeCompanyLocationQuestionFragment(currentMessage)) &&
      extracted.direccion_evento &&
      looksLikeCompanyLocationQuestionFragment(extracted.direccion_evento)
    ) {
      extracted.direccion_evento = null;
      filledSet.delete("Lugar/dirección del evento");
    }
  }

  // Captura canónica: servicios del mensaje + historial (CRM).
  // La RESPUESTA multi-servicio solo mira el mensaje actual (A14924: "cumpleaños"
  // no debe reenviar el paquete pizza/pasta del turno anterior).
  // A14981: no parsear la respuesta inventada por Vision como pedido del cliente.
  const reqBeforeServiceMerge = extracted.requerimientos_evento?.trim() ?? "";
  const captionForServices = clientCaptionForServiceParse(currentMessage);
  // A15295: quitar familias declinadas ANTES de merge (no re-anotar Alimentos/Pizzas).
  const declinedFamilies = clientDeclinesServiceFamiliesWithContext(
    captionForServices || currentMessage,
    collectUserTexts(presHistory, undefined).slice(-4)
  );
  if (declinedFamilies.length > 0) {
    extracted.requerimientos_evento = removeDeclinedFamiliesFromRequirements(
      extracted.requerimientos_evento,
      declinedFamilies
    );
    if (!extracted.requerimientos_evento?.trim()) {
      filledSet.delete("Requerimientos o servicios");
    }
  }
  // A15295: limpiar colores temáticos pegados a la zona.
  if (extracted.direccion_evento) {
    if (looksLikeThemeColorNotLocation(extracted.direccion_evento)) {
      extracted.direccion_evento = null;
      filledSet.delete("Lugar/dirección del evento");
    } else {
      const cleanedZona = stripThemeColorsFromZona(extracted.direccion_evento);
      if (cleanedZona && cleanedZona !== extracted.direccion_evento) {
        extracted.direccion_evento = cleanedZona;
      }
    }
  }
  const userBlobForServices = collectUserTexts(presHistory, currentMessage)
    .map((t) => clientCaptionForServiceParse(t))
    .join(" ");
  const servicesFromCurrentMessage = parseServicesFromText(captionForServices);
  const servicesFromTurn = parseServicesFromText(
    `${captionForServices} ${userBlobForServices}`
  );
  if (
    servicesFromTurn.length > 0 &&
    !isVagueFoodTerm(captionForServices || currentMessage) &&
    declinedFamilies.length === 0 &&
    !clientDeclinesAnyService(captionForServices || currentMessage)
  ) {
    const mergeMax =
      isRichQuoteBrief(captionForServices || currentMessage) || servicesFromTurn.length >= 4
        ? 8
        : 6;
    const mergedReq = mergeServiceRequirements(
      extracted.requerimientos_evento,
      servicesFromTurn.join(", "),
      mergeMax
    );
    if (mergedReq) {
      extracted.requerimientos_evento = mergedReq;
      filledSet.add("Requerimientos o servicios");
    }
  } else if (declinedFamilies.length > 0 && captionForServices?.trim()) {
    // Merge solo para aplicar el strip vía mergeServiceRequirements (texto = decline).
    const strippedRaw = mergeServiceRequirements(
      reqBeforeServiceMerge,
      captionForServices,
      6
    );
    const stripped = removeDeclinedFamiliesFromRequirements(
      strippedRaw,
      declinedFamilies
    );
    extracted.requerimientos_evento = stripped;
    if (stripped) filledSet.add("Requerimientos o servicios");
    else filledSet.delete("Requerimientos o servicios");
  }
  // A14981 / A15212: "solo la comida" / "solo antojitos" → acotar al SKU primario.
  // No dejar que la palabra "comida" del mensaje pise un SKU concreto del CRM (pastas).
  if (clientWantsFoodOnlyQuote(currentMessage)) {
    const isVagueFoodLabel = (s: string | null | undefined) =>
      !!s && /^(Comida|Alimentos)$/i.test(s.trim());
    const fromCrm = preferPrimaryCatalogService(
      parseServicesFromText(extracted.requerimientos_evento ?? "")
    );
    const fromMsg = preferPrimaryCatalogService(parseServicesFromText(currentMessage ?? ""));
    const primary =
      (fromCrm && !isVagueFoodLabel(fromCrm) ? fromCrm : null) ||
      (fromMsg && !isVagueFoodLabel(fromMsg) ? fromMsg : null) ||
      preferPrimaryCatalogService(servicesFromTurn) ||
      (/\bantojitos?|puestos?\b/i.test(currentMessage ?? "") ? "Puestos de Comida" : null) ||
      fromCrm;
    if (primary) {
      extracted.requerimientos_evento = primary;
      filledSet.add("Requerimientos o servicios");
    }
  }
  const furnitureSkuTurn =
    parseFurnitureCatalogSkuFromText(currentMessage ?? "") ||
    parseSalaProductFromText(currentMessage ?? "");
  if (furnitureSkuTurn) {
    extracted.requerimientos_evento = mergeServiceRequirements(
      extracted.requerimientos_evento,
      furnitureSkuTurn,
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
      (currentMessage && (clientMentionsPistaTarima(currentMessage) || mentionsNoListedPriceService(currentMessage))
        ? currentMessage.trim().slice(0, 80)
        : null);
    if (mentioned || (currentMessage && isServiceRelatedMessage(currentMessage)) || isValidRequerimientosValue(extracted.requerimientos_evento)) {
      filledSet.add("Requerimientos o servicios");
      if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
        extracted.requerimientos_evento = mentioned || "servicios solicitados";
      }
    }
  }

  const pendingBeforeClose = getNextPendingField(extracted, filledSet);
  const trulyReadyForClosing = readyForClosing && !pendingBeforeClose;

  const lastAssistantForCatalogGate = [...presHistory]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  const recentCatalogOffer =
    [...presHistory]
      .reverse()
      .filter((m) => m.role === "assistant" && typeof m.content === "string")
      .slice(0, 4)
      .map((m) => m.content as string)
      .find((t) => assistantOfferedCatalogDetail(t)) ?? null;
  // A14994 / todas las ramas: aceptar catálogo gana al cierre temprano.
  const clientWantsCatalogNow =
    clientAsksForCatalog(currentMessage) ||
    clientAffirmsCatalogOffer(
      currentMessage,
      lastAssistantForCatalogGate && typeof lastAssistantForCatalogGate.content === "string"
        ? (lastAssistantForCatalogGate.content as string)
        : null
    ) ||
    clientAffirmsCatalogOffer(currentMessage, recentCatalogOffer);

  if (
    trulyReadyForClosing &&
    !cierreYaEnviado &&
    !requerimientosNeedsFollowUp(extracted, filledSet) &&
    !clientWantsCatalogNow
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
    !extractImageClientReply(currentMessage) &&
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
    clientAsksPaymentOrQuoteDelivery(currentMessage)
  ) {
    // A15016: "manda el presupuesto y dónde el 50% de anticipo" — no reabrir correo.
    if (!extracted.correo?.trim()) {
      const recovered = parseCorreoFromText(
        collectUserTexts(presHistory, currentMessage).join("\n")
      );
      if (recovered) {
        extracted.correo = recovered;
        filledSet.add("Correo electrónico");
      }
    } else {
      filledSet.add("Correo electrónico");
    }
    mensaje = buildPostCierrePaymentHandoffReply(extracted.nombre);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: A15016 — post-cierre pago/anticipo → equipo");
  } else if (clientAsksForHumanAdvisor(currentMessage)) {
    // A15000 Itzel: "prefiero hablar con un asesor" — handoff, no seguir embudo.
    mensaje = buildHumanAdvisorHandoffAnswer(extracted.nombre);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: A15000 — cliente pidió asesor humano (handoff)");
  } else if (
    cierreYaEnviado &&
    !clientDeclinesMoreServices(currentMessage) &&
    !clientSaysThanks(currentMessage) &&
    isServicePreferenceRefinement(
      currentMessage,
      extracted.requerimientos_evento
    )
  ) {
    // A14970: "solo requieren americano, capuchino y té" — anotar preferencia, no Banquete.
    const label =
      preferPrimaryCatalogService(parseServicesFromText(extracted.requerimientos_evento ?? "")) ||
      preferPrimaryCatalogService(parseServicesFromText(currentMessage ?? "")) ||
      "tu cotización";
    const snippet = (currentMessage ?? "").trim().replace(/\s+/g, " ").slice(0, 180);
    const merged = mergeServiceRequirements(
      extracted.requerimientos_evento,
      `preferencia: ${snippet}`,
      8
    );
    if (merged) extracted.requerimientos_evento = merged;
    filledSet.add("Requerimientos o servicios");
    const nombre = getDisplayName(extracted, whatsappDisplayName);
    mensaje = nombre
      ? `Perfecto, ${nombre}. Anoto esa preferencia para *${label}* y se la paso al equipo. ¿Algo más que quieras agregar?`
      : `Perfecto. Anoto esa preferencia para *${label}* y se la paso al equipo. ¿Algo más que quieras agregar?`;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: post-cierre — preferencia de servicio (ack corto)");
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
    // A15165: post-cierre con PREGUNTA de info/catálogo/modelos/shows → NO ack corto.
    // Dejar caer a ramas de entretenimiento / mobiliario / recomendaciones / servicio.
    cierreYaEnviado &&
    !clientDeclinesMoreServices(currentMessage) &&
    !clientSaysThanks(currentMessage) &&
    isServiceRelatedMessage(currentMessage) &&
    currentMessage?.trim() &&
    !clientAsksServiceInfo(currentMessage) &&
    !clientMentionsEntertainment(currentMessage) &&
    !clientAsksForCatalog(currentMessage) &&
    !clientAsksForRecommendations(currentMessage) &&
    !clientAsksInclusion(currentMessage) &&
    !clientAsksPrice(currentMessage) &&
    !/\b(modelos?|cat[aá]logo|sillas?|mesas?|mobiliario|mobilairio|banquetes?)\b/i.test(
      currentMessage ?? ""
    )
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
    ) ||
    // A14994: CTA de catálogo en hilo reciente, PERO no si el último msg fue
    // filler de embudo / "siguiente dato" (A15297 Edna — "Sí" ≠ catálogo).
    (() => {
      const lastTxt =
        lastAssistantMsg && typeof lastAssistantMsg.content === "string"
          ? (lastAssistantMsg.content as string)
          : "";
      if (assistantAskedVagueEmbudoContinue(lastTxt)) return false;
      if (
        /quieres que te d[eé] detalles de alguno/i.test(lastTxt) &&
        !assistantOfferedCatalogDetail(lastTxt)
      ) {
        return false;
      }
      // Si el último turno ya pide un campo del embudo, "Sí" no es catálogo.
      if (inferLucyAskedField(lastTxt)) return false;
      const recentOffer =
        [...presHistory]
          .reverse()
          .filter((m) => m.role === "assistant" && typeof m.content === "string")
          .slice(0, 3)
          .map((m) => m.content as string)
          .find((t) => assistantOfferedCatalogDetail(t)) ?? null;
      return clientAffirmsCatalogOffer(currentMessage, recentOffer);
    })()
  ) {
    const wantFull =
      clientWantsFullCatalog(currentMessage) ||
      clientAsksGenericMenuCatalog(currentMessage);
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
    const serviceHint = hintParts.join(" ") || null;
    // A15169: servicios SOLO del texto del cliente (no CRM/LLM inventado).
    // "catálogo de menú" sin SKU → hub general, nunca Barra de pizzas.
    const userNamedServices = parseServicesFromText(historyHint);
    const mappedServices = wantFull
      ? []
      : collectServicesForCatalogOffer({
          services: userNamedServices,
          // No usar extracted.requerimientos si el usuario no nombró servicio:
          // el extractor a veces alucina un SKU (A15169 → pizzas).
          extracted:
            userNamedServices.length > 0
              ? extracted
              : { requerimientos_evento: null },
          history: presHistory,
          currentMessage,
        });
    if (!wantFull && mappedServices.length > 0) {
      const mapped = buildPackageCatalogOfferBlock(
        mappedServices,
        `${serviceHint ?? ""} ${historyHint}`
      ).replace(
        /\n*¿Quieres que te mande el catálogo con más detalle\??\s*/gi,
        "\n"
      );
      mensaje = /bodasesor\.com\/catalogos/i.test(mapped)
        ? `Claro.\n\n${mapped}`.trim()
        : buildCatalogWebLinkReply({
            query: historyHint || (currentMessage ?? ""),
            wantFull: false,
            serviceHint,
          });
    } else {
      mensaje = buildCatalogWebLinkReply({
        query: "catálogo general",
        wantFull: true,
        serviceHint: null,
      });
    }
    appliedDirectReply = true;
    log?.info({ entityId, wantFull, mapped: mappedServices.length }, "GUARD: cliente pidió/afirmó catálogo — link(s)");
  } else if (
    !cierreYaEnviado &&
    currentMessage &&
    !extractImageClientReply(currentMessage) &&
    /\b(de\s+)?(tres|3|cuatro|4)\s*tiempos\b/i.test(
      clientCaptionForServiceParse(currentMessage) || currentMessage
    ) &&
    // A14995: paquete multi-servicio (banquete+barra+dulces+mobiliario) NO es solo "tiempos".
    servicesFromCurrentMessage.length < 2 &&
    parseServicesFromText(clientCaptionForServiceParse(currentMessage) || currentMessage)
      .length < 2 &&
    !isCatalogLevelSelection(
      clientCaptionForServiceParse(currentMessage) || currentMessage,
      lastAssistantMsg && typeof lastAssistantMsg.content === "string"
        ? (lastAssistantMsg.content as string)
        : null
    )
  ) {
    // A14947: "De tres tiempos" = variante de banquete, no nivel Básica/Premium.
    const label = resolveDetailQueryForFamily(
      "banquete",
      currentMessage ?? ""
    );
    filledSet.add("Requerimientos o servicios");
    const merged = mergeServiceRequirements(extracted.requerimientos_evento, label, 6);
    if (merged) extracted.requerimientos_evento = merged;
    const detail =
      buildCatalogPriceAnswer(label) ||
      buildCatalogServiceDetailAnswer(label) ||
      resolveCatalogInclusionReply(label, label);
    const link = buildCatalogWebLinkReply({ query: label, serviceHint: label });
    const display = getDisplayName(extracted, whatsappDisplayName);
    const ack = display ? `Perfecto, ${display}.` : "Perfecto.";
    // Evitar URL duplicada si el detalle Sheet ya trae el mismo catálogo.
    const detailHasLink = /bodasesor\.com\/catalogos/i.test(detail ?? "");
    mensaje = detail
      ? detailHasLink
        ? `${ack} Anoto *${label}*.\n\n${detail}\n\n${SERVICE_NIVEL_DETAIL_CTA}`
        : `${ack} Anoto *${label}*.\n\n${detail}\n\n${link}\n\n${SERVICE_NIVEL_DETAIL_CTA}`
      : `${ack} Anoto *${label}*.\n\n${link}\n\n${SERVICE_NIVEL_DETAIL_CTA}`;
    appliedDirectReply = true;
    appliedSalesReply = true;
    log?.info({ entityId, label }, "GUARD: variante banquete por tiempos + detalle/link");
  } else if (
    isCatalogLevelSelection(
      currentMessage,
      lastAssistantMsg && typeof lastAssistantMsg.content === "string"
        ? (lastAssistantMsg.content as string)
        : null
    ) &&
    // V8.68: si acabamos de ofrecer menú de opciones, el nivel va a detalle+link.
    !(
      historyOfferedServiceOptionsMenu(presHistory) &&
      clientWantsServiceDetail(currentMessage, presHistory)
    )
  ) {
    // A14934/A14949: nivel Básica/Premium o paquete numerado "Coffee Break 5".
    const lastAsst =
      lastAssistantMsg && typeof lastAssistantMsg.content === "string"
        ? (lastAssistantMsg.content as string)
        : null;
    const nivel =
      extractCatalogNivelFromText(currentMessage, lastAsst) ??
      currentMessage!.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    const emailNow = filterClientEmail(parseCorreoFromText(currentMessage ?? ""));
    if (emailNow && looksLikeValidClientEmail(emailNow)) {
      filledSet.add("Correo electrónico");
      extracted.correo = emailNow;
    }
    // A14949: el dígito del paquete NUNCA es invitados.
    const nivelDigit = String(nivel).match(/(?:coffee\s*break\s*)?([1-9])$/i)?.[1];
    if (
      nivelDigit &&
      extracted.num_invitados === parseInt(nivelDigit, 10)
    ) {
      extracted.num_invitados = null;
      filledSet.delete("Número de invitados");
    }
    sanitizeExtractedAmbiguousNumbers(extracted, currentMessage, {
      lastAskedField: lastAskedField ?? undefined,
    });

    // A15212: anclar al SKU primario del CRM (Puestos), nunca a "servicio completo" suelto
    // ni a la lista multi-servicio completa → evita dump de Taquiza $750.
    const crmPrimary =
      preferPrimaryCatalogService(
        parseServicesFromText(extracted.requerimientos_evento ?? "")
      ) || null;
    const mentioned = findMentionedService(currentMessage ?? "");
    const svcNow =
      crmPrimary ||
      mentioned ||
      (/coffee|coffe/i.test(String(nivel)) ? "Coffee Break" : null);
    if (svcNow || /coffee\s*break\s*[1-9]/i.test(String(nivel))) {
      filledSet.add("Requerimientos o servicios");
      // "Coffee Break 5" ya es el SKU completo; no anidar "(nivel Coffee Break 5)".
      const withNivel = /coffee\s*break\s*[1-9]/i.test(String(nivel))
        ? String(nivel)
        : `${svcNow} (nivel ${nivel})`;
      const merged = mergeServiceRequirements(extracted.requerimientos_evento, withNivel, 6);
      if (merged) extracted.requerimientos_evento = merged;
    }
    const display = getDisplayName(extracted, whatsappDisplayName);
    const pending = getNextPendingField(extracted, filledSet);
    const nextQ =
      pending && pending !== "requerimientos"
        ? buildNaturalQuestion(pending, { ...ctx, filledSet })
        : null;
    const ackParts = [
      display ? `Perfecto, ${display}.` : "Perfecto.",
      `Anoto *${nivel}*${svcNow && !/coffee\s*break\s*[1-9]/i.test(String(nivel)) ? ` para ${svcNow}` : ""}${
        emailNow && looksLikeValidClientEmail(emailNow) ? " y tu correo" : ""
      }.`,
    ];
    // Preferir detalle del nivel elegido (A14975) + links servicio/general; no re-listar.
    const hint = svcNow || extracted.requerimientos_evento || "barra";
    const nivelLabel =
      catalogNivelLabelFromText(currentMessage) ||
      catalogNivelLabelFromText(String(nivel)) ||
      String(nivel);
    const detailQuery = /coffee\s*break\s*[1-9]/i.test(String(nivel))
      ? String(nivel)
      : svcNow
        ? withCatalogNivelQuery(String(svcNow).replace(/\s*\(nivel[^)]*\)/gi, "").trim(), nivelLabel)
        : null;
    const levelDetail = detailQuery
      ? buildCatalogServiceDetailAnswer(detailQuery) ||
        buildCatalogPriceAnswer(detailQuery)
      : null;
    if (levelDetail && /\$\s*\d|incluye/i.test(levelDetail)) {
      const body = withServiceAndGeneralCatalogLinks(
        levelDetail,
        detailQuery || hint,
        hint
      );
      mensaje = `${ackParts.join(" ")}\n\n${body}${nextQ ? `\n\n${nextQ}` : ""}`.trim();
    } else {
      mensaje = `${ackParts.join(" ")}${nextQ ? ` ${nextQ}` : ""}`.trim();
    }
    appliedDirectReply = true;
    appliedSalesReply = true;
    log?.info({ entityId, nivel, hasEmail: !!emailNow }, "GUARD: selección de nivel de catálogo");
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
  } else if (
    !cierreYaEnviado &&
    lastAskedField === "nombre" &&
    looksLikeNameAnswerMessage(currentMessage) &&
    isFieldSatisfied("nombre", filledSet, extracted) &&
    // Solo sin servicio previo (form/lead). Si ya hay sushi/etc., deferredKnownServiceOffer.
    !isValidRequerimientosValue(extracted.requerimientos_evento)
  ) {
    // A14964 / V9.12: "¡Mucho gusto, Nombre!" + UNA pregunta (sin Perfecto+Mucho gusto).
    const display = getDisplayName(extracted, whatsappDisplayName);
    const firstName = display?.split(/\s+/)[0] ?? null;
    const pending = getNextPendingField(extracted, filledSet);
    const nameAck = firstName ? `¡Mucho gusto, ${firstName}!` : "¡Mucho gusto!";
    let nextQ = pending ? buildNaturalQuestion(pending, { ...ctx, filledSet }) : null;
    // Evitar "¡Mucho gusto! Mucho gusto, X. ¿correo…?"
    if (nextQ) {
      nextQ = nextQ.replace(/^¡?Mucho gusto,\s*[^!]{1,40}!\s*/i, "").replace(
        /^Mucho gusto,\s*[^.!]{1,40}[.!]\s*/i,
        ""
      );
    }
    mensaje = nextQ
      ? `${nameAck} ${nextQ}`.trim()
      : `${nameAck} ¿En qué te puedo ayudar para tu evento?`;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: nombre capturado — embudo sin catálogo/PDF");
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
  } else if (
    isFirstLucyReply(presHistory) &&
    !cierreYaEnviado &&
    currentMessage?.trim() &&
    (isServiceRelatedMessage(currentMessage) ||
      isValidRequerimientosValue(extracted.requerimientos_evento))
  ) {
    mensaje = buildFirstInteractionMessage(ctx, true);
    appliedDirectReply = true;
    if (messageHasSheetServiceDetail(mensaje) || isProgressiveOptionsMenuReply(mensaje)) {
      appliedSalesReply = true;
    }
    log?.info({ entityId }, "GUARD: V9.35 — primer turno con servicio → ack + embudo");
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
      `Claro, lo reviso con calma.\n\n${ack}\n\n${buildPackageCatalogOfferBlock(
        services,
        blob || (currentMessage ?? "")
      )}`,
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
    // A15000: RFQ multi-servicio ("opciones de alimentos + meseros + mobiliario")
    // NO se trata como pregunta puntual aunque diga "opciones"/"costo".
    !(clientAsksServiceInfo(currentMessage) && servicesFromCurrentMessage.length < 2) &&
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
    // A14987: RFQ de renta mobiliario (picnic/periqueras/bancos) → detalle concreto,
    // no solo "Anoto Mobiliario" + hub. Si hay alimentos/meseros u otros, NO monopolizar.
    if (
      isMobiliarioRentalPedido(currentMessage) &&
      !clientMentionsCarpas(currentMessage) &&
      parseMobiliarioRentItems(currentMessage ?? "").length >= 1 &&
      servicesFromCurrentMessage.filter((s) => !/mobiliario/i.test(s)).length === 0
    ) {
      if (
        extracted.direccion_evento &&
        (/^color\b/i.test(extracted.direccion_evento.trim()) ||
          isNonLocationBusinessPhrase(extracted.direccion_evento))
      ) {
        extracted.direccion_evento = null;
        filledSet.delete("Lugar/dirección del evento");
      }
      const items = parseMobiliarioRentItems(currentMessage ?? "");
      const itemLabel = items
        .map((i) => (i.qty ? `${i.qty} ${i.label}` : i.label))
        .join(", ");
      filledSet.add("Requerimientos o servicios");
      extracted.requerimientos_evento = `Mobiliario: ${itemLabel}`;
      if (detectModoServicio(currentMessage) === "pedido_entrega") {
        extracted.modo_servicio = "pedido_entrega";
      }
      const detail =
        buildMobiliarioRentDetailReply(currentMessage ?? "") ||
        buildRichBriefAcknowledgment(currentMessage ?? "");
      const catalog = buildPackageCatalogOfferBlock(
        ["Mobiliario"],
        currentMessage ?? ""
      );
      mensaje = mergeWithPendingQuestion(
        `${pickTransition(presHistory)} ${detail}\n\n${catalog}`,
        filledSet,
        extracted,
        ctx
      );
      appliedDirectReply = true;
      log?.info(
        { entityId, items: items.length },
        "GUARD: RFQ mobiliario — picnic/periqueras/bancos + catálogo + embudo"
      );
    } else {
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
    } // fin else: RFQ no-mobiliario
  } else if (
    // A15302: "¿Tienes barra italiana?" → pastas/pizzas (nunca dump Americana/Yucateca ni "la anoto").
    allowSalesReplyOverride &&
    !cierreYaEnviado &&
    currentMessage &&
    clientMentionsItalianTheme(currentMessage) &&
    (/\bbarra\b/i.test(currentMessage) ||
      clientAsksServiceInfo(currentMessage) ||
      /\b(tienes|tienen|cuentan|manejan|ofrecen)\b/i.test(currentMessage))
  ) {
    const italianReply = buildItalianFoodPitch(currentMessage);
    const merged = mergeServiceRequirements(
      extracted.requerimientos_evento,
      /\bbarra\b/i.test(currentMessage)
        ? "Barra de pastas y ensaladas, Barra de pizzas"
        : "Comida italiana (pastas/pizzas)",
      6
    );
    if (merged) {
      extracted.requerimientos_evento = merged;
      filledSet.add("Requerimientos o servicios");
    }
    if (!extracted.tipo_evento?.trim()) {
      const tipoIt = parseTipoEventoFromText(
        collectUserTexts(presHistory, currentMessage).join(" ")
      );
      if (tipoIt) {
        extracted.tipo_evento = tipoIt;
        filledSet.add("Tipo de evento");
      }
    }
    const italianBody =
      /^(¡?s[ií]|claro|perfecto)/i.test(italianReply.trim())
        ? italianReply
        : `${pickTransition(presHistory)} ${italianReply}`;
    mensaje = mergeWithPendingQuestion(italianBody, filledSet, extracted, ctx);
    appliedDirectReply = true;
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: A15302 — barra/temática italiana → pastas/pizzas");
  } else if (
    allowSalesReplyOverride &&
    (isVagueFoodTerm(currentMessage) || clientAsksForFoodMenu(currentMessage)) &&
    !clientDeclinesAnyService(currentMessage) &&
    !clientAsksForRecommendations(currentMessage) &&
    // A15212: si ya hay SKU concreto (Puestos/Banquete/…), no reabrir banquete/taquiza/brunch.
    !preferPrimaryCatalogService(
      parseServicesFromText(extracted.requerimientos_evento ?? "")
    )?.match(
      /Puestos|Banquete|Taquiza|Coffee|Barra de|Bocadillo|Canap|Parrillada|Paella|Desayuno|Mesa de/i
    )
  ) {
    // A15302: capturar tipo ("Mi cumpleaños") del mismo mensaje del menú.
    if (!extracted.tipo_evento?.trim() && currentMessage) {
      const tipoMenu = parseTipoEventoFromText(currentMessage);
      if (tipoMenu) {
        extracted.tipo_evento = tipoMenu;
        filledSet.add("Tipo de evento");
      }
    }
    mensaje = mergeWithPendingQuestion(
      buildVagueFoodOptionsReply(extracted, history, currentMessage, entityId),
      filledSet,
      extracted,
      ctx
    );
    appliedSalesReply = true;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: término vago de comida / menú — ofrecer opciones");
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
    !cierreYaEnviado &&
    (extracted.modo_servicio === "pedido_entrega" ||
      detectModoServicio(currentMessage) === "pedido_entrega")
  ) {
    // Pedido/entrega a domicilio: NUNCA cotizar como barra por persona / chefs en sitio.
    // Debe ir ANTES del primer turno con buildGuardServiceAck (barra/niveles).
    extracted.modo_servicio = "pedido_entrega";
    // A14987: "color blanco" nunca es ubicación.
    if (
      extracted.direccion_evento &&
      (/^color\b/i.test(extracted.direccion_evento.trim()) ||
        isNonLocationBusinessPhrase(extracted.direccion_evento))
    ) {
      extracted.direccion_evento = null;
      filledSet.delete("Lugar/dirección del evento");
    }
    if (isMobiliarioRentalPedido(currentMessage) && !clientMentionsCarpas(currentMessage)) {
      // Renta picnic/periqueras/bancos: ack concreto + catálogo + embudo (no plantilla sushi).
      // A14994: si también hay carpas, cae a buildCarpasSalesReply (ambas).
      const items = parseMobiliarioRentItems(currentMessage ?? "");
      const itemLabel = items.length
        ? items
            .map((i) => (i.qty ? `${i.qty} ${i.label}` : i.label))
            .join(", ")
        : "mobiliario";
      filledSet.add("Requerimientos o servicios");
      extracted.requerimientos_evento = `Mobiliario: ${itemLabel} (entrega/recolección)`;
      const detail =
        buildMobiliarioRentDetailReply(currentMessage ?? "") ||
        buildPedidoEntregaReply(currentMessage);
      const catalog = buildPackageCatalogOfferBlock(
        ["Mobiliario"],
        currentMessage ?? ""
      );
      mensaje = mergeWithPendingQuestion(
        `${pickTransition(presHistory)} ${detail}\n\n${catalog}`,
        filledSet,
        extracted,
        ctx
      );
      appliedDirectReply = true;
      log?.info({ entityId }, "GUARD: mobiliario entrega/recolección — ack + catálogo + embudo");
    } else {
    if (/\bsushi|pizza|poke|rollos?\b/i.test(currentMessage ?? "")) {
      filledSet.add("Requerimientos o servicios");
      const label = /\bsushi\b/i.test(currentMessage ?? "")
        ? "pedido sushi (entrega)"
        : /\bpizzas?\b/i.test(currentMessage ?? "")
          ? "pedido pizza (entrega)"
          : "pedido/entrega";
      const merged = mergeServiceRequirements(extracted.requerimientos_evento, label, 6);
      if (merged) extracted.requerimientos_evento = merged;
    }
    const pedidoBody = buildPedidoEntregaReply(currentMessage);
    const isOpening =
      (forceFirstPresentation || isFirstLucyReply(presHistory)) &&
      !conversationAlreadyStarted(filledSet, presHistory);
    const pedidoReply =
      isOpening && !/hola,?\s*soy\s+lucy/i.test(pedidoBody)
        ? `${LUCY_INTRO} ${pedidoBody}`
        : pedidoBody;
    // buildPedidoEntregaReply pide nombre solo si faltaba; si ya hay datos, avanzar embudo.
    mensaje = isFieldSatisfied("nombre", filledSet, extracted)
      ? mergeWithPendingQuestion(pedidoReply, filledSet, extracted, ctx)
      : pedidoReply;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: modo pedido/entrega — sin barra pp");
    }
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
    !isRichQuoteBrief(currentMessage) &&
    inferLucyAskedField(
      [...presHistory]
        .reverse()
        .find((m) => m.role === "assistant" && typeof m.content === "string")
        ?.content as string | undefined
    ) !== "correo" &&
    !detectEmailRefusal([currentMessage])
  ) {
    if (!filledSet.has("Presupuesto (MXN)")) {
      applyPresupuestoWaiver(
        filledSet,
        [],
        collectUserTexts(presHistory, currentMessage),
        presHistory
      );
    }
    // A14964: no re-pedir correo si ya está en el historial (p. ej. waiver de presupuesto).
    if (!isEmailSatisfied(filledSet, extracted)) {
      const correoHist = collectUserTexts(presHistory, currentMessage)
        .map((t) => filterClientEmail(parseCorreoFromText(t)))
        .find(Boolean);
      if (correoHist) {
        extracted.correo = correoHist;
        filledSet.add("Correo electrónico");
      }
    }
    const pending = getNextPendingField(extracted, filledSet);
    const wantsPropuesta = /\bpropuesta\b/i.test(currentMessage ?? "");
    if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      // A15298: "una propuesta" con embudo completo → cierre limpio (sin re-pedir presupuesto).
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
    } else if (pending) {
      mensaje = wantsPropuesta
        ? `¡Claro! Nuestro equipo te arma la propuesta. ${buildNaturalQuestion(pending, ctx)}`
        : `Sin problema, lo dejamos por definir. ${buildNaturalQuestion(pending, ctx)}`;
    } else {
      mensaje = wantsPropuesta
        ? "¡Claro! Le paso todos los detalles a nuestro equipo para que te armen la propuesta y te la envíen. Si necesitas algo más, aquí sigo."
        : "Sin problema, lo dejamos por definir. Nuestro equipo te propone opciones según lo que platicamos.";
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
    const svc =
      parsePrimaryService(currentMessage ?? "") ||
      findMentionedService(currentMessage ?? "") ||
      currentMessage ||
      "";
    const sheet =
      attachAvailableSheetDetail(svc, svc) ||
      (messageHasSheetServiceDetail(buildGuardServiceAck(currentMessage ?? ""))
        ? buildGuardServiceAck(currentMessage ?? "")
        : null);
    mensaje = sheet
      ? `${LUCY_INTRO}\n\n${sheet}\n\n${pickVariant("nombre", presHistory, entityId)}`
      : `${LUCY_INTRO} ${buildGuardServiceAck(currentMessage ?? "")} ${pickVariant("nombre", presHistory, entityId)}`;
    appliedDirectReply = true;
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: servicio consultivo en primer turno + detalle Sheet");
  } else if (
    (forceFirstPresentation || isFirstLucyReply(presHistory)) &&
    !conversationAlreadyStarted(filledSet, presHistory) &&
    !isFieldSatisfied("nombre", filledSet, extracted)
  ) {
    mensaje = buildFirstInteractionMessage(ctx, true);
    appliedDirectReply = true;
    if (messageHasSheetServiceDetail(mensaje)) appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: primer mensaje — presentación Lucy + nombre (+ detalle si hay servicio)");
  } else if (
    // A14933: precio ANTES de upsell mantelería / detalle mobiliario genérico.
    !cierreYaEnviado &&
    currentMessage && clientAsksPrice(currentMessage) &&
    mentionsNoListedPriceService(currentMessage ?? "")
  ) {
    const priceReply =
      buildConsultativeNoPriceReply(currentMessage ?? "") ||
      buildAlejandroPriceReply(
        findMentionedService(currentMessage ?? "") || "mobiliario",
        currentMessage ?? ""
      );
    const pending = getNextPendingField(extracted, filledSet);
    const nextQ =
      pending && pending !== "requerimientos" && !isFieldSatisfied("nombre", filledSet, extracted)
        ? buildNaturalQuestion("nombre", ctx)
        : pending && pending !== "requerimientos"
          ? buildNaturalQuestion(pending, ctx)
          : null;
    mensaje = nextQ ? `${priceReply}\n\n${nextQ}` : priceReply;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: pregunta de precio mobiliario/periqueras — respuesta consultiva");
  } else if (
    (justAnsweredReq || looksLikeMinimalServiceAsk(currentMessage)) &&
    !cierreYaEnviado &&
    isFieldSatisfied("nombre", filledSet, extracted) &&
    !clientMentionsEntertainment(currentMessage) &&
    !clientMentionsCarpas(currentMessage) &&
    !clientAsksPrice(currentMessage) &&
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
    !clientAsksPrice(currentMessage) &&
    !clientMentionsCarpas(currentMessage) &&
    buildMobiliarioRentDetailReply(currentMessage ?? "") &&
    needsModoServicioClarification(currentMessage, extracted.modo_servicio ?? null)
  ) {
    // A14987: limpiar "color blanco" mal capturado como zona.
    if (
      extracted.direccion_evento &&
      (/^color\b/i.test(extracted.direccion_evento.trim()) ||
        isNonLocationBusinessPhrase(extracted.direccion_evento))
    ) {
      extracted.direccion_evento = null;
      filledSet.delete("Lugar/dirección del evento");
    }
    mensaje = `${buildMobiliarioRentDetailReply(currentMessage ?? "")}\n\n${buildModoServicioClarificationQuestion()}`;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: mobiliario — detalle técnico + aclarar montado/entrega");
  } else if (
    !cierreYaEnviado &&
    !clientAsksPrice(currentMessage) &&
    !clientMentionsCarpas(currentMessage) &&
    // A15000: no detalle solo-mobiliario si el mensaje pide alimentos/meseros u otros.
    servicesFromCurrentMessage.filter((s) => !/mobiliario/i.test(s)).length === 0 &&
    parseServicesFromText(currentMessage ?? "").filter((s) => !/mobiliario/i.test(s)).length ===
      0 &&
    buildMobiliarioRentDetailReply(currentMessage ?? "") &&
    !needsModoServicioClarification(currentMessage, extracted.modo_servicio ?? null)
  ) {
    if (
      extracted.direccion_evento &&
      (/^color\b/i.test(extracted.direccion_evento.trim()) ||
        isNonLocationBusinessPhrase(extracted.direccion_evento))
    ) {
      extracted.direccion_evento = null;
      filledSet.delete("Lugar/dirección del evento");
    }
    const detail = buildMobiliarioRentDetailReply(currentMessage ?? "")!;
    const items = parseMobiliarioRentItems(currentMessage ?? "");
    filledSet.add("Requerimientos o servicios");
    if (items.length) {
      const itemLabel = items
        .map((i) => (i.qty ? `${i.qty} ${i.label}` : i.label))
        .join(", ");
      extracted.requerimientos_evento = `Mobiliario: ${itemLabel}`;
    } else if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
      extracted.requerimientos_evento = "Mobiliario";
    }
    // Con ítems concretos → links; si solo "mobiliario", CTA detalle (no hub que bloquea embudo).
    const catalog = items.length
      ? buildPackageCatalogOfferBlock(["Mobiliario"], currentMessage ?? "")
      : [
          "Catálogo de *salas y periqueras*:",
          toDeliverableCatalogUrl(
            getCatalogWebUrlForQuery("periqueras") ||
              "https://bodasesor.com/catalogos/salas-y-periqueras"
          ),
          "",
          SERVICE_NIVEL_DETAIL_CTA,
        ].join("\n");
    mensaje = mergeWithPendingQuestion(
      `${pickTransition(presHistory)} ${detail}\n\n${catalog}`,
      filledSet,
      extracted,
      ctx
    );
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: mobiliario — detalle técnico + catálogo + embudo");
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
    appliedDirectReply = true;
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
      mensaje = applyEmailCaptureTone(eventOffer, emailCtx);
    } else if (shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage)) {
      mensaje = applyEmailCaptureTone(
        mergeWithPendingQuestion(aiResponse, filledSet, extracted, emailCtx),
        emailCtx
      );
    } else {
      const pending = getNextPendingField(extracted, filledSet);
      const nextQ = pending
        ? buildNaturalQuestion(pending, emailCtx)
        : null;
      mensaje = applyEmailCaptureTone(nextQ ?? aiResponse, emailCtx);
    }
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: correo capturado — siguiente dato tras agradecer");
  } else if (emailRefusedThisTurn && !extracted.correo?.trim()) {
    mensaje = emailRefusalAckMessage(extracted, history, currentMessage, entityId, filledSet);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: cliente no quiere dar correo — se continúa el flujo");
  } else if (clientSignalsUrgency(currentMessage) && !clientAsksPhone(currentMessage)) {
    const pending = getNextPendingField(extracted, filledSet);
    const nextQ = pending ? buildNaturalQuestion(pending, ctx) : null;
    const fechaHint = extracted.fecha_horario?.trim()
      ? ` Para el *${extracted.fecha_horario.trim()}* confirmamos disponibilidad en cuanto tengamos el resto de datos.`
      : " Confirmamos disponibilidad en cuanto tengamos el resto de datos.";
    mensaje = [
      pickTransition(presHistory),
      `Entendido, lo vemos con prioridad.${fechaHint}`,
      nextQ,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: V9.36 — urgencia, mantiene el chat vivo");
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
    // A15003: decline de extras con Photo Booth / entretenimiento ya en el hilo.
    clientDeclinesMoreServices(currentMessage) &&
    (/\b(photo\s*booths?|photobooths?|cabina(s)?\s+de\s+fotos?)\b/i.test(
      `${collectUserTexts(presHistory, currentMessage).join(" ")} ${extracted.requerimientos_evento ?? ""}`
    ) ||
      clientMentionsEntertainment(
        `${collectUserTexts(presHistory, currentMessage).join(" ")} ${extracted.requerimientos_evento ?? ""}`
      ))
  ) {
    const blob = `${collectUserTexts(presHistory, currentMessage).join(" ")} ${extracted.requerimientos_evento ?? ""}`;
    const photoBoothInThread =
      /\b(photo\s*booths?|photobooths?|cabina(s)?\s+de\s+fotos?|cabina(s)?\s+fotogr[aá]ficas?|espejo\s+m[aá]gico|mirror\s+booth)\b/i.test(
        blob
      );
    filledSet.add("Requerimientos o servicios");
    if (photoBoothInThread) {
      const merged = mergeServiceRequirements(extracted.requerimientos_evento, "Photo Booth", 6);
      if (merged) extracted.requerimientos_evento = merged;
    }
    const pending = getNextPendingField(extracted, filledSet);
    const nextQ =
      pending && pending !== "requerimientos"
        ? buildNaturalQuestion(pending, ctx)
        : null;
    const label = photoBoothInThread
      ? "Photo Booth"
      : preferPrimaryCatalogService(parseServicesFromText(blob)) || "lo que ya elegiste";
    if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      mensaje = buildClosing(extracted.requerimientos_evento ?? label, extracted.nombre);
    } else {
      mensaje = nextQ
        ? `Entendido — nos quedamos solo con *${label}*.\n\n${nextQ}`
        : `Entendido — nos quedamos solo con *${label}*. El equipo arma la cotización con eso.`;
    }
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: A15003 — decline extras, solo entretenimiento elegido");
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
      clientMentionsLedRobotsOrBatucada(currentMessage) ||
      (justAnsweredReq &&
        (clientMentionsEntertainment(currentMessage) ||
          clientMentionsLedRobotsOrBatucada(currentMessage))) ||
      // Hilo ya habló de batucada/robots y el cliente insiste (A14962).
      (clientMentionsLedRobotsOrBatucada(
        collectUserTexts(presHistory, currentMessage).join(" ")
      ) &&
        /\b(robots?|leds?|batucada|solo\s+quiero|quiero)\b/i.test(currentMessage ?? "")) ||
      // A14988: "Revisar" tras CTA Nivel 1 + servicio de entretenimiento ya nombrado.
      (clientConfirmsOfferReview(currentMessage) &&
        lastAssistantMsg &&
        typeof lastAssistantMsg.content === "string" &&
        /revisar\s+primero|armar\s+un\s+paquete/i.test(lastAssistantMsg.content) &&
        (clientMentionsEntertainment(
          collectUserTexts(presHistory, currentMessage).join(" ")
        ) ||
          clientMentionsLedRobotsOrBatucada(
            collectUserTexts(presHistory, currentMessage).join(" ")
          ) ||
          /\bbailarinas?\b|\bdancers?\b|\bvedettes?\b/i.test(
            `${extracted.requerimientos_evento ?? ""} ${collectUserTexts(presHistory, currentMessage).join(" ")}`
          ))))
  ) {
    const userEntBlob = collectUserTexts(presHistory, currentMessage).join(" ");
    const photoBoothInThread =
      /\b(photo\s*booths?|photobooths?|cabina(s)?\s+de\s+fotos?|cabina(s)?\s+fotogr[aá]ficas?|espejo\s+m[aá]gico|mirror\s+booth)\b/i.test(
        `${userEntBlob} ${extracted.requerimientos_evento ?? ""}`
      );
    const entFocusMsg =
      clientMentionsEntertainment(currentMessage) ||
      clientMentionsLedRobotsOrBatucada(currentMessage)
        ? currentMessage
        : photoBoothInThread
          ? "Photo Booth"
          : /\bbailarinas?\b|\bdancers?\b|\bvedettes?\b/i.test(userEntBlob)
            ? "Bailarinas"
            : clientMentionsLedRobotsOrBatucada(userEntBlob)
              ? userEntBlob
              : clientMentionsEntertainment(userEntBlob)
                ? userEntBlob
                : currentMessage;
    // Siempre actualiza CRM vía plantilla; la redacción puede ser la de OpenAI (voz humana).
    const entTemplate = buildEntertainmentSalesReply(
      extracted,
      history,
      entityId,
      entFocusMsg,
      filledSet,
      ctx
    );
    if (
      shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage) &&
      aiLooksLikeEntertainmentReply(aiResponse, entFocusMsg) &&
      // A15165: si pide info/catálogo, exigir link o contexto útil en la IA.
      !(
        clientAsksServiceInfo(currentMessage) &&
        !/bodasesor\.com\/catalogos|cat[aá]logo|show en vivo|hora loca|performance/i.test(
          aiResponse
        )
      )
    ) {
      mensaje = mergeWithPendingQuestion(aiResponse, filledSet, extracted, ctx);
      appliedDirectReply = true;
      log?.info({ entityId }, "GUARD: show/entretenimiento — preferir redacción OpenAI");
    } else {
      mensaje = entTemplate;
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info({ entityId }, "GUARD: show/entretenimiento — orientación + catálogo");
    }
  } else if (
    allowSalesReplyOverride &&
    clientConfirmsOfferReview(currentMessage) &&
    lastAssistantMsg &&
    typeof lastAssistantMsg.content === "string" &&
    /revisar\s+primero|armar\s+un\s+paquete/i.test(lastAssistantMsg.content) &&
    hasMeaningfulRequerimientos(extracted, filledSet)
  ) {
    // A14988: "Revisar" con servicio ya capturado → embudo, no re-preguntar el CTA.
    const pending = getNextPendingField(extracted, filledSet);
    mensaje = pending
      ? `${pickTransition(presHistory)} Listo, seguimos con lo que elegiste.\n\n${buildNaturalQuestion(pending, ctx)}`
      : buildClosing(
          extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
          extracted.nombre
        );
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: A14988 — Revisar tras oferta → embudo (sin re-CTA)");
  } else if (
    allowSalesReplyOverride &&
    (clientMentionsCarpas(currentMessage) ||
      // A15016: "De 6 x20" tras ask de medidas de carpa.
      (!!parseSpaceDimensions(currentMessage ?? "") &&
        /carpa/i.test(
          `${extracted.requerimientos_evento ?? ""} ${collectUserTexts(presHistory, currentMessage).join(" ")}`
        ) &&
        /medidas/i.test(
          typeof lastAssistantMsg?.content === "string" ? lastAssistantMsg.content : ""
        ))) &&
    // A15286: no pisar respuesta a fotos/luz/capacidad con plantilla de medidas.
    !shouldSkipSalesMenuForConcreteQuestion(currentMessage)
  ) {
    const carpasTemplate = buildCarpasSalesReply(
      extracted,
      history,
      currentMessage,
      filledSet,
      ctx
    );
    if (
      shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage) &&
      aiLooksLikeCarpasReply(aiResponse) &&
      !/\b(Cathedral|Catedral|Pir[aá]mide|Planas?)\b/i.test(aiResponse)
    ) {
      mensaje = mergeWithPendingQuestion(aiResponse, filledSet, extracted, ctx);
      appliedDirectReply = true;
      log?.info({ entityId }, "GUARD: carpas — preferir redacción OpenAI");
    } else {
      mensaje = carpasTemplate;
      appliedSalesReply = true;
      log?.info({ entityId }, "GUARD: carpas — responder, agregar y pedir medidas");
    }
  } else if (
    allowSalesReplyOverride &&
    (clientMentionsPistaTarima(currentMessage) ||
      // A14967: tras menú de tipos, "La LED" / "pintada" sin repetir "pista".
      (parsePistaTarimaVariant(currentMessage) &&
        (/pista|tarima|estilo te late|opciones principales|vinil con logo|pintada a mano/i.test(
          typeof lastAssistantMsg?.content === "string" ? lastAssistantMsg.content : ""
        ) ||
          /pista|tarima/i.test(extracted.requerimientos_evento ?? ""))))
  ) {
    mensaje = buildPistaTarimaSalesReply(
      extracted,
      history,
      currentMessage,
      entityId,
      filledSet,
      ctx
    );
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: pista/tarima — menú o detalle según elección");
  } else if (
    // V8.92: tras menú formal vs casual → banquete Formal/Mexicano o catering casual.
    allowSalesReplyOverride &&
    !cierreYaEnviado &&
    historyOfferedAlimentosModoMenu(presHistory) &&
    currentMessage?.trim() &&
    (clientChoseBanqueteFormal(currentMessage) || clientChoseCateringCasual(currentMessage))
  ) {
    if (clientChoseBanqueteFormal(currentMessage)) {
      filledSet.add("Requerimientos o servicios");
      if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
        extracted.requerimientos_evento = "banquete";
      }
      mensaje = mergeWithPendingQuestion(
        `${pickTransition(presHistory)} ${buildProgressiveOptionsMenu("banquete")}`,
        filledSet,
        extracted,
        ctx
      );
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info({ entityId }, "GUARD: eligió banquete formal → menú Formal/Mexicano");
    } else {
      filledSet.add("Requerimientos o servicios");
      if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
        extracted.requerimientos_evento = "catering";
      }
      mensaje = mergeWithPendingQuestion(
        `${pickTransition(presHistory)} ${buildCateringCasualMenu()}`,
        filledSet,
        extracted,
        ctx
      );
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info({ entityId }, "GUARD: eligió catering casual → menú estaciones");
    }
  } else if (
    // V8.92 / A15165: menú de piezas mobiliario → modelos (también post-cierre).
    allowSalesReplyOverride &&
    !shouldSkipSalesMenuForConcreteQuestion(currentMessage) &&
    !clientAsksForCatalog(currentMessage) &&
    (historyOfferedMobiliarioPieceMenu(presHistory) ||
      /\b(modelos?\s+de\s+)?sillas?\b|\bmobiliario|mobilairio\b/i.test(currentMessage ?? "")) &&
    currentMessage?.trim() &&
    (parseMobiliarioPieceChoice(currentMessage) ||
      /\b(modelos?\s+de\s+)?sillas?\b/i.test(currentMessage ?? "") ||
      /\bmobiliario|mobilairio\b/i.test(currentMessage ?? ""))
  ) {
    const piece =
      parseMobiliarioPieceChoice(currentMessage) ||
      (/\bsillas?\b/i.test(currentMessage ?? "")
        ? "sillas"
        : /\bmesas?\b/i.test(currentMessage ?? "")
          ? "mesas"
          : "mobiliario");
    filledSet.add("Requerimientos o servicios");
    const merged = mergeServiceRequirements(
      extracted.requerimientos_evento,
      piece === "mobiliario" ? "Mobiliario" : `Mobiliario: ${piece}`,
      6
    );
    if (merged) extracted.requerimientos_evento = merged;
    const body =
      piece === "mobiliario"
        ? buildProgressiveOptionsMenu("mobiliario")
        : buildMobiliarioPieceFollowUp(piece);
    const catalogUrl =
      getCatalogWebUrlForQuery("mesas y sillas") ||
      getCatalogWebHubDeliveryUrl();
    const withLink =
      catalogUrl && !/bodasesor\.com\/catalogos/i.test(body)
        ? `${body}\n\nCatálogo de mesas y sillas:\n${catalogUrl}`
        : body;
    mensaje = mergeWithPendingQuestion(
      `${pickTransition(presHistory)} ${withLink}`,
      filledSet,
      extracted,
      ctx
    );
    appliedSalesReply = true;
    appliedDirectReply = true;
    log?.info({ entityId, piece }, "GUARD: mobiliario/sillas → menú de modelos + catálogo");
  } else if (
    allowSalesReplyOverride &&
    !cierreYaEnviado &&
    historyOfferedServiceOptionsMenu(presHistory) &&
    clientWantsServiceDetail(currentMessage, presHistory)
  ) {
    // V8.68: "formal" / "3 tiempos" / "sí" tras menú de opciones → detalle + link.
    const progressiveDetail = buildProgressiveDetailAfterMenu({
      extracted,
      history: presHistory,
      currentMessage,
      filledSet,
      serviceHint: extracted.requerimientos_evento,
    });
    if (progressiveDetail) {
      mensaje = progressiveDetail;
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info({ entityId }, "GUARD: detalle tras menú de opciones + link catálogo");
    } else {
      mensaje = `${pickTransition(presHistory)} ${SERVICE_NIVEL_DETAIL_CTA}`;
      appliedDirectReply = true;
    }
  } else if (clientAsksInclusion(currentMessage) && !cierreYaEnviado) {
    // A14982: "ofreces los paquetes" con 2+ servicios en CRM → niveles Sheet de ambos + embudo.
    const multiForPackages = dedupeServiceHierarchy([
      ...parseServicesFromText(extracted.requerimientos_evento ?? ""),
      ...parseServicesFromText(currentMessage ?? ""),
    ]);
    const asksPackagesList =
      /\bpaquetes?\b|\bniveles?\b|\bofreces?\b|idea\s+m[aá]s\s+clara/i.test(
        currentMessage ?? ""
      );
    const multiPackageDump =
      asksPackagesList && multiForPackages.length >= 2
        ? buildMultiServiceSheetLevelsReply(multiForPackages, currentMessage)
        : null;
    if (multiPackageDump) {
      mensaje = mergeWithPendingQuestion(
        `${pickTransition(presHistory)} Claro, te dejo los paquetes/niveles con precios:\n\n${multiPackageDump}`,
        filledSet,
        extracted,
        ctx
      );
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info(
        { entityId, n: multiForPackages.length },
        "GUARD: paquetes multi-servicio — niveles Sheet + siguiente dato"
      );
    } else {
    // Prioridad absoluta: describir paquetes (no depende de allowSalesReplyOverride).
    const userBlob = collectUserTexts(presHistory, currentMessage).join(" ");
    const req = extracted.requerimientos_evento?.trim() ?? "";
    // A14947: si el hilo es banquete/catering, NUNCA resolver a Betún/Cupcakes.
    // A15204: "catering/canapés" → Canapés (no forzar Banquete Formal ni mobiliario).
    let serviceHint: string | null = null;
    const foodBlob = `${req} ${userBlob} ${currentMessage ?? ""}`;
    if (/\bbanquete|\bcatering\b/i.test(foodBlob)) {
      const concreteFamily = detectProgressiveFamily(
        `${currentMessage ?? ""} ${userBlob}`
      );
      if (concreteFamily && concreteFamily !== "banquete") {
        serviceHint = resolveDetailQueryForFamily(concreteFamily, foodBlob);
      } else if (/\bcanap/i.test(foodBlob)) {
        serviceHint = "Canapés";
      } else {
        serviceHint = resolveDetailQueryForFamily("banquete", foodBlob);
      }
    } else {
      serviceHint =
        (isValidRequerimientosValue(req) ? req : null) ||
        parsePrimaryService(userBlob) ||
        findMentionedService(userBlob);
    }
    // A15251: "¿incluye bebidas?" → contestar del catálogo, NO re-ofrecer menú de niveles.
    const specificInclusion = buildSpecificInclusionItemReply(
      currentMessage ?? "",
      serviceHint
    );
    if (specificInclusion) {
      mensaje = mergeWithPendingQuestion(
        `${pickTransition(presHistory)} ${specificInclusion}`,
        filledSet,
        extracted,
        ctx
      );
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info(
        { entityId, item: clientAsksSpecificInclusionItem(currentMessage) },
        "GUARD: A15251 — inclusión puntual (bebidas/etc.) desde catálogo"
      );
    } else {
    // V8.68: "qué incluye banquete/coffee…" sin variante → menú, no dump PDF.
    const inclusionOptions = shouldOfferOptionsBeforeDetail({
      currentMessage,
      history: presHistory,
      serviceHint: extracted.requerimientos_evento,
    });
    if (inclusionOptions) {
      mensaje = `${pickTransition(presHistory)} ${inclusionOptions.menu}`.trim();
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info({ entityId }, "GUARD: inclusiones — menú de opciones antes del detalle");
    } else {
    const pdfOnly = (() => {
      const specificNivelAsk =
        /\bcoffee\s*break\s*\d|\b\d\s*tiempos?\b|\b(tradicional|premium|b[aá]sic[ao]?)\b/i.test(
          currentMessage ?? ""
        );
      return (
        buildPdfInclusionReply(currentMessage ?? "") ||
        (!specificNivelAsk && serviceHint
          ? buildPdfInclusionReply(`${serviceHint} ${currentMessage ?? ""}`) ||
            buildPdfInclusionReply(serviceHint)
          : null)
      );
    })();
    if (pdfOnly && !/bet[uú]n|cupcakes?/i.test(pdfOnly)) {
      mensaje = pdfOnly;
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info({ entityId, serviceHint }, "GUARD: inclusiones — PDF aprendido");
    } else {
    const inclusionAnswer = resolveCatalogInclusionReply(
      currentMessage ?? "",
      serviceHint
    );
    if (inclusionAnswer && !/bet[uú]n|cupcakes?/i.test(inclusionAnswer)) {
      const pending = getNextPendingField(extracted, filledSet);
      // Tras describir paquetes, puede seguir el embudo (zona), pero NUNCA borrar el detalle.
      mensaje =
        pending && needsNextStep && !trulyReadyForClosing
          ? `${inclusionAnswer}\n\n${buildNaturalQuestion(pending, ctx)}`
          : inclusionAnswer;
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info({ entityId, serviceHint }, "GUARD: inclusiones/descripciones de paquete (temprano)");
    } else if (serviceHint && /\bbanquete/i.test(serviceHint)) {
      const detail =
        buildCatalogPriceAnswer(serviceHint) ||
        buildCatalogServiceDetailAnswer(serviceHint);
      const link = buildCatalogWebLinkReply({ query: serviceHint, serviceHint });
      mensaje = detail
        ? `${detail}\n\n${link}\n\n¿Cuál nivel te late?`
        : `${link}\n\n¿Cuál nivel te late?`;
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info({ entityId, serviceHint }, "GUARD: inclusiones banquete — Sheet + link forzado");
    } else {
      // A14943: "Quiero ver los paquetes" sin SKU — mostrar overview, no saltar a zona.
      const packageOverview = buildGenericPackagesOverviewReply(extracted, presHistory, currentMessage);
      mensaje = packageOverview;
      appliedSalesReply = true;
      appliedDirectReply = true;
      log?.info({ entityId }, "GUARD: paquetes genéricos — overview / aclarar servicio");
    }
    } // fin else: pdf/inclusiones Sheet
    } // fin else: menú progresivo de inclusiones
    } // fin else: no era inclusión puntual (bebidas/etc.)
    } // fin else: no multi-paquete Sheet dump
  } else if (
    allowSalesReplyOverride &&
    clientAsksServiceInfo(currentMessage) &&
    isServiceRelatedMessage(currentMessage) &&
    !clientAsksPrice(currentMessage) &&
    !cierreYaEnviado
  ) {
    // Preferir oferta con niveles + pregunta de catálogo (como food-sales),
    // no solo un ack corto que salta al embudo.
    // Precio SKU → rama clientAsksPrice (buildCatalogPriceAnswer), no detalle sin $.
    const cateringAnswer = buildFoodSalesReply(
      extracted,
      history,
      entityId,
      currentMessage,
      filledSet,
      ctx
    );
    if (
      cateringAnswer &&
      /nivel|precio|manejamos|tenemos|info m[aá]s detallada|opciones|cat[aá]logo|\$/i.test(
        cateringAnswer
      )
    ) {
      const pending = getNextPendingField(extracted, filledSet);
      const asksMeasures = /medidas?/i.test(cateringAnswer);
      const isProgressive =
        isProgressiveOptionsMenuReply(cateringAnswer) ||
        /info m[aá]s detallada|de cu[aá]l te|qu[eé]\s+pieza/i.test(cateringAnswer);
      // V8.93: si no es menú progresivo y OpenAI ya respondió bien, preferir voz humana.
      if (
        !isProgressive &&
        !asksMeasures &&
        shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage) &&
        aiResponse.trim().length >= 50
      ) {
        mensaje = mergeWithPendingQuestion(aiResponse, filledSet, extracted, ctx);
      } else if (
        isProgressive ||
        asksMeasures ||
        !pending ||
        pending === "requerimientos" ||
        pending === "correo" ||
        !ctx
      ) {
        mensaje = cateringAnswer;
      } else {
        const nextQ = buildNaturalQuestion(pending, ctx);
        mensaje = cateringAnswer.includes(nextQ)
          ? cateringAnswer
          : `${cateringAnswer}\n\n${nextQ}`;
      }
      appliedSalesReply = true;
      if (!isProgressiveOptionsMenuReply(mensaje)) {
        appliedDirectReply = true;
      }
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
    // V8.35: si pide info/detalle, reexplicar aunque el servicio ya esté capturado.
    (!serviceAlreadyCaptured ||
      clientAsksServiceInfo(currentMessage) ||
      clientAsksInclusion(currentMessage)) &&
    !clientAsksPrice(currentMessage) &&
    (clientMentionsCatering(currentMessage) ||
      clientAsksServiceInfo(currentMessage) ||
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
      // Menús progresivos y detalle Sheet: plantilla gana (conocimiento validado).
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
    if (
      !isProgressiveOptionsMenuReply(mensaje) &&
      bodyEqualsLastAssistant(mensaje, history, extracted.nombre)
    ) {
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
      const genericPriceAsk =
        clientAsksPrice(currentMessage) &&
        !mentionsListedPriceService(currentMessage ?? "") &&
        !mentionsNoListedPriceService(currentMessage ?? "") &&
        !findMentionedService(currentMessage ?? "") &&
        !parsePrimaryService(currentMessage ?? "");

      const needsAlejandroQuote =
        !genericPriceAsk &&
        (mentionsNoListedPriceService(currentMessage ?? "") ||
          (responseHasInventedPrice(aiResponse, currentMessage ?? "", ctxText) &&
            !mentionsListedPriceService(currentMessage ?? "")));

      if (genericPriceAsk) {
        const clarify = buildGenericPriceClarifyReply(extracted, presHistory, currentMessage ?? "");
        mensaje = needsNextStep
          ? mergeWithPendingQuestion(clarify, filledSet, extracted, ctx)
          : clarify;
        appliedDirectReply = true;
        log?.info({ entityId }, "GUARD: precios genéricos — aclarar servicio");
      } else if (needsAlejandroQuote) {
        const priceReply = buildAlejandroPriceReply(getPriceServiceLabel(currentMessage ?? ""), currentMessage ?? "");
        mensaje =
          needsNextStep && pending && pending !== "correo"
            ? `${priceReply}\n\n${buildNaturalQuestion(pending, ctx)}`
            : priceReply;
        log?.info({ entityId, pending }, "GUARD: precio sin catálogo — Alejandro cotiza");
      } else {
        const safe = sanitizeInventedPrices(aiResponse, currentMessage ?? "", ctxText);
        let priceContent = safe;
        const fromCatalog = buildCatalogPriceAnswer(currentMessage ?? "");
        if (fromCatalog && mentionsListedPriceService(currentMessage ?? "")) {
          priceContent = fromCatalog;
        } else if (!messageClaimsPrice(safe) && fromCatalog) {
          priceContent = fromCatalog;
        } else if (!fromCatalog || !messageClaimsPrice(priceContent)) {
          // A14943: "ver los precios" / "Precios!!" sin SKU → aclarar, no upsell ni Sigo aquí.
          const clarify = buildGenericPriceClarifyReply(extracted, presHistory, currentMessage);
          priceContent = clarify;
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
      if (currentMessage && clientAsksPrice(currentMessage)) {
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

  if (
    !cierreYaEnviado &&
    requiredServiceDimensionsMissing(extracted) &&
    isReadyForClosing(filledSet) &&
    (responseLooksLikePrematureClose(mensaje) || !mensaje.includes("?"))
  ) {
    mensaje = buildRequiredServiceDimensionsQuestion(extracted);
    log?.info({ entityId }, "GUARD: bloqueando cierre — faltan medidas obligatorias");
  }

  if (appliedDirectReply) {
    if (!cierreYaEnviado && !trulyReadyForClosing) {
      const pendingDirect = getNextPendingField(extracted, filledSet);
      if (
        pendingDirect &&
        (responseLooksLikePrematureClose(mensaje) ||
          (pendingDirect === "requerimientos" &&
            needsAlimentosTipoClarification(extracted.requerimientos_evento) &&
            !isAlimentosModoMenuReply(mensaje) &&
            !isProgressiveOptionsMenuReply(mensaje)))
      ) {
        mensaje = buildNaturalQuestion(pendingDirect, ctx);
        log?.info(
          { entityId, pending: pendingDirect },
          "GUARD: V9.40 — venta/cierre no salta tipo de alimentos ni embudo"
        );
      }
    }
    return normalizeAdvisorReferences(
      mensaje,
      extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
    );
  }

  if (filledSet.has("Número de invitados") && mensajeAsksForField(mensaje, "invitados")) {
    mensaje = blockResolvedInvitadosAsk(
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
  if (fechaFromMsg && !filledSet.has("Fecha y horario")) {
    // A15297: anotar siempre que el mensaje traiga fecha usable (no solo si GPT preguntó fecha).
    if (!extracted.fecha_horario?.trim()) {
      const withTime = (currentMessage ?? "").match(
        /\b(?:a\s+partir\s+de|a\s+las)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?|horas?)?)/i
      );
      extracted.fecha_horario = withTime
        ? `${fechaFromMsg} a partir de ${withTime[1]!.trim()}`
        : fechaFromMsg;
    }
    filledSet.add("Fecha y horario");
    if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
      log?.info({ entityId }, "GUARD: fecha capturada en turno — cierre");
    } else if (
      mensajeAsksForField(mensaje, "fecha") ||
      /quieres que te d[eé] detalles|siguiente dato del evento/i.test(mensaje)
    ) {
      const nextQ = nextFieldQuestion(
        extracted,
        filledSet,
        whatsappDisplayName,
        history,
        currentMessage,
        entityId
      );
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

  // No saltar invitados/fecha/zona: si el pending es uno de esos, pregunta ESE dato.
  // V9.39: invitados va antes que fecha/zona — no "robar" la pregunta hacia ubicación.
  if (
    !cierreYaEnviado &&
    !clientAsksInclusion(currentMessage) &&
    !clientAsksServiceInfo(currentMessage) &&
    !appliedDirectReply &&
    !appliedSalesReply &&
    !/\bincluye\s*:|bodasesor\.com\/catalogos|medidas?\s+aproximad/i.test(mensaje) &&
    !isFieldSatisfied("zona", filledSet, extracted) &&
    (responseLooksLikePrematureClose(mensaje) ||
      trulyReadyForClosing ||
      mensajeAsksForField(mensaje, "presupuesto") ||
      mensajeAsksForField(mensaje, "correo") ||
      mensajeAsksForField(mensaje, "invitados"))
  ) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending === "invitados" && !mensajeAsksForField(mensaje, "invitados")) {
      mensaje = buildNaturalQuestion("invitados", ctx);
      log?.info({ entityId }, "GUARD: forzar invitados antes de fecha/ubicación/cierre");
    } else if (pending === "fecha") {
      if (!mensajeAsksForField(mensaje, "fecha")) {
        mensaje = buildNaturalQuestion("fecha", ctx);
        log?.info({ entityId }, "GUARD: forzar fecha antes de ubicación/cierre");
      }
    } else if (pending === "zona" && !mensajeAsksForField(mensaje, "zona")) {
      mensaje = buildNaturalQuestion("zona", ctx);
      log?.info({ entityId }, "GUARD: forzar ubicación antes de avance/cierre");
    }
  }

  if (
    !cierreYaEnviado &&
    !appliedSalesReply &&
    needsAlimentosTipoClarification(extracted.requerimientos_evento) &&
    !isAlimentosModoMenuReply(mensaje) &&
    !isProgressiveOptionsMenuReply(mensaje)
  ) {
    const pendingFood = getNextPendingField(extracted, filledSet);
    if (pendingFood === "requerimientos") {
      mensaje = buildNaturalQuestion("requerimientos", ctx);
      log?.info({ entityId }, "GUARD: V9.40 — forzar tipo de alimentos antes de seguir");
    }
  }

  if (mensajeAsksWrongField(mensaje, filledSet, extracted) && !isInformativeClientAnswer(currentMessage) && !appliedSalesReply) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending) {
      log?.warn({ entityId, pending }, "GUARD: pregunta fuera de orden — corrigiendo");
      const fixCtx = justGaveEmail ? { ...ctx, afterEmail: true } : ctx;
      mensaje = buildNaturalQuestion(pending, fixCtx);
    }
  }

  if (!cierreYaEnviado && !appliedDirectReply) {
    mensaje = sanitizeOutboundMessage(mensaje, filledSet, extracted, ctx, log);
  }

  // A15297: nunca dejar salir el filler "¿seguimos con el siguiente dato?" —
  // sustituir por la pregunta real pendiente del embudo.
  if (
    !cierreYaEnviado &&
    assistantAskedVagueEmbudoContinue(mensaje) &&
    !/bodasesor\.com\/catalogos|Según el catálogo/i.test(mensaje)
  ) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending) {
      const realQ = buildNaturalQuestion(pending, ctx);
      const ackBit = mensaje
        .replace(/¿?\s*Seguimos con el siguiente dato[^.?]*[.?]?/gi, "")
        .replace(/¿?\s*siguiente dato del evento[^.?]*[.?]?/gi, "")
        .trim();
      mensaje =
        ackBit && ackBit.length > 12 && !assistantAskedVagueEmbudoContinue(ackBit)
          ? `${ackBit} ${realQ}`.trim()
          : realQ;
      log?.info({ entityId, pending }, "GUARD: A15297 — filler siguiente-dato → pregunta real");
    }
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
        (currentMessage && clientMentionsPistaTarima(currentMessage)) ||
        (mentionsNoListedPriceService(currentMessage ?? ""))) &&
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
    // Precio a media captura: el early-return de ventas no debe saltarse el Sheet.
    if (currentMessage && clientAsksPrice(currentMessage) && !messageClaimsPrice(mensaje)) {
      const fromCatalog = buildCatalogPriceAnswer(currentMessage ?? "");
      if (fromCatalog) {
        const pendingFinal = getNextPendingField(extracted, filledSet);
        mensaje =
          pendingFinal && needsNextStep && !trulyReadyForClosing
            ? `${fromCatalog}\n\n${buildNaturalQuestion(pendingFinal, ctx)}`
            : fromCatalog;
        log?.info({ entityId }, "GUARD: precio del Sheet en rama de ventas");
      }
    }
    // Primer turno con pitch de venta: intro Lucy + nombre si falta (A14929).
    if (
      (forceFirstPresentation || isFirstLucyReply(presHistory)) &&
      !conversationAlreadyStarted(filledSet, presHistory) &&
      !isFieldSatisfied("nombre", filledSet, extracted)
    ) {
      if (!/hola[!.,]?\s*(?:buen\s+d[ií]a[.!]?\s*)?soy\s+lucy|soy\s+lucy,\s*agente\s+virtual/i.test(mensaje)) {
        mensaje = `${LUCY_INTRO} ${mensaje}`.trim();
      }
      if (
        !mensajeAsksForField(mensaje, "nombre") &&
        !/\b(cu[aá]l\s+es\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|me\s+regalas\s+tu\s+nombre)\b/i.test(
          mensaje
        )
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
  if (
    isOpeningTurn &&
    !/hola[!.,]?\s*(?:buen\s+d[ií]a[.!]?\s*)?soy\s+lucy|soy\s+lucy,\s*agente\s+virtual/i.test(mensaje)
  ) {
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
    const catalogOnlyQuestions =
      isProgressiveOptionsMenuReply(mensaje) ||
      (/quieres que te d[eé] detalles de alguno/i.test(mensaje) &&
        pendingAfter &&
        !mensajeAsksForField(mensaje, pendingAfter));
    if (
      pendingAfter &&
      !(pendingAfter === "presupuesto" && filledSet.has("Presupuesto (MXN)")) &&
      (!mensaje.includes("?") || catalogOnlyQuestions)
    ) {
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
    currentMessage && clientAsksPrice(currentMessage) &&
    mentionsListedPriceService(currentMessage ?? "")
  ) {
    const fromCatalog = buildCatalogPriceAnswer(currentMessage ?? "");
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
    currentMessage && clientAsksPrice(currentMessage) &&
    !messageClaimsPrice(mensaje) &&
    !mentionsNoListedPriceService(currentMessage ?? "")
  ) {
    const fromCatalog = buildCatalogPriceAnswer(currentMessage ?? "");
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
    const inclusionAnswer = resolveCatalogInclusionReply(currentMessage ?? "", serviceHint);
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
    !(currentMessage && parseZonaFromText(currentMessage)) &&
    !/\bincluye\b|\bniveles?\b|\$\s*\d|bodasesor\.com\/catalogos|cat[aá]logo general|shows?\s+en\s+vivo|maestro\s+de\s+ceremonias/i.test(
      mensaje
    )
  ) {
    const nombre = getDisplayName(extracted, whatsappDisplayName);
    const zonaAsks = countLucyFieldAsks(presHistory, "zona");
    const zonaVariants = nombre
      ? [
          `${pickTransition(presHistory)} ${nombre}, ¿me confirmas la *ciudad* del evento?`,
          `${pickTransition(presHistory)} ${nombre}, ¿en qué ciudad sería?`,
          `${pickTransition(presHistory)} ${nombre}, ¿ya tienen ciudad del evento?`,
        ]
      : [
          `${pickTransition(presHistory)} ¿Me confirmas la *ciudad* del evento?`,
          `${pickTransition(presHistory)} ¿En qué ciudad sería?`,
          `${pickTransition(presHistory)} ¿Ya tienen ciudad del evento?`,
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
    isFieldSatisfied("nombre", filledSet, extracted) &&
    (mensajeAsksForField(mensaje, "nombre") ||
      /\b(c[oó]mo\s+te\s+llamas|me\s+regalas\s+tu\s+nombre|con\s+qui[eé]n\s+tengo)\b/i.test(
        mensaje
      ))
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
    (historyHadGenericMenu || (currentMessage && clientMentionsPistaTarima(currentMessage)) || mentionsNoListedPriceService(currentMessage ?? "")) &&
    currentMessage?.trim()
  ) {
    // Servicio concreto sin precio en Sheet (pista, DJ, etc.) → aceptar-anotar-avanzar, no otro menú.
    if (
      (currentMessage && clientMentionsPistaTarima(currentMessage)) ||
      mentionsNoListedPriceService(currentMessage ?? "")
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

  // A14938: ubicación sola + pizzas ya pedidas → no inventar taquiza/$300.
  {
    const zonaNow = currentMessage ? parseZonaFromText(currentMessage) : null;
    const locOnly =
      !!zonaNow &&
      !!currentMessage &&
      currentMessage.trim().split(/\s+/).length <= 6 &&
      (/^en\s+/i.test(currentMessage.trim()) || isLikelyUbicacionNotNombre(currentMessage));
    const wantsPizza = /pizza/i.test(extracted.requerimientos_evento ?? "") ||
      /pizza/i.test(currentMessage ?? "");
    if (
      locOnly &&
      wantsPizza &&
      /\btaquiza/i.test(mensaje) &&
      !/\btaquiza/i.test(extracted.requerimientos_evento ?? "")
    ) {
      const pending = getNextPendingField(extracted, filledSet);
      const nextQ = pending ? buildNaturalQuestion(pending, ctx) : null;
      const display = getDisplayName(extracted, whatsappDisplayName);
      mensaje = [
        display ? `Perfecto, ${display}.` : "Perfecto.",
        `Anoto la ubicación en *${zonaNow}*.`,
        "Seguimos con la cotización de *pizzas* para tu evento.",
        nextQ,
      ]
        .filter(Boolean)
        .join(" ");
      log?.info({ entityId, zonaNow }, "GUARD: zona + pizzas — no inventar taquiza");
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
  // A15308: sin "qué emoción / felicidades" tras solo el nombre (todas las ramas).
  mensaje = stripPrematureCelebrationFluff(mensaje, {
    currentMessage,
    tipoEvento: extracted.tipo_evento,
  });

  // A15016: post-cierre NUNCA re-pide correo si ya está en historial/extracted.
  if (cierreYaEnviado && /correo electr[oó]nico|a qu[eé] correo|me compartes.*correo/i.test(mensaje)) {
    if (!extracted.correo?.trim()) {
      const recovered = parseCorreoFromText(
        collectUserTexts(presHistory, currentMessage).join("\n")
      );
      if (recovered) {
        extracted.correo = recovered;
        filledSet.add("Correo electrónico");
      }
    }
    if (extracted.correo?.trim() || filledSet.has("Correo electrónico") || filledSet.has(EMAIL_WAIVED_LABEL)) {
      mensaje = mensaje
        .replace(/[^.?!\n]*\b(correo electr[oó]nico|a qu[eé] correo|me compartes.{0,40}correo)[^.?!\n]*[.?!]?\s*/gi, "")
        .replace(/\bAdem[aá]s,\s*/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (!mensaje || mensaje.length < 12) {
        mensaje = clientSaysThanks(currentMessage)
          ? buildPostCierreThanksReply(extracted.nombre)
          : buildPostCierrePaymentHandoffReply(extracted.nombre);
      }
      log?.info({ entityId }, "GUARD: A15016 — post-cierre sin re-pedir correo");
    }
  }

  const clientWantedCatalog =
    clientAsksForCatalog(currentMessage) ||
    clientAffirmsCatalogOffer(
      currentMessage,
      lastAssistantMsg && typeof lastAssistantMsg.content === "string"
        ? (lastAssistantMsg.content as string)
        : null
    );
  // Entretenimiento / RFQ / detalle de servicio: links intencionales (A14920 + V8.34).
  const intentionalCatalogSend =
    /te dejo el cat[aá]logo general/i.test(mensaje) ||
    /detalle completo de men[uú]s e inclusiones est[aá] en el cat[aá]logo/i.test(mensaje) ||
    /el detalle de (lo que incluye|inclusiones).{0,40}cat[aá]logo/i.test(mensaje) ||
    /aqu[ií]\s+tienes\s+el\s+cat[aá]logo/i.test(mensaje) ||
    /\bCat[aá]logo(?:\s+de\s+\*[^*]+\*)?:\s*\n?\s*https?:\/\//i.test(mensaje) ||
    messageOffersCatalogLink(mensaje) ||
    (/bodasesor\.com\/catalogos|hostingersite\.com\/catalogos/i.test(mensaje) &&
      (/shows?\s+en\s+vivo|hora\s+loca|maestro\s+de\s+ceremonias|entretenimiento|niveles?|incluye|men[uú]s|precio|manejamos|paquetes?/i.test(
        mensaje
      ) ||
        clientAsksServiceInfo(currentMessage) ||
        clientAsksPrice(currentMessage)));
  mensaje = stripUnsolicitedCatalogWebLinks(
    mensaje,
    clientWantedCatalog ||
      intentionalCatalogSend ||
      clientAsksInclusion(currentMessage) ||
      clientAsksServiceInfo(currentMessage) ||
      clientAsksPrice(currentMessage)
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

  // A14994: "Sí" / "Sí por favor" tras oferta de catálogo → NUNCA re-preguntar sin URL.
  if (
    clientWantedCatalog &&
    /te\s+gustar[ií]a\s+que\s+te\s+env[ií]e|mande\s+el\s+cat[aá]logo|cat[aá]logo\s+m[aá]s\s+detall/i.test(
      mensaje
    ) &&
    !/bodasesor\.com\/catalogos/i.test(mensaje)
  ) {
    mensaje = buildCatalogWebLinkReply({
      query: extracted.requerimientos_evento || "catálogo general",
      wantFull: clientWantsFullCatalog(currentMessage),
      serviceHint: extracted.requerimientos_evento ?? null,
    });
    log?.info({ entityId }, "GUARD: A14994 — afirmó catálogo, forzó envío con URL");
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

  // A14962 / A14988 / A15003: si el hilo es robots LED / batucada / bailarinas / photo booth, NUNCA dejar precios de banquete.
  {
    const userBlob = collectUserTexts(presHistory, currentMessage).join(" ");
    const entThread =
      clientMentionsLedRobotsOrBatucada(userBlob) ||
      /\bbailarinas?\b|\bdancers?\b|\bvedettes?\b/i.test(userBlob) ||
      clientMentionsEntertainment(userBlob);
    if (
      entThread &&
      /banquete\s+formal|solo\s+alimentos.*\$\s*450|tradicional.*\$\s*830|barra\s+de\s+bebidas/i.test(
        mensaje
      ) &&
      !/\bbanquete\b/i.test(userBlob)
    ) {
      const focus =
        currentMessage &&
        (clientMentionsEntertainment(currentMessage) ||
          clientMentionsLedRobotsOrBatucada(currentMessage) ||
          /\bbailarinas?\b/i.test(currentMessage))
          ? currentMessage
          : /\b(photo\s*booth|photobooth|cabina)/i.test(userBlob)
            ? "Photo Booth"
            : /\bcirco\b/i.test(userBlob)
              ? "Circo para eventos"
              : /\bblue\s*man|blueman/i.test(userBlob)
                ? "Show Blue Man"
                : /\bbailarinas?\b/i.test(userBlob)
                  ? "Bailarinas"
                  : currentMessage || userBlob;
      mensaje = buildEntertainmentSalesReply(
        extracted,
        history,
        entityId,
        focus,
        filledSet,
        ctx
      );
      log?.info({ entityId }, "GUARD: A14962/A14988/A15003/A15009 — reemplazó banquete por entretenimiento");
    }
  }

  // A14988 / A15009: no re-preguntar "qué revisar primero" si ya hay requerimientos o acto especial.
  if (
    /qu[eé]\s+te\s+gustar[ií]a\s+revisar\s+primero|armar\s+un\s+paquete\s+completo/i.test(mensaje) &&
    (hasMeaningfulRequerimientos(extracted, filledSet) ||
      clientConfirmsOfferReview(currentMessage) ||
      clientMentionsEntertainment(currentMessage) ||
      clientMentionsSpecialLiveAct(currentMessage))
  ) {
    if (
      clientMentionsEntertainment(currentMessage) ||
      clientMentionsSpecialLiveAct(currentMessage)
    ) {
      mensaje = buildEntertainmentSalesReply(
        extracted,
        history,
        entityId,
        currentMessage,
        filledSet,
        ctx
      );
      log?.info({ entityId }, "GUARD: A15009 — CTA revisar → ack entretenimiento/acto");
    } else {
      const pending = getNextPendingField(extracted, filledSet);
      if (pending && pending !== "requerimientos") {
        const nextQ = buildNaturalQuestion(pending, ctx);
        if (nextQ) {
          mensaje = `${pickTransition(presHistory)} Seguimos con lo que elegiste.\n\n${nextQ}`;
          log?.info({ entityId }, "GUARD: A14988 — cortó re-CTA revisar primero");
        }
      } else if (hasMeaningfulRequerimientos(extracted, filledSet)) {
        const pending2 = getNextPendingField(extracted, filledSet);
        if (pending2) {
          mensaje = buildNaturalQuestion(pending2, ctx);
        }
      }
    }
  }

  // A15009: handoff humano — nunca dejar "mientras tanto… banquete".
  if (
    clientAsksForHumanAdvisor(currentMessage) &&
    !/55\s*4008\s*0373|canalizo/i.test(mensaje)
  ) {
    mensaje = buildHumanAdvisorHandoffAnswer(extracted.nombre);
    log?.info({ entityId }, "GUARD: A15009 — forzó handoff humano (anti mientras-tanto)");
  }

  // A15009: si el cliente insiste con el mismo acto/servicio, no "Sigo aquí" residual.
  if (
    /Sigo aqu[ií]/i.test(mensaje) &&
    (clientMentionsEntertainment(currentMessage) ||
      clientMentionsSpecialLiveAct(currentMessage) ||
      parseServicesFromText(currentMessage ?? "").length > 0 ||
      clientAsksForHumanAdvisor(currentMessage) ||
      isReferentialPriorAnswer(currentMessage) ||
      clientComplainsAboutRepeat(currentMessage))
  ) {
    if (clientAsksForHumanAdvisor(currentMessage)) {
      mensaje = buildHumanAdvisorHandoffAnswer(extracted.nombre);
    } else if (
      clientMentionsEntertainment(currentMessage) ||
      clientMentionsSpecialLiveAct(currentMessage)
    ) {
      mensaje = buildEntertainmentSalesReply(
        extracted,
        history,
        entityId,
        currentMessage,
        filledSet,
        ctx
      );
    } else {
      const pending = getNextPendingField(extracted, filledSet);
      const nombre = getDisplayName(extracted, whatsappDisplayName);
      const ack = nombre ? `Perfecto, ${nombre}. Ya lo anoto.` : "Perfecto. Ya lo anoto.";
      mensaje = pending
        ? `${ack}\n\n${buildNaturalQuestion(pending, ctx)}`
        : ack;
    }
    log?.info({ entityId }, "GUARD: A15009 — reemplazó Sigo aquí residual");
  }

  mensaje = dedupeCatalogUrlsInMessage(mensaje);

  // Invariante final: ninguna rama puede cerrar carpas/pistas/tarimas sin medidas.
  if (
    !cierreYaEnviado &&
    requiredServiceDimensionsMissing(extracted) &&
    isReadyForClosing(filledSet) &&
    responseLooksLikePrematureClose(mensaje)
  ) {
    mensaje = buildRequiredServiceDimensionsQuestion(extracted);
    log?.info({ entityId }, "GUARD: cierre final reemplazado por medidas obligatorias");
  }

  // A15204: comida/canapés nunca termina en dump de Mesas y Sillas / mobiliario.
  {
    const foodAsk =
      /\b(canap[eé]s?|bocadillos?|catering|banquete|taquiza|paella|coffee\s*break|barra\s+de)\b/iu.test(
        currentMessage ?? ""
      ) ||
      /\b(canap[eé]s?|bocadillos?|catering|banquete|taquiza)\b/iu.test(
        extracted.requerimientos_evento ?? ""
      );
    const furnitureDump =
      /Mesas\s*y\s*Sillas|20 combinaciones de mobiliario|Colecci[oó]n Vintage|periqueras?/i.test(
        mensaje
      ) &&
      (/Según el cat[aá]logo/i.test(mensaje) ||
        /Tiffany|Crossback|tabl[oó]n vintage/i.test(mensaje));
    if (foodAsk && furnitureDump) {
      const fixHint =
        currentMessage && /\bcanap|catering|bocadillo|banquete|taquiza/i.test(currentMessage)
          ? currentMessage
          : extracted.requerimientos_evento || currentMessage || "canapés";
      mensaje = buildGuardServiceAck(fixHint);
      log?.info({ entityId }, "GUARD: A15204 — comida ≠ mobiliario, dump reemplazado");
    }
  }

  // Nunca hablarle al cliente en meta ("No confundir con…"): es nota interna.
  mensaje = stripClientServiceConfusionNotes(mensaje);

  // V9.26 / V9.36: nunca salir con ack muerto ni "ya tengo todo" si falta embudo.
  if (!cierreYaEnviado && !trulyReadyForClosing) {
    const pendingDead = getNextPendingField(extracted, filledSet);
    if (pendingDead && (looksLikeDeadEndAck(mensaje) || responseLooksLikePrematureClose(mensaje))) {
      const nextQ = buildNaturalQuestion(pendingDead, ctx);
      const display = getDisplayName(extracted, whatsappDisplayName);
      const ack = display ? `Perfecto, ${display}.` : "Perfecto.";
      mensaje = looksLikeDeadEndAck(mensaje) && !responseLooksLikePrematureClose(mensaje)
        ? `${mensaje.trim()}\n\n${nextQ}`
        : `${ack} ${nextQ}`;
      log?.info({ entityId, pending: pendingDead }, "GUARD: V9.36 — corte de chat → sigue embudo");
    }
  }

  return normalizeAdvisorReferences(mensaje, extracted.nombre);
}

/**
 * Quita frases meta del tipo "No confundir con banquete/catering" del WhatsApp al cliente.
 * Esas aclaraciones son para el código/CRM, no para el lead.
 */
export function stripClientServiceConfusionNotes(text: string): string {
  if (!text?.trim()) return text;
  let out = text;
  out = out.replace(
    /[^.!?\n]*\b[Nn]o\s+confundir\s+con\b[^.!?\n]*[.!?]?/gi,
    " "
  );
  out = out.replace(
    /[^.!?\n]*\b[Nn]o\s+es\s+banquete\s+ni\s+catering\b[^.!?\n]*[.!?]?/gi,
    " "
  );
  out = out.replace(
    /\(\s*no\s+es\s+banquete\s+ni\s+catering\s*\)/gi,
    ""
  );
  out = out.replace(
    /[^.!?\n]*\b[Nn]o\s+tiene\s+tarifa\s+fija\s+en\s+lista\s+como\s+el\s+catering\b[^.!?\n]*[.!?]?/gi,
    " "
  );
  out = out.replace(
    /:\s*es\s+entretenimiento\s*\/\s*activaci[oó]n\b/gi,
    "."
  );
  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** A14995 / todas las ramas: no repetir la misma URL de catálogo dos veces. */
export function dedupeCatalogUrlsInMessage(text: string): string {
  if (!text?.trim() || !/bodasesor\.com\/catalogos|hostingersite\.com\/catalogos/i.test(text)) {
    return text;
  }
  const seen = new Set<string>();
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const urlMatch = line.match(/https?:\/\/[^\s]*?(?:bodasesor|hostingersite)\.com\/catalogos[^\s]*/i);
    if (urlMatch) {
      const key = urlMatch[0]!.replace(/\/+$/, "").toLowerCase();
      if (seen.has(key)) {
        // Quita también la línea de encabezado "Catálogo de…" / "Claro, aquí tienes…" previa si quedó huérfana.
        if (
          out.length &&
          /cat[aá]logo|claro,?\s+aqu[ií]\s+tienes/i.test(out[out.length - 1]!) &&
          !/https?:\/\//i.test(out[out.length - 1]!)
        ) {
          out.pop();
        }
        continue;
      }
      seen.add(key);
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
