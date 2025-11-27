import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  decimal,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  companyName: varchar("company_name"),
  businessNumber: varchar("business_number"),
  phone: varchar("phone"),
  balance: decimal("balance", { precision: 12, scale: 0 }).default("0"),
  stripeCustomerId: varchar("stripe_customer_id"),
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Campaigns table
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(), // draft, pending, approved, running, completed, rejected, cancelled
  messageType: varchar("message_type", { length: 10 }).notNull(), // LMS, MMS, RCS
  targetCount: integer("target_count").default(0).notNull(),
  sentCount: integer("sent_count").default(0),
  successCount: integer("success_count").default(0),
  budget: decimal("budget", { precision: 12, scale: 0 }).notNull(),
  costPerMessage: decimal("cost_per_message", { precision: 10, scale: 0 }).default("50"),
  bizchatCampaignId: varchar("bizchat_campaign_id", { length: 100 }),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Messages table
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id).notNull(),
  title: varchar("title", { length: 60 }),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Targeting table
export const targeting = pgTable("targeting", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id).notNull(),
  gender: varchar("gender", { length: 10 }).default("all"), // all, male, female
  ageMin: integer("age_min"),
  ageMax: integer("age_max"),
  regions: text("regions").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Transactions table
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // charge, usage, refund
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 0 }).notNull(),
  description: text("description"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  stripeSessionId: varchar("stripe_session_id", { length: 255 }).unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reports table
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id).notNull(),
  sentCount: integer("sent_count").default(0),
  successCount: integer("success_count").default(0),
  failedCount: integer("failed_count").default(0),
  clickCount: integer("click_count").default(0),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  campaigns: many(campaigns),
  transactions: many(transactions),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  user: one(users, {
    fields: [campaigns.userId],
    references: [users.id],
  }),
  messages: many(messages),
  targeting: one(targeting),
  reports: many(reports),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [messages.campaignId],
    references: [campaigns.id],
  }),
}));

export const targetingRelations = relations(targeting, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [targeting.campaignId],
    references: [campaigns.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [reports.campaignId],
    references: [campaigns.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sentCount: true,
  successCount: true,
  completedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertTargetingSchema = createInsertSchema(targeting).omit({
  id: true,
  createdAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Targeting = typeof targeting.$inferSelect;
export type InsertTargeting = z.infer<typeof insertTargetingSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;

// Campaign with related data
export type CampaignWithDetails = Campaign & {
  messages?: Message[];
  targeting?: Targeting;
  reports?: Report[];
};
