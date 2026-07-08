import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import {
  listTrainingExamples,
  getTrainingStats,
  createTrainingExample,
  updateTrainingExample,
  deleteTrainingExample,
} from "../services/trainingStore.js";

const router: IRouter = Router();

router.use(requireAuth);

// GET /api/examples
router.get("/examples", async (_req: Request, res: Response) => {
  try {
    const examples = await listTrainingExamples();
    res.json({ examples, total: examples.length });
  } catch (err) {
    res.status(500).json({ error: "failed_to_load_examples" });
  }
});

// GET /api/examples/stats
router.get("/examples/stats", async (_req: Request, res: Response) => {
  try {
    res.json(await getTrainingStats());
  } catch {
    res.status(500).json({ error: "failed_to_load_stats" });
  }
});

// POST /api/examples
router.post("/examples", requireRole("admin", "editor"), async (req: Request, res: Response) => {
  const { userMessage, lucyResponse, label } = req.body as {
    userMessage?: string;
    lucyResponse?: string;
    label?: string;
  };

  if (!userMessage?.trim() || !lucyResponse?.trim()) {
    res.status(400).json({ error: "userMessage and lucyResponse are required" });
    return;
  }

  try {
    const example = await createTrainingExample({
      userMessage,
      lucyResponse,
      label,
    });
    res.status(201).json(example);
  } catch {
    res.status(500).json({ error: "failed_to_create_example" });
  }
});

// PATCH /api/examples/:id
router.patch("/examples/:id", requireRole("admin", "editor"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { userMessage, lucyResponse, label } = req.body as {
    userMessage?: string;
    lucyResponse?: string;
    label?: string;
  };

  try {
    const updated = await updateTrainingExample(id, { userMessage, lucyResponse, label });
    if (!updated) {
      res.status(404).json({ error: "Example not found" });
      return;
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "failed_to_update_example" });
  }
});

// DELETE /api/examples/:id
router.delete("/examples/:id", requireRole("admin", "editor"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    const ok = await deleteTrainingExample(id);
    if (!ok) {
      res.status(404).json({ error: "Example not found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed_to_delete_example" });
  }
});

export default router;
