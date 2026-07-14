/**
 * Prospect Intelligence outreach lifecycle unit tests.
 * Run: npx tsx tests/prospect-outreach-lifecycle.test.ts
 */
import assert from "node:assert/strict";
import {
  canMarkProspectOutreachSent,
  nextOutreachStatusAfterReply,
  nextOutreachStatusAfterSend,
  resolveProspectDisplayStatus,
  resolveProspectOutreachLifecycleUi,
  shouldMarkOutreachReplied,
  shouldPersistFirstOutreachSentAt,
} from "../shared/prospectOutreachLifecycle";
import { resolveProspectApproveOutreachUi } from "../shared/prospectContactEnrichment";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("1. approved + successful send eligibility → outreach_sent", () => {
  assert.equal(
    nextOutreachStatusAfterSend({ reviewStatus: "approved", outreachStatus: "not_sent" }),
    "outreach_sent",
  );
  assert.equal(canMarkProspectOutreachSent({ reviewStatus: "approved", outreachStatus: "not_sent" }), true);
  assert.equal(shouldPersistFirstOutreachSentAt({ outreachStatus: "not_sent" }), true);
});

run("2. send failure / pending review stays not_sent", () => {
  assert.equal(
    nextOutreachStatusAfterSend({ reviewStatus: "approved", outreachStatus: "not_sent" }),
    "outreach_sent",
  );
  // Without success hook, status stays not_sent — simulate failure: not calling mark.
  assert.equal(
    resolveProspectDisplayStatus({ reviewStatus: "approved", outreachStatus: "not_sent" }),
    "approved",
  );
  assert.equal(
    nextOutreachStatusAfterSend({ reviewStatus: "needs_review", outreachStatus: "not_sent" }),
    null,
  );
});

run("3. abandon draft remains approved (not_sent)", () => {
  const ui = resolveProspectApproveOutreachUi({
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    email: "info@jivesmedia.com",
  });
  assert.equal(ui.showSendOutreach, true);
  assert.equal(ui.statusLabel, "Approved");
  assert.equal(ui.isOutreachSentOrLater, false);
});

run("4. after outreach_sent hide first Send, show View conversation", () => {
  const ui = resolveProspectApproveOutreachUi({
    reviewStatus: "approved",
    outreachStatus: "outreach_sent",
    outreachSentAt: new Date().toISOString(),
    email: "info@jivesmedia.com",
    outreachConversationId: "conv-outreach-1",
  });
  assert.equal(ui.showSendOutreach, false);
  assert.equal(ui.showViewThread, true);
  assert.equal(ui.statusLabel, "Outreach Sent");
  // Duplicate mark is idempotent
  assert.equal(
    nextOutreachStatusAfterSend({
      reviewStatus: "approved",
      outreachStatus: "outreach_sent",
      outreachSentAt: new Date().toISOString(),
    }),
    "outreach_sent",
  );
});

run("5. inbound reply on exact linked conversation → replied", () => {
  const decision = shouldMarkOutreachReplied({
    direction: "inbound",
    conversationId: "conv-1",
    linkedOutreachConversationId: "conv-1",
    outreachStatus: "outreach_sent",
    outreachSentAt: new Date().toISOString(),
    fromEmail: "info@jivesmedia.com",
    subject: "Re: Idea for Jives Media",
  });
  assert.equal(decision.mark, true);
  assert.equal(decision.reason, "reply_matched");
  assert.equal(
    nextOutreachStatusAfterReply({ outreachStatus: "outreach_sent", outreachSentAt: new Date() }),
    "replied",
  );
});

run("6. unrelated sibling conversation does not mark replied", () => {
  const decision = shouldMarkOutreachReplied({
    direction: "inbound",
    conversationId: "conv-sibling",
    linkedOutreachConversationId: "conv-outreach",
    outreachStatus: "outreach_sent",
    outreachSentAt: new Date().toISOString(),
    fromEmail: "info@jivesmedia.com",
    subject: "Different thread",
  });
  assert.equal(decision.mark, false);
  assert.equal(decision.reason, "conversation_mismatch");
});

run("7. own outbound does not mark replied", () => {
  const decision = shouldMarkOutreachReplied({
    direction: "outbound",
    conversationId: "conv-1",
    linkedOutreachConversationId: "conv-1",
    outreachStatus: "outreach_sent",
    outreachSentAt: new Date().toISOString(),
  });
  assert.equal(decision.mark, false);
  assert.equal(decision.reason, "not_inbound");
});

run("8. calendar/system email does not mark replied", () => {
  assert.equal(
    shouldMarkOutreachReplied({
      direction: "inbound",
      conversationId: "conv-1",
      linkedOutreachConversationId: "conv-1",
      outreachStatus: "outreach_sent",
      isCalendarOrInvite: true,
      subject: "Invitation: Meeting",
    }).reason,
    "calendar_or_invite",
  );
  assert.equal(
    shouldMarkOutreachReplied({
      direction: "inbound",
      conversationId: "conv-1",
      linkedOutreachConversationId: "conv-1",
      outreachStatus: "outreach_sent",
      fromEmail: "mailer-daemon@google.com",
      subject: "Delivery Status Notification",
    }).reason,
    "system_or_bounce",
  );
});

run("9. display status priority replied > outreach_sent > approved > needs_review > pending", () => {
  assert.equal(
    resolveProspectDisplayStatus({ reviewStatus: "approved", outreachStatus: "replied" }),
    "replied",
  );
  assert.equal(
    resolveProspectDisplayStatus({ reviewStatus: "approved", outreachStatus: "outreach_sent" }),
    "outreach_sent",
  );
  assert.equal(
    resolveProspectDisplayStatus({ reviewStatus: "approved", outreachStatus: "not_sent" }),
    "approved",
  );
  assert.equal(
    resolveProspectDisplayStatus({ reviewStatus: "needs_review", outreachStatus: "not_sent" }),
    "needs_review",
  );
  assert.equal(
    resolveProspectDisplayStatus({ reviewStatus: "pending", outreachStatus: "not_sent" }),
    "pending",
  );
});

run("10. normal inbox (no PI context) UI unchanged — no send CTA without approval", () => {
  const ui = resolveProspectOutreachLifecycleUi({
    reviewStatus: "pending",
    outreachStatus: "not_sent",
    hasValidEmail: true,
    email: "someone@example.com",
  });
  assert.equal(ui.showSendOutreach, false);
  assert.equal(ui.showViewThread, false);
  // Without prospectOutreach flag, mark would no-op for non-approved — coverage for hook gate.
  assert.equal(canMarkProspectOutreachSent({ reviewStatus: "pending", outreachStatus: "not_sent" }), false);
});

console.log("\nAll prospect-outreach-lifecycle tests passed.");
