/**
 * Mapa de dominios de Lucy (inventario de limpieza).
 * Cada ticket A##### debería encajar en uno de estos — no en un if suelto nuevo.
 *
 * Uso: al agregar comportamiento, preferir el módulo del dominio.
 * No borrar selftests de un dominio sin mover la regla a un helper nombrado.
 */
export const LUCY_GUARD_DOMAINS = {
  nombre: {
    module: "guards/opening.ts + contact-name.ts + lucyCrmInvariants.ts",
    keep: [
      "sanitizeCrmNombre / sanitizeDisplayName",
      "lucyAskedForNombre / applyWhatsappNombreFallback / parseNombreFromCrmLines",
      "buildOpeningAcknowledgment / buildFirstInteractionMessage",
      "enforceNombreFirst",
      "nunca tratar cotización/ubicación/Premium/Sí/mándamelo como nombre",
    ],
  },
  embudo: {
    module: "guards/embudoConstants.ts + lucy-flow-guards (orquestador)",
    keep: [
      "CLOSING_CORE_FIELDS / isReadyForClosing",
      "CLOSING_SIGNATURE",
      "waivers correo/presupuesto/fecha",
    ],
  },
  catalogo: {
    module: "catalogUrls.ts + catalogService + guards/catalogSanitize.ts",
    keep: [
      "hub único CATALOG_WEB_HUB_URL",
      "catálogo genérico ≠ inventar SKU (A15169)",
      "Sheet gana sobre PDF; sin gamma.app al cliente",
    ],
  },
  postCierre: {
    module: "guards/postCierreHandler.ts + postCierreReplies.ts",
    keep: [
      "no re-pedir correo/embudo",
      "ack corto al sumar servicios",
      "info/catálogo/modelos sí se atienden (A15165)",
      "tryApplyPostCierreOrHandoffReply",
    ],
  },
  contacto: {
    module: "guards/contactAnswers.ts",
    keep: ["teléfonos", "handoff asesor humano", "emergencia en silencio CRM"],
  },
  precios: {
    module: "price-guard.ts + lucyCrmInvariants.ts",
    keep: [
      "no inventar precios",
      "presupuesto solo si el cliente lo justifica",
      "dígitos de email ≠ presupuesto",
    ],
  },
  antiRepeat: {
    module: "lucyOutboundAntiRepeat.ts + lucyOutboundPipeline.ts",
    keep: ["no re-preguntar campo ya capturado", "no 'Sigo aquí' residual"],
  },
  entretenimiento: {
    module: "guards/salesReplies.ts + serviceProgressiveOffer",
    keep: ["entretenimiento ≠ banquete", "shows/DJ/bailarinas con plantilla+catálogo"],
  },
  food: {
    module: "guards/salesReplies.ts + serviceProgressiveOffer",
    keep: [
      "vague food options antes de dump",
      "recomendaciones por tipo de evento",
      "pitch italiana / progressive detail tras menú",
    ],
  },
} as const;

export type LucyGuardDomain = keyof typeof LUCY_GUARD_DOMAINS;
