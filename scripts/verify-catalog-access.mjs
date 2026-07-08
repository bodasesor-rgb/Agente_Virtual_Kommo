#!/usr/bin/env node
/**
 * Verifica acceso a Google Sheets y Gamma con las variables del entorno actual.
 * Uso en Hostinger (SSH o tras deploy): node scripts/verify-catalog-access.mjs
 */
import "dotenv/config";

const LUCY_URL =
  process.env.LUCY_URL?.replace(/\/$/, "") ||
  process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://midnightblue-mosquito-424375.hostingersite.com";

function mask(value) {
  if (!value) return "(no configurada)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function extractSheetId(value) {
  if (!value) return null;
  if (/^[a-zA-Z0-9-_]{20,}$/.test(value) && !value.startsWith("http")) return value;
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

function buildSheetsUrl() {
  const direct =
    process.env.GOOGLE_SHEETS_CATALOG_CSV_URL?.trim() ||
    process.env.GOOGLE_SHEETS_PRECIOS_CSV_URL?.trim();
  if (direct) return direct;

  const precios = process.env.GOOGLE_SHEETS_PRECIOS?.trim();
  if (precios?.includes("export?format=csv")) return precios;

  const id =
    extractSheetId(process.env.GOOGLE_SHEETS_CATALOG_ID) ||
    extractSheetId(process.env.GOOGLE_SHEETS_PRECIOS) ||
    "1s3DGZZXm3VXxqxyq1cKDnD3DfhGUrVw6ZkpYuN5_pBQ";
  if (!id) return null;

  const sheetName = process.env.GOOGLE_SHEETS_CATALOG_SHEET_NAME?.trim();
  const gvizBase = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
  if (sheetName) return `${gvizBase}&sheet=${encodeURIComponent(sheetName)}`;
  return gvizBase;
}

async function probe(name, url, headers = {}) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      bytes: text.length,
      preview: text.replace(/\s+/g, " ").trim().slice(0, 120),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log("=== Verificación catálogo Lucy ===\n");
  console.log("Variables detectadas:");
  console.log("  GOOGLE_SHEETS_PRECIOS:", mask(process.env.GOOGLE_SHEETS_PRECIOS));
  console.log("  GOOGLE_SHEETS_CATALOG_ID:", mask(process.env.GOOGLE_SHEETS_CATALOG_ID));
  console.log("  GAMMA_API_KEY:", mask(process.env.GAMMA_API_KEY));
  console.log("  GAMMA_CATALOG_URL:", process.env.GAMMA_CATALOG_URL || "(no configurada)");
  console.log("  GAMMA_CATALOG_TEXT_URL:", process.env.GAMMA_CATALOG_TEXT_URL ? "(configurada)" : "(no configurada)");
  console.log();

  const sheetsUrl = buildSheetsUrl();
  if (sheetsUrl) {
    console.log("Sheets CSV:", sheetsUrl.replace(/\/d\/[^/]+/, "/d/***"));
    const sheets = await probe("sheets", sheetsUrl);
    console.log("  Resultado:", sheets.ok ? `OK (${sheets.bytes} bytes)` : `FALLO ${sheets.status ?? sheets.error}`);
    if (sheets.preview) console.log("  Preview:", sheets.preview);
  } else {
    console.log("Sheets: sin URL — configura GOOGLE_SHEETS_PRECIOS o GOOGLE_SHEETS_CATALOG_ID");
  }
  console.log();

  const gammaKey = process.env.GAMMA_API_KEY?.trim();
  const gammaUrl = process.env.GAMMA_CATALOG_URL?.trim();
  const gammaId =
    process.env.GAMMA_CATALOG_GAMMA_ID?.trim() ||
    gammaUrl?.match(/gamma\.app\/docs\/[^/?#]+-([a-z0-9]+)/i)?.[1];

  if (gammaKey && gammaId) {
    const metaUrl = `https://public-api.gamma.app/v1.0/gammas/${gammaId}`;
    console.log("Gamma API:", metaUrl);
    const gamma = await probe("gamma", metaUrl, { "X-API-KEY": gammaKey, Accept: "application/json" });
    console.log("  Resultado:", gamma.ok ? `OK (${gamma.bytes} bytes)` : `FALLO ${gamma.status ?? gamma.error}`);
    if (gamma.preview) console.log("  Preview:", gamma.preview);
  } else {
    console.log("Gamma API: falta GAMMA_API_KEY o ID/URL del catálogo");
  }

  const textUrl = process.env.GAMMA_CATALOG_TEXT_URL?.trim();
  if (textUrl) {
    console.log("\nGamma texto:", textUrl.slice(0, 60) + "…");
    const text = await probe("gamma-text", textUrl);
    console.log("  Resultado:", text.ok ? `OK (${text.bytes} bytes)` : `FALLO ${text.status ?? text.error}`);
  }

  console.log("\n--- API Lucy en producción ---");
  const health = await probe("health", `${LUCY_URL}/api/health`);
  console.log("GET /api/health:", health.ok ? "OK" : `FALLO ${health.status ?? health.error}`);
  if (health.preview) console.log("  Preview:", health.preview);

  const catalog = await probe("catalog", `${LUCY_URL}/api/catalog/status`);
  console.log("GET /api/catalog/status:", catalog.ok ? "OK" : `FALLO ${catalog.status ?? catalog.error}`);
  if (catalog.preview) console.log("  Preview:", catalog.preview);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
