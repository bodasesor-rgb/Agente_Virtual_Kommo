import { SYSTEM_PROMPT } from "../lucy-prompt.js";
import {
  getCatalogPromptBlockSync,
  buildEventOfferCatalogHint,
} from "./catalogService.js";
import { advisorLabelForClient } from "../lib/bodasesorAdvisor.js";
import type { ObjectionDetection } from "./intentDetection.js";
import type { ExtractedData } from "../types.js";

/**
 * Construye el prompt final para Lucy.
 * Base: SYSTEM_PROMPT V9.13 (chat natural) + catálogo inyectado en runtime.
 * El catálogo/PDF son conocimiento de producto; la redacción la hace el modelo.
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
  const { hasObjection } = context;
  const catalog = context.catalogBlock ?? getCatalogPromptBlockSync();
  const team = advisorLabelForClient();

  let prompt = SYSTEM_PROMPT;
  prompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOZ DE CHAT (prioridad de redacción)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Responde como asesora real de WhatsApp: amable, directa, 2–4 líneas.
NO suenes a formulario ni a menú automático.
El bloque de catálogo abajo es REFERENCIA: úsalo para no inventar; NO lo pegues.
Máximo una pregunta de embudo por mensaje.
Antes de preguntar, revisa historial + ESTADO ACTUAL: nunca repreguntes un dato ya dado.
Si el cliente dio varios datos juntos, registra todos y pide solo lo que falte.
Correo: si duda o no quiere darlo → "¡Claro, sin problema! Lo revisamos todo por este chat".`;

  if (context.lucyInfoBlock?.trim()) {
    prompt += "\n\n" + context.lucyInfoBlock.trim();
  }
  prompt += "\n\n" + catalog;

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
PRIMERA INTERACCIÓN — OBLIGATORIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Empieza con: "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor."
2. Reconoce brevemente lo que el cliente mencionó (si aplica).
3. Pide el nombre: "¿Cuál es tu nombre?"
4. Si ya escribió su nombre en ese mensaje, saluda ("¡Mucho gusto, [Nombre]!") y continúa.
5. En el primer mensaje NO pidas correo, fecha, invitados ni presupuesto antes del nombre.
6. Si ya dio tipo/fecha/lugar/servicios, NO los vuelvas a pedir.`;
  } else {
    prompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSACIÓN EN CURSO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NO te presentes de nuevo.
Revisa CRM + historial: pide solo el siguiente dato que falte.
Orden natural: tipo → servicios → fecha → ubicación → correo → invitados → presupuesto
(salta lo ya capturado). Al cerrar, pasa a ${team} sin prometer tiempos exactos.`;
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
