/**
 * Smoke V9.93 — A15165 Alejandro: saludo≠mobiliario, rechazo, banquete replace,
 * más servicios, email basura, ppto/ubicación limpios.
 * node ./scripts/run-v993-class-smoke.mjs
 */
import assert from "node:assert/strict";
import type { OpenAI } from "openai";
import {
  applyLucyMessageGuards,
  buildFirstInteractionMessage,
  buildMappedCatalogOfferBlock,
  buildPackageCatalogOfferBlock,
  buildStandardClosingMessage,
} from "../lucy-flow-guards.js";
import {
  clientAsksForRecommendations,
  clientNarrowsToOnlyService,
  mergeServiceRequirements,
  sanitizeDireccionCapture,
} from "../conversation-understanding.js";
import { clientDeclinesServiceFamilies } from "../services/serviceDecline.js";
import {
  looksLikeValidClientEmail,
  sanitizeStoredClientEmail,
} from "../client-email.js";
import {
  resolveResumenPresupuesto,
  buildResumenClienteLargo,
} from "../services/summaryService.js";
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

function runGuards(opts: {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  currentMessage?: string;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  forceFirstPresentation?: boolean;
  readyForClosing?: boolean;
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: opts.readyForClosing ?? false,
    cierreYaEnviado: false,
    emailRefusedThisTurn: false,
    history: opts.history ?? [],
    currentMessage: opts.currentMessage,
    forceFirstPresentation: opts.forceFirstPresentation,
    buildClosing: (s, n) => buildStandardClosingMessage(s, n),
  });
}

// --- Decline typo mobilairio ---
{
  const fams = clientDeclinesServiceFamilies("Pero yo no quiero Mobilairio");
  assert.ok(fams.includes("mobiliario"), String(fams));
}

// --- Narrow "estoy buscando banquete mexicano" replaces CRM ---
{
  assert.equal(
    clientNarrowsToOnlyService("Estoy buscando banquete mexicano"),
    "Banquete Mexicano"
  );
  const merged = mergeServiceRequirements(
    "Animación / Hora loca, Mobiliario",
    "Estoy buscando banquete mexicano",
    6
  );
  assert.match(merged ?? "", /Banquete Mexicano/i);
  assert.ok(!/Mobiliario/i.test(merged ?? ""), merged);
  assert.ok(!/Hora loca|Animaci/i.test(merged ?? ""), merged);
}

// --- Recommendations detectors ---
{
  assert.ok(clientAsksForRecommendations("Qué otros servicios manejas"));
  assert.ok(clientAsksForRecommendations("Tienes más servicios?"));
  assert.ok(clientAsksForRecommendations("Tienes más servicios"));
}

// --- Email sanitization ---
{
  assert.equal(looksLikeValidClientEmail("Am@gmial"), false);
  assert.equal(looksLikeValidClientEmail("A.gmail.com"), false);
  assert.equal(sanitizeStoredClientEmail("Am@gmial"), null);
  assert.equal(sanitizeStoredClientEmail("A.gmail.com"), null);
  assert.equal(sanitizeStoredClientEmail("a.juan@gmail.comm"), null);
  assert.equal(sanitizeStoredClientEmail("juan@gmail.com"), "juan@gmail.com");
}

// --- Ubicación "CDMX, espera" ---
{
  const z = sanitizeDireccionCapture("CDMX, espera");
  assert.equal(z, "CDMX");
}

// --- Presupuesto basura en resumen ---
{
  const garbage =
    "Hola Alejandro Pero yo no quiero Mobilairio Estoy buscando banquete mexicano Si";
  const ppto = resolveResumenPresupuesto(
    emptyExtracted({ presupuesto: garbage as unknown as number }),
    [`- Presupuesto (MXN): ${garbage}`],
    garbage
  );
  assert.equal(ppto, null);
}

// --- Hola + CRM Mobiliario stale → no anotar mobiliario ---
{
  const extracted = emptyExtracted({
    nombre: "Alejandro",
    requerimientos_evento: "Animación / Hora loca, Mobiliario",
    tipo_evento: "corporativo",
    direccion_evento: "CDMX, espera",
    fecha_evento: "en 3 meses",
  });
  const filled = new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Tipo de evento",
    "Lugar/dirección del evento",
    "Fecha del evento",
  ]);
  const first = buildFirstInteractionMessage(
    {
      extracted,
      filledSet: filled,
      history: [],
      currentMessage: "Hola",
      entityId: "A15165",
    },
    true
  );
  assert.ok(!/anoto \*mobiliario\*/i.test(first), first);
  assert.ok(!/mesas y sillas/i.test(first), first);
  assert.ok(!/periqueras/i.test(first), first);

  const reply = runGuards({
    aiResponse: "Perfecto — anoto *mobiliario*. ¿Mesas y sillas?",
    extracted,
    filledSet: filled,
    currentMessage: "Hola",
    forceFirstPresentation: true,
    history: [],
  });
  assert.ok(!/anoto \*mobiliario\*/i.test(reply), reply);
  assert.ok(!/periqueras/i.test(reply), reply);
}

// --- Decline mobiliario → no catálogo periqueras ---
{
  const extracted = emptyExtracted({
    nombre: "Alejandro",
    requerimientos_evento: "Animación / Hora loca, Mobiliario",
    tipo_evento: "corporativo",
    num_invitados: null,
  });
  const filled = new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Tipo de evento",
  ]);
  const reply = runGuards({
    aiResponse: "Te dejo periqueras: https://bodasesor.com/catalogos/salas-y-periqueras",
    extracted,
    filledSet: filled,
    currentMessage: "Pero yo no quiero Mobilairio",
    history: [
      { role: "assistant", content: "¿Te gustaría mesas y sillas, periqueras, o ambas?" },
    ],
  });
  assert.ok(!/periqueras/i.test(reply), reply);
  assert.ok(!/mesas-y-sillas/i.test(reply), reply);
  assert.ok(!/Mobilairio/i.test(extracted.requerimientos_evento ?? ""), extracted.requerimientos_evento);
  assert.ok(!/Mobiliario/i.test(extracted.requerimientos_evento ?? ""), extracted.requerimientos_evento);
}

// --- Catálogo: banquete con link, sin bullets muertos de Mobiliario ---
{
  const block = buildMappedCatalogOfferBlock(
    ["Banquete Mexicano", "Mobiliario", "Animación / Hora loca"],
    "Estoy buscando banquete mexicano"
  );
  assert.match(block, /banquete-mexicano/i);
  assert.ok(!/^\s*• \*Mobiliario\*\s*$/m.test(block), block);
  assert.ok(!/^\s*• \*Animaci/m.test(block), block);

  const pkg = buildPackageCatalogOfferBlock(
    ["Banquete Mexicano"],
    "Si unos 100"
  );
  assert.match(pkg, /banquete-mexicano|catálogo/i);
}

// --- Más servicios → no pregunta horario ---
{
  const extracted = emptyExtracted({
    nombre: "Alejandro",
    requerimientos_evento: "Banquete Mexicano",
    tipo_evento: "evento con banquete",
    num_invitados: 100,
    fecha_evento: "en 3 meses",
    direccion_evento: "CDMX",
  });
  const filled = new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Tipo de evento",
    "Número de invitados",
    "Fecha del evento",
    "Lugar/dirección del evento",
  ]);
  for (const msg of ["Qué otros servicios manejas", "Tienes más servicios?"]) {
    const reply = runGuards({
      aiResponse: "Perfecto. ¿A qué hora sería el evento?",
      extracted: { ...extracted },
      filledSet: new Set(filled),
      currentMessage: msg,
      history: [
        {
          role: "assistant",
          content: "Con lo que pediste… banquete mexicano. ¿A qué hora sería el evento?",
        },
      ],
    });
    assert.ok(!/horario|a qu[eé] hora/i.test(reply), `${msg} → ${reply}`);
    assert.ok(
      /servicio|banquete|taquiza|barra|cat[aá]logo|mobiliario|coffee/i.test(reply),
      `${msg} → ${reply}`
    );
  }
}

// --- Ya te lo di tras correo ilegible ---
{
  const extracted = emptyExtracted({
    nombre: "Alejandro",
    requerimientos_evento: "Banquete Mexicano",
    tipo_evento: "evento con banquete",
    num_invitados: 100,
    fecha_evento: "en 3 meses",
    horario_evento: "10 am",
    direccion_evento: "CDMX",
    correo: null,
  });
  const filled = new Set([
    "Nombre del cliente",
    "Requerimientos o servicios",
    "Tipo de evento",
    "Número de invitados",
    "Fecha del evento",
    "Horario del evento",
    "Lugar/dirección del evento",
  ]);
  const reply = runGuards({
    aiResponse: "Perfecto. Ya lo tengo anotado. ¿A qué correo te mando la información?",
    extracted,
    filledSet: filled,
    currentMessage: "Ya te lo di",
    history: [
      { role: "user", content: "Am@gmial" },
      { role: "assistant", content: "¿A qué correo le paso la info a nuestro equipo?" },
      { role: "user", content: "A.gmail.com" },
      { role: "assistant", content: "Si gustas, ¿a qué correo le paso la info a nuestro equipo?" },
    ],
  });
  assert.ok(/correo|gmail\.com/i.test(reply), reply);
  assert.ok(!/Ya lo tengo anotado/i.test(reply), reply);
}

// --- Resumen limpio ubicación + sin ppto basura ---
{
  const extracted = emptyExtracted({
    nombre: "Alejandro",
    correo: null,
    direccion_evento: "CDMX, espera",
    requerimientos_evento: "Banquete Mexicano",
    tipo_evento: "evento con banquete",
    num_invitados: 100,
    fecha_evento: "en 3 meses",
    horario_evento: "10 am",
    presupuesto: "Hola Alejandro Pero yo no quiero Mobilairio" as unknown as number,
  });
  const merged = [
    "- Nombre del cliente: Alejandro",
    "- Tipo de evento: evento con banquete",
    "- Requerimientos o servicios: Banquete Mexicano",
    "- Número de invitados: 100",
    "- Lugar/dirección del evento: CDMX, espera",
    "- Fecha del evento: en 3 meses",
    "- Horario del evento: 10 am",
    "- Presupuesto (MXN): Hola Alejandro Pero yo no quiero Mobilairio Estoy buscando banquete mexicano Si",
  ];
  const resumen = buildResumenClienteLargo(extracted, merged, "Estoy buscando banquete mexicano Si unos 100");
  assert.match(resumen, /CDMX/);
  assert.ok(!/espera/i.test(resumen), resumen);
  assert.ok(!/Presupuesto:.*Hola Alejandro/i.test(resumen), resumen);
  assert.ok(!/Mobiliario/i.test(resumen) || /Pendiente/i.test(resumen), resumen);
}

console.log("V9.93 class smoke OK —", LUCY_PROMPT_VERSION);
