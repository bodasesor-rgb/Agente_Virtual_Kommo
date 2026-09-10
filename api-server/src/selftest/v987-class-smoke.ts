/**
 * Smoke V9.87 — A15936: catálogo del servicio pedido + general (no solo hub).
 * node ./scripts/run-v987-class-smoke.mjs
 */
import assert from "node:assert/strict";
import {
  buildCatalogWebLinkReply,
  buildServicePlusGeneralCatalogReply,
  GENERAL_CATALOG_INVITE,
} from "../services/catalogService.js";
import { getCatalogWebUrlForQuery } from "../services/catalogWebKnowledge.js";
import {
  buildMappedCatalogOfferBlock,
  buildPackageCatalogOfferBlock,
  applyLucyMessageGuards,
} from "../lucy-flow-guards.js";
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

// 1) Embeds resuelven servicios concretos.
{
  assert.match(getCatalogWebUrlForQuery("barra de pizzas") ?? "", /barra-de-pizzas/);
  assert.match(getCatalogWebUrlForQuery("taquiza") ?? "", /taquiza/);
  assert.match(getCatalogWebUrlForQuery("coffee break") ?? "", /coffee-break/);
  assert.match(getCatalogWebUrlForQuery("banquete mexicano") ?? "", /banquete-mexicano/);
}

// 2) Reply de catálogo: servicio + invite general.
{
  const reply = buildCatalogWebLinkReply({
    query: "barra de pizzas",
    wantFull: false,
  });
  assert.match(reply, /barra-de-pizzas/);
  assert.match(reply, /bodasesor\.com\/catalogos(?!\/)/);
  assert.match(reply, new RegExp(GENERAL_CATALOG_INVITE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(!/^Claro\. Aquí tienes el catálogo general/i.test(reply), reply);
}

{
  const plus = buildServicePlusGeneralCatalogReply({ query: "Taquiza" });
  assert.match(plus, /taquiza/);
  assert.match(plus, new RegExp(GENERAL_CATALOG_INVITE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

// 3) Mapped block: links del servicio + general invite.
{
  const mapped = buildMappedCatalogOfferBlock(["Barra de pizzas"], "quiero pizzas");
  assert.match(mapped, /barra-de-pizzas/);
  assert.match(mapped, new RegExp(GENERAL_CATALOG_INVITE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(!/^Te dejo el catálogo general/i.test(mapped), mapped);

  const pkg = buildPackageCatalogOfferBlock(["Coffee break"], "coffee break");
  assert.match(pkg, /coffee-break/);
  assert.match(pkg, /Igual te envío el catálogo general/i);
}

// 4) Cliente pide catálogo con CRM de banquete → no solo hub.
{
  const extracted = emptyExtracted({
    nombre: "Fernanda",
    tipo_evento: "evento corporativo",
    requerimientos_evento: "Banquete Formal",
  });
  const filled = new Set([
    "Nombre del cliente",
    "Tipo de evento",
    "Requerimientos o servicios",
  ]);
  const reply = applyLucyMessageGuards({
    aiResponse: "Te dejo el catálogo general https://bodasesor.com/catalogos",
    extracted,
    filledSet: filled,
    readyForClosing: false,
    cierreYaEnviado: false,
    history: [
      {
        role: "assistant",
        content:
          "Claro. En *banquete* manejamos Formal/Mexicano… ¿Quieres que te mande el catálogo con más detalle?",
      },
    ] as never,
    currentMessage: "Sí por favor",
    whatsappDisplayName: "Fernanda",
    buildClosing: () => "Perfecto, ya tengo todo.",
  });
  assert.match(reply, /banquete-(formal|mexicano)/i);
  assert.match(reply, /Igual te envío el catálogo general|Catálogo general|bodasesor\.com\/catalogos(?!\/[a-z])/i);
  assert.ok(
    !/^Claro\.\s*\n*Claro\. Aquí tienes el catálogo general con todos/i.test(reply),
    reply.slice(0, 400)
  );
}

console.log("V9.87 class smoke OK —", LUCY_PROMPT_VERSION);
