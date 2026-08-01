/**
 * Customer-facing insights & next actions — deduplicated, action-oriented.
 * Principle: AI explains the customer, not itself.
 */

import {
  FINANCING_GUIDANCE_SUGGESTION,
  humanizeScoringReason,
  hasFinancingDiscussionFromSignals,
  hasShowingInterestFromSignals,
} from "./customerBehaviorCopy";
import {
  hasGenuineConversationActivity,
  MIN_HOT_TAG_SCORE,
} from "./leadQualification";
import { resolveAiRouting, type AiRoutingDecision } from "./aiRouting";
import { resolveCopilotDominantIntent } from "./copilotIntent";
import {
  resolveAiDomainEligibility,
  type AiDomainEligibilityInput,
} from "./aiDomainEligibility";
import { looksLikeGreetingOnly } from "./conversationTextSignals";
import type { SellerIntentClass } from "./sellerIntent";
import type { WorkspaceIntelligenceSnapshot } from "./workspaceIntelligence";
import {
  analyzeWorkspaceRelevance,
  type WorkspaceRelevanceMatch,
} from "./workspaceIntelligenceRelevance";

export type CustomerInsightContext = {
  reasons?: string[];
  intent?: string;
  bucket?: string;
  viewingIntent?: boolean;
  signals?: unknown;
  missingRequiredCount?: number;
  score?: number;
  mediaOnly?: boolean;
  inboundCount?: number;
  conversationTurns?: number;
  inboundText?: string;
};

type InsightCandidate = { group: string; rank: number; bullet: string };

const REASON_INSIGHTS: Record<string, InsightCandidate> = {
  "Customer appears ready to move forward": {
    group: "ready",
    rank: 92,
    bullet: "Ready to move forward",
  },
  "Customer asked about pricing and buying": {
    group: "purchase",
    rank: 88,
    bullet: "Strong purchase intent",
  },
  "Customer is highly engaged": {
    group: "engagement",
    rank: 38,
    bullet: "Actively engaging in conversation",
  },
  "Customer is engaged": {
    group: "engagement",
    rank: 32,
    bullet: "Actively engaging in conversation",
  },
  "Customer is exploring options": {
    group: "engagement",
    rank: 28,
    bullet: "Exploring options",
  },
  "Customer seems time-sensitive": {
    group: "urgency",
    rank: 70,
    bullet: "Time-sensitive request",
  },
  "Customer shared property-related details": {
    group: "property",
    rank: 45,
    bullet: "Shared property preferences",
  },
  "Customer shared rental-related details": {
    group: "property",
    rank: 45,
    bullet: "Shared rental preferences",
  },
  "A few details are still missing": {
    group: "missing",
    rank: 18,
    bullet: "A few details still missing",
  },
};

export function buildCustomerInsights(ctx: CustomerInsightContext): string[] {
  const bucket = ctx.bucket ?? "";
  const score = ctx.score ?? 0;
  const mediaOnly = ctx.mediaOnly === true;
  const activityStats = {
    inbound: ctx.inboundCount ?? 0,
    outbound: 0,
    turns: ctx.conversationTurns ?? 0,
  };
  const genuineActivity =
    !mediaOnly &&
    bucket !== "unqualified" &&
    hasGenuineConversationActivity(activityStats, ctx.inboundText ?? "");

  const items: InsightCandidate[] = [];
  const rawReasons = ctx.reasons ?? [];
  for (const reason of rawReasons) {
    const human = humanizeScoringReason(reason);
    if (!human) continue;
    const mapped = REASON_INSIGHTS[human];
    if (!mapped) continue;
    if (mapped.group === "engagement" && !genuineActivity) continue;
    items.push(mapped);
  }

  const showing =
    ctx.viewingIntent ||
    ctx.intent === "Booking" ||
    hasShowingInterestFromSignals(ctx.signals);
  if (showing) {
    items.push({
      group: "showing",
      rank: 90,
      bullet: "Interested in scheduling a showing",
    });
  }

  if (hasFinancingDiscussionFromSignals(ctx.signals)) {
    items.push({ group: "financing", rank: 76, bullet: "Asked about financing" });
  }

  if ((ctx.missingRequiredCount ?? 0) > 0 && !items.some((i) => i.group === "missing")) {
    items.push({
      group: "missing",
      rank: 18,
      bullet: "A few details still missing",
    });
  }

  if (
    items.length === 0 &&
    (bucket === "hot" || bucket === "warm") &&
    score >= MIN_HOT_TAG_SCORE &&
    !mediaOnly &&
    ctx.intent &&
    ctx.intent !== "Browsing"
  ) {
    items.push({ group: "interest", rank: 42, bullet: "Showing strong interest" });
  }

  const byGroup = new Map<string, InsightCandidate>();
  for (const item of items) {
    const prev = byGroup.get(item.group);
    if (!prev || item.rank > prev.rank) byGroup.set(item.group, item);
  }

  let grouped = Array.from(byGroup.values());
  const hasPriorityStory = grouped.some((g) =>
    ["ready", "showing", "purchase", "financing", "urgency"].includes(g.group),
  );
  if (hasPriorityStory) {
    grouped = grouped.filter((g) => g.group !== "engagement" && g.group !== "interest");
  }

  return grouped
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3)
    .map((i) => i.bullet);
}

export type ContextualActionContext = {
  handoffActive?: boolean;
  hasShowingIntent?: boolean;
  hasFinancingDiscussion?: boolean;
  hasStrongPurchaseIntent?: boolean;
  bucket?: string;
  leadLabel?: string;
  lastDirection?: "inbound" | "outbound" | null;
  hasFollowUp?: boolean;
  assignedTo?: string | null;
  confidence?: number;
  aiPaused?: boolean;
  hasDelayLater?: boolean;
  lastOutbound?: boolean;
  inboundText?: string;
  showingTimingPhrase?: string | null;
  mentionedDeposit?: boolean;
  schedulingLinkSent?: boolean;
  /** Platform routing decision — aligns Copilot with AI auto-reply routing */
  aiRoutingDecision?: AiRoutingDecision;
  needsRoutingClarification?: boolean;
  /** Count of active preset campaigns this contact can enroll in from the current channel */
  enrollableCampaignCount?: number;
  /** Seller Lead Engine — intent class from latest inbound */
  sellerIntent?: SellerIntentClass | null;
  /** Latest inbound line — preferred for dominant intent when set */
  latestInboundText?: string;
  /** Shared domain eligibility inputs (aligned with Suggest Reply). */
  rgeInstalled?: boolean;
  industry?: string | null;
  leadType?: string | null;
  buyerProfileHasCriteria?: boolean;
  sellerProfileHasData?: boolean;
  contactEmail?: string | null;
  conversationText?: string | null;
  /**
   * Client-safe Workspace Intelligence Snapshot (Phase 1).
   * Primary relevance signal; industry remains eligibility/fallback.
   */
  workspaceIntelligence?: WorkspaceIntelligenceSnapshot | null;
};

export type CopilotBlockedAction = {
  capability: string;
  reason: string;
};

export type CopilotActionProvenance = {
  capability: string;
  label: string;
  source: string;
  intent?: string;
  confidence?: number;
  workspaceIntelligenceUsed: boolean;
  evidence: string[];
  intelligenceEvidence?: string[];
  blockedActions?: CopilotBlockedAction[];
  snapshotVersion?: string;
  eligibility?: Record<string, boolean | string | null | undefined>;
};

type ActionCandidate = {
  label: string;
  rank: number;
  group: string;
  capability?: string;
  source?: string;
  evidence?: string[];
};

function collectBuyerInventoryActions(ctx: ContextualActionContext): ActionCandidate[] {
  const timing = ctx.showingTimingPhrase?.trim();
  const actions: ActionCandidate[] = [
    { label: "Share matching listings", rank: 98, group: "buyer_inventory" },
  ];

  if (ctx.hasShowingIntent) {
    actions.push({
      label: timing ? `Confirm ${timing} availability` : "Confirm showing availability",
      rank: 100,
      group: "showing",
    });
    actions.push({ label: "Schedule showing", rank: 94, group: "showing" });
  } else {
    actions.push({ label: "Schedule showing", rank: 92, group: "showing" });
  }

  actions.push({ label: "Send more matches", rank: 86, group: "buyer_inventory" });
  return actions;
}

function domainEligibilityFromActionContext(
  ctx: ContextualActionContext,
): AiDomainEligibilityInput {
  const intentText = ctx.latestInboundText ?? ctx.inboundText;
  const snap = ctx.workspaceIntelligence;
  // Snapshot industry is preferred for eligibility signals; RGE may also come from snapshot.
  const industry = snap?.industry ?? ctx.industry;
  const rgeInstalled =
    ctx.rgeInstalled === true || snap?.growthEngines?.rgeInstalled === true;
  return {
    inboundText: intentText,
    conversationText: ctx.conversationText ?? ctx.inboundText,
    sellerIntent: ctx.sellerIntent ?? null,
    leadType: ctx.leadType,
    rgeInstalled,
    industry,
    buyerProfileHasCriteria: ctx.buyerProfileHasCriteria,
    sellerProfileHasData: ctx.sellerProfileHasData,
    contactEmail: ctx.contactEmail,
  };
}

function resolveWorkspaceRelevance(ctx: ContextualActionContext): WorkspaceRelevanceMatch {
  return analyzeWorkspaceRelevance({
    snapshot: ctx.workspaceIntelligence,
    conversationText: ctx.conversationText ?? ctx.inboundText,
    latestInboundText: ctx.latestInboundText ?? ctx.inboundText,
  });
}

/**
 * Phase 2: Workspace Intelligence–grounded candidates (deterministic labels).
 * Does not bypass Realtor/RGE/domain eligibility gates.
 */
function collectWorkspaceIntelligenceCandidates(
  ctx: ContextualActionContext,
  relevance: WorkspaceRelevanceMatch,
): { actions: ActionCandidate[]; blocked: CopilotBlockedAction[] } {
  const actions: ActionCandidate[] = [];
  const blocked: CopilotBlockedAction[] = [];
  if (!relevance.snapshotConfigured) return { actions, blocked };

  const { modelHints, conversationHints } = relevance;
  const baseEvidence = relevance.evidence.filter((e) =>
    /offering_match|supported_intent|business_model|knowledge|brain_model|qualification/.test(e),
  );

  // Directory / local-guide businesses: listing sales vs visitor discovery.
  if (modelHints.directoryOrLocalGuide && conversationHints.joinOrListBusiness) {
    actions.push({
      label: "Explain Listing Options",
      rank: 96,
      group: "wi_explain_listing",
      capability: "explain_listing",
      source: "workspace_intelligence_relevance",
      evidence: [...baseEvidence, "capability_explain_listing"],
    });
    actions.push({
      label: "Qualify Business Listing",
      rank: 93,
      group: "wi_qualify_listing",
      capability: "qualify_listing",
      source: "workspace_intelligence_relevance",
      evidence: [...baseEvidence, "capability_qualify_listing"],
    });
    blocked.push({
      capability: "qualify_trip",
      reason: "industry_preset_overridden_by_business_model",
    });
  } else if (modelHints.directoryOrLocalGuide && conversationHints.visitorLocalDiscovery) {
    actions.push({
      label: "Answer From Knowledge",
      rank: 95,
      group: "wi_knowledge",
      capability: "answer_from_knowledge",
      source: "workspace_intelligence_relevance",
      evidence: [...baseEvidence, "capability_answer_from_knowledge"],
    });
    blocked.push({
      capability: "qualify_listing",
      reason: "visitor_discovery_not_listing_sales",
    });
    blocked.push({
      capability: "book",
      reason: "insufficient_listing_sales_evidence",
    });
  } else if (modelHints.travelPlanner && conversationHints.tripPlanning) {
    actions.push({
      label: "Qualify Trip Details",
      rank: 94,
      group: "wi_qualify_trip",
      capability: "qualify_trip",
      source: "workspace_intelligence_relevance",
      evidence: [...baseEvidence, "capability_qualify_trip"],
    });
  } else if (
    // Travel industry alone must not invent trip qualification when Brain model is directory.
    !modelHints.directoryOrLocalGuide &&
    conversationHints.tripPlanning &&
    /\b(travel|tourism)\b/i.test(String(ctx.workspaceIntelligence?.industry || ctx.industry || ""))
  ) {
    actions.push({
      label: "Qualify Trip Details",
      rank: 88,
      group: "wi_qualify_trip",
      capability: "qualify_trip",
      source: "industry_fallback_relevance",
      evidence: ["industry_travel_fallback", "conversation_trip_planning"],
    });
  } else if (
    modelHints.knowledgeHeavy &&
    conversationHints.genericInfoSeeking &&
    !conversationHints.joinOrListBusiness
  ) {
    actions.push({
      label: "Answer From Knowledge",
      rank: 82,
      group: "wi_knowledge",
      capability: "answer_from_knowledge",
      source: "workspace_intelligence_relevance",
      evidence: [...baseEvidence, "capability_answer_from_knowledge"],
    });
  }

  return { actions, blocked };
}

function collectLowEvidenceDiscoveryActions(): ActionCandidate[] {
  return [
    { label: "Understand Intent", rank: 90, group: "discover" },
    { label: "Discover Needs", rank: 86, group: "discover_needs" },
    { label: "Ask Clarifying Question", rank: 84, group: "contact" },
    { label: "Qualify Visitor", rank: 80, group: "qualify" },
  ];
}

function shouldPreferDiscoveryActions(
  ctx: ContextualActionContext,
  dominantIntent: ReturnType<typeof resolveCopilotDominantIntent>,
): boolean {
  const text = String(ctx.latestInboundText ?? ctx.inboundText ?? "").trim();
  if (looksLikeGreetingOnly(text)) return true;
  const lowConfidence = (ctx.confidence ?? 1) < 0.45;
  const intentUnknown = dominantIntent === "neutral";
  const unqualified =
    ctx.bucket === "unqualified" ||
    String(ctx.leadLabel || "").toLowerCase() === "unqualified";
  // Low confidence + unknown/unqualified → discover before high-intent booking/listing.
  return lowConfidence && (intentUnknown || unqualified);
}

type CollectedActions = {
  actions: ActionCandidate[];
  blockedActions: CopilotBlockedAction[];
  relevance: WorkspaceRelevanceMatch;
  earlySource?: string;
  dominantIntent: string;
  showRealEstateCopilotRecommendations: boolean;
};

function collectLowEvidenceDiscoveryActionsWithMeta(): ActionCandidate[] {
  return collectLowEvidenceDiscoveryActions().map((a, i) => ({
    ...a,
    capability: i === 0 ? "discover_intent" : a.group === "qualify" ? "qualify" : "clarify",
    source: "low_confidence_guard",
    evidence: ["greeting_or_low_confidence"],
  }));
}

function collectContextualActionCandidates(ctx: ContextualActionContext): CollectedActions {
  const actions: ActionCandidate[] = [];
  const blockedActions: CopilotBlockedAction[] = [];
  const timing = ctx.showingTimingPhrase?.trim();
  const sellerIntent = ctx.sellerIntent ?? null;
  const domainInput = domainEligibilityFromActionContext(ctx);
  const domainDecision = resolveAiDomainEligibility(domainInput);
  const dominantIntent = resolveCopilotDominantIntent(domainInput);
  const relevance = resolveWorkspaceRelevance(ctx);

  const base = {
    relevance,
    dominantIntent,
    showRealEstateCopilotRecommendations: domainDecision.showRealEstateCopilotRecommendations,
  };

  // System / automated notifications — no lead workflow actions.
  if (domainDecision.suppressLeadWorkflowActions || domainDecision.copilotNoActionNeeded) {
    return {
      ...base,
      earlySource: "system_notification_guard",
      blockedActions: [{ capability: "book", reason: "system_notification" }],
      actions: [
        {
          label: "No action needed",
          rank: 100,
          group: "system_info",
          capability: "none",
          source: "system_notification_guard",
          evidence: ["system_or_notification"],
        },
      ],
    };
  }

  // Greeting / low-confidence unknown intent — WI may be loaded but guard still wins.
  if (shouldPreferDiscoveryActions(ctx, dominantIntent)) {
    const text = String(ctx.latestInboundText ?? ctx.inboundText ?? "").trim();
    const evidence = [
      ...(looksLikeGreetingOnly(text) ? ["greeting_only"] : ["low_confidence"]),
      "no_detected_business_intent",
      ...(relevance.workspaceIntelligenceUsed ? ["snapshot_loaded"] : ["snapshot_absent_or_empty"]),
      "no_supported_intent_match",
    ];
    return {
      ...base,
      earlySource: "low_confidence_guard",
      blockedActions: [
        { capability: "book", reason: "insufficient_intent_evidence" },
        { capability: "ge_seller_consult", reason: "insufficient_intent_evidence" },
        { capability: "qualify_listing", reason: "insufficient_intent_evidence" },
      ],
      actions: collectLowEvidenceDiscoveryActionsWithMeta().map((a) => ({
        ...a,
        evidence,
      })),
    };
  }

  // Workspace Intelligence relevance candidates (non-Realtor; does not bypass RE gates).
  const wi = collectWorkspaceIntelligenceCandidates(ctx, relevance);
  actions.push(...wi.actions);
  blockedActions.push(...wi.blocked);

  // Real-estate Copilot actions require conversation domain + Realtor workspace.
  if (domainDecision.showRealEstateCopilotRecommendations) {
    if (dominantIntent === "seller") {
      if (sellerIntent === "seller_valuation") {
        actions.push({
          label: "Request CMA Information",
          rank: 97,
          group: "seller_cma",
          capability: "ge_seller_cma",
          source: "realtor_seller_eligibility",
        });
        actions.push({
          label: "Request Property Address",
          rank: 95,
          group: "seller_address",
          capability: "ge_seller_address",
          source: "realtor_seller_eligibility",
        });
      } else if (sellerIntent === "seller_listing_consultation" || sellerIntent === "seller_new") {
        actions.push({
          label: "Book Listing Consultation",
          rank: 98,
          group: "seller_consult",
          capability: "ge_seller_consult",
          source: "realtor_seller_eligibility",
          evidence: ["explicit_seller_intent", "realtor_workspace_eligible"],
        });
        actions.push({
          label: "Request Property Address",
          rank: 94,
          group: "seller_address",
          capability: "ge_seller_address",
          source: "realtor_seller_eligibility",
        });
      } else {
        actions.push({
          label: "Book Listing Consultation",
          rank: 92,
          group: "seller_consult",
          capability: "ge_seller_consult",
          source: "realtor_seller_eligibility",
        });
      }
      actions.push({
        label: "Assign Listing Agent",
        rank: 88,
        group: "seller_assign",
        capability: "assign",
        source: "realtor_seller_eligibility",
      });
      actions.push({
        label: "Follow Up",
        rank: 50,
        group: "seller_followup",
        capability: "follow_up",
        source: "realtor_seller_eligibility",
      });
      return {
        ...base,
        blockedActions,
        actions: dedupeActionCandidates(actions).slice(0, 3),
      };
    }

    if (dominantIntent === "mixed") {
      actions.push({
        label: "Book Listing Consultation",
        rank: 90,
        group: "seller_consult",
        capability: "ge_seller_consult",
        source: "realtor_mixed_eligibility",
      });
      actions.push({
        label: "Request Property Address",
        rank: 86,
        group: "seller_address",
        capability: "ge_seller_address",
        source: "realtor_mixed_eligibility",
      });
    }

    if (dominantIntent === "buyer") {
      actions.push(
        ...collectBuyerInventoryActions(ctx).map((a) => ({
          ...a,
          capability: a.group === "showing" ? "book" : "ge_share_listings",
          source: "realtor_buyer_eligibility",
        })),
      );
    }
  } else if (dominantIntent === "seller" || sellerIntent) {
    blockedActions.push({
      capability: "ge_seller_consult",
      reason: "realtor_workspace_or_domain_ineligible",
    });
  }

  const routing =
    ctx.inboundText?.trim()
      ? resolveAiRouting({ inbound: ctx.inboundText, joinedInbound: ctx.inboundText })
      : null;
  const routingDecision = ctx.aiRoutingDecision ?? routing?.decision;
  const needsClarify =
    ctx.needsRoutingClarification ?? routing?.needsRoutingClarification ?? false;
  const infoSeeking = routing?.signals.includes("info_seeking") ?? false;

  if (needsClarify) {
    actions.push({
      label: "Clarify chat vs schedule",
      rank: 93,
      group: "contact",
      capability: "clarify",
      source: "routing_clarify",
    });
  } else if (routingDecision === "ASSIGN_AGENT" && !ctx.assignedTo) {
    actions.push({
      label: "Assign agent",
      rank: 96,
      group: "assign",
      capability: "assign",
      source: "routing_assign",
    });
  } else if (routingDecision === "START_NURTURE") {
    if ((ctx.enrollableCampaignCount ?? 0) > 0) {
      actions.push({
        label: "Enroll in nurture campaign",
        rank: 54,
        group: "campaign",
        capability: "nurture",
        source: "routing_nurture",
      });
    } else {
      actions.push({
        label: "Send nurture follow-up",
        rank: 52,
        group: "followup",
        capability: "follow_up",
        source: "routing_nurture",
      });
    }
  } else if (infoSeeking && !actions.some((a) => a.capability === "answer_from_knowledge")) {
    actions.push({
      label: "Ask qualifying question",
      rank: 84,
      group: "contact",
      capability: "qualify",
      source: "routing_info_seeking",
    });
  }

  const allowBookingActions =
    routingDecision === "BOOK_APPOINTMENT" ||
    (!routingDecision && ctx.hasShowingIntent) ||
    (routingDecision === "CONTINUE_AI" && ctx.hasShowingIntent && !needsClarify);

  // Showing / financing recommendations are real-estate domain actions.
  if (
    domainDecision.showRealEstateCopilotRecommendations &&
    allowBookingActions &&
    ctx.hasShowingIntent
  ) {
    actions.push({
      label: timing ? `Confirm ${timing} availability` : "Confirm showing availability",
      rank: 100,
      group: "showing",
      capability: "book",
      source: "realtor_showing_eligibility",
    });
    if (!ctx.schedulingLinkSent) {
      actions.push({
        label: "Send available time options",
        rank: 94,
        group: "showing_times",
        capability: "book",
        source: "realtor_showing_eligibility",
      });
    }
  }

  if (
    domainDecision.showRealEstateCopilotRecommendations &&
    (ctx.hasFinancingDiscussion || ctx.mentionedDeposit)
  ) {
    actions.push({
      label: "Ask if financing is already arranged",
      rank: 88,
      group: "financing",
      capability: "qualify",
      source: "realtor_financing",
    });
  } else if (
    domainDecision.showRealEstateCopilotRecommendations &&
    ctx.hasStrongPurchaseIntent &&
    !ctx.hasShowingIntent &&
    routingDecision !== "ASSIGN_AGENT" &&
    !needsClarify
  ) {
    actions.push({
      label: "Contact customer",
      rank: 82,
      group: "contact",
      capability: "follow_up",
      source: "realtor_purchase_intent",
    });
    if (allowBookingActions) {
      actions.push({
        label: "Schedule appointment",
        rank: 78,
        group: "showing",
        capability: "book",
        source: "realtor_purchase_intent",
      });
    }
  } else if (ctx.leadLabel === "Hot" || ctx.bucket === "hot") {
    if (!actions.some((a) => a.group === "contact")) {
      actions.push({
        label: "Contact customer",
        rank: 80,
        group: "contact",
        capability: "follow_up",
        source: "hot_bucket",
      });
    }
  } else if (ctx.leadLabel === "Cold" || ctx.bucket === "cold") {
    if (!actions.some((a) => (a.rank ?? 0) >= 80)) {
      if ((ctx.enrollableCampaignCount ?? 0) > 0) {
        actions.push({
          label: "Enroll in nurture campaign",
          rank: 42,
          group: "campaign",
          capability: "nurture",
          source: "cold_bucket",
        });
      } else {
        actions.push({
          label: "Send nurture follow-up",
          rank: 40,
          group: "followup",
          capability: "follow_up",
          source: "cold_bucket",
        });
      }
    }
  } else if (ctx.bucket === "unqualified" && actions.length === 0) {
    actions.push(...collectLowEvidenceDiscoveryActionsWithMeta());
  }

  const hasHighValueAction = actions.some((a) => a.rank >= 75);
  const shouldSuggestFollowUp =
    (ctx.lastOutbound && !ctx.hasFollowUp) ||
    (ctx.hasDelayLater && !ctx.aiPaused && hasHighValueAction);

  if (shouldSuggestFollowUp && !actions.some((a) => a.group === "followup")) {
    actions.push({
      label: "Follow up if no response",
      rank: 48,
      group: "followup",
      capability: "follow_up",
      source: "followup_heuristic",
    });
  }

  const lowConfidence = (ctx.confidence ?? 1) < 0.45;
  if (actions.length === 0 && lowConfidence) {
    return {
      ...base,
      earlySource: "low_confidence_guard",
      blockedActions: [
        ...blockedActions,
        { capability: "book", reason: "insufficient_intent_evidence" },
      ],
      actions: collectLowEvidenceDiscoveryActionsWithMeta(),
    };
  }

  return { ...base, blockedActions, actions };
}

function dedupeActionCandidates(candidates: ActionCandidate[]): ActionCandidate[] {
  const byGroup = new Map<string, ActionCandidate>();
  for (const c of candidates) {
    const prev = byGroup.get(c.group);
    if (!prev || c.rank > prev.rank) byGroup.set(c.group, c);
  }
  return Array.from(byGroup.values())
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3);
}

export type NextBestActionBehavior = "book" | "follow" | "assign" | "snooze" | "composer" | "campaign" | "info";

export type ContextualNextAction = {
  label: string;
  behavior: NextBestActionBehavior;
  /** Structured diagnostics — not shown as chain-of-thought in UI. */
  provenance?: CopilotActionProvenance;
};

export type CopilotRecommendationBuildResult = {
  actions: ContextualNextAction[];
  blockedActions: CopilotBlockedAction[];
  workspaceIntelligenceUsed: boolean;
  snapshotVersion?: string;
};

/** Map internal action group → UI surface (intent-based, not label text). */
export function behaviorForActionGroup(group: string): NextBestActionBehavior {
  switch (group) {
    case "system_info":
      return "info";
    case "showing":
    case "seller_consult":
      return "book";
    case "followup":
    case "seller_followup":
      return "follow";
    case "campaign":
      return "campaign";
    case "assign":
      return "assign";
    case "showing_times":
    case "financing":
    case "contact":
    case "seller_cma":
    case "seller_address":
    case "seller_assign":
    case "buyer_inventory":
    case "discover":
    case "discover_needs":
    case "qualify":
    case "wi_explain_listing":
    case "wi_qualify_listing":
    case "wi_knowledge":
    case "wi_qualify_trip":
      return "composer";
    default:
      return "composer";
  }
}

function capabilityForGroup(group: string, explicit?: string): string {
  if (explicit) return explicit;
  switch (group) {
    case "discover":
      return "discover_intent";
    case "discover_needs":
      return "discover_needs";
    case "qualify":
      return "qualify";
    case "seller_consult":
      return "ge_seller_consult";
    case "buyer_inventory":
      return "ge_share_listings";
    case "showing":
    case "showing_times":
      return "book";
    case "campaign":
      return "nurture";
    case "assign":
    case "seller_assign":
      return "assign";
    case "system_info":
      return "none";
    default:
      return group;
  }
}

function toProvenancedActions(
  ctx: ContextualActionContext,
  collected: CollectedActions,
): CopilotRecommendationBuildResult {
  const ranked = dedupeActionCandidates(collected.actions).slice(0, 3);
  const intelligenceEvidence = collected.relevance.evidence.filter((e) =>
    /offering_match|supported_intent|business_model|knowledge|brain_model|qualification|snapshot|ai_brain/.test(
      e,
    ),
  );
  const actions = ranked.map((c) => {
    const capability = capabilityForGroup(c.group, c.capability);
    const source = c.source || collected.earlySource || "deterministic_ranker";
    const provenance: CopilotActionProvenance = {
      capability,
      label: c.label,
      source,
      intent: collected.dominantIntent,
      confidence: ctx.confidence,
      workspaceIntelligenceUsed: collected.relevance.workspaceIntelligenceUsed,
      evidence: c.evidence || collected.relevance.evidence.slice(0, 12),
      intelligenceEvidence,
      blockedActions: collected.blockedActions.slice(0, 8),
      snapshotVersion: collected.relevance.snapshotVersion,
      eligibility: {
        showRealEstateCopilotRecommendations: collected.showRealEstateCopilotRecommendations,
        rgeInstalled:
          ctx.rgeInstalled === true ||
          ctx.workspaceIntelligence?.growthEngines?.rgeInstalled === true,
        industry: ctx.workspaceIntelligence?.industry ?? ctx.industry ?? null,
        snapshotPrimarySource: ctx.workspaceIntelligence?.primarySource ?? null,
      },
    };
    return {
      label: c.label,
      behavior: behaviorForActionGroup(c.group) as ContextualNextAction["behavior"],
      provenance,
    };
  });

  return {
    actions,
    blockedActions: collected.blockedActions,
    workspaceIntelligenceUsed: collected.relevance.workspaceIntelligenceUsed,
    snapshotVersion: collected.relevance.snapshotVersion,
  };
}

/** Full build with provenance + blocked action codes (Phase 2). */
export function buildContextualNextActionsDetailed(
  ctx: ContextualActionContext,
): CopilotRecommendationBuildResult {
  if (ctx.handoffActive) {
    return {
      actions: [
        {
          label: "Assign agent",
          behavior: "assign",
          provenance: {
            capability: "assign",
            label: "Assign agent",
            source: "handoff_active",
            workspaceIntelligenceUsed: Boolean(ctx.workspaceIntelligence?.configured),
            evidence: ["handoff_active"],
          },
        },
        {
          label: "Reply personally",
          behavior: "composer",
          provenance: {
            capability: "follow_up",
            label: "Reply personally",
            source: "handoff_active",
            workspaceIntelligenceUsed: Boolean(ctx.workspaceIntelligence?.configured),
            evidence: ["handoff_active"],
          },
        },
      ],
      blockedActions: [{ capability: "book", reason: "handoff_active" }],
      workspaceIntelligenceUsed: Boolean(ctx.workspaceIntelligence?.configured),
      snapshotVersion: ctx.workspaceIntelligence?.version,
    };
  }

  const domainDecision = resolveAiDomainEligibility(domainEligibilityFromActionContext(ctx));
  if (domainDecision.copilotNoActionNeeded || domainDecision.suppressLeadWorkflowActions) {
    return {
      actions: [
        {
          label: "No action needed",
          behavior: "info",
          provenance: {
            capability: "none",
            label: "No action needed",
            source: "system_notification_guard",
            workspaceIntelligenceUsed: Boolean(ctx.workspaceIntelligence?.configured),
            evidence: ["system_or_notification"],
            blockedActions: [{ capability: "book", reason: "system_notification" }],
          },
        },
      ],
      blockedActions: [{ capability: "book", reason: "system_notification" }],
      workspaceIntelligenceUsed: Boolean(ctx.workspaceIntelligence?.configured),
      snapshotVersion: ctx.workspaceIntelligence?.version,
    };
  }

  return toProvenancedActions(ctx, collectContextualActionCandidates(ctx));
}

export function buildContextualNextActions(ctx: ContextualActionContext): ContextualNextAction[] {
  return buildContextualNextActionsDetailed(ctx).actions;
}

export function buildContextualNextActionLabels(ctx: ContextualActionContext): string[] {
  return buildContextualNextActions(ctx).map((a) => a.label);
}

export { FINANCING_GUIDANCE_SUGGESTION };

/** Label-only fallback when behavior is not embedded (e.g. legacy labels). */
export function getNextBestActionBehavior(label: string): NextBestActionBehavior {
  const l = label.toLowerCase();

  if (/\bno action needed\b/.test(l)) {
    return "info";
  }

  if (/\b(snooze|pause autopilot|pause ai)\b/.test(l)) {
    return "snooze";
  }

  if (/\b(clarify chat vs schedule|clarify human vs schedule)\b/.test(l)) {
    return "composer";
  }

  if (/\bassign agent\b/.test(l)) {
    return "assign";
  }

  if (
    /\b(follow up if|follow-up|set follow-up|set follow up|remind later|no response|nurture|send nurture)\b/.test(
      l,
    )
  ) {
    return "follow";
  }

  if (
    /\b(confirm .+ availability|confirm availability|showing availability|schedule appointment|schedule a showing|book appointment|book a (showing|meeting)|book meeting|viewing|showing)\b/.test(
      l,
    )
  ) {
    return "book";
  }

  return "composer";
}

export const SCHEDULING_COMPOSER_INTRO = "Here are a few times that work on my end:";

/** Copilot / manual "Send available time options" — needs server-resolved scheduling URL. */
export function isSchedulingComposerAction(label: string): boolean {
  const l = label.toLowerCase();
  return /time options|available time/.test(l);
}

/** Composer draft for scheduling actions once the public booking URL is resolved. */
export function buildSchedulingComposerDraft(schedulingUrl: string): string {
  const url = schedulingUrl.trim();
  if (!url) return SCHEDULING_COMPOSER_INTRO;
  return `${SCHEDULING_COMPOSER_INTRO}\n${url}`;
}

/** Draft text for composer-only actions (never used for tool actions). */
export function composerSuggestionForAction(label: string): string {
  const l = label.toLowerCase();
  if (isSchedulingComposerAction(label)) {
    return SCHEDULING_COMPOSER_INTRO;
  }
  if (/financing|lender/.test(l)) {
    return "Are you already working with a lender, or would you like me to connect you with one?";
  }
  if (/clarify chat vs schedule|clarify human vs schedule/.test(l)) {
    return "Happy to help — are you looking to chat with someone now about a specific question, or would you prefer to schedule a call?";
  }
  if (/reply personally/.test(l)) {
    return "Hi! I wanted to follow up on our conversation personally.";
  }
  if (/contact customer/.test(l)) {
    return "Hi! I wanted to follow up on our conversation.";
  }
  if (/understand intent|discover needs|ask clarifying question|qualify visitor/.test(l)) {
    return "Thanks for reaching out — what brings you here today?";
  }
  if (/explain listing options|qualify business listing/.test(l)) {
    return "Happy to help with listing options — tell me a bit about your business and what you'd like to promote.";
  }
  if (/answer from knowledge/.test(l)) {
    return "I can help with that — what are you looking for specifically?";
  }
  if (/qualify trip details/.test(l)) {
    return "Happy to help plan your trip — how many people are traveling, and which dates are you considering?";
  }
  return label;
}

const SHOWING_TIMING_RE =
  /\b(next week|this week|next month|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

export function extractShowingTimingPhrase(inboundText: string): string | null {
  const m = SHOWING_TIMING_RE.exec(inboundText);
  if (!m) return null;
  return m[1].toLowerCase();
}

export type CustomerSummaryContext = {
  memoryParagraph?: string;
  inboundText?: string;
  budget?: string | null;
  timeline?: string | null;
  financing?: string | null;
  intent?: string;
  viewingIntent?: boolean;
  /** When Buyer Preferences panel already shows structured criteria, omit duplicate summary lines. */
  suppressCriteriaBullets?: boolean;
};

function cleanSummaryBullet(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

function isCriteriaSummaryBullet(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /^budget\b/i.test(lower) ||
    /\btimeline\b/i.test(lower) ||
    /\bfinancing\b/i.test(lower) ||
    /\bpre-?approved\b/i.test(lower) ||
    /\$\d/.test(lower)
  );
}

function paragraphToBullets(paragraph: string, suppressCriteria = false): string[] {
  const chunks = paragraph
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => cleanSummaryBullet(s))
    .filter((s) => s.length > 8);
  const out: string[] = [];
  for (const chunk of chunks) {
    if (!chunk) continue;
    const lower = chunk.toLowerCase();
    if (suppressCriteria && isCriteriaSummaryBullet(chunk)) continue;
    if (/budget around/i.test(lower)) out.push(chunk.replace(/^budget around/i, "Budget around"));
    else if (/timeline:/i.test(lower)) out.push(chunk.replace(/^timeline:\s*/i, "Timeline: "));
    else if (/financing:/i.test(lower)) out.push(chunk.replace(/^financing:\s*/i, "Financing: "));
    else out.push(chunk.charAt(0).toUpperCase() + chunk.slice(1));
    if (out.length >= 2) break;
  }
  return out;
}

/** Compact Customer Summary bullets for sidebar (2+ facts → bullets). */
export function buildCustomerSummaryBullets(ctx: CustomerSummaryContext): string[] {
  const inbound = (ctx.inboundText ?? "").toLowerCase();
  const bullets: string[] = [];
  const seen = new Set<string>();

  const add = (text: string) => {
    const b = cleanSummaryBullet(text);
    if (!b || seen.has(b.toLowerCase())) return;
    seen.add(b.toLowerCase());
    bullets.push(b);
  };

  const showingTiming = extractShowingTimingPhrase(inbound);
  const wantsShowing =
    ctx.viewingIntent ||
    ctx.intent === "Booking" ||
    /\b(showing|tour|viewing|see the (house|property|place)|schedule|appointment|availability)\b/i.test(
      inbound,
    );

  if (wantsShowing) {
    add(showingTiming ? `Wants a showing ${showingTiming}` : "Wants to schedule a showing");
  }

  if (/\b(ready to move|move forward|ready to proceed)\b/i.test(inbound)) {
    add("Ready to move forward");
  }

  if (/\b(deposit|earnest money|down payment)\b/i.test(inbound)) {
    add("Mentioned deposit");
  }

  if (!ctx.suppressCriteriaBullets) {
    if (ctx.budget) add(`Budget around ${ctx.budget}`);
    if (ctx.timeline) add(`Timeline: ${ctx.timeline}`);
    if (ctx.financing) add(`Financing: ${ctx.financing}`);
  }

  if (bullets.length >= 2) return bullets.slice(0, 2);

  const fromMemory = ctx.memoryParagraph
    ? paragraphToBullets(ctx.memoryParagraph, !!ctx.suppressCriteriaBullets)
    : [];
  if (fromMemory.length >= 2) return fromMemory.slice(0, 2);
  if (bullets.length === 1 && fromMemory.length === 1) return [bullets[0], fromMemory[0]];
  if (bullets.length === 1) return bullets;
  if (fromMemory.length >= 1) return fromMemory.slice(0, 2);

  const fallback = cleanSummaryBullet(ctx.memoryParagraph ?? "");
  if (fallback && ctx.suppressCriteriaBullets && isCriteriaSummaryBullet(fallback)) return bullets;
  return fallback ? [fallback] : bullets;
}
