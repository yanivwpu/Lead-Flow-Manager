import type { Request } from "express";
import {
  normalizeShopifyShopDomain,
  SHOPIFY_RECONNECT_REQUIRED_CODE,
  SHOPIFY_RECONNECT_REQUIRED_MESSAGE,
} from "@shared/shopifyBilling";
import { shopDomainFromRequest } from "./shopifyBillingGuard";
import { storage } from "./storage";

export type ShopifyMerchantShopSource = "user.shopifyShop" | "request.shop" | "install.lookup";

export type ResolvedShopifyMerchant = {
  shop: string;
  accessToken: string;
  billingUserId: string;
  shopSource: ShopifyMerchantShopSource;
};

export type ResolveShopifyMerchantFailure = {
  ok: false;
  status: number;
  code: string;
  error: string;
  reason: string;
};

export type ResolveShopifyMerchantResult =
  | { ok: true; merchant: ResolvedShopifyMerchant }
  | ResolveShopifyMerchantFailure;

function buildLogContext(input: {
  context: string;
  plan?: string;
  shopParam: string | null;
  userShopifyShop: string | null | undefined;
  resolvedShop: string | null;
  hasToken: boolean;
  reason: string;
  currentUserId: string;
  billingUserId?: string;
  installUserId?: string;
}) {
  return {
    context: input.context,
    plan: input.plan ?? null,
    shopParam: input.shopParam,
    userShopifyShop: input.userShopifyShop ?? null,
    resolvedShop: input.resolvedShop,
    hasToken: input.hasToken,
    reason: input.reason,
    currentUserId: input.currentUserId,
    billingUserId: input.billingUserId ?? null,
    installUserId: input.installUserId ?? null,
  };
}

/**
 * Resolves Shopify shop + access token for session-authenticated billing (checkout-web).
 * Priority: authenticated user.shopifyShop → request shop param → install row by shop.
 */
export async function resolveShopifyMerchantForBilling(
  req: Request,
  currentUserId: string,
  context: string,
  plan?: string,
): Promise<ResolveShopifyMerchantResult> {
  const currentUser = await storage.getUser(currentUserId);
  const shopParam = shopDomainFromRequest(req);
  const userShop = normalizeShopifyShopDomain(currentUser?.shopifyShop);

  let resolvedShop: string | null = userShop ?? shopParam;
  let shopSource: ShopifyMerchantShopSource | null = userShop
    ? "user.shopifyShop"
    : shopParam
      ? "request.shop"
      : null;

  if (!resolvedShop) {
    const logContext = buildLogContext({
      context,
      plan,
      shopParam,
      userShopifyShop: currentUser?.shopifyShop,
      resolvedShop: null,
      hasToken: false,
      reason: "no_shop_context",
      currentUserId,
    });
    console.warn("[ShopifyBilling] checkout-web context", logContext);
    return {
      ok: false,
      status: 400,
      code: "SHOPIFY_SHOP_REQUIRED",
      error: "Shopify shop context is required. Open WhachatCRM from your Shopify admin.",
      reason: "no_shop_context",
    };
  }

  const installUser = await storage.getUserByShopifyShop(resolvedShop);
  if (!shopSource && installUser) {
    shopSource = "install.lookup";
  }

  let accessToken: string | null = null;
  let billingUserId = currentUserId;
  let reason = "ok";

  if (userShop === resolvedShop && currentUser?.shopifyAccessToken) {
    accessToken = currentUser.shopifyAccessToken;
    billingUserId = currentUser.id;
    reason = "token_from_current_user";
  } else if (installUser?.shopifyAccessToken) {
    accessToken = installUser.shopifyAccessToken;
    billingUserId = installUser.id;
    shopSource = shopSource ?? "install.lookup";
    reason = "token_from_install_lookup";

    if (currentUser && currentUser.id !== installUser.id) {
      const logContext = buildLogContext({
        context,
        plan,
        shopParam,
        userShopifyShop: currentUser.shopifyShop,
        resolvedShop,
        hasToken: true,
        reason: "user_mismatch",
        currentUserId,
        billingUserId: installUser.id,
        installUserId: installUser.id,
      });
      console.warn("[ShopifyBilling] checkout-web context", logContext);
      return {
        ok: false,
        status: 400,
        code: SHOPIFY_RECONNECT_REQUIRED_CODE,
        error: SHOPIFY_RECONNECT_REQUIRED_MESSAGE,
        reason: "user_mismatch",
      };
    }
  } else {
    reason = "missing_token";
  }

  const hasToken = !!accessToken;
  const logContext = buildLogContext({
    context,
    plan,
    shopParam,
    userShopifyShop: currentUser?.shopifyShop,
    resolvedShop,
    hasToken,
    reason,
    currentUserId,
    billingUserId,
    installUserId: installUser?.id,
  });
  console.log("[ShopifyBilling] checkout-web context", logContext);

  if (!hasToken || !accessToken) {
    return {
      ok: false,
      status: 400,
      code: SHOPIFY_RECONNECT_REQUIRED_CODE,
      error: SHOPIFY_RECONNECT_REQUIRED_MESSAGE,
      reason: "missing_token",
    };
  }

  if (currentUser && currentUser.id === billingUserId) {
    const patch: {
      shopifyShop?: string;
      shopifyAccessToken?: string;
      shopifyInstalledAt?: Date;
    } = {};
    if (!currentUser.shopifyShop) patch.shopifyShop = resolvedShop;
    if (!currentUser.shopifyAccessToken) patch.shopifyAccessToken = accessToken;
    if (!currentUser.shopifyInstalledAt && installUser?.shopifyInstalledAt) {
      patch.shopifyInstalledAt = installUser.shopifyInstalledAt;
    } else if (!currentUser.shopifyInstalledAt && Object.keys(patch).length > 0) {
      patch.shopifyInstalledAt = new Date();
    }
    if (Object.keys(patch).length > 0) {
      await storage.updateUser(currentUser.id, patch);
      console.log("[ShopifyBilling] Linked shopifyShop to current user", {
        userId: currentUser.id,
        shop: resolvedShop,
        fields: Object.keys(patch),
      });
    }
  }

  return {
    ok: true,
    merchant: {
      shop: resolvedShop,
      accessToken,
      billingUserId,
      shopSource: shopSource ?? "install.lookup",
    },
  };
}
