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
}

export type ResoReplicationFetchOptions = {
  mode: ResoSyncMode;
  maxModificationTimestamp?: string;
  onFetchProgress?: (progress: { pagesFetched: number; rowsFetched: number }) => void | Promise<void>;
};

export type ResoReplicationFetchResult = {
  listings: unknown[];
  pagesFetched: number;
  maxModificationTimestamp?: string;
  initialImportComplete?: boolean;
  activeListingIds?: string[];
  diagnostics?: ResoSyncDiagnostics;
};
