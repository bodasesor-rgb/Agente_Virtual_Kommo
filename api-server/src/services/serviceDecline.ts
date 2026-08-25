/**
 * A15295 — Declinar / quitar servicios (todas las ramas).
 *
 * "no quiero comida", "quítale los alimentos", "yo les voy a dar pizza"
 * debe QUITAR la familia del CRM, no re-anotar ni tirar catálogo.
 */
import { clientCaptionForServiceParse } from "./imageProcessor.js";
import { isTablewareRequestText } from "../conversation-understanding.js";

/** Familias de servicio que el cliente puede rechazar explícitamente. */
export type DeclinedServiceFamily =
  | "alimentos"
  | "bebidas"
  | "mobiliario"
  | "carpas"
  | "decoracion"
  | "entretenimiento"
  | "pista"
  | "dulces";

/** Match de labels CRM / parseServices contra cada familia. */
const FAMILY_SERVICE_RE: Record<DeclinedServiceFamily, RegExp> = {
  alimentos:
    /^(Alimentos|Comida)$|banquete|taquiza|catering|pizzas?|barra\s+de\s+(pizzas?|pastas?|alimentos|sushi)|brunch|parrillada|sushi|canap|bocadillo|coffee\s*break|puestos?\s+de\s+comida|desayuno|paella|pozole|pasta/i,
  bebidas:
    /bebidas?|barra\s+de\s+bebidas|coctel|m[oó]cteles|mixolog|barra\s+de\s+caf[eé]/i,
  mobiliario: /mobiliario|sillas?|mesas?(?!\s+de\s+(postres?|dulces?|quesos?|imperial))|periqueras?|salas?\s+lounge|tiffany/i,
  carpas: /carpas?|capras?|toldos?|lonas?/i,
  decoracion: /decoraci[oó]n|centros?\s+de\s+mesa|florister|globos?|tem[aá]tica/i,
  entretenimiento: /show|dj\b|entretenimiento|hora\s+loca|photobooth|photo\s*booth|bailarinas|batucada|robots?/i,
  pista: /pista|tarima/i,
  dulces: /mesa\s+de\s+dulces|postres?|cupcakes?|bet[uú]n|candy/i,
};

/** "mesa de postre" al declinar ≠ mobiliario (mesas/sillas). */
function isMesaDulcesDeclinePhrase(t: string): boolean {
  return (
    /\bno\s+(?:quiero|necesito|pedimos|pido)\s+mesa\s+de\s+(postres?|dulces?|quesos?)\b/i.test(t) ||
    /\bno\s+(?:quiero|necesito)\s+(postres?|dulces?)\b/i.test(t) ||
    /\bsin\s+mesa\s+de\s+(postres?|dulces?|quesos?)\b/i.test(t) ||
    /\bqu[ií]ta(le|me)?\s+(?:la\s+)?mesa\s+de\s+(postres?|dulces?|quesos?)\b/i.test(t)
  );
}

/** Palabras que el cliente usa al rechazar cada familia. */
const FAMILY_DECLINE_WORDS: Record<DeclinedServiceFamily, string> = {
  alimentos:
    "comida|comidas|alimentos?|pizzas?|banquete|taquiza|catering|barra\\s+de\\s+pizzas?|brunch|parrillada|sushi|canap[eé]s?|bocadillos?|coffee\\s*break",
  bebidas: "bebidas?|barra\\s+de\\s+bebidas|cocteler[ií]a|m[oó]cteles?|mixolog[ií]a",
  mobiliario: "mobiliario|sillas?|mesas?|periqueras?|salas?",
  carpas: "carpas?|capras?|toldos?|lonas?",
  decoracion: "decoraci[oó]n|centros?\\s+de\\s+mesa|flores?|globos?",
  entretenimiento: "show|dj|entretenimiento|hora\\s+loca|photobooth|photo\\s*booth",
  pista: "pista|tarima",
  dulces: "mesa\\s+de\\s+dulces|mesa\\s+de\\s+postres?|postres?|dulces?|cupcakes?",
};

function captionOf(message?: string | null): string {
  if (!message?.trim()) return "";
  return (clientCaptionForServiceParse(message) || message).trim();
}

/**
 * Familias que el cliente está rechazando / pidiendo quitar en este mensaje.
 */
export function clientDeclinesServiceFamilies(
  message?: string | null
): DeclinedServiceFamily[] {
  const t = captionOf(message).toLowerCase();
  if (!t) return [];

  const out = new Set<DeclinedServiceFamily>();

  // Cliente trae su propia comida/pizza → declina alimentos Bodasesor.
  if (
    /\b(yo\s+)?(ya\s+)?(les\s+|le\s+)?(voy\s+a\s+dar|doy|pondr[eé]|llevo|traigo)\b/i.test(t) &&
    /\b(pizza|comida|alimentos?|banquete|taquiza)\b/i.test(t)
  ) {
    out.add("alimentos");
  }
  // "por qué yo ya les voy a dar" / "porque yo..." (pizza puede ir en otro msg)
  if (
    /\b(porque|por\s*qu[eé])\s+yo\b/i.test(t) &&
    /\b(dar|doy|pondr|voy\s+a\s+dar|comida|pizza|alimentos|les\s+voy)\b/i.test(t)
  ) {
    out.add("alimentos");
  }
  // "yo ya les voy a dar" / "ya les voy a dar" sin objeto claro de datos
  if (
    /\b(yo\s+)?(ya\s+)?les?\s+voy\s+a\s+dar\b/i.test(t) &&
    !/\b(correo|tel[eé]fono|whatsapp|datos|nombre|ubicaci|direcci[oó]n)\b/i.test(t)
  ) {
    out.add("alimentos");
  }

  // A15503: "no necesito mesa de postre" → dulces (no confundir mesa≠mobiliario).
  if (isMesaDulcesDeclinePhrase(t) && !isTablewareRequestText(t)) {
    out.add("dulces");
  }

  // A15539: "DJ no", "bartender sí, DJ no", "capra sí" estilo checklist.
  if (/\bdj\s+no\b|\bno\s*,?\s*dj\b|\bdj\s*,?\s*no\b/i.test(t)) {
    out.add("entretenimiento");
  }

  for (const family of Object.keys(FAMILY_DECLINE_WORDS) as DeclinedServiceFamily[]) {
    if (family === "mobiliario" && isMesaDulcesDeclinePhrase(t)) continue;
    const words = FAMILY_DECLINE_WORDS[family];
    const reNoQuiero = new RegExp(
      `\\b(no|nop)(?:\\s+pero|\\s+peor)?\\s+(quiero|necesito|pido|pedimos)\\s+(la\\s+|el\\s+|los\\s+|las\\s+)?(${words})\\b`,
      "i"
    );
    const reQuitale = new RegExp(
      `\\b(?:pero|peor\\s+)?(qu[ií]ta(le|me)?|quita(r|mos)?|sacar?|saquen|elimina(r)?)\\s+(la\\s+|el\\s+|los\\s+|las\\s+)?(${words})\\b`,
      "i"
    );
    const reSin = new RegExp(`\\bsin\\s+(${words})\\b`, "i");
    const reQueNo = new RegExp(
      `\\bque\\s+no\\s+(quiero|necesito)\\s+(la\\s+|el\\s+|los\\s+|las\\s+)?(${words})\\b`,
      "i"
    );
    if (reNoQuiero.test(t) || reQuitale.test(t) || reSin.test(t) || reQueNo.test(t)) {
      out.add(family);
    }
  }

  // Typo frecuente: "comoda" ≈ comida
  if (
    /\bno(?:\s+pero|\s+peor)?\s+(quiero\s+)?comoda\b/i.test(t) ||
    /\bqu[ií]tale?\s+la\s+comoda\b/i.test(t) ||
    /\bno\s+quiero\s+comoda\b/i.test(t)
  ) {
    out.add("alimentos");
  }

  return [...out];
}

/**
 * Declines del mensaje actual + aclaraciones de typo del turno anterior
 * (A15295: "No quiero comoda" → "Comida" no debe re-anotar Alimentos).
 */
export function clientDeclinesServiceFamiliesWithContext(
  message?: string | null,
  recentUserTexts: string[] = []
): DeclinedServiceFamily[] {
  const fromCurrent = clientDeclinesServiceFamilies(message);
  const out = new Set(fromCurrent);
  const cur = captionOf(message).trim();
  if (/^(comida|comidas|alimentos?)$/i.test(cur)) {
    const prevBlob = recentUserTexts.slice(-3).join(" \n ");
    if (
      clientDeclinesServiceFamilies(prevBlob).includes("alimentos") ||
      /\bcomoda\b/i.test(prevBlob) ||
      /\bno(?:\s+pero|\s+peor)?\s+no\s+quiero\b/i.test(prevBlob) ||
      /\bqu[ií]tale?\s+la\s+comi/i.test(prevBlob)
    ) {
      out.add("alimentos");
    }
  }
  return [...out];
}

export function clientDeclinesAnyService(message?: string | null): boolean {
  return clientDeclinesServiceFamilies(message).length > 0;
}

export function serviceMatchesDeclinedFamily(
  serviceLabel: string,
  family: DeclinedServiceFamily
): boolean {
  return FAMILY_SERVICE_RE[family].test(serviceLabel.trim());
}

/** ¿Este label pertenece a alguna familia declinada? */
export function serviceIsDeclined(
  serviceLabel: string,
  families: DeclinedServiceFamily[]
): boolean {
  return families.some((f) => serviceMatchesDeclinedFamily(serviceLabel, f));
}

/**
 * Quita del string de requerimientos todos los SKUs de las familias declinadas.
 */
export function removeDeclinedFamiliesFromRequirements(
  existing: string | null | undefined,
  families: DeclinedServiceFamily[]
): string | null {
  if (!existing?.trim() || families.length === 0) {
    return existing?.trim() || null;
  }
  const parts = existing
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !serviceIsDeclined(s, families));
  return parts.length ? parts.join(", ") : null;
}

/** Etiqueta corta para el ack al cliente. */
export function declinedFamilyLabel(family: DeclinedServiceFamily): string {
  switch (family) {
    case "alimentos":
      return "alimentos / comida";
    case "bebidas":
      return "bebidas";
    case "mobiliario":
      return "mobiliario";
    case "carpas":
      return "carpas";
    case "decoracion":
      return "decoración";
    case "entretenimiento":
      return "entretenimiento";
    case "pista":
      return "pista / tarima";
    case "dulces":
      return "mesa de dulces / postres";
  }
}

export function buildServiceDeclineAck(families: DeclinedServiceFamily[]): string {
  if (!families.length) return "Listo, lo quito de la cotización.";
  const labels = families.map(declinedFamilyLabel);
  const list =
    labels.length === 1
      ? labels[0]!
      : labels.length === 2
        ? `${labels[0]} y ${labels[1]}`
        : `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
  return `Listo — *no* incluimos ${list} en tu cotización.`;
}

/**
 * Colores / temática de foto ≠ ubicación del evento (A15295: "rojo y negro").
 */
export function looksLikeThemeColorNotLocation(value: string | null | undefined): boolean {
  const t = (value ?? "").trim();
  if (!t) return false;
  if (/^colores?\b/i.test(t)) return true;
  if (/^tem[aá]tica\b/i.test(t)) return true;
  // "rojo y negro", "azul con dorado", "blanco/negro"
  if (
    /^(blanco|negro|dorado|plateado|rojo|azul|verde|rosa|morado|violeta|gris|beige|dorado)(\s*(y|con|\/|,)\s*(blanco|negro|dorado|plateado|rojo|azul|verde|rosa|morado|violeta|gris|beige))+$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/** Quita colas de color temático de una zona usable. */
export function stripThemeColorsFromZona(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let v = value.trim();
  v = v.replace(
    /,\s*(blanco|negro|dorado|plateado|rojo|azul|verde|rosa|morado|violeta|gris|beige)(\s*(y|con|\/)\s*(blanco|negro|dorado|plateado|rojo|azul|verde|rosa|morado|violeta|gris|beige))*\s*$/i,
    ""
  );
  v = v.replace(/\s*[-–]\s*(rojo|negro|azul|blanco|dorado).*$/i, "");
  return v.trim() || null;
}
