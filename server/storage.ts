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
  type Integration, type InsertIntegration
} from "@shared/schema";
import { db } from "../drizzle/db";
import { users, chats, registeredPhones, messageUsage, conversationWindows, teamMembers, workflows, workflowExecutions, recurringReminders, webhooks, webhookDeliveries, integrations, type InsertConversationWindow, type ConversationWindow } from "@shared/schema";
import { eq, and, lte, sql, isNotNull, asc, desc, gte, sum, gt, or, like, ilike } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  
  // Chat methods
  getChats(userId: string): Promise<Chat[]>;
  getTeamChats(ownerId: string): Promise<Chat[]>;
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
  searchMessages(userId: string, query: string): Promise<Chat[]>;
  
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
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: string, updates: Partial<Integration>): Promise<Integration | undefined>;
  deleteIntegration(id: string): Promise<void>;
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

  async getChats(userId: string): Promise<Chat[]> {
    return await db.select().from(chats).where(eq(chats.userId, userId)).orderBy(asc(chats.createdAt), asc(chats.id));
  }

  async getTeamChats(ownerId: string): Promise<Chat[]> {
    const members = await db.select().from(teamMembers).where(eq(teamMembers.ownerId, ownerId));
    const memberUserIds = members
      .filter(m => m.memberId !== null)
      .map(m => m.memberId as string);
    const allUserIds = [ownerId, ...memberUserIds];
    
    if (allUserIds.length === 1) {
      return await db.select().from(chats).where(eq(chats.userId, ownerId)).orderBy(desc(chats.updatedAt));
    }
    
    return await db
      .select()
      .from(chats)
      .where(or(...allUserIds.map(id => eq(chats.userId, id))))
      .orderBy(desc(chats.updatedAt));
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
  async searchMessages(userId: string, query: string): Promise<Chat[]> {
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
    ).orderBy(desc(chats.updatedAt));
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
}

export const storage = new DbStorage();
