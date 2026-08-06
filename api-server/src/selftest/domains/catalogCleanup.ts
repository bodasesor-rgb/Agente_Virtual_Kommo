/**
 * Selftests de dominio: catálogo / hub / sanitize (limpieza V9.x).
 * Se registran desde lucy-flow-selftest.ts para no perder la suite monolítica de golpe.
 */
import assert from "node:assert/strict";
import { CATALOG_URL } from "../../catalogUrls.js";
import { CATALOG_WEB_HUB_URL } from "../../services/catalogService.js";
import { LUCY_GUARD_DOMAINS } from "../../guards/domains.js";
import { stripCatalogBlockShared } from "../../guards/catalogSanitize.js";

export type DomainTestFn = (
  name: string,
  fn: () => void | Promise<void>
) => Promise<void>;

/** Casos de catálogo que validan la limpieza estructural (no tickets de producto). */
export async function registerCatalogCleanupTests(test: DomainTestFn): Promise<void> {
  await test("130. V9.04+ — cleanup: hub catálogo único y strip compartido", () => {
    assert.equal(CATALOG_URL, CATALOG_WEB_HUB_URL);
    assert.equal(CATALOG_URL, "https://bodasesor.com/catalogos");
    assert.ok(LUCY_GUARD_DOMAINS.catalogo);
    assert.ok(LUCY_GUARD_DOMAINS.postCierre);
    assert.ok(LUCY_GUARD_DOMAINS.nombre);
    assert.ok(LUCY_GUARD_DOMAINS.food || LUCY_GUARD_DOMAINS.entretenimiento);

    const mixed =
      "Anoto banquete.\nTe dejo el catálogo general:\nhttps://bodasesor.com/catalogos\n¿Quieres que te mande el catálogo?\nY seguimos.";
    const cleaned = stripCatalogBlockShared(mixed);
    assert.ok(!/bodasesor\.com\/catalogos/i.test(cleaned), cleaned);
    assert.ok(/Anoto banquete/i.test(cleaned), cleaned);
  });
}
