import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

// DESACTIVADO — el único sistema activo es /api/kommo/webhook (processBatch en kommo.ts).
// Este endpoint nunca fue llamado en producción. Se mantiene el archivo para no romper
// el import en index.ts, pero no genera ninguna respuesta de Lucy.

router.post("/", (_req: Request, res: Response) => {
  res.json({ message: "Desactivado" });
});

export default router;
