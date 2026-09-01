/**
 * Smoke A15547 Marisol — sin precios antes de info + qué incluye + soft decline.
 * node ./scripts/run-a15547-smoke.mjs
 */
import assert from "node:assert/strict";
import { parseSheetCatalogCsv } from "../services/googleSheetsCatalog.js";
import {
  setCatalogSnapshotForTests,
  buildSoloVsCompletoModeAnswer,
} from "../services/catalogService.js";
import { shouldOfferOptionsBeforeDetail } from "../services/serviceProgressiveOffer.js";
import { clientSoftDeclinesLead } from "../conversation-understanding.js";
import { applyLucyMessageGuards } from "../lucy-flow-guards.js";
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

function runGuards(opts: {
  aiResponse: string;
  extracted: ExtractedData;
  filledSet: Set<string>;
  currentMessage: string;
  history?: { role: string; content: string }[];
}): string {
  return applyLucyMessageGuards({
    aiResponse: opts.aiResponse,
    extracted: opts.extracted,
    filledSet: opts.filledSet,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: (opts.history ?? []) as never,
    currentMessage: opts.currentMessage,
    whatsappDisplayName: null,
    buildClosing: () => "Listo, el equipo arma tu cotización.",
    emailRefusedThisTurn: false,
  });
}

const csv = [
  '"Servicio","Nivel","Precio Unitario","Precio Minimo de salida","Catálogo Revisado","Que Incluye","Link catalogo"',
  '"Taquiza","Solo Alimentos","$300.00","$9,000.00","TRUE","5 guisados variados","https://bodasesor.com/catalogos/taquiza"',
  '"Taquiza","Basico","$750.00","$22,500.00","TRUE","Basico completo con bebidas y meseros","https://bodasesor.com/catalogos/taquiza"',
  '"Taquiza","Tradicional","$800.00","$24,000.00","TRUE","Trad completo","https://bodasesor.com/catalogos/taquiza"',
  '"Taquiza","Premium","$850.00","$25,500.00","TRUE","Prem completo","https://bodasesor.com/catalogos/taquiza"',
].join("\n");
setCatalogSnapshotForTests(parseSheetCatalogCsv(csv));

assert.equal(LUCY_PROMPT_VERSION, "V9.65");

const noPriceMenu = buildSoloVsCompletoModeAnswer("Taquiza", parseSheetCatalogCsv(csv));
assert.ok(/solo\s+alimentos/i.test(noPriceMenu), noPriceMenu.slice(0, 300));
assert.ok(/servicio\s+completo/i.test(noPriceMenu), noPriceMenu.slice(0, 300));
assert.ok(!/\$\s*\d/.test(noPriceMenu), `sin precios: ${noPriceMenu.slice(0, 400)}`);

assert.equal(
  shouldOfferOptionsBeforeDetail({
    currentMessage: "que incluye",
    history: [{ role: "assistant", content: noPriceMenu }],
    serviceHint: "Taquiza",
  }),
  null
);

assert.ok(clientSoftDeclinesLead("Gracias, me pongo en contacto si nos interesa"));

const taquizaTurn = runGuards({
  aiResponse:
    "Para *Taquiza* tenemos dos caminos:\n1. *Solo alimentos* — $300.00 /pp\n2. *Servicio completo* — desde $750.00 /pp\n\n¿Cuál te late más?",
  extracted: emptyExtracted({
    nombre: "Marisol",
    tipo_evento: "taquiza",
    requerimientos_evento: "Taquiza",
    num_invitados: 100,
    fecha_evento: "31 de agosto",
    horario_evento: "4:00 pm",
    direccion_evento: "CDMX",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Número de invitados",
    "Fecha del evento",
    "Horario del evento",
    "Lugar/dirección del evento",
  ]),
  currentMessage: "taquiza para 100 personas para el lunes 31 de agosto a las 4:00 pm",
  history: [
    { role: "user", content: "Quiero hacer una cotizacion" },
    { role: "assistant", content: "¿Me regalas tu nombre?" },
    { role: "user", content: "Marisol" },
    { role: "assistant", content: "¿Qué van a celebrar?" },
  ],
});
assert.ok(/solo\s+alimentos/i.test(taquizaTurn) && /servicio\s+completo/i.test(taquizaTurn), taquizaTurn.slice(0, 500));
assert.ok(!/\$\s*\d/.test(taquizaTurn), `Marisol sin precios: ${taquizaTurn.slice(0, 600)}`);

const inclusionTurn = runGuards({
  aiResponse: "Claro. ¿Quieres que te dé detalles de alguno?",
  extracted: emptyExtracted({
    nombre: "Marisol",
    tipo_evento: "taquiza",
    requerimientos_evento: "Taquiza",
    num_invitados: 100,
    fecha_evento: "31 de agosto",
    horario_evento: "4:00 pm",
    direccion_evento: "CDMX",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Número de invitados",
    "Fecha del evento",
    "Horario del evento",
    "Lugar/dirección del evento",
  ]),
  currentMessage: "que incluye",
  history: [
    { role: "assistant", content: noPriceMenu },
    { role: "user", content: "CDMX" },
  ],
});
assert.ok(!/detalles de alguno/i.test(inclusionTurn), inclusionTurn.slice(0, 400));
assert.ok(/incluye|guisados|taquiza|cat[aá]logo/i.test(inclusionTurn), inclusionTurn.slice(0, 500));

const softDecline = runGuards({
  aiResponse: "Perfecto, Marisol. ¿A qué correo te mando la información?",
  extracted: emptyExtracted({
    nombre: "Marisol",
    tipo_evento: "taquiza",
    requerimientos_evento: "Taquiza",
    num_invitados: 100,
    fecha_evento: "31 de agosto",
    horario_evento: "4:00 pm",
    direccion_evento: "CDMX",
  }),
  filledSet: new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
    "Número de invitados",
    "Fecha del evento",
    "Horario del evento",
    "Lugar/dirección del evento",
  ]),
  currentMessage: "Gracias, me pongo en contacto si nos interesa",
  history: [{ role: "assistant", content: "¿A qué correo te mando la información?" }],
});
assert.ok(/quedo a tu disposici/i.test(softDecline), softDecline.slice(0, 400));
assert.ok(!/correo|e-?mail/i.test(softDecline), softDecline.slice(0, 400));

console.log("A15547 smoke OK —", LUCY_PROMPT_VERSION);
