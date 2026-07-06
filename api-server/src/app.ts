import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.send("Server running");
});

// Kommo puede enviar webhooks a "/" en lugar de "/api/kommo/webhook".
// Este handler reenvía internamente al endpoint correcto como red de seguridad.
app.post("/", (req, _res, next) => {
  logger.warn({ url: req.url }, "POST / recibido — redirigiendo a /api/kommo/webhook");
  req.url = "/kommo/webhook";
  router(req, _res, next);
});

app.use("/api", router);

export default app;
