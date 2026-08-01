/**
 * Campaigns UI: active sending vs collapsible send-history batches.
 * Presentation only — uses existing batchId on queue items.
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
  /** Earliest sentAt / createdAt in the batch — human-friendly send-run time. */
  transferredAt: string;
  counts: ProspectCampaignBatchStatusCounts;
  /** Sent (history) items matching the current status filter. */
  items: ProspectOutreachQueueItemSummary[];
  /** @deprecated History batches never have active items; kept for callers. */
  hasActiveItems: boolean;
};

const ACTIVE_STATUSES = new Set(["queued", "sending", "failed", "paused"]);

/** Ready / Sending / Failed / Paused — flat actionable list. */
export function isProspectCampaignActiveItem(
  item: Pick<ProspectOutreachQueueItemSummary, "queueStatus">,
): boolean {
  return ACTIVE_STATUSES.has(String(item.queueStatus || "").toLowerCase());
}

/**
 * Actually sent outreach — collapsible campaign history only.
 * Includes synthetic inbox_outreach historical rows (status sent).
 */
export function isProspectCampaignHistoryItem(
  item: Pick<ProspectOutreachQueueItemSummary, "queueStatus" | "historySource">,
): boolean {
  if (item.historySource === "inbox_outreach") return true;
  return String(item.queueStatus || "").toLowerCase() === "sent";
}

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
 * Partition Campaigns list into active workflow rows vs sent history.
 * Ready/unsent never appear in history batches.
 */
export function partitionProspectCampaignItems(params: {
  items: ProspectOutreachQueueItemSummary[];
}): {
  activeItems: ProspectOutreachQueueItemSummary[];
  historyItems: ProspectOutreachQueueItemSummary[];
} {
  const activeItems: ProspectOutreachQueueItemSummary[] = [];
  const historyItems: ProspectOutreachQueueItemSummary[] = [];
  for (const item of params.items) {
    if (isProspectCampaignHistoryItem(item)) {
      historyItems.push(item);
    } else if (isProspectCampaignActiveItem(item)) {
      activeItems.push(item);
    }
    // cancelled / skipped / unknown — omit from both (not actionable, not sent history)
  }
  // Top of list = first to send (scheduledAt ASC). Must match worker claim order.
  activeItems.sort((a, b) => {
    const aSched = String(a.scheduledAt || a.createdAt || "");
    const bSched = String(b.scheduledAt || b.createdAt || "");
    const bySched = aSched.localeCompare(bSched);
    if (bySched !== 0) return bySched;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
  historyItems.sort((a, b) => {
    const at = a.sentAt || a.createdAt || "";
    const bt = b.sentAt || b.createdAt || "";
    return String(bt).localeCompare(String(at));
  });
  return { activeItems, historyItems };
}

/**
 * Group *sent* history items by batchId for collapsible Campaign History.
 * Do not pass Ready/Sending/Failed/Paused items here.
 */
export function groupProspectCampaignBatches(params: {
  /** History items to show inside expanded batches (already status-filtered if needed). */
  visibleItems: ProspectOutreachQueueItemSummary[];
  /** Full unfiltered history set for accurate Sent header counts. */
  allItemsForCounts: ProspectOutreachQueueItemSummary[];
}): ProspectCampaignBatchGroup[] {
  const historyForCounts = params.allItemsForCounts.filter(isProspectCampaignHistoryItem);
  const visibleHistory = params.visibleItems.filter(isProspectCampaignHistoryItem);

  const countByBatch = new Map<string, ProspectCampaignBatchStatusCounts>();
  const transferredAtByBatch = new Map<string, string>();

  for (const item of historyForCounts) {
    const id = item.batchId || item.id;
    let counts = countByBatch.get(id);
    if (!counts) {
      counts = emptyCounts();
      countByBatch.set(id, counts);
    }
    bumpCount(counts, String(item.queueStatus || "sent"));
    const stamp = item.sentAt || item.createdAt || "";
    const prev = transferredAtByBatch.get(id);
    if (!prev || (stamp && stamp < prev)) {
      transferredAtByBatch.set(id, stamp || prev || new Date(0).toISOString());
    }
  }

  const itemsByBatch = new Map<string, ProspectOutreachQueueItemSummary[]>();
  for (const item of visibleHistory) {
    const id = item.batchId || item.id;
    const list = itemsByBatch.get(id) || [];
    list.push(item);
    itemsByBatch.set(id, list);
  }

  const groups: ProspectCampaignBatchGroup[] = [];
  for (const batchId of itemsByBatch.keys()) {
    const counts = countByBatch.get(batchId) || emptyCounts();
    const items = (itemsByBatch.get(batchId) || []).slice().sort((a, b) => {
      const at = a.sentAt || a.createdAt || "";
      const bt = b.sentAt || b.createdAt || "";
      return String(bt).localeCompare(String(at));
    });
    groups.push({
      batchId,
      transferredAt: transferredAtByBatch.get(batchId) || items[0]?.sentAt || items[0]?.createdAt || "",
      counts,
      items,
      hasActiveItems: false,
    });
  }

  groups.sort((a, b) => String(b.transferredAt).localeCompare(String(a.transferredAt)));
  return groups;
}

/** Human-friendly batch title — date/time, no internal IDs. */
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
  // History batches are sent-first; omit Ready/Sending/Paused noise.
  if (counts.sent > 0) parts.push(`Sent ${counts.sent}`);
  if (counts.failed > 0) parts.push(`Failed ${counts.failed}`);
  if (counts.other > 0) parts.push(`Other ${counts.other}`);
  if (counts.ready > 0) parts.push(`Ready ${counts.ready}`);
  if (counts.sending > 0) parts.push(`Sending ${counts.sending}`);
  if (counts.paused > 0) parts.push(`Paused ${counts.paused}`);
  return parts.join(" · ") || `${counts.total} prospects`;
}
