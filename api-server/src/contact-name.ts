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
