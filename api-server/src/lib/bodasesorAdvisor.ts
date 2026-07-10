/**
 * Nombre del asesor humano que arma cotizaciones (configurable en Hostinger).
 */
export function getAdvisorName(): string {
  return (
    process.env["BODASESOR_ADVISOR_NAME"]?.trim() ||
    process.env["KOMMO_ADVISOR_NAME"]?.trim() ||
    "Alejandro"
  );
}

/** Etiqueta al hablar del asesor en mensajes al cliente — sin confundir con el nombre del cliente. */
export function advisorLabelForClient(_clientName?: string | null): string {
  return "nuestro equipo";
}

/** Corrige nombres inventados por GPT (ej. Rodrigo) solo en contexto de cotización. */
export function normalizeAdvisorReferences(text: string, clientName?: string | null): string {
  const advisor = advisorLabelForClient(clientName);
  if (!text?.trim()) return text;

  let out = text.replace(/\bRodrigo\b/gi, advisor);

  // OJO: con el flag /i, [A-ZÁÉÍÓÚÑ] también matchea minúsculas — sin el
  // "(?!nuestro\\b)" de abajo, "a nuestro equipo" (ya correcto) se detecta
  // como "a Nuestro" + nombre propio, se reemplaza por "nuestro equipo" y
  // deja el resto de la palabra original pegado: "nuestro equipo equipo".
  // Solo en frases de escalamiento a humano — no tocar "Alejandro" suelto en otras frases
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

  // Red de seguridad genérica: colapsa una palabra duplicada inmediata
  // ("equipo equipo", "nuestro nuestro") sin importar la causa.
  out = out.replace(/\b(\p{L}+)\s+\1\b/giu, "$1");
  out = out.replace(
    /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s+te\s+(arma|armar[aá]|incluir[aá]|cotiza)/g,
    (m, name) => {
      if (name.toLowerCase() === "rodrigo") return m.replace(name, advisor);
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

  return out;
}
