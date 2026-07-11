import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const simuladorDir = path.join(__dirname, "simulador");
const simuladorIndex = path.join(simuladorDir, "index.html");

app.set("trust proxy", 1);

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

function mountSimulador(basePath: string) {
  app.get([basePath, `${basePath}/`], (_req, res) => {
    res.sendFile(simuladorIndex);
  });
  app.use(basePath, express.static(simuladorDir, { index: false }));
}

mountSimulador("/simulador");
mountSimulador("/simulator");

const adminDir = path.join(__dirname, "lucy-admin");
const adminIndex = path.join(adminDir, "index.html");

function mountAdmin(basePath: string) {
  app.get([basePath, `${basePath}/`], (_req, res) => {
    res.sendFile(adminIndex);
  });
  app.use(basePath, express.static(adminDir, { index: false }));
}

mountAdmin("/lucy-admin");
mountAdmin("/admin");

const aprendizajeDir = path.join(__dirname, "aprendizaje");
const aprendizajeIndex = path.join(aprendizajeDir, "index.html");

function mountAprendizaje(basePath: string) {
  app.get([basePath, `${basePath}/`], (_req, res) => {
    res.sendFile(aprendizajeIndex);
  });
  app.use(basePath, express.static(aprendizajeDir, { index: false }));
}

mountAprendizaje("/aprendizaje");

const panelDir = path.join(__dirname, "panel");
const panelIndex = path.join(panelDir, "index.html");

function mountPanel(basePath: string) {
  app.get([basePath, `${basePath}/`], (_req, res) => {
    res.sendFile(panelIndex);
  });
  app.use(basePath, express.static(panelDir, { index: false }));
}

mountPanel("/panel");

const estadoDir = path.join(__dirname, "estado");
const estadoIndex = path.join(estadoDir, "index.html");

function mountEstado(basePath: string) {
  app.get([basePath, `${basePath}/`], (_req, res) => {
    res.sendFile(estadoIndex);
  });
  app.use(basePath, express.static(estadoDir, { index: false }));
}

mountEstado("/estado");

app.get("/", (_req, res) => {
  res.redirect(302, "/panel");
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
