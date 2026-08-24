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
  stripClientServiceConfusionNotes,
  getNextPendingField,
  buildNaturalQuestion,
} from "./lucy-flow-guards.js";
import { applyLucyGlobalAntiRepetition } from "./lucyOutboundAntiRepeat.js";
import { maybeRefinarMensajeCierre } from "./services/lucyRedaction.js";
import {
  clientAsksServiceInfo,
  isServiceRelatedMessage,
  clientMentionsEntertainment,
} from "./conversation-understanding.js";
import { buildGuardServiceAck } from "./services/serviceKnowledge.js";
import {
  buildConcreteProductQuestionReply,
  clientAsksConcreteProductQuestion,
} from "./services/concreteProductQuestion.js";
import { collapseDuplicatedInclusionReply } from "./services/lucyInfoPriceCache.js";
import { clientAsksInclusion } from "./services/catalogService.js";

export interface FinalizeLucyOutboundInput {
  mensaje: string;
  extracted: Partial<ExtractedData> & { nombre?: string | null };
  readyForClosing: boolean;
  cierreYaEnviado: boolean;
  currentMessage?: string;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  filledSet?: Set<string>;
  openai?: OpenAI | null;
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
    // A15165: post-cierre SÍ puede mandar catálogo si el cliente pidió info/shows/mobiliario.
    const allowPostCierreCatalog =
      clientAsksServiceInfo(input.currentMessage) ||
      clientMentionsEntertainment(input.currentMessage) ||
      isServiceRelatedMessage(input.currentMessage) ||
      clientAsksInclusion(input.currentMessage) ||
      /\b(modelos?|sillas?|mobiliario|mobilairio|banquetes?|shows?|cat[aá]logo|info)\b/i.test(
        input.currentMessage ?? ""
      );
    if (!allowPostCierreCatalog) {
      input.log?.warn({ entityId: input.entityId }, "P3 GUARD: catálogo repetido post-cierre — stripping");
      mensaje = stripCatalogBlockShared(mensaje);
    }
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
    if (without && without.length > 20) {
      mensaje = without;
    } else {
      // A15297: no filler genérico — si hay embudo pendiente, pregunta real.
      const extractedFallback: ExtractedData = {
        tipo_contacto: null,
        nombre: input.extracted.nombre ?? null,
        empresa: null,
        telefono: null,
        correo: input.extracted.correo ?? null,
        presupuesto: input.extracted.presupuesto ?? null,
        direccion_evento: input.extracted.direccion_evento ?? null,
        requerimientos_evento: input.extracted.requerimientos_evento ?? null,
        fecha_evento: input.extracted.fecha_evento ?? null,
        horario_evento: input.extracted.horario_evento ?? null,
        fecha_horario: input.extracted.fecha_horario ?? null,
        num_invitados: input.extracted.num_invitados ?? null,
        tipo_evento: input.extracted.tipo_evento ?? null,
        modo_servicio: null,
      };
      const pending = getNextPendingField(
        extractedFallback,
        input.filledSet ?? new Set()
      );
      mensaje = pending
        ? buildNaturalQuestion(pending, {
            extracted: extractedFallback,
            filledSet: input.filledSet,
            history: input.history,
            currentMessage: input.currentMessage,
            whatsappName: input.extracted.nombre,
          })
        : "Perfecto, lo anoto. ¿Me compartes un correo para enviarte los detalles?";
    }
    input.log?.warn?.(
      { entityId: input.entityId },
      "GUARD: cierre prematuro bloqueado (invariante)"
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

  // Contrato DESPUÉS del anti-repeat: si el cliente preguntó por un servicio,
  // la respuesta operativa no puede quedar solo en embudo/correo (A14938 pizzas).
  // A15165: NO pisar presentación Lucy / primer turno (intro + nombre).
  const hasLucyIntro = /hola,?\s*soy\s+lucy/i.test(mensaje);
  const openingNombreOnly =
    hasLucyIntro ||
    (/\b(c[oó]mo\s+te\s+llamas|me\s+regalas\s+tu\s+nombre|con\s+qui[eé]n\s+tengo)\b/i.test(
      mensaje
    ) &&
      !/\b(precio|incluye|nivel|cat[aá]logo)\b/i.test(mensaje));
  const alreadyOperational =
    /\b(s[ií]|manejamos|monta|incluye|prepar|cocin|precio|\$|contamos|ofrecemos|horn|ayudo|anoto|entretenimiento|shows?|hora\s+loca|animaci[oó]n|cat[aá]logo|bodasesor\.com|mesas?\s+y\s+sillas|tiffany|crossback)\b/i.test(
      mensaje
    );
  if (
    !input.cierreYaEnviado &&
    !openingNombreOnly &&
    !hasLucyIntro &&
    input.currentMessage &&
    (clientAsksServiceInfo(input.currentMessage) ||
      clientAsksConcreteProductQuestion(input.currentMessage)) &&
    (isServiceRelatedMessage(input.currentMessage) ||
      clientAsksConcreteProductQuestion(input.currentMessage)) &&
    !alreadyOperational
  ) {
    const ack =
      buildConcreteProductQuestionReply(input.currentMessage) ||
      buildGuardServiceAck(input.currentMessage);
    const keepQ = (mensaje.match(/[^.!?]*\?/g) ?? []).join(" ").trim();
    mensaje = keepQ ? `${ack}\n\n${keepQ}` : ack;
    input.log?.info?.(
      { entityId: input.entityId },
      "GUARD: pregunta de servicio — ack forzado post anti-repeat"
    );
  }

  // A15204: si pidió comida/canapés y la respuesta volcó mobiliario, reemplazar.
  const foodAsk =
    /\b(canap[eé]s?|bocadillos?|catering|banquete|taquiza|paella|coffee\s*break|barra\s+de)\b/iu.test(
      input.currentMessage ?? ""
    );
  const furnitureDump =
    /Mesas\s*y\s*Sillas|mobiliario|periqueras?|Tiffany|Crossback|Colecci[oó]n Vintage/i.test(
      mensaje
    ) && /Según el cat[aá]logo/i.test(mensaje);
  if (foodAsk && furnitureDump) {
    mensaje = buildGuardServiceAck(input.currentMessage ?? "canapés");
    input.log?.info?.(
      { entityId: input.entityId },
      "GUARD: comida ≠ mobiliario — dump de mesas/sillas reemplazado"
    );
  }

  // Dedupe inclusiones PDF al final (inject+guard a veces pegan el bloque 2 veces).
  if (
    clientAsksInclusion(input.currentMessage) ||
    /Según el catálogo que ya tenemos/i.test(mensaje) ||
    /¿Te late este nivel o quieres que te detalle otro\?/i.test(mensaje)
  ) {
    mensaje = collapseDuplicatedInclusionReply(mensaje);
  }

  mensaje = stripClientServiceConfusionNotes(mensaje);

  if (!mensaje.trim()) {
    mensaje =
      input.cierreYaEnviado && clientSaysThanks(input.currentMessage)
        ? buildPostCierreThanksReply(input.extracted.nombre)
        : "Gracias por tu mensaje. Nuestro equipo te atiende en breve.";
    input.log?.warn({ entityId: input.entityId }, "GUARD: mensaje vacío — respuesta de respaldo");
  }

  return formatForWhatsApp(mensaje);
}
