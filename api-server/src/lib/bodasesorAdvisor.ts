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

/** Etiqueta al hablar del asesor — evita confundir con el nombre del cliente. */
export function advisorLabelForClient(clientName?: string | null): string {
  const advisor = getAdvisorName();
  const client = clientName?.trim().toLowerCase() ?? "";
  if (client && client === advisor.toLowerCase()) {
    return "nuestro equipo";
  }
  return advisor;
}

/** Corrige nombres inventados por GPT (ej. Rodrigo) solo en contexto de cotización. */
export function normalizeAdvisorReferences(text: string, clientName?: string | null): string {
  const advisor = advisorLabelForClient(clientName);
  if (!text?.trim()) return text;

  let out = text.replace(/\bRodrigo\b/gi, advisor);

  // Solo en frases de escalamiento a humano — no tocar "Alejandro" suelto en otras frases
  out = out.replace(
    /\b(le\s+paso\s+estos\s+datos\s+a|paso\s+estos\s+datos\s+a)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
    `$1 ${advisor}`
  );
  out = out.replace(
    /\b(voy\s+a\s+)?pasar(le)?\s+esta\s+informaci[oó]n\s+a\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
    advisor === "nuestro equipo"
      ? "voy a pasar esta información a nuestro equipo"
      : `voy a pasar esta información a ${advisor}`
  );
  out = out.replace(
    /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s+te\s+(arma|armar[aá]|incluir[aá]|cotiza)/g,
    (m, name) => {
      if (name.toLowerCase() === advisor.toLowerCase()) return m;
      if (name.toLowerCase() === "rodrigo") return m.replace(name, advisor);
      return m;
    }
  );

  return out;
}
