import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ══════════════════════════════════════════════════════════════════════
  // KEEP-ALIVE — Auto-ping cada 3 minutos para mantener el servidor activo
  // 24/7 sin necesidad de Always-On. Ping interno a localhost (más fiable
  // que pingar el dominio externo). Usa /api/health con respuesta JSON rica.
  // ══════════════════════════════════════════════════════════════════════
  const PING_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos
  const healthUrl = `http://localhost:${port}/api/health`;

  const keepAlive = async () => {
    try {
      const res = await fetch(healthUrl);

      if (!res.ok) {
        logger.warn({ statusCode: res.status }, "Keep-alive ping: respuesta no OK");
        return;
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        logger.warn({ contentType }, "Keep-alive ping: Content-Type inesperado");
        return;
      }

      const data = await res.json() as { status?: string; uptime?: number };
      logger.info({ status: data.status, uptimeSeconds: Math.floor(data.uptime ?? 0) }, "Keep-alive ping OK");
    } catch (pingErr) {
      logger.warn({ pingErr }, "Keep-alive ping failed");
    }
  };

  // Primer ping a los 10 segundos (servidor completamente iniciado)
  setTimeout(() => {
    void keepAlive();
    setInterval(() => { void keepAlive(); }, PING_INTERVAL_MS);
  }, 10_000);

  logger.info({ intervalMinutes: 3, healthUrl }, "Keep-alive activado");
});
