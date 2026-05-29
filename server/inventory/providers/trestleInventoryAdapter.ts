import type {
  InventoryAdapterContext,
  InventoryProviderAdapter,
  ValidateConnectionResult,
} from "./types";
import {
  fetchTrestleReplication,
  normalizeTrestleProperty,
  validateTrestleResoConnection,
} from "./trestleResoProvider";

export { normalizeTrestleProperty } from "./trestleResoProvider";
export { TRESTLE_ODATA_BASE, TRESTLE_PAGE_SIZE, TRESTLE_RATE_LIMITS } from "./trestleResoProvider";

export const trestleInventoryAdapter: InventoryProviderAdapter = {
  provider: "trestle",

  async validateConnection(ctx: InventoryAdapterContext): Promise<ValidateConnectionResult> {
    return validateTrestleResoConnection(ctx);
  },

  async fetchListings(ctx, options) {
    return fetchTrestleReplication(ctx, options);
  },

  normalizeListing(raw: unknown, _ctx: InventoryAdapterContext) {
    return normalizeTrestleProperty(raw);
  },
};
