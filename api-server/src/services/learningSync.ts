import { db, conversations } from "@workspace/db";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import { fetchLead, ETAPA, PIPELINE_ID } from "./embudo.js";
import { logger } from "../lib/logger.js";
import { ensureLearningSchema } from "./learningSchema.js";
import { syncLeadTranscript, setLearningPhase } from "./chatIngest.js";
import { extractLearningCandidatesForLead } from "./learningExtractor.js";
import { resolveKommoTalkId } from "./kommoTalks.js";

const LEARNING_PHASES = ["human_active", "post_quote"] as const;

export type LearningSyncResult = {
  synced: boolean;
  candidates: number;
  talkId?: string | null;
  reason?: string;
};

export async function syncHumanPhaseLead(
  subdomain: string,
  accessToken: string,
  kommoLeadId: string,
  options: { extract?: boolean } = {}
): Promise<LearningSyncResult> {
  await ensureLearningSchema();
  const leadId = String(kommoLeadId);
  const lead = await fetchLead(subdomain, accessToken, leadId);
  if (!lead) return { synced: false, candidates: 0, reason: "lead_not_found" };

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.kommoLeadId, leadId),
  });

  const talkId = await resolveKommoTalkId({
    subdomain,
    accessToken,
    leadId,
    knownTalkId: conv?.kommoTalkId ?? null,
    knownChatId: conv?.kommoChatId ?? lead.chatId,
  });

  if (!talkId) {
    logger.warn({ leadId }, "learningSync: sin talkId para sincronizar");
    // Igual marcamos fase para que el cron reintente cuando haya talk.
    if (lead.status_id === ETAPA.HUMANO_TRABAJA) {
      await setLearningPhase(leadId, "human_active");
    } else if (lead.status_id === ETAPA.COTIZACION_REALIZADA) {
      await setLearningPhase(leadId, "post_quote");
    }
    return { synced: false, candidates: 0, talkId: null, reason: "no_talk_id" };
  }

  if (lead.status_id === ETAPA.HUMANO_TRABAJA) {
    await setLearningPhase(leadId, "human_active");
  } else if (lead.status_id === ETAPA.COTIZACION_REALIZADA) {
    await setLearningPhase(leadId, "post_quote");
  }

  await db
    .update(conversations)
    .set({ kommoTalkId: talkId, updatedAt: new Date() })
    .where(eq(conversations.kommoLeadId, leadId));

  await syncLeadTranscript({
    kommoLeadId: leadId,
    talkId: String(talkId),
    subdomain,
    accessToken,
  });

  let candidates = 0;
  if (options.extract !== false) {
    const shouldExtract =
      lead.status_id === ETAPA.COTIZACION_REALIZADA ||
      lead.status_id === ETAPA.HUMANO_TRABAJA;
    if (shouldExtract) {
      candidates = await extractLearningCandidatesForLead(leadId);
    }
  }

  return { synced: true, candidates, talkId };
}

/** Leads en Humano Trabaja / Cotización desde Kommo (no solo BD local). */
export async function listKommoLeadsInLearningStages(
  subdomain: string,
  accessToken: string,
  limitPerStage = 40
): Promise<string[]> {
  const statusIds = [ETAPA.HUMANO_TRABAJA, ETAPA.COTIZACION_REALIZADA];
  const ids = new Set<string>();

  for (const statusId of statusIds) {
    try {
      const url =
        `https://${subdomain}.kommo.com/api/v4/leads` +
        `?filter[statuses][0][pipeline_id]=${PIPELINE_ID}` +
        `&filter[statuses][0][status_id]=${statusId}` +
        `&limit=${limitPerStage}&order[updated_at]=desc`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        logger.warn({ statusId, status: res.status }, "learningSync: list leads falló");
        continue;
      }
      const data = (await res.json()) as { _embedded?: { leads?: Array<{ id?: number }> } };
      for (const lead of data._embedded?.leads ?? []) {
        if (lead.id != null) ids.add(String(lead.id));
      }
    } catch (err) {
      logger.warn({ err, statusId }, "learningSync: error listando leads Kommo");
    }
  }

  return [...ids];
}

export async function runLearningSyncCron(
  subdomain: string,
  accessToken: string
): Promise<{
  leads: number;
  candidates: number;
  eligible: number;
  skippedNoTalkId: number;
  fromKommo: number;
  fromDb: number;
}> {
  await ensureLearningSchema();
  if (!subdomain || !accessToken) {
    logger.warn("learningSync cron: sin credenciales Kommo");
    return {
      leads: 0,
      candidates: 0,
      eligible: 0,
      skippedNoTalkId: 0,
      fromKommo: 0,
      fromDb: 0,
    };
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const leadIds = new Set<string>();

  // 1) BD: learning_phase activa
  try {
    const byPhase = await db.query.conversations.findMany({
      where: and(
        inArray(conversations.learningPhase, [...LEARNING_PHASES]),
        gte(conversations.updatedAt, thirtyDaysAgo)
      ),
    });
    for (const c of byPhase) leadIds.add(c.kommoLeadId);
  } catch (err) {
    logger.warn({ err }, "learningSync cron: error leyendo learning_phase");
  }

  // 2) BD: stage/status aunque falte learning_phase (bug histórico)
  try {
    const byStage = await db.query.conversations.findMany({
      where: and(
        or(
          eq(conversations.stage, "humano_trabaja"),
          eq(conversations.status, "qualified")
        ),
        gte(conversations.updatedAt, thirtyDaysAgo)
      ),
    });
    for (const c of byStage) leadIds.add(c.kommoLeadId);
  } catch (err) {
    logger.warn({ err }, "learningSync cron: error leyendo stage humano_trabaja");
  }

  const fromDb = leadIds.size;

  // 3) Kommo vivo: leads actuales en esas etapas
  const fromKommoList = await listKommoLeadsInLearningStages(subdomain, accessToken);
  for (const id of fromKommoList) leadIds.add(id);
  const fromKommo = fromKommoList.length;

  let totalCandidates = 0;
  let processed = 0;
  let skippedNoTalkId = 0;

  for (const leadId of leadIds) {
    try {
      const lead = await fetchLead(subdomain, accessToken, leadId);
      if (!lead) continue;

      const inLearningStage =
        lead.status_id === ETAPA.HUMANO_TRABAJA ||
        lead.status_id === ETAPA.COTIZACION_REALIZADA;
      if (!inLearningStage) continue;

      const result = await syncHumanPhaseLead(subdomain, accessToken, leadId, {
        extract: true,
      });
      if (result.reason === "no_talk_id") skippedNoTalkId++;
      if (result.synced) processed++;
      totalCandidates += result.candidates;
    } catch (err) {
      logger.warn({ err, leadId }, "learningSync cron: lead falló");
    }
  }

  logger.info(
    {
      processed,
      totalCandidates,
      eligible: leadIds.size,
      skippedNoTalkId,
      fromDb,
      fromKommo,
    },
    "learningSync cron: completado"
  );
  return {
    leads: processed,
    candidates: totalCandidates,
    eligible: leadIds.size,
    skippedNoTalkId,
    fromKommo,
    fromDb,
  };
}
