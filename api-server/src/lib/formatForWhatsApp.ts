/** Convierte markdown común de GPT al formato que WhatsApp entiende. */
export function formatForWhatsApp(text: string): string {
  if (!text?.trim()) return text;
  return spaceNumberedLists(
    text
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/^\s*[-*]\s+/gm, "• ")
      .replace(/`{1,3}/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A16511: "manejamos estos niveles: 1. *A* — $200\n2. *B* — $400 ¿Quieres…? Catálogo de *X*:"
 * pegado en un renglón → lista separada, pregunta y catálogo en su propio párrafo.
 */
function spaceNumberedLists(text: string): string {
  if (!/(?:^|[\s:])1\.\s+\S[\s\S]*?(?:^|\s)2\.\s+\S/m.test(text)) return text;
  return (
    text
      // "…niveles: 1. *A*" → "…niveles:\n\n1. *A*"
      .replace(/:[ \t]+(1\.\s+\S)/g, ":\n\n$1")
      // "— $200 2. *B*" en el mismo renglón → salto antes del siguiente ítem.
      .replace(/([^\n])[ \t]+([2-9]\.\s+\*)/g, "$1\n$2")
      // Último ítem "2. *B* — $400 ¿Quieres…?" → pregunta en párrafo aparte.
      .replace(/^(\d\.\s+[^\n]*?)[ \t]+(¿[^\n]*)$/gm, "$1\n\n$2")
      // "…? Catálogo de *X*:" → catálogo en párrafo aparte.
      .replace(/([?.!])[ \t]+(Cat[aá]logo de \*)/g, "$1\n\n$2")
  );
}
