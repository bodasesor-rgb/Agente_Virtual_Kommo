/**
 * Utilidades para resolver el nombre del cliente desde WhatsApp/Kommo
 * sin usar teléfonos ni placeholders del CRM como nombre visible.
 */

const PHONE_LIKE =
  /^\+?\d[\d\s\-().]{7,}$/;

const PLACEHOLDER_PATTERNS = [
  /^nuevo\s+lead$/i,
  /^lead\s*#?\d+$/i,
  /^contacto\s*#?\d+$/i,
  /^whatsapp\s*#?\d+$/i,
  /^sin\s+nombre$/i,
  /^unknown$/i,
  /^cliente$/i,
  /^\d+$/,
];

/** Saludos y frases que NO son nombres de persona. */
const GREETING_NAME_PATTERN =
  /^(hola|hello|hi|hey|buen|buenos?|buenas?|d[ií]as?|tardes?|noches?|saludos?|gracias|ok|vale|s[ií]|no|qu[eé]|tal|ayuda|info|cotizaci[oó]n|evento|banquete|taquiza|quiero|necesito|requiero|busco|me|comunico|hablo|escribo)$/i;

/** Cap&Bara / Bodasesor / Lucy — preguntas de canal, no nombre del cliente. */
const COMPANY_OR_CHANNEL_PATTERN =
  /cap\s*[&y]?\s*bara|capbata|capybara|bodasesor|cap\s*and\s*bara|con\s+lucy\b|agente\s+virtual/i;

/** Verbos de frase/pregunta — el mensaje no es un nombre propio. */
const SENTENCE_VERB_PATTERN =
  /\b(comunico|comunica|hablo|llamo|escribo|quiero|necesito|busco|me\s+interesa|cotizar|organizar|contratar|tienen|tiene|tienes|ofrecen|ofrece|manejan|maneja|pueden|puede|puedo|gustar[ií]a|hay|cuenta|cuentan)\b/i;

/** Intención de cotización — no es el nombre del cliente ("Quiero hacer una cotización"). */
export function isQuoteIntentMessage(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/^soy\s+/i.test(t) || /^me\s+llamo\s+/i.test(t)) return false;
  return (
    /^(quiero|necesito|requiero|busco|me\s+interesa)\b/i.test(t) ||
    /\b(hacer\s+una?\s+)?cotiz/i.test(t) ||
    /\bquiero\s+(hacer|una|un)\b/i.test(t)
  );
}

/** Mensaje del cliente que es solo saludo o pedido genérico (no es su nombre). */
export function isGreetingOnlyMessage(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/^soy\s+/i.test(t) || /^me\s+llamo\s+/i.test(t)) return false;

  const normalized = t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[!?.,…¡¿]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // "hola", "hola buen dia", "buen dia", "buenos dias", etc.
  const withoutHola = normalized.replace(/^(hola|hello|hi|hey)\s+/, "");
  if (/^(hola|hello|hi|hey)$/.test(normalized)) return true;
  if (
    /^(buen(os|as)?\s+)?(dias?|tardes?|noches?)(\s+(a\s+todos|equipo))?$/.test(withoutHola)
  ) {
    return true;
  }
  if (/^que\s*tal$/.test(normalized) || /^buenas?$/.test(normalized) || /^saludos?$/.test(normalized)) {
    return true;
  }
  return false;
}

/** ¿Todos los tokens parecen partes de un nombre propio (nombre + apellidos)? */
export function looksLikePersonFullName(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  const parts = t.split(/\s+/);
  if (parts.length < 2 || parts.length > 5) return false;
  return parts.every((part) => {
    const letters = part.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
    if (/^[A-Za-zÁÉÍÓÚÜÑ]\.?$/.test(part) && letters.length >= 1) return true;
    return letters.length >= 2 && !GREETING_NAME_PATTERN.test(letters) && !/^\d+$/.test(letters);
  });
}

/**
 * True si el texto NO debe tratarse como nombre de persona
 * (saludo, pregunta, Cap&Bara/empresa, frase con verbo, ubicación…).
 */
export function isLikelyNotPersonNameMessage(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return true;
  // Presentación explícita sí puede ser nombre.
  if (/^(soy|me\s+llamo|mi\s+nombre\s+es)\s+/i.test(t)) return false;
  if (/^c[oó]mo\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}/i.test(t) && t.split(/\s+/).length <= 5) return false;

  // Pregunta / verbo de servicio ANTES de looksLikePersonFullName:
  // "Tienes Crepas Para Eventos" matcheaba como "nombre completo" (4 tokens).
  if (/\?/.test(t)) return true;
  if (SENTENCE_VERB_PATTERN.test(t)) return true;
  if (isGreetingOnlyMessage(t) || isQuoteIntentMessage(t) || isAffirmativeOnlyMessage(t)) return true;
  if (isLikelyUbicacionNotNombre(t)) return true;
  if (COMPANY_OR_CHANNEL_PATTERN.test(t)) return true;
  // Servicio del catálogo sin verbo ("crepas para eventos", "barra de sushi").
  if (
    /\b(crepas?|sushi|poke|banquete|taquiza|coffee\s*break|barra\s+de|dj|carpas?|pista|tarima|helado|frutas?)\b/i.test(
      t
    ) &&
    !/^(soy|me\s+llamo)/i.test(t)
  ) {
    return true;
  }

  // "Patricia Campos López" / "María José Pérez García" sin "me llamo" sigue siendo nombre.
  if (looksLikePersonFullName(t)) return false;

  // Frase larga sin forma de nombre ≠ nombre.
  if (t.split(/\s+/).length >= 4) return true;
  return false;
}

/** Cliente pregunta si habla con Cap&Bara / Bodasesor / el canal correcto. */
export function clientAsksCompanyIdentity(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.trim();
  if (!COMPANY_OR_CHANNEL_PATTERN.test(t) && !/cap\s*[&y]?\s*bata/i.test(t)) return false;
  return (
    /\?/i.test(t) ||
    /\b(comunico|hablo|escribo|estoy|este\s+(es|chat|n[uú]mero)|es\s+(el|la)|son)\b/i.test(t)
  );
}

export function buildCompanyIdentityReply(clientName?: string | null): string {
  // En chat solo primer nombre; el CRM puede tener apellido.
  const nombre = sanitizeDisplayName(clientName);
  const base =
    "Sí, soy Lucy de Bodasesor (Cap&Bara Eventos). Te ayudo a armar tu cotización por aquí.";
  return nombre ? `${base} ¿Seguimos, ${nombre}?` : `${base} ¿Me regalas tu nombre para iniciar?`;
}

/** Colonia/ciudad — no es nombre de persona ("Narvarte CDMX", "Polanco"). */
export function isLikelyUbicacionNotNombre(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t || /^(me llamo|soy)\s+/i.test(t)) return false;
  if (
    /\b(cdmx|cd\.?\s*m\.?x\.?|ciudad de m[eé]xico|polanco|narvarte|santa\s*fe|cuernavaca|morelos|coyoac[aá]n|tlalpan|sat[eé]lite|interlomas|expo\s+santa)\b/i.test(
      t
    ) &&
    t.split(/\s+/).length <= 5
  ) {
    return true;
  }
  return false;
}

/** "sí", "ok", "claro" — afirmación, no es el nombre del cliente. */
export function isAffirmativeOnlyMessage(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /^(s[ií]|ok|vale|claro|de\s+acuerdo|por\s+supuesto|perfecto|correcto|exacto|as[ií]\s+es)[.!?\s,]*$/i.test(t);
}

export function isPlaceholderLeadName(name: string | null | undefined): boolean {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return true;
  if (trimmed.length < 2) return true;
  if (PHONE_LIKE.test(trimmed.replace(/\s/g, ""))) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed));
}

/** Primer nombre legible para saludos (Mucho gusto, María). */
export function sanitizeDisplayName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || isPlaceholderLeadName(trimmed)) return null;
  if (isGreetingOnlyMessage(trimmed)) return null;

  const cleaned = trimmed
    .replace(/^Lead:\s*/i, "")
    .replace(/[~_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || isPlaceholderLeadName(cleaned)) return null;
  if (isGreetingOnlyMessage(cleaned)) return null;

  const firstToken = cleaned.split(/\s+/)[0] ?? "";
  const firstName = firstToken.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
  if (!firstName || firstName.length < 2) return null;
  if (/^(el|la|los|las|un|una)$/i.test(firstName)) return null;
  if (/^\d+$/.test(firstName)) return null;
  if (GREETING_NAME_PATTERN.test(firstName)) return null;
  if (isQuoteIntentMessage(trimmed)) return null;
  if (isLikelyUbicacionNotNombre(trimmed)) return null;

  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

/** Nombre completo para CRM (conserva apellido cuando viene de WhatsApp/Kommo). */
export function sanitizeCrmNombre(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || isPlaceholderLeadName(trimmed) || isQuoteIntentMessage(trimmed)) return null;
  if (isGreetingOnlyMessage(trimmed)) return null;
  if (isLikelyUbicacionNotNombre(trimmed)) return null;
  if (isLikelyNotPersonNameMessage(trimmed)) return null;

  const cleaned = trimmed
    .replace(/^Lead:\s*/i, "")
    .replace(/[~_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || isPlaceholderLeadName(cleaned)) return null;
  if (isGreetingOnlyMessage(cleaned)) return null;
  if (isLikelyNotPersonNameMessage(cleaned)) return null;

  const parts = cleaned.split(/\s+/).filter((part) => {
    const trimmed = part.trim();
    const letters = trimmed.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
    if (/^[A-Za-zÁÉÍÓÚÜÑ]\.?$/.test(trimmed) && letters.length >= 1) return true;
    return letters.length >= 2 && !GREETING_NAME_PATTERN.test(letters) && !/^\d+$/.test(letters);
  });

  if (parts.length === 0) return sanitizeDisplayName(cleaned);

  return parts
    .slice(0, 4)
    .map((part) => {
      const trimmed = part.trim();
      if (/^[A-Za-zÁÉÍÓÚÜÑ]\.$/.test(trimmed)) {
        return `${trimmed.charAt(0).toUpperCase()}.`;
      }
      const letters = trimmed.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
      return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Nunca sobrescribir un nombre existente con uno más corto (menos palabras). */
export function shouldUpdateName(current?: string, incoming?: string): boolean {
  const c = (current ?? "").trim();
  const i = (incoming ?? "").trim();
  if (!i) return false;
  if (!c) return true;
  return isNombreMoreComplete(i, c);
}

function normalizeNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** ¿El nombre entrante parece la misma persona que el ya guardado? */
export function namesAreLikelySamePerson(
  existing: string | null | undefined,
  incoming: string | null | undefined
): boolean {
  const e = sanitizeCrmNombre(existing) ?? sanitizeDisplayName(existing);
  const i = sanitizeCrmNombre(incoming) ?? sanitizeDisplayName(incoming);
  if (!e || !i) return true;
  const te = normalizeNameTokens(e);
  const ti = normalizeNameTokens(i);
  if (!te.length || !ti.length) return true;
  if (te[0] === ti[0]) return true;
  return te.some((t) => ti.includes(t)) || ti.some((t) => te.includes(t));
}

export function buildNameConfirmationPrompt(existing: string, incoming: string): string {
  return `Para anotarte bien: ¿eres ${incoming.trim()} o sigo contigo como ${existing.trim()}?`;
}

/** Cuenta palabras con letras válidas en un nombre. */
export function nombreWordCount(name: string | null | undefined): number {
  const crm = sanitizeCrmNombre(name);
  if (!crm) return sanitizeDisplayName(name) ? 1 : 0;
  return crm.split(/\s+/).filter(Boolean).length;
}

/** True si `candidate` es igual o más completo que `existing` (nunca recortar apellido). */
export function isNombreMoreComplete(
  candidate: string | null | undefined,
  existing: string | null | undefined
): boolean {
  const c = sanitizeCrmNombre(candidate) ?? sanitizeDisplayName(candidate);
  const e = sanitizeCrmNombre(existing) ?? sanitizeDisplayName(existing);
  if (!c) return false;
  if (!e) return true;
  const cw = nombreWordCount(c);
  const ew = nombreWordCount(e);
  if (cw > ew) return true;
  if (cw < ew) return false;
  return c.length >= e.length;
}

export function pickBetterNombre(
  candidate: string | null | undefined,
  existing: string | null | undefined
): string | null {
  if (isNombreMoreComplete(candidate, existing)) {
    return sanitizeCrmNombre(candidate) ?? sanitizeDisplayName(candidate);
  }
  return sanitizeCrmNombre(existing) ?? sanitizeDisplayName(existing);
}

export function resolveClientDisplayName(
  extractedNombre: string | null | undefined,
  crmNombre: string | null | undefined,
  whatsappName: string | null | undefined
): string | null {
  return (
    sanitizeDisplayName(extractedNombre) ??
    sanitizeDisplayName(crmNombre) ??
    sanitizeDisplayName(whatsappName)
  );
}
