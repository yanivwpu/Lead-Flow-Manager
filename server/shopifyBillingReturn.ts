import type { Request, Response } from "express";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { resolveShopifyMerchantForBilling } from "./shopifyMerchantResolver";
import { syncShopifyBillingToUser } from "./shopify";

/** A browser return requests verification; it is never proof of a plan or identity. */
export async function respondShopifyBillingReturn(
  req: Request,
  res: Response,
  mode: "redirect" | "json",
) {
  res.setHeader("Cache-Control", "no-store");
  const hasQuery = (key: string) =>
    Object.prototype.hasOwnProperty.call(req.query, key);
  // Presence only: never log raw URLs, query values, cookies, signatures or tokens.
  console.info("[ShopifyBilling] approval_return", {
    hasSession: !!req.user,
    hasShop: hasQuery("shop"),
    hasPlanHandle: hasQuery("plan_handle"),
    hasChargeId: hasQuery("charge_id"),
  });
  if (!req.user)
    return res.status(401).json({
      error:
        "Sign in to WhachatCRM to verify this subscription. No new approval is required.",
      code: "SESSION_REQUIRED",
    });
  try {
    const resolved = await resolveShopifyMerchantForBilling(
      req,
      (req.user as { id: string }).id,
      "billing-return",
    );
    if (!resolved.ok)
      return res
        .status(resolved.status)
        .json({ error: resolved.error, code: resolved.code });
    const merchant = resolved.merchant;
    if (
      hasQuery("shop") &&
      normalizeShopifyShopDomain(
        typeof req.query.shop === "string" ? req.query.shop : null,
      ) !== merchant.shop
    )
      return res.status(400).json({
        error: "Shop does not match the authenticated installation",
        code: "SHOPIFY_SHOP_MISMATCH",
      });
    const synced = await syncShopifyBillingToUser(
      merchant.billingUserId,
      merchant.shop,
      merchant.accessToken,
    );
    const redirectTo = synced.ok
      ? `/app/inbox?shopify_billing=success&plan=${encodeURIComponent(synced.aiBrainAddon && synced.billingPlan !== "free" ? "ai-brain" : synced.billingPlan)}`
      : "/app/inbox?shopify_billing=verification_pending";
    if (mode === "redirect") return res.redirect(redirectTo);
    return res.json({
      ok: synced.ok,
      billingPlan: synced.billingPlan,
      shopifySubscriptionStatus: synced.shopifySubscriptionStatus,
      redirectTo,
    });
  } catch {
    console.warn("[ShopifyBilling] approval_verification_pending");
    return res.status(503).json({
      error:
        "Subscription verification is temporarily unavailable. Retry without approving another charge.",
      code: "SHOPIFY_BILLING_VERIFICATION_PENDING",
    });
  }
}
