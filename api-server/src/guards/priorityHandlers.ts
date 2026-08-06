import type OpenAI from "openai";
import type { ExtractedData } from "../types.js";
import {
  buildCompanyIdentityReply,
  clientAsksCompanyIdentity,
  sanitizeCrmNombre,
  sanitizeDisplayName,
} from "../contact-name.js";
import {
  assistantOfferedCatalogDetail,
  clientAffirmsCatalogOffer,
  clientAsksForCatalog,
  clientAsksGenericMenuCatalog,
  clientWantsFullCatalog,
  clientAsksDistributorPricing,
  dedupeServiceHierarchy,
  isRichQuoteBrief,
  parsePrimaryService,
  parseServicesFromText,
} from "../conversation-understanding.js";
import {
  buildCatalogWebLinkReply,
  buildCatalogPriceAnswer,
  buildCatalogServiceDetailAnswer,
  buildPdfInclusionReply,
  clientAsksInclusion,
  messageOffersCatalogLink,
  resolveCatalogInclusionReply,
} from "../services/catalogService.js";
import {
  resolveDetailQueryForFamily,
  shouldOfferOptionsBeforeDetail,
} from "../services/serviceProgressiveOffer.js";
import {
  buildAlejandroPriceReply,
  clientAsksPrice,
  getPriceServiceLabel,
  mentionsListedPriceService,
  mentionsNoListedPriceService,
  messageClaimsPrice,
  responseHasInventedPrice,
  sanitizeInventedPrices,
} from "../price-guard.js";
import { buildMultiServicePackageReply, buildMultiServiceSheetLevelsReply } from "./catalogOffer.js";
import { collectUserTexts } from "./historyHelpers.js";
import { pickTransition } from "./transitions.js";
import { buildCompanyEmailConfirmReply, clientAsksIfCompanyEmailCorrect } from "../tipoContacto.js";
import { buildPackageCatalogOfferBlock, collectServicesForCatalogOffer } from "./catalogOffer.js";
import { tryApplyPostCierreOrHandoffReply } from "./postCierreHandler.js";
import type { GuardDecision, GuardHandler } from "./policy.js";

export type PriorityGuardContext = {
  cierreYaEnviado: boolean;
  currentMessage?: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  presHistory: OpenAI.Chat.ChatCompletionMessageParam[];
  whatsappDisplayName?: string | null;
  entityId?: string | number;
  log?: { info: (obj: unknown, msg?: string) => void };
  lastAssistantMsg?: OpenAI.Chat.ChatCompletionMessageParam;
  mentionedServiceNow: string | null;
  aiResponse: string;
  needsNextStep: boolean;
  trulyReadyForClosing: boolean;
  mergeWithPendingQuestion: (mensaje: string) => string;
  buildNaturalQuestion: (field: string) => string;
  getNextPendingField: () => string | null;
  buildGenericPriceClarifyReply: () => string;
  buildGenericPackagesOverviewReply: () => string;
  findMentionedService: (text: string) => string | null;
  isValidRequerimientosValue: (value: string | null | undefined) => boolean;
};

export const handlePostCierreOrHandoff: GuardHandler<PriorityGuardContext> = (ctx) => {
  const result = tryApplyPostCierreOrHandoffReply({
    cierreYaEnviado: ctx.cierreYaEnviado,
    currentMessage: ctx.currentMessage,
    extracted: ctx.extracted,
    filledSet: ctx.filledSet,
    history: ctx.presHistory,
    whatsappDisplayName: ctx.whatsappDisplayName,
    entityId: ctx.entityId,
    log: ctx.log,
  });
  return result
    ? {
        kind: "reply",
        id: result.logMsg,
        mensaje: result.mensaje,
        effects: { appliedDirectReply: true },
      }
    : { kind: "continue" };
};

export const handleCompanyContact: GuardHandler<PriorityGuardContext> = (ctx) => {
  if (clientAsksIfCompanyEmailCorrect(ctx.currentMessage)) {
    return {
      kind: "reply",
      id: "GUARD: cliente preguntó por correo de Bodasesor",
      mensaje: buildCompanyEmailConfirmReply(),
      effects: { appliedDirectReply: true },
    };
  }

  if (clientAsksCompanyIdentity(ctx.currentMessage)) {
    const knownName =
      sanitizeCrmNombre(ctx.extracted.nombre) ??
      sanitizeCrmNombre(ctx.whatsappDisplayName) ??
      sanitizeDisplayName(ctx.whatsappDisplayName);
    return {
      kind: "reply",
      id: "GUARD: cliente preguntó si es Cap&Bara/Bodasesor",
      mensaje: buildCompanyIdentityReply(knownName),
      effects: { appliedDirectReply: true },
    };
  }

  return { kind: "continue" };
};

export const handleExplicitCatalog: GuardHandler<PriorityGuardContext> = (ctx) => {
  const { currentMessage, extracted, lastAssistantMsg, mentionedServiceNow, presHistory } = ctx;
  if (
    !(
      clientAsksForCatalog(currentMessage) ||
      clientAffirmsCatalogOffer(
        currentMessage,
        lastAssistantMsg && typeof lastAssistantMsg.content === "string"
          ? (lastAssistantMsg.content as string)
          : null
      ) ||
      // A14994 / todas las ramas: si el CTA de catálogo está en hilo reciente (no solo el último msg).
      clientAffirmsCatalogOffer(
        currentMessage,
        [...presHistory]
          .reverse()
          .filter((m) => m.role === "assistant" && typeof m.content === "string")
          .slice(0, 3)
          .map((m) => m.content as string)
          .find((t) => assistantOfferedCatalogDetail(t)) ?? null
      )
    )
  ) {
    return { kind: "continue" };
  }

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
  const mensaje =
    !wantFull && mappedServices.length > 0
      ? (() => {
          const mapped = buildPackageCatalogOfferBlock(
            mappedServices,
            `${serviceHint ?? ""} ${historyHint}`
          ).replace(/\n*¿Quieres que te mande el catálogo con más detalle\??\s*/gi, "\n");
          return /bodasesor\.com\/catalogos/i.test(mapped)
            ? `Claro.\n\n${mapped}`.trim()
            : buildCatalogWebLinkReply({
                query: historyHint || (currentMessage ?? ""),
                wantFull: false,
                serviceHint,
              });
        })()
      : buildCatalogWebLinkReply({
          query: "catálogo general",
          wantFull: true,
          serviceHint: null,
        });

  return {
    kind: "reply",
    id: "GUARD: cliente pidió/afirmó catálogo — link(s)",
    mensaje,
    effects: { appliedDirectReply: true },
  };
};

export const handleInclusionAndPackage: GuardHandler<PriorityGuardContext> = (ctx) => {
  const { currentMessage, extracted, filledSet, presHistory } = ctx;
  if (!clientAsksInclusion(currentMessage) || ctx.cierreYaEnviado) {
    return { kind: "continue" };
  }

  // A14982: "ofreces los paquetes" con 2+ servicios en CRM → niveles Sheet de ambos + embudo.
  const multiForPackages = dedupeServiceHierarchy([
    ...parseServicesFromText(extracted.requerimientos_evento ?? ""),
    ...parseServicesFromText(currentMessage ?? ""),
  ]);
  const asksPackagesList =
    /\bpaquetes?\b|\bniveles?\b|\bofreces?\b|idea\s+m[aá]s\s+clara/i.test(currentMessage ?? "");
  const multiPackageDump =
    asksPackagesList && multiForPackages.length >= 2
      ? buildMultiServiceSheetLevelsReply(multiForPackages, currentMessage)
      : null;
  if (multiPackageDump) {
    return {
      kind: "reply",
      id: "GUARD: paquetes multi-servicio — niveles Sheet + siguiente dato",
      mensaje: ctx.mergeWithPendingQuestion(
        `${pickTransition(presHistory)} Claro, te dejo los paquetes/niveles con precios:\n\n${multiPackageDump}`
      ),
      effects: { appliedSalesReply: true, appliedDirectReply: true },
    };
  }

  // V8.68: "qué incluye banquete/coffee…" sin variante → menú, no dump PDF.
  const inclusionOptions = shouldOfferOptionsBeforeDetail({
    currentMessage,
    history: presHistory,
    serviceHint: extracted.requerimientos_evento,
  });
  if (inclusionOptions) {
    return {
      kind: "reply",
      id: "GUARD: inclusiones — menú de opciones antes del detalle",
      mensaje: `${pickTransition(presHistory)} ${inclusionOptions.menu}`.trim(),
      effects: { appliedSalesReply: true, appliedDirectReply: true },
    };
  }

  // Prioridad absoluta: describir paquetes (no depende de allowSalesReplyOverride).
  const userBlob = collectUserTexts(presHistory, currentMessage).join(" ");
  const req = extracted.requerimientos_evento?.trim() ?? "";
  // A14947: si el hilo es banquete/catering, NUNCA resolver a Betún/Cupcakes.
  let serviceHint: string | null = null;
  if (/\bbanquete|\bcatering\b/i.test(`${req} ${userBlob}`)) {
    serviceHint = resolveDetailQueryForFamily(
      "banquete",
      `${req} ${userBlob} ${currentMessage ?? ""}`
    );
  } else {
    serviceHint =
      (ctx.isValidRequerimientosValue(req) ? req : null) ||
      parsePrimaryService(userBlob) ||
      ctx.findMentionedService(userBlob);
  }
  const specificNivelAsk =
    /\bcoffee\s*break\s*\d|\b\d\s*tiempos?\b|\b(tradicional|premium|b[aá]sic[ao]?)\b/i.test(
      currentMessage ?? ""
    );
  const pdfOnly =
    buildPdfInclusionReply(currentMessage ?? "") ||
    (!specificNivelAsk && serviceHint
      ? buildPdfInclusionReply(`${serviceHint} ${currentMessage ?? ""}`) ||
        buildPdfInclusionReply(serviceHint)
      : null);
  if (pdfOnly && !/bet[uú]n|cupcakes?/i.test(pdfOnly)) {
    return {
      kind: "reply",
      id: "GUARD: inclusiones — PDF aprendido",
      mensaje: pdfOnly,
      effects: { appliedSalesReply: true, appliedDirectReply: true },
    };
  }

  const inclusionAnswer = resolveCatalogInclusionReply(currentMessage ?? "", serviceHint);
  if (inclusionAnswer && !/bet[uú]n|cupcakes?/i.test(inclusionAnswer)) {
    const pending = ctx.getNextPendingField();
    // Tras describir paquetes, puede seguir el embudo (zona), pero NUNCA borrar el detalle.
    return {
      kind: "reply",
      id: "GUARD: inclusiones/descripciones de paquete (temprano)",
      mensaje:
        pending && ctx.needsNextStep && !ctx.trulyReadyForClosing
          ? `${inclusionAnswer}\n\n${ctx.buildNaturalQuestion(pending)}`
          : inclusionAnswer,
      effects: { appliedSalesReply: true, appliedDirectReply: true },
    };
  }

  if (serviceHint && /\bbanquete/i.test(serviceHint)) {
    const detail =
      buildCatalogPriceAnswer(serviceHint) || buildCatalogServiceDetailAnswer(serviceHint);
    const link = buildCatalogWebLinkReply({ query: serviceHint, serviceHint });
    return {
      kind: "reply",
      id: "GUARD: inclusiones banquete — Sheet + link forzado",
      mensaje: detail
        ? `${detail}\n\n${link}\n\n¿Cuál nivel te late?`
        : `${link}\n\n¿Cuál nivel te late?`,
      effects: { appliedSalesReply: true, appliedDirectReply: true },
    };
  }

  return {
    kind: "reply",
    id: "GUARD: paquetes genéricos — overview / aclarar servicio",
    mensaje: ctx.buildGenericPackagesOverviewReply(),
    effects: { appliedSalesReply: true, appliedDirectReply: true },
  };
};

export const handlePrice: GuardHandler<PriorityGuardContext> = (ctx) => {
  const { currentMessage, extracted, filledSet, presHistory, aiResponse } = ctx;
  if (!clientAsksPrice(currentMessage) && !clientAsksDistributorPricing(currentMessage)) {
    return { kind: "continue" };
  }

  const ctxText = collectUserTexts(presHistory, currentMessage).join(" ");
  const pending = ctx.getNextPendingField();
  if (
    isRichQuoteBrief(currentMessage) ||
    clientAsksDistributorPricing(currentMessage) ||
    (clientAsksDistributorPricing(ctxText) && parseServicesFromText(ctxText).length >= 2)
  ) {
    const services = parseServicesFromText(
      `${currentMessage ?? ""} ${extracted.requerimientos_evento ?? ""}`
    );
    const packageReply = buildMultiServicePackageReply(services, currentMessage ?? ctxText);
    const teamNote =
      "El precio de mayoreo / la propuesta a la medida la arma nuestro equipo; no te paso un precio de lista suelto.";
    return {
      kind: "reply",
      id: "GUARD: precio distribuidor / RFQ — sin SKU retail",
      mensaje: ctx.needsNextStep
        ? ctx.mergeWithPendingQuestion(`${packageReply}\n\n${teamNote}`)
        : `${packageReply}\n\n${teamNote}`,
    };
  }

  const genericPriceAsk =
    clientAsksPrice(currentMessage) &&
    !mentionsListedPriceService(currentMessage ?? "") &&
    !mentionsNoListedPriceService(currentMessage ?? "") &&
    !ctx.findMentionedService(currentMessage ?? "") &&
    !parsePrimaryService(currentMessage ?? "");
  const needsAlejandroQuote =
    !genericPriceAsk &&
    (mentionsNoListedPriceService(currentMessage ?? "") ||
      (responseHasInventedPrice(aiResponse, currentMessage ?? "", ctxText) &&
        !mentionsListedPriceService(currentMessage ?? "")));

  if (genericPriceAsk) {
    const clarify = ctx.buildGenericPriceClarifyReply();
    return {
      kind: "reply",
      id: "GUARD: precios genéricos — aclarar servicio",
      mensaje: ctx.needsNextStep ? ctx.mergeWithPendingQuestion(clarify) : clarify,
      effects: { appliedDirectReply: true },
    };
  }
  if (needsAlejandroQuote) {
    const priceReply = buildAlejandroPriceReply(
      getPriceServiceLabel(currentMessage ?? ""),
      currentMessage ?? ""
    );
    return {
      kind: "reply",
      id: "GUARD: precio sin catálogo — Alejandro cotiza",
      mensaje:
        ctx.needsNextStep && pending && pending !== "correo"
          ? `${priceReply}\n\n${ctx.buildNaturalQuestion(pending)}`
          : priceReply,
    };
  }

  const safe = sanitizeInventedPrices(aiResponse, currentMessage ?? "", ctxText);
  let priceContent = safe;
  const fromCatalog = buildCatalogPriceAnswer(currentMessage ?? "");
  if (fromCatalog && mentionsListedPriceService(currentMessage ?? "")) {
    priceContent = fromCatalog;
  } else if (!messageClaimsPrice(safe) && fromCatalog) {
    priceContent = fromCatalog;
  } else if (!fromCatalog || !messageClaimsPrice(priceContent)) {
    // A14943: "ver los precios" / "Precios!!" sin SKU → aclarar, no upsell ni Sigo aquí.
    priceContent = ctx.buildGenericPriceClarifyReply();
  }
  return {
    kind: "reply",
    id: "GUARD: respuesta a precio con catálogo",
    mensaje: ctx.needsNextStep
      ? ctx.mergeWithPendingQuestion(priceContent)
      : priceContent.trim() || aiResponse,
  };
};
