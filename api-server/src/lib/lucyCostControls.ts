/**
 * Controles de costo Gemini (V9.32).
 * Defaults pensados para cortar fuga: 1 call/turno, sin explicit cache thrashing,
 * historial corto, sin few-shot pesado.
 */

/** ¿Unificar extract+redacción en una sola llamada LLM? Default: sí. */
export function isLucyUnifiedLlmTurn(): boolean {
  const raw = (process.env["LUCY_UNIFIED_LLM_TURN"] ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

/** Máximo de mensajes user/assistant del historial hacia el LLM. Default: 6. */
export function getLucyChatHistoryMax(): number {
  const n = Number(process.env["LUCY_CHAT_HISTORY_MAX"] ?? "6");
  if (!Number.isFinite(n) || n < 2) return 6;
  return Math.min(Math.floor(n), 40);
}

/** Cuántos pares few-shot de training inyectar. Default: 0 (ahorro). */
export function getLucyFewShotMax(): number {
  const n = Number(process.env["LUCY_FEW_SHOT_MAX"] ?? "0");
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 20);
}

/**
 * Recorta historial de chat al final (más reciente), conservando turnos
 * user/assistant. Ignora system. Si empieza en assistant tras el corte,
 * el caller de Gemini ya prepende un user dummy.
 */
export function trimChatHistory<T extends { role: string }>(
  messages: T[],
  maxMessages: number = getLucyChatHistoryMax()
): T[] {
  const dialog = messages.filter((m) => m.role === "user" || m.role === "assistant");
  if (dialog.length <= maxMessages) return dialog;
  return dialog.slice(-maxMessages);
}

export function lucyCostControlsSummary(): {
  unified_llm_turn: boolean;
  chat_history_max: number;
  few_shot_max: number;
  context_cache_env: string;
} {
  return {
    unified_llm_turn: isLucyUnifiedLlmTurn(),
    chat_history_max: getLucyChatHistoryMax(),
    few_shot_max: getLucyFewShotMax(),
    context_cache_env: (process.env["GEMINI_CONTEXT_CACHE"] ?? "0").trim() || "0",
  };
}
