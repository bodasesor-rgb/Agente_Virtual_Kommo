/**
 * A16075 — Embudo corto para proveedores / alianzas (antes de silenciar Lucy).
 */
import type { ExtractedData } from "../types.js";
import { extractEmpresaFromText } from "./proveedorHandoff.js";

export type ProveedorPendingField =
  | "oferta"
  | "estado"
  | "catalogo"
  | "contacto"
  | "nombre_empresa"
  | null;

const MX_ESTADO =
  /\b(Aguascalientes|Baja\s+California(\s+Sur)?|Campeche|Chiapas|Chihuahua|Ciudad\s+de\s+M[eé]xico|CDMX|CD\s*MX|Coahuila|Colima|Durango|Guanajuato|Guerrero|Hidalgo|Jalisco|Estado\s+de\s+M[eé]xico|Edomex|Edo\.?\s*Mex|Michoac[aá]n|Morelos|Nayarit|Nuevo\s+Le[oó]n|Oaxaca|Puebla|Quer[eé]taro|Quintana\s+Roo|San\s+Luis\s+Potos[ií]|Sinaloa|Sonora|Tabasco|Tamaulipas|Tlaxcala|Veracruz|Yucat[aá]n|Zacatecas|M[eé]xico)\b/i;

/** Cliente aclara que NO es proveedor / quiere cotizar evento. */
export function looksLikeClienteNotProveedor(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (
    /\b(no\s+soy\s+proveedor|no\s+somos\s+proveedores|yo\s+no\s+vendo|no\s+ofrezco\s+servicios|me\s+confund[ií]|soy\s+cliente|somos\s+clientes)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(quiero\s+cotizar|necesito\s+cotizar|solicito\s+(una\s+)?cotizaci[oó]n|para\s+mi\s+(boda|evento|xv|fiesta)|nuestro\s+evento|me\s+das\s+precio)\b/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

export function parseProveedorFieldsFromRequirements(
  req: string | null | undefined
): Pick<ExtractedData, "proveedor_oferta" | "proveedor_estado" | "proveedor_catalogo" | "empresa"> {
  const t = (req ?? "").trim();
  if (!t) {
    return {
      proveedor_oferta: null,
      proveedor_estado: null,
      proveedor_catalogo: null,
      empresa: null,
    };
  }
  const empresa =
    t.match(/PROVEEDOR:\s*([^-|]+?)\s*-\s*Ofrece/i)?.[1]?.trim() ||
    t.match(/Empresa:\s*([^|]+)/i)?.[1]?.trim() ||
    null;
  const ofertaRaw =
    t.match(/Ofrece:\s*([^|]+)/i)?.[1]?.trim() ||
    t.match(/Oferta:\s*([^|]+)/i)?.[1]?.trim() ||
    null;
  const estado = t.match(/Estado:\s*([^|]+)/i)?.[1]?.trim() || null;
  const catalogo =
    t.match(/Cat[aá]logo:\s*([^|]+)/i)?.[1]?.trim() ||
    t.match(/Lista\s+de\s+precios:\s*([^|]+)/i)?.[1]?.trim() ||
    null;
  const oferta =
    ofertaRaw && ofertaRaw !== "—" && ofertaRaw.length >= 3 ? ofertaRaw : null;
  return {
    empresa: empresa && empresa !== "—" ? empresa : null,
    proveedor_oferta: oferta,
    proveedor_estado: estado && estado !== "—" ? estado : null,
    proveedor_catalogo: catalogo && catalogo !== "—" ? catalogo : null,
  };
}

export function formatProveedorRequirements(extracted: ExtractedData): string {
  const empresa = extracted.empresa?.trim() || "—";
  const oferta = extracted.proveedor_oferta?.trim() || "—";
  const estado = extracted.proveedor_estado?.trim();
  const catalogo = extracted.proveedor_catalogo?.trim();
  const parts = [`PROVEEDOR: ${empresa} - Ofrece: ${oferta}`];
  if (estado) parts.push(`Estado: ${estado}`);
  if (catalogo) parts.push(`Catálogo: ${catalogo}`);
  return parts.join(" | ").slice(0, 500);
}

export function hydrateProveedorFieldsFromRequirements(extracted: ExtractedData): void {
  const parsed = parseProveedorFieldsFromRequirements(extracted.requerimientos_evento);
  if (!extracted.empresa?.trim() && parsed.empresa) extracted.empresa = parsed.empresa;
  if (!extracted.proveedor_oferta?.trim() && parsed.proveedor_oferta) {
    extracted.proveedor_oferta = parsed.proveedor_oferta;
  }
  if (!extracted.proveedor_estado?.trim() && parsed.proveedor_estado) {
    extracted.proveedor_estado = parsed.proveedor_estado;
  }
  if (!extracted.proveedor_catalogo?.trim() && parsed.proveedor_catalogo) {
    extracted.proveedor_catalogo = parsed.proveedor_catalogo;
  }
}

function hasContact(extracted: ExtractedData): boolean {
  return !!(extracted.correo?.trim() || extracted.telefono?.trim());
}

function hasNombreOrEmpresa(extracted: ExtractedData): boolean {
  return !!(extracted.nombre?.trim() || extracted.empresa?.trim());
}

/** Datos mínimos para cerrar embudo proveedor y mandar a Sheets + zona. */
export function proveedorQuestionnaireComplete(extracted: ExtractedData): boolean {
  if (extracted.tipo_contacto !== "proveedor") return false;
  hydrateProveedorFieldsFromRequirements(extracted);
  const ofertaOk = !!extracted.proveedor_oferta?.trim() && extracted.proveedor_oferta.trim().length >= 3;
  const estadoOk = !!extracted.proveedor_estado?.trim();
  const catalogoOk = !!extracted.proveedor_catalogo?.trim();
  return ofertaOk && estadoOk && catalogoOk && hasContact(extracted) && hasNombreOrEmpresa(extracted);
}

export function getNextProveedorQuestion(extracted: ExtractedData): ProveedorPendingField {
  hydrateProveedorFieldsFromRequirements(extracted);
  if (!extracted.proveedor_oferta?.trim() || extracted.proveedor_oferta.trim().length < 3) {
    return "oferta";
  }
  if (!extracted.proveedor_estado?.trim()) return "estado";
  if (!extracted.proveedor_catalogo?.trim()) return "catalogo";
  if (!hasContact(extracted)) return "contacto";
  if (!hasNombreOrEmpresa(extracted)) return "nombre_empresa";
  return null;
}

function extractHttpUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m?.[0]?.replace(/[.,;)]+$/, "") ?? null;
}

function looksLikeCatalogDecline(text: string): boolean {
  return /\b(no\s+tengo|a[uú]n\s+no|todav[ií]a\s+no|no\s+cuento\s+con|despu[eé]s\s+te\s+mando|te\s+lo\s+mando\s+despu[eé]s|sin\s+cat[aá]logo)\b/i.test(
    text
  );
}

function looksLikeCatalogPromise(text: string): boolean {
  return /\b(te\s+(lo\s+)?mando|te\s+envio|te\s+env[ií]o|adjunto|aqu[ií]\s+(va|est[aá])|lista\s+de\s+precios|cat[aá]logo|pdf|excel|drive\.google|dropbox)\b/i.test(
    text
  );
}

/** Aplica la respuesta del turno al campo pendiente (o captura oportunista). */
export function applyProveedorAnswer(
  extracted: ExtractedData,
  message: string,
  _historyBlob?: string
): void {
  const msg = message?.trim() ?? "";
  if (!msg) return;

  hydrateProveedorFieldsFromRequirements(extracted);

  if (!extracted.empresa?.trim()) {
    const emp = extractEmpresaFromText(msg);
    if (emp) extracted.empresa = emp;
  }

  const pending = getNextProveedorQuestion(extracted);

  // Captura oportunista de URL siempre.
  const url = extractHttpUrl(msg);
  if (url && !extracted.proveedor_catalogo?.trim()) {
    extracted.proveedor_catalogo = url;
  }

  // A16121: "nos gustaría ser uno de sus provedores" es intención, no oferta.
  const intentOnlyOferta =
    /\b((nos\s+|me\s+)?(gustar[ií]a|dese[oa]mos?|queremos|quiero|quisiera)\s+ser(\s+uno\s+de)?\s+(sus\s+|los\s+|vuestros\s+)?prove[e]?dores?|ser(\s+uno\s+de)?\s+(sus\s+|los\s+)?prove[e]?dores?|quiero\s+ser\s+prove[e]?dor)\b/i.test(
      msg
    ) &&
    !/\b(ofrezco|ofrecemos|manejamos|vendemos|distribuidor|banquete|taquiza|flor(es|al)|foto|video|m[uú]sica|dj|sal[oó]n|hacienda|mobiliario|iluminaci[oó]n)\b/i.test(
      msg
    );

  if (
    !intentOnlyOferta &&
    (pending === "oferta" || (!extracted.proveedor_oferta?.trim() && msg.length >= 8))
  ) {
    if (
      pending === "oferta" ||
      /\b(ofrezco|ofrecemos|manejamos|vendemos|somos|distribuidor|alianza|venue|hacienda)\b/i.test(msg)
    ) {
      if (!extracted.proveedor_oferta?.trim() || pending === "oferta") {
        // No guardar respuestas que son solo estado/correo.
        if (!MX_ESTADO.test(msg) || msg.split(/\s+/).length > 4) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg)) {
            extracted.proveedor_oferta = msg.slice(0, 280);
          }
        }
      }
    }
  }

  if (pending === "estado" || (!extracted.proveedor_estado?.trim() && MX_ESTADO.test(msg))) {
    const estadoMatch = msg.match(MX_ESTADO);
    if (estadoMatch) {
      extracted.proveedor_estado = estadoMatch[0]!.trim();
    } else if (pending === "estado" && msg.length >= 3 && msg.length <= 80) {
      extracted.proveedor_estado = msg.slice(0, 80);
    }
  }

  if (pending === "catalogo" || !extracted.proveedor_catalogo?.trim()) {
    if (url) {
      extracted.proveedor_catalogo = url;
    } else if (looksLikeCatalogDecline(msg)) {
      extracted.proveedor_catalogo = "Aún no / lo envían después";
    } else if (pending === "catalogo" && looksLikeCatalogPromise(msg)) {
      extracted.proveedor_catalogo = msg.slice(0, 200);
    } else if (pending === "catalogo" && msg.length >= 3) {
      extracted.proveedor_catalogo = msg.slice(0, 200);
    }
  }

  if (pending === "contacto") {
    const email = msg.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
    if (email) extracted.correo = email;
    const phone = msg.match(/(?:\+?52\s*)?(?:\d[\s-]*){10,}/)?.[0];
    if (phone && phone.replace(/\D/g, "").length >= 10) {
      extracted.telefono = phone.replace(/\s+/g, " ").trim();
    }
  }

  if (pending === "nombre_empresa") {
    if (!extracted.nombre?.trim() && /^[A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ\s.'-]{1,60}$/.test(msg)) {
      extracted.nombre = msg.trim();
    }
    const emp = extractEmpresaFromText(msg) || (!extracted.empresa ? msg.slice(0, 80) : null);
    if (emp && !extracted.empresa?.trim()) extracted.empresa = emp;
  }

  extracted.requerimientos_evento = formatProveedorRequirements(extracted);
}

export function buildProveedorQuestionText(
  field: Exclude<ProveedorPendingField, null>,
  extracted: ExtractedData
): string {
  const name = extracted.nombre?.trim().split(/\s+/)[0];
  const hi = name ? `${name}, ` : "";
  switch (field) {
    case "oferta":
      return `${hi}para canalizarte bien con el equipo: ¿qué servicios o productos ofrecen?`;
    case "estado":
      return `${hi}¿en qué estado(s) de la República operan o dan cobertura?`;
    case "catalogo":
      return `${hi}¿me puedes compartir tu *catálogo* o *lista de precios* (link, PDF o un resumen)? Si aún no lo tienes, dímelo igual.`;
    case "contacto":
      return `${hi}¿me dejas un *correo* o *WhatsApp* de contacto comercial?`;
    case "nombre_empresa":
      return `${hi}¿me confirmas tu *nombre* y el de tu *empresa* o venue?`;
  }
}

export function buildProveedorProgressReply(extracted: ExtractedData): string {
  hydrateProveedorFieldsFromRequirements(extracted);
  const next = getNextProveedorQuestion(extracted);
  if (!next) {
    return buildProveedorCompletionReply(extracted);
  }
  const ackBits: string[] = [];
  if (extracted.proveedor_oferta?.trim()) ackBits.push("lo que ofrecen");
  if (extracted.proveedor_estado?.trim()) ackBits.push("cobertura");
  if (extracted.proveedor_catalogo?.trim()) ackBits.push("catálogo");
  const ack =
    ackBits.length > 0
      ? `Perfecto, ya anoté ${ackBits.join(", ")}. `
      : "Gracias por escribirnos como proveedor / aliado. ";
  return `${ack}${buildProveedorQuestionText(next, extracted)}`;
}

export function buildProveedorCompletionReply(extracted: ExtractedData): string {
  const name = extracted.nombre?.trim().split(/\s+/)[0];
  const empresa = extracted.empresa?.trim();
  const greet = name ? `Gracias, ${name}.` : "Gracias.";
  const who = empresa ? ` Ya tengo los datos de *${empresa}*.` : " Ya tengo tus datos de proveedor.";
  return (
    `${greet}${who} ` +
    "Los paso a nuestro equipo de *proveedores / alianzas* para que los revisen. " +
    "Si les interesa, ellos te contactan. ¡Que tengas excelente día!"
  );
}

/** Limpia campos solo-proveedor al recuperar embudo cliente. */
export function scrubProveedorFieldsForCliente(extracted: ExtractedData): void {
  extracted.tipo_contacto = "cliente";
  extracted.proveedor_oferta = null;
  extracted.proveedor_estado = null;
  extracted.proveedor_catalogo = null;
  if (/^PROVEEDOR:/i.test(extracted.requerimientos_evento ?? "")) {
    extracted.requerimientos_evento = null;
  }
}
