import { Router, type IRouter, type Request, type Response } from "express";
import {
  AUTO_CLIENTS,
  getClientById,
  runAllAutoClients,
  runAutoClient,
} from "../../scripts/simulator-auto-client-lib.mjs";
import { resolveLucyPublicBase } from "../lib/publicUrl.js";
import { getOpenAiApiKey, getOpenAiApiKeyForClient, isOpenAiConfigured } from "../lib/openaiEnv.js";
import OpenAI from "openai";
import { getHistory, appendHistory, clearHistory } from "../chat-history.js";
import {
  applyEmailWaiver,
  applyPresupuestoWaiver,
  applyWhatsappNombreFallback,
  detectCierreEnviado,
  WHATSAPP_NOMBRE_NOTE,
  CLOSING_CORE_FIELDS,
  collectUserTexts,
  EMAIL_WAIVED_LABEL,
  isEmailSatisfied,
  isReadyForClosing,
  nextFieldQuestion,
  isValidRequerimientosValue,
  resolveEffectiveLastLucyResponse,
  parseNombreFromCrmLines,
  crmStoredValue,
  buildEmergencyContactAnswer,
  buildStandardClosingMessage,
} from "../lucy-flow-guards.js";
import { db, conversations, leadScores, messages } from "@workspace/db";
import { eq } from "drizzle-orm";
import { calculateLeadScore, detectStage } from "../services/leadScoring.js";
import { detectIntent, analyzeSentiment, detectObjection } from "../services/intentDetection.js";
import { processMessage, getVoiceAcknowledgment } from "../services/voiceProcessor.js";
import {
  isDuplicateWebhookMessage,
  isIncomingClientMessage,
  markWebhookMessageProcessed,
  webhookMessageKey,
} from "../lib/webhookDedup.js";
import {
  sanitizeExtractedFromExternal,
  sanitizeKommoCrmLines,
} from "../lib/external-ingest-sanitize.js";
import { generateSummary, buildResumenClienteLargo } from "../services/summaryService.js";
import {
  isPlaceholderLeadName,
  isQuoteIntentMessage,
  isNombreMoreComplete,
  pickBetterNombre,
  sanitizeDisplayName,
  sanitizeCrmNombre,
  shouldUpdateName,
} from "../contact-name.js";
import { filterClientEmail, isOwnCompanyEmail } from "../client-email.js";
import {
  prepareLucyExtraction,
  generateLucyOutbound,
} from "../lucyTurnProcessor.js";
import {
  applyCapturesToCrm,
  captureContextualAnswer,
  clientAsksForRecommendations,
  clientAsksAboutTeam,
  clientAddsToQuote,
  appendPostCierreRequirements,
  appendSpaceDimensionsToRequerimientos,
  isDimensionText,
  isVagueVenueOnly,
  isServiceLabelNotTipoEvento,
  parseCorreoFromText,
  parsePresupuestoFromText,
  parseTipoEventoFromText,
  inferLucyAskedField,
  scanConversationForCaptures,
  recoverClienteNombreFromHistory,
  stripNombrePresentationPrefix,
  isAmbiguousShortNumber,
  clientNeedsEmergencyContact,
  parseZonaFromText,
  parseFechaFromText,
  parseInvitadosFromText,
  parseServicesFromText,
  mergeServiceRequirements,
  isUsableDireccionEvento,
} from "../conversation-understanding.js";
import type { ExtractedData } from "../types.js";
import {
  fetchContactPhone,
  fetchContactDisplayName,
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
  limpiarCampoRespuesta,
  ETAPA,
} from "../services/embudo.js";
import { deliverLucyOutbound } from "../services/kommoMirror.js";
import { captureInboundWhileLucyInactive, setLearningPhase } from "../services/chatIngest.js";
import { syncHumanPhaseLead } from "../services/learningSync.js";
import { recordKnowledgeGapIfNeeded } from "../services/knowledgeGapDetector.js";
import { getKommoAccessToken, getKommoSubdomain, isKommoConfigured } from "../lib/kommoEnv.js";
import { advisorLabelForClient, isStaffAdvisorName } from "../lib/bodasesorAdvisor.js";

const router: IRouter = Router();

const openai = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });

// ─── Kommo field IDs (hardcoded — no lookup needed) ──────────────────────────
const FIELD = {
  // respuesta_ia (1048772) eliminado de Kommo — no usar o el PATCH falla
  respuesta_ia_largo:     1048786, // Texto largo — respuesta completa de Lucy
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
  isImage: boolean;
  timer: ReturnType<typeof setTimeout>;
}

const pendingBatches = new Map<string, PendingBatch>();


// ─── Kommo types ──────────────────────────────────────────────────────────────
interface KommoMessageEntry {
  id?: string | number;
  text?: string;
  entity_id?: number | string;
  chat_id?: string;
  talk_id?: string;
  type?: string;
  created_at?: string | number;
  author?: { type?: string; id?: string };
  attachment?: { type?: string; mime_type?: string; link?: string; url?: string };
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
    modo_servicio: null,
  };

  try {
    const crmHint = crmAlreadyFilled
      ? `\n\nDATOS YA GUARDADOS EN CRM (NO los vuelvas a asignar, ya están registrados):\n${crmAlreadyFilled}\n\nIMPORTANTE: Si el cliente responde con un número suelto (ej: "200"), determina a qué campo corresponde por contexto. Si "num_invitados" NO está en los datos ya guardados, ese número es probablemente el número de invitados. Si "presupuesto" NO está guardado y el número es muy alto (>5000) o el cliente mencionó presupuesto, es presupuesto.`
      : "";

    const extractionPrompt = `Eres un extractor de datos estructurados. Analiza la conversación y devuelve ÚNICAMENTE un objeto JSON. Para cada campo, escribe el valor mencionado explícitamente, o escribe null si no se mencionó. NUNCA escribas texto descriptivo como valor — solo datos reales o null.

Campos a extraer:
- tipo_contacto: "cliente" si PIDE/COMPRA un servicio para su evento; "proveedor" SOLO si claramente OFRECE vender algo A Bodasesor; ante la duda → "cliente" (string)
- nombre: nombre propio del contacto — si dio nombre Y apellido, guarda AMBOS (ej. "Ana Pérez"); nunca recortes el apellido (string o null)
- empresa: nombre de la empresa si es proveedor (string o null)
- telefono: número de teléfono (string o null)
- correo: correo electrónico (string o null)
- presupuesto: cantidad en MXN si es cliente (número entero o null, NO string)
- direccion_evento: lugar o dirección del evento si es cliente (string o null)
- requerimientos_evento: para CLIENTE: servicios o requerimientos; para PROVEEDOR: descripción detallada de productos/servicios que ofrece (string o null)
- fecha_horario: fecha y/u horario del evento si es cliente (string o null)
- num_invitados: número de invitados si es cliente (número entero o null, NO string). Un número suelto ambiguo ("el 5", "5") sin contexto de personas/pax → null
- modo_servicio: "pedido_entrega" si pide producto/entrega/para llevar; "servicio_montado" si pide barra/meseros en el evento; null si no aplica o no queda claro
- tipo_evento: tipo de evento si es cliente: "boda", "XV años", "cumpleaños", "corporativo", etc. (string o null)

Señales de PROVEEDOR (solo si OFRECE a Bodasesor): "les ofrezco", "soy proveedor de", "quiero venderles", "manejo X y busco clientes", "mi empresa ofrece", "distribuidor".
Señales de CLIENTE (pedir/comprar): "solicito cotización", "solicitud para cotización", "quiero cotizar", "necesito", "requiero servicio", "me das precio de", "cotización de café/banquete/evento".
REGLA CRÍTICA: mencionar una empresa (Saint-Gobain, etc.) o un producto (café gourmet) al PEDIR cotización = CLIENTE, no proveedor. Ante la duda → cliente.
NO uses correos de Bodasesor (capybaraeventos@gmail.com, bodasesor@gmail.com) como correo del cliente — esos son nuestros.

Ejemplo CLIENTE — "Me llamo Ana Pérez, quiero una boda para 100 personas":
{"tipo_contacto":"cliente","nombre":"Ana Pérez","empresa":null,"telefono":null,"correo":null,"presupuesto":null,"direccion_evento":null,"requerimientos_evento":null,"fecha_horario":null,"num_invitados":100,"tipo_evento":"boda","modo_servicio":null}

Ejemplo PROVEEDOR — "Hola, soy María López de Flores del Valle, ofrecemos arreglos florales para eventos":
{"tipo_contacto":"proveedor","nombre":"María López","empresa":"Flores del Valle","telefono":null,"correo":null,"presupuesto":null,"direccion_evento":null,"requerimientos_evento":"arreglos florales para eventos","fecha_horario":null,"num_invitados":null,"tipo_evento":null,"modo_servicio":null}

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
      modo_servicio:
        parsed.modo_servicio === "pedido_entrega" || parsed.modo_servicio === "servicio_montado"
          ? parsed.modo_servicio
          : null,
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
// ─── Return the next question for a field that is already captured (P1 guard) ──
// nextFieldQuestion lives in lucy-flow-guards.ts

// ─── Closing message template (sent to client when all 6 fields are collected) ─
const CLOSING_SIGNATURE = "Perfecto, ya tengo todo.";

function buildClosingMessage(
  serviciosPedidos: string | null | undefined,
  clientName?: string | null
): string {
  // Paquete multi-servicio: cierre + ofrecimiento final + link de catálogo.
  // Servicio único: cierre sobrio sin aventar hub (catálogo a petición).
  return buildStandardClosingMessage(serviciosPedidos, clientName);
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

function purgeDimensionAsUbicacion(
  mergedLines: string[],
  filledSet: Set<string>,
  extracted: ExtractedData
): void {
  const idx = mergedLines.findIndex((l) => /^-?\s*Lugar\/dirección del evento:/i.test(l));
  if (idx < 0) return;
  const value = mergedLines[idx]!
    .replace(/^-?\s*Lugar\/dirección del evento:\s*/i, "")
    .trim();
  if (!isDimensionText(value) && !isVagueVenueOnly(value)) return;
  mergedLines.splice(idx, 1);
  filledSet.delete("Lugar/dirección del evento");
  if (
    extracted.direccion_evento &&
    (isDimensionText(extracted.direccion_evento) || isVagueVenueOnly(extracted.direccion_evento))
  ) {
    extracted.direccion_evento = null;
  }
}

/** CRM con datos del embudo → no reiniciar con intro (A14924). */
function crmSuggestsOngoingConversation(filledLabels: Set<string>): boolean {
  return (
    filledLabels.has("Nombre del cliente") ||
    filledLabels.has("Correo electrónico") ||
    filledLabels.has("Tipo de evento") ||
    filledLabels.has("Requerimientos o servicios") ||
    filledLabels.has("Número de invitados") ||
    filledLabels.has("Lugar/dirección del evento") ||
    filledLabels.has("Fecha y horario")
  );
}

function purgeInvalidNombre(mergedLines: string[], filledSet: Set<string>, extracted: ExtractedData): void {
  const idx = mergedLines.findIndex((l) => /^-?\s*Nombre del cliente:/i.test(l));
  if (idx < 0) return;
  const raw = mergedLines[idx]!
    .replace(/^-?\s*Nombre del cliente:\s*/i, "")
    .trim();
  // Exigir sanitizeCrmNombre (no solo display): "Lucy Llamo Nicole" / "Llamo Nicole" salen.
  const cleaned = sanitizeCrmNombre(raw);
  if (cleaned && !isQuoteIntentMessage(raw)) {
    if (cleaned !== raw) {
      mergedLines[idx] = `- Nombre del cliente: ${cleaned}`;
      extracted.nombre = cleaned;
    }
    return;
  }
  mergedLines.splice(idx, 1);
  filledSet.delete("Nombre del cliente");
  const extractedClean = sanitizeCrmNombre(extracted.nombre);
  if (!extractedClean || isQuoteIntentMessage(extracted.nombre)) {
    extracted.nombre = null;
  } else {
    extracted.nombre = extractedClean;
  }
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
  const conversationText = collectUserTexts(fullHistory ?? history, currentMessage).join(" ");
  extracted = sanitizeExtractedFromExternal(extracted, conversationText);

  const mergedLines = [...sanitizeKommoCrmLines(crmLines)];
  const filledSet = new Set(mergedLines.map((l) => l.replace(/^- /, "").split(":")[0]?.trim() ?? ""));
  const historyFull = fullHistory ?? history;

  if (!filledSet.has("Nombre del cliente")) {
    const recoveredNombre = recoverClienteNombreFromHistory(historyFull, currentMessage);
    if (recoveredNombre) {
      mergedLines.push(`- Nombre del cliente: ${recoveredNombre}`);
      filledSet.add("Nombre del cliente");
      extracted.nombre = recoveredNombre;
    }
  }

  const lastAssistantEarly = [...historyFull]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  const lastAskedEarly = lastAssistantEarly
    ? inferLucyAskedField(lastAssistantEarly.content as string)
    : null;
  if (currentMessage && isAmbiguousShortNumber(currentMessage, { lastAskedField: lastAskedEarly })) {
    extracted.num_invitados = null;
  }

  if (extracted.presupuesto !== null && extracted.presupuesto !== undefined) {
    const validPres = collectUserTexts(historyFull, currentMessage)
      .map((t) => parsePresupuestoFromText(t))
      .find(Boolean);
    if (!validPres) extracted.presupuesto = null;
  }

  if (
    extracted.presupuesto !== null &&
    extracted.num_invitados !== null &&
    extracted.presupuesto === extracted.num_invitados &&
    extracted.presupuesto < 1000
  ) {
    extracted.presupuesto = null;
  }

  if (
    extracted.requerimientos_evento?.trim() &&
    extracted.tipo_evento?.trim() &&
    extracted.requerimientos_evento.trim().toLowerCase() === extracted.tipo_evento.trim().toLowerCase()
  ) {
    extracted.requerimientos_evento = null;
  }

  if (isServiceLabelNotTipoEvento(extracted.tipo_evento)) {
    if (!extracted.requerimientos_evento?.trim()) {
      extracted.requerimientos_evento = extracted.tipo_evento;
    }
    const tipoCrm = mergedLines
      .find((l) => /^-?\s*Tipo de evento:/i.test(l))
      ?.replace(/^-?\s*Tipo de evento:\s*/i, "")
      .trim();
    const tipoHist = parseTipoEventoFromText(collectUserTexts(historyFull, currentMessage).join(" "));
    const restored = tipoCrm && !isServiceLabelNotTipoEvento(tipoCrm) ? tipoCrm : tipoHist;
    extracted.tipo_evento = restored ?? null;
  }

  purgeInvalidNombre(mergedLines, filledSet, extracted);

  function purgeOwnCompanyEmailFromCrm(): void {
    const idx = mergedLines.findIndex((l) => /^-?\s*Correo electrónico:/i.test(l));
    if (idx < 0) return;
    const raw = mergedLines[idx]!
      .replace(/^-?\s*Correo electrónico:\s*/i, "")
      .trim();
    if (!isOwnCompanyEmail(raw)) return;
    mergedLines.splice(idx, 1);
    filledSet.delete("Correo electrónico");
    if (isOwnCompanyEmail(extracted.correo)) extracted.correo = null;
  }

  purgeOwnCompanyEmailFromCrm();

  // Nombre: extracción explícita, CRM o historial (cuando el cliente ya lo dijo)
  if (!filledSet.has("Nombre del cliente")) {
    const nombreVal =
      sanitizeCrmNombre(extracted.nombre) ??
      recoverClienteNombreFromHistory(historyFull, currentMessage);
    if (nombreVal) {
      mergedLines.push(`- Nombre del cliente: ${nombreVal}`);
      filledSet.add("Nombre del cliente");
      extracted.nombre = nombreVal;
    }
  } else {
    const idx = mergedLines.findIndex((l) => /^-?\s*Nombre del cliente:/i.test(l));
    if (idx >= 0) {
      const rawLine = mergedLines[idx]!;
      const existing = rawLine
        .replace(/^-?\s*Nombre del cliente:\s*/i, "")
        .replace(WHATSAPP_NOMBRE_NOTE, "")
        .trim();
      // Si el cliente acaba de decir nombre+apellido, ampliar el corto ya guardado.
      const presented =
        !!currentMessage &&
        /^\s*(?:soy|me\s+llamo|mi\s+nombre\s+es)\s+/i.test(currentMessage);
      const fromTurn =
        currentMessage && (lastAskedEarly === "nombre" || presented)
          ? sanitizeCrmNombre(stripNombrePresentationPrefix(currentMessage))
          : null;
      const upgraded = pickBetterNombre(
        pickBetterNombre(extracted.nombre, fromTurn),
        existing
      );
      if (upgraded && isNombreMoreComplete(upgraded, existing)) {
        const suffix = rawLine.includes(WHATSAPP_NOMBRE_NOTE) ? ` ${WHATSAPP_NOMBRE_NOTE}` : "";
        mergedLines[idx] = `- Nombre del cliente: ${upgraded}${suffix}`;
        extracted.nombre = upgraded;
      }
    }
  }

  // Correo: not a Kommo custom lead field — detect from extraction, DB, or history
  if (!filledSet.has("Correo electrónico") && !filledSet.has(EMAIL_WAIVED_LABEL)) {
    const correoFromHistory = collectUserTexts(historyFull, currentMessage)
      .map((t) => parseCorreoFromText(t))
      .map((e) => filterClientEmail(e))
      .find(Boolean);
    const correoFromCrm = mergedLines
      .map((l) => parseCorreoFromText(l))
      .map((e) => filterClientEmail(e))
      .find(Boolean);
    const correoVal =
      filterClientEmail(parseCorreoFromText(extracted.correo)) ??
      filterClientEmail(parseCorreoFromText(clientEmailFromDB)) ??
      correoFromHistory ??
      correoFromCrm ??
      null;
    if (correoVal) {
      mergedLines.push(`- Correo electrónico: ${correoVal}`);
      filledSet.add("Correo electrónico");
      extracted.correo = correoVal;
    }
  } else if (filledSet.has("Correo electrónico")) {
    const idx = mergedLines.findIndex((l) => /^-?\s*Correo electrónico:/i.test(l));
    const existingRaw =
      idx >= 0
        ? mergedLines[idx]!.replace(/^-?\s*Correo electrónico:\s*/i, "").trim()
        : "";
    const newCorreo =
      filterClientEmail(parseCorreoFromText(extracted.correo)) ??
      filterClientEmail(parseCorreoFromText(currentMessage)) ??
      null;
    if (newCorreo && (isOwnCompanyEmail(existingRaw) || newCorreo.toLowerCase() !== existingRaw.toLowerCase())) {
      if (idx >= 0) mergedLines[idx] = `- Correo electrónico: ${newCorreo}`;
      else mergedLines.push(`- Correo electrónico: ${newCorreo}`);
      filledSet.add("Correo electrónico");
      extracted.correo = newCorreo;
    }
  }

  // Merge any other fields newly extracted from the current message
  const lastAssistantForInv = [...historyFull]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  const lastAskedInv = lastAssistantForInv
    ? inferLucyAskedField(lastAssistantForInv.content as string)
    : null;

  const extractionMap: Array<{ label: string; value: string | number | null | undefined }> = [
    { label: "Lugar/dirección del evento", value: extracted.direccion_evento },
    { label: "Requerimientos o servicios", value: extracted.requerimientos_evento },
    { label: "Fecha y horario",            value: extracted.fecha_horario },
    {
      label: "Número de invitados",
      value: isAmbiguousShortNumber(currentMessage, { lastAskedField: lastAskedInv })
        ? null
        : extracted.num_invitados,
    },
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
        const asked = currentMessage ? inferLucyAskedField(
          history.filter((m) => m.role === "assistant").slice(-1)[0]?.content as string | undefined ?? ""
        ) : null;
        const fromMsg = currentMessage
          ? parsePresupuestoFromText(currentMessage, { askedField: asked })
          : null;
        if (fromMsg && !(extracted.num_invitados && extracted.num_invitados === value && Number(value) < 1000)) {
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

  // Sincroniza extracted.direccion_evento con el valor CRM (incluye afinado municipio).
  {
    const zonaLine = mergedLines.find((l) => /^-?\s*Lugar\/dirección del evento:/i.test(l));
    if (zonaLine) {
      const zonaVal = zonaLine.replace(/^-?\s*Lugar\/dirección del evento:\s*/i, "").trim();
      if (zonaVal && isUsableDireccionEvento(zonaVal)) {
        extracted.direccion_evento = zonaVal;
      }
    }
  }

  // Cotización genérica nunca debe quedar como requerimiento capturado.
  if (
    extracted.requerimientos_evento?.trim() &&
    !isValidRequerimientosValue(extracted.requerimientos_evento)
  ) {
    const idx = mergedLines.findIndex((l) => /^-?\s*Requerimientos o servicios:/i.test(l));
    if (idx >= 0) {
      const raw = mergedLines[idx]!.replace(/^-?\s*Requerimientos o servicios:\s*/i, "").trim();
      if (!isValidRequerimientosValue(raw)) {
        mergedLines.splice(idx, 1);
        filledSet.delete("Requerimientos o servicios");
      }
    }
    extracted.requerimientos_evento = null;
  }

  // Nombre de WhatsApp: solo si Lucy ya preguntó y el cliente nunca lo escribió
  applyWhatsappNombreFallback(filledSet, mergedLines, whatsappDisplayName, history);

  applyEmailWaiver(
    filledSet,
    mergedLines,
    collectUserTexts(historyFull, currentMessage)
  );

  applyPresupuestoWaiver(
    filledSet,
    mergedLines,
    collectUserTexts(historyFull, currentMessage),
    historyFull
  );

  purgeDimensionAsUbicacion(mergedLines, filledSet, extracted);

  appendSpaceDimensionsToRequerimientos(mergedLines, filledSet, historyFull, currentMessage);

  purgeRequerimientosIfAskingRecommendations(mergedLines, filledSet, extracted, currentMessage);

  const tipoIdx = mergedLines.findIndex((l) => /^-?\s*Tipo de evento:/i.test(l));
  const reqIdx = mergedLines.findIndex((l) => /^-?\s*Requerimientos o servicios:/i.test(l));
  if (tipoIdx >= 0 && reqIdx >= 0) {
    const tipo = mergedLines[tipoIdx]!.replace(/^-?\s*Tipo de evento:\s*/i, "").trim().toLowerCase();
    const req = mergedLines[reqIdx]!.replace(/^-?\s*Requerimientos o servicios:\s*/i, "").trim().toLowerCase();
    if (tipo && req === tipo) {
      mergedLines.splice(reqIdx, 1);
      filledSet.delete("Requerimientos o servicios");
      if (extracted.requerimientos_evento?.trim().toLowerCase() === tipo) {
        extracted.requerimientos_evento = null;
      }
    }
  }

  const allFieldsFilled = isReadyForClosing(filledSet);

  let context = "";
  if (mergedLines.length > 0) {
    const filledList = mergedLines.map((l) => `✓ ${l.replace(/^- /, "")}`).join("\n");
    context = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nESTADO ACTUAL — DATOS CAPTURADOS (NO VOLVER A PEDIR)\n━━━━━━━━━━━━━━━━━━━━━━━━\n${filledList}`;
  }
  if (allFieldsFilled && mergedLines.length > 0) {
    context += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nESTADO COMPLETO — aplica cierre (sección 7 del prompt).\n━━━━━━━━━━━━━━━━━━━━━━━━`;
  } else if (mergedLines.length > 0) {
    const missing = [
      ...CLOSING_CORE_FIELDS.filter((f) => !filledSet.has(f)),
      ...(!isEmailSatisfied(filledSet) ? ["Correo electrónico (opcional — intentar, no bloquear)"] : []),
    ];
    if (missing.length) {
      context += `\n\nESTADO ACTUAL — FALTA: ${missing.join(", ")} — pregunta SOLO el primero. NUNCA repitas un dato ✓ de arriba.`;
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

    // Lead name (contact name hint) — skip generic CRM placeholders, phones y nombres del equipo
    if (data.name) {
      const stripped = data.name.replace(/^Lead:\s*/i, "").trim();
      if (!isPlaceholderLeadName(stripped) && !isStaffAdvisorName(stripped)) {
        lines.push(`- Nombre del cliente: ${stripped}`);
      }
    }

    for (const field of cfv) {
      // 1048786 = resumen interno para el equipo (buildResumenClienteLargo), NO el mensaje WhatsApp.
      // No usarlo como memoria de Lucy — ver resolveEffectiveLastLucyResponse().
      if (field.field_id === FIELD.respuesta_ia_largo) continue;

      const label = FIELD_NAME[field.field_id];
      if (!label) continue;
      const val = field.values[0]?.value;
      if (val === null || val === undefined || val === "") continue;

      lines.push(`- ${label}: ${val}`);
    }

    return { crmLines: sanitizeKommoCrmLines(lines), lastLucyResponse: null };
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
  extracted: ExtractedData,
  mergedLines: string[],
  conversationText?: string
): Record<string, unknown> {
  const customFields: Array<{ field_id: number; values: Array<{ value: unknown }> }> = [];

  // Campo texto largo (1048786) — resumen ejecutivo para Alejandro / equipo
  const resumenLargo = buildResumenClienteLargo(extracted, mergedLines, conversationText);
  customFields.push({
    field_id: FIELD.respuesta_ia_largo,
    values: [{ value: resumenLargo }],
  });

  // Solo campos CRM con valor real. Preferimos el valor ya confirmado en
  // mergedLines sobre la extracción de este turno para campos core — evita
  // que un mensaje corto ("Fiesta dinámica", "Show en vivo") contamine
  // Tipo de evento / Ubicación / Requerimientos ya capturados.
  const direccionForCrm =
    crmStoredValue(mergedLines, "Lugar/dirección del evento") ?? extracted.direccion_evento;
  if (isValidExtractedString(direccionForCrm))
    customFields.push({ field_id: FIELD.direccion_evento, values: [{ value: cap255(direccionForCrm) }] });

  const reqStored = crmStoredValue(mergedLines, "Requerimientos o servicios");
  const reqForCrm =
    reqStored ?? (conversationText ? generateSummary(conversationText) : extracted.requerimientos_evento);
  if (isValidExtractedString(reqForCrm) && reqForCrm !== "Info pendiente")
    customFields.push({ field_id: FIELD.requerimientos_evento, values: [{ value: cap255(reqForCrm) }] });
  if (isValidExtractedString(extracted.fecha_horario))
    customFields.push({ field_id: FIELD.fecha_horario, values: [{ value: cap255(extracted.fecha_horario) }] });
  if (extracted.num_invitados !== null && extracted.num_invitados > 0)
    customFields.push({ field_id: FIELD.num_invitados, values: [{ value: String(extracted.num_invitados) }] });

  const tipoEventoForCrm = crmStoredValue(mergedLines, "Tipo de evento") ?? extracted.tipo_evento;
  if (isValidExtractedString(tipoEventoForCrm))
    customFields.push({ field_id: FIELD.tipo_evento, values: [{ value: cap255(tipoEventoForCrm) }] });

  const presLine = mergedLines.find((l) => /^-?\s*Presupuesto \(MXN\):/i.test(l));
  if (presLine) {
    const presText = presLine.replace(/^-?\s*Presupuesto \(MXN\):\s*/i, "").trim();
    const presNum = parseInt(presText.replace(/[^\d]/g, ""), 10);
    if (!isNaN(presNum) && presNum >= 1000 && /^\$?[\d,.\s]+(k|mxn)?$/i.test(presText.replace(/\s/g, ""))) {
      customFields.push({ field_id: FIELD.presupuesto, values: [{ value: String(presNum) }] });
    } else if (presText) {
      customFields.push({ field_id: FIELD.presupuesto, values: [{ value: cap255(presText) }] });
    }
  } else if (extracted.presupuesto !== null && extracted.presupuesto > 0) {
    customFields.push({ field_id: FIELD.presupuesto, values: [{ value: String(extracted.presupuesto) }] });
  }

  const payload: Record<string, unknown> = { custom_fields_values: customFields };

  if (isValidExtractedString(extracted.nombre)) {
    const currentNombre = parseNombreFromCrmLines(mergedLines);
    const nombrePatch =
      sanitizeCrmNombre(extracted.nombre) ?? sanitizeDisplayName(extracted.nombre) ?? extracted.nombre;
    if (shouldUpdateName(currentNombre ?? undefined, nombrePatch)) {
      payload["name"] = cap255(nombrePatch);
    }
  }

  return payload;
}

/**
 * PATCH solo con campos que el cliente acaba de cambiar en este mensaje.
 * Preferimos el valor nuevo (no el CRM viejo) para dirección/fecha/etc.
 */
function buildSilentWatchPatchPayload(
  text: string,
  extracted: ExtractedData
): Record<string, unknown> | null {
  const customFields: Array<{ field_id: number; values: Array<{ value: unknown }> }> = [];

  const zona = parseZonaFromText(text);
  const direccion =
    (zona && isUsableDireccionEvento(zona) ? zona : null) ||
    (extracted.direccion_evento && isUsableDireccionEvento(extracted.direccion_evento)
      ? extracted.direccion_evento
      : null);
  if (direccion && (zona || /\b(direcci[oó]n|ubicaci[oó]n|colonia|en\s+)/i.test(text))) {
    customFields.push({ field_id: FIELD.direccion_evento, values: [{ value: cap255(direccion) }] });
  }

  const fecha = parseFechaFromText(text) || extracted.fecha_horario;
  if (fecha && (parseFechaFromText(text) || /\b(fecha|horario|hora|el\s+\d)/i.test(text))) {
    customFields.push({ field_id: FIELD.fecha_horario, values: [{ value: cap255(fecha) }] });
  }

  const invRaw = parseInvitadosFromText(text);
  const invitados = invRaw ? parseInt(invRaw, 10) : extracted.num_invitados;
  if (invitados && invitados > 0 && (invRaw || /\b(invitados?|personas?|pax)\b/i.test(text))) {
    customFields.push({ field_id: FIELD.num_invitados, values: [{ value: String(invitados) }] });
  }

  const tipo = parseTipoEventoFromText(text) || extracted.tipo_evento;
  if (tipo && (parseTipoEventoFromText(text) || /\b(boda|xv|cumple|corporativo|evento)\b/i.test(text))) {
    customFields.push({ field_id: FIELD.tipo_evento, values: [{ value: cap255(tipo) }] });
  }

  const services = parseServicesFromText(text);
  if (services.length > 0) {
    const merged = mergeServiceRequirements(extracted.requerimientos_evento, text, 6);
    if (merged) {
      customFields.push({
        field_id: FIELD.requerimientos_evento,
        values: [{ value: cap255(merged) }],
      });
    }
  }

  if (customFields.length === 0) return null;
  return { custom_fields_values: customFields };
}

/**
 * Lucy en silencio (Humano Trabaja / Cotización / seguimientos):
 * 1) Siempre lee el chat y actualiza CRM si hay cambios de datos.
 * 2) Solo escribe si el cliente pide contacto/ayuda de emergencia → teléfonos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLucyInactiveInbound(opts: {
  entityId: string | number;
  chatId: string;
  talkId: string | null;
  text: string;
  subdomain: string;
  accessToken: string;
  statusId?: number;
  log: any;
}): Promise<"emergency_sent" | "watched"> {
  const { entityId, chatId, talkId, text, subdomain, accessToken, log } = opts;

  void captureInboundWhileLucyInactive({
    kommoLeadId: String(entityId),
    chatId,
    talkId,
    text,
    subdomain,
    accessToken,
  }).catch((err: unknown) => log.warn({ err, entityId }, "Captura en fase humana falló"));

  // Actualizar CRM en silencio si el cliente cambió un dato.
  try {
    const { crmLines } = await fetchLeadCurrentFields(subdomain, accessToken, entityId, log);
    const histKey = String(entityId);
    const fullHistory = getHistory(histKey);
    const { extracted } = await prepareLucyExtraction({
      fullHistory,
      messageText: text,
      crmLines,
      extractFn: extractData,
    });
    const silentPayload = buildSilentWatchPatchPayload(text, extracted);
    if (silentPayload) {
      const patchController = new AbortController();
      const patchTimer = setTimeout(() => patchController.abort(), 12_000);
      try {
        const updateRes = await fetch(
          `https://${subdomain}.kommo.com/api/v4/leads/${entityId}`,
          {
            method: "PATCH",
            signal: patchController.signal,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(silentPayload),
          }
        );
        const n = (silentPayload["custom_fields_values"] as unknown[]).length;
        if (updateRes.ok) {
          log.info({ entityId, fieldsUpdated: n }, "Embudo: Lucy en silencio actualizó datos CRM");
          void agregarNota(
            subdomain,
            accessToken,
            entityId,
            `Lucy (silencio): actualicé ${n} dato(s) del chat mientras el lead está con el equipo.`
          ).catch(() => undefined);
        } else {
          log.warn({ entityId, status: updateRes.status }, "Embudo: PATCH silencio falló");
        }
      } finally {
        clearTimeout(patchTimer);
      }
    }
  } catch (err) {
    log.warn({ err, entityId }, "Embudo: vigilancia silenciosa falló (no crítico)");
  }

  // Única escritura permitida en silencio: contactos de emergencia.
  if (!clientNeedsEmergencyContact(text)) {
    return "watched";
  }

  const emergencyMsg = buildEmergencyContactAnswer();
  const entityKey = String(entityId);
  let whatsappPhone = phoneCache.get(entityKey) ?? null;
  if (!whatsappPhone) {
    whatsappPhone = await fetchContactPhone(subdomain, accessToken, entityId);
    if (whatsappPhone) phoneCache.set(entityKey, whatsappPhone);
  }

  const channel = await deliverLucyOutbound({
    subdomain,
    accessToken,
    talkId,
    chatId,
    whatsappPhone,
    texto: emergencyMsg,
    entityId,
  });

  if (channel !== "failed") {
    appendHistory(entityKey, text, emergencyMsg);
    lastResponseCache.set(entityKey, emergencyMsg);
    void agregarNota(
      subdomain,
      accessToken,
      entityId,
      "Lucy (excepción emergencia): envié teléfonos de contacto al cliente."
    ).catch(() => undefined);
    log.info({ entityId, channel }, "Embudo: excepción emergencia — teléfonos enviados");
    return "emergency_sent";
  }

  log.warn({ entityId }, "Embudo: excepción emergencia — no se pudo enviar");
  return "watched";
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
            "Embudo: Lucy en silencio — vigila chat, actualiza datos; solo escribe en emergencia"
          );
          await handleLucyInactiveInbound({
            entityId,
            chatId,
            talkId,
            text: combinedUserText,
            subdomain,
            accessToken,
            statusId: leadKommo.status_id,
            log,
          });
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
    } else if (talkId || chatId) {
      // Persistir talk/chat en cada inbound — sin esto el cron de aprendizaje no sincroniza.
      const patch: { kommoTalkId?: string; kommoChatId?: string; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (talkId && talkId !== conversation.kommoTalkId) patch.kommoTalkId = talkId;
      if (chatId && chatId !== conversation.kommoChatId) patch.kommoChatId = chatId;
      if (patch.kommoTalkId || patch.kommoChatId) {
        await db
          .update(conversations)
          .set(patch)
          .where(eq(conversations.id, conversation.id));
        conversation = { ...conversation, ...patch };
      }
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

    const effectiveLastResponse = resolveEffectiveLastLucyResponse({
      entityId,
      fullHistory,
      cachedResponse: lastResponseCache.get(String(entityId)),
      crmFieldValue: lastLucyResponse,
    });

    // True solo cuando Lucy NUNCA ha respondido a este lead.
    let isFirstInteraction = !hasAssistantMsg && !effectiveLastResponse;

    if (!hasAssistantMsg && effectiveLastResponse) {
      history = [...history, { role: "assistant", content: effectiveLastResponse }];
      const recoverySource = lastResponseCache.has(String(entityId)) ? "cache-recovery" : "history-recovery";
      historySource = historySource === "file" ? recoverySource : `${historySource}+${recoverySource}`;
    }

    log.info({ historyLength: history.length, historySource, crmLinesCount: crmLines.length }, "Context loaded");

    // ══════════════════════════════════════════════════════════════════════
    // PASO 5: Extracción de datos (pipeline unificado)
    // ══════════════════════════════════════════════════════════════════════
    const { extracted, conversationText } = await prepareLucyExtraction({
      fullHistory,
      messageText: combinedUserText,
      crmLines,
      extractFn: extractData,
    });

    if (extracted.tipo_contacto === "proveedor" && extracted.requerimientos_evento) {
      log.info({ resumenProv: extracted.requerimientos_evento }, "Resumen proveedor generado");
    }

    const cierreYaEnviado = detectCierreEnviado(fullHistory, effectiveLastResponse);

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

    // Si el CRM ya tiene progreso, nunca tratar como primer contacto (A14924 reinicio).
    if (isFirstInteraction && crmSuggestsOngoingConversation(filledLabels)) {
      isFirstInteraction = false;
      log.info({ filled: [...filledLabels] }, "Not first interaction — CRM already has progress");
    }

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

    const messageCount = conversation.messageCount + 1;
    const conversationAgeHours =
      (Date.now() - new Date(conversation.createdAt).getTime()) / (1000 * 60 * 60);

    log.info({ score: leadScore.total, priority: leadScore.priority, stage }, "Lead scoring complete");

    let prependToAiResponse: string | undefined;
    if (batch.isVoice || batch.isImage) {
      const clientName =
        sanitizeDisplayName(extracted.nombre) ??
        whatsappDisplayName ??
        sanitizeDisplayName(conversation.clientName) ??
        undefined;
      prependToAiResponse = batch.isVoice
        ? getVoiceAcknowledgment(clientName ?? undefined)
        : undefined; // Imágenes: respuesta accionable en guards (sin "Ya vi tu imagen" + descripción)
      log.info(
        { ack: prependToAiResponse, isVoice: batch.isVoice, isImage: batch.isImage },
        "Media acknowledgment prepended"
      );
    }

    const cierreYaEnviadoForGuards = cierreYaEnviado;

    const { mensajeParaCliente, aiResponse } = await generateLucyOutbound({
      messageText: combinedUserText,
      history,
      fullHistory,
      extracted,
      crmContext,
      crmMergedLines,
      filledLabels,
      allFieldsFilled,
      isFirstInteraction,
      cierreYaEnviado: cierreYaEnviadoForGuards,
      whatsappDisplayName,
      conversationText,
      openai,
      buildClosing: buildClosingMessage,
      entityId,
      messageCount,
      conversationAgeHours,
      prependToAiResponse,
      log,
    });

    log.info({ aiResponse, extracted }, "OpenAI response received");

    if (cierreYaEnviado && combinedUserText.trim()) {
      const updatedReq = appendPostCierreRequirements(
        extracted.requerimientos_evento,
        combinedUserText
      );
      if (updatedReq && updatedReq !== extracted.requerimientos_evento) {
        extracted.requerimientos_evento = updatedReq;
        log.info({ entityId, requerimientos: updatedReq }, "Post-cierre: requerimientos actualizados en CRM");
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PASO 8.8: Lead calificado — datos ya van en campos CRM + resumen 1048786.
    // No duplicar con nota "DATOS DEL CLIENTE" en timeline.
    // ══════════════════════════════════════════════════════════════════════
    if (allFieldsFilled && !cierreYaEnviado) {
      log.info({ entityId }, "Lead calificado — campos CRM y resumen 1048786 actualizados (sin nota duplicada)");
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

    void recordKnowledgeGapIfNeeded({
      kommoLeadId: entityId,
      clientMessage: combinedUserText,
      lucyResponse: mensajeParaCliente,
      contextSnippet: conversationText.slice(-400),
    });

    // ══════════════════════════════════════════════════════════════════════
    // PASO 14: Meta API al cliente + nota en timeline de Kommo (Talks POST no envía en cuentas estándar).
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

      const channel = await deliverLucyOutbound({
        subdomain,
        accessToken,
        talkId,
        chatId,
        whatsappPhone,
        texto: mensajeParaCliente,
        entityId,
      });
      if (channel === "failed") {
        log.error({ entityId, talkId, whatsappPhone }, "Mensaje de Lucy no pudo enviarse ❌");
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PASO 15: PATCH a Kommo — campos CRM + resumen texto largo (1048786)
    // El lead NO se mueve de etapa — Alejandro lo mueve manualmente.
    // ══════════════════════════════════════════════════════════════════════
    const payload = buildPatchPayload(
      withCrmNombre(extracted, crmMergedLines),
      crmMergedLines,
      conversationText
    );
    const cfvToSend = payload["custom_fields_values"] as Array<{ field_id: number; values: Array<{ value: unknown }> }>;

    log.info(
      { entityId, leadName: payload["name"] ?? "(sin cambio)", fieldsUpdated: cfvToSend.length },
      "Sending PATCH a Kommo (campos CRM + resumen texto largo 1048786)"
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

// ─── Diagnóstico Kommo (sin exponer tokens) ───────────────────────────────────
router.get("/kommo/status", async (_req, res) => {
  const subdomain = getKommoSubdomain();
  const accessToken = getKommoAccessToken();

  if (!isKommoConfigured()) {
    res.status(503).json({
      ok: false,
      kommo_configured: false,
      kommo_subdomain: subdomain || null,
      error: "Faltan KOMMO_SUBDOMAIN y/o KOMMO_ACCESS_TOKEN (o alias KOMMO_TOKEN_LARGA_DURACION / SUBDOMINIO_KOMMO)",
    });
    return;
  }

  try {
    const r = await fetch(`https://${subdomain}.kommo.com/api/v4/account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const text = await r.text();
    let account: { name?: string; subdomain?: string } | null = null;
    try {
      account = JSON.parse(text) as { name?: string; subdomain?: string };
    } catch {
      account = null;
    }

    if (!r.ok) {
      res.status(502).json({
        ok: false,
        kommo_configured: true,
        kommo_subdomain: subdomain,
        kommo_api: "error",
        http_status: r.status,
        hint: r.status === 401 ? "Token inválido o expirado — revisa KOMMO_TOKEN_LARGA_DURACION" : "Revisa subdominio y permisos del token",
      });
      return;
    }

    res.json({
      ok: true,
      kommo_configured: true,
      kommo_subdomain: subdomain,
      kommo_api: "connected",
      account_name: account?.name ?? null,
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      kommo_configured: true,
      kommo_subdomain: subdomain,
      kommo_api: "unreachable",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// ─── Webhook route ────────────────────────────────────────────────────────────
// Kommo valida la URL con GET/HEAD antes de guardar el webhook.
router.get("/kommo/webhook", (_req, res) => {
  res.json({ ok: true, service: "lucy-kommo-webhook" });
});

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

  if (firstMessage && !isIncomingClientMessage(firstMessage as unknown as Record<string, unknown>)) {
    log.info({ entityId, chatId, type: firstMessage.type }, "Webhook ignorado — mensaje saliente o interno");
    res.status(200).json({ ok: true, skipped: "outgoing_or_internal" });
    return;
  }

  const dedupKey = firstMessage
    ? webhookMessageKey(firstMessage as unknown as Record<string, unknown>)
    : null;
  if (dedupKey && isDuplicateWebhookMessage(dedupKey)) {
    log.info({ dedupKey, entityId, chatId }, "Webhook duplicado ignorado — sin Vision ni nota");
    res.status(200).json({ ok: true, skipped: "duplicate_message" });
    return;
  }
  if (dedupKey) markWebhookMessageProcessed(dedupKey);

  // Resolve text: transcribes audio via Whisper (nota de voz) or analiza la
  // imagen con Vision cuando el mensaje trae un attachment de ese tipo.
  const messageData = firstMessage
    ? await processMessage(firstMessage as unknown as Record<string, unknown>, accessToken, log)
    : { text: "", isVoice: false, isImage: false, mediaNote: null };
  const text = messageData.text.trim();
  const isVoice = messageData.isVoice;
  const isImage = messageData.isImage;

  log.info(
    {
      text: isVoice ? `[voz] ${text.slice(0, 80)}` : isImage ? `[imagen] ${text.slice(0, 80)}` : text,
      entityId,
      chatId,
      talkId,
      isVoice,
      isImage,
    },
    "Kommo webhook received"
  );

  // Nota interna en Kommo con la transcripción/descripción — visible para el
  // equipo humano aunque no abran el audio/imagen desde WhatsApp.
  if (messageData.mediaNote && entityId && subdomain && accessToken) {
    const label = isVoice
      ? "Nota de voz (transcripción automática)"
      : "Foto del cliente — respuesta de Lucy (ref. equipo, no es el resumen del chat)";
    void agregarNota(subdomain, accessToken, entityId, `${label}:\n\n${messageData.mediaNote}`).catch(
      (err: unknown) => log.warn({ err, entityId }, "No se pudo agregar nota interna de media")
    );
  }

  if (!text || !chatId || !entityId) {
    // Log the full raw message so we can diagnose unrecognized voice/media structures
    if (firstMessage && !text) {
      log.warn(
        { rawMessage: firstMessage },
        "Webhook recibido con texto vacío — posible nota de voz/imagen no detectada o tipo de media no soportado"
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
    existing.isImage = existing.isImage || isImage; // sticky: if any message in batch was an image
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

    const batch: PendingBatch = { texts: [text], entityId, chatId, talkId, subdomain, isVoice, isImage, timer };
    pendingBatches.set(chatId, batch);
    log.info({ chatId, debounceMs: DEBOUNCE_MS, isVoice, isImage }, "New batch started, waiting for more messages");
  }
});

// ─── Salesbot webhook route (synchronous — Kommo waits for response) ──────────
// Configure in Kommo Salesbot: action "Llamar webhook" → POST /api/kommo/salesbot
// Kommo sends the trigger payload and waits for a JSON response.
// Lucy processes the message, returns the reply, and Salesbot dispatches it via WhatsApp.
router.get("/kommo/salesbot", (_req, res) => {
  res.json({ ok: true, service: "lucy-kommo-salesbot" });
});

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
    log.warn(
      { entityId },
      "DEPRECATED: /kommo/salesbot — desactivar SalesBot en Kommo; usar webhook directo"
    );

    // ── Load history (misma clave que webhook: entityId, no chatId) ───────────
    const histKey = entityId ? String(entityId) : (chatId ?? "salesbot-default");
    let fullHistory: OpenAI.Chat.ChatCompletionMessageParam[] = getHistory(histKey);
    let historySource = "file";

    if (talkId && fullHistory.length === 0) {
      try {
        const kommoHistory = await fetchKommoHistory(subdomain, accessToken, talkId);
        if (kommoHistory && kommoHistory.length > 0) {
          const toExclude = new Set([messageText.trim()]);
          fullHistory = kommoHistory.filter(
            (m) => !(m.role === "user" && typeof m.content === "string" && toExclude.has(m.content.trim()))
          );
          historySource = "kommo-bootstrap";
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
    let salesbotFilledLabels = new Set<string>();
    if (entityId) {
      try {
        const fields = await fetchLeadCurrentFields(subdomain, accessToken, entityId, log);
        crmLines = fields.crmLines;
      } catch {
        log.warn("Salesbot: could not load CRM context");
      }
    }

    const hasAssistantMsg = history.some((m) => m.role === "assistant");
    const effectiveLastResponse = resolveEffectiveLastLucyResponse({
      entityId,
      fullHistory,
      cachedResponse: entityId ? lastResponseCache.get(String(entityId)) : null,
      crmFieldValue: null,
    });
    let isFirstInteraction = !hasAssistantMsg && !effectiveLastResponse;

    if (!hasAssistantMsg && effectiveLastResponse) {
      history = [...history, { role: "assistant", content: effectiveLastResponse }];
    }

    const whatsappDisplayName = entityId
      ? await resolveWhatsappDisplayName(subdomain, accessToken, entityId, null)
      : null;

    const { extracted, conversationText } = await prepareLucyExtraction({
      fullHistory,
      messageText,
      crmLines,
      extractFn: extractData,
    });

    const sbCierreYaEnviado = detectCierreEnviado(fullHistory, effectiveLastResponse);

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
    if (isFirstInteraction && crmSuggestsOngoingConversation(salesbotFilledLabels)) {
      isFirstInteraction = false;
    }

    log.info({ isFirstInteraction, messageText, historyLength: history.length }, "Salesbot: llamando OpenAI");

    const { mensajeParaCliente, aiResponse } = await generateLucyOutbound({
      messageText,
      history,
      fullHistory,
      extracted,
      crmContext,
      crmMergedLines: salesbotMergedLines,
      filledLabels: salesbotFilledLabels,
      allFieldsFilled: salesbotAllFieldsFilled,
      isFirstInteraction,
      cierreYaEnviado: sbCierreYaEnviado,
      whatsappDisplayName,
      conversationText,
      openai,
      buildClosing: buildClosingMessage,
      entityId,
      log,
    });

    log.info({ aiResponse, extracted, isFirstInteraction }, "Salesbot: OpenAI response");

    // Guardar mensaje REAL enviado (no aiResponse) para que cierreYaEnviado funcione.
    appendHistory(histKey, messageText, mensajeParaCliente);
    if (entityId) {
      lastResponseCache.set(String(entityId), mensajeParaCliente);
    }

    void recordKnowledgeGapIfNeeded({
      kommoLeadId: entityId,
      clientMessage: messageText,
      lucyResponse: mensajeParaCliente,
      contextSnippet: conversationText.slice(-400),
    });

    // ── Enviar mensaje al chat de Kommo (no como nota) ───────────────────────
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

      const channel = await deliverLucyOutbound({
        subdomain,
        accessToken,
        talkId,
        chatId,
        whatsappPhone: sbPhone,
        texto: mensajeParaCliente,
        entityId,
      });
      if (channel === "failed") {
        log.error({ entityId, talkId, sbPhone }, "Salesbot: mensaje no enviado ❌");
      }

      // ── Update CRM fields + resumen texto largo ───────────────────────────
      const patchPayload = buildPatchPayload(extracted, salesbotMergedLines, conversationText);
      void fetch(`https://${subdomain}.kommo.com/api/v4/leads/${entityId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(patchPayload),
      }).then(async (r) => {
        if (!r.ok) {
          const t = await r.text();
          log.error({ status: r.status, err: t }, "Salesbot: lead PATCH failed");
        } else {
          log.info({ entityId }, "Salesbot: lead PATCH ok (CRM + resumen largo)");
        }
      });
    }

    // ── Respuesta al Salesbot ─────────────────────────────────────────────────
    // No incluimos `message` en el callback: el mensaje ya fue enviado directamente
    // via Meta API. Devolver `message` aquí causaría un duplicado si el SalesBot
    // sigue activo en la configuración de Kommo.
    res.json({ status: "success", deprecated: true, note: "Usar webhook directo; desactivar SalesBot en Kommo" });
  } catch (err) {
    log.error({ err }, "Salesbot: processing error");
    res.status(500).json({ error: "processing_failed" });
  }
});

// ─── Pipeline-change webhook (cuando Alejandro mueve a Cotización Realizada) ────
// Configurar en Kommo → Webhooks → Evento: "Lead status changed"
// URL: POST /api/kommo/pipeline-change
router.get("/kommo/pipeline-change", (_req, res) => {
  res.json({ ok: true, service: "lucy-kommo-pipeline-change" });
});

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

  // Si Alejandro movió manualmente a "Humano Trabaja" → limpiar campo 1048786
  // (campo legacy — mantenido por compatibilidad, Lucy ya no lo usa para enviar).
  if (newStatusId === ETAPA.HUMANO_TRABAJA) {
    const subdomain = process.env["KOMMO_SUBDOMAIN"]?.trim().replace(/\s+/g, "").toLowerCase() ?? "";
    const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";
    try {
      await limpiarCampoRespuesta(subdomain, accessToken, leadId);
      await setLearningPhase(leadId, "human_active");
      // Sync + extracción: leer el chat humano y proponer aprendizajes (throttled).
      void syncHumanPhaseLead(subdomain, accessToken, leadId, { extract: true }).catch((err) =>
        log.warn({ err, leadId }, "Pipeline-change: sync aprendizaje falló")
      );
      log.info({ leadId }, "Pipeline-change: fase humana — sync + extracción de aprendizaje");
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
    return { crmLines: sanitizeKommoCrmLines(lines), lastLucyResponse };
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
  const nombreLead = sanitizeCrmNombre(lead.name) ?? sanitizeDisplayName(lead.name);
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

  return { crmLines: sanitizeKommoCrmLines(lines), lastLucyResponse };
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
  // Preferimos el valor ya confirmado en mergedLines sobre la extracción de
  // este turno para campos core — mismo criterio que buildPatchPayload,
  // evita contaminar Tipo de evento / Ubicación / Requerimientos ya capturados.
  const direccionForCf = crmStoredValue(mergedLines, "Lugar/dirección del evento") ?? extracted.direccion_evento;
  if (isValidExtractedString(direccionForCf)) fields.cf_direccion = direccionForCf;
  const reqForCf = crmStoredValue(mergedLines, "Requerimientos o servicios") ?? extracted.requerimientos_evento;
  if (isValidExtractedString(reqForCf)) fields.cf_requerimiento = reqForCf;
  const fechaForCf = crmStoredValue(mergedLines, "Fecha y horario") ?? extracted.fecha_horario;
  if (isValidExtractedString(fechaForCf)) fields.cf_fecha_horario = fechaForCf;
  const invLine = crmStoredValue(mergedLines, "Número de invitados");
  if (invLine && /^\d+$/.test(invLine.trim())) {
    fields.cf_num_invitados = parseInt(invLine.trim(), 10);
  } else if (extracted.num_invitados !== null && extracted.num_invitados > 0) {
    fields.cf_num_invitados = extracted.num_invitados;
  }
  const tipoEventoForCf = crmStoredValue(mergedLines, "Tipo de evento") ?? extracted.tipo_evento;
  if (isValidExtractedString(tipoEventoForCf)) fields.cf_tipo_evento = tipoEventoForCf;
  const presLine = mergedLines.find((l) => /^-?\s*Presupuesto \(MXN\):/i.test(l));
  if (presLine) {
    fields.cf_presupuesto = presLine.replace(/^-?\s*Presupuesto \(MXN\):\s*/i, "").trim();
  } else if (extracted.presupuesto !== null && extracted.presupuesto !== undefined) {
    fields.cf_presupuesto = String(extracted.presupuesto);
  }
  // Nombre / correo de contacto (espejo de lo que Kommo muestra arriba del lead).
  const nombreCf = crmStoredValue(mergedLines, "Nombre del cliente") ?? extracted.nombre;
  if (isValidExtractedString(nombreCf)) fields.cf_nombre = nombreCf;
  const correoCf = crmStoredValue(mergedLines, "Correo electrónico") ?? extracted.correo;
  if (isValidExtractedString(correoCf)) fields.cf_correo = correoCf;
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
    const effectiveLastResponse = resolveEffectiveLastLucyResponse({
      entityId: leadId,
      fullHistory,
      cachedResponse: lastResponseCache.get(`sim-${leadId}`),
      crmFieldValue: lastLucyResponse,
    });
    let isFirstInteraction = !hasAssistantMsg && !effectiveLastResponse;

    if (!hasAssistantMsg && effectiveLastResponse) {
      history = [...history, { role: "assistant", content: effectiveLastResponse }];
    }

    const { extracted, conversationText } = await prepareLucyExtraction({
      fullHistory,
      messageText,
      crmLines,
      extractFn: extractData,
    });
    extracted.nombre = sanitizeCrmNombre(extracted.nombre) ?? sanitizeDisplayName(extracted.nombre);

    const simCierreYaEnviado = detectCierreEnviado(fullHistory, effectiveLastResponse);

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
    if (isFirstInteraction && crmSuggestsOngoingConversation(filledLabels)) {
      isFirstInteraction = false;
    }

    const { mensajeParaCliente } = await generateLucyOutbound({
      messageText,
      history,
      fullHistory,
      extracted,
      crmContext,
      crmMergedLines,
      filledLabels,
      allFieldsFilled,
      isFirstInteraction,
      cierreYaEnviado: simCierreYaEnviado,
      whatsappDisplayName,
      conversationText,
      openai,
      buildClosing: buildClosingMessage,
      entityId: leadId,
      log,
    });

    appendHistory(histKey, messageText, mensajeParaCliente);
    lastResponseCache.set(histKey, mensajeParaCliente);

    void recordKnowledgeGapIfNeeded({
      kommoLeadId: leadId,
      clientMessage: messageText,
      lucyResponse: mensajeParaCliente,
      contextSnippet: conversationText.slice(-400),
    });

    const fields = mapExtractedToSimulatorFields(extracted, mensajeParaCliente, crmMergedLines);
    const stage_id = suggestSimulatorStage(messageText, allFieldsFilled, lead.stage_id);

    const lead_updates: Record<string, string> = {};
    const currentLeadName = sanitizeCrmNombre(lead.name);
    if (isValidExtractedString(extracted.nombre)) {
      const incomingNombre = sanitizeCrmNombre(extracted.nombre) ?? extracted.nombre;
      if (shouldUpdateName(currentLeadName ?? undefined, incomingNombre)) {
        lead_updates.name = incomingNombre;
      }
    } else if (whatsappDisplayName && shouldUpdateName(currentLeadName ?? undefined, whatsappDisplayName)) {
      lead_updates.name = whatsappDisplayName;
    }
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
      extracted: {
        tipo_contacto: extracted.tipo_contacto,
        nombre: extracted.nombre,
        correo: extracted.correo,
        telefono: extracted.telefono,
        tipo_evento: extracted.tipo_evento,
        requerimientos_evento: extracted.requerimientos_evento,
        num_invitados: extracted.num_invitados,
        direccion_evento: extracted.direccion_evento,
        fecha_horario: extracted.fecha_horario,
        presupuesto: extracted.presupuesto,
        modo_servicio: extracted.modo_servicio,
        empresa: extracted.empresa,
      },
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

router.get("/kommo/simulator/auto-clients", async (_req: Request, res: Response) => {
  try {
    res.json({
      status: "success",
      clients: AUTO_CLIENTS.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        leadId: c.leadId,
        scenario: c.scenario,
        observe: c.observe,
      })),
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/kommo/simulator/auto-client", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const clientId = body.client_id ?? body.id;
  const useJudge = body.use_judge !== false;

  if (!isOpenAiConfigured()) {
    res.status(200).json({
      status: "error",
      error: "missing_openai_key",
      reply: "Lucy y el cliente auto requieren OPEN_AI en el servidor.",
    });
    return;
  }

  try {
    const client = getClientById(clientId);
    if (!client) {
      res.status(400).json({ status: "error", error: "unknown_client", client_id: clientId });
      return;
    }

    const base =
      (typeof body.base_url === "string" && body.base_url.trim()) || resolveLucyPublicBase(req);

    req.log.info({ clientId: client.id, name: client.name }, "Simulator: iniciando auto-cliente");

    const result = await runAutoClient(base, client, { useJudge });

    req.log.info(
      { clientId: client.id, pass: result.pass, turns: result.transcript?.length },
      "Simulator: auto-cliente terminado",
    );

    res.json({ status: "success", ...result });
  } catch (err) {
    req.log.error({ err }, "Simulator: auto-cliente error");
    res.status(500).json({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/kommo/simulator/auto-clients/run", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const useJudge = body.use_judge !== false;
  const clientIds = Array.isArray(body.client_ids)
    ? (body.client_ids as unknown[]).map((x) => Number(x))
    : null;

  if (!isOpenAiConfigured()) {
    res.status(200).json({
      status: "error",
      error: "missing_openai_key",
      reply: "Lucy y los clientes auto requieren OPEN_AI en el servidor.",
    });
    return;
  }

  try {
    const base =
      (typeof body.base_url === "string" && body.base_url.trim()) || resolveLucyPublicBase(req);

    const report = await runAllAutoClients(base, {
      useJudge,
      clientIds: clientIds ?? undefined,
    });

    res.json({ status: "success", ...report });
  } catch (err) {
    req.log.error({ err }, "Simulator: batch auto-clientes error");
    res.status(500).json({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
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
