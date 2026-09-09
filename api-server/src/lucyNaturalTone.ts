/**
 * V9.79 — A15897: los guards arman el mensaje por pedazos (ack + detalle + la
 * pregunta del embudo) y cada pedazo trae su propio saludo. El resultado suena a
 * robot: el nombre del cliente en todos los mensajes y muletillas sueltas
 * ("Claro que sí.") justo antes de la pregunta.
 *
 * Esta es la última pasada de tono, común a las tres rutas de salida.
 */
import type { OpenAI } from "openai";

/** Mensajes de Lucy hacia atrás que se revisan antes de repetir el nombre. */
const RECENT_ASSISTANT_TURNS = 2;

const FILLER = String.raw`(?:Claro que s[ií]|Claro|Con gusto|Perfecto|Genial|Excelente|De acuerdo|Muy bien|Listo)`;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function recentAssistantTexts(
  history: OpenAI.Chat.ChatCompletionMessageParam[] | undefined,
  limit: number
): string[] {
  if (!history?.length) return [];
  const out: string[] = [];
  for (let i = history.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const m = history[i]!;
    if (m.role !== "assistant" || typeof m.content !== "string") continue;
    if (m.content.trim()) out.push(m.content);
  }
  return out;
}

/** Quita el vocativo del nombre dejando la frase bien puntuada. */
export function stripClientNameVocative(mensaje: string, clientName: string): string {
  const first = clientName.trim().split(/\s+/)[0];
  if (!first || first.length < 2) return mensaje;
  const n = escapeRegExp(first);

  return mensaje
    // "Perfecto, Lizbeth." / "Entendido, Lizbeth!" → "Perfecto."
    .replace(new RegExp(String.raw`,\s*${n}\b(?=\s*[.,;:!?]|\s*$)`, "gi"), "")
    // "Lizbeth, ¿qué día tienen en mente?" al inicio de línea.
    .replace(new RegExp(String.raw`(^|\n)\s*${n}\s*,\s*`, "gi"), "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

export interface NameCadenceInput {
  mensaje: string;
  clientName?: string | null;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
}

/**
 * Deja el nombre solo si Lucy no lo usó en sus mensajes recientes.
 * No toca el turno donde se está confirmando o preguntando el nombre.
 */
export function applyClientNameCadence(input: NameCadenceInput): string {
  const mensaje = input.mensaje ?? "";
  const first = input.clientName?.trim().split(/\s+/)[0];
  if (!mensaje.trim() || !first || first.length < 2) return mensaje;

  // "¿Me confirmas que tu nombre es Lizbeth?" necesita el nombre.
  if (/\bnombre\b/i.test(mensaje)) return mensaje;

  const pattern = new RegExp(String.raw`\b${escapeRegExp(first)}\b`, "i");
  if (!pattern.test(mensaje)) return mensaje;

  const yaLoDijo = recentAssistantTexts(input.history, RECENT_ASSISTANT_TURNS).some((t) =>
    pattern.test(t)
  );
  if (!yaLoDijo) return mensaje;

  const stripped = stripClientNameVocative(mensaje, first);
  // Si quitar el vocativo deja el mensaje vacío o roto, mejor dejarlo como estaba.
  return stripped.trim().length >= 8 ? stripped : mensaje;
}

/**
 * Muletilla suelta a media respuesta: el mensaje ya abrió con un acuse, así que
 * "… dime si te interesa alguno. Claro que sí. ¿Cuántos invitados…?" sobra.
 * Solo se quita si no es la apertura del mensaje.
 */
export function stripMidMessageFiller(mensaje: string): string {
  if (!mensaje?.trim()) return mensaje;
  const out = mensaje.replace(
    new RegExp(String.raw`(?<=[.!?…]["'»)*]?[ \t]+)¡?${FILLER}!?\.[ \t]+`, "gi"),
    ""
  );
  return out.replace(/[ \t]{2,}/g, " ").trim();
}
