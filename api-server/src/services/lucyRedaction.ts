/**
 * Pasada de redacción de Lucy: briefing estructurado (datos del CRM/guardas)
 * + parámetros de generación + refinado opcional solo en cierre.
 */
import type OpenAI from "openai";
import type { ExtractedData } from "../types.js";
import {
  getNextPendingField,
  type PendingField,
} from "../lucy-flow-guards.js";
import type { IntentResult, SentimentResult } from "./intentDetection.js";
import { CLOSING_CORE_FIELDS } from "../lucy-flow-guards.js";
import { SERVICE_KNOWLEDGE_GOLDEN_RULE } from "./serviceKnowledge.js";
import { buildEventOfferCatalogHint } from "./catalogService.js";
import { completeChat, fromOpenAiMessages } from "../lib/llmChat.js";
import { getChatModel } from "../lib/llmEnv.js";

/** Modelo activo (Gemini Flash-Lite por default si hay key). */
export function getLucyRedactionModel(): string {
  return getChatModel();
}

/** @deprecated usar getLucyRedactionModel() — se mantiene por tests/imports. */
export const LUCY_REDACTION_MODEL = "gemini-3.1-flash-lite";

const PENDING_FIELD_LABELS: Record<PendingField, string> = {
  nombre: "Nombre del cliente",
  correo: "Correo electrónico (opcional — intentar sin insistir)",
  tipo_evento: "Tipo de evento",
  requerimientos: "Requerimientos o servicios",
  invitados: "Número de invitados",
  zona: "Lugar o ciudad del evento",
  fecha: "Fecha y horario",
  presupuesto: "Presupuesto estimado (MXN)",
};

export const LUCY_REDACTION_PARAMS = {
  max_tokens: 1200,
  temperature: 0.6,
  frequency_penalty: 0.4,
  presence_penalty: 0.2,
  top_p: 0.9,
} as const;

export interface RedactionBriefingInput {
  extracted: ExtractedData;
  filledSet: Set<string>;
  crmMergedLines: string[];
  intent: IntentResult;
  sentiment: SentimentResult;
  stage: string;
  priority: string;
  allFieldsFilled: boolean;
  isFirstInteraction: boolean;
  hasObjection?: boolean;
  objectionType?: string | null;
  cierreYaEnviado?: boolean;
  currentMessage?: string;
  serviceKnowledgeBlock?: string | null;
}

function mapPriorityToUrgency(priority: string): "alta" | "media" | "baja" {
  if (priority === "hot") return "alta";
  if (priority === "cold") return "baja";
  return "media";
}

/** Briefing interno para la pasada de redacción — fuente: CRM y guardas, no GPT. */
export function buildRedactionBriefing(input: RedactionBriefingInput): string {
  const pending = getNextPendingField(input.extracted, input.filledSet);
  const pendingLabel = pending ? PENDING_FIELD_LABELS[pending] : null;
  const urgencia = mapPriorityToUrgency(input.priority);

  const datosCapturados =
    input.crmMergedLines.length > 0
      ? input.crmMergedLines.map((l) => l.replace(/^- /, "")).join("; ")
      : "ninguno aún";

  const faltantes = CLOSING_CORE_FIELDS.filter((f) => !input.filledSet.has(f));

  const lines = [
    "[Contexto interno — NO lo menciones ni cites al cliente]",
    "━━━━━━━━ ESTADO ACTUAL ━━━━━━━━",
    `Capturado: ${datosCapturados}`,
    `Falta: ${faltantes.length ? faltantes.join(", ") : "nada — datos clave completos"}`,
    `Intención detectada: ${input.intent.intent} (confianza ${Math.round(input.intent.confidence * 100)}%)`,
    `Sentimiento: ${input.sentiment.sentiment}`,
    `Etapa del lead: ${input.stage} | Prioridad: ${input.priority} | Urgencia: ${urgencia}`,
    "MEMORIA: revisa historial + este bloque antes de preguntar. Si el cliente ya dio un dato (aunque no se lo hayas pedido), NO lo vuelvas a pedir.",
  ];

  if (input.cierreYaEnviado) {
    lines.push(
      "CIERRE YA ENVIADO — NO reinicies el flujo ni vuelvas a preguntar datos capturados. Responde en contexto de cierre (confirmar, agradecer, anotar pedidos extra)."
    );
  } else if (input.extracted.modo_servicio === "pedido_entrega") {
    lines.push(
      "MODO PEDIDO/ENTREGA — cotiza por producto/cantidad, NO por persona ni con chefs/montaje en evento."
    );
  } else if (input.allFieldsFilled) {
    lines.push(
      "Todos los datos clave están capturados — cierra con sobriedad y pasa a nuestro equipo. Sin tiempos exactos; di 'en breve' o 'muy pronto'."
    );
  } else if (pendingLabel) {
    lines.push(`Siguiente dato a pedir (solo UNO): ${pendingLabel}`);
    if (pending === "requerimientos") {
      const tipo = input.extracted.tipo_evento?.trim();
      if (tipo) {
        lines.push(
          `OFRECIMIENTO TEMPRANO — tipo de evento ya conocido: ${tipo}.`,
          "Propón con criterio servicios que encajen (del catálogo) y pregunta qué le gustaría ir armando.",
          "Suena asesora experta, cálida y natural. Varía palabras. NO digas solo «¿qué servicios quieres cotizar?» sin proponer.",
          SERVICE_KNOWLEDGE_GOLDEN_RULE
        );
        const offerHint = buildEventOfferCatalogHint(tipo);
        if (offerHint) lines.push(offerHint);
      } else {
        lines.push(
          "Al preguntar servicios, menciona opciones: alimentos/barras, mobiliario, carpas, pistas de baile, DJ, iluminación, pantallas, mesas de dulces.",
          SERVICE_KNOWLEDGE_GOLDEN_RULE,
          "Si el cliente ya nombró un servicio, NO repitas '¿algún otro servicio?' — avanza al siguiente dato."
        );
      }
    }
    if (pending === "correo") {
      lines.push(
        "Correo: pídelo natural. Si duda o no quiere darlo → '¡Claro, sin problema! Lo revisamos todo por este chat'. Jamás insistas."
      );
    }
  } else {
    lines.push("Revisa el CRM y pide solo el primer dato que falte.");
  }

  if (input.hasObjection) {
    lines.push(
      `Objeción detectada${input.objectionType ? ` (${input.objectionType})` : ""}: atiéndela antes de insistir en datos.`
    );
  }

  if (input.isFirstInteraction) {
    lines.push(
      'PRIMER mensaje: "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor." + "¿Cuál es tu nombre?"',
      "Si el cliente ya dio nombre/tipo/fecha/lugar en ese mensaje, reconócelos y no los repreguntes."
    );
  } else {
    lines.push(
      "NO te presentes de nuevo.",
      "Voz de chat: 2–4 líneas, máximo UNA pregunta de embudo, sin 'Ya tengo tu…'.",
      "Tras el nombre (si aún no saludaste): '¡Mucho gusto, [Nombre]!' y sigue orgánico.",
      "Varía transiciones (Perfecto/Claro/De acuerdo/Listo); evita 'un placer' / 'bienvenida' / relleno.",
      "Felicitación breve solo si es boda/cumpleaños; luego al grano."
    );
  }

  lines.push(
    "NUNCA inventes precios, inclusiones, disponibilidad ni detalles fuera de Sheet/PDF. Si no hay dato: confirma con el equipo.",
    "Si preguntan qué incluye: usa Sheet (Que Incluye) o PDF del panel Aprendizaje. Sin detalle → link del catálogo web. Jamás inventes cervezas, vinos, platillos ni marcas.",
    SERVICE_KNOWLEDGE_GOLDEN_RULE,
    "Servicios fuera del Sheet pero de eventos: acepta, anota y avanza (NIVEL 2). Precio solo del Sheet.",
    "Si el cliente hizo una pregunta en este mensaje, respóndela ANTES de pedir el siguiente dato.",
    "Escribe como Lucy. No repitas datos ya capturados. Una sola transición de apertura por mensaje."
  );

  if (input.serviceKnowledgeBlock) {
    lines.push("", input.serviceKnowledgeBlock);
  }

  return lines.join("\n");
}

export function appendRedactionBriefing(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  briefing: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [...messages, { role: "system", content: briefing }];
}

export async function completeLucyRedaction(
  _openai: OpenAI | null | undefined,
  baseMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  briefing: string
): Promise<string> {
  const messages = fromOpenAiMessages(appendRedactionBriefing(baseMessages, briefing));
  const result = await completeChat({
    messages,
    purpose: "redaction",
    temperature: LUCY_REDACTION_PARAMS.temperature,
    maxTokens: LUCY_REDACTION_PARAMS.max_tokens,
    frequencyPenalty: LUCY_REDACTION_PARAMS.frequency_penalty,
    presencePenalty: LUCY_REDACTION_PARAMS.presence_penalty,
    topP: LUCY_REDACTION_PARAMS.top_p,
  });
  return result.text;
}

/** Auto-revisión de estilo — solo para mensaje de cierre. */
export async function refinarRespuestaCierre(
  _openai: OpenAI | null | undefined,
  borrador: string
): Promise<string> {
  const result = await completeChat({
    purpose: "redaction",
    temperature: 0.3,
    maxTokens: 1200,
    messages: [
      {
        role: "system",
        content:
          "Eres editora de estilo de Lucy (asesora de eventos Bodasesor). Reescribe el mensaje para que suene más " +
          "cálido, natural y profesional en WhatsApp, sin emojis y sin lenguaje corporativo robótico. " +
          "Conserva TODA la información factual, el texto 'Perfecto, ya tengo todo.', la URL del catálogo si aparece, " +
          "las preguntas y el cierre. Devuelve SOLO el mensaje corregido, sin explicaciones.",
      },
      { role: "user", content: borrador },
    ],
  });
  return (result.text || borrador).trim();
}

export async function maybeRefinarMensajeCierre(
  openai: OpenAI | null | undefined,
  mensaje: string,
  opts: { readyForClosing: boolean; cierreYaEnviado: boolean; closingSignature: string; catalogUrl?: string }
): Promise<string> {
  const { readyForClosing, cierreYaEnviado, closingSignature, catalogUrl } = opts;
  if (!readyForClosing || cierreYaEnviado || !mensaje.includes(closingSignature)) {
    return mensaje;
  }

  const refined = await refinarRespuestaCierre(openai, mensaje);
  if (!refined.includes(closingSignature)) return mensaje;
  if (catalogUrl && mensaje.includes(catalogUrl) && !refined.includes(catalogUrl)) return mensaje;
  return refined;
}
