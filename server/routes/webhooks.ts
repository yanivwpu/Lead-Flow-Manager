import type { Express } from "express";
import { storage } from "../storage";
import {
  applyWebchatPublicCacheHeaders,
  consumeWebchatContactCap,
  consumeWebchatMediaGetRateLimits,
  consumeWebchatMediaUploadRateLimits,
  consumeWebchatPollRateLimits,
  consumeWebchatRateLimits,
  matchWidgetPageRule,
  parseWebchatInboundBody,
  resolvePublicWidgetAccess,
  sendWebchatPublicJson,
  WEBCHAT_GENERIC_NOT_FOUND,
  WEBCHAT_GENERIC_RATE_LIMIT,
} from "../webchatAccess";
import { isPublicWebchatVisitorId } from "@shared/webchatVisitorId";
import { mergeWebchatPageContext, parseHttpUrl, sanitizeWebchatPageContextInput } from "@shared/webchatPageContext";
import { resolveTelegramWebhookOwner, resolveTiktokLeadOwner } from "../ingressPublicTokens";
import { getChatbotFlowForWorkspace } from "../tenantOwnership";
import { parseIncomingWebhook, findUserByTwilioCredentials } from "../userTwilio";
import { handleCalendlyWebhook } from "../calendlyWebhook";
import { handleGrowthEngineSetupCalendlyWebhook } from "../growthEngineSetupCalendly";
import { handleMarketingDemoCalendlyWebhook } from "../marketingDemoCalendlyWebhook";
import { scheduleHubSpotAutoSync } from "../hubspotAutoSync";
import multer from "multer";
import { WEBCHAT_IMAGE_MAX_BYTES } from "@shared/webchatImagePolicy";
import { getRequestId } from "../authSecurity";
import { logWebchatInboundMediaError } from "../webchatVisitorMedia";
import {
  resolvePublicWebchatPresentation,
  toVisitorSafePublicWebchatPayload,
  widgetLogoAllowedHttpsHosts,
} from "@shared/webchatWidgetBranding";
import { buildWebchatChromeLayout } from "@shared/webchatWidgetChrome";
import { toVisitorSafeWidgetLauncher } from "@shared/webchatWidgetLauncher";
import { loadWebchatPublicNameFallbacks } from "../webchatPublicIdentity";

const webchatVisitorUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: WEBCHAT_IMAGE_MAX_BYTES, files: 1 },
});

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
      const { visitorId, message, source, parentUrl, pageTitle, referrer, locale } = parsed.data;
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
      const contactName = resolveWebchatVisitorDisplayName(webchatLeadSource);

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
        visitorLocale: locale,
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

        if (
          !result.chatbotWillFire &&
          result.turnOwner !== "booking" &&
          !result.awayMessageWillFire
        ) {
          void import("../webchatAiAutoReply").then(({ maybeRunWebchatServerAi }) =>
            maybeRunWebchatServerAi({
              userId,
              contact: result.contact!,
              conversation: result.conversation!,
              inboundMessageId: result.message?.id || webchatExternalId,
              inboundText: message,
              chatbotWillFire: Boolean(result.chatbotWillFire),
              bookingOwnsReply: result.turnOwner === "booking",
              crmFallbackOwnsReply: Boolean(result.awayMessageWillFire),
              widgetSettings: access.owner.widgetSettings,
            }).catch((err) => console.error("[WebchatServerAi]", err instanceof Error ? err.message : err)),
          );
        }
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
      const localeParam =
        typeof req.query.locale === "string" ? req.query.locale.trim().slice(0, 8) : "";
      const access = await resolvePublicWidgetAccess(req, req.params.userId, {
        parentUrl: hrefParam || undefined,
        requireEnabled: true,
        strictOrigin: false,
      });
      if (!access.ok) {
        return sendWebchatPublicJson(res, access.status, access.body);
      }
      const ws = access.owner.widgetSettings;
      const matched = hrefParam ? matchWidgetPageRule(ws, hrefParam) : null;
      const appOrigin =
        process.env.APP_URL ||
        `https://${(process.env.REPLIT_DOMAINS || "").split(",")[0]}`;
      const names = await loadWebchatPublicNameFallbacks(access.owner.userId);
      const presentation = resolvePublicWebchatPresentation({
        settings: ws,
        businessName: names.companyName,
        agentName: names.agentName,
        chatGreeting: matched?.greeting,
        chatPrefill: matched?.prefilledMessage || "",
        suggestedQuestions: matched?.suggestedQuestions || [],
        ctaLabel: matched?.ctaLabel || "",
        ctaUrl: matched?.ctaUrl || "",
        appOrigin,
        allowedLogoHttpsHosts: widgetLogoAllowedHttpsHosts([
          process.env.APP_URL,
          process.env.CLOUDFLARE_R2_PUBLIC_URL,
          process.env.REPLIT_DOMAINS,
        ]),
      });
      const chrome = buildWebchatChromeLayout(ws, {
        businessName: names.companyName,
        agentName: names.agentName,
        chatGreeting: matched?.greeting,
        appOrigin,
        allowedLogoHttpsHosts: widgetLogoAllowedHttpsHosts([
          process.env.APP_URL,
          process.env.CLOUDFLARE_R2_PUBLIC_URL,
          process.env.REPLIT_DOMAINS,
        ]),
      });
      const { sanitizeWebchatFormDefinition } = await import("@shared/webchatStructuredForm");
      const {
        resolveWidgetStaticLocale,
        widgetChromeCopyForLocale,
        widgetChromeDir,
        sanitizeWidgetLocaleParam,
      } = await import("@shared/webchatWidgetLocale");
      const { applyTenantWidgetCopyI18n, resolveLocalizedPageRuleGreeting } = await import(
        "@shared/webchatWidgetCopyI18n"
      );
      const locale = resolveWidgetStaticLocale({
        explicit: sanitizeWidgetLocaleParam(localeParam) || (typeof ws.widgetLocale === "string" ? ws.widgetLocale : ""),
        pathname: hrefParam,
      });
      const localizedPresentation = applyTenantWidgetCopyI18n(presentation, locale, ws.localized, {
        inputPlaceholder: typeof ws.inputPlaceholder === "string" ? ws.inputPlaceholder : "",
        offlineMessage: typeof ws.offlineMessage === "string" ? ws.offlineMessage : "",
      });
      if (matched?.greeting || matched?.localized) {
        localizedPresentation.chatGreeting = resolveLocalizedPageRuleGreeting({
          locale,
          greeting: matched.greeting,
          localized: matched.localized,
          fallback: localizedPresentation.welcomeMessage,
        });
      }
      const chromeCopy = widgetChromeCopyForLocale(locale);
      chromeCopy.inputPlaceholder = localizedPresentation.inputPlaceholder;
      chromeCopy.chatUnavailable = localizedPresentation.offlineMessage;
      const localizedLauncher = toVisitorSafeWidgetLauncher(ws, chrome, locale);
      if (localizedLauncher.launcherAriaLabel === "Open website chat" || !localizedLauncher.launcherAriaLabel) {
        localizedLauncher.launcherAriaLabel = chromeCopy.launcherAriaLabel;
      }
      const leadForm = sanitizeWebchatFormDefinition(ws.leadForm);
      return sendWebchatPublicJson(res, 200, {
        ...toVisitorSafePublicWebchatPayload(localizedPresentation),
        launcher: localizedLauncher,
        businessName: names.companyName,
        locale,
        dir: widgetChromeDir(locale),
        chromeCopy,
        ...(leadForm ? { leadForm } : {}),
      });
    } catch {
      return sendWebchatPublicJson(res, 404, WEBCHAT_GENERIC_NOT_FOUND);
    }
  });

  app.get("/api/webchat/:userId/:visitorId/messages", async (req, res) => {
    applyWebchatPublicCacheHeaders(res);
    try {
      const hrefParam =
        typeof req.query.href === "string" ? req.query.href.slice(0, 4000) : "";
      const access = await resolvePublicWidgetAccess(req, req.params.userId, {
        parentUrl: hrefParam || undefined,
        requireEnabled: true,
        strictOrigin: false,
      });
      if (!access.ok) {
        return sendWebchatPublicJson(res, access.status, access.body);
      }
      const visitorId = String(req.params.visitorId || "");
      if (!isPublicWebchatVisitorId(visitorId)) {
        return sendWebchatPublicJson(res, 200, []);
      }
      const allowed = await consumeWebchatPollRateLimits({
        req,
        widgetPublicId: access.owner.widgetPublicId,
        visitorId,
      });
      if (!allowed) {
        return sendWebchatPublicJson(res, 429, WEBCHAT_GENERIC_RATE_LIMIT);
      }
      const contact = await storage.getContactByChannelId(access.owner.userId, "webchat", visitorId);
      if (!contact || contact.userId !== access.owner.userId) {
        return sendWebchatPublicJson(res, 200, []);
      }

      const { touchWebchatVisitorSession } = await import("../webchatSession");
      void touchWebchatVisitorSession(contact.id);

      const conversation = await storage.getConversationByContactAndChannel(contact.id, "webchat");
      if (!conversation || conversation.userId !== access.owner.userId) {
        return sendWebchatPublicJson(res, 200, []);
      }

      const { toPublicWebchatMessages } = await import("@shared/webchatPublicMessages");
      const { buildSignedWebchatVisitorMediaUrl } = await import("../webchatVisitorMedia");
      const { isWebchatImageContentType } = await import("@shared/webchatImagePolicy");
      const messages = await storage.getMessages(conversation.id, 50);
      return sendWebchatPublicJson(res, 200, toPublicWebchatMessages(messages, (message) => {
        if (!isWebchatImageContentType(message.contentType)) return null;
        return buildSignedWebchatVisitorMediaUrl({
          widgetPublicId: access.owner.widgetPublicId,
          visitorId,
          messageId: message.id,
        });
      }));
    } catch (error) {
      console.error("Web chat messages error:", error);
      applyWebchatPublicCacheHeaders(res);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/webchat/:userId/:visitorId/media/:messageId", async (req, res) => {
    applyWebchatPublicCacheHeaders(res);
    try {
      const hrefParam =
        typeof req.query.href === "string" ? req.query.href.slice(0, 4000) : "";
      const access = await resolvePublicWidgetAccess(req, req.params.userId, {
        parentUrl: hrefParam || undefined,
        requireEnabled: true,
        strictOrigin: false,
      });
      if (!access.ok) {
        return sendWebchatPublicJson(res, access.status, access.body);
      }
      const visitorId = String(req.params.visitorId || "");
      if (!isPublicWebchatVisitorId(visitorId)) {
        return sendWebchatPublicJson(res, 404, WEBCHAT_GENERIC_NOT_FOUND);
      }
      const allowed = await consumeWebchatMediaGetRateLimits({
        req,
        widgetPublicId: access.owner.widgetPublicId,
        visitorId,
      });
      if (!allowed) {
        return sendWebchatPublicJson(res, 429, WEBCHAT_GENERIC_RATE_LIMIT);
      }
      const contact = await storage.getContactByChannelId(access.owner.userId, "webchat", visitorId);
      if (!contact || contact.userId !== access.owner.userId) {
        return sendWebchatPublicJson(res, 404, WEBCHAT_GENERIC_NOT_FOUND);
      }
      const conversation = await storage.getConversationByContactAndChannel(contact.id, "webchat");
      if (!conversation || conversation.userId !== access.owner.userId) {
        return sendWebchatPublicJson(res, 404, WEBCHAT_GENERIC_NOT_FOUND);
      }
      const message = await storage.getMessage(String(req.params.messageId || ""));
      if (
        !message ||
        message.userId !== access.owner.userId ||
        message.conversationId !== conversation.id ||
        message.contactId !== contact.id
      ) {
        return sendWebchatPublicJson(res, 404, WEBCHAT_GENERIC_NOT_FOUND);
      }
      const exp = Number(req.query.exp);
      const sig = typeof req.query.sig === "string" ? req.query.sig : "";
      const { verifyWebchatVisitorMedia, loadWebchatVisitorImageBytes } = await import(
        "../webchatVisitorMedia"
      );
      const { isWebchatImageContentType } = await import("@shared/webchatImagePolicy");
      if (
        !isWebchatImageContentType(message.contentType) ||
        !verifyWebchatVisitorMedia({
          widgetPublicId: access.owner.widgetPublicId,
          visitorId,
          messageId: message.id,
          expiresUnixSec: exp,
          signature: sig,
        })
      ) {
        return sendWebchatPublicJson(res, 404, WEBCHAT_GENERIC_NOT_FOUND);
      }
      const bytes = await loadWebchatVisitorImageBytes({
        userId: access.owner.userId,
        mediaUrl: message.mediaUrl,
        mediaStorageKey: message.mediaStorageKey,
      });
      if (!bytes) {
        return sendWebchatPublicJson(res, 404, WEBCHAT_GENERIC_NOT_FOUND);
      }
      res.setHeader("Content-Type", bytes.mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
      res.setHeader("Content-Disposition", "inline");
      return res.status(200).send(bytes.buffer);
    } catch {
      return sendWebchatPublicJson(res, 404, WEBCHAT_GENERIC_NOT_FOUND);
    }
  });

  app.post("/api/webchat/:userId/:visitorId/media", (req, res) => {
    webchatVisitorUpload.single("file")(req, res, async (err) => {
      try {
        if (err) {
          return sendWebchatPublicJson(res, 400, { error: "Invalid image" });
        }
        const parentUrlRaw = typeof req.body?.parentUrl === "string" ? req.body.parentUrl : "";
        const parentUrl = parentUrlRaw.trim().slice(0, 2000);
        if (parentUrl && !parseHttpUrl(parentUrl)) {
          return sendWebchatPublicJson(res, 400, { error: "Invalid message" });
        }
        const access = await resolvePublicWidgetAccess(req, req.params.userId, {
          parentUrl: parentUrl || undefined,
          requireEnabled: true,
          strictOrigin: true,
        });
        if (!access.ok) {
          return sendWebchatPublicJson(res, access.status, access.body);
        }
        const visitorId = String(req.params.visitorId || "");
        if (!isPublicWebchatVisitorId(visitorId)) {
          return sendWebchatPublicJson(res, 400, { error: "Invalid message" });
        }
        const allowed = await consumeWebchatMediaUploadRateLimits({
          req,
          widgetPublicId: access.owner.widgetPublicId,
          visitorId,
        });
        if (!allowed) {
          return sendWebchatPublicJson(res, 429, WEBCHAT_GENERIC_RATE_LIMIT);
        }
        const file = req.file;
        if (!file?.buffer) {
          return sendWebchatPublicJson(res, 400, { error: "Invalid image" });
        }
        const { prepareWebchatVisitorImage, storeWebchatVisitorImage } = await import(
          "../webchatVisitorMedia"
        );
        const prepared = await prepareWebchatVisitorImage({
          buffer: file.buffer,
          declaredMime: file.mimetype,
        });
        if (!prepared.ok) {
          return sendWebchatPublicJson(res, 400, { error: "Invalid image" });
        }
        const existing = await storage.getContactByChannelId(access.owner.userId, "webchat", visitorId);
        const newContactOk = await consumeWebchatContactCap({
          widgetPublicId: access.owner.widgetPublicId,
          visitorId,
          isNewContact: !existing,
        });
        if (!newContactOk) {
          return sendWebchatPublicJson(res, 429, WEBCHAT_GENERIC_RATE_LIMIT);
        }
        const stored = await storeWebchatVisitorImage({
          userId: access.owner.userId,
          buffer: prepared.buffer,
          mime: prepared.mime,
        });
        const caption =
          typeof req.body?.caption === "string" ? req.body.caption.trim().slice(0, 4000) : "";
        const source = typeof req.body?.source === "string" ? req.body.source.trim().slice(0, 80) : undefined;
        const uploadId =
          typeof req.body?.uploadId === "string"
            ? req.body.uploadId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)
            : "";
        const { resolveWebchatLeadSource, resolveWebchatVisitorDisplayName } = await import(
          "@shared/agent/webchatLeadContext"
        );
        const webchatLeadSource = resolveWebchatLeadSource({ source, parentUrl });
        const { channelService } = await import("../channelService");
        const result = await channelService.processIncomingMessage({
          userId: access.owner.userId,
          channel: "webchat",
          channelContactId: visitorId,
          contactName: resolveWebchatVisitorDisplayName(webchatLeadSource),
          content: caption,
          contentType: "image",
          mediaUrl: stored.mediaUrl,
          mediaStorageKey: stored.mediaStorageKey,
          mediaFilename: "photo",
          externalMessageId: uploadId ? `webchat_media_${visitorId}_${uploadId}` : undefined,
          webchatLeadSource,
        });
        if (!result.success) {
          return sendWebchatPublicJson(res, 500, { error: "Failed to process message" });
        }
        return sendWebchatPublicJson(res, 200, { success: true, visitorId });
      } catch (error) {
        logWebchatInboundMediaError({ error, requestId: getRequestId(req) });
        return sendWebchatPublicJson(res, 500, { error: "Failed to process message" });
      }
    });
  });

  app.post("/api/webchat/:userId/:visitorId/forms", async (req, res) => {
    try {
      const parentUrl =
        typeof req.body?.parentUrl === "string" ? req.body.parentUrl.trim().slice(0, 2000) : "";
      if (parentUrl && !parseHttpUrl(parentUrl)) {
        return sendWebchatPublicJson(res, 400, { error: "Invalid form" });
      }
      const access = await resolvePublicWidgetAccess(req, req.params.userId, {
        parentUrl: parentUrl || undefined,
        requireEnabled: true,
        strictOrigin: true,
      });
      if (!access.ok) {
        return sendWebchatPublicJson(res, access.status, access.body);
      }
      const visitorId = String(req.params.visitorId || "");
      if (!isPublicWebchatVisitorId(visitorId)) {
        return sendWebchatPublicJson(res, 400, { error: "Invalid form" });
      }
      const allowed = await consumeWebchatRateLimits({
        req,
        widgetPublicId: access.owner.widgetPublicId,
        visitorId,
      });
      if (!allowed) {
        return sendWebchatPublicJson(res, 429, WEBCHAT_GENERIC_RATE_LIMIT);
      }
      const contact = await storage.getContactByChannelId(access.owner.userId, "webchat", visitorId);
      if (!contact || contact.userId !== access.owner.userId) {
        return sendWebchatPublicJson(res, 404, WEBCHAT_GENERIC_NOT_FOUND);
      }
      const conversation = await storage.getConversationByContactAndChannel(contact.id, "webchat");
      if (!conversation || conversation.userId !== access.owner.userId) {
        return sendWebchatPublicJson(res, 404, WEBCHAT_GENERIC_NOT_FOUND);
      }
      const { sanitizeWebchatFormDefinition, validateWebchatFormSubmission, toInboxFormSubmission, WEBCHAT_FORM_PUBLIC_SUBMITTED_CONTENT } =
        await import("@shared/webchatStructuredForm");
      const formId = typeof req.body?.formId === "string" ? req.body.formId.trim().toLowerCase() : "";
      const messageId = typeof req.body?.messageId === "string" ? req.body.messageId.trim() : "";
      let form = sanitizeWebchatFormDefinition(
        (access.owner.widgetSettings as { leadForm?: unknown } | undefined)?.leadForm,
      );
      if (messageId) {
        const outbound = await storage.getMessage(messageId);
        if (
          outbound &&
          outbound.userId === access.owner.userId &&
          outbound.conversationId === conversation.id &&
          outbound.contactId === contact.id &&
          outbound.direction === "outbound"
        ) {
          const fromMessage = sanitizeWebchatFormDefinition(
            (outbound.templateVariables as { webchatForm?: unknown } | null)?.webchatForm,
          );
          if (fromMessage) form = fromMessage;
        }
      }
      if (form && formId && form.id !== formId) {
        const recent = await storage.getMessages(conversation.id, 50);
        const match = recent.find((row) => {
          if (row.direction !== "outbound" || row.contentType !== "form") return false;
          const def = sanitizeWebchatFormDefinition(
            (row.templateVariables as { webchatForm?: unknown } | null)?.webchatForm,
          );
          return def?.id === formId;
        });
        form = match
          ? sanitizeWebchatFormDefinition(
              (match.templateVariables as { webchatForm?: unknown } | null)?.webchatForm,
            )
          : null;
      }
      if (!form) {
        return sendWebchatPublicJson(res, 400, { error: "Invalid form" });
      }
      const validated = validateWebchatFormSubmission(form, req.body?.values);
      if (!validated.ok) {
        return sendWebchatPublicJson(res, 400, { error: validated.error });
      }
      const submission = toInboxFormSubmission(form, validated.values);
      const { applyWebchatFormToContact } = await import("../webchatFormService");
      await applyWebchatFormToContact({
        userId: access.owner.userId,
        contact,
        form,
        values: validated.values,
        submission,
        context: {
          conversationId: conversation.id,
          widgetPublicId: access.owner.widgetPublicId,
          formId: form.id,
          visitorId,
        },
      });
      const { channelService } = await import("../channelService");
      const result = await channelService.processIncomingMessage({
        userId: access.owner.userId,
        channel: "webchat",
        channelContactId: visitorId,
        contactName: contact.name,
        content: WEBCHAT_FORM_PUBLIC_SUBMITTED_CONTENT,
        contentType: "form_result",
        templateVariables: { webchatFormSubmission: submission },
        externalMessageId: `webchat_form_${visitorId}_${form.id}`,
      });
      if (result.success && result.contact && result.conversation && !result.deduped) {
        const { dispatchWebchatInboundWorkflows } = await import("../webchatInboundWorkflows");
        void dispatchWebchatInboundWorkflows({
          userId: access.owner.userId,
          contact: result.contact,
          conversation: result.conversation,
          messageBody: result.message?.content || "Form submitted",
          isNewConversation: Boolean(result.isNewConversation),
          chatbotWillFire: Boolean(result.chatbotWillFire),
        }).catch((err) => console.error("[WebchatWorkflows]", err instanceof Error ? err.message : err));
      }
      return sendWebchatPublicJson(res, 200, { success: true });
    } catch (error) {
      console.error("[Inbound] Web chat form error:", error);
      return sendWebchatPublicJson(res, 500, { error: "Failed to process form" });
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
