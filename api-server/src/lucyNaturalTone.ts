/**
 * V9.79 — A15897: los guards arman el mensaje por pedazos (ack + detalle + la
 * pregunta del embudo) y cada pedazo trae su propio saludo. El resultado suena a
 * robot: el nombre del cliente en todos los mensajes y muletillas sueltas
 * ("Claro que sí.") justo antes de la pregunta.
 *
 * A16345g: "Perfecto. Anoto *X*" no vende — suavizar a tono asesora/vendedora
 * sin tocar el embudo (la pregunta pendiente se conserva).
 */
import type { OpenAI } from "openai";

/** Mensajes de Lucy hacia atrás que se revisan antes de repetir el nombre. */
const RECENT_ASSISTANT_TURNS = 2;

const FILLER = String.raw`(?:Claro que s[ií]|Claro|Con gusto|Perfecto|Genial|Excelente|De acuerdo|Muy bien|Listo|Entendido)`;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function recentAssistantTexts(
  history: OpenAI.Chat.ChatCompletionMessageParam[] | undefined,
  limit: number
): string[] {
  if (!history?.length) return [];
  const out: string[] = [];
  for (let i = history.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const m = history[i]!;
    if (m.role !== "assistant" || typeof m.content !== "string") continue;
    if (m.content.trim()) out.push(m.content);
  }
  return out;
}

/** Quita el vocativo del nombre dejando la frase bien puntuada. */
export function stripClientNameVocative(mensaje: string, clientName: string): string {
  const first = clientName.trim().split(/\s+/)[0];
  if (!first || first.length < 2) return mensaje;
  const n = escapeRegExp(first);

  return mensaje
    // "Perfecto, Lizbeth." / "Entendido, Lizbeth!" → "Perfecto."
    .replace(
      new RegExp(String.raw`,\s*(?:(?:sra|sr|srta|se[nñ]ora|se[nñ]or|do[nñ]a|don|lic|dra|dr)\.?\s+)?${n}\b(?=\s*[.,;:!?]|\s*$)`, "gi"),
      ""
    )
    // "Lizbeth, ¿qué día tienen en mente?" al inicio de línea.
    .replace(new RegExp(String.raw`(^|\n)\s*${n}\s*,\s*`, "gi"), "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

export interface NameCadenceInput {
  mensaje: string;
  clientName?: string | null;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
}

/**
 * Deja el nombre solo si Lucy no lo usó en sus mensajes recientes.
 * No toca el turno donde se está confirmando o preguntando el nombre.
 */
export function applyClientNameCadence(input: NameCadenceInput): string {
  const mensaje = input.mensaje ?? "";
  const first = input.clientName?.trim().split(/\s+/)[0];
  if (!mensaje.trim() || !first || first.length < 2) return mensaje;

  // "¿Me confirmas que tu nombre es Lizbeth?" necesita el nombre.
  if (/\bnombre\b/i.test(mensaje)) return mensaje;

  const pattern = new RegExp(String.raw`\b${escapeRegExp(first)}\b`, "i");
  if (!pattern.test(mensaje)) return mensaje;

  const yaLoDijo = recentAssistantTexts(input.history, RECENT_ASSISTANT_TURNS).some((t) =>
    pattern.test(t)
  );
  if (!yaLoDijo) return mensaje;

  const stripped = stripClientNameVocative(mensaje, first);
  // Si quitar el vocativo deja el mensaje vacío o roto, mejor dejarlo como estaba.
  return stripped.trim().length >= 8 ? stripped : mensaje;
}

/**
 * Muletilla suelta a media respuesta: el mensaje ya abrió con un acuse, así que
 * "… dime si te interesa alguno. Claro que sí. ¿Cuántos invitados…?" sobra.
 * Solo se quita si no es la apertura del mensaje.
 */
export function stripMidMessageFiller(mensaje: string): string {
  if (!mensaje?.trim()) return mensaje;
  const out = mensaje.replace(
    new RegExp(String.raw`(?<=[.!?…]["'»)*]?[ \t]+)¡?${FILLER}!?\.[ \t]+`, "gi"),
    ""
  );
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * A16345g: quitar el registro robótico "Anoto…" / "Queda anotado…" y dejar
 * voz de asesora. No borra preguntas del embudo ni links de catálogo.
 */
export function softenRobotAcks(mensaje: string): string {
  if (!mensaje?.trim()) return mensaje;
  let out = mensaje;

  // A16503: "Perfecto, Sra. ¡Claro, Sra. Olga, no se preocupe!" → un solo acuse.
  out = out.replace(
    /^\s*¡?(?:Perfecto|Entendido|De\s+acuerdo|Listo|Claro)(?:,\s*[^.!?\n]{1,25})?[.!]\s+(?=¡?(?:Claro|Perfecto|Entendido|De\s+acuerdo|Listo|Va|Sale|No\s+te\s+preocupes|No\s+se\s+preocupe|Sin\s+problema|Con\s+gusto)\b)/i,
    ""
  );

  // A16511: "Lo anoto y nuestro equipo…" salía "Lo Va, y nuestro equipo…".
  out = out.replace(/\b(lo|la|los|las)\s+anoto\b/gi, (_m, pron: string) => `${pron} sumo`);

  // "Perfecto. Anoto tu *boda*." / "Perfecto. Anoto *Taquiza*."
  // A16484: antes salía "¡Perfecto, *boda*!" / "¡Perfecto, que es *comida*!".
  // A16511: "*solo alimentos* para Banquete Kosher" completo (antes "*…*. para Banquete").
  out = out.replace(
    /\bPerfecto\.?\s*Anoto(\s+tu|\s+que\s+es)?\s+(\*[^*]{1,60}\*[^.!?\n*]{0,60}|[^.!?\n]{2,60})[.!]?\s*/gi,
    (_m, tu: string | undefined, what: string) =>
      tu?.trim() === "tu"
        ? `Perfecto, con gusto te ayudamos con tu ${what}. `
        : tu
          ? `¡Perfecto! Vamos con tu ${what}. `
          : `¡Perfecto! Vamos con ${what}. `
  );
  // "¡Claro! Anoto *20* centros…" / "Claro! Anoto X para tu cotización."
  out = out.replace(/(?:¡|\b)Claro!?\.?\s*Anoto\s+/gi, "¡Claro! Vamos con ");
  // "Perfecto — anoto *bailarinas* …" / A16511: "Perfecto, anoto *X*" (antes "Perfecto, Seguimos con").
  out = out.replace(/\bPerfecto\s*[—–,-]\s*anoto\s+/gi, "¡Va! Sumamos ");
  // A16523: "Anoto Cena para que el equipo lo sume…" salía "Va, Cena para que el equipo lo sume…".
  out = out.replace(
    /\bAnoto\s+([^.!?\n]{2,80}?)\s+para\s+que\s+(?:el|nuestro)\s+equipo\s+lo\s+sume\s+a\s+tu\s+cotizaci[oó]n[.!]?\s*/gi,
    "Sumo $1 a tu cotización. "
  );
  // "Anoto *X* para tu cotización."
  out = out.replace(
    /\bAnoto\s+(\*[^*]{1,80}\*|(?:medidas?\s+)?[^.!?\n]{2,80}?)\s+para\s+tu\s+cotizaci[oó]n[.!]?\s*/gi,
    "Seguimos con $1. "
  );
  out = out.replace(/\bAnoto\s+(medidas?\s+[^.!?\n]{2,60})[.!]?\s*/gi, "Tomamos $1. ");
  out = out.replace(/\bAnoto\s+(\*[^*]{1,60}\*[^.!?\n*]{0,60})[.!]?\s*/gi, "Seguimos con $1. ");
  // "Anoto la ubicación en *Polanco*." → tono vendedora, misma info.
  out = out.replace(
    /\bAnoto\s+la\s+ubicaci[oó]n\s+en\s+/gi,
    "Queda en "
  );
  // A16511: "Horario *8pm*. Entendido." → "Queda a las *8pm*."
  out = out.replace(
    /\bAnoto\s+(?:el\s+)?horario\s+(?:a\s+las\s+)?(\*?\d)/gi,
    "Queda a las $1"
  );
  out = out.replace(/\bAnoto\s+(?:el\s+)?horario\s+/gi, "Queda el horario ");
  out = out.replace(/\bAnoto\s+(?:la\s+)?fecha\s*:?\s*/gi, "Fecha ");
  // A16433: "¡Mucho gusto! Anoto tu cumpleaños para 25 personas con la barra de mocteles."
  // A16610: "¡Qué buen plan! Tu aniversario de empresa suena increíble." se oía forzado → tono asesora.
  out = out.replace(
    /(?:¡?(?:Perfecto|Claro|Listo|Genial|Excelente|Va)!?[.,]?\s*)?\bAnoto\s+tu\s+([^.!?\n]{2,120})[.!]?\s*/gi,
    (_m, rest: string) => `Perfecto, con gusto te ayudamos con tu ${rest.trim()}. `
  );
  out = out.replace(/\bAnoto\s+([^.!?\n]{2,100})[.!]?\s*/gi, "Va, $1. ");
  out = out.replace(
    /¡?Qu[eé]\s+buen\s+plan!?\.?\s*(?:Tu|El|La)\s+([^.!?\n]{2,80}?)\s+suena\s+(?:incre[ií]ble|genial|padr[ií]simo|muy\s+bien)[.!]?\s*/gi,
    (_m, what: string) => `Perfecto, con gusto te ayudamos con tu ${what.trim()}. `
  );
  out = out.replace(/(^|[.!?]\s+)¡?Qu[eé]\s+(?:buen\s+plan|padre)!?\.?\s*/gi, "$1Perfecto. ");
  // A16612: "vibe" es anglicismo informal — Bodasesor prefiere "estilo".
  out = out.replace(/\b(un|el|ese|este|tu|su)\s+vibe\b/gi, (_m, art: string) => `${art} estilo`);
  out = out.replace(/\bla\s+vibe\b/gi, "el estilo");
  out = out.replace(/\bvibes?\b/gi, "estilo");
  // "Queda anotado lo de Banquete."
  out = out.replace(/\bQueda\s+anotado\s+lo\s+de\s+/gi, "Seguimos con ");
  // "Ya lo tengo anotado."
  out = out.replace(/\bYa\s+lo\s+tengo\s+anotad[oa]?[.!]?\s*/gi, "");
  out = out.replace(/\bTomo nota de tu solicitud especial\b/gi, "Revisamos tu solicitud especial");
  out = stripMidMessageFiller(out);

  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
