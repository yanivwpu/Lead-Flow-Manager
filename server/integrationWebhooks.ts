import { Express, Request, Response } from "express";
import crypto from "crypto";
import { storage } from "./storage";
import type { Integration } from "@shared/schema";

const ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY || "default-dev-key-change-in-prod123";

function decryptConfig(config: Record<string, any>): Record<string, any> {
  const sensitiveKeys = ['accessToken', 'secretKey', 'privateKey', 'apiKey', 'clientSecret', 'refreshToken', 'webhookSecret', 'webhookSigningKey'];
  const decrypted = { ...config };
  
  for (const key of sensitiveKeys) {
    if (config[key] && typeof config[key] === 'string' && config[key].includes(':')) {
      try {
        const [ivHex, encrypted] = config[key].split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const keyBuffer = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
        const authTag = Buffer.from(encrypted.slice(-32), 'hex');
        decipher.setAuthTag(authTag);
        const encryptedText = encrypted.slice(0, -32);
        let decryptedValue = decipher.update(encryptedText, 'hex', 'utf8');
        decryptedValue += decipher.final('utf8');
        decrypted[key] = decryptedValue;
      } catch (e) {
        decrypted[key] = config[key];
      }
    }
  }
  
  return decrypted;
}

async function createChatFromExternalSource(
  userId: string,
  name: string,
  phone: string | null,
  email: string | null,
  source: string,
  details: Record<string, any>
) {
  const existingChats = await storage.getChats(userId);
  const contactIdentifier = phone || email;
  
  const existingChat = existingChats.find(c => 
    (c.whatsappPhone && c.whatsappPhone === phone) ||
    (c.notes && email && c.notes.toLowerCase().includes(email.toLowerCase()))
  );
  
  if (existingChat) {
    const messages = (existingChat.messages as any[]) || [];
    messages.push({
      id: `${source}-${Date.now()}`,
      content: `[${source.toUpperCase()}] ${formatEventDetails(source, details)}`,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      incoming: true,
      timestamp: new Date().toISOString(),
    });
    
    await storage.updateChat(existingChat.id, {
      messages,
      lastMessage: `New ${source} activity`,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      updatedAt: new Date(),
    });
    
    return existingChat;
  }
  
  const notes = buildNotesFromDetails(source, details, email);
  
  const newChat = await storage.createChat({
    userId,
    name: name || 'Unknown Contact',
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'UC')}`,
    whatsappPhone: phone || null,
    lastMessage: `New lead from ${source}`,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    unread: 1,
    tag: 'New',
    pipelineStage: 'Lead',
    status: 'open',
    notes,
    messages: [{
      id: `${source}-${Date.now()}`,
      content: `[${source.toUpperCase()}] ${formatEventDetails(source, details)}`,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      incoming: true,
      timestamp: new Date().toISOString(),
    }],
  });
  
  return newChat;
}

function formatEventDetails(source: string, details: Record<string, any>): string {
  switch (source) {
    case 'shopify':
      return `New order #${details.orderNumber || details.id}${details.totalPrice ? ` for ${details.currency || '$'}${details.totalPrice}` : ''}`;
    case 'calendly':
      return `Meeting booked: ${details.eventName || 'Appointment'}${details.startTime ? ` on ${new Date(details.startTime).toLocaleDateString()}` : ''}`;
    case 'stripe':
      return `Payment received: $${(details.amount / 100).toFixed(2)} ${details.currency?.toUpperCase() || 'USD'}`;
    default:
      return `New ${source} event`;
  }
}

function buildNotesFromDetails(source: string, details: Record<string, any>, email: string | null): string {
  const lines: string[] = [];
  
  lines.push(`Source: ${source.charAt(0).toUpperCase() + source.slice(1)}`);
  if (email) lines.push(`Email: ${email}`);
  
  switch (source) {
    case 'shopify':
      if (details.orderNumber) lines.push(`Order: #${details.orderNumber}`);
      if (details.totalPrice) lines.push(`Total: ${details.currency || '$'}${details.totalPrice}`);
      if (details.shippingAddress) lines.push(`Address: ${details.shippingAddress}`);
      break;
    case 'calendly':
      if (details.eventName) lines.push(`Event: ${details.eventName}`);
      if (details.startTime) lines.push(`Scheduled: ${new Date(details.startTime).toLocaleString()}`);
      if (details.location) lines.push(`Location: ${details.location}`);
      break;
    case 'stripe':
      if (details.amount) lines.push(`Amount: $${(details.amount / 100).toFixed(2)}`);
      if (details.description) lines.push(`Description: ${details.description}`);
      break;
  }
  
  lines.push(`\nCreated: ${new Date().toLocaleString()}`);
  return lines.join('\n');
}

function verifyShopifyWebhook(body: string, hmac: string, secret: string): boolean {
  const hash = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

function verifyStripeWebhook(body: string, signature: string, secret: string): boolean {
  try {
    const elements = signature.split(',');
    const signatureHash = elements.find(e => e.startsWith('v1='))?.substring(3);
    const timestamp = elements.find(e => e.startsWith('t='))?.substring(2);
    
    if (!signatureHash || !timestamp) return false;
    
    const payload = `${timestamp}.${body}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    
    return crypto.timingSafeEqual(Buffer.from(signatureHash), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

function verifyCalendlyWebhook(body: string, signature: string, secret: string): boolean {
  if (!secret) return true;
  
  try {
    const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
  } catch {
    return false;
  }
}

export function registerIntegrationWebhooks(app: Express) {
  
  app.post("/api/webhooks/shopify/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const hmac = req.headers['x-shopify-hmac-sha256'] as string;
      const topic = req.headers['x-shopify-topic'] as string;
      
      console.log(`Shopify webhook received: ${topic} for user ${userId}`);
      
      const integration = await storage.getIntegrationByUserAndType(userId, 'shopify');
      if (!integration || !integration.isActive) {
        console.log('Shopify integration not found or inactive');
        return res.status(200).json({ received: true, processed: false });
      }
      
      const config = integration.config as Record<string, any>;
      const syncOptions = config.syncOptions || [];
      
      const body = req.body;
      let shouldProcess = false;
      let customerData = null;
      let details: Record<string, any> = {};
      
      if (topic === 'orders/create' && syncOptions.includes('new_orders')) {
        shouldProcess = true;
        customerData = body.customer || body.billing_address;
        details = {
          orderNumber: body.order_number || body.name,
          totalPrice: body.total_price,
          currency: body.currency,
          shippingAddress: body.shipping_address ? 
            `${body.shipping_address.city}, ${body.shipping_address.country}` : null,
        };
      } else if (topic === 'customers/create' && syncOptions.includes('new_customers')) {
        shouldProcess = true;
        customerData = body;
        details = {
          customerSince: new Date().toISOString(),
        };
      } else if (topic === 'checkouts/create' && syncOptions.includes('abandoned_carts')) {
        shouldProcess = true;
        customerData = body.customer || body.billing_address;
        details = {
          cartValue: body.total_price,
          currency: body.currency,
        };
      }
      
      if (shouldProcess && customerData) {
        const name = customerData.first_name 
          ? `${customerData.first_name} ${customerData.last_name || ''}`.trim()
          : customerData.name || 'Shopify Customer';
        const phone = customerData.phone || null;
        const email = customerData.email || null;
        
        await createChatFromExternalSource(userId, name, phone, email, 'shopify', details);
        console.log(`Created/updated chat from Shopify for ${name}`);
      }
      
      await storage.updateIntegration(integration.id, { lastSyncAt: new Date() });
      res.status(200).json({ received: true, processed: shouldProcess });
    } catch (error) {
      console.error('Shopify webhook error:', error);
      res.status(200).json({ received: true, error: 'Processing failed' });
    }
  });

  app.post("/api/webhooks/calendly/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const signature = req.headers['calendly-webhook-signature'] as string;
      
      console.log(`Calendly webhook received for user ${userId}`);
      
      const integration = await storage.getIntegrationByUserAndType(userId, 'calendly');
      if (!integration || !integration.isActive) {
        console.log('Calendly integration not found or inactive');
        return res.status(200).json({ received: true, processed: false });
      }
      
      const config = integration.config as Record<string, any>;
      const syncOptions = config.syncOptions || [];
      
      const payload = req.body;
      const event = payload.event || payload.trigger;
      let shouldProcess = false;
      let inviteeData = null;
      let details: Record<string, any> = {};
      
      if ((event === 'invitee.created' || event === 'invitee_created') && syncOptions.includes('new_bookings')) {
        shouldProcess = true;
        inviteeData = payload.payload?.invitee || payload.invitee || payload.payload;
        const eventInfo = payload.payload?.event || payload.event_type || {};
        details = {
          eventName: eventInfo.name || payload.payload?.event_type?.name || 'Meeting',
          startTime: eventInfo.start_time || payload.payload?.scheduled_event?.start_time,
          location: eventInfo.location?.type || 'Online',
          eventUri: payload.payload?.scheduled_event?.uri,
        };
      } else if ((event === 'invitee.canceled' || event === 'invitee_canceled') && syncOptions.includes('cancellations')) {
        shouldProcess = true;
        inviteeData = payload.payload?.invitee || payload.invitee || payload.payload;
        details = {
          eventName: 'Cancelled meeting',
          cancelReason: payload.payload?.cancellation?.reason || 'No reason provided',
        };
      }
      
      if (shouldProcess && inviteeData) {
        const name = inviteeData.name || inviteeData.first_name || 'Calendly Invitee';
        const email = inviteeData.email || null;
        const phone = inviteeData.phone || inviteeData.questions_and_answers?.find((q: any) => 
          q.question?.toLowerCase().includes('phone'))?.answer || null;
        
        await createChatFromExternalSource(userId, name, phone, email, 'calendly', details);
        console.log(`Created/updated chat from Calendly for ${name}`);
      }
      
      await storage.updateIntegration(integration.id, { lastSyncAt: new Date() });
      res.status(200).json({ received: true, processed: shouldProcess });
    } catch (error) {
      console.error('Calendly webhook error:', error);
      res.status(200).json({ received: true, error: 'Processing failed' });
    }
  });

  app.post("/api/webhooks/stripe/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const signature = req.headers['stripe-signature'] as string;
      
      console.log(`Stripe webhook received for user ${userId}`);
      
      const integration = await storage.getIntegrationByUserAndType(userId, 'stripe');
      if (!integration || !integration.isActive) {
        console.log('Stripe integration not found or inactive');
        return res.status(200).json({ received: true, processed: false });
      }
      
      const config = integration.config as Record<string, any>;
      const syncOptions = config.syncOptions || [];
      
      const payload = req.body;
      const eventType = payload.type;
      let shouldProcess = false;
      let customerData = null;
      let details: Record<string, any> = {};
      
      if (eventType === 'checkout.session.completed' && syncOptions.includes('new_customers')) {
        shouldProcess = true;
        const session = payload.data?.object;
        customerData = {
          name: session.customer_details?.name,
          email: session.customer_details?.email,
          phone: session.customer_details?.phone,
        };
        details = {
          amount: session.amount_total,
          currency: session.currency,
          description: 'Checkout completed',
        };
      } else if (eventType === 'payment_intent.succeeded' && syncOptions.includes('new_customers')) {
        shouldProcess = true;
        const paymentIntent = payload.data?.object;
        customerData = {
          name: paymentIntent.shipping?.name || paymentIntent.metadata?.customer_name || 'Stripe Customer',
          email: paymentIntent.receipt_email || paymentIntent.metadata?.customer_email,
          phone: paymentIntent.shipping?.phone,
        };
        details = {
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          description: paymentIntent.description,
        };
      } else if (eventType === 'payment_intent.payment_failed' && syncOptions.includes('failed_payments')) {
        shouldProcess = true;
        const paymentIntent = payload.data?.object;
        customerData = {
          name: paymentIntent.shipping?.name || 'Failed Payment Customer',
          email: paymentIntent.receipt_email || paymentIntent.metadata?.customer_email,
          phone: paymentIntent.shipping?.phone,
        };
        details = {
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          description: `Failed payment: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`,
        };
      } else if ((eventType === 'customer.subscription.created' || eventType === 'customer.subscription.updated' || eventType === 'customer.subscription.deleted') && syncOptions.includes('subscription_changes')) {
        shouldProcess = true;
        const subscription = payload.data?.object;
        customerData = {
          name: subscription.customer,
          email: null,
        };
        details = {
          amount: subscription.items?.data?.[0]?.price?.unit_amount || 0,
          currency: subscription.currency,
          description: `Subscription ${eventType.split('.').pop()}`,
        };
      }
      
      if (shouldProcess && customerData && (customerData.email || customerData.phone)) {
        await createChatFromExternalSource(userId, customerData.name, customerData.phone, customerData.email, 'stripe', details);
        console.log(`Created/updated chat from Stripe for ${customerData.name}`);
      }
      
      await storage.updateIntegration(integration.id, { lastSyncAt: new Date() });
      res.status(200).json({ received: true, processed: shouldProcess });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(200).json({ received: true, error: 'Processing failed' });
    }
  });

  app.post("/api/webhooks/hubspot/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      
      console.log(`HubSpot webhook received for user ${userId}`);
      
      const integration = await storage.getIntegrationByUserAndType(userId, 'hubspot');
      if (!integration || !integration.isActive) {
        return res.status(200).json({ received: true, processed: false });
      }
      
      const events = Array.isArray(req.body) ? req.body : [req.body];
      
      for (const event of events) {
        if (event.subscriptionType === 'contact.creation') {
          const contactId = event.objectId;
          const config = decryptConfig(integration.config as Record<string, any>);
          
          try {
            const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email,phone`, {
              headers: {
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json',
              },
            });
            
            if (response.ok) {
              const contact = await response.json();
              const props = contact.properties || {};
              const name = `${props.firstname || ''} ${props.lastname || ''}`.trim() || 'HubSpot Contact';
              
              await createChatFromExternalSource(userId, name, props.phone, props.email, 'hubspot', {
                hubspotId: contactId,
              });
            }
          } catch (e) {
            console.error('Failed to fetch HubSpot contact:', e);
          }
        }
      }
      
      await storage.updateIntegration(integration.id, { lastSyncAt: new Date() });
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('HubSpot webhook error:', error);
      res.status(200).json({ received: true, error: 'Processing failed' });
    }
  });

  app.get("/api/integrations/:type/:userId/webhook-url", async (req: Request, res: Response) => {
    const { type, userId } = req.params;
    const baseUrl = process.env.APP_URL || `https://${req.headers.host}`;
    const webhookUrl = `${baseUrl}/api/webhooks/${type}/${userId}`;
    
    res.json({
      webhookUrl,
      instructions: getWebhookInstructions(type, webhookUrl),
    });
  });
}

function getWebhookInstructions(type: string, webhookUrl: string): string {
  switch (type) {
    case 'shopify':
      return `1. Go to Shopify Admin → Settings → Notifications → Webhooks
2. Click "Create webhook"
3. Select events: orders/create, customers/create, checkouts/create
4. Paste this URL: ${webhookUrl}
5. Format: JSON`;
    case 'calendly':
      return `1. Go to Calendly → Integrations → Webhooks
2. Click "Create Webhook"
3. Paste this URL: ${webhookUrl}
4. Select events: invitee.created, invitee.canceled
5. Click "Subscribe"`;
    case 'stripe':
      return `1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Paste this URL: ${webhookUrl}
4. Select events: checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed
5. Click "Add endpoint"`;
    case 'hubspot':
      return `1. Go to HubSpot → Settings → Integrations → Private Apps
2. Create or edit your app
3. Go to Webhooks tab
4. Add subscription for "contact.creation"
5. Set webhook URL: ${webhookUrl}`;
    default:
      return `Configure webhook URL: ${webhookUrl}`;
  }
}
