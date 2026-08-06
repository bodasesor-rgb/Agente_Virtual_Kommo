/**
 * Ofertas de catálogo (hub genérico, links mapeados, paquetes multi-servicio, cierre).
 */
import type OpenAI from "openai";
import { advisorLabelForClient } from "../lib/bodasesorAdvisor.js";
import {
  isGreetingOnlyMessage,
  isQuoteIntentMessage,
  sanitizeCrmNombre,
} from "../contact-name.js";
import {
  dedupeServiceHierarchy,
  parseServicesFromText,
  preferPrimaryCatalogService,
  looksLikeConflictingFoodAlternatives,
  isRichQuoteBrief,
  buildMultiServiceAck,
  buildRichBriefAcknowledgment,
  isGenericQuoteIntentRequerimiento,
  isServiceRelatedMessage,
  parseTipoEventoFromText,
  clientMentionsItalianTheme,
} from "../conversation-understanding.js";
import {
  CATALOG_OFFER_QUESTION,
  SERVICE_NIVEL_DETAIL_CTA,
  getCatalogWebHubDeliveryUrl,
  resolveCatalogWebLink,
  toDeliverableCatalogUrl,
  buildCatalogServiceDetailAnswer,
  buildCatalogPriceAnswer,
  withServiceAndGeneralCatalogLinks,
  messageHasSheetServiceDetail,
} from "../services/catalogService.js";
import { getCatalogWebUrlForQuery } from "../services/catalogWebKnowledge.js";
import { collectUserTexts } from "./historyHelpers.js";

/**
 * Copia local de isValidRequerimientosValue (lucy-flow-guards) para evitar ciclo
 * catalogOffer ↔ lucy-flow-guards. Mantener en sync si cambia la lógica canónica.
 */
function isValidRequerimientosValue(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  if (isGenericQuoteIntentRequerimiento(trimmed) || isQuoteIntentMessage(trimmed)) return false;
  if (isGreetingOnlyMessage(trimmed)) return false;
  if (
    /^(hola|buen[oa]s?\b|me\s+llamo|soy|mi\s+nombre\s+es)\b/i.test(trimmed) &&
    parseServicesFromText(trimmed).length === 0 &&
    !isServiceRelatedMessage(trimmed)
  ) {
    return false;
  }
  if (
    sanitizeCrmNombre(trimmed) &&
    parseServicesFromText(trimmed).length === 0 &&
    !isServiceRelatedMessage(trimmed) &&
    trimmed.split(/\s+/).length <= 4 &&
    !/\d/.test(trimmed)
  ) {
    return false;
  }
  if (parseServicesFromText(trimmed).length > 0 || isServiceRelatedMessage(trimmed)) return true;
  if (parseTipoEventoFromText(trimmed)) return false;
  if (clientMentionsItalianTheme(trimmed) && trimmed.length < 48) return false;
  if (trimmed.length >= 4) return true;
  return false;
}

/** Hub genérico (solo cuando no hay SKUs mapeables). */
export function buildGenericCatalogHubBlock(): string {
  return [
    "Te dejo el catálogo general para que veas montajes, menús y opciones:",
    getCatalogWebHubDeliveryUrl(),
    "",
    CATALOG_OFFER_QUESTION,
  ].join("\n");
}

/**
 * Une servicios de mensaje / CRM / historial para ofrecer catálogos concretos
 * en CUALQUIER rama (no solo RFQ multi-servicio).
 */
export function collectServicesForCatalogOffer(opts: {
  services?: string[] | null;
  extracted?: { requerimientos_evento?: string | null } | null;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  currentMessage?: string | null;
  sourceText?: string | null;
}): string[] {
  const fromArg = (opts.services ?? []).map((s) => s.trim()).filter(Boolean);
  const fromCrm = opts.extracted?.requerimientos_evento
    ? parseServicesFromText(opts.extracted.requerimientos_evento)
    : [];
  const blob =
    opts.sourceText ||
    [
      opts.currentMessage ?? "",
      ...(opts.history
        ? collectUserTexts(opts.history, opts.currentMessage ?? undefined)
        : []),
    ]
      .filter(Boolean)
      .join(" ");
  const fromBlob = blob ? parseServicesFromText(blob) : [];
  return dedupeServiceHierarchy([...fromArg, ...fromCrm, ...fromBlob], blob);
}

/**
 * Bloque de catálogo para paquetes / RFQ / cierre / primer turno / entretenimiento.
 * V8.79: si hay SKUs concretos → links mapeados; si no → hub genérico.
 */
export function buildPackageCatalogOfferBlock(
  services?: string[] | null,
  sourceText?: string
): string {
  const list = collectServicesForCatalogOffer({
    services,
    sourceText,
    currentMessage: sourceText,
  });
  if (list.length >= 1) {
    const mapped = buildMappedCatalogOfferBlock(list, sourceText);
    if (mapped && !/^Te dejo el catálogo general/i.test(mapped)) {
      return mapped;
    }
  }
  return buildGenericCatalogHubBlock();
}

/**
 * A14985 / V8.79: con servicios concretos, ofrecer links del catálogo que aplican
 * (Barra de bebidas, Puestos de comida, Periqueras…), no solo el hub genérico.
 * Se usa desde TODAS las ramas vía buildPackageCatalogOfferBlock.
 */
export function buildMappedCatalogOfferBlock(
  services: string[],
  sourceText?: string
): string {
  const text = sourceText ?? "";
  const list = dedupeServiceHierarchy(
    services.map((s) => s.trim()).filter(Boolean),
    text
  ).slice(0, 6);
  if (!list.length) return buildGenericCatalogHubBlock();

  const lines: string[] = [
    "Con lo que pediste, estas opciones del catálogo te pueden servir:",
    "",
  ];
  let linked = 0;
  const seenUrls = new Set<string>();
  for (const svc of list) {
    let query = svc;
    let label = svc;
    if (/mobiliario/i.test(svc) && /\bperiqueras?\b/i.test(text)) {
      query = "periqueras";
      label = "Periqueras (mobiliario)";
    } else if (/^periqueras?$/i.test(svc)) {
      // Evitar duplicar el mismo link si ya va como Mobiliario/Periqueras.
      if (list.some((s) => /mobiliario/i.test(s)) && /\bperiqueras?\b/i.test(text)) {
        continue;
      }
      query = "periqueras";
      label = "Periqueras";
    } else if (/puestos?\s+de\s+comida/i.test(svc)) {
      query = "puestos de comida";
      label = /\bbanderillas?\b/i.test(text)
        ? "Puestos de comida / antojitos (banderillas)"
        : "Puestos de comida / antojitos";
    } else if (/barra\s+de\s+bebidas/i.test(svc)) {
      query = "barra de bebidas";
      label = "Barra de bebidas";
    } else if (/^meseros?$/i.test(svc)) {
      // Sin página propia → no forzar link roto.
      lines.push(`• *${label}*`);
      continue;
    }
    // Preferir slug web (embeds) — no depende del Sheet cargado (A14985).
    const sheetMatch = resolveCatalogWebLink(query);
    const webUrl =
      getCatalogWebUrlForQuery(query) ||
      (sheetMatch.kind === "service" ? sheetMatch.url : null);
    if (webUrl) {
      const deliverable = toDeliverableCatalogUrl(webUrl);
      if (seenUrls.has(deliverable)) continue;
      seenUrls.add(deliverable);
      lines.push(`• *${label}*: ${deliverable}`);
      linked++;
    } else {
      lines.push(`• *${label}*`);
    }
  }
  if (linked === 0) return buildGenericCatalogHubBlock();

  lines.push("", "Catálogo general:", getCatalogWebHubDeliveryUrl(), "");
  lines.push(SERVICE_NIVEL_DETAIL_CTA);
  return lines.join("\n");
}

/** ¿Lucy ya ofreció niveles / Incluye / precios del Sheet (no solo un link)? */
export function historyAlreadyOfferedServiceDetail(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  return history.some((m) => {
    if (m.role !== "assistant" || typeof m.content !== "string") return false;
    // V8.35: URL sola (ensureCatalogWebLink) NO cuenta como detalle Sheet.
    return messageHasSheetServiceDetail(m.content);
  });
}

/**
 * Cierre estándar + ofrecimiento final de complementos.
 * En paquetes multi-servicio incluye link de catálogo (el cliente ya pidió propuestas).
 */
export function buildStandardClosingMessage(
  serviciosPedidos: string | null | undefined,
  clientName?: string | null
): string {
  const asesor = advisorLabelForClient(clientName);
  const handoff =
    asesor === "nuestro equipo"
      ? "Le paso estos datos a nuestro equipo para que te arme una cotización personalizada."
      : `Le paso estos datos a ${asesor} para que te arme una cotización personalizada.`;
  const servicioRaw = serviciosPedidos?.trim() || "";
  // Solo listar servicios concretos parseables — evita "además de la taquiza" inventada (A14929).
  // "banquete / taquiza" es alternativa (1 pedido), no paquete multi-servicio con catálogo.
  const isSlashFoodAlias = /banquete\s*\/\s*taquiza/i.test(servicioRaw);
  const parsed = dedupeServiceHierarchy(parseServicesFromText(servicioRaw), servicioRaw);
  // A14981: alternativas de comida contaminadas → cerrar solo con el primario.
  const primaryFood = preferPrimaryCatalogService(parsed);
  const closingServices = looksLikeConflictingFoodAlternatives(parsed)
    ? primaryFood
      ? [primaryFood]
      : parsed.slice(0, 1)
    : parsed;
  const servicio = isSlashFoodAlias
    ? "banquete / taquiza"
    : closingServices.length > 0
      ? closingServices.slice(0, 4).join(", ")
      : isValidRequerimientosValue(servicioRaw) &&
          !/banquetes?\s+o\s+catering|servicio\s+de\s+banquetes?/i.test(servicioRaw)
        ? servicioRaw
        : "";
  const serviceParts = servicio
    ? servicio.split(/,\s*/).map((s) => s.trim()).filter(Boolean)
    : [];
  const multiPackage = !isSlashFoodAlias && serviceParts.length >= 2;
  // V8.93: cierre humano — reconoce el servicio, sin empujar extras.
  // Mantener firma "Perfecto, ya tengo todo." (CLOSING_SIGNATURE / detectCierreEnviado).
  const head = servicio
    ? `Perfecto, ya tengo todo. Quedó anotado *${servicio}*. ${handoff}`
    : `Perfecto, ya tengo todo. ${handoff}`;
  const parts = [head];
  if (multiPackage) {
    // V8.79: cierre con links de los SKUs pedidos, no solo hub.
    parts.push("", buildPackageCatalogOfferBlock(serviceParts, servicioRaw));
  }
  parts.push("", "Si necesitas algo más, con gusto te apoyo.");
  return parts.join("\n");
}

/**
 * A14982: 2 servicios de comida con Sheet → dump de niveles/precios (no solo hub genérico).
 * RFQs largos / 3+ / sin precio en Sheet → null (cae a catálogo general).
 */
export function buildMultiServiceSheetLevelsReply(
  services: string[],
  sourceText?: string
): string | null {
  if (sourceText && isRichQuoteBrief(sourceText)) return null;
  const cleaned = dedupeServiceHierarchy(
    services.map((s) => s.trim()).filter(Boolean),
    sourceText
  );
  // A14995 Hortensia: paquete amplio (banquete+barra+dulces+mobiliario) → ack todos +
  // catálogos mapeados, NO dump solo de Banquete Mexicano 4 tiempos.
  if (cleaned.length >= 3) return null;
  const hasFood = cleaned.some((s) =>
    /barra|taquiza|banquete|coffee|parrillada|paella|mesa\s+de|cupcake|sushi|crepa|pizza|pasta|pozole/i.test(
      s
    )
  );
  const hasNonFood = cleaned.some((s) =>
    /mobiliario|carpas?|pista|tarima|\bdj\b|iluminaci|pantallas?/i.test(s)
  );
  if (hasFood && hasNonFood) return null;

  const foodish = cleaned.filter((s) =>
    /barra|taquiza|banquete|coffee|parrillada|paella|mesa\s+de|cupcake|sushi|crepa|pizza|pasta|pozole|canap|bocadillo/i.test(
      s
    )
  );
  const list = (foodish.length >= 2 ? foodish : cleaned).slice(0, 2);
  if (list.length < 2) return null;

  const blocks: string[] = [];
  for (const svc of list) {
    const detail =
      buildCatalogServiceDetailAnswer(svc) || buildCatalogPriceAnswer(svc);
    if (!detail || !/\$|nivel|Solo Alimentos|Basico|Tradicional|Premium|Coffee Break/i.test(detail)) {
      return null;
    }
    const cleanedDetail = detail
      .replace(/¿Quieres que te d[eé] detalles de alguno\??/gi, "")
      .replace(/¿Cu[aá]l nivel prefieres[^\n]*/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    blocks.push(`*${svc}*\n${cleanedDetail}`);
  }

  const ack = buildMultiServiceAck(list);
  const body = [ack, "", blocks.join("\n\n———\n\n"), "", SERVICE_NIVEL_DETAIL_CTA].join(
    "\n"
  );
  return withServiceAndGeneralCatalogLinks(body, list[0]!, list.join(" "));
}

/** Ack de paquete + niveles Sheet (2 food SKUs) o catálogos mapeados (RFQ). */
export function buildMultiServicePackageReply(
  services: string[],
  sourceText?: string
): string {
  const levels = buildMultiServiceSheetLevelsReply(services, sourceText);
  if (levels) return levels;
  const cleaned = dedupeServiceHierarchy(
    services.map((s) => s.trim()).filter(Boolean),
    sourceText
  );
  const ack =
    sourceText && isRichQuoteBrief(sourceText)
      ? buildRichBriefAcknowledgment(sourceText)
      : buildMultiServiceAck(cleaned.length ? cleaned : services);
  // V8.79: misma lógica de catálogos mapeados que el resto de ramas.
  return `${ack}\n\n${buildPackageCatalogOfferBlock(
    cleaned.length ? cleaned : services,
    sourceText
  )}`;
}
