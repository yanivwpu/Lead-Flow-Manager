import type {
  InventoryAdapterContext,
  InventoryProviderAdapter,
  ValidateConnectionResult,
} from "./types";
import {
  fetchMlsGridReplication,
  normalizeMlsGridProperty,
  validateMlsGridResoConnection,
} from "./mlsGridResoProvider";

export { normalizeMlsGridProperty } from "./mlsGridResoProvider";
export { MLS_GRID_BASE, MLS_GRID_PAGE_SIZE, MLS_GRID_RATE_LIMITS } from "./mlsGridResoProvider";

export const mlsGridInventoryAdapter: InventoryProviderAdapter = {
  provider: "mls_grid",

  async validateConnection(ctx: InventoryAdapterContext): Promise<ValidateConnectionResult> {
    return validateMlsGridResoConnection(ctx);
  },

  async fetchListings(ctx, options) {
    return fetchMlsGridReplication(ctx, options);
  },

  normalizeListing(raw: unknown, _ctx: InventoryAdapterContext) {
    return normalizeMlsGridProperty(raw);
  },
};
