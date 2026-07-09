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
  const deferredToAlejandro =
    /alejandro te (lo incluye|da el precio)|precio exacto depende del evento|sin precio listado/i.test(
      lucy
    );

  // Precio sin tarifa en catálogo
  if (clientAsksPrice(msg)) {
    const fromCatalog = buildCatalogPriceAnswer(msg);
    if (!fromCatalog || deferredToAlejandro || mentionsNoListedPriceService(msg)) {
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

  // Servicio que no aparece en catálogo
  if (
    /\b(qu[eé]|cu[aá]l)\s+(ofrecen|manejan|tienen|servicios?)\b/i.test(msg) ||
    /\b(tienen|manejan)\s+.+\?/i.test(msg)
  ) {
    const matches = lookupCatalogServices(msg);
    if (!matches.length && deferredToAlejandro) {
      return { topic: inferTopic(msg), gapType: "service" };
    }
  }

  // Lucy derivó a Alejandro sin precio aunque preguntaron precio
  if (deferredToAlejandro && clientAsksPrice(msg)) {
    const label = getPriceServiceLabel(msg);
    return {
      topic: label !== "ese servicio" ? `Precio: ${label}` : `Precio: ${inferTopic(msg)}`,
      gapType: "price",
    };
  }

  return null;
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
