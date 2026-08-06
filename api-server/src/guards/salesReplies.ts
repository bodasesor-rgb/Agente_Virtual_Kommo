/**
 * Sales reply builders (pista/tarima, carpas, entretenimiento, food, recomendaciones).
 * Extraído de lucy-flow-guards para reducir el monolito.
 *
 * getNextPendingField / buildNaturalQuestion siguen en lucy-flow-guards (orquestador):
 * se inyectan vía configureSalesReplyDeps para evitar ciclo salesReplies ↔ lucy-flow-guards.
 */
import type OpenAI from "openai";
import type { ExtractedData } from "../types.js";
import {
  isGreetingOnlyMessage,
  isQuoteIntentMessage,
  sanitizeCrmNombre,
} from "../contact-name.js";
import {
  BODASESOR_SERVICE_PATTERNS,
  clientMentionsItalianTheme,
  clientMentionsSpecialLiveAct,
  parseSpecialLiveActLabel,
  clientMentionsLedRobotsOrBatucada,
  clientMentionsEntertainment,
  parseCarpaVariantFromText,
  isServiceRelatedMessage,
  parsePrimaryService,
  parseSpaceDimensions,
  isDimensionText,
  parseTipoEventoFromText,
  parseServicesFromText,
  mergeServiceRequirements,
  isVagueFoodTerm,
  isGettingReadyContext,
  isRichQuoteBrief,
  isServicePreferenceRefinement,
  clientAsksBanqueteVsTaquiza,
  clientAsksCafeOrCateringChoice,
  dedupeServiceHierarchy,
  looksLikeConflictingFoodAlternatives,
  preferPrimaryCatalogService,
  isGenericQuoteIntentRequerimiento,
} from "../conversation-understanding.js";
import { buildLucyInfoLearnedPriceReply } from "../services/lucyInfoPriceCache.js";
import {
  buildCatalogPriceAnswer,
  buildCatalogComparisonAnswer,
  buildCatalogServiceDetailAnswer,
  catalogAnswerMatchesRequestedService,
  buildServicePlusGeneralCatalogReply,
  withServiceAndGeneralCatalogLinks,
  SERVICE_NIVEL_DETAIL_CTA,
  ensureCatalogWebLink,
  attachAvailableSheetDetail,
  messageHasSheetServiceDetail,
  getCatalogWebHubDeliveryUrl,
  buildBroadLevel1Offer,
} from "../services/catalogService.js";
import { buildGuardServiceAck } from "../services/serviceKnowledge.js";
import {
  shouldOfferOptionsBeforeDetail,
  resolveProgressiveDetailQuery,
  clientWantsServiceDetail,
  historyOfferedServiceOptionsMenu,
  isBareProgressiveAffirmation,
  detectProgressiveFamily,
  progressiveFamilyDetailQueries,
  buildAlimentosModoMenu,
  buildCateringCasualMenu,
  buildProgressiveOptionsMenu,
  historyOfferedAlimentosModoMenu,
  clientChoseBanqueteFormal,
  clientChoseCateringCasual,
} from "../services/serviceProgressiveOffer.js";
import { clientCaptionForServiceParse } from "../services/imageProcessor.js";
import { resolveServiceFocusFromText } from "../services/serviceSynonyms.js";
import type { PendingField } from "./embudoConstants.js";
import { pickTransition } from "./transitions.js";
import { collectUserTexts } from "./historyHelpers.js";
import {
  buildPackageCatalogOfferBlock,
  collectServicesForCatalogOffer,
  buildMultiServicePackageReply,
} from "./catalogOffer.js";
import {
  pickVariant,
  appendServiciosCatalogoHint,
} from "./embudoQuestions.js";

/** Compatible con NaturalQuestionContext de lucy-flow-guards (evita import cíclico). */
export type SalesQuestionContext = {
  extracted: ExtractedData;
  filledSet?: Set<string>;
  whatsappName?: string | null;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  presentationHistory?: OpenAI.Chat.ChatCompletionMessageParam[];
  currentMessage?: string;
  entityId?: string | number;
  afterEmail?: boolean;
};

export type SalesReplyDeps = {
  getNextPendingField: (
    extracted: ExtractedData,
    filledSet?: Set<string>
  ) => PendingField | null;
  buildNaturalQuestion: (field: PendingField, ctx: SalesQuestionContext) => string;
};

let _salesDeps: SalesReplyDeps | null = null;

export function configureSalesReplyDeps(deps: SalesReplyDeps): void {
  _salesDeps = deps;
}

function salesDeps(): SalesReplyDeps {
  if (!_salesDeps) {
    throw new Error(
      "salesReplies: configureSalesReplyDeps() must run from lucy-flow-guards before sales builders that need embudo pending/question helpers"
    );
  }
  return _salesDeps;
}

/**
 * Copia local de isValidRequerimientosValue (lucy-flow-guards) para evitar ciclo.
 * Mantener en sync si cambia la lógica canónica.
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

function findMentionedService(text: string): string | null {
  for (const [label, pattern] of BODASESOR_SERVICE_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return parsePrimaryService(text);
}

export function buildItalianFoodPitch(message?: string): string {
  const inv = message?.match(/(\d+)\s*(?:personas?|invitados?)/i);
  let pitch =
    "Para temática italiana manejamos pastas, pizzas, barras de antipasti y estaciones de comida italiana";
  if (inv) pitch += ` para ${inv[1]} personas`;
  return `${pitch}.`;
}

/** Variantes concretas del catálogo Pistas/Tarimas (A14967 — menú primero, detalle después). */
const PISTA_TARIMA_VARIANTS: ReadonlyArray<{
  key: string;
  label: string;
  pattern: RegExp;
  query: string;
}> = [
  {
    key: "pista_pintada",
    label: "Pista Pintada a Mano",
    pattern: /\bpista\s+pintada|\bpintada\s+a\s+mano\b/i,
    query: "pista pintada a mano",
  },
  {
    key: "pista_led",
    label: "Pista LED Interactiva",
    pattern: /\bpista\s+led\b|\bled\s+interactiva\b|\bpista\s+interactiva\b/i,
    query: "pista LED interactiva",
  },
  {
    key: "pista_iluminada",
    label: "Pista Iluminada",
    pattern: /\bpista\s+iluminada\b/i,
    query: "pista iluminada",
  },
  {
    key: "pista_madera_premium",
    label: "Pista Madera Premium",
    pattern: /\bpista\s+madera\s+premium\b/i,
    query: "pista madera premium",
  },
  {
    key: "pista_logo",
    label: "Pista Vinil con Logo",
    pattern:
      /\bpista\s+(vinil|charol)\b|\bcon\s+logo\b|\bmonograma\b|\blogotipo\b|\blogos?\s+en\s+vinil\b/i,
    query: "pista vinil logo charol personalizado",
  },
  {
    key: "pista_madera",
    label: "Pista Madera",
    pattern: /\bpista\s+madera\b(?!\s+premium)/i,
    query: "pista madera",
  },
  {
    key: "tarima_charol",
    label: "Tarima Charol",
    pattern: /\btarima\s+charol\b/i,
    query: "tarima charol",
  },
  {
    key: "tarima_madera",
    label: "Tarima Básica Madera",
    pattern: /\btarima\s+(b[aá]sica\s+)?madera\b/i,
    query: "tarima básica madera",
  },
  {
    key: "tarima_gris",
    label: "Tarima Básica Gris/Blanco",
    pattern: /\btarima\s+(b[aá]sica\s+)?(gris|blanco)\b|\btarima\s+b[aá]sica\b/i,
    query: "tarima básica gris blanco",
  },
  {
    key: "escenario",
    label: "Escenario / Estrado",
    pattern: /\bescenario\b|\bestrado\b/i,
    query: "escenario estrado",
  },
];

/** Detecta si el cliente ya eligió un tipo concreto de pista/tarima. */
export function parsePistaTarimaVariant(
  text: string | null | undefined
): { key: string; label: string; query: string } | null {
  const t = text?.trim() ?? "";
  if (!t) return null;
  // "personalizada" sola es vaga — no elegir variante (A14967 Angélica).
  for (const v of PISTA_TARIMA_VARIANTS) {
    if (v.pattern.test(t)) return { key: v.key, label: v.label, query: v.query };
  }
  // Respuestas cortas tras el menú ("la LED", "charol", "pintada").
  const short = t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:]+/g, "")
    .trim();
  if (/^(la\s+)?led(\s+interactiva)?$/.test(short) || /^interactiva$/.test(short)) {
    return { key: "pista_led", label: "Pista LED Interactiva", query: "pista LED interactiva" };
  }
  if (/^(la\s+)?iluminada$/.test(short)) {
    return { key: "pista_iluminada", label: "Pista Iluminada", query: "pista iluminada" };
  }
  if (/^(la\s+)?pintada(\s+a\s+mano)?$/.test(short)) {
    return { key: "pista_pintada", label: "Pista Pintada a Mano", query: "pista pintada a mano" };
  }
  if (/^(con\s+)?logo|vinil|monograma$/.test(short)) {
    return {
      key: "pista_logo",
      label: "Pista Vinil con Logo",
      query: "pista vinil logo charol personalizado",
    };
  }
  if (/^charol$/.test(short)) {
    return { key: "tarima_charol", label: "Tarima Charol", query: "tarima charol" };
  }
  if (/^(pista\s+)?madera(\s+premium)?$/.test(short)) {
    return /\bpremium\b/.test(short)
      ? { key: "pista_madera_premium", label: "Pista Madera Premium", query: "pista madera premium" }
      : { key: "pista_madera", label: "Pista Madera", query: "pista madera" };
  }
  return null;
}

function buildPistaTarimaOptionsMenu(currentMessage?: string, dims?: string | null): string {
  const personalizada = /\bpersonalizad/i.test(currentMessage ?? "");
  const dimsNote = dims
    ? ` Anoto espacio aprox. *${dims.replace(/m/gi, " m")}*.`
    : "";
  const personalHint = personalizada
    ? " Para personalizada suelen ir *Vinil con logo* o *Pintada a mano*."
    : "";
  return (
    `Sí, manejamos *pista de baile* y *tarima* a medida.${dimsNote}${personalHint}\n\n` +
    `Opciones principales:\n` +
    `• *Tarimas básicas* — gris/blanco, madera o charol\n` +
    `• *Pista madera* / madera premium\n` +
    `• *Pista LED* o *iluminada*\n` +
    `• *Pista vinil con logo* o *pintada a mano*\n` +
    `• Escenarios / estrados\n\n` +
    `${SERVICE_NIVEL_DETAIL_CTA}` +
    (dims ? "" : " Si ya tienes medidas del espacio, mándamelas y afinamos.")
  );
}

function collapseDuplicateMedidasAsk(text: string): string {
  if (!text?.trim()) return text;
  const askRe = /¿Qué medidas aproximadas tiene el espacio\?/gi;
  const matches = [...text.matchAll(askRe)];
  if (matches.length <= 1) return text;
  // Dejar solo la primera aparición de la pregunta.
  let seen = false;
  return text
    .replace(askRe, (m) => {
      if (seen) return "";
      seen = true;
      return m;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildPistaTarimaSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  entityId?: string | number,
  filledSet?: Set<string>,
  ctx?: SalesQuestionContext
): string {
  const dims =
    parseSpaceDimensions(currentMessage ?? "") ||
    (extracted.requerimientos_evento?.match(/\d+m\s*x\s*\d+m/i)?.[0] ?? null);

  // Buscar variante en el mensaje actual o en el historial reciente del cliente.
  const histBlob = collectUserTexts(history, currentMessage).slice(-6).join(" ");
  const variant =
    parsePistaTarimaVariant(currentMessage) || parsePistaTarimaVariant(histBlob);

  if (filledSet) {
    filledSet.add("Requerimientos o servicios");
  }
  const reqLabel = variant
    ? dims
      ? `${variant.label} (${dims.replace(/m/gi, " m")})`
      : variant.label
    : dims
      ? `pista/tarima ${dims.replace(/m/gi, " m")}`
      : "pista de baile / tarima";
  if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
    extracted.requerimientos_evento = reqLabel;
  } else if (variant && extracted.requerimientos_evento && !new RegExp(variant.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(
    extracted.requerimientos_evento
  )) {
    extracted.requerimientos_evento = dims
      ? `${extracted.requerimientos_evento}; ${variant.label} (${dims.replace(/m/gi, " m")})`
      : `${extracted.requerimientos_evento}; ${variant.label}`;
  } else if (dims && extracted.requerimientos_evento && !extracted.requerimientos_evento.includes(dims)) {
    extracted.requerimientos_evento = `${extracted.requerimientos_evento}; pista/tarima ${dims}`;
  }

  // A14967: sin tipo elegido → menú corto (NO bombardear precios del PDF).
  if (!variant) {
    const menu = buildPistaTarimaOptionsMenu(currentMessage, dims);
    return collapseDuplicateMedidasAsk(`${pickTransition(history)} ${menu}`.trim());
  }

  // Ya eligieron estilo → detalle técnico/precios de ESA variante.
  const fromPdf = buildLucyInfoLearnedPriceReply(variant.query);
  let intro: string;
  if (fromPdf) {
    const focused = fromPdf
      .replace(
        /Según el catálogo que ya cargamos en Aprendizaje:/i,
        `Perfecto, te detallo *${variant.label}*:`
      )
      .trim();
    intro = dims
      ? `${focused}\nAnoto medidas ${dims.replace(/m/gi, " m")} para afinar la cotización.`
      : focused;
  } else if (dims) {
    intro = `Perfecto, anoto *${variant.label}* (${dims.replace(/m/gi, " m")}) para tu cotización. El equipo confirma el precio según esas medidas.`;
  } else {
    intro = `Perfecto, anoto *${variant.label}*. ¿Qué medidas aproximadas tiene el espacio?`;
  }

  intro = collapseDuplicateMedidasAsk(intro);

  if (!dims) {
    // Asegurar una sola pregunta de medidas.
    if (!/medidas aproximadas/i.test(intro)) {
      intro = `${intro}\n\n¿Qué medidas aproximadas tiene el espacio?`;
    }
    return collapseDuplicateMedidasAsk(`${pickTransition(history)} ${intro}`.trim());
  }

  const filledAfter = new Set(filledSet ?? []);
  filledAfter.add("Requerimientos o servicios");
  const pending = salesDeps().getNextPendingField(extracted, filledAfter);
  if (pending && pending !== "requerimientos" && ctx) {
    const nextQ = salesDeps().buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
    return collapseDuplicateMedidasAsk(
      `${pickTransition(history)} ${intro}\n\n${nextQ}`.trim()
    );
  }
  return collapseDuplicateMedidasAsk(`${pickTransition(history)} ${intro}`.trim());
}

/** Carpas: sí/no real + agregar a cotización + medidas (María A14906 / A15016 / A15007). */
export function buildCarpasSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  filledSet?: Set<string>,
  ctx?: SalesQuestionContext
): string {
  const msg = currentMessage ?? "";
  const dims =
    parseSpaceDimensions(msg) ||
    (extracted.requerimientos_evento?.match(/\d+m\s*x\s*\d+m/i)?.[0] ?? null) ||
    collectUserTexts(history, msg)
      .map((t) => parseSpaceDimensions(t))
      .find(Boolean) ||
    null;
  const variant = parseCarpaVariantFromText(msg);
  const transparent = /transparent/i.test(msg) || /transparent/i.test(variant ?? "");
  const alreadyHasCarpas = /\bcarpas?\b/i.test(extracted.requerimientos_evento ?? "");
  const alreadyPitched = history.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      /cathedral|pir[aá]mide|planas|transparentes/i.test(m.content)
  );
  // A14994: "Carpas o mobiliario" — anotar ambos + catálogo (no saltar solo a zona).
  const alsoMobiliario = /\bmobiliario\b|\bmesas?\b|\bsillas?\b|\bperiqueras?\b/i.test(msg);

  if (filledSet) filledSet.add("Requerimientos o servicios");
  const baseLabel =
    variant || (transparent ? "Carpas transparentes" : "Carpas");
  const label = alsoMobiliario ? `${baseLabel}, Mobiliario` : baseLabel;
  if (!isValidRequerimientosValue(extracted.requerimientos_evento)) {
    extracted.requerimientos_evento = dims ? `${label} (${dims})` : label;
  } else {
    const merged = mergeServiceRequirements(
      extracted.requerimientos_evento,
      dims ? `${label} (${dims})` : label,
      6
    );
    if (merged) extracted.requerimientos_evento = merged;
  }

  // A15007: ya pitchó variantes y carpas en CRM — no re-dump Cathedral/Pirámide.
  if (alreadyHasCarpas && alreadyPitched && !variant && !alsoMobiliario) {
    const filledAfter = new Set(filledSet ?? []);
    filledAfter.add("Requerimientos o servicios");
    const pending = salesDeps().getNextPendingField(extracted, filledAfter);
    let ack: string;
    if (dims) {
      ack = `Perfecto — anoto la carpa de *${dims.replace(/m/gi, " m")}*.`;
    } else if (/sencill|solo\s+la\s+carpa|nada\s+m[aá]s|tenemos\s+mesas/i.test(msg)) {
      ack =
        "Perfecto — nos quedamos solo con la *carpa* (sin mobiliario extra). El equipo cotiza según medidas y sede.";
    } else {
      ack = "Claro — seguimos con tu cotización de *carpas*.";
    }
    if (!dims) {
      // Solo pedir medidas si aún no las tenemos.
      const histHasDims = !!collectUserTexts(history, msg)
        .map((t) => parseSpaceDimensions(t))
        .find(Boolean);
      if (!histHasDims && !/\d+\s*x\s*\d+/i.test(extracted.requerimientos_evento ?? "")) {
        return `${pickTransition(history)} ${ack} ¿Qué medidas aproximadas necesitas?`.trim();
      }
    }
    if (pending && pending !== "requerimientos" && ctx) {
      const nextQ = salesDeps().buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
      return `${pickTransition(history)} ${ack}\n\n${nextQ}`.trim();
    }
    return `${pickTransition(history)} ${ack}`.trim();
  }

  if (alsoMobiliario) {
    const ack = `Perfecto — anoto *carpas* y *mobiliario* para tu evento.${
      transparent ? " Incluyo la opción de carpas transparentes." : ""
    }`;
    const catalog = buildPackageCatalogOfferBlock(
      ["Carpas", "Mobiliario"],
      `${msg} ${extracted.requerimientos_evento ?? ""}`
    );
    let body = `${ack}\n\n${catalog}`;
    if (!dims) {
      body = `${body}\n\nPara cotizar bien las carpas, ¿me compartes medidas aproximadas del área a cubrir (o del espacio)?`;
      return `${pickTransition(history)} ${body}`.trim();
    }
    const filledAfter = new Set(filledSet ?? []);
    filledAfter.add("Requerimientos o servicios");
    const pending = salesDeps().getNextPendingField(extracted, filledAfter);
    if (pending && pending !== "requerimientos" && ctx) {
      const nextQ = salesDeps().buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
      return `${pickTransition(history)} ${body}\n\n${nextQ}`.trim();
    }
    return `${pickTransition(history)} ${body}`.trim();
  }

  // Solo medidas tras ask de carpas (A15016: "De 6 x20").
  if (dims && isDimensionText(msg)) {
    const filledAfter = new Set(filledSet ?? []);
    filledAfter.add("Requerimientos o servicios");
    const pending = salesDeps().getNextPendingField(extracted, filledAfter);
    const ack = `Perfecto — anoto medidas *${dims.replace(/m/gi, " m")}* para la carpa.`;
    if (pending && pending !== "requerimientos" && ctx) {
      const nextQ = salesDeps().buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
      return `${pickTransition(history)} ${ack}\n\n${nextQ}`.trim();
    }
    return `${pickTransition(history)} ${ack}`.trim();
  }

  // Variante Cathedral/etc. tras listado (A15016).
  if (variant && !/carpas?/i.test(msg)) {
    const filledAfter = new Set(filledSet ?? []);
    filledAfter.add("Requerimientos o servicios");
    const pending = salesDeps().getNextPendingField(extracted, filledAfter);
    const ack = dims
      ? `Perfecto — anoto *${variant}* (${dims.replace(/m/gi, " m")}) para tu cotización.`
      : `Perfecto — anoto *${variant}* para tu cotización.`;
    if (!dims) {
      return `${pickTransition(history)} ${ack} ¿Qué medidas aproximadas necesitas?`.trim();
    }
    if (pending && pending !== "requerimientos" && ctx) {
      const nextQ = salesDeps().buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
      return `${pickTransition(history)} ${ack}\n\n${nextQ}`.trim();
    }
    return `${pickTransition(history)} ${ack}`.trim();
  }

  // Carpas solas (A14906): ack consultivo + medidas; sin volcar catálogo genérico.
  const ack = buildGuardServiceAck(msg || "carpas transparentes");
  // Si ya trajeron medidas en el mismo turno, no re-preguntar medidas.
  if (dims && /medidas/i.test(ack)) {
    const withoutMedidasAsk = ack
      .replace(/\s*¿Qué medidas aproximadas necesitas\?/gi, "")
      .replace(/\s*¿Qué medidas aproximadas tiene el espacio\?/gi, "")
      .trim();
    const filledAfter = new Set(filledSet ?? []);
    filledAfter.add("Requerimientos o servicios");
    const pending = salesDeps().getNextPendingField(extracted, filledAfter);
    const body = `${withoutMedidasAsk} Anoto medidas *${dims.replace(/m/gi, " m")}*.`;
    if (pending && pending !== "requerimientos" && ctx) {
      const nextQ = salesDeps().buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
      return `${pickTransition(history)} ${body}\n\n${nextQ}`.trim();
    }
    return `${pickTransition(history)} ${body}`.trim();
  }
  if (!dims) {
    return `${pickTransition(history)} ${ack}`.trim();
  }

  const filledAfter = new Set(filledSet ?? []);
  filledAfter.add("Requerimientos o servicios");
  const pending = salesDeps().getNextPendingField(extracted, filledAfter);
  if (pending && pending !== "requerimientos" && ctx) {
    const nextQ = salesDeps().buildNaturalQuestion(pending, { ...ctx, filledSet: filledAfter });
    return `${pickTransition(history)} ${ack}\n\n${nextQ}`.trim();
  }
  return `${pickTransition(history)} ${ack}`.trim();
}

export function buildEntertainmentSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number,
  currentMessage?: string,
  filledSet?: Set<string>,
  ctx?: SalesQuestionContext
): string {
  const tipo = (extracted.tipo_evento ?? "").trim().toLowerCase();
  const msg = currentMessage ?? "";
  const eventLabel =
    /corporativo|empresa|convenci[oó]n|convencion/.test(tipo) ||
    /empresa|corporativo|convenci[oó]n/i.test(msg)
      ? "tu evento corporativo"
      : tipo
        ? `tu ${tipo}`
        : "tu evento";

  const wantsMc = /\b(maestro\s+de\s+ceremonias?|master\s+of\s+ceremonies|\bmc\b|presentador)\b/i.test(
    msg
  );
  const wantsRobots = /\brobots?\s*leds?\b|\bled\s*robots?\b|\brobots?\s+less\b/i.test(msg);
  const wantsBatucada = /\bbatucada\b/i.test(msg);
  // A14988: bailarinas / dancers para concierto u otro evento.
  const wantsBailarinas = /\bbailarinas?\b|\bdancers?\b|\bvedettes?\b/i.test(msg);
  // A15003: photo booth / cabina de fotos.
  const wantsPhotoBooth =
    /\b(photo\s*booths?|photobooths?|cabina(s)?\s+de\s+fotos?|cabina(s)?\s+fotogr[aá]ficas?|espejo\s+m[aá]gico|mirror\s+booth)\b/i.test(
      msg
    );
  // A15009: circo / Blue Man / actos especiales.
  const specialActLabel = parseSpecialLiveActLabel(msg);
  const wantsSpecialAct = !!specialActLabel || clientMentionsSpecialLiveAct(msg);
  const services = parseServicesFromText(msg);
  const label =
    (services.length ? services.join(", ") : null) ||
    (wantsPhotoBooth ? "Photo Booth" : null) ||
    specialActLabel ||
    (wantsBailarinas ? "Bailarinas" : null) ||
    (wantsRobots ? "Robots LED" : null) ||
    (wantsBatucada ? "Batucada" : null) ||
    (wantsMc ? "Maestro de ceremonias y show" : "Animación / Hora loca y shows");

  if (filledSet) {
    filledSet.add("Requerimientos o servicios");
    const merged = mergeServiceRequirements(extracted.requerimientos_evento, label, 6);
    if (merged) extracted.requerimientos_evento = merged;
  }

  let intro: string;
  let ideas: string;
  if (wantsPhotoBooth) {
    intro = `Perfecto — anoto *Photo Booth* (cabina de fotos) para ${eventLabel}.`;
    ideas =
      "El equipo te confirma modelos, props, fondo y tiempo de renta. No es banquete ni catering: es entretenimiento / activación.";
  } else if (wantsSpecialAct) {
    const act = specialActLabel || "ese show / acto";
    intro = `Perfecto — anoto *${act}* para ${eventLabel}.`;
    ideas =
      "Es entretenimiento / show en vivo: el equipo confirma disponibilidad, formato y propuesta. No confundir con banquete ni catering.";
  } else if (wantsBailarinas) {
    intro = `Perfecto — anoto *bailarinas* para ${eventLabel}.`;
    ideas =
      "Es entretenimiento / show en vivo: el equipo arma la propuesta según duración, estilo y el espacio. No confundir con banquete ni catering.";
  } else if (wantsRobots && wantsBatucada) {
    intro = `Perfecto — anoto *robots LED* para ambientar la *batucada* en ${eventLabel}.`;
    ideas =
      "Eso va por entretenimiento / activación (no es banquete ni catering). Nuestro equipo arma la propuesta según duración, cantidad de robots y el espacio.";
  } else if (wantsRobots) {
    intro = `Perfecto — anoto *robots LED* para ${eventLabel}.`;
    ideas =
      "Es un servicio de entretenimiento/activación: el equipo confirma disponibilidad, duración y montaje. No tiene tarifa fija en lista como el catering.";
  } else if (wantsBatucada) {
    intro = `Claro — podemos ayudarte a *ambientar una batucada* en ${eventLabel}.`;
    ideas =
      "Para eso solemos sumar activaciones (robots LED, show, iluminación o animación) según el vibe que busquen. No confundir con banquete/catering.";
  } else if (wantsMc) {
    intro = `Sí, para ${eventLabel} también manejamos *maestro de ceremonias* y shows en vivo.`;
    ideas = "¿Buscas más bien presentador, show de grupo, o animación tipo hora loca?";
  } else {
    // V8.93 / A15165: descubrir estilo antes de listar todo; siempre hub de catálogos.
    intro = `Claro — para entretenimiento en ${eventLabel} te apoyamos con shows, animación y performance.`;
    ideas =
      "¿Buscas algo más tipo show en vivo, hora loca, o ya tienes un formato en mente?";
  }

  // Entretenimiento: catálogos mapeados si hay SKUs; si no, hub (A14920 / V8.79 / A15165).
  const entServices = collectServicesForCatalogOffer({
    services: [
      ...services,
      ...(wantsPhotoBooth ? ["Photo Booth"] : []),
      ...(wantsSpecialAct && specialActLabel ? [specialActLabel] : []),
      ...(wantsBailarinas ? ["Bailarinas", "Animación / Hora loca"] : []),
      ...(wantsRobots ? ["Robots LED"] : []),
      ...(wantsBatucada ? ["Batucada"] : []),
      ...(wantsMc ? ["Maestro de ceremonias"] : []),
      ...(!wantsPhotoBooth && !wantsSpecialAct && !wantsBailarinas && !wantsRobots && !wantsBatucada && !wantsMc
        ? ["Animación / Hora loca", "show"]
        : []),
    ],
    extracted,
    history,
    currentMessage,
  });
  // Photo Booth / actos especiales: no dump de banquete — hub sí para shows genéricos.
  let catalog =
    wantsPhotoBooth || wantsSpecialAct
      ? ""
      : buildPackageCatalogOfferBlock(
          entServices,
          `${currentMessage ?? ""} ${extracted.requerimientos_evento ?? ""}`
        );
  if (!catalog && !wantsPhotoBooth) {
    catalog = [
      "Te dejo el catálogo general (shows, animación y más servicios):",
      getCatalogWebHubDeliveryUrl(),
    ].join("\n");
  }
  let body = catalog ? `${intro} ${ideas}\n\n${catalog}` : `${intro} ${ideas}`;

  if (filledSet && ctx) {
    const pending = salesDeps().getNextPendingField(extracted, filledSet);
    // Si ya dieron correo/nombre/etc., pedir el siguiente dato útil (no repreguntar servicios).
    if (pending && pending !== "requerimientos") {
      const nextQ = salesDeps().buildNaturalQuestion(pending, { ...ctx, filledSet });
      if (nextQ && !body.includes(nextQ)) body = `${body}\n\n${nextQ}`;
    }
  } else {
    const follow = pickVariant("requerimientos", history, entityId);
    body = `${body}\n\n${follow}`.trim();
  }

  return body.trim();
}

/** Opciones acotadas cuando el cliente dice solo "comida", "desayuno", etc. */
export function buildVagueFoodOptionsReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  currentMessage?: string,
  entityId?: string | number
): string {
  const texts = collectUserTexts(history, currentMessage).join(" ").toLowerCase();
  const tipo = (extracted.tipo_evento ?? parseTipoEventoFromText(texts) ?? "").toLowerCase();
  const inv = extracted.num_invitados ?? 0;
  const gettingReady = isGettingReadyContext(texts) || isGettingReadyContext(currentMessage);
  const msg = currentMessage ?? "";
  const wantsInfo = /\binformaci[oó]n|info|detalle|incluye|cotiz|me\s+pueden\s+dar\b/i.test(msg);
  const isBanqueteVague =
    /\bbanquetes?\b|\bcatering\b/i.test(msg) &&
    !/\b(taquiza|coffee\s*break|sushi|parrillada)\b/i.test(msg);

  // V8.92: banquetes/catering + info → formal vs casual PRIMERO (no Formal/Mexicano aún).
  if (isBanqueteVague && wantsInfo) {
    // Si ya preguntamos formal/casual y eligió → menú correspondiente.
    if (historyOfferedAlimentosModoMenu(history)) {
      if (clientChoseBanqueteFormal(msg)) {
        return `${pickTransition(history)} ${buildProgressiveOptionsMenu("banquete")}`.trim();
      }
      if (clientChoseCateringCasual(msg)) {
        return `${pickTransition(history)} ${buildCateringCasualMenu()}`.trim();
      }
    }
    // Primera vez: preguntar formal vs casual con ejemplos.
    if (!historyOfferedAlimentosModoMenu(history) && !historyOfferedServiceOptionsMenu(history)) {
      return `${pickTransition(history)} ${buildAlimentosModoMenu()}`.trim();
    }
  }

  let options: string;
  let linkHint = "banquete";
  if (gettingReady || (/\bboda\b/.test(tipo) && inv > 0 && inv <= 30)) {
    options =
      "Para el getting ready suele ir desayuno o brunch ligero, canapés o coffee break — sin pista ni DJ.";
    linkHint = "coffee break";
  } else if (/baby\s*shower/.test(tipo) || /baby\s*shower/.test(texts)) {
    options = "Para baby shower van bien brunch o banquete ligero, mesa de dulces o bocadillos.";
    linkHint = "brunch";
  } else if (/\bboda\b/.test(tipo) && inv >= 150) {
    options = "Para boda grande lo más pedido es banquete, taquiza o barra de bebidas.";
    linkHint = "banquete";
  } else if (/bautizo/.test(tipo) || /\bbautizo\b/.test(texts)) {
    options = "Para bautizo suele ir banquete o brunch, mesa de dulces o bocadillos.";
    linkHint = "banquete";
  } else if (/corporativo/.test(tipo) || /corporativ/.test(texts)) {
    options = "Para eventos corporativos manejamos coffee break, banquete o barra de alimentos.";
    linkHint = "coffee break";
  } else if (clientAsksCafeOrCateringChoice(msg)) {
    // A14964 Victor: no volcar solo banquete ni anotar taquiza por "comida".
    options =
      "Manejamos ambas: *Barra de Café* (baristas y bebidas artesanales) y *catering de comida* (banquete, barras de alimentos, meseros). ¿Qué te late más para tu evento?";
    linkHint = "banquete";
  } else {
    options = "Según el evento podemos ofrecerte banquete, taquiza o brunch — ¿cuál te interesa?";
    // V8.68: menú corto sin link; el catálogo va con el detalle tras elegir.
    return `${pickTransition(history)} ${options}`.trim();
  }

  const follow = pickVariant("requerimientos", history, entityId);
  return `${pickTransition(history)} ${options} ${follow}`.trim();
}

/** Tras menú de opciones: detalle + link de catálogo (o re-pregunta cuál). */
export function buildProgressiveDetailAfterMenu(opts: {
  extracted: ExtractedData;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  currentMessage?: string;
  filledSet?: Set<string>;
  serviceHint?: string | null;
}): string | null {
  const { extracted, history, currentMessage, filledSet, serviceHint } = opts;
  if (!historyOfferedServiceOptionsMenu(history)) return null;
  if (!clientWantsServiceDetail(currentMessage, history)) return null;

  const hint = serviceHint || extracted.requerimientos_evento;
  const detailQuery = resolveProgressiveDetailQuery({
    currentMessage,
    serviceHint: hint,
    history,
  });

  // "Sí" / "dale" / "todos" sin elegir → toda la info de la familia + link aparte.
  if (!detailQuery && isBareProgressiveAffirmation(currentMessage)) {
    const family =
      detectProgressiveFamily(hint) ||
      detectProgressiveFamily(
        collectUserTexts(history, currentMessage).join(" ")
      );
    if (family) {
      const queries = progressiveFamilyDetailQueries(family);
      const chunks: string[] = [];
      for (const q of queries) {
        const d =
          buildCatalogServiceDetailAnswer(q) ||
          buildCatalogPriceAnswer(q) ||
          attachAvailableSheetDetail(q, q);
        if (d) chunks.push(d);
      }
      const linkQ = queries[0] || family;
      const link = buildServicePlusGeneralCatalogReply({
        query: linkQ,
        serviceHint: hint || linkQ,
      });
      if (filledSet) {
        filledSet.add("Requerimientos o servicios");
        const merged = mergeServiceRequirements(
          extracted.requerimientos_evento,
          queries[0] || family,
          6
        );
        if (merged) extracted.requerimientos_evento = merged;
      }
      if (chunks.length) {
        const body = withServiceAndGeneralCatalogLinks(
          chunks.join("\n\n"),
          linkQ,
          hint || linkQ
        );
        return `${pickTransition(history)} Claro, te paso el detalle de las opciones:\n\n${body}`.trim();
      }
      return `${pickTransition(history)} ${link}`.trim();
    }
  }

  if (!detailQuery) {
    return `${pickTransition(history)} ${SERVICE_NIVEL_DETAIL_CTA}`.trim();
  }
  if (filledSet) {
    filledSet.add("Requerimientos o servicios");
    const merged = mergeServiceRequirements(
      extracted.requerimientos_evento,
      detailQuery,
      6
    );
    if (merged) extracted.requerimientos_evento = merged;
  }
  const detail =
    buildCatalogServiceDetailAnswer(detailQuery) ||
    buildCatalogPriceAnswer(detailQuery) ||
    attachAvailableSheetDetail(detailQuery, detailQuery);
  // A14975: no re-listar niveles ni duplicar el mismo URL; servicio + general.
  const body = withServiceAndGeneralCatalogLinks(
    detail || `Anoto *${detailQuery}*.`,
    detailQuery,
    detailQuery
  );
  if (detail) {
    return `${pickTransition(history)} Te detallo *${detailQuery}*:\n\n${body}`.trim();
  }
  return `${pickTransition(history)} ${body}`.trim();
}

export function buildFoodSalesReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number,
  currentMessage?: string,
  filledSet?: Set<string>,
  ctx?: SalesQuestionContext
): string | null {
  // A14962: batucada / robots LED ≠ catering. No volcar banquete.
  const blob = `${currentMessage ?? ""} ${extracted.requerimientos_evento ?? ""}`;
  if (
    clientMentionsLedRobotsOrBatucada(currentMessage) ||
    clientMentionsLedRobotsOrBatucada(extracted.requerimientos_evento ?? "") ||
    (clientMentionsEntertainment(currentMessage) &&
      !/\b(banquete|taquiza|coffee|brunch|catering|barra\s+de\s+alimentos)\b/i.test(blob))
  ) {
    return null;
  }

  if (isVagueFoodTerm(currentMessage)) {
    return buildVagueFoodOptionsReply(extracted, history, currentMessage, entityId);
  }

  const tipo = (extracted.tipo_evento ?? "").trim().toLowerCase();
  // A14982: no usar servicio (taquiza/parrillada) como "tipo" → "para un taquiza".
  const tipoIsServiceSku =
    /^(taquiza|parrillada|pozolada|paellada|banquete|barra|coffee\s*break)$/i.test(tipo) ||
    (/taquiza|parrillada|banquete|barra de/i.test(tipo) &&
      !/boda|cumplea|bautizo|xv|corporativ|gradu|baby/i.test(tipo));
  const eventLabel =
    !tipo || tipoIsServiceSku
      ? "tu evento"
      : tipo === "cumpleaños"
        ? "un cumpleaños"
        : tipo === "boda"
          ? "una boda"
          : tipo === "xv años"
            ? "XV años"
            : `un ${tipo}`;
  const eventPhrase = eventLabel === "tu evento" ? "" : ` para ${eventLabel}`;

  const mentionedService = currentMessage ? findMentionedService(currentMessage) : null;

  const appendNext = (body: string, acceptedService?: string | null): string => {
    if (!filledSet || !ctx) return body;
    if (acceptedService) {
      filledSet.add("Requerimientos o servicios");
      const merged = mergeServiceRequirements(extracted.requerimientos_evento, acceptedService, 6);
      if (merged) extracted.requerimientos_evento = merged;
    }
    const pending = salesDeps().getNextPendingField(extracted, filledSet);
    if (!pending) return body;
    const nextQ = salesDeps().buildNaturalQuestion(pending, { ...ctx, filledSet });
    if (body.includes(nextQ)) return body;
    return `${body}\n\n${nextQ}`;
  };

  const allServices = currentMessage
    ? dedupeServiceHierarchy(parseServicesFromText(clientCaptionForServiceParse(currentMessage)))
    : [];
  const crmService = isValidRequerimientosValue(extracted.requerimientos_evento)
    ? extracted.requerimientos_evento!.trim()
    : null;
  // A14970: nunca usar el mensaje crudo (slice 80) como nombre de servicio.
  const resolvedServiceLabel =
    preferPrimaryCatalogService(allServices) ||
    mentionedService ||
    parsePrimaryService(clientCaptionForServiceParse(currentMessage) || currentMessage || "") ||
    (crmService ? preferPrimaryCatalogService(parseServicesFromText(crmService)) || crmService : null);

  if (
    (allServices.length >= 2 || (currentMessage && isRichQuoteBrief(currentMessage))) &&
    !looksLikeConflictingFoodAlternatives(allServices)
  ) {
    const listLabel =
      preferPrimaryCatalogService(allServices) ||
      allServices.join(", ");
    const packageReply = buildMultiServicePackageReply(
      allServices,
      currentMessage
    );
    return appendNext(`${pickTransition(history)} ${packageReply}`, listLabel || null);
  }

  // Preferencias sobre servicio ya capturado (bebidas de la barra de café) — ack, no dump.
  if (
    currentMessage &&
    isServicePreferenceRefinement(currentMessage, crmService || resolvedServiceLabel)
  ) {
    const label = resolvedServiceLabel || crmService || "tu cotización";
    if (filledSet) {
      filledSet.add("Requerimientos o servicios");
      const snippet = currentMessage.trim().replace(/\s+/g, " ").slice(0, 180);
      const merged = mergeServiceRequirements(
        extracted.requerimientos_evento,
        `preferencia: ${snippet}`,
        6
      );
      if (merged) extracted.requerimientos_evento = merged;
    }
    return appendNext(
      `${pickTransition(history)} Perfecto, anoto esa preferencia para *${label}* y se la paso al equipo.`,
      resolvedServiceLabel
    );
  }

  if (mentionedService || resolvedServiceLabel || (currentMessage && isServiceRelatedMessage(currentMessage))) {
    const serviceLabel = resolvedServiceLabel;

    // V8.68: menú de opciones ANTES del dump de precios/inclusiones.
    const optionsFirst = shouldOfferOptionsBeforeDetail({
      currentMessage,
      history,
      serviceHint: mentionedService || serviceLabel || crmService,
    });
    if (optionsFirst) {
      if (filledSet && serviceLabel) {
        filledSet.add("Requerimientos o servicios");
        const merged = mergeServiceRequirements(
          extracted.requerimientos_evento,
          serviceLabel,
          6
        );
        if (merged) extracted.requerimientos_evento = merged;
      }
      // A15168: Coffee Break — menú Sheet con precios/inclusiones + catálogo
      // (no solo "paquetes 1 a 5" sin significado).
      let menu = optionsFirst.menu;
      if (optionsFirst.family === "coffee_break") {
        const sheetMenu =
          buildCatalogServiceDetailAnswer("Coffee Break") ||
          buildCatalogPriceAnswer("Coffee Break");
        if (sheetMenu && /coffee\s*break\s*[1-5]|manejamos estos niveles|\$\s*\d/i.test(sheetMenu)) {
          menu = withServiceAndGeneralCatalogLinks(sheetMenu, "Coffee Break", "Coffee Break");
        } else if (!/bodasesor\.com\/catalogos\/coffee-break/i.test(menu)) {
          menu = `${menu}\n\nCatálogo:\nhttps://bodasesor.com/catalogos/coffee-break`;
        }
      }
      return `${pickTransition(history)} ${menu}`.trim();
    }

    // Tras elegir / pedir detalle → query concreto + detalle + link aparte.
    const detailQuery = resolveProgressiveDetailQuery({
      currentMessage,
      serviceHint: mentionedService || serviceLabel || crmService,
      history,
    });
    if (
      !detailQuery &&
      historyOfferedServiceOptionsMenu(history) &&
      clientWantsServiceDetail(currentMessage, history)
    ) {
    return `${pickTransition(history)} ${SERVICE_NIVEL_DETAIL_CTA}`.trim();
  }
  // A14970: jamás usar el mensaje completo como query de catálogo.
    const queryForDetail =
      detailQuery || mentionedService || serviceLabel || crmService || null;
    if (!queryForDetail) {
      return appendNext(
        `${pickTransition(history)} Claro. ¿De qué servicio te paso el detalle?`,
        null
      );
    }

    let detail = buildCatalogServiceDetailAnswer(queryForDetail);
    if (
      detail &&
      mentionedService &&
      !catalogAnswerMatchesRequestedService(currentMessage ?? "", detail)
    ) {
      detail = null;
    }

    if (detail) {
      const introLabel = detailQuery || mentionedService || serviceLabel;
      // A14982: pickTransition ya trae "Perfecto./De acuerdo." — no duplicar.
      const intro = introLabel
        ? `${pickTransition(history)} Te detallo *${introLabel}*${eventPhrase}.`
        : `${pickTransition(history)} Te detallo la opción.`;
      const body = withServiceAndGeneralCatalogLinks(detail, queryForDetail, queryForDetail);
      return `${intro}\n\n${body}`.trim();
    }

    // Fallback: precio/inclusiones si el detail principal falló el match filter.
    const forced =
      attachAvailableSheetDetail(queryForDetail, mentionedService || serviceLabel) || null;
    if (forced) {
      const introLabel = detailQuery || mentionedService || serviceLabel;
      const intro = introLabel
        ? `${pickTransition(history)} Te detallo *${introLabel}*${eventPhrase}.`
        : `${pickTransition(history)} Te detallo la opción.`;
      const body = withServiceAndGeneralCatalogLinks(forced, queryForDetail, queryForDetail);
      return `${intro}\n\n${body}`.trim();
    }

    if (serviceLabel && currentMessage) {
      const ack = buildGuardServiceAck(currentMessage);
      // Si el ack ya trae Sheet detail, acompañar con link (post-elección).
      if (messageHasSheetServiceDetail(ack)) {
        const body = withServiceAndGeneralCatalogLinks(ack, serviceLabel, serviceLabel);
        return body;
      }
      // Ack corto sin dump: no forzar link aún.
      return appendNext(`${pickTransition(history)} ${ack}`, serviceLabel);
    }

    return null;
  }

  return buildRecommendationsReply(extracted, history, entityId, currentMessage);
}

/** Sugerencias por tipo de evento cuando el cliente pide recomendaciones. */
export function buildRecommendationsReply(
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  entityId?: string | number,
  currentMessage?: string
): string {
  if (clientAsksBanqueteVsTaquiza(currentMessage)) {
    const comparison = buildCatalogComparisonAnswer();
    if (comparison) return comparison;
  }

  const texts = collectUserTexts(history, currentMessage).join(" ").toLowerCase();
  const tipo = (extracted.tipo_evento ?? "").toLowerCase();
  const inv = extracted.num_invitados ?? 0;
  const gettingReady = isGettingReadyContext(texts) || isGettingReadyContext(currentMessage);

  // Evento = servicio (pozolada, taquiza…) → ofrecer ESE servicio.
  const focus = resolveServiceFocusFromText(
    `${extracted.tipo_evento ?? ""} ${currentMessage ?? ""} ${texts}`
  );
  if (focus && /pozole|taquiza|paella|parrillada|navide|posada|carne\s+asada/i.test(focus.familyKey + focus.label + (extracted.tipo_evento ?? ""))) {
    const primary = focus.label;
    const comps = focus.complements.slice(0, 2).join(" y ");
    const ideas = `Para tu ${extracted.tipo_evento || focus.label} tenemos *${primary}*. Si quieres, también podemos sumar ${comps} — sin compromiso.`;
    const follow = pickVariant("invitados", history, entityId);
    // Prefer asking invitados when offering a focused food event
    return ensureCatalogWebLink(
      `${pickTransition(history)} ${ideas} ${follow}`.trim(),
      primary
    );
  }

  let ideas: string;
  if (gettingReady || (/\bboda\b/.test(tipo) && inv > 0 && inv <= 30)) {
    ideas =
      "Para el getting ready suele ir desayuno o brunch ligero, canapés o coffee break. Mobiliario básico si hace falta, sin pista ni DJ.";
  } else if (/baby\s*shower/.test(tipo) || /baby\s*shower/.test(texts)) {
    ideas =
      "Para baby shower suele ir brunch o banquete ligero, mesa de dulces, bocadillos y mobiliario.";
  } else if (/bautizo/.test(tipo) || /\bbautizo\b/.test(texts)) {
    ideas =
      "Para un bautizo suele funcionar muy bien: banquete o brunch, pastel de bautizo, mesa de dulces, mobiliario y sillas. En jardín o terraza, carpas o sombrillas.";
  } else if (/boda/.test(tipo) || /\bboda\b/.test(texts)) {
    if (inv >= 150) {
      ideas =
        "Para boda grande lo más pedido es banquete, barra de bebidas, mobiliario, carpas o pista de baile, DJ e iluminación.";
    } else {
      ideas =
        "Para boda lo más pedido es banquete o taquiza, barra de bebidas, mobiliario y mesa de dulces según el tamaño del evento.";
    }
  } else if (/xv|quince/.test(tipo) || /\bxv\b|quince/.test(texts)) {
    ideas =
      "Para XV años suele ir banquete o taquiza, mesa de dulces, mobiliario, DJ, iluminación y pista de baile.";
  } else if (/graduaci|celebraci/.test(tipo) || /graduaci|celebraci/.test(texts)) {
    // Ofrecimiento amplio Nivel 1 (no solo 3 ítems).
    return buildBroadLevel1Offer(extracted.tipo_evento || "graduación");
  } else if (clientMentionsItalianTheme(texts) || clientMentionsItalianTheme(currentMessage)) {
    ideas =
      "Para algo con temática italiana van muy bien pastas, pizzas, barras de antipasti o estaciones de comida italiana.";
  } else {
    // Default social: abanico completo, no 3 líneas cortas.
    return buildBroadLevel1Offer(extracted.tipo_evento || "evento");
  }

  const comparison = buildCatalogComparisonAnswer();
  if (comparison && /banquete|taquiza|recomiendas?/i.test(currentMessage ?? "")) {
    return ensureCatalogWebLink(`${ideas}\n\n${comparison}`, "banquete");
  }

  const follow = pickVariant("requerimientos", history, entityId);
  return ensureCatalogWebLink(
    appendServiciosCatalogoHint(`${ideas} ${follow}`.trim()),
    /\bboda|xv|bautizo|banquete/i.test(`${tipo} ${texts}`)
      ? "banquete"
      : /\bcoffee|corporativ/i.test(`${tipo} ${texts}`)
        ? "coffee break"
        : null
  );
}
