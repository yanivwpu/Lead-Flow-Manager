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
  emailNotifications: boolean;
  pushNotifications: boolean;
  teamInbox: boolean;
  usageReports: boolean;
  isAtLimit: boolean;
}

export class SubscriptionService {
  async getUserLimits(userId: string): Promise<SubscriptionLimits | null> {
    const user = await storage.getUser(userId);
    if (!user) return null;

    const plan = (user.subscriptionPlan as SubscriptionPlan) || 'free';
    const limits = PLAN_LIMITS[plan];

    // Get conversation window count (24-hour windows, not chats)
    let conversationsUsed: number;
    if (limits.isLifetimeLimit) {
      // For free tier, count lifetime conversation windows
      conversationsUsed = await storage.getLifetimeConversationWindowCount(userId);
    } else {
      // For paid tiers, count conversation windows this billing period
      const startDate = user.currentPeriodStart || new Date(new Date().setDate(1));
      conversationsUsed = await storage.getConversationWindowCount(userId, startDate);
    }

    const conversationsRemaining = Math.max(0, limits.conversationsPerMonth - conversationsUsed);

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
      emailNotifications: limits.emailNotifications,
      pushNotifications: limits.pushNotifications,
      teamInbox: limits.teamInbox,
      usageReports: limits.usageReports,
      isAtLimit: conversationsRemaining <= 0,
    };
  }

  async canCreateConversation(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, reason: 'User not found' };

    if (limits.isAtLimit) {
      if (limits.isLifetimeLimit) {
        return { 
          allowed: false, 
          reason: `You've reached the ${limits.conversationsLimit} conversation limit on the Free plan. Upgrade to continue.`
        };
      } else {
        return { 
          allowed: false, 
          reason: `You've used all ${limits.conversationsLimit} conversations this month. Upgrade for more.`
        };
      }
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

  async canAddWhatsAppNumber(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, reason: 'User not found' };

    const currentNumbers = await storage.getRegisteredPhones(userId);
    
    if (currentNumbers.length >= limits.maxWhatsappNumbers) {
      return { 
        allowed: false, 
        reason: `Your ${limits.planName} plan allows ${limits.maxWhatsappNumbers} WhatsApp number(s). Upgrade for more.`
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
    
    return { isNewWindow: true, windowId: newWindow.id };
  }

  async canStartConversation(userId: string, whatsappPhone: string): Promise<{ allowed: boolean; reason?: string; isExistingWindow: boolean }> {
    // Check if there's already an active window (no new conversation needed)
    const activeWindow = await storage.getActiveConversationWindow(userId, whatsappPhone);
    if (activeWindow) {
      return { allowed: true, isExistingWindow: true };
    }
    
    // Need a new conversation window - check limits
    const limits = await this.getUserLimits(userId);
    if (!limits) return { allowed: false, reason: 'User not found', isExistingWindow: false };

    if (limits.isAtLimit) {
      if (limits.isLifetimeLimit) {
        return { 
          allowed: false, 
          reason: `You've reached the ${limits.conversationsLimit} conversation limit on the Free plan. Upgrade to continue.`,
          isExistingWindow: false
        };
      } else {
        return { 
          allowed: false, 
          reason: `You've used all ${limits.conversationsLimit} conversations this month. Upgrade for more.`,
          isExistingWindow: false
        };
      }
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

    const appUrl = process.env.APP_URL || 'https://whachatcrm.com';
    
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
    const appUrl = process.env.APP_URL || 'https://whachatcrm.com';

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
}

export const subscriptionService = new SubscriptionService();
