/**
 * Bodasesor usa un Salesbot de Kommo para seguimientos simples (5h y 22h).
 * Lucy no debe duplicar esos envíos — solo leer y aprender.
 */

/** true por defecto: el bot externo de Kommo maneja 5h y 22h */
export function externalFollowupBotEnabled(): boolean {
  const raw = process.env["KOMMO_EXTERNAL_FOLLOWUP_BOT"]?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return true;
}
