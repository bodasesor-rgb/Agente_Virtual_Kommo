/**
 * Smoke: sincronización bodasesor.com/catalogos (Gamma → PDF → texto) con Gamma simulado.
 * - Primera corrida exporta todo; la segunda no re-exporta lo que no cambió en Gamma.
 * - Si Gamma cambió, re-exporta solo ese; si falla, se anota y se conserva lo anterior.
 * - El documento web manda sobre el PDF manual del mismo catálogo (el manual queda de respaldo).
 * - Corrida nocturna: 3 a.m. CDMX, una vez por día.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isNightlySyncDue,
  readCatalogWebSyncState,
  syncWebCatalogs,
} from "../services/catalogWebSync.js";
import {
  dropSupersededByWeb,
  isSupersededByWeb,
  type CatalogEmbedEntry,
} from "../services/catalogWebKnowledge.js";

const dir = mkdtempSync(join(tmpdir(), "cws-"));
const statePath = join(dir, "state.json");
const embeds: CatalogEmbedEntry[] = [
  { slug: "banquete-formal", title: "Banquete Formal", embedSrc: "", gammaId: "g1", webUrl: "" },
  { slug: "taquiza", title: "Taquiza", embedSrc: "", gammaId: "g2", webUrl: "" },
  { slug: "sin-gamma", title: "Sin Gamma", embedSrc: "", gammaId: null, webUrl: "" },
];
const updated: Record<string, string> = { g1: "2026-09-01T00:00:00Z", g2: "2026-09-01T00:00:00Z" };
const failExport = new Set<string>();
let exports = 0;
const saved: Array<{ slug: string; title: string; content: string }> = [];

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  let m: RegExpMatchArray | null;
  if ((m = url.match(/\/gammas\/(\w+)\/export$/)) && init?.method === "POST") {
    assert.equal(JSON.parse(String(init.body)).exportAs, "pdf");
    if (failExport.has(m[1]!)) return json({ error: "forbidden" }, 403);
    exports += 1;
    return json({ exportId: `e-${m[1]}` });
  }
  if ((m = url.match(/\/gammas\/(\w+)$/))) return json({ id: m[1], updatedTime: updated[m[1]!] });
  if ((m = url.match(/\/exports\/e-(\w+)$/))) {
    return json({ status: "completed", exportUrl: `https://files.example/${m[1]}.pdf` });
  }
  if ((m = url.match(/files\.example\/(\w+)\.pdf$/))) return new Response(`%PDF-fake-${m[1]}`);
  throw new Error(`fetch inesperado ${url}`);
}) as typeof fetch;

const deps = {
  fetchImpl,
  embeds,
  statePath,
  apiKey: "test",
  pollMs: 1,
  extractText: async (pdf: Buffer) => `${pdf.toString()} ${"Menú 4 tiempos Tradicional Una entrada ".repeat(10)}`,
  saveDoc: async (d: { slug: string; title: string; content: string }) => {
    saved.push(d);
  },
  docExists: async () => true,
};

(async () => {
  const r1 = await syncWebCatalogs({ trigger: "manual" }, deps);
  assert.deepEqual(r1.exported.sort(), ["banquete-formal", "taquiza"]);
  assert.equal(exports, 2);
  assert.ok(saved.some((d) => d.slug === "banquete-formal" && d.title === "Banquete Formal" && /%PDF-fake-g1/.test(d.content)));
  assert.equal(readCatalogWebSyncState(statePath)["taquiza"]?.updatedTime, "2026-09-01T00:00:00Z");

  const r2 = await syncWebCatalogs({ trigger: "cron" }, deps);
  assert.deepEqual(r2.unchanged.sort(), ["banquete-formal", "taquiza"]);
  assert.equal(exports, 2, "sin cambios en Gamma → no exporta");

  updated.g1 = "2026-10-01T10:00:00Z";
  failExport.add("g2");
  updated.g2 = "2026-10-01T10:00:00Z";
  const r3 = await syncWebCatalogs({ trigger: "cron" }, deps);
  assert.deepEqual(r3.exported, ["banquete-formal"]);
  assert.deepEqual(r3.failed.map((f) => f.slug), ["taquiza"]);
  const st = readCatalogWebSyncState(statePath);
  assert.equal(st["taquiza"]?.updatedTime, "2026-09-01T00:00:00Z", "falla → conserva la versión anterior");
  assert.match(String(st["taquiza"]?.error), /export_http_403/);

  failExport.clear();
  const r4 = await syncWebCatalogs({ trigger: "cron" }, deps);
  assert.deepEqual(r4.exported, ["taquiza"], "tras un error reintenta aunque no haya cambio nuevo");

  // Documento web borrado a mano → se vuelve a crear aunque Gamma no cambió.
  const r5 = await syncWebCatalogs({ trigger: "cron" }, { ...deps, docExists: async (s: string) => s !== "taquiza" });
  assert.deepEqual(r5.exported, ["taquiza"]);

  // Web manda sobre el PDF manual.
  const docs = [
    { kind: "catalog", title: "Banquete Formal Bodasesor", sourceFilename: "Banquete Formal Bodasesor.pdf" },
    { kind: "catalog", title: "Banquete Formal", sourceFilename: "web:banquete-formal" },
    { kind: "catalog", title: "Taquiza bodaseor", sourceFilename: "Taquiza bodaseor.pdf" },
    { kind: "tips", title: "Tendencias banquete formal", sourceFilename: null },
  ];
  const kept = dropSupersededByWeb(docs).map((d) => d.title);
  assert.deepEqual(kept, ["Banquete Formal", "Taquiza bodaseor", "Tendencias banquete formal"]);
  assert.ok(isSupersededByWeb(docs[0]!, new Set(["banquete-formal"])));
  assert.ok(!isSupersededByWeb(docs[0]!, new Set(["taquiza"])));
  assert.deepEqual(dropSupersededByWeb([docs[0]!, docs[2]!]).length, 2, "sin docs web no se filtra nada");

  // 3 a.m. CDMX = 09:00 UTC.
  assert.ok(isNightlySyncDue(new Date("2026-10-02T09:15:00Z"), null));
  assert.ok(!isNightlySyncDue(new Date("2026-10-02T09:15:00Z"), "2026-10-02"));
  assert.ok(!isNightlySyncDue(new Date("2026-10-02T15:00:00Z"), null));

  rmSync(dir, { recursive: true, force: true });
  console.log("catalog-web-sync-smoke OK");
})().catch((e) => {
  console.error(e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
