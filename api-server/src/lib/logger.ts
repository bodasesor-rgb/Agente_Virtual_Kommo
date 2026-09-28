import pino from "pino";

// pino-pretty corre en un worker cuya ruta queda fija al build; solo usarlo en dev explícito.
const isProduction = process.env.NODE_ENV !== "development";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
