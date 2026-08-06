/**
 * Prospect AI launch polish — terminology + empty-state consistency.
 * Run: npx tsx tests/prospect-ai-launch-polish.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROSPECT_CAMPAIGN_CONTROL_LABELS,
  PROSPECT_CAMPAIGN_METRIC_LABELS,
  PROSPECT_CAMPAIGN_STATUS_FILTERS,
  PROSPECT_READY_TO_SEND_LABEL,
  formatProspectReviewSelectionSummary,
} from "../shared/prospectAiDisplay";
import {
  PROSPECT_REVIEW_LIFECYCLE_LABELS,
  prospectReviewEmptyMessage,
  prospectReviewWorkEmptyMessage,
} from "../shared/prospectReviewUx";
import { formatDraftCampaignReadyCopy } from "../shared/prospectCampaignLifecycle";
import {
  PROSPECT_CAMPAIGN_CONNECT_EMAIL_MESSAGE,
  PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE,
} from "../shared/prospectBulkOutreach";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const root = process.cwd();

run("lifecycle labels use Needs Review / Campaign Ready / Ready to Send", () => {
  assert.equal(PROSPECT_REVIEW_LIFECYCLE_LABELS.ready_for_approval, "Needs Review");
  assert.equal(PROSPECT_REVIEW_LIFECYCLE_LABELS.campaign_ready, "Campaign Ready");
  assert.equal(PROSPECT_REVIEW_LIFECYCLE_LABELS.queued, "Ready to Send");
  assert.equal(PROSPECT_READY_TO_SEND_LABEL, "Ready to Send");
});

run("Campaigns filters and metrics avoid bare Ready", () => {
  assert.equal(PROSPECT_CAMPAIGN_METRIC_LABELS.queued, "Ready to Send");
  assert.deepEqual(
    PROSPECT_CAMPAIGN_STATUS_FILTERS.map((f) => f.label),
    ["All", "Ready to Send", "Sent", "Failed"],
  );
  assert.equal(PROSPECT_CAMPAIGN_CONTROL_LABELS.saveLimits, "Save Limits");
});

run("empty states stay short and consistent", () => {
  assert.equal(prospectReviewEmptyMessage("all", false), "No prospects yet.");
  assert.equal(prospectReviewEmptyMessage("campaigns", true), "No campaigns yet.");
  assert.equal(prospectReviewEmptyMessage("inbox", true), "No replies yet.");
  assert.equal(prospectReviewWorkEmptyMessage("campaign_ready", true), "No Campaign Ready prospects.");
  assert.equal(prospectReviewWorkEmptyMessage("archived", true), "No archived prospects.");
});

run("selection summary uses Campaign Ready / Needs Review", () => {
  const s = formatProspectReviewSelectionSummary({
    selectedCount: 5,
    qualifiedCount: 3,
    needsReviewCount: 2,
  });
  assert.match(s.detail || "", /3 Campaign Ready/);
  assert.match(s.detail || "", /2 Needs Review/);
});

run("draft and Gmail copy are confident and consistent", () => {
  assert.equal(formatDraftCampaignReadyCopy(2).title, "Draft ready to send.");
  assert.match(PROSPECT_CAMPAIGN_CONNECT_EMAIL_MESSAGE, /Connect Gmail/);
  assert.match(PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE, /Reconnect Gmail before Start Sending/);
  assert.doesNotMatch(PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE, /sorry/i);
});

run("onboarding maps Review & Accept to Qualified / Archive", () => {
  const src = readFileSync(
    join(root, "client/src/components/prospectAi/ProspectAiOnboarding.tsx"),
    "utf8",
  );
  assert.match(src, /Review & Accept/);
  assert.match(src, /Mark fits Qualified; Archive the rest/);
  assert.doesNotMatch(src, /Accept fits;/);
});

run("Inbox empty + Review Re-run use polished copy", () => {
  const inbox = readFileSync(join(root, "client/src/pages/ProspectAI.tsx"), "utf8");
  assert.match(inbox, /No replies yet\./);
  const panel = readFileSync(
    join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.match(panel, /Re-run AI Review/);
  assert.doesNotMatch(panel, /Re-run Analysis/);
  assert.match(panel, /Save Message/);
});

console.log("\nAll prospect AI launch polish tests passed.");
