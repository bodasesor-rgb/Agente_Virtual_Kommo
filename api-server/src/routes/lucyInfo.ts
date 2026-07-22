import { Router, type IRouter, type Request, type Response } from "express";
import {
  listLucyInfoDocuments,
  getLucyInfoStats,
  createLucyInfoDocument,
  updateLucyInfoDocument,
  deleteLucyInfoDocument,
} from "../services/lucyInfoStore.js";
import { extractPlainTextFromPdf } from "../services/pdfTextExtract.js";

const router: IRouter = Router();

function mapDoc(row: {
  id: string;
  kind: string;
  title: string;
  content: string;
  sourceFilename: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    sourceFilename: row.sourceFilename,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    charCount: row.content?.length ?? 0,
  };
}

router.get("/lucy-info/stats", async (_req: Request, res: Response) => {
  try {
    res.json(await getLucyInfoStats());
  } catch {
    res.status(500).json({ error: "failed_to_load_stats" });
  }
});

router.get("/lucy-info", async (req: Request, res: Response) => {
  try {
    const kindParam = String(req.query.kind ?? "").trim();
    const kind = kindParam === "tips" || kindParam === "catalog" ? kindParam : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const docs = await listLucyInfoDocuments(kind, limit);
    res.json({ documents: docs.map(mapDoc), total: docs.length });
  } catch {
    res.status(500).json({ error: "failed_to_load_lucy_info" });
  }
});

/** Extrae texto plano de un PDF (base64) sin guardar todavía. */
router.post("/lucy-info/extract-pdf", async (req: Request, res: Response) => {
  const { pdfBase64, filename } = req.body as { pdfBase64?: string; filename?: string };
  if (!pdfBase64?.trim()) {
    res.status(400).json({ error: "pdf_required" });
    return;
  }
  try {
    const { text, pages } = await extractPlainTextFromPdf({ base64: pdfBase64 });
    res.json({
      text,
      pages,
      filename: filename?.trim() || null,
      charCount: text.length,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "extract_failed";
    const status =
      code === "pdf_required" ||
      code === "pdf_too_small" ||
      code === "not_a_pdf" ||
      code === "pdf_empty_text"
        ? 400
        : code === "pdf_too_large"
          ? 413
          : 500;
    res.status(status).json({ error: code });
  }
});

router.post("/lucy-info/documents", async (req: Request, res: Response) => {
  const { kind, title, content, sourceFilename, pdfBase64 } = req.body as {
    kind?: string;
    title?: string;
    content?: string;
    sourceFilename?: string;
    pdfBase64?: string;
  };

  try {
    let plain = content?.trim() ?? "";
    let filename = sourceFilename?.trim() || null;

    if (pdfBase64?.trim()) {
      const extracted = await extractPlainTextFromPdf({ base64: pdfBase64 });
      if (!plain) plain = extracted.text;
      if (!filename) filename = title?.trim() ? `${title.trim()}.pdf` : "documento.pdf";
    }

    if (!plain) {
      res.status(400).json({ error: "content_required" });
      return;
    }

    const row = await createLucyInfoDocument({
      kind,
      title,
      content: plain,
      sourceFilename: filename,
    });
    res.status(201).json(mapDoc(row));
  } catch (err) {
    const code = err instanceof Error ? err.message : "failed_to_create";
    const status =
      code === "content_required" || code === "content_too_large" || code === "not_a_pdf"
        ? 400
        : code === "pdf_too_large"
          ? 413
          : 500;
    res.status(status).json({ error: code });
  }
});

router.put("/lucy-info/documents/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { title, content } = req.body as { title?: string; content?: string };
  try {
    const row = await updateLucyInfoDocument(id, { title, content });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(mapDoc(row));
  } catch (err) {
    const code = err instanceof Error ? err.message : "failed_to_update";
    res.status(code === "content_required" || code === "title_required" ? 400 : 500).json({
      error: code,
    });
  }
});

router.delete("/lucy-info/documents/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    const ok = await deleteLucyInfoDocument(id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed_to_delete" });
  }
});

export default router;
