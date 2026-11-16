/**
 * Server-safe public product facts.
 *
 * This module references the existing pricing, limit, entitlement, route, host,
 * and trial sources. It deliberately does not own a second list of amounts or
 * import anything from client/src.
 */
import {
  REALTOR_GROWTH_ENGINE_PATH,
  REALTOR_GROWTH_ENGINE_REQUIRES_PRO,
  getFreePlanMonthlyPriceUsd,
  getPaidPlanMonthlyPriceUsd,
  getPaidPlanYearlyPriceUsd,
  type CanonicalOfferBillingPeriod,
} from "./pricingEntitlements";
import { CANONICAL_HOST } from "./localeRoutes";
import { PLAN_LIMITS } from "./schema";
import { PRO_AI_TRIAL_DAYS } from "./trialPolicy";

export const PRODUCT_IMPLEMENTATION_STATES = ["implemented", "beta", "coming_soon"] as const;
export type ProductImplementationState = (typeof PRODUCT_IMPLEMENTATION_STATES)[number];

export const PRODUCT_AVAILABILITY_STATES = [
  "public",
  "allowlisted",
  "internal",
  "deprecated",
] as const;
export type ProductAvailabilityState = (typeof PRODUCT_AVAILABILITY_STATES)[number];

export const PRODUCT_LIFECYCLE_STATES = [
  "implemented",
  "public",
  "beta",
  "allowlisted",
  "coming_soon",
  "internal",
  "deprecated",
] as const;
export type ProductLifecycleState = (typeof PRODUCT_LIFECYCLE_STATES)[number];

type PublicPrice = {
  amount: number;
  currency: "USD";
  billingPeriod: CanonicalOfferBillingPeriod;
};

export type PublicProductFact = {
  id: "free" | "pro" | "ai-brain" | "realtor-growth-engine" | "starter" | "legacy-ai-brain-addon";
  name: string;
  kind: "subscription_plan" | "included_capability" | "one_time_product" | "legacy_entitlement";
  implementation: ProductImplementationState;
  availability: ProductAvailabilityState;
  lifecycle: readonly ProductLifecycleState[];
  publicRoute?: string;
  publicSelfService: boolean;
  currentPurchasableOffer: boolean;
  legacyEnforcementOnly?: boolean;
  prices: readonly PublicPrice[];
  includedWith?: readonly string[];
  requires?: readonly string[];
  limits?: {
    conversationsPerPeriod: number;
    maxUsers: number;
    maxWhatsappNumbers: number;
  };
};

function publicPlanLimits(plan: "free" | "pro"): PublicProductFact["limits"] {
  const limits = PLAN_LIMITS[plan];
  return {
    conversationsPerPeriod: limits.conversationsPerMonth,
    maxUsers: limits.maxUsers,
    maxWhatsappNumbers: limits.maxWhatsappNumbers,
  };
}

export const PUBLIC_PRODUCT_CANONICAL_HOST = CANONICAL_HOST;
export const PUBLIC_PRO_AI_TRIAL_DAYS = PRO_AI_TRIAL_DAYS;

export const PUBLIC_PRODUCT_FACTS = {
  free: {
    id: "free",
    name: PLAN_LIMITS.free.name,
    kind: "subscription_plan",
    implementation: "implemented",
    availability: "public",
    lifecycle: ["implemented", "public"],
    publicRoute: "/pricing",
    publicSelfService: true,
    currentPurchasableOffer: true,
    prices: [{ amount: getFreePlanMonthlyPriceUsd(), currency: "USD", billingPeriod: "month" }],
    limits: publicPlanLimits("free"),
  },
  pro: {
    id: "pro",
    name: PLAN_LIMITS.pro.name,
    kind: "subscription_plan",
    implementation: "implemented",
    availability: "public",
    lifecycle: ["implemented", "public"],
    publicRoute: "/pricing",
    publicSelfService: true,
    currentPurchasableOffer: true,
    prices: [
      { amount: getPaidPlanMonthlyPriceUsd("pro"), currency: "USD", billingPeriod: "month" },
      { amount: getPaidPlanYearlyPriceUsd("pro"), currency: "USD", billingPeriod: "year" },
    ],
    limits: publicPlanLimits("pro"),
  },
  aiBrain: {
    id: "ai-brain",
    name: "AI Brain",
    kind: "included_capability",
    implementation: "implemented",
    availability: "public",
    lifecycle: ["implemented", "public"],
    publicRoute: "/ai-brain",
    publicSelfService: false,
    currentPurchasableOffer: false,
    prices: [],
    includedWith: ["pro"],
  },
  realtorGrowthEngine: {
    id: "realtor-growth-engine",
    name: "Realtor Growth Engine",
    kind: "included_capability",
    implementation: "implemented",
    availability: "public",
    lifecycle: ["implemented", "public"],
    publicRoute: REALTOR_GROWTH_ENGINE_PATH,
    publicSelfService: false,
    currentPurchasableOffer: false,
    prices: [],
    includedWith: ["pro"],
    requires: ["pro"],
  },
  starter: {
    id: "starter",
    name: PLAN_LIMITS.starter.name,
    kind: "legacy_entitlement",
    implementation: "implemented",
    availability: "deprecated",
    lifecycle: ["implemented", "deprecated"],
    publicSelfService: false,
    currentPurchasableOffer: false,
    legacyEnforcementOnly: true,
    prices: [],
  },
  legacyAiBrainAddon: {
    id: "legacy-ai-brain-addon",
    name: "Legacy AI Brain add-on",
    kind: "legacy_entitlement",
    implementation: "implemented",
    availability: "deprecated",
    lifecycle: ["implemented", "deprecated"],
    publicSelfService: false,
    currentPurchasableOffer: false,
    legacyEnforcementOnly: true,
    // The historical amount remains in the entitlement module for webhook matching only.
    prices: [],
  },
} as const satisfies Record<string, PublicProductFact>;

/** Public requirement text imported from the existing entitlement source. */
export const PUBLIC_REALTOR_GROWTH_ENGINE_REQUIREMENT = REALTOR_GROWTH_ENGINE_REQUIRES_PRO;

/** Subscription quota sessions are independent of historical threads and Meta charges. */
export const ACTIVE_CONVERSATION_PUBLIC_DESCRIPTION =
  "A qualifying session starts with an inbound WhatsApp, Facebook Messenger or Instagram DM and lasts a fixed 24 hours. Repeated messages and AI/workflow replies within it do not increment usage. Templates alone, Website Chat, AI website chatbot, SMS, Telegram, email, Shopify events and other channels do not consume this allowance. A template reply starts a session only if none is open. Free includes 50 and Pro 2,000 sessions per monthly usage period. Meta messaging charges are billed separately. Threads, message history and Meta reply windows are unchanged.";

export function isGenerallyAvailableProduct(fact: PublicProductFact): boolean {
  return fact.implementation === "implemented" && fact.availability === "public";
}
