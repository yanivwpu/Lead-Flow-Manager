import type { NormalizedInventoryListing } from "../inventoryListingSchema";
import type { ResoSyncMode } from "./resoSyncTypes";

import type { ResoSyncDiagnostics } from "./resoSyncTypes";

export type ResoAuthConfig = {
  type: "bearer";
  token: string;
};

export type ResoRateLimitConfig = {
  minIntervalMs: number;
  perSecond: number;
  perHour: number;
  perDay: number;
};

export type ResoEndpointConfig = {
  baseUrl: string;
  propertyResource: string;
  pageSize: number;
  rateLimits: ResoRateLimitConfig;
  /** Used in HTTP error messages, e.g. "MLS Grid". */
  providerLabel: string;
  modificationTimestampField?: string;
};

export type ResoPropertyQueryExtras = {
  expand?: string;
  select?: string;
  unselect?: string;
};

/** Provider-specific RESO replication hooks — auth, filters, normalization. */
export interface ResoReplicationProviderContract {
  getEndpointConfig(): ResoEndpointConfig;
  getAuth(): ResoAuthConfig;
  buildPropertyFilter(
    mode: ResoSyncMode,
    maxModificationTimestamp?: string,
  ): string;
  buildPropertyQueryExtras(mode: ResoSyncMode): ResoPropertyQueryExtras;
  extractListingId(raw: unknown): string | null;
  normalizeProperty(raw: unknown): NormalizedInventoryListing | null;
  /** Override OData resource path segment, e.g. Property/replication. */
  resolvePropertyResource?(mode: ResoSyncMode): string;
  /** Override page size per sync mode when provider limits differ. */
  resolvePageSize?(mode: ResoSyncMode): number;
  /** OData $orderby for initial import (newest modifications first). */
  resolveOrderBy?(mode: ResoSyncMode): string | undefined;
}

export type ResoReplicationFetchOptions = {
  mode: ResoSyncMode;
  maxModificationTimestamp?: string;
  /** Resume initial import from a saved @odata.nextLink (stored on source config). */
  resumeFromUrl?: string | null;
  onFetchProgress?: (progress: { pagesFetched: number; rowsFetched: number }) => void | Promise<void>;
  /**
   * When set, each page is delivered immediately and rows are NOT accumulated in memory.
   * Use for large initial imports — import inside this callback.
   */
  onPage?: (page: {
    rows: unknown[];
    pageNumber: number;
    nextLink: string | null;
    rowsFetchedTotal: number;
  }) => Promise<void>;
  /** Stop after this many rows (initial import cap). */
  maxRows?: number;
};

export type ResoReplicationFetchResult = {
  listings: unknown[];
  pagesFetched: number;
  maxModificationTimestamp?: string;
  initialImportComplete?: boolean;
  activeListingIds?: string[];
  diagnostics?: ResoSyncDiagnostics;
};
