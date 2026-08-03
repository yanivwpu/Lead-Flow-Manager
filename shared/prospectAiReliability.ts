/**
 * Prospect AI Review + Enrichment reliability helpers.
 * Pure classification / pipeline transition logic — no I/O.
 */

import {
  isProspectAiTransientProviderError,
  classifyProspectAiReviewError,
  sanitizeProspectAiReviewTechnicalDetails,
  userFacingProspectAiReviewError,
} from "./prospectAiReviewErrors";
import {
  looksLikeResendApiKey,
  resolveOpenAiApiKey,
} from "./openaiApiKey";
import {
  PROSPECT_ENRICHMENT_FAILURE_LABELS,
  type ProspectEnrichmentFailureClass,
} from "./prospectEnrichment";
import {
  readEnrichmentFailureClass,
  resolveMissingEmailDetail,
  type ProspectEnrichmentOutcomeInput,
} from "./prospectEnrichmentOutcome";

/** Granular AI Review failure kinds for ops + auto-retry decisions. */
export const PROSPECT_AI_REVIEW_FAILURE_KINDS = [
  "configuration",
  "temporary_provider",
  "timeout",
  "rate_limit",
  "validation",
  "bad_prompt",
  "missing_data",
  "race_condition",
  "unexpected_exception",
  "unknown",
] as const;
export type ProspectAiReviewFailureKind = (typeof PROSPECT_AI_REVIEW_FAILURE_KINDS)[number];

export type ProspectAiReviewFailureClassification = {
  kind: ProspectAiReviewFailureKind;
  /** Safe for automatic server retries before marking failed. */
  autoRetryable: boolean;
  /** Safe for user-visible Retry Qualification. */
  userRetryable: boolean;
  userMessage: string;
  technicalMessage: string;
};

/**
 * Classify a stored / thrown AI Review error into an ops kind + retry policy.
 */
export function classifyProspectAiReviewFailure(
  err: unknown,
  stage?: string | null,
): ProspectAiReviewFailureClassification {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const stageKey = String(stage || "").toLowerCase();
  const info = classifyProspectAiReviewError(raw);
  const technicalMessage = sanitizeProspectAiReviewTechnicalDetails(raw) || raw.slice(0, 500);

  if (/already in progress|abandoned stale processing/i.test(raw)) {
    return {
      kind: "race_condition",
      autoRetryable: false,
      userRetryable: true,
      userMessage: info.userMessage,
      technicalMessage,
    };
  }

  if (/insufficient|missing (website|email|business)|no usable prospect data/i.test(raw)) {
    return {
      kind: "missing_data",
      autoRetryable: false,
      userRetryable: false,
      userMessage: "Not enough business details for AI Review yet.",
      technicalMessage,
    };
  }

  if (
    /misconfigured|API key is missing|authentication failed|Incorrect API key|invalid[_ ]api[_ ]key|Resend key|OPENAI_API_KEY|AI_INTEGRATIONS/i.test(
      raw,
    )
  ) {
    return {
      kind: "configuration",
      autoRetryable: false,
      userRetryable: true,
      userMessage: info.userMessage,
      technicalMessage,
    };
  }

  if (/rate limit|429/i.test(raw)) {
    return {
      kind: "rate_limit",
      autoRetryable: true,
      userRetryable: true,
      userMessage: info.userMessage,
      technicalMessage,
    };
  }

  if (/timeout|timed out|ETIMEDOUT|AbortError/i.test(raw) || stageKey.includes("timeout")) {
    return {
      kind: "timeout",
      autoRetryable: true,
      userRetryable: true,
      userMessage: info.userMessage,
      technicalMessage,
    };
  }

  if (/JSON\.parse|Unexpected token|not valid JSON|parsing failed/i.test(raw)) {
    return {
      kind: "validation",
      autoRetryable: true,
      userRetryable: true,
      userMessage: info.userMessage,
      technicalMessage,
    };
  }

  if (/schema|required field|invalid response|bad prompt/i.test(raw) || stageKey === "schema_validate") {
    return {
      kind: "bad_prompt",
      autoRetryable: true,
      userRetryable: true,
      userMessage: info.userMessage,
      technicalMessage,
    };
  }

  if (
    /503|502|500|overloaded|temporar|unavailable|ECONNRESET|fetch failed|network|socket hang up/i.test(
      raw,
    )
  ) {
    return {
      kind: "temporary_provider",
      autoRetryable: true,
      userRetryable: true,
      userMessage: info.userMessage,
      technicalMessage,
    };
  }

  if (isProspectAiTransientProviderError(err)) {
    return {
      kind: "temporary_provider",
      autoRetryable: true,
      userRetryable: true,
      userMessage: info.userMessage,
      technicalMessage,
    };
  }

  if (/Error:|Exception|TypeError|ReferenceError/i.test(raw)) {
    return {
      kind: "unexpected_exception",
      autoRetryable: false,
      userRetryable: true,
      userMessage: userFacingProspectAiReviewError(raw),
      technicalMessage,
    };
  }

  return {
    kind: "unknown",
    autoRetryable: info.retryable && !/permanently|unsupported/i.test(raw),
    userRetryable: info.retryable,
    userMessage: info.userMessage,
    technicalMessage,
  };
}

/** Count classified failures for a batch of error messages (audit / ops). */
export function summarizeProspectAiReviewFailureKinds(
  errors: Array<{ errorMessage?: string | null; stage?: string | null }>,
): Record<ProspectAiReviewFailureKind, number> {
  const counts = Object.fromEntries(
    PROSPECT_AI_REVIEW_FAILURE_KINDS.map((k) => [k, 0]),
  ) as Record<ProspectAiReviewFailureKind, number>;
  for (const row of errors) {
    const kind = classifyProspectAiReviewFailure(row.errorMessage, row.stage).kind;
    counts[kind] += 1;
  }
  return counts;
}

/**
 * Orphan auto-requeue must not tight-loop permanent/config failures.
 * Pending always eligible; failed only when user/auto retryable and not configuration/missing_data.
 */
export function shouldOrphanRequeueFailedAnalysis(input: {
  analysisStatus?: string | null;
  errorMessage?: string | null;
  rawResult?: Record<string, unknown> | null;
  stage?: string | null;
}): boolean {
  const status = String(input.analysisStatus || "").toLowerCase();
  if (status === "pending") return true;
  if (status !== "failed") return false;

  const storedKind = String(
    input.rawResult?.aiReviewFailureKind || input.rawResult?.failureKind || "",
  ).toLowerCase();
  if (storedKind === "configuration" || storedKind === "missing_data") return false;

  const classified = classifyProspectAiReviewFailure(
    input.errorMessage,
    input.stage ||
      (typeof input.rawResult?.aiReviewFailureStage === "string"
        ? String(input.rawResult.aiReviewFailureStage)
        : null),
  );
  if (classified.kind === "configuration" || classified.kind === "missing_data") return false;
  if (classified.autoRetryable || classified.userRetryable) return true;
  // Unknown / unexpected: allow user-driven orphan recovery once (not config).
  return classified.kind !== "configuration";
}

/** Safe OpenAI key shape for worker startup logs — never includes the secret. */
export function describeOpenAiKeyRuntimeDiagnostics(
  env: NodeJS.ProcessEnv = process.env,
): {
  selectedSource: "AI_INTEGRATIONS_OPENAI_API_KEY" | "OPENAI_API_KEY" | "missing" | "invalid";
  prefixClass: "sk-" | "re_" | "missing" | "unknown";
  keyLength: number;
  ok: boolean;
  railwayServiceName: string | null;
  railwayDeploymentId: string | null;
} {
  const resolved = resolveOpenAiApiKey(env);
  const pick = resolved.ok
    ? resolved.apiKey
    : String(env.AI_INTEGRATIONS_OPENAI_API_KEY || env.OPENAI_API_KEY || "").trim();
  let prefixClass: "sk-" | "re_" | "missing" | "unknown" = "missing";
  if (!pick) prefixClass = "missing";
  else if (looksLikeResendApiKey(pick)) prefixClass = "re_";
  else if (/^sk-/i.test(pick)) prefixClass = "sk-";
  else prefixClass = "unknown";

  return {
    selectedSource: resolved.ok
      ? resolved.source
      : !String(env.AI_INTEGRATIONS_OPENAI_API_KEY || env.OPENAI_API_KEY || "").trim()
        ? "missing"
        : "invalid",
    prefixClass,
    keyLength: pick ? pick.length : 0,
    ok: resolved.ok,
    railwayServiceName: String(env.RAILWAY_SERVICE_NAME || "").trim() || null,
    railwayDeploymentId: String(env.RAILWAY_DEPLOYMENT_ID || "").trim() || null,
  };
}

/** Usable successful AI Review statuses (not infrastructure failed). */
export function isProspectAiReviewUsableSuccess(status?: string | null): boolean {
  const s = String(status || "").toLowerCase();
  return s === "completed" || s === "needs_review";
}

/** True when a prior AI Review explicitly asked for website intelligence before finalizing. */
export function prospectAiReviewRequiresWebsiteIntelligence(
  rawResult?: Record<string, unknown> | null,
): boolean {
  if (!rawResult || typeof rawResult !== "object") return false;
  return (
    rawResult.requiresWebsiteIntelligence === true ||
    rawResult.aiReviewRequiresWebsiteIntelligence === true
  );
}

/**
 * After enrichment, only queue AI Review when:
 * - no usable completed/needs_review exists yet, or
 * - the prior review explicitly requires website intelligence.
 * Never auto-re-run a completed review merely because enrichment finished.
 * Never enqueue while another attempt is already processing.
 */
export function shouldEnqueueAiReviewAfterEnrichment(input: {
  analysisStatus?: string | null;
  errorMessage?: string | null;
  rawResult?: Record<string, unknown> | null;
}): boolean {
  const status = String(input.analysisStatus || "").toLowerCase();
  if (status === "processing") return false;
  if (isProspectAiReviewUsableSuccess(input.analysisStatus)) {
    return prospectAiReviewRequiresWebsiteIntelligence(input.rawResult);
  }
  return status === "failed" || status === "pending" || status === "" || !status;
}

export type ProspectAiAttemptMeta = {
  analysisAttemptId: string;
  attemptStartedAt: string;
  attemptWorkerId?: string | null;
  attemptRailwayServiceName?: string | null;
  attemptRailwayDeploymentId?: string | null;
  attemptKeyPrefixClass?: "sk-" | "re_" | "missing" | "unknown";
};

export type ProspectAiRefreshFailureMeta = {
  message: string;
  kind: ProspectAiReviewFailureKind;
  at: string;
  attemptId: string;
};

/** True when a persist may apply for this attempt (still the active claim). */
export function isProspectAiAttemptCurrent(input: {
  rowAttemptId?: string | null;
  persistAttemptId?: string | null;
}): boolean {
  const row = String(input.rowAttemptId || "").trim();
  const persist = String(input.persistAttemptId || "").trim();
  if (!persist) return false;
  if (!row) return true; // legacy rows without attempt id
  return row === persist;
}

/**
 * Decide how to persist a failed AI attempt.
 * Never clear a usable completed/needs_review review for a stale or background refresh failure.
 */
export function resolveProspectAiFailurePersistAction(input: {
  currentStatus?: string | null;
  currentAttemptId?: string | null;
  failingAttemptId?: string | null;
  /** True when this attempt deliberately re-ran a prior completed review (user Re-run). */
  deliberateRerun?: boolean;
  /**
   * Background refresh (e.g. post-enrich website intelligence) — never demote a
   * previously usable success to AI Review Failed.
   */
  backgroundRefresh?: boolean;
  /** Status before this attempt claimed the row (completed / needs_review). */
  priorUsableStatus?: string | null;
}): "mark_failed" | "preserve_success_record_refresh_failure" | "ignore_stale" {
  if (
    !isProspectAiAttemptCurrent({
      rowAttemptId: input.currentAttemptId,
      persistAttemptId: input.failingAttemptId,
    })
  ) {
    // Stale attempt: newer claim owns the row.
    return "ignore_stale";
  }
  if (input.backgroundRefresh && !input.deliberateRerun) {
    if (
      isProspectAiReviewUsableSuccess(input.currentStatus) ||
      isProspectAiReviewUsableSuccess(input.priorUsableStatus)
    ) {
      return "preserve_success_record_refresh_failure";
    }
  }
  if (isProspectAiReviewUsableSuccess(input.currentStatus) && !input.deliberateRerun) {
    return "preserve_success_record_refresh_failure";
  }
  const status = String(input.currentStatus || "").toLowerCase();
  if (isProspectAiReviewUsableSuccess(input.currentStatus) && input.deliberateRerun) {
    // Deliberate re-run claimed completed→processing; failure may mark failed.
    return "mark_failed";
  }
  if (status === "processing" || status === "pending" || status === "failed") {
    return "mark_failed";
  }
  return "ignore_stale";
}

/** Merge refresh-failure diagnostics into rawResult without wiping AI outputs. */
export function mergeProspectAiRefreshFailureRaw(
  existingRaw: Record<string, unknown> | null | undefined,
  failure: ProspectAiRefreshFailureMeta,
): Record<string, unknown> {
  const base = existingRaw && typeof existingRaw === "object" ? { ...existingRaw } : {};
  delete base.aiReviewFailureKind;
  delete base.aiReviewFailureStage;
  delete base.autoRetryable;
  delete base.userRetryable;
  delete base.aiReviewRetrying;
  return {
    ...base,
    lastRefreshFailure: failure,
    lastRefreshFailedAt: failure.at,
  };
}

/** Build claim-time attempt metadata (safe; no secrets). */
export function buildProspectAiAttemptClaimRaw(
  attempt: ProspectAiAttemptMeta,
  priorRaw?: Record<string, unknown> | null,
  opts?: {
    deliberateRerun?: boolean;
    backgroundRefresh?: boolean;
    priorUsableStatus?: string | null;
    clearOutputs?: boolean;
  },
): Record<string, unknown> {
  const prior = priorRaw && typeof priorRaw === "object" ? { ...priorRaw } : {};
  const preservedRefresh =
    prior.lastRefreshFailure || prior.lastRefreshFailedAt
      ? {
          lastRefreshFailure: prior.lastRefreshFailure,
          lastRefreshFailedAt: prior.lastRefreshFailedAt,
        }
      : {};
  const base: Record<string, unknown> =
    opts?.clearOutputs === false ? { ...prior } : { ...preservedRefresh };
  delete base.aiReviewFailureKind;
  delete base.aiReviewFailureStage;
  delete base.autoRetryable;
  delete base.userRetryable;
  delete base.aiReviewRetrying;
  return {
    ...base,
    analysisAttemptId: attempt.analysisAttemptId,
    attemptStartedAt: attempt.attemptStartedAt,
    attemptEndedAt: null,
    attemptWorkerId: attempt.attemptWorkerId || null,
    attemptRailwayServiceName: attempt.attemptRailwayServiceName || null,
    attemptRailwayDeploymentId: attempt.attemptRailwayDeploymentId || null,
    attemptKeyPrefixClass: attempt.attemptKeyPrefixClass || null,
    deliberateRerun: Boolean(opts?.deliberateRerun || prior.deliberateRerun),
    backgroundRefresh: Boolean(opts?.backgroundRefresh || prior.backgroundRefresh),
    priorUsableStatus: opts?.priorUsableStatus || prior.priorUsableStatus || null,
    requiresWebsiteIntelligence:
      opts?.backgroundRefresh === true
        ? false
        : Boolean(prior.requiresWebsiteIntelligence || prior.aiReviewRequiresWebsiteIntelligence),
  };
}

/** Decide whether a success persist may apply for this attempt. */
export function resolveProspectAiSuccessPersistAction(input: {
  currentStatus?: string | null;
  currentAttemptId?: string | null;
  successAttemptId?: string | null;
}): "persist_success" | "ignore_stale" {
  if (
    !isProspectAiAttemptCurrent({
      rowAttemptId: input.currentAttemptId,
      persistAttemptId: input.successAttemptId,
    })
  ) {
    return "ignore_stale";
  }
  const status = String(input.currentStatus || "").toLowerCase();
  if (status === "processing" || status === "pending") return "persist_success";
  if (isProspectAiReviewUsableSuccess(status)) return "persist_success";
  return "ignore_stale";
}

/** Pipeline stages for Discover → Campaign eligibility (presentation / tests). */
export const PROSPECT_AI_PIPELINE_STAGES = [
  "discover_saved",
  "sent_to_review",
  "queued",
  "ai_review_started",
  "ai_review_failed",
  "ai_review_retry",
  "ai_review_completed",
  "enrichment_started",
  "enrichment_completed",
  "enrichment_failed",
  "campaign_eligible",
  "campaign_blocked",
] as const;
export type ProspectAiPipelineStage = (typeof PROSPECT_AI_PIPELINE_STAGES)[number];

/**
 * Pure transition log for one prospect through Review reliability paths.
 * Used by tests to document Discover → Retry → Enrichment → Campaign eligibility.
 */
export function traceProspectAiReliabilityPipeline(events: {
  discovered?: boolean;
  sentToReview?: boolean;
  analysisStatus?: string | null;
  retriedQualification?: boolean;
  enrichmentStatus?: string | null;
  hasEmail?: boolean;
  campaignEligible?: boolean;
}): ProspectAiPipelineStage[] {
  const log: ProspectAiPipelineStage[] = [];
  if (events.discovered !== false) log.push("discover_saved");
  if (events.sentToReview !== false) log.push("sent_to_review");

  const analysis = String(events.analysisStatus || "pending").toLowerCase();
  if (analysis === "pending") log.push("queued");
  if (analysis === "processing" || analysis === "failed" || analysis === "completed" || analysis === "needs_review") {
    log.push("ai_review_started");
  }
  if (analysis === "failed") {
    log.push("ai_review_failed");
    if (events.retriedQualification) {
      log.push("ai_review_retry");
    }
  }
  if (analysis === "completed" || analysis === "needs_review") {
    if (events.retriedQualification) log.push("ai_review_retry");
    log.push("ai_review_completed");
  }

  const enrichment = String(events.enrichmentStatus || "none").toLowerCase();
  if (enrichment === "pending" || enrichment === "enriching") {
    log.push("enrichment_started");
  }
  if (enrichment === "completed") log.push("enrichment_completed");
  if (enrichment === "failed") log.push("enrichment_failed");

  if (events.campaignEligible === true) log.push("campaign_eligible");
  else if (events.campaignEligible === false) log.push("campaign_blocked");

  return log;
}

/**
 * Enrichment may run after AI success (post_qualify) or via human Enrich.
 * It must not require a human Qualified decision; AI failure blocks human Enrich.
 */
export function explainProspectEnrichmentIndependence(): {
  canRunBeforeAiReview: boolean;
  shouldRunBeforeAiReview: boolean;
  canAiFailWhileEnrichmentSucceeds: boolean;
  canEnrichmentFailWhileAiSucceeds: boolean;
  intentional: boolean;
  rationale: string;
} {
  return {
    canRunBeforeAiReview: false,
    shouldRunBeforeAiReview: false,
    canAiFailWhileEnrichmentSucceeds: true,
    canEnrichmentFailWhileAiSucceeds: true,
    intentional: true,
    rationale:
      "Enrichment is website contact lookup; AI Review is qualification. post_qualify enrichment runs after AI success. Enrichment workers never mutate AI Review inline — they may enqueue the canonical AI queue only when no usable review exists or website intelligence was explicitly required. Human Enrich requires AI complete (not failed).",
  };
}

export type ProspectEnrichmentFailureInfo = {
  failureClass: ProspectEnrichmentFailureClass | "unknown";
  userMessage: string;
  /** Show Retry Enrichment. */
  retryable: boolean;
  permanent: boolean;
};

/** Friendly enrichment failure + whether Retry Enrichment applies. */
export function classifyProspectEnrichmentFailure(
  input: ProspectEnrichmentOutcomeInput,
): ProspectEnrichmentFailureInfo {
  const failureClass = readEnrichmentFailureClass(input);
  const detail = resolveMissingEmailDetail(input);
  if (failureClass === "no_website" || detail?.code === "no_website") {
    return {
      failureClass: "no_website",
      userMessage: PROSPECT_ENRICHMENT_FAILURE_LABELS.no_website,
      retryable: false,
      permanent: true,
    };
  }
  if (failureClass === "social_profile_only" || detail?.code === "social_profile_only") {
    return {
      failureClass: "social_profile_only",
      userMessage: PROSPECT_ENRICHMENT_FAILURE_LABELS.social_profile_only,
      retryable: false,
      permanent: true,
    };
  }
  if (failureClass === "website_timeout" || detail?.code === "website_timeout") {
    return {
      failureClass: "website_timeout",
      userMessage: PROSPECT_ENRICHMENT_FAILURE_LABELS.website_timeout,
      retryable: true,
      permanent: false,
    };
  }
  if (
    failureClass === "website_fetch_failed" ||
    failureClass === "all_pages_failed" ||
    detail?.code === "website_fetch_failed"
  ) {
    return {
      failureClass: failureClass || "website_fetch_failed",
      userMessage:
        PROSPECT_ENRICHMENT_FAILURE_LABELS[failureClass || "website_fetch_failed"] ||
        "Website couldn't be reached.",
      retryable: true,
      permanent: false,
    };
  }
  if (detail?.code === "no_email_on_website") {
    return {
      failureClass: "unknown",
      userMessage: "No public email found on the website.",
      retryable: true,
      permanent: false,
    };
  }
  const status = String(input.enrichmentStatus || "").toLowerCase();
  if (status === "failed") {
    return {
      failureClass: "unknown",
      userMessage: "Some business information couldn't be collected.",
      retryable: true,
      permanent: false,
    };
  }
  return {
    failureClass: "unknown",
    userMessage: "Some business information couldn't be collected.",
    retryable: false,
    permanent: false,
  };
}

/** After successful AI Review, prior failure fields must be cleared. */
export function prospectAiReviewSuccessClearsFailure(patch: {
  analysisStatus?: string | null;
  errorMessage?: string | null;
  rawResult?: Record<string, unknown> | null;
}): boolean {
  const status = String(patch.analysisStatus || "").toLowerCase();
  if (status !== "completed" && status !== "needs_review") return false;
  if (patch.errorMessage != null && String(patch.errorMessage).trim() !== "") return false;
  const raw = patch.rawResult || {};
  if (raw.failureKind != null || raw.aiReviewFailureKind != null) return false;
  return true;
}

/**
 * Columns wiped when AI Review terminates as failed (after retries exhausted)
 * or when a new analysis attempt is claimed.
 * Prevents a prior success / partial normalize from surviving under failed/processing.
 */
export const PROSPECT_AI_REVIEW_OUTPUT_CLEAR_FIELDS = [
  "industry",
  "businessType",
  "companyName",
  "jobTitle",
  "agencyLikelihood",
  "shopifyMerchantLikelihood",
  "realEstateLikelihood",
  "localBusinessLikelihood",
  "saasLikelihood",
  "potentialFit",
  "leadScore",
  "priority",
  "recommendedOffer",
  "suggestedOutreachAngle",
  "suggestedFirstMessage",
  "suggestedOutreachSubject",
  "reasoningSummary",
  "confidence",
  "needsReview",
] as const;

/** DB patch fragment: clear normalized AI outputs (snake not needed — drizzle property names). */
export function prospectAiReviewOutputClearPatch(): Record<string, null | boolean> {
  return {
    industry: null,
    businessType: null,
    companyName: null,
    jobTitle: null,
    agencyLikelihood: null,
    shopifyMerchantLikelihood: null,
    realEstateLikelihood: null,
    localBusinessLikelihood: null,
    saasLikelihood: null,
    potentialFit: null,
    leadScore: null,
    priority: null,
    recommendedOffer: null,
    suggestedOutreachAngle: null,
    suggestedFirstMessage: null,
    suggestedOutreachSubject: null,
    reasoningSummary: null,
    confidence: null,
    needsReview: false,
  };
}

/** True when a failed-attempt persist patch does not keep AI summary outputs. */
export function prospectAiReviewFailedPersistIsClean(patch: Record<string, unknown>): boolean {
  if (String(patch.analysisStatus || "").toLowerCase() !== "failed") return false;
  for (const key of PROSPECT_AI_REVIEW_OUTPUT_CLEAR_FIELDS) {
    const v = patch[key];
    if (key === "needsReview") {
      if (v === true) return false;
      continue;
    }
    if (v != null && v !== "") return false;
  }
  const raw = (patch.rawResult || {}) as Record<string, unknown>;
  // Must not retain a prior successful intel payload / model text under failed.
  if (raw.leadScore != null || raw.reasoningSummary != null || raw.suggestedOutreachAngle != null) {
    return false;
  }
  return true;
}
