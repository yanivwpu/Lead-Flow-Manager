/**
 * Campaigns UI batch grouping — presentation only.
 * Uses existing prospect_outreach_batches.id (batchId on every queue item).
 * No schema migration required.
 */

import type { ProspectOutreachQueueItemSummary } from "./prospectBulkOutreach";

export type ProspectCampaignBatchStatusCounts = {
  ready: number;
  sent: number;
  failed: number;
  paused: number;
  sending: number;
  other: number;
  total: number;
};

export type ProspectCampaignBatchGroup = {
  batchId: string;
  /** Earliest item createdAt in the batch — human-friendly transfer time. */
  transferredAt: string;
  counts: ProspectCampaignBatchStatusCounts;
  /** Items matching the current status filter (or all when filter is all). */
  items: ProspectOutreachQueueItemSummary[];
  /** True when any item is still active (ready/sending/paused). */
  hasActiveItems: boolean;
};

function emptyCounts(): ProspectCampaignBatchStatusCounts {
  return { ready: 0, sent: 0, failed: 0, paused: 0, sending: 0, other: 0, total: 0 };
}

function bumpCount(
  counts: ProspectCampaignBatchStatusCounts,
  status: string,
): void {
  counts.total += 1;
  switch (status) {
    case "queued":
      counts.ready += 1;
      break;
    case "sent":
      counts.sent += 1;
      break;
    case "failed":
      counts.failed += 1;
      break;
    case "paused":
      counts.paused += 1;
      break;
    case "sending":
      counts.sending += 1;
      break;
    default:
      counts.other += 1;
      break;
  }
}

/**
 * Group queue items by batchId.
 * Status filter only affects which rows are listed inside a batch;
 * header counts always reflect the full batch (pass `allItemsForCounts`).
 */
export function groupProspectCampaignBatches(params: {
  /** Items to show inside expanded batches (already status-filtered if needed). */
  visibleItems: ProspectOutreachQueueItemSummary[];
  /** Full unfiltered set for accurate Ready/Sent/Failed header counts. */
  allItemsForCounts: ProspectOutreachQueueItemSummary[];
}): ProspectCampaignBatchGroup[] {
  const countByBatch = new Map<string, ProspectCampaignBatchStatusCounts>();
  const transferredAtByBatch = new Map<string, string>();

  for (const item of params.allItemsForCounts) {
    const id = item.batchId || item.id;
    let counts = countByBatch.get(id);
    if (!counts) {
      counts = emptyCounts();
      countByBatch.set(id, counts);
    }
    bumpCount(counts, String(item.queueStatus || ""));
    const created = item.createdAt || "";
    const prev = transferredAtByBatch.get(id);
    if (!prev || (created && created < prev)) {
      transferredAtByBatch.set(id, created || prev || new Date(0).toISOString());
    }
  }

  const itemsByBatch = new Map<string, ProspectOutreachQueueItemSummary[]>();
  for (const item of params.visibleItems) {
    const id = item.batchId || item.id;
    const list = itemsByBatch.get(id) || [];
    list.push(item);
    itemsByBatch.set(id, list);
  }

  // Include batches that have visible rows; if filter hides all rows of a batch, omit it.
  const batchIds = new Set<string>([
    ...itemsByBatch.keys(),
  ]);

  const groups: ProspectCampaignBatchGroup[] = [];
  for (const batchId of batchIds) {
    const counts = countByBatch.get(batchId) || emptyCounts();
    const items = (itemsByBatch.get(batchId) || []).slice().sort((a, b) => {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    groups.push({
      batchId,
      transferredAt: transferredAtByBatch.get(batchId) || items[0]?.createdAt || "",
      counts,
      items,
      hasActiveItems:
        counts.ready > 0 || counts.sending > 0 || counts.paused > 0,
    });
  }

  groups.sort((a, b) => String(b.transferredAt).localeCompare(String(a.transferredAt)));
  return groups;
}

/** Human-friendly batch title — date only, no internal IDs. */
export function formatProspectCampaignBatchTitle(transferredAt: string): string {
  const d = transferredAt ? new Date(transferredAt) : null;
  if (!d || Number.isNaN(d.getTime())) return "Campaign batch";
  return d.toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatProspectCampaignBatchSummary(
  counts: ProspectCampaignBatchStatusCounts,
): string {
  const parts: string[] = [];
  if (counts.ready > 0) parts.push(`Ready ${counts.ready}`);
  if (counts.sending > 0) parts.push(`Sending ${counts.sending}`);
  if (counts.sent > 0) parts.push(`Sent ${counts.sent}`);
  if (counts.failed > 0) parts.push(`Failed ${counts.failed}`);
  if (counts.paused > 0) parts.push(`Paused ${counts.paused}`);
  if (counts.other > 0) parts.push(`Other ${counts.other}`);
  return parts.join(" · ") || `${counts.total} prospects`;
}
