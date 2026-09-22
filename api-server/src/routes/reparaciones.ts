import { Router, type IRouter, type Request, type Response } from "express";
import {
  dismissLucyRepair,
  getLucyRepairStats,
  listLucyRepairs,
  resolveLucyRepair,
  type LucyRepairStatus,
} from "../services/lucyRepairStore.js";
import { runLucyAuditorBatch } from "../services/lucyAuditor.js";

const router: IRouter = Router();

router.get("/reparaciones", async (req: Request, res: Response) => {
  try {
    const statusParam = String(req.query.status ?? "open");
    const status = (
      ["open", "auto_flagged", "resolved", "dismissed", "all"].includes(statusParam)
        ? statusParam
        : "open"
    ) as LucyRepairStatus | "all";
    // open tab = open + auto_flagged
    if (statusParam === "open") {
      const open = await listLucyRepairs("open", 40);
      const flagged = await listLucyRepairs("auto_flagged", 40);
      const merged = [...flagged, ...open]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50);
      res.json({ repairs: merged, total: merged.length });
      return;
    }
    const repairs = await listLucyRepairs(status, Math.min(Number(req.query.limit ?? 50), 100));
    res.json({ repairs, total: repairs.length });
  } catch {
    res.status(500).json({ error: "failed_to_load_reparaciones" });
  }
});

router.get("/reparaciones/stats", async (_req: Request, res: Response) => {
  try {
    res.json(await getLucyRepairStats());
  } catch {
    res.status(500).json({ error: "failed_to_load_stats" });
  }
});

router.post("/reparaciones/run", async (req: Request, res: Response) => {
  try {
    const result = await runLucyAuditorBatch({
      limitLeads: Math.min(Number(req.body?.limitLeads ?? 12), 30),
      useFlash: req.body?.useFlash !== false,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log?.error?.({ err }, "reparaciones/run failed");
    res.status(500).json({ error: "audit_failed" });
  }
});

router.post("/reparaciones/cron", async (req: Request, res: Response) => {
  try {
    const result = await runLucyAuditorBatch({ limitLeads: 10, useFlash: true });
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log?.error?.({ err }, "reparaciones/cron failed");
    res.status(500).json({ error: "cron_failed" });
  }
});

router.post("/reparaciones/:id/resolve", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    const updated = await resolveLucyRepair(
      id,
      typeof req.body?.appliedRepair === "string" ? req.body.appliedRepair : undefined,
      "panel"
    );
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "resolve_failed" });
  }
});

router.post("/reparaciones/:id/dismiss", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    const ok = await dismissLucyRepair(id, "panel");
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "dismiss_failed" });
  }
});

export default router;
