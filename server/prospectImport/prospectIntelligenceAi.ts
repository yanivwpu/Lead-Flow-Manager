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
import { readProspectImportMetadata } from "./prospectIntelligenceEligibility";

export const PROSPECT_INTELLIGENCE_AI_VERSION = "v1";

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

export function buildProspectIntelligencePrompt(input: ProspectIntelligenceAiInput): string {
  return `Analyze this imported prospect for WhaChatCRM (unified WhatsApp/Instagram/Messenger inbox + AI for agencies, Shopify merchants, real estate, affiliates, local businesses).

STRICT RULES:
- Never claim facts not supported by the input. Use likelihood scores 0-100 instead of definitive labels.
- Do not invent company size, revenue, websites, job titles, or industries.
- If data is insufficient, set needsReview=true, potentialFit="unknown", priority="needs_review".
- Use concise internal language. suggestedFirstMessage max 400 chars.

WhaChatCRM offer angles:
- partner_program / agency_white_label: digital/GHL agencies, multi-client operators
- shopify_app: Shopify merchants, ecommerce
- real_estate_growth_engine: real estate professionals
- core_whachatcrm / general_demo: local businesses, general fit
- not_a_fit: poor fit

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

export function buildInsufficientDataResult(model: string): ProspectIntelligence {
  return {
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
}

export function parseAndValidateProspectIntelligence(
  raw: unknown,
  model: string,
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
