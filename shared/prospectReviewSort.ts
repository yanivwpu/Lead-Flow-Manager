/**
 * Prospect AI Review work-queue ordering.
 * Actionable / new work first; approved & history below. Newest first within a rank.
 */

export type ProspectReviewSortFields = {
  analysisStatus?: string | null;
  reviewStatus?: string | null;
  outreachStatus?: string | null;
  needsReview?: boolean | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

/**
 * Lower = higher in the Review work queue.
 * 0 analyzing · 1 pending · 2 failed (retry) · 3 needs review · 4 awaiting decision ·
 * 5 approved not sent · 6+ history
 */
export function prospectReviewActionRank(item: ProspectReviewSortFields): number {
  const analysis = String(item.analysisStatus || "pending").toLowerCase();
  const review = String(item.reviewStatus || "pending").toLowerCase();
  const outreach = String(item.outreachStatus || "not_sent").toLowerCase();

  if (analysis === "processing") return 0;
  if (analysis === "pending") return 1;
  if (analysis === "failed") return 2;
  if (review === "needs_review" || item.needsReview === true) return 3;
  if (review === "pending" && analysis === "completed") return 4;
  if (review === "approved" && outreach === "not_sent") return 5;
  if (outreach === "outreach_sent") return 6;
  if (outreach === "replied") return 7;
  return 8;
}

function timeMs(value?: string | Date | null): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const n = Date.parse(String(value));
  return Number.isFinite(n) ? n : 0;
}

/** Prefer createdAt (when sent to Review); fall back to updatedAt. */
export function prospectReviewRecencyMs(item: ProspectReviewSortFields): number {
  return timeMs(item.createdAt) || timeMs(item.updatedAt);
}

/**
 * Comparator for default Review list: actionable ranks ascending, newest first within rank.
 * Returns negative if `a` should appear above `b`.
 */
export function compareProspectReviewActionOrder(
  a: ProspectReviewSortFields,
  b: ProspectReviewSortFields,
): number {
  const rankCmp = prospectReviewActionRank(a) - prospectReviewActionRank(b);
  if (rankCmp !== 0) return rankCmp;
  return prospectReviewRecencyMs(b) - prospectReviewRecencyMs(a);
}
