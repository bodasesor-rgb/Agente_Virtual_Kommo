import { Router, type Request, type Response } from "express";
import { db, conversations, leadScores, messages } from "@workspace/db";
import { eq, gte, desc, sql, and, type SQL } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/analytics/overview - Resumen general
// ═══════════════════════════════════════════════════════════════════════════
router.get("/analytics/overview", async (_req: Request, res: Response) => {
  try {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations);
    const totalConversations = Number(totalResult?.count ?? 0);

    const [activeResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(eq(conversations.status, "active"));
    const activeConversations = Number(activeResult?.count ?? 0);

    const [hotResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(leadScores)
      .where(eq(leadScores.priority, "hot"));
    const [warmResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(leadScores)
      .where(eq(leadScores.priority, "warm"));
    const [coldResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(leadScores)
      .where(eq(leadScores.priority, "cold"));

    const hotLeads = Number(hotResult?.count ?? 0);
    const warmLeads = Number(warmResult?.count ?? 0);
    const coldLeads = Number(coldResult?.count ?? 0);

    const avgScoreResult = await db
      .select({ avg: sql<number>`AVG(${leadScores.totalScore})` })
      .from(leadScores);
    const averageScore = Math.round(Number(avgScoreResult[0]?.avg ?? 0));

    const stageDistribution = await db
      .select({
        stage: conversations.stage,
        count: sql<number>`count(*)`,
      })
      .from(conversations)
      .where(eq(conversations.status, "active"))
      .groupBy(conversations.stage);

    const topLeads = await db
      .select({
        id: conversations.id,
        kommoLeadId: conversations.kommoLeadId,
        clientName: conversations.clientName,
        eventType: conversations.eventType,
        score: leadScores.totalScore,
        priority: leadScores.priority,
        stage: conversations.stage,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .leftJoin(leadScores, eq(conversations.kommoLeadId, leadScores.kommoLeadId))
      .where(eq(conversations.status, "active"))
      .orderBy(desc(leadScores.totalScore))
      .limit(5);

    res.json({
      overview: {
        totalConversations,
        activeConversations,
        averageScore,
        distribution: { hot: hotLeads, warm: warmLeads, cold: coldLeads },
      },
      stageDistribution,
      topLeads,
    });
  } catch (err) {
    const log = (_req as Request & { log?: { error: (...a: unknown[]) => void } }).log;
    if (log) log.error(err);
    res.status(500).json({ error: "Error al obtener overview" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/analytics/conversations - Lista con filtros
// ═══════════════════════════════════════════════════════════════════════════
router.get("/analytics/conversations", async (req: Request, res: Response) => {
  try {
    const { priority, stage, limit = "50" } = req.query;
    const priorityFilter = typeof priority === "string" ? priority : undefined;
    const stageFilter = typeof stage === "string" ? stage : undefined;

    const conditions: SQL<unknown>[] = [];
    if (priorityFilter) conditions.push(eq(leadScores.priority, priorityFilter));
    if (stageFilter) conditions.push(eq(conversations.stage, stageFilter));

    const baseQuery = db
      .select({
        id: conversations.id,
        kommoLeadId: conversations.kommoLeadId,
        clientName: conversations.clientName,
        clientEmail: conversations.clientEmail,
        eventType: conversations.eventType,
        eventDate: conversations.eventDate,
        guestCount: conversations.guestCount,
        budget: conversations.budget,
        status: conversations.status,
        stage: conversations.stage,
        messageCount: conversations.messageCount,
        lastIntent: conversations.lastIntent,
        sentiment: conversations.sentiment,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        score: leadScores.totalScore,
        priority: leadScores.priority,
        reasoning: leadScores.reasoning,
      })
      .from(conversations)
      .leftJoin(leadScores, eq(conversations.kommoLeadId, leadScores.kommoLeadId));

    const results = conditions.length > 0
      ? await baseQuery.where(and(...conditions)).orderBy(desc(conversations.updatedAt)).limit(parseInt(limit as string))
      : await baseQuery.orderBy(desc(conversations.updatedAt)).limit(parseInt(limit as string));

    res.json({ conversations: results });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Error al obtener conversaciones" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/analytics/conversation/:kommoLeadId - Detalle
// ═══════════════════════════════════════════════════════════════════════════
router.get("/analytics/conversation/:kommoLeadId", async (req: Request, res: Response) => {
  try {
    const { kommoLeadId } = req.params as { kommoLeadId: string };

    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.kommoLeadId, kommoLeadId),
    });

    if (!conversation) {
      res.status(404).json({ error: "Conversación no encontrada" });
      return;
    }

    const score = await db.query.leadScores.findFirst({
      where: eq(leadScores.kommoLeadId, kommoLeadId),
    });

    const messageHistory = await db
      .select()
      .from(messages)
      .where(eq(messages.kommoLeadId, kommoLeadId))
      .orderBy(messages.timestamp);

    res.json({ conversation, score, messages: messageHistory });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Error al obtener detalle" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/analytics/metrics/daily - Últimos 30 días
// ═══════════════════════════════════════════════════════════════════════════
router.get("/analytics/metrics/daily", async (_req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const conversationsByDay = await db
      .select({
        date: sql<string>`DATE(${conversations.createdAt})`,
        count: sql<number>`count(*)`,
      })
      .from(conversations)
      .where(gte(conversations.createdAt, thirtyDaysAgo))
      .groupBy(sql`DATE(${conversations.createdAt})`)
      .orderBy(sql`DATE(${conversations.createdAt})`);

    const scoresByDay = await db
      .select({
        date: sql<string>`DATE(${leadScores.calculatedAt})`,
        avgScore: sql<number>`AVG(${leadScores.totalScore})`,
        hotCount: sql<number>`SUM(CASE WHEN ${leadScores.priority} = 'hot' THEN 1 ELSE 0 END)`,
        warmCount: sql<number>`SUM(CASE WHEN ${leadScores.priority} = 'warm' THEN 1 ELSE 0 END)`,
        coldCount: sql<number>`SUM(CASE WHEN ${leadScores.priority} = 'cold' THEN 1 ELSE 0 END)`,
      })
      .from(leadScores)
      .where(gte(leadScores.calculatedAt, thirtyDaysAgo))
      .groupBy(sql`DATE(${leadScores.calculatedAt})`)
      .orderBy(sql`DATE(${leadScores.calculatedAt})`);

    res.json({ conversationsByDay, scoresByDay });
  } catch (err) {
    const log = (_req as Request & { log?: { error: (...a: unknown[]) => void } }).log;
    if (log) log.error(err);
    res.status(500).json({ error: "Error al obtener métricas diarias" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/analytics/stats - Estadísticas generales
// ═══════════════════════════════════════════════════════════════════════════
router.get("/analytics/stats", async (_req: Request, res: Response) => {
  try {
    const eventTypes = await db
      .select({
        eventType: conversations.eventType,
        count: sql<number>`count(*)`,
      })
      .from(conversations)
      .where(sql`${conversations.eventType} IS NOT NULL`)
      .groupBy(conversations.eventType)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const intents = await db
      .select({
        intent: messages.intent,
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .where(sql`${messages.intent} IS NOT NULL`)
      .groupBy(messages.intent)
      .orderBy(desc(sql`count(*)`));

    const sentimentDist = await db
      .select({
        sentiment: conversations.sentiment,
        count: sql<number>`count(*)`,
      })
      .from(conversations)
      .groupBy(conversations.sentiment);

    const stageConversion = await db
      .select({
        stage: conversations.stage,
        count: sql<number>`count(*)`,
      })
      .from(conversations)
      .groupBy(conversations.stage)
      .orderBy(desc(sql`count(*)`));

    res.json({ eventTypes, intents, sentimentDistribution: sentimentDist, stageConversion });
  } catch (err) {
    const log = (_req as Request & { log?: { error: (...a: unknown[]) => void } }).log;
    if (log) log.error(err);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

export default router;
