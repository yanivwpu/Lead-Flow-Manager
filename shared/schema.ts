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
    integrationsEnabled: false,
    maxWebhooks: 0,
    templatesEnabled: false,
    chatbotEnabled: false,
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
    integrationsEnabled: true,
    maxWebhooks: 3,
    templatesEnabled: false,
    chatbotEnabled: true, // Visual chatbot builder
  },
  pro: {
    name: 'Pro',
    price: 49,
    conversationsPerMonth: 2000,
    isLifetimeLimit: false,
    maxUsers: -1, // Unlimited team members
    maxWhatsappNumbers: 5,
    canSendMessages: true,
    followUpsEnabled: true,
    emailNotifications: true,
    pushNotifications: true,
    teamInbox: true,
    assignmentEnabled: true, // Pro feature: conversation assignment
    workflowsEnabled: true, // Pro feature: advanced workflows
    integrationsEnabled: true,
    maxWebhooks: 10,
    templatesEnabled: true, // Pro feature: template messaging & retargeting
    chatbotEnabled: true, // Visual chatbot builder
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
  // Business hours & auto-reply settings
  businessHoursEnabled: boolean("business_hours_enabled").default(false),
  businessHoursStart: text("business_hours_start").default("09:00"), // HH:mm format
  businessHoursEnd: text("business_hours_end").default("17:00"),
  businessDays: jsonb("business_days").default(sql`'[1,2,3,4,5]'::jsonb`), // 0=Sun, 1=Mon, etc.
  timezone: text("timezone").default("America/New_York"),
  awayMessageEnabled: boolean("away_message_enabled").default(false),
  awayMessage: text("away_message").default("Thanks for reaching out! We're currently away but will respond as soon as we're back."),
  autoReplyEnabled: boolean("auto_reply_enabled").default(false),
  autoReplyMessage: text("auto_reply_message").default("Thanks for your message! We'll get back to you shortly."),
  autoReplyDelay: integer("auto_reply_delay").default(0), // seconds to wait before sending
  // Onboarding
  onboardingCompleted: boolean("onboarding_completed").default(false),
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

// Webhook configurations for integrations
export const webhooks = pgTable("webhooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  secret: text("secret").notNull(), // HMAC signing secret
  events: text("events").array().notNull(), // ['new_chat', 'message_received', 'tag_changed', etc.]
  isActive: boolean("is_active").default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  failureCount: integer("failure_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Webhook delivery logs
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  webhookId: varchar("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: jsonb("payload").notNull(),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  success: boolean("success").default(false),
  deliveredAt: timestamp("delivered_at").defaultNow(),
});

// WhatsApp Message Templates (synced from Twilio)
export const messageTemplates = pgTable("message_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  twilioSid: text("twilio_sid").notNull(), // Twilio Content SID
  name: text("name").notNull(),
  language: text("language").default("en"),
  category: text("category").notNull(), // 'marketing', 'utility', 'authentication'
  status: text("status").notNull(), // 'approved', 'pending', 'rejected'
  templateType: text("template_type").default("text"), // 'text', 'media', 'carousel'
  bodyText: text("body_text"), // Template body with {{variables}}
  headerType: text("header_type"), // 'text', 'image', 'video', 'document'
  headerContent: text("header_content"), // Header text or media URL
  footerText: text("footer_text"),
  buttons: jsonb("buttons").default(sql`'[]'::jsonb`), // Array of button configs
  carouselCards: jsonb("carousel_cards").default(sql`'[]'::jsonb`), // For carousel templates
  variables: jsonb("variables").default(sql`'[]'::jsonb`), // Variable names for substitution
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Template send history for retargeting analytics
export const templateSends = pgTable("template_sends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").notNull().references(() => messageTemplates.id, { onDelete: "cascade" }),
  twilioMessageSid: text("twilio_message_sid"),
  status: text("status").default("sent"), // 'sent', 'delivered', 'read', 'failed'
  variableValues: jsonb("variable_values").default(sql`'{}'::jsonb`), // Substituted values
  sentAt: timestamp("sent_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  failureReason: text("failure_reason"),
});

// Native integrations (Shopify, HubSpot, etc.)
export const integrations = pgTable("integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'shopify', 'hubspot', 'salesforce', 'google_sheets', 'zoho', 'showcase_idx'
  name: text("name").notNull(), // User-given name
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`), // Integration-specific config
  accessToken: text("access_token"), // OAuth access token (encrypted)
  refreshToken: text("refresh_token"), // OAuth refresh token (encrypted)
  tokenExpiresAt: timestamp("token_expires_at"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWebhookSchema = createInsertSchema(webhooks).omit({
  id: true,
  createdAt: true,
  lastTriggeredAt: true,
  failureCount: true,
});

export const insertWebhookDeliverySchema = createInsertSchema(webhookDeliveries).omit({
  id: true,
  deliveredAt: true,
});

export const insertIntegrationSchema = createInsertSchema(integrations).omit({
  id: true,
  createdAt: true,
  lastSyncAt: true,
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
export type InsertWebhook = z.infer<typeof insertWebhookSchema>;
export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhookDelivery = z.infer<typeof insertWebhookDeliverySchema>;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type Integration = typeof integrations.$inferSelect;

export const insertMessageTemplateSchema = createInsertSchema(messageTemplates).omit({
  id: true,
  createdAt: true,
  lastSyncedAt: true,
});

export const insertTemplateSendSchema = createInsertSchema(templateSends).omit({
  id: true,
  sentAt: true,
});

// Drip Sequences (Campaigns)
export const dripCampaigns = pgTable("drip_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(false),
  triggerType: text("trigger_type").notNull().default("manual"), // manual, new_chat, tag_applied
  triggerConfig: jsonb("trigger_config").default(sql`'{}'::jsonb`), // e.g., { tag: "Hot" }
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Drip Steps (Messages within a campaign)
export const dripSteps = pgTable("drip_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => dripCampaigns.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull().default(1),
  delayMinutes: integer("delay_minutes").notNull().default(0), // delay from previous step or enrollment
  messageContent: text("message_content").notNull(),
  messageType: text("message_type").notNull().default("text"), // text, template
  templateId: varchar("template_id"), // if using template
  createdAt: timestamp("created_at").defaultNow(),
});

// Drip Enrollments (Contacts enrolled in campaigns)
export const dripEnrollments = pgTable("drip_enrollments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => dripCampaigns.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  currentStepOrder: integer("current_step_order").default(0), // 0 = not started yet
  status: text("status").notNull().default("active"), // active, paused, completed, cancelled
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  nextSendAt: timestamp("next_send_at"), // when to send next step
  completedAt: timestamp("completed_at"),
});

// Drip Sends (History of sent messages)
export const dripSends = pgTable("drip_sends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enrollmentId: varchar("enrollment_id").notNull().references(() => dripEnrollments.id, { onDelete: "cascade" }),
  stepId: varchar("step_id").notNull().references(() => dripSteps.id, { onDelete: "cascade" }),
  twilioSid: text("twilio_sid"),
  status: text("status").notNull().default("pending"), // pending, sent, failed, delivered
  sentAt: timestamp("sent_at").defaultNow(),
  errorMessage: text("error_message"),
});

export const insertDripCampaignSchema = createInsertSchema(dripCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDripStepSchema = createInsertSchema(dripSteps).omit({
  id: true,
  createdAt: true,
});

export const insertDripEnrollmentSchema = createInsertSchema(dripEnrollments).omit({
  id: true,
  enrolledAt: true,
  completedAt: true,
});

export const insertDripSendSchema = createInsertSchema(dripSends).omit({
  id: true,
  sentAt: true,
});

// Chatbot Flows (Visual chatbot builder)
export const chatbotFlows = pgTable("chatbot_flows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(false),
  triggerKeywords: text("trigger_keywords").array().default(sql`'{}'::text[]`), // Keywords that trigger this flow
  triggerOnNewChat: boolean("trigger_on_new_chat").default(false), // Trigger when new chat starts
  nodes: jsonb("nodes").notNull().default(sql`'[]'::jsonb`), // Array of flow nodes
  edges: jsonb("edges").notNull().default(sql`'[]'::jsonb`), // Connections between nodes
  executionCount: integer("execution_count").default(0),
  lastExecutedAt: timestamp("last_executed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chatbot execution sessions
export const chatbotSessions = pgTable("chatbot_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flowId: varchar("flow_id").notNull().references(() => chatbotFlows.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  currentNodeId: text("current_node_id"), // Current position in the flow
  sessionData: jsonb("session_data").default(sql`'{}'::jsonb`), // Variables collected during session
  status: text("status").notNull().default("active"), // active, completed, waiting_input, failed
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertChatbotFlowSchema = createInsertSchema(chatbotFlows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  executionCount: true,
  lastExecutedAt: true,
});

export const insertChatbotSessionSchema = createInsertSchema(chatbotSessions).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export type InsertMessageTemplate = z.infer<typeof insertMessageTemplateSchema>;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type InsertTemplateSend = z.infer<typeof insertTemplateSendSchema>;
export type TemplateSend = typeof templateSends.$inferSelect;
export type InsertDripCampaign = z.infer<typeof insertDripCampaignSchema>;
export type DripCampaign = typeof dripCampaigns.$inferSelect;
export type InsertDripStep = z.infer<typeof insertDripStepSchema>;
export type DripStep = typeof dripSteps.$inferSelect;
export type InsertDripEnrollment = z.infer<typeof insertDripEnrollmentSchema>;
export type DripEnrollment = typeof dripEnrollments.$inferSelect;
export type InsertDripSend = z.infer<typeof insertDripSendSchema>;
export type DripSend = typeof dripSends.$inferSelect;
export type InsertChatbotFlow = z.infer<typeof insertChatbotFlowSchema>;
export type ChatbotFlow = typeof chatbotFlows.$inferSelect;
export type InsertChatbotSession = z.infer<typeof insertChatbotSessionSchema>;
export type ChatbotSession = typeof chatbotSessions.$inferSelect;

// Salespeople for demo bookings
export const salespeople = pgTable("salespeople", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loginCode: varchar("login_code", { length: 6 }).notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  isActive: boolean("is_active").default(true),
  totalBookings: integer("total_bookings").default(0),
  totalConversions: integer("total_conversions").default(0),
  totalEarnings: numeric("total_earnings", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Demo bookings from visitors
export const demoBookings = pgTable("demo_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  salespersonId: varchar("salesperson_id").notNull().references(() => salespeople.id, { onDelete: "cascade" }),
  visitorName: text("visitor_name").notNull(),
  visitorEmail: text("visitor_email").notNull(),
  visitorPhone: text("visitor_phone").notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  consentGiven: boolean("consent_given").default(true),
  status: text("status").notNull().default("pending"), // pending, completed, cancelled, converted
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Conversion tracking - when a demo leads to a paid subscription
export const salesConversions = pgTable("sales_conversions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => demoBookings.id, { onDelete: "cascade" }),
  salespersonId: varchar("salesperson_id").notNull().references(() => salespeople.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }), // The user who subscribed
  amount: numeric("amount", { precision: 10, scale: 2 }).default("50"), // Commission amount
  totalRevenue: numeric("total_revenue", { precision: 10, scale: 2 }).default("0"), // Cumulative subscription revenue from this user
  paid: boolean("paid").default(false),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin settings (password protected admin area)
export const adminSettings = pgTable("admin_settings", {
  id: varchar("id").primaryKey().default("admin"),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSalespersonSchema = createInsertSchema(salespeople).omit({
  id: true,
  loginCode: true,
  createdAt: true,
  totalBookings: true,
  totalConversions: true,
  totalEarnings: true,
});

export const insertDemoBookingSchema = createInsertSchema(demoBookings).omit({
  id: true,
  createdAt: true,
});

export const insertSalesConversionSchema = createInsertSchema(salesConversions).omit({
  id: true,
  createdAt: true,
  paidAt: true,
});

export type InsertSalesperson = z.infer<typeof insertSalespersonSchema>;
export type Salesperson = typeof salespeople.$inferSelect;
export type InsertDemoBooking = z.infer<typeof insertDemoBookingSchema>;
export type DemoBooking = typeof demoBookings.$inferSelect;
export type InsertSalesConversion = z.infer<typeof insertSalesConversionSchema>;
export type SalesConversion = typeof salesConversions.$inferSelect;
