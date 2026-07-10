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
