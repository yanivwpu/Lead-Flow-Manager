/**
 * Prospect Enrich action helpers — snapshot IDs before any selection/filter mutation.
 * Toolbar and detail must use the same request-building + UI outcome rules.
 */

export type ProspectEnrichRequestBody = {
  contactIds: string[];
};

export type ProspectEnrichUiPlan = {
  /** Clear checkbox / select-all state. */
  clearSelection: boolean;
  /** Force Review filter to Enriching (undesired — always false). */
  switchToEnrichingFilter: boolean;
  /** Optimistic/authoritative row patch to Enriching. */
  patchRowsToEnriching: boolean;
  /** Keep prior selection on failure. */
  preserveSelection: boolean;
};

/** Immutable snapshot of selected IDs before any React state updates. */
export function snapshotEnrichContactIds(selectedIds: Iterable<string>): string[] {
  return Array.from(selectedIds);
}

/**
 * Build bulk-approve body from a pre-snapshotted ID list.
 * Never read live selection state here.
 */
export function buildBulkApproveRequestBody(idsToEnrich: readonly string[]): ProspectEnrichRequestBody {
  return { contactIds: [...idsToEnrich] };
}

export function assertEnrichIdsNonEmpty(idsToEnrich: readonly string[]): void {
  if (!idsToEnrich.length) {
    throw new Error("No prospects selected.");
  }
}

/** UI side-effects after Enrich API settles — success clears selection; failure preserves it. */
export function planEnrichActionUi(outcome: "success" | "failure"): ProspectEnrichUiPlan {
  if (outcome === "success") {
    return {
      clearSelection: true,
      switchToEnrichingFilter: false,
      patchRowsToEnriching: true,
      preserveSelection: false,
    };
  }
  return {
    clearSelection: false,
    switchToEnrichingFilter: false,
    patchRowsToEnriching: false,
    preserveSelection: true,
  };
}

export function formatEnrichmentStartedMessage(count: number): string {
  return count === 1
    ? "Enrichment started for 1 prospect."
    : `Enrichment started for ${count} prospects.`;
}
