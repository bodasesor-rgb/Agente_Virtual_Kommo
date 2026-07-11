/**
 * Post-procesado unificado de respuestas Lucy — webhook, salesbot y simulador.
 */
import type OpenAI from "openai";
import { formatForWhatsApp } from "./lib/formatForWhatsApp.js";
import { normalizeAdvisorReferences } from "./lib/bodasesorAdvisor.js";
import { CATALOG_URL } from "./lucy-prompt.js";
import {
  buildPostCierreThanksReply,
  clientSaysThanks,
  CLOSING_SIGNATURE,
  stripCatalogBlockShared,
} from "./lucy-flow-guards.js";
import { maybeRefinarMensajeCierre } from "./services/lucyRedaction.js";

export interface FinalizeLucyOutboundInput {
  mensaje: string;
  extracted: { nombre?: string | null };
  readyForClosing: boolean;
  cierreYaEnviado: boolean;
  currentMessage?: string;
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

  if (!mensaje.trim()) {
    mensaje =
      input.cierreYaEnviado && clientSaysThanks(input.currentMessage)
        ? buildPostCierreThanksReply(input.extracted.nombre)
        : "Gracias por tu mensaje. Nuestro equipo te atiende en breve.";
    input.log?.warn({ entityId: input.entityId }, "GUARD: mensaje vacío — respuesta de respaldo");
  }

  return formatForWhatsApp(mensaje);
}
