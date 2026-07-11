/** Convierte markdown común de GPT al formato que WhatsApp entiende. */
export function formatForWhatsApp(text: string): string {
  if (!text?.trim()) return text;
  return text
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/`{1,3}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
