import { SYSTEM_PROMPT } from "../lucy-prompt.js";
import {
  getCatalogPromptBlockSync,
  buildEventOfferCatalogHint,
} from "./catalogService.js";
import type { ObjectionDetection } from "./intentDetection.js";
import type { ExtractedData } from "../types.js";

/**
 * Construye el prompt final para Lucy.
 * Base: SYSTEM_PROMPT V7 (maestro consolidado) + catálogo inyectado en runtime.
 * Agrega módulos de objeción + contexto de primera interacción o conversación en curso.
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
}): string {
  const { hasObjection } = context;
  const catalog = context.catalogBlock ?? getCatalogPromptBlockSync();

  let prompt = SYSTEM_PROMPT + "\n\n" + catalog;

  const tipo = context.extracted.tipo_evento?.trim();
  const hasReq = !!(context.extracted.requerimientos_evento?.trim());
  if (tipo && !hasReq) {
    const offerHint = buildEventOfferCatalogHint(tipo);
    if (offerHint) {
      prompt += `\n\n${offerHint}`;
    }
  }

  if (context.isFirstInteraction) {
    prompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMERA INTERACCION — OBLIGATORIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. SIEMPRE empieza con: "Hola, soy Lucy, agente virtual de Bodasesor."
2. Reconoce brevemente lo que el cliente mencionó (si aplica).
3. SIEMPRE pide el nombre como primer dato en el primer mensaje de Lucy.
4. Si el cliente escribe su nombre, usa ese. Si NUNCA lo escribe, puedes usar el de WhatsApp solo después de haberlo preguntado (no saltes el paso).
5. En el primer mensaje NO pidas correo, fecha, invitados ni presupuesto antes de preguntar el nombre.
6. Si el cliente ya dio su nombre en ese mismo primer mensaje, preséntate y continúa con correo.`;
  } else {
    prompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSACIÓN EN CURSO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NO te presentes de nuevo.
Sigue el orden del flujo. Revisa el CRM para saber qué dato falta.`;
  }

  if (hasObjection?.hasObjection && hasObjection.type) {
    prompt += "\n\n" + getObjectionModule(hasObjection.type);
  }

  if (context.crmContext) {
    prompt += context.crmContext;
  }

  return prompt;
}

function getObjectionModule(type: string): string {
  const modules: Record<string, string> = {
    precio: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECIÓN: PRECIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Valida brevemente. Alejandro puede armar opciones dentro de su presupuesto.
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
