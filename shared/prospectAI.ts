/**
 * Prospect AI — customer-facing local prospect discovery (Growth Engines).
 * Shared constants, quotas, and API types. Google Places is the MVP provider.
 */

import type { SubscriptionPlan } from "./schema";

export const PROSPECT_AI_PROVIDER_IDS = ["google_places"] as const;
export type ProspectAiProviderId = (typeof PROSPECT_AI_PROVIDER_IDS)[number];

export const PROSPECT_AI_DEFAULT_PROVIDER: ProspectAiProviderId = "google_places";

/** Source marker stored on contacts so Prospect Intelligence review can list them. */
export const PROSPECT_AI_IMPORT_PROVIDER = "prospect_ai" as const;

export const PROSPECT_AI_INTERNAL_TAG = "Discovered-ProspectAI" as const;

/** Monthly discovery result quotas by effective plan. Free is not eligible. */
export const PROSPECT_AI_MONTHLY_QUOTAS = {
  free: 0,
  starter: 100,
  pro: 500,
} as const satisfies Record<SubscriptionPlan, number>;

export const PROSPECT_AI_MAX_RADIUS_KM = 50;
export const PROSPECT_AI_MIN_RADIUS_KM = 0.5;
export const PROSPECT_AI_DEFAULT_PAGE_SIZE = 20;

export const PROSPECT_AI_ACTIVITY_EVENT_TYPES = [
  "discovery",
  "import",
  "campaign",
  "outreach",
] as const;
export type ProspectAiActivityEventType = (typeof PROSPECT_AI_ACTIVITY_EVENT_TYPES)[number];

export type ProspectAiDenialReason =
  | "upgrade_required"
  | "not_activated"
  | "quota_exceeded"
  | "invalid_input"
  | "provider_unavailable"
  | "not_found"
  | "forbidden";

export function getProspectAiMonthlyQuota(plan: SubscriptionPlan): number {
  return PROSPECT_AI_MONTHLY_QUOTAS[plan] ?? 0;
}

/** Starter and Pro may activate; Free cannot (admin plan override still flows through effective plan). */
export function isProspectAiPlanEligible(plan: SubscriptionPlan): boolean {
  return plan === "starter" || plan === "pro";
}

export type ProspectAiDiscoverRequest = {
  businessType: string;
  location: string;
  radiusKm?: number;
};

export type ProspectAiNormalizedProspect = {
  id?: string;
  providerPlaceId: string;
  name: string;
  businessType: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
};

export type ProspectAiQuotaSnapshot = {
  monthlyQuota: number;
  used: number;
  remaining: number;
};

export type ProspectAiAiBrainStatus = {
  configured: boolean;
  businessProfile: boolean;
  businessKnowledge: boolean;
  websiteKnowledge: boolean;
};

export type ProspectAiStatusResponse = {
  activated: boolean;
  plan: SubscriptionPlan;
  monthlyQuota: number;
  used: number;
  remaining: number;
  eligible: boolean;
  denialReason: ProspectAiDenialReason | null;
  aiBrain: ProspectAiAiBrainStatus;
  provider: ProspectAiProviderId;
};

export type ProspectAiDiscoverySearchSummary = {
  id: string;
  businessType: string;
  location: string;
  radiusKm: number | null;
  provider: ProspectAiProviderId;
  resultCount: number;
  status: string;
  createdAt: string | null;
};

export type ProspectAiActivityEvent = {
  type: ProspectAiActivityEventType;
  id: string;
  title: string;
  subtitle?: string | null;
  createdAt: string | null;
  meta?: Record<string, unknown>;
};
