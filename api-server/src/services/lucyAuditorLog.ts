/**
 * Memoria del auditor en lucy-data/auditor-log.json (sobrevive a reinicios y a pgdata rota):
 * - hasta qué mensaje de cada chat ya leyó Gemini (no re-gastar ni re-reportar lo viejo)
 * - historial de corridas (cobertura para el reporte de calidad)
 * - última auditoría nocturna (ventana «desde la última vez», aunque el cron llegue tarde)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureLucyDataRoot, getLucyAuditorLogPath } from "../lib/lucyDataPaths.js";
import { logger } from "../lib/logger.js";

export type AuditorRunKind = "daily" | "manual";

export interface AuditorRunRecord {
  at: string;
  kind: AuditorRunKind;
  since?: string;
  scanned: number;
  scannedChats: number;
  withLucy: number;
  flashCalls: number;
  findings: number;
  recorded: number;
  silentReviewed?: number;
  silentFindings?: number;
}

interface AuditorLogFile {
  lastDailyAt?: string;
  /** leadId → huella del último mensaje que leyó Gemini. */
  flashSeen: Record<string, { fp: string; at: string }>;
  runs: AuditorRunRecord[];
}

const MAX_RUNS = 90;
const MAX_SEEN = 3000;

function logPath(): string {
  ensureLucyDataRoot();
  return getLucyAuditorLogPath();
}

export function readAuditorLog(): AuditorLogFile {
  const path = logPath();
  if (!existsSync(path)) return { flashSeen: {}, runs: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AuditorLogFile>;
    return {
      lastDailyAt: typeof parsed.lastDailyAt === "string" ? parsed.lastDailyAt : undefined,
      flashSeen: parsed.flashSeen && typeof parsed.flashSeen === "object" ? parsed.flashSeen : {},
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    };
  } catch (err) {
    logger.warn({ err, path }, "lucyAuditorLog: no se pudo leer");
    return { flashSeen: {}, runs: [] };
  }
}

function writeAuditorLog(log: AuditorLogFile): void {
  const path = logPath();
  try {
    const seen = Object.entries(log.flashSeen);
    if (seen.length > MAX_SEEN) {
      seen.sort((a, b) => b[1].at.localeCompare(a[1].at));
      log.flashSeen = Object.fromEntries(seen.slice(0, MAX_SEEN));
    }
    log.runs = log.runs.slice(-MAX_RUNS);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(log, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err, path }, "lucyAuditorLog: no se pudo guardar");
  }
}

export function getFlashSeen(leadId: string): string | undefined {
  return readAuditorLog().flashSeen[leadId]?.fp;
}

export function markFlashSeen(leadId: string, fp: string): void {
  const log = readAuditorLog();
  log.flashSeen[leadId] = { fp, at: new Date().toISOString() };
  writeAuditorLog(log);
}

export function getLastDailyAuditAt(): Date | null {
  const at = readAuditorLog().lastDailyAt;
  const d = at ? new Date(at) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
}

export function recordAuditorRun(run: AuditorRunRecord, opts?: { daily?: boolean }): void {
  const log = readAuditorLog();
  log.runs.push(run);
  if (opts?.daily) log.lastDailyAt = run.at;
  writeAuditorLog(log);
}

export function listAuditorRuns(): AuditorRunRecord[] {
  return readAuditorLog().runs;
}
