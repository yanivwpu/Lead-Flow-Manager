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

export type ProspectImportPreviewResult = {
  totalFound: number;
  tagBreakdown: { tag: string; count: number }[];
  contacts: ProspectImportPreviewContact[];
  truncated: boolean;
  stats: ProspectImportPreviewStats;
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

/** Phase 2 — stored in contact.customFields.prospectIntelligence */
export type ProspectIntelligence = {
  industry?: string;
  businessType?: string;
  isAgency?: boolean;
  isShopifyMerchant?: boolean;
  isRealEstate?: boolean;
  potentialFit?: string;
  leadScore?: number;
  priority?: string;
  suggestedOutreachAngle?: string;
  suggestedFirstMessage?: string;
  reasoning?: string;
  analyzedAt?: string;
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
