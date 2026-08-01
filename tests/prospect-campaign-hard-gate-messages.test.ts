/**
 * Server hard gate must use the same outreach fields as Review toolbar.
 * Run: npx tsx tests/prospect-campaign-hard-gate-messages.test.ts
 */
import assert from "node:assert/strict";
import {
  explainQualifiedForCampaign,
  listEmailCampaignBlockingReasons,
} from "../shared/prospectAiReviewState";
import {
  mapEmailCampaignBlockToOutreachReason,
  resolveProspectOutreachEligibility,
} from "../shared/prospectOutreachEligibility";
import { prospectOutreachEligibilityReasonLabel } from "../shared/prospectBulkOutreach";

const base = {
  analysisStatus: "completed" as const,
  reviewStatus: "approved" as const,
  approvedAt: "2026-07-31T00:00:00.000Z",
  needsReview: false,
  email: "agent@example.com",
  suggestedFirstMessage: "Hi there — quick idea for your team.",
  suggestedOutreachSubject: "Quick idea",
  notQualified: false,
};

{
  // Toolbar ready
  assert.equal(explainQualifiedForCampaign(base).ok, true);
  assert.equal(listEmailCampaignBlockingReasons(base).length, 0);
}

{
  // Omitting messages falsely blocks as outreach_needed (pre-fix bug)
  const omit = listEmailCampaignBlockingReasons({
    ...base,
    suggestedFirstMessage: undefined,
    suggestedOutreachSubject: undefined,
  });
  assert.deepEqual(
    omit.map((b) => b.code),
    ["outreach_needed"],
  );
  const mapped = mapEmailCampaignBlockToOutreachReason("outreach_needed");
  assert.equal(mapped.reason, "missing_message_snapshot");
  assert.equal(
    prospectOutreachEligibilityReasonLabel(mapped.reason, mapped.detail),
    "Missing campaign message",
  );
}

{
  // Server resolver with messages + connected mailbox → eligible
  const result = resolveProspectOutreachEligibility({
    ...base,
    emailConnected: true,
    preferredChannel: "auto",
  });
  assert.equal(result.anyEligible, true);
  assert.equal(result.selectedChannel, "email");
  assert.equal(result.summaryReason, "eligible");
}

{
  // Without messages → missing campaign message (not vague Not ready)
  const result = resolveProspectOutreachEligibility({
    ...base,
    suggestedFirstMessage: "",
    suggestedOutreachSubject: "",
    emailConnected: true,
    preferredChannel: "auto",
  });
  assert.equal(result.anyEligible, false);
  assert.equal(result.summaryReason, "missing_message_snapshot");
  assert.equal(
    prospectOutreachEligibilityReasonLabel(result.summaryReason),
    "Missing campaign message",
  );
}

console.log("prospect-campaign-hard-gate-messages.test.ts: all assertions passed");
