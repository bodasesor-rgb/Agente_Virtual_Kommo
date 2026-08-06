/**
 * Constantes del embudo de calificación (cierre + presentación).
 * Extraídas de lucy-flow-guards para dejar el orquestador más delgado.
 */

/** Waiver de correo cuando el cliente prefiere no compartirlo. */
export const EMAIL_WAIVED_LABEL = "Correo (prefiere no compartir)";

export const BODASESOR_EMAIL = "hola@bodasesor.com";

/** Sufijo CRM cuando el nombre viene de WhatsApp porque el cliente no lo escribió. */
export const WHATSAPP_NOMBRE_NOTE =
  "(nombre de WhatsApp — el cliente no lo escribió)";

/** 8 pasos obligatorios para cierre (correo es opcional pero se intenta en paso 2). */
export const CLOSING_CORE_FIELDS = [
  "Nombre del cliente",
  "Tipo de evento",
  "Requerimientos o servicios",
  "Lugar/dirección del evento",
  "Fecha y horario",
  "Número de invitados",
  "Presupuesto (MXN)",
] as const;

/** Presentación obligatoria en el primer mensaje de Lucy. */
export const LUCY_INTRO = "Hola, soy Lucy, agente virtual de Bodasesor.";

/** Opciones de evento para orientar al cliente. */
export const TIPO_EVENTO_HINT =
  "Manejamos bodas, XV años, baby showers, cumpleaños, eventos corporativos, bautizos y celebraciones familiares.";

/** Texto para que el cliente sepa qué ofrece Bodasesor al preguntar por servicios. */
export const SERVICIOS_CATALOGO_HINT =
  "Manejamos alimentos y barras (banquetes, taquizas, barras temáticas), mobiliario, carpas, pistas de baile, DJ, iluminación, pantallas, mesas de dulces y más.";

/** Variante corta cuando el cliente ya mencionó un servicio. */
export const SERVICIOS_CATALOGO_HINT_ADICIONAL =
  "También manejamos bebidas, DJ, iluminación, carpas, mobiliario, pantallas, mesas de dulces y barras de alimentos.";

/** Follow-up de "¿otro servicio?" en cualquier variante (para anti-bucle). */
export const OTRO_SERVICIO_ASK_PATTERN =
  /alg[uú]n\s+otro\s+servicio|otro\s+servicio\b|qu[eé]\s+otros\s+servicios|algo\s+m[aá]s\s+para\s+(el\s+)?evento|solo\s+el\s+.+\s+o\s+tambi[eé]n|necesitan?\s+alg[uú]n\s+otro|cotizar\s+alg[uú]n\s+otro/i;

/** Máx. intentos de correo con redacción distinta — no spamear el mismo ask. */
export const CORREO_MAX_ASKS = 2;

export const CLOSING_SIGNATURE = "Perfecto, ya tengo todo.";

/** Plantillas legacy — preferir variantes naturales vía buildNaturalQuestion(). */
export const FLOW_QUESTIONS = {
  nombre: "¿Me regalas tu nombre para iniciar?",
  tipoEvento: "¿Qué festejan o qué tipo de evento sería?",
  tipoEventoTrasCorreo: "¿Qué tipo de celebración están planeando?",
  requerimientos: "Platícame, ¿qué tienes pensado para tu evento?",
  invitados: "¿Más o menos para cuántas personas sería?",
  zona: "¿En qué ciudad y colonia (o salón) sería tu evento? Si tienes la dirección exacta, mejor.",
  fecha: "¿Ya tienen fecha o todavía la van definiendo?",
  presupuesto: "¿Tienen algún rango de presupuesto en mente?",
  serviciosExtra: SERVICIOS_CATALOGO_HINT_ADICIONAL,
} as const;

export type PendingField =
  | "nombre"
  | "correo"
  | "tipo_evento"
  | "requerimientos"
  | "invitados"
  | "zona"
  | "fecha"
  | "presupuesto";
