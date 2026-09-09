/**
 * V9.78 — Bucle de "no entendí": cuando Lucy no capta el mensaje del cliente
 * suele volver a preguntar lo mismo con otras palabras, turno tras turno.
 *
 * El filtro de lucyOutboundAntiRepeat solo suaviza el texto y no tiene memoria,
 * así que aquí llevamos un contador por lead: dos vueltas en el mismo punto
 * disparan el traspaso al equipo humano en vez de una tercera reformulación.
 */
import type { OpenAI } from "openai";
import { mensajeAsksForField, type PendingField } from "./lucy-flow-guards.js";
import { lucyTextOverlapRatio } from "./lucyOutboundAntiRepeat.js";
import { sanitizeDisplayName } from "./contact-name.js";

/** Turnos atorados seguidos antes de pasar el lead a un humano. */
export const UNCLEAR_STREAK_ESCALATION = 3;

/** Solape de texto que delata una reformulación casi idéntica. */
const NEAR_DUPLICATE_RATIO = 0.7;

const FUNNEL_FIELDS: PendingField[] = [
  "nombre",
  "correo",
  "tipo_evento",
  "requerimientos",
  "invitados",
  "zona",
  "fecha",
  "horario",
  "presupuesto",
];

export interface UnclearTurnInput {
  /** Mensaje ya listo para WhatsApp (después de guards y anti-repetición). */
  outboundMessage: string;
  /** Historial completo; de aquí sale el último turno de Lucy. */
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  /** Campos del CRM antes de procesar este turno. */
  filledBefore: Set<string>;
  /** Campos del CRM después del turno: si creció, el cliente sí se explicó. */
  filledAfter: Set<string>;
  /** Ya se mandó el cierre: los "gracias" de después no son un bucle. */
  cierreYaEnviado?: boolean;
  /** Primer turno: no hay pregunta previa que repetir. */
  isFirstInteraction?: boolean;
}

function lastAssistantMessage(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): string | null {
  const last = [...history]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  const text = typeof last?.content === "string" ? last.content.trim() : "";
  return text || null;
}

function fieldsAsked(mensaje: string): PendingField[] {
  return FUNNEL_FIELDS.filter((f) => mensajeAsksForField(mensaje, f));
}

/**
 * ¿Este turno dejó la conversación donde estaba? Es decir: no entró ningún dato
 * nuevo al CRM y Lucy vuelve a pedir lo mismo (mismo campo o casi el mismo texto).
 */
export function isStuckLoopTurn(input: UnclearTurnInput): boolean {
  const { outboundMessage, filledBefore, filledAfter } = input;
  if (input.cierreYaEnviado || input.isFirstInteraction) return false;
  if (!outboundMessage.trim()) return false;

  // El cliente aportó algo que sí entendimos → no hay bucle.
  for (const label of filledAfter) {
    if (!filledBefore.has(label)) return false;
  }

  const previous = lastAssistantMessage(input.history);
  if (!previous) return false;

  if (lucyTextOverlapRatio(outboundMessage, previous) >= NEAR_DUPLICATE_RATIO) {
    return true;
  }

  const askedNow = fieldsAsked(outboundMessage);
  if (askedNow.length === 0) return false;
  const askedBefore = new Set(fieldsAsked(previous));
  return askedNow.some((f) => askedBefore.has(f));
}

/** Contador acumulado: crece con cada turno atorado, se reinicia al avanzar. */
export function nextUnclearStreak(previous: number | null | undefined, stuck: boolean): number {
  if (!stuck) return 0;
  const base = Number.isFinite(previous) && (previous ?? 0) > 0 ? Math.floor(previous!) : 0;
  return base + 1;
}

export function shouldEscalateForUnclear(streak: number): boolean {
  return streak >= UNCLEAR_STREAK_ESCALATION;
}

/**
 * Mensaje de salida cuando Lucy se rinde. Habla de "nuestro equipo": el nombre
 * del asesor lo resuelve normalizeAdvisorReferences aguas abajo.
 */
export function buildUnclearHandoffMessage(clientName?: string | null): string {
  const name = sanitizeDisplayName(clientName);
  return [
    `Creo que no me estoy explicando bien${name ? `, ${name}` : ""}. Mejor te paso con nuestro equipo para que te atiendan directo y no darte más vueltas.`,
    "",
    "Mientras te contactan, también puedes marcar:",
    "Ventas: 55 4008 0373 — solo por línea telefónica (no WhatsApp).",
    "Gerencia / corporativo: 56 4671 0585 — WhatsApp o línea telefónica.",
    "",
    "Ya dejé tu caso listo para el equipo.",
  ].join("\n");
}
