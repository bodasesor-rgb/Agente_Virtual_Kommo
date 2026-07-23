import "dotenv/config";
import { ensureOpenAiApiKeyEnv } from "./lib/openaiEnv.js";
import { ensureKommoEnv } from "./lib/kommoEnv.js";

ensureOpenAiApiKeyEnv();
ensureKommoEnv();

import app from "./app";
import { logger } from "./lib/logger";
import { initializeTrainingStore } from "./services/trainingStore.js";
import { ensureLearningSchema } from "./services/learningSchema.js";
import { ensureKnowledgeGapSchema } from "./services/knowledgeGapSchema.js";
import { ensureLucyInfoSchema } from "./services/lucyInfoSchema.js";
import { seedLucyInfoIfEmpty, warmLucyInfoPriceCache } from "./services/lucyInfoStore.js";
import { bootstrapCatalog, startCatalogAutoRefresh } from "./services/catalogService.js";

const rawPort = process.env["PORT"] ?? "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  // No bloquear listen: Hostinger marca 503 si el puerto tarda en abrirse.
  void initializeTrainingStore().catch((err) => {
    logger.warn({ err }, "trainingStore init en background falló — se usará JSON");
  });
  void ensureLearningSchema().catch((err) => {
    logger.warn({ err }, "learningSchema init en background falló");
  });
  void ensureKnowledgeGapSchema().catch((err) => {
    logger.warn({ err }, "knowledgeGapSchema init en background falló");
  });
  void ensureLucyInfoSchema()
    .then(() => seedLucyInfoIfEmpty())
    .then((r) => {
      if (r.seeded > 0) logger.info({ seeded: r.seeded }, "lucyInfo: seed tras DB vacía");
      return warmLucyInfoPriceCache();
    })
    .then((n) => {
      if (n > 0) logger.info({ catalogs: n }, "lucyInfoPriceCache warm ok");
    })
    .catch((err) => {
      logger.warn({ err }, "lucyInfoSchema/seed/caché PDF init en background falló");
    });

  app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ══════════════════════════════════════════════════════════════════════
  // KEEP-ALIVE interno — mantiene el event loop activo MIENTRAS el proceso vive.
  // En Hostinger el proceso puede suspenderse sin tráfico EXTERNO; por eso también
  // existe .github/workflows/keep-alive-hostinger.yml (ping cada 5 min desde GitHub)
  // o UptimeRobot → GET /api/health cada 5 min.
  // ══════════════════════════════════════════════════════════════════════
  const PING_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos
  const healthUrl = `http://localhost:${port}/api/health`;
  const publicHealthUrl = (
    process.env["KEEP_ALIVE_PUBLIC_URL"]?.trim() ||
    process.env["PUBLIC_APP_URL"]?.trim()
  )?.replace(/\/$/, "");

  const keepAlive = async () => {
    const targets = [healthUrl];
    if (publicHealthUrl) targets.push(`${publicHealthUrl}/api/health`);

    for (const url of targets) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });

        if (!res.ok) {
          logger.warn({ statusCode: res.status, url }, "Keep-alive ping: respuesta no OK");
          continue;
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          logger.warn({ contentType, url }, "Keep-alive ping: Content-Type inesperado");
          continue;
        }

        const data = (await res.json()) as { status?: string; uptime?: number };
        logger.info(
          { status: data.status, uptimeSeconds: Math.floor(data.uptime ?? 0), url: url.includes("localhost") ? "local" : "public" },
          "Keep-alive ping OK"
        );
      } catch (pingErr) {
        logger.warn({ pingErr, url: url.includes("localhost") ? "local" : "public" }, "Keep-alive ping failed");
      }
    }
  };

  // Primer ping a los 10 segundos (servidor completamente iniciado)
  setTimeout(() => {
    void keepAlive();
    setInterval(() => { void keepAlive(); }, PING_INTERVAL_MS);
  }, 10_000);

  logger.info({ intervalMinutes: 3, healthUrl }, "Keep-alive activado");
  });

  startCatalogAutoRefresh();
  void bootstrapCatalog()
    .then(() => {
      logger.info("Catálogo Google Sheets cargado al arranque");
    })
    .catch((err) => {
      logger.warn(
        { err },
        "bootstrapCatalog falló — se usará fallback estático hasta el próximo refresh",
      );
    });
}

void startServer().catch((err) => {
  logger.error({ err }, "Error al iniciar servidor");
  process.exit(1);
});
