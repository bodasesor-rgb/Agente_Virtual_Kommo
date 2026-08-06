/**
 * Respuestas fijas de contacto / handoff (teléfonos, emergencia, asesor humano, ubicación).
 */
import { sanitizeDisplayName } from "../contact-name.js";

/** Respuesta cuando preguntan por teléfonos de Bodasesor. */
export function buildPhoneAnswer(): string {
  return [
    "Claro, te paso los números:",
    "Ventas: 55 4008 0373 — solo por línea telefónica (no WhatsApp).",
    "Gerencia / corporativo: 56 4671 0585 — sí aceptamos llamadas por WhatsApp y por línea telefónica.",
    "Por aquí por chat también te podemos ayudar con lo que necesites.",
  ].join("\n");
}

/**
 * Única respuesta permitida cuando Lucy está en silencio (Humano Trabaja, etc.)
 * y el cliente pide ayuda/contacto/emergencia.
 */
export function buildEmergencyContactAnswer(): string {
  return [
    "Claro, te paso los contactos de emergencia del equipo:",
    "Ventas: 55 4008 0373 — solo por línea telefónica (no WhatsApp).",
    "Gerencia / corporativo: 56 4671 0585 — sí aceptamos llamadas por WhatsApp y por línea telefónica.",
    "Un asesor te puede atender por ahí. Tu caso sigue en seguimiento con el equipo.",
  ].join("\n");
}

/** Cliente pide asesor humano (A15000): confirma handoff + teléfonos; no sigue embudo. */
export function buildHumanAdvisorHandoffAnswer(clientName?: string | null): string {
  const name = sanitizeDisplayName(clientName);
  const hi = name ? `${name}, ` : "";
  return [
    `Claro que sí, ${hi}con gusto te canalizo con un asesor de Bodasesor para que te atiendan de forma personalizada.`,
    "",
    "Mientras te contactan, también puedes marcar:",
    "Ventas: 55 4008 0373 — solo por línea telefónica (no WhatsApp).",
    "Gerencia / corporativo: 56 4671 0585 — WhatsApp o línea telefónica.",
    "",
    "Ya dejé tu caso listo para el equipo.",
  ].join("\n");
}

/** Respuesta estándar de ubicación y cobertura (prompt sección 7). */
export function buildLocationAnswer(): string {
  return "Estamos en Ciudad de México y trabajamos en toda la república. Según la fecha y el lugar de tu evento, coordinamos el servicio.";
}
