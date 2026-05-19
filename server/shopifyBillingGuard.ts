import type { Request, Response } from "express";
import {
  isShopifyShopDomain,
  normalizeShopifyShopDomain,
  SHOPIFY_BILLING_REQUIRED_CODE,
} from "@shared/shopifyBilling";

type ShopifyBillingUser = { id?: string; shopifyShop?: string | null };

export function shopDomainFromRequest(req: Request): string | null {
  const fromQuery = typeof req.query.shop === "string" ? req.query.shop : null;
  const body = req.body as { shop?: string } | undefined;
  const fromBody = typeof body?.shop === "string" ? body.shop : null;
  return normalizeShopifyShopDomain(fromQuery) ?? normalizeShopifyShopDomain(fromBody);
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
