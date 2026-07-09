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
  if (/^\d+$/.test(firstName)) return null;
  if (GREETING_NAME_PATTERN.test(firstName)) return null;
  if (isQuoteIntentMessage(trimmed)) return null;
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}
function resolveClientDisplayName(extractedNombre, crmNombre, whatsappName) {
  return sanitizeDisplayName(extractedNombre) ?? sanitizeDisplayName(crmNombre) ?? sanitizeDisplayName(whatsappName);
}

// src/lib/bodasesorAdvisor.ts
function getAdvisorName() {
  return process.env["BODASESOR_ADVISOR_NAME"]?.trim() || process.env["KOMMO_ADVISOR_NAME"]?.trim() || "Alejandro";
}
function advisorLabelForClient(clientName) {
  const advisor = getAdvisorName();
  const client = clientName?.trim().toLowerCase() ?? "";
  if (client && client === advisor.toLowerCase()) {
    return "nuestro equipo";
  }
  return advisor;
}
function normalizeAdvisorReferences(text, clientName) {
  const advisor = advisorLabelForClient(clientName);
  if (!text?.trim()) return text;
  let out = text.replace(/\bRodrigo\b/gi, advisor);
  out = out.replace(
    /\b(le\s+paso\s+estos\s+datos\s+a|paso\s+estos\s+datos\s+a)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
    `$1 ${advisor}`
  );
  out = out.replace(
    /\b(voy\s+a\s+)?pasar(le)?\s+esta\s+informaci[oó]n\s+a\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
    advisor === "nuestro equipo" ? "voy a pasar esta informaci\xF3n a nuestro equipo" : `voy a pasar esta informaci\xF3n a ${advisor}`
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
  [/\b(boda|bodas|matrimonio|casamiento|nupcial)\b/i, "boda"],
  [/\b(baby\s*shower)\b/i, "baby shower"],
  [/\b(xv\s*a[nñ]os?|quincea[nñ]era|quince|xv)\b/i, "XV a\xF1os"],
  [/\b(fin\s+de\s+a[nñ]o|fiesta\s+de\s+empresa|evento\s+de\s+empresa|de\s+empresa)\b/i, "evento corporativo"],
  [/\b(evento\s+corporativo|convenci[oó]n|conferencia|corporativo)\b/i, "evento corporativo"],
  [/\b(cumplea[nñ]os?|cumple)\b/i, "cumplea\xF1os"],
  [/\b(bautizo)\b/i, "bautizo"],
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
  return new RegExp(`^${advisorEsc}$`, "i").test(normalized) && !(name && name === advisor) || new RegExp(`\\bqui[e\xE9]n\\s+es\\s+${advisorEsc}\\b`, "i").test(t) || new RegExp(`\\best[a\xE1]\\s+${advisorEsc}\\b`, "i").test(t) || new RegExp(`\\bhablo\\s+con\\s+${advisorEsc}\\b`, "i").test(t) || new RegExp(`\\bpuedo\\s+hablar\\s+con\\s+${advisorEsc}\\b`, "i").test(t) || new RegExp(`\\bd[o\xF3]nde\\s+est[a\xE1]\\s+${advisorEsc}\\b`, "i").test(t) || /\bel\s+asesor\b/i.test(t);
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
function clientMentionsEntertainment(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /\bshow\b/i.test(t) || /\bgrupo\s+vers[aá]til\b/i.test(t) || /\b(banda|m[uú]sica\s+en\s+vivo|artista|cantante|dj\s+en\s+vivo)\b/i.test(t) || /\b(animaci[oó]n|hora\s+loca|happening|entretenimiento)\b/i.test(t) || /\b(requerimos|necesitamos|buscamos)\s+un\s+show\b/i.test(t);
}
function clientMentionsCatering(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /\bcatering\b/i.test(t) || /\b(brunch|desayuno)\b/i.test(t) || /\bbrunch\s*\/\s*desayuno/i.test(t) || /\b(busco|necesito|quiero|cotizar)\s+(comida|alimentos?|men[uú])\b/i.test(t) || /\bcomida\s+para\b/i.test(t) || /\b(solo|nada\s+m[aá]s)\s+(comida|alimentos?)\b/i.test(t) || /\b(comida|alimentos?|men[uú])\s+(para|del)\b/i.test(t);
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
var KNOWN_ZONES = /\b(cdmx|ciudad\s+de\s+m[eé]xico|df|polanco|reforma|santa\s+fe|interlomas|monterrey|guadalajara|puebla|quer[eé]taro|canc[uú]n|tijuana|le[oó]n|m[eé]rida|toluca|cuernavaca|acapulco|veracruz|tulum|playa\s+del\s+carmen|nezahualc[oó]yotl|corregidor|centro\s+hist[oó]rico)\b/i;
var NON_LOCATION_EN_PREFIX = /^(la|el|los|las|total|este|esta|ese|esa|medio|mente|general|particular|comida|pista|baile|mente|mente\s+para|solo|m[ií]o|tu|su)\b/i;
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
  const numMatch = trimmed.match(/\b(\d+)\s*(personas?|invitados?|pax|guests?)\b/i);
  if (numMatch) return numMatch[1];
  const paraMatch = trimmed.match(/\b(?:para|somos|ser[ií]an?|como)\s+(\d+)\b/i);
  if (paraMatch) return paraMatch[1];
  const writtenMatch = trimmed.match(
    /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos)\s+(personas?|invitados?)\b/i
  );
  if (writtenMatch) {
    return WRITTEN_NUMBERS[writtenMatch[1].toLowerCase()] ?? null;
  }
  if (/^\d{1,4}$/.test(trimmed)) return trimmed;
  return null;
}
function isDimensionText(text) {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /\b\d+\s*metros?\s*(por|x)\s*\d+\s*metros?\b/i.test(t) || /\bespacio\s+(es\s+de|de|mide)\s+\d+/i.test(t) || /^\d+\s*x\s*\d+\s*(m|metros?)?$/i.test(t);
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
  if (KNOWN_ZONES.test(trimmed)) {
    const m = trimmed.match(KNOWN_ZONES);
    if (m) return m[0].trim();
  }
  const enMatch = trimmed.match(
    /\ben\s+([A-Za-zÁÉÍÓÚáéíóúñ][A-Za-zÁÉÍÓÚáéíóúñ\s.-]{2,28})(?:\s|,|\.|$)/i
  );
  if (enMatch) {
    const lugar = enMatch[1].trim();
    if (!MONTH_PATTERN.test(lugar) && !/^\d/.test(lugar) && !isGreetingOnlyMessage(lugar) && !NON_LOCATION_EN_PREFIX.test(lugar) && !/\b(solo|para\s+la|total|comida|pista)\b/i.test(lugar)) {
      return lugar;
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
function parseCorreoFromText(text) {
  const m = text?.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return m ? m[1] : null;
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
function detectPresupuestoRefusal(text) {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (/^(no|nop)[\s.,!]*$/i.test(t)) return true;
  return /\bno\s+(tengo|tenemos|cuento|sabemos)\s+(un\s+)?presupuesto\b/i.test(t) || /\bno\s+me\s+brindaron\b/i.test(t) || /\bno\s+nos\s+(dieron|brindaron)\b/i.test(t) || /\bsin\s+presupuesto\b/i.test(t) || /\b(sin\s+rango|no\s+tengo\s+rango)\b/i.test(t) || /\b(m[aá]ndame|m[aá]nden)\s+(el\s+)?presupuesto\b/i.test(t) || /\bt[uú]\s+m[aá]ndame\b/i.test(t) || /\bsi\s+quieres\s+vemos\b/i.test(t) || /\bno\b/i.test(t) && /\bpresupuesto\b/i.test(t);
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
  if (opts?.askedField === "presupuesto" && /^(no|nop)[\s.,!]*$/i.test(trimmed)) {
    return "Sin definir (cliente indic\xF3 que no tiene)";
  }
  if (/\b(no\s+tengo|no\s+s[eé]|sin\s+presupuesto|a[uú]n\s+no|no\s+cuento|no\s+sabemos|depende|no\s+lo\s+s[eé]|no,?\s+a[uú]n\s+no|que\s+alejandro\s+de\s+opciones|que\s+nos\s+propong|ver\s+opciones)\b/i.test(
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
  const menosDeMatch = trimmed.match(
    /\b(?:menos\s+de|hasta|m[aá]ximo|max\.?)\s+\$?\s*([\d][\d,.]*)\s*(mxn|mnx|pesos)?\b/i
  );
  if (menosDeMatch) {
    return `Hasta $${menosDeMatch[1].replace(/,/g, "")} MXN`;
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
  if (/\$/.test(trimmed) || /\b(presupuesto|rango|inversi[oó]n|budget|monto|pesos|mxn|mnx)\b/i.test(trimmed) || /\b(como|aprox|alrededor|cerca\s+de|menos\s+de|hasta)\b/i.test(trimmed)) {
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
  if (!filledSet.has("Nombre del cliente") && (asked === "nombre" || !history.some((m) => m.role === "assistant") && !isGreetingOnlyMessage(msg)) && !isAffirmativeOnlyMessage(msg) && !isQuoteIntentMessage(msg) && /[a-záéíóúüñ]/i.test(msg) && !/@/.test(msg) && !/\d{4,}/.test(msg)) {
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

// src/services/summaryService.ts
function pickFromMergedLines(mergedLines, labelPattern) {
  const line = mergedLines.find((l) => labelPattern.test(l));
  if (!line) return null;
  const val = line.replace(/^- /, "").split(":").slice(1).join(":").trim();
  return val || null;
}
function buildResumenClienteLargo(extracted, mergedLines, conversationText) {
  const nombre = extracted.nombre?.trim() || pickFromMergedLines(mergedLines, /Nombre del cliente/i);
  const correo = extracted.correo?.trim() || pickFromMergedLines(mergedLines, /Correo electrónico/i);
  const emailWaived = mergedLines.some((l) => /continuar por whatsapp/i.test(l));
  const evento = extracted.tipo_evento?.trim() || pickFromMergedLines(mergedLines, /Tipo de evento/i);
  const fecha = extracted.fecha_horario?.trim() || pickFromMergedLines(mergedLines, /Fecha y horario/i);
  const invitados = (extracted.num_invitados !== null && extracted.num_invitados > 0 ? String(extracted.num_invitados) : null) || pickFromMergedLines(mergedLines, /Número de invitados/i);
  const ubicacion = extracted.direccion_evento?.trim() || pickFromMergedLines(mergedLines, /Lugar\/dirección/i);
  const pptoFromLine = pickFromMergedLines(mergedLines, /Presupuesto/i);
  const ppto = extracted.presupuesto !== null && extracted.presupuesto > 0 ? `$${extracted.presupuesto.toLocaleString("es-MX")} MXN` : pptoFromLine;
  const reqFromServices = extracted.requerimientos_evento?.trim();
  const reqFromLines = pickFromMergedLines(mergedLines, /Requerimientos/i);
  const reqFromConversation = conversationText && conversationText.trim().length > 20 ? parseServicesFromText(conversationText).slice(0, 3).join(", ") : null;
  const reqs = (reqFromServices && reqFromServices !== extracted.tipo_evento ? reqFromServices : null) || (reqFromConversation && reqFromConversation.length > 0 ? reqFromConversation : null) || reqFromLines;
  const lineas = ["RESUMEN LUCY \u2014 lo que el cliente quiere:", ""];
  if (nombre) lineas.push(`\u2022 Nombre: ${nombre}`);
  if (correo) lineas.push(`\u2022 Correo: ${correo}`);
  else if (emailWaived) lineas.push("\u2022 Correo: no proporcion\xF3 (contin\xFAa por WhatsApp)");
  if (evento) lineas.push(`\u2022 Tipo de evento: ${evento}`);
  if (reqs) lineas.push(`\u2022 Servicios / requerimientos: ${reqs}`);
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
function buildAlejandroPriceReply(serviceHint) {
  const svc = serviceHint?.trim() || "ese servicio";
  return `S\xED, manejamos ${svc}. El precio exacto depende del evento \u2014 Alejandro te lo incluye en tu cotizaci\xF3n personalizada.`;
}
function sanitizeInventedPrices(mensaje, currentMessage, recentContext) {
  if (!responseHasInventedPrice(mensaje, currentMessage, recentContext)) {
    return mensaje;
  }
  const ctx = `${currentMessage ?? ""} ${mensaje} ${recentContext ?? ""}`;
  const service = detectServiceLabel(ctx);
  const cleaned = stripPriceSentences(mensaje);
  const safe = buildAlejandroPriceReply(service);
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
var REFRESH_MS = Number(process.env["CATALOG_REFRESH_MINUTES"] ?? "30") * 6e4;
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
function buildCatalogCateringAnswer() {
  if (!snapshot?.rows.length) return null;
  const taquizaLine = summarizeServicePrices("taquiza", 1);
  const banqueteLine = summarizeServicePrices("banquete 3 tiempos", 1);
  const brunchLine = summarizeServicePrices("brunch", 1);
  const coffeeLine = summarizeServicePrices("coffee", 1);
  const options = [
    taquizaLine ? `\u2022 *Taquiza* \u2014 desde ${taquizaLine.match(/\$[\d,.]+/)?.[0] ?? "consultar"}/pp` : "",
    banqueteLine ? `\u2022 *Banquete* \u2014 desde ${banqueteLine.match(/\$[\d,.]+/)?.[0] ?? "consultar"}/pp` : "",
    brunchLine ? `\u2022 *Brunch*` : "",
    coffeeLine ? `\u2022 *Coffee break*` : "",
    "\u2022 *Barras tem\xE1ticas* (pizzas, sushi, mariscos, etc.)"
  ].filter(Boolean);
  return [
    "S\xED, manejamos catering para eventos. Estas son las opciones m\xE1s pedidas:",
    "",
    ...options,
    "",
    "\xBFCu\xE1l te interesa? Con eso te paso precios e inclusiones por nivel."
  ].join("\n");
}

// src/lucy-flow-guards.ts
var EMAIL_WAIVED_LABEL = "Correo (prefiere no compartir)";
var EMAIL_REFUSAL_PATTERN = /\b(no\s+tengo(\s+un?)?\s+correo|no\s+quiero(\s+dar|\s+compartir)?(\s+mi)?\s+correo|sin\s+correo|no\s+uso\s+correo|no\s+dispongo\s+de\s+correo|por\s+este\s+medio|prefiero\s+(por\s+)?whatsapp|aqu[ií]\s+(est[aá]|por)|no\s+me\s+gusta\s+dar|no\s+es\s+necesario|no\s+hace\s+falta|no\s+quiero\s+darlo)\b/i;
var CLOSING_CORE_FIELDS = [
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "N\xFAmero de invitados",
  "Lugar/direcci\xF3n del evento",
  "Fecha y horario",
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
var QUESTION_VARIANTS = {
  nombre: [
    "\xBFMe regalas tu nombre para iniciar?",
    "\xBFCon qui\xE9n tengo el gusto?",
    "\xBFC\xF3mo te llamas?"
  ],
  correo: [
    "Para mandarte la info y que nuestro equipo te arme la propuesta, \xBFa qu\xE9 correo te lo env\xEDo?",
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
    "\xBFD\xF3nde lo est\xE1n planeando?",
    "\xBFEn qu\xE9 ciudad o zona ser\xEDa el evento?",
    "\xBFTienen ya el lugar o al menos la ciudad?"
  ],
  fecha: [
    "\xBFYa tienen fecha o todav\xEDa la van definiendo?",
    "\xBFPara cu\xE1ndo lo tienen pensado?",
    "\xBFYa hay d\xEDa definido o siguen viendo opciones?"
  ],
  presupuesto: [
    "\xBFTienen alg\xFAn rango de presupuesto en mente?",
    "\xBFManejan alg\xFAn presupuesto estimado para el evento?",
    "\xBFTienen idea del presupuesto o prefieren que Alejandro les proponga opciones?"
  ]
};
var FIELD_ASK_PATTERNS = {
  nombre: /regalas?\s+tu\s+nombre|c[oó]mo\s+te\s+llamas|con\s+qui[eé]n\s+tengo|tu\s+nombre|me\s+das\s+tu\s+nombre/i,
  correo: /correo|e-?mail|env[ií]o|mandarte|mandar(te)?\s+la\s+info|compartes?\s+un\s+correo/i,
  tipo_evento: /festejan|tipo\s+de\s+(evento|celebraci[oó]n)|qu[eé]\s+evento|qu[eé]\s+celebr|de\s+qu[eé]\s+se\s+trata|qu[eé]\s+tipo\s+de\s+celebr/i,
  requerimientos: /pensado|servicios?|banquete|taquiza|cotizar|adem[aá]s\s+del|qu[eé]\s+necesitas|qu[eé]\s+buscas|men[uú]|plat[ií]came/i,
  invitados: /invitados|personas|gente|cu[aá]ntos|cu[aá]ntas|aproximadamente|m[aá]s\s+o\s+menos|para\s+cu[aá]ntas|ser[ií]an/i,
  zona: /ciudad|d[oó]nde\s+(lo|ser[ií]|ser[aá]|queda|est[aá]n)|en\s+qu[eé]\s+(ciudad|zona|lugar)|lugar|direcci[oó]n|ubicaci[oó]n|zona|sal[oó]n/i,
  fecha: /fecha|cu[aá]ndo|d[ií]a|agenda|definiendo|definido|definir|siguen\s+viendo|opciones\s+de\s+fecha|para\s+cu[aá]ndo/i,
  presupuesto: /presupuesto|estimado|rango|inversi[oó]n|budget|monto/i
};
function isValidRequerimientosValue(value) {
  return isServiceRelatedMessage(value);
}
var CLOSING_SIGNATURE = "Perfecto, ya tengo todo.";
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
function applyPresupuestoWaiver(filledSet, mergedLines, texts) {
  if (filledSet.has("Presupuesto (MXN)")) return;
  const pres = texts.map((t) => parsePresupuestoFromText(t)).find(Boolean);
  if (!pres) return;
  mergedLines.push(`- Presupuesto (MXN): ${pres}`);
  filledSet.add("Presupuesto (MXN)");
}
function isEmailSatisfied(filledSet) {
  return filledSet.has("Correo electr\xF3nico") || filledSet.has(EMAIL_WAIVED_LABEL);
}
function isReadyForClosing(filledSet) {
  return CLOSING_CORE_FIELDS.every((label) => filledSet.has(label)) && isEmailSatisfied(filledSet);
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
  const variants = QUESTION_VARIANTS[field];
  const assistantTurns = history.filter((m) => m.role === "assistant").length;
  const seed = entityId != null ? String(entityId).length : 0;
  return (assistantTurns + seed) % variants.length;
}
function pickVariant(field, history, entityId) {
  const variants = QUESTION_VARIANTS[field];
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
function buildFoodSalesReply(extracted, history, entityId, currentMessage) {
  const tipo = (extracted.tipo_evento ?? "").trim().toLowerCase();
  const eventLabel = tipo === "cumplea\xF1os" ? "un cumplea\xF1os" : tipo === "boda" ? "una boda" : tipo === "xv a\xF1os" ? "XV a\xF1os" : tipo ? `un ${tipo}` : "tu evento";
  const catering = buildCatalogCateringAnswer();
  const intro = `Para ${eventLabel}, lo m\xE1s pedido es banquete o taquiza seg\xFAn el estilo que busquen \u2014 banquete es m\xE1s formal con servicio de meseros; taquiza es m\xE1s casual y flexible.`;
  if (catering) {
    return `${intro}

${catering}`;
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
function contextualPrefix(field, extracted, currentMessage) {
  const msg = currentMessage?.trim() ?? "";
  if (!msg) return "";
  if (field === "requerimientos" && clientMentionsCatering(currentMessage)) {
    return "Perfecto. ";
  }
  if (field === "invitados" && (extracted.tipo_evento || /boda|xv|cumple|corporativo|baby/i.test(msg))) {
    return "Perfecto. ";
  }
  if (field === "zona" && /\d+/.test(msg)) {
    return "Entendido. ";
  }
  if (field === "fecha" && /ciudad|zona|polanco|cdmx|puebla|monterrey|reforma/i.test(msg)) {
    return "Muy bien. ";
  }
  if (field === "presupuesto" && /fecha|junio|julio|agosto|s[aá]bado|domingo|\d{1,2}\s+de/i.test(msg)) {
    return "Genial. ";
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
  if (!hasInv) return "invitados";
  if (!filled.has("Lugar/direcci\xF3n del evento")) return "zona";
  if (!filled.has("Fecha y horario")) return "fecha";
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
    if (isAffirmativeOnlyMessage(ctx.currentMessage)) {
      return "Perfecto. \xBFMe regalas tu nombre?";
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
  "invitados",
  "zona",
  "fecha",
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
  const prefix = contextualPrefix(field, ctx.extracted, ctx.currentMessage);
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
  const prefix = contextualPrefix("requerimientos", extracted, currentMessage);
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
  const advisor = advisorLabelForClient(nombre);
  let correoCore = pickVariant("correo", history, entityId);
  if (advisor === "nuestro equipo") {
    correoCore = correoCore.replace(/\bpara que Alejandro te arme\b/gi, "para que nuestro equipo te arme").replace(/\bAlejandro\b/gi, "nuestro equipo");
  }
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
  return clientAsksForRecommendations(currentMessage) || clientAsksBanqueteVsTaquiza(currentMessage) || clientMentionsCatering(currentMessage) || clientMentionsEntertainment(currentMessage) || clientMentionsPistaTarima(currentMessage) || isServiceRelatedMessage(currentMessage) || clientAsksPhone(currentMessage) || clientAsksPrice(currentMessage) || clientAsksInclusion(currentMessage) || clientAskedFreeformQuestion(currentMessage);
}
function clientAskedFreeformQuestion(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  if (/\?/.test(message)) return true;
  return /cu[aá]nto|precio|costo|cat[aá]logo|men[uú]|tienen|incluye|kosher|horario|tel[eé]fono|correo\s+de\s+bodasesor|hola@/i.test(
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
  const pendingBeforeClose = getNextPendingField(extracted, filledSet);
  const trulyReadyForClosing = readyForClosing && !pendingBeforeClose;
  const justGaveEmail = clientJustGaveEmail(history, currentMessage);
  const justAnsweredReq = clientJustAnsweredRequerimientosQuestion(history, currentMessage);
  const emailOk = isEmailSatisfied(filledSet);
  const needsNextStep = emailOk && !trulyReadyForClosing && !cierreYaEnviado;
  let mensaje;
  let appliedSalesReply = false;
  if (cierreYaEnviado && clientAddsToQuote(currentMessage)) {
    const nombre = extracted.nombre?.trim();
    mensaje = nombre ? `Perfecto, ${nombre}. Lo anoto para que nuestro equipo lo incluya en tu cotizaci\xF3n. \xBFHay algo m\xE1s que quieras agregar?` : "Perfecto. Lo anoto para que nuestro equipo lo incluya en tu cotizaci\xF3n. \xBFHay algo m\xE1s que quieras agregar?";
    log?.info({ entityId }, "GUARD: post-cierre \u2014 servicios adicionales");
  } else if (cierreYaEnviado && clientSaysThanks(currentMessage)) {
    mensaje = buildPostCierreThanksReply(extracted.nombre);
    log?.info({ entityId }, "GUARD: post-cierre \u2014 agradecimiento del cliente");
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
  } else if (clientMentionsEntertainment(currentMessage) || justAnsweredReq && clientMentionsEntertainment(currentMessage)) {
    mensaje = buildEntertainmentSalesReply(extracted, history, entityId, currentMessage);
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: show/entretenimiento \u2014 orientaci\xF3n de venta");
  } else if (clientMentionsPistaTarima(currentMessage)) {
    mensaje = buildPistaTarimaSalesReply(extracted, history, currentMessage, entityId);
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: pista/tarima \u2014 orientaci\xF3n de venta");
  } else if (clientMentionsCatering(currentMessage) || justAnsweredReq && isServiceRelatedMessage(currentMessage)) {
    const cateringAnswer = buildFoodSalesReply(extracted, history, entityId, currentMessage);
    mensaje = cateringAnswer ?? buildRecommendationsReply(extracted, history, entityId, currentMessage);
    appliedSalesReply = true;
    log?.info(
      { entityId, justAnsweredReq, food: clientMentionsCatering(currentMessage) },
      "GUARD: comida/servicio \u2014 orientaci\xF3n de venta"
    );
  } else if (clientAsksForRecommendations(currentMessage)) {
    mensaje = buildRecommendationsReply(extracted, history, entityId, currentMessage);
    appliedSalesReply = true;
    log?.info({ entityId }, "GUARD: cliente pidi\xF3 recomendaciones \u2014 sugerencias + servicios");
  } else if (clientAsksPrice(currentMessage)) {
    const ctxText2 = collectUserTexts(input.presentationHistory ?? history, currentMessage).join(" ");
    const pending = getNextPendingField(extracted, filledSet);
    const needsAlejandroQuote = mentionsNoListedPriceService(currentMessage) || responseHasInventedPrice(aiResponse, currentMessage, ctxText2) && !mentionsListedPriceService(currentMessage);
    if (needsAlejandroQuote) {
      const priceReply = buildAlejandroPriceReply(getPriceServiceLabel(currentMessage));
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
  } else if (trulyReadyForClosing && !cierreYaEnviado && (justAnsweredReq || requerimientosNeedsFollowUp(extracted, filledSet))) {
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
  if (filledSet.has("Presupuesto (MXN)") && mensajeAsksForField(mensaje, "presupuesto")) {
    if (trulyReadyForClosing && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
      log?.info({ entityId }, "GUARD: presupuesto capturado \u2014 cierre");
    } else {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
      if (nextQ && !mensajeAsksForField(nextQ, "presupuesto")) {
        mensaje = nextQ;
        log?.info({ entityId }, "GUARD: presupuesto ya capturado \u2014 no repetir pregunta");
      } else if (trulyReadyForClosing && !cierreYaEnviado) {
        mensaje = buildClosing(
          extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
          extracted.nombre
        );
      }
    }
  }
  const presFromCurrentMsg = currentMessage ? parsePresupuestoFromText(currentMessage) : null;
  if (presFromCurrentMsg && mensajeAsksForField(mensaje, "presupuesto") && !filledSet.has("Presupuesto (MXN)")) {
    applyPresupuestoWaiver(filledSet, [], [currentMessage ?? ""]);
    if (isReadyForClosing(filledSet) && !cierreYaEnviado) {
      mensaje = buildClosing(
        extracted.requerimientos_evento ?? extracted.tipo_evento ?? null,
        extracted.nombre
      );
      log?.info({ entityId }, "GUARD: presupuesto capturado en turno \u2014 cierre");
    } else if (/econ[oó]mic/i.test(presFromCurrentMsg)) {
      const nextQ = nextFieldQuestion(extracted, filledSet, whatsappDisplayName, history, currentMessage, entityId);
      mensaje = nextQ ? `Entendido, buscamos opciones econ\xF3micas. ${nextQ}` : "Entendido, buscamos opciones econ\xF3micas. Nuestro equipo te propone alternativas seg\xFAn lo que platicamos.";
      log?.info({ entityId }, "GUARD: presupuesto econ\xF3mico \u2014 no repetir pregunta");
    } else {
      mensaje = "Entendido, sin problema. Nuestro equipo te propone opciones seg\xFAn lo que platicamos y te arma la cotizaci\xF3n.";
      log?.info({ entityId }, "GUARD: cliente sin presupuesto fijo \u2014 continuar");
    }
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
  if (!trulyReadyForClosing && responseLooksLikePrematureClose(mensaje)) {
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
  mensaje = sanitizeOutboundMessage(mensaje, filledSet, extracted, ctx, log);
  if (appliedSalesReply) {
    return normalizeAdvisorReferences(mensaje, extracted.nombre);
  }
  mensaje = enforceNombreFirst(mensaje, filledSet, extracted, ctx, forceFirstPresentation);
  const presHistory = input.presentationHistory ?? history;
  const isOpeningTurn = (forceFirstPresentation || isFirstLucyReply(presHistory)) && !conversationAlreadyStarted(filledSet, presHistory);
  if (isOpeningTurn && !/hola,?\s*soy\s+lucy/i.test(mensaje)) {
    mensaje = `${LUCY_INTRO} ${mensaje}`.trim();
    log?.info({ entityId }, "GUARD: presentaci\xF3n Lucy a\xF1adida al primer mensaje");
  }
  if (conversationAlreadyStarted(filledSet, presHistory)) {
    mensaje = stripRepeatLucyIntro(mensaje, presHistory, true);
  }
  const ctxText = collectUserTexts(input.presentationHistory ?? history, currentMessage).join(" ");
  const priceSanitized = sanitizeInventedPrices(mensaje, currentMessage, ctxText);
  if (priceSanitized !== mensaje) {
    log?.info({ entityId }, "GUARD: precios inventados eliminados de la respuesta");
    mensaje = priceSanitized;
    const pending = getNextPendingField(extracted, filledSet);
    if (pending && !mensaje.includes("?") && !trulyReadyForClosing) {
      mensaje = mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx);
    }
  }
  mensaje = stripStalePriceTalk(mensaje, currentMessage);
  if (!mensaje.includes("?") && !trulyReadyForClosing && !clientAskedFreeformQuestion(currentMessage)) {
    const pendingAfter = getNextPendingField(extracted, filledSet);
    if (pendingAfter) {
      mensaje = mergeWithPendingQuestion(mensaje, filledSet, extracted, ctx);
    }
  }
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
  return normalizeAdvisorReferences(mensaje, extracted.nombre);
}
function stripGammaLinks(text) {
  if (!text || !/gamma\.app/i.test(text)) return text;
  return text.replace(/https?:\/\/[^\s]*gamma\.app[^\s]*/gi, "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

// src/selftest/lucy-flow-selftest.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  console.log("Lucy \u2014 17 escenarios de prueba\n");
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
    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const mirrorSrc = readFileSync(path.join(apiRoot, "src/services/kommoMirror.ts"), "utf8");
    const healthSrc = readFileSync(path.join(apiRoot, "src/routes/health.ts"), "utf8");
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
    assert.ok(/econ[oó]mic/i.test(ecoReply));
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
    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const mirrorSrc = readFileSync(path.join(apiRoot, "src/services/kommoMirror.ts"), "utf8");
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
  console.log(`
${passed} OK, ${failed} fallidas de ${passed + failed} escenarios`);
  if (failed > 0) process.exit(1);
}
runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
//# sourceMappingURL=lucy-flow-selftest.mjs.map
