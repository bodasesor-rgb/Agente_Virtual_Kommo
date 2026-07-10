import OpenAI from "openai";
import { getOpenAiApiKeyForClient, isOpenAiConfigured } from "../lib/openaiEnv.js";
import { logger } from "../lib/logger.js";

const MODEL = "text-embedding-3-small";

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!isOpenAiConfigured()) return null;
  if (!client) client = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });
  return client;
}

/** Vectoriza texto para búsqueda semántica. Devuelve null si OpenAI no está disponible. */
export async function embed(texto: string): Promise<number[] | null> {
  const trimmed = texto?.trim();
  if (!trimmed) return null;

  const openai = getClient();
  if (!openai) return null;

  try {
    const res = await openai.embeddings.create({
      model: MODEL,
      input: trimmed.slice(0, 8000),
    });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    logger.warn({ err }, "embeddings: falló OpenAI");
    return null;
  }
}
