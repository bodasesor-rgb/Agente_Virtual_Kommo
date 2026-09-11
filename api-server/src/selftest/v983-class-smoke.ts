/**
 * Smoke V9.83 — A15910 Ernesto:
 * - mesa de dulces ≠ renta de mesas/sillas/mobiliario
 * - "solo cotizar la mesa de dulces" quita Banquete Formal del CRM
 * - "después de las 3 de la tarde" es horario usable
 * - "Teoloyucan estado de México" conserva el municipio
 * - "aún no se sabe el salón" no marca presupuesto Sin definir
 * node ./scripts/run-v983-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  parseHorarioFromText,
  isUsableHorarioEvento,
  parseZonaFromText,
  parsePresupuestoFromText,
  clientNarrowsToOnlyService,
  parseServicesFromText,
} from "../conversation-understanding.js";
import {
  applyLucyMessageGuards,
} from "../lucy-flow-guards.js";
import {
  buildGuardServiceAck,
  buildMobiliarioRentDetailReply,
} from "../services/serviceKnowledge.js";
import {
  detectProgressiveFamily,
  parseMobiliarioPieceChoice,
  buildProgressiveOptionsMenu,
} from "../services/serviceProgressiveOffer.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

assert.equal(LUCY_PROMPT_VERSION, "V9.98");

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

// 1) Mesa de dulces ≠ mobiliario.
{
  assert.equal(
    buildMobiliarioRentDetailReply("Sería solo cotizar la mesa de dulces para 500 personas"),
    null
  );
  assert.equal(parseMobiliarioPieceChoice("mesa de dulces para 500"), null);
  assert.notEqual(
    detectProgressiveFamily("Tienes el de mesa de dulces para 500 personas"),
    "mobiliario"
  );
  const ack = buildGuardServiceAck("Tienes el de mesa de dulces para 500 personas");
  assert.match(ack, /mesa de dulces/i);
  assert.ok(!/mesas y sillas|renta de mesas|\*mobiliario\*/i.test(ack), ack);
  const mobMenu = buildProgressiveOptionsMenu("mobiliario");
  assert.ok(!/mesa de dulces/i.test(mobMenu));
}

// 2) Solo cotizar mesa de dulces → un SKU.
{
  assert.equal(
    clientNarrowsToOnlyService("Sería solo cotizar la mesa de dulces para 500 personas"),
    "Mesa de dulces"
  );
  const extracted = emptyExtracted({
    nombre: "Ernesto Sánchez",
    correo: "ernestosace03@hotmail.com",
    direccion_evento: "Teoloyucan, Estado de México",
    fecha_evento: "19 de diciembre",
    horario_evento: "4 de la tarde",
    num_invitados: 500,
    requerimientos_evento: "Banquete Formal, Mesa de dulces",
    presupuesto: "Sin definir (cliente indicó que no tiene)",
  });
  const filled = new Set([
    "Nombre del cliente",
    "Correo electrónico",
    "Lugar/dirección del evento",
    "Fecha y horario",
    "Número de invitados",
    "Requerimientos o servicios",
    "Presupuesto (MXN)",
  ]);
  const reply = applyLucyMessageGuards({
    aiResponse:
      "¡Hola! Buen día. Soy Lucy, agente virtual de Bodasesor. Te ayudo con la renta de mesas, sillas y mobiliario. ¡Mucho gusto, Ernesto! Si gustas, ¿a qué correo le paso la info a nuestro equipo?",
    extracted,
    filledSet: filled,
    readyForClosing: true,
    cierreYaEnviado: false,
    history: [
      { role: "assistant", content: "Perfecto. ¿Manejan algún presupuesto estimado?" },
      { role: "user", content: "No" },
    ] as never,
    currentMessage: "Sería solo cotizar la mesa de dulces para 500 personas",
    whatsappDisplayName: "Ernesto Sánchez",
    buildClosing: () => "Perfecto, ya tengo todo para cotizar la mesa de dulces.",
  });
  assert.equal(extracted.requerimientos_evento, "Mesa de dulces");
  assert.ok(!/Soy Lucy/i.test(reply), reply.slice(0, 400));
  assert.ok(!/renta de mesas, sillas/i.test(reply), reply.slice(0, 400));
  assert.ok(!/a qu[eé] correo/i.test(reply), reply.slice(0, 400));
}

// 3) Horario "después de las 3…"
{
  const h = parseHorarioFromText("Sería después de las 3 de la tarde");
  assert.ok(h && /despu[eé]s de las 3/i.test(h), String(h));
  assert.ok(isUsableHorarioEvento(h));
}

// 4) Teoloyucan + Estado de México.
{
  const zona = parseZonaFromText(
    "Teoloyucan estado de México y aún no se sabe el salón"
  );
  assert.ok(zona && /teoloyucan/i.test(zona), String(zona));
  assert.ok(/m[eé]xico/i.test(zona!), String(zona));
}

// 5) Aún no el salón ≠ presupuesto.
{
  assert.equal(
    parsePresupuestoFromText("Teoloyucan estado de México y aún no se sabe el salón"),
    null
  );
}

// 6) Parse servicios del brief.
{
  const svcs = parseServicesFromText("mesa de dulces para 500 personas");
  assert.ok(svcs.some((s) => /mesa de dulces/i.test(s)), svcs.join(","));
}

console.log("V9.83 class smoke OK —", LUCY_PROMPT_VERSION);
