import { Router, type IRouter, type Request, type Response } from "express";
import {
  listKnowledgeGaps,
  getKnowledgeGapStats,
  answerKnowledgeGap,
  dismissKnowledgeGap,
} from "../services/knowledgeGapStore.js";

const router: IRouter = Router();

router.get("/knowledge-gaps", async (req: Request, res: Response) => {
  try {
    const statusParam = String(req.query.status ?? "pending");
    const status =
      statusParam === "answered" || statusParam === "dismissed" ? statusParam : "pending";
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const gaps = await listKnowledgeGaps(status, limit);
    res.json({ gaps, total: gaps.length });
  } catch {
    res.status(500).json({ error: "failed_to_load_gaps" });
  }
});

router.get("/knowledge-gaps/stats", async (_req: Request, res: Response) => {
  try {
    res.json(await getKnowledgeGapStats());
  } catch {
    res.status(500).json({ error: "failed_to_load_stats" });
  }
});

router.post("/knowledge-gaps/:id/answer", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { answer } = req.body as { answer?: string };
  if (!answer?.trim()) {
    res.status(400).json({ error: "answer_required" });
    return;
  }
  try {
    const updated = await answerKnowledgeGap(id, answer, "panel");
    if (!updated) {
      res.status(404).json({ error: "gap_not_found" });
      return;
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "failed_to_answer" });
  }
});

router.post("/knowledge-gaps/:id/dismiss", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    const ok = await dismissKnowledgeGap(id, "panel");
    if (!ok) {
      res.status(404).json({ error: "gap_not_found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed_to_dismiss" });
  }
});

export default router;
