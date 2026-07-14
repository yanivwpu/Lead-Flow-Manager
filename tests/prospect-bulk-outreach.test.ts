/**
 * Phase 2 Controlled Multi-Channel AI Prospect Outreach — focused unit tests.
 * Run: npx tsx tests/prospect-bulk-outreach.test.ts
 */
import assert from "node:assert/strict";
import {
  buildQueueDedupKey,
  computeNextScheduledDelayMs,
  normalizeRecipientIdentity,
  prospectBulkOutreachLog,
  prospectOutreachEligibilityReasonLabel,
  PROSPECT_BULK_SEND_ENABLED_CHANNELS,
} from "../shared/prospectBulkOutreach";
import { isEmailMailboxSyncStatusSendable } from "../shared/emailMailboxAvailability";
import {
  resolveProspectOutreachEligibility,
  resolveRecipientForChannel,
  shouldSkipDefaultBulkReanalyze,
} from "../shared/prospectOutreachEligibility";
import {
  canMarkProspectOutreachSent,
  shouldMarkOutreachReplied,
} from "../shared/prospectOutreachLifecycle";

function testBulkReanalyzeSkipDefaults() {
  assert.equal(
    shouldSkipDefaultBulkReanalyze({ outreachStatus: "outreach_sent" }),
    true,
  );
  assert.equal(shouldSkipDefaultBulkReanalyze({ outreachStatus: "replied" }), true);
  assert.equal(shouldSkipDefaultBulkReanalyze({ outreachStatus: "not_sent" }), false);
  assert.equal(
    shouldSkipDefaultBulkReanalyze({ outreachStatus: "outreach_sent", force: true }),
    false,
  );
}

function testEmailEligibleWhenConnected() {
  const result = resolveProspectOutreachEligibility({
    email: "a@example.com",
    emailConnected: true,
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    preferredChannel: "auto",
  });
  assert.equal(result.channels.email.eligible, true);
  assert.equal(result.selectedChannel, "email");
  assert.equal(result.anyEligible, true);
}

function testMissingEmailIneligible() {
  const result = resolveProspectOutreachEligibility({
    email: null,
    emailConnected: true,
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    preferredChannel: "email",
  });
  assert.equal(result.channels.email.eligible, false);
  assert.equal(result.channels.email.reason, "missing_identity");
  assert.equal(result.selectedChannel, null);
}

function testWhatsAppPhoneAloneNotColdEligible() {
  const result = resolveProspectOutreachEligibility({
    phone: "+15551234567",
    whatsappConnected: true,
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    preferredChannel: "whatsapp",
    whatsappConsent: false,
  });
  assert.equal(result.channels.whatsapp.eligible, false);
  assert.ok(
    result.channels.whatsapp.reason === "missing_consent" ||
      result.channels.whatsapp.reason === "template_required" ||
      result.channels.whatsapp.reason === "not_enabled_for_bulk",
  );
  // Preferred WhatsApp must NOT silently fall back to email
  assert.equal(result.selectedChannel, null);
}

function testMessengerIdentityNotUnrestrictedBulk() {
  const result = resolveProspectOutreachEligibility({
    facebookId: "fb-123",
    facebookConnected: true,
    hasMessengerConversation: false,
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    preferredChannel: "facebook",
  });
  assert.equal(result.channels.facebook.eligible, false);
  assert.equal(result.channels.facebook.reason, "unsupported_for_cold_outreach");
}

function testSmsRequiresConsentAndProvider() {
  const noConsent = resolveProspectOutreachEligibility({
    phone: "+15551234567",
    smsConnected: true,
    smsConsent: false,
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    preferredChannel: "sms",
    bulkEnabledChannels: ["sms"],
  });
  assert.equal(noConsent.channels.sms.eligible, false);
  assert.equal(noConsent.channels.sms.reason, "missing_consent");

  const ok = resolveProspectOutreachEligibility({
    phone: "+15551234567",
    smsConnected: true,
    smsConsent: true,
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    preferredChannel: "sms",
    bulkEnabledChannels: ["sms"],
  });
  assert.equal(ok.channels.sms.eligible, true);
}

function testLifecycleSkips() {
  for (const reason of ["already_outreach_sent", "already_replied", "needs_review"] as const) {
    const outreachStatus =
      reason === "already_outreach_sent"
        ? "outreach_sent"
        : reason === "already_replied"
          ? "replied"
          : "not_sent";
    const result = resolveProspectOutreachEligibility({
      email: "a@example.com",
      emailConnected: true,
      reviewStatus: reason === "needs_review" ? "needs_review" : "approved",
      needsReview: reason === "needs_review",
      outreachStatus,
      analysisStatus: "completed",
      preferredChannel: "email",
    });
    assert.equal(result.anyEligible, false, reason);
    assert.equal(result.summaryReason, reason);
  }
}

function testDedupKeyAndSnapshotNormalization() {
  const key1 = buildQueueDedupKey({
    workspaceUserId: "w1",
    contactId: "c1",
    channel: "email",
    recipientIdentity: "A@Example.COM",
  });
  const key2 = buildQueueDedupKey({
    workspaceUserId: "w1",
    contactId: "c1",
    channel: "email",
    recipientIdentity: "a@example.com",
  });
  assert.equal(key1, key2);
  assert.equal(normalizeRecipientIdentity("email", "  Foo@Bar.COM "), "foo@bar.com");
  assert.equal(resolveRecipientForChannel("email", { email: "x@y.com" }), "x@y.com");
}

function testDelayJitterRange() {
  for (let i = 0; i < 20; i++) {
    const ms = computeNextScheduledDelayMs({ minDelaySeconds: 90, maxDelaySeconds: 180 });
    assert.ok(ms >= 90_000 && ms <= 180_000);
  }
}

function testOnlyEmailBulkEnabledByDefault() {
  assert.deepEqual([...PROSPECT_BULK_SEND_ENABLED_CHANNELS], ["email"]);
}

function testManualSendLifecycleStillWorks() {
  assert.equal(
    canMarkProspectOutreachSent({
      reviewStatus: "approved",
      outreachStatus: "not_sent",
    }),
    true,
  );
  const reply = shouldMarkOutreachReplied({
    direction: "inbound",
    conversationId: "conv-1",
    linkedOutreachConversationId: "conv-1",
    outreachStatus: "outreach_sent",
    fromEmail: "prospect@example.com",
    subject: "Re: Idea for Jane",
  });
  assert.equal(reply.mark, true);

  const sibling = shouldMarkOutreachReplied({
    direction: "inbound",
    conversationId: "conv-other",
    linkedOutreachConversationId: "conv-1",
    outreachStatus: "outreach_sent",
    fromEmail: "prospect@example.com",
    subject: "Hello",
  });
  assert.equal(sibling.mark, false);
  assert.equal(sibling.reason, "conversation_mismatch");
}

function testSummaryReasonDoesNotMaskSenderNotConnected() {
  const result = resolveProspectOutreachEligibility({
    email: "a@example.com",
    emailConnected: false,
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    preferredChannel: "auto",
  });
  assert.equal(result.channels.email.reason, "sender_not_connected");
  assert.equal(result.summaryReason, "sender_not_connected");
  assert.equal(result.anyEligible, false);
  assert.equal(result.selectedChannel, null);
}

function testAutoSelectsEmailWhenConnectedLikeProduction() {
  // Mirrors production: valid email + usable Gmail + Preferred = Auto
  const result = resolveProspectOutreachEligibility({
    email: "solomonjames@gmail.com",
    emailConnected: true,
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    needsReview: false,
    preferredChannel: "auto",
  });
  assert.equal(result.channels.email.technicallyAvailable, true);
  assert.equal(result.channels.email.connected, true);
  assert.equal(result.channels.email.policyEligible, true);
  assert.equal(result.channels.email.eligible, true);
  assert.equal(result.channels.email.reason, "eligible");
  assert.equal(result.selectedChannel, "email");
  assert.equal(result.anyEligible, true);
  assert.equal(result.summaryReason, "eligible");
}

function testHumanReadableReasonLabels() {
  assert.equal(
    prospectOutreachEligibilityReasonLabel("sender_not_connected"),
    "Email sender not connected",
  );
  assert.equal(
    prospectOutreachEligibilityReasonLabel("missing_identity", "missing_email"),
    "Missing email",
  );
  assert.equal(prospectOutreachEligibilityReasonLabel("needs_review"), "Needs review");
  assert.equal(
    prospectOutreachEligibilityReasonLabel("already_outreach_sent"),
    "Already contacted",
  );
  assert.equal(
    prospectOutreachEligibilityReasonLabel("not_enabled_for_bulk"),
    "No bulk-enabled channel available",
  );
}

function testStickyNeedsReconnectStatusIsSendableCandidate() {
  assert.equal(isEmailMailboxSyncStatusSendable("needs_reconnect"), true);
  assert.equal(isEmailMailboxSyncStatusSendable("connected"), true);
  assert.equal(isEmailMailboxSyncStatusSendable("error"), true);
  assert.equal(isEmailMailboxSyncStatusSendable("disconnected"), false);
}

function testSafeLoggingNoBodies() {
  const payload = prospectBulkOutreachLog("send_succeeded", {
    workspaceId: "w",
    queueItemId: "q",
    selectedChannel: "email",
    status: "sent",
  });
  assert.equal(payload.tag, "[ProspectBulkOutreach]");
  assert.equal(payload.event, "send_succeeded");
  assert.equal("body" in payload, false);
  assert.equal("messageSnapshot" in payload, false);
}

function testAutoDoesNotPickProhibitedChannel() {
  // Phone present but WhatsApp/SMS not bulk-enabled and no email
  const result = resolveProspectOutreachEligibility({
    phone: "+15551234567",
    whatsappConnected: true,
    smsConnected: true,
    whatsappConsent: true,
    smsConsent: true,
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    preferredChannel: "auto",
  });
  assert.equal(result.selectedChannel, null);
  assert.equal(result.channels.whatsapp.eligible, false);
  assert.equal(result.channels.sms.eligible, false);
}

const tests: Array<[string, () => void]> = [
  ["1-4 skip reanalyze Outreach Sent/Replied by default", testBulkReanalyzeSkipDefaults],
  ["5 email + Gmail connected → eligible", testEmailEligibleWhenConnected],
  ["6 missing email → ineligible", testMissingEmailIneligible],
  ["7 WhatsApp number alone ≠ cold eligible", testWhatsAppPhoneAloneNotColdEligible],
  ["8 Messenger identity ≠ unrestricted bulk", testMessengerIdentityNotUnrestrictedBulk],
  ["9 SMS respects consent/provider hooks", testSmsRequiresConsentAndProvider],
  ["11-13 lifecycle skips Sent/Replied/Needs Review", testLifecycleSkips],
  ["14-15 duplicate recipient normalization + dedup", testDedupKeyAndSnapshotNormalization],
  ["delay jitter within safe range", testDelayJitterRange],
  ["production bulk channel = email only", testOnlyEmailBulkEnabledByDefault],
  ["24-26 reply exact thread + manual lifecycle", testManualSendLifecycleStillWorks],
  ["observability safe fields", testSafeLoggingNoBodies],
  ["auto never silently picks prohibited channel", testAutoDoesNotPickProhibitedChannel],
  ["summaryReason does not mask sender_not_connected", testSummaryReasonDoesNotMaskSenderNotConnected],
  ["Auto + valid email + Gmail → Email selected (production regression)", testAutoSelectsEmailWhenConnectedLikeProduction],
  ["human-readable eligibility labels", testHumanReadableReasonLabels],
  ["sticky needs_reconnect is sendable candidate", testStickyNeedsReconnectStatusIsSendableCandidate],
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

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} prospect-bulk-outreach tests passed.`);
