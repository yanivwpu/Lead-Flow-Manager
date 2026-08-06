/**
 * Campaigns UI polish — Review-matching chips, no Paused clutter.
 * Run: npx tsx tests/prospect-campaign-ui-polish.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROSPECT_CAMPAIGN_METRIC_LABELS,
  PROSPECT_CAMPAIGN_STATUS_FILTERS,
} from "../shared/prospectAiDisplay";
import {
  formatDraftCampaignReadyCopy,
  PROSPECT_CAMPAIGN_LIFECYCLE_LABELS,
} from "../shared/prospectCampaignLifecycle";

const panelSrc = readFileSync(
  join(import.meta.dirname, "..", "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
  "utf8",
);
const reviewSrc = readFileSync(
  join(import.meta.dirname, "..", "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);

const reviewChipClass =
  "inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-medium transition-colors duration-150";

assert.ok(reviewSrc.includes(reviewChipClass), "Review chips must keep compact class");
assert.ok(panelSrc.includes(reviewChipClass), "Campaigns chips must match Review compact class");
assert.ok(panelSrc.includes("po-status-tabs"));
assert.ok(panelSrc.includes("formatDraftCampaignReadyCopy"));

assert.deepEqual(
  PROSPECT_CAMPAIGN_STATUS_FILTERS.map((f) => f.label),
  ["All", "Ready to Send", "Sent", "Failed"],
);
assert.deepEqual(
  [
    PROSPECT_CAMPAIGN_METRIC_LABELS.queued,
    PROSPECT_CAMPAIGN_METRIC_LABELS.sending,
    PROSPECT_CAMPAIGN_METRIC_LABELS.sentToday,
    PROSPECT_CAMPAIGN_METRIC_LABELS.failed,
  ],
  ["Ready to Send", "Sending", "Sent", "Failed"],
);

assert.equal(PROSPECT_CAMPAIGN_LIFECYCLE_LABELS.draft, "Draft");
assert.equal(PROSPECT_CAMPAIGN_LIFECYCLE_LABELS.running, "Sending");
assert.equal(PROSPECT_CAMPAIGN_LIFECYCLE_LABELS.paused, "Paused");
assert.equal(PROSPECT_CAMPAIGN_LIFECYCLE_LABELS.blocked, "Blocked");
assert.equal(PROSPECT_CAMPAIGN_LIFECYCLE_LABELS.completed, "Completed");

const draft = formatDraftCampaignReadyCopy(44);
assert.equal(draft.title, "Draft ready to send.");
assert.equal(draft.readyLine, "44 personalized emails are ready.");
assert.equal(draft.actionLine, "Review messages if needed, then Start Sending.");

assert.ok(!panelSrc.includes("Campaign paused"));
assert.ok(!panelSrc.includes("po-queue-paused-banner"));
assert.ok(!panelSrc.includes("lg:grid-cols-5"));
assert.ok(panelSrc.includes("lg:grid-cols-4"));

console.log("prospect-campaign-ui-polish.test.ts: ok");
