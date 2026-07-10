/**
 * Filtro de calidad para pares de aprendizaje cliente→humano.
 * Lucy NO debe aprender de sí misma ni de intercambios vacíos.
 */

const TRIVIAL_RESPONSE =
  /^(ok|s[ií]|no|vale|claro|gracias|de\s+acuerdo|perfecto|listo|bueno|bien|aja|aj[aá]|simon|simón|sale|va|oki)[.!?\s,]*$/i;

const TRIVIAL_QUESTION =
  /^(hola|buenos?\s*d[ií]as|buenas?\s*tardes|buenas?\s*noches|buenas|gracias|ok|s[ií]|no)[.!?\s,]*$/i;

const SPAM_OR_PROVIDER =
  /\b(soy\s+proveedor|ofrezco\s+servicio|publicidad|spam|trabajo\s+para\s+ustedes|vendo\s+)/i;

export interface ParAprendizaje {
  preguntaCliente: string;
  respuestaHumano: string;
  contextoPrevio?: string | null;
  source?: string;
  autor?: string;
  kommoLeadId?: string;
}

export function esParUtil(par: ParAprendizaje): boolean {
  const pregunta = par.preguntaCliente?.trim() ?? "";
  const respuesta = par.respuestaHumano?.trim() ?? "";

  if (pregunta.length < 8 || respuesta.length < 20) return false;
  if (TRIVIAL_QUESTION.test(pregunta)) return false;
  if (TRIVIAL_RESPONSE.test(respuesta)) return false;
  if (SPAM_OR_PROVIDER.test(pregunta) || SPAM_OR_PROVIDER.test(respuesta)) return false;

  // No aprender de respuestas que suenan a Lucy/bot
  if (/\b(soy\s+lucy|agente\s+virtual|bodasesor\.com\/catalogo)\b/i.test(respuesta)) return false;

  // Datos personales sensibles
  if (/\b\d{10,}\b/.test(pregunta + respuesta)) return false;
  if (/\S+@\S+\.\S+/.test(pregunta) && pregunta.length < 40) return false;

  return true;
}

export function filtrarPares(pares: ParAprendizaje[]): ParAprendizaje[] {
  return pares.filter(esParUtil);
}
