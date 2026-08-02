/**
 * Workspace Intelligence Snapshot — shared Brain > Profile assembler.
 *
 * Hierarchy (deterministic):
 *   1. AI Brain intelligence (services, website knowledge, FAQs, custom instructions, …)
 *   2. Business Profile identity (name, website, phone, email; About as supplemental only)
 *   3. Generic fallback when neither Brain intelligence nor Profile is available
 *
 * Business Profile must never override a configured AI Brain for offer/positioning.
 * Industry is one signal — not the controlling truth for business model.
 *
 * Pure functions only (no I/O). Server caching / loading lives in
 * server/workspaceIntelligenceService.ts.
 */

import type { AiBusinessKnowledge, AiSettings } from "./schema";
import {
  buildFactNarrativeSummary,
  compareFactsForRetrieval,
  formatFactValue,
  summarizeKnowledgeFreshness,
  type KnowledgeFact,
  type KnowledgeFreshnessPolicy,
} from "./businessKnowledgeFacts";

export type WorkspaceIntelligenceSource = "ai_brain" | "business_profile" | "generic";

export type WorkspaceIntelligenceFaq = { question: string; answer: string };

export type WorkspaceQualifyingQuestion = {
  key?: string;
  label?: string;
  question: string;
  required?: boolean;
};

export type WorkspaceGrowthEngines = {
  rgeInstalled: boolean;
  installedTemplateIds: string[];
};

export type WorkspaceIntelligenceCapabilities = {
  bookingLinkConfigured: boolean;
  leadQualificationEnabled: boolean;
  autoTaggingEnabled: boolean;
  hasWebsiteKnowledge: boolean;
  hasFaqs: boolean;
  hasQualifyingQuestions: boolean;
  hasCustomInstructions: boolean;
  realtorGrowthEngineInstalled: boolean;
  /** True once the workspace has published structured facts. */
  hasStructuredFacts: boolean;
};

/**
 * Counts only — the snapshot is sent to the client on every Inbox load, so facts
 * themselves stay server-side and are fetched per turn by the reply path.
 */
export type WorkspaceKnowledgeFreshness = {
  publishedFacts: number;
  fresh: number;
  aging: number;
  stale: number;
  oldestVerifiedAt: string | null;
  newestVerifiedAt: string | null;
};

const EMPTY_FRESHNESS: WorkspaceKnowledgeFreshness = {
  publishedFacts: 0,
  fresh: 0,
  aging: 0,
  stale: 0,
  oldestVerifiedAt: null,
  newestVerifiedAt: null,
};

/** Full assembled intelligence (server + Prospect reuse). */
export type WorkspaceIntelligence = {
  configured: boolean;
  aiBrainIsPrimary: boolean;
  hasAiBrain: boolean;
  hasBusinessProfile: boolean;
  primarySource: WorkspaceIntelligenceSource;

  displayName?: string;
  businessName?: string;
  website?: string;
  email?: string;
  phone?: string;
  aboutText?: string;

  /** One signal among many — never the sole business-model controller. */
  industry?: string;
  servicesProducts?: string;
  businessHours?: string;
  locations?: string;
  bookingLink?: string;
  salesGoals?: string;
  customInstructions?: string;
  /** Full saved website summary (server / Prospect). Prefer knowledgeBrief for clients. */
  websiteKnowledgeSummary?: string;
  /** Short client-safe slice of website / offer knowledge. */
  knowledgeBrief?: string;
  executiveSummary?: string;

  faqs: WorkspaceIntelligenceFaq[];
  qualifyingQuestions: WorkspaceQualifyingQuestion[];
  primaryOfferings: string[];

  persona?: string;
  aiMode?: string;
  confidenceLevel?: string;
  leadQualificationEnabled: boolean;
  autoTaggingEnabled: boolean;
  handoffKeywords: string[];

  growthEngines: WorkspaceGrowthEngines;
  capabilities: WorkspaceIntelligenceCapabilities;
  knowledgeFreshness: WorkspaceKnowledgeFreshness;

  knowledgeUpdatedAt: string | null;
  settingsUpdatedAt: string | null;
  websiteKnowledgeUpdatedAt: string | null;
};

/**
 * Client-facing snapshot: no full website dump; includes version/freshness metadata.
 * Safe for Inbox / Copilot consumption.
 */
export type WorkspaceIntelligenceSnapshot = {
  version: string;
  generatedAt: string;
  knowledgeUpdatedAt: string | null;
  settingsUpdatedAt: string | null;
  websiteKnowledgeUpdatedAt: string | null;
  cacheFingerprint: string;

  configured: boolean;
  aiBrainIsPrimary: boolean;
  hasAiBrain: boolean;
  hasBusinessProfile: boolean;
  primarySource: WorkspaceIntelligenceSource;

  displayName?: string;
  businessName?: string;
  website?: string;
  email?: string;
  phone?: string;
  aboutText?: string;

  industry?: string;
  servicesProducts?: string;
  businessHours?: string;
  locations?: string;
  bookingLinkConfigured: boolean;
  salesGoals?: string;
  customInstructions?: string;
  knowledgeBrief?: string;
  executiveSummary?: string;

  faqs: WorkspaceIntelligenceFaq[];
  qualifyingQuestions: WorkspaceQualifyingQuestion[];
  primaryOfferings: string[];

  persona?: string;
  aiMode?: string;
  confidenceLevel?: string;
  leadQualificationEnabled: boolean;
  autoTaggingEnabled: boolean;
  handoffKeywords: string[];

  growthEngines: WorkspaceGrowthEngines;
  capabilities: WorkspaceIntelligenceCapabilities;
  /** Counts only; lets a client say "verified last week" without shipping the facts. */
  knowledgeFreshness: WorkspaceKnowledgeFreshness;
};

export type AssembleWorkspaceIntelligenceInput = {
  knowledge?: Partial<AiBusinessKnowledge> | null;
  settings?: Partial<AiSettings> | null;
  growthEngines?: Partial<WorkspaceGrowthEngines> | null;
  /** Published facts only. Drafts must never reach a consumer. */
  publishedFacts?: KnowledgeFact[] | null;
  freshnessPolicy?: KnowledgeFreshnessPolicy;
  now?: Date;
};

const KNOWLEDGE_BRIEF_MAX = 500;
const FAQ_ANSWER_MAX = 280;
const MAX_FAQS = 12;
const MAX_QUALIFYING = 20;
const MAX_OFFERINGS = 12;

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isoTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export function parseWorkspaceFaqs(raw: unknown): WorkspaceIntelligenceFaq[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const question = text(row.question);
      const answer = text(row.answer);
      return question && answer ? { question, answer } : null;
    })
    .filter((item): item is WorkspaceIntelligenceFaq => Boolean(item))
    .slice(0, MAX_FAQS);
}

export function parseQualifyingQuestions(raw: unknown): WorkspaceQualifyingQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const question = text(row.question);
      if (!question) return null;
      return {
        key: text(row.key) || `q_${i}`,
        label: text(row.label),
        question,
        required: row.required === false ? false : true,
      };
    })
    .filter((item): item is WorkspaceQualifyingQuestion => Boolean(item))
    .slice(0, MAX_QUALIFYING);
}

/** Split services/products text into short offering labels (no LLM). */
export function derivePrimaryOfferings(servicesProducts: string | undefined): string[] {
  const raw = text(servicesProducts);
  if (!raw) return [];
  // Try JSON array first
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            if (typeof item === "string") return text(item);
            if (item && typeof item === "object") {
              const row = item as Record<string, unknown>;
              return text(row.name) || text(row.title) || text(row.label);
            }
            return undefined;
          })
          .filter((v): v is string => Boolean(v))
          .slice(0, MAX_OFFERINGS);
      }
    } catch {
      /* fall through */
    }
  }
  return raw
    .split(/\n|;|\|/)
    .map((part) => part.replace(/^[-*•]\s*/, "").trim())
    .filter((part) => part.length >= 2 && part.length <= 120)
    .slice(0, MAX_OFFERINGS);
}

/**
 * Offerings taken from published facts rather than a prose blob.
 * Plans come first because "what do you sell" is most often answered by the priced tiers.
 */
export function derivePrimaryOfferingsFromFacts(facts: KnowledgeFact[]): string[] {
  const published = facts.filter((f) => f.state === "published");
  if (published.length === 0) return [];
  const ordered = [...published].sort(compareFactsForRetrieval);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const type of ["pricing_plan", "service", "product"] as const) {
    for (const fact of ordered) {
      if (fact.factType !== type) continue;
      const data = fact.data as { name?: string };
      const label = text(data?.name) || formatFactValue(fact);
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label.length > 120 ? `${label.slice(0, 119).trimEnd()}…` : label);
      if (out.length >= MAX_OFFERINGS) return out;
    }
  }
  return out;
}

export function buildKnowledgeBrief(params: {
  websiteKnowledgeSummary?: string;
  servicesProducts?: string;
  executiveSummary?: string;
  maxLen?: number;
}): string | undefined {
  const max = params.maxLen ?? KNOWLEDGE_BRIEF_MAX;
  const source =
    text(params.websiteKnowledgeSummary) ||
    text(params.executiveSummary) ||
    text(params.servicesProducts);
  if (!source) return undefined;
  if (source.length <= max) return source;
  return `${source.slice(0, max - 1).trimEnd()}…`;
}

/** AI Brain semantic fields — not Business Profile identity. */
export function hasAiBrainIntelligence(
  knowledge: Partial<AiBusinessKnowledge> | null | undefined,
): boolean {
  if (!knowledge) return false;
  return Boolean(
    text(knowledge.servicesProducts) ||
      text(knowledge.websiteKnowledgeSummary) ||
      text(knowledge.customInstructions) ||
      text(knowledge.salesGoals) ||
      text(knowledge.industry) ||
      parseWorkspaceFaqs(knowledge.faqs).length > 0,
  );
}

export function hasBusinessProfileIdentity(
  knowledge: Partial<AiBusinessKnowledge> | null | undefined,
): boolean {
  if (!knowledge) return false;
  return Boolean(
    text(knowledge.displayName) ||
      text(knowledge.businessName) ||
      text(knowledge.aboutText) ||
      text(knowledge.publicWebsite) ||
      text(knowledge.publicPhone) ||
      text(knowledge.publicEmail) ||
      text(knowledge.companyLogo),
  );
}

/**
 * Heuristic conflict: Profile About / company vs Brain products/website knowledge.
 * Used only for safe debug logs — never exposed to users.
 */
export function detectBusinessContextConflict(params: {
  aboutText?: string;
  businessName?: string;
  servicesProducts?: string;
  websiteKnowledgeSummary?: string;
}): boolean {
  const profileBlob = `${params.aboutText || ""} ${params.businessName || ""}`.toLowerCase();
  const brainBlob =
    `${params.servicesProducts || ""} ${params.websiteKnowledgeSummary || ""}`.toLowerCase();
  if (!profileBlob.trim() || !brainBlob.trim()) return false;

  const profileLooksRe =
    /\b(real\s*estate|realtor|brokerage|mls|buyer|seller|listing)\b/.test(profileBlob);
  const brainLooksCrm =
    /\b(crm|inbox|whatsapp|whachat|saas|customer\s+acquisition|unified\s+inbox|ai[- ]powered)\b/.test(
      brainBlob,
    );
  const profileLooksCrm =
    /\b(crm|inbox|whatsapp|whachat|saas|customer\s+acquisition)\b/.test(profileBlob);
  const brainLooksRe =
    /\b(real\s*estate|realtor|brokerage|mls)\b/.test(brainBlob) &&
    !/\b(crm|inbox|whachat)\b/.test(brainBlob);

  return (profileLooksRe && brainLooksCrm) || (profileLooksCrm && brainLooksRe);
}

function truncateFaqsForClient(faqs: WorkspaceIntelligenceFaq[]): WorkspaceIntelligenceFaq[] {
  return faqs.map((f) => ({
    question: f.question,
    answer:
      f.answer.length > FAQ_ANSWER_MAX
        ? `${f.answer.slice(0, FAQ_ANSWER_MAX - 1).trimEnd()}…`
        : f.answer,
  }));
}

/**
 * Pure assembler — Brain intelligence wins over Profile for offer/positioning.
 * Does not call LLMs or perform I/O.
 */
export function assembleWorkspaceIntelligence(
  input: AssembleWorkspaceIntelligenceInput,
): WorkspaceIntelligence {
  const knowledge = input.knowledge ?? null;
  const settings = input.settings ?? null;
  const rgeInstalled = Boolean(input.growthEngines?.rgeInstalled);
  const installedTemplateIds = Array.isArray(input.growthEngines?.installedTemplateIds)
    ? [...new Set(input.growthEngines!.installedTemplateIds!.filter(Boolean))]
    : rgeInstalled
      ? ["realtor-growth-engine"]
      : [];

  const publishedFacts = (input.publishedFacts ?? []).filter((f) => f.state === "published");
  const hasFacts = publishedFacts.length > 0;
  const knowledgeFreshness: WorkspaceKnowledgeFreshness = hasFacts
    ? (() => {
        const summary = summarizeKnowledgeFreshness(
          publishedFacts,
          input.now ?? new Date(),
          input.freshnessPolicy,
        );
        return {
          publishedFacts: summary.total,
          fresh: summary.fresh,
          aging: summary.aging,
          stale: summary.stale,
          oldestVerifiedAt: summary.oldestVerifiedAt,
          newestVerifiedAt: summary.newestVerifiedAt,
        };
      })()
    : EMPTY_FRESHNESS;

  const faqs = parseWorkspaceFaqs(knowledge?.faqs);
  const qualifyingQuestions = parseQualifyingQuestions(knowledge?.qualifyingQuestions);
  const displayName = text(knowledge?.displayName);
  const businessName = text(knowledge?.businessName);
  const website = text(knowledge?.publicWebsite);
  const email = text(knowledge?.publicEmail);
  const phone = text(knowledge?.publicPhone);
  const aboutText = text(knowledge?.aboutText);

  const industry = text(knowledge?.industry);
  const servicesProducts = text(knowledge?.servicesProducts);
  const websiteKnowledgeSummary = text(knowledge?.websiteKnowledgeSummary);
  const customInstructions = text(knowledge?.customInstructions);
  const salesGoals = text(knowledge?.salesGoals);
  const businessHours = text(knowledge?.businessHours);
  const locations = text(knowledge?.locations);
  const bookingLink = text(knowledge?.bookingLink);

  const hasAiBrain = hasAiBrainIntelligence(knowledge) || hasFacts;
  const hasBusinessProfile = hasBusinessProfileIdentity(knowledge);

  const persona = text(settings?.aiPersona) || "professional";
  const aiMode = text(settings?.aiMode) || "suggest_only";
  const confidenceLevel = text(settings?.confidenceLevel) || "balanced";
  const leadQualificationEnabled = settings?.leadQualificationEnabled !== false;
  const autoTaggingEnabled = settings?.autoTaggingEnabled !== false;
  const handoffKeywords = Array.isArray(settings?.handoffKeywords)
    ? settings!.handoffKeywords!.filter((k): k is string => typeof k === "string" && !!k.trim())
    : ["call me", "human", "agent", "speak to someone"];

  const knowledgeUpdatedAt = isoTimestamp(knowledge?.updatedAt);
  const settingsUpdatedAt = isoTimestamp(settings?.updatedAt);
  const websiteKnowledgeUpdatedAt = isoTimestamp(knowledge?.websiteKnowledgeUpdatedAt);

  const growthEngines: WorkspaceGrowthEngines = {
    rgeInstalled,
    installedTemplateIds,
  };

  const baseCapabilities = (): WorkspaceIntelligenceCapabilities => ({
    bookingLinkConfigured: Boolean(bookingLink),
    leadQualificationEnabled,
    autoTaggingEnabled,
    hasWebsiteKnowledge: Boolean(websiteKnowledgeSummary),
    hasFaqs: faqs.length > 0,
    hasQualifyingQuestions: qualifyingQuestions.length > 0,
    hasCustomInstructions: Boolean(customInstructions),
    realtorGrowthEngineInstalled: rgeInstalled,
    hasStructuredFacts: hasFacts,
  });

  if (hasAiBrain) {
    // Facts outrank the prose summary here for the same reason they do in a reply:
    // the summary is a paraphrase, the facts are the values that were verified.
    const factNarrative = hasFacts ? buildFactNarrativeSummary(publishedFacts) : "";
    const executiveSummary =
      text(factNarrative) || websiteKnowledgeSummary || servicesProducts || customInstructions || industry;
    const knowledgeBrief = buildKnowledgeBrief({
      websiteKnowledgeSummary: text(factNarrative) || websiteKnowledgeSummary,
      servicesProducts,
      executiveSummary,
    });
    const factOfferings = derivePrimaryOfferingsFromFacts(publishedFacts);
    return {
      configured: true,
      aiBrainIsPrimary: true,
      hasAiBrain: true,
      hasBusinessProfile,
      primarySource: "ai_brain",
      displayName,
      businessName,
      website,
      email,
      phone,
      aboutText,
      industry,
      servicesProducts,
      businessHours,
      locations,
      bookingLink,
      salesGoals,
      customInstructions,
      websiteKnowledgeSummary,
      knowledgeBrief,
      executiveSummary,
      faqs,
      qualifyingQuestions,
      primaryOfferings:
        factOfferings.length > 0 ? factOfferings : derivePrimaryOfferings(servicesProducts),
      persona,
      aiMode,
      confidenceLevel,
      leadQualificationEnabled,
      autoTaggingEnabled,
      handoffKeywords,
      growthEngines,
      capabilities: baseCapabilities(),
      knowledgeFreshness,
      knowledgeUpdatedAt,
      settingsUpdatedAt,
      websiteKnowledgeUpdatedAt,
    };
  }

  if (hasBusinessProfile) {
    const executiveSummary = aboutText || businessName;
    const knowledgeBrief = buildKnowledgeBrief({
      executiveSummary,
      servicesProducts: aboutText,
    });
    return {
      configured: true,
      aiBrainIsPrimary: false,
      hasAiBrain: false,
      hasBusinessProfile: true,
      primarySource: "business_profile",
      displayName,
      businessName,
      website,
      email,
      phone,
      aboutText,
      executiveSummary,
      knowledgeBrief,
      faqs: [],
      qualifyingQuestions: [],
      primaryOfferings: [],
      persona,
      aiMode,
      confidenceLevel,
      leadQualificationEnabled,
      autoTaggingEnabled,
      handoffKeywords,
      growthEngines,
      capabilities: {
        ...baseCapabilities(),
        hasWebsiteKnowledge: false,
        hasFaqs: false,
        hasQualifyingQuestions: false,
        hasCustomInstructions: false,
      },
      knowledgeFreshness,
      knowledgeUpdatedAt,
      settingsUpdatedAt,
      websiteKnowledgeUpdatedAt,
    };
  }

  return {
    configured: false,
    aiBrainIsPrimary: false,
    hasAiBrain: false,
    hasBusinessProfile: false,
    primarySource: "generic",
    faqs: [],
    qualifyingQuestions: [],
    primaryOfferings: [],
    persona,
    aiMode,
    confidenceLevel,
    leadQualificationEnabled,
    autoTaggingEnabled,
    handoffKeywords,
    growthEngines,
    capabilities: {
      bookingLinkConfigured: false,
      leadQualificationEnabled,
      autoTaggingEnabled,
      hasWebsiteKnowledge: false,
      hasFaqs: false,
      hasQualifyingQuestions: false,
      hasCustomInstructions: false,
      realtorGrowthEngineInstalled: rgeInstalled,
      hasStructuredFacts: false,
    },
    knowledgeFreshness,
    knowledgeUpdatedAt,
    settingsUpdatedAt,
    websiteKnowledgeUpdatedAt,
  };
}

/** Lightweight content stamp so cache differs across workspaces even without timestamps. */
function contentStamp(intel: WorkspaceIntelligence): string {
  const raw = [
    intel.businessName,
    intel.industry,
    intel.servicesProducts,
    intel.knowledgeBrief,
    intel.executiveSummary,
    intel.salesGoals,
    intel.primaryOfferings.join(","),
  ]
    .filter(Boolean)
    .join("|");
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

/** Fingerprint for cache keys / invalidation (timestamps + GE flags + content). */
export function workspaceIntelligenceFingerprint(intel: WorkspaceIntelligence): string {
  return [
    intel.knowledgeUpdatedAt || "no-knowledge",
    intel.settingsUpdatedAt || "no-settings",
    intel.websiteKnowledgeUpdatedAt || "no-website",
    `rge:${intel.growthEngines.rgeInstalled ? "1" : "0"}`,
    `ge:${intel.growthEngines.installedTemplateIds.slice().sort().join(",") || "none"}`,
    intel.primarySource,
    // Publishing changes facts without touching any of the timestamps above, so the
    // fact count plus newest verification has to be part of the key.
    `facts:${intel.knowledgeFreshness.publishedFacts}:${intel.knowledgeFreshness.newestVerifiedAt || "none"}`,
    contentStamp(intel),
  ].join("|");
}

/** Client-safe snapshot (caps FAQ answers; omits full websiteKnowledgeSummary). */
export function toWorkspaceIntelligenceSnapshot(
  intel: WorkspaceIntelligence,
  opts?: { generatedAt?: Date },
): WorkspaceIntelligenceSnapshot {
  const fingerprint = workspaceIntelligenceFingerprint(intel);
  const generatedAt = (opts?.generatedAt ?? new Date()).toISOString();
  return {
    version: fingerprint,
    generatedAt,
    knowledgeUpdatedAt: intel.knowledgeUpdatedAt,
    settingsUpdatedAt: intel.settingsUpdatedAt,
    websiteKnowledgeUpdatedAt: intel.websiteKnowledgeUpdatedAt,
    cacheFingerprint: fingerprint,
    configured: intel.configured,
    aiBrainIsPrimary: intel.aiBrainIsPrimary,
    hasAiBrain: intel.hasAiBrain,
    hasBusinessProfile: intel.hasBusinessProfile,
    primarySource: intel.primarySource,
    displayName: intel.displayName,
    businessName: intel.businessName,
    website: intel.website,
    email: intel.email,
    phone: intel.phone,
    aboutText: intel.aboutText,
    industry: intel.industry,
    servicesProducts: intel.servicesProducts,
    businessHours: intel.businessHours,
    locations: intel.locations,
    bookingLinkConfigured: intel.capabilities.bookingLinkConfigured,
    salesGoals: intel.salesGoals,
    customInstructions: intel.customInstructions,
    knowledgeBrief: intel.knowledgeBrief,
    executiveSummary: intel.executiveSummary,
    faqs: truncateFaqsForClient(intel.faqs),
    qualifyingQuestions: intel.qualifyingQuestions,
    primaryOfferings: intel.primaryOfferings,
    persona: intel.persona,
    aiMode: intel.aiMode,
    confidenceLevel: intel.confidenceLevel,
    leadQualificationEnabled: intel.leadQualificationEnabled,
    autoTaggingEnabled: intel.autoTaggingEnabled,
    handoffKeywords: intel.handoffKeywords,
    growthEngines: {
      rgeInstalled: intel.growthEngines.rgeInstalled,
      installedTemplateIds: [...intel.growthEngines.installedTemplateIds],
    },
    capabilities: { ...intel.capabilities },
    knowledgeFreshness: { ...intel.knowledgeFreshness },
  };
}
