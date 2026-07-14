/**
 * Prospect Engine email suppression / deliverability helpers.
 */
import assert from "node:assert/strict";
import {
  buildProspectEmailSuppressionCustomFields,
  extractBouncedRecipientFromDsn,
  isPermanentEmailSendFailure,
  isProspectEmailUnsubscribeSignal,
  prospectSuppressionDetailLabel,
} from "../shared/prospectEmailSuppression";
import { prospectOutreachEligibilityReasonLabel } from "../shared/prospectBulkOutreach";
import { resolveProspectOutreachEligibility } from "../shared/prospectOutreachEligibility";

function testBuildSuppressionFlags() {
  const bounce = buildProspectEmailSuppressionCustomFields({}, {
    reason: "bounce",
    detail: "dsn",
    bouncedEmail: "Bad.User@Example.COM",
  });
  assert.equal(bounce.emailBounced, true);
  assert.equal(bounce.bounced, true);
  assert.equal(bounce.suppressed, true);
  assert.equal(bounce.bouncedEmail, "bad.user@example.com");
  assert.equal(bounce.suppressionReason, "bounce");

  const unsub = buildProspectEmailSuppressionCustomFields({}, { reason: "unsubscribe" });
  assert.equal(unsub.unsubscribed, true);
  assert.equal(unsub.optOut, true);
  assert.equal(unsub.suppressed, true);
}

function testUnsubscribeSignal() {
  assert.equal(
    isProspectEmailUnsubscribeSignal({
      subject: "Re: Idea for Acme",
      body: "Please remove me from your list.",
      fromEmail: "prospect@example.com",
    }),
    true,
  );
  assert.equal(
    isProspectEmailUnsubscribeSignal({
      subject: "Delivery Status Notification (Failure)",
      body: "User unknown",
      fromEmail: "mailer-daemon@google.com",
    }),
    false,
  );
}

function testPermanentSendFailure() {
  assert.equal(isPermanentEmailSendFailure("Invalid To header"), true);
  assert.equal(isPermanentEmailSendFailure("550 5.1.1 The email account does not exist"), true);
  assert.equal(isPermanentEmailSendFailure("Rate limit exceeded 429"), false);
  assert.equal(isPermanentEmailSendFailure("Backend Error 503"), false);
}

function testDsnRecipientExtract() {
  const email = extractBouncedRecipientFromDsn({
    subject: "Delivery Status Notification (Failure)",
    body: "Original-Recipient: rfc822; lead@acme.test\nDiagnostic-Code: smtp; 550 5.1.1",
  });
  assert.equal(email, "lead@acme.test");

  const missing = extractBouncedRecipientFromDsn({
    subject: "Failure",
    body: "Something went wrong with delivery.",
  });
  assert.equal(missing, null);
}

function testEligibilityBlocksBounced() {
  const result = resolveProspectOutreachEligibility({
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    email: "lead@acme.test",
    emailConnected: true,
    suppressed: true,
    optedOut: false,
    suppressionDetail: "bounce",
    preferredChannel: "email",
  });
  assert.equal(result.anyEligible, false);
  assert.equal(result.summaryReason, "suppressed");
  assert.equal(result.channels.email.detail, "bounce");
  assert.equal(
    prospectOutreachEligibilityReasonLabel("suppressed", "bounce"),
    "Bounced / delivery failed",
  );
  assert.equal(
    prospectOutreachEligibilityReasonLabel("opted_out", "unsubscribe"),
    "Opted out",
  );
  assert.equal(prospectSuppressionDetailLabel("dnc"), "Do not contact");
}

function testOptedOutLabel() {
  const result = resolveProspectOutreachEligibility({
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    email: "lead@acme.test",
    emailConnected: true,
    suppressed: false,
    optedOut: true,
    suppressionDetail: "unsubscribe",
    preferredChannel: "email",
  });
  assert.equal(result.anyEligible, false);
  assert.equal(result.summaryReason, "opted_out");
}

const tests: Array<[string, () => void]> = [
  ["build suppression custom fields", testBuildSuppressionFlags],
  ["unsubscribe keyword signal", testUnsubscribeSignal],
  ["permanent vs transient send errors", testPermanentSendFailure],
  ["DSN recipient extraction", testDsnRecipientExtract],
  ["eligibility blocks bounced", testEligibilityBlocksBounced],
  ["eligibility blocks opted out", testOptedOutLabel],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail - ${name}`, err);
  }
}
if (failed) process.exit(1);
console.log(`\n${tests.length} tests passed`);
