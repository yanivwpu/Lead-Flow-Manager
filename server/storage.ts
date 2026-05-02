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
  type MessageTemplate, type InsertMessageTemplate,
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
  type TemplateUsageAnalytics, type InsertTemplateUsageAnalytics,
  type Template, type TemplateEntitlement, type InsertTemplateEntitlement,
  type RealtorOnboardingSubmission, type InsertRealtorOnboardingSubmission,
  type TemplateInstall, type InsertTemplateInstall,
  type TemplateAsset, type InsertTemplateAsset,
  type UserTemplateData, type InsertUserTemplateData,
  type ContactNote, type InsertContactNote,
  type Appointment, type InsertAppointment,
  type GhlEventDedup, type InsertGhlEventDedup,
  type GhlSyncFailure, type InsertGhlSyncFailure, ghlSyncFailures,
  type FlowJob, type InsertFlowJob,
  aiSettings, aiBusinessKnowledge, aiUsage, aiLeadScores,
  userAutomationTemplates, templateUsageAnalytics,
  templates as templatesTable, templateEntitlements, realtorOnboardingSubmissions,
  templateInstalls, templateAssets, userTemplateData, ghlEventDedup
} from "@shared/schema";
import { db } from "../drizzle/db";
import { users, chats, registeredPhones, messageUsage, conversationWindows, teamMembers, workflows, workflowExecutions, recurringReminders, webhooks, webhookDeliveries, integrations, messageTemplates, templateSends, dripCampaigns, dripSteps, dripEnrollments, dripSends, chatbotFlows, chatbotSessions, salespeople, demoBookings, salesConversions, adminSettings, contacts, conversations, messages, activityEvents, channelSettings, supportTickets, partners, commissions, agreementAcceptances, contactNotes, appointments, flowJobs, type InsertConversationWindow, type ConversationWindow } from "@shared/schema";
import { eq, and, lte, sql, isNotNull, isNull, asc, desc, gte, sum, gt, or, like, ilike, ne } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  /** Match users.email case-insensitively (Postgres lower()). Pass normalized lowercased email. */
  getUserByEmailCaseInsensitive(normalizedEmail: string): Promise<User | undefined>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  getUserByShopifyShop(shop: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  
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
  
  // Template send methods
  createTemplateSend(send: InsertTemplateSend): Promise<TemplateSend>;
  getTemplateSends(userId: string, limit?: number): Promise<TemplateSend[]>;
  updateTemplateSendStatus(id: string, status: string, deliveredAt?: Date, readAt?: Date, failureReason?: string): Promise<void>;
  
  // Retargetable chats (outside 24-hour window)
  getRetargetableChats(userId: string, limit?: number): Promise<Chat[]>;
  
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
  updateContact(id: string, updates: Partial<Contact>): Promise<Contact | undefined>;
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

  // Flow Job methods (durable Wait/delay scheduling)
  createFlowJob(job: import("@shared/schema").InsertFlowJob): Promise<import("@shared/schema").FlowJob>;
  claimPendingFlowJobs(limit?: number): Promise<import("@shared/schema").FlowJob[]>;
  markFlowJobCompleted(id: string): Promise<void>;
  markFlowJobFailed(id: string, errorMessage: string): Promise<void>;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async getUserByEmailCaseInsensitive(normalizedEmail: string): Promise<User | undefined> {
    const e = normalizedEmail.trim().toLowerCase();
    if (!e) return undefined;
    const result = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${e}`)
      .limit(2);
    // Defensive: unique constraint should prevent multiples; if not, take first match.
    return result[0];
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
    return result[0];
  }

  async getUserByShopifyShop(shop: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.shopifyShop, shop));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
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

  // Get chats outside the 24-hour window (eligible for template messaging)
  async getRetargetableChats(userId: string, limit: number = 5000): Promise<Chat[]> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return await db.select().from(chats)
      .where(and(
        eq(chats.userId, userId),
        isNotNull(chats.whatsappPhone),
        lte(chats.updatedAt, twentyFourHoursAgo)
      ))
      .orderBy(desc(chats.updatedAt))
      .limit(limit);
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
  // Note: Using raw SQL query to avoid issues with missing 'source' column in older production DBs
  async getDemoBookings(): Promise<DemoBooking[]> {
    try {
      // Try full select first
      return await db.select().from(demoBookings).orderBy(desc(demoBookings.createdAt));
    } catch (error: any) {
      if (error?.message?.includes('source')) {
        // Fallback: query without source column, add default
        const rows = await db.execute(sql`
          SELECT id, salesperson_id, visitor_name, visitor_email, visitor_phone, 
                 scheduled_date, consent_given, status, notes, created_at,
                 'web' as source
          FROM demo_bookings ORDER BY created_at DESC
        `);
        return rows.rows as DemoBooking[];
      }
      throw error;
    }
  }

  async getDemoBookingsBySalesperson(salespersonId: string): Promise<DemoBooking[]> {
    try {
      return await db.select().from(demoBookings)
        .where(eq(demoBookings.salespersonId, salespersonId))
        .orderBy(desc(demoBookings.createdAt));
    } catch (error: any) {
      if (error?.message?.includes('source')) {
        const rows = await db.execute(sql`
          SELECT id, salesperson_id, visitor_name, visitor_email, visitor_phone, 
                 scheduled_date, consent_given, status, notes, created_at,
                 'web' as source
          FROM demo_bookings WHERE salesperson_id = ${salespersonId} ORDER BY created_at DESC
        `);
        return rows.rows as DemoBooking[];
      }
      throw error;
    }
  }

  async getDemoBooking(id: string): Promise<DemoBooking | undefined> {
    try {
      const result = await db.select().from(demoBookings).where(eq(demoBookings.id, id));
      return result[0];
    } catch (error: any) {
      if (error?.message?.includes('source')) {
        const rows = await db.execute(sql`
          SELECT id, salesperson_id, visitor_name, visitor_email, visitor_phone, 
                 scheduled_date, consent_given, status, notes, created_at,
                 'web' as source
          FROM demo_bookings WHERE id = ${id}
        `);
        return rows.rows[0] as DemoBooking | undefined;
      }
      throw error;
    }
  }

  async getDemoBookingByEmail(email: string): Promise<DemoBooking | undefined> {
    try {
      const result = await db.select().from(demoBookings)
        .where(eq(demoBookings.visitorEmail, email))
        .orderBy(desc(demoBookings.createdAt));
      return result[0];
    } catch (error: any) {
      if (error?.message?.includes('source')) {
        const rows = await db.execute(sql`
          SELECT id, salesperson_id, visitor_name, visitor_email, visitor_phone, 
                 scheduled_date, consent_given, status, notes, created_at,
                 'web' as source
          FROM demo_bookings WHERE visitor_email = ${email} ORDER BY created_at DESC
        `);
        return rows.rows[0] as DemoBooking | undefined;
      }
      throw error;
    }
  }

  async createDemoBooking(booking: InsertDemoBooking): Promise<DemoBooking> {
    // Try to insert with source column, fall back to without if it doesn't exist
    try {
      const result = await db.insert(demoBookings).values({
        ...booking,
        source: booking.source || 'web'
      }).returning();
      await db.update(salespeople)
        .set({ totalBookings: sql`${salespeople.totalBookings} + 1` })
        .where(eq(salespeople.id, booking.salespersonId));
      return result[0];
    } catch (error: any) {
      if (error?.message?.includes('source')) {
        // Insert without source column
        const rows = await db.execute(sql`
          INSERT INTO demo_bookings (salesperson_id, visitor_name, visitor_email, visitor_phone, scheduled_date, consent_given, status, notes)
          VALUES (${booking.salespersonId}, ${booking.visitorName}, ${booking.visitorEmail}, ${booking.visitorPhone}, ${booking.scheduledDate}, ${booking.consentGiven ?? true}, ${booking.status || 'pending'}, ${booking.notes || null})
          RETURNING *, 'web' as source
        `);
        await db.update(salespeople)
          .set({ totalBookings: sql`${salespeople.totalBookings} + 1` })
          .where(eq(salespeople.id, booking.salespersonId));
        return rows.rows[0] as DemoBooking;
      }
      throw error;
    }
  }

  async updateDemoBooking(id: string, updates: Partial<DemoBooking>): Promise<DemoBooking | undefined> {
    // Exclude source from updates if column doesn't exist
    const { source, ...safeUpdates } = updates;
    try {
      const result = await db.update(demoBookings)
        .set(updates)
        .where(eq(demoBookings.id, id))
        .returning();
      return result[0];
    } catch (error: any) {
      if (error?.message?.includes('source')) {
        const result = await db.update(demoBookings)
          .set(safeUpdates)
          .where(eq(demoBookings.id, id))
          .returning();
        return result[0] ? { ...result[0], source: 'web' } as DemoBooking : undefined;
      }
      throw error;
    }
  }

  // Sales Conversion methods
  async getSalesConversions(): Promise<SalesConversion[]> {
    return await db.select().from(salesConversions).orderBy(desc(salesConversions.createdAt));
  }

  async getSalesConversionsBySalesperson(salespersonId: string): Promise<SalesConversion[]> {
    return await db.select().from(salesConversions)
      .where(eq(salesConversions.salespersonId, salespersonId))
      .orderBy(desc(salesConversions.createdAt));
  }

  async createSalesConversion(conversion: InsertSalesConversion): Promise<SalesConversion> {
    const result = await db.insert(salesConversions).values(conversion).returning();
    await db.update(salespeople)
      .set({ 
        totalConversions: sql`${salespeople.totalConversions} + 1`,
        totalEarnings: sql`${salespeople.totalEarnings} + ${conversion.amount || 50}`
      })
      .where(eq(salespeople.id, conversion.salespersonId));
    await db.update(demoBookings)
      .set({ status: 'converted' })
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
    const result = await db.select().from(salesConversions)
      .where(eq(salesConversions.userId, userId));
    return result[0];
  }

  async addConversionRevenue(userId: string, amount: number): Promise<void> {
    await db.update(salesConversions)
      .set({ 
        totalRevenue: sql`COALESCE(${salesConversions.totalRevenue}, 0) + ${amount}`
      })
      .where(eq(salesConversions.userId, userId));
  }

  async getConversionROIStats(): Promise<{ totalCost: number; totalRevenue: number; roi: number }> {
    const conversions = await db.select().from(salesConversions);
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

  async updateContact(id: string, updates: Partial<Contact>): Promise<Contact | undefined> {
    const result = await db.update(contacts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    return result[0];
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
      console.log("[storage.getMessages] ok", {
        conversationId,
        rowCount: out.length,
        ms: Date.now() - t0,
      });
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
    await db.delete(workflows).where(
      and(
        eq(workflows.userId, userId),
        sql`description LIKE ${'Realtor Growth Engine%'}`
      )
    );
  }

  // ─── Flow Job methods ──────────────────────────────────────────────────────

  async createFlowJob(job: InsertFlowJob): Promise<FlowJob> {
    const result = await db.insert(flowJobs).values(job).returning();
    return result[0];
  }

  async claimPendingFlowJobs(limit = 50): Promise<FlowJob[]> {
    // Atomically claim jobs: update status to 'running' where status = 'pending' and run_at <= now()
    // Returns only the rows that were actually updated (idempotent — prevents double execution)
    const claimed = await db
      .update(flowJobs)
      .set({ status: "running" })
      .where(
        and(
          eq(flowJobs.status, "pending"),
          lte(flowJobs.runAt, new Date())
        )
      )
      .returning();
    return claimed.slice(0, limit);
  }

  async markFlowJobCompleted(id: string): Promise<void> {
    await db.update(flowJobs).set({ status: "completed" }).where(eq(flowJobs.id, id));
  }

  async markFlowJobFailed(id: string, errorMessage: string): Promise<void> {
    await db.update(flowJobs).set({ status: "failed", errorMessage }).where(eq(flowJobs.id, id));
  }
}

export const storage = new DbStorage();
