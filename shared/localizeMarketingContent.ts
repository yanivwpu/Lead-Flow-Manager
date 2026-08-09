/**
 * Locale merge helpers for public marketing pages and chrome.
 * English base content stays authoritative; es/he overlays supply visible copy.
 */

import { mergeMarketingContent, normalizeMarketingLocale, type MarketingLocale } from "./marketingLocale";
import { PRODUCT_PAGE_LOCALES } from "./productPageLocales";
import type { ProductPageContent } from "./productPages";
import { SOLUTION_PAGE_LOCALES } from "./solutionPageLocales";
import type { SolutionPageContent } from "./solutionPages";
import {
  formatPricingTemplate,
  PRICING_PAGE_CONTENT_EN,
  type PricingPageContent,
} from "./pricingPageContent";
import { PRICING_PAGE_LOCALES } from "./pricingPageLocales";
import { HOMEPAGE_CONTENT_EN, type HomepageContent } from "./homepageContent";
import { HOMEPAGE_LOCALES } from "./homepageLocales";
import { PLAN_LIMITS, type SubscriptionPlan } from "./schema";
import { PROSPECT_AI_MONTHLY_QUOTAS } from "./prospectAI";
import type { PricingCompareRow } from "./pricingEntitlements";

export { getMarketingChrome, PLATFORM_STORY_STEP_TEXT, BRAIN_CONSUMER_TEXT } from "./marketingChrome";
export { getLocalizedMarketingNav } from "./marketingNavLocales";
export {
  getLocalizedProspectAiContent,
  type LocalizedProspectAiLandingBundle,
  type ProspectAiLandingSeoOverlay,
} from "./prospectAiLandingLocales";
export {
  getLocalizedRgeLanding,
  type LocalizedRgeLandingBundle,
  type RgeLandingSeoOverlay,
  type RgeLandingUiOverlay,
} from "./realtorGrowthEngineLandingLocales";
export { normalizeMarketingLocale };
export type { MarketingLocale } from "./marketingLocale";
export type { PricingPageContent } from "./pricingPageContent";
export type { HomepageContent } from "./homepageContent";
export { FULL_PRO_AI_TRIAL_COPY } from "./pricingPageContent";

export function getLocalizedProductPage(
  page: ProductPageContent,
  locale: MarketingLocale,
): ProductPageContent {
  if (locale === "en") return page;
  const overlay = PRODUCT_PAGE_LOCALES[locale][page.path];
  if (!overlay) {
    throw new Error(`Missing ${locale} product page locale for ${page.path}`);
  }
  return mergeMarketingContent(page, overlay);
}

export function getLocalizedSolutionPage(
  page: SolutionPageContent,
  locale: MarketingLocale,
): SolutionPageContent {
  if (locale === "en") return page;
  const overlay = SOLUTION_PAGE_LOCALES[locale][page.path];
  if (!overlay) {
    throw new Error(`Missing ${locale} solution page locale for ${page.path}`);
  }
  return mergeMarketingContent(page, overlay);
}

export function getLocalizedPricingPage(locale: MarketingLocale): PricingPageContent {
  if (locale === "en") return PRICING_PAGE_CONTENT_EN;
  const overlay = PRICING_PAGE_LOCALES[locale];
  if (!overlay) {
    throw new Error(`Missing ${locale} pricing page locale`);
  }
  return mergeMarketingContent(PRICING_PAGE_CONTENT_EN, overlay);
}

export function getLocalizedHomepage(locale: MarketingLocale): HomepageContent {
  if (locale === "en") return HOMEPAGE_CONTENT_EN;
  const overlay = HOMEPAGE_LOCALES[locale];
  if (!overlay) {
    throw new Error(`Missing ${locale} homepage locale`);
  }
  return mergeMarketingContent(HOMEPAGE_CONTENT_EN, overlay);
}

function formatUsersLocalized(maxUsers: number, content: PricingPageContent): string {
  if (maxUsers < 0) return content.highlights.usersUnlimited;
  if (maxUsers === 1) return content.highlights.usersOne;
  return formatPricingTemplate(content.highlights.usersMany, { n: maxUsers });
}

function formatConversationsLocalized(n: number, locale: MarketingLocale): string {
  const tag = locale === "he" ? "he-IL" : locale === "es" ? "es" : "en-US";
  return n.toLocaleString(tag);
}

export function getLocalizedPlanPricingHighlights(
  plan: SubscriptionPlan,
  locale: MarketingLocale,
): string[] {
  const content = getLocalizedPricingPage(locale);
  const limits = PLAN_LIMITS[plan];
  const discoveries = PROSPECT_AI_MONTHLY_QUOTAS[plan];
  const lines = [
    formatPricingTemplate(content.highlights.prospectDiscoveries, { n: discoveries }),
    formatPricingTemplate(content.highlights.activeConversations, {
      n: formatConversationsLocalized(limits.conversationsPerMonth, locale),
    }),
    formatUsersLocalized(limits.maxUsers, content),
    limits.maxWhatsappNumbers === 1
      ? content.highlights.whatsappOne
      : formatPricingTemplate(content.highlights.whatsappMany, {
          n: limits.maxWhatsappNumbers,
        }),
    content.highlights.multiChannelInbox,
  ];
  if (limits.chatbotEnabled) lines.push(content.highlights.chatbotWidget);
  if (limits.workflowsEnabled) lines.push(content.highlights.workflowAutomation);
  if (plan === "pro") lines.push(content.highlights.growthEnginesRequired);
  return lines;
}

export function getLocalizedAiBrainAddonHighlights(locale: MarketingLocale): string[] {
  return getLocalizedPricingPage(locale).aiBrain.highlights;
}

export function buildLocalizedPricingCompareRows(
  opts: { includeGrowthEngines?: boolean } | undefined,
  locale: MarketingLocale,
): PricingCompareRow[] {
  const includeGrowthEngines = opts?.includeGrowthEngines !== false;
  const content = getLocalizedPricingPage(locale);
  const free = PLAN_LIMITS.free;
  const starter = PLAN_LIMITS.starter;
  const pro = PLAN_LIMITS.pro;
  const cells = content.compareCells;

  const rows: PricingCompareRow[] = [
    {
      group: "MESSAGING",
      featureKey: "activeConversations",
      free: formatConversationsLocalized(free.conversationsPerMonth, locale),
      starter: formatConversationsLocalized(starter.conversationsPerMonth, locale),
      pro: formatConversationsLocalized(pro.conversationsPerMonth, locale),
    },
    {
      group: "MESSAGING",
      featureKey: "users",
      free: formatUsersLocalized(free.maxUsers, content),
      starter: formatUsersLocalized(starter.maxUsers, content),
      pro: formatUsersLocalized(pro.maxUsers, content),
    },
    {
      group: "MESSAGING",
      featureKey: "whatsappNumbers",
      free: String(free.maxWhatsappNumbers),
      starter: String(starter.maxWhatsappNumbers),
      pro: formatPricingTemplate(cells.upTo, { n: pro.maxWhatsappNumbers }),
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
      free: cells.connectedChannels,
      starter: cells.connectedChannels,
      pro: cells.connectedChannels,
    },
    {
      group: "PROSPECT AI",
      featureKey: "prospectDiscoveries",
      free: `${PROSPECT_AI_MONTHLY_QUOTAS.free}${cells.perMonth}`,
      starter: `${PROSPECT_AI_MONTHLY_QUOTAS.starter}${cells.perMonth}`,
      pro: `${PROSPECT_AI_MONTHLY_QUOTAS.pro}${cells.perMonth}`,
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
      free: cells.notIncluded,
      starter: cells.addOn,
      pro: cells.addOn,
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
      free: false,
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
      pro: cells.growthEngineReady,
    });
  }

  return rows;
}
