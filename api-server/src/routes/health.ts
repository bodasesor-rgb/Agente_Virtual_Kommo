import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getOpenAiApiKey, isOpenAiConfigured } from "../lib/openaiEnv.js";
import { getKommoSubdomain, isKommoConfigured } from "../lib/kommoEnv.js";
import { isAuthConfigured } from "../lib/authJwt.js";
import { getCatalogStatus } from "../services/catalogService.js";
import { getBuildMeta } from "../lib/buildMeta.js";
import { getLucyHistoryConfig } from "../lib/lucyHistoryConfig.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Endpoint detallado para keep-alive y diagnóstico externo
router.get("/health", (_req, res) => {
  const key = getOpenAiApiKey();
  const build = getBuildMeta();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: "Lucy Bodasesor",
    version: build.version,
    lucy_prompt: build.lucy_prompt,
    built_at: build.built_at,
    built_at_display: build.built_at_display,
    features: [
      "understanding",
      "redaction-briefing",
      "training-db",
      "lucy-admin",
      "debounce-5s",
      "learning-from-human-chats",
      "knowledge-gaps-aprendizaje",
    ],
    auth_configured: isAuthConfigured(),
    git_commit: build.git_commit,
    git_commit_short: build.git_commit_short,
    openai_configured: isOpenAiConfigured(),
    openai_key_prefix: key.startsWith("sk-") ? key.slice(0, 8) + "…" : null,
    kommo_configured: isKommoConfigured(),
    kommo_subdomain: getKommoSubdomain() || null,
    lucy_outbound: {
      mode: "meta_plus_note",
      note: "Meta API envía al cliente; nota en timeline del lead para el equipo",
    },
    catalog: getCatalogStatus(),
    lucy_history: getLucyHistoryConfig(),
  });
});

export default router;
