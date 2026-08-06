/**
 * Multi-query + paginated Prospect AI discovery against Google Places.
 * Target = net-new unique usable businesses (ready + needs_attention).
 * Does not count in-run duplicates, workspace matches, or quality rejects.
 */
import {
  PROSPECT_AI_DISCOVERY_MAX_PAGES_PER_QUERY,
  PROSPECT_AI_DISCOVERY_MAX_PROVIDER_CALLS,
  PROSPECT_AI_PLACES_PAGE_SIZE,
  buildProspectAiDiscoveryPlan,
  clampDiscoveryTargetToQuota,
  type ProspectAiDiscoveryExcludedSample,
  type ProspectAiDiscoveryRunDiagnostics,
  type ProspectAiDiscoveryStopReason,
  type ProspectAiLocationExpansionMode,
} from "@shared/prospectAiDiscoveryPlan";
import type { ProspectAiNormalizedProspect } from "@shared/prospectAI";
import {
  buildIdentityKeys,
  classifyIdentityOverlap,
  type ProspectAiIdentityKeys,
} from "@shared/prospectAiDiscoveryMatch";
import {
  countsTowardDiscoveryTarget,
  evaluateDiscoveryQuality,
  evaluateDiscoveryRelevance,
  isPossibleDuplicateReason,
  type ProspectAiDiscoveryDisposition,
  type ProspectAiDiscoveryReasonCode,
} from "@shared/prospectAiDiscoveryQuality";
import { normalizeProspectList } from "./normalize";
import {
  fetchPlacesTextSearchPage,
  geocodeLocation,
  mapPlacesApiPlaceToCandidate,
  type PlacesApiPlace,
} from "./providers/googlePlacesProvider";
import type { FetchLike } from "./providers/types";
import {
  findWorkspaceMatch,
  type DiscoveryWorkspaceIndex,
} from "./discoveryWorkspaceIndex";

export type OrchestratedProspect = ProspectAiNormalizedProspect & {
  discoveryQuery: string;
  discoveryLocation: string;
  disposition: "ready" | "needs_attention";
  attentionReason: ProspectAiDiscoveryReasonCode | null;
  providerTypes: string[];
  alternateNames: string[];
  alternatePhones: string[];
  alternateWebsites: string[];
  discoveryQueries: string[];
  discoveryLocations: string[];
  providerPlaceIds: string[];
};

export type DiscoveryOrchestratorInput = {
  businessType: string;
  location: string;
  radiusKm?: number;
  targetCount: number;
  locationExpansion: ProspectAiLocationExpansionMode;
  quotaRemaining: number;
  fetchFn?: FetchLike;
  /** Optional abort — checked between provider calls. */
  isCancelled?: () => boolean;
  /** Existing CRM / Prospect AI / pending discovery identities. */
  workspaceIndex?: DiscoveryWorkspaceIndex;
};

export type DiscoveryOrchestratorResult = {
  prospects: OrchestratedProspect[];
  diagnostics: ProspectAiDiscoveryRunDiagnostics;
};

function radiusMeters(radiusKm: number | undefined): number | null {
  if (radiusKm == null || !Number.isFinite(radiusKm)) return null;
  const clamped = Math.min(Math.max(radiusKm, 0.5), 50);
  return Math.round(clamped * 1000);
}

function emptyDiagnostics(
  target: number,
  plan: ReturnType<typeof buildProspectAiDiscoveryPlan>,
  stopReason: ProspectAiDiscoveryStopReason,
): ProspectAiDiscoveryRunDiagnostics {
  return {
    runId: null,
    targetCount: target,
    locationExpansion: plan.locationExpansion,
    expandedLocations: plan.expandedLocations,
    queryVariationsAttempted: [],
    pagesFetched: 0,
    providerCalls: 0,
    provider: "google_places",
    rawResults: 0,
    uniqueInRun: 0,
    duplicatesInRun: 0,
    alreadyInWorkspace: 0,
    alreadyArchived: 0,
    rejectedInvalid: 0,
    rejectedClosed: 0,
    rejectedQuality: 0,
    rejectedRelevance: 0,
    needsAttention: 0,
    usableNeedsAttention: 0,
    possibleDuplicates: 0,
    readyForReview: 0,
    saved: 0,
    netNewUsable: 0,
    quotaConsumed: 0,
    stopReason,
    resultsPerQuery: [],
    excludedSamples: [],
  };
}

function pushExcluded(
  samples: ProspectAiDiscoveryExcludedSample[],
  sample: ProspectAiDiscoveryExcludedSample,
) {
  if (samples.length >= 40) return;
  samples.push(sample);
}

function mergeInto(
  existing: OrchestratedProspect,
  incoming: OrchestratedProspect,
): OrchestratedProspect {
  const names = new Set([existing.name, ...existing.alternateNames, incoming.name]);
  const phones = new Set(
    [existing.phone, ...existing.alternatePhones, incoming.phone].filter(Boolean) as string[],
  );
  const websites = new Set(
    [existing.website, ...existing.alternateWebsites, incoming.website].filter(
      Boolean,
    ) as string[],
  );
  const queries = new Set([...existing.discoveryQueries, ...incoming.discoveryQueries]);
  const locs = new Set([...existing.discoveryLocations, ...incoming.discoveryLocations]);
  const placeIds = new Set([...existing.providerPlaceIds, ...incoming.providerPlaceIds]);
  // Prefer record with more identity signals
  const score = (p: OrchestratedProspect) =>
    (p.website ? 2 : 0) + (p.phone ? 2 : 0) + (p.address ? 1 : 0) + (p.email ? 1 : 0);
  const best = score(incoming) > score(existing) ? incoming : existing;
  return {
    ...best,
    alternateNames: [...names].filter((n) => n && n !== best.name),
    alternatePhones: [...phones].filter((p) => p !== best.phone),
    alternateWebsites: [...websites].filter((w) => w !== best.website),
    discoveryQueries: [...queries],
    discoveryLocations: [...locs],
    providerPlaceIds: [...placeIds],
    disposition:
      existing.disposition === "needs_attention" || incoming.disposition === "needs_attention"
        ? "needs_attention"
        : "ready",
    attentionReason: existing.attentionReason || incoming.attentionReason,
  };
}

export async function runProspectAiDiscoveryOrchestrator(
  input: DiscoveryOrchestratorInput,
): Promise<DiscoveryOrchestratorResult> {
  const plan = buildProspectAiDiscoveryPlan({
    businessType: input.businessType,
    location: input.location,
    targetCount: input.targetCount,
    locationExpansion: input.locationExpansion,
  });
  const target = clampDiscoveryTargetToQuota(plan.targetCount, input.quotaRemaining);
  const fetchFn = input.fetchFn ?? fetch;
  const workspaceIndex = input.workspaceIndex;

  const usable: OrchestratedProspect[] = [];
  const usableKeys: ProspectAiIdentityKeys[] = [];
  let rawResults = 0;
  let duplicatesInRun = 0;
  let alreadyInWorkspace = 0;
  let alreadyArchived = 0;
  let rejectedInvalid = 0;
  let rejectedClosed = 0;
  let rejectedQuality = 0;
  let rejectedRelevance = 0;
  let possibleDuplicates = 0;
  let pagesFetched = 0;
  let providerCalls = 0;
  let stopReason: ProspectAiDiscoveryStopReason = "source_exhausted";
  const resultsPerQuery: ProspectAiDiscoveryRunDiagnostics["resultsPerQuery"] = [];
  const queryVariationsAttempted: string[] = [];
  const excludedSamples: ProspectAiDiscoveryExcludedSample[] = [];

  let apiKey = "";
  try {
    apiKey = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
    if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not configured");
  } catch {
    return {
      prospects: [],
      diagnostics: emptyDiagnostics(target, plan, "provider_error"),
    };
  }

  if (input.quotaRemaining <= 0) {
    return {
      prospects: [],
      diagnostics: emptyDiagnostics(target, plan, "quota_exhausted"),
    };
  }

  let locationBias: {
    circle: { center: { latitude: number; longitude: number }; radius: number };
  } | null = null;
  const meters = radiusMeters(input.radiusKm);
  if (meters != null) {
    try {
      const geo = await geocodeLocation(plan.requestedLocation, apiKey, fetchFn);
      if (geo) {
        locationBias = {
          circle: {
            center: { latitude: geo.latitude, longitude: geo.longitude },
            radius: meters,
          },
        };
      }
    } catch {
      /* bias optional */
    }
  }

  outer: for (const q of plan.queries) {
    if (usable.length >= target) {
      stopReason = "target_reached";
      break;
    }
    if (providerCalls >= PROSPECT_AI_DISCOVERY_MAX_PROVIDER_CALLS) {
      stopReason = "max_provider_calls";
      break;
    }
    if (input.isCancelled?.()) {
      stopReason = "user_cancelled";
      break;
    }

    queryVariationsAttempted.push(q.textQuery);
    let pageToken: string | undefined;
    let pagesForQuery = 0;
    let returnedForQuery = 0;
    let uniqueAddedForQuery = 0;

    for (let page = 0; page < PROSPECT_AI_DISCOVERY_MAX_PAGES_PER_QUERY; page++) {
      if (usable.length >= target) {
        stopReason = "target_reached";
        break outer;
      }
      if (providerCalls >= PROSPECT_AI_DISCOVERY_MAX_PROVIDER_CALLS) {
        stopReason = "max_provider_calls";
        break outer;
      }
      if (input.isCancelled?.()) {
        stopReason = "user_cancelled";
        break outer;
      }

      let places: PlacesApiPlace[] = [];
      let nextPageToken: string | undefined;
      try {
        providerCalls += 1;
        const pageResult = await fetchPlacesTextSearchPage({
          apiKey,
          textQuery: q.textQuery,
          pageSize: PROSPECT_AI_PLACES_PAGE_SIZE,
          pageToken,
          locationBias,
          fetchFn,
        });
        places = pageResult.places;
        nextPageToken = pageResult.nextPageToken;
        pagesFetched += 1;
        pagesForQuery += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/429|rate/i.test(msg)) {
          stopReason = "rate_limited";
          break outer;
        }
        stopReason = "provider_error";
        break outer;
      }

      rawResults += places.length;
      returnedForQuery += places.length;

      for (const place of places) {
        if (usable.length >= target) {
          stopReason = "target_reached";
          break;
        }

        const types = Array.isArray(place.types) ? place.types.map(String) : [];
        const quality = evaluateDiscoveryQuality({
          name: place.displayName?.text,
          providerPlaceId: place.id,
          website: place.websiteUri,
          businessStatus: place.businessStatus,
          types,
          address: place.formattedAddress,
          phone: place.nationalPhoneNumber || place.internationalPhoneNumber,
        });

        if (quality.disposition === "rejected") {
          if (quality.reason === "permanently_closed") rejectedClosed += 1;
          else if (quality.reason === "invalid_business_identity") rejectedInvalid += 1;
          else rejectedQuality += 1;
          pushExcluded(excludedSamples, {
            name: String(place.displayName?.text || "Unknown"),
            disposition: "rejected",
            reason: quality.reason,
            providerPlaceId: String(place.id || "").replace(/^places\//, "") || null,
            discoveryQuery: q.textQuery,
          });
          continue;
        }

        const candidate = mapPlacesApiPlaceToCandidate(place);
        const normalized = normalizeProspectList([candidate])[0];
        if (!normalized) {
          rejectedInvalid += 1;
          pushExcluded(excludedSamples, {
            name: String(place.displayName?.text || "Unknown"),
            disposition: "rejected",
            reason: "malformed_provider_record",
            discoveryQuery: q.textQuery,
          });
          continue;
        }

        const relevance = evaluateDiscoveryRelevance({
          requestedBusinessType: input.businessType,
          name: normalized.name,
          types,
          primaryType: normalized.businessType,
        });
        if (relevance.disposition === "rejected") {
          rejectedRelevance += 1;
          pushExcluded(excludedSamples, {
            name: normalized.name,
            disposition: "rejected",
            reason: relevance.reason,
            providerPlaceId: normalized.providerPlaceId,
            discoveryQuery: q.textQuery,
          });
          continue;
        }

        let disposition: ProspectAiDiscoveryDisposition =
          quality.disposition === "needs_attention" ||
          relevance.disposition === "needs_attention"
            ? "needs_attention"
            : "ready";
        let attentionReason: ProspectAiDiscoveryReasonCode | null =
          quality.reason || relevance.reason || null;

        const keys = buildIdentityKeys({
          name: normalized.name,
          providerPlaceId: normalized.providerPlaceId,
          website: normalized.website,
          phone: normalized.phone,
          email: normalized.email,
          address: normalized.address,
        });

        // In-run layered dedupe
        let collapsed = false;
        let possibleDupReason: ProspectAiDiscoveryReasonCode | null = null;
        for (let i = 0; i < usable.length; i++) {
          const overlap = classifyIdentityOverlap(keys, usableKeys[i]!);
          if (!overlap) continue;
          if (overlap.autoCollapse) {
            duplicatesInRun += 1;
            usable[i] = mergeInto(usable[i]!, {
              ...normalized,
              discoveryQuery: q.textQuery,
              discoveryLocation: q.locationLabel,
              disposition: disposition === "needs_attention" ? "needs_attention" : "ready",
              attentionReason,
              providerTypes: types,
              alternateNames: [],
              alternatePhones: [],
              alternateWebsites: [],
              discoveryQueries: [q.textQuery],
              discoveryLocations: [q.locationLabel],
              providerPlaceIds: [normalized.providerPlaceId],
            });
            collapsed = true;
            break;
          }
          // Soft in-run overlap — not chargeable; continue searching for net-new.
          possibleDupReason =
            overlap.matchType === "website_domain"
              ? "possible_branch_duplicate"
              : "likely_duplicate";
        }
        if (collapsed) continue;

        // Workspace / CRM match (hard = already exists; soft = possible duplicate)
        if (workspaceIndex) {
          const hit = findWorkspaceMatch(workspaceIndex, keys, { allowSoft: true });
          if (hit?.match.autoCollapse) {
            const lifecycle = String(hit.lifecycleStatus || "active").toLowerCase();
            const isArchivedLifecycle =
              lifecycle === "archived" ||
              lifecycle === "trashed" ||
              lifecycle === "deleted";
            if (isArchivedLifecycle) {
              alreadyArchived += 1;
              pushExcluded(excludedSamples, {
                name: normalized.name,
                disposition: "already_archived",
                reason:
                  lifecycle === "trashed"
                    ? "already_trashed"
                    : lifecycle === "deleted"
                      ? "already_deleted"
                      : "already_archived",
                matchType: hit.match.matchType,
                existingRecordId: hit.recordId,
                existingRecordLabel: hit.label,
                providerPlaceId: normalized.providerPlaceId,
                discoveryQuery: q.textQuery,
              });
              continue;
            }
            alreadyInWorkspace += 1;
            pushExcluded(excludedSamples, {
              name: normalized.name,
              disposition: "already_exists",
              reason: hit.match.reason,
              matchType: hit.match.matchType,
              existingRecordId: hit.recordId,
              existingRecordLabel: hit.label,
              providerPlaceId: normalized.providerPlaceId,
              discoveryQuery: q.textQuery,
            });
            continue;
          }
          if (hit && !hit.match.autoCollapse) {
            possibleDupReason = "possible_existing_workspace_match";
            possibleDuplicates += 1;
            pushExcluded(excludedSamples, {
              name: normalized.name,
              disposition: "possible_duplicate",
              reason: possibleDupReason,
              matchType: hit.match.matchType,
              existingRecordId: hit.recordId,
              existingRecordLabel: hit.label,
              providerPlaceId: normalized.providerPlaceId,
              discoveryQuery: q.textQuery,
            });
            continue;
          }
        }

        if (possibleDupReason || isPossibleDuplicateReason(attentionReason)) {
          possibleDuplicates += 1;
          pushExcluded(excludedSamples, {
            name: normalized.name,
            disposition: "possible_duplicate",
            reason: possibleDupReason || attentionReason || "likely_duplicate",
            providerPlaceId: normalized.providerPlaceId,
            discoveryQuery: q.textQuery,
          });
          continue;
        }

        // Only ready + usable needs-attention count toward target / quota.
        if (
          !countsTowardDiscoveryTarget({
            disposition,
            attentionReason,
          })
        ) {
          continue;
        }

        usable.push({
          ...normalized,
          discoveryQuery: q.textQuery,
          discoveryLocation: q.locationLabel,
          disposition,
          attentionReason: disposition === "needs_attention" ? attentionReason : null,
          providerTypes: types,
          alternateNames: [],
          alternatePhones: [],
          alternateWebsites: [],
          discoveryQueries: [q.textQuery],
          discoveryLocations: [q.locationLabel],
          providerPlaceIds: [normalized.providerPlaceId],
        });
        usableKeys.push(keys);
        uniqueAddedForQuery += 1;
      }

      if (usable.length >= target) {
        stopReason = "target_reached";
        break outer;
      }
      if (!nextPageToken) break;
      pageToken = nextPageToken;
      await new Promise((r) => setTimeout(r, 200));
    }

    resultsPerQuery.push({
      textQuery: q.textQuery,
      pages: pagesForQuery,
      returned: returnedForQuery,
      uniqueAdded: uniqueAddedForQuery,
    });
  }

  if (usable.length >= target) {
    stopReason = "target_reached";
  } else if (
    stopReason !== "rate_limited" &&
    stopReason !== "provider_error" &&
    stopReason !== "user_cancelled" &&
    stopReason !== "max_provider_calls" &&
    stopReason !== "quota_exhausted"
  ) {
    stopReason =
      usable.length === 0 ? "source_exhausted" : "no_more_unique_results";
  }

  const prospects = usable.slice(0, target);
  const usableNeedsAttention = prospects.filter((p) => p.disposition === "needs_attention").length;
  const readyForReview = prospects.length - usableNeedsAttention;

  return {
    prospects,
    diagnostics: {
      runId: null,
      targetCount: target,
      locationExpansion: plan.locationExpansion,
      expandedLocations: plan.expandedLocations,
      queryVariationsAttempted,
      pagesFetched,
      providerCalls,
      provider: "google_places",
      rawResults,
      uniqueInRun: prospects.length,
      duplicatesInRun,
      alreadyInWorkspace,
      alreadyArchived,
      rejectedInvalid,
      rejectedClosed,
      rejectedQuality,
      rejectedRelevance,
      needsAttention: usableNeedsAttention,
      usableNeedsAttention,
      possibleDuplicates,
      readyForReview,
      saved: prospects.length,
      netNewUsable: prospects.length,
      quotaConsumed: prospects.length,
      stopReason,
      resultsPerQuery,
      excludedSamples,
    },
  };
}
