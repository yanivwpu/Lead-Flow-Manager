import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Subscription plan types
export type SubscriptionPlan = 'free' | 'starter' | 'pro';

// Throttle limits for high-volume conversations
export const CONVERSATION_THROTTLE = {
  maxMessagesPerWindow: 100, // Max messages per 24-hour conversation window
  warningThreshold: 80, // Warn at 80 messages
} as const;

// Plan limits configuration
export const PLAN_LIMITS = {
  free: {
    name: 'Free',
    price: 0,
    conversationsPerMonth: 50,
    isLifetimeLimit: false,
    maxUsers: 1,
    maxWhatsappNumbers: 1,
    canSendMessages: true,
    followUpsEnabled: false,
    emailNotifications: false,
    pushNotifications: false,
    teamInbox: true, // read-only shared inbox
    assignmentEnabled: false,
    workflowsEnabled: false,
  },
  starter: {
    name: 'Starter',
    price: 19,
    conversationsPerMonth: 500,
    isLifetimeLimit: false,
    maxUsers: 3,
    maxWhatsappNumbers: 1,
    canSendMessages: true,
    followUpsEnabled: true,
    emailNotifications: true,
    pushNotifications: true,
    teamInbox: true,
    assignmentEnabled: false,
    workflowsEnabled: false,
  },
  pro: {
    name: 'Pro',
    price: 49,
    conversationsPerMonth: 2000,
    isLifetimeLimit: false,
    maxUsers: 10,
    maxWhatsappNumbers: 3,
    canSendMessages: true,
    followUpsEnabled: true,
    emailNotifications: true,
    pushNotifications: true,
    teamInbox: true,
    assignmentEnabled: true, // Pro feature: conversation assignment
    workflowsEnabled: true, // Pro feature: advanced workflows
  },
} as const;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  avatarUrl: text("avatar_url"), // User profile picture URL
  pushEnabled: boolean("push_enabled").default(false),
  emailEnabled: boolean("email_enabled").default(false),
  pushSubscription: jsonb("push_subscription"),
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthToken: text("twilio_auth_token"),
  twilioWhatsappNumber: text("twilio_whatsapp_number"),
  twilioConnected: boolean("twilio_connected").default(false),
  // Subscription fields
  subscriptionPlan: text("subscription_plan").default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").default("active"), // active, canceled, past_due
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  trialEndsAt: timestamp("trial_ends_at"), // 14-day Pro trial end date
  lifetimeConversations: integer("lifetime_conversations").default(0), // for free tier tracking
  monthlyConversations: integer("monthly_conversations").default(0), // current month conversation count
  monthlyTwilioUsage: numeric("monthly_twilio_usage", { precision: 10, scale: 2 }).default("0"), // current month Twilio spend
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
  status: text("status").notNull().default("open"), // open, pending, resolved, closed
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: "set null" }),
  messages: jsonb("messages").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Team members (users who belong to a team/organization)
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  memberId: varchar("member_id").references(() => users.id, { onDelete: "set null" }),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").notNull().default("member"), // owner, admin, member
  status: text("status").notNull().default("pending"), // pending, active, inactive
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
});

// Registered WhatsApp phone numbers per client
export const registeredPhones = pgTable("registered_phones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phoneNumber: text("phone_number").notNull().unique(),
  businessName: text("business_name"),
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Conversation windows for 24-hour tracking (per contact per tenant)
export const conversationWindows = pgTable("conversation_windows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  whatsappPhone: text("whatsapp_phone").notNull(), // the customer's phone
  windowStart: timestamp("window_start").notNull(), // when the 24-hour window started
  windowEnd: timestamp("window_end").notNull(), // when the window expires (windowStart + 24 hours)
  messageCount: integer("message_count").default(1), // how many messages in this window
  createdAt: timestamp("created_at").defaultNow(),
});

// Message usage tracking for billing
export const messageUsage = pgTable("message_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id").references(() => chats.id, { onDelete: "set null" }),
  direction: text("direction").notNull(), // 'inbound' or 'outbound'
  messageType: text("message_type").notNull().default("text"), // 'text', 'media', 'template'
  twilioSid: text("twilio_sid"),
  twilioCost: numeric("twilio_cost", { precision: 10, scale: 6 }).default("0"),
  markupPercent: numeric("markup_percent", { precision: 5, scale: 2 }).default("5.00"),
  totalCost: numeric("total_cost", { precision: 10, scale: 6 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
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

export const insertRegisteredPhoneSchema = createInsertSchema(registeredPhones).omit({
  id: true,
  createdAt: true,
  isVerified: true,
});

export const insertMessageUsageSchema = createInsertSchema(messageUsage).omit({
  id: true,
  createdAt: true,
});

export const insertConversationWindowSchema = createInsertSchema(conversationWindows).omit({
  id: true,
  createdAt: true,
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  invitedAt: true,
  joinedAt: true,
});

// Workflow automation rules (Pro feature)
export const workflows = pgTable("workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  triggerType: text("trigger_type").notNull(), // 'new_chat', 'keyword', 'no_reply', 'tag_change'
  triggerConditions: jsonb("trigger_conditions").notNull().default(sql`'{}'::jsonb`), // JSON with conditions
  actions: jsonb("actions").notNull().default(sql`'[]'::jsonb`), // Array of actions to perform
  executionCount: integer("execution_count").default(0),
  lastExecutedAt: timestamp("last_executed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workflow execution log
export const workflowExecutions = pgTable("workflow_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: varchar("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id").references(() => chats.id, { onDelete: "set null" }),
  triggerData: jsonb("trigger_data"), // Data that triggered the workflow
  actionsExecuted: jsonb("actions_executed"), // What actions were performed
  status: text("status").notNull().default("success"), // success, failed, partial
  errorMessage: text("error_message"),
  executedAt: timestamp("executed_at").defaultNow(),
});

// Recurring reminders
export const recurringReminders = pgTable("recurring_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id").references(() => chats.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  frequency: text("frequency").notNull(), // 'daily', 'weekly', 'biweekly', 'monthly'
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly
  dayOfMonth: integer("day_of_month"), // 1-31 for monthly
  timeOfDay: text("time_of_day").notNull().default("09:00"), // HH:MM format
  nextDue: timestamp("next_due"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkflowSchema = createInsertSchema(workflows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  executionCount: true,
  lastExecutedAt: true,
});

export const insertWorkflowExecutionSchema = createInsertSchema(workflowExecutions).omit({
  id: true,
  executedAt: true,
});

export const insertRecurringReminderSchema = createInsertSchema(recurringReminders).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertChat = z.infer<typeof insertChatSchema>;
export type Chat = typeof chats.$inferSelect;
export type InsertRegisteredPhone = z.infer<typeof insertRegisteredPhoneSchema>;
export type RegisteredPhone = typeof registeredPhones.$inferSelect;
export type InsertMessageUsage = z.infer<typeof insertMessageUsageSchema>;
export type MessageUsage = typeof messageUsage.$inferSelect;
export type InsertConversationWindow = z.infer<typeof insertConversationWindowSchema>;
export type ConversationWindow = typeof conversationWindows.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;
export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflowExecution = z.infer<typeof insertWorkflowExecutionSchema>;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type InsertRecurringReminder = z.infer<typeof insertRecurringReminderSchema>;
export type RecurringReminder = typeof recurringReminders.$inferSelect;
