/**
 * Centralized serialize/parse for discovery run diagnostics.
 * Stored temporarily as `errorMessage: "diagnostics:{json}"` on completed searches
 * (no migration). Never treat this prefix as a user-facing error.
 */

import type {
  ProspectAiDiscoveryRunDiagnostics,
  ProspectAiDiscoveryStopReason,
  ProspectAiLocationExpansionMode,
} from "./prospectAiDiscoveryPlan";

export const PROSPECT_AI_DIAGNOSTICS_PREFIX = "diagnostics:";

export function isDiscoveryDiagnosticsMessage(
  value: string | null | undefined,
): boolean {
  return String(value || "").startsWith(PROSPECT_AI_DIAGNOSTICS_PREFIX);
}

export function serializeDiscoveryDiagnostics(
  diagnostics: ProspectAiDiscoveryRunDiagnostics,
): string {
  // Cap excluded samples so the column stays bounded.
  const payload: ProspectAiDiscoveryRunDiagnostics = {
    ...diagnostics,
    excludedSamples: (diagnostics.excludedSamples || []).slice(0, 40),
  };
  return `${PROSPECT_AI_DIAGNOSTICS_PREFIX}${JSON.stringify(payload)}`;
}

export function parseDiscoveryDiagnostics(
  value: string | null | undefined,
): ProspectAiDiscoveryRunDiagnostics | null {
  const raw = String(value || "");
  if (!raw.startsWith(PROSPECT_AI_DIAGNOSTICS_PREFIX)) return null;
  try {
    const json = JSON.parse(raw.slice(PROSPECT_AI_DIAGNOSTICS_PREFIX.length)) as Record<
      string,
      unknown
    >;
    return normalizeDiagnosticsRecord(json);
  } catch {
    return null;
  }
}

/** User-facing search status — never show diagnostics JSON as an error. */
export function discoverySearchErrorForDisplay(
  status: string | null | undefined,
  errorMessage: string | null | undefined,
): string | null {
  if (isDiscoveryDiagnosticsMessage(errorMessage)) return null;
  if (String(status || "").toLowerCase() === "completed") return null;
  const msg = String(errorMessage || "").trim();
  return msg || null;
}

export function normalizeDiagnosticsRecord(
  input: Record<string, unknown> | null | undefined,
): ProspectAiDiscoveryRunDiagnostics {
  const n = (v: unknown, fallback = 0) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  };
  const stop = String(input?.stopReason || "source_exhausted") as ProspectAiDiscoveryStopReason;
  return {
    runId: input?.runId != null ? String(input.runId) : null,
    targetCount: n(input?.targetCount, 50),
    locationExpansion: String(
      input?.locationExpansion || "nearby",
    ) as ProspectAiLocationExpansionMode,
    expandedLocations: Array.isArray(input?.expandedLocations)
      ? (input!.expandedLocations as string[]).map(String)
      : [],
    queryVariationsAttempted: Array.isArray(input?.queryVariationsAttempted)
      ? (input!.queryVariationsAttempted as string[]).map(String)
      : [],
    pagesFetched: n(input?.pagesFetched),
    providerCalls: n(input?.providerCalls),
    provider: String(input?.provider || "google_places"),
    rawResults: n(input?.rawResults),
    uniqueInRun: n(input?.uniqueInRun),
    duplicatesInRun: n(input?.duplicatesInRun),
    alreadyInWorkspace: n(input?.alreadyInWorkspace),
    rejectedInvalid: n(input?.rejectedInvalid),
    rejectedClosed: n(input?.rejectedClosed),
    rejectedQuality: n(input?.rejectedQuality),
    rejectedRelevance: n(input?.rejectedRelevance),
    needsAttention: n(input?.needsAttention ?? input?.usableNeedsAttention),
    usableNeedsAttention: n(input?.usableNeedsAttention ?? input?.needsAttention),
    possibleDuplicates: n(input?.possibleDuplicates),
    readyForReview: n(input?.readyForReview ?? input?.saved),
    saved: n(input?.saved ?? input?.netNewUsable),
    netNewUsable: n(input?.netNewUsable ?? input?.saved),
    quotaConsumed: n(input?.quotaConsumed ?? input?.netNewUsable ?? input?.saved),
    stopReason: stop,
    resultsPerQuery: Array.isArray(input?.resultsPerQuery)
      ? (input!.resultsPerQuery as ProspectAiDiscoveryRunDiagnostics["resultsPerQuery"])
      : [],
    excludedSamples: Array.isArray(input?.excludedSamples)
      ? (input!.excludedSamples as ProspectAiDiscoveryRunDiagnostics["excludedSamples"])
      : [],
  };
}

export function discoveryStopReasonLabel(reason: string | null | undefined): string {
  switch (String(reason || "")) {
    case "target_reached":
      return "Target reached";
    case "source_exhausted":
      return "No more results from Google";
    case "no_more_unique_results":
      return "No more new unique businesses";
    case "quota_exhausted":
      return "Monthly discovery quota reached";
    case "max_provider_calls":
      return "Search limit reached";
    case "rate_limited":
      return "Google rate limit — try again shortly";
    case "provider_error":
      return "Google Places error";
    case "user_cancelled":
      return "Cancelled";
    case "timeout":
      return "Timed out";
    default:
      return String(reason || "Completed").replace(/_/g, " ");
  }
}
