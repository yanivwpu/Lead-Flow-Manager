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
  type AgreementAcceptance, type InsertAgreementAcceptance
} from "@shared/schema";
import { db } from "../drizzle/db";
import { users, chats, registeredPhones, messageUsage, conversationWindows, teamMembers, workflows, workflowExecutions, recurringReminders, webhooks, webhookDeliveries, integrations, messageTemplates, templateSends, dripCampaigns, dripSteps, dripEnrollments, dripSends, chatbotFlows, chatbotSessions, salespeople, demoBookings, salesConversions, adminSettings, contacts, conversations, messages, activityEvents, channelSettings, supportTickets, partners, commissions, agreementAcceptances, type InsertConversationWindow, type ConversationWindow } from "@shared/schema";
import { eq, and, lte, sql, isNotNull, asc, desc, gte, sum, gt, or, like, ilike } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
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
  searchContacts(userId: string, query: string, limit?: number): Promise<Contact[]>;
  
  // Conversation methods
  getConversations(userId: string, limit?: number): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationByContactAndChannel(contactId: string, channel: Channel): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<void>;
  
  // Message methods
  getMessages(conversationId: string, limit?: number, offset?: number): Promise<Message[]>;
  getMessage(id: string): Promise<Message | undefined>;
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

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
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
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(teamMembers)
      .where(and(
        eq(teamMembers.ownerId, ownerId),
        or(eq(teamMembers.status, 'active'), eq(teamMembers.status, 'pending'))
      ));
    return (result[0]?.count || 0) + 1; // +1 to include the owner
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
    return await db.select().from(demoBookings).orderBy(desc(demoBookings.createdAt));
  }

  async getDemoBookingsBySalesperson(salespersonId: string): Promise<DemoBooking[]> {
    return await db.select().from(demoBookings)
      .where(eq(demoBookings.salespersonId, salespersonId))
      .orderBy(desc(demoBookings.createdAt));
  }

  async getDemoBooking(id: string): Promise<DemoBooking | undefined> {
    const result = await db.select().from(demoBookings).where(eq(demoBookings.id, id));
    return result[0];
  }

  async getDemoBookingByEmail(email: string): Promise<DemoBooking | undefined> {
    const result = await db.select().from(demoBookings)
      .where(eq(demoBookings.visitorEmail, email))
      .orderBy(desc(demoBookings.createdAt));
    return result[0];
  }

  async createDemoBooking(booking: InsertDemoBooking): Promise<DemoBooking> {
    const result = await db.insert(demoBookings).values(booking).returning();
    await db.update(salespeople)
      .set({ totalBookings: sql`${salespeople.totalBookings} + 1` })
      .where(eq(salespeople.id, booking.salespersonId));
    return result[0];
  }

  async updateDemoBooking(id: string, updates: Partial<DemoBooking>): Promise<DemoBooking | undefined> {
    const result = await db.update(demoBookings)
      .set(updates)
      .where(eq(demoBookings.id, id))
      .returning();
    return result[0];
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
      case 'whatsapp':
        whereClause = and(eq(contacts.userId, userId), eq(contacts.whatsappId, channelId));
        break;
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

  async getConversationByContactAndChannel(contactId: string, channel: Channel): Promise<Conversation | undefined> {
    const result = await db.select().from(conversations)
      .where(and(
        eq(conversations.contactId, contactId),
        eq(conversations.channel, channel)
      ));
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
    return await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const result = await db.select().from(messages).where(eq(messages.id, id));
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
}

export const storage = new DbStorage();
