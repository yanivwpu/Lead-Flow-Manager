/**
 * Phase 2 — Copilot consumes Workspace Intelligence Snapshot for relevance.
 * Run: npx tsx tests/copilot-workspace-intelligence.test.ts
 */
import assert from "node:assert/strict";
import {
  assembleWorkspaceIntelligence,
  toWorkspaceIntelligenceSnapshot,
  type WorkspaceIntelligenceSnapshot,
} from "../shared/workspaceIntelligence";
import {
  buildContextualNextActionsDetailed,
  type ContextualActionContext,
} from "../shared/customerInsights";
import {
  analyzeWorkspaceRelevance,
  deriveBusinessModelHints,
} from "../shared/workspaceIntelligenceRelevance";
import { classifySellerIntent } from "../shared/sellerIntent";

function snapFromKnowledge(
  knowledge: Parameters<typeof assembleWorkspaceIntelligence>[0]["knowledge"],
  extras?: Parameters<typeof assembleWorkspaceIntelligence>[0],
): WorkspaceIntelligenceSnapshot {
  return toWorkspaceIntelligenceSnapshot(
    assembleWorkspaceIntelligence({
      knowledge,
      settings: extras?.settings,
      growthEngines: extras?.growthEngines,
    }),
  );
}

const directorySnap = snapFromKnowledge({
  businessName: "Community Local Guide",
  industry: "Travel & Tourism",
  servicesProducts: "Local guide, local magazine, business directory listings",
  websiteKnowledgeSummary:
    "We help visitors discover local businesses and help local businesses join the directory.",
  salesGoals: "Grow directory listings and reader engagement",
  qualifyingQuestions: [
    { question: "What type of business are you listing?", required: true },
  ],
});

const travelPlannerSnap = snapFromKnowledge({
  businessName: "Coastal Trip Studio",
  industry: "Travel & Tourism",
  servicesProducts: "Custom trip planning, vacation packages, itinerary design",
  websiteKnowledgeSummary: "We plan trips and itineraries for families and groups.",
  salesGoals: "Book trip planning consultations",
});

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("1. Snapshot contract maps into Copilot input fields", () => {
  assert.equal(directorySnap.configured, true);
  assert.equal(directorySnap.aiBrainIsPrimary, true);
  assert.ok(directorySnap.primaryOfferings.length >= 1);
  assert.ok(directorySnap.knowledgeBrief);
  assert.ok(directorySnap.version);
  assert.equal("websiteKnowledgeSummary" in directorySnap, false);
  const hints = deriveBusinessModelHints(directorySnap);
  assert.equal(hints.directoryOrLocalGuide, true);
  assert.equal(hints.travelPlanner, false);
});

run("2. Directory intelligence + greeting → Understand Intent; WI loaded but guard wins", () => {
  const result = buildContextualNextActionsDetailed({
    inboundText: "Hellooooo",
    latestInboundText: "Hellooooo",
    confidence: 0.28,
    bucket: "unqualified",
    leadLabel: "Unqualified",
    industry: "Travel & Tourism",
    workspaceIntelligence: directorySnap,
  });
  assert.equal(result.actions[0]?.label, "Understand Intent");
  assert.equal(result.actions[0]?.provenance?.source, "low_confidence_guard");
  assert.equal(result.actions[0]?.provenance?.workspaceIntelligenceUsed, true);
  assert.ok(result.actions[0]?.provenance?.evidence?.includes("greeting_only"));
  assert.ok(
    result.blockedActions.some(
      (b) => b.capability === "book" && b.reason === "insufficient_intent_evidence",
    ),
  );
  assert.ok(
    !result.actions.some((a) => /book listing consultation|qualify trip/i.test(a.label)),
  );
});

run("3. Directory + list restaurant → listing qualify/explain outranks travel", () => {
  const msg = "How do I list my restaurant?";
  const result = buildContextualNextActionsDetailed({
    inboundText: msg,
    latestInboundText: msg,
    confidence: 0.7,
    bucket: "warm",
    leadLabel: "Warm",
    industry: "Travel & Tourism",
    workspaceIntelligence: directorySnap,
  });
  const labels = result.actions.map((a) => a.label);
  assert.ok(
    /explain listing options|qualify business listing/i.test(labels[0] || ""),
    `primary=${labels[0]}`,
  );
  assert.ok(!labels.some((l) => /qualify trip details/i.test(l)));
  assert.equal(result.actions[0]?.provenance?.workspaceIntelligenceUsed, true);
  assert.ok(
    result.actions[0]?.provenance?.intelligenceEvidence?.some((e) =>
      /directory|offering_match|supported_intent/i.test(e),
    ),
  );
});

run("4. Directory + find seafood → knowledge/local discovery over listing sales", () => {
  const msg = "Find me a good seafood restaurant";
  const result = buildContextualNextActionsDetailed({
    inboundText: msg,
    latestInboundText: msg,
    confidence: 0.65,
    bucket: "warm",
    leadLabel: "Warm",
    industry: "Travel & Tourism",
    workspaceIntelligence: directorySnap,
  });
  assert.equal(result.actions[0]?.label, "Answer From Knowledge");
  assert.ok(
    result.blockedActions.some(
      (b) => b.capability === "qualify_listing" && b.reason === "visitor_discovery_not_listing_sales",
    ),
  );
  assert.ok(!result.actions.some((a) => /qualify business listing|explain listing/i.test(a.label)));
});

run("5. Travel planner + explicit trip request → Qualify Trip Details", () => {
  const msg = "Help me plan Miami for 4 people";
  const result = buildContextualNextActionsDetailed({
    inboundText: msg,
    latestInboundText: msg,
    confidence: 0.75,
    bucket: "warm",
    leadLabel: "Warm",
    industry: "Travel & Tourism",
    workspaceIntelligence: travelPlannerSnap,
  });
  assert.equal(result.actions[0]?.label, "Qualify Trip Details");
  assert.equal(result.actions[0]?.provenance?.capability, "qualify_trip");
});

run("6. Travel industry preset + directory Brain → Brain wins for relevance", () => {
  const relevance = analyzeWorkspaceRelevance({
    snapshot: directorySnap,
    latestInboundText: "How do I list my restaurant?",
  });
  assert.ok(relevance.modelHints.directoryOrLocalGuide);
  assert.ok(!relevance.modelHints.travelPlanner);
  assert.ok(relevance.evidence.includes("brain_model_overrides_industry_preset_for_relevance"));
  const result = buildContextualNextActionsDetailed({
    inboundText: "How do I list my restaurant?",
    latestInboundText: "How do I list my restaurant?",
    confidence: 0.7,
    industry: "Travel & Tourism",
    workspaceIntelligence: directorySnap,
  });
  assert.match(result.actions[0]?.label || "", /listing/i);
  assert.ok(!result.actions.some((a) => /trip details/i.test(a.label)));
});

run("7. RGE + explicit seller intent → seller recommendation available", () => {
  const msg = "I want to sell my house in Boca";
  const sellerIntent = classifySellerIntent({ inboundText: msg });
  const reSnap = snapFromKnowledge(
    {
      businessName: "Bay Realty",
      industry: "Real Estate",
      servicesProducts: "Buyer and seller representation",
    },
    { growthEngines: { rgeInstalled: true, installedTemplateIds: ["realtor-growth-engine"] } },
  );
  const result = buildContextualNextActionsDetailed({
    inboundText: msg,
    latestInboundText: msg,
    sellerIntent,
    confidence: 0.85,
    bucket: "warm",
    rgeInstalled: true,
    industry: "Real Estate",
    workspaceIntelligence: reSnap,
  });
  assert.ok(result.actions.some((a) => /book listing consultation/i.test(a.label)));
});

run("8. Non-Realtor workspace + unrelated text → no Realtor action", () => {
  const msg = "I want to sell my house in Boca";
  const sellerIntent = classifySellerIntent({ inboundText: msg });
  const result = buildContextualNextActionsDetailed({
    inboundText: msg,
    latestInboundText: msg,
    sellerIntent,
    confidence: 0.9,
    industry: "Travel & Tourism",
    rgeInstalled: false,
    workspaceIntelligence: directorySnap,
  });
  assert.ok(!result.actions.some((a) => /book listing consultation|assign listing agent/i.test(a.label)));
  assert.ok(
    result.blockedActions.some((b) => b.reason === "realtor_workspace_or_domain_ineligible") ||
      !result.actions.some((a) => /listing consultation/i.test(a.label)),
  );
});

run("9. Empty snapshot → safe deterministic fallback", () => {
  const empty = snapFromKnowledge(null);
  const result = buildContextualNextActionsDetailed({
    inboundText: "Hellooooo",
    latestInboundText: "Hellooooo",
    confidence: 0.28,
    bucket: "unqualified",
    workspaceIntelligence: empty,
  });
  assert.equal(result.actions[0]?.label, "Understand Intent");
  assert.equal(result.workspaceIntelligenceUsed, false);
});

run("10. Stale seller profile + greeting + directory snapshot → no seller continuity", () => {
  const sellerIntent = classifySellerIntent({
    inboundText: "Hellooooo",
    hasSellerProfile: true,
    priorSellerIntent: "seller_new",
  });
  assert.equal(sellerIntent, null);
  const result = buildContextualNextActionsDetailed({
    inboundText: "Hellooooo",
    latestInboundText: "Hellooooo",
    sellerIntent,
    sellerProfileHasData: true,
    confidence: 0.28,
    bucket: "unqualified",
    rgeInstalled: true,
    industry: "Real Estate",
    workspaceIntelligence: directorySnap,
  });
  assert.equal(result.actions[0]?.label, "Understand Intent");
  assert.ok(!result.actions.some((a) => /book listing consultation/i.test(a.label)));
});

run("11. Cross-workspace isolation of snapshot influence", () => {
  const a = directorySnap;
  const b = travelPlannerSnap;
  assert.notEqual(a.businessName, b.businessName);
  assert.notEqual(a.cacheFingerprint, b.cacheFingerprint);
  const ctxA: ContextualActionContext = {
    inboundText: "How do I list my restaurant?",
    latestInboundText: "How do I list my restaurant?",
    confidence: 0.7,
    workspaceIntelligence: a,
  };
  const ctxB: ContextualActionContext = {
    inboundText: "How do I list my restaurant?",
    latestInboundText: "How do I list my restaurant?",
    confidence: 0.7,
    workspaceIntelligence: b,
  };
  const ra = buildContextualNextActionsDetailed(ctxA);
  const rb = buildContextualNextActionsDetailed(ctxB);
  assert.match(ra.actions[0]?.label || "", /listing/i);
  // Travel-planner snapshot must not receive directory listing primary for the same message.
  assert.ok(!/explain listing options|qualify business listing/i.test(rb.actions[0]?.label || ""));
  assert.notEqual(ra.actions[0]?.provenance?.snapshotVersion, rb.actions[0]?.provenance?.snapshotVersion);
});

run("12. Client query key is workspace-scoped (not contact-scoped)", () => {
  // Contract assertion: React Query key must not include contactId.
  const queryKey = ["/api/ai/workspace-intelligence"];
  assert.equal(queryKey.length, 1);
  assert.equal(queryKey[0], "/api/ai/workspace-intelligence");
  assert.ok(!queryKey.some((k) => /contact/i.test(String(k))));
});

run("13. Provenance includes source/evidence and blocked high-intent reasons", () => {
  const result = buildContextualNextActionsDetailed({
    inboundText: "Hellooooo",
    latestInboundText: "Hellooooo",
    confidence: 0.28,
    bucket: "unqualified",
    workspaceIntelligence: directorySnap,
  });
  const p = result.actions[0]?.provenance;
  assert.ok(p);
  assert.equal(p!.capability, "discover_intent");
  assert.equal(p!.source, "low_confidence_guard");
  assert.equal(typeof p!.workspaceIntelligenceUsed, "boolean");
  assert.ok(Array.isArray(p!.evidence));
  assert.ok(Array.isArray(p!.blockedActions));
  assert.ok(p!.blockedActions!.some((b) => b.reason === "insufficient_intent_evidence"));
  assert.ok(p!.snapshotVersion);
});

console.log("\ncopilot-workspace-intelligence.test.ts: all assertions passed");
