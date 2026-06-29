import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  aiBusinessKnowledge,
  aiMessageLog,
  aiSettings,
  channelSettings,
  conversations,
  growthEngineSetupTasks,
  integrations,
  inventorySources,
  messages,
  userAutomationTemplates,
  users,
  userSessions,
  workflows,
} from "@shared/schema";
import { deriveAdminUserChannelConnections } from "@shared/adminChannelConnectionStatus";
import { getEffectivePlanForUser } from "./subscriptionService";
import { getGhlUserIds } from "./ghlMarketplaceService";
import { RGE_TEMPLATE_ID } from "@shared/rgePaths";

export type ActivationFunnelStep = {
  key: string;
  label: string;
  count: number;
  percent: number;
};

export type ActivationSummary = {
  topMetrics: {
    totalUsers: number;
    activeUsers: number;
    ghlInstalls: number;
    shopifyInstalls: number;
    websiteSignups: number;
    payingCustomers: number;
    freeUsers: number;
    trialUsers: number;
  };
  channelMetrics: {
    whatsappConnected: number;
    facebookMessengerConnected: number;
    instagramConnected: number;
    anyChannelConnected: number;
    multipleChannelsConnected: number;
    embeddedSignupCompleted: number;
    whatsappPhoneNumberConnected: number;
    wabaIdPresent: number;
    phoneNumberIdPresent: number;
  };
  usageMetrics: {
    conversationsCreated: number;
    usersWithAtLeastOneConversation: number;
    usersWhoSentAtLeastOneMessage: number;
    usersWhoReceivedInboundMessage: number;
    aiCopilotUsed: number;
    aiLeadScoringActive: number;
    automationsActive: number;
    templatesUsed: number;
    rgeEnabled: number;
    agentPageEnabled: number;
    inventorySourceConnected: number;
    shopifyAbandonedCartEnabled: number;
  };
  funnel: ActivationFunnelStep[];
};

export type ActivationAccountRow = {
  id: string;
  name: string;
  email: string;
  source: "GHL" | "Shopify" | "Website" | "Partner";
  plan: string;
  subscriptionStatus: string;
  trialStatus: string;
  whatsappConnected: boolean;
  facebookConnected: boolean;
  instagramConnected: boolean;
  conversationsCount: number;
  messagesSent: number;
  messagesReceived: number;
  aiUsed: boolean;
  automationsActive: boolean;
  rgeEnabled: boolean;
  agentPageEnabled: boolean;
  inventoryConnected: boolean;
  lastActivity: string | null;
  createdAt: string | null;
};

export type ActivationAccountsFilters = {
  source?: string;
  plan?: string;
  status?: string;
  channelConnected?: "yes" | "no";
  hasConversations?: "yes" | "no";
  trial?: "yes" | "no";
  paying?: "yes" | "no";
  search?: string;
  limit?: number;
  offset?: number;
};

function isPayingUser(user: typeof users.$inferSelect, effectivePlan: string): boolean {
  if (effectivePlan !== "free") return true;
  if (user.shopifySubscriptionStatus === "active") return true;
  if (user.stripeSubscriptionId && user.subscriptionStatus === "active") return true;
  return false;
}

function deriveUserSource(
  user: typeof users.$inferSelect,
  ghlUserIds: Set<string>,
): ActivationAccountRow["source"] {
  if (ghlUserIds.has(user.id)) return "GHL";
  if (user.shopifyInstalledAt || user.shopifyShop) return "Shopify";
  if (user.partnerId) return "Partner";
  return "Website";
}

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/** Drizzle/pg may return Date, string, or null — never call .toISOString() directly. */
export function serializeActivationDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

export async function getActivationSummary(): Promise<ActivationSummary> {
  const now = new Date();
  const allUsers = await db.select().from(users);
  const ghlUserIds = await getGhlUserIds();

  const ghlInstallCount = (
    await db
      .select({ id: integrations.id })
      .from(integrations)
      .where(eq(integrations.type, "gohighlevel"))
  ).length;

  const shopifyInstalls = allUsers.filter((u) => u.shopifyInstalledAt || u.shopifyShop).length;
  const websiteSignups = allUsers.filter(
    (u) => !ghlUserIds.has(u.id) && !u.shopifyInstalledAt && !u.shopifyShop,
  ).length;

  let trialUsers = 0;
  let freeUsers = 0;
  let payingCustomers = 0;
  for (const user of allUsers) {
    const plan = getEffectivePlanForUser(user, now);
    if (user.trialStatus === "active") trialUsers++;
    if (plan === "free" && !isPayingUser(user, plan)) freeUsers++;
    if (isPayingUser(user, plan)) payingCustomers++;
  }

  const channelRows = await db.select().from(channelSettings);
  const channelByUser = new Map<string, typeof channelRows>();
  for (const row of channelRows) {
    const list = channelByUser.get(row.userId) ?? [];
    list.push(row);
    channelByUser.set(row.userId, list);
  }

  let whatsappConnected = 0;
  let facebookMessengerConnected = 0;
  let instagramConnected = 0;
  let anyChannelConnected = 0;
  let multipleChannelsConnected = 0;
  let embeddedSignupCompleted = 0;
  let whatsappPhoneNumberConnected = 0;
  let wabaIdPresent = 0;
  let phoneNumberIdPresent = 0;

  const usersWithChannel = new Set<string>();
  const usersWithInbound = new Set<string>();
  const usersWithOutbound = new Set<string>();
  const usersWithConversation = new Set<string>();
  const usersLoggedIn = new Set<string>();
  const usersWithAi = new Set<string>();
  const usersWithAutomation = new Set<string>();
  const usersPaid = new Set<string>();

  for (const user of allUsers) {
    const connections = deriveAdminUserChannelConnections({
      user,
      channelSettings: (channelByUser.get(user.id) ?? []).map((row) => ({
        channel: row.channel,
        isConnected: row.isConnected,
        isEnabled: row.isEnabled,
        config: row.config,
      })),
    });

    if (connections.whatsappConnected) whatsappConnected++;
    if (connections.facebook.state === "connected") facebookMessengerConnected++;
    if (connections.instagram.state === "connected") instagramConnected++;
    if (connections.hasAnyChannel) {
      anyChannelConnected++;
      usersWithChannel.add(user.id);
    }

    const connectedCount = [
      connections.whatsappConnected,
      connections.facebook.state === "connected",
      connections.instagram.state === "connected",
    ].filter(Boolean).length;
    if (connectedCount >= 2) multipleChannelsConnected++;

    if (user.metaConnectionType === "embedded_signup" && user.metaConnected) {
      embeddedSignupCompleted++;
    }
    if (user.metaDisplayPhoneNumber || user.twilioWhatsappNumber) {
      whatsappPhoneNumberConnected++;
    }
    if (user.metaBusinessAccountId) wabaIdPresent++;
    if (user.metaPhoneNumberId) phoneNumberIdPresent++;

    const plan = getEffectivePlanForUser(user, now);
    if (isPayingUser(user, plan)) usersPaid.add(user.id);
  }

  const conversationCounts = await db
    .select({
      userId: conversations.userId,
      count: sql<number>`count(*)::int`,
    })
    .from(conversations)
    .groupBy(conversations.userId);
  const conversationCountMap = new Map(conversationCounts.map((r) => [r.userId, r.count]));
  const totalConversations = conversationCounts.reduce((sum, r) => sum + (r.count || 0), 0);
  for (const row of conversationCounts) usersWithConversation.add(row.userId);

  const messageStats = await db
    .select({
      userId: messages.userId,
      direction: messages.direction,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .groupBy(messages.userId, messages.direction);

  for (const row of messageStats) {
    if (row.direction === "inbound") usersWithInbound.add(row.userId);
    if (row.direction === "outbound") usersWithOutbound.add(row.userId);
  }

  const aiUsers = await db
    .select({ userId: aiMessageLog.userId })
    .from(aiMessageLog)
    .groupBy(aiMessageLog.userId);
  for (const row of aiUsers) usersWithAi.add(row.userId);

  const activeWorkflowUsers = await db
    .select({ userId: workflows.userId })
    .from(workflows)
    .where(eq(workflows.isActive, true))
    .groupBy(workflows.userId);
  const activeTemplateUsers = await db
    .select({ userId: userAutomationTemplates.userId })
    .from(userAutomationTemplates)
    .where(eq(userAutomationTemplates.isActive, true))
    .groupBy(userAutomationTemplates.userId);
  for (const row of [...activeWorkflowUsers, ...activeTemplateUsers]) {
    usersWithAutomation.add(row.userId);
  }

  const sessionUsers = await db
    .select({ userId: sql<string>`(${userSessions.sess}->'passport'->>'user')` })
    .from(userSessions)
    .where(sql`${userSessions.expire} > NOW()`);
  for (const row of sessionUsers) {
    if (row.userId) usersLoggedIn.add(row.userId);
  }

  const aiLeadScoringActive = (
    await db
      .select({ userId: aiSettings.userId })
      .from(aiSettings)
      .where(eq(aiSettings.leadQualificationEnabled, true))
  ).length;

  const automationsActiveCount = usersWithAutomation.size;

  const templatesUsed = (
    await db.select({ userId: userAutomationTemplates.userId }).from(userAutomationTemplates).groupBy(
      userAutomationTemplates.userId,
    )
  ).length;

  const rgeEnabled = (
    await db
      .select({ userId: growthEngineSetupTasks.userId })
      .from(growthEngineSetupTasks)
      .where(eq(growthEngineSetupTasks.templateId, RGE_TEMPLATE_ID))
      .groupBy(growthEngineSetupTasks.userId)
  ).length;

  const agentPageEnabled = (
    await db
      .select({ userId: aiBusinessKnowledge.userId })
      .from(aiBusinessKnowledge)
      .where(eq(aiBusinessKnowledge.agentPageEnabled, true))
  ).length;

  const inventorySourceConnected = (
    await db.select({ userId: inventorySources.userId }).from(inventorySources).groupBy(inventorySources.userId)
  ).length;

  const shopifyAbandonedCartEnabled = (
    await db
      .select({ userId: userAutomationTemplates.userId })
      .from(userAutomationTemplates)
      .where(
        and(
          eq(userAutomationTemplates.category, "abandoned_cart"),
          eq(userAutomationTemplates.isActive, true),
        ),
      )
      .groupBy(userAutomationTemplates.userId)
  ).length;

  const totalUsers = allUsers.length;
  const activeUsers = usersLoggedIn.size || usersWithConversation.size;

  const signedUp = totalUsers;
  const loggedIn = Math.max(usersLoggedIn.size, usersWithConversation.size, usersWithInbound.size);
  const connectedChannel = usersWithChannel.size;
  const receivedInbound = usersWithInbound.size;
  const sentReply = usersWithOutbound.size;
  const usedAi = usersWithAi.size;
  const activatedAutomation = usersWithAutomation.size;
  const becamePaid = usersPaid.size;

  const funnel: ActivationFunnelStep[] = [
    { key: "signed_up", label: "Installed / signed up", count: signedUp, percent: 100 },
    { key: "logged_in", label: "Logged in", count: loggedIn, percent: pct(loggedIn, signedUp) },
    {
      key: "connected_channel",
      label: "Connected at least one channel",
      count: connectedChannel,
      percent: pct(connectedChannel, signedUp),
    },
    {
      key: "received_inbound",
      label: "Received first inbound message",
      count: receivedInbound,
      percent: pct(receivedInbound, signedUp),
    },
    {
      key: "sent_reply",
      label: "Sent first reply",
      count: sentReply,
      percent: pct(sentReply, signedUp),
    },
    { key: "used_ai", label: "Used AI Copilot", count: usedAi, percent: pct(usedAi, signedUp) },
    {
      key: "activated_automation",
      label: "Activated automation",
      count: activatedAutomation,
      percent: pct(activatedAutomation, signedUp),
    },
    { key: "became_paid", label: "Became paid", count: becamePaid, percent: pct(becamePaid, signedUp) },
  ];

  return {
    topMetrics: {
      totalUsers,
      activeUsers,
      ghlInstalls: Math.max(ghlInstallCount, ghlUserIds.size),
      shopifyInstalls,
      websiteSignups,
      payingCustomers,
      freeUsers,
      trialUsers,
    },
    channelMetrics: {
      whatsappConnected,
      facebookMessengerConnected,
      instagramConnected,
      anyChannelConnected,
      multipleChannelsConnected,
      embeddedSignupCompleted,
      whatsappPhoneNumberConnected,
      wabaIdPresent,
      phoneNumberIdPresent,
    },
    usageMetrics: {
      conversationsCreated: totalConversations,
      usersWithAtLeastOneConversation: usersWithConversation.size,
      usersWhoSentAtLeastOneMessage: usersWithOutbound.size,
      usersWhoReceivedInboundMessage: usersWithInbound.size,
      aiCopilotUsed: usersWithAi.size,
      aiLeadScoringActive,
      automationsActive: automationsActiveCount,
      templatesUsed,
      rgeEnabled,
      agentPageEnabled,
      inventorySourceConnected,
      shopifyAbandonedCartEnabled,
    },
    funnel,
  };
}

export type ActivationAccountsResult = {
  accounts: ActivationAccountRow[];
  total: number;
  /** @deprecated Use `accounts` — kept for backward compatibility */
  rows: ActivationAccountRow[];
};

export async function getActivationAccounts(
  filters: ActivationAccountsFilters = {},
): Promise<ActivationAccountsResult> {
  try {
    return await loadActivationAccounts(filters);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to build activation accounts";
    console.error("[Admin Activation] getActivationAccounts failed:", message, error);
    throw error instanceof Error ? error : new Error(message);
  }
}

async function loadActivationAccounts(
  filters: ActivationAccountsFilters = {},
): Promise<ActivationAccountsResult> {
  const now = new Date();

  const [ghlUserIds, allUsers, channelRows, conversationCounts, messageAgg, aiRows, activeWorkflowRows, activeTemplateRows, rgeRows, agentPageRows, inventoryRows] =
    await Promise.all([
      getGhlUserIds(),
      db.select().from(users),
      db.select().from(channelSettings),
      db
        .select({
          userId: conversations.userId,
          count: sql<number>`count(*)::int`,
        })
        .from(conversations)
        .groupBy(conversations.userId),
      db
        .select({
          userId: messages.userId,
          sent: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
          received: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::int`,
          lastAt: sql<Date | null>`max(${messages.createdAt})`,
        })
        .from(messages)
        .groupBy(messages.userId),
      db.select({ userId: aiMessageLog.userId }).from(aiMessageLog).groupBy(aiMessageLog.userId),
      db
        .select({ userId: workflows.userId })
        .from(workflows)
        .where(eq(workflows.isActive, true))
        .groupBy(workflows.userId),
      db
        .select({ userId: userAutomationTemplates.userId })
        .from(userAutomationTemplates)
        .where(eq(userAutomationTemplates.isActive, true))
        .groupBy(userAutomationTemplates.userId),
      db
        .select({ userId: growthEngineSetupTasks.userId })
        .from(growthEngineSetupTasks)
        .where(eq(growthEngineSetupTasks.templateId, RGE_TEMPLATE_ID)),
      db
        .select({ userId: aiBusinessKnowledge.userId })
        .from(aiBusinessKnowledge)
        .where(eq(aiBusinessKnowledge.agentPageEnabled, true)),
      db.select({ userId: inventorySources.userId }).from(inventorySources),
    ]);

  const channelByUser = new Map<string, typeof channelRows>();
  for (const row of channelRows) {
    const list = channelByUser.get(row.userId) ?? [];
    list.push(row);
    channelByUser.set(row.userId, list);
  }

  const conversationCountMap = new Map(conversationCounts.map((r) => [r.userId, r.count || 0]));

  const sentMap = new Map<string, number>();
  const receivedMap = new Map<string, number>();
  const lastActivityMap = new Map<string, string>();
  for (const row of messageAgg) {
    sentMap.set(row.userId, row.sent || 0);
    receivedMap.set(row.userId, row.received || 0);
    const lastActivity = serializeActivationDate(row.lastAt);
    if (lastActivity) lastActivityMap.set(row.userId, lastActivity);
  }

  const aiUserIds = new Set(aiRows.map((r) => r.userId));
  const automationUserIds = new Set([
    ...activeWorkflowRows.map((r) => r.userId),
    ...activeTemplateRows.map((r) => r.userId),
  ]);
  const rgeUserIds = new Set(rgeRows.map((r) => r.userId));
  const agentPageUserIds = new Set(agentPageRows.map((r) => r.userId));
  const inventoryUserIds = new Set(inventoryRows.map((r) => r.userId));

  let rows: ActivationAccountRow[] = allUsers.map((user) => {
    const connections = deriveAdminUserChannelConnections({
      user,
      channelSettings: (channelByUser.get(user.id) ?? []).map((row) => ({
        channel: row.channel,
        isConnected: row.isConnected,
        isEnabled: row.isEnabled,
        config: row.config,
      })),
    });
    const plan = getEffectivePlanForUser(user, now);
    const conversationsCount = conversationCountMap.get(user.id) || 0;

    return {
      id: user.id,
      name: user.name || "Unknown",
      email: user.email,
      source: deriveUserSource(user, ghlUserIds),
      plan,
      subscriptionStatus: user.subscriptionStatus || "unknown",
      trialStatus: user.trialStatus || "none",
      whatsappConnected: connections.whatsappConnected,
      facebookConnected: connections.facebook.state === "connected",
      instagramConnected: connections.instagram.state === "connected",
      conversationsCount,
      messagesSent: sentMap.get(user.id) || 0,
      messagesReceived: receivedMap.get(user.id) || 0,
      aiUsed: aiUserIds.has(user.id),
      automationsActive: automationUserIds.has(user.id),
      rgeEnabled: rgeUserIds.has(user.id),
      agentPageEnabled: agentPageUserIds.has(user.id),
      inventoryConnected: inventoryUserIds.has(user.id),
      lastActivity: lastActivityMap.get(user.id) ?? null,
      createdAt: serializeActivationDate(user.createdAt),
    };
  });

  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }
  if (filters.source && filters.source !== "all") {
    rows = rows.filter((r) => r.source.toLowerCase() === filters.source!.toLowerCase());
  }
  if (filters.plan && filters.plan !== "all") {
    rows = rows.filter((r) => r.plan === filters.plan);
  }
  if (filters.status && filters.status !== "all") {
    rows = rows.filter((r) => r.subscriptionStatus === filters.status);
  }
  if (filters.channelConnected === "yes") {
    rows = rows.filter((r) => r.whatsappConnected || r.facebookConnected || r.instagramConnected);
  } else if (filters.channelConnected === "no") {
    rows = rows.filter((r) => !r.whatsappConnected && !r.facebookConnected && !r.instagramConnected);
  }
  if (filters.hasConversations === "yes") {
    rows = rows.filter((r) => r.conversationsCount > 0);
  } else if (filters.hasConversations === "no") {
    rows = rows.filter((r) => r.conversationsCount === 0);
  }
  if (filters.trial === "yes") {
    rows = rows.filter((r) => r.trialStatus === "active");
  } else if (filters.trial === "no") {
    rows = rows.filter((r) => r.trialStatus !== "active");
  }
  if (filters.paying === "yes") {
    rows = rows.filter((r) => r.plan !== "free");
  } else if (filters.paying === "no") {
    rows = rows.filter((r) => r.plan === "free");
  }

  rows.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  const total = rows.length;
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  const accounts = rows.slice(offset, offset + limit);
  return { total, accounts, rows: accounts };
}
