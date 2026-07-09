import type { ExtractedData } from "../types.js";

const CATALOG_FILENAME = "Catalogo-Menus-Bodasesor-2026.pdf";

/** Asunto para respuestas de Lucy por correo vía Kommo. */
export function buildEmailSubject(
  extracted: ExtractedData,
  opts: { isFirstInteraction?: boolean; isClosing?: boolean }
): string {
  const nombre = extracted.nombre?.trim();
  const evento = extracted.tipo_evento?.trim();
  const saludo = nombre ? nombre.split(" ")[0] : null;

  if (opts.isClosing) {
    return evento
      ? `Tu cotización de ${evento} — Bodasesor`
      : "Información recibida — Bodasesor";
  }

  if (opts.isFirstInteraction) {
    return evento
      ? `Gracias por contactarnos — ${evento} | Bodasesor`
      : "Gracias por escribir a Bodasesor";
  }

  if (evento && saludo) {
    return `Re: Tu ${evento} — ${saludo} | Bodasesor`;
  }

  if (saludo) {
    return `Re: Tu evento — ${saludo} | Bodasesor`;
  }

  return "Re: Tu consulta — Bodasesor";
}

export function catalogAttachmentMeta(catalogUrl: string): {
  attachmentUrl: string;
  attachmentName: string;
} {
  return {
    attachmentUrl: catalogUrl,
    attachmentName: CATALOG_FILENAME,
  };
}
