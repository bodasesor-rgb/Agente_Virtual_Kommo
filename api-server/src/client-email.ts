/**
 * Correos propios de Bodasesor — nunca son el correo del cliente.
 */
import { editDistance } from "./lib/locationDedupe.js";

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
  // A15165: "Am@gmial" / host typo sin TLD ya falló arriba; también host "gmial".
  if (/^(gmial|gmal|gmai|hotmial|yaho|outlok)(\.|$)/i.test(domain)) return false;
  const tld = domain.split(".").pop() ?? "";
  return tld.length >= 2 && /^[a-z]{2,}$/i.test(tld);
}

/**
 * A15165: no persistir basura tipo "Am@gmial" / "A.gmail.com".
 * Solo correos parseables y con forma válida.
 */
export function sanitizeStoredClientEmail(email: string | null | undefined): string | null {
  const filtered = filterClientEmail(email);
  if (!filtered) return null;
  if (!looksLikeValidClientEmail(filtered)) return null;
  return filtered;
}

const COMMON_EMAIL_HOSTS = ["gmail", "hotmail", "outlook", "yahoo", "icloud"];

/**
 * A16437: "ruizmimi508@gmaio.com" → "ruizmimi508@gmail.com" (typo de dominio común).
 * null si el dominio ya es correcto o no se parece a ninguno conocido.
 */
export function suggestEmailDomainFix(email: string | null | undefined): string | null {
  const norm = normalizeEmail(email);
  const m = norm?.match(/^([^\s@]+)@([a-z0-9-]+)((?:\.[a-z]{2,})*)$/i);
  if (!m) return null;
  const [, user, host, rest] = m as unknown as [string, string, string, string];
  const tld = rest || ".com";
  const badTld = /^\.(comm?|con|cmo|co)$/i.test(tld) && tld !== ".com" && !/^\.com\.mx$/i.test(tld);
  if (COMMON_EMAIL_HOSTS.includes(host)) {
    return badTld ? `${user}@${host}.com` : null;
  }
  for (const h of COMMON_EMAIL_HOSTS) {
    if (Math.abs(h.length - host.length) <= 2 && editDistance(host, h) <= 2) {
      return `${user}@${h}${badTld ? ".com" : tld}`;
    }
  }
  return null;
}

export function buildEmailConfirmationPrompt(email: string): string {
  return `¿Me confirmas tu correo? Lo leí como ${email.trim()}, quiero anotarlo bien.`;
}
