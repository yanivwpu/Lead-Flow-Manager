import type {
  InventoryAdapterContext,
  InventoryProviderAdapter,
  ValidateConnectionResult,
} from "./types";
import {
  fetchBridgeInteractiveReplication,
  normalizeBridgeInteractiveProperty,
  validateBridgeInteractiveResoConnection,
} from "./bridgeInteractiveResoProvider";

export { normalizeBridgeInteractiveProperty } from "./bridgeInteractiveResoProvider";
export {
  BRIDGE_ODATA_BASE,
  BRIDGE_REPLICATION_PAGE_SIZE,
  BRIDGE_STANDARD_PAGE_SIZE,
  BRIDGE_RATE_LIMITS,
} from "./bridgeInteractiveResoProvider";

export const bridgeInteractiveInventoryAdapter: InventoryProviderAdapter = {
  provider: "bridge_interactive",

  async validateConnection(ctx: InventoryAdapterContext): Promise<ValidateConnectionResult> {
    return validateBridgeInteractiveResoConnection(ctx);
  },

  async fetchListings(ctx, options) {
    return fetchBridgeInteractiveReplication(ctx, options);
  },

  normalizeListing(raw: unknown, _ctx: InventoryAdapterContext) {
    return normalizeBridgeInteractiveProperty(raw);
  },
};
