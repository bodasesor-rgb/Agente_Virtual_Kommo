/**
 * Pipeline unificado Lucy — webhook, salesbot y simulador comparten extracción,
 * generación, catálogo, guards y formatForWhatsApp.
 */
import type OpenAI from "openai";
import type { ExtractedData } from "./types.js";
import { filterClientEmail } from "./client-email.js";
import { resolveTipoContacto } from "./tipoContacto.js";
import { detectModoServicio } from "./modoServicio.js";
import {
  applyWebLeadBrief,
  parseCorreoFromText,
  sanitizeExtractedAmbiguousNumbers,
} from "./conversation-understanding.js";
import { enrichExtractedFromText } from "./services/summaryService.js";
import { sanitizeCrmNombre } from "./contact-name.js";
import { detectIntent, analyzeSentiment, detectObjection } from "./services/intentDetection.js";
import { calculateLeadScore, detectStage } from "./services/leadScoring.js";
import { buildDynamicPrompt } from "./services/promptBuilder.js";
import {
  buildRedactionBriefing,
  completeLucyRedaction,
} from "./services/lucyRedaction.js";
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
  sanitizeExtractedAmbiguousNumbers(extracted, messageText);
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

  if (extracted.tipo_contacto === "proveedor") {
    const empresa = extracted.empresa ?? "";
    const desc = extracted.requerimientos_evento ?? "";
    if (empresa || desc) {
      extracted.requerimientos_evento = `PROVEEDOR: ${empresa ? empresa + " - " : ""}Ofrece: ${desc}`.slice(
        0,
        240
      );
    }
  } else {
    enrichExtractedFromText(extracted, conversationText);
    sanitizeExtractedAmbiguousNumbers(extracted, messageText);
    if (!extracted.modo_servicio) {
      extracted.modo_servicio = detectModoServicio(conversationText);
    }
  }

  extracted.tipo_contacto = resolveTipoContacto(extracted.tipo_contacto, conversationText);
  if (extracted.correo) {
    extracted.correo = filterClientEmail(parseCorreoFromText(extracted.correo) ?? extracted.correo);
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
  const catalogBlock = await getCatalogPromptBlock();
  return buildDynamicPrompt({
    stage,
    priority: leadScore.priority,
    extracted: opts.extracted,
    hasObjection: objectionResult.hasObjection ? objectionResult : undefined,
    crmContext: opts.crmContext,
    isFirstInteraction: opts.isFirstInteraction,
    hasClientName: opts.filledLabels.has("Nombre del cliente"),
    catalogBlock,
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
  log?: { warn: (obj: object, msg?: string) => void; info?: (obj: object, msg?: string) => void };
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

  const trainingExamples = await getTrainingExamples();
  const fewShot: OpenAI.Chat.ChatCompletionMessageParam[] = trainingExamples.flatMap((ex) => [
    { role: "user" as const, content: ex.userMessage },
    { role: "assistant" as const, content: ex.lucyResponse },
  ]);

  const lucyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...fewShot,
    ...history,
    { role: "user", content: messageText },
  ];

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

  let aiResponse = await completeLucyRedaction(openai, lucyMessages, redactionBriefing);
  aiResponse = injectCatalogInclusionIfAsked(messageText, aiResponse);
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
    history,
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
    openai,
    entityId,
    log,
  });

  return { mensajeParaCliente, aiResponse };
}
