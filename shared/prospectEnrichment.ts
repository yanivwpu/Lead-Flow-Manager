/**
 * Prospect Intelligence & Enrichment (Phase 2) — shared types + provider IDs.
 * Website-public only in Phase 2; future Apollo/Hunter/etc. plug in via provider id.
 */

export const PROSPECT_ENRICHMENT_PROVIDERS = ["website_public"] as const;
export type ProspectEnrichmentProviderId = (typeof PROSPECT_ENRICHMENT_PROVIDERS)[number];

export const PROSPECT_ENRICHMENT_STATUSES = [
  "none",
  "pending",
  "enriching",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ProspectEnrichmentStatus = (typeof PROSPECT_ENRICHMENT_STATUSES)[number];

export const PROSPECT_ENRICHMENT_JOB_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ProspectEnrichmentJobStatus = (typeof PROSPECT_ENRICHMENT_JOB_STATUSES)[number];

export const PROSPECT_ENRICHMENT_TRIGGERS = ["approve", "queue", "manual", "post_qualify"] as const;
export type ProspectEnrichmentTrigger = (typeof PROSPECT_ENRICHMENT_TRIGGERS)[number];

/** Safe failure classes stored in enrichment_result / enrichment_error_message (no stack traces). */
export const PROSPECT_ENRICHMENT_FAILURE_CLASSES = [
  "website_timeout",
  "website_fetch_failed",
  "all_pages_failed",
  "no_website",
  "social_profile_only",
] as const;
export type ProspectEnrichmentFailureClass = (typeof PROSPECT_ENRICHMENT_FAILURE_CLASSES)[number];

/**
 * Derived outcome classes — represented via enrichmentStatus + enrichment_result JSON
 * (no DB migration required).
 */
export const PROSPECT_ENRICHMENT_OUTCOME_CLASSES = [
  "not_started",
  "queued",
  "running",
  "completed_email_found",
  "completed_no_email",
  /** Crawl finished but some fetches/renders aborted — email search incomplete. */
  "completed_search_incomplete",
  /** Website crawl failed, but contact already had a valid (e.g. manual) email. */
  "completed_email_present_website_failed",
  "failed_timeout",
  "failed_fetch",
  "no_website",
  "social_profile_only",
] as const;
export type ProspectEnrichmentOutcomeClass = (typeof PROSPECT_ENRICHMENT_OUTCOME_CLASSES)[number];

export const PROSPECT_ENRICHMENT_FAILURE_LABELS: Record<ProspectEnrichmentFailureClass, string> = {
  website_timeout: "Website timed out — some business information couldn't be collected.",
  website_fetch_failed: "Website couldn't be reached.",
  all_pages_failed: "Website pages couldn't be loaded — some business information couldn't be collected.",
  no_website: "No public website found.",
  social_profile_only: "Website looks like a social profile — some business information couldn't be collected.",
};

export type ProspectPublicContacts = {
  emails: string[];
  phones: string[];
  whatsappNumbers: string[];
  socialProfiles: string[];
  bookingUrls: string[];
  contactPageUrls: string[];
  /** Optional extraction trace — stored in jsonb enrichment_result only (no migration). */
  emailExtractions?: Array<{
    email: string;
    method:
      | "cloudflare_cfemail"
      | "mailto"
      | "standard_text"
      | "obfuscated_text"
      | "json_ld"
      | "embedded_json"
      | "rendered_dom";
    sourceUrl?: string;
    confidence?: number;
    matchedLocationEvidence?: string[];
  }>;
};

/** Winning email provenance for debugging false negatives (jsonb only). */
export type ProspectEmailProvenance = {
  email: string;
  sourceUrl?: string | null;
  method?: string | null;
  confidence?: number;
  matchedLocationEvidence?: string[];
};

export type ProspectWebsiteIntelligence = {
  businessSummary?: string;
  productsServices?: string;
  industry?: string;
  targetCustomers?: string;
  companySizeClues?: string;
  appointmentOrBookingFlow?: string;
  chatWidgetDetected?: boolean;
  whatsappButtonDetected?: boolean;
  contactFormsDetected?: boolean;
  ctaStyle?: string;
  technologyClues?: string[];
  aiFitInsights?: string;
  recommendedOutreachAngle?: string;
  painPoints?: string[];
  whyWhachatRelevant?: string[];
  pagesScanned?: Array<{ url: string; status: string; reason?: string }>;
};

export type ProspectEnrichmentResult = {
  provider: ProspectEnrichmentProviderId;
  websiteUrl?: string | null;
  websiteAnalyzedAt?: string | null;
  publicContacts: ProspectPublicContacts;
  websiteIntelligence: ProspectWebsiteIntelligence;
  emailFound: boolean;
  phoneFound: boolean;
  /** True when at least one page returned usable HTML. */
  crawlSucceeded?: boolean;
  failureClass?: ProspectEnrichmentFailureClass | null;
  outcomeClass?: ProspectEnrichmentOutcomeClass | null;
  /** True when crawl failed but contact already had a valid email (soft-complete). */
  websiteCrawlFailed?: boolean;
  /** Social URLs preserved when the crawl target was official or recovery ran. */
  socialProfilesPreserved?: string[];
  /** Best email provenance for audit / debugging. */
  bestEmailProvenance?: ProspectEmailProvenance | null;
  /** True when headless render fallback was attempted. */
  renderFallbackUsed?: boolean;
  /** Pages where headless render ran. */
  renderPages?: string[];
};

export type ProspectEnrichmentJobSummary = {
  id: string;
  contactId: string;
  workspaceUserId: string;
  status: ProspectEnrichmentJobStatus;
  provider: ProspectEnrichmentProviderId;
  triggerSource: ProspectEnrichmentTrigger;
  progressCurrent: number;
  progressTotal: number;
  errorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

export const PROSPECT_ENRICHMENT_LEASE_MS = 120_000;
