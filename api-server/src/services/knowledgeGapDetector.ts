/**
 * Detecta cuando Lucy no tiene respuesta en catálogo (precio, inclusión, servicio).
 */

import {
  buildCatalogInclusionAnswer,
  buildCatalogPriceAnswer,
  lookupCatalogServices,
  clientAsksInclusion,
} from "./catalogService.js";
import {
  clientAsksPrice,
  getPriceServiceLabel,
  mentionsNoListedPriceService,
} from "../price-guard.js";
import {
  isServiceRelatedMessage,
  parseServicesFromText,
  clientAsksAboutService,
} from "../conversation-understanding.js";
import { recordKnowledgeGap } from "./knowledgeGapStore.js";
import { logger } from "../lib/logger.js";

export interface KnowledgeGapDetection {
  topic: string;
  gapType: "price" | "inclusion" | "service" | "unknown";
}

function inferTopic(message: string): string {
  const t = message.trim();
  if (t.length <= 60) return t;
  return `${t.slice(0, 57)}...`;
}

/** ¿Lucy no pudo responder con datos del Sheet/catálogo? */
export function detectKnowledgeGap(
  clientMessage: string,
  lucyResponse: string
): KnowledgeGapDetection | null {
  const msg = clientMessage.trim();
  if (!msg || msg.length < 4) return null;

  const lucy = lucyResponse.trim();
  const deferredToTeam =
    /alejandro te (lo incluye|da el precio)|precio exacto depende del evento|sin precio listado|nuestro equipo te (atiende|contacta)|te atiende en breve/i.test(
      lucy
    );

  // Precio sin tarifa en catálogo
  if (clientAsksPrice(msg)) {
    const fromCatalog = buildCatalogPriceAnswer(msg);
    if (!fromCatalog || deferredToTeam || mentionsNoListedPriceService(msg)) {
      const label = getPriceServiceLabel(msg);
      const topic = label !== "ese servicio" ? `Precio: ${label}` : `Precio: ${inferTopic(msg)}`;
      return { topic, gapType: "price" };
    }
  }

  // Inclusiones / menú sin match en Sheet
  if (clientAsksInclusion(msg)) {
    const fromCatalog = buildCatalogInclusionAnswer(msg);
    if (!fromCatalog) {
      return {
        topic: `Qué incluye: ${inferTopic(msg)}`,
        gapType: "inclusion",
      };
    }
  }

  // Cliente pidió un servicio y Lucy ignoró el servicio (siguió con datos del embudo)
  if (isServiceRelatedMessage(msg) && !clientAsksPrice(msg)) {
    const services = parseServicesFromText(msg);
    const lucyConfirmsService = services.some((s) => {
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(escaped, "i").test(lucy);
    });
    const lucyIgnoredService =
      /regalas?\s+tu\s+nombre|cu[aá]ntos\s+invitados|tipo\s+de\s+evento|presupuesto|correo/i.test(lucy) &&
      !lucyConfirmsService;
    if (lucyIgnoredService) {
      return {
        topic: `Servicio: ${services[0] ?? inferTopic(msg)}`,
        gapType: "service",
      };
    }
  }

  // Servicio que no aparece en catálogo
  if (clientAsksAboutService(msg) || /\b(tienen|manejan)\s+.+\?/i.test(msg)) {
    const matches = lookupCatalogServices(msg);
    if (!matches.length && (deferredToTeam || !lucyConfirmsServiceInResponse(lucy, msg))) {
      return { topic: inferTopic(msg), gapType: "service" };
    }
  }

  // Lucy derivó al equipo sin precio aunque preguntaron precio
  if (deferredToTeam && clientAsksPrice(msg)) {
    const label = getPriceServiceLabel(msg);
    return {
      topic: label !== "ese servicio" ? `Precio: ${label}` : `Precio: ${inferTopic(msg)}`,
      gapType: "price",
    };
  }

  return null;
}

function lucyConfirmsServiceInResponse(lucy: string, clientMessage: string): boolean {
  const services = parseServicesFromText(clientMessage);
  if (!services.length) return /\bmanejamos\b/i.test(lucy);
  return services.some((s) => {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, "i").test(lucy);
  });
}

export async function recordKnowledgeGapIfNeeded(opts: {
  kommoLeadId?: string | number;
  clientMessage: string;
  lucyResponse: string;
  contextSnippet?: string;
}): Promise<void> {
  try {
    const gap = detectKnowledgeGap(opts.clientMessage, opts.lucyResponse);
    if (!gap) return;

    await recordKnowledgeGap({
      kommoLeadId: opts.kommoLeadId,
      question: opts.clientMessage.trim(),
      topic: gap.topic,
      gapType: gap.gapType,
      lucyResponse: opts.lucyResponse.trim(),
      contextSnippet: opts.contextSnippet,
    });
  } catch (err) {
    logger.warn({ err }, "recordKnowledgeGapIfNeeded: error no crítico");
  }
}
