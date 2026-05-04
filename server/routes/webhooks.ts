import type { Express } from "express";
import { storage } from "../storage";

/** Match widget pageRules against a URL (same order / semantics as /widget.js). */
function resolveWebchatPageCopy(ws: Record<string, unknown>, href: string): { greeting: string; prefill: string } {
  const defaultGreeting =
    typeof ws.welcomeMessage === "string" && ws.welcomeMessage.trim()
      ? String(ws.welcomeMessage)
      : "Hi! How can we help you today?";
  const trimmedHref = href.slice(0, 4000);
  const rules = Array.isArray(ws.pageRules) ? ws.pageRules : [];
  for (const raw of rules) {
    const r = raw as Record<string, unknown>;
    const q = String(r?.urlContains ?? "").trim();
    if (q && trimmedHref.indexOf(q) !== -1) {
      const g = typeof r.greeting === "string" && r.greeting.trim() ? String(r.greeting) : defaultGreeting;
      const prefill = typeof r.prefilledMessage === "string" ? String(r.prefilledMessage) : "";
      return { greeting: g, prefill };
    }
  }
  return { greeting: defaultGreeting, prefill: "" };
}
import { parseIncomingWebhook, findUserByTwilioCredentials } from "../userTwilio";
import { handleCalendlyWebhook } from "../calendlyWebhook";
import { scheduleHubSpotAutoSync } from "../hubspotAutoSync";

export function registerWebhookRoutes(app: Express): void {
  // ============= UNIFIED INBOX WEBHOOKS =============

  app.post("/api/webhooks/calendly/:userId", (req, res) => {
    void handleCalendlyWebhook(req, res);
  });

  // Telegram webhook for incoming messages
  app.post("/api/webhook/telegram/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const update = req.body;
      console.log(`[Inbound] Webhook received — channel: telegram, userId: ${userId}`);

      if (update.message) {
        const message = update.message;
        const chatId = String(message.chat.id);
        const senderName = message.from?.first_name
          ? `${message.from.first_name} ${message.from.last_name || ""}`.trim()
          : chatId;

        const tgSetting = await storage.getChannelSetting(userId, "telegram");
        const botToken: string | undefined = (tgSetting?.config as { botToken?: string })?.botToken;
        if (!botToken) {
          console.warn("[Inbound] Telegram bot token missing — skipping message");
          return res.status(200).json({ ok: true });
        }

        let text = message.text || message.caption || "";
        let contentType: "text" | "image" | "video" | "audio" | "document" = "text";
        let telegramMedia: { botToken: string; fileId: string } | undefined;

        const photos = message.photo as { file_id: string; file_size?: number }[] | undefined;
        if (photos?.length) {
          const largest = photos.reduce((a, b) => ((b.file_size ?? 0) > (a.file_size ?? 0) ? b : a));
          contentType = "image";
          telegramMedia = { botToken, fileId: largest.file_id };
        } else if (message.document) {
          contentType = "document";
          telegramMedia = { botToken, fileId: message.document.file_id };
          text = text || message.document.file_name || "";
        } else if (message.video) {
          contentType = "video";
          telegramMedia = { botToken, fileId: message.video.file_id };
        } else if (message.audio) {
          contentType = "audio";
          telegramMedia = { botToken, fileId: message.audio.file_id };
        } else if (message.voice) {
          contentType = "audio";
          telegramMedia = { botToken, fileId: message.voice.file_id };
        }

        console.log(`[Inbound] Channel identified: telegram — from: ${chatId}, messageId: ${message.message_id}`);
        console.log(`[Inbound] Starting processIncomingMessage — channel: telegram, userId: ${userId}`);

        const { channelService } = await import("../channelService");
        const result = await channelService.processIncomingMessage({
          userId,
          channel: "telegram",
          channelContactId: chatId,
          contactName: senderName,
          content: text,
          contentType,
          telegramMedia,
          externalMessageId: String(message.message_id),
        });

        // Fire-and-forget avatar fetch — only if due for refresh
        const { shouldRefreshAvatar, fetchTelegramAvatar } = await import("../avatarService");
        if (shouldRefreshAvatar(result.contact)) {
          const tgSetting = await storage.getChannelSetting(userId, 'telegram');
          const botToken: string | undefined = (tgSetting?.config as any)?.botToken;
          if (botToken) {
            fetchTelegramAvatar(result.contact.id, chatId, botToken).catch(() => {});
          }
        }
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
      scheduleHubSpotAutoSync(userId, contact.id);

      const { channelService } = await import("../channelService");
      await channelService.logActivity(userId, contact.id, undefined, 'lead_created', {
        source: 'tiktok',
        originalSource: source,
        metadata,
      });

      // Auto-activate the channel on first successful lead
      await storage.upsertChannelSetting(userId, 'tiktok', { isConnected: true, isEnabled: true });

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
  // Optional query ?href=… resolves chatGreeting/chatPrefill from pageRules (hosted /chat page).
  app.get("/api/webchat/:userId/settings", async (req, res) => {
    try {
      const { userId } = req.params;
      const hrefParam =
        typeof req.query.href === "string" ? req.query.href.slice(0, 4000) : "";
      const user = await storage.getUser(userId);
      const defaults = {
        color: "#25D366",
        welcomeMessage: "Hi! How can we help you today?",
        businessName: "",
      };
      if (!user) {
        return res.json({
          ...defaults,
          chatGreeting: defaults.welcomeMessage,
          chatPrefill: "",
        });
      }
      const ws = (user.widgetSettings as Record<string, unknown>) || {};
      const welcomeMessage =
        typeof ws.welcomeMessage === "string" && ws.welcomeMessage.trim()
          ? String(ws.welcomeMessage)
          : defaults.welcomeMessage;
      let chatGreeting = welcomeMessage;
      let chatPrefill = "";
      if (hrefParam) {
        const resolved = resolveWebchatPageCopy(ws, hrefParam);
        chatGreeting = resolved.greeting;
        chatPrefill = resolved.prefill;
      }
      res.json({
        color:
          typeof ws.color === "string" && ws.color.trim()
            ? String(ws.color)
            : defaults.color,
        welcomeMessage,
        businessName: String((user as { businessName?: string }).businessName || (user as { name?: string }).name || ""),
        chatGreeting,
        chatPrefill,
      });
    } catch {
      const fallback = "Hi! How can we help you?";
      res.json({
        color: "#25D366",
        welcomeMessage: fallback,
        businessName: "",
        chatGreeting: fallback,
        chatPrefill: "",
      });
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

      const twilioMatch = await findUserByTwilioCredentials(parsed.accountSid, parsed.to);
      if (!twilioMatch) {
        console.warn(`[Inbound] No user matched — accountSid: ${parsed.accountSid}, to: ${parsed.to}`);
        return res.status(200).send("");
      }

      const { user, matchedPhone } = twilioMatch;
      const normalizedFrom = parsed.from.replace(/^\+/, "");
      console.log(`[Inbound] Channel identified: ${channel} — userId: ${user.id}, from: ${normalizedFrom}, to: ${matchedPhone}`);
      console.log(`[Inbound] Starting processIncomingMessage — channel: ${channel}, messageSid: ${parsed.messageSid}`);

      const twilioMimeToContent = (ct: string | undefined): "image" | "video" | "audio" | "document" => {
        if (!ct) return "image";
        if (ct.startsWith("image/")) return "image";
        if (ct.startsWith("video/")) return "video";
        if (ct.startsWith("audio/")) return "audio";
        return "document";
      };
      const hasTwilioMedia = !!parsed.mediaUrl && parsed.numMedia > 0;

      const { channelService } = await import("../channelService");
      await channelService.processIncomingMessage({
        userId: user.id,
        channel: channel as any,
        channelContactId: normalizedFrom,
        channelAccountId: matchedPhone, // the business number that received the message
        contactName: parsed.profileName || normalizedFrom,
        content: parsed.body || (hasTwilioMedia ? "" : ""),
        contentType: hasTwilioMedia ? twilioMimeToContent(parsed.mediaContentType) : "text",
        mediaUrl: parsed.mediaUrl,
        mediaFilename: hasTwilioMedia ? `mms-${parsed.messageSid}` : undefined,
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
