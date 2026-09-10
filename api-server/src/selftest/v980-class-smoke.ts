/**
 * Smoke V9.80 — A15893 Suria:
 * - "Renta de periqueras y banquete" → Banquete Formal + Mobiliario (NO Barra de alimentos)
 * - sin "Anoto X" + "¡Claro! X la anoto" duplicado
 * - "2 horarios (aún no definidos)" / "Aún no sé definen" waives horario, no presupuesto
 * - historial vacío + CRM avanzado no re-presenta a Lucy
 * node ./scripts/run-v980-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  clientDefersHorario,
  detectPresupuestoRefusal,
  detectPresupuestoRefusalInContext,
  parseHorarioFromText,
  parseServicesFromText,
} from "../conversation-understanding.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.88");

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

const closing = () => "Perfecto, ya tengo todo. Le paso tu evento al equipo.";

// 1) Parse: periqueras + banquete.
{
  const svcs = parseServicesFromText("Renta de periqueras y banquete");
  assert.ok(svcs.some((s) => /banquete/i.test(s)), String(svcs));
  assert.ok(svcs.some((s) => /mobiliario/i.test(s)), String(svcs));
  assert.ok(!svcs.some((s) => /barra de alimentos/i.test(s)), String(svcs));
}

// 2) Guard reply: no Barra de alimentos, no ack duplicado.
{
  const filled = new Set(["Nombre del cliente"]);
  const reply = applyLucyMessageGuards({
    aiResponse: "Claro. ¿Qué van a celebrar?",
    extracted: emptyExtracted({ nombre: "Suria" }),
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      { role: "assistant", content: "¡Mucho gusto, Suria! ¿Qué van a celebrar?" },
      { role: "user", content: "Renta de periqueras y banquete" },
    ] as never,
    presentationHistory: [
      { role: "assistant", content: "¡Hola! Soy Lucy, agente virtual de Bodasesor." },
      { role: "user", content: "Suria" },
      { role: "assistant", content: "¡Mucho gusto, Suria! ¿Qué van a celebrar?" },
    ] as never,
    currentMessage: "Renta de periqueras y banquete",
    whatsappDisplayName: "Suria",
    buildClosing: closing,
  });
  assert.ok(!/barra de alimentos/i.test(reply), reply.slice(0, 500));
  assert.ok(/banquete|periquera|mobiliario/i.test(reply), reply.slice(0, 500));
  assert.ok(!/¡claro!.*la anoto/i.test(reply), reply.slice(0, 500));
  // No debe repetir "Anoto *X*" dos veces del mismo servicio.
  const anotoHits = reply.match(/Anoto \*/gi) ?? [];
  assert.ok(anotoHits.length <= 1, `acks: ${anotoHits.length} — ${reply.slice(0, 400)}`);
}

// 3) Horario deferral.
{
  assert.ok(clientDefersHorario("2 horarios ( aún no definidos )"));
  assert.ok(clientDefersHorario("Aún no sé definen"));
  assert.ok(clientDefersHorario("Aún no se definen"));
  assert.equal(parseHorarioFromText("2 horarios ( aún no definidos )"), "Sin definir (pendiente)");
  assert.equal(parseHorarioFromText("Aún no sé definen"), "Sin definir (pendiente)");

  assert.equal(detectPresupuestoRefusal("Aún no sé definen"), false);
  assert.equal(
    detectPresupuestoRefusalInContext(
      "Aún no sé definen",
      "¿En qué horario lo planean?"
    ),
    false
  );

  const filled = new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Número de invitados",
    "Fecha del evento",
    "Lugar/dirección del evento",
  ]);
  const extracted = emptyExtracted({
    nombre: "Suria",
    requerimientos_evento: "Banquete Formal, Mobiliario",
    num_invitados: 140,
    fecha_evento: "17 de diciembre",
    direccion_evento: "Presa Salinillas 370",
  });
  const reply = applyLucyMessageGuards({
    aiResponse: "¿A qué hora sería el evento?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      { role: "assistant", content: "¿En qué horario lo planean?" },
      { role: "user", content: "Aún no sé definen" },
    ] as never,
    currentMessage: "Aún no sé definen",
    whatsappDisplayName: "Suria",
    buildClosing: closing,
  });
  assert.ok(/pendiente|por definir|sin problema|entendido/i.test(reply), reply.slice(0, 400));
  assert.ok(!/a qu[eé] hora|en qu[eé] horario/i.test(reply), reply.slice(0, 400));
  assert.ok(filled.has("Horario del evento") || /sin definir/i.test(extracted.horario_evento ?? ""));
  assert.ok(!filled.has("Presupuesto (MXN)"), "no debe waiviar presupuesto");
}

// 4) Multi-line brief con horarios no definidos → no re-pide horario.
{
  const msg = `17 de diciembre
140 - primero 95 personas y luego 45
Presa salinillas 370
2 horarios ( aún no definidos )`;
  assert.ok(clientDefersHorario(msg));
  const filled = new Set(["Nombre del cliente", "Requerimientos o servicios"]);
  const extracted = emptyExtracted({
    nombre: "Suria",
    requerimientos_evento: "Banquete Formal, Mobiliario",
  });
  const reply = applyLucyMessageGuards({
    aiResponse: "¿Cuántos invitados tienen contemplados?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      {
        role: "assistant",
        content: "Perfecto. Anoto Banquete Formal y Mobiliario. ¿Cuántos invitados tienen contemplados?",
      },
    ] as never,
    currentMessage: msg,
    whatsappDisplayName: "Suria",
    buildClosing: closing,
  });
  assert.ok(!/en qu[eé] horario|a qu[eé] hora/i.test(reply), reply.slice(0, 500));
}

// 5) Historial vacío + CRM avanzado → no re-intro.
{
  const filled = new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Número de invitados",
    "Fecha del evento",
    "Lugar/dirección del evento",
  ]);
  const reply = applyLucyMessageGuards({
    aiResponse: "¿En qué horario lo planean?",
    extracted: emptyExtracted({
      nombre: "Suria",
      requerimientos_evento: "Banquete Formal, Mobiliario",
      num_invitados: 140,
      fecha_evento: "17 de diciembre",
      direccion_evento: "Presa Salinillas 370",
    }),
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [] as never,
    presentationHistory: [] as never,
    currentMessage: "Ya anexe la info",
    whatsappDisplayName: "Suria",
    buildClosing: closing,
  });
  assert.ok(!/soy lucy/i.test(reply), reply.slice(0, 400));
  assert.ok(!/buen d[ií]a\.?\s*soy lucy/i.test(reply), reply.slice(0, 400));
}

console.log("V9.80 class smoke OK");
