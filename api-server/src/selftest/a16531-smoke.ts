/**
 * Smoke A16531 Monica — formulario web "me interesa cotizar: Banquete Kosher de 3 Tiempos en Cuernavaca":
 * primer mensaje = presentación + link Kosher + nombre (sin volcar PDF/precios); nunca la ficha
 * de *Banquete Formal* para Kosher; sin precio pedido no se pegan precios.
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import type { ExtractedData } from "../types.js";

const u = (c: string) => ({ role: "user", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;
const a = (c: string) => ({ role: "assistant", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;

const guard = (cur: string, history: OpenAI.Chat.ChatCompletionMessageParam[], extracted: Partial<ExtractedData>, filled: string[]) =>
  applyLucyMessageGuards({
    aiResponse:
      "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. Para *Banquete Kosher* manejamos estos niveles:\n1. *3 tiempos* — $800\n2. *4 tiempos* — $950\n¿Cuál es tu nombre?",
    extracted: { tipo_contacto: "cliente", ...extracted } as ExtractedData,
    filledSet: new Set(filled),
    history,
    currentMessage: cur,
    entityId: "A16531",
    readyForClosing: false,
    cierreYaEnviado: false,
    emailRefusedThisTurn: false,
    forceFirstPresentation: history.length === 0,
    buildClosing: () => "CIERRE",
    whatsappDisplayName: "Monica Espindola",
  });

const DUMP = /Seg[uú]n el cat[aá]logo que ya tenemos|\$\s*\d|Te detallo|Men[uú] 3 tiempos/i;

// Primer mensaje desde el formulario web.
for (const cur of [
  "Hola, me interesa cotizar: Banquete Kosher de 3 Tiempos en Cuernavaca",
  "Hola, me interesa cotizar: Banquete Formal de 4 Tiempos",
]) {
  const out = guard(cur, [], {}, []);
  assert.ok(/Soy Lucy/i.test(out), out);
  assert.ok(/nombre/i.test(out), out);
  assert.ok(!DUMP.test(out), out);
}

const hist = [
  u("hola"),
  a("¡Hola! Buen día. Soy Lucy. ¿Cuál es tu nombre?"),
  u("Monica"),
  a("¡Mucho gusto, Monica! ¿Qué servicios te gustaría cotizar y qué presupuesto aproximado manejan?"),
];
const base = { nombre: "Monica", tipo_evento: "boda" };
const filled = ["Nombre del cliente", "Tipo de evento"];

// Sin pedir precio → link, sin precios.
{
  const out = guard("banquete kosher de 3 tiempos", hist, base, filled);
  assert.ok(/banquete-kosher/i.test(out), out);
  assert.ok(!DUMP.test(out), out);
}
// Pide precio de Kosher → nunca la ficha de Formal.
{
  const out = guard("cuánto cuesta el banquete kosher de 3 tiempos?", hist, base, filled);
  assert.ok(!/Banquete Formal/i.test(out), out);
}

console.log("a16531-smoke OK");
