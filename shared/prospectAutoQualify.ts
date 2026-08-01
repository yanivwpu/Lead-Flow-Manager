/**
 * Prospect AI auto-qualification — separate from enrichment and outreach.
 * Fit decision only; campaign readiness is gated elsewhere.
 */

export const PROSPECT_QUALIFICATION_SOURCES = [
  "auto_ai",
  "manual",
  "manual_needs_review",
  "manual_not_qualified",
  "auto_ai_reject",
] as const;

export type ProspectQualificationSource = (typeof PROSPECT_QUALIFICATION_SOURCES)[number];

const UNKNOWN_RE = /^(unknown|n\/?a|none|null|undefined|-)?$/i;

function isUnknownLabel(value?: string | null): boolean {
  const t = String(value || "").trim();
  return !t || UNKNOWN_RE.test(t);
}

export function readProspectQualificationSource(
  rawResult?: Record<string, unknown> | null,
): ProspectQualificationSource | null {
  const raw = String(rawResult?.qualificationSource || "").trim().toLowerCase();
  if ((PROSPECT_QUALIFICATION_SOURCES as readonly string[]).includes(raw)) {
    return raw as ProspectQualificationSource;
  }
  return null;
}

/** Human decisions always win over later AI reanalysis. */
export function hasHumanQualificationLock(input: {
  approvedByUserId?: string | null;
  reviewStatus?: string | null;
  recommendedOffer?: string | null;
  enrichmentTriggeredBy?: string | null;
  rawResult?: Record<string, unknown> | null;
}): boolean {
  if (String(input.approvedByUserId || "").trim()) return true;
  if (String(input.enrichmentTriggeredBy || "").toLowerCase() === "approve") return true;
  const src = readProspectQualificationSource(input.rawResult);
  if (src === "manual" || src === "manual_needs_review" || src === "manual_not_qualified") {
    return true;
  }
  return false;
}

export function hasClearBusinessIdentity(input: {
  name?: string | null;
  company?: string | null;
  companyName?: string | null;
  businessType?: string | null;
  industry?: string | null;
  websiteUrl?: string | null;
}): boolean {
  const identity = String(input.companyName || input.company || input.name || "").trim();
  if (!identity) return false;
  const typeOk =
    !isUnknownLabel(input.businessType) || !isUnknownLabel(input.industry);
  const websiteOk = Boolean(String(input.websiteUrl || "").trim());
  return typeOk || websiteOk;
}

/**
 * Auto-qualify after successful AI Review + fit reconciliation.
 * Does NOT require enrichment, email, website reachability, or outreach content.
 */
export function shouldAutoQualifyFromAiResult(input: {
  analysisStatus?: string | null;
  needsReview?: boolean | null;
  priority?: string | null;
  recommendedOffer?: string | null;
  potentialFit?: string | null;
  confidence?: number | null;
  name?: string | null;
  company?: string | null;
  companyName?: string | null;
  businessType?: string | null;
  industry?: string | null;
  websiteUrl?: string | null;
}): boolean {
  const analysis = String(input.analysisStatus || "").toLowerCase();
  if (analysis === "failed" || analysis === "pending" || analysis === "processing") {
    return false;
  }
  // Explicit AI human-review request / insufficient evidence.
  if (input.needsReview === true) return false;
  if (analysis === "needs_review") return false;
  if (String(input.priority || "").toLowerCase() === "needs_review") return false;

  const offer = String(input.recommendedOffer || "").toLowerCase();
  if (offer === "not_a_fit") return false;

  if (String(input.potentialFit || "").toLowerCase() === "unknown" && !hasClearBusinessIdentity(input)) {
    return false;
  }

  if (!hasClearBusinessIdentity(input)) return false;

  // Low confidence alone is not reject — only blocks auto-qualify when evidence is thin.
  const confidence = typeof input.confidence === "number" ? input.confidence : 100;
  if (confidence < 20 && String(input.potentialFit || "").toLowerCase() === "unknown") {
    return false;
  }

  return analysis === "completed";
}

export function buildQualificationSourcePatch(
  source: ProspectQualificationSource,
  existingRaw?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...(existingRaw && typeof existingRaw === "object" ? existingRaw : {}),
    qualificationSource: source,
    qualificationDecidedAt: new Date().toISOString(),
  };
}

/** Map lead score → priority when clearing a stale AI `needs_review` priority. */
export function remapProspectPriorityFromScore(
  leadScore?: number | null,
): "high" | "medium" | "low" {
  const score = typeof leadScore === "number" && Number.isFinite(leadScore) ? leadScore : 50;
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

/**
 * Persist patch that clears stale AI "Needs review" presentation after a Qualified decision.
 * Contact completeness (email/website) is never written here.
 */
export function buildQualifiedPresentationClearPatch(input?: {
  priority?: string | null;
  analysisStatus?: string | null;
  leadScore?: number | null;
}): {
  needsReview: false;
  analysisStatus?: "completed";
  priority?: "high" | "medium" | "low";
} {
  const patch: {
    needsReview: false;
    analysisStatus?: "completed";
    priority?: "high" | "medium" | "low";
  } = { needsReview: false };
  if (String(input?.analysisStatus || "").toLowerCase() === "needs_review") {
    patch.analysisStatus = "completed";
  }
  if (String(input?.priority || "").toLowerCase() === "needs_review") {
    patch.priority = remapProspectPriorityFromScore(input?.leadScore);
  }
  return patch;
}

/** True when Qualified rows still carry AI needs-review presentation fields. */
export function hasStaleNeedsReviewPresentation(input: {
  needsReview?: boolean | null;
  priority?: string | null;
  analysisStatus?: string | null;
}): boolean {
  if (input.needsReview === true) return true;
  if (String(input.priority || "").toLowerCase() === "needs_review") return true;
  if (String(input.analysisStatus || "").toLowerCase() === "needs_review") return true;
  return false;
}
