/**
 * Tendencias / ideas de venta — capa barata en tokens.
 * - Siempre: tips compactos en caché (sin LLM extra).
 * - Opcional: Google Grounding solo si LUCY_GOOGLE_GROUNDING=1 e intent de ideas.
 */

import { advisorLabelForClient } from "../lib/bodasesorAdvisor.js";

const ACCEPTS_IDEAS_PATTERN =
  /\b(?:s[ií](?:\s+por\s+favor)?|claro|dale|va|ok|okay|sale|perfecto)\b.{0,40}\b(?:ideas?|recomendaci|sugerenc)|\b(?:dame|quiero|pásame|pasame|necesito)\s+ideas?\b|\bideas?\s+por\s+favor\b/i;

const TREND_IDEA_PATTERN =
  /\b(?:tendenci(?:a|as)|ideas?\s+(?:de\s+)?(?:decoraci[oó]n|evento|fiesta|boda|xv|ambient|colores?|montaje)|inspiraci[oó]n|mood\s*board|estilos?\b|tem[aá]tica|ambiente|colores?|paleta|montajes?|decoraci[oó]n|qu[eé]\s+(?:se\s+)?(?:usa|lleva|est[aá]\s+usando)|novedades?|recomendaci[oó]n(?:es)?|c[oó]mo\s+(?:armar|decorar|montar)|qu[eé]\s+(?:me\s+)?(?:recomiendas?|sugieres?)|opciones?\s+de\s+(?:decor|estilo|color)|look\b|vibe\b|aesthetic)\b/i;

const STYLE_CUES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bboho|bohemio/i, label: "boho" },
  { pattern: /\br[uú]stic/i, label: "rústico" },
  { pattern: /\belegante|formal|black\s*tie/i, label: "elegante" },
  { pattern: /\bminimal(?:ista)?/i, label: "minimalista" },
  { pattern: /\bne[oó]n|fluo/i, label: "neón / fiesta" },
  { pattern: /\bjard[ií]n|garden|al\s+aire\s+libre|exterior/i, label: "jardín / exterior" },
  { pattern: /\bcoquette|rosad[oa]|pink/i, label: "coquette / rosa" },
  { pattern: /\bvintage|retr[oó]/i, label: "vintage" },
  { pattern: /\bindustrial|loft/i, label: "industrial" },
  { pattern: /\btropical|player[oa]|beach/i, label: "tropical" },
  { pattern: /\bm[eé]xico|mexicana|folkl[oó]r/i, label: "mexicana" },
  { pattern: /\bxv|quince/i, label: "XV años" },
  { pattern: /\bboda|wedding/i, label: "boda" },
  { pattern: /\bcorporativ|empresarial|gala/i, label: "corporativo" },
  { pattern: /\bfamiliar|en\s+familia|convivio|reuni[oó]n\s+peque/i, label: "familiar" },
];

/** Cues que son tipo de evento, no estilo ("Para un vibe *XV años*" suena mal). */
const EVENT_TYPE_CUES = new Set(["XV años", "boda", "corporativo"]);

/** Tips cortos por tipo de evento — sin precios, orientados a venta. */
const TIPS_BY_EVENT: Record<string, string[]> = {
  boda: [
    "Iluminación cálida + lounge pequeño suele elevar el ambiente sin saturar.",
    "Carpa + entelado + pista iluminada arma un look completo en jardín.",
    "Estaciones casuales + barra de bebidas liberan el salón vs banquete fijo.",
  ],
  xv: [
    "Entrada con luces o LED wall + pista grande marca el momento del vals.",
    "Mobiliario lounge en zona VIP + periqueras en cóctel funciona muy bien.",
    "Mesa de dulces + barra de postres refuerza el tema de color.",
  ],
  corporativo: [
    "Coffee break + pantallas LED + audio claro = formato profesional limpio.",
    "Periqueras + branding en backdrop para networking sin montaje pesado.",
    "Si hay premiación: tarima + iluminación enfocada al escenario.",
  ],
  cumple: [
    "Temática clara (color/estilo) + mesa de dulces + DJ suele cerrar bien.",
    "Para algo familiar: taquiza o parrillada + mesa de dulces + música de fondo, ambiente relajado sin montaje pesado.",
    "Mesas largas tipo convivio o una sala lounge hacen que todos platiquen más.",
    "Un toque personal: pastel temático y un backdrop sencillo para fotos.",
    "Para jardín: carpa + iluminación tipo edison + estaciones de comida.",
  ],
  bautizo: [
    "Brunch o banquete ligero + pastel + mesa de dulces arma un look familiar limpio.",
    "En jardín o terraza: carpas o sombrillas + mobiliario básico sin saturar.",
  ],
  apertura: [
    "Cóctel de bienvenida con canapés y barra de mixología: la gente recorre el espacio con copa en mano.",
    "Iluminación ambiental que resalte el producto + DJ en modo lounge, sin tapar la plática.",
    "Un backdrop con la marca para fotos y redes hace que la apertura se comparta sola.",
  ],
  default: [
    "Barra de bebidas + estaciones de comida hacen que la gente se mueva y conviva más que un banquete fijo.",
    "Iluminación cálida + una sala lounge elevan el ambiente sin saturar el espacio.",
    "Un DJ que arranque tranquilo y suba al final mantiene la energía toda la noche.",
  ],
};

function eventKey(tipo?: string | null): keyof typeof TIPS_BY_EVENT {
  const t = (tipo ?? "").toLowerCase();
  if (/apertura|inaugura|lanzamiento|showroom|tienda|negocio|open\s*house/.test(t)) return "apertura";
  if (/boda|wedding/.test(t)) return "boda";
  if (/xv|quince/.test(t)) return "xv";
  if (/corporativ|empresarial|gala|conferenc/.test(t)) return "corporativo";
  if (/cumple|birthday|aniversario/.test(t)) return "cumple";
  if (/bautizo|baby\s*shower/.test(t)) return "bautizo";
  return "default";
}

/** True si el cliente pide ideas, tendencias, estilo o recomendación creativa. */
export function clientWantsIdeasOrTrends(message?: string): boolean {
  if (!message?.trim()) return false;
  return TREND_IDEA_PATTERN.test(message) || ACCEPTS_IDEAS_PATTERN.test(message);
}

/** Lucy ofreció ideas en su mensaje ("Si quieres, te puedo dar algunas ideas…"). */
export function lucyOfferedIdeas(lucyText?: string | null): boolean {
  const t = lucyText ?? "";
  if (!t.trim()) return false;
  return (
    /\b(?:te\s+(?:puedo\s+)?(?:dar|compartir|pasar|mandar|sugerir)|quieres\s+(?:que\s+te\s+(?:d[eé]|comparta|pase|mande|sugiera)\s+)?|te\s+late\s+que\s+te\s+(?:d[eé]|comparta|pase))[^.?!\n]{0,40}\b(?:ideas?|sugerencias?|recomendaciones?|opciones)\b/i.test(
      t
    ) ||
    /\b(?:ideas?|sugerencias?)\b[^.?!\n]{0,60}\?/i.test(t)
  );
}

/**
 * Cliente acepta la oferta de ideas con un "sí" corto (A16427: "Si, por favor").
 * El patrón general exige la palabra "ideas"; aquí basta el contexto de Lucy.
 */
export function clientAcceptsIdeasOffer(
  message?: string | null,
  lastLucyText?: string | null
): boolean {
  const m = (message ?? "").trim();
  if (!m || m.length > 80 || !lucyOfferedIdeas(lastLucyText)) return false;
  if (/\bno\b(?!\s+s[eé]\b)/i.test(m) && !/\bpor\s+qu[eé]\s+no\b/i.test(m)) return false;
  return /^(?:s[ií]+|sip|claro|dale|va|vale|ok(?:ay)?|sale|porfa|por\s+favor|me\s+encantar[ií]a|obvio|perfecto|de\s+acuerdo|por\s+supuesto|adelante|a\s+ver|por\s+qu[eé]\s+no|me\s+late|[aá]ndale)(?=[\s,.!¡?]|$)/i.test(
    m
  );
}

/** Texto plano de mensajes previos (para no repetir tips ya enviados). */
function normalizeForTipMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ");
}

/** Estilos/vibes detectados en texto (mensaje + CRM). Máx 4. */
export function extractStyleCues(...texts: Array<string | null | undefined>): string[] {
  const blob = texts.filter(Boolean).join(" \n ");
  if (!blob.trim()) return [];
  const found: string[] = [];
  for (const { pattern, label } of STYLE_CUES) {
    if (pattern.test(blob) && !found.includes(label)) found.push(label);
    if (found.length >= 4) break;
  }
  return found;
}

function pickTips(tipoEvento?: string | null, max = 2, alreadySent?: string | null): string[] {
  const tips = TIPS_BY_EVENT[eventKey(tipoEvento)] ?? TIPS_BY_EVENT.default!;
  const sent = alreadySent ? normalizeForTipMatch(alreadySent) : "";
  const fresh = sent
    ? tips.filter((tip) => !sent.includes(normalizeForTipMatch(tip).slice(0, 40)))
    : tips;
  return fresh.slice(0, max);
}

/**
 * Viñetas de Google Grounding listas para WhatsApp (máx 2, sin precios/links).
 */
export function parseGroundingBullets(snippet?: string | null, max = 2): string[] {
  const raw = (snippet ?? "").trim();
  if (!raw) return [];
  const lines = raw.includes("\n")
    ? raw.split(/\n+/)
    : raw.split(/\s+(?=[-*•]\s)|(?<=[.!])\s+(?=[A-ZÁÉÍÓÚÑ])/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (t.length < 15 || t.length > 220) continue;
    if (/\$|https?:|www\.|\bmxn\b|\bpesos\b/i.test(t)) continue;
    if (/^(aqu[ií]|claro|estas son|te comparto|tendencias)\b.*:$/i.test(t)) continue;
    out.push(/[.!]$/.test(t) ? t : `${t}.`);
    if (out.length >= max) break;
  }
  return out;
}

/** ¿El texto trae algún tip estático de TIPS_BY_EVENT? */
export function containsStaticSalesTip(text: string | null | undefined): boolean {
  const norm = normalizeForTipMatch(text ?? "");
  if (!norm.trim()) return false;
  return Object.values(TIPS_BY_EVENT).some((tips) =>
    tips.some((tip) => norm.includes(normalizeForTipMatch(tip).slice(0, 40)))
  );
}

/** True si el mensaje ya trae ideas/tips de venta (no reinyectar). */
export function messageAlreadyOffersSalesIdeas(text: string | null | undefined): boolean {
  const t = text ?? "";
  if (!t.trim()) return false;
  return (
    /algunas ideas que funcionan|una idea que funciona|ideas que suelen funcionar|para un vibe/i.test(t) ||
    /iluminaci[oó]n c[aá]lida|lounge peque|pista iluminada|coffee break \+ pantallas|mesa de dulces/i.test(
      t
    ) ||
    (/•\s*.+\n•\s*/.test(t) && /iluminaci|mobiliario|banquete|dj|carpa|lounge/i.test(t))
  );
}

/**
 * Snippet listo para WhatsApp (1–2 ideas). Sale al chat aunque un guard
 * haya reemplazado al modelo — sin precios.
 */
export function buildSalesIdeasSnippet(opts: {
  tipoEvento?: string | null;
  messageText?: string | null;
  requerimientos?: string | null;
  maxTips?: number;
  /** Mensajes previos de Lucy: no repetir tips ya enviados. */
  alreadySent?: string | null;
  /** Mensajes previos del cliente (estilo/vibe cuando el turno es solo "sí"). */
  contextText?: string | null;
  /** El cliente aceptó ideas: abrir con un lead cálido. */
  accepted?: boolean;
  numInvitados?: number | string | null;
  /** Viñetas frescas de Google (LUCY_GOOGLE_GROUNDING=1) — van primero. */
  groundingSnippet?: string | null;
}): string | null {
  const cues = extractStyleCues(
    opts.messageText,
    opts.contextText,
    opts.tipoEvento,
    opts.requerimientos
  );
  const max = opts.maxTips ?? 2;
  const vibeCues = cues.filter((c) => !EVENT_TYPE_CUES.has(c));
  const trends = parseGroundingBullets(opts.groundingSnippet, 2);
  const staticTips = pickTips(
    opts.tipoEvento || cues[0],
    Math.max(1, max - trends.length),
    opts.alreadySent
  );
  const tips = [...trends, ...staticTips].slice(0, Math.max(max, trends.length + 1));
  if (!tips.length) return null;
  if (opts.accepted) {
    const tipo = opts.tipoEvento?.trim();
    const inv = opts.numInvitados ? `${opts.numInvitados} personas` : null;
    const vibe = vibeCues[0];
    const detalles = [inv, vibe ? `algo ${vibe}` : null].filter(Boolean).join(", ");
    const para = tipo
      ? `Para tu ${tipo.toLowerCase()}${detalles ? ` (${detalles})` : ""}`
      : detalles
        ? `Para tu evento (${detalles})`
        : "Para tu evento";
    const lead = trends.length
      ? `¡Claro! ${para}, esto es lo que se está usando y funciona muy bien:`
      : `¡Claro! ${para}, algunas ideas que funcionan muy bien:`;
    return `${lead}\n${tips.map((t) => `• ${t}`).join("\n")}`.trim();
  }
  if (trends.length) {
    const cueTrend = vibeCues[0] ? ` para un vibe *${vibeCues[0]}*` : "";
    return `Lo que se está usando${cueTrend}:\n${tips.map((t) => `• ${t}`).join("\n")}`.trim();
  }
  const cue = vibeCues[0] ? `Para un vibe *${vibeCues[0]}*: ` : "";
  if (tips.length === 1) {
    return cue ? `${cue}${tips[0]}` : `Una idea que funciona muy bien: ${tips[0]}`;
  }
  return `${cue}Algunas ideas que funcionan bien:\n${tips.map((t) => `• ${t}`).join("\n")}`.trim();
}

/**
 * Inserta ideas antes de la última pregunta del embudo (o al final).
 */
export function enrichReplyWithSalesIdeas(
  mensaje: string,
  opts: {
    tipoEvento?: string | null;
    messageText?: string | null;
    requerimientos?: string | null;
    force?: boolean;
    /** Cliente aceptó la oferta de ideas → 3 tips con lead, antes de la pregunta. */
    accepted?: boolean;
    alreadySent?: string | null;
    contextText?: string | null;
    numInvitados?: number | string | null;
    groundingSnippet?: string | null;
  }
): string {
  const out = (mensaje || "").trim();
  if (!out) return out;
  if (messageAlreadyOffersSalesIdeas(out)) return out;

  if (opts.accepted) {
    const snippet = buildSalesIdeasSnippet({
      tipoEvento: opts.tipoEvento,
      messageText: opts.messageText,
      requerimientos: opts.requerimientos,
      maxTips: 3,
      alreadySent: opts.alreadySent,
      contextText: opts.contextText,
      accepted: true,
      numInvitados: opts.numInvitados,
      groundingSnippet: opts.groundingSnippet,
    });
    if (!snippet) return out;
    const questions = (out.match(/[^.!?\n]*\?/g) ?? []).map((q) => q.trim()).filter(Boolean);
    const q = questions[questions.length - 1];
    if (!q) return `${snippet}\n\n${out}`.trim();
    const cleanQ = q.startsWith("¿") ? q : `¿${q.replace(/^¿?/, "")}`;
    return `${snippet}\n\n${cleanQ}`.trim();
  }

  const wants =
    opts.force ||
    clientWantsIdeasOrTrends(opts.messageText) ||
    /recomendaciones?|recomiendas?|ideas?\b|colores?|montajes?|decoraci/i.test(
      opts.messageText ?? ""
    );
  const askingServices =
    /qu[eé]\s+(servicios|necesitas|gustar)|plat[ií]came|armar para|te gustar[ií]a ir armando/i.test(
      out
    );
  const hasTipo = !!(opts.tipoEvento && opts.tipoEvento.trim().length >= 3);

  if (!wants && !(hasTipo && askingServices)) return out;

  const snippet = buildSalesIdeasSnippet({
    tipoEvento: opts.tipoEvento,
    messageText: opts.messageText,
    requerimientos: opts.requerimientos,
    maxTips: wants ? 2 : 1,
    alreadySent: opts.alreadySent,
    contextText: opts.contextText,
    groundingSnippet: wants ? opts.groundingSnippet : null,
  });
  if (!snippet) return out;

  const qMatch = out.match(/((?:¿|\?)[^\n]*\?\s*)$/);
  if (qMatch?.[1]) {
    const before = out.slice(0, out.length - qMatch[1].length).trim();
    if (before) return `${before}\n\n${snippet}\n\n${qMatch[1]}`.trim();
    return `${snippet}\n\n${qMatch[1]}`.trim();
  }
  return `${out}\n\n${snippet}`.trim();
}

/**
 * Bloque compacto para el contexto del turno (≤ ~900 chars).
 * No incluye precios. groundingSnippet es opcional (ya recortado).
 */
export function buildTrendContextBlock(opts: {
  messageText?: string;
  tipoEvento?: string | null;
  requerimientos?: string | null;
  groundingSnippet?: string | null;
}): string {
  const cues = extractStyleCues(opts.messageText, opts.tipoEvento, opts.requerimientos);
  const tips = pickTips(opts.tipoEvento, cues.length ? 1 : 2);
  const team = advisorLabelForClient();
  const wantsIdeas = clientWantsIdeasOrTrends(opts.messageText);

  const lines: string[] = [
    "━━━━━━━━ IDEAS / TENDENCIAS (compacto — sin precios) ━━━━━━━━",
    "Usa esto para asesorar y generar negocio. NO cites montos aquí.",
    `Precio solo si el cliente lo pidió y hay ficha Sheet/PDF; si no, ${team} cotiza.`,
  ];

  if (cues.length) {
    lines.push(`Estilo/vibe detectado: ${cues.join(", ")}.`);
  }
  if (tips.length) {
    lines.push(`Ideas útiles: ${tips.join(" ")}`);
  }
  if (opts.groundingSnippet?.trim()) {
    const snip =
      opts.groundingSnippet.trim().length > 500
        ? `${opts.groundingSnippet.trim().slice(0, 497)}…`
        : opts.groundingSnippet.trim();
    lines.push(`Notas al día (grounding): ${snip}`);
  } else if (wantsIdeas) {
    lines.push(
      "El cliente pidió/aceptó ideas: propone 1–2 sugerencias concretas atadas a servicios Bodasesor y pide 1 dato del embudo."
    );
  } else if (opts.tipoEvento || cues.length) {
    lines.push(
      "INVITA ideas (proactivo, 1 frase): pregunta si quiere ideas de lo que se puede armar para su evento. No listes 8 cosas; solo invita."
    );
  }

  const block = lines.join("\n");
  return block.length > 900 ? `${block.slice(0, 897)}…` : block;
}

/** ¿Inyectar bloque de tendencias en este turno? (barato: casi siempre un tip corto). */
export function shouldInjectTrendBlock(messageText?: string, tipoEvento?: string | null): boolean {
  if (clientWantsIdeasOrTrends(messageText)) return true;
  if (extractStyleCues(messageText, tipoEvento).length > 0) return true;
  return !!(tipoEvento && tipoEvento.trim().length >= 3);
}
