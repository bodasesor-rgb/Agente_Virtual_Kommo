/**
 * V9.79 — A15897: los guards arman el mensaje por pedazos (ack + detalle + la
 * pregunta del embudo) y cada pedazo trae su propio saludo. El resultado suena a
 * robot: el nombre del cliente en todos los mensajes y muletillas sueltas
 * ("Claro que sí.") justo antes de la pregunta.
 *
 * A16345g: "Perfecto. Anoto *X*" no vende — suavizar a tono asesora/vendedora
 * sin tocar el embudo (la pregunta pendiente se conserva).
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

/**
 * A16345g: quitar el registro robótico "Anoto…" / "Queda anotado…" y dejar
 * voz de asesora. No borra preguntas del embudo ni links de catálogo.
 */
export function softenRobotAcks(mensaje: string): string {
  if (!mensaje?.trim()) return mensaje;
  let out = mensaje;

  // "Perfecto. Anoto tu *boda*." / "Perfecto. Anoto *Taquiza*."
  out = out.replace(
    /\bPerfecto\.?\s*Anoto(?:\s+tu)?\s+(\*[^*]{1,60}\*|[^.!?\n]{2,60})[.!]?\s*/gi,
    "¡Va! Armamos $1. "
  );
  // "¡Claro! Anoto *20* centros…" / "Claro! Anoto X para tu cotización."
  out = out.replace(/\b¡?Claro!?\.?\s*Anoto\s+/gi, "¡Claro! Vamos con ");
  // "Perfecto — anoto *bailarinas* …"
  out = out.replace(/\bPerfecto\s*[—–-]\s*anoto\s+/gi, "¡Va! Sumamos ");
  // "Anoto *X* para tu cotización."
  out = out.replace(
    /\bAnoto\s+(\*[^*]{1,80}\*|(?:medidas?\s+)?[^.!?\n]{2,80}?)\s+para\s+tu\s+cotizaci[oó]n[.!]?\s*/gi,
    "Seguimos con $1. "
  );
  out = out.replace(/\bAnoto\s+(medidas?\s+[^.!?\n]{2,60})[.!]?\s*/gi, "Tomamos $1. ");
  out = out.replace(/\bAnoto\s+(\*[^*]{1,60}\*)[.!]?\s*/gi, "Seguimos con $1. ");
  // "Anoto la ubicación en *Polanco*." → tono vendedora, misma info.
  out = out.replace(
    /\bAnoto\s+la\s+ubicaci[oó]n\s+en\s+/gi,
    "Queda en "
  );
  out = out.replace(/\bAnoto\s+(?:el\s+)?horario\s+/gi, "Horario ");
  out = out.replace(/\bAnoto\s+(?:la\s+)?fecha\s*:?\s*/gi, "Fecha ");
  // "Queda anotado lo de Banquete."
  out = out.replace(/\bQueda\s+anotado\s+lo\s+de\s+/gi, "Seguimos con ");
  // "Ya lo tengo anotado."
  out = out.replace(/\bYa\s+lo\s+tengo\s+anotad[oa]?[.!]?\s*/gi, "");
  out = out.replace(/\bTomo nota de tu solicitud especial\b/gi, "Revisamos tu solicitud especial");

  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
