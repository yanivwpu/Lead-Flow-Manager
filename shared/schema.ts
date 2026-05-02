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
    workflowsEnabled: true, // Basic Automations (workflows & sequences)
    integrationsEnabled: true,
    maxWebhooks: 3,
    templatesEnabled: true,
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
    workflowsEnabled: true, // Advanced Automations (full builder; UI may still gate extras)
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
  // Meta WhatsApp Business API fields
  metaAccessToken: text("meta_access_token"),
  metaPhoneNumberId: text("meta_phone_number_id"),
  metaBusinessAccountId: text("meta_business_account_id"),
  metaAppSecret: text("meta_app_secret"),
  metaWebhookVerifyToken: text("meta_webhook_verify_token"),
  metaConnected: boolean("meta_connected").default(false),
  // Active provider selection
  whatsappProvider: text("whatsapp_provider").default("twilio"), // 'twilio' or 'meta'
  // Subscription fields
  // Legacy: used by older code/admin UI. Do not use as billing source-of-truth.
  subscriptionPlan: text("subscription_plan").default("free"),
  // Billing-derived plan (Stripe/Shopify only)
  billingPlan: text("billing_plan").default("free"),
  // Admin override plan (takes precedence if enabled)
  planOverride: text("plan_override"),
  planOverrideEnabled: boolean("plan_override_enabled").default(false),
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
  language: text("language").default("en"), // User preferred language: en, he, es
  awayMessageEnabled: boolean("away_message_enabled").default(false),
  awayMessage: text("away_message").default("Thanks for reaching out! We're currently away but will respond as soon as we're back."),
  autoReplyEnabled: boolean("auto_reply_enabled").default(false),
  autoReplyMessage: text("auto_reply_message").default("Thanks for your message! We'll get back to you shortly."),
  autoReplyDelay: integer("auto_reply_delay").default(0), // seconds to wait before sending
  // Onboarding
  onboardingCompleted: boolean("onboarding_completed").default(false),
  // Website widget settings
  widgetSettings: jsonb("widget_settings").default(sql`'{"enabled":true,"color":"#25D366","welcomeMessage":"Hi there! How can we help you today?","position":"right","showOnMobile":true}'::jsonb`),
  // Partner referral tracking - locked after first assignment (first-touch wins)
  partnerId: varchar("partner_id"),
  partnerAssignedAt: timestamp("partner_assigned_at"), // when partner was assigned (for commission duration)
  // Shopify integration fields
  shopifyShop: text("shopify_shop"), // e.g., mystore.myshopify.com
  shopifyAccessToken: text("shopify_access_token"), // Shopify API access token
  shopifyChargeId: text("shopify_charge_id"), // Active Shopify billing charge ID
  shopifySubscriptionStatus: text("shopify_subscription_status"), // active, cancelled, pending
  shopifyInstalledAt: timestamp("shopify_installed_at"),
  shopifyAIBrainEnabled: boolean("shopify_ai_brain_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  // Trial re-engagement email tracking
  checkinEmailSent: boolean("checkin_email_sent").default(false),
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
  // Phase E Step 3: unified inbox reference — no FK (conversations defined after this table)
  conversationId: varchar("conversation_id"),
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

// User Automation Templates (saved from preset library)
export const userAutomationTemplates = pgTable("user_automation_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  presetTemplateId: text("preset_template_id").notNull(), // Reference to preset template ID
  name: text("name").notNull(),
  language: text("language").notNull().default("en"), // en, he, es
  category: text("category").notNull(), // abandoned_cart, lead_nurture, service_reminder, promotions
  industry: text("industry").notNull().default("general"), // general, clinic, real_estate, travel, ecommerce
  messages: jsonb("messages").notNull().default(sql`'[]'::jsonb`), // Array of message objects with delay, content, type
  placeholders: jsonb("placeholders").notNull().default(sql`'[]'::jsonb`), // Placeholder names
  placeholderDefaults: jsonb("placeholder_defaults").default(sql`'{}'::jsonb`), // Default values for placeholders
  aiEnabled: boolean("ai_enabled").default(false),
  isActive: boolean("is_active").default(false),
  triggerType: text("trigger_type").default("manual"), // manual, new_chat, tag_applied, webhook
  triggerConfig: jsonb("trigger_config").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Template usage analytics
export const templateUsageAnalytics = pgTable("template_usage_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").notNull().references(() => userAutomationTemplates.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id").references(() => chats.id, { onDelete: "set null" }),
  messageIndex: integer("message_index").notNull().default(0), // Which message in sequence
  status: text("status").default("sent"), // sent, delivered, read, replied, failed
  sentAt: timestamp("sent_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  repliedAt: timestamp("replied_at"),
  aiResponseGenerated: boolean("ai_response_generated").default(false),
});

export const insertUserAutomationTemplateSchema = createInsertSchema(userAutomationTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTemplateUsageAnalyticsSchema = createInsertSchema(templateUsageAnalytics).omit({
  id: true,
  sentAt: true,
});

export type InsertUserAutomationTemplate = z.infer<typeof insertUserAutomationTemplateSchema>;
export type UserAutomationTemplate = typeof userAutomationTemplates.$inferSelect;
export type InsertTemplateUsageAnalytics = z.infer<typeof insertTemplateUsageAnalyticsSchema>;
export type TemplateUsageAnalytics = typeof templateUsageAnalytics.$inferSelect;

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
  triggerChannels: text("trigger_channels").array().default(sql`'{}'::text[]`), // Empty = all channels; non-empty = channel filter
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
  agreementAcceptedAt: timestamp("agreement_accepted_at"), // null = not accepted yet
  agreementVersion: text("agreement_version"), // version they accepted, e.g. "2026-01-03"
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
  source: text("source").default("web"), // web, qr_code
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

// Partners for referral program
export const partners = pgTable("partners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // hashed password
  refCode: varchar("ref_code", { length: 12 }).notNull().unique(), // unique, immutable referral code
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).default("50.00"), // default 50%
  commissionDurationMonths: integer("commission_duration_months").default(6), // default 6 months for partners
  status: text("status").notNull().default("active"), // active, paused
  totalReferrals: integer("total_referrals").default(0),
  totalEarnings: numeric("total_earnings", { precision: 10, scale: 2 }).default("0"),
  agreementAcceptedAt: timestamp("agreement_accepted_at"), // null = not accepted yet
  agreementVersion: text("agreement_version"), // version they accepted, e.g. "2026-01-03"
  createdAt: timestamp("created_at").defaultNow(),
});

// Commissions for both partners and salespeople
export const commissions = pgTable("commissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // the paying user
  partnerId: varchar("partner_id").references(() => partners.id, { onDelete: "set null" }), // nullable
  salespersonId: varchar("salesperson_id").references(() => salespeople.id, { onDelete: "set null" }), // nullable
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  billingPeriod: timestamp("billing_period").notNull(), // the invoice/subscription period
  invoiceId: text("invoice_id"), // Stripe invoice ID
  status: text("status").notNull().default("pending"), // pending, approved, paid
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPartnerSchema = createInsertSchema(partners).omit({
  id: true,
  refCode: true,
  createdAt: true,
  totalReferrals: true,
  totalEarnings: true,
});

export const insertCommissionSchema = createInsertSchema(commissions).omit({
  id: true,
  createdAt: true,
  paidAt: true,
});

export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partners.$inferSelect;
export type InsertCommission = z.infer<typeof insertCommissionSchema>;
export type Commission = typeof commissions.$inferSelect;

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

// Agreement acceptances - legal audit trail
export const agreementAcceptances = pgTable("agreement_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agreementType: text("agreement_type").notNull(), // 'partner_referral' or 'salesperson_commission'
  agreementVersion: text("agreement_version").notNull(), // e.g., "2026-01-03"
  partnerId: varchar("partner_id").references(() => partners.id, { onDelete: "set null" }),
  salespersonId: varchar("salesperson_id").references(() => salespeople.id, { onDelete: "set null" }),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  acceptedAt: timestamp("accepted_at").defaultNow(),
});

export const insertAgreementAcceptanceSchema = createInsertSchema(agreementAcceptances).omit({
  id: true,
  acceptedAt: true,
});

export type InsertAgreementAcceptance = z.infer<typeof insertAgreementAcceptanceSchema>;
export type AgreementAcceptance = typeof agreementAcceptances.$inferSelect;

// ============= MULTI-CHANNEL CRM SCHEMA =============

// Channel enum - all supported messaging channels
export const CHANNELS = ['whatsapp', 'instagram', 'facebook', 'sms', 'webchat', 'telegram', 'tiktok', 'gohighlevel'] as const;
export type Channel = typeof CHANNELS[number];

// Channel metadata for UI and logic
export const CHANNEL_INFO: Record<Channel, { 
  label: string; 
  icon: string; 
  color: string;
  isMessaging: boolean; // false for lead-intake only (TikTok)
  supportsMedia: boolean;
}> = {
  whatsapp: { label: 'WhatsApp', icon: 'message-circle', color: '#25D366', isMessaging: true, supportsMedia: true },
  instagram: { label: 'Instagram', icon: 'instagram', color: '#E4405F', isMessaging: true, supportsMedia: true },
  facebook: { label: 'Messenger', icon: 'facebook', color: '#1877F2', isMessaging: true, supportsMedia: true },
  sms: { label: 'SMS', icon: 'smartphone', color: '#6B7280', isMessaging: true, supportsMedia: false },
  webchat: { label: 'Web Chat', icon: 'globe', color: '#3B82F6', isMessaging: true, supportsMedia: true },
  telegram: { label: 'Telegram', icon: 'send', color: '#0088CC', isMessaging: true, supportsMedia: true },
  tiktok: { label: 'TikTok', icon: 'video', color: '#000000', isMessaging: false, supportsMedia: false }, // Lead-intake only
  gohighlevel: { label: 'GoHighLevel', icon: 'link-2', color: '#6366F1', isMessaging: true, supportsMedia: true },
};

// Unified contacts table - one record per lead
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"), // Primary phone number (E.164 format)
  avatar: text("avatar"),
  avatarFetchedAt: timestamp("avatar_fetched_at"), // When avatar was last fetched from channel API
  
  // Channel identifiers (platform-specific IDs)
  whatsappId: text("whatsapp_id"), // WhatsApp phone number
  instagramId: text("instagram_id"), // Instagram user ID
  facebookId: text("facebook_id"), // Facebook PSID
  telegramId: text("telegram_id"), // Telegram chat ID
  ghlId: text("ghl_id"), // GoHighLevel (LeadConnector) contact ID
  
  // Primary channel logic
  primaryChannel: text("primary_channel").notNull().default("whatsapp"), // Auto-detected from last incoming message
  primaryChannelOverride: text("primary_channel_override"), // Manual override if user explicitly selects
  lastIncomingChannel: text("last_incoming_channel"), // Channel of most recent incoming message
  lastIncomingAt: timestamp("last_incoming_at"),
  
  // Lead source tracking
  source: text("source").default("manual"), // manual, whatsapp, instagram, facebook, tiktok, webchat, import
  sourceDetails: jsonb("source_details").default(sql`'{}'::jsonb`), // e.g., { campaign: "summer_sale", adId: "123" }
  
  // CRM fields
  tag: text("tag").notNull().default("New"),
  pipelineStage: text("pipeline_stage").notNull().default("Lead"),
  notes: text("notes").default(""),
  
  // Follow-up
  followUp: text("follow_up"),
  followUpDate: timestamp("follow_up_date"),
  
  // Assignment (team feature)
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: "set null" }),
  
  // Custom fields (flexible JSON)
  customFields: jsonb("custom_fields").default(sql`'{}'::jsonb`),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Conversations table - one per channel per contact
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(), // whatsapp, instagram, facebook, sms, webchat, telegram
  
  // Channel-specific metadata
  channelAccountId: text("channel_account_id"), // Which connected account (for multi-number setups)
  externalThreadId: text("external_thread_id"), // Platform's thread/conversation ID
  
  // Status
  status: text("status").notNull().default("open"), // open, pending, resolved, closed
  unreadCount: integer("unread_count").default(0),
  
  // 24-hour window tracking (WhatsApp Business API)
  windowActive: boolean("window_active").default(false),
  windowExpiresAt: timestamp("window_expires_at"),
  
  // Last activity
  lastMessageAt: timestamp("last_message_at"),
  lastMessagePreview: text("last_message_preview"),
  lastMessageDirection: text("last_message_direction"), // inbound, outbound
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Messages table - individual messages within conversations
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Message content
  direction: text("direction").notNull(), // inbound, outbound
  content: text("content"), // Text content
  contentType: text("content_type").notNull().default("text"), // text, image, video, audio, document, location, template
  
  // Media attachments
  /** Permanent URL (e.g. Cloudflare R2 public URL or /objects/uploads) — never rely on provider CDNs long-term */
  mediaUrl: text("media_url"),
  mediaType: text("media_type"), // image | video | audio | document (message category)
  mediaThumbnail: text("media_thumbnail"),
  mediaFilename: text("media_filename"), // Actual filename for documents/attachments
  platformMediaId: text("platform_media_id"), // Platform-assigned media ID (e.g. WhatsApp Meta mediaId) for on-demand proxy fetching
  /** Original provider URL at ingest time (debug / backfill); do not render in UI */
  providerMediaUrl: text("provider_media_url"),
  /** Provider-stable id when no URL (e.g. Telegram file_id, Meta media id duplicate) */
  providerMediaId: text("provider_media_id"),
  mediaMimeType: text("media_mime_type"),
  mediaSize: integer("media_size"),
  mediaStorageKey: text("media_storage_key"),
  mediaStoredAt: timestamp("media_stored_at"),
  
  // Template message (for outbound templates)
  templateId: varchar("template_id"),
  templateVariables: jsonb("template_variables"),
  
  // Delivery tracking
  status: text("status").notNull().default("pending"), // pending, sent, delivered, read, failed
  externalMessageId: text("external_message_id"), // Platform's message ID
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  
  // Fallback delivery tracking
  sentViaFallback: boolean("sent_via_fallback").default(false),
  fallbackChannel: text("fallback_channel"), // Channel used for fallback delivery
  
  // Timestamps
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Activity events for timeline (messages, AI events, status changes)
export const activityEvents = pgTable("activity_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
  
  // Event type
  eventType: text("event_type").notNull(), // message, tag_change, stage_change, assignment, note, ai_response, lead_created, channel_switch
  
  // Event data (flexible JSON)
  eventData: jsonb("event_data").notNull().default(sql`'{}'::jsonb`),
  
  // Actor (who triggered the event)
  actorType: text("actor_type").notNull().default("system"), // user, contact, system, ai
  actorId: varchar("actor_id"), // User ID if actorType is 'user'
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Channel feature flags - enable/disable channels per user
export const channelSettings = pgTable("channel_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(), // whatsapp, instagram, facebook, sms, webchat, telegram, tiktok
  
  // Connection status
  isEnabled: boolean("is_enabled").default(false),
  isConnected: boolean("is_connected").default(false),
  
  // Channel-specific credentials/config (encrypted)
  config: jsonb("config").default(sql`'{}'::jsonb`),
  
  // Fallback settings
  fallbackEnabled: boolean("fallback_enabled").default(false), // Allow this channel as fallback
  fallbackPriority: integer("fallback_priority").default(0), // Lower = higher priority
  
  // Rate limiting
  dailyLimit: integer("daily_limit"),
  messagesSentToday: integer("messages_sent_today").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertActivityEventSchema = createInsertSchema(activityEvents).omit({
  id: true,
  createdAt: true,
});

export const insertChannelSettingSchema = createInsertSchema(channelSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertActivityEvent = z.infer<typeof insertActivityEventSchema>;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type InsertChannelSetting = z.infer<typeof insertChannelSettingSchema>;
export type ChannelSetting = typeof channelSettings.$inferSelect;

// Support tickets table - for tracking user support requests
export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  userEmail: text("user_email").notNull(),
  userName: text("user_name"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open, in_progress, resolved, closed
  priority: text("priority").default("normal"), // low, normal, high, urgent
  category: text("category"), // billing, technical, feature_request, bug, other
  assignedTo: text("assigned_to"), // admin/support person handling it
  notes: text("notes"), // internal notes
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

// Unified inbox item type (for API responses)
export type InboxItem = {
  contact: Contact;
  conversation: Conversation;
  channel: Channel;
  lastMessage: string;
  lastMessageAt: Date | null;
  unreadCount: number;
};

// ==========================================
// AI BRAIN TABLES (PRO FEATURE)
// ==========================================

// AI Business Knowledge - per-account business context for AI
export const aiBusinessKnowledge = pgTable("ai_business_knowledge", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessName: text("business_name"),
  industry: text("industry"), // real_estate, travel, contractor, ecommerce, service, etc.
  servicesProducts: text("services_products"), // JSON string of services/products
  businessHours: text("business_hours"), // Business hours description
  locations: text("locations"), // Comma-separated locations
  bookingLink: text("booking_link"),
  faqs: jsonb("faqs").default(sql`'[]'::jsonb`), // Array of {question, answer}
  salesGoals: text("sales_goals"), // book_call, get_phone, collect_deposit, etc.
  customInstructions: text("custom_instructions"), // Additional AI instructions
  qualifyingQuestions: jsonb("qualifying_questions").default(sql`'[]'::jsonb`), // Industry-specific questions
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// AI Settings - per-user AI behavior configuration
export const aiSettings = pgTable("ai_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // AI Mode: off, suggest_only, full_auto
  aiMode: text("ai_mode").notNull().default("suggest_only"),
  // Business hours only mode
  businessHoursOnly: boolean("business_hours_only").default(false),
  // Confidence level: conservative, balanced, aggressive
  confidenceLevel: text("confidence_level").default("balanced"),
  // Lead qualification enabled
  leadQualificationEnabled: boolean("lead_qualification_enabled").default(true),
  // Auto-tagging enabled
  autoTaggingEnabled: boolean("auto_tagging_enabled").default(true),
  // Human handoff keywords
  handoffKeywords: text("handoff_keywords").array().default(sql`'{"call me","human","agent","speak to someone"}'::text[]`),
  // AI voice/persona
  aiPersona: text("ai_persona").default("professional"), // professional, friendly, casual
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// AI Usage Tracking - per-account usage metering
export const aiUsage = pgTable("ai_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  messagesGenerated: integer("messages_generated").default(0),
  repliesSuggested: integer("replies_suggested").default(0),
  leadsQualified: integer("leads_qualified").default(0),
  automationsGenerated: integer("automations_generated").default(0),
  tokensUsed: integer("tokens_used").default(0), // Internal tracking only
  usageLimitReached: boolean("usage_limit_reached").default(false),
  alertSent70: boolean("alert_sent_70").default(false),
  alertSent90: boolean("alert_sent_90").default(false),
  pausedAt: timestamp("paused_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI Lead Scores - lead qualification results
export const aiLeadScores = pgTable("ai_lead_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: varchar("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  score: integer("score").default(0), // 0-100
  status: text("status").default("new"), // new, warm, hot, unqualified
  intent: text("intent"), // Detected intent (price, availability, quote, book, etc.)
  extractedData: jsonb("extracted_data").default(sql`'{}'::jsonb`), // {name, email, budget, timeline, location, etc.}
  qualifyingAnswers: jsonb("qualifying_answers").default(sql`'[]'::jsonb`), // Array of Q&A pairs
  conversationSummary: text("conversation_summary"),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI Generated Automations - plain English to workflow
export const aiAutomations = pgTable("ai_automations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plainEnglishInput: text("plain_english_input").notNull(),
  generatedWorkflow: jsonb("generated_workflow").notNull(), // The workflow structure
  workflowId: varchar("workflow_id").references(() => workflows.id, { onDelete: "set null" }), // If converted to actual workflow
  status: text("status").default("draft"), // draft, active, archived
  createdAt: timestamp("created_at").defaultNow(),
});

// AI Message Log - for abuse prevention and auditing
export const aiMessageLog = pgTable("ai_message_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id").references(() => chats.id, { onDelete: "set null" }),
  messageType: text("message_type").notNull(), // reply, suggestion, qualification, automation
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  model: text("model").default("gpt-5"),
  responseTime: integer("response_time"), // milliseconds
  wasAccepted: boolean("was_accepted"), // For suggestions - did user accept?
  createdAt: timestamp("created_at").defaultNow(),
});

// AI Subscription Add-on - tracks AI Assist subscription
export const aiSubscriptions = pgTable("ai_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull().default("active"), // active, paused, canceled
  monthlyLimit: integer("monthly_limit").default(5000), // Fair use limit (internal)
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas for AI tables
export const insertAiBusinessKnowledgeSchema = createInsertSchema(aiBusinessKnowledge).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAiSettingsSchema = createInsertSchema(aiSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAiUsageSchema = createInsertSchema(aiUsage).omit({
  id: true,
  createdAt: true,
});

export const insertAiLeadScoreSchema = createInsertSchema(aiLeadScores).omit({
  id: true,
  createdAt: true,
  lastUpdatedAt: true,
});

export const insertAiAutomationSchema = createInsertSchema(aiAutomations).omit({
  id: true,
  createdAt: true,
});

export const insertAiMessageLogSchema = createInsertSchema(aiMessageLog).omit({
  id: true,
  createdAt: true,
});

export const insertAiSubscriptionSchema = createInsertSchema(aiSubscriptions).omit({
  id: true,
  createdAt: true,
});

// Types for AI tables
export type InsertAiBusinessKnowledge = z.infer<typeof insertAiBusinessKnowledgeSchema>;
export type AiBusinessKnowledge = typeof aiBusinessKnowledge.$inferSelect;
export type InsertAiSettings = z.infer<typeof insertAiSettingsSchema>;
export type AiSettings = typeof aiSettings.$inferSelect;
export type InsertAiUsage = z.infer<typeof insertAiUsageSchema>;
export type AiUsage = typeof aiUsage.$inferSelect;
export type InsertAiLeadScore = z.infer<typeof insertAiLeadScoreSchema>;
export type AiLeadScore = typeof aiLeadScores.$inferSelect;
export type InsertAiAutomation = z.infer<typeof insertAiAutomationSchema>;
export type AiAutomation = typeof aiAutomations.$inferSelect;
export type InsertAiMessageLog = z.infer<typeof insertAiMessageLogSchema>;
export type AiMessageLog = typeof aiMessageLog.$inferSelect;
export type InsertAiSubscription = z.infer<typeof insertAiSubscriptionSchema>;
export type AiSubscription = typeof aiSubscriptions.$inferSelect;

// AI Usage Limits (internal - not shown to users)
export const AI_USAGE_LIMITS = {
  monthlyMessageLimit: 5000, // Fair use policy
  warningThreshold70: 0.7,
  warningThreshold90: 0.9,
  maxMessagesPerHour: 100, // Abuse prevention
  maxMessagesPerContact: 10, // Per contact per day
} as const;

// Lead Intent Keywords
export const LEAD_INTENT_KEYWORDS = {
  price: ["price", "cost", "how much", "rate", "fee", "pricing", "quote"],
  availability: ["available", "availability", "when", "schedule", "open", "free"],
  quote: ["quote", "estimate", "proposal", "bid"],
  book: ["book", "appointment", "schedule", "reserve", "meeting"],
  interested: ["interested", "want", "need", "looking for", "inquiry"],
} as const;

// Lead Status Thresholds
export const LEAD_SCORE_THRESHOLDS = {
  unqualified: 0,
  new: 25,
  warm: 50,
  hot: 75,
} as const;

// ==========================================
// PREMIUM TEMPLATE TABLES
// ==========================================

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isPremium: boolean("is_premium").default(false),
  version: text("version").default("1.0.0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const templateEntitlements = pgTable("template_entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  purchasedAt: timestamp("purchased_at"),
  onboardingSubmittedAt: timestamp("onboarding_submitted_at"),
  status: text("status").notNull().default("locked"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const realtorOnboardingSubmissions = pgTable("realtor_onboarding_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull().default("realtor-growth-engine"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  payload: jsonb("payload").notNull(),
  normalized: jsonb("normalized"),
  status: text("status").notNull().default("submitted"),
});

export const templateInstalls = pgTable("template_installs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  installedAt: timestamp("installed_at"),
  installStatus: text("install_status").notNull().default("pending"),
  installLog: text("install_log"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const templateAssets = pgTable("template_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: text("template_id").notNull(),
  assetType: text("asset_type").notNull(),
  version: text("version").default("1.0.0"),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userTemplateData = pgTable("user_template_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  assetType: text("asset_type").notNull(),
  assetKey: text("asset_key").notNull(),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTemplateSchema = createInsertSchema(templates);
export const insertTemplateEntitlementSchema = createInsertSchema(templateEntitlements).omit({ id: true, createdAt: true });
export const insertRealtorOnboardingSubmissionSchema = createInsertSchema(realtorOnboardingSubmissions).omit({ id: true, submittedAt: true });
export const insertTemplateInstallSchema = createInsertSchema(templateInstalls).omit({ id: true, createdAt: true });
export const insertTemplateAssetSchema = createInsertSchema(templateAssets).omit({ id: true, createdAt: true });
export const insertUserTemplateDataSchema = createInsertSchema(userTemplateData).omit({ id: true, createdAt: true });

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type TemplateEntitlement = typeof templateEntitlements.$inferSelect;
export type InsertTemplateEntitlement = z.infer<typeof insertTemplateEntitlementSchema>;
export type RealtorOnboardingSubmission = typeof realtorOnboardingSubmissions.$inferSelect;
export type InsertRealtorOnboardingSubmission = z.infer<typeof insertRealtorOnboardingSubmissionSchema>;
export type TemplateInstall = typeof templateInstalls.$inferSelect;
export type InsertTemplateInstall = z.infer<typeof insertTemplateInstallSchema>;
export type TemplateAsset = typeof templateAssets.$inferSelect;
export type InsertTemplateAsset = z.infer<typeof insertTemplateAssetSchema>;
export type UserTemplateData = typeof userTemplateData.$inferSelect;
export type InsertUserTemplateData = z.infer<typeof insertUserTemplateDataSchema>;

// ─── Contact Notes (Team Notes — collaborative, workspace-scoped) ─────────────
export const contactNotes = pgTable("contact_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").notNull(),
  content: text("content").notNull(),
  createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdByName: text("created_by_name").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertContactNoteSchema = createInsertSchema(contactNotes).omit({ id: true, createdAt: true });
export type ContactNote = typeof contactNotes.$inferSelect;
export type InsertContactNote = z.infer<typeof insertContactNoteSchema>;

// ─── GHL Sync Failures (Retry queue + admin visibility for outbound sync) ────
export const ghlSyncFailures = pgTable("ghl_sync_failures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),   // 'contact' | 'opportunity' | 'message'
  entityId: text("entity_id"),                 // WhachatCRM internal ID (contactId, messageId)
  ghlContactId: text("ghl_contact_id"),        // GHL contact ID
  operation: text("operation").notNull(),       // 'sync_contact_fields' | 'sync_outbound_message' | 'sync_pipeline_stage'
  payload: jsonb("payload").default(sql`'{}'::jsonb`),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  nextRetryAt: timestamp("next_retry_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGhlSyncFailureSchema = createInsertSchema(ghlSyncFailures).omit({ id: true, createdAt: true, updatedAt: true });
export type GhlSyncFailure = typeof ghlSyncFailures.$inferSelect;
export type InsertGhlSyncFailure = z.infer<typeof insertGhlSyncFailureSchema>;

// ─── GHL Event Dedup (Idempotency tracking for webhook events) ──────────────
export const ghlEventDedup = pgTable("ghl_event_dedup", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").notNull().references(() => integrations.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(), // GHL's event ID
  eventType: text("event_type").notNull(), // ContactCreate, ContactUpdate, etc.
  processedAt: timestamp("processed_at").defaultNow(),
});

export const insertGhlEventDedupSchema = createInsertSchema(ghlEventDedup).omit({ id: true, processedAt: true });
export type GhlEventDedup = typeof ghlEventDedup.$inferSelect;
export type InsertGhlEventDedup = z.infer<typeof insertGhlEventDedupSchema>;

// ─── Appointments (multiple per contact) ──────────────────────────────────────
export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").notNull(),
  contactName: text("contact_name").notNull().default(""),
  appointmentType: varchar("appointment_type").notNull().default("Appointment"),
  appointmentDate: timestamp("appointment_date").notNull(),
  title: text("title").notNull().default(""),
  status: varchar("status").notNull().default("scheduled"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true });
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

// ─── Flow Jobs (Durable Wait/Delay scheduling) ────────────────────────────────
export const flowJobs = pgTable("flow_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flowId: varchar("flow_id").notNull(),
  contactId: varchar("contact_id").notNull(),
  conversationId: varchar("conversation_id").notNull(),
  nodeId: varchar("node_id").notNull(), // the node to resume execution from after the delay
  runAt: timestamp("run_at").notNull(),
  status: varchar("status").notNull().default("pending"), // pending | running | completed | failed
  payload: jsonb("payload").notNull().default({}), // serialized TriggerContext
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFlowJobSchema = createInsertSchema(flowJobs).omit({ id: true, createdAt: true });
export type FlowJob = typeof flowJobs.$inferSelect;
export type InsertFlowJob = z.infer<typeof insertFlowJobSchema>;
