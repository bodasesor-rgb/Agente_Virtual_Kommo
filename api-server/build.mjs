import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

function resolveGitCommit() {
  if (process.env.GITHUB_SHA?.trim()) return process.env.GITHUB_SHA.trim();
  try {
    return execSync("git rev-parse HEAD", { cwd: path.resolve(artifactDir, ".."), encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function writeBuildMeta(targetDir) {
  const builtAt = new Date();
  const gitCommit = resolveGitCommit();
  const meta = {
    version: "3.3",
    lucy_prompt: "V8.54",
    built_at: builtAt.toISOString(),
    built_at_display: builtAt.toLocaleString("es-MX", {
      timeZone: "America/Mexico_City",
      dateStyle: "medium",
      timeStyle: "short",
    }),
    git_commit: gitCommit,
    git_commit_short: gitCommit ? gitCommit.slice(0, 7) : null,
  };
  const metaPath = path.join(targetDir, "build-meta.json");
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`[build] build-meta.json → ${meta.built_at_display} (${meta.git_commit_short ?? "sin commit"})`);
  return meta;
}

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [
      path.resolve(artifactDir, "src/index.ts"),
      path.resolve(artifactDir, "src/selftest/lucy-flow-selftest.ts"),
    ],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  const simuladorSrc = path.resolve(artifactDir, "public/simulador");
  await cp(simuladorSrc, path.join(distDir, "simulador"), { recursive: true });
  console.log("[build] Simulador copiado a dist/simulador/");

  const adminSrc = path.resolve(artifactDir, "public/lucy-admin");
  await cp(adminSrc, path.join(distDir, "lucy-admin"), { recursive: true });
  console.log("[build] Lucy Admin copiado a dist/lucy-admin/");

  const aprendizajeSrc = path.resolve(artifactDir, "public/aprendizaje");
  await cp(aprendizajeSrc, path.join(distDir, "aprendizaje"), { recursive: true });
  console.log("[build] Aprendizaje copiado a dist/aprendizaje/");

  const panelSrc = path.resolve(artifactDir, "public/panel");
  await cp(panelSrc, path.join(distDir, "panel"), { recursive: true });
  console.log("[build] Panel copiado a dist/panel/");

  const estadoSrc = path.resolve(artifactDir, "public/estado");
  await cp(estadoSrc, path.join(distDir, "estado"), { recursive: true });
  console.log("[build] Estado copiado a dist/estado/");

  const catalogosLightSrc = path.resolve(artifactDir, "public/catalogos-light");
  await cp(catalogosLightSrc, path.join(distDir, "catalogos-light"), { recursive: true });
  console.log("[build] Catálogos livianos copiados a dist/catalogos-light/");

  await mkdir(path.join(distDir, "data"), { recursive: true });
  const trainingSrc = path.resolve(artifactDir, "data/training-examples.json");
  await cp(trainingSrc, path.join(distDir, "data/training-examples.json"));
  await cp(trainingSrc, path.join(distDir, "training-examples.json"));
  console.log("[build] Training examples copiados a dist/");

  const lucyInfoSeedSrc = path.resolve(artifactDir, "config/lucy-info-seed.json");
  try {
    await mkdir(path.join(distDir, "config"), { recursive: true });
    await cp(lucyInfoSeedSrc, path.join(distDir, "config/lucy-info-seed.json"));
    await cp(lucyInfoSeedSrc, path.join(distDir, "lucy-info-seed.json"));
    await cp(lucyInfoSeedSrc, path.join(distDir, "data/lucy-info-seed.json"));
    console.log("[build] lucy-info-seed.json (41 catálogos PDF) copiado a dist/");
  } catch (err) {
    console.warn("[build] lucy-info-seed.json no copiado:", err.message);
  }

  const sinonimosSrc = path.resolve(artifactDir, "config/sinonimos.json");
  try {
    await cp(sinonimosSrc, path.join(distDir, "data/sinonimos.json"));
    await mkdir(path.join(distDir, "config"), { recursive: true });
    await cp(sinonimosSrc, path.join(distDir, "config/sinonimos.json"));
    console.log("[build] sinonimos.json copiado a dist/");
  } catch (err) {
    console.warn("[build] sinonimos.json no copiado:", err.message);
  }
  const scriptsDir = path.join(distDir, "scripts");
  await mkdir(scriptsDir, { recursive: true });
  for (const script of [
    "simulator-auto-client-lib.mjs",
    "lucy-simulator-10-clients.mjs",
    "probe-sim-campos-kommo.mjs",
  ]) {
    await cp(path.resolve(artifactDir, "scripts", script), path.join(scriptsDir, script));
  }
  console.log("[build] Scripts auto-cliente / probe campos copiados a dist/scripts/");

  const reqFromDb = createRequire(path.resolve(artifactDir, "../lib/db/package.json"));
  const pgliteDist = path.dirname(reqFromDb.resolve("@electric-sql/pglite"));
  for (const asset of ["postgres.data", "postgres.wasm"]) {
    try {
      await copyFile(path.join(pgliteDist, asset), path.join(distDir, asset));
    } catch (err) {
      console.warn(`[build] No se copió ${asset}:`, err.message);
    }
  }

  const deployDir = path.resolve(artifactDir, "../deploy");
  await writeBuildMeta(distDir);
  await cp(distDir, deployDir, { recursive: true, force: true });

  async function embedPanelCss(panelRoot) {
    const htmlPath = path.join(panelRoot, "index.html");
    const cssPath = path.join(panelRoot, "styles.css");
    let html = await readFile(htmlPath, "utf8");
    const css = await readFile(cssPath, "utf8");
    if (!html.includes("<style>")) {
      html = html.replace(
        /<link rel="stylesheet" href="\/panel\/styles\.css[^"]*" \/>/,
        `<style>\n${css}\n</style>\n  <link rel="stylesheet" href="/panel/styles.css?v=4" />`,
      );
      await writeFile(htmlPath, html);
    }
  }

  await embedPanelCss(path.join(distDir, "panel"));
  await embedPanelCss(path.join(deployDir, "panel"));
  console.log("[build] Panel: CSS embebido en index.html");

  async function embedAprendizajeCss(targetDir) {
    const htmlPath = path.join(targetDir, "index.html");
    const cssPath = path.join(targetDir, "styles.css");
    let html = await readFile(htmlPath, "utf8");
    const css = await readFile(cssPath, "utf8");
    if (!html.includes("aprendizaje-inline-style")) {
      html = html.replace(
        /<link rel="stylesheet" href="\/aprendizaje\/styles\.css[^"]*" \/>/,
        `<style id="aprendizaje-inline-style">\n${css}\n</style>\n  <link rel="stylesheet" href="/aprendizaje/styles.css?v=2" />`,
      );
      await writeFile(htmlPath, html);
    }
  }

  await embedAprendizajeCss(path.join(distDir, "aprendizaje"));
  await embedAprendizajeCss(path.join(deployDir, "aprendizaje"));
  console.log("[build] Aprendizaje: CSS embebido en index.html");

  console.log("[build] Bundle sincronizado a deploy/");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
