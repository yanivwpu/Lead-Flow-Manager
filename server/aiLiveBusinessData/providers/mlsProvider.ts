/**
 * MLS Listings — wraps existing inventory MLS sources.
 * Listing search for AI turns remains on existing inventory match paths in Phase 1.
 */

import {
  getListingPublicationStats,
  listInventorySources,
} from "../../inventory/inventoryDb";
import type {
  LiveBusinessDataProvider,
  LiveBusinessDataProviderStatusResult,
  LiveBusinessDataQueryContext,
} from "../types";

const MLS_PROVIDERS = new Set(["mls_grid", "trestle", "bridge_interactive"]);

export const mlsProvider: LiveBusinessDataProvider = {
  id: "mls",

  async getStatus(userId: string): Promise<LiveBusinessDataProviderStatusResult> {
    try {
      const sources = await listInventorySources(userId);
      const mlsConnected = sources.some(
        (s) => MLS_PROVIDERS.has(String(s.provider)) && s.connectionStatus === "connected",
      );
      if (!mlsConnected) {
        return { status: "disconnected", detail: "Not connected" };
      }
      const stats = await getListingPublicationStats(userId);
      const n = stats.mlsEligible || stats.totalSynced;
      if (n > 0) {
        return {
          status: "connected",
          detail: `${n.toLocaleString()} Listing${n === 1 ? "" : "s"}`,
        };
      }
      return { status: "connected", detail: "Connected" };
    } catch {
      return { status: "error", detail: "Unable to load MLS status" };
    }
  },

  async query(_ctx: LiveBusinessDataQueryContext) {
    // Structured MLS query for AI Brain turns is a later phase; inventory match stays on its path.
    return [];
  },
};
