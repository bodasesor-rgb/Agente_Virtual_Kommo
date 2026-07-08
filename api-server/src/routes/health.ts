import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getOpenAiApiKey, isOpenAiConfigured } from "../lib/openaiEnv.js";
import { isAuthConfigured } from "../lib/authJwt.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Endpoint detallado para keep-alive y diagnóstico externo
router.get("/health", (_req, res) => {
  const key = getOpenAiApiKey();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: "Lucy Bodasesor",
    version: "3.3",
    lucy_prompt: "V6",
    features: [
      "understanding",
      "redaction-briefing",
      "training-db",
      "lucy-admin",
      "debounce-5s",
      "learning-from-human-chats",
    ],
    auth_configured: isAuthConfigured(),
    git_commit: process.env.GIT_COMMIT ?? process.env.HOSTINGER_GIT_COMMIT ?? null,
    openai_configured: isOpenAiConfigured(),
    openai_key_prefix: key.startsWith("sk-") ? key.slice(0, 8) + "…" : null,
  });
});

export default router;
