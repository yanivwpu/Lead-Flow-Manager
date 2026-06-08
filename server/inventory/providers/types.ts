import type { ResoReplicationFetchOptions } from "@shared/inventory/reso/resoProviderContract";
import type { InventorySyncMode, ResoSyncDiagnostics } from "@shared/inventory/reso/resoSyncTypes";
import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import type { InventorySource } from "@shared/schema";

export type InventoryAdapterContext = {
  userId: string;
  source: InventorySource;
  config: Record<string, unknown>;
  credentials: Record<string, unknown>;
};

export type ValidateConnectionResult = {
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
};

export type FetchListingsOptions = {
  mode: InventorySyncMode;
  maxModificationTimestamp?: string;
  resumeFromUrl?: string | null;
  onFetchProgress?: (progress: { pagesFetched: number; rowsFetched: number }) => void | Promise<void>;
  onPage?: ResoReplicationFetchOptions["onPage"];
  maxRows?: number;
};

export type FetchListingsResult = {
  listings: unknown[];
  pagesFetched: number;
  maxModificationTimestamp?: string;
  initialImportComplete?: boolean;
  activeListingIds?: string[];
  diagnostics?: ResoSyncDiagnostics;
};

/** Provider adapter — auth/config/normalization; replication uses shared RESO engine. */
export interface InventoryProviderAdapter {
  readonly provider: InventoryProvider;
  validateConnection(ctx: InventoryAdapterContext): Promise<ValidateConnectionResult>;
  fetchListings(ctx: InventoryAdapterContext, options: FetchListingsOptions): Promise<FetchListingsResult>;
  normalizeListing(raw: unknown, ctx: InventoryAdapterContext): NormalizedInventoryListing | null;
  disconnect?(ctx: InventoryAdapterContext): Promise<void>;
}

export type {
  ResoAuthConfig,
  ResoEndpointConfig,
  ResoPropertyQueryExtras,
  ResoRateLimitConfig,
  ResoReplicationFetchOptions,
  ResoReplicationFetchResult,
  ResoReplicationProviderContract,
} from "@shared/inventory/reso/resoProviderContract";

export type { ResoPropertyNormalizerContract } from "@shared/inventory/reso/resoNormalizer";

export type {
  ResoSyncMode,
  ResoSyncCursor,
  ResoSyncDiagnostics,
  InventorySyncMode,
} from "@shared/inventory/reso/resoSyncTypes";
