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

/** Monthly Prospect Discoveries (net-new) by effective workspace plan. */
export const PROSPECT_AI_MONTHLY_QUOTAS = {
  free: 50,
  starter: 100,
  pro: 500,
} as const satisfies Record<SubscriptionPlan, number>;

const PROSPECT_AI_PLAN_ORDER: readonly SubscriptionPlan[] = ["free", "starter", "pro"];

export const PROSPECT_AI_MAX_RADIUS_KM = 50;
export const PROSPECT_AI_MIN_RADIUS_KM = 0.5;
/** @deprecated Prefer PROSPECT_AI_PLACES_PAGE_SIZE — Google Places hard max is 20. */
export const PROSPECT_AI_DEFAULT_PAGE_SIZE = 20;

export {
  PROSPECT_AI_DISCOVERY_TARGET_OPTIONS,
  PROSPECT_AI_DEFAULT_DISCOVERY_TARGET,
  PROSPECT_AI_LOCATION_EXPANSION_MODES,
  PROSPECT_AI_DEFAULT_LOCATION_EXPANSION,
  PROSPECT_AI_PLACES_PAGE_SIZE,
  type ProspectAiDiscoveryTargetCount,
  type ProspectAiLocationExpansionMode,
  type ProspectAiDiscoveryRunDiagnostics,
  type ProspectAiDiscoveryStopReason,
} from "./prospectAiDiscoveryPlan";

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

/** Eligible when the effective plan has a positive monthly discovery allowance. */
export function isProspectAiPlanEligible(plan: SubscriptionPlan): boolean {
  return getProspectAiMonthlyQuota(plan) > 0;
}

/**
 * Next publicly offered plan with a higher discovery quota.
 * Starter remains in quota maps for grandfathered workspaces but is not a suggested upgrade.
 */
export function nextProspectAiQuotaUpgradePlan(
  plan: SubscriptionPlan,
): SubscriptionPlan | null {
  const current = getProspectAiMonthlyQuota(plan);
  for (const candidate of PROSPECT_AI_PLAN_ORDER) {
    if (candidate === "starter") continue;
    if (getProspectAiMonthlyQuota(candidate) > current) return candidate;
  }
  return null;
}

export function prospectAiPlanDisplayName(plan: SubscriptionPlan): string {
  if (plan === "pro") return "Pro";
  if (plan === "starter") return "Starter";
  if (plan === "free") return "Free";
  return String(plan);
}

/** User-facing exhausted-quota copy (no developer wording). */
export function prospectAiQuotaExceededUserMessage(plan: SubscriptionPlan): string {
  const base = "You've reached your monthly Prospect AI discovery limit.";
  const next = nextProspectAiQuotaUpgradePlan(plan);
  if (!next) {
    return `${base} Your quota resets with your next billing period.`;
  }
  const nextQuota = getProspectAiMonthlyQuota(next);
  return `${base} Upgrade to ${prospectAiPlanDisplayName(next)} for ${nextQuota} discoveries per month.`;
}

export type ProspectAiDiscoverRequest = {
  businessType: string;
  location: string;
  radiusKm?: number;
  /** Unique prospects to aim for before qualification (25 | 50 | 100 | 250). */
  targetCount?: number;
  /** exact | nearby | metro — default nearby. */
  locationExpansion?: "exact" | "nearby" | "metro";
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

// ─── Won / outcome tracking ───────────────────────────────────────────────────

export const PROSPECT_AI_OUTCOMES = [
  "active",
  "replied",
  "qualified",
  "meeting_booked",
  "won",
  "lost",
] as const;
export type ProspectAiOutcome = (typeof PROSPECT_AI_OUTCOMES)[number];

export const PROSPECT_AI_QUALIFIED_OUTCOMES = ["qualified", "meeting_booked"] as const;

export const PROSPECT_AI_WON_TIME_RANGES = ["this_month", "last_30_days", "all_time"] as const;
export type ProspectAiWonTimeRange = (typeof PROSPECT_AI_WON_TIME_RANGES)[number];

export const PROSPECT_AI_WON_ACTIVITY_EVENT = "prospect_ai_won" as const;

export function isProspectAiOutcome(value: unknown): value is ProspectAiOutcome {
  return typeof value === "string" && (PROSPECT_AI_OUTCOMES as readonly string[]).includes(value);
}

/** Safe rate helper — returns null when denominator is 0. */
export function prospectAiRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}

/** @deprecated Prefer prospectAiRate */
export function computeProspectAiRate(
  numerator: number,
  denominator: number,
): number | null {
  return prospectAiRate(numerator, denominator);
}

export function formatProspectAiRate(rate: number | null): string {
  if (rate == null || Number.isNaN(rate)) return "—";
  return `${Math.round(rate * 1000) / 10}%`;
}

/** Resolve Won list/stats time window start (UTC for this_month). */
export function resolveProspectAiWonTimeRangeStart(
  timeRange: string | null | undefined,
  now = new Date(),
): Date | null {
  const key = String(timeRange || "all_time").trim().toLowerCase();
  if (key === "this_month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }
  if (key === "last_30_days") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return null;
}

/** Outreach Sent / Replied flags from prospect_intelligence row fields. */
export function computeProspectAiOutreachFlags(row: {
  outreachStatus?: string | null;
  outreachSentAt?: Date | string | null;
  repliedAt?: Date | string | null;
}): { isSent: boolean; isReplied: boolean } {
  return {
    isSent:
      row.outreachStatus === "outreach_sent" ||
      row.outreachStatus === "replied" ||
      Boolean(row.outreachSentAt),
    isReplied: row.outreachStatus === "replied" || Boolean(row.repliedAt),
  };
}

export type ProspectAiWonStats = {
  outreachSent: number;
  replied: number;
  qualified: number;
  won: number;
  /** Replied / Outreach Sent; null when denominator is 0 */
  replyRate: number | null;
  /** Won / Outreach Sent; null when denominator is 0 */
  winRate: number | null;
  /** Won / Qualified; null when denominator is 0 */
  qualifiedToWon: number | null;
};

export function buildProspectAiWonStats(counts: {
  outreachSent: number;
  replied: number;
  qualified: number;
  won: number;
}): ProspectAiWonStats {
  const outreachSent = Math.max(0, Math.floor(counts.outreachSent) || 0);
  const replied = Math.max(0, Math.floor(counts.replied) || 0);
  const qualified = Math.max(0, Math.floor(counts.qualified) || 0);
  const won = Math.max(0, Math.floor(counts.won) || 0);
  return {
    outreachSent,
    replied,
    qualified,
    won,
    replyRate: prospectAiRate(replied, outreachSent),
    winRate: prospectAiRate(won, outreachSent),
    qualifiedToWon: prospectAiRate(won, qualified),
  };
}

export type ProspectAiAttributionContactLike = {
  sourceDetails?: unknown;
  customFields?: unknown;
  tag?: string | null;
};

/**
 * Prospect AI attribution (client + server shared rules).
 *
 * Attributable when ANY of:
 * - sourceDetails/customFields.prospectImportProvider === 'prospect_ai'
 * - sourceDetails/customFields.prospectAi object is present
 * - discoveryResultId / discoverySearchId on prospectAi or prospectImport meta
 *
 * GHL-only imports without prospectAi meta are NOT attributed solely because a
 * prospect_intelligence row exists. Discovery contacts always get prospectAi meta
 * when sent to review.
 */
export function isProspectAiAttributedContact(
  contact: ProspectAiAttributionContactLike | null | undefined,
): boolean {
  if (!contact) return false;
  const sd =
    contact.sourceDetails && typeof contact.sourceDetails === "object"
      ? (contact.sourceDetails as Record<string, unknown>)
      : {};
  const cf =
    contact.customFields && typeof contact.customFields === "object"
      ? (contact.customFields as Record<string, unknown>)
      : {};

  const provider = String(
    sd.prospectImportProvider || cf.prospectImportProvider || "",
  ).trim();
  if (provider === PROSPECT_AI_IMPORT_PROVIDER) return true;

  const prospectAi = sd.prospectAi || cf.prospectAi;
  if (prospectAi && typeof prospectAi === "object") return true;

  const importMeta = (sd.prospectImport || cf.prospectImport) as
    | Record<string, unknown>
    | undefined;
  if (importMeta && typeof importMeta === "object") {
    if (String(importMeta.provider || "").trim() === PROSPECT_AI_IMPORT_PROVIDER) return true;
    if (
      String(importMeta.discoveryResultId || "").trim() ||
      String(importMeta.discoverySearchId || "").trim()
    ) {
      return true;
    }
  }

  return false;
}

export type ProspectAiWonCustomer = {
  contactId: string;
  name: string;
  source: string | null;
  campaign: string | null;
  firstOutreachAt: string | null;
  wonAt: string | null;
  markedByUserId: string | null;
  markedByName: string | null;
  outcome: ProspectAiOutcome;
};

export type ProspectAiOutcomeResponse = {
  contactId: string;
  prospectOutcome: ProspectAiOutcome;
  outcomeUpdatedAt: string | null;
  wonAt: string | null;
  wonByUserId: string | null;
  qualifiedAt: string | null;
  firstOutreachAt: string | null;
  firstReplyAt: string | null;
  attributed: boolean;
};
