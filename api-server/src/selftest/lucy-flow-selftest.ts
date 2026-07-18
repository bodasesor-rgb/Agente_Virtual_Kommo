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
  clientMentionsPistaTarima,
  isDimensionText,
  parseSpaceDimensions,
  parseZonaFromText,
  parseFechaFromText,
  parseCorreoFromText,
  isServiceLabelNotTipoEvento,
  clientAsksPhone,
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
  parseServicesFromText,
  mergeServiceRequirements,
  enrichExtractedFromConversation,
  isVagueVenueOnly,
  isUsableDireccionEvento,
  sanitizeExtractedAmbiguousNumbers,
  clientAsksForCatalog,
  clientWantsFullCatalog,
  clientAffirmsCatalogOffer,
  isCatalogLevelSelection,
  clientNeedsEmergencyContact,
  isRichQuoteBrief,
  clientAsksToRereadBrief,
  clientAsksDistributorPricing,
  buildRichBriefAcknowledgment,
  isGenericQuoteIntentRequerimiento,
  mergeZonaDetail,
  FECHA_MAX_ASKS,
  parseSalaProductFromText,
  isLikelyProductNameNotLocation,
  clientMentionsCarpas,
  clientAsksServiceInfo,
} from "../conversation-understanding.js";
import {
  applyLucyGlobalAntiRepetition,
  lucyTextOverlapRatio,
} from "../lucyOutboundAntiRepeat.js";
import { buildGuardServiceAck } from "../services/serviceKnowledge.js";
import { buildConsultativeNoPriceReply } from "../price-guard.js";
import { isQuoteIntentMessage, sanitizeDisplayName, sanitizeCrmNombre, isNombreMoreComplete, pickBetterNombre, isLikelyUbicacionNotNombre, isGreetingOnlyMessage, isLikelyNotPersonNameMessage, looksLikePersonFullName, clientAsksCompanyIdentity, buildCompanyIdentityReply } from "../contact-name.js";
import { filterClientEmail, isOwnCompanyEmail, looksLikeValidClientEmail, buildEmailConfirmationPrompt } from "../client-email.js";
import {
  resolveTipoContacto,
  clientAsksIfCompanyEmailCorrect,
  buildCompanyEmailConfirmReply,
} from "../tipoContacto.js";
import {
  buildFirstInteractionMessage,
  buildLocationAnswer,
  buildVagueFoodOptionsReply,
  buildEmergencyContactAnswer,
} from "../lucy-flow-guards.js";
import { advisorLabelForClient, normalizeAdvisorReferences, getAdvisorName, LEGACY_ADVISOR_NAMES, stripInternalCrmBlock, isStaffAdvisorName } from "../lib/bodasesorAdvisor.js";
import { buildResumenClienteLargo } from "../services/summaryService.js";
import {
  applyLucyMessageGuards,
  applyEmailWaiver,
  applyPresupuestoWaiver,
  buildPhoneAnswer,
  buildRecommendationsReply,
  buildPostCierreThanksReply,
  buildPostCierreCallbackAck,
  buildStandardClosingMessage,
  buildMultiServicePackageReply,
  buildPackageCatalogOfferBlock,
  clientSaysThanks,
  detectCierreEnviado,
  CLOSING_SIGNATURE,
  CLOSING_CORE_FIELDS,
  detectEmailRefusal,
  EMAIL_WAIVED_LABEL,
  getNextPendingField,
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
} from "../lucy-flow-guards.js";
import {
  sanitizeKommoCrmLines,
  sanitizeExtractedFromExternal,
} from "../lib/external-ingest-sanitize.js";
import { buildConsultativeNoPriceReply, clientAsksPrice } from "../price-guard.js";
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
  toDeliverableCatalogUrl,
  enrichBareNivelOffer,
  messageOffersLevelsWithoutInclusions,
  formatServiceDataForPrompt,
} from "../services/catalogService.js";
import { buildMobiliarioRentDetailReply } from "../services/serviceKnowledge.js";
import { resolveServiceFocusFromText, expandQueryWithServiceSynonyms } from "../services/serviceSynonyms.js";
import {
  parseSheetCatalogCsv,
  deriveCatalogCategory,
  formatCatalogRowLabel,
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
import { isImageMessage, getImageUrl, getImageCaption, cacheImageDescription, getCachedImageDescription, resetImageAnalysisCacheForTests, parseVisionImageJson, formatImageTurnText, formatImageTeamNote, extractImageClientReply, looksLikeImageInternalSummary } from "../services/imageProcessor.js";
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
import type { ExtractedData } from "../types.js";

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
  debugLogs?: string[];
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: opts.readyForClosing,
    cierreYaEnviado: false,
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

  await test('1. A14754 — "Busco comida" ofrece banquete/taquiza', () => {
    const filled = new Set(["Nombre del cliente", EMAIL_WAIVED_LABEL, "Tipo de evento"]);
    const extracted = emptyExtracted({ nombre: "Alejandro", tipo_evento: "cumpleaños" });
    const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "assistant", content: "¿Qué servicios te gustaría cotizar para la fiesta de cumpleaños?" },
    ];
    const lastLucy = history[0]!.content as string;
    assert.equal(inferLucyAskedField(lastLucy), "requerimientos");
    assert.ok(clientMentionsCatering("Busco comida"));
    assert.ok(isServiceRelatedMessage("Busco comida"));

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
    if (!/banquete|taquiza|catering|alimentos/i.test(reply)) {
      throw new Error(`respuesta inesperada: "${reply.slice(0, 200)}" | logs: ${debugLogs.join(" > ")}`);
    }
    assert.equal(parsePrimaryService("Busco comida"), "banquete / taquiza");
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
    assert.ok(/alimentos|mobiliario|DJ|iluminaci/i.test(reply), reply);
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
    assert.equal(getNextPendingField(emptyExtracted(), filled), "zona");
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
    assert.ok(healthSrc.includes('mode: "meta_plus_note"'));

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
      direccion_evento: "Club de Golf Mexico",
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
    assert.ok(/pista|tarima|iluminada|tamaño|anoto/i.test(reply), reply.slice(0, 200));
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
    assert.ok(/seguimos por aquí|invitados|servicios|pensado/i.test(reply), reply.slice(0, 200));

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

  await test("28. Lucy V7 — pedido/entrega, número ambiguo, orden ubicación→fecha→invitados", () => {
    assert.equal(detectModoServicio("quiero 50 rollos para llevar"), "pedido_entrega");
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
    assert.equal(getNextPendingField(emptyExtracted(), filled), "zona");
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
    assert.ok(carpa && /carpas?/i.test(carpa) && /Cathedral|Pirámide|Planas/i.test(carpa), carpa ?? "");

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

    const dirty = sanitizeKommoCrmLines([
      "- Nombre del cliente: Rodrigo",
      "- Tipo de evento: bautizo",
      "- Requerimientos o servicios: bautizo",
    ]);
    assert.equal(dirty.length, 1);
    assert.ok(/bautizo/i.test(dirty[0] ?? ""));

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
      /invitados|ciudad|fecha|presupuesto/i.test(replyNoGracias),
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
    assert.ok(/anoto|renta de letras/i.test(reply), reply.slice(0, 250));
    assert.ok(!/alg[uú]n\s+otro\s+servicio/i.test(reply), reply);
    assert.ok(/invitados|ciudad|fecha|presupuesto/i.test(reply), reply.slice(0, 250));
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
    assert.ok(/prefieres|niveles|opciones|tiempos/i.test(banquetePrice!), banquetePrice);

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
    assert.ok(/hola,?\s*soy\s+lucy/i.test(first), first.slice(0, 200));
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
    assert.ok(team, "debe pedir confirmación al equipo");
    assert.ok(/confirma nuestro equipo/i.test(team!), team);
    assert.ok(!/cerveza|vino|licor com[uú]n/i.test(team!), team);

    const filled = buildCatalogInclusionAnswer("qué incluye la barra premium");
    assert.ok(filled);
    assert.ok(/Refrescos, aguas y 3 licores premium/.test(filled!), filled);
    assert.ok(!/cerveza|vino com[uú]n/i.test(filled!), filled);
    assert.ok(!/dato real del Sheet/i.test(filled!), filled);

    const hallucinated = "La barra básica incluye cervezas, vinos y licores comunes.";
    const injected = injectCatalogInclusionIfAsked("qué incluye la barra básica", hallucinated);
    assert.ok(!/cerveza|vino/i.test(injected), injected);
    assert.ok(/confirma nuestro equipo/i.test(injected), injected);

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
    assert.ok(/hola,?\s*soy\s+lucy/i.test(first), first.slice(0, 200));
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

  await test("48. Karime — ubicación forzada antes de presupuesto/cierre", () => {
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
    assert.ok(/ciudad|colonia|sal[oó]n|ubicaci/i.test(reply), reply);
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

  await test("55. Catálogo web — Link del Sheet solo a petición", () => {
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

    const guardNoSend = runGuards({
      aiResponse:
        "Claro, te dejo el catálogo https://bodasesor.com/catalogos/barra-de-pizzas ¿cuántos invitados?",
      extracted: emptyExtracted({ nombre: "Ana", tipo_evento: "boda" }),
      filledSet: new Set(["Nombre del cliente", "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "quiero info de barra de pizzas",
      history: [],
    });
    assert.ok(
      !/bodasesor\.com\/catalogos/i.test(guardNoSend) ||
        /quieres que te mande el catálogo/i.test(guardNoSend),
      guardNoSend.slice(0, 400)
    );

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
    assert.ok(/tarima|pista|anoto|cotizaci[oó]n/i.test(reply), reply.slice(0, 300));
    assert.ok(
      !/alg[uú]n\s+otro\s+servicio|qu[eé]\s+otros\s+servicios|manejamos alimentos y barras.{0,40}dj/i.test(
        reply
      ),
      reply.slice(0, 400)
    );
    // Debe avanzar a un dato pendiente (invitados/zona/fecha…), no quedarse en menú.
    assert.ok(
      /invitados|personas|ciudad|colonia|sal[oó]n|fecha|horario|presupuesto/i.test(reply),
      reply.slice(0, 400)
    );
  });

  await test("57. Cierre menciona complementos (alimentos, DJ, mobiliario)", () => {
    const close = mockClosing("renta de tarima/pista 4x4", "Ana");
    assert.ok(/banquetes|alimentos/i.test(close), close);
    assert.ok(/\bDJ\b/i.test(close), close);
    assert.ok(/mobiliario/i.test(close), close);
    assert.ok(/tarima|pista/i.test(close), close);
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
    assert.equal(sanitizeCrmNombre("Buen Día"), null);
    assert.equal(sanitizeDisplayName("Hola buen día"), null);

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
    assert.ok(/ciudad|ubicaci[oó]n/i.test(emailReply), emailReply);

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
    assert.ok(/Cuál nivel prefieres/i.test(detail!), detail);
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
    assert.ok(/hola,?\s*soy\s+lucy/i.test(waReply), waReply.slice(0, 280));
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
    assert.ok(isUsableDireccionEvento("Salón Hacienda Los Olivos"));

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
    assert.ok(/hola,?\s*soy\s+lucy/i.test(first), first.slice(0, 300));
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
        filledAsk.applied.includes("filled-field-ack"),
      String(filledAsk.applied)
    );
    assert.ok(!mensajeAsksForField(filledAsk.mensaje, "correo"), filledAsk.mensaje);
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
