import { Router, type IRouter, type Request, type Response } from "express";
import { indexarAprendizaje, obtenerEstadoIndexado } from "../jobs/indexarAprendizaje.js";

const router: IRouter = Router();

router.get("/aprendizaje/estado", async (_req: Request, res: Response) => {
  try {
    const estado = await obtenerEstadoIndexado();
    res.json({ ok: true, ...estado });
  } catch (err) {
    res.status(500).json({ ok: false, error: "failed_to_load_estado" });
  }
});

router.post("/aprendizaje/indexar", async (req: Request, res: Response) => {
  const log = req.log;
  try {
    log?.info("aprendizaje/indexar: inicio manual");
    const result = await indexarAprendizaje();
    res.json({ ok: true, ...result });
  } catch (err) {
    log?.error({ err }, "aprendizaje/indexar: error");
    res.status(500).json({ ok: false, error: "index_failed" });
  }
});

export default router;
