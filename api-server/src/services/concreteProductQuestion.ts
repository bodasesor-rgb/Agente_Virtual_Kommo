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

/** Tipografía / typos de "catálogo" (CTALOGO, catalgo, catologo…). */
export const CATALOG_WORD_RE =
  /\bc+t?a+l+[oó]+g+[oa]s?\b|\bcatal+agos?\b|\bcat[oó]logos?\b|\bct[aá]logos?\b/i;

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

/** Fotos / referencias visuales de lo pedido. */
export function clientAsksForPhotos(message?: string): boolean {
  if (!message?.trim()) return false;
  return (
    /\b(fotos?|fotograf[ií]as?|im[aá]genes?|referencias?\s+visuales?|pics?)\b/i.test(
      message
    ) &&
    (isServiceRelatedMessage(message) ||
      /\b(solicitad|pedido|cotiz|carpa|mesa|silla|toldo|mobiliario|lo\s+solicitado)\b/i.test(
        message
      ) ||
      /\b(manda|env[ií]a|pasa|comparte|quiero|necesito|tienes|tienen|hay)\b/i.test(message))
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
  const t = message.trim();
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

  // 1) Catálogo (con typo) → enviar link, no solo CTA.
  if (clientAsksForCatalog(msg) || CATALOG_WORD_RE.test(msg)) {
    const q = /\bsillas?\b/i.test(blob)
      ? "mesas y sillas"
      : /\bmesas?\b/i.test(blob)
        ? "mesas y sillas"
        : /\bcarpas?|toldos?|lonas?\b/i.test(blob)
          ? "carpas"
          : hint || msg;
    const url = catalogLinkFor(q);
    const label = /\bsillas?\b/i.test(blob)
      ? "de mesas y sillas"
      : /\bcarpas?|toldos?\b/i.test(blob)
        ? "de carpas"
        : "";
    return `Claro. Te dejo el *catálogo${label ? ` ${label}` : ""}*:\n${url}`;
  }

  // 2) Fotos + (opcional) luz / otros.
  const wantsPhotos = clientAsksForPhotos(msg);
  const wantsLight = clientAsksAboutLighting(msg);
  if (wantsPhotos || wantsLight) {
    const parts: string[] = [];
    if (wantsPhotos) {
      const url = catalogLinkFor(
        /\bcarpas?|toldos?\b/i.test(blob)
          ? "carpas"
          : /\bsillas?|mesas?|mobiliario\b/i.test(blob)
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
      if (clientMentionsCarpas(msg) || /\bcarpas?|toldos?|lonas?\b/i.test(blob)) {
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
  if (clientAsksCapacityLayout(msg)) {
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
