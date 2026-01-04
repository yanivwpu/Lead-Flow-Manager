import { getStripeSync, getUncachableStripeClient } from './stripeClient';
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

    // Let the sync package handle its internal processing
    const sync = await getStripeSync();
    try {
      await sync.processWebhook(payload, signature);
    } catch (error) {
      console.log('[Webhook] sync.processWebhook error (non-fatal):', error);
    }

    // Parse the event directly from the payload for our handling
    const payloadString = payload.toString('utf8');
    const event = JSON.parse(payloadString);
    
    if (event && event.type) {
      console.log(`[Webhook] Processing event type: ${event.type}, id: ${event.id}`);
      await WebhookHandlers.handleStripeEvent(event);
    } else {
      console.log('[Webhook] Could not parse event from payload');
    }
  }

  static async handleStripeEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await WebhookHandlers.handleCheckoutCompleted(event.data.object);
        break;
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

  static async handleCheckoutCompleted(session: any): Promise<void> {
    console.log(`[Webhook] handleCheckoutCompleted called`);
    console.log(`[Webhook] Session customer: ${session.customer}, subscription: ${session.subscription}`);
    console.log(`[Webhook] Session metadata:`, session.metadata);
    
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    
    // Get user by customer ID
    let user = await storage.getUserByStripeCustomerId(customerId);
    
    // If not found by customer ID, try by userId in metadata
    if (!user && session.metadata?.userId) {
      const userId = session.metadata.userId;
      user = await storage.getUser(userId);
      
      // Update the user with their Stripe customer ID
      if (user) {
        await storage.updateUser(user.id, { stripeCustomerId: customerId });
        console.log(`[Webhook] Linked Stripe customer ${customerId} to user ${user.id}`);
      }
    }
    
    if (!user) {
      console.log(`[Webhook] No user found for checkout session`);
      return;
    }
    
    console.log(`[Webhook] Found user: ${user.id} (${user.email})`);
    
    // Fetch the subscription from Stripe to get the plan details
    if (subscriptionId) {
      const stripe = await getUncachableStripeClient();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await WebhookHandlers.handleSubscriptionUpdate(subscription);
    }
  }

  static async handleSubscriptionUpdate(subscription: any): Promise<void> {
    console.log(`[Webhook] handleSubscriptionUpdate called for customer: ${subscription.customer}`);
    const customerId = subscription.customer;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      console.log(`[Webhook] No user found for Stripe customer ${customerId}`);
      return;
    }
    console.log(`[Webhook] Found user: ${user.id} (${user.email})`);

    // Map Stripe price to our plan
    const priceId = subscription.items?.data?.[0]?.price?.id;
    console.log(`[Webhook] Price ID from subscription: ${priceId}`);
    const plan = await WebhookHandlers.getPlanFromPriceId(priceId);
    console.log(`[Webhook] Mapped to plan: ${plan}`);

    await storage.updateUser(user.id, {
      stripeSubscriptionId: subscription.id,
      subscriptionPlan: plan,
      subscriptionStatus: subscription.status === 'active' ? 'active' : 'past_due',
      currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
    });

    console.log(`[Webhook] Updated subscription for user ${user.id} to ${plan}`);
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
    // Query Stripe directly for price metadata
    try {
      const stripe = await getUncachableStripeClient();
      const price = await stripe.prices.retrieve(priceId);
      
      if (price.metadata?.plan) {
        console.log(`[Webhook] Found plan in price metadata: ${price.metadata.plan}`);
        return price.metadata.plan as SubscriptionPlan;
      }
      
      // Fallback: check the product metadata
      if (price.product && typeof price.product === 'string') {
        const product = await stripe.products.retrieve(price.product);
        if (product.metadata?.plan) {
          console.log(`[Webhook] Found plan in product metadata: ${product.metadata.plan}`);
          return product.metadata.plan as SubscriptionPlan;
        }
      }
    } catch (error) {
      console.error('[Webhook] Error fetching price from Stripe:', error);
    }
    
    // Fallback to database
    try {
      const { db } = await import('../drizzle/db');
      const { sql } = await import('drizzle-orm');
      
      const result = await db.execute(
        sql`SELECT metadata FROM stripe.prices WHERE id = ${priceId}`
      );
      
      const metadata = result.rows[0]?.metadata as Record<string, string> | undefined;
      if (metadata?.plan) {
        return metadata.plan as SubscriptionPlan;
      }
    } catch (error) {
      console.error('[Webhook] Error fetching price metadata from DB:', error);
    }
    
    console.log(`[Webhook] Could not determine plan for price ${priceId}, defaulting to free`);
    return 'free';
  }
}
