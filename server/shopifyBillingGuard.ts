import type { Request, Response } from "express";
import {
  isShopifyShopDomain,
  normalizeShopifyShopDomain,
  SHOPIFY_BILLING_REQUIRED_CODE,
} from "@shared/shopifyBilling";

type ShopifyBillingUser = { id?: string; shopifyShop?: string | null };

function shopFromQueryValue(value: unknown): string | null {
  if (typeof value === "string") return normalizeShopifyShopDomain(value);
  if (Array.isArray(value) && typeof value[0] === "string") {
    return normalizeShopifyShopDomain(value[0]);
  }
  return null;
}

export function shopDomainFromRequest(req: Request): string | null {
  const fromQuery = shopFromQueryValue(req.query.shop);
  const body = req.body as { shop?: unknown } | undefined;
  const fromBody =
    typeof body?.shop === "string"
      ? normalizeShopifyShopDomain(body.shop)
      : body?.shop != null
        ? shopFromQueryValue(body.shop)
        : null;
  return fromQuery ?? fromBody;
}

/** Raw shop values before normalization (for structured logs). */
export function rawShopFromRequest(req: Request): {
  bodyShop: unknown;
  queryShop: unknown;
} {
  const body = req.body as { shop?: unknown } | undefined;
  return {
    bodyShop: body?.shop ?? null,
    queryShop: req.query.shop ?? null,
  };
}

/** True when account is linked to Shopify or request carries a valid ?shop= domain. */
export function isShopifyBillingAccount(
  user: ShopifyBillingUser | null | undefined,
  req?: Request,
): boolean {
  if (user?.shopifyShop && isShopifyShopDomain(user.shopifyShop)) return true;
  if (req && shopDomainFromRequest(req)) return true;
  return false;
}

export function assertStripeNotAllowedForShopifyUser(
  user: ShopifyBillingUser | null | undefined,
  context: string,
): void {
  if (!user?.shopifyShop) return;
  console.warn("[ShopifyBilling] Blocked Stripe at service layer", {
    context,
    userId: user.id,
    shopifyShop: user.shopifyShop,
  });
  const err = new Error(
    "This account is billed through Shopify. Use Pricing or Settings to subscribe or change plans.",
  ) as Error & { code?: string };
  err.code = SHOPIFY_BILLING_REQUIRED_CODE;
  throw err;
}

/**
 * Blocks Stripe checkout/portal/cancel for Shopify-billed accounts.
 * Logs every blocked attempt for compliance audits.
 */
export async function rejectStripeIfShopifyUser(
  req: Request,
  res: Response,
  context: string,
  getUser: (userId: string) => Promise<ShopifyBillingUser | undefined>,
): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) return false;

  const user = await getUser(userId);
  const shopQuery = shopDomainFromRequest(req);
  if (!isShopifyBillingAccount(user, req)) return false;

  console.warn("[ShopifyBilling] Blocked Stripe checkout attempt", {
    context,
    userId,
    shopifyShop: user?.shopifyShop ?? null,
    shopQuery,
    path: req.path,
    method: req.method,
  });

  res.status(400).json({
    error:
      "This account is billed through Shopify. Use Pricing or Settings to subscribe or change plans in Shopify.",
    code: SHOPIFY_BILLING_REQUIRED_CODE,
  });
  return true;
}
