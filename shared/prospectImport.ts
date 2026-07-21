/** Provider-agnostic prospect import types (GHL, Shopify, HubSpot, CSV, …). */

export const PROSPECT_IMPORT_PROVIDERS = ["gohighlevel", "shopify", "hubspot", "csv", "salesforce", "pipedrive"] as const;
export type ProspectImportProvider = (typeof PROSPECT_IMPORT_PROVIDERS)[number];

export const PROSPECT_IMPORT_PROVIDER_LABELS: Record<ProspectImportProvider, string> = {
  gohighlevel: "GoHighLevel",
  shopify: "Shopify",
  hubspot: "HubSpot",
  csv: "CSV",
  salesforce: "Salesforce",
  pipedrive: "Pipedrive",
};

export const PROSPECT_IMPORT_INTERNAL_TAGS = [
  "Imported-GHL",
  "Imported-Agency",
  "Imported-Shopify",
  "Imported-Affiliate",
] as const;
export type ProspectImportInternalTag = (typeof PROSPECT_IMPORT_INTERNAL_TAGS)[number];

export const PROSPECT_IMPORT_REASONS = [
  "Agency recruitment",
  "Shopify app promotion",
  "Affiliate recruitment",
  "Real estate outreach",
  "General prospecting",
  "Other",
] as const;
export type ProspectImportReason = (typeof PROSPECT_IMPORT_REASONS)[number];

/** Internal sales pipeline stages for imported prospects. */
export const PROSPECT_IMPORT_PIPELINE_STAGES = [
  "Imported",
  "AI Reviewed",
  "Contacted",
  "Interested",
  "Demo Scheduled",
  "Trial Started",
  "Customer",
  "Partner",
] as const;
export type ProspectImportPipelineStage = (typeof PROSPECT_IMPORT_PIPELINE_STAGES)[number];

export const PROSPECT_IMPORT_DASHBOARD_STAGES: ProspectImportPipelineStage[] = [
  "Imported",
  "AI Reviewed",
  "Contacted",
  "Interested",
  "Demo Scheduled",
  "Trial Started",
  "Customer",
  "Partner",
];

/** How many GHL contacts to scan before filters are fully evaluated (not the import cap). */
export const PROSPECT_IMPORT_SCAN_SCOPES = [500, 1000, 5000, 10000, "entire"] as const;
export type ProspectImportScanScope = (typeof PROSPECT_IMPORT_SCAN_SCOPES)[number];

/** Max contacts to import from a preview result. */
export const PROSPECT_IMPORT_LIMITS = [10, 50, 100, 250, 500, 1000] as const;
export type ProspectImportLimit = (typeof PROSPECT_IMPORT_LIMITS)[number];

export const PROSPECT_IMPORT_DEFAULT_SCAN_SCOPE: ProspectImportScanScope = 1000;
export const PROSPECT_IMPORT_DEFAULT_IMPORT_LIMIT: ProspectImportLimit = 100;
export const PROSPECT_IMPORT_ASYNC_SCAN_THRESHOLD = 1000;
export const GHL_CONTACT_SEARCH_PAGE_SIZE = 100;
export const PROSPECT_IMPORT_PREVIEW_ROWS_CAP = 250;
export const PROSPECT_IMPORT_MATCHED_SNAPSHOTS_CAP = 5000;
export const PROSPECT_IMPORT_SKIP_DIAGNOSTICS_CAP = 25;
/** Safety cap when scanScope is "entire". */
export const PROSPECT_IMPORT_ENTIRE_SCAN_MAX = 100_000;

export type ProspectImportContactFilter = {
  tags?: string[];
  pipelineId?: string;
  pipelineStageId?: string;
  contactSource?: string;
  assignedUserId?: string;
  createdAfter?: string;
  createdBefore?: string;
  lastActivityDays?: 30 | 90 | 180;
  hasEmail?: boolean;
  hasPhone?: boolean;
  hasBoth?: boolean;
  search?: string;
  /** Max contacts to import from matching pool (default 100, max 1000). */
  importLimit?: number;
  /** Max contacts to scan in GHL before filter evaluation (default 1000). */
  scanScope?: ProspectImportScanScope;
};

/** Which Prospect Import filters map to GHL Contacts Search API vs local evaluation. */
export const PROSPECT_IMPORT_FILTER_APPLICATION: Record<
  keyof Pick<
    ProspectImportContactFilter,
    | "search"
    | "tags"
    | "pipelineId"
    | "pipelineStageId"
    | "contactSource"
    | "assignedUserId"
    | "createdAfter"
    | "createdBefore"
    | "lastActivityDays"
    | "hasEmail"
    | "hasPhone"
    | "hasBoth"
  >,
  "ghl_api" | "local"
> = {
  search: "ghl_api",
  tags: "local",
  pipelineId: "local",
  pipelineStageId: "local",
  contactSource: "local",
  assignedUserId: "local",
  createdAfter: "local",
  createdBefore: "local",
  lastActivityDays: "local",
  hasEmail: "local",
  hasPhone: "local",
  hasBoth: "local",
};

export type ProspectImportOptions = {
  internalTag: ProspectImportInternalTag;
  batchName: string;
  importReason?: ProspectImportReason | string;
  /** When true (default), skip contacts that already exist in YaBa workspace. */
  skipDuplicates?: boolean;
  /** When true, update only empty profile fields on duplicates — never overwrite CRM state. */
  updateMissingFieldsOnly?: boolean;
  selectedExternalIds?: string[];
};

export type ProspectImportPreviewContact = {
  externalId: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  tags: string[];
  source?: string;
  lastActivity?: string;
  pipeline?: string;
  stage?: string;
  assignedUser?: string;
  isDuplicate?: boolean;
  duplicateReason?: "ghlContactId" | "email" | "phone";
  missingEmail?: boolean;
  missingPhone?: boolean;
};

export type ProspectImportPreviewStats = {
  totalMatching: number;
  willImportNew: number;
  alreadyExists: number;
  duplicatesByGhlId: number;
  duplicatesByEmail: number;
  duplicatesByPhone: number;
  missingEmail: number;
  missingPhone: number;
  skippedByFilters: number;
  estimatedFinalImport: number;
  dryRun: true;
  /** Contacts fetched from GHL during this scan. */
  totalContactsScanned: number;
  /** GHL-reported total for the location when available. */
  ghlReportedTotal?: number | null;
  /** True when scan hit scanScope before exhausting the location. */
  scanStoppedEarly: boolean;
  /** True when all pages through scanScope or location end were processed. */
  scanComplete: boolean;
};

export type ProspectImportFilterSkipDiagnostic = {
  externalId: string;
  contact: Record<string, unknown>;
  skipReason: string;
};

export type ProspectImportPreviewDiagnostics = {
  activeFilters: ProspectImportContactFilter;
  appliedTemplateHint?: string | null;
  skippedContacts: ProspectImportFilterSkipDiagnostic[];
};

export type ProspectImportMatchedSnapshot = {
  externalId: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  tags: string[];
  source?: string;
  lastActivity?: string;
};

export type ProspectImportPreviewResult = {
  totalFound: number;
  tagBreakdown: { tag: string; count: number }[];
  contacts: ProspectImportPreviewContact[];
  truncated: boolean;
  stats: ProspectImportPreviewStats;
  diagnostics?: ProspectImportPreviewDiagnostics;
  previewJobId?: string;
  filterFingerprint?: string;
  scannedAt?: string;
};

export type ProspectImportPreviewJobStatus = "pending" | "running" | "completed" | "failed";

export type ProspectImportPreviewJobSummary = {
  id: string;
  status: ProspectImportPreviewJobStatus;
  integrationId: string;
  locationId: string;
  scanScope: ProspectImportScanScope;
  importLimit: number;
  progressScanned: number;
  progressTarget: number;
  progressMatches: number;
  ghlReportedTotal?: number | null;
  filterFingerprint: string;
  errorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

export type ProspectImportPreviewJobPoll = ProspectImportPreviewJobSummary & {
  result?: ProspectImportPreviewResult | null;
};

export type ProspectImportJobStatus = "pending" | "running" | "completed" | "failed";
export type ProspectImportUndoStatus = "none" | "partial" | "undone";

export type ProspectImportJobSummary = {
  id: string;
  provider: ProspectImportProvider;
  batchName: string;
  importReason?: string | null;
  status: ProspectImportJobStatus;
  undoStatus: ProspectImportUndoStatus;
  progressCurrent: number;
  progressTotal: number;
  imported: number;
  skipped: number;
  duplicates: number;
  errors: number;
  internalTag?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
  undoneAt?: string | null;
};

export type ProspectImportHistoryItem = ProspectImportJobSummary & {
  canUndo: boolean;
  undoBlockedReason?: string | null;
};

export type ProspectImportUndoPreview = {
  jobId: string;
  deletableCount: number;
  blockedCount: number;
  blockedReasons: { reason: string; count: number }[];
};

/** Phase 2 — stored in contact.customFields.prospectIntelligence and prospect_intelligence table */
export const PROSPECT_INTELLIGENCE_POTENTIAL_FIT = ["high", "medium", "low", "unknown"] as const;
export type ProspectIntelligencePotentialFit = (typeof PROSPECT_INTELLIGENCE_POTENTIAL_FIT)[number];

export const PROSPECT_INTELLIGENCE_PRIORITY = ["high", "medium", "low", "needs_review"] as const;
export type ProspectIntelligencePriority = (typeof PROSPECT_INTELLIGENCE_PRIORITY)[number];

export const PROSPECT_INTELLIGENCE_ANALYSIS_STATUS = [
  "pending",
  "processing",
  "completed",
  "needs_review",
  "failed",
] as const;
export type ProspectIntelligenceAnalysisStatus = (typeof PROSPECT_INTELLIGENCE_ANALYSIS_STATUS)[number];

export const PROSPECT_INTELLIGENCE_REVIEW_STATUS = [
  "pending",
  "approved",
  "needs_review",
] as const;
export type ProspectIntelligenceReviewStatus = (typeof PROSPECT_INTELLIGENCE_REVIEW_STATUS)[number];

export const PROSPECT_INTELLIGENCE_OUTREACH_STATUS = [
  "not_sent",
  "outreach_sent",
  "replied",
] as const;
export type ProspectIntelligenceOutreachStatus =
  (typeof PROSPECT_INTELLIGENCE_OUTREACH_STATUS)[number];

export const PROSPECT_INTELLIGENCE_RECOMMENDED_OFFERS = [
  "partner_program",
  "shopify_app",
  "real_estate_growth_engine",
  "core_whachatcrm",
  "agency_white_label",
  "general_demo",
  "not_a_fit",
] as const;
export type ProspectIntelligenceRecommendedOffer = (typeof PROSPECT_INTELLIGENCE_RECOMMENDED_OFFERS)[number];

export type ProspectIntelligence = {
  industry?: string;
  businessType?: string;
  companyName?: string;
  jobTitle?: string;
  agencyLikelihood?: number;
  shopifyMerchantLikelihood?: number;
  realEstateLikelihood?: number;
  localBusinessLikelihood?: number;
  saasLikelihood?: number;
  potentialFit?: ProspectIntelligencePotentialFit;
  leadScore?: number;
  priority?: ProspectIntelligencePriority;
  recommendedOffer?: ProspectIntelligenceRecommendedOffer | string;
  suggestedOutreachAngle?: string;
  suggestedFirstMessage?: string;
  reasoningSummary?: string;
  needsReview?: boolean;
  confidence?: number;
  analyzedAt?: string;
  aiModel?: string;
  aiVersion?: string;
  analysisStatus?: ProspectIntelligenceAnalysisStatus;
  reviewStatus?: ProspectIntelligenceReviewStatus;
  /** Separate from AI review — not_sent → outreach_sent → replied. */
  outreachStatus?: ProspectIntelligenceOutreachStatus;
  /** ISO timestamp when native outreach email was successfully sent. */
  outreachSentAt?: string;
  outreachConversationId?: string | null;
  outreachMessageId?: string | null;
  repliedAt?: string;
  errorMessage?: string;
  createdAt?: string;
  /** Phase 2 website enrichment */
  enrichmentStatus?: string;
  enrichmentProvider?: string | null;
  websiteAnalyzedAt?: string;
  websiteUrlUsed?: string | null;
  enrichmentEmailFound?: boolean;
  enrichmentPhoneFound?: boolean;
  enrichmentResult?: Record<string, unknown> | null;
  enrichmentErrorMessage?: string | null;
};

export type ProspectIntelligenceListItem = {
  contactId: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  importTag?: string | null;
  batchName?: string | null;
  importReason?: string | null;
  pipelineStage?: string | null;
  /** Discovery / import source label for UI */
  sourceLabel?: string | null;
  intelligence: ProspectIntelligence;
};

export type ProspectIntelligenceJobSummary = {
  id: string;
  importJobId: string;
  batchName: string;
  status: "pending" | "running" | "completed" | "failed";
  progressCurrent: number;
  progressTotal: number;
  analyzed: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  needsReview: number;
  errors: number;
  aiModel?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  errorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

/** Combined list filter — do not confuse with DB review_status alone. */
export type ProspectIntelligenceStatusFilter =
  | "pending"
  | "needs_review"
  | "approved"
  | "queued"
  | "outreach_sent"
  | "replied"
  | "failed";

export type ProspectIntelligenceListFilters = {
  priority?: ProspectIntelligencePriority;
  businessType?: string;
  recommendedOffer?: string;
  segment?: "agency" | "shopify" | "real_estate" | "affiliate" | "local_business" | "saas";
  needsReviewOnly?: boolean;
  importJobId?: string;
  /** Distinct from review_status / outreach_status — may also match queue state. */
  statusFilter?: ProspectIntelligenceStatusFilter;
  hasEmail?: boolean;
  hasPhone?: boolean;
  emailEligible?: boolean;
  anyEligibleChannel?: boolean;
  sortBy?: "leadScore" | "priority" | "confidence" | "name" | "action" | "createdAt";
  sortDir?: "asc" | "desc";
  limit?: number;
};

export type ProspectIntelligenceDashboardCounts = {
  aiReviewed: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  needsReview: number;
};

export type ProspectImportGhlMetadata = {
  ghlLocationId?: string | null;
  ghlContactId: string;
  originalTags: string[];
  source?: string;
  pipeline?: string;
  stage?: string;
  batchName?: string;
  importReason?: string;
  importedAt: string;
  importJobId?: string;
  createdByImportJob?: boolean;
};

export type ProspectImportLocation = {
  id: string;
  integrationId: string;
  name: string;
  locationId: string;
  isActive: boolean;
};

export type ProspectImportTemplate = {
  id: string;
  templateName: string;
  provider: ProspectImportProvider;
  filters: ProspectImportContactFilter;
  defaultInternalTag?: ProspectImportInternalTag | null;
  defaultImportReason?: string | null;
  defaultImportLimit?: number | null;
  createdAt: string;
  updatedAt: string;
};

/** Built-in presets — selecting one pre-fills filters (no DB required). */
export const PROSPECT_IMPORT_PRESET_TEMPLATES: Omit<
  ProspectImportTemplate,
  "id" | "createdAt" | "updatedAt"
>[] = [
  {
    templateName: "Agency Prospects",
    provider: "gohighlevel",
    filters: { tags: ["Agency"], importLimit: 100, scanScope: 1000 },
    defaultInternalTag: "Imported-Agency",
    defaultImportReason: "Agency recruitment",
    defaultImportLimit: 100,
  },
  {
    templateName: "Affiliate Recruiting",
    provider: "gohighlevel",
    filters: { tags: ["Affiliate"], importLimit: 100 },
    defaultInternalTag: "Imported-Affiliate",
    defaultImportReason: "Affiliate recruitment",
    defaultImportLimit: 100,
  },
  {
    templateName: "Shopify Merchants",
    provider: "gohighlevel",
    filters: { tags: ["Shopify"], hasEmail: true, importLimit: 100 },
    defaultInternalTag: "Imported-Shopify",
    defaultImportReason: "Shopify app promotion",
    defaultImportLimit: 100,
  },
  {
    templateName: "Digital Marketing",
    provider: "gohighlevel",
    filters: { search: "marketing", importLimit: 100 },
    defaultInternalTag: "Imported-Agency",
    defaultImportReason: "Agency recruitment",
    defaultImportLimit: 100,
  },
  {
    templateName: "Real Estate",
    provider: "gohighlevel",
    filters: { tags: ["Real Estate"], importLimit: 100 },
    defaultInternalTag: "Imported-GHL",
    defaultImportReason: "Real estate outreach",
    defaultImportLimit: 100,
  },
];

export type ProspectImportDashboardStats = {
  importedProspects: number;
  aiReviewed: number;
  contacted: number;
  interested: number;
  demoScheduled: number;
  trialStarted: number;
  customer: number;
  partner: number;
  byPipelineStage: Record<string, number>;
};
