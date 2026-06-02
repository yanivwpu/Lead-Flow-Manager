import type { Request } from "express";
import type { TemplateEntitlement } from "@shared/schema";
import { isShopifyShopDomain } from "@shared/shopifyBilling";
import { shopDomainFromRequest } from "./shopifyBillingGuard";
import {
  resolveShopifyMerchantForBilling,
  type ResolvedShopifyMerchant,
} from "./shopifyMerchantResolver";
import { storage } from "./storage";
import { getRgeOnboardingProgress, saveRgeOnboardingProgress } from "./rgeOnboardingProgress";
import { RGE_TEMPLATE_ID } from "@shared/rgePaths";
import { ensureGrowthEnginePurchasedTask } from "./growthEngineSetupService";
import type { UserLimits } from "./subscriptionService";

export const RGE_PURCHASE_LOG = "[RGE Purchase]";
export const RGE_CHECKOUT_SUCCESS_LOG = "[RGE Checkout Success]";
export const RGE_STRIPE_WEBHOOK_LOG = "[RGE Stripe Webhook]";

export type RgePurchaseDenialCode =
  | "rge_already_purchased"
  | "rge_ge_access_denied"
  | "rge_stripe_price_missing"
  | "rge_stripe_checkout_failed";

export function logRgePurchaseEvent(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.warn(RGE_PURCHASE_LOG, event, payload);
}

export function logRgeCheckoutSuccess(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.warn(RGE_CHECKOUT_SUCCESS_LOG, event, payload);
}

export function logRgeStripeWebhook(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.warn(RGE_STRIPE_WEBHOOK_LOG, event, payload);
}

export type FulfillRgePurchaseResult = {
  entitlement: TemplateEntitlement;
  installCreated: boolean;
  progressInitialized: boolean;
  entitlementCreated: boolean;
};

/** Idempotent: entitlement purchased + pending install + onboarding step 1 + GE setup task. */
export function shouldAutoGrantGrowthEngineViaAdminOverride(
  limits: Pick<
    UserLimits,
    "growthEngineEntitlementOverrideEnabled" | "growthEngineEntitlementOverrideGrant"
  >,
): boolean {
  return !!(
    limits.growthEngineEntitlementOverrideEnabled && limits.growthEngineEntitlementOverrideGrant
  );
}

/** Admin "Force Growth Engine access" — skip $199 checkout and unlock template entitlement. */
export async function ensureAdminOverrideGrowthEngineEntitlement(
  userId: string,
  limits: Pick<
    UserLimits,
    "growthEngineEntitlementOverrideEnabled" | "growthEngineEntitlementOverrideGrant"
  >,
): Promise<TemplateEntitlement | undefined> {
  if (!shouldAutoGrantGrowthEngineViaAdminOverride(limits)) return undefined;

  const prior = await storage.getTemplateEntitlement(userId, RGE_TEMPLATE_ID);
  if (prior && prior.status !== "locked") return prior;

  const result = await fulfillRgePurchaseAfterPayment(userId, { source: "admin_override" });
  logRgePurchaseEvent("admin_override_entitlement_granted", {
    userId,
    templateId: RGE_TEMPLATE_ID,
    entitlementCreated: result.entitlementCreated,
    status: result.entitlement.status,
  });
  return result.entitlement;
}

export async function fulfillRgePurchaseAfterPayment(
  userId: string,
  opts?: { sessionId?: string; source?: "verify" | "webhook" | "admin_override" },
): Promise<FulfillRgePurchaseResult> {
  const prior = await storage.getTemplateEntitlement(userId, RGE_TEMPLATE_ID);
  const entitlementCreated = !prior || prior.status === "locked";

  const entitlement = await storage.upsertTemplateEntitlement(userId, RGE_TEMPLATE_ID, {
    status: "purchased",
    purchasedAt: prior?.purchasedAt ?? new Date(),
  });

  logRgeCheckoutSuccess("entitlement_created", {
    userId,
    templateId: RGE_TEMPLATE_ID,
    sessionId: opts?.sessionId,
    source: opts?.source ?? "verify",
    entitlementCreated,
    status: entitlement.status,
  });

  let installCreated = false;
  const existingInstall = await storage.getTemplateInstall(userId, RGE_TEMPLATE_ID);
  if (!existingInstall) {
    await storage.createTemplateInstall({
      userId,
      templateId: RGE_TEMPLATE_ID,
      installStatus: "pending",
    });
    installCreated = true;
  }

  await ensureGrowthEnginePurchasedTask(userId).catch((e) =>
    console.error("[RGE] GE setup task after purchase fulfill:", e),
  );

  const existingProgress = await getRgeOnboardingProgress(userId);
  let progressInitialized = false;
  if (!existingProgress) {
    await saveRgeOnboardingProgress(userId, { step: 1 }).catch((e) =>
      console.error("[RGE] onboarding progress init after fulfill:", e),
    );
    progressInitialized = true;
  }

  if (progressInitialized) {
    logRgeCheckoutSuccess("onboarding_progress_initialized", {
      userId,
      sessionId: opts?.sessionId,
      source: opts?.source ?? "verify",
    });
  }

  return { entitlement, installCreated, progressInitialized, entitlementCreated };
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

/**
 * Shopify billing for RGE only when the client explicitly opts in (billingChannel=shopify)
 * with a shop on the request — not from stale users.shopifyShop alone.
 */
export function requestSignalsShopifyBilling(req: Request): boolean {
  const body = (req.body || {}) as Record<string, unknown>;
  if (body.billingChannel !== "shopify") return false;
  const shop = shopDomainFromRequest(req);
  if (!shop) return false;
  return true;
}

function userHasShopifyShopField(user: { shopifyShop?: string | null } | null | undefined): boolean {
  return !!(user?.shopifyShop && isShopifyShopDomain(user.shopifyShop));
}

/**
 * RGE one-time purchase: default Stripe on app.whachatcrm.com.
 * Shopify only when request explicitly signals Shopify session + merchant resolves.
 * Any Shopify resolution failure falls back to Stripe (never block web checkout for stale metadata).
 */
export async function resolveRgePurchaseBillingChannel(
  userId: string,
  req: Request,
): Promise<
  | { channel: "shopify"; merchant: ResolvedShopifyMerchant }
  | { channel: "stripe"; stripeFallbackReason?: string }
> {
  const user = await storage.getUser(userId);
  const hasShopifyShop = userHasShopifyShopField(user);
  const requestShop = shopDomainFromRequest(req);
  const hasValidShopifyContext = requestSignalsShopifyBilling(req);

  let selectedChannel: "stripe" | "shopify" = "stripe";

  if (hasValidShopifyContext) {
    const resolved = await resolveShopifyMerchantForBilling(req, userId, "templates/rge/purchase");
    if (resolved.ok) {
      selectedChannel = "shopify";
      logRgePurchaseEvent("billing_channel_decision", {
        userId,
        hasShopifyShop,
        hasValidShopifyContext,
        requestShop,
        selectedChannel,
        shopSource: resolved.merchant.shopSource,
      });
      return { channel: "shopify", merchant: resolved.merchant };
    }

    logRgePurchaseEvent("billing_channel_decision", {
      userId,
      hasShopifyShop,
      hasValidShopifyContext,
      requestShop,
      selectedChannel: "stripe",
      stripeFallbackReason: resolved.reason,
      resolveCode: resolved.code,
      staleMetadataHint: hasShopifyShop
        ? "users.shopify_shop present but Shopify session invalid — using Stripe. To clear: UPDATE users SET shopify_shop = NULL, shopify_access_token = NULL WHERE id = '<userId>';"
        : undefined,
    });
    return { channel: "stripe", stripeFallbackReason: resolved.reason };
  }

  if (hasShopifyShop && !hasValidShopifyContext) {
    logRgePurchaseEvent("billing_channel_decision", {
      userId,
      hasShopifyShop,
      hasValidShopifyContext: false,
      requestShop,
      selectedChannel: "stripe",
      note: "Stale shopifyShop ignored for RGE web purchase — Stripe checkout",
      devCleanupSql:
        "UPDATE users SET shopify_shop = NULL, shopify_access_token = NULL, shopify_subscription_status = NULL WHERE id = '<userId>';",
    });
  } else {
    logRgePurchaseEvent("billing_channel_decision", {
      userId,
      hasShopifyShop,
      hasValidShopifyContext: false,
      requestShop,
      selectedChannel: "stripe",
    });
  }

  return { channel: "stripe" };
}
