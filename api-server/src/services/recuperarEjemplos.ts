import { logger } from "../lib/logger.js";
import { embed } from "./embeddings.js";
import {
  countVectors,
  pairHash,
  searchVectors,
  setIndexMeta,
  upsertVector,
  vectorExists,
  type VectorPayload,
} from "./vectorStore.js";

const DEFAULT_THRESHOLD = 0.72;
const DEFAULT_K = 3;

export interface EjemploRecuperado {
  preguntaCliente: string;
  respuestaHumano: string;
  score: number;
  source: string;
}

export async function buscarEjemplos(
  mensajeCliente: string,
  k = DEFAULT_K,
  threshold = DEFAULT_THRESHOLD
): Promise<EjemploRecuperado[]> {
  const trimmed = mensajeCliente?.trim();
  if (!trimmed) return [];

  const total = await countVectors();
  if (total === 0) return [];

  try {
    const vector = await embed(trimmed);
    if (!vector) return [];

    const hits = await searchVectors(vector, Math.max(k * 2, 6));
    const filtered = hits
      .filter((h) => h.score >= threshold)
      .slice(0, k)
      .map((h) => ({
        preguntaCliente: h.payload.preguntaCliente,
        respuestaHumano: h.payload.respuestaHumano,
        score: h.score,
        source: h.payload.source,
      }));

    if (filtered.length > 0) {
      logger.info(
        {
          query: trimmed.slice(0, 80),
          matches: filtered.map((f) => ({ score: f.score.toFixed(3), source: f.source })),
        },
        "RAG: ejemplos recuperados"
      );
    }

    return filtered;
  } catch (err) {
    logger.warn({ err }, "RAG: buscarEjemplos falló — Lucy sigue sin ejemplos");
    return [];
  }
}

export function buildRagPromptBlock(ejemplos: EjemploRecuperado[]): string {
  if (ejemplos.length === 0) return "";

  const lines = ejemplos.map(
    (ex, i) =>
      `Ejemplo ${i + 1} (similitud ${(ex.score * 100).toFixed(0)}%):\n` +
      `Cliente: ${ex.preguntaCliente}\n` +
      `Asesor humano: ${ex.respuestaHumano}`
  );

  return (
    `\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `EJEMPLOS DE CÓMO UN ASESOR HUMANO RESPONDIÓ CASOS PARECIDOS\n` +
    `(Guíate por el tono y la información — NO copies literal)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    lines.join("\n\n")
  );
}

/** Indexa un par individual (tras enseñanza manual). Fire-and-forget. */
export async function indexarParUnico(
  pregunta: string,
  respuesta: string,
  source: string,
  kommoLeadId?: string | null
): Promise<boolean> {
  try {
    const vector = await embed(pregunta);
    if (!vector) return false;
    const id = pairHash(pregunta, respuesta);
    if (await vectorExists(id)) return false;

    const payload: VectorPayload = {
      preguntaCliente: pregunta,
      respuestaHumano: respuesta,
      source,
      kommoLeadId: kommoLeadId ?? null,
    };
    await upsertVector(id, vector, payload);
    return true;
  } catch (err) {
    logger.warn({ err }, "RAG: indexarParUnico falló");
    return false;
  }
}
