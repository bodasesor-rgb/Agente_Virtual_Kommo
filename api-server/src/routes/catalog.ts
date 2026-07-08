import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getCatalogStatus, refreshCatalog } from "../services/catalogService.js";

const router: IRouter = Router();

router.get("/catalog/status", (_req, res) => {
  res.json({ status: "ok", catalog: getCatalogStatus() });
});

router.post("/catalog/refresh", requireAuth, async (_req: Request, res: Response) => {
  try {
    const snap = await refreshCatalog(true);
    res.json({ status: "ok", catalog: snap.status });
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
