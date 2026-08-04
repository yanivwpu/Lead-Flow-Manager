/**
 * Shopify Products — wraps existing Shopify connection status.
 * Product catalog query is not implemented in Phase 1 (no prompt stuffing).
 */

import { storage } from "../../storage";
import type {
  LiveBusinessDataProvider,
  LiveBusinessDataProviderStatusResult,
  LiveBusinessDataQueryContext,
} from "../types";

function isShopifyConnected(user: {
  shopifyShop?: string | null;
  shopifyAccessToken?: string | null;
  shopifyInstalledAt?: Date | string | null;
} | undefined): boolean {
  if (!user?.shopifyShop) return false;
  return Boolean(user.shopifyInstalledAt || user.shopifyAccessToken);
}

export const shopifyProvider: LiveBusinessDataProvider = {
  id: "shopify",

  async getStatus(userId: string): Promise<LiveBusinessDataProviderStatusResult> {
    try {
      const user = await storage.getUser(userId);
      if (!isShopifyConnected(user)) {
        return { status: "disconnected", detail: "Not connected" };
      }
      // Catalog search is Phase 2+; surface connection only in Phase 1.
      return { status: "connected", detail: "Connected" };
    } catch {
      return { status: "error", detail: "Unable to load Shopify status" };
    }
  },

  async query(_ctx: LiveBusinessDataQueryContext) {
    // Typed product search lands when catalog connector ships — never dump products into prompts.
    return [];
  },
};
