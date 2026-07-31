/**
 * Prospect AI Review work-state resolver — presentation only.
 * Single source for filters, assistant counts, Enrich / Qualified eligibility.
 */

import { isValidProspectEmail } from "./prospectContactEnrichment";
import {
  hasTraceableProspectCampaignHistory,
  hasTraceableProspectInboxThread,
  hasTraceableProspectOutreachSend,
} from "./prospectTraceableOutreach";
import {
  isProspectEnrichmentComplete,
  isProspectEnrichmentFailed,
  isProspectEnrichmentInProgress,
  isProspectQualificationComplete,
  type ProspectReviewUxInput,
} from "./prospectReviewUx";
import {
  prospectHasOfficialWebsiteUrl,
  prospectWebsiteIsSocialOnly,
  readEnrichmentFailureClass,
  resolveMissingEmailDetail,
  resolveProspectEnrichmentOutcomeClass,
} from "./prospectEnrichmentOutcome";
import { classifyProspectWebsiteUrl } from "./prospectWebsiteClassification";
import {
  discoveryAttentionLabel,
  isUsableNeedsAttentionReason,
} from "./prospectAiDiscoveryQuality";
import { userFacingProspectAiReviewError } from "./prospectAiReviewErrors";

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

/** Primary Review filters: All · Needs Review · Qualified · Not Qualified. */
export const PROSPECT_REVIEW_WORK_FILTER_CHIPS: Array<{
  id: Extract<
    ProspectReviewWorkFilter,
    "all" | "needs_review" | "qualified" | "not_qualified"
  >;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "needs_review", label: "Needs Review" },
  { id: "qualified", label: "Qualified" },
  { id: "not_qualified", label: "Not Qualified" },
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
  | "needs_review"
  | "discovery_attention";

export type ProspectNeedsReviewBadge = {
  code: ProspectNeedsReviewBadgeCode;
  label: string;
};

/**
 * Clear reason badge for prospects that still need action under Needs Review.
 * Qualified and Not Qualified rows return null (they have their own primary filters).
 */
export function resolveProspectNeedsReviewBadge(
  input: ProspectReviewStateInput,
): ProspectNeedsReviewBadge | null {
  if (!isProspectVisibleInReview(input)) return null;
  if (isProspectExplicitlyNotQualified(input)) return null;
  // Qualified decision rows keep campaign-ready null; still show enriching / missing email.
  if (isProspectDecisionQualified(input) && isProspectQualifiedForCampaign(input)) {
    return null;
  }

  const analysis = String(input.analysisStatus || "pending").toLowerCase();
  if (analysis === "failed") {
    return { code: "ai_review_failed", label: "AI Review Failed" };
  }
  if (analysis === "processing") {
    return { code: "analyzing", label: "Reviewing" };
  }

  if (isProspectEnrichmentInProgress(input.enrichmentStatus)) {
    return { code: "enriching", label: "Enriching" };
  }
  if (isProspectEnrichmentFailed(input.enrichmentStatus)) {
    return { code: "enrichment_failed", label: "Website lookup failed" };
  }

  const discoveryReason = String(input.discoveryAttentionReason || "").trim();
  if (isUsableNeedsAttentionReason(discoveryReason) && !isProspectDecisionQualified(input)) {
    return {
      code: "discovery_attention",
      label: discoveryAttentionLabel(discoveryReason),
    };
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
    return { code: "enrichment_failed", label: "Website lookup failed" };
  }

  if (isProspectDecisionQualified(input)) {
    if (!prospectHasCampaignContact(input)) {
      return { code: "missing_email", label: "Missing Email" };
    }
    return null;
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
      return { code: "needs_review", label: "Needs Review" };
    }
    if (b.code === "qualification_failed") {
      return { code: "ai_review_failed", label: "AI Review Failed" };
    }
    if (b.code === "qualification_incomplete") {
      return { code: "analyzing", label: "Reviewing" };
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
  enrichmentEmailFound?: boolean | null;
  enrichmentErrorMessage?: string | null;
  enrichmentResult?: Record<string, unknown> | null;
  enrichmentTriggeredBy?: string | null;
  /** Human Approve / Qualified timestamp (legacy-compatible). */
  approvedAt?: string | Date | null;
  approvedByUserId?: string | null;
  /** Intentional low-fit / dismissed — separate from Needs Attention. */
  notQualified?: boolean | null;
  /** Existing Unified Inbox thread (when known from list payload). */
  hasInboxThread?: boolean | null;
  /** Discovery attention reason carried into Review (customFields.prospectAi). */
  discoveryAttentionReason?: string | null;
};

/** Detail line under Needs Review badges (friendly, never technical). */
export function resolveProspectNeedsReviewBadgeDetail(
  input: ProspectReviewStateInput,
  badge: ProspectNeedsReviewBadge | null,
): string | null {
  if (!badge) return null;
  if (badge.code === "ai_review_failed") {
    return userFacingProspectAiReviewError(input.errorMessage);
  }
  if (
    badge.code === "missing_email" ||
    badge.code === "enrichment_failed" ||
    badge.code === "missing_website"
  ) {
    return resolveMissingEmailDetail(input)?.reason ?? null;
  }
  if (badge.code === "discovery_attention") {
    return "Resolve in Review — edit category, website, or details as needed.";
  }
  return null;
}

/**
 * Evidence of an explicit Qualified/approved decision (current or legacy).
 * Enrichment/email alone is never enough.
 * `enrichmentTriggeredBy=approve` is not sufficient alone — human Needs Review /
 * Not Qualified clears approvedAt so later overrides stick.
 */
export function hasLegacyProspectApprovalEvidence(
  input: Pick<
    ProspectReviewStateInput,
    "reviewStatus" | "approvedAt" | "approvedByUserId" | "enrichmentTriggeredBy"
  >,
): boolean {
  const review = String(input.reviewStatus || "").toLowerCase();
  if (review === "approved" || review === "qualified") return true;
  if (input.approvedAt) return true;
  if (input.approvedByUserId) return true;
  return false;
}

/**
 * Explicit Not Qualified for filters/work-state.
 * AI `not_a_fit` alone qualifies when there is no human/legacy approval evidence.
 * If approval evidence remains, human Approve wins over a later AI not_a_fit overwrite.
 * Human Not Qualified clears approval evidence so rejection sticks.
 */
export function isProspectExplicitlyNotQualified(input: ProspectReviewStateInput): boolean {
  if (input.notQualified !== true) return false;
  if (hasLegacyProspectApprovalEvidence(input)) return false;
  return true;
}

/**
 * Human (or Enrich-approve) Qualified decision — independent of campaign/email readiness.
 * Precedence: human/legacy approval > AI not_a_fit > undecided.
 */
export function isProspectDecisionQualified(input: ProspectReviewStateInput): boolean {
  if (isProspectExplicitlyNotQualified(input)) return false;
  return hasLegacyProspectApprovalEvidence(input);
}

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

/** Successfully transferred into Campaigns / has findable campaign history. */
export function isProspectInCampaigns(input: ProspectReviewUxInput): boolean {
  return hasTraceableProspectCampaignHistory(input);
}

/** Inbox journey: real conversation/thread only — not stale outreach_sent alone. */
export function isProspectInInboxJourney(input: ProspectReviewStateInput): boolean {
  return hasTraceableProspectInboxThread(input);
}

/** Enrichment applies when an official (non-social) website URL exists. */
export function doesEnrichmentApply(input: ProspectReviewStateInput): boolean {
  return prospectHasOfficialWebsiteUrl(input);
}

export function prospectEnrichmentHadPriorAttempt(input: ProspectReviewStateInput): boolean {
  const s = String(input.enrichmentStatus || "none").toLowerCase();
  return s === "completed" || s === "failed" || s === "cancelled";
}

export function prospectEnrichmentEmailSatisfied(input: ProspectReviewStateInput): boolean {
  return input.enrichmentEmailFound === true || prospectHasCampaignContact(input);
}

/**
 * Retry Enrichment when prior attempt failed, or completed without email and an
 * official website is available. Social-only / no-website → not retryable.
 */
export function isProspectEnrichmentRetryable(input: ProspectReviewStateInput): boolean {
  if (isProspectExplicitlyNotQualified(input)) return false;
  if (isProspectInCampaigns(input)) return false;
  if (isProspectEnrichmentInProgress(input.enrichmentStatus)) return false;
  if (!doesEnrichmentApply(input)) return false;
  if (prospectEnrichmentEmailSatisfied(input) && isProspectEnrichmentComplete(input.enrichmentStatus)) {
    return false;
  }
  // Permanent: no official website / social-only — edit website instead of retrying.
  const failure = readEnrichmentFailureClass(input);
  if (failure === "no_website" || failure === "social_profile_only") return false;
  const detail = resolveMissingEmailDetail(input);
  if (detail && detail.canRetry === false && (detail.code === "no_website" || detail.code === "social_profile_only")) {
    return false;
  }
  const status = String(input.enrichmentStatus || "none").toLowerCase();
  if (status === "failed") {
    // Temporary website/provider failures are retryable.
    return (
      failure == null ||
      failure === "website_timeout" ||
      failure === "website_fetch_failed" ||
      failure === "all_pages_failed"
    );
  }
  if (status === "completed" && !prospectEnrichmentEmailSatisfied(input)) return true;
  // Legacy false-completed (all pages failed) treated as retryable via outcome helpers.
  const outcome = resolveProspectEnrichmentOutcomeClass(input);
  return (
    outcome === "failed_timeout" ||
    outcome === "failed_fetch" ||
    outcome === "completed_no_email"
  );
}

export function enrichActionLabel(input: ProspectReviewStateInput): "Enrich" | "Retry Enrichment" {
  if (isProspectEnrichmentRetryable(input) || prospectEnrichmentHadPriorAttempt(input)) {
    if (isProspectEnrichmentComplete(input.enrichmentStatus) && prospectEnrichmentEmailSatisfied(input)) {
      return "Enrich";
    }
    if (
      isProspectEnrichmentFailed(input.enrichmentStatus) ||
      (isProspectEnrichmentComplete(input.enrichmentStatus) && !prospectEnrichmentEmailSatisfied(input))
    ) {
      return "Retry Enrichment";
    }
  }
  return "Enrich";
}

export type ProspectEligibilityExplanation = {
  ok: boolean;
  /** Machine-stable code for logging / tests. */
  code:
    | "ok"
    | "not_qualified"
    | "in_campaigns"
    | "won"
    | "already_contacted"
    | "qualification_failed"
    | "qualification_incomplete"
    | "needs_review_decision"
    | "already_enriched"
    | "email_added"
    | "enrichment_in_progress"
    | "enrichment_failed"
    | "enrichment_incomplete"
    | "missing_website"
    | "social_profile_only"
    | "missing_email"
    | "not_approved"
    | "review_not_pending"
    | "retry_available";
  /** Short user-facing reason. */
  message: string;
};

/** True website enrichment completed — not merely a manual email on the contact. */
export function wasProspectWebsiteEnriched(input: ProspectReviewStateInput): boolean {
  if (!isProspectEnrichmentComplete(input.enrichmentStatus)) return false;
  if (input.enrichmentEmailFound === true) return true;
  if (String(input.websiteUrlUsed || "").trim()) return true;
  const result = input.enrichmentResult;
  if (result && typeof result === "object" && Object.keys(result).length > 0) return true;
  return false;
}

/**
 * Disabled Enrich control label — never show "Enriched" for manual-email-only.
 */
export function enrichDisabledActionLabel(input: ProspectReviewStateInput): string {
  const ex = explainCanEnrichProspect(input);
  if (ex.ok) return enrichActionLabel(input);
  switch (ex.code) {
    case "already_enriched":
      return "Enriched";
    case "email_added":
      return "Email Added";
    case "enrichment_in_progress":
      return "Enriching…";
    case "missing_website":
      return "No website";
    case "social_profile_only":
      return "Social profile only";
    case "not_qualified":
      return "Not Qualified";
    default:
      return enrichActionLabel(input);
  }
}

/**
 * Review statuses where Enrich is the human continue/approval action
 * (including Needs Review — that is a state, not a separate decision step).
 */
function isEnrichDecisionReviewStatus(reviewStatus?: string | null): boolean {
  const review = String(reviewStatus || "pending").toLowerCase();
  return review === "pending" || review === "needs_review";
}

function explainEnrichBlockedByWebsite(input: ProspectReviewStateInput): ProspectEligibilityExplanation {
  if (prospectWebsiteIsSocialOnly(input) || classifyProspectWebsiteUrl(input.websiteUrl || input.websiteUrlUsed) === "social") {
    return {
      ok: false,
      code: "social_profile_only",
      message: "Social profile only — add an official website to enrich.",
    };
  }
  return {
    ok: false,
    code: "missing_website",
    message: "No website available to enrich.",
  };
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
  if (isProspectExplicitlyNotQualified(input)) {
    return {
      ok: false,
      code: "not_qualified",
      message: "Mark as Qualified to enrich.",
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

  if (isProspectEnrichmentInProgress(input.enrichmentStatus)) {
    return {
      ok: false,
      code: "enrichment_in_progress",
      message: "Already enriching.",
    };
  }

  const review = String(input.reviewStatus || "pending").toLowerCase();

  // Completed with email found → permanently enriched for Enrich action.
  if (
    isProspectEnrichmentComplete(input.enrichmentStatus) &&
    prospectEnrichmentEmailSatisfied(input)
  ) {
    return {
      ok: false,
      code: "already_enriched",
      message: "This prospect is already enriched.",
    };
  }

  // Failed or completed-without-email + official website → Retry Enrichment.
  if (isProspectEnrichmentRetryable(input)) {
    return { ok: true, code: "retry_available", message: "" };
  }

  // Failed / completed empty without official website.
  if (
    isProspectEnrichmentFailed(input.enrichmentStatus) ||
    (isProspectEnrichmentComplete(input.enrichmentStatus) && !prospectEnrichmentEmailSatisfied(input))
  ) {
    return explainEnrichBlockedByWebsite(input);
  }

  if (review === "approved") {
    // Approved but enrichment not started — only Enrich when website applies or email exists.
    if (!doesEnrichmentApply(input) && !prospectHasCampaignContact(input)) {
      return explainEnrichBlockedByWebsite(input);
    }
    if (!doesEnrichmentApply(input) && prospectHasCampaignContact(input)) {
      // Manual/discovery email present, no official website — not website-enriched.
      return {
        ok: false,
        code: "email_added",
        message: "Email already on file — no official website to enrich.",
      };
    }
    // Approved + none/cancelled with website → Enrich once.
    return { ok: true, code: "ok", message: "" };
  }

  // pending + needs_review: Enrich = human continue → existing approve/enrich pipeline
  if (isEnrichDecisionReviewStatus(review) || input.needsReview === true) {
    // Website required only when enrichment is the intended next step.
    // No-website + email can still Enrich (approve) to unlock Campaigns.
    if (!doesEnrichmentApply(input) && !prospectHasCampaignContact(input)) {
      return explainEnrichBlockedByWebsite(input);
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
  | "not_approved"
  | "in_campaigns"
  | "won"
  | "already_contacted"
  | "qualification_failed"
  | "qualification_incomplete"
  | "enrichment_failed"
  | "enrichment_in_progress"
  | "enrichment_incomplete"
  | "missing_email";

/** Prior outreach already sent — hard campaign blocker (traceable artifacts only). */
export function isProspectAlreadyContactedForCampaign(
  input: ProspectReviewStateInput,
): boolean {
  return hasTraceableProspectOutreachSend(input);
}

/**
 * True blockers only for Email campaign entry (not advisory needsReview).
 * Human Qualified decision is required; valid email unlocks send without enrichment.
 */
export function listEmailCampaignBlockingReasons(
  input: ProspectReviewStateInput,
): Array<{ code: ProspectEmailCampaignBlockCode; message: string }> {
  const blocks: Array<{ code: ProspectEmailCampaignBlockCode; message: string }> = [];

  if (isProspectExplicitlyNotQualified(input)) {
    blocks.push({
      code: "not_qualified",
      message: "Not qualified",
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
  } else if (
    !isProspectExplicitlyNotQualified(input) &&
    !isProspectDecisionQualified(input)
  ) {
    blocks.push({
      code: "not_approved",
      message: "Mark as Qualified to send campaigns.",
    });
  }
  // Prior real outreach first — historical Inbox sends are "Already contacted",
  // not "Already in Campaigns" (no queue enrollment required).
  if (isProspectAlreadyContactedForCampaign(input)) {
    blocks.push({
      code: "already_contacted",
      message: "Already contacted",
    });
  }
  if (isProspectInCampaigns(input) && !isProspectAlreadyContactedForCampaign(input)) {
    blocks.push({
      code: "in_campaigns",
      message: "Already in Campaigns",
    });
  }
  if (String(input.outcome || "").toLowerCase() === "won") {
    blocks.push({ code: "won", message: "Already Won" });
  }

  const hasEmail = prospectHasCampaignContact(input);

  // Valid email unlocks campaign send — do not require enrichment when email exists.
  if (!hasEmail) {
    blocks.push({
      code: "missing_email",
      message: "Missing email",
    });
    if (isProspectEnrichmentInProgress(input.enrichmentStatus)) {
      blocks.push({
        code: "enrichment_in_progress",
        message: "Enrichment still in progress",
      });
    } else if (isProspectEnrichmentFailed(input.enrichmentStatus)) {
      blocks.push({
        code: "enrichment_failed",
        message: "Enrichment failed",
      });
    } else if (doesEnrichmentApply(input) && !isProspectEnrichmentComplete(input.enrichmentStatus)) {
      blocks.push({
        code: "enrichment_incomplete",
        message: "Enrich this prospect before sending to Campaigns.",
      });
    }
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
  alreadyEnrichedCount?: number;
  unavailableCount?: number;
  notQualifiedCount?: number;
  needsReviewCount?: number;
}): { line: string; detail: string | null; reason: string | null } {
  const n = input.selectedCount;
  if (n <= 0) return { line: "0 selected", detail: null, reason: null };

  const enrichOk = input.enrichableCount > 0;
  const sendOk = input.qualifiedCount > 0;
  const already = input.alreadyEnrichedCount ?? 0;
  const unavailable =
    input.unavailableCount ?? Math.max(0, n - input.enrichableCount - already);
  const notQualified = input.notQualifiedCount ?? 0;
  const needsReview = input.needsReviewCount ?? 0;

  const enrichParts = [`${input.enrichableCount} can be enriched`];
  if (already > 0) enrichParts.push(`${already} already enriched`);
  if (unavailable > 0) enrichParts.push(`${unavailable} unavailable`);

  const campaignParts: string[] = [];
  if (input.qualifiedCount > 0) {
    campaignParts.push(`${input.qualifiedCount} ready for campaign`);
  }
  if (notQualified > 0) campaignParts.push(`${notQualified} not qualified`);
  if (needsReview > 0) campaignParts.push(`${needsReview} need review`);

  const enrichMixed =
    n > 1 && (already > 0 || unavailable > 0 || input.enrichableCount !== n);
  const detail = enrichMixed
    ? enrichParts.join(" · ")
    : campaignParts.length > 0
      ? campaignParts.join(" · ")
      : n > 1
        ? enrichParts.join(" · ")
        : null;

  // Single-select edge copy for blocked actions (kept compact, human-readable).
  if (n === 1 && !enrichOk && !sendOk) {
    if (
      (input.firstEnrich?.code === "already_enriched" ||
        input.firstEnrich?.code === "email_added") &&
      input.firstQualified?.ok
    ) {
      return { line: "1 selected", detail: "Ready for campaign", reason: null };
    }
    if (input.firstEnrich && !input.firstEnrich.ok) {
      return {
        line: "1 selected",
        detail: null,
        reason: input.firstEnrich.message,
      };
    }
    if (input.firstQualified && !input.firstQualified.ok) {
      return {
        line: "1 selected",
        detail: null,
        reason: input.firstQualified.message,
      };
    }
  }

  if (
    n === 1 &&
    !enrichOk &&
    sendOk &&
    (input.firstEnrich?.code === "already_enriched" ||
      input.firstEnrich?.code === "email_added")
  ) {
    return { line: "1 selected", detail: "Ready for campaign", reason: null };
  }

  if (n === 1 && enrichOk && !sendOk) {
    const sendSaysEnrichFirst =
      input.firstQualified?.code === "enrichment_incomplete" ||
      /enrich this prospect/i.test(input.firstQualified?.message || "");
    return {
      line: "1 selected",
      detail: "1 can be enriched",
      reason: sendSaysEnrichFirst
        ? "Enrich this prospect before sending to Campaigns."
        : input.firstQualified?.message || null,
    };
  }

  if (!enrichOk && !sendOk && n > 1) {
    return {
      line: `${n} selected`,
      detail: detail || enrichParts.join(" · "),
      reason: input.firstEnrich?.message || input.firstQualified?.message || null,
    };
  }

  return {
    line: `${n} selected`,
    detail,
    reason: null,
  };
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
  if (isProspectExplicitlyNotQualified(input)) return null;
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
  if (isProspectExplicitlyNotQualified(input)) return "not_qualified";

  const analysis = String(input.analysisStatus || "pending").toLowerCase();
  if (analysis === "processing") return "analyzing";
  if (analysis === "pending") return "imported";

  if (isProspectDecisionQualified(input)) {
    if (isProspectEnrichmentInProgress(input.enrichmentStatus)) {
      return "enriching";
    }
    // Human/legacy Qualified decision — independent of campaign/email readiness.
    return "qualified";
  }

  const attention = resolveProspectNeedsAttentionReason(input);
  if (attention) return "needs_attention";

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
 * - needs_review → no human Qualified / Not Qualified decision yet
 * - qualified → human Qualified decision (reviewStatus approved; may still lack email)
 * - not_qualified → explicit final rejection
 *
 * Deprecated filters (`enriching`, `needs_attention`) kept for tests/URLs.
 */
export function matchesProspectReviewWorkFilter(
  input: ProspectReviewStateInput,
  filter: ProspectReviewWorkFilter,
  attentionSub: ProspectNeedsAttentionSubFilter = "all",
): boolean {
  if (!isProspectVisibleInReview(input)) return false;

  if (filter === "all") return true;

  if (filter === "not_qualified") {
    return isProspectExplicitlyNotQualified(input);
  }

  if (filter === "qualified") {
    return isProspectDecisionQualified(input);
  }

  if (filter === "needs_review") {
    if (isProspectExplicitlyNotQualified(input)) return false;
    if (isProspectDecisionQualified(input)) return false;
    return true;
  }

  // Deprecated primary chips — exact internal state match
  const state = resolveProspectReviewWorkState(input);
  if (filter === "enriching") return state === "enriching";
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
  notQualified: number;
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
    notQualified: 0,
    needsAttention: 0,
    qualificationFailed: 0,
    enrichmentFailed: 0,
    missingWebsite: 0,
    missingEmail: 0,
    analyzing: 0,
  };
  for (const item of items) {
    if (!isProspectVisibleInReview(item)) continue;
    if (isProspectExplicitlyNotQualified(item)) {
      counts.notQualified += 1;
    } else if (isProspectDecisionQualified(item)) {
      counts.qualified += 1;
    } else {
      counts.needsReview += 1;
    }
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
