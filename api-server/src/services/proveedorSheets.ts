/**
 * A16075 — Append filas de proveedores a Google Sheets (pestaña "Proveedores").
 * Auth: service account JSON en GOOGLE_SERVICE_ACCOUNT_JSON (o path GOOGLE_SERVICE_ACCOUNT_FILE).
 * Sheet: GOOGLE_SHEETS_PROVEEDORES_ID (default = BODASESOR_PRECIOS_SHEET_ID).
 */
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { logger } from "../lib/logger.js";
import { BODASESOR_PRECIOS_SHEET_ID } from "./googleSheetsCatalog.js";

const TAB_NAME = "Proveedores";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const HEADERS = [
  "Timestamp",
  "Lead ID",
  "Nombre",
  "Empresa",
  "Correo",
  "Teléfono",
  "Qué ofrece",
  "Estado",
  "Catálogo / precios",
  "Notas",
  "Kommo URL",
] as const;

export interface ProveedorSheetRow {
  leadId: string | number;
  nombre?: string | null;
  empresa?: string | null;
  correo?: string | null;
  telefono?: string | null;
  oferta?: string | null;
  estado?: string | null;
  catalogo?: string | null;
  notas?: string | null;
  kommoUrl?: string | null;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function resolveSpreadsheetId(): string {
  const raw =
    process.env["GOOGLE_SHEETS_PROVEEDORES_ID"]?.trim() ||
    process.env["GOOGLE_SHEETS_PRECIOS"]?.trim() ||
    BODASESOR_PRECIOS_SHEET_ID;
  const fromUrl = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return fromUrl?.[1] ?? raw;
}

async function loadServiceAccount(): Promise<ServiceAccount | null> {
  const inline = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"]?.trim();
  if (inline) {
    try {
      const parsed = JSON.parse(inline) as ServiceAccount;
      if (parsed.client_email && parsed.private_key) return parsed;
    } catch (err) {
      logger.warn({ err }, "proveedorSheets: GOOGLE_SERVICE_ACCOUNT_JSON inválido");
    }
  }
  const file = process.env["GOOGLE_SERVICE_ACCOUNT_FILE"]?.trim();
  if (file) {
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as ServiceAccount;
      if (parsed.client_email && parsed.private_key) return parsed;
    } catch (err) {
      logger.warn({ err, file }, "proveedorSheets: no se pudo leer service account file");
    }
  }
  return null;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SHEETS_SCOPE,
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const key = sa.private_key.replace(/\\n/g, "\n");
  const sig = b64url(signer.sign(key));
  const jwt = `${unsigned}.${sig}`;

  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    logger.warn({ status: res.status, errBody: errBody.slice(0, 300) }, "proveedorSheets: token OAuth falló");
    return null;
  }
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function sheetsFetch(
  path: string,
  token: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`https://sheets.googleapis.com/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function ensureProveedoresTab(
  spreadsheetId: string,
  token: string
): Promise<boolean> {
  const metaRes = await sheetsFetch(
    `/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    token
  );
  if (!metaRes.ok) {
    logger.warn({ status: metaRes.status }, "proveedorSheets: no se pudo leer meta del spreadsheet");
    return false;
  }
  const meta = (await metaRes.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  const titles = (meta.sheets ?? []).map((s) => s.properties?.title ?? "");
  if (!titles.includes(TAB_NAME)) {
    const createRes = await sheetsFetch(`/spreadsheets/${spreadsheetId}:batchUpdate`, token, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: TAB_NAME } } }],
      }),
    });
    if (!createRes.ok) {
      const errBody = await createRes.text().catch(() => "");
      logger.warn(
        { status: createRes.status, errBody: errBody.slice(0, 300) },
        "proveedorSheets: no se pudo crear pestaña Proveedores"
      );
      return false;
    }
  }

  // Headers si la primera fila está vacía.
  const range = encodeURIComponent(`${TAB_NAME}!A1:K1`);
  const getRes = await sheetsFetch(
    `/spreadsheets/${spreadsheetId}/values/${range}`,
    token
  );
  if (!getRes.ok) return true;
  const values = (await getRes.json()) as { values?: string[][] };
  const first = values.values?.[0]?.[0]?.trim();
  if (!first) {
    await sheetsFetch(`/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, token, {
      method: "PUT",
      body: JSON.stringify({ values: [Array.from(HEADERS)] }),
    });
  }
  return true;
}

export function proveedorSheetsConfigured(): boolean {
  return !!(
    process.env["GOOGLE_SERVICE_ACCOUNT_JSON"]?.trim() ||
    process.env["GOOGLE_SERVICE_ACCOUNT_FILE"]?.trim()
  );
}

/**
 * Append una fila. Si no hay credenciales, retorna { ok: false, skipped: true }.
 */
export async function appendProveedorRow(
  row: ProveedorSheetRow
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const sa = await loadServiceAccount();
  if (!sa) {
    logger.warn("proveedorSheets: sin service account — skip append");
    return { ok: false, skipped: true, error: "missing_service_account" };
  }
  const token = await getAccessToken(sa);
  if (!token) return { ok: false, error: "oauth_failed" };

  const spreadsheetId = resolveSpreadsheetId();
  const ready = await ensureProveedoresTab(spreadsheetId, token);
  if (!ready) return { ok: false, error: "ensure_tab_failed" };

  const ts = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
  const values = [
    [
      ts,
      String(row.leadId),
      row.nombre ?? "",
      row.empresa ?? "",
      row.correo ?? "",
      row.telefono ?? "",
      row.oferta ?? "",
      row.estado ?? "",
      row.catalogo ?? "",
      row.notas ?? "",
      row.kommoUrl ?? "",
    ],
  ];

  const range = encodeURIComponent(`${TAB_NAME}!A:K`);
  const res = await sheetsFetch(
    `/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    token,
    { method: "POST", body: JSON.stringify({ values }) }
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    logger.warn(
      { status: res.status, errBody: errBody.slice(0, 400), spreadsheetId },
      "proveedorSheets: append falló"
    );
    return { ok: false, error: `append_${res.status}` };
  }
  logger.info({ spreadsheetId, leadId: row.leadId }, "proveedorSheets: fila append OK");
  return { ok: true };
}
