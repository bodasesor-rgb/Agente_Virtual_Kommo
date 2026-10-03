/**
 * Smoke — Supervisor que aprende: Gemini busca errores nuevos con cita real, solo lee lo nuevo,
 * revisa clientes que dejaron de contestar, ventana «desde la última auditoría» y reporte de calidad.
 * Gemini y BD simulados (PGlite en carpeta temporal).
 *
 * npx --yes tsx ./src/selftest/reparaciones-supervisor-smoke.ts
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "lucy-supervisor-"));
delete process.env["DATABASE_URL"];
delete process.env["KOMMO_ACCESS_TOKEN"];
delete process.env["CURSOR_API_KEY"];
process.env["LUCY_DATA_DIR"] = dir;
process.env["LUCY_LOCAL_DB_PATH"] = join(dir, "pgdata");
process.env["LUCY_REPAIRS_JSON_PATH"] = join(dir, "lucy-repairs.json");
process.env["LUCY_CHAT_HISTORY_PATH"] = join(dir, "chat-history.json");
process.env["LUCY_AUDITOR_LOG_PATH"] = join(dir, "auditor-log.json");
process.env["GEMINI_API_KEY"] = "test-key";
process.env["LLM_PROVIDER"] = "gemini";
delete process.env["LUCY_AUDITOR_MODEL"];
delete process.env["LUCY_AUDITOR_MAX_CALLS_PER_DAY"];
delete process.env["LUCY_CONTROL_MAX_PER_DAY"];

const LUCY_IGNORA = "Claro, nuestras carpas árabes son ideales para bodas. ¿Para qué fecha es tu evento?";
const LUCY_SILENCIO = "Para cotizar necesito tu correo, fecha, horario, invitados, zona y presupuesto.";

const geminiPrompts: string[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("generativelanguage")) {
    return new Response("{}", { status: 404 });
  }
  const prompt = JSON.stringify(JSON.parse(String(init?.body ?? "{}")));
  geminiPrompts.push(prompt);
  const findings = prompt.includes("dejó de contestar justo después")
    ? [
        {
          category: "tone",
          severity: "warn",
          problem: "Pide todos los datos de golpe",
          client_quote: "y cuanto cuesta",
          lucy_quote: "necesito tu correo, fecha, horario",
          proposedRepair: "Pedir un dato a la vez y dar rango de precio primero.",
        },
      ]
    : [
        {
          category: "ignored_question",
          severity: "error",
          problem: "No contestó el precio que preguntó el cliente",
          client_quote: "cuánto cuesta la carpa",
          lucy_quote: "nuestras carpas árabes son ideales para bodas",
          proposedRepair: "Si el cliente pregunta precio, dar el precio o rango antes de pedir datos.",
        },
        {
          category: "wrong_info",
          severity: "error",
          problem: "Inventado",
          lucy_quote: "esto Lucy nunca lo dijo en el chat",
          proposedRepair: "x",
        },
      ];
  return new Response(
    JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(findings) }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}) as typeof fetch;

const llm = await import("../services/lucyAuditorLlm.js");
const auditor = await import("../services/lucyAuditor.js");
const quality = await import("../services/lucyQuality.js");
const store = await import("../services/lucyRepairStore.js");
const { db, messages } = await import("@workspace/db");
const { ensureLearningSchema } = await import("../services/learningSchema.js");

// ── Prompt: busca errores nuevos (no solo 5), exige cita textual
const prompt = llm.buildAuditorPrompt("LUCY: hola");
assert.ok(!/detecta SOLO/i.test(prompt));
for (const c of ["ignored_question", "asked_known_data", "misunderstood", "wrong_info", "handoff"]) {
  assert.ok(prompt.includes(c), c);
}
assert.match(prompt, /TEXTUAL/);
assert.match(llm.buildAuditorPrompt("LUCY: hola", "silent"), /dejó de contestar/);
assert.ok(!/dejó de contestar justo/.test(prompt));

// ── Hallazgos sin cita real (o en lo ya revisado) se tiran
const transcript = [
  "CLIENTE: cuánto cuesta la carpa",
  "LUCY: Hola, soy Lucy de Bodasesor",
  llm.AUDITOR_NEW_MARKER,
  "CLIENTE: y la carpa?",
  `LUCY: ${LUCY_IGNORA}`,
].join("\n");
const parsed = llm.parseAuditorLlmFindings(
  JSON.stringify([
    { category: "ignored_question", severity: "error", problem: "No dio precio", client_quote: "y la carpa?", lucy_quote: "carpas árabes son ideales", proposedRepair: "Dar precio" },
    { category: "tone", problem: "Saludo frío", lucy_quote: "Hola, soy Lucy de Bodasesor", proposedRepair: "x" },
    { category: "wrong_info", problem: "Inventado", lucy_quote: "precio de 5000 pesos", proposedRepair: "x" },
    { category: "categoria_rara", problem: "Algo nuevo", lucy_quote: "para que fecha es tu evento", proposedRepair: "y" },
  ]),
  transcript
);
assert.equal(parsed.length, 2, JSON.stringify(parsed));
assert.equal(parsed[0]!.category, "ignored_question");
assert.match(parsed[0]!.evidence, /^No dio precio\. Cliente: «y la carpa\?» → Lucy: «carpas árabes son ideales»$/);
assert.equal(parsed[1]!.category, "other", "categoría desconocida → other");
assert.ok(
  store.repairSignature("ignored_question", parsed[0]!.evidence) !==
    store.repairSignature("ignored_question", "No pidió fecha. Cliente: «a» → Lucy: «b»"),
  "errores distintos de Gemini no se agrupan como el mismo"
);

// ── Transcript: lo más reciente, marca de nuevos, mensajes de varias líneas en una
const many = Array.from({ length: 200 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `mensaje ${i} ${"x".repeat(40)}` }));
const t = auditor.formatTranscript(many, 198);
assert.ok(t.length <= 6000);
assert.ok(t.includes("mensaje 199"), "conserva lo último");
assert.ok(!t.includes("mensaje 0 "), "recorta lo viejo");
assert.ok(t.includes(`${llm.AUDITOR_NEW_MARKER}\nCLIENTE: mensaje 198`));
assert.equal(auditor.formatTranscript([{ role: "assistant", content: "a\nb" }]), "LUCY: a b");

// ── Qué es nuevo para Gemini
const turns = [
  { role: "user", content: "hola", at: new Date("2026-10-01T10:00:00Z") },
  { role: "assistant", content: "Hola!", at: new Date("2026-10-01T10:01:00Z") },
  { role: "user", content: "precio?", at: new Date("2026-10-02T10:00:00Z") },
];
assert.equal(auditor.findNewTurnsStart(turns, auditor.turnFingerprint(turns[1]!), null), 2);
assert.equal(auditor.findNewTurnsStart(turns, auditor.turnFingerprint(turns[2]!), null), 3, "nada nuevo");
assert.equal(auditor.findNewTurnsStart(turns, undefined, new Date("2026-10-02T00:00:00Z")), 2);
assert.equal(auditor.findNewTurnsStart(turns, undefined, null), 0);

// ── Ventana del cron: desde la última auditoría, mín. 24 h, máx. 48 h
const now = new Date();
const H = 3600_000;
const ago = (h: number) => new Date(now.getTime() - h * H);
assert.equal(auditor.dailyAuditSince(now, null).getTime(), ago(24).getTime());
assert.equal(auditor.dailyAuditSince(now, ago(30)).getTime(), ago(30).getTime(), "cron retrasado: no se pierde nada");
assert.equal(auditor.dailyAuditSince(now, ago(100)).getTime(), ago(48).getTime());
assert.equal(auditor.dailyAuditSince(now, ago(10)).getTime(), ago(24).getTime());

assert.ok(auditor.isSilentAfterLucy([
  { role: "user", content: "a" },
  { role: "assistant", content: "b" },
  { role: "user", content: "c" },
  { role: "assistant", content: "d" },
]));
assert.ok(!auditor.isSilentAfterLucy([{ role: "user", content: "a" }, { role: "assistant", content: "b" }]), "1 mensaje no es plática");
assert.ok(!auditor.isSilentAfterLucy([{ role: "assistant", content: "b" }, { role: "user", content: "a" }, { role: "user", content: "c" }]));

// ── Corrida nocturna completa
await ensureLearningSchema();
const msg = (lead: string, role: string, content: string, hoursAgo: number) => ({
  kommoLeadId: lead,
  role,
  content,
  timestamp: ago(hoursAgo),
});
await db.insert(messages).values([
  msg("A", "user", "Hola quiero carpa para boda", 3),
  msg("A", "assistant", "¡Hola! Soy Lucy de Bodasesor 😊 ¿Cómo te llamas?", 2.9),
  msg("A", "user", "Ana, cuánto cuesta la carpa", 2.5),
  msg("A", "assistant", LUCY_IGNORA, 2.4),
  // B: platicó y dejó de contestar tras Lucy (hace 2 días)
  msg("B", "user", "hola info de mobiliario", 50),
  msg("B", "assistant", "Claro, ¿qué tipo de evento es?", 49.9),
  msg("B", "user", "boda, y cuanto cuesta", 49.5),
  msg("B", "assistant", LUCY_SILENCIO, 49.4),
  // C: el último en hablar fue el cliente → no es punto ciego de Lucy
  msg("C", "user", "hola", 40),
  msg("C", "assistant", "¡Hola! ¿Cómo te llamas?", 39.9),
  msg("C", "user", "Luis", 39.5),
  msg("C", "user", "?", 39),
]);

const r1 = await auditor.runLucyAuditorDaily({ now });
assert.equal(r1.skipped, undefined, JSON.stringify(r1));
assert.equal(r1.silentReviewed, 1, JSON.stringify(r1));
assert.equal(r1.silentFindings, 1);
const callsAfter1 = geminiPrompts.length;
assert.equal(callsAfter1, 2, "A (día) + B (silencio); C no gasta");
assert.ok(geminiPrompts[0]!.includes("thinkingBudget"), "presupuesto de pensamiento acotado");

const all = await store.listLucyRepairs("open", 50);
const a = all.filter((r) => r.kommoLeadId === "A");
assert.equal(a.length, 1, "el hallazgo inventado no entra: " + JSON.stringify(a));
assert.equal(a[0]!.category, "ignored_question");
assert.equal(a[0]!.source, "flash");
const b = all.find((r) => r.kommoLeadId === "B");
assert.ok(b, "punto ciego registrado");
assert.match(b!.proposedRepair, /^El cliente dejó de contestar después de esto\./);
assert.ok(!all.some((r) => r.kommoLeadId === "C"));

// Cron duplicado en la misma noche: no repite.
const r2 = await auditor.runLucyAuditorDaily({ now: new Date(now.getTime() + 2 * H) });
assert.equal(r2.skipped, "already_ran_today");

// Siguiente noche sin mensajes nuevos: Gemini no relee ni gasta.
const r3 = await auditor.runLucyAuditorDaily({ now: new Date(now.getTime() + 13 * H) });
assert.equal(r3.skipped, undefined);
assert.equal(geminiPrompts.length, callsAfter1, "no relee chats ya leídos");

// Mensaje nuevo de Lucy en A → solo eso es «nuevo» para Gemini.
await db.insert(messages).values([
  msg("A", "user", "ok y el precio?", -14),
  msg("A", "assistant", "La carpa árabe para 100 personas va desde $8,500.", -14.1),
]);
const r4 = await auditor.runLucyAuditorDaily({ now: new Date(now.getTime() + 26 * H) });
assert.equal(r4.skipped, undefined);
assert.equal(geminiPrompts.length, callsAfter1 + 1);
const lastPrompt = JSON.parse(geminiPrompts.at(-1)!) as { contents?: unknown };
const lastText = JSON.stringify(lastPrompt);
const markerAt = lastText.lastIndexOf(llm.AUDITOR_NEW_MARKER);
assert.ok(markerAt > 0, "marca de nuevos");
assert.ok(lastText.indexOf("ok y el precio?") > markerAt);
const oldAt = lastText.indexOf("Ana, cuánto cuesta la carpa");
assert.ok(oldAt > 0 && oldAt < markerAt, "lo viejo queda como contexto");

// ── Reporte de calidad
const report = await quality.buildQualityReport(new Date(now.getTime() + 26 * H));
assert.equal(report.coverage.runs.filter((r) => r.kind === "daily").length, 3);
assert.ok(report.coverage.nightsLast7 >= 2);
assert.ok(report.rules.some((r) => r.source === "flash" && r.category === "ignored_question"));

const rules = quality.summarizeRules([
  ...Array.from({ length: 3 }, () => ({ source: "heuristic", category: "loop_links", status: "dismissed", appliedRepair: "Falso positivo (agente Cursor): no era", createdAt: now })),
  { source: "heuristic", category: "loop_links", status: "resolved", appliedRepair: "ok", createdAt: now },
  { source: "flash", category: "tone", status: "open", appliedRepair: null, createdAt: now },
]);
const loop = rules.find((r) => r.category === "loop_links")!;
assert.equal(loop.falseAlarm, 3);
assert.equal(loop.falseAlarmRate, 0.75);
assert.equal(loop.noisy, true, "regla ruidosa marcada");
assert.equal(rules.find((r) => r.category === "tone")!.falseAlarmRate, null);

console.log("reparaciones-supervisor smoke OK");
process.exit(0);
