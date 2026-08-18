/**
 * Public pricing + in-app plan comparison presentation.
 * Derived from PLAN_LIMITS + Prospect AI quotas (confirmed public differentiators).
 *
 * Public commercial model (no numbers): Starter = AI Assist Basic (fair use),
 * Pro = AI Assist Enhanced (fair use), AI Brain = advanced intelligence (fair use).
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
  "Campaign and bulk template automation requires Starter or Pro";

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

export const AI_BRAIN_ADDON_PRICE_USD = 29;

export type PricingCompareCell = boolean | string;

export type PricingCompareRow = {
  group: string;
  featureKey: string;
  free: PricingCompareCell;
  starter: PricingCompareCell;
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
  const starter = PLAN_LIMITS.starter;
  const pro = PLAN_LIMITS.pro;

  const rows: PricingCompareRow[] = [
    {
      group: "MESSAGING",
      featureKey: "activeConversations",
      free: formatConversations(free.conversationsPerMonth),
      starter: formatConversations(starter.conversationsPerMonth),
      pro: formatConversations(pro.conversationsPerMonth),
    },
    {
      group: "MESSAGING",
      featureKey: "users",
      free: formatUsers(free.maxUsers),
      starter: formatUsers(starter.maxUsers),
      pro: formatUsers(pro.maxUsers),
    },
    {
      group: "MESSAGING",
      featureKey: "whatsappNumbers",
      free: String(free.maxWhatsappNumbers),
      starter: String(starter.maxWhatsappNumbers),
      pro: `Up to ${pro.maxWhatsappNumbers}`,
    },
    {
      group: "MESSAGING",
      featureKey: "unifiedInbox",
      free: true,
      starter: true,
      pro: true,
    },
    {
      group: "MESSAGING",
      featureKey: "supportedChannels",
      free: "Connected channels",
      starter: "Connected channels",
      pro: "Connected channels",
    },
    {
      group: "MESSAGING",
      featureKey: "templateMessaging",
      free: "Approved 1:1 template sends",
      starter: "Templates with workflow automation",
      pro: "Templates with workflow automation",
    },
    {
      group: "PROSPECT AI",
      featureKey: "prospectDiscoveries",
      free: `${PROSPECT_AI_MONTHLY_QUOTAS.free}/month`,
      starter: `${PROSPECT_AI_MONTHLY_QUOTAS.starter}/month`,
      pro: `${PROSPECT_AI_MONTHLY_QUOTAS.pro}/month`,
    },
    {
      group: "PROSPECT AI",
      featureKey: "prospectReview",
      free: true,
      starter: true,
      pro: true,
    },
    {
      group: "PROSPECT AI",
      featureKey: "prospectCampaigns",
      free: true,
      starter: true,
      pro: true,
    },
    {
      group: "PROSPECT AI",
      featureKey: "messageCreation",
      free: true,
      starter: true,
      pro: true,
    },
    {
      group: "PROSPECT AI",
      featureKey: "prospectArchive",
      free: true,
      starter: true,
      pro: true,
    },
    {
      group: "CHATBOT",
      featureKey: "chatbotWidget",
      free: false,
      starter: true,
      pro: true,
    },
    {
      group: "AUTOMATION",
      featureKey: "workflowAutomation",
      free: false,
      starter: true,
      pro: true,
    },
    {
      group: "AUTOMATION",
      featureKey: "followUps",
      free: false,
      starter: true,
      pro: true,
    },
    {
      group: "AI",
      featureKey: "aiBrainAddon",
      free: "Not included",
      starter: "Add-on",
      pro: "Add-on",
    },
    {
      group: "TEAM",
      featureKey: "assignment",
      free: false,
      starter: false,
      pro: true,
    },
    {
      group: "SUPPORT",
      featureKey: "integrations",
      free: true,
      starter: true,
      pro: true,
    },
  ];

  if (includeGrowthEngines) {
    rows.push({
      group: "GROWTH ENGINES",
      featureKey: "growthEngines",
      free: false,
      starter: false,
      pro: "Growth Engine Ready",
    });
  }

  return rows;
}

export function getProspectAiQuotaLabel(plan: SubscriptionPlan): string {
  return `${PROSPECT_AI_MONTHLY_QUOTAS[plan]} Prospect AI discoveries/month`;
}
