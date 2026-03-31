import type { Express } from "express";
import { storage } from "../storage";
import { parseIncomingWebhook, findUserByTwilioCredentials } from "../userTwilio";

export function registerWebhookRoutes(app: Express): void {
  // ============= UNIFIED INBOX WEBHOOKS =============

  // Telegram webhook for incoming messages
  app.post("/api/webhook/telegram/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const update = req.body;
      console.log(`[Inbound] Webhook received — channel: telegram, userId: ${userId}`);

      if (update.message) {
        const message = update.message;
        const chatId = String(message.chat.id);
        const text = message.text || "";
        const senderName = message.from?.first_name
          ? `${message.from.first_name} ${message.from.last_name || ""}`.trim()
          : chatId;

        console.log(`[Inbound] Channel identified: telegram — from: ${chatId}, messageId: ${message.message_id}`);
        console.log(`[Inbound] Starting processIncomingMessage — channel: telegram, userId: ${userId}`);

        const { channelService } = await import("../channelService");
        await channelService.processIncomingMessage({
          userId,
          channel: 'telegram',
          channelContactId: chatId,
          contactName: senderName,
          content: text,
          contentType: 'text',
          externalMessageId: String(message.message_id),
        });
      }

      console.log(`[Inbound] Webhook returned 200 — channel: telegram, userId: ${userId}`);
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[Inbound] Telegram webhook error:", error);
      res.status(200).json({ ok: true });
    }
  });

  // TikTok Lead Intake webhook (lead generation, not messaging)
  app.post("/api/webhook/tiktok/lead", async (req, res) => {
    try {
      const { userId, name, phone, email, source, metadata } = req.body;
      console.log("TikTok lead received:", { name, phone, email, source });

      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }

      const contact = await storage.createContact({
        userId,
        name: name || "TikTok Lead",
        phone,
        email,
        primaryChannel: 'whatsapp',
        source: 'tiktok',
        notes: metadata ? JSON.stringify(metadata) : undefined,
      });

      const { channelService } = await import("../channelService");
      await channelService.logActivity(userId, contact.id, undefined, 'lead_created', {
        source: 'tiktok',
        originalSource: source,
        metadata,
      });

      res.status(201).json({ success: true, contactId: contact.id });
    } catch (error) {
      console.error("TikTok lead webhook error:", error);
      res.status(500).json({ error: "Failed to create lead" });
    }
  });

  // Web Chat widget endpoint for visitors
  app.post("/api/webchat/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const { visitorId, name, message } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message required" });
      }

      const webchatExternalId = `webchat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const webchatVisitorId = visitorId || `visitor_${Date.now()}`;

      console.log(`[Inbound] Webhook received — channel: webchat, userId: ${userId}, visitorId: ${webchatVisitorId}`);
      console.log(`[Inbound] Channel identified: webchat — starting processIncomingMessage`);

      const { channelService } = await import("../channelService");
      await channelService.processIncomingMessage({
        userId,
        channel: 'webchat',
        channelContactId: webchatVisitorId,
        contactName: name || "Website Visitor",
        content: message,
        contentType: 'text',
        externalMessageId: webchatExternalId,
      });

      console.log(`[Inbound] Webhook returned 200 — channel: webchat, userId: ${userId}`);
      res.json({
        success: true,
        visitorId: webchatVisitorId,
        queued: false,
      });
    } catch (error) {
      console.error("[Inbound] Web chat error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Public widget settings (no auth — returns only appearance fields)
  app.get("/api/webchat/:userId/settings", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      const defaults = { color: "#25D366", welcomeMessage: "Hi! How can we help you today?", businessName: "" };
      if (!user) return res.json(defaults);
      const ws = (user.widgetSettings as any) || {};
      res.json({
        color: ws.color || defaults.color,
        welcomeMessage: ws.welcomeMessage || defaults.welcomeMessage,
        businessName: (user as any).businessName || (user as any).name || "",
      });
    } catch {
      res.json({ color: "#25D366", welcomeMessage: "Hi! How can we help you?", businessName: "" });
    }
  });

  // Get web chat messages for a visitor
  app.get("/api/webchat/:userId/:visitorId/messages", async (req, res) => {
    try {
      const { userId, visitorId } = req.params;

      const contact = await storage.getContactByChannelId(userId, 'webchat', visitorId);
      if (!contact) {
        return res.json([]);
      }

      const conversation = await storage.getConversationByContactAndChannel(
        contact.id,
        'webchat'
      );
      if (!conversation) {
        return res.json([]);
      }

      const messages = await storage.getMessages(conversation.id, 50);
      res.json(messages);
    } catch (error) {
      console.error("Web chat messages error:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Unified inbox webhook for Twilio (secondary endpoint — primary is /api/webhook/twilio/incoming)
  app.post("/api/webhook/inbox/twilio", async (req, res) => {
    try {
      const parsed = parseIncomingWebhook(req.body);
      const isWhatsApp = req.body.From?.startsWith("whatsapp:");
      const channel = isWhatsApp ? 'whatsapp' : 'sms';

      console.log(`[Inbound] Webhook received — channel: ${channel}, from: ${parsed.from}, messageSid: ${parsed.messageSid}`);

      const user = await findUserByTwilioCredentials(parsed.accountSid, parsed.to);
      if (!user) {
        console.warn(`[Inbound] No user matched — accountSid: ${parsed.accountSid}, to: ${parsed.to}`);
        return res.status(200).send("");
      }

      const normalizedFrom = parsed.from.replace(/^\+/, "");
      console.log(`[Inbound] Channel identified: ${channel} — userId: ${user.id}, from: ${normalizedFrom}`);
      console.log(`[Inbound] Starting processIncomingMessage — channel: ${channel}, messageSid: ${parsed.messageSid}`);

      const { channelService } = await import("../channelService");
      await channelService.processIncomingMessage({
        userId: user.id,
        channel: channel as any,
        channelContactId: normalizedFrom,
        contactName: parsed.profileName || normalizedFrom,
        content: parsed.body,
        contentType: 'text',
        externalMessageId: parsed.messageSid,
      });

      console.log(`[Inbound] Webhook returned 200 — channel: ${channel}, messageSid: ${parsed.messageSid}`);
      res.status(200).send("");
    } catch (error) {
      console.error("[Inbound] Twilio inbox webhook error:", error);
      res.status(200).send("");
    }
  });
}
