import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    

// src/selftest/lucy-flow-selftest.ts
import assert from "node:assert/strict";

// src/contact-name.ts
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
  [/\b(evento\s+corporativo|convenci[oó]n|conferencia|corporativo)\b/i, "evento corporativo"],
  [/\b(cumplea[nñ]os?|cumple)\b/i, "cumplea\xF1os"],
  [/\b(bautizo)\b/i, "bautizo"],
  [/\b(comuni[oó]n|graduaci[oó]n)\b/i, "celebraci\xF3n"]
];
function clientAsksForRecommendations(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /recomendaciones?|recomiendas?/i.test(t) || /qu[eé]\s+me\s+(recomiendas?|recomendaciones?|sugieres|conviene|puedes\s+dar)/i.test(t) || /qu[eé]\s+(puedo|podemos)\s+(meter|incluir|poner|agregar)/i.test(t) || /qu[eé]\s+opciones/i.test(t) || /qu[eé]\s+servicios\s+me\s+conviene/i.test(t) || /qu[eé]\s+ofrecen|qu[eé]\s+tienen|qu[eé]\s+manejan|qu[eé]\s+hacen/i.test(t) || /cu[aá]les\s+son\s+(sus\s+)?servicios|informaci[oó]n\s+de\s+(sus\s+)?servicios/i.test(t) || /banquete\s+o\s+taquiza|taquiza\s+o\s+banquete/i.test(t) || /algo\s+m[aá]s\s*\?/i.test(t);
}
function clientMentionsCatering(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /\bcatering\b/i.test(t) || /\b(busco|necesito|quiero|cotizar)\s+(comida|alimentos?|men[uú])\b/i.test(t) || /\bcomida\s+para\b/i.test(t) || /\b(solo|nada\s+m[aá]s)\s+(comida|alimentos?)\b/i.test(t) || /\b(comida|alimentos?|men[uú])\s+(para|del)\b/i.test(t);
}
function clientAsksPhone(message) {
  if (!message?.trim()) return false;
  const t = message.toLowerCase();
  return /\btel[eé]fono/i.test(t) || /\bn[uú]mero\s+(de\s+)?(contacto|atenci[oó]n|ventas|gerencia)/i.test(t) || /\b(llamar|marcar|contestar|contestan|nadie\s+contesta|me\s+urge)\b/i.test(t) || /\bwhatsapp\s+(de\s+)?(ventas|gerencia|corporativo|bodasesor)/i.test(t) || /\btienen\s+whatsapp/i.test(t);
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
function parseZonaFromText(text) {
  const trimmed = text.trim();
  if (!trimmed || /@/.test(trimmed)) return null;
  if (isGreetingOnlyMessage(trimmed)) return null;
  if (isAffirmativeOnlyMessage(trimmed)) return null;
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
  return null;
}
function parseFechaFromText(text) {
  const trimmed = text.trim();
  const fechaMatch = trimmed.match(
    /\b(?:el\s+)?(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?)\b/i
  );
  if (fechaMatch) return fechaMatch[1];
  if (/\b(pr[oó]ximo\s+s[aá]bado|pr[oó]ximo\s+domingo|sin\s+fecha|a[uú]n\s+no\s+tenemos\s+fecha|todav[ií]a\s+no|por\s+definir)\b/i.test(
    trimmed
  )) {
    return trimmed.slice(0, 80);
  }
  if (MONTH_PATTERN.test(trimmed) && /\d/.test(trimmed)) return trimmed.slice(0, 80);
  return null;
}
function bareNumberLooksLikeInvitados(num, trimmed) {
  if (/\$|k\b|mil\b|pesos|mxn|mnx/i.test(trimmed)) return false;
  return num >= 5 && num <= 999;
}
function parsePresupuestoFromText(text, opts) {
  const trimmed = text.trim();
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
function collectUserMessages(history, currentMessage) {
  const fromHistory = history.filter((m) => m.role === "user" && typeof m.content === "string").map((m) => m.content);
  return currentMessage?.trim() ? [...fromHistory, currentMessage.trim()] : fromHistory;
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
      captures.push({
        label: "Requerimientos o servicios",
        value: service ?? msg.trim().slice(0, 120)
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
      if (zona) {
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
  }
  return captures;
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

// src/selftest/lucy-flow-selftest.ts
var passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok ${name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL ${name}:`, msg);
    process.exitCode = 1;
  }
}
console.log("Lucy flow selftest\n");
test("60 no es presupuesto sin contexto", () => {
  assert.equal(parsePresupuestoFromText("60"), null);
});
test("60 s\xED es invitados", () => {
  assert.equal(parseInvitadosFromText("60"), "60");
});
test("presupuesto con contexto de pregunta", () => {
  assert.ok(parsePresupuestoFromText("80000", { askedField: "presupuesto" }));
});
test("50000 es presupuesto bare", () => {
  assert.ok(parsePresupuestoFromText("50000"));
});
test("no s\xE9 a\xFAn marca invitados pendientes", () => {
  const inv = parseInvitadosFromText("No s\xE9 a\xFAn");
  assert.ok(inv?.includes("Sin definir"));
});
test("busco comida detecta catering", () => {
  assert.equal(clientMentionsCatering("Busco comida"), true);
});
test("busco comida mapea a servicio", () => {
  assert.equal(parsePrimaryService("Busco comida"), "banquete / taquiza");
});
test("scan no captura 60 como presupuesto", () => {
  const filled = /* @__PURE__ */ new Set();
  const caps = scanConversationForCaptures([], "60", filled);
  const pres = caps.find((c) => c.label === "Presupuesto (MXN)");
  assert.equal(pres, void 0);
  const inv = caps.find((c) => c.label === "N\xFAmero de invitados");
  assert.equal(inv?.value, "60");
});
test("cliente Alejandro evita nombre asesor en cierre", () => {
  assert.equal(advisorLabelForClient("Alejandro"), "nuestro equipo");
  const fixed = normalizeAdvisorReferences(
    "Voy a pasarle esta informaci\xF3n a Alejandro para que te prepare una cotizaci\xF3n.",
    "Alejandro"
  );
  assert.ok(fixed.includes("nuestro equipo"));
  assert.ok(!/\bAlejandro\b.*cotiz/i.test(fixed));
});
test("resumen largo sin emoji y con comida", () => {
  const text = buildResumenClienteLargo(
    {
      nombre: "Alejandro",
      correo: null,
      presupuesto: null,
      direccion_evento: "CDMX",
      requerimientos_evento: "banquete / taquiza",
      fecha_horario: "en 2 meses",
      num_invitados: 60,
      tipo_evento: "cumplea\xF1os",
      tipo_contacto: "cliente",
      empresa: null,
      telefono: null
    },
    [
      "- Nombre del cliente: Alejandro",
      "- Tipo de evento: cumplea\xF1os",
      "- Requerimientos o servicios: banquete / taquiza",
      "- N\xFAmero de invitados: 60"
    ],
    "cumplea\xF1os busco comida 60 CDMX"
  );
  assert.ok(!text.includes("\u{1F4CB}"));
  assert.ok(text.includes("banquete"));
});
test("cliente pregunta tel\xE9fono", () => {
  assert.equal(clientAsksPhone("\xBFTienen tel\xE9fono de ventas?"), true);
});
console.log(`
${passed} pruebas OK`);
//# sourceMappingURL=lucy-flow-selftest.mjs.map
