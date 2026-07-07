import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Endpoint detallado para keep-alive y diagnóstico externo
router.get("/health", (_req, res) => {
  const key = process.env["OPENAI_API_KEY"]?.trim() ?? "";
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: "Lucy Bodasesor",
    version: "3.0",
    openai_configured: key.length > 0,
    openai_key_prefix: key.startsWith("sk-") ? key.slice(0, 8) + "…" : null,
  });
});

export default router;
