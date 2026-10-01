/**
 * Sincroniza los catálogos de bodasesor.com/catalogos (presentaciones Gamma incrustadas)
 * con Aprendizaje: exporta cada Gamma a PDF por API, extrae el texto y lo guarda como
 * documento "web:{slug}". Lo de la web manda sobre el PDF subido a mano del mismo catálogo
 * (el manual queda de respaldo, no se borra).
 *
 * Solo exporta lo que cambió en Gamma (updatedTime) — la primera corrida exporta todo.
 * Activo si existe GAMMA_API_KEY; LUCY_CATALOG_WEB_SYNC=0 lo apaga.
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadCatalogEmbeds, type CatalogEmbedEntry } from "./catalogWebKnowledge.js";
import { extractPlainTextFromPdf } from "./pdfTextExtract.js";
import { getLucyDataRoot } from "../lib/lucyDataPaths.js";
import { logger } from "../lib/logger.js";

const GAMMA_API = "https://public-api.gamma.app/v1.0";
const MIN_TEXT_CHARS = 200;
const SYNC_HOUR_MX = 3;
const MANUAL_COOLDOWN_MS = 10 * 60 * 1000;

export interface CatalogWebSyncSlugState {
  updatedTime: string | null;
  syncedAt: string;
  chars: number;
  error?: string;
}

export interface CatalogWebSyncResult {
  exported: string[];
  unchanged: string[];
  failed: Array<{ slug: string; error: string }>;
}

const status = {
  running: false,
  trigger: null as "cron" | "manual" | "startup" | null,
  current: null as string | null,
  lastStartedAt: null as string | null,
  lastFinishedAt: null as string | null,
  lastManualAt: null as string | null,
  lastResult: null as { exported: number; unchanged: number; failed: number; failedSlugs: string[] } | null,
  lastError: null as string | null,
};

export function isCatalogWebSyncEnabled(): boolean {
  if (!process.env["GAMMA_API_KEY"]?.trim()) return false;
  const raw = (process.env["LUCY_CATALOG_WEB_SYNC"] ?? "1").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

export function getCatalogWebSyncStatus() {
  return { enabled: isCatalogWebSyncEnabled(), schedule: `diario ${SYNC_HOUR_MX}:00 CDMX`, ...status };
}

function statePath(): string {
  return join(getLucyDataRoot(), "catalog-web-sync.json");
}

export function readCatalogWebSyncState(path = statePath()): Record<string, CatalogWebSyncSlugState> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, CatalogWebSyncSlugState>;
  } catch {
    return {};
  }
}

async function writeState(state: Record<string, CatalogWebSyncSlugState>, path = statePath()): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 1), "utf8");
  } catch (err) {
    logger.warn({ err }, "catalogWebSync: no se pudo guardar el estado");
  }
}

export interface CatalogWebSyncDeps {
  fetchImpl?: typeof fetch;
  embeds?: CatalogEmbedEntry[];
  extractText?: (pdf: Buffer) => Promise<string>;
  saveDoc?: (input: { slug: string; title: string; content: string }) => Promise<void>;
  docExists?: (slug: string) => Promise<boolean>;
  statePath?: string;
  apiKey?: string;
  pollMs?: number;
}

async function gammaUpdatedTime(f: typeof fetch, key: string, gammaId: string): Promise<string | null> {
  const res = await f(`${GAMMA_API}/gammas/${encodeURIComponent(gammaId)}`, {
    headers: { "X-API-KEY": key, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`meta_http_${res.status}`);
  const data = (await res.json()) as { updatedTime?: string | null };
  return typeof data.updatedTime === "string" ? data.updatedTime : null;
}

async function exportGammaPdf(f: typeof fetch, key: string, gammaId: string, pollMs: number): Promise<Buffer> {
  const start = await f(`${GAMMA_API}/gammas/${encodeURIComponent(gammaId)}/export`, {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ exportAs: "pdf" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!start.ok) throw new Error(`export_http_${start.status}`);
  const { exportId } = (await start.json()) as { exportId?: string };
  if (!exportId) throw new Error("export_no_id");

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, pollMs));
    const poll = await f(`${GAMMA_API}/exports/${encodeURIComponent(exportId)}`, {
      headers: { "X-API-KEY": key, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!poll.ok) continue;
    const s = (await poll.json()) as { status?: string; exportUrl?: string; url?: string; downloadUrl?: string };
    if (s.status === "failed") throw new Error("export_failed");
    const url = s.exportUrl || s.url || s.downloadUrl;
    if (s.status === "completed" && url) {
      // La URL de descarga es secreta (cualquiera la puede bajar): nunca se registra en logs.
      const file = await f(url, { signal: AbortSignal.timeout(60_000) });
      if (!file.ok) throw new Error(`download_http_${file.status}`);
      return Buffer.from(await file.arrayBuffer());
    }
  }
  throw new Error("export_timeout");
}

/** Una corrida completa (o solo `slugs`). `force` re-exporta aunque Gamma no haya cambiado. */
export async function syncWebCatalogs(
  opts: { force?: boolean; slugs?: string[]; trigger?: "cron" | "manual" | "startup" } = {},
  deps: CatalogWebSyncDeps = {}
): Promise<CatalogWebSyncResult> {
  const result: CatalogWebSyncResult = { exported: [], unchanged: [], failed: [] };
  const key = deps.apiKey ?? process.env["GAMMA_API_KEY"]?.trim() ?? "";
  if (!key) throw new Error("gamma_api_key_missing");
  if (status.running) throw new Error("already_running");

  const f = deps.fetchImpl ?? fetch;
  const extract =
    deps.extractText ?? (async (pdf: Buffer) => (await extractPlainTextFromPdf({ buffer: pdf })).text);
  const save =
    deps.saveDoc ??
    (async (input: { slug: string; title: string; content: string }) => {
      const { upsertWebCatalogDocument } = await import("./lucyInfoStore.js");
      await upsertWebCatalogDocument(input);
    });
  const exists =
    deps.docExists ??
    (async (slug: string) => {
      const { webCatalogDocExists } = await import("./lucyInfoStore.js");
      return webCatalogDocExists(slug);
    });
  const path = deps.statePath ?? statePath();
  const state = readCatalogWebSyncState(path);
  const embeds = (deps.embeds ?? loadCatalogEmbeds()).filter(
    (e) => e.gammaId && (!opts.slugs?.length || opts.slugs.includes(e.slug))
  );

  status.running = true;
  status.trigger = opts.trigger ?? "manual";
  status.lastStartedAt = new Date().toISOString();
  status.lastError = null;
  try {
    for (const e of embeds) {
      status.current = e.slug;
      const prev = state[e.slug];
      try {
        const updatedTime = await gammaUpdatedTime(f, key, e.gammaId!);
        if (
          !opts.force &&
          prev &&
          !prev.error &&
          updatedTime &&
          prev.updatedTime === updatedTime &&
          (await exists(e.slug))
        ) {
          result.unchanged.push(e.slug);
          continue;
        }
        const pdf = await exportGammaPdf(f, key, e.gammaId!, deps.pollMs ?? 5000);
        const text = (await extract(pdf)).trim();
        if (text.length < MIN_TEXT_CHARS) throw new Error("pdf_text_too_short");
        await save({ slug: e.slug, title: e.title, content: text });
        state[e.slug] = { updatedTime, syncedAt: new Date().toISOString(), chars: text.length };
        result.exported.push(e.slug);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        // Se conserva el texto anterior (web o manual); solo se anota el error.
        state[e.slug] = {
          updatedTime: prev?.updatedTime ?? null,
          syncedAt: prev?.syncedAt ?? new Date().toISOString(),
          chars: prev?.chars ?? 0,
          error,
        };
        result.failed.push({ slug: e.slug, error });
      }
    }
    await writeState(state, path);
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    status.running = false;
    status.current = null;
    status.lastFinishedAt = new Date().toISOString();
    status.lastResult = {
      exported: result.exported.length,
      unchanged: result.unchanged.length,
      failed: result.failed.length,
      failedSlugs: result.failed.map((x) => x.slug).slice(0, 20),
    };
  }
  logger.info(
    { exported: result.exported.length, unchanged: result.unchanged.length, failed: result.failed },
    "catalogWebSync: corrida terminada"
  );
  return result;
}

/** Botón del panel: en segundo plano, con espera mínima entre corridas manuales. */
export function triggerManualCatalogWebSync(): { started: boolean; reason?: string } {
  if (!isCatalogWebSyncEnabled()) return { started: false, reason: "disabled" };
  if (status.running) return { started: false, reason: "already_running" };
  const last = status.lastManualAt ? Date.parse(status.lastManualAt) : 0;
  if (Date.now() - last < MANUAL_COOLDOWN_MS) return { started: false, reason: "cooldown" };
  status.lastManualAt = new Date().toISOString();
  void syncWebCatalogs({ trigger: "manual" }).catch((err) =>
    logger.warn({ err }, "catalogWebSync manual falló")
  );
  return { started: true };
}

export function mexicoCityHourAndDay(now = new Date()): { hour: number; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hour: Number(get("hour")), day: `${get("year")}-${get("month")}-${get("day")}` };
}

/** ¿Toca la corrida nocturna? (3 a.m. CDMX, una vez por día). */
export function isNightlySyncDue(now: Date, lastCronDay: string | null): boolean {
  const { hour, day } = mexicoCityHourAndDay(now);
  return hour === SYNC_HOUR_MX && lastCronDay !== day;
}

let schedulerStarted = false;

export function startCatalogWebSyncScheduler(): void {
  if (schedulerStarted || !isCatalogWebSyncEnabled()) return;
  schedulerStarted = true;
  let lastCronDay: string | null = null;

  // Primera vez (sin estado guardado): no esperar a la noche.
  setTimeout(() => {
    if (Object.keys(readCatalogWebSyncState()).length > 0) return;
    void syncWebCatalogs({ trigger: "startup" }).catch((err) =>
      logger.warn({ err }, "catalogWebSync inicial falló")
    );
  }, 5 * 60 * 1000);

  setInterval(() => {
    const now = new Date();
    if (!isNightlySyncDue(now, lastCronDay)) return;
    lastCronDay = mexicoCityHourAndDay(now).day;
    void syncWebCatalogs({ trigger: "cron" }).catch((err) =>
      logger.warn({ err }, "catalogWebSync nocturno falló")
    );
  }, 10 * 60 * 1000);
}
