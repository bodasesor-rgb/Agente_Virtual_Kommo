/**
 * Smoke A16075 — embudo proveedor + recovery a cliente.
 * node ./scripts/run-a16075-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  resolveTipoContacto,
  looksLikeClienteCorrection,
} from "../tipoContacto.js";
import {
  applyProveedorAnswer,
  buildProveedorProgressReply,
  getNextProveedorQuestion,
  proveedorQuestionnaireComplete,
  scrubProveedorFieldsForCliente,
} from "../lib/proveedorQuestionnaire.js";
import { scrubClientFieldsForProveedor } from "../lib/proveedorHandoff.js";
import { prepareLucyExtraction, generateLucyOutbound } from "../lucyTurnProcessor.js";
import { emptyExtractedData, type ExtractedData } from "../types.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";
import { proveedorSheetsConfigured } from "../services/proveedorSheets.js";
import type OpenAI from "openai";

assert.equal(LUCY_PROMPT_VERSION, "V10.13");

const lety =
  "Hola Lucy. Te escribe Lety, soy ejecutiva de ventas en Hacienda Los Arcángeles, " +
  "te invito a registrarte en nuestra base de datos para ser parte de nuestra red de aliados comerciales.";

assert.equal(resolveTipoContacto("cliente", lety), "proveedor");
assert.equal(
  resolveTipoContacto("proveedor", lety + " Quiero cotizar banquete para mi boda", "Quiero cotizar banquete para mi boda"),
  "cliente"
);
assert.ok(looksLikeClienteCorrection("No soy proveedor, quiero cotizar mi boda"));

const base = scrubClientFieldsForProveedor(
  emptyExtractedData({
    tipo_contacto: "proveedor",
    nombre: "Lety",
    empresa: "Hacienda Los Arcángeles",
  })
);
applyProveedorAnswer(base, lety);
assert.ok(base.proveedor_oferta?.trim(), base.proveedor_oferta);
assert.equal(getNextProveedorQuestion(base), "estado");
assert.equal(proveedorQuestionnaireComplete(base), false);

const progress = buildProveedorProgressReply(base);
assert.ok(/estado|cobertura|República/i.test(progress), progress);
assert.ok(!/tipo de evento|invitados|presupuesto del evento/i.test(progress), progress);

applyProveedorAnswer(base, "CDMX y Estado de México");
assert.ok(base.proveedor_estado, base.proveedor_estado);
applyProveedorAnswer(base, "https://drive.google.com/file/d/abc/view");
assert.ok(base.proveedor_catalogo, base.proveedor_catalogo);
applyProveedorAnswer(base, "lety@hacienda.com");
assert.ok(base.correo, base.correo);
assert.equal(proveedorQuestionnaireComplete(base), true);

const doneReply = buildProveedorProgressReply(base);
assert.ok(/equipo|proveedores|alianzas/i.test(doneReply), doneReply);

// Recovery scrub
const recovered = emptyExtractedData({
  tipo_contacto: "proveedor",
  requerimientos_evento: "PROVEEDOR: X - Ofrece: Y",
  proveedor_oferta: "Y",
  proveedor_estado: "CDMX",
});
scrubProveedorFieldsForCliente(recovered);
assert.equal(recovered.tipo_contacto, "cliente");
assert.equal(recovered.proveedor_oferta, null);
assert.equal(recovered.requerimientos_evento, null);

const { extracted, proveedorRecoveredToCliente } = await prepareLucyExtraction({
  fullHistory: [
    { role: "user", content: lety },
    { role: "assistant", content: "¿En qué estado operan?" },
  ],
  messageText: "No soy proveedor, quiero cotizar mi boda el 20 de diciembre",
  crmLines: ["- Requerimientos o servicios: PROVEEDOR: Hacienda - Ofrece: alianza"],
  extractFn: async () =>
    emptyExtractedData({
      tipo_contacto: "proveedor",
      nombre: "Lety",
      empresa: "Hacienda Los Arcángeles",
      requerimientos_evento: "PROVEEDOR: Hacienda - Ofrece: alianza",
      proveedor_oferta: "alianza",
    }),
});
assert.equal(extracted.tipo_contacto, "cliente");
assert.equal(proveedorRecoveredToCliente, true);

const outbound = await generateLucyOutbound({
  messageText: lety,
  history: [],
  fullHistory: [],
  extracted: emptyExtractedData({
    tipo_contacto: "proveedor",
    nombre: "Lety",
    empresa: "Hacienda Los Arcángeles",
  }),
  crmContext: "",
  crmMergedLines: [],
  filledLabels: new Set(),
  allFieldsFilled: false,
  isFirstInteraction: true,
  cierreYaEnviado: false,
  whatsappDisplayName: "Lety",
  conversationText: lety,
  openai: { chat: { completions: { create: async () => ({}) } } } as unknown as OpenAI,
  buildClosing: () => "CIERRE",
});
assert.equal(outbound.proveedorReadyForHandoff, false);
assert.ok(/estado|cobertura|ofrecen|catálogo|correo/i.test(outbound.mensajeParaCliente), outbound.mensajeParaCliente);

// Sheets helper is importable (credentials may be absent in CI).
assert.equal(typeof proveedorSheetsConfigured(), "boolean");

console.log("A16075 smoke OK —", LUCY_PROMPT_VERSION);
