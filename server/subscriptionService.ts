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
  chatbotEnabled: boolean;
  isAtLimit: boolean;
  isAtWarning: boolean;
  suggestedUpgrade: SubscriptionPlan | null;
  isInTrial: boolean;
  trialEndsAt: Date | null;
  trialDaysRemaining: number;
  hasAIBrainAddon: boolean;
}

class SubscriptionService {
  async getUserLimits(userId: string): Promise<UserLimits | null> {
    const user = await storage.getUser(userId);
    if (!user) return null;

    const now = new Date();
    const isInTrial = user.trialEndsAt ? new Date(user.trialEndsAt) > now : false;
    const trialDaysRemaining = user.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    // During trial, users get Pro features regardless of their stored plan
    const storedPlan = (user.subscriptionPlan || "free") as SubscriptionPlan;
    const effectivePlan = isInTrial ? "pro" : storedPlan;
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
    if (storedPlan === "free" && !isInTrial) suggestedUpgrade = "starter";
    else if (storedPlan === "starter") suggestedUpgrade = "pro";

    // Check if user has the AI Brain add-on subscription from Stripe
    // Trial users get full AI Brain access as part of the Pro trial experience
    // Demo user (demo@whachat.com) gets full AI Brain for demonstration purposes
    const isDemoUser = user.email === 'demo@whachat.com';
    const hasAIBrainAddon = isInTrial || isDemoUser ? true : await this.checkAIBrainAddonStatus(user.stripeCustomerId);

    return {
      plan: effectivePlan,
      planName: isInTrial ? "Pro Trial" : planLimits.name,
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
    };
  }

  private async checkAIBrainAddonStatus(stripeCustomerId: string | null | undefined): Promise<boolean> {
    if (!stripeCustomerId) return false;
    
    try {
      const stripe = await getUncachableStripeClient();
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'active',
        limit: 10,
        expand: ['data.items.data.price.product'],
      });
      
      // Check if any active subscription has the AI Brain add-on
      // We identify it by: price amount ($29/mo = 2900 cents) AND product name containing "AI Brain"
      const AI_BRAIN_ADDON_AMOUNT = 2900;
      for (const sub of subscriptions.data) {
        for (const item of sub.items.data) {
          if (item.price.unit_amount === AI_BRAIN_ADDON_AMOUNT) {
            // Also check product name/metadata to avoid false positives
            const product = item.price.product;
            if (typeof product === 'object' && product !== null) {
              const productName = (product as any).name?.toLowerCase() || '';
              const productMetadata = (product as any).metadata || {};
              // Match if product name contains "ai brain" or has addon type metadata
              if (productName.includes('ai brain') || 
                  productName.includes('ai-brain') ||
                  productMetadata.type === 'ai_brain_addon') {
                return true;
              }
            }
            // Fallback: if we can't verify product name but amount matches exactly,
            // still return true (for backwards compatibility with existing subscriptions)
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      console.error("Error checking AI Brain addon status:", error);
      return false;
    }
  }

  async checkAndDecrementConversation(userId: string): Promise<{ allowed: boolean; remaining: number }> {
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, remaining: 0 };

    if (limits.isAtLimit) {
      return { allowed: false, remaining: 0 };
    }

    const user = await storage.getUser(userId);
    if (!user) return { allowed: false, remaining: 0 };
    
    // Increment BOTH counters:
    // - monthlyConversations for monthly limit enforcement
    // - lifetimeConversations for historical analytics only (not enforced)
    await storage.updateUser(userId, { 
      monthlyConversations: (user.monthlyConversations || 0) + 1,
      lifetimeConversations: (user.lifetimeConversations || 0) + 1
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

    // Get price directly from Stripe API (bypassing sync issues)
    const planAmounts: Record<SubscriptionPlan, number> = {
      free: 0,
      starter: 1900, // $19
      pro: 4900, // $49
    };

    const amount = planAmounts[plan];
    if (amount === 0) {
      throw new Error("Cannot checkout for free plan");
    }

    // Query prices directly from Stripe API
    console.log(`Looking for price with amount: ${amount} cents for plan: ${plan}`);
    const stripePrices = await stripe.prices.list({ active: true, limit: 20 });
    const priceResult = stripePrices.data.find(p => p.unit_amount === amount);
    
    if (!priceResult) {
      console.error(`No price found for amount ${amount}. Available Stripe prices:`, stripePrices.data.map(p => ({ id: p.id, amount: p.unit_amount })));
      throw new Error(`No price found for plan: ${plan} ($${amount/100}). Please create a $${amount/100}/month price in your Stripe dashboard.`);
    }
    console.log(`Found price: ${priceResult.id} for amount ${priceResult.unit_amount}`);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceResult.id, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/app/settings?checkout=success`,
      cancel_url: `${baseUrl}/app/settings?checkout=cancel`,
    });

    if (!session.url) throw new Error("Failed to create checkout session");
    return { url: session.url };
  }

  async createProPlusAICheckoutSession(userId: string, baseUrl: string): Promise<{ url: string }> {
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

    const PRO_AMOUNT = 4900;
    const AI_BRAIN_AMOUNT = 2900;

    console.log(`Creating combined Pro + AI Brain checkout for user ${userId}`);
    const stripePrices = await stripe.prices.list({ active: true, limit: 20 });
    const proPrice = stripePrices.data.find(p => p.unit_amount === PRO_AMOUNT);
    const aiPrice = stripePrices.data.find(p => p.unit_amount === AI_BRAIN_AMOUNT);

    if (!proPrice) {
      throw new Error("Pro plan price not found in Stripe. Please create a $49/month price.");
    }
    if (!aiPrice) {
      throw new Error("AI Brain add-on price not found in Stripe. Please create a $29/month price.");
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        { price: proPrice.id, quantity: 1 },
        { price: aiPrice.id, quantity: 1 },
      ],
      mode: 'subscription',
      success_url: `${baseUrl}/app/templates/realtor-growth-engine?checkout=success`,
      cancel_url: `${baseUrl}/app/templates/realtor-growth-engine?checkout=cancel`,
      metadata: {
        type: 'pro_plus_ai',
        userId,
      },
    });

    if (!session.url) throw new Error("Failed to create checkout session");
    return { url: session.url };
  }

  async createAddonCheckoutSession(userId: string, baseUrl: string): Promise<{ url: string }> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    // Check if user has at least Starter plan (AI Assist) to be eligible for add-on
    const storedPlan = (user.subscriptionPlan || "free") as SubscriptionPlan;
    if (storedPlan === "free") {
      throw new Error("You need a Starter or Pro plan to purchase the AI Brain add-on. Please upgrade your plan first.");
    }

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

    // Check if user already has the add-on
    const hasAddon = await this.checkAIBrainAddonStatus(customerId);
    if (hasAddon) {
      throw new Error("You already have the AI Brain add-on active.");
    }

    // AI Brain Add-on price: $29/mo = 2900 cents
    const AI_BRAIN_ADDON_AMOUNT = 2900;
    
    console.log(`Looking for AI Brain add-on price with amount: ${AI_BRAIN_ADDON_AMOUNT} cents`);
    const stripePrices = await stripe.prices.list({ active: true, limit: 20 });
    const priceResult = stripePrices.data.find(p => p.unit_amount === AI_BRAIN_ADDON_AMOUNT);
    
    if (!priceResult) {
      console.error(`No price found for AI Brain add-on. Available Stripe prices:`, stripePrices.data.map(p => ({ id: p.id, amount: p.unit_amount })));
      throw new Error("AI Brain add-on price not found. Please create a $29/month product in your Stripe dashboard.");
    }
    console.log(`Found AI Brain add-on price: ${priceResult.id}`);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceResult.id, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/app/ai-brain?checkout=success`,
      cancel_url: `${baseUrl}/app/ai-brain?checkout=cancel`,
      metadata: {
        type: 'ai_brain_addon',
        userId,
      },
    });

    if (!session.url) throw new Error("Failed to create checkout session");
    return { url: session.url };
  }

  async createPortalSession(userId: string, returnUrl: string): Promise<{ url: string }> {
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
}

export const subscriptionService = new SubscriptionService();
