/**
 * Barrel de módulos de guards (limpieza V9.04).
 * lucy-flow-guards.ts re-exporta lo público para no romper imports existentes.
 */
export {
  EMAIL_WAIVED_LABEL,
  BODASESOR_EMAIL,
  WHATSAPP_NOMBRE_NOTE,
  CLOSING_CORE_FIELDS,
  LUCY_INTRO,
  TIPO_EVENTO_HINT,
  SERVICIOS_CATALOGO_HINT,
  SERVICIOS_CATALOGO_HINT_ADICIONAL,
  OTRO_SERVICIO_ASK_PATTERN,
  CORREO_MAX_ASKS,
  CLOSING_SIGNATURE,
  FLOW_QUESTIONS,
  type PendingField,
} from "./embudoConstants.js";

export { stripCatalogBlockShared } from "./catalogSanitize.js";

export {
  buildPhoneAnswer,
  buildEmergencyContactAnswer,
  buildHumanAdvisorHandoffAnswer,
  buildLocationAnswer,
} from "./contactAnswers.js";

export {
  clientAsksPaymentOrQuoteDelivery,
  buildPostCierreThanksReply,
  buildPostCierrePaymentHandoffReply,
  buildPostCierreCallbackAck,
} from "./postCierreReplies.js";

export { LUCY_GUARD_DOMAINS, type LucyGuardDomain } from "./domains.js";

export {
  TRANSITION_START_PATTERN,
  pickTransition,
  dedupeTransitionsInMessage,
  stripRobotAcknowledgments,
  clientSaysThanks,
} from "./transitions.js";

export {
  detectCierreEnviado,
  collectUserTexts,
} from "./historyHelpers.js";

export {
  buildGenericCatalogHubBlock,
  collectServicesForCatalogOffer,
  buildPackageCatalogOfferBlock,
  buildMappedCatalogOfferBlock,
  historyAlreadyOfferedServiceDetail,
  buildStandardClosingMessage,
  buildMultiServiceSheetLevelsReply,
  buildMultiServicePackageReply,
} from "./catalogOffer.js";

export {
  tryApplyPostCierreOrHandoffReply,
  type PostCierreHandlerInput,
  type PostCierreHandlerResult,
} from "./postCierreHandler.js";
