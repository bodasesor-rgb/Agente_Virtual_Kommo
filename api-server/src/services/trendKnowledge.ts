/**
 * Tendencias / ideas de venta — capa barata en tokens.
 * - Siempre: tips compactos en caché (sin LLM extra).
 * - Opcional: Google Grounding solo si LUCY_GOOGLE_GROUNDING=1 e intent de ideas.
 */

import { advisorLabelForClient } from "../lib/bodasesorAdvisor.js";

const ACCEPTS_IDEAS_PATTERN =
  /\b(?:s[ií](?:\s+por\s+favor)?|claro|dale|va|ok|okay|sale|perfecto)\b.{0,40}\b(?:ideas?|recomendaci|sugerenc)|\b(?:dame|quiero|pásame|pasame|necesito)\s+ideas?\b|\bideas?\s+por\s+favor\b/i;

const TREND_IDEA_PATTERN =
  /\b(?:tendenci(?:a|as)|ideas?\s+(?:de\s+)?(?:decoraci[oó]n|evento|fiesta|boda|xv|ambient)|inspiraci[oó]n|mood\s*board|estilos?\b|tem[aá]tica|ambiente|qu[eé]\s+(?:se\s+)?(?:usa|lleva|est[aá]\s+usando)|novedades?|recomendaci[oó]n(?:es)?|c[oó]mo\s+(?:armar|decorar|montar)|qu[eé]\s+(?:me\s+)?(?:recomiendas?|sugieres?)|opciones?\s+de\s+(?:decor|estilo)|look\b|vibe\b|aesthetic)\b/i;

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
];

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
    "Para jardín: carpa + iluminación tipo edison + estaciones de comida.",
  ],
  default: [
    "Primero define el vibe (elegante, fiesta, jardín) y luego encaja servicios.",
    "Combina 2–3 piezas ancla (espacio, comida, ambiente) antes de saturar extras.",
    "Si el espacio es chico, prioriza iluminación y mobiliario lounge sobre montajes grandes.",
  ],
};

function eventKey(tipo?: string | null): keyof typeof TIPS_BY_EVENT {
  const t = (tipo ?? "").toLowerCase();
  if (/boda|wedding/.test(t)) return "boda";
  if (/xv|quince/.test(t)) return "xv";
  if (/corporativ|empresarial|gala|conferenc/.test(t)) return "corporativo";
  if (/cumple|birthday|aniversario/.test(t)) return "cumple";
  return "default";
}

/** True si el cliente pide ideas, tendencias, estilo o recomendación creativa. */
export function clientWantsIdeasOrTrends(message?: string): boolean {
  if (!message?.trim()) return false;
  return TREND_IDEA_PATTERN.test(message) || ACCEPTS_IDEAS_PATTERN.test(message);
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

function pickTips(tipoEvento?: string | null, max = 2): string[] {
  const tips = TIPS_BY_EVENT[eventKey(tipoEvento)] ?? TIPS_BY_EVENT.default!;
  return tips.slice(0, max);
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
