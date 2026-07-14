/**
 * Copilot Summary directionality regressions.
 * Run: npx tsx tests/copilot-summary-direction.test.ts
 */
import assert from "node:assert/strict";
import {
  buildOutboundOnlyConversationSummary,
  extractNeutralOutreachTopic,
  isOutboundOnlyConversation,
  summaryFabricatesProspectIntent,
} from "../shared/conversationSummaryDirection";
import { buildAIMemorySummary } from "../client/src/lib/conversationIntelligence";
import { buildCustomerSummaryBullets } from "../shared/customerInsights";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COLD_OUTREACH = {
  direction: "outbound" as const,
  content:
    "Hi greg, I'm reaching out from WhaChatCRM. We built a platform that brings WhatsApp, Instagram, Messenger and other customer conversations into one inbox with AI-powered follow-up. I wanted to introduce myself and see if this is relevant to what you do.",
};

function testOutboundOnlyNoFabricatedIntent() {
  assert.equal(isOutboundOnlyConversation([COLD_OUTREACH]), true);
  const summary = buildAIMemorySummary(
    { intent: "Unknown", budget: null, timeline: null, financing: null } as any,
    [COLD_OUTREACH],
  );
  assert.match(summary, /Initial outreach sent/i);
  assert.match(summary, /Awaiting a response/i);
  assert.equal(summaryFabricatesProspectIntent(summary), false);
  assert.doesNotMatch(summary, /exploring options/i);
  assert.doesNotMatch(summary, /is interested/i);
  assert.doesNotMatch(summary, /looking for a platform/i);
}

function testOutboundProductFeaturesNotAttributedToProspect() {
  const topic = extractNeutralOutreachTopic(COLD_OUTREACH.content);
  assert.ok(topic && /WhachatCRM|unified messaging/i.test(topic));
  const summary = buildOutboundOnlyConversationSummary({ productHint: topic });
  // Speaks about what WE sent, not what prospect wants
  assert.match(summary, /^Initial outreach sent about/i);
  assert.doesNotMatch(summary, /\b(prospect|lead|customer|greg)\b.*\b(wants|needs|exploring|interested)\b/i);
}

function testInboundReplyMayReflectInterest() {
  const messages = [
    COLD_OUTREACH,
    {
      direction: "inbound" as const,
      content: "Thanks — yes I'm interested in consolidating WhatsApp and Instagram into one inbox.",
    },
  ];
  assert.equal(isOutboundOnlyConversation(messages), false);
  const summary = buildAIMemorySummary(
    { intent: "Unknown", budget: null, timeline: null, financing: null } as any,
    messages,
  );
  // Rule-based fallback may be empty without RE signals; ensure we don't force outbound-only wording
  assert.doesNotMatch(summary, /Awaiting a response/i);
}

function testMixedConversationKeepsOutboundOnlyGuardOff() {
  const messages = [
    { direction: "outbound" as const, content: "We offer a unified inbox with AI follow-up." },
    { direction: "inbound" as const, content: "Can you send pricing?" },
  ];
  assert.equal(isOutboundOnlyConversation(messages), false);
  const fabricated = summaryFabricatesProspectIntent(
    "Greg is exploring options for a platform that consolidates customer conversations",
  );
  assert.equal(fabricated, true);
  assert.equal(
    summaryFabricatesProspectIntent("Asked about pricing. Awaiting our reply with options."),
    false,
  );
}

function testSummaryUiNoLongerRendersWorkflowChipsUnderSummary() {
  const panel = readFileSync(
    resolve("client/src/components/InboxLeadDetailsPanel.tsx"),
    "utf8",
  );
  // Chip renderers under Summary must be gone
  assert.doesNotMatch(panel, /data-testid={`workflow-action-\$\{action\.type\}`}/);
  assert.doesNotMatch(panel, /data-testid="workflow-tag-suggestion"/);
  assert.doesNotMatch(panel, /data-testid="workflow-stage-suggestion"/);
  assert.match(panel, /copilot-summary-section/);
  assert.match(panel, /Workflow chips \(nurture \/ tag \/ stage\) intentionally not rendered under Summary/);
}

function testOutboundOnlyBulletsStayFactual() {
  const memory = buildOutboundOnlyConversationSummary({
    productHint: extractNeutralOutreachTopic(COLD_OUTREACH.content),
  });
  const bullets = buildCustomerSummaryBullets({
    memoryParagraph: memory,
    inboundText: "",
    suppressCriteriaBullets: true,
  });
  assert.ok(bullets.length >= 1);
  for (const b of bullets) {
    assert.equal(summaryFabricatesProspectIntent(b), false);
  }
}

const tests: Array<[string, () => void]> = [
  ["1 outbound-only cold outreach → no fabricated prospect intent", testOutboundOnlyNoFabricatedIntent],
  ["2 outbound product features → not attributed as prospect needs", testOutboundProductFeaturesNotAttributedToProspect],
  ["3 inbound interest reply → not forced into awaiting-response template", testInboundReplyMayReflectInterest],
  ["4 mixed / fabrication detector keeps speaker attribution guard", testMixedConversationKeepsOutboundOnlyGuardOff],
  ["5 Summary UI no longer renders lifecycle/recommendation pills", testSummaryUiNoLongerRendersWorkflowChipsUnderSummary],
  ["outbound-only bullets stay factual", testOutboundOnlyBulletsStayFactual],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(err);
  }
}
if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} copilot-summary-direction tests passed.`);
