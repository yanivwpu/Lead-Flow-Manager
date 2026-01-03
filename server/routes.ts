import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertChatSchema, insertRegisteredPhoneSchema, PLAN_LIMITS, type SubscriptionPlan } from "@shared/schema";
import { z } from "zod";
import { getVapidPublicKey } from "./notifications";
import {
  sendUserWhatsAppMessage,
  verifyUserTwilioConnection,
  parseIncomingWebhook,
  parseStatusWebhook,
  findOrCreateChatByPhone,
  findUserByTwilioCredentials,
  connectUserTwilio,
  disconnectUserTwilio,
  validateTwilioCredentials,
  type WhatsAppMessage,
  type TwilioCredentials,
} from "./userTwilio";
import { subscriptionService } from "./subscriptionService";
import { getStripePublishableKey } from "./stripeClient";

const TWILIO_BASE_COST_PER_MESSAGE = 0.005;
const MARKUP_PERCENT = 5;

function calculateCostWithMarkup(baseCost: number): { twilioCost: string; markupPercent: string; totalCost: string } {
  const markup = baseCost * (MARKUP_PERCENT / 100);
  const total = baseCost + markup;
  return {
    twilioCost: baseCost.toFixed(6),
    markupPercent: MARKUP_PERCENT.toFixed(2),
    totalCost: total.toFixed(6),
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Get all chats for the current user
  app.get("/api/chats", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const chats = await storage.getChats(req.user.id);
      res.json(chats);
    } catch (error) {
      console.error("Error fetching chats:", error);
      res.status(500).json({ error: "Failed to fetch chats" });
    }
  });

  // Get a specific chat
  app.get("/api/chats/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const chat = await storage.getChat(req.params.id);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }
      if (chat.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      res.json(chat);
    } catch (error) {
      console.error("Error fetching chat:", error);
      res.status(500).json({ error: "Failed to fetch chat" });
    }
  });

  // Create a new chat
  app.post("/api/chats", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const validated = insertChatSchema.parse({
        ...req.body,
        userId: req.user.id,
      });
      const chat = await storage.createChat(validated);
      res.status(201).json(chat);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating chat:", error);
      res.status(500).json({ error: "Failed to create chat" });
    }
  });

  // Update a chat
  app.patch("/api/chats/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const chat = await storage.getChat(req.params.id);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }
      if (chat.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Convert followUpDate string to Date object if provided
      const updates = { ...req.body };
      if (updates.followUpDate !== undefined) {
        updates.followUpDate = updates.followUpDate ? new Date(updates.followUpDate) : null;
      }

      const updated = await storage.updateChat(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating chat:", error);
      res.status(500).json({ error: "Failed to update chat" });
    }
  });

  // Delete a chat
  app.delete("/api/chats/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const chat = await storage.getChat(req.params.id);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }
      if (chat.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.deleteChat(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting chat:", error);
      res.status(500).json({ error: "Failed to delete chat" });
    }
  });

  // Update notification preferences
  app.patch("/api/users/preferences", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { pushEnabled, emailEnabled, pushSubscription } = req.body;
      
      const updates: any = {};
      if (pushEnabled !== undefined) updates.pushEnabled = pushEnabled;
      if (emailEnabled !== undefined) updates.emailEnabled = emailEnabled;
      if (pushSubscription !== undefined) updates.pushSubscription = pushSubscription;

      const updated = await storage.updateUser(req.user.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating preferences:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  // Get notification preferences
  app.get("/api/users/preferences", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        pushEnabled: user.pushEnabled,
        emailEnabled: user.emailEnabled,
        pushSubscription: user.pushSubscription,
      });
    } catch (error) {
      console.error("Error fetching preferences:", error);
      res.status(500).json({ error: "Failed to fetch preferences" });
    }
  });

  // Get VAPID public key for push notifications
  app.get("/api/vapid-public-key", (_req, res) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return res.status(503).json({ error: "Push notifications not configured" });
    }
    res.json({ publicKey });
  });

  // Get Twilio connection status (platform-level, via Replit integration)
  app.get("/api/twilio/status", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const isConnected = await verifyTwilioConnection();
      res.json({
        connected: isConnected,
        message: isConnected 
          ? "WhatsApp messaging is enabled via platform Twilio account" 
          : "Twilio not configured"
      });
    } catch (error) {
      console.error("Error fetching Twilio status:", error);
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  // ============= Phone Registration Endpoints =============
  
  // Get registered phones for current user
  app.get("/api/phones", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const phones = await storage.getRegisteredPhones(req.user.id);
      res.json(phones);
    } catch (error) {
      console.error("Error fetching phones:", error);
      res.status(500).json({ error: "Failed to fetch phones" });
    }
  });

  // Register a new WhatsApp Business phone number
  app.post("/api/phones", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { phoneNumber, businessName } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      // Normalize phone number format (should be whatsapp:+1234567890)
      let normalizedPhone = phoneNumber.trim();
      if (!normalizedPhone.startsWith("whatsapp:")) {
        if (!normalizedPhone.startsWith("+")) {
          normalizedPhone = "+" + normalizedPhone;
        }
        normalizedPhone = "whatsapp:" + normalizedPhone;
      }

      // Check if already registered
      const existing = await storage.getRegisteredPhoneByNumber(normalizedPhone);
      if (existing) {
        return res.status(400).json({ error: "This phone number is already registered" });
      }

      const phone = await storage.registerPhone({
        userId: req.user.id,
        phoneNumber: normalizedPhone,
        businessName: businessName || null,
      });

      res.status(201).json(phone);
    } catch (error) {
      console.error("Error registering phone:", error);
      res.status(500).json({ error: "Failed to register phone" });
    }
  });

  // Delete a registered phone
  app.delete("/api/phones/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const phones = await storage.getRegisteredPhones(req.user.id);
      const phone = phones.find(p => p.id === req.params.id);
      if (!phone) {
        return res.status(404).json({ error: "Phone not found" });
      }

      await storage.deleteRegisteredPhone(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting phone:", error);
      res.status(500).json({ error: "Failed to delete phone" });
    }
  });

  // ============= Usage & Billing Endpoints =============
  
  // Get usage summary for current user
  app.get("/api/usage/summary", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { startDate, endDate } = req.query;
      let start: Date | undefined;
      let end: Date | undefined;
      
      if (startDate) start = new Date(startDate as string);
      if (endDate) end = new Date(endDate as string);
      
      const summary = await storage.getUsageSummary(req.user.id, start, end);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching usage summary:", error);
      res.status(500).json({ error: "Failed to fetch usage" });
    }
  });

  // Get detailed usage history
  app.get("/api/usage/history", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { startDate, endDate } = req.query;
      let start: Date | undefined;
      let end: Date | undefined;
      
      if (startDate) start = new Date(startDate as string);
      if (endDate) end = new Date(endDate as string);
      
      const usage = await storage.getUsageByUser(req.user.id, start, end);
      res.json(usage);
    } catch (error) {
      console.error("Error fetching usage history:", error);
      res.status(500).json({ error: "Failed to fetch usage history" });
    }
  });

  // Send WhatsApp message
  app.post("/api/chats/:id/send", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const chat = await storage.getChat(req.params.id);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }
      if (chat.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (!chat.whatsappPhone) {
        return res.status(400).json({ error: "No WhatsApp phone number for this chat" });
      }

      // Check if user can send messages (plan restriction)
      const canSend = await subscriptionService.canSendMessage(req.user.id);
      if (!canSend.allowed) {
        return res.status(403).json({ 
          error: canSend.reason, 
          code: "PLAN_LIMIT",
          upgradeRequired: true 
        });
      }

      // Check conversation limit (24-hour window tracking)
      const canStart = await subscriptionService.canStartConversation(req.user.id, chat.whatsappPhone);
      if (!canStart.allowed) {
        return res.status(403).json({ 
          error: canStart.reason, 
          code: "CONVERSATION_LIMIT",
          upgradeRequired: true 
        });
      }

      // Check throttling for high-volume conversations (max messages per 24h window)
      const throttleCheck = await subscriptionService.checkConversationThrottle(req.user.id, chat.whatsappPhone);
      if (!throttleCheck.allowed) {
        return res.status(429).json({ 
          error: throttleCheck.reason, 
          code: "THROTTLED",
          messagesInWindow: throttleCheck.messagesInWindow
        });
      }

      const isConnected = await verifyUserTwilioConnection(req.user.id);
      if (!isConnected) {
        return res.status(400).json({ 
          error: "WhatsApp not connected. Please connect your Twilio account first.",
          code: "TWILIO_NOT_CONNECTED"
        });
      }

      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      const result = await sendUserWhatsAppMessage(req.user.id, chat.whatsappPhone, message);

      // Track conversation window (24-hour)
      await subscriptionService.trackConversationWindow(req.user.id, chat.id, chat.whatsappPhone);

      // Track usage with 5% markup
      const costs = calculateCostWithMarkup(TWILIO_BASE_COST_PER_MESSAGE);
      await storage.recordMessageUsage({
        userId: req.user.id,
        chatId: chat.id,
        direction: "outbound",
        messageType: "text",
        twilioSid: result.sid,
        twilioCost: costs.twilioCost,
        markupPercent: costs.markupPercent,
        totalCost: costs.totalCost,
      });

      const newMessage: WhatsAppMessage = {
        id: result.sid,
        text: message,
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        sent: true,
        status: "sent",
        twilioSid: result.sid,
      };

      const messages = (chat.messages as WhatsAppMessage[]) || [];
      messages.push(newMessage);

      await storage.updateChat(chat.id, {
        messages,
        lastMessage: message,
        time: newMessage.time,
      });

      res.json({ success: true, message: newMessage });
    } catch (error: any) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: error.message || "Failed to send message" });
    }
  });

  // ============= Twilio Connection Endpoints =============

  // Get Twilio connection status
  app.get("/api/twilio/status", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        connected: user.twilioConnected || false,
        whatsappNumber: user.twilioWhatsappNumber || null,
        hasCredentials: !!(user.twilioAccountSid && user.twilioAuthToken),
      });
    } catch (error) {
      console.error("Error getting Twilio status:", error);
      res.status(500).json({ error: "Failed to get Twilio status" });
    }
  });

  // Connect Twilio account
  app.post("/api/twilio/connect", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { accountSid, authToken, whatsappNumber } = req.body;

      if (!accountSid || !authToken || !whatsappNumber) {
        return res.status(400).json({ 
          error: "Account SID, Auth Token, and WhatsApp number are required" 
        });
      }

      const credentials: TwilioCredentials = {
        accountSid,
        authToken,
        whatsappNumber,
      };

      const result = await connectUserTwilio(req.user.id, credentials);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ 
        success: true, 
        message: "Twilio connected successfully",
        webhookUrl: `${process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`}/api/webhook/twilio/incoming`
      });
    } catch (error: any) {
      console.error("Error connecting Twilio:", error);
      res.status(500).json({ error: error.message || "Failed to connect Twilio" });
    }
  });

  // Disconnect Twilio account
  app.post("/api/twilio/disconnect", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await disconnectUserTwilio(req.user.id);
      res.json({ success: true, message: "Twilio disconnected" });
    } catch (error: any) {
      console.error("Error disconnecting Twilio:", error);
      res.status(500).json({ error: error.message || "Failed to disconnect Twilio" });
    }
  });

  // Validate Twilio credentials (without saving)
  app.post("/api/twilio/validate", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { accountSid, authToken, whatsappNumber } = req.body;

      if (!accountSid || !authToken || !whatsappNumber) {
        return res.status(400).json({ 
          error: "Account SID, Auth Token, and WhatsApp number are required" 
        });
      }

      const result = await validateTwilioCredentials({ accountSid, authToken, whatsappNumber });
      res.json(result);
    } catch (error: any) {
      console.error("Error validating Twilio:", error);
      res.status(500).json({ valid: false, error: error.message || "Validation failed" });
    }
  });

  // Twilio webhook for incoming WhatsApp messages
  // Routes messages to the correct user based on Account SID + phone number
  app.post("/api/webhook/twilio/incoming", async (req, res) => {
    try {
      const parsed = parseIncomingWebhook(req.body);
      console.log("Incoming WhatsApp message:", { from: parsed.from, to: parsed.to, accountSid: parsed.accountSid });

      // Find user by their Twilio Account SID and receiving phone number
      const user = await findUserByTwilioCredentials(parsed.accountSid, parsed.to);
      
      if (!user) {
        console.log("No user found for incoming message:", { accountSid: parsed.accountSid, to: parsed.to });
        return res.status(200).send("");
      }

      const userId = user.id;
      const chat = await findOrCreateChatByPhone(userId, parsed.from, parsed.profileName);

      // Track conversation window (24-hour) for inbound messages too
      await subscriptionService.trackConversationWindow(userId, chat.id, parsed.from);

      // Track inbound usage with 5% markup
      const costs = calculateCostWithMarkup(TWILIO_BASE_COST_PER_MESSAGE);
      await storage.recordMessageUsage({
        userId,
        chatId: chat.id,
        direction: "inbound",
        messageType: "text",
        twilioSid: parsed.messageSid,
        twilioCost: costs.twilioCost,
        markupPercent: costs.markupPercent,
        totalCost: costs.totalCost,
      });

      const newMessage: WhatsAppMessage = {
        id: parsed.messageSid,
        text: parsed.body,
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        sent: false,
      };

      const messages = (chat.messages as WhatsAppMessage[]) || [];
      messages.push(newMessage);

      await storage.updateChat(chat.id, {
        messages,
        lastMessage: parsed.body,
        time: newMessage.time,
        unread: (chat.unread || 0) + 1,
      });

      res.status(200).send("");
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(200).send("");
    }
  });

  // Twilio webhook for message status updates
  app.post("/api/webhook/twilio/status", async (req, res) => {
    try {
      const parsed = parseStatusWebhook(req.body);
      console.log("Message status update:", parsed);

      res.status(200).send("");
    } catch (error) {
      console.error("Status webhook error:", error);
      res.status(200).send("");
    }
  });

  // ============= Subscription Endpoints =============

  // Get Stripe publishable key
  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error) {
      console.error("Error getting Stripe key:", error);
      res.status(500).json({ error: "Stripe not configured" });
    }
  });

  // Get available subscription plans
  app.get("/api/subscription/plans", (_req, res) => {
    const plans = Object.entries(PLAN_LIMITS).map(([id, plan]) => ({
      id,
      ...plan,
    }));
    res.json(plans);
  });

  // Debug endpoint to manually trigger Stripe sync
  app.post("/api/debug/stripe-sync", async (_req, res) => {
    try {
      const { getStripeSync } = await import("./stripeClient");
      const stripeSync = await getStripeSync();
      
      console.log('[Debug] Manually triggering Stripe sync...');
      await stripeSync.syncBackfill();
      console.log('[Debug] Stripe sync completed');
      
      // Check results
      const { db } = await import("../drizzle/db");
      const { sql } = await import("drizzle-orm");
      const pricesResult = await db.execute(
        sql`SELECT id, metadata FROM stripe.prices WHERE active = true LIMIT 10`
      );
      
      res.json({
        success: true,
        message: 'Sync completed',
        pricesFound: pricesResult.rows.length,
        prices: pricesResult.rows,
      });
    } catch (error: any) {
      console.error('[Debug] Stripe sync error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Debug endpoint to check Stripe data status
  app.get("/api/debug/stripe-status", async (_req, res) => {
    try {
      const { db } = await import("../drizzle/db");
      const { sql } = await import("drizzle-orm");
      const { getStripePublishableKey } = await import("./stripeClient");
      
      // Check environment
      const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
      
      // Check Stripe key (just first 20 chars for safety)
      let stripeKeyPrefix = 'not configured';
      try {
        const key = await getStripePublishableKey();
        stripeKeyPrefix = key ? key.substring(0, 20) + '...' : 'empty';
      } catch (e: any) {
        stripeKeyPrefix = `error: ${e.message}`;
      }
      
      // Check if stripe schema exists
      const schemaCheck = await db.execute(
        sql`SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'stripe')`
      );
      
      // Try to get prices
      let prices: any[] = [];
      try {
        const pricesResult = await db.execute(
          sql`SELECT id, metadata FROM stripe.prices WHERE active = true LIMIT 10`
        );
        prices = pricesResult.rows as any[];
      } catch (e: any) {
        prices = [{ error: e.message }];
      }
      
      res.json({
        isProduction,
        stripeKeyPrefix,
        schemaExists: schemaCheck.rows[0],
        activePrices: prices,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get current user's subscription and limits
  app.get("/api/subscription", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      const user = await storage.getUser(req.user.id);

      res.json({
        limits,
        subscription: user ? {
          plan: user.subscriptionPlan,
          status: user.subscriptionStatus,
          currentPeriodEnd: user.currentPeriodEnd,
        } : null,
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  // Create checkout session for upgrading
  app.post("/api/subscription/checkout", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { planId } = req.body;
      if (!planId || !['starter', 'growth', 'pro'].includes(planId)) {
        return res.status(400).json({ error: "Invalid plan" });
      }

      const url = await subscriptionService.createCheckoutSession(req.user.id, planId);
      res.json({ url });
    } catch (error: any) {
      console.error("Error creating checkout:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout" });
    }
  });

  // Create customer portal session for managing subscription
  app.post("/api/subscription/portal", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const url = await subscriptionService.createCustomerPortalSession(req.user.id);
      res.json({ url });
    } catch (error: any) {
      console.error("Error creating portal:", error);
      res.status(500).json({ error: error.message || "Failed to create portal session" });
    }
  });

  // Sync subscription from Stripe (for when webhooks fail)
  app.post("/api/subscription/sync", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(req.user.id);
      if (!user?.stripeCustomerId) {
        return res.json({ 
          synced: false, 
          message: "No Stripe customer ID found",
          plan: user?.subscriptionPlan || 'free'
        });
      }

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();

      // Get all active subscriptions for this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active',
        limit: 1,
      });

      if (subscriptions.data.length === 0) {
        // No active subscription, set to free
        await storage.updateUser(user.id, {
          subscriptionPlan: 'free',
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null,
        });
        return res.json({ synced: true, plan: 'free', message: "No active subscription found" });
      }

      const subscription = subscriptions.data[0];
      const priceId = subscription.items?.data?.[0]?.price?.id;

      // Get plan from price metadata
      let plan: 'free' | 'starter' | 'growth' | 'pro' = 'free';
      if (priceId) {
        const price = await stripe.prices.retrieve(priceId);
        if (price.metadata?.plan) {
          plan = price.metadata.plan as any;
        }
      }

      const subData = subscription as any;
      await storage.updateUser(user.id, {
        stripeSubscriptionId: subscription.id,
        subscriptionPlan: plan,
        subscriptionStatus: subscription.status === 'active' ? 'active' : 'past_due',
        currentPeriodStart: subData.current_period_start ? new Date(subData.current_period_start * 1000) : null,
        currentPeriodEnd: subData.current_period_end ? new Date(subData.current_period_end * 1000) : null,
      });

      res.json({ synced: true, plan, subscription: subscription.id });
    } catch (error: any) {
      console.error("Error syncing subscription:", error);
      res.status(500).json({ error: error.message || "Failed to sync subscription" });
    }
  });

  // ============= Admin Endpoints =============
  
  // Get all users' usage summary (admin only - for now, accessible to all authenticated users)
  app.get("/api/admin/usage", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { db } = await import("../drizzle/db");
      const { users, messageUsage } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");
      
      // Get usage summary per user
      const result = await db.execute(sql`
        SELECT 
          u.id as user_id,
          u.name,
          u.email,
          COUNT(m.id)::int as total_messages,
          COALESCE(SUM(m.total_cost), 0)::text as total_cost
        FROM users u
        LEFT JOIN message_usage m ON u.id = m.user_id
        GROUP BY u.id, u.name, u.email
        ORDER BY total_cost DESC
      `);
      
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching admin usage:", error);
      res.status(500).json({ error: "Failed to fetch usage data" });
    }
  });

  return httpServer;
}
