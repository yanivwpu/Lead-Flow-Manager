/**
 * Prospect AI Review work-state resolver — presentation only.
 * Single source for filters, assistant counts, Enrich / Qualified eligibility.
 */

import { isValidProspectEmail } from "./prospectContactEnrichment";
import {
  isProspectEnrichmentComplete,
  isProspectEnrichmentFailed,
  isProspectEnrichmentInProgress,
  isProspectQualificationComplete,
  type ProspectReviewUxInput,
} from "./prospectReviewUx";

export type ProspectReviewWorkState =
  | "needs_review"
  | "enriching"
  | "qualified"
  | "needs_attention"
  | "not_qualified"
  | "in_campaigns"
  | "analyzing"
  | "imported";

export type ProspectReviewWorkFilter =
  | "all"
  | "needs_review"
  | "enriching"
  | "qualified"
  | "needs_attention"
  | "not_qualified";

export type ProspectNeedsAttentionSubFilter =
  | "all"
  | "failed"
  | "missing_website"
  | "missing_email";

export const PROSPECT_REVIEW_WORK_FILTER_CHIPS: Array<{
  id: ProspectReviewWorkFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "needs_review", label: "Needs Review" },
  { id: "enriching", label: "Enriching" },
  { id: "qualified", label: "Qualified" },
  { id: "needs_attention", label: "Needs Attention" },
];

export const PROSPECT_NEEDS_ATTENTION_SUB_FILTERS: Array<{
  id: ProspectNeedsAttentionSubFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "failed", label: "Failed" },
  { id: "missing_website", label: "Missing Website" },
  { id: "missing_email", label: "Missing Email" },
];

export const PROSPECT_REVIEW_WORK_STATE_LABELS: Record<ProspectReviewWorkState, string> = {
  needs_review: "Needs Review",
  enriching: "Enriching",
  qualified: "Qualified",
  needs_attention: "Needs Attention",
  not_qualified: "Not Qualified",
  in_campaigns: "Campaigns",
  analyzing: "Analyzing…",
  imported: "Imported",
};

export type ProspectReviewStateInput = ProspectReviewUxInput & {
  email?: string | null;
  websiteUrl?: string | null;
  websiteUrlUsed?: string | null;
  /** Intentional low-fit / dismissed — separate from Needs Attention. */
  notQualified?: boolean | null;
  /** Existing Unified Inbox thread (when known from list payload). */
  hasInboxThread?: boolean | null;
};

export function prospectHasWebsiteUrl(input: {
  websiteUrl?: string | null;
  websiteUrlUsed?: string | null;
}): boolean {
  return Boolean(
    String(input.websiteUrl || "").trim() || String(input.websiteUrlUsed || "").trim(),
  );
}

export function prospectHasCampaignContact(input: { email?: string | null }): boolean {
  return isValidProspectEmail(input.email);
}

/** Successfully transferred into Campaigns (leave Review). */
export function isProspectInCampaigns(input: ProspectReviewUxInput): boolean {
  const queue = String(input.queueStatus || "").toLowerCase();
  return (
    queue === "queued" ||
    queue === "sending" ||
    queue === "paused" ||
    queue === "sent" ||
    queue === "failed"
  );
}

/** Inbox journey: reply/conversation only — not every outreach_sent. */
export function isProspectInInboxJourney(input: ProspectReviewStateInput): boolean {
  const outreach = String(input.outreachStatus || "").toLowerCase();
  if (outreach === "replied" || input.repliedAt) return true;
  if (input.hasInboxThread === true) return true;
  return false;
}

/** Enrichment applies when a website URL exists. */
export function doesEnrichmentApply(input: ProspectReviewStateInput): boolean {
  return prospectHasWebsiteUrl(input);
}

export function canEnrichProspect(input: ProspectReviewStateInput): boolean {
  if (input.notQualified === true) return false;
  if (isProspectInCampaigns(input)) return false;
  if (String(input.outcome || "").toLowerCase() === "won") return false;

  const analysis = String(input.analysisStatus || "").toLowerCase();
  if (analysis === "failed") return false;
  if (!isProspectQualificationComplete(input.analysisStatus)) return false;

  const review = String(input.reviewStatus || "pending").toLowerCase();
  // Match bulk-approve: skip needs_review analysis flag rows
  if (input.needsReview === true || review === "needs_review") return false;

  if (review === "approved") {
    return isProspectEnrichmentFailed(input.enrichmentStatus);
  }

  return review === "pending";
}

export function isProspectQualifiedForCampaign(input: ProspectReviewStateInput): boolean {
  if (input.notQualified === true) return false;
  if (isProspectInCampaigns(input)) return false;
  if (String(input.outcome || "").toLowerCase() === "won") return false;
  if (!isProspectQualificationComplete(input.analysisStatus)) return false;

  const review = String(input.reviewStatus || "").toLowerCase();
  if (review !== "approved") return false;
  if (isProspectEnrichmentFailed(input.enrichmentStatus)) return false;
  if (isProspectEnrichmentInProgress(input.enrichmentStatus)) return false;

  if (doesEnrichmentApply(input)) {
    if (!isProspectEnrichmentComplete(input.enrichmentStatus)) return false;
  }

  if (!prospectHasCampaignContact(input)) return false;
  return true;
}

export type ProspectNeedsAttentionReason =
  | "qualification_failed"
  | "enrichment_failed"
  | "missing_website"
  | "missing_email"
  | null;

/**
 * Fixable problems only. Not Qualified is never Needs Attention.
 *
 * - qualification failed
 * - enrichment failed
 * - missing website when enrichment is required (user trying to enrich / approved with site expected)
 * - missing required campaign contact
 */
export function resolveProspectNeedsAttentionReason(
  input: ProspectReviewStateInput,
): ProspectNeedsAttentionReason {
  if (input.notQualified === true) return null;
  if (isProspectInCampaigns(input)) return null;
  if (String(input.outcome || "").toLowerCase() === "won") return null;

  const analysis = String(input.analysisStatus || "").toLowerCase();
  if (analysis === "failed") return "qualification_failed";

  if (isProspectEnrichmentFailed(input.enrichmentStatus)) return "enrichment_failed";

  const review = String(input.reviewStatus || "").toLowerCase();
  const approved = review === "approved";
  const qualDone = isProspectQualificationComplete(input.analysisStatus);

  if (!qualDone && !approved) return null;

  // Enrichment completed (or N/A) but missing campaign contact
  if (approved) {
    if (doesEnrichmentApply(input)) {
      if (
        isProspectEnrichmentComplete(input.enrichmentStatus) &&
        !prospectHasCampaignContact(input)
      ) {
        return "missing_email";
      }
    } else if (!prospectHasCampaignContact(input)) {
      // No website + insufficient contact → Needs Attention
      return "missing_email";
    }
  }

  // Qualification done, not yet enriched path: no website and no contact
  if (
    !approved &&
    qualDone &&
    !doesEnrichmentApply(input) &&
    !prospectHasCampaignContact(input)
  ) {
    return "missing_email";
  }

  // Approved / enrichable intent but website missing when enrichment was required
  // (enrichment applies is false = no URL — only flag missing_website if they approved
  // and somehow expected enrichment without URL; product: don't block all no-website.
  // missing_website only when URL empty AND enrichment status indicates it was needed
  // and failed for that reason — covered by enrichment_failed above.)
  // Explicit missing_website: approved, enrichment not complete, no URL, has contact
  // → they don't need attention for website; they can be Qualified without enrichment.
  // missing_website: qual done, user would enrich but no website and contact also missing
  // already handled. If approved with no website and enrichment pending stuck: treat as
  // missing_website when enrichment apply was assumed but URL gone.
  if (
    approved &&
    !doesEnrichmentApply(input) &&
    isProspectEnrichmentInProgress(input.enrichmentStatus)
  ) {
    return "missing_website";
  }

  return null;
}

export function resolveProspectReviewWorkState(
  input: ProspectReviewStateInput,
): ProspectReviewWorkState {
  if (String(input.outcome || "").toLowerCase() === "won") return "in_campaigns";
  if (isProspectInCampaigns(input)) return "in_campaigns";
  if (input.notQualified === true) return "not_qualified";

  const attention = resolveProspectNeedsAttentionReason(input);
  if (attention) return "needs_attention";

  if (isProspectQualifiedForCampaign(input)) return "qualified";

  const analysis = String(input.analysisStatus || "pending").toLowerCase();
  if (analysis === "processing") return "analyzing";
  if (analysis === "pending") return "imported";

  const review = String(input.reviewStatus || "pending").toLowerCase();
  if (review === "approved") {
    if (
      isProspectEnrichmentInProgress(input.enrichmentStatus) ||
      (!isProspectEnrichmentComplete(input.enrichmentStatus) &&
        doesEnrichmentApply(input))
    ) {
      return "enriching";
    }
    // No website path already qualified or needs_attention above
    return "enriching";
  }

  if (isProspectQualificationComplete(input.analysisStatus)) return "needs_review";

  return "imported";
}

/** Leave Review only after successful Send to Campaign. */
export function isProspectVisibleInReview(input: ProspectReviewStateInput): boolean {
  if (String(input.outcome || "").toLowerCase() === "won") return false;
  if (isProspectInCampaigns(input)) return false;
  return true;
}

export function matchesProspectReviewWorkFilter(
  input: ProspectReviewStateInput,
  filter: ProspectReviewWorkFilter,
  attentionSub: ProspectNeedsAttentionSubFilter = "all",
): boolean {
  if (!isProspectVisibleInReview(input)) return false;

  const state = resolveProspectReviewWorkState(input);

  if (filter === "all") {
    return (
      state === "needs_review" ||
      state === "enriching" ||
      state === "qualified" ||
      state === "needs_attention" ||
      state === "not_qualified" ||
      state === "analyzing" ||
      state === "imported"
    );
  }

  if (filter === "needs_review") return state === "needs_review";
  if (filter === "enriching") return state === "enriching";
  if (filter === "qualified") return state === "qualified";
  if (filter === "not_qualified") return state === "not_qualified";
  if (filter === "needs_attention") {
    if (state !== "needs_attention") return false;
    if (attentionSub === "all") return true;
    const reason = resolveProspectNeedsAttentionReason(input);
    if (attentionSub === "failed") {
      return reason === "qualification_failed" || reason === "enrichment_failed";
    }
    if (attentionSub === "missing_website") return reason === "missing_website";
    if (attentionSub === "missing_email") return reason === "missing_email";
    return true;
  }
  return false;
}

export type ProspectBulkActionResult = {
  selected: number;
  succeeded: number;
  skipped: number;
  failed: number;
  detail?: string;
};

export function formatProspectBulkActionResult(
  action: "enrich" | "send_to_campaign",
  result: ProspectBulkActionResult,
): string {
  const verb = action === "enrich" ? "enrichment jobs started" : "sent to Campaigns";
  const parts = [`${result.selected} selected`, `${result.succeeded} ${verb}`];
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.detail) parts.push(result.detail);
  return parts.join(" · ");
}

export type ProspectReviewAssistantCounts = {
  needsReview: number;
  enriching: number;
  qualified: number;
  needsAttention: number;
  qualificationFailed: number;
  enrichmentFailed: number;
  missingWebsite: number;
  missingEmail: number;
  analyzing: number;
};

export function countProspectReviewWorkStates(
  items: ProspectReviewStateInput[],
): ProspectReviewAssistantCounts {
  const counts: ProspectReviewAssistantCounts = {
    needsReview: 0,
    enriching: 0,
    qualified: 0,
    needsAttention: 0,
    qualificationFailed: 0,
    enrichmentFailed: 0,
    missingWebsite: 0,
    missingEmail: 0,
    analyzing: 0,
  };
  for (const item of items) {
    if (!isProspectVisibleInReview(item)) continue;
    const state = resolveProspectReviewWorkState(item);
    if (state === "needs_review") counts.needsReview += 1;
    else if (state === "enriching") counts.enriching += 1;
    else if (state === "qualified") counts.qualified += 1;
    else if (state === "needs_attention") {
      counts.needsAttention += 1;
      const reason = resolveProspectNeedsAttentionReason(item);
      if (reason === "qualification_failed") counts.qualificationFailed += 1;
      else if (reason === "enrichment_failed") counts.enrichmentFailed += 1;
      else if (reason === "missing_website") counts.missingWebsite += 1;
      else if (reason === "missing_email") counts.missingEmail += 1;
    } else if (state === "analyzing") counts.analyzing += 1;
  }
  return counts;
}
