/** Pedido/entrega vs servicio montado en el evento. */
export type ModoServicio = "pedido_entrega" | "servicio_montado" | null;

const PEDIDO_ENTREGA =
  /\b(para\s+llevar|a\s+domicilio|en\s+mi\s+casa|entrega|que\s+me\s+(los?\s+|las?\s+)?dejen|que\s+me\s+(los?\s+|las?\s+)?entreguen|solo\s+los?\s+rollos?|solo\s+el\s+producto|sin\s+montaje|pedido\s+de|un\s+pedido\s+de|cantidad\s+de\s+\d+|piezas?\s+de)\b/i;

const SERVICIO_MONTADO =
  /\b(montado\s+en|en\s+el\s+evento|barra\s+en|estaci[oó]n\s+en|meseros|servicio\s+en\s+el|montaje\s+en|en\s+mi\s+evento|en\s+la\s+fiesta)\b/i;

export function detectModoServicio(text: string | null | undefined): ModoServicio {
  const t = text?.trim() ?? "";
  if (!t) return null;
  if (PEDIDO_ENTREGA.test(t)) return "pedido_entrega";
  if (SERVICIO_MONTADO.test(t)) return "servicio_montado";
  return null;
}

/** Ambiguo: menciona producto/cantidad pero no si es entrega o montaje. */
export function needsModoServicioClarification(
  text: string | null | undefined,
  current: ModoServicio
): boolean {
  if (current) return false;
  const t = text?.trim() ?? "";
  if (!t) return false;
  return (
    /\b(\d+\s+rollos?|\d+\s+piezas?|\d+\s+platos?|quiero\s+\d+|necesito\s+\d+)\b/i.test(t) &&
    !PEDIDO_ENTREGA.test(t) &&
    !SERVICIO_MONTADO.test(t)
  );
}

export function buildModoServicioClarificationQuestion(): string {
  return "¿Lo quieres montado en tu evento con barra y servicio, o solo la entrega del producto?";
}

/**
 * Respuesta para pedido/entrega a domicilio (NO barra por persona / chefs en sitio).
 * Cotiza por cantidad; el equipo cierra cifra exacta.
 */
export function buildPedidoEntregaReply(message?: string | null): string {
  const t = message?.trim() ?? "";
  const qtyMatch = t.match(/(\d+)\s*(rollos?|piezas?|platos?)/i);
  const qtyLabel = qtyMatch ? `${qtyMatch[1]} ${qtyMatch[2]}` : null;
  const product = /\bsushi\b/i.test(t)
    ? "sushi"
    : /\bpizzas?\b/i.test(t)
      ? "pizza"
      : /\bpoke\b/i.test(t)
        ? "poke"
        : "producto";

  const what = qtyLabel ? `${qtyLabel} de ${product}` : `tu pedido de ${product}`;
  return (
    `Perfecto — lo tomo como *pedido/entrega a domicilio* (sin barra ni chefs en el evento). ` +
    `Para ${what}, nuestro equipo te arma la cotización exacta según cantidad y zona de entrega. ` +
    `¿Me regalas tu nombre para pasárselo?`
  );
}
