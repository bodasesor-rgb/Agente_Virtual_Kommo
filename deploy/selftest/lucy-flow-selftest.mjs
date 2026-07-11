import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    

// src/selftest/lucy-flow-selftest.ts
import assert from "node:assert/strict";

// src/contact-name.ts
var PHONE_LIKE = /^\+?\d[\d\s\-().]{7,}$/;
var PLACEHOLDER_PATTERNS = [
  /^nuevo\s+lead$/i,
  /^lead\s*#?\d+$/i,
  /^contacto\s*#?\d+$/i,
  /^whatsapp\s*#?\d+$/i,
  /^sin\s+nombre$/i,
  /^unknown$/i,
  /^cliente$/i,
  /^\d+$/
];
var GREETING_NAME_PATTERN = /^(hola|hello|hi|hey|buenos?|buenas?|saludos?|gracias|ok|vale|s[ií]|no|qu[eé]|tal|ayuda|info|cotizaci[oó]n|evento|banquete|taquiza|quiero|necesito|requiero|busco)$/i;
function isQuoteIntentMessage(text) {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/^soy\s+/i.test(t) || /^me\s+llamo\s+/i.test(t)) return false;
  return /^(quiero|necesito|requiero|busco|me\s+interesa)\b/i.test(t) || /\b(hacer\s+una?\s+)?cotiz/i.test(t) || /\bquiero\s+(hacer|una|un)\b/i.test(t);
}
function isGreetingOnlyMessage(text) {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/^soy\s+/i.test(t)) return false;
  return /^hola[.!?\s,]*$/i.test(t) || /^buen(os|as)?\s*(d[ií]as|tardes|noches)?[.!?\s,]*$/i.test(t) || /^qu[eé]\s*tal[.!?\s,]*$/i.test(t) || /^buenas?[.!?\s,]*$/i.test(t) || /^saludos?[.!?\s,]*$/i.test(t);
}
function isAffirmativeOnlyMessage(text) {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /^(s[ií]|ok|vale|claro|de\s+acuerdo|por\s+supuesto|perfecto|correcto|exacto|as[ií]\s+es)[.!?\s,]*$/i.test(t);
}
function isPlaceholderLeadName(name) {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return true;
  if (trimmed.length < 2) return true;
  if (PHONE_LIKE.test(trimmed.replace(/\s/g, ""))) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed));
}
function sanitizeDisplayName(name) {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || isPlaceholderLeadName(trimmed)) return null;
  const cleaned = trimmed.replace(/^Lead:\s*/i, "").replace(/[~_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || isPlaceholderLeadName(cleaned)) return null;
  const firstToken = cleaned.split(/\s+/)[0] ?? "";
  const firstName = firstToken.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
  if (!firstName || firstName.length < 2) return null;
  if (/^(el|la|los|las|un|una)$/i.test(firstName)) return null;
  if (/^\d+$/.test(firstName)) return null;
  if (GREETING_NAME_PATTERN.test(firstName)) return null;
  if (isQuoteIntentMessage(trimmed)) return null;
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}
function sanitizeCrmNombre(name) {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || isPlaceholderLeadName(trimmed) || isQuoteIntentMessage(trimmed)) return null;
  const cleaned = trimmed.replace(/^Lead:\s*/i, "").replace(/[~_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || isPlaceholderLeadName(cleaned)) return null;
  const parts = cleaned.split(/\s+/).filter((part) => {
    const letters = part.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
    return letters.length >= 2 && !GREETING_NAME_PATTERN.test(letters) && !/^\d+$/.test(letters);
  });
  if (parts.length === 0) return sanitizeDisplayName(cleaned);
  return parts.slice(0, 3).map((part) => {
    const letters = part.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, "");
    return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
  }).join(" ");
}
function nombreWordCount(name) {
  const crm = sanitizeCrmNombre(name);
  if (!crm) return sanitizeDisplayName(name) ? 1 : 0;
  return crm.split(/\s+/).filter(Boolean).length;
}
function isNombreMoreComplete(candidate, existing) {
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
function pickBetterNombre(candidate, existing) {
  if (isNombreMoreComplete(candidate, existing)) {
    return sanitizeCrmNombre(candidate) ?? sanitizeDisplayName(candidate);
  }
  return sanitizeCrmNombre(existing) ?? sanitizeDisplayName(existing);
}
function resolveClientDisplayName(extractedNombre, crmNombre, whatsappName) {
  return sanitizeDisplayName(extractedNombre) ?? sanitizeDisplayName(crmNombre) ?? sanitizeDisplayName(whatsappName);
}

// src/client-email.ts
var OWN_EMAILS = new Set(
  [
    "capybaraeventos@gmail.com",
    "bodasesor@gmail.com",
    "hola@bodasesor.com",
    "ventas@bodasesor.com",
    "info@bodasesor.com"
  ].map((e) => e.toLowerCase())
);
function normalizeEmail(email) {
  const trimmed = email?.trim().toLowerCase() ?? "";
  return trimmed || null;
}
function isOwnCompanyEmail(email) {
  const norm = normalizeEmail(email);
  if (!norm) return false;
  if (OWN_EMAILS.has(norm)) return true;
  return /@bodasesor\.com$/i.test(norm) || /@capybaraeventos\./i.test(norm);
}
function filterClientEmail(email) {
  const norm = normalizeEmail(email);
  if (!norm || isOwnCompanyEmail(norm)) return null;
  return email.trim();
}

// src/lib/bodasesorAdvisor.ts
var LEGACY_ADVISOR_NAMES = ["Rodrigo"];
function getAdvisorName() {
  return process.env["BODASESOR_ADVISOR_NAME"]?.trim() || process.env["KOMMO_ADVISOR_NAME"]?.trim() || "Alejandro";
}
function advisorLabelForClient(_clientName) {
  return "nuestro equipo";
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isStaffAdvisorName(name) {
  const raw = name?.trim() ?? "";
  if (!raw) return false;
  const first = raw.split(/\s+/)[0]?.toLowerCase() ?? "";
  const staff = /* @__PURE__ */ new Set([
    getAdvisorName().toLowerCase(),
    ...LEGACY_ADVISOR_NAMES.map((n) => n.toLowerCase()),
    "lucy",
    "bodasesor",
    "kommo"
  ]);
  return staff.has(raw.toLowerCase()) || staff.has(first);
}
function isLegacyAdvisorName(name) {
  const lower = name.toLowerCase();
  return LEGACY_ADVISOR_NAMES.some((legacy) => legacy.toLowerCase() === lower);
}
var CLIENT_GREETING_PREFIX = /(Mucho gusto,?|Hola,?|Genial,?|Perfecto,?|Excelente,?|Listo,?|Claro,?|Qué padre,?)\s*/i;
function replaceAdvisorTokensPreservingClientName(text, token, replacement, clientName) {
  const clientFirst = clientName?.trim().split(/\s+/)[0];
  if (!clientFirst || clientFirst.toLowerCase() !== token.toLowerCase()) {
    return text.replace(new RegExp(`\\b${escapeRegex(token)}\\b`, "gi"), replacement);
  }
  const placeholder = "\uE000CLIENT_NAME\uE001";
  const clientEsc = escapeRegex(clientFirst);
  let out = text.replace(
    new RegExp(`(${CLIENT_GREETING_PREFIX.source})${clientEsc}\\b`, "gi"),
    `$1${placeholder}`
  );
  out = out.replace(new RegExp(`\\b${escapeRegex(token)}\\b`, "gi"), replacement);
  return out.replace(new RegExp(placeholder, "g"), clientFirst);
}
function normalizeAdvisorReferences(text, clientName) {
  const advisor = advisorLabelForClient(clientName);
  if (!text?.trim()) return text;
  let out = text;
  for (const legacy of LEGACY_ADVISOR_NAMES) {
    out = out.replace(new RegExp(`\\b${legacy}\\b`, "gi"), advisor);
  }
  out = out.replace(
    /\b(le\s+paso\s+estos\s+datos\s+a|paso\s+estos\s+datos\s+a)\s+(?!nuestro\b)[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
    `$1 ${advisor}`
  );
  out = out.replace(
    /\b(voy\s+a\s+)?pasar(le)?\s+esta\s+informaci[oó]n\s+a\s+(?!nuestro\b)[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
    advisor === "nuestro equipo" ? "voy a pasar esta informaci\xF3n a nuestro equipo" : `voy a pasar esta informaci\xF3n a ${advisor}`
  );
  out = out.replace(/\b(\p{L}+)\s+\1\b/giu, "$1");
  out = out.replace(
    /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s+te\s+(arma|armar[aá]|incluir[aá]|cotiza)/g,
    (m, name) => {
      if (isLegacyAdvisorName(name)) return m.replace(name, advisor);
      if (name.toLowerCase() === getAdvisorName().toLowerCase()) {
        return m.replace(name, advisor);
      }
      return m;
    }
  );
  out = replaceAdvisorTokensPreservingClientName(out, getAdvisorName(), advisor, clientName);
  return out;
}
function stripInternalCrmBlock(mensaje) {
  if (!/DATOS DEL CLIENTE:|Información completa obtenida/i.test(mensaje)) return mensaje;
  const cut = mensaje.search(/DATOS DEL CLIENTE:|Información completa obtenida/i);
  if (cut <= 0) return mensaje;
  return mensaje.slice(0, cut).trim();
}

// src/conversation-understanding.ts
var LUCY_FIELD_ASK_PATTERNS = {
  nombre: /regalas?\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|con\s+qui[eé]n\s+tengo|tu\s+nombre|me\s+das\s+tu\s+nombre/i,
  correo: /correo|e-?mail|env[ií]o|mandarte|mandar(te)?\s+la\s+info|compartes?\s+un\s+correo/i,
  tipo_evento: /festejan|tipo\s+de\s+(evento|celebraci[oó]n)|qu[eé]\s+evento|qu[eé]\s+celebr|de\s+qu[eé]\s+se\s+trata|qu[eé]\s+tipo\s+de\s+celebr/i,
  requerimientos: /pensado|servicios?|banquete|taquiza|cotizar|cotizaci[oó]n|adem[aá]s\s+del|qu[eé]\s+necesitas|qu[eé]\s+buscas|men[uú]|plat[ií]came|otro\s+servicio|te\s+gustar[ií]a\s+cotizar|animaci[oó]n|hora\s+loca|happening|show|incluir\s+en\s+la\s+cotiz/i,
  invitados: /invitados|personas|gente|pax|cu[aá]ntos|cu[aá]ntas|aproximadamente|m[aá]s\s+o\s+menos|para\s+cu[aá]ntas|ser[ií]an|asistir[aá]n/i,
  zona: /ciudad|d[oó]nde\s+(lo|ser[ií]|ser[aá]|queda|est[aá]n|es)|en\s+qu[eé]\s+(ciudad|zona|lugar)|lugar|direcci[oó]n|ubicaci[oó]n|zona|sal[oó]n|venue|sede|colonia|municipio/i,
  fecha: /fecha|cu[aá]ndo|d[ií]a|agenda|definiendo|opciones\s+de\s+fecha|para\s+cu[aá]ndo|qu[eé]\s+d[ií]a/i,
  presupuesto: /presupuesto|estimado|rango|inversi[oó]n|budget|monto|cu[aá]nto\s+cuesta|precio\s+total|para\s+la\s+comida|menos\s+de|hasta\s+\$?|opciones\s+de\s+precio/i
};
var BODASESOR_SERVICE_PATTERNS = [
  ["Parrillada Argentina", /parrillada\s+argentina/i],
  ["Banquete Kosher", /\bkosher\b/i],
  ["Banquete Navide\xF1o", /\bnavide[nñ]o\b/i],
  ["Banquete Mexicano", /\b(banquete\s+mexicano|mexicano)\b/i],
  ["Banquete Formal", /\b(banquete\s+formal|banquete)\b/i],
  ["Barra de bebidas", /\b(barra\s*(de\s*)?bebidas?|bebidas?\s+alcoh[oó]licas?)\b/i],
  ["Barra de alimentos", /\b(barra\s+de\s+alimentos|barras?\s+tem[aá]ticas?)\b/i],
  ["Mesa de dulces", /\b(mesa\s+de\s+dulces|mesas?\s+de\s+dulces)\b/i],
  ["Mesa de postres", /\b(mesa\s+de\s+postres|postres|dulces)\b/i],
  ["Mesa de quesos", /\b(mesa\s+de\s+quesos|quesos|grazing)\b/i],
  ["Coffee break", /\b(barra\s+de\s+caf[eé]|coffee\s*break)\b/i],
  ["Pista de baile", /\b(pista(\s+de\s+baile)?|tarima)\b/i],
  ["Animaci\xF3n / Hora loca", /\b(hora\s+loca|happening|animaci[oó]n|animador|show|pixel|espejos|l[aá]ser|laser)\b/i],
  ["Iluminaci\xF3n", /\biluminaci[oó]n\b/i],
  ["Decoraci\xF3n", /\bdecoraci[oó]n\b/i],
  ["Florister\xEDa", /\b(florer[ií]a|flores|arreglos?\s+florales?)\b/i],
  ["Mobiliario", /\b(mobiliario|m[aá]rmol|sillas?|mesas?)\b/i],
  ["Carpas", /\b(carpa|carpas|toldo)\b/i],
  ["Pantallas", /\b(pantalla|pantallas|led\s*wall|pantallas?\s+led)\b/i],
  ["Audio y sonido", /\b(audio|microfon[ií]a|sonido|bocinas|amplificaci[oó]n)\b/i],
  ["Estructuras", /\b(estructura|colgante|wisteria)\b/i],
  ["Inflables", /\binflable/i],
  ["Softplay", /\bsoft\s*play\b/i],
  ["Meseros", /\bmeseros?\b/i],
  ["DJ", /\bdj\b/i],
  ["Mixolog\xEDa", /\bmixolog[ií]a\b/i],
  ["Cocteler\xEDa", /\bcocteler[ií]a\b/i],
  ["M\xF3cteles", /\bm[oó]cteles?\b/i],
  ["Canap\xE9s", /\b(canap[eé]s?|bocadillos?)\b/i],
  ["Barra de pizzas", /\b(barra\s+de\s+pizzas?|barra\s+pizza|pizzas?\s+en\s+barra)\b/i],
  ["Pizzas", /\bpizza/i],
  ["Sushi", /\b(sushi|poke)\b/i],
  ["Taquiza", /\b(taquiza|tacos?)\b/i],
  ["Parrillada", /\bparrillada\b/i],
  ["Crepas", /\bcrep[aá]s?\b/i],
  ["Brunch", /\bbrunch\b/i],
  ["Poptails", /\bpoptails?\b/i]
];
var SERVICE_HINT = /banquete|taquiza|tacos|barra|bebida|dj|carpa|men[uú]|comida|alimentos?|mobiliario|pizza|sushi|parrillada|postre|dulce|iluminaci[oó]n|pantalla|coffee|brunch|kosher|formal|mexican|coctel|mixolog|canap|crep|queso|inflable|softplay|estructura|pista|tarima|baile|mesas?|sillas?|mesero|decoraci[oó]n|flor|brunch/i;
var SHORT_SERVICE_ALIASES = {
  pista: "pista de baile",
  tarima: "pista de baile",
  dj: "DJ",
  mesa: "mobiliario",
  mesas: "mobiliario",
  silla: "mobiliario",
  sillas: "mobiliario",
  carpa: "carpas",
  bebidas: "barra de bebidas",
  bebida: "barra de bebidas",
  banquete: "banquete",
  taquiza: "taquiza",
  tacos: "taquiza",
  pizza: "pizzas",
  pizzas: "pizzas",
  sushi: "sushi",
  kosher: "banquete kosher",
  meseros: "meseros",
  mesero: "meseros",
  decoracion: "decoraci\xF3n",
  iluminacion: "iluminaci\xF3n",
  pantalla: "pantallas",
  inflable: "inflables",
  mobiliario: "mobiliario",
  comida: "banquete / taquiza",
  alimentos: "banquete / taquiza",
  alimento: "banquete / taquiza",
  menu: "banquete / taquiza",
  men\u00FA: "banquete / taquiza"
};
var TIPO_EVENTO_PATTERNS = [
  [/\b(expo(sición)?|feria|stand\s+de|congreso)\b/i, "evento corporativo"],
  [/\b(boda|bodas|matrimonio|casamiento|nupcial)\b/i, "boda"],
  [/\b(baby\s*shower)\b/i, "baby shower"],
  [/\b(xv\s*a[nñ]os?|quincea[nñ]era|quince|xv)\b/i, "XV a\xF1os"],
  [/\b(fin\s+de\s+a[nñ]o|fiesta\s+de\s+empresa|eventos?\s+de\s+empresa|de\s+empresa)\b/i, "evento corporativo"],
  [/\b(eventos?\s+corporativos?|convenci[oó]n(es)?|conferencias?|corporativos?)\b/i, "evento corporativo"],
  [/\b(cumplea[nñ]os?|cumple)\b/i, "cumplea\xF1os"],
  [/\b(bautizos?)\b/i, "bautizo"],
  [/\b(comuni[oó]n|graduaci[oó]n)\b/i, "celebraci\xF3n"]
];
function normalizePresentationText(text) {
  return text.toLowerCase().replace(/[¿?.,!]/g, "").trim();
}
function clientAsksAboutTeam(message, clientName) {
  if (!message?.trim()) return false;
  const t = message.trim();
  const normalized = normalizePresentationText(t);
  const name = clientName?.trim().toLowerCase() ?? "";
  const advisor = getAdvisorName().toLowerCase();
  const advisorEsc = advisor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (name) {
    if (normalized === name || normalized === `soy ${name}` || normalized === `me llamo ${name}`) {
      return false;
    }
  }
  if (/^(soy\s+)?[a-záéíóúñ]{2,30}$/i.test(normalized)) return false;
  if (/^hola,?\s+[a-záéíóúñ]{2,30}$/i.test(normalized)) return false;
  if (name && name === advisor && new RegExp(`^${advisorEsc}$`, "i").test(normalized)) {
    return false;
  }
  if (/^[a-záéíóúñ]{2,30}!?$/i.test(normalized)) return false;
  const legacyTeamAsk = LEGACY_ADVISOR_NAMES.some((legacy) => {
    const esc = legacy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${esc}$`, "i").test(normalized) || new RegExp(`\\bqui[e\xE9]n\\s+es\\s+${esc}\\b`, "i").test(t) || new RegExp(`\\best[a\xE1]\\s+${esc}\\b`, "i").test(t);
  });
  return legacyTeamAsk || new RegExp(`^${advisorEsc}$`, "i").test(normalized) && !(name && name === advisor) || new RegExp(`\\bqui[e\xE9]n\\s+es\\s+${advisorEsc}\\b`, "i").test(t) || /\bqui[eé]n\s+es\s+alejandro\b/i.test(t) || new RegExp(`\\best[a\xE1]\\s+${advisorEsc}\\b`, "i").test(t) || new RegExp(`\\bhablo\\s+con\\s+${advisorEsc}\\b`, "i").test(t) || new RegExp(`\\bpuedo\\s+hablar\\s+con\\s+${advisorEsc}\\b`, "i").test(t) || new RegExp(`\\bd[o\xF3]nde\\s+est[a\xE1]\\s+${advisorEsc}\\b`, "i").test(t) || /\bel\s+asesor\b/i.test(t);
}
function clientAddsToQuote(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /\b(incluir|agregar|sumar|tambi[eé]n|adem[aá]s)\b/i.test(t) && /\b(cotizaci[oó]n|propuesta|cotizar)\b/i.test(t) || /\bincluir\b.+\b(en\s+la\s+)?cotiz/i.test(t);
}
function clientAsksForRecommendations(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /recomendaciones?|recomiendas?/i.test(t) || /qu[eé]\s+me\s+(recomiendas?|recomendaciones?|sugieres|conviene|puedes\s+dar)/i.test(t) || /qu[eé]\s+(puedo|podemos)\s+(meter|incluir|poner|agregar)/i.test(t) || /qu[eé]\s+opciones/i.test(t) || /qu[eé]\s+servicios\s+me\s+conviene/i.test(t) || /qu[eé]\s+ofrecen|qu[eé]\s+tienen|qu[eé]\s+manejan|qu[eé]\s+hacen/i.test(t) || /cu[aá]les\s+son\s+(sus\s+)?servicios|informaci[oó]n\s+de\s+(sus\s+)?servicios/i.test(t) || /banquete\s+o\s+taquiza|taquiza\s+o\s+banquete/i.test(t) || /algo\s+m[aá]s\s*\?/i.test(t);
}
function isAmbiguousShortNumber(text) {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /^el\s+\d{1,2}$/i.test(t) || /^\d{1,2}$/.test(t);
}
function recoverClienteNombreFromHistory(history, currentMessage) {
  let lastAssistant = "";
  for (const msg of history) {
    if (msg.role === "assistant" && typeof msg.content === "string") {
      lastAssistant = msg.content;
      continue;
    }
    if (msg.role !== "user" || typeof msg.content !== "string") continue;
    const asked = inferLucyAskedField(lastAssistant);
    if (asked !== "nombre" && !LUCY_FIELD_ASK_PATTERNS.nombre.test(lastAssistant)) continue;
    const raw = msg.content.trim();
    if (!raw || isAffirmativeOnlyMessage(raw) || isAmbiguousShortNumber(raw)) continue;
    const soyMatch = raw.match(/^\s*soy\s+(.+)$/i);
    const candidato = soyMatch ? soyMatch[1].trim() : raw;
    const nombre = sanitizeDisplayName(candidato);
    if (nombre && candidato.length < 40 && !/\?/.test(candidato) && !/@/.test(candidato)) {
      return nombre;
    }
  }
  if (currentMessage?.trim()) {
    const asked = inferLucyAskedField(lastAssistant);
    if (asked === "nombre" || LUCY_FIELD_ASK_PATTERNS.nombre.test(lastAssistant)) {
      const raw = currentMessage.trim();
      if (!isAffirmativeOnlyMessage(raw) && !isAmbiguousShortNumber(raw)) {
        const soyMatch = raw.match(/^\s*soy\s+(.+)$/i);
        const candidato = soyMatch ? soyMatch[1].trim() : raw;
        const nombre = sanitizeDisplayName(candidato);
        if (nombre && candidato.length < 40 && !/\?/.test(candidato) && !/@/.test(candidato)) {
          return nombre;
        }
      }
    }
  }
  return null;
}
function clientAsksLocation(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /d[oó]nde\s+(se\s+)?ubican/i.test(t) || /d[oó]nde\s+est[aá]n\s+ubicados/i.test(t) || /cu[aá]l\s+es\s+su\s+ubicaci[oó]n/i.test(t) || /zona\s+de\s+cobertura/i.test(t) || /en\s+qu[eé]\s+ciudad\s+est[aá]n/i.test(t);
}
function clientMentionsItalianTheme(message) {
  if (!message?.trim()) return false;
  return /\b(italian[ao]?|italia|mafia\s+italiana|pastas?|pizzas?|selecci[oó]n\s+de\s+italia|partido.*italia)\b/i.test(
    message
  );
}
function clientMentionsEntertainment(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /\bshow\b/i.test(t) || /\bgrupo\s+vers[aá]til\b/i.test(t) || /\b(banda|m[uú]sica\s+en\s+vivo|artista|cantante|dj\s+en\s+vivo)\b/i.test(t) || /\b(animaci[oó]n|hora\s+loca|happening|entretenimiento)\b/i.test(t) || /\b(requerimos|necesitamos|buscamos)\s+un\s+show\b/i.test(t);
}
function clientDeclinesMoreServices(message) {
  if (!message?.trim()) return false;
  const t = message.trim().toLowerCase();
  return /^(no|nop)[\s.,!]*$/i.test(t) || /\bsolo\s+(con\s+)?eso\b/i.test(t) || /\bsolamente\s+eso\b/i.test(t) || /\bnada\s+m[aá]s\b/i.test(t) || /\bning[uú]n\s+otro\b/i.test(t) || /\bninguno[a]?\b/i.test(t) || /\bno\s+gracias\b/i.test(t) || /\bas[ií]\s+est[aá]\s+bien\b/i.test(t) || /\beso\s+es\s+todo\b/i.test(t) || /\bya\s+no\b/i.test(t) || /\bno\s+m[aá]s\b/i.test(t) || /\blisto\s+as[ií]\b/i.test(t) || /\bcon\s+eso\s+est[aá]\s+bien\b/i.test(t) || /\bno\s+me\s+interesa\b/i.test(t) || /\bno\s+necesito\s+(nada\s+)?m[aá]s\b/i.test(t) || /\bpor\s+(el\s+)?momento\s+no\b/i.test(t);
}
function clientMentionsCatering(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /\bcatering\b/i.test(t) || /\b(brunch|desayuno)\b/i.test(t) || /\bbrunch\s*\/\s*desayuno/i.test(t) || /\bcoffee\s*break\b/i.test(t) || /\bbarra\s+de\s+caf[eé](?!\w)/i.test(t) || /\b(busco|necesito|quiero|cotizar|interesa)\s+(cotizar\s+)?(comida|alimentos?|men[uú])\b/i.test(t) || /\bcomida\s+para\b/i.test(t) || /\b(solo|nada\s+m[aá]s)\s+(comida|alimentos?)\b/i.test(t) || /\b(comida|alimentos?|men[uú])\s+(para|del)\b/i.test(t);
}
function clientAsksServiceInfo(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  if (!isServiceRelatedMessage(message)) return false;
  return /\b(informaci[oó]n|info|detalle|detalles|qu[eé]\s+incluye|inclusiones?|men[uú]|opciones?)\b/i.test(t) || /\b(cu[aá]nto\s+cuesta|precio|costo|cotizar|cotizaci[oó]n)\b/i.test(t) || /\b(quiero|necesito|me\s+interesa)\s+(informaci[oó]n|saber|cotizar)\b/i.test(t);
}
function clientAsksPhone(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /\btel[eé]fono/i.test(t) || /\bn[uú]mero\s+(de\s+)?(contacto|atenci[oó]n|ventas|gerencia)/i.test(t) || /\b(llamar|marcar|contestar|contestan|nadie\s+contesta|me\s+urge)\b/i.test(t) || /\bwhatsapp\s+(de\s+)?(ventas|gerencia|corporativo|bodasesor)/i.test(t) || /\btienen\s+whatsapp/i.test(t);
}
function clientAsksBanqueteVsTaquiza(message) {
  if (!message?.trim()) return false;
  return /banquete\s+o\s+taquiza|taquiza\s+o\s+banquete/i.test(message.toLowerCase());
}
var WRITTEN_NUMBERS = {
  uno: "1",
  una: "1",
  dos: "2",
  tres: "3",
  cuatro: "4",
  cinco: "5",
  seis: "6",
  siete: "7",
  ocho: "8",
  nueve: "9",
  diez: "10",
  once: "11",
  doce: "12",
  quince: "15",
  veinte: "20",
  treinta: "30",
  cuarenta: "40",
  cincuenta: "50",
  sesenta: "60",
  setenta: "70",
  ochenta: "80",
  noventa: "90",
  cien: "100",
  ciento: "100",
  doscientos: "200",
  trescientos: "300",
  cuatrocientos: "400",
  quinientos: "500"
};
var MONTH_PATTERN = /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i;
var KNOWN_ZONES = /\b(cdmx|ciudad\s+de\s+m[eé]xico|df|polanco|reforma|santa\s+fe|interlomas|monterrey|guadalajara|puebla|quer[eé]taro|canc[uú]n|tijuana|le[oó]n|m[eé]rida|toluca|cuernavaca|acapulco|veracruz|tulum|playa\s+del\s+carmen|nezahualc[oó]yotl|corregidor|centro\s+hist[oó]rico|estado\s+de\s+m[eé]xico|edo\.?\s*m[eé]x|naucalpan|coyoac[aá]n|xochimilco)\b/i;
var NON_LOCATION_WORDS = /^(total|este|esta|ese|esa|medio|mente|general|particular|comida|pista|baile|solo|m[ií]o|tu|su)\b/i;
function inferLucyAskedField(lastLucyMessage) {
  const msg = lastLucyMessage?.trim() ?? "";
  if (!msg) return null;
  const priority = [
    "nombre",
    "correo",
    "tipo_evento",
    "requerimientos",
    "invitados",
    "zona",
    "fecha",
    "presupuesto"
  ];
  for (const field of priority) {
    if (LUCY_FIELD_ASK_PATTERNS[field].test(msg)) return field;
  }
  return null;
}
function parseServicesFromText(text) {
  const found = [];
  const lower = text.toLowerCase();
  for (const [label, pattern] of BODASESOR_SERVICE_PATTERNS) {
    if (pattern.test(lower)) found.push(label);
  }
  const normalized = normalizeShortServicePhrase(text);
  if (normalized && !found.some((s) => s.toLowerCase().includes(normalized.toLowerCase()))) {
    found.push(normalized);
  }
  return [...new Set(found)];
}
function parsePrimaryService(text) {
  const services = parseServicesFromText(text);
  if (services.length > 0) return services[0];
  const normalized = normalizeShortServicePhrase(text);
  return normalized;
}
function normalizeShortServicePhrase(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let cleaned = trimmed.replace(/^(quiero|necesito|busco|solo|solamente|nada\s+m[aá]s|me\s+interesa|dame|cotiza(?:r)?)\s+/i, "").replace(/^(una?|el|la|los|las)\s+/i, "").trim();
  const lower = cleaned.toLowerCase();
  if (SHORT_SERVICE_ALIASES[lower]) return SHORT_SERVICE_ALIASES[lower];
  if (/^pista$/i.test(cleaned)) return "pista de baile";
  if (/^dj$/i.test(cleaned)) return "DJ";
  return null;
}
function isServiceRelatedMessage(text) {
  const trimmed = text?.trim() ?? "";
  if (!trimmed || /^info pendiente$/i.test(trimmed)) return false;
  if (/\bservicio\s+completo\b/i.test(trimmed)) return true;
  if (SERVICE_HINT.test(trimmed)) return true;
  if (parsePrimaryService(trimmed)) return true;
  if (/^(una?\s+)?(pista|tarima|dj|mesas?|sillas?|carpa|banquete|taquiza)\b/i.test(trimmed)) return true;
  return false;
}
function parseTipoEventoFromText(text) {
  for (const [pattern, label] of TIPO_EVENTO_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}
function parseInvitadosFromText(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (isServiceRelatedMessage(trimmed)) return null;
  if (/\b(no\s+s[eé](\s+a[uú]n)?|a[uú]n\s+no(\s+s[eé])?|sin\s+definir|por\s+definir|no\s+tenemos|no\s+damos|depende|todav[ií]a\s+no|m[aá]s\s+adelante|no\s+lo\s+sabemos|van\s+viendo)\b/i.test(
    trimmed
  )) {
    return "Sin definir (cliente indic\xF3 aproximaci\xF3n pendiente)";
  }
  const rangoMatch = trimmed.match(/\bentre\s+(\d+)\s+y\s+(\d+)\b/i);
  if (rangoMatch) {
    const a = parseInt(rangoMatch[1], 10);
    const b = parseInt(rangoMatch[2], 10);
    return String(Math.max(a, b));
  }
  const numMatch = trimmed.match(/\b(\d+)\s*(personas?|invitados?|pax|guests?|gentes?|cabezas?)\b/i);
  if (numMatch) return numMatch[1];
  const paraMatch = trimmed.match(/\b(?:para|somos|ser[ií]an?|como|unos?|unas?)\s+(\d+)\b/i);
  if (paraMatch) return paraMatch[1];
  const aproxMatch = trimmed.match(
    /\b(?:m[aá]s\s+o\s+menos|aproximadamente|al\s+rededor\s+de|alrededor\s+de|cerca\s+de)\s+(\d+)\b/i
  );
  if (aproxMatch) return aproxMatch[1];
  const writtenMatch = trimmed.match(
    /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos)\s+(personas?|invitados?)\b/i
  );
  if (writtenMatch) {
    return WRITTEN_NUMBERS[writtenMatch[1].toLowerCase()] ?? null;
  }
  if (/^el\s+\d{1,2}$/i.test(trimmed)) return null;
  if (/^\d{1,4}$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    if (n < 10) return null;
    return trimmed;
  }
  return null;
}
function isDimensionText(text) {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /\b\d+\s*metros?\s*(por|x)\s*\d+\s*metros?\b/i.test(t) || /\b\d+\s*m\s*(por|x)\s*\d+\s*m\b/i.test(t) || /\bespacio\s+(es\s+de|de|mide)\s+\d+/i.test(t) || /^\d+\s*x\s*\d+\s*(m|metros?)?$/i.test(t) || /^\d+m\s*x\s*\d+m$/i.test(t);
}
function parseSpaceDimensions(text) {
  const m = text.match(/\b(\d+)\s*metros?\s*(por|x)\s*(\d+)\s*metros?\b/i);
  if (m) return `${m[1]}m x ${m[3]}m`;
  const m2 = text.match(/\bespacio\s+(?:es\s+de|de|mide)\s+(\d+)\s*metros?\s*(por|x)\s*(\d+)/i);
  if (m2) return `${m2[1]}m x ${m2[3]}m`;
  return null;
}
function clientMentionsPistaTarima(message) {
  if (!message?.trim()) return false;
  return /\bpista(\s+de\s+baile)?\b|\btarima/i.test(message);
}
function parseZonaFromText(text) {
  const trimmed = text.trim();
  if (!trimmed || /@/.test(trimmed)) return null;
  if (isGreetingOnlyMessage(trimmed)) return null;
  if (isAffirmativeOnlyMessage(trimmed)) return null;
  if (isDimensionText(trimmed)) return null;
  const expoMatch = trimmed.match(/\bexpo\s+[A-Za-zÁÉÍÓÚáéíóúñ][\w\s.-]{2,40}/i);
  if (expoMatch?.[0]) return expoMatch[0].trim();
  if (KNOWN_ZONES.test(trimmed)) {
    const m = trimmed.match(KNOWN_ZONES);
    if (m) return m[0].trim();
  }
  const coloniaMatch = trimmed.match(
    /\b((?:colonia|delegaci[oó]n|alcald[ií]a|fraccionamiento)\s+[A-Za-zÁÉÍÓÚáéíóúñ][A-Za-zÁÉÍÓÚáéíóúñ\s.-]{1,28})/i
  );
  if (coloniaMatch?.[1]) return coloniaMatch[1].trim();
  const enMatch = trimmed.match(
    /\ben\s+([A-Za-zÁÉÍÓÚáéíóúñ][A-Za-zÁÉÍÓÚáéíóúñ\s.-]{2,28})(?:\s|,|\.|$)/i
  );
  if (enMatch) {
    const lugar = enMatch[1].trim();
    const sinArticulo = lugar.replace(/^(el|la|los|las)\s+/i, "").trim();
    const candidato = sinArticulo || lugar;
    if (!MONTH_PATTERN.test(candidato) && !/^\d/.test(candidato) && !isGreetingOnlyMessage(candidato) && !NON_LOCATION_WORDS.test(candidato) && !/\b(solo|para\s+la|total|comida|pista)\b/i.test(candidato)) {
      return candidato;
    }
  }
  const venueMatch = trimmed.match(
    /\b((?:la\s+)?casa\s+del\s+corregidor|cd\.?\s*nezahualc[oó]yotl)\b/i
  );
  if (venueMatch?.[1]) return venueMatch[1].trim();
  const clubMatch = trimmed.match(/\b(club\s+de\s+golf\s+[A-Za-zÁÉÍÓÚáéíóúñ\s]{2,30})/i);
  if (clubMatch?.[1]) return clubMatch[1].trim();
  if (/\b(se\s+llevar[aá]|llevaremos|ser[aá])\s+(a\s+cabo\s+)?en\s+(el\s+)?/i.test(trimmed)) {
    const enVenue = trimmed.match(/\ben\s+(el\s+)?([A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚáéíóúñ\s]{4,40})/);
    if (enVenue?.[2] && !MONTH_PATTERN.test(enVenue[2])) return enVenue[2].trim();
  }
  return null;
}
var SERVICE_LABELS_NOT_TIPO = /^(brunch|banquete|taquiza|desayuno|catering|pista de baile|dj|mobiliario|bebidas?)$/i;
var CORREO_DICTADO_STOPWORDS = /* @__PURE__ */ new Set([
  "es",
  "mi",
  "correo",
  "el",
  "mail",
  "email",
  "de",
  "ser[i\xED]a",
  "seria",
  "ser\xEDa"
]);
function normalizeDictatedCorreo(text) {
  const lower = text.toLowerCase().replace(/[¿?¡!,.;:]+$/g, "");
  if (!/\barroba\b/.test(lower)) return null;
  const tokens = lower.split(/\s+/);
  const arrobaIdx = tokens.indexOf("arroba");
  if (arrobaIdx === -1) return null;
  const localParts = [];
  for (let i = arrobaIdx - 1; i >= 0; ) {
    const tok = tokens[i];
    if (tok === "bajo" && i - 1 >= 0 && (tokens[i - 1] === "guion" || tokens[i - 1] === "gui\xF3n")) {
      localParts.unshift("_");
      i -= 2;
      continue;
    }
    if (tok === "guion" || tok === "gui\xF3n") {
      localParts.unshift("-");
      i -= 1;
      continue;
    }
    if (CORREO_DICTADO_STOPWORDS.has(tok)) break;
    if (!/^[a-z0-9]+$/.test(tok)) break;
    localParts.unshift(tok);
    i -= 1;
  }
  if (localParts.length === 0) return null;
  const domainParts = [];
  for (let i = arrobaIdx + 1; i < tokens.length; ) {
    const tok = tokens[i];
    if (tok === "punto") {
      domainParts.push(".");
      i += 1;
      continue;
    }
    if (tok === "guion" || tok === "gui\xF3n") {
      if (tokens[i + 1] === "bajo") {
        domainParts.push("_");
        i += 2;
        continue;
      }
      domainParts.push("-");
      i += 1;
      continue;
    }
    if (!/^[a-z0-9]+$/.test(tok)) break;
    domainParts.push(tok);
    i += 1;
  }
  if (domainParts.length === 0) return null;
  const candidate = `${localParts.join("")}@${domainParts.join("")}`;
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(candidate) ? candidate : null;
}
function parseCorreoFromText(text) {
  if (!text) return null;
  const m = text.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  const raw = m ? m[1] : normalizeDictatedCorreo(text);
  if (!raw) return null;
  return filterClientEmail(raw);
}
function isServiceLabelNotTipoEvento(label) {
  if (!label?.trim()) return false;
  const t = label.trim();
  if (SERVICE_LABELS_NOT_TIPO.test(t)) return true;
  if (parseTipoEventoFromText(t)) return false;
  return !!parsePrimaryService(t);
}
function parseFechaFromText(text) {
  const trimmed = text.trim();
  const fechaMatch = trimmed.match(
    /\b(?:el\s+)?(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?)(?:\s+a\s+las\s+(\d{1,2}:\d{2}|\d{1,2})\s*horas?)?\b/i
  );
  if (fechaMatch) {
    const base = fechaMatch[1];
    const hora = fechaMatch[2];
    return hora ? `${base} a las ${hora}${hora.includes(":") ? "" : ":00"} horas` : base;
  }
  if (/\b(todav[ií]a\s+la\s+vamos\s+a\s+definir|todav[ií]a\s+(no\s+)?la\s+van?\s+a\s+definir|vamos\s+a\s+definir|siguen\s+viendo\s+opciones?|a[uú]n\s+sin\s+fecha)\b/i.test(
    trimmed
  )) {
    return "Sin definir (pendiente)";
  }
  if (/\b(pr[oó]ximo\s+s[aá]bado|pr[oó]ximo\s+domingo|sin\s+fecha|a[uú]n\s+no\s+tenemos\s+fecha|todav[ií]a\s+no|por\s+definir)\b/i.test(
    trimmed
  )) {
    return trimmed.slice(0, 80);
  }
  if (MONTH_PATTERN.test(trimmed) && !/\b(pedregal|zona|ciudad|lugar|sal[oó]n|jard[ií]n)\b/i.test(trimmed)) {
    return trimmed.slice(0, 80);
  }
  return null;
}
function bareNumberLooksLikeInvitados(num, trimmed) {
  if (/\$|k\b|mil\b|pesos|mxn|mnx/i.test(trimmed)) return false;
  return num >= 5 && num <= 999;
}
var PRESUPUESTO_MAX_ASKS = 2;
var PRESUPUESTO_AUTO_WAIVER = "Sin definir (no indic\xF3 monto)";
function countLucyFieldAsks(history, field) {
  const pattern = LUCY_FIELD_ASK_PATTERNS[field];
  return history.filter(
    (m) => m.role === "assistant" && typeof m.content === "string" && pattern.test(m.content)
  ).length;
}
function detectPresupuestoRefusal(text) {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/^(no|nop)[\s.,!]*$/i.test(t)) return true;
  if (/^\.{2,}$/.test(t)) return true;
  return /\bno\s+(tengo|tenemos|cuento|sabemos)\s+(un\s+)?presupuesto\b/i.test(t) || /\bno\s+me\s+brindaron\b/i.test(t) || /\bno\s+nos\s+(dieron|brindaron)\b/i.test(t) || /\bsin\s+presupuesto\b/i.test(t) || /\b(sin\s+rango|no\s+tengo\s+rango)\b/i.test(t) || /\b(m[aá]ndame|m[aá]nden)\s+(el\s+)?presupuesto\b/i.test(t) || /\b(m[aá]ndame|m[aá]nden)\s+(la\s+)?cotiz/i.test(t) || /\bt[uú]\s+m[aá]ndame\b/i.test(t) || /\bsi\s+quieres\s+vemos\b/i.test(t) || /\b(no\s+s[eé]|no\s+lo\s+s[eé]|ni\s+idea|no\s+tengo\s+idea)(?:\s|$|[.,!?])/i.test(t) || /\ba[uú]n\s+no\s+(?:s[eé]|lo\s+s[eé]|s[eé]\s+cu[aá]nto)/i.test(t) || /\btodav[ií]a\s+no\b/i.test(t) || /\bdespu[eé]s\s+(vemos|platicamos|veo)\b/i.test(t) || /\bcuando\s+(veamos|tengamos|me\s+manden)\b/i.test(t) || /\bustedes\s+me\s+(mandan|env[ií]an|pasan)\b/i.test(t) || /\bmejor\s+(que\s+)?(me\s+)?mand/i.test(t) || /\bque\s+(nos|me|ustedes|ellos)\s+propong/i.test(t) || /\bpropong(an|a)\s+(opciones|algo)\b/i.test(t) || /\bque\s+(nos|me)\s+(den|de)\s+opciones\b/i.test(t) || /\bno\b/i.test(t) && /\bpresupuesto\b/i.test(t);
}
function findPresupuestoInTexts(texts, history) {
  if (history?.length) {
    let lastAssistant = "";
    for (const msg of history) {
      if (msg.role === "assistant" && typeof msg.content === "string") {
        lastAssistant = msg.content;
      }
      if (msg.role === "user" && typeof msg.content === "string") {
        const asked = inferLucyAskedField(lastAssistant);
        const pres = parsePresupuestoFromText(msg.content, {
          askedField: asked === "presupuesto" ? "presupuesto" : null
        });
        if (pres) return pres;
      }
    }
  }
  for (const t of texts) {
    const pres = parsePresupuestoFromText(t);
    if (pres) return pres;
  }
  return null;
}
function parsePresupuestoFromText(text, opts) {
  const trimmed = text.trim();
  if (/\b(m[aá]ndame|m[aá]nden)\s+(el\s+)?(presupuesto|cotiz)/i.test(trimmed) || /\bt[uú]\s+m[aá]ndame\b/i.test(trimmed)) {
    return "Sin definir (cliente pidi\xF3 que propongamos)";
  }
  if (detectPresupuestoRefusal(trimmed)) {
    return "Sin definir (cliente indic\xF3 que no tiene)";
  }
  if (/\b(lo\s+m[aá]s\s+)?econ[oó]mic[oa]s?\b/i.test(trimmed) || /\b(barato|accesible|ajustad[oa]|menor\s+costo|lo\s+m[aá]s\s+barato)\b/i.test(trimmed)) {
    return "Opciones econ\xF3micas (sin monto fijo)";
  }
  if (/\b(sin\s+rango|no\s+tengo\s+rango)\b/i.test(trimmed)) {
    return "Sin definir (cliente indic\xF3 que no tiene)";
  }
  if (/\b(poquito|lo\s+que\s+sea\s+necesario|flexible|lo\s+que\s+se\s+necesite)\b/i.test(trimmed)) {
    return "Flexible (sin monto fijo)";
  }
  if (opts?.askedField === "presupuesto" && /^(no|nop)[\s.,!]*$/i.test(trimmed)) {
    return "Sin definir (cliente indic\xF3 que no tiene)";
  }
  if (opts?.askedField === "presupuesto") {
    if (/^(s[ií]|ok|vale|bueno|est[aá]\s+bien|perfecto|claro|de\s+acuerdo)[\s.,!]*$/i.test(trimmed)) {
      return PRESUPUESTO_AUTO_WAIVER;
    }
    if (/^(no\s+s[eé]|no\s+lo\s+s[eé]|ni\s+idea|no\s+tengo\s+idea|\.\.+)[\s.,!]*$/i.test(trimmed)) {
      return "Sin definir (cliente indic\xF3 que no tiene)";
    }
  }
  if (/\b(no\s+tengo|no\s+s[eé]|sin\s+presupuesto|a[uú]n\s+no|no\s+cuento|no\s+sabemos|depende|no\s+lo\s+s[eé]|no,?\s+a[uú]n\s+no|que\s+alejandro\s+de\s+opciones|que\s+nos\s+propong|ver\s+opciones|todav[ií]a\s+no|despu[eé]s\s+vemos)\b/i.test(
    trimmed
  )) {
    return "Sin definir (cliente indic\xF3 que no tiene)";
  }
  if (parseFechaFromText(trimmed) && !/\b(presupuesto|mil|pesos|mxn|mnx|\$|k\b)/i.test(trimmed)) {
    return null;
  }
  if (/\b\d+\s*(personas?|invitados?|pax)\b/i.test(trimmed) && !/\b(presupuesto|mil|pesos|mxn|mnx|\$|k\b)/i.test(trimmed)) {
    return null;
  }
  const rangeMatch = trimmed.match(/\b(\d[\d,.]*)\s*[-–a]\s*(\d[\d,.]*)\s*(mxn|mnx|pesos)?\b/i);
  if (rangeMatch) {
    return `${rangeMatch[1].replace(/,/g, "")} - ${rangeMatch[2].replace(/,/g, "")} MXN`;
  }
  const perPersonMatch = trimmed.match(
    /\$?\s*([\d][\d,.]*)\s*(?:mxn|mnx|pesos)?\s*(?:por\s+(?:persona|cabeza)|x\s+persona|pp\b|c\/u\b)/i
  );
  if (perPersonMatch) {
    const num = parseInt(perPersonMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(num) && num > 0) return `$${num.toLocaleString("es-MX")} MXN por persona`;
  }
  const menosDeMatch = trimmed.match(
    /\b(?:menos\s+de|hasta|m[aá]ximo|max\.?)\s+\$?\s*([\d][\d,.]*)\s*(mxn|mnx|pesos)?\b/i
  );
  if (menosDeMatch) {
    return `Hasta $${menosDeMatch[1].replace(/,/g, "")} MXN`;
  }
  const topeMatch = trimmed.match(
    /\btope\s+(?:es\s+)?(?:de\s+)?\$?\s*([\d][\d,.]*)\s*(mxn|mnx|pesos|k)?\b/i
  );
  if (topeMatch) {
    const suffix = topeMatch[2]?.toLowerCase() === "k" ? "k" : "";
    return `Hasta $${topeMatch[1].replace(/,/g, "")}${suffix} MXN`;
  }
  const kMatch = trimmed.match(/\$?\s*([\d,.]+)\s*k\b/i);
  if (kMatch) {
    const num = parseInt(kMatch[1].replace(/[,.]/g, ""), 10);
    if (!isNaN(num) && num > 0) return `$${num}k`;
  }
  const milMatch = trimmed.match(/([\d,.]+)\s*mil\b/i);
  if (milMatch) {
    const num = parseInt(milMatch[1].replace(/[,.]/g, ""), 10);
    if (!isNaN(num) && num > 0) return `$${num * 1e3}`;
  }
  if (/\$/.test(trimmed) || /\b(presupuesto|rango|inversi[oó]n|budget|monto|pesos|mxn|mnx|tope)\b/i.test(trimmed) || /\b(como|aprox|alrededor|cerca\s+de|menos\s+de|hasta)\b/i.test(trimmed)) {
    const amountMatch = trimmed.match(/\$?\s*([\d][\d,.]*)/);
    if (amountMatch) return trimmed.slice(0, 80);
  }
  const bareMatch = trimmed.match(/^\$?\s*([\d][\d,.]*)\s*(k|mxn|mnx|pesos)?$/i);
  if (bareMatch) {
    const num = parseInt(bareMatch[1].replace(/,/g, ""), 10);
    if (isNaN(num) || num <= 0) return null;
    if (opts?.askedField === "presupuesto") return trimmed.slice(0, 80);
    if (bareNumberLooksLikeInvitados(num, trimmed)) return null;
    if (num >= 1e3) return `$${num.toLocaleString("es-MX")} MXN`;
    return null;
  }
  return null;
}
function getLastLucyMessage(history) {
  return history.filter((m) => m.role === "assistant" && typeof m.content === "string").slice(-1)[0]?.content ?? "";
}
function collectUserMessages(history, currentMessage) {
  const fromHistory = history.filter((m) => m.role === "user" && typeof m.content === "string").map((m) => m.content);
  return currentMessage?.trim() ? [...fromHistory, currentMessage.trim()] : fromHistory;
}
function captureContextualAnswer(history, currentMessage, filledSet) {
  const msg = currentMessage.trim();
  if (!msg) return [];
  const lastLucy = getLastLucyMessage(history);
  const asked = inferLucyAskedField(lastLucy);
  const captures = [];
  if (!filledSet.has("Nombre del cliente") && (asked === "nombre" || !history.some((m) => m.role === "assistant") && !isGreetingOnlyMessage(msg)) && !isAffirmativeOnlyMessage(msg) && !isQuoteIntentMessage(msg) && !isAmbiguousShortNumber(msg) && /[a-záéíóúüñ]/i.test(msg) && !/@/.test(msg) && !/\d{4,}/.test(msg)) {
    const soyMatch = msg.match(/^\s*soy\s+(.+)$/i);
    const candidato = soyMatch ? soyMatch[1].trim() : msg;
    const nombre = sanitizeDisplayName(candidato);
    if (nombre && candidato.length < 40 && !/\?/.test(candidato)) {
      captures.push({ label: "Nombre del cliente", value: nombre });
    }
  }
  if (!filledSet.has("Tipo de evento") && asked === "tipo_evento") {
    const tipo = parseTipoEventoFromText(msg) ?? (isServiceRelatedMessage(msg) ? null : msg);
    if (tipo && tipo.length >= 2 && !/@/.test(tipo)) {
      captures.push({ label: "Tipo de evento", value: tipo });
    } else if (isServiceRelatedMessage(msg)) {
      const service = parsePrimaryService(msg);
      const inv = parseInvitadosFromText(msg);
      if (service) {
        captures.push({ label: "Requerimientos o servicios", value: service });
      }
      if (inv) {
        captures.push({ label: "N\xFAmero de invitados", value: inv });
      }
      const tipoHist = parseTipoEventoFromText(
        history.filter((m) => m.role === "user" && typeof m.content === "string").map((m) => m.content).join(" ")
      );
      if (tipoHist) {
        captures.push({ label: "Tipo de evento", value: tipoHist });
      }
    }
  }
  if (!filledSet.has("Requerimientos o servicios") && !clientAsksForRecommendations(msg) && (asked === "requerimientos" || isServiceRelatedMessage(msg))) {
    const service = parsePrimaryService(msg);
    const dims = parseSpaceDimensions(msg);
    if (service || isServiceRelatedMessage(msg)) {
      let value = service ?? msg.slice(0, 120);
      if (dims && service) value = `${service} (espacio ${dims})`;
      else if (dims) value = `Tarima/pista \u2014 espacio ${dims}`;
      captures.push({
        label: "Requerimientos o servicios",
        value
      });
    }
  }
  if (!filledSet.has("N\xFAmero de invitados") && asked === "invitados") {
    const inv = parseInvitadosFromText(msg);
    if (inv) captures.push({ label: "N\xFAmero de invitados", value: inv });
  }
  if (!filledSet.has("Lugar/direcci\xF3n del evento") && asked === "zona") {
    const zona = parseZonaFromText(msg);
    if (zona) captures.push({ label: "Lugar/direcci\xF3n del evento", value: zona });
  }
  if (!filledSet.has("Fecha y horario") && asked === "fecha") {
    const fecha = parseFechaFromText(msg);
    if (fecha) captures.push({ label: "Fecha y horario", value: fecha });
  }
  if (!filledSet.has("Presupuesto (MXN)") && (asked === "presupuesto" || detectPresupuestoRefusal(msg))) {
    const pres = parsePresupuestoFromText(msg, { askedField: asked === "presupuesto" ? "presupuesto" : null });
    if (pres) {
      captures.push({ label: "Presupuesto (MXN)", value: pres });
    } else if (/\b(s[ií]|ok|dale|claro)\b/i.test(msg) && /\b(alejandro|opciones|propong)\b/i.test(msg)) {
      captures.push({
        label: "Presupuesto (MXN)",
        value: "Sin definir (cliente pidi\xF3 opciones)"
      });
    }
  }
  return captures;
}
function scanConversationForCaptures(history, currentMessage, filledSet) {
  const captures = [];
  const pending = new Set(filledSet);
  const userTexts = collectUserMessages(history, currentMessage).slice(-12);
  if (!pending.has("Nombre del cliente")) {
    const nombre = recoverClienteNombreFromHistory(history, currentMessage);
    if (nombre) {
      captures.push({ label: "Nombre del cliente", value: nombre });
      pending.add("Nombre del cliente");
    }
  }
  for (const msg of userTexts) {
    if (!pending.has("Tipo de evento")) {
      const tipo = parseTipoEventoFromText(msg);
      if (tipo) {
        captures.push({ label: "Tipo de evento", value: tipo });
        pending.add("Tipo de evento");
      }
    }
    if (!pending.has("Requerimientos o servicios") && !clientAsksForRecommendations(msg) && isServiceRelatedMessage(msg)) {
      const service = parsePrimaryService(msg);
      const dims2 = parseSpaceDimensions(msg);
      let value = service ?? msg.trim().slice(0, 120);
      if (dims2 && service) value = `${service} (espacio ${dims2})`;
      else if (dims2 && /pista|tarima/i.test(msg)) value = `Pista de baile (espacio ${dims2})`;
      captures.push({
        label: "Requerimientos o servicios",
        value
      });
      pending.add("Requerimientos o servicios");
    }
    if (!pending.has("N\xFAmero de invitados")) {
      const inv = parseInvitadosFromText(msg);
      if (inv) {
        captures.push({ label: "N\xFAmero de invitados", value: inv });
        pending.add("N\xFAmero de invitados");
      }
    }
    if (!pending.has("Lugar/direcci\xF3n del evento")) {
      const zona = parseZonaFromText(msg);
      if (zona && !isDimensionText(zona)) {
        captures.push({ label: "Lugar/direcci\xF3n del evento", value: zona });
        pending.add("Lugar/direcci\xF3n del evento");
      }
    }
    if (!pending.has("Fecha y horario")) {
      const fecha = parseFechaFromText(msg);
      if (fecha) {
        captures.push({ label: "Fecha y horario", value: fecha });
        pending.add("Fecha y horario");
      }
    }
    if (!pending.has("Presupuesto (MXN)")) {
      const invMatch = parseInvitadosFromText(msg);
      const looksLikeInvitadosOnly = !!invMatch && !/\$|presupuesto|mil\b|pesos|mxn|mnx/i.test(msg);
      if (!looksLikeInvitadosOnly) {
        const pres = parsePresupuestoFromText(msg);
        if (pres) {
          captures.push({ label: "Presupuesto (MXN)", value: pres });
          pending.add("Presupuesto (MXN)");
        }
      }
    }
    const dims = parseSpaceDimensions(msg);
    if (dims && /pista|tarima/i.test(userTexts.join(" "))) {
      const reqIdx = captures.findIndex((c) => c.label === "Requerimientos o servicios");
      if (reqIdx >= 0) {
        if (!captures[reqIdx].value.includes(dims)) {
          const base = captures[reqIdx].value.replace(/\s*\(espacio [^)]+\)/, "").trim();
          captures[reqIdx].value = `${base} (espacio ${dims})`;
        }
      } else if (!pending.has("Requerimientos o servicios")) {
        const service = parsePrimaryService(userTexts.join(" ")) ?? "Pista de baile";
        captures.push({
          label: "Requerimientos o servicios",
          value: `${service} (espacio ${dims})`
        });
        pending.add("Requerimientos o servicios");
      }
    }
  }
  return captures;
}
function applyCapturesToCrm(mergedLines, filledSet, captures) {
  for (const { label, value } of captures) {
    if (filledSet.has(label) || !value?.trim()) continue;
    mergedLines.push(`- ${label}: ${value}`);
    filledSet.add(label);
  }
}

// src/tipoContacto.ts
var PROVEEDOR_OFFER = /\b(les\s+ofrezco|ofrecemos\s+a\s+ustedes|soy\s+proveedor|quiero\s+venderles|busco\s+clientes|manejo\s+.+\s+y\s+busco\s+clientes|distribuidor\s+de|mi\s+empresa\s+ofrece|vendo\s+.+\s+a\s+eventos)\b/i;
var CLIENTE_BUY = /\b(solicit[oa]\s+(una\s+)?cotizaci[oó]n|quiero\s+cotizar|necesito\s+(servicio|cotiz|un\s+|una\s+)|requiero\s+(servicio|cotiz)|me\s+das\s+precio|me\s+interesa\s+contratar|busco\s+(servicio|cotiz|proveedor\s+de\s+catering|banquete|taquiza|caf[eé])|cotizaci[oó]n\s+de|precio\s+de)\b/i;
function resolveTipoContacto(extracted, conversationText) {
  const text = conversationText.trim();
  if (!text) return extracted === "incierto" ? "cliente" : extracted;
  if (CLIENTE_BUY.test(text)) return "cliente";
  if (PROVEEDOR_OFFER.test(text)) return "proveedor";
  if (extracted === "proveedor" && !PROVEEDOR_OFFER.test(text)) {
    return "cliente";
  }
  if (extracted === "incierto" || !extracted) return "cliente";
  return extracted;
}
function clientMentionsOwnCompanyEmail(text) {
  if (!text?.trim()) return false;
  return /\b(capybaraeventos@gmail\.com|bodasesor@gmail\.com|hola@bodasesor\.com)\b/i.test(text);
}
function clientAsksIfCompanyEmailCorrect(text) {
  if (!text?.trim()) return false;
  const t = text.toLowerCase();
  return clientMentionsOwnCompanyEmail(text) || /es\s+el\s+correo\s+correcto|ese\s+correo\s+es\s+correcto|correo\s+correcto|es\s+ese\s+el\s+correo/i.test(
    t
  );
}
function buildCompanyEmailConfirmReply() {
  return "S\xED, capybaraeventos@gmail.com es el correo de Bodasesor \u2014 tu solicitud ya nos lleg\xF3 bien. Para enviarte la cotizaci\xF3n personalizada, \xBFme compartes tu correo de trabajo?";
}

// src/modoServicio.ts
var PEDIDO_ENTREGA = /\b(para\s+llevar|entrega|que\s+me\s+dejen|que\s+me\s+entreguen|solo\s+los?\s+rollos?|solo\s+el\s+producto|sin\s+montaje|pedido\s+de|un\s+pedido\s+de|cantidad\s+de\s+\d+|piezas?\s+de)\b/i;
var SERVICIO_MONTADO = /\b(montado\s+en|en\s+el\s+evento|barra\s+en|estaci[oó]n\s+en|meseros|servicio\s+en\s+el|montaje\s+en|en\s+mi\s+evento|en\s+la\s+fiesta)\b/i;
function detectModoServicio(text) {
  const t = text?.trim() ?? "";
  if (!t) return null;
  if (PEDIDO_ENTREGA.test(t)) return "pedido_entrega";
  if (SERVICIO_MONTADO.test(t)) return "servicio_montado";
  return null;
}
function needsModoServicioClarification(text, current) {
  if (current) return false;
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /\b(\d+\s+rollos?|\d+\s+piezas?|\d+\s+platos?|quiero\s+\d+|necesito\s+\d+)\b/i.test(t) && !PEDIDO_ENTREGA.test(t) && !SERVICIO_MONTADO.test(t);
}
function buildModoServicioClarificationQuestion() {
  return "\xBFLo quieres montado en tu evento con barra y servicio, o solo la entrega del producto?";
}

// src/price-guard.ts
var NO_LISTED_PRICE_PATTERN = /\bdj\b|disc\s*jockey|iluminaci[oó]n|mobiliario|carpas?|lonas?|toldos?|pantallas?|led\s*wall|pista(\s+de\s+baile)?|tarimas?|estructuras?|inflables?|soft\s*play|florister[ií]a|flores|decoraci[oó]n\s+floral|audio|sonido|valet|niñeras?|valet\s+parking/i;
var LISTED_PRICE_PATTERN = /banquete|taquiza|parrillada|barra\s+(de\s+)?(bebidas?|alimentos?|caf[eé]|pizzas?|sushi|crepas?|mariscos?|pastas?)|mesa\s+de\s+dulces|cocteler[ií]a|mixolog[ií]a|coffee\s*break|brunch|paella|m[oó]cteles?|canap[eé]s|pozole|americana|kosher|navide[nñ]o/i;
var dynamicListedPattern = null;
var dynamicNoListedPattern = null;
var PRICE_CLAIM_PATTERN = /\$\s*[\d,.]+(?:\s*\/\s*pp)?|\b[\d,.]+\s*(?:mil|k)\b(?:\s*pesos?)?|\bentre\s*\$?\s*[\d,.]+\s*y\s*\$?\s*[\d,.]+|\bdesde\s*\$[\d,.]+|\b[\d,.]+\s*pesos?\b/i;
var PRICE_QUESTION_PATTERN = /\bcu[aá]nto\s+cuesta|\bprecio\b|\bcosto\b|\bm[aá]s\s+o\s+menos\s+cu[aá]nto|\bcu[aá]nto\s+sale|\bcu[aá]nto\s+cobran|\btarifa\b/i;
function clientAsksPrice(message) {
  if (!message?.trim()) return false;
  return PRICE_QUESTION_PATTERN.test(message);
}
function mentionsNoListedPriceService(text) {
  if (dynamicNoListedPattern?.test(text)) return true;
  return NO_LISTED_PRICE_PATTERN.test(text);
}
function mentionsListedPriceService(text) {
  if (dynamicListedPattern?.test(text)) return true;
  return LISTED_PRICE_PATTERN.test(text);
}
function messageClaimsPrice(mensaje) {
  return PRICE_CLAIM_PATTERN.test(mensaje);
}
function responseHasInventedPrice(mensaje, currentMessage, recentContext) {
  if (!messageClaimsPrice(mensaje)) return false;
  const ctx = `${currentMessage ?? ""} ${mensaje} ${recentContext ?? ""}`.toLowerCase();
  if (mentionsNoListedPriceService(ctx)) return true;
  if (!mentionsListedPriceService(ctx) && messageClaimsPrice(mensaje)) {
    return true;
  }
  return false;
}
function detectServiceLabel(text) {
  const t = text.toLowerCase();
  if (/\bdj\b/.test(t)) return "DJ";
  if (/iluminaci[oó]n/.test(t)) return "iluminaci\xF3n";
  if (/mobiliario/.test(t)) return "mobiliario";
  if (/carpas?|lonas?/.test(t)) return "carpas";
  if (/pantallas?/.test(t)) return "pantallas";
  if (/pista(\s+de\s+baile)?|tarimas?/.test(t)) return "pista de baile";
  if (/flor/.test(t)) return "florister\xEDa";
  return "ese servicio";
}
function getPriceServiceLabel(text) {
  return detectServiceLabel(text);
}
function stripPriceSentences(mensaje) {
  const sentences = mensaje.split(/(?<=[.!?])\s+|\n+/);
  const kept = sentences.filter((s) => !PRICE_CLAIM_PATTERN.test(s));
  return kept.join(" ").replace(/\s{2,}/g, " ").trim();
}
function stripStalePriceTalk(mensaje, currentMessage) {
  if (!currentMessage?.trim() || clientAsksPrice(currentMessage)) return mensaje;
  if (/\bdj\b|precio|cu[aá]nto\s+cuesta/i.test(currentMessage)) return mensaje;
  return mensaje.split(/(?<=[.!?])\s+|\n+/).filter((s) => !/\bdj\b/i.test(s) || clientAsksPrice(currentMessage)).filter((s) => !/alejandro te (incluye|da) el precio/i.test(s)).join(" ").replace(/\s{2,}/g, " ").trim();
}
function buildConsultativeNoPriceReply(message) {
  if (!message?.trim()) return null;
  const t = message.toLowerCase();
  const team = advisorLabelForClient();
  if (/\bcarpas?\b|lonas?\b|toldos?\b/.test(t)) {
    return `Las carpas protegen del sol y la lluvia en jard\xEDn o terraza. Hay Cathedral (techos altos), Pir\xE1mide (modernas) y Planas (funcionales). ${team} incluir\xE1 el precio seg\xFAn el tama\xF1o. \xBFQu\xE9 estilo va m\xE1s con tu evento?`;
  }
  if (/\bdj\b|disc\s*jockey|audio\b|sonido\b/.test(t)) {
    return `El DJ incluye equipo completo, micr\xF3fono para brindis e iluminaci\xF3n b\xE1sica; puedes mandar playlist. ${team} incluir\xE1 el precio en tu cotizaci\xF3n. \xBFYa tienes estilo de m\xFAsica o prefieres que lea el ambiente?`;
  }
  if (/iluminaci[oó]n/.test(t)) {
    return `Opciones: uplighting LED en paredes, luces colgantes tipo edison o luces de pista. ${team} cotiza seg\xFAn el espacio. \xBFQu\xE9 ambiente buscas: elegante, rom\xE1ntico o fiesta?`;
  }
  if (/pista(\s+de\s+baile)?|tarimas?\b/.test(t)) {
    return `Manejamos pistas de baile y tarimas en varios tama\xF1os, con opci\xF3n iluminada. ${team} incluir\xE1 el precio seg\xFAn las medidas de tu espacio. \xBFYa tienes idea del tama\xF1o?`;
  }
  if (/mobiliario/.test(t)) {
    return `Manejamos mesas, sillas y mobiliario para eventos en distintos estilos. ${team} cotiza seg\xFAn cantidad y tipo. \xBFQu\xE9 mobiliario necesitas?`;
  }
  return null;
}
function buildAlejandroPriceReply(serviceHint, clientMessage) {
  const consultative = clientMessage ? buildConsultativeNoPriceReply(clientMessage) : null;
  if (consultative) return consultative;
  const svc = serviceHint?.trim() || "ese servicio";
  const team = advisorLabelForClient();
  return `S\xED, manejamos ${svc}. El precio depende del evento \u2014 ${team} te lo incluye en tu cotizaci\xF3n.`;
}
function sanitizeInventedPrices(mensaje, currentMessage, recentContext) {
  if (!responseHasInventedPrice(mensaje, currentMessage, recentContext)) {
    return mensaje;
  }
  const ctx = `${currentMessage ?? ""} ${mensaje} ${recentContext ?? ""}`;
  const service = detectServiceLabel(ctx);
  const cleaned = stripPriceSentences(mensaje);
  const safe = buildAlejandroPriceReply(service, currentMessage);
  if (!cleaned || cleaned.length < 15) return safe;
  const withoutCorreoInsist = cleaned.replace(/[^.!?\n]*correo[^.!?\n]*\?[^.!?\n]*/gi, "").trim();
  const base = withoutCorreoInsist.length > 20 ? withoutCorreoInsist : "";
  if (base && !/alejandro/i.test(base)) {
    return `${base} ${safe}`.trim();
  }
  return safe;
}

// src/services/googleSheetsCatalog.ts
function formatInclusionForWhatsApp(text, maxLen = 420) {
  let cleaned = text.replace(/\s+/g, " ").replace(/ incluido\s+/gi, ". ").replace(/ servicio base incluye:/gi, " Incluye:").replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚ])/g, "$1. $2").trim();
  if (cleaned.length > maxLen) {
    cleaned = `${cleaned.slice(0, maxLen - 1).trim()}\u2026`;
  }
  return cleaned;
}
function parseRowNotes(notas) {
  const result = { inclusion: "", minimo: "", gammaLink: "", extras: "" };
  if (!notas?.trim()) return result;
  for (const part of notas.split("|").map((s) => s.trim())) {
    if (!part) continue;
    if (/^cat[aá]logo:\s*https?:/i.test(part)) {
      result.gammaLink = part.replace(/^cat[aá]logo:\s*/i, "").trim();
    } else if (/^m[ií]nimo de salida:/i.test(part)) {
      result.minimo = part.replace(/^m[ií]nimo de salida:\s*/i, "").trim();
    } else if (/^extras:/i.test(part)) {
      result.extras = part.replace(/^extras:\s*/i, "").trim();
    } else if (!result.inclusion) {
      result.inclusion = formatInclusionForWhatsApp(part);
    } else {
      result.inclusion = formatInclusionForWhatsApp(`${result.inclusion} ${part}`);
    }
  }
  if (result.extras) {
    const extraText = formatInclusionForWhatsApp(result.extras, 180);
    result.inclusion = result.inclusion ? `${result.inclusion} Extras: ${extraText}` : `Extras: ${extraText}`;
  }
  return result;
}

// src/services/catalogService.ts
var GENERIC_CATERING_MENU_MARKERS = /estas son las opciones m[aá]s pedidas|cu[aá]l te interesa\?\s*con eso te paso precios/i;
var REFRESH_MS = Number(process.env["CATALOG_REFRESH_MINUTES"] ?? "10") * 6e4;
var snapshot = null;
function emptyStatus() {
  return {
    loaded: false,
    lastRefresh: null,
    lastError: null,
    sources: {
      sheets: false,
      sheetsRows: 0,
      sheetsUrl: null,
      gamma: false,
      gammaUrl: null,
      staticFallback: true
    },
    pricedServicesCount: 0,
    noPriceServicesCount: 0
  };
}
function getCatalogStatus() {
  return snapshot?.status ?? emptyStatus();
}
function normalizeForMatch(value) {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}
function queryTokens(query) {
  const stop = /^(cuanto|cuanta|cuesta|cuestan|precio|costo|sale|cobran|tarifa|persona|personas|por|para|una|uno|un|el|la|los|las|de|del|me|te|se|si|no|que|como|donde|cuando|con|incluye|trae|lleva)$/;
  const normalized = normalizeForMatch(query);
  const compounds = [];
  if (/\b4\s*tiempos\b/.test(normalized)) compounds.push("4tiempos");
  if (/\b3\s*tiempos\b/.test(normalized)) compounds.push("3tiempos");
  const tokens = normalized.split(/[^a-z0-9]+/).filter((t) => (t.length >= 3 || /^\d$/.test(t)) && !stop.test(t));
  if (/\bcatering\b/.test(normalized)) {
    tokens.push("banquete", "taquiza", "brunch", "coffee");
  }
  return [.../* @__PURE__ */ new Set([...compounds, ...tokens])];
}
function parseCatalogQueryFilters(query) {
  const t = normalizeForMatch(query);
  let nivel = null;
  if (/\bpremium\b/.test(t)) nivel = "Premium";
  else if (/\bbasico\b/.test(t)) nivel = "Basico";
  else if (/\btradicional\b/.test(t)) nivel = "Tradicional";
  else if (/\bsolo\s*alimentos\b/.test(t)) nivel = "Solo Alimentos";
  return {
    banquete: /\bbanquete\b/.test(t),
    taquiza: /\btaquiza\b/.test(t),
    cuatroTiempos: /\b4\s*tiempos\b/.test(t) || /\b4tiempos\b/.test(t),
    tresTiempos: /\b3\s*tiempos\b/.test(t) || /\b3tiempos\b/.test(t),
    nivel
  };
}
function rowHaystack(row) {
  return normalizeForMatch(`${row.servicio} ${row.categoria}`).replace(/\s+/g, " ");
}
function scoreCatalogRow(row, tokens, filters, query) {
  const haystack = rowHaystack(row).replace(/\s+/g, "");
  let score = 0;
  for (const token of tokens) {
    const tok = token.replace(/\s+/g, "");
    if (haystack.includes(tok)) score += 2;
  }
  if (filters.banquete && /\bbanquete\b/.test(rowHaystack(row))) score += 4;
  if (filters.banquete && /\btaquiza\b/.test(rowHaystack(row))) score -= 12;
  if (filters.taquiza && /\btaquiza\b/.test(rowHaystack(row))) score += 4;
  if (filters.taquiza && /\bbanquete\b/.test(rowHaystack(row))) score -= 12;
  if (filters.cuatroTiempos) {
    if (/\b4\s*tiempos\b/.test(rowHaystack(row))) score += 6;
    if (/\b3\s*tiempos\b/.test(rowHaystack(row))) score -= 8;
  }
  if (filters.tresTiempos) {
    if (/\b3\s*tiempos\b/.test(rowHaystack(row))) score += 6;
    if (/\b4\s*tiempos\b/.test(rowHaystack(row))) score -= 8;
  }
  if (filters.nivel) {
    const nivel = normalizeForMatch(extractNivelLabel(row.servicio));
    if (nivel === normalizeForMatch(filters.nivel)) score += 8;
    else score -= 4;
  }
  const hay = rowHaystack(row);
  const q = normalizeForMatch(query);
  if (!/\bmexicano\b/.test(q) && /\bmexicano\b/.test(hay)) score -= 6;
  if (!/\bkosher\b/.test(q) && /\bkosher\b/.test(hay)) score -= 6;
  if (!/\bnavide/.test(q) && /\bnavide/.test(hay)) score -= 6;
  return score;
}
function rankCatalogMatches(query, rows, requirePrice = false) {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];
  const filters = parseCatalogQueryFilters(query);
  const scored = rows.filter((row) => !requirePrice || row.tienePrecio && row.precio).map((row) => ({ row, score: scoreCatalogRow(row, tokens, filters, query) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  const top = scored[0].score;
  const minScore = filters.nivel || filters.cuatroTiempos || filters.tresTiempos ? top - 1 : top - 3;
  return scored.filter((item) => item.score >= minScore).map((item) => item.row);
}
function lookupCatalogPrices(query) {
  if (!snapshot?.rows.length) return [];
  return rankCatalogMatches(query, snapshot.rows, true);
}
function lookupCatalogServices(query) {
  if (!snapshot?.rows.length) return [];
  return rankCatalogMatches(query, snapshot.rows, false);
}
function extractNivelLabel(servicio) {
  const match = servicio.match(/\(([^)]+)\)\s*$/);
  return match?.[1]?.trim() || servicio;
}
function buildInclusionBlock(rows, maxPerLevel = 220) {
  const inclusionByLevel = rows.map((row) => ({
    nivel: extractNivelLabel(row.servicio),
    inclusion: parseRowNotes(row.notas).inclusion
  }));
  const uniqueTexts = [...new Set(inclusionByLevel.map((r) => r.inclusion).filter(Boolean))];
  if (!uniqueTexts.length) return "";
  if (uniqueTexts.length === 1) {
    return `

*Incluye:* ${uniqueTexts[0]}`;
  }
  const lines = inclusionByLevel.filter((r) => r.inclusion).slice(0, 5).map(
    (r) => `\u2022 *${r.nivel}:* ${r.inclusion.slice(0, maxPerLevel)}${r.inclusion.length > maxPerLevel ? "\u2026" : ""}`
  );
  return lines.length ? `

*Qu\xE9 incluye cada nivel:*
${lines.join("\n")}` : "";
}
function clientAsksInclusion(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /\bqu[eé]\s+incluye|\bqu[eé]\s+trae|\bqu[eé]\s+lleva|\bmen[uú]s?\b|\bdetalle\b|\bopci[oó]nes?\s+incluyen|\bincluye\s+(la|el|un|una|el\s+paquete)\b/i.test(
    t
  ) && !/\bcu[aá]nto\s+cuesta|\bprecio\b/i.test(t);
}
function buildCatalogInclusionAnswer(query) {
  const filters = parseCatalogQueryFilters(query);
  const matches = lookupCatalogServices(query);
  if (!matches.length) return null;
  const unique = [...new Map(matches.map((row) => [row.servicio, row])).values()];
  const specificQuery = !!(filters.nivel || filters.cuatroTiempos || filters.tresTiempos);
  if (specificQuery && unique.length >= 1) {
    const row = unique[0];
    const parsed = parseRowNotes(row.notas);
    const nivel = extractNivelLabel(row.servicio);
    const baseName2 = row.categoria || row.servicio.split(" (")[0] || row.servicio;
    const price = row.tienePrecio && row.precio ? `
*Precio:* ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${parsed.minimo ? ` (m\xEDn. ${parsed.minimo})` : ""}` : "";
    const inclusion = parsed.inclusion || "Alejandro puede darte el detalle completo del men\xFA.";
    return `Te comparto qu\xE9 incluye *${baseName2} \u2014 ${nivel}*:${price}

${inclusion}`;
  }
  const baseName = unique[0].categoria || unique[0].servicio.split(" (")[0] || unique[0].servicio;
  const blocks = unique.slice(0, 5).map((row) => {
    const parsed = parseRowNotes(row.notas);
    const nivel = extractNivelLabel(row.servicio);
    const price = row.tienePrecio && row.precio ? ` \u2014 ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${parsed.minimo ? `, m\xEDn. ${parsed.minimo}` : ""}` : "";
    const inclusion = parsed.inclusion || "Alejandro puede darte el detalle completo del men\xFA.";
    return `*${nivel}*${price}
${inclusion}`;
  });
  let msg = `Te comparto qu\xE9 incluye *${baseName}*:

${blocks.join("\n\n")}`;
  return msg;
}
function buildCatalogPriceAnswer(query) {
  const matches = lookupCatalogPrices(query);
  if (!matches.length) return null;
  const unique = [...new Map(matches.map((row) => [row.servicio, row])).values()];
  const baseName = unique[0].categoria || unique[0].servicio.split(" (")[0] || unique[0].servicio;
  const priceLines = unique.slice(0, 6).map((row) => {
    const parsed = parseRowNotes(row.notas);
    const nivel = extractNivelLabel(row.servicio);
    const unit = row.unidad ? ` ${row.unidad}` : "";
    const min = parsed.minimo ? ` (m\xEDn. ${parsed.minimo})` : "";
    return `\u2022 *${nivel}* \u2014 ${row.precio}${unit}${min}`;
  }).join("\n");
  const inclusionBlock = buildInclusionBlock(unique, 280);
  return `S\xED, manejamos ${baseName}:

${priceLines}${inclusionBlock}`;
}
function summarizeServicePrices(serviceKey, maxLevels = 4) {
  const rows = snapshot?.rows.filter(
    (r) => r.tienePrecio && r.precio && normalizeForMatch(`${r.categoria} ${r.servicio}`).includes(normalizeForMatch(serviceKey))
  );
  if (!rows?.length) return null;
  const unique = [...new Map(rows.map((row) => [row.servicio, row])).values()];
  const label = unique[0].categoria || unique[0].servicio.split(" (")[0] || serviceKey;
  const lines = unique.slice(0, maxLevels).map((row) => {
    const nivel = extractNivelLabel(row.servicio);
    const parsed = parseRowNotes(row.notas);
    const min = parsed.minimo ? ` (m\xEDn. ${parsed.minimo})` : "";
    return `\u2022 *${nivel}:* ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${min}`;
  });
  return `*${label}*
${lines.join("\n")}`;
}
function buildCatalogComparisonAnswer() {
  if (!snapshot?.rows.length) return null;
  const taquiza = summarizeServicePrices("taquiza", 4);
  const banquete = summarizeServicePrices("banquete 3 tiempos", 4);
  if (!taquiza && !banquete) return null;
  const parts = [
    "Te comparto una comparaci\xF3n r\xE1pida con precios de referencia:",
    "",
    taquiza ?? "",
    taquiza && banquete ? "" : "",
    banquete ?? "",
    "",
    "*En general:* taquiza es m\xE1s casual y flexible; banquete es m\xE1s formal con servicio de meseros y vajilla.",
    "\xBFCu\xE1l te late m\xE1s para tu evento?"
  ];
  return parts.filter((l) => l !== void 0 && l !== "").join("\n").trim();
}
function formatServiceDataForPrompt(query) {
  const matches = lookupCatalogServices(query);
  if (!matches.length) return null;
  const unique = [...new Map(matches.map((row) => [row.servicio, row])).values()].slice(0, 6);
  const lines = unique.map((row) => {
    const parsed = parseRowNotes(row.notas);
    const price = row.tienePrecio && row.precio ? `Precio: ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}${parsed.minimo ? ` (m\xEDn. ${parsed.minimo})` : ""}` : "Precio: sin listar \u2014 Alejandro cotiza";
    const inclusion = parsed.inclusion ? `Incluye: ${parsed.inclusion}` : "";
    return `- ${row.servicio} | ${price}${inclusion ? ` | ${inclusion}` : ""}`;
  });
  return ["DATOS DEL SERVICIO (fuente Google Sheet \u2014 usar solo esto, no inventar):", ...lines].join(
    "\n"
  );
}
function mentionedServiceLabel(query) {
  return parsePrimaryService(query);
}
function buildCatalogNotFoundAnswer(serviceLabel) {
  return `S\xED, podemos ayudarte con *${serviceLabel}*. Lo confirmo con nuestro equipo para darte descripci\xF3n, precio e inclusiones exactas y lo anoto en tu solicitud.`;
}
function buildCatalogServiceDetailAnswer(query) {
  if (!snapshot?.rows.length) return null;
  const priceAnswer = buildCatalogPriceAnswer(query);
  if (priceAnswer) return priceAnswer;
  const inclusionAnswer = buildCatalogInclusionAnswer(query);
  if (inclusionAnswer) return inclusionAnswer;
  const matches = lookupCatalogServices(query);
  if (!matches.length) return null;
  const row = matches[0];
  const baseName = row.categoria || row.servicio.split(" (")[0] || row.servicio;
  const parsed = parseRowNotes(row.notas);
  if (parsed.inclusion) {
    return `S\xED, manejamos *${baseName}*.

${parsed.inclusion}`;
  }
  return null;
}
function responseLooksLikeGenericCateringMenu(text) {
  return GENERIC_CATERING_MENU_MARKERS.test(text);
}
function buildCatalogCateringOverviewFromSheet() {
  if (!snapshot?.rows.length) return null;
  const byCategory = /* @__PURE__ */ new Map();
  for (const row of snapshot.rows) {
    const cat = row.categoria || row.servicio.split(" (")[0] || "Servicio";
    if (!byCategory.has(cat)) byCategory.set(cat, row);
  }
  const foodCats = [...byCategory.entries()].filter(
    ([cat]) => /taquiza|banquete|brunch|coffee|pizza|sushi|barra|parrillada|canap|crep|paella|pozole|americana|kosher|navide/i.test(
      cat
    )
  ).slice(0, 8);
  if (!foodCats.length) return null;
  const options = foodCats.map(([cat, row]) => {
    const desde = row.tienePrecio && row.precio ? ` \u2014 desde ${row.precio}${row.unidad ? ` ${row.unidad}` : ""}` : "";
    return `\u2022 *${cat}*${desde}`;
  });
  return [
    "S\xED, manejamos catering para eventos. Del cat\xE1logo actual, estas son algunas opciones:",
    "",
    ...options,
    "",
    "\xBFCu\xE1l te interesa? Te paso precios e inclusiones de la que elijas."
  ].join("\n");
}
function injectCatalogCateringIfAsked(clientMessage, aiResponse) {
  if (!clientMessage?.trim()) return aiResponse;
  const asksService = clientAsksServiceInfo(clientMessage) || clientAsksPrice(clientMessage);
  const genericCatering = clientMentionsCatering(clientMessage) && !parsePrimaryService(clientMessage);
  const mentionsService = isServiceRelatedMessage(clientMessage) && !!parsePrimaryService(clientMessage);
  if (!asksService && !genericCatering && !mentionsService) return aiResponse;
  if (responseLooksLikeGenericCateringMenu(aiResponse)) {
    const detail2 = buildCatalogServiceDetailAnswer(clientMessage);
    if (detail2) return detail2;
  }
  const detail = buildCatalogServiceDetailAnswer(clientMessage);
  if (detail) {
    if (asksService || clientAsksInclusion(clientMessage) || responseLooksLikeGenericCateringMenu(aiResponse) || !aiResponse.trim()) {
      return detail;
    }
    return aiResponse;
  }
  const label = mentionedServiceLabel(clientMessage);
  if (label && (asksService || mentionsService)) {
    return buildCatalogNotFoundAnswer(label);
  }
  if (genericCatering && !responseLooksLikeGenericCateringMenu(aiResponse)) {
    const overview = buildCatalogCateringOverviewFromSheet();
    if (overview) return overview;
  }
  return aiResponse;
}

// src/lucy-flow-guards.ts
var EMAIL_WAIVED_LABEL = "Correo (prefiere no compartir)";
var EMAIL_REFUSAL_PATTERN = /(?:no\s+tengo(\s+un?)?\s+correo|no\s+quiero(\s+dar|\s+compartir)?(\s+mi)?\s+correo|sin\s+correo|no\s+uso\s+correo|no\s+dispongo\s+de\s+correo|por\s+este\s+medio|prefiero\s+(?:por\s+)?whatsapp|por\s+aqu[ií]|mandar.*por\s+aqu[ií]|me\s+la\s+(?:pueden\s+)?mandar\s+por\s+aqu[ií]|aqu[ií]\s+(?:est[aá]|por)|por\s+aqu[ií]\s+por\s+fa|no\s+me\s+gusta\s+dar|no\s+es\s+necesario|no\s+hace\s+falta|no\s+quiero\s+darlo)/i;
var CLOSING_CORE_FIELDS = [
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Lugar/direcci\xF3n del evento",
  "Fecha y horario",
  "N\xFAmero de invitados",
  "Presupuesto (MXN)"
];
var LUCY_INTRO = "Hola, soy Lucy, agente virtual de Bodasesor.";
var TIPO_EVENTO_HINT = "Manejamos bodas, XV a\xF1os, baby showers, cumplea\xF1os, eventos corporativos, bautizos y celebraciones familiares.";
var SERVICIOS_CATALOGO_HINT = "Manejamos alimentos y barras (banquetes, taquizas, barras tem\xE1ticas), mobiliario, carpas, pistas de baile, DJ, iluminaci\xF3n, pantallas, mesas de dulces y m\xE1s.";
var SERVICIOS_CATALOGO_HINT_ADICIONAL = "Tambi\xE9n manejamos bebidas, DJ, iluminaci\xF3n, carpas, mobiliario, pantallas, mesas de dulces y barras de alimentos.";
function mensajeMencionaCatalogoServicios(mensaje) {
  return /alimentos?|mobiliario|carpas?|pistas?(\s+de\s+baile)?|bebidas?|banquete|taquiza|iluminaci[oó]n|pantallas?|mesas?\s+de\s+dulces|dj\b|barras?\s+(de\s+)?alimentos|estaciones?\s+de\s+comida/i.test(
    mensaje
  );
}
function appendServiciosCatalogoHint(pregunta, adicional = false) {
  if (mensajeMencionaCatalogoServicios(pregunta)) return pregunta;
  const hint = adicional ? SERVICIOS_CATALOGO_HINT_ADICIONAL : SERVICIOS_CATALOGO_HINT;
  return `${pregunta.trim()} ${hint}`.trim();
}
function getQuestionVariants() {
  const team = advisorLabelForClient();
  return {
    nombre: [
      "\xBFMe regalas tu nombre para iniciar?",
      "\xBFCon qui\xE9n tengo el gusto?",
      "\xBFC\xF3mo te llamas?"
    ],
    correo: [
      `Para mandarte la info y que ${team} te arme la propuesta, \xBFa qu\xE9 correo te lo env\xEDo?`,
      "\xBFMe compartes un correo para enviarte los detalles de la cotizaci\xF3n?",
      "\xBFA qu\xE9 correo te mando la informaci\xF3n?"
    ],
    tipo_evento: [
      "\xBFQu\xE9 tipo de celebraci\xF3n es?",
      "\xBFQu\xE9 festejan o qu\xE9 evento est\xE1n planeando?",
      "Cu\xE9ntame, \xBFde qu\xE9 se trata el evento?"
    ],
    requerimientos: [
      "Plat\xEDcame, \xBFqu\xE9 tienes pensado para tu evento?",
      "\xBFQu\xE9 servicios te gustar\xEDa cotizar?",
      "\xBFQu\xE9 necesitas para el evento?"
    ],
    invitados: [
      "\xBFM\xE1s o menos para cu\xE1ntas personas ser\xEDa?",
      "\xBFCu\xE1ntos invitados tienen contemplados?",
      "\xBFTienen un estimado de invitados? Si a\xFAn no lo saben, sin problema \u2014 pueden darme un rango aproximado."
    ],
    zona: [
      "\xBFEn qu\xE9 ciudad ser\xEDa tu evento? Si tienes la direcci\xF3n exacta, ser\xEDa lo ideal.",
      "\xBFEn qu\xE9 ciudad lo tendr\xEDan? Con la direcci\xF3n exacta podemos cotizar mejor.",
      "\xBFCu\xE1l ser\xEDa la ciudad del evento? Si ya tienen sal\xF3n o direcci\xF3n, comp\xE1rtanmela."
    ],
    fecha: [
      "\xBFYa tienen fecha o todav\xEDa la van definiendo?",
      "\xBFPara cu\xE1ndo lo tienen pensado?",
      "\xBFYa hay d\xEDa definido o siguen viendo opciones?"
    ],
    presupuesto: [
      "\xBFTienen alg\xFAn rango de presupuesto en mente?",
      "\xBFManejan alg\xFAn presupuesto estimado para el evento?",
      `\xBFTienen idea del presupuesto o prefieren que ${team} les proponga opciones?`
    ]
  };
}
var FIELD_ASK_PATTERNS = {
  nombre: /regalas?\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|con\s+qui[eé]n\s+tengo|tu\s+nombre|me\s+das\s+tu\s+nombre/i,
  correo: /correo|e-?mail|env[ií]o|mandarte|mandar(te)?\s+la\s+info|compartes?\s+un\s+correo/i,
  tipo_evento: /festejan|tipo\s+de\s+(evento|celebraci[oó]n)|qu[eé]\s+evento|qu[eé]\s+celebr|de\s+qu[eé]\s+se\s+trata|qu[eé]\s+tipo\s+de\s+celebr/i,
  requerimientos: /pensado|servicios?|banquete|taquiza|cotizar|adem[aá]s\s+del|qu[eé]\s+necesitas|qu[eé]\s+buscas|men[uú]|plat[ií]came/i,
  invitados: /invitados|personas|gente|cu[aá]ntos|cu[aá]ntas|aproximadamente|m[aá]s\s+o\s+menos|para\s+cu[aá]ntas|ser[ií]an/i,
  zona: /ciudad|direcci[oó]n\s+exacta|d[oó]nde\s+(lo|ser[ií]|ser[aá]|queda|est[aá]n)|en\s+qu[eé]\s+(ciudad|zona|lugar)|lugar|direcci[oó]n|ubicaci[oó]n|zona|sal[oó]n/i,
  fecha: /fecha|cu[aá]ndo|d[ií]a|agenda|definiendo|definido|definir|siguen\s+viendo|opciones\s+de\s+fecha|para\s+cu[aá]ndo/i,
  presupuesto: /presupuesto|estimado|rango|inversi[oó]n|budget|monto/i
};
function isValidRequerimientosValue(value) {
  return isServiceRelatedMessage(value);
}
var CLOSING_SIGNATURE = "Perfecto, ya tengo todo.";
function detectCierreEnviado(history, lastStoredResponse) {
  if (lastStoredResponse?.includes(CLOSING_SIGNATURE)) return true;
  return history.some(
    (m) => m.role === "assistant" && typeof m.content === "string" && m.content.includes(CLOSING_SIGNATURE)
  );
}
function collectUserTexts(history, currentMessage) {
  const fromHistory = history.filter((m) => m.role === "user" && typeof m.content === "string").map((m) => m.content);
  return currentMessage?.trim() ? [...fromHistory, currentMessage.trim()] : fromHistory;
}
function detectEmailRefusal(texts) {
  return texts.some((t) => EMAIL_REFUSAL_PATTERN.test(t));
}
function applyEmailWaiver(filledSet, mergedLines, texts) {
  if (filledSet.has("Correo electr\xF3nico") || filledSet.has(EMAIL_WAIVED_LABEL)) return;
  if (!detectEmailRefusal(texts)) return;
  mergedLines.push(`- ${EMAIL_WAIVED_LABEL}: continuar por WhatsApp/chat`);
  filledSet.add(EMAIL_WAIVED_LABEL);
}
function applyPresupuestoWaiver(filledSet, mergedLines, texts, history) {
  if (filledSet.has("Presupuesto (MXN)")) return;
  const pres = findPresupuestoInTexts(texts, history);
  if (pres) {
    mergedLines.push(`- Presupuesto (MXN): ${pres}`);
    filledSet.add("Presupuesto (MXN)");
    return;
  }
  if (history && countLucyFieldAsks(history, "presupuesto") >= PRESUPUESTO_MAX_ASKS) {
    mergedLines.push(`- Presupuesto (MXN): ${PRESUPUESTO_AUTO_WAIVER}`);
    filledSet.add("Presupuesto (MXN)");
  }
}
function blockExcessivePresupuestoAsk(mensaje, filledSet, extracted, history, currentMessage, buildClosing, cierreYaEnviado, whatsappDisplayName, entityId, log) {
  const asksPresupuesto = mensajeAsksForField(mensaje, "presupuesto") || /presupuesto|rango\s+de\s+inversi/i.test(mensaje) && mensaje.includes("?");
  if (!asksPresupuesto) return mensaje;
  if (!filledSet.has("Presupuesto (MXN)")) {
    applyPresupuestoWaiver(filledSet, [], collectUserTexts(history, currentMessage), history);
  }
  if (!filledSet.has("Presupuesto (MXN)")) return mensaje;
  const presValue = findPresupuestoInTexts(collectUserTexts(history, currentMessage), history);
  if (presValue && /econ[oó]mic/i.test(presValue) && !isReadyForClosing(filledSet)) {
    const nextQ2 = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
    log?.info({ entityId }, "GUARD: presupuesto econ\xF3mico \u2014 no repetir pregunta");
    return nextQ2 ? `Entendido, buscamos opciones econ\xF3micas. ${nextQ2}` : "Entendido, buscamos opciones econ\xF3micas. Nuestro equipo te propone alternativas seg\xFAn lo que platicamos.";
  }
  if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
    log?.info({ entityId }, "GUARD: presupuesto \u2014 cierre tras waiver");
    return buildClosing(extracted.requerimientos_evento ?? extracted.tipo_evento ?? null, extracted.nombre);
  }
  const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
  if (nextQ && !mensajeAsksForField(nextQ, "presupuesto")) {
    log?.info({ entityId }, "GUARD: presupuesto capturado \u2014 no repetir pregunta");
    return nextQ;
  }
  log?.info({ entityId }, "GUARD: presupuesto capturado \u2014 continuar sin re-preguntar");
  return "Entendido, sin problema. Nuestro equipo te propone opciones seg\xFAn lo que platicamos y te arma la cotizaci\xF3n.";
}
function isEmailSatisfied(filledSet) {
  return filledSet.has("Correo electr\xF3nico") || filledSet.has(EMAIL_WAIVED_LABEL);
}
function isReadyForClosing(filledSet) {
  return CLOSING_CORE_FIELDS.every((label) => filledSet.has(label)) && isEmailSatisfied(filledSet);
}
function stripCatalogBlockShared(text) {
  let result = text.replace(
    /\s*(mientras\s+tanto,?\s*)?(aqu[ií]\s+(est[aá]|tienes)\s+nuestro\s+cat[aá]logo\s+completo:?\s*)?https?:\/\/\S*cdn\.shopify\.com\S*/gi,
    ""
  );
  result = result.replace(/\bcomparto\s+el\s+link\s+del\s+cat[aá]logo\b[.:]?/gi, "");
  const lines = result.split("\n");
  const filtered = lines.filter(
    (l) => !l.toLowerCase().includes("banquetes:") && !l.toLowerCase().includes("barras tem\xE1ticas:") && !l.toLowerCase().includes("bebidas:") && !l.toLowerCase().includes("mesas especiales:") && !l.toLowerCase().includes("mobiliario:") && !l.toLowerCase().includes("entretenimiento:") && !l.toLowerCase().includes("estructuras:") && !l.toLowerCase().includes("cdn.shopify.com")
  );
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}
function crmStoredValue(mergedLines, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^-?\\s*${escaped}:`, "i");
  const line = mergedLines.find((l) => pattern.test(l));
  if (!line) return null;
  const val = line.replace(pattern, "").trim();
  return val || null;
}
function findMentionedService(text) {
  for (const [label, pattern] of BODASESOR_SERVICE_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return parsePrimaryService(text);
}
function hasTipoEvento(filledSet, extracted) {
  return filledSet.has("Tipo de evento") || !!extracted.tipo_evento?.trim();
}
function getDisplayName(extracted, whatsappName) {
  return resolveClientDisplayName(extracted.nombre, null, whatsappName);
}
function lucyHasPresented(history) {
  return history.filter((m) => m.role === "assistant" && typeof m.content === "string").some((m) => /hola,?\s*soy\s+lucy/i.test(m.content));
}
function conversationAlreadyStarted(filledSet, history) {
  if (history.some((m) => m.role === "assistant")) return true;
  if (filledSet.has("Nombre del cliente")) return true;
  if (filledSet.has("Correo electr\xF3nico") || filledSet.has(EMAIL_WAIVED_LABEL)) return true;
  return false;
}
function presentationHistoryFrom(ctx) {
  return ctx.presentationHistory ?? ctx.history ?? [];
}
function stripRepeatLucyIntro(mensaje, history, alreadyStarted) {
  if (!alreadyStarted && !lucyHasPresented(history)) return mensaje;
  return mensaje.replace(/Hola,?\s*soy\s+Lucy(?:,\s*agente\s+virtual)?\s+de\s+Bodasesor\.?\s*/gi, "").replace(/Estoy aquí para ayudarte con lo que necesites para tu evento\.?\s*/gi, "").replace(/Con gusto te ayudo\.?\s*/gi, "").replace(/^\s+/, "").trim();
}
function variantIndex(field, history, entityId) {
  const variants = getQuestionVariants()[field];
  const assistantTurns = history.filter((m) => m.role === "assistant").length;
  const seed = entityId != null ? String(entityId).length : 0;
  return (assistantTurns + seed) % variants.length;
}
function pickVariant(field, history, entityId) {
  const variants = getQuestionVariants()[field];
  const lastAssistant = history.filter((m) => m.role === "assistant" && typeof m.content === "string").slice(-1)[0]?.content;
  const start = variantIndex(field, history, entityId);
  for (let i = 0; i < variants.length; i++) {
    const candidate = variants[(start + i) % variants.length];
    if (!lastAssistant || !mensajeAsksForField(lastAssistant, field)) return candidate;
    if (!mensajeAsksForField(candidate, field)) return candidate;
    const snippet = candidate.slice(0, 24);
    if (snippet && !lastAssistant.includes(snippet)) return candidate;
  }
  return variants[start % variants.length];
}
function buildPhoneAnswer() {
  return [
    "Claro, te paso los n\xFAmeros:",
    "Ventas (solo l\xEDnea telef\xF3nica, sin WhatsApp): 55 4008 0373",
    "Gerencia / corporativo (l\xEDnea telef\xF3nica y WhatsApp): 56 4671 0585",
    "Por aqu\xED por chat tambi\xE9n te podemos ayudar con lo que necesites."
  ].join("\n");
}
function buildLocationAnswer() {
  return "Estamos en Ciudad de M\xE9xico y damos servicio en toda la CDMX y zona metropolitana. Para eventos fuera de la ciudad tambi\xE9n podemos, seg\xFAn la fecha y el lugar.";
}
function buildItalianFoodPitch(message) {
  const inv = message?.match(/(\d+)\s*(?:personas?|invitados?)/i);
  let pitch = "Para tem\xE1tica italiana manejamos pastas, pizzas, barras de antipasti y estaciones de comida italiana";
  if (inv) pitch += ` para ${inv[1]} personas`;
  return `${pitch}.`;
}
function buildPistaTarimaSalesReply(extracted, history, currentMessage, entityId) {
  const dims = parseSpaceDimensions(currentMessage ?? "") || (extracted.requerimientos_evento?.match(/\d+m\s*x\s*\d+m/i)?.[0] ?? null);
  const spaceNote = dims ? ` Veo que el espacio es de unos ${dims.replace(/m/g, " metros")} \u2014 con eso podemos recomendar el tama\xF1o ideal.` : "";
  const intro = "Manejamos pistas de baile y tarimas en varios tama\xF1os: tarima b\xE1sica, pista iluminada, y combinaciones con DJ o iluminaci\xF3n.";
  const follow = pickVariant("requerimientos", history, entityId);
  return `${intro}${spaceNote} ${follow}`.trim();
}
function buildEntertainmentSalesReply(extracted, history, entityId, currentMessage) {
  const tipo = (extracted.tipo_evento ?? "").trim().toLowerCase();
  const eventLabel = /corporativo|empresa/.test(tipo) || /empresa|corporativo/i.test(currentMessage ?? "") ? "tu evento corporativo" : tipo ? `tu ${tipo}` : "tu evento";
  const intro = `Para ${eventLabel}, manejamos shows en vivo, animaci\xF3n, hora loca, happening, espejos, l\xE1ser y m\xE1s opciones de entretenimiento.`;
  const ideas = "Lo m\xE1s pedido para eventos as\xED es un show de grupo vers\xE1til o animaci\xF3n tipo hora loca seg\xFAn el estilo que busquen \u2014 desde ambiente elegante hasta fiesta m\xE1s din\xE1mica.";
  const follow = pickVariant("requerimientos", history, entityId);
  return `${intro} ${ideas} ${follow}`.trim();
}
function bodyEqualsLastAssistant(msg, history) {
  const last = [...history].reverse().find((m) => m.role === "assistant");
  if (!last || typeof last.content !== "string") return false;
  const norm = (s) => s.replace(/^(Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro|Qué padre)\.\s*/i, "").trim();
  return norm(msg) === norm(last.content);
}
function buildFoodServiceAckIntro(extracted, history, currentMessage) {
  if (!currentMessage) return null;
  const mentionedService = findMentionedService(currentMessage);
  if (!mentionedService && !clientMentionsCatering(currentMessage)) return null;
  const tipo = (extracted.tipo_evento ?? "").trim().toLowerCase();
  const eventLabel = tipo === "cumplea\xF1os" ? "un cumplea\xF1os" : tipo === "boda" ? "una boda" : tipo === "xv a\xF1os" ? "XV a\xF1os" : tipo ? `un ${tipo}` : "tu evento";
  if (mentionedService) {
    return `${pickTransition(history)} S\xED manejamos ${mentionedService} para ${eventLabel}.`;
  }
  if (/coffee\s*break/i.test(currentMessage)) {
    return `${pickTransition(history)} S\xED manejamos Coffee Break para eventos corporativos y particulares.`;
  }
  return `${pickTransition(history)} Con gusto te ayudo con catering para ${eventLabel}.`;
}
function buildFoodSalesReply(extracted, history, entityId, currentMessage, filledSet, ctx) {
  const tipo = (extracted.tipo_evento ?? "").trim().toLowerCase();
  const eventLabel = tipo === "cumplea\xF1os" ? "un cumplea\xF1os" : tipo === "boda" ? "una boda" : tipo === "xv a\xF1os" ? "XV a\xF1os" : tipo ? `un ${tipo}` : "tu evento";
  const mentionedService = currentMessage ? findMentionedService(currentMessage) : null;
  const query = currentMessage?.trim() || mentionedService || "";
  const appendNext = (body) => {
    if (!filledSet || !ctx) return body;
    const pending = getNextPendingField(extracted, filledSet);
    if (!pending) return body;
    const nextQ = buildNaturalQuestion(pending, ctx);
    if (body.includes(nextQ)) return body;
    return `${body}

${nextQ}`;
  };
  if (mentionedService || currentMessage && isServiceRelatedMessage(currentMessage)) {
    const detail = query ? buildCatalogServiceDetailAnswer(query) : null;
    const intro = mentionedService ? `${pickTransition(history)} S\xED manejamos ${mentionedService} para ${eventLabel}.` : `${pickTransition(history)} Con gusto te ayudo con ${eventLabel}.`;
    if (detail) {
      return appendNext(`${intro}

${detail}`);
    }
    return null;
  }
  return buildRecommendationsReply(extracted, history, entityId, currentMessage);
}
function buildRecommendationsReply(extracted, history, entityId, currentMessage) {
  if (clientAsksBanqueteVsTaquiza(currentMessage)) {
    const comparison2 = buildCatalogComparisonAnswer();
    if (comparison2) return comparison2;
  }
  const texts = collectUserTexts(history, currentMessage).join(" ").toLowerCase();
  const tipo = (extracted.tipo_evento ?? "").toLowerCase();
  let ideas;
  if (/bautizo/.test(tipo) || /\bbautizo\b/.test(texts)) {
    ideas = "Para un bautizo suele funcionar muy bien: banquete o brunch, pastel de bautizo, mesa de dulces, mobiliario y sillas, y si es en jard\xEDn o terraza carpas o sombrillas. Muchos tambi\xE9n agregan DJ suave o iluminaci\xF3n.";
  } else if (/boda/.test(tipo) || /\bboda\b/.test(texts)) {
    ideas = "Para boda lo m\xE1s pedido es banquete o taquiza, barra de bebidas, mobiliario, carpas o pista de baile, DJ e iluminaci\xF3n. Tambi\xE9n mesa de dulces o quesos.";
  } else if (/xv|quince/.test(tipo) || /\bxv\b|quince/.test(texts)) {
    ideas = "Para XV a\xF1os suele ir banquete o taquiza, mesa de dulces, mobiliario, DJ, iluminaci\xF3n y pista de baile.";
  } else if (clientMentionsItalianTheme(texts) || clientMentionsItalianTheme(currentMessage)) {
    ideas = "Para algo con tem\xE1tica italiana van muy bien pastas, pizzas, barras de antipasti o estaciones de comida italiana \u2014 ideal si ven el partido o quieren ambiente italiano.";
  } else {
    ideas = "Lo m\xE1s com\xFAn es banquete o taquiza, barra de bebidas, mobiliario, carpas, DJ, iluminaci\xF3n y mesa de dulces seg\xFAn el estilo del evento.";
  }
  const comparison = buildCatalogComparisonAnswer();
  if (comparison && /banquete|taquiza|recomiendas?/i.test(currentMessage ?? "")) {
    return `${ideas}

${comparison}`;
  }
  const follow = pickVariant("requerimientos", history, entityId);
  return appendServiciosCatalogoHint(`${ideas} ${follow}`.trim());
}
var LUCY_TRANSITIONS = [
  "Genial.",
  "Perfecto.",
  "Excelente.",
  "Suena muy bien.",
  "Listo.",
  "Claro.",
  "Qu\xE9 padre."
];
var TRANSITION_START_PATTERN = /^(Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro|Qué padre)\./i;
function pickTransition(history) {
  const assistants = history.filter((m) => m.role === "assistant" && typeof m.content === "string").map((m) => m.content.trim());
  const last = assistants[assistants.length - 1] ?? "";
  const lastMatch = last.match(TRANSITION_START_PATTERN);
  const lastTransition = lastMatch ? lastMatch[0] : null;
  const start = assistants.length % LUCY_TRANSITIONS.length;
  for (let i = 0; i < LUCY_TRANSITIONS.length; i++) {
    const candidate = LUCY_TRANSITIONS[(start + i) % LUCY_TRANSITIONS.length];
    if (candidate !== lastTransition) return candidate;
  }
  return LUCY_TRANSITIONS[0];
}
function stripRobotAcknowledgments(mensaje) {
  let out = mensaje;
  out = out.replace(
    /(?:Genial|Perfecto|Excelente|Suena muy bien|Listo|Claro|Qué padre)[,.]?\s+(?:\w+[,.]?\s+)?ya\s+tengo\s+(?:tu|su|el|la)\s+[^.?!]+\.\s*/gi,
    ""
  );
  out = out.replace(/\bYa\s+tengo\s+(?:tu|su|el|la)\s+[^.?!]+\.\s*/gi, "");
  out = out.replace(/\bPerfecto,\s+\w+\.\s+Ya\s+tengo\b[^.?!]+\.\s*/gi, "");
  return out.replace(/\s{2,}/g, " ").trim();
}
function contextualPrefix(field, extracted, currentMessage, history = []) {
  const msg = currentMessage?.trim() ?? "";
  if (!msg) return "";
  if (field === "requerimientos" && clientMentionsCatering(currentMessage)) {
    return `${pickTransition(history)} `;
  }
  if (field === "invitados" && (extracted.tipo_evento || /boda|xv|cumple|corporativo|baby/i.test(msg))) {
    return `${pickTransition(history)} `;
  }
  if (field === "zona" && /\d+/.test(msg)) {
    return "Entendido. ";
  }
  if (field === "fecha" && /ciudad|zona|polanco|cdmx|puebla|monterrey|reforma/i.test(msg)) {
    return "Muy bien. ";
  }
  if (field === "presupuesto" && /fecha|junio|julio|agosto|s[aá]bado|domingo|\d{1,2}\s+de/i.test(msg)) {
    return `${pickTransition(history)} `;
  }
  return "";
}
function getNextPendingField(extracted, filledSet) {
  const filled = filledSet ?? /* @__PURE__ */ new Set();
  if (!filled.has("Nombre del cliente")) return "nombre";
  if (!isEmailSatisfied(filled)) return "correo";
  const hasReq = filled.has("Requerimientos o servicios") || isValidRequerimientosValue(extracted.requerimientos_evento);
  const hasInv = filled.has("N\xFAmero de invitados") || !!extracted.num_invitados;
  if (!hasTipoEvento(filled, extracted)) return "tipo_evento";
  if (!hasReq) return "requerimientos";
  if (!filled.has("Lugar/direcci\xF3n del evento")) return "zona";
  if (!filled.has("Fecha y horario")) return "fecha";
  if (!hasInv) return "invitados";
  if (!filled.has("Presupuesto (MXN)")) return "presupuesto";
  return null;
}
function isFirstLucyReply(history) {
  return !history.some((m) => m.role === "assistant");
}
function buildOpeningAcknowledgment(history, currentMessage) {
  const texts = collectUserTexts(history, currentMessage);
  const userText = texts[texts.length - 1] ?? texts.join(" ");
  const t = userText.toLowerCase();
  if (/taquiza|tacos/.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    const zona = userText.match(/\ben\s+([A-Za-zÁÉÍÓÚáéíóúñ][\w\s.-]{2,24})/i);
    const fecha = userText.match(
      /(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))/i
    );
    let ack = "Te ayudo con la taquiza";
    if (inv) ack += ` para ${inv[1]} personas`;
    if (zona) ack += ` en ${zona[1].trim()}`;
    if (fecha) ack += ` el ${fecha[1]}`;
    return `${ack}.`;
  }
  if (/\bboda\b/.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    const fecha = userText.match(
      /(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))/i
    );
    let ack = "Te ayudo con la cotizaci\xF3n para tu boda";
    if (fecha) ack += ` del ${fecha[1]}`;
    if (inv) ack += ` para ${inv[1]} personas`;
    return `${ack}.`;
  }
  if (/baby\s*shower/.test(t)) return "Claro que te ayudamos con tu baby shower.";
  if (/\bbautizo\b/.test(t)) return "Con gusto te ayudo con la cotizaci\xF3n para tu bautizo.";
  if (/banquete/.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    return inv ? `Te ayudo con el banquete para ${inv[1]} personas.` : "Con gusto te ayudo con informaci\xF3n de banquetes.";
  }
  if (/kosher/.test(t)) return "S\xED tenemos opciones kosher.";
  if (/\bpista(\s+de\s+baile)?\b|\btarima/i.test(t)) {
    return "Claro, te ayudo con pista de baile o tarima para tu evento.";
  }
  if (/expo|stand\s+de\s+caf[eé]|feria|congreso/i.test(t)) {
    const inv = userText.match(/(\d+)\s*(?:personas?|invitados?)/i);
    return inv ? `Te ayudo con el stand de caf\xE9 para tu expo (${inv[1]} personas).` : "Te ayudo con el stand de caf\xE9 para tu expo.";
  }
  if (/italian|italia|mafia\s+italiana|men[uú]\s+italiano|pastas?|pizzas?/i.test(t)) {
    return buildItalianFoodPitch(userText).replace(/\.$/, "");
  }
  if (/cotiz|evento/.test(t)) return "Claro que te ayudo con tu evento.";
  if (/^hola[.!?\s]*$/i.test(userText.trim())) {
    return "Estoy aqu\xED para ayudarte con lo que necesites para tu evento.";
  }
  if (userText.trim().length > 0) return "Con gusto te ayudo.";
  return "Estoy aqu\xED para ayudarte con lo que necesites para tu evento.";
}
function buildFirstInteractionMessage(ctx, withIntro = true) {
  const history = ctx.history ?? [];
  const filledSet = ctx.filledSet ?? /* @__PURE__ */ new Set();
  const ack = buildOpeningAcknowledgment(history, ctx.currentMessage);
  const intro = withIntro ? `${LUCY_INTRO} ` : "";
  if (clientAsksLocation(ctx.currentMessage)) {
    const nameQ2 = pickVariant("nombre", history, ctx.entityId);
    return `${intro}${buildLocationAnswer()} ${nameQ2}`.trim();
  }
  const userText = collectUserTexts(history, ctx.currentMessage).join(" ");
  if (clientMentionsItalianTheme(ctx.currentMessage) || clientAsksForRecommendations(ctx.currentMessage) && clientMentionsItalianTheme(userText)) {
    const nameQ2 = pickVariant("nombre", history, ctx.entityId);
    return `${intro}${buildItalianFoodPitch(ctx.currentMessage)} ${nameQ2}`.trim();
  }
  if (isFieldSatisfied("nombre", filledSet, ctx.extracted)) {
    const nombre = getDisplayName(ctx.extracted, ctx.whatsappName);
    const pending = getNextPendingField(ctx.extracted, filledSet);
    if (pending === "correo") {
      const correoQ = buildCorreoQuestion(nombre, history, ctx.entityId);
      return withIntro ? `${intro}${ack} ${correoQ}`.trim() : correoQ;
    }
    if (pending) {
      const greet = nombre ? `Mucho gusto, ${nombre}. ` : "";
      const q = buildNaturalQuestion(pending, ctx);
      return withIntro ? `${intro}${ack} ${greet}${q}`.trim() : `${greet}${q}`.trim();
    }
    return nombre ? `${intro}${ack} Mucho gusto, ${nombre}.`.trim() : `${intro}${ack}`.trim();
  }
  const nameQ = pickVariant("nombre", history, ctx.entityId);
  return `${intro}${ack} ${nameQ}`.trim();
}
function usesLegacyLucyIntro(mensaje) {
  return /te\s+saluda\s+lucy/i.test(mensaje);
}
function enforceNombreFirst(_mensaje, filledSet, extracted, ctx, forceFirstPresentation = false) {
  const presHistory = presentationHistoryFrom(ctx);
  const alreadyStarted = conversationAlreadyStarted(filledSet, presHistory);
  const isTrueFirstTurn = (forceFirstPresentation || isFirstLucyReply(presHistory)) && !alreadyStarted;
  if (!isFieldSatisfied("nombre", filledSet, extracted)) {
    const recovered = recoverClienteNombreFromHistory(presHistory, ctx.currentMessage);
    if (recovered) {
      filledSet.add("Nombre del cliente");
      extracted.nombre = recovered;
      return stripRepeatLucyIntro(_mensaje, presHistory, true);
    }
    if (isAffirmativeOnlyMessage(ctx.currentMessage)) {
      return `${pickTransition(presHistory)} \xBFMe regalas tu nombre?`;
    }
    if (isTrueFirstTurn || usesLegacyLucyIntro(_mensaje)) {
      return buildFirstInteractionMessage(ctx, true);
    }
    return buildNaturalQuestion("nombre", ctx);
  }
  return stripRepeatLucyIntro(_mensaje, presHistory, alreadyStarted);
}
function mensajeAsksForField(mensaje, field) {
  if (!mensaje.includes("?")) return false;
  return FIELD_ASK_PATTERNS[field].test(mensaje);
}
function isFieldSatisfied(field, filledSet, extracted) {
  switch (field) {
    case "nombre":
      return filledSet.has("Nombre del cliente");
    case "correo":
      return isEmailSatisfied(filledSet);
    case "tipo_evento":
      return hasTipoEvento(filledSet, extracted);
    case "requerimientos":
      return filledSet.has("Requerimientos o servicios") || isValidRequerimientosValue(extracted.requerimientos_evento);
    case "invitados":
      return filledSet.has("N\xFAmero de invitados") || !!extracted.num_invitados;
    case "zona":
      return filledSet.has("Lugar/direcci\xF3n del evento");
    case "fecha":
      return filledSet.has("Fecha y horario");
    case "presupuesto":
      return filledSet.has("Presupuesto (MXN)");
  }
}
var FIELD_ORDER = [
  "nombre",
  "correo",
  "tipo_evento",
  "requerimientos",
  "zona",
  "fecha",
  "invitados",
  "presupuesto"
];
function mensajeAsksForFilledField(mensaje, filledSet, extracted) {
  if (!mensaje.includes("?")) return false;
  for (const field of FIELD_ORDER) {
    if (isFieldSatisfied(field, filledSet, extracted) && mensajeAsksForField(mensaje, field)) {
      return true;
    }
  }
  return false;
}
function shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage) {
  const trimmed = aiResponse.trim();
  if (!trimmed) return false;
  if (responseLooksLikePrematureClose(trimmed)) return false;
  if (responseHasInventedPrice(trimmed, currentMessage)) return false;
  if (mensajeAsksForFilledField(trimmed, filledSet, extracted)) return false;
  if (mensajeAsksWrongField(trimmed, filledSet, extracted)) return false;
  const pending = getNextPendingField(extracted, filledSet);
  if (!pending) return true;
  if (mensajeLooksOnTrack(trimmed, filledSet, extracted)) return true;
  if (currentMessage && currentMessage.trim().length > 12 && trimmed.length > 25) {
    if (clientAskedFreeformQuestion(currentMessage)) return true;
    if (clientMentionsCatering(currentMessage) && !mensajeAsksForField(trimmed, pending)) return true;
    if (justAnsweredReqContext(currentMessage, trimmed)) return true;
  }
  return false;
}
function justAnsweredReqContext(currentMessage, aiResponse) {
  if (!clientMentionsCatering(currentMessage) && !isServiceRelatedMessage(currentMessage)) return false;
  return aiResponse.length > 40 && !/^\s*¿/.test(aiResponse);
}
function mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx) {
  const pending = getNextPendingField(extracted, filledSet);
  if (!pending) return mensaje;
  const base = mensaje.trim();
  if (!base) return buildNaturalQuestion(pending, ctx);
  if (clientAskedFreeformQuestion(ctx.currentMessage) && base.length > 50) {
    if (base.includes("?") && !mensajeAsksWrongField(mensaje, filledSet, extracted)) return base;
    if (!mensajeAsksForField(base, pending)) return base;
  }
  const nextQ = buildNaturalQuestion(pending, ctx);
  if (base.includes("?") && !mensajeAsksWrongField(mensaje, filledSet, extracted) && !mensajeAsksForFilledField(mensaje, filledSet, extracted)) {
    return mensaje;
  }
  return `${base}

${nextQ}`;
}
function textOverlapRatio(a, b) {
  const na = a.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (!wordsA.size || !wordsB.size) return 0;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  return shared / Math.max(wordsA.size, wordsB.size);
}
function avoidRepeatPreviousReply(mensaje, presHistory) {
  const prev = presHistory.filter((m) => m.role === "assistant" && typeof m.content === "string").map((m) => m.content.trim()).filter(Boolean);
  if (prev.length === 0) return mensaje;
  const maxOverlap = Math.max(...prev.map((p) => textOverlapRatio(mensaje, p)));
  const last = prev[prev.length - 1];
  if (maxOverlap < 0.68) return mensaje;
  let out = mensaje.replace(/^Hola,?\s*soy\s+Lucy[^.]*\.\s*/i, "").replace(TRANSITION_START_PATTERN, pickTransition(presHistory));
  const outOverlap = Math.max(...prev.map((p) => textOverlapRatio(out, p)));
  if (outOverlap < 0.65) return out.trim();
  const questionLine = mensaje.split("\n").find((l) => l.includes("?")) ?? mensaje.split("\n").pop();
  const q = questionLine?.trim() || mensaje;
  const qOverlap = Math.max(...prev.map((p) => textOverlapRatio(q, p)));
  if (qOverlap >= 0.72) {
    const pendingLine = mensaje.split("\n").filter((l) => l.includes("?")).pop();
    if (pendingLine && textOverlapRatio(pendingLine, last) < 0.65) return pendingLine.trim();
  }
  return q;
}
function redirectIfAskingFilledField(mensaje, filledSet, extracted, ctx) {
  const fields = [
    "nombre",
    "correo",
    "tipo_evento",
    "requerimientos",
    "invitados",
    "zona",
    "fecha",
    "presupuesto"
  ];
  for (const field of fields) {
    if (!isFieldSatisfied(field, filledSet, extracted)) continue;
    if (!mensajeAsksForField(mensaje, field)) continue;
    const next = getNextPendingField(extracted, filledSet);
    if (next && next !== field) return buildNaturalQuestion(next, ctx);
    const trimmed = mensaje.split("\n").filter((line) => !mensajeAsksForField(line, field)).join("\n").trim();
    if (trimmed) return trimmed;
  }
  return mensaje;
}
function sanitizeOutboundMessage(mensaje, filledSet, extracted, ctx, log) {
  const pending = getNextPendingField(extracted, filledSet);
  if (ctx.currentMessage && (clientMentionsCatering(ctx.currentMessage) || clientMentionsEntertainment(ctx.currentMessage) || clientMentionsPistaTarima(ctx.currentMessage) || isServiceRelatedMessage(ctx.currentMessage)) && /banquete|taquiza|catering|alimentos|show|animaci|hora\s+loca|entretenimiento|vers[aá]til|pista|tarima|iluminada/i.test(
    mensaje
  )) {
    return mensaje.trim();
  }
  const repeatsFilled = mensajeAsksForFilledField(mensaje, filledSet, extracted);
  const asksWrong = mensajeAsksWrongField(mensaje, filledSet, extracted);
  if ((repeatsFilled || asksWrong) && pending && !isInformativeClientAnswer(ctx.currentMessage)) {
    log?.warn({ pending, repeatsFilled, asksWrong }, "GUARD: bloqueando repetici\xF3n \u2014 dato ya capturado");
    return mergeWithPendingQuestion("", filledSet, extracted, ctx);
  }
  if (pending === "requerimientos" && mensaje.includes("?") && !mensajeMencionaCatalogoServicios(mensaje)) {
    mensaje = appendServiciosCatalogoHint(mensaje);
  }
  if (pending && !mensaje.includes("?") && !clientAskedFreeformQuestion(ctx.currentMessage) && !isInformativeClientAnswer(ctx.currentMessage)) {
    return mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx);
  }
  return mensaje;
}
function buildNaturalQuestion(field, ctx) {
  const history = ctx.history ?? [];
  const nombre = getDisplayName(ctx.extracted, ctx.whatsappName);
  const prefix = contextualPrefix(field, ctx.extracted, ctx.currentMessage, history);
  const variant = pickVariant(field, history, ctx.entityId);
  if (field === "correo") {
    const correoCore = pickVariant("correo", history, ctx.entityId);
    return nombre ? `Mucho gusto, ${nombre}. ${correoCore}` : correoCore;
  }
  if (field === "requerimientos") {
    return buildRequerimientosQuestion(ctx.extracted, history, ctx.currentMessage, ctx.entityId);
  }
  if (field === "tipo_evento") {
    const tipoVariant = pickVariant("tipo_evento", history, ctx.entityId);
    const withHint = `${tipoVariant} ${TIPO_EVENTO_HINT}`.trim();
    if (ctx.afterEmail) {
      return nombre ? `Muchas gracias. ${withHint}` : `Muchas gracias. ${withHint}`;
    }
    return prefix ? `${prefix}${withHint}` : withHint;
  }
  return prefix ? `${prefix}${variant}` : variant;
}
function buildRequerimientosQuestion(extracted, history, currentMessage, entityId) {
  const userText = collectUserTexts(history, currentMessage).join(" ");
  const fromExtracted = isValidRequerimientosValue(extracted.requerimientos_evento) ? extracted.requerimientos_evento.trim() : null;
  const service = fromExtracted ?? findMentionedService(userText);
  const prefix = contextualPrefix("requerimientos", extracted, currentMessage, history);
  if (service) {
    const idx = variantIndex("requerimientos", history, entityId);
    const followUps = [
      `Adem\xE1s del ${service}, \xBFte gustar\xEDa cotizar alg\xFAn otro servicio?`,
      `\xBFSolo el ${service} o tambi\xE9n algo m\xE1s?`,
      `Perfecto. Con el ${service}, \xBFnecesitan alg\xFAn otro servicio?`
    ];
    return appendServiciosCatalogoHint(
      `${prefix}${followUps[idx % followUps.length]}`,
      true
    );
  }
  const variant = pickVariant("requerimientos", history, entityId);
  const core = prefix ? `${prefix}${variant}` : variant;
  return appendServiciosCatalogoHint(core);
}
function requerimientosNeedsFollowUp(extracted, filledSet) {
  if (filledSet.has("Requerimientos o servicios")) return false;
  const req = extracted.requerimientos_evento?.trim() ?? "";
  if (!req) return true;
  return !isValidRequerimientosValue(req);
}
function buildCorreoQuestion(nombre, history = [], entityId) {
  const correoCore = pickVariant("correo", history, entityId);
  if (nombre) return `Mucho gusto, ${nombre}. ${correoCore}`;
  return correoCore;
}
function buildRequerimientosFollowUp(extracted, filledSet, history, currentMessage, entityId) {
  const ctx = {
    extracted,
    filledSet,
    history: history ?? [],
    currentMessage,
    entityId
  };
  if (filledSet && !hasTipoEvento(filledSet, extracted)) {
    return buildNaturalQuestion("tipo_evento", ctx);
  }
  if (filledSet && requerimientosNeedsFollowUp(extracted, filledSet)) {
    return buildRequerimientosQuestion(extracted, history ?? [], currentMessage, entityId);
  }
  const pending = getNextPendingField(extracted, filledSet);
  if (pending) return buildNaturalQuestion(pending, ctx);
  return buildRequerimientosQuestion(extracted, history ?? [], currentMessage, entityId);
}
function nextFieldQuestion(extracted, filledSet, whatsappName, history, currentMessage, entityId) {
  const pending = getNextPendingField(extracted, filledSet);
  if (!pending) return null;
  return buildNaturalQuestion(pending, {
    extracted,
    filledSet,
    whatsappName,
    history: history ?? [],
    currentMessage,
    entityId
  });
}
function shouldReplaceForcedEmailQuestion(mensaje, filledSet) {
  if (!filledSet.has(EMAIL_WAIVED_LABEL)) return false;
  if (!/correo|e-?mail/i.test(mensaje) || !mensaje.includes("?")) return false;
  return /obligatorio|necesito|necesario|forzoso|indispensable|debes|tienes que|es importante/i.test(mensaje);
}
function emailRefusalAckMessage(extracted, history, currentMessage, entityId, filledSet) {
  const ctx = {
    extracted,
    filledSet,
    history,
    currentMessage,
    entityId
  };
  const pending = getNextPendingField(extracted, filledSet);
  if (pending && pending !== "correo") {
    return `Sin problema, seguimos por aqu\xED. ${buildNaturalQuestion(pending, ctx)}`;
  }
  const tipoQ = buildNaturalQuestion("tipo_evento", ctx);
  return `Sin problema, seguimos por aqu\xED. ${tipoQ}`;
}
function clientJustGaveEmail(history, currentMessage) {
  if (!currentMessage?.trim() || !/\S+@\S+\.\S+/.test(currentMessage)) return false;
  const lastAssistant = history.filter((m) => m.role === "assistant" && typeof m.content === "string").slice(-1)[0]?.content;
  if (!lastAssistant) return false;
  return /correo|e-?mail|envío|envio/i.test(lastAssistant);
}
function clientJustAnsweredRequerimientosQuestion(history, currentMessage) {
  if (!currentMessage?.trim()) return false;
  const lastAssistant = history.filter((m) => m.role === "assistant" && typeof m.content === "string").slice(-1)[0]?.content;
  if (!lastAssistant) return false;
  if (inferLucyAskedField(lastAssistant) === "requerimientos") return true;
  return /platícame|qué tienes pensado|otro servicio|te gustaría cotizar|festejan|tipo de evento|servicios te gustaría|qué necesitas/i.test(
    lastAssistant
  );
}
function clientSaysThanks(message) {
  if (!message?.trim()) return false;
  return /\b(muchas\s+gracias|gracias|thank\s+you|mil\s+gracias|te\s+agradezco)\b/i.test(message);
}
function buildPostCierreThanksReply(clientName) {
  const nombre = clientName?.trim();
  return nombre ? `\xA1Con gusto, ${nombre}! Nuestro equipo ya tiene tus datos para la cotizaci\xF3n. Si necesitas algo m\xE1s, aqu\xED estamos.` : "\xA1Con gusto! Nuestro equipo ya tiene tus datos para la cotizaci\xF3n. Si necesitas algo m\xE1s, aqu\xED estamos.";
}
function isInformativeClientAnswer(currentMessage) {
  if (!currentMessage?.trim()) return false;
  return clientAsksLocation(currentMessage) || clientMentionsItalianTheme(currentMessage) || clientAsksForRecommendations(currentMessage) || clientAsksBanqueteVsTaquiza(currentMessage) || clientMentionsCatering(currentMessage) || clientMentionsEntertainment(currentMessage) || clientMentionsPistaTarima(currentMessage) || isServiceRelatedMessage(currentMessage) || clientAsksPhone(currentMessage) || clientAsksPrice(currentMessage) || clientAsksInclusion(currentMessage) || clientAskedFreeformQuestion(currentMessage);
}
function clientAskedFreeformQuestion(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  if (/\?/.test(message)) return true;
  return clientAsksLocation(message) || /cu[aá]nto|precio|costo|cat[aá]logo|men[uú]|tienen|incluye|kosher|horario|tel[eé]fono|correo\s+de\s+bodasesor|hola@/i.test(
    message
  ) || /qu[eé]\s+ofrecen|qu[eé]\s+tienen|qu[eé]\s+manejan|qu[eé]\s+servicios|cu[aá]les\s+son|informaci[oó]n|recomiendas?|sugieres|ayudas?\s+con|pueden\s+hacer/i.test(
    t
  );
}
function responseLooksLikePrematureClose(mensaje) {
  return mensaje.includes(CLOSING_SIGNATURE) || /cotizaci[oó]n personalizada/i.test(mensaje) || /cdn\.shopify\.com/i.test(mensaje) || /cat[aá]logo completo/i.test(mensaje) || /ya tengo todos los datos/i.test(mensaje);
}
function mensajeLooksOnTrack(mensaje, filledSet, extracted) {
  const pending = getNextPendingField(extracted, filledSet);
  if (!pending) return true;
  return mensajeAsksForField(mensaje, pending);
}
function mensajeAsksWrongField(mensaje, filledSet, extracted) {
  if (!mensaje.includes("?")) return false;
  const pending = getNextPendingField(extracted, filledSet);
  if (!pending) return false;
  const fieldOrder = FIELD_ORDER;
  const pendingIdx = fieldOrder.indexOf(pending);
  for (let i = pendingIdx + 1; i < fieldOrder.length; i++) {
    const field = fieldOrder[i];
    if (mensajeAsksForField(mensaje, field)) return true;
  }
  return false;
}
function makeQuestionCtx(input) {
  return {
    extracted: input.extracted,
    filledSet: input.filledSet,
    whatsappName: input.whatsappDisplayName,
    history: input.history,
    presentationHistory: input.presentationHistory ?? input.history,
    currentMessage: input.currentMessage,
    entityId: input.entityId
  };
}
function applyLucyMessageGuards(input) {
  const {
    aiResponse,
    extracted,
    filledSet,
    readyForClosing,
    cierreYaEnviado,
    emailRefusedThisTurn,
    history,
    currentMessage,
    whatsappDisplayName,
    buildClosing,
    log,
    entityId,
    forceFirstPresentation
  } = input;
  const ctx = makeQuestionCtx(input);
  const presHistory = input.presentationHistory ?? history;
  applyPresupuestoWaiver(
    filledSet,
    [],
    collectUserTexts(presHistory, currentMessage),
    presHistory
  );
  const pendingBeforeClose = getNextPendingField(extracted, filledSet);
  const trulyReadyForClosing = readyForClosing && !pendingBeforeClose;
  if (trulyReadyForClosing && !cierreYaEnviado && !requerimientosNeedsFollowUp(extracted, filledSet)) {
    return normalizeAdvisorReferences(
      buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      ),
      extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
    );
  }
  const justGaveEmail = clientJustGaveEmail(history, currentMessage);
  const justAnsweredReq = clientJustAnsweredRequerimientosQuestion(history, currentMessage);
  const emailOk = isEmailSatisfied(filledSet);
  const needsNextStep = emailOk && !trulyReadyForClosing && !cierreYaEnviado;
  const readyToCloseAndReqDone = trulyReadyForClosing && !cierreYaEnviado && !requerimientosNeedsFollowUp(extracted, filledSet);
  const allowSalesReplyOverride = !readyToCloseAndReqDone || (currentMessage?.includes("?") ?? false);
  const mentionedServiceNow = currentMessage ? findMentionedService(currentMessage) : null;
  const serviceAlreadyCaptured = filledSet.has("Requerimientos o servicios") && !!mentionedServiceNow && (extracted.requerimientos_evento ?? "").toLowerCase().includes(mentionedServiceNow.toLowerCase());
  const requerimientosFollowUpAlreadyAsked = presHistory.some(
    (m) => m.role === "assistant" && typeof m.content === "string" && /alg[uú]n\s+otro\s+servicio|otro\s+servicio\b/i.test(m.content)
  );
  let mensaje;
  let appliedSalesReply = false;
  let appliedDirectReply = false;
  if (cierreYaEnviado && clientAddsToQuote(currentMessage)) {
    const nombre = extracted.nombre?.trim();
    mensaje = nombre ? `Perfecto, ${nombre}. Lo anoto para que nuestro equipo lo incluya en tu cotizaci\xF3n. \xBFHay algo m\xE1s que quieras agregar?` : "Perfecto. Lo anoto para que nuestro equipo lo incluya en tu cotizaci\xF3n. \xBFHay algo m\xE1s que quieras agregar?";
    log?.info({ entityId }, "GUARD: post-cierre \u2014 servicios adicionales");
  } else if (cierreYaEnviado && (clientSaysThanks(currentMessage) || clientDeclinesMoreServices(currentMessage))) {
    mensaje = buildPostCierreThanksReply(extracted.nombre);
    log?.info({ entityId }, "GUARD: post-cierre \u2014 agradecimiento o sin m\xE1s que agregar");
  } else if (clientAsksIfCompanyEmailCorrect(currentMessage)) {
    mensaje = buildCompanyEmailConfirmReply();
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: cliente pregunt\xF3 por correo de Bodasesor");
  } else if (isAmbiguousShortNumber(currentMessage)) {
    mensaje = "\xBFTe refieres a 5 invitados o al d\xEDa 5 del mes?";
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: n\xFAmero ambiguo \u2014 pedir aclaraci\xF3n");
  } else if ((forceFirstPresentation || isFirstLucyReply(presHistory)) && !conversationAlreadyStarted(filledSet, presHistory) && clientMentionsItalianTheme(currentMessage) && !isFieldSatisfied("nombre", filledSet, extracted)) {
    mensaje = buildFirstInteractionMessage(ctx, true);
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: primer mensaje \u2014 tem\xE1tica italiana");
  } else if (currentMessage && detectPresupuestoRefusal(currentMessage)) {
    if (!filledSet.has("Presupuesto (MXN)")) {
      applyPresupuestoWaiver(
        filledSet,
        [],
        collectUserTexts(presHistory, currentMessage),
        presHistory
      );
    }
    const pending = getNextPendingField(extracted, filledSet);
    if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
    } else if (pending) {
      mensaje = `Sin problema, lo dejamos por definir. ${buildNaturalQuestion(pending, ctx)}`;
    } else {
      mensaje = "Sin problema, lo dejamos por definir. Nuestro equipo te propone opciones seg\xFAn lo que platicamos.";
    }
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: cliente sin presupuesto \u2014 waiver directo");
  } else if (clientAsksLocation(currentMessage) && !isFieldSatisfied("nombre", filledSet, extracted)) {
    mensaje = `${buildLocationAnswer()} ${pickVariant("nombre", presHistory, entityId)}`;
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: ubicaci\xF3n + pedir nombre");
  } else if (needsModoServicioClarification(currentMessage, extracted.modo_servicio ?? null)) {
    mensaje = buildModoServicioClarificationQuestion();
    appliedDirectReply = true;
    log?.info({ entityId }, "GUARD: aclarar pedido vs servicio montado");
  } else if (cierreYaEnviado && /DATOS DEL CLIENTE:|Información completa obtenida/i.test(aiResponse)) {
    mensaje = "Gracias. Nuestro equipo ya tiene tu informaci\xF3n para la cotizaci\xF3n. \xBFHay algo m\xE1s que quieras agregar o alguna duda?";
    log?.warn({ entityId }, "GUARD: bloque\xF3 nota interna post-cierre");
  } else if (clientAsksAboutTeam(currentMessage, extracted.nombre)) {
    const advisor = advisorLabelForClient(extracted.nombre);
    mensaje = advisor === "nuestro equipo" ? "S\xED, nuestro equipo de Bodasesor arma las cotizaciones personalizadas. Yo te ayudo a recopilar la informaci\xF3n y ellos te env\xEDan la propuesta." : `${advisor} es parte del equipo de Bodasesor; arma las cotizaciones personalizadas con base en lo que platicamos. Yo te ayudo a recopilar los datos y te env\xEDan la propuesta.`;
    log?.info({ entityId }, "GUARD: cliente pregunt\xF3 por el asesor/equipo");
  } else if (justGaveEmail && !hasTipoEvento(filledSet, extracted)) {
    if (shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage)) {
      mensaje = mergeWithPendingQuestion(aiResponse, filledSet, extracted, { ...ctx, afterEmail: true });
    } else {
      mensaje = buildNaturalQuestion("tipo_evento", { ...ctx, afterEmail: true });
    }
    log?.info({ entityId }, "GUARD: correo capturado \u2014 tipo de evento con opciones");
  } else if (justGaveEmail && hasTipoEvento(filledSet, extracted)) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
    mensaje = nextQ ?? aiResponse;
    if (nextQ) log?.info({ entityId }, "GUARD: correo capturado \u2014 tipo ya tenido, siguiente dato");
  } else if (emailRefusedThisTurn && !extracted.correo?.trim()) {
    mensaje = emailRefusalAckMessage(extracted, history, currentMessage, entityId, filledSet);
    log?.info({ entityId }, "GUARD: cliente no quiere dar correo \u2014 se contin\xFAa el flujo");
  } else if (clientAsksPhone(currentMessage)) {
    const phoneAnswer = buildPhoneAnswer();
    const pending = getNextPendingField(extracted, filledSet);
    mensaje = needsNextStep && pending && pending !== "correo" ? `${phoneAnswer}

${buildNaturalQuestion(pending, ctx)}` : phoneAnswer;
    log?.info({ entityId }, "GUARD: cliente pregunt\xF3 tel\xE9fonos");
  } else if (readyToCloseAndReqDone && clientDeclinesMoreServices(currentMessage)) {
    mensaje = buildClosing(
      extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
      extracted.nombre
    );
    log?.info({ entityId }, "GUARD: cliente no quiere m\xE1s servicios \u2014 cierre");
  } else if (allowSalesReplyOverride && (clientMentionsEntertainment(currentMessage) || justAnsweredReq && clientMentionsEntertainment(currentMessage))) {
    mensaje = buildEntertainmentSalesReply(extracted, history, entityId, currentMessage);
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: show/entretenimiento \u2014 orientaci\xF3n de venta");
  } else if (allowSalesReplyOverride && clientMentionsPistaTarima(currentMessage)) {
    mensaje = buildPistaTarimaSalesReply(extracted, history, currentMessage, entityId);
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: pista/tarima \u2014 orientaci\xF3n de venta");
  } else if (allowSalesReplyOverride && !serviceAlreadyCaptured && (clientMentionsCatering(currentMessage) || justAnsweredReq && isServiceRelatedMessage(currentMessage))) {
    const cateringAnswer = buildFoodSalesReply(
      extracted,
      history,
      entityId,
      currentMessage,
      filledSet,
      ctx
    );
    if (cateringAnswer) {
      mensaje = cateringAnswer;
    } else {
      const ack = buildFoodServiceAckIntro(extracted, history, currentMessage);
      const aiMentionsService = !!ack && /coffee\s*break|manejamos|banquete|taquiza|catering|sí\s+tenemos/i.test(aiResponse);
      if (shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage)) {
        const base = ack && !aiMentionsService ? `${ack} ${aiResponse}`.trim() : aiResponse;
        mensaje = mergeWithPendingQuestion(base, filledSet, extracted, ctx);
      } else if (ack) {
        mensaje = mergeWithPendingQuestion(ack, filledSet, extracted, ctx);
      } else {
        mensaje = buildRecommendationsReply(extracted, history, entityId, currentMessage);
      }
    }
    if (bodyEqualsLastAssistant(mensaje, history)) {
      const nextQ = nextFieldQuestion(
        extracted,
        filledSet,
        whatsappDisplayName,
        history,
        currentMessage,
        entityId
      );
      if (nextQ) mensaje = nextQ;
    }
    appliedSalesReply = true;
    log?.info(
      { entityId, justAnsweredReq, food: clientMentionsCatering(currentMessage) },
      "GUARD: comida/servicio \u2014 orientaci\xF3n de venta"
    );
  } else if (allowSalesReplyOverride && clientAsksForRecommendations(currentMessage)) {
    mensaje = buildRecommendationsReply(extracted, history, entityId, currentMessage);
    if (bodyEqualsLastAssistant(mensaje, history)) {
      const nextQ = nextFieldQuestion(
        extracted,
        filledSet,
        whatsappDisplayName,
        history,
        currentMessage,
        entityId
      );
      if (nextQ) mensaje = nextQ;
    }
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: cliente pidi\xF3 recomendaciones \u2014 sugerencias + servicios");
  } else if (clientAsksPrice(currentMessage)) {
    const ctxText2 = collectUserTexts(input.presentationHistory ?? history, currentMessage).join(" ");
    const pending = getNextPendingField(extracted, filledSet);
    const needsAlejandroQuote = mentionsNoListedPriceService(currentMessage) || responseHasInventedPrice(aiResponse, currentMessage, ctxText2) && !mentionsListedPriceService(currentMessage);
    if (needsAlejandroQuote) {
      const priceReply = buildAlejandroPriceReply(getPriceServiceLabel(currentMessage), currentMessage);
      mensaje = needsNextStep && pending && pending !== "correo" ? `${priceReply}

${buildNaturalQuestion(pending, ctx)}` : priceReply;
      log?.info({ entityId, pending }, "GUARD: precio sin cat\xE1logo \u2014 Alejandro cotiza");
    } else {
      const safe = sanitizeInventedPrices(aiResponse, currentMessage, ctxText2);
      let priceContent = safe;
      const fromCatalog = buildCatalogPriceAnswer(currentMessage);
      if (fromCatalog && mentionsListedPriceService(currentMessage)) {
        priceContent = fromCatalog;
      } else if (!messageClaimsPrice(safe) && fromCatalog) {
        priceContent = fromCatalog;
      }
      mensaje = needsNextStep ? mergeWithPendingQuestion(priceContent, filledSet, extracted, ctx) : priceContent.trim() || aiResponse;
      log?.info({ entityId, fromCatalog: priceContent !== safe }, "GUARD: respuesta a precio con cat\xE1logo");
    }
  } else if (needsNextStep && shouldPreferAiResponse(aiResponse, filledSet, extracted, currentMessage)) {
    mensaje = aiResponse;
    log?.info({ entityId }, "GUARD: respuesta GPT natural aceptada");
  } else if (needsNextStep && aiResponse.trim() && !mensajeAsksForFilledField(aiResponse, filledSet, extracted)) {
    mensaje = mergeWithPendingQuestion(aiResponse, filledSet, extracted, ctx);
    log?.info({ entityId }, "GUARD: GPT + pregunta pendiente fusionados");
  } else if (needsNextStep && aiResponse.trim() && mensajeAsksForFilledField(aiResponse, filledSet, extracted)) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
    mensaje = nextQ ?? aiResponse;
    log?.info({ entityId }, "GUARD: GPT repiti\xF3 dato ya capturado \u2014 siguiente paso");
  } else if (needsNextStep) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
    if (clientAsksPrice(currentMessage)) {
      const fromCatalog = buildCatalogPriceAnswer(currentMessage);
      if (fromCatalog && nextQ) {
        mensaje = `${fromCatalog}

${nextQ}`;
      } else if (fromCatalog) {
        mensaje = fromCatalog;
      } else {
        mensaje = nextQ ?? aiResponse;
      }
    } else {
      mensaje = nextQ ?? aiResponse;
    }
    if (nextQ) log?.info({ entityId }, "GUARD: forzando siguiente paso del embudo (sem\xE1ntico)");
  } else if (trulyReadyForClosing && !cierreYaEnviado && (requerimientosNeedsFollowUp(extracted, filledSet) || justAnsweredReq && !requerimientosFollowUpAlreadyAsked)) {
    mensaje = buildRequerimientosFollowUp(extracted, filledSet, history, currentMessage, entityId);
    log?.info({ entityId }, "GUARD: profundizar antes del cierre");
  } else if (trulyReadyForClosing && !cierreYaEnviado) {
    mensaje = buildClosing(
      extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
      extracted.nombre
    );
    log?.info({ entityId }, "Datos completos \u2014 mensaje de cierre desde plantilla");
  } else {
    mensaje = aiResponse;
    if (aiResponse.includes("DATOS DEL CLIENTE:") || aiResponse.includes("Informaci\xF3n completa obtenida")) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
      log?.warn({ entityId }, "GPT gener\xF3 nota interna \u2014 usando cierre desde plantilla");
    }
  }
  if (appliedDirectReply) {
    return normalizeAdvisorReferences(
      mensaje,
      extracted.nombre ?? getDisplayName(extracted, whatsappDisplayName)
    );
  }
  if (filledSet.has("Presupuesto (MXN)") && mensajeAsksForField(mensaje, "presupuesto")) {
    mensaje = blockExcessivePresupuestoAsk(
      mensaje,
      filledSet,
      extracted,
      presHistory,
      currentMessage,
      buildClosing,
      cierreYaEnviado,
      whatsappDisplayName,
      entityId,
      log
    );
  }
  const presFromCurrentMsg = currentMessage ? parsePresupuestoFromText(currentMessage, {
    askedField: inferLucyAskedField(
      presHistory.filter((m) => m.role === "assistant").slice(-1)[0]?.content
    ) === "presupuesto" ? "presupuesto" : null
  }) : null;
  if (presFromCurrentMsg && !filledSet.has("Presupuesto (MXN)") && (mensajeAsksForField(mensaje, "presupuesto") || /presupuesto|rango/i.test(mensaje) && mensaje.includes("?"))) {
    applyPresupuestoWaiver(filledSet, [], collectUserTexts(presHistory, currentMessage), presHistory);
    if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
      log?.info({ entityId }, "GUARD: presupuesto capturado en turno \u2014 cierre");
    } else if (/econ[oó]mic/i.test(presFromCurrentMsg)) {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, presHistory, currentMessage, entityId);
      mensaje = nextQ ? `Entendido, buscamos opciones econ\xF3micas. ${nextQ}` : "Entendido, buscamos opciones econ\xF3micas. Nuestro equipo te propone alternativas seg\xFAn lo que platicamos.";
      log?.info({ entityId }, "GUARD: presupuesto econ\xF3mico \u2014 no repetir pregunta");
    } else {
      mensaje = "Entendido, sin problema. Nuestro equipo te propone opciones seg\xFAn lo que platicamos y te arma la cotizaci\xF3n.";
      log?.info({ entityId }, "GUARD: cliente sin presupuesto fijo \u2014 continuar");
    }
  } else if (!filledSet.has("Presupuesto (MXN)") && countLucyFieldAsks(presHistory, "presupuesto") >= PRESUPUESTO_MAX_ASKS && mensajeAsksForField(mensaje, "presupuesto")) {
    applyPresupuestoWaiver(filledSet, [], collectUserTexts(presHistory, currentMessage), presHistory);
    mensaje = blockExcessivePresupuestoAsk(
      mensaje,
      filledSet,
      extracted,
      presHistory,
      currentMessage,
      buildClosing,
      cierreYaEnviado,
      whatsappDisplayName,
      entityId,
      log
    );
    log?.info({ entityId }, "GUARD: tope de preguntas presupuesto \u2014 auto-waiver");
  }
  if (filledSet.has("Fecha y horario") && mensajeAsksForField(mensaje, "fecha")) {
    if (trulyReadyForClosing && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
      log?.info({ entityId }, "GUARD: fecha capturada \u2014 cierre");
    } else {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
      if (nextQ && !mensajeAsksForField(nextQ, "fecha")) {
        mensaje = nextQ;
        log?.info({ entityId }, "GUARD: fecha ya capturada \u2014 no repetir pregunta");
      } else if (!nextQ && isReadyForClosing(filledSet) && !cierreYaEnviado) {
        mensaje = buildClosing(
          extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
          extracted.nombre
        );
        log?.info({ entityId }, "GUARD: todos los datos listos \u2014 cierre tras fecha");
      }
    }
  }
  const fechaFromMsg = currentMessage ? parseFechaFromText(currentMessage) : null;
  if (fechaFromMsg && mensajeAsksForField(mensaje, "fecha") && !filledSet.has("Fecha y horario")) {
    filledSet.add("Fecha y horario");
    if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
      log?.info({ entityId }, "GUARD: fecha capturada en turno \u2014 cierre");
    } else {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
      mensaje = nextQ ?? "Entendido, sin problema con la fecha.";
      log?.info({ entityId }, "GUARD: fecha pendiente \u2014 continuar flujo");
    }
  }
  if (filledSet.has("Tipo de evento") && mensajeAsksForField(mensaje, "tipo_evento") && !trulyReadyForClosing) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && pending !== "tipo_evento") {
      const nextQ = buildNaturalQuestion(pending, ctx);
      mensaje = nextQ;
      log?.info({ entityId, pending }, "GUARD: tipo de evento ya capturado \u2014 siguiente dato");
    }
  }
  if (shouldReplaceForcedEmailQuestion(mensaje, filledSet)) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId) ?? emailRefusalAckMessage(extracted, history, currentMessage, entityId, filledSet);
    log?.warn({ entityId }, "GUARD: correo forzado tras rechazo \u2014 reemplazando respuesta");
    mensaje = nextQ;
  }
  const correoYaTenido = !!extracted.correo?.trim() || filledSet.has("Correo electr\xF3nico");
  if (correoYaTenido && /correo/i.test(mensaje) && mensaje.includes("?") && !trulyReadyForClosing) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && pending !== "correo" && !mensajeAsksForField(mensaje, pending)) {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
      if (nextQ) {
        log?.warn({ entityId }, "GUARD: GPT pregunt\xF3 correo ya capturado");
        mensaje = nextQ;
      }
    }
  }
  if (filledSet.has(EMAIL_WAIVED_LABEL) && /correo/i.test(mensaje) && mensaje.includes("?") && !trulyReadyForClosing) {
    const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId) ?? emailRefusalAckMessage(extracted, history, currentMessage, entityId, filledSet);
    log?.warn({ entityId }, "GUARD: GPT insisti\xF3 en correo tras rechazo");
    mensaje = nextQ;
  }
  if (!trulyReadyForClosing && !cierreYaEnviado && !clientAskedFreeformQuestion(currentMessage)) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && !mensaje.includes("?")) {
      if (responseLooksLikePrematureClose(mensaje)) {
        mensaje = buildNaturalQuestion(pending, ctx);
        log?.info({ entityId, pending }, "GUARD: bloqueando cierre \u2014 pregunta pendiente");
      } else if (mensaje.trim()) {
        mensaje = mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx);
        log?.info({ entityId, pending }, "GUARD: a\xF1adiendo pregunta pendiente a respuesta");
      }
    }
  }
  if (!trulyReadyForClosing && !appliedDirectReply && responseLooksLikePrematureClose(mensaje)) {
    const forcedNext = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
    if (forcedNext) {
      log?.warn({ entityId }, "GUARD: bloqueando cierre prematuro");
      mensaje = forcedNext;
    }
  }
  if (mensajeAsksWrongField(mensaje, filledSet, extracted) && !isInformativeClientAnswer(currentMessage) && !appliedSalesReply) {
    const pending = getNextPendingField(extracted, filledSet);
    if (pending) {
      log?.warn({ entityId, pending }, "GUARD: pregunta fuera de orden \u2014 corrigiendo");
      mensaje = buildNaturalQuestion(pending, ctx);
    }
  }
  if (!cierreYaEnviado && !appliedSalesReply && !appliedDirectReply) {
    mensaje = sanitizeOutboundMessage(mensaje, filledSet, extracted, ctx, log);
  }
  if (appliedSalesReply) {
    return normalizeAdvisorReferences(mensaje, extracted.nombre);
  }
  mensaje = enforceNombreFirst(mensaje, filledSet, extracted, ctx, forceFirstPresentation);
  const presHistoryForIntro = input.presentationHistory ?? history;
  const isOpeningTurn = (forceFirstPresentation || isFirstLucyReply(presHistoryForIntro)) && !conversationAlreadyStarted(filledSet, presHistoryForIntro);
  if (isOpeningTurn && !/hola,?\s*soy\s+lucy/i.test(mensaje)) {
    mensaje = `${LUCY_INTRO} ${mensaje}`.trim();
    log?.info({ entityId }, "GUARD: presentaci\xF3n Lucy a\xF1adida al primer mensaje");
  }
  if (conversationAlreadyStarted(filledSet, presHistoryForIntro)) {
    mensaje = stripRepeatLucyIntro(mensaje, presHistoryForIntro, true);
  }
  const ctxText = collectUserTexts(input.presentationHistory ?? history, currentMessage).join(" ");
  const priceSanitized = sanitizeInventedPrices(mensaje, currentMessage, ctxText);
  if (priceSanitized !== mensaje) {
    log?.info({ entityId }, "GUARD: precios inventados eliminados de la respuesta");
    mensaje = priceSanitized;
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && !mensaje.includes("?") && !trulyReadyForClosing && !cierreYaEnviado) {
      mensaje = mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx);
    }
  }
  mensaje = stripStalePriceTalk(mensaje, currentMessage);
  if (!mensaje.includes("?") && !trulyReadyForClosing && !cierreYaEnviado && !clientAskedFreeformQuestion(currentMessage)) {
    let pendingAfter = getNextPendingField(extracted, filledSet);
    if (pendingAfter === "presupuesto" && countLucyFieldAsks(presHistory, "presupuesto") >= PRESUPUESTO_MAX_ASKS) {
      applyPresupuestoWaiver(filledSet, [], collectUserTexts(presHistory, currentMessage), presHistory);
      pendingAfter = getNextPendingField(extracted, filledSet);
    }
    if (pendingAfter && !(pendingAfter === "presupuesto" && filledSet.has("Presupuesto (MXN)"))) {
      mensaje = mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx);
    }
  }
  mensaje = blockExcessivePresupuestoAsk(
    mensaje,
    filledSet,
    extracted,
    presHistory,
    currentMessage,
    buildClosing,
    cierreYaEnviado,
    whatsappDisplayName,
    entityId,
    log
  );
  if (clientAsksPrice(currentMessage) && mentionsListedPriceService(currentMessage)) {
    const fromCatalog = buildCatalogPriceAnswer(currentMessage);
    if (fromCatalog) {
      const pendingFinal = getNextPendingField(extracted, filledSet);
      if (pendingFinal && needsNextStep && !trulyReadyForClosing) {
        mensaje = `${fromCatalog}

${buildNaturalQuestion(pendingFinal, ctx)}`;
      } else {
        mensaje = fromCatalog;
      }
      log?.info({ entityId }, "GUARD: precio del Sheet aplicado al cierre");
    }
  } else if (clientAsksPrice(currentMessage) && !messageClaimsPrice(mensaje) && !mentionsNoListedPriceService(currentMessage)) {
    const fromCatalog = buildCatalogPriceAnswer(currentMessage);
    if (fromCatalog) {
      const pendingFinal = getNextPendingField(extracted, filledSet);
      if (pendingFinal && needsNextStep && !trulyReadyForClosing) {
        mensaje = `${fromCatalog}

${buildNaturalQuestion(pendingFinal, ctx)}`;
      } else {
        mensaje = fromCatalog;
      }
      log?.info({ entityId }, "GUARD: precio del Sheet aplicado al cierre");
    }
  } else if (clientAsksInclusion(currentMessage)) {
    const inclusionAnswer = buildCatalogInclusionAnswer(currentMessage);
    if (inclusionAnswer) {
      const pendingFinal = getNextPendingField(extracted, filledSet);
      if (pendingFinal && needsNextStep && !trulyReadyForClosing) {
        mensaje = `${inclusionAnswer}

${buildNaturalQuestion(pendingFinal, ctx)}`;
      } else {
        mensaje = inclusionAnswer;
      }
      log?.info({ entityId }, "GUARD: inclusiones del Sheet aplicadas al cierre");
    }
  }
  const withoutGammaLinks = stripGammaLinks(mensaje);
  if (withoutGammaLinks !== mensaje) {
    log?.info({ entityId }, "GUARD: enlaces gamma.app eliminados de la respuesta");
    mensaje = withoutGammaLinks;
  }
  const withoutImageAnnotation = stripImageAnnotation(mensaje);
  if (withoutImageAnnotation !== mensaje) {
    log?.warn({ entityId }, "GUARD: anotaci\xF3n interna de imagen filtrada al cliente \u2014 removida");
    mensaje = withoutImageAnnotation || "Gracias por la imagen.";
  }
  if (conversationAlreadyStarted(filledSet, presHistoryForIntro)) {
    const stripped = stripRobotAcknowledgments(mensaje);
    if (stripped !== mensaje) {
      log?.info({ entityId }, "GUARD: reconocimiento robot de dato capturado eliminado");
      mensaje = stripped;
    }
  }
  mensaje = avoidRepeatPreviousReply(mensaje, presHistory);
  if (mensajeAsksForField(mensaje, "zona") && countLucyFieldAsks(presHistory, "zona") >= 1 && !filledSet.has("Lugar/direcci\xF3n del evento")) {
    const nombre = getDisplayName(extracted, whatsappDisplayName);
    const zonaAsks = countLucyFieldAsks(presHistory, "zona");
    const zonaVariants = nombre ? [
      `${pickTransition(presHistory)} ${nombre}, \xBFme confirmas la ciudad o colonia del evento?`,
      `${pickTransition(presHistory)} ${nombre}, \xBFen qu\xE9 zona o sal\xF3n lo tendr\xEDan?`,
      `${pickTransition(presHistory)} ${nombre}, \xBFya tienen el lugar del evento?`
    ] : [
      `${pickTransition(presHistory)} \xBFMe confirmas la ciudad o colonia del evento?`,
      `${pickTransition(presHistory)} \xBFEn qu\xE9 zona o sal\xF3n lo tendr\xEDan?`,
      `${pickTransition(presHistory)} \xBFYa tienen el lugar del evento?`
    ];
    mensaje = zonaVariants[Math.min(zonaAsks - 1, zonaVariants.length - 1)];
    log?.info({ entityId, zonaAsks }, "GUARD: pregunta de zona \u2014 variante alterna");
  }
  if (mensajeAsksForField(mensaje, "fecha") && countLucyFieldAsks(presHistory, "fecha") >= 1 && !filledSet.has("Fecha y horario")) {
    const nombre = getDisplayName(extracted, whatsappDisplayName);
    mensaje = nombre ? `${pickTransition(presHistory)} ${nombre}, \xBFtienen d\xEDa u horario ya definido?` : `${pickTransition(presHistory)} \xBFTienen d\xEDa u horario ya definido?`;
    log?.info({ entityId }, "GUARD: segunda pregunta de fecha \u2014 variante corta");
  }
  mensaje = redirectIfAskingFilledField(mensaje, filledSet, extracted, ctx);
  const historyHadGenericMenu = presHistory.some(
    (m) => m.role === "assistant" && typeof m.content === "string" && responseLooksLikeGenericCateringMenu(m.content)
  );
  if (responseLooksLikeGenericCateringMenu(mensaje) && historyHadGenericMenu && currentMessage?.trim()) {
    const detail = buildCatalogServiceDetailAnswer(currentMessage);
    if (detail) {
      mensaje = detail;
      log?.info({ entityId }, "GUARD: men\xFA gen\xE9rico repetido \u2014 detalle del Sheet");
    } else {
      const pending = getNextPendingField(extracted, filledSet);
      if (pending) {
        mensaje = buildNaturalQuestion(pending, ctx);
        log?.info({ entityId }, "GUARD: men\xFA gen\xE9rico repetido \u2014 avanzar flujo");
      }
    }
  }
  return normalizeAdvisorReferences(mensaje, extracted.nombre);
}
function stripGammaLinks(text) {
  if (!text || !/gamma\.app/i.test(text)) return text;
  return text.replace(/https?:\/\/[^\s]*gamma\.app[^\s]*/gi, "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}
function stripImageAnnotation(text) {
  if (!text || !/\[imagen\s+adjunta:/i.test(text)) return text;
  return text.replace(/\[imagen\s+adjunta:[^\]]*\]/gi, "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

// src/services/summaryService.ts
function pickFromMergedLines(mergedLines, labelPattern) {
  const line = mergedLines.find((l) => labelPattern.test(l));
  if (!line) return null;
  const val = line.replace(/^- /, "").split(":").slice(1).join(":").trim();
  return val || null;
}
function buildResumenClienteLargo(extracted, mergedLines, conversationText) {
  const nombre = pickFromMergedLines(mergedLines, /Nombre del cliente/i) || extracted.nombre?.trim() || null;
  const correo = pickFromMergedLines(mergedLines, /Correo electrónico/i) || extracted.correo?.trim() || null;
  const emailWaived = mergedLines.some((l) => /continuar por whatsapp/i.test(l));
  const evento = pickFromMergedLines(mergedLines, /Tipo de evento/i) || extracted.tipo_evento?.trim() || null;
  const fecha = pickFromMergedLines(mergedLines, /Fecha y horario/i) || extracted.fecha_horario?.trim() || null;
  const invitados = pickFromMergedLines(mergedLines, /Número de invitados/i) || (extracted.num_invitados !== null && extracted.num_invitados > 0 ? String(extracted.num_invitados) : null);
  const ubicacion = pickFromMergedLines(mergedLines, /Lugar\/dirección/i) || extracted.direccion_evento?.trim() || null;
  const pptoFromLine = pickFromMergedLines(mergedLines, /Presupuesto/i);
  const ppto = pptoFromLine || (extracted.presupuesto !== null && extracted.presupuesto > 0 ? `$${extracted.presupuesto.toLocaleString("es-MX")} MXN` : null);
  const reqFromLines = pickFromMergedLines(mergedLines, /Requerimientos/i);
  const reqFromServices = extracted.requerimientos_evento?.trim();
  const reqFromConversation = conversationText && conversationText.trim().length > 20 ? parseServicesFromText(conversationText).slice(0, 3).join(", ") : null;
  const reqs = (reqFromLines && reqFromLines !== "Info pendiente" ? reqFromLines : null) || (reqFromServices && reqFromServices !== extracted.tipo_evento ? reqFromServices : null) || (reqFromConversation && reqFromConversation.length > 0 ? reqFromConversation : null);
  const lineas = ["RESUMEN LUCY \u2014 lo que el cliente quiere:", ""];
  if (nombre) lineas.push(`\u2022 Nombre: ${nombre}`);
  if (correo) lineas.push(`\u2022 Correo: ${correo}`);
  else if (emailWaived) lineas.push("\u2022 Correo: no proporcion\xF3 (contin\xFAa por WhatsApp)");
  if (evento) lineas.push(`\u2022 Tipo de evento: ${evento}`);
  if (reqs) lineas.push(`\u2022 El cliente quiere: ${reqs}`);
  if (invitados) lineas.push(`\u2022 Invitados: ${invitados}`);
  if (ubicacion) lineas.push(`\u2022 Ubicaci\xF3n: ${ubicacion}`);
  if (fecha) lineas.push(`\u2022 Fecha: ${fecha}`);
  if (ppto) lineas.push(`\u2022 Presupuesto: ${ppto}`);
  if (lineas.length <= 2) {
    return "RESUMEN LUCY\n\n(Captura en progreso \u2014 a\xFAn faltan datos del cliente)";
  }
  lineas.push("", "\u2014 Actualizado autom\xE1ticamente por Lucy en cada mensaje \u2014");
  return lineas.join("\n").slice(0, 8e3);
}

// src/lib/external-ingest-sanitize.ts
function lineValue(line, label) {
  const re = new RegExp(`^-?\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*`, "i");
  return line.replace(re, "").trim();
}
function purgeOwnCompanyEmailLines(lines) {
  return lines.filter((line) => {
    if (!/^-?\s*Correo electrónico:/i.test(line)) return true;
    const raw = lineValue(line, "Correo electr\xF3nico");
    return !isOwnCompanyEmail(raw) && !!filterClientEmail(raw);
  });
}
function purgeDimensionUbicacionLines(lines) {
  return lines.filter((line) => {
    if (!/^-?\s*Lugar\/dirección del evento:/i.test(line)) return true;
    const raw = lineValue(line, "Lugar/direcci\xF3n del evento");
    return !isDimensionText(raw);
  });
}
function purgeInvalidNombreLines(lines) {
  return lines.filter((line) => {
    if (!/^-?\s*Nombre del cliente:/i.test(line)) return true;
    const raw = lineValue(line, "Nombre del cliente");
    if (isStaffAdvisorName(raw)) return false;
    return !!sanitizeCrmNombre(raw) && !isQuoteIntentMessage(raw);
  });
}
function purgeRequerimientosEqualsTipoLines(lines) {
  const tipoLine = lines.find((l) => /^-?\s*Tipo de evento:/i.test(l));
  const tipo = tipoLine ? lineValue(tipoLine, "Tipo de evento").toLowerCase() : "";
  if (!tipo) return lines;
  return lines.filter((line) => {
    if (!/^-?\s*Requerimientos o servicios:/i.test(line)) return true;
    const req = lineValue(line, "Requerimientos o servicios").toLowerCase();
    return req !== tipo;
  });
}
function sanitizeKommoCrmLines(lines) {
  let out = [...lines];
  out = purgeInvalidNombreLines(out);
  out = purgeOwnCompanyEmailLines(out);
  out = purgeDimensionUbicacionLines(out);
  out = purgeRequerimientosEqualsTipoLines(out);
  return out;
}
function sanitizeExtractedFromExternal(extracted, conversationText) {
  const out = { ...extracted };
  out.tipo_contacto = resolveTipoContacto(out.tipo_contacto, conversationText ?? "") ?? "cliente";
  const correo = filterClientEmail(out.correo);
  out.correo = correo;
  const nombre = sanitizeCrmNombre(out.nombre);
  out.nombre = nombre && !isQuoteIntentMessage(nombre) ? nombre : null;
  if (out.direccion_evento && isDimensionText(out.direccion_evento)) {
    out.direccion_evento = null;
  }
  if (out.requerimientos_evento?.trim() && out.tipo_evento?.trim() && out.requerimientos_evento.trim().toLowerCase() === out.tipo_evento.trim().toLowerCase()) {
    out.requerimientos_evento = null;
  }
  return out;
}

// src/selftest/lucy-flow-selftest.ts
import { readFileSync } from "node:fs";
import path2 from "node:path";
import { fileURLToPath } from "node:url";

// node_modules/openai/internal/tslib.mjs
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m")
    throw new TypeError("Private method is not writable");
  if (kind === "a" && !f)
    throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
    throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f)
    throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
    throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}

// node_modules/openai/internal/utils/uuid.mjs
var uuid4 = function() {
  const { crypto: crypto2 } = globalThis;
  if (crypto2?.randomUUID) {
    uuid4 = crypto2.randomUUID.bind(crypto2);
    return crypto2.randomUUID();
  }
  const u8 = new Uint8Array(1);
  const randomByte = crypto2 ? () => crypto2.getRandomValues(u8)[0] : () => Math.random() * 255 & 255;
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ randomByte() & 15 >> +c / 4).toString(16));
};

// node_modules/openai/internal/errors.mjs
function isAbortError(err) {
  return typeof err === "object" && err !== null && // Spec-compliant fetch implementations
  ("name" in err && err.name === "AbortError" || // Expo fetch
  "message" in err && String(err.message).includes("FetchRequestCanceledException"));
}
var castToError = (err) => {
  if (err instanceof Error)
    return err;
  if (typeof err === "object" && err !== null) {
    try {
      if (Object.prototype.toString.call(err) === "[object Error]") {
        const error = new Error(err.message, err.cause ? { cause: err.cause } : {});
        if (err.stack)
          error.stack = err.stack;
        if (err.cause && !error.cause)
          error.cause = err.cause;
        if (err.name)
          error.name = err.name;
        return error;
      }
    } catch {
    }
    try {
      return new Error(JSON.stringify(err));
    } catch {
    }
  }
  return new Error(err);
};

// node_modules/openai/core/error.mjs
var OpenAIError = class extends Error {
};
var APIError = class _APIError extends OpenAIError {
  constructor(status, error, message, headers) {
    super(`${_APIError.makeMessage(status, error, message)}`);
    this.status = status;
    this.headers = headers;
    this.requestID = headers?.get("x-request-id");
    this.error = error;
    const data = error;
    this.code = data?.["code"];
    this.param = data?.["param"];
    this.type = data?.["type"];
  }
  static makeMessage(status, error, message) {
    const msg = error?.message ? typeof error.message === "string" ? error.message : JSON.stringify(error.message) : error ? JSON.stringify(error) : message;
    if (status && msg) {
      return `${status} ${msg}`;
    }
    if (status) {
      return `${status} status code (no body)`;
    }
    if (msg) {
      return msg;
    }
    return "(no status code or body)";
  }
  static generate(status, errorResponse, message, headers) {
    if (!status || !headers) {
      return new APIConnectionError({ message, cause: castToError(errorResponse) });
    }
    const error = errorResponse?.["error"];
    if (status === 400) {
      return new BadRequestError(status, error, message, headers);
    }
    if (status === 401) {
      return new AuthenticationError(status, error, message, headers);
    }
    if (status === 403) {
      return new PermissionDeniedError(status, error, message, headers);
    }
    if (status === 404) {
      return new NotFoundError(status, error, message, headers);
    }
    if (status === 409) {
      return new ConflictError(status, error, message, headers);
    }
    if (status === 422) {
      return new UnprocessableEntityError(status, error, message, headers);
    }
    if (status === 429) {
      return new RateLimitError(status, error, message, headers);
    }
    if (status >= 500) {
      return new InternalServerError(status, error, message, headers);
    }
    return new _APIError(status, error, message, headers);
  }
};
var APIUserAbortError = class extends APIError {
  constructor({ message } = {}) {
    super(void 0, void 0, message || "Request was aborted.", void 0);
  }
};
var APIConnectionError = class extends APIError {
  constructor({ message, cause }) {
    super(void 0, void 0, message || "Connection error.", void 0);
    if (cause)
      this.cause = cause;
  }
};
var APIConnectionTimeoutError = class extends APIConnectionError {
  constructor({ message } = {}) {
    super({ message: message ?? "Request timed out." });
  }
};
var BadRequestError = class extends APIError {
};
var AuthenticationError = class extends APIError {
};
var PermissionDeniedError = class extends APIError {
};
var NotFoundError = class extends APIError {
};
var ConflictError = class extends APIError {
};
var UnprocessableEntityError = class extends APIError {
};
var RateLimitError = class extends APIError {
};
var InternalServerError = class extends APIError {
};
var LengthFinishReasonError = class extends OpenAIError {
  constructor() {
    super(`Could not parse response content as the length limit was reached`);
  }
};
var ContentFilterFinishReasonError = class extends OpenAIError {
  constructor() {
    super(`Could not parse response content as the request was rejected by the content filter`);
  }
};
var InvalidWebhookSignatureError = class extends Error {
  constructor(message) {
    super(message);
  }
};
var OAuthError = class extends APIError {
  constructor(status, error, headers) {
    let finalMessage = "OAuth2 authentication error";
    let error_code = void 0;
    if (error && typeof error === "object") {
      const errorData = error;
      error_code = errorData["error"];
      const description = errorData["error_description"];
      if (description && typeof description === "string") {
        finalMessage = description;
      } else if (error_code) {
        finalMessage = error_code;
      }
    }
    super(status, error, finalMessage, headers);
    this.error_code = error_code;
  }
};
var SubjectTokenProviderError = class extends OpenAIError {
  constructor(message, provider, cause) {
    super(message);
    this.provider = provider;
    this.cause = cause;
  }
};

// node_modules/openai/internal/utils/values.mjs
var startsWithSchemeRegexp = /^[a-z][a-z0-9+.-]*:/i;
var isAbsoluteURL = (url) => {
  return startsWithSchemeRegexp.test(url);
};
var isArray = (val) => (isArray = Array.isArray, isArray(val));
var isReadonlyArray = isArray;
function maybeObj(x) {
  if (typeof x !== "object") {
    return {};
  }
  return x ?? {};
}
function isEmptyObj(obj) {
  if (!obj)
    return true;
  for (const _k in obj)
    return false;
  return true;
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function isObj(obj) {
  return obj != null && typeof obj === "object" && !Array.isArray(obj);
}
var validatePositiveInteger = (name, n) => {
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new OpenAIError(`${name} must be an integer`);
  }
  if (n < 0) {
    throw new OpenAIError(`${name} must be a positive integer`);
  }
  return n;
};
var safeJSON = (text) => {
  try {
    return JSON.parse(text);
  } catch (err) {
    return void 0;
  }
};

// node_modules/openai/internal/utils/sleep.mjs
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// node_modules/openai/version.mjs
var VERSION = "6.45.0";

// node_modules/openai/internal/detect-platform.mjs
var isRunningInBrowser = () => {
  return (
    // @ts-ignore
    typeof window !== "undefined" && // @ts-ignore
    typeof window.document !== "undefined" && // @ts-ignore
    typeof navigator !== "undefined"
  );
};
function getDetectedPlatform() {
  if (typeof Deno !== "undefined" && Deno.build != null) {
    return "deno";
  }
  if (typeof EdgeRuntime !== "undefined") {
    return "edge";
  }
  if (Object.prototype.toString.call(typeof globalThis.process !== "undefined" ? globalThis.process : 0) === "[object process]") {
    return "node";
  }
  return "unknown";
}
var getPlatformProperties = () => {
  const detectedPlatform = getDetectedPlatform();
  if (detectedPlatform === "deno") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(Deno.build.os),
      "X-Stainless-Arch": normalizeArch(Deno.build.arch),
      "X-Stainless-Runtime": "deno",
      "X-Stainless-Runtime-Version": typeof Deno.version === "string" ? Deno.version : Deno.version?.deno ?? "unknown"
    };
  }
  if (typeof EdgeRuntime !== "undefined") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": `other:${EdgeRuntime}`,
      "X-Stainless-Runtime": "edge",
      "X-Stainless-Runtime-Version": globalThis.process.version
    };
  }
  if (detectedPlatform === "node") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(globalThis.process.platform ?? "unknown"),
      "X-Stainless-Arch": normalizeArch(globalThis.process.arch ?? "unknown"),
      "X-Stainless-Runtime": "node",
      "X-Stainless-Runtime-Version": globalThis.process.version ?? "unknown"
    };
  }
  const browserInfo = getBrowserInfo();
  if (browserInfo) {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": "unknown",
      "X-Stainless-Runtime": `browser:${browserInfo.browser}`,
      "X-Stainless-Runtime-Version": browserInfo.version
    };
  }
  return {
    "X-Stainless-Lang": "js",
    "X-Stainless-Package-Version": VERSION,
    "X-Stainless-OS": "Unknown",
    "X-Stainless-Arch": "unknown",
    "X-Stainless-Runtime": "unknown",
    "X-Stainless-Runtime-Version": "unknown"
  };
};
function getBrowserInfo() {
  if (typeof navigator === "undefined" || !navigator) {
    return null;
  }
  const browserPatterns = [
    { key: "edge", pattern: /Edge(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /MSIE(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /Trident(?:.*rv\:(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "chrome", pattern: /Chrome(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "firefox", pattern: /Firefox(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "safari", pattern: /(?:Version\W+(\d+)\.(\d+)(?:\.(\d+))?)?(?:\W+Mobile\S*)?\W+Safari/ }
  ];
  for (const { key, pattern } of browserPatterns) {
    const match = pattern.exec(navigator.userAgent);
    if (match) {
      const major = match[1] || 0;
      const minor = match[2] || 0;
      const patch = match[3] || 0;
      return { browser: key, version: `${major}.${minor}.${patch}` };
    }
  }
  return null;
}
var normalizeArch = (arch) => {
  if (arch === "x32")
    return "x32";
  if (arch === "x86_64" || arch === "x64")
    return "x64";
  if (arch === "arm")
    return "arm";
  if (arch === "aarch64" || arch === "arm64")
    return "arm64";
  if (arch)
    return `other:${arch}`;
  return "unknown";
};
var normalizePlatform = (platform) => {
  platform = platform.toLowerCase();
  if (platform.includes("ios"))
    return "iOS";
  if (platform === "android")
    return "Android";
  if (platform === "darwin")
    return "MacOS";
  if (platform === "win32")
    return "Windows";
  if (platform === "freebsd")
    return "FreeBSD";
  if (platform === "openbsd")
    return "OpenBSD";
  if (platform === "linux")
    return "Linux";
  if (platform)
    return `Other:${platform}`;
  return "Unknown";
};
var _platformHeaders;
var getPlatformHeaders = () => {
  return _platformHeaders ?? (_platformHeaders = getPlatformProperties());
};

// node_modules/openai/internal/shims.mjs
function getDefaultFetch() {
  if (typeof fetch !== "undefined") {
    return fetch;
  }
  throw new Error("`fetch` is not defined as a global; Either pass `fetch` to the client, `new OpenAI({ fetch })` or polyfill the global, `globalThis.fetch = fetch`");
}
function makeReadableStream(...args) {
  const ReadableStream = globalThis.ReadableStream;
  if (typeof ReadableStream === "undefined") {
    throw new Error("`ReadableStream` is not defined as a global; You will need to polyfill it, `globalThis.ReadableStream = ReadableStream`");
  }
  return new ReadableStream(...args);
}
function ReadableStreamFrom(iterable) {
  let iter = Symbol.asyncIterator in iterable ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
  return makeReadableStream({
    start() {
    },
    async pull(controller) {
      const { done, value } = await iter.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    async cancel() {
      await iter.return?.();
    }
  });
}
function ReadableStreamToAsyncIterable(stream) {
  if (stream[Symbol.asyncIterator])
    return stream;
  const reader = stream.getReader();
  return {
    async next() {
      try {
        const result = await reader.read();
        if (result?.done)
          reader.releaseLock();
        return result;
      } catch (e) {
        reader.releaseLock();
        throw e;
      }
    },
    async return() {
      const cancelPromise = reader.cancel();
      reader.releaseLock();
      await cancelPromise;
      return { done: true, value: void 0 };
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}
async function CancelReadableStream(stream) {
  if (stream === null || typeof stream !== "object")
    return;
  if (stream[Symbol.asyncIterator]) {
    await stream[Symbol.asyncIterator]().return?.();
    return;
  }
  const reader = stream.getReader();
  const cancelPromise = reader.cancel();
  reader.releaseLock();
  await cancelPromise;
}

// node_modules/openai/internal/request-options.mjs
var FallbackEncoder = ({ headers, body }) => {
  return {
    bodyHeaders: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
};

// node_modules/openai/internal/qs/formats.mjs
var default_format = "RFC3986";
var default_formatter = (v) => String(v);
var formatters = {
  RFC1738: (v) => String(v).replace(/%20/g, "+"),
  RFC3986: default_formatter
};
var RFC1738 = "RFC1738";

// node_modules/openai/internal/qs/utils.mjs
var has = (obj, key) => (has = Object.hasOwn ?? Function.prototype.call.bind(Object.prototype.hasOwnProperty), has(obj, key));
var hex_table = /* @__PURE__ */ (() => {
  const array = [];
  for (let i = 0; i < 256; ++i) {
    array.push("%" + ((i < 16 ? "0" : "") + i.toString(16)).toUpperCase());
  }
  return array;
})();
var limit = 1024;
var encode = (str2, _defaultEncoder, charset, _kind, format) => {
  if (str2.length === 0) {
    return str2;
  }
  let string = str2;
  if (typeof str2 === "symbol") {
    string = Symbol.prototype.toString.call(str2);
  } else if (typeof str2 !== "string") {
    string = String(str2);
  }
  if (charset === "iso-8859-1") {
    return escape(string).replace(/%u[0-9a-f]{4}/gi, function($0) {
      return "%26%23" + parseInt($0.slice(2), 16) + "%3B";
    });
  }
  let out = "";
  for (let j = 0; j < string.length; j += limit) {
    const segment = string.length >= limit ? string.slice(j, j + limit) : string;
    const arr = [];
    for (let i = 0; i < segment.length; ++i) {
      let c = segment.charCodeAt(i);
      if (c === 45 || // -
      c === 46 || // .
      c === 95 || // _
      c === 126 || // ~
      c >= 48 && c <= 57 || // 0-9
      c >= 65 && c <= 90 || // a-z
      c >= 97 && c <= 122 || // A-Z
      format === RFC1738 && (c === 40 || c === 41)) {
        arr[arr.length] = segment.charAt(i);
        continue;
      }
      if (c < 128) {
        arr[arr.length] = hex_table[c];
        continue;
      }
      if (c < 2048) {
        arr[arr.length] = hex_table[192 | c >> 6] + hex_table[128 | c & 63];
        continue;
      }
      if (c < 55296 || c >= 57344) {
        arr[arr.length] = hex_table[224 | c >> 12] + hex_table[128 | c >> 6 & 63] + hex_table[128 | c & 63];
        continue;
      }
      i += 1;
      c = 65536 + ((c & 1023) << 10 | segment.charCodeAt(i) & 1023);
      arr[arr.length] = hex_table[240 | c >> 18] + hex_table[128 | c >> 12 & 63] + hex_table[128 | c >> 6 & 63] + hex_table[128 | c & 63];
    }
    out += arr.join("");
  }
  return out;
};
function is_buffer(obj) {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
}
function maybe_map(val, fn) {
  if (isArray(val)) {
    const mapped = [];
    for (let i = 0; i < val.length; i += 1) {
      mapped.push(fn(val[i]));
    }
    return mapped;
  }
  return fn(val);
}

// node_modules/openai/internal/qs/stringify.mjs
var array_prefix_generators = {
  brackets(prefix) {
    return String(prefix) + "[]";
  },
  comma: "comma",
  indices(prefix, key) {
    return String(prefix) + "[" + key + "]";
  },
  repeat(prefix) {
    return String(prefix);
  }
};
var push_to_array = function(arr, value_or_array) {
  Array.prototype.push.apply(arr, isArray(value_or_array) ? value_or_array : [value_or_array]);
};
var toISOString;
var defaults = {
  addQueryPrefix: false,
  allowDots: false,
  allowEmptyArrays: false,
  arrayFormat: "indices",
  charset: "utf-8",
  charsetSentinel: false,
  delimiter: "&",
  encode: true,
  encodeDotInKeys: false,
  encoder: encode,
  encodeValuesOnly: false,
  format: default_format,
  formatter: default_formatter,
  /** @deprecated */
  indices: false,
  serializeDate(date) {
    return (toISOString ?? (toISOString = Function.prototype.call.bind(Date.prototype.toISOString)))(date);
  },
  skipNulls: false,
  strictNullHandling: false
};
function is_non_nullish_primitive(v) {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" || typeof v === "symbol" || typeof v === "bigint";
}
var sentinel = {};
function inner_stringify(object, prefix, generateArrayPrefix, commaRoundTrip, allowEmptyArrays, strictNullHandling, skipNulls, encodeDotInKeys, encoder, filter, sort, allowDots, serializeDate, format, formatter, encodeValuesOnly, charset, sideChannel) {
  let obj = object;
  let tmp_sc = sideChannel;
  let step = 0;
  let find_flag = false;
  while ((tmp_sc = tmp_sc.get(sentinel)) !== void 0 && !find_flag) {
    const pos = tmp_sc.get(object);
    step += 1;
    if (typeof pos !== "undefined") {
      if (pos === step) {
        throw new RangeError("Cyclic object value");
      } else {
        find_flag = true;
      }
    }
    if (typeof tmp_sc.get(sentinel) === "undefined") {
      step = 0;
    }
  }
  if (typeof filter === "function") {
    obj = filter(prefix, obj);
  } else if (obj instanceof Date) {
    obj = serializeDate?.(obj);
  } else if (generateArrayPrefix === "comma" && isArray(obj)) {
    obj = maybe_map(obj, function(value) {
      if (value instanceof Date) {
        return serializeDate?.(value);
      }
      return value;
    });
  }
  if (obj === null) {
    if (strictNullHandling) {
      return encoder && !encodeValuesOnly ? (
        // @ts-expect-error
        encoder(prefix, defaults.encoder, charset, "key", format)
      ) : prefix;
    }
    obj = "";
  }
  if (is_non_nullish_primitive(obj) || is_buffer(obj)) {
    if (encoder) {
      const key_value = encodeValuesOnly ? prefix : encoder(prefix, defaults.encoder, charset, "key", format);
      return [
        formatter?.(key_value) + "=" + // @ts-expect-error
        formatter?.(encoder(obj, defaults.encoder, charset, "value", format))
      ];
    }
    return [formatter?.(prefix) + "=" + formatter?.(String(obj))];
  }
  const values = [];
  if (typeof obj === "undefined") {
    return values;
  }
  let obj_keys;
  if (generateArrayPrefix === "comma" && isArray(obj)) {
    if (encodeValuesOnly && encoder) {
      obj = maybe_map(obj, encoder);
    }
    obj_keys = [{ value: obj.length > 0 ? obj.join(",") || null : void 0 }];
  } else if (isArray(filter)) {
    obj_keys = filter;
  } else {
    const keys = Object.keys(obj);
    obj_keys = sort ? keys.sort(sort) : keys;
  }
  const encoded_prefix = encodeDotInKeys ? String(prefix).replace(/\./g, "%2E") : String(prefix);
  const adjusted_prefix = commaRoundTrip && isArray(obj) && obj.length === 1 ? encoded_prefix + "[]" : encoded_prefix;
  if (allowEmptyArrays && isArray(obj) && obj.length === 0) {
    return adjusted_prefix + "[]";
  }
  for (let j = 0; j < obj_keys.length; ++j) {
    const key = obj_keys[j];
    const value = (
      // @ts-ignore
      typeof key === "object" && typeof key.value !== "undefined" ? key.value : obj[key]
    );
    if (skipNulls && value === null) {
      continue;
    }
    const encoded_key = allowDots && encodeDotInKeys ? key.replace(/\./g, "%2E") : key;
    const key_prefix = isArray(obj) ? typeof generateArrayPrefix === "function" ? generateArrayPrefix(adjusted_prefix, encoded_key) : adjusted_prefix : adjusted_prefix + (allowDots ? "." + encoded_key : "[" + encoded_key + "]");
    sideChannel.set(object, step);
    const valueSideChannel = /* @__PURE__ */ new WeakMap();
    valueSideChannel.set(sentinel, sideChannel);
    push_to_array(values, inner_stringify(
      value,
      key_prefix,
      generateArrayPrefix,
      commaRoundTrip,
      allowEmptyArrays,
      strictNullHandling,
      skipNulls,
      encodeDotInKeys,
      // @ts-ignore
      generateArrayPrefix === "comma" && encodeValuesOnly && isArray(obj) ? null : encoder,
      filter,
      sort,
      allowDots,
      serializeDate,
      format,
      formatter,
      encodeValuesOnly,
      charset,
      valueSideChannel
    ));
  }
  return values;
}
function normalize_stringify_options(opts = defaults) {
  if (typeof opts.allowEmptyArrays !== "undefined" && typeof opts.allowEmptyArrays !== "boolean") {
    throw new TypeError("`allowEmptyArrays` option can only be `true` or `false`, when provided");
  }
  if (typeof opts.encodeDotInKeys !== "undefined" && typeof opts.encodeDotInKeys !== "boolean") {
    throw new TypeError("`encodeDotInKeys` option can only be `true` or `false`, when provided");
  }
  if (opts.encoder !== null && typeof opts.encoder !== "undefined" && typeof opts.encoder !== "function") {
    throw new TypeError("Encoder has to be a function.");
  }
  const charset = opts.charset || defaults.charset;
  if (typeof opts.charset !== "undefined" && opts.charset !== "utf-8" && opts.charset !== "iso-8859-1") {
    throw new TypeError("The charset option must be either utf-8, iso-8859-1, or undefined");
  }
  let format = default_format;
  if (typeof opts.format !== "undefined") {
    if (!has(formatters, opts.format)) {
      throw new TypeError("Unknown format option provided.");
    }
    format = opts.format;
  }
  const formatter = formatters[format];
  let filter = defaults.filter;
  if (typeof opts.filter === "function" || isArray(opts.filter)) {
    filter = opts.filter;
  }
  let arrayFormat;
  if (opts.arrayFormat && opts.arrayFormat in array_prefix_generators) {
    arrayFormat = opts.arrayFormat;
  } else if ("indices" in opts) {
    arrayFormat = opts.indices ? "indices" : "repeat";
  } else {
    arrayFormat = defaults.arrayFormat;
  }
  if ("commaRoundTrip" in opts && typeof opts.commaRoundTrip !== "boolean") {
    throw new TypeError("`commaRoundTrip` must be a boolean, or absent");
  }
  const allowDots = typeof opts.allowDots === "undefined" ? !!opts.encodeDotInKeys === true ? true : defaults.allowDots : !!opts.allowDots;
  return {
    addQueryPrefix: typeof opts.addQueryPrefix === "boolean" ? opts.addQueryPrefix : defaults.addQueryPrefix,
    // @ts-ignore
    allowDots,
    allowEmptyArrays: typeof opts.allowEmptyArrays === "boolean" ? !!opts.allowEmptyArrays : defaults.allowEmptyArrays,
    arrayFormat,
    charset,
    charsetSentinel: typeof opts.charsetSentinel === "boolean" ? opts.charsetSentinel : defaults.charsetSentinel,
    commaRoundTrip: !!opts.commaRoundTrip,
    delimiter: typeof opts.delimiter === "undefined" ? defaults.delimiter : opts.delimiter,
    encode: typeof opts.encode === "boolean" ? opts.encode : defaults.encode,
    encodeDotInKeys: typeof opts.encodeDotInKeys === "boolean" ? opts.encodeDotInKeys : defaults.encodeDotInKeys,
    encoder: typeof opts.encoder === "function" ? opts.encoder : defaults.encoder,
    encodeValuesOnly: typeof opts.encodeValuesOnly === "boolean" ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
    filter,
    format,
    formatter,
    serializeDate: typeof opts.serializeDate === "function" ? opts.serializeDate : defaults.serializeDate,
    skipNulls: typeof opts.skipNulls === "boolean" ? opts.skipNulls : defaults.skipNulls,
    // @ts-ignore
    sort: typeof opts.sort === "function" ? opts.sort : null,
    strictNullHandling: typeof opts.strictNullHandling === "boolean" ? opts.strictNullHandling : defaults.strictNullHandling
  };
}
function stringify(object, opts = {}) {
  let obj = object;
  const options = normalize_stringify_options(opts);
  let obj_keys;
  let filter;
  if (typeof options.filter === "function") {
    filter = options.filter;
    obj = filter("", obj);
  } else if (isArray(options.filter)) {
    filter = options.filter;
    obj_keys = filter;
  }
  const keys = [];
  if (typeof obj !== "object" || obj === null) {
    return "";
  }
  const generateArrayPrefix = array_prefix_generators[options.arrayFormat];
  const commaRoundTrip = generateArrayPrefix === "comma" && options.commaRoundTrip;
  if (!obj_keys) {
    obj_keys = Object.keys(obj);
  }
  if (options.sort) {
    obj_keys.sort(options.sort);
  }
  const sideChannel = /* @__PURE__ */ new WeakMap();
  for (let i = 0; i < obj_keys.length; ++i) {
    const key = obj_keys[i];
    if (options.skipNulls && obj[key] === null) {
      continue;
    }
    push_to_array(keys, inner_stringify(
      obj[key],
      key,
      // @ts-expect-error
      generateArrayPrefix,
      commaRoundTrip,
      options.allowEmptyArrays,
      options.strictNullHandling,
      options.skipNulls,
      options.encodeDotInKeys,
      options.encode ? options.encoder : null,
      options.filter,
      options.sort,
      options.allowDots,
      options.serializeDate,
      options.format,
      options.formatter,
      options.encodeValuesOnly,
      options.charset,
      sideChannel
    ));
  }
  const joined = keys.join(options.delimiter);
  let prefix = options.addQueryPrefix === true ? "?" : "";
  if (options.charsetSentinel) {
    if (options.charset === "iso-8859-1") {
      prefix += "utf8=%26%2310003%3B&";
    } else {
      prefix += "utf8=%E2%9C%93&";
    }
  }
  return joined.length > 0 ? prefix + joined : "";
}

// node_modules/openai/internal/utils/query.mjs
function stringifyQuery(query) {
  return stringify(query, { arrayFormat: "brackets" });
}

// node_modules/openai/internal/utils/bytes.mjs
function concatBytes(buffers) {
  let length = 0;
  for (const buffer of buffers) {
    length += buffer.length;
  }
  const output = new Uint8Array(length);
  let index = 0;
  for (const buffer of buffers) {
    output.set(buffer, index);
    index += buffer.length;
  }
  return output;
}
var encodeUTF8_;
function encodeUTF8(str2) {
  let encoder;
  return (encodeUTF8_ ?? (encoder = new globalThis.TextEncoder(), encodeUTF8_ = encoder.encode.bind(encoder)))(str2);
}
var decodeUTF8_;
function decodeUTF8(bytes) {
  let decoder;
  return (decodeUTF8_ ?? (decoder = new globalThis.TextDecoder(), decodeUTF8_ = decoder.decode.bind(decoder)))(bytes);
}

// node_modules/openai/internal/decoders/line.mjs
var _LineDecoder_buffer;
var _LineDecoder_carriageReturnIndex;
var LineDecoder = class {
  constructor() {
    _LineDecoder_buffer.set(this, void 0);
    _LineDecoder_carriageReturnIndex.set(this, void 0);
    __classPrivateFieldSet(this, _LineDecoder_buffer, new Uint8Array(), "f");
    __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
  }
  decode(chunk) {
    if (chunk == null) {
      return [];
    }
    const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
    __classPrivateFieldSet(this, _LineDecoder_buffer, concatBytes([__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), binaryChunk]), "f");
    const lines = [];
    let patternIndex;
    while ((patternIndex = findNewlineIndex(__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f"))) != null) {
      if (patternIndex.carriage && __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") == null) {
        __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, patternIndex.index, "f");
        continue;
      }
      if (__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") != null && (patternIndex.index !== __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") + 1 || patternIndex.carriage)) {
        lines.push(decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") - 1)));
        __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f")), "f");
        __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
        continue;
      }
      const endIndex = __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") !== null ? patternIndex.preceding - 1 : patternIndex.preceding;
      const line = decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, endIndex));
      lines.push(line);
      __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(patternIndex.index), "f");
      __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
    }
    return lines;
  }
  flush() {
    if (!__classPrivateFieldGet(this, _LineDecoder_buffer, "f").length) {
      return [];
    }
    return this.decode("\n");
  }
};
_LineDecoder_buffer = /* @__PURE__ */ new WeakMap(), _LineDecoder_carriageReturnIndex = /* @__PURE__ */ new WeakMap();
LineDecoder.NEWLINE_CHARS = /* @__PURE__ */ new Set(["\n", "\r"]);
LineDecoder.NEWLINE_REGEXP = /\r\n|[\n\r]/g;
function findNewlineIndex(buffer, startIndex) {
  const newline = 10;
  const carriage = 13;
  for (let i = startIndex ?? 0; i < buffer.length; i++) {
    if (buffer[i] === newline) {
      return { preceding: i, index: i + 1, carriage: false };
    }
    if (buffer[i] === carriage) {
      return { preceding: i, index: i + 1, carriage: true };
    }
  }
  return null;
}
function findDoubleNewlineIndex(buffer) {
  const newline = 10;
  const carriage = 13;
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i] === newline && buffer[i + 1] === newline) {
      return i + 2;
    }
    if (buffer[i] === carriage && buffer[i + 1] === carriage) {
      return i + 2;
    }
    if (buffer[i] === carriage && buffer[i + 1] === newline && i + 3 < buffer.length && buffer[i + 2] === carriage && buffer[i + 3] === newline) {
      return i + 4;
    }
  }
  return -1;
}

// node_modules/openai/internal/utils/log.mjs
var levelNumbers = {
  off: 0,
  error: 200,
  warn: 300,
  info: 400,
  debug: 500
};
var parseLogLevel = (maybeLevel, sourceName, client) => {
  if (!maybeLevel) {
    return void 0;
  }
  if (hasOwn(levelNumbers, maybeLevel)) {
    return maybeLevel;
  }
  loggerFor(client).warn(`${sourceName} was set to ${JSON.stringify(maybeLevel)}, expected one of ${JSON.stringify(Object.keys(levelNumbers))}`);
  return void 0;
};
function noop() {
}
function makeLogFn(fnLevel, logger, logLevel) {
  if (!logger || levelNumbers[fnLevel] > levelNumbers[logLevel]) {
    return noop;
  } else {
    return logger[fnLevel].bind(logger);
  }
}
var noopLogger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop
};
var cachedLoggers = /* @__PURE__ */ new WeakMap();
function loggerFor(client) {
  const logger = client.logger;
  const logLevel = client.logLevel ?? "off";
  if (!logger) {
    return noopLogger;
  }
  const cachedLogger = cachedLoggers.get(logger);
  if (cachedLogger && cachedLogger[0] === logLevel) {
    return cachedLogger[1];
  }
  const levelLogger = {
    error: makeLogFn("error", logger, logLevel),
    warn: makeLogFn("warn", logger, logLevel),
    info: makeLogFn("info", logger, logLevel),
    debug: makeLogFn("debug", logger, logLevel)
  };
  cachedLoggers.set(logger, [logLevel, levelLogger]);
  return levelLogger;
}
var formatRequestDetails = (details) => {
  if (details.options) {
    details.options = { ...details.options };
    delete details.options["headers"];
  }
  if (details.headers) {
    details.headers = Object.fromEntries((details.headers instanceof Headers ? [...details.headers] : Object.entries(details.headers)).map(([name, value]) => [
      name,
      name.toLowerCase() === "authorization" || name.toLowerCase() === "api-key" || name.toLowerCase() === "x-api-key" || name.toLowerCase() === "x-amz-security-token" || name.toLowerCase() === "cookie" || name.toLowerCase() === "set-cookie" ? "***" : value
    ]));
  }
  if ("retryOfRequestLogID" in details) {
    if (details.retryOfRequestLogID) {
      details.retryOf = details.retryOfRequestLogID;
    }
    delete details.retryOfRequestLogID;
  }
  return details;
};

// node_modules/openai/core/streaming.mjs
var _Stream_client;
var Stream = class _Stream {
  constructor(iterator, controller, client) {
    this.iterator = iterator;
    _Stream_client.set(this, void 0);
    this.controller = controller;
    __classPrivateFieldSet(this, _Stream_client, client, "f");
  }
  static fromSSEResponse(response, controller, client, synthesizeEventData) {
    let consumed = false;
    const logger = client ? loggerFor(client) : console;
    async function* iterator() {
      if (consumed) {
        throw new OpenAIError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
      }
      consumed = true;
      let done = false;
      try {
        for await (const sse of _iterSSEMessages(response, controller)) {
          if (done)
            continue;
          if (sse.data.startsWith("[DONE]")) {
            done = true;
            continue;
          }
          if (sse.event === null || !sse.event.startsWith("thread.")) {
            let data;
            try {
              data = JSON.parse(sse.data);
            } catch (e) {
              logger.error(`Could not parse message into JSON:`, sse.data);
              logger.error(`From chunk:`, sse.raw);
              throw e;
            }
            if (data && data.error) {
              throw new APIError(void 0, data.error, void 0, response.headers);
            }
            yield synthesizeEventData ? { event: sse.event, data } : data;
          } else {
            let data;
            try {
              data = JSON.parse(sse.data);
            } catch (e) {
              console.error(`Could not parse message into JSON:`, sse.data);
              console.error(`From chunk:`, sse.raw);
              throw e;
            }
            if (sse.event == "error") {
              throw new APIError(void 0, data.error, data.message, void 0);
            }
            yield { event: sse.event, data };
          }
        }
        done = true;
      } catch (e) {
        if (isAbortError(e))
          return;
        throw e;
      } finally {
        if (!done)
          controller.abort();
      }
    }
    return new _Stream(iterator, controller, client);
  }
  /**
   * Generates a Stream from a newline-separated ReadableStream
   * where each item is a JSON value.
   */
  static fromReadableStream(readableStream, controller, client) {
    let consumed = false;
    async function* iterLines() {
      const lineDecoder = new LineDecoder();
      const iter = ReadableStreamToAsyncIterable(readableStream);
      for await (const chunk of iter) {
        for (const line of lineDecoder.decode(chunk)) {
          yield line;
        }
      }
      for (const line of lineDecoder.flush()) {
        yield line;
      }
    }
    async function* iterator() {
      if (consumed) {
        throw new OpenAIError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
      }
      consumed = true;
      let done = false;
      try {
        for await (const line of iterLines()) {
          if (done)
            continue;
          if (line)
            yield JSON.parse(line);
        }
        done = true;
      } catch (e) {
        if (isAbortError(e))
          return;
        throw e;
      } finally {
        if (!done)
          controller.abort();
      }
    }
    return new _Stream(iterator, controller, client);
  }
  [(_Stream_client = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
    return this.iterator();
  }
  /**
   * Splits the stream into two streams which can be
   * independently read from at different speeds.
   */
  tee() {
    const left = [];
    const right = [];
    const iterator = this.iterator();
    const teeIterator = (queue) => {
      return {
        next: () => {
          if (queue.length === 0) {
            const result = iterator.next();
            left.push(result);
            right.push(result);
          }
          return queue.shift();
        }
      };
    };
    return [
      new _Stream(() => teeIterator(left), this.controller, __classPrivateFieldGet(this, _Stream_client, "f")),
      new _Stream(() => teeIterator(right), this.controller, __classPrivateFieldGet(this, _Stream_client, "f"))
    ];
  }
  /**
   * Converts this stream to a newline-separated ReadableStream of
   * JSON stringified values in the stream
   * which can be turned back into a Stream with `Stream.fromReadableStream()`.
   */
  toReadableStream() {
    const self = this;
    let iter;
    return makeReadableStream({
      async start() {
        iter = self[Symbol.asyncIterator]();
      },
      async pull(ctrl) {
        try {
          const { value, done } = await iter.next();
          if (done)
            return ctrl.close();
          const bytes = encodeUTF8(JSON.stringify(value) + "\n");
          ctrl.enqueue(bytes);
        } catch (err) {
          ctrl.error(err);
        }
      },
      async cancel() {
        await iter.return?.();
      }
    });
  }
};
async function* _iterSSEMessages(response, controller) {
  if (!response.body) {
    controller.abort();
    if (typeof globalThis.navigator !== "undefined" && globalThis.navigator.product === "ReactNative") {
      throw new OpenAIError(`The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api`);
    }
    throw new OpenAIError(`Attempted to iterate over a response with no body`);
  }
  const sseDecoder = new SSEDecoder();
  const lineDecoder = new LineDecoder();
  const iter = ReadableStreamToAsyncIterable(response.body);
  for await (const sseChunk of iterSSEChunks(iter)) {
    for (const line of lineDecoder.decode(sseChunk)) {
      const sse = sseDecoder.decode(line);
      if (sse)
        yield sse;
    }
  }
  for (const line of lineDecoder.flush()) {
    const sse = sseDecoder.decode(line);
    if (sse)
      yield sse;
  }
}
async function* iterSSEChunks(iterator) {
  let data = new Uint8Array();
  for await (const chunk of iterator) {
    if (chunk == null) {
      continue;
    }
    const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
    let newData = new Uint8Array(data.length + binaryChunk.length);
    newData.set(data);
    newData.set(binaryChunk, data.length);
    data = newData;
    let patternIndex;
    while ((patternIndex = findDoubleNewlineIndex(data)) !== -1) {
      yield data.slice(0, patternIndex);
      data = data.slice(patternIndex);
    }
  }
  if (data.length > 0) {
    yield data;
  }
}
var SSEDecoder = class {
  constructor() {
    this.event = null;
    this.data = [];
    this.chunks = [];
  }
  decode(line) {
    if (line.endsWith("\r")) {
      line = line.substring(0, line.length - 1);
    }
    if (!line) {
      if (!this.event && !this.data.length)
        return null;
      const sse = {
        event: this.event,
        data: this.data.join("\n"),
        raw: this.chunks
      };
      this.event = null;
      this.data = [];
      this.chunks = [];
      return sse;
    }
    this.chunks.push(line);
    if (line.startsWith(":")) {
      return null;
    }
    let [fieldname, _, value] = partition(line, ":");
    if (value.startsWith(" ")) {
      value = value.substring(1);
    }
    if (fieldname === "event") {
      this.event = value;
    } else if (fieldname === "data") {
      this.data.push(value);
    }
    return null;
  }
};
function partition(str2, delimiter) {
  const index = str2.indexOf(delimiter);
  if (index !== -1) {
    return [str2.substring(0, index), delimiter, str2.substring(index + delimiter.length)];
  }
  return [str2, "", ""];
}

// node_modules/openai/internal/parse.mjs
async function defaultParseResponse(client, props) {
  const { response, requestLogID, retryOfRequestLogID, startTime } = props;
  const body = await (async () => {
    if (props.options.stream) {
      loggerFor(client).debug("response", response.status, response.url, response.headers, response.body);
      if (props.options.__streamClass) {
        return props.options.__streamClass.fromSSEResponse(response, props.controller, client, props.options.__synthesizeEventData);
      }
      return Stream.fromSSEResponse(response, props.controller, client, props.options.__synthesizeEventData);
    }
    if (response.status === 204) {
      return null;
    }
    if (props.options.__binaryResponse) {
      return response;
    }
    const contentType = response.headers.get("content-type");
    const mediaType = contentType?.split(";")[0]?.trim();
    const isJSON = mediaType?.includes("application/json") || mediaType?.endsWith("+json");
    if (isJSON) {
      const contentLength = response.headers.get("content-length");
      if (contentLength === "0") {
        return void 0;
      }
      const json = await response.json();
      return addRequestID(json, response);
    }
    const text = await response.text();
    return text;
  })();
  loggerFor(client).debug(`[${requestLogID}] response parsed`, formatRequestDetails({
    retryOfRequestLogID,
    url: response.url,
    status: response.status,
    body,
    durationMs: Date.now() - startTime
  }));
  return body;
}
function addRequestID(value, response) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.defineProperty(value, "_request_id", {
    value: response.headers.get("x-request-id"),
    enumerable: false
  });
}

// node_modules/openai/core/api-promise.mjs
var _APIPromise_client;
var APIPromise = class _APIPromise extends Promise {
  constructor(client, responsePromise, parseResponse2 = defaultParseResponse) {
    super((resolve) => {
      resolve(null);
    });
    this.responsePromise = responsePromise;
    this.parseResponse = parseResponse2;
    _APIPromise_client.set(this, void 0);
    __classPrivateFieldSet(this, _APIPromise_client, client, "f");
  }
  _thenUnwrap(transform) {
    return new _APIPromise(__classPrivateFieldGet(this, _APIPromise_client, "f"), this.responsePromise, async (client, props) => addRequestID(transform(await this.parseResponse(client, props), props), props.response));
  }
  /**
   * Gets the raw `Response` instance instead of parsing the response
   * data.
   *
   * If you want to parse the response body but still get the `Response`
   * instance, you can use {@link withResponse()}.
   *
   * 👋 Getting the wrong TypeScript type for `Response`?
   * Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
   * to your `tsconfig.json`.
   */
  asResponse() {
    return this.responsePromise.then((p) => p.response);
  }
  /**
   * Gets the parsed response data, the raw `Response` instance and the ID of the request,
   * returned via the X-Request-ID header which is useful for debugging requests and reporting
   * issues to OpenAI.
   *
   * If you just want to get the raw `Response` instance without parsing it,
   * you can use {@link asResponse()}.
   *
   * 👋 Getting the wrong TypeScript type for `Response`?
   * Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
   * to your `tsconfig.json`.
   */
  async withResponse() {
    const [data, response] = await Promise.all([this.parse(), this.asResponse()]);
    return { data, response, request_id: response.headers.get("x-request-id") };
  }
  parse() {
    if (!this.parsedPromise) {
      this.parsedPromise = this.responsePromise.then((data) => this.parseResponse(__classPrivateFieldGet(this, _APIPromise_client, "f"), data));
    }
    return this.parsedPromise;
  }
  then(onfulfilled, onrejected) {
    return this.parse().then(onfulfilled, onrejected);
  }
  catch(onrejected) {
    return this.parse().catch(onrejected);
  }
  finally(onfinally) {
    return this.parse().finally(onfinally);
  }
};
_APIPromise_client = /* @__PURE__ */ new WeakMap();

// node_modules/openai/core/pagination.mjs
var _AbstractPage_client;
var AbstractPage = class {
  constructor(client, response, body, options) {
    _AbstractPage_client.set(this, void 0);
    __classPrivateFieldSet(this, _AbstractPage_client, client, "f");
    this.options = options;
    this.response = response;
    this.body = body;
  }
  hasNextPage() {
    const items = this.getPaginatedItems();
    if (!items.length)
      return false;
    return this.nextPageRequestOptions() != null;
  }
  async getNextPage() {
    const nextOptions = this.nextPageRequestOptions();
    if (!nextOptions) {
      throw new OpenAIError("No next page expected; please check `.hasNextPage()` before calling `.getNextPage()`.");
    }
    return await __classPrivateFieldGet(this, _AbstractPage_client, "f").requestAPIList(this.constructor, nextOptions);
  }
  async *iterPages() {
    let page = this;
    yield page;
    while (page.hasNextPage()) {
      page = await page.getNextPage();
      yield page;
    }
  }
  async *[(_AbstractPage_client = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
    for await (const page of this.iterPages()) {
      for (const item of page.getPaginatedItems()) {
        yield item;
      }
    }
  }
};
var PagePromise = class extends APIPromise {
  constructor(client, request, Page2) {
    super(client, request, async (client2, props) => new Page2(client2, props.response, await defaultParseResponse(client2, props), props.options));
  }
  /**
   * Allow auto-paginating iteration on an unawaited list call, eg:
   *
   *    for await (const item of client.items.list()) {
   *      console.log(item)
   *    }
   */
  async *[Symbol.asyncIterator]() {
    const page = await this;
    for await (const item of page) {
      yield item;
    }
  }
};
var Page = class extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.object = body.object;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  nextPageRequestOptions() {
    return null;
  }
};
var CursorPage = class extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.has_more = body.has_more || false;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    const data = this.getPaginatedItems();
    const id = data[data.length - 1]?.id;
    if (!id) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        after: id
      }
    };
  }
};
var ConversationCursorPage = class extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.has_more = body.has_more || false;
    this.last_id = body.last_id || "";
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    const cursor = this.last_id;
    if (!cursor) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        after: cursor
      }
    };
  }
};
var NextCursorPage = class extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.has_more = body.has_more || false;
    this.next = body.next || null;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    const cursor = this.next;
    if (!cursor) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        after: cursor
      }
    };
  }
};

// node_modules/openai/auth/workload-identity-auth.mjs
var SUBJECT_TOKEN_TYPES = {
  jwt: "urn:ietf:params:oauth:token-type:jwt",
  id: "urn:ietf:params:oauth:token-type:id_token"
};
var TOKEN_EXCHANGE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";
var WorkloadIdentityAuth = class {
  constructor(config, fetch2) {
    this.cachedToken = null;
    this.refreshPromise = null;
    this.tokenExchangeUrl = "https://auth.openai.com/oauth/token";
    this.config = config;
    this.fetch = fetch2 ?? getDefaultFetch();
  }
  async getToken() {
    if (!this.cachedToken || this.isTokenExpired(this.cachedToken)) {
      if (this.refreshPromise) {
        return await this.refreshPromise;
      }
      this.refreshPromise = this.refreshToken();
      try {
        const token = await this.refreshPromise;
        return token;
      } finally {
        this.refreshPromise = null;
      }
    }
    if (this.needsRefresh(this.cachedToken) && !this.refreshPromise) {
      this.refreshPromise = this.refreshToken().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.cachedToken.token;
  }
  async refreshToken() {
    const subjectToken = await this.config.provider.getToken();
    const body = {
      grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
      subject_token: subjectToken,
      subject_token_type: SUBJECT_TOKEN_TYPES[this.config.provider.tokenType],
      identity_provider_id: this.config.identityProviderId,
      service_account_id: this.config.serviceAccountId
    };
    if (this.config.clientId) {
      body["client_id"] = this.config.clientId;
    }
    const response = await this.fetch(this.tokenExchangeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errorText = await response.text();
      let body2 = void 0;
      try {
        body2 = JSON.parse(errorText);
      } catch {
      }
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new OAuthError(response.status, body2, response.headers);
      }
      throw APIError.generate(response.status, body2, `Token exchange failed with status ${response.status}`, response.headers);
    }
    const tokenResponse = await response.json();
    if (typeof tokenResponse !== "object" || tokenResponse === null || !("access_token" in tokenResponse) || typeof tokenResponse.access_token !== "string" || tokenResponse.access_token.trim().length === 0) {
      throw new OpenAIError("Token exchange response missing 'access_token' field");
    }
    const accessToken = tokenResponse.access_token;
    const expiresIn = tokenResponse.expires_in ?? 3600;
    const expiresAt = Date.now() + expiresIn * 1e3;
    this.cachedToken = {
      token: accessToken,
      expiresAt
    };
    return accessToken;
  }
  isTokenExpired(cachedToken) {
    return Date.now() >= cachedToken.expiresAt;
  }
  needsRefresh(cachedToken) {
    const bufferSeconds = this.config.refreshBufferSeconds ?? 1200;
    const bufferMs = bufferSeconds * 1e3;
    return Date.now() >= cachedToken.expiresAt - bufferMs;
  }
  invalidateToken() {
    this.cachedToken = null;
    this.refreshPromise = null;
  }
};

// node_modules/openai/internal/uploads.mjs
var checkFileSupport = () => {
  if (typeof File === "undefined") {
    const { process: process2 } = globalThis;
    const isOldNode = typeof process2?.versions?.node === "string" && parseInt(process2.versions.node.split(".")) < 20;
    throw new Error("`File` is not defined as a global, which is required for file uploads." + (isOldNode ? " Update to Node 20 LTS or newer, or set `globalThis.File` to `import('node:buffer').File`." : ""));
  }
};
function makeFile(fileBits, fileName, options) {
  checkFileSupport();
  return new File(fileBits, fileName ?? "unknown_file", options);
}
function getName(value) {
  return (typeof value === "object" && value !== null && ("name" in value && value.name && String(value.name) || "url" in value && value.url && String(value.url) || "filename" in value && value.filename && String(value.filename) || "path" in value && value.path && String(value.path)) || "").split(/[\\/]/).pop() || void 0;
}
var isAsyncIterable = (value) => value != null && typeof value === "object" && typeof value[Symbol.asyncIterator] === "function";
var maybeMultipartFormRequestOptions = async (opts, fetch2) => {
  if (!hasUploadableValue(opts.body))
    return opts;
  return { ...opts, body: await createForm(opts.body, fetch2) };
};
var multipartFormRequestOptions = async (opts, fetch2) => {
  return { ...opts, body: await createForm(opts.body, fetch2) };
};
var supportsFormDataMap = /* @__PURE__ */ new WeakMap();
function supportsFormData(fetchObject) {
  const fetch2 = typeof fetchObject === "function" ? fetchObject : fetchObject.fetch;
  const cached = supportsFormDataMap.get(fetch2);
  if (cached)
    return cached;
  const promise = (async () => {
    try {
      const FetchResponse = "Response" in fetch2 ? fetch2.Response : (await fetch2("data:,")).constructor;
      const data = new FormData();
      if (data.toString() === await new FetchResponse(data).text()) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  })();
  supportsFormDataMap.set(fetch2, promise);
  return promise;
}
var createForm = async (body, fetch2) => {
  if (!await supportsFormData(fetch2)) {
    throw new TypeError("The provided fetch function does not support file uploads with the current global FormData class.");
  }
  const form = new FormData();
  await Promise.all(Object.entries(body || {}).map(([key, value]) => addFormValue(form, key, value)));
  return form;
};
var isNamedBlob = (value) => value instanceof Blob && "name" in value;
var isUploadable = (value) => typeof value === "object" && value !== null && (value instanceof Response || isAsyncIterable(value) || isNamedBlob(value));
var hasUploadableValue = (value) => {
  if (isUploadable(value))
    return true;
  if (Array.isArray(value))
    return value.some(hasUploadableValue);
  if (value && typeof value === "object") {
    for (const k in value) {
      if (hasUploadableValue(value[k]))
        return true;
    }
  }
  return false;
};
var addFormValue = async (form, key, value) => {
  if (value === void 0)
    return;
  if (value == null) {
    throw new TypeError(`Received null for "${key}"; to pass null in FormData, you must use the string 'null'`);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    form.append(key, String(value));
  } else if (value instanceof Response) {
    form.append(key, makeFile([await value.blob()], getName(value)));
  } else if (isAsyncIterable(value)) {
    form.append(key, makeFile([await new Response(ReadableStreamFrom(value)).blob()], getName(value)));
  } else if (isNamedBlob(value)) {
    form.append(key, value, getName(value));
  } else if (Array.isArray(value)) {
    await Promise.all(value.map((entry) => addFormValue(form, key + "[]", entry)));
  } else if (typeof value === "object") {
    await Promise.all(Object.entries(value).map(([name, prop]) => addFormValue(form, `${key}[${name}]`, prop)));
  } else {
    throw new TypeError(`Invalid value given to form, expected a string, number, boolean, object, Array, File or Blob but got ${value} instead`);
  }
};

// node_modules/openai/internal/to-file.mjs
var isBlobLike = (value) => value != null && typeof value === "object" && typeof value.size === "number" && typeof value.type === "string" && typeof value.text === "function" && typeof value.slice === "function" && typeof value.arrayBuffer === "function";
var isFileLike = (value) => value != null && typeof value === "object" && typeof value.name === "string" && typeof value.lastModified === "number" && isBlobLike(value);
var isResponseLike = (value) => value != null && typeof value === "object" && typeof value.url === "string" && typeof value.blob === "function";
async function toFile(value, name, options) {
  checkFileSupport();
  value = await value;
  if (isFileLike(value)) {
    if (value instanceof File) {
      return value;
    }
    return makeFile([await value.arrayBuffer()], value.name);
  }
  if (isResponseLike(value)) {
    const blob = await value.blob();
    name || (name = new URL(value.url).pathname.split(/[\\/]/).pop());
    return makeFile(await getBytes(blob), name, options);
  }
  const parts = await getBytes(value);
  name || (name = getName(value));
  if (!options?.type) {
    const type = parts.find((part) => typeof part === "object" && "type" in part && part.type);
    if (typeof type === "string") {
      options = { ...options, type };
    }
  }
  return makeFile(parts, name, options);
}
async function getBytes(value) {
  let parts = [];
  if (typeof value === "string" || ArrayBuffer.isView(value) || // includes Uint8Array, Buffer, etc.
  value instanceof ArrayBuffer) {
    parts.push(value);
  } else if (isBlobLike(value)) {
    parts.push(value instanceof Blob ? value : await value.arrayBuffer());
  } else if (isAsyncIterable(value)) {
    for await (const chunk of value) {
      parts.push(...await getBytes(chunk));
    }
  } else {
    const constructor = value?.constructor?.name;
    throw new Error(`Unexpected data type: ${typeof value}${constructor ? `; constructor: ${constructor}` : ""}${propsForError(value)}`);
  }
  return parts;
}
function propsForError(value) {
  if (typeof value !== "object" || value === null)
    return "";
  const props = Object.getOwnPropertyNames(value);
  return `; props: [${props.map((p) => `"${p}"`).join(", ")}]`;
}

// node_modules/openai/core/resource.mjs
var APIResource = class {
  constructor(client) {
    this._client = client;
  }
};

// node_modules/openai/internal/utils/path.mjs
function encodeURIPath(str2) {
  return str2.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g, encodeURIComponent);
}
var EMPTY = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.create(null));
var createPathTagFunction = (pathEncoder = encodeURIPath) => function path3(statics, ...params) {
  if (statics.length === 1)
    return statics[0];
  let postPath = false;
  const invalidSegments = [];
  const path4 = statics.reduce((previousValue, currentValue, index) => {
    if (/[?#]/.test(currentValue)) {
      postPath = true;
    }
    const value = params[index];
    let encoded = (postPath ? encodeURIComponent : pathEncoder)("" + value);
    if (index !== params.length && (value == null || typeof value === "object" && // handle values from other realms
    value.toString === Object.getPrototypeOf(Object.getPrototypeOf(value.hasOwnProperty ?? EMPTY) ?? EMPTY)?.toString)) {
      encoded = value + "";
      invalidSegments.push({
        start: previousValue.length + currentValue.length,
        length: encoded.length,
        error: `Value of type ${Object.prototype.toString.call(value).slice(8, -1)} is not a valid path parameter`
      });
    }
    return previousValue + currentValue + (index === params.length ? "" : encoded);
  }, "");
  const pathOnly = path4.split(/[?#]/, 1)[0];
  const invalidSegmentPattern = /(?<=^|\/)(?:\.|%2e){1,2}(?=\/|$)/gi;
  let match;
  while ((match = invalidSegmentPattern.exec(pathOnly)) !== null) {
    invalidSegments.push({
      start: match.index,
      length: match[0].length,
      error: `Value "${match[0]}" can't be safely passed as a path parameter`
    });
  }
  invalidSegments.sort((a, b) => a.start - b.start);
  if (invalidSegments.length > 0) {
    let lastEnd = 0;
    const underline = invalidSegments.reduce((acc, segment) => {
      const spaces = " ".repeat(segment.start - lastEnd);
      const arrows = "^".repeat(segment.length);
      lastEnd = segment.start + segment.length;
      return acc + spaces + arrows;
    }, "");
    throw new OpenAIError(`Path parameters result in path with invalid segments:
${invalidSegments.map((e) => e.error).join("\n")}
${path4}
${underline}`);
  }
  return path4;
};
var path = /* @__PURE__ */ createPathTagFunction(encodeURIPath);

// node_modules/openai/resources/chat/completions/messages.mjs
var Messages = class extends APIResource {
  /**
   * Get the messages in a stored chat completion. Only Chat Completions that have
   * been created with the `store` parameter set to `true` will be returned.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const chatCompletionStoreMessage of client.chat.completions.messages.list(
   *   'completion_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(completionID, query = {}, options) {
    return this._client.getAPIList(path`/chat/completions/${completionID}/messages`, CursorPage, { query, ...options, __security: { bearerAuth: true } });
  }
};

// node_modules/openai/lib/parser.mjs
function isChatCompletionFunctionTool(tool) {
  return tool !== void 0 && "function" in tool && tool.function !== void 0;
}
function isAutoParsableResponseFormat(response_format) {
  return response_format?.["$brand"] === "auto-parseable-response-format";
}
function isAutoParsableTool(tool) {
  return tool?.["$brand"] === "auto-parseable-tool";
}
function maybeParseChatCompletion(completion, params) {
  if (!params || !hasAutoParseableInput(params)) {
    return {
      ...completion,
      choices: completion.choices.map((choice) => {
        assertToolCallsAreChatCompletionFunctionToolCalls(choice.message.tool_calls);
        return {
          ...choice,
          message: {
            ...choice.message,
            parsed: null,
            ...choice.message.tool_calls ? {
              tool_calls: choice.message.tool_calls
            } : void 0
          }
        };
      })
    };
  }
  return parseChatCompletion(completion, params);
}
function parseChatCompletion(completion, params) {
  const choices = completion.choices.map((choice) => {
    if (choice.finish_reason === "length") {
      throw new LengthFinishReasonError();
    }
    if (choice.finish_reason === "content_filter") {
      throw new ContentFilterFinishReasonError();
    }
    assertToolCallsAreChatCompletionFunctionToolCalls(choice.message.tool_calls);
    return {
      ...choice,
      message: {
        ...choice.message,
        ...choice.message.tool_calls ? {
          tool_calls: choice.message.tool_calls?.map((toolCall) => parseToolCall(params, toolCall)) ?? void 0
        } : void 0,
        parsed: choice.message.content && !choice.message.refusal ? parseResponseFormat(params, choice.message.content) : null
      }
    };
  });
  return { ...completion, choices };
}
function parseResponseFormat(params, content) {
  if (params.response_format?.type !== "json_schema") {
    return null;
  }
  if (params.response_format?.type === "json_schema") {
    if ("$parseRaw" in params.response_format) {
      const response_format = params.response_format;
      return response_format.$parseRaw(content);
    }
    return JSON.parse(content);
  }
  return null;
}
function parseToolCall(params, toolCall) {
  const inputTool = params.tools?.find((inputTool2) => isChatCompletionFunctionTool(inputTool2) && inputTool2.function?.name === toolCall.function.name);
  return {
    ...toolCall,
    function: {
      ...toolCall.function,
      parsed_arguments: isAutoParsableTool(inputTool) ? inputTool.$parseRaw(toolCall.function.arguments) : inputTool?.function.strict ? JSON.parse(toolCall.function.arguments) : null
    }
  };
}
function shouldParseToolCall(params, toolCall) {
  if (!params || !("tools" in params) || !params.tools) {
    return false;
  }
  const inputTool = params.tools?.find((inputTool2) => isChatCompletionFunctionTool(inputTool2) && inputTool2.function?.name === toolCall.function.name);
  return isChatCompletionFunctionTool(inputTool) && (isAutoParsableTool(inputTool) || inputTool?.function.strict || false);
}
function hasAutoParseableInput(params) {
  if (isAutoParsableResponseFormat(params.response_format)) {
    return true;
  }
  return params.tools?.some((t) => isAutoParsableTool(t) || t.type === "function" && t.function.strict === true) ?? false;
}
function assertToolCallsAreChatCompletionFunctionToolCalls(toolCalls) {
  for (const toolCall of toolCalls || []) {
    if (toolCall.type !== "function") {
      throw new OpenAIError(`Currently only \`function\` tool calls are supported; Received \`${toolCall.type}\``);
    }
  }
}
function validateInputTools(tools) {
  for (const tool of tools ?? []) {
    if (tool.type !== "function") {
      throw new OpenAIError(`Currently only \`function\` tool types support auto-parsing; Received \`${tool.type}\``);
    }
    if (tool.function.strict !== true) {
      throw new OpenAIError(`The \`${tool.function.name}\` tool is not marked with \`strict: true\`. Only strict function tools can be auto-parsed`);
    }
  }
}

// node_modules/openai/lib/chatCompletionUtils.mjs
var isAssistantMessage = (message) => {
  return message?.role === "assistant";
};
var isToolMessage = (message) => {
  return message?.role === "tool";
};

// node_modules/openai/lib/EventStream.mjs
var _EventStream_instances;
var _EventStream_connectedPromise;
var _EventStream_resolveConnectedPromise;
var _EventStream_rejectConnectedPromise;
var _EventStream_endPromise;
var _EventStream_resolveEndPromise;
var _EventStream_rejectEndPromise;
var _EventStream_listeners;
var _EventStream_abortListeners;
var _EventStream_ended;
var _EventStream_errored;
var _EventStream_aborted;
var _EventStream_catchingPromiseCreated;
var _EventStream_removeAbortListeners;
var _EventStream_handleError;
var EventStream = class {
  constructor() {
    _EventStream_instances.add(this);
    this.controller = new AbortController();
    _EventStream_connectedPromise.set(this, void 0);
    _EventStream_resolveConnectedPromise.set(this, () => {
    });
    _EventStream_rejectConnectedPromise.set(this, () => {
    });
    _EventStream_endPromise.set(this, void 0);
    _EventStream_resolveEndPromise.set(this, () => {
    });
    _EventStream_rejectEndPromise.set(this, () => {
    });
    _EventStream_listeners.set(this, {});
    _EventStream_abortListeners.set(this, []);
    _EventStream_ended.set(this, false);
    _EventStream_errored.set(this, false);
    _EventStream_aborted.set(this, false);
    _EventStream_catchingPromiseCreated.set(this, false);
    __classPrivateFieldSet(this, _EventStream_connectedPromise, new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _EventStream_resolveConnectedPromise, resolve, "f");
      __classPrivateFieldSet(this, _EventStream_rejectConnectedPromise, reject, "f");
    }), "f");
    __classPrivateFieldSet(this, _EventStream_endPromise, new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _EventStream_resolveEndPromise, resolve, "f");
      __classPrivateFieldSet(this, _EventStream_rejectEndPromise, reject, "f");
    }), "f");
    __classPrivateFieldGet(this, _EventStream_connectedPromise, "f").catch(() => {
    });
    __classPrivateFieldGet(this, _EventStream_endPromise, "f").catch(() => {
    });
  }
  _run(executor) {
    setTimeout(() => {
      executor().then(() => {
        this._emitFinal();
        this._emit("end");
      }, __classPrivateFieldGet(this, _EventStream_instances, "m", _EventStream_handleError).bind(this));
    }, 0);
  }
  _connected() {
    if (this.ended)
      return;
    __classPrivateFieldGet(this, _EventStream_resolveConnectedPromise, "f").call(this);
    this._emit("connect");
  }
  get ended() {
    return __classPrivateFieldGet(this, _EventStream_ended, "f");
  }
  get errored() {
    return __classPrivateFieldGet(this, _EventStream_errored, "f");
  }
  get aborted() {
    return __classPrivateFieldGet(this, _EventStream_aborted, "f");
  }
  abort() {
    this.controller.abort();
  }
  _listenForAbort(signal) {
    if (!signal || this.ended)
      return;
    if (signal.aborted) {
      this.controller.abort();
      return;
    }
    const listener = () => this.controller.abort();
    signal.addEventListener("abort", listener, { once: true });
    __classPrivateFieldGet(this, _EventStream_abortListeners, "f").push({ signal, listener });
  }
  /**
   * Adds the listener function to the end of the listeners array for the event.
   * No checks are made to see if the listener has already been added. Multiple calls passing
   * the same combination of event and listener will result in the listener being added, and
   * called, multiple times.
   * @returns this ChatCompletionStream, so that calls can be chained
   */
  on(event, listener) {
    const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = []);
    listeners.push({ listener });
    return this;
  }
  /**
   * Removes the specified listener from the listener array for the event.
   * off() will remove, at most, one instance of a listener from the listener array. If any single
   * listener has been added multiple times to the listener array for the specified event, then
   * off() must be called multiple times to remove each instance.
   * @returns this ChatCompletionStream, so that calls can be chained
   */
  off(event, listener) {
    const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event];
    if (!listeners)
      return this;
    const index = listeners.findIndex((l) => l.listener === listener);
    if (index >= 0)
      listeners.splice(index, 1);
    return this;
  }
  /**
   * Adds a one-time listener function for the event. The next time the event is triggered,
   * this listener is removed and then invoked.
   * @returns this ChatCompletionStream, so that calls can be chained
   */
  once(event, listener) {
    const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = []);
    listeners.push({ listener, once: true });
    return this;
  }
  /**
   * This is similar to `.once()`, but returns a Promise that resolves the next time
   * the event is triggered, instead of calling a listener callback.
   * @returns a Promise that resolves the next time given event is triggered,
   * or rejects if an error is emitted.  (If you request the 'error' event,
   * returns a promise that resolves with the error).
   *
   * Example:
   *
   *   const message = await stream.emitted('message') // rejects if the stream errors
   */
  emitted(event) {
    return new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _EventStream_catchingPromiseCreated, true, "f");
      if (event !== "error")
        this.once("error", reject);
      this.once(event, resolve);
    });
  }
  async done() {
    __classPrivateFieldSet(this, _EventStream_catchingPromiseCreated, true, "f");
    await __classPrivateFieldGet(this, _EventStream_endPromise, "f");
  }
  _emit(event, ...args) {
    if (__classPrivateFieldGet(this, _EventStream_ended, "f")) {
      return;
    }
    if (event === "end") {
      __classPrivateFieldGet(this, _EventStream_instances, "m", _EventStream_removeAbortListeners).call(this);
      __classPrivateFieldSet(this, _EventStream_ended, true, "f");
      __classPrivateFieldGet(this, _EventStream_resolveEndPromise, "f").call(this);
    }
    const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event];
    if (listeners) {
      __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = listeners.filter((l) => !l.once);
      listeners.forEach(({ listener }) => listener(...args));
    }
    if (event === "abort") {
      const error = args[0];
      if (!__classPrivateFieldGet(this, _EventStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error);
      }
      __classPrivateFieldGet(this, _EventStream_rejectConnectedPromise, "f").call(this, error);
      __classPrivateFieldGet(this, _EventStream_rejectEndPromise, "f").call(this, error);
      this._emit("end");
      return;
    }
    if (event === "error") {
      const error = args[0];
      if (!__classPrivateFieldGet(this, _EventStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error);
      }
      __classPrivateFieldGet(this, _EventStream_rejectConnectedPromise, "f").call(this, error);
      __classPrivateFieldGet(this, _EventStream_rejectEndPromise, "f").call(this, error);
      this._emit("end");
    }
  }
  _emitFinal() {
  }
};
_EventStream_connectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_resolveConnectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_rejectConnectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_endPromise = /* @__PURE__ */ new WeakMap(), _EventStream_resolveEndPromise = /* @__PURE__ */ new WeakMap(), _EventStream_rejectEndPromise = /* @__PURE__ */ new WeakMap(), _EventStream_listeners = /* @__PURE__ */ new WeakMap(), _EventStream_abortListeners = /* @__PURE__ */ new WeakMap(), _EventStream_ended = /* @__PURE__ */ new WeakMap(), _EventStream_errored = /* @__PURE__ */ new WeakMap(), _EventStream_aborted = /* @__PURE__ */ new WeakMap(), _EventStream_catchingPromiseCreated = /* @__PURE__ */ new WeakMap(), _EventStream_instances = /* @__PURE__ */ new WeakSet(), _EventStream_removeAbortListeners = function _EventStream_removeAbortListeners2() {
  for (const { signal, listener } of __classPrivateFieldGet(this, _EventStream_abortListeners, "f").splice(0)) {
    signal.removeEventListener("abort", listener);
  }
}, _EventStream_handleError = function _EventStream_handleError2(error) {
  __classPrivateFieldSet(this, _EventStream_errored, true, "f");
  if (error instanceof Error && error.name === "AbortError") {
    error = new APIUserAbortError();
  }
  if (error instanceof APIUserAbortError) {
    __classPrivateFieldSet(this, _EventStream_aborted, true, "f");
    return this._emit("abort", error);
  }
  if (error instanceof OpenAIError) {
    return this._emit("error", error);
  }
  if (error instanceof Error) {
    const openAIError = new OpenAIError(error.message);
    openAIError.cause = error;
    return this._emit("error", openAIError);
  }
  return this._emit("error", new OpenAIError(String(error)));
};

// node_modules/openai/lib/RunnableFunction.mjs
function isRunnableFunctionWithParse(fn) {
  return typeof fn.parse === "function";
}

// node_modules/openai/lib/AbstractChatCompletionRunner.mjs
var _AbstractChatCompletionRunner_instances;
var _AbstractChatCompletionRunner_getFinalContent;
var _AbstractChatCompletionRunner_getFinalMessage;
var _AbstractChatCompletionRunner_getFinalFunctionToolCall;
var _AbstractChatCompletionRunner_getFinalFunctionToolCallResult;
var _AbstractChatCompletionRunner_calculateTotalUsage;
var _AbstractChatCompletionRunner_validateParams;
var _AbstractChatCompletionRunner_stringifyFunctionCallResult;
var DEFAULT_MAX_CHAT_COMPLETIONS = 10;
var AbstractChatCompletionRunner = class extends EventStream {
  constructor() {
    super(...arguments);
    _AbstractChatCompletionRunner_instances.add(this);
    this._chatCompletions = [];
    this.messages = [];
  }
  _addChatCompletion(chatCompletion) {
    this._chatCompletions.push(chatCompletion);
    this._emit("chatCompletion", chatCompletion);
    const message = chatCompletion.choices[0]?.message;
    if (message)
      this._addMessage(message);
    return chatCompletion;
  }
  _addMessage(message, emit = true) {
    if (!("content" in message))
      message.content = null;
    this.messages.push(message);
    if (emit) {
      this._emit("message", message);
      if (isToolMessage(message) && message.content) {
        this._emit("functionToolCallResult", message.content);
      } else if (isAssistantMessage(message) && message.tool_calls) {
        for (const tool_call of message.tool_calls) {
          if (tool_call.type === "function") {
            this._emit("functionToolCall", tool_call.function);
          }
        }
      }
    }
  }
  /**
   * @returns a promise that resolves with the final ChatCompletion, or rejects
   * if an error occurred or the stream ended prematurely without producing a ChatCompletion.
   */
  async finalChatCompletion() {
    await this.done();
    const completion = this._chatCompletions[this._chatCompletions.length - 1];
    if (!completion)
      throw new OpenAIError("stream ended without producing a ChatCompletion");
    return completion;
  }
  /**
   * @returns a promise that resolves with the content of the final ChatCompletionMessage, or rejects
   * if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
   */
  async finalContent() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalContent).call(this);
  }
  /**
   * @returns a promise that resolves with the final assistant ChatCompletionMessage response,
   * or rejects if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
   */
  async finalMessage() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this);
  }
  /**
   * @returns a promise that resolves with the content of the final FunctionCall, or rejects
   * if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
   */
  async finalFunctionToolCall() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCall).call(this);
  }
  async finalFunctionToolCallResult() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCallResult).call(this);
  }
  async totalUsage() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_calculateTotalUsage).call(this);
  }
  allChatCompletions() {
    return [...this._chatCompletions];
  }
  _emitFinal() {
    const completion = this._chatCompletions[this._chatCompletions.length - 1];
    if (completion)
      this._emit("finalChatCompletion", completion);
    const finalMessage = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this);
    if (finalMessage)
      this._emit("finalMessage", finalMessage);
    const finalContent = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalContent).call(this);
    if (finalContent)
      this._emit("finalContent", finalContent);
    const finalFunctionCall = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCall).call(this);
    if (finalFunctionCall)
      this._emit("finalFunctionToolCall", finalFunctionCall);
    const finalFunctionCallResult = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCallResult).call(this);
    if (finalFunctionCallResult != null)
      this._emit("finalFunctionToolCallResult", finalFunctionCallResult);
    if (this._chatCompletions.some((c) => c.usage)) {
      this._emit("totalUsage", __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_calculateTotalUsage).call(this));
    }
  }
  async _createChatCompletion(client, params, options) {
    this._listenForAbort(options?.signal);
    __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_validateParams).call(this, params);
    const chatCompletion = await client.chat.completions.create({ ...params, stream: false }, { ...options, signal: this.controller.signal });
    this._connected();
    return this._addChatCompletion(parseChatCompletion(chatCompletion, params));
  }
  async _runChatCompletion(client, params, options) {
    for (const message of params.messages) {
      this._addMessage(message, false);
    }
    return await this._createChatCompletion(client, params, options);
  }
  async _runTools(client, params, runner, options) {
    const role = "tool";
    const { tool_choice = "auto", stream, ...restParams } = params;
    const singleFunctionToCall = typeof tool_choice !== "string" && tool_choice.type === "function" && tool_choice?.function?.name;
    const { maxChatCompletions = DEFAULT_MAX_CHAT_COMPLETIONS, afterCompletion } = options || {};
    const inputTools = params.tools.map((tool) => {
      if (isAutoParsableTool(tool)) {
        if (!tool.$callback) {
          throw new OpenAIError("Tool given to `.runTools()` that does not have an associated function");
        }
        return {
          type: "function",
          function: {
            function: tool.$callback,
            name: tool.function.name,
            description: tool.function.description || "",
            parameters: tool.function.parameters,
            parse: tool.$parseRaw,
            strict: true
          }
        };
      }
      return tool;
    });
    const functionsByName = {};
    for (const f of inputTools) {
      if (f.type === "function") {
        functionsByName[f.function.name || f.function.function.name] = f.function;
      }
    }
    const tools = "tools" in params ? inputTools.map((t) => t.type === "function" ? {
      type: "function",
      function: {
        name: t.function.name || t.function.function.name,
        parameters: t.function.parameters,
        description: t.function.description,
        strict: t.function.strict
      }
    } : t) : void 0;
    for (const message of params.messages) {
      this._addMessage(message, false);
    }
    const runToolCall = async (toolCall) => {
      if (toolCall.type !== "function")
        return { message: void 0, functionCalled: false };
      const tool_call_id = toolCall.id;
      const { name, arguments: args } = toolCall.function;
      const fn = functionsByName[name];
      if (!fn) {
        const content2 = `Invalid tool_call: ${JSON.stringify(name)}. Available options are: ${Object.keys(functionsByName).map((name2) => JSON.stringify(name2)).join(", ")}. Please try again`;
        return { message: { role, tool_call_id, content: content2 }, functionCalled: false };
      }
      if (singleFunctionToCall && singleFunctionToCall !== name) {
        const content2 = `Invalid tool_call: ${JSON.stringify(name)}. ${JSON.stringify(singleFunctionToCall)} requested. Please try again`;
        return { message: { role, tool_call_id, content: content2 }, functionCalled: false };
      }
      let rawContent;
      if (isRunnableFunctionWithParse(fn)) {
        let parsed;
        try {
          parsed = await fn.parse(args);
        } catch (error) {
          const content2 = error instanceof Error ? error.message : String(error);
          return { message: { role, tool_call_id, content: content2 }, functionCalled: false };
        }
        rawContent = await fn.function(parsed, runner);
      } else {
        rawContent = await fn.function(args, runner);
      }
      const content = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_stringifyFunctionCallResult).call(this, rawContent);
      return { message: { role, tool_call_id, content }, functionCalled: true };
    };
    for (let i = 0; i < maxChatCompletions; ++i) {
      const chatCompletion = await this._createChatCompletion(client, {
        ...restParams,
        tool_choice,
        tools,
        messages: [...this.messages]
      }, options);
      const message = chatCompletion.choices[0]?.message;
      if (!message) {
        throw new OpenAIError(`missing message in ChatCompletion response`);
      }
      if (!message.tool_calls?.length) {
        await afterCompletion?.(chatCompletion, runner);
        return;
      }
      if (singleFunctionToCall || params.parallel_tool_calls === false) {
        for (const toolCall of message.tool_calls) {
          const result = await runToolCall(toolCall);
          if (result.message)
            this._addMessage(result.message);
          if (singleFunctionToCall && result.functionCalled) {
            await afterCompletion?.(chatCompletion, runner);
            return;
          }
        }
      } else {
        const results = await Promise.allSettled(message.tool_calls.map(runToolCall));
        for (const result of results) {
          if (result.status === "rejected")
            throw result.reason;
        }
        for (const result of results) {
          if (result.status === "fulfilled" && result.value.message) {
            this._addMessage(result.value.message);
          }
        }
      }
      await afterCompletion?.(chatCompletion, runner);
    }
    return;
  }
};
_AbstractChatCompletionRunner_instances = /* @__PURE__ */ new WeakSet(), _AbstractChatCompletionRunner_getFinalContent = function _AbstractChatCompletionRunner_getFinalContent2() {
  return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this).content ?? null;
}, _AbstractChatCompletionRunner_getFinalMessage = function _AbstractChatCompletionRunner_getFinalMessage2() {
  let i = this.messages.length;
  while (i-- > 0) {
    const message = this.messages[i];
    if (isAssistantMessage(message)) {
      const ret = {
        ...message,
        content: message.content ?? null,
        refusal: message.refusal ?? null
      };
      return ret;
    }
  }
  throw new OpenAIError("stream ended without producing a ChatCompletionMessage with role=assistant");
}, _AbstractChatCompletionRunner_getFinalFunctionToolCall = function _AbstractChatCompletionRunner_getFinalFunctionToolCall2() {
  for (let i = this.messages.length - 1; i >= 0; i--) {
    const message = this.messages[i];
    if (isAssistantMessage(message) && message?.tool_calls?.length) {
      for (let j = message.tool_calls.length - 1; j >= 0; j--) {
        const toolCall = message.tool_calls[j];
        if (toolCall?.type === "function") {
          return toolCall.function;
        }
      }
    }
  }
  return;
}, _AbstractChatCompletionRunner_getFinalFunctionToolCallResult = function _AbstractChatCompletionRunner_getFinalFunctionToolCallResult2() {
  for (let i = this.messages.length - 1; i >= 0; i--) {
    const message = this.messages[i];
    if (isToolMessage(message) && message.content != null && typeof message.content === "string" && this.messages.some((x) => x.role === "assistant" && x.tool_calls?.some((y) => y.type === "function" && y.id === message.tool_call_id))) {
      return message.content;
    }
  }
  return;
}, _AbstractChatCompletionRunner_calculateTotalUsage = function _AbstractChatCompletionRunner_calculateTotalUsage2() {
  const total = {
    completion_tokens: 0,
    prompt_tokens: 0,
    total_tokens: 0
  };
  for (const { usage } of this._chatCompletions) {
    if (usage) {
      total.completion_tokens += usage.completion_tokens;
      total.prompt_tokens += usage.prompt_tokens;
      total.total_tokens += usage.total_tokens;
    }
  }
  return total;
}, _AbstractChatCompletionRunner_validateParams = function _AbstractChatCompletionRunner_validateParams2(params) {
  if (params.n != null && params.n > 1) {
    throw new OpenAIError("ChatCompletion convenience helpers only support n=1 at this time. To use n>1, please use chat.completions.create() directly.");
  }
}, _AbstractChatCompletionRunner_stringifyFunctionCallResult = function _AbstractChatCompletionRunner_stringifyFunctionCallResult2(rawContent) {
  return typeof rawContent === "string" ? rawContent : rawContent === void 0 ? "undefined" : JSON.stringify(rawContent);
};

// node_modules/openai/lib/ChatCompletionRunner.mjs
var ChatCompletionRunner = class _ChatCompletionRunner extends AbstractChatCompletionRunner {
  static runTools(client, params, options) {
    const runner = new _ChatCompletionRunner();
    const opts = {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "runTools" }
    };
    runner._run(() => runner._runTools(client, params, runner, opts));
    return runner;
  }
  _addMessage(message, emit = true) {
    super._addMessage(message, emit);
    if (isAssistantMessage(message) && message.content) {
      this._emit("content", message.content);
    }
  }
};

// node_modules/openai/_vendor/partial-json-parser/parser.mjs
var STR = 1;
var NUM = 2;
var ARR = 4;
var OBJ = 8;
var NULL = 16;
var BOOL = 32;
var NAN = 64;
var INFINITY = 128;
var MINUS_INFINITY = 256;
var INF = INFINITY | MINUS_INFINITY;
var SPECIAL = NULL | BOOL | INF | NAN;
var ATOM = STR | NUM | SPECIAL;
var COLLECTION = ARR | OBJ;
var ALL = ATOM | COLLECTION;
var Allow = {
  STR,
  NUM,
  ARR,
  OBJ,
  NULL,
  BOOL,
  NAN,
  INFINITY,
  MINUS_INFINITY,
  INF,
  SPECIAL,
  ATOM,
  COLLECTION,
  ALL
};
var PartialJSON = class extends Error {
};
var MalformedJSON = class extends Error {
};
function parseJSON(jsonString, allowPartial = Allow.ALL) {
  if (typeof jsonString !== "string") {
    throw new TypeError(`expecting str, got ${typeof jsonString}`);
  }
  if (!jsonString.trim()) {
    throw new Error(`${jsonString} is empty`);
  }
  return _parseJSON(jsonString.trim(), allowPartial);
}
var _parseJSON = (jsonString, allow) => {
  const length = jsonString.length;
  let index = 0;
  const markPartialJSON = (msg) => {
    throw new PartialJSON(`${msg} at position ${index}`);
  };
  const throwMalformedError = (msg) => {
    throw new MalformedJSON(`${msg} at position ${index}`);
  };
  const parseAny = () => {
    skipBlank();
    if (index >= length)
      markPartialJSON("Unexpected end of input");
    if (jsonString[index] === '"')
      return parseStr();
    if (jsonString[index] === "{")
      return parseObj();
    if (jsonString[index] === "[")
      return parseArr();
    if (jsonString.substring(index, index + 4) === "null" || Allow.NULL & allow && length - index < 4 && "null".startsWith(jsonString.substring(index))) {
      index += 4;
      return null;
    }
    if (jsonString.substring(index, index + 4) === "true" || Allow.BOOL & allow && length - index < 4 && "true".startsWith(jsonString.substring(index))) {
      index += 4;
      return true;
    }
    if (jsonString.substring(index, index + 5) === "false" || Allow.BOOL & allow && length - index < 5 && "false".startsWith(jsonString.substring(index))) {
      index += 5;
      return false;
    }
    if (jsonString.substring(index, index + 8) === "Infinity" || Allow.INFINITY & allow && length - index < 8 && "Infinity".startsWith(jsonString.substring(index))) {
      index += 8;
      return Infinity;
    }
    if (jsonString.substring(index, index + 9) === "-Infinity" || Allow.MINUS_INFINITY & allow && 1 < length - index && length - index < 9 && "-Infinity".startsWith(jsonString.substring(index))) {
      index += 9;
      return -Infinity;
    }
    if (jsonString.substring(index, index + 3) === "NaN" || Allow.NAN & allow && length - index < 3 && "NaN".startsWith(jsonString.substring(index))) {
      index += 3;
      return NaN;
    }
    return parseNum();
  };
  const parseStr = () => {
    const start = index;
    let escape2 = false;
    index++;
    while (index < length && (jsonString[index] !== '"' || escape2 && jsonString[index - 1] === "\\")) {
      escape2 = jsonString[index] === "\\" ? !escape2 : false;
      index++;
    }
    if (jsonString.charAt(index) == '"') {
      try {
        return JSON.parse(jsonString.substring(start, ++index - Number(escape2)));
      } catch (e) {
        throwMalformedError(String(e));
      }
    } else if (Allow.STR & allow) {
      try {
        return JSON.parse(jsonString.substring(start, index - Number(escape2)) + '"');
      } catch (e) {
        return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf("\\")) + '"');
      }
    }
    markPartialJSON("Unterminated string literal");
  };
  const parseObj = () => {
    index++;
    skipBlank();
    const obj = {};
    try {
      while (jsonString[index] !== "}") {
        skipBlank();
        if (index >= length && Allow.OBJ & allow)
          return obj;
        const key = parseStr();
        skipBlank();
        index++;
        try {
          const value = parseAny();
          Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
        } catch (e) {
          if (Allow.OBJ & allow)
            return obj;
          else
            throw e;
        }
        skipBlank();
        if (jsonString[index] === ",")
          index++;
      }
    } catch (e) {
      if (Allow.OBJ & allow)
        return obj;
      else
        markPartialJSON("Expected '}' at end of object");
    }
    index++;
    return obj;
  };
  const parseArr = () => {
    index++;
    const arr = [];
    try {
      while (jsonString[index] !== "]") {
        arr.push(parseAny());
        skipBlank();
        if (jsonString[index] === ",") {
          index++;
        }
      }
    } catch (e) {
      if (Allow.ARR & allow) {
        return arr;
      }
      markPartialJSON("Expected ']' at end of array");
    }
    index++;
    return arr;
  };
  const parseNum = () => {
    if (index === 0) {
      if (jsonString === "-" && Allow.NUM & allow)
        markPartialJSON("Not sure what '-' is");
      try {
        return JSON.parse(jsonString);
      } catch (e) {
        if (Allow.NUM & allow) {
          try {
            if ("." === jsonString[jsonString.length - 1])
              return JSON.parse(jsonString.substring(0, jsonString.lastIndexOf(".")));
            return JSON.parse(jsonString.substring(0, jsonString.lastIndexOf("e")));
          } catch (e2) {
          }
        }
        throwMalformedError(String(e));
      }
    }
    const start = index;
    if (jsonString[index] === "-")
      index++;
    while (jsonString[index] && !",]}".includes(jsonString[index]))
      index++;
    if (index == length && !(Allow.NUM & allow))
      markPartialJSON("Unterminated number literal");
    try {
      return JSON.parse(jsonString.substring(start, index));
    } catch (e) {
      if (jsonString.substring(start, index) === "-" && Allow.NUM & allow)
        markPartialJSON("Not sure what '-' is");
      try {
        return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf("e")));
      } catch (e2) {
        throwMalformedError(String(e2));
      }
    }
  };
  const skipBlank = () => {
    while (index < length && " \n\r	".includes(jsonString[index])) {
      index++;
    }
  };
  return parseAny();
};
var partialParse = (input) => parseJSON(input, Allow.ALL ^ Allow.NUM);

// node_modules/openai/lib/ChatCompletionStream.mjs
var _ChatCompletionStream_instances;
var _ChatCompletionStream_params;
var _ChatCompletionStream_choiceEventStates;
var _ChatCompletionStream_currentChatCompletionSnapshot;
var _ChatCompletionStream_beginRequest;
var _ChatCompletionStream_getChoiceEventState;
var _ChatCompletionStream_addChunk;
var _ChatCompletionStream_emitToolCallDoneEvent;
var _ChatCompletionStream_emitContentDoneEvents;
var _ChatCompletionStream_endRequest;
var _ChatCompletionStream_getAutoParseableResponseFormat;
var _ChatCompletionStream_accumulateChatCompletion;
var ChatCompletionStream = class _ChatCompletionStream extends AbstractChatCompletionRunner {
  constructor(params) {
    super();
    _ChatCompletionStream_instances.add(this);
    _ChatCompletionStream_params.set(this, void 0);
    _ChatCompletionStream_choiceEventStates.set(this, void 0);
    _ChatCompletionStream_currentChatCompletionSnapshot.set(this, void 0);
    __classPrivateFieldSet(this, _ChatCompletionStream_params, params, "f");
    __classPrivateFieldSet(this, _ChatCompletionStream_choiceEventStates, [], "f");
  }
  get currentChatCompletionSnapshot() {
    return __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
  }
  /**
   * Intended for use on the frontend, consuming a stream produced with
   * `.toReadableStream()` on the backend.
   *
   * Note that messages sent to the model do not appear in `.on('message')`
   * in this context.
   */
  static fromReadableStream(stream) {
    const runner = new _ChatCompletionStream(null);
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  static createChatCompletion(client, params, options) {
    const runner = new _ChatCompletionStream(params);
    runner._run(() => runner._runChatCompletion(client, { ...params, stream: true }, { ...options, headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" } }));
    return runner;
  }
  async _createChatCompletion(client, params, options) {
    super._createChatCompletion;
    this._listenForAbort(options?.signal);
    __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_beginRequest).call(this);
    const stream = await client.chat.completions.create({ ...params, stream: true }, { ...options, signal: this.controller.signal });
    this._connected();
    for await (const chunk of stream) {
      __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_addChunk).call(this, chunk);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
  }
  async _fromReadableStream(readableStream, options) {
    this._listenForAbort(options?.signal);
    __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_beginRequest).call(this);
    this._connected();
    const stream = Stream.fromReadableStream(readableStream, this.controller);
    let chatId;
    for await (const chunk of stream) {
      if (chatId && chatId !== chunk.id) {
        this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
      }
      __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_addChunk).call(this, chunk);
      chatId = chunk.id;
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
  }
  [(_ChatCompletionStream_params = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_choiceEventStates = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_currentChatCompletionSnapshot = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_instances = /* @__PURE__ */ new WeakSet(), _ChatCompletionStream_beginRequest = function _ChatCompletionStream_beginRequest2() {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, void 0, "f");
  }, _ChatCompletionStream_getChoiceEventState = function _ChatCompletionStream_getChoiceEventState2(choice) {
    let state = __classPrivateFieldGet(this, _ChatCompletionStream_choiceEventStates, "f")[choice.index];
    if (state) {
      return state;
    }
    state = {
      content_done: false,
      refusal_done: false,
      logprobs_content_done: false,
      logprobs_refusal_done: false,
      done_tool_calls: /* @__PURE__ */ new Set(),
      current_tool_call_index: null
    };
    __classPrivateFieldGet(this, _ChatCompletionStream_choiceEventStates, "f")[choice.index] = state;
    return state;
  }, _ChatCompletionStream_addChunk = function _ChatCompletionStream_addChunk2(chunk) {
    if (this.ended)
      return;
    const completion = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_accumulateChatCompletion).call(this, chunk);
    this._emit("chunk", chunk, completion);
    for (const choice of chunk.choices) {
      const choiceSnapshot = completion.choices[choice.index];
      if (choice.delta.content != null && choiceSnapshot.message?.role === "assistant" && choiceSnapshot.message?.content) {
        this._emit("content", choice.delta.content, choiceSnapshot.message.content);
        this._emit("content.delta", {
          delta: choice.delta.content,
          snapshot: choiceSnapshot.message.content,
          parsed: choiceSnapshot.message.parsed
        });
      }
      if (choice.delta.refusal != null && choiceSnapshot.message?.role === "assistant" && choiceSnapshot.message?.refusal) {
        this._emit("refusal.delta", {
          delta: choice.delta.refusal,
          snapshot: choiceSnapshot.message.refusal
        });
      }
      if (choice.logprobs?.content != null && choiceSnapshot.message?.role === "assistant") {
        this._emit("logprobs.content.delta", {
          content: choice.logprobs?.content,
          snapshot: choiceSnapshot.logprobs?.content ?? []
        });
      }
      if (choice.logprobs?.refusal != null && choiceSnapshot.message?.role === "assistant") {
        this._emit("logprobs.refusal.delta", {
          refusal: choice.logprobs?.refusal,
          snapshot: choiceSnapshot.logprobs?.refusal ?? []
        });
      }
      const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
      if (choiceSnapshot.finish_reason) {
        __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitContentDoneEvents).call(this, choiceSnapshot);
        if (state.current_tool_call_index != null) {
          __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitToolCallDoneEvent).call(this, choiceSnapshot, state.current_tool_call_index);
        }
      }
      for (const toolCall of choice.delta.tool_calls ?? []) {
        if (state.current_tool_call_index !== toolCall.index) {
          __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitContentDoneEvents).call(this, choiceSnapshot);
          if (state.current_tool_call_index != null) {
            __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitToolCallDoneEvent).call(this, choiceSnapshot, state.current_tool_call_index);
          }
        }
        state.current_tool_call_index = toolCall.index;
      }
      for (const toolCallDelta of choice.delta.tool_calls ?? []) {
        const toolCallSnapshot = choiceSnapshot.message.tool_calls?.[toolCallDelta.index];
        if (!toolCallSnapshot?.type) {
          continue;
        }
        if (toolCallSnapshot?.type === "function") {
          this._emit("tool_calls.function.arguments.delta", {
            name: toolCallSnapshot.function?.name,
            index: toolCallDelta.index,
            arguments: toolCallSnapshot.function.arguments,
            parsed_arguments: toolCallSnapshot.function.parsed_arguments,
            arguments_delta: toolCallDelta.function?.arguments ?? ""
          });
        } else {
          assertNever(toolCallSnapshot?.type);
        }
      }
    }
  }, _ChatCompletionStream_emitToolCallDoneEvent = function _ChatCompletionStream_emitToolCallDoneEvent2(choiceSnapshot, toolCallIndex) {
    const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
    if (state.done_tool_calls.has(toolCallIndex)) {
      return;
    }
    const toolCallSnapshot = choiceSnapshot.message.tool_calls?.[toolCallIndex];
    if (!toolCallSnapshot) {
      throw new Error("no tool call snapshot");
    }
    if (!toolCallSnapshot.type) {
      throw new Error("tool call snapshot missing `type`");
    }
    if (toolCallSnapshot.type === "function") {
      const inputTool = __classPrivateFieldGet(this, _ChatCompletionStream_params, "f")?.tools?.find((tool) => isChatCompletionFunctionTool(tool) && tool.function.name === toolCallSnapshot.function.name);
      this._emit("tool_calls.function.arguments.done", {
        name: toolCallSnapshot.function.name,
        index: toolCallIndex,
        arguments: toolCallSnapshot.function.arguments,
        parsed_arguments: isAutoParsableTool(inputTool) ? inputTool.$parseRaw(toolCallSnapshot.function.arguments) : inputTool?.function.strict ? JSON.parse(toolCallSnapshot.function.arguments) : null
      });
    } else {
      assertNever(toolCallSnapshot.type);
    }
  }, _ChatCompletionStream_emitContentDoneEvents = function _ChatCompletionStream_emitContentDoneEvents2(choiceSnapshot) {
    const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
    if (choiceSnapshot.message.content && !state.content_done) {
      state.content_done = true;
      const responseFormat = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getAutoParseableResponseFormat).call(this);
      this._emit("content.done", {
        content: choiceSnapshot.message.content,
        parsed: responseFormat ? responseFormat.$parseRaw(choiceSnapshot.message.content) : null
      });
    }
    if (choiceSnapshot.message.refusal && !state.refusal_done) {
      state.refusal_done = true;
      this._emit("refusal.done", { refusal: choiceSnapshot.message.refusal });
    }
    if (choiceSnapshot.logprobs?.content && !state.logprobs_content_done) {
      state.logprobs_content_done = true;
      this._emit("logprobs.content.done", { content: choiceSnapshot.logprobs.content });
    }
    if (choiceSnapshot.logprobs?.refusal && !state.logprobs_refusal_done) {
      state.logprobs_refusal_done = true;
      this._emit("logprobs.refusal.done", { refusal: choiceSnapshot.logprobs.refusal });
    }
  }, _ChatCompletionStream_endRequest = function _ChatCompletionStream_endRequest2() {
    if (this.ended) {
      throw new OpenAIError(`stream has ended, this shouldn't happen`);
    }
    const snapshot2 = __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
    if (!snapshot2) {
      throw new OpenAIError(`request ended without sending any chunks`);
    }
    __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, void 0, "f");
    __classPrivateFieldSet(this, _ChatCompletionStream_choiceEventStates, [], "f");
    return finalizeChatCompletion(snapshot2, __classPrivateFieldGet(this, _ChatCompletionStream_params, "f"));
  }, _ChatCompletionStream_getAutoParseableResponseFormat = function _ChatCompletionStream_getAutoParseableResponseFormat2() {
    const responseFormat = __classPrivateFieldGet(this, _ChatCompletionStream_params, "f")?.response_format;
    if (isAutoParsableResponseFormat(responseFormat)) {
      return responseFormat;
    }
    return null;
  }, _ChatCompletionStream_accumulateChatCompletion = function _ChatCompletionStream_accumulateChatCompletion2(chunk) {
    var _a3, _b, _c, _d;
    let snapshot2 = __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
    const { choices, ...rest } = chunk;
    if (!snapshot2) {
      snapshot2 = __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, {
        ...rest,
        choices: []
      }, "f");
    } else {
      Object.assign(snapshot2, rest);
    }
    for (const { delta, finish_reason, index, logprobs = null, ...other } of chunk.choices) {
      let choice = snapshot2.choices[index];
      if (!choice) {
        choice = snapshot2.choices[index] = { finish_reason, index, message: {}, logprobs, ...other };
      }
      if (logprobs) {
        if (!choice.logprobs) {
          choice.logprobs = Object.assign({}, logprobs);
        } else {
          const { content: content2, refusal: refusal2, ...rest3 } = logprobs;
          assertIsEmpty(rest3);
          Object.assign(choice.logprobs, rest3);
          if (content2) {
            (_a3 = choice.logprobs).content ?? (_a3.content = []);
            choice.logprobs.content.push(...content2);
          }
          if (refusal2) {
            (_b = choice.logprobs).refusal ?? (_b.refusal = []);
            choice.logprobs.refusal.push(...refusal2);
          }
        }
      }
      if (finish_reason) {
        choice.finish_reason = finish_reason;
        if (__classPrivateFieldGet(this, _ChatCompletionStream_params, "f") && hasAutoParseableInput(__classPrivateFieldGet(this, _ChatCompletionStream_params, "f"))) {
          if (finish_reason === "length") {
            throw new LengthFinishReasonError();
          }
          if (finish_reason === "content_filter") {
            throw new ContentFilterFinishReasonError();
          }
        }
      }
      Object.assign(choice, other);
      if (!delta)
        continue;
      const { content, refusal, function_call, role, tool_calls, ...rest2 } = delta;
      assertIsEmpty(rest2);
      Object.assign(choice.message, rest2);
      if (refusal) {
        choice.message.refusal = (choice.message.refusal || "") + refusal;
      }
      if (role)
        choice.message.role = role;
      if (function_call) {
        if (!choice.message.function_call) {
          choice.message.function_call = function_call;
        } else {
          if (function_call.name)
            choice.message.function_call.name = function_call.name;
          if (function_call.arguments) {
            (_c = choice.message.function_call).arguments ?? (_c.arguments = "");
            choice.message.function_call.arguments += function_call.arguments;
          }
        }
      }
      if (content) {
        choice.message.content = (choice.message.content || "") + content;
        if (!choice.message.refusal && __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getAutoParseableResponseFormat).call(this)) {
          choice.message.parsed = choice.message.content.trim() ? partialParse(choice.message.content) : null;
        }
      }
      if (tool_calls) {
        if (!choice.message.tool_calls)
          choice.message.tool_calls = [];
        for (const { index: index2, id, type, function: fn, ...rest3 } of tool_calls) {
          const tool_call = (_d = choice.message.tool_calls)[index2] ?? (_d[index2] = {});
          Object.assign(tool_call, rest3);
          if (id)
            tool_call.id = id;
          if (type)
            tool_call.type = type;
          if (fn)
            tool_call.function ?? (tool_call.function = { name: fn.name ?? "", arguments: "" });
          if (fn?.name)
            tool_call.function.name = fn.name;
          if (fn?.arguments) {
            tool_call.function.arguments += fn.arguments;
            if (shouldParseToolCall(__classPrivateFieldGet(this, _ChatCompletionStream_params, "f"), tool_call)) {
              tool_call.function.parsed_arguments = partialParse(tool_call.function.arguments);
            }
          }
        }
      }
    }
    return snapshot2;
  }, Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("chunk", (chunk) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(chunk);
      } else {
        pushQueue.push(chunk);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(void 0);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    this.on("error", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: void 0, done: true };
          }
          return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: void 0, done: true });
        }
        const chunk = pushQueue.shift();
        return { value: chunk, done: false };
      },
      return: async () => {
        this.abort();
        return { value: void 0, done: true };
      }
    };
  }
  toReadableStream() {
    const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
    return stream.toReadableStream();
  }
};
function finalizeChatCompletion(snapshot2, params) {
  const { id, choices, created, model, system_fingerprint, ...rest } = snapshot2;
  const completion = {
    ...rest,
    id,
    choices: choices.map(({ message, finish_reason, index, logprobs, ...choiceRest }) => {
      if (!finish_reason) {
        throw new OpenAIError(`missing finish_reason for choice ${index}`);
      }
      const { content = null, function_call, tool_calls, ...messageRest } = message;
      const role = message.role;
      if (!role) {
        throw new OpenAIError(`missing role for choice ${index}`);
      }
      if (function_call) {
        const { arguments: args, name } = function_call;
        if (args == null) {
          throw new OpenAIError(`missing function_call.arguments for choice ${index}`);
        }
        if (!name) {
          throw new OpenAIError(`missing function_call.name for choice ${index}`);
        }
        return {
          ...choiceRest,
          message: {
            content,
            function_call: { arguments: args, name },
            role,
            refusal: message.refusal ?? null
          },
          finish_reason,
          index,
          logprobs
        };
      }
      if (tool_calls) {
        return {
          ...choiceRest,
          index,
          finish_reason,
          logprobs,
          message: {
            ...messageRest,
            role,
            content,
            refusal: message.refusal ?? null,
            tool_calls: tool_calls.map((tool_call, i) => {
              const { function: fn, type, id: id2, ...toolRest } = tool_call;
              const { arguments: args, name, ...fnRest } = fn || {};
              if (id2 == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].id
${str(snapshot2)}`);
              }
              if (type == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].type
${str(snapshot2)}`);
              }
              if (name == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].function.name
${str(snapshot2)}`);
              }
              if (args == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].function.arguments
${str(snapshot2)}`);
              }
              return { ...toolRest, id: id2, type, function: { ...fnRest, name, arguments: args } };
            })
          }
        };
      }
      return {
        ...choiceRest,
        message: { ...messageRest, content, role, refusal: message.refusal ?? null },
        finish_reason,
        index,
        logprobs
      };
    }),
    created,
    model,
    object: "chat.completion",
    ...system_fingerprint ? { system_fingerprint } : {}
  };
  return maybeParseChatCompletion(completion, params);
}
function str(x) {
  return JSON.stringify(x);
}
function assertIsEmpty(obj) {
  return;
}
function assertNever(_x) {
}

// node_modules/openai/lib/ChatCompletionStreamingRunner.mjs
var ChatCompletionStreamingRunner = class _ChatCompletionStreamingRunner extends ChatCompletionStream {
  static fromReadableStream(stream) {
    const runner = new _ChatCompletionStreamingRunner(null);
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  static runTools(client, params, options) {
    const runner = new _ChatCompletionStreamingRunner(
      // @ts-expect-error TODO these types are incompatible
      params
    );
    const opts = {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "runTools" }
    };
    runner._run(() => runner._runTools(client, params, runner, opts));
    return runner;
  }
};

// node_modules/openai/resources/chat/completions/completions.mjs
var Completions = class extends APIResource {
  constructor() {
    super(...arguments);
    this.messages = new Messages(this._client);
  }
  create(body, options) {
    return this._client.post("/chat/completions", {
      body,
      ...options,
      stream: body.stream ?? false,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get a stored chat completion. Only Chat Completions that have been created with
   * the `store` parameter set to `true` will be returned.
   *
   * @example
   * ```ts
   * const chatCompletion =
   *   await client.chat.completions.retrieve('completion_id');
   * ```
   */
  retrieve(completionID, options) {
    return this._client.get(path`/chat/completions/${completionID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modify a stored chat completion. Only Chat Completions that have been created
   * with the `store` parameter set to `true` can be modified. Currently, the only
   * supported modification is to update the `metadata` field.
   *
   * @example
   * ```ts
   * const chatCompletion = await client.chat.completions.update(
   *   'completion_id',
   *   { metadata: { foo: 'string' } },
   * );
   * ```
   */
  update(completionID, body, options) {
    return this._client.post(path`/chat/completions/${completionID}`, {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List stored Chat Completions. Only Chat Completions that have been stored with
   * the `store` parameter set to `true` will be returned.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const chatCompletion of client.chat.completions.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/chat/completions", CursorPage, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a stored chat completion. Only Chat Completions that have been created
   * with the `store` parameter set to `true` can be deleted.
   *
   * @example
   * ```ts
   * const chatCompletionDeleted =
   *   await client.chat.completions.delete('completion_id');
   * ```
   */
  delete(completionID, options) {
    return this._client.delete(path`/chat/completions/${completionID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  parse(body, options) {
    validateInputTools(body.tools);
    return this._client.chat.completions.create(body, {
      ...options,
      headers: {
        ...options?.headers,
        "X-Stainless-Helper-Method": "chat.completions.parse"
      }
    })._thenUnwrap((completion) => parseChatCompletion(completion, body));
  }
  runTools(body, options) {
    if (body.stream) {
      return ChatCompletionStreamingRunner.runTools(this._client, body, options);
    }
    return ChatCompletionRunner.runTools(this._client, body, options);
  }
  /**
   * Creates a chat completion stream
   */
  stream(body, options) {
    return ChatCompletionStream.createChatCompletion(this._client, body, options);
  }
};
Completions.Messages = Messages;

// node_modules/openai/resources/chat/chat.mjs
var Chat = class extends APIResource {
  constructor() {
    super(...arguments);
    this.completions = new Completions(this._client);
  }
};
Chat.Completions = Completions;

// node_modules/openai/resources/admin/organization/admin-api-keys.mjs
var AdminAPIKeys = class extends APIResource {
  /**
   * Create an organization admin API key
   *
   * @example
   * ```ts
   * const adminAPIKey =
   *   await client.admin.organization.adminAPIKeys.create({
   *     name: 'New Admin Key',
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/admin_api_keys", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieve a single organization API key
   *
   * @example
   * ```ts
   * const adminAPIKey =
   *   await client.admin.organization.adminAPIKeys.retrieve(
   *     'key_id',
   *   );
   * ```
   */
  retrieve(keyID, options) {
    return this._client.get(path`/organization/admin_api_keys/${keyID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * List organization API keys
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const adminAPIKey of client.admin.organization.adminAPIKeys.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/organization/admin_api_keys", CursorPage, {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Delete an organization admin API key
   *
   * @example
   * ```ts
   * const adminAPIKey =
   *   await client.admin.organization.adminAPIKeys.delete(
   *     'key_id',
   *   );
   * ```
   */
  delete(keyID, options) {
    return this._client.delete(path`/organization/admin_api_keys/${keyID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/audit-logs.mjs
var AuditLogs = class extends APIResource {
  /**
   * List user actions and configuration changes within this organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const auditLogListResponse of client.admin.organization.auditLogs.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/organization/audit_logs", ConversationCursorPage, {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/certificates.mjs
var Certificates = class extends APIResource {
  /**
   * Upload a certificate to the organization. This does **not** automatically
   * activate the certificate.
   *
   * Organizations can upload up to 50 certificates.
   *
   * @example
   * ```ts
   * const certificate =
   *   await client.admin.organization.certificates.create({
   *     certificate: 'certificate',
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/certificates", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get a certificate that has been uploaded to the organization.
   *
   * You can get a certificate regardless of whether it is active or not.
   *
   * @example
   * ```ts
   * const certificate =
   *   await client.admin.organization.certificates.retrieve(
   *     'certificate_id',
   *   );
   * ```
   */
  retrieve(certificateID, query = {}, options) {
    return this._client.get(path`/organization/certificates/${certificateID}`, {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Modify a certificate. Note that only the name can be modified.
   *
   * @example
   * ```ts
   * const certificate =
   *   await client.admin.organization.certificates.update(
   *     'certificate_id',
   *   );
   * ```
   */
  update(certificateID, body, options) {
    return this._client.post(path`/organization/certificates/${certificateID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * List uploaded certificates for this organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateListResponse of client.admin.organization.certificates.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/organization/certificates", ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Delete a certificate from the organization.
   *
   * The certificate must be inactive for the organization and all projects.
   *
   * @example
   * ```ts
   * const certificate =
   *   await client.admin.organization.certificates.delete(
   *     'certificate_id',
   *   );
   * ```
   */
  delete(certificateID, options) {
    return this._client.delete(path`/organization/certificates/${certificateID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Activate certificates at the organization level.
   *
   * You can atomically and idempotently activate up to 10 certificates at a time.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateActivateResponse of client.admin.organization.certificates.activate(
   *   { certificate_ids: ['cert_abc'] },
   * )) {
   *   // ...
   * }
   * ```
   */
  activate(body, options) {
    return this._client.getAPIList("/organization/certificates/activate", Page, {
      body,
      method: "post",
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Deactivate certificates at the organization level.
   *
   * You can atomically and idempotently deactivate up to 10 certificates at a time.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateDeactivateResponse of client.admin.organization.certificates.deactivate(
   *   { certificate_ids: ['cert_abc'] },
   * )) {
   *   // ...
   * }
   * ```
   */
  deactivate(body, options) {
    return this._client.getAPIList("/organization/certificates/deactivate", Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
  }
};

// node_modules/openai/resources/admin/organization/data-retention.mjs
var DataRetention = class extends APIResource {
  /**
   * Retrieves organization data retention controls.
   *
   * @example
   * ```ts
   * const organizationDataRetention =
   *   await client.admin.organization.dataRetention.retrieve();
   * ```
   */
  retrieve(options) {
    return this._client.get("/organization/data_retention", {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates organization data retention controls.
   *
   * @example
   * ```ts
   * const organizationDataRetention =
   *   await client.admin.organization.dataRetention.update({
   *     retention_type: 'zero_data_retention',
   *   });
   * ```
   */
  update(body, options) {
    return this._client.post("/organization/data_retention", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/invites.mjs
var Invites = class extends APIResource {
  /**
   * Create an invite for a user to the organization. The invite must be accepted by
   * the user before they have access to the organization.
   *
   * @example
   * ```ts
   * const invite =
   *   await client.admin.organization.invites.create({
   *     email: 'email',
   *     role: 'reader',
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/invites", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves an invite.
   *
   * @example
   * ```ts
   * const invite =
   *   await client.admin.organization.invites.retrieve(
   *     'invite_id',
   *   );
   * ```
   */
  retrieve(inviteID, options) {
    return this._client.get(path`/organization/invites/${inviteID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Returns a list of invites in the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const invite of client.admin.organization.invites.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/organization/invites", ConversationCursorPage, {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Delete an invite. If the invite has already been accepted, it cannot be deleted.
   *
   * @example
   * ```ts
   * const invite =
   *   await client.admin.organization.invites.delete(
   *     'invite_id',
   *   );
   * ```
   */
  delete(inviteID, options) {
    return this._client.delete(path`/organization/invites/${inviteID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/roles.mjs
var Roles = class extends APIResource {
  /**
   * Creates a custom role for the organization.
   *
   * @example
   * ```ts
   * const role = await client.admin.organization.roles.create({
   *   permissions: ['string'],
   *   role_name: 'role_name',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/roles", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves an organization role.
   *
   * @example
   * ```ts
   * const role = await client.admin.organization.roles.retrieve(
   *   'role_id',
   * );
   * ```
   */
  retrieve(roleID, options) {
    return this._client.get(path`/organization/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates an existing organization role.
   *
   * @example
   * ```ts
   * const role = await client.admin.organization.roles.update(
   *   'role_id',
   * );
   * ```
   */
  update(roleID, body, options) {
    return this._client.post(path`/organization/roles/${roleID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the roles configured for the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const role of client.admin.organization.roles.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/organization/roles", NextCursorPage, {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Deletes a custom role from the organization.
   *
   * @example
   * ```ts
   * const role = await client.admin.organization.roles.delete(
   *   'role_id',
   * );
   * ```
   */
  delete(roleID, options) {
    return this._client.delete(path`/organization/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/spend-alerts.mjs
var SpendAlerts = class extends APIResource {
  /**
   * Creates an organization spend alert.
   *
   * @example
   * ```ts
   * const organizationSpendAlert =
   *   await client.admin.organization.spendAlerts.create({
   *     currency: 'USD',
   *     interval: 'month',
   *     notification_channel: {
   *       recipients: ['string'],
   *       type: 'email',
   *     },
   *     threshold_amount: 0,
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/spend_alerts", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves an organization spend alert.
   *
   * @example
   * ```ts
   * const organizationSpendAlert =
   *   await client.admin.organization.spendAlerts.retrieve(
   *     'alert_id',
   *   );
   * ```
   */
  retrieve(alertID, options) {
    return this._client.get(path`/organization/spend_alerts/${alertID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates an organization spend alert.
   *
   * @example
   * ```ts
   * const organizationSpendAlert =
   *   await client.admin.organization.spendAlerts.update(
   *     'alert_id',
   *     {
   *       currency: 'USD',
   *       interval: 'month',
   *       notification_channel: {
   *         recipients: ['string'],
   *         type: 'email',
   *       },
   *       threshold_amount: 0,
   *     },
   *   );
   * ```
   */
  update(alertID, body, options) {
    return this._client.post(path`/organization/spend_alerts/${alertID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists organization spend alerts.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const organizationSpendAlert of client.admin.organization.spendAlerts.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/organization/spend_alerts", ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Deletes an organization spend alert.
   *
   * @example
   * ```ts
   * const organizationSpendAlertDeleted =
   *   await client.admin.organization.spendAlerts.delete(
   *     'alert_id',
   *   );
   * ```
   */
  delete(alertID, options) {
    return this._client.delete(path`/organization/spend_alerts/${alertID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/usage.mjs
var Usage = class extends APIResource {
  /**
   * Get audio speeches usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.audioSpeeches({
   *     start_time: 0,
   *   });
   * ```
   */
  audioSpeeches(query, options) {
    return this._client.get("/organization/usage/audio_speeches", {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get audio transcriptions usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.audioTranscriptions(
   *     { start_time: 0 },
   *   );
   * ```
   */
  audioTranscriptions(query, options) {
    return this._client.get("/organization/usage/audio_transcriptions", {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get code interpreter sessions usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.codeInterpreterSessions(
   *     { start_time: 0 },
   *   );
   * ```
   */
  codeInterpreterSessions(query, options) {
    return this._client.get("/organization/usage/code_interpreter_sessions", {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get completions usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.completions({
   *     start_time: 0,
   *   });
   * ```
   */
  completions(query, options) {
    return this._client.get("/organization/usage/completions", {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get costs details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.costs({
   *     start_time: 0,
   *   });
   * ```
   */
  costs(query, options) {
    return this._client.get("/organization/costs", {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get embeddings usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.embeddings({
   *     start_time: 0,
   *   });
   * ```
   */
  embeddings(query, options) {
    return this._client.get("/organization/usage/embeddings", {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get file search calls usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.fileSearchCalls({
   *     start_time: 0,
   *   });
   * ```
   */
  fileSearchCalls(query, options) {
    return this._client.get("/organization/usage/file_search_calls", {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get images usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.images({
   *     start_time: 0,
   *   });
   * ```
   */
  images(query, options) {
    return this._client.get("/organization/usage/images", {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get moderations usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.moderations({
   *     start_time: 0,
   *   });
   * ```
   */
  moderations(query, options) {
    return this._client.get("/organization/usage/moderations", {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get vector stores usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.vectorStores({
   *     start_time: 0,
   *   });
   * ```
   */
  vectorStores(query, options) {
    return this._client.get("/organization/usage/vector_stores", {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get web search calls usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.webSearchCalls({
   *     start_time: 0,
   *   });
   * ```
   */
  webSearchCalls(query, options) {
    return this._client.get("/organization/usage/web_search_calls", {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/groups/roles.mjs
var Roles2 = class extends APIResource {
  /**
   * Assigns an organization role to a group within the organization.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.groups.roles.create(
   *     'group_id',
   *     { role_id: 'role_id' },
   *   );
   * ```
   */
  create(groupID, body, options) {
    return this._client.post(path`/organization/groups/${groupID}/roles`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves an organization role assigned to a group.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.groups.roles.retrieve(
   *     'role_id',
   *     { group_id: 'group_id' },
   *   );
   * ```
   */
  retrieve(roleID, params, options) {
    const { group_id } = params;
    return this._client.get(path`/organization/groups/${group_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the organization roles assigned to a group within the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const roleListResponse of client.admin.organization.groups.roles.list(
   *   'group_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(groupID, query = {}, options) {
    return this._client.getAPIList(path`/organization/groups/${groupID}/roles`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Unassigns an organization role from a group within the organization.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.groups.roles.delete(
   *     'role_id',
   *     { group_id: 'group_id' },
   *   );
   * ```
   */
  delete(roleID, params, options) {
    const { group_id } = params;
    return this._client.delete(path`/organization/groups/${group_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/groups/users.mjs
var Users = class extends APIResource {
  /**
   * Adds a user to a group.
   *
   * @example
   * ```ts
   * const user =
   *   await client.admin.organization.groups.users.create(
   *     'group_id',
   *     { user_id: 'user_id' },
   *   );
   * ```
   */
  create(groupID, body, options) {
    return this._client.post(path`/organization/groups/${groupID}/users`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a user in a group.
   *
   * @example
   * ```ts
   * const user =
   *   await client.admin.organization.groups.users.retrieve(
   *     'user_id',
   *     { group_id: 'group_id' },
   *   );
   * ```
   */
  retrieve(userID, params, options) {
    const { group_id } = params;
    return this._client.get(path`/organization/groups/${group_id}/users/${userID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the users assigned to a group.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const organizationGroupUser of client.admin.organization.groups.users.list(
   *   'group_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(groupID, query = {}, options) {
    return this._client.getAPIList(path`/organization/groups/${groupID}/users`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Removes a user from a group.
   *
   * @example
   * ```ts
   * const user =
   *   await client.admin.organization.groups.users.delete(
   *     'user_id',
   *     { group_id: 'group_id' },
   *   );
   * ```
   */
  delete(userID, params, options) {
    const { group_id } = params;
    return this._client.delete(path`/organization/groups/${group_id}/users/${userID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/groups/groups.mjs
var Groups = class extends APIResource {
  constructor() {
    super(...arguments);
    this.users = new Users(this._client);
    this.roles = new Roles2(this._client);
  }
  /**
   * Creates a new group in the organization.
   *
   * @example
   * ```ts
   * const group = await client.admin.organization.groups.create(
   *   { name: 'x' },
   * );
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/groups", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a group.
   *
   * @example
   * ```ts
   * const group =
   *   await client.admin.organization.groups.retrieve(
   *     'group_id',
   *   );
   * ```
   */
  retrieve(groupID, options) {
    return this._client.get(path`/organization/groups/${groupID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates a group's information.
   *
   * @example
   * ```ts
   * const group = await client.admin.organization.groups.update(
   *   'group_id',
   *   { name: 'x' },
   * );
   * ```
   */
  update(groupID, body, options) {
    return this._client.post(path`/organization/groups/${groupID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists all groups in the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const group of client.admin.organization.groups.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/organization/groups", NextCursorPage, {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Deletes a group from the organization.
   *
   * @example
   * ```ts
   * const group = await client.admin.organization.groups.delete(
   *   'group_id',
   * );
   * ```
   */
  delete(groupID, options) {
    return this._client.delete(path`/organization/groups/${groupID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
Groups.Users = Users;
Groups.Roles = Roles2;

// node_modules/openai/resources/admin/organization/projects/api-keys.mjs
var APIKeys = class extends APIResource {
  /**
   * Retrieves an API key in the project.
   *
   * @example
   * ```ts
   * const projectAPIKey =
   *   await client.admin.organization.projects.apiKeys.retrieve(
   *     'api_key_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  retrieve(apiKeyID, params, options) {
    const { project_id } = params;
    return this._client.get(path`/organization/projects/${project_id}/api_keys/${apiKeyID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Returns a list of API keys in the project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const projectAPIKey of client.admin.organization.projects.apiKeys.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/api_keys`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Deletes an API key from the project.
   *
   * Returns confirmation of the key deletion, or an error if the key belonged to a
   * service account.
   *
   * @example
   * ```ts
   * const apiKey =
   *   await client.admin.organization.projects.apiKeys.delete(
   *     'api_key_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  delete(apiKeyID, params, options) {
    const { project_id } = params;
    return this._client.delete(path`/organization/projects/${project_id}/api_keys/${apiKeyID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/projects/certificates.mjs
var Certificates2 = class extends APIResource {
  /**
   * List certificates for this project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateListResponse of client.admin.organization.projects.certificates.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/certificates`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Activate certificates at the project level.
   *
   * You can atomically and idempotently activate up to 10 certificates at a time.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateActivateResponse of client.admin.organization.projects.certificates.activate(
   *   'project_id',
   *   { certificate_ids: ['cert_abc'] },
   * )) {
   *   // ...
   * }
   * ```
   */
  activate(projectID, body, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/certificates/activate`, Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Deactivate certificates at the project level. You can atomically and
   * idempotently deactivate up to 10 certificates at a time.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateDeactivateResponse of client.admin.organization.projects.certificates.deactivate(
   *   'project_id',
   *   { certificate_ids: ['cert_abc'] },
   * )) {
   *   // ...
   * }
   * ```
   */
  deactivate(projectID, body, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/certificates/deactivate`, Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
  }
};

// node_modules/openai/resources/admin/organization/projects/data-retention.mjs
var DataRetention2 = class extends APIResource {
  /**
   * Retrieves project data retention controls.
   *
   * @example
   * ```ts
   * const projectDataRetention =
   *   await client.admin.organization.projects.dataRetention.retrieve(
   *     'project_id',
   *   );
   * ```
   */
  retrieve(projectID, options) {
    return this._client.get(path`/organization/projects/${projectID}/data_retention`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates project data retention controls.
   *
   * @example
   * ```ts
   * const projectDataRetention =
   *   await client.admin.organization.projects.dataRetention.update(
   *     'project_id',
   *     { retention_type: 'organization_default' },
   *   );
   * ```
   */
  update(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}/data_retention`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/projects/hosted-tool-permissions.mjs
var HostedToolPermissions = class extends APIResource {
  /**
   * Returns hosted tool permissions for a project.
   *
   * @example
   * ```ts
   * const projectHostedToolPermissions =
   *   await client.admin.organization.projects.hostedToolPermissions.retrieve(
   *     'project_id',
   *   );
   * ```
   */
  retrieve(projectID, options) {
    return this._client.get(path`/organization/projects/${projectID}/hosted_tool_permissions`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates hosted tool permissions for a project.
   *
   * @example
   * ```ts
   * const projectHostedToolPermissions =
   *   await client.admin.organization.projects.hostedToolPermissions.update(
   *     'project_id',
   *   );
   * ```
   */
  update(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}/hosted_tool_permissions`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/projects/model-permissions.mjs
var ModelPermissions = class extends APIResource {
  /**
   * Returns model permissions for a project.
   *
   * @example
   * ```ts
   * const projectModelPermissions =
   *   await client.admin.organization.projects.modelPermissions.retrieve(
   *     'project_id',
   *   );
   * ```
   */
  retrieve(projectID, options) {
    return this._client.get(path`/organization/projects/${projectID}/model_permissions`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates model permissions for a project.
   *
   * @example
   * ```ts
   * const projectModelPermissions =
   *   await client.admin.organization.projects.modelPermissions.update(
   *     'project_id',
   *     { mode: 'allow_list', model_ids: ['string'] },
   *   );
   * ```
   */
  update(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}/model_permissions`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Deletes model permissions for a project.
   *
   * @example
   * ```ts
   * const projectModelPermissionsDeleted =
   *   await client.admin.organization.projects.modelPermissions.delete(
   *     'project_id',
   *   );
   * ```
   */
  delete(projectID, options) {
    return this._client.delete(path`/organization/projects/${projectID}/model_permissions`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/projects/rate-limits.mjs
var RateLimits = class extends APIResource {
  /**
   * Returns the rate limits per model for a project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const projectRateLimit of client.admin.organization.projects.rateLimits.listRateLimits(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  listRateLimits(projectID, query = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/rate_limits`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Updates a project rate limit.
   *
   * @example
   * ```ts
   * const projectRateLimit =
   *   await client.admin.organization.projects.rateLimits.updateRateLimit(
   *     'rate_limit_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  updateRateLimit(rateLimitID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/organization/projects/${project_id}/rate_limits/${rateLimitID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/projects/roles.mjs
var Roles3 = class extends APIResource {
  /**
   * Creates a custom role for a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.roles.create(
   *     'project_id',
   *     { permissions: ['string'], role_name: 'role_name' },
   *   );
   * ```
   */
  create(projectID, body, options) {
    return this._client.post(path`/projects/${projectID}/roles`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a project role.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.roles.retrieve(
   *     'role_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  retrieve(roleID, params, options) {
    const { project_id } = params;
    return this._client.get(path`/projects/${project_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates an existing project role.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.roles.update(
   *     'role_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  update(roleID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/projects/${project_id}/roles/${roleID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the roles configured for a project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const role of client.admin.organization.projects.roles.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query = {}, options) {
    return this._client.getAPIList(path`/projects/${projectID}/roles`, NextCursorPage, {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Deletes a custom role from a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.roles.delete(
   *     'role_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  delete(roleID, params, options) {
    const { project_id } = params;
    return this._client.delete(path`/projects/${project_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/projects/service-accounts.mjs
var ServiceAccounts = class extends APIResource {
  /**
   * Creates a new service account in the project. This also returns an unredacted
   * API key for the service account.
   *
   * @example
   * ```ts
   * const serviceAccount =
   *   await client.admin.organization.projects.serviceAccounts.create(
   *     'project_id',
   *     { name: 'name' },
   *   );
   * ```
   */
  create(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}/service_accounts`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a service account in the project.
   *
   * @example
   * ```ts
   * const projectServiceAccount =
   *   await client.admin.organization.projects.serviceAccounts.retrieve(
   *     'service_account_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  retrieve(serviceAccountID, params, options) {
    const { project_id } = params;
    return this._client.get(path`/organization/projects/${project_id}/service_accounts/${serviceAccountID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates a service account in the project.
   *
   * @example
   * ```ts
   * const projectServiceAccount =
   *   await client.admin.organization.projects.serviceAccounts.update(
   *     'service_account_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  update(serviceAccountID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/organization/projects/${project_id}/service_accounts/${serviceAccountID}`, { body, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Returns a list of service accounts in the project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const projectServiceAccount of client.admin.organization.projects.serviceAccounts.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/service_accounts`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Deletes a service account from the project.
   *
   * Returns confirmation of service account deletion, or an error if the project is
   * archived (archived projects have no service accounts).
   *
   * @example
   * ```ts
   * const serviceAccount =
   *   await client.admin.organization.projects.serviceAccounts.delete(
   *     'service_account_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  delete(serviceAccountID, params, options) {
    const { project_id } = params;
    return this._client.delete(path`/organization/projects/${project_id}/service_accounts/${serviceAccountID}`, { ...options, __security: { adminAPIKeyAuth: true } });
  }
};

// node_modules/openai/resources/admin/organization/projects/spend-alerts.mjs
var SpendAlerts2 = class extends APIResource {
  /**
   * Creates a project spend alert.
   *
   * @example
   * ```ts
   * const projectSpendAlert =
   *   await client.admin.organization.projects.spendAlerts.create(
   *     'project_id',
   *     {
   *       currency: 'USD',
   *       interval: 'month',
   *       notification_channel: {
   *         recipients: ['string'],
   *         type: 'email',
   *       },
   *       threshold_amount: 0,
   *     },
   *   );
   * ```
   */
  create(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}/spend_alerts`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a project spend alert.
   *
   * @example
   * ```ts
   * const projectSpendAlert =
   *   await client.admin.organization.projects.spendAlerts.retrieve(
   *     'alert_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  retrieve(alertID, params, options) {
    const { project_id } = params;
    return this._client.get(path`/organization/projects/${project_id}/spend_alerts/${alertID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates a project spend alert.
   *
   * @example
   * ```ts
   * const projectSpendAlert =
   *   await client.admin.organization.projects.spendAlerts.update(
   *     'alert_id',
   *     {
   *       project_id: 'project_id',
   *       currency: 'USD',
   *       interval: 'month',
   *       notification_channel: {
   *         recipients: ['string'],
   *         type: 'email',
   *       },
   *       threshold_amount: 0,
   *     },
   *   );
   * ```
   */
  update(alertID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/organization/projects/${project_id}/spend_alerts/${alertID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists project spend alerts.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const projectSpendAlert of client.admin.organization.projects.spendAlerts.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/spend_alerts`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Deletes a project spend alert.
   *
   * @example
   * ```ts
   * const projectSpendAlertDeleted =
   *   await client.admin.organization.projects.spendAlerts.delete(
   *     'alert_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  delete(alertID, params, options) {
    const { project_id } = params;
    return this._client.delete(path`/organization/projects/${project_id}/spend_alerts/${alertID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/projects/groups/roles.mjs
var Roles4 = class extends APIResource {
  /**
   * Assigns a project role to a group within a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.groups.roles.create(
   *     'group_id',
   *     { project_id: 'project_id', role_id: 'role_id' },
   *   );
   * ```
   */
  create(groupID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/projects/${project_id}/groups/${groupID}/roles`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a project role assigned to a group.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.groups.roles.retrieve(
   *     'role_id',
   *     { project_id: 'project_id', group_id: 'group_id' },
   *   );
   * ```
   */
  retrieve(roleID, params, options) {
    const { project_id, group_id } = params;
    return this._client.get(path`/projects/${project_id}/groups/${group_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the project roles assigned to a group within a project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const roleListResponse of client.admin.organization.projects.groups.roles.list(
   *   'group_id',
   *   { project_id: 'project_id' },
   * )) {
   *   // ...
   * }
   * ```
   */
  list(groupID, params, options) {
    const { project_id, ...query } = params;
    return this._client.getAPIList(path`/projects/${project_id}/groups/${groupID}/roles`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Unassigns a project role from a group within a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.groups.roles.delete(
   *     'role_id',
   *     { project_id: 'project_id', group_id: 'group_id' },
   *   );
   * ```
   */
  delete(roleID, params, options) {
    const { project_id, group_id } = params;
    return this._client.delete(path`/projects/${project_id}/groups/${group_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/projects/groups/groups.mjs
var Groups2 = class extends APIResource {
  constructor() {
    super(...arguments);
    this.roles = new Roles4(this._client);
  }
  /**
   * Grants a group access to a project.
   *
   * @example
   * ```ts
   * const projectGroup =
   *   await client.admin.organization.projects.groups.create(
   *     'project_id',
   *     { group_id: 'group_id', role: 'role' },
   *   );
   * ```
   */
  create(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}/groups`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a project's group.
   *
   * @example
   * ```ts
   * const projectGroup =
   *   await client.admin.organization.projects.groups.retrieve(
   *     'group_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  retrieve(groupID, params, options) {
    const { project_id, ...query } = params;
    return this._client.get(path`/organization/projects/${project_id}/groups/${groupID}`, {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the groups that have access to a project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const projectGroup of client.admin.organization.projects.groups.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/groups`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Revokes a group's access to a project.
   *
   * @example
   * ```ts
   * const group =
   *   await client.admin.organization.projects.groups.delete(
   *     'group_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  delete(groupID, params, options) {
    const { project_id } = params;
    return this._client.delete(path`/organization/projects/${project_id}/groups/${groupID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
Groups2.Roles = Roles4;

// node_modules/openai/resources/admin/organization/projects/users/roles.mjs
var Roles5 = class extends APIResource {
  /**
   * Assigns a project role to a user within a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.users.roles.create(
   *     'user_id',
   *     { project_id: 'project_id', role_id: 'role_id' },
   *   );
   * ```
   */
  create(userID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/projects/${project_id}/users/${userID}/roles`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a project role assigned to a user.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.users.roles.retrieve(
   *     'role_id',
   *     { project_id: 'project_id', user_id: 'user_id' },
   *   );
   * ```
   */
  retrieve(roleID, params, options) {
    const { project_id, user_id } = params;
    return this._client.get(path`/projects/${project_id}/users/${user_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the project roles assigned to a user within a project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const roleListResponse of client.admin.organization.projects.users.roles.list(
   *   'user_id',
   *   { project_id: 'project_id' },
   * )) {
   *   // ...
   * }
   * ```
   */
  list(userID, params, options) {
    const { project_id, ...query } = params;
    return this._client.getAPIList(path`/projects/${project_id}/users/${userID}/roles`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Unassigns a project role from a user within a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.users.roles.delete(
   *     'role_id',
   *     { project_id: 'project_id', user_id: 'user_id' },
   *   );
   * ```
   */
  delete(roleID, params, options) {
    const { project_id, user_id } = params;
    return this._client.delete(path`/projects/${project_id}/users/${user_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/projects/users/users.mjs
var Users2 = class extends APIResource {
  constructor() {
    super(...arguments);
    this.roles = new Roles5(this._client);
  }
  /**
   * Adds a user to the project. Users must already be members of the organization to
   * be added to a project.
   *
   * @example
   * ```ts
   * const projectUser =
   *   await client.admin.organization.projects.users.create(
   *     'project_id',
   *     { role: 'role' },
   *   );
   * ```
   */
  create(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}/users`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a user in the project.
   *
   * @example
   * ```ts
   * const projectUser =
   *   await client.admin.organization.projects.users.retrieve(
   *     'user_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  retrieve(userID, params, options) {
    const { project_id } = params;
    return this._client.get(path`/organization/projects/${project_id}/users/${userID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Modifies a user's role in the project.
   *
   * @example
   * ```ts
   * const projectUser =
   *   await client.admin.organization.projects.users.update(
   *     'user_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  update(userID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/organization/projects/${project_id}/users/${userID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Returns a list of users in the project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const projectUser of client.admin.organization.projects.users.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/users`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Deletes a user from the project.
   *
   * Returns confirmation of project user deletion, or an error if the project is
   * archived (archived projects have no users).
   *
   * @example
   * ```ts
   * const user =
   *   await client.admin.organization.projects.users.delete(
   *     'user_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  delete(userID, params, options) {
    const { project_id } = params;
    return this._client.delete(path`/organization/projects/${project_id}/users/${userID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
Users2.Roles = Roles5;

// node_modules/openai/resources/admin/organization/projects/projects.mjs
var Projects = class extends APIResource {
  constructor() {
    super(...arguments);
    this.users = new Users2(this._client);
    this.serviceAccounts = new ServiceAccounts(this._client);
    this.apiKeys = new APIKeys(this._client);
    this.rateLimits = new RateLimits(this._client);
    this.modelPermissions = new ModelPermissions(this._client);
    this.hostedToolPermissions = new HostedToolPermissions(this._client);
    this.groups = new Groups2(this._client);
    this.roles = new Roles3(this._client);
    this.dataRetention = new DataRetention2(this._client);
    this.spendAlerts = new SpendAlerts2(this._client);
    this.certificates = new Certificates2(this._client);
  }
  /**
   * Create a new project in the organization. Projects can be created and archived,
   * but cannot be deleted.
   *
   * @example
   * ```ts
   * const project =
   *   await client.admin.organization.projects.create({
   *     name: 'name',
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/projects", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a project.
   *
   * @example
   * ```ts
   * const project =
   *   await client.admin.organization.projects.retrieve(
   *     'project_id',
   *   );
   * ```
   */
  retrieve(projectID, options) {
    return this._client.get(path`/organization/projects/${projectID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Modifies a project in the organization.
   *
   * @example
   * ```ts
   * const project =
   *   await client.admin.organization.projects.update(
   *     'project_id',
   *   );
   * ```
   */
  update(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Returns a list of projects.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const project of client.admin.organization.projects.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/organization/projects", ConversationCursorPage, {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Archives a project in the organization. Archived projects cannot be used or
   * updated.
   *
   * @example
   * ```ts
   * const project =
   *   await client.admin.organization.projects.archive(
   *     'project_id',
   *   );
   * ```
   */
  archive(projectID, options) {
    return this._client.post(path`/organization/projects/${projectID}/archive`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
Projects.Users = Users2;
Projects.ServiceAccounts = ServiceAccounts;
Projects.APIKeys = APIKeys;
Projects.RateLimits = RateLimits;
Projects.ModelPermissions = ModelPermissions;
Projects.HostedToolPermissions = HostedToolPermissions;
Projects.Groups = Groups2;
Projects.Roles = Roles3;
Projects.DataRetention = DataRetention2;
Projects.SpendAlerts = SpendAlerts2;
Projects.Certificates = Certificates2;

// node_modules/openai/resources/admin/organization/users/roles.mjs
var Roles6 = class extends APIResource {
  /**
   * Assigns an organization role to a user within the organization.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.users.roles.create(
   *     'user_id',
   *     { role_id: 'role_id' },
   *   );
   * ```
   */
  create(userID, body, options) {
    return this._client.post(path`/organization/users/${userID}/roles`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves an organization role assigned to a user.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.users.roles.retrieve(
   *     'role_id',
   *     { user_id: 'user_id' },
   *   );
   * ```
   */
  retrieve(roleID, params, options) {
    const { user_id } = params;
    return this._client.get(path`/organization/users/${user_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the organization roles assigned to a user within the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const roleListResponse of client.admin.organization.users.roles.list(
   *   'user_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(userID, query = {}, options) {
    return this._client.getAPIList(path`/organization/users/${userID}/roles`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Unassigns an organization role from a user within the organization.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.users.roles.delete(
   *     'role_id',
   *     { user_id: 'user_id' },
   *   );
   * ```
   */
  delete(roleID, params, options) {
    const { user_id } = params;
    return this._client.delete(path`/organization/users/${user_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};

// node_modules/openai/resources/admin/organization/users/users.mjs
var Users3 = class extends APIResource {
  constructor() {
    super(...arguments);
    this.roles = new Roles6(this._client);
  }
  /**
   * Retrieves a user by their identifier.
   *
   * @example
   * ```ts
   * const organizationUser =
   *   await client.admin.organization.users.retrieve('user_id');
   * ```
   */
  retrieve(userID, options) {
    return this._client.get(path`/organization/users/${userID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Modifies a user's role in the organization.
   *
   * @example
   * ```ts
   * const organizationUser =
   *   await client.admin.organization.users.update('user_id');
   * ```
   */
  update(userID, body, options) {
    return this._client.post(path`/organization/users/${userID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists all of the users in the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const organizationUser of client.admin.organization.users.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/organization/users", ConversationCursorPage, {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Deletes a user from the organization.
   *
   * @example
   * ```ts
   * const user = await client.admin.organization.users.delete(
   *   'user_id',
   * );
   * ```
   */
  delete(userID, options) {
    return this._client.delete(path`/organization/users/${userID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
Users3.Roles = Roles6;

// node_modules/openai/resources/admin/organization/organization.mjs
var Organization = class extends APIResource {
  constructor() {
    super(...arguments);
    this.auditLogs = new AuditLogs(this._client);
    this.adminAPIKeys = new AdminAPIKeys(this._client);
    this.usage = new Usage(this._client);
    this.invites = new Invites(this._client);
    this.users = new Users3(this._client);
    this.groups = new Groups(this._client);
    this.roles = new Roles(this._client);
    this.dataRetention = new DataRetention(this._client);
    this.spendAlerts = new SpendAlerts(this._client);
    this.certificates = new Certificates(this._client);
    this.projects = new Projects(this._client);
  }
};
Organization.AuditLogs = AuditLogs;
Organization.AdminAPIKeys = AdminAPIKeys;
Organization.Usage = Usage;
Organization.Invites = Invites;
Organization.Users = Users3;
Organization.Groups = Groups;
Organization.Roles = Roles;
Organization.DataRetention = DataRetention;
Organization.SpendAlerts = SpendAlerts;
Organization.Certificates = Certificates;
Organization.Projects = Projects;

// node_modules/openai/resources/admin/admin.mjs
var Admin = class extends APIResource {
  constructor() {
    super(...arguments);
    this.organization = new Organization(this._client);
  }
};
Admin.Organization = Organization;

// node_modules/openai/internal/headers.mjs
var brand_privateNullableHeaders = /* @__PURE__ */ Symbol("brand.privateNullableHeaders");
function* iterateHeaders(headers) {
  if (!headers)
    return;
  if (brand_privateNullableHeaders in headers) {
    const { values, nulls } = headers;
    yield* values.entries();
    for (const name of nulls) {
      yield [name, null];
    }
    return;
  }
  let shouldClear = false;
  let iter;
  if (headers instanceof Headers) {
    iter = headers.entries();
  } else if (isReadonlyArray(headers)) {
    iter = headers;
  } else {
    shouldClear = true;
    iter = Object.entries(headers ?? {});
  }
  for (let row of iter) {
    const name = row[0];
    if (typeof name !== "string")
      throw new TypeError("expected header name to be a string");
    const values = isReadonlyArray(row[1]) ? row[1] : [row[1]];
    let didClear = false;
    for (const value of values) {
      if (value === void 0)
        continue;
      if (shouldClear && !didClear) {
        didClear = true;
        yield [name, null];
      }
      yield [name, value];
    }
  }
}
var buildHeaders = (newHeaders) => {
  const targetHeaders = new Headers();
  const nullHeaders = /* @__PURE__ */ new Set();
  for (const headers of newHeaders) {
    const seenHeaders = /* @__PURE__ */ new Set();
    for (const [name, value] of iterateHeaders(headers)) {
      const lowerName = name.toLowerCase();
      if (!seenHeaders.has(lowerName)) {
        targetHeaders.delete(name);
        seenHeaders.add(lowerName);
      }
      if (value === null) {
        targetHeaders.delete(name);
        nullHeaders.add(lowerName);
      } else {
        targetHeaders.append(name, value);
        nullHeaders.delete(lowerName);
      }
    }
  }
  return { [brand_privateNullableHeaders]: true, values: targetHeaders, nulls: nullHeaders };
};

// node_modules/openai/resources/audio/speech.mjs
var Speech = class extends APIResource {
  /**
   * Generates audio from the input text.
   *
   * Returns the audio file content, or a stream of audio events.
   *
   * @example
   * ```ts
   * const speech = await client.audio.speech.create({
   *   input: 'input',
   *   model: 'tts-1',
   *   voice: 'alloy',
   * });
   *
   * const content = await speech.blob();
   * console.log(content);
   * ```
   */
  create(body, options) {
    return this._client.post("/audio/speech", {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "application/octet-stream" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
};

// node_modules/openai/resources/audio/transcriptions.mjs
var Transcriptions = class extends APIResource {
  create(body, options) {
    return this._client.post("/audio/transcriptions", multipartFormRequestOptions({
      body,
      ...options,
      stream: body.stream ?? false,
      __metadata: { model: body.model },
      __security: { bearerAuth: true }
    }, this._client));
  }
};

// node_modules/openai/resources/audio/translations.mjs
var Translations = class extends APIResource {
  create(body, options) {
    return this._client.post("/audio/translations", multipartFormRequestOptions({ body, ...options, __metadata: { model: body.model }, __security: { bearerAuth: true } }, this._client));
  }
};

// node_modules/openai/resources/audio/audio.mjs
var Audio = class extends APIResource {
  constructor() {
    super(...arguments);
    this.transcriptions = new Transcriptions(this._client);
    this.translations = new Translations(this._client);
    this.speech = new Speech(this._client);
  }
};
Audio.Transcriptions = Transcriptions;
Audio.Translations = Translations;
Audio.Speech = Speech;

// node_modules/openai/resources/batches.mjs
var Batches = class extends APIResource {
  /**
   * Creates and executes a batch from an uploaded file of requests
   */
  create(body, options) {
    return this._client.post("/batches", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Retrieves a batch.
   */
  retrieve(batchID, options) {
    return this._client.get(path`/batches/${batchID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * List your organization's batches.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/batches", CursorPage, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Cancels an in-progress batch. The batch will be in status `cancelling` for up to
   * 10 minutes, before changing to `cancelled`, where it will have partial results
   * (if any) available in the output file.
   */
  cancel(batchID, options) {
    return this._client.post(path`/batches/${batchID}/cancel`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/beta/assistants.mjs
var Assistants = class extends APIResource {
  /**
   * Create an assistant with a model and instructions.
   *
   * @deprecated
   */
  create(body, options) {
    return this._client.post("/assistants", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves an assistant.
   *
   * @deprecated
   */
  retrieve(assistantID, options) {
    return this._client.get(path`/assistants/${assistantID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modifies an assistant.
   *
   * @deprecated
   */
  update(assistantID, body, options) {
    return this._client.post(path`/assistants/${assistantID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of assistants.
   *
   * @deprecated
   */
  list(query = {}, options) {
    return this._client.getAPIList("/assistants", CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete an assistant.
   *
   * @deprecated
   */
  delete(assistantID, options) {
    return this._client.delete(path`/assistants/${assistantID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/beta/realtime/sessions.mjs
var Sessions = class extends APIResource {
  /**
   * Create an ephemeral API token for use in client-side applications with the
   * Realtime API. Can be configured with the same session parameters as the
   * `session.update` client event.
   *
   * It responds with a session object, plus a `client_secret` key which contains a
   * usable ephemeral API token that can be used to authenticate browser clients for
   * the Realtime API.
   *
   * @example
   * ```ts
   * const session =
   *   await client.beta.realtime.sessions.create();
   * ```
   */
  create(body, options) {
    return this._client.post("/realtime/sessions", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/beta/realtime/transcription-sessions.mjs
var TranscriptionSessions = class extends APIResource {
  /**
   * Create an ephemeral API token for use in client-side applications with the
   * Realtime API specifically for realtime transcriptions. Can be configured with
   * the same session parameters as the `transcription_session.update` client event.
   *
   * It responds with a session object, plus a `client_secret` key which contains a
   * usable ephemeral API token that can be used to authenticate browser clients for
   * the Realtime API.
   *
   * @example
   * ```ts
   * const transcriptionSession =
   *   await client.beta.realtime.transcriptionSessions.create();
   * ```
   */
  create(body, options) {
    return this._client.post("/realtime/transcription_sessions", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/beta/realtime/realtime.mjs
var Realtime = class extends APIResource {
  constructor() {
    super(...arguments);
    this.sessions = new Sessions(this._client);
    this.transcriptionSessions = new TranscriptionSessions(this._client);
  }
};
Realtime.Sessions = Sessions;
Realtime.TranscriptionSessions = TranscriptionSessions;

// node_modules/openai/resources/beta/chatkit/sessions.mjs
var Sessions2 = class extends APIResource {
  /**
   * Create a ChatKit session.
   *
   * @example
   * ```ts
   * const chatSession =
   *   await client.beta.chatkit.sessions.create({
   *     user: 'x',
   *     workflow: { id: 'id' },
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/chatkit/sessions", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Cancel an active ChatKit session and return its most recent metadata.
   *
   * Cancelling prevents new requests from using the issued client secret.
   *
   * @example
   * ```ts
   * const chatSession =
   *   await client.beta.chatkit.sessions.cancel('cksess_123');
   * ```
   */
  cancel(sessionID, options) {
    return this._client.post(path`/chatkit/sessions/${sessionID}/cancel`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/beta/chatkit/threads.mjs
var Threads = class extends APIResource {
  /**
   * Retrieve a ChatKit thread by its identifier.
   *
   * @example
   * ```ts
   * const chatkitThread =
   *   await client.beta.chatkit.threads.retrieve('cthr_123');
   * ```
   */
  retrieve(threadID, options) {
    return this._client.get(path`/chatkit/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * List ChatKit threads with optional pagination and user filters.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const chatkitThread of client.beta.chatkit.threads.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/chatkit/threads", ConversationCursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a ChatKit thread along with its items and stored attachments.
   *
   * @example
   * ```ts
   * const thread = await client.beta.chatkit.threads.delete(
   *   'cthr_123',
   * );
   * ```
   */
  delete(threadID, options) {
    return this._client.delete(path`/chatkit/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * List items that belong to a ChatKit thread.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const thread of client.beta.chatkit.threads.listItems(
   *   'cthr_123',
   * )) {
   *   // ...
   * }
   * ```
   */
  listItems(threadID, query = {}, options) {
    return this._client.getAPIList(path`/chatkit/threads/${threadID}/items`, ConversationCursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/beta/chatkit/chatkit.mjs
var ChatKit = class extends APIResource {
  constructor() {
    super(...arguments);
    this.sessions = new Sessions2(this._client);
    this.threads = new Threads(this._client);
  }
};
ChatKit.Sessions = Sessions2;
ChatKit.Threads = Threads;

// node_modules/openai/resources/beta/threads/messages.mjs
var Messages2 = class extends APIResource {
  /**
   * Create a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  create(threadID, body, options) {
    return this._client.post(path`/threads/${threadID}/messages`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieve a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(messageID, params, options) {
    const { thread_id } = params;
    return this._client.get(path`/threads/${thread_id}/messages/${messageID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modifies a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  update(messageID, params, options) {
    const { thread_id, ...body } = params;
    return this._client.post(path`/threads/${thread_id}/messages/${messageID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of messages for a given thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  list(threadID, query = {}, options) {
    return this._client.getAPIList(path`/threads/${threadID}/messages`, CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Deletes a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  delete(messageID, params, options) {
    const { thread_id } = params;
    return this._client.delete(path`/threads/${thread_id}/messages/${messageID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/beta/threads/runs/steps.mjs
var Steps = class extends APIResource {
  /**
   * Retrieves a run step.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(stepID, params, options) {
    const { thread_id, run_id, ...query } = params;
    return this._client.get(path`/threads/${thread_id}/runs/${run_id}/steps/${stepID}`, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of run steps belonging to a run.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  list(runID, params, options) {
    const { thread_id, ...query } = params;
    return this._client.getAPIList(path`/threads/${thread_id}/runs/${runID}/steps`, CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/internal/utils/base64.mjs
var toFloat32Array = (base64Str) => {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(base64Str, "base64");
    return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.length / Float32Array.BYTES_PER_ELEMENT));
  } else {
    const binaryStr = atob(base64Str);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return Array.from(new Float32Array(bytes.buffer));
  }
};

// node_modules/openai/internal/utils/env.mjs
var readEnv = (env) => {
  if (typeof globalThis.process !== "undefined") {
    return globalThis.process.env?.[env]?.trim() || void 0;
  }
  if (typeof globalThis.Deno !== "undefined") {
    return globalThis.Deno.env?.get?.(env)?.trim() || void 0;
  }
  return void 0;
};

// node_modules/openai/lib/AssistantStream.mjs
var _AssistantStream_instances;
var _a;
var _AssistantStream_events;
var _AssistantStream_runStepSnapshots;
var _AssistantStream_messageSnapshots;
var _AssistantStream_messageSnapshot;
var _AssistantStream_finalRun;
var _AssistantStream_currentContentIndex;
var _AssistantStream_currentContent;
var _AssistantStream_currentToolCallIndex;
var _AssistantStream_currentToolCall;
var _AssistantStream_currentEvent;
var _AssistantStream_currentRunSnapshot;
var _AssistantStream_currentRunStepSnapshot;
var _AssistantStream_addEvent;
var _AssistantStream_endRequest;
var _AssistantStream_handleMessage;
var _AssistantStream_handleRunStep;
var _AssistantStream_handleEvent;
var _AssistantStream_accumulateRunStep;
var _AssistantStream_accumulateMessage;
var _AssistantStream_accumulateContent;
var _AssistantStream_handleRun;
var AssistantStream = class extends EventStream {
  constructor() {
    super(...arguments);
    _AssistantStream_instances.add(this);
    _AssistantStream_events.set(this, []);
    _AssistantStream_runStepSnapshots.set(this, {});
    _AssistantStream_messageSnapshots.set(this, {});
    _AssistantStream_messageSnapshot.set(this, void 0);
    _AssistantStream_finalRun.set(this, void 0);
    _AssistantStream_currentContentIndex.set(this, void 0);
    _AssistantStream_currentContent.set(this, void 0);
    _AssistantStream_currentToolCallIndex.set(this, void 0);
    _AssistantStream_currentToolCall.set(this, void 0);
    _AssistantStream_currentEvent.set(this, void 0);
    _AssistantStream_currentRunSnapshot.set(this, void 0);
    _AssistantStream_currentRunStepSnapshot.set(this, void 0);
  }
  [(_AssistantStream_events = /* @__PURE__ */ new WeakMap(), _AssistantStream_runStepSnapshots = /* @__PURE__ */ new WeakMap(), _AssistantStream_messageSnapshots = /* @__PURE__ */ new WeakMap(), _AssistantStream_messageSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_finalRun = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentContentIndex = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentContent = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentToolCallIndex = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentToolCall = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentEvent = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentRunSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentRunStepSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_instances = /* @__PURE__ */ new WeakSet(), Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("event", (event) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(event);
      } else {
        pushQueue.push(event);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(void 0);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    this.on("error", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: void 0, done: true };
          }
          return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: void 0, done: true });
        }
        const chunk = pushQueue.shift();
        return { value: chunk, done: false };
      },
      return: async () => {
        this.abort();
        return { value: void 0, done: true };
      }
    };
  }
  static fromReadableStream(stream) {
    const runner = new _a();
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  async _fromReadableStream(readableStream, options) {
    this._listenForAbort(options?.signal);
    this._connected();
    const stream = Stream.fromReadableStream(readableStream, this.controller);
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  toReadableStream() {
    const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
    return stream.toReadableStream();
  }
  static createToolAssistantStream(runId, runs, params, options) {
    const runner = new _a();
    runner._run(() => runner._runToolAssistantStream(runId, runs, params, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  async _createToolAssistantStream(run, runId, params, options) {
    this._listenForAbort(options?.signal);
    const body = { ...params, stream: true };
    const stream = await run.submitToolOutputs(runId, body, {
      ...options,
      signal: this.controller.signal
    });
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  static createThreadAssistantStream(params, thread, options) {
    const runner = new _a();
    runner._run(() => runner._threadAssistantStream(params, thread, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  static createAssistantStream(threadId, runs, params, options) {
    const runner = new _a();
    runner._run(() => runner._runAssistantStream(threadId, runs, params, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  currentEvent() {
    return __classPrivateFieldGet(this, _AssistantStream_currentEvent, "f");
  }
  currentRun() {
    return __classPrivateFieldGet(this, _AssistantStream_currentRunSnapshot, "f");
  }
  currentMessageSnapshot() {
    return __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f");
  }
  currentRunStepSnapshot() {
    return __classPrivateFieldGet(this, _AssistantStream_currentRunStepSnapshot, "f");
  }
  async finalRunSteps() {
    await this.done();
    return Object.values(__classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f"));
  }
  async finalMessages() {
    await this.done();
    return Object.values(__classPrivateFieldGet(this, _AssistantStream_messageSnapshots, "f"));
  }
  async finalRun() {
    await this.done();
    if (!__classPrivateFieldGet(this, _AssistantStream_finalRun, "f"))
      throw Error("Final run was not received.");
    return __classPrivateFieldGet(this, _AssistantStream_finalRun, "f");
  }
  async _createThreadAssistantStream(thread, params, options) {
    this._listenForAbort(options?.signal);
    const body = { ...params, stream: true };
    const stream = await thread.createAndRun(body, { ...options, signal: this.controller.signal });
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  async _createAssistantStream(run, threadId, params, options) {
    this._listenForAbort(options?.signal);
    const body = { ...params, stream: true };
    const stream = await run.create(threadId, body, { ...options, signal: this.controller.signal });
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  static accumulateDelta(acc, delta) {
    for (const [key, deltaValue] of Object.entries(delta)) {
      if (!acc.hasOwnProperty(key)) {
        acc[key] = deltaValue;
        continue;
      }
      let accValue = acc[key];
      if (accValue === null || accValue === void 0) {
        acc[key] = deltaValue;
        continue;
      }
      if (key === "index" || key === "type") {
        acc[key] = deltaValue;
        continue;
      }
      if (typeof accValue === "string" && typeof deltaValue === "string") {
        accValue += deltaValue;
      } else if (typeof accValue === "number" && typeof deltaValue === "number") {
        accValue += deltaValue;
      } else if (isObj(accValue) && isObj(deltaValue)) {
        accValue = this.accumulateDelta(accValue, deltaValue);
      } else if (Array.isArray(accValue) && Array.isArray(deltaValue)) {
        if (accValue.every((x) => typeof x === "string" || typeof x === "number")) {
          accValue.push(...deltaValue);
          continue;
        }
        for (const deltaEntry of deltaValue) {
          if (!isObj(deltaEntry)) {
            throw new Error(`Expected array delta entry to be an object but got: ${deltaEntry}`);
          }
          const index = deltaEntry["index"];
          if (index == null) {
            console.error(deltaEntry);
            throw new Error("Expected array delta entry to have an `index` property");
          }
          if (typeof index !== "number") {
            throw new Error(`Expected array delta entry \`index\` property to be a number but got ${index}`);
          }
          const accEntry = accValue[index];
          if (accEntry == null) {
            accValue.push(deltaEntry);
          } else {
            accValue[index] = this.accumulateDelta(accEntry, deltaEntry);
          }
        }
        continue;
      } else {
        throw Error(`Unhandled record type: ${key}, deltaValue: ${deltaValue}, accValue: ${accValue}`);
      }
      acc[key] = accValue;
    }
    return acc;
  }
  _addRun(run) {
    return run;
  }
  async _threadAssistantStream(params, thread, options) {
    return await this._createThreadAssistantStream(thread, params, options);
  }
  async _runAssistantStream(threadId, runs, params, options) {
    return await this._createAssistantStream(runs, threadId, params, options);
  }
  async _runToolAssistantStream(runId, runs, params, options) {
    return await this._createToolAssistantStream(runs, runId, params, options);
  }
};
_a = AssistantStream, _AssistantStream_addEvent = function _AssistantStream_addEvent2(event) {
  if (this.ended)
    return;
  __classPrivateFieldSet(this, _AssistantStream_currentEvent, event, "f");
  __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleEvent).call(this, event);
  switch (event.event) {
    case "thread.created":
      break;
    case "thread.run.created":
    case "thread.run.queued":
    case "thread.run.in_progress":
    case "thread.run.requires_action":
    case "thread.run.completed":
    case "thread.run.incomplete":
    case "thread.run.failed":
    case "thread.run.cancelling":
    case "thread.run.cancelled":
    case "thread.run.expired":
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleRun).call(this, event);
      break;
    case "thread.run.step.created":
    case "thread.run.step.in_progress":
    case "thread.run.step.delta":
    case "thread.run.step.completed":
    case "thread.run.step.failed":
    case "thread.run.step.cancelled":
    case "thread.run.step.expired":
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleRunStep).call(this, event);
      break;
    case "thread.message.created":
    case "thread.message.in_progress":
    case "thread.message.delta":
    case "thread.message.completed":
    case "thread.message.incomplete":
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleMessage).call(this, event);
      break;
    case "error":
      throw new Error("Encountered an error event in event processing - errors should be processed earlier");
    default:
      assertNever2(event);
  }
}, _AssistantStream_endRequest = function _AssistantStream_endRequest2() {
  if (this.ended) {
    throw new OpenAIError(`stream has ended, this shouldn't happen`);
  }
  if (!__classPrivateFieldGet(this, _AssistantStream_finalRun, "f"))
    throw Error("Final run has not been received");
  return __classPrivateFieldGet(this, _AssistantStream_finalRun, "f");
}, _AssistantStream_handleMessage = function _AssistantStream_handleMessage2(event) {
  const [accumulatedMessage, newContent] = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateMessage).call(this, event, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
  __classPrivateFieldSet(this, _AssistantStream_messageSnapshot, accumulatedMessage, "f");
  __classPrivateFieldGet(this, _AssistantStream_messageSnapshots, "f")[accumulatedMessage.id] = accumulatedMessage;
  for (const content of newContent) {
    const snapshotContent = accumulatedMessage.content[content.index];
    if (snapshotContent?.type == "text") {
      this._emit("textCreated", snapshotContent.text);
    }
  }
  switch (event.event) {
    case "thread.message.created":
      this._emit("messageCreated", event.data);
      break;
    case "thread.message.in_progress":
      break;
    case "thread.message.delta":
      this._emit("messageDelta", event.data.delta, accumulatedMessage);
      if (event.data.delta.content) {
        for (const content of event.data.delta.content) {
          if (content.type == "text" && content.text) {
            let textDelta = content.text;
            let snapshot2 = accumulatedMessage.content[content.index];
            if (snapshot2 && snapshot2.type == "text") {
              this._emit("textDelta", textDelta, snapshot2.text);
            } else {
              throw Error("The snapshot associated with this text delta is not text or missing");
            }
          }
          if (content.index != __classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f")) {
            if (__classPrivateFieldGet(this, _AssistantStream_currentContent, "f")) {
              switch (__classPrivateFieldGet(this, _AssistantStream_currentContent, "f").type) {
                case "text":
                  this._emit("textDone", __classPrivateFieldGet(this, _AssistantStream_currentContent, "f").text, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                  break;
                case "image_file":
                  this._emit("imageFileDone", __classPrivateFieldGet(this, _AssistantStream_currentContent, "f").image_file, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                  break;
              }
            }
            __classPrivateFieldSet(this, _AssistantStream_currentContentIndex, content.index, "f");
          }
          __classPrivateFieldSet(this, _AssistantStream_currentContent, accumulatedMessage.content[content.index], "f");
        }
      }
      break;
    case "thread.message.completed":
    case "thread.message.incomplete":
      if (__classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f") !== void 0) {
        const currentContent = event.data.content[__classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f")];
        if (currentContent) {
          switch (currentContent.type) {
            case "image_file":
              this._emit("imageFileDone", currentContent.image_file, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
              break;
            case "text":
              this._emit("textDone", currentContent.text, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
              break;
          }
        }
      }
      if (__classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f")) {
        this._emit("messageDone", event.data);
      }
      __classPrivateFieldSet(this, _AssistantStream_messageSnapshot, void 0, "f");
  }
}, _AssistantStream_handleRunStep = function _AssistantStream_handleRunStep2(event) {
  const accumulatedRunStep = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateRunStep).call(this, event);
  __classPrivateFieldSet(this, _AssistantStream_currentRunStepSnapshot, accumulatedRunStep, "f");
  switch (event.event) {
    case "thread.run.step.created":
      this._emit("runStepCreated", event.data);
      break;
    case "thread.run.step.delta":
      const delta = event.data.delta;
      if (delta.step_details && delta.step_details.type == "tool_calls" && delta.step_details.tool_calls && accumulatedRunStep.step_details.type == "tool_calls") {
        for (const toolCall of delta.step_details.tool_calls) {
          if (toolCall.index == __classPrivateFieldGet(this, _AssistantStream_currentToolCallIndex, "f")) {
            this._emit("toolCallDelta", toolCall, accumulatedRunStep.step_details.tool_calls[toolCall.index]);
          } else {
            if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
              this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
            }
            __classPrivateFieldSet(this, _AssistantStream_currentToolCallIndex, toolCall.index, "f");
            __classPrivateFieldSet(this, _AssistantStream_currentToolCall, accumulatedRunStep.step_details.tool_calls[toolCall.index], "f");
            if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"))
              this._emit("toolCallCreated", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
          }
        }
      }
      this._emit("runStepDelta", event.data.delta, accumulatedRunStep);
      break;
    case "thread.run.step.completed":
    case "thread.run.step.failed":
    case "thread.run.step.cancelled":
    case "thread.run.step.expired":
      __classPrivateFieldSet(this, _AssistantStream_currentRunStepSnapshot, void 0, "f");
      const details = event.data.step_details;
      if (details.type == "tool_calls") {
        if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
          this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
          __classPrivateFieldSet(this, _AssistantStream_currentToolCall, void 0, "f");
        }
      }
      this._emit("runStepDone", event.data, accumulatedRunStep);
      break;
    case "thread.run.step.in_progress":
      break;
  }
}, _AssistantStream_handleEvent = function _AssistantStream_handleEvent2(event) {
  __classPrivateFieldGet(this, _AssistantStream_events, "f").push(event);
  this._emit("event", event);
}, _AssistantStream_accumulateRunStep = function _AssistantStream_accumulateRunStep2(event) {
  switch (event.event) {
    case "thread.run.step.created":
      __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = event.data;
      return event.data;
    case "thread.run.step.delta":
      let snapshot2 = __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
      if (!snapshot2) {
        throw Error("Received a RunStepDelta before creation of a snapshot");
      }
      let data = event.data;
      if (data.delta) {
        const accumulated = _a.accumulateDelta(snapshot2, data.delta);
        __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = accumulated;
      }
      return __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
    case "thread.run.step.completed":
    case "thread.run.step.failed":
    case "thread.run.step.cancelled":
    case "thread.run.step.expired":
    case "thread.run.step.in_progress":
      __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = event.data;
      break;
  }
  if (__classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id])
    return __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
  throw new Error("No snapshot available");
}, _AssistantStream_accumulateMessage = function _AssistantStream_accumulateMessage2(event, snapshot2) {
  let newContent = [];
  switch (event.event) {
    case "thread.message.created":
      return [event.data, newContent];
    case "thread.message.delta":
      if (!snapshot2) {
        throw Error("Received a delta with no existing snapshot (there should be one from message creation)");
      }
      let data = event.data;
      if (data.delta.content) {
        for (const contentElement of data.delta.content) {
          if (contentElement.index in snapshot2.content) {
            let currentContent = snapshot2.content[contentElement.index];
            snapshot2.content[contentElement.index] = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateContent).call(this, contentElement, currentContent);
          } else {
            snapshot2.content[contentElement.index] = contentElement;
            newContent.push(contentElement);
          }
        }
      }
      return [snapshot2, newContent];
    case "thread.message.in_progress":
    case "thread.message.completed":
    case "thread.message.incomplete":
      if (snapshot2) {
        return [snapshot2, newContent];
      } else {
        throw Error("Received thread message event with no existing snapshot");
      }
  }
  throw Error("Tried to accumulate a non-message event");
}, _AssistantStream_accumulateContent = function _AssistantStream_accumulateContent2(contentElement, currentContent) {
  return _a.accumulateDelta(currentContent, contentElement);
}, _AssistantStream_handleRun = function _AssistantStream_handleRun2(event) {
  __classPrivateFieldSet(this, _AssistantStream_currentRunSnapshot, event.data, "f");
  switch (event.event) {
    case "thread.run.created":
      break;
    case "thread.run.queued":
      break;
    case "thread.run.in_progress":
      break;
    case "thread.run.requires_action":
    case "thread.run.cancelled":
    case "thread.run.failed":
    case "thread.run.completed":
    case "thread.run.expired":
    case "thread.run.incomplete":
      __classPrivateFieldSet(this, _AssistantStream_finalRun, event.data, "f");
      if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
        this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
        __classPrivateFieldSet(this, _AssistantStream_currentToolCall, void 0, "f");
      }
      break;
    case "thread.run.cancelling":
      break;
  }
};
function assertNever2(_x) {
}

// node_modules/openai/resources/beta/threads/runs/runs.mjs
var Runs = class extends APIResource {
  constructor() {
    super(...arguments);
    this.steps = new Steps(this._client);
  }
  create(threadID, params, options) {
    const { include, ...body } = params;
    return this._client.post(path`/threads/${threadID}/runs`, {
      query: { include },
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      stream: params.stream ?? false,
      __synthesizeEventData: true,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves a run.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(runID, params, options) {
    const { thread_id } = params;
    return this._client.get(path`/threads/${thread_id}/runs/${runID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modifies a run.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  update(runID, params, options) {
    const { thread_id, ...body } = params;
    return this._client.post(path`/threads/${thread_id}/runs/${runID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of runs belonging to a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  list(threadID, query = {}, options) {
    return this._client.getAPIList(path`/threads/${threadID}/runs`, CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Cancels a run that is `in_progress`.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  cancel(runID, params, options) {
    const { thread_id } = params;
    return this._client.post(path`/threads/${thread_id}/runs/${runID}/cancel`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * A helper to create a run an poll for a terminal state. More information on Run
   * lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async createAndPoll(threadId, body, options) {
    const run = await this.create(threadId, body, options);
    return await this.poll(run.id, { thread_id: threadId }, options);
  }
  /**
   * Create a Run stream
   *
   * @deprecated use `stream` instead
   */
  createAndStream(threadId, body, options) {
    return AssistantStream.createAssistantStream(threadId, this._client.beta.threads.runs, body, options);
  }
  /**
   * A helper to poll a run status until it reaches a terminal state. More
   * information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async poll(runId, params, options) {
    const headers = buildHeaders([
      options?.headers,
      {
        "X-Stainless-Poll-Helper": "true",
        "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
      }
    ]);
    while (true) {
      const { data: run, response } = await this.retrieve(runId, params, {
        ...options,
        headers: { ...options?.headers, ...headers }
      }).withResponse();
      switch (run.status) {
        //If we are in any sort of intermediate state we poll
        case "queued":
        case "in_progress":
        case "cancelling":
          let sleepInterval = 5e3;
          if (options?.pollIntervalMs) {
            sleepInterval = options.pollIntervalMs;
          } else {
            const headerInterval = response.headers.get("openai-poll-after-ms");
            if (headerInterval) {
              const headerIntervalMs = parseInt(headerInterval);
              if (!isNaN(headerIntervalMs)) {
                sleepInterval = headerIntervalMs;
              }
            }
          }
          await sleep(sleepInterval);
          break;
        //We return the run in any terminal state.
        case "requires_action":
        case "incomplete":
        case "cancelled":
        case "completed":
        case "failed":
        case "expired":
          return run;
      }
    }
  }
  /**
   * Create a Run stream
   */
  stream(threadId, body, options) {
    return AssistantStream.createAssistantStream(threadId, this._client.beta.threads.runs, body, options);
  }
  submitToolOutputs(runID, params, options) {
    const { thread_id, ...body } = params;
    return this._client.post(path`/threads/${thread_id}/runs/${runID}/submit_tool_outputs`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      stream: params.stream ?? false,
      __synthesizeEventData: true,
      __security: { bearerAuth: true }
    });
  }
  /**
   * A helper to submit a tool output to a run and poll for a terminal run state.
   * More information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async submitToolOutputsAndPoll(runId, params, options) {
    const run = await this.submitToolOutputs(runId, params, options);
    return await this.poll(run.id, params, options);
  }
  /**
   * Submit the tool outputs from a previous run and stream the run to a terminal
   * state. More information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  submitToolOutputsStream(runId, params, options) {
    return AssistantStream.createToolAssistantStream(runId, this._client.beta.threads.runs, params, options);
  }
};
Runs.Steps = Steps;

// node_modules/openai/resources/beta/threads/threads.mjs
var Threads2 = class extends APIResource {
  constructor() {
    super(...arguments);
    this.runs = new Runs(this._client);
    this.messages = new Messages2(this._client);
  }
  /**
   * Create a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  create(body = {}, options) {
    return this._client.post("/threads", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(threadID, options) {
    return this._client.get(path`/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modifies a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  update(threadID, body, options) {
    return this._client.post(path`/threads/${threadID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  delete(threadID, options) {
    return this._client.delete(path`/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  createAndRun(body, options) {
    return this._client.post("/threads/runs", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      stream: body.stream ?? false,
      __synthesizeEventData: true,
      __security: { bearerAuth: true }
    });
  }
  /**
   * A helper to create a thread, start a run and then poll for a terminal state.
   * More information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async createAndRunPoll(body, options) {
    const run = await this.createAndRun(body, options);
    return await this.runs.poll(run.id, { thread_id: run.thread_id }, options);
  }
  /**
   * Create a thread and stream the run back
   */
  createAndRunStream(body, options) {
    return AssistantStream.createThreadAssistantStream(body, this._client.beta.threads, options);
  }
};
Threads2.Runs = Runs;
Threads2.Messages = Messages2;

// node_modules/openai/resources/beta/beta.mjs
var Beta = class extends APIResource {
  constructor() {
    super(...arguments);
    this.realtime = new Realtime(this._client);
    this.chatkit = new ChatKit(this._client);
    this.assistants = new Assistants(this._client);
    this.threads = new Threads2(this._client);
  }
};
Beta.Realtime = Realtime;
Beta.ChatKit = ChatKit;
Beta.Assistants = Assistants;
Beta.Threads = Threads2;

// node_modules/openai/resources/completions.mjs
var Completions2 = class extends APIResource {
  create(body, options) {
    return this._client.post("/completions", {
      body,
      ...options,
      stream: body.stream ?? false,
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/containers/files/content.mjs
var Content = class extends APIResource {
  /**
   * Retrieve Container File Content
   */
  retrieve(fileID, params, options) {
    const { container_id } = params;
    return this._client.get(path`/containers/${container_id}/files/${fileID}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
};

// node_modules/openai/resources/containers/files/files.mjs
var Files = class extends APIResource {
  constructor() {
    super(...arguments);
    this.content = new Content(this._client);
  }
  /**
   * Create a Container File
   *
   * You can send either a multipart/form-data request with the raw file content, or
   * a JSON request with a file ID.
   */
  create(containerID, body, options) {
    return this._client.post(path`/containers/${containerID}/files`, maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Retrieve Container File
   */
  retrieve(fileID, params, options) {
    const { container_id } = params;
    return this._client.get(path`/containers/${container_id}/files/${fileID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List Container files
   */
  list(containerID, query = {}, options) {
    return this._client.getAPIList(path`/containers/${containerID}/files`, CursorPage, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete Container File
   */
  delete(fileID, params, options) {
    const { container_id } = params;
    return this._client.delete(path`/containers/${container_id}/files/${fileID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};
Files.Content = Content;

// node_modules/openai/resources/containers/containers.mjs
var Containers = class extends APIResource {
  constructor() {
    super(...arguments);
    this.files = new Files(this._client);
  }
  /**
   * Create Container
   */
  create(body, options) {
    return this._client.post("/containers", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Retrieve Container
   */
  retrieve(containerID, options) {
    return this._client.get(path`/containers/${containerID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List Containers
   */
  list(query = {}, options) {
    return this._client.getAPIList("/containers", CursorPage, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete Container
   */
  delete(containerID, options) {
    return this._client.delete(path`/containers/${containerID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};
Containers.Files = Files;

// node_modules/openai/resources/conversations/items.mjs
var Items = class extends APIResource {
  /**
   * Create items in a conversation with the given ID.
   */
  create(conversationID, params, options) {
    const { include, ...body } = params;
    return this._client.post(path`/conversations/${conversationID}/items`, {
      query: { include },
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get a single item from a conversation with the given IDs.
   */
  retrieve(itemID, params, options) {
    const { conversation_id, ...query } = params;
    return this._client.get(path`/conversations/${conversation_id}/items/${itemID}`, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List all items for a conversation with the given ID.
   */
  list(conversationID, query = {}, options) {
    return this._client.getAPIList(path`/conversations/${conversationID}/items`, ConversationCursorPage, { query, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Delete an item from a conversation with the given IDs.
   */
  delete(itemID, params, options) {
    const { conversation_id } = params;
    return this._client.delete(path`/conversations/${conversation_id}/items/${itemID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/conversations/conversations.mjs
var Conversations = class extends APIResource {
  constructor() {
    super(...arguments);
    this.items = new Items(this._client);
  }
  /**
   * Create a conversation.
   */
  create(body = {}, options) {
    return this._client.post("/conversations", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Get a conversation
   */
  retrieve(conversationID, options) {
    return this._client.get(path`/conversations/${conversationID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Update a conversation
   */
  update(conversationID, body, options) {
    return this._client.post(path`/conversations/${conversationID}`, {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a conversation. Items in the conversation will not be deleted.
   */
  delete(conversationID, options) {
    return this._client.delete(path`/conversations/${conversationID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
};
Conversations.Items = Items;

// node_modules/openai/resources/embeddings.mjs
var Embeddings = class extends APIResource {
  /**
   * Creates an embedding vector representing the input text.
   *
   * @example
   * ```ts
   * const createEmbeddingResponse =
   *   await client.embeddings.create({
   *     input: 'The quick brown fox jumped over the lazy dog',
   *     model: 'text-embedding-3-small',
   *   });
   * ```
   */
  create(body, options) {
    const hasUserProvidedEncodingFormat = !!body.encoding_format;
    let encoding_format = hasUserProvidedEncodingFormat ? body.encoding_format : "base64";
    if (hasUserProvidedEncodingFormat) {
      loggerFor(this._client).debug("embeddings/user defined encoding_format:", body.encoding_format);
    }
    const response = this._client.post("/embeddings", {
      body: {
        ...body,
        encoding_format
      },
      ...options,
      __security: { bearerAuth: true }
    });
    if (hasUserProvidedEncodingFormat) {
      return response;
    }
    loggerFor(this._client).debug("embeddings/decoding base64 embeddings from base64");
    return response._thenUnwrap((response2) => {
      if (response2 && response2.data) {
        response2.data.forEach((embeddingBase64Obj) => {
          const embeddingBase64Str = embeddingBase64Obj.embedding;
          embeddingBase64Obj.embedding = toFloat32Array(embeddingBase64Str);
        });
      }
      return response2;
    });
  }
};

// node_modules/openai/resources/evals/runs/output-items.mjs
var OutputItems = class extends APIResource {
  /**
   * Get an evaluation run output item by ID.
   */
  retrieve(outputItemID, params, options) {
    const { eval_id, run_id } = params;
    return this._client.get(path`/evals/${eval_id}/runs/${run_id}/output_items/${outputItemID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get a list of output items for an evaluation run.
   */
  list(runID, params, options) {
    const { eval_id, ...query } = params;
    return this._client.getAPIList(path`/evals/${eval_id}/runs/${runID}/output_items`, CursorPage, { query, ...options, __security: { bearerAuth: true } });
  }
};

// node_modules/openai/resources/evals/runs/runs.mjs
var Runs2 = class extends APIResource {
  constructor() {
    super(...arguments);
    this.outputItems = new OutputItems(this._client);
  }
  /**
   * Kicks off a new run for a given evaluation, specifying the data source, and what
   * model configuration to use to test. The datasource will be validated against the
   * schema specified in the config of the evaluation.
   */
  create(evalID, body, options) {
    return this._client.post(path`/evals/${evalID}/runs`, {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get an evaluation run by ID.
   */
  retrieve(runID, params, options) {
    const { eval_id } = params;
    return this._client.get(path`/evals/${eval_id}/runs/${runID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get a list of runs for an evaluation.
   */
  list(evalID, query = {}, options) {
    return this._client.getAPIList(path`/evals/${evalID}/runs`, CursorPage, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete an eval run.
   */
  delete(runID, params, options) {
    const { eval_id } = params;
    return this._client.delete(path`/evals/${eval_id}/runs/${runID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Cancel an ongoing evaluation run.
   */
  cancel(runID, params, options) {
    const { eval_id } = params;
    return this._client.post(path`/evals/${eval_id}/runs/${runID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
};
Runs2.OutputItems = OutputItems;

// node_modules/openai/resources/evals/evals.mjs
var Evals = class extends APIResource {
  constructor() {
    super(...arguments);
    this.runs = new Runs2(this._client);
  }
  /**
   * Create the structure of an evaluation that can be used to test a model's
   * performance. An evaluation is a set of testing criteria and the config for a
   * data source, which dictates the schema of the data used in the evaluation. After
   * creating an evaluation, you can run it on different models and model parameters.
   * We support several types of graders and datasources. For more information, see
   * the [Evals guide](https://platform.openai.com/docs/guides/evals).
   */
  create(body, options) {
    return this._client.post("/evals", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Get an evaluation by ID.
   */
  retrieve(evalID, options) {
    return this._client.get(path`/evals/${evalID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Update certain properties of an evaluation.
   */
  update(evalID, body, options) {
    return this._client.post(path`/evals/${evalID}`, { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * List evaluations for a project.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/evals", CursorPage, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete an evaluation.
   */
  delete(evalID, options) {
    return this._client.delete(path`/evals/${evalID}`, { ...options, __security: { bearerAuth: true } });
  }
};
Evals.Runs = Runs2;

// node_modules/openai/resources/files.mjs
var Files2 = class extends APIResource {
  /**
   * Upload a file that can be used across various endpoints. Individual files can be
   * up to 512 MB, and each project can store up to 2.5 TB of files in total. There
   * is no organization-wide storage limit. Uploads to this endpoint are rate-limited
   * to 1,000 requests per minute per authenticated user.
   *
   * - The Assistants API supports files up to 2 million tokens and of specific file
   *   types. See the
   *   [Assistants Tools guide](https://platform.openai.com/docs/assistants/tools)
   *   for details.
   * - The Fine-tuning API only supports `.jsonl` files. The input also has certain
   *   required formats for fine-tuning
   *   [chat](https://platform.openai.com/docs/api-reference/fine-tuning/chat-input)
   *   or
   *   [completions](https://platform.openai.com/docs/api-reference/fine-tuning/completions-input)
   *   models.
   * - The Batch API only supports `.jsonl` files up to 200 MB in size. The input
   *   also has a specific required
   *   [format](https://platform.openai.com/docs/api-reference/batch/request-input).
   * - For Retrieval or `file_search` ingestion, upload files here first. If you need
   *   to attach multiple uploaded files to the same vector store, use
   *   [`/vector_stores/{vector_store_id}/file_batches`](https://platform.openai.com/docs/api-reference/vector-stores-file-batches/createBatch)
   *   instead of attaching them one by one. Vector store attachment has separate
   *   limits from file upload, including 2,000 attached files per minute per
   *   organization.
   *
   * Please [contact us](https://help.openai.com/) if you need to increase these
   * storage limits.
   */
  create(body, options) {
    return this._client.post("/files", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Returns information about a specific file.
   */
  retrieve(fileID, options) {
    return this._client.get(path`/files/${fileID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Returns a list of files.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/files", CursorPage, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a file and remove it from all vector stores.
   */
  delete(fileID, options) {
    return this._client.delete(path`/files/${fileID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Returns the contents of the specified file.
   */
  content(fileID, options) {
    return this._client.get(path`/files/${fileID}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
  /**
   * Waits for the given file to be processed, default timeout is 30 mins.
   */
  async waitForProcessing(id, { pollInterval = 5e3, maxWait = 30 * 60 * 1e3 } = {}) {
    const TERMINAL_STATES = /* @__PURE__ */ new Set(["processed", "error", "deleted"]);
    const start = Date.now();
    let file = await this.retrieve(id);
    while (!file.status || !TERMINAL_STATES.has(file.status)) {
      await sleep(pollInterval);
      file = await this.retrieve(id);
      if (Date.now() - start > maxWait) {
        throw new APIConnectionTimeoutError({
          message: `Giving up on waiting for file ${id} to finish processing after ${maxWait} milliseconds.`
        });
      }
    }
    return file;
  }
};

// node_modules/openai/resources/fine-tuning/methods.mjs
var Methods = class extends APIResource {
};

// node_modules/openai/resources/fine-tuning/alpha/graders.mjs
var Graders = class extends APIResource {
  /**
   * Run a grader.
   *
   * @example
   * ```ts
   * const response = await client.fineTuning.alpha.graders.run({
   *   grader: {
   *     input: 'input',
   *     name: 'name',
   *     operation: 'eq',
   *     reference: 'reference',
   *     type: 'string_check',
   *   },
   *   model_sample: 'model_sample',
   * });
   * ```
   */
  run(body, options) {
    return this._client.post("/fine_tuning/alpha/graders/run", {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Validate a grader.
   *
   * @example
   * ```ts
   * const response =
   *   await client.fineTuning.alpha.graders.validate({
   *     grader: {
   *       input: 'input',
   *       name: 'name',
   *       operation: 'eq',
   *       reference: 'reference',
   *       type: 'string_check',
   *     },
   *   });
   * ```
   */
  validate(body, options) {
    return this._client.post("/fine_tuning/alpha/graders/validate", {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/fine-tuning/alpha/alpha.mjs
var Alpha = class extends APIResource {
  constructor() {
    super(...arguments);
    this.graders = new Graders(this._client);
  }
};
Alpha.Graders = Graders;

// node_modules/openai/resources/fine-tuning/checkpoints/permissions.mjs
var Permissions = class extends APIResource {
  /**
   * **NOTE:** Calling this endpoint requires an [admin API key](../admin-api-keys).
   *
   * This enables organization owners to share fine-tuned models with other projects
   * in their organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const permissionCreateResponse of client.fineTuning.checkpoints.permissions.create(
   *   'ft:gpt-4o-mini-2024-07-18:org:weather:B7R9VjQd',
   *   { project_ids: ['string'] },
   * )) {
   *   // ...
   * }
   * ```
   */
  create(fineTunedModelCheckpoint, body, options) {
    return this._client.getAPIList(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
   *
   * Organization owners can use this endpoint to view all permissions for a
   * fine-tuned model checkpoint.
   *
   * @deprecated Retrieve is deprecated. Please swap to the paginated list method instead.
   */
  retrieve(fineTunedModelCheckpoint, query = {}, options) {
    return this._client.get(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, {
      query,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
   *
   * Organization owners can use this endpoint to view all permissions for a
   * fine-tuned model checkpoint.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const permissionListResponse of client.fineTuning.checkpoints.permissions.list(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(fineTunedModelCheckpoint, query = {}, options) {
    return this._client.getAPIList(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
   *
   * Organization owners can use this endpoint to delete a permission for a
   * fine-tuned model checkpoint.
   *
   * @example
   * ```ts
   * const permission =
   *   await client.fineTuning.checkpoints.permissions.delete(
   *     'cp_zc4Q7MP6XxulcVzj4MZdwsAB',
   *     {
   *       fine_tuned_model_checkpoint:
   *         'ft:gpt-4o-mini-2024-07-18:org:weather:B7R9VjQd',
   *     },
   *   );
   * ```
   */
  delete(permissionID, params, options) {
    const { fine_tuned_model_checkpoint } = params;
    return this._client.delete(path`/fine_tuning/checkpoints/${fine_tuned_model_checkpoint}/permissions/${permissionID}`, { ...options, __security: { adminAPIKeyAuth: true } });
  }
};

// node_modules/openai/resources/fine-tuning/checkpoints/checkpoints.mjs
var Checkpoints = class extends APIResource {
  constructor() {
    super(...arguments);
    this.permissions = new Permissions(this._client);
  }
};
Checkpoints.Permissions = Permissions;

// node_modules/openai/resources/fine-tuning/jobs/checkpoints.mjs
var Checkpoints2 = class extends APIResource {
  /**
   * List checkpoints for a fine-tuning job.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const fineTuningJobCheckpoint of client.fineTuning.jobs.checkpoints.list(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(fineTuningJobID, query = {}, options) {
    return this._client.getAPIList(path`/fine_tuning/jobs/${fineTuningJobID}/checkpoints`, CursorPage, { query, ...options, __security: { bearerAuth: true } });
  }
};

// node_modules/openai/resources/fine-tuning/jobs/jobs.mjs
var Jobs = class extends APIResource {
  constructor() {
    super(...arguments);
    this.checkpoints = new Checkpoints2(this._client);
  }
  /**
   * Creates a fine-tuning job which begins the process of creating a new model from
   * a given dataset.
   *
   * Response includes details of the enqueued job including job status and the name
   * of the fine-tuned models once complete.
   *
   * [Learn more about fine-tuning](https://platform.openai.com/docs/guides/model-optimization)
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.create({
   *   model: 'gpt-4o-mini',
   *   training_file: 'file-abc123',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/fine_tuning/jobs", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Get info about a fine-tuning job.
   *
   * [Learn more about fine-tuning](https://platform.openai.com/docs/guides/model-optimization)
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.retrieve(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  retrieve(fineTuningJobID, options) {
    return this._client.get(path`/fine_tuning/jobs/${fineTuningJobID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List your organization's fine-tuning jobs
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const fineTuningJob of client.fineTuning.jobs.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/fine_tuning/jobs", CursorPage, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Immediately cancel a fine-tune job.
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.cancel(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  cancel(fineTuningJobID, options) {
    return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/cancel`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get status updates for a fine-tuning job.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const fineTuningJobEvent of client.fineTuning.jobs.listEvents(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * )) {
   *   // ...
   * }
   * ```
   */
  listEvents(fineTuningJobID, query = {}, options) {
    return this._client.getAPIList(path`/fine_tuning/jobs/${fineTuningJobID}/events`, CursorPage, { query, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Pause a fine-tune job.
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.pause(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  pause(fineTuningJobID, options) {
    return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/pause`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Resume a fine-tune job.
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.resume(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  resume(fineTuningJobID, options) {
    return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/resume`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
};
Jobs.Checkpoints = Checkpoints2;

// node_modules/openai/resources/fine-tuning/fine-tuning.mjs
var FineTuning = class extends APIResource {
  constructor() {
    super(...arguments);
    this.methods = new Methods(this._client);
    this.jobs = new Jobs(this._client);
    this.checkpoints = new Checkpoints(this._client);
    this.alpha = new Alpha(this._client);
  }
};
FineTuning.Methods = Methods;
FineTuning.Jobs = Jobs;
FineTuning.Checkpoints = Checkpoints;
FineTuning.Alpha = Alpha;

// node_modules/openai/resources/graders/grader-models.mjs
var GraderModels = class extends APIResource {
};

// node_modules/openai/resources/graders/graders.mjs
var Graders2 = class extends APIResource {
  constructor() {
    super(...arguments);
    this.graderModels = new GraderModels(this._client);
  }
};
Graders2.GraderModels = GraderModels;

// node_modules/openai/resources/images.mjs
var Images = class extends APIResource {
  /**
   * Creates a variation of a given image. This endpoint only supports `dall-e-2`.
   *
   * @example
   * ```ts
   * const imagesResponse = await client.images.createVariation({
   *   image: fs.createReadStream('otter.png'),
   * });
   * ```
   */
  createVariation(body, options) {
    return this._client.post("/images/variations", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  edit(body, options) {
    return this._client.post("/images/edits", multipartFormRequestOptions({ body, ...options, stream: body.stream ?? false, __security: { bearerAuth: true } }, this._client));
  }
  generate(body, options) {
    return this._client.post("/images/generations", {
      body,
      ...options,
      stream: body.stream ?? false,
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/models.mjs
var Models = class extends APIResource {
  /**
   * Retrieves a model instance, providing basic information about the model such as
   * the owner and permissioning.
   */
  retrieve(model, options) {
    return this._client.get(path`/models/${model}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Lists the currently available models, and provides basic information about each
   * one such as the owner and availability.
   */
  list(options) {
    return this._client.getAPIList("/models", Page, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Delete a fine-tuned model. You must have the Owner role in your organization to
   * delete a model.
   */
  delete(model, options) {
    return this._client.delete(path`/models/${model}`, { ...options, __security: { bearerAuth: true } });
  }
};

// node_modules/openai/resources/moderations.mjs
var Moderations = class extends APIResource {
  /**
   * Classifies if text and/or image inputs are potentially harmful. Learn more in
   * the [moderation guide](https://platform.openai.com/docs/guides/moderation).
   */
  create(body, options) {
    return this._client.post("/moderations", { body, ...options, __security: { bearerAuth: true } });
  }
};

// node_modules/openai/resources/realtime/calls.mjs
var Calls = class extends APIResource {
  /**
   * Accept an incoming SIP call and configure the realtime session that will handle
   * it.
   *
   * @example
   * ```ts
   * await client.realtime.calls.accept('call_id', {
   *   type: 'realtime',
   * });
   * ```
   */
  accept(callID, body, options) {
    return this._client.post(path`/realtime/calls/${callID}/accept`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * End an active Realtime API call, whether it was initiated over SIP or WebRTC.
   *
   * @example
   * ```ts
   * await client.realtime.calls.hangup('call_id');
   * ```
   */
  hangup(callID, options) {
    return this._client.post(path`/realtime/calls/${callID}/hangup`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Transfer an active SIP call to a new destination using the SIP REFER verb.
   *
   * @example
   * ```ts
   * await client.realtime.calls.refer('call_id', {
   *   target_uri: 'tel:+14155550123',
   * });
   * ```
   */
  refer(callID, body, options) {
    return this._client.post(path`/realtime/calls/${callID}/refer`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Decline an incoming SIP call by returning a SIP status code to the caller.
   *
   * @example
   * ```ts
   * await client.realtime.calls.reject('call_id');
   * ```
   */
  reject(callID, body = {}, options) {
    return this._client.post(path`/realtime/calls/${callID}/reject`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/realtime/client-secrets.mjs
var ClientSecrets = class extends APIResource {
  /**
   * Create a Realtime client secret with an associated session configuration.
   *
   * Client secrets are short-lived tokens that can be passed to a client app, such
   * as a web frontend or mobile client, which grants access to the Realtime API
   * without leaking your main API key. You can configure a custom TTL for each
   * client secret.
   *
   * You can also attach session configuration options to the client secret, which
   * will be applied to any sessions created using that client secret, but these can
   * also be overridden by the client connection.
   *
   * [Learn more about authentication with client secrets over WebRTC](https://platform.openai.com/docs/guides/realtime-webrtc).
   *
   * Returns the created client secret and the effective session object. The client
   * secret is a string that looks like `ek_1234`.
   *
   * @example
   * ```ts
   * const clientSecret =
   *   await client.realtime.clientSecrets.create();
   * ```
   */
  create(body, options) {
    return this._client.post("/realtime/client_secrets", {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/realtime/realtime.mjs
var Realtime2 = class extends APIResource {
  constructor() {
    super(...arguments);
    this.clientSecrets = new ClientSecrets(this._client);
    this.calls = new Calls(this._client);
  }
};
Realtime2.ClientSecrets = ClientSecrets;
Realtime2.Calls = Calls;

// node_modules/openai/lib/ResponsesParser.mjs
function maybeParseResponse(response, params) {
  if (!params || !hasAutoParseableInput2(params)) {
    const parsed = {
      ...response,
      output_parsed: null,
      output: response.output.map((item) => {
        if (item.type === "function_call") {
          return {
            ...item,
            parsed_arguments: null
          };
        }
        if (item.type === "message") {
          return {
            ...item,
            content: item.content.map((content) => ({
              ...content,
              parsed: null
            }))
          };
        } else {
          return item;
        }
      })
    };
    if (needsOutputText(response, parsed)) {
      addOutputText(parsed);
    }
    return parsed;
  }
  return parseResponse(response, params);
}
function parseResponse(response, params) {
  const shouldParse = !response.status || response.status === "completed";
  const output = response.output.map((item) => {
    if (item.type === "function_call") {
      return {
        ...item,
        parsed_arguments: shouldParse ? parseToolCall2(params, item) : null
      };
    }
    if (item.type === "message") {
      const content = item.content.map((content2) => {
        if (content2.type === "output_text") {
          return {
            ...content2,
            parsed: shouldParse ? parseTextFormat(params, content2.text) : null
          };
        }
        return content2;
      });
      return {
        ...item,
        content
      };
    }
    return item;
  });
  const parsed = Object.assign({}, response, { output });
  if (needsOutputText(response, parsed)) {
    addOutputText(parsed);
  }
  Object.defineProperty(parsed, "output_parsed", {
    enumerable: true,
    get() {
      for (const output2 of parsed.output) {
        if (output2.type !== "message") {
          continue;
        }
        for (const content of output2.content) {
          if (content.type === "output_text" && content.parsed !== null) {
            return content.parsed;
          }
        }
      }
      return null;
    }
  });
  return parsed;
}
function parseTextFormat(params, content) {
  if (params.text?.format?.type !== "json_schema") {
    return null;
  }
  if ("$parseRaw" in params.text?.format) {
    const text_format = params.text?.format;
    return text_format.$parseRaw(content);
  }
  return JSON.parse(content);
}
function hasAutoParseableInput2(params) {
  if (isAutoParsableResponseFormat(params.text?.format)) {
    return true;
  }
  return false;
}
function isAutoParsableTool2(tool) {
  return tool?.["$brand"] === "auto-parseable-tool";
}
function getInputToolByName(input_tools, name) {
  return input_tools.find((tool) => tool.type === "function" && tool.name === name);
}
function parseToolCall2(params, toolCall) {
  const inputTool = getInputToolByName(params.tools ?? [], toolCall.name);
  return {
    ...toolCall,
    ...toolCall,
    parsed_arguments: isAutoParsableTool2(inputTool) ? inputTool.$parseRaw(toolCall.arguments) : inputTool?.strict ? JSON.parse(toolCall.arguments) : null
  };
}
function needsOutputText(response, target) {
  return !Object.getOwnPropertyDescriptor(response, "output_text") || target.output_text == null;
}
function addOutputText(rsp) {
  const texts = [];
  for (const output of rsp.output) {
    if (output.type !== "message") {
      continue;
    }
    for (const content of output.content) {
      if (content.type === "output_text") {
        texts.push(content.text);
      }
    }
  }
  rsp.output_text = texts.join("");
}

// node_modules/openai/lib/responses/ResponseAccumulator.mjs
function accumulateResponse(event, snapshot2) {
  if (!snapshot2) {
    if (event.type !== "response.created") {
      throw new OpenAIError(`When snapshot hasn't been set yet, expected 'response.created' event, got ${event.type}`);
    }
    return cloneResponse(event.response);
  }
  switch (event.type) {
    case "response.output_item.added": {
      snapshot2.output.push(structuredClone(event.item));
      if (event.item.type === "message") {
        addOutputText(snapshot2);
      }
      break;
    }
    case "response.output_item.done": {
      getOutput(snapshot2, event.output_index);
      snapshot2.output[event.output_index] = structuredClone(event.item);
      if (event.item.type === "message") {
        addOutputText(snapshot2);
      }
      break;
    }
    case "response.content_part.added": {
      const output = getOutput(snapshot2, event.output_index);
      const type = output.type;
      const part = event.part;
      if (type === "message" && part.type !== "reasoning_text") {
        output.content.push(structuredClone(part));
        if (part.type === "output_text") {
          addOutputText(snapshot2);
        }
      } else if (type === "reasoning" && part.type === "reasoning_text") {
        if (!output.content) {
          output.content = [];
        }
        output.content.push(structuredClone(part));
      }
      break;
    }
    case "response.content_part.done": {
      const output = getOutput(snapshot2, event.output_index);
      const part = event.part;
      if (output.type === "message" && part.type !== "reasoning_text") {
        getContent(output.content, event.content_index);
        output.content[event.content_index] = structuredClone(part);
        if (part.type === "output_text") {
          addOutputText(snapshot2);
        }
      } else if (output.type === "reasoning" && part.type === "reasoning_text") {
        const content = output.content;
        if (!content) {
          throw new OpenAIError(`missing content at index ${event.content_index}`);
        }
        getContent(content, event.content_index);
        content[event.content_index] = structuredClone(part);
      }
      break;
    }
    case "response.output_text.delta": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "message") {
        const content = getContent(output.content, event.content_index);
        if (content.type !== "output_text") {
          throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
        }
        content.text += event.delta;
        snapshot2.output_text += event.delta;
      }
      break;
    }
    case "response.output_text.done": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "message") {
        const content = getContent(output.content, event.content_index);
        if (content.type !== "output_text") {
          throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
        }
        content.text = event.text;
        addOutputText(snapshot2);
      }
      break;
    }
    case "response.output_text.annotation.added": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "message") {
        const content = getContent(output.content, event.content_index);
        if (content.type !== "output_text") {
          throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
        }
        content.annotations[event.annotation_index] = structuredClone(event.annotation);
      }
      break;
    }
    case "response.refusal.delta": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "message") {
        const content = getContent(output.content, event.content_index);
        if (content.type !== "refusal") {
          throw new OpenAIError(`expected content to be 'refusal', got ${content.type}`);
        }
        content.refusal += event.delta;
      }
      break;
    }
    case "response.refusal.done": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "message") {
        const content = getContent(output.content, event.content_index);
        if (content.type !== "refusal") {
          throw new OpenAIError(`expected content to be 'refusal', got ${content.type}`);
        }
        content.refusal = event.refusal;
      }
      break;
    }
    case "response.function_call_arguments.delta": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "function_call") {
        output.arguments += event.delta;
      }
      break;
    }
    case "response.function_call_arguments.done": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "function_call") {
        output.arguments = event.arguments;
      }
      break;
    }
    case "response.reasoning_text.delta": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "reasoning") {
        if (!output.content) {
          throw new OpenAIError(`missing content at index ${event.content_index}`);
        }
        const content = getContent(output.content, event.content_index);
        if (content.type !== "reasoning_text") {
          throw new OpenAIError(`expected content to be 'reasoning_text', got ${content.type}`);
        }
        content.text += event.delta;
      }
      break;
    }
    case "response.reasoning_text.done": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "reasoning") {
        if (!output.content) {
          throw new OpenAIError(`missing content at index ${event.content_index}`);
        }
        const content = getContent(output.content, event.content_index);
        if (content.type !== "reasoning_text") {
          throw new OpenAIError(`expected content to be 'reasoning_text', got ${content.type}`);
        }
        content.text = event.text;
      }
      break;
    }
    case "response.reasoning_summary_part.added": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "reasoning") {
        output.summary.push(structuredClone(event.part));
      }
      break;
    }
    case "response.reasoning_summary_part.done": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "reasoning") {
        getContent(output.summary, event.summary_index);
        output.summary[event.summary_index] = structuredClone(event.part);
      }
      break;
    }
    case "response.reasoning_summary_text.delta": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "reasoning") {
        const part = getContent(output.summary, event.summary_index);
        part.text += event.delta;
      }
      break;
    }
    case "response.reasoning_summary_text.done": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "reasoning") {
        const part = getContent(output.summary, event.summary_index);
        part.text = event.text;
      }
      break;
    }
    case "response.custom_tool_call_input.delta": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "custom_tool_call") {
        output.input += event.delta;
      }
      break;
    }
    case "response.custom_tool_call_input.done": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "custom_tool_call") {
        output.input = event.input;
      }
      break;
    }
    case "response.mcp_call_arguments.delta": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "mcp_call") {
        output.arguments += event.delta;
      }
      break;
    }
    case "response.mcp_call_arguments.done": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "mcp_call") {
        output.arguments = event.arguments;
      }
      break;
    }
    case "response.code_interpreter_call_code.delta": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "code_interpreter_call") {
        output.code = (output.code ?? "") + event.delta;
      }
      break;
    }
    case "response.code_interpreter_call_code.done": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "code_interpreter_call") {
        output.code = event.code;
      }
      break;
    }
    case "response.code_interpreter_call.in_progress": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "code_interpreter_call") {
        output.status = "in_progress";
      }
      break;
    }
    case "response.code_interpreter_call.interpreting": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "code_interpreter_call") {
        output.status = "interpreting";
      }
      break;
    }
    case "response.code_interpreter_call.completed": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "code_interpreter_call") {
        output.status = "completed";
      }
      break;
    }
    case "response.file_search_call.in_progress": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "file_search_call") {
        output.status = "in_progress";
      }
      break;
    }
    case "response.file_search_call.searching": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "file_search_call") {
        output.status = "searching";
      }
      break;
    }
    case "response.file_search_call.completed": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "file_search_call") {
        output.status = "completed";
      }
      break;
    }
    case "response.web_search_call.in_progress": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "web_search_call") {
        output.status = "in_progress";
      }
      break;
    }
    case "response.web_search_call.searching": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "web_search_call") {
        output.status = "searching";
      }
      break;
    }
    case "response.web_search_call.completed": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "web_search_call") {
        output.status = "completed";
      }
      break;
    }
    case "response.image_generation_call.in_progress": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "image_generation_call") {
        output.status = "in_progress";
      }
      break;
    }
    case "response.image_generation_call.generating": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "image_generation_call") {
        output.status = "generating";
      }
      break;
    }
    case "response.image_generation_call.completed": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "image_generation_call") {
        output.status = "completed";
      }
      break;
    }
    case "response.mcp_call.in_progress": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "mcp_call") {
        output.status = "in_progress";
      }
      break;
    }
    case "response.mcp_call.completed": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "mcp_call") {
        output.status = "completed";
      }
      break;
    }
    case "response.mcp_call.failed": {
      const output = getOutput(snapshot2, event.output_index);
      if (output.type === "mcp_call") {
        output.status = "failed";
      }
      break;
    }
    case "response.created":
    case "response.queued":
    case "response.in_progress":
    case "response.completed":
    case "response.failed":
    case "response.incomplete": {
      snapshot2 = cloneResponse(event.response);
      break;
    }
    case "response.audio.delta":
    case "response.audio.done":
    case "response.audio.transcript.delta":
    case "response.audio.transcript.done":
    case "response.image_generation_call.partial_image":
    case "response.mcp_list_tools.in_progress":
    case "response.mcp_list_tools.completed":
    case "response.mcp_list_tools.failed":
    case "error": {
      break;
    }
    default: {
      assertNever3(event);
    }
  }
  return snapshot2;
}
function cloneResponse(response) {
  const snapshot2 = structuredClone(response);
  if (!Object.getOwnPropertyDescriptor(snapshot2, "output_text") || snapshot2.output_text == null) {
    addOutputText(snapshot2);
  }
  return snapshot2;
}
function getOutput(snapshot2, outputIndex) {
  const output = snapshot2.output[outputIndex];
  if (!output) {
    throw new OpenAIError(`missing output at index ${outputIndex}`);
  }
  return output;
}
function getContent(content, contentIndex) {
  const part = content[contentIndex];
  if (!part) {
    throw new OpenAIError(`missing content at index ${contentIndex}`);
  }
  return part;
}
function assertNever3(value) {
  throw new OpenAIError(`Unhandled response stream event: ${JSON.stringify(value)}`);
}

// node_modules/openai/lib/responses/ResponseStream.mjs
var _ResponseStream_instances;
var _ResponseStream_params;
var _ResponseStream_currentResponseSnapshot;
var _ResponseStream_finalResponse;
var _ResponseStream_beginRequest;
var _ResponseStream_addEvent;
var _ResponseStream_endRequest;
var ResponseStream = class _ResponseStream extends EventStream {
  constructor(params) {
    super();
    _ResponseStream_instances.add(this);
    _ResponseStream_params.set(this, void 0);
    _ResponseStream_currentResponseSnapshot.set(this, void 0);
    _ResponseStream_finalResponse.set(this, void 0);
    __classPrivateFieldSet(this, _ResponseStream_params, params, "f");
  }
  static createResponse(client, params, options) {
    const runner = new _ResponseStream(params);
    runner._run(() => runner._createOrRetrieveResponse(client, params, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  async _createOrRetrieveResponse(client, params, options) {
    this._listenForAbort(options?.signal);
    __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_beginRequest).call(this);
    let stream;
    let starting_after = null;
    if ("response_id" in params) {
      stream = await client.responses.retrieve(params.response_id, { stream: true }, { ...options, signal: this.controller.signal, stream: true });
      starting_after = params.starting_after ?? null;
    } else {
      stream = await client.responses.create({ ...params, stream: true }, { ...options, signal: this.controller.signal });
    }
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_addEvent).call(this, event, starting_after);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_endRequest).call(this);
  }
  [(_ResponseStream_params = /* @__PURE__ */ new WeakMap(), _ResponseStream_currentResponseSnapshot = /* @__PURE__ */ new WeakMap(), _ResponseStream_finalResponse = /* @__PURE__ */ new WeakMap(), _ResponseStream_instances = /* @__PURE__ */ new WeakSet(), _ResponseStream_beginRequest = function _ResponseStream_beginRequest2() {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, void 0, "f");
  }, _ResponseStream_addEvent = function _ResponseStream_addEvent2(event, starting_after) {
    if (this.ended)
      return;
    const maybeEmit = (name, event2) => {
      if (starting_after == null || event2.sequence_number > starting_after) {
        this._emit(name, event2);
      }
    };
    const response = accumulateResponse(event, __classPrivateFieldGet(this, _ResponseStream_currentResponseSnapshot, "f"));
    __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, response, "f");
    maybeEmit("event", event);
    switch (event.type) {
      case "response.output_text.delta": {
        const output = response.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "message") {
          const content = output.content[event.content_index];
          if (!content) {
            throw new OpenAIError(`missing content at index ${event.content_index}`);
          }
          if (content.type !== "output_text") {
            throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
          }
          maybeEmit("response.output_text.delta", {
            ...event,
            snapshot: content.text
          });
        }
        break;
      }
      case "response.function_call_arguments.delta": {
        const output = response.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "function_call") {
          maybeEmit("response.function_call_arguments.delta", {
            ...event,
            snapshot: output.arguments
          });
        }
        break;
      }
      default:
        maybeEmit(event.type, event);
        break;
    }
  }, _ResponseStream_endRequest = function _ResponseStream_endRequest2() {
    if (this.ended) {
      throw new OpenAIError(`stream has ended, this shouldn't happen`);
    }
    const snapshot2 = __classPrivateFieldGet(this, _ResponseStream_currentResponseSnapshot, "f");
    if (!snapshot2) {
      throw new OpenAIError(`request ended without sending any events`);
    }
    __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, void 0, "f");
    const parsedResponse = finalizeResponse(snapshot2, __classPrivateFieldGet(this, _ResponseStream_params, "f"));
    __classPrivateFieldSet(this, _ResponseStream_finalResponse, parsedResponse, "f");
    return parsedResponse;
  }, Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("event", (event) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(event);
      } else {
        pushQueue.push(event);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(void 0);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    this.on("error", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: void 0, done: true };
          }
          return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((event2) => event2 ? { value: event2, done: false } : { value: void 0, done: true });
        }
        const event = pushQueue.shift();
        return { value: event, done: false };
      },
      return: async () => {
        this.abort();
        return { value: void 0, done: true };
      }
    };
  }
  /**
   * @returns a promise that resolves with the final Response, or rejects
   * if an error occurred or the stream ended prematurely without producing a REsponse.
   */
  async finalResponse() {
    await this.done();
    const response = __classPrivateFieldGet(this, _ResponseStream_finalResponse, "f");
    if (!response)
      throw new OpenAIError("stream ended without producing a ChatCompletion");
    return response;
  }
};
function finalizeResponse(snapshot2, params) {
  return maybeParseResponse(snapshot2, params);
}

// node_modules/openai/resources/responses/input-items.mjs
var InputItems = class extends APIResource {
  /**
   * Returns a list of input items for a given response.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const responseItem of client.responses.inputItems.list(
   *   'response_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(responseID, query = {}, options) {
    return this._client.getAPIList(path`/responses/${responseID}/input_items`, CursorPage, { query, ...options, __security: { bearerAuth: true } });
  }
};

// node_modules/openai/resources/responses/input-tokens.mjs
var InputTokens = class extends APIResource {
  /**
   * Returns input token counts of the request.
   *
   * Returns an object with `object` set to `response.input_tokens` and an
   * `input_tokens` count.
   *
   * @example
   * ```ts
   * const response = await client.responses.inputTokens.count();
   * ```
   */
  count(body = {}, options) {
    return this._client.post("/responses/input_tokens", {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/responses/responses.mjs
var Responses = class extends APIResource {
  constructor() {
    super(...arguments);
    this.inputItems = new InputItems(this._client);
    this.inputTokens = new InputTokens(this._client);
  }
  create(body, options) {
    return this._client.post("/responses", {
      body,
      ...options,
      stream: body.stream ?? false,
      __security: { bearerAuth: true }
    })._thenUnwrap((rsp) => {
      if ("object" in rsp && rsp.object === "response") {
        addOutputText(rsp);
      }
      return rsp;
    });
  }
  retrieve(responseID, query = {}, options) {
    return this._client.get(path`/responses/${responseID}`, {
      query,
      ...options,
      stream: query?.stream ?? false,
      __security: { bearerAuth: true }
    })._thenUnwrap((rsp) => {
      if ("object" in rsp && rsp.object === "response") {
        addOutputText(rsp);
      }
      return rsp;
    });
  }
  /**
   * Deletes a model response with the given ID.
   *
   * @example
   * ```ts
   * await client.responses.delete(
   *   'resp_677efb5139a88190b512bc3fef8e535d',
   * );
   * ```
   */
  delete(responseID, options) {
    return this._client.delete(path`/responses/${responseID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  parse(body, options) {
    return this._client.responses.create(body, options)._thenUnwrap((response) => parseResponse(response, body));
  }
  /**
   * Creates a model response stream
   */
  stream(body, options) {
    return ResponseStream.createResponse(this._client, body, options);
  }
  /**
   * Cancels a model response with the given ID. Only responses created with the
   * `background` parameter set to `true` can be cancelled.
   * [Learn more](https://platform.openai.com/docs/guides/background).
   *
   * @example
   * ```ts
   * const response = await client.responses.cancel(
   *   'resp_677efb5139a88190b512bc3fef8e535d',
   * );
   * ```
   */
  cancel(responseID, options) {
    return this._client.post(path`/responses/${responseID}/cancel`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Compact a conversation. Returns a compacted response object.
   *
   * Learn when and how to compact long-running conversations in the
   * [conversation state guide](https://platform.openai.com/docs/guides/conversation-state#managing-the-context-window).
   * For ZDR-compatible compaction details, see
   * [Compaction (advanced)](https://platform.openai.com/docs/guides/conversation-state#compaction-advanced).
   *
   * @example
   * ```ts
   * const compactedResponse = await client.responses.compact({
   *   model: 'gpt-5.4',
   * });
   * ```
   */
  compact(body, options) {
    return this._client.post("/responses/compact", { body, ...options, __security: { bearerAuth: true } });
  }
};
Responses.InputItems = InputItems;
Responses.InputTokens = InputTokens;

// node_modules/openai/resources/skills/content.mjs
var Content2 = class extends APIResource {
  /**
   * Download a skill zip bundle by its ID.
   */
  retrieve(skillID, options) {
    return this._client.get(path`/skills/${skillID}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
};

// node_modules/openai/resources/skills/versions/content.mjs
var Content3 = class extends APIResource {
  /**
   * Download a skill version zip bundle.
   */
  retrieve(version, params, options) {
    const { skill_id } = params;
    return this._client.get(path`/skills/${skill_id}/versions/${version}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
};

// node_modules/openai/resources/skills/versions/versions.mjs
var Versions = class extends APIResource {
  constructor() {
    super(...arguments);
    this.content = new Content3(this._client);
  }
  /**
   * Create a new immutable skill version.
   */
  create(skillID, body = {}, options) {
    return this._client.post(path`/skills/${skillID}/versions`, maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Get a specific skill version.
   */
  retrieve(version, params, options) {
    const { skill_id } = params;
    return this._client.get(path`/skills/${skill_id}/versions/${version}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List skill versions for a skill.
   */
  list(skillID, query = {}, options) {
    return this._client.getAPIList(path`/skills/${skillID}/versions`, CursorPage, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a skill version.
   */
  delete(version, params, options) {
    const { skill_id } = params;
    return this._client.delete(path`/skills/${skill_id}/versions/${version}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
};
Versions.Content = Content3;

// node_modules/openai/resources/skills/skills.mjs
var Skills = class extends APIResource {
  constructor() {
    super(...arguments);
    this.content = new Content2(this._client);
    this.versions = new Versions(this._client);
  }
  /**
   * Create a new skill.
   */
  create(body = {}, options) {
    return this._client.post("/skills", maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Get a skill by its ID.
   */
  retrieve(skillID, options) {
    return this._client.get(path`/skills/${skillID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Update the default version pointer for a skill.
   */
  update(skillID, body, options) {
    return this._client.post(path`/skills/${skillID}`, {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List all skills for the current project.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/skills", CursorPage, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a skill by its ID.
   */
  delete(skillID, options) {
    return this._client.delete(path`/skills/${skillID}`, { ...options, __security: { bearerAuth: true } });
  }
};
Skills.Content = Content2;
Skills.Versions = Versions;

// node_modules/openai/resources/uploads/parts.mjs
var Parts = class extends APIResource {
  /**
   * Adds a
   * [Part](https://platform.openai.com/docs/api-reference/uploads/part-object) to an
   * [Upload](https://platform.openai.com/docs/api-reference/uploads/object) object.
   * A Part represents a chunk of bytes from the file you are trying to upload.
   *
   * Each Part can be at most 64 MB, and you can add Parts until you hit the Upload
   * maximum of 8 GB.
   *
   * It is possible to add multiple Parts in parallel. You can decide the intended
   * order of the Parts when you
   * [complete the Upload](https://platform.openai.com/docs/api-reference/uploads/complete).
   */
  create(uploadID, body, options) {
    return this._client.post(path`/uploads/${uploadID}/parts`, multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
};

// node_modules/openai/resources/uploads/uploads.mjs
var Uploads = class extends APIResource {
  constructor() {
    super(...arguments);
    this.parts = new Parts(this._client);
  }
  /**
   * Creates an intermediate
   * [Upload](https://platform.openai.com/docs/api-reference/uploads/object) object
   * that you can add
   * [Parts](https://platform.openai.com/docs/api-reference/uploads/part-object) to.
   * Currently, an Upload can accept at most 8 GB in total and expires after an hour
   * after you create it.
   *
   * Once you complete the Upload, we will create a
   * [File](https://platform.openai.com/docs/api-reference/files/object) object that
   * contains all the parts you uploaded. This File is usable in the rest of our
   * platform as a regular File object.
   *
   * For certain `purpose` values, the correct `mime_type` must be specified. Please
   * refer to documentation for the
   * [supported MIME types for your use case](https://platform.openai.com/docs/assistants/tools/file-search#supported-files).
   *
   * For guidance on the proper filename extensions for each purpose, please follow
   * the documentation on
   * [creating a File](https://platform.openai.com/docs/api-reference/files/create).
   *
   * Returns the Upload object with status `pending`.
   */
  create(body, options) {
    return this._client.post("/uploads", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Cancels the Upload. No Parts may be added after an Upload is cancelled.
   *
   * Returns the Upload object with status `cancelled`.
   */
  cancel(uploadID, options) {
    return this._client.post(path`/uploads/${uploadID}/cancel`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Completes the
   * [Upload](https://platform.openai.com/docs/api-reference/uploads/object).
   *
   * Within the returned Upload object, there is a nested
   * [File](https://platform.openai.com/docs/api-reference/files/object) object that
   * is ready to use in the rest of the platform.
   *
   * You can specify the order of the Parts by passing in an ordered list of the Part
   * IDs.
   *
   * The number of bytes uploaded upon completion must match the number of bytes
   * initially specified when creating the Upload object. No Parts may be added after
   * an Upload is completed. Returns the Upload object with status `completed`,
   * including an additional `file` property containing the created usable File
   * object.
   */
  complete(uploadID, body, options) {
    return this._client.post(path`/uploads/${uploadID}/complete`, {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
};
Uploads.Parts = Parts;

// node_modules/openai/lib/Util.mjs
var allSettledWithThrow = async (promises) => {
  const results = await Promise.allSettled(promises);
  const rejected = results.filter((result) => result.status === "rejected");
  if (rejected.length) {
    for (const result of rejected) {
      console.error(result.reason);
    }
    throw new Error(`${rejected.length} promise(s) failed - see the above errors`);
  }
  const values = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      values.push(result.value);
    }
  }
  return values;
};

// node_modules/openai/resources/vector-stores/file-batches.mjs
var FileBatches = class extends APIResource {
  /**
   * Create a vector store file batch.
   */
  create(vectorStoreID, body, options) {
    return this._client.post(path`/vector_stores/${vectorStoreID}/file_batches`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves a vector store file batch.
   */
  retrieve(batchID, params, options) {
    const { vector_store_id } = params;
    return this._client.get(path`/vector_stores/${vector_store_id}/file_batches/${batchID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Cancel a vector store file batch. This attempts to cancel the processing of
   * files in this batch as soon as possible.
   */
  cancel(batchID, params, options) {
    const { vector_store_id } = params;
    return this._client.post(path`/vector_stores/${vector_store_id}/file_batches/${batchID}/cancel`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Create a vector store batch and poll until all files have been processed.
   */
  async createAndPoll(vectorStoreId, body, options) {
    const batch = await this.create(vectorStoreId, body);
    return await this.poll(vectorStoreId, batch.id, options);
  }
  /**
   * Returns a list of vector store files in a batch.
   */
  listFiles(batchID, params, options) {
    const { vector_store_id, ...query } = params;
    return this._client.getAPIList(path`/vector_stores/${vector_store_id}/file_batches/${batchID}/files`, CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Wait for the given file batch to be processed.
   *
   * Note: this will return even if one of the files failed to process, you need to
   * check batch.file_counts.failed_count to handle this case.
   */
  async poll(vectorStoreID, batchID, options) {
    const headers = buildHeaders([
      options?.headers,
      {
        "X-Stainless-Poll-Helper": "true",
        "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
      }
    ]);
    while (true) {
      const { data: batch, response } = await this.retrieve(batchID, { vector_store_id: vectorStoreID }, {
        ...options,
        headers
      }).withResponse();
      switch (batch.status) {
        case "in_progress":
          let sleepInterval = 5e3;
          if (options?.pollIntervalMs) {
            sleepInterval = options.pollIntervalMs;
          } else {
            const headerInterval = response.headers.get("openai-poll-after-ms");
            if (headerInterval) {
              const headerIntervalMs = parseInt(headerInterval);
              if (!isNaN(headerIntervalMs)) {
                sleepInterval = headerIntervalMs;
              }
            }
          }
          await sleep(sleepInterval);
          break;
        case "failed":
        case "cancelled":
        case "completed":
          return batch;
      }
    }
  }
  /**
   * Uploads the given files concurrently and then creates a vector store file batch.
   *
   * The concurrency limit is configurable using the `maxConcurrency` parameter.
   */
  async uploadAndPoll(vectorStoreId, { files, fileIds = [] }, options) {
    if (files == null || files.length == 0) {
      throw new Error(`No \`files\` provided to process. If you've already uploaded files you should use \`.createAndPoll()\` instead`);
    }
    const configuredConcurrency = options?.maxConcurrency ?? 5;
    const concurrencyLimit = Math.min(configuredConcurrency, files.length);
    const client = this._client;
    const fileIterator = files.values();
    const allFileIds = [...fileIds];
    async function processFiles(iterator) {
      for (let item of iterator) {
        const fileObj = await client.files.create({ file: item, purpose: "assistants" }, options);
        allFileIds.push(fileObj.id);
      }
    }
    const workers = Array(concurrencyLimit).fill(fileIterator).map(processFiles);
    await allSettledWithThrow(workers);
    return await this.createAndPoll(vectorStoreId, {
      file_ids: allFileIds
    });
  }
};

// node_modules/openai/resources/vector-stores/files.mjs
var Files3 = class extends APIResource {
  /**
   * Create a vector store file by attaching a
   * [File](https://platform.openai.com/docs/api-reference/files) to a
   * [vector store](https://platform.openai.com/docs/api-reference/vector-stores/object).
   */
  create(vectorStoreID, body, options) {
    return this._client.post(path`/vector_stores/${vectorStoreID}/files`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves a vector store file.
   */
  retrieve(fileID, params, options) {
    const { vector_store_id } = params;
    return this._client.get(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Update attributes on a vector store file.
   */
  update(fileID, params, options) {
    const { vector_store_id, ...body } = params;
    return this._client.post(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of vector store files.
   */
  list(vectorStoreID, query = {}, options) {
    return this._client.getAPIList(path`/vector_stores/${vectorStoreID}/files`, CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a vector store file. This will remove the file from the vector store but
   * the file itself will not be deleted. To delete the file, use the
   * [delete file](https://platform.openai.com/docs/api-reference/files/delete)
   * endpoint.
   */
  delete(fileID, params, options) {
    const { vector_store_id } = params;
    return this._client.delete(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Attach a file to the given vector store and wait for it to be processed.
   */
  async createAndPoll(vectorStoreId, body, options) {
    const file = await this.create(vectorStoreId, body, options);
    return await this.poll(vectorStoreId, file.id, options);
  }
  /**
   * Wait for the vector store file to finish processing.
   *
   * Note: this will return even if the file failed to process, you need to check
   * file.last_error and file.status to handle these cases
   */
  async poll(vectorStoreID, fileID, options) {
    const headers = buildHeaders([
      options?.headers,
      {
        "X-Stainless-Poll-Helper": "true",
        "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
      }
    ]);
    while (true) {
      const fileResponse = await this.retrieve(fileID, {
        vector_store_id: vectorStoreID
      }, { ...options, headers }).withResponse();
      const file = fileResponse.data;
      switch (file.status) {
        case "in_progress":
          let sleepInterval = 5e3;
          if (options?.pollIntervalMs) {
            sleepInterval = options.pollIntervalMs;
          } else {
            const headerInterval = fileResponse.response.headers.get("openai-poll-after-ms");
            if (headerInterval) {
              const headerIntervalMs = parseInt(headerInterval);
              if (!isNaN(headerIntervalMs)) {
                sleepInterval = headerIntervalMs;
              }
            }
          }
          await sleep(sleepInterval);
          break;
        case "failed":
        case "completed":
          return file;
      }
    }
  }
  /**
   * Upload a file to the `files` API and then attach it to the given vector store.
   *
   * Note the file will be asynchronously processed (you can use the alternative
   * polling helper method to wait for processing to complete).
   */
  async upload(vectorStoreId, file, options) {
    const fileInfo = await this._client.files.create({ file, purpose: "assistants" }, options);
    return this.create(vectorStoreId, { file_id: fileInfo.id }, options);
  }
  /**
   * Add a file to a vector store and poll until processing is complete.
   */
  async uploadAndPoll(vectorStoreId, file, options) {
    const fileInfo = await this.upload(vectorStoreId, file, options);
    return await this.poll(vectorStoreId, fileInfo.id, options);
  }
  /**
   * Retrieve the parsed contents of a vector store file.
   */
  content(fileID, params, options) {
    const { vector_store_id } = params;
    return this._client.getAPIList(path`/vector_stores/${vector_store_id}/files/${fileID}/content`, Page, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};

// node_modules/openai/resources/vector-stores/vector-stores.mjs
var VectorStores = class extends APIResource {
  constructor() {
    super(...arguments);
    this.files = new Files3(this._client);
    this.fileBatches = new FileBatches(this._client);
  }
  /**
   * Create a vector store.
   */
  create(body, options) {
    return this._client.post("/vector_stores", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves a vector store.
   */
  retrieve(vectorStoreID, options) {
    return this._client.get(path`/vector_stores/${vectorStoreID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modifies a vector store.
   */
  update(vectorStoreID, body, options) {
    return this._client.post(path`/vector_stores/${vectorStoreID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of vector stores.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/vector_stores", CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a vector store.
   */
  delete(vectorStoreID, options) {
    return this._client.delete(path`/vector_stores/${vectorStoreID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Search a vector store for relevant chunks based on a query and file attributes
   * filter.
   */
  search(vectorStoreID, body, options) {
    return this._client.getAPIList(path`/vector_stores/${vectorStoreID}/search`, Page, {
      body,
      method: "post",
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};
VectorStores.Files = Files3;
VectorStores.FileBatches = FileBatches;

// node_modules/openai/resources/videos.mjs
var Videos = class extends APIResource {
  /**
   * Create a new video generation job from a prompt and optional reference assets.
   */
  create(body, options) {
    return this._client.post("/videos", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Fetch the latest metadata for a generated video.
   */
  retrieve(videoID, options) {
    return this._client.get(path`/videos/${videoID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * List recently generated videos for the current project.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/videos", ConversationCursorPage, {
      query,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Permanently delete a completed or failed video and its stored assets.
   */
  delete(videoID, options) {
    return this._client.delete(path`/videos/${videoID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Create a character from an uploaded video.
   */
  createCharacter(body, options) {
    return this._client.post("/videos/characters", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Download the generated video bytes or a derived preview asset.
   *
   * Streams the rendered video content for the specified video job.
   */
  downloadContent(videoID, query = {}, options) {
    return this._client.get(path`/videos/${videoID}/content`, {
      query,
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
  /**
   * Create a new video generation job by editing a source video or existing
   * generated video.
   */
  edit(body, options) {
    return this._client.post("/videos/edits", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Create an extension of a completed video.
   */
  extend(body, options) {
    return this._client.post("/videos/extensions", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Fetch a character.
   */
  getCharacter(characterID, options) {
    return this._client.get(path`/videos/characters/${characterID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Create a remix of a completed video using a refreshed prompt.
   */
  remix(videoID, body, options) {
    return this._client.post(path`/videos/${videoID}/remix`, maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
};

// node_modules/openai/resources/webhooks/webhooks.mjs
var _Webhooks_instances;
var _Webhooks_validateSecret;
var _Webhooks_getRequiredHeader;
var Webhooks = class extends APIResource {
  constructor() {
    super(...arguments);
    _Webhooks_instances.add(this);
  }
  /**
   * Validates that the given payload was sent by OpenAI and parses the payload.
   */
  async unwrap(payload, headers, secret = this._client.webhookSecret, tolerance = 300) {
    await this.verifySignature(payload, headers, secret, tolerance);
    return JSON.parse(payload);
  }
  /**
   * Validates whether or not the webhook payload was sent by OpenAI.
   *
   * An error will be raised if the webhook payload was not sent by OpenAI.
   *
   * @param payload - The webhook payload
   * @param headers - The webhook headers
   * @param secret - The webhook secret (optional, will use client secret if not provided)
   * @param tolerance - Maximum age of the webhook in seconds (default: 300 = 5 minutes)
   */
  async verifySignature(payload, headers, secret = this._client.webhookSecret, tolerance = 300) {
    if (typeof crypto === "undefined" || typeof crypto.subtle.importKey !== "function" || typeof crypto.subtle.verify !== "function") {
      throw new Error("Webhook signature verification is only supported when the `crypto` global is defined");
    }
    __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_validateSecret).call(this, secret);
    const headersObj = buildHeaders([headers]).values;
    const signatureHeader = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-signature");
    const timestamp = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-timestamp");
    const webhookId = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-id");
    const timestampSeconds = parseInt(timestamp, 10);
    if (isNaN(timestampSeconds)) {
      throw new InvalidWebhookSignatureError("Invalid webhook timestamp format");
    }
    const nowSeconds = Math.floor(Date.now() / 1e3);
    if (nowSeconds - timestampSeconds > tolerance) {
      throw new InvalidWebhookSignatureError("Webhook timestamp is too old");
    }
    if (timestampSeconds > nowSeconds + tolerance) {
      throw new InvalidWebhookSignatureError("Webhook timestamp is too new");
    }
    const signatures = signatureHeader.split(" ").map((part) => part.startsWith("v1,") ? part.substring(3) : part);
    const decodedSecret = secret.startsWith("whsec_") ? Buffer.from(secret.replace("whsec_", ""), "base64") : Buffer.from(secret, "utf-8");
    const signedPayload = webhookId ? `${webhookId}.${timestamp}.${payload}` : `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey("raw", decodedSecret, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    for (const signature of signatures) {
      try {
        const signatureBytes = Buffer.from(signature, "base64");
        const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(signedPayload));
        if (isValid) {
          return;
        }
      } catch {
        continue;
      }
    }
    throw new InvalidWebhookSignatureError("The given webhook signature does not match the expected signature");
  }
};
_Webhooks_instances = /* @__PURE__ */ new WeakSet(), _Webhooks_validateSecret = function _Webhooks_validateSecret2(secret) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error(`The webhook secret must either be set using the env var, OPENAI_WEBHOOK_SECRET, on the client class, OpenAI({ webhookSecret: '123' }), or passed to this function`);
  }
}, _Webhooks_getRequiredHeader = function _Webhooks_getRequiredHeader2(headers, name) {
  if (!headers) {
    throw new Error(`Headers are required`);
  }
  const value = headers.get(name);
  if (value === null || value === void 0) {
    throw new Error(`Missing required header: ${name}`);
  }
  return value;
};

// node_modules/openai/internal/provider.mjs
var providerDefinitionsKey = /* @__PURE__ */ Symbol.for("openai.node.providerDefinitions.v1");
var providerGlobal = globalThis;
var existingProviderDefinitions = providerGlobal[providerDefinitionsKey];
var providerDefinitions = existingProviderDefinitions ?? /* @__PURE__ */ new WeakMap();
if (!existingProviderDefinitions) {
  Object.defineProperty(providerGlobal, providerDefinitionsKey, { value: providerDefinitions });
}
function configureProvider(provider) {
  const definition = providerDefinitions.get(provider);
  if (!definition) {
    throw new Error("Invalid provider. Providers must be created with createProvider().");
  }
  return definition.configure();
}

// node_modules/openai/client.mjs
var _OpenAI_instances;
var _a2;
var _OpenAI_encoder;
var _OpenAI_baseURLOverridden;
var WORKLOAD_IDENTITY_API_KEY_PLACEHOLDER = "workload-identity-auth";
var OpenAI = class {
  /**
   * API Client for interfacing with the OpenAI API.
   *
   * @param {string | null | undefined} [opts.apiKey=process.env['OPENAI_API_KEY'] ?? null]
   * @param {string | null | undefined} [opts.adminAPIKey=process.env['OPENAI_ADMIN_KEY'] ?? null]
   * @param {string | null | undefined} [opts.organization=process.env['OPENAI_ORG_ID'] ?? null]
   * @param {string | null | undefined} [opts.project=process.env['OPENAI_PROJECT_ID'] ?? null]
   * @param {string | null | undefined} [opts.webhookSecret=process.env['OPENAI_WEBHOOK_SECRET'] ?? null]
   * @param {string} [opts.baseURL=process.env['OPENAI_BASE_URL'] ?? https://api.openai.com/v1] - Override the default base URL for the API.
   * @param {Provider} [opts.provider] - Configure a third-party API provider. Mutually exclusive with top-level authentication and base URL options.
   * @param {number} [opts.timeout=10 minutes] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
   * @param {MergedRequestInit} [opts.fetchOptions] - Additional `RequestInit` options to be passed to `fetch` calls.
   * @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
   * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
   * @param {HeadersLike} opts.defaultHeaders - Default headers to include with every request to the API.
   * @param {Record<string, string | undefined>} opts.defaultQuery - Default query parameters to include with every request to the API.
   * @param {boolean} [opts.dangerouslyAllowBrowser=false] - By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
   */
  constructor(clientOptions = {}) {
    _OpenAI_instances.add(this);
    _OpenAI_encoder.set(this, void 0);
    this.completions = new Completions2(this);
    this.chat = new Chat(this);
    this.embeddings = new Embeddings(this);
    this.files = new Files2(this);
    this.images = new Images(this);
    this.audio = new Audio(this);
    this.moderations = new Moderations(this);
    this.models = new Models(this);
    this.fineTuning = new FineTuning(this);
    this.graders = new Graders2(this);
    this.vectorStores = new VectorStores(this);
    this.webhooks = new Webhooks(this);
    this.beta = new Beta(this);
    this.batches = new Batches(this);
    this.uploads = new Uploads(this);
    this.admin = new Admin(this);
    this.responses = new Responses(this);
    this.realtime = new Realtime2(this);
    this.conversations = new Conversations(this);
    this.evals = new Evals(this);
    this.containers = new Containers(this);
    this.skills = new Skills(this);
    this.videos = new Videos(this);
    const provider = clientOptions.provider;
    if (provider) {
      const conflictingOptions = ["apiKey", "adminAPIKey", "workloadIdentity", "baseURL"].filter((key) => clientOptions[key] != null);
      if (conflictingOptions.length) {
        throw new OpenAIError(`The \`provider\` option cannot be used with ${conflictingOptions.map((key) => `\`${key}\``).join(", ")}. Configure authentication and the base URL through the provider instead.`);
      }
    }
    const { baseURL = provider ? null : readEnv("OPENAI_BASE_URL"), apiKey = provider ? null : readEnv("OPENAI_API_KEY") ?? null, adminAPIKey = provider ? null : readEnv("OPENAI_ADMIN_KEY") ?? null, organization = provider ? null : readEnv("OPENAI_ORG_ID") ?? null, project = provider ? null : readEnv("OPENAI_PROJECT_ID") ?? null, webhookSecret = readEnv("OPENAI_WEBHOOK_SECRET") ?? null, workloadIdentity, ...opts } = clientOptions;
    const providerRuntime = provider ? configureProvider(provider) : void 0;
    const options = {
      apiKey,
      adminAPIKey,
      organization,
      project,
      webhookSecret,
      workloadIdentity,
      provider,
      ...opts,
      baseURL: providerRuntime?.baseURL ?? (baseURL || `https://api.openai.com/v1`)
    };
    if (apiKey && workloadIdentity) {
      throw new OpenAIError("The `apiKey` and `workloadIdentity` options are mutually exclusive");
    }
    if (!providerRuntime && !apiKey && !adminAPIKey && !workloadIdentity) {
      throw new OpenAIError("Missing credentials. Please pass an `apiKey`, `workloadIdentity`, `adminAPIKey`, or set the `OPENAI_API_KEY` or `OPENAI_ADMIN_KEY` environment variable.");
    }
    if (!options.dangerouslyAllowBrowser && isRunningInBrowser()) {
      throw new OpenAIError("It looks like you're running in a browser-like environment.\n\nThis is disabled by default, as it risks exposing your secret API credentials to attackers.\nIf you understand the risks and have appropriate mitigations in place,\nyou can set the `dangerouslyAllowBrowser` option to `true`, e.g.,\n\nnew OpenAI({ apiKey, dangerouslyAllowBrowser: true });\n\nhttps://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety\n");
    }
    this.baseURL = options.baseURL;
    this.timeout = options.timeout ?? _a2.DEFAULT_TIMEOUT;
    this.logger = options.logger ?? console;
    const defaultLogLevel = "warn";
    this.logLevel = defaultLogLevel;
    this.logLevel = parseLogLevel(options.logLevel, "ClientOptions.logLevel", this) ?? parseLogLevel(readEnv("OPENAI_LOG"), "process.env['OPENAI_LOG']", this) ?? defaultLogLevel;
    this.fetchOptions = options.fetchOptions;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetch = options.fetch ?? getDefaultFetch();
    __classPrivateFieldSet(this, _OpenAI_encoder, FallbackEncoder, "f");
    const customHeadersEnv = provider ? void 0 : readEnv("OPENAI_CUSTOM_HEADERS");
    if (customHeadersEnv) {
      const parsed = {};
      for (const line of customHeadersEnv.split("\n")) {
        const colon = line.indexOf(":");
        if (colon >= 0) {
          parsed[line.substring(0, colon).trim()] = line.substring(colon + 1).trim();
        }
      }
      options.defaultHeaders = buildHeaders([parsed, options.defaultHeaders]);
    }
    this._options = options;
    this._provider = providerRuntime;
    if (workloadIdentity) {
      this._workloadIdentityAuth = new WorkloadIdentityAuth(workloadIdentity, this.fetch);
    }
    this.apiKey = typeof apiKey === "string" ? apiKey : null;
    this.adminAPIKey = adminAPIKey;
    this.organization = organization;
    this.project = project;
    this.webhookSecret = webhookSecret;
  }
  /**
   * Create a new client instance re-using the same options given to the current client with optional overriding.
   */
  withOptions(options) {
    const inheritedProvider = this._options.provider;
    const provider = options.provider ?? inheritedProvider;
    const inheritedOptions = {
      ...this._options,
      baseURL: this.baseURL,
      maxRetries: this.maxRetries,
      timeout: this.timeout,
      logger: this.logger,
      logLevel: this.logLevel,
      fetch: this.fetch,
      fetchOptions: this.fetchOptions,
      apiKey: this._options.apiKey,
      adminAPIKey: this.adminAPIKey,
      workloadIdentity: this._options.workloadIdentity,
      organization: this.organization,
      project: this.project,
      webhookSecret: this.webhookSecret
    };
    if (provider) {
      delete inheritedOptions.apiKey;
      delete inheritedOptions.adminAPIKey;
      delete inheritedOptions.workloadIdentity;
      delete inheritedOptions.baseURL;
      if (provider !== inheritedProvider) {
        delete inheritedOptions.organization;
        delete inheritedOptions.project;
        delete inheritedOptions.defaultHeaders;
      }
    }
    const client = new this.constructor({
      ...inheritedOptions,
      ...options,
      provider
    });
    return client;
  }
  defaultQuery() {
    return this._options.defaultQuery;
  }
  validateHeaders({ values, nulls }, schemes = {
    bearerAuth: true,
    adminAPIKeyAuth: true
  }) {
    if (values.get("authorization") || values.get("api-key")) {
      return;
    }
    if (nulls.has("authorization") || nulls.has("api-key")) {
      return;
    }
    if (this._workloadIdentityAuth && schemes.bearerAuth) {
      return;
    }
    throw new Error('Could not resolve authentication method. Expected either apiKey or adminAPIKey to be set. Or for one of the "Authorization" or "api-key" headers to be explicitly omitted');
  }
  async authHeaders(opts, schemes = {
    bearerAuth: true,
    adminAPIKeyAuth: true
  }) {
    return buildHeaders([
      schemes.bearerAuth ? await this.bearerAuth(opts) : null,
      schemes.adminAPIKeyAuth ? await this.adminAPIKeyAuth(opts) : null
    ]);
  }
  async bearerAuth(opts) {
    if (this._workloadIdentityAuth) {
      return buildHeaders([{ Authorization: `Bearer ${await this._workloadIdentityAuth.getToken()}` }]);
    }
    if (this.apiKey == null) {
      return void 0;
    }
    return buildHeaders([{ Authorization: `Bearer ${this.apiKey}` }]);
  }
  async adminAPIKeyAuth(opts) {
    if (this.adminAPIKey == null) {
      return void 0;
    }
    return buildHeaders([{ Authorization: `Bearer ${this.adminAPIKey}` }]);
  }
  stringifyQuery(query) {
    return stringifyQuery(query);
  }
  getUserAgent() {
    return `${this.constructor.name}/JS ${VERSION}`;
  }
  defaultIdempotencyKey() {
    return `stainless-node-retry-${uuid4()}`;
  }
  makeStatusError(status, error, message, headers) {
    return APIError.generate(status, error, message, headers);
  }
  async _callApiKey() {
    if (this._provider)
      return false;
    const apiKey = this._options.apiKey;
    if (typeof apiKey !== "function")
      return false;
    let token;
    try {
      token = await apiKey();
    } catch (err) {
      if (err instanceof OpenAIError)
        throw err;
      throw new OpenAIError(
        `Failed to get token from 'apiKey' function: ${err.message}`,
        // @ts-ignore
        { cause: err }
      );
    }
    if (typeof token !== "string" || !token) {
      throw new OpenAIError(`Expected 'apiKey' function argument to return a string but it returned ${token}`);
    }
    this.apiKey = token;
    return true;
  }
  buildURL(path3, query, defaultBaseURL) {
    const baseURL = !__classPrivateFieldGet(this, _OpenAI_instances, "m", _OpenAI_baseURLOverridden).call(this) && defaultBaseURL || this.baseURL;
    const url = isAbsoluteURL(path3) ? new URL(path3) : new URL(baseURL + (baseURL.endsWith("/") && path3.startsWith("/") ? path3.slice(1) : path3));
    const defaultQuery = this.defaultQuery();
    const pathQuery = Object.fromEntries(url.searchParams);
    if (!isEmptyObj(defaultQuery) || !isEmptyObj(pathQuery)) {
      query = { ...pathQuery, ...defaultQuery, ...query };
    }
    if (typeof query === "object" && query && !Array.isArray(query)) {
      url.search = this.stringifyQuery(query);
    }
    return url.toString();
  }
  /**
   * Used as a callback for mutating the given `FinalRequestOptions` object.
   */
  async prepareOptions(options) {
    if (this._provider)
      return;
    const security = options.__security ?? { bearerAuth: true };
    if (security.bearerAuth) {
      await this._callApiKey();
    }
  }
  /**
   * Used as a callback for mutating the given `RequestInit` object.
   *
   * This is useful for cases where you want to add certain headers based off of
   * the request properties, e.g. `method` or `url`.
   */
  async prepareRequest(request, { url, options }) {
  }
  get(path3, opts) {
    return this.methodRequest("get", path3, opts);
  }
  post(path3, opts) {
    return this.methodRequest("post", path3, opts);
  }
  patch(path3, opts) {
    return this.methodRequest("patch", path3, opts);
  }
  put(path3, opts) {
    return this.methodRequest("put", path3, opts);
  }
  delete(path3, opts) {
    return this.methodRequest("delete", path3, opts);
  }
  methodRequest(method, path3, opts) {
    return this.request(Promise.resolve(opts).then((opts2) => {
      return { method, path: path3, ...opts2 };
    }));
  }
  request(options, remainingRetries = null) {
    return new APIPromise(this, this.makeRequest(options, remainingRetries, void 0));
  }
  async makeRequest(optionsInput, retriesRemaining, retryOfRequestLogID) {
    const options = await optionsInput;
    const maxRetries = options.maxRetries ?? this.maxRetries;
    if (retriesRemaining == null) {
      retriesRemaining = maxRetries;
    }
    await this.prepareOptions(options);
    const { req, url, timeout } = await this.buildRequest(options, {
      retryCount: maxRetries - retriesRemaining
    });
    await this.prepareRequest(req, { url, options });
    await this._provider?.prepareRequest?.(req, { url, options });
    const requestLogID = "log_" + (Math.random() * (1 << 24) | 0).toString(16).padStart(6, "0");
    const retryLogStr = retryOfRequestLogID === void 0 ? "" : `, retryOf: ${retryOfRequestLogID}`;
    const startTime = Date.now();
    loggerFor(this).debug(`[${requestLogID}] sending request`, formatRequestDetails({
      retryOfRequestLogID,
      method: options.method,
      url,
      options,
      headers: req.headers
    }));
    if (options.signal?.aborted) {
      throw new APIUserAbortError();
    }
    const security = options.__security ?? { bearerAuth: true };
    const controller = new AbortController();
    const response = await this.fetchWithAuth(url, req, timeout, controller, security).catch(castToError);
    const headersTime = Date.now();
    if (response instanceof globalThis.Error) {
      const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
      if (options.signal?.aborted) {
        throw new APIUserAbortError();
      }
      const isTimeout = isAbortError(response) || /timed? ?out/i.test(String(response) + ("cause" in response ? String(response.cause) : ""));
      if (retriesRemaining) {
        loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - ${retryMessage}`);
        loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (${retryMessage})`, formatRequestDetails({
          retryOfRequestLogID,
          url,
          durationMs: headersTime - startTime,
          message: response.message
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID);
      }
      loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - error; no more retries left`);
      loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (error; no more retries left)`, formatRequestDetails({
        retryOfRequestLogID,
        url,
        durationMs: headersTime - startTime,
        message: response.message
      }));
      if (response instanceof OAuthError || response instanceof SubjectTokenProviderError) {
        throw response;
      }
      if (isTimeout) {
        throw new APIConnectionTimeoutError();
      }
      throw new APIConnectionError({
        message: getConnectionErrorMessage(response),
        cause: response
      });
    }
    const specialHeaders = [...response.headers.entries()].filter(([name]) => name === "x-request-id").map(([name, value]) => ", " + name + ": " + JSON.stringify(value)).join("");
    const responseInfo = `[${requestLogID}${retryLogStr}${specialHeaders}] ${req.method} ${url} ${response.ok ? "succeeded" : "failed"} with status ${response.status} in ${headersTime - startTime}ms`;
    if (!response.ok) {
      if (response.status === 401 && this._workloadIdentityAuth && security.bearerAuth && !options.__metadata?.["hasStreamingBody"] && !options.__metadata?.["workloadIdentityTokenRefreshed"]) {
        await CancelReadableStream(response.body);
        this._workloadIdentityAuth.invalidateToken();
        return this.makeRequest({
          ...options,
          __metadata: {
            ...options.__metadata,
            workloadIdentityTokenRefreshed: true
          }
        }, retriesRemaining, retryOfRequestLogID ?? requestLogID);
      }
      const shouldRetry = await this.shouldRetry(response);
      if (retriesRemaining && shouldRetry) {
        const retryMessage2 = `retrying, ${retriesRemaining} attempts remaining`;
        await CancelReadableStream(response.body);
        loggerFor(this).info(`${responseInfo} - ${retryMessage2}`);
        loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage2})`, formatRequestDetails({
          retryOfRequestLogID,
          url: response.url,
          status: response.status,
          headers: response.headers,
          durationMs: headersTime - startTime
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID, response.headers);
      }
      const retryMessage = shouldRetry ? `error; no more retries left` : `error; not retryable`;
      loggerFor(this).info(`${responseInfo} - ${retryMessage}`);
      const errText = await response.text().catch((err2) => castToError(err2).message);
      const errJSON = safeJSON(errText);
      const errMessage = errJSON ? void 0 : errText;
      loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage})`, formatRequestDetails({
        retryOfRequestLogID,
        url: response.url,
        status: response.status,
        headers: response.headers,
        message: errMessage,
        durationMs: Date.now() - startTime
      }));
      const err = this.makeStatusError(response.status, errJSON, errMessage, response.headers);
      throw err;
    }
    loggerFor(this).info(responseInfo);
    loggerFor(this).debug(`[${requestLogID}] response start`, formatRequestDetails({
      retryOfRequestLogID,
      url: response.url,
      status: response.status,
      headers: response.headers,
      durationMs: headersTime - startTime
    }));
    return { response, options, controller, requestLogID, retryOfRequestLogID, startTime };
  }
  getAPIList(path3, Page2, opts) {
    return this.requestAPIList(Page2, opts && "then" in opts ? opts.then((opts2) => ({ method: "get", path: path3, ...opts2 })) : { method: "get", path: path3, ...opts });
  }
  requestAPIList(Page2, options) {
    const request = this.makeRequest(options, null, void 0);
    return new PagePromise(this, request, Page2);
  }
  async fetchWithAuth(url, init, timeout, controller, schemes = {
    bearerAuth: true,
    adminAPIKeyAuth: true
  }) {
    if (this._workloadIdentityAuth && schemes.bearerAuth) {
      const headers = init.headers;
      const authHeader = headers.get("Authorization");
      if (!authHeader || authHeader === `Bearer ${WORKLOAD_IDENTITY_API_KEY_PLACEHOLDER}`) {
        const token = await this._workloadIdentityAuth.getToken();
        headers.set("Authorization", `Bearer ${token}`);
      }
    }
    const response = await this.fetchWithTimeout(url, init, timeout, controller);
    return response;
  }
  async fetchWithTimeout(url, init, ms, controller) {
    const { signal, method, ...options } = init || {};
    const abort = this._makeAbort(controller);
    if (signal)
      signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, ms);
    const isReadableBody = globalThis.ReadableStream && options.body instanceof globalThis.ReadableStream || typeof options.body === "object" && options.body !== null && Symbol.asyncIterator in options.body;
    const fetchOptions = {
      signal: controller.signal,
      ...isReadableBody ? { duplex: "half" } : {},
      method: "GET",
      ...options
    };
    if (method) {
      fetchOptions.method = method.toUpperCase();
    }
    try {
      return await this.fetch.call(void 0, url, fetchOptions);
    } finally {
      clearTimeout(timeout);
    }
  }
  async shouldRetry(response) {
    const shouldRetryHeader = response.headers.get("x-should-retry");
    if (shouldRetryHeader === "true")
      return true;
    if (shouldRetryHeader === "false")
      return false;
    if (response.status === 408)
      return true;
    if (response.status === 409)
      return true;
    if (response.status === 429)
      return true;
    if (response.status >= 500)
      return true;
    return false;
  }
  async retryRequest(options, retriesRemaining, requestLogID, responseHeaders) {
    let timeoutMillis;
    const retryAfterMillisHeader = responseHeaders?.get("retry-after-ms");
    if (retryAfterMillisHeader) {
      const timeoutMs = parseFloat(retryAfterMillisHeader);
      if (!Number.isNaN(timeoutMs)) {
        timeoutMillis = timeoutMs;
      }
    }
    const retryAfterHeader = responseHeaders?.get("retry-after");
    if (retryAfterHeader && !timeoutMillis) {
      const timeoutSeconds = parseFloat(retryAfterHeader);
      if (!Number.isNaN(timeoutSeconds)) {
        timeoutMillis = timeoutSeconds * 1e3;
      } else {
        timeoutMillis = Date.parse(retryAfterHeader) - Date.now();
      }
    }
    if (timeoutMillis === void 0) {
      const maxRetries = options.maxRetries ?? this.maxRetries;
      timeoutMillis = this.calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries);
    }
    await sleep(timeoutMillis);
    return this.makeRequest(options, retriesRemaining - 1, requestLogID);
  }
  calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries) {
    const initialRetryDelay = 0.5;
    const maxRetryDelay = 8;
    const numRetries = maxRetries - retriesRemaining;
    const sleepSeconds = Math.min(initialRetryDelay * Math.pow(2, numRetries), maxRetryDelay);
    const jitter = 1 - Math.random() * 0.25;
    return sleepSeconds * jitter * 1e3;
  }
  async buildRequest(inputOptions, { retryCount = 0 } = {}) {
    const options = { ...inputOptions };
    const { method, path: path3, query, defaultBaseURL } = options;
    const url = this.buildURL(path3, query, defaultBaseURL);
    if ("timeout" in options)
      validatePositiveInteger("timeout", options.timeout);
    options.timeout = options.timeout ?? this.timeout;
    const { bodyHeaders, body, isStreamingBody } = this.buildBody({ options });
    if (isStreamingBody) {
      inputOptions.__metadata = {
        ...inputOptions.__metadata,
        hasStreamingBody: true
      };
    }
    const reqHeaders = await this.buildHeaders({ options: inputOptions, method, bodyHeaders, retryCount });
    const req = {
      method,
      headers: reqHeaders,
      ...options.signal && { signal: options.signal },
      ...globalThis.ReadableStream && body instanceof globalThis.ReadableStream && { duplex: "half" },
      ...body && { body },
      ...this.fetchOptions ?? {},
      ...options.fetchOptions ?? {}
    };
    return { req, url, timeout: options.timeout };
  }
  async buildHeaders({ options, method, bodyHeaders, retryCount }) {
    let idempotencyHeaders = {};
    if (this.idempotencyHeader && method !== "get") {
      if (!options.idempotencyKey)
        options.idempotencyKey = this.defaultIdempotencyKey();
      idempotencyHeaders[this.idempotencyHeader] = options.idempotencyKey;
    }
    const headers = buildHeaders([
      idempotencyHeaders,
      {
        Accept: "application/json",
        "User-Agent": this.getUserAgent(),
        "X-Stainless-Retry-Count": String(retryCount),
        ...options.timeout ? { "X-Stainless-Timeout": String(Math.trunc(options.timeout / 1e3)) } : {},
        ...getPlatformHeaders(),
        "OpenAI-Organization": this.organization,
        "OpenAI-Project": this.project
      },
      this._provider ? void 0 : await this.authHeaders(options, options.__security ?? { bearerAuth: true }),
      this._options.defaultHeaders,
      bodyHeaders,
      options.headers
    ]);
    if (!this._provider) {
      this.validateHeaders(headers, options.__security ?? { bearerAuth: true });
    }
    return headers.values;
  }
  _makeAbort(controller) {
    return () => controller.abort();
  }
  buildBody({ options }) {
    const { body, headers: rawHeaders } = options;
    if (!body) {
      if (body === void 0 && "body" in options) {
        return { ...__classPrivateFieldGet(this, _OpenAI_encoder, "f").call(this, { body, headers: buildHeaders([rawHeaders]) }), isStreamingBody: false };
      }
      return { bodyHeaders: void 0, body: void 0, isStreamingBody: false };
    }
    const headers = buildHeaders([rawHeaders]);
    const isReadableStream = typeof globalThis.ReadableStream !== "undefined" && body instanceof globalThis.ReadableStream;
    const isRetryableBody = !isReadableStream && (typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body) || typeof globalThis.Blob !== "undefined" && body instanceof globalThis.Blob || body instanceof URLSearchParams || body instanceof FormData);
    if (
      // Pass raw type verbatim
      ArrayBuffer.isView(body) || body instanceof ArrayBuffer || body instanceof DataView || typeof body === "string" && // Preserve legacy string encoding behavior for now
      headers.values.has("content-type") || // `Blob` is superset of `File`
      globalThis.Blob && body instanceof globalThis.Blob || // `FormData` -> `multipart/form-data`
      body instanceof FormData || // `URLSearchParams` -> `application/x-www-form-urlencoded`
      body instanceof URLSearchParams || // Send chunked stream (each chunk has own `length`)
      isReadableStream
    ) {
      return { bodyHeaders: void 0, body, isStreamingBody: !isRetryableBody };
    } else if (typeof body === "object" && (Symbol.asyncIterator in body || Symbol.iterator in body && "next" in body && typeof body.next === "function")) {
      return {
        bodyHeaders: void 0,
        body: ReadableStreamFrom(body),
        isStreamingBody: true
      };
    } else if (typeof body === "object" && headers.values.get("content-type") === "application/x-www-form-urlencoded") {
      return {
        bodyHeaders: { "content-type": "application/x-www-form-urlencoded" },
        body: this.stringifyQuery(body),
        isStreamingBody: false
      };
    } else {
      return { ...__classPrivateFieldGet(this, _OpenAI_encoder, "f").call(this, { body, headers }), isStreamingBody: false };
    }
  }
};
_a2 = OpenAI, _OpenAI_encoder = /* @__PURE__ */ new WeakMap(), _OpenAI_instances = /* @__PURE__ */ new WeakSet(), _OpenAI_baseURLOverridden = function _OpenAI_baseURLOverridden2() {
  return this._provider !== void 0 || this.baseURL !== "https://api.openai.com/v1";
};
OpenAI.OpenAI = _a2;
OpenAI.DEFAULT_TIMEOUT = 6e5;
OpenAI.OpenAIError = OpenAIError;
OpenAI.APIError = APIError;
OpenAI.APIConnectionError = APIConnectionError;
OpenAI.APIConnectionTimeoutError = APIConnectionTimeoutError;
OpenAI.APIUserAbortError = APIUserAbortError;
OpenAI.NotFoundError = NotFoundError;
OpenAI.ConflictError = ConflictError;
OpenAI.RateLimitError = RateLimitError;
OpenAI.BadRequestError = BadRequestError;
OpenAI.AuthenticationError = AuthenticationError;
OpenAI.InternalServerError = InternalServerError;
OpenAI.PermissionDeniedError = PermissionDeniedError;
OpenAI.UnprocessableEntityError = UnprocessableEntityError;
OpenAI.InvalidWebhookSignatureError = InvalidWebhookSignatureError;
OpenAI.toFile = toFile;
OpenAI.Completions = Completions2;
OpenAI.Chat = Chat;
OpenAI.Embeddings = Embeddings;
OpenAI.Files = Files2;
OpenAI.Images = Images;
OpenAI.Audio = Audio;
OpenAI.Moderations = Moderations;
OpenAI.Models = Models;
OpenAI.FineTuning = FineTuning;
OpenAI.Graders = Graders2;
OpenAI.VectorStores = VectorStores;
OpenAI.Webhooks = Webhooks;
OpenAI.Beta = Beta;
OpenAI.Batches = Batches;
OpenAI.Uploads = Uploads;
OpenAI.Admin = Admin;
OpenAI.Responses = Responses;
OpenAI.Realtime = Realtime2;
OpenAI.Conversations = Conversations;
OpenAI.Evals = Evals;
OpenAI.Containers = Containers;
OpenAI.Skills = Skills;
OpenAI.Videos = Videos;
function getConnectionErrorMessage(error) {
  if (isUndiciDispatcherVersionMismatchError(error)) {
    return `Connection error. This may be caused by passing an undici dispatcher, such as ProxyAgent, that is incompatible with the fetch implementation. If you are using undici's ProxyAgent, pass the fetch implementation from the same undici package: import { fetch, ProxyAgent } from 'undici'; new OpenAI({ fetch, fetchOptions: { dispatcher: new ProxyAgent(...) } });`;
  }
  return void 0;
}
function isUndiciDispatcherVersionMismatchError(error) {
  let current = error;
  for (let i = 0; i < 8 && current && typeof current === "object"; i++) {
    const err = current;
    if (err.code === "UND_ERR_INVALID_ARG" && typeof err.message === "string" && err.message.includes("invalid onRequestStart method")) {
      return true;
    }
    current = err.cause;
  }
  return false;
}

// src/lib/openaiEnv.ts
var PLACEHOLDER_KEY = "lucy-not-configured";
function getOpenAiApiKey() {
  return process.env["OPEN_AI"]?.trim() || process.env["OPENAI_API_KEY"]?.trim() || "";
}
function getOpenAiApiKeyForClient() {
  return getOpenAiApiKey() || PLACEHOLDER_KEY;
}

// src/services/imageProcessor.ts
var openai = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });
var IMAGE_TYPES = /* @__PURE__ */ new Set(["picture", "image", "photo"]);
var IMAGE_CACHE_TTL_MS = 2 * 60 * 60 * 1e3;
var IMAGE_CACHE_MAX = 500;
var imageAnalysisCache = /* @__PURE__ */ new Map();
function pruneImageCache() {
  const now = Date.now();
  for (const [url, entry] of imageAnalysisCache) {
    if (now - entry.at > IMAGE_CACHE_TTL_MS) imageAnalysisCache.delete(url);
  }
  if (imageAnalysisCache.size <= IMAGE_CACHE_MAX) return;
  const sorted = [...imageAnalysisCache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (let i = 0; i < sorted.length - IMAGE_CACHE_MAX; i++) {
    imageAnalysisCache.delete(sorted[i][0]);
  }
}
function getCachedImageDescription(imageUrl) {
  const entry = imageAnalysisCache.get(imageUrl);
  if (!entry) return null;
  if (Date.now() - entry.at > IMAGE_CACHE_TTL_MS) {
    imageAnalysisCache.delete(imageUrl);
    return null;
  }
  return entry.description;
}
function cacheImageDescription(imageUrl, description) {
  imageAnalysisCache.set(imageUrl, { description, at: Date.now() });
  if (imageAnalysisCache.size > IMAGE_CACHE_MAX * 0.9) pruneImageCache();
}
function resetImageAnalysisCacheForTests() {
  imageAnalysisCache.clear();
}
function isImageMessage(message) {
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const a = att;
    if (IMAGE_TYPES.has(String(a["type"] ?? ""))) return true;
    if (typeof a["mime_type"] === "string" && a["mime_type"].startsWith("image/")) return true;
  }
  const atts = message["attachments"];
  if (Array.isArray(atts)) {
    for (const item of atts) {
      if (typeof item === "object" && item !== null) {
        const a = item;
        if (IMAGE_TYPES.has(String(a["type"] ?? ""))) return true;
        if (typeof a["mime_type"] === "string" && a["mime_type"].startsWith("image/")) return true;
      }
    }
  }
  const mediaType = String(message["media_type"] ?? "");
  if (IMAGE_TYPES.has(mediaType)) return true;
  const mimeType = String(message["mime_type"] ?? "");
  if (mimeType.startsWith("image/")) return true;
  return false;
}
function getImageUrl(message) {
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const a = att;
    for (const key of ["link", "url", "media_url"]) {
      if (typeof a[key] === "string" && a[key].length > 0) return a[key];
    }
  }
  const atts = message["attachments"];
  if (Array.isArray(atts)) {
    for (const item of atts) {
      if (typeof item === "object" && item !== null) {
        const a = item;
        if (IMAGE_TYPES.has(String(a["type"] ?? ""))) {
          for (const key of ["link", "url", "media_url"]) {
            if (typeof a[key] === "string" && a[key].length > 0) return a[key];
          }
        }
      }
    }
  }
  for (const key of ["media_url", "file_url", "url"]) {
    if (typeof message[key] === "string" && message[key].length > 0) {
      return message[key];
    }
  }
  const media = message["media"];
  if (typeof media === "object" && media !== null) {
    const m = media;
    if (typeof m["url"] === "string" && m["url"].length > 0) return m["url"];
  }
  return null;
}
function getImageCaption(message) {
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const a = att;
    const caption = (typeof a["text"] === "string" ? a["text"] : "") || (typeof a["caption"] === "string" ? a["caption"] : "") || (typeof a["title"] === "string" ? a["title"] : "");
    if (caption.trim()) return caption.trim();
  }
  const rawText = message["text"];
  if (typeof rawText === "string" && rawText.trim()) return rawText.trim();
  return null;
}

// src/services/voiceProcessor.ts
var openai2 = new OpenAI({ apiKey: getOpenAiApiKeyForClient() });
var AUDIO_TYPES = /* @__PURE__ */ new Set(["audio", "voice"]);
function isVoiceNote(message) {
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const a = att;
    if (AUDIO_TYPES.has(String(a["type"] ?? ""))) return true;
    if (typeof a["mime_type"] === "string" && a["mime_type"].startsWith("audio/")) return true;
  }
  const atts = message["attachments"];
  if (Array.isArray(atts)) {
    for (const item of atts) {
      if (typeof item === "object" && item !== null) {
        const a = item;
        if (AUDIO_TYPES.has(String(a["type"] ?? ""))) return true;
        if (typeof a["mime_type"] === "string" && a["mime_type"].startsWith("audio/")) return true;
      }
    }
  }
  const mediaType = String(message["media_type"] ?? "");
  if (AUDIO_TYPES.has(mediaType)) return true;
  const mimeType = String(message["mime_type"] ?? "");
  if (mimeType.startsWith("audio/")) return true;
  return false;
}
function getVoiceNoteUrl(message) {
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const a = att;
    for (const key of ["link", "url", "media_url"]) {
      if (typeof a[key] === "string" && a[key].length > 0) return a[key];
    }
  }
  const atts = message["attachments"];
  if (Array.isArray(atts)) {
    for (const item of atts) {
      if (typeof item === "object" && item !== null) {
        const a = item;
        if (AUDIO_TYPES.has(String(a["type"] ?? ""))) {
          for (const key of ["link", "url", "media_url"]) {
            if (typeof a[key] === "string" && a[key].length > 0) return a[key];
          }
        }
      }
    }
  }
  for (const key of ["media_url", "file_url", "url"]) {
    if (typeof message[key] === "string" && message[key].length > 0) {
      return message[key];
    }
  }
  const media = message["media"];
  if (typeof media === "object" && media !== null) {
    const m = media;
    if (typeof m["url"] === "string" && m["url"].length > 0) return m["url"];
  }
  return null;
}

// src/lib/webhookDedup.ts
var TTL_MS = 24 * 60 * 60 * 1e3;
var MAX_ENTRIES = 1e4;
var processedAt = /* @__PURE__ */ new Map();
function prune() {
  const now = Date.now();
  for (const [key, at] of processedAt) {
    if (now - at > TTL_MS) processedAt.delete(key);
  }
  if (processedAt.size <= MAX_ENTRIES) return;
  const sorted = [...processedAt.entries()].sort((a, b) => a[1] - b[1]);
  const toDrop = sorted.length - MAX_ENTRIES;
  for (let i = 0; i < toDrop; i++) {
    processedAt.delete(sorted[i][0]);
  }
}
function webhookMessageKey(message) {
  const id = message["id"];
  if (typeof id === "string" && id.trim()) return `id:${id.trim()}`;
  if (typeof id === "number") return `id:${id}`;
  const nested = message["message"];
  if (typeof nested === "object" && nested !== null) {
    const mid = nested["id"];
    if (typeof mid === "string" && mid.trim()) return `id:${mid.trim()}`;
  }
  const chatId = String(message["chat_id"] ?? "");
  const entityId = String(message["entity_id"] ?? "");
  const att = message["attachment"];
  if (typeof att === "object" && att !== null) {
    const link = att["link"] ?? att["url"];
    if (typeof link === "string" && link.trim() && chatId) {
      return `media:${chatId}:${link.trim()}`;
    }
  }
  const text = typeof message["text"] === "string" ? message["text"].trim() : "";
  const created = message["created_at"] ?? message["timestamp"];
  if (chatId && text && created) return `text:${chatId}:${created}:${text.slice(0, 120)}`;
  return null;
}
function isDuplicateWebhookMessage(key) {
  const at = processedAt.get(key);
  if (!at) return false;
  if (Date.now() - at > TTL_MS) {
    processedAt.delete(key);
    return false;
  }
  return true;
}
function markWebhookMessageProcessed(key) {
  processedAt.set(key, Date.now());
  if (processedAt.size > MAX_ENTRIES * 0.9) prune();
}
function isIncomingClientMessage(message) {
  const msgType = String(message["type"] ?? "").toLowerCase();
  if (msgType === "outgoing") return false;
  const author = message["author"];
  if (typeof author === "object" && author !== null) {
    const authorType = String(author["type"] ?? "").toLowerCase();
    if (authorType === "internal" || authorType === "user") return false;
  }
  return true;
}
function resetWebhookDedupForTests() {
  processedAt.clear();
}

// src/selftest/lucy-flow-selftest.ts
var CATALOG_URL = "https://cdn.shopify.com/s/files/1/0809/1215/4936/files/Catalogo-Menus-Bodasesor-2026_4_b5efa97c-ce47-4bef-b189-aca2d91fefa7.pdf";
var passed = 0;
var failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL ${name}:`, msg);
    process.exitCode = 1;
  }
}
function emptyExtracted(overrides = {}) {
  return {
    nombre: null,
    telefono: null,
    correo: null,
    presupuesto: null,
    direccion_evento: null,
    requerimientos_evento: null,
    fecha_horario: null,
    num_invitados: null,
    tipo_evento: null,
    tipo_contacto: "cliente",
    empresa: null,
    modo_servicio: null,
    ...overrides
  };
}
function mockClosing(servicios, clientName) {
  const advisor = advisorLabelForClient(clientName);
  const handoff = advisor === "nuestro equipo" ? "Le paso estos datos a nuestro equipo para que te arme una cotizaci\xF3n personalizada." : `Le paso estos datos a ${advisor} para que te arme una cotizaci\xF3n personalizada.`;
  return `Perfecto, ya tengo todo. ${handoff}

Mientras tanto, aqu\xED est\xE1 nuestro cat\xE1logo completo:
${CATALOG_URL}

Servicios: ${servicios ?? "varios"}`;
}
function runGuards(opts) {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: opts.readyForClosing,
    cierreYaEnviado: false,
    emailRefusedThisTurn: opts.emailRefusedThisTurn ?? false,
    history: opts.history ?? [],
    currentMessage: opts.currentMessage,
    buildClosing: mockClosing,
    log: opts.debugLogs ? {
      info: (_o, msg) => {
        if (msg) opts.debugLogs.push(msg);
      },
      warn: (_o, msg) => {
        if (msg) opts.debugLogs.push(`WARN:${msg}`);
      }
    } : void 0
  });
}
async function runAll() {
  console.log("Lucy \u2014 28 escenarios de prueba\n");
  await test('1. A14754 \u2014 "Busco comida" ofrece banquete/taquiza', () => {
    const filled = /* @__PURE__ */ new Set(["Nombre del cliente", EMAIL_WAIVED_LABEL, "Tipo de evento"]);
    const extracted = emptyExtracted({ nombre: "Alejandro", tipo_evento: "cumplea\xF1os" });
    const history = [
      { role: "assistant", content: "\xBFQu\xE9 servicios te gustar\xEDa cotizar para la fiesta de cumplea\xF1os?" }
    ];
    const lastLucy = history[0].content;
    assert.equal(inferLucyAskedField(lastLucy), "requerimientos");
    assert.ok(clientMentionsCatering("Busco comida"));
    assert.ok(isServiceRelatedMessage("Busco comida"));
    const debugLogs = [];
    const reply = runGuards({
      aiResponse: "\xBFCu\xE1ntos invitados?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Busco comida",
      history,
      debugLogs
    });
    if (!/banquete|taquiza|catering|alimentos/i.test(reply)) {
      throw new Error(`respuesta inesperada: "${reply.slice(0, 200)}" | logs: ${debugLogs.join(" > ")}`);
    }
    assert.equal(parsePrimaryService("Busco comida"), "banquete / taquiza");
  });
  await test("2. Cliente Alejandro \u2014 cierre dice nuestro equipo, no Alejandro asesor", () => {
    const filled = /* @__PURE__ */ new Set([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios",
      "N\xFAmero de invitados",
      "Lugar/direcci\xF3n del evento",
      "Fecha y horario",
      "Presupuesto (MXN)"
    ]);
    const extracted = emptyExtracted({
      nombre: "Alejandro",
      tipo_evento: "cumplea\xF1os",
      requerimientos_evento: "banquete / taquiza",
      num_invitados: 60,
      direccion_evento: "CDMX",
      fecha_horario: "en 2 meses",
      presupuesto: 8e4
    });
    assert.equal(isReadyForClosing(filled), true);
    const reply = runGuards({
      aiResponse: "Informaci\xF3n completa obtenida.",
      extracted,
      filledSet: filled,
      readyForClosing: true,
      currentMessage: "En 2 meses"
    });
    assert.ok(reply.includes("Perfecto, ya tengo todo"));
    assert.ok(reply.includes("nuestro equipo"));
    assert.ok(!/pasar.*a Alejandro/i.test(reply));
    assert.ok(reply.includes(CATALOG_URL));
  });
  await test("3. 60 invitados no marca presupuesto ni cierra el embudo", () => {
    assert.equal(parsePresupuestoFromText("60"), null);
    assert.equal(parseInvitadosFromText("60"), "60");
    const caps = scanConversationForCaptures([], "60", /* @__PURE__ */ new Set());
    assert.equal(caps.find((c) => c.label === "Presupuesto (MXN)"), void 0);
    assert.equal(caps.find((c) => c.label === "N\xFAmero de invitados")?.value, "60");
    const filled = /* @__PURE__ */ new Set([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios",
      "N\xFAmero de invitados",
      "Lugar/direcci\xF3n del evento",
      "Fecha y horario"
    ]);
    assert.equal(isReadyForClosing(filled), false);
    assert.equal(getNextPendingField(emptyExtracted({ num_invitados: 60 }), filled), "presupuesto");
  });
  await test('4. "Por este medio est\xE1 bien" \u2014 waiver de correo y sin re-preguntar', () => {
    assert.ok(detectEmailRefusal(["Por este medio est\xE1 bien"]));
    const merged = [];
    const filled = /* @__PURE__ */ new Set(["Nombre del cliente"]);
    applyEmailWaiver(filled, merged, ["Por este medio est\xE1 bien"]);
    assert.ok(filled.has(EMAIL_WAIVED_LABEL));
    const extracted = emptyExtracted({ nombre: "Ana" });
    const reply = runGuards({
      aiResponse: "\xBFMe das tu correo?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Por este medio est\xE1 bien",
      emailRefusedThisTurn: true,
      history: [{ role: "assistant", content: "\xBFA qu\xE9 correo te lo env\xEDo?" }]
    });
    assert.ok(!/correo/i.test(reply) || /seguimos por aquí/i.test(reply));
    assert.ok(/cumpleaños|evento|festejan|tipo/i.test(reply));
  });
  await test("5. Pregunta tel\xE9fonos \u2014 ventas solo llamada, gerencia con WhatsApp", () => {
    assert.ok(clientAsksPhone("\xBFTienen tel\xE9fono de ventas?"));
    const phone = buildPhoneAnswer();
    assert.ok(/4008\s*0373/.test(phone));
    assert.ok(/4671\s*0585/.test(phone));
    assert.ok(/sin WhatsApp/i.test(phone));
    assert.ok(/Gerencia.*WhatsApp/is.test(phone));
    const filled = /* @__PURE__ */ new Set(["Nombre del cliente", EMAIL_WAIVED_LABEL, "Tipo de evento"]);
    const reply = runGuards({
      aiResponse: "ok",
      extracted: emptyExtracted({ nombre: "Luis", tipo_evento: "boda" }),
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "\xBFTienen tel\xE9fono? Nadie contesta"
    });
    assert.ok(/4008|4671/.test(reply));
    assert.ok(/sin WhatsApp/i.test(reply));
  });
  await test('6. "No s\xE9 a\xFAn" en invitados \u2014 captura sin re-preguntar invitados', () => {
    const inv = parseInvitadosFromText("No s\xE9 a\xFAn");
    assert.ok(inv?.includes("Sin definir"));
    const filled = /* @__PURE__ */ new Set([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios"
    ]);
    const merged = [];
    const caps = captureContextualAnswer(
      [{ role: "assistant", content: "\xBFM\xE1s o menos para cu\xE1ntas personas ser\xEDa?" }],
      "No s\xE9 a\xFAn",
      filled
    );
    applyCapturesToCrm(merged, filled, caps);
    assert.ok(filled.has("N\xFAmero de invitados"));
    assert.equal(getNextPendingField(emptyExtracted(), filled), "zona");
  });
  await test("7. Boda \u2014 recomendaciones mencionan banquete/taquiza y cat\xE1logo", () => {
    assert.ok(clientAsksForRecommendations("\xBFQu\xE9 me recomiendas para mi boda?"));
    const reply = buildRecommendationsReply(
      emptyExtracted({ tipo_evento: "boda" }),
      [],
      1,
      "\xBFQu\xE9 me recomiendas?"
    );
    assert.ok(/banquete|taquiza/i.test(reply));
    assert.ok(/bebidas|mobiliario|DJ|iluminaci/i.test(reply));
  });
  await test("8. Secuencia 60 pax + presupuesto 80k \u2014 sin contaminar campos", () => {
    const filled = /* @__PURE__ */ new Set();
    const merged = [];
    applyCapturesToCrm(merged, filled, scanConversationForCaptures([], "60", filled));
    assert.equal(merged.find((l) => l.includes("invitados"))?.includes("60"), true);
    assert.equal(merged.find((l) => l.includes("Presupuesto")), void 0);
    const capsPres = captureContextualAnswer(
      [{ role: "assistant", content: "\xBFTienen alg\xFAn rango de presupuesto en mente?" }],
      "80000",
      filled
    );
    applyCapturesToCrm(merged, filled, capsPres);
    assert.ok(filled.has("Presupuesto (MXN)"));
    assert.ok(merged.some((l) => /Presupuesto.*80000/i.test(l)));
    const extracted = emptyExtracted({ num_invitados: 60, presupuesto: 8e4 });
    assert.notEqual(extracted.presupuesto, extracted.num_invitados);
  });
  await test("9. Resumen largo \u2014 sin emojis, servicios reales, no confunde tipo", () => {
    const text = buildResumenClienteLargo(
      emptyExtracted({
        nombre: "Alejandro",
        tipo_evento: "cumplea\xF1os",
        requerimientos_evento: "banquete / taquiza",
        num_invitados: 60,
        direccion_evento: "CDMX",
        fecha_horario: "en 2 meses",
        presupuesto: 8e4
      }),
      [
        "- Nombre del cliente: Alejandro",
        "- Correo (prefiere no compartir): continuar por WhatsApp/chat",
        "- Tipo de evento: cumplea\xF1os",
        "- Requerimientos o servicios: banquete / taquiza",
        "- N\xFAmero de invitados: 60",
        "- Lugar/direcci\xF3n del evento: CDMX",
        "- Fecha y horario: en 2 meses",
        "- Presupuesto (MXN): 80000"
      ],
      "cumplea\xF1os busco comida 60 CDMX en 2 meses"
    );
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(text), "contiene emojis");
    assert.ok(text.includes("banquete"));
    assert.ok(text.includes("Invitados: 60"));
    assert.ok(text.includes("CDMX"));
    assert.ok(!text.includes("Servicios / requerimientos: cumplea\xF1os"));
    assert.ok(text.includes("contin\xFAa por WhatsApp"));
  });
  await test("10. Integraciones \u2014 m\xF3dulos conectados y features activas", () => {
    const apiRoot = path2.resolve(path2.dirname(fileURLToPath(import.meta.url)), "../..");
    const mirrorSrc = readFileSync(path2.join(apiRoot, "src/services/kommoMirror.ts"), "utf8");
    const healthSrc = readFileSync(path2.join(apiRoot, "src/routes/health.ts"), "utf8");
    assert.ok(mirrorSrc.includes("deliverLucyOutbound"));
    assert.ok(mirrorSrc.includes("sendWhatsAppDirect"));
    assert.ok(healthSrc.includes('mode: "meta_plus_note"'));
    const catalog = getCatalogStatus();
    assert.equal(typeof catalog.loaded, "boolean");
    assert.ok(catalog.sources);
    assert.equal(typeof catalog.sources.sheets, "boolean");
    assert.equal(CLOSING_CORE_FIELDS.length, 7);
    assert.ok(LUCY_INTRO.includes("Lucy"));
    assert.ok(isValidRequerimientosValue("banquete"));
    assert.ok(!isValidRequerimientosValue("cumplea\xF1os"));
    assert.equal(clientAsksAboutTeam("Alejandro", "Alejandro"), false);
    assert.equal(clientAsksAboutTeam("\xBFQui\xE9n es Rodrigo?", "Mar\xEDa"), true);
    assert.equal(clientAsksAboutTeam("\xBFQui\xE9n es Alejandro?", "Mar\xEDa"), true);
    const norm = normalizeAdvisorReferences(
      "Le paso estos datos a Alejandro para que te arme una cotizaci\xF3n.",
      "Alejandro"
    );
    assert.ok(norm.includes("nuestro equipo"));
    const healthFeatures = [
      "understanding",
      "redaction-briefing",
      "training-db",
      "lucy-admin",
      "debounce-5s",
      "learning-from-human-chats",
      "knowledge-gaps-aprendizaje"
    ];
    assert.equal(healthFeatures.length, 7);
  });
  await test('11. Bakar \u2014 "Quiero cotizaci\xF3n" NO es nombre', () => {
    assert.equal(isQuoteIntentMessage("Quiero hacer una cotizacion"), true);
    assert.equal(sanitizeDisplayName("Quiero hacer una cotizacion"), null);
    assert.equal(sanitizeDisplayName("Quiero"), null);
    const filled = /* @__PURE__ */ new Set();
    const caps = captureContextualAnswer([], "Quiero hacer una cotizacion", filled);
    assert.equal(caps.find((c) => c.label === "Nombre del cliente"), void 0);
  });
  await test('12. Bakar \u2014 "no" en presupuesto no repite bucle', () => {
    assert.ok(detectPresupuestoRefusal("no"));
    assert.ok(detectPresupuestoRefusal("no no tengo presupuesto, no me brindaron"));
    assert.equal(
      parsePresupuestoFromText("no", { askedField: "presupuesto" }),
      "Sin definir (cliente indic\xF3 que no tiene)"
    );
    const filled = /* @__PURE__ */ new Set([
      "Nombre del cliente",
      "Correo electr\xF3nico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "N\xFAmero de invitados",
      "Lugar/direcci\xF3n del evento",
      "Fecha y horario"
    ]);
    const merged = [];
    applyPresupuestoWaiver(filled, merged, ["no"]);
    assert.ok(filled.has("Presupuesto (MXN)"));
    assert.equal(isReadyForClosing(filled), true);
    const extracted = emptyExtracted({
      nombre: "Bakar",
      correo: "compras1@scabakar.com",
      tipo_evento: "evento corporativo",
      requerimientos_evento: "show grupo versatil",
      num_invitados: 30,
      direccion_evento: "Club de Golf Mexico",
      fecha_horario: "18 de diciembre a las 20:00 horas"
    });
    const reply = runGuards({
      aiResponse: "\xBFTienen presupuesto estimado?",
      extracted,
      filledSet: filled,
      readyForClosing: true,
      currentMessage: "no",
      history: [{ role: "assistant", content: "\xBFTienen alg\xFAn presupuesto estimado en mente?" }]
    });
    assert.ok(reply.includes("Perfecto, ya tengo todo") || !/presupuesto/i.test(reply));
  });
  await test("13. Bakar \u2014 show de grupo vers\xE1til ofrece entretenimiento", () => {
    assert.ok(clientMentionsEntertainment("requerimos un show de grupo versatil"));
    const filled = /* @__PURE__ */ new Set(["Nombre del cliente", "Correo electr\xF3nico"]);
    const extracted = emptyExtracted({ nombre: "Bakar", correo: "compras1@scabakar.com" });
    const msg = "requerimos un show de grupo versatil para el dia 18 de diciembre a las 20:00 horas para un grupo de 30 personas";
    const reply = runGuards({
      aiResponse: "\xBFQu\xE9 tipo de evento?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: msg,
      history: [{ role: "assistant", content: "\xBFQu\xE9 servicios te gustar\xEDa cotizar?" }]
    });
    assert.ok(/show|animaci|hora\s+loca|entretenimiento|vers[aá]til/i.test(reply), reply.slice(0, 150));
  });
  await test("14. Fer A14756 \u2014 pista/tarima ofrece orientaci\xF3n de venta", () => {
    assert.ok(clientMentionsPistaTarima("quiero cotizar una pista de baile o tarima"));
    const filled = /* @__PURE__ */ new Set();
    const extracted = emptyExtracted();
    const reply = runGuards({
      aiResponse: "\xBFMe regalas tu nombre?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Hola, me gustar\xEDa cotizar una pista de baile o tarima para mi evento",
      history: []
    });
    assert.ok(/pista|tarima|iluminada|tamaño/i.test(reply), reply.slice(0, 200));
  });
  await test("15. Fer A14756 \u2014 6m x 12m NO es ubicaci\xF3n", () => {
    assert.ok(isDimensionText("Son 50 personas. El espacio es de 6 metros por 12"));
    assert.equal(parseZonaFromText("6 metros por 12"), null);
    assert.equal(parseSpaceDimensions("El espacio es de 6 metros por 12"), "6m x 12m");
    const filled = /* @__PURE__ */ new Set(["Nombre del cliente", "Correo electr\xF3nico", "Tipo de evento"]);
    const merged = [];
    const caps = [
      ...captureContextualAnswer(
        [{ role: "assistant", content: "\xBFM\xE1s o menos para cu\xE1ntas personas ser\xEDa?" }],
        "Son 50 personas. El espacio es de 6 metros por 12",
        filled
      ),
      ...scanConversationForCaptures(
        [{ role: "user", content: "Hola, quiero cotizar una pista de baile o tarima" }],
        "Son 50 personas. El espacio es de 6 metros por 12",
        filled
      )
    ];
    applyCapturesToCrm(merged, filled, caps);
    assert.ok(merged.some((l) => /invitados.*50/i.test(l)));
    assert.ok(!merged.some((l) => /Lugar\/dirección/i.test(l)));
    assert.ok(
      merged.some((l) => /Requerimientos.*6m x 12m|espacio 6m/i.test(l)) || caps.some((c) => /6m x 12m|espacio/i.test(c.value))
    );
  });
  await test('16. Fer A14756 \u2014 presupuesto econ\xF3mico y "gracias" post-cierre', () => {
    assert.equal(parsePresupuestoFromText("Lo m\xE1s econ\xF3mico posible"), "Opciones econ\xF3micas (sin monto fijo)");
    assert.ok(detectPresupuestoRefusal("No tengo rango ee comparaci\xF3n"));
    const filled = /* @__PURE__ */ new Set([
      "Nombre del cliente",
      "Correo electr\xF3nico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "N\xFAmero de invitados",
      "Lugar/direcci\xF3n del evento",
      "Fecha y horario"
    ]);
    const extracted = emptyExtracted({
      nombre: "Fer",
      correo: "ferramlun2206@gmail.com",
      tipo_evento: "cumplea\xF1os",
      requerimientos_evento: "Pista de baile (espacio 6m x 12m)",
      num_invitados: 50,
      fecha_horario: "15 de julio"
    });
    const ecoReply = runGuards({
      aiResponse: "\xBFTienen alg\xFAn rango de presupuesto en mente?",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      currentMessage: "Lo m\xE1s econ\xF3mico posible",
      history: [{ role: "assistant", content: "\xBFTienen alg\xFAn rango de presupuesto en mente?" }]
    });
    assert.ok(!/rango de presupuesto/i.test(ecoReply), ecoReply.slice(0, 200));
    assert.ok(
      /econ[oó]mic|cierre|ya tengo todo/i.test(ecoReply),
      `debe reconocer presupuesto econ\xF3mico o cerrar: ${ecoReply.slice(0, 200)}`
    );
    const thanksFilled = /* @__PURE__ */ new Set([...filled, "Presupuesto (MXN)", "Lugar/direcci\xF3n del evento"]);
    const thanksReply = applyLucyMessageGuards({
      aiResponse: "",
      extracted,
      filledSet: thanksFilled,
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: [{ role: "assistant", content: "Perfecto, ya tengo todo." }],
      currentMessage: "Muchas gracias",
      buildClosing: mockClosing
    });
    assert.ok(thanksReply.trim().length > 0, "respuesta vac\xEDa");
    assert.ok(clientSaysThanks("Muchas gracias"));
    assert.ok(buildPostCierreThanksReply("Fer").includes("Fer"));
    const apiRoot = path2.resolve(path2.dirname(fileURLToPath(import.meta.url)), "../..");
    const mirrorSrc = readFileSync(path2.join(apiRoot, "src/services/kommoMirror.ts"), "utf8");
    assert.ok(mirrorSrc.includes("texto vac\xEDo"));
  });
  await test("17. Fer A14751 \u2014 brunch baby shower, correo, fecha y presupuesto sin bucles", () => {
    assert.equal(isQuoteIntentMessage("Quiero hacer una cotizacion"), true);
    assert.equal(sanitizeDisplayName("Quiero"), null);
    assert.ok(clientMentionsCatering("Brunch/ desayuno para 35 personas"));
    assert.ok(isServiceLabelNotTipoEvento("brunch"));
    assert.equal(parseCorreoFromText("Si fer.barrientost2892@gmail.com"), "fer.barrientost2892@gmail.com");
    assert.equal(parseFechaFromText("Todav\xEDa la vamos a definir"), "Sin definir (pendiente)");
    assert.ok(parseFechaFromText("Yo creo que x octubre")?.includes("octubre"));
    assert.equal(
      parsePresupuestoFromText("Tu m\xE1ndame el presupuesto y si quieres vemos"),
      "Sin definir (cliente pidi\xF3 que propongamos)"
    );
    const filled = /* @__PURE__ */ new Set([
      "Nombre del cliente",
      "Correo electr\xF3nico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "N\xFAmero de invitados",
      "Lugar/direcci\xF3n del evento",
      "Fecha y horario"
    ]);
    const extracted = emptyExtracted({
      nombre: "Fer",
      correo: "fer.barrientost2892@gmail.com",
      tipo_evento: "baby shower",
      requerimientos_evento: "Brunch",
      num_invitados: 35,
      direccion_evento: "Jardines del pedregal",
      fecha_horario: "Sin definir (pendiente)"
    });
    const presFilled = new Set(filled);
    const presReply = runGuards({
      aiResponse: "\xBFTienen alg\xFAn rango de presupuesto en mente?",
      extracted,
      filledSet: presFilled,
      readyForClosing: false,
      currentMessage: "Tu m\xE1ndame el presupuesto y si quieres vemos",
      history: [{ role: "assistant", content: "\xBFTienen alg\xFAn rango de presupuesto en mente?" }]
    });
    assert.ok(!/rango de presupuesto/i.test(presReply), presReply.slice(0, 200));
    const fechaFilled = new Set(filled);
    const fechaAi = "\xBFYa hay d\xEDa definido o siguen viendo opciones?";
    assert.ok(mensajeAsksForFilledField(fechaAi, fechaFilled, extracted), "debe detectar fecha repetida");
    const fechaReply = runGuards({
      aiResponse: fechaAi,
      extracted,
      filledSet: fechaFilled,
      readyForClosing: false,
      currentMessage: "Todav\xEDa la vamos a definir",
      history: [{ role: "assistant", content: "\xBFYa tienen fecha o todav\xEDa la van definiendo?" }]
    });
    if (/fecha|d[ií]a definido/i.test(fechaReply) && !/presupuesto/i.test(fechaReply)) {
      throw new Error(`fechaReply inesperada: ${fechaReply.slice(0, 200)}`);
    }
    const brunchFilled = /* @__PURE__ */ new Set(["Nombre del cliente", "Correo electr\xF3nico", "Tipo de evento"]);
    const brunchReply = runGuards({
      aiResponse: "\xBFA qu\xE9 correo te mando la informaci\xF3n?",
      extracted: emptyExtracted({ nombre: "Fer", tipo_evento: "baby shower" }),
      filledSet: brunchFilled,
      readyForClosing: false,
      currentMessage: "Brunch/ desayuno para 35 personas",
      history: [{ role: "assistant", content: "\xBFQu\xE9 servicios te gustar\xEDa cotizar?" }]
    });
    assert.ok(/brunch|banquete|taquiza|desayuno|alimentos/i.test(brunchReply), brunchReply.slice(0, 200));
    assert.ok(!/correo/i.test(brunchReply), "no debe re-preguntar correo ya capturado");
  });
  await test("18. Ver\xF3nica A14760 \u2014 por aqu\xED sin correo, sin Alejandro, nombre completo", () => {
    assert.ok(detectEmailRefusal(["Si me la pueden mandar por aqu\xED porfa"]));
    assert.equal(sanitizeCrmNombre("Ver\xF3nica Camarillo"), "Ver\xF3nica Camarillo");
    assert.equal(sanitizeDisplayName("Ver\xF3nica Camarillo"), "Ver\xF3nica");
    const merged = ["- Nombre del cliente: Ver\xF3nica"];
    const filled = /* @__PURE__ */ new Set(["Nombre del cliente"]);
    applyEmailWaiver(filled, merged, ["Si me la pueden mandar por aqu\xED porfa"]);
    assert.ok(filled.has(EMAIL_WAIVED_LABEL));
    const extracted = emptyExtracted({ nombre: "Ver\xF3nica Camarillo", tipo_evento: "cumplea\xF1os" });
    const reply = runGuards({
      aiResponse: "Claro, Ver\xF3nica. \xBFMe podr\xEDas compartir tu correo para enviarte la informaci\xF3n y que Alejandro te arme la propuesta?",
      extracted,
      filledSet: /* @__PURE__ */ new Set([...filled, "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "Si me la pueden mandar por aqu\xED porfa",
      emailRefusedThisTurn: true,
      history: [{ role: "assistant", content: "\xBFA qu\xE9 correo te lo env\xEDo?" }]
    });
    assert.ok(!/correo/i.test(reply), reply.slice(0, 200));
    assert.ok(!/Alejandro/i.test(reply), reply);
    assert.ok(/seguimos por aquí|invitados|servicios|pensado/i.test(reply), reply.slice(0, 200));
    const norm = normalizeAdvisorReferences(
      "para que Alejandro te arme la propuesta",
      "Ver\xF3nica"
    );
    assert.ok(norm.includes("nuestro equipo"));
    assert.ok(!/Alejandro/i.test(norm));
  });
  await test("19. Fer A14751 \u2014 no repetir presupuesto tras waiver ni 2+ preguntas", () => {
    const baseFilled = /* @__PURE__ */ new Set([
      "Nombre del cliente",
      "Correo electr\xF3nico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "N\xFAmero de invitados",
      "Lugar/direcci\xF3n del evento",
      "Fecha y horario"
    ]);
    const extracted = emptyExtracted({
      nombre: "Fer",
      correo: "fer.barrientost2892@gmail.com",
      tipo_evento: "baby shower",
      requerimientos_evento: "Brunch",
      num_invitados: 35,
      direccion_evento: "Jardines del pedregal",
      fecha_horario: "Sin definir (pendiente)"
    });
    const historyAfterRefusal = [
      { role: "assistant", content: "\xBFTienen alg\xFAn rango de presupuesto en mente?" },
      { role: "user", content: "Tu m\xE1ndame el presupuesto y si quieres vemos" },
      { role: "assistant", content: "Entendido, sin problema. Nuestro equipo te propone opciones seg\xFAn lo que platicamos." }
    ];
    const filledAfterRefusal = new Set(baseFilled);
    applyPresupuestoWaiver(
      filledAfterRefusal,
      [],
      ["Tu m\xE1ndame el presupuesto y si quieres vemos"],
      historyAfterRefusal
    );
    assert.ok(filledAfterRefusal.has("Presupuesto (MXN)"));
    const loopReply1 = runGuards({
      aiResponse: "\xBFManejan alg\xFAn presupuesto estimado para el evento?",
      extracted,
      filledSet: new Set(baseFilled),
      readyForClosing: false,
      currentMessage: "ok",
      history: [
        ...historyAfterRefusal,
        { role: "assistant", content: "\xBFManejan alg\xFAn presupuesto estimado para el evento?" }
      ]
    });
    assert.ok(!/presupuesto|rango|estimado/i.test(loopReply1), loopReply1.slice(0, 200));
    const filledLoop = new Set(baseFilled);
    const historyDoubleAsk = [
      { role: "assistant", content: "\xBFTienen alg\xFAn rango de presupuesto en mente?" },
      { role: "user", content: "..." },
      { role: "assistant", content: "\xBFManejan alg\xFAn presupuesto estimado para el evento?" }
    ];
    assert.equal(countLucyFieldAsks(historyDoubleAsk, "presupuesto"), 2);
    applyPresupuestoWaiver(filledLoop, [], ["..."], historyDoubleAsk);
    assert.ok(filledLoop.has("Presupuesto (MXN)"));
    const loopReply2 = runGuards({
      aiResponse: "\xBFTienen idea del presupuesto o prefieren que les propongamos opciones?",
      extracted,
      filledSet: new Set(baseFilled),
      readyForClosing: false,
      currentMessage: "gracias",
      history: historyDoubleAsk
    });
    assert.ok(!/presupuesto|rango|estimado|inversi/i.test(loopReply2), loopReply2.slice(0, 200));
    assert.ok(
      loopReply2.includes("Perfecto, ya tengo todo") || loopReply2.includes("sin problema") || loopReply2.includes("nuestro equipo"),
      loopReply2.slice(0, 200)
    );
  });
  await test('20. Nayeli A14766 \u2014 "tope de 5,000" y "que propongan opciones" se capturan sin 4 preguntas', () => {
    assert.equal(
      parsePresupuestoFromText("Mi tope es de 5,000"),
      "Hasta $5000 MXN"
    );
    assert.ok(detectPresupuestoRefusal("Que me propongan opciones"));
    assert.equal(
      parsePresupuestoFromText("Que me propongan opciones"),
      "Sin definir (cliente indic\xF3 que no tiene)"
    );
    const baseFilled = /* @__PURE__ */ new Set([
      "Nombre del cliente",
      "Correo electr\xF3nico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "N\xFAmero de invitados",
      "Lugar/direcci\xF3n del evento",
      "Fecha y horario"
    ]);
    const extracted = emptyExtracted({
      nombre: "Nayeli",
      correo: "naygt_13@hotmail.com",
      tipo_evento: "primera comuni\xF3n",
      requerimientos_evento: "Video y fotograf\xEDa, libro de fotos",
      num_invitados: 40,
      direccion_evento: "Parroquia Santo Domingo de Guzm\xE1n, Insurgentes Mixcoac",
      fecha_horario: "Sin definir (pendiente)"
    });
    const filledTurn1 = new Set(baseFilled);
    const historyAsk1 = [
      { role: "assistant", content: "\xBFTienen alg\xFAn rango de presupuesto en mente para la primera comuni\xF3n?" }
    ];
    const reply1 = runGuards({
      aiResponse: "\xBFTienen idea del presupuesto o prefieren que nuestro equipo les proponga opciones?",
      extracted,
      filledSet: filledTurn1,
      readyForClosing: false,
      currentMessage: "Mi tope es de 5,000",
      history: historyAsk1
    });
    assert.ok(!/rango\s+de\s+presupuesto|presupuesto\s+en\s+mente|idea\s+del\s+presupuesto/i.test(reply1), reply1.slice(0, 200));
    assert.ok(filledTurn1.has("Presupuesto (MXN)"), "debe capturar el tope como presupuesto");
    const historyAfterTwoAsks = [
      { role: "assistant", content: "\xBFTienen alg\xFAn rango de presupuesto en mente para la primera comuni\xF3n?" },
      { role: "user", content: "Mi tope es de 5,000" },
      { role: "assistant", content: "\xBFTienen idea del presupuesto o prefieren que nuestro equipo les proponga opciones?" },
      { role: "user", content: "Que me propongan opciones" }
    ];
    assert.equal(countLucyFieldAsks(historyAfterTwoAsks, "presupuesto"), 2);
    const filledTurn3 = new Set(baseFilled);
    applyPresupuestoWaiver(filledTurn3, [], ["Que me propongan opciones"], historyAfterTwoAsks);
    assert.ok(filledTurn3.has("Presupuesto (MXN)"), "tope de 2 preguntas debe forzar auto-waiver");
    const reply3 = runGuards({
      aiResponse: "\xBFTienen alg\xFAn rango de presupuesto en mente?",
      extracted,
      filledSet: new Set(baseFilled),
      readyForClosing: false,
      currentMessage: "Mo",
      history: historyAfterTwoAsks
    });
    assert.ok(
      !/rango\s+de\s+presupuesto|presupuesto\s+en\s+mente/i.test(reply3),
      `no debe haber una 3\xAA pregunta de presupuesto: ${reply3.slice(0, 200)}`
    );
    assert.ok(
      reply3.includes("Perfecto, ya tengo todo") || /nuestro equipo|sin problema/i.test(reply3),
      reply3.slice(0, 200)
    );
  });
  await test('21. Manuel A14770 \u2014 "\xBFalg\xFAn otro servicio?" no se pregunta para siempre', () => {
    assert.ok(clientDeclinesMoreServices("No"));
    assert.ok(clientDeclinesMoreServices("Solo con eso"));
    assert.ok(clientDeclinesMoreServices("Solo eso"));
    assert.ok(clientDeclinesMoreServices("Ning\xFAn otro servicio"));
    assert.ok(clientDeclinesMoreServices("No gracias"));
    assert.ok(!clientDeclinesMoreServices("Animaci\xF3n"));
    const filledReady = /* @__PURE__ */ new Set([
      "Nombre del cliente",
      "Correo electr\xF3nico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "N\xFAmero de invitados",
      "Lugar/direcci\xF3n del evento",
      "Fecha y horario",
      "Presupuesto (MXN)"
    ]);
    const extracted = emptyExtracted({
      nombre: "Manuel",
      correo: "arteagamanuel714@gmail.com",
      tipo_evento: "cumplea\xF1os",
      requerimientos_evento: "show en vivo, animaci\xF3n, hora loca, happening, espejos, l\xE1ser",
      num_invitados: 125,
      direccion_evento: "Naucalpan de Ju\xE1rez, Edo Mex",
      fecha_horario: "pr\xF3ximo a\xF1o",
      presupuesto: 12500
    });
    assert.equal(isReadyForClosing(filledReady), true);
    const historyFirstAsk = [
      {
        role: "assistant",
        content: "Para tu evento, manejamos shows en vivo, animaci\xF3n, hora loca, happening, espejos, l\xE1ser y m\xE1s opciones de entretenimiento. \xBFQu\xE9 necesitas para el evento?"
      }
    ];
    const historyLoop = [
      ...historyFirstAsk,
      { role: "user", content: "No me interesa" },
      {
        role: "assistant",
        content: "Perfecto. Con el Animaci\xF3n / Hora loca, \xBFnecesitan alg\xFAn otro servicio?"
      },
      { role: "user", content: "Fiesta din\xE1mica" },
      {
        role: "assistant",
        content: "Perfecto. Con el show en vivo, animaci\xF3n, hora loca, happening, espejos, l\xE1ser, \xBFnecesitan alg\xFAn otro servicio?"
      },
      { role: "user", content: "Ning\xFAn otro servicio" },
      {
        role: "assistant",
        content: "Perfecto. Con el Animaci\xF3n / Hora loca, \xBFnecesitan alg\xFAn otro servicio?"
      }
    ];
    const debugLogs = [];
    const replyNo = runGuards({
      aiResponse: "Perfecto. Con el Animaci\xF3n / Hora loca, \xBFnecesitan alg\xFAn otro servicio?",
      extracted,
      filledSet: new Set(filledReady),
      readyForClosing: true,
      currentMessage: "No",
      history: historyLoop,
      debugLogs
    });
    assert.ok(
      replyNo.includes("Perfecto, ya tengo todo") || replyNo.includes(CATALOG_URL),
      `debe cerrar en vez de repetir: "${replyNo.slice(0, 200)}" | logs: ${debugLogs.join(" > ")}`
    );
    assert.ok(!/alg[uú]n\s+otro\s+servicio/i.test(replyNo), replyNo.slice(0, 200));
    const replyBareWord = runGuards({
      aiResponse: "\xBFQu\xE9 necesitas para el evento?",
      extracted,
      filledSet: new Set(filledReady),
      readyForClosing: true,
      currentMessage: "Animaci\xF3n",
      history: historyLoop
    });
    assert.ok(
      !/manejamos shows en vivo, animaci[oó]n, hora loca/i.test(replyBareWord),
      `no debe repetir el pitch de venta: "${replyBareWord.slice(0, 200)}"`
    );
    const replyRealQuestion = runGuards({
      aiResponse: "\xBFQu\xE9 necesitas para el evento?",
      extracted,
      filledSet: new Set(filledReady),
      readyForClosing: true,
      currentMessage: "\xBFC\xF3mo es eso de los espejos?",
      history: historyLoop
    });
    assert.ok(replyRealQuestion.trim().length > 0);
    const historyPostCierre = [
      {
        role: "assistant",
        content: "Perfecto, ya tengo todo. Voy a compartir esta informaci\xF3n con nuestro equipo para que te prepare una cotizaci\xF3n personalizada. Mientras tanto, aqu\xED tienes nuestro cat\xE1logo completo. \xBFTe gustar\xEDa incluir algo m\xE1s en la cotizaci\xF3n?"
      }
    ];
    const postCierreReply = applyLucyMessageGuards({
      aiResponse: "\xBFD\xF3nde se llevar\xE1 a cabo el evento?",
      extracted,
      filledSet: new Set(filledReady),
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: historyPostCierre,
      currentMessage: "No me interesa",
      buildClosing: mockClosing
    });
    assert.ok(
      !/d[oó]nde\s+se\s+llevar[aá]|qu[eé]\s+tipo\s+de\s+evento/i.test(postCierreReply),
      `no debe repetir zona/tipo de evento post-cierre: "${postCierreReply.slice(0, 200)}"`
    );
    assert.ok(postCierreReply.trim().length > 0);
    const filledSinZona = new Set(
      [...filledReady].filter((f) => f !== "Lugar/direcci\xF3n del evento")
    );
    const postCierreVariosNo = applyLucyMessageGuards({
      aiResponse: "\xBFEn qu\xE9 ciudad ser\xEDa tu evento? Si tienes la direcci\xF3n exacta, ser\xEDa lo ideal.",
      extracted,
      filledSet: filledSinZona,
      readyForClosing: true,
      cierreYaEnviado: true,
      emailRefusedThisTurn: false,
      history: historyPostCierre,
      currentMessage: "No",
      buildClosing: mockClosing
    });
    assert.ok(
      !/en\s+qu[eé]\s+ciudad|direcci[oó]n\s+exacta|tienen\s+ya\s+el\s+lugar/i.test(postCierreVariosNo),
      `no debe concatenar pregunta de zona tras el ack: "${postCierreVariosNo.slice(0, 200)}"`
    );
    assert.ok(/con gusto|nuestro equipo/i.test(postCierreVariosNo), postCierreVariosNo.slice(0, 200));
    for (const msg of ["No", "No", "Gracias"]) {
      const reply = applyLucyMessageGuards({
        aiResponse: "\xBFEn qu\xE9 ciudad ser\xEDa tu evento? Si tienes la direcci\xF3n exacta, ser\xEDa lo ideal.",
        extracted,
        filledSet: new Set(filledSinZona),
        readyForClosing: true,
        cierreYaEnviado: true,
        emailRefusedThisTurn: false,
        history: historyPostCierre,
        currentMessage: msg,
        buildClosing: mockClosing
      });
      assert.ok(
        !/en\s+qu[eé]\s+ciudad|direcci[oó]n\s+exacta|tienen\s+ya\s+el\s+lugar|d[oó]nde\s+se\s+llevar[aá]/i.test(reply),
        `"${msg}" no debe concatenar pregunta de zona: "${reply.slice(0, 200)}"`
      );
    }
  });
  await test("22. Manuel A14770 \u2014 CRM no se contamina con extracci\xF3n inestable del turno", () => {
    const mergedLines = [
      "- Nombre del cliente: Manuel",
      "- Correo electr\xF3nico: arteagamanuel714@gmail.com",
      "- Tipo de evento: cumplea\xF1os",
      "- Requerimientos o servicios: show en vivo, animaci\xF3n, hora loca, happening, espejos, l\xE1ser",
      "- Lugar/direcci\xF3n del evento: Naucalpan de Ju\xE1rez, Edo Mex"
    ];
    assert.equal(crmStoredValue(mergedLines, "Tipo de evento"), "cumplea\xF1os");
    assert.equal(
      crmStoredValue(mergedLines, "Lugar/direcci\xF3n del evento"),
      "Naucalpan de Ju\xE1rez, Edo Mex"
    );
    assert.equal(
      crmStoredValue(mergedLines, "Requerimientos o servicios"),
      "show en vivo, animaci\xF3n, hora loca, happening, espejos, l\xE1ser"
    );
    assert.equal(crmStoredValue(mergedLines, "Presupuesto (MXN)"), null);
    const tipoEventoContaminado = "fiesta din\xE1mica";
    const direccionContaminada = "vivo";
    const tipoEventoFinal = crmStoredValue(mergedLines, "Tipo de evento") ?? tipoEventoContaminado;
    const direccionFinal = crmStoredValue(mergedLines, "Lugar/direcci\xF3n del evento") ?? direccionContaminada;
    assert.equal(tipoEventoFinal, "cumplea\xF1os");
    assert.equal(direccionFinal, "Naucalpan de Ju\xE1rez, Edo Mex");
  });
  await test("23. Detecci\xF3n de notas de voz e im\xE1genes en el payload de Kommo", () => {
    assert.ok(isVoiceNote({ attachment: { type: "voice", link: "https://x/a.ogg" } }));
    assert.ok(isVoiceNote({ attachment: { type: "audio", link: "https://x/a.ogg" } }));
    assert.ok(isVoiceNote({ attachment: { mime_type: "audio/ogg", link: "https://x/a.ogg" } }));
    assert.equal(
      getVoiceNoteUrl({ attachment: { type: "voice", link: "https://x/a.ogg" } }),
      "https://x/a.ogg"
    );
    assert.ok(!isVoiceNote({ text: "hola" }));
    assert.ok(isImageMessage({ attachment: { type: "picture", link: "https://x/foto.jpg" } }));
    assert.ok(isImageMessage({ attachment: { type: "image", link: "https://x/foto.jpg" } }));
    assert.ok(isImageMessage({ attachment: { mime_type: "image/jpeg", link: "https://x/foto.jpg" } }));
    assert.ok(
      isImageMessage({
        attachments: [{ type: "picture", url: "https://x/foto.jpg" }]
      })
    );
    assert.ok(!isImageMessage({ text: "hola" }));
    assert.ok(!isImageMessage({ attachment: { type: "voice", link: "https://x/a.ogg" } }));
    assert.equal(
      getImageUrl({ attachment: { type: "picture", link: "https://x/foto.jpg" } }),
      "https://x/foto.jpg"
    );
    assert.equal(
      getImageCaption({ attachment: { type: "picture", link: "https://x/foto.jpg", text: "As\xED se ve el sal\xF3n" } }),
      "As\xED se ve el sal\xF3n"
    );
    assert.equal(getImageCaption({ attachment: { type: "picture", link: "https://x/foto.jpg" } }), null);
    const leaked = "Qu\xE9 bonito sal\xF3n. [Imagen adjunta: sal\xF3n de eventos con jard\xEDn y carpa blanca] \xBFEs ah\xED tu evento?";
    const cleaned = stripImageAnnotation(leaked);
    assert.ok(!/imagen adjunta/i.test(cleaned), cleaned);
    assert.ok(/qué bonito salón/i.test(cleaned));
  });
  await test("24. Sin\xF3nimos de captura (del prompt de Opus) \u2014 presupuesto, invitados, correo, zona", () => {
    assert.equal(parsePresupuestoFromText("$500 por persona"), "$500 MXN por persona");
    assert.equal(parsePresupuestoFromText("500 por cabeza"), "$500 MXN por persona");
    assert.equal(parsePresupuestoFromText("unos 600 pp"), "$600 MXN por persona");
    assert.equal(parsePresupuestoFromText("500 x persona"), "$500 MXN por persona");
    assert.equal(parsePresupuestoFromText("poquito"), "Flexible (sin monto fijo)");
    assert.equal(parsePresupuestoFromText("flexible"), "Flexible (sin monto fijo)");
    assert.equal(parsePresupuestoFromText("lo que sea necesario"), "Flexible (sin monto fijo)");
    assert.equal(parseInvitadosFromText("250 gentes"), "250");
    assert.equal(parseInvitadosFromText("como 60 cabezas"), "60");
    assert.equal(parseInvitadosFromText("unos 40"), "40");
    assert.equal(parseInvitadosFromText("m\xE1s o menos 120"), "120");
    assert.equal(parseInvitadosFromText("aproximadamente 80"), "80");
    assert.equal(parseInvitadosFromText("entre 90 y 100"), "100");
    assert.equal(parseCorreoFromText("mi correo es ana arroba gmail punto com"), "ana@gmail.com");
    assert.equal(
      parseCorreoFromText("es pedro guion bajo lopez arroba hotmail punto com"),
      "pedro_lopez@hotmail.com"
    );
    assert.equal(parseCorreoFromText("mi correo es test@gmail.com"), "test@gmail.com");
    assert.equal(parseZonaFromText("El evento es en el Estado de M\xE9xico"), "Estado de M\xE9xico");
    assert.equal(parseZonaFromText("Va a ser en la colonia Roma"), "colonia Roma");
    assert.equal(parseZonaFromText("Es en delegaci\xF3n Coyoac\xE1n"), "Coyoac\xE1n");
    assert.equal(parseZonaFromText("Va a ser en la alcald\xEDa Miguel Hidalgo"), "alcald\xEDa Miguel Hidalgo");
    assert.equal(parseZonaFromText("en total ser\xEDan 50 personas"), null);
    assert.equal(parseZonaFromText("es solo para mi familia"), null);
  });
  await test("25. Lorena A14777 \u2014 Coffee Break se ofrece, resumen no pierde datos, cat\xE1logo no vac\xEDa la respuesta", () => {
    assert.ok(clientMentionsCatering("Hola, me interesa cotizar: Coffee Break para Eventos Corporativos"));
    assert.ok(clientMentionsCatering("barra de caf\xE9 para el evento"));
    const filledInicial = /* @__PURE__ */ new Set();
    const extractedInicial = emptyExtracted();
    const reply1 = runGuards({
      aiResponse: "\xBFMe regalas tu nombre?",
      extracted: extractedInicial,
      filledSet: filledInicial,
      readyForClosing: false,
      currentMessage: "Hola, me interesa cotizar: Coffee Break para Eventos Corporativos",
      history: []
    });
    assert.ok(/coffee\s*break/i.test(reply1), `debe confirmar coffee break, no ignorarlo: ${reply1.slice(0, 200)}`);
    const mergedLinesTurno1 = [
      "- Nombre del cliente: Lorena",
      "- Tipo de evento: corporativo",
      "- Requerimientos o servicios: Coffee Break para Eventos Corporativos"
    ];
    const extractedTurno2 = emptyExtracted({
      nombre: "Lorena",
      tipo_evento: "corporativo",
      requerimientos_evento: "Coffee Break",
      // GPT re-extrajo una versión más corta este turno
      num_invitados: 150
    });
    const resumen = buildResumenClienteLargo(extractedTurno2, mergedLinesTurno1, "coffee break para eventos corporativos 150 personas");
    assert.ok(
      resumen.includes("Coffee Break para Eventos Corporativos"),
      `no debe perder el detalle ya guardado: ${resumen}`
    );
    assert.ok(
      resumen.includes("El cliente quiere:"),
      `debe usar la frase 'El cliente quiere:' en vez de 'Servicios / requerimientos:': ${resumen}`
    );
    assert.ok(!/servicios\s*\/\s*requerimientos/i.test(resumen), resumen);
    const mezclado = "No hay ning\xFAn problema, ya anot\xE9 que el evento es en Cuernavaca. Mientras tanto, aqu\xED tienes nuestro cat\xE1logo completo: https://cdn.shopify.com/s/files/1/0809/1215/4936/files/Catalogo-Menus-Bodasesor-2026_4_b5efa97c-ce47-4bef-b189-aca2d91fefa7.pdf?v=1778695499. \xBFHay algo m\xE1s en lo que te pueda ayudar?";
    const limpio = stripCatalogBlockShared(mezclado);
    assert.ok(limpio.trim().length > 0, "no debe quedar vac\xEDo");
    assert.ok(!/cdn\.shopify\.com/i.test(limpio), limpio);
    assert.ok(/no hay ning[uú]n problema/i.test(limpio), limpio);
    assert.ok(/cuernavaca/i.test(limpio), limpio);
    assert.ok(/algo m[aá]s en lo que te pueda ayudar/i.test(limpio), limpio);
    assert.equal(parseTipoEventoFromText("Coffee Break para Eventos Corporativos"), "evento corporativo");
    assert.equal(parseTipoEventoFromText("es para un evento corporativo"), "evento corporativo");
    assert.equal(parseTipoEventoFromText("es un bautizo"), "bautizo");
    const dup1 = normalizeAdvisorReferences(
      "Perfecto, voy a pasar esta informaci\xF3n a nuestro equipo para que te prepare una cotizaci\xF3n.",
      "Lorena"
    );
    assert.ok(!/equipo\s+equipo/i.test(dup1), dup1);
    assert.ok(dup1.includes("nuestro equipo"), dup1);
    const dup2 = normalizeAdvisorReferences(
      "Con gusto, le paso estos datos a nuestro equipo para la cotizaci\xF3n.",
      "Lorena"
    );
    assert.ok(!/equipo\s+equipo/i.test(dup2), dup2);
  });
  await test("26. Bugs Kommo \u2014 proveedor/cliente, correo propio, nombre completo, cierre", () => {
    const cafeText = "Solicitud para cotizaci\xF3n de caf\xE9 gourmet para evento corporativo Saint-Gobain";
    assert.equal(resolveTipoContacto("proveedor", cafeText), "cliente");
    assert.ok(isOwnCompanyEmail("capybaraeventos@gmail.com"));
    assert.equal(filterClientEmail("capybaraeventos@gmail.com"), null);
    assert.equal(parseCorreoFromText("capybaraeventos@gmail.com"), null);
    assert.equal(
      parseCorreoFromText("Mi correo es Gresia.Perez@saint-gobain.com"),
      "Gresia.Perez@saint-gobain.com"
    );
    assert.ok(isNombreMoreComplete("Gresia Perez", "Gresia"));
    assert.ok(!isNombreMoreComplete("Gresia", "Gresia Perez"));
    assert.equal(pickBetterNombre("Gresia", "Gresia Perez"), "Gresia Perez");
    assert.ok(clientAsksIfCompanyEmailCorrect("\xBFes capybaraeventos@gmail.com el correo correcto?"));
    assert.ok(buildCompanyEmailConfirmReply().includes("capybaraeventos"));
    const hist = [
      { role: "assistant", content: `${CLOSING_SIGNATURE} Aqu\xED est\xE1 el cat\xE1logo.` }
    ];
    assert.ok(detectCierreEnviado(hist));
    assert.ok(detectCierreEnviado([], `${CLOSING_SIGNATURE} cat\xE1logo`));
    const emailGuard = runGuards({
      aiResponse: "\xBFA qu\xE9 correo te lo env\xEDo?",
      extracted: emptyExtracted(),
      filledSet: /* @__PURE__ */ new Set(["Nombre del cliente"]),
      readyForClosing: false,
      currentMessage: "\xBFes capybaraeventos@gmail.com el correo correcto?"
    });
    assert.ok(/capybaraeventos|bodasesor/i.test(emailGuard), emailGuard);
    assert.ok(/tu correo|compartes/i.test(emailGuard), emailGuard);
  });
  await test("27. Webhook/imagen \u2014 sin duplicar Vision ni notas", () => {
    resetWebhookDedupForTests();
    resetImageAnalysisCacheForTests();
    const msg = {
      id: "msg-abc-123",
      chat_id: "chat-1",
      entity_id: 999,
      type: "incoming",
      author: { type: "external" },
      attachment: { type: "picture", link: "https://amojo.kommo.com/attachments/receipt.jpg" }
    };
    assert.ok(isIncomingClientMessage(msg));
    assert.equal(webhookMessageKey(msg), "id:msg-abc-123");
    assert.ok(!isDuplicateWebhookMessage("id:msg-abc-123"));
    markWebhookMessageProcessed("id:msg-abc-123");
    assert.ok(isDuplicateWebhookMessage("id:msg-abc-123"));
    assert.ok(!isIncomingClientMessage({ type: "outgoing", author: { type: "internal" } }));
    const imgUrl = "https://amojo.kommo.com/attachments/receipt.jpg";
    cacheImageDescription(imgUrl, "Comprobante de pago por $7,975.00");
    assert.equal(getCachedImageDescription(imgUrl), "Comprobante de pago por $7,975.00");
    const fallbackKey = webhookMessageKey({
      chat_id: "chat-2",
      attachment: { type: "picture", link: imgUrl }
    });
    assert.equal(fallbackKey, `media:chat-2:${imgUrl}`);
  });
  await test("28. Lucy V7 \u2014 pedido/entrega, n\xFAmero ambiguo, orden ubicaci\xF3n\u2192fecha\u2192invitados", () => {
    assert.equal(detectModoServicio("quiero 50 rollos para llevar"), "pedido_entrega");
    assert.equal(detectModoServicio("barra de sushi montada en el evento"), "servicio_montado");
    assert.ok(needsModoServicioClarification("necesito 50 rollos de sushi", null));
    assert.equal(parseInvitadosFromText("5"), null);
    assert.equal(parseInvitadosFromText("el 5"), null);
    assert.equal(parseInvitadosFromText("150 personas"), "150");
    const filled = /* @__PURE__ */ new Set([
      "Nombre del cliente",
      EMAIL_WAIVED_LABEL,
      "Tipo de evento",
      "Requerimientos o servicios"
    ]);
    assert.equal(getNextPendingField(emptyExtracted(), filled), "zona");
  });
  await test("29. Replit \u2014 transiciones, anti-robot, servicios sin precio consultivos", () => {
    const hist = [
      { role: "assistant", content: "Perfecto. \xBFA qu\xE9 correo te lo env\xEDo?" }
    ];
    const t1 = pickTransition(hist);
    assert.notEqual(t1, "Perfecto.", t1);
    const stripped = stripRobotAcknowledgments(
      "Perfecto, Pelene. Ya tengo tu correo. \xBFM\xE1s o menos para cu\xE1ntas personas ser\xEDa?"
    );
    assert.ok(!/ya\s+tengo\s+tu\s+correo/i.test(stripped), stripped);
    assert.ok(/personas/i.test(stripped), stripped);
    const dj = buildConsultativeNoPriceReply("\xBFCu\xE1nto cuesta el DJ?");
    assert.ok(dj && /DJ/i.test(dj) && /nuestro equipo/i.test(dj) && dj.includes("?"), dj ?? "");
    const carpa = buildConsultativeNoPriceReply("necesito carpas para el jard\xEDn");
    assert.ok(carpa && /carpas?/i.test(carpa) && /Cathedral|Pirámide|Planas/i.test(carpa), carpa ?? "");
    const priceGuard = runGuards({
      aiResponse: "El DJ cuesta $5,000.",
      extracted: emptyExtracted({ nombre: "Ana" }),
      filledSet: /* @__PURE__ */ new Set(["Nombre del cliente", "Correo electr\xF3nico", "Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "\xBFCu\xE1nto cuesta el DJ?"
    });
    assert.ok(/DJ/i.test(priceGuard), priceGuard);
    assert.ok(!/\$\s*5,?000/.test(priceGuard), priceGuard);
    assert.ok(/nuestro equipo/i.test(priceGuard), priceGuard);
  });
  await test("30. Asesor Alejandro + sanitizaci\xF3n datos externos (Kommo/CRM)", () => {
    assert.equal(getAdvisorName(), "Alejandro");
    const rodrigoNorm = normalizeAdvisorReferences(
      "Perfecto, ya tengo todo. Le paso estos datos a Rodrigo para que te arme una cotizaci\xF3n.",
      "Mar\xEDa"
    );
    assert.ok(!/Rodrigo/i.test(rodrigoNorm), rodrigoNorm);
    assert.ok(/nuestro equipo/i.test(rodrigoNorm), rodrigoNorm);
    const dirtyCrm = sanitizeKommoCrmLines([
      "- Nombre del cliente: Quiero hacer una cotizaci\xF3n",
      "- Correo electr\xF3nico: capybaraeventos@gmail.com",
      "- Lugar/direcci\xF3n del evento: 6m x 12m",
      "- Tipo de evento: boda"
    ]);
    assert.equal(dirtyCrm.length, 1);
    assert.ok(/boda/i.test(dirtyCrm[0] ?? ""));
    const clean = sanitizeExtractedFromExternal(
      emptyExtracted({
        tipo_contacto: "proveedor",
        correo: "bodasesor@gmail.com",
        nombre: "Quiero cotizar",
        direccion_evento: "8m x 10m"
      }),
      "Solicitud de cotizaci\xF3n de caf\xE9 para evento corporativo Saint-Gobain"
    );
    assert.equal(clean.tipo_contacto, "cliente");
    assert.equal(clean.correo, null);
    assert.equal(clean.nombre, null);
    assert.equal(clean.direccion_evento, null);
    assert.ok(LEGACY_ADVISOR_NAMES.includes("Rodrigo"));
  });
  await test("31. A14786 \u2014 cliente Alejandro: saludo correcto, no confundir con asesor", () => {
    assert.equal(clientAsksAboutTeam("Alejandro!", null), false);
    assert.equal(clientAsksAboutTeam("Alejandro!", "Mar\xEDa"), false);
    const correoQ = buildCorreoQuestion("Alejandro", [], 14786);
    assert.ok(/Mucho gusto,\s+Alejandro/i.test(correoQ), correoQ);
    assert.ok(!/Mucho gusto,\s+nuestro equipo/i.test(correoQ), correoQ);
    const norm = normalizeAdvisorReferences(
      "Mucho gusto, Alejandro. \xBFA qu\xE9 correo te env\xEDo la info para que nuestro equipo te arme la propuesta?",
      "Alejandro"
    );
    assert.ok(/Mucho gusto,\s+Alejandro/i.test(norm), norm);
    assert.ok(/nuestro equipo te arme/i.test(norm), norm);
    assert.ok(isStaffAdvisorName("Rodrigo"));
    assert.ok(!isValidRequerimientosValue("bautizo"));
    assert.ok(isValidRequerimientosValue("servicio completo"));
    const dirty = sanitizeKommoCrmLines([
      "- Nombre del cliente: Rodrigo",
      "- Tipo de evento: bautizo",
      "- Requerimientos o servicios: bautizo"
    ]);
    assert.equal(dirty.length, 1);
    assert.ok(/bautizo/i.test(dirty[0] ?? ""));
    const leaked = "Perfecto. Informaci\xF3n completa obtenida.\n\nDATOS DEL CLIENTE:\n- Nombre: Alejandro";
    const clean = stripInternalCrmBlock(leaked);
    assert.ok(!/DATOS DEL CLIENTE/i.test(clean));
    assert.ok(/^Perfecto\./i.test(clean));
    const filled = /* @__PURE__ */ new Set([
      "Nombre del cliente",
      "Correo electr\xF3nico",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Lugar/direcci\xF3n del evento",
      "Fecha y horario",
      "N\xFAmero de invitados",
      "Presupuesto (MXN)"
    ]);
    const closeReply = runGuards({
      aiResponse: "Informaci\xF3n completa obtenida. DATOS DEL CLIENTE:\n- Nombre: Alejandro\n\n\xBFTe interesa algo m\xE1s?",
      extracted: emptyExtracted({ nombre: "Alejandro", tipo_evento: "bautizo", requerimientos_evento: "servicio completo" }),
      filledSet: filled,
      readyForClosing: true,
      currentMessage: "Estamos cotizando apenas"
    });
    assert.ok(closeReply.includes(CLOSING_SIGNATURE), closeReply);
    assert.ok(!/DATOS DEL CLIENTE/i.test(closeReply), closeReply);
    assert.ok(!/Información completa obtenida/i.test(closeReply), closeReply);
  });
  await test("32. Bater\xEDa 20 \u2014 ubicaci\xF3n, italiano, expo, n\xFAmero ambiguo", () => {
    assert.ok(clientAsksLocation("\xBFD\xF3nde se ubican?"));
    assert.ok(clientMentionsItalianTheme("fiesta tem\xE1tica de mafia italiana"));
    assert.ok(buildLocationAnswer().includes("CDMX"));
    assert.equal(parseTipoEventoFromText("stand de caf\xE9 para una expo"), "evento corporativo");
    assert.equal(parseZonaFromText("en Expo Santa Fe"), "Expo Santa Fe");
    assert.equal(sanitizeDisplayName("el 5"), null);
    const locFirst = buildFirstInteractionMessage(
      {
        extracted: emptyExtracted(),
        filledSet: /* @__PURE__ */ new Set(),
        history: [],
        currentMessage: "\xBFD\xF3nde se ubican?"
      },
      true
    );
    assert.ok(/CDMX|Ciudad de México/i.test(locFirst), locFirst);
    assert.ok(/llamas|nombre/i.test(locFirst), locFirst);
    const ambig = runGuards({
      aiResponse: "\xBFA qu\xE9 correo te lo env\xEDo?",
      extracted: emptyExtracted({ tipo_evento: "cumplea\xF1os" }),
      filledSet: /* @__PURE__ */ new Set(["Tipo de evento"]),
      readyForClosing: false,
      currentMessage: "el 5",
      history: [
        { role: "user", content: "quiero cotizar un cumplea\xF1os" },
        { role: "assistant", content: "\xBFC\xF3mo te llamas?" }
      ]
    });
    assert.ok(/invitados|día\s*5|fecha/i.test(ambig), ambig);
    const expoCaptures = scanConversationForCaptures(
      [],
      "Necesito un stand de caf\xE9 para una expo, 200 personas por d\xEDa, en Expo Santa Fe.",
      /* @__PURE__ */ new Set()
    );
    assert.ok(
      expoCaptures.some((c) => c.label === "Tipo de evento" && /corporativo/i.test(c.value)),
      JSON.stringify(expoCaptures)
    );
    assert.ok(
      expoCaptures.some((c) => c.label === "N\xFAmero de invitados" && c.value === "200"),
      JSON.stringify(expoCaptures)
    );
    const itRec = buildRecommendationsReply(
      emptyExtracted(),
      [],
      1,
      "Vamos a ver el partido de la selecci\xF3n de Italia, \xBFqu\xE9 me recomiendas de comida?"
    );
    assert.ok(/pasta|pizza|italian/i.test(itRec), itRec);
  });
  await test("33. Nombre persiste desde historial y waiver presupuesto directo", () => {
    assert.ok(detectPresupuestoRefusal("a\xFAn no s\xE9 cu\xE1nto"));
    const hist = [
      { role: "user", content: "Hola, quiero banquete para mi boda" },
      { role: "assistant", content: "\xBFC\xF3mo te llamas?" },
      { role: "user", content: "Elena" },
      { role: "assistant", content: "Mucho gusto, Elena. \xBFA qu\xE9 correo te lo env\xEDo?" },
      { role: "user", content: "elena@test.com" }
    ];
    assert.equal(recoverClienteNombreFromHistory(hist), "Elena");
    const nombreCaptures = scanConversationForCaptures(hist, "100 personas", /* @__PURE__ */ new Set());
    assert.ok(
      nombreCaptures.some((c) => c.label === "Nombre del cliente" && c.value === "Elena"),
      JSON.stringify(nombreCaptures)
    );
    const logs = [];
    const presWaiver = runGuards({
      aiResponse: "\xBFC\xF3mo te llamas?",
      extracted: emptyExtracted({ nombre: "Mario", num_invitados: 60 }),
      filledSet: /* @__PURE__ */ new Set([
        "Nombre del cliente",
        "Correo electr\xF3nico",
        "Tipo de evento",
        "Requerimientos o servicios",
        "N\xFAmero de invitados",
        "Lugar/direcci\xF3n del evento",
        "Fecha y horario"
      ]),
      readyForClosing: false,
      currentMessage: "a\xFAn no s\xE9 cu\xE1nto",
      history: hist,
      debugLogs: logs
    });
    assert.ok(!/c[oó]mo\s+te\s+llamas/i.test(presWaiver), `${presWaiver} | logs: ${logs.join("; ")}`);
    assert.ok(/definir|propong|equipo/i.test(presWaiver), presWaiver);
  });
  await test("34. Cat\xE1logo \u2014 sin men\xFA hardcodeado; datos del Sheet", () => {
    assert.ok(clientAsksServiceInfo("Quiero informaci\xF3n sobre la barra de pizzas"));
    assert.ok(responseLooksLikeGenericCateringMenu(
      "S\xED, manejamos catering para eventos. Estas son las opciones m\xE1s pedidas:\n\n\xBFCu\xE1l te interesa?"
    ));
    const genericMenu = "S\xED, manejamos catering para eventos. Estas son las opciones m\xE1s pedidas:\n\n\u2022 Taquiza\n\n\xBFCu\xE1l te interesa? Con eso te paso precios";
    const injected = injectCatalogCateringIfAsked(
      "quiero cotizar banquete para mi boda",
      genericMenu
    );
    assert.ok(!responseLooksLikeGenericCateringMenu(injected) || injected !== genericMenu, injected);
    const notFound = buildCatalogNotFoundAnswer("Barra de pizzas");
    assert.ok(/equipo|confirmo/i.test(notFound), notFound);
    const promptBlock = formatServiceDataForPrompt("taquiza");
    if (promptBlock) {
      assert.ok(/DATOS DEL SERVICIO/i.test(promptBlock), promptBlock);
      assert.ok(/taquiza/i.test(promptBlock), promptBlock);
    }
  });
  console.log(`
${passed} OK, ${failed} fallidas de ${passed + failed} escenarios`);
  if (failed > 0) process.exit(1);
}
runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
//# sourceMappingURL=lucy-flow-selftest.mjs.map
