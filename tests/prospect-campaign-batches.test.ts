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
  isProspectCampaignActiveItem,
  isProspectCampaignHistoryItem,
  partitionProspectCampaignItems,
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
    prospectName: "ADMEN",
  }),
  item({
    id: "i2",
    batchId: "b1",
    queueStatus: "sent",
    createdAt: "2026-07-24T15:01:00.000Z",
    sentAt: "2026-07-24T15:05:00.000Z",
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
    sentAt: "2026-07-20T10:05:00.000Z",
    prospectName: "D",
  }),
];

const all = [...batchA, ...batchB];

{
  assert.equal(isProspectCampaignActiveItem(batchA[0]!), true);
  assert.equal(isProspectCampaignHistoryItem(batchA[0]!), false);
  assert.equal(isProspectCampaignHistoryItem(batchA[1]!), true);
  assert.equal(isProspectCampaignActiveItem(batchA[2]!), true);
}

{
  const { activeItems, historyItems } = partitionProspectCampaignItems({ items: all });
  assert.equal(activeItems.length, 2);
  assert.ok(activeItems.some((r) => r.prospectName === "ADMEN"));
  assert.ok(activeItems.some((r) => r.prospectName === "C"));
  assert.equal(historyItems.length, 2);
  assert.ok(historyItems.every((r) => r.queueStatus === "sent"));
  assert.ok(!historyItems.some((r) => r.prospectName === "ADMEN"));
}

{
  const { historyItems } = partitionProspectCampaignItems({ items: all });
  const groups = groupProspectCampaignBatches({
    visibleItems: historyItems,
    allItemsForCounts: historyItems,
  });
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.batchId, "b1");
  assert.equal(groups[0]!.counts.total, 1);
  assert.equal(groups[0]!.counts.sent, 1);
  assert.equal(groups[0]!.counts.ready, 0);
  assert.equal(groups[0]!.items.length, 1);
  assert.equal(groups[0]!.items[0]!.prospectName, "B");
  assert.equal(groups[0]!.hasActiveItems, false);
  assert.equal(groups[1]!.batchId, "b2");
}

{
  // Ready items must never leak into history grouping even if passed accidentally
  const groups = groupProspectCampaignBatches({
    visibleItems: all,
    allItemsForCounts: all,
  });
  assert.ok(groups.every((g) => g.items.every((r) => r.queueStatus === "sent")));
  assert.ok(!groups.some((g) => g.items.some((r) => r.prospectName === "ADMEN")));
}

assert.match(
  formatProspectCampaignBatchSummary({
    ready: 0,
    sent: 2,
    failed: 0,
    paused: 0,
    sending: 0,
    other: 0,
    total: 2,
  }),
  /Sent 2/,
);
assert.ok(formatProspectCampaignBatchTitle("2026-07-24T15:00:00.000Z").length > 5);

const panelSrc = readFileSync(
  join(import.meta.dirname, "..", "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
  "utf8",
);
assert.ok(panelSrc.includes("partitionProspectCampaignItems"));
assert.ok(panelSrc.includes("po-campaign-active"));
assert.ok(panelSrc.includes("po-campaign-history"));
assert.ok(panelSrc.includes("groupProspectCampaignBatches"));

console.log("prospect-campaign-batches.test.ts: all assertions passed");
