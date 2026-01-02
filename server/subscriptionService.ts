import { storage } from './storage';
import { PLAN_LIMITS, type SubscriptionPlan, type User } from '@shared/schema';
import { getUncachableStripeClient } from './stripeClient';

export interface SubscriptionLimits {
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
  twilioUsageIncluded: number;
  twilioUsageUsed: number;
  twilioUsageRemaining: number;
  emailNotifications: boolean;
  pushNotifications: boolean;
  teamInbox: boolean;
  isAtLimit: boolean;
  isAtWarning: boolean; // 80% usage
  suggestedUpgrade: SubscriptionPlan | null;
}

export interface UpgradeTrigger {
  triggered: boolean;
  reason: string;
  currentPlan: SubscriptionPlan;
  suggestedPlan: SubscriptionPlan;
  usageType: 'conversations' | 'users' | 'whatsapp_numbers' | 'twilio_usage' | 'follow_ups';
  currentUsage: number;
  limit: number;
}

export class SubscriptionService {
  async getUserLimits(userId: string): Promise<SubscriptionLimits | null> {
    const user = await storage.getUser(userId);
    if (!user) return null;

    const plan = (user.subscriptionPlan as SubscriptionPlan) || 'free';
    const limits = PLAN_LIMITS[plan];

    // Get conversation count for current period
    const startDate = user.currentPeriodStart || new Date(new Date().setDate(1));
    const conversationsUsed = user.monthlyConversations || 0;
    
    // Get Twilio usage for current period
    const twilioUsageUsed = parseFloat(user.monthlyTwilioUsage?.toString() || '0');

    const conversationsRemaining = Math.max(0, limits.conversationsPerMonth - conversationsUsed);
    const twilioUsageRemaining = Math.max(0, limits.twilioUsageIncluded - twilioUsageUsed);
    
    const usagePercent = conversationsUsed / limits.conversationsPerMonth;
    const isAtWarning = usagePercent >= 0.8 && usagePercent < 1;
    const isAtLimit = conversationsRemaining <= 0;

    // Determine suggested upgrade
    let suggestedUpgrade: SubscriptionPlan | null = null;
    if (plan === 'free') suggestedUpgrade = 'starter';
    else if (plan === 'starter') suggestedUpgrade = 'pro';

    return {
      plan,
      planName: limits.name,
      conversationsLimit: limits.conversationsPerMonth,
      conversationsUsed,
      conversationsRemaining,
      isLifetimeLimit: limits.isLifetimeLimit,
      maxUsers: limits.maxUsers,
      maxWhatsappNumbers: limits.maxWhatsappNumbers,
      canSendMessages: limits.canSendMessages,
      followUpsEnabled: limits.followUpsEnabled,
      twilioUsageIncluded: limits.twilioUsageIncluded,
      twilioUsageUsed,
      twilioUsageRemaining,
      emailNotifications: limits.emailNotifications,
      pushNotifications: limits.pushNotifications,
      teamInbox: limits.teamInbox,
      isAtLimit,
      isAtWarning,
      suggestedUpgrade,
    };
  }

  // Check all upgrade triggers and return the most urgent one
  async checkUpgradeTriggers(userId: string): Promise<UpgradeTrigger | null> {
    const limits = await this.getUserLimits(userId);
    if (!limits || limits.plan === 'pro') return null; // Pro is highest plan

    const triggers: UpgradeTrigger[] = [];

    // Check conversation limit (most important)
    if (limits.isAtLimit) {
      triggers.push({
        triggered: true,
        reason: `You've reached your ${limits.conversationsLimit} conversation limit this month.`,
        currentPlan: limits.plan,
        suggestedPlan: limits.suggestedUpgrade || 'starter',
        usageType: 'conversations',
        currentUsage: limits.conversationsUsed,
        limit: limits.conversationsLimit,
      });
    } else if (limits.isAtWarning) {
      triggers.push({
        triggered: true,
        reason: `You've used ${limits.conversationsUsed} of ${limits.conversationsLimit} conversations (${Math.round((limits.conversationsUsed / limits.conversationsLimit) * 100)}%).`,
        currentPlan: limits.plan,
        suggestedPlan: limits.suggestedUpgrade || 'starter',
        usageType: 'conversations',
        currentUsage: limits.conversationsUsed,
        limit: limits.conversationsLimit,
      });
    }

    // Check Twilio usage (for paid plans)
    if (limits.twilioUsageIncluded > 0 && limits.twilioUsageRemaining <= 0) {
      triggers.push({
        triggered: true,
        reason: `You've exceeded your $${limits.twilioUsageIncluded} Twilio usage allowance.`,
        currentPlan: limits.plan,
        suggestedPlan: limits.suggestedUpgrade || 'pro',
        usageType: 'twilio_usage',
        currentUsage: limits.twilioUsageUsed,
        limit: limits.twilioUsageIncluded,
      });
    }

    // Check follow-ups (Free plan doesn't have follow-ups)
    if (!limits.followUpsEnabled && limits.plan === 'free') {
      // This is checked when user tries to create a follow-up
      triggers.push({
        triggered: true,
        reason: 'Follow-up reminders are not available on the Free plan.',
        currentPlan: limits.plan,
        suggestedPlan: 'starter',
        usageType: 'follow_ups',
        currentUsage: 0,
        limit: 0,
      });
    }

    // Check user limit
    const teamMembers = await storage.getTeamMemberCount(userId);
    if (teamMembers >= limits.maxUsers && limits.maxUsers > 0) {
      triggers.push({
        triggered: true,
        reason: `Your plan supports ${limits.maxUsers} user(s). Upgrade for more team members.`,
        currentPlan: limits.plan,
        suggestedPlan: limits.suggestedUpgrade || 'pro',
        usageType: 'users',
        currentUsage: teamMembers,
        limit: limits.maxUsers,
      });
    }

    // Check WhatsApp numbers
    const phoneCount = (await storage.getRegisteredPhones(userId)).length;
    if (phoneCount >= limits.maxWhatsappNumbers) {
      triggers.push({
        triggered: true,
        reason: `Your plan supports ${limits.maxWhatsappNumbers} WhatsApp number(s). Upgrade for more.`,
        currentPlan: limits.plan,
        suggestedPlan: limits.suggestedUpgrade || 'pro',
        usageType: 'whatsapp_numbers',
        currentUsage: phoneCount,
        limit: limits.maxWhatsappNumbers,
      });
    }

    // Return the most urgent trigger (conversations > twilio > users > numbers > follow-ups)
    return triggers.length > 0 ? triggers[0] : null;
  }

  async canCreateConversation(userId: string): Promise<{ allowed: boolean; reason?: string; trigger?: UpgradeTrigger }> {
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, reason: 'User not found' };

    if (limits.isAtLimit) {
      const trigger = await this.checkUpgradeTriggers(userId);
      return { 
        allowed: false, 
        reason: `You've used all ${limits.conversationsLimit} conversations this month. Upgrade for more.`,
        trigger: trigger || undefined,
      };
    }

    return { allowed: true };
  }

  async canCreateFollowUp(userId: string): Promise<{ allowed: boolean; reason?: string; trigger?: UpgradeTrigger }> {
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, reason: 'User not found' };

    if (!limits.followUpsEnabled) {
      return { 
        allowed: false, 
        reason: 'Follow-up reminders require Starter plan or higher.',
        trigger: {
          triggered: true,
          reason: 'Follow-up reminders are not available on the Free plan.',
          currentPlan: limits.plan,
          suggestedPlan: 'starter',
          usageType: 'follow_ups',
          currentUsage: 0,
          limit: 0,
        },
      };
    }

    return { allowed: true };
  }

  async canSendMessage(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, reason: 'User not found' };

    if (!limits.canSendMessages) {
      return { 
        allowed: false, 
        reason: 'Sending messages is not available on the Free plan. Upgrade to Starter or higher.'
      };
    }

    return { allowed: true };
  }

  async canAddWhatsAppNumber(userId: string): Promise<{ allowed: boolean; reason?: string; trigger?: UpgradeTrigger }> {
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, reason: 'User not found' };

    const currentNumbers = await storage.getRegisteredPhones(userId);
    
    if (currentNumbers.length >= limits.maxWhatsappNumbers) {
      return { 
        allowed: false, 
        reason: `Your ${limits.planName} plan allows ${limits.maxWhatsappNumbers} WhatsApp number(s). Upgrade for more.`,
        trigger: {
          triggered: true,
          reason: `Your plan supports ${limits.maxWhatsappNumbers} WhatsApp number(s).`,
          currentPlan: limits.plan,
          suggestedPlan: limits.suggestedUpgrade || 'pro',
          usageType: 'whatsapp_numbers',
          currentUsage: currentNumbers.length,
          limit: limits.maxWhatsappNumbers,
        },
      };
    }

    return { allowed: true };
  }

  async trackConversationWindow(userId: string, chatId: string, whatsappPhone: string): Promise<{ isNewWindow: boolean; windowId: string }> {
    // Check if there's an active 24-hour window for this contact
    const activeWindow = await storage.getActiveConversationWindow(userId, whatsappPhone);
    
    if (activeWindow) {
      // Window still active - just increment message count
      await storage.updateConversationWindowMessageCount(activeWindow.id);
      return { isNewWindow: false, windowId: activeWindow.id };
    }
    
    // No active window - create a new 24-hour window (this counts as a new conversation)
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    const newWindow = await storage.createConversationWindow({
      userId,
      chatId,
      whatsappPhone,
      windowStart: now,
      windowEnd,
    });

    // Increment monthly conversation count
    await storage.incrementMonthlyConversations(userId);
    
    return { isNewWindow: true, windowId: newWindow.id };
  }

  async trackTwilioUsage(userId: string, cost: number): Promise<void> {
    await storage.incrementTwilioUsage(userId, cost);
  }

  async canStartConversation(userId: string, whatsappPhone: string): Promise<{ allowed: boolean; reason?: string; isExistingWindow: boolean; trigger?: UpgradeTrigger }> {
    // Check if there's already an active window (no new conversation needed)
    const activeWindow = await storage.getActiveConversationWindow(userId, whatsappPhone);
    if (activeWindow) {
      return { allowed: true, isExistingWindow: true };
    }
    
    // Need a new conversation window - check limits
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, reason: 'User not found', isExistingWindow: false };

    if (limits.isAtLimit) {
      const trigger = await this.checkUpgradeTriggers(userId);
      return { 
        allowed: false, 
        reason: `You've used all ${limits.conversationsLimit} conversations this month. Upgrade for more.`,
        isExistingWindow: false,
        trigger: trigger || undefined,
      };
    }

    return { allowed: true, isExistingWindow: false };
  }

  async createCheckoutSession(userId: string, planId: SubscriptionPlan): Promise<string> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error('User not found');

    const stripe = await getUncachableStripeClient();
    
    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
      });
      await storage.updateUser(user.id, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }

    // Get price ID from our synced Stripe data
    const priceId = await this.getPriceIdForPlan(planId);
    if (!priceId) throw new Error(`No price found for plan: ${planId}`);

    const appUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${appUrl}/app/settings?subscription=success`,
      cancel_url: `${appUrl}/app/settings?subscription=canceled`,
    });

    return session.url || '';
  }

  async createCustomerPortalSession(userId: string): Promise<string> {
    const user = await storage.getUser(userId);
    if (!user || !user.stripeCustomerId) throw new Error('No subscription found');

    const stripe = await getUncachableStripeClient();
    const appUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/app/settings`,
    });

    return session.url;
  }

  async getPriceIdForPlan(planId: SubscriptionPlan): Promise<string | null> {
    const { db } = await import('../drizzle/db');
    const { sql } = await import('drizzle-orm');
    
    try {
      const result = await db.execute(
        sql`SELECT id FROM stripe.prices WHERE metadata->>'plan' = ${planId} AND active = true LIMIT 1`
      );
      
      const row = result.rows[0] as { id: string } | undefined;
      return row?.id || null;
    } catch (error) {
      console.error('Error fetching price for plan:', error);
      return null;
    }
  }

  async getProducts(): Promise<any[]> {
    const { db } = await import('../drizzle/db');
    const { sql } = await import('drizzle-orm');
    
    try {
      const result = await db.execute(sql`
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.metadata as price_metadata
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount ASC
      `);
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching products:', error);
      return [];
    }
  }

  // Reset monthly usage counters (called by webhook on subscription renewal)
  async resetMonthlyUsage(userId: string): Promise<void> {
    await storage.updateUser(userId, {
      monthlyConversations: 0,
      monthlyTwilioUsage: '0',
    });
  }
}

export const subscriptionService = new SubscriptionService();
