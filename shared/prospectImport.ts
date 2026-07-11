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
  importLimit?: number;
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

export type ProspectImportPreviewResult = {
  totalFound: number;
  tagBreakdown: { tag: string; count: number }[];
  contacts: ProspectImportPreviewContact[];
  truncated: boolean;
  stats: ProspectImportPreviewStats;
  diagnostics?: ProspectImportPreviewDiagnostics;
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

export const PROSPECT_INTELLIGENCE_REVIEW_STATUS = ["pending", "approved", "needs_review"] as const;
export type ProspectIntelligenceReviewStatus = (typeof PROSPECT_INTELLIGENCE_REVIEW_STATUS)[number];

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

export type ProspectIntelligenceListFilters = {
  priority?: ProspectIntelligencePriority;
  businessType?: string;
  recommendedOffer?: string;
  segment?: "agency" | "shopify" | "real_estate" | "affiliate" | "local_business" | "saas";
  needsReviewOnly?: boolean;
  importJobId?: string;
  sortBy?: "leadScore" | "priority" | "confidence" | "name";
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
    filters: { tags: ["Agency"], importLimit: 100 },
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
