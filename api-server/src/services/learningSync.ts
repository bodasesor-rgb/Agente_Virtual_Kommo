import { db, conversations } from "@workspace/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import { fetchLead, ETAPA } from "./embudo.js";
import { logger } from "../lib/logger.js";
import { ensureLearningSchema } from "./learningSchema.js";
import { syncLeadTranscript, setLearningPhase } from "./chatIngest.js";
import { extractLearningCandidatesForLead } from "./learningExtractor.js";

const LEARNING_PHASES = ["human_active", "post_quote"] as const;

export async function syncHumanPhaseLead(
  subdomain: string,
  accessToken: string,
  kommoLeadId: string,
  options: { extract?: boolean } = {}
): Promise<{ synced: boolean; candidates: number }> {
  await ensureLearningSchema();
  const leadId = String(kommoLeadId);
  const lead = await fetchLead(subdomain, accessToken, leadId);
  if (!lead) return { synced: false, candidates: 0 };

  let talkId: string | null = null;
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.kommoLeadId, leadId),
  });
  talkId = conv?.kommoTalkId ?? lead.chatId;

  if (!talkId) {
    logger.warn({ leadId }, "learningSync: sin talkId para sincronizar");
    return { synced: false, candidates: 0 };
  }

  if (lead.status_id === ETAPA.HUMANO_TRABAJA) {
    await setLearningPhase(leadId, "human_active");
  } else if (lead.status_id === ETAPA.COTIZACION_REALIZADA) {
    await setLearningPhase(leadId, "post_quote");
  }

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

  return { synced: true, candidates };
}

export async function runLearningSyncCron(
  subdomain: string,
  accessToken: string
): Promise<{ leads: number; candidates: number }> {
  await ensureLearningSchema();
  if (!subdomain || !accessToken) {
    logger.warn("learningSync cron: sin credenciales Kommo");
    return { leads: 0, candidates: 0 };
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let convs;
  try {
    convs = await db.query.conversations.findMany({
      where: and(
        inArray(conversations.learningPhase, [...LEARNING_PHASES]),
        gte(conversations.updatedAt, thirtyDaysAgo)
      ),
    });
  } catch (err) {
    logger.warn({ err }, "learningSync cron: error leyendo conversaciones");
    return { leads: 0, candidates: 0 };
  }

  let totalCandidates = 0;
  let processed = 0;

  for (const conv of convs) {
    try {
      const lead = await fetchLead(subdomain, accessToken, conv.kommoLeadId);
      if (!lead) continue;

      const inLearningStage =
        lead.status_id === ETAPA.HUMANO_TRABAJA ||
        lead.status_id === ETAPA.COTIZACION_REALIZADA;
      if (!inLearningStage && conv.learningPhase == null) continue;

      // Extraer tanto en Humano Trabaja como en Cotización — antes solo Cotización,
      // por eso Lucy "nunca aprendía" mientras Alejandro atendía.
      const result = await syncHumanPhaseLead(subdomain, accessToken, conv.kommoLeadId, {
        extract:
          lead.status_id === ETAPA.COTIZACION_REALIZADA ||
          lead.status_id === ETAPA.HUMANO_TRABAJA,
      });
      if (result.synced) processed++;
      totalCandidates += result.candidates;
    } catch (err) {
      logger.warn({ err, leadId: conv.kommoLeadId }, "learningSync cron: lead falló");
    }
  }

  logger.info({ processed, totalCandidates }, "learningSync cron: completado");
  return { leads: processed, candidates: totalCandidates };
}
