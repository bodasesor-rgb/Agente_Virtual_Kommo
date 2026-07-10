import type { OpenAI } from "openai";
import type { TrainingExample } from "./training.js";
import { getTrainingExamples } from "./training.js";
import { buscarEjemplos, buildRagPromptBlock } from "../services/recuperarEjemplos.js";
import { logger } from "../lib/logger.js";

const MAX_PINNED = 10;

/** Etiquetas que SIEMPRE se inyectan (enseñanza manual del panel). */
function isPinnedExample(ex: TrainingExample): boolean {
  const label = ex.label?.trim() ?? "";
  return /^(Aprendizaje|Aprendido):/i.test(label);
}

/**
 * Construye el contexto de aprendizaje para Lucy:
 * - Pinned: enseñanzas manuales del panel (siempre activas)
 * - RAG: top-k ejemplos similares del historial humano (si hay match)
 *
 * Ya NO inyecta los 48 ejemplos semilla en cada turno — eso generaba ruido
 * y conflictos con los guards del flujo.
 */
export async function buildLucyTrainingContext(
  clientMessage: string,
  log?: { info: (obj: unknown, msg?: string) => void }
): Promise<{
  fewShot: OpenAI.Chat.ChatCompletionMessageParam[];
  ragBlock: string;
  meta: { pinned: number; retrieved: number; similarities: number[] };
}> {
  const all = await getTrainingExamples();
  const pinned = all.filter(isPinnedExample).slice(0, MAX_PINNED);

  const fewShot: OpenAI.Chat.ChatCompletionMessageParam[] = pinned.flatMap((ex) => [
    { role: "user" as const, content: ex.userMessage },
    { role: "assistant" as const, content: ex.lucyResponse },
  ]);

  let retrieved: Awaited<ReturnType<typeof buscarEjemplos>> = [];
  try {
    retrieved = await buscarEjemplos(clientMessage, 3);
  } catch (err) {
    logger.warn({ err }, "buildLucyTrainingContext: RAG falló");
  }

  const ragBlock = buildRagPromptBlock(retrieved);

  if (retrieved.length > 0) {
    log?.info(
      {
        pinned: pinned.length,
        retrieved: retrieved.length,
        scores: retrieved.map((r) => r.score.toFixed(3)),
      },
      "Training: pinned + RAG"
    );
  }

  return {
    fewShot,
    ragBlock,
    meta: {
      pinned: pinned.length,
      retrieved: retrieved.length,
      similarities: retrieved.map((r) => r.score),
    },
  };
}
