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
  return raw.slice(0, 2000);
}

export async function startInventorySourceSync(
  userId: string,
  sourceId: string,
  options?: StartSyncOptions,
): Promise<StartSyncResult> {
  const source = await getInventorySource(userId, sourceId);
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

  if (runningSyncs.has(sourceId)) {
    return { started: false, reason: "already_running" };
  }

  runningSyncs.add(sourceId);
  const syncMode = resolveSyncMode(source, options);
  await patchInventorySource(sourceId, userId, {
    lastSyncStatus: "running",
    lastSyncError: null,
    lastSyncStats: {
      syncMode,
      startedAt: new Date().toISOString(),
    },
  });

  setImmediate(() => {
    void runInventorySyncJob(source, syncMode).finally(() => {
      runningSyncs.delete(sourceId);
    });
  });

  return { started: true };
}

async function runInventorySyncJob(source: InventorySource, syncMode: ResoSyncMode): Promise<void> {
  const userId = source.userId;
  const sourceId = source.id;
  const startedAt = Date.now();
  let upserted = 0;
  let skipped = 0;
  let pagesFetched = 0;
  let inactivated = 0;
  let inactiveFromFeed = 0;
  const upsertResults: ListingUpsertResult[] = [];

  const config = (source.config || {}) as Record<string, unknown>;
  const cursor = readResoSyncCursor(config);

  try {
    const adapter = getInventoryProviderAdapter(source.provider as InventoryProvider);
    const ctx = buildAdapterContext(source);

    const fetchResult = await adapter.fetchListings(ctx, {
      mode: syncMode,
      maxModificationTimestamp: cursor.maxModificationTimestamp,
    });

    pagesFetched = fetchResult.pagesFetched;

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
          inactivated,
          pagesFetched,
          seenCount: activeIds.length,
          durationMs: Date.now() - startedAt,
          lastSuccessfulSyncAt: nowIso,
          ...fetchResult.diagnostics,
        },
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
    const cursorPatch = mergeResoSyncCursor(config, {
      maxModificationTimestamp:
        fetchResult.maxModificationTimestamp ?? cursor.maxModificationTimestamp,
      lastSuccessfulSyncAt: nowIso,
      ...(fetchResult.initialImportComplete ? { initialImportComplete: true } : {}),
    });

    await patchInventorySource(sourceId, userId, {
      config: cursorPatch,
      lastSyncAt: new Date(),
      lastSyncStatus: "success",
      lastSyncError: null,
      connectionStatus: "connected",
      lastSyncStats: {
        syncMode,
        upserted,
        skipped,
        inactivated,
        inactiveFromFeed,
        pagesFetched,
        durationMs: Date.now() - startedAt,
        seenCount: upserted,
        newListings,
        updatedListings,
        priceChanges,
        opportunitiesMatched: opportunityStats.createdOrUpdated,
        lastSuccessfulSyncAt: nowIso,
        maxModificationTimestamp: fetchResult.maxModificationTimestamp ?? cursor.maxModificationTimestamp,
        initialImportComplete: cursorPatch.initialImportComplete === true,
        ...fetchResult.diagnostics,
      },
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
        upserted,
        skipped,
        inactivated,
        inactiveFromFeed,
        pagesFetched,
        durationMs: Date.now() - startedAt,
        failed: true,
        lastFailedSyncAt: nowIso,
      },
    });
    console.error("[inventory-sync] failed", { sourceId, userId, syncMode, message });
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
