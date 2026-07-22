import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getOpenAiApiKey, isOpenAiConfigured } from "../lib/openaiEnv.js";
import { getKommoSubdomain, isKommoConfigured } from "../lib/kommoEnv.js";
import { isAuthConfigured } from "../lib/authJwt.js";
import { getCatalogStatus } from "../services/catalogService.js";
import { getBuildMeta } from "../lib/buildMeta.js";

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
      "learning-cron-keepalive",
      "learning-auto-approve-high-confidence",
      "silent-crm-watch",
      "emergency-contact-in-humano-trabaja",
      "knowledge-gaps-aprendizaje",
      "aprendizaje-panel-from-chats",
      "lucy-info-pdf-text",
    ],
    learning: {
      note: "Panel /aprendizaje: chats, huecos Sheet e Información para Lucy (PDF→texto + tendencias). Sync Kommo; cron 5 min; auto-aprueba ≥0.85",
      cron_path: "/api/kommo/cron/learning",
      panel_path: "/aprendizaje",
      lucy_info_path: "/api/lucy-info",
    },
    silent_watch: {
      note: "En Humano Trabaja/Cotización/seguimientos Lucy no cotiza; actualiza CRM si cambian datos; solo escribe teléfonos de emergencia",
    },
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
    lucy_pipeline: "unified-v2",
    lucy_memory: {
      last_response_source: "cache_then_history_not_1048786",
      note: "Campo 1048786 = resumen interno CRM, no mensaje WhatsApp",
    },
    catalog: getCatalogStatus(),
  });
});

export default router;
