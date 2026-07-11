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

function isLegacyAdvisorName(name: string): boolean {
  const lower = name.toLowerCase();
  return LEGACY_ADVISOR_NAMES.some((legacy) => legacy.toLowerCase() === lower);
}

/** Corrige nombres de asesor obsoletos (Rodrigo) o inventados por GPT en mensajes al cliente. */
export function normalizeAdvisorReferences(text: string, clientName?: string | null): string {
  const advisor = advisorLabelForClient(clientName);
  if (!text?.trim()) return text;

  let out = text;
  for (const legacy of LEGACY_ADVISOR_NAMES) {
    out = out.replace(new RegExp(`\\b${legacy}\\b`, "gi"), advisor);
  }

  // OJO: con el flag /i, [A-ZÁÉÍÓÚÑ] también matchea minúsculas — sin el
  // "(?!nuestro\\b)" de abajo, "a nuestro equipo" (ya correcto) se detecta
  // como "a Nuestro" + nombre propio, se reemplaza por "nuestro equipo" y
  // deja el resto de la palabra original pegado: "nuestro equipo equipo".
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

  const advisorName = getAdvisorName();
  if (advisorName.toLowerCase() !== advisor.toLowerCase()) {
    const esc = advisorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${esc}\\b`, "gi"), advisor);
  }

  // Evita confundir al cliente si se llama igual que el asesor (ej. cliente "Alejandro").
  if (advisor.toLowerCase() === "nuestro equipo") {
    out = out.replace(/\bAlejandro\b/gi, advisor);
  }

  return out;
}
