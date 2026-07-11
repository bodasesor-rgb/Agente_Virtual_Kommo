/**
 * Correos propios de Bodasesor — nunca son el correo del cliente.
 */

const OWN_EMAILS = new Set(
  [
    "capybaraeventos@gmail.com",
    "bodasesor@gmail.com",
    "hola@bodasesor.com",
    "ventas@bodasesor.com",
    "info@bodasesor.com",
  ].map((e) => e.toLowerCase())
);

export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase() ?? "";
  return trimmed || null;
}

export function isOwnCompanyEmail(email: string | null | undefined): boolean {
  const norm = normalizeEmail(email);
  if (!norm) return false;
  if (OWN_EMAILS.has(norm)) return true;
  return /@bodasesor\.com$/i.test(norm) || /@capybaraeventos\./i.test(norm);
}

/** Devuelve el correo solo si es del cliente (no buzón propio). */
export function filterClientEmail(email: string | null | undefined): string | null {
  const norm = normalizeEmail(email);
  if (!norm || isOwnCompanyEmail(norm)) return null;
  return email!.trim();
}

const SUSPICIOUS_TLD = /\.(comm|con|cmo|gmial|gmal|gmai|hotmial|yaho|outlok)\b/i;

/** Dominio/TLD básico — detecta typos como gmail.comm antes de guardar. */
export function looksLikeValidClientEmail(email: string | null | undefined): boolean {
  const norm = normalizeEmail(email);
  if (!norm) return false;
  if (/\s/.test(email ?? "")) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(norm)) return false;
  const domain = norm.split("@")[1] ?? "";
  if (!domain || /\.\./.test(domain) || domain.startsWith(".") || domain.endsWith(".")) return false;
  if (SUSPICIOUS_TLD.test(domain)) return false;
  const tld = domain.split(".").pop() ?? "";
  return tld.length >= 2 && /^[a-z]{2,}$/i.test(tld);
}

export function buildEmailConfirmationPrompt(email: string): string {
  return `¿Me confirmas tu correo? Lo leí como ${email.trim()}, quiero anotarlo bien.`;
}
