import type { Request, Response } from "express";
import {
  buildShopifyManagedPricingUrl,
  DEFAULT_SHOPIFY_APP_HANDLE,
  SHOPIFY_MANAGED_PRICING_CODE,
  SHOPIFY_MANAGED_PRICING_INSTRUCTIONS,
} from "@shared/shopifyManagedPricing";
import { resolveShopifyMerchantForBilling } from "./shopifyMerchantResolver";

export function getShopifyAppHandle(): string {
  const raw = process.env.SHOPIFY_APP_HANDLE?.trim();
  return raw ? raw.toLowerCase() : DEFAULT_SHOPIFY_APP_HANDLE;
}

export type ManagedPricingPayload = {
  planSelectionUrl: string | null;
  confirmationUrl: string | null;
  instructions: string;
  code: typeof SHOPIFY_MANAGED_PRICING_CODE;
};

export function managedPricingPayloadForShop(shop: string): ManagedPricingPayload {
  const planSelectionUrl = buildShopifyManagedPricingUrl(shop, getShopifyAppHandle());
  return {
    planSelectionUrl,
    confirmationUrl: planSelectionUrl,
    instructions: SHOPIFY_MANAGED_PRICING_INSTRUCTIONS,
    code: SHOPIFY_MANAGED_PRICING_CODE,
  };
}

/** Session-auth: resolve shop and return Shopify Admin plan selection URL (no Billing API). */
export async function respondSessionManagedPricing(
  req: Request,
  res: Response,
  userId: string,
  context: string,
): Promise<void> {
  const resolved = await resolveShopifyMerchantForBilling(req, userId, context);
  if (!resolved.ok) {
    res.status(resolved.status).json({ error: resolved.error, code: resolved.code });
    return;
  }

  const payload = managedPricingPayloadForShop(resolved.merchant.shop);
  if (!payload.planSelectionUrl) {
    res.status(200).json({
      ...payload,
      error: payload.instructions,
    });
    return;
  }

  res.json(payload);
}
