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
  parseServicesFromText,
} from "../conversation-understanding.js";
import {
  buildCatalogWebLinkReply,
  messageOffersCatalogLink,
} from "../services/catalogService.js";
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
