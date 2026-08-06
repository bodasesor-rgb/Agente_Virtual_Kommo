/**
 * Fuente única del hub de catálogos web Bodasesor.
 * Evita triplicar la URL en prompt / catalogService / catalogWebKnowledge.
 */
export const CATALOG_WEB_HUB_URL = "https://bodasesor.com/catalogos";

/** Alias histórico usado en prompt y outbound pipeline. */
export const CATALOG_URL = CATALOG_WEB_HUB_URL;

/** Alias histórico de catalogWebKnowledge. */
export const CATALOG_WEB_HUB = CATALOG_WEB_HUB_URL;
