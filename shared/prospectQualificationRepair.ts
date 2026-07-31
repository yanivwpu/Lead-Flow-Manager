/**
 * Idempotent repair proposals for legacy Prospect AI qualification rows
 * analyzed before auto-qualify / fit-consistency.
 */

import {
  buildQualificationSourcePatch,
  hasClearBusinessIdentity,
  hasHumanQualificationLock,
  readProspectQualificationSource,
  type ProspectQualificationSource,
} from "./prospectAutoQualify";

/** Mirrors server reconcile strong-reject gate — kept in shared for repair/tests. */
export function hasStrongFitRejectEvidenceForRepair(input: {
  reasoningSummary?: string | null;
  suggestedOutreachAngle?: string | null;
}): boolean {
  const blob = `${input.reasoningSummary || ""} ${input.suggestedOutreachAngle || ""}`;
  return /job\s*board|directory\s*only|residential\s*consumer|permanently\s*closed|competitor|not\s*a\s*business|personal\s*blog|outside\s*(of\s+)?(our\s+)?(icp|ideal\s*customer)|unrelated\s*(vertical|industry|segment)|does\s*not\s*match\s*(our\s*)?(ideal|target|icp)|wrong\s*target\s*segment|explicitly\s*excluded|not\s+our\s+(ideal|target)\s+customer/i.test(
    blob,
  );
}

export type ProspectQualificationRepairAction =
  | "auto_qualify"
  | "keep_qualified"
  | "keep_needs_review"
  | "keep_not_qualified"
  | "noop";

export type ProspectQualificationRepairInput = {
  contactId?: string;
  name?: string | null;
  company?: string | null;
  companyName?: string | null;
  businessType?: string | null;
  industry?: string | null;
  websiteUrl?: string | null;
  batchName?: string | null;
  importReason?: string | null;
  discoverySource?: string | null;
  analysisStatus?: string | null;
  reviewStatus?: string | null;
  needsReview?: boolean | null;
  priority?: string | null;
  recommendedOffer?: string | null;
  potentialFit?: string | null;
  leadScore?: number | null;
  confidence?: number | null;
  realEstateLikelihood?: number | null;
  reasoningSummary?: string | null;
  suggestedOutreachAngle?: string | null;
  approvedAt?: string | Date | null;
  approvedByUserId?: string | null;
  enrichmentTriggeredBy?: string | null;
  rawResult?: Record<string, unknown> | null;
  qualificationSource?: string | null;
};

export type ProspectQualificationRepairProposal = {
  action: ProspectQualificationRepairAction;
  reason: string;
  staleSoftNotAFit: boolean;
  genuineStrongReject: boolean;
  preservedManualDecision: boolean;
  before: {
    reviewStatus: string | null;
    needsReview: boolean;
    recommendedOffer: string | null;
    qualificationSource: string | null;
    approvedAt: string | null;
  };
  after: {
    reviewStatus: string;
    needsReview: boolean;
    recommendedOffer: string | null;
    qualificationSource: ProspectQualificationSource | null;
    approvedAt: "keep" | "set_now" | "clear";
    approvedByUserId: "keep" | "clear";
    rawResultPatch?: Record<string, unknown>;
  } | null;
};

const REAL_ESTATE_RE =
  /real[\s-]?estate|realtor|broker(?:age)?|realty|property\s*manag|mls\b/i;

function hasDiscoveryTargetAlignment(input: ProspectQualificationRepairInput): boolean {
  const blob = [
    input.businessType,
    input.batchName,
    input.importReason,
    input.discoverySource,
    input.industry,
    input.companyName,
    input.company,
    input.name,
  ]
    .filter(Boolean)
    .join(" ");
  if (!blob.trim()) return false;
  // Any selected discovery business type / Prospect AI batch is intentional targeting.
  if (/^prospect\s*ai:/i.test(String(input.batchName || ""))) return true;
  if (String(input.discoverySource || "").toLowerCase().includes("places")) {
    return Boolean(String(input.businessType || "").trim());
  }
  return REAL_ESTATE_RE.test(blob);
}

function isSoftStaleNotAFit(input: ProspectQualificationRepairInput): boolean {
  const offer = String(input.recommendedOffer || "").toLowerCase();
  if (offer !== "not_a_fit") return false;
  if (
    hasStrongFitRejectEvidenceForRepair({
      reasoningSummary: input.reasoningSummary,
      suggestedOutreachAngle: input.suggestedOutreachAngle,
    })
  ) {
    return false;
  }
  const score = typeof input.leadScore === "number" ? input.leadScore : 0;
  const fit = String(input.potentialFit || "").toLowerCase();
  const softWording =
    /different\s*industry|not\s*a\s*(software|tech|crm)|legitimate|no\s*crm|lacks?\s*automation|wrong\s*industry|poor\s*fit/i.test(
      `${input.reasoningSummary || ""} ${input.suggestedOutreachAngle || ""}`,
    );
  // High/medium match language with not_a_fit = classic pre-fix contradiction.
  if (score >= 55 || fit === "high" || fit === "medium") return true;
  if (hasDiscoveryTargetAlignment(input) && hasClearBusinessIdentity(input)) return true;
  if (softWording && hasClearBusinessIdentity(input)) return true;
  return false;
}

/**
 * Propose repair for one legacy row. Pure — no DB writes.
 * Idempotent: already auto-qualified clear-fit rows → noop / keep_qualified.
 */
export function proposeProspectQualificationRepair(
  input: ProspectQualificationRepairInput,
): ProspectQualificationRepairProposal {
  const offer = String(input.recommendedOffer || "").toLowerCase() || null;
  const review = String(input.reviewStatus || "pending").toLowerCase();
  const src =
    input.qualificationSource ||
    readProspectQualificationSource(input.rawResult || null);
  const before = {
    reviewStatus: input.reviewStatus ?? null,
    needsReview: input.needsReview === true,
    recommendedOffer: input.recommendedOffer ?? null,
    qualificationSource: src,
    approvedAt: input.approvedAt ? String(input.approvedAt) : null,
  };

  const humanLocked = hasHumanQualificationLock({
    approvedByUserId: input.approvedByUserId,
    reviewStatus: input.reviewStatus,
    recommendedOffer: input.recommendedOffer,
    enrichmentTriggeredBy: input.enrichmentTriggeredBy,
    rawResult: input.rawResult,
  });

  const strongReject =
    offer === "not_a_fit" &&
    hasStrongFitRejectEvidenceForRepair({
      reasoningSummary: input.reasoningSummary,
      suggestedOutreachAngle: input.suggestedOutreachAngle,
    });

  if (src === "manual_not_qualified") {
    return {
      action: "keep_not_qualified",
      reason: "preserved_manual_not_qualified",
      staleSoftNotAFit: false,
      genuineStrongReject: strongReject,
      preservedManualDecision: true,
      before,
      after: null,
    };
  }

  if (src === "manual_needs_review") {
    return {
      action: "keep_needs_review",
      reason: "preserved_manual_needs_review",
      staleSoftNotAFit: false,
      genuineStrongReject: false,
      preservedManualDecision: true,
      before,
      after: null,
    };
  }

  if (src === "manual" || (humanLocked && String(input.approvedByUserId || "").trim())) {
    if (review === "approved" && offer !== "not_a_fit") {
      return {
        action: "keep_qualified",
        reason: "preserved_manual_qualified",
        staleSoftNotAFit: false,
        genuineStrongReject: false,
        preservedManualDecision: true,
        before,
        after: null,
      };
    }
  }

  const analysis = String(input.analysisStatus || "").toLowerCase();
  if (analysis === "failed") {
    return {
      action: "keep_needs_review",
      reason: "ai_review_failed_exception",
      staleSoftNotAFit: false,
      genuineStrongReject: false,
      preservedManualDecision: false,
      before,
      after: null,
    };
  }

  // Legacy rows often used analysisStatus=needs_review for soft uncertainty.
  // Treat needs_review like completed when identity/target are clear.
  const analysisUsable = analysis === "completed" || analysis === "needs_review";
  if (!analysisUsable) {
    return {
      action: "noop",
      reason: "analysis_not_completed",
      staleSoftNotAFit: false,
      genuineStrongReject: false,
      preservedManualDecision: false,
      before,
      after: null,
    };
  }

  if (strongReject) {
    return {
      action: "keep_not_qualified",
      reason: "genuine_strong_reject_evidence",
      staleSoftNotAFit: false,
      genuineStrongReject: true,
      preservedManualDecision: false,
      before,
      after: null,
    };
  }

  const staleSoft = isSoftStaleNotAFit(input);
  const clearId = hasClearBusinessIdentity(input);
  const aligned = hasDiscoveryTargetAlignment(input);
  const alreadyApproved =
    review === "approved" || review === "qualified" || Boolean(input.approvedAt);

  if (alreadyApproved && offer !== "not_a_fit" && (src === "auto_ai" || src === "manual" || !src)) {
    // Ensure source stamped for legacy approved rows lacking qualificationSource.
    if (!src) {
      return {
        action: "auto_qualify",
        reason: "stamp_legacy_approved_as_auto_ai",
        staleSoftNotAFit: false,
        genuineStrongReject: false,
        preservedManualDecision: false,
        before,
        after: {
          reviewStatus: "approved",
          needsReview: false,
          recommendedOffer: offer || "general_demo",
          qualificationSource: "auto_ai",
          approvedAt: "keep",
          approvedByUserId: "keep",
          rawResultPatch: buildQualificationSourcePatch("auto_ai", input.rawResult),
        },
      };
    }
    return {
      action: "keep_qualified",
      reason: "already_qualified",
      staleSoftNotAFit: false,
      genuineStrongReject: false,
      preservedManualDecision: false,
      before,
      after: null,
    };
  }

  // Soft stale not_a_fit + clear target match → auto-qualify
  if (staleSoft && clearId) {
    return {
      action: "auto_qualify",
      reason: "reconcile_stale_soft_not_a_fit",
      staleSoftNotAFit: true,
      genuineStrongReject: false,
      preservedManualDecision: false,
      before,
      after: {
        reviewStatus: "approved",
        needsReview: false,
        recommendedOffer: "general_demo",
        qualificationSource: "auto_ai",
        approvedAt: alreadyApproved ? "keep" : "set_now",
        approvedByUserId: "clear",
        rawResultPatch: buildQualificationSourcePatch("auto_ai", input.rawResult),
      },
    };
  }

  // Hard not_a_fit without soft/stale signals and without discovery alignment → keep reject
  if (offer === "not_a_fit" && !staleSoft) {
    return {
      action: "keep_not_qualified",
      reason: "not_a_fit_without_soft_reconcile_signal",
      staleSoftNotAFit: false,
      genuineStrongReject: false,
      preservedManualDecision: false,
      before,
      after: null,
    };
  }

  // Clear-fit completed rows stuck in Needs Review (legacy needsReview / no approval)
  if (clearId && (aligned || String(input.businessType || "").trim())) {
    const uncertain =
      String(input.potentialFit || "").toLowerCase() === "unknown" &&
      (typeof input.confidence === "number" ? input.confidence < 20 : false);
    if (uncertain) {
      return {
        action: "keep_needs_review",
        reason: "genuine_insufficient_evidence",
        staleSoftNotAFit: false,
        genuineStrongReject: false,
        preservedManualDecision: false,
        before,
        after: null,
      };
    }
    return {
      action: "auto_qualify",
      reason: alreadyApproved
        ? "clear_legacy_not_a_fit_or_needs_review"
        : "legacy_completed_clear_fit_auto_qualify",
      staleSoftNotAFit: staleSoft,
      genuineStrongReject: false,
      preservedManualDecision: false,
      before,
      after: {
        reviewStatus: "approved",
        needsReview: false,
        recommendedOffer: offer === "not_a_fit" ? "general_demo" : offer || "general_demo",
        qualificationSource: "auto_ai",
        approvedAt: alreadyApproved ? "keep" : "set_now",
        approvedByUserId: "clear",
        rawResultPatch: buildQualificationSourcePatch("auto_ai", input.rawResult),
      },
    };
  }

  if (!clearId) {
    return {
      action: "keep_needs_review",
      reason: "missing_essential_identity",
      staleSoftNotAFit: false,
      genuineStrongReject: false,
      preservedManualDecision: false,
      before,
      after: null,
    };
  }

  return {
    action: "keep_needs_review",
    reason: "genuine_uncertainty_exception",
    staleSoftNotAFit: false,
    genuineStrongReject: false,
    preservedManualDecision: false,
    before,
    after: null,
  };
}
