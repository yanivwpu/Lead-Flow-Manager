/**
 * Prospect AI display mappings & Activity timeline.
 * Run: npx tsx tests/prospect-ai-display.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROSPECT_AI_PAGE_SUBTITLES,
  PROSPECT_AI_TAB_LABELS,
  PROSPECT_CAMPAIGN_QUEUE_STATUS_LABELS,
  PROSPECT_LIFECYCLE_QUEUE_LABEL,
  PROSPECT_SELECTION_LABELS,
  PROSPECT_SENDING_QUEUE_LABEL,
  buildActivityAiAssistantModel,
  buildCampaignsAiAssistantModel,
  buildProspectActivityTimeline,
  mapProspectActivityApiToFeedItems,
  prospectCampaignQueueStatusLabel,
} from "../shared/prospectAiDisplay";
import {
  PROSPECT_REVIEW_FILTER_CHIPS,
  PROSPECT_REVIEW_LIFECYCLE_LABELS,
} from "../shared/prospectReviewUx";

const root = join(import.meta.dirname, "..");

assert.equal(PROSPECT_AI_TAB_LABELS.activity, "Activity");
assert.notEqual(PROSPECT_AI_TAB_LABELS.activity, "History");
assert.equal(PROSPECT_AI_PAGE_SUBTITLES.activity.includes("over time"), true);
assert.equal(PROSPECT_LIFECYCLE_QUEUE_LABEL, "Campaign Queue");
assert.equal(PROSPECT_SENDING_QUEUE_LABEL, "Sending Queue");
assert.equal(PROSPECT_CAMPAIGN_QUEUE_STATUS_LABELS.queued, "Sending Queue");
assert.equal(prospectCampaignQueueStatusLabel("queued"), "Sending Queue");
assert.equal(PROSPECT_REVIEW_LIFECYCLE_LABELS.queued, "Campaign Queue");
assert.equal(
  PROSPECT_REVIEW_FILTER_CHIPS.find((c) => c.id === "queued")?.label,
  "Campaign Queue",
);
assert.equal(PROSPECT_SELECTION_LABELS.selectPage, "Select page");
assert.equal(PROSPECT_SELECTION_LABELS.selectAllResults, "Select all results");

const feed = mapProspectActivityApiToFeedItems({
  events: [
    {
      id: "d1",
      type: "discovery",
      label: "Discovered 20 digital marketing",
      createdAt: "2026-07-21T23:12:00.000Z",
      status: "completed",
    },
  ],
  outreachEvents: [
    {
      id: "o1",
      type: "outreach",
      label: "Outreach sent",
      createdAt: "2026-07-21T23:34:00.000Z",
      status: "sent",
      channel: "email",
    },
    {
      id: "o0",
      type: "outreach",
      label: "",
      createdAt: "2026-07-20T16:00:00.000Z",
      status: "queued",
    },
  ],
  campaignEvents: [
    {
      id: "c1",
      type: "campaign",
      label: "Campaign enrollment",
      createdAt: "2026-07-21T23:21:00.000Z",
      status: "active",
    },
  ],
  imports: [
    {
      id: "i1",
      batchName: "GHL batch",
      status: "completed",
      imported: 21,
      duplicates: 2,
      errors: 1,
      createdAt: "2026-07-20T20:02:00.000Z",
    },
  ],
});

assert.equal(feed.length, 5);
assert.ok(feed.some((i) => i.kind === "import" && i.title.includes("21 imported")));
assert.ok(feed.some((i) => i.title.includes("Sending Queue")));

const timeline = buildProspectActivityTimeline(feed, new Date("2026-07-21T23:59:00.000Z"));
assert.ok(timeline.length >= 2);
assert.equal(timeline[0].items[0].at >= timeline[0].items[timeline[0].items.length - 1].at, true);
for (let g = 0; g < timeline.length - 1; g++) {
  const a = Date.parse(timeline[g].items[0].at);
  const b = Date.parse(timeline[g + 1].items[0].at);
  assert.ok(a >= b, "groups newest-first");
}

const campaignsAssistant = buildCampaignsAiAssistantModel({
  queued: 6,
  sending: 0,
  sentToday: 0,
  failed: 0,
  paused: 0,
  queueRunning: false,
  queuePaused: false,
});
assert.ok(campaignsAssistant.lines.some((l) => l.text.includes("Sending Queue")));
assert.ok(campaignsAssistant.lines.some((l) => /No failures need attention/.test(l.text)));
assert.match(campaignsAssistant.nextAction || "", /Start the sending queue/i);

const activityAssistant = buildActivityAiAssistantModel({
  discoveriesToday: 20,
  outreachSentToday: 1,
  campaignEnrollmentsToday: 2,
  repliesTotal: 1,
});
assert.ok(activityAssistant.lines.some((l) => /20 businesses were discovered/.test(l.text)));
assert.ok(activityAssistant.lines.some((l) => /entered campaigns/.test(l.text)));

const prospectAiSrc = readFileSync(join(root, "client/src/pages/ProspectAI.tsx"), "utf8");
assert.ok(prospectAiSrc.includes("PROSPECT_AI_TAB_LABELS.activity"));
assert.ok(prospectAiSrc.includes("Prospect Activity"));
assert.ok(!prospectAiSrc.includes("Prospect History"));
assert.ok(!prospectAiSrc.includes('["activity", "History"]'));
assert.ok(prospectAiSrc.includes("prospect-activity-timeline"));
assert.ok(!prospectAiSrc.includes("po-queue-start"));
assert.ok(!prospectAiSrc.includes("Start queue"));
assert.ok(!prospectAiSrc.includes("activity-summary"));

const campaignsSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
  "utf8",
);
assert.ok(campaignsSrc.includes("po-queue-start"));
assert.ok(campaignsSrc.includes("PROSPECT_SENDING_QUEUE_LABEL"));
assert.ok(campaignsSrc.includes("buildCampaignsAiAssistantModel"));
assert.ok(!campaignsSrc.includes("ProspectImportHistoryPanel"));
assert.ok(!campaignsSrc.includes("Discovery searches"));

const reviewSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);
assert.ok(reviewSrc.includes("PROSPECT_SELECTION_LABELS.selectPage"));
assert.ok(reviewSrc.includes("PROSPECT_SELECTION_LABELS.selectAllResults"));
assert.ok(!reviewSrc.includes("Select visible"));
assert.ok(!reviewSrc.includes("Select all filtered"));
assert.ok(reviewSrc.includes("Lifecycle"));
assert.ok(reviewSrc.includes("Filters"));

// DB status keys unchanged in shared lifecycle resolver input
assert.ok(
  readFileSync(join(root, "shared/prospectReviewUx.ts"), "utf8").includes('"queued"'),
);
assert.equal(PROSPECT_REVIEW_LIFECYCLE_LABELS.queued !== "queued", true);

console.log("prospect-ai-display.test.ts: ok");
