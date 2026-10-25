import type { User } from "@shared/schema";
import {
  normalizeShopifyShopDomain,
  shopifySyntheticMerchantEmail,
} from "@shared/shopifyBilling";
import { storage } from "./storage";
import { resolveAssignedOwner } from "./shopifyAssignedOwner";
import { assignedShopifyTarget } from "./shopifyStoreAssignment";

export type ShopifyInstallUserResolution =
  | "assigned_owner"
  | "shopify_shop"
  | "session_link"
  | "synthetic_email"
  | "new_merchant"
  | "invalid_shop";

export type ResolveShopifyInstallUserResult = {
  user: User | undefined;
  normalizedShop: string | null;
  resolution: ShopifyInstallUserResolution;
};

/** Locate an existing merchant or session user before creating a new Shopify account row. */
export async function resolveShopifyInstallUser(options: {
  shop: string;
  sessionUserId?: string;
}): Promise<ResolveShopifyInstallUserResult> {
  const normalizedShop = normalizeShopifyShopDomain(options.shop);
  if (!normalizedShop) {
    return { user: undefined, normalizedShop: null, resolution: "invalid_shop" };
  }

  const assigned = await resolveAssignedOwner(normalizedShop, {
    targetId: assignedShopifyTarget,
    user: id => storage.getUserForSession(id),
    shopOwner: shop => storage.getUserByShopifyShop(shop),
  });
  if (assigned) return { user: assigned, normalizedShop, resolution: "assigned_owner" };

  const byShop = await storage.getUserByShopifyShop(normalizedShop);
  if (byShop) {
    const full = await storage.getUserForSession(byShop.id);
    return {
      user: full ?? byShop,
      normalizedShop,
      resolution: "shopify_shop",
    };
  }

  const syntheticEmail = shopifySyntheticMerchantEmail(normalizedShop);
  if (syntheticEmail) {
    const byEmail = await storage.getUserByEmail(syntheticEmail);
    if (byEmail) {
      const full = await storage.getUserForSession(byEmail.id);
      console.log("[Shopify Install] Reusing merchant by synthetic email", {
        shop: normalizedShop,
        userId: byEmail.id,
        priorShopifyShop: full?.shopifyShop ?? byEmail.shopifyShop ?? null,
      });
      return {
        user: full ?? byEmail,
        normalizedShop,
        resolution: "synthetic_email",
      };
    }
  }

  if (options.sessionUserId) {
    const sessionUser = await storage.getUserForSession(options.sessionUserId);
    if (sessionUser && !sessionUser.shopifyShop) {
      return {
        user: sessionUser,
        normalizedShop,
        resolution: "session_link",
      };
    }
  }

  return { user: undefined, normalizedShop, resolution: "new_merchant" };
}

export function isUsersEmailUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "23505") return true;
  const message = (error as { message?: string }).message ?? String(error);
  return message.includes("users_email_unique");
}
