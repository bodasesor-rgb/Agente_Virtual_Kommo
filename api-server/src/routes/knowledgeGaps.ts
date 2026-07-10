import { Router, type IRouter, type Request, type Response } from "express";
import {
  listKnowledgeGaps,
  getKnowledgeGapStats,
  getLearningOverview,
  answerKnowledgeGap,
  dismissKnowledgeGap,
  teachLucyManually,
} from "../services/knowledgeGapStore.js";
import { listTrainingExamples, getTrainingStats } from "../services/trainingStore.js";

const router: IRouter = Router();

function isPanelTaughtLabel(label?: string | null): boolean {
  if (!label?.trim()) return false;
  return /^(Aprendizaje|Aprendido):/i.test(label.trim());
}

router.get("/knowledge-gaps/overview", async (_req: Request, res: Response) => {
  try {
    res.json(await getLearningOverview());
  } catch {
    res.status(500).json({ error: "failed_to_load_overview" });
  }
});

router.get("/knowledge-gaps/training-recent", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 30), 100);
    const examples = await listTrainingExamples();
    const learned = examples.filter((ex) => isPanelTaughtLabel(ex.label)).slice(0, limit);
    const stats = await getTrainingStats();
    res.json({
      examples: learned,
      stats: { ...stats, panelTaught: learned.length },
      total: learned.length,
    });
  } catch {
    res.status(500).json({ error: "failed_to_load_training" });
  }
});

router.post("/knowledge-gaps/teach", async (req: Request, res: Response) => {
  const { question, answer, topic } = req.body as {
    question?: string;
    answer?: string;
    topic?: string;
  };
  if (!question?.trim() || !answer?.trim()) {
    res.status(400).json({ error: "question_and_answer_required" });
    return;
  }
  try {
    const gap = await teachLucyManually({
      question,
      answer,
      topic,
      reviewerEmail: "panel",
    });
    res.status(201).json({ ok: true, gap });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed_to_teach";
    res.status(500).json({ error: msg });
  }
});

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
