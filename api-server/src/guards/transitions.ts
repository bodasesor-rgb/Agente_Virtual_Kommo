/**
 * Transiciones conversacionales y acks (anti-robot / anti-repetición).
 */
import type OpenAI from "openai";

const LUCY_TRANSITIONS = [
  "Perfecto.",
  "De acuerdo.",
  "Claro que sí.",
  "Con gusto.",
  "Listo.",
  "Claro.",
] as const;

/** Usado también al reescribir el prefijo de un mensaje existente. */
export const TRANSITION_START_PATTERN =
  /^(Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro que sí|Claro|Qué padre|De acuerdo|Con gusto)\./i;

/** Rota transiciones — nunca la misma dos veces seguidas (regla Replit). */
export function pickTransition(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): string {
  const assistants = history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .map((m) => (m.content as string).trim());

  const last = assistants[assistants.length - 1] ?? "";
  const lastMatch = last.match(TRANSITION_START_PATTERN);
  const lastTransition = lastMatch ? lastMatch[0] : null;

  const start = assistants.length % LUCY_TRANSITIONS.length;
  for (let i = 0; i < LUCY_TRANSITIONS.length; i++) {
    const candidate = LUCY_TRANSITIONS[(start + i) % LUCY_TRANSITIONS.length]!;
    if (candidate !== lastTransition) return candidate;
  }
  return LUCY_TRANSITIONS[0]!;
}

/** Evita "Suena muy bien. … Suena muy bien. …" en el mismo mensaje. */
export function dedupeTransitionsInMessage(mensaje: string): string {
  if (!mensaje?.trim()) return mensaje;
  const pattern =
    /\b(Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro que sí|Claro|Qué padre|De acuerdo|Con gusto)\./gi;
  let seen: string | null = null;
  let out = mensaje
    .replace(pattern, (match) => {
      const key = match.toLowerCase();
      if (seen === key) return "";
      if (!seen) seen = key;
      return match;
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim();
  // A15016: "Perfecto, Israel. Mucho gusto, Israel." / doble Mucho gusto.
  out = out.replace(
    /\b(Mucho gusto,\s+([A-Za-zÁÉÍÓÚáéíóúüñÑ]{2,})\.)(?:\s+\1)+/gi,
    "$1"
  );
  out = out.replace(
    /\b(Perfecto|Excelente|Genial|Claro),\s+([A-Za-zÁÉÍÓÚáéíóúüñÑ]{2,})\.\s+Mucho gusto,\s+\2\./gi,
    "$1, $2."
  );
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Quita "Ya tengo tu correo/zona..." antes de la siguiente pregunta (anti-robot Replit). */
export function stripRobotAcknowledgments(mensaje: string): string {
  let out = mensaje;
  out = out.replace(
    /(?:Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro que sí|Claro|Qué padre|De acuerdo|Con gusto)[,.]?\s+(?:\w+[,.]?\s+)?ya\s+tengo\s+(?:tu|su|el|la)\s+[^.?!]+\.\s*/gi,
    ""
  );
  out = out.replace(/\bYa\s+tengo\s+(?:tu|su|el|la)\s+[^.?!]+\.\s*/gi, "");
  out = out.replace(/\bPerfecto,\s+\w+\.\s+Ya\s+tengo\b[^.?!]+\.\s*/gi, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

export function clientSaysThanks(message?: string): boolean {
  if (!message?.trim()) return false;
  return /\b(muchas\s+gracias|gracias|thank\s+you|mil\s+gracias|te\s+agradezco)\b/i.test(message);
}
