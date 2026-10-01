/**
 * Smoke A16524 — chat más corto con preguntas 2 en 1:
 * fecha + horario, ciudad + colonia/salón, servicios + monto. Nombre, tipo, invitados y correo
 * van por separado. La respuesta a una pregunta doble llena ambos datos.
 */
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  captureContextualAnswer,
  CRM_FECHA_LABEL,
  CRM_HORARIO_LABEL,
} from "../conversation-understanding.js";
import { buildNaturalQuestion } from "../lucy-flow-guards.js";
import type { ExtractedData } from "../types.js";

function ex(partial: Partial<ExtractedData> = {}): ExtractedData {
  return {
    tipo_contacto: "cliente",
    nombre: null,
    empresa: null,
    telefono: null,
    correo: null,
    presupuesto: null,
    direccion_evento: null,
    requerimientos_evento: null,
    fecha_evento: null,
    horario_evento: null,
    fecha_horario: null,
    num_invitados: null,
    tipo_evento: null,
    modo_servicio: null,
    ...partial,
  };
}
const u = (c: string) => ({ role: "user", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;
const a = (c: string) => ({ role: "assistant", content: c }) as OpenAI.Chat.ChatCompletionMessageParam;

const base = ex({ nombre: "Ana", tipo_evento: "boda" });
const ask = (field: Parameters<typeof buildNaturalQuestion>[0], extracted: ExtractedData, filled: string[] = []) =>
  buildNaturalQuestion(field, {
    extracted,
    filledSet: new Set(filled),
    whatsappName: "Ana",
    history: [u("hola"), a("¡Hola! Soy Lucy. ¿Cuál es tu nombre?"), u("Ana")],
    currentMessage: "Ana",
    entityId: "A16524",
  });

// Fecha + horario juntos (si falta el horario).
{
  const q = ask("fecha", { ...base, requerimientos_evento: "Banquete Formal", num_invitados: 100 });
  assert.ok(/fecha|d[ií]a/i.test(q) && /hor(a|ario)/i.test(q), q);
  assert.equal((q.match(/\?/g) ?? []).length, 1, q);
}
// Si ya hay horario, solo fecha.
{
  const q = ask(
    "fecha",
    { ...base, requerimientos_evento: "Banquete Formal", num_invitados: 100, horario_evento: "8 pm" },
    ["Horario del evento"]
  );
  assert.ok(!/hor(a|ario)/i.test(q), q);
}
// Ciudad + colonia/salón juntos.
{
  const q = ask("zona", { ...base, fecha_evento: "14 de marzo", horario_evento: "8 pm" });
  assert.ok(/ciudad/i.test(q) && /colonia|sal[oó]n/i.test(q), q);
}
// Servicios + monto juntos (sin servicio aún).
{
  const q = ask("requerimientos", base);
  assert.ok(/servicio|cotizar|armar/i.test(q) && /presupuesto|monto/i.test(q), q);
  assert.equal((q.match(/\?/g) ?? []).length, 1, q);
}
// Servicio ya dicho → "¿algo más?" + monto en la misma pregunta.
{
  const q = ask("requerimientos", { ...base, requerimientos_evento: "Taquiza" });
  assert.ok(/Taquiza/.test(q) && /presupuesto|monto/i.test(q), q);
}
// Con presupuesto ya dado, no se vuelve a pedir monto.
{
  const q = ask("requerimientos", { ...base, presupuesto: "$80,000 MXN" });
  assert.ok(!/presupuesto|monto/i.test(q), q);
}
// Invitados va sola.
{
  const q = ask("invitados", { ...base, requerimientos_evento: "Taquiza" });
  assert.ok(/invitados|personas/i.test(q) && !/fecha|presupuesto|monto|ciudad/i.test(q), q);
}
// Correo y nombre van solos.
{
  const q = ask("correo", { ...base, requerimientos_evento: "Taquiza", num_invitados: 80 });
  assert.ok(/correo/i.test(q) && !/fecha|presupuesto|monto|ciudad|invitados/i.test(q), q);
  const qn = ask("nombre", ex());
  assert.ok(/nombre|llamas/i.test(qn) && !/fecha|presupuesto|correo|invitados/i.test(qn), qn);
}

// Captura: una respuesta a "¿fecha y horario?" llena los dos.
const filledBase = new Set(["Nombre del cliente", "Tipo de evento", "Requerimientos o servicios", "Número de invitados"]);
{
  const caps = captureContextualAnswer(
    [u("100 personas"), a("Perfecto. ¿Ya tienen fecha y horario del evento?")],
    "el 14 de marzo de 8 pm a 2 am",
    new Set(filledBase)
  );
  assert.ok(caps.some((c) => c.label === CRM_FECHA_LABEL && /14 de marzo/i.test(c.value)), JSON.stringify(caps));
  assert.ok(caps.some((c) => c.label === CRM_HORARIO_LABEL && /8/.test(c.value)), JSON.stringify(caps));
}
// "Aún no tenemos fecha" → horario también queda pendiente (no se re-pregunta enseguida).
{
  const caps = captureContextualAnswer(
    [u("100 personas"), a("Perfecto. ¿Ya tienen fecha y horario del evento?")],
    "aún no tenemos fecha",
    new Set(filledBase)
  );
  const fecha = caps.find((c) => c.label === CRM_FECHA_LABEL);
  if (fecha && /sin\s+definir|pendiente/i.test(fecha.value)) {
    assert.ok(caps.some((c) => c.label === CRM_HORARIO_LABEL), JSON.stringify(caps));
  }
}
// Captura: "¿servicios y presupuesto?" → anota servicio y monto.
{
  const caps = captureContextualAnswer(
    [u("boda"), a("¿Qué servicios te gustaría cotizar y qué presupuesto aproximado manejan?")],
    "una taquiza para la boda, como 60 mil pesos",
    new Set(["Nombre del cliente", "Tipo de evento"])
  );
  assert.ok(caps.some((c) => c.label === "Requerimientos o servicios"), JSON.stringify(caps));
  assert.ok(caps.some((c) => c.label === "Presupuesto (MXN)" && /60/.test(c.value)), JSON.stringify(caps));
}
// Sin monto en la respuesta → no inventa presupuesto con "100 personas".
{
  const caps = captureContextualAnswer(
    [u("boda"), a("¿Qué servicios te gustaría cotizar y qué presupuesto aproximado manejan?")],
    "banquete para 100 personas",
    new Set(["Nombre del cliente", "Tipo de evento"])
  );
  assert.ok(!caps.some((c) => c.label === "Presupuesto (MXN)"), JSON.stringify(caps));
}

console.log("a16524-smoke OK");
