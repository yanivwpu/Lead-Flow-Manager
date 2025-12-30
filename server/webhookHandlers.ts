import { getStripeSync } from './stripeClient';
import { storage } from './storage';
import type { SubscriptionPlan } from '@shared/schema';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    const event = await sync.processWebhook(payload, signature);

    // Handle subscription events for our app
    if (event) {
      await WebhookHandlers.handleStripeEvent(event);
    }
  }

  static async handleStripeEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await WebhookHandlers.handleSubscriptionUpdate(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await WebhookHandlers.handleSubscriptionCanceled(event.data.object);
        break;
      case 'invoice.payment_failed':
        await WebhookHandlers.handlePaymentFailed(event.data.object);
        break;
    }
  }

  static async handleSubscriptionUpdate(subscription: any): Promise<void> {
    const customerId = subscription.customer;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      console.log(`No user found for Stripe customer ${customerId}`);
      return;
    }

    // Map Stripe price to our plan
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const plan = await WebhookHandlers.getPlanFromPriceId(priceId);

    await storage.updateUser(user.id, {
      stripeSubscriptionId: subscription.id,
      subscriptionPlan: plan,
      subscriptionStatus: subscription.status === 'active' ? 'active' : 'past_due',
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });

    console.log(`Updated subscription for user ${user.id} to ${plan}`);
  }

  static async handleSubscriptionCanceled(subscription: any): Promise<void> {
    const customerId = subscription.customer;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) return;

    await storage.updateUser(user.id, {
      subscriptionPlan: 'free',
      subscriptionStatus: 'canceled',
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
    });

    console.log(`Subscription canceled for user ${user.id}`);
  }

  static async handlePaymentFailed(invoice: any): Promise<void> {
    const customerId = invoice.customer;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) return;

    await storage.updateUser(user.id, {
      subscriptionStatus: 'past_due',
    });

    console.log(`Payment failed for user ${user.id}`);
  }

  static async getPlanFromPriceId(priceId: string): Promise<SubscriptionPlan> {
    const { db } = await import('../drizzle/db');
    const { sql } = await import('drizzle-orm');
    
    try {
      const result = await db.execute(
        sql`SELECT metadata FROM stripe.prices WHERE id = ${priceId}`
      );
      
      const metadata = result.rows[0]?.metadata as Record<string, string> | undefined;
      if (metadata?.plan) {
        return metadata.plan as SubscriptionPlan;
      }
    } catch (error) {
      console.error('Error fetching price metadata:', error);
    }
    
    return 'free';
  }
}
