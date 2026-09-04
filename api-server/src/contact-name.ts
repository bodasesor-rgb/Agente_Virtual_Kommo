/**
 * Utilidades para resolver el nombre del cliente desde WhatsApp/Kommo
 * sin usar teléfonos ni placeholders del CRM como nombre visible.
 */

const PHONE_LIKE =
  /^\+?\d[\d\s\-().]{7,}$/;

const PLACEHOLDER_PATTERNS = [
  /^nuevo\s+lead$/i,
  /^lead\s*#?\d+$/i,
  /^contacto\s*#?\d+$/i,
  /^whatsapp\s*#?\d+$/i,
  /^sin\s+nombre$/i,
  /^unknown$/i,
  /^cliente$/i,
  /^\d+$/,
];

/**
 * Cargo / área / display WA de empresa ≠ nombre de persona (clase A15735+).
 * Ej: "Recepción OFM", "Ventas Acme", "Hospitality".
 */
const ROLE_OR_DEPT_NAME_TOKEN =
  /^(recepci[oó]n|reception|hospitality|ventas|gerencia|administraci[oó]n|compras|rh|rr\.?\s*hh?|recursos\s+humanos|atenci[oó]n(\s+a\s+clientes)?|customer\s+service|front\s+desk|concierge|reservaciones?|reservations?|informaci[oó]n|info|oficina|office|operaciones|log[ií]stica|eventos?|coordinaci[oó]n|coordinador[ao]?|asistente|secretaria|secretar[ií]a)$/i;

export function isRoleOrDepartmentAsNombre(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (/^(soy|me\s+llamo|mi\s+nombre\s+es)\s+/i.test(t)) return false;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 5) return false;
  const first = (parts[0] ?? "").replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
  if (ROLE_OR_DEPT_NAME_TOKEN.test(first) || ROLE_OR_DEPT_NAME_TOKEN.test(t)) return true;
  // "Recepción OFM", "Ventas Oriental Films"
  if (
    /^(recepci[oó]n|reception|hospitality|ventas|gerencia|administraci[oó]n|compras)\b/i.test(t) &&
    parts.length <= 4
  ) {
    return true;
  }
  return false;
}

/** Saludos y frases que NO son nombres de persona. */
const GREETING_NAME_PATTERN =
  /^(hola|hello|hi|hey|buen|buenos?|buenas?|d[ií]as?|tardes?|noches?|saludos?|gracias|ok|vale|s[ií]|no|qu[eé]|tal|ayuda|info|cotizaci[oó]n|evento|banquete|taquiza|quiero|necesito|requiero|busco|me|comunico|hablo|escribo|claro)$/i;

/** Cap&Bara / Bodasesor / Lucy — preguntas de canal, no nombre del cliente. */
const COMPANY_OR_CHANNEL_PATTERN =
  /cap\s*[&y]?\s*bara|capbata|capybara|bodasesor|cap\s*and\s*bara|con\s+lucy\b|agente\s+virtual/i;

/**
 * Tokens del bot / meta que nunca son nombre del cliente (A14924: "Lucy Llamo Nicole").
 * A15164: NO incluir nombres de persona reales (Alejandro, Rodrigo) — son clientes válidos.
 * El asesor se desambigua con advisorLabelForClient / normalizeAdvisorReferences.
 */
const BOT_OR_META_NAME_TOKEN =
  /^(lucy|llamo|llam[oó]|bodasesor|capybara|salesbot)$/i;

/** Saludos de cortesía que NO son apellido (A15494: "Paola mucho gusto"). */
const COURTESY_NAME_TOKEN =
  /^(mucho|gusto|encantad[oa]|placer|igualmente|un\s+gusto)$/i;

const MUCHO_GUSTO_SUFFIX = /\s+mucho\s+gusto\b/gi;
const MUCHO_GUSTO_LEADING = /^mucho\s+gusto,?\s+/i;

/** Cliente responde al saludo con su nombre + "mucho gusto" (no es apellido). */
export function isMuchoGustoNameReply(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /^(?:soy\s+|me\s+llamo\s+)?[A-Za-zÁÉÍÓÚáéíóúüñÑ][\wÁÉÍÓÚáéíóúüñÑ.'-]{0,30}(?:\s+[A-Za-zÁÉÍÓÚáéíóúüñÑ][\wÁÉÍÓÚáéíóúüñÑ.'-]{0,30})?\s+mucho\s+gusto\s*[.!]?\s*$/i.test(
    t
  );
}

function stripMuchoGustoSalutation(raw: string): string {
  let out = raw.trim();
  out = out.replace(MUCHO_GUSTO_LEADING, "").trim();
  out = out.replace(MUCHO_GUSTO_SUFFIX, "").trim();
  return out;
}

/** Quejas de repetición — nunca son nombre (A15164: "Ya te lo dije 3 veces"). */
function isRepeatComplaintAsName(text: string): boolean {
  return (
    /\bya\s+te\s+(lo\s+)?(di|dije|mand[eé]|envi[eé])\b/i.test(text) ||
    /\bya\s+(me\s+)?(lo\s+)?preguntaste\b/i.test(text) ||
    /\b(me\s+)?est[aá]s\s+repitiendo\b/i.test(text) ||
    /\bya\s+respond[ií]\b/i.test(text)
  );
}

/** Niveles de catálogo / marcas WA que NO son nombre de persona (A14929: "Premium"). */
const CATALOG_LEVEL_OR_BRAND_NAME =
  /^(premium|b[aá]sic[ao]|tradicional|solo\s*alimentos?|deluxe|vip|gold|silver|platinum|business|premium\s*events?)$/i;

/** "Hola, Lucy" / saludo al bot — no es el nombre del cliente. */
function isGreetingToLucy(text: string): boolean {
  return /^(hola|hello|hi|hey)[,!]?\s+lucy\b/i.test(text.trim());
}

/** Quita corrección de cargo WA: "Bea, no recepción" → "Bea" (A15735+). */
function stripRoleNameCorrectionClause(raw: string): string {
  return raw
    .replace(
      /[,.]?\s*no\s+(?:la\s+|el\s+)?(recepci[oó]n|reception|hospitality|ventas|gerencia|administraci[oó]n)\b.*$/i,
      ""
    )
    .replace(/[.!🙂😊😉]*$/u, "")
    .trim();
}

/** Quita "soy / me llamo / mi nombre es / es Sofía" dejando el nombre. */
function stripPresentationPrefixLocal(raw: string): string {
  const t = raw.trim();
  // "Es Sofía" / "Es Sofy Zavala" (respuesta al pedir nombre) — A15758+.
  const esName = t.match(
    /^\s*es\s+([A-Za-zÁÉÍÓÚáéíóúüñÑ][\wÁÉÍÓÚáéíóúüñÑ.'-]{1,30}(?:\s+[A-Za-zÁÉÍÓÚáéíóúüñÑ][\wÁÉÍÓÚáéíóúüñÑ.'-]{1,30}){0,3})\s*$/i
  );
  if (esName?.[1]) return stripRoleNameCorrectionClause(esName[1].trim());
  // "soy Bea" / "que tal, soy Bea" / "hola, me llamo Ana"
  const mid = t.match(
    /(?:^|[,!.]\s*)(?:soy|me\s+llamo|mi\s+nombre\s+es)\s+(.+)$/i
  );
  if (mid?.[1]) return stripRoleNameCorrectionClause(mid[1].trim());
  const m = t.match(/^\s*(?:c[oó]mo)\s+(.+)$/i);
  return stripRoleNameCorrectionClause((m?.[1] ?? t).trim());
}

/** Verbos de frase/pregunta — el mensaje no es un nombre propio. */
const SENTENCE_VERB_PATTERN =
  /\b(comunico|comunica|hablo|hablar|llamo|escribo|quiero|necesito|busco|me\s+interesa|cotizar|organizar|contratar|tienen|tiene|tienes|ofrecen|ofrece|manejan|maneja|pueden|puede|puedo|gustar[ií]a|hay|cuenta|cuentan|cuesta|cuestan|costar|cobran|cobra|renta|rentan|sale|valen|vale|manda|m[aá]nda|mandame|m[aá]ndame|mandamelo|m[aá]ndamelo|env[ií]a|env[ií]ame|env[ií]amelo|pasa|p[aá]same|conocer)\b/i;

/** Tokens de handoff / meta que nunca son apellido (A15003: "Juan Hablar Agente"). */
const HANDOFF_OR_META_NAME_TOKEN =
  /^(hablar|asesor|agente|humano|persona|ejecutivo|equipo|conmigo|contigo|por|favor)$/i;

/** Palabras de pregunta de precio/servicio que nunca son tokens de nombre (A14933). */
const PRICE_OR_SERVICE_NAME_TOKEN =
  /^(cu[aá]nto|cu[aacute]nto|cuesta|cuestan|costo|precio|renta|rentar|cobran|vale|valen|mesas?|sillas?|periqueras?|salas?|mobiliario|personas?|invitados?)$/i;

/** Intención de cotización — no es el nombre del cliente ("Quiero hacer una cotización"). */
export function isQuoteIntentMessage(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/^soy\s+/i.test(t) || /^me\s+llamo\s+/i.test(t)) return false;
  return (
    /^(quiero|necesito|requiero|busco|me\s+interesa)\b/i.test(t) ||
    /\b(hacer\s+una?\s+)?cotiz/i.test(t) ||
    /\bquiero\s+(hacer|una|un)\b/i.test(t)
  );
}

/** Mensaje del cliente que es solo saludo o pedido genérico (no es su nombre). */
export function isGreetingOnlyMessage(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/^soy\s+/i.test(t) || /^me\s+llamo\s+/i.test(t)) return false;

  const normalized = t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[!?.,…¡¿]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // "hola", "hola buen dia", "buen dia", "buenos dias", etc.
  const withoutHola = normalized.replace(/^(hola|hello|hi|hey)\s+/, "");
  if (/^(hola|hello|hi|hey)$/.test(normalized)) return true;
  if (
    /^(buen(os|as)?\s+)?(dias?|tardes?|noches?)(\s+(a\s+todos|equipo))?$/.test(withoutHola)
  ) {
    return true;
  }
  if (/^que\s*tal$/.test(normalized) || /^buenas?$/.test(normalized) || /^saludos?$/.test(normalized)) {
    return true;
  }
  // "buenas, información" / "hola info" / "buenas cotización" — apertura vaga, no nombre.
  if (
    /^(hola|hello|hi|hey|buenas?)([,\s]+)+(informacion|info|ayuda|cotizar|cotizacion)\s*$/.test(
      normalized
    )
  ) {
    return true;
  }
  if (
    /^(buen(os|as)?\s+(dias?|tardes?|noches?))([,\s]+)+(informacion|info|ayuda|cotizar|cotizacion)\s*$/.test(
      normalized
    )
  ) {
    return true;
  }
  return false;
}

/** Preposiciones / artículos que no forman parte de un nombre propio. */
const NAME_STOPWORDS =
  /^(en|de|del|la|el|los|las|un|una|al|para|por|con|sin|y|o)$/i;

/** ¿Todos los tokens parecen partes de un nombre propio (nombre + apellidos)? */
export function looksLikePersonFullName(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  const parts = t.split(/\s+/);
  if (parts.length < 2 || parts.length > 5) return false;
  if (/\bmucho\s+gusto\b/i.test(t)) return false;
  return parts.every((part) => {
    const letters = part.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
    if (NAME_STOPWORDS.test(letters)) return false;
    if (/^[A-Za-zÁÉÍÓÚÜÑ]\.?$/.test(part) && letters.length >= 1) return true;
    return letters.length >= 2 && !GREETING_NAME_PATTERN.test(letters) && !/^\d+$/.test(letters);
  });
}

/**
 * True si el texto NO debe tratarse como nombre de persona
 * (saludo, pregunta, Cap&Bara/empresa, frase con verbo, ubicación…).
 */
export function isLikelyNotPersonNameMessage(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return true;
  if (isGreetingToLucy(t)) return true;
  if (isRepeatComplaintAsName(t)) return true;
  // Presentación explícita sí puede ser nombre ("soy Bea" / "que tal, soy Bea" / "Es Sofía").
  if (/(?:^|[,!.]\s*)(?:soy|me\s+llamo|mi\s+nombre\s+es)\s+/i.test(t)) return false;
  if (/^\s*es\s+[A-Za-zÁÉÍÓÚáéíóúüñÑ]/i.test(t) && t.split(/\s+/).length <= 5) return false;
  if (/^c[oó]mo\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}/i.test(t) && t.split(/\s+/).length <= 5) return false;

  // A15705: "Sería De Catering" / preferencia de servicio ≠ nombre.
  if (isServicePreferenceAsNombre(t)) return true;
  // A15735+: "Recepción OFM" / cargo o área WA ≠ nombre de persona.
  if (isRoleOrDepartmentAsNombre(t)) return true;

  // Pregunta / verbo de servicio ANTES de looksLikePersonFullName:
  // "Tienes Crepas Para Eventos" matcheaba como "nombre completo" (4 tokens).
  if (/\?/.test(t)) return true;
  if (SENTENCE_VERB_PATTERN.test(t)) return true;
  // "Cuánto cuesta la renta de mesas…" / precio (A14933 Anylam).
  if (
    /\bcu[aá]nto\s+(cuesta|cuestan|vale|valen|cobran|sale)\b/i.test(t) ||
    /\b(precio|costo|tarifa)\s+(de|para|por)\b/i.test(t) ||
    /\bcu[aá]nto\s+cuesta\s+la\s+renta\b/i.test(t)
  ) {
    return true;
  }
  if (isGreetingOnlyMessage(t) || isQuoteIntentMessage(t) || isAffirmativeOnlyMessage(t)) return true;
  if (isMuchoGustoNameReply(t)) return false;
  // A15169: "Sí mándamelo" / "mándamelo" / "envíamelo" — pedido de envío, no nombre.
  if (
    /^(s[ií][,.]?\s*)?(m[aá]nda(me)?lo|env[ií]a(me)?lo|p[aá]sa(me)?lo|m[aá]ndame|env[ií]ame)([.!?]|$)/i.test(
      t
    )
  ) {
    return true;
  }
  if (isLikelyUbicacionNotNombre(t)) return true;
  if (COMPANY_OR_CHANNEL_PATTERN.test(t)) return true;
  // A15003: "Hablar con un agente/asesor" nunca es nombre.
  if (/\bhablar\s+con\s+(un\s+|una\s+)?(asesor|agente|humano|persona)\b/i.test(t)) return true;
  if (/\b(asesor|agente|humano)\b/i.test(t) && t.split(/\s+/).length <= 5) return true;
  // Servicio del catálogo sin verbo ("crepas para eventos", "barra de sushi", mesas/periqueras).
  if (
    /\b(crepas?|sushi|poke|banquete|taquiza|catering|coffee\s*break|brunch|barra\s+de|dj|carpas?|pista|tarima|helado|frutas?|mesas?|sillas?|periqueras?|mobiliario|salas?\s+lounge|photo\s*booth|photobooth|cabina|nigiris?)\b/i.test(
      t
    ) &&
    !/^(soy|me\s+llamo)/i.test(t)
  ) {
    return true;
  }

  // "Patricia Campos López" / "María José Pérez García" sin "me llamo" sigue siendo nombre.
  if (looksLikePersonFullName(t)) return false;

  // Frase larga sin forma de nombre ≠ nombre.
  if (t.split(/\s+/).length >= 4) return true;
  return false;
}

/** Cliente pregunta si habla con Cap&Bara / Bodasesor / el canal correcto. */
export function clientAsksCompanyIdentity(message?: string): boolean {
  if (!message?.trim()) return false;
  const t = message.trim();
  if (!COMPANY_OR_CHANNEL_PATTERN.test(t) && !/cap\s*[&y]?\s*bata/i.test(t)) return false;
  return (
    /\?/i.test(t) ||
    /\b(comunico|hablo|escribo|estoy|este\s+(es|chat|n[uú]mero)|es\s+(el|la)|son)\b/i.test(t)
  );
}

export function buildCompanyIdentityReply(clientName?: string | null): string {
  // En chat solo primer nombre; el CRM puede tener apellido.
  const nombre = sanitizeDisplayName(clientName);
  const base =
    "Sí, soy Lucy de Bodasesor (Cap&Bara Eventos). Te ayudo a armar tu cotización por aquí.";
  return nombre ? `${base} ¿Seguimos, ${nombre}?` : `${base} ¿Me regalas tu nombre para iniciar?`;
}

/**
 * Preferencia de servicio / display WA ≠ nombre (clase A15705+).
 * Cubre: "Sería De Catering", "Prefiero banquete", "Solo mobiliario", "De Taquiza", etc.
 */
export function isServicePreferenceAsNombre(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/^(soy|me\s+llamo|mi\s+nombre\s+es)\s+/i.test(t)) return false;

  const serviceFamily =
    /\b(catering|banquete|taquiza|coffee(\s*break)?|brunch|comida|alimentos?|formal|casual|desayuno|canap[eé]s?|barra|sushi|pizza|pasta|nigiri|mobiliario|mesas?|sillas?|periqueras?|carpas?|pista|dj|bebidas?|mixolog[ií]a|helado|crepas?|photo\s*booth|photobooth|vajillas?|loza)\b/i;

  // Modalidad / preferencia + familia de servicio.
  if (
    /\b(ser[ií]a(n)?|prefiero|preferimos|quiero|necesito|busco|solo|solamente|nada\s+m[aá]s)\s+(de\s+|un\s+|una\s+|el\s+|la\s+)?/i.test(
      t
    ) &&
    serviceFamily.test(t)
  ) {
    return true;
  }
  // Display WA corto: "De Catering", "Catering", "Banquete Formal".
  if (/^(de\s+)?(catering|banquete|taquiza|coffee(\s*break)?|brunch|mobiliario)(\s+\w+){0,2}$/i.test(t)) {
    return true;
  }
  // Solo el token "Sería"/"Serían" tras strip de empresa.
  if (/^ser[ií]a(n)?$/i.test(t)) return true;
  // WA display centrado en servicio (sin forma clara de persona).
  if (t.split(/\s+/).length <= 4 && serviceFamily.test(t) && !looksLikePersonFullName(t)) {
    return true;
  }
  return false;
}

/** Colonia/ciudad — no es nombre de persona ("Narvarte CDMX", "en Tlalnepantla"). */
export function isLikelyUbicacionNotNombre(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t || /^(me llamo|soy)\s+/i.test(t)) return false;
  // "en Tlalnepantla" / "en Naucalpan" — preposición de lugar + topónimo (A14938 Ilana).
  if (
    /^en\s+[A-Za-zÁÉÍÓÚáéíóúñÑ][\wÁÉÍÓÚáéíóúñÑ.'\s-]{2,40}$/i.test(t) &&
    t.split(/\s+/).length <= 6
  ) {
    return true;
  }
  if (
    /\b(cdmx|cd\.?\s*m\.?x\.?|ciudad de m[eé]xico|polanco|narvarte|santa\s*fe|cuernavaca|morelos|coyoac[aá]n|tlalpan|tlalnepantla|naucalpan|ecatepec|atizap[aá]n|sat[eé]lite|interlomas|expo\s+santa|estado\s+de\s+m[eé]xico|edo\.?\s*mex|canc[uú]n|cancun|guadalajara|monterrey|puebla|quer[eé]taro|m[eé]rida|tulum|playa\s+del\s+carmen|toluca|acapulco|veracruz|tijuana|valle\s+de\s+bravo|mesa\s+rica|puerto\s+vallarta|nuevo\s+vallarta|puerto\s+escondido|los\s+cabos|cabo\s+san\s+lucas|mazatl[aá]n|manzanillo|ensenada|bah[ií]a\s+de\s+banderas|cozumel|isla\s+mujeres|reynosa|matamoros|ciudad\s+ju[aá]rez|pachuca|tlaxcala|jiutepec|aguascalientes|chihuahua|oaxaca|morelia|saltillo|huatulco|sayulita|ixtapa|zihuatanejo)\b/i.test(
      t
    ) &&
    t.split(/\s+/).length <= 5
  ) {
    return true;
  }
  return false;
}

/** "sí", "ok", "claro" — afirmación, no es el nombre del cliente. */
export function isAffirmativeOnlyMessage(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /^(s[ií]|ok|vale|claro|de\s+acuerdo|por\s+supuesto|perfecto|correcto|exacto|as[ií]\s+es)[.!?\s,]*$/i.test(t);
}

export function isPlaceholderLeadName(name: string | null | undefined): boolean {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return true;
  if (trimmed.length < 2) return true;
  if (PHONE_LIKE.test(trimmed.replace(/\s/g, ""))) return true;
  if (isRoleOrDepartmentAsNombre(trimmed)) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed));
}

function stripLeadingNameFillers(name: string): string {
  let out = name.trim();
  const filler = /^(claro|ok(?:ay)?|vale|bueno|pues|mira|hola|eh+|este)\s+/i;
  for (let i = 0; i < 3; i++) {
    const next = out.replace(filler, "").trim();
    if (next === out) break;
    out = next;
  }
  return out;
}
export function sanitizeDisplayName(name: string | null | undefined): string | null {
  const raw = stripMuchoGustoSalutation(name?.trim() ?? "");
  if (!raw || isPlaceholderLeadName(raw)) return null;
  if (isGreetingToLucy(raw)) return null;
  if (isGreetingOnlyMessage(raw)) return null;

  const stripped = stripPresentationPrefixLocal(raw);
  const cleaned = stripLeadingNameFillers(
    stripped
      .replace(/^Lead:\s*/i, "")
      .replace(/[~_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

  if (!cleaned || isPlaceholderLeadName(cleaned)) return null;
  if (isGreetingOnlyMessage(cleaned)) return null;

  const firstToken = cleaned.split(/\s+/)[0] ?? "";
  const firstName = firstToken.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
  if (!firstName || firstName.length < 2) return null;
  if (/^(el|la|los|las|un|una)$/i.test(firstName)) return null;
  if (/^\d+$/.test(firstName)) return null;
  if (GREETING_NAME_PATTERN.test(firstName)) return null;
  if (BOT_OR_META_NAME_TOKEN.test(firstName)) return null;
  if (CATALOG_LEVEL_OR_BRAND_NAME.test(firstName)) return null;
  if (isQuoteIntentMessage(raw)) return null;
  if (isLikelyUbicacionNotNombre(raw) || isLikelyUbicacionNotNombre(cleaned)) return null;
  if (isLikelyNotPersonNameMessage(raw) || isLikelyNotPersonNameMessage(cleaned)) return null;
  // A15169: imperativos de envío nunca son nombre.
  if (
    /^(m[aá]nda(me)?lo|env[ií]a(me)?lo|p[aá]sa(me)?lo|m[aá]ndame|env[ií]ame)$/i.test(firstName)
  ) {
    return null;
  }

  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

/** Nombre completo para CRM (conserva apellido cuando viene de WhatsApp/Kommo). */
export function sanitizeCrmNombre(name: string | null | undefined): string | null {
  const raw = stripMuchoGustoSalutation(name?.trim() ?? "");
  if (!raw || isPlaceholderLeadName(raw) || isQuoteIntentMessage(raw)) return null;
  if (isGreetingToLucy(raw)) return null;
  if (isGreetingOnlyMessage(raw)) return null;
  if (isRepeatComplaintAsName(raw)) return null;
  if (isLikelyUbicacionNotNombre(raw)) return null;
  // A15705: WA/display "Sería De Catering" nunca va al CRM como nombre.
  if (isServicePreferenceAsNombre(raw)) return null;
  // A15735+: "Recepción OFM" / cargo nunca va al CRM como nombre.
  if (isRoleOrDepartmentAsNombre(raw)) return null;

  // A15003: "Juan Hablar Agente" / handoff pegado al nombre.
  const strippedHandoff = raw
    .replace(/\bhablar\s+con\s+(un\s+|una\s+)?(asesor|agente|humano|persona|ejecutivo)\b/gi, " ")
    .replace(/\b(hablar|asesor|agente|humano)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (strippedHandoff && strippedHandoff !== raw && strippedHandoff.length >= 2) {
    return sanitizeCrmNombre(strippedHandoff);
  }
  if (!strippedHandoff) return null;

  const isPresentation =
    /(?:^|[,!.]\s*)(?:soy|me\s+llamo|mi\s+nombre\s+es)\s+/i.test(raw);
  // Frases de servicio/saludo (no presentación, no mashup reparable).
  if (!isPresentation && isLikelyNotPersonNameMessage(raw)) {
    // A14933: preguntas de precio/renta NUNCA se "reparan" a nombre ("Cuánto Cuesta La Renta").
    if (
      /\bcu[aá]nto\s+(cuesta|cuestan|vale|valen|cobran)\b/i.test(raw) ||
      /\b(precio|costo)\b.{0,20}\b(renta|mesa|silla|periquera)/i.test(raw) ||
      PRICE_OR_SERVICE_NAME_TOKEN.test((raw.split(/\s+/)[0] ?? "").replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, ""))
    ) {
      return null;
    }
    // A14924: "Lucy Llamo Nicole" tiene verbo pero se puede reparar quitando meta.
    const maybeRepair = stripPresentationPrefixLocal(raw)
      .replace(/^Lead:\s*/i, "")
      .replace(/[~_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((part) => {
        const letters = part.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ']/g, "");
        return (
          letters.length >= 2 &&
          !BOT_OR_META_NAME_TOKEN.test(letters) &&
          !COURTESY_NAME_TOKEN.test(letters) &&
          !HANDOFF_OR_META_NAME_TOKEN.test(letters) &&
          !CATALOG_LEVEL_OR_BRAND_NAME.test(letters) &&
          !GREETING_NAME_PATTERN.test(letters) &&
          !PRICE_OR_SERVICE_NAME_TOKEN.test(letters) &&
          !SENTENCE_VERB_PATTERN.test(letters) &&
          !/^(la|el|los|las|de|del|para|por|un|una|con|sin|tipo|bar)$/i.test(letters)
        );
      });
    if (maybeRepair.length === 0 || maybeRepair.length === raw.split(/\s+/).length) {
      return null;
    }
    // Frase larga que deja 1–2 tokens basura ≠ nombre de persona.
    if (maybeRepair.length <= 2 && raw.split(/\s+/).length >= 5) {
      return null;
    }
    // Continuar solo con tokens de persona reparados.
    const repaired = maybeRepair.slice(0, 4).join(" ");
    if (SENTENCE_VERB_PATTERN.test(repaired) || isLikelyNotPersonNameMessage(repaired)) return null;
    if (PRICE_OR_SERVICE_NAME_TOKEN.test(maybeRepair[0] ?? "")) return null;
    return maybeRepair
      .slice(0, 4)
      .map((part) => {
        const letters = part.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ']/g, "");
        return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
      })
      .join(" ");
  }

  const stripped = stripPresentationPrefixLocal(raw);
  const cleaned = stripLeadingNameFillers(
    stripped
      .replace(/^Lead:\s*/i, "")
      .replace(/[~_]+/g, " ")
      // A14947: "Alexandra Es Boda" / "Alexandra\nEs boda" → solo el nombre.
      .replace(
        /\b(es\s+)?(una?\s+)?(boda|xv\s*a[nñ]os?|cumplea[nñ]os|bautizo|baby\s*shower|aniversario|graduaci[oó]n|evento\s+corporativo)\b/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim()
  );

  if (!cleaned || isPlaceholderLeadName(cleaned)) return null;
  if (isGreetingOnlyMessage(cleaned)) return null;
  if (isLikelyUbicacionNotNombre(cleaned)) return null;

  const parts = cleaned.split(/\s+/).filter((part) => {
    const token = part.trim();
    const letters = token.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
    if (!letters) return false;
    if (BOT_OR_META_NAME_TOKEN.test(letters)) return false;
    if (COURTESY_NAME_TOKEN.test(letters)) return false;
    if (HANDOFF_OR_META_NAME_TOKEN.test(letters)) return false;
    if (CATALOG_LEVEL_OR_BRAND_NAME.test(letters)) return false;
    if (/^(boda|xv|cumpleanos|bautizo|aniversario|graduacion|es|una|un)$/i.test(letters)) return false;
    if (/^[A-Za-zÁÉÍÓÚÜÑ]\.?$/.test(token) && letters.length >= 1) return true;
    return letters.length >= 2 && !GREETING_NAME_PATTERN.test(letters) && !/^\d+$/.test(letters);
  });

  if (parts.length === 0) return sanitizeDisplayName(cleaned);

  const candidate = parts
    .slice(0, 4)
    .map((part) => {
      const token = part.trim();
      if (/^[A-Za-zÁÉÍÓÚÜÑ]\.$/.test(token)) {
        return `${token.charAt(0).toUpperCase()}.`;
      }
      const letters = token.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ']/g, "");
      return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
    })
    .join(" ");

  if (SENTENCE_VERB_PATTERN.test(candidate)) return null;
  if (CATALOG_LEVEL_OR_BRAND_NAME.test(candidate.split(/\s+/)[0] ?? "")) return null;
  return candidate;
}

/** Nunca sobrescribir un nombre existente con uno más corto (menos palabras). */
export function shouldUpdateName(current?: string, incoming?: string): boolean {
  const c = (current ?? "").trim();
  const i = (incoming ?? "").trim();
  if (!i) return false;
  const iClean = sanitizeCrmNombre(i) ?? sanitizeDisplayName(i);
  if (!iClean) return false;
  if (!c) return true;
  // Ubicación / nivel / basura en CRM → siempre reemplazable por un nombre real (A14929/A14938).
  if (
    isLikelyUbicacionNotNombre(c) ||
    isRoleOrDepartmentAsNombre(c) ||
    CATALOG_LEVEL_OR_BRAND_NAME.test(c.split(/\s+/)[0] ?? "") ||
    !sanitizeCrmNombre(c)
  ) {
    return true;
  }
  // No reemplazar "Jeny" por otro nombre distinto (p. ej. intento con Premium ya filtrado arriba).
  if (!namesAreLikelySamePerson(c, iClean)) return false;
  const cClean = sanitizeCrmNombre(c) ?? sanitizeDisplayName(c) ?? c;
  // A15000: nunca degradar "Itzel Lombera" → "Itzel" (menos palabras).
  if (nombreWordCount(iClean) < nombreWordCount(cClean)) return false;
  // Nombre sucio en lead.name ("Alexandra Es Boda") → escribir la forma limpia para Alejandro/SalesBot.
  const cRawNorm = c.toLowerCase().replace(/\s+/g, " ").trim();
  if (cClean.toLowerCase() !== cRawNorm && iClean.toLowerCase() === cClean.toLowerCase()) {
    return true;
  }
  if (cClean.toLowerCase() === iClean.toLowerCase()) return false;
  return isNombreMoreComplete(iClean, cClean);
}

/**
 * Decide qué escribir en Kommo `lead.name` (lo que usa SalesBot/Alejandro al saludar).
 * Compara contra el nombre REAL del lead, no contra la línea CRM ya capturada:
 * si se compara solo con mergedLines, shouldUpdateName(mismo, mismo) deja lead.name vacío.
 */
export function resolveKommoLeadNamePatch(
  currentLeadName: string | null | undefined,
  candidateNombre: string | null | undefined
): string | null {
  const patch = sanitizeCrmNombre(candidateNombre) ?? sanitizeDisplayName(candidateNombre);
  if (!patch) return null;
  if (!shouldUpdateName(currentLeadName ?? undefined, patch)) return null;
  return patch;
}

function normalizeNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** Sofy≈Sofía, Ale≈Alejandra — misma persona sin ser token idéntico (A15758+). */
export function namesShareNicknameRoot(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = (a ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z]/g, "");
  const nb = (b ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z]/g, "");
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length < 3 || nb.length < 3) return false;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;
  // Prefijo fuerte (sof/sofy/sofia) o uno contenido en el otro.
  if (longer.startsWith(shorter) && shorter.length >= 3) return true;
  let common = 0;
  while (common < shorter.length && shorter[common] === longer[common]) common++;
  // Sofy≈Sofía (sof*), Dani≈Daniela — mismo núcleo, longitudes cercanas.
  return common >= 3 && Math.abs(na.length - nb.length) <= 3;
}

/** ¿El nombre entrante parece la misma persona que el ya guardado? */
export function namesAreLikelySamePerson(
  existing: string | null | undefined,
  incoming: string | null | undefined
): boolean {
  const e = sanitizeCrmNombre(existing) ?? sanitizeDisplayName(existing);
  const i = sanitizeCrmNombre(incoming) ?? sanitizeDisplayName(incoming);
  if (!e || !i) return true;
  const te = normalizeNameTokens(e);
  const ti = normalizeNameTokens(i);
  if (!te.length || !ti.length) return true;
  if (te[0] === ti[0]) return true;
  if (namesShareNicknameRoot(te[0], ti[0])) return true;
  return te.some((t) => ti.includes(t)) || ti.some((t) => te.includes(t));
}

export function buildNameConfirmationPrompt(existing: string, incoming: string): string {
  return `Para anotarte bien: ¿eres ${incoming.trim()} o sigo contigo como ${existing.trim()}?`;
}

/** Cuenta palabras con letras válidas en un nombre. */
export function nombreWordCount(name: string | null | undefined): number {
  const crm = sanitizeCrmNombre(name);
  if (!crm) return sanitizeDisplayName(name) ? 1 : 0;
  return crm.split(/\s+/).filter(Boolean).length;
}

/** True si `candidate` es igual o más completo que `existing` (nunca recortar apellido). */
export function isNombreMoreComplete(
  candidate: string | null | undefined,
  existing: string | null | undefined
): boolean {
  const c = sanitizeCrmNombre(candidate) ?? sanitizeDisplayName(candidate);
  const e = sanitizeCrmNombre(existing) ?? sanitizeDisplayName(existing);
  if (!c) return false;
  if (!e) return true;
  const cw = nombreWordCount(c);
  const ew = nombreWordCount(e);
  if (cw > ew) return true;
  if (cw < ew) return false;
  return c.length >= e.length;
}

export function pickBetterNombre(
  candidate: string | null | undefined,
  existing: string | null | undefined
): string | null {
  // A15758+: "Sofía" no debe ganar sobre "Sofy Zavala" (mismo apodo, más completo).
  const eClean = sanitizeCrmNombre(existing) ?? sanitizeDisplayName(existing);
  const iClean = sanitizeCrmNombre(candidate) ?? sanitizeDisplayName(candidate);
  if (eClean && iClean && namesAreLikelySamePerson(eClean, iClean)) {
    if (nombreWordCount(eClean) > nombreWordCount(iClean)) {
      return eClean;
    }
    if (
      nombreWordCount(eClean) === nombreWordCount(iClean) &&
      eClean.length > iClean.length &&
      namesShareNicknameRoot(eClean.split(/\s+/)[0], iClean.split(/\s+/)[0])
    ) {
      // Preferir forma canónica más larga del mismo apodo si no hay apellido.
      // Pero si el CRM ya tiene apellido+nick, keep existing arriba.
    }
  }
  if (isNombreMoreComplete(candidate, existing)) {
    return sanitizeCrmNombre(candidate) ?? sanitizeDisplayName(candidate);
  }
  return sanitizeCrmNombre(existing) ?? sanitizeDisplayName(existing);
}

/**
 * A15705: si el mensaje saluda a "Sería" (preferencia WA) y el CRM tiene Karla,
 * reescribe el vocativo al nombre real.
 */
export function rewriteJunkClientVocative(
  message: string,
  correctNombre?: string | null
): string {
  if (!message?.trim()) return message;
  const correct =
    sanitizeDisplayName(correctNombre) ??
    sanitizeCrmNombre(correctNombre)?.split(/\s+/)[0] ??
    null;

  return message.replace(
    /\b((?:¡?Mucho gusto|¡?Con gusto|Perfecto|Excelente|Genial|Listo|Claro|Hola|Gracias)[,!]?)(\s+)([A-Za-zÁÉÍÓÚáéíóúüñÑ][\wÁÉÍÓÚáéíóúüñÑ'-]*)\b/gi,
    (full, greet: string, space: string, name: string) => {
      if (!isServicePreferenceAsNombre(name) && !isRoleOrDepartmentAsNombre(name)) {
        return full;
      }
      if (correct) return `${greet}${space}${correct}`;
      return greet.replace(/,$/, "").trim();
    }
  );
}

export function resolveClientDisplayName(
  extractedNombre: string | null | undefined,
  crmNombre: string | null | undefined,
  whatsappName: string | null | undefined
): string | null {
  return (
    sanitizeDisplayName(extractedNombre) ??
    sanitizeDisplayName(crmNombre) ??
    sanitizeDisplayName(whatsappName)
  );
}
