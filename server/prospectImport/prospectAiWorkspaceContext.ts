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
 *
 * Core Brain > Profile assemble is shared via @shared/workspaceIntelligence
 * (Workspace Intelligence Snapshot). Prospect adds outreachInstructions on load.
 */

import type { AiBusinessKnowledge } from "@shared/schema";
import {
  assembleWorkspaceIntelligence,
  detectBusinessContextConflict,
  hasAiBrainIntelligence,
  hasBusinessProfileIdentity,
  type WorkspaceIntelligence,
} from "@shared/workspaceIntelligence";
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
  /**
   * Prospect AI Campaign Outreach Instructions — separate from AI Brain customInstructions.
   * Applied only during Prospect AI subject/message generation.
   */
  outreachInstructions?: import("@shared/prospectOutreachInstructions").ProspectOutreachInstructions | null;
};

export {
  hasAiBrainIntelligence,
  hasBusinessProfileIdentity,
  detectBusinessContextConflict,
};

function toProspectContext(intel: WorkspaceIntelligence): ProspectWorkspaceBusinessContext {
  return {
    configured: intel.configured,
    aiBrainIsPrimary: intel.aiBrainIsPrimary,
    hasAiBrain: intel.hasAiBrain,
    hasBusinessProfile: intel.hasBusinessProfile,
    fallbackUsed: intel.primarySource,
    displayName: intel.displayName,
    businessName: intel.businessName,
    website: intel.website,
    email: intel.email,
    phone: intel.phone,
    aboutText: intel.aboutText,
    industry: intel.industry,
    servicesProducts: intel.servicesProducts,
    websiteKnowledgeSummary: intel.websiteKnowledgeSummary,
    faqs: intel.faqs,
    customInstructions: intel.customInstructions,
    salesGoals: intel.salesGoals,
    executiveSummary: intel.executiveSummary,
  };
}

/**
 * Pure assembler — call with a fresh knowledge row (or null).
 * Delegates to shared Workspace Intelligence (Brain > Profile).
 */
export function assembleProspectAiWorkspaceContext(
  knowledge: Partial<AiBusinessKnowledge> | null | undefined,
): ProspectWorkspaceBusinessContext {
  const intel = assembleWorkspaceIntelligence({ knowledge: knowledge ?? null });
  return toProspectContext(intel);
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

  try {
    const { getOutreachSettings } = await import("./prospectOutreachQueueService");
    const { toOutreachInstructions } = await import("@shared/prospectMessageCreation");
    const settings = await getOutreachSettings(workspaceUserId);
    // AI Compose prompt layer uses instruction fields only (mode/templates handled elsewhere).
    context.outreachInstructions = toOutreachInstructions(settings.outreachInstructions);
  } catch {
    context.outreachInstructions = null;
  }

  logProspectAiContextPrecedence({
    workspaceUserId,
    contactId: opts?.contactId,
    analysisPath: opts?.analysisPath || "analyze",
    context,
  });
  return context;
}
