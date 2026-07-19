import type { Contact } from "@shared/schema";
import type {
  ProspectIntelligence,
  ProspectIntelligencePotentialFit,
  ProspectIntelligencePriority,
  ProspectIntelligenceRecommendedOffer,
} from "@shared/prospectImport";
import {
  PROSPECT_INTELLIGENCE_POTENTIAL_FIT,
  PROSPECT_INTELLIGENCE_PRIORITY,
  PROSPECT_INTELLIGENCE_RECOMMENDED_OFFERS,
} from "@shared/prospectImport";
import {
  buildWhachatPositioningForProspect,
  buildWhachatProductContextForPrompt,
  detectWeakWhachatPositioning,
  hasConcreteWhachatPositioning,
} from "@shared/whachatProductPositioning";
import { readProspectImportMetadata } from "./prospectIntelligenceEligibility";

export const PROSPECT_INTELLIGENCE_AI_VERSION = "v3-ai-brain-context";

export type ProspectWorkspaceBusinessContext = {
  configured: boolean;
  businessName?: string;
  industry?: string;
  servicesProducts?: string;
  websiteKnowledgeSummary?: string;
  faqs?: Array<{ question: string; answer: string }>;
  executiveSummary?: string;
};

export type ProspectIntelligenceAiInput = {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  emailDomain?: string;
  ghlSource?: string;
  originalTags: string[];
  importTag?: string;
  batchName?: string;
  importReason?: string;
  notes?: string;
  websiteUrl?: string;
  jobTitle?: string;
  pipeline?: string;
  stage?: string;
};

function clampLikelihood(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampScore(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function asString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.substring(0, max) : undefined;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const v = String(value || "").trim().toLowerCase() as T;
  return allowed.includes(v) ? v : undefined;
}

export function buildProspectIntelligenceInput(contact: Contact): ProspectIntelligenceAiInput {
  const meta = readProspectImportMetadata(contact);
  const email = String(contact.email || "").trim() || undefined;
  const emailDomain = email?.includes("@") ? email.split("@")[1]?.toLowerCase() : undefined;
  const notes = String(contact.notes || "").trim() || undefined;
  const companyFromNotes = notes?.startsWith("Company: ")
    ? notes.replace(/^Company:\s*/, "").split("\n")[0]?.trim()
    : undefined;

  let websiteUrl: string | undefined;
  const urlMatch = notes?.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) websiteUrl = urlMatch[0];

  return {
    name: String(contact.name || "").trim() || "Unknown",
    company: companyFromNotes,
    email,
    phone: String(contact.phone || "").trim() || undefined,
    emailDomain,
    ghlSource: meta?.source,
    originalTags: meta?.originalTags ?? [],
    importTag: contact.tag ?? undefined,
    batchName: meta?.batchName,
    importReason: meta?.importReason,
    notes: notes && !notes.startsWith("Company: ") ? notes : undefined,
    websiteUrl,
    pipeline: meta?.pipeline,
    stage: meta?.stage,
  };
}

export function hasInsufficientProspectData(input: ProspectIntelligenceAiInput): boolean {
  const signals = [
    input.company,
    input.email,
    input.phone,
    input.ghlSource,
    input.originalTags.length > 0,
    input.notes,
    input.websiteUrl,
    input.jobTitle,
    input.importReason,
  ].filter(Boolean);
  return signals.length < 2;
}

function isUnknownLabel(value?: string | null): boolean {
  const v = String(value || "").trim().toLowerCase();
  return !v || v === "unknown" || v === "n/a" || v === "none";
}

export function hasInterestEvidence(input: ProspectIntelligenceAiInput): boolean {
  const hay = [...input.originalTags, input.notes, input.ghlSource, input.importReason]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\b(interested in|looking for|inquiry|inquired|requested info|requested a demo|signed up|opted in|want(?:s|ed)?)\b/i.test(
    hay,
  );
}

export function hasAgencyEvidence(
  input: ProspectIntelligenceAiInput,
  result: ProspectIntelligence,
): boolean {
  if ((result.agencyLikelihood ?? 0) >= 50) return true;
  const tags = input.originalTags.map((t) => t.toLowerCase());
  if (tags.some((t) => t.includes("agency"))) return true;
  if ((result.businessType || "").toLowerCase().includes("agency")) return true;
  if ((input.importReason || "").toLowerCase().includes("agency")) return true;
  if ((input.importTag || "").toLowerCase().includes("agency")) return true;
  return false;
}

export function hasShopifyEvidence(
  input: ProspectIntelligenceAiInput,
  result: ProspectIntelligence,
): boolean {
  if ((result.shopifyMerchantLikelihood ?? 0) >= 50) return true;
  const tags = input.originalTags.map((t) => t.toLowerCase());
  if (tags.some((t) => t.includes("shopify"))) return true;
  if ((result.businessType || "").toLowerCase().includes("shopify")) return true;
  if ((input.importReason || "").toLowerCase().includes("shopify")) return true;
  if ((input.importTag || "").toLowerCase().includes("shopify")) return true;
  return false;
}

export function hasRealEstateEvidence(
  input: ProspectIntelligenceAiInput,
  result: ProspectIntelligence,
): boolean {
  if ((result.realEstateLikelihood ?? 0) >= 50) return true;
  const tags = input.originalTags.map((t) => t.toLowerCase());
  if (tags.some((t) => /real[\s-]?estate|realtor|broker/.test(t))) return true;
  if ((result.businessType || "").toLowerCase().includes("real estate")) return true;
  if ((input.importReason || "").toLowerCase().includes("real estate")) return true;
  return false;
}

export function hasBusinessEvidence(
  input: ProspectIntelligenceAiInput,
  result: ProspectIntelligence,
): boolean {
  if (input.company?.trim()) return true;
  if ((result.companyName || "").trim()) return true;
  if (!isUnknownLabel(result.businessType)) return true;
  if (!isUnknownLabel(result.industry)) return true;
  return false;
}

export function requiresNeutralOutreachMode(result: ProspectIntelligence): boolean {
  if (result.needsReview !== true) return false;
  if (result.potentialFit !== "unknown") return false;
  return isUnknownLabel(result.industry) && isUnknownLabel(result.businessType);
}

function firstNameFromInput(input: ProspectIntelligenceAiInput): string {
  const part = input.name.trim().split(/\s+/)[0];
  return part || "there";
}

export function buildNeutralFirstMessage(input: ProspectIntelligenceAiInput): string {
  return buildTailoredFirstMessage(input, {
    recommendedOffer: "general_demo",
    potentialFit: "unknown",
    needsReview: true,
  });
}

/** Deterministic, offer-aware first message when AI undersells or data is thin. */
export function buildTailoredFirstMessage(
  input: ProspectIntelligenceAiInput,
  result: Pick<
    ProspectIntelligence,
    | "recommendedOffer"
    | "industry"
    | "businessType"
    | "agencyLikelihood"
    | "shopifyMerchantLikelihood"
    | "realEstateLikelihood"
    | "localBusinessLikelihood"
    | "potentialFit"
    | "needsReview"
  >,
): string {
  const name = firstNameFromInput(input);
  const ctx = buildWhachatPositioningForProspect({
    recommendedOffer: result.recommendedOffer,
    industry: result.industry,
    businessType: result.businessType,
    importTag: input.importTag,
    importReason: input.importReason,
    originalTags: input.originalTags,
    agencyLikelihood: result.agencyLikelihood,
    shopifyMerchantLikelihood: result.shopifyMerchantLikelihood,
    realEstateLikelihood: result.realEstateLikelihood,
    localBusinessLikelihood: result.localBusinessLikelihood,
  });

  const question =
    ctx.segment === "partner"
      ? "Would it be worth a quick look at whether this fits your audience?"
      : ctx.segment === "agency" || ctx.segment === "ghl_agency"
        ? "Would it be useful if I shared how agencies use this with their clients?"
        : "Would it be useful if I shared how this could fit what you do?";

  const parts = [
    `Hi ${name}, I'm reaching out from WhachatCRM.`,
    ctx.positioningSentence,
    ctx.optionalCloser,
    question,
  ].filter(Boolean);

  return parts.join(" ").replace(/\s+/g, " ").trim().substring(0, 400);
}

const UNSUPPORTED_OUTREACH_PHRASE_RULES: Array<{
  id: string;
  pattern: RegExp;
  isAllowed: (input: ProspectIntelligenceAiInput, result: ProspectIntelligence) => boolean;
}> = [
  {
    id: "noticed_interest",
    pattern: /I noticed your interest in/i,
    isAllowed: (input) => hasInterestEvidence(input),
  },
  {
    id: "saw_looking",
    pattern: /I saw you were looking for/i,
    isAllowed: (input) => hasInterestEvidence(input),
  },
  {
    id: "noticed_business",
    pattern: /I noticed your business/i,
    isAllowed: (input, result) => hasBusinessEvidence(input, result),
  },
  {
    id: "businesses_like_yours",
    pattern: /businesses like yours/i,
    isAllowed: (input, result) => hasBusinessEvidence(input, result),
  },
  {
    id: "your_agency",
    pattern: /\byour agency\b/i,
    isAllowed: (input, result) => hasAgencyEvidence(input, result),
  },
  {
    id: "your_clients",
    pattern: /\byour clients\b/i,
    isAllowed: (input, result) => hasAgencyEvidence(input, result),
  },
  {
    id: "your_store",
    pattern: /\byour store\b/i,
    isAllowed: (input, result) => hasShopifyEvidence(input, result),
  },
  {
    id: "your_real_estate_business",
    pattern: /\byour real estate business\b/i,
    isAllowed: (input, result) => hasRealEstateEvidence(input, result),
  },
  {
    id: "your_team",
    pattern: /\byour team\b/i,
    isAllowed: (input, result) =>
      hasBusinessEvidence(input, result) || hasAgencyEvidence(input, result),
  },
];

export function detectUnsupportedOutreachClaims(
  message: string,
  input: ProspectIntelligenceAiInput,
  result: ProspectIntelligence,
): string[] {
  const violations: string[] = [];
  for (const rule of UNSUPPORTED_OUTREACH_PHRASE_RULES) {
    if (rule.pattern.test(message) && !rule.isAllowed(input, result)) {
      violations.push(rule.id);
    }
  }
  return violations;
}

export function applyOutreachMessageGuardrails(
  result: ProspectIntelligence,
  input: ProspectIntelligenceAiInput,
  workspaceContext?: ProspectWorkspaceBusinessContext,
): ProspectIntelligence {
  const guarded = { ...result };

  if (requiresNeutralOutreachMode(guarded)) {
    guarded.suggestedFirstMessage = workspaceContext
      ? buildWorkspaceFirstMessage(input, workspaceContext)
      : buildNeutralFirstMessage(input);
    guarded.suggestedOutreachAngle =
      "Neutral introduction — limited prospect data available; qualify before pitching a specific offer.";
    return guarded;
  }

  const message = guarded.suggestedFirstMessage || "";
  const violations = detectUnsupportedOutreachClaims(message, input, guarded);
  if (violations.length > 0) {
    guarded.suggestedFirstMessage = workspaceContext
      ? buildWorkspaceFirstMessage(input, workspaceContext)
      : buildTailoredFirstMessage(input, guarded);
    if (guarded.suggestedOutreachAngle) {
      const angleViolations = detectUnsupportedOutreachClaims(
        guarded.suggestedOutreachAngle,
        input,
        guarded,
      );
      if (angleViolations.length > 0) {
        guarded.suggestedOutreachAngle =
          "Neutral introduction — original draft contained unsupported assumptions.";
      }
    }
    return guarded;
  }

  if (!workspaceContext) {
    const weak = detectWeakWhachatPositioning(message);
    const namesProduct = /whachat\s*crm/i.test(message);
    if (weak.length > 0 || (namesProduct && !hasConcreteWhachatPositioning(message))) {
      guarded.suggestedFirstMessage = buildTailoredFirstMessage(input, guarded);
    }
  }

  return guarded;
}

function buildWorkspaceFirstMessage(
  input: ProspectIntelligenceAiInput,
  context: ProspectWorkspaceBusinessContext,
): string {
  if (!context.configured) return "";
  const name = firstNameFromInput(input);
  const sender = context.businessName?.trim() || "our team";
  const value =
    readableServices(context.servicesProducts) ||
    context.executiveSummary?.trim().replace(/\s+/g, " ").slice(0, 180) ||
    "help organizations improve customer acquisition and follow-up";
  return `Hi ${name}, I'm reaching out from ${sender}. We ${value.replace(/^[Ww]e\s+/, "")}. Would a quick conversation be useful?`.slice(
    0,
    400,
  );
}

function readableServices(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const entries = parsed
        .map((item) =>
          typeof item === "string"
            ? item
            : item && typeof item === "object"
              ? String(
                  (item as Record<string, unknown>).name ||
                    (item as Record<string, unknown>).title ||
                    "",
                )
              : "",
        )
        .filter(Boolean);
      if (entries.length) return `offer ${entries.slice(0, 3).join(", ")}`.slice(0, 180);
    }
  } catch {
    // AI Brain also supports plain text; keep it as written.
  }
  return value.replace(/\s+/g, " ").slice(0, 180);
}

function buildWorkspaceContextForPrompt(
  context: ProspectWorkspaceBusinessContext | undefined,
): string {
  if (!context) return buildWhachatProductContextForPrompt();
  if (!context.configured) {
    return `WORKSPACE BUSINESS CONTEXT:
AI Brain is not configured. Perform basic prospect analysis only.
- Score data completeness, business legitimacy signals, online presence, and outreach readiness.
- Do not infer fit for a specific product or service.
- Leave suggestedFirstMessage empty rather than inventing what the workspace sells.`;
  }
  return `WORKSPACE BUSINESS CONTEXT (AI Brain is the source of truth):
${JSON.stringify(
  {
    businessName: context.businessName || null,
    industry: context.industry || null,
    productsAndServices: context.servicesProducts || null,
    websiteKnowledge: context.websiteKnowledgeSummary || null,
    faqs: context.faqs || [],
    executiveSummary: context.executiveSummary || null,
  },
  null,
  2,
)}

Use this context to assess fit and personalize outreach. Never ask what the workspace sells and never invent details beyond this context.`;
}

export function buildProspectIntelligencePrompt(
  input: ProspectIntelligenceAiInput,
  workspaceContext?: ProspectWorkspaceBusinessContext,
): string {
  const offerGuidance = workspaceContext
    ? `OFFER GUIDANCE:
- Use recommendedOffer="general_demo" when the prospect is a plausible fit for the workspace's products/services.
- Use recommendedOffer="not_a_fit" only when evidence clearly indicates poor fit.
- Legacy WhachatCRM offer categories are reserved for internal use and must not be selected for customer workspaces.`
    : `OFFER ↔ SEGMENT HINTS:
- partner_program → partner
- agency_white_label → agency / ghl_agency
- shopify_app → shopify
- real_estate_growth_engine → real_estate
- core_whachatcrm / general_demo → local_service or general`;

  return `Analyze this prospect for acquisition fit, outreach readiness, and classification.

${buildWorkspaceContextForPrompt(workspaceContext)}

STRICT RULES:
- Never claim facts not supported by the input. Use likelihood scores 0-100 instead of definitive labels.
- Do not invent company size, revenue, websites, job titles, or industries.
- If data is insufficient, set needsReview=true, potentialFit="unknown", priority="needs_review".
- Use concise internal language. suggestedFirstMessage max 400 chars.

OUTREACH MESSAGE RULES (suggestedFirstMessage):
- Ground positioning only in the WORKSPACE BUSINESS CONTEXT above. If AI Brain is not configured, leave suggestedFirstMessage empty.
- Never claim the prospect showed interest in the workspace, its products, messaging, CRM, AI, Shopify, real estate, agency services, or any other topic unless explicit source evidence says so.
- Never use phrases like "I noticed your interest in...", "I saw you were looking for...", "businesses like yours", "your agency", "your store", "your clients", "your team", or "your real estate business" unless the prospect input explicitly supports that claim.
- Do not assume the prospect owns or represents a business unless company, businessType, industry, or tags support it.
- For needs_review / unknown-fit prospects with minimal data, write a neutral introduction that explains WhachatCRM accurately (CRM + unified inbox + AI engagement) and asks whether it is relevant — without pretending to know their business or intent.
- The recommendedOffer must follow the offer guidance below.

${offerGuidance}

Prospect input JSON:
${JSON.stringify(input, null, 2)}

Return JSON only with this schema:
{
  "industry": string | null,
  "businessType": string | null,
  "companyName": string | null,
  "jobTitle": string | null,
  "agencyLikelihood": number,
  "shopifyMerchantLikelihood": number,
  "realEstateLikelihood": number,
  "localBusinessLikelihood": number,
  "saasLikelihood": number,
  "potentialFit": "high" | "medium" | "low" | "unknown",
  "leadScore": number,
  "priority": "high" | "medium" | "low" | "needs_review",
  "recommendedOffer": "partner_program" | "shopify_app" | "real_estate_growth_engine" | "core_whachatcrm" | "agency_white_label" | "general_demo" | "not_a_fit",
  "suggestedOutreachAngle": string,
  "suggestedFirstMessage": string,
  "reasoningSummary": string,
  "needsReview": boolean,
  "confidence": number
}`;
}

export function buildInsufficientDataResult(
  model: string,
  input?: ProspectIntelligenceAiInput,
  workspaceContext?: ProspectWorkspaceBusinessContext,
): ProspectIntelligence {
  const base: ProspectIntelligence = {
    industry: undefined,
    businessType: "unknown",
    potentialFit: "unknown",
    leadScore: 0,
    priority: "needs_review",
    recommendedOffer: "general_demo",
    suggestedOutreachAngle: "Insufficient data — manual review required before outreach.",
    suggestedFirstMessage: "",
    reasoningSummary:
      "Insufficient business information to classify this prospect reliably. Only name-level data was available.",
    needsReview: true,
    confidence: 0,
    analyzedAt: new Date().toISOString(),
    aiModel: model,
    aiVersion: PROSPECT_INTELLIGENCE_AI_VERSION,
    analysisStatus: "needs_review",
    reviewStatus: "needs_review",
  };
  if (!input) return base;
  return applyOutreachMessageGuardrails(base, input, workspaceContext);
}

export function parseAndValidateProspectIntelligence(
  raw: unknown,
  model: string,
  input?: ProspectIntelligenceAiInput,
  workspaceContext?: ProspectWorkspaceBusinessContext,
): ProspectIntelligence {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  let needsReview = Boolean(data.needsReview);
  let potentialFit =
    pickEnum<ProspectIntelligencePotentialFit>(data.potentialFit, PROSPECT_INTELLIGENCE_POTENTIAL_FIT) ??
    "unknown";
  let priority =
    pickEnum<ProspectIntelligencePriority>(data.priority, PROSPECT_INTELLIGENCE_PRIORITY) ??
    "needs_review";

  const leadScore = clampScore(data.leadScore) ?? 0;
  const confidence = clampScore(data.confidence) ?? 0;

  if (leadScore < 0 || leadScore > 100) needsReview = true;
  if (confidence < 20) {
    needsReview = true;
    if (priority !== "needs_review") priority = "needs_review";
  }

  const recommendedOffer =
    pickEnum<ProspectIntelligenceRecommendedOffer>(
      data.recommendedOffer,
      PROSPECT_INTELLIGENCE_RECOMMENDED_OFFERS,
    ) ?? "general_demo";

  const result: ProspectIntelligence = {
    industry: asString(data.industry, 120),
    businessType: asString(data.businessType, 120),
    companyName: asString(data.companyName, 200),
    jobTitle: asString(data.jobTitle, 120),
    agencyLikelihood: clampLikelihood(data.agencyLikelihood),
    shopifyMerchantLikelihood: clampLikelihood(data.shopifyMerchantLikelihood),
    realEstateLikelihood: clampLikelihood(data.realEstateLikelihood),
    localBusinessLikelihood: clampLikelihood(data.localBusinessLikelihood),
    saasLikelihood: clampLikelihood(data.saasLikelihood),
    potentialFit,
    leadScore,
    priority,
    recommendedOffer,
    suggestedOutreachAngle: asString(data.suggestedOutreachAngle, 500),
    suggestedFirstMessage: asString(data.suggestedFirstMessage, 400),
    reasoningSummary: asString(data.reasoningSummary, 800),
    needsReview,
    confidence,
    analyzedAt: new Date().toISOString(),
    aiModel: model,
    aiVersion: PROSPECT_INTELLIGENCE_AI_VERSION,
    analysisStatus: needsReview ? "needs_review" : "completed",
    reviewStatus: needsReview ? "needs_review" : "pending",
  };

  if (!result.reasoningSummary) {
    result.needsReview = true;
    result.priority = "needs_review";
    result.analysisStatus = "needs_review";
    result.reviewStatus = "needs_review";
    result.reasoningSummary = "AI response missing reasoning summary.";
  }

  if (input) {
    return applyOutreachMessageGuardrails(result, input, workspaceContext);
  }

  return result;
}

export function countByPriority(priority: ProspectIntelligencePriority | undefined): {
  high: number;
  medium: number;
  low: number;
  needsReview: number;
} {
  switch (priority) {
    case "high":
      return { high: 1, medium: 0, low: 0, needsReview: 0 };
    case "medium":
      return { high: 0, medium: 1, low: 0, needsReview: 0 };
    case "low":
      return { high: 0, medium: 0, low: 1, needsReview: 0 };
    default:
      return { high: 0, medium: 0, low: 0, needsReview: 1 };
  }
}
