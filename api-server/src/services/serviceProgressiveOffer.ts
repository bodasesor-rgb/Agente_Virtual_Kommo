/**
 * Divulgación progresiva de servicios (V8.68 / A14967 generalizado):
 * 1) Menú corto de opciones + ¿cuál te detallo?
 * 2) Tras elegir / pedir detalle → precios, inclusiones y link de catálogo.
 */

import type { OpenAI } from "openai";

export type ProgressiveFamily =
  | "banquete"
  | "coffee_break"
  | "barra_bebidas"
  | "barra_alimentos"
  | "barra_cafe"
  | "barra_sushi"
  | "taquiza"
  | "parrillada"
  | "mesa_dulces"
  | "mobiliario";

type FamilyDef = {
  family: ProgressiveFamily;
  /** Match familia sin variante concreta. */
  familyPattern: RegExp;
  /** Si matchea, ya eligió variante → ir a detalle. */
  variantPattern: RegExp;
  /** Query Sheet/PDF para el detalle tras elección. */
  detailQueryFromText: (text: string) => string;
  buildMenu: (hint?: string | null) => string;
};

const FAMILIES: FamilyDef[] = [
  {
    family: "banquete",
    familyPattern: /\bbanquetes?\b|\bcatering\b/i,
    variantPattern:
      /\b(formal|mexicano|kosher|navide[nñ]o|\d\s*tiempos?|tres\s*tiempos?|cuatro\s*tiempos?|3\s*tiempos?|4\s*tiempos?)\b/i,
    detailQueryFromText: (text) => {
      if (/\b(4\s*tiempos?|cuatro\s*tiempos?|mexicano)\b/i.test(text)) {
        return "Banquete Mexicano 4 tiempos";
      }
      if (/\bkosher\b/i.test(text)) return "Banquete Kosher";
      if (/\bnavide/i.test(text)) return "Banquete Navideño";
      if (/\b(3\s*tiempos?|tres\s*tiempos?|formal)\b/i.test(text)) {
        return "Banquete Formal 3 tiempos";
      }
      return "banquete";
    },
    buildMenu: () =>
      [
        "Claro. En *banquete* manejamos varias opciones:",
        "• *Formal 3 tiempos*",
        "• *Mexicano 4 tiempos*",
        "• Kosher o navideño según la ocasión",
        "",
        "¿De cuál te paso la info más detallada (precios e inclusiones)?",
      ].join("\n"),
  },
  {
    family: "coffee_break",
    familyPattern: /\bcoffee\s*break\b|\bcoffeebreak\b/i,
    variantPattern: /\bcoffee\s*break\s*[1-9]\b|\bcoffe{1,2}e?\s*break\s*[1-9]\b|\bnivel\s*[1-9]\b/i,
    detailQueryFromText: (text) => {
      const m = text.match(/\b(?:coffee\s*break|coffe{1,2}e?\s*break)\s*([1-9])\b/i);
      if (m) return `Coffee Break ${m[1]}`;
      const n = text.match(/\bnivel\s*([1-9])\b/i);
      if (n) return `Coffee Break ${n[1]}`;
      return "Coffee Break";
    },
    buildMenu: () =>
      [
        "Claro. En *Coffee Break* tenemos varios paquetes (1 a 5), del más esencial al más completo.",
        "",
        "¿De cuál te paso la info detallada (qué incluye y precio), o prefieres que te diga la diferencia entre ellos?",
      ].join("\n"),
  },
  {
    family: "barra_sushi",
    familyPattern: /\bbarra\s+de\s+sushi\b|\bsushi\b|\bpoke\b/i,
    variantPattern:
      /\b(solo\s+alimentos|b[aá]sic[oa]|tradicional|premium)\b/i,
    detailQueryFromText: () => "Barra de sushi",
    buildMenu: () =>
      [
        "Claro. En *Barra de sushi* manejamos varios niveles (Solo Alimentos, Básico, Tradicional, Premium).",
        "",
        "¿Te paso la info detallada de algún nivel, o quieres ver todos con precios e inclusiones?",
      ].join("\n"),
  },
  {
    family: "barra_cafe",
    familyPattern: /\bbarra\s+de\s+caf[eé]\b|\bcafeter[ií]a\b|\bbarista\b/i,
    variantPattern: /\b(solo\s+alimentos|b[aá]sic[oa]|tradicional|premium)\b/i,
    detailQueryFromText: () => "Barra de Café",
    buildMenu: () =>
      [
        "Claro. En *Barra de Café* manejamos niveles con baristas y bebidas artesanales.",
        "",
        "¿Te paso la info detallada (precios e inclusiones) de algún nivel?",
      ].join("\n"),
  },
  {
    family: "barra_bebidas",
    familyPattern: /\bbarra\s+(de\s+)?bebidas?\b|\bbebidas?\s+alcoh[oó]licas?\b|\bmixolog/i,
    variantPattern: /\b(solo\s+alimentos|b[aá]sic[oa]|tradicional|premium|americana|yucateca)\b/i,
    detailQueryFromText: (text) => {
      if (/yucateca/i.test(text)) return "Barra Yucateca";
      if (/americana/i.test(text)) return "Barra Americana";
      return "Barra de bebidas";
    },
    buildMenu: () =>
      [
        "Claro. En bebidas manejamos *Barra de bebidas*, *Barra Americana*, *Barra Yucateca* y opciones de mixología.",
        "",
        "¿De cuál te paso la info más detallada?",
      ].join("\n"),
  },
  {
    family: "barra_alimentos",
    familyPattern:
      /\bbarra\s+de\s+(alimentos|pizzas?|pastas?|crepas?|mariscos?|paninis?)\b|\bbarras?\s+tem[aá]ticas?\b/i,
    variantPattern:
      /\b(pizzas?|pastas?|crepas?|mariscos?|paninis?|americana|yucateca|solo\s+alimentos|b[aá]sic|tradicional|premium)\b/i,
    detailQueryFromText: (text) => {
      if (/pizza/i.test(text)) return "Barra de pizzas";
      if (/pasta/i.test(text)) return "Barra de pastas";
      if (/crepa/i.test(text)) return "Barra de Crepas";
      if (/marisco/i.test(text)) return "Barra de mariscos";
      if (/panini/i.test(text)) return "Barra de paninis";
      if (/yucateca/i.test(text)) return "Barra Yucateca";
      if (/americana/i.test(text)) return "Barra Americana";
      return "Barra de alimentos";
    },
    buildMenu: () =>
      [
        "Claro. En barras de alimentos manejamos varias:",
        "• Pizzas, pastas, crepas, mariscos, paninis",
        "• Americana, Yucateca y más",
        "",
        "¿De cuál te paso la info más detallada?",
      ].join("\n"),
  },
  {
    family: "taquiza",
    familyPattern: /\btaquiza\b|\btacos?\b/i,
    variantPattern: /\b(solo\s+alimentos|b[aá]sic[oa]|tradicional|premium)\b/i,
    detailQueryFromText: () => "taquiza",
    buildMenu: () =>
      [
        "Claro. En *taquiza* manejamos varios niveles (Solo Alimentos, Básico, Tradicional, Premium).",
        "",
        "¿Te paso la info detallada de algún nivel (precios e inclusiones)?",
      ].join("\n"),
  },
  {
    family: "parrillada",
    familyPattern: /\bparrillada\b/i,
    variantPattern: /\bargentina\b|\btacos?\b|\b(solo\s+alimentos|b[aá]sic|tradicional|premium)\b/i,
    detailQueryFromText: (text) =>
      /argentina/i.test(text) ? "Parrillada Argentina" : "parrillada",
    buildMenu: () =>
      [
        "Claro. En *parrillada* tenemos opciones (incluida argentina según disponibilidad).",
        "",
        "¿Te paso la info más detallada de alguna?",
      ].join("\n"),
  },
  {
    family: "mesa_dulces",
    familyPattern: /\bmesa\s+de\s+(dulces|postres|quesos)\b/i,
    variantPattern: /\bmesa\s+de\s+(quesos|postres|dulces)\b|\bcupcakes?\b|\bbet[uú]n\b/i,
    detailQueryFromText: (text) => {
      if (/queso/i.test(text)) return "Mesa de quesos";
      if (/postre/i.test(text)) return "Mesa de postres";
      return "Mesa de dulces";
    },
    buildMenu: () =>
      [
        "Claro. En dulce manejamos *mesa de dulces*, *mesa de postres* y *mesa de quesos*.",
        "",
        "¿De cuál te paso la info más detallada?",
      ].join("\n"),
  },
  {
    family: "mobiliario",
    familyPattern: /\bmobiliario\b|\bperiqueras?\b|\bsalas?\s+lounge\b|\bmesas?\s+y\s+sillas?\b|\brenta\s+de\s+mesas/i,
    // "mesas y sillas" / periqueras ya son pedido concreto → detalle, no menú genérico.
    variantPattern:
      /\b(periqueras?|lounge|luxor|tiffany|crossback|imperial|manteler[ií]a|vajilla|mesas?\s+y\s+sillas?|renta\s+de\s+mesas)\b/i,
    detailQueryFromText: (text) => {
      if (/periquera/i.test(text)) return "periqueras";
      if (/lounge|luxor/i.test(text)) return "salas lounge";
      if (/mesas?|sillas?/i.test(text)) return "mesas y sillas";
      return "mobiliario";
    },
    buildMenu: () =>
      [
        "Claro. En *mobiliario* manejamos mesas y sillas, salas lounge, periqueras y más opciones de renta.",
        "",
        "¿De qué te paso la info más detallada?",
      ].join("\n"),
  },
];

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Fingerprint del menú progresivo (opciones antes de detalle). */
export function isProgressiveOptionsMenuReply(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return /info m[aá]s detallada|te paso la info|¿De cu[aá]l te paso|¿Te paso la info|opciones principales|¿Cu[aá]l estilo te late|diferencia entre ellos/i.test(
    text
  );
}

/** Menú de opciones ya ofrecido por Lucy (anti-repetición). */
export function historyOfferedServiceOptionsMenu(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  return history
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .some((m) => isProgressiveOptionsMenuReply(m.content as string));
}

/** SKUs a detallar cuando el cliente dice "sí" sin elegir variante. */
const FAMILY_ALL_DETAIL_QUERIES: Record<ProgressiveFamily, string[]> = {
  banquete: ["Banquete Formal 3 tiempos", "Banquete Mexicano 4 tiempos"],
  coffee_break: ["Coffee Break"],
  barra_bebidas: ["Barra de bebidas", "Barra Americana", "Barra Yucateca"],
  barra_alimentos: ["Barra de pizzas", "Barra de pastas", "Barra de Crepas"],
  barra_cafe: ["Barra de Café"],
  barra_sushi: ["Barra de sushi"],
  taquiza: ["taquiza"],
  parrillada: ["parrillada"],
  mesa_dulces: ["Mesa de dulces", "Mesa de postres", "Mesa de quesos"],
  mobiliario: ["mobiliario"],
};

export function progressiveFamilyDetailQueries(family: ProgressiveFamily): string[] {
  return FAMILY_ALL_DETAIL_QUERIES[family] ?? [family];
}

/** Cliente afirmó el menú sin nombrar variante ("sí", "dale", "todos"). */
export function isBareProgressiveAffirmation(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /^(si|sí|dale|ok|okay|claro|por\s+favor|porfa|va|jalo|me\s+late|todos|todas|el\s+detalle|detallame|detállame|m[aá]ndame\s+(la\s+)?info|dame\s+(la\s+)?info|quiero\s+(ver\s+)?(el\s+)?detalle)[\s.!]*$/i.test(
    t
  );
}

/** Cliente pide detalle / elige tras el menú. */
export function clientWantsServiceDetail(
  text: string | null | undefined,
  history?: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  const n = fold(t);
  if (
    /^(si|sí|dale|ok|okay|claro|por\s+favor|porfa|va|jalo|me\s+late|todos|todas|el\s+detalle|detallame|detállame|m[aá]ndame\s+(la\s+)?info|dame\s+(la\s+)?info|quiero\s+(ver\s+)?(el\s+)?detalle)[\s.!]*$/i.test(
      t
    )
  ) {
    return !!(history && historyOfferedServiceOptionsMenu(history));
  }
  if (
    /\b(dame|pasa|manda|quiero|necesito|me\s+interes[ao])\b.{0,40}\b(detalle|info|informaci[oó]n|precios?|incluye|inclusiones)\b/i.test(
      t
    )
  ) {
    return true;
  }
  // Eligió variante concreta (3 tiempos, formal, coffee break 5, LED…).
  for (const fam of FAMILIES) {
    if (fam.variantPattern.test(t) && fam.familyPattern.test(t + " " + (history ? "" : ""))) {
      return true;
    }
    if (history && historyOfferedServiceOptionsMenu(history) && fam.variantPattern.test(t)) {
      return true;
    }
  }
  // Tras menú de banquete: "el formal", "3 tiempos", "el mexicano"
  if (history && historyOfferedServiceOptionsMenu(history)) {
    if (
      /\b(formal|mexicano|kosher|navide|3\s*tiempos|4\s*tiempos|tres|cuatro|led|iluminada|pintada|vinil|logo|charol|madera|premium|b[aá]sic|tradicional|solo\s+alimentos)\b/i.test(
        t
      )
    ) {
      return true;
    }
  }
  return false;
}

export function detectProgressiveFamily(
  text: string | null | undefined
): ProgressiveFamily | null {
  const t = text?.trim() ?? "";
  if (!t) return null;
  // Más específico primero (sushi/café antes que alimentos/bebidas).
  for (const fam of FAMILIES) {
    if (fam.familyPattern.test(t)) return fam.family;
  }
  return null;
}

function defFor(family: ProgressiveFamily): FamilyDef {
  return FAMILIES.find((f) => f.family === family)!;
}

/** True si el mensaje ya nombra variante/nivel concreto (puede ir a detalle). */
export function hasConcreteServiceVariant(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  for (const fam of FAMILIES) {
    if (fam.familyPattern.test(t) && fam.variantPattern.test(t)) return true;
  }
  // Nivel suelto con servicio en contexto se maneja en clientWantsServiceDetail.
  return false;
}

export function buildProgressiveOptionsMenu(
  family: ProgressiveFamily,
  hint?: string | null
): string {
  return defFor(family).buildMenu(hint);
}

export function resolveDetailQueryForFamily(
  family: ProgressiveFamily,
  text: string
): string {
  return defFor(family).detailQueryFromText(text);
}

/**
 * ¿Debemos mostrar solo el menú (sin dump de precios/inclusiones)?
 * - Familia mencionada sin variante, y aún no ofrecimos menú.
 * - O cliente no ha pedido detalle explícito.
 */
export function shouldOfferOptionsBeforeDetail(opts: {
  currentMessage?: string | null;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  serviceHint?: string | null;
}): { family: ProgressiveFamily; menu: string } | null {
  const msg = opts.currentMessage?.trim() ?? "";
  const blob = `${msg} ${opts.serviceHint ?? ""}`.trim();
  if (!blob) return null;

  const lastAsst = [...opts.history]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string");
  const lastAsstText =
    lastAsst && typeof lastAsst.content === "string" ? lastAsst.content : "";

  // Ya está en paso de niveles / inclusiones → detalle, no menú de familia.
  if (
    /cu[aá]l\s+nivel|qu[eé]\s+nivel|nivel\s+(prefieres|te\s+interes)|niveles disponibles|qu[eé]\s+incluye\s+cada/i.test(
      lastAsstText
    )
  ) {
    return null;
  }

  const family =
    detectProgressiveFamily(msg) ||
    detectProgressiveFamily(opts.serviceHint) ||
    detectProgressiveFamily(blob);
  if (!family) return null;

  // Variante/nivel en el MENSAJE del cliente (no en el hint CRM expandido "Banquete Formal").
  // Pedir "info/detalle" de la familia SIN variante → igual menú primero.
  const famDef = defFor(family);
  const hasVariantNow =
    hasConcreteServiceVariant(msg) ||
    famDef.variantPattern.test(msg) ||
    /\b(b[aá]sic[oa]|tradicional|premium|solo\s+alimentos)\b/i.test(msg);

  if (hasVariantNow) {
    return null;
  }

  // Tras menú: "sí" / "dame el detalle" → no volver a listar opciones.
  if (
    historyOfferedServiceOptionsMenu(opts.history) &&
    clientWantsServiceDetail(msg, opts.history)
  ) {
    return null;
  }

  // "sí el banquete" / confirmación del servicio ya capturado → embudo, no menú.
  // Ojo: \b NO funciona tras "sí" (í no es \w en JS).
  if (
    /^(si|sí)(?:\s|$|[.!,])/i.test(msg) &&
    famDef.familyPattern.test(msg) &&
    !/\b(detalle|info|informaci[oó]n|precio|incluye|opciones|cotiz)/i.test(msg) &&
    (detectProgressiveFamily(opts.serviceHint) === family ||
      (opts.serviceHint && famDef.familyPattern.test(opts.serviceHint)))
  ) {
    return null;
  }

  // Si el historial ya ofreció menú y el cliente no eligió, re-preguntar cuál.
  if (historyOfferedServiceOptionsMenu(opts.history) && msg.length < 80) {
    return {
      family,
      menu: "¿De cuál te paso la info más detallada?",
    };
  }

  if (historyOfferedServiceOptionsMenu(opts.history)) return null;

  return { family, menu: buildProgressiveOptionsMenu(family, opts.serviceHint) };
}

/** Query de detalle tras menú (mensaje actual o hint). */
export function resolveProgressiveDetailQuery(opts: {
  currentMessage?: string | null;
  serviceHint?: string | null;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
}): string | null {
  const msg = opts.currentMessage?.trim() ?? "";
  const hint = opts.serviceHint?.trim() ?? "";
  const userBlob = [
    ...opts.history
      .filter((m) => m.role === "user" && typeof m.content === "string")
      .map((m) => m.content as string)
      .slice(-6),
    msg,
    hint,
  ]
    .filter(Boolean)
    .join(" ");

  const family =
    detectProgressiveFamily(msg) ||
    detectProgressiveFamily(hint) ||
    detectProgressiveFamily(userBlob);
  if (!family) return null;

  if (hasConcreteServiceVariant(msg)) {
    return resolveDetailQueryForFamily(family, `${msg} ${userBlob}`);
  }
  if (clientWantsServiceDetail(msg, opts.history)) {
    const def = defFor(family);
    // "sí" / "dale" sin elegir variante → no armar detalle genérico (re-preguntar afuera).
    if (
      /^(si|sí|dale|ok|okay|claro|por\s+favor|porfa|va|jalo|me\s+late|todos|todas)[\s.!]*$/i.test(
        msg
      ) &&
      !def.variantPattern.test(msg)
    ) {
      return null;
    }
    if (def.variantPattern.test(msg) || def.familyPattern.test(msg)) {
      return resolveDetailQueryForFamily(family, `${msg} ${userBlob}`);
    }
    // Eligió por palabra clave tras el menú ("formal", "3 tiempos", "LED"…).
    if (historyOfferedServiceOptionsMenu(opts.history) && def.variantPattern.test(msg)) {
      return resolveDetailQueryForFamily(family, `${msg} ${userBlob}`);
    }
    if (
      historyOfferedServiceOptionsMenu(opts.history) &&
      /\b(formal|mexicano|kosher|navide|\d\s*tiempos|tres|cuatro|coffee\s*break\s*[1-9]|b[aá]sic|tradicional|premium|solo\s+alimentos)\b/i.test(
        msg
      )
    ) {
      return resolveDetailQueryForFamily(family, `${msg} ${userBlob}`);
    }
  }
  return null;
}
