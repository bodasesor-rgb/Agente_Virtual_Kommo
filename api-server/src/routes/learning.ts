import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import {
  listLearningCandidates,
  getLearningStats,
  approveLearningCandidate,
  rejectLearningCandidate,
} from "../services/learningStore.js";
import { syncHumanPhaseLead, runLearningSyncCron } from "../services/learningSync.js";
import { extractLearningCandidatesForLead } from "../services/learningExtractor.js";
import { listTrainingExamples } from "../services/trainingStore.js";

const router: IRouter = Router();

/**
 * Lectura pública para el panel /aprendizaje (igual que knowledge-gaps).
 * Mutaciones (approve/reject/sync forzado) siguen con auth abajo.
 */
router.get("/aprendizaje/from-chats/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getLearningStats();
    let trainingExamples = 0;
    try {
      const examples = await listTrainingExamples();
      const fromChats = examples.filter((e) => /aprendido/i.test(e.label ?? ""));
      trainingExamples = fromChats.length > 0 ? fromChats.length : examples.length;
    } catch {
      // training table opcional
    }
    res.json({ ...stats, trainingExamples });
  } catch {
    res.status(500).json({ error: "failed_to_load_chat_learning_stats" });
  }
});

router.get("/aprendizaje/from-chats", async (req: Request, res: Response) => {
  try {
    const statusParam = String(req.query.status ?? "approved");
    const status =
      statusParam === "pending" || statusParam === "rejected" ? statusParam : "approved";
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const candidates = await listLearningCandidates(status, limit);
    res.json({ candidates, total: candidates.length, status });
  } catch {
    res.status(500).json({ error: "failed_to_load_chat_learning" });
  }
});

router.use(requireAuth);

router.get("/learning/candidates", async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || "pending";
    const limit = Number(req.query.limit ?? 50);
    const candidates = await listLearningCandidates(
      status === "approved" || status === "rejected" ? status : "pending",
      limit
    );
    res.json({ candidates, total: candidates.length });
  } catch {
    res.status(500).json({ error: "failed_to_load_candidates" });
  }
});

router.get("/learning/stats", async (_req: Request, res: Response) => {
  try {
    res.json(await getLearningStats());
  } catch {
    res.status(500).json({ error: "failed_to_load_stats" });
  }
});

router.post("/learning/candidates/:id/approve", requireRole("admin", "editor"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { userMessage, suggestedResponse, label } = req.body as {
    userMessage?: string;
    suggestedResponse?: string;
    label?: string;
  };
  try {
    const updated = await approveLearningCandidate(id, req.lucyUser?.email, {
      userMessage,
      suggestedResponse,
      label,
    });
    if (!updated) {
      res.status(404).json({ error: "candidate_not_found" });
      return;
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "failed_to_approve" });
  }
});

router.post("/learning/candidates/:id/reject", requireRole("admin", "editor"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    const ok = await rejectLearningCandidate(id, req.lucyUser?.email);
    if (!ok) {
      res.status(404).json({ error: "candidate_not_found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed_to_reject" });
  }
});

router.post("/learning/sync/:leadId", requireRole("admin", "editor"), async (req: Request, res: Response) => {
  const subdomain = process.env["KOMMO_SUBDOMAIN"]?.trim().replace(/\s+/g, "").toLowerCase() ?? "";
  const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";
  const { leadId } = req.params as { leadId: string };
  const extract = req.body?.extract !== false;

  if (!subdomain || !accessToken) {
    res.status(503).json({ error: "kommo_not_configured" });
    return;
  }

  try {
    const result = await syncHumanPhaseLead(subdomain, accessToken, leadId, { extract });
    res.json(result);
  } catch {
    res.status(500).json({ error: "sync_failed" });
  }
});

router.post("/learning/extract/:leadId", requireRole("admin", "editor"), async (req: Request, res: Response) => {
  const { leadId } = req.params as { leadId: string };
  try {
    const count = await extractLearningCandidatesForLead(leadId, { force: true });
    res.json({ created: count });
  } catch {
    res.status(500).json({ error: "extract_failed" });
  }
});

export default router;

export async function handleLearningCron(req: Request, res: Response): Promise<void> {
  const subdomain = process.env["KOMMO_SUBDOMAIN"]?.trim().replace(/\s+/g, "").toLowerCase() ?? "";
  const accessToken = process.env["KOMMO_ACCESS_TOKEN"] ?? "";
  try {
    const result = await runLearningSyncCron(subdomain, accessToken);
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log?.error({ err }, "Cron learning: error");
    res.status(500).json({ error: "cron_failed" });
  }
}
