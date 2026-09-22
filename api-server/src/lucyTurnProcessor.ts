/**
 * Pipeline unificado Lucy — webhook, salesbot y simulador comparten extracción,
 * generación, catálogo, guards y formatForWhatsApp.
 */
import type OpenAI from "openai";
import type { ExtractedData } from "./types.js";
import { filterClientEmail, looksLikeValidClientEmail, sanitizeStoredClientEmail } from "./client-email.js";
import { resolveTipoContacto, looksLikeClienteCorrection } from "./tipoContacto.js";
import {
  buildProveedorHandoffReply,
  extractEmpresaFromText,
  scrubClientFieldsForProveedor,
} from "./lib/proveedorHandoff.js";
import {
  applyProveedorAnswer,
  buildProveedorProgressReply,
  formatProveedorRequirements,
  hydrateProveedorFieldsFromRequirements,
  proveedorQuestionnaireComplete,
  scrubProveedorFieldsForCliente,
} from "./lib/proveedorQuestionnaire.js";
import { detectModoServicio } from "./modoServicio.js";
import {
  applyWebLeadBrief,
  parseCorreoFromText,
  recoverClienteNombreFromHistory,
  sanitizeExtractedAmbiguousNumbers,
  inferLucyAskedField,
  isUnusableTipoEventoReply,
  parseFechaFromText,
  isRicherFechaCapture,
  parseZonaFromText,
  isRicherDireccionCapture,
} from "./conversation-understanding.js";
import { enrichExtractedFromText } from "./services/summaryService.js";
import { enrichExtractedDireccionWithMaps } from "./services/geoResolve.js";
import { sanitizeCrmNombre } from "./contact-name.js";
import { buildDynamicPrompt, buildStaticSystemPrompt, buildDynamicTurnContext } from "./services/promptBuilder.js";
import { fetchTrendGroundingSnippet } from "./services/googleGrounding.js";
import {
  buildRedactionBriefing,
  completeLucyRedaction,
  completeLucyUnifiedTurn,
  mergeExtractedPatch,
} from "./services/lucyRedaction.js";
import { buildLucyInfoPromptBlock, warmLucyInfoPriceCache } from "./services/lucyInfoStore.js";
import {
  getCatalogPromptBlock,
  injectCatalogPriceIfAsked,
  injectCatalogInclusionIfAsked,
  injectCatalogCateringIfAsked,
  formatServiceDataForPrompt,
} from "./services/catalogService.js";
import { formatServiceKnowledgeForPrompt } from "./services/serviceKnowledge.js";
import { getTrainingExamples } from "./lib/training.js";
import {
  applyLucyMessageGuards,
  detectEmailRefusal,
  ensureOutboundAlwaysAsks,
  getNextPendingField,
} from "./lucy-flow-guards.js";
import { finalizeLucyOutboundMessage } from "./lucyOutboundPipeline.js";
import {
  buildUnclearHandoffMessage,
  isStuckLoopTurn,
  nextUnclearStreak,
  shouldEscalateForUnclear,
  UNCLEAR_STREAK_ESCALATION,
} from "./lucyUnclearStreak.js";
import {
  getLucyFewShotMax,
  isLucyUnifiedLlmTurn,
  trimChatHistory,
} from "./lib/lucyCostControls.js";
import { detectIntent, analyzeSentiment, detectObjection } from "./services/intentDetection.js";
import { calculateLeadScore, detectStage } from "./services/leadScoring.js";

export interface PrepareLucyExtractionInput {
  fullHistory: OpenAI.Chat.ChatCompletionMessageParam[];
  messageText: string;
  crmLines: string[];
  extractFn: (
    history: OpenAI.Chat.ChatCompletionMessageParam[],
    latestUserText: string,
    crmHint: string
  ) => Promise<ExtractedData>;
}

export interface PrepareLucyExtractionResult {
  extracted: ExtractedData;
  conversationText: string;
  /** A16075: era proveedor (CRM/LLM) y el mensaje aclara que es cliente. */
  proveedorRecoveredToCliente?: boolean;
}

/** Extracción + enrich unificados (misma pista CRM y mismo historial en las 3 rutas). */
export async function prepareLucyExtraction(
  input: PrepareLucyExtractionInput
): Promise<PrepareLucyExtractionResult> {
  const { fullHistory, messageText, crmLines, extractFn } = input;

  const extracted = await extractFn(fullHistory, messageText, crmLines.join("\n"));

  const lastAssistantForAmbig = [...fullHistory]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  const lastAskedAmbig = lastAssistantForAmbig
    ? inferLucyAskedField(lastAssistantForAmbig.content as string)
    : null;
  sanitizeExtractedAmbiguousNumbers(extracted, messageText, { lastAskedField: lastAskedAmbig });
  applyWebLeadBrief(extracted, messageText);

  extracted.nombre = sanitizeCrmNombre(extracted.nombre);
  if (extracted.correo) {
    // A15165: nunca caer a raw GPT ("Am@gmial" / "A.gmail.com").
    extracted.correo = sanitizeStoredClientEmail(
      parseCorreoFromText(extracted.correo) ?? extracted.correo
    );
  }

  const conversationText = [
    ...fullHistory
      .filter((m) => m.role === "user" && typeof m.content === "string")
      .map((m) => m.content as string),
    messageText,
  ].join(" ");

  // Resolver tipo ANTES de enriquecer (A14936 / A16075).
  const priorProveedorSignal =
    extracted.tipo_contacto === "proveedor" ||
    /^PROVEEDOR:/i.test(extracted.requerimientos_evento ?? "") ||
    /\bPROVEEDOR\s*:/i.test(crmLines.join("\n"));

  extracted.tipo_contacto = resolveTipoContacto(
    extracted.tipo_contacto,
    conversationText,
    messageText
  );

  let proveedorRecoveredToCliente = false;
  if (
    extracted.tipo_contacto === "cliente" &&
    priorProveedorSignal &&
    looksLikeClienteCorrection(messageText)
  ) {
    scrubProveedorFieldsForCliente(extracted);
    proveedorRecoveredToCliente = true;
  }

  if (extracted.tipo_contacto === "proveedor") {
    Object.assign(extracted, scrubClientFieldsForProveedor(extracted));
    if (!extracted.empresa?.trim()) {
      extracted.empresa = extractEmpresaFromText(conversationText);
    }
    hydrateProveedorFieldsFromRequirements(extracted);
    if (!extracted.proveedor_oferta?.trim()) {
      const hint = /\baliados?\b|\bvenue\b|\bhacienda\b/i.test(conversationText)
        ? "Invitación a red de aliados / venue"
        : null;
      if (hint) extracted.proveedor_oferta = hint;
    }
    applyProveedorAnswer(extracted, messageText, conversationText);
    extracted.requerimientos_evento = formatProveedorRequirements(extracted);
  } else {
    enrichExtractedFromText(extracted, conversationText);
    sanitizeExtractedAmbiguousNumbers(extracted, messageText, { lastAskedField: lastAskedAmbig });
    if (!extracted.modo_servicio) {
      extracted.modo_servicio = detectModoServicio(conversationText);
    }
  }

  if (extracted.correo) {
    extracted.correo = sanitizeStoredClientEmail(
      parseCorreoFromText(extracted.correo) ?? extracted.correo
    );
  }
  // A14964: GPT/CRM a veces guarda "Lo acabo de mencionar" como tipo.
  if (isUnusableTipoEventoReply(extracted.tipo_evento)) {
    extracted.tipo_evento = null;
  }

  return { extracted, conversationText, proveedorRecoveredToCliente };
}

export async function buildLucySystemPrompt(opts: {
  messageText: string;
  conversationText: string;
  extracted: ExtractedData;
  crmContext: string;
  filledLabels: Set<string>;
  isFirstInteraction: boolean;
  messageCount?: number;
  conversationAgeHours?: number;
}): Promise<string> {
  const intentResult = detectIntent(opts.messageText);
  const objectionResult = detectObjection(opts.messageText);
  const scoreContext = {
    extracted: opts.extracted,
    messageCount: opts.messageCount ?? 1,
    hasResponded: true,
    conversationAge: opts.conversationAgeHours ?? 0,
    lastIntent: intentResult.intent,
    conversationText: opts.conversationText,
  };
  const leadScore = calculateLeadScore(scoreContext);
  const stage = detectStage(scoreContext);
  const lucyInfoQuery = [opts.messageText, opts.conversationText].filter(Boolean).join("\n");
  // Caché de precios PDF ANTES del prompt/guards (pista, salas, periqueras).
  await warmLucyInfoPriceCache().catch(() => 0);
  const [catalogBlock, lucyInfoBlock] = await Promise.all([
    getCatalogPromptBlock(),
    buildLucyInfoPromptBlock({ queryText: lucyInfoQuery }).catch(() => ""),
  ]);
  return buildDynamicPrompt({
    stage,
    priority: leadScore.priority,
    extracted: opts.extracted,
    hasObjection: objectionResult.hasObjection ? objectionResult : undefined,
    crmContext: opts.crmContext,
    isFirstInteraction: opts.isFirstInteraction,
    hasClientName: opts.filledLabels.has("Nombre del cliente"),
    catalogBlock,
    lucyInfoBlock: lucyInfoBlock || undefined,
  });
}

export function buildLucyRedactionBriefing(opts: {
  extracted: ExtractedData;
  filledSet: Set<string>;
  crmMergedLines: string[];
  messageText: string;
  conversationText: string;
  messageCount?: number;
  conversationAgeHours?: number;
  allFieldsFilled: boolean;
  isFirstInteraction: boolean;
  cierreYaEnviado?: boolean;
}): string {
  const intentResult = detectIntent(opts.messageText);
  const sentimentResult = analyzeSentiment(opts.messageText);
  const objectionResult = detectObjection(opts.messageText);
  const scoreContext = {
    extracted: opts.extracted,
    messageCount: opts.messageCount ?? 1,
    hasResponded: true,
    conversationAge: opts.conversationAgeHours ?? 0,
    lastIntent: intentResult.intent,
    conversationText: opts.conversationText,
  };
  const leadScore = calculateLeadScore(scoreContext);
  const stage = detectStage(scoreContext);

  const briefing = buildRedactionBriefing({
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    crmMergedLines: opts.crmMergedLines,
    intent: intentResult,
    sentiment: sentimentResult,
    stage,
    priority: leadScore.priority,
    allFieldsFilled: opts.allFieldsFilled,
    isFirstInteraction: opts.isFirstInteraction,
    hasObjection: objectionResult.hasObjection,
    objectionType: objectionResult.type,
    cierreYaEnviado: opts.cierreYaEnviado,
  });

  const serviceBlock =
    formatServiceKnowledgeForPrompt(opts.messageText) ??
    formatServiceDataForPrompt(opts.messageText);
  return serviceBlock ? `${briefing}\n\n${serviceBlock}` : briefing;
}

export interface GenerateLucyOutboundInput {
  messageText: string;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  fullHistory: OpenAI.Chat.ChatCompletionMessageParam[];
  extracted: ExtractedData;
  crmContext: string;
  crmMergedLines: string[];
  filledLabels: Set<string>;
  allFieldsFilled: boolean;
  isFirstInteraction: boolean;
  cierreYaEnviado: boolean;
  whatsappDisplayName: string | null;
  conversationText: string;
  openai: OpenAI;
  buildClosing: (servicios: string | null | undefined, name?: string | null) => string;
  entityId?: string | number;
  messageCount?: number;
  conversationAgeHours?: number;
  prependToAiResponse?: string;
  /** Turnos atorados acumulados de este lead (columna conversations.unclear_streak). */
  unclearStreak?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log?: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
}

export interface GenerateLucyOutboundResult {
  mensajeParaCliente: string;
  aiResponse: string;
  /** Contador de "no entendí" a persistir para el próximo turno. */
  unclearStreak: number;
  /** V9.78: se agotaron los reintentos — mover el lead a Humano Trabaja. */
  escalateUnclearToHuman: boolean;
  /** A16075: cuestionario proveedor listo → Sheets + zona proveedores. */
  proveedorReadyForHandoff?: boolean;
  /** A16075: mal clasificado; reactivar embudo cliente en Kommo. */
  proveedorRecoveredToCliente?: boolean;
}

/** Prompt → OpenAI → catálogo → guards → formatForWhatsApp (las 3 rutas). */
export async function generateLucyOutbound(
  input: GenerateLucyOutboundInput
): Promise<GenerateLucyOutboundResult> {
  const {
    messageText,
    history,
    fullHistory,
    extracted,
    crmContext,
    crmMergedLines,
    filledLabels,
    allFieldsFilled,
    isFirstInteraction,
    cierreYaEnviado,
    whatsappDisplayName,
    conversationText,
    openai,
    buildClosing,
    entityId,
    messageCount,
    conversationAgeHours,
    prependToAiResponse,
    unclearStreak = 0,
    log,
  } = input;

  // Foto del CRM antes del turno: si no crece, el mensaje del cliente no aportó nada.
  const filledBefore = new Set(filledLabels);

  // A14936 / A16075: proveedor → embudo corto (no handoff hasta completar).
  if (extracted.tipo_contacto === "proveedor") {
    applyProveedorAnswer(extracted, messageText, conversationText);
    const complete = proveedorQuestionnaireComplete(extracted);
    let reply = complete
      ? buildProveedorHandoffReply({
          nombre: extracted.nombre ?? whatsappDisplayName,
          empresa: extracted.empresa,
          conversationText,
          extracted,
        })
      : buildProveedorProgressReply(extracted);
    // A16244b: regla global — tampoco el embudo proveedor puede matar el chat.
    if (!/\?/.test(reply)) {
      reply = `${reply.trim()}\n\n¿Te confirmo por aquí cuando el equipo revise tu propuesta?`;
    }
    log?.info?.(
      {
        entityId,
        empresa: extracted.empresa,
        complete,
        oferta: extracted.proveedor_oferta,
        estado: extracted.proveedor_estado,
      },
      complete
        ? "Proveedor — cuestionario completo (handoff)"
        : "Proveedor — embudo cuestionario (Lucy activa)"
    );
    return {
      mensajeParaCliente: reply,
      aiResponse: reply,
      unclearStreak: 0,
      escalateUnclearToHuman: false,
      proveedorReadyForHandoff: complete,
      proveedorRecoveredToCliente: false,
    };
  }

  await enrichExtractedDireccionWithMaps(extracted, messageText).catch(() => undefined);

  const trainingExamples = await getTrainingExamples();
  const fewShotMax = getLucyFewShotMax();
  const fewShot: OpenAI.Chat.ChatCompletionMessageParam[] =
    fewShotMax > 0
      ? trainingExamples.slice(0, fewShotMax).flatMap((ex) => [
          { role: "user" as const, content: ex.userMessage },
          { role: "assistant" as const, content: ex.lucyResponse },
        ])
      : [];

  const historyTrimmed = trimChatHistory(history);

  const redactionBriefing = buildLucyRedactionBriefing({
    extracted,
    filledSet: filledLabels,
    crmMergedLines,
    messageText,
    conversationText,
    allFieldsFilled,
    isFirstInteraction,
    cierreYaEnviado,
    messageCount,
    conversationAgeHours,
  });

  let aiResponse: string;

  if (isLucyUnifiedLlmTurn()) {
    // V9.32: 1 llamada — system estático + contexto dinámico + JSON {extracted, reply}.
    // No construir system monolítico (evita tokens/caché thrashing).
    const intentResult = detectIntent(messageText);
    const objectionResult = detectObjection(messageText);
    const scoreContext = {
      extracted,
      messageCount: messageCount ?? 1,
      hasResponded: true,
      conversationAge: conversationAgeHours ?? 0,
      lastIntent: intentResult.intent,
      conversationText,
    };
    const leadScore = calculateLeadScore(scoreContext);
    const stage = detectStage(scoreContext);
    await warmLucyInfoPriceCache().catch(() => 0);
    const [catalogBlock, lucyInfoBlock, trendGroundingSnippet] = await Promise.all([
      getCatalogPromptBlock(),
      buildLucyInfoPromptBlock({
        queryText: [messageText, conversationText].filter(Boolean).join("\n"),
      }).catch(() => ""),
      fetchTrendGroundingSnippet({
        messageText,
        tipoEvento: extracted.tipo_evento,
      }).catch(() => null),
    ]);
    const dynamicContext = buildDynamicTurnContext({
      stage,
      priority: leadScore.priority,
      extracted,
      hasObjection: objectionResult.hasObjection ? objectionResult : undefined,
      crmContext,
      isFirstInteraction,
      hasClientName: filledLabels.has("Nombre del cliente"),
      catalogBlock,
      lucyInfoBlock: lucyInfoBlock || undefined,
      slimCatalog: true,
      messageText,
      trendGroundingSnippet,
    });

    const unified = await completeLucyUnifiedTurn({
      staticSystem: buildStaticSystemPrompt(),
      dynamicContext,
      briefing: redactionBriefing,
      history: [...fewShot, ...historyTrimmed],
      userMessage: messageText,
    });
    aiResponse = unified.reply;
    if (unified.parsedOk && unified.extractedPatch) {
      mergeExtractedPatch(extracted, unified.extractedPatch);
      extracted.nombre = sanitizeCrmNombre(extracted.nombre);
      // A15941: el parser del mensaje gana sobre mes suelto del LLM ("Octubre" vs "10 octubre").
      {
        const fromMsg = parseFechaFromText(messageText);
        if (fromMsg && isRicherFechaCapture(fromMsg, extracted.fecha_evento)) {
          extracted.fecha_evento = fromMsg;
        }
      }
      // A15942: ciudad+venue+calles del mensaje gana sobre solo ciudad del LLM.
      {
        const fromMsg = parseZonaFromText(messageText);
        if (fromMsg && isRicherDireccionCapture(fromMsg, extracted.direccion_evento)) {
          extracted.direccion_evento = fromMsg;
        }
      }
      if (extracted.correo) {
        extracted.correo = sanitizeStoredClientEmail(
          parseCorreoFromText(extracted.correo) ?? extracted.correo
        );
      }
      log?.info?.(
        { entityId, parsedOk: unified.parsedOk },
        "V9.32 turno unificado LLM (extract+reply en 1 call)"
      );
    }
  } else {
    const systemContent = await buildLucySystemPrompt({
      messageText,
      conversationText,
      extracted,
      crmContext,
      filledLabels,
      isFirstInteraction,
      messageCount,
      conversationAgeHours,
    });
    const lucyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      ...fewShot,
      ...historyTrimmed,
      { role: "user", content: messageText },
    ];
    aiResponse = await completeLucyRedaction(openai, lucyMessages, redactionBriefing);
  }

  aiResponse = injectCatalogInclusionIfAsked(
    messageText,
    aiResponse,
    extracted.requerimientos_evento ?? extracted.tipo_evento
  );
  aiResponse = injectCatalogCateringIfAsked(messageText, aiResponse);
  aiResponse = injectCatalogPriceIfAsked(messageText, aiResponse);

  if (prependToAiResponse?.trim()) {
    aiResponse = prependToAiResponse + aiResponse;
  }

  const emailRefusedThisTurn = detectEmailRefusal([messageText]);

  let mensajeParaCliente = applyLucyMessageGuards({
    aiResponse,
    extracted,
    filledSet: filledLabels,
    readyForClosing: allFieldsFilled,
    cierreYaEnviado,
    emailRefusedThisTurn,
    history: historyTrimmed,
    presentationHistory: fullHistory,
    currentMessage: messageText,
    whatsappDisplayName,
    buildClosing,
    log,
    entityId,
    forceFirstPresentation: isFirstInteraction,
  });

  mensajeParaCliente = await finalizeLucyOutboundMessage({
    mensaje: mensajeParaCliente,
    extracted,
    readyForClosing: allFieldsFilled,
    cierreYaEnviado,
    currentMessage: messageText,
    history: fullHistory,
    filledSet: filledLabels,
    openai,
    entityId,
    log,
  });

  // V9.78: si volvemos a pedir lo mismo sin haber entendido nada, contamos la
  // vuelta; a la tercera cortamos el bucle y pasamos el lead a un humano.
  const stuck = isStuckLoopTurn({
    outboundMessage: mensajeParaCliente,
    history: fullHistory,
    filledBefore,
    filledAfter: filledLabels,
    cierreYaEnviado,
    isFirstInteraction,
  });
  let nextStreak = nextUnclearStreak(unclearStreak, stuck);
  let escalateUnclearToHuman = false;

  if (shouldEscalateForUnclear(nextStreak)) {
    mensajeParaCliente = buildUnclearHandoffMessage(
      extracted.nombre ?? whatsappDisplayName
    );
    escalateUnclearToHuman = true;
    nextStreak = 0;
    log?.warn?.(
      { entityId, streak: UNCLEAR_STREAK_ESCALATION },
      "GUARD: V9.78 — bucle de no-entendí → handoff a Humano Trabaja"
    );
  } else if (stuck) {
    log?.info?.({ entityId, streak: nextStreak }, "GUARD: V9.78 — turno atorado (misma pregunta)");
  }

  // A16244b: invariante GLOBAL al final de TODAS las ramas (guards, anti-repeat, handoff).
  {
    const stillPending = !!getNextPendingField(extracted, filledLabels);
    mensajeParaCliente = ensureOutboundAlwaysAsks(mensajeParaCliente, {
      extracted,
      filledSet: filledLabels,
      ctx: {
        extracted,
        filledSet: filledLabels,
        history: fullHistory,
        currentMessage: messageText,
        whatsappName: whatsappDisplayName,
      },
      currentMessage: messageText,
      cierreYaEnviado: Boolean(cierreYaEnviado) && !stillPending,
    });
  }

  return {
    mensajeParaCliente,
    aiResponse,
    unclearStreak: nextStreak,
    escalateUnclearToHuman,
    proveedorReadyForHandoff: false,
    proveedorRecoveredToCliente: false,
  };
}
