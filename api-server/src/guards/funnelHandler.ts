import type { ExtractedData } from "../types.js";
import type { GuardDecision, GuardEffects } from "./policy.js";

type FunnelLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

/**
 * Applies the post-price, pre-cleanup funnel safeguards in their original order.
 * Dependencies stay injected so this module does not depend on the flow orchestrator.
 */
export type FunnelHandlerContext = {
  mensaje: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  currentMessage?: string;
  history: unknown[];
  presHistory: unknown[];
  whatsappDisplayName?: string | null;
  entityId?: string | number;
  cierreYaEnviado: boolean;
  trulyReadyForClosing: boolean;
  appliedDirectReply: boolean;
  appliedSalesReply: boolean;
  log?: FunnelLogger;
  effects?: GuardEffects;
  mensajeAsksForField: (mensaje: string, field: string) => boolean;
  nextFieldQuestion: () => string | null;
  buildNaturalQuestion: (field: string, filledSet?: Set<string>) => string;
  buildClosing: () => string;
  getNextPendingField: (filledSet?: Set<string>) => string | null;
  shouldReplaceForcedEmailQuestion: (mensaje: string) => boolean;
  emailRefusalAckMessage: () => string;
  isEmailSatisfied: () => boolean;
  detectEmailRefusal: () => boolean;
  parseCorreoFromText: () => string | null;
  countLucyFieldAsks: (field: string) => number;
  inferLastAskedField: () => string | null;
  parseSalaProductFromText: () => string | null;
  parseServicesFromText: () => string[];
  isServiceRelatedMessage: () => boolean;
  parseTipoEventoFromText: () => string | null;
  parseFechaFromText: () => string | null;
  formatServicesList: (services: string[]) => string;
  pickVariant: (field: string) => string;
  correoMaxAsks: number;
  emailWaivedLabel: string;
  isReadyForClosing: () => boolean;
  softAsksFilledField: (mensaje: string, field: string) => boolean;
  clientAskedFreeformQuestion: () => boolean;
  responseLooksLikePrematureClose: (mensaje: string) => boolean;
  mergeWithPendingQuestion: (mensaje: string) => string;
  clientAsksInclusion: () => boolean;
  isFieldSatisfied: (field: string) => boolean;
  mensajeAsksWrongField: (mensaje: string) => boolean;
  isInformativeClientAnswer: () => boolean;
};

export function tryApplyFunnelReply(ctx: FunnelHandlerContext): GuardDecision {
  let mensaje = ctx.mensaje;
  let changed = false;

  if (ctx.filledSet.has("Fecha y horario") && ctx.mensajeAsksForField(mensaje, "fecha")) {
    if (ctx.trulyReadyForClosing && !ctx.cierreYaEnviado) {
      mensaje = ctx.buildClosing();
      changed = true;
      ctx.log?.info({ entityId: ctx.entityId }, "GUARD: fecha capturada — cierre");
    } else {
      const nextQ = ctx.nextFieldQuestion();
      if (nextQ && !ctx.mensajeAsksForField(nextQ, "fecha")) {
        mensaje = nextQ;
        changed = true;
        ctx.log?.info({ entityId: ctx.entityId }, "GUARD: fecha ya capturada — no repetir pregunta");
      } else if (!nextQ && ctx.isReadyForClosing() && !ctx.cierreYaEnviado) {
        mensaje = ctx.buildClosing();
        changed = true;
        ctx.log?.info({ entityId: ctx.entityId }, "GUARD: todos los datos listos — cierre tras fecha");
      }
    }
  }

  const fechaFromMsg = ctx.parseFechaFromText();
  if (
    fechaFromMsg &&
    ctx.mensajeAsksForField(mensaje, "fecha") &&
    !ctx.filledSet.has("Fecha y horario")
  ) {
    ctx.filledSet.add("Fecha y horario");
    if (ctx.trulyReadyForClosing && !ctx.cierreYaEnviado) {
      mensaje = ctx.buildClosing();
      changed = true;
      ctx.log?.info({ entityId: ctx.entityId }, "GUARD: fecha capturada en turno — cierre");
    } else {
      mensaje = ctx.nextFieldQuestion() ?? "Entendido, sin problema con la fecha.";
      changed = true;
      ctx.log?.info({ entityId: ctx.entityId }, "GUARD: fecha pendiente — continuar flujo");
    }
  }

  if (
    ctx.filledSet.has("Tipo de evento") &&
    ctx.mensajeAsksForField(mensaje, "tipo_evento") &&
    !ctx.trulyReadyForClosing
  ) {
    const pending = ctx.getNextPendingField();
    if (pending && pending !== "tipo_evento") {
      mensaje = ctx.buildNaturalQuestion(pending);
      changed = true;
      ctx.log?.info({ entityId: ctx.entityId, pending }, "GUARD: tipo de evento ya capturado — siguiente dato");
    }
  }

  if (ctx.shouldReplaceForcedEmailQuestion(mensaje)) {
    mensaje = ctx.nextFieldQuestion() ?? ctx.emailRefusalAckMessage();
    changed = true;
    ctx.log?.warn({ entityId: ctx.entityId }, "GUARD: correo forzado tras rechazo — reemplazando respuesta");
  }

  if (
    !ctx.cierreYaEnviado &&
    !ctx.appliedDirectReply &&
    !ctx.isEmailSatisfied() &&
    !ctx.detectEmailRefusal() &&
    !ctx.parseCorreoFromText()
  ) {
    const correoAsks = ctx.countLucyFieldAsks("correo");
    const lastAskedCorreo = ctx.inferLastAskedField() === "correo";
    const sala = ctx.parseSalaProductFromText();
    const services = ctx.parseServicesFromText();
    const tipo = ctx.parseTipoEventoFromText();
    const usefulNow = !!sala || services.length > 0 || ctx.isServiceRelatedMessage() || !!tipo;

    if (usefulNow && (ctx.mensajeAsksForField(mensaje, "correo") || lastAskedCorreo)) {
      const ack = sala
        ? `Perfecto, anoto *${sala}*.`
        : services.length
          ? `Perfecto, anoto ${ctx.formatServicesList(services)}.`
          : tipo
            ? "Perfecto, anoto el tipo de evento."
            : "Perfecto, lo anoto.";
      if (correoAsks >= ctx.correoMaxAsks) {
        const skipEmail = new Set(ctx.filledSet);
        skipEmail.add("Correo electrónico");
        const pending = ctx.getNextPendingField(skipEmail);
        const nextQ = pending && pending !== "correo" ? ctx.buildNaturalQuestion(pending, skipEmail) : null;
        mensaje = nextQ ? `${ack} ${nextQ}`.trim() : ack;
        changed = true;
        ctx.log?.info({ entityId: ctx.entityId, correoAsks }, "GUARD: correo — tope de asks, avanza embudo");
      } else if (correoAsks >= 1 || lastAskedCorreo) {
        mensaje = `${ack} ${ctx.pickVariant("correo")}`.trim();
        changed = true;
        ctx.log?.info({ entityId: ctx.entityId }, "GUARD: correo — acusa dato útil + variante distinta");
      }
    } else if (correoAsks >= ctx.correoMaxAsks && ctx.mensajeAsksForField(mensaje, "correo")) {
      const skipEmail = new Set(ctx.filledSet);
      skipEmail.add("Correo electrónico");
      const pending = ctx.getNextPendingField(skipEmail);
      if (pending && pending !== "correo") {
        mensaje = ctx.buildNaturalQuestion(pending, skipEmail);
        changed = true;
        ctx.log?.info({ entityId: ctx.entityId, correoAsks }, "GUARD: correo — evita 3ª repetición");
      }
    }
  }

  if (
    ctx.isEmailSatisfied() &&
    (ctx.mensajeAsksForField(mensaje, "correo") || ctx.softAsksFilledField(mensaje, "correo")) &&
    !ctx.trulyReadyForClosing
  ) {
    const pending = ctx.getNextPendingField();
    if (pending && pending !== "correo") {
      const nextQ = ctx.nextFieldQuestion();
      if (nextQ) {
        mensaje = nextQ;
        changed = true;
        ctx.log?.warn({ entityId: ctx.entityId }, "GUARD: GPT preguntó correo ya capturado");
      }
    }
  }

  if (
    ctx.filledSet.has(ctx.emailWaivedLabel) &&
    (ctx.mensajeAsksForField(mensaje, "correo") || ctx.softAsksFilledField(mensaje, "correo")) &&
    !ctx.trulyReadyForClosing
  ) {
    mensaje = ctx.nextFieldQuestion() ?? ctx.emailRefusalAckMessage();
    changed = true;
    ctx.log?.warn({ entityId: ctx.entityId }, "GUARD: GPT insistió en correo tras rechazo");
  }

  if (!ctx.trulyReadyForClosing && !ctx.cierreYaEnviado && !ctx.clientAskedFreeformQuestion()) {
    const pending = ctx.getNextPendingField();
    if (pending && !mensaje.includes("?")) {
      if (ctx.responseLooksLikePrematureClose(mensaje)) {
        mensaje = ctx.buildNaturalQuestion(pending);
        changed = true;
        ctx.log?.info({ entityId: ctx.entityId, pending }, "GUARD: bloqueando cierre — pregunta pendiente");
      } else if (mensaje.trim()) {
        mensaje = ctx.mergeWithPendingQuestion(mensaje);
        changed = true;
        ctx.log?.info({ entityId: ctx.entityId, pending }, "GUARD: añadiendo pregunta pendiente a respuesta");
      }
    }
  }

  if (!ctx.trulyReadyForClosing && !ctx.appliedDirectReply && ctx.responseLooksLikePrematureClose(mensaje)) {
    const forcedNext = ctx.nextFieldQuestion();
    if (forcedNext) {
      mensaje = forcedNext;
      changed = true;
      ctx.log?.warn({ entityId: ctx.entityId }, "GUARD: bloqueando cierre prematuro");
    }
  }

  if (
    !ctx.cierreYaEnviado &&
    !ctx.clientAsksInclusion() &&
    !ctx.appliedDirectReply &&
    !/\bincluye\s*:|bodasesor\.com\/catalogos/i.test(mensaje) &&
    !ctx.isFieldSatisfied("zona") &&
    (ctx.responseLooksLikePrematureClose(mensaje) ||
      ctx.trulyReadyForClosing ||
      ctx.mensajeAsksForField(mensaje, "presupuesto") ||
      ctx.mensajeAsksForField(mensaje, "fecha") ||
      ctx.mensajeAsksForField(mensaje, "invitados"))
  ) {
    const pending = ctx.getNextPendingField();
    if (pending === "zona" || !ctx.mensajeAsksForField(mensaje, "zona")) {
      mensaje = ctx.buildNaturalQuestion("zona");
      changed = true;
      ctx.log?.info({ entityId: ctx.entityId }, "GUARD: forzar ubicación antes de avance/cierre");
    }
  }

  if (ctx.mensajeAsksWrongField(mensaje) && !ctx.isInformativeClientAnswer() && !ctx.appliedSalesReply) {
    const pending = ctx.getNextPendingField();
    if (pending) {
      mensaje = ctx.buildNaturalQuestion(pending);
      changed = true;
      ctx.log?.warn({ entityId: ctx.entityId, pending }, "GUARD: pregunta fuera de orden — corrigiendo");
    }
  }

  return changed
    ? { kind: "reply", id: "GUARD: post-precio — salvaguardas de embudo", mensaje, effects: ctx.effects }
    : { kind: "continue" };
}
