import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { TrainingExample } from "../lib/training.js";

const router: IRouter = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "../data/training-examples.json");

// ─── Types ────────────────────────────────────────────────────────────────────
interface DataStore {
  examples: TrainingExample[];
}

// ─── Persistence helpers ──────────────────────────────────────────────────────
function loadStore(): DataStore {
  try {
    if (!existsSync(DATA_FILE)) return { examples: [] };
    const raw = readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as DataStore;
  } catch {
    return { examples: [] };
  }
}

function saveStore(store: DataStore): void {
  writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/examples
router.get("/examples", (_req: Request, res: Response) => {
  const store = loadStore();
  res.json({ examples: store.examples, total: store.examples.length });
});

// GET /api/examples/stats  — must come before /:id
router.get("/examples/stats", (_req: Request, res: Response) => {
  const store = loadStore();
  const byLabel: Record<string, number> = {};

  for (const ex of store.examples) {
    const lbl = ex.label ?? "Sin etiqueta";
    byLabel[lbl] = (byLabel[lbl] ?? 0) + 1;
  }

  const lastUpdated =
    store.examples.length > 0
      ? store.examples.reduce((latest, ex) => {
          const exDate = ex.createdAt ?? "";
          return exDate > (latest ?? "") ? exDate : latest;
        }, store.examples[0]?.createdAt ?? "")
      : null;

  res.json({ total: store.examples.length, byLabel, lastUpdated });
});

// POST /api/examples
router.post("/examples", (req: Request, res: Response) => {
  const { userMessage, lucyResponse, label } = req.body as {
    userMessage?: string;
    lucyResponse?: string;
    label?: string;
  };

  if (!userMessage?.trim() || !lucyResponse?.trim()) {
    res.status(400).json({ error: "userMessage and lucyResponse are required" });
    return;
  }

  const example: TrainingExample = {
    id: randomUUID(),
    userMessage: userMessage.trim(),
    lucyResponse: lucyResponse.trim(),
    label: label?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  const store = loadStore();
  store.examples.unshift(example); // newest first
  saveStore(store);

  res.status(201).json(example);
});

// PATCH /api/examples/:id
router.patch("/examples/:id", (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { userMessage, lucyResponse, label } = req.body as {
    userMessage?: string;
    lucyResponse?: string;
    label?: string;
  };

  const store = loadStore();
  const idx = store.examples.findIndex((e) => e.id === id);

  if (idx === -1) {
    res.status(404).json({ error: "Example not found" });
    return;
  }

  const existing = store.examples[idx]!;
  store.examples[idx] = {
    ...existing,
    userMessage: userMessage?.trim() ?? existing.userMessage,
    lucyResponse: lucyResponse?.trim() ?? existing.lucyResponse,
    label: label !== undefined ? (label.trim() || undefined) : existing.label,
  };

  saveStore(store);
  res.json(store.examples[idx]);
});

// DELETE /api/examples/:id
router.delete("/examples/:id", (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const store = loadStore();
  const before = store.examples.length;
  store.examples = store.examples.filter((e) => e.id !== id);

  if (store.examples.length === before) {
    res.status(404).json({ error: "Example not found" });
    return;
  }

  saveStore(store);
  res.json({ ok: true });
});

export default router;
