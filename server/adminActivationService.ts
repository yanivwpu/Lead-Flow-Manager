import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  aiBusinessKnowledge,
  aiMessageLog,
  aiSettings,
  channelSettings,
  contacts,
  conversations,
  growthEngineSetupTasks,
  inventorySources,
  messages,
  userAutomationTemplates,
  users,
  userSessions,
  workflows,
} from "@shared/schema";
import { deriveAdminUserChannelConnections } from "@shared/adminChannelConnectionStatus";
import {
  REAL_ACTIVATION_CHANNELS,
  type ActivationBillingBadge,
  type ActivationMessageProvider,
  buildUserMessageActivationStats,
  deriveActivationBillingBadge,
  deriveActivationChannelConnections,
  isExcludedActivationAccount,
  type ChannelMessageCounts,
} from "@shared/adminActivationMetrics";
import { getEffectivePlanForUser } from "./subscriptionService";
import { computeTrialStatus, isProAiTrialActive } from "./trialEntitlements";
import {
  countActiveGhlMarketplaceInstalls,
  getGhlMarketplacePaidUserIds,
  getGhlUserIds,
} from "./ghlMarketplaceService";
import { RGE_TEMPLATE_ID } from "@shared/rgePaths";

export type ActivationFunnelStep = {
  key: string;
  label: string;
  count: number;
  percent: number;
};

export type ActivationPaidBillingSource = "website_stripe" | "shopify" | "ghl_marketplace";

export type ActivationSummary = {
  topMetrics: {
    totalUsers: number;
    activeUsers: number;
    ghlInstalls: number;
    shopifyInstalls: number;
    websiteSignups: number;
    /** Confirmed paid billing only — excludes Pro/Pro AI trials */
    payingCustomers: number;
    paidSubscribers: number;
    proTrialUsers: number;
    websitePaidUsers: number;
    shopifyPaidUsers: number;
    marketplacePaidUsers: number;
    freeUsers: number;
    /** @deprecated Alias for proTrialUsers */
    trialUsers: number;
  };
  channelMetrics: {
    whatsappConnected: number;
    facebookMessengerConnected: number;
    instagramConnected: number;
    shopifyConnected: number;
    ghlConnected: number;
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
    accountsWithOrphanMessages: number;
  };
  funnel: ActivationFunnelStep[];
};

export type ActivationAccountRow = {
  id: string;
  name: string;
  email: string;
  source: "CRM" | "Shopify" | "Website" | "Partner";
  /** Effective plan (includes trial Pro) */
  plan: string;
  billingPlan: string;
  billingBadge: ActivationBillingBadge;
  subscriptionStatus: string;
  trialStatus: string;
  isPaying: boolean;
  isProTrial: boolean;
  paidBillingSource: ActivationPaidBillingSource | null;
  whatsappConnected: boolean;
  facebookConnected: boolean;
  instagramConnected: boolean;
  shopifyConnected: boolean;
  ghlConnected: boolean;
  conversationsCount: number;
  /** Real customer-channel messages only (excludes webchat/sms/test) */
  messagesSent: number;
  messagesReceived: number;
  messageSources: ActivationMessageProvider[];
  unknownMessageSources: string[];
  warningFlags: string[];
  aiUsed: boolean;
  automationsActive: boolean;
  rgeEnabled: boolean;
  agentPageEnabled: boolean;
  inventoryConnected: boolean;
  /** Last activity on a real connected customer channel */
  lastRealActivity: string | null;
  /** @deprecated Use lastRealActivity */
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

const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "cancelled",
  "past_due",
  "unpaid",
  "incomplete",
  "incomplete_expired",
]);

export type ActivationBillingClassification = {
  isPaidSubscriber: boolean;
  isProTrial: boolean;
  paidBillingSource: ActivationPaidBillingSource | null;
};

/** Pro / Pro AI app trial — not a paid subscription. */
export function isActivationProTrial(
  user: typeof users.$inferSelect,
  now: Date = new Date(),
): boolean {
  if (isProAiTrialActive(user, now)) return true;
  return computeTrialStatus(user, now) === "active";
}

function hasConfirmedWebsiteStripeBilling(user: typeof users.$inferSelect): boolean {
  const billingPlan = (user.billingPlan || "free").toLowerCase();
  if (billingPlan === "free") return false;

  const status = (user.subscriptionStatus || "").toLowerCase();
  if (INACTIVE_SUBSCRIPTION_STATUSES.has(status)) return false;
  if (status !== "active") return false;

  return !!(user.stripeSubscriptionId || user.stripeCustomerId);
}

function hasConfirmedShopifyBilling(user: typeof users.$inferSelect): boolean {
  const billingPlan = (user.billingPlan || "free").toLowerCase();
  if (billingPlan === "free") return false;
  if (!user.shopifyShop) return false;
  return (user.shopifySubscriptionStatus || "").toLowerCase() === "active";
}

/**
 * Paid = confirmed billing record only. Trial Pro / effective-plan Pro ≠ paying.
 * Does not count admin plan overrides without Stripe/Shopify/GHL marketplace billing.
 */
export function classifyActivationBilling(
  user: typeof users.$inferSelect,
  ghlMarketplacePaidUserIds: Set<string>,
  now: Date = new Date(),
): ActivationBillingClassification {
  if (isActivationProTrial(user, now)) {
    return { isPaidSubscriber: false, isProTrial: true, paidBillingSource: null };
  }

  if (hasConfirmedShopifyBilling(user)) {
    return { isPaidSubscriber: true, isProTrial: false, paidBillingSource: "shopify" };
  }

  if (hasConfirmedWebsiteStripeBilling(user)) {
    return { isPaidSubscriber: true, isProTrial: false, paidBillingSource: "website_stripe" };
  }

  if (ghlMarketplacePaidUserIds.has(user.id)) {
    return { isPaidSubscriber: true, isProTrial: false, paidBillingSource: "ghl_marketplace" };
  }

  return { isPaidSubscriber: false, isProTrial: false, paidBillingSource: null };
}

function deriveUserSource(
  user: typeof users.$inferSelect,
  ghlUserIds: Set<string>,
): ActivationAccountRow["source"] {
  if (ghlUserIds.has(user.id)) return "CRM";
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

/** Exclude test/demo/seed accounts and contacts from message aggregates. */
function realMessageSqlConditions() {
  return and(
    sql`lower(${users.email}) != 'demo@whachat.com'`,
    sql`lower(${users.email}) not like '%@test.com'`,
    sql`lower(${users.email}) not like '%@shopify.whachatcrm.com'`,
    sql`coalesce(${contacts.notes}, '') not ilike '%test lead%'`,
    sql`coalesce(${contacts.notes}, '') not ilike '%this is a test%'`,
  );
}

async function fetchMessageStatsByUserChannel(): Promise<Map<string, Map<string, ChannelMessageCounts>>> {
  const rows = await db
    .select({
      userId: messages.userId,
      channel: conversations.channel,
      sent: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
      received: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::int`,
      lastAt: sql<Date | null>`max(${messages.createdAt})`,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .innerJoin(contacts, eq(messages.contactId, contacts.id))
    .innerJoin(users, eq(messages.userId, users.id))
    .where(realMessageSqlConditions())
    .groupBy(messages.userId, conversations.channel);

  const byUser = new Map<string, Map<string, ChannelMessageCounts>>();
  for (const row of rows) {
    let channels = byUser.get(row.userId);
    if (!channels) {
      channels = new Map();
      byUser.set(row.userId, channels);
    }
    channels.set(row.channel, {
      sent: row.sent || 0,
      received: row.received || 0,
      lastAt: row.lastAt,
    });
  }
  return byUser;
}

function mapChannelSettingsRows(channelRows: (typeof channelSettings.$inferSelect)[]) {
  const channelByUser = new Map<string, typeof channelRows>();
  for (const row of channelRows) {
    const list = channelByUser.get(row.userId) ?? [];
    list.push(row);
    channelByUser.set(row.userId, list);
  }
  return channelByUser;
}

function deriveUserConnections(
  user: typeof users.$inferSelect,
  channelByUser: Map<string, (typeof channelSettings.$inferSelect)[]>,
  ghlUserIds: Set<string>,
) {
  const meta = deriveAdminUserChannelConnections({
    user,
    channelSettings: (channelByUser.get(user.id) ?? []).map((row) => ({
      channel: row.channel,
      isConnected: row.isConnected,
      isEnabled: row.isEnabled,
      config: row.config,
    })),
  });

  return {
    meta,
    activation: deriveActivationChannelConnections({
      user,
      whatsappConnected: meta.whatsappConnected,
      facebookConnected: meta.facebook.state === "connected",
      instagramConnected: meta.instagram.state === "connected",
      ghlUserIds,
    }),
  };
}

function isMetricUser(userId: string, userEmailById: Map<string, string>): boolean {
  return !isExcludedActivationAccount(userEmailById.get(userId));
}

export async function getActivationSummary(): Promise<ActivationSummary> {
  const now = new Date();
  const [
    allUsers,
    ghlUserIds,
    ghlMarketplacePaidUserIds,
    ghlInstallCount,
    channelRows,
    messageStatsByUser,
    conversationCounts,
    aiUsers,
    activeWorkflowUsers,
    activeTemplateUsers,
    sessionUsers,
    aiLeadScoringActive,
    templatesUsed,
    rgeEnabled,
    agentPageEnabled,
    inventorySourceConnected,
    shopifyAbandonedCartEnabled,
  ] = await Promise.all([
    db.select().from(users),
    getGhlUserIds(),
    getGhlMarketplacePaidUserIds(),
    countActiveGhlMarketplaceInstalls(),
    db.select().from(channelSettings),
    fetchMessageStatsByUserChannel(),
    db
      .select({
        userId: conversations.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(conversations)
      .where(inArray(conversations.channel, [...REAL_ACTIVATION_CHANNELS]))
      .groupBy(conversations.userId),
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
      .select({ userId: sql<string>`(${userSessions.sess}->'passport'->>'user')` })
      .from(userSessions)
      .where(sql`${userSessions.expire} > NOW()`),
    db
      .select({ userId: aiSettings.userId })
      .from(aiSettings)
      .where(eq(aiSettings.leadQualificationEnabled, true))
      .then((rows) => rows.length),
    db
      .select({ userId: userAutomationTemplates.userId })
      .from(userAutomationTemplates)
      .groupBy(userAutomationTemplates.userId)
      .then((rows) => rows.length),
    db
      .select({ userId: growthEngineSetupTasks.userId })
      .from(growthEngineSetupTasks)
      .where(eq(growthEngineSetupTasks.templateId, RGE_TEMPLATE_ID))
      .groupBy(growthEngineSetupTasks.userId)
      .then((rows) => rows.length),
    db
      .select({ userId: aiBusinessKnowledge.userId })
      .from(aiBusinessKnowledge)
      .where(eq(aiBusinessKnowledge.agentPageEnabled, true))
      .then((rows) => rows.length),
    db
      .select({ userId: inventorySources.userId })
      .from(inventorySources)
      .groupBy(inventorySources.userId)
      .then((rows) => rows.length),
    db
      .select({ userId: userAutomationTemplates.userId })
      .from(userAutomationTemplates)
      .where(
        and(
          eq(userAutomationTemplates.category, "abandoned_cart"),
          eq(userAutomationTemplates.isActive, true),
        ),
      )
      .groupBy(userAutomationTemplates.userId)
      .then((rows) => rows.length),
  ]);

  const userEmailById = new Map(allUsers.map((u) => [u.id, u.email]));
  const metricUsers = allUsers.filter((u) => !isExcludedActivationAccount(u.email));
  const shopifyInstalls = metricUsers.filter((u) => u.shopifyInstalledAt || u.shopifyShop).length;
  const websiteSignups = metricUsers.filter(
    (u) => !ghlUserIds.has(u.id) && !u.shopifyInstalledAt && !u.shopifyShop,
  ).length;

  let proTrialUsers = 0;
  let freeUsers = 0;
  let paidSubscribers = 0;
  let websitePaidUsers = 0;
  let shopifyPaidUsers = 0;
  let marketplacePaidUsers = 0;

  const channelByUser = mapChannelSettingsRows(channelRows);

  let whatsappConnected = 0;
  let facebookMessengerConnected = 0;
  let instagramConnected = 0;
  let shopifyConnectedCount = 0;
  let ghlConnectedCount = 0;
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
  let accountsWithOrphanMessages = 0;

  for (const user of metricUsers) {
    const billing = classifyActivationBilling(user, ghlMarketplacePaidUserIds, now);
    const effectivePlan = getEffectivePlanForUser(user, now);

    if (billing.isProTrial) proTrialUsers++;
    if (billing.isPaidSubscriber) {
      paidSubscribers++;
      if (billing.paidBillingSource === "website_stripe") websitePaidUsers++;
      if (billing.paidBillingSource === "shopify") shopifyPaidUsers++;
      if (billing.paidBillingSource === "ghl_marketplace") marketplacePaidUsers++;
    }
    if (effectivePlan === "free" && !billing.isPaidSubscriber && !billing.isProTrial) freeUsers++;

    const { activation } = deriveUserConnections(user, channelByUser, ghlUserIds);

    if (activation.whatsappConnected) whatsappConnected++;
    if (activation.facebookConnected) facebookMessengerConnected++;
    if (activation.instagramConnected) instagramConnected++;
    if (activation.shopifyConnected) shopifyConnectedCount++;
    if (activation.ghlConnected) ghlConnectedCount++;

    if (activation.hasAnyActivationChannel) {
      anyChannelConnected++;
      usersWithChannel.add(user.id);
    }

    const connectedCount = [
      activation.whatsappConnected,
      activation.facebookConnected,
      activation.instagramConnected,
      activation.shopifyConnected,
      activation.ghlConnected,
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

    if (billing.isPaidSubscriber) usersPaid.add(user.id);

    const msgStats = buildUserMessageActivationStats({
      channelCounts: messageStatsByUser.get(user.id) ?? new Map(),
      connections: activation,
      serializeDate: serializeActivationDate,
    });

    if (msgStats.warningFlags.length > 0) accountsWithOrphanMessages++;

    if (msgStats.funnelReceived > 0) usersWithInbound.add(user.id);
    if (msgStats.funnelSent > 0) usersWithOutbound.add(user.id);
  }

  const totalConversations = conversationCounts.reduce((sum, r) => sum + (r.count || 0), 0);
  for (const row of conversationCounts) {
    if (isMetricUser(row.userId, userEmailById)) usersWithConversation.add(row.userId);
  }

  for (const row of aiUsers) {
    if (isMetricUser(row.userId, userEmailById)) usersWithAi.add(row.userId);
  }
  for (const row of [...activeWorkflowUsers, ...activeTemplateUsers]) {
    if (isMetricUser(row.userId, userEmailById)) usersWithAutomation.add(row.userId);
  }
  for (const row of sessionUsers) {
    if (row.userId && isMetricUser(row.userId, userEmailById)) usersLoggedIn.add(row.userId);
  }

  const automationsActiveCount = usersWithAutomation.size;
  const totalUsers = metricUsers.length;
  const activeUsers = usersLoggedIn.size || usersWithConversation.size;

  const signedUp = totalUsers;
  const loggedIn = usersLoggedIn.size;
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
      payingCustomers: paidSubscribers,
      paidSubscribers,
      proTrialUsers,
      websitePaidUsers,
      shopifyPaidUsers,
      marketplacePaidUsers,
      freeUsers,
      trialUsers: proTrialUsers,
    },
    channelMetrics: {
      whatsappConnected,
      facebookMessengerConnected,
      instagramConnected,
      shopifyConnected: shopifyConnectedCount,
      ghlConnected: ghlConnectedCount,
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
      accountsWithOrphanMessages,
    },
    funnel,
  };
}

export type ActivationAccountsResult = {
  accounts: ActivationAccountRow[];
  total: number;
  /** @deprecated Use `accounts` — kept for backward compatibility */
  rows: ActivationAccountRow[];
  accountsWithOrphanMessages: number;
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

  const [
    ghlUserIds,
    ghlMarketplacePaidUserIds,
    allUsers,
    channelRows,
    conversationCounts,
    messageStatsByUser,
    aiRows,
    activeWorkflowRows,
    activeTemplateRows,
    rgeRows,
    agentPageRows,
    inventoryRows,
  ] = await Promise.all([
    getGhlUserIds(),
    getGhlMarketplacePaidUserIds(),
    db.select().from(users),
    db.select().from(channelSettings),
    db
      .select({
        userId: conversations.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(conversations)
      .where(inArray(conversations.channel, [...REAL_ACTIVATION_CHANNELS]))
      .groupBy(conversations.userId),
    fetchMessageStatsByUserChannel(),
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

  const channelByUser = mapChannelSettingsRows(channelRows);
  const conversationCountMap = new Map(conversationCounts.map((r) => [r.userId, r.count || 0]));

  const aiUserIds = new Set(aiRows.map((r) => r.userId));
  const automationUserIds = new Set([
    ...activeWorkflowRows.map((r) => r.userId),
    ...activeTemplateRows.map((r) => r.userId),
  ]);
  const rgeUserIds = new Set(rgeRows.map((r) => r.userId));
  const agentPageUserIds = new Set(agentPageRows.map((r) => r.userId));
  const inventoryUserIds = new Set(inventoryRows.map((r) => r.userId));

  let accountsWithOrphanMessages = 0;

  let rows: ActivationAccountRow[] = allUsers.map((user) => {
    const { activation } = deriveUserConnections(user, channelByUser, ghlUserIds);
    const plan = getEffectivePlanForUser(user, now);
    const conversationsCount = conversationCountMap.get(user.id) || 0;
    const billing = classifyActivationBilling(user, ghlMarketplacePaidUserIds, now);
    const billingBadge = deriveActivationBillingBadge(user, billing);
    const msgStats = buildUserMessageActivationStats({
      channelCounts: messageStatsByUser.get(user.id) ?? new Map(),
      connections: activation,
      serializeDate: serializeActivationDate,
    });

    if (msgStats.warningFlags.length > 0) accountsWithOrphanMessages++;

    return {
      id: user.id,
      name: user.name || "Unknown",
      email: user.email,
      source: deriveUserSource(user, ghlUserIds),
      plan,
      billingPlan: user.billingPlan || "free",
      billingBadge,
      subscriptionStatus: user.subscriptionStatus || "unknown",
      trialStatus: user.trialStatus || "none",
      isPaying: billing.isPaidSubscriber,
      isProTrial: billing.isProTrial,
      paidBillingSource: billing.paidBillingSource,
      whatsappConnected: activation.whatsappConnected,
      facebookConnected: activation.facebookConnected,
      instagramConnected: activation.instagramConnected,
      shopifyConnected: activation.shopifyConnected,
      ghlConnected: activation.ghlConnected,
      conversationsCount,
      messagesSent: msgStats.messagesSent,
      messagesReceived: msgStats.messagesReceived,
      messageSources: msgStats.messageSources,
      unknownMessageSources: msgStats.unknownMessageSources,
      warningFlags: msgStats.warningFlags,
      aiUsed: aiUserIds.has(user.id),
      automationsActive: automationUserIds.has(user.id),
      rgeEnabled: rgeUserIds.has(user.id),
      agentPageEnabled: agentPageUserIds.has(user.id),
      inventoryConnected: inventoryUserIds.has(user.id),
      lastRealActivity: msgStats.lastRealActivity,
      lastActivity: msgStats.lastRealActivity,
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
    const want = filters.source.toLowerCase();
    rows = rows.filter((r) => {
      const src = r.source.toLowerCase();
      if (want === "ghl" || want === "leadconnector") return src === "crm";
      return src === want;
    });
  }
  if (filters.plan && filters.plan !== "all") {
    rows = rows.filter((r) => r.plan === filters.plan);
  }
  if (filters.status && filters.status !== "all") {
    rows = rows.filter((r) => r.subscriptionStatus === filters.status);
  }
  if (filters.channelConnected === "yes") {
    rows = rows.filter(
      (r) =>
        r.whatsappConnected ||
        r.facebookConnected ||
        r.instagramConnected ||
        r.shopifyConnected ||
        r.ghlConnected,
    );
  } else if (filters.channelConnected === "no") {
    rows = rows.filter(
      (r) =>
        !r.whatsappConnected &&
        !r.facebookConnected &&
        !r.instagramConnected &&
        !r.shopifyConnected &&
        !r.ghlConnected,
    );
  }
  if (filters.hasConversations === "yes") {
    rows = rows.filter((r) => r.conversationsCount > 0);
  } else if (filters.hasConversations === "no") {
    rows = rows.filter((r) => r.conversationsCount === 0);
  }
  if (filters.trial === "yes") {
    rows = rows.filter((r) => r.isProTrial);
  } else if (filters.trial === "no") {
    rows = rows.filter((r) => !r.isProTrial);
  }
  if (filters.paying === "yes") {
    rows = rows.filter((r) => r.isPaying);
  } else if (filters.paying === "no") {
    rows = rows.filter((r) => !r.isPaying);
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
  return { total, accounts, rows: accounts, accountsWithOrphanMessages };
}
