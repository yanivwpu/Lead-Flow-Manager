import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import type { NormalizedInventoryListing } from "@shared/inventory/inventoryListingSchema";
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

export type FetchListingsResult = {
  listings: unknown[];
  pagesFetched: number;
};

export interface InventoryProviderAdapter {
  readonly provider: InventoryProvider;
  validateConnection(ctx: InventoryAdapterContext): Promise<ValidateConnectionResult>;
  fetchListings(ctx: InventoryAdapterContext, options?: { since?: Date }): Promise<FetchListingsResult>;
  normalizeListing(raw: unknown, ctx: InventoryAdapterContext): NormalizedInventoryListing | null;
  disconnect?(ctx: InventoryAdapterContext): Promise<void>;
}
