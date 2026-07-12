import { 
  type User, type InsertUser, type Chat, type InsertChat,
  type RegisteredPhone, type InsertRegisteredPhone,
  type MessageUsage, type InsertMessageUsage,
  type TeamMember, type InsertTeamMember,
  type Workflow, type InsertWorkflow,
  type WorkflowExecution, type InsertWorkflowExecution,
  type RecurringReminder, type InsertRecurringReminder,
  type Webhook, type InsertWebhook,
  type WebhookDelivery, type InsertWebhookDelivery,
  type Integration, type InsertIntegration,
  type MessageTemplate, type InsertMessageTemplate, type TemplateCarouselMediaDefault,
  type TemplateSend, type InsertTemplateSend,
  type DripCampaign, type InsertDripCampaign,
  type DripStep, type InsertDripStep,
  type DripEnrollment, type InsertDripEnrollment,
  type DripSend, type InsertDripSend,
  type ChatbotFlow, type InsertChatbotFlow,
  type ChatbotSession, type InsertChatbotSession,
  type Salesperson, type InsertSalesperson,
  type DemoBooking, type InsertDemoBooking,
  type SalesConversion, type InsertSalesConversion,
  type GrowthEngineSetupTask, type InsertGrowthEngineSetupTask,
  type Contact, type InsertContact,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type ActivityEvent, type InsertActivityEvent,
  type ChannelSetting, type InsertChannelSetting,
  type Channel, type InboxItem,
  type SupportTicket, type InsertSupportTicket,
  type Partner, type InsertPartner,
  type Commission, type InsertCommission,
  type AgreementAcceptance, type InsertAgreementAcceptance,
  type AiSettings, type AiBusinessKnowledge, type AiUsage, type AiLeadScore,
  type UserAutomationTemplate, type InsertUserAutomationTemplate,
  type PresetCampaign, type InsertPresetCampaign,
  type CampaignEnrollment, type InsertCampaignEnrollment,
  type CampaignStepEvent, type InsertCampaignStepEvent,
  type TemplateUsageAnalytics, type InsertTemplateUsageAnalytics,
  type Template, type TemplateEntitlement, type InsertTemplateEntitlement,
  type RealtorOnboardingSubmission, type InsertRealtorOnboardingSubmission,
  type TemplateInstall, type InsertTemplateInstall,
  type TemplateAsset, type InsertTemplateAsset,
  type UserTemplateData, type InsertUserTemplateData,
  type ContactNote, type InsertContactNote,
  type Appointment, type InsertAppointment,
  type CalendlyCanceledEventTombstone, type InsertCalendlyCanceledEventTombstone,
  type GhlEventDedup, type InsertGhlEventDedup,
  type GhlSyncFailure, type InsertGhlSyncFailure, ghlSyncFailures,
  type FlowJob, type InsertFlowJob,
  type NoReplyJob, type InsertNoReplyJob,
  type AutomationTimerJob, type InsertAutomationTimerJob,
  aiSettings, aiBusinessKnowledge, aiUsage, aiLeadScores,
  userAutomationTemplates, presetCampaigns, campaignEnrollments, campaignStepEvents, templateUsageAnalytics,
  templates as templatesTable, templateEntitlements, realtorOnboardingSubmissions,
  templateInstalls, templateAssets, userTemplateData, ghlEventDedup, calendlyCanceledEventTombstones
} from "@shared/schema";
import { computeConversationReplyWindowStatus } from "@shared/conversationReplyWindow";
import type { RetargetEligibleContactRow } from "@shared/retargetEligibleContact";
import {
  buildReEngagementAfterMetaDeliveryFailure,
  deriveRetargetReEngagementApiFields,
  parseConversationReEngagement,
  reconcileRetargetApiFieldsWithLatestOutboundTemplate,
  reEngagementUserHintFromMessageError,
  retargetTemplateNameFromOutboundMessage,
  shouldRepairReEngagementJsonFromLatestFailedTemplate,
  type ConversationReEngagement,
} from "@shared/reEngagement";
import { db } from "../drizzle/db";
import { users, chats, registeredPhones, messageUsage, conversationWindows, teamMembers, workflows, workflowExecutions, recurringReminders, webhooks, webhookDeliveries, integrations, messageTemplates, templateCarouselMediaDefaults, templateSends, dripCampaigns, dripSteps, dripEnrollments, dripSends, chatbotFlows, chatbotSessions, salespeople, demoBookings, salesConversions, adminSettings, contacts, conversations, messages, activityEvents, channelSettings, supportTickets, partners, commissions, agreementAcceptances, contactNotes, appointments, flowJobs, noReplyJobs, automationTimerJobs, automationSendDedup, type InsertConversationWindow, type ConversationWindow, growthEngineSetupTasks } from "@shared/schema";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { eq, and, lte, sql, isNotNull, isNull, asc, desc, gte, sum, gt, or, like, ilike, ne, inArray, notInArray, lt, count } from "drizzle-orm";
import { getEffectiveTaskPayoutDollars, type TaskPayoutFields } from "./salespersonTaskPayout";
import {
  isDemoBookingsSchemaMismatchError,
  mapDemoBookingRow,
} from "./demoBookingRows";
import { readDemoBookings, writeDemoBookingUpdate } from "./demoBookingStorage";

/** Columns always present on legacy Neon `public.users`; avoids Drizzle hydrating rows when DB lacks newer schema columns (42703). */
type UsersAuthCoreRow = {
  id: string;
  name: string;
  email: string;
  password: string;
};

function parseUsersAuthCoreRow(raw: Record<string, unknown>): UsersAuthCoreRow | null {
  const id = raw.id;
  if (typeof id !== "string" || !id) return null;
  // Auth core reads must tolerate NULL/legacy rows (missing name/password) — never drop the row.
  const name = raw.name == null ? "" : String(raw.name);
  const email = raw.email == null ? "" : String(raw.email);
  const password = raw.password == null ? "" : String(raw.password);
  if (!email) return null;
  return { id, name, email, password };
}

/** Minimal `User` for Passport auth — only id/name/email/password are loaded; other fields read as undefined until full migrate. */
function userFromAuthCoreRow(row: UsersAuthCoreRow): User {
  return row as unknown as User;
}

function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * When PG returns `SELECT *` rows (snake_case keys), map to Drizzle `User` camelCase so billing/meta fields load even if
 * Drizzle `SELECT * FROM users` fails due to schema/DB drift (e.g. missing newly added columns).
 */
function widePgRowToUser(raw: Record<string, unknown>): User {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[snakeToCamelKey(k)] = v;
  }
  return out as User;
}

function sanitizeUserUpdatesForLog(updates: Partial<User>): Record<string, unknown> {
  const sensitive = new Set([
    "password",
    "metaAccessToken",
    "metaAppSecret",
    "twilioAuthToken",
    "twilioAccountSid",
    "shopifyAccessToken",
    "pushSubscription",
  ]);
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    o[k] = sensitive.has(k) ? (v != null && v !== "" ? "[redacted]" : v) : v;
  }
  return o;
}

function logUserUpdateFailure(userId: string, updates: Partial<User>, err: unknown, context = "storage.updateUser"): void {
  const anyErr = err as {
    message?: string;
    code?: string;
    detail?: string;
    constraint?: string;
    column?: string;
  };
  console.error(
    JSON.stringify({
      tag: "[USER_UPDATE_FAILED]",
      context,
      userId,
      updatedFieldKeys: Object.keys(updates),
      sanitizedUpdates: sanitizeUserUpdatesForLog(updates),
      errorMessage: anyErr?.message ?? String(err),
      pgCode: anyErr?.code ?? null,
      pgDetail: anyErr?.detail ?? null,
      pgConstraint: anyErr?.constraint ?? null,
      pgColumn: anyErr?.column ?? null,
      stack: err instanceof Error ? err.stack : null,
    }),
  );
}

function logUserSessionLoadFailure(phase: string, userId: string, err: unknown): void {
  const anyErr = err as { message?: string; code?: string; detail?: string };
  console.warn(
    JSON.stringify({
      tag: "[USER_SESSION_LOAD_FAILED]",
      phase,
      userId,
      errorMessage: anyErr?.message ?? String(err),
      pgCode: anyErr?.code ?? null,
      pgDetail: anyErr?.detail ?? null,
    }),
  );
}

export type UpdateContactOptions = {
  /** When true, suppress automation dispatch (tag/stage) to avoid workflow recursion */
  skipAutomationHooks?: boolean;
};

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  /**
   * Prefer full Drizzle row for sessions/API (`/api/auth/me`) when schema matches production DB.
   * Falls back to raw SQL auth-core (id/name/email/password) if Drizzle fails (legacy DB drift).
   */
  getUserForSession(id: string): Promise<User | undefined>;
  /** Resolve user by email using **only** raw SQL `lower(email) = $1` + `getUser(id)` (auth/login safe path). */
  getUserByEmail(email: string): Promise<User | undefined>;
  /** Alias for `getUserByEmail` — same raw lookup (kept for call-site clarity). */
  getUserByEmailCaseInsensitive(normalizedEmail: string): Promise<User | undefined>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  getUserByShopifyShop(shop: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  /** Temporary diagnostics — subscription + Meta fields when investigating schema drift / entitlement bugs. */
  getUserSubscriptionDebugSnapshot(userId: string): Promise<Record<string, unknown>>;
  /**
   * Marks account deletion requested, stops preset campaign enrollments and workflow-style automations (MVP; no row purge).
   * Idempotent if already requested.
   */
  requestAccountDeletion(userId: string): Promise<{ deletionRequestedAt: Date; alreadyRequested: boolean }>;
  
  // Chat methods
  getChats(userId: string, limit?: number): Promise<Chat[]>;
  getTeamChats(ownerId: string, limit?: number): Promise<Chat[]>;
  getChat(id: string): Promise<Chat | undefined>;
  createChat(chat: InsertChat): Promise<Chat>;
  updateChat(id: string, updates: Partial<Chat>): Promise<Chat | undefined>;
  deleteChat(id: string): Promise<void>;
  getConversationCount(userId: string, startDate: Date): Promise<number>;
  
  // Notification methods
  getDueFollowUps(): Promise<Chat[]>;
  getDueContactFollowUps(): Promise<Contact[]>;
  
  // Phone registration methods
  getRegisteredPhones(userId: string): Promise<RegisteredPhone[]>;
  getRegisteredPhoneByNumber(phoneNumber: string): Promise<RegisteredPhone | undefined>;
  registerPhone(phone: InsertRegisteredPhone): Promise<RegisteredPhone>;
  deleteRegisteredPhone(id: string): Promise<void>;
  
  // Usage tracking methods
  recordMessageUsage(usage: InsertMessageUsage): Promise<MessageUsage>;
  getUsageByUser(userId: string, startDate?: Date, endDate?: Date): Promise<MessageUsage[]>;
  getUsageSummary(userId: string, startDate?: Date, endDate?: Date): Promise<{totalMessages: number; totalCost: string}>;
  
  // Conversation window methods (24-hour tracking)
  getActiveConversationWindow(userId: string, whatsappPhone: string): Promise<ConversationWindow | undefined>;
  createConversationWindow(window: InsertConversationWindow): Promise<ConversationWindow>;
  updateConversationWindowMessageCount(id: string): Promise<void>;
  getConversationWindowCount(userId: string, startDate: Date): Promise<number>;
  getLifetimeConversationWindowCount(userId: string): Promise<number>;
  
  // Team member methods
  getTeamMembers(ownerId: string): Promise<TeamMember[]>;
  getTeamMember(id: string): Promise<TeamMember | undefined>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: string, updates: Partial<TeamMember>): Promise<TeamMember | undefined>;
  deleteTeamMember(id: string): Promise<void>;
  getTeamMemberCount(userId: string): Promise<number>;
  
  // Workflow methods (Pro feature)
  getWorkflows(userId: string): Promise<Workflow[]>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  getActiveWorkflowsByTrigger(userId: string, triggerType: string): Promise<Workflow[]>;
  createWorkflow(workflow: InsertWorkflow): Promise<Workflow>;
  updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow | undefined>;
  deleteWorkflow(id: string): Promise<void>;
  incrementWorkflowExecution(id: string): Promise<void>;
  
  // Workflow execution log methods
  logWorkflowExecution(execution: InsertWorkflowExecution): Promise<WorkflowExecution>;
  getWorkflowExecutions(workflowId: string, limit?: number): Promise<WorkflowExecution[]>;
  
  // Recurring reminder methods
  getRecurringReminders(userId: string): Promise<RecurringReminder[]>;
  getDueRecurringReminders(): Promise<RecurringReminder[]>;
  createRecurringReminder(reminder: InsertRecurringReminder): Promise<RecurringReminder>;
  updateRecurringReminder(id: string, updates: Partial<RecurringReminder>): Promise<RecurringReminder | undefined>;
  deleteRecurringReminder(id: string): Promise<void>;
  
  // Message search for conversation history
  searchMessages(userId: string, query: string, limit?: number): Promise<Chat[]>;
  
  // Webhook methods
  getWebhooks(userId: string): Promise<Webhook[]>;
  getWebhook(id: string): Promise<Webhook | undefined>;
  getWebhooksByEvent(userId: string, event: string): Promise<Webhook[]>;
  createWebhook(webhook: InsertWebhook): Promise<Webhook>;
  updateWebhook(id: string, updates: Partial<Webhook>): Promise<Webhook | undefined>;
  deleteWebhook(id: string): Promise<void>;
  getWebhookCount(userId: string): Promise<number>;
  logWebhookDelivery(delivery: InsertWebhookDelivery): Promise<WebhookDelivery>;
  getWebhookDeliveries(webhookId: string, limit?: number): Promise<WebhookDelivery[]>;
  
  // Integration methods
  getIntegrations(userId: string): Promise<Integration[]>;
  getIntegration(id: string): Promise<Integration | undefined>;
  getIntegrationsByType(type: string): Promise<Integration[]>;
  getAllIntegrationsByType(type: string): Promise<Integration[]>;
  getIntegrationByUserAndType(userId: string, type: string): Promise<Integration | undefined>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: string, updates: Partial<Integration>): Promise<Integration | undefined>;
  deleteIntegration(id: string): Promise<void>;
  
  // GHL event dedup (idempotency)
  checkAndRecordGhlEvent(integrationId: string, eventId: string, eventType: string): Promise<boolean>;
  getGhlEventDedup(integrationId: string, eventId: string): Promise<GhlEventDedup | undefined>;

  // GHL sync failures (retry queue + admin visibility)
  createGhlSyncFailure(failure: InsertGhlSyncFailure): Promise<GhlSyncFailure>;
  getGhlSyncFailures(userId?: string, limit?: number): Promise<GhlSyncFailure[]>;
  resolveGhlSyncFailure(id: string): Promise<void>;
  
  // Template methods
  getMessageTemplates(userId: string): Promise<MessageTemplate[]>;
  getMessageTemplate(id: string): Promise<MessageTemplate | undefined>;
  getMessageTemplateByTwilioSid(userId: string, twilioSid: string): Promise<MessageTemplate | undefined>;
  createMessageTemplate(template: InsertMessageTemplate): Promise<MessageTemplate>;
  updateMessageTemplate(id: string, updates: Partial<MessageTemplate>): Promise<MessageTemplate | undefined>;
  deleteMessageTemplate(id: string): Promise<void>;
  listTemplateCarouselMediaDefaultsByUser(userId: string): Promise<TemplateCarouselMediaDefault[]>;
  getTemplateCarouselMediaDefaults(
    userId: string,
    templateId: string
  ): Promise<TemplateCarouselMediaDefault | undefined>;
  upsertTemplateCarouselMediaDefaults(
    userId: string,
    templateId: string,
    cardMedia: Record<string, unknown>
  ): Promise<void>;
  
  // Template send methods
  createTemplateSend(send: InsertTemplateSend): Promise<TemplateSend>;
  getTemplateSends(userId: string, limit?: number): Promise<TemplateSend[]>;
  updateTemplateSendStatus(id: string, status: string, deliveredAt?: Date, readAt?: Date, failureReason?: string): Promise<void>;
  
  // Retargetable chats (outside 24-hour window)
  getRetargetableChats(userId: string, limit?: number): Promise<RetargetEligibleContactRow[]>;
  
  // Chatbot Flow methods
  getChatbotFlows(userId: string): Promise<ChatbotFlow[]>;
  getChatbotFlow(id: string): Promise<ChatbotFlow | undefined>;
  getActiveChatbotFlows(userId: string): Promise<ChatbotFlow[]>;
  createChatbotFlow(flow: InsertChatbotFlow): Promise<ChatbotFlow>;
  updateChatbotFlow(id: string, updates: Partial<ChatbotFlow>): Promise<ChatbotFlow | undefined>;
  deleteChatbotFlow(id: string): Promise<void>;
  incrementChatbotFlowExecution(id: string): Promise<void>;
  
  // Chatbot Session methods
  getChatbotSession(chatId: string): Promise<ChatbotSession | undefined>;
  createChatbotSession(session: InsertChatbotSession): Promise<ChatbotSession>;
  updateChatbotSession(id: string, updates: Partial<ChatbotSession>): Promise<ChatbotSession | undefined>;
  deleteChatbotSession(id: string): Promise<void>;
  
  // ============= MULTI-CHANNEL CRM METHODS =============
  
  // Contact methods
  getContacts(userId: string, limit?: number): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  getContactByChannelId(userId: string, channel: Channel, channelId: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, updates: Partial<Contact>, options?: UpdateContactOptions): Promise<Contact | undefined>;
  /** Explicit jsonb write for buyer_preference_profile (traced). */
  updateContactBuyerPreferenceProfile(
    contactId: string,
    profile: Record<string, unknown>,
    options?: UpdateContactOptions,
  ): Promise<Contact | undefined>;
  /** Explicit jsonb write for seller_preference_profile. */
  updateContactSellerPreferenceProfile(
    contactId: string,
    profile: Record<string, unknown>,
    options?: UpdateContactOptions,
  ): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<void>;
  mergeContacts(targetId: string, sourceId: string): Promise<Contact>;
  searchContacts(userId: string, query: string, limit?: number): Promise<Contact[]>;
  getContactNotes(workspaceId: string, contactId: string): Promise<ContactNote[]>;
  addContactNote(data: InsertContactNote): Promise<ContactNote>;
  getContactNoteById(noteId: string): Promise<ContactNote | undefined>;
  updateContactNote(noteId: string, content: string): Promise<ContactNote | undefined>;
  deleteContactNote(noteId: string): Promise<boolean>;
  createAppointment(data: InsertAppointment): Promise<Appointment>;
  getAppointmentsByUser(userId: string): Promise<Appointment[]>;
  getAppointmentsByContact(userId: string, contactId: string): Promise<Appointment[]>;
  getAppointmentById(id: string): Promise<Appointment | undefined>;
  getAppointmentByCalendlyScheduledEventUri(
    userId: string,
    calendlyScheduledEventUri: string
  ): Promise<Appointment | undefined>;
  recordCalendlyCanceledEventTombstone(
    data: InsertCalendlyCanceledEventTombstone,
  ): Promise<boolean>;
  deleteAppointment(id: string): Promise<boolean>;
  
  // Conversation methods
  getConversations(userId: string, limit?: number): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationByContactAndChannel(contactId: string, channel: Channel, channelAccountId?: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<void>;
  
  // Message methods
  getMessages(conversationId: string, limit?: number, offset?: number): Promise<Message[]>;
  getMessage(id: string): Promise<Message | undefined>;
  getMessageByExternalId(externalMessageId: string): Promise<Message | undefined>;
  getMessageByUserExternalId(userId: string, externalMessageId: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, updates: Partial<Message>): Promise<Message | undefined>;
  
  // Unified inbox methods
  getUnifiedInbox(userId: string, limit?: number): Promise<InboxItem[]>;
  getContactWithConversations(contactId: string): Promise<{ contact: Contact; conversations: Conversation[] } | undefined>;
  
  // Activity event methods
  getActivityEvents(contactId: string, limit?: number): Promise<ActivityEvent[]>;
  createActivityEvent(event: InsertActivityEvent): Promise<ActivityEvent>;
  
  // Channel settings methods
  getChannelSettings(userId: string): Promise<ChannelSetting[]>;
  getChannelSetting(userId: string, channel: Channel): Promise<ChannelSetting | undefined>;
  upsertChannelSetting(userId: string, channel: Channel, updates: Partial<ChannelSetting>): Promise<ChannelSetting>;
  
  // AI Brain methods
  getAiSettings(userId: string): Promise<AiSettings | undefined>;
  upsertAiSettings(userId: string, updates: Partial<AiSettings>): Promise<AiSettings>;
  getAiBusinessKnowledge(userId: string): Promise<AiBusinessKnowledge | undefined>;
  upsertAiBusinessKnowledge(userId: string, updates: Partial<AiBusinessKnowledge>): Promise<AiBusinessKnowledge>;
  getCurrentAiUsage(userId: string): Promise<AiUsage | undefined>;
  upsertAiUsage(userId: string, updates: Partial<AiUsage>): Promise<void>;
  incrementAiUsage(userId: string, field: 'messagesGenerated' | 'repliesSuggested' | 'leadsQualified' | 'automationsGenerated'): Promise<void>;
  upsertAiLeadScore(chatId: string, userId: string, data: Partial<AiLeadScore>): Promise<AiLeadScore>;
  
  // User Automation Templates methods
  getUserAutomationTemplates(userId: string, filters?: { language?: string; category?: string; industry?: string; isActive?: boolean }): Promise<UserAutomationTemplate[]>;
  getUserAutomationTemplate(id: string): Promise<UserAutomationTemplate | undefined>;
  createUserAutomationTemplate(template: InsertUserAutomationTemplate): Promise<UserAutomationTemplate>;
  updateUserAutomationTemplate(id: string, updates: Partial<UserAutomationTemplate>): Promise<UserAutomationTemplate | undefined>;
  deleteUserAutomationTemplate(id: string): Promise<void>;

  getPresetCampaignsForUser(userId: string): Promise<PresetCampaign[]>;
  getPresetCampaignForUser(campaignId: string, userId: string): Promise<PresetCampaign | undefined>;
  createPresetCampaign(row: InsertPresetCampaign): Promise<PresetCampaign>;
  updatePresetCampaign(
    campaignId: string,
    userId: string,
    updates: Partial<PresetCampaign>
  ): Promise<PresetCampaign | undefined>;
  deletePresetCampaign(campaignId: string, userId: string): Promise<boolean>;
  duplicatePresetCampaign(campaignId: string, userId: string): Promise<PresetCampaign | undefined>;

  getCampaignEnrollmentById(id: string): Promise<CampaignEnrollment | undefined>;
  listDueCampaignEnrollmentIds(limit: number): Promise<string[]>;
  getActiveEnrollmentForContactCampaign(
    userId: string,
    contactId: string,
    campaignId: string
  ): Promise<CampaignEnrollment | undefined>;
  createCampaignEnrollment(row: InsertCampaignEnrollment): Promise<CampaignEnrollment>;
  updateCampaignEnrollment(id: string, updates: Partial<CampaignEnrollment>): Promise<CampaignEnrollment | undefined>;
  getCampaignEnrollmentsForContact(userId: string, contactId: string): Promise<CampaignEnrollment[]>;
  getCampaignEnrollmentsForCampaign(userId: string, campaignId: string, limit?: number): Promise<CampaignEnrollment[]>;
  createCampaignStepEvent(row: InsertCampaignStepEvent): Promise<CampaignStepEvent>;
  updateCampaignStepEvent(id: string, updates: Partial<CampaignStepEvent>): Promise<CampaignStepEvent | undefined>;
  getRecentCampaignStepEventsForCampaign(
    userId: string,
    campaignId: string,
    limit?: number
  ): Promise<CampaignStepEvent[]>;
  getLatestCampaignStepEventForEnrollment(
    enrollmentId: string,
    status?: "failed" | "sent" | "skipped"
  ): Promise<CampaignStepEvent | undefined>;
  getCampaignAggregatesForUser(
    userId: string
  ): Promise<
    Record<
      string,
      {
        enrollmentCount: number;
        activeEnrollments: number;
        completedEnrollments: number;
        sentStepEvents: number;
        failedStepEvents: number;
      }
    >
  >;
  
  // Template usage analytics methods
  recordTemplateUsage(usage: InsertTemplateUsageAnalytics): Promise<TemplateUsageAnalytics>;
  getTemplateUsageStats(userId: string, templateId?: string): Promise<{ sent: number; delivered: number; read: number; replied: number; aiResponses: number }>;

  // Premium template methods
  getTemplateById(templateId: string): Promise<Template | undefined>;
  getTemplateEntitlement(userId: string, templateId: string): Promise<TemplateEntitlement | undefined>;
  upsertTemplateEntitlement(userId: string, templateId: string, updates: Partial<TemplateEntitlement>): Promise<TemplateEntitlement>;
  createRealtorOnboardingSubmission(data: InsertRealtorOnboardingSubmission): Promise<RealtorOnboardingSubmission>;
  getRealtorOnboardingSubmission(userId: string): Promise<RealtorOnboardingSubmission | undefined>;
  getTemplateInstall(userId: string, templateId: string): Promise<TemplateInstall | undefined>;
  createTemplateInstall(data: InsertTemplateInstall): Promise<TemplateInstall>;
  updateTemplateInstall(id: string, updates: Partial<TemplateInstall>): Promise<TemplateInstall | undefined>;
  getTemplateAssets(templateId: string): Promise<TemplateAsset[]>;
  getUserTemplateData(userId: string, templateId: string): Promise<UserTemplateData[]>;
  getUserTemplateDataByKey(userId: string, templateId: string, assetType: string, assetKey: string): Promise<UserTemplateData | undefined>;
  createUserTemplateData(data: InsertUserTemplateData): Promise<UserTemplateData>;
  upsertUserTemplateData(userId: string, templateId: string, assetType: string, assetKey: string, definition: any): Promise<UserTemplateData>;
  deleteUserTemplateDataForTemplate(userId: string, templateId: string): Promise<void>;
  resetTemplateForUser(userId: string, templateId: string): Promise<void>;

  getGrowthEngineSetupTask(userId: string, templateId: string): Promise<GrowthEngineSetupTask | undefined>;
  getGrowthEngineSetupTaskById(id: string): Promise<GrowthEngineSetupTask | undefined>;
  listGrowthEngineSetupTasksForTemplate(templateId: string): Promise<GrowthEngineSetupTask[]>;
  listGrowthEngineSetupTasksForSalesperson(salespersonId: string): Promise<GrowthEngineSetupTask[]>;
  countOpenGrowthEngineSetupTasksForSalesperson(salespersonId: string): Promise<number>;
  insertGrowthEngineSetupTask(data: InsertGrowthEngineSetupTask): Promise<GrowthEngineSetupTask>;
  updateGrowthEngineSetupTask(id: string, updates: Partial<GrowthEngineSetupTask>): Promise<GrowthEngineSetupTask | undefined>;
  updateGrowthEngineSetupTaskByUserTemplate(
    userId: string,
    templateId: string,
    updates: Partial<GrowthEngineSetupTask>,
  ): Promise<GrowthEngineSetupTask | undefined>;
  deleteGrowthEngineSetupTaskByUserTemplate(userId: string, templateId: string): Promise<void>;
  creditSalespersonSetupTaskCompletion(salespersonId: string, payoutProfile: TaskPayoutFields): Promise<void>;

  // Flow Job methods (durable Wait/delay scheduling)
  createFlowJob(job: InsertFlowJob): Promise<FlowJob>;
  recoverStuckFlowJobs(): Promise<{ requeued: number; failedTerminal: number }>;
  claimPendingFlowJobs(limit?: number): Promise<FlowJob[]>;
  markFlowJobCompleted(id: string): Promise<void>;
  markFlowJobFailed(id: string, errorMessage: string): Promise<void>;
  markFlowJobSkipped(id: string, reason: string): Promise<void>;

  // No-reply workflow jobs
  cancelPendingNoReplyJobsForContact(contactId: string): Promise<number>;
  createNoReplyJob(job: InsertNoReplyJob): Promise<NoReplyJob>;
  recoverStuckNoReplyJobs(): Promise<{ requeued: number; failedTerminal: number }>;
  claimPendingNoReplyJobs(limit?: number): Promise<NoReplyJob[]>;
  markNoReplyJobCompleted(id: string): Promise<void>;
  markNoReplyJobFailed(id: string, errorMessage: string): Promise<void>;
  markNoReplyJobSkipped(id: string, reason: string): Promise<void>;
  markNoReplyJobCancelled(id: string): Promise<void>;

  // Durable automation timers (e.g. W2 qualification / routing)
  createAutomationTimerJob(job: InsertAutomationTimerJob): Promise<AutomationTimerJob>;
  cancelPendingAutomationTimerJobsForUserContactKinds(userId: string, contactId: string, kinds: string[]): Promise<number>;
  recoverStuckAutomationTimerJobs(): Promise<{ requeued: number; failedTerminal: number }>;
  claimPendingAutomationTimerJobs(limit?: number): Promise<AutomationTimerJob[]>;
  markAutomationTimerJobCompleted(id: string): Promise<void>;
  markAutomationTimerJobFailed(id: string, errorMessage: string): Promise<void>;
  markAutomationTimerJobSkipped(id: string, reason: string): Promise<void>;

  // Automation outbound send idempotency
  tryAcquireAutomationSendDedup(dedupKey: string, userId: string, contactId?: string | null): Promise<boolean>;
  completeAutomationSendDedup(dedupKey: string, status: "completed" | "skipped"): Promise<void>;
}

type LatestOutboundTemplateSnapshotRow = {
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  templateVariables: unknown;
  content: string | null;
  sentAt: Date | null;
  createdAt: Date | null;
};

function coercePgDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Latest outbound template row per conversation (by `created_at`) — used to reconcile stale `re_engagement`. */
async function loadLatestOutboundTemplateSnapshotsByConversationIds(
  userId: string,
  conversationIds: string[]
): Promise<Map<string, LatestOutboundTemplateSnapshotRow>> {
  const out = new Map<string, LatestOutboundTemplateSnapshotRow>();
  if (conversationIds.length === 0) return out;
  const CHUNK = 120;
  for (let i = 0; i < conversationIds.length; i += CHUNK) {
    const chunk = conversationIds.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id AS "conversationId",
          m.status AS status,
          m.error_code AS "errorCode",
          m.error_message AS "errorMessage",
          m.template_variables AS "templateVariables",
          m.content AS content,
          m.sent_at AS "sentAt",
          m.created_at AS "createdAt"
        FROM messages m
        WHERE m.user_id = ${userId}
          AND m.direction = 'outbound'
          AND lower(trim(m.content_type)) = 'template'
          AND m.conversation_id IN (${sql.join(
            chunk.map((id) => sql`${id}`),
            sql`, `
          )})
        ORDER BY m.conversation_id, m.created_at DESC
      `);
      const rows = (result as { rows: Record<string, unknown>[] }).rows ?? [];
      for (const r of rows) {
        const cid = String(r.conversationId ?? "");
        if (!cid) continue;
        out.set(cid, {
          status: String(r.status ?? ""),
          errorCode: r.errorCode != null ? String(r.errorCode) : null,
          errorMessage: r.errorMessage != null ? String(r.errorMessage) : null,
          templateVariables: r.templateVariables,
          content: r.content != null ? String(r.content) : null,
          sentAt: coercePgDate(r.sentAt),
          createdAt: coercePgDate(r.createdAt),
        });
      }
    } catch (e) {
      console.error("[loadLatestOutboundTemplateSnapshotsByConversationIds] chunk failed", e);
    }
  }
  return out;
}

/** Legacy sales_conversions rows before migration 0035 (no conversion_date / payout_eligible columns). */
function isSalesConversionsSchemaMismatchError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error ?? "").toLowerCase();
  return (
    (msg.includes("sales_conversions") ||
      msg.includes("conversion_date") ||
      msg.includes("demo_date") ||
      msg.includes("payout_eligible") ||
      msg.includes("eligibility_notes")) &&
    (msg.includes("does not exist") || msg.includes("failed query"))
  );
}

function mapLegacySalesConversionRow(row: Record<string, unknown>): SalesConversion {
  const createdRaw = row.created_at ?? row.createdAt;
  const createdAt =
    createdRaw instanceof Date ? createdRaw : createdRaw ? new Date(String(createdRaw)) : new Date();
  const paidAtRaw = row.paid_at ?? row.paidAt;
  const paidAt =
    paidAtRaw == null
      ? null
      : paidAtRaw instanceof Date
        ? paidAtRaw
        : new Date(String(paidAtRaw));

  return {
    id: String(row.id),
    bookingId: String(row.booking_id ?? row.bookingId),
    salespersonId: String(row.salesperson_id ?? row.salespersonId),
    userId: row.user_id != null || row.userId != null ? String(row.user_id ?? row.userId) : null,
    amount: String(row.amount ?? "0"),
    totalRevenue: String(row.total_revenue ?? row.totalRevenue ?? "0"),
    paid: Boolean(row.paid ?? false),
    paidAt,
    conversionDate: createdAt,
    demoDate: null,
    payoutEligible: true,
    eligibilityNotes: null,
    createdAt,
  };
}

async function fetchSalesConversionsLegacy(salespersonId?: string): Promise<SalesConversion[]> {
  const result = salespersonId
    ? await db.execute(sql`
        SELECT id, booking_id, salesperson_id, user_id, amount, total_revenue, paid, paid_at, created_at
        FROM sales_conversions
        WHERE salesperson_id = ${salespersonId}
        ORDER BY created_at DESC
      `)
    : await db.execute(sql`
        SELECT id, booking_id, salesperson_id, user_id, amount, total_revenue, paid, paid_at, created_at
        FROM sales_conversions
        ORDER BY created_at DESC
      `);
  return (result.rows as Record<string, unknown>[]).map(mapLegacySalesConversionRow);
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    // Same minimal projection as login — session/deserialize must not Drizzle-select missing columns on older Neon DBs.
    try {
      const result = await db.execute(sql`
        SELECT
          id,
          COALESCE(name, '') AS name,
          email,
          COALESCE(password, '') AS password
        FROM public.users
        WHERE id = ${id}
        LIMIT 1
      `);
      const rows = (result as { rows: Record<string, unknown>[] }).rows;
      const parsed = rows[0] ? parseUsersAuthCoreRow(rows[0]) : null;
      return parsed ? userFromAuthCoreRow(parsed) : undefined;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[getUser] raw auth-core lookup error:", message);
      throw err;
    }
  }

  async getUserForSession(id: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (result[0]) return result[0];
    } catch (err: unknown) {
      logUserSessionLoadFailure("drizzle_full_row_select", id, err);
      try {
        const wide = await this.loadUserWideRowViaSelectStar(id);
        if (wide) {
          console.warn(
            JSON.stringify({
              tag: "[USER_SESSION_DRIFT_FALLBACK_OK]",
              userId: id,
              note:
                "Loaded user via SELECT * fallback — Drizzle ORM select failed (often missing DB column vs schema). Apply pending migrations.",
            }),
          );
          return wide;
        }
      } catch (fallbackErr: unknown) {
        logUserSessionLoadFailure("select_star_fallback_inner", id, fallbackErr);
      }
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[getUserForSession] Drizzle load failed; falling back to auth-core getUser:", message);
    }
    return this.getUser(id);
  }

  /** Loads full row using PG-native SELECT * so billing/meta columns survive even when Drizzle schema has columns not yet migrated. */
  private async loadUserWideRowViaSelectStar(id: string): Promise<User | undefined> {
    const result = await db.execute(sql`SELECT * FROM public.users WHERE id = ${id} LIMIT 1`);
    const rows = (result as { rows: Record<string, unknown>[] }).rows;
    if (!rows[0]) return undefined;
    return widePgRowToUser(rows[0]);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const raw = typeof email === "string" ? email : "";
    const trimmedLower = raw.trim().toLowerCase();
    let nfkc = trimmedLower;
    try {
      nfkc = trimmedLower.normalize("NFKC");
    } catch {
      nfkc = trimmedLower;
    }
    const variants = [...new Set([nfkc, trimmedLower].filter((v) => v.length > 0))];
    if (variants.length === 0) return undefined;

    try {
      for (const e of variants) {
        const result = await db.execute(sql`
          SELECT
            id,
            COALESCE(name, '') AS name,
            email,
            COALESCE(password, '') AS password
          FROM public.users
          WHERE trim(lower(email)) = ${e}
          LIMIT 1
        `);
        const rows = (result as { rows: Record<string, unknown>[] }).rows;
        const parsed = rows[0] ? parseUsersAuthCoreRow(rows[0]) : null;
        if (parsed) return userFromAuthCoreRow(parsed);
      }
      return undefined;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[getUserByEmail] raw lookup error:", message);
      throw err;
    }
  }

  async getUserByEmailCaseInsensitive(normalizedEmail: string): Promise<User | undefined> {
    return this.getUserByEmail(normalizedEmail);
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
      return result[0];
    } catch (err: unknown) {
      logUserSessionLoadFailure("getUserByStripeCustomerId_drizzle", customerId, err);
      try {
        const result = await db.execute(
          sql`SELECT * FROM public.users WHERE stripe_customer_id = ${customerId} LIMIT 1`,
        );
        const rows = (result as { rows: Record<string, unknown>[] }).rows;
        return rows[0] ? widePgRowToUser(rows[0]) : undefined;
      } catch {
        return undefined;
      }
    }
  }

  async getUserByShopifyShop(shop: string): Promise<User | undefined> {
    const normalized = normalizeShopifyShopDomain(shop);
    if (!normalized) return undefined;
    try {
      const result = await db.execute(sql`
        SELECT * FROM public.users
        WHERE shopify_shop IS NOT NULL
          AND lower(trim(shopify_shop)) = ${normalized}
        LIMIT 1
      `);
      const rows = (result as { rows: Record<string, unknown>[] }).rows;
      return rows[0] ? widePgRowToUser(rows[0]) : undefined;
    } catch (err: unknown) {
      logUserSessionLoadFailure("getUserByShopifyShop", normalized, err);
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const now = new Date();

    const email =
      typeof (insertUser as any).email === "string"
        ? ((insertUser as any).email as string).trim().toLowerCase()
        : "";
    const isDemoUser = email === "demo@whachat.com";

    const billingPlan = (((insertUser as any).billingPlan || "free") as string).toLowerCase();
    const overrideEnabled = !!(insertUser as any).planOverrideEnabled;

    const providedTrialEndsAt = (insertUser as any).trialEndsAt as Date | null | undefined;
    const providedTrialStatus = (insertUser as any).trialStatus as string | null | undefined;
    const providedTrialPlan = (insertUser as any).trialPlan as string | null | undefined;

    const shouldDefaultTrial =
      !isDemoUser &&
      !overrideEnabled &&
      (billingPlan === "free" || billingPlan === "") &&
      !providedTrialEndsAt &&
      providedTrialStatus !== "expired";

    const values = shouldDefaultTrial
      ? (() => {
          const trialStartedAt = now;
          const trialEndsAt = new Date(now);
          trialEndsAt.setDate(trialEndsAt.getDate() + 14);
          return {
            ...(insertUser as any),
            trialStartedAt,
            trialEndsAt,
            trialStatus: "active",
            trialPlan: "pro_ai",
          } as InsertUser;
        })()
      : insertUser;

    const result = await db.insert(users).values(values).returning();
    const created = result[0];

    const trialPlan = created?.trialPlan ?? providedTrialPlan ?? null;
    const trialEndsAt = created?.trialEndsAt ?? providedTrialEndsAt ?? null;
    const aiEnabled =
      !!trialEndsAt &&
      new Date(trialEndsAt) > now &&
      (created?.trialStatus ?? providedTrialStatus) !== "expired" &&
      (trialPlan || "pro_ai") === "pro_ai";

    console.log(
      `[TrialInit] ${JSON.stringify({
        userId: created?.id ?? null,
        trialCreated: shouldDefaultTrial || !!providedTrialEndsAt,
        trialPlan,
        aiEnabled,
        trialEndsAt,
      })}`,
    );

    return created;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    try {
      // IMPORTANT: avoid `.returning()` with no args — Drizzle expands to ALL schema columns in RETURNING. If production
      // DB is missing a newer column (pending migration), Postgres errors even when that column is not in SET.
      await db.update(users).set(updates).where(eq(users.id, id)).returning({ id: users.id });
    } catch (err: unknown) {
      logUserUpdateFailure(id, updates, err);
      throw err;
    }
    return this.getUserForSession(id);
  }

  async getUserSubscriptionDebugSnapshot(userId: string): Promise<Record<string, unknown>> {
    let drizzleOk = false;
    let drizzleError: string | null = null;
    try {
      const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      drizzleOk = !!rows[0];
      if (!rows[0]) {
        return { error: "user_not_found", userId };
      }
    } catch (e: unknown) {
      drizzleError = e instanceof Error ? e.message : String(e);
    }

    let wide: User | undefined;
    try {
      wide = await this.loadUserWideRowViaSelectStar(userId);
    } catch (e: unknown) {
      return {
        userId,
        drizzleFullRowSelectWorked: drizzleOk,
        drizzleError,
        selectStarError: e instanceof Error ? e.message : String(e),
        hint: "Could not load user row — check DB connectivity.",
      };
    }

    if (!wide) {
      return { userId, error: "user_not_found" };
    }

    const u = wide;
    return {
      userId: u.id,
      email: u.email,
      subscriptionPlan: u.subscriptionPlan ?? null,
      subscriptionStatus: u.subscriptionStatus ?? null,
      billingPlan: u.billingPlan ?? null,
      planOverride: u.planOverride ?? null,
      planOverrideEnabled: u.planOverrideEnabled ?? null,
      stripeCustomerId: u.stripeCustomerId ?? null,
      stripeSubscriptionId: u.stripeSubscriptionId ?? null,
      currentPeriodEnd: u.currentPeriodEnd ?? null,
      currentPeriodStart: u.currentPeriodStart ?? null,
      trialStatus: u.trialStatus ?? null,
      trialPlan: u.trialPlan ?? null,
      trialEndsAt: u.trialEndsAt ?? null,
      trialStartedAt: u.trialStartedAt ?? null,
      shopifyShop: u.shopifyShop ?? null,
      shopifySubscriptionStatus: u.shopifySubscriptionStatus ?? null,
      metaConnected: u.metaConnected ?? null,
      whatsappProvider: u.whatsappProvider ?? null,
      twilioConnected: u.twilioConnected ?? null,
      drizzleFullRowSelectWorked: drizzleOk,
      drizzleFullRowSelectError: drizzleError,
      schemaDriftSuspected: !drizzleOk && !!wide,
      hint: !drizzleOk
        ? "Drizzle full-row select failed but SELECT * worked — DB is missing at least one column present in shared/schema users table; run pending SQL migrations (e.g. migrations/*.sql)."
        : null,
    };
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async requestAccountDeletion(userId: string): Promise<{ deletionRequestedAt: Date; alreadyRequested: boolean }> {
    const existing = await db
      .select({ deletionRequestedAt: users.deletionRequestedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const row = existing[0];
    if (row?.deletionRequestedAt) {
      return { deletionRequestedAt: row.deletionRequestedAt, alreadyRequested: true };
    }

    const now = new Date();

    await db
      .update(campaignEnrollments)
      .set({
        status: "cancelled",
        updatedAt: now,
        nextRunAt: null,
      })
      .where(
        and(
          eq(campaignEnrollments.userId, userId),
          or(eq(campaignEnrollments.status, "active"), eq(campaignEnrollments.status, "paused"))
        )
      );

    await db
      .update(workflows)
      .set({ isActive: false, updatedAt: now })
      .where(eq(workflows.userId, userId));

    await db
      .update(recurringReminders)
      .set({ isActive: false })
      .where(eq(recurringReminders.userId, userId));

    const updated = await db
      .update(users)
      .set({ deletionRequestedAt: now })
      .where(eq(users.id, userId))
      .returning({ deletionRequestedAt: users.deletionRequestedAt });

    const at = updated[0]?.deletionRequestedAt ?? now;
    console.log(
      `[AccountDeletion] deletion_requested userId=${userId} at=${at.toISOString()}`
    );
    return { deletionRequestedAt: at, alreadyRequested: false };
  }

  async getChats(userId: string, limit: number = 10000): Promise<Chat[]> {
    return await db.select().from(chats).where(eq(chats.userId, userId)).orderBy(desc(chats.updatedAt)).limit(limit);
  }

  async getTeamChats(ownerId: string, limit: number = 10000): Promise<Chat[]> {
    const members = await db.select().from(teamMembers).where(eq(teamMembers.ownerId, ownerId));
    const memberUserIds = members
      .filter(m => m.memberId !== null)
      .map(m => m.memberId as string);
    const allUserIds = [ownerId, ...memberUserIds];
    
    if (allUserIds.length === 1) {
      return await db.select().from(chats).where(eq(chats.userId, ownerId)).orderBy(desc(chats.updatedAt)).limit(limit);
    }
    
    return await db
      .select()
      .from(chats)
      .where(or(...allUserIds.map(id => eq(chats.userId, id))))
      .orderBy(desc(chats.updatedAt))
      .limit(limit);
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const result = await db.select().from(chats).where(eq(chats.id, id));
    return result[0];
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const result = await db.insert(chats).values(chat).returning();
    return result[0];
  }

  async updateChat(id: string, updates: Partial<Chat>): Promise<Chat | undefined> {
    const result = await db
      .update(chats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chats.id, id))
      .returning();
    return result[0];
  }

  async deleteChat(id: string): Promise<void> {
    await db.delete(chats).where(eq(chats.id, id));
  }

  async getConversationCount(userId: string, startDate: Date): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chats)
      .where(
        and(
          eq(chats.userId, userId),
          gte(chats.createdAt, startDate)
        )
      );
    return result[0]?.count || 0;
  }

  async getDueFollowUps(): Promise<Chat[]> {
    const now = new Date();
    return await db
      .select()
      .from(chats)
      .where(
        and(
          isNotNull(chats.followUpDate),
          lte(chats.followUpDate, now)
        )
      );
  }

  async getDueContactFollowUps(): Promise<Contact[]> {
    const now = new Date();
    return await db
      .select()
      .from(contacts)
      .where(
        and(
          isNotNull(contacts.followUpDate),
          lte(contacts.followUpDate, now)
        )
      );
  }

  // Phone registration methods
  async getRegisteredPhones(userId: string): Promise<RegisteredPhone[]> {
    return await db.select().from(registeredPhones).where(eq(registeredPhones.userId, userId));
  }

  async getRegisteredPhoneByNumber(phoneNumber: string): Promise<RegisteredPhone | undefined> {
    const result = await db.select().from(registeredPhones).where(eq(registeredPhones.phoneNumber, phoneNumber));
    return result[0];
  }

  async registerPhone(phone: InsertRegisteredPhone): Promise<RegisteredPhone> {
    const result = await db.insert(registeredPhones).values(phone).returning();
    return result[0];
  }

  async deleteRegisteredPhone(id: string): Promise<void> {
    await db.delete(registeredPhones).where(eq(registeredPhones.id, id));
  }

  // Usage tracking methods
  async recordMessageUsage(usage: InsertMessageUsage): Promise<MessageUsage> {
    const result = await db.insert(messageUsage).values(usage).returning();
    return result[0];
  }

  async getUsageByUser(userId: string, startDate?: Date, endDate?: Date): Promise<MessageUsage[]> {
    let query = db.select().from(messageUsage).where(eq(messageUsage.userId, userId));
    
    if (startDate && endDate) {
      query = db.select().from(messageUsage).where(
        and(
          eq(messageUsage.userId, userId),
          gte(messageUsage.createdAt, startDate),
          lte(messageUsage.createdAt, endDate)
        )
      );
    }
    
    return await query.orderBy(desc(messageUsage.createdAt));
  }

  async getUsageSummary(userId: string, startDate?: Date, endDate?: Date): Promise<{totalMessages: number; totalCost: string}> {
    let whereClause = eq(messageUsage.userId, userId);
    
    if (startDate && endDate) {
      whereClause = and(
        eq(messageUsage.userId, userId),
        gte(messageUsage.createdAt, startDate),
        lte(messageUsage.createdAt, endDate)
      ) as any;
    }
    
    const result = await db
      .select({
        totalMessages: sql<number>`count(*)::int`,
        totalCost: sql<string>`coalesce(sum(${messageUsage.totalCost}), 0)::text`
      })
      .from(messageUsage)
      .where(whereClause);
    
    return result[0] || { totalMessages: 0, totalCost: "0" };
  }

  // Conversation window methods (24-hour tracking)
  async getActiveConversationWindow(userId: string, whatsappPhone: string): Promise<ConversationWindow | undefined> {
    const now = new Date();
    const result = await db
      .select()
      .from(conversationWindows)
      .where(
        and(
          eq(conversationWindows.userId, userId),
          eq(conversationWindows.whatsappPhone, whatsappPhone),
          gt(conversationWindows.windowEnd, now)
        )
      )
      .orderBy(desc(conversationWindows.windowStart))
      .limit(1);
    return result[0];
  }

  async createConversationWindow(window: InsertConversationWindow): Promise<ConversationWindow> {
    const result = await db.insert(conversationWindows).values(window).returning();
    return result[0];
  }

  async updateConversationWindowMessageCount(id: string): Promise<void> {
    await db
      .update(conversationWindows)
      .set({ messageCount: sql`${conversationWindows.messageCount} + 1` })
      .where(eq(conversationWindows.id, id));
  }

  async getConversationWindowCount(userId: string, startDate: Date): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversationWindows)
      .where(
        and(
          eq(conversationWindows.userId, userId),
          gte(conversationWindows.windowStart, startDate)
        )
      );
    return result[0]?.count || 0;
  }

  async getLifetimeConversationWindowCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversationWindows)
      .where(eq(conversationWindows.userId, userId));
    return result[0]?.count || 0;
  }

  async incrementMonthlyConversations(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ monthlyConversations: sql`coalesce(${users.monthlyConversations}, 0) + 1` })
      .where(eq(users.id, userId));
  }

  async incrementTwilioUsage(userId: string, amount: number): Promise<void> {
    await db
      .update(users)
      .set({ monthlyTwilioUsage: sql`coalesce(${users.monthlyTwilioUsage}::numeric, 0) + ${amount}` })
      .where(eq(users.id, userId));
  }

  async getTeamMembers(ownerId: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers).where(eq(teamMembers.ownerId, ownerId)).orderBy(asc(teamMembers.invitedAt));
  }

  async getTeamMember(id: string): Promise<TeamMember | undefined> {
    const result = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return result[0];
  }

  async createTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    const result = await db.insert(teamMembers).values(member).returning();
    return result[0];
  }

  async updateTeamMember(id: string, updates: Partial<TeamMember>): Promise<TeamMember | undefined> {
    const result = await db.update(teamMembers).set(updates).where(eq(teamMembers.id, id)).returning();
    return result[0];
  }

  async deleteTeamMember(id: string): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  async getTeamMemberCount(ownerId: string): Promise<number> {
    // Seats = account owner (1) + invited members (active/pending, non-owner rows).
    // Exclude role=owner so a legacy owner row in team_members is not double-counted with the +1.
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(teamMembers)
      .where(and(
        eq(teamMembers.ownerId, ownerId),
        ne(teamMembers.role, "owner"),
        or(eq(teamMembers.status, "active"), eq(teamMembers.status, "pending"))
      ));
    return (result[0]?.count || 0) + 1;
  }

  // Workflow methods (Pro feature)
  async getWorkflows(userId: string): Promise<Workflow[]> {
    return await db.select().from(workflows).where(eq(workflows.userId, userId)).orderBy(desc(workflows.createdAt));
  }

  async getWorkflow(id: string): Promise<Workflow | undefined> {
    const result = await db.select().from(workflows).where(eq(workflows.id, id));
    return result[0];
  }

  async getActiveWorkflowsByTrigger(userId: string, triggerType: string): Promise<Workflow[]> {
    return await db.select().from(workflows).where(
      and(
        eq(workflows.userId, userId),
        eq(workflows.triggerType, triggerType),
        eq(workflows.isActive, true)
      )
    );
  }

  async createWorkflow(workflow: InsertWorkflow): Promise<Workflow> {
    const result = await db.insert(workflows).values(workflow).returning();
    return result[0];
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow | undefined> {
    const result = await db.update(workflows).set({ ...updates, updatedAt: new Date() }).where(eq(workflows.id, id)).returning();
    return result[0];
  }

  async deleteWorkflow(id: string): Promise<void> {
    await db.delete(workflows).where(eq(workflows.id, id));
  }

  async incrementWorkflowExecution(id: string): Promise<void> {
    await db.update(workflows).set({
      executionCount: sql`coalesce(${workflows.executionCount}, 0) + 1`,
      lastExecutedAt: new Date()
    }).where(eq(workflows.id, id));
  }

  // Workflow execution log methods
  async logWorkflowExecution(execution: InsertWorkflowExecution): Promise<WorkflowExecution> {
    const result = await db.insert(workflowExecutions).values(execution).returning();
    return result[0];
  }

  async getWorkflowExecutions(workflowId: string, limit: number = 50): Promise<WorkflowExecution[]> {
    return await db.select().from(workflowExecutions)
      .where(eq(workflowExecutions.workflowId, workflowId))
      .orderBy(desc(workflowExecutions.executedAt))
      .limit(limit);
  }

  // Recurring reminder methods
  async getRecurringReminders(userId: string): Promise<RecurringReminder[]> {
    return await db.select().from(recurringReminders).where(eq(recurringReminders.userId, userId)).orderBy(asc(recurringReminders.createdAt));
  }

  async getDueRecurringReminders(): Promise<RecurringReminder[]> {
    const now = new Date();
    return await db.select().from(recurringReminders).where(
      and(
        eq(recurringReminders.isActive, true),
        lte(recurringReminders.nextDue, now)
      )
    );
  }

  async createRecurringReminder(reminder: InsertRecurringReminder): Promise<RecurringReminder> {
    const result = await db.insert(recurringReminders).values(reminder).returning();
    return result[0];
  }

  async updateRecurringReminder(id: string, updates: Partial<RecurringReminder>): Promise<RecurringReminder | undefined> {
    const result = await db.update(recurringReminders).set(updates).where(eq(recurringReminders.id, id)).returning();
    return result[0];
  }

  async deleteRecurringReminder(id: string): Promise<void> {
    await db.delete(recurringReminders).where(eq(recurringReminders.id, id));
  }

  // Message search for conversation history
  async searchMessages(userId: string, query: string, limit: number = 50): Promise<Chat[]> {
    const searchPattern = `%${query}%`;
    return await db.select().from(chats).where(
      and(
        eq(chats.userId, userId),
        or(
          ilike(chats.name, searchPattern),
          ilike(chats.notes, searchPattern),
          sql`${chats.messages}::text ILIKE ${searchPattern}`
        )
      )
    ).orderBy(desc(chats.updatedAt)).limit(limit);
  }

  // Webhook methods
  async getWebhooks(userId: string): Promise<Webhook[]> {
    return await db.select().from(webhooks).where(eq(webhooks.userId, userId)).orderBy(desc(webhooks.createdAt));
  }

  async getWebhook(id: string): Promise<Webhook | undefined> {
    const result = await db.select().from(webhooks).where(eq(webhooks.id, id));
    return result[0];
  }

  async getWebhooksByEvent(userId: string, event: string): Promise<Webhook[]> {
    return await db.select().from(webhooks).where(
      and(
        eq(webhooks.userId, userId),
        eq(webhooks.isActive, true),
        sql`${event} = ANY(${webhooks.events})`
      )
    );
  }

  async createWebhook(webhook: InsertWebhook): Promise<Webhook> {
    const result = await db.insert(webhooks).values(webhook).returning();
    return result[0];
  }

  async updateWebhook(id: string, updates: Partial<Webhook>): Promise<Webhook | undefined> {
    const result = await db.update(webhooks).set(updates).where(eq(webhooks.id, id)).returning();
    return result[0];
  }

  async deleteWebhook(id: string): Promise<void> {
    await db.delete(webhooks).where(eq(webhooks.id, id));
  }

  async getWebhookCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(webhooks).where(eq(webhooks.userId, userId));
    return Number(result[0]?.count || 0);
  }

  async logWebhookDelivery(delivery: InsertWebhookDelivery): Promise<WebhookDelivery> {
    const result = await db.insert(webhookDeliveries).values(delivery).returning();
    return result[0];
  }

  async getWebhookDeliveries(webhookId: string, limit: number = 50): Promise<WebhookDelivery[]> {
    return await db.select().from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(webhookDeliveries.deliveredAt))
      .limit(limit);
  }

  // Integration methods
  async getIntegrations(userId: string): Promise<Integration[]> {
    return await db.select().from(integrations).where(eq(integrations.userId, userId)).orderBy(desc(integrations.createdAt));
  }

  async getIntegration(id: string): Promise<Integration | undefined> {
    const result = await db.select().from(integrations).where(eq(integrations.id, id));
    return result[0];
  }

  async getIntegrationsByType(type: string): Promise<Integration[]> {
    return await db.select().from(integrations)
      .where(and(eq(integrations.type, type), eq(integrations.isActive, true)));
  }

  async getAllIntegrationsByType(type: string): Promise<Integration[]> {
    return await db.select().from(integrations).where(eq(integrations.type, type));
  }

  async getIntegrationByUserAndType(userId: string, type: string): Promise<Integration | undefined> {
    const result = await db.select().from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.type, type), eq(integrations.isActive, true)));
    return result[0];
  }

  async createIntegration(integration: InsertIntegration): Promise<Integration> {
    const result = await db.insert(integrations).values(integration).returning();
    return result[0];
  }

  async updateIntegration(id: string, updates: Partial<Integration>): Promise<Integration | undefined> {
    const result = await db.update(integrations).set(updates).where(eq(integrations.id, id)).returning();
    return result[0];
  }

  async deleteIntegration(id: string): Promise<void> {
    await db.delete(integrations).where(eq(integrations.id, id));
  }

  async checkAndRecordGhlEvent(integrationId: string, eventId: string, eventType: string): Promise<boolean> {
    const existing = await db.select().from(ghlEventDedup)
      .where(and(eq(ghlEventDedup.integrationId, integrationId), eq(ghlEventDedup.eventId, eventId)));
    
    if (existing.length > 0) {
      return false;
    }
    
    await db.insert(ghlEventDedup).values({
      integrationId,
      eventId,
      eventType,
    });
    return true;
  }

  async getGhlEventDedup(integrationId: string, eventId: string): Promise<GhlEventDedup | undefined> {
    const result = await db.select().from(ghlEventDedup)
      .where(and(eq(ghlEventDedup.integrationId, integrationId), eq(ghlEventDedup.eventId, eventId)));
    return result[0];
  }

  // GHL sync failures
  async createGhlSyncFailure(failure: InsertGhlSyncFailure): Promise<GhlSyncFailure> {
    const result = await db.insert(ghlSyncFailures).values(failure).returning();
    return result[0];
  }

  async getGhlSyncFailures(userId?: string, limit = 100): Promise<GhlSyncFailure[]> {
    const q = db.select().from(ghlSyncFailures)
      .where(userId ? eq(ghlSyncFailures.userId, userId) : undefined)
      .orderBy(desc(ghlSyncFailures.createdAt))
      .limit(limit);
    return await q;
  }

  async resolveGhlSyncFailure(id: string): Promise<void> {
    await db.update(ghlSyncFailures)
      .set({ resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(ghlSyncFailures.id, id));
  }

  // Template methods
  async getMessageTemplates(userId: string): Promise<MessageTemplate[]> {
    return await db.select().from(messageTemplates)
      .where(eq(messageTemplates.userId, userId))
      .orderBy(desc(messageTemplates.createdAt));
  }

  async getMessageTemplate(id: string): Promise<MessageTemplate | undefined> {
    const result = await db.select().from(messageTemplates).where(eq(messageTemplates.id, id));
    return result[0];
  }

  async getMessageTemplateByTwilioSid(userId: string, twilioSid: string): Promise<MessageTemplate | undefined> {
    const result = await db.select().from(messageTemplates)
      .where(and(eq(messageTemplates.userId, userId), eq(messageTemplates.twilioSid, twilioSid)));
    return result[0];
  }

  async createMessageTemplate(template: InsertMessageTemplate): Promise<MessageTemplate> {
    const result = await db.insert(messageTemplates).values(template).returning();
    return result[0];
  }

  async updateMessageTemplate(id: string, updates: Partial<MessageTemplate>): Promise<MessageTemplate | undefined> {
    const result = await db.update(messageTemplates).set(updates).where(eq(messageTemplates.id, id)).returning();
    return result[0];
  }

  async deleteMessageTemplate(id: string): Promise<void> {
    await db.delete(messageTemplates).where(eq(messageTemplates.id, id));
  }

  async listTemplateCarouselMediaDefaultsByUser(userId: string): Promise<TemplateCarouselMediaDefault[]> {
    return await db
      .select()
      .from(templateCarouselMediaDefaults)
      .where(eq(templateCarouselMediaDefaults.userId, userId));
  }

  async getTemplateCarouselMediaDefaults(
    userId: string,
    templateId: string
  ): Promise<TemplateCarouselMediaDefault | undefined> {
    const rows = await db
      .select()
      .from(templateCarouselMediaDefaults)
      .where(
        and(
          eq(templateCarouselMediaDefaults.userId, userId),
          eq(templateCarouselMediaDefaults.templateId, templateId)
        )
      )
      .limit(1);
    return rows[0];
  }

  async upsertTemplateCarouselMediaDefaults(
    userId: string,
    templateId: string,
    cardMedia: Record<string, unknown>
  ): Promise<void> {
    const row = await this.getMessageTemplate(templateId);
    if (!row || row.userId !== userId) {
      throw new Error("template_not_found_or_forbidden");
    }
    const now = new Date();
    await db
      .insert(templateCarouselMediaDefaults)
      .values({
        userId,
        templateId,
        cardMedia,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [templateCarouselMediaDefaults.userId, templateCarouselMediaDefaults.templateId],
        set: {
          cardMedia,
          updatedAt: now,
        },
      });
  }

  // Template send methods
  async createTemplateSend(send: InsertTemplateSend): Promise<TemplateSend> {
    const result = await db.insert(templateSends).values(send).returning();
    return result[0];
  }

  async getTemplateSends(userId: string, limit: number = 100): Promise<TemplateSend[]> {
    return await db.select().from(templateSends)
      .where(eq(templateSends.userId, userId))
      .orderBy(desc(templateSends.sentAt))
      .limit(limit);
  }

  async updateTemplateSendStatus(id: string, status: string, deliveredAt?: Date, readAt?: Date, failureReason?: string): Promise<void> {
    const updates: any = { status };
    if (deliveredAt) updates.deliveredAt = deliveredAt;
    if (readAt) updates.readAt = readAt;
    if (failureReason) updates.failureReason = failureReason;
    await db.update(templateSends).set(updates).where(eq(templateSends.id, id));
  }

  /**
   * Meta reply-window channels whose **unified `conversations` row** matches inbox “Reply window expired”
   * (same `computeConversationReplyWindowStatus` as window-status API). WhatsApp + Messenger + Instagram DM.
   * Does not require a legacy `chats` row.
   */
  async getRetargetableChats(userId: string, limit: number = 5000): Promise<RetargetEligibleContactRow[]> {
    const now = new Date();

    const metaChannels = ["whatsapp", "facebook", "instagram"] as const;

    const convRows = await db
      .select({ conv: conversations, contact: contacts })
      .from(conversations)
      .innerJoin(contacts, eq(conversations.contactId, contacts.id))
      .where(and(eq(conversations.userId, userId), inArray(conversations.channel, [...metaChannels])))
      .limit(10000);

    type Staged = {
      conv: Conversation;
      contact: Contact;
      displayHandle: string;
      whatsappPhone: string;
      daysSinceLastMessage: number;
    };
    const staged: Staged[] = [];
    const seenConversation = new Set<string>();

    for (const { conv, contact } of convRows) {
      const st = computeConversationReplyWindowStatus({
        channel: conv.channel,
        windowExpiresAt: conv.windowExpiresAt,
        now,
      });

      const lastInboundTs =
        conv.lastMessageDirection === "inbound" && conv.lastMessageAt
          ? new Date(conv.lastMessageAt).toISOString()
          : null;

      console.log(
        `[RETARGET_ELIGIBILITY] ${JSON.stringify({
          phase: "evaluate",
          conversationId: conv.id,
          contactId: contact.id,
          channel: conv.channel,
          windowExpiresAt: conv.windowExpiresAt ? new Date(conv.windowExpiresAt).toISOString() : null,
          effectiveFreeFormDeadline: st.effectiveFreeFormDeadline?.toISOString() ?? null,
          freeFormActive: st.freeFormActive,
          templateReopenEligible: st.templateReopenEligible,
          lastInboundTimestamp: lastInboundTs,
          lastMessageAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : null,
          lastMessageDirection: conv.lastMessageDirection ?? null,
          provider: "unified_conversation",
        })}`
      );

      if (!st.templateReopenEligible) continue;

      const ch = (conv.channel || "").toLowerCase();
      let displayHandle = "";
      let whatsappPhone = "";

      if (ch === "whatsapp") {
        displayHandle = (contact.whatsappId || contact.phone || "").trim();
        whatsappPhone = displayHandle;
        if (!displayHandle) {
          console.log(
            `[RETARGET_ELIGIBILITY] ${JSON.stringify({
              phase: "skip",
              reason: "no_whatsapp_phone_on_contact",
              conversationId: conv.id,
            })}`
          );
          continue;
        }
      } else if (ch === "facebook") {
        displayHandle = (contact.facebookId || "").trim();
        if (!displayHandle) {
          console.log(
            `[RETARGET_ELIGIBILITY] ${JSON.stringify({
              phase: "skip",
              reason: "no_facebook_id_on_contact",
              conversationId: conv.id,
            })}`
          );
          continue;
        }
      } else if (ch === "instagram") {
        displayHandle = (contact.instagramId || "").trim();
        if (!displayHandle) {
          console.log(
            `[RETARGET_ELIGIBILITY] ${JSON.stringify({
              phase: "skip",
              reason: "no_instagram_id_on_contact",
              conversationId: conv.id,
            })}`
          );
          continue;
        }
      } else {
        continue;
      }

      if (seenConversation.has(conv.id)) continue;
      seenConversation.add(conv.id);

      const lastAt = conv.lastMessageAt ? new Date(conv.lastMessageAt) : null;
      const daysSince = lastAt
        ? Math.floor((now.getTime() - lastAt.getTime()) / (24 * 60 * 60 * 1000))
        : 0;

      staged.push({
        conv,
        contact,
        displayHandle,
        whatsappPhone,
        daysSinceLastMessage: daysSince,
      });
    }

    const waConvIds = staged
      .filter((s) => (s.conv.channel || "").toLowerCase() === "whatsapp")
      .map((s) => s.conv.id);
    const latestTplByConv = await loadLatestOutboundTemplateSnapshotsByConversationIds(userId, waConvIds);

    const out: RetargetEligibleContactRow[] = [];
    const repairs: Promise<unknown>[] = [];

    for (const { conv, contact, displayHandle, whatsappPhone, daysSinceLastMessage } of staged) {
      const ch = (conv.channel || "").toLowerCase();
      let reFields = deriveRetargetReEngagementApiFields(conv.channel, conv.reEngagement);

      if (ch === "whatsapp") {
        const snap = latestTplByConv.get(conv.id);
        const forReconcile =
          snap != null
            ? {
                status: snap.status,
                errorCode: snap.errorCode,
                errorMessage: snap.errorMessage,
              }
            : null;
        reFields = reconcileRetargetApiFieldsWithLatestOutboundTemplate(
          conv.channel,
          conv.reEngagement,
          forReconcile
        );

        if (
          snap &&
          String(snap.status || "").toLowerCase() === "failed" &&
          shouldRepairReEngagementJsonFromLatestFailedTemplate(conv.reEngagement, forReconcile)
        ) {
          const parsed = parseConversationReEngagement(conv.reEngagement);
          const tName =
            (parsed?.lastTemplateName && parsed.lastTemplateName.trim()) ||
            retargetTemplateNameFromOutboundMessage({
              templateVariables: snap.templateVariables,
              content: snap.content,
            }) ||
            undefined;
          const sentIso = snap.sentAt
            ? snap.sentAt.toISOString()
            : snap.createdAt
              ? snap.createdAt.toISOString()
              : new Date().toISOString();
          const prev: ConversationReEngagement =
            parsed ??
            ({
              state: "template_sent_awaiting_reply",
              lastTemplateName: tName,
              lastTemplateSentAt: sentIso,
              lastTemplateStatus: "sent",
            } as ConversationReEngagement);
          const hint = reEngagementUserHintFromMessageError({
            errorCode: snap.errorCode,
            errorMessage: snap.errorMessage,
          });
          repairs.push(
            this.updateConversation(conv.id, {
              reEngagement: buildReEngagementAfterMetaDeliveryFailure(prev, {
                errorCode: snap.errorCode,
                userHint: hint,
              }) as Conversation["reEngagement"],
            }).catch((err) => {
              console.error(
                `[RETARGET_RE_ENGAGEMENT_REPAIR] conversation=${conv.id} user=${userId}`,
                err instanceof Error ? err.message : err
              );
            })
          );
        }
      }

      out.push({
        conversationId: conv.id,
        contactId: contact.id,
        name: contact.name || "Unknown",
        avatar: contact.avatar ?? null,
        channel: conv.channel,
        displayHandle,
        whatsappPhone,
        windowExpiresAt: conv.windowExpiresAt ? new Date(conv.windowExpiresAt).toISOString() : null,
        lastMessagePreview: conv.lastMessagePreview ?? null,
        lastMessageAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : null,
        daysSinceLastMessage,
        ...reFields,
      });
    }

    if (repairs.length > 0) {
      await Promise.allSettled(repairs);
    }

    out.sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });

    return out.slice(0, limit);
  }

  // Drip Campaign methods
  async getDripCampaigns(userId: string): Promise<DripCampaign[]> {
    return await db.select().from(dripCampaigns)
      .where(eq(dripCampaigns.userId, userId))
      .orderBy(desc(dripCampaigns.createdAt));
  }

  async getDripCampaign(id: string): Promise<DripCampaign | undefined> {
    const result = await db.select().from(dripCampaigns).where(eq(dripCampaigns.id, id));
    return result[0];
  }

  async getActiveDripCampaigns(userId: string): Promise<DripCampaign[]> {
    return await db.select().from(dripCampaigns)
      .where(and(eq(dripCampaigns.userId, userId), eq(dripCampaigns.isActive, true)));
  }

  async createDripCampaign(campaign: InsertDripCampaign): Promise<DripCampaign> {
    const result = await db.insert(dripCampaigns).values(campaign).returning();
    return result[0];
  }

  async updateDripCampaign(id: string, updates: Partial<DripCampaign>): Promise<DripCampaign | undefined> {
    const result = await db.update(dripCampaigns).set({ ...updates, updatedAt: new Date() }).where(eq(dripCampaigns.id, id)).returning();
    return result[0];
  }

  async deleteDripCampaign(id: string): Promise<void> {
    await db.delete(dripCampaigns).where(eq(dripCampaigns.id, id));
  }

  // Drip Step methods
  async getDripSteps(campaignId: string): Promise<DripStep[]> {
    return await db.select().from(dripSteps)
      .where(eq(dripSteps.campaignId, campaignId))
      .orderBy(asc(dripSteps.stepOrder));
  }

  async getDripStep(id: string): Promise<DripStep | undefined> {
    const result = await db.select().from(dripSteps).where(eq(dripSteps.id, id));
    return result[0];
  }

  async createDripStep(step: InsertDripStep): Promise<DripStep> {
    const result = await db.insert(dripSteps).values(step).returning();
    return result[0];
  }

  async updateDripStep(id: string, updates: Partial<DripStep>): Promise<DripStep | undefined> {
    const result = await db.update(dripSteps).set(updates).where(eq(dripSteps.id, id)).returning();
    return result[0];
  }

  async deleteDripStep(id: string): Promise<void> {
    await db.delete(dripSteps).where(eq(dripSteps.id, id));
  }

  // Drip Enrollment methods
  async getDripEnrollments(campaignId: string): Promise<DripEnrollment[]> {
    return await db.select().from(dripEnrollments)
      .where(eq(dripEnrollments.campaignId, campaignId))
      .orderBy(desc(dripEnrollments.enrolledAt));
  }

  async getDripEnrollment(id: string): Promise<DripEnrollment | undefined> {
    const result = await db.select().from(dripEnrollments).where(eq(dripEnrollments.id, id));
    return result[0];
  }

  async getActiveEnrollmentForChat(chatId: string): Promise<DripEnrollment | undefined> {
    const result = await db.select().from(dripEnrollments)
      .where(and(eq(dripEnrollments.chatId, chatId), eq(dripEnrollments.status, "active")));
    return result[0];
  }

  async getDueEnrollments(): Promise<DripEnrollment[]> {
    const now = new Date();
    return await db.select().from(dripEnrollments)
      .where(and(
        eq(dripEnrollments.status, "active"),
        lte(dripEnrollments.nextSendAt, now)
      ));
  }

  async createDripEnrollment(enrollment: InsertDripEnrollment): Promise<DripEnrollment> {
    const result = await db.insert(dripEnrollments).values(enrollment).returning();
    return result[0];
  }

  async updateDripEnrollment(id: string, updates: Partial<DripEnrollment>): Promise<DripEnrollment | undefined> {
    const result = await db.update(dripEnrollments).set(updates).where(eq(dripEnrollments.id, id)).returning();
    return result[0];
  }

  async cancelDripEnrollment(id: string): Promise<void> {
    await db.update(dripEnrollments).set({ status: "cancelled" }).where(eq(dripEnrollments.id, id));
  }

  // Drip Send methods
  async createDripSend(send: InsertDripSend): Promise<DripSend> {
    const result = await db.insert(dripSends).values(send).returning();
    return result[0];
  }

  async getDripSends(enrollmentId: string): Promise<DripSend[]> {
    return await db.select().from(dripSends)
      .where(eq(dripSends.enrollmentId, enrollmentId))
      .orderBy(asc(dripSends.sentAt));
  }

  async updateDripSend(id: string, updates: Partial<DripSend>): Promise<DripSend | undefined> {
    const result = await db.update(dripSends).set(updates).where(eq(dripSends.id, id)).returning();
    return result[0];
  }

  // Stripe price lookup - queries the synced stripe.prices table
  async getPriceByAmount(amount: number): Promise<{ id: string; unit_amount: number } | null> {
    const result = await db.execute(
      sql`SELECT id, unit_amount FROM stripe.prices 
          WHERE unit_amount = ${amount} AND active = true 
          ORDER BY created DESC LIMIT 1`
    );
    return result.rows[0] as { id: string; unit_amount: number } | null;
  }

  // Get all active prices for debugging
  async getAllPrices(): Promise<{ id: string; unit_amount: number; active: boolean }[]> {
    const result = await db.execute(
      sql`SELECT id, unit_amount, active FROM stripe.prices ORDER BY unit_amount`
    );
    return result.rows as { id: string; unit_amount: number; active: boolean }[];
  }

  // Chatbot Flow methods
  async getChatbotFlows(userId: string): Promise<ChatbotFlow[]> {
    return await db.select().from(chatbotFlows)
      .where(eq(chatbotFlows.userId, userId))
      .orderBy(desc(chatbotFlows.createdAt));
  }

  async getChatbotFlow(id: string): Promise<ChatbotFlow | undefined> {
    const result = await db.select().from(chatbotFlows).where(eq(chatbotFlows.id, id));
    return result[0];
  }

  async getActiveChatbotFlows(userId: string): Promise<ChatbotFlow[]> {
    return await db.select().from(chatbotFlows)
      .where(and(eq(chatbotFlows.userId, userId), eq(chatbotFlows.isActive, true)));
  }

  async createChatbotFlow(flow: InsertChatbotFlow): Promise<ChatbotFlow> {
    const result = await db.insert(chatbotFlows).values(flow).returning();
    return result[0];
  }

  async updateChatbotFlow(id: string, updates: Partial<ChatbotFlow>): Promise<ChatbotFlow | undefined> {
    const result = await db.update(chatbotFlows)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chatbotFlows.id, id))
      .returning();
    return result[0];
  }

  async deleteChatbotFlow(id: string): Promise<void> {
    await db.delete(chatbotFlows).where(eq(chatbotFlows.id, id));
  }

  async incrementChatbotFlowExecution(id: string): Promise<void> {
    await db.update(chatbotFlows)
      .set({ 
        executionCount: sql`${chatbotFlows.executionCount} + 1`,
        lastExecutedAt: new Date()
      })
      .where(eq(chatbotFlows.id, id));
  }

  // Chatbot Session methods
  async getChatbotSession(chatId: string): Promise<ChatbotSession | undefined> {
    const result = await db.select().from(chatbotSessions)
      .where(and(eq(chatbotSessions.chatId, chatId), eq(chatbotSessions.status, 'active')));
    return result[0];
  }

  async createChatbotSession(session: InsertChatbotSession): Promise<ChatbotSession> {
    const result = await db.insert(chatbotSessions).values(session).returning();
    return result[0];
  }

  async updateChatbotSession(id: string, updates: Partial<ChatbotSession>): Promise<ChatbotSession | undefined> {
    const result = await db.update(chatbotSessions)
      .set(updates)
      .where(eq(chatbotSessions.id, id))
      .returning();
    return result[0];
  }

  async deleteChatbotSession(id: string): Promise<void> {
    await db.delete(chatbotSessions).where(eq(chatbotSessions.id, id));
  }

  // Salesperson methods
  async getSalespeople(): Promise<Salesperson[]> {
    return await db.select().from(salespeople).orderBy(desc(salespeople.createdAt));
  }

  async getActiveSalespeople(): Promise<Salesperson[]> {
    return await db.select().from(salespeople)
      .where(eq(salespeople.isActive, true))
      .orderBy(desc(salespeople.createdAt));
  }

  async getSalesperson(id: string): Promise<Salesperson | undefined> {
    const result = await db.select().from(salespeople).where(eq(salespeople.id, id));
    return result[0];
  }

  async getSalespersonByLoginCode(loginCode: string): Promise<Salesperson | undefined> {
    const result = await db.select().from(salespeople).where(eq(salespeople.loginCode, loginCode));
    return result[0];
  }

  async getSalespersonByEmailAndCode(email: string, loginCode: string): Promise<Salesperson | undefined> {
    const result = await db.select().from(salespeople)
      .where(and(eq(salespeople.email, email), eq(salespeople.loginCode, loginCode)));
    return result[0];
  }

  async getSalespersonByEmail(email: string): Promise<Salesperson | undefined> {
    const result = await db.select().from(salespeople).where(eq(salespeople.email, email));
    return result[0];
  }

  async generateUniqueLoginCode(): Promise<string> {
    let code: string;
    let exists = true;
    while (exists) {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      const existing = await this.getSalespersonByLoginCode(code);
      exists = !!existing;
    }
    return code!;
  }

  async createSalesperson(person: InsertSalesperson & { loginCode: string }): Promise<Salesperson> {
    const result = await db.insert(salespeople).values(person).returning();
    return result[0];
  }

  async findMatchingDemoBooking(name: string, email: string, phone: string): Promise<DemoBooking | undefined> {
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedName = name.toLowerCase().trim();
    const normalizedPhone = phone.replace(/\D/g, '');

    const recentBookings = await db.select().from(demoBookings)
      .where(and(
        eq(demoBookings.status, 'completed'),
        sql`${demoBookings.createdAt} > NOW() - INTERVAL '90 days'`
      ))
      .orderBy(desc(demoBookings.createdAt));

    for (const booking of recentBookings) {
      let matchCount = 0;
      
      if (booking.visitorEmail.toLowerCase().trim() === normalizedEmail) matchCount++;
      if (booking.visitorName.toLowerCase().trim() === normalizedName || 
          booking.visitorName.toLowerCase().includes(normalizedName) ||
          normalizedName.includes(booking.visitorName.toLowerCase())) matchCount++;
      if (booking.visitorPhone.replace(/\D/g, '') === normalizedPhone) matchCount++;
      
      if (matchCount >= 2) {
        return booking;
      }
    }
    return undefined;
  }

  async updateSalesperson(id: string, updates: Partial<Salesperson>): Promise<Salesperson | undefined> {
    const result = await db.update(salespeople)
      .set(updates)
      .where(eq(salespeople.id, id))
      .returning();
    return result[0];
  }

  async deleteSalesperson(id: string): Promise<void> {
    await db.delete(salespeople).where(eq(salespeople.id, id));
  }

  // Demo Booking methods
  async getDemoBookings(): Promise<DemoBooking[]> {
    return readDemoBookings();
  }

  async getDemoBookingsBySalesperson(salespersonId: string): Promise<DemoBooking[]> {
    return readDemoBookings({ salespersonId });
  }

  async getDemoBooking(id: string): Promise<DemoBooking | undefined> {
    const rows = await readDemoBookings({ id });
    return rows[0];
  }

  async getDemoBookingByEmail(email: string): Promise<DemoBooking | undefined> {
    const rows = await readDemoBookings({ email });
    return rows[0];
  }

  async createDemoBooking(booking: InsertDemoBooking): Promise<DemoBooking> {
    const now = new Date();
    const skipBookingCount = booking.status === "awaiting_schedule";
    try {
      const result = await db.insert(demoBookings).values({
        ...booking,
        status: booking.status || "pending_acceptance",
        assignedAt: booking.assignedAt ?? now,
        source: booking.source || "web",
      }).returning();
      if (!skipBookingCount && booking.salespersonId) {
        await db.update(salespeople)
          .set({ totalBookings: sql`${salespeople.totalBookings} + 1` })
          .where(eq(salespeople.id, booking.salespersonId!));
      }
      return mapDemoBookingRow(result[0] as Record<string, unknown>);
    } catch (error: unknown) {
      if (!isDemoBookingsSchemaMismatchError(error)) throw error;
      const rows = await db.execute(sql`
        INSERT INTO demo_bookings (
          salesperson_id, visitor_name, visitor_email, visitor_phone,
          scheduled_date, consent_given, status, notes
        )
        VALUES (
          ${booking.salespersonId}, ${booking.visitorName}, ${booking.visitorEmail},
          ${booking.visitorPhone}, ${booking.scheduledDate}, ${booking.consentGiven ?? true},
          ${booking.status || "pending_acceptance"}, ${booking.notes || null}
        )
        RETURNING id, salesperson_id, visitor_name, visitor_email, visitor_phone,
                  scheduled_date, consent_given, status, notes, created_at
      `);
      if (!skipBookingCount && booking.salespersonId) {
        await db.update(salespeople)
          .set({ totalBookings: sql`${salespeople.totalBookings} + 1` })
          .where(eq(salespeople.id, booking.salespersonId!));
      }
      return mapDemoBookingRow({
        ...(rows.rows[0] as Record<string, unknown>),
        source: booking.source || "web",
      });
    }
  }

  async updateDemoBooking(id: string, updates: Partial<DemoBooking>): Promise<DemoBooking | undefined> {
    return writeDemoBookingUpdate(id, updates);
  }

  // Sales Conversion methods
  async getSalesConversions(): Promise<SalesConversion[]> {
    try {
      return await db.select().from(salesConversions).orderBy(desc(salesConversions.createdAt));
    } catch (error) {
      if (!isSalesConversionsSchemaMismatchError(error)) throw error;
      console.warn("[Storage] sales_conversions schema mismatch; using legacy column select");
      return fetchSalesConversionsLegacy();
    }
  }

  async getSalesConversionsBySalesperson(salespersonId: string): Promise<SalesConversion[]> {
    try {
      return await db
        .select()
        .from(salesConversions)
        .where(eq(salesConversions.salespersonId, salespersonId))
        .orderBy(desc(salesConversions.createdAt));
    } catch (error) {
      if (!isSalesConversionsSchemaMismatchError(error)) throw error;
      console.warn("[Storage] sales_conversions schema mismatch; using legacy column select");
      return fetchSalesConversionsLegacy(salespersonId);
    }
  }

  async createSalesConversion(conversion: InsertSalesConversion): Promise<SalesConversion> {
    const payoutAmount = parseFloat(String(conversion.amount ?? 0));
    const creditEarnings =
      conversion.payoutEligible !== false && !Number.isNaN(payoutAmount) && payoutAmount > 0
        ? payoutAmount
        : 0;
    const result = await db.insert(salesConversions).values({
      ...conversion,
      conversionDate: conversion.conversionDate ?? new Date(),
    }).returning();
    if (creditEarnings > 0) {
      await db.update(salespeople)
        .set({
          totalConversions: sql`${salespeople.totalConversions} + 1`,
          totalEarnings: sql`${salespeople.totalEarnings} + ${creditEarnings}`,
        })
        .where(eq(salespeople.id, conversion.salespersonId));
    }
    await db.update(demoBookings)
      .set({ status: "converted" })
      .where(eq(demoBookings.id, conversion.bookingId));
    return result[0];
  }

  async markConversionPaid(id: string): Promise<SalesConversion | undefined> {
    const result = await db.update(salesConversions)
      .set({ paid: true, paidAt: new Date() })
      .where(eq(salesConversions.id, id))
      .returning();
    return result[0];
  }

  async getSalesConversionByUserId(userId: string): Promise<SalesConversion | undefined> {
    try {
      const result = await db.select().from(salesConversions).where(eq(salesConversions.userId, userId));
      return result[0];
    } catch (error) {
      if (!isSalesConversionsSchemaMismatchError(error)) throw error;
      const rows = await fetchSalesConversionsLegacy();
      return rows.find((c) => c.userId === userId);
    }
  }

  async addConversionRevenue(userId: string, amount: number): Promise<void> {
    await db.update(salesConversions)
      .set({ 
        totalRevenue: sql`COALESCE(${salesConversions.totalRevenue}, 0) + ${amount}`
      })
      .where(eq(salesConversions.userId, userId));
  }

  async getConversionROIStats(): Promise<{ totalCost: number; totalRevenue: number; roi: number }> {
    const conversions = await this.getSalesConversions();
    const totalCost = conversions.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);
    const totalRevenue = conversions.reduce((sum, c) => sum + parseFloat(c.totalRevenue || '0'), 0);
    const roi = totalCost > 0 ? ((totalRevenue / totalCost) * 100) : 0;
    return { totalCost, totalRevenue, roi };
  }

  // Admin settings methods
  async getAdminPasswordHash(): Promise<string | undefined> {
    const result = await db.select().from(adminSettings).where(eq(adminSettings.id, 'admin'));
    return result[0]?.passwordHash;
  }

  async setAdminPassword(passwordHash: string): Promise<void> {
    await db.insert(adminSettings)
      .values({ id: 'admin', passwordHash, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: adminSettings.id,
        set: { passwordHash, updatedAt: new Date() }
      });
  }

  // ============= MULTI-CHANNEL CRM IMPLEMENTATION =============

  // Contact methods
  async getContacts(userId: string, limit: number = 1000): Promise<Contact[]> {
    return await db.select().from(contacts)
      .where(eq(contacts.userId, userId))
      .orderBy(desc(contacts.updatedAt))
      .limit(limit);
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const result = await db.select().from(contacts).where(eq(contacts.id, id));
    return result[0];
  }

  async getContactByChannelId(userId: string, channel: Channel, channelId: string): Promise<Contact | undefined> {
    let whereClause;
    switch (channel) {
      case 'whatsapp': {
        // Normalise the incoming channelId so "+923..." and "923..." are treated identically
        const digits = channelId.replace(/\D/g, '');
        const withPlus = `+${digits}`;

        // Primary lookup: check all normalised forms of whatsappId so a stored "+923..."
        // is found when an inbound arrives as "923..." and vice-versa.
        const primary = await db.select().from(contacts).where(
          and(
            eq(contacts.userId, userId),
            or(
              eq(contacts.whatsappId, digits),
              eq(contacts.whatsappId, withPlus),
              eq(contacts.whatsappId, channelId),
            )
          )
        ).orderBy(asc(contacts.createdAt)).limit(1);
        if (primary[0]) return primary[0];

        // Fallback: phone number match for manually-created contacts whose
        // whatsappId was never set. Returns the oldest matching contact deterministically.
        const phoneFallback = await db.select().from(contacts).where(
          and(
            eq(contacts.userId, userId),
            or(
              eq(contacts.phone, digits),
              eq(contacts.phone, withPlus),
              eq(contacts.phone, channelId),
            )
          )
        ).orderBy(asc(contacts.createdAt)).limit(1);
        return phoneFallback[0];
      }
      case 'instagram':
        whereClause = and(eq(contacts.userId, userId), eq(contacts.instagramId, channelId));
        break;
      case 'facebook':
        whereClause = and(eq(contacts.userId, userId), eq(contacts.facebookId, channelId));
        break;
      case 'telegram':
        whereClause = and(eq(contacts.userId, userId), eq(contacts.telegramId, channelId));
        break;
      case 'calendly': {
        const em = channelId.trim().toLowerCase();
        const r = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.userId, userId),
              sql`lower(trim(${contacts.email})) = ${em}`,
            ),
          )
          .orderBy(asc(contacts.createdAt))
          .limit(1);
        return r[0];
      }
      case 'email': {
        const em = channelId.trim().toLowerCase();
        const r = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.userId, userId),
              sql`lower(trim(${contacts.email})) = ${em}`,
            ),
          )
          .orderBy(asc(contacts.createdAt))
          .limit(1);
        return r[0];
      }
      case 'webchat': {
        const byPhone = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.userId, userId), eq(contacts.phone, channelId)))
          .orderBy(asc(contacts.createdAt))
          .limit(1);
        if (byPhone[0]) return byPhone[0];

        const byVisitor = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.userId, userId),
              sql`${contacts.customFields}->>'webchatVisitorId' = ${channelId}`,
            ),
          )
          .orderBy(asc(contacts.createdAt))
          .limit(1);
        return byVisitor[0];
      }
      default:
        whereClause = and(eq(contacts.userId, userId), eq(contacts.phone, channelId));
    }
    const result = await db.select().from(contacts).where(whereClause);
    return result[0];
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const result = await db.insert(contacts).values(contact).returning();
    return result[0];
  }

  private logBuyerPreferenceDbWrite(
    event: string,
    contactId: string,
    payload: Record<string, unknown>,
  ): void {
    if (process.env.DEBUG_BUYER_PREFS !== "1") {
      return;
    }
    console.log(
      JSON.stringify({
        tag: "[BuyerPreference:DB]",
        event,
        contactId,
        ...payload,
      }),
    );
  }

  private buyerPreferenceProfileFieldKeys(profile: unknown): string[] {
    if (!profile || typeof profile !== "object") return [];
    return Object.keys(profile as Record<string, unknown>).filter(
      (k) => !["schemaVersion", "profileStatus", "lastExtractedAt", "lastInboundAt"].includes(k),
    );
  }

  /**
   * Dedicated write for contacts.buyer_preference_profile — avoids silent drops from generic partial updates.
   */
  async updateContactBuyerPreferenceProfile(
    contactId: string,
    profile: Record<string, unknown>,
    options?: UpdateContactOptions,
  ): Promise<Contact | undefined> {
    const profileJson = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;
    const before = await this.getContact(contactId);

    this.logBuyerPreferenceDbWrite("update_input", contactId, {
      hasBefore: !!before,
      inputFieldKeys: this.buyerPreferenceProfileFieldKeys(profileJson),
      inputBytes: JSON.stringify(profileJson).length,
      column: "buyer_preference_profile",
      drizzleKey: "buyerPreferenceProfile",
    });

    let after: Contact | undefined;
    try {
      const result = await db
        .update(contacts)
        .set({
          buyerPreferenceProfile: profileJson,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, contactId))
        .returning();

      after = result[0];

      this.logBuyerPreferenceDbWrite("drizzle_returning", contactId, {
        rowCount: result.length,
        returnedFieldKeys: after
          ? this.buyerPreferenceProfileFieldKeys(after.buyerPreferenceProfile)
          : [],
        returnedProfileStatus:
          after?.buyerPreferenceProfile &&
          typeof after.buyerPreferenceProfile === "object" &&
          "profileStatus" in (after.buyerPreferenceProfile as object)
            ? (after.buyerPreferenceProfile as { profileStatus?: string }).profileStatus
            : undefined,
      });
    } catch (err) {
      const pgCode = (err as { code?: string })?.code;
      this.logBuyerPreferenceDbWrite("drizzle_update_error", contactId, {
        error: err instanceof Error ? err.message : String(err),
        pgCode,
        hint:
          pgCode === "42703"
            ? "Column buyer_preference_profile missing — run migrations/0030_contacts_buyer_preference_profile.sql"
            : undefined,
      });
      throw err;
    }

    if (!after) {
      this.logBuyerPreferenceDbWrite("update_no_row", contactId, {});
      return undefined;
    }

    // Verify persisted value with a targeted read (catches driver/schema mapping issues).
    const verify = await db
      .select({ buyerPreferenceProfile: contacts.buyerPreferenceProfile })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    const verified = verify[0]?.buyerPreferenceProfile;
    this.logBuyerPreferenceDbWrite("verify_select", contactId, {
      verifiedFieldKeys: this.buyerPreferenceProfileFieldKeys(verified),
      verifiedBytes: verified ? JSON.stringify(verified).length : 0,
    });

    if (before && !options?.skipAutomationHooks) {
      try {
        const { dispatchAutomationContactDiff } = await import("./automationEventDispatcher");
        await dispatchAutomationContactDiff({
          userId: before.userId,
          before,
          after,
        });
      } catch (e) {
        console.warn("[updateContactBuyerPreferenceProfile] automation dispatch error:", (e as Error)?.message || e);
      }
    }

    return after;
  }

  async updateContactSellerPreferenceProfile(
    contactId: string,
    profile: Record<string, unknown>,
    _options?: UpdateContactOptions,
  ): Promise<Contact | undefined> {
    const profileJson = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;
    const result = await db
      .update(contacts)
      .set({
        sellerPreferenceProfile: profileJson,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contactId))
      .returning();
    return result[0];
  }

  async updateContact(
    id: string,
    updates: Partial<Contact>,
    options?: UpdateContactOptions
  ): Promise<Contact | undefined> {
    const hasBuyerPref = Object.prototype.hasOwnProperty.call(updates, "buyerPreferenceProfile");

    if (hasBuyerPref) {
      this.logBuyerPreferenceDbWrite("updateContact_delegating", id, {
        inputFieldKeys: this.buyerPreferenceProfileFieldKeys(updates.buyerPreferenceProfile),
        note: "routing to updateContactBuyerPreferenceProfile",
      });
      const { buyerPreferenceProfile, ...rest } = updates;
      let contact: Contact | undefined;
      if (buyerPreferenceProfile != null && typeof buyerPreferenceProfile === "object") {
        contact = await this.updateContactBuyerPreferenceProfile(
          id,
          buyerPreferenceProfile as Record<string, unknown>,
          { skipAutomationHooks: true },
        );
      }
      const otherKeys = Object.keys(rest).filter((k) => k !== "updatedAt");
      if (otherKeys.length === 0) {
        return contact;
      }
      return this.updateContact(id, rest, options);
    }

    const before = await this.getContact(id);
    if (!before) {
      const result = await db.update(contacts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(contacts.id, id))
        .returning();
      return result[0];
    }

    const result = await db.update(contacts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    const after = result[0];
    if (!after) return undefined;

    if (!options?.skipAutomationHooks) {
      try {
        const { dispatchAutomationContactDiff } = await import("./automationEventDispatcher");
        await dispatchAutomationContactDiff({
          userId: before.userId,
          before,
          after,
        });
      } catch (e) {
        console.warn("[updateContact] automation dispatch error:", (e as Error)?.message || e);
      }
    }

    return after;
  }

  async deleteContact(id: string): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  /**
   * Merge `sourceId` into `targetId`.
   * - All conversations, messages, and activity events are re-parented to target.
   * - Any channel IDs (whatsappId, instagramId, etc.) present on source but
   *   missing from target are copied over.
   * - Source contact is then deleted.
   * Returns the updated target contact.
   */
  async mergeContacts(targetId: string, sourceId: string): Promise<Contact> {
    const [target, source] = await Promise.all([
      this.getContact(targetId),
      this.getContact(sourceId),
    ]);
    if (!target) throw new Error(`Target contact ${targetId} not found`);
    if (!source) throw new Error(`Source contact ${sourceId} not found`);
    if (target.userId !== source.userId) throw new Error('Contacts belong to different users');

    await db.transaction(async (tx) => {
      // Re-parent conversations
      await tx.update(conversations)
        .set({ contactId: targetId })
        .where(eq(conversations.contactId, sourceId));

      // Re-parent messages
      await tx.update(messages)
        .set({ contactId: targetId })
        .where(eq(messages.contactId, sourceId));

      // Re-parent activity events
      await tx.update(activityEvents)
        .set({ contactId: targetId })
        .where(eq(activityEvents.contactId, sourceId));

      // Backfill missing channel IDs from source onto target
      const channelUpdates: Partial<Contact> = {};
      if (!target.whatsappId && source.whatsappId)   channelUpdates.whatsappId   = source.whatsappId;
      if (!target.instagramId && source.instagramId) channelUpdates.instagramId  = source.instagramId;
      if (!target.facebookId && source.facebookId)   channelUpdates.facebookId   = source.facebookId;
      if (!target.telegramId && source.telegramId)   channelUpdates.telegramId   = source.telegramId;
      if (!target.phone && source.phone)             channelUpdates.phone        = source.phone;
      if (!target.email && source.email)             channelUpdates.email        = source.email;
      if (Object.keys(channelUpdates).length > 0) {
        await tx.update(contacts)
          .set({ ...channelUpdates, updatedAt: new Date() })
          .where(eq(contacts.id, targetId));
      }

      // Delete the source contact (cascades messages/convs that weren't re-parented,
      // but we've already moved them all above)
      await tx.delete(contacts).where(eq(contacts.id, sourceId));
    });

    const updated = await this.getContact(targetId);
    return updated!;
  }

  async searchContacts(userId: string, query: string, limit: number = 50): Promise<Contact[]> {
    const searchPattern = `%${query}%`;
    return await db.select().from(contacts)
      .where(and(
        eq(contacts.userId, userId),
        or(
          ilike(contacts.name, searchPattern),
          ilike(contacts.email, searchPattern),
          ilike(contacts.phone, searchPattern),
          ilike(contacts.notes, searchPattern)
        )
      ))
      .orderBy(desc(contacts.updatedAt))
      .limit(limit);
  }

  async getContactNotes(workspaceId: string, contactId: string): Promise<ContactNote[]> {
    return await db.select().from(contactNotes)
      .where(and(
        eq(contactNotes.workspaceId, workspaceId),
        eq(contactNotes.contactId, contactId)
      ))
      .orderBy(desc(contactNotes.createdAt));
  }

  async addContactNote(data: InsertContactNote): Promise<ContactNote> {
    const [note] = await db.insert(contactNotes).values(data).returning();
    return note;
  }

  async getContactNoteById(noteId: string): Promise<ContactNote | undefined> {
    const [note] = await db.select().from(contactNotes).where(eq(contactNotes.id, noteId));
    return note;
  }

  async updateContactNote(noteId: string, content: string): Promise<ContactNote | undefined> {
    const [note] = await db.update(contactNotes).set({ content }).where(eq(contactNotes.id, noteId)).returning();
    return note;
  }

  async deleteContactNote(noteId: string): Promise<boolean> {
    const result = await db.delete(contactNotes).where(eq(contactNotes.id, noteId)).returning();
    return result.length > 0;
  }

  async createAppointment(data: InsertAppointment): Promise<Appointment> {
    const [appt] = await db.insert(appointments).values(data).returning();
    return appt;
  }

  async getAppointmentsByUser(userId: string): Promise<Appointment[]> {
    return await db.select().from(appointments)
      .where(eq(appointments.userId, userId))
      .orderBy(asc(appointments.appointmentDate));
  }

  async getAppointmentsByContact(userId: string, contactId: string): Promise<Appointment[]> {
    return await db.select().from(appointments)
      .where(and(eq(appointments.userId, userId), eq(appointments.contactId, contactId)))
      .orderBy(asc(appointments.appointmentDate));
  }

  async getAppointmentById(id: string): Promise<Appointment | undefined> {
    const rows = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    return rows[0];
  }

  async getAppointmentByCalendlyScheduledEventUri(
    userId: string,
    calendlyScheduledEventUri: string
  ): Promise<Appointment | undefined> {
    const uri = calendlyScheduledEventUri.trim();
    if (!uri) return undefined;
    const r = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.userId, userId), eq(appointments.calendlyScheduledEventUri, uri)))
      .limit(1);
    return r[0];
  }

  async recordCalendlyCanceledEventTombstone(
    data: InsertCalendlyCanceledEventTombstone,
  ): Promise<boolean> {
    const scheduledEventUri = String(data.scheduledEventUri || "").trim();
    if (!scheduledEventUri) return false;
    const rows = await db
      .insert(calendlyCanceledEventTombstones)
      .values({
        ...data,
        scheduledEventUri,
        inviteeUri: data.inviteeUri ? String(data.inviteeUri).trim() : null,
      })
      .onConflictDoNothing({
        target: [calendlyCanceledEventTombstones.userId, calendlyCanceledEventTombstones.scheduledEventUri],
      })
      .returning({ id: calendlyCanceledEventTombstones.id });
    return rows.length > 0;
  }

  async deleteAppointment(id: string): Promise<boolean> {
    const result = await db.delete(appointments).where(eq(appointments.id, id)).returning();
    return result.length > 0;
  }

  // Conversation methods
  async getConversations(userId: string, limit: number = 1000): Promise<Conversation[]> {
    return await db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit);
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const result = await db.select().from(conversations).where(eq(conversations.id, id));
    return result[0];
  }

  async getConversationByContactAndChannel(contactId: string, channel: Channel, channelAccountId?: string): Promise<Conversation | undefined> {
    if (!channelAccountId) {
      // Single-number or non-WhatsApp path: backward-compatible lookup
      const result = await db.select().from(conversations)
        .where(and(
          eq(conversations.contactId, contactId),
          eq(conversations.channel, channel)
        ));
      return result[0];
    }

    // Multi-number path: prefer exact channelAccountId match, fall back to NULL (pre-fix conversations)
    const result = await db.select().from(conversations)
      .where(and(
        eq(conversations.contactId, contactId),
        eq(conversations.channel, channel),
        or(
          eq(conversations.channelAccountId, channelAccountId),
          isNull(conversations.channelAccountId)
        )
      ))
      .orderBy(sql`CASE WHEN channel_account_id = ${channelAccountId} THEN 0 ELSE 1 END`)
      .limit(1);

    if (!result[0]) return undefined;

    // Backfill channelAccountId on old conversations so subsequent lookups are isolated
    if (!result[0].channelAccountId) {
      await db.update(conversations)
        .set({ channelAccountId })
        .where(eq(conversations.id, result[0].id));
      result[0] = { ...result[0], channelAccountId };
      console.log(`[MultiNumber] Backfilled channelAccountId=${channelAccountId} on conversation ${result[0].id}`);
    }

    return result[0];
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const result = await db.insert(conversations).values(conversation).returning();
    return result[0];
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined> {
    const result = await db.update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return result[0];
  }

  async deleteConversation(id: string): Promise<void> {
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  // Message methods
  async getMessages(conversationId: string, limit: number = 100, offset: number = 0): Promise<Message[]> {
    // IMPORTANT:
    // - Most UIs want the most recent N messages, rendered oldest→newest.
    // - If we `orderBy asc(createdAt) limit N`, we'd return the OLDEST messages,
    //   which makes the conversation open at history instead of latest.
    // Strategy: fetch newest N with DESC, then reverse to ASC for display.
    const t0 = Date.now();
    try {
      const lim = Number.isFinite(limit) ? Number(limit) : 100;
      const off = Number.isFinite(offset) ? Number(offset) : 0;
      const safeLimit = Math.min(Math.max(1, lim), 500);
      const safeOffset = Math.max(0, off);
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(safeLimit)
        .offset(safeOffset);
      const out = rows.reverse();
      if (process.env.NODE_ENV !== "production") {
        console.log("[storage.getMessages] ok", {
          conversationId,
          rowCount: out.length,
          ms: Date.now() - t0,
        });
      }
      return out;
    } catch (error) {
      console.error("[storage.getMessages] DB error", {
        conversationId,
        ms: Date.now() - t0,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const result = await db.select().from(messages).where(eq(messages.id, id));
    return result[0];
  }

  async getMessageByExternalId(externalMessageId: string): Promise<Message | undefined> {
    const result = await db.select().from(messages)
      .where(eq(messages.externalMessageId, externalMessageId))
      .limit(1);
    return result[0];
  }

  async getMessageByUserExternalId(userId: string, externalMessageId: string): Promise<Message | undefined> {
    const result = await db.select().from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.externalMessageId, externalMessageId)))
      .limit(1);
    return result[0];
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(message).returning();
    return result[0];
  }

  async updateMessage(id: string, updates: Partial<Message>): Promise<Message | undefined> {
    const result = await db.update(messages)
      .set(updates)
      .where(eq(messages.id, id))
      .returning();
    return result[0];
  }

  // Unified inbox methods
  async getUnifiedInbox(userId: string, limit: number = 100): Promise<InboxItem[]> {
    const userContacts = await db.select().from(contacts)
      .where(eq(contacts.userId, userId))
      .orderBy(desc(contacts.updatedAt))
      .limit(limit);

    const inboxItems: InboxItem[] = [];
    
    for (const contact of userContacts) {
      const convs = await db.select().from(conversations)
        .where(eq(conversations.contactId, contact.id))
        .orderBy(desc(conversations.lastMessageAt));
      
      const primaryConv = convs[0];
      if (primaryConv) {
        inboxItems.push({
          contact,
          conversation: primaryConv,
          channel: (contact.primaryChannelOverride || contact.primaryChannel) as Channel,
          lastMessage: primaryConv.lastMessagePreview || '',
          lastMessageAt: primaryConv.lastMessageAt,
          unreadCount: convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
        });
      } else {
        inboxItems.push({
          contact,
          conversation: null as any,
          channel: (contact.primaryChannelOverride || contact.primaryChannel) as Channel,
          lastMessage: '',
          lastMessageAt: null,
          unreadCount: 0,
        });
      }
    }

    return inboxItems.sort((a, b) => {
      const aTime = a.lastMessageAt?.getTime() || 0;
      const bTime = b.lastMessageAt?.getTime() || 0;
      return bTime - aTime;
    });
  }

  async getContactWithConversations(contactId: string): Promise<{ contact: Contact; conversations: Conversation[] } | undefined> {
    const contact = await this.getContact(contactId);
    if (!contact) return undefined;

    const convs = await db.select().from(conversations)
      .where(eq(conversations.contactId, contactId))
      .orderBy(desc(conversations.lastMessageAt));

    return { contact, conversations: convs };
  }

  // Activity event methods
  async getActivityEvents(contactId: string, limit: number = 100): Promise<ActivityEvent[]> {
    return await db.select().from(activityEvents)
      .where(eq(activityEvents.contactId, contactId))
      .orderBy(desc(activityEvents.createdAt))
      .limit(limit);
  }

  async createActivityEvent(event: InsertActivityEvent): Promise<ActivityEvent> {
    const result = await db.insert(activityEvents).values(event).returning();
    return result[0];
  }

  // Channel settings methods
  async getChannelSettings(userId: string): Promise<ChannelSetting[]> {
    return await db.select().from(channelSettings)
      .where(eq(channelSettings.userId, userId));
  }

  async getChannelSetting(userId: string, channel: Channel): Promise<ChannelSetting | undefined> {
    const result = await db.select().from(channelSettings)
      .where(and(
        eq(channelSettings.userId, userId),
        eq(channelSettings.channel, channel)
      ));
    return result[0];
  }

  async upsertChannelSetting(userId: string, channel: Channel, updates: Partial<ChannelSetting>): Promise<ChannelSetting> {
    const existing = await this.getChannelSetting(userId, channel);
    
    if (existing) {
      const result = await db.update(channelSettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(channelSettings.id, existing.id))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(channelSettings)
        .values({
          userId,
          channel,
          ...updates
        })
        .returning();
      return result[0];
    }
  }

  // Admin: Get all users
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  // Support ticket methods
  async getSupportTickets(): Promise<SupportTicket[]> {
    return await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
  }

  async getSupportTicket(id: string): Promise<SupportTicket | undefined> {
    const result = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    return result[0];
  }

  async getSupportTicketsByUser(userId: string): Promise<SupportTicket[]> {
    return await db.select().from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.createdAt));
  }

  async getOpenSupportTicketsByEmail(email: string): Promise<SupportTicket[]> {
    return await db.select().from(supportTickets)
      .where(and(
        eq(supportTickets.userEmail, email),
        or(eq(supportTickets.status, 'open'), eq(supportTickets.status, 'in_progress'))
      ))
      .orderBy(desc(supportTickets.createdAt));
  }

  async createSupportTicket(ticket: InsertSupportTicket): Promise<SupportTicket> {
    const result = await db.insert(supportTickets).values(ticket).returning();
    return result[0];
  }

  async updateSupportTicket(id: string, updates: Partial<SupportTicket>): Promise<SupportTicket | undefined> {
    const result = await db.update(supportTickets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    return result[0];
  }

  async deleteSupportTicket(id: string): Promise<void> {
    await db.delete(supportTickets).where(eq(supportTickets.id, id));
  }

  // ============= PARTNER PORTAL METHODS =============

  // Partner methods
  async getPartners(): Promise<Partner[]> {
    // Exclude deleted partners from admin list
    return await db.select().from(partners)
      .where(sql`${partners.status} != 'deleted'`)
      .orderBy(desc(partners.createdAt));
  }

  async getActivePartners(): Promise<Partner[]> {
    return await db.select().from(partners)
      .where(eq(partners.status, 'active'))
      .orderBy(desc(partners.createdAt));
  }

  async getPartner(id: string): Promise<Partner | undefined> {
    const result = await db.select().from(partners).where(eq(partners.id, id));
    return result[0];
  }

  async getPartnerByEmail(email: string): Promise<Partner | undefined> {
    const result = await db.select().from(partners).where(eq(partners.email, email.toLowerCase()));
    return result[0];
  }

  async getPartnerByRefCode(refCode: string): Promise<Partner | undefined> {
    const result = await db.select().from(partners).where(eq(partners.refCode, refCode.toUpperCase()));
    return result[0];
  }

  async generateUniqueRefCode(): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string | null = null;
    let exists = true;
    while (exists) {
      code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await this.getPartnerByRefCode(code);
      exists = !!existing;
    }
    return code!;
  }

  async createPartner(partner: InsertPartner & { refCode: string }): Promise<Partner> {
    const result = await db.insert(partners).values({
      ...partner,
      email: partner.email.toLowerCase(),
      refCode: partner.refCode.toUpperCase()
    }).returning();
    return result[0];
  }

  async updatePartner(id: string, updates: Partial<Partner>): Promise<Partner | undefined> {
    const result = await db.update(partners)
      .set(updates)
      .where(eq(partners.id, id))
      .returning();
    return result[0];
  }

  async deletePartner(id: string): Promise<void> {
    // Soft delete - mark as deleted instead of removing
    // This preserves commission history and accounting integrity
    await db.update(partners)
      .set({ status: 'deleted' })
      .where(eq(partners.id, id));
  }

  async incrementPartnerReferrals(partnerId: string): Promise<void> {
    await db.update(partners)
      .set({ totalReferrals: sql`${partners.totalReferrals} + 1` })
      .where(eq(partners.id, partnerId));
  }

  async addPartnerEarnings(partnerId: string, amount: number): Promise<void> {
    await db.update(partners)
      .set({ totalEarnings: sql`COALESCE(${partners.totalEarnings}, 0) + ${amount}` })
      .where(eq(partners.id, partnerId));
  }

  // Get users referred by a partner
  async getUsersByPartnerId(partnerId: string): Promise<User[]> {
    return await db.select().from(users)
      .where(eq(users.partnerId, partnerId))
      .orderBy(desc(users.createdAt));
  }

  // Assign partner to user (first-touch wins, cannot be overwritten)
  async assignPartnerToUser(userId: string, partnerId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;
    if (user.partnerId) return false; // Already assigned, first-touch wins
    
    await db.update(users)
      .set({ 
        partnerId, 
        partnerAssignedAt: new Date() 
      })
      .where(and(
        eq(users.id, userId),
        sql`${users.partnerId} IS NULL` // Double-check to prevent race conditions
      ));
    return true;
  }

  // Commission methods
  async getCommissions(filters?: { partnerId?: string; salespersonId?: string; userId?: string; status?: string }): Promise<Commission[]> {
    let query = db.select().from(commissions);
    const conditions = [];
    
    if (filters?.partnerId) {
      conditions.push(eq(commissions.partnerId, filters.partnerId));
    }
    if (filters?.salespersonId) {
      conditions.push(eq(commissions.salespersonId, filters.salespersonId));
    }
    if (filters?.userId) {
      conditions.push(eq(commissions.userId, filters.userId));
    }
    if (filters?.status) {
      conditions.push(eq(commissions.status, filters.status));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query.orderBy(desc(commissions.createdAt));
  }

  async getCommission(id: string): Promise<Commission | undefined> {
    const result = await db.select().from(commissions).where(eq(commissions.id, id));
    return result[0];
  }

  async createCommission(commission: InsertCommission): Promise<Commission> {
    const result = await db.insert(commissions).values(commission).returning();
    
    // Update partner's total earnings if applicable
    if (commission.partnerId) {
      await this.addPartnerEarnings(commission.partnerId, parseFloat(commission.amount));
    }
    
    // Update salesperson's total earnings if applicable
    if (commission.salespersonId) {
      await db.update(salespeople)
        .set({ totalEarnings: sql`COALESCE(${salespeople.totalEarnings}, 0) + ${commission.amount}` })
        .where(eq(salespeople.id, commission.salespersonId));
    }
    
    return result[0];
  }

  async updateCommission(id: string, updates: Partial<Commission>): Promise<Commission | undefined> {
    const result = await db.update(commissions)
      .set(updates)
      .where(eq(commissions.id, id))
      .returning();
    return result[0];
  }

  async markCommissionPaid(id: string): Promise<Commission | undefined> {
    const result = await db.update(commissions)
      .set({ status: 'paid', paidAt: new Date() })
      .where(eq(commissions.id, id))
      .returning();
    return result[0];
  }

  async getCommissionsByPartner(partnerId: string): Promise<Commission[]> {
    return await db.select().from(commissions)
      .where(eq(commissions.partnerId, partnerId))
      .orderBy(desc(commissions.createdAt));
  }

  async getCommissionsBySalesperson(salespersonId: string): Promise<Commission[]> {
    return await db.select().from(commissions)
      .where(eq(commissions.salespersonId, salespersonId))
      .orderBy(desc(commissions.createdAt));
  }

  async getCommissionsByUser(userId: string): Promise<Commission[]> {
    return await db.select().from(commissions)
      .where(eq(commissions.userId, userId))
      .orderBy(desc(commissions.createdAt));
  }

  // Get commission stats for partner dashboard
  async getPartnerCommissionStats(partnerId: string): Promise<{
    totalEarnings: number;
    pendingEarnings: number;
    paidEarnings: number;
    thisMonthEarnings: number;
  }> {
    const allCommissions = await this.getCommissionsByPartner(partnerId);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const stats = {
      totalEarnings: 0,
      pendingEarnings: 0,
      paidEarnings: 0,
      thisMonthEarnings: 0,
    };
    
    for (const c of allCommissions) {
      const amount = parseFloat(c.amount);
      stats.totalEarnings += amount;
      
      if (c.status === 'paid') {
        stats.paidEarnings += amount;
      } else {
        stats.pendingEarnings += amount;
      }
      
      if (c.createdAt && c.createdAt >= startOfMonth) {
        stats.thisMonthEarnings += amount;
      }
    }
    
    return stats;
  }

  // Check if commission duration is still active for a user
  async isCommissionDurationActive(userId: string): Promise<{ partnerActive: boolean; salespersonActive: boolean }> {
    const user = await this.getUser(userId);
    if (!user) return { partnerActive: false, salespersonActive: false };
    
    const result = { partnerActive: false, salespersonActive: false };
    const now = new Date();
    
    // Check partner commission duration
    if (user.partnerId && user.partnerAssignedAt) {
      const partner = await this.getPartner(user.partnerId);
      if (partner && partner.status === 'active') {
        const durationMonths = partner.commissionDurationMonths || 6;
        const expiresAt = new Date(user.partnerAssignedAt);
        expiresAt.setMonth(expiresAt.getMonth() + durationMonths);
        result.partnerActive = now < expiresAt;
      }
    }
    
    // Salesperson commission follows same 6-month rule from conversion date
    // (Checked via salesConversions table)
    const conversion = await this.getSalesConversionByUserId(userId);
    if (conversion) {
      const conversionDate = conversion.createdAt || new Date();
      const expiresAt = new Date(conversionDate);
      expiresAt.setMonth(expiresAt.getMonth() + 6);
      result.salespersonActive = now < expiresAt;
    }
    
    return result;
  }

  // Get all users with their source attribution for admin dashboard
  async getUsersWithAttribution(limit: number = 100): Promise<Array<User & { source: string; partnerName?: string; salespersonName?: string }>> {
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt)).limit(limit);
    
    const result = [];
    for (const user of allUsers) {
      let source = 'organic';
      let partnerName: string | undefined;
      let salespersonName: string | undefined;
      
      // Check for partner attribution
      if (user.partnerId) {
        source = 'partner';
        const partner = await this.getPartner(user.partnerId);
        partnerName = partner?.name;
      }
      
      // Check for salesperson attribution via demo booking
      const conversion = await this.getSalesConversionByUserId(user.id);
      if (conversion) {
        if (source === 'organic') source = 'internal';
        const salesperson = await this.getSalesperson(conversion.salespersonId);
        salespersonName = salesperson?.name;
      }
      
      result.push({
        ...user,
        source,
        partnerName,
        salespersonName,
      });
    }
    
    return result;
  }

  // Agreement acceptance methods
  async recordAgreementAcceptance(acceptance: InsertAgreementAcceptance): Promise<AgreementAcceptance> {
    const result = await db.insert(agreementAcceptances).values(acceptance).returning();
    return result[0];
  }

  async getAgreementAcceptances(filters?: { partnerId?: string; salespersonId?: string }): Promise<AgreementAcceptance[]> {
    const conditions = [];
    if (filters?.partnerId) {
      conditions.push(eq(agreementAcceptances.partnerId, filters.partnerId));
    }
    if (filters?.salespersonId) {
      conditions.push(eq(agreementAcceptances.salespersonId, filters.salespersonId));
    }
    
    if (conditions.length > 0) {
      return await db.select().from(agreementAcceptances)
        .where(and(...conditions))
        .orderBy(desc(agreementAcceptances.acceptedAt));
    }
    return await db.select().from(agreementAcceptances).orderBy(desc(agreementAcceptances.acceptedAt));
  }

  // ==========================================
  // AI BRAIN STORAGE METHODS
  // ==========================================

  async getAiSettings(userId: string): Promise<AiSettings | undefined> {
    const result = await db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    return result[0];
  }

  async upsertAiSettings(userId: string, updates: Partial<AiSettings>): Promise<AiSettings> {
    const existing = await this.getAiSettings(userId);
    if (existing) {
      const result = await db.update(aiSettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(aiSettings.userId, userId))
        .returning();
      return result[0];
    }
    const result = await db.insert(aiSettings).values({ ...updates, userId }).returning();
    return result[0];
  }

  async getAiBusinessKnowledge(userId: string): Promise<AiBusinessKnowledge | undefined> {
    const result = await db.select().from(aiBusinessKnowledge).where(eq(aiBusinessKnowledge.userId, userId));
    return result[0];
  }

  async upsertAiBusinessKnowledge(userId: string, updates: Partial<AiBusinessKnowledge>): Promise<AiBusinessKnowledge> {
    const existing = await this.getAiBusinessKnowledge(userId);
    if (existing) {
      const result = await db.update(aiBusinessKnowledge)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(aiBusinessKnowledge.userId, userId))
        .returning();
      return result[0];
    }
    const result = await db.insert(aiBusinessKnowledge).values({ ...updates, userId }).returning();
    return result[0];
  }

  async getCurrentAiUsage(userId: string): Promise<AiUsage | undefined> {
    const now = new Date();
    const result = await db.select().from(aiUsage)
      .where(and(
        eq(aiUsage.userId, userId),
        lte(aiUsage.periodStart, now),
        gte(aiUsage.periodEnd, now)
      ))
      .orderBy(desc(aiUsage.periodStart))
      .limit(1);
    
    if (result.length === 0) {
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const newUsage = await db.insert(aiUsage).values({
        userId,
        periodStart,
        periodEnd,
      }).returning();
      return newUsage[0];
    }
    return result[0];
  }

  async upsertAiUsage(userId: string, updates: Partial<AiUsage>): Promise<void> {
    const current = await this.getCurrentAiUsage(userId);
    if (!current) return;
    
    await db.update(aiUsage)
      .set(updates)
      .where(eq(aiUsage.id, current.id));
  }

  async incrementAiUsage(userId: string, field: 'messagesGenerated' | 'repliesSuggested' | 'leadsQualified' | 'automationsGenerated'): Promise<void> {
    const current = await this.getCurrentAiUsage(userId);
    if (!current) return;
    
    const fieldColumn = {
      messagesGenerated: aiUsage.messagesGenerated,
      repliesSuggested: aiUsage.repliesSuggested,
      leadsQualified: aiUsage.leadsQualified,
      automationsGenerated: aiUsage.automationsGenerated,
    }[field];
    
    await db.update(aiUsage)
      .set({ [field]: sql`${fieldColumn} + 1` })
      .where(eq(aiUsage.id, current.id));
  }

  async upsertAiLeadScore(chatId: string, userId: string, data: Partial<AiLeadScore>): Promise<AiLeadScore> {
    const existing = await db.select().from(aiLeadScores).where(eq(aiLeadScores.chatId, chatId));
    if (existing.length > 0) {
      const result = await db.update(aiLeadScores)
        .set({ ...data, lastUpdatedAt: new Date() })
        .where(eq(aiLeadScores.chatId, chatId))
        .returning();
      return result[0];
    }
    const result = await db.insert(aiLeadScores).values({ ...data, chatId, userId }).returning();
    return result[0];
  }

  // ============= User Automation Templates =============
  
  async getUserAutomationTemplates(
    userId: string, 
    filters?: { language?: string; category?: string; industry?: string; isActive?: boolean }
  ): Promise<UserAutomationTemplate[]> {
    const conditions = [eq(userAutomationTemplates.userId, userId)];
    
    if (filters?.language) {
      conditions.push(eq(userAutomationTemplates.language, filters.language));
    }
    if (filters?.category) {
      conditions.push(eq(userAutomationTemplates.category, filters.category));
    }
    if (filters?.industry) {
      conditions.push(eq(userAutomationTemplates.industry, filters.industry));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(userAutomationTemplates.isActive, filters.isActive));
    }
    
    return db.select()
      .from(userAutomationTemplates)
      .where(and(...conditions))
      .orderBy(desc(userAutomationTemplates.createdAt));
  }

  async getUserAutomationTemplate(id: string): Promise<UserAutomationTemplate | undefined> {
    const result = await db.select()
      .from(userAutomationTemplates)
      .where(eq(userAutomationTemplates.id, id));
    return result[0];
  }

  async createUserAutomationTemplate(template: InsertUserAutomationTemplate): Promise<UserAutomationTemplate> {
    const result = await db.insert(userAutomationTemplates)
      .values(template)
      .returning();
    return result[0];
  }

  async updateUserAutomationTemplate(id: string, updates: Partial<UserAutomationTemplate>): Promise<UserAutomationTemplate | undefined> {
    const result = await db.update(userAutomationTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userAutomationTemplates.id, id))
      .returning();
    return result[0];
  }

  async deleteUserAutomationTemplate(id: string): Promise<void> {
    await db.delete(userAutomationTemplates)
      .where(eq(userAutomationTemplates.id, id));
  }

  async getPresetCampaignsForUser(userId: string): Promise<PresetCampaign[]> {
    return db
      .select()
      .from(presetCampaigns)
      .where(eq(presetCampaigns.userId, userId))
      .orderBy(desc(presetCampaigns.createdAt));
  }

  async createPresetCampaign(row: InsertPresetCampaign): Promise<PresetCampaign> {
    const result = await db.insert(presetCampaigns).values(row).returning();
    return result[0];
  }

  async getPresetCampaignForUser(campaignId: string, userId: string): Promise<PresetCampaign | undefined> {
    const rows = await db
      .select()
      .from(presetCampaigns)
      .where(and(eq(presetCampaigns.id, campaignId), eq(presetCampaigns.userId, userId)));
    return rows[0];
  }

  async updatePresetCampaign(
    campaignId: string,
    userId: string,
    updates: Partial<PresetCampaign>
  ): Promise<PresetCampaign | undefined> {
    const existing = await this.getPresetCampaignForUser(campaignId, userId);
    if (!existing) return undefined;
    const result = await db
      .update(presetCampaigns)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(presetCampaigns.id, campaignId), eq(presetCampaigns.userId, userId)))
      .returning();
    return result[0];
  }

  async deletePresetCampaign(campaignId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(presetCampaigns)
      .where(and(eq(presetCampaigns.id, campaignId), eq(presetCampaigns.userId, userId)))
      .returning({ id: presetCampaigns.id });
    return result.length > 0;
  }

  async duplicatePresetCampaign(campaignId: string, userId: string): Promise<PresetCampaign | undefined> {
    const existing = await this.getPresetCampaignForUser(campaignId, userId);
    if (!existing) return undefined;

    const msgs = Array.isArray(existing.messages) ? existing.messages : [];
    const delayRows = Array.isArray(existing.delays)
      ? existing.delays
      : (msgs as Array<{ delay?: string }>).map((m) => String(m?.delay ?? "0"));

    const placeholderDefaults =
      existing.placeholderDefaults &&
      typeof existing.placeholderDefaults === "object" &&
      existing.placeholderDefaults !== null
        ? (existing.placeholderDefaults as Record<string, unknown>)
        : {};

    const audience =
      existing.audienceConfig &&
      typeof existing.audienceConfig === "object" &&
      existing.audienceConfig !== null
        ? { ...(existing.audienceConfig as Record<string, unknown>), duplicatedFrom: existing.id }
        : { duplicatedFrom: existing.id };

    return this.createPresetCampaign({
      userId,
      name: `${existing.name} (copy)`,
      sourcePresetId: existing.sourcePresetId,
      status: "draft",
      channel: existing.channel || "whatsapp",
      language: existing.language ?? "en",
      category: existing.category ?? "general",
      industry: existing.industry ?? "general",
      messages: msgs as unknown[],
      delays: delayRows as unknown[],
      placeholders: Array.isArray(existing.placeholders) ? existing.placeholders : [],
      placeholderDefaults,
      aiEnabled: existing.aiEnabled ?? false,
      audienceConfig: audience,
    });
  }

  async getCampaignEnrollmentById(id: string): Promise<CampaignEnrollment | undefined> {
    const rows = await db.select().from(campaignEnrollments).where(eq(campaignEnrollments.id, id)).limit(1);
    return rows[0];
  }

  async listDueCampaignEnrollmentIds(limit: number): Promise<string[]> {
    const rows = await db
      .select({ id: campaignEnrollments.id })
      .from(campaignEnrollments)
      .innerJoin(presetCampaigns, eq(campaignEnrollments.campaignId, presetCampaigns.id))
      .where(
        and(
          eq(campaignEnrollments.status, "active"),
          isNotNull(campaignEnrollments.nextRunAt),
          lte(campaignEnrollments.nextRunAt, new Date()),
          notInArray(presetCampaigns.status, ["paused", "completed"])
        )
      )
      .orderBy(asc(campaignEnrollments.nextRunAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async getActiveEnrollmentForContactCampaign(
    userId: string,
    contactId: string,
    campaignId: string
  ): Promise<CampaignEnrollment | undefined> {
    const rows = await db
      .select()
      .from(campaignEnrollments)
      .where(
        and(
          eq(campaignEnrollments.userId, userId),
          eq(campaignEnrollments.contactId, contactId),
          eq(campaignEnrollments.campaignId, campaignId),
          eq(campaignEnrollments.status, "active")
        )
      )
      .limit(1);
    return rows[0];
  }

  async createCampaignEnrollment(row: InsertCampaignEnrollment): Promise<CampaignEnrollment> {
    const result = await db.insert(campaignEnrollments).values(row).returning();
    return result[0];
  }

  async updateCampaignEnrollment(
    id: string,
    updates: Partial<CampaignEnrollment>
  ): Promise<CampaignEnrollment | undefined> {
    const result = await db
      .update(campaignEnrollments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(campaignEnrollments.id, id))
      .returning();
    return result[0];
  }

  async getCampaignEnrollmentsForContact(userId: string, contactId: string): Promise<CampaignEnrollment[]> {
    return db
      .select()
      .from(campaignEnrollments)
      .where(and(eq(campaignEnrollments.userId, userId), eq(campaignEnrollments.contactId, contactId)))
      .orderBy(desc(campaignEnrollments.createdAt));
  }

  async getCampaignEnrollmentsForCampaign(
    userId: string,
    campaignId: string,
    limit = 80
  ): Promise<CampaignEnrollment[]> {
    const camp = await this.getPresetCampaignForUser(campaignId, userId);
    if (!camp) return [];
    return db
      .select()
      .from(campaignEnrollments)
      .where(eq(campaignEnrollments.campaignId, campaignId))
      .orderBy(desc(campaignEnrollments.createdAt))
      .limit(limit);
  }

  async createCampaignStepEvent(row: InsertCampaignStepEvent): Promise<CampaignStepEvent> {
    const result = await db.insert(campaignStepEvents).values(row).returning();
    return result[0];
  }

  async updateCampaignStepEvent(
    id: string,
    updates: Partial<CampaignStepEvent>
  ): Promise<CampaignStepEvent | undefined> {
    const result = await db
      .update(campaignStepEvents)
      .set(updates)
      .where(eq(campaignStepEvents.id, id))
      .returning();
    return result[0];
  }

  async getRecentCampaignStepEventsForCampaign(
    userId: string,
    campaignId: string,
    limit = 40
  ): Promise<CampaignStepEvent[]> {
    const camp = await this.getPresetCampaignForUser(campaignId, userId);
    if (!camp) return [];
    return db
      .select()
      .from(campaignStepEvents)
      .where(eq(campaignStepEvents.campaignId, campaignId))
      .orderBy(desc(campaignStepEvents.createdAt))
      .limit(limit);
  }

  async getLatestCampaignStepEventForEnrollment(
    enrollmentId: string,
    status?: "failed" | "sent" | "skipped"
  ): Promise<CampaignStepEvent | undefined> {
    const conditions = status
      ? and(eq(campaignStepEvents.enrollmentId, enrollmentId), eq(campaignStepEvents.status, status))
      : eq(campaignStepEvents.enrollmentId, enrollmentId);
    const rows = await db
      .select()
      .from(campaignStepEvents)
      .where(conditions)
      .orderBy(desc(campaignStepEvents.createdAt))
      .limit(1);
    return rows[0];
  }

  async getCampaignAggregatesForUser(
    userId: string
  ): Promise<
    Record<
      string,
      {
        enrollmentCount: number;
        activeEnrollments: number;
        completedEnrollments: number;
        sentStepEvents: number;
        failedStepEvents: number;
      }
    >
  > {
    const out: Record<
      string,
      {
        enrollmentCount: number;
        activeEnrollments: number;
        completedEnrollments: number;
        sentStepEvents: number;
        failedStepEvents: number;
      }
    > = {};

    const enrollAgg = await db
      .select({
        campaignId: campaignEnrollments.campaignId,
        total: sql<number>`count(*)::int`,
        active: sql<number>`sum(case when ${campaignEnrollments.status} = 'active' then 1 else 0 end)::int`,
        completed: sql<number>`sum(case when ${campaignEnrollments.status} = 'completed' then 1 else 0 end)::int`,
      })
      .from(campaignEnrollments)
      .innerJoin(presetCampaigns, eq(campaignEnrollments.campaignId, presetCampaigns.id))
      .where(eq(presetCampaigns.userId, userId))
      .groupBy(campaignEnrollments.campaignId);

    for (const row of enrollAgg) {
      out[row.campaignId] = {
        enrollmentCount: Number(row.total ?? 0),
        activeEnrollments: Number(row.active ?? 0),
        completedEnrollments: Number(row.completed ?? 0),
        sentStepEvents: 0,
        failedStepEvents: 0,
      };
    }

    const evAgg = await db
      .select({
        campaignId: campaignStepEvents.campaignId,
        sent: sql<number>`sum(case when ${campaignStepEvents.status} = 'sent' then 1 else 0 end)::int`,
        failed: sql<number>`sum(case when ${campaignStepEvents.status} = 'failed' then 1 else 0 end)::int`,
      })
      .from(campaignStepEvents)
      .innerJoin(presetCampaigns, eq(campaignStepEvents.campaignId, presetCampaigns.id))
      .where(eq(presetCampaigns.userId, userId))
      .groupBy(campaignStepEvents.campaignId);

    for (const row of evAgg) {
      const cur = out[row.campaignId] ?? {
        enrollmentCount: 0,
        activeEnrollments: 0,
        completedEnrollments: 0,
        sentStepEvents: 0,
        failedStepEvents: 0,
      };
      cur.sentStepEvents = Number(row.sent ?? 0);
      cur.failedStepEvents = Number(row.failed ?? 0);
      out[row.campaignId] = cur;
    }

    return out;
  }

  // ============= Template Usage Analytics =============

  async recordTemplateUsage(usage: InsertTemplateUsageAnalytics): Promise<TemplateUsageAnalytics> {
    const result = await db.insert(templateUsageAnalytics)
      .values(usage)
      .returning();
    return result[0];
  }

  async getTemplateUsageStats(userId: string, templateId?: string): Promise<{ sent: number; delivered: number; read: number; replied: number; aiResponses: number }> {
    const conditions = [eq(templateUsageAnalytics.userId, userId)];
    if (templateId) {
      conditions.push(eq(templateUsageAnalytics.templateId, templateId));
    }
    
    const result = await db.select({
      sent: sql<number>`COUNT(*)::int`,
      delivered: sql<number>`COUNT(CASE WHEN ${templateUsageAnalytics.deliveredAt} IS NOT NULL THEN 1 END)::int`,
      read: sql<number>`COUNT(CASE WHEN ${templateUsageAnalytics.readAt} IS NOT NULL THEN 1 END)::int`,
      replied: sql<number>`COUNT(CASE WHEN ${templateUsageAnalytics.repliedAt} IS NOT NULL THEN 1 END)::int`,
      aiResponses: sql<number>`COUNT(CASE WHEN ${templateUsageAnalytics.aiResponseGenerated} = true THEN 1 END)::int`,
    })
    .from(templateUsageAnalytics)
    .where(and(...conditions));
    
    return result[0] || { sent: 0, delivered: 0, read: 0, replied: 0, aiResponses: 0 };
  }

  // ============= Premium Template Methods =============

  async getTemplateById(templateId: string): Promise<Template | undefined> {
    const result = await db.select().from(templatesTable).where(eq(templatesTable.id, templateId));
    return result[0];
  }

  async getTemplateEntitlement(userId: string, templateId: string): Promise<TemplateEntitlement | undefined> {
    const result = await db.select().from(templateEntitlements)
      .where(and(eq(templateEntitlements.userId, userId), eq(templateEntitlements.templateId, templateId)));
    return result[0];
  }

  async upsertTemplateEntitlement(userId: string, templateId: string, updates: Partial<TemplateEntitlement>): Promise<TemplateEntitlement> {
    const existing = await this.getTemplateEntitlement(userId, templateId);
    if (existing) {
      const result = await db.update(templateEntitlements)
        .set(updates)
        .where(eq(templateEntitlements.id, existing.id))
        .returning();
      return result[0];
    }
    const result = await db.insert(templateEntitlements)
      .values({ userId, templateId, ...updates } as any)
      .returning();
    return result[0];
  }

  async createRealtorOnboardingSubmission(data: InsertRealtorOnboardingSubmission): Promise<RealtorOnboardingSubmission> {
    const result = await db.insert(realtorOnboardingSubmissions).values(data).returning();
    return result[0];
  }

  async getRealtorOnboardingSubmission(userId: string): Promise<RealtorOnboardingSubmission | undefined> {
    const result = await db.select().from(realtorOnboardingSubmissions)
      .where(eq(realtorOnboardingSubmissions.userId, userId))
      .orderBy(desc(realtorOnboardingSubmissions.submittedAt))
      .limit(1);
    return result[0];
  }

  async getTemplateInstall(userId: string, templateId: string): Promise<TemplateInstall | undefined> {
    const result = await db.select().from(templateInstalls)
      .where(and(eq(templateInstalls.userId, userId), eq(templateInstalls.templateId, templateId)));
    return result[0];
  }

  async createTemplateInstall(data: InsertTemplateInstall): Promise<TemplateInstall> {
    const result = await db.insert(templateInstalls).values(data).returning();
    return result[0];
  }

  async updateTemplateInstall(id: string, updates: Partial<TemplateInstall>): Promise<TemplateInstall | undefined> {
    const result = await db.update(templateInstalls).set(updates).where(eq(templateInstalls.id, id)).returning();
    return result[0];
  }

  async getTemplateAssets(templateId: string): Promise<TemplateAsset[]> {
    return await db.select().from(templateAssets).where(eq(templateAssets.templateId, templateId));
  }

  async getUserTemplateData(userId: string, templateId: string): Promise<UserTemplateData[]> {
    return await db.select().from(userTemplateData).where(
      and(eq(userTemplateData.userId, userId), eq(userTemplateData.templateId, templateId))
    );
  }

  async getUserTemplateDataByKey(userId: string, templateId: string, assetType: string, assetKey: string): Promise<UserTemplateData | undefined> {
    const result = await db.select().from(userTemplateData).where(
      and(
        eq(userTemplateData.userId, userId),
        eq(userTemplateData.templateId, templateId),
        eq(userTemplateData.assetType, assetType),
        eq(userTemplateData.assetKey, assetKey)
      )
    );
    return result[0];
  }

  async createUserTemplateData(data: InsertUserTemplateData): Promise<UserTemplateData> {
    const result = await db.insert(userTemplateData).values(data).returning();
    return result[0];
  }

  async upsertUserTemplateData(userId: string, templateId: string, assetType: string, assetKey: string, definition: any): Promise<UserTemplateData> {
    const existing = await this.getUserTemplateDataByKey(userId, templateId, assetType, assetKey);
    if (existing) {
      const result = await db.update(userTemplateData)
        .set({ definition })
        .where(eq(userTemplateData.id, existing.id))
        .returning();
      return result[0];
    }
    return this.createUserTemplateData({ userId, templateId, assetType, assetKey, definition });
  }

  async deleteUserTemplateDataForTemplate(userId: string, templateId: string): Promise<void> {
    await db.delete(userTemplateData).where(
      and(eq(userTemplateData.userId, userId), eq(userTemplateData.templateId, templateId))
    );
  }

  async resetTemplateForUser(userId: string, templateId: string): Promise<void> {
    await db.delete(userTemplateData).where(
      and(eq(userTemplateData.userId, userId), eq(userTemplateData.templateId, templateId))
    );
    await db.delete(realtorOnboardingSubmissions).where(
      and(eq(realtorOnboardingSubmissions.userId, userId), eq(realtorOnboardingSubmissions.templateId, templateId))
    );
    await db.delete(templateInstalls).where(
      and(eq(templateInstalls.userId, userId), eq(templateInstalls.templateId, templateId))
    );
    await db.delete(templateEntitlements).where(
      and(eq(templateEntitlements.userId, userId), eq(templateEntitlements.templateId, templateId))
    );
    await db.delete(growthEngineSetupTasks).where(
      and(eq(growthEngineSetupTasks.userId, userId), eq(growthEngineSetupTasks.templateId, templateId))
    );
    await db.delete(workflows).where(
      and(
        eq(workflows.userId, userId),
        sql`description LIKE ${'Realtor Growth Engine%'}`
      )
    );
  }

  async getGrowthEngineSetupTask(userId: string, templateId: string): Promise<GrowthEngineSetupTask | undefined> {
    const rows = await db
      .select()
      .from(growthEngineSetupTasks)
      .where(and(eq(growthEngineSetupTasks.userId, userId), eq(growthEngineSetupTasks.templateId, templateId)))
      .limit(1);
    return rows[0];
  }

  async getGrowthEngineSetupTaskById(id: string): Promise<GrowthEngineSetupTask | undefined> {
    const rows = await db.select().from(growthEngineSetupTasks).where(eq(growthEngineSetupTasks.id, id)).limit(1);
    return rows[0];
  }

  async listGrowthEngineSetupTasksForTemplate(templateId: string): Promise<GrowthEngineSetupTask[]> {
    return await db
      .select()
      .from(growthEngineSetupTasks)
      .where(eq(growthEngineSetupTasks.templateId, templateId))
      .orderBy(desc(growthEngineSetupTasks.createdAt));
  }

  async listGrowthEngineSetupTasksForSalesperson(salespersonId: string): Promise<GrowthEngineSetupTask[]> {
    return await db
      .select()
      .from(growthEngineSetupTasks)
      .where(eq(growthEngineSetupTasks.salespersonId, salespersonId))
      .orderBy(desc(growthEngineSetupTasks.createdAt));
  }

  async countOpenGrowthEngineSetupTasksForSalesperson(salespersonId: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(growthEngineSetupTasks)
      .where(
        and(eq(growthEngineSetupTasks.salespersonId, salespersonId), ne(growthEngineSetupTasks.status, "setup_completed")),
      );
    return Number(row?.n ?? 0);
  }

  async insertGrowthEngineSetupTask(data: InsertGrowthEngineSetupTask): Promise<GrowthEngineSetupTask> {
    const [row] = await db.insert(growthEngineSetupTasks).values(data).returning();
    return row;
  }

  async updateGrowthEngineSetupTask(
    id: string,
    updates: Partial<GrowthEngineSetupTask>,
  ): Promise<GrowthEngineSetupTask | undefined> {
    const [row] = await db
      .update(growthEngineSetupTasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(growthEngineSetupTasks.id, id))
      .returning();
    return row;
  }

  async updateGrowthEngineSetupTaskByUserTemplate(
    userId: string,
    templateId: string,
    updates: Partial<GrowthEngineSetupTask>,
  ): Promise<GrowthEngineSetupTask | undefined> {
    const [row] = await db
      .update(growthEngineSetupTasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(growthEngineSetupTasks.userId, userId), eq(growthEngineSetupTasks.templateId, templateId)))
      .returning();
    return row;
  }

  async deleteGrowthEngineSetupTaskByUserTemplate(userId: string, templateId: string): Promise<void> {
    await db
      .delete(growthEngineSetupTasks)
      .where(and(eq(growthEngineSetupTasks.userId, userId), eq(growthEngineSetupTasks.templateId, templateId)));
  }

  async creditSalespersonSetupTaskCompletion(salespersonId: string, payoutProfile: TaskPayoutFields): Promise<void> {
    const dollars = getEffectiveTaskPayoutDollars(payoutProfile);
    const add = dollars.toFixed(2);
    await db
      .update(salespeople)
      .set({
        setupTasksCompleted: sql`COALESCE(${salespeople.setupTasksCompleted}, 0) + 1`,
        totalEarnings: sql`COALESCE(${salespeople.totalEarnings}, 0) + ${add}`,
        setupTaskEarningsTotal: sql`COALESCE(${salespeople.setupTaskEarningsTotal}, 0) + ${add}`,
      })
      .where(eq(salespeople.id, salespersonId));
  }

  // ─── Flow Job methods ──────────────────────────────────────────────────────

  private static readonly FLOW_STUCK_MS = 10 * 60 * 1000;
  private static readonly MAX_FLOW_STUCK_RECOVERIES = 5;

  async createFlowJob(job: InsertFlowJob): Promise<FlowJob> {
    const result = await db.insert(flowJobs).values(job).returning();
    return result[0];
  }

  async recoverStuckFlowJobs(): Promise<{ requeued: number; failedTerminal: number }> {
    const stuckBefore = new Date(Date.now() - DbStorage.FLOW_STUCK_MS);
    const requeued = await db
      .update(flowJobs)
      .set({
        status: "pending",
        lockedAt: null,
        stuckRecoveries: sql`${flowJobs.stuckRecoveries} + 1`,
        runAt: new Date(Date.now() + 15_000),
        errorMessage: sql`coalesce(${flowJobs.errorMessage}, '') || ' |stuck_running_recovered'`,
      })
      .where(
        and(
          eq(flowJobs.status, "running"),
          isNotNull(flowJobs.lockedAt),
          lt(flowJobs.lockedAt, stuckBefore),
          lt(flowJobs.stuckRecoveries, DbStorage.MAX_FLOW_STUCK_RECOVERIES)
        )
      )
      .returning({ id: flowJobs.id });
    const failedTerminal = await db
      .update(flowJobs)
      .set({
        status: "failed",
        lockedAt: null,
        errorMessage: "stuck_running_max_recoveries",
      })
      .where(
        and(
          eq(flowJobs.status, "running"),
          isNotNull(flowJobs.lockedAt),
          lt(flowJobs.lockedAt, stuckBefore),
          gte(flowJobs.stuckRecoveries, DbStorage.MAX_FLOW_STUCK_RECOVERIES)
        )
      )
      .returning({ id: flowJobs.id });
    const rq = requeued.length;
    const ft = failedTerminal.length;
    if (rq > 0 || ft > 0) {
      console.log(
        JSON.stringify({
          tag: "[FlowJobsRecovery]",
          requeued: rq,
          failedTerminal: ft,
        })
      );
    }
    return { requeued: rq, failedTerminal: ft };
  }

  async claimPendingFlowJobs(limit = 50): Promise<FlowJob[]> {
    return await db.transaction(async (tx) => {
      const picked = await tx.execute(sql`
        SELECT id FROM flow_jobs
        WHERE status = 'pending' AND run_at <= NOW()
        ORDER BY run_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      const rows = (picked as unknown as { rows: { id: string }[] }).rows;
      const ids = rows.map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return [];
      const claimed = await tx
        .update(flowJobs)
        .set({ status: "running", lockedAt: new Date() })
        .where(inArray(flowJobs.id, ids))
        .returning();
      console.log(
        JSON.stringify({
          tag: "[FlowJobsClaim]",
          claimed: claimed.length,
          limit,
        })
      );
      return claimed;
    });
  }

  async markFlowJobCompleted(id: string): Promise<void> {
    await db
      .update(flowJobs)
      .set({ status: "completed", lockedAt: null, errorMessage: null })
      .where(eq(flowJobs.id, id));
  }

  async markFlowJobSkipped(id: string, reason: string): Promise<void> {
    await db
      .update(flowJobs)
      .set({ status: "skipped", lockedAt: null, errorMessage: reason })
      .where(eq(flowJobs.id, id));
  }

  /**
   * Chatbot flow jobs must **fail closed** (no re-queue): re-running `executeFlowFromJob`
   * from the same `nodeId` can duplicate outbound sends if the first attempt partially succeeded.
   */
  async markFlowJobFailed(id: string, errorMessage: string): Promise<void> {
    await db
      .update(flowJobs)
      .set({
        status: "failed",
        errorMessage,
        lockedAt: null,
        failCount: sql`coalesce(${flowJobs.failCount}, 0) + 1`,
      })
      .where(eq(flowJobs.id, id));
    console.log(JSON.stringify({ tag: "[FlowJobFailed]", id, error: errorMessage.slice(0, 200) }));
  }

  // ─── No-reply jobs ───────────────────────────────────────────────────────────

  private static readonly NR_STUCK_MS = 10 * 60 * 1000;
  private static readonly MAX_NR_STUCK_RECOVERIES = 5;

  async cancelPendingNoReplyJobsForContact(contactId: string): Promise<number> {
    const updated = await db
      .update(noReplyJobs)
      .set({ status: "cancelled", updatedAt: new Date(), lastError: "inbound_cancel" })
      .where(and(eq(noReplyJobs.contactId, contactId), eq(noReplyJobs.status, "pending")))
      .returning({ id: noReplyJobs.id });
    if (updated.length > 0) {
      console.log(
        JSON.stringify({
          tag: "[NoReplyJobsCancelled]",
          contactId,
          count: updated.length,
        })
      );
    }
    return updated.length;
  }

  async createNoReplyJob(job: InsertNoReplyJob): Promise<NoReplyJob> {
    const [row] = await db.insert(noReplyJobs).values(job).returning();
    return row;
  }

  async recoverStuckNoReplyJobs(): Promise<{ requeued: number; failedTerminal: number }> {
    const stuckBefore = new Date(Date.now() - DbStorage.NR_STUCK_MS);
    const requeued = await db
      .update(noReplyJobs)
      .set({
        status: "pending",
        lockedAt: null,
        stuckRecoveries: sql`${noReplyJobs.stuckRecoveries} + 1`,
        runAt: new Date(Date.now() + 20_000),
        lastError: sql`coalesce(${noReplyJobs.lastError}, '') || ' |stuck_running_recovered'`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(noReplyJobs.status, "running"),
          isNotNull(noReplyJobs.lockedAt),
          lt(noReplyJobs.lockedAt, stuckBefore),
          lt(noReplyJobs.stuckRecoveries, DbStorage.MAX_NR_STUCK_RECOVERIES)
        )
      )
      .returning({ id: noReplyJobs.id });
    const failedTerminal = await db
      .update(noReplyJobs)
      .set({
        status: "failed",
        lockedAt: null,
        lastError: "stuck_running_max_recoveries",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(noReplyJobs.status, "running"),
          isNotNull(noReplyJobs.lockedAt),
          lt(noReplyJobs.lockedAt, stuckBefore),
          gte(noReplyJobs.stuckRecoveries, DbStorage.MAX_NR_STUCK_RECOVERIES)
        )
      )
      .returning({ id: noReplyJobs.id });
    const rq = requeued.length;
    const ft = failedTerminal.length;
    if (rq > 0 || ft > 0) {
      console.log(JSON.stringify({ tag: "[NoReplyJobsRecovery]", requeued: rq, failedTerminal: ft }));
    }
    return { requeued: rq, failedTerminal: ft };
  }

  async claimPendingNoReplyJobs(limit = 30): Promise<NoReplyJob[]> {
    return await db.transaction(async (tx) => {
      const picked = await tx.execute(sql`
        SELECT id FROM no_reply_jobs
        WHERE status = 'pending' AND run_at <= NOW()
        ORDER BY run_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      const ids = ((picked as unknown as { rows: { id: string }[] }).rows || []).map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return [];
      return await tx
        .update(noReplyJobs)
        .set({ status: "running", lockedAt: new Date(), updatedAt: new Date() })
        .where(inArray(noReplyJobs.id, ids))
        .returning();
    });
  }

  async markNoReplyJobCompleted(id: string): Promise<void> {
    await db
      .update(noReplyJobs)
      .set({ status: "completed", lockedAt: null, updatedAt: new Date() })
      .where(eq(noReplyJobs.id, id));
  }

  async markNoReplyJobSkipped(id: string, reason: string): Promise<void> {
    await db
      .update(noReplyJobs)
      .set({ status: "skipped", lockedAt: null, lastError: reason, updatedAt: new Date() })
      .where(eq(noReplyJobs.id, id));
  }

  async markNoReplyJobCancelled(id: string): Promise<void> {
    await db
      .update(noReplyJobs)
      .set({ status: "cancelled", lockedAt: null, updatedAt: new Date() })
      .where(eq(noReplyJobs.id, id));
  }

  async markNoReplyJobFailed(id: string, errorMessage: string): Promise<void> {
    const [row] = await db.select().from(noReplyJobs).where(eq(noReplyJobs.id, id));
    if (!row) return;
    const max = row.maxFailRetries ?? 3;
    const nextFail = (row.failCount ?? 0) + 1;
    if (nextFail < max) {
      await db
        .update(noReplyJobs)
        .set({
          status: "pending",
          failCount: nextFail,
          lastError: errorMessage,
          lockedAt: null,
          runAt: new Date(Date.now() + 45_000),
          updatedAt: new Date(),
        })
        .where(eq(noReplyJobs.id, id));
    } else {
      await db
        .update(noReplyJobs)
        .set({
          status: "failed",
          lastError: errorMessage,
          lockedAt: null,
          updatedAt: new Date(),
          failCount: nextFail,
        })
        .where(eq(noReplyJobs.id, id));
    }
  }

  // ─── Automation timer jobs (W2 etc.) ─────────────────────────────────────────

  private static readonly TIMER_STUCK_MS = 10 * 60 * 1000;
  private static readonly MAX_TIMER_STUCK_RECOVERIES = 5;

  async createAutomationTimerJob(job: InsertAutomationTimerJob): Promise<AutomationTimerJob> {
    const [row] = await db.insert(automationTimerJobs).values(job).returning();
    return row;
  }

  async cancelPendingAutomationTimerJobsForUserContactKinds(
    userId: string,
    contactId: string,
    kinds: string[]
  ): Promise<number> {
    if (!kinds.length) return 0;
    const updated = await db
      .update(automationTimerJobs)
      .set({ status: "cancelled", lastError: "superseded_or_inbound" })
      .where(
        and(
          eq(automationTimerJobs.userId, userId),
          eq(automationTimerJobs.status, "pending"),
          inArray(automationTimerJobs.kind, kinds),
          sql`${automationTimerJobs.payload}->>'contactId' = ${contactId}`
        )
      )
      .returning({ id: automationTimerJobs.id });
    return updated.length;
  }

  async recoverStuckAutomationTimerJobs(): Promise<{ requeued: number; failedTerminal: number }> {
    const stuckBefore = new Date(Date.now() - DbStorage.TIMER_STUCK_MS);
    const requeued = await db
      .update(automationTimerJobs)
      .set({
        status: "pending",
        lockedAt: null,
        stuckRecoveries: sql`${automationTimerJobs.stuckRecoveries} + 1`,
        runAt: new Date(Date.now() + 20_000),
        lastError: sql`coalesce(${automationTimerJobs.lastError}, '') || ' |stuck_running_recovered'`,
      })
      .where(
        and(
          eq(automationTimerJobs.status, "running"),
          isNotNull(automationTimerJobs.lockedAt),
          lt(automationTimerJobs.lockedAt, stuckBefore),
          lt(automationTimerJobs.stuckRecoveries, DbStorage.MAX_TIMER_STUCK_RECOVERIES)
        )
      )
      .returning({ id: automationTimerJobs.id });
    const failedTerminal = await db
      .update(automationTimerJobs)
      .set({
        status: "failed",
        lockedAt: null,
        lastError: "stuck_running_max_recoveries",
      })
      .where(
        and(
          eq(automationTimerJobs.status, "running"),
          isNotNull(automationTimerJobs.lockedAt),
          lt(automationTimerJobs.lockedAt, stuckBefore),
          gte(automationTimerJobs.stuckRecoveries, DbStorage.MAX_TIMER_STUCK_RECOVERIES)
        )
      )
      .returning({ id: automationTimerJobs.id });
    const rq = requeued.length;
    const ft = failedTerminal.length;
    if (rq > 0 || ft > 0) {
      console.log(JSON.stringify({ tag: "[AutomationTimerRecovery]", requeued: rq, failedTerminal: ft }));
    }
    return { requeued: rq, failedTerminal: ft };
  }

  async claimPendingAutomationTimerJobs(limit = 30): Promise<AutomationTimerJob[]> {
    return await db.transaction(async (tx) => {
      const picked = await tx.execute(sql`
        SELECT id FROM automation_timer_jobs
        WHERE status = 'pending' AND run_at <= NOW()
        ORDER BY run_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      const ids = ((picked as unknown as { rows: { id: string }[] }).rows || []).map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return [];
      return await tx
        .update(automationTimerJobs)
        .set({ status: "running", lockedAt: new Date() })
        .where(inArray(automationTimerJobs.id, ids))
        .returning();
    });
  }

  async markAutomationTimerJobCompleted(id: string): Promise<void> {
    await db
      .update(automationTimerJobs)
      .set({ status: "completed", lockedAt: null, lastError: null })
      .where(eq(automationTimerJobs.id, id));
  }

  async markAutomationTimerJobSkipped(id: string, reason: string): Promise<void> {
    await db
      .update(automationTimerJobs)
      .set({ status: "skipped", lockedAt: null, lastError: reason })
      .where(eq(automationTimerJobs.id, id));
  }

  async markAutomationTimerJobFailed(id: string, errorMessage: string): Promise<void> {
    const [row] = await db.select().from(automationTimerJobs).where(eq(automationTimerJobs.id, id));
    if (!row) return;
    const max = row.maxFailRetries ?? 3;
    const nextFail = (row.failCount ?? 0) + 1;
    if (nextFail < max) {
      await db
        .update(automationTimerJobs)
        .set({
          status: "pending",
          failCount: nextFail,
          lastError: errorMessage,
          lockedAt: null,
          runAt: new Date(Date.now() + 45_000),
        })
        .where(eq(automationTimerJobs.id, id));
    } else {
      await db
        .update(automationTimerJobs)
        .set({
          status: "failed",
          lastError: errorMessage,
          lockedAt: null,
          failCount: nextFail,
        })
        .where(eq(automationTimerJobs.id, id));
    }
  }

  // ─── Automation send dedup ───────────────────────────────────────────────────

  async tryAcquireAutomationSendDedup(
    dedupKey: string,
    userId: string,
    contactId?: string | null
  ): Promise<boolean> {
    try {
      const inserted = await db
        .insert(automationSendDedup)
        .values({
          dedupKey,
          userId,
          contactId: contactId ?? null,
          status: "locked",
        })
        .onConflictDoNothing({ target: automationSendDedup.dedupKey })
        .returning({ dedupKey: automationSendDedup.dedupKey });
      return inserted.length > 0;
    } catch (e: any) {
      console.warn("[tryAcquireAutomationSendDedup]", e?.message || e);
      return true;
    }
  }

  async completeAutomationSendDedup(dedupKey: string, status: "completed" | "skipped"): Promise<void> {
    await db
      .update(automationSendDedup)
      .set({ status })
      .where(eq(automationSendDedup.dedupKey, dedupKey));
  }
}

export const storage = new DbStorage();
