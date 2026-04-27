import { getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

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

    const stripe = await getUncachableStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('Missing STRIPE_WEBHOOK_SECRET');
    }

    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    await this.handlePaymentEvent(event);
  }

  static async handlePaymentEvent(event: any): Promise<void> {
    const eventType = event?.type as string | undefined;
    const obj = event?.data?.object;

    const safeLog = (message: string, data: Record<string, any>) => {
      try {
        console.log(message, data);
      } catch {
        // ignore log failures
      }
    };

    safeLog("[Stripe Webhook] Event received", {
      type: eventType,
      objectType: obj?.object,
      id: obj?.id,
    });

    // Helper: update local subscription fields based on subscription items.
    const updateUserFromSubscription = async (subscription: any) => {
      const customerId: string | undefined = subscription?.customer || undefined;
      if (!customerId) return;

      const user = await storage.getUserByStripeCustomerId(customerId);
      safeLog("[Stripe Webhook] Resolve user by customer", {
        customerId,
        userId: user?.id,
      });
      if (!user) return;

      const items = subscription?.items?.data || [];
      const priceIds: string[] = items.map((it: any) => it?.price?.id).filter(Boolean);

      const starterMonthly = process.env.STRIPE_STARTER_MONTHLY_PRICE_ID;
      const starterYearly = process.env.STRIPE_STARTER_YEARLY_PRICE_ID;
      const proMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
      const proYearly = process.env.STRIPE_PRO_YEARLY_PRICE_ID;
      const aiBrainMonthly = process.env.STRIPE_AI_BRAIN_MONTHLY_PRICE_ID;

      // Determine base plan from known price IDs (prefer Pro if both exist).
      let subscriptionPlan: 'free' | 'starter' | 'pro' | undefined;
      if (proMonthly && priceIds.includes(proMonthly)) subscriptionPlan = 'pro';
      else if (proYearly && priceIds.includes(proYearly)) subscriptionPlan = 'pro';
      else if (starterMonthly && priceIds.includes(starterMonthly)) subscriptionPlan = 'starter';
      else if (starterYearly && priceIds.includes(starterYearly)) subscriptionPlan = 'starter';

      const hasAIBrainAddon = !!(aiBrainMonthly && priceIds.includes(aiBrainMonthly));

      const currentPeriodEndSec: number | undefined = subscription?.current_period_end;
      const currentPeriodStartSec: number | undefined = subscription?.current_period_start;

      const updates: Record<string, any> = {
        stripeSubscriptionId: subscription?.id || user.stripeSubscriptionId,
        subscriptionStatus: subscription?.status || user.subscriptionStatus,
        ...(subscriptionPlan ? { subscriptionPlan } : {}),
        ...(currentPeriodStartSec ? { currentPeriodStart: new Date(currentPeriodStartSec * 1000) } : {}),
        ...(currentPeriodEndSec ? { currentPeriodEnd: new Date(currentPeriodEndSec * 1000) } : {}),
        // Reuse this flag as a generic "AI Brain entitlement" boolean; name is historical.
        shopifyAIBrainEnabled: hasAIBrainAddon || user.shopifyAIBrainEnabled,
      };

      const updated = await storage.updateUser(user.id, updates);
      safeLog("[Stripe Webhook] Updated user subscription fields", {
        userId: user.id,
        customerId,
        subscriptionId: subscription?.id,
        priceIds,
        subscriptionPlan,
        hasAIBrainAddon,
        updated: !!updated,
      });
    };

    // checkout.session.completed can be used to stamp stripeCustomerId based on metadata.userId
    if (eventType === 'checkout.session.completed') {
      const session = obj;
      const customerId: string | undefined = session?.customer || undefined;
      const subscriptionId: string | undefined = session?.subscription || undefined;
      const metadata = session?.metadata || {};
      const userId = metadata?.userId as string | undefined;

      safeLog("[Stripe Webhook] checkout.session.completed", {
        customerId,
        subscriptionId,
        metadataKeys: metadata ? Object.keys(metadata) : [],
        resolvedUserId: userId,
      });

      if (userId && customerId) {
        const updated = await storage.updateUser(userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId || undefined,
        });
        safeLog("[Stripe Webhook] Stamped user stripe IDs from checkout session", {
          userId,
          customerId,
          subscriptionId,
          updated: !!updated,
        });
      }
    }

    // Handle subscription renewal - reset monthly conversation counter
    if (eventType === 'customer.subscription.updated' || eventType === 'customer.subscription.created') {
      const subscription = obj;
      const customerId = subscription.customer;
      
      if (customerId) {
        const user = await storage.getUserByStripeCustomerId(customerId);
        if (user) {
          // Reset monthly conversations counter on subscription renewal
          // Keep lifetimeConversations for analytics, only reset the monthly counter
          await storage.updateUser(user.id, { monthlyConversations: 0 });
          console.log(`Reset monthlyConversations for user ${user.id} on subscription renewal`);
        }
      }

      // Also update local subscription plan/status/period based on Stripe subscription items.
      try {
        await updateUserFromSubscription(subscription);
      } catch (err) {
        safeLog("[Stripe Webhook] Failed updating user from subscription", {
          error: (err as any)?.message || String(err),
        });
      }
    }

    // Also handle invoice.paid / invoice.payment_succeeded to sync subscription state from latest subscription ID (if present).
    if (eventType === 'invoice.paid' || eventType === 'invoice.payment_succeeded') {
      const invoice = obj;
      const customerId: string | undefined = invoice?.customer || undefined;
      const subscriptionId: string | undefined = invoice?.subscription || undefined;
      const lines = invoice?.lines?.data || [];
      const priceIds: string[] = lines.map((l: any) => l?.price?.id).filter(Boolean);

      safeLog("[Stripe Webhook] invoice event", {
        type: eventType,
        customerId,
        subscriptionId,
        priceIds,
      });

      // Best-effort: fetch subscription to derive plan items accurately.
      if (subscriptionId) {
        try {
          const stripe = await getUncachableStripeClient();
          const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['items.data.price'],
          } as any);
          await updateUserFromSubscription(subscription);
        } catch (err) {
          safeLog("[Stripe Webhook] Failed to retrieve subscription from invoice", {
            subscriptionId,
            error: (err as any)?.message || String(err),
          });
        }
      }
    }

    if (eventType !== 'invoice.payment_succeeded') {
      return;
    }

    const invoice = obj;
    const customerId = invoice.customer;
    const amountPaid = invoice.amount_paid / 100; // Convert from cents to dollars
    const stripePaymentId = invoice.id;

    if (!customerId || amountPaid <= 0) {
      return;
    }

    // Find user by Stripe customer ID
    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      return;
    }

    // Check if this user came from a salesperson conversion
    const conversion = await storage.getSalesConversionByUserId(user.id);
    if (conversion) {
      // Add this payment to the conversion's total revenue
      await storage.addConversionRevenue(user.id, amountPaid);
      console.log(`Added $${amountPaid} revenue to conversion for user ${user.id}`);
      
      // Create salesperson commission (30% rate)
      const salespersonCommission = (amountPaid * 0.30).toFixed(2);
      await storage.createCommission({
        userId: user.id,
        salespersonId: conversion.salespersonId,
        partnerId: null,
        amount: salespersonCommission,
        invoiceId: stripePaymentId,
        billingPeriod: new Date(),
        status: 'pending',
      });
      console.log(`Created $${salespersonCommission} commission for salesperson ${conversion.salespersonId}`);
    }

    // Check if user has a partner referral
    if (user.partnerId) {
      const partner = await storage.getPartner(user.partnerId);
      if (partner && partner.status === 'active') {
        // Check if user is still within commission duration from signup
        const userCreatedAt = user.createdAt ? new Date(user.createdAt) : new Date();
        const commissionEndDate = new Date(userCreatedAt);
        commissionEndDate.setMonth(commissionEndDate.getMonth() + (partner.commissionDurationMonths || 6));
        
        if (new Date() <= commissionEndDate) {
          // Create partner commission (50% rate)
          const commissionRate = 0.50;
          const partnerCommission = (amountPaid * commissionRate).toFixed(2);
          
          await storage.createCommission({
            userId: user.id,
            partnerId: partner.id,
            salespersonId: null,
            amount: partnerCommission,
            invoiceId: stripePaymentId,
            billingPeriod: new Date(),
            status: 'pending',
          });
          console.log(`Created $${partnerCommission} commission for partner ${partner.name}`);
        } else {
          console.log(`Partner commission period expired for user ${user.id}`);
        }
      }
    }
  }
}
