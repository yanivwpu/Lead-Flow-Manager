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
    pattern: /\bguarantee(?:d|s)?\b|\b(?:conversion|lead|ranking|revenue|sale)s?\s+guarantees?\b/i,
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

const GUARANTEE_TERMS = new Set(["guarantee", "guaranteed", "guarantees"]);
const GUARANTEE_RESULTS = new Set([
  "conversion",
  "conversions",
  "lead",
  "leads",
  "ranking",
  "rankings",
  "revenue",
  "sale",
  "sales",
]);
const MAX_GUARANTEE_CLAIM_TOKEN_DISTANCE = 10;

type ClaimToken = { value: string; start: number; end: number };

function containsForbiddenGuaranteeClaim(text: string): boolean {
  // Sentence and clause boundaries prevent a guarantee in one thought from being
  // paired with an unrelated result in the next. Token distance permits ordinary
  // quantities, possessives, and modifiers without depending on word adjacency.
  const clauses = text.matchAll(/[^.!?;\n]+/g);

  for (const clauseMatch of clauses) {
    const clause = clauseMatch[0];
    const clauseOffset = clauseMatch.index ?? 0;
    const tokens: ClaimToken[] = Array.from(clause.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu), (match) => ({
      value: match[0].toLowerCase(),
      start: clauseOffset + (match.index ?? 0),
      end: clauseOffset + (match.index ?? 0) + match[0].length,
    }));

    for (let guaranteeIndex = 0; guaranteeIndex < tokens.length; guaranteeIndex += 1) {
      if (!GUARANTEE_TERMS.has(tokens[guaranteeIndex].value)) continue;

      for (let resultIndex = 0; resultIndex < tokens.length; resultIndex += 1) {
        if (!GUARANTEE_RESULTS.has(tokens[resultIndex].value)) continue;
        if (Math.abs(resultIndex - guaranteeIndex) > MAX_GUARANTEE_CLAIM_TOKEN_DISTANCE) continue;

        const claimStart = Math.min(tokens[guaranteeIndex].start, tokens[resultIndex].start);
        const claimEnd = Math.max(tokens[guaranteeIndex].end, tokens[resultIndex].end);
        const prefix = text.slice(Math.max(0, claimStart - 60), claimStart);
        const suffix = text.slice(claimEnd, claimEnd + 30);
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
    }
  }

  return false;
}

export function findForbiddenPublicClaims(text: string): string[] {
  return SEO_FORBIDDEN_PUBLIC_CLAIMS.filter(({ id, pattern }) => {
    if (id !== "conversion-guarantee") return pattern.test(text);
    return containsForbiddenGuaranteeClaim(text);
  }).map(({ id }) => id);
}

export const SEO_CURRENT_SELF_SERVICE_PRODUCTS = Object.values(PUBLIC_PRODUCT_FACTS).filter(
  mayDescribeAsCurrentSelfServiceOffer,
);
