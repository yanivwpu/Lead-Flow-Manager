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
  | "qualified"
  /** @deprecated Removed from primary chips — kept for older URLs/tests. */
  | "enriching"
  | "needs_attention"
  | "not_qualified";

export type ProspectNeedsAttentionSubFilter =
  | "all"
  | "failed"
  | "missing_website"
  | "missing_email";

/** Primary Review filters only: All · Needs Review · Qualified. */
export const PROSPECT_REVIEW_WORK_FILTER_CHIPS: Array<{
  id: Extract<ProspectReviewWorkFilter, "all" | "needs_review" | "qualified">;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "needs_review", label: "Needs Review" },
  { id: "qualified", label: "Qualified" },
];

/** @deprecated Needs Attention is folded into Needs Review. */
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

/** Row reason badge under Needs Review (and All when not Qualified). */
export type ProspectNeedsReviewBadgeCode =
  | "enriching"
  | "ai_review_failed"
  | "enrichment_failed"
  | "missing_email"
  | "missing_website"
  | "missing_information"
  | "not_qualified"
  | "analyzing"
  | "needs_review";

export type ProspectNeedsReviewBadge = {
  code: ProspectNeedsReviewBadgeCode;
  label: string;
};

/**
 * Clear reason badge for prospects that are not Campaign-ready.
 * Qualified rows return null (Ready to Send — no action badge).
 */
export function resolveProspectNeedsReviewBadge(
  input: ProspectReviewStateInput,
): ProspectNeedsReviewBadge | null {
  if (!isProspectVisibleInReview(input)) return null;
  if (isProspectQualifiedForCampaign(input)) return null;

  if (input.notQualified === true) {
    return { code: "not_qualified", label: "Not Qualified" };
  }

  const analysis = String(input.analysisStatus || "pending").toLowerCase();
  if (analysis === "failed") {
    return { code: "ai_review_failed", label: "AI Review Failed" };
  }
  if (analysis === "processing") {
    return { code: "analyzing", label: "Analyzing…" };
  }

  if (isProspectEnrichmentInProgress(input.enrichmentStatus)) {
    return { code: "enriching", label: "Enriching" };
  }
  if (isProspectEnrichmentFailed(input.enrichmentStatus)) {
    return { code: "enrichment_failed", label: "Enrichment Failed" };
  }

  const attention = resolveProspectNeedsAttentionReason(input);
  if (attention === "missing_email") {
    return { code: "missing_email", label: "Missing Email" };
  }
  if (attention === "missing_website") {
    return { code: "missing_website", label: "Missing Website" };
  }
  if (attention === "qualification_failed") {
    return { code: "ai_review_failed", label: "AI Review Failed" };
  }
  if (attention === "enrichment_failed") {
    return { code: "enrichment_failed", label: "Enrichment Failed" };
  }

  const blocks = listEmailCampaignBlockingReasons(input);
  for (const b of blocks) {
    if (b.code === "missing_email") {
      return { code: "missing_email", label: "Missing Email" };
    }
    if (b.code === "enrichment_incomplete" || b.code === "enrichment_in_progress") {
      if (!doesEnrichmentApply(input) && !prospectHasCampaignContact(input)) {
        return { code: "missing_information", label: "Missing Information" };
      }
      if (b.code === "enrichment_in_progress") {
        return { code: "enriching", label: "Enriching" };
      }
      // Website present but not enriched yet — still actionable Needs Review
      return { code: "needs_review", label: "Needs Review" };
    }
    if (b.code === "qualification_failed") {
      return { code: "ai_review_failed", label: "AI Review Failed" };
    }
    if (b.code === "qualification_incomplete") {
      return { code: "analyzing", label: "Analyzing…" };
    }
  }

  if (isProspectQualificationComplete(input.analysisStatus)) {
    return { code: "needs_review", label: "Needs Review" };
  }

  if (analysis === "pending") {
    return { code: "missing_information", label: "Missing Information" };
  }

  return { code: "missing_information", label: "Missing Information" };
}

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

export type ProspectEligibilityExplanation = {
  ok: boolean;
  /** Machine-stable code for logging / tests. */
  code:
    | "ok"
    | "not_qualified"
    | "in_campaigns"
    | "won"
    | "qualification_failed"
    | "qualification_incomplete"
    | "needs_review_decision"
    | "already_enriched"
    | "enrichment_in_progress"
    | "enrichment_failed"
    | "enrichment_incomplete"
    | "missing_website"
    | "missing_email"
    | "not_approved"
    | "review_not_pending";
  /** Short user-facing reason. */
  message: string;
};

/**
 * Review statuses where Enrich is the human continue/approval action
 * (including Needs Review — that is a state, not a separate decision step).
 */
function isEnrichDecisionReviewStatus(reviewStatus?: string | null): boolean {
  const review = String(reviewStatus || "pending").toLowerCase();
  return review === "pending" || review === "needs_review";
}

/**
 * Exact Enrich block reason — shared by toolbar + detail.
 * Do not invent a second eligibility path.
 *
 * Needs Review is advisory workload state: selecting + Enrich is the approval.
 */
export function explainCanEnrichProspect(
  input: ProspectReviewStateInput,
): ProspectEligibilityExplanation {
  if (input.notQualified === true) {
    return {
      ok: false,
      code: "not_qualified",
      message: "This prospect is marked not qualified.",
    };
  }
  if (isProspectInCampaigns(input)) {
    return {
      ok: false,
      code: "in_campaigns",
      message: "This prospect is already in Campaigns.",
    };
  }
  if (String(input.outcome || "").toLowerCase() === "won") {
    return { ok: false, code: "won", message: "This prospect is already Won." };
  }

  const analysis = String(input.analysisStatus || "").toLowerCase();
  if (analysis === "failed") {
    return {
      ok: false,
      code: "qualification_failed",
      message: "Qualification failed — retry qualification.",
    };
  }
  if (!isProspectQualificationComplete(input.analysisStatus)) {
    return {
      ok: false,
      code: "qualification_incomplete",
      message: "AI Review is still in progress.",
    };
  }

  const review = String(input.reviewStatus || "pending").toLowerCase();

  if (review === "approved") {
    if (isProspectEnrichmentFailed(input.enrichmentStatus)) {
      if (!doesEnrichmentApply(input)) {
        return {
          ok: false,
          code: "missing_website",
          message: "No website available to enrich.",
        };
      }
      return { ok: true, code: "ok", message: "" };
    }
    if (isProspectEnrichmentComplete(input.enrichmentStatus)) {
      return {
        ok: false,
        code: "already_enriched",
        message: "This prospect is already enriched.",
      };
    }
    if (isProspectEnrichmentInProgress(input.enrichmentStatus)) {
      return {
        ok: false,
        code: "enrichment_in_progress",
        message: "Already enriching.",
      };
    }
    // Approved but enrichment not failed — do not re-trigger via Enrich (matches prior gate).
    return {
      ok: false,
      code: "enrichment_in_progress",
      message: "Already enriching.",
    };
  }

  // pending + needs_review: Enrich = human continue → existing approve/enrich pipeline
  if (isEnrichDecisionReviewStatus(review) || input.needsReview === true) {
    if (isProspectEnrichmentComplete(input.enrichmentStatus)) {
      return {
        ok: false,
        code: "already_enriched",
        message: "This prospect is already enriched.",
      };
    }
    if (isProspectEnrichmentInProgress(input.enrichmentStatus)) {
      return {
        ok: false,
        code: "enrichment_in_progress",
        message: "Already enriching.",
      };
    }
    // Website required only when enrichment is the intended next step.
    // No-website + email can still Enrich (approve) to unlock Campaigns.
    if (!doesEnrichmentApply(input) && !prospectHasCampaignContact(input)) {
      return {
        ok: false,
        code: "missing_website",
        message: "No website available to enrich.",
      };
    }
    return { ok: true, code: "ok", message: "" };
  }

  return {
    ok: false,
    code: "review_not_pending",
    message: "This prospect cannot be enriched in its current state.",
  };
}

export function canEnrichProspect(input: ProspectReviewStateInput): boolean {
  return explainCanEnrichProspect(input).ok;
}

/**
 * Advisory only — badges, filters, explanations.
 * Never use as a hard Email campaign gate.
 * Covers missing phone, low confidence, optional fields, weak fit, missing social, etc.
 */
export function needsHumanReview(input: ProspectReviewStateInput): boolean {
  if (input.needsReview === true) return true;
  const review = String(input.reviewStatus || "").toLowerCase();
  return review === "needs_review";
}

export type ProspectEmailCampaignBlockCode =
  | "not_qualified"
  | "in_campaigns"
  | "won"
  | "already_contacted"
  | "qualification_failed"
  | "qualification_incomplete"
  | "enrichment_failed"
  | "enrichment_in_progress"
  | "enrichment_incomplete"
  | "missing_email";

/** Prior outreach already sent or replied — hard campaign blocker. */
export function isProspectAlreadyContactedForCampaign(
  input: ProspectReviewUxInput,
): boolean {
  const outreach = String(input.outreachStatus || "").toLowerCase();
  if (outreach === "replied" || outreach === "outreach_sent") return true;
  if (input.repliedAt || input.outreachSentAt) return true;
  return false;
}

/**
 * True blockers only for Email campaign entry (not advisory needsReview).
 * Used by Review → Qualified AND Send to Campaign (same resolver).
 */
export function listEmailCampaignBlockingReasons(
  input: ProspectReviewStateInput,
): Array<{ code: ProspectEmailCampaignBlockCode; message: string }> {
  const blocks: Array<{ code: ProspectEmailCampaignBlockCode; message: string }> = [];

  if (input.notQualified === true) {
    blocks.push({
      code: "not_qualified",
      message: "Not qualified",
    });
  }
  if (isProspectInCampaigns(input)) {
    blocks.push({
      code: "in_campaigns",
      message: "Already in Campaigns",
    });
  }
  if (String(input.outcome || "").toLowerCase() === "won") {
    blocks.push({ code: "won", message: "Already Won" });
  }
  if (isProspectAlreadyContactedForCampaign(input)) {
    blocks.push({
      code: "already_contacted",
      message: "Already contacted",
    });
  }

  const analysis = String(input.analysisStatus || "").toLowerCase();
  if (analysis === "failed") {
    blocks.push({
      code: "qualification_failed",
      message: "AI Review failed",
    });
  } else if (!isProspectQualificationComplete(input.analysisStatus)) {
    blocks.push({
      code: "qualification_incomplete",
      message: "AI Review is still in progress",
    });
  }

  const enrichment = String(input.enrichmentStatus || "none").toLowerCase();
  const hasEmail = prospectHasCampaignContact(input);
  const enrichmentRequested =
    enrichment === "pending" ||
    enrichment === "enriching" ||
    enrichment === "completed" ||
    enrichment === "failed";

  if (isProspectEnrichmentInProgress(input.enrichmentStatus)) {
    blocks.push({
      code: "enrichment_in_progress",
      message: "Enrichment still in progress",
    });
  } else if (isProspectEnrichmentFailed(input.enrichmentStatus)) {
    // Fatal only when required campaign data is still unavailable.
    if (!hasEmail) {
      blocks.push({
        code: "enrichment_failed",
        message: "Enrichment failed",
      });
    }
  } else if (doesEnrichmentApply(input)) {
    if (enrichmentRequested && !isProspectEnrichmentComplete(input.enrichmentStatus)) {
      blocks.push({
        code: "enrichment_incomplete",
        message: "Enrichment required",
      });
    } else if (!enrichmentRequested && !isProspectEnrichmentComplete(input.enrichmentStatus)) {
      blocks.push({
        code: "enrichment_incomplete",
        message: "Enrich this prospect before sending to Campaigns.",
      });
    }
  }

  if (!hasEmail) {
    blocks.push({
      code: "missing_email",
      message: "Missing email",
    });
  }

  return blocks;
}

/**
 * Hard Email campaign-entry gate (Send to Campaign / Qualified filter).
 * Does not treat needsReview / missing phone as blockers.
 */
export function explainQualifiedForCampaign(
  input: ProspectReviewStateInput,
): ProspectEligibilityExplanation {
  const blocks = listEmailCampaignBlockingReasons(input);
  if (blocks.length === 0) {
    return { ok: true, code: "ok", message: "" };
  }
  const first = blocks[0]!;
  return {
    ok: false,
    code: first.code,
    message: first.message,
  };
}

/** @see explainQualifiedForCampaign */
export function isQualifiedForEmailCampaign(input: ProspectReviewStateInput): boolean {
  return listEmailCampaignBlockingReasons(input).length === 0;
}

/** Alias kept for existing call sites — Email campaign hard gate. */
export function isProspectQualifiedForCampaign(input: ProspectReviewStateInput): boolean {
  return isQualifiedForEmailCampaign(input);
}

/** Summarize why toolbar Enrich / Send are disabled for the current selection. */
export function summarizeSelectionActionAvailability(input: {
  selectedCount: number;
  enrichableCount: number;
  qualifiedCount: number;
  /** First selected row’s enrich explanation (when selectedCount >= 1). */
  firstEnrich?: ProspectEligibilityExplanation | null;
  /** First selected row’s qualified explanation. */
  firstQualified?: ProspectEligibilityExplanation | null;
  /** Counts of non-enrichable / non-qualified with shared reason codes. */
  missingEmailCount?: number;
}): { line: string; reason: string | null } {
  const n = input.selectedCount;
  if (n <= 0) return { line: "0 selected", reason: null };

  const enrichOk = input.enrichableCount > 0;
  const sendOk = input.qualifiedCount > 0;

  if (enrichOk && sendOk) {
    return {
      line: `${n} selected · ${input.enrichableCount} can be enriched · ${input.qualifiedCount} qualified`,
      reason: null,
    };
  }

  if (!enrichOk && !sendOk) {
    // Prefer the Enrich blocker when Send says "enrich first" but Enrich itself is impossible.
    const sendSaysEnrichFirst =
      input.firstQualified?.code === "enrichment_incomplete" ||
      /enrich this prospect/i.test(input.firstQualified?.message || "");
    const reason =
      (sendSaysEnrichFirst && input.firstEnrich && !input.firstEnrich.ok
        ? input.firstEnrich.message
        : null) ||
      input.firstEnrich?.message ||
      input.firstQualified?.message ||
      "Selected prospects are not ready for Enrich or Send.";
    if (n === 1) {
      if (input.firstEnrich && !input.firstEnrich.ok) {
        if (input.firstEnrich.code === "already_enriched" && input.firstQualified?.ok) {
          return { line: `1 selected · Ready for Campaign`, reason: null };
        }
        if (input.firstEnrich.code === "already_enriched") {
          return { line: `1 selected · Enrich unavailable`, reason: null };
        }
        return {
          line: `1 selected · Enrich unavailable`,
          reason: `Reason: ${input.firstEnrich.message}`,
        };
      }
      if (input.firstQualified && !input.firstQualified.ok) {
        return {
          line: `1 selected · Send unavailable`,
          reason: `Reason: ${input.firstQualified.message}`,
        };
      }
      return {
        line: `1 selected · Actions unavailable`,
        reason: `Reason: ${reason}`,
      };
    }
    return {
      line: `${n} selected · 0 can be enriched · 0 qualified`,
      reason: `Reason: ${reason}`,
    };
  }

  if (!sendOk) {
    const missing = input.missingEmailCount ?? 0;
    if (n > 1 && input.qualifiedCount >= 0 && missing > 0) {
      return {
        line: `${n} selected · ${input.qualifiedCount} qualified`,
        reason:
          missing === 1
            ? "1 missing a valid email."
            : `${missing} missing a valid email.`,
      };
    }
    // "Enrich this prospect…" is only honest when Enrich is actually available.
    const q = input.firstQualified;
    const sendSaysEnrichFirst =
      q?.code === "enrichment_incomplete" || /enrich this prospect/i.test(q?.message || "");
    if (sendSaysEnrichFirst && enrichOk) {
      return {
        line: `${n} selected · Send unavailable`,
        reason: `Reason: Enrich this prospect before sending to Campaigns.`,
      };
    }
    if (sendSaysEnrichFirst && !enrichOk && input.firstEnrich && !input.firstEnrich.ok) {
      return {
        line: `${n} selected · Send unavailable`,
        reason: `Reason: ${input.firstEnrich.message}`,
      };
    }
    return {
      line: `${n} selected · Send unavailable`,
      reason: `Reason: ${q?.message || "Not qualified for Campaigns yet."}`,
    };
  }

  if (!enrichOk) {
    // Already enriched is expected once Send is the next step — no "fix it" copy.
    if (input.firstEnrich?.code === "already_enriched") {
      return {
        line: `${n} selected · ${input.qualifiedCount} qualified`,
        reason: null,
      };
    }
    return {
      line: `${n} selected · ${input.qualifiedCount} qualified`,
      reason: `Reason: ${input.firstEnrich?.message || "Enrich unavailable for this selection."}`,
    };
  }

  return { line: `${n} selected`, reason: null };
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

/**
 * Primary filters:
 * - all → every Review-visible prospect
 * - needs_review → not Ready to Send (action needed, in progress, or blocked)
 * - qualified → Ready to Send to Campaign exclusively
 *
 * Deprecated filters (`enriching`, `needs_attention`, `not_qualified`) kept for tests/URLs.
 */
export function matchesProspectReviewWorkFilter(
  input: ProspectReviewStateInput,
  filter: ProspectReviewWorkFilter,
  attentionSub: ProspectNeedsAttentionSubFilter = "all",
): boolean {
  if (!isProspectVisibleInReview(input)) return false;

  if (filter === "all") return true;

  if (filter === "qualified") {
    return isQualifiedForEmailCampaign(input);
  }

  if (filter === "needs_review") {
    return !isQualifiedForEmailCampaign(input);
  }

  // Deprecated primary chips — exact internal state match
  const state = resolveProspectReviewWorkState(input);
  if (filter === "enriching") return state === "enriching";
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
  // Clean enrich success — short, unambiguous (selection is already cleared).
  if (
    action === "enrich" &&
    result.succeeded > 0 &&
    result.skipped === 0 &&
    result.failed === 0 &&
    !result.detail
  ) {
    const n = result.succeeded;
    return `${n} enrichment ${n === 1 ? "job" : "jobs"} started.`;
  }
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
    // Chip-aligned: Needs Review = not Campaign-ready; Qualified = Ready to Send
    if (isQualifiedForEmailCampaign(item)) {
      counts.qualified += 1;
    } else {
      counts.needsReview += 1;
    }
    // Transient / detail breakdowns for assistant progress lines (not primary chips)
    const state = resolveProspectReviewWorkState(item);
    if (state === "enriching") counts.enriching += 1;
    else if (state === "analyzing") counts.analyzing += 1;
    else if (state === "needs_attention") {
      counts.needsAttention += 1;
      const reason = resolveProspectNeedsAttentionReason(item);
      if (reason === "qualification_failed") counts.qualificationFailed += 1;
      else if (reason === "enrichment_failed") counts.enrichmentFailed += 1;
      else if (reason === "missing_website") counts.missingWebsite += 1;
      else if (reason === "missing_email") counts.missingEmail += 1;
    }
  }
  return counts;
}
