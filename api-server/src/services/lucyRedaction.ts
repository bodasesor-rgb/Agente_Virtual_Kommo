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
    lines.push("Todos los datos clave están capturados — si corresponde, aplica el cierre.");
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
    lines.push(
      "Anti-robot: NO digas 'Ya tengo tu correo/zona' antes de preguntar — ve directo a la siguiente pregunta.",
      "Transiciones: varía (Genial/Perfecto/Excelente/Listo/Claro/Qué padre) — nunca la misma dos veces seguidas.",
      "Servicios: máx 2 líneas de info + 1 pregunta; da detalles útiles antes de decir que el equipo cotiza."
    );
  }

  lines.push(
    `NUNCA inventes precios ni inclusiones. DJ, iluminación, carpas, mobiliario, pantallas y pista de baile sin precio en catálogo — da info útil y di que nuestro equipo lo incluye en la cotización.`,
    `Si preguntan qué incluye un servicio/nivel: SOLO texto del campo Incluye del catálogo. Si está vacío → "el equipo lo confirma en la cotización". Jamás rellenes con cervezas, vinos, platillos ni marcas inventadas.`,
    SERVICE_KNOWLEDGE_GOLDEN_RULE,
    "Servicios fuera del Sheet pero de eventos: acepta, anota y avanza (NIVEL 2). Precio solo del Sheet.",
    "Si el cliente hizo una pregunta en este mensaje, respóndela ANTES de pedir el siguiente dato.",
    "Escribe como Lucy siguiendo todas tus reglas. No repitas datos ya capturados."
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
