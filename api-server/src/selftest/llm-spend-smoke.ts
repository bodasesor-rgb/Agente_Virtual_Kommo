/**
 * Smoke: el gasto (Gemini + respaldo OpenAI) se guarda por día y sobrevive a un reinicio.
 *
 * npx --yes tsx ./src/selftest/llm-spend-smoke.ts
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  enableSpendPersistence,
  getGeminiSpendSnapshot,
  recordGeminiSpend,
  recordOpenAiSpend,
  resetSpendForTests,
} from "../lib/lucyGeminiSpend.js";
import { mexicoCityDayKey } from "../services/lucyAuditorTime.js";

const dir = mkdtempSync(join(tmpdir(), "lucy-spend-"));
const file = join(dir, "llm-spend.json");
process.env["LUCY_LLM_SPEND_PATH"] = file;

try {
  // Sin activar: nunca escribe a disco (pruebas no tocan lucy-data).
  resetSpendForTests();
  recordGeminiSpend({ channel: "chat", model: "gemini-3.1-flash-lite", usage: { promptTokenCount: 1000, candidatesTokenCount: 100 } });
  assert.equal(existsSync(file), false, "sin enableSpendPersistence no debe escribir");
  assert.equal(getGeminiSpendSnapshot().persisted, false);

  // Activado: guarda y se recupera tras "reinicio".
  resetSpendForTests();
  enableSpendPersistence();
  recordGeminiSpend({ channel: "chat", model: "gemini-3.1-flash-lite", usage: { promptTokenCount: 1_000_000, candidatesTokenCount: 0 } });
  recordOpenAiSpend({ kind: "chat", model: "gpt-4o-mini", inputTokens: 1_000_000, outputTokens: 1_000_000, reason: "Gemini falló (chat): 503   Service\nUnavailable" });
  recordOpenAiSpend({ kind: "voice", model: "whisper-1", audioSeconds: 60, reason: "Gemini no pudo transcribir la nota de voz" });
  assert.ok(existsSync(file), "debe crear llm-spend.json");

  const before = getGeminiSpendSnapshot();
  assert.equal(before.persisted, true);
  assert.equal(before.openai.calls, 2);
  assert.equal(before.openai.chatCalls, 1);
  assert.equal(before.openai.voiceCalls, 1);
  assert.equal(before.openai.audioSeconds, 60);
  // gpt-4o-mini: 0.15 + 0.6 por 1M; Whisper 60 s = 0.006
  assert.ok(Math.abs(before.openai.usdEstimate - 0.756) < 1e-6, `openai usd ${before.openai.usdEstimate}`);
  assert.equal(before.openai.lastReason, "Gemini no pudo transcribir la nota de voz");
  // Sin tarifas en env se usan las publicadas (flash-lite 0.10 por 1M de entrada), no 0.
  assert.ok(Math.abs(before.chat.usdEstimate - 0.1) < 1e-6, `chat usd ${before.chat.usdEstimate}`);
  assert.ok(Math.abs(before.totalUsdEstimate - (before.chat.usdEstimate + 0.756)) < 1e-6);

  resetSpendForTests();
  enableSpendPersistence();
  const after = getGeminiSpendSnapshot();
  assert.equal(after.chat.calls, 1, "chat debe recuperarse del disco");
  assert.equal(after.openai.calls, 2, "OpenAI debe recuperarse del disco");
  assert.ok(Math.abs(after.chat.usdEstimate - before.chat.usdEstimate) < 1e-9);

  // 7 días: suma historial dentro de la semana e ignora días viejos.
  const today = mexicoCityDayKey();
  const shift = (n: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const raw = JSON.parse(readFileSync(file, "utf8"));
  raw.history[shift(3)] = { chatUsd: 1, auditorUsd: 0.5, openaiUsd: 0.25, chatCalls: 10, auditorCalls: 2, openaiCalls: 1 };
  raw.history[shift(10)] = { chatUsd: 99, auditorUsd: 99, openaiUsd: 99, chatCalls: 99, auditorCalls: 99, openaiCalls: 99 };
  writeFileSync(file, JSON.stringify(raw), "utf8");
  resetSpendForTests();
  enableSpendPersistence();
  const week = getGeminiSpendSnapshot().last7;
  assert.equal(week.days, 2, "hoy + hace 3 días");
  assert.equal(week.chatCalls, 11);
  assert.equal(week.openaiCalls, 3);
  assert.ok(Math.abs(week.openaiUsd - (0.756 + 0.25)) < 1e-6, `openai 7d ${week.openaiUsd}`);

  // Archivo de otro día: hoy arranca en cero pero conserva historial.
  raw.dayKey = shift(1);
  writeFileSync(file, JSON.stringify(raw), "utf8");
  resetSpendForTests();
  enableSpendPersistence();
  const fresh = getGeminiSpendSnapshot();
  assert.equal(fresh.chat.calls, 0);
  assert.equal(fresh.openai.calls, 0);

  console.log("llm-spend-smoke OK");
} finally {
  enableSpendPersistence(false);
  resetSpendForTests();
  rmSync(dir, { recursive: true, force: true });
}
