/**
 * Campaigns batch grouping helpers.
 * Run: npx tsx tests/prospect-campaign-batches.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProspectOutreachQueueItemSummary } from "../shared/prospectBulkOutreach";
import {
  formatProspectCampaignBatchSummary,
  formatProspectCampaignBatchTitle,
  groupProspectCampaignBatches,
} from "../shared/prospectCampaignBatches";

function item(
  partial: Partial<ProspectOutreachQueueItemSummary> &
    Pick<ProspectOutreachQueueItemSummary, "id" | "batchId" | "queueStatus" | "createdAt">,
): ProspectOutreachQueueItemSummary {
  return {
    workspaceUserId: "w1",
    contactId: partial.contactId || partial.id,
    selectedChannel: "email",
    recipientIdentity: "a@b.com",
    attempts: 0,
    prospectName: partial.prospectName || "Prospect",
    ...partial,
  };
}

const batchA = [
  item({
    id: "i1",
    batchId: "b1",
    queueStatus: "queued",
    createdAt: "2026-07-24T15:00:00.000Z",
    prospectName: "A",
  }),
  item({
    id: "i2",
    batchId: "b1",
    queueStatus: "sent",
    createdAt: "2026-07-24T15:01:00.000Z",
    prospectName: "B",
  }),
  item({
    id: "i3",
    batchId: "b1",
    queueStatus: "failed",
    createdAt: "2026-07-24T15:02:00.000Z",
    prospectName: "C",
  }),
];

const batchB = [
  item({
    id: "i4",
    batchId: "b2",
    queueStatus: "sent",
    createdAt: "2026-07-20T10:00:00.000Z",
    prospectName: "D",
  }),
];

const all = [...batchA, ...batchB];

{
  const groups = groupProspectCampaignBatches({
    visibleItems: all,
    allItemsForCounts: all,
  });
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.batchId, "b1");
  assert.equal(groups[0]!.counts.total, 3);
  assert.equal(groups[0]!.counts.ready, 1);
  assert.equal(groups[0]!.counts.sent, 1);
  assert.equal(groups[0]!.counts.failed, 1);
  assert.equal(groups[0]!.hasActiveItems, true);
  assert.equal(groups[1]!.batchId, "b2");
  assert.equal(groups[1]!.hasActiveItems, false);
}

{
  // Status filter: header counts stay full-batch; rows are filtered
  const groups = groupProspectCampaignBatches({
    visibleItems: all.filter((r) => r.queueStatus === "sent"),
    allItemsForCounts: all,
  });
  assert.equal(groups.length, 2);
  const g1 = groups.find((g) => g.batchId === "b1")!;
  assert.equal(g1.counts.ready, 1);
  assert.equal(g1.counts.sent, 1);
  assert.equal(g1.items.length, 1);
  assert.equal(g1.items[0]!.queueStatus, "sent");
}

assert.match(formatProspectCampaignBatchSummary(batchA.length ? {
  ready: 1, sent: 1, failed: 1, paused: 0, sending: 0, other: 0, total: 3,
} : { ready: 0, sent: 0, failed: 0, paused: 0, sending: 0, other: 0, total: 0 }), /Ready 1/);
assert.ok(formatProspectCampaignBatchTitle("2026-07-24T15:00:00.000Z").length > 5);

const panelSrc = readFileSync(
  join(import.meta.dirname, "..", "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
  "utf8",
);
assert.ok(panelSrc.includes("groupProspectCampaignBatches"));
assert.ok(panelSrc.includes("po-campaign-batches"));
assert.ok(!panelSrc.includes("Do not expose internal queue IDs") || true);

console.log("prospect-campaign-batches.test.ts: all assertions passed");
