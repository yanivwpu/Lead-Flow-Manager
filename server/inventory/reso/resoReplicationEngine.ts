import { buildPropertyCollectionUrl } from "@shared/inventory/reso/resoOData";
import type {
  ResoReplicationFetchOptions,
  ResoReplicationFetchResult,
  ResoReplicationProviderContract,
} from "@shared/inventory/reso/resoProviderContract";
import {
  maxTimestampFromRows,
  type ResoSyncDiagnostics,
  type ResoSyncMode,
} from "@shared/inventory/reso/resoSyncTypes";
import { emptyResoFetchMetrics, ResoClient } from "./resoClient";

function toSyncDiagnostics(
  syncMode: ResoSyncMode,
  pagesFetched: number,
  metrics: ReturnType<typeof emptyResoFetchMetrics>,
  startedAt: number,
): ResoSyncDiagnostics {
  return {
    syncMode,
    pagesFetched,
    requestsMade: metrics.requestsMade,
    retries: metrics.retries,
    rateLimitHits: metrics.rateLimitHits,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Shared RESO replication fetch — initial import, incremental sync, reconciliation.
 * Provider supplies auth, filters, and normalization only.
 */
export async function runResoReplicationFetch(
  sourceKey: string,
  provider: ResoReplicationProviderContract,
  options: ResoReplicationFetchOptions,
): Promise<ResoReplicationFetchResult> {
  const startedAt = Date.now();
  const metrics = emptyResoFetchMetrics();
  const endpoint = provider.getEndpointConfig();
  const auth = provider.getAuth();
  const mode = options.mode;
  const modField = endpoint.modificationTimestampField ?? "ModificationTimestamp";

  const client = new ResoClient(
    sourceKey,
    auth,
    endpoint.rateLimits,
    endpoint.providerLabel,
  );

  if (mode === "reconciliation") {
    const filter = provider.buildPropertyFilter(mode, options.maxModificationTimestamp);
    const extras = provider.buildPropertyQueryExtras(mode);
    const propertyResource = provider.resolvePropertyResource?.(mode) ?? endpoint.propertyResource;
    const pageSize = provider.resolvePageSize?.(mode) ?? endpoint.pageSize;
    const startUrl = buildPropertyCollectionUrl(endpoint.baseUrl, propertyResource, {
      filter,
      top: pageSize,
      select: extras.select,
      unselect: extras.unselect,
    });

    const activeListingIds: string[] = [];
    let pagesFetched = 0;
    let url: string | null = startUrl;

    while (url) {
      const body = await client.fetchJson(url, metrics);
      pagesFetched += 1;
      const value = body.value;
      if (Array.isArray(value)) {
        for (const row of value) {
          const id = provider.extractListingId(row);
          if (id) activeListingIds.push(id);
        }
      }
      const next = body["@odata.nextLink"];
      url = typeof next === "string" && next.length > 0 ? next : null;
    }

    return {
      listings: [],
      pagesFetched,
      activeListingIds,
      diagnostics: toSyncDiagnostics(mode, pagesFetched, metrics, startedAt),
    };
  }

  const filter = provider.buildPropertyFilter(mode, options.maxModificationTimestamp);
  const extras = provider.buildPropertyQueryExtras(mode);
  const propertyResource = provider.resolvePropertyResource?.(mode) ?? endpoint.propertyResource;
  const pageSize = provider.resolvePageSize?.(mode) ?? endpoint.pageSize;
  const startUrl = buildPropertyCollectionUrl(endpoint.baseUrl, propertyResource, {
    filter,
    top: pageSize,
    expand: extras.expand,
    select: extras.select,
    unselect: extras.unselect,
  });

  const { rows: listings, pagesFetched } = await client.paginateCollection(startUrl, metrics);

  const maxModificationTimestamp = maxTimestampFromRows(
    listings,
    modField,
    options.maxModificationTimestamp,
  );

  const initialImportComplete = mode === "initial" ? true : undefined;

  return {
    listings,
    pagesFetched,
    maxModificationTimestamp,
    initialImportComplete,
    diagnostics: toSyncDiagnostics(mode, pagesFetched, metrics, startedAt),
  };
}

/** Probe connection with a minimal Property query. */
export async function runResoConnectionProbe(
  sourceKey: string,
  provider: ResoReplicationProviderContract,
  filter: string,
): Promise<{ ok: true; sampleRows: number } | { ok: false; message: string }> {
  try {
    const endpoint = provider.getEndpointConfig();
    const auth = provider.getAuth();
    const client = new ResoClient(
      sourceKey,
      auth,
      endpoint.rateLimits,
      endpoint.providerLabel,
    );
    const metrics = emptyResoFetchMetrics();
    const propertyResource = provider.resolvePropertyResource?.("initial") ?? endpoint.propertyResource;
    const pageSize = provider.resolvePageSize?.("initial") ?? endpoint.pageSize;
    const url = buildPropertyCollectionUrl(endpoint.baseUrl, propertyResource, {
      filter,
      top: 1,
      unselect: provider.buildPropertyQueryExtras("initial").unselect,
    });
    const body = await client.fetchJson(url, metrics);
    const count = Array.isArray(body.value) ? body.value.length : 0;
    return { ok: true, sampleRows: count };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
