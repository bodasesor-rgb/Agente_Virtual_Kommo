/**
 * Post-procesado unificado de respuestas Lucy — webhook, salesbot y simulador.
 */
import type OpenAI from "openai";
import type { ExtractedData } from "./types.js";
import { formatForWhatsApp } from "./lib/formatForWhatsApp.js";
import { normalizeAdvisorReferences } from "./lib/bodasesorAdvisor.js";
import { CATALOG_URL } from "./lucy-prompt.js";
import {
  buildPostCierreThanksReply,
  clientSaysThanks,
  CLOSING_SIGNATURE,
  stripCatalogBlockShared,
} from "./lucy-flow-guards.js";
import { applyLucyGlobalAntiRepetition } from "./lucyOutboundAntiRepeat.js";
import { maybeRefinarMensajeCierre } from "./services/lucyRedaction.js";
import {
  clientAsksServiceInfo,
  isServiceRelatedMessage,
} from "./conversation-understanding.js";
import { buildGuardServiceAck } from "./services/serviceKnowledge.js";

export interface FinalizeLucyOutboundInput {
  mensaje: string;
  extracted: Partial<ExtractedData> & { nombre?: string | null };
  readyForClosing: boolean;
  cierreYaEnviado: boolean;
  currentMessage?: string;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  filledSet?: Set<string>;
  openai: OpenAI;
  entityId?: string | number;
  log?: { warn: (obj: object, msg?: string) => void; info?: (obj: object, msg?: string) => void };
}

export async function finalizeLucyOutboundMessage(input: FinalizeLucyOutboundInput): Promise<string> {
  let mensaje = input.mensaje;

  mensaje = await maybeRefinarMensajeCierre(input.openai, mensaje, {
    readyForClosing: input.readyForClosing,
    cierreYaEnviado: input.cierreYaEnviado,
    closingSignature: CLOSING_SIGNATURE,
    catalogUrl: CATALOG_URL,
  });

  mensaje = normalizeAdvisorReferences(mensaje, input.extracted.nombre ?? null);

  if (input.cierreYaEnviado && mensaje.includes(CATALOG_URL)) {
    input.log?.warn({ entityId: input.entityId }, "P3 GUARD: catálogo repetido post-cierre — stripping");
    mensaje = stripCatalogBlockShared(mensaje);
  }

  // Contrato: no cierre prematuro si el embudo aún no está listo.
  if (
    !input.readyForClosing &&
    !input.cierreYaEnviado &&
    mensaje.includes(CLOSING_SIGNATURE)
  ) {
    const without = mensaje
      .split(CLOSING_SIGNATURE)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    mensaje =
      without && without.length > 20
        ? without
        : "Perfecto, lo anoto. ¿Seguimos con el siguiente dato del evento?";
    input.log?.warn?.(
      { entityId: input.entityId },
      "GUARD: cierre prematuro bloqueado (invariante)"
    );
  }

  // Contrato: pregunta de servicio → debe haber respuesta operativa (no solo embudo).
  if (
    !input.cierreYaEnviado &&
    input.currentMessage &&
    clientAsksServiceInfo(input.currentMessage) &&
    isServiceRelatedMessage(input.currentMessage) &&
    !/\b(s[ií]|manejamos|monta|incluye|prepar|cocin|precio|\$|contamos|ofrecemos)\b/i.test(
      mensaje
    )
  ) {
    const ack = buildGuardServiceAck(input.currentMessage);
    const q = mensaje.includes("?") ? `\n\n${mensaje}` : "";
    mensaje = `${ack}${q}`.trim();
    input.log?.info?.(
      { entityId: input.entityId },
      "GUARD: pregunta de servicio — ack forzado (invariante)"
    );
  }

  // Última malla: anti-repetición global (direct/sales/cierre/post-cierre).
  const anti = applyLucyGlobalAntiRepetition({
    mensaje,
    history: input.history,
    filledSet: input.filledSet,
    extracted: input.extracted,
    currentMessage: input.currentMessage,
    cierreYaEnviado: input.cierreYaEnviado,
    clientName: input.extracted.nombre,
  });
  if (anti.applied.length) {
    input.log?.info?.(
      { entityId: input.entityId, applied: anti.applied },
      "GUARD: anti-repetición global"
    );
    mensaje = anti.mensaje;
  }

  if (!mensaje.trim()) {
    mensaje =
      input.cierreYaEnviado && clientSaysThanks(input.currentMessage)
        ? buildPostCierreThanksReply(input.extracted.nombre)
        : "Gracias por tu mensaje. Nuestro equipo te atiende en breve.";
    input.log?.warn({ entityId: input.entityId }, "GUARD: mensaje vacío — respuesta de respaldo");
  }

  return formatForWhatsApp(mensaje);
}
