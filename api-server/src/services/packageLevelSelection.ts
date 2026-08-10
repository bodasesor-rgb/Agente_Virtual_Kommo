/**
 * Selección de paquete/nivel desde el menú numerado que Lucy ofreció.
 * Fuente única para Coffee Break 1–5 y menús Sheet (Por pieza, etc.).
 *
 * A15243: typos ("Breack"), "sí del 4", "el 4" y dígitos del paquete
 * NUNCA deben confundirse con invitados ni repreguntar "detalles de alguno".
 */
import type { OpenAI } from "openai";

export type NumberedPackageChoice = {
  /** Etiqueta canónica del menú (ej. "Coffee Break 4", "Servicio completo"). */
  label: string;
  /** Índice 1–9 del menú. */
  index: number;
  /** True si el menú era Coffee Break numerado. */
  isCoffeeBreak: boolean;
};

/** Normaliza typos frecuentes de coffee break antes de parsear. */
export function normalizeServiceChoiceText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    // Coffee / Coffe / Coffeee + Break / Breack / Brack
    .replace(/\bcoff[a-z]*\s*bre[a-z]*k\b/gi, "coffee break")
    .replace(/\bcoffeebreak\b/gi, "coffee break")
    .replace(/\s+/g, " ")
    .trim();
}

function foldLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parsea líneas "1. *Coffee Break 1*" / "2. *Por pieza* — $38" del último mensaje de Lucy.
 */
export function parseNumberedMenuFromAssistant(
  lastAssistantText?: string | null
): Array<{ index: number; label: string }> {
  const last = lastAssistantText ?? "";
  if (!last.trim()) return [];
  const out: Array<{ index: number; label: string }> = [];
  const re = /^\s*(\d+)\.\s*\*?([^*\n]+?)\*?(?:\s*[—\-–:].*)?$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(last)) !== null) {
    const index = parseInt(m[1]!, 10);
    let label = (m[2] ?? "").replace(/\*+/g, "").trim();
    label = label.replace(/\s+[—\-–].*$/, "").trim();
    if (index >= 1 && index <= 9 && label.length >= 2 && label.length <= 80) {
      out.push({ index, label });
    }
  }
  return out;
}

/** ¿Lucy listó paquetes numerados tipo Coffee Break 1–5? */
export function assistantOfferedNumberedPackages(
  lastAssistantText?: string | null
): boolean {
  const last = lastAssistantText ?? "";
  const menu = parseNumberedMenuFromAssistant(last);
  if (menu.length >= 2) return true;
  return (
    /coffee\s*break\s*[1-9]|coffe{1,2}\s*break\s*[1-9]/i.test(last) ||
    /\d\.\s*\*?coffee\s*break/i.test(last) ||
    (/coffee\s*break|coffe\s*break/i.test(last) &&
      (/paquetes?\s*\(?\s*1\s*a\s*5\s*\)?/i.test(last) ||
        (/coffee\s*break\s*1/i.test(last) && /coffee\s*break\s*5/i.test(last))))
  );
}

function coffeeBreakLabelForIndex(index: number): string {
  return `Coffee Break ${index}`;
}

function menuLooksLikeCoffeeBreak(
  menu: Array<{ index: number; label: string }>,
  lastAssistantText?: string | null
): boolean {
  if (menu.some((x) => /coffee\s*break/i.test(x.label))) return true;
  return /coffee\s*break|coffe\s*break/i.test(lastAssistantText ?? "");
}

/**
 * Resuelve la elección del cliente contra el menú numerado de Lucy.
 * Cubre: "Coffee Break 4", "Coffee Breack 4", "sí del 4", "el 4", "opción 4", "4".
 */
export function resolveNumberedPackageChoice(
  clientText: string | null | undefined,
  lastAssistantText?: string | null
): NumberedPackageChoice | null {
  const raw = clientText?.trim() ?? "";
  if (!raw) return null;
  const normalized = normalizeServiceChoiceText(raw);
  const t = normalized.toLowerCase();
  const menu = parseNumberedMenuFromAssistant(lastAssistantText);
  const coffeeMenu = menuLooksLikeCoffeeBreak(menu, lastAssistantText);
  const offered =
    assistantOfferedNumberedPackages(lastAssistantText) || menu.length >= 2;

  // 1) "Coffee Break N" / typo ya normalizado
  const coffeeNamed = t.match(/\bcoffee\s*break\s*([1-9])\b/i);
  if (coffeeNamed) {
    const index = parseInt(coffeeNamed[1]!, 10);
    const fromMenu = menu.find((x) => x.index === index);
    return {
      index,
      label: fromMenu?.label ?? coffeeBreakLabelForIndex(index),
      isCoffeeBreak: true,
    };
  }

  if (!offered && !menu.length) return null;

  // 2) "sí del 4" / "si el 4" / "quiero el 4" / "me late el 4" / "del 4"
  const affirmIndex =
    t.match(
      /^(?:si|sí|dale|ok|okay|claro|va|por\s+favor|porfa)?[\s,.]*(?:del?|el|la|opci[oó]n(?:es)?|paquete|nivel)\s*([1-9])(?:\s*[.)!]*)?$/i
    ) || t.match(/\b(?:del?|el|la)\s*([1-9])\b/i);
  if (affirmIndex && (coffeeMenu || offered)) {
    const index = parseInt(affirmIndex[1]!, 10);
    const fromMenu = menu.find((x) => x.index === index);
    if (fromMenu || coffeeMenu) {
      return {
        index,
        label:
          fromMenu?.label ??
          (coffeeMenu ? coffeeBreakLabelForIndex(index) : `opción ${index}`),
        isCoffeeBreak: coffeeMenu || /coffee/i.test(fromMenu?.label ?? ""),
      };
    }
  }

  // 3) "opción N" / "paquete N" / "nivel N"
  const opcionN = t.match(/\b(?:opci[oó]n(?:es)?|paquete|nivel)\s*([1-9])\b/i);
  if (opcionN) {
    const index = parseInt(opcionN[1]!, 10);
    const fromMenu = menu.find((x) => x.index === index);
    if (fromMenu || coffeeMenu) {
      return {
        index,
        label: fromMenu?.label ?? coffeeBreakLabelForIndex(index),
        isCoffeeBreak: coffeeMenu || /coffee/i.test(fromMenu?.label ?? ""),
      };
    }
  }

  // 4) Bare "4" / "el 4" / "4."
  const bare =
    t.match(/^(?:el\s+|la\s+)?([1-9])\s*[.)]?$/i) ||
    t.match(/^\s*([1-9])\s*[.)]?\s*$/);
  if (bare && (menu.length || coffeeMenu)) {
    const index = parseInt(bare[1]!, 10);
    const fromMenu = menu.find((x) => x.index === index);
    if (fromMenu || coffeeMenu) {
      return {
        index,
        label: fromMenu?.label ?? coffeeBreakLabelForIndex(index),
        isCoffeeBreak: coffeeMenu || /coffee/i.test(fromMenu?.label ?? ""),
      };
    }
  }

  // 5) "2. Servicio completo" / match por label del menú
  if (menu.length) {
    const numbered = t.match(/^\s*(\d+)\s*[.)]?\s+(.+)$/i);
    if (numbered) {
      const hit = menu.find((x) => x.index === parseInt(numbered[1]!, 10));
      if (hit) {
        return {
          index: hit.index,
          label: hit.label,
          isCoffeeBreak: /coffee/i.test(hit.label),
        };
      }
    }
    const tf = foldLabel(normalized);
    for (const n of menu) {
      const lf = foldLabel(n.label);
      if (!lf) continue;
      if (tf === lf || tf.includes(lf) || lf.includes(tf)) {
        return {
          index: n.index,
          label: n.label,
          isCoffeeBreak: /coffee/i.test(n.label),
        };
      }
    }
  }

  return null;
}

/** True si el mensaje elige un nivel/paquete del menú (o Coffee Break N explícito). */
export function isNumberedPackageSelection(
  clientText: string | null | undefined,
  lastAssistantText?: string | null
): boolean {
  return resolveNumberedPackageChoice(clientText, lastAssistantText) != null;
}

/**
 * Si el cliente eligió paquete N, ese dígito NUNCA es invitados.
 * Limpia num_invitados contaminado por GPT/CRM.
 */
export function clearGuestsConfusedWithPackageLevel(
  extracted: { num_invitados?: number | null },
  clientText: string | null | undefined,
  lastAssistantText?: string | null
): void {
  const choice = resolveNumberedPackageChoice(clientText, lastAssistantText);
  if (!choice) {
    const n = normalizeServiceChoiceText(clientText ?? "").match(
      /\bcoffee\s*break\s*([1-9])\b/i
    );
    if (n && extracted.num_invitados === parseInt(n[1]!, 10)) {
      extracted.num_invitados = null;
    }
    return;
  }
  if (extracted.num_invitados === choice.index) {
    extracted.num_invitados = null;
  }
}

/** Último mensaje assistant con menú numerado en el historial. */
export function findLastNumberedPackageOffer(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.role !== "assistant" || typeof m.content !== "string") continue;
    if (
      assistantOfferedNumberedPackages(m.content) ||
      parseNumberedMenuFromAssistant(m.content).length >= 2
    ) {
      return m.content;
    }
  }
  return null;
}
