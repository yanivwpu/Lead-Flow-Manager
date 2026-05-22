import type { Request } from "express";
import type { TemplateEntitlement } from "@shared/schema";
import { SHOPIFY_RECONNECT_REQUIRED_CODE } from "@shared/shopifyBilling";
import { isShopifyBillingAccount } from "./shopifyBillingGuard";
import {
  resolveShopifyMerchantForBilling,
  type ResolveShopifyMerchantResult,
} from "./shopifyMerchantResolver";
import { storage } from "./storage";
import { getRgeOnboardingProgress } from "./rgeOnboardingProgress";
import { RGE_TEMPLATE_ID } from "./growthEngineSetupService";

export const RGE_PURCHASE_LOG = "[RGE Purchase]";

export type RgePurchaseDenialCode =
  | "rge_already_purchased"
  | "rge_ge_access_denied"
  | "rge_shopify_shop_required"
  | "rge_shopify_reconnect_required"
  | "rge_shopify_billing_unavailable"
  | "rge_stripe_price_missing"
  | "rge_stripe_checkout_failed";

export function logRgePurchaseEvent(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.warn(RGE_PURCHASE_LOG, event, payload);
}

/** After Neon partial reset: restore purchased/submitted from install, progress, or ops task. */
export async function reconcileRgeEntitlementForPurchase(userId: string): Promise<{
  entitlement: TemplateEntitlement | undefined;
  reconciled: boolean;
  priorStatus: string | null;
}> {
  const existing = await storage.getTemplateEntitlement(userId, RGE_TEMPLATE_ID);
  if (existing && existing.status !== "locked") {
    return { entitlement: existing, reconciled: false, priorStatus: existing.status };
  }

  const [install, progress, submission, setupTask] = await Promise.all([
    storage.getTemplateInstall(userId, RGE_TEMPLATE_ID),
    getRgeOnboardingProgress(userId),
    storage.getRealtorOnboardingSubmission(userId),
    storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID),
  ]);

  const hasPartial = !!(install || progress || submission || setupTask);
  if (!hasPartial) {
    return { entitlement: existing, reconciled: false, priorStatus: existing?.status ?? null };
  }

  let status: "purchased" | "submitted" | "installed" = "purchased";
  if (submission) {
    status = install?.installStatus === "installed" ? "installed" : "submitted";
  } else if (existing?.status === "submitted" || existing?.status === "installed") {
    status = existing.status as "submitted" | "installed";
  }

  const ent = await storage.upsertTemplateEntitlement(userId, RGE_TEMPLATE_ID, {
    status,
    purchasedAt: existing?.purchasedAt ?? install?.createdAt ?? new Date(),
    onboardingSubmittedAt: submission?.submittedAt ?? existing?.onboardingSubmittedAt ?? undefined,
  });

  logRgePurchaseEvent("entitlement_reconciled", {
    userId,
    priorStatus: existing?.status ?? null,
    nextStatus: status,
    hadInstall: !!install,
    hadProgress: !!progress,
    hadSubmission: !!submission,
    hadSetupTask: !!setupTask,
  });

  return { entitlement: ent, reconciled: true, priorStatus: existing?.status ?? null };
}

/** Stripe when Shopify context is missing/invalid; Shopify one-time only when merchant resolves. */
export async function resolveRgePurchaseBillingChannel(
  userId: string,
  req: Request,
): Promise<
  | { channel: "shopify"; merchant: NonNullable<Extract<ResolveShopifyMerchantResult, { ok: true }>["merchant"]> }
  | { channel: "stripe" }
  | { channel: "error"; status: number; code: string; error: string; reason: string }
> {
  const user = await storage.getUser(userId);
  if (!isShopifyBillingAccount(user, req)) {
    return { channel: "stripe" };
  }

  const resolved = await resolveShopifyMerchantForBilling(req, userId, "templates/rge/purchase");
  if (resolved.ok) {
    return { channel: "shopify", merchant: resolved.merchant };
  }

  const allowStripeFallback =
    resolved.reason === "no_shop_context" || resolved.reason === "missing_token";

  if (allowStripeFallback) {
    logRgePurchaseEvent("stripe_fallback", {
      userId,
      shopifyShop: user?.shopifyShop ?? null,
      code: resolved.code,
      reason: resolved.reason,
    });
    return { channel: "stripe" };
  }

  const code =
    resolved.code === SHOPIFY_RECONNECT_REQUIRED_CODE
      ? "rge_shopify_reconnect_required"
      : resolved.code === "SHOPIFY_SHOP_REQUIRED"
        ? "rge_shopify_shop_required"
        : "rge_shopify_billing_unavailable";

  return {
    channel: "error",
    status: resolved.status,
    code,
    error: resolved.error,
    reason: resolved.reason,
  };
}
