import type Stripe from "stripe";
import { storage } from "./storage";
import { PLAN_LIMITS, type SubscriptionPlan, type User } from "@shared/schema";
import {
  getEffectivePlanForUser,
  syncTrialExpiryIfNeeded,
  hasActivePaidPlan,
} from "./trialEntitlements";
import { paidSourceOptionsForUser } from "./ghlMarketplaceGrant";
import { getUncachableStripeClient } from "./stripeClient";
import { resolveStripeCheckoutRedirectOrigin } from "./stripeCheckoutRedirectBase";
import { getAppOrigin } from "./urlOrigins";
import {
  buildPostCheckoutSuccessUrl,
  buildStripeCancelUrl,
  sanitizeStripeReturnPath,
} from "./checkoutReturnPath";
import { assertStripeNotAllowedForShopifyUser } from "./shopifyBillingGuard";
import {
  AI_BRAIN_ADDON_RETIRED_CODE,
  AI_BRAIN_ADDON_RETIRED_MESSAGE,
  STARTER_CHECKOUT_RETIRED_CODE,
  STARTER_CHECKOUT_RETIRED_MESSAGE,
  resolveStripePlanPriceId,
  stripePriceEnvForPlan,
  type StripeBillingInterval,
} from "./stripePlanPriceIds";
import { resolveUsagePeriodFromDates } from "@shared/usagePeriod";
import { nextConversationUsageAfterPeriodCheck } from "@shared/conversationUsagePeriod";
import {
  growthEngineEligibleForPlan,
  resolveAIBrainAccess,
  type AIBrainSource,
} from "@shared/aiBrainEntitlement";
import { LEGACY_AI_BRAIN_ADDON_PRICE_USD } from "@shared/pricingEntitlements";

export type StripeCheckoutRedirectOpts = {
  successReturnPath?: string;
  cancelReturnPath?: string;
};

export type { AIBrainSource };

/** @deprecated AI Brain is included with Pro; add-on checkout is retired. */
export const AI_BRAIN_REQUIRES_PAID_PLAN_MESSAGE = AI_BRAIN_ADDON_RETIRED_MESSAGE;

export interface UserLimits {
  plan: SubscriptionPlan;
  planName: string;
  conversationsLimit: number;
  conversationsUsed: number;
  conversationsRemaining: number;
  isLifetimeLimit: boolean;
  maxUsers: number;
  maxWhatsappNumbers: number;
  canSendMessages: boolean;
  followUpsEnabled: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  teamInbox: boolean;
  assignmentEnabled: boolean;
  workflowsEnabled: boolean;
  integrationsEnabled: boolean;
  maxWebhooks: number;
  templatesEnabled: boolean;
  chatbotEnabled: boolean;
  isAtLimit: boolean;
  isAtWarning: boolean;
  /** Start of the current conversation usage window (Stripe or UTC month). */
  conversationUsagePeriodStart: Date;
  /** Exclusive end of the current conversation usage window. */
  conversationUsagePeriodEnd: Date;
  conversationUsagePeriodSource: "billing_period" | "utc_month";
  suggestedUpgrade: SubscriptionPlan | null;
  isInTrial: boolean;
  trialEndsAt: Date | null;
  trialDaysRemaining: number;
  hasAIBrain: boolean;
  /** @deprecated Alias of hasAIBrain — kept for existing API clients. */
  hasAIBrainAddon: boolean;
  /** Why hasAIBrain is true; never inferred from legacy subscriptionPlan. */
  aiBrainSource: AIBrainSource;
  /** Same as hasAIBrain. */
  effectiveHasAIBrain: boolean;
  /** Realtor Growth Engine: requires an active effective Pro plan (unless admin override). */
  growthEngineEligible: boolean;
  /** When true, admin has toggled Growth Engine override; use with growthEngineEntitlementOverrideGrant. */
  growthEngineEntitlementOverrideEnabled?: boolean;
  growthEngineEntitlementOverrideGrant?: boolean;
  /** Admin plan override (effective plan uses this when planOverrideEnabled). */
  planOverrideEnabled?: boolean;
  planOverride?: string | null;
  aiBrainEntitlementOverrideEnabled?: boolean;
  aiBrainEntitlementOverrideGrant?: boolean;
  /** True when effective plan includes AI Brain (Pro / Pro trial). */
  aiBrainBasePlanEligible: boolean;
  /** Independent GHL Marketplace Pro grant (does not mutate users.billingPlan). */
  ghlMarketplaceProActive: boolean;
}

class SubscriptionService {
  async getUserLimits(userId: string): Promise<UserLimits | null> {
    // IMPORTANT: use full user row so trials/entitlements resolve correctly.
    // storage.getUser() is an auth-core minimal projection (no trial fields).
    let user = await storage.getUserForSession(userId);
    if (!user) return null;

    user = await syncTrialExpiryIfNeeded(user);

    const now = new Date();
    const paidSources = await paidSourceOptionsForUser(userId);
    const isInTrial =
      !hasActivePaidPlan(user, now, paidSources) &&
      !!user.trialEndsAt &&
      new Date(user.trialEndsAt) > now &&
      user.trialStatus !== "expired";

    const trialDaysRemaining =
      user.trialEndsAt && isInTrial
        ? Math.max(
            0,
            Math.ceil(
              (new Date(user.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            ),
          )
        : 0;

    const effectivePlan = getEffectivePlanForUser(user, now, paidSources);
    const planLimits = PLAN_LIMITS[effectivePlan];

    const usagePeriod = resolveUsagePeriodFromDates(
      user.currentPeriodStart ? new Date(user.currentPeriodStart) : null,
      user.currentPeriodEnd ? new Date(user.currentPeriodEnd) : null,
      now,
    );
    const usageDecision = nextConversationUsageAfterPeriodCheck({
      storedPeriodStart: user.conversationUsagePeriodStart
        ? new Date(user.conversationUsagePeriodStart)
        : null,
      canonicalPeriodStart: usagePeriod.periodStart,
      conversationsUsed: user.monthlyConversations || 0,
      conversationsLimit: planLimits.conversationsPerMonth,
    });
    let conversationsUsed = usageDecision.conversationsUsed;
    if (usageDecision.persistPeriodStart || usageDecision.resetCounter) {
      await storage.updateUser(userId, {
        conversationUsagePeriodStart: usagePeriod.periodStart,
        ...(usageDecision.resetCounter ? { monthlyConversations: 0 } : {}),
      });
    }
    
    const conversationsLimit = planLimits.conversationsPerMonth;
    const conversationsRemaining = Math.max(0, conversationsLimit - conversationsUsed);
    const isAtLimit = conversationsRemaining <= 0;
    const isAtWarning = conversationsRemaining > 0 && conversationsRemaining <= 10;

    let suggestedUpgrade: SubscriptionPlan | null = null;
    if (effectivePlan === "free" && !isInTrial) {
      suggestedUpgrade = "pro";
    } else if (effectivePlan === "starter") {
      suggestedUpgrade = "pro";
    }

    const aiEntitlement = await this.resolveAIBrainEntitlement(user, paidSources.ghlMarketplaceProActive);
    const hasAIBrain = aiEntitlement.has;
    const aiBrainSource: AIBrainSource = aiEntitlement.source;
    const aiBrainBasePlanEligible = effectivePlan === "pro";

    let growthEngineEligible = growthEngineEligibleForPlan(effectivePlan);
    if (user.growthEngineEntitlementOverrideEnabled) {
      growthEngineEligible = !!user.growthEngineEntitlementOverrideGrant;
    }

    return {
      plan: effectivePlan,
      planName: isInTrial ? "Pro trial" : planLimits.name,
      conversationsLimit: planLimits.conversationsPerMonth,
      conversationsUsed,
      conversationsRemaining,
      isLifetimeLimit: false,
      maxUsers: planLimits.maxUsers,
      maxWhatsappNumbers: planLimits.maxWhatsappNumbers,
      canSendMessages: !isAtLimit,
      followUpsEnabled: planLimits.followUpsEnabled,
      emailNotifications: planLimits.emailNotifications,
      pushNotifications: planLimits.pushNotifications,
      teamInbox: planLimits.teamInbox,
      assignmentEnabled: planLimits.assignmentEnabled,
      workflowsEnabled: planLimits.workflowsEnabled,
      integrationsEnabled: planLimits.integrationsEnabled,
      maxWebhooks: planLimits.maxWebhooks,
      templatesEnabled: planLimits.templatesEnabled,
      chatbotEnabled: (planLimits as any).chatbotEnabled || false,
      isAtLimit,
      isAtWarning,
      conversationUsagePeriodStart: usagePeriod.periodStart,
      conversationUsagePeriodEnd: usagePeriod.periodEnd,
      conversationUsagePeriodSource: usagePeriod.source,
      suggestedUpgrade,
      isInTrial,
      trialEndsAt: user.trialEndsAt,
      trialDaysRemaining,
      hasAIBrain,
      hasAIBrainAddon: hasAIBrain,
      effectiveHasAIBrain: hasAIBrain,
      aiBrainSource,
      growthEngineEligible,
      growthEngineEntitlementOverrideEnabled: !!user.growthEngineEntitlementOverrideEnabled,
      growthEngineEntitlementOverrideGrant: !!user.growthEngineEntitlementOverrideGrant,
      planOverrideEnabled: !!user.planOverrideEnabled,
      planOverride: user.planOverrideEnabled ? user.planOverride ?? null : null,
      aiBrainEntitlementOverrideEnabled: !!user.aiBrainEntitlementOverrideEnabled,
      aiBrainEntitlementOverrideGrant: !!user.aiBrainEntitlementOverrideGrant,
      aiBrainBasePlanEligible,
      ghlMarketplaceProActive: paidSources.ghlMarketplaceProActive,
    };
  }

  private isManualAIBrainEmail(email: string | undefined): boolean {
    const raw = process.env.AI_BRAIN_MANUAL_EMAILS || "";
    if (!email || !raw.trim()) return false;
    const normalized = email.trim().toLowerCase();
    return raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes(normalized);
  }

  /** Legacy match when env price ID unknown or old prices used $29 (2900 cents). */
  private matchesLegacyAiBrainProduct(product: Stripe.Product): boolean {
    const productName = (product.name || "").toLowerCase();
    const productMetadata = product.metadata || {};
    return (
      productName.includes("ai brain") ||
      productName.includes("ai-brain") ||
      productMetadata.type === "ai_brain_addon"
    );
  }

  /** True only if an active subscription item is the AI Brain price or a verified AI Brain product. */
  async stripeCustomerHasActiveAIBrainAddon(
    stripeCustomerId: string | null | undefined,
  ): Promise<boolean> {
    if (!stripeCustomerId) return false;

    const aiBrainPriceId = process.env.STRIPE_AI_BRAIN_MONTHLY_PRICE_ID?.trim();
    const AI_BRAIN_ADDON_AMOUNT = LEGACY_AI_BRAIN_ADDON_PRICE_USD * 100;

    try {
      const stripe = await getUncachableStripeClient();
      // Stripe allows at most 4 expansion levels; do not expand price.product on list (exceeds depth).
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "active",
        limit: 25,
        expand: ["data.items.data.price"],
      });

      for (const sub of subscriptions.data) {
        for (const item of sub.items.data) {
          const rawPrice = item.price;
          if (!rawPrice || typeof rawPrice === "string") continue;
          const price = rawPrice as Stripe.Price;

          if (aiBrainPriceId && price.id === aiBrainPriceId) {
            return true;
          }

          if (price.unit_amount !== AI_BRAIN_ADDON_AMOUNT) continue;

          const pref = price.product;
          if (typeof pref === "object" && pref !== null && !pref.deleted) {
            if (this.matchesLegacyAiBrainProduct(pref)) return true;
            continue;
          }
          if (typeof pref === "string") {
            try {
              const product = await stripe.products.retrieve(pref);
              if (this.matchesLegacyAiBrainProduct(product)) return true;
            } catch (prodErr: unknown) {
              const msg = prodErr instanceof Error ? prodErr.message : String(prodErr);
              console.warn("[AI Brain addon check] legacy product retrieve skipped", {
                productId: pref,
                message: msg,
              });
            }
          }
        }
      }
      return false;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[AI Brain addon check] subscriptions.list failed", {
        message: msg,
        customerId: stripeCustomerId,
      });
      return false;
    }
  }

  private async resolveAIBrainEntitlement(
    user: User,
    ghlMarketplaceProActive = false,
  ): Promise<{
    has: boolean;
    source: AIBrainSource;
  }> {
    const effectivePlan = getEffectivePlanForUser(user, undefined, { ghlMarketplaceProActive });
    const liveStripeAddon =
      effectivePlan === "starter"
        ? await this.stripeCustomerHasActiveAIBrainAddon(user.stripeCustomerId)
        : false;
    const resolved = resolveAIBrainAccess(user, {
      liveStripeAddon,
      manualEmailGrant: this.isManualAIBrainEmail(user.email ?? undefined),
      ghlMarketplaceProActive,
    });
    return { has: resolved.hasAIBrain, source: resolved.source };
  }

  async checkAndDecrementConversation(userId: string): Promise<{ 
    allowed: boolean; 
    remaining: number;
    limit: number;
    used: number;
    planName: string;
  }> {
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, remaining: 0, limit: 0, used: 0, planName: "free" };

    if (limits.isAtLimit) {
      return { 
        allowed: false, 
        remaining: 0, 
        limit: limits.conversationsLimit, 
        used: limits.conversationsUsed, 
        planName: limits.planName 
      };
    }

    return { 
      allowed: true, 
      remaining: limits.conversationsRemaining,
      limit: limits.conversationsLimit,
      used: limits.conversationsUsed,
      planName: limits.planName
    };
  }

  async createCheckoutSession(
    userId: string,
    plan: SubscriptionPlan,
    baseUrl: string,
    billingInterval: StripeBillingInterval = "monthly",
    redirect?: StripeCheckoutRedirectOpts,
  ): Promise<{ url: string }> {
    const user = await storage.getUserForSession(userId);
    if (!user) throw new Error("User not found");
    assertStripeNotAllowedForShopifyUser(user, "createCheckoutSession");

    // Paid Stripe Checkout only. Never grant or extend the internal 14-day trial.
    // Expired-trial accounts pay the normal Pro subscription price.
    const stripe = await getUncachableStripeClient();
    const resolvedBaseUrl = resolveStripeCheckoutRedirectOrigin(getAppOrigin() || baseUrl);

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      await storage.updateUser(userId, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }

    if (plan === "free") {
      throw new Error("Cannot checkout for free plan");
    }
    if (plan === "starter") {
      throw Object.assign(new Error(STARTER_CHECKOUT_RETIRED_MESSAGE), {
        code: STARTER_CHECKOUT_RETIRED_CODE,
      });
    }

    const priceId = resolveStripePlanPriceId(plan, billingInterval);
    const envName = stripePriceEnvForPlan(plan, billingInterval);

    if (!priceId) {
      throw new Error(`Missing ${envName}`);
    }

    const successPath = sanitizeStripeReturnPath(redirect?.successReturnPath ?? "/app/inbox");
    const cancelPath = sanitizeStripeReturnPath(redirect?.cancelReturnPath ?? successPath);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: buildPostCheckoutSuccessUrl(resolvedBaseUrl, successPath),
      cancel_url: buildStripeCancelUrl(resolvedBaseUrl, cancelPath),
      metadata: {
        userId,
        type: 'plan',
        plan,
        billingInterval,
      },
    });

    if (!session.url) throw new Error("Failed to create checkout session");
    return { url: session.url };
  }

  /**
   * Legacy Pro + AI Brain bundle — now Pro-only checkout (Brain is included).
   */
  async createProPlusAICheckoutSession(
    userId: string,
    baseUrl: string,
    redirect?: StripeCheckoutRedirectOpts,
  ): Promise<{ url: string }> {
    return this.createCheckoutSession(userId, "pro", baseUrl, "monthly", redirect);
  }

  /**
   * Legacy plan + AI Brain bundle. Pro routes to Pro-only checkout.
   * Starter bundles are rejected (not converted to a $49 charge).
   */
  async createPlanAIBundleCheckoutSession(
    userId: string,
    bundlePlan: "starter" | "pro",
    baseUrl: string,
    redirect?: StripeCheckoutRedirectOpts,
  ): Promise<{ url: string }> {
    if (bundlePlan === "starter") {
      throw Object.assign(new Error(STARTER_CHECKOUT_RETIRED_MESSAGE), {
        code: STARTER_CHECKOUT_RETIRED_CODE,
      });
    }
    return this.createCheckoutSession(userId, "pro", baseUrl, "monthly", redirect);
  }

  async createAddonCheckoutSession(
    _userId: string,
    _baseUrl: string,
    _redirect?: StripeCheckoutRedirectOpts,
  ): Promise<{ url: string }> {
    throw Object.assign(new Error(AI_BRAIN_ADDON_RETIRED_MESSAGE), {
      code: AI_BRAIN_ADDON_RETIRED_CODE,
    });
  }

  async createPortalSession(userId: string, returnUrl: string): Promise<{ url: string }> {
    const user = await storage.getUserForSession(userId);
    if (!user) throw new Error("User not found");
    assertStripeNotAllowedForShopifyUser(user, "createPortalSession");

    const stripe = await getUncachableStripeClient();

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      await storage.updateUser(userId, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  /**
   * Never mark the local plan Free while Stripe is still billing.
   * Cancellation happens in the Stripe Customer Portal; webhooks apply the result.
   */
  async cancelSubscription(
    userId: string,
    returnUrl?: string,
  ): Promise<{ success: boolean; message: string; url?: string; code?: string }> {
    const origin = resolveStripeCheckoutRedirectOrigin(getAppOrigin());
    const portalReturn = returnUrl || `${origin}/app/settings`;
    const portal = await this.createPortalSession(userId, portalReturn);
    return {
      success: true,
      url: portal.url,
      code: "USE_STRIPE_PORTAL",
      message: "Manage or cancel your subscription in the Stripe customer portal. Your plan stays active until Stripe confirms cancellation.",
    };
  }

  async cancelSubscriptionImmediately(
    userId: string,
    returnUrl?: string,
  ): Promise<{ success: boolean; message: string; url?: string; code?: string }> {
    return this.cancelSubscription(userId, returnUrl);
  }

  async canSendMessage(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, reason: "User not found" };
    if (limits.isAtLimit) {
      return { allowed: false, reason: "You have reached your conversation limit. Please upgrade your plan." };
    }
    return { allowed: true };
  }

  async canStartConversation(userId: string, _whatsappPhone: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, reason: "User not found" };
    if (limits.isAtLimit) {
      return { allowed: false, reason: "You have reached your conversation limit. Please upgrade your plan." };
    }
    return { allowed: true };
  }

  async checkConversationThrottle(userId: string, _whatsappPhone: string): Promise<{ allowed: boolean; reason?: string; retryAfter?: number; messagesInWindow?: number }> {
    return { allowed: true, messagesInWindow: 0 };
  }

  async trackConversationWindow(userId: string, _chatId: string | number, _whatsappPhone: string): Promise<void> {
  }

  async incrementConversationUsage(userId: string): Promise<void> {
    // Apply period reset first so trial-only Free accounts cannot stay locked.
    await this.getUserLimits(userId);
    // Atomic increment — never read-modify-write (avoids lost updates and double-set races).
    await storage.incrementMonthlyConversations(userId);
  }
}

export const subscriptionService = new SubscriptionService();

export { getEffectivePlanForUser } from "./trialEntitlements";
