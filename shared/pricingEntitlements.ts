/**
 * Public pricing + in-app plan comparison presentation.
 * Derived from PLAN_LIMITS + Prospect AI quotas (confirmed public differentiators).
 *
 * Public commercial model: Free and Pro. AI Brain is included with Pro.
 * Starter remains in PLAN_LIMITS for grandfathered billing rows only.
 *
 * Inbox AI reply generation ceilings live in shared/inboxAiReplyGenerations.ts
 * (re-exported below for compatibility). Do not surface those numbers publicly.
 */

import { PLAN_LIMITS, type SubscriptionPlan } from "./schema";
import { PROSPECT_AI_MONTHLY_QUOTAS } from "./prospectAI";

/** Connect business tools/channels. Available on Free. */
export function planAllowsIntegrations(plan: SubscriptionPlan): boolean {
  return PLAN_LIMITS[plan].integrationsEnabled;
}

export function limitsAllowIntegrations(
  limits: { integrationsEnabled?: boolean } | null | undefined,
): boolean {
  return !!limits?.integrationsEnabled;
}

/** View, sync, and send approved WhatsApp templates 1:1. Available on Free. */
export function planAllowsBasicTemplateMessaging(plan: SubscriptionPlan): boolean {
  return PLAN_LIMITS[plan].templatesEnabled;
}

export function limitsAllowBasicTemplateMessaging(
  limits: { templatesEnabled?: boolean } | null | undefined,
): boolean {
  return !!limits?.templatesEnabled;
}

/**
 * Preset campaigns, mass enrollment, and automation sequences.
 * Reuses workflowsEnabled (Starter/Pro) — not a new pricing tier.
 */
export function planAllowsTemplateCampaigns(plan: SubscriptionPlan): boolean {
  return PLAN_LIMITS[plan].workflowsEnabled;
}

export function limitsAllowTemplateCampaigns(
  limits: { workflowsEnabled?: boolean } | null | undefined,
): boolean {
  return !!limits?.workflowsEnabled;
}

export const TEMPLATE_CAMPAIGNS_REQUIRE_PAID_MESSAGE =
  "Campaign and bulk template automation requires Pro";

export const INTEGRATIONS_UNAVAILABLE_MESSAGE = "Integrations are not available on your plan";

export const BASIC_TEMPLATE_MESSAGING_UNAVAILABLE_MESSAGE =
  "Template messaging is not available on your plan";

export {
  AI_ASSIST_FAIR_USE_MONTHLY_THRESHOLD,
  AI_ASSIST_MONTHLY_CREDITS,
  INBOX_AI_REPLY_FAIR_USE_MONTHLY_THRESHOLD,
  INBOX_AI_REPLY_GENERATIONS_MONTHLY,
  countInboxAiReplyGenerations,
  hasUsableInboxAiReplyText,
  shouldRecordInboxAiReplyGeneration,
} from "./inboxAiReplyGenerations";

/**
 * INTERNAL — legacy Brain generation bonus. Kept at 0: AI Brain has no separate
 * customer-visible quota; plan inbox-reply ceilings + fair-use cover abuse protection.
 */
export const AI_BRAIN_PRO_CREDIT_BONUS = 0;

/**
 * Historical AI Brain add-on list price. Not a public SKU.
 * Webhooks still match Stripe items billed at this amount.
 */
export const LEGACY_AI_BRAIN_ADDON_PRICE_USD = 29;
/** @deprecated Use LEGACY_AI_BRAIN_ADDON_PRICE_USD — not a public price. */
export const AI_BRAIN_ADDON_PRICE_USD = LEGACY_AI_BRAIN_ADDON_PRICE_USD;

/** Annual Stripe amounts. Starter yearly is grandfathered only. */
export const PAID_PLAN_YEARLY_PRICE_USD = {
  starter: 190,
  pro: 490,
} as const;

export type PaidPlanId = keyof typeof PAID_PLAN_YEARLY_PRICE_USD;
export type BillingInterval = "monthly" | "yearly";

export function getPaidPlanMonthlyPriceUsd(plan: PaidPlanId): number {
  return PLAN_LIMITS[plan].price;
}

export function getPaidPlanYearlyPriceUsd(plan: PaidPlanId): number {
  return PAID_PLAN_YEARLY_PRICE_USD[plan];
}

/** Equivalent monthly from yearly ÷ 12, rounded to cents (e.g. 190 → 15.83). */
export function getYearlyEquivalentMonthlyUsd(plan: PaidPlanId): number {
  return Math.round((getPaidPlanYearlyPriceUsd(plan) / 12) * 100) / 100;
}

export function getPaidPlanDisplayAmountUsd(
  plan: PaidPlanId,
  interval: BillingInterval,
): number {
  return interval === "yearly"
    ? getYearlyEquivalentMonthlyUsd(plan)
    : getPaidPlanMonthlyPriceUsd(plan);
}

export function formatUsdDisplay(amount: number): string {
  const cents = Math.round(amount * 100);
  const hasCents = cents % 100 !== 0;
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export type PricingCompareCell = boolean | string;

export type PricingCompareRow = {
  group: string;
  featureKey: string;
  free: PricingCompareCell;
  pro: PricingCompareCell;
};

function formatUsers(maxUsers: number): string {
  if (maxUsers < 0) return "Unlimited";
  if (maxUsers === 1) return "1";
  return `Up to ${maxUsers}`;
}

function formatConversations(n: number): string {
  return n.toLocaleString("en-US");
}

/** Compact public entitlements for cards / upgrade prompts (no AI Assist quota numbers). */
export function getPlanPricingHighlights(plan: SubscriptionPlan): string[] {
  const limits = PLAN_LIMITS[plan];
  const discoveries = PROSPECT_AI_MONTHLY_QUOTAS[plan];
  const lines = [
    `${discoveries} Prospect AI discoveries/month`,
    `${formatConversations(limits.conversationsPerMonth)} active conversations`,
    `${formatUsers(limits.maxUsers)} ${limits.maxUsers === 1 ? "user" : "users"}`,
    limits.maxWhatsappNumbers === 1
      ? "1 WhatsApp Business account"
      : `Up to ${limits.maxWhatsappNumbers} WhatsApp Business accounts`,
    "Multi-channel Inbox",
  ];
  if (limits.integrationsEnabled) {
    lines.push("Connect integrations");
  }
  if (limits.templatesEnabled) {
    lines.push(
      limits.workflowsEnabled ? "WhatsApp templates + automation" : "Basic WhatsApp templates",
    );
  }
  if (limits.chatbotEnabled) {
    lines.push("AI Chatbot & Website Widget");
  }
  if (limits.workflowsEnabled) {
    lines.push("Workflow Automation");
  }
  if (plan === "pro") {
    lines.push("AI Brain included");
    lines.push("Required plan for Industry Growth Engines");
  }
  return lines;
}

export function getAiBrainAddonHighlights(): string[] {
  return [
    "Learns your business",
    "Uses company knowledge",
    "Connects Offers & Payment Links",
    "Improves Prospect AI personalization",
    "Smarter AI Copilot",
    "Better recommendations",
  ];
}

/** Grouped comparison rows for public pricing + in-app tables. */
export function buildPricingCompareRows(opts?: {
  includeGrowthEngines?: boolean;
}): PricingCompareRow[] {
  const includeGrowthEngines = opts?.includeGrowthEngines !== false;
  const free = PLAN_LIMITS.free;
  const pro = PLAN_LIMITS.pro;

  const rows: PricingCompareRow[] = [
    {
      group: "MESSAGING",
      featureKey: "activeConversations",
      free: formatConversations(free.conversationsPerMonth),
      pro: formatConversations(pro.conversationsPerMonth),
    },
    {
      group: "MESSAGING",
      featureKey: "users",
      free: formatUsers(free.maxUsers),
      pro: formatUsers(pro.maxUsers),
    },
    {
      group: "MESSAGING",
      featureKey: "whatsappNumbers",
      free: String(free.maxWhatsappNumbers),
      pro: `Up to ${pro.maxWhatsappNumbers}`,
    },
    {
      group: "MESSAGING",
      featureKey: "unifiedInbox",
      free: true,
      pro: true,
    },
    {
      group: "MESSAGING",
      featureKey: "supportedChannels",
      free: "Connected channels",
      pro: "Connected channels",
    },
    {
      group: "MESSAGING",
      featureKey: "templateMessaging",
      free: "Approved 1:1 template sends",
      pro: "Templates with workflow automation",
    },
    {
      group: "PROSPECT AI",
      featureKey: "prospectDiscoveries",
      free: `${PROSPECT_AI_MONTHLY_QUOTAS.free}/month`,
      pro: `${PROSPECT_AI_MONTHLY_QUOTAS.pro}/month`,
    },
    {
      group: "PROSPECT AI",
      featureKey: "prospectReview",
      free: true,
      pro: true,
    },
    {
      group: "PROSPECT AI",
      featureKey: "prospectCampaigns",
      free: true,
      pro: true,
    },
    {
      group: "PROSPECT AI",
      featureKey: "messageCreation",
      free: true,
      pro: true,
    },
    {
      group: "PROSPECT AI",
      featureKey: "prospectArchive",
      free: true,
      pro: true,
    },
    {
      group: "CHATBOT",
      featureKey: "chatbotWidget",
      free: false,
      pro: true,
    },
    {
      group: "AUTOMATION",
      featureKey: "workflowAutomation",
      free: false,
      pro: true,
    },
    {
      group: "AUTOMATION",
      featureKey: "followUps",
      free: false,
      pro: true,
    },
    {
      group: "AI",
      featureKey: "aiBrain",
      free: "Not included after trial",
      pro: "Included",
    },
    {
      group: "TEAM",
      featureKey: "assignment",
      free: false,
      pro: true,
    },
    {
      group: "SUPPORT",
      featureKey: "integrations",
      free: true,
      pro: true,
    },
  ];

  if (includeGrowthEngines) {
    rows.push({
      group: "GROWTH ENGINES",
      featureKey: "growthEngines",
      free: false,
      pro: "Growth Engine Ready",
    });
  }

  return rows;
}

export function getProspectAiQuotaLabel(plan: SubscriptionPlan): string {
  return `${PROSPECT_AI_MONTHLY_QUOTAS[plan]} Prospect AI discoveries/month`;
}
