/**
 * 10 escenarios de prueba del flujo Lucy (sin OpenAI).
 * Ejecutar: pnpm run selftest
 */
import assert from "node:assert/strict";
import type { OpenAI } from "openai";
import {
  parsePresupuestoFromText,
  parseInvitadosFromText,
  clientMentionsCatering,
  clientMentionsEntertainment,
  clientMentionsSpecialLiveAct,
  parseSpecialLiveActLabel,
  clientConfirmsOfferReview,
  clientMentionsPistaTarima,
  isDimensionText,
  parseSpaceDimensions,
  parseZonaFromText,
  parseFechaFromText,
  parseCorreoFromText,
  isServiceLabelNotTipoEvento,
  clientAsksPhone,
  clientSignalsUrgency,
  clientRequestsCallback,
  clientAsksForRecommendations,
  parsePrimaryService,
  scanConversationForCaptures,
  captureContextualAnswer,
  applyCapturesToCrm,
  clientAsksAboutTeam,
  inferLucyAskedField,
  isServiceRelatedMessage,
  detectPresupuestoRefusal,
  countLucyFieldAsks,
  clientDeclinesMoreServices,
  parseTipoEventoFromText,
  clientAsksLocation,
  clientMentionsItalianTheme,
  isAmbiguousShortNumber,
  clientAsksServiceInfo,
  recoverClienteNombreFromHistory,
  parseWebLeadBrief,
  applyWebLeadBrief,
  isVagueFoodTerm,
  needsAlimentosTipoClarification,
  clientAsksForFoodMenu,
  parseServicesFromText,
  parseCentrosDeMesaRequirement,
  mergeServiceRequirements,
  enrichExtractedFromConversation,
  isVagueVenueOnly,
  isLocationDeferralOrVagueWorkplace,
  isVenueWithoutCity,
  hasCityOrMetroSignal,
  extractVenueNameHint,
  isUsableDireccionEvento,
  sanitizeExtractedAmbiguousNumbers,
  clientAsksForCatalog,
  clientAsksGenericMenuCatalog,
  clientWantsFullCatalog,
  clientAffirmsCatalogOffer,
  looksLikeGuestCountRange,
  assistantOfferedCatalogDetail,
  looksLikeCompanyLocationQuestionFragment,
  isCatalogLevelSelection,
  isUnusableTipoEventoReply,
  clientAsksCafeOrCateringChoice,
  looksLikeNameAnswerMessage,
  extractCatalogNivelFromText,
  lastAssistantOfferedNumberedPackages,
  clientNeedsEmergencyContact,
  clientAsksForHumanAdvisor,
  isReferentialPriorAnswer,
  clientComplainsAboutRepeat,
  recoverCorreoFromUserTexts,
  recoverZonaFromUserTexts,
  isRichQuoteBrief,
  clientAsksToRereadBrief,
  clientAsksDistributorPricing,
  buildRichBriefAcknowledgment,
  isGenericQuoteIntentRequerimiento,
  mergeZonaDetail,
  FECHA_MAX_ASKS,
  parseSalaProductFromText,
  parseFurnitureCatalogSkuFromText,
  clientAffirmsEmbudoContinue,
  assistantAskedVagueEmbudoContinue,
  isLikelyProductNameNotLocation,
  parseCarpaVariantFromText,
  clientMentionsCarpas,
  clientAsksServiceInfo,
  clientAddsToQuote,
  appendPostCierreRequirements,
  preferPrimaryCatalogService,
  isServicePreferenceRefinement,
  clientWantsFoodOnlyQuote,
  dedupeServiceHierarchy,
  looksLikeConflictingFoodAlternatives,
  shouldReplaceCrmDireccion,
  looksLikeDiscourseNotPlace,
  clientCorrectsLocation,
  isVenueSpaceDetail,
  applyLocationCorrectionToAddress,
  applyLocationCorrectionToCrm,
  extractNumberedNivelFromLastAssistant,
  parseNumberedNivelesFromAssistant,
} from "../conversation-understanding.js";
import {
  applyCrmWriteInvariants,
  isInvalidCrmNombre,
  userJustifiesPresupuesto,
  purgeUnjustifiedPresupuestoLines,
} from "../lucyCrmInvariants.js";
import { isUsefulLearningPair } from "../services/learningPairFilter.js";
import { buildSilentWatchPatchPayload } from "../silentWatchCrm.js";
import {
  applyLucyGlobalAntiRepetition,
  cleanupBrokenOutboundFragments,
  lucyTextOverlapRatio,
} from "../lucyOutboundAntiRepeat.js";
import { finalizeLucyOutboundMessage } from "../lucyOutboundPipeline.js";
import { buildGuardServiceAck } from "../services/serviceKnowledge.js";
import { buildSillasModelMenu } from "../services/serviceProgressiveOffer.js";
import {
  clientDeclinesServiceFamilies,
  clientDeclinesServiceFamiliesWithContext,
  looksLikeThemeColorNotLocation,
  removeDeclinedFamiliesFromRequirements,
  stripThemeColorsFromZona,
} from "../services/serviceDecline.js";
import {
  buildConcreteProductQuestionReply,
  clientAsksAboutLighting,
  clientAsksCapacityLayout,
  clientAsksConcreteProductQuestion,
  clientAsksForPhotos,
} from "../services/concreteProductQuestion.js";
import { buildDynamicPrompt } from "../services/promptBuilder.js";
import { isQuoteIntentMessage, sanitizeDisplayName, sanitizeCrmNombre, isNombreMoreComplete, pickBetterNombre, isLikelyUbicacionNotNombre, isGreetingOnlyMessage, isLikelyNotPersonNameMessage, looksLikePersonFullName, clientAsksCompanyIdentity, buildCompanyIdentityReply, shouldUpdateName, resolveKommoLeadNamePatch } from "../contact-name.js";
import { filterClientEmail, isOwnCompanyEmail, looksLikeValidClientEmail, buildEmailConfirmationPrompt } from "../client-email.js";
import {
  resolveTipoContacto,
  looksLikeProveedorOutreach,
  clientAsksIfCompanyEmailCorrect,
  buildCompanyEmailConfirmReply,
} from "../tipoContacto.js";
import {
  buildProveedorHandoffReply,
  extractEmpresaFromText,
  scrubClientFieldsForProveedor,
} from "../lib/proveedorHandoff.js";
import { resolveProveedorEtapa, ETAPA, lucyDebeResponder } from "../services/embudo.js";
import { prepareLucyExtraction } from "../lucyTurnProcessor.js";
import {
  buildFirstInteractionMessage,
  buildLocationAnswer,
  buildVagueFoodOptionsReply,
  buildEmergencyContactAnswer,
  buildHumanAdvisorHandoffAnswer,
  buildDeferredKnownServiceOffer,
  historyAlreadyOfferedServiceDetail,
  parsePistaTarimaVariant,
  stripClientServiceConfusionNotes,
} from "../lucy-flow-guards.js";
import { advisorLabelForClient, normalizeAdvisorReferences, getAdvisorName, LEGACY_ADVISOR_NAMES, stripInternalCrmBlock, isStaffAdvisorName } from "../lib/bodasesorAdvisor.js";
import { buildResumenClienteLargo } from "../services/summaryService.js";
import {
  applyLucyMessageGuards,
  applyEmailWaiver,
  applyInvitadosWaiver,
  applyPresupuestoWaiver,
  buildPhoneAnswer,
  buildRecommendationsReply,
  buildPostCierreThanksReply,
  buildPostCierreCallbackAck,
  buildPostCierrePaymentHandoffReply,
  clientAsksPaymentOrQuoteDelivery,
  dedupeTransitionsInMessage,
  collapseRepeatedSentences,
  stripPrematureCelebrationFluff,
  buildStandardClosingMessage,
  buildMultiServicePackageReply,
  buildMultiServiceSheetLevelsReply,
  buildMappedCatalogOfferBlock,
  buildPackageCatalogOfferBlock,
  buildGenericCatalogHubBlock,
  collectServicesForCatalogOffer,
  clientSaysThanks,
  detectCierreEnviado,
  CLOSING_SIGNATURE,
  CLOSING_CORE_FIELDS,
  detectEmailRefusal,
  EMAIL_WAIVED_LABEL,
  getNextPendingField,
  isFieldSatisfied,
  isReadyForClosing,
  mensajeAsksForFilledField,
  mensajeAsksForField,
  LUCY_INTRO,
  isValidRequerimientosValue,
  crmStoredValue,
  stripImageAnnotation,
  stripCatalogBlockShared,
  pickTransition,
  stripRobotAcknowledgments,
  buildCorreoQuestion,
  isLegacyStoredLucyResponse,
  isResumenClienteLargo,
  resolveEffectiveLastLucyResponse,
  buildSoftComplementOffer,
  looksLikeMinimalServiceAsk,
  preferEventOfferReply,
  aiLooksLikeEventServiceOffer,
  isDryRequerimientosAsk,
  dedupeTransitionsInMessage,
  parseNombreFromCrmLines,
  buildOpeningAcknowledgment,
  buildGenericPriceClarifyReply,
  buildGenericPackagesOverviewReply,
  emailRefusalAckMessage,
  looksLikeDeadEndAck,
} from "../lucy-flow-guards.js";
import {
  buildLucyInfoInclusionReply,
  refreshLucyInfoPriceCache,
} from "../services/lucyInfoPriceCache.js";
import {
  sanitizeKommoCrmLines,
  sanitizeExtractedFromExternal,
} from "../lib/external-ingest-sanitize.js";
import { buildConsultativeNoPriceReply, clientAsksPrice, mentionsNoListedPriceService } from "../price-guard.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCatalogStatus,
  buildCatalogNotFoundAnswer,
  formatServiceDataForPrompt,
  injectCatalogCateringIfAsked,
  responseLooksLikeGenericCateringMenu,
  setCatalogSnapshotForTests,
  resolveCatalogQuery,
  buildCatalogPriceAnswer,
  formatRequerimientoLabelFromQuery,
  buildCatalogInclusionAnswer,
  clientAsksInclusion,
  clientAsksSpecificInclusionItem,
  buildSpecificInclusionItemReply,
  buildInclusionTeamConfirmationAnswer,
  injectCatalogInclusionIfAsked,
  resolveCatalogInclusionReply,
  catalogAnswerMatchesRequestedService,
  rowMatchesServiceLabel,
  buildCatalogServiceDetailAnswer,
  listCatalogServicesForEvent,
  buildEventOfferCatalogHint,
  buildBroadLevel1Offer,
  isNarrowSocialEventOffer,
  countOfferCategories,
  resolveCatalogWebLink,
  buildCatalogWebLinkReply,
  stripUnsolicitedCatalogWebLinks,
  CATALOG_WEB_HUB_URL,
  CATALOG_OFFER_QUESTION,
  SERVICE_NIVEL_DETAIL_CTA,
  ensureCatalogWebLink,
  attachAvailableSheetDetail,
  messageHasSheetServiceDetail,
  looksLikeNivelOptionsDump,
  buildSoloVsCompletoModeAnswer,
  buildCompletoNivelesTeaser,
  serviceHasSoloVsCompleto,
  buildSoloVsCompletoOfferIfApplicable,
  toDeliverableCatalogUrl,
  enrichBareNivelOffer,
  messageOffersLevelsWithoutInclusions,
} from "../services/catalogService.js";
import {
  buildMobiliarioRentDetailReply,
  parseMobiliarioRentItems,
} from "../services/serviceKnowledge.js";
import { isMobiliarioRentalPedido } from "../modoServicio.js";
import { composeEventLocation } from "../services/geoResolve.js";
import { resolveServiceFocusFromText, expandQueryWithServiceSynonyms } from "../services/serviceSynonyms.js";
import {
  classifyKommoOrigin,
  usesKommoExternalSend,
} from "../services/kommoTalks.js";
import {
  withCatalogNivelQuery,
  banqueteDetailQuery,
  resolveDetailQueryForFamily,
  detectProgressiveFamily,
  catalogNivelLabelFromText,
  buildProgressiveOptionsMenu,
  clientWantsServiceDetail,
  resolveProgressiveDetailQuery,
  buildAlimentosModoMenu,
  buildCateringCasualMenu,
  clientChoseBanqueteFormal,
  clientChoseCateringCasual,
  shouldOfferOptionsBeforeDetail,
  resolveSoloVsCompletoStationLabel,
  buildSoloVsCompletoProgressiveMenu,
  parseMobiliarioPieceChoice,
  buildMobiliarioPieceFollowUp,
  buildSillasModelMenu,
  isAlimentosModoMenuReply,
  isMobiliarioPieceMenuReply,
} from "../services/serviceProgressiveOffer.js";
import {
  parseSheetCatalogCsv,
  deriveCatalogCategory,
  formatCatalogRowLabel,
  sheetRowsToMarkdown,
} from "../services/googleSheetsCatalog.js";
import {
  classifyServiceKnowledgeLevel,
  buildLevel2Ack,
  buildLevel3Ack,
  getServiceKnowledge,
  SERVICE_KNOWLEDGE_GOLDEN_RULE,
} from "../services/serviceKnowledge.js";
import { formatForWhatsApp } from "../lib/formatForWhatsApp.js";
import { isVoiceNote, getVoiceNoteUrl } from "../services/voiceProcessor.js";
import { isImageMessage, getImageUrl, getImageCaption, cacheImageDescription, getCachedImageDescription, resetImageAnalysisCacheForTests, parseVisionImageJson, formatImageTurnText, formatImageTeamNote, extractImageClientReply, looksLikeImageInternalSummary, clientCaptionForServiceParse, parseAmountMxn, normalizePaymentMethod, rewriteImageTurnClientReply } from "../services/imageProcessor.js";
import {
  resolveCatalogWebSlug,
  getCatalogWebUrlForQuery,
  loadCatalogEmbeds,
  buildCatalogWebDetailHint,
} from "../services/catalogWebKnowledge.js";
import { detectModoServicio, needsModoServicioClarification } from "../modoServicio.js";
import {
  webhookMessageKey,
  isDuplicateWebhookMessage,
  markWebhookMessageProcessed,
  isIncomingClientMessage,
  resetWebhookDedupForTests,
} from "../lib/webhookDedup.js";
import {
  extractKommoIncomingMessage,
  extractKommoEntityId,
  extractKommoChatId,
  extractKommoMessageText,
  extractKommoUnsortedAdd,
  isChatUnsortedCategory,
} from "../lib/kommoWebhookParse.js";
import { isWithinLookback } from "../services/incomingLeadRecovery.js";
import {
  FIELD_ANTICIPO,
  FIELD_LIQUIDACION,
  nextPaymentSlot,
  paymentFieldValue,
  clientReplyForPaymentSlot,
  kommoValueIsFilled,
} from "../services/paymentReceiptCrm.js";
import type { ExtractedData } from "../types.js";
import { SYSTEM_PROMPT } from "../lucy-prompt.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import {
  DEFAULT_GEMINI_MODEL,
  getChatModel,
  getLlmProvider,
  isLlmConfigured,
  isBlockedGeminiModel,
  isImageGenerationModel,
  resolveGeminiModel,
  llmConfigSummary,
} from "../lib/llmEnv.js";
import { fromOpenAiMessages, getGeminiCallStats } from "../lib/llmChat.js";
import {
  hashSystemInstruction,
  resetGeminiContextCacheForTests,
  getGeminiContextCacheStats,
  getOrCreateSystemCache,
} from "../lib/geminiContextCache.js";
import {
  compressImageForVision,
  VISION_MAX_EDGE,
  resetImageCompressStatsForTests,
  getImageCompressStats,
} from "../lib/imageCompress.js";
import {
  isLucyUnifiedLlmTurn,
  getLucyChatHistoryMax,
  getLucyFewShotMax,
  trimChatHistory,
  lucyCostControlsSummary,
} from "../lib/lucyCostControls.js";
import { buildStaticSystemPrompt, buildDynamicTurnContext } from "../services/promptBuilder.js";
import { mergeExtractedPatch } from "../services/lucyRedaction.js";
import { Jimp } from "jimp";

const CATALOG_URL = "https://bodasesor.com/catalogos";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok ${name}`);
  } catch (err: unknown) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL ${name}:`, msg);
    process.exitCode = 1;
  }
}

function emptyExtracted(overrides: Partial<ExtractedData> = {}): ExtractedData {
  return {
    nombre: null,
    telefono: null,
    correo: null,
    presupuesto: null,
    direccion_evento: null,
    requerimientos_evento: null,
    fecha_horario: null,
    num_invitados: null,
    tipo_evento: null,
    tipo_contacto: "cliente",
    empresa: null,
    modo_servicio: null,
    ...overrides,
  };
}

function mockClosing(servicios: string | null | undefined, clientName?: string | null): string {
  return buildStandardClosingMessage(servicios, clientName);
}

function runGuards(opts: {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  readyForClosing: boolean;
  currentMessage?: string;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  emailRefusedThisTurn?: boolean;
  whatsappDisplayName?: string | null;
  forceFirstPresentation?: boolean;
  cierreYaEnviado?: boolean;
  debugLogs?: string[];
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: opts.readyForClosing,
    cierreYaEnviado: opts.cierreYaEnviado ?? false,
    emailRefusedThisTurn: opts.emailRefusedThisTurn ?? false,
    history: opts.history ?? [],
    currentMessage: opts.currentMessage,
    whatsappDisplayName: opts.whatsappDisplayName,
    forceFirstPresentation: opts.forceFirstPresentation,
    buildClosing: mockClosing,
    log: opts.debugLogs
      ? {
          info: (_o, msg) => {
            if (msg) opts.debugLogs!.push(msg);
          },
          warn: (_o, msg) => {
            if (msg) opts.debugLogs!.push(`WARN:${msg}`);
          },
        }
      : undefined,
  });
}

async function runAll(): Promise<void> {
  console.log("Lucy — 28 escenarios de prueba\n");

  await test('1. A14754/A15205 — "Busco comida" pregunta formal vs casual', () => {
    const filled = new Set(["Nombre del cliente", EMAIL_WAIVED_LABEL, "Tipo de evento"]);
    const extracted = emptyExtracted({ nombre: "Alejandro", tipo_evento: "cumpleaños" });
    const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "assistant", content: "¿Qué servicios te gustaría cotizar para la fiesta de cumpleaños?" },
    ];
    const lastLucy = history[0]!.content as string;
    assert.equal(inferLucyAskedField(lastLucy), "requerimientos");
    assert.ok(clientMentionsCatering("Busco comida"));
    assert.ok(isServiceRelatedMessage("Busco comida"));
    assert.ok(isVagueFoodTerm("Busco comida"));

    const debugLogs: string[] = [];
    const reply = runGuards({
      aiResponse: "¿Cuántos invitados?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Busco comida",
      history,
      debugLogs,
    });
    assert.ok(/banquete|casual|catering/i.test(reply), reply.slice(0, 300));
    assert.ok(/formal|casual/i.test(reply), reply.slice(0, 300));
    assert.ok(!/Formal\s*\(3 o 4 tiempos\)/i.test(reply), reply.slice(0, 400));
    assert.ok(!/Kosher|Navide[nñ]o/i.test(reply), reply.slice(0, 400));
  });

  await test("2. Cliente Alejandro — cierre dice nuestro equipo, no Alejandro asesor", () => {
    const filled = new Set<string>([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Presupuesto (MXN)",
    ]);
    const extracted = emptyExtracted({
      nombre: "Alejandro",
      tipo_evento: "cumpleaños",
      requerimientos_evento: "banquete / taquiza",
      num_invitados: 60,
      direccion_evento: "CDMX",
      fecha_horario: "en 2 meses",
      presupuesto: 80000,
    });
    assert.equal(isReadyForClosing(filled), true);
    const reply = runGuards({
      aiResponse: "Información completa obtenida.",
      extracted,
      filledSet: filled,
      readyForClosing: true,
      currentMessage: "En 2 meses",
    });
    assert.ok(reply.includes("Perfecto, ya tengo todo"));
    assert.ok(reply.includes("nuestro equipo"));
    assert.ok(!/pasar.*a Alejandro/i.test(reply));
    // Servicio único: cierre sobrio sin hub. Paquete multi-servicio sí lleva catálogo (test 69).
    assert.ok(!reply.includes(CATALOG_URL), reply);
    assert.ok(/con gusto te apoyo/i.test(reply), reply);
    // V8.93: cierre sin upsell forzado de alimentos/DJ/mobiliario.
    assert.ok(!/Si quieres sumar/i.test(reply), reply);
  });

  await test("3. 60 invitados no marca presupuesto ni cierra el embudo", () => {
    assert.equal(parsePresupuestoFromText("60"), null);
    assert.equal(parseInvitadosFromText("60"), "60");

    const caps = scanConversationForCaptures([], "60", new Set());
    assert.equal(caps.find((c) => c.label === "Presupuesto (MXN)"), undefined);
    assert.equal(caps.find((c) => c.label === "Número de invitados")?.value, "60");

    const filled = new Set<string>([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
    ]);
    assert.equal(isReadyForClosing(filled), false);
    assert.equal(getNextPendingField(emptyExtracted({ num_invitados: 60 }), filled), "presupuesto");
  });

  await test('4. "Por este medio está bien" — waiver de correo y sin re-preguntar', () => {
    assert.ok(detectEmailRefusal(["Por este medio está bien"]));
    const merged: string[] = [];
    const filled = new Set<string>(["Nombre del cliente"]);
    applyEmailWaiver(filled, merged, ["Por este medio está bien"]);
    assert.ok(filled.has(EMAIL_WAIVED_LABEL));

    const extracted = emptyExtracted({ nombre: "Ana" });
    const reply = runGuards({
      aiResponse: "¿Me das tu correo?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Por este medio está bien",
      emailRefusedThisTurn: true,
      history: [{ role: "assistant", content: "¿A qué correo te lo envío?" }],
    });
    assert.ok(!/correo/i.test(reply) || /seguimos por aquí/i.test(reply));
    assert.ok(/cumpleaños|evento|festejan|tipo/i.test(reply));
  });

  await test("5. Pregunta teléfonos — ventas solo llamada, gerencia con WhatsApp", () => {
    assert.ok(clientAsksPhone("¿Tienen teléfono de ventas?"));
    const phone = buildPhoneAnswer();
    assert.ok(/4008\s*0373/.test(phone));
    assert.ok(/4671\s*0585/.test(phone));
    assert.ok(/solo por l[ií]nea telef[oó]nica/i.test(phone));
    assert.ok(/no WhatsApp/i.test(phone));
    assert.ok(/WhatsApp y por l[ií]nea telef[oó]nica/i.test(phone));

    const filled = new Set(["Nombre del cliente", EMAIL_WAIVED_LABEL, "Tipo de evento"]);
    const reply = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({ nombre: "Luis", tipo_evento: "boda" }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "¿Tienen teléfono? Nadie contesta",
    });
    assert.ok(/4008|4671/.test(reply));
    assert.ok(/no WhatsApp/i.test(reply));
    assert.ok(/WhatsApp y por l[ií]nea telef[oó]nica/i.test(reply));
  });

  await test('6. "No sé aún" en invitados — captura sin re-preguntar invitados', () => {
    const inv = parseInvitadosFromText("No sé aún");
    assert.ok(inv?.includes("Sin definir"));

    const filled = new Set([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    const merged: string[] = [];
    const caps = captureContextualAnswer(
      [{ role: "assistant", content: "¿Más o menos para cuántas personas sería?" }],
      "No sé aún",
      filled
    );
    applyCapturesToCrm(merged, filled, caps);
    assert.ok(filled.has("Número de invitados"));
    assert.equal(getNextPendingField(emptyExtracted(), filled), "fecha");
  });

  await test("7. Boda — recomendaciones mencionan banquete/taquiza y catálogo", () => {
    assert.ok(clientAsksForRecommendations("¿Qué me recomiendas para mi boda?"));
    const reply = buildRecommendationsReply(
      emptyExtracted({ tipo_evento: "boda" }),
      [],
      1,
      "¿Qué me recomiendas?"
    );
    assert.ok(/banquete|taquiza/i.test(reply));
    assert.ok(/bebidas|mobiliario|DJ|iluminaci/i.test(reply));
  });

  await test("8. Secuencia 60 pax + presupuesto 80k — sin contaminar campos", () => {
    const filled = new Set<string>();
    const merged: string[] = [];

    applyCapturesToCrm(merged, filled, scanConversationForCaptures([], "60", filled));
    assert.equal(merged.find((l) => l.includes("invitados"))?.includes("60"), true);
    assert.equal(merged.find((l) => l.includes("Presupuesto")), undefined);

    const capsPres = captureContextualAnswer(
      [{ role: "assistant", content: "¿Tienen algún rango de presupuesto en mente?" }],
      "80000",
      filled
    );
    applyCapturesToCrm(merged, filled, capsPres);
    assert.ok(filled.has("Presupuesto (MXN)"));
    assert.ok(merged.some((l) => /Presupuesto.*80000/i.test(l)));

    const extracted = emptyExtracted({ num_invitados: 60, presupuesto: 80000 });
    assert.notEqual(extracted.presupuesto, extracted.num_invitados);
  });

  await test("9. Resumen largo — sin emojis, servicios reales, no confunde tipo", () => {
    const text = buildResumenClienteLargo(
      emptyExtracted({
        nombre: "Alejandro",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "banquete / taquiza",
        num_invitados: 60,
        direccion_evento: "CDMX",
        fecha_horario: "en 2 meses",
        presupuesto: 80000,
      }),
      [
        "- Nombre del cliente: Alejandro",
        "- Correo (prefiere no compartir): continuar por WhatsApp/chat",
        "- Tipo de evento: cumpleaños",
        "- Requerimientos o servicios: banquete / taquiza",
        "- Número de invitados: 60",
        "- Lugar/dirección del evento: CDMX",
        "- Fecha y horario: en 2 meses",
        "- Presupuesto (MXN): 80000",
      ],
      "cumpleaños busco comida 60 CDMX en 2 meses"
    );
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(text), "contiene emojis");
    assert.ok(text.includes("banquete"));
    assert.ok(/Escala: 60|60 personas/i.test(text), text);
    assert.ok(text.includes("CDMX"));
    assert.ok(!text.includes("Servicios / requerimientos: cumpleaños"));
    assert.ok(/sigue por WhatsApp|no compartió/i.test(text), text);
    assert.ok(text.includes("RESUMEN DE CONVERSACIÓN"));
    assert.ok(text.includes("Qué busca el cliente"));
  });

  await test("10. Integraciones — módulos conectados y features activas", () => {
    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const mirrorSrc = readFileSync(path.join(apiRoot, "src/services/kommoMirror.ts"), "utf8");
    const healthSrc = readFileSync(path.join(apiRoot, "src/routes/health.ts"), "utf8");
    assert.ok(mirrorSrc.includes("deliverLucyOutbound"));
    assert.ok(mirrorSrc.includes("sendWhatsAppDirect"));
    assert.ok(mirrorSrc.includes("sendKommoTalkMessage") || mirrorSrc.includes("sendViaKommoTalk"));
    assert.ok(
      healthSrc.includes("meta_wa_or_kommo_external") || healthSrc.includes("meta_plus_note"),
      "health debe documentar outbound multi-canal"
    );

    const catalog = getCatalogStatus();
    assert.equal(typeof catalog.loaded, "boolean");
    assert.ok(catalog.sources);
    assert.equal(typeof catalog.sources.sheets, "boolean");

    assert.equal(CLOSING_CORE_FIELDS.length, 7);
    assert.ok(LUCY_INTRO.includes("Lucy"));
    assert.ok(isValidRequerimientosValue("banquete"));
    assert.ok(!isValidRequerimientosValue("cumpleaños"));

    assert.equal(clientAsksAboutTeam("Alejandro", "Alejandro"), false);
    assert.equal(clientAsksAboutTeam("¿Quién es Rodrigo?", "María"), true);
    assert.equal(clientAsksAboutTeam("¿Quién es Alejandro?", "María"), true);

    const norm = normalizeAdvisorReferences(
      "Le paso estos datos a Alejandro para que te arme una cotización.",
      "Alejandro"
    );
    assert.ok(norm.includes("nuestro equipo"));

    assert.ok(healthSrc.includes("learning-from-human-chats"));
    assert.ok(healthSrc.includes("learning-cron-keepalive"));
    assert.ok(healthSrc.includes("learning-auto-approve-high-confidence"));
  });

  await test('11. Bakar — "Quiero cotización" NO es nombre', () => {
    assert.equal(isQuoteIntentMessage("Quiero hacer una cotizacion"), true);
    assert.equal(sanitizeDisplayName("Quiero hacer una cotizacion"), null);
    assert.equal(sanitizeDisplayName("Quiero"), null);

    const filled = new Set<string>();
    const caps = captureContextualAnswer([], "Quiero hacer una cotizacion", filled);
    assert.equal(caps.find((c) => c.label === "Nombre del cliente"), undefined);
  });

  await test('12. Bakar — "no" en presupuesto no repite bucle', () => {
    assert.ok(detectPresupuestoRefusal("no"));
    assert.ok(detectPresupuestoRefusal("no no tengo presupuesto, no me brindaron"));
    assert.equal(
      parsePresupuestoFromText("no", { askedField: "presupuesto" }),
      "Sin definir (cliente indicó que no tiene)"
    );

    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
    ]);
    const merged: string[] = [];
    applyPresupuestoWaiver(filled, merged, ["no"]);
    assert.ok(filled.has("Presupuesto (MXN)"));
    assert.equal(isReadyForClosing(filled), true);

    const extracted = emptyExtracted({
      nombre: "Bakar",
      correo: "compras1@scabakar.com",
      tipo_evento: "evento corporativo",
      requerimientos_evento: "show grupo versatil",
      num_invitados: 30,
      direccion_evento: "Club de Golf Mexico, CDMX",
      fecha_horario: "18 de diciembre a las 20:00 horas",
    });
    const reply = runGuards({
      aiResponse: "¿Tienen presupuesto estimado?",
      extracted,
      filledSet: filled,
      readyForClosing: true,
      currentMessage: "no",
      history: [{ role: "assistant", content: "¿Tienen algún presupuesto estimado en mente?" }],
    });
    assert.ok(reply.includes("Perfecto, ya tengo todo") || !/presupuesto/i.test(reply));
  });

  await test("13. Bakar — show de grupo versátil ofrece entretenimiento", () => {
    assert.ok(clientMentionsEntertainment("requerimos un show de grupo versatil"));
    const filled = new Set(["Nombre del cliente", "Correo electrónico"]);
    const extracted = emptyExtracted({ nombre: "Bakar", correo: "compras1@scabakar.com" });
    const msg =
      "requerimos un show de grupo versatil para el dia 18 de diciembre a las 20:00 horas para un grupo de 30 personas";
    const reply = runGuards({
      aiResponse: "¿Qué tipo de evento?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: msg,
      history: [{ role: "assistant", content: "¿Qué servicios te gustaría cotizar?" }],
    });
    assert.ok(/show|animaci|hora\s+loca|entretenimiento|vers[aá]til/i.test(reply), reply.slice(0, 150));
    assert.ok(
      /bodasesor\.com\/catalogos|mande el cat[aá]logo/i.test(reply),
      `show debe incluir catálogo: ${reply.slice(0, 350)}`
    );
  });

  await test("14. Fer A14756 — pista/tarima ofrece orientación de venta", () => {
    assert.ok(clientMentionsPistaTarima("quiero cotizar una pista de baile o tarima"));
    const filled = new Set<string>();
    const extracted = emptyExtracted();
    const reply = runGuards({
      aiResponse: "¿Me regalas tu nombre?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Hola, me gustaría cotizar una pista de baile o tarima para mi evento",
      history: [],
    });
    // A14967: menú de tipos primero (no dump de precios del PDF).
    assert.ok(/pista|tarima/i.test(reply), reply.slice(0, 200));
    assert.ok(/LED|iluminada|vinil|pintada|madera|charol|estilo/i.test(reply), reply.slice(0, 400));
    assert.ok(!/Según el catálogo que ya cargamos/i.test(reply), reply.slice(0, 300));
    // NIVEL 2: no volver a volcar el menú de "¿otro servicio?".
    assert.ok(!/alg[uú]n\s+otro\s+servicio|qu[eé]\s+otros\s+servicios/i.test(reply), reply);
  });

  await test("15. Fer A14756 — 6m x 12m NO es ubicación", () => {
    assert.ok(isDimensionText("Son 50 personas. El espacio es de 6 metros por 12"));
    assert.equal(parseZonaFromText("6 metros por 12"), null);
    assert.equal(parseSpaceDimensions("El espacio es de 6 metros por 12"), "6m x 12m");

    const filled = new Set<string>(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]);
    const merged: string[] = [];
    const caps = [
      ...captureContextualAnswer(
        [{ role: "assistant", content: "¿Más o menos para cuántas personas sería?" }],
        "Son 50 personas. El espacio es de 6 metros por 12",
        filled
      ),
      ...scanConversationForCaptures(
        [{ role: "user", content: "Hola, quiero cotizar una pista de baile o tarima" }],
        "Son 50 personas. El espacio es de 6 metros por 12",
        filled
      ),
    ];
    applyCapturesToCrm(merged, filled, caps);
    assert.ok(merged.some((l) => /invitados.*50/i.test(l)));
    assert.ok(!merged.some((l) => /Lugar\/dirección/i.test(l)));
    assert.ok(
      merged.some((l) => /Requerimientos.*6m x 12m|espacio 6m/i.test(l)) ||
        caps.some((c) => /6m x 12m|espacio/i.test(c.value))
    );
  });

  await test('16. Fer A14756 — presupuesto económico y "gracias" post-cierre', () => {
    assert.equal(parsePresupuestoFromText("Lo más económico posible"), "Opciones económicas (sin monto fijo)");
    assert.ok(detectPresupuestoRefusal("No tengo rango ee comparación"));

    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
    ]);
    const extracted = emptyExtracted({
      nombre: "Fer",
      correo: "ferramlun2206@gmail.com",
      tipo_evento: "cumpleaños",
      requerimientos_evento: "Pista de baile (espacio 6m x 12m)",
      num_invitados: 50,
      fecha_horario: "15 de julio",
    });
    const ecoReply = runGuards({
      aiResponse: "¿Tienen algún rango de presupuesto en mente?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Lo más económico posible",
      history: [{ role: "assistant", content: "¿Tienen algún rango de presupuesto en mente?" }],
    });
    assert.ok(!/rango de presupuesto/i.test(ecoReply), ecoReply.slice(0, 200));
    assert.ok(
      /econ[oó]mic|cierre|ya tengo todo/i.test(ecoReply),
      `debe reconocer presupuesto económico o cerrar: ${ecoReply.slice(0, 200)}`
    );

    const thanksFilled = new Set([...filled, "Presupuesto (MXN)", "Lugar/dirección del evento"]);
    const thanksReply = applyLucyMessageGuards({
      aiResponse: "",
      extracted,
      filledSet: thanksFilled,
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: [{ role: "assistant", content: "Perfecto, ya tengo todo." }],
      currentMessage: "Muchas gracias",
      buildClosing: mockClosing,
    });
    assert.ok(thanksReply.trim().length > 0, "respuesta vacía");
    assert.ok(clientSaysThanks("Muchas gracias"));
    assert.ok(buildPostCierreThanksReply("Fer").includes("Fer"));

    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const mirrorSrc = readFileSync(path.join(apiRoot, "src/services/kommoMirror.ts"), "utf8");
    assert.ok(mirrorSrc.includes("texto vacío"));
  });

  await test("17. Fer A14751 — brunch baby shower, correo, fecha y presupuesto sin bucles", () => {
    assert.equal(isQuoteIntentMessage("Quiero hacer una cotizacion"), true);
    assert.equal(sanitizeDisplayName("Quiero"), null);
    assert.ok(clientMentionsCatering("Brunch/ desayuno para 35 personas"));
    assert.ok(isServiceLabelNotTipoEvento("brunch"));
    assert.equal(parseCorreoFromText("Si fer.barrientost2892@gmail.com"), "fer.barrientost2892@gmail.com");
    assert.equal(parseFechaFromText("Todavía la vamos a definir"), "Sin definir (pendiente)");
    assert.ok(parseFechaFromText("Yo creo que x octubre")?.includes("octubre"));
    assert.equal(
      parsePresupuestoFromText("Tu mándame el presupuesto y si quieres vemos"),
      "Sin definir (cliente pidió que propongamos)"
    );

    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
    ]);
    const extracted = emptyExtracted({
      nombre: "Fer",
      correo: "fer.barrientost2892@gmail.com",
      tipo_evento: "baby shower",
      requerimientos_evento: "Brunch",
      num_invitados: 35,
      direccion_evento: "Jardines del pedregal",
      fecha_horario: "Sin definir (pendiente)",
    });

    const presFilled = new Set(filled);
    const presReply = runGuards({
      aiResponse: "¿Tienen algún rango de presupuesto en mente?",
      extracted,
      filledSet: presFilled,
      readyForClosing: false,
      currentMessage: "Tu mándame el presupuesto y si quieres vemos",
      history: [{ role: "assistant", content: "¿Tienen algún rango de presupuesto en mente?" }],
    });
    assert.ok(!/rango de presupuesto/i.test(presReply), presReply.slice(0, 200));

    const fechaFilled = new Set(filled);
    const fechaAi = "¿Ya hay día definido o siguen viendo opciones?";
    assert.ok(mensajeAsksForFilledField(fechaAi, fechaFilled, extracted), "debe detectar fecha repetida");
    const fechaReply = runGuards({
      aiResponse: fechaAi,
      extracted,
      filledSet: fechaFilled,
      readyForClosing: false,
      currentMessage: "Todavía la vamos a definir",
      history: [{ role: "assistant", content: "¿Ya tienen fecha o todavía la van definiendo?" }],
    });
    if (/fecha|d[ií]a definido/i.test(fechaReply) && !/presupuesto/i.test(fechaReply)) {
      throw new Error(`fechaReply inesperada: ${fechaReply.slice(0, 200)}`);
    }

    const brunchFilled = new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]);
    const brunchReply = runGuards({
      aiResponse: "¿A qué correo te mando la información?",
      extracted: emptyExtracted({ nombre: "Fer", tipo_evento: "baby shower" }),
      filledSet: brunchFilled,
      readyForClosing: false,
      currentMessage: "Brunch/ desayuno para 35 personas",
      history: [{ role: "assistant", content: "¿Qué servicios te gustaría cotizar?" }],
    });
    assert.ok(/brunch|banquete|taquiza|desayuno|alimentos/i.test(brunchReply), brunchReply.slice(0, 200));
    assert.ok(!/correo/i.test(brunchReply), "no debe re-preguntar correo ya capturado");
  });

  await test("18. Verónica A14760 — por aquí sin correo, sin Alejandro, nombre completo", () => {
    assert.ok(detectEmailRefusal(["Si me la pueden mandar por aquí porfa"]));
    assert.equal(sanitizeCrmNombre("Verónica Camarillo"), "Verónica Camarillo");
    assert.equal(sanitizeDisplayName("Verónica Camarillo"), "Verónica");

    const merged: string[] = ["- Nombre del cliente: Verónica"];
    const filled = new Set<string>(["Nombre del cliente"]);
    applyEmailWaiver(filled, merged, ["Si me la pueden mandar por aquí porfa"]);
    assert.ok(filled.has(EMAIL_WAIVED_LABEL));

    const extracted = emptyExtracted({ nombre: "Verónica Camarillo", tipo_evento: "cumpleaños" });
    const reply = runGuards({
      aiResponse:
        "Claro, Verónica. ¿Me podrías compartir tu correo para enviarte la información y que Alejandro te arme la propuesta?",
      extracted,
      filledSet: new Set([...filled, "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "Si me la pueden mandar por aquí porfa",
      emailRefusedThisTurn: true,
      history: [{ role: "assistant", content: "¿A qué correo te lo envío?" }],
    });
    assert.ok(!/correo/i.test(reply), reply.slice(0, 200));
    assert.ok(!/Alejandro/i.test(reply), reply);
    assert.ok(
      /sin problema|este chat|por aqu[ií]|invitados|servicios|armar|fecha|cu[aá]ndo/i.test(reply),
      reply.slice(0, 200)
    );

    const norm = normalizeAdvisorReferences(
      "para que Alejandro te arme la propuesta",
      "Verónica"
    );
    assert.ok(norm.includes("nuestro equipo"));
    assert.ok(!/Alejandro/i.test(norm));
  });

  await test("19. Fer A14751 — no repetir presupuesto tras waiver ni 2+ preguntas", () => {
    const baseFilled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
    ]);
    const extracted = emptyExtracted({
      nombre: "Fer",
      correo: "fer.barrientost2892@gmail.com",
      tipo_evento: "baby shower",
      requerimientos_evento: "Brunch",
      num_invitados: 35,
      direccion_evento: "Jardines del pedregal",
      fecha_horario: "Sin definir (pendiente)",
    });

    const historyAfterRefusal: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "assistant", content: "¿Tienen algún rango de presupuesto en mente?" },
      { role: "user", content: "Tu mándame el presupuesto y si quieres vemos" },
      { role: "assistant", content: "Entendido, sin problema. Nuestro equipo te propone opciones según lo que platicamos." },
    ];

    const filledAfterRefusal = new Set(baseFilled);
    applyPresupuestoWaiver(
      filledAfterRefusal,
      [],
      ["Tu mándame el presupuesto y si quieres vemos"],
      historyAfterRefusal
    );
    assert.ok(filledAfterRefusal.has("Presupuesto (MXN)"));

    const loopReply1 = runGuards({
      aiResponse: "¿Manejan algún presupuesto estimado para el evento?",
      extracted,
      filledSet: new Set(baseFilled),
      readyForClosing: false,
      currentMessage: "ok",
      history: [
        ...historyAfterRefusal,
        { role: "assistant", content: "¿Manejan algún presupuesto estimado para el evento?" },
      ],
    });
    assert.ok(!/presupuesto|rango|estimado/i.test(loopReply1), loopReply1.slice(0, 200));

    const filledLoop = new Set(baseFilled);
    const historyDoubleAsk: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "assistant", content: "¿Tienen algún rango de presupuesto en mente?" },
      { role: "user", content: "..." },
      { role: "assistant", content: "¿Manejan algún presupuesto estimado para el evento?" },
    ];
    assert.equal(countLucyFieldAsks(historyDoubleAsk, "presupuesto"), 2);

    applyPresupuestoWaiver(filledLoop, [], ["..."], historyDoubleAsk);
    assert.ok(filledLoop.has("Presupuesto (MXN)"));

    const loopReply2 = runGuards({
      aiResponse: "¿Tienen idea del presupuesto o prefieren que les propongamos opciones?",
      extracted,
      filledSet: new Set(baseFilled),
      readyForClosing: false,
      currentMessage: "gracias",
      history: historyDoubleAsk,
    });
    assert.ok(!/presupuesto|rango|estimado|inversi/i.test(loopReply2), loopReply2.slice(0, 200));
    assert.ok(
      loopReply2.includes("Perfecto, ya tengo todo") ||
        loopReply2.includes("sin problema") ||
        loopReply2.includes("nuestro equipo"),
      loopReply2.slice(0, 200)
    );
  });

  await test('20. Nayeli A14766 — "tope de 5,000" y "que propongan opciones" se capturan sin 4 preguntas', () => {
    assert.equal(
      parsePresupuestoFromText("Mi tope es de 5,000"),
      "Hasta $5000 MXN"
    );
    assert.ok(detectPresupuestoRefusal("Que me propongan opciones"));
    assert.equal(
      parsePresupuestoFromText("Que me propongan opciones"),
      "Sin definir (cliente pidió que propongamos)"
    );

    const baseFilled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
    ]);
    const extracted = emptyExtracted({
      nombre: "Nayeli",
      correo: "naygt_13@hotmail.com",
      tipo_evento: "primera comunión",
      requerimientos_evento: "Video y fotografía, libro de fotos",
      num_invitados: 40,
      direccion_evento: "Parroquia Santo Domingo de Guzmán, Insurgentes Mixcoac",
      fecha_horario: "Sin definir (pendiente)",
    });

    // Turno 1: responde con monto real ("tope") — debe capturarse de inmediato, sin re-preguntar.
    const filledTurn1 = new Set(baseFilled);
    const historyAsk1: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "assistant", content: "¿Tienen algún rango de presupuesto en mente para la primera comunión?" },
    ];
    const reply1 = runGuards({
      aiResponse: "¿Tienen idea del presupuesto o prefieren que nuestro equipo les proponga opciones?",
      extracted,
      filledSet: filledTurn1,
      readyForClosing: false,
      currentMessage: "Mi tope es de 5,000",
      history: historyAsk1,
    });
    assert.ok(!/rango\s+de\s+presupuesto|presupuesto\s+en\s+mente|idea\s+del\s+presupuesto/i.test(reply1), reply1.slice(0, 200));
    assert.ok(filledTurn1.has("Presupuesto (MXN)"), "debe capturar el tope como presupuesto");

    // Simulación completa del historial real: 2 preguntas ya hechas sin captura previa (peor caso).
    const historyAfterTwoAsks: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "assistant", content: "¿Tienen algún rango de presupuesto en mente para la primera comunión?" },
      { role: "user", content: "Mi tope es de 5,000" },
      { role: "assistant", content: "¿Tienen idea del presupuesto o prefieren que nuestro equipo les proponga opciones?" },
      { role: "user", content: "Que me propongan opciones" },
    ];
    assert.equal(countLucyFieldAsks(historyAfterTwoAsks, "presupuesto"), 2);

    const filledTurn3 = new Set(baseFilled);
    applyPresupuestoWaiver(filledTurn3, [], ["Que me propongan opciones"], historyAfterTwoAsks);
    assert.ok(filledTurn3.has("Presupuesto (MXN)"), "tope de 2 preguntas debe forzar auto-waiver");

    const reply3 = runGuards({
      aiResponse: "¿Tienen algún rango de presupuesto en mente?",
      extracted,
      filledSet: new Set(baseFilled),
      readyForClosing: false,
      currentMessage: "Mo",
      history: historyAfterTwoAsks,
    });
    assert.ok(
      !/rango\s+de\s+presupuesto|presupuesto\s+en\s+mente/i.test(reply3),
      `no debe haber una 3ª pregunta de presupuesto: ${reply3.slice(0, 200)}`
    );
    assert.ok(
      reply3.includes("Perfecto, ya tengo todo") || /nuestro equipo|sin problema/i.test(reply3),
      reply3.slice(0, 200)
    );
  });

  await test('21. Manuel A14770 — "¿algún otro servicio?" no se pregunta para siempre', () => {
    assert.ok(clientDeclinesMoreServices("No"));
    assert.ok(clientDeclinesMoreServices("Solo con eso"));
    assert.ok(clientDeclinesMoreServices("Solo eso"));
    assert.ok(clientDeclinesMoreServices("Ningún otro servicio"));
    assert.ok(clientDeclinesMoreServices("No gracias"));
    assert.ok(!clientDeclinesMoreServices("Animación"));

    const filledReady = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Presupuesto (MXN)",
    ]);
    const extracted = emptyExtracted({
      nombre: "Manuel",
      correo: "arteagamanuel714@gmail.com",
      tipo_evento: "cumpleaños",
      requerimientos_evento: "show en vivo, animación, hora loca, happening, espejos, láser",
      num_invitados: 125,
      direccion_evento: "Naucalpan de Juárez, Edo Mex",
      fecha_horario: "próximo año",
      presupuesto: 12500,
    });
    assert.equal(isReadyForClosing(filledReady), true);

    // Ronda 1: Lucy pregunta "¿algún otro servicio?" por primera vez — se permite.
    const historyFirstAsk: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "assistant",
        content:
          "Para tu evento, manejamos shows en vivo, animación, hora loca, happening, espejos, láser y más opciones de entretenimiento. ¿Qué necesitas para el evento?",
      },
    ];

    // Ronda 2: el cliente ya respondió "No me interesa" y Lucy insiste — debe cerrar, no repetir.
    const historyLoop: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...historyFirstAsk,
      { role: "user", content: "No me interesa" },
      {
        role: "assistant",
        content: "Perfecto. Con el Animación / Hora loca, ¿necesitan algún otro servicio?",
      },
      { role: "user", content: "Fiesta dinámica" },
      {
        role: "assistant",
        content: "Perfecto. Con el show en vivo, animación, hora loca, happening, espejos, láser, ¿necesitan algún otro servicio?",
      },
      { role: "user", content: "Ningún otro servicio" },
      {
        role: "assistant",
        content: "Perfecto. Con el Animación / Hora loca, ¿necesitan algún otro servicio?",
      },
    ];

    const debugLogs: string[] = [];
    const replyNo = runGuards({
      aiResponse: "Perfecto. Con el Animación / Hora loca, ¿necesitan algún otro servicio?",
      extracted,
      filledSet: new Set(filledReady),
      readyForClosing: true,
      currentMessage: "No",
      history: historyLoop,
      debugLogs,
    });
    assert.ok(
      replyNo.includes("Perfecto, ya tengo todo") || replyNo.includes(CATALOG_URL),
      `debe cerrar en vez de repetir: "${replyNo.slice(0, 200)}" | logs: ${debugLogs.join(" > ")}`
    );
    assert.ok(!/alg[uú]n\s+otro\s+servicio/i.test(replyNo), replyNo.slice(0, 200));

    // "Animación" (palabra suelta ya capturada) tampoco debe re-disparar el pitch de venta.
    const replyBareWord = runGuards({
      aiResponse: "¿Qué necesitas para el evento?",
      extracted,
      filledSet: new Set(filledReady),
      readyForClosing: true,
      currentMessage: "Animación",
      history: historyLoop,
    });
    assert.ok(
      !/manejamos shows en vivo, animaci[oó]n, hora loca/i.test(replyBareWord),
      `no debe repetir el pitch de venta: "${replyBareWord.slice(0, 200)}"`
    );

    // Pregunta real (con "?") sobre un servicio sigue permitida aunque ya esté listo para cerrar.
    const replyRealQuestion = runGuards({
      aiResponse: "¿Qué necesitas para el evento?",
      extracted,
      filledSet: new Set(filledReady),
      readyForClosing: true,
      currentMessage: "¿Cómo es eso de los espejos?",
      history: historyLoop,
    });
    assert.ok(replyRealQuestion.trim().length > 0);

    // Post-cierre: "No me interesa" / "No" no deben hacer que Lucy vuelva a
    // preguntar campos ya capturados (zona, tipo de evento, etc.).
    const historyPostCierre: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "assistant",
        content:
          "Perfecto, ya tengo todo. Voy a compartir esta información con nuestro equipo para que te prepare una cotización personalizada. Mientras tanto, aquí tienes nuestro catálogo completo. ¿Te gustaría incluir algo más en la cotización?",
      },
    ];
    const postCierreReply = applyLucyMessageGuards({
      aiResponse: "¿Dónde se llevará a cabo el evento?",
      extracted,
      filledSet: new Set(filledReady),
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: historyPostCierre,
      currentMessage: "No me interesa",
      buildClosing: mockClosing,
    });
    assert.ok(
      !/d[oó]nde\s+se\s+llevar[aá]|qu[eé]\s+tipo\s+de\s+evento/i.test(postCierreReply),
      `no debe repetir zona/tipo de evento post-cierre: "${postCierreReply.slice(0, 200)}"`
    );
    assert.ok(postCierreReply.trim().length > 0);

    // Regresión: aunque getNextPendingField "crea" ver un campo faltante
    // (p.ej. por pérdida de estado en el simulador), sanitizeOutboundMessage
    // NO debe concatenar esa pregunta al ack post-cierre.
    const filledSinZona = new Set(
      [...filledReady].filter((f) => f !== "Lugar/dirección del evento")
    );
    const postCierreVariosNo = applyLucyMessageGuards({
      aiResponse: "¿En qué ciudad sería tu evento? Si tienes la dirección exacta, sería lo ideal.",
      extracted,
      filledSet: filledSinZona,
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: historyPostCierre,
      currentMessage: "No",
      buildClosing: mockClosing,
    });
    assert.ok(
      !/en\s+qu[eé]\s+ciudad|direcci[oó]n\s+exacta|tienen\s+ya\s+el\s+lugar/i.test(postCierreVariosNo),
      `no debe concatenar pregunta de zona tras el ack: "${postCierreVariosNo.slice(0, 200)}"`
    );
    assert.ok(/con gusto|nuestro equipo/i.test(postCierreVariosNo), postCierreVariosNo.slice(0, 200));

    // Repetir 3 veces con "No" — cada llamada reconstruye filledSet fresco
    // (como en el simulador/webhook real) sin "Lugar/dirección del evento".
    // Ninguna respuesta debe concatenar la pregunta de zona.
    for (const msg of ["No", "No", "Gracias"]) {
      const reply = applyLucyMessageGuards({
        aiResponse: "¿En qué ciudad sería tu evento? Si tienes la dirección exacta, sería lo ideal.",
        extracted,
        filledSet: new Set(filledSinZona),
        readyForClosing: true,
        cierreYaEnviado: true,
        emailRefusedThisTurn: false,
        history: historyPostCierre,
        currentMessage: msg,
        buildClosing: mockClosing,
      });
      assert.ok(
        !/en\s+qu[eé]\s+ciudad|direcci[oó]n\s+exacta|tienen\s+ya\s+el\s+lugar|d[oó]nde\s+se\s+llevar[aá]/i.test(reply),
        `"${msg}" no debe concatenar pregunta de zona: "${reply.slice(0, 200)}"`
      );
    }
  });

  await test("22. Manuel A14770 — CRM no se contamina con extracción inestable del turno", () => {
    const mergedLines = [
      "- Nombre del cliente: Manuel",
      "- Correo electrónico: arteagamanuel714@gmail.com",
      "- Tipo de evento: cumpleaños",
      "- Requerimientos o servicios: show en vivo, animación, hora loca, happening, espejos, láser",
      "- Lugar/dirección del evento: Naucalpan de Juárez, Edo Mex",
    ];

    assert.equal(crmStoredValue(mergedLines, "Tipo de evento"), "cumpleaños");
    assert.equal(
      crmStoredValue(mergedLines, "Lugar/dirección del evento"),
      "Naucalpan de Juárez, Edo Mex"
    );
    assert.equal(
      crmStoredValue(mergedLines, "Requerimientos o servicios"),
      "show en vivo, animación, hora loca, happening, espejos, láser"
    );
    assert.equal(crmStoredValue(mergedLines, "Presupuesto (MXN)"), null);

    // Aunque GPT extraiga mal el turno actual ("fiesta dinámica" como tipo_evento,
    // "vivo" como ubicación), el valor ya confirmado en el CRM debe prevalecer.
    const tipoEventoContaminado = "fiesta dinámica";
    const direccionContaminada = "vivo";
    const tipoEventoFinal = crmStoredValue(mergedLines, "Tipo de evento") ?? tipoEventoContaminado;
    const direccionFinal =
      crmStoredValue(mergedLines, "Lugar/dirección del evento") ?? direccionContaminada;
    assert.equal(tipoEventoFinal, "cumpleaños");
    assert.equal(direccionFinal, "Naucalpan de Juárez, Edo Mex");
  });

  await test("23. Detección de notas de voz e imágenes en el payload de Kommo", () => {
    // Notas de voz — variantes reales del webhook de Kommo
    assert.ok(isVoiceNote({ attachment: { type: "voice", link: "https://x/a.ogg" } }));
    assert.ok(isVoiceNote({ attachment: { type: "audio", link: "https://x/a.ogg" } }));
    assert.ok(isVoiceNote({ attachment: { mime_type: "audio/ogg", link: "https://x/a.ogg" } }));
    assert.equal(
      getVoiceNoteUrl({ attachment: { type: "voice", link: "https://x/a.ogg" } }),
      "https://x/a.ogg"
    );
    assert.ok(!isVoiceNote({ text: "hola" }));

    // Imágenes — mismas variantes de estructura que audio, pero tipo picture/image
    assert.ok(isImageMessage({ attachment: { type: "picture", link: "https://x/foto.jpg" } }));
    assert.ok(isImageMessage({ attachment: { type: "image", link: "https://x/foto.jpg" } }));
    assert.ok(isImageMessage({ attachment: { mime_type: "image/jpeg", link: "https://x/foto.jpg" } }));
    assert.ok(
      isImageMessage({
        attachments: [{ type: "picture", url: "https://x/foto.jpg" }],
      })
    );
    assert.ok(!isImageMessage({ text: "hola" }));
    assert.ok(!isImageMessage({ attachment: { type: "voice", link: "https://x/a.ogg" } }));

    assert.equal(
      getImageUrl({ attachment: { type: "picture", link: "https://x/foto.jpg" } }),
      "https://x/foto.jpg"
    );
    assert.equal(
      getImageCaption({ attachment: { type: "picture", link: "https://x/foto.jpg", text: "Así se ve el salón" } }),
      "Así se ve el salón"
    );
    assert.equal(getImageCaption({ attachment: { type: "picture", link: "https://x/foto.jpg" } }), null);

    // Si GPT repite literalmente la anotación interna, un guard debe quitarla
    // antes de que llegue al cliente.
    const leaked = "Qué bonito salón. [Imagen adjunta: salón de eventos con jardín y carpa blanca] ¿Es ahí tu evento?";
    const cleaned = stripImageAnnotation(leaked);
    assert.ok(!/imagen adjunta/i.test(cleaned), cleaned);
    assert.ok(/qué bonito salón/i.test(cleaned));
  });

  await test("24. Sinónimos de captura (del prompt de Opus) — presupuesto, invitados, correo, zona", () => {
    // Presupuesto: montos por persona
    assert.equal(parsePresupuestoFromText("$500 por persona"), "$500 MXN por persona");
    assert.equal(parsePresupuestoFromText("500 por cabeza"), "$500 MXN por persona");
    assert.equal(parsePresupuestoFromText("unos 600 pp"), "$600 MXN por persona");
    assert.equal(parsePresupuestoFromText("500 x persona"), "$500 MXN por persona");

    // Presupuesto: "poquito" / "flexible" / "lo que sea necesario"
    assert.equal(parsePresupuestoFromText("poquito"), "Flexible (sin monto fijo)");
    assert.equal(parsePresupuestoFromText("flexible"), "Flexible (sin monto fijo)");
    assert.equal(parsePresupuestoFromText("lo que sea necesario"), "Flexible (sin monto fijo)");

    // Invitados: "gente", "unos N", "más o menos N", "entre X y Y" (mayor)
    assert.equal(parseInvitadosFromText("250 gentes"), "250");
    assert.equal(parseInvitadosFromText("como 60 cabezas"), "60");
    assert.equal(parseInvitadosFromText("unos 40"), "40");
    assert.equal(parseInvitadosFromText("más o menos 120"), "120");
    assert.equal(parseInvitadosFromText("aproximadamente 80"), "80");
    assert.equal(parseInvitadosFromText("entre 90 y 100"), "100");

    // Correo dictado por voz ("arroba", "punto")
    assert.equal(parseCorreoFromText("mi correo es ana arroba gmail punto com"), "ana@gmail.com");
    assert.equal(
      parseCorreoFromText("es pedro guion bajo lopez arroba hotmail punto com"),
      "pedro_lopez@hotmail.com"
    );
    // Correo normal sigue funcionando igual
    assert.equal(parseCorreoFromText("mi correo es test@gmail.com"), "test@gmail.com");

    // Zona: "en el Estado de México" ya no se descarta por el artículo
    assert.equal(parseZonaFromText("El evento es en el Estado de México"), "Estado de México");
    assert.equal(parseZonaFromText("Va a ser en la colonia Roma"), "colonia Roma");
    assert.equal(parseZonaFromText("Es en delegación Coyoacán"), "Coyoacán");
    assert.equal(parseZonaFromText("Va a ser en la alcaldía Miguel Hidalgo"), "alcaldía Miguel Hidalgo");
    // Los casos que SÍ deben seguir descartándose:
    assert.equal(parseZonaFromText("en total serían 50 personas"), null);
    assert.equal(parseZonaFromText("es solo para mi familia"), null);
  });

  await test("25. Lorena A14777 — Coffee Break se ofrece, resumen no pierde datos, catálogo no vacía la respuesta", () => {
    // Bug 1: "Coffee Break" no disparaba la orientación de venta.
    assert.ok(clientMentionsCatering("Hola, me interesa cotizar: Coffee Break para Eventos Corporativos"));
    assert.ok(clientMentionsCatering("barra de café para el evento"));

    const filledInicial = new Set<string>();
    const extractedInicial = emptyExtracted();
    const reply1 = runGuards({
      aiResponse: "¿Me regalas tu nombre?",
      extracted: extractedInicial,
      filledSet: filledInicial,
      readyForClosing: false,
      currentMessage: "Hola, me interesa cotizar: Coffee Break para Eventos Corporativos",
      history: [],
    });
    assert.ok(/coffee\s*break/i.test(reply1), `debe confirmar coffee break, no ignorarlo: ${reply1.slice(0, 200)}`);

    // Bug 2: el resumen (1048786) perdía info porque priorizaba la extracción
    // inestable del turno sobre el valor ya guardado en el CRM.
    const mergedLinesTurno1 = [
      "- Nombre del cliente: Lorena",
      "- Tipo de evento: corporativo",
      "- Requerimientos o servicios: Coffee Break para Eventos Corporativos",
    ];
    const extractedTurno2 = emptyExtracted({
      nombre: "Lorena",
      tipo_evento: "corporativo",
      requerimientos_evento: "Coffee Break", // GPT re-extrajo una versión más corta este turno
      num_invitados: 150,
    });
    const resumen = buildResumenClienteLargo(extractedTurno2, mergedLinesTurno1, "coffee break para eventos corporativos 150 personas");
    assert.ok(
      resumen.includes("Coffee Break para Eventos Corporativos"),
      `no debe perder el detalle ya guardado: ${resumen}`
    );
    assert.ok(
      resumen.includes("Qué busca el cliente") || resumen.includes("Servicios:"),
      `debe resumir qué busca el cliente: ${resumen}`
    );
    assert.ok(!/servicios\s*\/\s*requerimientos/i.test(resumen), resumen);

    // Bug 3: al reconocer y mandar el catálogo en el MISMO párrafo, se borraba
    // toda la respuesta (filtrado por línea completa) dejando un mensaje vacío
    // que caía al fallback "Gracias por tu mensaje. Nuestro equipo te atiende en breve."
    const mezclado =
      "No hay ningún problema, ya anoté que el evento es en Cuernavaca. Mientras tanto, aquí tienes nuestro catálogo completo: https://bodasesor.com/catalogos. ¿Hay algo más en lo que te pueda ayudar?";
    const limpio = stripCatalogBlockShared(mezclado);
    assert.ok(limpio.trim().length > 0, "no debe quedar vacío");
    assert.ok(!/cdn\.shopify\.com/i.test(limpio), limpio);
    assert.ok(/no hay ning[uú]n problema/i.test(limpio), limpio);
    assert.ok(/cuernavaca/i.test(limpio), limpio);
    assert.ok(/algo m[aá]s en lo que te pueda ayudar/i.test(limpio), limpio);

    // Bug 4 (encontrado al reproducir en vivo): "Eventos Corporativos" en
    // plural no se reconocía como tipo de evento — solo la forma singular.
    // Esto causaba que, si GPT no lo extraía esa vez, se preguntara
    // "¿qué tipo de evento es?" indefinidamente pese a ya estar en el mensaje.
    assert.equal(parseTipoEventoFromText("Coffee Break para Eventos Corporativos"), "evento corporativo");
    assert.equal(parseTipoEventoFromText("es para un evento corporativo"), "evento corporativo");
    assert.equal(parseTipoEventoFromText("es un bautizo"), "bautizo");

    // Bug 5 (encontrado al verificar en vivo el fix de Lorena): normalizeAdvisorReferences
    // duplicaba "equipo" porque el flag /i hacía que [A-ZÁÉÍÓÚÑ] matcheara "nuestro"
    // (minúscula) como si fuera un nombre propio, dejando "nuestro equipo equipo".
    const dup1 = normalizeAdvisorReferences(
      "Perfecto, voy a pasar esta información a nuestro equipo para que te prepare una cotización.",
      "Lorena"
    );
    assert.ok(!/equipo\s+equipo/i.test(dup1), dup1);
    assert.ok(dup1.includes("nuestro equipo"), dup1);

    const dup2 = normalizeAdvisorReferences(
      "Con gusto, le paso estos datos a nuestro equipo para la cotización.",
      "Lorena"
    );
    assert.ok(!/equipo\s+equipo/i.test(dup2), dup2);
  });

  await test("26. Bugs Kommo — proveedor/cliente, correo propio, nombre completo, cierre", () => {
    const cafeText =
      "Solicitud para cotización de café gourmet para evento corporativo Saint-Gobain";
    assert.equal(resolveTipoContacto("proveedor", cafeText), "cliente");

    assert.ok(isOwnCompanyEmail("capybaraeventos@gmail.com"));
    assert.equal(filterClientEmail("capybaraeventos@gmail.com"), null);
    assert.equal(parseCorreoFromText("capybaraeventos@gmail.com"), null);
    assert.equal(
      parseCorreoFromText("Mi correo es Gresia.Perez@saint-gobain.com"),
      "Gresia.Perez@saint-gobain.com"
    );

    assert.ok(isNombreMoreComplete("Gresia Perez", "Gresia"));
    assert.ok(!isNombreMoreComplete("Gresia", "Gresia Perez"));
    assert.equal(pickBetterNombre("Gresia", "Gresia Perez"), "Gresia Perez");

    assert.ok(clientAsksIfCompanyEmailCorrect("¿es capybaraeventos@gmail.com el correo correcto?"));
    assert.ok(buildCompanyEmailConfirmReply().includes("capybaraeventos"));

    const hist: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "assistant", content: `${CLOSING_SIGNATURE} Aquí está el catálogo.` },
    ];
    assert.ok(detectCierreEnviado(hist));
    assert.ok(detectCierreEnviado([], `${CLOSING_SIGNATURE} catálogo`));

    const emailGuard = runGuards({
      aiResponse: "¿A qué correo te lo envío?",
      extracted: emptyExtracted(),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "¿es capybaraeventos@gmail.com el correo correcto?",
    });
    assert.ok(/capybaraeventos|bodasesor/i.test(emailGuard), emailGuard);
    assert.ok(/tu correo|compartes/i.test(emailGuard), emailGuard);
  });

  await test("27. Webhook/imagen — sin duplicar Vision ni notas", () => {
    resetWebhookDedupForTests();
    resetImageAnalysisCacheForTests();

    const msg = {
      id: "msg-abc-123",
      chat_id: "chat-1",
      entity_id: 999,
      type: "incoming",
      author: { type: "external" },
      attachment: { type: "picture", link: "https://amojo.kommo.com/attachments/receipt.jpg" },
    };

    assert.ok(isIncomingClientMessage(msg));
    assert.equal(webhookMessageKey(msg), "id:msg-abc-123");
    assert.ok(!isDuplicateWebhookMessage("id:msg-abc-123"));
    markWebhookMessageProcessed("id:msg-abc-123");
    assert.ok(isDuplicateWebhookMessage("id:msg-abc-123"));

    assert.ok(!isIncomingClientMessage({ type: "outgoing", author: { type: "internal" } }));

    const imgUrl = "https://amojo.kommo.com/attachments/receipt.jpg";
    cacheImageDescription(imgUrl, "Comprobante de pago por $7,975.00");
    assert.equal(getCachedImageDescription(imgUrl), "Comprobante de pago por $7,975.00");

    const fallbackKey = webhookMessageKey({
      chat_id: "chat-2",
      attachment: { type: "picture", link: imgUrl },
    });
    assert.equal(fallbackKey, `media:chat-2:${imgUrl}`);
  });

  await test("27b. Webhook Incoming Leads — payload Kommo oficial + unsorted", () => {
    const official = {
      add: [
        {
          id: "9402b05b-91c0-4daa-a8a6-34b411881f4c",
          chat_id: "dfa7f0e5-79bb-4b3d-9647-2f492075e419",
          talk_id: "172",
          text: "Hi!",
          entity_type: "lead",
          element_id: "50296276",
          type: "incoming",
          author: { type: "external" },
          origin: "waba",
        },
      ],
    };
    const msg = extractKommoIncomingMessage(official);
    assert.ok(msg);
    assert.equal(extractKommoEntityId(msg), "50296276");
    assert.equal(extractKommoChatId(msg), "dfa7f0e5-79bb-4b3d-9647-2f492075e419");
    assert.equal(extractKommoMessageText(msg), "Hi!");
    assert.ok(isIncomingClientMessage(msg));

    const nested = {
      message: {
        add: [
          {
            chat_id: "chat-9",
            entity_id: 111,
            type: "incoming",
            message: { type: "text", text: "Quiero cotizar" },
          },
        ],
      },
    };
    const nestedMsg = extractKommoIncomingMessage(nested);
    assert.equal(extractKommoMessageText(nestedMsg), "Quiero cotizar");
    assert.equal(extractKommoEntityId(nestedMsg), 111);

    const formStyle = {
      message: {
        add: {
          "0": {
            chat_id: "c1",
            element_id: "99",
            text: "Hola",
            type: "incoming",
          },
        },
      },
    };
    const formMsg = extractKommoIncomingMessage(formStyle);
    assert.equal(extractKommoChatId(formMsg), "c1");
    assert.equal(extractKommoEntityId(formMsg), "99");

    const unsorted = extractKommoUnsortedAdd({
      unsorted: { add: [{ uid: "abc", category: "chats", lead_id: "26900111" }] },
    });
    assert.equal(unsorted?.["uid"], "abc");
    assert.ok(isChatUnsortedCategory("chats"));
    assert.ok(!isChatUnsortedCategory("forms"));

    assert.ok(lucyDebeResponder(72336719, []));
    assert.ok(lucyDebeResponder(80344783, []), "Datos e Intereses");
    assert.ok(lucyDebeResponder(105583415, []), "No Contesta");
    assert.ok(lucyDebeResponder(0, []), "Incoming unsorted sin status");
    assert.equal(lucyDebeResponder(99999999, []), false, "otro filtro: Lucy no habla");
    assert.equal(lucyDebeResponder(105583875, []), false, "Humano Trabaja: silencio");
    assert.equal(lucyDebeResponder(72336827, []), false, "Cotización: silencio");
    assert.equal(lucyDebeResponder(143, []), false, "Perdido: silencio");
    assert.equal(lucyDebeResponder(72336719, ["lucy_desactivada"]), false);

    const now = Date.now();
    assert.ok(isWithinLookback(Math.floor((now - 2 * 3600 * 1000) / 1000), 15 * 3600 * 1000, now));
    assert.ok(!isWithinLookback(Math.floor((now - 20 * 3600 * 1000) / 1000), 15 * 3600 * 1000, now));
  });

  await test("28. Lucy V7 — pedido/entrega, número ambiguo, orden fecha→ubicación→correo", () => {
    assert.equal(detectModoServicio("quiero 50 rollos para llevar"), "pedido_entrega");
    assert.equal(
      detectModoServicio("Solo quiero 50 rollos de sushi y que me los dejen en mi casa, ¿cuánto?"),
      "pedido_entrega"
    );
    assert.equal(detectModoServicio("barra de sushi montada en el evento"), "servicio_montado");
    assert.ok(needsModoServicioClarification("necesito 50 rollos de sushi", null));
    assert.equal(parseInvitadosFromText("5"), null);
    assert.equal(parseInvitadosFromText("el 5"), null);
    assert.equal(parseInvitadosFromText("150 personas"), "150");

    const filled = new Set([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    assert.equal(getNextPendingField(emptyExtracted(), filled), "invitados");

    const pedidoMsg =
      "Solo quiero 50 rollos de sushi y que me los dejen en mi casa, ¿cuánto?";
    const pedidoEx = emptyExtracted();
    const pedidoReply = runGuards({
      aiResponse: "Sí, la barra de sushi inicia en $280 por persona con chefs en sitio.",
      extracted: pedidoEx,
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage: pedidoMsg,
      forceFirstPresentation: true,
    });
    assert.equal(pedidoEx.modo_servicio, "pedido_entrega");
    assert.ok(/pedido\/entrega|domicilio|entrega/i.test(pedidoReply), pedidoReply);
    assert.ok(/nuestro equipo|cotizaci[oó]n exacta/i.test(pedidoReply), pedidoReply);
    assert.ok(!/por persona|chefs en sitio|montaje de barra/i.test(pedidoReply), pedidoReply);
    assert.ok(/lucy|bodasesor/i.test(pedidoReply), pedidoReply);
  });

  await test("29. Replit — transiciones, anti-robot, servicios sin precio consultivos", () => {
    const hist: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "assistant", content: "Perfecto. ¿A qué correo te lo envío?" },
    ];
    const t1 = pickTransition(hist);
    assert.notEqual(t1, "Perfecto.", t1);

    const stripped = stripRobotAcknowledgments(
      "Perfecto, Pelene. Ya tengo tu correo. ¿Más o menos para cuántas personas sería?"
    );
    assert.ok(!/ya\s+tengo\s+tu\s+correo/i.test(stripped), stripped);
    assert.ok(/personas/i.test(stripped), stripped);

    const dj = buildConsultativeNoPriceReply("¿Cuánto cuesta el DJ?");
    assert.ok(dj && /DJ/i.test(dj) && /nuestro equipo/i.test(dj) && dj.includes("?"), dj ?? "");

    const carpa = buildConsultativeNoPriceReply("necesito carpas para el jardín");
    assert.ok(
      carpa &&
        /carpas?/i.test(carpa) &&
        /blancas?/i.test(carpa) &&
        /negras?/i.test(carpa) &&
        /transparentes?/i.test(carpa) &&
        /domo/i.test(carpa),
      carpa ?? ""
    );
    assert.ok(!/Cathedral|Catedral|Pirámide|Planas/i.test(carpa ?? ""), carpa ?? "");

    const priceGuard = runGuards({
      aiResponse: "El DJ cuesta $5,000.",
      extracted: emptyExtracted({ nombre: "Ana" }),
      filledSet: new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "¿Cuánto cuesta el DJ?",
    });
    assert.ok(/DJ/i.test(priceGuard), priceGuard);
    assert.ok(!/\$\s*5,?000/.test(priceGuard), priceGuard);
    assert.ok(/nuestro equipo/i.test(priceGuard), priceGuard);
  });

  await test("30. Asesor Alejandro + sanitización datos externos (Kommo/CRM)", () => {
    assert.equal(getAdvisorName(), "Alejandro");

    const rodrigoNorm = normalizeAdvisorReferences(
      "Perfecto, ya tengo todo. Le paso estos datos a Rodrigo para que te arme una cotización.",
      "María"
    );
    assert.ok(!/Rodrigo/i.test(rodrigoNorm), rodrigoNorm);
    assert.ok(/nuestro equipo/i.test(rodrigoNorm), rodrigoNorm);

    const dirtyCrm = sanitizeKommoCrmLines([
      "- Nombre del cliente: Quiero hacer una cotización",
      "- Correo electrónico: capybaraeventos@gmail.com",
      "- Lugar/dirección del evento: 6m x 12m",
      "- Tipo de evento: boda",
    ]);
    assert.equal(dirtyCrm.length, 1);
    assert.ok(/boda/i.test(dirtyCrm[0] ?? ""));

    const clean = sanitizeExtractedFromExternal(
      emptyExtracted({
        tipo_contacto: "proveedor",
        correo: "bodasesor@gmail.com",
        nombre: "Quiero cotizar",
        direccion_evento: "8m x 10m",
      }),
      "Solicitud de cotización de café para evento corporativo Saint-Gobain"
    );
    assert.equal(clean.tipo_contacto, "cliente");
    assert.equal(clean.correo, null);
    assert.equal(clean.nombre, null);
    assert.equal(clean.direccion_evento, null);
    assert.ok(LEGACY_ADVISOR_NAMES.includes("Rodrigo"));
  });

  await test("31. A14786 — cliente Alejandro: saludo correcto, no confundir con asesor", () => {
    assert.equal(clientAsksAboutTeam("Alejandro!", null), false);
    assert.equal(clientAsksAboutTeam("Alejandro!", "María"), false);

    const correoQ = buildCorreoQuestion("Alejandro", [], 14786);
    assert.ok(/Mucho gusto,\s+Alejandro/i.test(correoQ), correoQ);
    assert.ok(!/Mucho gusto,\s+nuestro equipo/i.test(correoQ), correoQ);

    const norm = normalizeAdvisorReferences(
      "Mucho gusto, Alejandro. ¿A qué correo te envío la info para que nuestro equipo te arme la propuesta?",
      "Alejandro"
    );
    assert.ok(/Mucho gusto,\s+Alejandro/i.test(norm), norm);
    assert.ok(/nuestro equipo te arme/i.test(norm), norm);

    assert.ok(isStaffAdvisorName("Rodrigo"));
    assert.ok(!isValidRequerimientosValue("bautizo"));
    assert.ok(isValidRequerimientosValue("servicio completo"));

    // A15164: Rodrigo/Alejandro son nombres de cliente válidos — no purgar del CRM.
    const dirty = sanitizeKommoCrmLines([
      "- Nombre del cliente: Rodrigo",
      "- Tipo de evento: bautizo",
      "- Requerimientos o servicios: bautizo",
    ]);
    assert.equal(dirty.length, 2);
    assert.ok(dirty.some((l) => /Nombre del cliente:\s*Rodrigo/i.test(l)));
    assert.ok(dirty.some((l) => /Tipo de evento:\s*bautizo/i.test(l)));
    assert.ok(!dirty.some((l) => /Requerimientos/i.test(l)));

    const leaked =
      "Perfecto. Información completa obtenida.\n\nDATOS DEL CLIENTE:\n- Nombre: Alejandro";
    const clean = stripInternalCrmBlock(leaked);
    assert.ok(!/DATOS DEL CLIENTE/i.test(clean));
    assert.ok(/^Perfecto\./i.test(clean));

    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Número de invitados",
      "Presupuesto (MXN)",
    ]);
    const closeReply = runGuards({
      aiResponse:
        "Información completa obtenida. DATOS DEL CLIENTE:\n- Nombre: Alejandro\n\n¿Te interesa algo más?",
      extracted: emptyExtracted({ nombre: "Alejandro", tipo_evento: "bautizo", requerimientos_evento: "servicio completo" }),
      filledSet: filled,
      readyForClosing: true,
      currentMessage: "Estamos cotizando apenas",
    });
    assert.ok(closeReply.includes(CLOSING_SIGNATURE), closeReply);
    assert.ok(!/DATOS DEL CLIENTE/i.test(closeReply), closeReply);
    assert.ok(!/Información completa obtenida/i.test(closeReply), closeReply);
  });

  await test("32. Batería 20 — ubicación, italiano, expo, número ambiguo", () => {
    assert.ok(clientAsksLocation("¿Dónde se ubican?"));
    assert.ok(clientMentionsItalianTheme("fiesta temática de mafia italiana"));
    assert.ok(buildLocationAnswer().includes("república"));
    assert.equal(parseTipoEventoFromText("stand de café para una expo"), "evento corporativo");
    assert.equal(parseZonaFromText("en Expo Santa Fe"), "Expo Santa Fe");
    assert.equal(sanitizeDisplayName("el 5"), null);

    const locFirst = buildFirstInteractionMessage(
      {
        extracted: emptyExtracted(),
        filledSet: new Set(),
        history: [],
        currentMessage: "¿Dónde se ubican?",
      },
      true
    );
    assert.ok(/CDMX|Ciudad de México|república/i.test(locFirst), locFirst);
    assert.ok(/llamas|nombre/i.test(locFirst), locFirst);

    const ambig = runGuards({
      aiResponse: "¿A qué correo te lo envío?",
      extracted: emptyExtracted({ tipo_evento: "cumpleaños" }),
      filledSet: new Set(["Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "el 5",
      history: [
        { role: "user", content: "quiero cotizar un cumpleaños" },
        { role: "assistant", content: "¿Cómo te llamas?" },
      ],
    });
    assert.ok(/invitados|día\s*5|fecha/i.test(ambig), ambig);

    const expoCaptures = scanConversationForCaptures(
      [],
      "Necesito un stand de café para una expo, 200 personas por día, en Expo Santa Fe.",
      new Set()
    );
    assert.ok(
      expoCaptures.some((c) => c.label === "Tipo de evento" && /corporativo/i.test(c.value)),
      JSON.stringify(expoCaptures)
    );
    assert.ok(
      expoCaptures.some((c) => c.label === "Número de invitados" && c.value === "200"),
      JSON.stringify(expoCaptures)
    );

    const itRec = buildRecommendationsReply(
      emptyExtracted(),
      [],
      1,
      "Vamos a ver el partido de la selección de Italia, ¿qué me recomiendas de comida?"
    );
    assert.ok(/pasta|pizza|italian/i.test(itRec), itRec);
  });

  await test("33. Nombre persiste desde historial y waiver presupuesto directo", () => {
    assert.ok(detectPresupuestoRefusal("aún no sé cuánto"));

    const hist: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "user", content: "Hola, quiero banquete para mi boda" },
      { role: "assistant", content: "¿Cómo te llamas?" },
      { role: "user", content: "Elena" },
      { role: "assistant", content: "Mucho gusto, Elena. ¿A qué correo te lo envío?" },
      { role: "user", content: "elena@test.com" },
    ];
    assert.equal(recoverClienteNombreFromHistory(hist), "Elena");

    const nombreCaptures = scanConversationForCaptures(hist, "100 personas", new Set());
    assert.ok(
      nombreCaptures.some((c) => c.label === "Nombre del cliente" && c.value === "Elena"),
      JSON.stringify(nombreCaptures)
    );

    const logs: string[] = [];
    const presWaiver = runGuards({
      aiResponse: "¿Cómo te llamas?",
      extracted: emptyExtracted({ nombre: "Mario", num_invitados: 60 }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
        "Lugar/dirección del evento",
        "Fecha y horario",
      ]),
      readyForClosing: false,
      currentMessage: "aún no sé cuánto",
      history: hist,
      debugLogs: logs,
    });
    assert.ok(!/c[oó]mo\s+te\s+llamas/i.test(presWaiver), `${presWaiver} | logs: ${logs.join("; ")}`);
    assert.ok(/definir|propong|equipo/i.test(presWaiver), presWaiver);
  });

  await test("34. Catálogo — sin menú hardcodeado; datos del Sheet", () => {
    assert.ok(clientAsksServiceInfo("Quiero información sobre la barra de pizzas"));
    assert.ok(responseLooksLikeGenericCateringMenu(
      "Sí, manejamos catering para eventos. Estas son las opciones más pedidas:\n\n¿Cuál te interesa?"
    ));

    const genericMenu =
      "Sí, manejamos catering para eventos. Estas son las opciones más pedidas:\n\n• Taquiza\n\n¿Cuál te interesa? Con eso te paso precios";
    const injected = injectCatalogCateringIfAsked(
      "quiero cotizar banquete para mi boda",
      genericMenu
    );
    assert.ok(!responseLooksLikeGenericCateringMenu(injected) || injected !== genericMenu, injected);

    const notFound = buildCatalogNotFoundAnswer("Barra de pizzas");
    assert.ok(/anoto|equipo/i.test(notFound), notFound);

    const promptBlock = formatServiceDataForPrompt("taquiza");
    if (promptBlock) {
      assert.ok(/DATOS DEL SERVICIO/i.test(promptBlock), promptBlock);
      assert.ok(/taquiza/i.test(promptBlock), promptBlock);
    }
  });

  await test('35. Jesús — renta de letras fuera de catálogo, "no gracias" sin bucle', () => {
    assert.equal(parsePrimaryService("quiero renta de letras"), "Renta de letras");
    assert.ok(isServiceRelatedMessage("renta de letra XV"));
    assert.ok(clientDeclinesMoreServices("solo ese"));
    assert.ok(clientDeclinesMoreServices("es todo"));
    assert.ok(clientDeclinesMoreServices("con eso"));
    assert.ok(clientDeclinesMoreServices("por ahora no"));
    assert.ok(clientDeclinesMoreServices("ninguna"));

    const filledPartial = new Set([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    const extracted = emptyExtracted({
      nombre: "Jesús",
      tipo_evento: "xv años",
      requerimientos_evento: "renta de letras",
    });

    const historyAfterFollowUp: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "assistant",
        content:
          "Sí, podemos ayudarte con *renta de letras*. Lo confirmo con nuestro equipo para darte descripción, precio e inclusiones exactas y lo anoto en tu solicitud.",
      },
      {
        role: "assistant",
        content: "Perfecto. Con el renta de letras, ¿necesitan algún otro servicio?",
      },
    ];

    const replyNoGracias = runGuards({
      aiResponse: "Perfecto. Con la renta de la letra XV, ¿necesitan algún otro servicio?",
      extracted,
      filledSet: new Set(filledPartial),
      readyForClosing: false,
      currentMessage: "no gracias",
      history: historyAfterFollowUp,
    });
    assert.ok(!/alg[uú]n\s+otro\s+servicio|otros\s+servicios/i.test(replyNoGracias), replyNoGracias);
    assert.ok(
      /invitados|ciudad|fecha|presupuesto|d[oó]nde|ubicaci|sal[oó]n|d[ií]a|hora|cu[aá]ndo|definiendo/i.test(
        replyNoGracias
      ),
      `debe pedir siguiente dato: "${replyNoGracias.slice(0, 200)}"`
    );

    const filledReady = new Set([
      ...filledPartial,
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Presupuesto (MXN)",
    ]);
    const extractedReady = {
      ...extracted,
      num_invitados: 80,
      direccion_evento: "CDMX",
      fecha_horario: "agosto",
      presupuesto: 50000,
    };

    const replyClose = runGuards({
      aiResponse: "Perfecto. Con las letras, ¿necesitan algún otro servicio?",
      extracted: extractedReady,
      filledSet: new Set(filledReady),
      readyForClosing: true,
      currentMessage: "ninguno",
      history: historyAfterFollowUp,
    });
    assert.ok(
      replyClose.includes("Perfecto, ya tengo todo") || replyClose.includes(CATALOG_URL),
      `debe cerrar: "${replyClose.slice(0, 200)}"`
    );
    assert.ok(!/alg[uú]n\s+otro\s+servicio/i.test(replyClose), replyClose);

    const historyLoop: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "assistant",
        content: "Además del renta de letras, ¿te gustaría cotizar algún otro servicio?",
      },
    ];
    const replyRepeat = runGuards({
      aiResponse: "Además de la renta de la letra XV, ¿te gustaría cotizar algún otro servicio?",
      extracted,
      filledSet: new Set(filledPartial),
      readyForClosing: false,
      currentMessage: "renta de letras para mis XV",
      history: historyLoop,
    });
    assert.ok(
      !/alg[uú]n\s+otro\s+servicio|te\s+gustar[ií]a\s+cotizar\s+alg[uú]n\s+otro/i.test(replyRepeat),
      `no debe repetir follow-up: "${replyRepeat.slice(0, 200)}"`
    );
  });

  await test("36. Modelo 3 niveles — Sheet, evento sin Sheet, solicitud especial", () => {
    assert.ok(SERVICE_KNOWLEDGE_GOLDEN_RULE.includes("no esté en el catálogo"));
    const catalogStatus = getCatalogStatus();
    if (catalogStatus.rowCount > 0) {
      assert.equal(classifyServiceKnowledgeLevel("taquiza"), 1);
    }
    assert.equal(classifyServiceKnowledgeLevel("renta de letras"), 2);
    assert.equal(classifyServiceKnowledgeLevel("valet parking para mi boda"), 2);
    assert.equal(classifyServiceKnowledgeLevel("quiero seguro de auto"), 3);

    const level2 = getServiceKnowledge("renta de letras");
    assert.ok(level2);
    assert.equal(level2!.level, 2);
    assert.ok(/anoto/i.test(level2!.guardAck), level2!.guardAck);
    assert.ok(/NIVEL 2/i.test(level2!.promptBlock), level2!.promptBlock);

    const level3 = getServiceKnowledge("necesito seguro de auto para el evento");
    assert.ok(level3);
    assert.equal(level3!.level, 3);
    assert.ok(/solicitud especial/i.test(level3!.guardAck), level3!.guardAck);

    assert.ok(/anoto/i.test(buildLevel2Ack("pirotecnia fría")));
    assert.ok(/disponibilidad/i.test(buildLevel3Ack("seguro de auto")));

    const filledPartial = new Set([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
    ]);
    const extracted = emptyExtracted({
      nombre: "Jesús",
      tipo_evento: "xv años",
    });
    const reply = runGuards({
      aiResponse: "¿Qué servicios te gustaría cotizar?",
      extracted,
      filledSet: new Set(filledPartial),
      readyForClosing: false,
      currentMessage: "quiero renta de letras",
      history: [{ role: "assistant", content: "¿Qué tipo de celebración festejan?" }],
    });
    assert.ok(/anoto|renta de letras|letras/i.test(reply), reply.slice(0, 250));
    assert.ok(!/alg[uú]n\s+otro\s+servicio/i.test(reply), reply);
    assert.ok(
      /invitados|ciudad|fecha|presupuesto|d[oó]nde|ubicaci|sal[oó]n|d[ií]a|hora|cu[aá]ndo|definiendo|ser[ií]a el evento/i.test(
        reply
      ),
      reply.slice(0, 250)
    );
  });

  await test("37. Jerarquía catálogo — categoría / servicio / nivel", () => {
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye"',
      '"Taquiza","Solo Alimentos","$300.00","$9,000.00","TRUE","5 guisados"',
      '"Taquiza","Premium","$450.00","$9,000.00","TRUE","7 guisados"',
      '"Banquete 4 tiempos","Basico","$500.00","$15,000.00","TRUE","3 tiempos menu"',
      '"Banquete 4 tiempos","Premium","$750.00","$15,000.00","TRUE","4 tiempos menu"',
      '"Barra de pizzas","Basico","$320.00","$8,000.00","TRUE","pizzas variadas"',
    ].join("\n");

    const rows = parseSheetCatalogCsv(csv);
    assert.equal(rows.length, 5);
    assert.equal(rows[0]!.servicio, "Taquiza");
    assert.equal(rows[0]!.nivel, "Solo Alimentos");
    assert.equal(rows[0]!.categoria, "Alimentos");
    assert.equal(formatCatalogRowLabel(rows[0]!), "Taquiza — Solo Alimentos");
    assert.equal(deriveCatalogCategory("Barra de bebidas"), "Bebidas");

    setCatalogSnapshotForTests(rows);

    const cat = resolveCatalogQuery("alimentos");
    assert.ok(cat);
    assert.equal(cat!.kind, "category");
    const catPrice = buildCatalogPriceAnswer("alimentos");
    assert.ok(catPrice);
    assert.ok(/tenemos:/i.test(catPrice!), catPrice);
    assert.ok(!/\$300|\$450|\$500/i.test(catPrice!), `no debe volcar precios: ${catPrice}`);

    const banquete = resolveCatalogQuery("banquete");
    assert.ok(banquete);
    assert.equal(banquete!.kind, "service");
    const banquetePrice = buildCatalogPriceAnswer("banquete");
    assert.ok(banquetePrice);
    assert.ok(
      /\$\s*[\d,.]+|[\d,.]+\s*(?:mil|mxn|pesos)|desde\s+\$?\s*[\d,.]+/i.test(banquetePrice!),
      `precio banquete debe citar cifra: ${banquetePrice}`
    );
    assert.ok(/nivel|interes|prefieres|opciones|tiempos/i.test(banquetePrice!), banquetePrice);

    const midPriceEx = emptyExtracted({
      requerimientos_evento: "banquete",
      tipo_evento: "boda",
    });
    const midPrice = runGuards({
      aiResponse: "Manejamos varios niveles de banquete. ¿Cómo te llamas?",
      extracted: midPriceEx,
      filledSet: new Set(["Requerimientos o servicios", "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "¿cuánto cuesta el banquete?",
      history: [
        { role: "user", content: "quiero un banquete para mi boda" },
        { role: "assistant", content: "Claro. ¿Cómo te llamas?" },
      ],
    });
    assert.ok(
      /\$\s*[\d,.]+|[\d,.]+\s*(?:mil|mxn|pesos)|desde\s+\$?\s*[\d,.]+/i.test(midPrice),
      midPrice.slice(0, 400)
    );

    const exact = resolveCatalogQuery("banquete premium 4 tiempos");
    assert.ok(exact);
    assert.equal(exact!.kind, "service_nivel");
    assert.ok(/Premium/i.test(exact!.rows[0]!.nivel));
    const exactPrice = buildCatalogPriceAnswer("banquete premium 4 tiempos");
    assert.ok(exactPrice);
    assert.ok(/\$750/.test(exactPrice!), exactPrice);

    const label = formatRequerimientoLabelFromQuery("banquete 4 tiempos premium");
    assert.ok(label);
    assert.ok(/Banquete 4 tiempos.*Premium/i.test(label!), label);
  });

  await test("38. Maestro — pre-fill web, invitados 35/40, comida vaga", () => {
    const webMsg =
      "Hola, me interesa cotizar para mi evento: boda en jardín. Sería el 15 de agosto en Cuernavaca, Morelos para 120 personas";
    const brief = parseWebLeadBrief(webMsg);
    assert.ok(brief);
    assert.equal(brief!.tipo_evento, "boda");
    assert.equal(brief!.num_invitados, 120);
    assert.ok(/cuernavaca/i.test(brief!.direccion_evento ?? ""), brief!.direccion_evento);

    const extracted = emptyExtracted();
    assert.ok(applyWebLeadBrief(extracted, webMsg));
    assert.equal(extracted.tipo_evento, "boda");
    assert.equal(extracted.num_invitados, 120);

    assert.equal(isAmbiguousShortNumber("35"), false);
    assert.equal(isAmbiguousShortNumber("40"), false);
    assert.equal(isAmbiguousShortNumber("5"), true);
    assert.equal(isAmbiguousShortNumber("35", { lastAskedField: "invitados" }), false);
    assert.equal(isAmbiguousShortNumber("5", { lastAskedField: "invitados" }), false);

    assert.ok(isVagueFoodTerm("comida"));
    // "desayuno" solo ya es un servicio concreto (no menú genérico).
    assert.ok(!isVagueFoodTerm("quiero desayuno"));
    assert.ok(!isVagueFoodTerm("banquete premium 4 tiempos"));

    const vagueReply = buildVagueFoodOptionsReply(
      emptyExtracted({ tipo_evento: "boda", num_invitados: 20 }),
      [],
      "getting ready de mi boda, quiero comida"
    );
    assert.ok(/getting ready|desayuno|brunch|canap/i.test(vagueReply), vagueReply);
    assert.ok(/sin pista/i.test(vagueReply), vagueReply);

    const first = runGuards({
      aiResponse: "¿Qué servicios te gustaría cotizar?",
      extracted: emptyExtracted({ tipo_evento: "boda", num_invitados: 120, direccion_evento: "Cuernavaca" }),
      filledSet: new Set<string>(),
      readyForClosing: false,
      currentMessage: webMsg,
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(/hola[!.,]?\s*(?:buen\s+d[ií]a[.!]?\s*)?soy\s+lucy/i.test(first), first.slice(0, 200));
    assert.ok(!clientAsksForRecommendations(webMsg) || !/lo m[aá]s com[uú]n es banquete o taquiza/i.test(first), first);
  });

  await test("39. Maestro — correo typo y nombre CRM", () => {
    assert.equal(looksLikeValidClientEmail("a.juan@gmail.comm"), false);
    assert.equal(looksLikeValidClientEmail("juan@gmail.com"), true);
    assert.ok(buildEmailConfirmationPrompt("a.juan@gmail.comm").includes("gmail.comm"));

    const emailGuard = runGuards({
      aiResponse: "Gracias",
      extracted: emptyExtracted(),
      filledSet: new Set<string>(),
      readyForClosing: false,
      currentMessage: "mi correo es a.juan@gmail.comm",
      history: [],
    });
    assert.ok(/confirmas tu correo/i.test(emailGuard), emailGuard);

    const nameGuard = runGuards({
      aiResponse: "¿Me regalas tu nombre?",
      extracted: emptyExtracted(),
      filledSet: new Set<string>(),
      readyForClosing: false,
      currentMessage: "Juan Vicente",
      history: [],
      whatsappDisplayName: "Susana Briseño",
    });
    assert.ok(/susana|juan vicente/i.test(nameGuard), nameGuard);
    assert.ok(/eres|sigo contigo/i.test(nameGuard), nameGuard);
  });

  await test("40. Maestro — comida no mapea a Comida Corrida", () => {
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye"',
      '"Comida Corrida","Basico","$280.00","$8,400.00","TRUE","3 tiempos"',
      '"Taquiza","Solo Alimentos","$300.00","$9,000.00","TRUE","5 guisados"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    const comida = resolveCatalogQuery("comida");
    assert.ok(comida);
    assert.equal(comida!.kind, "category");
    assert.ok(comida!.rows.length >= 2, comida!.rows.map((r) => r.servicio).join(", "));
    assert.equal(formatRequerimientoLabelFromQuery("comida"), null);
  });

  await test("41. Legacy — 1048786 resumen no es última respuesta de Lucy", () => {
    const resumen = buildResumenClienteLargo(
      emptyExtracted({ nombre: "Ana", tipo_evento: "boda" }),
      ["- Nombre del cliente: Ana", "- Tipo de evento: boda"],
      "quiero cotizar una boda"
    );
    assert.ok(isResumenClienteLargo(resumen), resumen.slice(0, 120));
    assert.ok(isLegacyStoredLucyResponse(resumen));
    assert.ok(isLegacyStoredLucyResponse("-"));
    assert.ok(isLegacyStoredLucyResponse("¡Hola Lead #12345! Te saluda Lucy de Bodasesor."));
    assert.ok(isLegacyStoredLucyResponse("Te saluda Lucy, agente virtual de Bodasesor."));

    const realOutbound = "Hola, soy Lucy, agente virtual de Bodasesor. ¿Me regalas tu nombre?";
    assert.equal(isLegacyStoredLucyResponse(realOutbound), false);

    const fromHistory = resolveEffectiveLastLucyResponse({
      entityId: "999",
      fullHistory: [
        { role: "user", content: "hola" },
        { role: "assistant", content: realOutbound },
      ],
      cachedResponse: null,
      crmFieldValue: resumen,
    });
    assert.equal(fromHistory, realOutbound);

    const ignoresResumenCache = resolveEffectiveLastLucyResponse({
      entityId: "999",
      fullHistory: [],
      cachedResponse: resumen,
      crmFieldValue: resumen,
    });
    assert.equal(ignoresResumenCache, null);
  });

  await test("42. Anti-alucinación — inclusiones solo del Sheet", () => {
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye"',
      '"Barra de bebidas con alcohol","Basica","$450.00","$9,000.00","TRUE",""',
      '"Barra de bebidas con alcohol","Premium","$750.00","$15,000.00","TRUE","Refrescos, aguas y 3 licores premium"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    assert.equal(buildCatalogInclusionAnswer("qué incluye la barra básica"), null);

    const team = buildInclusionTeamConfirmationAnswer("qué incluye la barra básica");
    assert.ok(team, "sin Incluye en Sheet → catálogo web o equipo (nunca inventar)");
    assert.ok(
      /confirma nuestro equipo|cat[aá]logo web|bodasesor\.com\/catalogos/i.test(team!),
      team
    );
    assert.ok(!/cerveza|vino|licor com[uú]n/i.test(team!), team);

    const filled = buildCatalogInclusionAnswer("qué incluye la barra premium");
    assert.ok(filled);
    assert.ok(/Refrescos, aguas y 3 licores premium/.test(filled!), filled);
    assert.ok(!/cerveza|vino com[uú]n/i.test(filled!), filled);
    assert.ok(!/dato real del Sheet/i.test(filled!), filled);

    const hallucinated = "La barra básica incluye cervezas, vinos y licores comunes.";
    const injected = injectCatalogInclusionIfAsked("qué incluye la barra básica", hallucinated);
    assert.ok(!/cerveza|vino/i.test(injected), injected);
    assert.ok(
      /confirma nuestro equipo|cat[aá]logo web|bodasesor\.com\/catalogos/i.test(injected),
      injected
    );

    const reply = resolveCatalogInclusionReply("qué incluye la barra básica");
    assert.ok(reply);
    assert.equal(reply, team);
  });

  await test("43. Alejandra — parrillada argentina no se sustituye por banquete", () => {
    const csvBanqueteOnly = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye"',
      '"Banquete 3 tiempos","Basico","$500.00","$15,000.00","TRUE","3 tiempos"',
      '"Banquete 4 tiempos","Premium","$750.00","$15,000.00","TRUE","4 tiempos"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csvBanqueteOnly));

    assert.equal(resolveCatalogQuery("quiero parrillada argentina"), null);
    assert.equal(buildCatalogServiceDetailAnswer("quiero parrillada argentina"), null);
    assert.equal(buildCatalogPriceAnswer("quiero parrillada argentina"), null);

    const ack = buildLevel2Ack("Parrillada Argentina");
    assert.ok(/parrillada argentina/i.test(ack), ack);
    assert.ok(!/banquete/i.test(ack), ack);

    const csvConParrillada = [
      csvBanqueteOnly,
      '"Parrillada Argentina","Basica","$420.00","$8,400.00","TRUE","Cortes argentinos y guarniciones"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csvConParrillada));

    const resolved = resolveCatalogQuery("quiero parrillada argentina");
    assert.ok(resolved);
    assert.ok(rowMatchesServiceLabel(resolved!.rows[0]!, "Parrillada Argentina"));

    const detail = buildCatalogServiceDetailAnswer("quiero parrillada argentina");
    assert.ok(detail, detail);
    assert.ok(/parrillada argentina|cortes argentinos/i.test(detail!), detail);
    assert.ok(!/banquete\s+3\s+tiempos/i.test(detail!), detail);
    assert.ok(catalogAnswerMatchesRequestedService("quiero parrillada argentina", detail!), detail);
  });

  await test("44. Fase 0 — formatForWhatsApp y brief web en primer turno", () => {
    const formatted = formatForWhatsApp("**Hola** — precio:\n\n- item uno\n\n## Título");
    assert.ok(/\*Hola\*/.test(formatted), formatted);
    assert.ok(!/\*\*/.test(formatted), formatted);
    assert.ok(/• item uno/.test(formatted), formatted);
    assert.ok(!/^##/m.test(formatted), formatted);

    const webMsg =
      "Hola, me interesa cotizar para mi evento: boda en jardín. Sería el 15 de agosto en Cuernavaca para 80 personas";
    const first = runGuards({
      aiResponse: "Estas son las opciones más pedidas: banquete o taquiza.",
      extracted: emptyExtracted({ tipo_evento: "boda", num_invitados: 80 }),
      filledSet: new Set<string>(),
      readyForClosing: false,
      currentMessage: webMsg,
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(/hola[!.,]?\s*(?:buen\s+d[ií]a[.!]?\s*)?soy\s+lucy/i.test(first), first.slice(0, 200));
    assert.ok(/boda|solicitud|80\s+personas/i.test(first), first);
    assert.ok(!/opciones m[aá]s pedidas/i.test(first), first);
  });

  await test("45. Live-20 regresiones — el 5, nombre persistente, ubicación no es nombre", () => {
    assert.ok(isLikelyUbicacionNotNombre("Narvarte CDMX"));
    assert.equal(sanitizeCrmNombre("Narvarte CDMX"), null);
    assert.equal(sanitizeCrmNombre("Mario"), "Mario");

    const extractedAmbig = emptyExtracted({ num_invitados: 5 });
    sanitizeExtractedAmbiguousNumbers(extractedAmbig, "el 5", { lastAskedField: "nombre" });
    assert.equal(extractedAmbig.num_invitados, null);

    const filledElena = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    const replyInvitados = runGuards({
      aiResponse: "¿Cómo te llamas?",
      extracted: emptyExtracted({ nombre: "Elena", tipo_evento: "boda", num_invitados: 100 }),
      filledSet: new Set(filledElena),
      readyForClosing: false,
      currentMessage: "100 personas",
      history: [
        { role: "user", content: "Elena" },
        { role: "assistant", content: "Mucho gusto, Elena. ¿A qué correo te lo envío?" },
      ],
    });
    assert.ok(!/c[oó]mo\s+te\s+llamas/i.test(replyInvitados), replyInvitados);

    const valetFirst = runGuards({
      aiResponse: "Hola, soy Lucy, agente virtual de Bodasesor. ¿Cómo te llamas?",
      extracted: emptyExtracted(),
      filledSet: new Set<string>(),
      readyForClosing: false,
      currentMessage: "¿También manejan valet parking y flores?",
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(/valet|flor|coordin|anot|equipo/i.test(valetFirst), valetFirst.slice(0, 200));
    assert.ok(!/no tenemos|no manejamos/i.test(valetFirst), valetFirst);
  });

  await test("46. Karime — imagen accionable (montaje + comprobante), no descripción dueño", () => {
    const montaje = parseVisionImageJson(
      JSON.stringify({
        intent: "montaje_referencia",
        internal_description: "El espacio es un área al aire libre con césped y mesas rústicas.",
        client_reply:
          "¡Sí! Manejamos mesas y sillas de ese estilo rústico. Lo anoto para tu cotización.",
      })
    );
    assert.ok(montaje);
    assert.equal(montaje!.intent, "montaje_referencia");
    assert.ok(/anoto|estilo rústico|mesas/i.test(montaje!.clientReply));
    assert.ok(!/^El espacio es/i.test(montaje!.clientReply));

    const turn = formatImageTurnText(montaje!);
    assert.ok(extractImageClientReply(turn));
    assert.ok(!/\[Imagen nota interna\]/i.test(turn), "el turno NO debe llevar resumen interno al LLM");
    assert.ok(formatImageTeamNote(montaje!).includes("Ref. equipo"));
    const cleaned = stripImageAnnotation(
      `Qué bonito. ${turn}`
    );
    assert.ok(!/\[Imagen/i.test(cleaned), cleaned);

    const replyMontaje = runGuards({
      aiResponse: "El espacio es un área al aire libre con césped y mesas de madera.",
      extracted: emptyExtracted({ nombre: "Karime" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: turn,
      history: [{ role: "assistant", content: "¿Qué servicios te gustaría cotizar?" }],
    });
    assert.ok(/anoto|estilo|mesas|sillas/i.test(replyMontaje), replyMontaje);
    assert.ok(!/área al aire libre con césped/i.test(replyMontaje), replyMontaje);
    assert.ok(looksLikeImageInternalSummary("La imagen muestra un jardín con mesas."));

    const pago = parseVisionImageJson(
      JSON.stringify({
        intent: "comprobante_pago",
        internal_description: "Captura SPEI por $5000 a cuenta ****1234",
        client_reply: "¡Gracias por tu pago! Lo registro y el equipo da seguimiento.",
        amount_mxn: 5000,
        payment_method: "transferencia",
      })
    )!;
    const replyPago = runGuards({
      aiResponse: "Veo una transferencia bancaria con monto y CLABE.",
      extracted: emptyExtracted({ nombre: "Karime" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: formatImageTurnText(pago),
      history: [],
    });
    assert.ok(/gracias por tu pago|registro|seguimiento/i.test(replyPago), replyPago);
    assert.ok(!/CLABE|\*\*\*\*1234|Veo una transferencia/i.test(replyPago), replyPago);
    assert.equal(pago.amountMxn, 5000);
    assert.equal(pago.paymentMethod, "transferencia");
  });

  await test("50. Offer temprano — boda: OpenAI propone, no 'qué servicios quieres'", () => {
    assert.ok(isDryRequerimientosAsk("¿Qué servicios te gustaría cotizar?"));
    assert.ok(!aiLooksLikeEventServiceOffer("¿Qué servicios te gustaría cotizar?"));

    const bodaAi =
      "¡Qué emoción! Para una boda manejamos banquete, barras de bebidas, mobiliario, DJ e iluminación y mesa de postres. ¿Qué te gustaría ir armando?";
    assert.ok(aiLooksLikeEventServiceOffer(bodaAi));

    const filled = new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]);
    const extracted = emptyExtracted({
      nombre: "Karime",
      correo: "k@test.com",
      tipo_evento: "boda",
    });

    const offer = preferEventOfferReply({
      aiResponse: bodaAi,
      extracted,
      filledSet: filled,
      history: [{ role: "assistant", content: "¿Qué tipo de celebración es?" }],
      currentMessage: "es una boda",
    });
    assert.ok(offer && /banquete|dj|armando/i.test(offer), offer ?? "");
    assert.ok(!isDryRequerimientosAsk(offer!));

    const dryReplaced = preferEventOfferReply({
      aiResponse: "¿Qué servicios te gustaría cotizar?",
      extracted,
      filledSet: filled,
      history: [],
      currentMessage: "es una boda",
    });
    assert.ok(dryReplaced);
    assert.ok(!isDryRequerimientosAsk(dryReplaced!), dryReplaced);
    assert.ok(/boda|banquete|taquiza|bebidas|mobiliario/i.test(dryReplaced!), dryReplaced);

    const guarded = runGuards({
      aiResponse: bodaAi,
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "es una boda",
      history: [{ role: "assistant", content: "¿Qué tipo de celebración es?" }],
    });
    assert.ok(/banquete|dj|bebidas|armando|mobiliario/i.test(guarded), guarded);
    assert.ok(!/qu[eé]\s+servicios\s+te\s+gustar/i.test(guarded), guarded);
  });

  await test("51. Offer temprano — boda vs baby shower: propuestas distintas", () => {
    const bodaServices = listCatalogServicesForEvent("boda");
    const babyServices = listCatalogServicesForEvent("baby shower");
    assert.ok(bodaServices.some((s) => /dj|banquete|barra|ilumin/i.test(s)), bodaServices.join(","));
    assert.ok(babyServices.some((s) => /brunch|dulce|bocadillo/i.test(s)), babyServices.join(","));
    assert.ok(
      buildEventOfferCatalogHint("boda") !== buildEventOfferCatalogHint("baby shower"),
      "hints deben diferir por evento"
    );

    const filled = new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]);
    const bodaReply = runGuards({
      aiResponse:
        "¡Qué emoción! Para tu boda armamos banquete, barras de bebidas, DJ e iluminación. ¿Qué te gustaría ir cotizando?",
      extracted: emptyExtracted({ nombre: "Ana", correo: "a@t.com", tipo_evento: "boda" }),
      filledSet: new Set(filled),
      readyForClosing: false,
      currentMessage: "boda",
      history: [],
    });
    const babyReply = runGuards({
      aiResponse:
        "¡Qué bonito! Para un baby shower suele ir brunch, mesa de dulces, bocadillos y mobiliario. ¿Qué te late incluir?",
      extracted: emptyExtracted({
        nombre: "Ana",
        correo: "a@t.com",
        tipo_evento: "baby shower",
      }),
      filledSet: new Set(filled),
      readyForClosing: false,
      currentMessage: "baby shower",
      history: [],
    });
    assert.ok(/banquete|dj|bebidas/i.test(bodaReply), bodaReply);
    assert.ok(/brunch|dulces|bocadillo/i.test(babyReply), babyReply);
    assert.ok(bodaReply !== babyReply, "redacciones distintas por evento");
    assert.ok(!/qu[eé]\s+servicios\s+te\s+gustar/i.test(bodaReply));
    assert.ok(!/qu[eé]\s+servicios\s+te\s+gustar/i.test(babyReply));
  });

  await test("47. Karime — ofrecer complementos en pedido solo mesa y sillas", () => {
    assert.ok(looksLikeMinimalServiceAsk("solo mesa y sillas para 12 personas"));
    const soft = buildSoftComplementOffer(
      emptyExtracted({
        nombre: "Karime",
        tipo_evento: "cumpleaños",
        num_invitados: 12,
        requerimientos_evento: "solo mesa y sillas",
      }),
      [],
      "solo mesa y sillas para 12 personas"
    );
    assert.ok(soft);
    assert.ok(/mantel|postres|bebidas/i.test(soft!), soft);

    const filled = new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]);
    const reply = runGuards({
      aiResponse: "¿En qué ciudad sería tu evento?",
      extracted: emptyExtracted({
        nombre: "Karime",
        correo: "k@test.com",
        tipo_evento: "cumpleaños",
        num_invitados: 12,
        requerimientos_evento: "solo mesa y sillas",
      }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "solo mesa y sillas para 12 personas",
      history: [{ role: "assistant", content: "¿Qué servicios te gustaría cotizar?" }],
    });
    assert.ok(/mantel|postres|bebidas|opcional/i.test(reply), reply);
  });

  await test("48. Karime — no cierra sin fecha/ubicación (embudo natural)", () => {
    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    const reply = runGuards({
      aiResponse: "Perfecto, ya tengo todo. Aquí el catálogo completo.",
      extracted: emptyExtracted({
        nombre: "Karime",
        correo: "k@test.com",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "mesa y sillas",
        num_invitados: 12,
      }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "ok",
      history: [],
    });
    // Orden natural: fecha antes que zona; nunca cierre prematuro.
    assert.ok(
      /ciudad|colonia|sal[oó]n|ubicaci|fecha|cu[aá]ndo|d[ií]a|hora|definiendo/i.test(reply),
      reply
    );
    assert.ok(!/ya tengo todo/i.test(reply), reply);
  });

  await test("49. Karime — 'no tengo' en presupuesto = sin definir, no repetir", () => {
    assert.ok(detectPresupuestoRefusal("no tengo"));
    assert.equal(
      parsePresupuestoFromText("no tengo"),
      "Sin definir (cliente indicó que no tiene)"
    );
    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
    ]);
    applyPresupuestoWaiver(filled, [], ["no tengo"]);
    assert.ok(filled.has("Presupuesto (MXN)"));

    const reply = runGuards({
      aiResponse: "¿Tienen algún rango de presupuesto en mente?",
      extracted: emptyExtracted({
        nombre: "Karime",
        correo: "k@test.com",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "mesa y sillas",
        num_invitados: 12,
        direccion_evento: "Narvarte CDMX",
        fecha_horario: "15 de agosto",
      }),
      filledSet: filled,
      readyForClosing: true,
      currentMessage: "no tengo",
      history: [{ role: "assistant", content: "¿Tienen algún rango de presupuesto en mente?" }],
    });
    assert.ok(!/rango de presupuesto|presupuesto en mente/i.test(reply), reply);
    assert.ok(/perfecto, ya tengo todo|sin problema|por definir/i.test(reply), reply);
  });

  await test("52. Luis — pozolada ofrece pozole, no banquete/taquiza", () => {
    const focus = resolveServiceFocusFromText("pozolada");
    assert.ok(focus && /pozole/i.test(focus.label), JSON.stringify(focus));
    const services = listCatalogServicesForEvent("pozolada");
    assert.ok(services.some((s) => /pozole/i.test(s)), services.join(", "));
    assert.ok(!services.some((s) => /^banquete$/i.test(s) || /^taquiza$/i.test(s)), services.join(", "));

    const hint = buildEventOfferCatalogHint("pozolada") ?? "";
    assert.ok(/pozole/i.test(hint), hint.slice(0, 200));
    assert.ok(/no banquete|ESE servicio|EVENTO = SERVICIO/i.test(hint), hint.slice(0, 250));

    const filled = new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]);
    const reply = runGuards({
      aiResponse: "¡Claro! Para tu pozolada tenemos pozole rojo, verde o blanco con tostadas. ¿Para cuántas personas?",
      extracted: emptyExtracted({
        nombre: "Luis",
        correo: "l@test.com",
        tipo_evento: "pozolada",
      }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "es una pozolada",
      history: [{ role: "assistant", content: "¿Qué tipo de celebración es?" }],
    });
    assert.ok(/pozole/i.test(reply), reply);
    assert.ok(!/banquete.*taquiza|taquiza.*banquete/i.test(reply) || /pozole/i.test(reply), reply);
  });

  await test("53. Luis — 'opciones' resuelve presupuesto y no re-pregunta", () => {
    assert.ok(detectPresupuestoRefusal("Opciones"));
    assert.ok(detectPresupuestoRefusal("opciones"));
    assert.equal(
      parsePresupuestoFromText("Opciones"),
      "Sin definir (cliente pidió que propongamos)"
    );

    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
    ]);
    applyPresupuestoWaiver(filled, [], ["Opciones"]);
    assert.ok(filled.has("Presupuesto (MXN)"));

    const reply = runGuards({
      aiResponse: "¿Tienen algún rango de presupuesto en mente?",
      extracted: emptyExtracted({
        nombre: "Luis",
        correo: "l@test.com",
        tipo_evento: "pozolada",
        requerimientos_evento: "Pozole y Tostadas",
        num_invitados: 70,
        direccion_evento: "CDMX Narvarte",
        fecha_horario: "15 de agosto",
      }),
      filledSet: filled,
      readyForClosing: true,
      currentMessage: "Opciones",
      history: [{ role: "assistant", content: "¿Tienen algún rango de presupuesto en mente?" }],
    });
    assert.ok(!/rango de presupuesto|presupuesto en mente/i.test(reply), reply);
  });

  await test("54. Luis — sin transición doble ni cierre enlatado", () => {
    const deduped = dedupeTransitionsInMessage(
      "Suena muy bien. ¡Claro! Para tu evento. Suena muy bien. ¿Tienen fecha?"
    );
    assert.equal((deduped.match(/suena muy bien/gi) || []).length, 1, deduped);

    const closeReply = runGuards({
      aiResponse:
        "Perfecto, ya tengo todo. Por cierto, también manejamos bebidas, DJ, iluminación, carpas, pantallas, mesas de dulces, barras de alimentos y más. ¿Algo más?",
      extracted: emptyExtracted({
        nombre: "Luis",
        tipo_evento: "pozolada",
        requerimientos_evento: "pozole",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: true,
      currentMessage: "ok",
      history: [],
    });
    assert.ok(!/tambi[eé]n manejamos bebidas,?\s*DJ/i.test(closeReply), closeReply.slice(0, 300));
  });

  await test("55. Catálogo web — links en info de servicio + strip GPT suelto", () => {
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye","Sinonimos"',
      '"Barra de pizzas","Basico","$320.00","$8,000.00","TRUE","https://bodasesor.com/catalogos/barra-de-pizzas","Pizzas artesanales","pizza"',
      '"Taquiza","Solo Alimentos","$300.00","$9,000.00","TRUE","https://bodasesor.com/catalogos/taquiza","5 guisados","tacos de guisados"',
      '"Parrillada Tacos","Basico","$350.00","$10,000.00","TRUE","https://bodasesor.com/catalogos/parrillada-tacos","Tacos a la parrilla","parrillada de tacos"',
      '"Cupcakes","Basico","$45.00","$2,000.00","TRUE","https://bodasesor.com/catalogos/cupcakes-y-betun","Cupcakes","betún"',
      '"Entelados para Techo","Basico","","","TRUE","https://bodasesor.com/catalogos/entelados-para-techo","Telas para techo","entelado|tela en techo"',
      '"Colgantes Premium","Basico","","","TRUE","https://bodasesor.com/catalogos/colgantes-premium","Colgantes","colgantes|wisteria"',
    ].join("\n");
    const rows = parseSheetCatalogCsv(csv);
    setCatalogSnapshotForTests(rows);

    const pizzaRow = rows.find((r) => /pizzas/i.test(r.servicio));
    assert.ok(pizzaRow?.linkCatalogo?.includes("barra-de-pizzas"), String(pizzaRow?.linkCatalogo));

    assert.ok(clientAsksForCatalog("mándame el catálogo de la barra de pizzas"));
    assert.ok(clientAsksForCatalog("pásame el de colgantes"));
    assert.equal(clientAsksForCatalog("cuánto cuesta la barra de pizzas"), false);
    assert.ok(clientWantsFullCatalog("mándame todo el catálogo"));
    assert.ok(
      clientAffirmsCatalogOffer("sí", `Genial.\n\nDetalle\n\n${CATALOG_OFFER_QUESTION}`)
    );

    const pizza = resolveCatalogWebLink("el catálogo de la barra de pizzas");
    assert.equal(pizza.url, "https://bodasesor.com/catalogos/barra-de-pizzas");
    assert.ok(/pizzas/i.test(pizza.serviceName ?? ""), pizza.serviceName);

    const colgantes = resolveCatalogWebLink("colgantes");
    assert.equal(colgantes.url, "https://bodasesor.com/catalogos/colgantes-premium");

    const entelados = resolveCatalogWebLink("entelados");
    assert.equal(entelados.url, "https://bodasesor.com/catalogos/entelados-para-techo");

    const tela = resolveCatalogWebLink("tela en techo");
    assert.equal(tela.url, "https://bodasesor.com/catalogos/entelados-para-techo");

    const taquiza = resolveCatalogWebLink("taquiza");
    assert.equal(taquiza.url, "https://bodasesor.com/catalogos/taquiza");

    const parrTacos = resolveCatalogWebLink("parrillada tacos");
    assert.equal(parrTacos.url, "https://bodasesor.com/catalogos/parrillada-tacos");

    const cupcakes = resolveCatalogWebLink("betún");
    assert.equal(cupcakes.url, "https://bodasesor.com/catalogos/cupcakes-y-betun");

    const replyPizza = buildCatalogWebLinkReply({
      query: "catálogo de la barra de pizzas",
    });
    assert.ok(
      replyPizza.includes("/catalogos/barra-de-pizzas"),
      replyPizza
    );
    assert.ok(
      /hostingersite\.com\/catalogos\/barra-de-pizzas|bodasesor\.com\/catalogos\/barra-de-pizzas/.test(
        replyPizza
      ),
      replyPizza
    );

    const replyFull = buildCatalogWebLinkReply({ query: "todo", wantFull: true });
    assert.ok(/\/catalogos\b/.test(replyFull), replyFull);

    const unsolicited = stripUnsolicitedCatalogWebLinks(
      "Mira https://bodasesor.com/catalogos/barra-de-pizzas está padre",
      false
    );
    assert.ok(!/bodasesor\.com\/catalogos/i.test(unsolicited), unsolicited);

    const kept = stripUnsolicitedCatalogWebLinks(
      "Claro https://bodasesor.com/catalogos/barra-de-pizzas",
      true
    );
    assert.ok(kept.includes("barra-de-pizzas"), kept);

    const famCol = expandQueryWithServiceSynonyms("colgantes");
    assert.ok(famCol.familyKeys.includes("colgantes_premium"), String(famCol.familyKeys));
    const famEnt = expandQueryWithServiceSynonyms("tela en techo");
    assert.ok(famEnt.familyKeys.includes("entelados_techo"), String(famEnt.familyKeys));

    const guardSend = runGuards({
      aiResponse: "¿Qué más necesitas?",
      extracted: emptyExtracted({
        nombre: "Ana",
        tipo_evento: "boda",
        requerimientos_evento: "barra de pizzas",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "mándame el catálogo de la barra de pizzas",
      history: [
        { role: "user", content: "quiero barra de pizzas" },
        {
          role: "assistant",
          content: `Perfecto. Sí manejamos barra de pizzas.\n\n${CATALOG_OFFER_QUESTION}`,
        },
      ],
    });
    assert.ok(
      guardSend.includes("/catalogos/barra-de-pizzas"),
      guardSend
    );

    // V8.34: info de servicio SIEMPRE incluye link (ya no solo pregunta opt-in).
    const guardInfo = runGuards({
      aiResponse: "Claro, ¿cuántos invitados?",
      extracted: emptyExtracted({ nombre: "Ana", tipo_evento: "boda" }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "quiero info de barra de pizzas",
      history: [],
    });
    assert.ok(
      /bodasesor\.com\/catalogos|hostingersite\.com\/catalogos/i.test(guardInfo),
      guardInfo.slice(0, 500)
    );

    // GPT inventando URL sin contexto de servicio → strip (sin fingerprint intencional).
    const strippedBare = stripUnsolicitedCatalogWebLinks(
      "Mira https://bodasesor.com/catalogos/barra-de-pizzas está padre",
      false
    );
    assert.ok(!/bodasesor\.com\/catalogos/i.test(strippedBare), strippedBare);

    const guardAffirm = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Ana",
        tipo_evento: "boda",
        requerimientos_evento: "Colgantes Premium",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "sí",
      history: [
        { role: "user", content: "me interesan colgantes" },
        {
          role: "assistant",
          content: `Perfecto. Sí manejamos Colgantes Premium.\n\n${CATALOG_OFFER_QUESTION}`,
        },
      ],
    });
    assert.ok(
      guardAffirm.includes("/catalogos/colgantes-premium"),
      guardAffirm
    );

  });

  await test("56. Tarima sin precio — aceptar-anotar-avanzar (no menú)", () => {
    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
    ]);
    const reply = runGuards({
      aiResponse:
        "Claro. Manejamos alimentos y barras, mobiliario, carpas, pistas de baile, DJ… ¿Qué otros servicios te gustaría?",
      extracted: emptyExtracted({
        nombre: "Fer",
        correo: "fer@test.com",
        tipo_evento: "cumpleaños",
      }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Quiero la renta de una tarima / pista de 4 x 4",
      history: [
        {
          role: "assistant",
          content:
            "Platícame qué necesitas. Manejamos alimentos y barras, mobiliario, carpas, pistas de baile, DJ, iluminación y más.",
        },
      ],
    });
    assert.ok(/tarima|pista/i.test(reply), reply.slice(0, 300));
    assert.ok(
      !/alg[uú]n\s+otro\s+servicio|qu[eé]\s+otros\s+servicios|manejamos alimentos y barras.{0,40}dj/i.test(
        reply
      ),
      reply.slice(0, 400)
    );
    // A14967: con medidas pero sin estilo → menú de tipos (no dump PDF ni embudo aún).
    assert.ok(/4\s*m|estilo|LED|vinil|pintada|charol/i.test(reply), reply.slice(0, 400));
    assert.ok(!/Según el catálogo que ya cargamos/i.test(reply), reply.slice(0, 300));
  });

  await test("57. Cierre sobrio sin upsell forzado (V8.93)", () => {
    const close = mockClosing("renta de tarima/pista 4x4", "Ana");
    assert.ok(/Perfecto, ya tengo todo/i.test(close), close);
    assert.ok(/tarima|pista/i.test(close), close);
    assert.ok(/con gusto te apoyo/i.test(close), close);
    assert.ok(!/Si quieres sumar/i.test(close), close);
    assert.ok(!/Si más adelante quieres sumar algo además/i.test(close), close);
  });

  await test("58. Anti-repetición — correo ya en extracted no se vuelve a pedir", () => {
    const filled = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    const reply = runGuards({
      aiResponse: "Perfecto. ¿Me compartes tu correo para enviarte la información?",
      extracted: emptyExtracted({
        nombre: "Ana",
        correo: "ana@test.com",
        tipo_evento: "boda",
        requerimientos_evento: "banquete",
      }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Quiero banquete formal",
      history: [
        { role: "assistant", content: "¿Qué servicios te gustaría cotizar?" },
        { role: "user", content: "banquete" },
      ],
    });
    assert.ok(!/correo|e-?mail/i.test(reply) || !/\?/.test(reply.split(/correo/i)[0] + "?"), reply.slice(0, 300));
    assert.ok(!mensajeAsksForField(reply, "correo") && !/necesito.{0,20}correo/i.test(reply), reply.slice(0, 400));
  });

  await test("59. Anti-repetición — presupuesto ya capturado no se re-pregunta en venta", () => {
    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Número de invitados",
      "Presupuesto (MXN)",
    ]);
    const reply = runGuards({
      aiResponse:
        "Claro, el DJ lo anoto. ¿Tienen algún rango de presupuesto en mente?",
      extracted: emptyExtracted({
        nombre: "Luis",
        correo: "l@test.com",
        tipo_evento: "xv años",
        requerimientos_evento: "DJ",
        direccion_evento: "CDMX Polanco",
        fecha_horario: "15 agosto 2026",
        num_invitados: 100,
        presupuesto: "50000",
      }),
      filledSet: filled,
      readyForClosing: true,
      currentMessage: "también quiero DJ",
      history: [
        {
          role: "assistant",
          content: "Perfecto, ya tengo todo. Voy a compartir estos datos con nuestro equipo.",
        },
      ],
    });
    assert.ok(!mensajeAsksForField(reply, "presupuesto"), reply.slice(0, 400));
    assert.ok(!/rango\s+de\s+presupuesto/i.test(reply), reply.slice(0, 400));
  });

  await test("60. Anti-repetición — segundo menú de servicios se corta y avanza", () => {
    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
    ]);
    const reply = runGuards({
      aiResponse:
        "También manejamos bebidas, DJ, iluminación, carpas… ¿Qué otros servicios te gustaría?",
      extracted: emptyExtracted({
        nombre: "Fer",
        correo: "fer@test.com",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "mobiliario",
      }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "necesito mobiliario",
      history: [
        {
          role: "assistant",
          content:
            "Platícame qué necesitas. Manejamos alimentos y barras, mobiliario, carpas, pistas de baile, DJ, iluminación y más.",
        },
      ],
    });
    assert.ok(
      !/qu[eé]\s+otros\s+servicios|alg[uú]n\s+otro\s+servicio/i.test(reply),
      reply.slice(0, 400)
    );
    assert.ok(
      /mobiliario|anot|ciudad|colonia|sal[oó]n|fecha|personas|invitados/i.test(reply),
      reply.slice(0, 400)
    );
  });

  await test("61. Anti-repetición — zona en extracted no se vuelve a pedir", () => {
    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    const reply = runGuards({
      aiResponse: "Genial. ¿En qué ciudad y colonia sería tu evento?",
      extracted: emptyExtracted({
        nombre: "Karime",
        correo: "k@test.com",
        tipo_evento: "boda",
        requerimientos_evento: "banquete",
        direccion_evento: "Guadalajara, Providencia",
      }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "sí el banquete",
      history: [{ role: "assistant", content: "¿Qué servicios te gustaría?" }],
    });
    assert.ok(!mensajeAsksForField(reply, "zona"), reply.slice(0, 400));
    assert.ok(
      /fecha|horario|cu[aá]ndo|invitados|personas|presupuesto|pensado/i.test(reply),
      reply.slice(0, 400)
    );
  });

  await test("62. A14856 Omar — saludo/Cap&Bara NO se confunden con nombre", () => {
    assert.equal(isGreetingOnlyMessage("Hola buen día"), true);
    assert.equal(isGreetingOnlyMessage("buen día"), true);
    assert.equal(isGreetingOnlyMessage("Buenos días"), true);
    assert.equal(isGreetingOnlyMessage("buenas, información"), true);
    assert.equal(isGreetingOnlyMessage("hola info"), true);
    assert.equal(sanitizeCrmNombre("Buen Día"), null);
    assert.equal(sanitizeDisplayName("Hola buen día"), null);

    const vagueOpen = runGuards({
      aiResponse: "Claro, ¿qué necesitas?",
      extracted: emptyExtracted(),
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage: "buenas, información",
      forceFirstPresentation: true,
    });
    assert.ok(/lucy|agente virtual|bodasesor/i.test(vagueOpen), vagueOpen);

    assert.ok(clientAsksCompanyIdentity("¿Me comunico con Cap&Bata eventos?"));
    assert.ok(clientAsksCompanyIdentity("¿Me comunico con Cap&Bara eventos?"));
    assert.ok(isLikelyNotPersonNameMessage("¿Me comunico con Cap&Bata eventos?"));
    assert.ok(isLikelyNotPersonNameMessage("Hola buen día"));
    assert.equal(isLikelyNotPersonNameMessage("Omar"), false);
    assert.equal(isLikelyNotPersonNameMessage("Cómo Omar"), false);

    const filled = new Set<string>();
    const greetingReply = runGuards({
      aiResponse: "¿Me regalas tu nombre?",
      extracted: emptyExtracted({ nombre: null }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Hola buen día",
      whatsappDisplayName: "Omar Ponce",
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(
      !/eres\s+Buen|sigues?\s+contigo\s+como/i.test(greetingReply),
      `no debe preguntar si es Buen Día: ${greetingReply.slice(0, 250)}`
    );

    const filled2 = new Set<string>();
    const companyReply = runGuards({
      aiResponse: "¿Me regalas tu nombre?",
      extracted: emptyExtracted({ nombre: null }),
      filledSet: filled2,
      readyForClosing: false,
      currentMessage: "¿Me comunico con Cap&Bata eventos?",
      whatsappDisplayName: "Omar Ponce",
      history: [
        { role: "user", content: "Hola buen día" },
        { role: "assistant", content: "Hola, soy Lucy. ¿Me regalas tu nombre?" },
      ],
    });
    assert.ok(
      !/Me Comunico|Capbata|eres\s+Me/i.test(companyReply),
      `no debe tomar Cap&Bata como nombre: ${companyReply.slice(0, 250)}`
    );
    assert.ok(
      /Bodasesor|Cap&Bara|Lucy/i.test(companyReply),
      `debe confirmar que es Cap&Bara/Bodasesor: ${companyReply.slice(0, 250)}`
    );
    assert.ok(buildCompanyIdentityReply("Omar").includes("Omar"));
  });

  await test("63. Edgar A14861 — intro, correo, nivel barra, catálogo bodasesor", () => {
    const mesasFirst = runGuards({
      aiResponse: "Anoto mesa y sillas. Si quieres, como opcional: mantelería o bebidas. ¿Cómo te llamas?",
      extracted: emptyExtracted({ requerimientos_evento: "Renta de Mesas y Sillas para Eventos" }),
      filledSet: new Set<string>(),
      readyForClosing: false,
      currentMessage: "Hola, me interesa cotizar: Renta de Mesas y Sillas para Eventos",
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(/soy Lucy.*agente virtual/i.test(mesasFirst), mesasFirst.slice(0, 200));
    assert.ok(/llamas|nombre/i.test(mesasFirst), mesasFirst);
    assert.ok(!/manteler[ií]a|bebidas para redondear/i.test(mesasFirst), mesasFirst);

    const mobDetail = buildMobiliarioRentDetailReply("Necesito 900 sillas para un concierto");
    assert.ok(mobDetail && /sillas|mesas|periquera/i.test(mobDetail), mobDetail ?? "");

    const emailReply = runGuards({
      aiResponse: "Genial, Edgar. ¿En qué ciudad sería el evento?",
      extracted: emptyExtracted({
        nombre: "Edgar",
        correo: "edagarcruz85@hotmaill.com",
        tipo_evento: "concierto",
        requerimientos_evento: "Renta de Mesas y Sillas para Eventos",
        num_invitados: 900,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "edagarcruz85@hotmaill.com",
      history: [
        { role: "assistant", content: "¿Me compartes un correo para enviarte los detalles de la cotización?" },
      ],
    });
    assert.ok(/gracias por tu correo/i.test(emailReply), emailReply);
    assert.ok(!/^genial/i.test(emailReply.trim()), emailReply);
    // Tras correo: siguiente faltante (fecha o zona según embudo natural).
    assert.ok(
      /ciudad|ubicaci[oó]n|fecha|cu[aá]ndo|d[ií]a|hora|definiendo|sal[oó]n/i.test(emailReply),
      emailReply
    );

    const nivelAsk =
      "Perfecto, Edgar. Para la *Barra de Bebidas*, manejamos tres niveles: 1. *Básica* 2. *Tradicional* 3. *Premium* ¿Cuál nivel prefieres para tu evento?";
    assert.ok(isCatalogLevelSelection("1", nivelAsk));
    const nivelReply = runGuards({
      aiResponse: "¿Te refieres a 5 invitados o al día 5 del mes?",
      extracted: emptyExtracted({
        nombre: "Edgar",
        tipo_evento: "concierto",
        requerimientos_evento: "Barra de Bebidas",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "1",
      history: [
        { role: "user", content: "Hola, me interesa cotizar Barra de Bebidas" },
        { role: "assistant", content: nivelAsk },
      ],
    });
    assert.ok(!/invitados o al d[ií]a 5/i.test(nivelReply), nivelReply);

    const prevLight = process.env["CATALOG_USE_LIGHT_PAGES"];
    delete process.env["CATALOG_USE_LIGHT_PAGES"];
    assert.equal(
      toDeliverableCatalogUrl("https://bodasesor.com/catalogos/barra-de-bebidas"),
      "https://bodasesor.com/catalogos/barra-de-bebidas"
    );
    if (prevLight !== undefined) process.env["CATALOG_USE_LIGHT_PAGES"] = prevLight;

    const internalLeak = runGuards({
      aiResponse:
        "Información completa obtenida y verificada.\n\nDATOS DEL CLIENTE:\n- Nombre: Edgar\n- Correo: edagarcruz85@hotmaill.com\n\nPerfecto, ya tengo todo. Voy a compartir esta información con nuestro equipo.",
      extracted: emptyExtracted({
        nombre: "Edgar",
        correo: "edagarcruz85@hotmaill.com",
        tipo_evento: "concierto",
        requerimientos_evento: "Renta de Mesas y Sillas para Eventos",
        num_invitados: 900,
        direccion_evento: "Mérida..club campestre",
        fecha_horario: "19 sep 20 a 24 HRS",
      }),
      filledSet: new Set([
        ...CLOSING_CORE_FIELDS,
        "Requerimientos o servicios",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: true,
      currentMessage: "19 sep 20 a 24 HRS",
      history: [],
    });
    assert.ok(!/DATOS DEL CLIENTE/i.test(internalLeak), internalLeak.slice(0, 300));
    assert.ok(!/Información completa obtenida/i.test(internalLeak), internalLeak.slice(0, 300));
  });

  await test("64. Niveles — Basica/Tradicional/Premium con qué incluye cada uno", () => {
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye"',
      '"Barra de bebidas","Basica","$150.00","$4,500.00","TRUE","Refrescos y aguas"',
      '"Barra de bebidas","Tradicional","$220.00","$6,600.00","TRUE","Refrescos, aguas y 2 licores"',
      '"Barra de bebidas","Premium","$320.00","$9,600.00","TRUE","Refrescos, aguas y 3 licores premium"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    const bare =
      "Perfecto, Edgar. Para la *Barra de Bebidas*, manejamos tres niveles: 1. *Básica* 2. *Tradicional* 3. *Premium* ¿Cuál nivel prefieres para tu evento?";
    assert.ok(messageOffersLevelsWithoutInclusions(bare));

    const detail = buildCatalogServiceDetailAnswer("barra de bebidas");
    assert.ok(detail, "debe armar oferta de niveles");
    assert.ok(/Incluye:.*Refrescos y aguas/i.test(detail!), detail);
    assert.ok(/Incluye:.*2 licores/i.test(detail!), detail);
    assert.ok(/Incluye:.*3 licores premium/i.test(detail!), detail);
    assert.ok(
      /quieres que te d[eé] detalles de alguno|Cuál nivel prefieres/i.test(detail!),
      detail
    );
    assert.ok(!messageOffersLevelsWithoutInclusions(detail), detail);

    const promptBlock = formatServiceDataForPrompt("barra de bebidas");
    assert.ok(promptBlock && /Incluye:/i.test(promptBlock), promptBlock ?? "");
    assert.ok(/EXPLICA qué incluye/i.test(promptBlock!), promptBlock);

    const guardBare = runGuards({
      aiResponse: bare,
      extracted: emptyExtracted({
        nombre: "Edgar",
        tipo_evento: "concierto",
        requerimientos_evento: "Barra de bebidas",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "Hola, me interesa cotizar Barra de Bebidas",
      history: [
        { role: "user", content: "Hola, me interesa cotizar Barra de Bebidas" },
        { role: "assistant", content: "¿Qué nivel te interesa?" },
      ],
    });
    assert.ok(/Incluye:/i.test(guardBare), guardBare.slice(0, 500));
    assert.ok(/Refrescos y aguas/i.test(guardBare), guardBare.slice(0, 500));
    assert.ok(enrichBareNivelOffer(bare, "Barra de bebidas"), "enrich debe devolver detalle");
  });

  await test("65. Catálogos web + foto sin resumen interno", () => {
    const embeds = loadCatalogEmbeds();
    assert.ok(embeds.length > 5, `embeds.json vacío: ${embeds.length}`);
    assert.equal(resolveCatalogWebSlug("barra de bebidas"), "barra-de-bebidas");
    assert.equal(
      getCatalogWebUrlForQuery("barra de bebidas"),
      "https://bodasesor.com/catalogos/barra-de-bebidas"
    );
    const hint = buildCatalogWebDetailHint("barra de bebidas");
    assert.ok(hint && /bodasesor\.com\/catalogos\/barra-de-bebidas/.test(hint), hint ?? "");

    // Sheet sin Inclusuye → la oferta de niveles apunta al catálogo web.
    const csvEmpty = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye"',
      '"Barra de bebidas","Basica","$150.00","$4,500.00","TRUE",""',
      '"Barra de bebidas","Tradicional","$220.00","$6,600.00","TRUE",""',
      '"Barra de bebidas","Premium","$320.00","$9,600.00","TRUE",""',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csvEmpty));
    const detailEmpty = buildCatalogServiceDetailAnswer("barra de bebidas");
    assert.ok(detailEmpty);
    assert.ok(
      /bodasesor\.com\/catalogos\/barra-de-bebidas/i.test(detailEmpty!),
      detailEmpty
    );

    const summaryAi =
      "La imagen muestra un jardín con mesas rústicas y sillas de madera alrededor.";
    assert.ok(looksLikeImageInternalSummary(summaryAi));
    const blocked = runGuards({
      aiResponse: summaryAi,
      extracted: emptyExtracted({ nombre: "Karime" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "[Imagen intent]: montaje_referencia\n[Imagen respuesta cliente]: ¡Me encanta el estilo rústico de tu foto! Lo anoto para armar ese montaje.",
      history: [],
    });
    assert.ok(/estilo rústico|anoto|montaje/i.test(blocked), blocked);
    assert.ok(!/La imagen muestra/i.test(blocked), blocked);
  });

  await test("68. Silencio + emergencia — vigila datos; solo teléfonos en Humano Trabaja", () => {
    assert.ok(clientNeedsEmergencyContact("necesito un teléfono de emergencia"));
    assert.ok(clientNeedsEmergencyContact("nadie me contesta, es urgente"));
    assert.ok(clientNeedsEmergencyContact("pásame un contacto por favor"));
    assert.ok(clientNeedsEmergencyContact("¿Tienen teléfono de ventas?"));
    assert.ok(!clientNeedsEmergencyContact("ayúdame con el banquete para 100"));
    assert.ok(!clientNeedsEmergencyContact("la dirección ahora es Polanco CDMX"));

    const emergency = buildEmergencyContactAnswer();
    assert.ok(/55 4008 0373/.test(emergency));
    assert.ok(/56 4671 0585/.test(emergency));
    assert.ok(/emergencia/i.test(emergency));
    assert.ok(/solo por l[ií]nea telef[oó]nica/i.test(emergency));
    assert.ok(/WhatsApp y por l[ií]nea telef[oó]nica/i.test(emergency));

    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const kommoSrc = readFileSync(path.join(apiRoot, "src/routes/kommo.ts"), "utf8");
    const embudoSrc = readFileSync(path.join(apiRoot, "src/services/embudo.ts"), "utf8");
    assert.ok(/handleLucyInactiveInbound/.test(kommoSrc));
    assert.ok(/buildSilentWatchPatchPayload/.test(kommoSrc));
    assert.ok(/clientNeedsEmergencyContact/.test(kommoSrc));
    assert.ok(/extractKommoIncomingMessage/.test(kommoSrc), "webhook debe parsear payload oficial Kommo");
    assert.ok(/acceptUnsortedForLeadId/.test(kommoSrc), "Lucy debe aceptar Incoming Leads");
    assert.ok(/processKommoWebhookAfterAck/.test(kommoSrc), "ACK 200 antes de voz/visión o Kommo desactiva el webhook");
    assert.ok(/applyPaymentReceiptToLead/.test(kommoSrc), "comprobante imagen debe llenar Anticipo/Liquidación");
    assert.ok(/Kommo exige HTTP 2xx/.test(kommoSrc));
    assert.ok(/acceptUnsortedLead/.test(embudoSrc));
    assert.ok(/lucyEstaEnSilencio|lucyDebeResponder/.test(embudoSrc));
    assert.ok(/Humano Trabaja/.test(embudoSrc) || /HUMANO_TRABAJA/.test(embudoSrc));
  });

  await test("67. Aprendizaje continuo — cron + extract en Humano Trabaja", () => {
    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const repoRoot = path.resolve(apiRoot, "..");
    const syncSrc = readFileSync(path.join(apiRoot, "src/services/learningSync.ts"), "utf8");
    const extractorSrc = readFileSync(path.join(apiRoot, "src/services/learningExtractor.ts"), "utf8");
    const ingestSrc = readFileSync(path.join(apiRoot, "src/services/chatIngest.ts"), "utf8");
    const kommoSrc = readFileSync(path.join(apiRoot, "src/routes/kommo.ts"), "utf8");
    const embudoSrc = readFileSync(path.join(apiRoot, "src/services/embudo.ts"), "utf8");
    const learningRoutes = readFileSync(path.join(apiRoot, "src/routes/learning.ts"), "utf8");
    const talksSrc = readFileSync(path.join(apiRoot, "src/services/kommoTalks.ts"), "utf8");
    const keepAlive = readFileSync(
      path.join(repoRoot, ".github/workflows/keep-alive-hostinger.yml"),
      "utf8"
    );
    const panelApp = readFileSync(path.join(apiRoot, "public/aprendizaje/app.js"), "utf8");

    // Cron debe extraer también en Humano Trabaja (no solo Cotización).
    assert.ok(/HUMANO_TRABAJA/.test(syncSrc));
    assert.ok(/listKommoLeadsInLearningStages/.test(syncSrc), "cron lista leads vivos en Kommo");
    assert.ok(/resolveKommoTalkId/.test(syncSrc), "sync resuelve talkId");
    assert.ok(/with=contacts,tags,chats/.test(embudoSrc), "fetchLead incluye chats");

    // Al cerrar, moverAHumanoTrabaja marca learningPhase + dispara sync.
    assert.ok(/learningPhase:\s*"human_active"/.test(embudoSrc), embudoSrc.slice(0, 200));
    assert.ok(/syncHumanPhaseLead/.test(embudoSrc));

    // Pipeline Humano Trabaja ya no debe forzar extract:false.
    assert.ok(!/syncHumanPhaseLead\([\s\S]*extract:\s*false/.test(kommoSrc));
    assert.ok(/syncHumanPhaseLead\([\s\S]*extract:\s*true/.test(kommoSrc));
    assert.ok(/kommoTalkId/.test(kommoSrc));

    // Tras sync de chat inactivo → extracción.
    assert.ok(/extractLearningCandidatesForLead/.test(ingestSrc));
    assert.ok(/resolveKommoTalkId|fetchTalkIdFromLeadChats/.test(talksSrc));

    // Auto-approve alta confianza + throttle más corto que 6h.
    assert.ok(/AUTO_APPROVE_CONFIDENCE/.test(extractorSrc));
    assert.ok(/approveLearningCandidate/.test(extractorSrc));
    assert.ok(!/6 \* 60 \* 60 \* 1000/.test(extractorSrc));

    // Keep-alive dispara el cron de aprendizaje.
    assert.ok(/kommo\/cron\/learning/.test(keepAlive));

    // Panel /aprendizaje muestra aprendizaje de chats (no solo knowledge-gaps).
    assert.ok(/aprendizaje\/from-chats/.test(learningRoutes));
    assert.ok(/aprendizaje\/from-chats/.test(panelApp));
    assert.ok(/Sincronizar chats|kommo\/cron\/learning/.test(panelApp));

    // learningRouter debe montarse ANTES de examples (requireAuth global).
    const routesIndex = readFileSync(path.join(apiRoot, "src/routes/index.ts"), "utf8");
    const learningMount = routesIndex.indexOf("router.use(learningRouter)");
    const examplesMount = routesIndex.indexOf("router.use(examplesRouter)");
    assert.ok(
      learningMount > 0 && examplesMount > 0 && learningMount < examplesMount,
      "learningRouter debe ir antes de examplesRouter para no bloquear GET públicos"
    );
  });

  await test("66. Brief multi-servicio Alexa + salón/edificio no es ubicación", () => {
    const alexaBrief =
      "Hola, para un corporativo necesito coffee break, desayuno, snack, comida, cena y menú staff para 80 personas el 12 de septiembre en Polanco";
    const services = parseServicesFromText(alexaBrief);
    assert.ok(services.length >= 5, `esperaba ≥5 servicios, got ${services.join(", ")}`);
    assert.ok(services.some((s) => /coffee/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /desayuno/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /snack/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /^comida$/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /cena/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /staff|meseros/i.test(s)), services.join(", "));

    const extracted = emptyExtracted();
    enrichExtractedFromConversation(extracted, alexaBrief);
    assert.ok(
      (extracted.requerimientos_evento ?? "").split(",").length >= 5,
      extracted.requerimientos_evento
    );
    assert.ok(/polanco/i.test(extracted.direccion_evento ?? ""), extracted.direccion_evento);
    assert.equal(extracted.num_invitados, 80);

    // Misma captura por WhatsApp directo (guards) — primer turno con intro + lista.
    const waReply = runGuards({
      aiResponse: "¿Qué servicios te gustaría cotizar?",
      extracted: emptyExtracted(),
      filledSet: new Set<string>(),
      readyForClosing: false,
      currentMessage: alexaBrief,
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(/hola[!.,]?\s*(?:buen\s+d[ií]a[.!]?\s*)?soy\s+lucy/i.test(waReply), waReply.slice(0, 280));
    assert.ok(/coffee/i.test(waReply), waReply.slice(0, 500));
    assert.ok(/desayuno/i.test(waReply), waReply.slice(0, 500));
    assert.ok(/cena/i.test(waReply), waReply.slice(0, 500));
    assert.ok(/snack|comida|staff|meseros/i.test(waReply), waReply.slice(0, 500));

    // Turno siguiente (ya con nombre): sigue reconociendo el paquete completo.
    const midReply = runGuards({
      aiResponse: "¿Solo el coffee break?",
      extracted: emptyExtracted({
        nombre: "Alexa",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Coffee break",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage:
        "Además necesito desayuno, snack, comida, cena y menú staff",
      history: [
        { role: "user", content: alexaBrief },
        { role: "assistant", content: "Hola, soy Lucy. ¿Me regalas tu nombre?" },
        { role: "user", content: "Alexa" },
        { role: "assistant", content: "Perfecto, Alexa. ¿Me confirmas los servicios?" },
      ],
    });
    assert.ok(/desayuno/i.test(midReply), midReply.slice(0, 400));
    assert.ok(/cena/i.test(midReply), midReply.slice(0, 400));
    assert.ok(/todo eso|paquete|cat[aá]logos?/i.test(midReply), midReply.slice(0, 400));

    // Pre-fill web con varios servicios → misma lista.
    const webMsg =
      "Hola, me interesa cotizar para mi evento: corporativo coffee break desayuno snack comida cena menú staff. Sería el 12 de septiembre en Polanco para 80 personas";
    const brief = parseWebLeadBrief(webMsg);
    assert.ok(brief);
    const webExtracted = emptyExtracted();
    applyWebLeadBrief(webExtracted, webMsg);
    enrichExtractedFromConversation(webExtracted, webMsg);
    const webServices = parseServicesFromText(webExtracted.requerimientos_evento ?? webMsg);
    assert.ok(webServices.length >= 4, webExtracted.requerimientos_evento);

    const webReply = runGuards({
      aiResponse: "¿Qué servicios te gustaría cotizar?",
      extracted: webExtracted,
      filledSet: new Set<string>(),
      readyForClosing: false,
      currentMessage: webMsg,
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(/coffee|desayuno|comida|cena/i.test(webReply), webReply.slice(0, 400));

    // "salón" / "edificio" no cierran ubicación.
    assert.equal(parseZonaFromText("en el salón"), null);
    assert.equal(parseZonaFromText("en el edificio"), null);
    assert.ok(isVagueVenueOnly("salón"));
    assert.ok(isVagueVenueOnly("edificio"));
    assert.ok(isVagueVenueOnly("salón de eventos"));
    assert.ok(!isUsableDireccionEvento("salón"));
    assert.ok(isUsableDireccionEvento("Polanco CDMX"));
    assert.ok(!isUsableDireccionEvento("Salón Hacienda Los Olivos"));
    assert.ok(isUsableDireccionEvento("Salón Hacienda Los Olivos, CDMX"));
    assert.ok(isVenueWithoutCity("Salón Hacienda Los Olivos"));
    assert.ok(!isVenueWithoutCity("Salón Hacienda Los Olivos en Polanco"));

    // V9.29: empresa / espacio / "un ratito" ≠ dirección.
    assert.equal(parseZonaFromText("en la empresa"), null);
    assert.equal(parseZonaFromText("en nuestro espacio"), null);
    assert.ok(isVagueVenueOnly("empresa"));
    assert.ok(isVagueVenueOnly("nuestra empresa"));
    assert.ok(isVagueVenueOnly("nuestro espacio"));
    assert.ok(isLocationDeferralOrVagueWorkplace("nuestra empresa, un ratito"));
    assert.ok(isLocationDeferralOrVagueWorkplace("un ratito"));
    assert.ok(isLocationDeferralOrVagueWorkplace("ahorita te digo"));
    assert.ok(!isUsableDireccionEvento("nuestra empresa, un ratito"));
    assert.ok(!isUsableDireccionEvento("nuestra empresa"));
    assert.ok(!isUsableDireccionEvento("espacio"));
    assert.ok(!isUsableDireccionEvento("un ratito"));
    assert.equal(
      sanitizeExtractedFromExternal(
        emptyExtracted({ direccion_evento: "nuestra empresa, un ratito" })
      ).direccion_evento,
      null
    );

    const vagueLoc = emptyExtracted({ direccion_evento: "salón" });
    const cleaned = sanitizeExtractedFromExternal(vagueLoc);
    assert.equal(cleaned.direccion_evento, null);

    const pendingZona = getNextPendingField(
      emptyExtracted({
        nombre: "Alexa",
        correo: "a@x.com",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Coffee break, Desayuno",
        direccion_evento: "salón",
        fecha_horario: "12 de septiembre",
        num_invitados: 80,
        presupuesto: null,
      }),
      new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Fecha y horario",
        "Número de invitados",
      ])
    );
    assert.equal(pendingZona, "zona");

    // Merge no se queda con el primero.
    const merged = mergeServiceRequirements("Coffee break", alexaBrief, 6);
    assert.ok(merged && merged.split(",").length >= 5, merged);
  });

  await test("70. Ximena A14889 — graduación ofrece abanico amplio (no solo 3 ítems)", () => {
    assert.equal(parseTipoEventoFromText("Graduación"), "graduación");
    assert.ok(!isNarrowSocialEventOffer(buildBroadLevel1Offer("graduación"), "graduación"));

    const services = listCatalogServicesForEvent("graduación");
    assert.ok(services.length >= 6, services.join(", "));
    assert.ok(services.some((s) => /alimento|banquete|taquiza|brunch/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /dj|ilumin/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /mobiliario/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /pista|tarima|carpa|pantalla|audio/i.test(s)), services.join(", "));

    const narrowAi =
      "Para tu graduación, podemos ofrecerte varios servicios que podrían encajar bien:\n" +
      "• *Mobiliario*: Mesas y sillas para tus invitados.\n" +
      "• *Barras de bebidas*: Incluyendo opciones de coctelería o bebidas no alcohólicas.\n" +
      "• *Mesa de dulces*: Para un toque especial en la celebración.\n" +
      "¿Qué te gustaría ir armando primero?";
    assert.ok(isNarrowSocialEventOffer(narrowAi, "graduación"));
    assert.ok(countOfferCategories(narrowAi) < 5);

    const filled = new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]);
    const reply = runGuards({
      aiResponse: narrowAi,
      extracted: emptyExtracted({
        nombre: "Ximena Fuentes",
        correo: "x@test.com",
        tipo_evento: "graduación",
      }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Graduación",
      history: [{ role: "assistant", content: "¿Qué tipo de celebración es?" }],
    });
    assert.ok(countOfferCategories(reply) >= 5, reply.slice(0, 600));
    assert.ok(/alimento|banquete|taquiza|brunch/i.test(reply), reply.slice(0, 500));
    assert.ok(/dj/i.test(reply), reply.slice(0, 500));
    assert.ok(/pista|tarima|carpa|pantalla|audio/i.test(reply), reply.slice(0, 500));
    assert.ok(!/^Para tu graduación[\s\S]*Mobiliario[\s\S]*Barras de bebidas[\s\S]*Mesa de dulces[\s\S]*armando primero\?$/i.test(reply.trim()));

    const hint = buildEventOfferCatalogHint("graduación") ?? "";
    assert.ok(/AMPLIO|mínimo 6|NUNCA te limites/i.test(hint), hint.slice(0, 400));
  });

  await test("69. Alejandra A14893 — RFQ B2B: leer brief, catálogo, cierre, llamada, sin SKU", () => {
    const alejandraBrief = [
      "Buenas tardes!! Quiero pedirte tu apoyo con una cotización para un evento corporativo",
      "el próximo 15 de agosto, en Santa Fe, Ciudad de México.",
      "En Punto de Imagen ALRO somos distribuidores de artículos promocionales.",
      "Asistentes: 200 personas. Horario para servir alimentos: 5:00 p.m.",
      "Me gustaría tres propuestas de menú, con diferentes rangos de precio.",
      "Opción 1 – Parrillada (arrachera, carne asada, BBQ, chorizo, brochetas, verduras, aguas).",
      "Opción 2 – Parrillada con excelente relación costo-beneficio.",
      "Opción 3 – Menú Casual: hamburguesas, hot dogs, papas, aguas frescas.",
      "Incluir: servicio de meseros, mesas redondas, mantelería, cristalería, cubiertos,",
      "sillas con fundas, montaje y desmontaje. Fotografías del mobiliario.",
      "Mejor precio para distribuidor; no somos el cliente final; margen comercial.",
      "Sin perder de vista el presupuesto.",
    ].join(" ");

    // Ruta A — detectores
    assert.ok(isRichQuoteBrief(alejandraBrief), "debe detectar RFQ largo");
    assert.ok(!detectPresupuestoRefusal(alejandraBrief), "RFQ ≠ sin presupuesto");
    assert.ok(!clientAsksPrice(alejandraBrief), "RFQ ≠ pregunta de precio SKU");
    assert.ok(clientAsksDistributorPricing(alejandraBrief));
    const services = parseServicesFromText(alejandraBrief);
    assert.ok(services.some((s) => /parrillada/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /meseros/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /mobiliario/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /casual|hamburguesa/i.test(s)), services.join(", "));

    // Ruta B — primer turno: intro + ack del brief + catálogo + nombre (NO "lo dejamos por definir")
    const first = runGuards({
      aiResponse: "¿Qué servicios te gustaría cotizar?",
      extracted: emptyExtracted(),
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage: alejandraBrief,
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(/hola[!.,]?\s*(?:buen\s+d[ií]a[.!]?\s*)?soy\s+lucy/i.test(first), first.slice(0, 300));
    assert.ok(!/lo dejamos por definir/i.test(first), first.slice(0, 400));
    assert.ok(/15 de agosto|santa fe|200/i.test(first), first.slice(0, 500));
    assert.ok(/parrillada|men[uú]\s+casual|tres propuestas/i.test(first), first.slice(0, 600));
    assert.ok(/distribuidor|mayoreo/i.test(first), first.slice(0, 600));
    assert.ok(first.includes(CATALOG_URL) || /cat[aá]logo/i.test(first), first.slice(0, 700));
    assert.ok(/nombre|c[oó]mo te llamas|regalas/i.test(first), first.slice(0, 700));

    // Ruta C — "Favor de leer especificaciones": re-ack + catálogo, no solo empujar correo
    const reread = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Alejandra Velázquez",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Mobiliario, Meseros, Parrillada, Menú Casual",
        direccion_evento: "Santa Fe, Ciudad de México",
        fecha_horario: "15 de agosto, 5:00 p.m.",
        num_invitados: 200,
        presupuesto: "Sin definir (cliente indicó que no tiene)",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Número de invitados",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: false,
      currentMessage: "Favor de leer muy bien las especificaciones",
      history: [
        { role: "user", content: alejandraBrief },
        { role: "assistant", content: "Hola, soy Lucy. ¿Me regalas tu nombre?" },
        { role: "user", content: "Alejandra Velázquez" },
        {
          role: "assistant",
          content: "Perfecto, veo que necesitas Mobiliario. ¿A qué correo te lo envío?",
        },
      ],
    });
    assert.ok(clientAsksToRereadBrief("Favor de leer muy bien las especificaciones"));
    assert.ok(/reviso|revis[eé]|anoto|solicitud|propuestas/i.test(reread), reread.slice(0, 500));
    assert.ok(reread.includes(CATALOG_URL) || /cat[aá]logo/i.test(reread), reread.slice(0, 600));

    // Ruta D — cierre multi-servicio: ofrecimiento final + catálogo
    const close = runGuards({
      aiResponse: "Información completa",
      extracted: emptyExtracted({
        nombre: "Alejandra Velázquez",
        correo: "alejandra@puntodeimagen.mx",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Mobiliario, Meseros, Parrillada, Menú Casual",
        direccion_evento: "Santa Fe, Ciudad de México",
        fecha_horario: "15 de agosto, 5:00 p.m.",
        num_invitados: 200,
        presupuesto: "Sin definir",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Número de invitados",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: true,
      currentMessage: "alejandra@puntodeimagen.mx",
    });
    assert.ok(/perfecto, ya tengo todo/i.test(close), close.slice(0, 400));
    assert.ok(/alimentos|mobiliario|DJ|iluminaci/i.test(close), close);
    assert.ok(close.includes(CATALOG_URL), close);

    // Ruta E — pedir llamada post-cierre: teléfonos; gracias después no repite cierre genérico
    assert.ok(
      clientRequestsCallback("Me gustaría una atención personalizada. Si me pueden marcar por favor")
    );
    const callFilled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Número de invitados",
      "Presupuesto (MXN)",
    ]);
    const callExtracted = emptyExtracted({
      nombre: "Alejandra Velázquez",
      correo: "alejandra@puntodeimagen.mx",
      tipo_evento: "evento corporativo",
      requerimientos_evento: "Mobiliario, Meseros, Parrillada",
      direccion_evento: "Santa Fe",
      fecha_horario: "15 de agosto",
      num_invitados: 200,
      presupuesto: "Sin definir",
    });
    const callReply = applyLucyMessageGuards({
      aiResponse: "ok",
      extracted: callExtracted,
      filledSet: callFilled,
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: [{ role: "assistant", content: "Perfecto, ya tengo todo. Le paso a nuestro equipo." }],
      currentMessage: "Me gustaría una atención personalizada. Si me pueden marcar por favor",
      buildClosing: mockClosing,
    });
    assert.ok(/4008|4671/.test(callReply), callReply.slice(0, 400));
    assert.ok(/asesor|atender/i.test(callReply), callReply.slice(0, 400));

    const callPost = applyLucyMessageGuards({
      aiResponse: "ok",
      extracted: callExtracted,
      filledSet: new Set(callFilled),
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: [{ role: "assistant", content: buildPhoneAnswer() }],
      currentMessage: "Gracias",
      buildClosing: mockClosing,
    });
    assert.ok(/asesor|n[uú]meros|atender/i.test(callPost), callPost);
    assert.ok(!/ya tengo todo/i.test(callPost), callPost);

    // Ruta F — segundo RFQ post-cierre (con DJ): paquete + catálogo, NO SKU $930
    const briefConDj =
      alejandraBrief +
      " Adicionalmente dos escenarios: con DJ e iluminación, y sin DJ ni iluminación. Precio para distribuidor.";
    const postRfq = applyLucyMessageGuards({
      aiResponse:
        "Sí, manejamos *Parrillada Argentina — Premium*. *Precio:* $930.00 /pp (mín. $27,900.00)",
      extracted: emptyExtracted({
        nombre: "Alejandra Velázquez",
        correo: "alejandra@puntodeimagen.mx",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Mobiliario, Meseros, Parrillada, Menú Casual",
        direccion_evento: "Santa Fe, Ciudad de México",
        fecha_horario: "15 de agosto, 5:00 p.m.",
        num_invitados: 200,
        presupuesto: "Sin definir",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Número de invitados",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: [{ role: "assistant", content: "Perfecto, ya tengo todo." }],
      currentMessage: briefConDj,
      buildClosing: mockClosing,
    });
    assert.ok(!/\$\s*930/i.test(postRfq), postRfq.slice(0, 500));
    assert.ok(!/Premium.*\/pp|mín\./i.test(postRfq), postRfq.slice(0, 500));
    assert.ok(/parrillada|men[uú]|meseros|mobiliario|dj|iluminaci/i.test(postRfq), postRfq.slice(0, 700));
    assert.ok(postRfq.includes(CATALOG_URL) || /cat[aá]logo/i.test(postRfq), postRfq.slice(0, 700));
    assert.ok(/mayoreo|distribuidor|equipo/i.test(postRfq), postRfq.slice(0, 700));

    // Helpers de paquete
    const pkg = buildMultiServicePackageReply(
      ["Parrillada", "Meseros", "Mobiliario"],
      alejandraBrief
    );
    assert.ok(pkg.includes(CATALOG_URL), pkg);
    assert.ok(buildPackageCatalogOfferBlock().includes(CATALOG_OFFER_QUESTION));
    assert.ok(
      buildStandardClosingMessage("Mobiliario, Meseros, Parrillada", "Alejandra").includes(
        CATALOG_URL
      )
    );
    assert.ok(
      !buildStandardClosingMessage("banquete", "Ana").includes(CATALOG_URL)
    );
    assert.ok(/Alejandra/.test(buildPostCierreCallbackAck("Alejandra")));
    assert.ok(/corporativo|15 de agosto|200/i.test(buildRichBriefAcknowledgment(alejandraBrief)));
  });

  await test("71. Núria A14894 — post-cierre No. Gracias no reinicia embudo", () => {
    assert.ok(clientDeclinesMoreServices("No. Gracias"));
    assert.ok(clientDeclinesMoreServices("No, gracias"));
    assert.ok(clientSaysThanks("No. Gracias"));

    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Presupuesto (MXN)",
    ]);
    const reply = applyLucyMessageGuards({
      aiResponse: "¿Me regalas tu correo para enviarte la cotización?",
      extracted: emptyExtracted({
        nombre: "Núria",
        correo: "nuria@example.com",
        tipo_evento: "fiesta",
        requerimientos_evento: "Barra de pastas, Barra de pizzas",
        direccion_evento: "Querétaro, El Marqués",
        fecha_horario: "Sin definir (pendiente)",
        num_invitados: 80,
        presupuesto: "Sin definir",
      }),
      filledSet: filled,
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: [{ role: "assistant", content: "Perfecto, ya tengo todo." }],
      currentMessage: "No. Gracias",
      buildClosing: mockClosing,
    });
    assert.ok(/con gusto|equipo/i.test(reply), reply);
    assert.ok(!/correo|e-?mail/i.test(reply), `no debe pedir correo: ${reply}`);
    assert.ok(filled.has("Correo electrónico"));
  });

  await test("72. Núria A14894 — cotización genérica ≠ requerimiento; toscana/pastas", () => {
    assert.ok(isGenericQuoteIntentRequerimiento("Quiero una cotización"));
    assert.ok(!isValidRequerimientosValue("Quiero una cotización"));
    assert.ok(!isValidRequerimientosValue("cotización"));
    assert.equal(parseTipoEventoFromText("Fiesta toscana"), "fiesta");
    assert.ok(clientMentionsItalianTheme("Fiesta toscana"));
    assert.ok(!isValidRequerimientosValue("Fiesta toscana"));

    const services = parseServicesFromText("Solo barra de pastas y pizzas");
    assert.ok(services.some((s) => /pasta/i.test(s)), String(services));
    assert.ok(services.some((s) => /pizza/i.test(s)), String(services));
    assert.ok(services.length >= 2, String(services));

    const italianFirst = buildFirstInteractionMessage(
      {
        extracted: emptyExtracted(),
        filledSet: new Set(),
        history: [],
        currentMessage: "Fiesta toscana",
      },
      true
    );
    assert.ok(/pasta|pizza|italian|antipasti/i.test(italianFirst), italianFirst);

    const sanitized = sanitizeExtractedFromExternal({
      ...emptyExtracted(),
      requerimientos_evento: "Quiero una cotización",
      nombre: "Núria",
    });
    assert.equal(sanitized.requerimientos_evento, null);

    const pending = getNextPendingField(
      emptyExtracted({
        nombre: "Núria",
        correo: "nuria@example.com",
        tipo_evento: "fiesta",
        requerimientos_evento: "Quiero una cotización",
      }),
      new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"])
    );
    assert.equal(pending, "requerimientos");
  });

  await test("73. Núria A14894 — zona/fecha sin dobles + nombre tras correo", () => {
    assert.ok(/marqu/i.test(parseZonaFromText("El Marques") ?? ""));
    assert.ok(/quer/i.test(parseZonaFromText("Querétaro") ?? ""));
    assert.equal(
      mergeZonaDetail("Querétaro", "El Marqués"),
      "Querétaro, El Marqués"
    );

    const filledZona = new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]);
    const extractedZona = emptyExtracted({
      nombre: "Núria",
      correo: "nuria@example.com",
      tipo_evento: "fiesta",
      direccion_evento: "Querétaro",
    });
    // Con ciudad usable en extracted, no forzar otra pregunta de zona al pedir fecha.
    const zonaGuard = runGuards({
      aiResponse: "¿Me confirmas la colonia o salón del evento?",
      extracted: extractedZona,
      filledSet: filledZona,
      readyForClosing: false,
      currentMessage: "Querétaro",
      history: [
        { role: "assistant", content: "¿En qué ciudad o zona sería el evento?" },
        { role: "user", content: "Querétaro" },
      ],
      buildClosing: mockClosing,
    });
    assert.ok(
      !mensajeAsksForField(zonaGuard, "zona") || /fecha|invitad|presupuesto|servicio|pasta|pizza/i.test(zonaGuard),
      `no debe insistir zona: ${zonaGuard.slice(0, 220)}`
    );

    assert.equal(FECHA_MAX_ASKS, 2);
    assert.ok(parseFechaFromText("todavía no la definimos"));
    assert.ok(parseFechaFromText("aún no tenemos fecha"));

    // Nombre no duplicado tras capturar correo.
    const emailTone = runGuards({
      aiResponse: "Núria. ¿Qué tipo de celebración es?",
      extracted: emptyExtracted({ nombre: "Núria", correo: "nuria@example.com" }),
      filledSet: new Set(["Nombre del cliente", "Correo electrónico"]),
      readyForClosing: false,
      currentMessage: "nuria@example.com",
      history: [{ role: "assistant", content: "¿Me regalas tu correo?" }],
    });
    assert.ok(/gracias por tu correo,\s*Núria/i.test(emailTone), emailTone);
    assert.ok(!/Núria\.\s*Núria/i.test(emailTone), emailTone);

    // Follow-up vago enumera servicios (post-cierre directo).
    const vague = applyLucyMessageGuards({
      aiResponse: "Perfecto, actualizo estos servicios en tu cotización. ¿Algo más?",
      extracted: emptyExtracted({
        nombre: "Núria",
        correo: "nuria@example.com",
        tipo_evento: "fiesta",
        requerimientos_evento: "Barra de pastas, Barra de pizzas",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: [{ role: "assistant", content: "Perfecto, ya tengo todo." }],
      currentMessage: "Solo barra de pastas y pizzas",
      buildClosing: mockClosing,
    });
    assert.ok(/pasta/i.test(vague) && /pizza/i.test(vague), vague.slice(0, 400));
  });

  await test("74. Anti-repetición global — filtro outbound", () => {
    assert.equal(
      lucyTextOverlapRatio(
        "¿Me confirmas la ciudad o colonia del evento?",
        "¿Me confirmas la ciudad o colonia del evento?"
      ),
      1
    );
    assert.ok(
      lucyTextOverlapRatio(
        "Perfecto. Lo sumo a tu cotización. ¿Algo más que quieras agregar?",
        "Perfecto, Núria. Lo sumo a tu cotización. ¿Algo más que quieras agregar?"
      ) >= 0.65
    );

    // Casi idéntico al turno anterior → no reenvía el mismo bloque.
    const dup = applyLucyGlobalAntiRepetition({
      mensaje: "¿Me confirmas la ciudad o colonia del evento?",
      history: [
        {
          role: "assistant",
          content: "¿Me confirmas la ciudad o colonia del evento?",
        },
      ],
      filledSet: new Set(["Nombre del cliente"]),
      extracted: emptyExtracted({ nombre: "Núria" }),
    });
    assert.ok(dup.applied.length > 0, String(dup.applied));
    assert.ok(
      lucyTextOverlapRatio(dup.mensaje, "¿Me confirmas la ciudad o colonia del evento?") < 0.72 ||
        !/ciudad o colonia/i.test(dup.mensaje),
      dup.mensaje
    );

    // Post-cierre: segundo "gracias" no repite el mismo ack largo.
    const thanks1 =
      "¡Con gusto, Núria! Nuestro equipo ya tiene tus datos para la cotización. Si necesitas algo más, aquí estamos.";
    const thanks2 = applyLucyGlobalAntiRepetition({
      mensaje: thanks1,
      history: [{ role: "assistant", content: thanks1 }],
      cierreYaEnviado: true,
      clientName: "Núria",
      extracted: emptyExtracted({ nombre: "Núria" }),
    });
    assert.ok(thanks2.applied.includes("postcierre-thanks-dedupe"), String(thanks2.applied));
    assert.ok(/con gusto/i.test(thanks2.mensaje), thanks2.mensaje);
    assert.ok(lucyTextOverlapRatio(thanks2.mensaje, thanks1) < 0.9, thanks2.mensaje);

    // Post-cierre: segundo "¿algo más?" se corta.
    const algo = applyLucyGlobalAntiRepetition({
      mensaje: "Perfecto. Lo sumo a tu cotización. ¿Algo más que quieras agregar?",
      history: [
        {
          role: "assistant",
          content: "Perfecto, Núria. Lo sumo a tu cotización. ¿Algo más que quieras agregar?",
        },
      ],
      cierreYaEnviado: true,
      clientName: "Núria",
    });
    assert.ok(
      algo.applied.includes("postcierre-algo-mas-dedupe") ||
        algo.applied.includes("near-duplicate-postcierre"),
      String(algo.applied)
    );
    assert.ok(!ALGO_MAS_OR_EMPTY(algo.mensaje), algo.mensaje);

    // Campo ya capturado: quita la re-pregunta de correo.
    const filledAsk = applyLucyGlobalAntiRepetition({
      mensaje: "Genial. ¿Me compartes tu correo para enviarte la info?",
      history: [{ role: "assistant", content: "¿Qué servicios te gustaría?" }],
      filledSet: new Set(["Nombre del cliente", "Correo electrónico"]),
      extracted: emptyExtracted({ nombre: "Ana", correo: "ana@test.com" }),
    });
    assert.ok(
      filledAsk.applied.includes("filled-field-strip") ||
        filledAsk.applied.includes("filled-field-ack") ||
        filledAsk.applied.includes("filled-field-strip-continue") ||
        filledAsk.applied.includes("dead-end-ack-continue"),
      String(filledAsk.applied)
    );
    assert.ok(!mensajeAsksForField(filledAsk.mensaje, "correo"), filledAsk.mensaje);
    // V9.26: tras quitar re-pregunta de correo, debe seguir el embudo (no solo "anotado").
    assert.ok(/\?/.test(filledAsk.mensaje), filledAsk.mensaje);
    assert.ok(!/^Perfecto[^.]*anotad[oa]\.?\s*$/i.test(filledAsk.mensaje.trim()), filledAsk.mensaje);

    // Paráfrasis del mismo campo (planeando → organizando) no se reenvía igual.
    const paraphrase = applyLucyGlobalAntiRepetition({
      mensaje: "Perfecto, Nicole. ¿Qué tipo de evento estás organizando?",
      history: [
        {
          role: "assistant",
          content: "Gracias por tu correo, Nicole. ¿Qué tipo de evento estás planeando?",
        },
      ],
      filledSet: new Set(["Nombre del cliente", "Correo electrónico"]),
      extracted: emptyExtracted({ nombre: "Nicole", correo: "n@test.com" }),
      clientName: "Nicole",
    });
    assert.ok(
      paraphrase.applied.some((a) => a.startsWith("same-field") || a.startsWith("near-duplicate")),
      String(paraphrase.applied)
    );
    assert.ok(
      lucyTextOverlapRatio(
        paraphrase.mensaje,
        "¿Qué tipo de evento estás planeando?"
      ) < 0.9 || paraphrase.applied.includes("same-field-reask-ack"),
      paraphrase.mensaje
    );

    // Segundo envío de catálogo se corta.
    const catalog2 = applyLucyGlobalAntiRepetition({
      mensaje:
        "Perfecto, veo que necesitas Comida y Pastas.\n\nTe dejo el catálogo general para que veas montajes, menús y opciones:\nhttps://bodasesor.com/catalogos\n\n¿Quieres que te mande el catálogo con más detalle?\n\n¿Qué tipo de evento es?",
      history: [
        {
          role: "assistant",
          content:
            "Perfecto, veo que necesitas Comida y Pastas.\n\nTe dejo el catálogo general para que veas montajes, menús y opciones:\nhttps://bodasesor.com/catalogos\n\n¿Quieres que te mande el catálogo con más detalle?\n\n¿Qué tipo de evento es?",
        },
      ],
      filledSet: new Set(["Nombre del cliente", "Correo electrónico", "Requerimientos o servicios"]),
      extracted: emptyExtracted({
        nombre: "Nicole",
        correo: "n@test.com",
        requerimientos_evento: "Comida, Pastas",
      }),
      clientName: "Nicole",
      currentMessage: "cumpleaños",
    });
    assert.ok(
      catalog2.applied.includes("catalog-resend-dedupe") ||
        !/bodasesor\.com\/catalogos/i.test(catalog2.mensaje),
      `${catalog2.applied.join(",")} | ${catalog2.mensaje.slice(0, 300)}`
    );
    assert.ok(!/bodasesor\.com\/catalogos/i.test(catalog2.mensaje), catalog2.mensaje.slice(0, 300));

    // Fragmento roto tras strip.
    const broken = cleanupBrokenOutboundFragments(
      "Hola, Nicole. con la cotización. ¿A qué correo te envío la información?"
    );
    assert.ok(!/\.\s+con la cotizaci/i.test(broken), broken);
    assert.ok(/correo/i.test(broken), broken);

    const doublePerf = cleanupBrokenOutboundFragments(
      "Perfecto, Nicole. Perfecto. Nicole, ¿tienen día u horario ya definido?"
    );
    assert.ok(!/Perfecto\.\s*Nicole/i.test(doublePerf), doublePerf);
    assert.equal(
      (doublePerf.match(/Perfecto/gi) ?? []).length,
      1,
      doublePerf
    );
    assert.ok(/horario|fecha|d[ií]a/i.test(doublePerf), doublePerf);
  });

  await test("75. María A14906 — salas≠invitados, Luxor≠zona, carpas con medidas", () => {
    assert.equal(parseInvitadosFromText("Serían 4 salas"), null);
    assert.equal(parseInvitadosFromText("serían 4 mesas"), null);
    assert.ok(parseInvitadosFromText("serían 40 personas") === "40");

    assert.ok(parseSalaProductFromText("cotizar la sala: Luxor Rosa")?.includes("Luxor"));
    assert.ok(parseSalaProductFromText("Serían 4 salas")?.includes("4"));
    assert.ok(isLikelyProductNameNotLocation("Luxor Rosa"));
    assert.ok(isLikelyProductNameNotLocation("sala: Luxor Rosa"));
    assert.equal(isUsableDireccionEvento("Luxor Rosa"), false);
    assert.equal(parseZonaFromText("sala: Luxor Rosa"), null);
    assert.ok(isUsableDireccionEvento("Polanco, CDMX"));

    const services = parseServicesFromText(
      "Hola, me interesa cotizar la sala: Luxor Rosa. Serían 4 salas"
    );
    assert.ok(services.some((s) => /sala|luxor/i.test(s)), String(services));

    assert.ok(clientAsksServiceInfo("¿Cuentan con carpas transparentes?"));
    assert.ok(clientMentionsCarpas("¿Cuentan con carpas transparentes?"));
    const carpasAck = buildGuardServiceAck("¿Cuentan con carpas transparentes?");
    assert.ok(/s[ií]|contamos|manejamos/i.test(carpasAck), carpasAck);
    assert.ok(/transparent/i.test(carpasAck), carpasAck);
    assert.ok(/agreg|cotiz/i.test(carpasAck), carpasAck);
    assert.ok(/medidas?/i.test(carpasAck), carpasAck);
    assert.ok(!/^¡?claro!.{0,40}la anoto/i.test(carpasAck), carpasAck);

    const carpasConsult = buildConsultativeNoPriceReply("¿Cuentan con carpas transparentes?");
    assert.ok(carpasConsult && /transparent|medidas?/i.test(carpasConsult), carpasConsult ?? "");

    // Flujo: pregunta carpas no se ignora; pide medidas.
    const carpasReply = runGuards({
      aiResponse: "¡Claro! Carpas la anoto para tu cotización.",
      extracted: emptyExtracted({
        nombre: "Maria",
        correo: "maria.gomez@gopop.mx",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "Sala Luxor Rosa",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "Cuentan con carpas transparentes ?",
      history: [
        { role: "assistant", content: "Gracias por tu correo, Maria. ¿Qué tipo de evento es?" },
        { role: "user", content: "Fiesta de cumpleaños" },
      ],
    });
    assert.ok(/s[ií]|contamos|manejamos|carpa/i.test(carpasReply), carpasReply.slice(0, 400));
    assert.ok(/medidas?/i.test(carpasReply), carpasReply.slice(0, 400));
    assert.ok(!/la anoto para tu cotizaci[oó]n\.?\s*$/i.test(carpasReply.trim()), carpasReply);

    // Correo: tras ask previo + "4 salas", acusa salas y no clona el mismo ask.
    const emailAgain = runGuards({
      aiResponse: "Mucho gusto, Maria. Para mandarte la info, ¿a qué correo te lo envío?",
      extracted: emptyExtracted({ nombre: "Maria" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "Serían 4 salas",
      history: [
        {
          role: "assistant",
          content:
            "Con gusto te apoyo con la cotización para el salón Luxor Rosa. ¿Me podrías proporcionar tu correo electrónico para enviarte la información?",
        },
      ],
      whatsappDisplayName: "Maria",
    });
    assert.ok(/sala|luxor|anoto/i.test(emailAgain), emailAgain.slice(0, 400));
    assert.ok(
      !/me podr[ií]as proporcionar tu correo electr[oó]nico/i.test(emailAgain),
      emailAgain.slice(0, 400)
    );

    // Producto no debe quedar como ubicación en sanitize.
    const clean = sanitizeExtractedFromExternal({
      ...emptyExtracted({ nombre: "Maria" }),
      direccion_evento: "Luxor Rosa",
      num_invitados: 4,
      requerimientos_evento: "Mobiliario",
    });
    assert.equal(clean.direccion_evento, null);

    // Con salas previas en historial, "¿carpas transparentes?" NO debe virar a RFQ/catálogo.
    const carpasVsRfq = runGuards({
      aiResponse: "Perfecto, veo que necesitas salas y carpas. Te dejo el catálogo.",
      extracted: emptyExtracted({
        nombre: "Maria",
        correo: "maria@test.com",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "4 salas Luxor Rosa",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "¿Cuentan con carpas transparentes?",
      history: [
        { role: "user", content: "sala: Luxor Rosa. Serían 4 salas" },
        { role: "assistant", content: "Perfecto, anoto 4 salas. ¿Qué tipo de evento es?" },
        { role: "user", content: "cumpleaños" },
      ],
    });
    assert.ok(/transparent|contamos|manejamos/i.test(carpasVsRfq), carpasVsRfq.slice(0, 400));
    assert.ok(/medidas?/i.test(carpasVsRfq), carpasVsRfq.slice(0, 400));
    assert.ok(!/bodasesor\.com\/catalogos/i.test(carpasVsRfq), carpasVsRfq.slice(0, 400));
  });

  await test("76. Nombre+apellido en CRM; Lucy saluda solo con nombre", () => {
    assert.equal(sanitizeCrmNombre("Patricia Campos"), "Patricia Campos");
    assert.equal(sanitizeDisplayName("Patricia Campos"), "Patricia");
    assert.equal(sanitizeCrmNombre("María José Pérez García"), "María José Pérez García");
    assert.equal(sanitizeDisplayName("María José Pérez García"), "María");
    assert.ok(looksLikePersonFullName("Patricia Campos López"));
    assert.equal(isLikelyNotPersonNameMessage("Patricia Campos López"), false);
    assert.equal(isLikelyNotPersonNameMessage("María José Pérez García"), false);

    const hist: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "user", content: "Hola, quiero cotizar" },
      { role: "assistant", content: "¿Me regalas tu nombre para iniciar?" },
      { role: "user", content: "Me llamo Patricia Campos" },
    ];
    assert.equal(recoverClienteNombreFromHistory(hist), "Patricia Campos");
    assert.equal(
      recoverClienteNombreFromHistory(
        [
          { role: "assistant", content: "¿Cómo te llamas?" },
        ],
        "Elena García López"
      ),
      "Elena García López"
    );

    assert.equal(pickBetterNombre("Patricia Campos", "Patricia"), "Patricia Campos");
    assert.equal(isNombreMoreComplete("Patricia Campos", "Patricia"), true);

    const captures = captureContextualAnswer(
      [{ role: "assistant", content: "¿Me regalas tu nombre para iniciar?" }],
      "Verónica Camarillo",
      new Set()
    );
    assert.ok(
      captures.some((c) => c.label === "Nombre del cliente" && c.value === "Verónica Camarillo"),
      JSON.stringify(captures)
    );

    const greet = buildCompanyIdentityReply("Patricia Campos");
    assert.ok(/¿Seguimos, Patricia\?/.test(greet), greet);
    assert.ok(!/Campos/.test(greet), greet);

    const thanks = buildPostCierreThanksReply("Patricia Campos");
    assert.ok(/¡Con gusto, Patricia!/.test(thanks), thanks);
    assert.ok(!/Campos/.test(thanks), thanks);

    assert.equal(parseNombreFromCrmLines(["- Nombre del cliente: Patricia Campos"]), "Patricia Campos");
  });

  await test("77. Multi-nivel — markdown del catálogo incluye descripción (Que Incluye)", () => {
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye"',
      '"Barra de bebidas","Basica","$150.00","$4,500.00","TRUE","Refrescos y aguas"',
      '"Barra de bebidas","Tradicional","$220.00","$6,600.00","TRUE","Refrescos, aguas y 2 licores"',
      '"Barra de bebidas","Premium","$320.00","$9,600.00","TRUE","Refrescos, aguas y 3 licores premium"',
    ].join("\n");
    const rows = parseSheetCatalogCsv(csv);
    setCatalogSnapshotForTests(rows);
    const md = sheetRowsToMarkdown(rows);
    assert.ok(/\$150/.test(md), md);
    assert.ok(/Incluye:.*Refrescos y aguas/i.test(md), md);
    assert.ok(/Incluye:.*2 licores/i.test(md), md);
    assert.ok(/Incluye:.*3 licores premium/i.test(md), md);

    assert.ok(clientAsksInclusion("dame la descripción de cada paquete"));
    assert.ok(clientAsksInclusion("qué incluye cada nivel y el precio"));
    assert.ok(
      messageOffersLevelsWithoutInclusions(
        "La barra viene en Básica $150, Tradicional $220 y Premium $320. ¿Cuál prefieres?"
      )
    );

    // Pregunta "qué incluye cada nivel" sin repetir el servicio → usa hint CRM.
    const withHint = resolveCatalogInclusionReply(
      "qué incluye cada nivel Básica Tradicional y Premium",
      "Barra de bebidas"
    );
    assert.ok(withHint && /Refrescos y aguas/i.test(withHint), withHint ?? "");
    assert.ok(/2 licores/i.test(withHint!), withHint);

    const guardIncl = runGuards({
      aiResponse: "Listo. Ana, ¿en qué zona o salón lo tendrían?",
      extracted: emptyExtracted({
        nombre: "Ana",
        tipo_evento: "boda",
        requerimientos_evento: "Barra de bebidas",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "qué incluye cada nivel Básica Tradicional y Premium",
      history: [
        { role: "user", content: "quiero barra de bebidas" },
        { role: "assistant", content: "Perfecto. ¿En qué ciudad será tu boda?" },
        { role: "user", content: "quiero barra de bebidas" },
        { role: "assistant", content: "Con gusto. Ana, ¿me confirmas la ciudad o colonia del evento?" },
      ],
    });
    assert.ok(/incluye/i.test(guardIncl), guardIncl.slice(0, 500));
    assert.ok(/Refrescos y aguas|2 licores|3 licores/i.test(guardIncl), guardIncl.slice(0, 500));

    // Anti-repeat no debe destruir detalle de catálogo (menús ≠ re-pregunta de reqs).
    const anti = applyLucyGlobalAntiRepetition({
      mensaje: `${guardIncl}\n\nEl detalle completo de menús e inclusiones está en el catálogo: https://bodasesor.com/catalogos/barra-de-bebidas`,
      history: [
        { role: "assistant", content: "¿Qué servicios te gustaría cotizar?" },
        { role: "user", content: "barra de bebidas" },
      ],
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      extracted: emptyExtracted({
        nombre: "Ana",
        tipo_evento: "boda",
        requerimientos_evento: "Barra de bebidas",
      }),
      clientName: "Ana",
    });
    assert.ok(!/Ya lo tengo anotado/i.test(anti.mensaje), anti.mensaje.slice(0, 300));
    assert.ok(/incluye|bodasesor\.com\/catalogos/i.test(anti.mensaje), anti.mensaje.slice(0, 400));

    // Caso vivo: Sheet sin Que Incluye + cliente pregunta descripciones con zona pendiente.
    const csvEmptyIncl = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye","Link catalogo"',
      '"Barra de bebidas","Basica","$150.00","$4,500.00","TRUE","","https://bodasesor.com/catalogos/barra-de-bebidas"',
      '"Barra de bebidas","Tradicional","$180.00","$5,400.00","TRUE","","https://bodasesor.com/catalogos/barra-de-bebidas"',
      '"Barra de bebidas","Premium","$200.00","$6,000.00","TRUE","","https://bodasesor.com/catalogos/barra-de-bebidas"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csvEmptyIncl));
    const emptyHint = resolveCatalogInclusionReply(
      "qué incluye cada nivel Básica Tradicional y Premium",
      "Barra de bebidas"
    );
    assert.ok(emptyHint, "debe haber respuesta aunque Que Incluye esté vacío");
    assert.ok(/bodasesor\.com\/catalogos|Incluye:/i.test(emptyHint!), emptyHint);

    const liveGuard = runGuards({
      aiResponse: "¿Cuál sería la ubicación del evento? Necesito ciudad y colonia o salón para cotizar bien.",
      extracted: emptyExtracted({
        nombre: "Ana",
        tipo_evento: "boda",
        requerimientos_evento: "Barra de bebidas",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "qué incluye cada nivel Básica Tradicional y Premium",
      history: [
        { role: "assistant", content: "¿En qué ciudad será tu boda?" },
        { role: "user", content: "barra de bebidas" },
        {
          role: "assistant",
          content:
            "Para la barra manejamos tres niveles. El equipo confirma qué incluye. ¿Cuál prefieres? ¿En qué ciudad?",
        },
      ],
    });
    assert.ok(
      /bodasesor\.com\/catalogos|Incluye:|nivel/i.test(liveGuard),
      `no debe quedar solo zona: ${liveGuard.slice(0, 400)}`
    );
    assert.ok(!/^¿Cuál sería la ubicación/i.test(liveGuard.trim()), liveGuard.slice(0, 200));
  });

  await test("78. Liliana A14916 — form Sushi ofrece solo vs completo tras el nombre", () => {
    assert.ok(
      clientMentionsCatering("Hola, me interesa cotizar: Barra de Sushi y Poke Bowl para Eventos")
    );
    const brief = parseWebLeadBrief(
      "Hola, me interesa cotizar: Barra de Sushi y Poke Bowl para Eventos"
    );
    assert.ok(brief?.requerimientos_evento, "brief form corto debe capturar servicio");
    assert.ok(/sushi/i.test(brief!.requerimientos_evento!), brief);

    const csvSushi = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye","Link catalogo"',
      '"Barra de sushi","Solo Alimentos","$420.00","$8,400.00","TRUE","","https://bodasesor.com/catalogos/barra-de-sushi"',
      '"Barra de sushi","Basico","$800.00","$16,000.00","TRUE","","https://bodasesor.com/catalogos/barra-de-sushi"',
      '"Barra de sushi","Tradicional","$850.00","$17,000.00","TRUE","","https://bodasesor.com/catalogos/barra-de-sushi"',
      '"Barra de sushi","Premium","$900.00","$18,000.00","TRUE","","https://bodasesor.com/catalogos/barra-de-sushi"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csvSushi));

    const formMsg = "Hola, me interesa cotizar: Barra de Sushi y Poke Bowl para Eventos";
    const t1 = runGuards({
      aiResponse: "¿Cómo te llamas?",
      extracted: emptyExtracted({ requerimientos_evento: "Barra de sushi" }),
      filledSet: new Set(["Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: formMsg,
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(/sushi|lucy/i.test(t1), t1.slice(0, 300));
    assert.ok(/nombre|llam[oa]|gusto/i.test(t1), `T1 debe pedir nombre: ${t1.slice(0, 300)}`);

    const t2 = runGuards({
      aiResponse: "Perfecto, Liliana. ¿A qué correo te envío la información?",
      extracted: emptyExtracted({
        nombre: "Liliana",
        requerimientos_evento: "Barra de sushi",
      }),
      filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "Liliana",
      history: [
        { role: "user", content: formMsg },
        {
          role: "assistant",
          content:
            "Hola, soy Lucy, agente virtual de Bodasesor. Vi que te interesa cotizar Sushi.\n\n¿Cómo te llamas?",
        },
      ],
    });
    assert.ok(
      /solo\s+alimentos/i.test(t2) && /servicio\s+completo/i.test(t2),
      `T2 solo vs completo: ${t2.slice(0, 500)}`
    );
    assert.ok(/cu[aá]l te late/i.test(t2), `T2 pregunta modo: ${t2.slice(0, 400)}`);
    assert.ok(
      !(/1\.\s*\*?Solo Alimentos[\s\S]*4\.\s*\*?Premium/i.test(t2)),
      `T2 sin dump 4 niveles: ${t2.slice(0, 500)}`
    );

    const premium = buildCatalogServiceDetailAnswer("Barra de sushi Premium");
    assert.ok(premium && /Premium|\$900/i.test(premium), premium?.slice(0, 400));
    const teaser = buildCatalogServiceDetailAnswer("Barra de sushi servicio completo");
    assert.ok(
      teaser && /3 niveles|montaje|meseros|detalles de alguno/i.test(teaser),
      teaser?.slice(0, 500)
    );
  });

  await test("79. Lorena A14918 — crepas: nombre≠pregunta, invitados niños+adultos, post-cierre corto", () => {
    // Bug 1: "tienes crepas para eventos" NO es nombre.
    assert.ok(isLikelyNotPersonNameMessage("tienes crepas para eventos"));
    assert.ok(isLikelyNotPersonNameMessage("Tienes Crepas Para Eventos"));
    assert.equal(sanitizeCrmNombre("tienes crepas para eventos"), null);
    assert.equal(sanitizeCrmNombre("Tienes Crepas Para Eventos"), null);
    assert.ok(isServiceRelatedMessage("tienes crepas para eventos"));

    // Bug 2: "8 niños y 18 adultos" → 26 invitados.
    assert.equal(parseInvitadosFromText("es un evento de 8 niños y 18 adultos"), "26");
    assert.equal(parseInvitadosFromText("18 adultos y 8 niños"), "26");

    // Bug 3: "Quiero hacer una cotizacion" no es requerimiento válido.
    assert.ok(isQuoteIntentMessage("Quiero hacer una cotizacion"));
    assert.ok(!isValidRequerimientosValue("Quiero hacer una cotizacion"));

    // Bug 4: post-cierre "helado, crepas y frutas" → ack corto, sin dump de niveles.
    assert.ok(clientAddsToQuote("queremos helado, crepas y frutas en vasito"));
    const services = parseServicesFromText("queremos helado, crepas y frutas en vasito");
    assert.ok(services.some((s) => /crepas/i.test(s)), String(services));
    assert.ok(services.some((s) => /helado/i.test(s)), String(services));

    const post = runGuards({
      aiResponse: "Para *Barra de Crepas* manejamos estos niveles:\n1. *Basico* — $730",
      extracted: emptyExtracted({
        nombre: "Lorena",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "Crepas",
        correo: "lorsgro@gmail.com",
        direccion_evento: "CDMX Lomas de Chapultepec",
        fecha_horario: "2 de agosto comida",
        num_invitados: 26,
        presupuesto: "Sin definir — proponer opciones",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Número de invitados",
        "Presupuesto",
      ]),
      readyForClosing: true,
      cierreYaEnviado: true,
      currentMessage: "queremos helado, crepas y frutas en vasito",
      history: [
        {
          role: "assistant",
          content:
            "Perfecto, ya tengo todo. Voy a compartir esta información con nuestro equipo para que te prepare una cotización personalizada.",
        },
      ],
    });
    assert.ok(/anoto|sume|helado|crepas|frutas/i.test(post), post.slice(0, 400));
    assert.ok(!/manejamos estos niveles|\$730|\$280/i.test(post), post.slice(0, 400));

    // Tras preguntar nombre, "tienes crepas…" no debe llenar Nombre.
    const badName = runGuards({
      aiResponse: "¿Cómo te llamas?",
      extracted: emptyExtracted(),
      filledSet: new Set<string>(),
      readyForClosing: false,
      currentMessage: "tienes crepas para eventos",
      history: [
        { role: "user", content: "Quiero hacer una cotizacion" },
        {
          role: "assistant",
          content: "Hola, soy Lucy. ¿Cómo te llamas?",
        },
      ],
    });
    assert.ok(!/mucho gusto,\s*tienes/i.test(badName), badName.slice(0, 300));
  });

  await test("80. Karina A14920 — maestro de ceremonias/show manda catálogo (no 'Ya lo tengo anotado')", () => {
    assert.ok(clientMentionsEntertainment("estaba buscando maestro de ceremonias y un show"));
    assert.ok(clientMentionsEntertainment("Disculpame, estaba buscando maestro de ceremonias y un show"));

    const banqueteMenu =
      "Perfecto, Karina. Para tus XV años, manejamos una variedad de servicios que pueden ser de interés:\n\n" +
      "• Banquete Formal 3 o 4 tiempos\n• Barra de bebidas\n• Mobiliario\n• DJ e iluminación\n• Pista de baile\n\n" +
      "¿Te gustaría revisar alguno de estos servicios en particular?";

    const reply = runGuards({
      aiResponse: "Perfecto, Karina Fierro. Ya lo tengo anotado.",
      extracted: emptyExtracted({
        nombre: "Karina Fierro",
        correo: "fierro.karina.tr@gmail.com",
        tipo_evento: "xv años",
        requerimientos_evento: "Banquete Formal",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "Disculpame, estaba buscando maestro de ceremonias y un show",
      history: [
        {
          role: "assistant",
          content: banqueteMenu,
        },
      ],
    });
    assert.ok(
      /maestro\s+de\s+ceremonias|show|animaci|hora\s+loca/i.test(reply),
      `debe ofrecer entretenimiento: ${reply.slice(0, 400)}`
    );
    assert.ok(
      /bodasesor\.com\/catalogos/i.test(reply),
      `debe mandar link de catálogo: ${reply.slice(0, 500)}`
    );
    assert.ok(!/Ya lo tengo anotado/i.test(reply), reply.slice(0, 300));

    // La malla anti-repeat (post-guards) no debe dejar solo la pregunta de zona.
    const afterAnti = applyLucyGlobalAntiRepetition({
      mensaje: reply,
      history: [{ role: "assistant", content: banqueteMenu }],
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      extracted: emptyExtracted({
        nombre: "Karina Fierro",
        correo: "fierro.karina.tr@gmail.com",
        tipo_evento: "xv años",
        requerimientos_evento: "Banquete Formal",
      }),
      currentMessage: "Disculpame, estaba buscando maestro de ceremonias y un show",
      clientName: "Karina Fierro",
    });
    assert.ok(
      !afterAnti.applied.includes("services-menu-dedupe"),
      `anti-repeat no debe dedupear menú de entretenimiento: ${afterAnti.applied.join(",")}`
    );
    assert.ok(
      /bodasesor\.com\/catalogos/i.test(afterAnti.mensaje),
      `catálogo debe sobrevivir anti-repeat: ${afterAnti.mensaje.slice(0, 500)}`
    );
    assert.ok(
      /maestro\s+de\s+ceremonias|shows?\s+en\s+vivo|hora\s+loca/i.test(afterAnti.mensaje),
      afterAnti.mensaje.slice(0, 400)
    );

    // Saludo no es servicio en resumen.
    const resumen = buildResumenClienteLargo(
      emptyExtracted({ nombre: "Karina" }),
      ["- Nombre del cliente: Karina"],
      "Buenas tardes"
    );
    assert.ok(!/Servicios:\s*Buenas\s+tardes/i.test(resumen), resumen);
  });

  await test("81. Nicole A14924 — nombre, quote≠servicio, un tipo ask, no re-dump, no reinicio", () => {
    // Nombre: "Me llamo Nicole" / "Hola, Lucy" / mashup
    assert.equal(sanitizeCrmNombre("Me llamo Nicole"), "Nicole");
    assert.equal(sanitizeCrmNombre("Me llamo NIcole"), "Nicole");
    assert.equal(sanitizeCrmNombre("Hola, Lucy"), null);
    assert.equal(sanitizeCrmNombre("Lucy Llamo Nicole"), "Nicole");
    assert.equal(sanitizeDisplayName("Hola, Lucy"), null);

    // Cotización genérica ≠ servicio
    assert.equal(mergeServiceRequirements(null, "Quiero hacer una cotizacion"), null);
    assert.ok(isGenericQuoteIntentRequerimiento("Quiero hacer una cotizacion"));
    const enriched = emptyExtracted({ requerimientos_evento: "Quiero hacer una cotizacion" });
    enrichExtractedFromConversation(enriched, "Quiero hacer una cotizacion\nHola, Lucy\nMe llamo Nicole");
    assert.ok(
      !enriched.requerimientos_evento ||
        !/quiero\s+hacer\s+una\s+cotiz/i.test(enriched.requerimientos_evento),
      String(enriched.requerimientos_evento)
    );

    const brief =
      "Es un evento para 70 personas. La comida es de 2 a 3 pm. Quiero una barra de pizzas, pasta y ensaldas";
    const multi = runGuards({
      aiResponse:
        "Perfecto, Nicole. ¿Qué tipo de evento es?\n\nCuéntame, ¿de qué se trata el evento? Manejamos bodas, XV años y cumpleaños.",
      extracted: emptyExtracted({
        nombre: "Nicole",
        correo: "lazarinnicole@gmail.com",
        num_invitados: 70,
        fecha_horario: "2 a 3 pm",
        requerimientos_evento: "Barra de pizzas, Pastas",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Número de invitados",
        "Fecha y horario",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: brief,
      history: [
        { role: "assistant", content: "Gracias por tu correo, Nicole. ¿Qué tipo de evento estás planeando?" },
      ],
    });
    assert.ok(/bodasesor\.com\/catalogos|barra de pizzas|pastas/i.test(multi), multi.slice(0, 400));
    // Colapsar variantes duplicadas de la misma pregunta de tipo (A14924).
    const tipoBlocks = multi
      .split(/\n{2,}/)
      .filter((b) => /tipo de evento|de qu[eé] se trata|qu[eé] festejan/i.test(b));
    assert.ok(
      tipoBlocks.length <= 1,
      `solo un bloque de tipo: ${tipoBlocks.length} — ${multi.slice(0, 600)}`
    );

    // "cumpleaños" no reenvía el paquete multi-servicio
    const afterTipo = runGuards({
      aiResponse: "Perfecto, veo que necesitas Comida, Pastas y Barra de pizzas...",
      extracted: emptyExtracted({
        nombre: "Nicole",
        correo: "lazarinnicole@gmail.com",
        num_invitados: 70,
        fecha_horario: "2 a 3 pm",
        requerimientos_evento: "Barra de pizzas, Pastas, Comida",
        tipo_evento: "cumpleaños",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Número de invitados",
        "Fecha y horario",
        "Requerimientos o servicios",
        "Tipo de evento",
      ]),
      readyForClosing: false,
      currentMessage: "cumpleaños",
      history: [
        {
          role: "assistant",
          content:
            "Perfecto, veo que necesitas Comida, Pastas y Barra de pizzas. Te cotizamos todo eso.\n\n" +
            buildPackageCatalogOfferBlock() +
            "\n\nPerfecto, Nicole. ¿Qué tipo de evento es?",
        },
        { role: "user", content: brief },
      ],
    });
    assert.ok(
      !/Te dejo el catálogo general/i.test(afterTipo),
      `no re-dump catálogo en cumpleaños: ${afterTipo.slice(0, 400)}`
    );
    assert.ok(
      /ciudad|ubicaci|zona|sal[oó]n/i.test(afterTipo),
      `debe pedir zona tras tipo: ${afterTipo.slice(0, 400)}`
    );

    // Con CRM avanzado + historial vacío, "Ciudad de México" no reinicia intro
    const noReinicio = runGuards({
      aiResponse: "Hola, soy Lucy...",
      extracted: emptyExtracted({
        nombre: "Nicole",
        correo: "lazarinnicole@gmail.com",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "Barra de pizzas, Pastas",
        num_invitados: 70,
        direccion_evento: "Ciudad de México",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "Ciudad de México",
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(
      !/Hola,?\s*soy\s+Lucy/i.test(noReinicio) || /ubicaci|colonia|sal[oó]n|fecha|invitados|presupuesto/i.test(noReinicio),
      `no reinicio puro: ${noReinicio.slice(0, 300)}`
    );
    assert.ok(!/c[oó]mo\s+te\s+llamas/i.test(noReinicio), noReinicio.slice(0, 300));
  });

  await test("82. Khris A14883 — 'en la cotización' NO es ubicación", () => {
    const brief =
      "Me gustaría solicitar una cotización para una barra de carnes frías y quesos. " +
      "Favor de incluirlo en la cotización. Gracias!";
    assert.equal(parseZonaFromText(brief), null);
    assert.equal(parseZonaFromText("incluirlo en la cotización"), null);
    assert.equal(parseZonaFromText("cotización"), null);
    assert.equal(parseZonaFromText("la cotización"), null);
    assert.ok(!isUsableDireccionEvento("cotización"));
    assert.ok(!isUsableDireccionEvento("cotización."));
    assert.ok(!isUsableDireccionEvento("la cotización"));
    assert.ok(isUsableDireccionEvento("Cuauhtémoc, CDMX"));
    assert.ok(isUsableDireccionEvento("Rio Guadalquivir 94, Cuauhtemoc, CDMX"));

    const extracted = emptyExtracted({
      direccion_evento: "cotización",
      requerimientos_evento: "Mesa de quesos, Meseros",
      num_invitados: 25,
    });
    enrichExtractedFromConversation(extracted, brief);
    assert.equal(extracted.direccion_evento, null);

    const resumen = buildResumenClienteLargo(
      emptyExtracted({
        nombre: "Khris",
        direccion_evento: "cotización",
        requerimientos_evento: "Mesa de quesos, Meseros",
      }),
      ["- Nombre del cliente: Khris", "- Lugar/dirección del evento: cotización"],
      brief
    );
    assert.ok(!/Ubicaci[oó]n:\s*cotizaci/i.test(resumen), resumen);
    assert.ok(/ubicaci[oó]n/i.test(resumen) || /Completar:.*ubicaci/i.test(resumen), resumen);

    // Con cotización falsa como zona, el embudo debe seguir pidiendo ubicación (no cerrar).
    const mid = runGuards({
      aiResponse: "Perfecto, ya tengo todo.",
      extracted: emptyExtracted({
        nombre: "Khris",
        correo: "khris@honemaxwell.com",
        tipo_evento: "empresarial",
        requerimientos_evento: "Mesa de quesos, Meseros",
        num_invitados: 25,
        fecha_horario: "Septiembre 1, 2026, tarde",
        direccion_evento: "cotización",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
        "Fecha y horario",
        // Sin "Lugar/dirección" válido en filledSet
      ]),
      readyForClosing: false,
      currentMessage: "La fecha sería Septiembre 1, 2026. Aún no tenemos horario definido pero será por la tarde",
      history: [
        { role: "assistant", content: "Perfecto, Khris. ¿Tienen ya definida la fecha y horario del evento?" },
      ],
    });
    assert.ok(
      /ciudad|ubicaci|zona|sal[oó]n|direcci/i.test(mid),
      `debe pedir ubicación, no cerrar: ${mid.slice(0, 400)}`
    );
    assert.ok(!/ya tengo todo|preparen una cotizaci/i.test(mid), mid.slice(0, 300));
  });

  await test("83. Jeny A14929 — Premium≠nombre, banquetes vagos, catálogo con URL, CRM upgrade", () => {
    // Nombre: Premium (nivel/WA) nunca es nombre; Jeny no se sobrescribe.
    assert.equal(sanitizeCrmNombre("Premium"), null);
    assert.equal(sanitizeDisplayName("Premium"), null);
    assert.equal(sanitizeCrmNombre("Jeny"), "Jeny");
    assert.equal(shouldUpdateName("Jeny", "Premium"), false);
    assert.equal(shouldUpdateName("Premium", "Jeny"), true);

    // Banquetes/catering vago → opciones, no dump Formal+postres.
    assert.ok(
      isVagueFoodTerm(
        "Hola, me interesa cotizar un servicio de banquetes o catering para mi evento. ¿Me pueden dar información?"
      )
    );
    assert.ok(isVagueFoodTerm("servicio de banquetes o catering"));
    const vagueReply = runGuards({
      aiResponse:
        "Manejamos *Banquete Formal 3 tiempos* en varias opciones: banquete 3 tiempos, Betún Clásico, Cupcakes. ¿Cuál variante?",
      extracted: emptyExtracted({}),
      filledSet: new Set<string>(),
      readyForClosing: false,
      currentMessage:
        "Hola, me interesa cotizar un servicio de banquetes o catering para mi evento. ¿Me pueden dar información?",
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(/Lucy|Bodasesor/i.test(vagueReply), vagueReply.slice(0, 200));
    assert.ok(
      !/Betún|Cupcakes|Paletas de hielo/i.test(vagueReply),
      `no debe dump postres: ${vagueReply.slice(0, 400)}`
    );
    assert.ok(
      /banquete|taquiza|brunch|coffee|alimentos|comida/i.test(vagueReply),
      `debe ofrecer opciones de alimentos: ${vagueReply.slice(0, 400)}`
    );
    assert.ok(/nombre|llamas/i.test(vagueReply), vagueReply.slice(0, 200));

    // "mandarme el catálogo" / afirmación → URL bodasesor.
    assert.ok(clientAsksForCatalog("Puedes mandarme el catalogo por favor"));
    assert.ok(
      clientAffirmsCatalogOffer("Si", "¿Quieres que te mande el catálogo con más detalle?")
    );
    const catalogReply = runGuards({
      aiResponse: "Claro, aquí tienes el enlace al catálogo completo para que revises las opciones:",
      extracted: emptyExtracted({
        nombre: "Jeny",
        requerimientos_evento: "Banquete Formal, Mobiliario, DJ, Iluminación",
      }),
      filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "Puedes mandarme el catalogo por favor",
      history: [
        { role: "assistant", content: "Te dejo el catálogo general para que veas montajes." },
      ],
      whatsappDisplayName: "Premium",
    });
    assert.ok(
      /bodasesor\.com\/catalogos/i.test(catalogReply),
      `debe incluir URL: ${catalogReply.slice(0, 400)}`
    );

    // No inventar banquete Premium desde nombre WA.
    const noFakePremium = runGuards({
      aiResponse:
        "Genial, Jeny. El banquete Premium incluye un servicio completo con platillos de alta calidad. ¿A qué correo te puedo enviar la información?",
      extracted: emptyExtracted({ nombre: "Jeny" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "Jeny",
      history: [
        {
          role: "assistant",
          content: "¿Cuál variante y nivel prefieres? ¿Cómo te llamas?",
        },
      ],
      whatsappDisplayName: "Premium",
    });
    assert.ok(
      !/banquete\s+premium/i.test(noFakePremium),
      `no inventar banquete Premium: ${noFakePremium.slice(0, 400)}`
    );

    // Cierre no inventa taquiza.
    const closing = buildStandardClosingMessage("servicio de banquetes o catering", "Jeny");
    assert.ok(!/taquiza/i.test(closing), closing);

    // CRM upgrade: más servicios + presupuesto mayor.
    const merged: string[] = [
      "- Requerimientos o servicios: servicio de banquetes o catering",
      "- Presupuesto (MXN): 50000",
    ];
    const filled = new Set(["Requerimientos o servicios", "Presupuesto (MXN)"]);
    applyCapturesToCrm(merged, filled, [
      {
        label: "Requerimientos o servicios",
        value: "banquete, mobiliario, DJ, iluminación",
      },
      { label: "Presupuesto (MXN)", value: "100000" },
    ]);
    assert.ok(
      /Mobiliario|DJ|Iluminaci/i.test(merged.find((l) => /Requerimientos/i.test(l)) ?? ""),
      merged.join("\n")
    );
    assert.ok(
      /100000|100,000/i.test(merged.find((l) => /Presupuesto/i.test(l)) ?? ""),
      merged.join("\n")
    );

    const resumen = buildResumenClienteLargo(
      emptyExtracted({
        nombre: "Jeny",
        correo: "Jennymujica450@gmail.com",
        tipo_evento: "boda",
        requerimientos_evento: "servicio de banquetes o catering",
        num_invitados: 150,
        fecha_horario: "20 de noviembre del 2027",
        direccion_evento:
          "Calle tepetenco manzana 16 lote 5 san lorenzo parte alta chimalhuacan estado de mexico 56340",
        presupuesto: 50000,
      }),
      [
        "- Nombre del cliente: Jeny",
        "- Correo electrónico: Jennymujica450@gmail.com",
        "- Tipo de evento: boda",
        "- Requerimientos o servicios: servicio de banquetes o catering",
        "- Número de invitados: 150",
        "- Fecha y horario: 20 de noviembre del 2027",
        "- Lugar/dirección del evento: Calle tepetenco manzana 16 lote 5 san lorenzo parte alta chimalhuacan estado de mexico 56340",
        "- Presupuesto (MXN): 50000",
      ],
      "Con banquete, catering, mobiliario, dj,iluminación para 150 personas, me presupuesto entonces seria de 100,000"
    );
    assert.ok(/Mobiliario|DJ|Iluminaci|Banquete/i.test(resumen), resumen);
    assert.ok(/100000|100,000/i.test(resumen), resumen);
    assert.ok(/Nombre:\s*Jeny/i.test(resumen), resumen);
    assert.ok(!/Nombre:\s*Premium/i.test(resumen), resumen);
  });

  await test("84. Paola A14932 — qué incluye cada cosa manda catálogo (no solo 'equipo confirma')", () => {
    assert.ok(clientAsksInclusion("Que incluye cada cosa?"));
    assert.ok(clientAsksInclusion("qué incluye cada cosa"));
    assert.equal(
      clientMentionsItalianTheme("Hola, me interesa cotizar: Barra de Pastas y Ensaladas para Eventos"),
      false
    );
    assert.ok(
      parseServicesFromText("Barra de Pastas y Ensaladas para Eventos").includes(
        "Barra de pastas y ensaladas"
      )
    );

    const placeholderLevels = `Para *Barra de pastas* manejamos estos niveles:

1. *Basico* — $780.00 /pp
   Incluye: el equipo lo confirma en la cotización.
2. *Tradicional* — $830.00 /pp
   Incluye: el equipo lo confirma en la cotización.
3. *Premium* — $880.00 /pp
   Incluye: el equipo lo confirma en la cotización.

¿Cuál nivel prefieres? El detalle exacto de inclusiones te lo confirma el equipo en la cotización.`;
    assert.ok(
      messageOffersLevelsWithoutInclusions(placeholderLevels),
      "placeholder 'equipo confirma' no cuenta como inclusión real"
    );

    const inclReply = resolveCatalogInclusionReply(
      "Que incluye cada cosa?",
      "Barra de pastas y ensaladas"
    );
    assert.ok(inclReply, "debe responder inclusiones/catálogo");
    assert.ok(
      /bodasesor\.com\/catalogos/i.test(inclReply!),
      `debe incluir URL de catálogo: ${inclReply}`
    );
    assert.ok(
      !/^El detalle exacto de lo que incluye\b.*equipo en la cotización\.?\s*$/i.test(
        inclReply!.replace(/\n/g, " ")
      ),
      `no debe ser solo 'equipo confirma' sin link: ${inclReply}`
    );

    const guard = runGuards({
      aiResponse: "El detalle exacto te lo confirma el equipo. ¿Te la preparo?",
      extracted: emptyExtracted({
        nombre: "Paola",
        requerimientos_evento: "Barra de pastas y ensaladas",
      }),
      filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "Que incluye cada cosa?",
      history: [
        {
          role: "assistant",
          content:
            placeholderLevels +
            "\n\n¿Quieres que te mande el catálogo con más detalle?\n\n¿A qué correo te lo envío?",
        },
      ],
      whatsappDisplayName: "Paola Ovalles",
    });
    assert.ok(
      /bodasesor\.com\/catalogos/i.test(guard),
      `guard debe mandar catálogo: ${guard.slice(0, 500)}`
    );
    assert.ok(!/Betún|Cupcakes/i.test(guard), guard.slice(0, 300));

    const team = buildInclusionTeamConfirmationAnswer("Barra de pastas");
    if (team) {
      assert.ok(
        /bodasesor\.com\/catalogos/i.test(team),
        `team confirmation siempre con link: ${team}`
      );
    }
  });

  await test("85. Anylam A14933 — precio≠nombre, horario≠presupuesto, responde costo periqueras", () => {
    const priceQ = "Cuánto cuesta la renta de mesas periqueras para 10 personas";
    assert.ok(isLikelyNotPersonNameMessage(priceQ));
    assert.equal(sanitizeCrmNombre(priceQ), null);
    assert.equal(sanitizeCrmNombre("Cuánto Cuesta La Renta"), null);
    assert.equal(shouldUpdateName("Cuánto Cuesta La Renta", "Anylam"), true);
    assert.ok(clientAsksPrice(priceQ));
    assert.ok(mentionsNoListedPriceService(priceQ));
    assert.equal(parsePresupuestoFromText("Si este sábado de 3 a 12"), null);
    assert.ok(parseFechaFromText("Si este sábado de 3 a 12"));

    const recovered = recoverClienteNombreFromHistory(
      [{ role: "assistant", content: "¿Cómo te llamas?" }],
      priceQ
    );
    assert.equal(recovered, null);

    const consult = buildConsultativeNoPriceReply(priceQ);
    assert.ok(consult && /periqueras?/i.test(consult), consult ?? "");

    const priceGuard = runGuards({
      aiResponse: "Lo anoto (mesa y sillas). También mantelería. ¿A qué correo te lo envío?",
      extracted: emptyExtracted({ nombre: null }),
      filledSet: new Set<string>(),
      readyForClosing: false,
      currentMessage: priceQ,
      history: [
        { role: "user", content: "Hola, me gustaría cotizar salas o periqueras para mi evento." },
        { role: "assistant", content: "Hola, soy Lucy. ¿Cómo te llamas?" },
      ],
      whatsappDisplayName: "Anylam",
    });
    assert.ok(
      /periqueras?|mesas?\s+tipo\s+bar|cotiz/i.test(priceGuard),
      `debe responder precio/consultivo: ${priceGuard.slice(0, 400)}`
    );
    assert.ok(
      !/manteler[ií]a|mesa de postres/i.test(priceGuard),
      `no upsell mantelería ante pregunta de precio: ${priceGuard.slice(0, 400)}`
    );
    assert.ok(
      !/Cu[aá]nto Cuesta|Nombre.*Renta/i.test(priceGuard),
      priceGuard.slice(0, 200)
    );

    const opening = buildOpeningAcknowledgment(
      [],
      "Hola, me gustaría cotizar salas o periqueras para mi evento."
    );
    assert.ok(/periqueras?|mobiliario|salas/i.test(opening), opening);
  });

  await test("86. Brenda A14934 — Barra Yucateca, nivel+correo, 40 invitados sin Sigo aquí", () => {
    const lead =
      'Hola, me interesa cotizar "Barra Yucateca" en Ciudad de México para mi evento.';
    const brief = parseWebLeadBrief(lead);
    assert.ok(brief, "debe parsear lead web sin dos puntos");
    assert.ok(
      /yucateca/i.test(brief!.requerimientos_evento ?? ""),
      String(brief?.requerimientos_evento)
    );
    assert.ok(
      /m[eé]xico|cdmx/i.test(brief!.direccion_evento ?? ""),
      String(brief?.direccion_evento)
    );
    assert.ok(parseServicesFromText(lead).includes("Barra Yucateca"));

    const opening = buildOpeningAcknowledgment([], lead);
    assert.ok(/Barra Yucateca/i.test(opening), opening);
    assert.ok(!/Vi los datos de tu evento/i.test(opening), opening);

    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye"',
      '"Barra Yucateca","Basico","$350.00","$5,000.00","TRUE","Cochinita, panuchos"',
      '"Barra Yucateca","Tradicional","$450.00","$6,500.00","TRUE","Cochinita, panuchos, sopa de lima"',
      '"Barra Americana","Basico","$300.00","$4,500.00","TRUE","Hamburguesas"',
      '"Barra de Crepas","Basico","$280.00","$4,000.00","TRUE","Crepas dulces"',
      '"Barra de paninis","Basico","$260.00","$3,800.00","TRUE","Paninis"',
      '"Barra de mariscos","Basico","$400.00","$6,000.00","TRUE","Mariscos"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    const yucDetail = buildCatalogServiceDetailAnswer("Barra Yucateca");
    assert.ok(yucDetail && /yucateca/i.test(yucDetail), yucDetail ?? "null");
    assert.ok(
      !/americana|crepas|paninis|mariscos/i.test(yucDetail!),
      `no dump de otras barras: ${yucDetail!.slice(0, 300)}`
    );
    assert.ok(/nivel|Basico|Tradicional/i.test(yucDetail!), yucDetail!.slice(0, 300));

    const nivelAsk =
      "Manejamos *Barra Yucateca* en varias opciones. Niveles disponibles: *Basico*, *Tradicional*. ¿Cuál variante y nivel prefieres?\n\n¿a qué correo te lo envío?";
    const compound =
      "beom93@gmail.com\nBarra yucateca\nNivel básico";
    assert.equal(extractCatalogNivelFromText(compound), "basica");
    assert.ok(isCatalogLevelSelection(compound, nivelAsk));

    const nivelGuard = runGuards({
      aiResponse: "Perfecto. ¿Qué tipo de evento es?",
      extracted: emptyExtracted({
        nombre: "Brenda Orozco",
        requerimientos_evento: "Barra Yucateca",
        direccion_evento: "Ciudad de México",
      }),
      filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios", "Lugar/dirección del evento"]),
      readyForClosing: false,
      currentMessage: compound,
      history: [
        { role: "user", content: lead },
        { role: "assistant", content: "¿Cómo te llamas?" },
        { role: "user", content: "Brenda Orozco" },
        { role: "assistant", content: nivelAsk },
      ],
      whatsappDisplayName: "Brenda Orozco",
    });
    assert.ok(/b[aá]sic/i.test(nivelGuard), `debe anotar nivel: ${nivelGuard.slice(0, 400)}`);
    assert.ok(
      /correo|tipo de evento|festejan|celebr/i.test(nivelGuard),
      `debe seguir embudo: ${nivelGuard.slice(0, 400)}`
    );

    // "40" tras pregunta de invitados → no "Sigo aquí"
    const anti = applyLucyGlobalAntiRepetition({
      mensaje: "Excelente. ¿Cuántos invitados asistirán a la boda civil?",
      history: [
        {
          role: "assistant",
          content: "Excelente, Brenda. ¿Cuántos invitados asistirán a la boda civil?",
        },
      ],
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
      ]),
      extracted: emptyExtracted({
        nombre: "Brenda Orozco",
        correo: "beom93@gmail.com",
        tipo_evento: "boda",
        requerimientos_evento: "Barra Yucateca",
        direccion_evento: "Ciudad de México",
        fecha_horario: "03 de agosto 12:30",
        num_invitados: null,
      }),
      currentMessage: "40",
      clientName: "Brenda Orozco",
    });
    assert.ok(
      !/Sigo aqu[ií]/i.test(anti.mensaje),
      `no debe decir Sigo aquí: ${anti.mensaje}`
    );
    assert.ok(
      !mensajeAsksForField(anti.mensaje, "invitados") ||
        /presupuesto|Perfecto|anotad/i.test(anti.mensaje),
      anti.mensaje
    );
  });

  await test("87. Ilana A14938 — ubicación≠nombre, pizzas en evento, sin $300 presupuesto", () => {
    // Nombre del lead NO puede ser la dirección.
    assert.ok(isLikelyUbicacionNotNombre("en Tlalnepantla"));
    assert.ok(isLikelyUbicacionNotNombre("En Tlalnepantla"));
    assert.ok(isLikelyUbicacionNotNombre("Tlalnepantla"));
    assert.equal(sanitizeCrmNombre("en Tlalnepantla"), null);
    assert.equal(sanitizeCrmNombre("En Tlalnepantla"), null);
    assert.ok(!looksLikePersonFullName("en Tlalnepantla"));
    assert.ok(shouldUpdateName("En Tlalnepantla", "Ilana Berman"));

    const zona = parseZonaFromText("en Tlalnepantla");
    assert.ok(zona && /tlalnepantla/i.test(zona), String(zona));

    const filled = new Set<string>();
    const caps = captureContextualAnswer(
      [{ role: "assistant", content: "Hola, soy Lucy. ¿Cómo te llamas?" }],
      "en Tlalnepantla",
      filled
    );
    assert.ok(
      caps.some((c) => c.label === "Lugar/dirección del evento"),
      JSON.stringify(caps)
    );
    assert.ok(
      !caps.some((c) => c.label === "Nombre del cliente"),
      `ubicación no es nombre: ${JSON.stringify(caps)}`
    );

    // Precio de catálogo "$300 por persona" ≠ presupuesto del cliente.
    assert.equal(
      parsePresupuestoFromText("Perfecto, en Tlalnepantla manejamos taquizas desde $300 por persona."),
      null
    );
    assert.ok(
      parsePresupuestoFromText("Mi presupuesto es $300 por persona", {
        askedField: "presupuesto",
      })
    );

    // ¿Hacen las pizzas en el evento?
    assert.ok(clientAsksServiceInfo("Hacen las pizzas en el evento?"));
    const pizzaAck = buildGuardServiceAck("Hacen las pizzas en el evento?");
    assert.ok(/pizza|monta|evento|momento/i.test(pizzaAck), pizzaAck);

    const pizzaGuard = runGuards({
      aiResponse: "Perfecto, anoto Pizzas. ¿Me compartes un correo?",
      extracted: emptyExtracted({
        nombre: "Ilana Berman",
        requerimientos_evento: "Pizzas",
        tipo_evento: "corporativo",
        num_invitados: 550,
        fecha_horario: "12 de dic",
        direccion_evento: "Tlalnepantla",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Requerimientos o servicios",
        "Tipo de evento",
        "Número de invitados",
        "Fecha y horario",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: "Hacen las pizzas en el evento?",
      history: [
        {
          role: "user",
          content:
            "Quiero hacer una cotizacion de pizzas para un evento empresarial de 550 personas el 12 de dic",
        },
        { role: "assistant", content: "¿Cómo te llamas?" },
        { role: "user", content: "Ilana Berman" },
        { role: "assistant", content: "Perfecto, Ilana. ¿Me compartes un correo?" },
      ],
      whatsappDisplayName: "Ilana Berman",
    });
    assert.ok(
      /monta|evento|prepar|momento|s[ií]/i.test(pizzaGuard),
      `debe responder si hacen pizzas en el evento: ${pizzaGuard.slice(0, 400)}`
    );
    assert.ok(!/anoto Pizzas\.?\s*$/i.test(pizzaGuard.trim()), pizzaGuard.slice(0, 200));

    // Zona + pizzas: no inventar taquiza.
    const zonaGuard = runGuards({
      aiResponse:
        "Perfecto, en Tlalnepantla manejamos taquizas desde $300 por persona. ¿Tienes un correo?",
      extracted: emptyExtracted({
        requerimientos_evento: "Pizzas",
        tipo_evento: "corporativo",
        num_invitados: 550,
        fecha_horario: "12 de dic",
        direccion_evento: "Tlalnepantla",
      }),
      filledSet: new Set([
        "Requerimientos o servicios",
        "Tipo de evento",
        "Número de invitados",
        "Fecha y horario",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: "en Tlalnepantla",
      history: [
        {
          role: "user",
          content:
            "Quiero hacer una cotizacion de pizzas para un evento empresarial de 550 personas el 12 de dic",
        },
        { role: "assistant", content: "¿Cómo te llamas?" },
      ],
      whatsappDisplayName: "Ilana Berman",
    });
    assert.ok(!/\btaquiza/i.test(zonaGuard), `no inventar taquiza: ${zonaGuard.slice(0, 400)}`);
    assert.ok(/pizza|Tlalnepantla/i.test(zonaGuard), zonaGuard.slice(0, 300));

    // Post-cierre entradas + postre.
    const merged = appendPostCierreRequirements("Pizzas, Mobiliario", "Entradas y postre");
    assert.ok(/entrada/i.test(merged ?? ""), merged);
    assert.ok(/postre/i.test(merged ?? ""), merged);
    assert.ok(parseServicesFromText("Entradas y postre").length >= 1);
  });

  await test("88. Invariantes CRM — nombre/presupuesto no se contaminan", () => {
    assert.ok(isInvalidCrmNombre("En Tlalnepantla"));
    assert.ok(isInvalidCrmNombre("en Naucalpan"));
    assert.ok(!isInvalidCrmNombre("Ilana Berman"));

    const badName = applyCrmWriteInvariants(
      emptyExtracted({
        nombre: "En Tlalnepantla",
        requerimientos_evento: "Pizzas",
        presupuesto: 300,
      }),
      [
        "Quiero cotizacion de pizzas para 550 personas",
        "en Tlalnepantla",
      ]
    );
    assert.equal(badName.extracted.nombre, null);
    assert.ok(/tlalnepantla/i.test(badName.extracted.direccion_evento ?? ""));
    assert.equal(badName.extracted.presupuesto, null);
    assert.ok(badName.applied.includes("nombre-invalid-cleared"));
    assert.ok(badName.applied.includes("presupuesto-no-user-source"));

    assert.equal(
      userJustifiesPresupuesto([
        "Perfecto, en Tlalnepantla manejamos taquizas desde $300 por persona.",
      ]),
      false
    );
    assert.ok(userJustifiesPresupuesto(["Mi presupuesto es 80000"]));

    const lines = purgeUnjustifiedPresupuestoLines(
      ["- Nombre del cliente: Ilana", "- Presupuesto (MXN): 300"],
      ["en Tlalnepantla", "quiero pizzas"]
    );
    assert.ok(!lines.some((l) => /Presupuesto/i.test(l)));
    assert.ok(lines.some((l) => /Ilana/i.test(l)));
  });

  await test("89. Marco A14943 — precios plural, paquetes, correo, no Comida Corrida", () => {
    assert.ok(clientAsksPrice("Me gustaría ver los precios"));
    assert.ok(clientAsksPrice("Antes quisiera ver los precios"));
    assert.ok(clientAsksPrice("Precios!!"));
    assert.ok(clientAsksInclusion("Quiero ver los paquetes"));
    assert.ok(clientAsksInclusion("ver los paquetes"));

    const corporateOffer =
      "Perfecto, Marco. Para tu evento corporativo, manejamos varias opciones.\n• Banquete Formal 3 tiempos\n• Barra de bebidas\n• Coffee break\n¿Te gustaría revisar primero algún servicio?";
    const priceClarify = buildGenericPriceClarifyReply(
      emptyExtracted({ nombre: "Marco Santos", tipo_evento: "evento corporativo" }),
      [
        { role: "assistant", content: corporateOffer },
        { role: "user", content: "Me gustaría ver los precios" },
      ],
      "Me gustaría ver los precios"
    );
    assert.ok(/precio|banquete|barra|coffee/i.test(priceClarify), priceClarify);
    assert.ok(!/Sigo aquí/i.test(priceClarify), priceClarify);

    const priceGuard = runGuards({
      aiResponse: "Además podemos incluir mobiliario y DJ. ¿Armamos un paquete completo?",
      extracted: emptyExtracted({
        nombre: "Marco Santos",
        correo: "becerrilsantosmarcoantonio@gmail.com",
        tipo_evento: "evento corporativo",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
      ]),
      readyForClosing: false,
      currentMessage: "Precios!!",
      history: [
        { role: "assistant", content: corporateOffer },
        { role: "user", content: "Antes quisiera ver los precios" },
        {
          role: "assistant",
          content: "Además podemos incluir mobiliario. ¿Armamos un paquete completo?",
        },
      ],
    });
    assert.ok(/precio|banquete|coffee|barra|servicio/i.test(priceGuard), priceGuard);
    assert.ok(!/Sigo aquí/i.test(priceGuard), priceGuard);
    assert.ok(!/paquete completo/i.test(priceGuard), priceGuard);

    const anti = applyLucyGlobalAntiRepetition({
      mensaje: "¿Te gustaría revisar primero algún servicio en particular o armar un paquete completo?",
      history: [
        { role: "assistant", content: corporateOffer },
        { role: "user", content: "Precios!!" },
      ],
      extracted: emptyExtracted({ nombre: "Marco Santos", tipo_evento: "evento corporativo" }),
      filledSet: new Set(["Nombre del cliente", "Correo electrónico", "Tipo de evento"]),
      currentMessage: "Precios!!",
      clientName: "Marco Santos",
    });
    assert.ok(!/Sigo aquí/i.test(anti.mensaje), anti.mensaje);

    const packages = runGuards({
      aiResponse: "¿En qué ciudad será el evento?",
      extracted: emptyExtracted({
        nombre: "Marco Santos",
        correo: "becerrilsantosmarcoantonio@gmail.com",
        tipo_evento: "evento corporativo",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
      ]),
      readyForClosing: false,
      currentMessage: "Quiero ver los paquetes",
      history: [{ role: "assistant", content: corporateOffer }],
    });
    assert.ok(/paquete|nivel|banquete|coffee|servicio/i.test(packages), packages);
    assert.ok(!/^¿En qué ciudad/i.test(packages.trim()), packages);

    // Correo ya en historial → no re-preguntar tras fecha.
    const emailRecovered = emptyExtracted({
      nombre: "Marco Santos",
      tipo_evento: "evento corporativo",
      direccion_evento: "CDMX",
      fecha_horario: "21 de Noviembre",
    });
    enrichExtractedFromConversation(
      emailRecovered,
      "becerrilsantosmarcoantonio@gmail.com\nEvento de trabajo\nCDMX\n21 de Noviembre"
    );
    assert.ok(
      /becerrilsantosmarcoantonio@gmail\.com/i.test(emailRecovered.correo ?? ""),
      emailRecovered.correo ?? ""
    );

    const reAskCorreo = runGuards({
      aiResponse: "¿Me puedes proporcionar un correo electrónico donde enviarte la información?",
      extracted: emailRecovered,
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Lugar/dirección del evento",
        "Fecha y horario",
      ]),
      readyForClosing: false,
      currentMessage: "21 de Noviembre",
      history: [
        { role: "user", content: "becerrilsantosmarcoantonio@gmail.com" },
        { role: "assistant", content: "Gracias. ¿Qué tipo de evento es?" },
        { role: "user", content: "Evento de trabajo" },
        { role: "assistant", content: corporateOffer },
        { role: "user", content: "CDMX" },
        { role: "assistant", content: "¿Tienen día u horario ya definido?" },
      ],
    });
    assert.ok(!mensajeAsksForField(reAskCorreo, "correo"), reAskCorreo.slice(0, 300));

    // Resumen no inventa Comida Corrida.
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye"',
      '"Comida Corrida","Basico","$280.00","$8,400.00","TRUE","3 tiempos"',
      '"Banquete Formal 3 tiempos","Basico","$500.00","$15,000.00","TRUE","3 tiempos"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));
    const resumen = buildResumenClienteLargo(
      emptyExtracted({
        nombre: "Marco Santos",
        tipo_evento: "evento corporativo",
        correo: "becerrilsantosmarcoantonio@gmail.com",
        direccion_evento: "CDMX",
        fecha_horario: "21 de Noviembre",
      }),
      [
        "- Nombre del cliente: Marco Santos",
        "- Tipo de evento: evento corporativo",
        "- Correo electrónico: becerrilsantosmarcoantonio@gmail.com",
      ],
      "¡Hola, me gustaría cotizar un evento con ustedes! Evento de trabajo Quiero ver los paquetes CDMX"
    );
    assert.ok(!/comida\s+corrida/i.test(resumen), resumen);
  });

  await test("90. Alexandra A14947 — banquete info, nombre≠boda, tres tiempos, inclusiones", () => {
    assert.equal(sanitizeCrmNombre("Alexandra Es Boda"), "Alexandra");
    assert.equal(sanitizeCrmNombre("Alexandra\nEs boda"), "Alexandra");
    assert.equal(sanitizeCrmNombre("Alexandra"), "Alexandra");
    assert.ok(!shouldUpdateName("Alexandra", "Alexandra Es Boda"));
    // lead.name sucio → limpiar para Alejandro/SalesBot
    assert.ok(shouldUpdateName("Alexandra Es Boda", "Alexandra"));
    assert.equal(resolveKommoLeadNamePatch("Alexandra Es Boda", "Alexandra"), "Alexandra");
    // Bug: comparar contra línea CRM ya capturada dejaba lead.name vacío
    assert.equal(resolveKommoLeadNamePatch(null, "Alexandra"), "Alexandra");
    assert.equal(resolveKommoLeadNamePatch("", "Alexandra"), "Alexandra");
    assert.equal(resolveKommoLeadNamePatch("Nuevo lead", "Alexandra"), "Alexandra");
    assert.equal(resolveKommoLeadNamePatch("Alexandra", "Alexandra"), null);
    assert.equal(resolveKommoLeadNamePatch("Alexandra", "Alexandra Es Boda"), null);

    assert.equal(
      detectPresupuestoRefusal(
        "Pero no sé muy bien cuál podría ser o que incluiria"
      ),
      false
    );
    assert.ok(
      clientAsksInclusion("Pero no sé muy bien cuál podría ser o que incluiria")
    );

    const vagueInfo =
      "Hola, me interesa cotizar un servicio de banquetes o catering para mi evento. ¿Me pueden dar información?";
    assert.ok(isVagueFoodTerm(vagueInfo));
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye"',
      '"Banquete Formal 3 tiempos","Basico","$500.00","$15,000.00","TRUE","https://bodasesor.com/catalogos/banquete-formal","Entrada, plato fuerte y postre"',
      '"Banquete Formal 3 tiempos","Premium","$750.00","$15,000.00","TRUE","https://bodasesor.com/catalogos/banquete-formal","Entrada premium, fuerte y postre"',
      '"Banquete Mexicano 4 tiempos","Basico","$600.00","$18,000.00","TRUE","https://bodasesor.com/catalogos/banquete-mexicano","4 tiempos mexicanos"',
      '"Betún Clásico","Basico","$200.00","$5,000.00","TRUE","https://bodasesor.com/catalogos/cupcakes-y-betun","betún"',
      '"Cupcakes","Basico","$150.00","$3,000.00","TRUE","https://bodasesor.com/catalogos/cupcakes-y-betun","cupcakes"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    const first = runGuards({
      aiResponse:
        "Manejamos Banquete Formal 3 tiempos en varias opciones: banquete 3 tiempos, Betún Clásico, Cupcakes. ¿Cuál variante?",
      extracted: emptyExtracted(),
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage: vagueInfo,
      forceFirstPresentation: true,
    });
    assert.ok(/banquete/i.test(first), first.slice(0, 300));
    assert.ok(!/bet[uú]n|cupcakes?/i.test(first), first.slice(0, 400));
    // V8.92: primer turno = formal vs casual (no Formal/Mexicano aún).
    assert.ok(
      /formal|casual|catering/i.test(first),
      first.slice(0, 400)
    );
    assert.ok(
      /barra de pastas|barra de pizzas|taquiza/i.test(first),
      first.slice(0, 500)
    );
    assert.ok(
      !/bodasesor\.com\/catalogos|\$500|\$750/i.test(first),
      `menú sin dump/link: ${first.slice(0, 500)}`
    );
    // Tras elegir banquete → Formal/Mexicano.
    const afterBanquete = runGuards({
      aiResponse: "¿Cuál estilo?",
      extracted: emptyExtracted({ nombre: "Cecilia", requerimientos_evento: "banquete" }),
      filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "quiero banquete",
      history: [{ role: "assistant", content: first }],
    });
    assert.ok(/Formal|Mexicano/i.test(afterBanquete), afterBanquete.slice(0, 400));
    assert.ok(
      /detalles de alguno|3 tiempos|4 tiempos/i.test(afterBanquete),
      afterBanquete.slice(0, 500)
    );

    const tiempos = runGuards({
      aiResponse: "¿Cuál nivel prefieres?",
      extracted: emptyExtracted({
        nombre: "Alexandra",
        tipo_evento: "boda",
        requerimientos_evento: "banquete",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "De tres tiempos",
      history: [
        {
          role: "assistant",
          content:
            "Claro. En *banquete* manejamos varias opciones:\n• *Formal 3 tiempos*\n• *Mexicano 4 tiempos*\n\n¿Quieres que te dé detalles de alguno?",
        },
      ],
    });
    assert.ok(/3\s*tiempos|Formal/i.test(tiempos), tiempos.slice(0, 400));
    assert.ok(
      /bodasesor\.com\/catalogos|hostingersite\.com\/catalogos/i.test(tiempos),
      tiempos.slice(0, 500)
    );

    const incl = runGuards({
      aiResponse: "Sin problema, lo dejamos por definir. ¿A qué correo te mando la información?",
      extracted: emptyExtracted({
        nombre: "Alexandra",
        tipo_evento: "boda",
        requerimientos_evento: "Banquete Formal 3 tiempos",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "Pero no sé muy bien cuál podría ser o que incluiria",
      history: [
        { role: "user", content: "De tres tiempos" },
        { role: "assistant", content: "¿Cuál nivel prefieres?" },
      ],
    });
    assert.ok(!/lo dejamos por definir/i.test(incl), incl.slice(0, 300));
    assert.ok(/incluye|nivel|Basico|Premium|cat[aá]logo|\$/i.test(incl), incl.slice(0, 500));
    assert.ok(
      /bodasesor\.com\/catalogos|hostingersite\.com\/catalogos/i.test(incl),
      incl.slice(0, 500)
    );
    assert.ok(!/bet[uú]n|cupcakes?/i.test(incl), incl.slice(0, 400));
  });

  await test("91. Alejandro — lead.name se escribe aunque CRM ya tenga Nombre del cliente", () => {
    // Caso real: Lucy capturó nombre en mergedLines pero nunca patcheó lead.name →
    // SalesBot saluda "¡Mucho gusto! Soy Alejandro..." sin nombre del lead.
    assert.equal(resolveKommoLeadNamePatch(undefined, "Alexandra"), "Alexandra");
    assert.equal(resolveKommoLeadNamePatch("+52 55 1234 5678", "Alexandra"), "Alexandra");
    assert.equal(resolveKommoLeadNamePatch("Lead: 26669772", "Alexandra"), "Alexandra");
    // Ya limpio → no reescribir
    assert.equal(resolveKommoLeadNamePatch("Alexandra", "Alexandra"), null);
    // Ampliar apellido
    assert.equal(resolveKommoLeadNamePatch("Alexandra", "Alexandra Ruiz"), "Alexandra Ruiz");
  });

  await test("92. Catálogo — todas las ramas de servicio envían link", () => {
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye"',
      '"Coffee Break","Basico","$180.00","$5,000.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café y pan dulce"',
      '"Coffee Break","Premium","$250.00","$5,000.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café premium"',
      '"Taquiza","Solo Alimentos","$300.00","$9,000.00","TRUE","https://bodasesor.com/catalogos/taquiza","5 guisados"',
      '"Barra de sushi","Basico","$400.00","$12,000.00","TRUE","https://bodasesor.com/catalogos/barra-de-sushi","Rollos"',
      '"Banquete Formal 3 tiempos","Basico","$500.00","$15,000.00","TRUE","https://bodasesor.com/catalogos/banquete-formal","3 tiempos"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    const hasUrl = (t: string) =>
      /bodasesor\.com\/catalogos|hostingersite\.com\/catalogos/i.test(t);

    assert.ok(hasUrl(ensureCatalogWebLink("Detalle coffee", "coffee break")));
    assert.ok(hasUrl(buildCatalogPriceAnswer("coffee break") || ""));
    assert.ok(hasUrl(buildCatalogServiceDetailAnswer("taquiza") || ""));
    const sushiIncl = resolveCatalogInclusionReply("qué incluye", "barra de sushi") || "";
    assert.ok(sushiIncl.length > 20, "inclusión sushi debe responder");
    // PDF seed a veces llega sin link; ensureCatalogWebLink lo completa.
    assert.ok(hasUrl(ensureCatalogWebLink(sushiIncl, "barra de sushi")));
    assert.ok(hasUrl(buildBroadLevel1Offer("graduación")));
    // V8.68: opciones vagas sin link; el catálogo va con el detalle tras elegir.
    const vagueOpts = buildVagueFoodOptionsReply(
      emptyExtracted({ tipo_evento: "boda" }),
      [],
      "¿recomiendas algo?"
    );
    assert.ok(/banquete|taquiza|brunch|coffee|alimentos/i.test(vagueOpts), vagueOpts);
    assert.ok(hasUrl(buildGenericPackagesOverviewReply(emptyExtracted({ requerimientos_evento: "coffee break" }), [], "ver los paquetes")));
    assert.ok(hasUrl(buildPackageCatalogOfferBlock()));

    const priceGuard = runGuards({
      aiResponse: "Te cotizo luego",
      extracted: emptyExtracted({
        nombre: "Luis",
        tipo_evento: "corporativo",
        requerimientos_evento: "coffee break",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "cuánto cuesta el coffee break",
      history: [],
    });
    assert.ok(hasUrl(priceGuard), priceGuard.slice(0, 500));
    assert.ok(/\$\s*[\d,.]+|180|250/i.test(priceGuard), priceGuard.slice(0, 400));

    // V8.68: "dame información" de familia → menú de opciones (sin dump ni link aún).
    const sushiInfo = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({ nombre: "Ana", tipo_evento: "boda" }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "me interesa la barra de sushi, dame información",
      history: [],
    });
    assert.ok(/sushi|niveles|detallada|Solo Alimentos|B[aá]sic/i.test(sushiInfo), sushiInfo.slice(0, 500));
    assert.ok(!/\$400|Incluye:/i.test(sushiInfo), sushiInfo.slice(0, 400));
  });

  await test("93. Detalle Sheet — niveles/incluye en info y primer turno (no solo link)", () => {
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye"',
      '"Coffee Break","Basico","$180.00","$5,000.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café, pan dulce y fruta"',
      '"Coffee Break","Premium","$250.00","$5,000.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café premium, jugo y snacks"',
      '"Barra de sushi","Basico","$400.00","$12,000.00","TRUE","https://bodasesor.com/catalogos/barra-de-sushi","8 rollos y soya"',
      '"Barra de sushi","Premium","$550.00","$12,000.00","TRUE","https://bodasesor.com/catalogos/barra-de-sushi","12 rollos y chef"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    const detail = attachAvailableSheetDetail("coffee break");
    assert.ok(detail, "attachAvailableSheetDetail debe devolver texto");
    // Sheet o PDF aprendido: ambos cuentan como detalle de servicio.
    assert.ok(
      messageHasSheetServiceDetail(detail!) ||
        /incluye|Café|Coffee Break|\$\s*180|Basico|Premium/i.test(detail!),
      detail
    );
    assert.ok(/incluye|Café|pan dulce|\$\s*180|Basico|Premium|Coffee Break/i.test(detail!), detail);
    assert.ok(
      /bodasesor\.com\/catalogos/i.test(detail!) ||
        /bodasesor\.com\/catalogos/i.test(ensureCatalogWebLink(detail!, "coffee break")),
      detail
    );

    // Solo URL no cuenta como detalle Sheet.
    assert.equal(
      messageHasSheetServiceDetail("Catálogo:\nhttps://bodasesor.com/catalogos/coffee-break"),
      false
    );
    assert.equal(
      historyAlreadyOfferedServiceDetail([
        { role: "assistant", content: "Catálogo:\nhttps://bodasesor.com/catalogos/coffee-break" },
      ]),
      false
    );
    assert.ok(
      historyAlreadyOfferedServiceDetail([{ role: "assistant", content: detail! }])
    );

    const first = buildFirstInteractionMessage(
      {
        extracted: emptyExtracted({ requerimientos_evento: "coffee break" }),
        filledSet: new Set(["Requerimientos o servicios"]),
        history: [],
        currentMessage: "Hola, me interesa cotizar coffee break para un evento corporativo",
      },
      true
    );
    assert.ok(/lucy|bodasesor/i.test(first), first.slice(0, 200));
    // V8.68: primer contacto de familia → menú de paquetes (detalle tras elegir / "sí").
    assert.ok(
      /Coffee Break|paquetes|detalles de alguno|detallada|diferencia|nivel/i.test(first),
      `primer turno menú opciones: ${first.slice(0, 600)}`
    );
    assert.ok(!/\$\s*180|Incluye:/i.test(first), `sin dump en menú: ${first.slice(0, 400)}`);

    const info = runGuards({
      aiResponse: "Claro, ¿cuántos invitados?",
      extracted: emptyExtracted({ nombre: "Ana", tipo_evento: "corporativo" }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "dame información del coffee break",
      history: [],
    });
    assert.ok(
      /Coffee Break|paquetes|detalles de alguno|detallada|diferencia/i.test(info),
      `info → menú primero: ${info.slice(0, 600)}`
    );
    assert.ok(!/\$\s*180|Incluye:/i.test(info), info.slice(0, 400));

    const afterSi = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Ana",
        tipo_evento: "corporativo",
        requerimientos_evento: "coffee break",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "Sí",
      history: [{ role: "assistant", content: info }],
    });
    assert.ok(
      /incluye|Café|pan dulce|Basico|Premium|\$\s*180/i.test(afterSi),
      `sí → detalle Sheet: ${afterSi.slice(0, 600)}`
    );
    assert.ok(/bodasesor\.com\/catalogos/i.test(afterSi), afterSi.slice(0, 400));

    const price = buildCatalogPriceAnswer("barra de sushi") || "";
    assert.ok(/\$\s*\d/.test(price), price);
    assert.ok(/incluye|rollos/i.test(price), `precio multi-nivel debe traer Incluye: ${price}`);
  });

  await test("94. Car A14949 — Coffee Break 5 = nivel (no 5 invitados), Viernes 24", () => {
    const lastOffer = [
      "Para *Coffee Break* manejamos estos niveles:",
      "",
      "1. *Coffee Break 1* — $120.00 /pp",
      "2. *Coffee Break 2* — $200.00 /pp",
      "3. *Coffee Break 3* — $280.00 /pp",
      "4. *Coffee Break 4* — $350.00 /pp",
      "5. *Coffee Break 5* — $400.00 /pp",
      "",
      "¿Cuál nivel prefieres?",
      "https://bodasesor.com/catalogos/coffee-break",
      "",
      "¿Cómo te llamas?",
    ].join("\n");

    assert.equal(parseInvitadosFromText("Me interesaría el coffe break 5"), null);
    assert.equal(parseInvitadosFromText("coffee break 5"), null);
    assert.equal(
      extractCatalogNivelFromText("Me interesaría el coffe break 5", lastOffer),
      "Coffee Break 5"
    );
    assert.equal(extractCatalogNivelFromText("el 5", lastOffer), "Coffee Break 5");
    assert.ok(isCatalogLevelSelection("Me interesaría el coffe break 5", lastOffer));
    assert.ok(isCatalogLevelSelection("5", lastOffer));

    const amb = { num_invitados: 5 as number | null };
    sanitizeExtractedAmbiguousNumbers(amb, "Me interesaría el coffe break 5");
    assert.equal(amb.num_invitados, null);

    assert.equal(parseFechaFromText("Viernes 24"), "Viernes 24");
    assert.ok(/viernes\s+24/i.test(parseFechaFromText("el viernes 24") || ""));

    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye"',
      '"Coffee Break","Coffee Break 5","$400.00","$12,000.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Menú premium CB5"',
      '"Coffee Break","Coffee Break 1","$120.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Menú CB1"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    const pick = runGuards({
      aiResponse: "Mucho gusto, Car. ¿A qué correo te lo envío?",
      extracted: emptyExtracted({
        nombre: "Car",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Coffee Break",
        num_invitados: 5,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "Me interesaría el coffe break 5",
      history: [
        {
          role: "user",
          content: "Hola, me interesa cotizar: Coffee Break para Eventos Corporativos",
        },
        { role: "assistant", content: lastOffer },
      ],
      whatsappDisplayName: "Car",
    });
    assert.ok(/anoto|Coffee Break 5|\*Coffee Break 5\*/i.test(pick), pick.slice(0, 400));
    assert.ok(!/5\s*invitados|somos 5/i.test(pick), pick.slice(0, 300));
    assert.ok(
      /correo|invitados|cu[aá]ntos/i.test(pick),
      `debe seguir embudo tras ack nivel: ${pick.slice(0, 400)}`
    );
  });

  // ─── 95. V8.40 — Información manual (PDF/tips) PRIMERO en el system prompt ───
  await test("95. Información para Lucy se inyecta PRIMERO en el prompt", async () => {
    const prompt = buildDynamicPrompt({
      stage: "discovery",
      priority: "medium",
      extracted: emptyExtracted({ tipo_evento: "boda" }),
      crmContext: "",
      catalogBlock: "CATALOGO_TEST",
      lucyInfoBlock: [
        "PRIORIDAD 1 — INFORMACIÓN MANUAL PARA LUCY (PDFs y tips del panel Aprendizaje)",
        "—— Tendencias, modas y consejos ——",
        "### Tendencias 2026",
        "Bodas íntimas con coffee break premium y flores silvestres.",
      ].join("\n"),
    });
    assert.ok(prompt.includes("CATALOGO_TEST"));
    assert.ok(/INFORMACIÓN MANUAL PARA LUCY|PRIORIDAD 1/i.test(prompt));
    assert.ok(/Bodas íntimas con coffee break premium/i.test(prompt));
    const infoIdx = prompt.search(/PRIORIDAD 1|INFORMACIÓN MANUAL PARA LUCY/i);
    const catalogIdx = prompt.indexOf("CATALOGO_TEST");
    assert.ok(infoIdx >= 0 && catalogIdx >= 0 && infoIdx < catalogIdx, "info manual debe ir antes del Sheet");
  });

  // ─── 96. A14964 Victor Ramos — nombre≠PDF, tipo meta, café/catering, presupuesto ───
  await test("96. A14964 Victor — nombre, tipo, café/catering, presupuesto sin re-pedir correo", () => {
    assert.ok(looksLikeNameAnswerMessage("Victor Ramos de Destiladora San Francisco"));
    assert.ok(!looksLikeNameAnswerMessage("Es solo café o tienes catering de comida"));
    assert.ok(clientAsksCafeOrCateringChoice("Es solo café o tienes catering de comida"));
    assert.ok(isVagueFoodTerm("Es solo café o tienes catering de comida"));
    assert.ok(!parseServicesFromText("Es solo café o tienes catering de comida").some((s) =>
      /banquete\s*\/\s*taquiza/i.test(s)
    ));

    assert.ok(isUnusableTipoEventoReply("Lo acabo de mencionar"));
    assert.ok(isUnusableTipoEventoReply("ya te dije"));
    assert.ok(!isUnusableTipoEventoReply("evento corporativo"));
    assert.ok(!isServiceLabelNotTipoEvento("evento con banquete"));

    const banqueteCaps = captureContextualAnswer(
      [{ role: "assistant", content: "¿Qué tipo de evento estás organizando?" }],
      "Banquete para 100 personas, requiero servicio de catering completo, comida, loza y meseros",
      new Set(["Nombre del cliente", "Correo electrónico"])
    );
    assert.ok(
      banqueteCaps.some((c) => c.label === "Tipo de evento" && /banquete|catering/i.test(c.value)),
      JSON.stringify(banqueteCaps)
    );
    assert.ok(
      banqueteCaps.some((c) => c.label === "Número de invitados" && c.value === "100"),
      JSON.stringify(banqueteCaps)
    );

    const metaCaps = captureContextualAnswer(
      [
        { role: "user", content: "Banquete para 100 personas, catering completo" },
        { role: "assistant", content: "¿Qué tipo de evento es?" },
      ],
      "Lo acabo de mencionar",
      new Set(["Nombre del cliente", "Correo electrónico"])
    );
    assert.ok(
      !metaCaps.some((c) => c.label === "Tipo de evento" && /acabo de mencionar/i.test(c.value)),
      JSON.stringify(metaCaps)
    );
    assert.ok(
      metaCaps.some((c) => c.label === "Tipo de evento" && /banquete|catering/i.test(c.value)),
      JSON.stringify(metaCaps)
    );

    assert.ok(detectPresupuestoRefusal("Para eso te contacto"));

    const cafeReply = buildVagueFoodOptionsReply(
      emptyExtracted({ nombre: "Victor" }),
      [],
      "Es solo café o tienes catering de comida"
    );
    assert.ok(/barra de caf|catering/i.test(cafeReply), cafeReply.slice(0, 300));
    assert.ok(!/banquete formal 3 tiempos/i.test(cafeReply), cafeReply.slice(0, 300));

    const afterName = runGuards({
      aiResponse: "Según el catálogo que ya tenemos de *Barra de Cafe bodasesor*: dump…",
      extracted: emptyExtracted({ nombre: "Victor Ramos" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "Victor Ramos de Destiladora San Francisco",
      history: [{ role: "assistant", content: "¿Cómo te llamas?" }],
    });
    assert.ok(!/Según el catálogo que ya tenemos/i.test(afterName), afterName.slice(0, 400));
    assert.ok(!/Barra de Caf/i.test(afterName), afterName.slice(0, 400));

    const filled = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Número de invitados",
      "Correo electrónico",
    ]);
    const extracted = emptyExtracted({
      nombre: "Victor Ramos",
      correo: "sanfrancisco.destiladora@gmail.com",
      tipo_evento: "evento con banquete",
      requerimientos_evento: "Banquete Formal, Meseros",
      direccion_evento: "nuestras instalaciones",
      fecha_horario: "Febrero",
      num_invitados: 100,
    });
    const afterBudget = runGuards({
      aiResponse: "Mucho gusto, Victor. ¿A qué correo te mando la información?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Para eso te contacto",
      history: [
        { role: "user", content: "sanfrancisco.destiladora@gmail.com" },
        { role: "assistant", content: "¿Manejan algún presupuesto estimado para el evento?" },
      ],
    });
    assert.ok(!/correo|e-?mail/i.test(afterBudget), afterBudget.slice(0, 400));
    assert.ok(/sin problema|por definir|equipo|propon/i.test(afterBudget), afterBudget.slice(0, 400));
  });

  // ─── 97. A14967 Angélica — pista personalizada: tipos primero, detalle después ───
  await test("97. A14967 Angélica — pista: menú de tipos primero, detalle tras elección", () => {
    assert.equal(parsePistaTarimaVariant("pista de baile personalizada"), null);
    assert.equal(parsePistaTarimaVariant("Quisiera cotizar una pista personalizada"), null);
    assert.ok(parsePistaTarimaVariant("pista LED interactiva")?.key === "pista_led");
    assert.ok(parsePistaTarimaVariant("la LED")?.key === "pista_led");
    assert.ok(parsePistaTarimaVariant("pintada a mano")?.key === "pista_pintada");
    assert.ok(parsePistaTarimaVariant("con logo")?.key === "pista_logo");

    const first = runGuards({
      aiResponse:
        "Según el catálogo que ya cargamos en Aprendizaje:\n*Pistas-y-Tarimas-2026*: $7,430 Pista 6x6m…\n¿Qué medidas aproximadas tiene el espacio?",
      extracted: emptyExtracted({ nombre: "Angélica" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage:
        "Quisiera una cotización por favor para una pista de baile personalizada. Mi nombre es Angélica",
      history: [{ role: "assistant", content: "¿Cómo te llamas?" }],
    });
    assert.ok(/pista|tarima/i.test(first), first.slice(0, 300));
    assert.ok(/vinil|pintada|LED|estilo|opciones/i.test(first), first.slice(0, 500));
    assert.ok(!/Según el catálogo que ya cargamos/i.test(first), first.slice(0, 400));
    assert.ok(!/\$7,?430|Pista 6x6m|\$20,?250/i.test(first), first.slice(0, 400));
    // Una sola pregunta de medidas (si aparece), sin bloquear el menú.
    const medidasAsks = (first.match(/¿Qué medidas aproximadas tiene el espacio\?/gi) || []).length;
    assert.ok(medidasAsks <= 1, first.slice(0, 400));

    const detail = runGuards({
      aiResponse: "¿Quieres que te dé detalles de alguno?",
      extracted: emptyExtracted({
        nombre: "Angélica",
        requerimientos_evento: "pista de baile / tarima",
      }),
      filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "La LED",
      history: [
        { role: "assistant", content: first },
      ],
    });
    assert.ok(/LED|interactiva/i.test(detail), detail.slice(0, 400));
    // Tras elegir: sí puede haber precios/detalle, y pide medidas (sin duplicar).
    assert.ok(
      /\$|m²|medidas|Aprendizaje|detallo/i.test(detail),
      detail.slice(0, 500)
    );
    const medidas2 = (detail.match(/¿Qué medidas aproximadas tiene el espacio\?/gi) || []).length;
    assert.equal(medidas2, 1, detail.slice(0, 500));
  });

  // ─── 98. V8.68 — opciones primero en todos los servicios; detalle + link después ───
  await test("98. V8.68 — banquete/coffee: menú primero, detalle+link tras elegir", () => {
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye"',
      '"Banquete Formal 3 tiempos","Basico","$500.00","$15,000.00","TRUE","https://bodasesor.com/catalogos/banquete-formal","Entrada, plato fuerte y postre"',
      '"Banquete Formal 3 tiempos","Premium","$750.00","$15,000.00","TRUE","https://bodasesor.com/catalogos/banquete-formal","Entrada premium"',
      '"Banquete Mexicano 4 tiempos","Basico","$600.00","$18,000.00","TRUE","https://bodasesor.com/catalogos/banquete-mexicano","4 tiempos"',
      '"Coffee Break","Coffee Break 1","$180.00","$5,000.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café y galletas"',
      '"Coffee Break","Coffee Break 5","$400.00","$12,000.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Menú premium"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    const banqueteAsk = runGuards({
      aiResponse: "¿Quieres banquete formal con todos los precios?",
      extracted: emptyExtracted({ nombre: "Ana" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "Quiero banquete para mi evento",
      history: [{ role: "assistant", content: "¿Qué necesitas?" }],
    });
    assert.ok(
      /Formal|Mexicano|detalles de alguno|detallada/i.test(banqueteAsk),
      banqueteAsk.slice(0, 400)
    );
    assert.ok(!/\$500|\$750|Incluye:/i.test(banqueteAsk), banqueteAsk.slice(0, 400));
    assert.ok(!/bodasesor\.com\/catalogos/i.test(banqueteAsk), banqueteAsk.slice(0, 300));
    assert.ok(!/correo|e-?mail/i.test(banqueteAsk), banqueteAsk.slice(0, 300));

    const banqueteDetail = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Ana",
        requerimientos_evento: "banquete",
      }),
      filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "El formal de 3 tiempos",
      history: [{ role: "assistant", content: banqueteAsk }],
    });
    assert.ok(/Formal|3\s*tiempos|\$500|\$750|nivel/i.test(banqueteDetail), banqueteDetail.slice(0, 500));
    assert.ok(
      /bodasesor\.com\/catalogos/i.test(banqueteDetail),
      `detalle debe incluir link: ${banqueteDetail.slice(0, 500)}`
    );

    // "Sí" sin elegir → toda la info + link de catálogo aparte.
    const banqueteSi = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Ana",
        requerimientos_evento: "banquete",
      }),
      filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "Sí",
      history: [{ role: "assistant", content: banqueteAsk }],
    });
    assert.ok(/\$500|Formal|Mexicano|nivel/i.test(banqueteSi), banqueteSi.slice(0, 500));
    assert.ok(
      /bodasesor\.com\/catalogos/i.test(banqueteSi),
      `sí → detalle+link: ${banqueteSi.slice(0, 500)}`
    );

    const coffeeAsk = runGuards({
      aiResponse: "te mando todos los coffee break",
      extracted: emptyExtracted({ nombre: "Ana" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "Me interesa coffee break",
      history: [{ role: "assistant", content: "¿Qué servicio buscas?" }],
    });
    // A15168: Coffee Break lista paquetes 1–5 con significado + catálogo (no menú opaco).
    assert.ok(
      /Coffee Break|paquetes|detalles de alguno|Coffee Break 1/i.test(coffeeAsk),
      coffeeAsk.slice(0, 400)
    );
    assert.ok(
      /bodasesor\.com\/catalogos\/coffee-break|Coffee Break 1/i.test(coffeeAsk),
      coffeeAsk.slice(0, 400)
    );
    assert.ok(!/correo|e-?mail/i.test(coffeeAsk), coffeeAsk.slice(0, 300));
  });

  // ─── 99. V8.69 — Facebook/Instagram: canal Kommo ≠ WhatsApp Meta ───
  await test("99. V8.69 — clasifica origen FB/IG y usa Kommo send_message", () => {
    assert.equal(classifyKommoOrigin("facebook"), "facebook");
    assert.equal(classifyKommoOrigin("Facebook Messenger"), "facebook");
    assert.equal(classifyKommoOrigin("instagram"), "instagram");
    assert.equal(classifyKommoOrigin("whatsapp"), "whatsapp");
    assert.equal(classifyKommoOrigin("waba"), "whatsapp");
    assert.ok(usesKommoExternalSend("facebook"));
    assert.ok(usesKommoExternalSend("instagram"));
    assert.ok(!usesKommoExternalSend("whatsapp"));

    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const talksSrc = readFileSync(path.join(apiRoot, "src/services/kommoTalks.ts"), "utf8");
    const mirrorSrc = readFileSync(path.join(apiRoot, "src/services/kommoMirror.ts"), "utf8");
    assert.ok(/sendKommoTalkMessage|send_message/.test(talksSrc));
    assert.ok(/sin teléfono — intentando envío por Kommo/i.test(mirrorSrc));
  });

  // ─── 100. A14975 Mariana — Nivel tradicional: detalle + servicio + general ───
  await test("100. A14975 — sushi 'Nivel tradicional' da detalle (no re-lista) + 2 catálogos", () => {
    const csvSushi = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye","Link catalogo"',
      '"Barra de sushi","Solo Alimentos","$420.00","$8,400.00","TRUE","Rollos y soya","https://bodasesor.com/catalogos/barra-de-sushi"',
      '"Barra de sushi","Basico","$800.00","$16,000.00","TRUE","8 piezas","https://bodasesor.com/catalogos/barra-de-sushi"',
      '"Barra de sushi","Tradicional","$850.00","$17,000.00","TRUE","12 piezas y chef","https://bodasesor.com/catalogos/barra-de-sushi"',
      '"Barra de sushi","Premium","$900.00","$18,000.00","TRUE","15 piezas premium","https://bodasesor.com/catalogos/barra-de-sushi"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csvSushi));

    assert.equal(
      withCatalogNivelQuery("Barra de sushi", "Nivel tradicional"),
      "Barra de sushi Tradicional"
    );
    assert.equal(catalogNivelLabelFromText("Nivel tradicional"), "Tradicional");

    const menu =
      "Claro. En *Barra de sushi* tenemos *solo alimentos* o *servicio completo* (bebidas, mobiliario y meseros).\n\n¿Cuál te late más?\n\n¿Cómo te llamas?";

    const reply = runGuards({
      aiResponse: "¿Cuál nivel?",
      extracted: emptyExtracted({
        nombre: "Mariana García",
        requerimientos_evento: "Barra de sushi",
      }),
      filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "Nivel tradicional",
      history: [
        {
          role: "user",
          content: "Hola, me interesa cotizar: Barra de Sushi para un evento",
        },
        { role: "assistant", content: menu },
      ],
    });

    assert.ok(
      /Tradicional|\$850|12 piezas/i.test(reply),
      `debe detallar Tradicional: ${reply.slice(0, 600)}`
    );
    assert.ok(
      !/¿Cu[aá]l nivel prefieres/i.test(reply),
      `no re-preguntar nivel: ${reply.slice(0, 500)}`
    );
    // No volver a listar los 4 niveles como menú de elección.
    assert.ok(
      !(/Solo Alimentos[\s\S]*Basico[\s\S]*Tradicional[\s\S]*Premium/i.test(reply) &&
        /¿Cu[aá]l nivel/i.test(reply)),
      `no re-listar niveles: ${reply.slice(0, 600)}`
    );
    const sushiUrls = reply.match(/bodasesor\.com\/catalogos\/barra-de-sushi/gi) || [];
    assert.equal(sushiUrls.length, 1, `un link de servicio: ${reply.slice(0, 700)}`);
    assert.ok(
      /Cat[aá]logo general:[\s\S]*bodasesor\.com\/catalogos(?!\/[a-z])/i.test(reply) ||
        /Cat[aá]logo general:\s*\nhttps?:\/\/(?:www\.)?bodasesor\.com\/catalogos\/?\s*$/m.test(
          reply
        ),
      `debe incluir catálogo general: ${reply.slice(0, 700)}`
    );
  });

  // ─── 101. A14970 Erika — café con acento + preferencia post-cierre ≠ Banquete ───
  await test("101. A14970 — barra de café (acento) y preferencia bebidas sin Banquete", () => {
    const cafeMsg = "Hola, me interesa cotizar: Barra de Café Premium para Eventos";
    assert.ok(clientMentionsCatering(cafeMsg), "debe detectar catering con café acentuado");
    const services = parseServicesFromText(cafeMsg);
    assert.ok(
      services.some((s) => /barra de caf/i.test(s)),
      `debe capturar Barra de Café: ${services.join(", ")}`
    );
    assert.ok(!services.some((s) => /^Coffee break$/i.test(s)), services.join(", "));

    const withMeseros =
      "Me interesa una barra de café para 50 personas, es evento corporativo y 2 meseros.";
    const mixed = parseServicesFromText(withMeseros);
    assert.equal(
      preferPrimaryCatalogService(mixed),
      "Barra de Café",
      `primario café no meseros: ${mixed.join(", ")}`
    );

    const pref =
      "Buenas noches.\nRespecto a la barra de café, solo requieren, americano, capuchino y té";
    assert.ok(
      isServicePreferenceRefinement(pref, "Barra de Café Premium"),
      "debe ser refinamiento de preferencia"
    );
    assert.ok(!/banquete/i.test(parsePrimaryService(pref) || ""), parsePrimaryService(pref));

    const csvCafe = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye","Link catalogo"',
      '"Barra de Café","Premium","$180.00","$9,000.00","TRUE","Baristas y bebidas artesanales","https://bodasesor.com/catalogos/barra-de-cafe"',
      '"Banquete Formal 3 tiempos","Solo Alimentos","$450.00","$13,500.00","TRUE","Entrada plato fuerte","https://bodasesor.com/catalogos/banquete-formal"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csvCafe));

    const postCierre = runGuards({
      aiResponse: "¿Algo más?",
      extracted: emptyExtracted({
        nombre: "Erika Castañeda",
        correo: "malinali2707@hotmail.com",
        tipo_evento: "corporativo",
        num_invitados: 50,
        requerimientos_evento: "Barra de Café Premium, Meseros",
        zona: "Pachuca de Soto, Hidalgo",
        fecha_horario: "3 de agosto",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Número de invitados",
        "Requerimientos o servicios",
        "Zona o ubicación del evento",
        "Fecha y horario",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: true,
      cierreYaEnviado: true,
      currentMessage: pref,
      history: [
        { role: "user", content: cafeMsg },
        {
          role: "assistant",
          content:
            "Perfecto, ya tengo todo. Voy a compartir esta información con nuestro equipo para que te prepare una cotización personalizada.",
        },
      ],
    });
    assert.ok(
      /preferencia|anoto|americano|capuchin|equipo/i.test(postCierre),
      `ack preferencia: ${postCierre.slice(0, 500)}`
    );
    assert.ok(
      !/Banquete Formal|Solo Alimentos|\$450|Te detallo \*Buenas noches/i.test(postCierre),
      `no Banquete ni mensaje crudo: ${postCierre.slice(0, 600)}`
    );
    assert.ok(
      !/a qu[eé] correo/i.test(postCierre),
      `no re-pedir correo: ${postCierre.slice(0, 400)}`
    );

    // Misma preferencia sin cierre detectado: tampoco Banquete.
    const mid = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Erika",
        requerimientos_evento: "Barra de Café Premium",
        tipo_evento: "corporativo",
      }),
      filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios", "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: pref,
      history: [
        { role: "user", content: cafeMsg },
        { role: "assistant", content: "Perfecto, Erika. ¿A qué correo te envío la información?" },
      ],
    });
    assert.ok(
      !/Banquete Formal|Te detallo \*Buenas noches/i.test(mid),
      `sin Banquete a mitad de flujo: ${mid.slice(0, 500)}`
    );
  });

  await test("102. Catálogo web — detección y variantes de todas las líneas", () => {
    // Banquetes: Formal/Mexicano/Kosher/Navideño × tiempos (sin el bug 4→Mexicano).
    assert.equal(banqueteDetailQuery("De tres tiempos"), "Banquete Formal 3 tiempos");
    assert.equal(banqueteDetailQuery("4 tiempos"), "Banquete Formal 4 tiempos");
    assert.equal(banqueteDetailQuery("formal 4 tiempos"), "Banquete Formal 4 tiempos");
    assert.equal(banqueteDetailQuery("mexicano 3 tiempos"), "Banquete Mexicano 3 tiempos");
    assert.equal(banqueteDetailQuery("mexicano 4 tiempos"), "Banquete Mexicano 4 tiempos");
    assert.equal(banqueteDetailQuery("kosher buffet"), "Banquete Kosher Buffet");
    assert.equal(banqueteDetailQuery("kosher 3 tiempos"), "Banquete Kosher 3 tiempos");
    assert.equal(banqueteDetailQuery("banquete navideño 4 tiempos"), "Banquete Navideño 4 tiempos");
    assert.equal(
      resolveDetailQueryForFamily("banquete", "El formal de 3 tiempos"),
      "Banquete Formal 3 tiempos"
    );

    const expectHas = (msg: string, label: string) => {
      const found = parseServicesFromText(msg);
      assert.ok(
        found.some((s) => s.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(s.toLowerCase())),
        `"${msg}" → esperaba ${label}, got ${JSON.stringify(found)}`
      );
    };
    const expectPrimary = (msg: string, label: string) => {
      const found = parseServicesFromText(msg);
      assert.ok(
        found.includes(label) || found[0] === label,
        `"${msg}" → esperaba incluir ${label}, got ${JSON.stringify(found)}`
      );
    };

    // Banquetes
    expectPrimary("banquete mexicano", "Banquete Mexicano");
    assert.ok(!parseServicesFromText("banquete mexicano").includes("Banquete Formal"));
    expectPrimary("banquete kosher", "Banquete Kosher");
    expectPrimary("banquete navideño", "Banquete Navideño");

    // Barras y bebidas
    expectPrimary("barra americana", "Barra Americana");
    expectPrimary("barra yucateca", "Barra Yucateca");
    expectPrimary("barra de bebidas con alcohol", "Barra de bebidas");
    expectPrimary("barra de café", "Barra de Café");
    expectPrimary("barra de crepas", "Barra de Crepas");
    expectPrimary("barra de mariscos", "Barra de mariscos");
    expectPrimary("barra de paninis", "Barra de paninis");
    expectPrimary("barra de pastas y ensaladas", "Barra de pastas y ensaladas");
    expectPrimary("barra de pizzas", "Barra de pizzas");
    expectPrimary("barra de sushi", "Barra de sushi");
    expectHas("coctelería y mixología", "Coctelería");
    expectPrimary("mócteles", "Mócteles");

    // Gastronomía
    expectPrimary("paella", "Paella");
    expectPrimary("pozole y tostadas", "Pozole y Tostadas");
    expectPrimary("puestos de comida", "Puestos de Comida");
    expectPrimary("canapés", "Canapés");
    expectPrimary("bocadillos", "Bocadillos");
    expectPrimary("cupcakes", "Cupcakes y Betún");
    expectPrimary("betún decorado", "Cupcakes y Betún");
    expectPrimary("paletas de hielo", "Paletas de Hielo y Helados");
    expectPrimary("parrillada argentina", "Parrillada Argentina");
    expectPrimary("parrillada de tacos", "Parrillada Tacos");
    assert.ok(!parseServicesFromText("parrillada de tacos").includes("Taquiza"));
    expectPrimary("taquiza", "Taquiza");

    // Mesas dulces
    expectPrimary("carrito de snaks", "Carrito de Snacks");
    expectPrimary("mesa de dulces", "Mesa de dulces");
    expectPrimary("mesa de postres", "Mesa de postres");
    expectPrimary("mesa de quesos", "Mesa de quesos");
    // A15190: centros de mesa (floral) ≠ mobiliario.
    expectPrimary("centros de mesa", "Centros de mesa");
    expectPrimary("De centros de mesa", "Centros de mesa");
    expectPrimary("arreglos de mesa", "Centros de mesa");
    expectPrimary("centros florales", "Centros de mesa");
    assert.ok(!parseServicesFromText("centros de mesa").includes("Mobiliario"));
    assert.ok(!parseServicesFromText("De centros de mesa").includes("Mobiliario"));
    assert.ok(!parseServicesFromText("arreglos de mesa").includes("Mobiliario"));

    // Mobiliario
    expectPrimary("entelados", "Entelados para Techo");
    expectPrimary("colgantes premium", "Colgantes Premium");
    expectPrimary("decoración aérea", "Colgantes Premium");
    expectPrimary("vajillas", "Vajillas");
    expectHas("mesas y sillas", "Mobiliario");
    expectHas("tarima", "Pista de baile");

    // Fiestas / audio / empresas
    expectPrimary("fiesta infantil", "Fiesta Infantil");
    expectHas("audio e iluminación", "Audio");
    expectPrimary("video", "Video");
    expectPrimary("coffee break", "Coffee break");
    expectPrimary("comida corrida", "Comida Corrida");
    expectPrimary("desayuno", "Desayuno");
    expectPrimary("brunch", "Brunch");

    // Familias progresivas
    assert.equal(detectProgressiveFamily("quiero banquete"), "banquete");
    assert.equal(detectProgressiveFamily("barra de café"), "barra_cafe");
    assert.equal(detectProgressiveFamily("paella para 80"), "gastronomia");
    assert.equal(detectProgressiveFamily("cupcakes"), "cupcakes_betun");
    assert.equal(detectProgressiveFamily("entelados para techo"), "mobiliario");
    assert.equal(detectProgressiveFamily("centros de mesa"), null);
    assert.equal(detectProgressiveFamily("De centros de mesa"), null);
    assert.equal(parseMobiliarioPieceChoice("centros de mesa"), null);
    assert.equal(detectProgressiveFamily("parrillada tacos"), "parrillada");
    assert.equal(
      resolveDetailQueryForFamily("parrillada", "parrillada de tacos"),
      "Parrillada Tacos"
    );
    assert.equal(resolveDetailQueryForFamily("cupcakes_betun", "betún clásico"), "Betún Clásico");
    assert.equal(resolveDetailQueryForFamily("gastronomia", "pozole"), "Pozole y Tostadas");
    assert.equal(
      resolveDetailQueryForFamily("barra_alimentos", "barra de pastas"),
      "Barra de pastas y ensaladas"
    );
    assert.equal(resolveDetailQueryForFamily("mesa_dulces", "carrito de snacks"), "Carrito de Snacks");
  });

  await test("103. Regina A14981 — pastas sin Taquiza, nombre sin doble, solo comida", () => {
    // Visión inventa taquiza → no parsear como pedido.
    const visionTurn = formatImageTurnText(
      {
        intent: "comida_producto",
        internalDescription: "Pasta fresca en plato",
        clientReply:
          "¡Me encanta la idea de la pasta fresca! Podemos ofrecer un servicio de taquiza o un menú de pasta para tu evento.",
      },
      "Tengo en mente una barra de pastas."
    );
    const captionOnly = clientCaptionForServiceParse(visionTurn);
    assert.ok(/barra de pastas/i.test(captionOnly), captionOnly);
    assert.ok(!/taquiza/i.test(captionOnly), captionOnly);
    const fromCaption = parseServicesFromText(captionOnly);
    assert.ok(fromCaption.includes("Barra de pastas"), JSON.stringify(fromCaption));
    assert.ok(!fromCaption.includes("Taquiza"), JSON.stringify(fromCaption));

    // Merge contaminado se limpia.
    const merged = mergeServiceRequirements("Barra de pastas", "Pastas, Taquiza", 6);
    assert.ok(merged && /barra de pastas/i.test(merged) && !/taquiza/i.test(merged), merged);
    assert.ok(!/(^|,\s*)Pastas(,|$)/i.test(merged!), merged);

    assert.ok(looksLikeConflictingFoodAlternatives(["Barra de pastas", "Taquiza"]));
    assert.equal(
      preferPrimaryCatalogService(["Taquiza", "Barra de pastas", "Pastas"]),
      "Barra de pastas"
    );

    assert.ok(clientWantsFoodOnlyQuote("Solo quiero que me coticen la comida"));
    assert.ok(!clientDeclinesMoreServices("Solo quiero que me coticen la comida"));
    assert.ok(clientDeclinesMoreServices("Robots leds solo quiero"));

    const closing = buildStandardClosingMessage("Barra de pastas, Pastas, Taquiza", "Regina");
    assert.ok(/barra de pastas/i.test(closing), closing.slice(0, 400));
    assert.ok(!/taquiza/i.test(closing), closing.slice(0, 400));
    assert.ok(!/además de la comida,\s*como/i.test(closing), closing.slice(0, 400));

    // Nombre: Perfecto. + Mucho gusto, Regina (sin doble Regina en Perfecto).
    const nameTurn = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({ nombre: "Regina Couttolenc" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "Regina Couttolenc",
      history: [
        {
          role: "assistant",
          content: "Hola, soy Lucy, agente virtual de Bodasesor. ¿Cómo te llamas?",
        },
      ],
    });
    assert.ok(/Mucho gusto,\s*Regina/i.test(nameTurn), nameTurn.slice(0, 300));
    assert.ok(
      !/Perfecto,\s*Regina\.\s*Mucho gusto,\s*Regina/i.test(nameTurn),
      `sin doble nombre: ${nameTurn.slice(0, 300)}`
    );

    // Turno imagen+caption: CRM no lleva Taquiza; respuesta no dump de taquiza.
    const pastaCsv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye"',
      '"Barra de pastas y ensaladas","Basico","$340.00","$10,200.00","TRUE","https://bodasesor.com/catalogos/barra-de-pastas","Pastas"',
      '"Taquiza","Solo Alimentos","$300.00","$9,000.00","TRUE","https://bodasesor.com/catalogos/taquiza","Tacos"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(pastaCsv));

    const extracted = emptyExtracted({
      nombre: "Regina",
      correo: "regi.cu89@gmail.com",
      tipo_evento: "bautizo",
      requerimientos_evento: "Barra de pastas",
    });
    const filled = new Set([
      "Nombre del cliente",
      "Correo",
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    const imgReply = runGuards({
      aiResponse: "ok",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: visionTurn,
      history: [
        { role: "user", content: "Bautizo." },
        { role: "assistant", content: "¿Qué servicios tienes en mente?" },
      ],
    });
    assert.ok(
      !/Sí, manejamos Taquiza|Solo Alimentos.*\$300/i.test(imgReply),
      `sin dump taquiza: ${imgReply.slice(0, 500)}`
    );
    assert.ok(
      !/Taquiza/i.test(extracted.requerimientos_evento ?? ""),
      `CRM limpio: ${extracted.requerimientos_evento}`
    );

    // Solo comida acota CRM.
    const foodOnly = emptyExtracted({
      nombre: "Regina",
      correo: "regi@x.com",
      tipo_evento: "bautizo",
      requerimientos_evento: "Barra de pastas, Taquiza, Comida",
    });
    const foodFilled = new Set([
      "Nombre del cliente",
      "Correo",
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    runGuards({
      aiResponse: "ok",
      extracted: foodOnly,
      filledSet: foodFilled,
      readyForClosing: false,
      currentMessage: "Solo quiero que me coticen la comida",
      history: [{ role: "assistant", content: "¿Te gustaría sumar otro servicio?" }],
    });
    assert.ok(
      /barra de pastas/i.test(foodOnly.requerimientos_evento ?? "") &&
        !/taquiza/i.test(foodOnly.requerimientos_evento ?? ""),
      `solo comida → ${foodOnly.requerimientos_evento}`
    );
  });

  await test("104. A14982 — CTA detalle en TODAS las ramas (no solo Yucateca)", () => {
    assert.ok(/detalles de alguno/i.test(SERVICE_NIVEL_DETAIL_CTA));

    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye"',
      '"Barra Yucateca","Solo Alimentos","$330.00","$9,900.00","TRUE","https://bodasesor.com/catalogos/barra-yucateca","guisos"',
      '"Barra Yucateca","Basico","$750.00","$22,500.00","TRUE","https://bodasesor.com/catalogos/barra-yucateca","basico"',
      '"Barra Yucateca","Tradicional","$800.00","$24,000.00","TRUE","https://bodasesor.com/catalogos/barra-yucateca","tradicional"',
      '"Barra Yucateca","Premium","$850.00","$25,500.00","TRUE","https://bodasesor.com/catalogos/barra-yucateca","premium"',
      '"Taquiza","Solo Alimentos","$300.00","$9,000.00","TRUE","https://bodasesor.com/catalogos/taquiza","tacos"',
      '"Taquiza","Basico","$750.00","$22,500.00","TRUE","https://bodasesor.com/catalogos/taquiza","basico"',
      '"Taquiza","Tradicional","$800.00","$24,000.00","TRUE","https://bodasesor.com/catalogos/taquiza","tradicional"',
      '"Taquiza","Premium","$850.00","$25,500.00","TRUE","https://bodasesor.com/catalogos/taquiza","premium"',
      '"Barra de sushi","Solo Alimentos","$400.00","$12,000.00","TRUE","https://bodasesor.com/catalogos/barra-de-sushi","sushi"',
      '"Barra de sushi","Basico","$800.00","$24,000.00","TRUE","https://bodasesor.com/catalogos/barra-de-sushi","basico"',
      '"Barra de sushi","Tradicional","$850.00","$25,500.00","TRUE","https://bodasesor.com/catalogos/barra-de-sushi","tradicional"',
      '"Barra de sushi","Premium","$900.00","$27,000.00","TRUE","https://bodasesor.com/catalogos/barra-de-sushi","premium"',
      '"Barra de Café","Basico","$350.00","$10,500.00","TRUE","https://bodasesor.com/catalogos/barra-de-cafe","cafe"',
      '"Barra de Café","Tradicional","$450.00","$13,500.00","TRUE","https://bodasesor.com/catalogos/barra-de-cafe","cafe t"',
      '"Barra de Café","Premium","$550.00","$16,500.00","TRUE","https://bodasesor.com/catalogos/barra-de-cafe","cafe p"',
      '"Barra Americana","Basico","$400.00","$12,000.00","TRUE","https://bodasesor.com/catalogos/barra-americana","am"',
      '"Barra Americana","Tradicional","$500.00","$15,000.00","TRUE","https://bodasesor.com/catalogos/barra-americana","am t"',
      '"Barra Americana","Premium","$600.00","$18,000.00","TRUE","https://bodasesor.com/catalogos/barra-americana","am p"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    // Dump Sheet: CTA o embudo solo vs completo (V9.27).
    for (const svc of [
      "Barra Yucateca",
      "Taquiza",
      "Barra de sushi",
      "Barra de Café",
      "Barra Americana",
    ]) {
      const detail = buildCatalogServiceDetailAnswer(svc);
      assert.ok(detail, `detail ${svc}`);
      assert.ok(
        /quieres que te d[eé] detalles de alguno|cu[aá]l te late m[aá]s/i.test(detail!),
        `CTA/embudo en ${svc}: ${detail!.slice(-180)}`
      );
      assert.ok(
        !/cu[aá]l nivel prefieres/i.test(detail!),
        `sin forzar elección en ${svc}`
      );
      // V9.27: no volcar 4 precios Solo+Basico+Trad+Premium.
      if (/Yucateca|Taquiza|sushi/i.test(svc)) {
        assert.ok(
          /solo\s+alimentos/i.test(detail!) && /servicio\s+completo/i.test(detail!),
          `solo vs completo ${svc}: ${detail!.slice(0, 400)}`
        );
        assert.ok(
          !(/1\.\s*\*?Solo Alimentos[\s\S]*2\.\s*\*?Basico[\s\S]*3\.\s*\*?Tradicional[\s\S]*4\.\s*\*?Premium/i.test(
            detail!
          )),
          `no dump 4 niveles ${svc}`
        );
      }
    }

    // Menús progresivos: misma CTA en todas las familias (mobiliario V8.92 pregunta pieza primero).
    for (const fam of [
      "banquete",
      "coffee_break",
      "barra_sushi",
      "barra_cafe",
      "barra_bebidas",
      "barra_alimentos",
      "taquiza",
      "parrillada",
      "cupcakes_betun",
      "mesa_dulces",
      "gastronomia",
      "mobiliario",
    ] as const) {
      const menu = buildProgressiveOptionsMenu(fam);
      if (fam === "mobiliario") {
        assert.ok(
          /qu[eé] es lo que buscas|dime qu[eé] pieza|Mesas|Sillas/i.test(menu),
          `menú mobiliario pregunta pieza: ${menu.slice(-160)}`
        );
      } else if (fam === "taquiza" || fam === "barra_sushi") {
        assert.ok(
          /solo\s+alimentos|servicio\s+completo|cu[aá]l te late/i.test(menu),
          `menú ${fam} solo vs completo: ${menu.slice(-160)}`
        );
      } else {
        assert.ok(
          menu.includes(SERVICE_NIVEL_DETAIL_CTA) ||
            /solo\s+alimentos|servicio\s+completo|cu[aá]l te late/i.test(menu),
          `menú ${fam} debe usar CTA global o solo vs completo: ${menu.slice(-120)}`
        );
      }
    }

    // V9.28: hints de estación concreta → mismo embudo en menú progresivo.
    for (const [fam, hint] of [
      ["barra_alimentos", "barra de pastas"],
      ["barra_alimentos", "barra de pizzas"],
      ["barra_alimentos", "barra de crepas"],
      ["barra_alimentos", "barra yucateca"],
      ["parrillada", "parrillada argentina"],
    ] as const) {
      const menu = buildProgressiveOptionsMenu(fam, hint);
      assert.ok(
        /solo\s+alimentos/i.test(menu) && /servicio\s+completo/i.test(menu),
        `hint ${hint}: ${menu.slice(0, 200)}`
      );
    }

    for (const msg of [
      "quiero barra de pastas",
      "barra de pizzas",
      "barra yucateca",
      "parrillada argentina",
    ]) {
      const offer = shouldOfferOptionsBeforeDetail({
        currentMessage: msg,
        history: [],
        serviceHint: msg,
      });
      assert.ok(offer, `offer ${msg}`);
      assert.ok(
        /solo\s+alimentos/i.test(offer!.menu) && /servicio\s+completo/i.test(offer!.menu),
        `progressive ${msg}: ${offer!.menu.slice(0, 200)}`
      );
    }

    const yuca = buildCatalogServiceDetailAnswer("Barra Yucateca");
    assert.ok(
      yuca && /solo\s+alimentos/i.test(yuca) && /servicio\s+completo/i.test(yuca),
      yuca?.slice(0, 400)
    );
    assert.ok(
      /bodasesor\.com\/catalogos\/barra-yucateca/i.test(yuca!),
      yuca!.slice(0, 500)
    );

    // Tipo CRM contaminado con "taquiza" no debe decir "para un taquiza".
    const reply = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Francisco Nogueras",
        tipo_evento: "taquiza",
        requerimientos_evento: "Barra Yucateca",
        num_invitados: 230,
        direccion_evento: "Querétaro",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: "Si me puede cotizar la taquiza de guisados también lo apreciaría",
      history: [
        {
          role: "assistant",
          content:
            "Perfecto. Te detallo *Barra Yucateca*.\n\nPara *Barra Yucateca* manejamos estos niveles:\n1. *Solo Alimentos* — $330\n\n¿Quieres que te dé detalles de alguno?\n\nCatálogo: https://bodasesor.com/catalogos/barra-yucateca",
        },
      ],
    });
    assert.ok(/Taquiza|taquiza/i.test(reply), reply.slice(0, 400));
    assert.ok(!/para un taquiza/i.test(reply), reply.slice(0, 400));
    assert.ok(!/Perfecto\.\s*Perfecto\./i.test(reply), reply.slice(0, 200));
    assert.ok(!/De acuerdo\.\s*Perfecto\./i.test(reply), reply.slice(0, 200));
    // Menú de taquiza o detalle — no re-preguntar menú de Barra Yucateca.
    assert.ok(!/Barra Yucateca/i.test(reply), `no reabrir barra: ${reply.slice(0, 400)}`);
    assert.ok(
      /quieres que te d[eé] detalles|info detallada|Te detallo \*Taquiza|manejamos varios niveles/i.test(
        reply
      ),
      reply.slice(0, 500)
    );

    // Tras CTA, elegir "Tradicional" sigue contando como selección de nivel.
    assert.ok(
      isCatalogLevelSelection(
        "Tradicional",
        "Para *Taquiza* manejamos estos niveles:\n1. *Basico*\n\n¿Quieres que te dé detalles de alguno?"
      )
    );
  });

  await test("105. A14982 — Yucateca+Taquiza: niveles Sheet (no hub genérico) + embudo", () => {
    assert.ok(
      clientAsksInclusion(
        "Por que no me ofreces lo paquetes que tienes y me puedo dar una idea mas clara"
      )
    );

    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye"',
      '"Barra Yucateca","Solo Alimentos","$330.00","$9,900.00","TRUE","https://bodasesor.com/catalogos/barra-yucateca","guisos"',
      '"Barra Yucateca","Basico","$750.00","$22,500.00","TRUE","https://bodasesor.com/catalogos/barra-yucateca","basico"',
      '"Barra Yucateca","Tradicional","$800.00","$24,000.00","TRUE","https://bodasesor.com/catalogos/barra-yucateca","tradicional"',
      '"Barra Yucateca","Premium","$850.00","$25,500.00","TRUE","https://bodasesor.com/catalogos/barra-yucateca","premium"',
      '"Taquiza","Solo Alimentos","$300.00","$9,000.00","TRUE","https://bodasesor.com/catalogos/taquiza","tacos"',
      '"Taquiza","Basico","$750.00","$22,500.00","TRUE","https://bodasesor.com/catalogos/taquiza","basico"',
      '"Taquiza","Tradicional","$800.00","$24,000.00","TRUE","https://bodasesor.com/catalogos/taquiza","tradicional"',
      '"Taquiza","Premium","$850.00","$25,500.00","TRUE","https://bodasesor.com/catalogos/taquiza","premium"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    const levels = buildMultiServiceSheetLevelsReply(
      ["Barra Yucateca", "Taquiza"],
      "Si ví una barra yucateca y una taquiza de guisados"
    );
    assert.ok(levels, "debe haber dump de niveles");
    assert.ok(/Barra Yucateca/i.test(levels!), levels!.slice(0, 300));
    assert.ok(/Taquiza/i.test(levels!), levels!.slice(0, 300));
    assert.ok(/\$330|\$300|\$750|solo\s+alimentos|servicio\s+completo/i.test(levels!), levels!.slice(0, 500));
    assert.ok(
      /quieres que te d[eé] detalles de alguno|cu[aá]l te late/i.test(levels!),
      levels!.slice(-200)
    );
    assert.ok(
      !/quieres que te mande el cat[aá]logo con m[aá]s detalle/i.test(levels!),
      "sin loop de catálogo genérico"
    );

    const pkgReply = buildMultiServicePackageReply(
      ["Barra Yucateca", "Taquiza"],
      "Si ví una barra yucateca y una taquiza"
    );
    assert.ok(/\$330|\$300|solo\s+alimentos|desde/i.test(pkgReply), pkgReply.slice(0, 400));
    assert.ok(!/Te dejo el catálogo general/i.test(pkgReply), pkgReply.slice(0, 300));

    // Turno: nombra ambos → niveles + pide correo (dato faltante).
    const reply = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Francisco Nogueras",
        tipo_evento: "evento",
        requerimientos_evento: "Barra Yucateca",
        num_invitados: 230,
        direccion_evento: "Querétaro",
        fecha_horario: "finales de septiembre",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
        "Lugar/dirección del evento",
        "Fecha y horario",
      ]),
      readyForClosing: false,
      currentMessage: "Si ví una barra yucateca y una taquiza de guisados",
      history: [
        {
          role: "assistant",
          content: "hola, ¿te llamó la atención algún paquete?",
        },
      ],
    });
    assert.ok(/Yucateca/i.test(reply) && /Taquiza/i.test(reply), reply.slice(0, 500));
    assert.ok(/\$\s*\d/i.test(reply), reply.slice(0, 500));
    assert.ok(
      !/quieres que te mande el cat[aá]logo con m[aá]s detalle/i.test(reply),
      reply.slice(0, 400)
    );
    // V9.27: primero elige solo vs completo; correo puede ir después.
    assert.ok(
      /correo|e-?mail|cu[aá]l te late|detalles de alguno/i.test(reply),
      `debe pedir modo/nivel o correo: ${reply.slice(-300)}`
    );

    // "ofreces los paquetes" con ambos en CRM → mismo dump + embudo.
    const pkgs = runGuards({
      aiResponse:
        "Claro, aquí tienes un resumen de algunos paquetes: - Taquiza: Desde $300…",
      extracted: emptyExtracted({
        nombre: "Francisco",
        tipo_evento: "evento",
        requerimientos_evento: "Barra Yucateca, Taquiza",
        num_invitados: 230,
        direccion_evento: "Querétaro",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage:
        "Por que no me ofreces lo paquetes que tienes y me puedo dar una idea mas clara",
      history: [
        {
          role: "assistant",
          content: "¿Quieres que te mande el catálogo con más detalle?",
        },
      ],
    });
    assert.ok(/Yucateca/i.test(pkgs) && /Taquiza/i.test(pkgs), pkgs.slice(0, 500));
    assert.ok(/\$330|\$750|Solo Alimentos|Basico|servicio\s+completo|desde/i.test(pkgs), pkgs.slice(0, 600));
    assert.ok(!/resumen de algunos paquetes/i.test(pkgs), pkgs.slice(0, 300));
    assert.ok(
      /correo|e-?mail|fecha|cu[aá]ndo|d[ií]a|hora|definiendo|ciudad|ubicaci|sal[oó]n|cu[aá]l te late|detalles de alguno/i.test(
        pkgs
      ),
      `tras paquetes, embudo: ${pkgs.slice(-350)}`
    );
  });

  await test("106. A14982 — banquete mexicano ≠ Formal (subtipo Sheet correcto)", () => {
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye"',
      '"Banquete Formal 3 tiempos","Basico","$500.00","$15,000.00","TRUE","https://bodasesor.com/catalogos/banquete-formal","Entrada formal"',
      '"Banquete Formal 4 tiempos","Basico","$550.00","$16,500.00","TRUE","https://bodasesor.com/catalogos/banquete-formal","4 tiempos formal"',
      '"Banquete Mexicano 3 tiempos","Basico","$580.00","$17,400.00","TRUE","https://bodasesor.com/catalogos/banquete-mexicano","3 tiempos mx"',
      '"Banquete Mexicano 4 tiempos","Basico","$600.00","$18,000.00","TRUE","https://bodasesor.com/catalogos/banquete-mexicano","4 tiempos mexicanos"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    const resolved = resolveCatalogQuery("banquete mexicano");
    assert.ok(resolved, "debe resolver banquete mexicano");
    assert.ok(
      resolved!.rows.every((r) => /mexicano/i.test(r.servicio)),
      `solo filas mexicanas: ${resolved!.rows.map((r) => r.servicio).join(", ")}`
    );
    assert.ok(
      !resolved!.rows.some((r) => /formal/i.test(r.servicio)),
      "sin Formal mezclado"
    );
    assert.ok(
      /mexicano/i.test(resolved!.serviceName ?? ""),
      `serviceName mexicano: ${resolved!.serviceName}`
    );

    const detail = buildCatalogServiceDetailAnswer("banquete mexicano");
    assert.ok(detail, "debe haber detalle");
    assert.ok(/Mexicano/i.test(detail!), detail!.slice(0, 400));
    assert.ok(!/Formal/i.test(detail!), `no Formal: ${detail!.slice(0, 500)}`);
    assert.ok(
      /banquete-mexicano|Mexicano/i.test(detail!),
      detail!.slice(0, 400)
    );

    const reply = runGuards({
      aiResponse:
        "Claro, te paso el Banquete Formal 3 tiempos que es muy pedido…",
      extracted: emptyExtracted({
        nombre: "Francisco",
        tipo_evento: "evento",
        requerimientos_evento: "banquete",
        num_invitados: 230,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "Me interesa el banquete mexicano",
      history: [
        {
          role: "assistant",
          content:
            "Claro. En *banquete* manejamos varias opciones:\n• *Formal* (3 o 4 tiempos)\n• *Mexicano* (3 o 4 tiempos)\n\n¿Quieres que te dé detalles de alguno?",
        },
      ],
    });
    assert.ok(/Mexicano/i.test(reply), reply.slice(0, 500));
    assert.ok(!/Formal/i.test(reply), `guards sin Formal: ${reply.slice(0, 600)}`);
    assert.ok(
      /banquete-mexicano|\$580|\$600|3 tiempos|4 tiempos/i.test(reply),
      reply.slice(0, 600)
    );
  });

  await test("107. A14985 Lilian — golf stand: bebidas+banderillas+periqueras → catálogos concretos", () => {
    const brief = [
      "Evento: Torneo de Golf (Stand en campo)",
      "Lugar: Club de Golf Los Encinos",
      "Fecha: 20 de agosto",
      "Horario: 07:00 a 15:00 hrs",
      "Asistentes: 80 personas aproximadamente",
      "Bebidas y Alimentos",
      "Cerveza",
      "Whisky",
      "Tercera opción de bebida",
      "Snack: Banderillas (u otra opción similar)",
      "Mobiliario y Montaje",
      "Mobiliario: Periqueras (mesas altas con bancos)",
    ].join("\n");

    assert.equal(parseTipoEventoFromText(brief), "evento corporativo");
    assert.equal(parseTipoEventoFromText("Es un torneo de Golf"), "evento corporativo");

    const services = parseServicesFromText(brief);
    assert.ok(
      services.some((s) => /barra\s+de\s+bebidas/i.test(s)),
      `debe anotar barra de bebidas: ${services.join(", ")}`
    );
    assert.ok(
      services.some((s) => /puestos?\s+de\s+comida/i.test(s)),
      `debe anotar puestos/antojitos: ${services.join(", ")}`
    );
    assert.ok(
      services.some((s) => /mobiliario/i.test(s)),
      `debe anotar mobiliario: ${services.join(", ")}`
    );
    assert.ok(
      !services.some((s) => /^Snack$/i.test(s)),
      `Snack corporativo no debe reemplazar antojitos: ${services.join(", ")}`
    );

    const mapped = buildMappedCatalogOfferBlock(services, brief);
    assert.ok(/barra-de-bebidas/i.test(mapped), mapped);
    assert.ok(/puestos-de-comida/i.test(mapped), mapped);
    assert.ok(/salas-y-periqueras/i.test(mapped), mapped);
    assert.ok(!/mande el catálogo con más detalle/i.test(mapped), mapped);

    const pkg = buildMultiServicePackageReply(services, brief);
    assert.ok(/Barra de bebidas|Puestos/i.test(pkg), pkg.slice(0, 400));
    assert.ok(/barra-de-bebidas/i.test(pkg) && /puestos-de-comida/i.test(pkg), pkg);
    assert.ok(/salas-y-periqueras/i.test(pkg), pkg);
    assert.ok(/detalles de alguno/i.test(pkg), pkg.slice(-200));

    const reply = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Lilian",
        correo: "lilian@nodum.com.mx",
        tipo_evento: "evento corporativo",
        num_invitados: 80,
        direccion_evento: "Club de Golf Los Encinos, Estado de México",
        fecha_horario: "20 de agosto, 07:00 a 15:00 hrs",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Número de invitados",
        "Lugar/dirección del evento",
        "Fecha y horario",
      ]),
      readyForClosing: false,
      currentMessage: brief,
      history: [
        {
          role: "assistant",
          content: "Gracias por tu correo, Lilian. ¿Qué tipo de evento estás planeando?",
        },
      ],
    });
    assert.ok(
      /barra-de-bebidas|puestos-de-comida|salas-y-periqueras/i.test(reply),
      `guards con catálogos concretos: ${reply.slice(0, 700)}`
    );
    assert.ok(
      /Barra de bebidas|Puestos|Periqueras|Mobiliario/i.test(reply),
      reply.slice(0, 500)
    );
    assert.ok(
      !/Anoto Snack y Mobiliario/i.test(reply),
      `no solo Snack+Mobiliario: ${reply.slice(0, 400)}`
    );
  });

  await test("108. V8.79 — catálogos mapeados en TODAS las ramas (no solo RFQ)", () => {
    const golfServices = [
      "Barra de bebidas",
      "Puestos de Comida",
      "Mobiliario",
    ];
    const golfText =
      "Cerveza Whisky Snack Banderillas Periqueras torneo de golf 80 personas";

    // Hub sin SKUs sigue existiendo.
    assert.ok(
      buildGenericCatalogHubBlock().includes(CATALOG_OFFER_QUESTION),
      "hub genérico intacto"
    );

    // buildPackageCatalogOfferBlock CON servicios → mapeados (misma API en todas las ramas).
    const viaPackage = buildPackageCatalogOfferBlock(golfServices, golfText);
    assert.ok(/barra-de-bebidas/i.test(viaPackage), viaPackage);
    assert.ok(/puestos-de-comida/i.test(viaPackage), viaPackage);
    assert.ok(/salas-y-periqueras/i.test(viaPackage), viaPackage);
    assert.ok(!/^Te dejo el catálogo general/i.test(viaPackage), viaPackage);

    // Cierre multi-paquete.
    const closing = buildStandardClosingMessage(
      "Barra de bebidas, Puestos de Comida, Mobiliario",
      "Lilian"
    );
    assert.ok(
      /barra-de-bebidas|puestos-de-comida|salas-y-periqueras/i.test(closing),
      `cierre mapeado: ${closing.slice(0, 600)}`
    );

    // Primer turno con brief multi-servicio.
    const first = buildFirstInteractionMessage(
      {
        extracted: emptyExtracted({
          tipo_evento: "evento corporativo",
          num_invitados: 80,
          requerimientos_evento: golfServices.join(", "),
        }),
        filledSet: new Set([
          "Tipo de evento",
          "Número de invitados",
          "Requerimientos o servicios",
        ]),
        history: [],
        currentMessage: `Evento: Torneo de Golf\n${golfText}`,
        entityId: "t108",
      },
      true
    );
    assert.ok(
      /barra-de-bebidas|puestos-de-comida|salas-y-periqueras/i.test(first),
      `primer turno mapeado: ${first.slice(0, 700)}`
    );

    // Releer brief.
    assert.ok(clientAsksToRereadBrief("Favor de leer muy bien las especificaciones"));
    const reread = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Lilian",
        correo: "lilian@nodum.com.mx",
        tipo_evento: "evento corporativo",
        requerimientos_evento: golfServices.join(", "),
        num_invitados: 80,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "Favor de leer muy bien las especificaciones",
      history: [
        { role: "user", content: `Torneo de Golf. ${golfText}` },
        {
          role: "assistant",
          content: "Perfecto, ya anoté tus datos. ¿Cuál es tu presupuesto?",
        },
      ],
    });
    const collected = collectServicesForCatalogOffer({
      extracted: { requerimientos_evento: golfServices.join(", ") },
      currentMessage: golfText,
    });
    assert.ok(collected.some((s) => /barra\s+de\s+bebidas/i.test(s)), collected.join(", "));
    assert.ok(/reviso|anoto|solicitud/i.test(reread), reread.slice(0, 400));
    assert.ok(
      /barra-de-bebidas|puestos-de-comida|salas-y-periqueras/i.test(reread),
      `releer mapeado: ${reread.slice(0, 700)}`
    );
  });

  await test("109. A14987 Natalia — picnic/periqueras/bancos (no 50 sillas ni color=zona)", () => {
    assert.equal(
      parseZonaFromText("50 mesas tipo picnic en color blanco"),
      null,
      "color blanco ≠ ubicación"
    );
    assert.equal(parseZonaFromText("¿Tienen en color blanco?"), null);

    const items = parseMobiliarioRentItems(
      "50 mesas tipo picnic y 50 periqueras con 200 bancos, todo en color blanco"
    );
    assert.deepEqual(
      items.map((i) => `${i.qty} ${i.label}`),
      ["50 mesas tipo picnic", "50 periqueras", "200 bancos"]
    );

    const detail = buildMobiliarioRentDetailReply(
      "Sí por favor, me gustaría cotizar 50 mesas tipo picnic ¿Tienen en color blanco?\n\nDe igual forma me gustaría cotizar 50 periqueras y 200 bancos de color blanco"
    );
    assert.ok(detail, "debe haber detalle mobiliario");
    assert.ok(/picnic/i.test(detail!), detail!);
    assert.ok(/periqueras/i.test(detail!), detail!);
    assert.ok(/200 bancos/i.test(detail!), detail!);
    assert.ok(/blanco/i.test(detail!), detail!);
    assert.ok(!/50 sillas/i.test(detail!), detail!);

    const brief = [
      "Sería sin montaje, solo para entrega el día 10 de diciembre (2026) y recogerlo el día 12 de diciembre después de las 5 pm.",
      "Serían 50 mesas tipo picnic y 50 periqueras con 200 bancos, todo en color blanco.",
      "La ubicación sería en: Planta Volkswagen Puebla, Avenida San Lorenzo Almecatla 16, 72710 Cuautlancingo, Puebla",
      "El correo sería mcadena@luzebi.com",
    ].join("\n\n");
    assert.ok(isRichQuoteBrief(brief));
    assert.ok(isMobiliarioRentalPedido(brief));

    const reply = runGuards({
      aiResponse: "Perfecto, Natalia. Ya lo tengo anotado.",
      extracted: emptyExtracted({
        nombre: "Natalia",
        correo: "mcadena@luzebi.com",
        requerimientos_evento: "Mobiliario",
        direccion_evento: "color blanco",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: brief,
      history: [
        {
          role: "assistant",
          content: "Para mandarte la info, ¿a qué correo te lo envío?",
        },
      ],
    });
    assert.ok(!/Ya lo tengo anotado/i.test(reply), reply.slice(0, 300));
    assert.ok(/picnic/i.test(reply) && /periqueras/i.test(reply), reply.slice(0, 500));
    assert.ok(/bancos/i.test(reply), reply.slice(0, 500));
    assert.ok(!/50 sillas/i.test(reply), reply.slice(0, 500));
    assert.ok(
      /salas-y-periqueras|catalogos/i.test(reply),
      `catálogo: ${reply.slice(0, 600)}`
    );
    assert.ok(
      /tipo de evento|festejan|evento|fecha|presupuesto|invitados/i.test(reply),
      `embudo: ${reply.slice(-350)}`
    );

    const mid = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Natalia",
        requerimientos_evento: "Mobiliario",
        direccion_evento: "color blanco",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage:
        "Sí por favor, me gustaría cotizar 50 mesas tipo picnic ¿Tienen en color blanco?\n\nDe igual forma me gustaría cotizar 50 periqueras y 200 bancos de color blanco, si tienes, por favor",
      history: [
        {
          role: "assistant",
          content:
            "Claro. En *mobiliario* manejamos varias opciones.\n\n¿Quieres que te dé detalles de alguno?",
        },
      ],
    });
    assert.ok(/picnic/i.test(mid) && !/50 sillas/i.test(mid), mid.slice(0, 500));
  });

  await test("110. A14988 Ernesto — Bailarinas en concierto (no re-CTA revisar primero)", () => {
    assert.equal(parseTipoEventoFromText("Concierto"), "concierto");
    assert.ok(clientMentionsEntertainment("Bailarinas"));
    assert.ok(isServiceRelatedMessage("Bailarinas"));
    assert.ok(parseServicesFromText("Bailarinas").some((s) => /bailarinas/i.test(s)));
    assert.ok(clientConfirmsOfferReview("Revisar"));

    const offerCta =
      "Perfecto, Ernesto. Para tu concierto, manejamos una variedad de servicios que pueden ser muy útiles:\n\n• Alimentos\n• Barras de bebidas\n• DJ e iluminación\n\n¿Qué te gustaría revisar primero o armar un paquete?";

    const bailarinas = runGuards({
      aiResponse:
        "Perfecto, Ernesto. ¿Qué te gustaría revisar primero o prefieres armar un paquete completo?",
      extracted: emptyExtracted({
        nombre: "Ernesto Juarez",
        correo: "ernesto@elkomander.com.mx",
        tipo_evento: "concierto",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
      ]),
      readyForClosing: false,
      currentMessage: "Bailarinas",
      history: [
        { role: "assistant", content: offerCta },
        { role: "user", content: "Concierto" },
      ],
    });
    assert.ok(/bailarinas/i.test(bailarinas), bailarinas.slice(0, 400));
    assert.ok(
      /entretenimiento|show|animaci/i.test(bailarinas),
      `debe orientar entretenimiento: ${bailarinas.slice(0, 400)}`
    );
    assert.ok(
      !/qu[eé]\s+te\s+gustar[ií]a\s+revisar\s+primero/i.test(bailarinas),
      `no re-CTA: ${bailarinas.slice(0, 400)}`
    );
    assert.ok(
      /ubicaci[oó]n|ciudad|fecha|invitados|presupuesto|donde|cu[aá]ndo/i.test(bailarinas),
      `embudo: ${bailarinas.slice(-350)}`
    );

    const revisar = runGuards({
      aiResponse: "¿Qué te gustaría revisar primero o prefieres armar un paquete completo?",
      extracted: emptyExtracted({
        nombre: "Ernesto Juarez",
        correo: "ernesto@elkomander.com.mx",
        tipo_evento: "concierto",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
      ]),
      readyForClosing: false,
      currentMessage: "Revisar",
      history: [
        { role: "assistant", content: offerCta },
        { role: "user", content: "Bailarinas" },
        {
          role: "assistant",
          content:
            "Perfecto, Ernesto. ¿Qué te gustaría revisar primero o prefieres armar un paquete completo?",
        },
      ],
    });
    assert.ok(/bailarinas/i.test(revisar), revisar.slice(0, 400));
    assert.ok(
      !/qu[eé]\s+te\s+gustar[ií]a\s+revisar\s+primero/i.test(revisar),
      `Revisar no re-CTA: ${revisar.slice(0, 400)}`
    );
  });

  await test("111. A14994 Sandra — catálogo Sí/Sí por favor + 80 a 100 ≠ presupuesto", () => {
    assert.equal(parsePresupuestoFromText("80 a 100"), null, "rango invitados ≠ presupuesto");
    assert.equal(parseInvitadosFromText("80 a 100"), "90");
    assert.equal(parseInvitadosFromText("de 80 a 100"), "90");

    const offerDetalles = "¿Te gustaría que te envíe el catálogo con más detalles?";
    const offerDetallado = "¿Te gustaría que te envíe un catálogo más detallado?";
    assert.ok(clientAffirmsCatalogOffer("Si", offerDetalles));
    assert.ok(clientAffirmsCatalogOffer("Si por favor", offerDetallado));
    assert.ok(clientAffirmsCatalogOffer("sí, por favor", offerDetalles));

    const filled = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Número de invitados",
    ]);
    const extracted = emptyExtracted({
      nombre: "Sandra",
      correo: "sanduka@hotmail.com",
      tipo_evento: "boda",
      requerimientos_evento: "Mobiliario, Carpas",
      direccion_evento: "Jiutepec",
      fecha_horario: "5 Diciembre",
      num_invitados: 90,
    });

    const si = runGuards({
      aiResponse: "¿Te gustaría que te envíe un catálogo más detallado?",
      extracted: { ...extracted },
      filledSet: new Set(filled),
      readyForClosing: true,
      currentMessage: "Si",
      history: [{ role: "assistant", content: offerDetalles }],
    });
    assert.ok(/bodasesor\.com\/catalogos/i.test(si), `Sí debe enviar URL: ${si.slice(0, 400)}`);
    assert.ok(
      !/te\s+gustar[ií]a\s+que\s+te\s+env[ií]e.*cat[aá]logo/i.test(si),
      `Sí no re-pregunta: ${si.slice(0, 400)}`
    );

    const porfa = runGuards({
      aiResponse: "¿Te gustaría que te envíe un catálogo más detallado?",
      extracted: { ...extracted },
      filledSet: new Set(filled),
      readyForClosing: true,
      currentMessage: "Si por favor",
      history: [
        { role: "assistant", content: offerDetalles },
        { role: "user", content: "Si" },
        { role: "assistant", content: offerDetallado },
      ],
    });
    assert.ok(
      /bodasesor\.com\/catalogos/i.test(porfa),
      `Sí por favor debe enviar URL: ${porfa.slice(0, 400)}`
    );
    assert.ok(
      !/te\s+gustar[ií]a\s+que\s+te\s+env[ií]e.*cat[aá]logo/i.test(porfa),
      `Sí por favor no re-pregunta: ${porfa.slice(0, 400)}`
    );

    const carpas = runGuards({
      aiResponse: "¿En qué ciudad y colonia sería tu evento?",
      extracted: emptyExtracted({
        nombre: "Sandra",
        correo: "sanduka@hotmail.com",
        tipo_evento: "boda",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
      ]),
      readyForClosing: false,
      currentMessage: "Carpas o mobiliario",
      history: [
        {
          role: "assistant",
          content:
            "Perfecto, Sandra. Te propongo:\n• Banquete Formal (3 o 4 tiempos)...\n¿Qué te gustaría revisar primero?",
        },
      ],
    });
    assert.ok(/carpas/i.test(carpas) && /mobiliario/i.test(carpas), carpas.slice(0, 500));
    assert.ok(
      /bodasesor\.com\/catalogos|medidas|área|espacio/i.test(carpas),
      `carpas+mobiliario ack/catálogo: ${carpas.slice(0, 500)}`
    );
    assert.ok(
      !/^¿En qué ciudad/i.test(carpas.trim()),
      `no saltar solo a zona: ${carpas.slice(0, 300)}`
    );
  });

  await test("112. A14994 — correcciones en TODAS las ramas (CRM, affirm mapeado, anti-repeat)", () => {
    assert.ok(looksLikeGuestCountRange("80 a 100"));
    assert.ok(looksLikeGuestCountRange("80 - 100"));
    assert.equal(looksLikeGuestCountRange("de 3 a 12"), false);
    assert.ok(assistantOfferedCatalogDetail(CATALOG_OFFER_QUESTION));
    assert.ok(
      assistantOfferedCatalogDetail("¿Te gustaría que te envíe un catálogo más detallado?")
    );

    const cleared = applyCrmWriteInvariants(
      emptyExtracted({
        nombre: "Sandra",
        num_invitados: 90,
        presupuesto: "80 - 100 MXN" as unknown as number,
      }),
      ["80 a 100", "Jiutepec"]
    );
    assert.equal(cleared.extracted.presupuesto, null);
    assert.ok(cleared.applied.includes("presupuesto-guest-range-cleared"));

    const clearedNum = applyCrmWriteInvariants(
      emptyExtracted({
        nombre: "Sandra",
        num_invitados: 90,
        presupuesto: 80100,
      }),
      ["80 a 100"]
    );
    assert.equal(clearedNum.extracted.presupuesto, null);

    // Affirm con servicios capturados → links mapeados (no solo re-pregunta).
    const mappedAffirm = runGuards({
      aiResponse: "¿Te gustaría que te envíe un catálogo más detallado?",
      extracted: emptyExtracted({
        nombre: "Sandra",
        correo: "sanduka@hotmail.com",
        tipo_evento: "boda",
        requerimientos_evento: "Mobiliario, Carpas",
        direccion_evento: "Jiutepec",
        fecha_horario: "5 Diciembre",
        num_invitados: 90,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Número de invitados",
      ]),
      readyForClosing: true,
      currentMessage: "Si por favor",
      history: [
        {
          role: "assistant",
          content:
            "Perfecto, ya tengo todo.\n\n¿Quieres que te mande el catálogo con más detalle?",
        },
      ],
    });
    assert.ok(
      /bodasesor\.com\/catalogos/i.test(mappedAffirm),
      `affirm debe mandar URL: ${mappedAffirm.slice(0, 500)}`
    );
    assert.ok(
      !/te\s+gustar[ií]a\s+que\s+te\s+env[ií]e.*cat[aá]logo/i.test(mappedAffirm),
      `no re-pregunta: ${mappedAffirm.slice(0, 400)}`
    );

    // Anti-repeat no colapsa el envío tras "Sí".
    const afterAnti = applyLucyGlobalAntiRepetition({
      mensaje: mappedAffirm,
      history: [
        {
          role: "assistant",
          content: "¿Quieres que te mande el catálogo con más detalle?",
        },
      ],
      extracted: emptyExtracted({
        nombre: "Sandra",
        requerimientos_evento: "Mobiliario, Carpas",
      }),
      filledSet: new Set(["Requerimientos o servicios"]),
      currentMessage: "Si por favor",
      clientName: "Sandra",
    });
    assert.ok(
      /bodasesor\.com\/catalogos/i.test(afterAnti.mensaje),
      `anti-repeat conserva URL: ${afterAnti.mensaje.slice(0, 400)}`
    );
  });

  await test("113. A14995 Hortensia — dónde están ≠ zona + paquete multi-servicio completo", () => {
    assert.ok(clientAsksLocation("En donde estan ubicados?"));
    assert.ok(clientAsksLocation("Es muy importante. En donde estan?"));
    assert.equal(parseZonaFromText("En donde estan ubicados?"), null);
    assert.equal(parseZonaFromText("donde estan"), null);
    assert.ok(looksLikeCompanyLocationQuestionFragment("donde estan"));

    const clean = sanitizeExtractedFromExternal(
      emptyExtracted({
        nombre: "Hortensia",
        direccion_evento: "donde estan",
      })
    );
    assert.equal(clean.direccion_evento, null);

    const inv = applyCrmWriteInvariants(
      emptyExtracted({
        nombre: "Hortensia",
        direccion_evento: "donde estan",
      }),
      ["En donde estan ubicados?"]
    );
    assert.equal(inv.extracted.direccion_evento, null);

    const pkgMsg = [
      "Banquete mexicano 3 y 4 tiempos",
      "Barra de bebidas",
      "Mesa de dulces y botanas",
      "Mobiliario mesas vestidas y sillas",
    ].join("\n");
    const services = parseServicesFromText(pkgMsg);
    assert.ok(services.length >= 3, `services=${services.join(",")}`);

    const reply = runGuards({
      aiResponse: "Perfecto, Hortensia. Anoto Banquete Mexicano 4 tiempos.",
      extracted: emptyExtracted({
        nombre: "Hortensia",
        correo: "hortehgz@hotmail.com",
        tipo_evento: "graduación",
        direccion_evento: "donde estan",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: pkgMsg,
      history: [
        {
          role: "assistant",
          content:
            "Para tu graduación, manejamos varias opciones:\n• Banquete Formal\n• Barra de bebidas\n¿Qué te gustaría revisar primero?",
        },
      ],
    });
    assert.ok(/banquete/i.test(reply), reply.slice(0, 400));
    assert.ok(/barra|bebidas/i.test(reply), reply.slice(0, 500));
    assert.ok(/dulces|mobiliario/i.test(reply), reply.slice(0, 500));
    assert.ok(
      !/Anoto \*Banquete Mexicano 4 tiempos\*/i.test(reply),
      `no solo dump tiempos: ${reply.slice(0, 400)}`
    );
    // Misma URL no debe aparecer dos veces.
    const urls = reply.match(/https?:\/\/[^\s]*bodasesor\.com\/catalogos[^\s]*/gi) ?? [];
    const unique = new Set(urls.map((u) => u.replace(/\/+$/, "").toLowerCase()));
    assert.equal(urls.length, unique.size, `URLs duplicadas: ${urls.join(" | ")}`);
    assert.ok(/bodasesor\.com\/catalogos/i.test(reply), reply.slice(0, 500));
  });

  await test("114. V8.85 — ubicación basura + silencio Humano Trabaja no pisa CRM", () => {
    // Discurso / servicio ≠ lugar
    assert.equal(parseZonaFromText("Es muy importante"), null);
    assert.equal(parseZonaFromText("Show en vivo"), null);
    assert.equal(parseZonaFromText("la fiesta es en la noche"), null);
    assert.equal(parseZonaFromText("en realidad no sé"), null);
    assert.equal(parseZonaFromText("50 mesas en color blanco"), null);
    assert.ok(!isUsableDireccionEvento("es muy importante"));
    assert.ok(!isUsableDireccionEvento("vivo"));
    assert.ok(!isUsableDireccionEvento("noche"));
    assert.ok(!isUsableDireccionEvento("importante"));
    assert.ok(looksLikeDiscourseNotPlace("es muy importante"));
    assert.ok(isUsableDireccionEvento("Jiutepec"));
    assert.ok(isUsableDireccionEvento("Polanco, CDMX"));
    assert.equal(parseZonaFromText("El evento es en Jiutepec"), "Jiutepec");
    assert.equal(parseZonaFromText("Va a ser en Polanco con DJ"), "Polanco");

    // No pisar Jiutepec con basura / fragmento débil
    assert.equal(shouldReplaceCrmDireccion("Jiutepec", "donde estan"), false);
    assert.equal(shouldReplaceCrmDireccion("Jiutepec", "es muy importante"), false);
    assert.equal(shouldReplaceCrmDireccion("Jiutepec", "vivo"), false);
    assert.equal(shouldReplaceCrmDireccion(null, "Jiutepec"), true);
    assert.equal(shouldReplaceCrmDireccion("cotización", "Polanco CDMX"), true);
    assert.equal(
      shouldReplaceCrmDireccion("Jiutepec", "Calle Reforma 100, Jiutepec"),
      true
    );

    // Silencio: GPT basura + "en …" no escribe ubicación; CRM bueno se conserva
    const junkExtracted = emptyExtracted({
      nombre: "Hortensia",
      direccion_evento: "es muy importante",
    });
    const noWrite = buildSilentWatchPatchPayload(
      "Es muy importante. En donde estan ubicados?",
      junkExtracted,
      "Hortensia",
      ["- Lugar/dirección del evento: Jiutepec"]
    );
    assert.equal(noWrite, null, "no debe PATCH con basura de ubicación");

    const okZona = buildSilentWatchPatchPayload(
      "El evento será en Tlalnepantla",
      emptyExtracted({ nombre: "Ana" }),
      "Ana",
      []
    );
    assert.ok(okZona, "sí escribe zona clara del mensaje");
    const fields = (okZona!["custom_fields_values"] as Array<{ field_id: number; values: Array<{ value: unknown }> }>) ?? [];
    assert.ok(
      fields.some((f) => String(f.values?.[0]?.value ?? "").toLowerCase().includes("tlalnepantla")),
      JSON.stringify(fields)
    );

    // No sobrescribe CRM bueno con token más corto
    const keep = buildSilentWatchPatchPayload(
      "ok gracias",
      emptyExtracted({ direccion_evento: "Polanco" }),
      "Ana",
      ["- Lugar/dirección del evento: Polanco, CDMX"]
    );
    assert.equal(keep, null);

    // Requerimientos: no meter mensaje crudo; learning filter
    assert.equal(isUsefulLearningPair({ user_message: "ok", suggested_response: "va" }), false);
    assert.equal(
      isUsefulLearningPair({
        user_message: "En donde estan?",
        suggested_response: "Anoto la ubicación: donde estan para tu evento",
      }),
      false
    );
    assert.ok(
      isUsefulLearningPair({
        user_message: "¿Cuánto sale el banquete para 100?",
        suggested_response:
          "Claro, para 100 personas te armo opciones de banquete según el menú que elijas.",
      })
    );

    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const silentSrc = readFileSync(path.join(apiRoot, "src/silentWatchCrm.ts"), "utf8");
    assert.ok(/shouldReplaceCrmDireccion/.test(silentSrc));
    assert.ok(/services\.join\(/.test(silentSrc));
    assert.ok(!/sanitizeCrmNombre\(text\)/.test(silentSrc));
    assert.ok(/parseZonaFromText/.test(silentSrc));
  });

  await test("115. A15000 Itzel — nombre completo, reunión familiar, multi-servicio, asesor", () => {
    // Nombre: nunca degradar apellido
    assert.equal(shouldUpdateName("Itzel Lombera", "Itzel"), false);
    assert.equal(resolveKommoLeadNamePatch("Itzel Lombera", "Itzel"), null);
    assert.equal(pickBetterNombre("Itzel", "Itzel Lombera"), "Itzel Lombera");

    // Tipo: Reunión familiar / celebraciones familiares
    assert.equal(parseTipoEventoFromText("Reunión familiar"), "fiesta");
    assert.equal(parseTipoEventoFromText("celebraciones familiares"), "fiesta");

    // Alimentos + meseros + mobiliario (no solo mobiliario)
    const brief =
      "Quiero ver qué opciones tienen para alimentos , y si tienen meseros , y mobiliario , también saber el costo por persona aprox 40 adultos y 10 niños";
    const services = parseServicesFromText(brief);
    assert.ok(services.some((s) => /alimento|banquete|comida/i.test(s)), services.join(","));
    assert.ok(services.some((s) => /mesero/i.test(s)), services.join(","));
    assert.ok(services.some((s) => /mobiliario/i.test(s)), services.join(","));
    assert.ok(services.length >= 3, services.join(","));

    const multi = runGuards({
      aiResponse: "Anoto mobiliario. ¿En qué ciudad sería tu evento?",
      extracted: emptyExtracted({
        nombre: "Itzel",
        correo: "Itzel.Lombera@live.com",
        tipo_evento: "cumpleaños",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
      ]),
      readyForClosing: false,
      currentMessage: brief,
      history: [
        {
          role: "assistant",
          content: "¿Qué te gustaría revisar primero o prefieres armar un paquete completo?",
        },
      ],
    });
    assert.ok(
      /alimento|banquete|comida|mesero|paquete|opcion/i.test(multi),
      `multi no solo mobiliario: ${multi.slice(0, 500)}`
    );
    assert.ok(
      !/^Anoto \*mobiliario\*/i.test(multi.trim()),
      `no monopolio mobiliario: ${multi.slice(0, 300)}`
    );

    // Pedido de asesor → handoff, no embudo
    assert.ok(clientAsksForHumanAdvisor("Prefiero hablar con un asesor"));
    assert.ok(clientAsksForHumanAdvisor("Y prefiero que algún asesor se comunique conmigo"));
    const handoff = buildHumanAdvisorHandoffAnswer("Itzel");
    assert.ok(/asesor/i.test(handoff));
    assert.ok(/55 4008 0373/.test(handoff));

    const advisorReply = runGuards({
      aiResponse: "Itzel, ¿tienen día u horario ya definido?",
      extracted: emptyExtracted({
        nombre: "Itzel",
        correo: "Itzel.Lombera@live.com",
        tipo_evento: "cumpleaños",
        direccion_evento: "Del Valle sur",
        num_invitados: 50,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Lugar/dirección del evento",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "Prefiero hablar con un asesor",
      history: [
        { role: "assistant", content: "Con gusto. Itzel, ¿tienen día u horario ya definido?" },
      ],
    });
    assert.ok(/asesor|canalizo|equipo/i.test(advisorReply), advisorReply.slice(0, 400));
    assert.ok(!/d[ií]a u horario|fecha/i.test(advisorReply), advisorReply.slice(0, 400));
    assert.ok(!/cat[aá]logo/i.test(advisorReply), advisorReply.slice(0, 400));

    // Requerimientos: generateSummary NO debe usarse como valor CRM
    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const kommoSrc = readFileSync(path.join(apiRoot, "src/routes/kommo.ts"), "utf8");
    assert.ok(!/generateSummary\(conversationText\)/.test(kommoSrc));
    assert.ok(/clientAsksForHumanAdvisor/.test(kommoSrc));
    assert.ok(/pide_asesor/.test(kommoSrc));
  });

  // ─── 116. A15003 Juan: agente, Photo Booth, nombre limpio, no "Sigo aquí" ───
  await test("116. A15003 Juan — agente/Photo Booth/nombre/anti-Sigo aquí", async () => {
    // Handoff: "agente" y frase corta WhatsApp
    assert.ok(clientAsksForHumanAdvisor("Hablar con un agente"));
    assert.ok(clientAsksForHumanAdvisor("Hablar con un asesor"));
    assert.ok(clientAsksForHumanAdvisor("Juan\nHablar con un agente"));
    assert.ok(clientAsksForHumanAdvisor("quiero un agente"));
    assert.ok(clientNeedsEmergencyContact("Hablar con un agente"));

    const handoffAgente = runGuards({
      aiResponse: "Perfecto. ¿Me compartes un correo?",
      extracted: emptyExtracted({ nombre: "Juan", direccion_evento: "cdmx" }),
      filledSet: new Set(["Nombre del cliente", "Lugar/dirección del evento"]),
      readyForClosing: false,
      currentMessage: "Hablar con un agente",
      history: [
        {
          role: "assistant",
          content: "Perfecto. Mucho gusto, Juan. ¿Me compartes un correo para enviarte los detalles?",
        },
      ],
    });
    assert.ok(/asesor|canalizo|equipo/i.test(handoffAgente), handoffAgente.slice(0, 400));
    assert.ok(!/correo/i.test(handoffAgente), handoffAgente.slice(0, 400));
    assert.ok(!/banquete/i.test(handoffAgente), handoffAgente.slice(0, 400));

    // Nombre: no contaminar con handoff
    assert.equal(sanitizeCrmNombre("Juan Hablar Agente"), "Juan");
    assert.equal(sanitizeCrmNombre("Juan\nHablar con un agente"), "Juan");
    assert.ok(isLikelyNotPersonNameMessage("Hablar con un agente"));
    assert.ok(isLikelyNotPersonNameMessage("Photo Booth"));

    // Photo Booth = entretenimiento, no decline vacío
    assert.ok(clientMentionsEntertainment("Photo Booth"));
    assert.ok(clientMentionsEntertainment("ando buscando un photo booth"));
    assert.ok(parseServicesFromText("Photo Booth").includes("Photo Booth"));
    assert.equal(clientDeclinesMoreServices("Solo el servicio de Photo Booth"), false);
    assert.ok(clientDeclinesMoreServices("Ninguno de esos"));
    assert.ok(clientDeclinesMoreServices("No quiero nada más"));

    const photoReply = runGuards({
      aiResponse: "Manejamos Banquete Formal, Barra de bebidas… ¿Qué te gustaría revisar primero?",
      extracted: emptyExtracted({
        nombre: "Juan",
        correo: "juan.andrade@dharma.agency",
        tipo_evento: "evento corporativo",
        direccion_evento: "cdmx",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: "Photo Booth",
      history: [
        {
          role: "assistant",
          content:
            "Para tu evento corporativo: • Banquete Formal • Barra de bebidas. ¿Qué te gustaría revisar primero o prefieres armar un paquete completo?",
        },
      ],
    });
    assert.ok(/photo\s*booth/i.test(photoReply), photoReply.slice(0, 500));
    assert.ok(!/banquete\s+formal/i.test(photoReply), photoReply.slice(0, 500));
    assert.ok(!/Sigo aquí/i.test(photoReply), photoReply.slice(0, 500));

    const soloPhoto = runGuards({
      aiResponse: "Además podemos ofrecerte Banquete Formal…",
      extracted: emptyExtracted({
        nombre: "Juan",
        correo: "juan.andrade@dharma.agency",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Photo Booth",
        direccion_evento: "cdmx",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: "Ninguno de esos",
      history: [
        { role: "user", content: "Photo Booth" },
        {
          role: "assistant",
          content:
            "Aceptamos Photo Booth. Además: • Banquete Formal • Barra de bebidas. ¿Algo más?",
        },
      ],
    });
    assert.ok(/photo\s*booth/i.test(soloPhoto), soloPhoto.slice(0, 500));
    assert.ok(!/banquete\s+formal/i.test(soloPhoto), soloPhoto.slice(0, 500));
    assert.ok(!/Sigo aquí/i.test(soloPhoto), soloPhoto.slice(0, 500));

    // Anti-repeat: no "Sigo aquí" cuando el cliente nombra Photo Booth
    const antiPhoto = applyLucyGlobalAntiRepetition({
      mensaje: "¿Qué tipo de servicios te interesan para tu evento?",
      history: [
        {
          role: "assistant",
          content: "¿Qué servicios necesitas para tu evento corporativo?",
        },
      ],
      currentMessage: "Photo Booth",
      extracted: { nombre: "Juan", tipo_evento: "evento corporativo" },
      filledSet: new Set(["Nombre del cliente", "Tipo de evento"]),
      clientName: "Juan",
    });
    assert.ok(!/Sigo aquí/i.test(antiPhoto.mensaje), antiPhoto.mensaje);
    assert.ok(
      antiPhoto.applied.every((a) => a !== "same-field-reask-ack"),
      String(antiPhoto.applied)
    );

    const antiHandoff = applyLucyGlobalAntiRepetition({
      mensaje: "¿Me compartes un correo para enviarte los detalles?",
      history: [
        {
          role: "assistant",
          content: "Perfecto. ¿Me compartes un correo para la cotización?",
        },
      ],
      currentMessage: "Hablar con un agente",
      extracted: { nombre: "Juan" },
      filledSet: new Set(["Nombre del cliente"]),
      clientName: "Juan",
    });
    assert.ok(!/Sigo aquí/i.test(antiHandoff.mensaje), antiHandoff.mensaje);
  });

  // ─── 117. A15016 Israel — Catedral≠zona, email≠presupuesto, post-cierre ───
  await test("117. A15016 Israel — Catedral, De 6x20, email≠presupuesto, post-cierre", async () => {
    assert.equal(parseCarpaVariantFromText("Catedral"), null);
    assert.equal(parseCarpaVariantFromText("Domo"), "Carpa tipo domo");
    assert.equal(parseCarpaVariantFromText("Carpa negra"), "Carpa negra");
    assert.equal(parseCarpaVariantFromText("Transparente"), "Carpa transparente");
    assert.ok(isLikelyProductNameNotLocation("Catedral"));
    assert.ok(!isUsableDireccionEvento("Catedral"));
    assert.equal(parseZonaFromText("Catedral"), null);
    assert.ok(isDimensionText("De 6 x20"));
    assert.equal(parseSpaceDimensions("De 6 x20"), "6m x 20m");

    assert.equal(
      parsePresupuestoFromText("israel241268@hotmail.com", { askedField: "presupuesto" }),
      null
    );
    assert.equal(
      parsePresupuestoFromText("17 mil aproximadamente", { askedField: "presupuesto" }),
      "$17000"
    );

    const inv = applyCrmWriteInvariants(
      {
        nombre: "Israel Albiter",
        correo: "israel241268@hotmail.com",
        presupuesto: 241268,
        direccion_evento: "Catedral",
        requerimientos_evento: "Carpas (espacio 6m x 20m)",
        tipo_evento: "cumpleaños",
        num_invitados: 200,
      },
      [
        "Carpa transparente",
        "De 6 x20",
        "Catedral",
        "Cumpleaños",
        "17 mil aproximadamente",
        "israel241268@hotmail.com",
      ]
    );
    assert.equal(inv.extracted.direccion_evento, null);
    assert.ok(
      inv.extracted.presupuesto === null || inv.extracted.presupuesto === 17000,
      String(inv.extracted.presupuesto)
    );
    assert.ok(inv.applied.includes("zona-unusable-cleared") || inv.extracted.direccion_evento == null);

    const carpaFirst = runGuards({
      aiResponse: "¿Qué tipo de evento estás organizando?",
      extracted: emptyExtracted({
        nombre: "Israel Albiter",
        correo: "isra_piter@hotmail.com",
      }),
      filledSet: new Set(["Nombre del cliente", "Correo electrónico"]),
      readyForClosing: false,
      currentMessage: "Carpa transparente",
      history: [
        {
          role: "assistant",
          content: "Gracias por tu correo, Israel. ¿Qué tipo de evento estás organizando?",
        },
      ],
    });
    assert.ok(/carpa/i.test(carpaFirst), carpaFirst.slice(0, 400));
    assert.ok(!/Sigo aquí/i.test(carpaFirst));

    const dimsReply = runGuards({
      aiResponse: "¿Qué tipo de evento estás organizando?",
      extracted: emptyExtracted({
        nombre: "Israel Albiter",
        correo: "isra_piter@hotmail.com",
        requerimientos_evento: "Carpas transparentes",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "De 6 x20",
      history: [
        {
          role: "assistant",
          content:
            "Sí, manejamos carpas blancas, negras, transparentes y tipo domo. ¿Qué medidas aproximadas necesitas?",
        },
      ],
    });
    assert.ok(/6\s*m?\s*x\s*20/i.test(dimsReply), dimsReply.slice(0, 500));
    assert.ok(!/medidas aproximadas necesitas/i.test(dimsReply), dimsReply.slice(0, 500));

    const domoReply = runGuards({
      aiResponse: "¿Qué tipo de evento estás organizando?",
      extracted: emptyExtracted({
        nombre: "Israel Albiter",
        correo: "isra_piter@hotmail.com",
        requerimientos_evento: "Carpas transparentes (6m x 20m)",
        direccion_evento: "Catedral",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: "Domo",
      history: [
        { role: "user", content: "Carpa transparente" },
        {
          role: "assistant",
          content: "Sí, carpas blancas, negras, transparentes y tipo domo. ¿Medidas?",
        },
      ],
    });
    assert.ok(/domo|carpa/i.test(domoReply), domoReply.slice(0, 500));
    assert.ok(!/ubicaci[oó]n|lugar del evento|d[oó]nde ser[aá]/i.test(domoReply), domoReply.slice(0, 400));

    const closing = `${CLOSING_SIGNATURE} Voy a compartir esta información con nuestro equipo para que te prepare una cotización personalizada.`;
    assert.ok(detectCierreEnviado([{ role: "assistant", content: closing }]));

    const thanks = runGuards({
      aiResponse: "¿Me puedes compartir tu correo electrónico?",
      extracted: emptyExtracted({
        nombre: "Israel Albiter",
        correo: "isra_piter@hotmail.com",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "Carpas (espacio 6m x 20m)",
        fecha_horario: "1 de agosto 2026",
        num_invitados: 200,
        presupuesto: 17000,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Fecha y horario",
        "Número de invitados",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: true,
      cierreYaEnviado: true,
      currentMessage: "Muchas gracias amigo",
      history: [{ role: "assistant", content: closing }],
      lastStoredResponse: closing,
    });
    assert.ok(/con gusto|equipo/i.test(thanks), thanks.slice(0, 400));
    assert.ok(!/correo/i.test(thanks), thanks.slice(0, 400));

    assert.ok(
      clientAsksPaymentOrQuoteDelivery(
        "Si me manda el presupuesto y donde mandar el 50 % de anticipo"
      )
    );
    const pay = runGuards({
      aiResponse: "Mucho gusto, Israel. ¿A qué correo te lo envío?",
      extracted: emptyExtracted({
        nombre: "Israel Albiter",
        correo: "isra_piter@hotmail.com",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "Carpas (espacio 6m x 20m)",
        presupuesto: 17000,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: true,
      cierreYaEnviado: true,
      currentMessage: "Si me manda el presupuesto y donde mandar el 50 % de anticipo",
      history: [
        { role: "user", content: "isra_piter@hotmail.com" },
        { role: "assistant", content: closing },
      ],
      lastStoredResponse: closing,
    });
    assert.ok(/anticipo|equipo|cotizaci[oó]n/i.test(pay), pay.slice(0, 500));
    assert.ok(!/a qu[eé] correo|Mucho gusto,\s*Israel\.\s*Mucho gusto/i.test(pay), pay.slice(0, 500));

    const deduped = dedupeTransitionsInMessage(
      "Perfecto, Israel. Mucho gusto, Israel. Para mandarte la info, ¿a qué correo te lo envío?"
    );
    assert.equal((deduped.match(/Mucho gusto,\s*Israel/gi) || []).length, 0);
    assert.ok(/Perfecto, Israel/i.test(deduped));

    const handoffPay = buildPostCierrePaymentHandoffReply("Israel");
    assert.ok(/anticipo|50\s*%|equipo/i.test(handoffPay));
  });

  // ─── 118. A15007 Osiris — "A este", ya preguntaste, no re-pitch carpa ───
  await test("118. A15007 Osiris — referencia, queja repetición, carpas sin re-pitch", async () => {
    assert.ok(isReferentialPriorAnswer("A este"));
    assert.ok(isReferentialPriorAnswer("ese mismo"));
    assert.ok(isReferentialPriorAnswer("el mismo"));
    assert.ok(clientComplainsAboutRepeat("Ya me habias preguntado eso"));
    assert.ok(clientComplainsAboutRepeat("Ya me habías preguntado eso"));
    assert.equal(
      recoverCorreoFromUserTexts(["hola", "administracion@celamex.page"], "A este"),
      "administracion@celamex.page"
    );

    const closingPitch =
      "Sí, manejamos carpas para jardín o terraza: blancas, negras, transparentes y tipo domo. ¿Qué medidas aproximadas necesitas?";

    // Re-mencionar carpas con CRM ya lleno → no repetir todo el listado.
    const rePitch = runGuards({
      aiResponse: closingPitch,
      extracted: emptyExtracted({
        nombre: "Osiris",
        correo: "administracion@celamex.page",
        requerimientos_evento: "Carpas",
        direccion_evento: "colonia torre blanca cdmx",
        num_invitados: 100,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "Busco una carpa sencilla para 100 personas",
      history: [
        { role: "user", content: "Hola, me interesa cotizar una carpa" },
        { role: "assistant", content: closingPitch },
        { role: "user", content: "administracion@celamex.page" },
      ],
    });
    assert.ok(
      !/blancas?,\s*negras?,\s*transparentes?\s+y\s*tipo\s+domo/i.test(rePitch),
      rePitch.slice(0, 500)
    );
    assert.ok(/carpa/i.test(rePitch), rePitch.slice(0, 400));

    // "Ya me preguntaste" → no volver a pedir correo
    const complained = runGuards({
      aiResponse: "¿A qué correo te lo envío?",
      extracted: emptyExtracted({
        nombre: "Osiris",
        correo: "administracion@celamex.page",
        requerimientos_evento: "Carpas",
        direccion_evento: "colonia torre blanca cdmx",
        num_invitados: 100,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "Ya me habias preguntado eso",
      history: [
        { role: "user", content: "administracion@celamex.page" },
        { role: "assistant", content: closingPitch },
      ],
    });
    assert.ok(/anotado|Perfecto/i.test(complained), complained.slice(0, 400));
    assert.ok(!/a qu[eé] correo|correo te lo env[ií]o/i.test(complained), complained.slice(0, 400));
    assert.ok(!/Sigo aquí/i.test(complained));

    // "A este" con correo en historial (sin extracted.correo) → no Sigo aquí
    const aEste = runGuards({
      aiResponse: "Mucho gusto, Osiris. ¿A qué correo te mando la información?",
      extracted: emptyExtracted({
        nombre: "Osiris",
        requerimientos_evento: "Carpas (espacio 10m x 10m)",
        direccion_evento: "colonia torre blanca cdmx",
        num_invitados: 100,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "A este",
      history: [
        { role: "user", content: "administracion@celamex.page" },
        {
          role: "assistant",
          content: "Perfecto, Osiris. ¿A qué correo te envío la información?",
        },
      ],
    });
    assert.ok(!/Sigo aquí/i.test(aEste), aEste.slice(0, 400));
    assert.ok(!/a qu[eé] correo/i.test(aEste), aEste.slice(0, 400));

    const anti = applyLucyGlobalAntiRepetition({
      mensaje: "¿A qué correo te mando la información?",
      history: [
        {
          role: "assistant",
          content: "Mucho gusto, Osiris. ¿A qué correo te mando la información?",
        },
      ],
      currentMessage: "A este",
      extracted: { nombre: "Osiris", correo: "administracion@celamex.page" },
      filledSet: new Set(["Nombre del cliente", "Correo electrónico"]),
      clientName: "Osiris",
    });
    assert.ok(!/Sigo aquí/i.test(anti.mensaje), anti.mensaje);
    assert.ok(anti.applied.every((a) => a !== "same-field-reask-ack"), String(anti.applied));
  });

  // ─── 119. A15009 Erick — Circo / Blue Man / humano / no Sigo aquí ───
  await test("119. A15009 Erick — circo, blueman, handoff humano, anti-Sigo aquí", async () => {
    assert.ok(clientMentionsSpecialLiveAct("Circo para eventos"));
    assert.ok(clientMentionsEntertainment("Circo para eventos"));
    assert.ok(clientMentionsSpecialLiveAct("show blueman"));
    assert.equal(parseSpecialLiveActLabel("Circo para eventos"), "Circo para eventos");
    assert.equal(parseSpecialLiveActLabel("show blueman"), "Show Blue Man");
    assert.ok(clientAsksForHumanAdvisor("Hablar con un humano"));
    assert.ok(parseServicesFromText("Circo para eventos").includes("Circo para eventos"));

    const banquetAsk =
      "Podemos ofrecerte: • Banquete Formal • Barra de bebidas. ¿Qué te gustaría revisar primero?";

    const circo = runGuards({
      aiResponse: banquetAsk,
      extracted: emptyExtracted({
        nombre: "Erick Llamas",
        correo: "e.llamas@bunker-inc.com.mx",
        tipo_evento: "evento corporativo",
        num_invitados: 650,
        direccion_evento: "constituyentes, cdmx",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Número de invitados",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: "Circo para eventos",
      history: [{ role: "assistant", content: banquetAsk }],
    });
    assert.ok(/circo/i.test(circo), circo.slice(0, 500));
    assert.ok(!/Sigo aquí/i.test(circo), circo.slice(0, 400));
    assert.ok(!/banquete\s+formal/i.test(circo), circo.slice(0, 400));
    assert.ok(!/revisar\s+primero/i.test(circo), circo.slice(0, 400));
    assert.ok(!/no\s+confundir/i.test(circo), circo.slice(0, 500));
    assert.ok(!/no\s+es\s+banquete\s+ni\s+catering/i.test(circo), circo.slice(0, 500));

    const insist = runGuards({
      aiResponse: "¿Qué te gustaría revisar primero o prefieres armar un paquete?",
      extracted: emptyExtracted({
        nombre: "Erick Llamas",
        correo: "e.llamas@bunker-inc.com.mx",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Circo para eventos",
        num_invitados: 650,
        direccion_evento: "constituyentes, cdmx",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: "Yo quiero circo para eventos",
      history: [
        { role: "user", content: "Circo para eventos" },
        { role: "assistant", content: "¿Qué te gustaría revisar primero?" },
      ],
    });
    assert.ok(/circo/i.test(insist), insist.slice(0, 500));
    assert.ok(!/Sigo aquí/i.test(insist));
    assert.ok(!/revisar\s+primero/i.test(insist));

    const humano = runGuards({
      aiResponse:
        "Entiendo que deseas hablar con un humano. Mientras tanto, puedo ayudarte… Banquete Formal…",
      extracted: emptyExtracted({
        nombre: "Erick Llamas",
        correo: "e.llamas@bunker-inc.com.mx",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Circo para eventos",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "Hablar con un humano",
      history: [{ role: "assistant", content: banquetAsk }],
    });
    assert.ok(/asesor|canalizo|equipo/i.test(humano), humano.slice(0, 400));
    assert.ok(/55 4008 0373/.test(humano));
    assert.ok(!/banquete|mientras tanto/i.test(humano), humano.slice(0, 400));

    const blueman = runGuards({
      aiResponse: "Para tu evento, manejamos shows… Te dejo el catálogo general…",
      extracted: emptyExtracted({
        nombre: "Erick Llamas",
        correo: "e.llamas@bunker-inc.com.mx",
        tipo_evento: "evento corporativo",
        num_invitados: 650,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "show blueman",
      history: [{ role: "assistant", content: banquetAsk }],
    });
    assert.ok(/blue\s*man/i.test(blueman), blueman.slice(0, 500));
    assert.ok(!/banquete\s+formal/i.test(blueman), blueman.slice(0, 400));
    assert.ok(!/Sigo aquí/i.test(blueman));

    const anti = applyLucyGlobalAntiRepetition({
      mensaje: "¿Qué te gustaría revisar primero?",
      history: [{ role: "assistant", content: "¿Qué te gustaría revisar primero?" }],
      currentMessage: "Circo para eventos",
      extracted: { nombre: "Erick", tipo_evento: "corporativo" },
      filledSet: new Set(["Nombre del cliente", "Tipo de evento"]),
      clientName: "Erick",
    });
    assert.ok(!/Sigo aquí/i.test(anti.mensaje), anti.mensaje);
  });

  // ─── 120. V8.92 — oferta progresiva: formal vs casual + mobiliario por pieza ───
  await test("120. V8.92 — banquete/catering formal-casual + mobiliario pieza→modelos", () => {
    assert.ok(isAlimentosModoMenuReply(buildAlimentosModoMenu()));
    assert.ok(clientChoseBanqueteFormal("quiero banquete"));
    assert.ok(clientChoseBanqueteFormal("más formal"));
    assert.ok(clientChoseCateringCasual("algo más casual"));
    assert.ok(clientChoseCateringCasual("barra de pizzas"));
    assert.ok(!clientChoseBanqueteFormal("quiero taquiza casual"));

    const modo = buildAlimentosModoMenu();
    assert.ok(/formal|casual/i.test(modo), modo);
    assert.ok(/barra de pastas|barra de pizzas|taquiza/i.test(modo), modo);

    const vague =
      "Hola, me interesa cotizar un servicio de banquetes o catering para mi evento. ¿Me pueden dar información?";
    const first = runGuards({
      aiResponse: "Manejamos Banquete Formal 3 tiempos…",
      extracted: emptyExtracted(),
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage: vague,
      forceFirstPresentation: true,
    });
    assert.ok(/Lucy|Bodasesor/i.test(first), first.slice(0, 200));
    assert.ok(/formal|casual/i.test(first), first.slice(0, 400));
    assert.ok(/barra de pastas|barra de pizzas|taquiza/i.test(first), first.slice(0, 500));
    assert.ok(!/\$500|Incluye:/i.test(first), first.slice(0, 400));

    const banquete = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({ nombre: "Cecilia" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "quiero banquete",
      history: [{ role: "assistant", content: buildAlimentosModoMenu() }],
    });
    assert.ok(/Formal|Mexicano|Kosher/i.test(banquete), banquete.slice(0, 400));
    assert.ok(/detalles de alguno/i.test(banquete), banquete.slice(0, 300));

    const casual = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({ nombre: "Cecilia" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "algo más casual",
      history: [{ role: "assistant", content: buildAlimentosModoMenu() }],
    });
    assert.ok(/sushi|pozole|panini|pizza|taquiza/i.test(casual), casual.slice(0, 500));
    assert.ok(/cat[aá]logo general/i.test(casual), casual.slice(0, 400));

    // Mobiliario: no dump; preguntar pieza.
    assert.equal(buildMobiliarioRentDetailReply("barra de mobiliario"), null);
    assert.equal(buildMobiliarioRentDetailReply("me interesa cotizar mobiliario"), null);
    assert.ok(isMobiliarioPieceMenuReply(buildProgressiveOptionsMenu("mobiliario")));
    assert.equal(parseMobiliarioPieceChoice("sillas"), "sillas");
    assert.ok(/Tiffany|Crossback|Ghost/i.test(buildSillasModelMenu()));

    const mobFirst = runGuards({
      aiResponse: "Anoto mobiliario Tiffany periqueras lounge…",
      extracted: emptyExtracted(),
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage:
        "Hola, me interesa cotizar una barra de mobiliario para mi evento. ¿Me pueden dar información?",
      forceFirstPresentation: true,
    });
    assert.ok(/Lucy|Bodasesor/i.test(mobFirst), mobFirst.slice(0, 200));
    assert.ok(/qu[eé] es lo que buscas|Mesas|Sillas|Periqueras/i.test(mobFirst), mobFirst.slice(0, 500));
    assert.ok(
      !/Tiffany y versátiles|mesas tipo picnic, salas lounge y m[aá]s/i.test(mobFirst),
      `no dump: ${mobFirst.slice(0, 500)}`
    );

    const sillas = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({ nombre: "Alan", requerimientos_evento: "Mobiliario" }),
      filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "sillas",
      history: [{ role: "assistant", content: buildProgressiveOptionsMenu("mobiliario") }],
    });
    assert.ok(/Tiffany|Crossback|Ghost/i.test(sillas), sillas.slice(0, 500));
    assert.ok(/cat[aá]logo/i.test(sillas), sillas.slice(0, 400));

    // Con cantidad sí hay detalle técnico.
    const qty = buildMobiliarioRentDetailReply("Necesito 900 sillas para un concierto");
    assert.ok(qty && /900|sillas/i.test(qty), qty ?? "");
  });

  // ─── 121. V8.93 — voz humana: preferir OpenAI sobre dump de plantilla ───
  await test("121. V8.93 — voz humana preferida + cierre sin upsell + prompt", () => {
    assert.ok(/^V(8\.9[3456789]|9\.\d{2})$/.test(LUCY_PROMPT_VERSION), LUCY_PROMPT_VERSION);
    assert.ok(/PLANTILLAS|CONOCIMIENTO|asesora|voz humana|no guion/i.test(SYSTEM_PROMPT));
    assert.ok(/no eres un salesbot|no guion|REDACTA t[uú]/i.test(SYSTEM_PROMPT));

    // Entretenimiento: si el modelo ya orientó bien, no sustituir por dump de plantilla.
    const humanEnt =
      "Claro, Bakar. Anoto un show de grupo versátil para tu evento del 18 de diciembre. " +
      "Es entretenimiento (no catering). ¿Me confirmas si es corporativo y en qué sede sería?";
    const entReply = runGuards({
      aiResponse: humanEnt,
      extracted: emptyExtracted({
        nombre: "Bakar",
        correo: "compras1@scabakar.com",
        tipo_evento: "evento corporativo",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
      ]),
      readyForClosing: false,
      currentMessage:
        "requerimos un show de grupo versatil para el dia 18 de diciembre a las 20:00 horas para un grupo de 30 personas",
      history: [{ role: "assistant", content: "¿Qué servicios te gustaría cotizar?" }],
    });
    assert.ok(/show de grupo vers[aá]til/i.test(entReply), entReply.slice(0, 400));
    assert.ok(
      !/happening, espejos, l[aá]ser y m[aá]s opciones/i.test(entReply),
      `no dump show: ${entReply.slice(0, 400)}`
    );

    // Cierre: sin empujar mobiliario/DJ al cerrar.
    const closing = buildStandardClosingMessage("banquete", "Ana");
    assert.ok(/Perfecto, ya tengo todo/i.test(closing), closing);
    assert.ok(!/Si quieres sumar/i.test(closing), closing);
    assert.ok(!/DJ o iluminaci/i.test(closing), closing);

    // Menú progresivo formal/casual sigue ganando sobre dump de AI.
    const progressive = runGuards({
      aiResponse: "Te paso Banquete Formal 3 tiempos a $500 e incluye…",
      extracted: emptyExtracted(),
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage:
        "Hola, me interesa cotizar un servicio de banquetes o catering para mi evento. ¿Me pueden dar información?",
      forceFirstPresentation: true,
    });
    assert.ok(/formal|casual/i.test(progressive), progressive.slice(0, 400));
    assert.ok(!/\$500/i.test(progressive), progressive.slice(0, 300));
  });

  // ─── 122. V8.94 — Gemini 3.1 Flash-Lite como LLM default ───
  await test("122. V8.94 — Gemini Flash-Lite provider + conversión mensajes", () => {
    assert.ok(/^V9\.\d{2}$/.test(LUCY_PROMPT_VERSION), LUCY_PROMPT_VERSION);
    assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.1-flash-lite");

    const prevProvider = process.env.LLM_PROVIDER;
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevGeminiIa = process.env.gemini_ia;
    const prevGoogle = process.env.GOOGLE_API_KEY;
    const prevOpen = process.env.OPEN_AI;
    const prevOpenAi = process.env.OPENAI_API_KEY;
    try {
      process.env.LLM_PROVIDER = "gemini";
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      process.env.gemini_ia = "test-gemini-ia-key";
      assert.equal(getLlmProvider(), "gemini");
      assert.equal(getChatModel(), "gemini-3.1-flash-lite");
      assert.equal(isLlmConfigured(), true);

      process.env.LLM_PROVIDER = "openai";
      process.env.OPEN_AI = "sk-test";
      assert.equal(getLlmProvider(), "openai");

      const mapped = fromOpenAiMessages([
        { role: "system", content: "Eres Lucy" },
        { role: "user", content: "Hola" },
        { role: "assistant", content: "Con gusto" },
      ]);
      assert.equal(mapped.length, 3);
      assert.equal(mapped[0]?.role, "system");
      assert.equal(mapped[2]?.role, "assistant");
    } finally {
      if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = prevProvider;
      if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevGemini;
      if (prevGeminiIa === undefined) delete process.env.gemini_ia;
      else process.env.gemini_ia = prevGeminiIa;
      if (prevGoogle === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = prevGoogle;
      if (prevOpen === undefined) delete process.env.OPEN_AI;
      else process.env.OPEN_AI = prevOpen;
      if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevOpenAi;
    }
  });

  // ─── 123. V8.98 — pin Gemini: solo flash-lite, sin Nano Banana / Imagen ───
  await test("123. V8.98 — pin gemini-3.1-flash-lite; bloquea Nano Banana/Imagen", () => {
    assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.1-flash-lite");
    assert.equal(resolveGeminiModel("gemini-3.1-flash-lite-image"), "gemini-3.1-flash-lite");
    assert.equal(resolveGeminiModel("imagen-4.0-fast-generate-001"), "gemini-3.1-flash-lite");
    assert.equal(resolveGeminiModel("gemini-2.5-flash-image"), "gemini-3.1-flash-lite");
    assert.equal(resolveGeminiModel("gemini-3.6-flash"), "gemini-3.1-flash-lite");
    assert.ok(isImageGenerationModel("gemini-3.1-flash-image"));
    assert.ok(isImageGenerationModel("gemini-3.1-flash-lite-image"));
    assert.ok(isImageGenerationModel("imagen-4.0-generate-001"));
    assert.ok(isBlockedGeminiModel("gemini-3.6-flash"));
    assert.ok(!isImageGenerationModel("gemini-3.1-flash-lite"));

    const prevModel = process.env.GEMINI_MODEL;
    const prevLlm = process.env.LLM_MODEL;
    const prevProvider = process.env.LLM_PROVIDER;
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevGeminiIa = process.env.gemini_ia;
    try {
      process.env.LLM_PROVIDER = "gemini";
      process.env.gemini_ia = "test-key";
      process.env.GEMINI_MODEL = "gemini-3.1-flash-lite-image";
      process.env.LLM_MODEL = "imagen-4.0-fast-generate-001";
      assert.equal(getChatModel(), "gemini-3.1-flash-lite");
      const summary = llmConfigSummary();
      assert.equal(summary.model, "gemini-3.1-flash-lite");
      assert.equal(summary.gemini_image_generation, false);
      assert.equal(summary.gemini_allowed_model, "gemini-3.1-flash-lite");
    } finally {
      if (prevModel === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = prevModel;
      if (prevLlm === undefined) delete process.env.LLM_MODEL;
      else process.env.LLM_MODEL = prevLlm;
      if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = prevProvider;
      if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevGemini;
      if (prevGeminiIa === undefined) delete process.env.gemini_ia;
      else process.env.gemini_ia = prevGeminiIa;
    }
  });

  // ─── 124. A15164 — cliente Alejandro: capturar nombre y no re-preguntar ───
  await test("124. A15164 — Alejandro/Hola Alejandro se capturan; queja no re-pide nombre", () => {
    assert.equal(sanitizeCrmNombre("Alejandro"), "Alejandro");
    assert.equal(sanitizeCrmNombre("Hola, Alejandro"), "Alejandro");
    assert.equal(sanitizeCrmNombre("Soy Alejandro"), "Alejandro");
    assert.equal(sanitizeDisplayName("Alejandro"), "Alejandro");
    assert.equal(sanitizeCrmNombre("Ya te lo dije 3 veces"), null);

    const hist: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "assistant", content: "¿Cómo te llamas?" },
      { role: "user", content: "Hola, Alejandro" },
    ];
    assert.equal(recoverClienteNombreFromHistory(hist, "Alejandro"), "Alejandro");
    assert.equal(recoverClienteNombreFromHistory(hist, undefined), "Alejandro");

    // Tras decir el nombre, Lucy avanza al siguiente dato (tipo), no vuelve a pedir nombre.
    const filled = new Set<string>();
    const extracted = emptyExtracted();
    const afterName = runGuards({
      aiResponse: "¿Me regalas tu nombre para iniciar?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Alejandro",
      history: [{ role: "assistant", content: "¿Cómo te llamas?" }],
    });
    assert.equal(extracted.nombre, "Alejandro");
    assert.ok(filled.has("Nombre del cliente"));
    assert.ok(!/cu[aá]l\s+es\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|regalas\s+tu\s+nombre|con\s+qui[eé]n\s+tengo/i.test(afterName), afterName);
    assert.ok(/Mucho gusto,\s*Alejandro/i.test(afterName), afterName);
    assert.ok(
      /celebr|tipo de evento|de qu[eé] se trata|servicios|pensado/i.test(afterName),
      afterName
    );
    assert.ok(!mensajeAsksForField(afterName, "correo"), afterName);

    // Queja de repetición con historial: ack con nombre y siguiente campo, no nombre otra vez.
    const filled2 = new Set<string>();
    const extracted2 = emptyExtracted();
    const afterComplaint = runGuards({
      aiResponse: "¿Cómo te llamas?",
      extracted: extracted2,
      filledSet: filled2,
      readyForClosing: false,
      currentMessage: "Ya te lo dije 3 veces",
      history: [
        { role: "assistant", content: "¿Cómo te llamas?" },
        { role: "user", content: "Alejandro" },
        { role: "assistant", content: "¿Con quién tengo el gusto?" },
        { role: "user", content: "Alejandro" },
        { role: "assistant", content: "¿Me regalas tu nombre para iniciar?" },
      ],
    });
    assert.equal(extracted2.nombre, "Alejandro");
    assert.ok(/Perfecto/i.test(afterComplaint), afterComplaint);
    assert.ok(
      !/regalas\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|con\s+qui[eé]n\s+tengo/i.test(afterComplaint),
      afterComplaint
    );

    // CRM: Alejandro/Rodrigo no se purgan; Lucy sí.
    const crmOk = sanitizeKommoCrmLines(["- Nombre del cliente: Alejandro"]);
    assert.equal(crmOk.length, 1);
    const crmLucy = sanitizeKommoCrmLines(["- Nombre del cliente: Lucy"]);
    assert.equal(crmLucy.length, 0);

    // Outbound: seguir saludando al cliente Alejandro; handoff = nuestro equipo.
    const norm = normalizeAdvisorReferences(
      "Mucho gusto, Alejandro. Le paso estos datos a Alejandro para la cotización.",
      "Alejandro"
    );
    assert.ok(/Mucho gusto,\s+Alejandro/i.test(norm), norm);
    assert.ok(/nuestro equipo/i.test(norm), norm);
  });

  // ─── 125. A15165 — show: intro Lucy, catálogos, post-cierre no muere ───
  await test("125. A15165 — show intro + info shows/mobiliario/sillas post-cierre", async () => {
    assert.ok(clientMentionsEntertainment("Hola quiero cotizar un show"));
    assert.ok(clientMentionsEntertainment("Tiene info de los shows?"));
    assert.ok(clientAsksForRecommendations("Qué otros servicios manejan"));
    assert.ok(isServiceRelatedMessage("Mobilairio que manejan"));
    assert.ok(clientAsksServiceInfo("Tienes los modelos de sillas?"));

    // Primer turno: intro + nombre (no Level-2 solo).
    const first = buildFirstInteractionMessage(
      {
        extracted: emptyExtracted(),
        filledSet: new Set(),
        history: [],
        currentMessage: "Hola quiero cotizar un show",
        entityId: 15165,
      },
      true
    );
    assert.ok(/hola[!.,]?\s*(?:buen\s+d[ií]a[.!]?\s*)?soy\s+lucy/i.test(first), first);
    assert.ok(/cu[aá]l\s+es\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|regalas\s+tu\s+nombre|con\s+qui[eé]n\s+tengo/i.test(first), first);
    assert.ok(/show|animaci|performance/i.test(first), first);
    assert.ok(!/^\s*¡?Claro!\s+\*Animaci[oó]n/i.test(first), first);

    // Pipeline no debe pisar intro por force-ack de servicio.
    const kept = await finalizeLucyOutboundMessage({
      mensaje: first,
      extracted: emptyExtracted(),
      filledSet: new Set(),
      history: [],
      currentMessage: "Hola quiero cotizar un show",
      readyForClosing: false,
      cierreYaEnviado: false,
      entityId: 15165,
    });
    assert.ok(/hola[!.,]?\s*(?:buen\s+d[ií]a[.!]?\s*)?soy\s+lucy/i.test(kept), kept);
    assert.ok(!/^\s*¡?Claro!\s+\*Animaci[oó]n\s*\/\s*Hora\s+loca\*\s+la\s+anoto/i.test(kept), kept);

    // Post-cierre: info de shows → catálogo / orientación, no Level-2 ni "Queda anotado".
    const postShow = runGuards({
      aiResponse:
        "¡Claro! *Animación / Hora loca* la anoto para tu cotización. Nuestro equipo te confirma descripción, precio e inclusiones.",
      extracted: emptyExtracted({
        nombre: "Alejandro",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Animación / Hora loca",
        direccion_evento: "CDMX",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Número de invitados",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: true,
      cierreYaEnviado: true,
      currentMessage: "Tiene info de los shows?",
      history: [
        {
          role: "assistant",
          content:
            "Perfecto, ya tengo todo. He anotado la animación… Si necesitas algo más, con gusto te apoyo.",
        },
      ],
    });
    assert.ok(/show|animaci|entretenimiento|hora\s+loca|performance/i.test(postShow), postShow.slice(0, 400));
    assert.ok(/bodasesor\.com\/catalogos|cat[aá]logo/i.test(postShow), postShow.slice(0, 500));
    assert.ok(!/Queda anotado\.?\s*Nuestro equipo sigue/i.test(postShow), postShow);
    assert.ok(
      !/\bla\s+anoto\s+para\s+tu\s+cotizaci[oó]n\b/i.test(postShow),
      `no Level-2: ${postShow.slice(0, 400)}`
    );

    // Post-cierre: otros servicios.
    const postOtros = runGuards({
      aiResponse: "Queda anotado.",
      extracted: emptyExtracted({ nombre: "Alejandro", tipo_evento: "evento corporativo" }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Número de invitados",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: true,
      cierreYaEnviado: true,
      currentMessage: "Qué otros servicios manejan",
      history: [{ role: "assistant", content: "Perfecto, ya tengo todo." }],
    });
    assert.ok(/banquete|mobiliario|barra|dj|servicio/i.test(postOtros), postOtros.slice(0, 400));
    assert.ok(!/Queda anotado\.?\s*Nuestro equipo sigue/i.test(postOtros), postOtros);

    // Post-cierre: modelos de sillas + catálogo.
    const postSillas = runGuards({
      aiResponse: "Queda anotado. Nuestro equipo sigue con tu cotización.",
      extracted: emptyExtracted({ nombre: "Alejandro", requerimientos_evento: "Mobiliario" }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Número de invitados",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: true,
      cierreYaEnviado: true,
      currentMessage: "No sabes qué modelos manejas de sillas?",
      history: [{ role: "assistant", content: "Perfecto, ya tengo todo." }],
    });
    assert.ok(/tiffany|crossback|ghost|sillas/i.test(postSillas), postSillas.slice(0, 500));
    assert.ok(/mesas-y-sillas|cat[aá]logo/i.test(postSillas), postSillas.slice(0, 500));
    assert.ok(!/Queda anotado\.?\s*Nuestro equipo sigue/i.test(postSillas), postSillas);

    assert.ok(/tiffany/i.test(buildSillasModelMenu()));
    const showAck = buildGuardServiceAck("quiero cotizar un show");
    assert.ok(/show|animaci|cat[aá]logo|bodasesor\.com\/catalogos/i.test(showAck), showAck);
    assert.ok(!/^\s*¡?Claro!\s+\*Animaci[oó]n\s*\/\s*Hora\s+loca\*\s+la\s+anoto/i.test(showAck), showAck);
  });

  // ─── 126. V9.00 — optimizaciones de costo Gemini ───
  await test("126. V9.00 — context cache + media-once + image compress", async () => {
    assert.ok(/^V9\.\d{2}$/.test(LUCY_PROMPT_VERSION), LUCY_PROMPT_VERSION);

    // V9.32: explicit cache default OFF — activar solo para este test.
    const prevCache = process.env.GEMINI_CONTEXT_CACHE;
    process.env.GEMINI_CONTEXT_CACHE = "1";

    // Context cache: hash estable + create/reuse vía mock ai.caches
    resetGeminiContextCacheForTests();
    const longSystem = ("Lucy Bodasesor system. " + "x".repeat(4000)).slice(0, 4200);
    const h1 = hashSystemInstruction(longSystem);
    const h2 = hashSystemInstruction(longSystem);
    assert.equal(h1, h2);
    assert.notEqual(hashSystemInstruction(longSystem + "!"), h1);

    let createCalls = 0;
    const fakeAi = {
      caches: {
        create: async () => {
          createCalls += 1;
          return {
            name: `cachedContents/test-${createCalls}`,
            usageMetadata: { totalTokenCount: 1200 },
          };
        },
      },
    };
    const name1 = await getOrCreateSystemCache(fakeAi as never, longSystem);
    const name2 = await getOrCreateSystemCache(fakeAi as never, longSystem);
    assert.equal(name1, "cachedContents/test-1");
    assert.equal(name2, name1);
    assert.equal(createCalls, 1);
    const cstats = getGeminiContextCacheStats();
    assert.equal(cstats.creates, 1);
    assert.equal(cstats.hits, 1);
    // Prompt corto no cachea
    assert.equal(await getOrCreateSystemCache(fakeAi as never, "hola"), null);

    // Default off: sin GEMINI_CONTEXT_CACHE=1 no crea
    process.env.GEMINI_CONTEXT_CACHE = "0";
    resetGeminiContextCacheForTests();
    assert.equal(await getOrCreateSystemCache(fakeAi as never, longSystem), null);
    assert.equal(getGeminiContextCacheStats().disabled, 1);
    if (prevCache === undefined) delete process.env.GEMINI_CONTEXT_CACHE;
    else process.env.GEMINI_CONTEXT_CACHE = prevCache;

    // Media-once: historial de chat no retiene image_url en texto de turno
    // (processMessage → formatImageTurnText); fromOpenAiMessages puede mapear
    // image_url pero completeWithGemini las strippea salvo vision/voice.
    const turn = formatImageTurnText({
      intent: "montaje_referencia",
      internalDescription: "mesas redondas blancas",
      clientReply: "Vi tus mesas redondas; anoto ese estilo.",
    });
    assert.ok(!/data:image|base64,/i.test(turn));
    assert.ok(/Imagen respuesta cliente/i.test(turn));

    // Image compress ≤1024 JPEG
    resetImageCompressStatsForTests();
    const big = new Jimp({ width: 2000, height: 1500, color: 0x336699ff });
    const raw = await big.getBuffer("image/jpeg");
    const compressed = await compressImageForVision(raw);
    assert.ok(compressed.width <= VISION_MAX_EDGE);
    assert.ok(compressed.height <= VISION_MAX_EDGE);
    assert.equal(compressed.mimeType, "image/jpeg");
    assert.ok(compressed.bytesOut < compressed.bytesIn || compressed.resized);
    assert.ok(compressed.base64.length > 100);
    const istats = getImageCompressStats();
    assert.ok(istats.total >= 1);

    // Health features documentadas
    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const healthSrc = readFileSync(path.join(apiRoot, "src/routes/health.ts"), "utf8");
    assert.ok(healthSrc.includes("gemini-context-cache"));
    assert.ok(healthSrc.includes("gemini-media-once"));
    assert.ok(healthSrc.includes("gemini-image-compress-1024"));

    // Stats shape incluye context_cache
    const gstats = getGeminiCallStats();
    assert.ok("context_cache" in gstats);
    assert.ok("mediaStripped" in gstats);
  });

  // ─── 127. A14936 — proveedor/alianza venue no es embudo cliente ───
  await test("127. A14936 — Lety Hacienda aliados → proveedor, no formulario evento", async () => {
    const letyText =
      "Hola Lucy. Te escribe Lety, soy ejecutiva de ventas en Hacienda Los Arcángeles, " +
      "te invito a registrarte en nuestra base de datos para conocer los beneficios y tarifas " +
      "disponibles de nuestro venue, y ser parte de nuestra red de aliados comerciales. Bonito Martes!";

    assert.ok(looksLikeProveedorOutreach(letyText));
    assert.equal(resolveTipoContacto("cliente", letyText), "proveedor");
    assert.equal(resolveTipoContacto(null, letyText), "proveedor");
    assert.equal(resolveTipoContacto("proveedor", letyText), "proveedor");

    // Seguimiento de alianza también cuenta
    const follow =
      "Hola Lucy; La intención de mi mensaje es invitarte a registrarte para ser parte de nuestra red de aliados";
    assert.equal(resolveTipoContacto("cliente", follow), "proveedor");

    // Saint-Gobain sigue siendo CLIENTE
    const cafe =
      "Solicitud para cotización de café gourmet para evento corporativo Saint-Gobain";
    assert.equal(resolveTipoContacto("proveedor", cafe), "cliente");
    assert.ok(!looksLikeProveedorOutreach(cafe));

    // Cliente en hacienda ≠ proveedor
    const bodaHacienda =
      "Quiero cotizar banquete para mi boda en Hacienda Los Arcángeles el 20 de diciembre";
    assert.equal(resolveTipoContacto(null, bodaHacienda), "cliente");

    assert.equal(extractEmpresaFromText(letyText), "Hacienda Los Arcángeles");

    const reply = buildProveedorHandoffReply({
      nombre: "Lety",
      empresa: "Hacienda Los Arcángeles",
      conversationText: letyText,
    });
    assert.ok(/proveedores|alianzas/i.test(reply), reply);
    assert.ok(/Hacienda Los Arcángeles/i.test(reply), reply);
    assert.ok(!/tipo de evento|invitados|presupuesto|correo te mando/i.test(reply), reply);

    const scrubbed = scrubClientFieldsForProveedor({
      ...emptyExtracted(),
      tipo_contacto: "proveedor",
      nombre: "Lety",
      empresa: "Hacienda Los Arcángeles",
      direccion_evento: "Hacienda Los Arcángeles",
      tipo_evento: "boda",
      num_invitados: 100,
      requerimientos_evento: "Invitación a red de aliados",
    });
    assert.equal(scrubbed.tipo_contacto, "proveedor");
    assert.equal(scrubbed.direccion_evento, null);
    assert.equal(scrubbed.tipo_evento, null);
    assert.equal(scrubbed.num_invitados, null);

    const zona = resolveProveedorEtapa();
    assert.equal(zona.statusId, ETAPA.HUMANO_TRABAJA);
    assert.ok(zona.pipelineId > 0);

    // prepareLucyExtraction: resolve + scrub en pipeline
    const { extracted } = await prepareLucyExtraction({
      fullHistory: [],
      messageText: letyText,
      crmLines: [],
      extractFn: async () => ({
        ...emptyExtracted(),
        tipo_contacto: "cliente",
        nombre: "Lety",
        empresa: "Hacienda Los Arcángeles",
        requerimientos_evento: "red de aliados",
      }),
    });
    assert.equal(extracted.tipo_contacto, "proveedor");
    assert.equal(extracted.tipo_evento, null);
    assert.ok(/PROVEEDOR:/i.test(extracted.requerimientos_evento ?? ""), extracted.requerimientos_evento);

    const healthSrc = readFileSync(
      path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), "src/routes/health.ts"),
      "utf8"
    );
    assert.ok(healthSrc.includes("proveedor-alianza-handoff"));
  });

  // ─── 128. A15168 — Coffee Break: menú 1–5 + catálogo + opción N ───
  await test("128. A15168 — Coffee Break detalle, catálogo y opción 1 (no vacío)", () => {
    // Cancún / Cancun no es nombre
    assert.ok(isLikelyUbicacionNotNombre("Cancun"));
    assert.ok(isLikelyUbicacionNotNombre("Cancún"));
    assert.equal(sanitizeCrmNombre("Cancun"), null);
    assert.equal(sanitizeDisplayName("Cancun"), null);

    const menu = buildProgressiveOptionsMenu("coffee_break");
    assert.ok(/Coffee Break 1/i.test(menu) && /Coffee Break 5/i.test(menu), menu);
    assert.ok(/bodasesor\.com\/catalogos\/coffee-break/i.test(menu), menu);
    assert.ok(lastAssistantOfferedNumberedPackages(menu));

    const hist: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "assistant", content: menu },
    ];
    assert.ok(clientWantsServiceDetail("quiero ver las opciones", hist));
    assert.ok(clientWantsServiceDetail("opcion 1", hist));
    assert.ok(clientWantsServiceDetail("opción 1", hist));
    assert.ok(clientWantsServiceDetail("paquete 2", hist));
    assert.ok(isCatalogLevelSelection("opcion 1", menu));
    assert.equal(extractCatalogNivelFromText("opcion 1", menu), "Coffee Break 1");
    assert.equal(extractCatalogNivelFromText("1", menu), "Coffee Break 1");

    const detailQ = resolveProgressiveDetailQuery({
      currentMessage: "opcion 1",
      serviceHint: "Coffee Break",
      history: hist,
    });
    assert.equal(detailQ, "Coffee Break 1");

    const verOpcionesQ = resolveProgressiveDetailQuery({
      currentMessage: "quiero ver las opciones",
      serviceHint: "Coffee Break",
      history: hist,
    });
    assert.equal(verOpcionesQ, "Coffee Break");

    // Coffe typo en brief multi-servicio
    const services = parseServicesFromText(
      "Servicio de Coffe Break igual si me pueden cotizar otro con desayuno."
    );
    assert.ok(services.some((s) => /coffee/i.test(s)), services.join(", "));
    assert.ok(services.some((s) => /desayuno/i.test(s)), services.join(", "));

    // Primera oferta coffee: menú/catálogo, no solo "paquetes 1 a 5" opaco
    const first = runGuards({
      aiResponse: "¿Cómo te llamas?",
      extracted: emptyExtracted({
        tipo_evento: "corporativo",
        requerimientos_evento: "Coffee Break",
      }),
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage: "Hola, me interesa cotizar: Coffee Break para Eventos Corporativos",
      forceFirstPresentation: true,
    });
    assert.ok(
      /Coffee Break 1|manejamos estos (paquetes|niveles)|catalogos\/coffee-break/i.test(first),
      first.slice(0, 500)
    );
    assert.ok(/bodasesor\.com\/catalogos\/coffee-break/i.test(first), first.slice(0, 400));

    // Tras menú: opción 1 → detalle (no "Seguimos con lo que ya platicamos")
    setCatalogSnapshotForTests(
      parseSheetCatalogCsv(
        [
          '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye","Sinonimos"',
          '"Coffee Break","Coffee Break 1","$120.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café, galletas y agua"',
          '"Coffee Break","Coffee Break 2","$200.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café, pan dulce y fruta"',
          '"Coffee Break","Coffee Break 3","$280.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café premium y snacks"',
          '"Coffee Break","Coffee Break 4","$350.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Estación completa CB4"',
          '"Coffee Break","Coffee Break 5","$400.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Estación completa CB5"',
        ].join("\n")
      )
    );
    const pick = runGuards({
      aiResponse: "Entendido. Seguimos con lo que ya platicamos.",
      extracted: emptyExtracted({
        nombre: "Yolanda Huerta Frey",
        correo: "Lgc.cancun1@gmail.com",
        tipo_evento: "corporativo",
        requerimientos_evento: "Coffee Break",
        direccion_evento: "Cancun",
        fecha_horario: "25/08 9:00 am",
        num_invitados: 100,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "opcion 1",
      history: hist,
      presentationHistory: hist,
    });
    assert.ok(!/Seguimos con lo que ya platicamos/i.test(pick), pick.slice(0, 300));
    assert.ok(
      /Coffee Break 1|Café|galletas|\$\s*120|incluye/i.test(pick),
      pick.slice(0, 500)
    );
    assert.ok(/bodasesor\.com\/catalogos\/coffee-break/i.test(pick), pick.slice(0, 400));
  });

  // ─── 129. A15169 — catálogo de menú genérico ≠ pizzas; mándamelo ≠ nombre ───
  await test("129. A15169 — catálogo genérico hub; Sí mándamelo no es nombre", () => {
    const msg =
      "¡Hola, me gustaría conocer más de sus servicios!\nCuentan con catalogo de menú?";
    assert.ok(clientAsksForCatalog(msg));
    assert.ok(clientAsksGenericMenuCatalog(msg));
    assert.ok(clientWantsFullCatalog(msg));
    assert.equal(parseServicesFromText(msg).length, 0);

    // Con requerimientos alucinados "Barra de pizzas", igual manda hub general.
    const first = runGuards({
      aiResponse: "Claro, aquí tienes el catálogo de *Barra de pizzas*:\nhttps://bodasesor.com/catalogos/barra-de-pizzas",
      extracted: emptyExtracted({
        requerimientos_evento: "Barra de pizzas",
      }),
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage: msg,
      forceFirstPresentation: true,
    });
    assert.ok(/cat[aá]logo general|todos los servicios/i.test(first), first.slice(0, 400));
    assert.ok(/bodasesor\.com\/catalogos(?!\/barra)/i.test(first), first.slice(0, 400));
    assert.ok(!/barra-de-pizzas|Barra de pizzas/i.test(first), first.slice(0, 400));

    assert.ok(isLikelyNotPersonNameMessage("Si mándamelo"));
    assert.ok(isLikelyNotPersonNameMessage("mándamelo"));
    assert.equal(sanitizeCrmNombre("Si mándamelo"), null);
    assert.equal(sanitizeDisplayName("Mándamelo"), null);

    const pizzaOffer =
      "Claro, aquí tienes el catálogo de *Barra de pizzas*:\nhttps://bodasesor.com/catalogos/barra-de-pizzas\n\nSi quieres el de otro servicio, dímelo y te mando ese.";
    assert.ok(assistantOfferedCatalogDetail(pizzaOffer));
    assert.ok(clientAffirmsCatalogOffer("Si mándamelo", pizzaOffer));

    const affirm = runGuards({
      aiResponse: "Para anotarte bien: ¿eres Mándamelo o sigo contigo como Stephany?",
      extracted: emptyExtracted({ nombre: "Stephany" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "Si mándamelo",
      history: [{ role: "assistant", content: pizzaOffer }],
      presentationHistory: [{ role: "assistant", content: pizzaOffer }],
      whatsappDisplayName: "Stephany",
    });
    assert.ok(!/eres M[aá]ndamelo|sigo contigo/i.test(affirm), affirm.slice(0, 300));
    assert.ok(/bodasesor\.com\/catalogos/i.test(affirm), affirm.slice(0, 400));
  });

  // ─── 130. A15190 Adriana — centros de mesa ≠ mobiliario ───
  await test("130. A15190 — centros de mesa es floral/decorativo, no mobiliario", () => {
    for (const msg of [
      "centros de mesa",
      "De centros de mesa",
      "Centros de mesa",
      "arreglos de mesa",
      "centros florales",
    ]) {
      const services = parseServicesFromText(msg);
      assert.ok(services.includes("Centros de mesa"), `${msg} → ${services.join(",")}`);
      assert.ok(!services.includes("Mobiliario"), `${msg} no debe ser mobiliario: ${services.join(",")}`);
      assert.equal(detectProgressiveFamily(msg), null, msg);
      assert.equal(parseMobiliarioPieceChoice(msg), null, msg);
    }
    assert.equal(parseMobiliarioPieceChoice("mesa de dulces"), null);

    const ack = buildGuardServiceAck("De centros de mesa");
    assert.ok(/centros de mesa/i.test(ack), ack);
    assert.ok(/floral|decoraci/i.test(ack), ack);
    assert.ok(!/periqueras|salas lounge|Tiffany|¿Qué es lo que buscas/i.test(ack), ack);

    const early = runGuards({
      aiResponse: "Sí, contamos con *mobiliario*. ¿Qué es lo que buscas?\n• Mesas\n• Sillas",
      extracted: emptyExtracted(),
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage: "De centros de mesa",
      forceFirstPresentation: true,
      history: [
        {
          role: "assistant",
          content: "Hola, soy Lucy, agente virtual de Bodasesor. ¿Cómo te llamas?",
        },
      ],
    });
    assert.ok(!/periqueras|salas lounge|Tiffany/i.test(early), early.slice(0, 500));
    assert.ok(
      /centros de mesa|floral|decoraci|anoto/i.test(early) || /c[oó]mo te llamas|nombre/i.test(early),
      early.slice(0, 500)
    );
    assert.ok(!/\*Mobiliario\*/i.test(early), early.slice(0, 400));

    const named = runGuards({
      aiResponse: "¡Claro! *Mobiliario* la anoto para tu cotización.",
      extracted: emptyExtracted({ nombre: "Adriana" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "Centros de mesa",
      whatsappDisplayName: "Adriana García",
    });
    assert.ok(/centros de mesa/i.test(named), named.slice(0, 400));
    assert.ok(!/\*Mobiliario\*/i.test(named), named.slice(0, 400));
    assert.ok(!/periqueras|salas lounge/i.test(named), named.slice(0, 400));
  });

  // ─── 131. A15191 Patricio — Barra de Café ≠ Barra Americana ───
  await test("131. A15191 — Barra de Café no usa Barra Americana y respeta afluencia desconocida", () => {
    const baristaFamilies = expandQueryWithServiceSynonyms(
      "Busco un barista para un stand de café"
    ).familyKeys;
    assert.ok(baristaFamilies.includes("barra_cafe"), baristaFamilies.join(", "));
    assert.ok(!baristaFamilies.includes("coffee_break"), baristaFamilies.join(", "));
    const breakFamilies = expandQueryWithServiceSynonyms(
      "Necesito coffee break con bocadillos"
    ).familyKeys;
    assert.ok(breakFamilies.includes("coffee_break"), breakFamilies.join(", "));
    assert.ok(!breakFamilies.includes("barra_cafe"), breakFamilies.join(", "));

    refreshLucyInfoPriceCache([
      {
        title: "Barra Americana bodasesor",
        content:
          "Barra Americana. Centro de mesa con flores. Barra con vitroleros, agua y café. Tradicional $180 por persona. Meseros, vajilla y silla Tiffany.",
      },
      {
        title: "Barra de Cafe bodasesor",
        content:
          "Barra de Café Premium. Barista, café americano, capuchino y té. Premium $550 por persona. Incluye equipo e insumos.",
      },
    ]);
    const cafeDetail = buildLucyInfoInclusionReply(
      "Barra de Café Premium para Eventos"
    );
    assert.ok(/Barra de Cafe bodasesor/i.test(cafeDetail ?? ""), cafeDetail ?? "sin detalle");
    assert.ok(/barista|capuchino/i.test(cafeDetail ?? ""), cafeDetail ?? "sin detalle");
    assert.ok(
      !/Barra Americana|Silla Tiffany|centro de mesa/i.test(cafeDetail ?? ""),
      cafeDetail ?? "sin detalle"
    );

    const first = runGuards({
      aiResponse:
        "Según el catálogo que ya tenemos de *Barra Americana bodasesor*: Centro de mesa, vitroleros, meseros, vajilla y silla Tiffany.",
      extracted: emptyExtracted(),
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage: "Hola, me interesa cotizar: Barra de Café Premium para Eventos",
      forceFirstPresentation: true,
      history: [],
    });
    assert.ok(/Barra de Café/i.test(first), first.slice(0, 500));
    assert.ok(/c[oó]mo te llamas|nombre|con qui[eé]n/i.test(first), first.slice(0, 500));
    assert.ok(!/Barra Americana|Silla Tiffany|vitroleros/i.test(first), first.slice(0, 500));
    assert.ok(!/Según el catálogo/i.test(first), first.slice(0, 500));

    const unknownGuests =
      "No sabemos cuántos invitados son; nosotros no organizamos el evento, vamos como patrocinadores.";
    const guestFilled = new Set<string>();
    const guestLines: string[] = [];
    applyInvitadosWaiver(
      guestFilled,
      guestLines,
      [unknownGuests],
      [{ role: "assistant", content: "¿Cuántos invitados tienen contemplados?" }]
    );
    assert.ok(guestFilled.has("Número de invitados"));
    assert.ok(/afluencia abierta|no dispone del dato/i.test(guestLines.join(" ")));
    const guestSummary = buildResumenClienteLargo(
      emptyExtracted({
        nombre: "Patricio",
        requerimientos_evento: "Barra de Café Premium",
      }),
      guestLines
    );
    assert.ok(/Escala: Sin definir \(afluencia abierta/i.test(guestSummary), guestSummary);
    assert.ok(!/afluencia abierta[^•\n]*personas\s*\/\s*piezas/i.test(guestSummary), guestSummary);

    assert.equal(
      parseInvitadosFromText("No sabemos cuántos invitados son"),
      "Sin definir (cliente indicó aproximación pendiente)"
    );
    assert.equal(
      parseInvitadosFromText("No te lo puedo confirmar, no tenemos ese dato"),
      "Sin definir (cliente indicó aproximación pendiente)"
    );
    assert.equal(parseZonaFromText("el stand"), null);
    assert.equal(parseZonaFromText("en el stand con nosotros"), null);
    assert.ok(!isUsableDireccionEvento("el, stand"));
    assert.ok(isUsableDireccionEvento("Expo Santa Fe"));

    const closing = runGuards({
      aiResponse: "De acuerdo. ¿Más o menos para cuántas personas sería?",
      extracted: emptyExtracted({
        nombre: "Patricio",
        correo: "pacosiom@finasist.com",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Barra de Café Premium — barista en stand por dos días",
        direccion_evento: "Expo Santa Fe",
        fecha_horario: "dos días",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Lugar/dirección del evento",
        "Fecha y horario",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: false,
      currentMessage: unknownGuests,
      history: [{ role: "assistant", content: "¿Cuántos invitados tienen contemplados?" }],
    });
    assert.ok(!/cu[aá]ntos|cu[aá]nta gente|para cu[aá]ntas/i.test(closing), closing);
    assert.ok(/ya tengo todo|equipo|cotizaci/i.test(closing), closing);
  });

  // ─── 132. A15197 Milka — carpas reales + medidas obligatorias ───
  await test("132. A15197 — tipos reales de carpa y medidas obligatorias antes del cierre", () => {
    const carpaInfo = buildGuardServiceAck(
      "Quiero información y disponibilidad de una carpa bonita para jardín"
    );
    for (const option of ["blanca", "negra", "transparente", "domo"]) {
      assert.ok(new RegExp(option, "i").test(carpaInfo), `${option}: ${carpaInfo}`);
    }
    assert.ok(/medidas|largo|ancho/i.test(carpaInfo), carpaInfo);
    assert.ok(!/Cathedral|Catedral|Pir[aá]mide|Planas?/i.test(carpaInfo), carpaInfo);

    const completeWithoutDims = emptyExtracted({
      nombre: "Milka",
      correo: "orisrs.13@gmail.com",
      tipo_evento: "cumpleaños",
      requerimientos_evento: "Carpas — pequeña y bonita para jardín",
      direccion_evento: "Chalco",
      fecha_horario: "este sábado",
      num_invitados: 15,
      presupuesto: 1,
    });
    const allCore = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Número de invitados",
      "Presupuesto (MXN)",
    ]);
    const blockedClose = runGuards({
      aiResponse:
        "Perfecto, ya tengo todo. Le paso esta información al equipo para preparar la cotización.",
      extracted: completeWithoutDims,
      filledSet: allCore,
      readyForClosing: true,
      currentMessage: "Lo más barato que se pueda",
      history: [
        {
          role: "assistant",
          content:
            "Manejamos carpas blancas, negras, transparentes y tipo domo. ¿Qué medidas aproximadas necesitas?",
        },
        { role: "user", content: "Algo pequeñito y bonito" },
      ],
    });
    assert.ok(/medidas|largo|ancho|área.*cubrir/i.test(blockedClose), blockedClose);
    assert.ok(!/ya tengo todo|preparar.*cotizaci[oó]n/i.test(blockedClose), blockedClose);

    const withDims = runGuards({
      aiResponse:
        "Perfecto, ya tengo todo. Le paso esta información al equipo para preparar la cotización.",
      extracted: completeWithoutDims,
      filledSet: new Set(allCore),
      readyForClosing: true,
      currentMessage: "De 3 x 4",
      history: [
        {
          role: "assistant",
          content: "¿Qué medidas aproximadas debe tener la carpa (largo × ancho)?",
        },
      ],
    });
    assert.ok(/3\s*m?\s*x\s*4|ya tengo todo|cotizaci[oó]n/i.test(withDims), withDims);
    assert.ok(!/¿[^?]*medidas aproximadas/i.test(withDims), withDims);

    const tarimaWithoutDims = runGuards({
      aiResponse:
        "Perfecto, ya tengo todo. El equipo preparará tu cotización de tarima.",
      extracted: emptyExtracted({
        ...completeWithoutDims,
        requerimientos_evento: "Tarima para evento",
      }),
      filledSet: new Set(allCore),
      readyForClosing: true,
      currentMessage: "Prefiero que me propongan",
    });
    assert.ok(/medidas|largo|ancho/i.test(tarimaWithoutDims), tarimaWithoutDims);
    assert.ok(!/ya tengo todo/i.test(tarimaWithoutDims), tarimaWithoutDims);

    assert.equal(parseInvitadosFromText("15 aprox"), "15");
    const noGuestRepeat = runGuards({
      aiResponse: "¿Cuántos invitados esperas aproximadamente?",
      extracted: completeWithoutDims,
      filledSet: new Set(allCore),
      readyForClosing: true,
      currentMessage: "15 aprox",
    });
    assert.ok(!/cu[aá]ntos invitados|cu[aá]ntas personas/i.test(noGuestRepeat), noGuestRepeat);
  });

  // ─── 133. A15204 Mauricio — catering/canapés ≠ Mesas y Sillas ───
  await test("133. A15204 — catering/canapés no vuelca mobiliario ni banquete genérico", () => {
    assert.equal(detectProgressiveFamily("Un catering/ canapés"), "gastronomia");
    assert.equal(detectProgressiveFamily("canapés"), "gastronomia");
    assert.equal(detectProgressiveFamily("quiero catering"), "banquete");
    assert.equal(
      resolveProgressiveDetailQuery({
        currentMessage: "Un catering/ canapés",
        serviceHint: "catering",
        history: [],
      }),
      "Canapés"
    );

    const services = parseServicesFromText("Un catering/ canapés");
    assert.ok(services.includes("Canapés"), services.join(","));

    refreshLucyInfoPriceCache([
      {
        title: "Mesas-y-Sillas-Bodasesor-2026-compressed",
        content:
          "RENTA DE MOBILIARIO Mesas Sillas Barras 4 estilos para tu servicio de bar ¿Por qué Bodasesor? Más de 20 combinaciones de mobiliario Colección Vintage Tiffany $320",
      },
      {
        title: "Canapes-bodasesor-2026",
        content:
          "Canapés Premium. Estación de bocadillos finos para recepción. Incluye chef, montaje y vajilla. Premium $450 por persona.",
      },
      {
        title: "Banquete-Formal-Bodasesor-2026",
        content: "Banquete Formal 3 tiempos Tradicional $830 por persona. Meseros y vajilla.",
      },
    ]);

    for (const q of [
      "Un catering/ canapés",
      "canapés",
      "Canapés",
      "catering canapés",
      "Hola, me interesa cotizar: Un catering/ canapés",
    ]) {
      const detail = buildLucyInfoInclusionReply(q);
      assert.ok(detail, `debe haber detalle para: ${q}`);
      assert.ok(/Canapes/i.test(detail!), detail!);
      assert.ok(/bocadillo|chef|Premium/i.test(detail!), detail!);
      assert.ok(
        !/Mesas\s*y\s*Sillas|mobiliario|Tiffany|Colecci[oó]n Vintage/i.test(detail!),
        detail!
      );
    }

    const ack = buildGuardServiceAck("Un catering/ canapés");
    assert.ok(/[Cc]anap/i.test(ack), ack);
    assert.ok(!/Mesas\s*y\s*Sillas|periqueras|Tiffany|¿Qué es lo que buscas/i.test(ack), ack);

    const dumped = runGuards({
      aiResponse:
        "Según el catálogo que ya tenemos de *Mesas y Sillas Bodasesor*:\n\nstilos para tu servicio de bar ¿Por qué Bodasesor? Más de 20 combinaciones de mobiliario Mesas, sillas Tiffany.\n\n¿Te late este nivel o quieres que te detalle otro?",
      extracted: emptyExtracted({
        nombre: "Mauricio Glz",
        correo: "mauriciogq84@gmail.com",
        tipo_evento: "boda civil",
        num_invitados: 80,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "Un catering/ canapés",
      history: [
        { role: "assistant", content: "¿Qué servicios te gustaría cotizar?" },
      ],
    });
    assert.ok(/[Cc]anap/i.test(dumped), dumped.slice(0, 500));
    assert.ok(
      !/Mesas\s*y\s*Sillas|20 combinaciones de mobiliario|Colecci[oó]n Vintage/i.test(dumped),
      dumped.slice(0, 500)
    );
  });

  // ─── 134. Sin meta "No confundir…" al cliente (todos los servicios) ───
  await test("134. WhatsApp no dice 'No confundir con…' al cliente", () => {
    const stripped = stripClientServiceConfusionNotes(
      "Perfecto — anoto *Actos de circo / animación* para tu cumpleaños. " +
        "Es entretenimiento / show en vivo: el equipo confirma disponibilidad, formato y propuesta. " +
        "No confundir con banquete ni catering.\n\n¿Ya hay día definido?"
    );
    assert.ok(/circo|entretenimiento|disponibilidad/i.test(stripped), stripped);
    assert.ok(!/no\s+confundir/i.test(stripped), stripped);
    assert.ok(!/banquete ni catering/i.test(stripped), stripped);

    for (const msg of [
      "Actos de circo / animación para mi cumpleaños",
      "Photo Booth",
      "bailarinas para XV",
      "robots LED",
      "batucada",
    ]) {
      const out = runGuards({
        aiResponse:
          "Perfecto. No confundir con banquete ni catering. ¿Qué fecha tienes?",
        extracted: emptyExtracted({ nombre: "Ana", tipo_evento: "cumpleaños" }),
        filledSet: new Set(["Nombre del cliente", "Tipo de evento"]),
        readyForClosing: false,
        currentMessage: msg,
        history: [],
      });
      assert.ok(!/no\s+confundir/i.test(out), `${msg} → ${out.slice(0, 400)}`);
      assert.ok(!/no\s+es\s+banquete\s+ni\s+catering/i.test(out), `${msg} → ${out.slice(0, 400)}`);
    }
  });

  // ─── 135. A15205 Mariel — comidas ≠ banquete Formal/Mexicano de entrada ───
  await test("135. A15205 — cotizar comidas pregunta formal vs casual", () => {
    assert.ok(isVagueFoodTerm("Quería cotizar comidas para un evento en CONADE"));
    assert.ok(isVagueFoodTerm("cotizar comidas"));
    assert.ok(isVagueFoodTerm("comidas"));
    assert.ok(isVagueFoodTerm("Busco comida"));
    assert.ok(!isVagueFoodTerm("banquete formal 3 tiempos"));
    assert.ok(!isVagueFoodTerm("Necesitamos desayuno, comida y cena"));
    assert.equal(parseTipoEventoFromText("campamento para atletas"), "campamento");

    const reply = runGuards({
      aiResponse: "Claro. En *banquete* manejamos Formal, Mexicano, Kosher…",
      extracted: emptyExtracted({ nombre: "Mariel" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "Quería cotizar comidas para un evento en CONADE",
      history: [],
      whatsappDisplayName: "Mariel Casillas",
    });
    assert.ok(/formal|casual|catering|banquete/i.test(reply), reply.slice(0, 500));
    assert.ok(/casual|barra de pastas|taquiza|pizzas/i.test(reply), reply.slice(0, 500));
    assert.ok(!/Formal\s*\(3 o 4 tiempos\)/i.test(reply), reply.slice(0, 500));
    assert.ok(!/Kosher|Navide[nñ]o/i.test(reply), reply.slice(0, 500));

    const first = buildFirstInteractionMessage({
      extracted: emptyExtracted(),
      filledSet: new Set(),
      history: [],
      currentMessage: "Quería cotizar comidas para un evento en CONADE",
      entityId: 1,
    });
    assert.ok(/formal|casual/i.test(first), first.slice(0, 500));
    assert.ok(!/Formal\s*\(3 o 4 tiempos\)/i.test(first), first.slice(0, 500));
  });

  // ─── 136. A15210 Hernán — desayuno temático + corrección ubicación + no año=presupuesto ───
  await test("136. A15210 — desayuno mexicano, patio y presupuesto≠2026", () => {
    const services = parseServicesFromText(
      "Desayuno temático mexicano para 40 personas en Torre Latitud Polanco, piso 15"
    );
    assert.ok(services.some((s) => /^Desayuno$/i.test(s)), JSON.stringify(services));
    assert.ok(
      !services.some((s) => /Banquete\s+Mexicano/i.test(s)),
      `no Banquete Mexicano: ${JSON.stringify(services)}`
    );
    assert.ok(parseServicesFromText("banquete mexicano").includes("Banquete Mexicano"));
    assert.ok(parseServicesFromText("mexicano 4 tiempos").includes("Banquete Mexicano"));
    assert.ok(parseServicesFromText("mexicano").includes("Banquete Mexicano"));

    assert.equal(parsePresupuestoFromText("2026"), null);
    assert.equal(parsePresupuestoFromText("2026", { askedField: "presupuesto" }), null);
    assert.equal(
      parsePresupuestoFromText(
        "no es en el piso 15, es en otra ubicación, pero también es en polanco",
        { askedField: "presupuesto" }
      ),
      null
    );

    assert.ok(clientCorrectsLocation("Me equivoqué, es un patio"));
    assert.ok(clientCorrectsLocation("no es en el piso 15, es en otra ubicación"));
    assert.ok(isVenueSpaceDetail("techado"));

    const prev = "Torre Latitud Polanco, piso 15";
    const patio = applyLocationCorrectionToAddress(prev, "Me equivoqué, es un patio");
    assert.ok(patio && /patio/i.test(patio) && /polanco/i.test(patio), patio ?? "null");
    assert.ok(patio && !/piso\s*15/i.test(patio), patio);
    const techado = applyLocationCorrectionToAddress(patio, "techado");
    assert.ok(techado && /patio\s+techado/i.test(techado), techado ?? "null");
    const otra = applyLocationCorrectionToAddress(
      prev,
      "no es en el piso 15, es en otra ubicación, pero también es en polanco"
    );
    assert.ok(otra && /polanco/i.test(otra) && !/piso\s*15/i.test(otra), otra ?? "null");
    assert.ok(shouldReplaceCrmDireccion(prev, otra));

    const lines = [`- Lugar/dirección del evento: ${prev}`, "- Presupuesto (MXN): pendiente"];
    const filled = new Set(["Lugar/dirección del evento"]);
    const extracted = emptyExtracted({
      nombre: "Hernán",
      direccion_evento: prev,
      requerimientos_evento: "Desayuno",
    });
    assert.ok(
      applyLocationCorrectionToCrm(
        lines,
        filled,
        extracted,
        "Me equivoqué, es un patio"
      )
    );
    assert.ok(/patio/i.test(crmStoredValue(lines, "Lugar/dirección del evento") ?? ""));
    assert.ok(!/piso\s*15/i.test(crmStoredValue(lines, "Lugar/dirección del evento") ?? ""));

    const reply = runGuards({
      aiResponse: "Te detallo el Nivel 1 del desayuno…",
      extracted: emptyExtracted({
        nombre: "Hernán",
        direccion_evento: prev,
        requerimientos_evento: "Desayuno",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Lugar/dirección del evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "Me equivoqué, es un patio",
      history: [
        {
          role: "assistant",
          content: "¿Tienes un presupuesto aproximado para el desayuno?",
        },
      ],
      whatsappDisplayName: "Hernán Peralta",
    });
    assert.ok(/patio|ubicaci|direcci|lugar/i.test(reply), reply.slice(0, 500));
    assert.ok(!/Nivel\s*1|presupuesto aproximado/i.test(reply), reply.slice(0, 500));
  });

  // ─── 137. A15212 Sandra — Puestos nivel 2 ≠ taquiza $750 + correo referencial ───
  await test("137. A15212 — puestos Servicio completo, no taquiza; correo al mismo", () => {
    const puestosMenu = [
      "Para *Puestos de comida* manejamos estos niveles:",
      "",
      "1. *Por pieza* — $38.00 /pp",
      "2. *Servicio completo* — $300.00 /pp",
      "",
      "¿Quieres que te dé detalles de alguno?",
    ].join("\n");

    const parsed = parseNumberedNivelesFromAssistant(puestosMenu);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[1]?.label, "Servicio completo");
    assert.equal(extractNumberedNivelFromLastAssistant("2", puestosMenu), "Servicio completo");
    assert.equal(
      extractNumberedNivelFromLastAssistant("2. Servicio completo", puestosMenu),
      "Servicio completo"
    );
    assert.equal(
      extractCatalogNivelFromText("2. Servicio completo", puestosMenu),
      "Servicio completo"
    );
    assert.ok(isCatalogLevelSelection("2. Servicio completo", puestosMenu));
    assert.ok(isCatalogLevelSelection("2", puestosMenu));
    // No mapear a "tradicional" (bug taquiza $750).
    assert.notEqual(extractCatalogNivelFromText("2", puestosMenu), "tradicional");

    assert.ok(isReferentialPriorAnswer("Al mismo que ya te he enviado"));
    assert.ok(isReferentialPriorAnswer("al mismo"));
    assert.ok(clientWantsFoodOnlyQuote("Solo dame cotización de los antojitos por favor"));
    assert.equal(
      preferPrimaryCatalogService(["Puestos de Comida", "Comida", "Bocadillos"]),
      "Puestos de Comida"
    );

    const levelReply = runGuards({
      aiResponse:
        "Excelente. Para el servicio completo de taquiza, el costo es de $750 por persona…",
      extracted: emptyExtracted({
        nombre: "Sandra Carbajal",
        correo: "carbajalsandra@hotmail.com",
        tipo_evento: "cumpleaños",
        num_invitados: 70,
        direccion_evento: "Roma Norte",
        requerimientos_evento: "Puestos de Comida",
        presupuesto: "Sin definir (cliente pidió que propongamos)",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Número de invitados",
        "Lugar/dirección del evento",
        "Requerimientos o servicios",
        "Presupuesto (MXN)",
      ]),
      readyForClosing: false,
      currentMessage: "2. Servicio completo",
      history: [
        { role: "user", content: "Solo dame cotización de los antojitos por favor" },
        { role: "assistant", content: puestosMenu },
      ],
      whatsappDisplayName: "Sandra Carbajal",
    });
    assert.ok(!/taquiza|\$\s*750/i.test(levelReply), levelReply.slice(0, 600));
    assert.ok(
      /Puestos|Servicio completo|\$\s*300|anoto/i.test(levelReply),
      levelReply.slice(0, 600)
    );

    const emailReply = runGuards({
      aiResponse: "¿Me compartes un correo para enviarte los detalles?",
      extracted: emptyExtracted({
        nombre: "Sandra Carbajal",
        direccion_evento: "Roma Norte",
        requerimientos_evento: "Puestos de Comida",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Lugar/dirección del evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "Al mismo que ya te he enviado",
      history: [
        { role: "user", content: "carbajalsandra@hotmail.com" },
        {
          role: "assistant",
          content: "Perfecto, Sandra. ¿Me compartes un correo para enviarte los detalles de la cotización?",
        },
      ],
      whatsappDisplayName: "Sandra Carbajal",
    });
    assert.ok(!/me compartes un correo/i.test(emailReply), emailReply.slice(0, 500));
    assert.ok(!/Mucho gusto,\s*Sandra\.\s*Mucho gusto/i.test(emailReply), emailReply.slice(0, 400));

    // Con Puestos ya en CRM, "comida para la tornafiesta" no reabre banquete/taquiza.
    const vague = runGuards({
      aiResponse: "Según el evento podemos ofrecerte banquete, taquiza o brunch —",
      extracted: emptyExtracted({
        nombre: "Sandra Carbajal",
        correo: "carbajalsandra@hotmail.com",
        requerimientos_evento: "Puestos de Comida",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage:
        "Es una fiesta de 50 años y busco comida para la torna fiesta, que sería a las 9 de la noche",
      history: [
        { role: "user", content: "Hola, me interesa cotizar: Puestos de Antojitos para Evento" },
        { role: "assistant", content: "Vi que te interesa cotizar Puestos de Comida." },
      ],
      whatsappDisplayName: "Sandra Carbajal",
    });
    assert.ok(!/\btaquiza\b.*\bbrunch\b|\bbanquete,\s*taquiza/i.test(vague), vague.slice(0, 500));
  });

  // ─── 138. V9.13 — prompt maestro: chat natural + embudo + memoria ───
  await test("138. V9.13 — intro, embudo natural (correo tarde) y no repregunta", () => {
    assert.ok(/Buen d[ií]a/i.test(LUCY_INTRO), LUCY_INTRO);
    assert.ok(/Bodasesor/i.test(LUCY_INTRO), LUCY_INTRO);
    assert.ok(!/tu agente virtual(?!\s+de\s+Bodasesor)/i.test(LUCY_INTRO));

    // Embudo: tras nombre → tipo (no correo).
    assert.equal(
      getNextPendingField(emptyExtracted({ nombre: "Ana" }), new Set(["Nombre del cliente"])),
      "tipo_evento"
    );
    assert.equal(
      getNextPendingField(
        emptyExtracted({
          nombre: "Ana",
          tipo_evento: "boda",
          requerimientos_evento: "banquete",
          fecha_horario: "20 de septiembre",
          direccion_evento: "Coyoacán CDMX",
        }),
        new Set([
          "Nombre del cliente",
          "Tipo de evento",
          "Requerimientos o servicios",
          "Fecha y horario",
          "Lugar/dirección del evento",
        ])
      ),
      "invitados"
    );
    assert.equal(
      getNextPendingField(
        emptyExtracted({
          nombre: "Ana",
          tipo_evento: "boda",
          requerimientos_evento: "banquete",
          fecha_horario: "20 de septiembre",
          direccion_evento: "Coyoacán CDMX",
          num_invitados: 80,
        }),
        new Set([
          "Nombre del cliente",
          "Tipo de evento",
          "Requerimientos o servicios",
          "Fecha y horario",
          "Lugar/dirección del evento",
          "Número de invitados",
        ])
      ),
      "correo"
    );

    const first = buildFirstInteractionMessage({
      extracted: emptyExtracted(),
      filledSet: new Set(),
      history: [],
      currentMessage: "Hola",
      entityId: 15220,
    });
    assert.ok(/¡?Hola!?.*Buen d[ií]a.*Lucy.*Bodasesor/i.test(first), first.slice(0, 300));
    assert.ok(/cu[aá]l es tu nombre|c[oó]mo te llamas|regalas tu nombre/i.test(first), first);
    const questions = (first.match(/\?/g) ?? []).length;
    assert.ok(questions <= 2, `demasiadas preguntas: ${questions} — ${first.slice(0, 400)}`);

    const nameTurn = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({ nombre: "Sandra Carbajal" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "Sandra Carbajal",
      history: [
        {
          role: "assistant",
          content: `${LUCY_INTRO} ¿Cuál es tu nombre?`,
        },
      ],
    });
    assert.ok(/¡?Mucho gusto,\s*Sandra/i.test(nameTurn), nameTurn.slice(0, 300));
    assert.ok(
      !/Perfecto,\s*Sandra\.\s*¡?Mucho gusto,\s*Sandra/i.test(nameTurn),
      `sin doble saludo: ${nameTurn.slice(0, 300)}`
    );
    assert.ok(!mensajeAsksForField(nameTurn, "correo"), nameTurn.slice(0, 400));
    assert.ok((nameTurn.match(/\?/g) ?? []).length <= 2, nameTurn.slice(0, 400));

    // Memoria: boda + fecha ya dadas → no repregunta tipo.
    const multi = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({
        nombre: "Ana",
        tipo_evento: "boda",
        fecha_horario: "20 de septiembre",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Fecha y horario"]),
      readyForClosing: false,
      currentMessage: "Hola, soy Ana, es para mi boda el 20 de septiembre",
      history: [{ role: "assistant", content: `${LUCY_INTRO} ¿Cuál es tu nombre?` }],
    });
    assert.ok(/¡?Mucho gusto,\s*Ana/i.test(multi), multi.slice(0, 300));
    assert.ok(!mensajeAsksForField(multi, "tipo_evento"), multi.slice(0, 400));
    assert.ok(!mensajeAsksForField(multi, "fecha"), multi.slice(0, 400));

    assert.ok(detectEmailRefusal(["Prefiero no dar mi correo por ahora"]));
    assert.ok(detectEmailRefusal(["Prefiero no dar correo"]));

    const refuse = emailRefusalAckMessage(
      emptyExtracted({ nombre: "Sandra" }),
      [{ role: "assistant", content: "¿A qué correo te mando la información?" }],
      "Prefiero no dar mi correo por ahora",
      1,
      new Set(["Nombre del cliente"])
    );
    assert.ok(/sin problema/i.test(refuse), refuse);
    assert.ok(/este chat|por aqu[ií]/i.test(refuse), refuse);
    assert.ok(!/necesito tu correo|es obligatorio/i.test(refuse), refuse);

    const refuseLive = runGuards({
      aiResponse: "¿A qué correo te mando la información?",
      extracted: emptyExtracted({
        nombre: "Sandra",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "Banquete",
        fecha_horario: "15 de agosto",
        direccion_evento: "Narvarte CDMX",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Fecha y horario",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: "Prefiero no dar mi correo por ahora",
      emailRefusedThisTurn: true,
      history: [{ role: "assistant", content: "¿Me compartes un correo para enviarte los detalles?" }],
    });
    assert.ok(/sin problema/i.test(refuseLive), refuseLive.slice(0, 300));
    assert.ok(!mensajeAsksForField(refuseLive, "correo"), refuseLive.slice(0, 300));
  });

  // ─── 137. A15251 — inclusiones puntuales en TODAS las ramas/servicios ───
  await test("137. A15251 — ¿incluye X? desde catálogo (cualquier servicio); no handoff por persona", () => {
    assert.equal(clientAsksSpecificInclusionItem("Inclue bebidas?"), "bebidas");
    assert.equal(clientAsksSpecificInclusionItem("Incluye bebidas?"), "bebidas");
    assert.equal(clientAsksSpecificInclusionItem("el banquete incluye meseros?"), "meseros");
    assert.ok(
      clientAsksInclusion("Quiero saber si el paquete por persona de canapes incluye bebidas")
    );
    assert.equal(
      clientAsksForHumanAdvisor(
        "Quiero saber si el paquete por persona de canapes incluye bebidas"
      ),
      false,
      "por persona ≠ pedir asesor humano"
    );

    const services = [
      "Canapés",
      "Bocadillos",
      "Taquiza",
      "Coffee Break",
      "Banquete Formal",
    ];
    for (const svc of services) {
      const reply = buildSpecificInclusionItemReply("¿Incluye bebidas?", svc);
      assert.ok(reply, `[${svc}] debe responder inclusión`);
      assert.ok(
        new RegExp(svc.split(/\s+/)[0]!, "i").test(reply!) || /bebidas/i.test(reply!),
        `[${svc}] sin nombre/ítem: ${reply!.slice(0, 220)}`
      );
      assert.ok(
        /S[ií] incluye|No incluye|Sobre \*bebidas\*|barra de bebidas|cat[aá]logo/i.test(reply!),
        `[${svc}] formato: ${reply!.slice(0, 280)}`
      );
    }

    const canapes = buildSpecificInclusionItemReply("Inclue bebidas?", "Canapés, Bocadillos");
    assert.ok(canapes && /Solo Alimentos/i.test(canapes), canapes?.slice(0, 300));
    assert.ok(/No incluye/i.test(canapes!), canapes!.slice(0, 300));
    assert.ok(/S[ií] incluye/i.test(canapes!), canapes!.slice(0, 400));
    assert.ok(
      /Solo Alimentos[\s\S]{0,80}\$320|No incluye[\s\S]{0,120}Solo Alimentos/i.test(canapes!),
      `Solo Alimentos sin bebidas: ${canapes!.slice(0, 400)}`
    );

    const live = runGuards({
      aiResponse: "¿Quieres que te dé detalles de alguno?",
      extracted: emptyExtracted({
        nombre: "Gio García",
        tipo_evento: "inauguración de oficinas",
        requerimientos_evento: "Canapés, Bocadillos",
        num_invitados: 25,
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "Quiero saber si el paquete por persona de canapes incluye bebidas",
      history: [
        {
          role: "user",
          content: "inauguración oficinas, bocadillos y canapes, 25 personas",
        },
        {
          role: "assistant",
          content:
            "Perfecto, veo que necesitas Canapés y Bocadillos.\n¿Quieres que te dé detalles de alguno?\n¿Para cuándo sería el evento?",
        },
      ],
    });
    assert.ok(/bebidas/i.test(live) && /Solo Alimentos|Tradicional|No incluye|S[ií] incluye/i.test(live), live.slice(0, 500));
    assert.ok(!/gastronom[ií]a manejamos varias opciones/i.test(live), live.slice(0, 300));
    assert.ok(!/hablar con un asesor|Humano Trabaja/i.test(live), live.slice(0, 200));

    // Otra rama: taquiza + meseros
    const taquizaLive = runGuards({
      aiResponse: "Claro.",
      extracted: emptyExtracted({
        nombre: "Ana",
        tipo_evento: "XV años",
        requerimientos_evento: "Taquiza",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "La taquiza incluye meseros?",
      history: [
        { role: "user", content: "quiero taquiza" },
        { role: "assistant", content: "Perfecto, manejamos Taquiza. ¿Quieres que te dé detalles de alguno?" },
      ],
    });
    assert.ok(
      /meseros/i.test(taquizaLive) && !/gastronom[ií]a manejamos/i.test(taquizaLive),
      taquizaLive.slice(0, 450)
    );
  });

  // ─── 138. A15286 — pregunta concreta primero (todas las ramas) ───
  await test("138. A15286 — fotos/luz/capacidad/catálogo typo; no CTA vacío ni borrar invitados", () => {
    assert.ok(clientAsksForCatalog("CTALOGO DE SILLAS"), "typo CTALOGO");
    assert.ok(clientAsksForCatalog("catalgo de mesas"), "typo catalgo");
    assert.ok(clientAsksServiceInfo("si la carpa cuenta con luz"));
    assert.ok(clientAsksConcreteProductQuestion("Fotos de lo solicitado y si la carpa cuenta con luz"));
    assert.ok(clientAsksConcreteProductQuestion("3 MESAS POR CARPA???"));
    assert.ok(clientAsksCapacityLayout("3 MESAS POR CARPA???"));
    assert.ok(clientAsksForPhotos("Fotos de lo solicitado y si la carpa cuenta con luz"));
    assert.ok(clientAsksAboutLighting("Fotos de lo solicitado y si la carpa cuenta con luz"));
    assert.equal(
      clientAsksConcreteProductQuestion("¿Cuentan con carpas transparentes?"),
      false,
      "disponibilidad genérica no es pregunta-concreta A15286"
    );

    const filledBase = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Fecha y horario",
      "Lugar/dirección del evento",
    ]);
    const extractedBase = emptyExtracted({
      nombre: "Jose Luis",
      tipo_evento: "Inauguración de empresa",
      requerimientos_evento: "Mobiliario, Carpas",
      fecha_horario: "Viernes 4 de septiembre, 6 de la tarde",
      direccion_evento: "Tixcacal Opichen",
      num_invitados: 300,
    });

    const fotos = runGuards({
      aiResponse: "¿Qué medidas aproximadas necesitas?",
      extracted: { ...extractedBase },
      filledSet: new Set(filledBase),
      readyForClosing: false,
      currentMessage: "Fotos de lo solicitado y si la carpa cuenta con luz",
      history: [
        { role: "user", content: "30 MESAS REDONDAS CON SU MANTEL" },
        { role: "user", content: "300 SILLAS" },
        { role: "user", content: "TOLDOS" },
        {
          role: "assistant",
          content:
            "Sí, manejamos carpas blancas, negras, transparentes y tipo domo. ¿Qué medidas aproximadas necesitas?",
        },
      ],
    });
    assert.ok(
      /foto|cat[aá]logo|bodasesor\.com\/catalogos|iluminaci|luz|confirmo con/i.test(fotos),
      fotos.slice(0, 500)
    );
    assert.ok(
      !/^[\s\S]{0,40}¿Qu[eé] medidas aproximadas/i.test(fotos) ||
        /foto|luz|iluminaci|cat[aá]logo/i.test(fotos),
      `no solo medidas: ${fotos.slice(0, 400)}`
    );

    const capacidad = runGuards({
      aiResponse: "Perfecto. ¿Seguimos con el siguiente dato del evento?",
      extracted: { ...extractedBase },
      filledSet: new Set(filledBase),
      readyForClosing: false,
      currentMessage: "3 MESAS POR CARPA???",
      history: [
        { role: "user", content: "CARPA BLANCA PARA CUBRIR LAS 30 MESAS" },
        {
          role: "assistant",
          content:
            "Te dejo el catálogo general:\nhttps://bodasesor.com/catalogos\n\n¿Quieres que te mande el catálogo con más detalle?",
        },
      ],
    });
    assert.ok(
      /medidas|acomodo|cab[eé]n|confirmo|equipo/i.test(capacidad),
      capacidad.slice(0, 450)
    );
    assert.ok(
      !/¿Seguimos con el siguiente dato del evento\?/i.test(capacidad),
      capacidad.slice(0, 300)
    );
    assert.ok(
      !/anoto \*carpas\* y \*mobiliario\*/i.test(capacidad),
      capacidad.slice(0, 300)
    );

    const catalogo = runGuards({
      aiResponse: "¿De cuál te paso detalle, o te mando el catálogo de mesas y sillas?",
      extracted: { ...extractedBase },
      filledSet: new Set(filledBase),
      readyForClosing: false,
      currentMessage: "CTALOGO DE SILLAS",
      history: [
        {
          role: "assistant",
          content:
            "En *sillas* manejamos Tiffany, Crossback… ¿te mando el catálogo de mesas y sillas?",
        },
      ],
    });
    assert.ok(/bodasesor\.com\/catalogos/i.test(catalogo), catalogo.slice(0, 400));
    assert.ok(
      !/¿Seguimos con el siguiente dato del evento\?/i.test(catalogo),
      catalogo.slice(0, 300)
    );

    // Historial con "300 SILLAS" NO debe borrar invitados=300 si también hay "300 personas".
    const invKeep = runGuards({
      aiResponse: "¿Cuántos invitados tienen contemplados?",
      extracted: emptyExtracted({
        nombre: "Jose Luis",
        tipo_evento: "Inauguración",
        requerimientos_evento: "Mobiliario, Carpas",
        num_invitados: 300,
        correo: "Inventariosmda@livek.mx",
      }),
      filledSet: new Set([
        ...filledBase,
        "Correo electrónico",
        "Número de invitados",
      ]),
      readyForClosing: false,
      currentMessage: "Gracias",
      history: [
        { role: "user", content: "300 SILLAS" },
        { role: "user", content: "VIERNES 4 DE SEPTIEMBRE PARA 300 PERSONAS" },
        { role: "user", content: "300 personas" },
        { role: "assistant", content: "Perfecto. ¿Cuántos invitados tienen contemplados?" },
      ],
    });
    assert.ok(
      !mensajeAsksForField(invKeep, "invitados"),
      `no re-preguntar invitados: ${invKeep.slice(0, 350)}`
    );
  });

  // ─── 139. A15296 — centros de mesa + imagen: embudo, no dump niveles ───
  await test("139. A15296 — centros+foto anota qty y pide embudo; no mesas-y-sillas", () => {
    const caption =
      "disculpe me podría ayudar con cotización para centros de mesa serían 20 tengo pensado algo así";
    assert.equal(parseCentrosDeMesaRequirement(caption), "Centros de mesa (20)");
    assert.ok(parseServicesFromText(caption).some((s) => /Centros de mesa \(20\)/i.test(s)));
    assert.ok(
      !clientAsksConcreteProductQuestion(caption),
      "caption solo no es pedido de fotos"
    );

    const visionTurn = formatImageTurnText(
      {
        intent: "montaje_referencia",
        internalDescription: "Centro de mesa con aro, globos y flores.",
        clientReply:
          "¡Qué lindo detalle! Me encanta el estilo del aro con los globos y las flores. Ya lo anoté como referencia para tu evento, ¿te gustaría que lo incluyamos en la cotización de tu decoración?",
      },
      caption
    );
    // Vision dice "tu foto" / "foto" en la respuesta — no debe activar A15286.
    assert.ok(
      !clientAsksForPhotos(visionTurn),
      "marcadores Vision no cuentan como pedido de fotos"
    );
    assert.ok(!clientAsksConcreteProductQuestion(visionTurn));

    assert.ok(
      !/mesas-y-sillas/i.test(getCatalogWebUrlForQuery("centros de mesa") ?? ""),
      "slug centros ≠ mesas-y-sillas"
    );
    const inclusion = resolveCatalogInclusionReply("centros de mesa serían 20", "Centros de mesa");
    assert.ok(inclusion && /centros de mesa|floral/i.test(inclusion), inclusion?.slice(0, 200));
    assert.ok(
      !/detalle de lo que incluye cada nivel/i.test(inclusion!),
      inclusion!.slice(0, 200)
    );

    const extracted = emptyExtracted({
      nombre: "Alejandra",
      tipo_evento: "bautizo",
    });
    const filled = new Set(["Nombre del cliente", "Tipo de evento"]);
    const live = runGuards({
      aiResponse: "El detalle de lo que incluye cada nivel está en el catálogo.",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: visionTurn,
      history: [
        { role: "user", content: "Quiero hacer una cotizacion" },
        { role: "assistant", content: "¡Hola! ¿Me regalas tu nombre?" },
        { role: "user", content: "buen dia Alejandra" },
        { role: "assistant", content: "¡Mucho gusto, Alejandra! ¿Qué van a celebrar?" },
        { role: "user", content: "es un bautizo" },
        {
          role: "assistant",
          content: "¡Qué buena noticia! ¿Qué te gustaría revisar primero?",
        },
      ],
    });
    assert.ok(
      /aro|globos|flores|referencia|decoraci|centros/i.test(live),
      live.slice(0, 500)
    );
    assert.ok(
      !/detalle de lo que incluye cada nivel/i.test(live),
      live.slice(0, 400)
    );
    assert.ok(!/mesas-y-sillas/i.test(live), live.slice(0, 400));
    assert.ok(
      mensajeAsksForField(live, "fecha") || /para cu[aá]ndo|fecha/i.test(live),
      `debe pedir fecha del embudo: ${live.slice(0, 450)}`
    );
    assert.ok(
      /Centros de mesa/i.test(extracted.requerimientos_evento ?? ""),
      extracted.requerimientos_evento ?? "(sin req)"
    );
    assert.ok(
      /\(20\)/.test(extracted.requerimientos_evento ?? ""),
      `qty 20: ${extracted.requerimientos_evento}`
    );

    // Regresión A15286: pedido real de fotos sigue activo.
    assert.ok(
      clientAsksConcreteProductQuestion("Fotos de lo solicitado y si la carpa cuenta con luz")
    );
  });

  // ─── 140. Imagen → embudo en TODOS los servicios (no solo centros) ───
  await test("140. imagen+caption → embudo en sushi/taquiza/banquete/carpas/etc.", () => {
    const cases: Array<[string, RegExp]> = [
      ["barra de sushi, algo así", /sushi/i],
      ["quiero taquiza, mira esta foto", /taquiza/i],
      ["banquete formal 3 tiempos, así", /banquete/i],
      ["carpa blanca, así", /carpas?/i],
      ["coffee break, así lo imagino", /coffee/i],
      ["centros de mesa serían 12", /centros de mesa \(12\)/i],
    ];
    for (const [caption, reqRe] of cases) {
      const turn = formatImageTurnText(
        {
          intent: "montaje_referencia",
          internalDescription: "ref",
          clientReply: "¡Qué lindo! Ya anoté tu referencia.",
        },
        caption
      );
      const extracted = emptyExtracted({
        nombre: "Ana",
        tipo_evento: "boda",
      });
      const live = runGuards({
        aiResponse: "El detalle de lo que incluye cada nivel está en el catálogo.",
        extracted,
        filledSet: new Set(["Nombre del cliente", "Tipo de evento"]),
        readyForClosing: false,
        currentMessage: turn,
        history: [{ role: "assistant", content: "¿Qué van a celebrar?" }],
      });
      assert.ok(
        !/detalle de lo que incluye cada nivel|Según el catálogo que ya tenemos/i.test(live),
        `[${caption}] dump: ${live.slice(0, 220)}`
      );
      assert.ok(
        mensajeAsksForField(live, "fecha") || /fecha|cu[aá]ndo/i.test(live),
        `[${caption}] embudo: ${live.slice(0, 220)}`
      );
      assert.ok(
        reqRe.test(extracted.requerimientos_evento ?? ""),
        `[${caption}] req=${extracted.requerimientos_evento}`
      );
    }
  });

  // ─── 141. A15295 — declinar alimentos/comida (Catalina) ───
  await test("141. A15295 — no quiero comida / quítale / typo comoda → quita Alimentos+Pizzas", () => {
    assert.ok(
      clientDeclinesServiceFamilies(
        "Peor quítale la comida por qué les voy a dar pizza"
      ).includes("alimentos")
    );
    assert.ok(clientDeclinesServiceFamilies("Que no quiero alimentos").includes("alimentos"));
    assert.ok(clientDeclinesServiceFamilies("No pero no quiero comoda").includes("alimentos"));
    assert.ok(
      clientDeclinesServiceFamiliesWithContext("Comida", [
        "No pero no quiero comoda",
      ]).includes("alimentos")
    );
    assert.ok(
      clientDeclinesServiceFamilies("Por qué yo ya les voy a dar").includes("alimentos")
    );

    const stripped = removeDeclinedFamiliesFromRequirements(
      "Mesa de dulces, Decoración, Pizzas, Alimentos",
      ["alimentos"]
    );
    assert.ok(stripped && !/alimento|pizza/i.test(stripped), stripped);
    assert.ok(/dulces|decoraci/i.test(stripped!), stripped);

    assert.ok(looksLikeThemeColorNotLocation("rojo y negro"));
    assert.equal(
      stripThemeColorsFromZona("Estado de México, rojo y negro"),
      "Estado de México"
    );

    // Flujo: CRM ya tiene Alimentos+Pizzas por error → cliente declina → no dump pizza.
    const extracted = emptyExtracted({
      nombre: "Catalina",
      tipo_evento: "cumpleaños",
      requerimientos_evento: "Mesa de dulces, Decoración, Pizzas, Alimentos",
      fecha_horario: "25 de agosto",
      direccion_evento: "Estado de México, rojo y negro",
    });
    const filled = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Fecha y horario",
      "Lugar/dirección del evento",
    ]);
    const live = runGuards({
      aiResponse:
        "¡Claro! *Alimentos* la anoto para tu cotización. Según el catálogo que ya tenemos de *Barra de pizzas Bodasesor*: Tradicional $250...",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Que no quiero alimentos",
      history: [
        { role: "user", content: "El cumpleaños de mi nena" },
        {
          role: "assistant",
          content: "Con gusto te apoyo. ¿Qué te gustaría revisar primero?",
        },
        {
          role: "user",
          content: "Peor quítale la comida por qué les voy a dar pizza",
        },
        {
          role: "assistant",
          content: "Según el catálogo de Barra de pizzas...",
        },
      ],
    });
    assert.ok(
      /no\s+incluimos|no\s+incluyo|\*no\*/i.test(live),
      `ack decline: ${live.slice(0, 300)}`
    );
    assert.ok(
      !/Según el catálogo|Barra de pizzas|anoto Alimentos|anoto \*Alimentos/i.test(live),
      `no dump/re-anotar: ${live.slice(0, 350)}`
    );
    assert.ok(
      !/alimento|pizza/i.test(extracted.requerimientos_evento ?? ""),
      `CRM limpio: ${extracted.requerimientos_evento}`
    );
    assert.ok(
      !/rojo|negro/i.test(extracted.direccion_evento ?? ""),
      `zona sin colores: ${extracted.direccion_evento}`
    );
    assert.ok(
      mensajeAsksForField(live, "correo") || /correo/i.test(live),
      `sigue embudo (correo): ${live.slice(0, 300)}`
    );

    // Typo "comoda" + aclaración "Comida" no re-anota.
    const ex2 = emptyExtracted({
      nombre: "Catalina",
      tipo_evento: "cumpleaños",
      requerimientos_evento: "Decoración, Alimentos",
      fecha_horario: "25 de agosto",
      direccion_evento: "Estado de México condado de Sayavedra",
    });
    const live2 = runGuards({
      aiResponse: "Perfecto, anoto Alimentos.",
      extracted: ex2,
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
        "Fecha y horario",
        "Lugar/dirección del evento",
      ]),
      readyForClosing: false,
      currentMessage: "Comida",
      history: [
        { role: "user", content: "No pero no quiero comoda" },
        { role: "assistant", content: "Perfecto, anoto Alimentos. ¿Correo?" },
      ],
    });
    assert.ok(
      !/alimento|pizza/i.test(ex2.requerimientos_evento ?? ""),
      `typo fix no re-anota: ${ex2.requerimientos_evento}`
    );
    assert.ok(/no\s+incluimos|\*no\*/i.test(live2), live2.slice(0, 250));
  });

  // ─── 142. A15297 — Edna: no filler "siguiente dato"; Sí → embudo real ───
  await test("142. A15297 — Sí tras siguiente-dato / SKU sala+mesa → pregunta real", () => {
    assert.ok(
      assistantAskedVagueEmbudoContinue(
        "Perfecto, Edna. ¿Seguimos con el siguiente dato del evento?"
      )
    );
    assert.ok(
      clientAffirmsEmbudoContinue(
        "Si",
        "Perfecto, Edna. ¿Seguimos con el siguiente dato del evento?"
      )
    );
    assert.ok(
      !clientAffirmsCatalogOffer(
        "Si",
        "Perfecto, Edna. ¿Seguimos con el siguiente dato del evento?"
      ),
      "Sí tras siguiente-dato ≠ catálogo"
    );
    assert.equal(
      parseFurnitureCatalogSkuFromText("Sala Ariel Color Nude"),
      "Sala Ariel Color Nude"
    );
    assert.ok(
      /Mesa Centro.*Mármol/i.test(
        parseFurnitureCatalogSkuFromText("Mesa Centro Rectangular Mármol") ?? ""
      )
    );
    assert.ok(
      /Mesa Centro.*Mármol/i.test(
        parseFurnitureCatalogSkuFromText("Mesa Centro Mármol Redonda") ?? ""
      )
    );

    const extracted = emptyExtracted({
      nombre: "Edna Osorno",
      tipo_evento: "cumpleaños",
      requerimientos_evento: "Salas lounge",
    });
    const filled = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    const liveSi = runGuards({
      aiResponse: "Claro.\n\nTe dejo el catálogo general:\nhttps://bodasesor.com/catalogos",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Si",
      history: [
        {
          role: "assistant",
          content: "Perfecto, Edna. ¿Seguimos con el siguiente dato del evento?",
        },
      ],
    });
    assert.ok(
      mensajeAsksForField(liveSi, "fecha") || /fecha|cu[aá]ndo|para cu[aá]ndo/i.test(liveSi),
      `Sí → fecha real: ${liveSi.slice(0, 300)}`
    );
    assert.ok(
      !/bodasesor\.com\/catalogos|colgantes|siguiente dato del evento/i.test(liveSi),
      `no catálogo/filler: ${liveSi.slice(0, 350)}`
    );

    const exSku = emptyExtracted({
      nombre: "Edna Osorno",
      tipo_evento: "cumpleaños",
      requerimientos_evento: "Salas lounge",
    });
    const liveSku = runGuards({
      aiResponse: "Perfecto. ¿Quieres que te dé detalles de alguno?",
      extracted: exSku,
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "Sala Ariel Color Nude",
      history: [
        { role: "assistant", content: "¿Quieres que te dé detalles de alguno?" },
      ],
    });
    assert.ok(/Sala Ariel/i.test(exSku.requerimientos_evento ?? ""), exSku.requerimientos_evento);
    assert.ok(
      /anoto|Sala Ariel/i.test(liveSku) &&
        (mensajeAsksForField(liveSku, "fecha") || /fecha|cu[aá]ndo/i.test(liveSku)),
      liveSku.slice(0, 400)
    );
    assert.ok(
      !/siguiente dato del evento|colgantes|cat[aá]logo general/i.test(liveSku),
      liveSku.slice(0, 350)
    );

    // Fecha dada tras CTA de detalles → no volver a pedir detalles ni dump.
    const exFecha = emptyExtracted({
      nombre: "Edna Osorno",
      tipo_evento: "cumpleaños",
      requerimientos_evento: "Sala Ariel Color Nude, Mesa Centro Rectangular Mármol",
    });
    const liveFecha = runGuards({
      aiResponse: "Con gusto. ¿Quieres que te dé detalles de alguno?",
      extracted: exFecha,
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "El 10 de octubre a partir de 4:00 pm",
      history: [
        {
          role: "assistant",
          content: "De acuerdo. Edna, ¿tienen día u horario ya definido?",
        },
      ],
    });
    assert.ok(
      /octubre|10/i.test(exFecha.fecha_horario ?? ""),
      `fecha CRM: ${exFecha.fecha_horario}`
    );
    assert.ok(
      /4:00|ubicaci|sal[oó]n|colonia|ciudad/i.test(liveFecha),
      `ack fecha + zona: ${liveFecha.slice(0, 350)}`
    );
    assert.ok(
      !/quieres que te d[eé] detalles de alguno/i.test(liveFecha),
      liveFecha.slice(0, 350)
    );
    assert.ok(
      !/colgantes|Según el catálogo/i.test(liveFecha),
      liveFecha.slice(0, 350)
    );
  });

  // ─── 146. A15308 — Carlota: solo nombre → sin "qué emoción / felicidades" ───
  await test("146. A15308 — solo nombre: Mucho gusto + embudo, sin felicitar", () => {
    const dirty =
      "¡Mucho gusto, Carlota! Qué emoción, felicidades. ¿Qué tipo de evento van planeando celebrar?";
    const cleaned = stripPrematureCelebrationFluff(dirty, {
      currentMessage: "Carlota",
      tipoEvento: null,
    });
    assert.ok(/Mucho gusto,\s*Carlota/i.test(cleaned), cleaned);
    assert.ok(!/emoción|felicidades/i.test(cleaned), cleaned);
    assert.ok(
      !/emoción|felicidades/i.test(dedupeTransitionsInMessage(dirty)),
      dedupeTransitionsInMessage(dirty)
    );

    const live = runGuards({
      aiResponse: dirty,
      extracted: emptyExtracted({ nombre: "Carlota" }),
      filledSet: new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "Carlota",
      history: [
        {
          role: "assistant",
          content:
            "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. ¿Me regalas tu nombre?",
        },
      ],
    });
    assert.ok(/Mucho gusto,\s*Carlota/i.test(live), live.slice(0, 300));
    assert.ok(!/emoción|felicidades|qu[eé]\s+padre/i.test(live), live.slice(0, 400));
    assert.ok(/tipo de evento|van a celebrar|qu[eé] van a celebrar/i.test(live), live.slice(0, 400));
  });

  // ─── 145. A15302 — Christián: menú cumpleaños + barra italiana ───
  await test("145. A15302 — menú cumpleaños pequeño + barra italiana (pastas/pizzas)", () => {
    const menuMsg = "Mi cumpleaños. Es pequeño.\nM regalas tu menú porfa?";
    assert.ok(clientAsksForFoodMenu(menuMsg));
    assert.ok(isVagueFoodTerm(menuMsg));
    assert.ok(clientMentionsItalianTheme("Tienes barra italiana?"));

    const extracted = emptyExtracted({
      nombre: "Christián Martell",
      direccion_evento: "Metepec, Estado de México",
      fecha_horario: "Sábado 15",
      num_invitados: 30,
    });
    const filled = new Set([
      "Nombre del cliente",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Número de invitados",
    ]);
    const menuReply = runGuards({
      aiResponse:
        "Te detallo *menú* para un cumpleaños. Para *alimentos* tenemos: banquete 3 tiempos, Banquete Kosher...",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: menuMsg,
      history: [
        { role: "assistant", content: "¡Mucho gusto, Christián! ¿Qué tipo de evento es?" },
      ],
    });
    assert.equal(extracted.tipo_evento, "cumpleaños");
    assert.ok(
      !/Banquete Kosher|3 tiempos|4 tiempos|Barra Americana/i.test(menuReply),
      menuReply.slice(0, 400)
    );
    assert.ok(
      /formal|casual|banquete|pastas|pizzas|taquiza/i.test(menuReply),
      menuReply.slice(0, 500)
    );

    const exBar = emptyExtracted({
      nombre: "Christián Martell",
      tipo_evento: "cumpleaños",
      direccion_evento: "Metepec, Estado de México",
      fecha_horario: "Sábado 15",
      num_invitados: 30,
    });
    const filledBar = new Set([...filled, "Tipo de evento"]);
    const barra = runGuards({
      aiResponse:
        "Manejamos *Barra* en varias opciones: Barra Americana, Barra Yucateca...",
      extracted: exBar,
      filledSet: filledBar,
      readyForClosing: false,
      currentMessage: "Tienes barra italiana?",
      history: [
        { role: "assistant", content: "¿Qué tipo de evento es?" },
        { role: "user", content: menuMsg },
        { role: "assistant", content: menuReply },
      ],
    });
    assert.ok(!/Barra Americana|Yucateca|la anoto para tu cotizaci/i.test(barra), barra.slice(0, 400));
    assert.ok(/pastas?|pizzas?/i.test(barra), barra.slice(0, 500));
    assert.ok(/pastas?|pizzas?/i.test(exBar.requerimientos_evento ?? ""));
  });

  // ─── 144. V9.23 — RFQ largo genérico: sync todo + 1 pregunta; sin perderse ───
  await test("144. V9.23 — RFQ largo completo: captura todo y solo pide lo faltante", () => {
    const rich = [
      "Hola, queremos cotizar un evento corporativo el 10 de octubre",
      "en Polanco, Ciudad de México, para 120 personas.",
      "Necesitamos coffee break y meseros.",
      "Nuestro correo es eventos@acme.mx.",
      "¿Nos pueden enviar una propuesta con costos?",
    ].join(" ");

    assert.ok(isRichQuoteBrief(rich));
    assert.ok(/Polanco/i.test(parseZonaFromText(rich) ?? ""));

    const extracted = emptyExtracted();
    const live = runGuards({
      aiResponse: "De acuerdo. Sobre *bebidas* en *Coffee Break*: *Sí incluye*...",
      extracted,
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage: rich,
      history: [],
      forceFirstPresentation: true,
    });
    assert.ok(/hola[!.,]?\s*(?:buen\s+d[ií]a[.!]?\s*)?soy\s+lucy/i.test(live), live.slice(0, 300));
    assert.ok(!/Sobre \*bebidas\*|S[ií] incluye/i.test(live), `sin dump: ${live.slice(0, 350)}`);
    assert.ok(/10 de octubre|polanco|120/i.test(live), live.slice(0, 500));
    assert.ok(/coffee|meseros/i.test(live), live.slice(0, 500));
    assert.ok(/nombre|c[oó]mo te llamas|regalas/i.test(live), live.slice(0, 700));
    // No debe re-pedir zona/fecha/invitados/correo ya capturados.
    assert.ok(!/en qu[eé] ciudad|cu[aá]ntas personas|ya tienen fecha|correo/i.test(live), live.slice(0, 700));
    assert.equal(extracted.num_invitados, 120);
    assert.ok(/Polanco/i.test(extracted.direccion_evento ?? ""));
    assert.ok(/10 de octubre/i.test(extracted.fecha_horario ?? ""));
    assert.equal(extracted.correo, "eventos@acme.mx");
    assert.ok(/Coffee|Meseros/i.test(extracted.requerimientos_evento ?? ""));

    // Segundo turno: ya con nombre → no re-preguntar datos del brief; ir a presupuesto o cierre.
    const filled2 = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Número de invitados",
    ]);
    const ex2 = emptyExtracted({
      nombre: "Ana Pérez",
      correo: "eventos@acme.mx",
      tipo_evento: "evento corporativo",
      requerimientos_evento: "Coffee Break, Meseros",
      direccion_evento: "Polanco, Ciudad de México",
      fecha_horario: "10 de octubre",
      num_invitados: 120,
    });
    const mid = runGuards({
      aiResponse: "¿Tienen algún rango de presupuesto en mente?",
      extracted: ex2,
      filledSet: filled2,
      readyForClosing: false,
      currentMessage: rich,
      history: [
        { role: "assistant", content: "¿Me regalas tu nombre?" },
        { role: "user", content: "Ana Pérez" },
        { role: "assistant", content: "¿Tienen algún rango de presupuesto en mente?" },
      ],
    });
    assert.ok(!/Sobre \*bebidas\*|S[ií] incluye/i.test(mid), mid.slice(0, 300));
    assert.ok(
      /ya tengo todo|equipo|cotizaci|propuesta/i.test(mid) ||
        !/presupuesto|rango de inversi/i.test(mid),
      mid.slice(0, 350)
    );
  });

  // ─── 143. A15298 — Priscilla RFQ editorial: sin dump bebidas; propuesta = cierre ───
  await test("143. A15298 — RFQ canapés/café + propuesta mamita cierra sin presupuesto", () => {
    const brief = [
      "Nos gustaría solicitarles una cotización para una presentación editorial.",
      "Fecha: 21 de noviembre. Horario: de 14:00 a 19:00 horas.",
      "Número estimado de asistentes: 60 personas.",
      "Lugar: Centro Cultural El Rule, ubicado junto a la Torre Latinoamericana, en el tercer piso.",
      "Tipo de evento: presentación editorial.",
      "Bocadillos o canapes salados, vegetarianas/veganas, servicio de café.",
      "Nosotros proporcionaríamos los vinos, el agua y las copas.",
      "Sí necesitaríamos su apoyo con la distribución y el servicio de las bebidas.",
      "La cotización indicara si incluye personal de servicio y cuanto seria sin personal.",
      "Quedamos atentos a sus propuestas y recomendaciones.",
    ].join("\n");

    assert.ok(isRichQuoteBrief(brief));
    assert.equal(clientAsksSpecificInclusionItem(brief), "meseros");
    assert.ok(!/tercer piso/i.test(parseZonaFromText(brief) ?? ""));
    assert.ok(/Centro Cultural El Rule/i.test(parseZonaFromText(brief) ?? ""));
    assert.ok(detectPresupuestoRefusal("Me gustaría una propuesta mamita"));
    assert.ok(detectPresupuestoRefusal("Por favor una propuesta"));
    assert.ok(parseServicesFromText(brief).some((s) => /canap/i.test(s)));
    assert.ok(parseServicesFromText(brief).some((s) => /caf[eé]/i.test(s)));
    assert.equal(parseTipoEventoFromText(brief), "presentación editorial");

    const extracted = emptyExtracted();
    const live = runGuards({
      aiResponse: "De acuerdo. Sobre *bebidas* en *Canapés*: *Sí incluye* en Basico...",
      extracted,
      filledSet: new Set(),
      readyForClosing: false,
      currentMessage: brief,
      history: [{ role: "assistant", content: "¡Hola! ¿Me regalas tu nombre?" }],
    });
    assert.ok(
      !/Sobre \*bebidas\*|S[ií] incluye|Solo Alimentos/i.test(live),
      `no dump bebidas: ${live.slice(0, 350)}`
    );
    assert.ok(
      /revis[eé]|anoto|canap|nombre|llamas/i.test(live),
      live.slice(0, 400)
    );
    assert.ok(/Centro Cultural El Rule/i.test(extracted.direccion_evento ?? ""));
    assert.ok(/21 de noviembre/i.test(extracted.fecha_horario ?? ""));
    assert.equal(extracted.num_invitados, 60);

    const filledReady = new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Lugar/dirección del evento",
      "Fecha y horario",
      "Número de invitados",
    ]);
    const exReady = emptyExtracted({
      nombre: "Priscilla Bulnes",
      correo: "trogni1@yahoo.com",
      tipo_evento: "presentación editorial",
      requerimientos_evento: "Canapés, Bocadillos, Meseros, Barra de Café",
      direccion_evento: "Centro Cultural El Rule",
      fecha_horario: "21 de noviembre",
      num_invitados: 60,
    });
    const cierre = runGuards({
      aiResponse: "¿Tienen algún rango de presupuesto en mente?",
      extracted: exReady,
      filledSet: filledReady,
      readyForClosing: false,
      currentMessage: "Me gustaría una propuesta mamita",
      history: [
        {
          role: "assistant",
          content: "¿Tienen algún rango de presupuesto en mente?",
        },
      ],
    });
    assert.ok(filledReady.has("Presupuesto (MXN)"));
    assert.ok(
      !/presupuesto|rango de inversi/i.test(cierre),
      `no re-pedir presupuesto: ${cierre.slice(0, 300)}`
    );
    assert.ok(
      /ya tengo todo|equipo|cotizaci/i.test(cierre),
      cierre.slice(0, 300)
    );
  });

  // ─── V9.26 — no cortar chat con solo "ya lo tengo anotado" ───
  await test("127. V9.26 — anti-cierre 'Ya lo tengo anotado' sigue embudo", async () => {
    assert.ok(/^V9\.\d{2}$/.test(LUCY_PROMPT_VERSION), LUCY_PROMPT_VERSION);
    assert.ok(looksLikeDeadEndAck("Perfecto, Ana. Ya lo tengo anotado."));
    assert.ok(looksLikeDeadEndAck("Perfecto, ya tengo lo principal anotado."));
    assert.ok(looksLikeDeadEndAck("Entendido. Seguimos con lo que ya platicamos."));
    assert.ok(!looksLikeDeadEndAck("Perfecto, Ana. Ya lo tengo anotado.\n\n¿Qué tipo de evento es?"));
    assert.ok(!looksLikeDeadEndAck("Perfecto, ya tengo todo. Le paso estos datos al equipo."));

    const filledMid = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    const exMid = emptyExtracted({
      nombre: "Ana",
      tipo_evento: "boda",
      requerimientos_evento: "Barra de bebidas",
    });

    const antiBare = applyLucyGlobalAntiRepetition({
      mensaje: "Perfecto, Ana. Ya lo tengo anotado.",
      history: [
        { role: "assistant", content: "¿Qué servicios te gustaría cotizar?" },
        { role: "user", content: "barra de bebidas" },
      ],
      filledSet: filledMid,
      extracted: exMid,
      clientName: "Ana",
      currentMessage: "barra de bebidas",
    });
    assert.ok(/\?/.test(antiBare.mensaje), antiBare.mensaje);
    assert.ok(
      !looksLikeDeadEndAck(antiBare.mensaje),
      antiBare.mensaje.slice(0, 300)
    );
    assert.ok(
      /fecha|cu[aá]ndo|cuando|d[ií]a|horario/i.test(antiBare.mensaje) ||
        mensajeAsksForField(antiBare.mensaje, "fecha"),
      antiBare.mensaje.slice(0, 400)
    );

    const filledAskZona = applyLucyGlobalAntiRepetition({
      mensaje: "Genial. ¿Me compartes tu correo para enviarte la info?",
      history: [{ role: "assistant", content: "¿Qué servicios te gustaría?" }],
      filledSet: new Set([
        "Nombre del cliente",
        "Correo electrónico",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      extracted: emptyExtracted({
        nombre: "Luis",
        correo: "luis@test.com",
        tipo_evento: "cumpleaños",
        requerimientos_evento: "DJ",
      }),
      clientName: "Luis",
    });
    assert.ok(!mensajeAsksForField(filledAskZona.mensaje, "correo"), filledAskZona.mensaje);
    assert.ok(/\?/.test(filledAskZona.mensaje), filledAskZona.mensaje);
    assert.ok(
      mensajeAsksForField(filledAskZona.mensaje, "fecha") ||
        /fecha|cu[aá]ndo|d[ií]a/i.test(filledAskZona.mensaje),
      filledAskZona.mensaje
    );

    const guardBare = runGuards({
      aiResponse: "Perfecto, Ana. Ya lo tengo anotado.",
      extracted: exMid,
      filledSet: filledMid,
      readyForClosing: false,
      currentMessage: "barra de bebidas",
      history: [
        { role: "assistant", content: "¿Qué servicios te gustaría cotizar?" },
        { role: "user", content: "barra de bebidas" },
      ],
    });
    assert.ok(/\?/.test(guardBare), guardBare.slice(0, 400));
    assert.ok(!looksLikeDeadEndAck(guardBare), guardBare.slice(0, 300));

    const pipe = await finalizeLucyOutboundMessage({
      mensaje: "Perfecto, Ana. Ya lo tengo anotado.",
      extracted: exMid,
      readyForClosing: false,
      cierreYaEnviado: false,
      filledSet: filledMid,
      currentMessage: "barra de bebidas",
      history: [
        { role: "assistant", content: "¿Qué servicios te gustaría cotizar?" },
      ],
    });
    assert.ok(/\?/.test(pipe), pipe.slice(0, 400));
    assert.ok(!looksLikeDeadEndAck(pipe), pipe.slice(0, 300));
  });

  // ─── V9.28 — solo vs completo en TODAS las estaciones (mismo procedimiento) ───
  await test("128. V9.28 — solo vs completo en todas las ramas completas", () => {
    assert.ok(/^V9\.(2[89]|[3-9]\d)$/.test(LUCY_PROMPT_VERSION), LUCY_PROMPT_VERSION);
    const csv = [
      '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye","Link catalogo"',
      '"Taquiza","Solo Alimentos","$320.00","$9,600.00","TRUE","Tacos","https://bodasesor.com/catalogos/taquiza"',
      '"Taquiza","Basico","$750.00","$22,500.00","TRUE","Basico completo","https://bodasesor.com/catalogos/taquiza"',
      '"Taquiza","Tradicional","$800.00","$24,000.00","TRUE","Trad completo","https://bodasesor.com/catalogos/taquiza"',
      '"Taquiza","Premium","$850.00","$25,500.00","TRUE","Prem completo","https://bodasesor.com/catalogos/taquiza"',
      '"Barra de pastas y ensaladas","Solo Alimentos","$280.00","$8,400.00","TRUE","Pastas","https://bodasesor.com/catalogos/pastas"',
      '"Barra de pastas y ensaladas","Basico","$700.00","$21,000.00","TRUE","Bas","https://bodasesor.com/catalogos/pastas"',
      '"Barra de pastas y ensaladas","Tradicional","$750.00","$22,500.00","TRUE","Trad","https://bodasesor.com/catalogos/pastas"',
      '"Barra de pastas y ensaladas","Premium","$800.00","$24,000.00","TRUE","Prem","https://bodasesor.com/catalogos/pastas"',
      '"Barra de pizzas","Solo Alimentos","$290.00","$8,700.00","TRUE","Pizza","https://bodasesor.com/catalogos/pizzas"',
      '"Barra de pizzas","Basico","$710.00","$21,300.00","TRUE","Bas","https://bodasesor.com/catalogos/pizzas"',
      '"Barra de pizzas","Tradicional","$760.00","$22,800.00","TRUE","Trad","https://bodasesor.com/catalogos/pizzas"',
      '"Barra de pizzas","Premium","$810.00","$24,300.00","TRUE","Prem","https://bodasesor.com/catalogos/pizzas"',
      '"Barra Yucateca","Solo Alimentos","$330.00","$9,900.00","TRUE","Yuca","https://bodasesor.com/catalogos/barra-yucateca"',
      '"Barra Yucateca","Basico","$750.00","$22,500.00","TRUE","Bas","https://bodasesor.com/catalogos/barra-yucateca"',
      '"Barra Yucateca","Tradicional","$800.00","$24,000.00","TRUE","Trad","https://bodasesor.com/catalogos/barra-yucateca"',
      '"Barra Yucateca","Premium","$850.00","$25,500.00","TRUE","Prem","https://bodasesor.com/catalogos/barra-yucateca"',
      '"Parrillada Argentina","Solo Alimentos","$400.00","$12,000.00","TRUE","Carne","https://bodasesor.com/catalogos/parrillada"',
      '"Parrillada Argentina","Basico","$850.00","$25,500.00","TRUE","Bas","https://bodasesor.com/catalogos/parrillada"',
      '"Parrillada Argentina","Tradicional","$900.00","$27,000.00","TRUE","Trad","https://bodasesor.com/catalogos/parrillada"',
      '"Parrillada Argentina","Premium","$950.00","$28,500.00","TRUE","Prem","https://bodasesor.com/catalogos/parrillada"',
    ].join("\n");
    setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

    for (const svc of [
      "taquiza",
      "Barra de pastas y ensaladas",
      "Barra de pizzas",
      "Barra Yucateca",
      "Parrillada Argentina",
    ]) {
      const rows = resolveCatalogQuery(svc)?.rows ?? [];
      assert.ok(serviceHasSoloVsCompleto(rows), `detecta solo vs completo: ${svc}`);
      const mode = buildCatalogServiceDetailAnswer(svc);
      assert.ok(mode, `detalle ${svc}`);
      assert.ok(
        /solo\s+alimentos/i.test(mode!) && /servicio\s+completo/i.test(mode!),
        `embudo ${svc}: ${mode!.slice(0, 400)}`
      );
      assert.ok(
        !(/1\.\s*\*?Solo Alimentos[\s\S]*2\.\s*\*?Basico[\s\S]*3\.\s*\*?Tradicional[\s\S]*4\.\s*\*?Premium/i.test(
          mode!
        )),
        `no dump 4: ${svc}`
      );
      const offer = buildSoloVsCompletoOfferIfApplicable(svc);
      assert.ok(offer && /cu[aá]l te late/i.test(offer), `offer helper ${svc}`);
      const teaser = buildCatalogServiceDetailAnswer(`${svc} servicio completo`);
      assert.ok(
        teaser && /3 niveles|B[aá]sico|Tradicional|Premium/i.test(teaser),
        `teaser ${svc}: ${teaser?.slice(0, 300)}`
      );
    }

    assert.equal(
      resolveSoloVsCompletoStationLabel("quiero barra de pastas", "barra_alimentos"),
      "Barra de pastas y ensaladas"
    );
    assert.match(
      buildSoloVsCompletoProgressiveMenu("Barra de Crepas"),
      /solo\s+alimentos[\s\S]*servicio\s+completo/i
    );

    const rows = resolveCatalogQuery("taquiza")?.rows ?? [];
    assert.ok(serviceHasSoloVsCompleto(rows), "debe detectar solo vs completo");

    const mode = buildCatalogServiceDetailAnswer("taquiza");
    assert.ok(mode, "detalle taquiza");
    assert.ok(/solo\s+alimentos/i.test(mode!) && /\$\s*320/i.test(mode!), mode!.slice(0, 500));
    assert.ok(
      /servicio\s+completo/i.test(mode!) && /desde\s+\$\s*750/i.test(mode!),
      mode!.slice(0, 500)
    );
    assert.ok(/bebidas|mobiliario|meseros/i.test(mode!), mode!.slice(0, 500));
    assert.ok(/cu[aá]l te late/i.test(mode!), mode!.slice(0, 400));

    const teaser = buildCatalogServiceDetailAnswer("taquiza servicio completo");
    assert.ok(teaser, "teaser completo");
    assert.ok(/3 niveles|B[aá]sico|Tradicional|Premium/i.test(teaser!), teaser!.slice(0, 500));
    assert.ok(/montaje|meseros|decoraci[oó]n|bebidas/i.test(teaser!), teaser!.slice(0, 500));
    assert.ok(/detalles de alguno/i.test(teaser!), teaser!.slice(0, 400));
    assert.ok(!/\$\s*800|\$\s*850/i.test(teaser!), `sin volcar todos los precios: ${teaser!.slice(0, 400)}`);

    const solo = buildCatalogServiceDetailAnswer("taquiza Solo Alimentos");
    assert.ok(solo && /\$\s*320|Solo Alimentos/i.test(solo), solo?.slice(0, 400));

    const basico = buildCatalogServiceDetailAnswer("taquiza Basico");
    assert.ok(basico && /\$\s*750|Basico/i.test(basico), basico?.slice(0, 400));

    const modeMenu = [
      "Para *Taquiza* tenemos dos caminos:",
      "",
      "1. *Solo alimentos* — $320.00 /pp (solo la comida)",
      "2. *Servicio completo* — desde $750.00 /pp (incluye bebidas, mobiliario y meseros)",
      "",
      "¿Cuál te late más?",
    ].join("\n");
    assert.ok(isCatalogLevelSelection("completo", modeMenu));
    assert.ok(isCatalogLevelSelection("2", modeMenu));
    assert.equal(extractCatalogNivelFromText("2", modeMenu), "Servicio completo");
    assert.match(extractCatalogNivelFromText("solo alimentos", modeMenu) ?? "", /solo\s+alimentos/i);

    const live = runGuards({
      aiResponse:
        "Para *Taquiza* manejamos estos niveles:\n1. *Solo Alimentos* — $320\n2. *Basico* — $750\n3. *Tradicional* — $800\n4. *Premium* — $850\n\n¿Cuál prefieres?",
      extracted: emptyExtracted({
        nombre: "Ana",
        tipo_evento: "boda",
        requerimientos_evento: "Taquiza",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "quiero taquiza",
      history: [{ role: "user", content: "quiero taquiza" }],
    });
    assert.ok(
      /solo\s+alimentos/i.test(live) && /servicio\s+completo/i.test(live),
      live.slice(0, 500)
    );
    assert.ok(
      !(/1\.\s*\*?Solo Alimentos[\s\S]*4\.\s*\*?Premium/i.test(live)),
      `guards no deben dejar dump: ${live.slice(0, 600)}`
    );

    const pastasLive = runGuards({
      aiResponse:
        "Para *Barra de pastas y ensaladas* manejamos estos niveles:\n1. *Solo Alimentos* — $280\n2. *Basico* — $700\n3. *Tradicional* — $750\n4. *Premium* — $800\n\n¿Cuál prefieres?",
      extracted: emptyExtracted({
        nombre: "Luis",
        tipo_evento: "corporativo",
        requerimientos_evento: "Barra de pastas y ensaladas",
      }),
      filledSet: new Set([
        "Nombre del cliente",
        "Tipo de evento",
        "Requerimientos o servicios",
      ]),
      readyForClosing: false,
      currentMessage: "quiero barra de pastas",
      history: [{ role: "user", content: "quiero barra de pastas" }],
    });
    assert.ok(
      /solo\s+alimentos/i.test(pastasLive) && /servicio\s+completo/i.test(pastasLive),
      pastasLive.slice(0, 500)
    );
    assert.ok(
      !(/1\.\s*\*?Solo Alimentos[\s\S]*4\.\s*\*?Premium/i.test(pastasLive)),
      `pastas sin dump 4: ${pastasLive.slice(0, 600)}`
    );
  });

  // ─── V9.29 — empresa / espacio / ratito ≠ dirección (todas las ramas) ───
  await test("129. V9.29 — empresa/espacio/ratito no cierran dirección", () => {
    assert.ok(/^V9\.\d{2}$/.test(LUCY_PROMPT_VERSION), LUCY_PROMPT_VERSION);
    for (const junk of [
      "nuestra empresa, un ratito",
      "nuestra empresa",
      "empresa",
      "nuestro espacio",
      "espacio",
      "nuestras oficinas",
      "un ratito",
      "ahorita te digo",
    ]) {
      assert.equal(parseZonaFromText(junk), null, `zona null: ${junk}`);
      assert.ok(!isUsableDireccionEvento(junk), `no usable: ${junk}`);
      assert.equal(
        sanitizeExtractedFromExternal(emptyExtracted({ direccion_evento: junk }))
          .direccion_evento,
        null,
        `sanitize: ${junk}`
      );
    }
    assert.ok(isUsableDireccionEvento("Polanco"));
    assert.ok(isUsableDireccionEvento("Santa Fe, CDMX"));
    assert.ok(!isUsableDireccionEvento("Salón Hacienda Los Olivos"));
    assert.ok(isUsableDireccionEvento("Salón Hacienda Los Olivos, CDMX"));

    const filled = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Fecha y horario",
    ]);
    const extracted = emptyExtracted({
      nombre: "Ana",
      tipo_evento: "corporativo",
      requerimientos_evento: "Coffee break",
      num_invitados: 80,
      fecha_horario: "12 de septiembre",
      direccion_evento: "nuestra empresa, un ratito",
    });
    const reply = runGuards({
      aiResponse: "Perfecto, anoto la dirección en nuestra empresa. ¿Me pasas tu correo?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "nuestra empresa, un ratito",
      history: [
        {
          role: "assistant",
          content: "¿En qué ciudad y colonia (o salón) sería tu evento?",
        },
        { role: "user", content: "nuestra empresa, un ratito" },
      ],
    });
    assert.equal(extracted.direccion_evento, null);
    assert.ok(!filled.has("Lugar/dirección del evento"));
    assert.ok(
      /ciudad|colonia|sal[oó]n|ubicaci[oó]n|direcci[oó]n|zona|lugar/i.test(reply),
      reply.slice(0, 400)
    );
    assert.ok(
      !/anoto.{0,40}nuestra empresa/i.test(reply),
      reply.slice(0, 400)
    );
  });

  // ─── V9.30 — mínimo ciudad; salón solo no cierra ───
  await test("130. V9.30 — ubicación mínima es ciudad (salón solo no basta)", () => {
    assert.ok(/^V9\.\d{2}$/.test(LUCY_PROMPT_VERSION), LUCY_PROMPT_VERSION);
    assert.ok(hasCityOrMetroSignal("CDMX"));
    assert.ok(hasCityOrMetroSignal("Querétaro"));
    assert.ok(hasCityOrMetroSignal("colonia Roma"));
    assert.ok(!hasCityOrMetroSignal("Salón Hacienda Los Olivos"));
    assert.ok(isVenueWithoutCity("Salón Hacienda Los Olivos"));
    assert.ok(isVenueWithoutCity("Hacienda Los Arcángeles"));
    assert.ok(!isVenueWithoutCity("Expo Santa Fe"));
    assert.ok(!isUsableDireccionEvento("Salón Hacienda Los Olivos"));
    assert.ok(!isUsableDireccionEvento("Club de Golf Mexico"));
    assert.ok(isUsableDireccionEvento("Salón Hacienda Los Olivos, CDMX"));
    assert.ok(isUsableDireccionEvento("Polanco"));
    assert.ok(isUsableDireccionEvento("Jiutepec"));
    assert.equal(
      sanitizeExtractedFromExternal(
        emptyExtracted({ direccion_evento: "Salón Hacienda Los Olivos" })
      ).direccion_evento,
      null
    );

    const filled = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Número de invitados",
      "Fecha y horario",
    ]);
    const extracted = emptyExtracted({
      nombre: "Ana",
      tipo_evento: "boda",
      requerimientos_evento: "Banquete",
      num_invitados: 100,
      fecha_horario: "20 de diciembre",
      direccion_evento: "Salón Hacienda Los Olivos",
    });
    const reply = runGuards({
      aiResponse: "Perfecto, anoto el salón. ¿Me pasas tu correo?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Salón Hacienda Los Olivos",
      history: [
        {
          role: "assistant",
          content: "¿En qué ciudad sería tu evento?",
        },
        { role: "user", content: "Salón Hacienda Los Olivos" },
      ],
    });
    assert.equal(extracted.direccion_evento, null);
    assert.ok(/ciudad/i.test(reply), reply.slice(0, 400));
    assert.ok(/Hacienda Los Olivos|sal[oó]n/i.test(reply), reply.slice(0, 400));
    assert.match(extractVenueNameHint("Salón Hacienda Los Olivos") ?? "", /Hacienda Los Olivos/i);
  });

  // ─── V9.35 — primer turno banquete: catálogo + pregunta embudo (Allison A15370) ───
  await test("133. V9.35 — banquete Torreón primer turno pide fecha/invitados", () => {
    assert.equal(LUCY_PROMPT_VERSION, "V9.43");
    const filled = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Lugar/dirección del evento",
    ]);
    const extracted = emptyExtracted({
      nombre: "Allison Berumen",
      tipo_evento: "evento con banquete",
      requerimientos_evento: "Banquete Formal 3 tiempos",
      direccion_evento: "Torreón",
    });
    const reply = runGuards({
      aiResponse:
        "Perfecto, Allison. Anoto Banquete Formal 3 tiempos. Solo alimentos $450 servicio completo $780. ¿Cuál te late más?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Hola, me interesa cotizar: Banquete 3 Tiempos Torreón",
      whatsappDisplayName: "Allison Berumen",
      history: [{ role: "user", content: "Hola, me interesa cotizar: Banquete 3 Tiempos Torreón" }],
    });
    assert.ok(
      /fecha|cu[aá]ndo|d[ií]a|invitados|correo|e-?mail|cu[aá]nt[oa]s|personas/i.test(reply),
      `debe pedir dato del embudo: ${reply.slice(0, 500)}`
    );
    assert.ok(!/solo\s+alimentos.*780/i.test(reply) || /fecha|invitados|correo/i.test(reply));
  });

  // ─── V9.36 — no cortar el chat (Isai A15378) ───
  await test("134. V9.36 — Isai: no cierra, no confunde nombre con ciudad, urgencia ≠ teléfono", () => {
    assert.equal(LUCY_PROMPT_VERSION, "V9.43");
    assert.equal(parseZonaFromText("Isai Moreno"), null);
    assert.ok(!isUsableDireccionEvento("Isai Moreno"));
    assert.ok(!detectPresupuestoRefusal("A Qui por WhatsApp no se puede"));
    assert.ok(!detectPresupuestoRefusal("Por este medio por favor no tengo correo"));
    assert.ok(detectEmailRefusal(["Por este medio por favor no tengo correo"]));
    assert.ok(detectEmailRefusal(["A Qui por WhatsApp no se puede"]));
    assert.ok(!clientAsksPhone("Nada más que no sea mañana porque ya me urge faltan pocos días y necesito saber si pueden o no"));
    assert.ok(clientSignalsUrgency("Nada más que no sea mañana porque ya me urge faltan pocos días"));
    assert.ok(!isValidRequerimientosValue("banquetes o catering"));
    assert.ok(isValidRequerimientosValue("banquete"));

    const filled = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Fecha y horario",
    ]);
    const extracted = emptyExtracted({
      nombre: "Isai Moreno",
      tipo_evento: "evento con catering",
      requerimientos_evento: "banquetes o catering",
      fecha_horario: "30 de agosto",
      direccion_evento: "Isai Moreno",
    });
    const replyEmail = runGuards({
      aiResponse: "Perfecto, ya tengo todo. He tomado nota para enviárselos a nuestro equipo.",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      cierreYaEnviado: false,
      currentMessage: "Por este medio por favor no tengo correo",
      history: [
        { role: "assistant", content: "¿Me compartes un correo para enviarte los detalles?" },
        { role: "user", content: "Por este medio por favor no tengo correo" },
      ],
    });
    assert.ok(!/ya tengo todo/i.test(replyEmail), replyEmail.slice(0, 400));
    assert.ok(
      /banquete|casual|catering|invitados|ciudad|ubicaci|correo/i.test(replyEmail) ||
        replyEmail.includes("?"),
      `debe seguir preguntando: ${replyEmail.slice(0, 400)}`
    );

    const filledUrg = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Fecha y horario",
      EMAIL_WAIVED_LABEL,
    ]);
    const extractedUrg = emptyExtracted({
      nombre: "Isai Moreno",
      tipo_evento: "evento con catering",
      requerimientos_evento: "banquetes o catering",
      fecha_horario: "30 de agosto",
      direccion_evento: "Ecatepec",
    });
    const replyUrg = runGuards({
      aiResponse: "Claro, te paso los números:\nVentas: 55 4008 0373",
      extracted: extractedUrg,
      filledSet: filledUrg,
      readyForClosing: false,
      cierreYaEnviado: true,
      currentMessage:
        "Nada más que no sea mañana porque ya me urge faltan pocos días y necesito saber si pueden o no",
      history: [
        { role: "assistant", content: "Perfecto, ya tengo todo. Con esta información voy a solicitar a nuestro equipo que prepare una cotización personalizada para ti." },
        { role: "user", content: "Nada más que no sea mañana porque ya me urge" },
      ],
    });
    assert.ok(!/55 4008 0373|te paso los n[uú]meros/i.test(replyUrg), replyUrg.slice(0, 400));
    assert.ok(/\?/i.test(replyUrg), `urgencia debe seguir el chat: ${replyUrg.slice(0, 400)}`);
  });

  // ─── V9.34 — Valle de Bravo / Mesa Rica; mesa rica ≠ mobiliario ───
  await test("132. V9.34 — Valle de Bravo y mesa rica (Sara A15370)", () => {
    assert.ok(/^V9\.\d{2}$/.test(LUCY_PROMPT_VERSION), LUCY_PROMPT_VERSION);
    assert.ok(hasCityOrMetroSignal("Valle de Bravo"));
    assert.ok(isUsableDireccionEvento("Valle de Bravo"));
    assert.equal(parseZonaFromText("Valle de bravo"), "Valle de bravo");
    assert.equal(parseZonaFromText("En valle de bravo"), "valle de bravo");
    assert.equal(
      parseZonaFromText("Pertenece a valle de bravo"),
      "valle de bravo"
    );
    assert.equal(
      parseZonaFromText(
        "La comunidad se llama mesa rica pertenece a valle de bravo, a media hora del fresno"
      ),
      "valle de bravo"
    );
    assert.ok(isLikelyUbicacionNotNombre("Es en mesa rica"));
    assert.deepEqual(parseServicesFromText("Es en mesa rica"), []);
    assert.equal(
      mergeServiceRequirements("Renta de letras", "Es en mesa rica", 6),
      "Renta de letras"
    );

    const filled = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Fecha y horario",
    ]);
    const extracted = emptyExtracted({
      nombre: "Sara",
      tipo_evento: "bautizo",
      requerimientos_evento: "Renta de letras",
      fecha_horario: "Diciembre",
    });
    const reply = runGuards({
      aiResponse: "¿En qué ciudad sería tu evento?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Valle de bravo",
      history: [
        { role: "assistant", content: "¿Me confirmas la *ciudad* del evento?" },
        { role: "user", content: "Valle de bravo" },
      ],
    });
    assert.ok(isFieldSatisfied("zona", filled, extracted));
    assert.equal(extracted.direccion_evento?.toLowerCase(), "valle de bravo");
    assert.ok(!/confirmas la \*ciudad\*/i.test(reply), reply.slice(0, 300));
  });

  // ─── V9.32 — corte de costo Gemini ───
  await test("131. V9.32 — unified turn + cache off + history trim + static system", () => {
    assert.equal(LUCY_PROMPT_VERSION, "V9.43");

    const prev = {
      u: process.env.LUCY_UNIFIED_LLM_TURN,
      h: process.env.LUCY_CHAT_HISTORY_MAX,
      f: process.env.LUCY_FEW_SHOT_MAX,
      c: process.env.GEMINI_CONTEXT_CACHE,
    };
    process.env.LUCY_UNIFIED_LLM_TURN = "1";
    process.env.LUCY_CHAT_HISTORY_MAX = "6";
    process.env.LUCY_FEW_SHOT_MAX = "0";
    process.env.GEMINI_CONTEXT_CACHE = "0";
    try {
      if (!isLucyUnifiedLlmTurn()) {
        throw new Error(`unified=false env=${JSON.stringify(process.env.LUCY_UNIFIED_LLM_TURN)}`);
      }
      assert.equal(getLucyChatHistoryMax(), 6);
      assert.equal(getLucyFewShotMax(), 0);
      assert.equal(lucyCostControlsSummary().context_cache_env, "0");

      const trimmed = trimChatHistory(
        [
          { role: "user", content: "1" },
          { role: "assistant", content: "a1" },
          { role: "user", content: "2" },
          { role: "assistant", content: "a2" },
          { role: "user", content: "3" },
          { role: "assistant", content: "a3" },
          { role: "user", content: "4" },
          { role: "assistant", content: "a4" },
        ],
        4
      );
      assert.equal(trimmed.length, 4);
      assert.equal(trimmed[0]!.content, "3");

      const staticSys = buildStaticSystemPrompt();
      if (!staticSys.includes("Eres Lucy")) {
        throw new Error(`static missing Lucy: ${staticSys.slice(0, 80)}`);
      }
      assert.equal(/CONTEXTO DEL TURNO \(din/i.test(staticSys), false);
      const dyn = buildDynamicTurnContext({
        stage: "qualification",
        priority: "warm",
        extracted: emptyExtracted({ tipo_evento: "boda" }),
        crmContext: "ESTADO ACTUAL",
        isFirstInteraction: false,
        slimCatalog: true,
        messageText: "taquiza",
        catalogBlock: "x".repeat(8000),
      });
      assert.equal(/CONTEXTO DEL TURNO \(din/i.test(dyn), true);
      assert.ok(dyn.length < 5000, `dyn len ${dyn.length}`);

      const target = emptyExtracted({ nombre: "Ana" });
      mergeExtractedPatch(target, { nombre: "Ana Pérez", num_invitados: 80 });
      assert.equal(target.nombre, "Ana Pérez");
      assert.equal(target.num_invitados, 80);

      const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
      const healthSrc = readFileSync(path.join(apiRoot, "src/routes/health.ts"), "utf8");
      assert.equal(healthSrc.includes("gemini-unified-turn"), true);
      assert.equal(healthSrc.includes("gemini-context-cache-default-off"), true);
    } finally {
      for (const [k, v] of [
        ["LUCY_UNIFIED_LLM_TURN", prev.u],
        ["LUCY_CHAT_HISTORY_MAX", prev.h],
        ["LUCY_FEW_SHOT_MAX", prev.f],
        ["GEMINI_CONTEXT_CACHE", prev.c],
      ] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  await test("135. V9.38 — comprobante en imagen: primer pago Anticipo, segundo Liquidación", () => {
    assert.equal(LUCY_PROMPT_VERSION, "V9.43");
    assert.equal(FIELD_ANTICIPO, 1049322);
    assert.equal(FIELD_LIQUIDACION, 1049324);

    assert.equal(nextPaymentSlot(null, null), "anticipo");
    assert.equal(nextPaymentSlot("", null), "anticipo");
    assert.equal(nextPaymentSlot(0, null), "anticipo");
    assert.equal(nextPaymentSlot(4500, null), "liquidacion");
    assert.equal(nextPaymentSlot("Transferencia", ""), "liquidacion");
    assert.equal(nextPaymentSlot(4500, 4500), null);
    assert.equal(kommoValueIsFilled(0), false);
    assert.equal(kommoValueIsFilled("5000"), true);

    assert.equal(paymentFieldValue({ amountMxn: 4500, method: "transferencia" }), 4500);
    assert.equal(paymentFieldValue({ amountMxn: null, method: "efectivo" }), "Efectivo");
    assert.ok(/anticipo/i.test(clientReplyForPaymentSlot("anticipo")));
    assert.ok(/liquidaci[oó]n/i.test(clientReplyForPaymentSlot("liquidacion")));

    assert.equal(parseAmountMxn(7800), 7800);
    assert.equal(parseAmountMxn("5,000.00"), 5000);
    assert.equal(normalizePaymentMethod("SPEI BBVA"), "transferencia");
    assert.equal(normalizePaymentMethod("pago en efectivo"), "efectivo");

    const spei = parseVisionImageJson(
      JSON.stringify({
        intent: "comprobante_pago",
        internal_description: "SPEI $7800",
        client_reply: "¡Gracias por tu pago!",
        amount_mxn: 7800,
        payment_method: "transferencia",
      })
    )!;
    assert.equal(spei.intent, "comprobante_pago");
    assert.equal(spei.amountMxn, 7800);
    const cash = parseVisionImageJson(
      JSON.stringify({
        intent: "comprobante_pago",
        internal_description: "Ticket caja $2000 efectivo",
        client_reply: "¡Gracias por tu pago!",
        payment_method: "efectivo",
      })
    )!;
    assert.equal(cash.paymentMethod, "efectivo");
    assert.equal(cash.amountMxn, 2000, "monto desde descripción si JSON no lo trae");

    const montaje = parseVisionImageJson(
      JSON.stringify({
        intent: "montaje_referencia",
        internal_description: "Mesas rústicas",
        client_reply: "Lo anoto",
        amount_mxn: 9999,
      })
    )!;
    assert.equal(montaje.amountMxn, null, "foto que no es comprobante no llena pago");

    const rewritten = rewriteImageTurnClientReply(
      formatImageTurnText(spei),
      clientReplyForPaymentSlot("anticipo")
    );
    assert.ok(/registré tu anticipo/i.test(rewritten));
    assert.ok(!/7800/.test(extractImageClientReply(rewritten) ?? ""));

    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const paySrc = readFileSync(path.join(apiRoot, "src/services/paymentReceiptCrm.ts"), "utf8");
    const imgSrc = readFileSync(path.join(apiRoot, "src/services/imageProcessor.ts"), "utf8");
    assert.ok(/1049322/.test(paySrc));
    assert.ok(/1049324/.test(paySrc));
    assert.ok(/comprobante_pago/.test(imgSrc));
    assert.ok(/amount_mxn/.test(imgSrc));
  });

  await test("136. V9.40 — A15380 invitados no se saltan; Coyoacán+colonia; Claro no es nombre", () => {
    assert.equal(LUCY_PROMPT_VERSION, "V9.43");
    const horario = "hola si se haría el 26 de septiembre pero aún no tenemos definido el horario";
    assert.equal(parseInvitadosFromText(horario), null, "horario pendiente ≠ invitados");
    const caps = scanConversationForCaptures([], horario, new Set(["Nombre del cliente"]));
    assert.equal(caps.find((c) => c.label === "Número de invitados"), undefined);

    assert.ok(isUsableDireccionEvento("Coyoacán"));
    const coyEdu = parseZonaFromText("es en Coyoacán la colonia es educación") ?? "";
    assert.match(coyEdu, /coyoac/i);
    assert.match(coyEdu, /educaci/i);
    assert.match(coyEdu, /cdmx/i);
    assert.match(composeEventLocation("es en Coyoacán la colonia es educación") ?? "", /educaci/i);

    assert.equal(sanitizeCrmNombre("Claro Aura Vargas"), "Aura Vargas");
    assert.equal(sanitizeDisplayName("Claro Aura Vargas"), "Aura");

    assert.ok(needsAlimentosTipoClarification("alimentos"));
    assert.ok(needsAlimentosTipoClarification("servicio de alimentos"));
    assert.ok(!isValidRequerimientosValue("alimentos"));
    assert.ok(isValidRequerimientosValue("taquiza"));

    const afterReq = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
    ]);
    assert.equal(
      getNextPendingField(
        emptyExtracted({
          nombre: "Aura",
          tipo_evento: "reunión familiar",
          requerimientos_evento: "alimentos",
        }),
        afterReq
      ),
      "requerimientos",
      "alimentos genérico no cierra servicios"
    );

    const filled = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Fecha y horario",
      "Lugar/dirección del evento",
      "Correo electrónico",
    ]);
    const extracted = emptyExtracted({
      nombre: "Aura Vargas",
      tipo_evento: "reunión familiar",
      requerimientos_evento: "Alimentos",
      fecha_horario: "26 de septiembre",
      direccion_evento: "colonia Educación, Coyoacán, CDMX",
      correo: "aura.elling237@gmail.com",
    });
    assert.equal(getNextPendingField(extracted, filled), "requerimientos");
    const close = runGuards({
      aiResponse:
        "Perfecto, ya tengo todo. He anotado el servicio de Alimentos y voy a compartir esta información con el equipo para que puedan prepararte una cotización personalizada.",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "CDMX*",
      history: [{ role: "assistant", content: "¿Me compartes un correo para enviarte los detalles?" }],
    });
    assert.ok(!/ya tengo todo/i.test(close), close.slice(0, 400));
    assert.ok(/banquete|casual|taquiza|pizzas|pastas|sushi/i.test(close), close.slice(0, 400));

    const cityAgain = runGuards({
      aiResponse: "Gracias por tu correo, Claro. ¿En qué ciudad lo arman?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "aura.elling237@gmail.com",
      history: [{ role: "assistant", content: "¿Me compartes un correo para enviarte los detalles?" }],
    });
    assert.ok(!/ciudad lo arman|en qu[eé] ciudad/i.test(cityAgain), cityAgain.slice(0, 400));
    assert.ok(/banquete|casual|taquiza|pizzas|pastas|sushi/i.test(cityAgain), cityAgain.slice(0, 400));
  });

  await test("137. V9.40 — servicio de alimentos ofrece tipos (todas las ramas)", () => {
    assert.ok(isVagueFoodTerm("Pues mira principalmente me interesa el servicio de alimentos"));
    const reply = runGuards({
      aiResponse: "¿Ya hay día y hora, o siguen viendo opciones?",
      extracted: emptyExtracted({
        nombre: "Aura Vargas",
        tipo_evento: "reunión familiar",
        requerimientos_evento: "Alimentos",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "Pues mira principalmente me interesa el servicio de alimentos",
      history: [
        { role: "assistant", content: "¿Qué van a celebrar?" },
        { role: "user", content: "es una reunión familiar" },
        { role: "assistant", content: "Anoto tu reunión familiar. ¿Qué te gustaría revisar primero?" },
      ],
    });
    assert.ok(!/d[ií]a y hora|fecha/i.test(reply), reply.slice(0, 500));
    assert.ok(/banquete/i.test(reply) && /casual|taquiza|pizzas|pastas/i.test(reply), reply.slice(0, 500));

    const taquizaNext = getNextPendingField(
      emptyExtracted({
        nombre: "Aura",
        tipo_evento: "reunión familiar",
        requerimientos_evento: "Taquiza",
      }),
      new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"])
    );
    assert.equal(taquizaNext, "invitados");
  });

  await test("138. V9.41 — A15383 Kelia: ciudad, banquetes, LED≠luz, no spam (todas las ramas)", () => {
    assert.equal(LUCY_PROMPT_VERSION, "V9.43");

    const hornoMty = parseZonaFromText("En horno 3 Monterrey") ?? "";
    assert.match(hornoMty, /horno\s*3/i, hornoMty);
    assert.match(hornoMty, /monterrey/i, hornoMty);
    assert.ok(isVenueWithoutCity("Horno 3"));
    assert.ok(!isUsableDireccionEvento("Horno 3"));
    assert.ok(isUsableDireccionEvento(hornoMty));
    assert.ok(isUsableDireccionEvento("Monterrey"));
    assert.match(recoverZonaFromUserTexts(["En horno 3 Monterrey"], "Monterrey") ?? "", /monterrey/i);

    assert.equal(parsePresupuestoFromText("Si 5 de octubre 2027"), null);
    assert.match(parsePresupuestoFromText("Opción completa por favor") ?? "", /propong/i);
    assert.equal(parseInvitadosFromText("Me gustaría menú de tres tiempos - high end"), null);
    assert.ok(isUnusableTipoEventoReply("Hola Lucy"));
    assert.ok(!isUnusableTipoEventoReply("Es un evento corporativo"));

    const tipoCaps = captureContextualAnswer(
      [{ role: "assistant", content: "¿Qué tipo de evento tienen planeado realizar?" }],
      "Hola Lucy",
      new Set(["Nombre del cliente"])
    );
    assert.equal(tipoCaps.find((c) => c.label === "Tipo de evento"), undefined);

    const spam =
      "Platícame qué te gustaría armar para el evento. Platícame qué te gustaría armar para el evento. Platícame qué te gustaría armar para el evento. Platícame qué te gustaría armar para el evento.";
    const collapsed = collapseRepeatedSentences(spam);
    assert.equal((collapsed.match(/Platícame/gi) ?? []).length, 1, collapsed);

    const mariachiMsg =
      "Si me gustaría algún baile regional, los de percusión con led, algún grupo más básico, manejan mariachis?";
    assert.equal(clientAsksAboutLighting(mariachiMsg), false);
    assert.ok(clientMentionsEntertainment(mariachiMsg));
    assert.ok(parseServicesFromText(mariachiMsg).some((s) => /mariachi|baile regional|robots led/i.test(s)));

    const banquetQ = "En cuanto a banquetes que opciones manejan?";
    assert.ok(parseServicesFromText(banquetQ).includes("Banquete Formal"));
    const banquetAck = buildGuardServiceAck(banquetQ);
    assert.ok(!/\*En cuanto a banquetes/i.test(banquetAck), banquetAck.slice(0, 240));
    assert.ok(/formal|mexicano|tiempos/i.test(banquetAck), banquetAck.slice(0, 400));
    const banquetGuard = runGuards({
      aiResponse:
        "¡Claro! *En cuanto a banquetes que opciones manejan?* la anoto para tu cotización. Para *comida* del evento, ¿qué te gustaría?",
      extracted: emptyExtracted({
        nombre: "Kelia Zazueta",
        tipo_evento: "evento corporativo",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: banquetQ,
      history: [
        {
          role: "assistant",
          content: "¿Qué te gustaría revisar primero para empezar a armar tu propuesta?",
        },
      ],
    });
    assert.ok(!/\*En cuanto a banquetes/i.test(banquetGuard), banquetGuard.slice(0, 280));
    assert.ok(/formal|mexicano|tiempos|banquete/i.test(banquetGuard), banquetGuard.slice(0, 400));
    assert.ok(
      clientChoseBanqueteFormal(
        "Me gustaría menú de tres tiempos - considerando que es un perfil de cliente high end"
      )
    );

    const mergedSvc = mergeServiceRequirements("Banquete Formal", mariachiMsg, 6) ?? "";
    assert.match(mergedSvc, /banquete/i);
    assert.ok(/mariachi|baile|animaci|robots/i.test(mergedSvc), mergedSvc);

    const filledCity = new Set([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Fecha y horario",
      "Lugar/dirección del evento",
      "Correo electrónico",
      "Número de invitados",
    ]);
    const extractedCity = emptyExtracted({
      nombre: "Kelia Zazueta",
      tipo_evento: "evento corporativo",
      requerimientos_evento: "Banquete Formal",
      fecha_horario: "5 de octubre 2027",
      direccion_evento: "Horno 3, Monterrey",
      correo: "kelia.zazueta@dmsmexico.com",
      num_invitados: 40,
    });
    const noCityAgain = runGuards({
      aiResponse: "Perfecto. Kelia, ¿ya tienen ciudad del evento?",
      extracted: extractedCity,
      filledSet: filledCity,
      readyForClosing: false,
      currentMessage: "40 aproximadamente",
      history: [
        { role: "user", content: "En horno 3 Monterrey" },
        { role: "assistant", content: "¿Me confirmas la *ciudad* del evento?" },
        { role: "user", content: "Monterrey" },
        { role: "assistant", content: "¿cuántos invitados tienen contemplados aproximadamente?" },
      ],
    });
    assert.ok(!/ciudad del evento|en qu[eé] ciudad/i.test(noCityAgain), noCityAgain.slice(0, 400));

    const entReply = runGuards({
      aiResponse: "Buena pregunta sobre iluminación — eso lo confirmo con nuestro equipo para darte el dato exacto.",
      extracted: emptyExtracted({
        nombre: "Kelia Zazueta",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Banquete Formal",
        fecha_horario: "5 de octubre 2027",
        direccion_evento: "Horno 3, Monterrey",
        correo: "kelia.zazueta@dmsmexico.com",
        num_invitados: 40,
      }),
      filledSet: new Set(filledCity),
      readyForClosing: false,
      currentMessage: mariachiMsg,
      history: [{ role: "assistant", content: "¿Buscas show en vivo, hora loca, o ya tienes un formato en mente?" }],
    });
    assert.ok(!/iluminaci[oó]n/i.test(entReply), entReply.slice(0, 400));
    assert.ok(/mariachi|baile regional|percusi|entretenimiento/i.test(entReply), entReply.slice(0, 400));

    const tiemposReply = runGuards({
      aiResponse: "¿Quieres que te dé detalles de alguno?",
      extracted: emptyExtracted({
        nombre: "Kelia Zazueta",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Banquete Formal",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage:
        "Me gustaría menú de tres tiempos - considerando que es un perfil de cliente high end",
      history: [
        {
          role: "assistant",
          content: "Para comida del evento, ¿qué te gustaría? Banquete formal o algo más casual.",
        },
      ],
    });
    assert.ok(/formal|mexicano|tiempos|\$/i.test(tiemposReply), tiemposReply.slice(0, 500));
    assert.ok(
      /fecha|cu[aá]ndo|d[ií]a|invitados|correo|e-?mail|cu[aá]nt[oa]s|personas/i.test(tiemposReply),
      `3 tiempos debe seguir el embudo: ${tiemposReply.slice(-280)}`
    );
    assert.ok((tiemposReply.match(/Platícame/gi) ?? []).length <= 1);

    const nameSpam = dedupeTransitionsInMessage("Perfecto, Kelia. Listo. Kelia, ¿en qué ciudad sería?");
    assert.ok(!/Listo\.\s*Kelia/i.test(nameSpam), nameSpam);
  });

  // ─── V9.42 — A15391 Mariana: Coffee Break 4, "4. nombre", handoff, horario ≠ menú ───
  await test("139. V9.42 — A15391 Mariana: CB4 detalle, 4. mariana, asesor, horario", () => {
    assert.equal(LUCY_PROMPT_VERSION, "V9.43");
    const menu = buildProgressiveOptionsMenu("coffee_break");
    assert.equal(extractNumberedNivelFromLastAssistant("4. mariana", menu), "Coffee Break 4");
    assert.ok(isCatalogLevelSelection("4. mariana", menu));
    assert.equal(
      resolveProgressiveDetailQuery({
        currentMessage: "4. mariana",
        serviceHint: "Coffee Break",
        history: [{ role: "assistant", content: menu }],
      }),
      "Coffee Break 4"
    );
    assert.ok(
      !clientWantsServiceDetail("dia no, horario 9-12 y despues 3-4pm", [
        { role: "assistant", content: menu },
      ])
    );
    assert.match(parseFechaFromText("dia no, horario 9-12 y despues 3-4pm") ?? "", /9-12|horario/i);
    assert.ok(clientAsksForHumanAdvisor("comunicame con una persona"));
    assert.ok(clientAsksForHumanAdvisor("comunicame con un asesor"));

    setCatalogSnapshotForTests(
      parseSheetCatalogCsv(
        [
          '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye","Sinonimos"',
          '"Coffee Break","Coffee Break 1","$120.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café, galletas y agua"',
          '"Coffee Break","Coffee Break 2","$200.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café, pan dulce y fruta"',
          '"Coffee Break","Coffee Break 3","$280.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café premium y snacks"',
          '"Coffee Break","Coffee Break 4","$350.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Estación completa CB4"',
          '"Coffee Break","Coffee Break 5","$400.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Estación completa CB5"',
        ].join("\n")
      )
    );
    const cb4Detail = buildCatalogServiceDetailAnswer("Coffee Break 4") ?? "";
    assert.match(cb4Detail, /350|CB4|Coffee Break 4/i, cb4Detail.slice(0, 400));
    assert.ok(
      !/manejamos estos niveles[\s\S]*Coffee Break 1[\s\S]*Coffee Break 5/i.test(cb4Detail),
      cb4Detail.slice(0, 500)
    );

    const hist: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "assistant", content: menu }];
    const pickCompound = runGuards({
      aiResponse: "De acuerdo. ¿Quieres que te dé detalles de alguno?",
      extracted: emptyExtracted({
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Coffee Break",
      }),
      filledSet: new Set(["Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "4. mariana",
      history: hist,
      whatsappDisplayName: "Mariana Ogarrio",
    });
    assert.ok(!/^de acuerdo\.\s*¿quieres que te d[eé] detalles de alguno/i.test(pickCompound.trim()));
    assert.ok(/Coffee Break 4|350|CB4|incluye/i.test(pickCompound), pickCompound.slice(0, 500));
    assert.ok(!/Coffee Break 1[\s\S]{0,80}Coffee Break 2[\s\S]{0,80}Coffee Break 3/i.test(pickCompound));

    const pickCb4 = runGuards({
      aiResponse: "Claro que sí. Te detallo Coffee Break 4. Para Coffee Break manejamos estos niveles…",
      extracted: emptyExtracted({
        nombre: "Mariana",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Coffee Break",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "coffe break 4",
      history: hist,
    });
    assert.ok(/Coffee Break 4|350|CB4|estación completa/i.test(pickCb4), pickCb4.slice(0, 500));
    assert.ok(
      !/manejamos estos niveles[\s\S]*Coffee Break 1[\s\S]*Coffee Break 5/i.test(pickCb4),
      pickCb4.slice(0, 500)
    );

    const handoff = runGuards({
      aiResponse: "Con gusto. ¿Tienen un estimado de invitados?",
      extracted: emptyExtracted({
        nombre: "Mariana",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Coffee Break 4",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "comunicame con una persona",
      history: [
        ...hist,
        { role: "assistant", content: "Te detallo Coffee Break 4. ¿Quieres que te dé detalles de alguno?" },
      ],
    });
    assert.ok(/55\s*4008\s*0373/i.test(handoff), handoff.slice(0, 400));
    assert.ok(!/invitados|cu[aá]nt[oa]s|ciudad del evento|en qu[eé] ciudad/i.test(handoff), handoff.slice(0, 400));
  });

  await test("140. V9.43 — detalle de un producto no re-lista el menú (todas las ramas)", () => {
    assert.equal(LUCY_PROMPT_VERSION, "V9.43");
    setCatalogSnapshotForTests(
      parseSheetCatalogCsv(
        [
          '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Link catalogo","Que Incluye","Sinonimos"',
          '"Coffee Break","Coffee Break 1","$120.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Café, galletas y agua"',
          '"Coffee Break","Coffee Break 4","$350.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Estación completa CB4"',
          '"Coffee Break","Coffee Break 5","$400.00","$7,500.00","TRUE","https://bodasesor.com/catalogos/coffee-break","Estación completa CB5"',
          '"Taquiza","Basico","$750.00","$15,000.00","TRUE","https://bodasesor.com/catalogos/taquiza","Tacos básicos"',
          '"Taquiza","Tradicional","$800.00","$15,000.00","TRUE","https://bodasesor.com/catalogos/taquiza","Tacos tradicionales y salsas"',
          '"Taquiza","Premium","$850.00","$15,000.00","TRUE","https://bodasesor.com/catalogos/taquiza","Tacos premium y bartender"',
        ].join("\n")
      )
    );
    const cb4 = buildCatalogServiceDetailAnswer("Coffee Break 4") ?? "";
    assert.ok(!looksLikeNivelOptionsDump(cb4), cb4.slice(0, 400));
    assert.match(cb4, /350|CB4|Coffee Break 4/i, cb4.slice(0, 400));

    const trad = buildCatalogServiceDetailAnswer("Taquiza Tradicional") ?? "";
    assert.ok(!looksLikeNivelOptionsDump(trad), trad.slice(0, 400));
    assert.match(trad, /tradicional|800/i, trad.slice(0, 400));

    const dump =
      "Claro que sí. Te detallo *Coffee Break 4*:\n\nPara *Coffee Break* manejamos estos niveles:\n\n1. *Coffee Break 4* — $350.00 /pp\n2. *Coffee Break 1* — $120.00 /pp\n\n¿Quieres que te dé detalles de alguno?";
    assert.ok(looksLikeNivelOptionsDump(dump));
    const menu = buildProgressiveOptionsMenu("coffee_break");
    const rewritten = runGuards({
      aiResponse: dump,
      extracted: emptyExtracted({
        nombre: "Mariana",
        tipo_evento: "evento corporativo",
        requerimientos_evento: "Coffee Break",
      }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios"]),
      readyForClosing: false,
      currentMessage: "coffe break 4",
      history: [{ role: "assistant", content: menu }],
    });
    assert.ok(!looksLikeNivelOptionsDump(rewritten), rewritten.slice(0, 500));
    assert.ok(/Coffee Break 4|350|CB4/i.test(rewritten), rewritten.slice(0, 500));
  });

  console.log(`\n${passed} OK, ${failed} fallidas de ${passed + failed} escenarios`);
  if (failed > 0) process.exit(1);
}
function ALGO_MAS_OR_EMPTY(msg: string): boolean {
  return /\b(algo\s+m[aá]s|alg[uú]n\s+otro\s+servicio)\b/i.test(msg);
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
