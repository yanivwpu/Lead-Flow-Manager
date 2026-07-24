/**
 * Phase 2 Controlled Multi-Channel AI Prospect Outreach — focused unit tests.
 * Run: npx tsx tests/prospect-bulk-outreach.test.ts
 */
import assert from "node:assert/strict";
import {
  buildQueueDedupKey,
  computeNextScheduledDelayMs,
  isProspectOutreachQueueArmed,
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
import { detectPriorProspectOutreach } from "../shared/prospectPriorOutreach";
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
  for (const reason of ["already_outreach_sent", "already_replied"] as const) {
    const outreachStatus = reason === "already_outreach_sent" ? "outreach_sent" : "replied";
    const result = resolveProspectOutreachEligibility({
      email: "a@example.com",
      emailConnected: true,
      reviewStatus: "approved",
      needsReview: false,
      outreachStatus,
      analysisStatus: "completed",
      enrichmentStatus: "completed",
      preferredChannel: "email",
    });
    assert.equal(result.anyEligible, false, reason);
    assert.equal(result.summaryReason, reason);
  }
}

function testNeedsReviewIsNotCampaignBlocker() {
  const result = resolveProspectOutreachEligibility({
    email: "a@example.com",
    emailConnected: true,
    reviewStatus: "needs_review",
    needsReview: true,
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    enrichmentStatus: "completed",
    websiteUrl: "https://example.com",
    preferredChannel: "email",
  });
  assert.equal(result.anyEligible, true);
  assert.equal(result.selectedChannel, "email");
  assert.notEqual(result.summaryReason, "needs_review");
  assert.notEqual(result.summaryReason, "not_approved");
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
  assert.equal(prospectOutreachEligibilityReasonLabel("needs_review"), "Needs attention");
  assert.equal(prospectOutreachEligibilityReasonLabel("not_qualified"), "Not qualified");
  assert.equal(prospectOutreachEligibilityReasonLabel("already_in_campaign"), "Already in Campaigns");
  assert.equal(
    prospectOutreachEligibilityReasonLabel("already_outreach_sent"),
    "Already contacted",
  );
  assert.equal(
    prospectOutreachEligibilityReasonLabel("enrichment_in_progress"),
    "Enrichment still in progress",
  );
  assert.equal(
    prospectOutreachEligibilityReasonLabel("not_enabled_for_bulk"),
    "Email sending is not available",
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

function testQueueArmedOnlyAfterStart() {
  // 1. Queue without Start -> worker must not claim
  assert.equal(isProspectOutreachQueueArmed({ queueRunning: false, paused: false }), false);
  assert.equal(isProspectOutreachQueueArmed({ queueRunning: false, paused: true }), false);
  // 2. Start begins sending
  assert.equal(isProspectOutreachQueueArmed({ queueRunning: true, paused: false }), true);
  // 3. Pause stops remaining
  assert.equal(isProspectOutreachQueueArmed({ queueRunning: true, paused: true }), false);
}

function testManualOutreachBlocksBulkQueueEvenIfStatusStuckApproved() {
  // Smash regression: PI still approved/not_sent but Idea-for thread already sent manually
  const prior = detectPriorProspectOutreach({
    outreachStatus: "not_sent",
    outreachConversationId: null,
    outreachSentAt: null,
    emailConversations: [
      {
        id: "conv-manual",
        subject: "Idea for Smash Interactive Agency | Digital Marketing Agency Miami",
        hasOutbound: true,
      },
    ],
  });
  assert.equal(prior.alreadyContacted, true);
  assert.equal(prior.reason, "manual_outreach_conversation");
  assert.equal(prior.conversationId, "conv-manual");

  const gated = resolveProspectOutreachEligibility({
    email: "info@smashtoday.com",
    emailConnected: true,
    reviewStatus: "approved",
    outreachStatus: "outreach_sent",
    analysisStatus: "completed",
    preferredChannel: "auto",
  });
  assert.equal(gated.anyEligible, false);
  assert.equal(gated.summaryReason, "already_outreach_sent");

  const clean = detectPriorProspectOutreach({
    outreachStatus: "not_sent",
    emailConversations: [],
  });
  assert.equal(clean.alreadyContacted, false);
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
  ["11-12 lifecycle skips Sent/Replied", testLifecycleSkips],
  ["needsReview advisory is not a Campaign blocker", testNeedsReviewIsNotCampaignBlocker],
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
  ["queue without Start sends zero; Start arms; Pause stops", testQueueArmedOnlyAfterStart],
  ["manual PI outreach blocks bulk queue even if status stuck", testManualOutreachBlocksBulkQueueEvenIfStatusStuckApproved],
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
