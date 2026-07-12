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
  isServiceRelatedMessage,
  parsePrimaryService,
} from "../conversation-understanding.js";
import {
  buildCatalogInclusionAnswer,
  buildCatalogPriceAnswer,
  buildCatalogServiceDetailAnswer,
  formatServiceDataForPrompt,
  lookupCatalogServices,
} from "./catalogService.js";

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
