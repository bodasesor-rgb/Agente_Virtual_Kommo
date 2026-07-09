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

/** Evita que GPT use otro nombre (ej. Rodrigo) al hablar de quien cotiza. */
export function normalizeAdvisorReferences(text: string): string {
  const advisor = getAdvisorName();
  if (!text?.trim()) return text;

  return text
    .replace(
      /\b(?:le\s+paso\s+estos\s+datos\s+a|paso\s+estos\s+datos\s+a|te\s+contactar[aá]\s+)\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
      (m) => m.replace(/\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/, ` ${advisor}`)
    )
    .replace(/\bRodrigo\b/gi, advisor)
    .replace(/\bAlejandro\b/g, advisor);
}
