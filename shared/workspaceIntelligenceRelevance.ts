/**
 * Deterministic Workspace Intelligence relevance signals for Copilot ranking.
 * No LLM. Matches conversation evidence against snapshot offerings / knowledge brief.
 * Does not hardcode any single workspace name.
 */

import type { WorkspaceIntelligenceSnapshot } from "./workspaceIntelligence";

export type WorkspaceBusinessModelHints = {
  directoryOrLocalGuide: boolean;
  travelPlanner: boolean;
  serviceBooking: boolean;
  knowledgeHeavy: boolean;
};

export type ConversationBusinessIntentHints = {
  joinOrListBusiness: boolean;
  visitorLocalDiscovery: boolean;
  tripPlanning: boolean;
  genericInfoSeeking: boolean;
};

export type WorkspaceRelevanceMatch = {
  workspaceIntelligenceUsed: boolean;
  snapshotConfigured: boolean;
  snapshotVersion?: string;
  modelHints: WorkspaceBusinessModelHints;
  conversationHints: ConversationBusinessIntentHints;
  supportedIntentHints: string[];
  evidence: string[];
  /** Industry from snapshot when present (relevance); eligibility still uses separate RE gates. */
  relevanceIndustry?: string;
};

function blobFromSnapshot(snapshot: WorkspaceIntelligenceSnapshot | null | undefined): string {
  if (!snapshot) return "";
  return [
    snapshot.businessName,
    snapshot.executiveSummary,
    snapshot.knowledgeBrief,
    snapshot.servicesProducts,
    snapshot.salesGoals,
    snapshot.customInstructions,
    ...(snapshot.primaryOfferings || []),
    ...(snapshot.qualifyingQuestions || []).map((q) => q.question),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

/** Structural business-model hints from Workspace Intelligence (not industry alone). */
export function deriveBusinessModelHints(
  snapshot: WorkspaceIntelligenceSnapshot | null | undefined,
): WorkspaceBusinessModelHints {
  const blob = blobFromSnapshot(snapshot);
  const industry = String(snapshot?.industry || "").toLowerCase();

  const directoryOrLocalGuide =
    /\b(director(?:y|ies)|business\s+director(?:y|ies)|local\s+guide|community\s+guide|local\s+magazine|list(?:ing)?\s+(?:your|a|my)\s+business|advertise\s+(?:your|with)|join\s+(?:the\s+)?directory|business\s+listings?)\b/.test(
      blob,
    ) ||
    (snapshot?.primaryOfferings || []).some((o) =>
      /\b(directory|listing|guide|advertise)\b/i.test(o),
    );

  const travelPlanner =
    /\b(trip\s+plan|travel\s+plan|itinerar|vacation\s+package|tour\s+package|plan\s+(?:your\s+)?(?:trip|travel|vacation)|group\s+travel|destination\s+management)\b/.test(
      blob,
    ) ||
    (!directoryOrLocalGuide &&
      /\b(travel|tourism|hospitality)\b/.test(industry) &&
      /\b(plan|itinerar|tour|package|booking)\b/.test(blob));

  const serviceBooking =
    /\b(book\s+(?:a\s+)?(?:consult|appointment|session)|schedule\s+(?:a\s+)?(?:consult|appointment)|reservations?)\b/.test(
      blob,
    );

  const knowledgeHeavy =
    Boolean(snapshot?.capabilities?.hasWebsiteKnowledge || snapshot?.capabilities?.hasFaqs) ||
    Boolean(snapshot?.knowledgeBrief);

  return {
    directoryOrLocalGuide,
    travelPlanner,
    serviceBooking,
    knowledgeHeavy,
  };
}

export function deriveSupportedIntentHints(
  model: WorkspaceBusinessModelHints,
): string[] {
  const intents: string[] = [];
  if (model.directoryOrLocalGuide) {
    intents.push("directory_listing", "local_discovery");
  }
  if (model.travelPlanner) {
    intents.push("trip_planning");
  }
  if (model.serviceBooking) {
    intents.push("service_booking");
  }
  if (model.knowledgeHeavy) {
    intents.push("answer_from_knowledge");
  }
  return intents;
}

/** Conversation-side intent hints (current message / inbound). */
export function deriveConversationBusinessIntentHints(
  text: string | null | undefined,
): ConversationBusinessIntentHints {
  const t = String(text || "").toLowerCase();
  const joinOrListBusiness =
    /\b(?:how\s+(?:do|can)\s+i\s+list|list\s+my\s+(?:business|restaurant|shop|store|company|venue)|join\s+(?:the\s+)?directory|advertise\s+(?:my|our)|get\s+(?:my|our)\s+business\s+listed|submit\s+(?:a\s+)?listing|add\s+my\s+(?:business|restaurant))\b/.test(
      t,
    );

  const visitorLocalDiscovery =
    !joinOrListBusiness &&
    /\b(?:find\s+(?:me\s+)?(?:a|an|good|the)|recommend\s+(?:a|an|me)|looking\s+for\s+(?:a|an|good)|where\s+(?:can|do)\s+i\s+(?:find|eat|go)|best\s+\w+\s+(?:in|near)|seafood|restaurant|cafe|coffee|things\s+to\s+do|what\s+to\s+do)\b/.test(
      t,
    );

  const tripPlanning =
    /\b(?:plan\s+(?:a\s+|my\s+|our\s+)?(?:trip|travel|vacation|itinerary)|itinerary|for\s+\d+\s+people|group\s+of\s+\d+|travel\s+to|vacation\s+in|things\s+to\s+do\s+in\s+\w+)\b/.test(
      t,
    );

  const genericInfoSeeking =
    !joinOrListBusiness &&
    !visitorLocalDiscovery &&
    !tripPlanning &&
    /\b(?:how\s+(?:do|does|can)|what\s+(?:is|are)|tell\s+me|info(?:rmation)?\s+about|do\s+you\s+(?:offer|have))\b|\?/.test(
      t,
    );

  return {
    joinOrListBusiness,
    visitorLocalDiscovery,
    tripPlanning,
    genericInfoSeeking,
  };
}

export function analyzeWorkspaceRelevance(params: {
  snapshot?: WorkspaceIntelligenceSnapshot | null;
  conversationText?: string | null;
  latestInboundText?: string | null;
}): WorkspaceRelevanceMatch {
  const snapshot = params.snapshot ?? null;
  const text = params.latestInboundText || params.conversationText || "";
  const modelHints = deriveBusinessModelHints(snapshot);
  const conversationHints = deriveConversationBusinessIntentHints(text);
  const supportedIntentHints = deriveSupportedIntentHints(modelHints);
  const evidence: string[] = [];
  const configured = Boolean(snapshot?.configured || snapshot?.hasAiBrain);

  if (!snapshot) {
    evidence.push("snapshot_absent");
  } else if (!configured) {
    evidence.push("snapshot_empty");
  } else {
    evidence.push("snapshot_loaded");
    if (snapshot.aiBrainIsPrimary) evidence.push("ai_brain_primary");
    if (modelHints.directoryOrLocalGuide) evidence.push("business_model_directory_or_guide");
    if (modelHints.travelPlanner) evidence.push("business_model_travel_planner");
    if (modelHints.knowledgeHeavy) evidence.push("knowledge_available");
  }

  if (conversationHints.joinOrListBusiness) evidence.push("conversation_join_or_list_business");
  if (conversationHints.visitorLocalDiscovery) evidence.push("conversation_visitor_local_discovery");
  if (conversationHints.tripPlanning) evidence.push("conversation_trip_planning");

  if (
    modelHints.directoryOrLocalGuide &&
    conversationHints.joinOrListBusiness
  ) {
    evidence.push("offering_match_directory_listing");
    evidence.push("supported_intent_match");
  }
  if (
    modelHints.directoryOrLocalGuide &&
    conversationHints.visitorLocalDiscovery
  ) {
    evidence.push("business_model_match_local_discovery");
    evidence.push("supported_intent_match");
  }
  if (modelHints.travelPlanner && conversationHints.tripPlanning) {
    evidence.push("offering_match_trip_planning");
    evidence.push("supported_intent_match");
  }
  if (
    modelHints.knowledgeHeavy &&
    (conversationHints.visitorLocalDiscovery || conversationHints.genericInfoSeeking)
  ) {
    evidence.push("qualification_goal_or_knowledge_match");
  }

  // Industry preset must not invent travel-planner intent when Brain says directory.
  if (
    /\b(travel|tourism)\b/i.test(String(snapshot?.industry || "")) &&
    modelHints.directoryOrLocalGuide &&
    !modelHints.travelPlanner
  ) {
    evidence.push("brain_model_overrides_industry_preset_for_relevance");
  }

  return {
    workspaceIntelligenceUsed: configured,
    snapshotConfigured: configured,
    snapshotVersion: snapshot?.version || snapshot?.cacheFingerprint,
    modelHints,
    conversationHints,
    supportedIntentHints,
    evidence,
    relevanceIndustry: snapshot?.industry,
  };
}
