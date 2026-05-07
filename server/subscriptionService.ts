import type Stripe from "stripe";
import { storage } from "./storage";
import { PLAN_LIMITS, type SubscriptionPlan, type User } from "@shared/schema";
import {
  getEffectivePlanForUser,
  syncTrialExpiryIfNeeded,
  hasActivePaidPlan,
  isProAiTrialActive,
} from "./trialEntitlements";
import { getUncachableStripeClient } from "./stripeClient";
import { resolveStripeCheckoutRedirectOrigin } from "./stripeCheckoutRedirectBase";
import { getAppOrigin } from "./urlOrigins";
import {
  buildPostCheckoutSuccessUrl,
  buildStripeCancelUrl,
  sanitizeStripeReturnPath,
} from "./checkoutReturnPath";

export type StripeCheckoutRedirectOpts = {
  successReturnPath?: string;
  cancelReturnPath?: string;
};

export type AIBrainSource = "none" | "stripe" | "shopify" | "manual" | "demo" | "trial";

/** Shown when user tries AI Brain add-on checkout on Free (effective plan). */
export const AI_BRAIN_REQUIRES_PAID_PLAN_MESSAGE =
  "AI Brain requires an active Starter or Pro plan. Please upgrade your plan first.";

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
  suggestedUpgrade: SubscriptionPlan | null;
  isInTrial: boolean;
  trialEndsAt: Date | null;
  trialDaysRemaining: number;
  hasAIBrainAddon: boolean;
  /** Why hasAIBrainAddon is true; never inferred from legacy subscriptionPlan. */
  aiBrainSource: AIBrainSource;
  /** Same as hasAIBrainAddon — alias for API/clarity (trial + paid addons). */
  effectiveHasAIBrain: boolean;
  /** Realtor Growth Engine: requires effective Pro plan plus AI Brain entitlement. */
  growthEngineEligible: boolean;
  /** Starter or Pro effective plan — required before AI Brain add-on can apply. */
  aiBrainBasePlanEligible: boolean;
}

class SubscriptionService {
  async getUserLimits(userId: string): Promise<UserLimits | null> {
    // IMPORTANT: use full user row so trials/entitlements resolve correctly.
    // storage.getUser() is an auth-core minimal projection (no trial fields).
    let user = await storage.getUserForSession(userId);
    if (!user) return null;

    user = await syncTrialExpiryIfNeeded(user);

    const now = new Date();
    const isInTrial =
      !hasActivePaidPlan(user, now) &&
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

    const overrideEnabled = !!user.planOverrideEnabled;
    const overridePlan = (user.planOverride || "free") as SubscriptionPlan;
    const billingPlan = (user.billingPlan || "free") as SubscriptionPlan;

    const effectivePlan = getEffectivePlanForUser(user, now);
    const planLimits = PLAN_LIMITS[effectivePlan];

    // MONTHLY RESET LOGIC: Reset conversations if billing period has ended
    let conversationsUsed = user.monthlyConversations || 0;
    const currentPeriodEnd = user.currentPeriodEnd ? new Date(user.currentPeriodEnd) : null;
    
    if (currentPeriodEnd && now > currentPeriodEnd) {
      // Billing period has expired - reset the monthly counter
      conversationsUsed = 0;
      // Persist the reset to database
      await storage.updateUser(userId, { monthlyConversations: 0 });
    }
    
    const conversationsLimit = planLimits.conversationsPerMonth;
    const conversationsRemaining = Math.max(0, conversationsLimit - conversationsUsed);
    const isAtLimit = conversationsRemaining <= 0;
    const isAtWarning = conversationsRemaining > 0 && conversationsRemaining <= 10;

    let suggestedUpgrade: SubscriptionPlan | null = null;
    const upgradePlanSource = overrideEnabled ? overridePlan : billingPlan;
    if (upgradePlanSource === "free" && !isInTrial) suggestedUpgrade = "starter";
    else if (upgradePlanSource === "starter") suggestedUpgrade = "pro";

    const aiBrainBasePlanEligible =
      effectivePlan === "starter" || effectivePlan === "pro";

    const aiEntitlement = await this.resolveAIBrainEntitlement(user);
    const hasAIBrainAddon =
      aiBrainBasePlanEligible && aiEntitlement.has;
    const aiBrainSource = aiEntitlement.source;
    const growthEngineEligible = effectivePlan === "pro" && hasAIBrainAddon;

    return {
      plan: effectivePlan,
      planName: isInTrial ? "Pro + AI Trial" : planLimits.name,
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
      suggestedUpgrade,
      isInTrial,
      trialEndsAt: user.trialEndsAt,
      trialDaysRemaining,
      hasAIBrainAddon,
      effectiveHasAIBrain: hasAIBrainAddon,
      aiBrainSource,
      growthEngineEligible,
      aiBrainBasePlanEligible,
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
    const AI_BRAIN_ADDON_AMOUNT = 2900;

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

  private async resolveAIBrainEntitlement(user: User): Promise<{
    has: boolean;
    source: AIBrainSource;
  }> {
    if (user.email === "demo@whachat.com") {
      return { has: true, source: "demo" };
    }
    if (this.isManualAIBrainEmail(user.email ?? undefined)) {
      return { has: true, source: "manual" };
    }
    if (hasActivePaidPlan(user)) {
      if (!!user.shopifyAIBrainEnabled) {
        return { has: true, source: "shopify" };
      }
      const stripeOk = await this.stripeCustomerHasActiveAIBrainAddon(user.stripeCustomerId);
      if (stripeOk) {
        return { has: true, source: "stripe" };
      }
      return { has: false, source: "none" };
    }
    if (isProAiTrialActive(user)) {
      return { has: true, source: "trial" };
    }
    const stripeOk = await this.stripeCustomerHasActiveAIBrainAddon(user.stripeCustomerId);
    if (stripeOk) {
      return { has: true, source: "stripe" };
    }
    return { has: false, source: "none" };
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

    const user = await storage.getUserForSession(userId);
    if (!user) return { allowed: false, remaining: 0, limit: 0, used: 0, planName: "free" };
    
    await storage.updateUser(userId, { 
      monthlyConversations: (user.monthlyConversations || 0) + 1,
      lifetimeConversations: (user.lifetimeConversations || 0) + 1
    });
    return { 
      allowed: true, 
      remaining: limits.conversationsRemaining - 1,
      limit: limits.conversationsLimit,
      used: limits.conversationsUsed + 1,
      planName: limits.planName
    };
  }

  async createCheckoutSession(
    userId: string,
    plan: SubscriptionPlan,
    baseUrl: string,
    billingInterval: "monthly" | "yearly" = "monthly",
    redirect?: StripeCheckoutRedirectOpts,
  ): Promise<{ url: string }> {
    const user = await storage.getUserForSession(userId);
    if (!user) throw new Error("User not found");

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

    const priceId =
      plan === "starter"
        ? billingInterval === "yearly"
          ? process.env.STRIPE_STARTER_YEARLY_PRICE_ID
          : process.env.STRIPE_STARTER_MONTHLY_PRICE_ID
        : billingInterval === "yearly"
          ? process.env.STRIPE_PRO_YEARLY_PRICE_ID
          : process.env.STRIPE_PRO_MONTHLY_PRICE_ID;

    if (!priceId) {
      const envName =
        plan === "starter"
          ? billingInterval === "yearly"
            ? "STRIPE_STARTER_YEARLY_PRICE_ID"
            : "STRIPE_STARTER_MONTHLY_PRICE_ID"
          : billingInterval === "yearly"
            ? "STRIPE_PRO_YEARLY_PRICE_ID"
            : "STRIPE_PRO_MONTHLY_PRICE_ID";
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

  async createProPlusAICheckoutSession(
    userId: string,
    baseUrl: string,
    redirect?: StripeCheckoutRedirectOpts,
  ): Promise<{ url: string }> {
    const user = await storage.getUserForSession(userId);
    if (!user) throw new Error("User not found");

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

    const proPriceId = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    if (!proPriceId) {
      throw new Error("Missing STRIPE_PRO_MONTHLY_PRICE_ID");
    }

    const aiPriceId = process.env.STRIPE_AI_BRAIN_MONTHLY_PRICE_ID;
    if (!aiPriceId) {
      throw new Error("Missing STRIPE_AI_BRAIN_MONTHLY_PRICE_ID");
    }

    const successPath = sanitizeStripeReturnPath(
      redirect?.successReturnPath ?? "/app/templates/realtor-growth-engine",
    );
    const cancelPath = sanitizeStripeReturnPath(redirect?.cancelReturnPath ?? successPath);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        { price: proPriceId, quantity: 1 },
        { price: aiPriceId, quantity: 1 },
      ],
      mode: 'subscription',
      success_url: buildPostCheckoutSuccessUrl(resolvedBaseUrl, successPath),
      cancel_url: buildStripeCancelUrl(resolvedBaseUrl, cancelPath),
      metadata: {
        type: 'pro_plus_ai',
        userId,
      },
    });

    if (!session.url) throw new Error("Failed to create checkout session");
    return { url: session.url };
  }

  /**
   * Starter/Pro monthly plan + AI Brain add-on in one Stripe subscription checkout.
   * Only for accounts whose effective plan is currently Free (via getEffectivePlanForUser).
   */
  async createPlanAIBundleCheckoutSession(
    userId: string,
    bundlePlan: "starter" | "pro",
    baseUrl: string,
    redirect?: StripeCheckoutRedirectOpts,
  ): Promise<{ url: string }> {
    const user = await storage.getUserForSession(userId);
    if (!user) throw new Error("User not found");

    if (getEffectivePlanForUser(user) !== "free") {
      throw Object.assign(
        new Error(
          "Plan + AI bundle is only available when your effective plan is Free. Use AI Brain add-on checkout from this page if you already have Starter or Pro.",
        ),
        { code: "PLAN_AI_BUNDLE_NOT_FREE" },
      );
    }

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

    const planPriceId =
      bundlePlan === "starter"
        ? process.env.STRIPE_STARTER_MONTHLY_PRICE_ID
        : process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    const aiPriceId = process.env.STRIPE_AI_BRAIN_MONTHLY_PRICE_ID;

    if (!planPriceId) {
      throw new Error(
        bundlePlan === "starter"
          ? "Missing STRIPE_STARTER_MONTHLY_PRICE_ID"
          : "Missing STRIPE_PRO_MONTHLY_PRICE_ID",
      );
    }
    if (!aiPriceId) {
      throw new Error("Missing STRIPE_AI_BRAIN_MONTHLY_PRICE_ID");
    }

    const successPath = sanitizeStripeReturnPath(redirect?.successReturnPath ?? "/app/ai-brain");
    const cancelPath = sanitizeStripeReturnPath(redirect?.cancelReturnPath ?? successPath);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: planPriceId, quantity: 1 }, { price: aiPriceId, quantity: 1 }],
      mode: "subscription",
      success_url: buildPostCheckoutSuccessUrl(resolvedBaseUrl, successPath),
      cancel_url: buildStripeCancelUrl(resolvedBaseUrl, cancelPath),
      metadata: {
        userId,
        type: "plan_ai_bundle",
        plan: bundlePlan,
        includesAIBrain: "true",
      },
    });

    if (!session.url) throw new Error("Failed to create checkout session");
    return { url: session.url };
  }

  async createAddonCheckoutSession(
    userId: string,
    baseUrl: string,
    redirect?: StripeCheckoutRedirectOpts,
  ): Promise<{ url: string }> {
    const user = await storage.getUserForSession(userId);
    if (!user) throw new Error("User not found");

    const limits = await this.getUserLimits(userId);
    const plan = limits?.plan ?? "free";
    if (plan !== "starter" && plan !== "pro") {
      throw Object.assign(new Error(AI_BRAIN_REQUIRES_PAID_PLAN_MESSAGE), {
        code: "AI_BRAIN_PLAN_INELIGIBLE",
      });
    }

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

    // Check if user already has the add-on
    const hasAddon = await this.stripeCustomerHasActiveAIBrainAddon(customerId);
    if (hasAddon) {
      throw new Error("You already have the AI Brain add-on active.");
    }

    const priceId = process.env.STRIPE_AI_BRAIN_MONTHLY_PRICE_ID;

    if (!priceId) {
      throw new Error("Missing STRIPE_AI_BRAIN_MONTHLY_PRICE_ID");
    }

    console.log("Using AI Brain add-on price from env:", priceId);

    const successPath = sanitizeStripeReturnPath(redirect?.successReturnPath ?? "/app/ai-brain");
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
        type: 'ai_brain_addon',
      },
    });

    if (!session.url) throw new Error("Failed to create checkout session");
    return { url: session.url };
  }

  async createPortalSession(userId: string, returnUrl: string): Promise<{ url: string }> {
    const user = await storage.getUserForSession(userId);
    if (!user) throw new Error("User not found");

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

  async cancelSubscription(userId: string): Promise<{ success: boolean; message: string }> {
    await storage.updateUser(userId, {
      subscriptionPlan: "free",
      subscriptionStatus: "canceled",
    });
    return { success: true, message: "Subscription canceled. You are now on the free plan." };
  }

  async cancelSubscriptionImmediately(userId: string): Promise<{ success: boolean; message: string }> {
    return this.cancelSubscription(userId);
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
    const user = await storage.getUserForSession(userId);
    if (!user) return;

    await storage.updateUser(userId, {
      monthlyConversations: (user.monthlyConversations || 0) + 1,
      lifetimeConversations: (user.lifetimeConversations || 0) + 1
    });
  }
}

export const subscriptionService = new SubscriptionService();

export { getEffectivePlanForUser } from "./trialEntitlements";
