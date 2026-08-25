import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const outFile = path.join(apiRoot, "dist", "selftest", "a15547-smoke.mjs");
mkdirSync(path.dirname(outFile), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(apiRoot, "src", "selftest", "a15547-smoke.ts")],
  bundle: true,
  outfile: outFile,
  platform: "node",
  format: "esm",
  packages: "bundle",
  external: [
    "*.node",
    "@electric-sql/pglite",
    "pg",
    "openai",
    "sharp",
  ],
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
const require = __bannerCrReq(import.meta.url);
globalThis.require = require;
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
  },
  logLevel: "warning",
});

await import(pathToFileURL(outFile).href);
