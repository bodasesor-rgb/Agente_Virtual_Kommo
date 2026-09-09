/**
 * Smoke V9.78 — bucle de "no entendí":
 * - un turno que repite la misma pregunta sin capturar nada cuenta como atorado
 * - a los 3 seguidos se escala a humano con mensaje de traspaso
 * - el contador se reinicia en cuanto entra un dato al CRM
 * - el prompt trae la regla de reformular distinto / ofrecer opciones
 * - la ventana de historial hacia el LLM ya no es de 3 turnos
 * node ./scripts/run-v978-class-smoke.mjs
 */
import assert from "node:assert/strict";
import type { OpenAI } from "openai";
import {
  buildUnclearHandoffMessage,
  isStuckLoopTurn,
  nextUnclearStreak,
  shouldEscalateForUnclear,
  UNCLEAR_STREAK_ESCALATION,
} from "../lucyUnclearStreak.js";
import { getLucyChatHistoryMax, trimChatHistory } from "../lib/lucyCostControls.js";
import { buildStaticSystemPrompt } from "../services/promptBuilder.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.78");

const asst = (content: string) => ({ role: "assistant" as const, content });
const user = (content: string) => ({ role: "user" as const, content });

const filled = (...labels: string[]) => new Set<string>(labels);

// 1) Misma pregunta + nada nuevo en el CRM = turno atorado.
{
  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
    user("Hola, quiero cotizar"),
    asst("Claro que sí. ¿Cuántos invitados tienen contemplados?"),
    user("pues los de siempre"),
  ];
  assert.ok(
    isStuckLoopTurn({
      outboundMessage: "Perfecto. ¿Para cuántas personas sería el evento?",
      history,
      filledBefore: filled("Nombre del cliente"),
      filledAfter: filled("Nombre del cliente"),
    })
  );
}

// 2) Si el cliente aportó un dato, no hay bucle aunque el texto se parezca.
{
  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
    asst("Claro que sí. ¿Cuántos invitados tienen contemplados?"),
    user("120"),
  ];
  assert.equal(
    isStuckLoopTurn({
      outboundMessage: "Claro que sí. ¿Cuántos invitados tienen contemplados?",
      history,
      filledBefore: filled("Nombre del cliente"),
      filledAfter: filled("Nombre del cliente", "Número de invitados"),
    }),
    false
  );
}

// 3) Avanzar a otro dato del embudo tampoco es bucle.
{
  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
    asst("¿Cuántos invitados tienen contemplados?"),
    user("no sé todavía"),
  ];
  assert.equal(
    isStuckLoopTurn({
      outboundMessage: "Sin problema, lo afinamos después. ¿Qué día tienen en mente?",
      history,
      filledBefore: filled("Nombre del cliente"),
      filledAfter: filled("Nombre del cliente"),
    }),
    false
  );
}

// 4) Primer turno y post-cierre nunca cuentan.
{
  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
    asst("¿Cuántos invitados tienen contemplados?"),
  ];
  const base = {
    outboundMessage: "¿Cuántos invitados tienen contemplados?",
    history,
    filledBefore: filled("Nombre del cliente"),
    filledAfter: filled("Nombre del cliente"),
  };
  assert.equal(isStuckLoopTurn({ ...base, isFirstInteraction: true }), false);
  assert.equal(isStuckLoopTurn({ ...base, cierreYaEnviado: true }), false);
}

// 5) El contador acumula, escala al tercero y se reinicia al entender.
{
  let streak = 0;
  streak = nextUnclearStreak(streak, true);
  assert.equal(streak, 1);
  assert.equal(shouldEscalateForUnclear(streak), false);

  streak = nextUnclearStreak(streak, true);
  assert.equal(streak, 2);
  assert.equal(shouldEscalateForUnclear(streak), false);

  streak = nextUnclearStreak(streak, true);
  assert.equal(streak, UNCLEAR_STREAK_ESCALATION);
  assert.ok(shouldEscalateForUnclear(streak));

  // Un turno entendido borra la racha.
  assert.equal(nextUnclearStreak(2, false), 0);
  assert.equal(nextUnclearStreak(null, false), 0);
}

// 6) Mensaje de traspaso: reconoce la falla, pasa al equipo y trae teléfonos.
{
  const msg = buildUnclearHandoffMessage("Tania Aguilar");
  assert.match(msg, /no me estoy explicando bien/i);
  assert.match(msg, /nuestro equipo/i);
  assert.match(msg, /55\s*4008\s*0373/);
  assert.match(msg, /Tania/);
  // Nunca el asesor legado del bot viejo.
  assert.equal(/rodrigo/i.test(msg), false);
  // Sin nombre también funciona.
  assert.match(buildUnclearHandoffMessage(null), /no me estoy explicando bien\./i);
}

// 7) La ventana de historial hacia el LLM cubre más de 3 turnos.
{
  assert.ok(getLucyChatHistoryMax() >= 12, String(getLucyChatHistoryMax()));
  const largo: OpenAI.Chat.ChatCompletionMessageParam[] = Array.from({ length: 30 }, (_, i) =>
    i % 2 === 0 ? user(`u${i}`) : asst(`a${i}`)
  );
  const trimmed = trimChatHistory(largo);
  assert.equal(trimmed.length, getLucyChatHistoryMax());
  // Conserva los turnos de Lucy, no solo los del cliente.
  assert.ok(trimmed.some((m) => m.role === "assistant"));
}

// 8) El system prompt trae la regla de no repetir y ofrecer opciones.
{
  const sys = buildStaticSystemPrompt();
  assert.match(sys, /Cuando NO entiendas el mensaje/i);
  assert.match(sys, /reformulaci[oó]n casi igual/i);
  assert.match(sys, /opciones\s+numeradas/i);
  assert.match(sys, /Creo que no me expliqu[eé] bien/i);
}

console.log("V9.78 class smoke OK");
