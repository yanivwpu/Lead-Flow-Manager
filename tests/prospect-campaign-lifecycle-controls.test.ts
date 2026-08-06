/**
 * Campaign Draft → Start lifecycle + queue order.
 * Run: npx tsx tests/prospect-campaign-lifecycle-controls.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatDraftCampaignReadyCopy,
  PROSPECT_CAMPAIGN_LIFECYCLE_LABELS,
  resolveProspectCampaignLifecycleStatus,
  resolveProspectCampaignPrimaryControl,
} from "../shared/prospectCampaignLifecycle";
import { PROSPECT_CAMPAIGN_METRIC_LABELS, PROSPECT_CAMPAIGN_STATUS_FILTERS } from "../shared/prospectAiDisplay";
import { partitionProspectCampaignItems } from "../shared/prospectCampaignBatches";
import type { ProspectOutreachQueueItemSummary } from "../shared/prospectBulkOutreach";

function item(
  partial: Partial<ProspectOutreachQueueItemSummary> & { id: string },
): ProspectOutreachQueueItemSummary {
  return {
    batchId: "b1",
    workspaceUserId: "w1",
    contactId: "c1",
    selectedChannel: "email",
    recipientIdentity: "a@b.com",
    queueStatus: "queued",
    attempts: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

{
  assert.equal(
    resolveProspectCampaignPrimaryControl({
      queueRunning: false,
      paused: false,
      activeBatchStatus: "draft",
      hasReadyRows: true,
    }),
    "start",
  );
  assert.equal(
    resolveProspectCampaignPrimaryControl({
      queueRunning: true,
      paused: true,
      activeBatchStatus: "draft",
      hasReadyRows: true,
    }),
    "start",
    "Draft must never show Resume",
  );
  assert.equal(
    resolveProspectCampaignPrimaryControl({
      queueRunning: true,
      paused: true,
      activeBatchStatus: "queued",
      hasReadyRows: true,
    }),
    "start",
    "Never-started queued batch + sticky pause → Start, not Resume",
  );
  assert.equal(
    resolveProspectCampaignPrimaryControl({
      queueRunning: true,
      paused: true,
      activeBatchStatus: "running",
      hasReadyRows: true,
    }),
    "resume",
  );
  assert.equal(
    resolveProspectCampaignPrimaryControl({
      queueRunning: true,
      paused: false,
      activeBatchStatus: "running",
      hasReadyRows: true,
    }),
    "pause",
  );
}

{
  assert.equal(
    resolveProspectCampaignLifecycleStatus({
      activeBatchStatus: "draft",
      queueRunning: false,
      paused: false,
      mailboxUiConnected: true,
      emailStatusKnown: true,
      hasReadyRows: true,
      hasSendingRows: false,
      noActiveRows: false,
      hasHistoryRows: false,
    }),
    "draft",
  );
  assert.equal(
    resolveProspectCampaignLifecycleStatus({
      activeBatchStatus: "queued",
      queueRunning: true,
      paused: true,
      mailboxUiConnected: true,
      emailStatusKnown: true,
      hasReadyRows: true,
      hasSendingRows: false,
      noActiveRows: false,
      hasHistoryRows: false,
    }),
    "draft",
    "sticky pause on never-started batch must remain Draft",
  );
  assert.equal(PROSPECT_CAMPAIGN_LIFECYCLE_LABELS.running, "Sending");
  assert.equal(
    resolveProspectCampaignLifecycleStatus({
      activeBatchStatus: "running",
      queueRunning: true,
      paused: false,
      mailboxUiConnected: true,
      emailStatusKnown: true,
      hasReadyRows: true,
      hasSendingRows: false,
      noActiveRows: false,
      hasHistoryRows: false,
    }),
    "running",
  );
  assert.equal(
    resolveProspectCampaignLifecycleStatus({
      activeBatchStatus: "paused",
      queueRunning: true,
      paused: true,
      mailboxUiConnected: false,
      emailStatusKnown: true,
      hasReadyRows: true,
      hasSendingRows: false,
      noActiveRows: false,
      hasHistoryRows: false,
    }),
    "blocked",
  );
}

{
  const copy = formatDraftCampaignReadyCopy(44);
  assert.equal(copy.title, "Draft ready to send.");
  assert.equal(copy.readyLine, "44 personalized emails are ready.");
  assert.match(copy.actionLine, /Start Sending/);
  assert.ok(!/paused/i.test(`${copy.title} ${copy.readyLine} ${copy.actionLine}`));
}

{
  assert.deepEqual(
    PROSPECT_CAMPAIGN_STATUS_FILTERS.map((f) => f.id),
    ["all", "queued", "sent", "failed"],
  );
  assert.ok(!PROSPECT_CAMPAIGN_STATUS_FILTERS.some((f) => f.id === "paused"));
  assert.equal(PROSPECT_CAMPAIGN_METRIC_LABELS.queued, "Ready to Send");
  assert.equal(PROSPECT_CAMPAIGN_METRIC_LABELS.sentToday, "Sent");
  assert.ok(!("paused" in PROSPECT_CAMPAIGN_METRIC_LABELS));
}

{
  const { activeItems } = partitionProspectCampaignItems({
    items: [
      item({
        id: "second",
        prospectName: "Second",
        scheduledAt: "2026-08-01T04:40:00.000Z",
        createdAt: "2026-08-01T04:38:14.000Z",
      }),
      item({
        id: "first",
        prospectName: "First",
        scheduledAt: "2026-08-01T04:38:00.000Z",
        createdAt: "2026-08-01T04:38:13.000Z",
      }),
      item({
        id: "third",
        prospectName: "Third",
        scheduledAt: "2026-08-01T04:42:00.000Z",
        createdAt: "2026-08-01T04:38:15.000Z",
      }),
    ],
  });
  assert.deepEqual(
    activeItems.map((r) => r.id),
    ["first", "second", "third"],
    "Top visible row must send first",
  );
}

{
  const queueSrc = readFileSync(
    join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachQueueService.ts"),
    "utf8",
  );
  assert.ok(queueSrc.includes('status: "draft"'));
  assert.ok(queueSrc.includes('queueRunning: false'));
  assert.ok(queueSrc.includes('paused: false'));
  assert.ok(queueSrc.includes('inArray(prospectOutreachBatches.status, ["draft", "queued", "paused"])'));
  assert.ok(queueSrc.includes("asc(prospectOutreachQueueItems.scheduledAt)"));
}

console.log("prospect-campaign-lifecycle-controls.test.ts: ok");
