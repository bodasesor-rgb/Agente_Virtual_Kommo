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
  /^(hola|hello|hi|hey|buenos?|buenas?|saludos?|gracias|ok|vale|s[ií]|no|qu[eé]|tal|ayuda|info|cotizaci[oó]n|evento|banquete|taquiza|quiero|necesito|requiero|busco)$/i;

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
  if (/^soy\s+/i.test(t)) return false;
  return (
    /^hola[.!?\s,]*$/i.test(t) ||
    /^buen(os|as)?\s*(d[ií]as|tardes|noches)?[.!?\s,]*$/i.test(t) ||
    /^qu[eé]\s*tal[.!?\s,]*$/i.test(t) ||
    /^buenas?[.!?\s,]*$/i.test(t) ||
    /^saludos?[.!?\s,]*$/i.test(t)
  );
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

  const cleaned = trimmed
    .replace(/^Lead:\s*/i, "")
    .replace(/[~_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || isPlaceholderLeadName(cleaned)) return null;

  const firstToken = cleaned.split(/\s+/)[0] ?? "";
  const firstName = firstToken.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
  if (!firstName || firstName.length < 2) return null;
  if (/^\d+$/.test(firstName)) return null;
  if (GREETING_NAME_PATTERN.test(firstName)) return null;
  if (isQuoteIntentMessage(trimmed)) return null;

  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
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
