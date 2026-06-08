import { assertProductionDevSeedSourceAllowed } from "@shared/inventory/inventoryDevSeedGuard";
import { providerSupportsListingSync, type InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import {
  mergeResoSyncCursor,
  readResoSyncCursor,
  type ResoSyncMode,
} from "@shared/inventory/reso/resoSyncTypes";
import type { InventorySource } from "@shared/schema";
import {
  getInventorySource,
  markListingsInactiveExcept,
  patchInventorySource,
  upsertInventoryListing,
  type ListingUpsertResult,
} from "./inventoryDb";
import { processInventoryOpportunitiesAfterSync } from "./inventoryOpportunityService";
import { buildAdapterContext } from "./inventorySourceService";
import { getInventoryProviderAdapter } from "./inventoryProviderRegistry";

const runningSyncs = new Set<string>();
const PROGRESS_UPSERT_INTERVAL = 25;

export type StartSyncOptions = {
  mode?: ResoSyncMode;
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
    return "Listing feed request timed out. Try Sync Now again — large datasets may take several minutes.";
  }
  return raw.slice(0, 2000);
}

async function mergeSyncProgress(
  sourceId: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const current = await getInventorySource(userId, sourceId);
  const existing = ((current?.lastSyncStats || {}) as Record<string, unknown>) ?? {};
  await patchInventorySource(sourceId, userId, {
    lastSyncStats: {
      ...existing,
      ...patch,
      lastProgressAt: new Date().toISOString(),
    },
  });
}

/** Clear DB "running" when no in-process job exists (e.g. after server restart). */
export async function recoverOrphanedInventorySync(
  source: InventorySource,
): Promise<InventorySource> {
  if (source.lastSyncStatus !== "running") return source;
  if (runningSyncs.has(source.id)) return source;

  console.warn("[inventory-sync] recovering orphaned sync", {
    sourceId: source.id,
    provider: source.provider,
    datasetId: readDatasetId(source),
  });

  const stats = (source.lastSyncStats || {}) as Record<string, unknown>;
  const recovered = await patchInventorySource(source.id, source.userId, {
    lastSyncStatus: "failed",
    lastSyncError: "Previous sync was interrupted. Click Sync Now to retry.",
    connectionStatus: source.connectionStatus === "connected" ? "connected" : "error",
    lastSyncStats: {
      ...stats,
      failed: true,
      orphanedRecovery: true,
      recoveredAt: new Date().toISOString(),
    },
  });
  return recovered ?? source;
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
    source = await recoverOrphanedInventorySync(source);
  }

  if (runningSyncs.has(sourceId)) {
    return { started: false, reason: "already_running" };
  }

  runningSyncs.add(sourceId);
  const syncMode = resolveSyncMode(source, options);
  const datasetId = readDatasetId(source);

  console.log("[inventory-sync] starting", {
    sourceId,
    userId,
    provider: source.provider,
    syncMode,
    datasetId,
  });

  await patchInventorySource(sourceId, userId, {
    lastSyncStatus: "running",
    lastSyncError: null,
    lastSyncStats: {
      syncMode,
      startedAt: new Date().toISOString(),
      datasetId,
      listingsFetched: 0,
      listingsImported: 0,
      listingsSkipped: 0,
      pagesFetched: 0,
    },
  });

  setImmediate(() => {
    void runInventorySyncJob(sourceId, userId, syncMode).finally(() => {
      runningSyncs.delete(sourceId);
    });
  });

  return { started: true };
}

async function runInventorySyncJob(
  sourceId: string,
  userId: string,
  syncMode: ResoSyncMode,
): Promise<void> {
  const source = await getInventorySource(userId, sourceId);
  if (!source) {
    console.error("[inventory-sync] source missing at job start", { sourceId, userId });
    return;
  }

  const startedAt = Date.now();
  let upserted = 0;
  let skipped = 0;
  let pagesFetched = 0;
  let listingsFetched = 0;
  let inactivated = 0;
  let inactiveFromFeed = 0;
  const upsertResults: ListingUpsertResult[] = [];
  const datasetId = readDatasetId(source);

  const config = (source.config || {}) as Record<string, unknown>;
  const cursor = readResoSyncCursor(config);

  console.log("[inventory-sync] job running", {
    sourceId,
    provider: source.provider,
    syncMode,
    datasetId,
  });

  try {
    const adapter = getInventoryProviderAdapter(source.provider as InventoryProvider);
    const ctx = buildAdapterContext(source);

    const fetchResult = await adapter.fetchListings(ctx, {
      mode: syncMode,
      maxModificationTimestamp: cursor.maxModificationTimestamp,
      onFetchProgress: async ({ pagesFetched: pages, rowsFetched }) => {
        pagesFetched = pages;
        listingsFetched = rowsFetched;
        await mergeSyncProgress(sourceId, userId, {
          syncMode,
          datasetId,
          pagesFetched: pages,
          listingsFetched: rowsFetched,
          listingsImported: upserted,
          listingsSkipped: skipped,
        });
      },
    });

    pagesFetched = fetchResult.pagesFetched;
    listingsFetched = fetchResult.listings.length;

    console.log("[inventory-sync] fetch complete", {
      sourceId,
      datasetId,
      syncMode,
      pagesFetched,
      listingsFetched,
      provider: source.provider,
    });

    await mergeSyncProgress(sourceId, userId, {
      syncMode,
      datasetId,
      pagesFetched,
      listingsFetched,
      listingsImported: 0,
      listingsSkipped: 0,
      fetchCompleteAt: new Date().toISOString(),
    });

    if (syncMode === "reconciliation") {
      const activeIds = fetchResult.activeListingIds ?? [];
      inactivated = await markListingsInactiveExcept(sourceId, activeIds);

      const nowIso = new Date().toISOString();
      const mergedConfig = mergeResoSyncCursor(config, {
        lastReconciliationAt: nowIso,
        lastSuccessfulSyncAt: nowIso,
      });

      await patchInventorySource(sourceId, userId, {
        config: mergedConfig,
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

      console.log("[inventory-sync] reconciliation success", {
        sourceId,
        datasetId,
        inactivated,
        seenCount: activeIds.length,
      });
      return;
    }

    for (const raw of fetchResult.listings) {
      const normalized = adapter.normalizeListing(raw, ctx);
      if (!normalized) {
        skipped += 1;
        continue;
      }

      if (normalized.status === "inactive") {
        inactiveFromFeed += 1;
      }

      const result = await upsertInventoryListing(userId, sourceId, normalized);
      upsertResults.push(result);
      upserted += 1;

      if (upserted % PROGRESS_UPSERT_INTERVAL === 0) {
        await mergeSyncProgress(sourceId, userId, {
          syncMode,
          datasetId,
          pagesFetched,
          listingsFetched,
          listingsImported: upserted,
          listingsSkipped: skipped,
        });
      }
    }

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
    const importSucceeded = upserted > 0 || listingsFetched === 0;
    const cursorPatch = mergeResoSyncCursor(config, {
      maxModificationTimestamp:
        fetchResult.maxModificationTimestamp ?? cursor.maxModificationTimestamp,
      lastSuccessfulSyncAt: nowIso,
      ...(fetchResult.initialImportComplete && importSucceeded
        ? { initialImportComplete: true }
        : {}),
    });

    const finalStatus = importSucceeded ? "success" : "failed";
    const finalError =
      importSucceeded || syncMode !== "initial"
        ? null
        : `${listingsFetched.toLocaleString()} listings were fetched but none could be imported. Check dataset access or contact support.`;

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
        listingsSkipped: skipped,
        inactivated,
        inactiveFromFeed,
        pagesFetched,
        durationMs: Date.now() - startedAt,
        seenCount: upserted,
        newListings,
        updatedListings,
        priceChanges,
        opportunitiesMatched: opportunityStats.createdOrUpdated,
        lastSuccessfulSyncAt: finalStatus === "success" ? nowIso : undefined,
        lastFailedSyncAt: finalStatus === "failed" ? nowIso : undefined,
        maxModificationTimestamp: fetchResult.maxModificationTimestamp ?? cursor.maxModificationTimestamp,
        initialImportComplete: cursorPatch.initialImportComplete === true,
        ...fetchResult.diagnostics,
      },
    });

    console.log("[inventory-sync] complete", {
      sourceId,
      datasetId,
      syncMode,
      finalStatus,
      pagesFetched,
      listingsFetched,
      listingsImported: upserted,
      listingsSkipped: skipped,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const message = friendlySyncError(raw);
    const nowIso = new Date().toISOString();
    const failedConfig = mergeResoSyncCursor(config, { lastFailedSyncAt: nowIso });

    await patchInventorySource(sourceId, userId, {
      config: failedConfig,
      lastSyncStatus: "failed",
      lastSyncError: message,
      connectionStatus: "error",
      lastSyncStats: {
        syncMode,
        datasetId,
        upserted,
        skipped,
        listingsFetched,
        listingsImported: upserted,
        listingsSkipped: skipped,
        inactivated,
        inactiveFromFeed,
        pagesFetched,
        durationMs: Date.now() - startedAt,
        failed: true,
        lastFailedSyncAt: nowIso,
      },
    });

    console.error("[inventory-sync] failed", {
      sourceId,
      userId,
      syncMode,
      datasetId,
      message,
      pagesFetched,
      listingsFetched,
      listingsImported: upserted,
      listingsSkipped: skipped,
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
