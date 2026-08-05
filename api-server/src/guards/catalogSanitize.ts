/**
 * Sanitizado compartido de bloques/URLs de catálogo.
 * Una sola implementación para guards, outbound pipeline y anti-repeat.
 */

/**
 * Quita SOLO la URL/frase del catálogo de una respuesta (no la línea completa).
 * GPT a menudo mezcla el link con contenido real en un solo párrafo/línea
 * ("No hay problema, ya anoté X. Aquí tienes el catálogo: <url>") — borrar
 * la línea entera dejaba la respuesta completamente vacía.
 */
export function stripCatalogBlockShared(text: string): string {
  let result = text.replace(
    /\s*(mientras\s+tanto,?\s*)?(aqu[ií]\s+(est[aá]|tienes)\s+nuestro\s+cat[aá]logo\s+completo:?\s*)?https?:\/\/\S*cdn\.shopify\.com\S*/gi,
    ""
  );
  result = result.replace(/\bcomparto\s+el\s+link\s+del\s+cat[aá]logo\b[.:]?/gi, "");

  // Ofertas de hub bodasesor (antes solo en anti-repeat).
  result = result
    .replace(
      /\n*Te dejo el cat[aá]logo general[^\n]*\n?https?:\/\/\S*bodasesor\.com\/catalogos\S*\n*/gi,
      "\n"
    )
    .replace(/\n*https?:\/\/\S*bodasesor\.com\/catalogos\S*\n*/gi, "\n")
    .replace(/\n*¿Quieres que te mande el cat[aá]logo[^\n?]*\?\n*/gi, "\n");

  // Encabezados del listado completo del catálogo — sí se quitan como línea
  // entera porque solo aparecen cuando GPT reprodujo el bloque de precios.
  const lines = result.split("\n");
  const filtered = lines.filter(
    (l) =>
      !l.toLowerCase().includes("banquetes:") &&
      !l.toLowerCase().includes("barras temáticas:") &&
      !l.toLowerCase().includes("bebidas:") &&
      !l.toLowerCase().includes("mesas especiales:") &&
      !l.toLowerCase().includes("mobiliario:") &&
      !l.toLowerCase().includes("entretenimiento:") &&
      !l.toLowerCase().includes("estructuras:") &&
      !l.toLowerCase().includes("cdn.shopify.com")
  );
  return filtered
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
