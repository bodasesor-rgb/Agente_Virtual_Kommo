/**
 * Reparaciones → Cursor Cloud Agents API (v1).
 *
 * Flujo: lanzar agente (rama + PR) → seguir el run en vivo (SSE + sondeo) → «Listo para
 * publicar» → botón Publicar (follow-up: rebase, build, pruebas, push a main) → Publicado.
 * Historial en lucy-data/repair-runs.json (sobrevive redeploy).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { getLucyRepairRunsPath } from "../lib/lucyDataPaths.js";
import { logger } from "../lib/logger.js";
import {
  cleanupLucyRepairBacklog,
  dismissLucyRepair,
  markLucyRepairsInProgress,
  releaseLucyRepairs,
  repairSignature,
  resolveLucyRepair,
  stripRepairDayPrefix,
  type LucyRepairDto,
} from "./lucyRepairStore.js";

export type RepairJobStatus =
  | "creating"
  | "running"
  | "fix_ready"
  | "no_changes"
  | "publishing"
  | "published"
  | "error"
  | "cancelled"
  | "discarded";

export interface RepairJobStep {
  at: string;
  text: string;
}

export interface RepairOutcomeItem {
  ids: string[];
  text: string;
}

export interface RepairJobOutcome {
  fixed: RepairOutcomeItem[];
  falsePositive: RepairOutcomeItem[];
  notFixed: RepairOutcomeItem[];
  tests?: string;
}

export interface RepairJobProblem {
  category: string;
  label: string;
  count: number;
}

export interface RepairJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RepairJobStatus;
  agentId: string;
  agentUrl?: string;
  runId: string;
  publishRunId?: string;
  repairIds: string[];
  problems: RepairJobProblem[];
  branch?: string;
  prUrl?: string;
  summary?: string;
  outcome?: RepairJobOutcome;
  steps: RepairJobStep[];
  error?: string;
  finishedAt?: string;
  publishRequestedAt?: string;
  publishedAt?: string;
  liveAt?: string;
  durationMs?: number;
  model?: string;
  lastEventId?: string;
  publishLastEventId?: string;
  streamExpired?: boolean;
}

const ACTIVE: ReadonlySet<RepairJobStatus> = new Set(["creating", "running", "publishing"]);
const MAX_STEPS = 30;
const MAX_JOBS_KEPT = 60;
const BOOTED_AT = new Date();

const DEFAULT_REPO = "https://github.com/bodasesor-rgb/Agente_Virtual_Kommo";

function apiKey(): string {
  return process.env["CURSOR_API_KEY"]?.trim() ?? "";
}

function apiBase(): string {
  return (process.env["CURSOR_API_BASE"]?.trim() || "https://api.cursor.com").replace(/\/+$/, "");
}

function repoUrl(): string {
  return process.env["LUCY_REPAIR_REPO_URL"]?.trim() || DEFAULT_REPO;
}

const DEFAULT_MAX_JOBS_PER_DAY = 12;
const DEFAULT_MAX_PROBLEMS = 12;
const DEFAULT_MODEL = "composer-2.5";

function maxJobsPerDay(): number {
  const n = Number(process.env["LUCY_REPAIR_MAX_JOBS_PER_DAY"] ?? DEFAULT_MAX_JOBS_PER_DAY);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_JOBS_PER_DAY;
}

function requestedModel(): string {
  return process.env["LUCY_REPAIR_MODEL"]?.trim() || DEFAULT_MODEL;
}

function autoPublish(): boolean {
  return /^(1|true|si|sí|yes)$/i.test(process.env["LUCY_REPAIR_AUTO_PUBLISH"]?.trim() ?? "");
}

export function isCursorAgentConfigured(): boolean {
  return apiKey().length > 0;
}

// ── Persistencia ──────────────────────────────────────────────────────────────

let jobs: RepairJob[] | null = null;

function loadJobs(): RepairJob[] {
  if (jobs) return jobs;
  const path = getLucyRepairRunsPath();
  try {
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as { jobs?: RepairJob[] };
      jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
    } else {
      jobs = [];
    }
  } catch (err) {
    logger.warn({ err }, "cursorRepairAgent: no se pudo leer repair-runs.json");
    jobs = [];
  }
  return jobs;
}

function saveJobs(): void {
  const list = loadJobs();
  if (list.length > MAX_JOBS_KEPT) list.splice(0, list.length - MAX_JOBS_KEPT);
  const path = getLucyRepairRunsPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ savedAt: new Date().toISOString(), jobs: list }, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err }, "cursorRepairAgent: no se pudo guardar repair-runs.json");
  }
}

function touch(job: RepairJob, patch: Partial<RepairJob>): void {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  saveJobs();
}

function addStep(job: RepairJob, text: string): void {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!clean) return;
  if (job.steps[job.steps.length - 1]?.text === clean) return;
  job.steps.push({ at: new Date().toISOString(), text: clean });
  if (job.steps.length > MAX_STEPS) job.steps.splice(0, job.steps.length - MAX_STEPS);
  job.updatedAt = new Date().toISOString();
}

export function listRepairJobs(limit = 20): RepairJob[] {
  return [...loadJobs()].reverse().slice(0, limit);
}

export function getRepairJob(id: string): RepairJob | undefined {
  return loadJobs().find((j) => j.id === id);
}

/** Reparaciones que un trabajo vivo (o listo para publicar) tiene tomadas. */
export function trackedRepairIds(): Set<string> {
  const ids = new Set<string>();
  for (const j of loadJobs()) {
    if (ACTIVE.has(j.status) || j.status === "fix_ready") for (const id of j.repairIds) ids.add(id);
  }
  return ids;
}

// ── API Cursor ────────────────────────────────────────────────────────────────

class CursorApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${apiKey()}:`).toString("base64")}`;
}

async function cursorApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string }; code?: string; message?: string }) ?? {};
    const code = err.error?.code ?? err.code ?? `http_${res.status}`;
    const message = err.error?.message ?? err.message ?? text.slice(0, 200);
    throw new CursorApiError(res.status, code, message || `HTTP ${res.status}`);
  }
  return data as T;
}

type ApiModel = {
  id: string;
  displayName?: string;
  aliases?: string[];
  parameters?: Array<{ id: string; values?: Array<{ value: string }> }>;
};

export type RepairModelSelection = { id: string; params?: Array<{ id: string; value: string }> };

let modelCache: { key: string; at: number; selection: RepairModelSelection | null } | null = null;

function normModelName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9.]/g, "");
}

/**
 * `GET /v1/models` da los ids válidos; si el pedido no existe se usa el modelo por defecto
 * de la cuenta en vez de fallar al crear el agente. «fast» cuesta más: por defecto apagado.
 */
async function resolveRepairModel(): Promise<RepairModelSelection | null> {
  const wanted = requestedModel();
  const fast = (process.env["LUCY_REPAIR_MODEL_FAST"]?.trim() || "false").toLowerCase();
  const key = `${wanted}|${fast}`;
  const ttl = modelCache?.selection ? 6 * 60 * 60 * 1000 : 10 * 60 * 1000;
  if (modelCache && modelCache.key === key && Date.now() - modelCache.at < ttl) return modelCache.selection;

  let selection: RepairModelSelection | null = null;
  try {
    const { items = [] } = await cursorApi<{ items?: ApiModel[] }>("/v1/models");
    const w = normModelName(wanted);
    const names = (m: ApiModel) => [m.id, ...(m.aliases ?? [])].map(normModelName);
    const model =
      items.find((m) => names(m).includes(w)) ??
      items.find((m) => [...names(m), normModelName(m.displayName ?? "")].some((n) => n.startsWith(w)));
    if (model) {
      const fastParam = model.parameters?.find((p) => p.id === "fast");
      const allowed = fastParam?.values?.some((v) => v.value === fast);
      selection = { id: model.id, ...(fastParam && allowed ? { params: [{ id: "fast", value: fast }] } : {}) };
    } else {
      logger.warn({ wanted, available: items.map((m) => m.id) }, "Modelo de reparaciones no disponible — uso el default");
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "No pude listar modelos de Cursor — uso el default");
  }
  modelCache = { key, at: Date.now(), selection };
  return selection;
}

type ApiRun = {
  id: string;
  status: string;
  result?: string;
  durationMs?: number;
  git?: { branches?: Array<{ repoUrl?: string; branch?: string; prUrl?: string }> };
};

// ── Prompts ───────────────────────────────────────────────────────────────────

function groupProblems(repairs: LucyRepairDto[]): Array<{ sig: string; items: LucyRepairDto[] }> {
  const groups = new Map<string, LucyRepairDto[]>();
  for (const r of repairs) {
    const sig = repairSignature(r.category, r.evidence);
    const list = groups.get(sig) ?? [];
    list.push(r);
    groups.set(sig, list);
  }
  return [...groups.entries()]
    .map(([sig, items]) => ({ sig, items }))
    .sort((a, b) => b.items.length - a.items.length);
}

export function buildRepairPrompt(repairs: LucyRepairDto[]): string {
  const groups = groupProblems(repairs);
  const blocks = groups.map((g, i) => {
    const first = g.items[0]!;
    const examples = g.items
      .slice(0, 3)
      .map((r) => `   - lead ${r.kommoLeadId ?? "?"}: ${stripRepairDayPrefix(r.evidence).slice(0, 300)}`)
      .join("\n");
    return [
      `${i + 1}. [${first.category} · ${first.severity}] visto en ${g.items.length} conversación(es)`,
      `   Propuesta del supervisor: ${first.proposedRepair}`,
      `   Ejemplos:`,
      examples,
      `   ids: ${g.items.map((r) => r.id).join(", ")}`,
    ].join("\n");
  });

  return `Eres el agente de reparaciones de Lucy, la vendedora virtual de Bodasesor en WhatsApp (Kommo).
El supervisor automático encontró estos problemas en conversaciones reales. Arréglalos en el código.

PROBLEMAS
${blocks.join("\n\n")}

DÓNDE ESTÁ EL CÓDIGO
- api-server/src: lucy-flow-guards.ts (reglas sobre la respuesta), lucyOutboundPipeline.ts (paso final),
  conversation-understanding.ts y contact-name.ts (lectura de datos del cliente), services/ (catálogo, CRM, imágenes),
  services/lucyAuditorHeuristics.ts (reglas del supervisor).
- Pruebas: api-server/src/selftest/ (lucy-flow-selftest.ts y *-smoke.ts).

REGLAS
1. Arreglo general en código, no un parche para un lead específico. No escribas a clientes ni toques Kommo.
2. Si un hallazgo es un falso positivo del supervisor, corrige la regla en lucyAuditorHeuristics.ts o repórtalo como falso positivo.
3. Agrega o amplía un smoke en api-server/src/selftest/ que reproduzca cada problema arreglado.
4. Dependencias (como .github/workflows/deploy-hostinger.yml): cp package.json /tmp/pkg.json && cp package.development.json package.json && npm install && cp /tmp/pkg.json package.json. No commitees package.json modificado.
5. Pruebas obligatorias, todas deben pasar:
   cd api-server && npx --yes tsx ./src/selftest/lucy-flow-selftest.ts
   y cada smoke que toques: npx --yes tsx ./src/selftest/<nombre>-smoke.ts
6. Compila: cd api-server && npm run build. Esto actualiza api-server/dist/ y deploy/ — commitea ambos, sin eso el servidor no cambia.
7. No toques lucy-data/, hostinger-relay/ ni archivos .env. No hagas push a main en este paso: deja tu rama y el PR.

AL TERMINAR
Tu último mensaje debe terminar con este bloque JSON (en español simple, para el dueño del negocio):
\`\`\`json
{"fixed":[{"ids":["<id>"],"text":"qué cambió y qué hará Lucy distinto"}],
 "falsePositive":[{"ids":["<id>"],"text":"por qué no era un error"}],
 "notFixed":[{"ids":["<id>"],"text":"por qué no se pudo"}],
 "tests":"qué pruebas corriste y resultado"}
\`\`\``;
}

export const PUBLISH_PROMPT = `El dueño aprobó publicar este arreglo. Pásalo a main:
1. git fetch origin main && git rebase origin/main (o merge si el rebase se complica).
2. Si hay conflictos en api-server/dist/ o deploy/, toma la versión de main para esos archivos y vuelve a compilar: cd api-server && npm run build.
3. Vuelve a correr cd api-server && npx --yes tsx ./src/selftest/lucy-flow-selftest.ts y los smokes que tocaste. Si algo falla, NO publiques.
4. Commitea dist/ y deploy/ actualizados y haz git push origin HEAD:main (sin force-push).
Tu último mensaje debe terminar con:
\`\`\`json
{"published":true,"commit":"<sha corto>","text":"resumen corto"}
\`\`\`
o, si no se pudo: {"published":false,"text":"motivo"}`;

// ── Lectura del resultado del agente ─────────────────────────────────────────

function lastJsonBlock(text: string): Record<string, unknown> | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]!.trim());
  const candidates = fenced.length ? fenced.reverse() : [];
  const braceStart = text.lastIndexOf("{\"");
  if (braceStart >= 0) candidates.push(text.slice(braceStart));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

function outcomeItems(raw: unknown, knownIds: Set<string>): RepairOutcomeItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RepairOutcomeItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const ids = [
      ...(Array.isArray(o["ids"]) ? (o["ids"] as unknown[]) : []),
      ...(typeof o["id"] === "string" ? [o["id"]] : []),
    ]
      .map((x) => String(x).trim())
      .filter((x) => knownIds.has(x));
    const text = String(o["text"] ?? o["applied"] ?? o["reason"] ?? "").trim();
    if (ids.length) out.push({ ids, text: text.slice(0, 1500) });
  }
  return out;
}

export function parseRepairOutcome(text: string, repairIds: string[]): RepairJobOutcome | null {
  const json = lastJsonBlock(text);
  if (!json) return null;
  const known = new Set(repairIds);
  return {
    fixed: outcomeItems(json["fixed"], known),
    falsePositive: outcomeItems(json["falsePositive"], known),
    notFixed: outcomeItems(json["notFixed"], known),
    tests: typeof json["tests"] === "string" ? json["tests"].slice(0, 500) : undefined,
  };
}

export function parsePublishOutcome(text: string): { published: boolean; commit?: string; text?: string } {
  const json = lastJsonBlock(text);
  if (json && typeof json["published"] === "boolean") {
    return {
      published: json["published"],
      commit: typeof json["commit"] === "string" ? json["commit"].slice(0, 40) : undefined,
      text: typeof json["text"] === "string" ? json["text"].slice(0, 500) : undefined,
    };
  }
  return { published: false, text: "El agente no confirmó la publicación." };
}

function summarize(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const withoutJson = text.replace(/```[\s\S]*?```/g, "").trim();
  return (withoutJson || text).slice(0, 1200);
}

// ── Pasos en vivo (tool_call → texto legible) ────────────────────────────────

function baseName(p: unknown): string {
  return typeof p === "string" ? p.split(/[\\/]/).pop() ?? p : "";
}

export function describeToolCall(name: string, args: unknown): string {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const file = baseName(a["path"] ?? a["target_file"] ?? a["file_path"] ?? a["filePath"] ?? a["file"]);
  const cmd = String(a["command"] ?? a["cmd"] ?? "");
  const n = name.toLowerCase();
  if (/read|view|open/.test(n) && file) return `Leyendo ${file}`;
  if (/edit|write|replace|patch|create|delete/.test(n)) return file ? `Editando ${file}` : "Editando código";
  if (/terminal|shell|command|bash|run/.test(n) && cmd) {
    if (/selftest|smoke/.test(cmd)) return "Corriendo pruebas";
    if (/npm run build|build\.mjs/.test(cmd)) return "Compilando (build)";
    if (/npm (ci|install)|pnpm install/.test(cmd)) return "Instalando dependencias";
    if (/git push/.test(cmd)) return "Subiendo cambios a GitHub";
    if (/git commit/.test(cmd)) return "Guardando cambios (commit)";
    if (/git (rebase|merge|fetch)/.test(cmd)) return "Juntando con la versión actual (main)";
    return `Terminal: ${cmd.slice(0, 70)}`;
  }
  if (/grep|search|glob|find|list/.test(n)) {
    const q = String(a["pattern"] ?? a["query"] ?? a["glob_pattern"] ?? "").slice(0, 50);
    return q ? `Buscando «${q}»` : "Buscando en el código";
  }
  return name;
}

// ── Seguimiento en vivo (SSE) ─────────────────────────────────────────────────

const streams = new Map<string, AbortController>();

function handleStreamEvent(job: RepairJob, runId: string, event: string, data: string, id?: string): void {
  const isPublish = runId === job.publishRunId;
  if (id) {
    if (isPublish) job.publishLastEventId = id;
    else job.lastEventId = id;
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }
  if (event === "status" && payload["status"] === "RUNNING" && job.status === "creating") {
    job.status = "running";
    addStep(job, "El agente empezó a trabajar");
  } else if (event === "tool_call" && payload["status"] === "running") {
    addStep(job, describeToolCall(String(payload["name"] ?? ""), payload["args"]));
  } else if (event === "result") {
    void applyRunTerminal(job, runId, {
      id: runId,
      status: String(payload["status"] ?? ""),
      result: typeof payload["text"] === "string" ? payload["text"] : undefined,
      durationMs: typeof payload["durationMs"] === "number" ? payload["durationMs"] : undefined,
      git: payload["git"] as ApiRun["git"],
    });
    return;
  }
  saveJobs();
}

async function followStream(job: RepairJob, runId: string): Promise<void> {
  if (streams.has(runId) || job.streamExpired) return;
  const ctrl = new AbortController();
  streams.set(runId, ctrl);
  const lastId = runId === job.publishRunId ? job.publishLastEventId : job.lastEventId;
  try {
    const res = await fetch(`${apiBase()}/v1/agents/${job.agentId}/runs/${runId}/stream`, {
      headers: {
        Authorization: authHeader(),
        Accept: "text/event-stream",
        ...(lastId ? { "Last-Event-ID": lastId } : {}),
      },
      signal: ctrl.signal,
    });
    if (res.status === 410) {
      touch(job, { streamExpired: true });
      return;
    }
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
        let event = "message";
        let id: string | undefined;
        const dataLines: string[] = [];
        for (const line of raw.split(/\r?\n/)) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("id:")) id = line.slice(3).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (event === "done") return;
        if (dataLines.length) handleStreamEvent(job, runId, event, dataLines.join("\n"), id);
      }
    }
  } catch (err) {
    if (!ctrl.signal.aborted) logger.debug({ err, runId }, "cursorRepairAgent: stream cortado");
  } finally {
    streams.delete(runId);
  }
}

// ── Transiciones ──────────────────────────────────────────────────────────────

function pickBranch(run: ApiRun): { branch?: string; prUrl?: string } {
  const branches = run.git?.branches ?? [];
  const repo = repoUrl().replace(/^https?:\/\//, "").replace(/\.git$/, "").toLowerCase();
  const b = branches.find((x) => (x.repoUrl ?? "").toLowerCase().includes(repo)) ?? branches[0];
  return { branch: b?.branch, prUrl: b?.prUrl };
}

const applying = new Set<string>();

async function applyRunTerminal(job: RepairJob, runId: string, run: ApiRun): Promise<void> {
  const key = `${job.id}:${runId}`;
  if (applying.has(key)) return;
  const isPublish = runId === job.publishRunId;
  if (isPublish ? job.status !== "publishing" : job.status !== "creating" && job.status !== "running") return;
  applying.add(key);
  try {
    streams.get(runId)?.abort();
    const status = run.status.toUpperCase();
    const { branch, prUrl } = pickBranch(run);

    if (isPublish) {
      if (status === "FINISHED") {
        const pub = parsePublishOutcome(run.result ?? "");
        if (pub.published) {
          addStep(job, `Publicado en main${pub.commit ? ` (${pub.commit})` : ""}`);
          touch(job, { status: "published", publishedAt: new Date().toISOString(), error: undefined });
          await resolvePublishedRepairs(job);
          return;
        }
        touch(job, { status: "fix_ready", error: pub.text ?? "No se pudo publicar." });
        return;
      }
      touch(job, { status: "fix_ready", error: `La publicación terminó en ${status}.` });
      return;
    }

    if (status === "FINISHED") {
      const outcome = parseRepairOutcome(run.result ?? "", job.repairIds) ?? undefined;
      const summary = summarize(run.result);
      if (outcome) {
        for (const fp of outcome.falsePositive) {
          for (const id of fp.ids) {
            await dismissLucyRepair(id, "cursor-agent", `Falso positivo (agente Cursor): ${fp.text}`);
          }
        }
        const notFixedIds = outcome.notFixed.flatMap((x) => x.ids);
        if (notFixedIds.length) await releaseLucyRepairs(notFixedIds);
      }
      const hasChanges = Boolean(branch);
      if (!hasChanges) {
        const pending = job.repairIds.filter(
          (id) => !outcome?.falsePositive.some((x) => x.ids.includes(id))
        );
        await releaseLucyRepairs(pending);
      }
      addStep(job, hasChanges ? "Arreglo listo para publicar" : "Terminó sin cambios de código");
      touch(job, {
        status: hasChanges ? "fix_ready" : "no_changes",
        branch,
        prUrl,
        summary,
        outcome,
        durationMs: run.durationMs,
        finishedAt: new Date().toISOString(),
      });
      if (hasChanges && autoPublish()) await publishRepairJob(job.id).catch(() => undefined);
      return;
    }

    await releaseLucyRepairs(job.repairIds);
    touch(job, {
      status: status === "CANCELLED" ? "cancelled" : "error",
      error: status === "CANCELLED" ? undefined : `El agente terminó en ${status}.`,
      summary: summarize(run.result),
      branch,
      prUrl,
      finishedAt: new Date().toISOString(),
    });
  } finally {
    applying.delete(key);
  }
}

async function resolvePublishedRepairs(job: RepairJob): Promise<void> {
  const settled = new Set([
    ...(job.outcome?.falsePositive ?? []).flatMap((x) => x.ids),
    ...(job.outcome?.notFixed ?? []).flatMap((x) => x.ids),
  ]);
  const fixedText = new Map<string, string>();
  for (const f of job.outcome?.fixed ?? []) for (const id of f.ids) fixedText.set(id, f.text);
  for (const id of job.repairIds) {
    if (settled.has(id)) continue;
    const text =
      fixedText.get(id) || job.summary?.slice(0, 600) || "Arreglado por el agente de Cursor y publicado.";
    await resolveLucyRepair(id, text, "cursor-agent");
  }
}

// ── Acciones públicas ─────────────────────────────────────────────────────────

export class RepairJobError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 409
  ) {
    super(message);
  }
}

function jobsToday(): number {
  const day = new Date().toISOString().slice(0, 10);
  return loadJobs().filter((j) => j.createdAt.slice(0, 10) === day).length;
}

export async function launchRepairJob(repairs: LucyRepairDto[]): Promise<RepairJob> {
  if (!isCursorAgentConfigured()) {
    throw new RepairJobError("cursor_not_configured", "Falta CURSOR_API_KEY en Hostinger.", 503);
  }
  if (repairs.length === 0) throw new RepairJobError("nothing_to_send", "No hay reparaciones pendientes.", 400);
  const active = loadJobs().find((j) => ACTIVE.has(j.status));
  if (active) {
    throw new RepairJobError("job_active", "Ya hay un arreglo en curso; espera a que termine o cancélalo.");
  }
  if (jobsToday() >= maxJobsPerDay()) {
    throw new RepairJobError(
      "daily_limit",
      `Límite de ${maxJobsPerDay()} envíos a Cursor por día alcanzado (LUCY_REPAIR_MAX_JOBS_PER_DAY).`,
      429
    );
  }

  const model = await resolveRepairModel();
  const groups = groupProblems(repairs);
  const created = await cursorApi<{ agent: { id: string; url?: string }; run: { id: string } }>("/v1/agents", {
    method: "POST",
    body: {
      prompt: { text: buildRepairPrompt(repairs) },
      name: `Lucy reparaciones ${new Date().toISOString().slice(0, 10)}`,
      repos: [{ url: repoUrl(), startingRef: "main" }],
      autoCreatePR: true,
      skipReviewerRequest: true,
      ...(model ? { model } : {}),
    },
  });

  const now = new Date().toISOString();
  const job: RepairJob = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "creating",
    agentId: created.agent.id,
    agentUrl: created.agent.url,
    runId: created.run.id,
    model: model?.id ?? "default",
    repairIds: repairs.map((r) => r.id),
    problems: groups.map((g) => ({
      category: g.items[0]!.category,
      label: stripRepairDayPrefix(g.items[0]!.evidence).slice(0, 140),
      count: g.items.length,
    })),
    steps: [{ at: now, text: "Agente creado en Cursor; preparando máquina" }],
  };
  loadJobs().push(job);
  saveJobs();
  await markLucyRepairsInProgress(job.repairIds, `cursor-agent:${job.id}`);
  void followStream(job, job.runId);
  return job;
}

export async function publishRepairJob(jobId: string): Promise<RepairJob> {
  const job = getRepairJob(jobId);
  if (!job) throw new RepairJobError("not_found", "Trabajo no encontrado.", 404);
  if (job.status !== "fix_ready") {
    throw new RepairJobError("not_ready", "Solo se publica un arreglo listo.");
  }
  const created = await cursorApi<{ run: { id: string } }>(`/v1/agents/${job.agentId}/runs`, {
    method: "POST",
    body: { prompt: { text: PUBLISH_PROMPT } },
  });
  addStep(job, "Publicando: juntando con main, compilando y probando");
  touch(job, {
    status: "publishing",
    publishRunId: created.run.id,
    publishRequestedAt: new Date().toISOString(),
    publishLastEventId: undefined,
    streamExpired: false,
    error: undefined,
  });
  void followStream(job, created.run.id);
  return job;
}

export async function cancelRepairJob(jobId: string): Promise<RepairJob> {
  const job = getRepairJob(jobId);
  if (!job) throw new RepairJobError("not_found", "Trabajo no encontrado.", 404);
  if (ACTIVE.has(job.status)) {
    const runId = job.status === "publishing" ? job.publishRunId! : job.runId;
    try {
      await cursorApi(`/v1/agents/${job.agentId}/runs/${runId}/cancel`, { method: "POST" });
    } catch (err) {
      if (!(err instanceof CursorApiError && err.code === "run_not_cancellable")) throw err;
    }
    streams.get(runId)?.abort();
    if (job.status === "publishing") {
      touch(job, { status: "fix_ready", error: "Publicación cancelada." });
      return job;
    }
    await releaseLucyRepairs(job.repairIds);
    addStep(job, "Cancelado desde el panel");
    touch(job, { status: "cancelled", finishedAt: new Date().toISOString() });
    return job;
  }
  if (job.status === "fix_ready") {
    await releaseLucyRepairs(job.repairIds);
    addStep(job, "Arreglo descartado desde el panel (no se publicó)");
    touch(job, { status: "discarded", finishedAt: new Date().toISOString() });
    return job;
  }
  throw new RepairJobError("not_cancellable", "Este trabajo ya terminó.");
}

/** Sondeo: estado real de cada run activo; reengancha el stream si se cayó. */
export async function tickRepairJobs(): Promise<void> {
  if (!isCursorAgentConfigured()) return;
  for (const job of loadJobs()) {
    if (!ACTIVE.has(job.status)) continue;
    const runId = job.status === "publishing" ? job.publishRunId : job.runId;
    if (!runId) continue;
    try {
      const run = await cursorApi<ApiRun>(`/v1/agents/${job.agentId}/runs/${runId}`);
      const status = run.status.toUpperCase();
      if (["FINISHED", "ERROR", "CANCELLED", "EXPIRED"].includes(status)) {
        await applyRunTerminal(job, runId, run);
        continue;
      }
      if (status === "RUNNING" && job.status === "creating") {
        addStep(job, "El agente empezó a trabajar");
        touch(job, { status: "running" });
      }
      const { branch, prUrl } = pickBranch(run);
      if ((branch && branch !== job.branch) || (prUrl && prUrl !== job.prUrl)) {
        touch(job, { branch: branch ?? job.branch, prUrl: prUrl ?? job.prUrl });
      }
      void followStream(job, runId);
    } catch (err) {
      logger.warn({ err, jobId: job.id }, "cursorRepairAgent: sondeo falló");
      if (err instanceof CursorApiError && err.status === 404) {
        await releaseLucyRepairs(job.repairIds);
        touch(job, { status: "error", error: "Cursor ya no encuentra este agente." });
      }
    }
  }
}

/** Tras un reinicio posterior a publicar, el código nuevo ya está corriendo. */
export function markPublishedJobsLive(bootedAt: Date = BOOTED_AT): number {
  let n = 0;
  for (const job of loadJobs()) {
    if (job.status === "published" && job.publishedAt && !job.liveAt && new Date(job.publishedAt) < bootedAt) {
      job.liveAt = bootedAt.toISOString();
      job.steps.push({ at: job.liveAt, text: "Ya está activo en el servidor de Lucy" });
      n += 1;
    }
  }
  if (n) saveJobs();
  return n;
}

let timer: NodeJS.Timeout | null = null;

export function startRepairJobTracker(intervalMs = 30_000): void {
  if (timer) return;
  markPublishedJobsLive();
  timer = setInterval(() => void tickRepairJobs(), intervalMs);
  timer.unref?.();
  setTimeout(() => void tickRepairJobs(), 5_000).unref?.();
}

export function repairAgentStatusSummary(): {
  configured: boolean;
  auto_publish: boolean;
  model: string;
  max_jobs_per_day: number;
  jobs_today: number;
  active: { id: string; status: RepairJobStatus; since: string } | null;
} {
  const active = loadJobs().find((j) => ACTIVE.has(j.status) || j.status === "fix_ready");
  return {
    configured: isCursorAgentConfigured(),
    auto_publish: autoPublish(),
    model: modelCache?.selection?.id ?? requestedModel(),
    max_jobs_per_day: maxJobsPerDay(),
    jobs_today: jobsToday(),
    active: active ? { id: active.id, status: active.status, since: active.createdAt } : null,
  };
}

/**
 * Un trabajo = los problemas más repetidos (cada uno con todas sus conversaciones),
 * para que un solo arreglo cubra muchas filas del panel.
 */
export function pickRepairsForJob(pending: LucyRepairDto[]): LucyRepairDto[] {
  const maxProblems = Math.max(
    1,
    Number(process.env["LUCY_REPAIR_MAX_PROBLEMS"] ?? DEFAULT_MAX_PROBLEMS) || DEFAULT_MAX_PROBLEMS
  );
  const severityRank: Record<string, number> = { error: 0, warn: 1, info: 2 };
  const groups = groupProblems(pending).sort((a, b) => {
    const sa = Math.min(...a.items.map((r) => severityRank[r.severity] ?? 1));
    const sb = Math.min(...b.items.map((r) => severityRank[r.severity] ?? 1));
    return sa !== sb ? sa - sb : b.items.length - a.items.length;
  });
  return groups.slice(0, maxProblems).flatMap((g) => g.items.slice(0, 15));
}

export async function cleanupRepairQueue() {
  return cleanupLucyRepairBacklog({
    trackedRepairIds: trackedRepairIds(),
    staleInProgressMs: isCursorAgentConfigured() ? 30 * 60 * 1000 : 6 * 60 * 60 * 1000,
  });
}

/** Solo para smoke: reinicia el estado en memoria. */
export function __resetRepairJobsForTest(): void {
  jobs = null;
  for (const c of streams.values()) c.abort();
  streams.clear();
}
