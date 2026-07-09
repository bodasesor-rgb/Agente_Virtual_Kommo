import { pgTable, text, timestamp, integer, boolean, jsonb, varchar, decimal, uuid } from "drizzle-orm/pg-core";

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSACIONES
// ═══════════════════════════════════════════════════════════════════════════
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  kommoLeadId: text("kommo_lead_id").unique().notNull(),
  kommoChatId: text("kommo_chat_id").notNull(),
  kommoTalkId: text("kommo_talk_id"),

  clientName: text("client_name"),
  clientEmail: text("client_email"),
  clientPhone: text("client_phone"),

  status: varchar("status", { length: 50 }).notNull().default("active"),
  stage: varchar("stage", { length: 50 }).notNull().default("discovery"),

  eventType: text("event_type"),
  eventDate: timestamp("event_date"),
  guestCount: integer("guest_count"),
  budget: decimal("budget", { precision: 10, scale: 2 }),

  messageCount: integer("message_count").notNull().default(0),
  lastIntent: varchar("last_intent", { length: 100 }),
  sentiment: varchar("sentiment", { length: 50 }).default("neutral"),

  learningPhase: varchar("learning_phase", { length: 30 }),
  lastKommoSyncAt: timestamp("last_kommo_sync_at"),
  lastLearningExtractAt: timestamp("last_learning_extract_at"),
  /** Último mensaje del CLIENTE — base para ventana 24h de WhatsApp */
  lastClientMessageAt: timestamp("last_client_message_at"),
  lastWindowRenewalAt: timestamp("last_window_renewal_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// LEAD SCORES
// ═══════════════════════════════════════════════════════════════════════════
export const leadScores = pgTable("lead_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  kommoLeadId: text("kommo_lead_id").unique().notNull(),

  totalScore: integer("total_score").notNull().default(0),
  priority: varchar("priority", { length: 20 }).notNull().default("cold"),

  budgetScore: integer("budget_score").notNull().default(0),
  urgencyScore: integer("urgency_score").notNull().default(0),
  engagementScore: integer("engagement_score").notNull().default(0),
  completenessScore: integer("completeness_score").notNull().default(0),
  intentScore: integer("intent_score").notNull().default(0),

  reasoning: text("reasoning"),

  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type LeadScoreRecord = typeof leadScores.$inferSelect;
export type InsertLeadScore = typeof leadScores.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// MENSAJES
// ═══════════════════════════════════════════════════════════════════════════
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  kommoLeadId: text("kommo_lead_id").notNull(),

  role: varchar("role", { length: 20 }).notNull(),
  authorType: varchar("author_type", { length: 20 }),
  content: text("content").notNull(),

  kommoMessageId: text("kommo_message_id"),
  source: varchar("source", { length: 30 }),

  intent: varchar("intent", { length: 100 }),
  sentiment: decimal("sentiment", { precision: 3, scale: 2 }),
  extractedData: jsonb("extracted_data"),

  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export type MessageRecord = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// MÉTRICAS DIARIAS
// ═══════════════════════════════════════════════════════════════════════════
export const dailyMetrics = pgTable("daily_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: timestamp("date").notNull(),

  conversationsStarted: integer("conversations_started").notNull().default(0),
  conversationsClosed: integer("conversations_closed").notNull().default(0),
  leadsQualified: integer("leads_qualified").notNull().default(0),

  averageResponseTime: integer("average_response_time"),
  averageLeadScore: decimal("average_lead_score", { precision: 5, scale: 2 }),

  hotLeads: integer("hot_leads").notNull().default(0),
  warmLeads: integer("warm_leads").notNull().default(0),
  coldLeads: integer("cold_leads").notNull().default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DailyMetric = typeof dailyMetrics.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// SEGUIMIENTOS
// ═══════════════════════════════════════════════════════════════════════════
export const followUpEvents = pgTable("follow_up_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  kommoLeadId: text("kommo_lead_id").notNull(),

  type: varchar("type", { length: 50 }).notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  executed: boolean("executed").notNull().default(false),

  message: text("message"),
  priority: integer("priority").notNull().default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  executedAt: timestamp("executed_at"),
});

export type FollowUpEvent = typeof followUpEvents.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════════════════════
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: varchar("role", { length: 50 }).notNull().default("viewer"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export type User = typeof users.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// EJEMPLOS DE ENTRENAMIENTO (few-shot Lucy — editable desde lucy-admin)
// ═══════════════════════════════════════════════════════════════════════════
export const trainingExamples = pgTable("training_examples", {
  id: uuid("id").primaryKey().defaultRandom(),
  userMessage: text("user_message").notNull(),
  lucyResponse: text("lucy_response").notNull(),
  label: text("label"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type TrainingExampleRecord = typeof trainingExamples.$inferSelect;
export type InsertTrainingExample = typeof trainingExamples.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// CANDIDATOS DE APRENDIZAJE (extraídos de chats con humano — revisión en admin)
// ═══════════════════════════════════════════════════════════════════════════
export const learningCandidates = pgTable("learning_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  kommoLeadId: text("kommo_lead_id").notNull(),

  userMessage: text("user_message").notNull(),
  suggestedResponse: text("suggested_response").notNull(),
  label: text("label"),

  status: varchar("status", { length: 20 }).notNull().default("pending"),
  source: varchar("source", { length: 30 }).notNull().default("human_chat"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),

  contextSnippet: text("context_snippet"),
  dedupeKey: text("dedupe_key").unique(),

  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type LearningCandidateRecord = typeof learningCandidates.$inferSelect;
export type InsertLearningCandidate = typeof learningCandidates.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// HUECOS DE CONOCIMIENTO — preguntas que Lucy no pudo responder con catálogo
// ═══════════════════════════════════════════════════════════════════════════
export const knowledgeGaps = pgTable("knowledge_gaps", {
  id: uuid("id").primaryKey().defaultRandom(),
  kommoLeadId: text("kommo_lead_id"),
  question: text("question").notNull(),
  topic: text("topic"),
  gapType: varchar("gap_type", { length: 30 }).notNull().default("unknown"),
  lucyResponse: text("lucy_response"),
  answer: text("answer"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  contextSnippet: text("context_snippet"),
  dedupeKey: text("dedupe_key").unique(),
  answeredAt: timestamp("answered_at"),
  answeredBy: text("answered_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type KnowledgeGapRecord = typeof knowledgeGaps.$inferSelect;
export type InsertKnowledgeGap = typeof knowledgeGaps.$inferInsert;
