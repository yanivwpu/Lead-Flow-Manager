/**
 * Generic Inventory connector placeholder (ERP / POS / non-MLS stock).
 * Distinct from MLS listings; reserved for future connectors.
 */

import type {
  LiveBusinessDataProvider,
  LiveBusinessDataProviderStatusResult,
  LiveBusinessDataQueryContext,
} from "../types";

export const inventoryProvider: LiveBusinessDataProvider = {
  id: "inventory",

  async getStatus(_userId: string): Promise<LiveBusinessDataProviderStatusResult> {
    return { status: "coming_soon", detail: "Coming Soon" };
  },

  async query(_ctx: LiveBusinessDataQueryContext) {
    return [];
  },
};
