import { providerSupportsListingSync, type InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import type { InventorySource } from "@shared/schema";
import { getInventorySource, markListingsInactiveExcept, patchInventorySource, upsertInventoryListing } from "./inventoryDb";
import { buildAdapterContext } from "./inventorySourceService";
import { getInventoryProviderAdapter } from "./inventoryProviderRegistry";

const runningSyncs = new Set<string>();

export type StartSyncResult =
  | { started: true }
  | { started: false; reason: "already_running" | "not_supported" | "source_not_found" };

export async function startInventorySourceSync(
  userId: string,
  sourceId: string,
): Promise<StartSyncResult> {
  const source = await getInventorySource(userId, sourceId);
  if (!source) return { started: false, reason: "source_not_found" };
  if (!providerSupportsListingSync(source.provider as InventoryProvider)) {
    return { started: false, reason: "not_supported" };
  }
  if (runningSyncs.has(sourceId)) {
    return { started: false, reason: "already_running" };
  }

  runningSyncs.add(sourceId);
  await patchInventorySource(sourceId, userId, {
    lastSyncStatus: "running",
    lastSyncError: null,
  });

  setImmediate(() => {
    void runInventorySyncJob(source).finally(() => {
      runningSyncs.delete(sourceId);
    });
  });

  return { started: true };
}

async function runInventorySyncJob(source: InventorySource): Promise<void> {
  const userId = source.userId;
  const sourceId = source.id;
  const startedAt = Date.now();
  let upserted = 0;
  let skipped = 0;
  let pagesFetched = 0;
  const seenIds: string[] = [];

  try {
    const adapter = getInventoryProviderAdapter(source.provider as InventoryProvider);
    const ctx = buildAdapterContext(source);
    const since =
      source.lastSyncStatus === "success" && source.lastSyncAt
        ? new Date(source.lastSyncAt.getTime() - 5 * 60 * 1000)
        : undefined;

    const { listings, pagesFetched: pages } = await adapter.fetchListings(ctx, { since });
    pagesFetched = pages;

    for (const raw of listings) {
      const normalized = adapter.normalizeListing(raw, ctx);
      if (!normalized) {
        skipped += 1;
        continue;
      }
      await upsertInventoryListing(userId, sourceId, normalized);
      seenIds.push(normalized.providerListingId);
      upserted += 1;
    }

    const inactivated = await markListingsInactiveExcept(sourceId, seenIds);
    const durationMs = Date.now() - startedAt;

    await patchInventorySource(sourceId, userId, {
      lastSyncAt: new Date(),
      lastSyncStatus: "success",
      lastSyncError: null,
      connectionStatus: "connected",
      lastSyncStats: {
        upserted,
        skipped,
        inactivated,
        pagesFetched,
        durationMs,
        seenCount: seenIds.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await patchInventorySource(sourceId, userId, {
      lastSyncStatus: "failed",
      lastSyncError: message.slice(0, 2000),
      connectionStatus: "error",
      lastSyncStats: {
        upserted,
        skipped,
        pagesFetched,
        durationMs: Date.now() - startedAt,
        failed: true,
      },
    });
    console.error("[inventory-sync] failed", { sourceId, userId, message });
  }
}
