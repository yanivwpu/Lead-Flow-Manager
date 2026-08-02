/**
 * Human handoff must require explicit current-turn evidence — not pricing / "how do I".
 * Run: npx tsx tests/ai-routing-handoff-false-positive.test.ts
 */
import assert from "node:assert/strict";
import {
  detectsExplicitHumanHandoffRequest,
  resolveAiRouting,
  routingShouldTriggerHandoff,
} from "../shared/aiRouting";
import { buildContextualNextActionsDetailed } from "../shared/customerInsights";
import {
  assembleWorkspaceIntelligence,
  toWorkspaceIntelligenceSnapshot,
} from "../shared/workspaceIntelligence";
import { isConversationHandoffActive, AI_HANDOFF_RESOLVED_EVENT } from "../shared/handoffActivity";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const directorySnap = toWorkspaceIntelligenceSnapshot(
  assembleWorkspaceIntelligence({
    knowledge: {
      businessName: "Community Local Guide",
      industry: "Travel & Tourism",
      servicesProducts: "Local guide, business directory listings",
      websiteKnowledgeSummary:
        "Help visitors discover businesses and help local businesses join the directory.",
    },
  }),
);

run("1. How do I list my restaurant? → no human handoff", () => {
  const msg = "How do I list my restaurant?";
  assert.equal(detectsExplicitHumanHandoffRequest(msg), false);
  const r = resolveAiRouting({ inbound: msg });
  assert.equal(r.humanHandoffRequested, false);
  assert.notEqual(r.decision, "ASSIGN_AGENT");
  assert.equal(routingShouldTriggerHandoff(r), false);
  assert.ok(r.subIntents.includes("listing_join_question"));
  assert.equal(r.turnIntent, "info_seeking");
});

run("2. How much / benefits → no handoff; pricing + listing sub-intents", () => {
  const msg =
    "How do I list my restaurant? How much is it per month and what's the benefit?";
  const r = resolveAiRouting({ inbound: msg });
  assert.equal(r.reason, "info_seeking_qualify");
  assert.equal(r.decision, "CONTINUE_AI");
  assert.equal(r.humanHandoffRequested, false);
  assert.equal(routingShouldTriggerHandoff(r), false);
  assert.ok(r.subIntents.includes("pricing_question"));
  assert.ok(r.subIntents.includes("benefits_question"));
  assert.ok(r.subIntents.includes("listing_join_question"));
  assert.equal(r.turnIntent, "info_seeking");
});

run("3. Can you help me list my business? → no human handoff", () => {
  const r = resolveAiRouting({ inbound: "Can you help me list my business?" });
  assert.equal(r.humanHandoffRequested, false);
  assert.equal(routingShouldTriggerHandoff(r), false);
  assert.notEqual(r.reason, "explicit_human_chat_signals");
});

run("4. Can I speak to a person? → human handoff", () => {
  const r = resolveAiRouting({ inbound: "Can I speak to a person?" });
  assert.equal(r.humanHandoffRequested, true);
  assert.equal(r.decision, "ASSIGN_AGENT");
  assert.equal(r.reason, "explicit_human_chat_signals");
  assert.equal(routingShouldTriggerHandoff(r), true);
  assert.equal(r.turnIntent, "human_handoff");
});

run("5. I want an agent → human handoff", () => {
  const r = resolveAiRouting({ inbound: "I want an agent." });
  assert.equal(r.humanHandoffRequested, true);
  assert.equal(routingShouldTriggerHandoff(r), true);
});

run("6. Can someone call me? → human handoff", () => {
  const r = resolveAiRouting({ inbound: "Can someone call me?" });
  assert.equal(r.humanHandoffRequested, true);
  assert.equal(routingShouldTriggerHandoff(r), true);
});

run("7. Stale prior handoff phrase in joined history + new pricing question → no new handoff", () => {
  const r = resolveAiRouting({
    inbound: "How much is it per month?",
    joinedInbound: "I want a human\nHow much is it per month?",
    history: [
      { role: "user", content: "I want a human" },
      { role: "assistant", content: "I'll connect you with someone." },
      { role: "user", content: "How much is it per month?" },
    ],
  });
  assert.equal(r.humanHandoffRequested, false);
  assert.equal(r.decision, "CONTINUE_AI");
  assert.equal(r.turnIntent, "info_seeking");
  // Timeline: resolved handoff after normal message clears active state
  assert.equal(
    isConversationHandoffActive(
      [
        { eventType: AI_HANDOFF_RESOLVED_EVENT, conversationId: "c1" },
        { eventType: "ai_handoff", conversationId: "c1" },
      ],
      "c1",
    ),
    false,
  );
  // Manual unresolved handoff remains active until resolved
  assert.equal(
    isConversationHandoffActive(
      [{ eventType: "ai_handoff", conversationId: "c1" }],
      "c1",
    ),
    true,
  );
});

run("8. Directory WI + listing/pricing → AI path active; Copilot listing action", () => {
  const msg =
    "How do I list my restaurant? How much is it per month and what's the benefit?";
  const routing = resolveAiRouting({ inbound: msg, industry: "Travel & Tourism" });
  assert.equal(routingShouldTriggerHandoff(routing), false);
  const actions = buildContextualNextActionsDetailed({
    inboundText: msg,
    latestInboundText: msg,
    confidence: 0.7,
    bucket: "warm",
    aiRoutingDecision: routing.decision,
    industry: "Travel & Tourism",
    workspaceIntelligence: directorySnap,
  });
  assert.ok(
    /explain listing|qualify business listing|answer from knowledge/i.test(
      actions.actions[0]?.label || "",
    ),
    `primary=${actions.actions[0]?.label}`,
  );
  assert.ok(!actions.actions.some((a) => /assign agent/i.test(a.label)));
});

run("9. Summary/routing alignment — pricing+listing intent, not human_handoff", () => {
  const msg =
    "How do I list my restaurant? How much is it per month and what's the benefit?";
  const r = resolveAiRouting({ inbound: msg });
  // Shared turn intent must agree with product/pricing understanding — not handoff.
  assert.equal(r.turnIntent, "info_seeking");
  assert.equal(r.humanHandoffRequested, false);
  assert.ok(r.subIntents.includes("pricing_question"));
  assert.ok(r.subIntents.includes("listing_join_question"));
  // Conflict would be: turnIntent info_seeking but humanHandoffRequested true
  assert.ok(!(r.turnIntent === "info_seeking" && r.humanHandoffRequested));
});

console.log("\nai-routing-handoff-false-positive.test.ts: all assertions passed");
