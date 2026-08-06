import type { OpenAI } from "openai";
import type { ExtractedData } from "../types.js";
import { type PendingField } from "./embudoConstants.js";
import { FIELD_ASK_PATTERNS } from "./embudoQuestions.js";
import { pickTransition, TRANSITION_START_PATTERN } from "./transitions.js";

export interface OutboundNormalizationContext {
  extracted: ExtractedData;
  whatsappName?: string | null;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  presentationHistory?: OpenAI.Chat.ChatCompletionMessageParam[];
  currentMessage?: string;
  entityId?: string | number;
  afterEmail?: boolean;
}

export interface OutboundNormalizeDeps {
  getNextPendingField: (extracted: ExtractedData, filledSet: Set<string>) => PendingField | null;
  isFieldSatisfied: (field: PendingField, filledSet: Set<string>, extracted: ExtractedData) => boolean;
  mensajeAsksForField: (mensaje: string, field: PendingField) => boolean;
  mensajeAsksForFilledField: (mensaje: string, filledSet: Set<string>, extracted: ExtractedData) => boolean;
  mensajeAsksWrongField: (mensaje: string, filledSet: Set<string>, extracted: ExtractedData) => boolean;
  buildNaturalQuestion: (field: PendingField, ctx: OutboundNormalizationContext) => string;
  isProgressiveOptionsMenuReply: (mensaje: string) => boolean;
  pickVariant: (
    field: PendingField,
    history: OpenAI.Chat.ChatCompletionMessageParam[],
    entityId?: string | number
  ) => string;
  clientMentionsCatering: (message?: string) => boolean;
  clientMentionsEntertainment: (message?: string) => boolean;
  clientMentionsPistaTarima: (message?: string) => boolean;
  isServiceRelatedMessage: (message?: string) => boolean;
  isInformativeClientAnswer: (message?: string) => boolean;
  clientAskedFreeformQuestion: (message?: string) => boolean;
  hasTipoEvento: (filledSet: Set<string>, extracted: ExtractedData) => boolean;
  aiLooksLikeEventServiceOffer: (mensaje: string) => boolean;
  isDryRequerimientosAsk: (mensaje: string) => boolean;
  collectUserTexts: (
    history: OpenAI.Chat.ChatCompletionMessageParam[],
    currentMessage?: string
  ) => string[];
  findPresupuestoInTexts: (
    texts: string[],
    history?: OpenAI.Chat.ChatCompletionMessageParam[]
  ) => string | null;
  mensajeMencionaCatalogoServicios: (mensaje: string) => boolean;
  historyAlreadyHadServicesCatalog: (
    history?: OpenAI.Chat.ChatCompletionMessageParam[]
  ) => boolean;
  appendServiciosCatalogoHint: (
    mensaje: string,
    includeAll: boolean,
    history?: OpenAI.Chat.ChatCompletionMessageParam[]
  ) => string;
}

function lucyHasPresented(history: OpenAI.Chat.ChatCompletionMessageParam[]): boolean {
  return history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .some((m) => /hola,?\s*soy\s+lucy/i.test(m.content as string));
}

export function stripRepeatLucyIntro(
  mensaje: string,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  alreadyStarted: boolean
): string {
  if (!alreadyStarted && !lucyHasPresented(history)) return mensaje;
  return mensaje
    .replace(/Hola,?\s*soy\s+Lucy(?:,\s*agente\s+virtual)?\s+de\s+Bodasesor\.?\s*/gi, "")
    .replace(/Estoy aquí para ayudarte con lo que necesites para tu evento\.?\s*/gi, "")
    .replace(/Con gusto te ayudo\.?\s*/gi, "")
    .replace(/^\s+/, "")
    .trim();
}

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

export function stripLeadingTransition(text: string): string {
  return text
    .replace(/^(Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro que sí|Claro|Qué padre|De acuerdo|Con gusto)\.\s*/i, "")
    .trim();
}

export function requerimientosFollowUpTemplate(text: string, clientName?: string | null): string | null {
  let s = stripLeadingTransition(text);
  s = stripAccents(s.toLowerCase());
  if (clientName?.trim()) {
    const name = stripAccents(clientName.trim().toLowerCase());
    s = s.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ");
  }
  s = s
    .replace(/\b(adem[aá]s del|con el|solo el|la renta de la?|las?)\s+[^,?]+/gi, "__svc__")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /__svc__.*(alg[uú]n\s+otro\s+servicio|otro\s+servicio|algo\s+m[aá]s|te\s+gustar[ií]a\s+cotizar)/i.test(s) ||
    /qu[eé]\s+otros\s+servicios/i.test(s) ||
    /necesitan\s+alg[uú]n\s+otro\s+servicio/i.test(s)
  ) return "followup_otro_servicio";
  return null;
}

export function bodyEqualsLastAssistant(
  msg: string,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  clientName?: string | null
): boolean {
  const last = [...history].reverse().find((m) => m.role === "assistant");
  if (!last || typeof last.content !== "string") return false;
  const norm = (s: string) => stripLeadingTransition(s).trim();
  const a = norm(msg);
  const b = norm(last.content as string);
  if (a === b) return true;
  const templateA = requerimientosFollowUpTemplate(a, clientName);
  const templateB = requerimientosFollowUpTemplate(b, clientName);
  if (templateA && templateB && templateA === templateB) return true;
  const normText = (s: string) =>
    stripAccents(stripLeadingTransition(s).toLowerCase()).replace(/\s+/g, " ").trim();
  return normText(a) === normText(b);
}

export function contextualPrefix(
  field: PendingField,
  extracted: ExtractedData,
  currentMessage: string | undefined,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  clientMentionsCatering: (message?: string) => boolean
): string {
  const msg = currentMessage?.trim() ?? "";
  if (!msg) return "";
  if (field === "requerimientos" && clientMentionsCatering(currentMessage)) return `${pickTransition(history)} `;
  if (field === "invitados" && (extracted.tipo_evento || /boda|xv|cumple|corporativo|baby/i.test(msg))) return `${pickTransition(history)} `;
  if (field === "zona" && /\d+/.test(msg)) return "Entendido. ";
  if (field === "fecha" && /ciudad|zona|polanco|cdmx|puebla|monterrey|reforma/i.test(msg)) return "Muy bien. ";
  if (field === "presupuesto" && /fecha|junio|julio|agosto|s[aá]bado|domingo|\d{1,2}\s+de/i.test(msg)) return `${pickTransition(history)} `;
  return "";
}

export function emailThanksPrefix(
  ctx: OutboundNormalizationContext,
  getDisplayName: (extracted: ExtractedData, whatsappName?: string | null) => string | null
): string {
  if (!ctx.afterEmail) return "";
  const nombre = getDisplayName(ctx.extracted, ctx.whatsappName);
  return nombre ? `Gracias por tu correo, ${nombre}. ` : "Gracias por tu correo. ";
}

export function stripLeadingDisplayName(mensaje: string, displayName: string | null | undefined): string {
  const nombre = displayName?.trim();
  if (!nombre) return mensaje;
  const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return mensaje
    .replace(new RegExp(`^${escaped}\\s*[.!,:—\\-]*\\s*`, "i"), "")
    .replace(new RegExp(`^${escaped}\\s+`, "i"), "")
    .trim();
}

export function applyEmailCaptureTone(
  mensaje: string,
  ctx: OutboundNormalizationContext,
  getDisplayName: (extracted: ExtractedData, whatsappName?: string | null) => string | null
): string {
  const thanks = emailThanksPrefix(ctx, getDisplayName);
  if (!thanks) return mensaje;
  let out = mensaje.trim();
  if (/gracias por tu correo/i.test(out)) return out;
  out = out
    .replace(/^(genial|perfecto|excelente|muy bien),?\s+/i, "")
    .replace(/^mucho gusto,?\s+[^.!?]+[.!?]\s*/i, "");
  out = stripLeadingDisplayName(out, getDisplayName(ctx.extracted, ctx.whatsappName));
  return `${thanks}${out}`.trim();
}

export function collapseDuplicateFieldQuestions(mensaje: string, field: PendingField): string {
  const blocks = mensaje.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length <= 1) return mensaje.trim();
  let seen = false;
  const kept: string[] = [];
  for (const block of blocks) {
    if (block.includes("?") && FIELD_ASK_PATTERNS[field].test(block)) {
      if (seen) continue;
      seen = true;
    }
    kept.push(block);
  }
  return kept.join("\n\n").trim();
}

export function textOverlapRatio(a: string, b: string): number {
  const na = a.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (!wordsA.size || !wordsB.size) return 0;
  let shared = 0;
  for (const word of wordsA) if (wordsB.has(word)) shared++;
  return shared / Math.max(wordsA.size, wordsB.size);
}

export function avoidRepeatPreviousReply(mensaje: string, presHistory: OpenAI.Chat.ChatCompletionMessageParam[]): string {
  const prev = presHistory.filter((m) => m.role === "assistant" && typeof m.content === "string")
    .map((m) => (m.content as string).trim()).filter(Boolean);
  if (prev.length === 0) return mensaje;
  const maxOverlap = Math.max(...prev.map((p) => textOverlapRatio(mensaje, p)));
  const last = prev[prev.length - 1]!;
  if (maxOverlap < 0.68) return mensaje;
  const out = mensaje.replace(/^Hola,?\s*soy\s+Lucy[^.]*\.\s*/i, "")
    .replace(TRANSITION_START_PATTERN, pickTransition(presHistory));
  if (Math.max(...prev.map((p) => textOverlapRatio(out, p))) < 0.65) return out.trim();
  const questionLine = mensaje.split("\n").find((line) => line.includes("?")) ?? mensaje.split("\n").pop();
  const question = questionLine?.trim() || mensaje;
  if (Math.max(...prev.map((p) => textOverlapRatio(question, p))) >= 0.72) {
    const pendingLine = mensaje.split("\n").filter((line) => line.includes("?")).pop();
    if (pendingLine && textOverlapRatio(pendingLine, last) < 0.65) return pendingLine.trim();
  }
  return question;
}

function mergeWithPendingQuestion(
  mensaje: string, filledSet: Set<string>, extracted: ExtractedData, ctx: OutboundNormalizationContext, deps: OutboundNormalizeDeps
): string {
  const pending = deps.getNextPendingField(extracted, filledSet);
  const base = mensaje.trim();
  if (!pending) return base || "Entendido, sin problema. Nuestro equipo te propone opciones según lo que platicamos.";
  if (!base) return deps.buildNaturalQuestion(pending, ctx);
  if (deps.mensajeAsksForField(base, pending)) return collapseDuplicateFieldQuestions(base, pending);
  if (deps.clientAskedFreeformQuestion(ctx.currentMessage) && base.length > 50) {
    if (base.includes("?") && !deps.mensajeAsksWrongField(mensaje, filledSet, extracted)) return base;
    if (!deps.mensajeAsksForField(base, pending)) return base;
  }
  if (deps.isProgressiveOptionsMenuReply(base)) return base;
  if (
    pending === "requerimientos" &&
    deps.hasTipoEvento(filledSet, extracted) &&
    deps.aiLooksLikeEventServiceOffer(base)
  ) return base;
  const nextQ = deps.buildNaturalQuestion(pending, ctx);
  if (
    pending === "requerimientos" &&
    deps.hasTipoEvento(filledSet, extracted) &&
    deps.isDryRequerimientosAsk(nextQ)
  ) return base;
  const onlyServiceDetailCta =
    /quieres que te d[eé] detalles de alguno/i.test(base) &&
    !deps.mensajeAsksForField(base, pending);
  if (base.includes("?") && !deps.mensajeAsksWrongField(mensaje, filledSet, extracted) &&
      !onlyServiceDetailCta &&
      !deps.mensajeAsksForFilledField(mensaje, filledSet, extracted)) {
    return collapseDuplicateFieldQuestions(mensaje, pending);
  }
  return collapseDuplicateFieldQuestions(`${base}\n\n${nextQ}`, pending);
}

export function sanitizeOutboundMessage(
  mensaje: string,
  filledSet: Set<string>,
  extracted: ExtractedData,
  ctx: OutboundNormalizationContext,
  deps: OutboundNormalizeDeps,
  log?: { warn: (obj: unknown, msg?: string) => void }
): string {
  if (deps.isProgressiveOptionsMenuReply(mensaje)) {
    const body = mensaje.trim();
    if (!deps.isFieldSatisfied("nombre", filledSet, extracted) && !deps.mensajeAsksForField(body, "nombre")) {
      return `${body}\n\n${deps.pickVariant("nombre", ctx.history ?? [], ctx.entityId)}`.trim();
    }
    return body;
  }
  const pending = deps.getNextPendingField(extracted, filledSet);
  const isSalesishBody = !!ctx.currentMessage &&
    (deps.clientMentionsCatering(ctx.currentMessage) || deps.clientMentionsEntertainment(ctx.currentMessage) ||
      deps.clientMentionsPistaTarima(ctx.currentMessage) || deps.isServiceRelatedMessage(ctx.currentMessage)) &&
    /banquete|taquiza|catering|alimentos|show|animaci|hora\s+loca|entretenimiento|vers[aá]til|pista|tarima|iluminada|anoto/i.test(mensaje);
  const repeatsFilled = deps.mensajeAsksForFilledField(mensaje, filledSet, extracted);
  const asksWrong = deps.mensajeAsksWrongField(mensaje, filledSet, extracted);
  if (repeatsFilled || asksWrong) {
    log?.warn({ pending, repeatsFilled, asksWrong }, "GUARD: bloqueando repetición — dato ya capturado");
    if (isSalesishBody) {
      const body = mensaje.split(/\n+/).filter((line) =>
        !deps.mensajeAsksForFilledField(line, filledSet, extracted) &&
        !(line.includes("?") && deps.mensajeAsksWrongField(line, filledSet, extracted))).join("\n").trim();
      let kept = body;
      if (!kept && /banquete|taquiza|brunch|coffee\s*break|alimentos/i.test(mensaje)) {
        kept = mensaje.replace(/\s*¿\s*cu[aá]l\s+(te\s+interesa|prefieres|variante)[^?]*\?/gi, "")
          .replace(/\?\s*$/g, ".").trim();
      }
      return mergeWithPendingQuestion(kept || mensaje, filledSet, extracted, ctx, deps);
    }
    if (!deps.isInformativeClientAnswer(ctx.currentMessage)) {
      if (!pending) {
        const texts = deps.collectUserTexts(ctx.history ?? [], ctx.currentMessage);
        const presupuesto = deps.findPresupuestoInTexts(texts, ctx.history);
        if (presupuesto && /econ[oó]mic/i.test(presupuesto)) {
          return "Entendido, buscamos opciones económicas. Nuestro equipo te propone alternativas según lo que platicamos.";
        }
        return mensaje.split(/\n+/).filter((line) =>
          !deps.mensajeAsksForFilledField(line, filledSet, extracted)).join("\n").trim() ||
          "Entendido, sin problema. Nuestro equipo te propone opciones según lo que platicamos.";
      }
      return mergeWithPendingQuestion("", filledSet, extracted, ctx, deps);
    }
  }
  if (isSalesishBody) return mensaje.trim();
  if (pending && mensaje.includes("?") && !deps.mensajeMencionaCatalogoServicios(mensaje) &&
      !deps.historyAlreadyHadServicesCatalog(ctx.presentationHistory ?? ctx.history)) {
    mensaje = deps.appendServiciosCatalogoHint(mensaje, false, ctx.presentationHistory ?? ctx.history);
  }
  if (pending && !mensaje.includes("?") && !deps.clientAskedFreeformQuestion(ctx.currentMessage) &&
      !deps.isInformativeClientAnswer(ctx.currentMessage)) {
    return mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx, deps);
  }
  return mensaje;
}
