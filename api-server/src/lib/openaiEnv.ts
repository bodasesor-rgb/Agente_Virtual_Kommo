/**
 * Bodasesor / Hostinger usa OPEN_AI. OpenAI SDK espera OPENAI_API_KEY.
 * Aceptamos ambos nombres.
 */
export function getOpenAiApiKey(): string {
  return (
    process.env["OPEN_AI"]?.trim() ||
    process.env["OPENAI_API_KEY"]?.trim() ||
    ""
  );
}

export function ensureOpenAiApiKeyEnv(): void {
  const key = getOpenAiApiKey();
  if (key && !process.env["OPENAI_API_KEY"]?.trim()) {
    process.env["OPENAI_API_KEY"] = key;
  }
}
