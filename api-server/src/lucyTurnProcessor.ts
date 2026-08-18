/**
 * Pipeline unificado Lucy — webhook, salesbot y simulador comparten extracción,
 * generación, catálogo, guards y formatForWhatsApp.
 */
import type OpenAI from "openai";
import type { ExtractedData } from "./types.js";
import { filterClientEmail } from "./client-email.js";
import { resolveTipoContacto } from "./tipoContacto.js";
import {
  buildProveedorHandoffReply,
  extractEmpresaFromText,
  scrubClientFieldsForProveedor,
} from "./lib/proveedorHandoff.js";
import { detectModoServicio } from "./modoServicio.js";
import {
  applyWebLeadBrief,
  parseCorreoFromText,
  recoverClienteNombreFromHistory,
  sanitizeExtractedAmbiguousNumbers,
  inferLucyAskedField,
  isUnusableTipoEventoReply,
} from "./conversation-understanding.js";
import { enrichExtractedFromText } from "./services/summaryService.js";
import { enrichExtractedDireccionWithMaps } from "./services/geoResolve.js";
import { sanitizeCrmNombre } from "./contact-name.js";
import { buildDynamicPrompt, buildStaticSystemPrompt, buildDynamicTurnContext } from "./services/promptBuilder.js";
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
} from "./lucy-flow-guards.js";
import { finalizeLucyOutboundMessage } from "./lucyOutboundPipeline.js";
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
    extracted.correo = filterClientEmail(parseCorreoFromText(extracted.correo) ?? extracted.correo);
  }

  const conversationText = [
    ...fullHistory
      .filter((m) => m.role === "user" && typeof m.content === "string")
      .map((m) => m.content as string),
    messageText,
  ].join(" ");

  // Resolver tipo ANTES de enriquecer (A14936: alianza ≠ embudo cliente).
  extracted.tipo_contacto = resolveTipoContacto(extracted.tipo_contacto, conversationText);

  if (extracted.tipo_contacto === "proveedor") {
    Object.assign(extracted, scrubClientFieldsForProveedor(extracted));
    if (!extracted.empresa?.trim()) {
      extracted.empresa = extractEmpresaFromText(conversationText);
    }
    const empresa = extracted.empresa ?? "";
    const desc = (extracted.requerimientos_evento ?? "").replace(/^PROVEEDOR:\s*/i, "").trim();
    const offerHint =
      desc ||
      (/\baliados?\b|\bvenue\b|\bhacienda\b/i.test(conversationText)
        ? "Invitación a red de aliados / venue"
        : "Oferta de proveedor");
    extracted.requerimientos_evento =
      `PROVEEDOR: ${empresa ? empresa + " - " : ""}Ofrece: ${offerHint}`.slice(0, 240);
  } else {
    enrichExtractedFromText(extracted, conversationText);
    sanitizeExtractedAmbiguousNumbers(extracted, messageText, { lastAskedField: lastAskedAmbig });
    if (!extracted.modo_servicio) {
      extracted.modo_servicio = detectModoServicio(conversationText);
    }
  }

  if (extracted.correo) {
    extracted.correo = filterClientEmail(parseCorreoFromText(extracted.correo) ?? extracted.correo);
  }
  // A14964: GPT/CRM a veces guarda "Lo acabo de mencionar" como tipo.
  if (isUnusableTipoEventoReply(extracted.tipo_evento)) {
    extracted.tipo_evento = null;
  }

  return { extracted, conversationText };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log?: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
}

export interface GenerateLucyOutboundResult {
  mensajeParaCliente: string;
  aiResponse: string;
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
    log,
  } = input;

  // A14936: proveedor / alianza → handoff fijo (sin formulario de evento).
  if (extracted.tipo_contacto === "proveedor") {
    const reply = buildProveedorHandoffReply({
      nombre: extracted.nombre ?? whatsappDisplayName,
      empresa: extracted.empresa,
      conversationText,
    });
    log?.info?.(
      { entityId, empresa: extracted.empresa },
      "Proveedor/alianza detectado — handoff (sin embudo cliente)"
    );
    return { mensajeParaCliente: reply, aiResponse: reply };
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
    const [catalogBlock, lucyInfoBlock] = await Promise.all([
      getCatalogPromptBlock(),
      buildLucyInfoPromptBlock({
        queryText: [messageText, conversationText].filter(Boolean).join("\n"),
      }).catch(() => ""),
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
      if (extracted.correo) {
        extracted.correo = filterClientEmail(
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

  return { mensajeParaCliente, aiResponse };
}
