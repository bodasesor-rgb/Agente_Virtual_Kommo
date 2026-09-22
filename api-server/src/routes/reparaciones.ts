import { Router, type IRouter, type Request, type Response } from "express";
import {
  dismissLucyRepair,
  getLucyRepairStats,
  listLucyRepairs,
  resolveLucyRepair,
  type LucyRepairStatus,
} from "../services/lucyRepairStore.js";
import { runLucyAuditorBatch } from "../services/lucyAuditor.js";

const router: IRouter = Router();

router.get("/reparaciones", async (req: Request, res: Response) => {
  try {
    const statusParam = String(req.query.status ?? "open");
    const status = (
      ["open", "auto_flagged", "resolved", "dismissed", "all"].includes(statusParam)
        ? statusParam
        : "open"
    ) as LucyRepairStatus | "all";
    // open tab = open + auto_flagged
    if (statusParam === "open") {
      const open = await listLucyRepairs("open", 40);
      const flagged = await listLucyRepairs("auto_flagged", 40);
      const merged = [...flagged, ...open]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50);
      res.json({ repairs: merged, total: merged.length });
      return;
    }
    const repairs = await listLucyRepairs(status, Math.min(Number(req.query.limit ?? 50), 100));
    res.json({ repairs, total: repairs.length });
  } catch {
    res.status(500).json({ error: "failed_to_load_reparaciones" });
  }
});

router.get("/reparaciones/stats", async (_req: Request, res: Response) => {
  try {
    res.json(await getLucyRepairStats());
  } catch {
    res.status(500).json({ error: "failed_to_load_stats" });
  }
});

router.post("/reparaciones/run", async (req: Request, res: Response) => {
  try {
    const onlyToday = req.body?.onlyToday !== false;
    const result = await runLucyAuditorBatch({
      limitLeads: Math.min(Number(req.body?.limitLeads ?? (onlyToday ? 50 : 20)), 80),
      useFlash: req.body?.useFlash !== false,
      onlyToday,
      syncFromKommo: req.body?.syncFromKommo !== false,
      forceFlash: req.body?.forceFlash !== false,
      oncePerDay: false,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log?.error?.({ err }, "reparaciones/run failed");
    res.status(500).json({ error: "audit_failed" });
  }
});

/** SSE: progreso en vivo (sync + chats + hallazgos). */
router.post("/reparaciones/run-stream", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as Response & { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as Response & { flushHeaders: () => void }).flushHeaders();
  }

  const send = (payload: unknown) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const onlyToday = req.body?.onlyToday !== false;
  try {
    send({ type: "phase", phase: "sync", message: "Iniciando auditoría…" });
    const result = await runLucyAuditorBatch({
      limitLeads: Math.min(Number(req.body?.limitLeads ?? (onlyToday ? 50 : 20)), 80),
      useFlash: req.body?.useFlash !== false,
      onlyToday,
      syncFromKommo: req.body?.syncFromKommo !== false,
      forceFlash: req.body?.forceFlash !== false,
      oncePerDay: false,
      onProgress: (ev) => send(ev),
    });
    send({ type: "result", result: { ok: true, ...result } });
  } catch (err) {
    req.log?.error?.({ err }, "reparaciones/run-stream failed");
    send({
      type: "error",
      message: err instanceof Error ? err.message : "audit_failed",
    });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

router.post("/reparaciones/cron", async (req: Request, res: Response) => {
  try {
    const { runLucyAuditorDaily } = await import("../services/lucyAuditor.js");
    const result = await runLucyAuditorDaily();
    res.json({ ok: true, mode: "daily", ...result });
  } catch (err) {
    req.log?.error?.({ err }, "reparaciones/cron failed");
    res.status(500).json({ error: "cron_failed" });
  }
});

/** Diagnóstico: candidatos talk_id + respuesta cruda de Talks messages. */
router.get("/reparaciones/probe-talk", async (req: Request, res: Response) => {
  try {
    const leadId = String(req.query.leadId ?? "").trim();
    if (!leadId) {
      res.status(400).json({ error: "leadId_required" });
      return;
    }
    const { getKommoAccessToken, getKommoSubdomain } = await import(
      "../lib/kommoEnv.js"
    );
    const { listKommoTalkIdCandidates } = await import("../services/kommoTalks.js");
    const { fetchKommoTalkMessages } = await import("../services/chatIngest.js");
    const subdomain = getKommoSubdomain();
    const accessToken = getKommoAccessToken();
    if (!subdomain || !accessToken) {
      res.status(500).json({ error: "kommo_not_configured" });
      return;
    }

    const candidates = await listKommoTalkIdCandidates({
      subdomain,
      accessToken,
      leadId,
    });

    const talksListUrl =
      `https://${subdomain}.kommo.com/api/v4/talks` +
      `?filter[entity_id]=${encodeURIComponent(leadId)}&filter[entity_type]=lead&limit=10`;
    const talksRes = await fetch(talksListUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const talksBody = await talksRes.text();

    const probes = [];
    for (const talkId of candidates.slice(0, 5)) {
      const msgUrl =
        `https://${subdomain}.kommo.com/api/v4/talks/${talkId}/messages?limit=5&order=desc`;
      const msgRes = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const msgText = await msgRes.text();
      const parsed = await fetchKommoTalkMessages(
        subdomain,
        accessToken,
        talkId,
        10
      );
      probes.push({
        talkId,
        httpStatus: msgRes.status,
        bodyPreview: msgText.slice(0, 500),
        parsedTextCount: parsed.length,
      });
    }

    res.json({
      leadId,
      candidates,
      talksListStatus: talksRes.status,
      talksListPreview: talksBody.slice(0, 800),
      probes,
    });
  } catch (err) {
    req.log?.error?.({ err }, "reparaciones/probe-talk failed");
    res.status(500).json({
      error: "probe_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/reparaciones/:id/resolve", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    const updated = await resolveLucyRepair(
      id,
      typeof req.body?.appliedRepair === "string" ? req.body.appliedRepair : undefined,
      "panel"
    );
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "resolve_failed" });
  }
});

router.post("/reparaciones/:id/dismiss", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    const ok = await dismissLucyRepair(id, "panel");
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "dismiss_failed" });
  }
});

export default router;
