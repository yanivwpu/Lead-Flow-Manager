import { buildPropertyCollectionUrl, oDataNextLink, oDataValueRows } from "@shared/inventory/reso/resoOData";
import {
  buildResoFailureUserMessage,
  resoFailureDiagnosticsFromError,
} from "@shared/inventory/reso/resoSyncFailureDiagnostics";
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
  queryContext?: { oDataFilter?: string; requestUrl?: string },
): ResoSyncDiagnostics {
  return {
    syncMode,
    pagesFetched,
    requestsMade: metrics.requestsMade,
    retries: metrics.retries,
    rateLimitHits: metrics.rateLimitHits,
    durationMs: Date.now() - startedAt,
    oDataFilter: queryContext?.oDataFilter,
    requestUrl: queryContext?.requestUrl,
  };
}

/**
 * Shared RESO replication fetch — initial import, incremental sync, reconciliation.
 * When `onPage` is provided, rows are streamed page-by-page (not held in memory).
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
  const streaming = typeof options.onPage === "function";

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
      url = oDataNextLink(body);
    }

    return {
      listings: [],
      pagesFetched,
      activeListingIds,
      diagnostics: toSyncDiagnostics(mode, pagesFetched, metrics, startedAt, { oDataFilter: filter }),
    };
  }

  const filter = provider.buildPropertyFilter(mode, options.maxModificationTimestamp);
  const extras = provider.buildPropertyQueryExtras(mode);
  const propertyResource = provider.resolvePropertyResource?.(mode) ?? endpoint.propertyResource;
  const pageSize = provider.resolvePageSize?.(mode) ?? endpoint.pageSize;
  const startUrl = buildPropertyCollectionUrl(endpoint.baseUrl, propertyResource, {
    filter,
    top: pageSize,
    orderBy: provider.resolveOrderBy?.(mode),
    expand: extras.expand,
    select: extras.select,
    unselect: extras.unselect,
  });

  const accumulatedRows: unknown[] = [];
  let pagesFetched = 0;
  let rowsFetchedTotal = 0;
  let runningMaxTs = options.maxModificationTimestamp;
  let url: string | null =
    options.resumeFromUrl && options.resumeFromUrl.trim().length > 0
      ? options.resumeFromUrl
      : startUrl;

  while (url) {
    const body = await client.fetchJson(url, metrics);
    pagesFetched += 1;
    let pageRows = oDataValueRows(body);
    rowsFetchedTotal += pageRows.length;
    runningMaxTs = maxTimestampFromRows(pageRows, modField, runningMaxTs);

    let stopAfterPage = false;
    if (options.maxRows != null && options.maxRows > 0 && rowsFetchedTotal > options.maxRows) {
      const overflow = rowsFetchedTotal - options.maxRows;
      pageRows = pageRows.slice(0, Math.max(0, pageRows.length - overflow));
      rowsFetchedTotal = options.maxRows;
      stopAfterPage = true;
    }

    if (streaming) {
      const nextLink = stopAfterPage ? null : oDataNextLink(body);
      await options.onPage!({
        rows: pageRows,
        pageNumber: pagesFetched,
        nextLink,
        rowsFetchedTotal,
      });
      if (options.onFetchProgress) {
        await options.onFetchProgress({ pagesFetched, rowsFetched: rowsFetchedTotal });
      }
      url = nextLink;
    } else {
      accumulatedRows.push(...pageRows);
      if (options.onFetchProgress) {
        await options.onFetchProgress({ pagesFetched, rowsFetched: accumulatedRows.length });
      }
      if (stopAfterPage) {
        url = null;
      } else {
        url = oDataNextLink(body);
      }
    }
  }

  const listings = streaming ? [] : accumulatedRows;
  const maxModificationTimestamp = streaming
    ? runningMaxTs
    : maxTimestampFromRows(listings, modField, options.maxModificationTimestamp);

  const initialImportComplete = mode === "initial" && !streaming ? true : undefined;

  return {
    listings,
    pagesFetched,
    maxModificationTimestamp,
    initialImportComplete,
    diagnostics: toSyncDiagnostics(mode, pagesFetched, metrics, startedAt, {
      oDataFilter: filter,
      requestUrl: startUrl,
    }),
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
    const endpoint = provider.getEndpointConfig();
    const diag = resoFailureDiagnosticsFromError(err, {
      phase: "validation",
      provider: endpoint.providerLabel,
      oDataFilter: filter,
    });
    return {
      ok: false,
      message: buildResoFailureUserMessage(err, diag),
      diagnostics: diag,
    };
  }
}
