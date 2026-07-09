/**
 * Acepta nombres de variables usados en Hostinger / Kommo en español
 * además de los nombres canónicos del código.
 */
export function getKommoAccessToken(): string {
  return (
    process.env["KOMMO_ACCESS_TOKEN"]?.trim() ||
    process.env["KOMMO_TOKEN_LARGA_DURACION"]?.trim() ||
    process.env["KOMMO_LONG_LIVED_TOKEN"]?.trim() ||
    ""
  );
}

export function getKommoSubdomain(): string {
  const raw =
    process.env["KOMMO_SUBDOMAIN"]?.trim() ||
    process.env["SUBDOMINIO_KOMMO"]?.trim() ||
    process.env["KOMMO_SUBDOMINIO"]?.trim() ||
    "";
  return raw.replace(/\s+/g, "").toLowerCase();
}

export function isKommoConfigured(): boolean {
  return getKommoAccessToken().length > 0 && getKommoSubdomain().length > 0;
}

/** Normaliza aliases → nombres canónicos para el resto del código. */
export function ensureKommoEnv(): void {
  const token = getKommoAccessToken();
  if (token && !process.env["KOMMO_ACCESS_TOKEN"]?.trim()) {
    process.env["KOMMO_ACCESS_TOKEN"] = token;
  }
  const subdomain = getKommoSubdomain();
  if (subdomain && !process.env["KOMMO_SUBDOMAIN"]?.trim()) {
    process.env["KOMMO_SUBDOMAIN"] = subdomain;
  }
}
