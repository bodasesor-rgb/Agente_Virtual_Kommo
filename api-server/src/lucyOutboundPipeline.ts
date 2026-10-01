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
  dedupeCatalogUrlsInMessage,
  reorderLeadingCatalogUrls,
  preferSpecificCatalogOverHub,
  ensureOutboundAlwaysAsks,
} from "./lucy-flow-guards.js";
import { applyLucyGlobalAntiRepetition } from "./lucyOutboundAntiRepeat.js";
import { applyClientNameCadence, stripMidMessageFiller, softenRobotAcks } from "./lucyNaturalTone.js";
import {
  clientAcceptsIdeasOffer,
  clientClosedServiceList,
  clientWantsIdeasOrTrends,
  enrichReplyWithSalesIdeas,
  stripEchoedLucyText,
} from "./services/trendKnowledge.js";
import { declinedFamiliesInTexts } from "./services/serviceDecline.js";
import { maybeRefinarMensajeCierre } from "./services/lucyRedaction.js";
import {
  clientAsksServiceInfo,
  isServiceRelatedMessage,
  clientMentionsEntertainment,
  parseHorarioFromText,
  historyHasDeliveryChannelChoice,
  clientChoosesChatDelivery,
  clientChoosesEmailDelivery,
  clientDeclinesMoreServices,
  clientAsksVentaOrRenta,
  parseCorreoFromText,
} from "./conversation-understanding.js";
import { suggestEmailDomainFix } from "./client-email.js";
import { horarioNeedsAmPmConfirmation } from "./lib/eventDateTime.js";
import { buildGuardServiceAck } from "./services/serviceKnowledge.js";
import {
  buildConcreteProductQuestionReply,
  clientAsksConcreteProductQuestion,
} from "./services/concreteProductQuestion.js";
import {
  clientComplainsAboutFormat,
  collapseDuplicatedInclusionReply,
  formatCatalogDumpsInMessage,
  lastDenseLucyBlock,
} from "./services/lucyInfoPriceCache.js";
import { clientAsksInclusion } from "./services/catalogService.js";
import { ensureDishCatalogLink, repairOrphanCatalogLinks } from "./services/catalogLinkRepair.js";

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
  /** Viñetas de Google Grounding del turno (si LUCY_GOOGLE_GROUNDING=1). */
  trendGroundingSnippet?: string | null;
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
        proveedor_oferta: null,
        proveedor_estado: null,
        proveedor_catalogo: null,
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
    /\b(s[ií]|manejamos|monta|incluye|prepar|cocin|precio|\$|contamos|ofrecemos|tenemos|caminos|niveles|horn|ayudo|anoto|entretenimiento|shows?|hora\s+loca|animaci[oó]n|cat[aá]logo|bodasesor\.com|mesas?\s+y\s+sillas|tiffany|crossback)\b/i.test(
      mensaje
    ) ||
    // A16511: menú numerado ("1. *Solo alimentos* … 2. *Servicio completo*") ya responde.
    /(?:^|\n)\s*1\.\s+\S[\s\S]*\n\s*2\.\s+\S/.test(mensaje);
  if (
    !input.cierreYaEnviado &&
    !openingNombreOnly &&
    !hasLucyIntro &&
    input.currentMessage &&
    !(clientAsksVentaOrRenta(input.currentMessage) && /\b(renta|venta)\b/i.test(mensaje)) &&
    (clientAsksServiceInfo(input.currentMessage) ||
      clientAsksConcreteProductQuestion(input.currentMessage)) &&
    (isServiceRelatedMessage(input.currentMessage) ||
      clientAsksConcreteProductQuestion(input.currentMessage)) &&
    !alreadyOperational
  ) {
    const ack =
      buildConcreteProductQuestionReply(input.currentMessage) ||
      buildGuardServiceAck(input.currentMessage);
    // Solo preguntas completas "¿…?" — [^.!?]*\? arrastraba líneas de listas sin punto.
    const keepQ = (mensaje.match(/¿[^¿?\n]*\?/g) ?? []).slice(-1).join(" ").trim();
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
  // A16567: el texto del PDF llegaba en un solo bloque ("amontonado").
  if (/Según el catálogo que ya tenemos/i.test(mensaje)) {
    mensaje = formatCatalogDumpsInMessage(mensaje);
  }
  if (clientComplainsAboutFormat(input.currentMessage)) {
    const prior = lastDenseLucyBlock(input.history ?? []);
    const first = input.extracted.nombre?.trim().split(/\s+/)[0];
    const sorry = `Tienes razón${first ? `, ${first}` : ""}, perdón.`;
    const keepQ = (mensaje.match(/¿[^¿?\n]*\?/g) ?? []).slice(-1)[0] ?? "";
    mensaje = prior
      ? `${sorry} Te lo paso más ordenado:\n\n${prior}${keepQ && !prior.includes(keepQ) ? `\n\n${keepQ}` : ""}`
      : `${sorry} Te escribo más claro.${keepQ ? `\n\n${keepQ}` : ""}`;
    input.log?.info?.({ entityId: input.entityId }, "GUARD: A16567 — queja de formato, reenvío ordenado");
  }

  mensaje = stripClientServiceConfusionNotes(mensaje);
  // A15903: red de seguridad — misma URL de catálogo nunca dos veces.
  mensaje = dedupeCatalogUrlsInMessage(mensaje);
  // A16097: hub→slug concreto; nunca URL antes del texto.
  mensaje = preferSpecificCatalogOverHub(
    mensaje,
    `${input.currentMessage ?? ""} ${input.extracted.requerimientos_evento ?? ""}`
  );
  mensaje = reorderLeadingCatalogUrls(mensaje);

  // A16503: "catálogo aquí: ." sin link / pidió ver platillos y no se mandó catálogo.
  {
    const userTexts = (input.history ?? [])
      .filter((m) => m.role === "user" && typeof m.content === "string")
      .map((m) => m.content as string);
    const contextTexts = [
      input.extracted.requerimientos_evento ?? "",
      input.currentMessage ?? "",
      ...userTexts.slice(-8).reverse(),
    ];
    const repaired = ensureDishCatalogLink(repairOrphanCatalogLinks(mensaje, contextTexts), {
      currentMessage: input.currentMessage,
      contextTexts,
    });
    if (repaired !== mensaje) {
      input.log?.info?.({ entityId: input.entityId }, "GUARD: A16503 — link de catálogo reparado/agregado");
      mensaje = repaired;
    }
  }

  // A16345g: ideas reales en el chat (tips por tipo / si pidieron ideas-colores-montajes).
  {
    const historyText = (role: "assistant" | "user") =>
      (input.history ?? [])
        .filter((m) => m.role === role && typeof m.content === "string")
        .map((m) => m.content as string);
    const lucyTexts = historyText("assistant");
    const lastLucy = lucyTexts[lucyTexts.length - 1] ?? "";
    // A16427: Lucy ofreció ideas y el cliente dijo "Si, por favor" → darlas sí o sí.
    const acceptedIdeas = clientAcceptsIdeasOffer(input.currentMessage, lastLucy);
    // A16523: si el cliente pega texto de Lucy para comentarlo, eso no es pedir ideas.
    const ownWords = stripEchoedLucyText(input.currentMessage, lucyTexts);
    const forceIdeas =
      acceptedIdeas ||
      (!clientClosedServiceList(ownWords) &&
        (clientWantsIdeasOrTrends(ownWords) ||
          /recomendaciones?|ideas?\b|colores?|montajes?/i.test(ownWords)));
    // A16567: "¿Tienes ideas de decoración?" pide ideas, no un servicio nuevo — sin aviso
    // "no lo tengo listado" ni "¿Lo dejamos anotado?" encima de las ideas.
    if (forceIdeas && /no lo tengo listado en el cat[aá]logo/i.test(mensaje)) {
      const completo = /servicio\s+completo/i.test(
        [input.extracted.requerimientos_evento ?? "", ...historyText("user")].join(" ")
      );
      const decor = /decoraci|centros?\s+de\s+mesa|globos|tem[aá]tica|moda/i.test(ownWords);
      mensaje =
        decor && completo
          ? "¡Claro! La *decoración* va incluida en el *servicio completo* y la adaptamos a la temática que elijas."
          : "¡Claro! Te comparto algunas ideas.";
    }
    // A16484: sin tip proactivo ("Una idea que funciona muy bien…") — solo si el cliente pide ideas.
    const withIdeas = !forceIdeas ? mensaje : enrichReplyWithSalesIdeas(mensaje, {
      tipoEvento: input.extracted.tipo_evento,
      messageText: ownWords,
      requerimientos: input.extracted.requerimientos_evento,
      force: forceIdeas,
      accepted: acceptedIdeas,
      alreadySent: lucyTexts.join("\n"),
      contextText: historyText("user").slice(-6).join("\n"),
      numInvitados: input.extracted.num_invitados ?? null,
      groundingSnippet: input.trendGroundingSnippet ?? null,
      declinedFamilies: declinedFamiliesInTexts([
        ...historyText("user"),
        input.currentMessage,
      ]),
    });
    if (withIdeas !== mensaje && withIdeas.trim().length >= 8) {
      input.log?.info?.({ entityId: input.entityId }, "GUARD: tono — ideas de venta inyectadas");
      mensaje = withIdeas;
    }
  }

  // A15897 / A16345g: tono — sin "Anoto…", sin nombre/muletilla repetidos.
  {
    const conTono = softenRobotAcks(
      stripMidMessageFiller(
        applyClientNameCadence({
          mensaje,
          clientName: input.extracted.nombre,
          history: input.history,
        })
      )
    );
    if (conTono !== mensaje && conTono.trim().length >= 8) {
      input.log?.info?.({ entityId: input.entityId }, "GUARD: tono — asesora (sin Anoto/muletilla)");
      mensaje = conTono;
    }
    // A16511: "15 años" → "Claro que sí. ¿Cuántos invitados…?" — nadie pidió nada.
    const cmTone = (input.currentMessage ?? "").trim();
    const clientRequested =
      /[?¿]/.test(cmTone) ||
      /\b(puedes|pueden|podr[ií]as?|me\s+(?:das|mandas|pasas|env[ií]as|ayudas)|quiero|necesito|tienes|tienen|hay|manejan|cotiza|informaci[oó]n|info)\b/i.test(
        cmTone
      );
    if (cmTone && !clientRequested && /^\s*¡?Claro\s+que\s+s[ií][.!]\s+(?=¿)/i.test(mensaje)) {
      mensaje = mensaje.replace(/^\s*¡?Claro\s+que\s+s[ií][.!]\s+/i, "Perfecto. ");
    }
    // A16433: "¡Mucho gusto!" solo una vez por conversación.
    const yaDijoMuchoGusto = (input.history ?? []).some(
      (m) => m.role === "assistant" && typeof m.content === "string" && /mucho\s+gusto/i.test(m.content)
    );
    if (yaDijoMuchoGusto) {
      const sinSaludo = mensaje.replace(/^\s*¡?\s*mucho\s+gusto(?:,\s*[^!.,]{1,30})?\s*[!.]?\s*/i, "");
      if (sinSaludo !== mensaje && sinSaludo.trim().length >= 8) {
        mensaje = sinSaludo.charAt(0).toUpperCase() + sinSaludo.slice(1);
      }
    }
  }

  if (!mensaje.trim()) {
    mensaje =
      input.cierreYaEnviado && clientSaysThanks(input.currentMessage)
        ? buildPostCierreThanksReply(input.extracted.nombre)
        : "Gracias por tu mensaje. Nuestro equipo te atiende en breve.";
    input.log?.warn({ entityId: input.entityId }, "GUARD: mensaje vacío — respuesta de respaldo");
  }

  // A16437: canal ya elegido ("Por aquí está bien") + "Es todo" → despedida corta,
  // nunca reenviar el cierre completo ni volver a preguntar el canal.
  {
    const hist = input.history ?? [];
    const cm = (input.currentMessage ?? "").trim();
    const canalPrevio = historyHasDeliveryChannelChoice(hist, null);
    const canalAhora = clientChoosesChatDelivery(cm) || clientChoosesEmailDelivery(cm);
    const cierreSignal =
      clientDeclinesMoreServices(cm) ||
      clientSaysThanks(cm) ||
      /^(ok(ay)?|va|listo|perfecto|sale|de\s+acuerdo|gracias)[.!\s]*$/i.test(cm);
    const reAsksChannel = /escriba\s+por\s+aqu[ií]|prefieres\s+esperar\s+el\s+correo/i.test(mensaje);
    if (cm && ((canalPrevio && (cierreSignal || reAsksChannel)) || (canalAhora && reAsksChannel))) {
      const userMsgs = [...hist.filter((m) => m.role === "user").map((m) => String(m.content ?? "")), cm];
      const lastChoice = [...userMsgs]
        .reverse()
        .find((t) => clientChoosesChatDelivery(t) || clientChoosesEmailDelivery(t));
      const via = lastChoice && clientChoosesEmailDelivery(lastChoice) ? "por correo" : "por aquí";
      const nombre = input.extracted.nombre?.trim().split(/\s+/)[0];
      mensaje = nombre
        ? `¡Listo, ${nombre}! El equipo te escribe ${via} con tu propuesta. Gracias por tu confianza, que tengas un excelente día.`
        : `¡Listo! El equipo te escribe ${via} con tu propuesta. Gracias por tu confianza, que tengas un excelente día.`;
      input.log?.info?.({ entityId: input.entityId }, "GUARD: A16437 — canal ya elegido, despedida corta");
      return formatForWhatsApp(mensaje);
    }
  }

  // A16437: correo con dominio mal escrito (@gmaio.com) → confirmar UNA vez con la sugerencia.
  {
    const typed = parseCorreoFromText(input.currentMessage ?? "");
    const suggested = suggestEmailDomainFix(typed);
    if (typed && suggested && !/¿Tu correo es \*|me confirmas tu correo/i.test(mensaje)) {
      const domain = typed.split("@")[1] ?? "";
      const ask = `¿Tu correo es *${suggested}*? Lo leí como @${domain} y quiero que te llegue bien.`;
      const sinUltimaPregunta = mensaje.replace(/¿[^¿?]*\?\s*$/, "").trim();
      mensaje = sinUltimaPregunta ? `${sinUltimaPregunta}\n\n${ask}` : ask;
      input.log?.info?.({ entityId: input.entityId }, "GUARD: A16437 — confirmar dominio de correo");
    }
  }

  // Horario sin am/pm y sin pista en el contexto → confirmar UNA vez en lugar de otra pregunta.
  if (!input.cierreYaEnviado && input.currentMessage) {
    const horarioMsg = parseHorarioFromText(input.currentMessage);
    const userContext = (input.history ?? [])
      .filter((m) => m.role === "user" && typeof m.content === "string")
      .map((m) => m.content as string)
      .slice(-6)
      .join("\n");
    const context = [
      userContext,
      input.currentMessage,
      input.extracted.requerimientos_evento ?? "",
      input.extracted.horario_evento ?? "",
    ].join("\n");
    const askedAmPmRe = /ma[nñ]ana\s+o\s+(?:de\s+la\s+)?(?:noche|tarde)|\bam\s+o\s+pm\b/i;
    const lucyAskedAlready = (input.history ?? [])
      .filter((m) => m.role === "assistant" && typeof m.content === "string")
      .slice(-3)
      .some((m) => askedAmPmRe.test(m.content as string));
    if (
      horarioMsg &&
      horarioNeedsAmPmConfirmation(horarioMsg, context) &&
      !lucyAskedAlready &&
      !askedAmPmRe.test(mensaje)
    ) {
      const start = horarioMsg.match(/\d{1,2}(?::\d{2})?/)?.[0] ?? "";
      const ask = `¿Sería de ${start} de la mañana o de la noche?`;
      const sinUltimaPregunta = mensaje.replace(/¿[^¿?]*\?\s*$/, "").trim();
      mensaje = sinUltimaPregunta ? `${sinUltimaPregunta}\n\n${ask}` : ask;
      input.log?.info?.({ entityId: input.entityId }, "GUARD: horario ambiguo — confirmar am/pm");
    }
  }

  // A16244: última red — nunca WhatsApp sin pregunta que invite a seguir.
  {
    const before = mensaje;
    mensaje = ensureOutboundAlwaysAsks(mensaje, {
      extracted: input.extracted,
      filledSet: input.filledSet,
      ctx: {
        extracted: input.extracted,
        filledSet: input.filledSet,
        history: input.history ?? [],
        currentMessage: input.currentMessage,
        whatsappName: input.extracted.nombre,
      },
      currentMessage: input.currentMessage,
      cierreYaEnviado: input.cierreYaEnviado,
    });
    if (mensaje !== before) {
      input.log?.info?.({ entityId: input.entityId }, "GUARD: A16244 — always-ask continue");
    }
  }

  return formatForWhatsApp(mensaje);
}
