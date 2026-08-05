/**
 * Prospect AI Review failure classification + user-safe messaging.
 * Technical diagnostics stay for admins/logs; never surface env vars or key material to users.
 */

import { resolveProspectEnrichmentStatusUx } from "./prospectEnrichmentStatusUx";

export type ProspectAiReviewErrorClass =
  | "retryable"
  | "permanent"
  | "configuration"
  | "external_provider"
  | "user_data";

export type ProspectAiReviewErrorInfo = {
  class: ProspectAiReviewErrorClass;
  /** Short badge / progress label. */
  label: string;
  /** Friendly explanation for regular users. */
  userMessage: string;
  /** Whether Retry Review is appropriate. */
  retryable: boolean;
  /** True when the raw message looks like infrastructure/config diagnostics. */
  hasTechnicalDetails: boolean;
};

const TECH_LEAK_RE =
  /OPENAI_API_KEY|AI_INTEGRATIONS_OPENAI|sk-[A-Za-z0-9_\-]{8,}|re_[A-Za-z0-9]{6,}|Resend key|environment variable|api[_ ]?key|platform\.openai\.com|Bearer\s/i;

const RETRYABLE_RE =
  /rate limit|timeout|temporar|unavailable|overloaded|503|502|500|429|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|network|try again|AbortError|socket hang up|timed out/i;

const CONFIG_RE =
  /misconfigured|API key is missing|authentication failed|Incorrect API key|invalid[_ ]api[_ ]key|Resend key|OPENAI_API_KEY|AI_INTEGRATIONS/i;

const PARSE_RE = /JSON\.parse|Unexpected token|not valid JSON|parsing failed|schema/i;

/**
 * Server auto-retry gate — narrower than user-facing retryable.
 * Retries provider/network/timeout/parse flakes. Does NOT auto-retry config/auth
 * (missing key) or clearly permanent business failures.
 */
export function isProspectAiTransientProviderError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (!msg.trim()) return false;
  if (CONFIG_RE.test(msg) && !/rate limit|timeout|503|502|429/i.test(msg)) {
    return false;
  }
  if (/not a fit|invalid business|permanently|unsupported business/i.test(msg)) {
    return false;
  }
  if (RETRYABLE_RE.test(msg)) return true;
  // Truncated / flaky model JSON is common under load — retry before failing the row.
  if (PARSE_RE.test(msg)) return true;
  if (err instanceof Error && /AbortError/i.test(err.name)) return true;
  return false;
}

/**
 * Map stored / provider error text → user-safe classification.
 * Prefer this over showing `errorMessage` directly in Review UI.
 */
export function classifyProspectAiReviewError(
  errorMessage?: string | null,
): ProspectAiReviewErrorInfo {
  const raw = String(errorMessage || "").trim();
  const hasTechnicalDetails = Boolean(raw) && TECH_LEAK_RE.test(raw);

  if (!raw) {
    return {
      class: "external_provider",
      label: "AI Review Failed",
      userMessage: "AI Review couldn't be completed. Retry Qualification.",
      retryable: true,
      hasTechnicalDetails: false,
    };
  }

  if (CONFIG_RE.test(raw)) {
    return {
      class: "configuration",
      label: "AI Review Failed",
      userMessage:
        "AI Review is temporarily unavailable. Retry Qualification later, or contact support.",
      retryable: true,
      hasTechnicalDetails: true,
    };
  }

  if (RETRYABLE_RE.test(raw)) {
    return {
      class: "retryable",
      label: "AI Review Failed",
      userMessage: "AI Review is temporarily unavailable. Retry Qualification.",
      retryable: true,
      hasTechnicalDetails: hasTechnicalDetails || /503|502|429|timeout/i.test(raw),
    };
  }

  if (PARSE_RE.test(raw)) {
    return {
      class: "external_provider",
      label: "AI Review Failed",
      userMessage: "AI Review couldn't be completed. Retry Qualification.",
      retryable: true,
      hasTechnicalDetails: true,
    };
  }

  // Unknown provider errors — treat as retryable unless clearly permanent.
  if (/not a fit|invalid business|permanently|unsupported/i.test(raw)) {
    return {
      class: "permanent",
      label: "AI Review Failed",
      userMessage: "AI Review couldn't be completed for this business.",
      retryable: false,
      hasTechnicalDetails: hasTechnicalDetails,
    };
  }

  return {
    class: "external_provider",
    label: "AI Review Failed",
    userMessage: "AI Review couldn't be completed. Retry Qualification.",
    retryable: true,
    hasTechnicalDetails: hasTechnicalDetails || raw.length > 80,
  };
}

/** Single primary status for the Review detail header (mutually exclusive). */
export type ProspectDetailPrimaryStatusCode =
  | "ai_review_failed"
  | "not_qualified"
  | "ready_for_campaign"
  | "qualified"
  | "needs_review";

export type ProspectDetailPrimaryStatus = {
  code: ProspectDetailPrimaryStatusCode;
  label: string;
  testId: string;
};

/**
 * Priority (highest first):
 * 1. AI Review Failed
 * 2. Not Qualified
 * 3. Ready for Campaign (qualified + campaign-ready)
 * 4. Qualified
 * 5. Needs Review
 *
 * Never return more than one — Ready for Campaign replaces Qualified when applicable.
 */
export function resolveProspectDetailPrimaryStatus(input: {
  analysisStatus?: string | null;
  decision: "qualified" | "needs_review" | "not_qualified";
  readyForCampaign?: boolean;
}): ProspectDetailPrimaryStatus {
  if (String(input.analysisStatus || "").toLowerCase() === "failed") {
    return {
      code: "ai_review_failed",
      label: "AI Review Failed",
      testId: "pi-ai-review-failed-badge",
    };
  }
  if (input.decision === "not_qualified") {
    return {
      code: "not_qualified",
      label: "Not Qualified",
      testId: "pi-not-qualified-badge",
    };
  }
  if (input.decision === "needs_review") {
    return {
      code: "needs_review",
      label: "Needs Review",
      testId: "pi-needs-human-review-badge",
    };
  }
  // Ready for Campaign only when decision is Qualified (never overrides Needs/Not Qualified).
  if (input.decision === "qualified" && input.readyForCampaign === true) {
    return {
      code: "ready_for_campaign",
      label: "Ready for Campaign",
      testId: "pi-email-campaign-ready-badge",
    };
  }
  if (input.decision === "qualified") {
    return {
      code: "qualified",
      label: "Qualified",
      testId: "pi-approved-badge",
    };
  }
  return {
    code: "needs_review",
    label: "Needs Review",
    testId: "pi-needs-human-review-badge",
  };
}

/** Friendly copy for badges, Progress, and detail banners. */
export function userFacingProspectAiReviewError(errorMessage?: string | null): string {
  return classifyProspectAiReviewError(errorMessage).userMessage;
}

export function isProspectAiReviewRetryable(errorMessage?: string | null): boolean {
  return classifyProspectAiReviewError(errorMessage).retryable;
}

/**
 * Strip leaked secrets from technical text shown to admins.
 * Still may mention env var names for operators — never show to non-admins.
 */
export function sanitizeProspectAiReviewTechnicalDetails(
  errorMessage?: string | null,
): string {
  let msg = String(errorMessage || "").trim();
  if (!msg) return "";
  msg = msg.replace(/sk-[A-Za-z0-9_\-]{8,}/gi, "sk-…");
  msg = msg.replace(/re_[A-Za-z0-9]{6,}/gi, "re_…");
  msg = msg.replace(/Bearer\s+\S+/gi, "Bearer …");
  return msg.slice(0, 500);
}

/** Concise Progress column states (one label per row). */
export type ProspectProgressStateCode =
  | "queued"
  | "reviewing"
  | "retrying"
  | "needs_review"
  | "not_qualified"
  | "ready_to_enrich"
  | "enriching"
  | "enriched"
  | "partially_enriched"
  | "ready_for_campaign"
  | "failed"
  | "in_campaign";

export const PROSPECT_PROGRESS_STATE_LABELS: Record<ProspectProgressStateCode, string> = {
  queued: "Queued",
  reviewing: "Reviewing",
  retrying: "Retrying",
  needs_review: "Needs Review",
  not_qualified: "Not Qualified",
  ready_to_enrich: "Ready to Enrich",
  enriching: "Enriching",
  enriched: "Enrichment Complete",
  partially_enriched: "Partially Enriched",
  ready_for_campaign: "Ready for Campaign",
  failed: "Failed",
  in_campaign: "In Campaign",
};

/**
 * True when a failed AI Review should stay red (config / permanent / exhausted).
 * Transient failures that are still auto-recovering should not use this path —
 * callers reset those rows to pending/processing before showing UI.
 */
export function isProspectAiReviewPermanentFailureDisplay(errorMessage?: string | null): boolean {
  const info = classifyProspectAiReviewError(errorMessage);
  return info.class === "permanent" || info.class === "configuration" || !info.retryable;
}

export function resolveProspectProgressState(input: {
  analysisStatus?: string | null;
  enrichmentStatus?: string | null;
  reviewStatus?: string | null;
  queueStatus?: string | null;
  outreachStatus?: string | null;
  email?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  websiteUrlUsed?: string | null;
  enrichmentEmailFound?: boolean | null;
  enrichmentPhoneFound?: boolean | null;
  enrichmentResult?: unknown;
  priorOutreachDetected?: boolean | null;
  /** When set, Ready for Campaign requires a Qualified decision. */
  decision?: "qualified" | "needs_review" | "not_qualified" | null;
  /** Prefer shared campaign gate when provided. */
  readyForCampaign?: boolean | null;
  notQualified?: boolean | null;
  /**
   * When analysis is processing after a prior failure / outer retry, show Retrying.
   * Set by UI when rawResult indicates an in-flight retry, or when errorMessage was
   * cleared but processing continues after requeue.
   */
  aiReviewRetrying?: boolean | null;
  errorMessage?: string | null;
}): { code: ProspectProgressStateCode; label: string } {
  const analysis = String(input.analysisStatus || "pending").toLowerCase();
  const enrichment = String(input.enrichmentStatus || "none").toLowerCase();
  const queue = String(input.queueStatus || "").toLowerCase();
  const outreach = String(input.outreachStatus || "").toLowerCase();
  const decision = input.decision || null;
  const notQualified = input.notQualified === true || decision === "not_qualified";

  if (
    input.priorOutreachDetected === true ||
    outreach === "outreach_sent" ||
    outreach === "replied" ||
    ["queued", "sending", "sent", "paused"].includes(queue)
  ) {
    return { code: "in_campaign", label: PROSPECT_PROGRESS_STATE_LABELS.in_campaign };
  }

  if (analysis === "failed") {
    // Retryable provider failures still show Failed only after exhaustion (status=failed).
    // Configuration / permanent use the same badge; copy differs in detail banner.
    return { code: "failed", label: PROSPECT_PROGRESS_STATE_LABELS.failed };
  }
  if (analysis === "processing") {
    if (input.aiReviewRetrying === true) {
      return { code: "retrying", label: PROSPECT_PROGRESS_STATE_LABELS.retrying };
    }
    return { code: "reviewing", label: PROSPECT_PROGRESS_STATE_LABELS.reviewing };
  }
  if (analysis === "pending") {
    return { code: "queued", label: PROSPECT_PROGRESS_STATE_LABELS.queued };
  }

  // Qualification outcome beats enrichment/email heuristics.
  if (notQualified) {
    return { code: "not_qualified", label: PROSPECT_PROGRESS_STATE_LABELS.not_qualified };
  }
  if (decision === "needs_review") {
    return { code: "needs_review", label: PROSPECT_PROGRESS_STATE_LABELS.needs_review };
  }

  if (enrichment === "pending" || enrichment === "enriching") {
    return { code: "enriching", label: PROSPECT_PROGRESS_STATE_LABELS.enriching };
  }

  const review = String(input.reviewStatus || "pending").toLowerCase();
  const isQualifiedDecision =
    decision === "qualified" || review === "approved" || review === "qualified";

  // Ready for Campaign only when Qualified + campaign-ready (never for Needs/Not Qualified).
  if (isQualifiedDecision && input.readyForCampaign === true) {
    return {
      code: "ready_for_campaign",
      label: PROSPECT_PROGRESS_STATE_LABELS.ready_for_campaign,
    };
  }

  if (enrichment === "completed" || enrichment === "failed") {
    const enrichUx = resolveProspectEnrichmentStatusUx({
      enrichmentStatus: input.enrichmentStatus,
      enrichmentEmailFound: input.enrichmentEmailFound,
      enrichmentPhoneFound: input.enrichmentPhoneFound,
      enrichmentResult: input.enrichmentResult,
      email: input.email,
      phone: input.phone,
      websiteUrl: input.websiteUrl,
      websiteUrlUsed: input.websiteUrlUsed,
    });
    if (enrichUx.code === "partially_enriched") {
      return {
        code: "partially_enriched",
        label: PROSPECT_PROGRESS_STATE_LABELS.partially_enriched,
      };
    }
    if (enrichUx.code === "enrichment_complete") {
      return { code: "enriched", label: PROSPECT_PROGRESS_STATE_LABELS.enriched };
    }
    if (enrichment === "failed") {
      return { code: "failed", label: PROSPECT_PROGRESS_STATE_LABELS.failed };
    }
  }

  // Stale AI analysisStatus=needs_review must not override an explicit Qualified decision.
  if (!isQualifiedDecision && (review === "needs_review" || analysis === "needs_review")) {
    return { code: "needs_review", label: PROSPECT_PROGRESS_STATE_LABELS.needs_review };
  }

  const hasWebsite = Boolean(String(input.websiteUrl || "").trim());
  if (hasWebsite && enrichment === "none") {
    return { code: "ready_to_enrich", label: PROSPECT_PROGRESS_STATE_LABELS.ready_to_enrich };
  }

  if (!isQualifiedDecision) {
    return { code: "needs_review", label: PROSPECT_PROGRESS_STATE_LABELS.needs_review };
  }

  // Qualified but enrichment not finished — not Ready for Campaign until campaign gate passes.
  return { code: "ready_to_enrich", label: PROSPECT_PROGRESS_STATE_LABELS.ready_to_enrich };
}
