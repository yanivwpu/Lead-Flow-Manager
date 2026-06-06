import assert from "node:assert/strict";
import {
  contactHasChannelIdentifier,
  evaluatePresetCampaignEnrollability,
  formatCampaignEnrollmentSubtitle,
  inferContactConversationChannel,
  shortenEnrollmentFailureReason,
} from "../shared/campaignEnrollment";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test("instagram conversation blocks whatsapp campaign", () => {
  const r = evaluatePresetCampaignEnrollability({
    contact: { instagramId: "ig-123" },
    campaign: { channel: "whatsapp", status: "active", messages: [{ content: "hi" }] },
    conversationChannel: "instagram",
    channelConnected: true,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.userMessage, "Cannot enroll: campaign requires WhatsApp");
});

test("instagram campaign eligible for instagram contact", () => {
  const r = evaluatePresetCampaignEnrollability({
    contact: { instagramId: "ig-123" },
    campaign: { channel: "instagram", status: "active", messages: [{ content: "hi" }] },
    conversationChannel: "instagram",
    channelConnected: true,
  });
  assert.equal(r.eligible, true);
});

test("draft campaign blocked at enroll", () => {
  const r = evaluatePresetCampaignEnrollability({
    contact: { instagramId: "ig-123" },
    campaign: { channel: "instagram", status: "draft", messages: [{ content: "hi" }] },
    conversationChannel: "instagram",
  });
  assert.equal(r.userMessage, "Cannot enroll: campaign is Draft");
});

test("failed enrollment shows step error", () => {
  const subtitle = formatCampaignEnrollmentSubtitle({
    status: "failed",
    currentStepIndex: 0,
    totalSteps: 3,
    failureReason: "Outside the Instagram reply window",
  });
  assert.ok(subtitle.includes("reply window"));
  assert.ok(!subtitle.includes("needs review"));
});

test("shorten enrollment failure reason", () => {
  assert.equal(
    shortenEnrollmentFailureReason("Customer is outside the 24-hour reply window"),
    "Cannot send: outside reply window",
  );
});

if (process.exitCode !== 1) {
  console.log("campaign-enrollment tests passed");
}
