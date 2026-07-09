/**
 * Guardas ligeras para respuestas por correo — sin forzar una pregunta por mensaje.
 */
import type { ExtractedData } from "../types.js";
import {
  getNextPendingField,
  stripGammaLinks,
  type LucyMessageGuardsInput,
} from "../lucy-flow-guards.js";
import { sanitizeInventedPrices } from "../price-guard.js";

const EMAIL_SIGNATURE = "Lucy — Bodasesor\nhola@bodasesor.com";

export function buildEmailClosingMessage(serviciosPedidos: string | null | undefined, catalogUrl: string): string {
  const servicio = serviciosPedidos?.trim() || null;
  const introServicios = servicio
    ? `Además de ${servicio}, también manejamos bebidas, DJ, iluminación, carpas, mobiliario, pantallas, mesas de dulces, barras de alimentos y más.`
    : `También manejamos bebidas, DJ, iluminación, carpas, mobiliario, pantallas, mesas de dulces, barras de alimentos y más.`;

  return (
    `Perfecto, ya tengo toda la información que necesitamos. Le comparto estos datos a Alejandro para que prepare tu cotización personalizada.\n\n` +
    `Mientras tanto, aquí está nuestro catálogo completo:\n${catalogUrl}\n\n` +
    `${introServicios}\n\n` +
    `Si deseas cotizar algún servicio adicional o tienes alguna duda, con gusto te apoyamos.\n\n` +
    `Quedo atenta.\n${EMAIL_SIGNATURE}`
  );
}

function ensureEmailSignature(text: string): string {
  const trimmed = text.trim();
  if (/hola@bodasesor\.com/i.test(trimmed)) return trimmed;
  if (/quedo atenta/i.test(trimmed)) {
    return `${trimmed}\n${EMAIL_SIGNATURE}`;
  }
  return `${trimmed}\n\nQuedo atenta.\n${EMAIL_SIGNATURE}`;
}

function listMissingFields(extracted: ExtractedData, filledSet: Set<string>): string[] {
  const labels: Array<{ key: string; label: string }> = [
    { key: "Nombre del cliente", label: "Nombre completo" },
    { key: "Correo electrónico", label: "Correo electrónico" },
    { key: "Tipo de evento", label: "Tipo de evento" },
    { key: "Requerimientos o servicios", label: "Servicios o requerimientos" },
    { key: "Número de invitados", label: "Número de invitados" },
    { key: "Lugar/dirección del evento", label: "Ciudad o lugar del evento" },
    { key: "Fecha y horario", label: "Fecha aproximada" },
    { key: "Presupuesto (MXN)", label: "Presupuesto estimado (opcional)" },
  ];

  return labels
    .filter(({ key }) => !filledSet.has(key) && !filledSet.has(key.replace(" (opcional)", "")))
    .map(({ label }) => label);
}

/** Aplica guardas mínimas para correo: cierre, precios, firma — sin fragmentar en preguntas cortas. */
export function applyEmailMessageGuards(
  input: LucyMessageGuardsInput & { catalogUrl: string }
): string {
  const {
    aiResponse,
    extracted,
    filledSet,
    readyForClosing,
    cierreYaEnviado,
    history,
    currentMessage,
    buildClosing,
    log,
    entityId,
    catalogUrl,
    presentationHistory,
  } = input;

  const pendingBeforeClose = getNextPendingField(extracted, filledSet);
  const trulyReadyForClosing = readyForClosing && !pendingBeforeClose;

  let mensaje: string;

  if (trulyReadyForClosing && !cierreYaEnviado) {
    mensaje = buildEmailClosingMessage(
      extracted.tipo_evento ?? extracted.requerimientos_evento ?? null,
      catalogUrl
    );
    log?.info({ entityId }, "Email: datos completos — cierre formal");
  } else if (aiResponse.includes("DATOS DEL CLIENTE:")) {
    mensaje = buildClosing(extracted.tipo_evento ?? extracted.requerimientos_evento ?? null);
    log?.warn({ entityId }, "Email: nota interna detectada — usando cierre");
  } else {
    mensaje = aiResponse.trim();
  }

  const ctxText = [
    ...(presentationHistory ?? history)
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : "")),
    currentMessage ?? "",
  ].join(" ");

  mensaje = sanitizeInventedPrices(mensaje, currentMessage, ctxText);
  mensaje = stripGammaLinks(mensaje);

  // Si GPT dejó el correo muy corto y faltan datos, sugerir lista de pendientes
  const missing = listMissingFields(extracted, filledSet);
  if (!trulyReadyForClosing && missing.length > 0 && mensaje.length < 180 && !mensaje.includes("•")) {
    const bullets = missing.map((l) => `• ${l}`).join("\n");
    mensaje =
      `${mensaje}\n\nPara preparar tu cotización, ¿nos compartes la siguiente información?\n\n${bullets}`;
    log?.info({ entityId, missing: missing.length }, "Email: lista de datos faltantes añadida");
  }

  return ensureEmailSignature(mensaje);
}
