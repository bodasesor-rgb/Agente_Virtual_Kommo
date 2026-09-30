/**
 * A16503: "Puedes ver el detalle en nuestro catálogo aquí: ." — un filtro quitó el link
 * (gamma.app, URL repetida…) y quedó la frase sin link. También: el cliente pide ver los
 * platillos / fotos / paquetes y Lucy no manda ningún catálogo.
 */
import { CATALOG_WEB_HUB, getCatalogEmbed, resolveCatalogWebSlug } from "./catalogWebKnowledge.js";

const CATALOG_URL_RE = /https?:\/\/\S*(?:bodasesor|hostingersite)\.com\/catalogos\S*/i;

/** "aquí: ." / "en este enlace:." / "en el siguiente link:" sin URL detrás. */
const ORPHAN_LINK_RE =
  /(\b(?:aqu[ií]|ac[aá]|en\s+(?:este|el\s+siguiente|el)\s+(?:enlace|link|v[ií]nculo)|(?:este|el\s+siguiente)\s+(?:enlace|link)|en\s+(?:nuestro|el)\s+cat[aá]logo))[ \t]*:[ \t]*(?=[.,;]|¿|\n\s*¿|\s*$)[.,;]?[ \t]*/gi;

const W_END = "(?![a-záéíóúñ])";

export function clientAsksToSeeDishes(message?: string | null): boolean {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  const food = new RegExp(`\\b(platillos?|platos?|men[uú]s?|paquetes?|comida|banquete|tiempos)${W_END}`);
  if (/\b(fotos?|fotograf[ií]as?|im[aá]genes?)\b/.test(t) && food.test(t)) return true;
  return (
    new RegExp(
      `\\b(mu[eé]str\\w*|mostrar\\w*|ense[nñ]\\w*|ver|conocer|manda\\w*|m[aá]nd\\w*|env[ií]\\w*|pas\\w*me|traer\\w*|dame)${W_END}.{0,40}\\b(platillos?|platos?|paquetes?|men[uú]s?)${W_END}`
    ).test(t) || new RegExp(`\\bpaquetes?\\s+de\\s+(platillos?|comida|men[uú])${W_END}`).test(t)
  );
}

const GENERIC_SLUG_WORDS = new Set(["comida", "barra", "mesa", "servicio", "puestos"]);

function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Catálogo del servicio de comida del cliente; hub general si no hay uno claro. */
export function resolveDishCatalog(contextTexts: string[]): { url: string; title: string | null } {
  for (const raw of contextTexts) {
    const t = raw?.trim();
    if (!t || t.length > 400) continue;
    const slug = resolveCatalogWebSlug(t);
    if (!slug) continue;
    // "Comida" / "catering" genérico no debe caer en "Puestos de Comida" por parecido.
    const norm = normalizeText(t);
    const distinctive = slug.split("-").filter((w) => w.length > 3 && !GENERIC_SLUG_WORDS.has(w));
    if (!distinctive.some((w) => norm.includes(w.slice(0, 5)))) continue;
    return { url: `${CATALOG_WEB_HUB}/${slug}`, title: getCatalogEmbed(slug)?.title ?? null };
  }
  return { url: CATALOG_WEB_HUB, title: null };
}

export function repairOrphanCatalogLinks(text: string, contextTexts: string[]): string {
  if (!text?.trim()) return text;
  ORPHAN_LINK_RE.lastIndex = 0;
  if (!ORPHAN_LINK_RE.test(text)) return text;
  ORPHAN_LINK_RE.lastIndex = 0;
  if (CATALOG_URL_RE.test(text)) {
    // Ya hay un link en el mensaje: solo quitar los dos puntos colgados.
    return text.replace(ORPHAN_LINK_RE, (_m, intro: string) => `${intro}. `).replace(/\.\s*\./g, ".");
  }
  const { url } = resolveDishCatalog(contextTexts);
  let used = false;
  return text
    .replace(ORPHAN_LINK_RE, (_m, intro: string) => {
      if (used) return `${intro}. `;
      used = true;
      return `${intro}:\n${url}\n\n`;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pidió ver platillos / fotos / paquetes y el mensaje no trae catálogo → agregarlo antes de la pregunta. */
export function ensureDishCatalogLink(
  text: string,
  opts: { currentMessage?: string | null; contextTexts: string[] }
): string {
  if (!text?.trim() || !clientAsksToSeeDishes(opts.currentMessage) || CATALOG_URL_RE.test(text)) return text;
  const { url, title } = resolveDishCatalog(opts.contextTexts);
  const block = title
    ? `Aquí puedes ver los platillos y paquetes de *${title}*, con fotos:\n${url}`
    : `Aquí puedes ver nuestros menús y paquetes, con fotos:\n${url}`;
  const q = text.match(/¿[^¿?]*\?\s*$/);
  if (!q) return `${text.trim()}\n\n${block}`;
  // Cortar al inicio de la oración de la pregunta ("Para afinar…, ¿lo prefieres…?"), no a media frase.
  const before = text.slice(0, q.index);
  const sentenceStart = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("\n")) + 1;
  const head = text.slice(0, sentenceStart).trim();
  const question = text.slice(sentenceStart).trim();
  return head ? `${head}\n\n${block}\n\n${question}` : `${block}\n\n${question}`;
}
