import { assertProductionDevSeedSourceAllowed } from "@shared/inventory/inventoryDevSeedGuard";
import { providerSupportsListingSync, type InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import { describeResoNormalizationFailure } from "@shared/inventory/reso/resoNormalizer";
import { isMatchableInventoryStatus } from "@shared/inventory/inventoryListingSchema";
import {
  buildResoFailureUserMessage,
  isResoHttpError,
  resoFailureDiagnosticsFromError,
  type ResoSyncFailureDiagnostics,
} from "@shared/inventory/reso/resoSyncFailureDiagnostics";
import { readInventorySyncScope } from "@shared/inventory/reso/resoSyncScope";
import {
  mergeResoSyncCursor,
  maxTimestampFromRows,
  readResoSyncCursor,
  type ResoSyncMode,
} from "@shared/inventory/reso/resoSyncTypes";
import type { InventorySource } from "@shared/schema";
import {
  countMatchableListingsForSource,
  getInventorySource,
  markListingsInactiveExcept,
  patchInventorySource,
  upsertInventoryListingWithPolicy,
  type ListingUpsertResult,
  type MatchableCountCache,
} from "./inventoryDb";
import { processInventoryOpportunitiesAfterSync } from "./inventoryOpportunityService";
import { buildAdapterContext } from "./inventorySourceService";
import { getInventoryProviderAdapter } from "./inventoryProviderRegistry";
import { backfillMissingFlyerColumnsForSource } from "./inventoryFlyerBackfill";

const runningSyncs = new Set<string>();
/** No progress for this long → treat DB "running" as stale (safe for multi-instance). */
const STALE_SYNC_MS = 5 * 60 * 1000;

export type StartSyncOptions = {
  mode?: ResoSyncMode;
  /** Force a fresh initial import (ignore resume checkpoint). */
  fresh?: boolean;
};

export type StartSyncResult =
  | { started: true }
  | { started: false; reason: "already_running" | "not_supported" | "source_not_found" | "dev_seed_blocked" };

function resolveSyncMode(source: InventorySource, options?: StartSyncOptions): ResoSyncMode {
  if (options?.mode) return options.mode;
  const cursor = readResoSyncCursor((source.config || {}) as Record<string, unknown>);
  if (!cursor.initialImportComplete) return "initial";
  return "incremental";
}

function readDatasetId(source: InventorySource): string | null {
  const cfg = (source.config || {}) as Record<string, unknown>;
  if (source.provider === "bridge_interactive") {
    return typeof cfg.datasetId === "string" ? cfg.datasetId : null;
  }
  if (source.provider === "mls_grid" || source.provider === "trestle") {
    return typeof cfg.originatingSystemName === "string" ? cfg.originatingSystemName : null;
  }
  return null;
}

function modificationTimestampField(provider: string): string {
  return provider === "bridge_interactive" ? "BridgeModificationTimestamp" : "ModificationTimestamp";
}

function statNum(stats: Record<string, unknown> | null | undefined, key: string): number {
  const v = stats?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function lastProgressMs(source: InventorySource): number {
  const stats = (source.lastSyncStats || {}) as Record<string, unknown>;
  const raw = stats.lastProgressAt ?? stats.startedAt;
  if (typeof raw === "string") {
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function buildStaleSyncError(source: InventorySource): string {
  const stats = (source.lastSyncStats || {}) as Record<string, unknown>;
  const imported = statNum(stats, "listingsImported") || statNum(stats, "upserted");
  const fetched = statNum(stats, "listingsFetched");
  const skipped = statNum(stats, "listingsSkipped") || statNum(stats, "skipped");
  const pages = statNum(stats, "pagesFetched");
  const cursor = readResoSyncCursor((source.config || {}) as Record<string, unknown>);

  if (imported > 0) {
    const resumeHint = cursor.initialImportResumeUrl
      ? " Sync Now will resume from the last checkpoint."
      : " Sync Now to continue.";
    return `Sync stopped at page ${pages} with ${imported.toLocaleString()} listings saved.${resumeHint}`;
  }
  if (fetched > 0 && skipped >= fetched && fetched > 0) {
    const sample = typeof stats.sampleSkipReason === "string" ? stats.sampleSkipReason : null;
    return `${fetched.toLocaleString()} listings were fetched but none could be imported (${skipped.toLocaleString()} skipped${sample ? `: ${sample}` : ""}). Verify your dataset fields with support.`;
  }
  if (fetched > 0) {
    return `Sync stopped after fetching ${fetched.toLocaleString()} listings (page ${pages}) before import finished. Sync Now resumes from the last saved checkpoint.`;
  }
  return "Sync was interrupted before listings were fetched. Click Sync Now to retry.";
}

function isResoAuthFailure(err: unknown): boolean {
  return isResoHttpError(err) && (err.status === 401 || err.status === 403);
}

function readODataFilterFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const raw = parsed.searchParams.get("$filter");
    return raw ? decodeURIComponent(raw) : undefined;
  } catch {
    return undefined;
  }
}

function buildSyncFailureDiagnostics(
  err: unknown,
  source: InventorySource,
  syncMode: ResoSyncMode,
  datasetId: string | null,
  queryContext?: { oDataFilter?: string; requestUrl?: string },
): ResoSyncFailureDiagnostics {
  const requestUrl = isResoHttpError(err) ? err.requestUrl : queryContext?.requestUrl;
  return resoFailureDiagnosticsFromError(err, {
    phase: "import",
    provider: source.provider,
    datasetId,
    syncMode,
    oDataFilter: queryContext?.oDataFilter ?? readODataFilterFromUrl(requestUrl),
    requestUrl,
  });
}

function extractSyncErrorDetail(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message && !err.message.includes(cause.message)) {
    return `${err.message} | Postgres: ${cause.message}`;
  }
  return err.message;
}

function friendlySyncError(raw: string): string {
  if (raw.includes("MLS Grid HTTP 401") || raw.includes("Unauthorized")) {
    return "Access token was rejected. Check your token and originating system name.";
  }
  if (raw.includes("MLS Grid HTTP 403")) {
    return "Access denied for this listing feed.";
  }
  if (raw.includes("MLS Grid HTTP 429")) {
    return "MLS Grid rate limit reached. Sync will retry automatically on the next run.";
  }
  if (raw.includes("MLS Grid HTTP")) {
    return "Could not reach the listing feed. Try again later.";
  }
  if (raw.includes("Trestle credentials were rejected") || raw.includes("Trestle authentication failed")) {
    return "Trestle credentials were rejected. Check your client ID and secret, then validate again.";
  }
  if (raw.includes("Trestle HTTP 401") || raw.includes("Trestle HTTP 403")) {
    return "Trestle access was denied. Verify your feed credentials and originating system name.";
  }
  if (raw.includes("Trestle HTTP 429")) {
    return "Trestle rate limit reached. Wait a few minutes and sync again.";
  }
  if (raw.includes("Trestle HTTP")) {
    return "Could not reach Trestle. Try again later or contact your data provider.";
  }
  if (raw.includes("Bridge Interactive HTTP 401") || raw.includes("Bridge Interactive HTTP 403")) {
    return "Bridge server token was rejected. Check your token and dataset ID.";
  }
  if (raw.includes("Bridge Interactive HTTP 429")) {
    return "Bridge rate limit reached. Wait a few minutes and sync again.";
  }
  if (raw.includes("Bridge Interactive HTTP")) {
    return "Could not reach Bridge Interactive. Try again later or contact your data provider.";
  }
  if (raw.includes("timed out") || raw.includes("TimeoutError") || raw.includes("AbortError")) {
    return "Listing feed request timed out. Sync Now resumes from the last checkpoint when available.";
  }
  return raw.slice(0, 2000);
}

async function processSyncListingRow(
  userId: string,
  sourceId: string,
  raw: unknown,
  adapter: ReturnType<typeof getInventoryProviderAdapter>,
  ctx: ReturnType<typeof buildAdapterContext>,
  syncScope: ReturnType<typeof readInventorySyncScope>,
  matchableCountCache: MatchableCountCache,
  upsertResults: ListingUpsertResult[],
): Promise<{
  skippedInvalid: boolean;
  skippedDueToCap: boolean;
  skippedOutOfScope: boolean;
  upserted: boolean;
  inactiveFromFeed: boolean;
  sampleSkipReason: string | null;
}> {
  const normalized = adapter.normalizeListing(raw, ctx);
  if (!normalized) {
    return {
      skippedInvalid: true,
      skippedDueToCap: false,
      skippedOutOfScope: false,
      upserted: false,
      inactiveFromFeed: false,
      sampleSkipReason: describeResoNormalizationFailure(raw),
    };
  }

  const inactiveFromFeed = !isMatchableInventoryStatus(normalized.status);
  const outcome = await upsertInventoryListingWithPolicy(
    userId,
    sourceId,
    normalized,
    syncScope,
    matchableCountCache,
  );

  if (outcome.outcome === "skipped_cap") {
    return {
      skippedInvalid: false,
      skippedDueToCap: true,
      skippedOutOfScope: false,
      upserted: false,
      inactiveFromFeed,
      sampleSkipReason: null,
    };
  }
  if (outcome.outcome === "skipped_out_of_scope") {
    return {
      skippedInvalid: false,
      skippedDueToCap: false,
      skippedOutOfScope: true,
      upserted: false,
      inactiveFromFeed,
      sampleSkipReason: null,
    };
  }

  upsertResults.push(outcome.result);
  return {
    skippedInvalid: false,
    skippedDueToCap: false,
    skippedOutOfScope: false,
    upserted: true,
    inactiveFromFeed,
    sampleSkipReason: null,
  };
}

function buildImportFailureMessage(
  listingsFetched: number,
  skipped: number,
  sampleSkipReason: string | null,
): string {
  const sample = sampleSkipReason ? ` Example: ${sampleSkipReason}.` : "";
  return `${listingsFetched.toLocaleString()} listings were fetched but none could be imported (${skipped.toLocaleString()} rows skipped).${sample} Contact support if this persists.`;
}

async function persistSyncCheckpoint(
  sourceId: string,
  userId: string,
  config: Record<string, unknown>,
  stats: Record<string, unknown>,
): Promise<void> {
  await patchInventorySource(sourceId, userId, {
    config,
    lastSyncStats: {
      ...stats,
      lastProgressAt: new Date().toISOString(),
    },
  });
}

/**
 * Mark stale DB "running" syncs as failed so a new sync can start.
 * Only runs when progress has been idle longer than STALE_SYNC_MS.
 * Preserves resume URL and imported listings.
 */
export async function recoverStaleInventorySync(
  source: InventorySource,
): Promise<InventorySource> {
  if (source.lastSyncStatus !== "running") return source;
  if (runningSyncs.has(source.id)) return source;

  const progressAt = lastProgressMs(source);
  if (progressAt > 0 && Date.now() - progressAt < STALE_SYNC_MS) {
    return source;
  }

  const error = buildStaleSyncError(source);
  const stats = (source.lastSyncStats || {}) as Record<string, unknown>;
  const imported = statNum(stats, "listingsImported") || statNum(stats, "upserted");

  console.warn("[inventory-sync] recovering stale sync", {
    sourceId: source.id,
    provider: source.provider,
    datasetId: readDatasetId(source),
    pagesFetched: statNum(stats, "pagesFetched"),
    listingsImported: imported,
    listingsFetched: statNum(stats, "listingsFetched"),
  });

  const recovered = await patchInventorySource(source.id, source.userId, {
    lastSyncStatus: "failed",
    lastSyncError: error,
    connectionStatus: imported > 0 || source.connectionStatus === "connected" ? "connected" : "error",
    lastSyncStats: {
      ...stats,
      failed: true,
      staleRecovery: true,
      recoveredAt: new Date().toISOString(),
    },
  });
  return recovered ?? source;
}

/** @deprecated Use recoverStaleInventorySync */
export async function recoverOrphanedInventorySync(source: InventorySource): Promise<InventorySource> {
  return recoverStaleInventorySync(source);
}

export async function startInventorySourceSync(
  userId: string,
  sourceId: string,
  options?: StartSyncOptions,
): Promise<StartSyncResult> {
  let source = await getInventorySource(userId, sourceId);
  if (!source) return { started: false, reason: "source_not_found" };
  if (!providerSupportsListingSync(source.provider as InventoryProvider)) {
    return { started: false, reason: "not_supported" };
  }

  const devSeedGuard = assertProductionDevSeedSourceAllowed(
    (source.config || {}) as Record<string, unknown>,
  );
  if (!devSeedGuard.ok) {
    return { started: false, reason: "dev_seed_blocked" };
  }

  if (source.lastSyncStatus === "running") {
    if (runningSyncs.has(sourceId)) {
      return { started: false, reason: "already_running" };
    }
    const progressAt = lastProgressMs(source);
    if (progressAt > 0 && Date.now() - progressAt < STALE_SYNC_MS) {
      return { started: false, reason: "already_running" };
    }
    source = await recoverStaleInventorySync(source);
  }

  if (runningSyncs.has(sourceId)) {
    return { started: false, reason: "already_running" };
  }

  runningSyncs.add(sourceId);
  const syncMode = resolveSyncMode(source, options);
  const datasetId = readDatasetId(source);
  const cursor = readResoSyncCursor((source.config || {}) as Record<string, unknown>);
  const isResume =
    !options?.fresh &&
    syncMode === "initial" &&
    !cursor.initialImportComplete &&
    !!cursor.initialImportResumeUrl?.trim();

  const prevStats = (source.lastSyncStats || {}) as Record<string, unknown>;

  console.log("[inventory-sync] starting", {
    sourceId,
    userId,
    provider: source.provider,
    syncMode,
    datasetId,
    resume: isResume,
  });

  let nextConfig = { ...(source.config || {}) } as Record<string, unknown>;
  if (options?.fresh && syncMode === "initial") {
    nextConfig = mergeResoSyncCursor(nextConfig, {
      initialImportResumeUrl: undefined,
      maxModificationTimestamp: undefined,
    });
    delete nextConfig.initialImportResumeUrl;
    delete nextConfig.maxModificationTimestamp;
  }

  await patchInventorySource(sourceId, userId, {
    config: nextConfig,
    lastSyncStatus: "running",
    lastSyncError: null,
    lastSyncStats: {
      syncMode,
      startedAt: isResume ? prevStats.startedAt ?? new Date().toISOString() : new Date().toISOString(),
      resumedAt: isResume ? new Date().toISOString() : undefined,
      datasetId,
      listingsFetched: isResume ? statNum(prevStats, "listingsFetched") : 0,
      listingsImported: isResume ? statNum(prevStats, "listingsImported") : 0,
      listingsSkipped: isResume ? statNum(prevStats, "listingsSkipped") : 0,
      pagesFetched: isResume ? statNum(prevStats, "pagesFetched") : 0,
      resume: isResume,
    },
  });

  setImmediate(() => {
    void runInventorySyncJob(sourceId, userId, syncMode, options?.fresh === true).finally(() => {
      runningSyncs.delete(sourceId);
    });
  });

  return { started: true };
}

async function runInventorySyncJob(
  sourceId: string,
  userId: string,
  syncMode: ResoSyncMode,
  freshStart: boolean,
): Promise<void> {
  let source = await getInventorySource(userId, sourceId);
  if (!source) {
    console.error("[inventory-sync] source missing at job start", { sourceId, userId });
    return;
  }

  const startedAt = Date.now();
  const prevStats = (source.lastSyncStats || {}) as Record<string, unknown>;
  let upserted = statNum(prevStats, "listingsImported");
  let skipped = statNum(prevStats, "listingsSkipped");
  let pagesFetched = statNum(prevStats, "pagesFetched");
  let listingsFetched = statNum(prevStats, "listingsFetched");
  let inactivated = 0;
  let inactiveFromFeed = 0;
  let skippedDueToCap = statNum(prevStats, "skippedDueToCap");
  let skippedOutOfScope = statNum(prevStats, "skippedOutOfScope");
  const upsertResults: ListingUpsertResult[] = [];
  const datasetId = readDatasetId(source);
  let sampleSkipReason: string | null =
    typeof prevStats.sampleSkipReason === "string" ? prevStats.sampleSkipReason : null;

  let config = { ...(source.config || {}) } as Record<string, unknown>;
  let cursor = readResoSyncCursor(config);
  let runningMaxTs = cursor.maxModificationTimestamp;
  const syncScope = readInventorySyncScope(config);
  const matchableCountAtStart = await countMatchableListingsForSource(sourceId);
  const matchableCountCache: MatchableCountCache = { value: matchableCountAtStart };
  const importCapRemaining =
    syncMode === "initial"
      ? Math.max(0, syncScope.maxListings - matchableCountCache.value)
      : undefined;

  const resumeUrl =
    !freshStart && syncMode === "initial" && !cursor.initialImportComplete
      ? cursor.initialImportResumeUrl ?? null
      : null;

  console.log("[inventory-sync] job running", {
    sourceId,
    provider: source.provider,
    syncMode,
    datasetId,
    resumeUrl: resumeUrl ? "(checkpoint)" : null,
    listingsImportedSoFar: upserted,
    maxListings: syncScope.maxListings,
    matchableAtStart: matchableCountAtStart,
  });

  try {
    const adapter = getInventoryProviderAdapter(source.provider as InventoryProvider);
    const ctx = buildAdapterContext(source);

    const useStreaming = syncMode === "initial" || syncMode === "incremental";

    const fetchResult = await adapter.fetchListings(ctx, {
      mode: syncMode,
      maxModificationTimestamp: cursor.maxModificationTimestamp,
      resumeFromUrl: resumeUrl,
      maxRows: importCapRemaining && importCapRemaining > 0 ? importCapRemaining : undefined,
      onPage: useStreaming
        ? async ({ rows, pageNumber, nextLink, rowsFetchedTotal }) => {
            pagesFetched = pageNumber;
            listingsFetched = rowsFetchedTotal;

            for (const raw of rows) {
              const rowResult = await processSyncListingRow(
                userId,
                sourceId,
                raw,
                adapter,
                ctx,
                syncScope,
                matchableCountCache,
                upsertResults,
              );
              if (rowResult.skippedInvalid) {
                skipped += 1;
                if (!sampleSkipReason && rowResult.sampleSkipReason) {
                  sampleSkipReason = rowResult.sampleSkipReason;
                }
                continue;
              }
              if (rowResult.skippedDueToCap) {
                skippedDueToCap += 1;
                if (rowResult.inactiveFromFeed) inactiveFromFeed += 1;
                continue;
              }
              if (rowResult.skippedOutOfScope) {
                skippedOutOfScope += 1;
                if (rowResult.inactiveFromFeed) inactiveFromFeed += 1;
                continue;
              }
              if (rowResult.inactiveFromFeed) inactiveFromFeed += 1;
              upserted += 1;
            }

            runningMaxTs = maxTimestampFromRows(
              rows,
              modificationTimestampField(source.provider),
              runningMaxTs,
            );

            const hitImportCap =
              syncMode === "initial" && matchableCountCache.value >= syncScope.maxListings;
            const cursorPatch: Record<string, unknown> = {
              maxModificationTimestamp: runningMaxTs,
            };
            if (syncMode === "initial") {
              if (nextLink && !hitImportCap) {
                cursorPatch.initialImportResumeUrl = nextLink;
              } else {
                delete cursorPatch.initialImportResumeUrl;
              }
            }

            config = mergeResoSyncCursor(config, cursorPatch);
            if (!nextLink && syncMode === "initial") {
              delete config.initialImportResumeUrl;
            }

            await persistSyncCheckpoint(sourceId, userId, config, {
              syncMode,
              datasetId,
              pagesFetched,
              listingsFetched,
              listingsImported: upserted,
              listingsSkipped: skipped,
              skippedDueToCap,
              skippedOutOfScope,
              matchableCount: matchableCountCache.value,
              sampleSkipReason,
              maxListings: syncScope.maxListings,
              importCapReached: hitImportCap,
              importResumeNextLink: hitImportCap ? null : nextLink ?? null,
              checkpointPage: pageNumber,
            });
          }
        : undefined,
    });

    pagesFetched = fetchResult.pagesFetched;
    if (!useStreaming) {
      listingsFetched = fetchResult.listings.length;
    }

    if (syncMode === "reconciliation") {
      const activeIds = fetchResult.activeListingIds ?? [];
      inactivated = await markListingsInactiveExcept(sourceId, activeIds);

      const nowIso = new Date().toISOString();
      config = mergeResoSyncCursor(config, {
        lastReconciliationAt: nowIso,
        lastSuccessfulSyncAt: nowIso,
      });

      await patchInventorySource(sourceId, userId, {
        config,
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        lastSyncError: null,
        connectionStatus: "connected",
        lastSyncStats: {
          syncMode,
          datasetId,
          inactivated,
          pagesFetched,
          listingsFetched: activeIds.length,
          listingsImported: activeIds.length,
          seenCount: activeIds.length,
          durationMs: Date.now() - startedAt,
          lastSuccessfulSyncAt: nowIso,
          ...fetchResult.diagnostics,
        },
      });
      return;
    }

    // Non-streaming fallback (should not run for initial/incremental)
    if (!useStreaming) {
      for (const raw of fetchResult.listings) {
        const rowResult = await processSyncListingRow(
          userId,
          sourceId,
          raw,
          adapter,
          ctx,
          syncScope,
          matchableCountCache,
          upsertResults,
        );
        if (rowResult.skippedInvalid) {
          skipped += 1;
          if (!sampleSkipReason && rowResult.sampleSkipReason) {
            sampleSkipReason = rowResult.sampleSkipReason;
          }
          continue;
        }
        if (rowResult.skippedDueToCap) {
          skippedDueToCap += 1;
          if (rowResult.inactiveFromFeed) inactiveFromFeed += 1;
          continue;
        }
        if (rowResult.skippedOutOfScope) {
          skippedOutOfScope += 1;
          if (rowResult.inactiveFromFeed) inactiveFromFeed += 1;
          continue;
        }
        if (rowResult.inactiveFromFeed) inactiveFromFeed += 1;
        upserted += 1;
      }
    }

    runningMaxTs = fetchResult.maxModificationTimestamp ?? runningMaxTs ?? cursor.maxModificationTimestamp;

    const opportunityStats = await processInventoryOpportunitiesAfterSync(userId, upsertResults);

    let newListings = 0;
    let priceChanges = 0;
    let updatedListings = 0;
    for (const r of upsertResults) {
      if (r.syncAlertStatus === "new") newListings += 1;
      else if (r.syncAlertStatus === "price_changed" || r.priceReduced) priceChanges += 1;
      else updatedListings += 1;
    }

    const nowIso = new Date().toISOString();
    const hitImportCap =
      syncMode === "initial" && matchableCountCache.value >= syncScope.maxListings;
    const importSucceeded = upserted > 0 || listingsFetched === 0 || hitImportCap;
    const cursorPatch = mergeResoSyncCursor(config, {
      maxModificationTimestamp: runningMaxTs,
      lastSuccessfulSyncAt: nowIso,
      ...(syncMode === "initial" && importSucceeded
        ? { initialImportComplete: true, initialImportResumeUrl: undefined }
        : {}),
    });
    if (syncMode === "initial" && importSucceeded) {
      delete cursorPatch.initialImportResumeUrl;
    }

    const finalStatus = importSucceeded ? "success" : "failed";
    const finalError =
      finalStatus === "success"
        ? null
        : buildImportFailureMessage(listingsFetched, skipped, sampleSkipReason);

    await patchInventorySource(sourceId, userId, {
      config: cursorPatch,
      lastSyncAt: new Date(),
      lastSyncStatus: finalStatus,
      lastSyncError: finalError,
      connectionStatus: finalStatus === "success" ? "connected" : "error",
      lastSyncStats: {
        syncMode,
        datasetId,
        upserted,
        skipped,
        listingsFetched,
        listingsImported: upserted,
        listingsUpserted: upserted,
        listingsSkipped: skipped,
        skippedDueToCap,
        skippedOutOfScope,
        matchableCount: matchableCountCache.value,
        sampleSkipReason,
        inactivated,
        inactiveFromFeed,
        pagesFetched,
        durationMs: Date.now() - startedAt,
        seenCount: upserted,
        maxListings: syncScope.maxListings,
        importCapReached: hitImportCap,
        newListings,
        updatedListings,
        priceChanges,
        opportunitiesMatched: opportunityStats.createdOrUpdated,
        lastSuccessfulSyncAt: finalStatus === "success" ? nowIso : undefined,
        lastFailedSyncAt: finalStatus === "failed" ? nowIso : undefined,
        maxModificationTimestamp: runningMaxTs,
        initialImportComplete: cursorPatch.initialImportComplete === true,
        ...fetchResult.diagnostics,
      },
    });

    let flyerBackfill: Awaited<ReturnType<typeof backfillMissingFlyerColumnsForSource>> | undefined;
    if (finalStatus === "success") {
      try {
        flyerBackfill = await backfillMissingFlyerColumnsForSource(userId, sourceId);
      } catch (backfillErr) {
        console.warn("[inventory-sync] flyer column backfill failed", {
          sourceId,
          error: backfillErr instanceof Error ? backfillErr.message : String(backfillErr),
        });
      }
    }

    console.log("[inventory-sync] complete", {
      sourceId,
      datasetId,
      syncMode,
      finalStatus,
      pagesFetched,
      listingsFetched,
      listingsImported: upserted,
      listingsSkipped: skipped,
      skippedDueToCap,
      skippedOutOfScope,
      matchableCount: matchableCountCache.value,
      flyerBackfill,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const failureDiag = buildSyncFailureDiagnostics(err, source, syncMode, datasetId);
    const message = isResoHttpError(err)
      ? buildResoFailureUserMessage(err, failureDiag)
      : friendlySyncError(extractSyncErrorDetail(err));
    const nowIso = new Date().toISOString();

    config = mergeResoSyncCursor(config, { lastFailedSyncAt: nowIso });

    await patchInventorySource(sourceId, userId, {
      config,
      lastSyncStatus: "failed",
      lastSyncError: message,
      connectionStatus: isResoAuthFailure(err) ? "error" : "connected",
      lastSyncStats: {
        syncMode,
        datasetId,
        upserted,
        skipped,
        listingsFetched,
        listingsImported: upserted,
        listingsUpserted: upserted,
        listingsSkipped: skipped,
        skippedDueToCap,
        skippedOutOfScope,
        matchableCount: matchableCountCache.value,
        sampleSkipReason,
        inactivated,
        inactiveFromFeed,
        pagesFetched,
        durationMs: Date.now() - startedAt,
        failed: true,
        failurePhase: "import",
        failureDiagnostics: failureDiag,
        lastFailedSyncAt: nowIso,
        importResumeNextLink: readResoSyncCursor(config).initialImportResumeUrl ?? null,
      },
    });

    console.error("[inventory-sync] failed", {
      sourceId,
      userId,
      syncMode,
      datasetId,
      message,
      postgresCause:
        err instanceof Error && (err as { cause?: Error }).cause instanceof Error
          ? (err as { cause: Error }).cause.message
          : undefined,
      pagesFetched,
      listingsFetched,
      listingsImported: upserted,
      listingsSkipped: skipped,
      skippedDueToCap,
      skippedOutOfScope,
      ...failureDiag,
    });
  }
}

/** Scheduled reconciliation for RESO listing-sync sources with a completed initial import. */
export async function runInventoryReconciliationCron(): Promise<{ started: number; skipped: number }> {
  const { listListingSyncSourcesForReconciliation } = await import("./inventoryDb");
  const sources = await listListingSyncSourcesForReconciliation();
  let started = 0;
  let skipped = 0;

  for (const source of sources) {
    if (runningSyncs.has(source.id)) {
      skipped += 1;
      continue;
    }
    const result = await startInventorySourceSync(source.userId, source.id, {
      mode: "reconciliation",
    });
    if (result.started) started += 1;
    else skipped += 1;
  }

  if (started > 0) {
    console.log(`[inventory-reconcile] started ${started} reconciliation job(s), skipped ${skipped}`);
  }
  return { started, skipped };
}
