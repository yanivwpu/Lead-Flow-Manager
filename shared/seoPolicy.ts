/** Server-safe policy for public SEO claims. */
import {
  PUBLIC_PRODUCT_FACTS,
  isGenerallyAvailableProduct,
  type PublicProductFact,
} from "./publicProductFacts";
import {
  PHASE2_LOCALIZED_PATHS,
  getCanonicalUrl,
  getHreflangLinks,
  type Phase2LocalizedPath,
} from "./localeRoutes";
import type { MarketingLocale } from "./marketingLocale";

/** Existing canonical localized registry; this is an alias, not another route list. */
export const SEO_LOCALIZED_PATHS: readonly Phase2LocalizedPath[] = PHASE2_LOCALIZED_PATHS;

export const SEO_CAPABILITY_POLICY = {
  webChatInboxChannel: {
    capability: "Web Chat inbox channel",
    kind: "inbox_channel",
    availability: "public",
  },
  visualChatbotBuilder: {
    capability: "Visual Chatbot Builder",
    kind: "automation_builder",
    availability: "public",
    requiredPlan: "pro",
  },
} as const;

export const SEO_FORBIDDEN_PUBLIC_CLAIMS = [
  { id: "mass-keyword-pages", pattern: /mass keyword pages?/i },
  { id: "mass-location-pages", pattern: /mass location pages?/i },
  {
    id: "conversion-guarantee",
    pattern:
      /guarantee(?:d|s)?\s+(?:conversion|lead|ranking|revenue|sale)s?|conversion guarantees?/i,
  },
  { id: "current-starter-offer", pattern: /(?:buy|choose|upgrade to|start)\s+(?:the\s+)?Starter(?:\s+plan)?/i },
  { id: "current-ai-brain-addon", pattern: /(?:buy|purchase|add)\s+(?:the\s+)?AI Brain(?:\s+add-on)?\s+separately/i },
  { id: "rge-99", pattern: /(?:Realtor Growth Engine|\bRGE\b)[\s\S]{0,80}\$99|\$99[\s\S]{0,80}(?:Realtor Growth Engine|\bRGE\b)/i },
] as const;

export const SEO_APPROVED_POSITIONING = {
  metaFeeMarkup: {
    claim: "0% markup on Meta fees",
    surfaces: ["pricing", "comparison"] as const,
    excludedBlogSlugs: ["whatsapp-service-message-pricing-october-2026"] as const,
  },
} as const;

export function mayDescribeAsGenerallyAvailable(fact: PublicProductFact): boolean {
  return isGenerallyAvailableProduct(fact);
}

export function mayDescribeAsCurrentSelfServiceOffer(fact: PublicProductFact): boolean {
  return mayDescribeAsGenerallyAvailable(fact) && fact.publicSelfService && fact.currentPurchasableOffer;
}

export function canonicalForLocalizedSeoPath(path: Phase2LocalizedPath, locale: MarketingLocale): string {
  return getCanonicalUrl(path, locale)!;
}

export function hreflangsForLocalizedSeoPath(path: Phase2LocalizedPath) {
  return getHreflangLinks(path);
}

export function findForbiddenPublicClaims(text: string): string[] {
  return SEO_FORBIDDEN_PUBLIC_CLAIMS.filter(({ id, pattern }) => {
    if (id !== "conversion-guarantee") return pattern.test(text);

    const matches = text.matchAll(
      /guarantee(?:d|s)?\s+(?:conversion|lead|ranking|revenue|sale)s?|conversion guarantees?/gi,
    );
    for (const match of matches) {
      const start = match.index ?? 0;
      const prefix = text.slice(Math.max(0, start - 60), start);
      const suffix = text.slice(start + match[0].length, start + match[0].length + 30);
      const negatedBefore =
        /(?:\b(?:do|does|did|can|could|will|would|is|are|was|were)\s+not|\b(?:don't|doesn't|didn't|can't|couldn't|won't|wouldn't|isn't|aren't|wasn't|weren't)|\bnever|\bwithout)(?:\s+(?:mean|imply|promise|offer|provide|claim))?\s*$/i.test(
          prefix,
        ) || /\bno(?:\s+(?:unsupported|absolute|automatic))?\s*$/i.test(prefix);
      const negatedAfter =
        /^\s+(?:(?:is|are|was|were)\s+)?(?:not|never)\s+(?:offered|provided|promised|made|available|supported|possible)\b/i.test(
          suffix,
        );
      if (!negatedBefore && !negatedAfter) return true;
    }
    return false;
  }).map(({ id }) => id);
}

export const SEO_CURRENT_SELF_SERVICE_PRODUCTS = Object.values(PUBLIC_PRODUCT_FACTS).filter(
  mayDescribeAsCurrentSelfServiceOffer,
);
