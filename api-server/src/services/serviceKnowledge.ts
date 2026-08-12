/**
 * Router de conocimiento de servicios — modelo de 3 niveles.
 *
 * NIVEL 1: está en Google Sheet → precio e inclusiones exactas.
 * NIVEL 2: servicio de eventos sin Sheet → acepta, anota, avanza (sin inventar precio).
 * NIVEL 3: solicitud dudosa / fuera de eventos → anota como solicitud especial.
 *
 * FASE 2 (futuro): RAG de PDFs en Drive se insertará entre Sheet y conocimiento general.
 */
import {
  CARPA_OPTIONS_TEXT,
  clientMentionsCarpas,
  clientMentionsPistaTarima,
  isServiceRelatedMessage,
  parsePrimaryService,
  parseSalaProductFromText,
  parseSpaceDimensions,
} from "../conversation-understanding.js";
import {
  buildCatalogInclusionAnswer,
  buildCatalogPriceAnswer,
  buildCatalogServiceDetailAnswer,
  formatServiceDataForPrompt,
  lookupCatalogServices,
  getCatalogWebHubDeliveryUrl,
} from "./catalogService.js";
import { buildConcreteProductQuestionReply } from "./concreteProductQuestion.js";
import { advisorLabelForClient } from "../lib/bodasesorAdvisor.js";
import { buildLucyInfoLearnedPriceReply } from "./lucyInfoPriceCache.js";
import {
  buildProgressiveOptionsMenu,
  parseMobiliarioPieceChoice,
  buildMobiliarioPieceFollowUp,
} from "./serviceProgressiveOffer.js";

export type ServiceKnowledgeLevel = 1 | 2 | 3;

export const SERVICE_KNOWLEDGE_GOLDEN_RULE =
  "Que un servicio no esté en el catálogo significa que no tengo el precio a la mano, " +
  "NO que no sepa qué es. Acepta cualquier servicio de eventos, anótalo y avanza. " +
  "Nunca te quedes pidiendo 'otros servicios' ni repitas la misma pregunta por no tener el dato.";

/** Servicios claramente ajenos a eventos / Bodasesor. */
const NON_EVENT_REQUEST_PATTERN =
  /\b(seguro\s+de|abogad|plomer|electricista|internet\s+en\s+casa|plan\s+de\s+celular|lavad|reparaci[oó]n\s+de\s+(auto|celular)|vpn|software\s+de\s+contab|consulta\s+m[eé]dic|veterinar|notari|traducci[oó]n\s+oficial|impresi[oó]n\s+de\s+actas)\b/i;

/** Contexto de evento en el mensaje o servicio reconocible. */
const EVENT_CONTEXT_PATTERN =
  /\b(evento|fiesta|boda|xv|quince|cumple|corporativ|celebraci[oó]n|banquete|taquiza|barra|renta|valet|pirotecnia|mesa\s+imperial|flor|decoraci|animaci|dj|mobiliario|carpa|iluminaci|pantalla|mesero|catering|invitados)\b/i;

export function serviceLabelFromQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "ese servicio";
  return parsePrimaryService(trimmed) ?? trimmed.slice(0, 80);
}

export function isDubiousNonEventRequest(query: string): boolean {
  const t = query.trim();
  if (!t) return false;
  if (NON_EVENT_REQUEST_PATTERN.test(t)) return true;
  if (isServiceRelatedMessage(t) || EVENT_CONTEXT_PATTERN.test(t)) return false;
  if (/\b(quiero|necesito|busco|cotizar)\b/i.test(t) && t.length < 120) return false;
  return t.length >= 8 && !EVENT_CONTEXT_PATTERN.test(t);
}

export function hasSheetKnowledge(query: string): boolean {
  return !!(
    buildCatalogServiceDetailAnswer(query) ||
    buildCatalogPriceAnswer(query) ||
    buildCatalogInclusionAnswer(query) ||
    lookupCatalogServices(query).length
  );
}

export function classifyServiceKnowledgeLevel(query: string): ServiceKnowledgeLevel {
  if (hasSheetKnowledge(query)) return 1;
  if (isDubiousNonEventRequest(query)) return 3;
  return 2;
}

/** Acuse NIVEL 2 — servicio de eventos sin precio en Sheet. */
export function buildLevel2Ack(serviceLabel: string): string {
  const label = serviceLabel.trim() || "ese servicio";
  return `¡Claro! *${label}* la anoto para tu cotización. Nuestro equipo te confirma descripción, precio e inclusiones.`;
}

/** Ítems de renta mobiliario con cantidad (A14987 picnic / periqueras / bancos). */
export function parseMobiliarioRentItems(
  query: string
): Array<{ qty: number | null; label: string }> {
  const items: Array<{ qty: number | null; label: string }> = [];
  if (/\bpicnic\b|\bmesas?\s+tipo\s+picnic\b/i.test(query)) {
    const q =
      query.match(/(\d+)\s*mesas?\s+tipo\s+picnic/i) || query.match(/(\d+)\s*picnic/i);
    items.push({
      qty: q?.[1] ? parseInt(q[1], 10) : null,
      label: "mesas tipo picnic",
    });
  }
  const peri = query.match(/(\d+)\s*periqueras?\b/i);
  if (/\bperiqueras?\b/i.test(query)) {
    items.push({
      qty: peri?.[1] ? parseInt(peri[1], 10) : null,
      label: "periqueras",
    });
  }
  const bancos = query.match(/(\d+)\s*bancos?\b/i);
  if (/\bbancos?\b/i.test(query)) {
    items.push({
      qty: bancos?.[1] ? parseInt(bancos[1], 10) : null,
      label: "bancos",
    });
  }
  const sillas = query.match(/(\d+)\s*sillas?\b/i);
  if (/\bsillas?\b/i.test(query) && !/\bpicnic\b/i.test(query)) {
    items.push({
      qty: sillas?.[1] ? parseInt(sillas[1], 10) : null,
      label: "sillas",
    });
  }
  // Mesas genéricas solo si no hay picnic ya listado.
  if (
    !items.some((i) => /picnic/i.test(i.label)) &&
    /\bmesas?\b/i.test(query) &&
    !/\bmesas?\s+periqueras?\b/i.test(query)
  ) {
    const mesas = query.match(/(\d+)\s*mesas?\b/i);
    if (mesas || /\bmesas?\b/i.test(query)) {
      items.push({
        qty: mesas?.[1] ? parseInt(mesas[1], 10) : null,
        label: "mesas",
      });
    }
  }
  return items;
}

function formatMobiliarioItem(item: { qty: number | null; label: string }): string {
  return item.qty && item.qty > 0 ? `${item.qty} ${item.label}` : item.label;
}

/** Detalle técnico renta de mesas/sillas/picnic/periqueras (NIVEL 2 mobiliario).
 * V8.92: solo "mobiliario" → null (el menú progresivo pregunta la pieza primero).
 */
export function buildMobiliarioRentDetailReply(query: string): string | null {
  if (
    !/\b(mesas?|sillas?|mobiliario|periquera|lounge|picnic|bancos?)\b/i.test(query)
  ) {
    return null;
  }
  const items = parseMobiliarioRentItems(query);
  const color = query.match(
    /\bcolor\s+(blanco|negro|dorado|plateado|natural|madera)\b/i
  )?.[1];
  const colorNote = color ? ` en color *${color.toLowerCase()}*` : "";

  // Solo familia "mobiliario" sin pieza ni qty → menú progresivo, no dump.
  const bareMobiliario =
    items.length === 0 &&
    /\bmobiliario\b/i.test(query) &&
    !/\b(mesas?|sillas?|periquera|lounge|picnic|bancos?|tiffany|crossback|ghost)\b/i.test(query);
  if (bareMobiliario) return null;

  // Pieza nombrada sin cantidad ni modelo concreto → menú de modelos (no dump).
  const hasQty = items.some((i) => i.qty != null && i.qty > 0);
  const hasModel =
    /\b(tiffany|crossback|ghost|wishbone|tolix|camila|antonella|basket|cabos|caroline|louis|mariantonieta|avant|luxor|imperial|picnic)\b/i.test(
      query
    );
  if (items.length >= 1 && !hasQty && !hasModel) {
    // "sillas" / "mesas" / "periqueras" sueltas → progressive follow-up.
    return null;
  }

  if (items.length >= 1) {
    const list = items.map(formatMobiliarioItem).join(", ");
    const hasPicnic = items.some((i) => /picnic/i.test(i.label));
    const hasPeri = items.some((i) => /periquera/i.test(i.label));
    const hasBancos = items.some((i) => /banco/i.test(i.label));
    const bits = [`Anoto *${list}*${colorNote}.`];
    if (hasPicnic || hasPeri || hasBancos) {
      bits.push(
        "Manejamos renta de mesas tipo picnic, periqueras y bancos (y también sillas Tiffany/versátiles, mesas redondas/rectangulares y salas lounge)."
      );
    } else {
      bits.push(
        "Manejamos renta de *mesas y sillas* para eventos: sillas Tiffany y versátiles, mesas redondas y rectangulares, periqueras, salas lounge y más."
      );
    }
    if (/\bsin\s+montaje|solo\s+(para\s+)?entrega|entrega|recoger/i.test(query)) {
      bits.push(
        "Lo tomo como *entrega/recolección* (sin montaje en sitio); el equipo confirma logística y disponibilidad."
      );
    } else {
      bits.push("Podemos cotizar con o sin montaje en sitio, según lo que necesites.");
    }
    return bits.join(" ");
  }

  // Pieza nombrada sin qty (ej. "sillas", "mesas") → null; menú de modelos lo arma progressive.
  if (/\b(sillas?|mesas?|periqueras?|lounge)\b/i.test(query) && items.length === 0) {
    return null;
  }

  return null;
}

/** Acuse NIVEL 3 — solicitud especial; el equipo confirma disponibilidad. */
export function buildLevel3Ack(serviceLabel: string): string {
  const label = serviceLabel.trim() || "tu solicitud";
  return `Tomo nota de tu solicitud especial (*${label}*). Nuestro equipo revisa disponibilidad y te confirma si podemos apoyarte.`;
}

export function buildGuardServiceAck(query: string): string {
  const label = serviceLabelFromQuery(query);
  const level = classifyServiceKnowledgeLevel(query);
  if (level === 1) {
    const detail =
      buildCatalogServiceDetailAnswer(query) ??
      buildCatalogPriceAnswer(query) ??
      buildCatalogInclusionAnswer(query);
    if (detail) return detail;
  }
  if (level === 3) return buildLevel3Ack(label);

  // A15190: centros de mesa = floral/decorativo (no menú de mobiliario).
  if (/\bcentros?\s+de\s+mesas?\b/i.test(query) || /centros?\s+de\s+mesa/i.test(label)) {
    return (
      "¡Claro! Anoto *centros de mesa* (decoración floral) para tu cotización. " +
      "Nuestro equipo te confirma estilos, precio e inclusiones."
    );
  }

  // A14938: "¿Hacen las pizzas en el evento?" — sí, barra/estación montada.
  if (
    /\bpizzas?\b/i.test(query) &&
    /\b(hacen|preparan|cocinan|montan|sirven|elaboran|en\s+el\s+evento|en\s+vivo)\b/i.test(query)
  ) {
    return (
      "Sí: la *barra de pizzas* se monta en tu evento y se preparan al momento " +
      "(estación con hornos/equipo según el paquete). " +
      "También podemos sumar pastas u otras estaciones italianas si te interesa."
    );
  }

  // A15286: fotos / luz / capacidad de carpa → respuesta concreta (no solo medidas).
  {
    const concrete = buildConcreteProductQuestionReply(query);
    if (concrete) return concrete;
  }

  // Carpas: sí + tipos como referencia + medidas (sin volcar brochure).
  if (clientMentionsCarpas(query)) {
    const team = advisorLabelForClient();
    return (
      `Sí, manejamos carpas ${CARPA_OPTIONS_TEXT}. ` +
      `Se cotizan según medidas y sede. ${team} arma el precio. ` +
      "¿Qué opción prefieres y qué medidas aproximadas debe tener (largo × ancho)?"
    );
  }
  if (clientMentionsPistaTarima(query)) {
    const fromPdf = buildLucyInfoLearnedPriceReply(query);
    if (fromPdf) return fromPdf;
    const team = advisorLabelForClient();
    return (
      `Sí, manejamos pistas de baile y tarimas en varios tamaños, con opción iluminada. ` +
      `${team} cotiza según las medidas. ¿Quieres que lo agregue a tu cotización? ¿Qué medidas aproximadas tiene el espacio?`
    );
  }

  const sala = parseSalaProductFromText(query);
  if (sala) {
    const fromPdf = buildLucyInfoLearnedPriceReply(query);
    if (fromPdf) return fromPdf;
    return (
      `Con gusto. Anoto *${sala}* para tu cotización (salas lounge / mobiliario). ` +
      `¿Quieres que lo dejemos en la propuesta?`
    );
  }

  const mobiliario = buildMobiliarioRentDetailReply(query);
  if (mobiliario) {
    const dims = parseSpaceDimensions(query);
    return dims
      ? `${mobiliario} Con espacio ${dims}, el equipo afina la propuesta.`
      : `${mobiliario} ¿Lo agregamos a tu cotización?`;
  }

  // A15204: comida/canapés/catering nunca cae en menú de mesas/sillas.
  const foodSkuNow =
    /\b(canap[eé]s?|bocadillos?|banquetes?|catering|taquiza|paella|coffee\s*break|barra\s+de)\b/iu.test(
      query
    );

  // V8.92: solo "mobiliario" / pieza sin qty → menú progresivo (no dump).
  if (
    !foodSkuNow &&
    (/\b(mobiliario|mobilairio)\b|\bbarras?\s+de\s+mobiliario\b/i.test(query) &&
      !parseMobiliarioRentItems(query).length)
  ) {
    return buildProgressiveOptionsMenu("mobiliario");
  }
  if (
    !foodSkuNow &&
    /\b(sillas?|mesas?|periqueras?|lounge)\b/i.test(query) &&
    !parseMobiliarioRentItems(query).length
  ) {
    const p = parseMobiliarioPieceChoice(query) || (/\bsillas?\b/i.test(query) ? "sillas" : null);
    if (p) return buildMobiliarioPieceFollowUp(p);
  }

  // A15204: catering + canapés → ack de Canapés (no dump de banquete/mobiliario).
  if (/\bcanap/i.test(query)) {
    return (
      "¡Claro! Anoto *Canapés* para tu cotización. " +
      "Es una estación de bocadillos finos para recepción o cocktail. " +
      "¿Quieres que te detalle opciones e inclusiones, o seguimos con los datos del evento?"
    );
  }

  // A15165: show / animación — no Level-2 vacío; orientar + hub.
  if (
    /\bshows?\b|\banimaci[oó]n\b|\bhora\s+loca\b|\bentretenimiento\b/i.test(query)
  ) {
    return (
      "Claro — manejamos *shows*, animación y performance (hora loca, shows en vivo y activaciones). " +
      "Cada propuesta se arma al concepto del evento. " +
      `Te dejo el catálogo general:\n${getCatalogWebHubDeliveryUrl()}\n` +
      "¿Buscas algo en especial (show en vivo, hora loca, otro formato)?"
    );
  }

  return buildLevel2Ack(label);
}

export interface ServiceKnowledgeResult {
  level: ServiceKnowledgeLevel;
  label: string;
  hasSheetPrice: boolean;
  promptBlock: string;
  guardAck: string;
}

/** Mejor conocimiento disponible: Sheet → (futuro PDF RAG) → nivel 2/3. */
export function getServiceKnowledge(query: string): ServiceKnowledgeResult | null {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 3) return null;
  if (!isServiceRelatedMessage(trimmed) && !EVENT_CONTEXT_PATTERN.test(trimmed)) {
    if (!/\b(quiero|necesito|busco|cotizar|precio|incluye)\b/i.test(trimmed)) return null;
  }

  const label = serviceLabelFromQuery(trimmed);
  const level = classifyServiceKnowledgeLevel(trimmed);
  const sheetBlock = formatServiceDataForPrompt(trimmed);
  const sheetPrice = !!buildCatalogPriceAnswer(trimmed);
  const sheetDetail =
    buildCatalogServiceDetailAnswer(trimmed) ??
    buildCatalogInclusionAnswer(trimmed) ??
    null;

  if (level === 1 && (sheetBlock || sheetDetail)) {
    const parts = ["CONOCIMIENTO DE SERVICIO (Google Sheet — precio solo de aquí):"];
    if (sheetBlock) parts.push(sheetBlock);
    else if (sheetDetail) parts.push(sheetDetail);
    parts.push("Usa estos datos. No inventes precios ni inclusiones. Solo cita Incluye si aparece en el bloque.");
    return {
      level: 1,
      label,
      hasSheetPrice: sheetPrice,
      promptBlock: parts.join("\n"),
      guardAck: sheetDetail ?? buildGuardServiceAck(trimmed),
    };
  }

  if (level === 3) {
    return {
      level: 3,
      label,
      hasSheetPrice: false,
      promptBlock: [
        "CONOCIMIENTO DE SERVICIO (solicitud especial — NIVEL 3):",
        `Servicio: ${label}`,
        "Acción: anota como solicitud especial. El equipo confirma disponibilidad.",
        "NUNCA digas 'no lo tenemos'. NUNCA inventes precio.",
        SERVICE_KNOWLEDGE_GOLDEN_RULE,
      ].join("\n"),
      guardAck: buildLevel3Ack(label),
    };
  }

  return {
    level: 2,
    label,
    hasSheetPrice: false,
    promptBlock: [
      "CONOCIMIENTO DE SERVICIO (eventos — NIVEL 2, sin precio en Sheet):",
      `Servicio: ${label}`,
      "Acción: ACEPTA, anota en requerimientos y AVANZA al siguiente dato o cierre.",
      "Acuse breve + siguiente pregunta. NUNCA inventes precio. NUNCA repitas '¿otros servicios?'.",
      SERVICE_KNOWLEDGE_GOLDEN_RULE,
    ].join("\n"),
    guardAck: buildLevel2Ack(label),
  };
}

/** Bloque para inyectar en briefing/redacción antes de GPT. */
export function formatServiceKnowledgeForPrompt(query: string): string | null {
  return getServiceKnowledge(query)?.promptBlock ?? null;
}
