/**
 * Clasifica mensajes entrantes: publicidad/spam vs clientes reales.
 * Por defecto asume cliente (Lucy responde) salvo señales claras de publicidad.
 */

export type MessageKind = "publicidad" | "cliente";

export interface ClassifyInput {
  text: string;
  /** Email o nombre del remitente si viene en el webhook */
  senderHint?: string;
  /** Canal: whatsapp, mail, etc. */
  channelHint?: string;
  /** Notas de voz — siempre cliente */
  isVoice?: boolean;
}

export interface ClassifyResult {
  kind: MessageKind;
  confidence: number;
  reason: string;
}

const CLIENT_SIGNALS: RegExp[] = [
  /\bboda\b/i,
  /\bxv\s*a[ñn]os\b/i,
  /\bevento\b/i,
  /\binvitados?\b/i,
  /\bbanquete\b/i,
  /\bcotiz(a|ar|ación)\b/i,
  /\bpresupuesto\b/i,
  /\bsal[oó]n\b/i,
  /\bquincea[ñn]era\b/i,
  /\bcumplea[ñn]os\b/i,
  /\bmi (boda|evento|fiesta)\b/i,
  /\bpara mi\b/i,
  /\bcu[aá]nto (cuesta|sale|costar[ií]a)\b/i,
  /\bme (gustar[ií]a|interesa)\b/i,
  /\btienen disponible\b/i,
  /\bagendar\b/i,
  /\bvisita\b/i,
];

/** Remitentes típicos de correo masivo / marketing */
const SPAM_SENDER_PATTERNS: RegExp[] = [
  /noreply/i,
  /no-?reply/i,
  /donotreply/i,
  /newsletter/i,
  /marketing@/i,
  /promo(ciones)?@/i,
  /info@.*\.(com|mx)$/i,
  /notificaciones@/i,
  /mailer-daemon/i,
];

/** Frases y estructuras de publicidad en el cuerpo */
const SPAM_BODY_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /darse de baja/i, weight: 4, label: "opt-out" },
  { pattern: /cancelar suscripci[oó]n/i, weight: 4, label: "unsubscribe" },
  { pattern: /\bunsubscribe\b/i, weight: 4, label: "unsubscribe-en" },
  { pattern: /si no desea(s)? recibir/i, weight: 3, label: "no-desea-recibir" },
  { pattern: /ver en (el )?navegador/i, weight: 3, label: "ver-navegador" },
  { pattern: /haz clic aqu[ií]/i, weight: 2, label: "cta-clic" },
  { pattern: /oferta(s)? (exclusiva|especial|limitada)/i, weight: 3, label: "oferta" },
  { pattern: /\d+\s*%\s*(de\s*)?(descuento|off)/i, weight: 3, label: "descuento" },
  { pattern: /\bnewsletter\b/i, weight: 3, label: "newsletter" },
  { pattern: /\bpublicidad\b/i, weight: 3, label: "publicidad" },
  { pattern: /\bpatrocinad[oa]\b/i, weight: 2, label: "patrocinado" },
  { pattern: /\bpromoci[oó]n\b/i, weight: 2, label: "promocion" },
  { pattern: /este correo fue enviado/i, weight: 3, label: "correo-masivo" },
  { pattern: /correo promocional/i, weight: 3, label: "correo-promocional" },
  { pattern: /t[eé]rminos y condiciones/i, weight: 1, label: "tyc" },
  { pattern: /black\s*friday|cyber\s*monday|hot\s*sale/i, weight: 3, label: "campana" },
  { pattern: /aprovecha (esta|nuestra) oferta/i, weight: 3, label: "aprovecha-oferta" },
  { pattern: /solo por tiempo limitado/i, weight: 2, label: "tiempo-limitado" },
  { pattern: /compra ahora/i, weight: 2, label: "compra-ahora" },
  { pattern: /cat[aá]logo de productos/i, weight: 1, label: "catalogo-productos" },
];

const PUBLICIDAD_THRESHOLD = 4;

/**
 * Clasifica un mensaje entrante.
 * - publicidad: marcar leído, no responder
 * - cliente: flujo normal de Lucy
 */
export function classifyInboundMessage(input: ClassifyInput): ClassifyResult {
  if (input.isVoice) {
    return { kind: "cliente", confidence: 1, reason: "nota de voz" };
  }

  const text = input.text.trim();
  const sender = (input.senderHint ?? "").trim();

  if (!text && !sender) {
    return { kind: "cliente", confidence: 0.5, reason: "sin contenido" };
  }

  // Señales fuertes de cliente potencial — prioridad sobre spam
  const haySenalCliente = CLIENT_SIGNALS.some((p) => p.test(text));
  if (haySenalCliente) {
    return { kind: "cliente", confidence: 0.9, reason: "señal de evento/cotización" };
  }

  let score = 0;
  const reasons: string[] = [];

  for (const p of SPAM_SENDER_PATTERNS) {
    if (sender && p.test(sender)) {
      score += 4;
      reasons.push(`remitente:${p.source}`);
      break;
    }
  }

  for (const { pattern, weight, label } of SPAM_BODY_PATTERNS) {
    if (pattern.test(text)) {
      score += weight;
      reasons.push(label);
    }
  }

  // Correos muy largos con muchos enlaces suelen ser newsletters
  const linkCount = (text.match(/https?:\/\//gi) ?? []).length;
  if (linkCount >= 3 && text.length > 400) {
    score += 2;
    reasons.push("muchos-enlaces");
  }

  // WhatsApp corto y conversacional — casi siempre cliente
  const isWhatsapp = (input.channelHint ?? "").toLowerCase().includes("whatsapp");
  if (isWhatsapp && text.length < 120 && score < PUBLICIDAD_THRESHOLD) {
    return { kind: "cliente", confidence: 0.85, reason: "whatsapp-corto" };
  }

  if (score >= PUBLICIDAD_THRESHOLD) {
    const confidence = Math.min(0.95, 0.6 + score * 0.05);
    return {
      kind: "publicidad",
      confidence,
      reason: reasons.slice(0, 4).join(", ") || "patrones-spam",
    };
  }

  return { kind: "cliente", confidence: 0.7, reason: "sin-señales-publicidad" };
}
