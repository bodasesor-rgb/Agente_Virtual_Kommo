import { Router, type IRouter, type Request, type Response } from "express";
import { getOpenAiApiKey, getOpenAiApiKeyForClient, isOpenAiConfigured } from "../lib/openaiEnv.js";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "../lucy-prompt.js";
import { getCatalogPromptBlock, injectCatalogPriceIfAsked, injectCatalogInclusionIfAsked, injectCatalogCateringIfAsked } from "../services/catalogService.js";
import { getTrainingExamples } from "../lib/training.js";
import { getHistory, appendHistory, clearHistory } from "../chat-history.js";
import {
  applyEmailWaiver,
  applyLucyMessageGuards,
  applyWhatsappNombreFallback,
  CLOSING_CORE_FIELDS,
  collectUserTexts,
  detectEmailRefusal,
  EMAIL_WAIVED_LABEL,
  isEmailSatisfied,
  isReadyForClosing,
  nextFieldQuestion,
  isValidRequerimientosValue,
  isLegacyStoredLucyResponse,
  parseNombreFromCrmLines,
} from "../lucy-flow-guards.js";
import { db, conversations, leadScores, messages } from "@workspace/db";
import { eq } from "drizzle-orm";
import { calculateLeadScore, detectStage } from "../services/leadScoring.js";
import { detectIntent, analyzeSentiment, detectObjection } from "../services/intentDetection.js";
import { buildDynamicPrompt } from "../services/promptBuilder.js";
import {
  buildRedactionBriefing,
  completeLucyRedaction,
  maybeRefinarMensajeCierre,
} from "../services/lucyRedaction.js";
import { processMessage, getVoiceAcknowledgment } from "../services/voiceProcessor.js";
import { generateSummary, enrichExtractedFromText, buildLeadBriefForKommo, extractLastMessageFromBrief } from "../services/summaryService.js";
import {
  isPlaceholderLeadName,
  sanitizeDisplayName,
} from "../contact-name.js";
import {
  applyCapturesToCrm,
  captureContextualAnswer,
  clientAsksForRecommendations,
  parsePresupuestoFromText,
  scanConversationForCaptures,
} from "../conversation-understanding.js";
import type { ExtractedData } from "../types.js";
import {
  sendWhatsAppDirect,
  fetchContactPhone,
  fetchContactDisplayName,
  registrarMensajeSalienteKommo,
} from "../services/whatsappDirectSender.js";
import {
  fetchLead,
  lucyDebeResponder,
  tieneInformacionCompleta,
  moverAHumanoTrabaja,
  recuperarDeNoContesta,
  programarSeguimiento,
  procesarSeguimientosPendientes,
  verificarLeadsInactivos,
  verificarVentanas24h,
  reactivarLucy,
  agregarTag,
  agregarNota,
  enviarMensaje,
  limpiarCampoRespuesta,
  ETAPA,
} from "../services/embudo.js";
import { captureInboundWhileLucyInactive, setLearningPhase } from "../services/chatIngest.js";
import { syncHumanPhaseLead } from "../services/learningSync.js";

const router: IRouter = Router();

const openai = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });

// ─── Kommo field IDs (hardcoded — no lookup needed) ──────────────────────────
const FIELD = {
  // respuesta_ia (1048772) eliminado de Kommo — no usar o el PATCH falla
  respuesta_ia_largo:     1048786, // Texto largo — resumen interno Lucy (solo lectura CRM)
  direccion_evento:       1048774,
  requerimientos_evento:  1048776,
  fecha_horario:          1048778,
  num_invitados:          1048780,
  tipo_evento:            1048782,
  presupuesto:            1048784,
} as const;

// ─── In-memory cache: última respuesta de Lucy por entityId ──────────────────
// El caché se actualiza justo después de appendHistory (antes del PATCH),
// por lo que siempre tiene el valor correcto.
// Se pierde al reiniciar el servidor, pero el bootstrap de Kommo Talks lo recupera.
const lastResponseCache = new Map<string, string>();

// ─── In-memory cache: número de teléfono WhatsApp por entityId ────────────────
// Se obtiene de Kommo Contacts la primera vez y se cachea para no hacer una
// llamada extra a la API de Kommo en cada mensaje del mismo lead.
const phoneCache = new Map<string, string>();
const displayNameCache = new Map<string, string>();

// ─── Debounce ─────────────────────────────────────────────────────────────────
const DEBOUNCE_MS = 5000;

interface PendingBatch {
  texts: string[];
  entityId: string | number;
  chatId: string;
  talkId: string | null;
  subdomain: string;
  isVoice: boolean;
  timer: ReturnType<typeof setTimeout>;
}

const pendingBatches = new Map<string, PendingBatch>();


// ─── Kommo types ──────────────────────────────────────────────────────────────
interface KommoMessageEntry {
  text?: string;
  entity_id?: number | string;
  chat_id?: string;
  talk_id?: string;
  attachments?: Array<{ type?: string; mime_type?: string; link?: string; url?: string }>;
}

interface KommoWebhookBody {
  account?: { subdomain?: string };
  message?: { add?: KommoMessageEntry[] };
}

interface KommoChatMessage {
  text?: string;
  author?: { type?: string };
}

interface KommoChatMessagesResponse {
  _embedded?: { messages?: KommoChatMessage[] };
}

// ExtractedData is imported from ../types.js

// ─── Fetch conversation history from Kommo Talks API ─────────────────────────
async function fetchKommoHistory(
  subdomain: string,
  accessToken: string,
  talkId: string
): Promise<OpenAI.Chat.ChatCompletionMessageParam[] | null> {
  try {
    // Try unread filter first; fall back to last 15 messages
    for (const url of [
      `https://${subdomain}.kommo.com/api/v4/talks/${talkId}/messages?filter[is_read]=0&limit=20&order=asc`,
      `https://${subdomain}.kommo.com/api/v4/talks/${talkId}/messages?limit=15&order=desc`,
    ]) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) continue;

      const data = (await res.json()) as KommoChatMessagesResponse;
      let msgs = data?._embedded?.messages ?? [];
      if (msgs.length === 0) continue;

      // Normalize to oldest-first
      if (url.includes("order=desc")) msgs = [...msgs].reverse();

      return msgs
        .filter((m) => m.text)
        .map((m) => ({
          role: m.author?.type === "external" ? "user" : "assistant",
          content: m.text!,
        }));
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Extract structured data from conversation via OpenAI ────────────────────
async function extractData(
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  latestUserText: string,
  crmAlreadyFilled: string = ""
): Promise<ExtractedData> {
  const empty: ExtractedData = {
    nombre: null, telefono: null, correo: null,
    presupuesto: null, direccion_evento: null,
    requerimientos_evento: null, fecha_horario: null,
    num_invitados: null, tipo_evento: null,
    tipo_contacto: null, empresa: null,
  };

  try {
    const crmHint = crmAlreadyFilled
      ? `\n\nDATOS YA GUARDADOS EN CRM (NO los vuelvas a asignar, ya están registrados):\n${crmAlreadyFilled}\n\nIMPORTANTE: Si el cliente responde con un número suelto (ej: "200"), determina a qué campo corresponde por contexto. Si "num_invitados" NO está en los datos ya guardados, ese número es probablemente el número de invitados. Si "presupuesto" NO está guardado y el número es muy alto (>5000) o el cliente mencionó presupuesto, es presupuesto.`
      : "";

    const extractionPrompt = `Eres un extractor de datos estructurados. Analiza la conversación y devuelve ÚNICAMENTE un objeto JSON. Para cada campo, escribe el valor mencionado explícitamente, o escribe null si no se mencionó. NUNCA escribas texto descriptivo como valor — solo datos reales o null.

Campos a extraer:
- tipo_contacto: "cliente" si busca contratar un servicio para su evento, "proveedor" si ofrece productos/servicios a Bodasesor, "incierto" si no está claro aún (string)
- nombre: nombre propio del contacto (string o null)
- empresa: nombre de la empresa si es proveedor (string o null)
- telefono: número de teléfono (string o null)
- correo: correo electrónico (string o null)
- presupuesto: cantidad en MXN si es cliente (número entero o null, NO string)
- direccion_evento: lugar o dirección del evento si es cliente (string o null)
- requerimientos_evento: para CLIENTE: servicios o requerimientos; para PROVEEDOR: descripción detallada de productos/servicios que ofrece (string o null)
- fecha_horario: fecha y/u horario del evento si es cliente (string o null)
- num_invitados: número de invitados si es cliente (número entero o null, NO string)
- tipo_evento: tipo de evento si es cliente: "boda", "XV años", "cumpleaños", "corporativo", etc. (string o null)

Señales de PROVEEDOR: "ofrezco", "ofrecemos", "vendo", "soy proveedor de", "me gustaría ser su proveedor", "distribuidor", "mi empresa ofrece", habla de flores, vajillas, sillas, mesas, iluminación, manteles, etc.
Señales de CLIENTE: busca banquete, cotización, tiene un evento, menciona fecha/invitados/presupuesto para su evento.

Ejemplo CLIENTE — "Me llamo Ana, quiero una boda para 100 personas":
{"tipo_contacto":"cliente","nombre":"Ana","empresa":null,"telefono":null,"correo":null,"presupuesto":null,"direccion_evento":null,"requerimientos_evento":null,"fecha_horario":null,"num_invitados":100,"tipo_evento":"boda"}

Ejemplo PROVEEDOR — "Hola, soy María de Flores del Valle, ofrecemos arreglos florales para eventos":
{"tipo_contacto":"proveedor","nombre":"María","empresa":"Flores del Valle","telefono":null,"correo":null,"presupuesto":null,"direccion_evento":null,"requerimientos_evento":"arreglos florales para eventos","fecha_horario":null,"num_invitados":null,"tipo_evento":null}

Reglas estrictas:
- SOLO extrae lo que el contacto dijo, nunca lo que Lucy preguntó.
- presupuesto y num_invitados son números, nunca strings.
- Si el contacto dio un rango de presupuesto, usa el promedio.
- Si un dato no está presente, el valor ES null (no el texto "null", sino el valor JSON null).${crmHint}`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: extractionPrompt },
      ...history,
      { role: "user", content: latestUserText },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<ExtractedData>;

    const tipoContacto = (["cliente", "proveedor", "incierto"].includes(parsed.tipo_contacto as string)
      ? parsed.tipo_contacto
      : null) as "cliente" | "proveedor" | "incierto" | null;

    return {
      nombre:                parsed.nombre ?? null,
      telefono:              parsed.telefono ?? null,
      correo:                parsed.correo ?? null,
      presupuesto:           typeof parsed.presupuesto === "number" ? parsed.presupuesto : null,
      direccion_evento:      parsed.direccion_evento ?? null,
      requerimientos_evento: parsed.requerimientos_evento ?? null,
      fecha_horario:         parsed.fecha_horario ?? null,
      num_invitados:         typeof parsed.num_invitados === "number" ? parsed.num_invitados : null,
      tipo_evento:           parsed.tipo_evento ?? null,
      tipo_contacto:         tipoContacto,
      empresa:               parsed.empresa ?? null,
    };
  } catch {
    return empty;
  }
}

// ─── Field name map (for human-readable CRM context) ─────────────────────────
const FIELD_NAME: Record<number, string> = {
  [FIELD.direccion_evento]:      "Lugar/dirección del evento",
  [FIELD.requerimientos_evento]: "Requerimientos o servicios",
  [FIELD.fecha_horario]:         "Fecha y horario",
  [FIELD.num_invitados]:         "Número de invitados",
  [FIELD.tipo_evento]:           "Tipo de evento",
  [FIELD.presupuesto]:           "Presupuesto (MXN)",
};

// ─── Required fields in order — flujo paso a paso ─────────────────────────────
// Nombre → Correo (opcional) → Tipo de evento → Requerimientos → Invitados → Zona → Fecha → Presupuesto
const REQUIRED_FIELDS_ORDERED: Array<{ label: string; question: string }> = [
  { label: "Nombre del cliente",         question: "¿Me regalas tu nombre para iniciar?" },
  { label: "Correo electrónico",         question: "¿A qué correo te lo envío?" },
  { label: "Tipo de evento",             question: "¿Qué festejan o qué tipo de evento sería?" },
  { label: "Requerimientos o servicios", question: "¿Qué tienes pensado para tu evento?" },
  { label: "Número de invitados",        question: "¿Cuántos invitados tienes contemplados para tu evento?" },
  { label: "Lugar/dirección del evento", question: "¿En qué ciudad sería tu evento, si tienes dirección exacta sería mejor?" },
  { label: "Fecha y horario",            question: "¿Ya tienen fecha definida o siguen sin fecha?" },
  { label: "Presupuesto (MXN)",          question: "¿Tienes algún presupuesto estimado para tu evento?" },
];

// Return type for lead field fetch
interface LeadFieldsResult {
  crmLines: string[];           // raw "- Label: value" lines from Kommo
  lastLucyResponse: string | null;
}

// ─── Strip catalog block from a response (used when cierre already sent) ────────
function stripCatalogBlock(text: string): string {
  const lines = text.split("\n");
  const filtered = lines.filter(
    (l) =>
      !l.includes(CATALOG_URL) &&
      !l.toLowerCase().includes("aquí está nuestro catálogo") &&
      !l.toLowerCase().includes("comparto el link") &&
      !l.toLowerCase().includes("mientras tanto, aquí") &&
      !l.toLowerCase().includes("banquetes:") &&
      !l.toLowerCase().includes("barras temáticas:") &&
      !l.toLowerCase().includes("bebidas:") &&
      !l.toLowerCase().includes("mesas especiales:") &&
      !l.toLowerCase().includes("mobiliario:") &&
      !l.toLowerCase().includes("entretenimiento:") &&
      !l.toLowerCase().includes("estructuras:") &&
      !l.toLowerCase().includes("cdn.shopify.com")
  );
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Return the next question for a field that is already captured (P1 guard) ──
// nextFieldQuestion lives in lucy-flow-guards.ts

// ─── Closing message template (sent to client when all 6 fields are collected) ─
const CLOSING_SIGNATURE = "Perfecto, ya tengo todo.";

const CATALOG_URL =
  "https://cdn.shopify.com/s/files/1/0809/1215/4936/files/Catalogo-Menus-Bodasesor-2026_4_b5efa97c-ce47-4bef-b189-aca2d91fefa7.pdf?v=1778695499";

function buildClosingMessage(serviciosPedidos: string | null | undefined): string {
  const servicio = serviciosPedidos?.trim() || null;
  const introServicios = servicio
    ? `Por cierto, además de ${servicio}, también manejamos bebidas, DJ, iluminación, carpas, mobiliario, pantallas, mesas de dulces, barras de alimentos y más.`
    : `Por cierto, también manejamos bebidas, DJ, iluminación, carpas, mobiliario, pantallas, mesas de dulces, barras de alimentos y más.`;
  return (
    `Perfecto, ya tengo todo. Le paso estos datos a Alejandro para que te arme una cotización personalizada.\n\n` +
    `Mientras tanto, aquí está nuestro catálogo completo:\n${CATALOG_URL}\n\n` +
    introServicios + `\n\n` +
    `¿Te gustaría cotizar algo adicional? Si te falta algo o tienes alguna duda, no dudes en decírnoslo y nosotros te lo conseguimos.`
  );
}

function buildLucyRedactionBriefing(opts: {
  extracted: ExtractedData;
  filledSet: Set<string>;
  crmMergedLines: string[];
  messageText: string;
  conversationText: string;
  messageCount?: number;
  conversationAgeHours?: number;
  allFieldsFilled: boolean;
  isFirstInteraction: boolean;
}): string {
  const intentResult = detectIntent(opts.messageText);
  const sentimentResult = analyzeSentiment(opts.messageText);
  const objectionResult = detectObjection(opts.messageText);
  const scoreContext = {
    extracted: opts.extracted,
    messageCount: opts.messageCount ?? 1,
    hasResponded: true,
    conversationAge: opts.conversationAgeHours ?? 0,
    lastIntent: intentResult.intent,
    conversationText: opts.conversationText,
  };
  const leadScore = calculateLeadScore(scoreContext);
  const stage = detectStage(scoreContext);

  return buildRedactionBriefing({
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    crmMergedLines: opts.crmMergedLines,
    intent: intentResult,
    sentiment: sentimentResult,
    stage,
    priority: leadScore.priority,
    allFieldsFilled: opts.allFieldsFilled,
    isFirstInteraction: opts.isFirstInteraction,
    hasObjection: objectionResult.hasObjection,
    objectionType: objectionResult.type,
  });
}

async function applyCierreRefinement(
  mensaje: string,
  opts: { readyForClosing: boolean; cierreYaEnviado: boolean }
): Promise<string> {
  return maybeRefinarMensajeCierre(openai, mensaje, {
    readyForClosing: opts.readyForClosing,
    cierreYaEnviado: opts.cierreYaEnviado,
    closingSignature: CLOSING_SIGNATURE,
    catalogUrl: CATALOG_URL,
  });
}

// ─── Internal Kommo note when lead is fully qualified ─────────────────────────
function buildLeadCalificadoNota(
  extracted: ExtractedData,
  mergedLines: string[]
): string {
  // Helper: get value from mergedLines when extracted is null
  const fromLines = (labelPattern: RegExp): string | null => {
    const line = mergedLines.find((l) => labelPattern.test(l));
    if (!line) return null;
    return line.replace(/^- /, "").split(":").slice(1).join(":").trim() || null;
  };
  const nombre    = extracted.nombre           ?? fromLines(/Nombre del cliente/i);
  const correo    = extracted.correo           ?? fromLines(/Correo electrónico/i);
  const evento    = extracted.tipo_evento      ?? fromLines(/Tipo de evento/i);
  const fecha     = extracted.fecha_horario    ?? fromLines(/Fecha y horario/i);
  const invitados = extracted.num_invitados    ?? fromLines(/Número de invitados/i);
  const ubicacion = extracted.direccion_evento ?? fromLines(/Lugar\/dirección/i);
  const ppto      = extracted.presupuesto      ?? fromLines(/Presupuesto/i);
  const reqs      = extracted.requerimientos_evento ?? fromLines(/Requerimientos/i);

  return [
    "🤖 Lucy: Información completa obtenida y verificada.",
    "",
    "📋 DATOS DEL CLIENTE:",
    nombre    ? `- Nombre: ${nombre}`        : null,
    correo    ? `- Correo: ${correo}`        : null,
    evento    ? `- Evento: ${evento}`        : null,
    fecha     ? `- Fecha: ${fecha}`          : null,
    invitados ? `- Invitados: ${invitados}`  : null,
    ubicacion ? `- Ubicación: ${ubicacion}`  : null,
    ppto      ? `- Presupuesto: $${ppto}`    : null,
    reqs      ? `- Requerimientos: ${reqs}`  : null,
    "",
    "✅ Lead calificado - Listo para cotizar",
  ].filter((l) => l !== null).join("\n");
}

async function resolveWhatsappDisplayName(
  subdomain: string,
  accessToken: string,
  entityId: string | number,
  leadNameFromCrm?: string | null
): Promise<string | null> {
  const entityKey = String(entityId);
  const cached = displayNameCache.get(entityKey);
  if (cached) return cached;

  const fromCrm = sanitizeDisplayName(leadNameFromCrm);
  if (fromCrm) {
    displayNameCache.set(entityKey, fromCrm);
    return fromCrm;
  }

  const fromContact = sanitizeDisplayName(
    await fetchContactDisplayName(subdomain, accessToken, entityId)
  );
  if (fromContact) {
    displayNameCache.set(entityKey, fromContact);
    return fromContact;
  }
  return null;
}

// ─── Build CRM context block from Kommo lines + current extraction + history ──
// Called AFTER extractData so it reflects what the client just provided.
// currentMessage: el texto que el cliente acaba de enviar (para detección en tiempo real)
function purgeRequerimientosIfAskingRecommendations(
  mergedLines: string[],
  filledSet: Set<string>,
  extracted: ExtractedData,
  currentMessage?: string
): void {
  if (!currentMessage?.trim() || !clientAsksForRecommendations(currentMessage)) return;
  const idx = mergedLines.findIndex((l) => /^-?\s*Requerimientos o servicios:/i.test(l));
  if (idx >= 0) mergedLines.splice(idx, 1);
  filledSet.delete("Requerimientos o servicios");
  extracted.requerimientos_evento = null;
}

function buildCrmContext(
  crmLines: string[],
  extracted: ExtractedData,
  history: OpenAI.Chat.ChatCompletionMessageParam[],
  clientEmailFromDB?: string | null,
  currentMessage?: string,
  whatsappDisplayName?: string | null,
  fullHistory?: OpenAI.Chat.ChatCompletionMessageParam[]
): { context: string; allFieldsFilled: boolean; mergedLines: string[]; filledLabels: Set<string> } {
  const mergedLines = [...crmLines];
  const filledSet = new Set(mergedLines.map((l) => l.replace(/^- /, "").split(":")[0]?.trim() ?? ""));
  const historyFull = fullHistory ?? history;

  if (extracted.presupuesto !== null && extracted.presupuesto !== undefined) {
    const validPres = collectUserTexts(historyFull, currentMessage)
      .map((t) => parsePresupuestoFromText(t))
      .find(Boolean);
    if (!validPres) extracted.presupuesto = null;
  }

  // Nombre: solo extracción explícita o CRM — no prellenar desde WhatsApp
  if (!filledSet.has("Nombre del cliente")) {
    const nombreVal = sanitizeDisplayName(extracted.nombre);
    if (nombreVal) {
      mergedLines.push(`- Nombre del cliente: ${nombreVal}`);
      filledSet.add("Nombre del cliente");
    }
  }

  // Correo: not a Kommo custom lead field — detect from extraction, DB, or history
  if (!filledSet.has("Correo electrónico") && !filledSet.has(EMAIL_WAIVED_LABEL)) {
    const correoVal =
      extracted.correo ??
      clientEmailFromDB ??
      (history
        .filter((m) => m.role === "user" && typeof m.content === "string")
        .map((m) => m.content as string)
        .find((t) => /\S+@\S+\.\S+/.test(t)) ?? null);
    if (correoVal) {
      mergedLines.push(`- Correo electrónico: ${correoVal}`);
      filledSet.add("Correo electrónico");
    }
  }

  // Merge any other fields newly extracted from the current message
  const extractionMap: Array<{ label: string; value: string | number | null | undefined }> = [
    { label: "Lugar/dirección del evento", value: extracted.direccion_evento },
    { label: "Requerimientos o servicios", value: extracted.requerimientos_evento },
    { label: "Fecha y horario",            value: extracted.fecha_horario },
    { label: "Número de invitados",        value: extracted.num_invitados },
    { label: "Tipo de evento",             value: extracted.tipo_evento },
    { label: "Presupuesto (MXN)",          value: extracted.presupuesto },
  ];
  for (const { label, value } of extractionMap) {
    if (!filledSet.has(label)) {
      if (label === "Presupuesto (MXN)" && value === 0) {
        const fromMsg = currentMessage ? parsePresupuestoFromText(currentMessage) : null;
        if (fromMsg) {
          mergedLines.push(`- Presupuesto (MXN): ${fromMsg}`);
          filledSet.add(label);
        }
      } else if (label === "Requerimientos o servicios") {
        if (
          !clientAsksForRecommendations(currentMessage) &&
          isValidRequerimientosValue(typeof value === "string" ? value : null)
        ) {
          mergedLines.push(`- ${label}: ${value}`);
          filledSet.add(label);
        }
      } else if (label === "Presupuesto (MXN)") {
        const fromMsg = currentMessage ? parsePresupuestoFromText(currentMessage) : null;
        if (fromMsg) {
          mergedLines.push(`- ${label}: ${fromMsg}`);
          filledSet.add(label);
        }
      } else if (value !== null && value !== undefined && value !== 0) {
        mergedLines.push(`- ${label}: ${value}`);
        filledSet.add(label);
      }
    }
  }

  // ── Comprensión conversacional: escaneo + captura contextual ───────────────
  applyCapturesToCrm(
    mergedLines,
    filledSet,
    scanConversationForCaptures(historyFull, currentMessage, filledSet)
  );

  if (currentMessage?.trim()) {
    applyCapturesToCrm(
      mergedLines,
      filledSet,
      captureContextualAnswer(history, currentMessage, filledSet)
    );
  }

  // Nombre de WhatsApp: solo si Lucy ya preguntó y el cliente nunca lo escribió
  applyWhatsappNombreFallback(filledSet, mergedLines, whatsappDisplayName, history);

  applyEmailWaiver(
    filledSet,
    mergedLines,
    collectUserTexts(historyFull, currentMessage)
  );

  purgeRequerimientosIfAskingRecommendations(mergedLines, filledSet, extracted, currentMessage);

  const allFieldsFilled = isReadyForClosing(filledSet);

  let context = "";
  if (mergedLines.length > 0) {
    const filledList = mergedLines.map((l) => `✓ ${l.replace(/^- /, "")}`).join("\n");
    context = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nDATOS YA CAPTURADOS — NO VOLVER A PEDIR\n━━━━━━━━━━━━━━━━━━━━━━━━\n${filledList}`;
  }
  if (allFieldsFilled && mergedLines.length > 0) {
    context += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nYA TIENES LOS DATOS CLAVE — aplica PASO 7 del prompt (cierre).\n━━━━━━━━━━━━━━━━━━━━━━━━`;
  } else if (mergedLines.length > 0) {
    const missing = [
      ...CLOSING_CORE_FIELDS.filter((f) => !filledSet.has(f)),
      ...(!isEmailSatisfied(filledSet) ? ["Correo electrónico (opcional — intentar, no bloquear)"] : []),
    ];
    if (missing.length) {
      context += `\n\nDATO(S) QUE FALTAN: ${missing.join(", ")} — pregunta SOLO el primero que falta. NUNCA repitas un dato de la lista ✓ de arriba.`;
    }
  }
  return { context, allFieldsFilled, mergedLines, filledLabels: filledSet };
}

interface KommoLeadFieldsResponse {
  name?: string;
  custom_fields_values?: Array<{
    field_id: number;
    values: Array<{ value: unknown }>;
  }>;
}

// ─── Fetch current lead field values from Kommo ───────────────────────────────
async function fetchLeadCurrentFields(
  subdomain: string,
  accessToken: string,
  leadId: string | number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log: any
): Promise<LeadFieldsResult> {
  const empty: LeadFieldsResult = { crmLines: [], lastLucyResponse: null };
  try {
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/leads/${leadId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      log.warn({ status: res.status, leadId }, "No se pudo leer campos actuales del lead");
      return empty;
    }

    const data = (await res.json()) as KommoLeadFieldsResponse;
    const cfv = data.custom_fields_values ?? [];

    const lines: string[] = [];
    let lastLucyResponse: string | null = null;

    // Lead name (contact name hint) — skip generic CRM placeholders and phone numbers
    if (data.name) {
      const stripped = data.name.replace(/^Lead:\s*/i, "").trim();
      if (!isPlaceholderLeadName(stripped)) {
        lines.push(`- Nombre del cliente: ${stripped}`);
      }
    }

    for (const field of cfv) {
      // 1048786 = resumen interno; extraer último mensaje solo para recovery de historial
      if (field.field_id === FIELD.respuesta_ia_largo) {
        const val = field.values[0]?.value;
        if (val && typeof val === "string" && val.trim()) {
          const fromBrief = extractLastMessageFromBrief(val.trim());
          if (fromBrief) {
            lastLucyResponse = fromBrief;
          } else if (!val.includes("📋 RESUMEN LUCY") && !isLegacyStoredLucyResponse(val)) {
            // Formato legacy: el campo guardaba el mensaje directo al cliente
            lastLucyResponse = val.trim();
          }
        }
        continue;
      }

      const label = FIELD_NAME[field.field_id];
      if (!label) continue;
      const val = field.values[0]?.value;
      if (val === null || val === undefined || val === "") continue;

      lines.push(`- ${label}: ${val}`);
    }

    return { crmLines: lines, lastLucyResponse };
  } catch (err) {
    log.warn({ err }, "Error leyendo campos actuales del lead");
    return empty;
  }
}

// ─── Fetch primary contact ID linked to a lead ───────────────────────────────
interface KommoLeadResponse {
  _embedded?: { contacts?: Array<{ id: number; is_main?: boolean }> };
}

async function fetchLeadContactId(
  subdomain: string,
  accessToken: string,
  leadId: string | number
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/leads/${leadId}?with=contacts`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as KommoLeadResponse;
    const contacts = data?._embedded?.contacts ?? [];
    const main = contacts.find((c) => c.is_main) ?? contacts[0];
    return main?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Update Kommo contact (name, phone, email) ────────────────────────────────
async function updateKommoContact(
  subdomain: string,
  accessToken: string,
  contactId: number,
  extracted: ExtractedData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log: any
): Promise<void> {
  const hasContact = extracted.nombre || extracted.telefono || extracted.correo;
  if (!hasContact) return;

  const contactPayload: Record<string, unknown> = {};

  if (extracted.nombre) {
    contactPayload["name"] = extracted.nombre;
  }

  const cfv: Array<{ field_code: string; values: Array<{ value: string; enum_code: string }> }> = [];

  if (extracted.telefono) {
    cfv.push({ field_code: "PHONE", values: [{ value: extracted.telefono, enum_code: "WORK" }] });
  }
  if (extracted.correo) {
    cfv.push({ field_code: "EMAIL", values: [{ value: extracted.correo, enum_code: "WORK" }] });
  }
  if (cfv.length > 0) {
    contactPayload["custom_fields_values"] = cfv;
  }

  const res = await fetch(
    `https://${subdomain}.kommo.com/api/v4/contacts/${contactId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(contactPayload),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    log.error({ status: res.status, errText, contactId }, "Error actualizando contacto");
  } else {
    log.info({ contactId, fields: Object.keys(contactPayload) }, "Contacto actualizado");
  }
}

// ─── Build Kommo PATCH payload ────────────────────────────────────────────────
// Kommo short-text fields are capped at 255 characters
const KOMMO_SHORT_TEXT_LIMIT = 255;
const cap255 = (s: string): string =>
  s.length <= KOMMO_SHORT_TEXT_LIMIT ? s : s.slice(0, KOMMO_SHORT_TEXT_LIMIT - 1) + "…";

// Guard: reject obvious placeholder / description strings that GPT returns instead of null
const PLACEHOLDER_PATTERNS = [
  /nombre completo/i,
  /del cliente/i,
  /o null/i,
  /string o null/i,
  /número de/i,
  /correo electrónico/i,
];
function isValidExtractedString(val: string | null | undefined): val is string {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (trimmed.length === 0) return false;
  return !PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed));
}

function withCrmNombre(extracted: ExtractedData, mergedLines: string[]): ExtractedData {
  const nombreCrm = parseNombreFromCrmLines(mergedLines);
  if (!nombreCrm || isValidExtractedString(extracted.nombre)) return extracted;
  return { ...extracted, nombre: nombreCrm };
}

function buildPatchPayload(
  _aiResponse: string,
  extracted: ExtractedData,
  conversationText?: string,
  opts?: {
    mergedLines?: string[];
    lastLucyMessage?: string | null;
    leadCalificado?: boolean;
  }
): Record<string, unknown> {
  // respuesta_ia (1048772) eliminado de Kommo — NO incluir o el PATCH falla con 400.
  // respuesta_ia_largo (1048786): resumen interno para Alejandro (NO envío al cliente).
  const customFields: Array<{ field_id: number; values: Array<{ value: unknown }> }> = [];

  const brief = buildLeadBriefForKommo(extracted, conversationText, {
    mergedLines: opts?.mergedLines,
    lastLucyMessage: opts?.lastLucyMessage,
    leadCalificado: opts?.leadCalificado,
  });
  if (brief.trim()) {
    customFields.push({ field_id: FIELD.respuesta_ia_largo, values: [{ value: brief }] });
  }

  // Only push fields that have a real, non-placeholder, non-empty value
  if (isValidExtractedString(extracted.direccion_evento))
    customFields.push({ field_id: FIELD.direccion_evento, values: [{ value: cap255(extracted.direccion_evento) }] });
  const reqForCrm = conversationText ? generateSummary(conversationText) : extracted.requerimientos_evento;
  if (isValidExtractedString(reqForCrm) && reqForCrm !== "Info pendiente")
    customFields.push({ field_id: FIELD.requerimientos_evento, values: [{ value: cap255(reqForCrm) }] });
  if (isValidExtractedString(extracted.fecha_horario))
    customFields.push({ field_id: FIELD.fecha_horario, values: [{ value: cap255(extracted.fecha_horario) }] });
  if (extracted.num_invitados !== null && extracted.num_invitados > 0)
    customFields.push({ field_id: FIELD.num_invitados, values: [{ value: String(extracted.num_invitados) }] });
  if (isValidExtractedString(extracted.tipo_evento))
    customFields.push({ field_id: FIELD.tipo_evento, values: [{ value: cap255(extracted.tipo_evento) }] });
  if (extracted.presupuesto !== null && extracted.presupuesto > 0)
    customFields.push({ field_id: FIELD.presupuesto, values: [{ value: String(extracted.presupuesto) }] });

  const payload: Record<string, unknown> = { custom_fields_values: customFields };

  if (isValidExtractedString(extracted.nombre)) {
    const nombrePatch = sanitizeDisplayName(extracted.nombre) ?? extracted.nombre;
    payload["name"] = cap255(nombrePatch);
  }

  return payload;
}

// ─── Welcome email: fire once when all 5 key fields are present ───────────────
// In-memory dedup guard (fast path — avoids Kommo API call on repeat messages)
const emailSentLeads = new Set<string>();

interface KommoLeadTagsResponse {
  _embedded?: { tags?: Array<{ name: string }> };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function maybeFireWelcomeEmail(opts: { subdomain: string; accessToken: string; entityId: string | number; log: any }): Promise<void> {
  const { subdomain, accessToken, entityId, log } = opts;
  const leadKey = String(entityId);

  // Fast dedup: already sent in this server process
  if (emailSentLeads.has(leadKey)) return;

  try {
    // Fetch full lead (fields + embedded contacts for email) with tags
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/leads/${leadKey}?with=contacts,tags`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return;

    const data = (await res.json()) as KommoLeadTagsResponse & KommoLeadFieldsResponse & KommoLeadResponse;

    // Persistent dedup: tag already set by a previous server instance
    const tags = data._embedded?.tags ?? [];
    if (tags.some((t) => t.name === "lucy-email-sent")) {
      emailSentLeads.add(leadKey); // sync in-memory cache
      return;
    }

    // Gather field values
    const cfv = data.custom_fields_values ?? [];
    const getField = (id: number): string | null => {
      const f = cfv.find((x) => x.field_id === id);
      const v = f?.values[0]?.value;
      return v && typeof v === "string" && v.trim() ? v.trim() : null;
    };

    const tipo_evento   = getField(FIELD.tipo_evento);
    const fecha_horario = getField(FIELD.fecha_horario);
    const num_invitados_raw = cfv.find((x) => x.field_id === FIELD.num_invitados)?.values[0]?.value;
    const num_invitados = num_invitados_raw !== undefined && num_invitados_raw !== null
      ? Number(num_invitados_raw)
      : null;

    // Gather contact name + email
    const contacts = data._embedded?.contacts ?? [];
    const mainContactId = (contacts.find((c) => c.is_main) ?? contacts[0])?.id ?? null;

    if (!tipo_evento || !fecha_horario || !num_invitados) {
      log.info({ tipo_evento, fecha_horario, num_invitados }, "Welcome email: faltan campos clave, omitiendo");
      return;
    }

    // Need contact details (name + email)
    let nombre: string | null = null;
    let correo: string | null = null;

    if (mainContactId) {
      const cRes = await fetch(
        `https://${subdomain}.kommo.com/api/v4/contacts/${mainContactId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (cRes.ok) {
        const cData = (await cRes.json()) as {
          name?: string;
          custom_fields_values?: Array<{ field_code?: string; values: Array<{ value: unknown }> }>;
        };
        nombre = cData.name ?? null;
        const emailField = cData.custom_fields_values?.find((f) => f.field_code === "EMAIL");
        const emailVal = emailField?.values[0]?.value;
        correo = emailVal && typeof emailVal === "string" ? emailVal.trim() : null;
      }
    }

    // Also check lead name as fallback
    if (!nombre && data.name && data.name !== "Nuevo lead") {
      nombre = data.name.replace(/^Lead:\s*/i, "").trim() || null;
    }

    if (!nombre || !correo) {
      log.info({ nombre: !!nombre, correo: !!correo }, "Welcome email: falta nombre o correo, omitiendo");
      return;
    }

    log.info({ nombre, correo, tipo_evento, fecha_horario, num_invitados }, "Sending welcome email");

    await sendWelcomeEmail({ nombre, correo, tipo_evento, fecha_horario, num_invitados });

    // Mark as sent in Kommo via tag so it persists across server restarts
    emailSentLeads.add(leadKey);
    const tagRes = await fetch(
      `https://${subdomain}.kommo.com/api/v4/leads/${leadKey}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ _embedded: { tags: [...tags.map((t) => ({ name: t.name })), { name: "lucy-email-sent" }] } }),
      }
    );
    if (!tagRes.ok) {
      log.warn({ status: tagRes.status }, "No se pudo marcar tag lucy-email-sent en lead");
    }

  } catch (err) {
    log.error({ err }, "Error en maybeFireWelcomeEmail");
  }
}

// ─── Safe date parser (returns null for non-parseable strings) ───────────────
function safeParseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Core processing after debounce ──────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processBatch(batch: PendingBatch, accessToken: string, log: any): Promise<void> {
  const { texts, entityId, chatId, talkId, subdomain } = batch;
  const combinedUserText = texts.join("\n");

  log.info({ messageCount: texts.length, combinedUserText, chatId }, "Processing debounced batch");

  try {
    // ══════════════════════════════════════════════════════════════════════
    // PASO 0: Verificar si Lucy debe responder (embudo + tag)
    // ══════════════════════════════════════════════════════════════════════
    const leadKommo = await fetchLead(subdomain, accessToken, entityId);

    if (leadKommo) {
      // FIX: Si está en No Contesta y responde → recuperar ANTES del check de tag
      // (moverAHumanoTrabaja agrega lucy_desactivada; sin recuperar primero, el lead
      //  quedaría bloqueado indefinidamente aunque responda)
      if (leadKommo.status_id === ETAPA.NO_CONTESTA) {
        log.info({ entityId }, "Embudo: lead en No Contesta respondió — recuperando");
        await recuperarDeNoContesta(subdomain, accessToken, entityId, {
          correo: null,
          fecha_evento: leadKommo.fecha_evento,
          num_invitados: leadKommo.num_invitados,
          tipo_evento: leadKommo.tipo_evento,
          direccion: leadKommo.direccion,
        }, leadKommo.tags);
        // Continuar — Lucy responde después de recuperar
      } else {
        // Para otras etapas, verificar si Lucy debe responder
        const debeResponder = lucyDebeResponder(leadKommo.status_id, leadKommo.tags);
        if (!debeResponder) {
          log.info(
            { entityId, statusId: leadKommo.status_id, tags: leadKommo.tags },
            "Embudo: Lucy desactivada — capturando mensaje para aprendizaje"
          );
          void captureInboundWhileLucyInactive({
            kommoLeadId: String(entityId),
            chatId,
            talkId,
            text: combinedUserText,
            subdomain,
            accessToken,
          }).catch((err: unknown) =>
            log.warn({ err, entityId }, "Captura en fase humana falló")
          );
          return;
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PASO 1: Cargar o crear conversación en BD
    // ══════════════════════════════════════════════════════════════════════
    let conversation = await db.query.conversations.findFirst({
      where: eq(conversations.kommoLeadId, String(entityId)),
    });

    if (!conversation) {
      const [newConv] = await db.insert(conversations).values({
        kommoLeadId: String(entityId),
        kommoChatId: chatId,
        kommoTalkId: talkId || undefined,
        status: "active",
        stage: "discovery",
        messageCount: 0,
      }).returning();
      conversation = newConv!;
      log.info({ entityId }, "Nueva conversación creada en BD");
    }

    // ══════════════════════════════════════════════════════════════════════
    // PASO 2: Analizar intención y sentimiento
    // ══════════════════════════════════════════════════════════════════════
    const intentResult = detectIntent(combinedUserText);
    const sentimentResult = analyzeSentiment(combinedUserText);
    const objectionResult = detectObjection(combinedUserText);

    log.info({
      intent: intentResult.intent,
      sentiment: sentimentResult.sentiment,
      hasObjection: objectionResult.hasObjection,
    }, "Analysis complete");

    // ══════════════════════════════════════════════════════════════════════
    // PASO 3: Historial (file-based + Kommo bootstrap)
    // ══════════════════════════════════════════════════════════════════════
    // IMPORTANTE: usar entityId (no chatId) como clave del historial.
    // Kommo crea un nuevo chatId cada vez que expira la ventana de 24h de WhatsApp
    // o cuando el cliente escribe desde otro dispositivo. Usar chatId como clave
    // hace que Lucy pierda TODA la conversación anterior.
    const histKey = String(entityId);
    let fullHistory: OpenAI.Chat.ChatCompletionMessageParam[] = getHistory(histKey);
    let historySource = "file";

    if (talkId && fullHistory.length === 0) {
      const kommoHistory = await fetchKommoHistory(subdomain, accessToken, talkId);
      if (kommoHistory && kommoHistory.length > 0) {
        const toExclude = new Set(texts.map((t) => t.trim()));
        fullHistory = kommoHistory.filter(
          (m) => !(m.role === "user" && typeof m.content === "string" && toExclude.has(m.content.trim()))
        );
        historySource = "kommo-bootstrap";
      }
    }

    let history = fullHistory.slice(-6);

    // ══════════════════════════════════════════════════════════════════════
    // PASO 4: Leer campos del CRM (sin construir crmContext aún)
    // ══════════════════════════════════════════════════════════════════════
    const { crmLines, lastLucyResponse } = await fetchLeadCurrentFields(subdomain, accessToken, entityId, log);

    const hasAssistantMsg = history.some((m) => m.role === "assistant");

    // Preferir caché en memoria sobre campo 1048786 de Kommo:
    // el caché se escribe antes del PATCH, así que nunca tiene el race condition
    // donde el PATCH aún no llegó a Kommo cuando entra el siguiente mensaje.
    const cachedResponse = lastResponseCache.get(String(entityId));
    const effectiveLastResponse = cachedResponse ?? lastLucyResponse;
    const normalizedLastResponse = isLegacyStoredLucyResponse(effectiveLastResponse)
      ? null
      : effectiveLastResponse;

    // True solo cuando Lucy NUNCA ha respondido a este lead.
    // Condiciones: sin mensajes de asistente en historial, sin respuesta previa en CRM/caché,
    // Y sin "Nombre del cliente" en los campos de Kommo (si ya hay nombre = ya hubo conversación).
    const isFirstInteraction = !hasAssistantMsg && !normalizedLastResponse;

    if (!hasAssistantMsg && normalizedLastResponse) {
      history = [...history, { role: "assistant", content: normalizedLastResponse }];
      const recoverySource = cachedResponse ? "cache-recovery" : "crm-recovery";
      historySource = historySource === "file" ? recoverySource : `${historySource}+${recoverySource}`;
    }

    log.info({ historyLength: history.length, historySource, crmLinesCount: crmLines.length }, "Context loaded");

    // ══════════════════════════════════════════════════════════════════════
    // PASO 5: Extracción de datos
    // ══════════════════════════════════════════════════════════════════════
    const filledFieldNames = crmLines
      .map((l) => l.replace(/^- /, "").split(":")[0]?.trim() ?? "")
      .filter(Boolean)
      .join(", ");

    const extracted = await extractData(history, combinedUserText, filledFieldNames);

    const conversationText = [
      ...history
        .filter((m) => m.role === "user")
        .map((m) => (typeof m.content === "string" ? m.content : "")),
      combinedUserText,
    ].join(" ");

    if (extracted.tipo_contacto === "proveedor") {
      const empresa = extracted.empresa ?? "";
      const desc = extracted.requerimientos_evento ?? "";
      if (empresa || desc) {
        const resumenProv = `PROVEEDOR: ${empresa ? empresa + " - " : ""}Ofrece: ${desc}`.slice(0, 240);
        extracted.requerimientos_evento = resumenProv;
        log.info({ resumenProv }, "Resumen proveedor generado");
      }
    } else {
      enrichExtractedFromText(extracted, conversationText);
    }

    const leadNameFromCrm = crmLines
      .find((l) => /Nombre del cliente:/i.test(l))
      ?.replace(/^-?\s*Nombre del cliente:\s*/i, "")
      .trim();
    const whatsappDisplayName = await resolveWhatsappDisplayName(
      subdomain,
      accessToken,
      entityId,
      leadNameFromCrm ?? conversation.clientName
    );

    const { context: crmContext, allFieldsFilled, mergedLines: crmMergedLines, filledLabels } =
      buildCrmContext(
        crmLines,
        extracted,
        history,
        conversation.clientEmail,
        combinedUserText,
        whatsappDisplayName,
        fullHistory
      );

    const scoreContext = {
      extracted,
      messageCount: conversation.messageCount + 1,
      hasResponded: true,
      conversationAge: (Date.now() - new Date(conversation.createdAt).getTime()) / (1000 * 60 * 60),
      lastIntent: intentResult.intent,
      conversationText,
    };

    const leadScore = calculateLeadScore(scoreContext);
    const stage = detectStage(scoreContext);

    log.info({ score: leadScore.total, priority: leadScore.priority, stage }, "Lead scoring complete");

    // ══════════════════════════════════════════════════════════════════════
    // PASO 7: Prompt dinámico según etapa
    // ══════════════════════════════════════════════════════════════════════
    const catalogBlock = await getCatalogPromptBlock();
    const dynamicPrompt = buildDynamicPrompt({
      stage,
      priority: leadScore.priority,
      extracted,
      hasObjection: objectionResult.hasObjection ? objectionResult : undefined,
      crmContext,
      isFirstInteraction,
      hasClientName: filledLabels.has("Nombre del cliente"),
      catalogBlock,
    });

    // ══════════════════════════════════════════════════════════════════════
    // PASO 8: Llamada a OpenAI con prompt dinámico
    // ══════════════════════════════════════════════════════════════════════
    const trainingExamples = await getTrainingExamples();
    const fewShot: OpenAI.Chat.ChatCompletionMessageParam[] = trainingExamples.flatMap((ex) => [
      { role: "user" as const, content: ex.userMessage },
      { role: "assistant" as const, content: ex.lucyResponse },
    ]);

    const lucyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: dynamicPrompt },
      ...fewShot,
      ...history,
      { role: "user", content: combinedUserText },
    ];

    const redactionBriefing = buildRedactionBriefing({
      extracted,
      filledSet: filledLabels,
      crmMergedLines,
      intent: intentResult,
      sentiment: sentimentResult,
      stage,
      priority: leadScore.priority,
      allFieldsFilled,
      isFirstInteraction,
      hasObjection: objectionResult.hasObjection,
      objectionType: objectionResult.type,
    });

    let aiResponse = await completeLucyRedaction(openai, lucyMessages, redactionBriefing);
    aiResponse = injectCatalogInclusionIfAsked(combinedUserText, aiResponse);
    aiResponse = injectCatalogCateringIfAsked(combinedUserText, aiResponse);
    aiResponse = injectCatalogPriceIfAsked(combinedUserText, aiResponse);
    // ══════════════════════════════════════════════════════════════════════
    if (batch.isVoice) {
      const clientName =
        sanitizeDisplayName(extracted.nombre) ??
        whatsappDisplayName ??
        sanitizeDisplayName(conversation.clientName) ??
        undefined;
      const voiceAck = getVoiceAcknowledgment(clientName ?? undefined);
      aiResponse = voiceAck + aiResponse;
      log.info({ voiceAck }, "Voice acknowledgment prepended");
    }

    log.info({ aiResponse, extracted }, "OpenAI response received");

    // ══════════════════════════════════════════════════════════════════════
    // PASO 8.7: Enviar respuesta directamente a WhatsApp via API de Kommo
    // Si Lucy generó el bloque DATOS DEL CLIENTE (nota interna), extraer
    // solo la parte del mensaje al cliente (después de "Lead calificado").
    // ══════════════════════════════════════════════════════════════════════
    // PASO 8.7: Si ya tenemos los 6 datos → mensaje de cierre exacto desde
    // plantilla de código (no depender de GPT para este texto crítico).
    //
    // GUARD: solo enviar cierre la PRIMERA VEZ. Se detecta buscando en el
    // historial de chat si Lucy ya envió el texto de cierre antes.
    // El lead NO se mueve de etapa — Alejandro lo hace manualmente.
    // ══════════════════════════════════════════════════════════════════════
    const cierreYaEnviado = history.some(
      (m) =>
        m.role === "assistant" &&
        typeof m.content === "string" &&
        m.content.includes(CLOSING_SIGNATURE)
    );

    const emailRefusedThisTurn = detectEmailRefusal([combinedUserText]);

    let mensajeParaCliente = applyLucyMessageGuards({
      aiResponse,
      extracted,
      filledSet: filledLabels,
      readyForClosing: allFieldsFilled,
      cierreYaEnviado,
      emailRefusedThisTurn,
      history,
      presentationHistory: fullHistory,
      currentMessage: combinedUserText,
      whatsappDisplayName,
      buildClosing: buildClosingMessage,
      log,
      entityId,
      forceFirstPresentation: isFirstInteraction,
    });

    mensajeParaCliente = await applyCierreRefinement(mensajeParaCliente, {
      readyForClosing: allFieldsFilled,
      cierreYaEnviado,
    });

    // ── P3 GUARD: Catálogo ya enviado → strip URL del catálogo en respuesta ───────
    if (cierreYaEnviado && mensajeParaCliente.includes(CATALOG_URL)) {
      log.warn({ entityId }, "P3 GUARD: catálogo repetido en respuesta post-cierre — stripping");
      mensajeParaCliente = stripCatalogBlock(mensajeParaCliente);
    }

    // ══════════════════════════════════════════════════════════════════════
    // PASO 8.8: Crear nota en Kommo cuando el lead queda calificado (6 datos)
    // Solo la PRIMERA vez — mismo guard que PASO 8.7 (cierreYaEnviado).
    // ══════════════════════════════════════════════════════════════════════
    if (allFieldsFilled && !cierreYaEnviado) {
      try {
        const notaTexto = buildLeadCalificadoNota(extracted, crmMergedLines);
        await agregarNota(subdomain, accessToken, entityId, notaTexto);
        log.info({ entityId }, "Nota de lead calificado creada en Kommo");
      } catch (notaErr) {
        log.warn({ notaErr }, "No se pudo crear nota de calificación (no crítico)");
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PASO 13: Persistir historial en disco + actualizar caché en memoria
    // DEBE ir ANTES del envío para que el caché ya tenga el valor correcto
    // si el siguiente mensaje llega mientras el envío está en vuelo.
    // ══════════════════════════════════════════════════════════════════════
    // Guardar el mensaje REAL enviado al cliente (no aiResponse) para que
    // cierreYaEnviado detecte correctamente la firma del mensaje de cierre
    // en mensajes futuros.
    appendHistory(histKey, combinedUserText, mensajeParaCliente);
    lastResponseCache.set(String(entityId), mensajeParaCliente);

    // ══════════════════════════════════════════════════════════════════════
    // PASO 14: Enviar mensaje al cliente
    //
    // PRIORIDAD:
    //  1. Meta WhatsApp Cloud API (sendWhatsAppDirect) — SIEMPRE primario.
    //     Kommo detecta el mensaje saliente automáticamente y lo muestra
    //     en el chat (espejo via integración WhatsApp Business de Kommo).
    //  2. Kommo Talks API (enviarMensaje) — fallback si Meta falla y
    //     hay talkId disponible. El mensaje llega al cliente pero no
    //     aparece en el chat de Kommo como mensaje de bot.
    // ══════════════════════════════════════════════════════════════════════
    {
      const entityKey = String(entityId);
      let whatsappPhone = phoneCache.get(entityKey) ?? null;

      if (!whatsappPhone) {
        whatsappPhone = await fetchContactPhone(subdomain, accessToken, entityId);
        if (whatsappPhone) {
          phoneCache.set(entityKey, whatsappPhone);
          log.info({ entityId, phone: whatsappPhone }, "Teléfono cacheado para envíos futuros");
        }
      }

      if (whatsappPhone) {
        // ─── Primario: Meta WhatsApp Cloud API ───────────────────────────
        // Kommo espeja el mensaje saliente automáticamente — no se necesita
        // registrarMensajeSalienteKommo.
        const sendResult = await sendWhatsAppDirect(
          whatsappPhone,
          mensajeParaCliente,
          entityId
        );
        if (sendResult.success) {
          log.info({ entityId, phone: whatsappPhone }, "Mensaje enviado via Meta API ✅");
          // Registrar en Kommo para que aparezca en el historial del chat
          void registrarMensajeSalienteKommo({
            subdomain,
            accessToken,
            chatId,
            texto:         mensajeParaCliente,
            toPhone:       whatsappPhone,
            metaMessageId: sendResult.messageId,
            entityId,
          }).catch((err: unknown) =>
            log.warn({ err, entityId }, "registrarMensajeSalienteKommo: error no capturado")
          );
          // Registrar mensaje de Lucy como nota en el lead (visible en Kommo)
          void agregarNota(subdomain, accessToken, entityId, `💬 Lucy: ${mensajeParaCliente}`).catch(
            (err: unknown) => log.warn({ err, entityId }, "agregarNota mensaje Lucy: error no crítico")
          );
        } else {
          log.error(
            { entityId, phone: whatsappPhone, error: sendResult.error },
            "Meta API falló — intentando fallback Kommo Talks API"
          );
          // ─── Fallback: Kommo Talks API ──────────────────────────────────
          if (talkId) {
            const enviado = await enviarMensaje(subdomain, accessToken, talkId, mensajeParaCliente);
            if (enviado) {
              log.info({ entityId, talkId }, "Fallback: mensaje enviado via Kommo Talks API ✅");
            } else {
              log.error({ entityId, talkId }, "Fallback: enviarMensaje también falló ❌");
            }
          } else {
            log.error({ entityId }, "Meta API falló y no hay talkId para fallback — mensaje NO enviado ❌");
          }
        }
      } else if (talkId) {
        // Sin teléfono en contacto — usar Kommo Talks directamente
        log.warn({ entityId }, "Sin teléfono en contacto — usando Kommo Talks API directamente");
        const enviado = await enviarMensaje(subdomain, accessToken, talkId, mensajeParaCliente);
        if (enviado) {
          log.info({ entityId, talkId }, "Mensaje enviado via Kommo Talks API (sin teléfono) ✅");
        } else {
          log.error({ entityId, talkId }, "Kommo Talks API falló ❌");
        }
      } else {
        log.error({ entityId }, "Sin teléfono ni talkId — mensaje NO enviado al cliente ❌");
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PASO 15: PATCH a Kommo con campos CRM + resumen legible en 1048786
    // El lead NO se mueve de etapa — Alejandro lo mueve manualmente.
    // ══════════════════════════════════════════════════════════════════════
    const payload = buildPatchPayload(
      mensajeParaCliente,
      withCrmNombre(extracted, crmMergedLines),
      conversationText,
      {
        mergedLines: crmMergedLines,
        lastLucyMessage: mensajeParaCliente,
        leadCalificado: allFieldsFilled,
      }
    );
    const cfvToSend = payload["custom_fields_values"] as Array<{ field_id: number; values: Array<{ value: unknown }> }>;

    log.info(
      { entityId, leadName: payload["name"] ?? "(sin cambio)", fieldsUpdated: cfvToSend.length },
      "Sending PATCH a Kommo (campos CRM + resumen 1048786)"
    );

    const patchController = new AbortController();
    const patchTimer = setTimeout(() => patchController.abort(), 12_000);
    let updateRes: globalThis.Response;
    try {
      updateRes = await fetch(
        `https://${subdomain}.kommo.com/api/v4/leads/${entityId}`,
        {
          method: "PATCH",
          signal: patchController.signal,
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      clearTimeout(patchTimer);
    } catch (fetchErr) {
      clearTimeout(patchTimer);
      log.error({ fetchErr, entityId }, "PATCH a Kommo falló (timeout o red)");
      return;
    }

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => "(no body)");
      log.error({ status: updateRes.status, errText, entityId }, "Error actualizando lead en Kommo");
    } else {
      log.info({ entityId }, "Lead actualizado correctamente en Kommo");
    }

    // ══════════════════════════════════════════════════════════════════════
    // PASO 9: Guardar mensajes en BD (fire-and-forget — no bloquea el flujo)
    // CRÍTICO: estas operaciones NO deben preceder al PATCH. Si la DB cuelga
    // (await sin timeout), el PATCH nunca llegaría a Kommo. Se lanzan como
    // void para que el hilo principal continúe inmediatamente.
    // ══════════════════════════════════════════════════════════════════════
    void db.insert(messages).values([
      {
        kommoLeadId: String(entityId),
        role: "user",
        authorType: "client",
        content: combinedUserText,
        source: "lucy_flow",
        intent: intentResult.intent,
        sentiment: String(sentimentResult.score.toFixed(2)),
        extractedData: extracted as unknown as Record<string, unknown>,
      },
      {
        kommoLeadId: String(entityId),
        role: "assistant",
        authorType: "lucy",
        content: aiResponse,
        source: "lucy_flow",
      },
    ]).catch((dbErr: unknown) => log.warn({ dbErr }, "No se pudieron guardar mensajes en BD (no crítico)"));

    // ══════════════════════════════════════════════════════════════════════
    // PASO 10: Actualizar conversación en BD (fire-and-forget)
    // ══════════════════════════════════════════════════════════════════════
    const parsedEventDate = safeParseDate(extracted.fecha_horario);
    void db.update(conversations)
      .set({
        clientName:
          sanitizeDisplayName(extracted.nombre) ??
          whatsappDisplayName ??
          conversation.clientName,
        clientEmail: extracted.correo || conversation.clientEmail,
        clientPhone: extracted.telefono || conversation.clientPhone,
        eventType: extracted.tipo_evento || conversation.eventType,
        ...(parsedEventDate && { eventDate: parsedEventDate }),
        guestCount: extracted.num_invitados || conversation.guestCount,
        budget: extracted.presupuesto ? String(extracted.presupuesto) : conversation.budget,
        messageCount: conversation.messageCount + 1,
        lastIntent: intentResult.intent,
        sentiment: sentimentResult.sentiment,
        stage,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversation.id))
      .catch((dbErr: unknown) => log.warn({ dbErr }, "No se pudo actualizar conversación en BD (no crítico)"));

    // ══════════════════════════════════════════════════════════════════════
    // PASO 11: Guardar/actualizar lead score (fire-and-forget)
    // ══════════════════════════════════════════════════════════════════════
    void db.query.leadScores.findFirst({
      where: eq(leadScores.kommoLeadId, String(entityId)),
    }).then((existingScore) => {
      if (existingScore) {
        return db.update(leadScores)
          .set({
            totalScore: leadScore.total,
            priority: leadScore.priority,
            budgetScore: leadScore.factors.budgetScore,
            urgencyScore: leadScore.factors.urgencyScore,
            engagementScore: leadScore.factors.engagementScore,
            completenessScore: leadScore.factors.completenessScore,
            intentScore: leadScore.factors.intentScore,
            reasoning: leadScore.reasoning,
            updatedAt: new Date(),
          })
          .where(eq(leadScores.id, existingScore.id));
      } else {
        return db.insert(leadScores).values({
          kommoLeadId: String(entityId),
          totalScore: leadScore.total,
          priority: leadScore.priority,
          budgetScore: leadScore.factors.budgetScore,
          urgencyScore: leadScore.factors.urgencyScore,
          engagementScore: leadScore.factors.engagementScore,
          completenessScore: leadScore.factors.completenessScore,
          intentScore: leadScore.factors.intentScore,
          reasoning: leadScore.reasoning,
        });
      }
    }).catch((dbErr: unknown) => log.warn({ dbErr }, "No se pudo guardar lead score en BD (no crítico)"));

    // ══════════════════════════════════════════════════════════════════════
    // PASO 12: Notificar si lead caliente
    // ══════════════════════════════════════════════════════════════════════
    if (leadScore.shouldNotifyTeam) {
      log.warn({
        leadId: entityId,
        score: leadScore.total,
        priority: leadScore.priority,
        reasoning: leadScore.reasoning,
      }, "LEAD CALIENTE — NOTIFICAR AL EQUIPO");
    }

    // Actualizar contacto vinculado si hay datos
    const hasContactData = extracted.nombre || extracted.telefono || extracted.correo;
    if (hasContactData) {
      const contactId = await fetchLeadContactId(subdomain, accessToken, entityId);
      if (contactId) {
        await updateKommoContact(subdomain, accessToken, contactId, extracted, log);
      } else {
        log.warn({ entityId }, "No se encontró contacto vinculado al lead");
      }
    }

    // Welcome email — desactivado temporalmente
    // await maybeFireWelcomeEmail({ subdomain, accessToken, entityId, log });

    // ══════════════════════════════════════════════════════════════════════
    // PASO 15: Tagging y verificación de datos completos
    // ══════════════════════════════════════════════════════════════════════
    const esProveedor = extracted.tipo_contacto === "proveedor";

    // Agregar tag de tipo de contacto si ya se detectó (una sola vez)
    if (extracted.tipo_contacto === "proveedor" || extracted.tipo_contacto === "cliente") {
      const leadParaTags = await fetchLead(subdomain, accessToken, entityId);
      if (leadParaTags) {
        const tagTipo = extracted.tipo_contacto; // "proveedor" o "cliente"
        if (!leadParaTags.tags.includes(tagTipo)) {
          await agregarTag(subdomain, accessToken, entityId, [tagTipo], leadParaTags.tags);
          log.info({ entityId, tagTipo }, "Embudo: tag de tipo de contacto agregado");
        }
      }
    }

    if (esProveedor) {
      // PROVEEDOR: verificar datos completos (correo + empresa + descripción)
      const datosProveedor = {
        tipo_contacto: "proveedor" as const,
        correo: extracted.correo || conversation.clientEmail,
        empresa: extracted.empresa,
        requerimientos_evento: extracted.requerimientos_evento,
      };
      if (tieneInformacionCompleta(datosProveedor)) {
        await agregarNota(
          subdomain, accessToken, entityId,
          `📦 PROVEEDOR calificado — ${extracted.empresa ?? "Sin empresa"}\n` +
          `Contacto: ${extracted.nombre ?? "-"} | Correo: ${extracted.correo ?? "-"}\n` +
          `Ofrece: ${extracted.requerimientos_evento ?? "-"}`
        );
        log.info({ entityId }, "Embudo: proveedor con datos completos — nota agregada para Alejandro");
      }
    } else {
      // CLIENTE: movimiento a "Humano Trabaja" es SOLO manual (por Alejandro).
      // Lucy permanece activa y sigue respondiendo al cliente aunque tenga los 8 datos.
      log.info({ entityId }, "Embudo: cliente — sin movimiento automático de etapa (solo manual)");
    }

  } catch (err) {
    log.error({ err }, "Error processing batch");
  }
}

// ─── Webhook route ────────────────────────────────────────────────────────────
router.post("/kommo/webhook", async (req: Request, res: Response) => {
  const log = req.log;
  const body = req.body as KommoWebhookBody;

  // Credentials needed upfront: audio download requires the access token
  const subdomain =
    body?.account?.subdomain?.trim() ||
    process.env["KOMMO_SUBDOMAIN"]?.trim().replace(/\s+/g, "").toLowerCase() || "";
  const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";

  const firstMessage = body?.message?.add?.[0];
  const entityId = firstMessage?.entity_id ?? null;
  const chatId = firstMessage?.chat_id ?? null;
  const talkId = firstMessage?.talk_id ?? null;

  // Resolve text: transcribes audio via Whisper if the message is a voice note
  const messageData = firstMessage
    ? await processMessage(firstMessage as unknown as Record<string, unknown>, accessToken, log)
    : { text: "", isVoice: false };
  const text = messageData.text.trim();
  const isVoice = messageData.isVoice;

  log.info(
    { text: isVoice ? `[voz] ${text.slice(0, 80)}` : text, entityId, chatId, talkId, isVoice },
    "Kommo webhook received"
  );

  if (!text || !chatId || !entityId) {
    // Log the full raw message so we can diagnose unrecognized voice/media structures
    if (firstMessage && !text) {
      log.warn(
        { rawMessage: firstMessage },
        "Webhook recibido con texto vacío — posible nota de voz no detectada o tipo de media no soportado"
      );
    }
    res.status(200).json({ ok: true, skipped: "Missing text, chat_id or entity_id" });
    return;
  }

  // Respond immediately — never let Kommo time out
  res.json({ ok: true });

  if (!subdomain || !accessToken) {
    log.error("Missing subdomain or access token");
    return;
  }

  // Debounce: accumulate messages from the same chat
  const existing = pendingBatches.get(chatId);

  if (existing) {
    clearTimeout(existing.timer);
    existing.texts.push(text);
    existing.entityId = entityId;
    existing.talkId = talkId;
    existing.isVoice = existing.isVoice || isVoice; // sticky: if any message in batch was voice
    log.info({ chatId, buffered: existing.texts.length }, "Message added to pending batch");
    existing.timer = setTimeout(() => {
      pendingBatches.delete(chatId);
      processBatch(existing, accessToken, log).catch((err) => {
        log.error({ err }, "Error in processBatch");
      });
    }, DEBOUNCE_MS);
  } else {
    const timer = setTimeout(() => {
      pendingBatches.delete(chatId);
      processBatch(batch, accessToken, log).catch((err) => {
        log.error({ err }, "Error in processBatch");
      });
    }, DEBOUNCE_MS);

    const batch: PendingBatch = { texts: [text], entityId, chatId, talkId, subdomain, isVoice, timer };
    pendingBatches.set(chatId, batch);
    log.info({ chatId, debounceMs: DEBOUNCE_MS, isVoice }, "New batch started, waiting for more messages");
  }
});

// ─── Salesbot webhook route (synchronous — Kommo waits for response) ──────────
// Configure in Kommo Salesbot: action "Llamar webhook" → POST /api/kommo/salesbot
// Kommo sends the trigger payload and waits for a JSON response.
// Lucy processes the message, returns the reply, and Salesbot dispatches it via WhatsApp.
router.post("/kommo/salesbot", async (req: Request, res: Response) => {
  const log = req.log;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = req.body as Record<string, any>;

  // Log the raw body so we can inspect the exact Salesbot payload format
  log.info({ body }, "Salesbot webhook received (raw)");

  // ── Extract fields ─────────────────────────────────────────────────────────
  // Kommo Salesbot can send the body in different shapes depending on config.
  // We try several common paths.
  const messageText: string =
    (body?.message?.text as string | undefined) ??
    (body?.text as string | undefined) ??
    (body?.last_message?.text as string | undefined) ??
    "";

  const entityId: string | null =
    String(
      body?.lead?.id ??
      body?.entity_id ??
      body?.lead_id ??
      body?.leads?.add?.[0]?.id ??       // Kommo stage-change trigger
      body?.leads?.update?.[0]?.id ??
      ""
    ) || null;

  const chatId: string | null =
    String(body?.talk?.chat_id ?? body?.chat_id ?? body?.chat?.id ?? body?.message?.chat_id ?? "") || null;

  const talkId: string | null =
    String(body?.talk?.id ?? body?.talk_id ?? body?.message?.talk_id ?? "") || null;

  const subdomainRaw =
    (body?.account?.subdomain as string | undefined) ??
    process.env["KOMMO_SUBDOMAIN"] ??
    "";
  const subdomain = subdomainRaw.trim().replace(/\s+/g, "").toLowerCase();
  const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";

  log.info({ messageText, entityId, chatId, talkId, subdomain: subdomain || "(from env)" }, "Salesbot fields parsed");

  if (!messageText) {
    log.warn({ body }, "Salesbot: no message text found in payload");
    res.json({ status: "skip", reason: "no_message_text" });
    return;
  }

  if (!subdomain || !accessToken) {
    log.error("Salesbot: missing subdomain or access token");
    res.status(500).json({ error: "server_misconfigured" });
    return;
  }

  try {
    // ── Load history (file-based + Kommo bootstrap cuando está vacío) ─────────
    const histKey = entityId ?? chatId ?? "salesbot-default";
    let fullHistory: OpenAI.Chat.ChatCompletionMessageParam[] = getHistory(histKey);
    let historySource = "file";

    if (talkId && fullHistory.length < 2) {
      try {
        const kommoHistory = await fetchKommoHistory(subdomain, accessToken, talkId);
        if (kommoHistory && kommoHistory.length > 0) {
          const toExclude = new Set([messageText.trim()]);
          const filtered = kommoHistory.filter(
            (m) => !(m.role === "user" && typeof m.content === "string" && toExclude.has(m.content.trim()))
          );
          if (filtered.length > fullHistory.length) {
            fullHistory = filtered;
            historySource = "kommo-bootstrap";
          }
        }
      } catch {
        log.warn("Salesbot: Kommo history bootstrap failed, using file history");
      }
    }

    let history = fullHistory.slice(-6);
    log.info({ histKey, historyLength: history.length, historySource }, "Salesbot: historial cargado");

    // ── Load CRM context ──────────────────────────────────────────────────────
    let crmContext = "";
    let crmLines: string[] = [];
    let lastLucyResponse = "";
    let salesbotFilledLabels = new Set<string>();
    if (entityId) {
      try {
        const fields = await fetchLeadCurrentFields(subdomain, accessToken, entityId, log);
        crmLines = fields.crmLines;
        lastLucyResponse = fields.lastLucyResponse ?? "";
      } catch {
        log.warn("Salesbot: could not load CRM context");
      }
    }

    // isFirstInteraction: Lucy nunca ha respondido (ni en historial ni en CRM ni hay nombre ya en CRM)
    const hasAssistantMsg = history.some((m) => m.role === "assistant");
    const normalizedLastLucyResponse = isLegacyStoredLucyResponse(lastLucyResponse)
      ? ""
      : lastLucyResponse;
    const isFirstInteraction = !hasAssistantMsg && !normalizedLastLucyResponse;

    const whatsappDisplayName = entityId
      ? await resolveWhatsappDisplayName(subdomain, accessToken, entityId, null)
      : null;

    const extracted = await extractData(history, messageText, crmLines.join("\n"));

    const conversationText = [
      ...history
        .filter((m) => m.role === "user" && typeof m.content === "string")
        .map((m) => m.content as string),
      messageText,
    ].join(" ");
    enrichExtractedFromText(extracted, conversationText);

    const crmResultFinal = buildCrmContext(
      crmLines,
      extracted,
      history,
      undefined,
      messageText,
      whatsappDisplayName,
      fullHistory
    );
    crmContext = crmResultFinal.context;
    const salesbotAllFieldsFilled = crmResultFinal.allFieldsFilled;
    const salesbotMergedLines = crmResultFinal.mergedLines;
    salesbotFilledLabels = crmResultFinal.filledLabels;

    const catalogBlock = await getCatalogPromptBlock();
    const basePrompt = SYSTEM_PROMPT + "\n\n" + catalogBlock;
    const systemContent = isFirstInteraction
      ? basePrompt +
        crmContext +
        "\n\nPRIMER MENSAJE: SIEMPRE \"Hola, soy Lucy de Bodasesor.\" + reconocer tema + pedir nombre primero."
      : basePrompt + crmContext;

    const trainingExamples = await getTrainingExamples();
    const fewShot: OpenAI.Chat.ChatCompletionMessageParam[] = trainingExamples.flatMap((ex) => [
      { role: "user" as const, content: ex.userMessage },
      { role: "assistant" as const, content: ex.lucyResponse },
    ]);

    const lucyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      ...fewShot,
      ...history,
      { role: "user", content: messageText },
    ];

    log.info({ isFirstInteraction, messageText, historyLength: history.length }, "Salesbot: llamando OpenAI");

    const redactionBriefing = buildLucyRedactionBriefing({
      extracted,
      filledSet: salesbotFilledLabels,
      crmMergedLines: salesbotMergedLines,
      messageText,
      conversationText,
      allFieldsFilled: salesbotAllFieldsFilled,
      isFirstInteraction,
    });

    let aiResponse = await completeLucyRedaction(openai, lucyMessages, redactionBriefing);
    aiResponse = injectCatalogInclusionIfAsked(messageText, aiResponse);
    aiResponse = injectCatalogCateringIfAsked(messageText, aiResponse);
    aiResponse = injectCatalogPriceIfAsked(messageText, aiResponse);
    log.info({ aiResponse, extracted, isFirstInteraction }, "Salesbot: OpenAI response");

    const sbCierreYaEnviado = history.some(
      (m) =>
        m.role === "assistant" &&
        typeof m.content === "string" &&
        m.content.includes(CLOSING_SIGNATURE)
    );

    const emailRefusedThisTurn = detectEmailRefusal([messageText]);

    let mensajeParaCliente = applyLucyMessageGuards({
      aiResponse,
      extracted,
      filledSet: salesbotFilledLabels,
      readyForClosing: salesbotAllFieldsFilled,
      cierreYaEnviado: sbCierreYaEnviado,
      emailRefusedThisTurn,
      history,
      presentationHistory: fullHistory,
      currentMessage: messageText,
      whatsappDisplayName,
      buildClosing: buildClosingMessage,
      log,
      entityId,
      forceFirstPresentation: isFirstInteraction,
    });

    mensajeParaCliente = await applyCierreRefinement(mensajeParaCliente, {
      readyForClosing: salesbotAllFieldsFilled,
      cierreYaEnviado: sbCierreYaEnviado,
    });

    // ── P3 GUARD: Catálogo ya enviado → strip URL del catálogo en respuesta ───────
    if (sbCierreYaEnviado && mensajeParaCliente.includes(CATALOG_URL)) {
      log.warn({ entityId }, "Salesbot P3 GUARD: catálogo repetido en respuesta post-cierre — stripping");
      mensajeParaCliente = stripCatalogBlock(mensajeParaCliente);
    }

    // Guardar mensaje REAL enviado (no aiResponse) para que cierreYaEnviado funcione.
    appendHistory(histKey, messageText, mensajeParaCliente);

    // ── Enviar mensaje al cliente via Meta WhatsApp Cloud API ─────────────────
    // Lucy ya no depende del callback del SalesBot — envía directamente.
    // Caché de teléfono: reutilizar si ya fue obtenido en el flujo principal.
    if (entityId) {
      const sbEntityKey = String(entityId);
      let sbPhone = phoneCache.get(sbEntityKey) ?? null;

      if (!sbPhone) {
        sbPhone = await fetchContactPhone(subdomain, accessToken, entityId);
        if (sbPhone) {
          phoneCache.set(sbEntityKey, sbPhone);
          log.info({ entityId, phone: sbPhone }, "Salesbot: teléfono cacheado");
        }
      }

      // Meta API primario — Kommo espeja automáticamente.
      // Fallback a Kommo Talks si Meta falla y hay talkId.
      if (sbPhone) {
        const sbSendResult = await sendWhatsAppDirect(sbPhone, mensajeParaCliente, entityId);
        if (sbSendResult.success) {
          log.info({ entityId, phone: sbPhone }, "Salesbot: mensaje enviado via Meta API ✅");
          if (chatId) {
            void registrarMensajeSalienteKommo({
              subdomain,
              accessToken,
              chatId,
              texto:         mensajeParaCliente,
              toPhone:       sbPhone,
              metaMessageId: sbSendResult.messageId,
              entityId,
            }).catch((err: unknown) =>
              log.warn({ err, entityId }, "Salesbot: registrarMensajeSalienteKommo error")
            );
          }
          // Registrar mensaje de Lucy como nota en el lead (visible en Kommo)
          void agregarNota(subdomain, accessToken, entityId, `💬 Lucy: ${mensajeParaCliente}`).catch(
            (err: unknown) => log.warn({ err, entityId }, "Salesbot: agregarNota mensaje Lucy: error no crítico")
          );
        } else {
          log.error(
            { entityId, phone: sbPhone, error: sbSendResult.error },
            "Salesbot: Meta API falló — intentando fallback Kommo Talks API"
          );
          if (talkId) {
            const sbEnviado = await enviarMensaje(subdomain, accessToken, talkId, mensajeParaCliente);
            if (sbEnviado) {
              log.info({ entityId, talkId }, "Salesbot: fallback Kommo Talks API ✅");
            } else {
              log.error({ entityId, talkId }, "Salesbot: fallback Kommo Talks también falló ❌");
            }
          } else {
            log.error({ entityId }, "Salesbot: Meta falló y sin talkId — mensaje no enviado ❌");
          }
        }
      } else if (talkId) {
        log.warn({ entityId }, "Salesbot: sin teléfono — usando Kommo Talks API directamente");
        const sbEnviado = await enviarMensaje(subdomain, accessToken, talkId, mensajeParaCliente);
        if (sbEnviado) {
          log.info({ entityId, talkId }, "Salesbot: mensaje enviado via Kommo Talks API ✅");
        } else {
          log.error({ entityId, talkId }, "Salesbot: Kommo Talks falló ❌");
        }
      } else {
        log.warn({ entityId }, "Salesbot: sin teléfono ni talkId — mensaje no enviado ❌");
      }

      // ── Update CRM fields + resumen 1048786 ───────────────────────────────
      const patchPayload = buildPatchPayload(mensajeParaCliente, extracted, conversationText, {
        mergedLines: salesbotMergedLines,
        lastLucyMessage: mensajeParaCliente,
        leadCalificado: salesbotAllFieldsFilled,
      });
      void fetch(`https://${subdomain}.kommo.com/api/v4/leads/${entityId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(patchPayload),
      }).then(async (r) => {
        if (!r.ok) {
          const t = await r.text();
          log.error({ status: r.status, err: t }, "Salesbot: lead PATCH failed");
        } else {
          log.info({ entityId }, "Salesbot: lead PATCH ok (solo campos CRM)");
        }
      });
    }

    // ── Respuesta al Salesbot ─────────────────────────────────────────────────
    // No incluimos `message` en el callback: el mensaje ya fue enviado directamente
    // via Meta API. Devolver `message` aquí causaría un duplicado si el SalesBot
    // sigue activo en la configuración de Kommo.
    res.json({ status: "success" });
  } catch (err) {
    log.error({ err }, "Salesbot: processing error");
    res.status(500).json({ error: "processing_failed" });
  }
});

// ─── Pipeline-change webhook (cuando Alejandro mueve a Cotización Realizada) ────
// Configurar en Kommo → Webhooks → Evento: "Lead status changed"
// URL: POST /api/kommo/pipeline-change
router.post("/kommo/pipeline-change", async (req: Request, res: Response) => {
  const log = req.log;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = req.body as Record<string, any>;

  log.info({ body }, "Pipeline-change webhook recibido");

  // Kommo envía el payload en diferentes formatos según la versión
  const leadId: string | null =
    String(body?.leads?.status?.[0]?.id ?? body?.lead_id ?? body?.id ?? "") || null;
  const newStatusId: number | null =
    Number(body?.leads?.status?.[0]?.status_id ?? body?.status_id ?? 0) || null;

  if (!leadId || !newStatusId) {
    log.warn({ body }, "Pipeline-change: no se pudo extraer leadId o statusId");
    res.json({ ok: true, skipped: "missing_fields" });
    return;
  }

  log.info({ leadId, newStatusId }, "Pipeline-change: etapa cambiada");

  // Si Alejandro movió manualmente a "Humano Trabaja" → activar fase de aprendizaje humano.
  // El resumen en 1048786 se conserva para consulta.
  if (newStatusId === ETAPA.HUMANO_TRABAJA) {
    const subdomain = process.env["KOMMO_SUBDOMAIN"]?.trim().replace(/\s+/g, "").toLowerCase() ?? "";
    const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";
    try {
      await limpiarCampoRespuesta(subdomain, accessToken, leadId);
      await setLearningPhase(leadId, "human_active");
      void syncHumanPhaseLead(subdomain, accessToken, leadId, { extract: false }).catch((err) =>
        log.warn({ err, leadId }, "Pipeline-change: sync aprendizaje falló")
      );
      log.info({ leadId }, "Pipeline-change: fase humana — sync de chat iniciado");
    } catch (err) {
      log.error({ err, leadId }, "Pipeline-change: error en Humano Trabaja");
    }
  }

  // Si Alejandro movió a "Cotización Realizada" → programar seguimiento 22h
  if (newStatusId === ETAPA.COTIZACION_REALIZADA) {
    const subdomain = process.env["KOMMO_SUBDOMAIN"]?.trim().replace(/\s+/g, "").toLowerCase() ?? "";
    const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";

    try {
      const lead = await fetchLead(subdomain, accessToken, leadId);
      const chatId = lead?.chatId ?? null;

      if (chatId) {
        await programarSeguimiento(
          leadId,
          chatId,
          lead?.nombre ?? null,
          lead?.tipo_evento ?? null,
          lead?.fecha_evento ?? null
        );
        await setLearningPhase(leadId, "post_quote");
        void syncHumanPhaseLead(subdomain, accessToken, leadId, { extract: true }).catch((err) =>
          log.warn({ err, leadId }, "Pipeline-change: extracción aprendizaje falló")
        );
        log.info({ leadId }, "Pipeline-change: seguimiento 22h + extracción aprendizaje");
      } else {
        log.warn({ leadId }, "Pipeline-change: no se encontró chatId para programar seguimiento");
      }
    } catch (err) {
      log.error({ err, leadId }, "Pipeline-change: error programando seguimiento");
    }
  }

  res.json({ ok: true });
});

// ─── Cron endpoints (para UptimeRobot u otro servicio externo) ───────────────
function assertCronAuthorized(req: Request, res: Response): boolean {
  const secret = process.env["CRON_SECRET"]?.trim();
  if (!secret) return true;
  const header = req.headers["x-cron-secret"];
  const query = typeof req.query.secret === "string" ? req.query.secret : null;
  if (header === secret || query === secret) return true;
  res.status(401).json({ error: "cron_unauthorized" });
  return false;
}

router.get("/kommo/cron/inactividad", async (req: Request, res: Response) => {
  if (!assertCronAuthorized(req, res)) return;
  const subdomain = process.env["KOMMO_SUBDOMAIN"]?.trim().replace(/\s+/g, "").toLowerCase() ?? "";
  const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";
  try {
    await verificarLeadsInactivos(subdomain, accessToken);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Cron inactividad: error");
    res.status(500).json({ error: "cron_failed" });
  }
});

router.get("/kommo/cron/seguimientos", async (req: Request, res: Response) => {
  if (!assertCronAuthorized(req, res)) return;
  const subdomain = process.env["KOMMO_SUBDOMAIN"]?.trim().replace(/\s+/g, "").toLowerCase() ?? "";
  const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";
  try {
    await procesarSeguimientosPendientes(subdomain, accessToken);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Cron seguimientos: error");
    res.status(500).json({ error: "cron_failed" });
  }
});

// Endpoint externo para verificar ventanas de 24h (UptimeRobot)
router.get("/kommo/cron/ventanas24h", async (req: Request, res: Response) => {
  if (!assertCronAuthorized(req, res)) return;
  const subdomain = process.env["KOMMO_SUBDOMAIN"]?.trim().replace(/\s+/g, "").toLowerCase() ?? "";
  const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";
  try {
    await verificarVentanas24h(subdomain, accessToken);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Cron ventanas24h: error");
    res.status(500).json({ error: "cron_failed" });
  }
});

router.get("/kommo/cron/learning", async (req: Request, res: Response) => {
  if (!assertCronAuthorized(req, res)) return;
  const { handleLearningCron } = await import("./learning.js");
  await handleLearningCron(req, res);
});

// ─── Reactivar Lucy manualmente ───────────────────────────────────────────────
// POST /api/kommo/lucy/activar/:leadId
// Quita lucy_desactivada, mueve de Humano Trabaja a Datos e Intereses si aplica,
// y envía mensaje de reactivación personalizado al cliente.
router.post("/kommo/lucy/activar/:leadId", async (req: Request, res: Response) => {
  const subdomain = process.env["KOMMO_SUBDOMAIN"]?.trim().replace(/\s+/g, "").toLowerCase() ?? "";
  const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";
  const leadId = String(req.params["leadId"] ?? "");

  if (!leadId) {
    res.status(400).json({ error: "leadId requerido" });
    return;
  }

  try {
    const result = await reactivarLucy(subdomain, accessToken, leadId);
    if (!result.ok) {
      res.status(404).json({ error: "Lead no encontrado en Kommo" });
      return;
    }
    req.log.info({ leadId }, "Lucy reactivada via API");
    res.json({ ok: true, mensaje: result.mensaje });
  } catch (err) {
    req.log.error({ err, leadId }, "Error reactivando Lucy");
    res.status(500).json({ error: "activation_failed" });
  }
});

// ─── Simulador Kommo (sin CRM real) ───────────────────────────────────────────
// El simulador Python llama aquí con los datos del lead en memoria.
// No requiere KOMMO_SUBDOMAIN ni KOMMO_ACCESS_TOKEN.

interface SimulatorLeadPayload {
  id?: number;
  name?: string;
  contact_phone?: string;
  contact_email?: string;
  stage_id?: string;
  custom_fields?: Record<string, unknown>;
}

const SIMULATOR_CF_TO_KOMMO: Record<string, number> = {
  cf_direccion: FIELD.direccion_evento,
  cf_requerimiento: FIELD.requerimientos_evento,
  cf_fecha_horario: FIELD.fecha_horario,
  cf_num_invitados: FIELD.num_invitados,
  cf_tipo_evento: FIELD.tipo_evento,
  cf_presupuesto: FIELD.presupuesto,
};

function buildCrmLinesFromSimulator(lead: SimulatorLeadPayload): LeadFieldsResult {
  const cf = lead.custom_fields ?? {};
  const snapshot = cf["cf_crm_snapshot"];
  if (typeof snapshot === "string" && snapshot.trim()) {
    const lines = snapshot
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (l.startsWith("- ") ? l : `- ${l}`));
    const lastLucy = cf["cf_respuesta_ia_1"];
    const lastLucyResponse =
      typeof lastLucy === "string" && lastLucy.trim() ? lastLucy.trim() : null;
    return { crmLines: lines, lastLucyResponse };
  }

  const lines: string[] = [];
  // El nombre de WhatsApp se resuelve aparte (whatsappDisplayName) — no precargar aquí
  // para que el flujo de primer mensaje funcione correctamente.
  if (lead.contact_email?.trim()) {
    lines.push(`- Correo electrónico: ${lead.contact_email.trim()}`);
  }
  if (lead.contact_phone?.trim()) {
    lines.push(`- Teléfono: ${lead.contact_phone.trim()}`);
  }

  const cfFields = lead.custom_fields ?? {};
  const nombreLead = sanitizeDisplayName(lead.name);
  if (nombreLead && !isPlaceholderLeadName(lead.name)) {
    lines.push(`- Nombre del cliente: ${nombreLead}`);
  }
  for (const [cfId, kommoId] of Object.entries(SIMULATOR_CF_TO_KOMMO)) {
    const raw = cfFields[cfId];
    if (raw === null || raw === undefined || raw === "") continue;
    const label = FIELD_NAME[kommoId];
    if (!label) continue;
    lines.push(`- ${label}: ${String(raw)}`);
  }

  if (cfFields["cf_email_waived"]) {
    lines.push(`- ${EMAIL_WAIVED_LABEL}: continuar por WhatsApp/chat`);
  }

  const lastLucy = cfFields["cf_respuesta_ia_1"];
  const lastLucyResponse =
    typeof lastLucy === "string" && lastLucy.trim() ? lastLucy.trim() : null;

  return { crmLines: lines, lastLucyResponse };
}

function mapExtractedToSimulatorFields(
  extracted: ExtractedData,
  reply: string,
  mergedLines: string[] = []
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    cf_respuesta_ia_1: reply.slice(0, 500),
    cf_crm_snapshot: mergedLines.join("\n"),
  };
  if (mergedLines.some((l) => l.includes(EMAIL_WAIVED_LABEL))) {
    fields.cf_email_waived = "1";
  }
  if (isValidExtractedString(extracted.direccion_evento)) fields.cf_direccion = extracted.direccion_evento;
  if (isValidExtractedString(extracted.requerimientos_evento)) fields.cf_requerimiento = extracted.requerimientos_evento;
  if (isValidExtractedString(extracted.fecha_horario)) fields.cf_fecha_horario = extracted.fecha_horario;
  if (extracted.num_invitados !== null && extracted.num_invitados > 0) fields.cf_num_invitados = extracted.num_invitados;
  if (isValidExtractedString(extracted.tipo_evento)) fields.cf_tipo_evento = extracted.tipo_evento;
  const presLine = mergedLines.find((l) => /^-?\s*Presupuesto \(MXN\):/i.test(l));
  if (presLine) {
    fields.cf_presupuesto = presLine.replace(/^-?\s*Presupuesto \(MXN\):\s*/i, "").trim();
  }
  return fields;
}

function suggestSimulatorStage(
  messageText: string,
  allFieldsFilled: boolean,
  currentStageId?: string
): string | null {
  if (/humano|persona real|hablar con alguien|agente humano|asesor/i.test(messageText)) {
    return "stage_humano_trabaja";
  }
  if (allFieldsFilled && currentStageId === "stage_datos_intereses") {
    return "stage_cotizacion";
  }
  return null;
}

router.post("/kommo/simulator", async (req: Request, res: Response) => {
  const log = req.log;
  const body = req.body as Record<string, unknown>;
  const lead = (body.lead ?? {}) as SimulatorLeadPayload;
  const messageText =
    (body.text as string | undefined) ??
    ((body.message as { text?: string } | undefined)?.text) ??
    "";

  const leadId = lead.id ?? body.lead_id ?? "sim-default";

  if (!messageText.trim()) {
    res.status(400).json({ error: "no_message_text" });
    return;
  }

  if (!isOpenAiConfigured()) {
    res.status(200).json({
      status: "error",
      reply:
        "Lucy no tiene OPEN_AI (o OPENAI_API_KEY) configurada. Añádela en Hostinger y reinicia.",
      error: "missing_openai_key",
    });
    return;
  }

  try {
    const histKey = `sim-${leadId}`;
    const fullHistory = getHistory(histKey);
    let history = fullHistory.slice(-6);

    const { crmLines, lastLucyResponse } = buildCrmLinesFromSimulator(lead);
    const whatsappDisplayName = sanitizeDisplayName(lead.name);

    const hasAssistantMsg = history.some((m) => m.role === "assistant");
    const normalizedLastLucyResponse = isLegacyStoredLucyResponse(lastLucyResponse)
      ? null
      : lastLucyResponse;
    const isFirstInteraction = !hasAssistantMsg && !normalizedLastLucyResponse;

    const extracted = await extractData(history, messageText, crmLines.join("\n"));

    const conversationText = [
      ...history
        .filter((m) => m.role === "user" && typeof m.content === "string")
        .map((m) => m.content as string),
      messageText,
    ].join(" ");
    enrichExtractedFromText(extracted, conversationText);

    const crmResultFinal = buildCrmContext(
      crmLines,
      extracted,
      history,
      lead.contact_email,
      messageText,
      whatsappDisplayName,
      fullHistory
    );
    const crmContext = crmResultFinal.context;
    const allFieldsFilled = crmResultFinal.allFieldsFilled;
    const filledLabels = crmResultFinal.filledLabels;
    const crmMergedLines = crmResultFinal.mergedLines;

    const trainingExamples = await getTrainingExamples();
    const fewShot: OpenAI.Chat.ChatCompletionMessageParam[] = trainingExamples.flatMap((ex) => [
      { role: "user" as const, content: ex.userMessage },
      { role: "assistant" as const, content: ex.lucyResponse },
    ]);

    const catalogBlock = await getCatalogPromptBlock();
    const basePrompt = SYSTEM_PROMPT + "\n\n" + catalogBlock;
    const systemContent = isFirstInteraction
      ? basePrompt +
        crmContext +
        "\n\nPRIMER MENSAJE: SIEMPRE \"Hola, soy Lucy de Bodasesor.\" + reconocer tema + pedir nombre primero."
      : basePrompt + crmContext;

    const lucyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      ...fewShot,
      ...history,
      { role: "user", content: messageText },
    ];

    const redactionBriefing = buildLucyRedactionBriefing({
      extracted,
      filledSet: filledLabels,
      crmMergedLines,
      messageText,
      conversationText,
      allFieldsFilled,
      isFirstInteraction,
    });

    let aiResponse = await completeLucyRedaction(openai, lucyMessages, redactionBriefing);
    aiResponse = injectCatalogInclusionIfAsked(messageText, aiResponse);
    aiResponse = injectCatalogCateringIfAsked(messageText, aiResponse);
    aiResponse = injectCatalogPriceIfAsked(messageText, aiResponse);

    const simCierreYaEnviado = history.some(
      (m) =>
        m.role === "assistant" &&
        typeof m.content === "string" &&
        m.content.includes(CLOSING_SIGNATURE)
    );

    const emailRefusedThisTurn = detectEmailRefusal([messageText]);

    let mensajeParaCliente = applyLucyMessageGuards({
      aiResponse,
      extracted,
      filledSet: filledLabels,
      readyForClosing: allFieldsFilled,
      cierreYaEnviado: simCierreYaEnviado,
      emailRefusedThisTurn,
      history,
      presentationHistory: fullHistory,
      currentMessage: messageText,
      whatsappDisplayName,
      buildClosing: buildClosingMessage,
      log,
      entityId: leadId,
      forceFirstPresentation: isFirstInteraction,
    });

    mensajeParaCliente = await applyCierreRefinement(mensajeParaCliente, {
      readyForClosing: allFieldsFilled,
      cierreYaEnviado: simCierreYaEnviado,
    });

    appendHistory(histKey, messageText, mensajeParaCliente);

    const fields = mapExtractedToSimulatorFields(extracted, mensajeParaCliente, crmMergedLines);
    const stage_id = suggestSimulatorStage(messageText, allFieldsFilled, lead.stage_id);

    const lead_updates: Record<string, string> = {};
    if (isValidExtractedString(extracted.nombre)) lead_updates.name = extracted.nombre;
    else if (whatsappDisplayName) lead_updates.name = whatsappDisplayName;
    if (isValidExtractedString(extracted.correo)) lead_updates.contact_email = extracted.correo;
    if (isValidExtractedString(extracted.telefono)) lead_updates.contact_phone = extracted.telefono;

    log.info({ leadId, allFieldsFilled, stage_id }, "Simulator: Lucy respondió");

    res.json({
      status: "success",
      reply: mensajeParaCliente,
      fields,
      stage_id,
      lead_updates,
      all_fields_filled: allFieldsFilled,
    });
  } catch (err) {
    log.error({ err }, "Simulator: processing error");
    const msg = err instanceof Error ? err.message : String(err);
    const isAuth =
      msg.includes("401") ||
      msg.includes("Incorrect API key") ||
      msg.includes("invalid_api_key") ||
      msg.includes("API key");
    res.status(200).json({
      status: "error",
      reply: isAuth
        ? "OPEN_AI / OPENAI_API_KEY inválida en Lucy. Revisa la key en Hostinger y reinicia."
        : "Lucy tuvo un error procesando el mensaje. Revisa los logs del servidor.",
      error: isAuth ? "openai_auth" : "processing_failed",
    });
  }
});

router.post("/kommo/simulator/reset", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const leadId = body.lead_id ?? (body.lead as { id?: number } | undefined)?.id ?? "sim-default";
  const histKey = `sim-${leadId}`;
  clearHistory(histKey);
  req.log.info({ leadId, histKey }, "Simulator: historial de Lucy reiniciado");
  res.json({ status: "success", lead_id: leadId });
});

// ─── Cron jobs internos (cada hora) ──────────────────────────────────────────
// Se inician junto con el router al cargar el módulo.
// Complementan los endpoints externos de cron como respaldo.
(() => {
  const subdomain = process.env["KOMMO_SUBDOMAIN"]?.trim().replace(/\s+/g, "").toLowerCase() ?? "";
  const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";

  if (!subdomain || !accessToken) return; // No iniciar si faltan credenciales

  const UNA_HORA = 60 * 60 * 1000;

  // Primer ciclo a los 2 minutos de arranque para evitar colisiones
  setTimeout(() => {
    void verificarLeadsInactivos(subdomain, accessToken);
    void procesarSeguimientosPendientes(subdomain, accessToken);
    void verificarVentanas24h(subdomain, accessToken);

    setInterval(() => {
      void verificarLeadsInactivos(subdomain, accessToken);
    }, UNA_HORA);

    setInterval(() => {
      void procesarSeguimientosPendientes(subdomain, accessToken);
    }, UNA_HORA);

    setInterval(() => {
      void verificarVentanas24h(subdomain, accessToken);
    }, UNA_HORA);
  }, 2 * 60 * 1000);
})();

export default router;
