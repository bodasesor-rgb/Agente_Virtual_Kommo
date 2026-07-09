import { createHash } from "crypto";
import { db, conversations, messages } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { ensureLearningSchema } from "./learningSchema.js";

export type AuthorType = "client" | "lucy" | "human_agent";

export interface KommoTalkMessage {
  id?: string | number;
  text?: string;
  created_at?: number;
  author?: { type?: string; name?: string };
}

export function mapKommoAuthor(authorType?: string): AuthorType {
  if (authorType === "external") return "client";
  if (authorType === "bot") return "lucy";
  return "human_agent";
}

export function roleFromAuthor(author: AuthorType): string {
  if (author === "client") return "user";
  if (author === "lucy") return "assistant";
  return "human";
}

function contentHash(leadId: string, author: AuthorType, text: string): string {
  return createHash("sha256")
    .update(`${leadId}|${author}|${text.trim()}`)
    .digest("hex")
    .slice(0, 40);
}

export async function fetchKommoTalkMessages(
  subdomain: string,
  accessToken: string,
  talkId: string,
  limit = 50
): Promise<KommoTalkMessage[]> {
  try {
    const url = `https://${subdomain}.kommo.com/api/v4/talks/${talkId}/messages?limit=${limit}&order=asc`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return [];
    const data = (await res.json()) as { _embedded?: { messages?: KommoTalkMessage[] } };
    return (data._embedded?.messages ?? []).filter((m) => m.text?.trim());
  } catch (err) {
    logger.warn({ err, talkId }, "chatIngest: error leyendo Talks API");
    return [];
  }
}

export async function persistChatMessage(input: {
  kommoLeadId: string;
  content: string;
  authorType: AuthorType;
  kommoMessageId?: string | null;
  source?: string;
  intent?: string;
  sentiment?: string;
  extractedData?: Record<string, unknown>;
}): Promise<boolean> {
  await ensureLearningSchema();
  const text = input.content.trim();
  if (!text) return false;

  const kommoId = input.kommoMessageId ? String(input.kommoMessageId) : null;

  if (kommoId) {
    const existing = await db.query.messages.findFirst({
      where: eq(messages.kommoMessageId, kommoId),
    });
    if (existing) return false;
  }

  try {
    await db.insert(messages).values({
      kommoLeadId: input.kommoLeadId,
      role: roleFromAuthor(input.authorType),
      authorType: input.authorType,
      content: text,
      kommoMessageId: kommoId,
      source: input.source ?? "ingest",
      intent: input.intent,
      sentiment: input.sentiment,
      extractedData: input.extractedData,
    });
    return true;
  } catch (err) {
    logger.warn({ err, leadId: input.kommoLeadId }, "chatIngest: no se pudo guardar mensaje");
    return false;
  }
}

export async function captureInboundWhileLucyInactive(input: {
  kommoLeadId: string;
  chatId: string;
  talkId: string | null;
  text: string;
  subdomain: string;
  accessToken: string;
}): Promise<void> {
  await recordInboundClientMessage({
    ...input,
    source: "webhook_inactive",
    learningPhase: "human_active",
  });
}

/**
 * Registra mensaje entrante del cliente: BD, lastClientMessageAt y sync del chat.
 * Lucy puede ejecutar esto sin enviar respuesta (solo lectura / aprendizaje).
 */
export async function recordInboundClientMessage(input: {
  kommoLeadId: string;
  chatId: string;
  talkId: string | null;
  text: string;
  subdomain: string;
  accessToken: string;
  source?: string;
  learningPhase?: "lucy_active" | "human_active" | "post_quote" | "closed";
}): Promise<void> {
  await ensureLearningSchema();

  const leadId = String(input.kommoLeadId);
  const now = new Date();

  await persistChatMessage({
    kommoLeadId: leadId,
    content: input.text,
    authorType: "client",
    source: input.source ?? "webhook_ingest",
  });

  let conv = await db.query.conversations.findFirst({
    where: eq(conversations.kommoLeadId, leadId),
  });

  if (!conv) {
    const [created] = await db
      .insert(conversations)
      .values({
        kommoLeadId: leadId,
        kommoChatId: input.chatId,
        kommoTalkId: input.talkId ?? undefined,
        learningPhase: input.learningPhase ?? "lucy_active",
        status: "active",
        stage: input.learningPhase === "human_active" ? "humano_trabaja" : "discovery",
        messageCount: 1,
        lastClientMessageAt: now,
        updatedAt: now,
      })
      .returning();
    conv = created;
  } else {
    await db
      .update(conversations)
      .set({
        kommoChatId: input.chatId,
        kommoTalkId: input.talkId ?? conv.kommoTalkId,
        learningPhase: input.learningPhase ?? conv.learningPhase ?? "lucy_active",
        lastClientMessageAt: now,
        updatedAt: now,
      })
      .where(eq(conversations.id, conv.id));
  }

  if (input.talkId && input.subdomain && input.accessToken) {
    void syncLeadTranscript({
      kommoLeadId: leadId,
      talkId: input.talkId,
      subdomain: input.subdomain,
      accessToken: input.accessToken,
    }).catch((err) => logger.warn({ err, leadId }, "chatIngest: sync background falló"));
  }
}

export async function syncLeadTranscript(input: {
  kommoLeadId: string;
  talkId: string;
  subdomain: string;
  accessToken: string;
}): Promise<{ inserted: number; total: number }> {
  await ensureLearningSchema();
  const raw = await fetchKommoTalkMessages(input.subdomain, input.accessToken, input.talkId, 80);
  let inserted = 0;

  for (const msg of raw) {
    const authorType = mapKommoAuthor(msg.author?.type);
    const kommoMessageId = msg.id != null ? String(msg.id) : contentHash(input.kommoLeadId, authorType, msg.text!);
    const ok = await persistChatMessage({
      kommoLeadId: input.kommoLeadId,
      content: msg.text!,
      authorType,
      kommoMessageId,
      source: "kommo_sync",
    });
    if (ok) inserted++;
  }

  await db
    .update(conversations)
    .set({ lastKommoSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(conversations.kommoLeadId, input.kommoLeadId));

  logger.info(
    { leadId: input.kommoLeadId, inserted, total: raw.length },
    "chatIngest: transcript sincronizado"
  );

  return { inserted, total: raw.length };
}

export async function setLearningPhase(
  kommoLeadId: string,
  phase: "lucy_active" | "human_active" | "post_quote" | "closed"
): Promise<void> {
  await ensureLearningSchema();
  const leadId = String(kommoLeadId);
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.kommoLeadId, leadId),
  });
  if (!conv) {
    await db.insert(conversations).values({
      kommoLeadId: leadId,
      kommoChatId: leadId,
      learningPhase: phase,
      status: "active",
      stage: phase === "human_active" ? "humano_trabaja" : "discovery",
    });
    return;
  }
  await db
    .update(conversations)
    .set({ learningPhase: phase, updatedAt: new Date() })
    .where(eq(conversations.id, conv.id));
}
