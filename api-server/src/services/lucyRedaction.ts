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

export const LUCY_REDACTION_MODEL = "gpt-4o-mini";

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
  model: LUCY_REDACTION_MODEL,
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

  const lines = [
    "[Contexto interno — NO lo menciones ni cites al cliente]",
    `Intención detectada: ${input.intent.intent} (confianza ${Math.round(input.intent.confidence * 100)}%)`,
    `Sentimiento: ${input.sentiment.sentiment}`,
    `Etapa del lead: ${input.stage} | Prioridad: ${input.priority} | Urgencia: ${urgencia}`,
    `Datos ya capturados (NO volver a pedirlos): ${datosCapturados}`,
  ];

  if (input.allFieldsFilled) {
    lines.push("Todos los datos clave están capturados — si corresponde, aplica el cierre.");
  } else if (pendingLabel) {
    lines.push(`Siguiente dato a pedir (solo UNO): ${pendingLabel}`);
    if (pending === "requerimientos") {
      lines.push(
        "Al preguntar servicios, menciona opciones: alimentos/barras, mobiliario, carpas, pistas de baile, DJ, iluminación, pantallas, mesas de dulces."
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
    lines.push("Es el PRIMER mensaje de Lucy: presentación + pedir nombre.");
  } else {
    lines.push("NO te presentes de nuevo.");
  }

  lines.push(
    "Si el cliente hizo una pregunta en este mensaje, respóndela ANTES de pedir el siguiente dato.",
    "Escribe como Lucy siguiendo todas tus reglas. No repitas datos ya capturados."
  );

  return lines.join("\n");
}

export function appendRedactionBriefing(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  briefing: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [...messages, { role: "system", content: briefing }];
}

export async function completeLucyRedaction(
  openai: OpenAI,
  baseMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  briefing: string
): Promise<string> {
  const completion = await openai.chat.completions.create({
    ...LUCY_REDACTION_PARAMS,
    messages: appendRedactionBriefing(baseMessages, briefing),
  });
  return completion.choices[0]?.message?.content ?? "";
}

/** Auto-revisión de estilo — solo para mensaje de cierre. */
export async function refinarRespuestaCierre(
  openai: OpenAI,
  borrador: string
): Promise<string> {
  const resp = await openai.chat.completions.create({
    model: LUCY_REDACTION_MODEL,
    temperature: 0.3,
    max_tokens: 1200,
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
  return (resp.choices[0]?.message?.content ?? borrador).trim();
}

export async function maybeRefinarMensajeCierre(
  openai: OpenAI,
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
