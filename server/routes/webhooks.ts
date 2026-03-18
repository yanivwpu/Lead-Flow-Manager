import type { Express } from "express";
import { storage } from "../storage";
import { addInboxJob } from "../queue";
import { parseIncomingWebhook, findUserByTwilioCredentials } from "../userTwilio";

export function registerWebhookRoutes(app: Express): void {
  // ============= UNIFIED INBOX WEBHOOKS =============

  // Telegram webhook for incoming messages
  app.post("/api/webhook/telegram/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const update = req.body;
      console.log("Telegram webhook received:", JSON.stringify(update).substring(0, 500));

      if (update.message) {
        const message = update.message;
        const chatId = String(message.chat.id);
        const text = message.text || "";
        const senderName = message.from?.first_name
          ? `${message.from.first_name} ${message.from.last_name || ""}`.trim()
          : chatId;

        try {
          await addInboxJob({
            userId,
            channel: 'telegram',
            channelContactId: chatId,
            contactName: senderName,
            content: text,
            contentType: 'text',
            externalMessageId: String(message.message_id),
          });
        } catch (queueErr) {
          console.error("[Queue] Failed to enqueue Telegram message:", queueErr);
          return res.status(500).json({ ok: false, error: "Queue unavailable" });
        }
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("Telegram webhook error:", error);
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

      try {
        await addInboxJob({
          userId,
          channel: 'webchat',
          channelContactId: webchatVisitorId,
          contactName: name || "Website Visitor",
          content: message,
          contentType: 'text',
          externalMessageId: webchatExternalId,
        });
      } catch (queueErr) {
        console.error("[Queue] Failed to enqueue webchat message:", queueErr);
        return res.status(500).json({ error: "Queue unavailable" });
      }

      res.json({
        success: true,
        visitorId: webchatVisitorId,
        queued: true,
      });
    } catch (error) {
      console.error("Web chat error:", error);
      res.status(500).json({ error: "Failed to process message" });
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

  // Unified inbox webhook for Twilio (routes to new inbox system)
  app.post("/api/webhook/inbox/twilio", async (req, res) => {
    try {
      const parsed = parseIncomingWebhook(req.body);
      console.log("Unified Inbox Twilio webhook:", { from: parsed.from, to: parsed.to });

      const user = await findUserByTwilioCredentials(parsed.accountSid, parsed.to);
      if (!user) {
        return res.status(200).send("");
      }

      const isWhatsApp = req.body.From?.startsWith("whatsapp:");
      const channel = isWhatsApp ? 'whatsapp' : 'sms';

      try {
        await addInboxJob({
          userId: user.id,
          channel: channel as any,
          channelContactId: parsed.from,
          contactName: parsed.profileName || parsed.from,
          content: parsed.body,
          contentType: 'text',
          externalMessageId: parsed.messageSid,
        });
      } catch (queueErr) {
        console.error("[Queue] Failed to enqueue unified inbox Twilio message:", queueErr);
        return res.status(500).send("Queue unavailable");
      }

      res.status(200).send("");
    } catch (error) {
      console.error("Unified inbox Twilio webhook error:", error);
      res.status(200).send("");
    }
  });
}
