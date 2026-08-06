/**
 * Post-cierre + handoff a asesor humano (rama temprana de applyLucyMessageGuards).
 */
import type OpenAI from "openai";
import type { ExtractedData } from "../types.js";
import { resolveClientDisplayName } from "../contact-name.js";
import { clientAsksPrice } from "../price-guard.js";
import { clientAsksInclusion } from "../services/catalogService.js";
import {
  clientAsksForHumanAdvisor,
  clientAsksPhone,
  clientDeclinesMoreServices,
  clientAddsToQuote,
  isServicePreferenceRefinement,
  preferPrimaryCatalogService,
  parseServicesFromText,
  mergeServiceRequirements,
  formatServicesList,
  isRichQuoteBrief,
  clientAsksDistributorPricing,
  isServiceRelatedMessage,
  clientAsksServiceInfo,
  clientMentionsEntertainment,
  clientAsksForCatalog,
  clientAsksForRecommendations,
  parseCorreoFromText,
} from "../conversation-understanding.js";
import {
  buildPhoneAnswer,
  buildHumanAdvisorHandoffAnswer,
} from "./contactAnswers.js";
import {
  clientAsksPaymentOrQuoteDelivery,
  buildPostCierreThanksReply,
  buildPostCierrePaymentHandoffReply,
  buildPostCierreCallbackAck,
} from "./postCierreReplies.js";
import { collectUserTexts, lastAssistantWasPhoneAnswer } from "./historyHelpers.js";
import { clientSaysThanks } from "./transitions.js";
import { buildMultiServicePackageReply } from "./catalogOffer.js";

export type PostCierreHandlerInput = {
  cierreYaEnviado: boolean;
  currentMessage?: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  whatsappDisplayName?: string | null;
  entityId?: string | number;
  log?: { info: (obj: unknown, msg?: string) => void };
};

export type PostCierreHandlerResult = {
  mensaje: string;
  logMsg: string;
} | null;

export function tryApplyPostCierreOrHandoffReply(
  input: PostCierreHandlerInput
): PostCierreHandlerResult {
  const {
    cierreYaEnviado,
    currentMessage,
    extracted,
    filledSet,
    history,
    whatsappDisplayName,
    entityId,
    log,
  } = input;

  const displayName = () =>
    resolveClientDisplayName(extracted.nombre, null, whatsappDisplayName);

  if (cierreYaEnviado && clientAsksPhone(currentMessage)) {
    return {
      mensaje: `${buildPhoneAnswer()}\n\nUn asesor te puede atender por ahí; tu caso ya quedó con el equipo.`,
      logMsg: "GUARD: post-cierre — cliente pidió llamada/teléfonos",
    };
  }

  if (cierreYaEnviado && clientAsksPaymentOrQuoteDelivery(currentMessage)) {
    // A15016: "manda el presupuesto y dónde el 50% de anticipo" — no reabrir correo.
    if (!extracted.correo?.trim()) {
      const recovered = parseCorreoFromText(
        collectUserTexts(history, currentMessage).join("\n")
      );
      if (recovered) {
        extracted.correo = recovered;
        filledSet.add("Correo electrónico");
      }
    } else {
      filledSet.add("Correo electrónico");
    }
    return {
      mensaje: buildPostCierrePaymentHandoffReply(extracted.nombre),
      logMsg: "GUARD: A15016 — post-cierre pago/anticipo → equipo",
    };
  }

  if (clientAsksForHumanAdvisor(currentMessage)) {
    // A15000 Itzel: "prefiero hablar con un asesor" — handoff, no seguir embudo.
    // (incluso sin cierreYaEnviado)
    return {
      mensaje: buildHumanAdvisorHandoffAnswer(extracted.nombre),
      logMsg: "GUARD: A15000 — cliente pidió asesor humano (handoff)",
    };
  }

  if (
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
    const nombre = displayName();
    return {
      mensaje: nombre
        ? `Perfecto, ${nombre}. Anoto esa preferencia para *${label}* y se la paso al equipo. ¿Algo más que quieras agregar?`
        : `Perfecto. Anoto esa preferencia para *${label}* y se la paso al equipo. ¿Algo más que quieras agregar?`,
      logMsg: "GUARD: post-cierre — preferencia de servicio (ack corto)",
    };
  }

  if (
    cierreYaEnviado &&
    clientSaysThanks(currentMessage) &&
    lastAssistantWasPhoneAnswer(history)
  ) {
    return {
      mensaje: buildPostCierreCallbackAck(extracted.nombre),
      logMsg: "GUARD: post-cierre — gracias tras pedir llamada",
    };
  }

  if (
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
    const nombre = displayName();
    return {
      mensaje: nombre
        ? `Perfecto, ${nombre}. Anoto ${list} para que el equipo lo sume a tu cotización. ¿Algo más que quieras agregar?`
        : `Perfecto. Anoto ${list} para que el equipo lo sume a tu cotización. ¿Algo más que quieras agregar?`,
      logMsg: "GUARD: post-cierre — servicios adicionales (ack corto)",
    };
  }

  if (
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
    const nombre = displayName();
    const distributorNote = clientAsksDistributorPricing(currentMessage)
      ? "\n\nEl precio de mayoreo lo confirma el equipo; no te paso un precio de lista suelto."
      : "";
    return {
      mensaje: nombre
        ? `${pkg}${distributorNote}\n\nPerfecto, ${nombre}. Actualizo tu cotización con esto. ¿Algo más que quieras agregar?`
        : `${pkg}${distributorNote}\n\nActualizo tu cotización con esto. ¿Algo más que quieras agregar?`,
      logMsg: "GUARD: post-cierre — RFQ/paquete completo (no SKU suelto)",
    };
  }

  if (
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
    const nombre = displayName();
    return {
      mensaje: nombre
        ? `Perfecto, ${nombre}. Anoto ${list} para que el equipo lo sume a tu cotización. ¿Algo más que quieras agregar?`
        : `Perfecto. Anoto ${list} para que el equipo lo sume a tu cotización. ¿Algo más que quieras agregar?`,
      logMsg: "GUARD: post-cierre — servicio adicional (ack corto, sin niveles)",
    };
  }

  if (
    cierreYaEnviado &&
    (clientSaysThanks(currentMessage) || clientDeclinesMoreServices(currentMessage))
  ) {
    return {
      mensaje: buildPostCierreThanksReply(extracted.nombre),
      logMsg: "GUARD: post-cierre — agradecimiento o sin más que agregar",
    };
  }

  // Suppress unused when no branch matched (caller logs via logMsg).
  void log;
  void entityId;
  return null;
}
