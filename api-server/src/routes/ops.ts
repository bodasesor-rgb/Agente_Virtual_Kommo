import { Router, type IRouter, type Request, type Response } from "express";
import { getOpenAiApiKey, isOpenAiConfigured } from "../lib/openaiEnv.js";
import { getCatalogStatus, refreshCatalog } from "../services/catalogService.js";
import {
  getDrivePdfStatus,
  refreshDrivePdfKnowledge,
} from "../services/drivePdfKnowledge.js";
import { getKnowledgeGapStats } from "../services/knowledgeGapStore.js";
import { logger } from "../lib/logger.js";
import { getBuildMeta } from "../lib/buildMeta.js";

const router: IRouter = Router();

interface OpsCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
}

function uptimeLabel(seconds: number): string {
  if (seconds < 120) return "Reinicio reciente (posible caída)";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min en línea`;
  return `${Math.floor(seconds / 3600)} h en línea`;
}

async function buildOpsStatus(): Promise<{
  overall: "ok" | "warn" | "error";
  checks: OpsCheck[];
  healActions: string[];
}> {
  const build = getBuildMeta();
  const catalog = getCatalogStatus();
  const drivePdf = getDrivePdfStatus();
  const gaps = await getKnowledgeGapStats().catch(() => ({
    pending: 0,
    answered: 0,
    dismissed: 0,
  }));

  const checks: OpsCheck[] = [];
  const healActions: string[] = [];
  const uptime = process.uptime();

  checks.push({
    id: "server",
    label: "Servidor Lucy",
    status: "ok",
    detail: uptimeLabel(uptime),
  });

  if (uptime < 120) {
    checks[checks.length - 1]!.status = "warn";
  }

  checks.push({
    id: "openai",
    label: "OpenAI",
    status: isOpenAiConfigured() ? "ok" : "error",
    detail: isOpenAiConfigured()
      ? `Key configurada (${getOpenAiApiKey().slice(0, 8)}…)`
      : "Falta OPEN_AI en Hostinger — Lucy no puede usar GPT",
  });

  const catalogOk = catalog.loaded && !catalog.lastError;
  checks.push({
    id: "catalog",
    label: "Catálogo de precios",
    status: catalogOk ? "ok" : catalog.lastError ? "error" : "warn",
    detail: catalog.lastError
      ? `Error: ${catalog.lastError}`
      : catalog.loaded
        ? `${catalog.pricedServicesCount} precios · Sheet ${catalog.sources.sheetsRows ?? 0} filas`
        : "Aún no cargó el catálogo",
  });

  if (catalog.lastError) {
    healActions.push("refresh_catalog");
  }

  if (drivePdf.enabled) {
    checks.push({
      id: "drive_pdf",
      label: "Catálogo PDF (Drive)",
      status: drivePdf.loaded && !drivePdf.lastError ? "ok" : drivePdf.lastError ? "warn" : "warn",
      detail: drivePdf.lastError
        ? `Error: ${drivePdf.lastError}`
        : drivePdf.loaded
          ? `${drivePdf.fileCount} PDFs · ${drivePdf.cardCount} fichas · ${drivePdf.chunkCount} chunks`
          : "Aún indexando PDFs de Drive…",
    });
    if (!drivePdf.loaded || drivePdf.lastError) {
      healActions.push("refresh_drive_pdf");
    }
  }

  const lastRefresh = catalog.lastRefresh ? new Date(catalog.lastRefresh).getTime() : 0;
  const staleMs = Date.now() - lastRefresh;
  if (catalog.loaded && staleMs > 45 * 60 * 1000) {
    checks.push({
      id: "catalog_stale",
      label: "Catálogo desactualizado",
      status: "warn",
      detail: `Última carga hace ${Math.floor(staleMs / 60000)} min`,
    });
    healActions.push("refresh_catalog");
  }

  checks.push({
    id: "gaps",
    label: "Aprendizaje pendiente",
    status: gaps.pending > 0 ? "warn" : "ok",
    detail:
      gaps.pending > 0
        ? `${gaps.pending} pregunta(s) sin respuesta en el panel Aprendizaje`
        : `${gaps.answered} enseñadas · al día con el catálogo`,
  });

  checks.push({
    id: "deploy",
    label: "Última actualización",
    status: "ok",
    detail: `${build.lucy_prompt} · ${build.built_at_display}${build.git_commit_short ? ` · commit ${build.git_commit_short}` : ""}`,
  });

  const hasError = checks.some((c) => c.status === "error");
  const hasWarn = checks.some((c) => c.status === "warn");

  return {
    overall: hasError ? "error" : hasWarn ? "warn" : "ok",
    checks,
    healActions: [...new Set(healActions)],
  };
}

router.get("/ops/status", async (_req: Request, res: Response) => {
  try {
    const build = getBuildMeta();
    const status = await buildOpsStatus();
    res.json({
      ...status,
      timestamp: new Date().toISOString(),
      version: build.version,
      lucy_prompt: build.lucy_prompt,
      built_at: build.built_at,
      built_at_display: build.built_at_display,
      git_commit: build.git_commit,
      git_commit_short: build.git_commit_short,
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(500).json({
      overall: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/ops/heal", async (_req: Request, res: Response) => {
  const healed: string[] = [];
  const errors: string[] = [];

  try {
    const before = getCatalogStatus();
    if (!before.loaded || before.lastError) {
      try {
        await refreshCatalog(true);
        healed.push("catalog_refreshed");
        logger.info("ops/heal: catálogo recargado");
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    const driveBefore = getDrivePdfStatus();
    if (driveBefore.enabled && (!driveBefore.loaded || driveBefore.lastError)) {
      try {
        await refreshDrivePdfKnowledge(true);
        healed.push("drive_pdf_refreshed");
        logger.info("ops/heal: índice PDF Drive recargado");
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    const status = await buildOpsStatus();
    res.json({
      ok: errors.length === 0,
      healed,
      errors,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
