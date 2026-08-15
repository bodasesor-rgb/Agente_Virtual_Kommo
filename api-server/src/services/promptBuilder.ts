import { SYSTEM_PROMPT } from "../lucy-prompt.js";
import {
  getCatalogPromptBlockSync,
  buildEventOfferCatalogHint,
  formatServiceDataForPrompt,
} from "./catalogService.js";
import { advisorLabelForClient } from "../lib/bodasesorAdvisor.js";
import type { ObjectionDetection } from "./intentDetection.js";
import type { ExtractedData } from "../types.js";

/**
 * Parte ESTÁTICA del system — apta para context cache cuando se reactive.
 * Nunca incluir catálogo, CRM, Lucy Info ni flags de turno.
 */
export function buildStaticSystemPrompt(): string {
  return `${SYSTEM_PROMPT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOZ DE CHAT (prioridad de redacción)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Responde como asesora real de WhatsApp: amable, directa, 2–4 líneas.
NO suenes a formulario ni a menú automático.
El bloque de catálogo/contexto del turno es REFERENCIA: úsalo para no inventar; NO lo pegues.
Máximo una pregunta de embudo por mensaje.
Antes de preguntar, revisa historial + ESTADO ACTUAL: nunca repreguntes un dato ya dado.
Si el cliente dio varios datos juntos, registra todos y pide solo lo que falte.
Correo: si duda o no quiere darlo → "¡Claro, sin problema! Lo revisamos todo por este chat".`;
}

/**
 * Contexto DINÁMICO del turno (catálogo acotado, CRM, objeciones, flags).
 * Va como mensaje de usuario/contexto, NO dentro del system cacheable.
 */
export function buildDynamicTurnContext(context: {
  stage: string;
  priority: string;
  extracted: ExtractedData;
  hasObjection?: ObjectionDetection;
  crmContext: string;
  isFirstInteraction?: boolean;
  hasClientName?: boolean;
  catalogBlock?: string;
  lucyInfoBlock?: string;
  /** Si true, no inyecta el catálogo completo del Sheet (solo hint por servicio). */
  slimCatalog?: boolean;
  messageText?: string;
}): string {
  const { hasObjection } = context;
  const team = advisorLabelForClient();
  const parts: string[] = [];

  parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  parts.push("CONTEXTO DEL TURNO (dinámico — no es system fijo)");
  parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  parts.push(`Etapa: ${context.stage} · Prioridad: ${context.priority}`);

  if (context.isFirstInteraction) {
    parts.push(`
PRIMERA INTERACCIÓN — OBLIGATORIO
1. Empieza con: "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor."
2. Reconoce brevemente lo que el cliente mencionó (si aplica).
3. Pide el nombre: "¿Cuál es tu nombre?"
4. Si ya escribió su nombre en ese mensaje, saluda ("¡Mucho gusto, [Nombre]!") y continúa.
5. En el primer mensaje NO pidas correo, fecha, invitados ni presupuesto antes del nombre.
6. Si ya dio tipo/fecha/lugar/servicios, NO los vuelvas a pedir.`);
  } else {
    parts.push(`
CONVERSACIÓN EN CURSO
NO te presentes de nuevo.
Revisa CRM + historial: pide solo el siguiente dato que falte.
Orden natural: tipo → servicios → fecha → ubicación → correo → invitados → presupuesto
(salta lo ya capturado). Al cerrar, pasa a ${team} sin prometer tiempos exactos.`);
  }

  if (hasObjection?.hasObjection && hasObjection.type) {
    parts.push(getObjectionModule(hasObjection.type));
  }

  if (context.crmContext) {
    parts.push(context.crmContext);
  }

  if (context.lucyInfoBlock?.trim()) {
    // Acotar PDF/notas: no volcar todo el corpus.
    const info = context.lucyInfoBlock.trim();
    parts.push(info.length > 2500 ? `${info.slice(0, 2497)}…` : info);
  }

  if (context.slimCatalog) {
    const focused =
      (context.messageText ? formatServiceDataForPrompt(context.messageText) : null) ||
      (context.extracted.requerimientos_evento
        ? formatServiceDataForPrompt(context.extracted.requerimientos_evento)
        : null);
    if (focused) {
      parts.push(focused);
    } else {
      const tipo = context.extracted.tipo_evento?.trim();
      const hasReq = !!(context.extracted.requerimientos_evento?.trim());
      if (tipo && !hasReq) {
        const offerHint = buildEventOfferCatalogHint(tipo);
        if (offerHint) parts.push(offerHint);
      }
      // Mini índice: primeras líneas del catálogo sync (no el bloque completo).
      const full = context.catalogBlock ?? getCatalogPromptBlockSync();
      if (full) {
        const clipped = full.length > 1800 ? `${full.slice(0, 1797)}…` : full;
        parts.push(`\nÍndice corto de catálogo (referencia):\n${clipped}`);
      }
    }
  } else {
    const catalog = context.catalogBlock ?? getCatalogPromptBlockSync();
    if (catalog) parts.push(catalog);
    const tipo = context.extracted.tipo_evento?.trim();
    const hasReq = !!(context.extracted.requerimientos_evento?.trim());
    if (tipo && !hasReq) {
      const offerHint = buildEventOfferCatalogHint(tipo);
      if (offerHint) parts.push(offerHint);
    }
  }

  return parts.filter(Boolean).join("\n\n");
}

/**
 * Prompt monolítico legacy (system = estático + dinámico).
 * Preferir buildStaticSystemPrompt + buildDynamicTurnContext (V9.32).
 */
export function buildDynamicPrompt(context: {
  stage: string;
  priority: string;
  extracted: ExtractedData;
  hasObjection?: ObjectionDetection;
  crmContext: string;
  isFirstInteraction?: boolean;
  hasClientName?: boolean;
  catalogBlock?: string;
  /** Texto de PDFs/notas del panel Aprendizaje → Información para Lucy */
  lucyInfoBlock?: string;
}): string {
  return `${buildStaticSystemPrompt()}\n\n${buildDynamicTurnContext({
    ...context,
    slimCatalog: false,
  })}`;
}

function getObjectionModule(type: string): string {
  const team = advisorLabelForClient();
  const modules: Record<string, string> = {
    precio: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECIÓN: PRECIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Valida brevemente. ${team} puede armar opciones dentro de su presupuesto.
Pregunta el rango. NUNCA digas "es caro pero vale la pena". Máximo 3 líneas.`,
    tiempo: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECIÓN: NECESITA TIEMPO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Respeta su tiempo. Ofrece propuesta por escrito. Máximo 2 líneas.`,
    duda: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECIÓN: DUDAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pregunta específicamente: "¿Hay algo en particular que te preocupa?" Máximo 2 líneas.`,
    comparacion: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECIÓN: COMPARANDO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
No compitas en precio. "Cada evento es único, no vendemos paquetes genéricos."
Ofrece propuesta para comparar. Máximo 2 líneas.`,
  };

  return modules[type] ?? "";
}

export { getObjectionModule };
