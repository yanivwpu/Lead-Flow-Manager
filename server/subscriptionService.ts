import { storage } from "./storage";
import { PLAN_LIMITS, type SubscriptionPlan } from "@shared/schema";

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

  async createCheckoutSession(userId: string, plan: SubscriptionPlan): Promise<{ url: string }> {
    throw new Error("Stripe integration removed. Please contact support to upgrade your plan.");
  }

  async createPortalSession(userId: string): Promise<{ url: string }> {
    throw new Error("Stripe integration removed. Please contact support to manage your subscription.");
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
}

export const subscriptionService = new SubscriptionService();
