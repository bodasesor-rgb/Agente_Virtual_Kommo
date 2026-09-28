/**
 * Completa ubicación del evento: alcaldía/colonia → ciudad, y Maps si falta.
 * Gemini Flash-Lite NO tiene Google Maps; esto es lookup local + geocoder.
 */

const CDMX_ALCALDIAS =
  /\b(alvaro\s+obregon|[aá]lvaro\s+obreg[oó]n|azcapotzalco|benito\s+ju[aá]rez|coyoac[aá]n|cuajimalpa|cuauht[eé]moc|gustavo\s+a\.?\s*madero|iztacalco|iztapalapa|magdalena\s+contreras|miguel\s+hidalgo|milpa\s+alta|tl[aá]huac|tlalpan|venustiano\s+carranza|xochimilco)\b/i;

const CDMX_CITY =
  /\b(cdmx|ciudad\s+de\s+m[eé]xico|\bdf\b|d\.?\s*f\.?)\b/i;

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function addPart(parts: string[], raw: string | null | undefined): void {
  const t = raw?.trim().replace(/[.,;:]+$/g, "").replace(/\s+/g, " ");
  if (!t || t.length < 2) return;
  const key = fold(t);
  if (/^(es|la|el|de|del|en)$/i.test(t)) return;
  for (let i = 0; i < parts.length; i++) {
    const pk = fold(parts[i]!);
    if (pk === key || pk.includes(key)) return;
    if (key.includes(pk) && t.length > parts[i]!.length) {
      parts[i] = t;
      return;
    }
  }
  parts.push(t);
}

function appendCdmxIfNeeded(joined: string): string {
  if (!joined) return joined;
  if (CDMX_CITY.test(joined)) return joined;
  if (CDMX_ALCALDIAS.test(joined)) {
    return `${joined}, CDMX`;
  }
  return joined;
}

/**
 * Junta colonia + alcaldía + ciudad del mismo mensaje.
 * "es en Coyoacán la colonia es educación" → "colonia Educación, Coyoacán, CDMX"
 */
export function composeEventLocation(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return null;

  const parts: string[] = [];

  const colonia = trimmed.match(
    /\bcolonia\s+(?:es\s+)?([A-Za-zÁÉÍÓÚáéíóúñ][\wÁÉÍÓÚáéíóúñ.-]{1,28})/i
  );
  if (colonia?.[1] && !/^(es|la|el|de|del)$/i.test(colonia[1].trim())) {
    addPart(parts, `colonia ${colonia[1].trim()}`);
  }

  const alcaldia = trimmed.match(CDMX_ALCALDIAS);
  if (alcaldia?.[0]) addPart(parts, alcaldia[0]);

  const city = trimmed.match(CDMX_CITY);
  if (city?.[0]) addPart(parts, /cdmx|d\.?\s*f/i.test(city[0]) ? "CDMX" : city[0]);

  if (parts.length === 0) return null;
  const joined = parts.join(", ");
  // CDMX solo con alcaldía (Coyoacán). "colonia Roma" se queda como colonia.
  if (CDMX_ALCALDIAS.test(joined)) {
    return appendCdmxIfNeeded(joined);
  }
  return joined;
}

export function enrichDireccionLocal(value: string | null | undefined): string | null {
  const t = value?.trim();
  if (!t) return null;
  const composed = composeEventLocation(t);
  if (composed && composed.length >= t.length) return composed;
  return appendCdmxIfNeeded(t);
}

function mergeAddr(a: string | null | undefined, b: string | null | undefined): string | null {
  const prev = a?.trim() ?? "";
  const next = b?.trim() ?? "";
  if (!next) return prev || null;
  if (!prev) return next;
  if (fold(prev).includes(fold(next))) return prev;
  if (fold(next).includes(fold(prev))) return next;
  return `${prev}, ${next}`;
}

/** Falta ciudad/alcaldía y sí hay colonia, calle o salón → conviene Maps. */
export function direccionNeedsMapsLookup(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (CDMX_CITY.test(t) || CDMX_ALCALDIAS.test(t)) return false;
  if (
    /\b(monterrey|guadalajara|puebla|quer[eé]taro|canc[uú]n|tijuana|le[oó]n|m[eé]rida|toluca|cuernavaca|estado\s+de\s+m[eé]xico|edo\.?\s*m[eé]x|naucalpan|tlalnepantla|ecatepec|jiutepec|morelos)\b/i.test(
      t
    )
  ) {
    return false;
  }
  return (
    /\bcolonia\b/i.test(t) ||
    /\b(calle|av\.?|avenida|blvd)\b/i.test(t) ||
    /\b(sal[oó]n|hacienda|hotel|club(\s+de\s+golf)?)\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]/i.test(t)
  );
}

type MapsHit = { formatted: string; city?: string };

function mapsKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.MAPS_API_KEY?.trim() ||
    null
  );
}

async function geocodeGoogle(query: string): Promise<MapsHit | null> {
  const key = mapsKey();
  if (!key) return null;
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}` +
    `&region=mx&language=es&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      address_components?: Array<{ long_name?: string; types?: string[] }>;
    }>;
  };
  const hit = data.results?.[0];
  if (!hit?.formatted_address) return null;
  const city = hit.address_components?.find((c) =>
    c.types?.some((t) => t === "locality" || t === "administrative_area_level_1")
  )?.long_name;
  return { formatted: hit.formatted_address, city };
}

async function geocodeNominatim(query: string): Promise<MapsHit | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
    `&format=json&addressdetails=1&countrycodes=mx&limit=1`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(2500),
    headers: {
      "User-Agent": "Lucy-Bodasesor/1.0 (eventos; geocode de sedes)",
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{
    display_name?: string;
    address?: { city?: string; town?: string; state?: string; suburb?: string };
  }>;
  const hit = data[0];
  if (!hit?.display_name) return null;
  const city = hit.address?.city || hit.address?.town || hit.address?.state;
  return { formatted: hit.display_name, city };
}

const mapsCache = new Map<string, MapsHit | null>();

export async function lookupDireccionInMaps(query: string): Promise<MapsHit | null> {
  const q = query.trim();
  if (q.length < 4 || q.length > 120) return null;
  const cacheKey = fold(q);
  if (mapsCache.has(cacheKey)) return mapsCache.get(cacheKey) ?? null;
  let hit: MapsHit | null = null;
  try {
    hit = (await geocodeGoogle(`${q}, México`)) ?? (await geocodeNominatim(`${q}, México`));
  } catch {
    hit = null;
  }
  mapsCache.set(cacheKey, hit);
  return hit;
}

/**
 * Completa extracted.direccion_evento con colonia/alcaldía del mensaje y Maps si falta ciudad.
 */
export async function enrichExtractedDireccionWithMaps(
  extracted: { direccion_evento?: string | null },
  messageText?: string | null
): Promise<void> {
  const msg = messageText?.trim() ?? "";
  const localFromMsg = composeEventLocation(msg);
  if (localFromMsg) {
    extracted.direccion_evento = mergeAddr(extracted.direccion_evento, localFromMsg);
  } else if (extracted.direccion_evento) {
    extracted.direccion_evento = enrichDireccionLocal(extracted.direccion_evento);
  }

  const current = extracted.direccion_evento?.trim() ?? "";
  const lookupQ = current || msg;
  if (!direccionNeedsMapsLookup(lookupQ)) return;

  const hit = await lookupDireccionInMaps(lookupQ);
  if (!hit) return;
  const cityBit = hit.city?.trim();
  if (cityBit && current && !fold(current).includes(fold(cityBit))) {
    extracted.direccion_evento = mergeAddr(current, cityBit);
  } else if (!current && hit.formatted) {
    extracted.direccion_evento = hit.formatted.split(",").slice(0, 3).join(",").trim();
  }
}
