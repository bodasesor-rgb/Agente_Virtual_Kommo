/**
 * Smoke V9.77 — A15878 Tania Aguilar (DMC Meetings):
 * - "55" tras "¿cuántos invitados?" es aforo, no horario
 * - "De momento no" cierra el presupuesto (no se vuelve a preguntar)
 * - "evento empresarial" es tipo de evento, no los servicios que pide
 * - la ciudad del cliente no se borra por parecerse al nombre
 * - tras "Gracias por tu correo" no va un segundo acuse ("Recibido, Tania.")
 * node ./scripts/run-v977-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  detectPresupuestoRefusal,
  detectPresupuestoRefusalInContext,
  isSoftDeferralNo,
  isNegativeOnlyReply,
  isSimpleClockTime,
  parseHorarioFromText,
  parseZonaFromText,
} from "../conversation-understanding.js";
import {
  applyLucyMessageGuards,
  getNextPendingField,
  isValidRequerimientosValue,
} from "../lucy-flow-guards.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import type { ExtractedData } from "../types.js";

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

const closing = (svc: string | null, nombre: string | null) =>
  `Perfecto, ya tengo todo${nombre ? `, ${nombre}` : ""}. Le paso ${svc ?? "tu evento"} al equipo.`;

assert.equal(LUCY_PROMPT_VERSION, "V9.78");

// 1) Un número suelto no es hora si no cabe en el reloj; "55" tras invitados es aforo.
{
  assert.equal(isSimpleClockTime("55"), false);
  assert.equal(isSimpleClockTime("25"), false);
  assert.equal(parseHorarioFromText("55"), null);
  assert.ok(isSimpleClockTime("18"));
  assert.ok(isSimpleClockTime("8 pm"));
  assert.ok(isSimpleClockTime("16:00"));

  const extracted = emptyExtracted({ nombre: "Tania Aguilar", tipo_evento: "evento empresarial" });
  const filled = new Set<string>(["Nombre del cliente", "Tipo de evento"]);
  const reply = applyLucyMessageGuards({
    aiResponse: "Perfecto, Tania. ¿Qué día tienen en mente?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      { role: "user", content: "Es un evento empresarial" },
      { role: "assistant", content: "Claro que sí. ¿Cuántos invitados tienen contemplados?" },
    ],
    currentMessage: "55",
    whatsappDisplayName: "Tania Aguilar",
    entityId: "A15878-invitados",
  });
  assert.equal(/horario/i.test(reply), false, reply);
  assert.equal(extracted.horario_evento, null);
  assert.equal(extracted.num_invitados, 55);
}

// 2) "De momento no" = no hay presupuesto: se anota el waiver y no se re-pregunta.
{
  const askPresupuesto = "¿Tienen algún presupuesto estimado en mente para esta propuesta?";
  const askServicios = "Con el Carpas, ¿necesitan algún otro servicio?";
  for (const t of ["De momento no", "Por ahora no", "Por el momento no", "Aún no"]) {
    assert.ok(isSoftDeferralNo(t), t);
    assert.ok(isNegativeOnlyReply(t), t);
    assert.ok(detectPresupuestoRefusalInContext(t, askPresupuesto), t);
    // Tras "¿necesitan otro servicio?" el mismo texto declina servicios, no presupuesto.
    assert.equal(detectPresupuestoRefusalInContext(t, askServicios), false, t);
    assert.equal(detectPresupuestoRefusal(t), false, t);
  }
  // Y no es una ciudad.
  assert.equal(parseZonaFromText("De momento no"), null);

  const extracted = emptyExtracted({
    nombre: "Tania Aguilar",
    correo: "experiencias@dmcmeetingsmexico.com",
    tipo_evento: "evento empresarial",
    requerimientos_evento: "Banquete Formal",
    num_invitados: 55,
    fecha_evento: "11 de diciembre",
    horario_evento: "de 14 a 18 hrs",
    direccion_evento: "Santa Fe",
  });
  const filled = new Set<string>([
    "Nombre del cliente",
    "Correo electrónico",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Número de invitados",
    "Fecha del evento",
    "Horario del evento",
    "Lugar/dirección del evento",
  ]);
  const reply = applyLucyMessageGuards({
    aiResponse:
      "Entendido, Tania. No te preocupes, le paso todos los detalles a nuestro equipo. ¿Manejan algún presupuesto estimado?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      {
        role: "assistant",
        content: "Gracias por tu correo, Tania. ¿Tienen algún presupuesto estimado en mente?",
      },
    ],
    currentMessage: "De momento no",
    whatsappDisplayName: "Tania Aguilar",
    entityId: "A15878-presupuesto",
    buildClosing: closing,
  });
  assert.equal(/presupuesto|rango|inversi[oó]n|estimado/i.test(reply), false, reply);
  assert.ok(filled.has("Presupuesto (MXN)"), "waiver de presupuesto");
  // La ciudad sigue viva tras el turno.
  assert.equal(extracted.direccion_evento, "Santa Fe");
}

// 3) El tipo de evento no cuenta como "qué servicios necesita".
{
  assert.equal(isValidRequerimientosValue("evento empresarial"), false);
  assert.equal(isValidRequerimientosValue("un evento"), false);
  assert.equal(isValidRequerimientosValue("evento corporativo"), false);
  assert.ok(isValidRequerimientosValue("Banquete"));
  assert.ok(isValidRequerimientosValue("carpas y meseros"));

  assert.equal(
    getNextPendingField(
      emptyExtracted({
        nombre: "Tania",
        tipo_evento: "evento empresarial",
        requerimientos_evento: "evento empresarial",
      }),
      new Set(["Nombre del cliente", "Tipo de evento"])
    ),
    "requerimientos"
  );
}

// 4) La ciudad no se borra por parecerse (o no) al nombre del cliente.
{
  for (const ciudad of ["Santa Fe", "Pachuca", "Insurgentes Sur 1446"]) {
    const extracted = emptyExtracted({
      nombre: "Tania Aguilar",
      tipo_evento: "evento empresarial",
      requerimientos_evento: "Banquete Formal",
      direccion_evento: ciudad,
    });
    const filled = new Set<string>([
      "Nombre del cliente",
      "Tipo de evento",
      "Requerimientos o servicios",
      "Lugar/dirección del evento",
    ]);
    applyLucyMessageGuards({
      aiResponse: "Perfecto, Tania.",
      extracted,
      filledSet: filled,
      readyForClosing: false,
      emailRefusedThisTurn: false,
      history: [{ role: "assistant", content: "¿En qué ciudad se llevará a cabo?" }],
      currentMessage: "ok",
      whatsappDisplayName: "Tania Aguilar",
      entityId: `A15878-zona-${ciudad}`,
      buildClosing: closing,
    });
    assert.equal(extracted.direccion_evento, ciudad, `se perdió la zona: ${ciudad}`);
  }

  // La dirección que SÍ es el nombre del cliente se sigue limpiando.
  const conNombre = emptyExtracted({
    nombre: "Tania Aguilar",
    tipo_evento: "evento empresarial",
    direccion_evento: "Tania Aguilar",
  });
  applyLucyMessageGuards({
    aiResponse: "Perfecto, Tania.",
    extracted: conNombre,
    filledSet: new Set(["Nombre del cliente", "Tipo de evento", "Lugar/dirección del evento"]),
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [{ role: "assistant", content: "¿En qué ciudad se llevará a cabo?" }],
    currentMessage: "ok",
    whatsappDisplayName: "Tania Aguilar",
    entityId: "A15878-zona-nombre",
    buildClosing: closing,
  });
  assert.equal(conNombre.direccion_evento, null);
}

// 5) Tras "Gracias por tu correo" no va un segundo acuse del modelo.
{
  const extracted = emptyExtracted({
    nombre: "Tania Aguilar",
    correo: "experiencias@dmcmeetingsmexico.com",
    tipo_evento: "evento empresarial",
    requerimientos_evento: "Banquete Formal",
    num_invitados: 55,
    fecha_evento: "11 de diciembre",
    horario_evento: "de 14 a 18 hrs",
    direccion_evento: "Santa Fe",
  });
  const filled = new Set<string>([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Número de invitados",
    "Fecha del evento",
    "Horario del evento",
    "Lugar/dirección del evento",
    "Correo electrónico",
  ]);
  const reply = applyLucyMessageGuards({
    aiResponse:
      "Recibido, Tania. ¿Tienen algún presupuesto estimado en mente para esta propuesta?",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    emailRefusedThisTurn: false,
    history: [
      { role: "assistant", content: "Perfecto, Tania. ¿A qué correo le paso la info?" },
    ],
    currentMessage: "experiencias@dmcmeetingsmexico.com",
    whatsappDisplayName: "Tania Aguilar",
    entityId: "A15878-correo",
    buildClosing: closing,
  });
  assert.equal(/recibido,\s*tania/i.test(reply), false, reply);
  assert.ok((reply.match(/\bgracias\b/gi) ?? []).length <= 1, reply);
}

console.log("V9.77 class smoke OK");
