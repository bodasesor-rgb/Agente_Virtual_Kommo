/**
 * Smoke: toda reparación (manual o de Cursor publicada) llega al prompt del supervisor.
 *
 * npx --yes tsx ./src/selftest/supervisor-lessons-smoke.ts
 */
import assert from "node:assert/strict";
import { AUDITOR_LLM_CATEGORIES, buildAuditorPrompt } from "../services/lucyAuditorLlm.js";
import type { RepairJob } from "../services/cursorRepairAgent.js";
import {
  MANUAL_LESSONS,
  buildSupervisorLessonsBlock,
  lessonsFromRepairJobs,
  listSupervisorLessons,
} from "../services/lucySupervisorLessons.js";

const allowed = new Set<string>(AUDITOR_LLM_CATEGORIES);
for (const l of MANUAL_LESSONS) {
  assert.ok(allowed.has(l.category), `categoría inválida en ${l.ref}: ${l.category}`);
  assert.match(l.date, /^\d{4}-\d{2}-\d{2}$/, l.ref);
  assert.ok(l.wrong.length > 10 && l.right.length > 10, l.ref);
}

const label = "Lucy desaconsejó un servicio pedido. Cliente: «Soy Ana Pérez, quiero banquete» → Lucy: «no te conviene»";
const other = "Lucy repitió el catálogo de carpas. Lucy: «Catálogo de carpas»";
/** Firma como la guarda cursorRepairAgent (repairSignature en lucyRepairStore). */
const sigOf = (category: string, evidence: string) =>
  `${category}:${evidence.toLowerCase().replace(/«[^»]*»?/g, "«…»").replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 70)}`;
const job = (status: RepairJob["status"]): RepairJob => ({
  id: "job-abcdef123",
  createdAt: "2026-10-04T10:00:00Z",
  updatedAt: "2026-10-04T11:00:00Z",
  publishedAt: "2026-10-04T11:00:00Z",
  status,
  agentId: "a",
  runId: "r",
  repairIds: ["r1"],
  repairSigs: { r1: sigOf("misunderstood", label) },
  problems: [
    { category: "misunderstood", label: other, count: 1 },
    { category: "misunderstood", label, count: 1 },
  ],
  outcome: {
    fixed: [{ ids: ["r1"], text: "Lucy ya no desaconseja servicios que el cliente pidió." }],
    falsePositive: [],
    notFixed: [],
  },
  steps: [],
});

const fromCursor = lessonsFromRepairJobs([job("published")]);
assert.equal(fromCursor.length, 1);
assert.equal(fromCursor[0]!.category, "misunderstood");
assert.ok(!/Ana|P[eé]rez|banquete/i.test(fromCursor[0]!.wrong), fromCursor[0]!.wrong);
assert.match(fromCursor[0]!.wrong, /desaconsej/, "toma el problema correcto del grupo");
assert.match(fromCursor[0]!.right, /desaconseja/);
assert.equal(lessonsFromRepairJobs([job("fix_ready"), job("error")]).length, 0, "solo publicados");

const lessons = listSupervisorLessons([job("published")]);
assert.ok(lessons.some((l) => l.source === "cursor"));
assert.ok(lessons.some((l) => l.ref === "A16614"));
const block = buildSupervisorLessonsBlock(lessons);
assert.ok(block.length <= 5000, `bloque muy largo: ${block.length}`);
assert.match(block, /ERRORES QUE YA SE REPARARON/);
assert.match(block, /todo incluido/);

const prompt = buildAuditorPrompt("LUCY: hola", "daily", block);
assert.ok(prompt.indexOf("ERRORES QUE YA SE REPARARON") < prompt.indexOf("REGLAS ESTRICTAS"));
assert.ok(!buildAuditorPrompt("LUCY: hola").includes("ERRORES QUE YA SE REPARARON"));

console.log("supervisor-lessons smoke OK");
