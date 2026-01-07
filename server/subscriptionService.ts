import { storage } from "./storage";
import { PLAN_LIMITS, type SubscriptionPlan } from "@shared/schema";
import { getUncachableStripeClient } from "./stripeClient";

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
  isAtLimit: boolean;
  isAtWarning: boolean;
  suggestedUpgrade: SubscriptionPlan | null;
  isInTrial: boolean;
  trialEndsAt: Date | null;
  trialDaysRemaining: number;
}

class SubscriptionService {
  async getUserLimits(userId: string): Promise<UserLimits | null> {
    const user = await storage.getUser(userId);
    if (!user) return null;

    const plan = (user.subscriptionPlan || "free") as SubscriptionPlan;
    const planLimits = PLAN_LIMITS[plan];

    const conversationsUsed = user.lifetimeConversations || 0;
    const conversationsLimit = planLimits.conversationsPerMonth;
    const conversationsRemaining = Math.max(0, conversationsLimit - conversationsUsed);
    const isAtLimit = conversationsRemaining <= 0;
    const isAtWarning = conversationsRemaining > 0 && conversationsRemaining <= 10;

    const now = new Date();
    const isInTrial = user.trialEndsAt ? new Date(user.trialEndsAt) > now : false;
    const trialDaysRemaining = user.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    let suggestedUpgrade: SubscriptionPlan | null = null;
    if (plan === "free") suggestedUpgrade = "starter";
    else if (plan === "starter") suggestedUpgrade = "pro";

    return {
      plan,
      planName: planLimits.name,
      conversationsLimit: planLimits.conversationsPerMonth,
      conversationsUsed,
      conversationsRemaining,
      isLifetimeLimit: true,
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
      isAtLimit,
      isAtWarning,
      suggestedUpgrade,
      isInTrial,
      trialEndsAt: user.trialEndsAt,
      trialDaysRemaining,
    };
  }

  async checkAndDecrementConversation(userId: string): Promise<{ allowed: boolean; remaining: number }> {
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, remaining: 0 };

    if (limits.isAtLimit) {
      return { allowed: false, remaining: 0 };
    }

    await storage.updateUser(userId, { 
      lifetimeConversations: (await storage.getUser(userId))?.lifetimeConversations || 0 + 1 
    });
    return { allowed: true, remaining: limits.conversationsRemaining - 1 };
  }

  async createCheckoutSession(userId: string, plan: SubscriptionPlan, baseUrl: string): Promise<{ url: string }> {
    const user = await storage.getUser(userId);
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

    const priceIds: Record<SubscriptionPlan, string | null> = {
      free: null,
      starter: process.env.STRIPE_STARTER_PRICE_ID || null,
      pro: process.env.STRIPE_PRO_PRICE_ID || null,
    };

    const priceId = priceIds[plan];
    if (!priceId) {
      throw new Error(`No price configured for plan: ${plan}`);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/settings?checkout=success`,
      cancel_url: `${baseUrl}/settings?checkout=cancel`,
    });

    if (!session.url) throw new Error("Failed to create checkout session");
    return { url: session.url };
  }

  async createPortalSession(userId: string, returnUrl: string): Promise<{ url: string }> {
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) {
      throw new Error("No Stripe customer found for this user");
    }

    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
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
}

export const subscriptionService = new SubscriptionService();
