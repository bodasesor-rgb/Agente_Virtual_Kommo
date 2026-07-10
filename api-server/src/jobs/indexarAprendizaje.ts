import { logger } from "../lib/logger.js";
import { embed } from "../services/embeddings.js";
import { filtrarPares } from "../services/filtroCalidad.js";
import { recolectarParesAprendizaje } from "../services/kommoChats.js";
import {
  countVectors,
  getIndexEstado,
  pairHash,
  setIndexMeta,
  upsertVector,
  vectorExists,
  type VectorPayload,
} from "../services/vectorStore.js";

export interface IndexarResultado {
  ok: boolean;
  totalEnStore: number;
  paresRevisados: number;
  nuevos: number;
  omitidos: number;
  errores: number;
  lastRunAt: string;
}

/** Orquesta ingesta → filtrado → embeddings → store. Idempotente por hash. */
export async function indexarAprendizaje(): Promise<IndexarResultado> {
  const started = Date.now();
  let nuevos = 0;
  let omitidos = 0;
  let errores = 0;

  const pares = filtrarPares(await recolectarParesAprendizaje());
  logger.info({ paresUtiles: pares.length }, "indexarAprendizaje: pares tras filtro");

  for (const par of pares) {
    const id = pairHash(par.preguntaCliente, par.respuestaHumano);
    if (await vectorExists(id)) {
      omitidos++;
      continue;
    }

    try {
      const vector = await embed(par.preguntaCliente);
      if (!vector) {
        errores++;
        continue;
      }

      const payload: VectorPayload = {
        preguntaCliente: par.preguntaCliente,
        respuestaHumano: par.respuestaHumano,
        contexto: par.contextoPrevio ?? null,
        source: par.source ?? "unknown",
        kommoLeadId: par.kommoLeadId ?? null,
      };
      await upsertVector(id, vector, payload);
      nuevos++;
    } catch (err) {
      errores++;
      logger.warn({ err, id }, "indexarAprendizaje: par falló");
    }
  }

  const lastRunAt = new Date().toISOString();
  const totalEnStore = await countVectors();

  await setIndexMeta({
    lastRunAt,
    lastRunAdded: nuevos,
    lastRunSkipped: omitidos,
    total: totalEnStore,
  });

  logger.info(
    { nuevos, omitidos, errores, totalEnStore, ms: Date.now() - started },
    "indexarAprendizaje: corrida completada"
  );

  return {
    ok: true,
    totalEnStore,
    paresRevisados: pares.length,
    nuevos,
    omitidos,
    errores,
    lastRunAt,
  };
}

export async function obtenerEstadoIndexado() {
  const estado = await getIndexEstado();
  return {
    totalConversacionesAprendidas: estado.total,
    nuevosUltimaCorrida: estado.lastRunAdded,
    omitidosUltimaCorrida: estado.lastRunSkipped,
    ultimaActualizacion: estado.lastRunAt,
  };
}
