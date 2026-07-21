/**
 * Prospect AI workspace context assembly.
 * Hierarchy (deterministic):
 *   1. AI Brain intelligence (services, website knowledge, FAQs, custom instructions, …)
 *   2. Business Profile identity (name, website, phone, email; About as supplemental only)
 *   3. Prospect / workflow context (assembled separately into the prospect input)
 *   4. Generic fallback when neither Brain intelligence nor Profile is available
 *
 * Business Profile must never override a configured AI Brain for offer/positioning.
 * Loads fresh from storage on every analysis — no process-level context cache.
 */

import type { AiBusinessKnowledge } from "@shared/schema";
import { storage } from "../storage";

export type ProspectAiContextFallback = "ai_brain" | "business_profile" | "generic";

export type ProspectWorkspaceBusinessContext = {
  /** True when any usable sender/business context exists (Brain intelligence or Profile fallback). */
  configured: boolean;
  /** True when AI Brain intelligence fields are present and must win for offer/outreach. */
  aiBrainIsPrimary: boolean;
  hasAiBrain: boolean;
  hasBusinessProfile: boolean;
  fallbackUsed: ProspectAiContextFallback;

  /** Identity — Business Profile (and Profile-shaped knowledge columns). */
  displayName?: string;
  businessName?: string;
  website?: string;
  email?: string;
  phone?: string;
  /** Profile About — supplemental only when AI Brain is primary; fallback pitch when not. */
  aboutText?: string;

  /** Intelligence — AI Brain. */
  industry?: string;
  servicesProducts?: string;
  websiteKnowledgeSummary?: string;
  faqs?: Array<{ question: string; answer: string }>;
  customInstructions?: string;
  salesGoals?: string;
  /** Derived from intelligence when Brain is primary; from Profile About when Profile fallback. */
  executiveSummary?: string;
};

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseFaqs(raw: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const question = text(row.question);
      const answer = text(row.answer);
      return question && answer ? { question, answer } : null;
    })
    .filter((item): item is { question: string; answer: string } => Boolean(item))
    .slice(0, 20);
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
      parseFaqs(knowledge.faqs).length > 0,
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

/**
 * Pure assembler — call with a fresh knowledge row (or null).
 * Lower-priority Profile fields never overwrite populated Brain intelligence.
 */
export function assembleProspectAiWorkspaceContext(
  knowledge: Partial<AiBusinessKnowledge> | null | undefined,
): ProspectWorkspaceBusinessContext {
  const faqs = parseFaqs(knowledge?.faqs);
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

  const hasAiBrain = hasAiBrainIntelligence(knowledge);
  const hasBusinessProfile = hasBusinessProfileIdentity(knowledge);

  if (hasAiBrain) {
    const executiveSummary =
      websiteKnowledgeSummary || servicesProducts || customInstructions || industry;
    return {
      configured: true,
      aiBrainIsPrimary: true,
      hasAiBrain: true,
      hasBusinessProfile,
      fallbackUsed: "ai_brain",
      displayName,
      businessName,
      website,
      email,
      phone,
      aboutText,
      industry,
      servicesProducts,
      websiteKnowledgeSummary,
      faqs,
      customInstructions,
      salesGoals,
      executiveSummary,
    };
  }

  if (hasBusinessProfile) {
    return {
      configured: true,
      aiBrainIsPrimary: false,
      hasAiBrain: false,
      hasBusinessProfile: true,
      fallbackUsed: "business_profile",
      displayName,
      businessName,
      website,
      email,
      phone,
      aboutText,
      // Profile-only: About may inform cautious fallback positioning.
      executiveSummary: aboutText || businessName,
      faqs: [],
    };
  }

  return {
    configured: false,
    aiBrainIsPrimary: false,
    hasAiBrain: false,
    hasBusinessProfile: false,
    fallbackUsed: "generic",
    faqs: [],
  };
}

export function logProspectAiContextPrecedence(params: {
  workspaceUserId: string;
  contactId?: string;
  analysisPath: string;
  context: ProspectWorkspaceBusinessContext;
}): void {
  const { context } = params;
  const conflict =
    context.aiBrainIsPrimary &&
    detectBusinessContextConflict({
      aboutText: context.aboutText,
      businessName: context.businessName,
      servicesProducts: context.servicesProducts,
      websiteKnowledgeSummary: context.websiteKnowledgeSummary,
    });

  console.info(
    JSON.stringify({
      event: "prospect_ai_context_precedence",
      workspaceId: params.workspaceUserId,
      contactId: params.contactId || null,
      analysisPath: params.analysisPath,
      hasAiBrain: context.hasAiBrain,
      hasBusinessProfile: context.hasBusinessProfile,
      aiBrainIsPrimary: context.aiBrainIsPrimary,
      fallbackUsed: context.fallbackUsed,
      conflictDetected: conflict,
      primarySource: context.aiBrainIsPrimary
        ? "ai_brain"
        : context.hasBusinessProfile
          ? "business_profile"
          : "generic",
      at: new Date().toISOString(),
    }),
  );
}

/** Fresh load per analysis — never reuse a stale in-memory workspace snapshot. */
export async function loadProspectAiWorkspaceContext(
  workspaceUserId: string,
  opts?: { contactId?: string; analysisPath?: string },
): Promise<ProspectWorkspaceBusinessContext> {
  const knowledge = await storage.getAiBusinessKnowledge(workspaceUserId);
  const context = assembleProspectAiWorkspaceContext(knowledge ?? null);
  logProspectAiContextPrecedence({
    workspaceUserId,
    contactId: opts?.contactId,
    analysisPath: opts?.analysisPath || "analyze",
    context,
  });
  return context;
}
