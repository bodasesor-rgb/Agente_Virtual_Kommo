/**
 * Smoke V9.81 — A15903 Verónica:
 * - misma URL de catálogo no se manda dos veces en un mensaje
 * - "10 - 12 personas" es aforo, no horario
 * - "min 35 personas" se responde (no saltar a fecha)
 * - "Gracias por la corrección" no se duplica tras "Gracias por tu correo"
 * node ./scripts/run-v981-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  looksLikeGuestCountRange,
  parseHorarioFromText,
  parseInvitadosFromText,
  clientQuestionsServiceMinimum,
  buildBelowMinimumGuestReply,
} from "../conversation-understanding.js";
import {
  applyLucyMessageGuards,
  dedupeCatalogUrlsInMessage,
} from "../lucy-flow-guards.js";
import { applyCrmWriteInvariants } from "../lucyCrmInvariants.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.91");

function emptyExtracted(overrides: Partial<ExtractedData> = {}): ExtractedData {
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
    ...overrides,
  };
}

const closing = () => "Perfecto, ya tengo todo.";

// 1) Dedupe URL en la misma línea / dos veces.
{
  const dup =
    "https://bodasesor.com/catalogos/banquete-formal Claro, aquí tienes el catálogo de *Banquete Formal 3 tiempos*:\n" +
    "https://bodasesor.com/catalogos/banquete-formal\n\nSi quieres el de otro servicio, dímelo y te mando ese.";
  const cleaned = dedupeCatalogUrlsInMessage(dup);
  const hits = cleaned.match(/bodasesor\.com\/catalogos\/banquete-formal/gi) ?? [];
  assert.equal(hits.length, 1, cleaned);
}

// 2) 10-12 personas = invitados, no horario.
{
  assert.ok(looksLikeGuestCountRange("10 - 12 personas"));
  assert.ok(looksLikeGuestCountRange("aproximadamente 10 - 12 personas"));
  assert.equal(parseHorarioFromText("10 - 12 personas"), null);
  assert.equal(parseHorarioFromText("aproximadamente 10 - 12 personas"), null);
  const inv = parseInvitadosFromText("Para aproximadamente 10 - 12 personas", {
    askedInvitados: true,
  });
  assert.ok(inv && Number(inv) >= 10 && Number(inv) <= 12, String(inv));

  const cleared = applyCrmWriteInvariants(
    emptyExtracted({
      horario_evento: "10 - 12",
      fecha_horario: "Sin definir (pendiente), 10 - 12",
      num_invitados: 12,
    }),
    []
  );
  assert.equal(cleared.extracted.horario_evento, null);
  assert.ok(!/10\s*-\s*12/.test(cleared.extracted.fecha_horario ?? ""));
}

// 3) Pregunta por mínimo 35 → respuesta útil, no "¿tienen fecha?".
{
  assert.ok(clientQuestionsServiceMinimum("Veo que tus servicios son para min 35 personas"));
  assert.match(buildBelowMinimumGuestReply(12), /coffee break|barra|35/i);

  const reply = applyLucyMessageGuards({
    aiResponse: "Perfecto. ¿Ya tienen fecha?",
    extracted: emptyExtracted({
      nombre: "Verónica Ramos",
      requerimientos_evento: "Banquete Formal",
    }),
    filledSet: new Set(["Nombre del cliente", "Requerimientos o servicios"]),
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      {
        role: "assistant",
        content: "Claro, aquí tienes el catálogo.\n¿Más o menos para cuántas personas sería?",
      },
    ] as never,
    currentMessage: "Veo que tus servicios son para min 35 personas",
    whatsappDisplayName: "Verónica Ramos",
    buildClosing: closing,
  });
  assert.ok(/35|coffee|barra|medida|peque/i.test(reply), reply.slice(0, 500));
  assert.ok(!/ya tienen fecha|d[ií]a del evento/i.test(reply), reply.slice(0, 400));
}

// 4) Corrección de correo: un solo "Gracias".
{
  const reply = applyLucyMessageGuards({
    aiResponse: "Gracias por la corrección, Verónica. Ya tengo el dato actualizado. ¿Cuentan con algún presupuesto estimado?",
    extracted: emptyExtracted({
      nombre: "Verónica Ramos",
      correo: "veronica.ramos@finkargo.com",
      requerimientos_evento: "Banquete Formal",
      num_invitados: 12,
      fecha_evento: "22 de este mes",
      direccion_evento: "CDMX",
    }),
    filledSet: new Set([
      "Nombre del cliente",
      "Correo electrónico",
      "Requerimientos o servicios",
      "Número de invitados",
      "Fecha del evento",
      "Lugar/dirección del evento",
    ]),
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      { role: "assistant", content: "Gracias por tu correo, Verónica. ¿Prefieren que nuestro equipo les proponga opciones?" },
      {
        role: "user",
        content: "Una disculpa, el correo es el siguiente: veronica.ramos@finkargo.com",
      },
    ] as never,
    currentMessage: "Una disculpa, el correo es el siguiente: veronica.ramos@finkargo.com",
    whatsappDisplayName: "Verónica Ramos",
    buildClosing: closing,
  });
  const gracias = reply.match(/gracias por/gi) ?? [];
  assert.ok(gracias.length <= 1, reply.slice(0, 400));
  assert.ok(!/gracias por la correcci[oó]n/i.test(reply) || !/gracias por tu correo/i.test(reply), reply.slice(0, 400));
}

console.log("V9.81 class smoke OK");
