import { SYSTEM_PROMPT } from "../lucy-prompt.js";
import { CATALOGO_BODASESOR } from "../catalogo.js";
import type { ObjectionDetection } from "./intentDetection.js";
import type { ExtractedData } from "../types.js";

/**
 * Construye el prompt final para Lucy.
 * Base: SYSTEM_PROMPT V5 optimizado para gpt-4o-mini.
 * Agrega módulos de objeción + contexto de primera interacción o conversación en curso.
 */
export function buildDynamicPrompt(context: {
  stage: string;
  priority: string;
  extracted: ExtractedData;
  hasObjection?: ObjectionDetection;
  crmContext: string;
  isFirstInteraction?: boolean;
}): string {
  const { hasObjection } = context;

  let prompt = SYSTEM_PROMPT + "\n\n" + CATALOGO_BODASESOR;

  if (context.isFirstInteraction) {
    prompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMERA INTERACCION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Aplica PASO 1 del prompt: usa EXACTAMENTE el saludo definido ahí.
NUNCA termines sin pedir el nombre.`;
  } else {
    prompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSACIÓN EN CURSO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NO te presentes de nuevo.
Sigue el orden del PASO 2. Revisa el CRM para saber qué dato falta.`;
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
Valida brevemente. Rodrigo puede armar opciones dentro de su presupuesto.
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
