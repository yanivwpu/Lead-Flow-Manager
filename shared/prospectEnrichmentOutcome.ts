/**
 * Derive enrichment outcome / missing-email detail from status + result JSON.
 * No migration — uses existing enrichment_status + enrichment_result columns.
 */

import {
  PROSPECT_ENRICHMENT_FAILURE_LABELS,
  type ProspectEnrichmentFailureClass,
  type ProspectEnrichmentOutcomeClass,
  type ProspectEnrichmentResult,
} from "./prospectEnrichment";
import {
  classifyProspectWebsiteUrl,
  pickOfficialWebsiteUrl,
  isSocialProfileUrl,
} from "./prospectWebsiteClassification";

export type ProspectEnrichmentOutcomeInput = {
  enrichmentStatus?: string | null;
  enrichmentEmailFound?: boolean | null;
  enrichmentErrorMessage?: string | null;
  enrichmentResult?: Record<string, unknown> | null;
  websiteUrl?: string | null;
  websiteUrlUsed?: string | null;
  email?: string | null;
};

function asFailureClass(raw: unknown): ProspectEnrichmentFailureClass | null {
  const s = String(raw || "").trim();
  if (
    s === "website_timeout" ||
    s === "website_fetch_failed" ||
    s === "all_pages_failed" ||
    s === "no_website" ||
    s === "social_profile_only"
  ) {
    return s;
  }
  return null;
}

export function readEnrichmentFailureClass(
  input: ProspectEnrichmentOutcomeInput,
): ProspectEnrichmentFailureClass | null {
  const er = (input.enrichmentResult || {}) as Partial<ProspectEnrichmentResult>;
  const fromResult = asFailureClass(er.failureClass);
  if (fromResult) return fromResult;
  const fromMsg = asFailureClass(input.enrichmentErrorMessage);
  if (fromMsg) return fromMsg;
  // Legacy Miami-style: completed with every page failed → treat as fetch failure.
  if (enrichmentPagesAllFailed(input) && String(input.enrichmentStatus || "").toLowerCase() === "completed") {
    const pages = enrichmentPagesScanned(input);
    const reasons = pages.map((p) => String(p.reason || ""));
    if (reasons.some((r) => /abort|timeout/i.test(r))) return "website_timeout";
    return "all_pages_failed";
  }
  return null;
}

export function enrichmentPagesScanned(
  input: ProspectEnrichmentOutcomeInput,
): Array<{ url?: string; status?: string; reason?: string }> {
  const er = (input.enrichmentResult || {}) as {
    websiteIntelligence?: { pagesScanned?: Array<{ url?: string; status?: string; reason?: string }> };
  };
  return Array.isArray(er.websiteIntelligence?.pagesScanned)
    ? er.websiteIntelligence!.pagesScanned!
    : [];
}

export function enrichmentPagesAllFailed(input: ProspectEnrichmentOutcomeInput): boolean {
  const pages = enrichmentPagesScanned(input);
  if (!pages.length) return false;
  return pages.every((p) => String(p.status || "").toLowerCase() === "failed");
}

export function enrichmentCrawlSucceeded(input: ProspectEnrichmentOutcomeInput): boolean {
  const er = (input.enrichmentResult || {}) as Partial<ProspectEnrichmentResult>;
  if (er.crawlSucceeded === true) return true;
  if (er.crawlSucceeded === false) return false;
  const pages = enrichmentPagesScanned(input);
  if (!pages.length) return false;
  return pages.some((p) => String(p.status || "").toLowerCase() === "scanned");
}

export function resolveProspectOfficialWebsiteUrl(input: {
  websiteUrl?: string | null;
  websiteUrlUsed?: string | null;
}): string | null {
  return pickOfficialWebsiteUrl([input.websiteUrl, input.websiteUrlUsed]);
}

export function prospectHasOfficialWebsiteUrl(input: {
  websiteUrl?: string | null;
  websiteUrlUsed?: string | null;
}): boolean {
  return Boolean(resolveProspectOfficialWebsiteUrl(input));
}

export function prospectWebsiteIsSocialOnly(input: {
  websiteUrl?: string | null;
  websiteUrlUsed?: string | null;
}): boolean {
  if (prospectHasOfficialWebsiteUrl(input)) return false;
  const live = String(input.websiteUrl || "").trim();
  const used = String(input.websiteUrlUsed || "").trim();
  if (live && isSocialProfileUrl(live)) return true;
  if (used && isSocialProfileUrl(used)) return true;
  return false;
}

export function resolveProspectEnrichmentOutcomeClass(
  input: ProspectEnrichmentOutcomeInput,
): ProspectEnrichmentOutcomeClass {
  const status = String(input.enrichmentStatus || "none").toLowerCase();
  if (status === "none" || status === "cancelled") return "not_started";
  if (status === "pending") return "queued";
  if (status === "enriching") return "running";

  const hasOfficial = prospectHasOfficialWebsiteUrl(input);
  const socialOnly = prospectWebsiteIsSocialOnly(input);
  const failure = readEnrichmentFailureClass(input);

  if (!hasOfficial && socialOnly) return "social_profile_only";
  if (!hasOfficial && !String(input.websiteUrl || input.websiteUrlUsed || "").trim()) {
    if (status === "failed" || status === "completed" || failure === "no_website") {
      return "no_website";
    }
  }

  if (status === "failed" || failure) {
    if (failure === "no_website") return "no_website";
    if (failure === "social_profile_only") return "social_profile_only";
    if (failure === "website_timeout") return "failed_timeout";
    if (failure === "website_fetch_failed" || failure === "all_pages_failed") return "failed_fetch";
    if (status === "failed") {
      if (!hasOfficial) return socialOnly ? "social_profile_only" : "no_website";
      return "failed_fetch";
    }
  }

  if (status === "completed") {
    if (input.enrichmentEmailFound === true) return "completed_email_found";
    if (!hasOfficial) return socialOnly ? "social_profile_only" : "no_website";
    return "completed_no_email";
  }

  return "not_started";
}

export type MissingEmailDetail = {
  /** Compact secondary line under Missing Email. */
  reason: string | null;
  code:
    | "no_website"
    | "social_profile_only"
    | "website_timeout"
    | "website_fetch_failed"
    | "no_email_on_website"
    | "unknown";
  /** Show Retry Enrichment affordance when an official website can be crawled again. */
  canRetry: boolean;
  /** Prompt user to edit/replace website. */
  needsWebsiteEdit: boolean;
};

export function resolveMissingEmailDetail(
  input: ProspectEnrichmentOutcomeInput & { email?: string | null },
): MissingEmailDetail | null {
  // Only when email is missing — callers still show the Missing Email badge separately.
  const outcome = resolveProspectEnrichmentOutcomeClass(input);
  const failure = readEnrichmentFailureClass(input);

  if (outcome === "no_website" || failure === "no_website") {
    return {
      reason: PROSPECT_ENRICHMENT_FAILURE_LABELS.no_website,
      code: "no_website",
      canRetry: false,
      needsWebsiteEdit: true,
    };
  }
  if (outcome === "social_profile_only" || failure === "social_profile_only") {
    return {
      reason: PROSPECT_ENRICHMENT_FAILURE_LABELS.social_profile_only,
      code: "social_profile_only",
      canRetry: false,
      needsWebsiteEdit: true,
    };
  }
  if (outcome === "failed_timeout" || failure === "website_timeout") {
    return {
      reason: PROSPECT_ENRICHMENT_FAILURE_LABELS.website_timeout,
      code: "website_timeout",
      canRetry: prospectHasOfficialWebsiteUrl(input),
      needsWebsiteEdit: false,
    };
  }
  if (
    outcome === "failed_fetch" ||
    failure === "website_fetch_failed" ||
    failure === "all_pages_failed"
  ) {
    return {
      reason: PROSPECT_ENRICHMENT_FAILURE_LABELS[failure || "all_pages_failed"],
      code: "website_fetch_failed",
      canRetry: prospectHasOfficialWebsiteUrl(input),
      needsWebsiteEdit: false,
    };
  }
  if (outcome === "completed_no_email") {
    return {
      reason: "No email found on the website",
      code: "no_email_on_website",
      canRetry: prospectHasOfficialWebsiteUrl(input),
      needsWebsiteEdit: false,
    };
  }
  if (!prospectHasOfficialWebsiteUrl(input)) {
    const kind = classifyProspectWebsiteUrl(input.websiteUrl || input.websiteUrlUsed);
    if (kind === "social") {
      return {
        reason: PROSPECT_ENRICHMENT_FAILURE_LABELS.social_profile_only,
        code: "social_profile_only",
        canRetry: false,
        needsWebsiteEdit: true,
      };
    }
    return {
      reason: PROSPECT_ENRICHMENT_FAILURE_LABELS.no_website,
      code: "no_website",
      canRetry: false,
      needsWebsiteEdit: true,
    };
  }
  return {
    reason: null,
    code: "unknown",
    canRetry: false,
    needsWebsiteEdit: false,
  };
}

export function classifyAllPagesFailed(
  pages: Array<{ status?: string; reason?: string }>,
): ProspectEnrichmentFailureClass {
  if (!pages.length) return "all_pages_failed";
  const reasons = pages.map((p) => String(p.reason || ""));
  if (reasons.some((r) => /abort|timeout/i.test(r))) return "website_timeout";
  if (reasons.every((r) => /HTTP\s*\d+/i.test(r))) return "website_fetch_failed";
  return "all_pages_failed";
}

export function userFacingEnrichmentErrorMessage(
  failureClass: ProspectEnrichmentFailureClass | null | undefined,
  fallback?: string | null,
): string {
  if (failureClass && PROSPECT_ENRICHMENT_FAILURE_LABELS[failureClass]) {
    return PROSPECT_ENRICHMENT_FAILURE_LABELS[failureClass];
  }
  const safe = String(fallback || "").trim();
  if (!safe) return "Website enrichment failed";
  // Strip stack-ish content
  if (/at\s+\S+\s+\(|Error:|Exception/i.test(safe) && safe.length > 120) {
    return "Website enrichment failed";
  }
  return safe.slice(0, 160);
}
