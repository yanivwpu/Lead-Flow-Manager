import type { Express } from "express";
import { storage } from "../storage";
import {
  consumeWebchatContactCap,
  consumeWebchatRateLimits,
  matchWidgetPageRule,
  parseWebchatInboundBody,
  resolvePublicWidgetAccess,
  WEBCHAT_GENERIC_NOT_FOUND,
  WEBCHAT_GENERIC_RATE_LIMIT,
} from "../webchatAccess";
import { mergeWebchatPageContext, sanitizeWebchatPageContextInput } from "@shared/webchatPageContext";
import { resolveTelegramWebhookOwner, resolveTiktokLeadOwner } from "../ingressPublicTokens";
import { getChatbotFlowForWorkspace } from "../tenantOwnership";
import { parseIncomingWebhook, findUserByTwilioCredentials } from "../userTwilio";
import { handleCalendlyWebhook } from "../calendlyWebhook";
import { handleGrowthEngineSetupCalendlyWebhook } from "../growthEngineSetupCalendly";
import { handleMarketingDemoCalendlyWebhook } from "../marketingDemoCalendlyWebhook";
import { scheduleHubSpotAutoSync } from "../hubspotAutoSync";

export function registerWebhookRoutes(app: Express): void {
  // ============= UNIFIED INBOX WEBHOOKS =============

  app.post("/api/webhooks/calendly/growth-engine-setup", (req, res) => {
    void handleGrowthEngineSetupCalendlyWebhook(req, res);
  });

  app.post("/api/webhooks/calendly/marketing-demo", (req, res) => {
    void handleMarketingDemoCalendlyWebhook(req, res);
  });

  app.post("/api/webhooks/calendly/:userId", (req, res) => {
    void handleCalendlyWebhook(req, res);
  });

  // Telegram webhook for incoming messages (opaque public id + secret header)
  app.post("/api/webhook/telegram/:userId", async (req, res) => {
    try {
      const owner = await resolveTelegramWebhookOwner({
        pathToken: req.params.userId,
        secretHeader:
          typeof req.headers["x-telegram-bot-api-secret-token"] === "string"
            ? req.headers["x-telegram-bot-api-secret-token"]
            : undefined,
      });
      if (!owner) {
        return res.status(200).json({ ok: true });
      }
      const userId = owner.userId;
      const update = req.body;
      console.log(`[Inbound] Webhook received — channel: telegram`);

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
        if (!result.success || !result.contact) {
          console.error("[inbound-processing] Telegram processing returned incomplete state", {
            messageId: message.message_id,
            userId,
            errors: result.errors,
          });
        } else if (shouldRefreshAvatar(result.contact)) {
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

  // Legacy TikTok path — never trusts body.userId. Disabled (use /lead/:publicId).
  app.post("/api/webhook/tiktok/lead", async (_req, res) => {
    return res.status(404).json(WEBCHAT_GENERIC_NOT_FOUND);
  });

  app.post("/api/webhook/tiktok/lead/:publicId", async (req, res) => {
    try {
      const owner = await resolveTiktokLeadOwner(req.params.publicId);
      if (!owner) {
        return res.status(404).json(WEBCHAT_GENERIC_NOT_FOUND);
      }
      const userId = owner.userId;
      const { name, phone, email, source, metadata } = req.body || {};
      console.log("TikTok lead received:", { name, phone, email, source });

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

  // Web Chat widget endpoint for visitors — public ID only (never users.id).
  app.post("/api/webchat/:userId", async (req, res) => {
    try {
      const parsed = parseWebchatInboundBody(req.body);
      if (!parsed.ok) {
        return res.status(400).json({ error: "Invalid message" });
      }
      const access = await resolvePublicWidgetAccess(req, req.params.userId, {
        parentUrl: parsed.data.parentUrl,
        requireEnabled: true,
        strictOrigin: true,
      });
      if (!access.ok) {
        return res.status(access.status).json(access.body);
      }
      const allowed = await consumeWebchatRateLimits({
        req,
        widgetPublicId: access.owner.widgetPublicId,
        visitorId: parsed.data.visitorId,
      });
      if (!allowed) {
        return res.status(429).json(WEBCHAT_GENERIC_RATE_LIMIT);
      }

      const userId = access.owner.userId;
      const { visitorId, message, name, source, parentUrl, pageTitle, referrer } = parsed.data;
      const existing = await storage.getContactByChannelId(userId, "webchat", visitorId);
      const newContactOk = await consumeWebchatContactCap({
        widgetPublicId: access.owner.widgetPublicId,
        visitorId,
        isNewContact: !existing,
      });
      if (!newContactOk) {
        return res.status(429).json(WEBCHAT_GENERIC_RATE_LIMIT);
      }

      const matched = matchWidgetPageRule(access.owner.widgetSettings, parentUrl || "");
      let preferredChatbotFlowId: string | undefined;
      if (matched?.chatbotFlowId) {
        const ownedFlow = await getChatbotFlowForWorkspace(userId, matched.chatbotFlowId);
        if (ownedFlow?.isActive) preferredChatbotFlowId = ownedFlow.id;
      }
      const sanitized = sanitizeWebchatPageContextInput({
        parentUrl,
        pageTitle,
        referrer,
        matchedPageRule: matched?.urlContains,
      });
      const webchatPageContext = mergeWebchatPageContext(
        (existing?.webchatContext as Record<string, unknown>) || {},
        sanitized,
        new Date().toISOString(),
      );

      const webchatExternalId = `webchat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const { resolveWebchatLeadSource, resolveWebchatVisitorDisplayName } = await import(
        "@shared/agent/webchatLeadContext"
      );
      const webchatLeadSource = resolveWebchatLeadSource({ source, parentUrl });
      const contactName =
        (typeof name === "string" && name.trim()) ||
        resolveWebchatVisitorDisplayName(webchatLeadSource);

      const { channelService } = await import("../channelService");
      const result = await channelService.processIncomingMessage({
        userId,
        channel: "webchat",
        channelContactId: visitorId,
        contactName,
        content: message,
        contentType: "text",
        externalMessageId: webchatExternalId,
        webchatLeadSource,
        webchatPageContext,
        preferredChatbotFlowId,
      });

      if (result.success && result.contact && result.conversation && !result.deduped) {
        const { dispatchWebchatInboundWorkflows } = await import("../webchatInboundWorkflows");
        void dispatchWebchatInboundWorkflows({
          userId,
          contact: result.contact,
          conversation: result.conversation,
          messageBody: message,
          isNewConversation: Boolean(result.isNewConversation),
          chatbotWillFire: Boolean(result.chatbotWillFire),
        }).catch((err) => console.error("[WebchatWorkflows]", err instanceof Error ? err.message : err));

        void import("../webchatAiAutoReply").then(({ maybeRunWebchatServerAi }) =>
          maybeRunWebchatServerAi({
            userId,
            contact: result.contact!,
            conversation: result.conversation!,
            inboundMessageId: result.message?.id || webchatExternalId,
            inboundText: message,
            chatbotWillFire: Boolean(result.chatbotWillFire),
            bookingOwnsReply: result.turnOwner === "booking",
            widgetSettings: access.owner.widgetSettings,
          }).catch((err) => console.error("[WebchatServerAi]", err instanceof Error ? err.message : err)),
        );
      }

      res.json({
        success: true,
        visitorId,
        queued: false,
      });
    } catch (error) {
      console.error("[Inbound] Web chat error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  app.get("/api/webchat/:userId/settings", async (req, res) => {
    try {
      const hrefParam =
        typeof req.query.href === "string" ? req.query.href.slice(0, 4000) : "";
      const access = await resolvePublicWidgetAccess(req, req.params.userId, {
        parentUrl: hrefParam || undefined,
        requireEnabled: true,
        strictOrigin: false,
      });
      if (!access.ok) {
        return res.status(access.status).json(access.body);
      }
      const ws = access.owner.widgetSettings;
      const defaults = {
        color: "#10b981",
        welcomeMessage: "Hi! How can we help you today?",
      };
      const welcomeMessage =
        typeof ws.welcomeMessage === "string" && ws.welcomeMessage.trim()
          ? String(ws.welcomeMessage)
          : defaults.welcomeMessage;
      const matched = hrefParam ? matchWidgetPageRule(ws, hrefParam) : null;
      const chatGreeting =
        matched?.greeting && matched.greeting.trim() ? matched.greeting : welcomeMessage;
      const chatPrefill = matched?.prefilledMessage || "";
      res.json({
        color:
          typeof ws.color === "string" && ws.color.trim() ? String(ws.color) : defaults.color,
        welcomeMessage,
        businessName: access.owner.businessName || "",
        chatGreeting,
        chatPrefill,
        suggestedQuestions: matched?.suggestedQuestions || [],
        ctaLabel: matched?.ctaLabel || "",
        ctaUrl: matched?.ctaUrl || "",
      });
    } catch {
      return res.status(404).json(WEBCHAT_GENERIC_NOT_FOUND);
    }
  });

  app.get("/api/webchat/:userId/:visitorId/messages", async (req, res) => {
    try {
      const access = await resolvePublicWidgetAccess(req, req.params.userId, {
        requireEnabled: true,
        strictOrigin: false,
      });
      if (!access.ok) {
        return res.status(access.status).json(access.body);
      }
      const visitorId = String(req.params.visitorId || "").slice(0, 80);
      const contact = await storage.getContactByChannelId(access.owner.userId, "webchat", visitorId);
      if (!contact || contact.userId !== access.owner.userId) {
        return res.json([]);
      }

      const { touchWebchatVisitorSession } = await import("../webchatSession");
      void touchWebchatVisitorSession(contact.id);

      const conversation = await storage.getConversationByContactAndChannel(contact.id, "webchat");
      if (!conversation || conversation.userId !== access.owner.userId) {
        return res.json([]);
      }

      const messages = await storage.getMessages(conversation.id, 50);
      res.json(
        messages.filter((m) => m.direction !== "outbound" || m.status !== "failed"),
      );
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
