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

export const PROSPECT_ENRICHMENT_TRIGGERS = ["approve", "queue", "manual"] as const;
export type ProspectEnrichmentTrigger = (typeof PROSPECT_ENRICHMENT_TRIGGERS)[number];

export type ProspectPublicContacts = {
  emails: string[];
  phones: string[];
  whatsappNumbers: string[];
  socialProfiles: string[];
  bookingUrls: string[];
  contactPageUrls: string[];
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
