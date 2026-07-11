/**
 * Bodasesor / Hostinger usa OPEN_AI. OpenAI SDK espera OPENAI_API_KEY.
 * Aceptamos ambos nombres.
 */
const PLACEHOLDER_KEY = "lucy-not-configured";

export function getOpenAiApiKey(): string {
  return (
    process.env["OPEN_AI"]?.trim() ||
    process.env["OPENAI_API_KEY"]?.trim() ||
    ""
  );
}

/** Para construir el cliente OpenAI sin tumbar el servidor (evita 503 en Hostinger). */
export function getOpenAiApiKeyForClient(): string {
  return getOpenAiApiKey() || PLACEHOLDER_KEY;
}

export function isOpenAiConfigured(): boolean {
  return getOpenAiApiKey().length > 0;
}

export function ensureOpenAiApiKeyEnv(): void {
  const key = getOpenAiApiKey();
  if (key && !process.env["OPENAI_API_KEY"]?.trim()) {
    process.env["OPENAI_API_KEY"] = key;
  }
}
