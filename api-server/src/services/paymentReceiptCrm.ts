/**
 * Comprobantes de pago por imagen (transferencia SPEI o efectivo).
 * Primer comprobante → Anticipo (1049322). Segundo → Liquidación (1049324).
 * No pisa valores ya llenos. No actúa con texto sin imagen.
 */
import { agregarNota } from "./embudo.js";
import type { ImageAnalysis, PaymentMethod } from "./imageProcessor.js";

export const FIELD_ANTICIPO = 1049322;
export const FIELD_LIQUIDACION = 1049324;

export type PaymentSlot = "anticipo" | "liquidacion";

export interface PaymentReceipt {
  amountMxn: number | null;
  method: PaymentMethod;
}

const paymentLocks = new Map<string, Promise<unknown>>();

export function kommoValueIsFilled(raw: unknown): boolean {
  if (raw == null || raw === "") return false;
  if (typeof raw === "number") return Number.isFinite(raw) && raw !== 0;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t || t === "-" || t === "0") return false;
    return true;
  }
  if (typeof raw === "object" && raw !== null && "value" in raw) {
    return kommoValueIsFilled((raw as { value: unknown }).value);
  }
  return true;
}

export function nextPaymentSlot(
  anticipoRaw: unknown,
  liquidacionRaw: unknown
): PaymentSlot | null {
  if (!kommoValueIsFilled(anticipoRaw)) return "anticipo";
  if (!kommoValueIsFilled(liquidacionRaw)) return "liquidacion";
  return null;
}

export function fieldIdForSlot(slot: PaymentSlot): number {
  return slot === "anticipo" ? FIELD_ANTICIPO : FIELD_LIQUIDACION;
}

export function paymentFieldValue(receipt: PaymentReceipt): number | string {
  if (receipt.amountMxn != null && receipt.amountMxn >= 1) {
    return receipt.amountMxn;
  }
  if (receipt.method === "efectivo") return "Efectivo";
  if (receipt.method === "transferencia") return "Transferencia";
  return "Comprobante";
}

export function clientReplyForPaymentSlot(slot: PaymentSlot): string {
  if (slot === "anticipo") {
    return "¡Gracias! Ya registré tu anticipo y el equipo da seguimiento.";
  }
  return "¡Gracias! Ya registré la liquidación y el equipo da seguimiento.";
}

export function receiptFromImageAnalysis(analysis: ImageAnalysis | null | undefined): PaymentReceipt | null {
  if (!analysis || analysis.intent !== "comprobante_pago") return null;
  return {
    amountMxn: analysis.amountMxn ?? null,
    method: analysis.paymentMethod ?? "otro",
  };
}

function findFieldValue(
  cfv: Array<{ field_id?: number; values?: Array<{ value?: unknown }> }>,
  fieldId: number
): unknown {
  const f = cfv.find((x) => x.field_id === fieldId);
  return f?.values?.[0]?.value;
}

async function patchLeadField(
  subdomain: string,
  accessToken: string,
  leadId: string | number,
  fieldId: number,
  value: number | string
): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`https://${subdomain}.kommo.com/api/v4/leads/${leadId}`, {
      method: "PATCH",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        custom_fields_values: [{ field_id: fieldId, values: [{ value }] }],
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export interface ApplyPaymentReceiptResult {
  slot: PaymentSlot;
  fieldId: number;
  value: number | string;
}

/**
 * Escribe Anticipo o Liquidación según cuántos comprobantes ya hay en el lead.
 * Encadena por lead para que dos fotos seguidas no pisen el mismo campo.
 */
export async function applyPaymentReceiptToLead(opts: {
  subdomain: string;
  accessToken: string;
  leadId: string | number;
  receipt: PaymentReceipt;
  log?: { info: Function; warn: Function };
}): Promise<ApplyPaymentReceiptResult | null> {
  const { subdomain, accessToken, leadId, receipt, log } = opts;
  const key = String(leadId);
  const prev = paymentLocks.get(key) ?? Promise.resolve();
  const run = prev.then(
    () => applyPaymentReceiptToLeadUnlocked({ subdomain, accessToken, leadId, receipt, log }),
    () => applyPaymentReceiptToLeadUnlocked({ subdomain, accessToken, leadId, receipt, log })
  );
  paymentLocks.set(
    key,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

async function applyPaymentReceiptToLeadUnlocked(opts: {
  subdomain: string;
  accessToken: string;
  leadId: string | number;
  receipt: PaymentReceipt;
  log?: { info: Function; warn: Function };
}): Promise<ApplyPaymentReceiptResult | null> {
  const { subdomain, accessToken, leadId, receipt, log } = opts;
  const getController = new AbortController();
  const getTimer = setTimeout(() => getController.abort(), 12_000);
  let getRes: Response;
  try {
    getRes = await fetch(`https://${subdomain}.kommo.com/api/v4/leads/${leadId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: getController.signal,
    });
  } catch (err) {
    log?.warn({ err, leadId }, "Pago imagen: timeout o red leyendo el lead");
    return null;
  } finally {
    clearTimeout(getTimer);
  }
  if (!getRes.ok) {
    log?.warn({ leadId, status: getRes.status }, "Pago imagen: no se pudo leer el lead");
    return null;
  }
  const data = (await getRes.json()) as {
    custom_fields_values?: Array<{ field_id?: number; values?: Array<{ value?: unknown }> }>;
  };
  const cfv = data.custom_fields_values ?? [];
  const slot = nextPaymentSlot(findFieldValue(cfv, FIELD_ANTICIPO), findFieldValue(cfv, FIELD_LIQUIDACION));
  if (!slot) {
    log?.info({ leadId }, "Pago imagen: Anticipo y Liquidación ya tenían valor — no pisé");
    return null;
  }

  const fieldId = fieldIdForSlot(slot);
  const value = paymentFieldValue(receipt);
  let patched = await patchLeadField(subdomain, accessToken, leadId, fieldId, value);
  if (!patched.ok && typeof value === "number") {
    patched = await patchLeadField(subdomain, accessToken, leadId, fieldId, String(value));
  } else if (!patched.ok && typeof value === "string") {
    const asNum = Number(String(value).replace(/[^\d.]/g, ""));
    if (Number.isFinite(asNum) && asNum > 0) {
      patched = await patchLeadField(subdomain, accessToken, leadId, fieldId, asNum);
    }
  }
  if (!patched.ok) {
    log?.warn(
      { leadId, fieldId, slot, status: patched.status, value },
      "Pago imagen: PATCH Anticipo/Liquidación falló"
    );
    return null;
  }

  const methodLabel =
    receipt.method === "efectivo"
      ? "efectivo"
      : receipt.method === "transferencia"
        ? "transferencia"
        : "comprobante";
  const amountLabel = receipt.amountMxn != null ? `$${receipt.amountMxn.toLocaleString("es-MX")}` : "sin monto legible";
  const slotLabel = slot === "anticipo" ? "Anticipo" : "Liquidación";
  void agregarNota(
    subdomain,
    accessToken,
    leadId,
    `Lucy: registré ${slotLabel} (${amountLabel}, ${methodLabel}) desde comprobante en imagen.`
  ).catch(() => undefined);

  log?.info({ leadId, slot, fieldId, value, method: receipt.method }, "Pago imagen: campo CRM actualizado");
  return { slot, fieldId, value };
}
