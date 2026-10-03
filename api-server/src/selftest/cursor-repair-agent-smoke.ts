/**
 * Smoke — Reparaciones con Cursor Cloud Agents API (mock): lanzar, seguir en vivo,
 * listo para publicar, publicar, resolver; limpieza de cola. BD PGlite en carpeta temporal.
 *
 * npx --yes tsx ./src/selftest/cursor-repair-agent-smoke.ts
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "lucy-repair-agent-"));
delete process.env["DATABASE_URL"];
process.env["LUCY_DATA_DIR"] = dir;
process.env["LUCY_LOCAL_DB_PATH"] = join(dir, "pgdata");
process.env["LUCY_REPAIRS_JSON_PATH"] = join(dir, "lucy-repairs.json");
process.env["LUCY_REPAIR_RUNS_PATH"] = join(dir, "repair-runs.json");
process.env["CURSOR_API_KEY"] = "test-key";
process.env["CURSOR_API_BASE"] = "https://cursor.mock";
process.env["LUCY_REPAIR_AUTO_PUBLISH"] = "0";
delete process.env["LUCY_REPAIR_MODEL"];
delete process.env["LUCY_REPAIR_MODEL_FAST"];
process.env["LUCY_REPAIR_FALLBACK_MODEL"] = "0";

type MockRun = { status: string; result?: string; git?: unknown };
const runs = new Map<string, MockRun>();
const calls: Array<{ method: string; path: string; body?: unknown; auth?: string }> = [];
let agentSeq = 0;

function sse(events: Array<{ event: string; data: unknown; id?: string }>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) {
        controller.enqueue(
          enc.encode(`${e.id ? `id: ${e.id}\n` : ""}event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
        );
      }
      controller.close();
    },
  });
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ method, path: url.pathname, body, auth: headers["Authorization"] });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  let m: RegExpMatchArray | null;
  if (method === "GET" && url.pathname === "/v1/models") {
    return json({
      items: [
        { id: "composer-2", aliases: ["composer"] },
        {
          id: "composer-2.5",
          displayName: "Composer 2.5",
          parameters: [{ id: "fast", values: [{ value: "false" }, { value: "true" }] }],
        },
        { id: "claude-sonnet-5-5-high", displayName: "Claude Sonnet 5.5" },
      ],
    });
  }
  if (method === "POST" && url.pathname === "/v1/agents") {
    agentSeq += 1;
    const agentId = `bc-${agentSeq}`;
    const runId = `run-${agentSeq}-a`;
    runs.set(`${agentId}/${runId}`, { status: "CREATING" });
    return json({ agent: { id: agentId, url: `https://cursor.com/agents/${agentId}` }, run: { id: runId, status: "CREATING" } });
  }
  if ((m = url.pathname.match(/^\/v1\/agents\/([^/]+)\/runs\/([^/]+)\/stream$/))) {
    return new Response(
      sse([
        { event: "status", data: { runId: m[2], status: "RUNNING" } },
        { event: "tool_call", id: "1-0", data: { callId: "c1", name: "read_file", status: "running", args: { path: "api-server/src/lucy-flow-guards.ts" } } },
        { event: "tool_call", id: "2-0", data: { callId: "c2", name: "edit_file", status: "running", args: { path: "api-server/src/lucy-flow-guards.ts" } } },
        { event: "tool_call", id: "2-1", data: { callId: "c2", name: "edit_file", status: "completed", args: { path: "api-server/src/lucy-flow-guards.ts" } } },
        { event: "tool_call", id: "3-0", data: { callId: "c3", name: "run_terminal_cmd", status: "running", args: { command: "cd api-server && npx --yes tsx ./src/selftest/lucy-flow-selftest.ts" } } },
        { event: "heartbeat", data: {} },
      ]),
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    );
  }
  if (method === "POST" && (m = url.pathname.match(/^\/v1\/agents\/([^/]+)\/runs\/([^/]+)\/cancel$/))) {
    const r = runs.get(`${m[1]}/${m[2]}`);
    if (r) r.status = "CANCELLED";
    return json({ id: m[2] });
  }
  if (method === "POST" && (m = url.pathname.match(/^\/v1\/agents\/([^/]+)\/runs$/))) {
    const runId = `run-${m[1]}-pub`;
    runs.set(`${m[1]}/${runId}`, { status: "RUNNING" });
    return json({ run: { id: runId, status: "CREATING" } });
  }
  if (method === "GET" && (m = url.pathname.match(/^\/v1\/agents\/([^/]+)\/runs\/([^/]+)$/))) {
    const r = runs.get(`${m[1]}/${m[2]}`);
    if (!r) return json({ error: { code: "not_found", message: "no" } }, 404);
    return json({ id: m[2], agentId: m[1], ...r });
  }
  return json({ error: { code: "unexpected", message: url.pathname } }, 500);
}) as typeof fetch;

const store = await import("../services/lucyRepairStore.js");
const agent = await import("../services/cursorRepairAgent.js");
const { db, lucyRepairs } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Llave de duplicados: mismo problema/lead en otro día o con otro conteo = misma fila
assert.equal(
  store.normalizeDedupeKey("stuck_funnel", "1", "[2026-10-01] Pregunta «correo» repetida 3 veces."),
  store.normalizeDedupeKey("stuck_funnel", "1", "[2026-10-02] Pregunta «correo» repetida 4 veces.")
);
assert.equal(
  store.repairSignature("bad_field", "[2026-10-01] CRM Tipo de evento parece servicio/SKU: «Carpas»"),
  store.repairSignature("bad_field", "[2026-10-03] CRM Tipo de evento parece servicio/SKU: «Iluminación»")
);

// ── Pasos legibles
assert.equal(agent.describeToolCall("edit_file", { path: "a/b/lucy-flow-guards.ts" }), "Editando lucy-flow-guards.ts");
assert.equal(agent.describeToolCall("run_terminal_cmd", { command: "npm run build" }), "Compilando (build)");
assert.equal(agent.describeToolCall("run_terminal_cmd", { command: "npx tsx x-smoke.ts" }), "Corriendo pruebas");
assert.equal(agent.describeToolCall("run_terminal_cmd", { command: "git push origin HEAD:main" }), "Subiendo cambios a GitHub");

// ── Registrar hallazgos
const rec = async (lead: string, category: string, evidence: string, severity: "info" | "warn" | "error" = "error") =>
  store.recordLucyRepair({ kommoLeadId: lead, category, severity, evidence, proposedRepair: "Arreglar", status: "auto_flagged" });

assert.ok(await rec("100", "bad_field", "[2026-10-01] CRM Tipo de evento parece servicio/SKU: «Carpas»"));
assert.ok(await rec("100", "bad_field", "[2026-10-02] CRM Tipo de evento parece servicio/SKU: «Carpas»"));
assert.ok(await rec("200", "bad_field", "[2026-10-02] CRM Tipo de evento parece servicio/SKU: «Pista»"));
assert.ok(await rec("300", "repeat_reply", "[2026-10-02] Respuesta casi idéntica repetida: «hola»", "warn"));
let pending = await store.listLucyRepairs("auto_flagged", 50);
assert.equal(pending.length, 3, "el mismo problema del lead 100 en otro día no crea otra fila");

// ── Agrupar: un trabajo cubre el mismo bug en varios leads
const picked = agent.pickRepairsForJob(pending);
assert.equal(picked.length, 3);
const prompt = agent.buildRepairPrompt(picked);
assert.match(prompt, /visto en 2 conversación/);
assert.match(prompt, /npm run build/);
assert.match(prompt, /"falsePositive"/);
for (const r of picked) assert.ok(prompt.includes(r.id));
// El supervisor aprende: errores que sólo vio Gemini piden regla fija nueva.
assert.match(prompt, /lo detectó una regla fija del supervisor/);
assert.match(prompt, /lucyAuditorHeuristics\.ts que reconozca ese error/);
assert.match(prompt, /"newRules"/);
const geminiPrompt = agent.buildRepairPrompt([{ ...picked[0]!, source: "flash" }]);
assert.match(geminiPrompt, /lo detectó Gemini leyendo el chat/);
const parsedRules = agent.parseRepairOutcome(
  '```json\n{"fixed":[],"falsePositive":[],"notFixed":[],"newRules":["Detecta precio repetido"]}\n```',
  []
);
assert.deepEqual(parsedRules?.newRules, ["Detecta precio repetido"]);

// ── Lanzar
const job = await agent.launchRepairJob(picked);
assert.equal(job.status, "creating");
assert.equal(job.agentUrl, "https://cursor.com/agents/bc-1");
const create = calls.find((c) => c.method === "POST" && c.path === "/v1/agents")!;
assert.equal(create.auth, `Basic ${Buffer.from("test-key:").toString("base64")}`);
const createBody = create.body as {
  repos: Array<{ url: string; startingRef: string }>;
  autoCreatePR: boolean;
  model?: { id: string; params?: Array<{ id: string; value: string }> };
};
assert.equal(createBody.repos[0]!.startingRef, "main");
assert.deepEqual(createBody.model, { id: "composer-2.5", params: [{ id: "fast", value: "false" }] });
assert.equal(job.model, "composer-2.5");
assert.equal(createBody.autoCreatePR, true);
assert.equal((await store.listLucyRepairs("in_progress", 50)).length, 3);

await sleep(100);
let live = agent.getRepairJob(job.id)!;
assert.equal(live.status, "running", "el stream marca que ya empezó");
const stepTexts = live.steps.map((s) => s.text);
assert.ok(stepTexts.includes("Leyendo lucy-flow-guards.ts"), stepTexts.join(" | "));
assert.ok(stepTexts.includes("Editando lucy-flow-guards.ts"), stepTexts.join(" | "));
assert.ok(stepTexts.includes("Corriendo pruebas"), stepTexts.join(" | "));
assert.equal(stepTexts.filter((t) => t === "Editando lucy-flow-guards.ts").length, 1, "completed no duplica el paso");

await assert.rejects(agent.launchRepairJob(picked), (e: Error & { code?: string }) => e.code === "job_active");

// ── Termina: rama + PR + resultado JSON
const [tipoA, tipoB] = picked.filter((r) => r.category === "bad_field");
const repeat = picked.find((r) => r.category === "repeat_reply")!;
runs.set("bc-1/run-1-a", {
  status: "FINISHED",
  result:
    "Listo, arreglé el mapeo.\n```json\n" +
    JSON.stringify({
      fixed: [{ ids: [tipoA!.id, tipoB!.id], text: "Los servicios ya no se guardan como tipo de evento." }],
      falsePositive: [{ ids: [repeat.id], text: "Era un saludo corto, no repetición." }],
      notFixed: [],
      tests: "selftest 190/190",
    }) +
    "\n```",
  git: { branches: [{ repoUrl: "github.com/bodasesor-rgb/Agente_Virtual_Kommo", branch: "cursor/fix-tipo", prUrl: "https://github.com/x/pull/9" }] },
});
await agent.tickRepairJobs();
live = agent.getRepairJob(job.id)!;
assert.equal(live.status, "fix_ready");
assert.equal(live.prUrl, "https://github.com/x/pull/9");
assert.equal(live.outcome?.fixed[0]?.ids.length, 2);
assert.equal((await store.getLucyRepair(repeat.id))?.status, "dismissed", "falso positivo se descarta");
assert.equal((await store.getLucyRepair(tipoA!.id))?.status, "in_progress", "arreglado espera a publicarse");
assert.ok(agent.trackedRepairIds().has(tipoA!.id));

// ── Publicar
await agent.publishRepairJob(job.id);
assert.equal(agent.getRepairJob(job.id)!.status, "publishing");
runs.set("bc-1/run-bc-1-pub", { status: "FINISHED", result: '```json\n{"published":true,"commit":"abc1234","text":"ok"}\n```' });
await agent.tickRepairJobs();
live = agent.getRepairJob(job.id)!;
assert.equal(live.status, "published");
const resolvedA = await store.getLucyRepair(tipoA!.id);
assert.equal(resolvedA?.status, "resolved");
assert.equal(resolvedA?.appliedRepair, "Los servicios ya no se guardan como tipo de evento.");
assert.equal(agent.markPublishedJobsLive(new Date(Date.now() + 1000)), 1);
assert.ok(agent.getRepairJob(job.id)!.liveAt);

// ── Cancelar devuelve a Abiertas
assert.ok(await rec("400", "premature_close", "[2026-10-02] Cierre «ya tengo todo» tras precio"));
const one = (await store.listLucyRepairs("auto_flagged", 50)).filter((r) => r.kommoLeadId === "400");
const job2 = await agent.launchRepairJob(one);
await agent.cancelRepairJob(job2.id);
assert.equal(agent.getRepairJob(job2.id)!.status, "cancelled");
assert.equal((await store.getLucyRepair(one[0]!.id))?.status, "auto_flagged");

// ── Error del agente también devuelve a Abiertas
const job3 = await agent.launchRepairJob(one);
runs.set(`${job3.agentId}/${job3.runId}`, { status: "ERROR" });
await agent.tickRepairJobs();
assert.equal(agent.getRepairJob(job3.id)!.status, "error");
assert.equal((await store.getLucyRepair(one[0]!.id))?.status, "auto_flagged");

// ── Límite diario
process.env["LUCY_REPAIR_MAX_JOBS_PER_DAY"] = "3";
await assert.rejects(agent.launchRepairJob(one), (e: Error & { code?: string }) => e.code === "daily_limit");
delete process.env["LUCY_REPAIR_MAX_JOBS_PER_DAY"];

// ── Limpieza: duplicados con llave vieja, regla retirada, «En Cursor» huérfano
const old = new Date(Date.now() - 2 * 24 * 3600 * 1000);
await db.insert(lucyRepairs).values([
  { kommoLeadId: "500", category: "stuck_funnel", evidence: "[2026-09-28] Pregunta de embudo «correo» repetida 3 veces.", proposedRepair: "x", status: "auto_flagged", dedupeKey: "legacy-a", createdAt: old },
  { kommoLeadId: "600", category: "bad_field", evidence: "[2026-09-28] CRM Horario parece fecha: «12 de marzo»", proposedRepair: "x", status: "auto_flagged", dedupeKey: "legacy-b", createdAt: old },
  { kommoLeadId: "600", category: "bad_field", evidence: "[2026-09-29] CRM Horario parece fecha: «12 de marzo»", proposedRepair: "x", status: "auto_flagged", dedupeKey: "legacy-c" },
  { kommoLeadId: "700", category: "bad_field", evidence: "[2026-09-28] CRM Resumen IA parece truncado (612 chars): «…»", proposedRepair: "x", status: "auto_flagged", dedupeKey: "legacy-d" },
  { kommoLeadId: "800", category: "loop_links", evidence: "[2026-09-28] Lucy repitió links", proposedRepair: "x", status: "in_progress", resolvedBy: "cursor", dedupeKey: "legacy-e", updatedAt: old },
]);
const cleaned = await agent.cleanupRepairQueue();
assert.equal(cleaned.retired, 2, JSON.stringify(cleaned));
assert.equal(cleaned.duplicates, 1, JSON.stringify(cleaned));
assert.equal(cleaned.released, 1, JSON.stringify(cleaned));
const lead600 = await db.select().from(lucyRepairs).where(eq(lucyRepairs.kommoLeadId, "600"));
assert.deepEqual(lead600.map((r) => r.status).sort(), ["auto_flagged", "dismissed"]);
assert.ok(lead600.find((r) => r.status === "dismissed")?.appliedRepair?.startsWith("Descartado por limpieza"));
assert.ok(await rec("600", "bad_field", "[2026-10-02] CRM Horario parece fecha: «12 de marzo»"));
assert.equal(
  (await db.select().from(lucyRepairs).where(eq(lucyRepairs.kommoLeadId, "600"))).length,
  2,
  "tras re-llavear, el hallazgo de hoy actualiza la fila existente"
);
const again = await agent.cleanupRepairQueue();
assert.deepEqual([again.retired, again.duplicates, again.released], [0, 0, 0], "idempotente");

// ── No reparar dos veces lo mismo
const findLead = async (lead: string) =>
  (await db.select().from(lucyRepairs).where(eq(lucyRepairs.kommoLeadId, lead)))[0]!;
// Mismo bug que el arreglo publicado: conversación vieja → cerrada; posterior → vuelve a la cola.
assert.ok(await rec("900", "bad_field", "[2026-01-01] CRM Tipo de evento parece servicio/SKU: «Mesas»"));
assert.ok(await rec("901", "bad_field", "[2999-01-01] CRM Tipo de evento parece servicio/SKU: «Sillas»"));
// Mismo falso positivo que Cursor ya revisó → descartado.
assert.ok(await rec("902", "repeat_reply", "[2026-10-02] Respuesta casi idéntica repetida: «buenas»", "warn"));
const absorbed1 = await agent.cleanupRepairQueue();
assert.equal(absorbed1.covered, 1, JSON.stringify(absorbed1));
assert.equal(absorbed1.falsePositive, 1, JSON.stringify(absorbed1));
assert.equal((await findLead("900")).status, "resolved");
assert.match((await findLead("900")).appliedRepair ?? "", /Mismo problema que el arreglo publicado/);
assert.equal((await findLead("901")).status, "auto_flagged", "después del arreglo = el arreglo no bastó");
assert.equal((await findLead("902")).status, "dismissed");

// Trabajo en curso: hallazgos nuevos del mismo bug se suman a ese trabajo.
assert.ok(await rec("1000", "loop_links", "[2026-10-02] Lucy repitió el link «mocteles»"));
const job4 = await agent.launchRepairJob([await store.getLucyRepair((await findLead("1000")).id).then((r) => r!)]);
assert.ok(await rec("1001", "loop_links", "[2026-10-02] Lucy repitió el link «barra»"));
const absorbed2 = await agent.cleanupRepairQueue();
assert.equal(absorbed2.joined, 1, JSON.stringify(absorbed2));
const lead1001 = await findLead("1001");
assert.equal(lead1001.status, "in_progress");
assert.ok(agent.getRepairJob(job4.id)!.repairIds.includes(lead1001.id));
// Lo que Cursor diga de un id aplica a todo su grupo.
runs.set(`${job4.agentId}/${job4.runId}`, {
  status: "FINISHED",
  result:
    "```json\n" +
    JSON.stringify({ fixed: [], falsePositive: [{ ids: [job4.repairIds[0]], text: "No era loop." }], notFixed: [] }) +
    "\n```",
});
await agent.tickRepairJobs();
assert.equal((await findLead("1000")).status, "dismissed");
assert.equal((await findLead("1001")).status, "dismissed", "falso positivo aplica al grupo");

// Lo que Cursor no pudo arreglar no se vuelve a mandar solo por 3 días.
assert.ok(await rec("1100", "premature_close", "[2026-10-02] Lucy cerró sin fecha «x»"));
const job5 = await agent.launchRepairJob([(await store.getLucyRepair((await findLead("1100")).id))!]);
runs.set(`${job5.agentId}/${job5.runId}`, {
  status: "FINISHED",
  result:
    "```json\n" +
    JSON.stringify({ fixed: [], falsePositive: [], notFixed: [{ ids: [job5.repairIds[0]], text: "Falta info." }] }) +
    "\n```",
});
await agent.tickRepairJobs();
assert.equal((await findLead("1100")).status, "auto_flagged");
const pendingNow = [
  ...(await store.listLucyRepairs("auto_flagged", 300)),
  ...(await store.listLucyRepairs("open", 300)),
];
assert.ok(pendingNow.some((r) => r.kommoLeadId === "1100"));
assert.ok(!agent.pickRepairsForJob(pendingNow).some((r) => r.kommoLeadId === "1100"), "no reintenta solo");

// Un problema visto en muchas conversaciones va completo (todas sus filas) en un solo envío.
const many = Array.from({ length: 18 }, (_, i) => ({
  ...pendingNow[0]!,
  id: `many-${i}`,
  kommoLeadId: `m${i}`,
  category: "bad_field",
  evidence: `[2026-10-02] CRM Dirección parece frase: «calle ${i}»`,
}));
assert.equal(agent.pickRepairsForJob(many).length, 18);

// Por defecto publica solo al terminar con cambios.
delete process.env["LUCY_REPAIR_AUTO_PUBLISH"];
assert.ok(await rec("1200", "bad_field", "[2026-10-02] CRM Fecha parece horario: «5 pm»"));
const job6 = await agent.launchRepairJob([(await store.getLucyRepair((await findLead("1200")).id))!]);
runs.set(`${job6.agentId}/${job6.runId}`, {
  status: "FINISHED",
  result: "```json\n" + JSON.stringify({ fixed: [{ ids: [job6.repairIds[0]], text: "ok" }], falsePositive: [], notFixed: [] }) + "\n```",
  git: { branches: [{ branch: "cursor/fix-fecha", prUrl: "https://github.com/x/pull/10" }] },
});
await agent.tickRepairJobs();
assert.equal(agent.getRepairJob(job6.id)!.status, "publishing", "auto-publica sin botón");

// Composer no pasó las pruebas al publicar → se descarta y Sonnet lo reintenta una vez.
process.env["LUCY_REPAIR_FALLBACK_MODEL"] = "claude-sonnet-5.5";
runs.set(`${job6.agentId}/run-${job6.agentId}-pub`, {
  status: "FINISHED",
  result: '```json\n{"published":false,"text":"a15961 falla"}\n```',
});
await agent.tickRepairJobs();
await agent.launchPendingEscalations();
const failed6 = agent.getRepairJob(job6.id)!;
assert.equal(failed6.status, "discarded");
assert.ok(failed6.escalation?.jobId, JSON.stringify(failed6.escalation));
const job7 = agent.getRepairJob(failed6.escalation!.jobId!)!;
assert.equal(job7.model, "claude-sonnet-5-5-high");
assert.equal(job7.escalatedFrom, job6.id);
assert.deepEqual(job7.repairIds, [(await findLead("1200")).id]);
const create7 = calls.filter((c) => c.method === "POST" && c.path === "/v1/agents").at(-1)!;
assert.deepEqual((create7.body as { model?: { id: string } }).model, { id: "claude-sonnet-5-5-high" });
// El 2.º intento no escala otra vez.
runs.set(`${job7.agentId}/${job7.runId}`, {
  status: "FINISHED",
  result: "```json\n" + JSON.stringify({ fixed: [], falsePositive: [], notFixed: [{ ids: [job7.repairIds[0]], text: "no" }] }) + "\n```",
});
await agent.tickRepairJobs();
await agent.launchPendingEscalations();
assert.equal(agent.getRepairJob(job7.id)!.status, "no_changes");
assert.equal(agent.getRepairJob(job7.id)!.escalation, undefined);
assert.equal((await findLead("1200")).status, "auto_flagged");

agent.__resetRepairJobsForTest();
console.log("cursor-repair-agent smoke OK");
process.exit(0);
