/**
 * Smoke A16121 Jazmin — "nos gustaría ser uno de sus provedores" → embudo proveedor.
 * node ./scripts/run-a16121-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  looksLikeProveedorOutreach,
  normalizeProveedorText,
  resolveTipoContacto,
} from "../tipoContacto.js";
import {
  applyProveedorAnswer,
  buildProveedorProgressReply,
  getNextProveedorQuestion,
} from "../lib/proveedorQuestionnaire.js";
import { scrubClientFieldsForProveedor } from "../lib/proveedorHandoff.js";
import { emptyExtractedData } from "../types.js";
import { LUCY_PROMPT_VERSION } from "../lib/lucyRelease.js";

assert.equal(LUCY_PROMPT_VERSION, "V10.20");

const jazmin = "nos gustaría ser uno de sus provedores";
assert.equal(normalizeProveedorText(jazmin), "nos gustaría ser uno de sus proveedores");
assert.ok(looksLikeProveedorOutreach(jazmin), jazmin);
assert.equal(resolveTipoContacto("cliente", jazmin), "proveedor");
assert.equal(
  resolveTipoContacto(null, "Hola Buena Tarde claro jazmin Viveros " + jazmin, jazmin),
  "proveedor"
);
assert.equal(resolveTipoContacto("proveedor", jazmin), "proveedor");

// Variantes frecuentes
for (const msg of [
  "queremos ser proveedores de ustedes",
  "me gustaría ser uno de sus proveedores",
  "quiero ser proveedor",
  "somos proveedores y buscamos aliarnos",
]) {
  assert.ok(looksLikeProveedorOutreach(msg) || resolveTipoContacto(null, msg) === "proveedor", msg);
}

// No confundir con cliente que busca proveedor de catering.
assert.ok(!looksLikeProveedorOutreach("busco proveedor de catering para mi boda"));
assert.equal(resolveTipoContacto(null, "busco proveedor de catering para mi boda"), "cliente");

const extracted = scrubClientFieldsForProveedor(
  emptyExtractedData({
    tipo_contacto: "proveedor",
    nombre: "Jazmin Viveros",
  })
);
assert.equal(getNextProveedorQuestion(extracted), "oferta");

const progress = buildProveedorProgressReply(extracted);
assert.ok(/ofrecen|servicios o productos|proveedor|aliado/i.test(progress), progress);
assert.ok(!/qu[eé] necesitas cotizar|tipo de evento|invitados|presupuesto/i.test(progress), progress);
assert.ok(!/4671\s*0585|gerencia/i.test(progress), progress);

applyProveedorAnswer(extracted, jazmin);
assert.ok(!extracted.proveedor_oferta?.trim(), `intent-only must not fill oferta: ${extracted.proveedor_oferta}`);
assert.equal(getNextProveedorQuestion(extracted), "oferta");

applyProveedorAnswer(extracted, "Ofrecemos mobiliario y sillas Tiffany");
assert.ok(extracted.proveedor_oferta?.trim() && extracted.proveedor_oferta !== "—");
assert.equal(getNextProveedorQuestion(extracted), "estado");

console.log("A16121 smoke OK —", LUCY_PROMPT_VERSION);
