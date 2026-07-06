import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  kommoLeadId: varchar("kommo_lead_id", { length: 64 }).notNull().unique(),
  kommoChatId: varchar("kommo_chat_id", { length: 128 }),
  kommoTalkId: varchar("kommo_talk_id", { length: 128 }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  stage: varchar("stage", { length: 64 }).notNull().default("discovery"),
  messageCount: integer("message_count").notNull().default(0),
  clientName: varchar("client_name", { length: 255 }),
  clientEmail: varchar("client_email", { length: 255 }),
  clientPhone: varchar("client_phone", { length: 64 }),
  eventType: varchar("event_type", { length: 128 }),
  eventDate: timestamp("event_date"),
  guestCount: integer("guest_count"),
  budget: varchar("budget", { length: 64 }),
  lastIntent: varchar("last_intent", { length: 64 }),
  sentiment: varchar("sentiment", { length: 32 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const leadScores = pgTable("lead_scores", {
  id: serial("id").primaryKey(),
  kommoLeadId: varchar("kommo_lead_id", { length: 64 }).notNull().unique(),
  totalScore: integer("total_score").notNull().default(0),
  priority: varchar("priority", { length: 16 }).notNull().default("cold"),
  budgetScore: integer("budget_score").notNull().default(0),
  urgencyScore: integer("urgency_score").notNull().default(0),
  engagementScore: integer("engagement_score").notNull().default(0),
  completenessScore: integer("completeness_score").notNull().default(0),
  intentScore: integer("intent_score").notNull().default(0),
  reasoning: text("reasoning"),
  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  kommoLeadId: varchar("kommo_lead_id", { length: 64 }).notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull(),
  intent: varchar("intent", { length: 64 }),
  sentiment: varchar("sentiment", { length: 32 }),
  extractedData: jsonb("extracted_data"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const followUpEvents = pgTable("follow_up_events", {
  id: serial("id").primaryKey(),
  kommoLeadId: varchar("kommo_lead_id", { length: 64 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  message: text("message"),
  priority: integer("priority").notNull().default(1),
  executed: boolean("executed").notNull().default(false),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 128 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 32 }).notNull().default("viewer"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
