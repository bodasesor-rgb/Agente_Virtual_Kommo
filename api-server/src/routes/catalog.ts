import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getCatalogStatus,
  refreshCatalog,
  lookupCatalogPrices,
  buildCatalogPriceAnswer,
  injectCatalogPriceIfAsked,
} from "../services/catalogService.js";

const router: IRouter = Router();

router.get("/catalog/status", (_req, res) => {
  res.json({ status: "ok", catalog: getCatalogStatus(), parser: "bodasesor-v3" });
});

router.get("/catalog/lookup", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ status: "error", error: "query param q required" });
    return;
  }
  const sampleAi = "¿Tienen idea del presupuesto?";
  res.json({
    status: "ok",
    query: q,
    matches: lookupCatalogPrices(q).slice(0, 8).map((r) => ({
      servicio: r.servicio,
      precio: r.precio,
      unidad: r.unidad,
      notas: r.notas.slice(0, 200),
    })),
    answer: buildCatalogPriceAnswer(q),
    inject: injectCatalogPriceIfAsked(q, sampleAi),
  });
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
