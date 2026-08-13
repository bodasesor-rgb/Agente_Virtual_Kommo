/**
 * A15286 — Pregunta primero (todas las ramas).
 *
 * Cuando el cliente hace una pregunta concreta (fotos, luz, capacidad, ¿cuenta con…?,
 * tipografía rara de "catálogo", ???), Lucy debe RESPONDER o diferir con honestidad.
 * No debe caer en menú progresivo, medidas genéricas ni "¿Seguimos con el siguiente dato?".
 */
import { advisorLabelForClient } from "../lib/bodasesorAdvisor.js";
import {
  clientAsksForCatalog,
  clientMentionsCarpas,
  isServiceRelatedMessage,
} from "../conversation-understanding.js";
import {
  getCatalogWebHubDeliveryUrl,
} from "./catalogService.js";
import { getCatalogWebUrlForQuery } from "./catalogWebKnowledge.js";
import { clientCaptionForServiceParse } from "./imageProcessor.js";

/** Tipografía / typos de "catálogo" (CTALOGO, catalgo, catologo…). */
export const CATALOG_WORD_RE =
  /\bc+t?a+l+[oó]+g+[oa]s?\b|\bcatal+agos?\b|\bcat[oó]logos?\b|\bct[aá]logos?\b/i;

/** A15296: "centros de mesa" es floral — no renta de mesas/sillas. */
function isCentrosDeMesaFloral(text: string): boolean {
  return /\bcentros?\s+de\s+mesas?\b|\bcentros?\s+florales?\b|\barreglos?\s+de\s+mesa\b/i.test(
    text
  );
}

/** Capacidad / acomodo (mesas por carpa, cuántas caben…). */
export function clientAsksCapacityLayout(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /\bmesas?\s+por\s+carpa/i.test(t) ||
    /\bpor\s+carpa\b.{0,20}\?/i.test(t) ||
    /\bcu[aá]ntas?\s+mesas?\b.{0,40}\b(carpa|toldo|lona)/i.test(t) ||
    /\b(carpa|toldo|lona).{0,40}\bcu[aá]ntas?\s+mesas?\b/i.test(t) ||
    /\bcu[aá]ntas?\s+(cab[eé]n|entran|soporta)/i.test(t) ||
    /\b(capacidad|acomodo|layout)\b.{0,30}\b(carpa|mesas?|sillas?)/i.test(t) ||
    /\b\d+\s+mesas?\s+por\s+carpa/i.test(t)
  );
}

/**
 * Fotos / referencias visuales de lo pedido.
 * A15296: solo el caption del cliente — ignorar "tu foto" de Vision.
 */
export function clientAsksForPhotos(message?: string): boolean {
  if (!message?.trim()) return false;
  const caption = clientCaptionForServiceParse(message) || message;
  if (!caption.trim()) return false;
  // Pedido real de fotos ("manda fotos", "fotos de lo solicitado"), no mención de imagen adjunta.
  if (
    !/\b(fotos?|fotograf[ií]as?|im[aá]genes?|referencias?\s+visuales?|pics?)\b/i.test(caption)
  ) {
    return false;
  }
  // "tengo pensado algo así" + imagen adjunta ≠ "mándame fotos".
  if (
    /\b(tengo\s+pensado|algo\s+as[ií]|referencia|as[ií]\s+como|estilo)\b/i.test(caption) &&
    !/\b(manda|env[ií]a|pasa|comparte|quiero|necesito|tienes|tienen|hay)\b.{0,24}\b(fotos?|fotograf)/i.test(
      caption
    ) &&
    !/\b(fotos?|fotograf).{0,24}\b(manda|env[ií]a|solicitad|pedido|lo\s+solicitado)\b/i.test(
      caption
    )
  ) {
    return false;
  }
  return (
    isServiceRelatedMessage(caption) ||
    /\b(solicitad|pedido|cotiz|carpa|mesa|silla|toldo|mobiliario|lo\s+solicitado)\b/i.test(
      caption
    ) ||
    /\b(manda|env[ií]a|pasa|comparte|quiero|necesito|tienes|tienen|hay)\b/i.test(caption)
  );
}

/** Iluminación / luz en carpa u otro montaje. */
export function clientAsksAboutLighting(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return (
    /\b(luz|luces|iluminaci[oó]n|iluminada?s?|leds?|luminarias?)\b/i.test(t) &&
    (/\b(carpa|toldo|lona|pista|tarima|montaje|cuenta|cuentan|tienen|tienes|incluye|trae)\b/i.test(
      t
    ) ||
      /\?/.test(message))
  );
}

/**
 * Pregunta operativa concreta que debe ganar sobre menús/CTA (A15286).
 * No cubre “¿cuentan con carpas?” genérico (eso sigue en ack de servicio).
 */
export function clientAsksConcreteProductQuestion(message?: string): boolean {
  if (!message?.trim()) return false;
  // A15296: detectar solo sobre caption del cliente (sin marcadores Vision).
  const t = (clientCaptionForServiceParse(message) || message).trim();
  if (!t) return false;
  if (clientAsksForCatalog(t) || CATALOG_WORD_RE.test(t)) return true;
  if (clientAsksForPhotos(t) || clientAsksAboutLighting(t) || clientAsksCapacityLayout(t)) {
    return true;
  }
  // "¿cuenta con X?" / ??? sobre un detalle no listado (no solo disponibilidad de SKU).
  if (
    (/\?|¿/.test(t) || /\bcuenta(n)?\s+con\b/i.test(t)) &&
    /\b(luz|luces|iluminaci|fotos?|capacidad|mesas?\s+por|cu[aá]ntas?\s+mesas?|incluye\s+luz)\b/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

function catalogLinkFor(query: string): string {
  if (isCentrosDeMesaFloral(query)) {
    return getCatalogWebHubDeliveryUrl();
  }
  return (
    getCatalogWebUrlForQuery(query) ||
    getCatalogWebUrlForQuery("mesas y sillas") ||
    getCatalogWebHubDeliveryUrl()
  );
}

function honestDeferral(topicHint?: string): string {
  const team = advisorLabelForClient();
  const topic = topicHint?.trim()
    ? ` sobre ${topicHint.trim()}`
    : "";
  return (
    `Buena pregunta${topic} — eso lo confirmo con ${team} para darte el dato exacto ` +
    `y no equivocarme.`
  );
}

/**
 * Respuesta a pregunta concreta: hecho conocido, catálogo, o deferral honesto.
 * null = no aplica (dejar que sigan otros guards).
 */
export function buildConcreteProductQuestionReply(
  message: string,
  serviceHint?: string | null
): string | null {
  const msg = message.trim();
  if (!msg) return null;
  if (!clientAsksConcreteProductQuestion(msg)) return null;

  const hint = (serviceHint ?? "").trim();
  const blob = `${msg} ${hint}`;
  const team = advisorLabelForClient();

  // A15296: caption limpio (sin "tu foto" de Vision).
  const caption = (clientCaptionForServiceParse(msg) || msg).trim();
  const cleanBlob = `${caption} ${hint}`;

  // 1) Catálogo (con typo) → enviar link, no solo CTA.
  if (clientAsksForCatalog(caption) || CATALOG_WORD_RE.test(caption)) {
    const q = isCentrosDeMesaFloral(cleanBlob)
      ? "centros de mesa"
      : /\bsillas?\b/i.test(cleanBlob)
        ? "mesas y sillas"
        : /\bmesas?\b/i.test(cleanBlob) && !isCentrosDeMesaFloral(cleanBlob)
          ? "mesas y sillas"
          : /\bcarpas?|toldos?|lonas?\b/i.test(cleanBlob)
            ? "carpas"
            : hint || caption;
    const url = catalogLinkFor(q);
    const label = isCentrosDeMesaFloral(cleanBlob)
      ? ""
      : /\bsillas?\b/i.test(cleanBlob)
        ? "de mesas y sillas"
        : /\bcarpas?|toldos?\b/i.test(cleanBlob)
          ? "de carpas"
          : "";
    return `Claro. Te dejo el *catálogo${label ? ` ${label}` : ""}*:\n${url}`;
  }

  // 2) Fotos + (opcional) luz / otros.
  const wantsPhotos = clientAsksForPhotos(caption);
  const wantsLight = clientAsksAboutLighting(caption);
  if (wantsPhotos || wantsLight) {
    const parts: string[] = [];
    if (wantsPhotos) {
      const url = catalogLinkFor(
        /\bcarpas?|toldos?\b/i.test(cleanBlob)
          ? "carpas"
          : isCentrosDeMesaFloral(cleanBlob)
            ? "centros de mesa"
            : /\bsillas?|mesas?|mobiliario\b/i.test(cleanBlob)
              ? "mesas y sillas"
              : hint || "mobiliario"
      );
      parts.push(
        `Claro — te puedo compartir referencias visuales. Aquí tienes el catálogo con fotos:\n${url}`
      );
      parts.push(
        `${team} también te puede mandar fotos específicas de lo que estamos cotizando.`
      );
    }
    if (wantsLight) {
      if (clientMentionsCarpas(caption) || /\bcarpas?|toldos?|lonas?\b/i.test(cleanBlob)) {
        parts.push(
          `Sobre *iluminación en la carpa*: se puede cotizar con o sin luz (paquetes de iluminación). ` +
            `Buena pregunta — eso lo confirmo con ${team} para decirte si la carpa que te armemos ya incluye luz o va aparte.`
        );
      } else {
        parts.push(honestDeferral("iluminación"));
      }
    }
    return parts.join("\n\n");
  }

  // 3) Capacidad / mesas por carpa.
  if (clientAsksCapacityLayout(caption)) {
    return (
      `La cantidad de mesas por carpa depende de las *medidas* y del acomodo (redondas, pasillos, pista). ` +
      `No te doy un número a ojo: ${team} te confirma cuántas caben según el tamaño. ` +
      `Si me das medidas aproximadas (o el área a cubrir para tus mesas), lo afino en la cotización.`
    );
  }

  return null;
}

/** ¿Debemos saltar menús progresivos / plantilla de medidas? */
export function shouldSkipSalesMenuForConcreteQuestion(message?: string): boolean {
  return clientAsksConcreteProductQuestion(message);
}
