/**
 * Smoke V9.04 — módulos de limpieza sin PGlite/DB.
 * Ejecutar: node scripts/smoke-guards-cleanup.mjs (tras pnpm build con entry aparte)
 */
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(path.join(tmpdir(), "lucy-guards-smoke-"));
const entry = path.join(dir, "entry.ts");
const out = path.join(dir, "out.mjs");

writeFileSync(
  entry,
  `
export { CATALOG_URL, CATALOG_WEB_HUB_URL, CATALOG_WEB_HUB } from "${root}/src/catalogUrls.ts";
export { stripCatalogBlockShared } from "${root}/src/guards/catalogSanitize.ts";
export { LUCY_GUARD_DOMAINS } from "${root}/src/guards/domains.ts";
export {
  buildPhoneAnswer,
  buildHumanAdvisorHandoffAnswer,
  buildLocationAnswer,
  buildEmergencyContactAnswer,
} from "${root}/src/guards/contactAnswers.ts";
export {
  clientAsksPaymentOrQuoteDelivery,
  buildPostCierreThanksReply,
  buildPostCierrePaymentHandoffReply,
  buildPostCierreCallbackAck,
} from "${root}/src/guards/postCierreReplies.ts";
export {
  EMAIL_WAIVED_LABEL,
  CLOSING_CORE_FIELDS,
  CLOSING_SIGNATURE,
  FLOW_QUESTIONS,
  LUCY_INTRO,
} from "${root}/src/guards/embudoConstants.ts";
export {
  pickTransition,
  clientSaysThanks,
  dedupeTransitionsInMessage,
} from "${root}/src/guards/transitions.ts";
export {
  detectCierreEnviado,
  collectUserTexts,
} from "${root}/src/guards/historyHelpers.ts";
export {
  buildGenericCatalogHubBlock,
  buildStandardClosingMessage,
  buildPackageCatalogOfferBlock,
} from "${root}/src/guards/catalogOffer.ts";
export { tryApplyPostCierreOrHandoffReply } from "${root}/src/guards/postCierreHandler.ts";
`
);

buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  write: true,
});

const m = await import(pathToFileURL(out).href);

assert.equal(m.CATALOG_URL, "https://bodasesor.com/catalogos");
assert.equal(m.CATALOG_URL, m.CATALOG_WEB_HUB_URL);
assert.equal(m.CATALOG_URL, m.CATALOG_WEB_HUB);

const mixed =
  "Anoto banquete.\nTe dejo el catálogo general:\nhttps://bodasesor.com/catalogos\n¿Quieres que te mande el catálogo?\nY seguimos.";
const cleaned = m.stripCatalogBlockShared(mixed);
assert.ok(!/bodasesor\.com\/catalogos/i.test(cleaned), cleaned);
assert.ok(/Anoto banquete/i.test(cleaned), cleaned);

assert.ok(m.LUCY_GUARD_DOMAINS.catalogo);
assert.ok(m.LUCY_GUARD_DOMAINS.postCierre);
assert.ok(m.CLOSING_CORE_FIELDS.includes("Nombre del cliente"));
assert.equal(m.CLOSING_SIGNATURE, "Perfecto, ya tengo todo.");
assert.match(m.buildPhoneAnswer(), /55 4008 0373/);
assert.match(m.buildHumanAdvisorHandoffAnswer("Ana"), /Ana/);
assert.match(m.buildPostCierreThanksReply("Ana"), /Ana/);
assert.ok(m.clientAsksPaymentOrQuoteDelivery("manda el anticipo del 50%"));
assert.ok(!m.clientAsksPaymentOrQuoteDelivery("hola"));

assert.ok(m.clientSaysThanks("Muchas gracias"));
assert.equal(m.pickTransition([]), "Perfecto.");
assert.ok(m.detectCierreEnviado([], `${m.CLOSING_SIGNATURE} catálogo`));
assert.deepEqual(m.collectUserTexts([], "hola"), ["hola"]);
assert.match(m.buildGenericCatalogHubBlock(), /bodasesor\.com\/catalogos/i);
assert.match(m.buildStandardClosingMessage("banquete", "Ana"), /Perfecto, ya tengo todo/);
assert.equal(
  m.tryApplyPostCierreOrHandoffReply({
    cierreYaEnviado: true,
    currentMessage: "gracias",
    extracted: { nombre: "Ana" },
    filledSet: new Set(),
    history: [],
  })?.logMsg.includes("agradecimiento"),
  true
);

const meta = JSON.parse(readFileSync(path.join(root, "dist/build-meta.json"), "utf8"));
assert.equal(meta.lucy_prompt, "V9.04");

console.log("smoke-guards-cleanup: OK");
