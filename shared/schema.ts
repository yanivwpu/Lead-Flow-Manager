import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  pushEnabled: boolean("push_enabled").default(false),
  emailEnabled: boolean("email_enabled").default(false),
  pushSubscription: jsonb("push_subscription"),
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthToken: text("twilio_auth_token"),
  twilioWhatsappNumber: text("twilio_whatsapp_number"),
  twilioConnected: boolean("twilio_connected").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chats = pgTable("chats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  avatar: text("avatar").notNull(),
  whatsappPhone: text("whatsapp_phone"),
  lastMessage: text("last_message").notNull(),
  time: text("time").notNull(),
  unread: integer("unread").default(0),
  tag: text("tag").notNull().default("New"),
  followUp: text("follow_up"),
  followUpDate: timestamp("follow_up_date"),
  notes: text("notes").default(""),
  pipelineStage: text("pipeline_stage").notNull().default("Lead"),
  messages: jsonb("messages").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  pushSubscription: true,
});

export const insertChatSchema = createInsertSchema(chats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertChat = z.infer<typeof insertChatSchema>;
export type Chat = typeof chats.$inferSelect;
