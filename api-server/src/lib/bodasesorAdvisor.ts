/**
 * Nombre del asesor humano que arma cotizaciones (configurable en Hostinger).
 * Rodrigo es legado del bot Replit — el asesor actual es Alejandro.
 */
export const LEGACY_ADVISOR_NAMES = ["Rodrigo"] as const;

export function getAdvisorName(): string {
  return (
    process.env["BODASESOR_ADVISOR_NAME"]?.trim() ||
    process.env["KOMMO_ADVISOR_NAME"]?.trim() ||
    "Alejandro"
  );
}

/**
 * Etiqueta al hablar del asesor en mensajes al cliente.
 * Usamos "nuestro equipo" para no confundir con clientes que se llaman Alejandro (u otros nombres).
 */
export function advisorLabelForClient(_clientName?: string | null): string {
  return "nuestro equipo";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Nombres del equipo/asesor que Kommo a veces pone como nombre del lead — no son el cliente. */
export function isStaffAdvisorName(name: string | null | undefined): boolean {
  const raw = name?.trim() ?? "";
  if (!raw) return false;
  const first = raw.split(/\s+/)[0]?.toLowerCase() ?? "";
  const staff = new Set([
    getAdvisorName().toLowerCase(),
    ...LEGACY_ADVISOR_NAMES.map((n) => n.toLowerCase()),
    "lucy",
    "bodasesor",
    "kommo",
  ]);
  return staff.has(raw.toLowerCase()) || staff.has(first);
}

function isLegacyAdvisorName(name: string): boolean {
  const lower = name.toLowerCase();
  return LEGACY_ADVISOR_NAMES.some((legacy) => legacy.toLowerCase() === lower);
}

const CLIENT_GREETING_PREFIX =
  /(Mucho gusto[,.]?|Hola[,.]?|Genial[,.]?|Perfecto[,.]?|Excelente[,.]?|Listo[,.]?|Claro[,.]?|Qué padre[,.]?|Con gusto[,.]?|¡Con gusto[,.]?)\s*/i;

function replaceAdvisorTokensPreservingClientName(
  text: string,
  token: string,
  replacement: string,
  clientName?: string | null
): string {
  const clientFirst = clientName?.trim().split(/\s+/)[0];
  if (clientFirst && clientFirst.toLowerCase() === token.toLowerCase()) {
    // Cliente con el mismo nombre que el asesor — no reemplazar vocativos ("Qué padre, Alejandro").
    // Las frases de acción del asesor ya se corrigen arriba ("X te arma/cotiza").
    const placeholder = "\uE000CLIENT_NAME\uE001";
    const clientEsc = escapeRegex(clientFirst);
    let out = text.replace(
      new RegExp(`(${CLIENT_GREETING_PREFIX.source})${clientEsc}\\b`, "gi"),
      `$1${placeholder}`
    );
    out = out.replace(new RegExp(`\\b${clientEsc}\\b(?=\\s*,)`, "gi"), placeholder);
    out = out.replace(new RegExp(`(?<=,\\s*)${clientEsc}\\b`, "gi"), placeholder);
    return out.replace(new RegExp(placeholder, "g"), clientFirst);
  }

  if (!clientFirst || clientFirst.toLowerCase() !== token.toLowerCase()) {
    return text.replace(new RegExp(`\\b${escapeRegex(token)}\\b`, "gi"), replacement);
  }

  const placeholder = "\uE000CLIENT_NAME\uE001";
  const clientEsc = escapeRegex(clientFirst);
  let out = text.replace(
    new RegExp(`(${CLIENT_GREETING_PREFIX.source})${clientEsc}\\b`, "gi"),
    `$1${placeholder}`
  );
  out = out.replace(new RegExp(`\\b${escapeRegex(token)}\\b`, "gi"), replacement);
  return out.replace(new RegExp(placeholder, "g"), clientFirst);
}

/** Corrige nombres de asesor obsoletos (Rodrigo) o inventados por GPT en mensajes al cliente. */
export function normalizeAdvisorReferences(text: string, clientName?: string | null): string {
  const advisor = advisorLabelForClient(clientName);
  if (!text?.trim()) return text;

  let out = text;
  for (const legacy of LEGACY_ADVISOR_NAMES) {
    out = out.replace(new RegExp(`\\b${legacy}\\b`, "gi"), advisor);
  }

  out = out.replace(
    /\b(le\s+paso\s+estos\s+datos\s+a|paso\s+estos\s+datos\s+a)\s+(?!nuestro\b)[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
    `$1 ${advisor}`
  );
  out = out.replace(
    /\b(voy\s+a\s+)?pasar(le)?\s+esta\s+informaci[oó]n\s+a\s+(?!nuestro\b)[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
    advisor === "nuestro equipo"
      ? "voy a pasar esta información a nuestro equipo"
      : `voy a pasar esta información a ${advisor}`
  );

  out = out.replace(/\b(\p{L}+)\s+\1\b/giu, "$1");
  out = out.replace(
    /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s+te\s+(arma|armar[aá]|incluir[aá]|cotiza)/g,
    (m, name) => {
      if (isLegacyAdvisorName(name)) return m.replace(name, advisor);
      if (name.toLowerCase() === getAdvisorName().toLowerCase()) {
        return m.replace(name, advisor);
      }
      return m;
    }
  );

  out = replaceAdvisorTokensPreservingClientName(out, getAdvisorName(), advisor, clientName);

  return out;
}

/** Quita bloques internos de CRM que GPT a veces filtra al mensaje al cliente. */
export function stripInternalCrmBlock(mensaje: string): string {
  if (!/DATOS DEL CLIENTE:|Información completa obtenida/i.test(mensaje)) return mensaje;
  const cut =
    mensaje.search(/DATOS DEL CLIENTE:|Información completa obtenida/i);
  if (cut <= 0) return mensaje;
  return mensaje.slice(0, cut).trim();
}
