import { getStripeSync, getUncachableStripeClient } from './stripeClient';
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

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
    
    // Custom processing for tracking converted user revenue
    await this.trackConversionRevenue(payload, signature);
  }

  static async trackConversionRevenue(payload: Buffer, signature: string): Promise<void> {
    try {
      const stripe = await getUncachableStripeClient();
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        // If no webhook secret, parse event directly (less secure but works for testing)
        const event = JSON.parse(payload.toString());
        await this.handlePaymentEvent(event);
        return;
      }

      const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      await this.handlePaymentEvent(event);
    } catch (error) {
      console.log('Revenue tracking skipped (non-critical):', (error as Error).message);
    }
  }

  static async handlePaymentEvent(event: any): Promise<void> {
    if (event.type !== 'invoice.payment_succeeded') {
      return;
    }

    const invoice = event.data.object;
    const customerId = invoice.customer;
    const amountPaid = invoice.amount_paid / 100; // Convert from cents to dollars

    if (!customerId || amountPaid <= 0) {
      return;
    }

    // Find user by Stripe customer ID
    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      return;
    }

    // Check if this user came from a conversion
    const conversion = await storage.getSalesConversionByUserId(user.id);
    if (!conversion) {
      return;
    }

    // Add this payment to the conversion's total revenue
    await storage.addConversionRevenue(user.id, amountPaid);
    console.log(`Added $${amountPaid} revenue to conversion for user ${user.id}`);
  }
}
