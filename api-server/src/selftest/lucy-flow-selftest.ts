/**
 * Pruebas rápidas del flujo Lucy (sin OpenAI).
 */
import assert from "node:assert/strict";
import {
  parsePresupuestoFromText,
  parseInvitadosFromText,
  clientMentionsCatering,
  clientAsksPhone,
  parsePrimaryService,
  scanConversationForCaptures,
} from "../conversation-understanding.js";
import { advisorLabelForClient, normalizeAdvisorReferences } from "../lib/bodasesorAdvisor.js";
import { buildResumenClienteLargo } from "../services/summaryService.js";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ok ${name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL ${name}:`, msg);
    process.exitCode = 1;
  }
}

console.log("Lucy flow selftest\n");

test("60 no es presupuesto sin contexto", () => {
  assert.equal(parsePresupuestoFromText("60"), null);
});

test("60 sí es invitados", () => {
  assert.equal(parseInvitadosFromText("60"), "60");
});

test("presupuesto con contexto de pregunta", () => {
  assert.ok(parsePresupuestoFromText("80000", { askedField: "presupuesto" }));
});

test("50000 es presupuesto bare", () => {
  assert.ok(parsePresupuestoFromText("50000"));
});

test("no sé aún marca invitados pendientes", () => {
  const inv = parseInvitadosFromText("No sé aún");
  assert.ok(inv?.includes("Sin definir"));
});

test("busco comida detecta catering", () => {
  assert.equal(clientMentionsCatering("Busco comida"), true);
});

test("busco comida mapea a servicio", () => {
  assert.equal(parsePrimaryService("Busco comida"), "banquete / taquiza");
});

test("scan no captura 60 como presupuesto", () => {
  const filled = new Set<string>();
  const caps = scanConversationForCaptures([], "60", filled);
  const pres = caps.find((c) => c.label === "Presupuesto (MXN)");
  assert.equal(pres, undefined);
  const inv = caps.find((c) => c.label === "Número de invitados");
  assert.equal(inv?.value, "60");
});

test("cliente Alejandro evita nombre asesor en cierre", () => {
  assert.equal(advisorLabelForClient("Alejandro"), "nuestro equipo");
  const fixed = normalizeAdvisorReferences(
    "Voy a pasarle esta información a Alejandro para que te prepare una cotización.",
    "Alejandro"
  );
  assert.ok(fixed.includes("nuestro equipo"));
  assert.ok(!/\bAlejandro\b.*cotiz/i.test(fixed));
});

test("resumen largo sin emoji y con comida", () => {
  const text = buildResumenClienteLargo(
    {
      nombre: "Alejandro",
      correo: null,
      presupuesto: null,
      direccion_evento: "CDMX",
      requerimientos_evento: "banquete / taquiza",
      fecha_horario: "en 2 meses",
      num_invitados: 60,
      tipo_evento: "cumpleaños",
      tipo_contacto: "cliente",
      empresa: null,
      telefono: null,
    },
    [
      "- Nombre del cliente: Alejandro",
      "- Tipo de evento: cumpleaños",
      "- Requerimientos o servicios: banquete / taquiza",
      "- Número de invitados: 60",
    ],
    "cumpleaños busco comida 60 CDMX"
  );
  assert.ok(!text.includes("📋"));
  assert.ok(text.includes("banquete"));
});

test("cliente pregunta teléfono", () => {
  assert.equal(clientAsksPhone("¿Tienen teléfono de ventas?"), true);
});

console.log(`\n${passed} pruebas OK`);
