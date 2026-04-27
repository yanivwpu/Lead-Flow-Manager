import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { db } from "../drizzle/db";
import { messages as messagesTable, contacts as contactsTable } from "@shared/schema";
import { eq, and, or, isNotNull, ilike, desc } from "drizzle-orm";
import { registerContactRoutes } from "./routes/contacts";
import { registerConversationRoutes } from "./routes/conversations";
import { registerChannelRoutes } from "./routes/channels";
import { registerTemplateRoutes as registerAutomationTemplateRoutes } from "./routes/templates";
import { registerWebhookRoutes } from "./routes/webhooks";
import {
  getWhatsAppAvailability,
  sendWhatsAppMessage,
  sendWhatsAppMedia,
  disconnectWhatsAppProvider,
  getProviderStatus,
} from "./whatsappService";
import { storage } from "./storage";
import { insertChatSchema, insertRegisteredPhoneSchema, insertSalespersonSchema, insertDemoBookingSchema, PLAN_LIMITS, type SubscriptionPlan } from "@shared/schema";
import { z } from "zod";
import { getVapidPublicKey } from "./notifications";
import {
  sendUserWhatsAppMessage,
  parseIncomingWebhook,
  parseStatusWebhook,
  findOrCreateChatByPhone,
  findUserByTwilioCredentials,
  connectUserTwilio,
  validateTwilioCredentials,
  encryptCredential,
  decryptCredential,
  isEncrypted,
  type WhatsAppMessage,
  type TwilioCredentials,
} from "./userTwilio";
import {
  sendMetaWhatsAppMessage,
  connectUserMeta,
  validateMetaCredentials,
  switchProvider,
  parseMetaIncomingWebhook,
  parseMetaStatusWebhook,
  findUserByMetaPhoneNumberId,
  getMetaMessageTemplates,
  markMessageAsRead,
  verifyMetaWebhookSignature,
  decryptCredential as decryptMetaCredential,
  isEncrypted as isMetaEncrypted,
  getMediaUrl,
  downloadMedia,
  type MetaCredentials,
} from "./userMeta";
import multer from "multer";
import path from "path";
import fs from "fs";
import { subscriptionService } from "./subscriptionService";
import { resolveStripeCheckoutRedirectOrigin } from "./stripeCheckoutRedirectBase";
import { getAppOrigin } from "./urlOrigins";
import { getMarketingOrigin } from "./urlOrigins";
import { sendWelcomeEmail, sendContactFormEmail, sendDemoBookingNotification, sendDemoConfirmationEmail, sendSalespersonWelcomeEmail } from "./email";
import bcrypt from "bcryptjs";
import { triggerNewChatWorkflows, triggerKeywordWorkflows, triggerTagChangeWorkflows, runW2QualificationEngine, runServiceRoutingEngine } from "./workflowEngine";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import shopifyRoutes from "./shopifyRoutes";
import ghlRoutes from "./ghlRoutes";

import { registerTemplateRoutes } from "./templateRoutes";
import { registerMediaRoutes } from "./routes/media";

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

function calculateNextDueDate(
  frequency: string, 
  timeOfDay: string = "09:00", 
  dayOfWeek?: number | null, 
  dayOfMonth?: number | null
): Date {
  const now = new Date();
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  let nextDue = new Date(now);
  nextDue.setHours(hours, minutes, 0, 0);
  
  switch (frequency) {
    case "daily":
      if (nextDue <= now) {
        nextDue.setDate(nextDue.getDate() + 1);
      }
      break;
    case "weekly":
      const targetDay = dayOfWeek ?? 1; // Default to Monday
      const currentDay = nextDue.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0 || (daysUntil === 0 && nextDue <= now)) {
        daysUntil += 7;
      }
      nextDue.setDate(nextDue.getDate() + daysUntil);
      break;
    case "biweekly":
      const biweeklyDay = dayOfWeek ?? 1;
      const currDay = nextDue.getDay();
      let biweeklyDaysUntil = biweeklyDay - currDay;
      if (biweeklyDaysUntil <= 0 || (biweeklyDaysUntil === 0 && nextDue <= now)) {
        biweeklyDaysUntil += 14;
      }
      nextDue.setDate(nextDue.getDate() + biweeklyDaysUntil);
      break;
    case "monthly":
      const targetDate = dayOfMonth ?? 1;
      nextDue.setDate(targetDate);
      if (nextDue <= now) {
        nextDue.setMonth(nextDue.getMonth() + 1);
      }
      break;
    default:
      nextDue.setDate(nextDue.getDate() + 1);
  }
  
  return nextDue;
}

// Current agreement versions - update these when agreements change
// Partners/salespeople must re-accept if their stored version differs
export const AGREEMENT_VERSIONS = {
  partner_referral: "2026-02-14",
  salesperson_commission: "2026-01-26",
} as const;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Object storage routes for file uploads
  registerObjectStorageRoutes(app);

  // Shopify integration routes
  app.use('/api/shopify', shopifyRoutes);

  // LeadConnector integration routes
  app.use('/api/ext', ghlRoutes);

  // Contact form endpoint (public - no auth required)
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, message } = req.body;
      
      if (!name || !email || !message) {
        return res.status(400).json({ error: "Name, email, and message are required" });
      }
      
      const success = await sendContactFormEmail(name, email, message);
      if (success) {
        res.json({ message: "Your message has been sent. We'll get back to you soon!" });
      } else {
        res.status(500).json({ error: "Failed to send message. Please try again later." });
      }
    } catch (error) {
      console.error("Error sending contact form:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Help center feedback endpoint (public - no auth required)
  app.post("/api/help-feedback", async (req, res) => {
    try {
      const { articleId, articleTitle, feedback } = req.body;
      
      if (!articleId || !articleTitle || !feedback) {
        return res.status(400).json({ error: "Article ID, title, and feedback are required" });
      }
      
      const { sendHelpCenterFeedback } = await import("./email");
      const success = await sendHelpCenterFeedback(articleId, articleTitle, feedback);
      if (success) {
        res.json({ message: "Thank you for your feedback!" });
      } else {
        res.json({ message: "Feedback received (email delivery pending)" });
      }
    } catch (error) {
      console.error("Error sending help feedback:", error);
      res.status(500).json({ error: "Failed to send feedback" });
    }
  });

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

  // Export chats to CSV
  app.get("/api/chats/export", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const chats = await storage.getChats(req.user.id);
      // Phase E Step 2: overlay CRM fields from contacts (authoritative source)
      const contactsForExport = await storage.getContacts(req.user.id);
      const contactCrmByPhone = new Map(
        contactsForExport
          .filter(c => c.whatsappId || c.phone)
          .map(c => [(c.whatsappId || c.phone || '').replace(/\D/g, ''), c])
      );
      const headers = ['Name', 'Phone', 'Tag', 'Pipeline Stage', 'Status', 'Notes', 'Follow-up', 'Last Message', 'Created'];
      const rows = chats.map((chat: any) => {
        const norm = (chat.whatsappPhone || '').replace(/\D/g, '');
        const ct = norm ? contactCrmByPhone.get(norm) : undefined;
        return [
          chat.name || '',
          chat.whatsappPhone || '',
          (ct?.tag ?? chat.tag) || '',
          (ct?.pipelineStage ?? chat.pipelineStage) || '',
          chat.status || '',
          ((ct?.notes ?? chat.notes) || '').replace(/"/g, '""'),
          (ct?.followUp ?? chat.followUp) || '',
          (chat.lastMessage || '').replace(/"/g, '""'),
          chat.createdAt ? new Date(chat.createdAt).toISOString().split('T')[0] : ''
        ];
      });
      
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map((cell: string) => `"${cell}"`).join(','))
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=chats-export.csv');
      res.send(csv);
    } catch (error) {
      console.error("Error exporting chats:", error);
      res.status(500).json({ error: "Failed to export chats" });
    }
  });

  // Import chats from CSV
  app.post("/api/chats/import", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { contacts } = req.body;
      if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: "No contacts provided" });
      }
      
      let imported = 0;
      let skipped = 0;
      
      for (const contact of contacts) {
        if (!contact.name && !contact.phone) {
          skipped++;
          continue;
        }
        
        try {
          await storage.createChat({
            userId: req.user.id,
            name: contact.name || 'Unknown',
            whatsappPhone: contact.phone || null,
            tag: contact.tag || 'New',
            pipelineStage: contact.pipelineStage || 'Lead',
            notes: contact.notes || '',
            status: 'open',
            avatar: '',
            lastMessage: '',
            time: new Date().toISOString(),
            unread: 0,
            messages: [],
          });
          await subscriptionService.incrementConversationUsage(req.user.id);
          imported++;
        } catch (err) {
          console.error("Error importing contact:", err);
          skipped++;
        }
      }
      
      res.json({ imported, skipped, total: contacts.length });
    } catch (error) {
      console.error("Error importing chats:", error);
      res.status(500).json({ error: "Failed to import chats" });
    }
  });

  // Get team inbox - all chats across team members (Pro feature)
  app.get("/api/chats/team", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.teamInbox) {
        return res.status(403).json({ error: "Team inbox requires a paid plan", upgradeRequired: true });
      }
      
      const teamChats = await storage.getTeamChats(req.user.id);
      res.json(teamChats);
    } catch (error) {
      console.error("Error fetching team chats:", error);
      res.status(500).json({ error: "Failed to fetch team chats" });
    }
  });

  // Assign chat to team member (Pro feature)
  app.patch("/api/chats/:id/assign", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.assignmentEnabled) {
        return res.status(403).json({ error: "Conversation assignment is a Pro feature", upgradeRequired: true });
      }
      
      const { assignedTo, status } = req.body;
      const chat = await storage.getChat(req.params.id);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }
      
      const updates: any = {};
      if (assignedTo !== undefined) updates.assignedTo = assignedTo;
      if (status !== undefined) updates.status = status;
      
      const updatedChat = await storage.updateChat(req.params.id, updates);
      res.json(updatedChat);
    } catch (error) {
      console.error("Error assigning chat:", error);
      res.status(500).json({ error: "Failed to assign chat" });
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

      // Enforce monthly conversation limit before creating
      const limitCheck = await subscriptionService.checkAndDecrementConversation(req.user.id);
      if (!limitCheck.allowed) {
        return res.status(429).json({ 
          code: "CONVERSATION_LIMIT",
          error: "You've reached your monthly conversation limit",
          message: `Your ${limitCheck.planName} plan includes ${limitCheck.limit} conversations per month. Upgrade your plan or wait until your next billing cycle.`,
          limit: limitCheck.limit,
          used: limitCheck.used,
          planName: limitCheck.planName,
          remaining: 0,
          upgradeRequired: true 
        });
      }

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
  
  // Get activity timeline for a chat
  app.get("/api/chats/:id/timeline", async (req, res) => {
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
      
      // Build timeline from chat messages
      const messages = Array.isArray(chat.messages) ? chat.messages : [];
      const timeline = messages.map((msg: any, index: number) => {
        // Try to parse the time, fallback to current time if invalid
        let createdAt = new Date().toISOString();
        if (msg.timestamp) {
          createdAt = new Date(msg.timestamp).toISOString();
        } else if (msg.createdAt) {
          createdAt = new Date(msg.createdAt).toISOString();
        }
        // msg.time is usually just "10:45 AM" format, not a full date
        
        return {
          id: `msg-${index}`,
          eventType: msg.sender === "user" ? "message_sent" : "message_received",
          eventData: { 
            message: msg.content || msg.text,
            sender: msg.sender,
            time: msg.time || ""
          },
          actorType: msg.sender === "user" ? "user" : "contact",
          createdAt
        };
      });
      
      res.json(timeline.reverse());
    } catch (error) {
      console.error("Error fetching chat timeline:", error);
      res.status(500).json({ error: "Failed to fetch timeline" });
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

  // Update user language preference
  app.patch("/api/user/language", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { language } = req.body;
      if (!language || !['en', 'he', 'es', 'ar'].includes(language)) {
        return res.status(400).json({ error: "Invalid language" });
      }
      const updated = await storage.updateUser(req.user.id, { language });
      res.json({ success: true, language: updated?.language });
    } catch (error) {
      console.error("Error updating language:", error);
      res.status(500).json({ error: "Failed to update language" });
    }
  });

  // Complete onboarding tour
  app.post("/api/user/complete-onboarding", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      await storage.updateUser(req.user.id, { onboardingCompleted: true });
      res.json({ success: true });
    } catch (error) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ error: "Failed to complete onboarding" });
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

  // Update user avatar
  app.patch("/api/users/avatar", async (req, res) => {
    try {
      console.log("[AVATAR] PATCH /api/users/avatar called");
      console.log("[AVATAR] req.isAuthenticated():", req.isAuthenticated());
      console.log("[AVATAR] req.user:", req.user ? { id: req.user.id, email: req.user.email } : "null");
      console.log("[AVATAR] Session ID:", req.sessionID);
      console.log("[AVATAR] Cookies:", req.headers.cookie);

      if (!req.user) {
        console.error("[AVATAR] Unauthorized: req.user is null");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { avatarUrl } = req.body;
      
      if (!avatarUrl) {
        return res.status(400).json({ error: "Avatar URL is required" });
      }

      // Validate that it's a data URL or a valid URL
      if (!avatarUrl.startsWith('data:image/') && !avatarUrl.startsWith('http') && !avatarUrl.startsWith('/') && !avatarUrl.includes('attached_assets')) {
        return res.status(400).json({ error: "Invalid avatar format" });
      }

      // Limit size (max ~4MB for base64 string to be safe for 2MB actual file)
      if (avatarUrl.length > 5000000) {
        return res.status(400).json({ error: "Image too large. Please use an image under 2MB" });
      }

      const updated = await storage.updateUser(req.user.id, { avatarUrl });
      res.json({ avatarUrl: updated?.avatarUrl });
    } catch (error) {
      console.error("Error updating avatar:", error);
      res.status(500).json({ error: "Failed to update avatar" });
    }
  });

  // ============= Auto-Reply Settings Endpoints =============
  
  // Get auto-reply settings
  app.get("/api/users/auto-reply-settings", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        businessHoursEnabled: user.businessHoursEnabled || false,
        businessHoursStart: user.businessHoursStart || "09:00",
        businessHoursEnd: user.businessHoursEnd || "17:00",
        businessDays: user.businessDays || [1, 2, 3, 4, 5],
        awayMessageEnabled: user.awayMessageEnabled || false,
        awayMessage: user.awayMessage || "",
        autoReplyEnabled: user.autoReplyEnabled || false,
        autoReplyMessage: user.autoReplyMessage || "",
      });
    } catch (error) {
      console.error("Error fetching auto-reply settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Update auto-reply settings
  app.patch("/api/users/auto-reply-settings", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { 
        businessHoursEnabled, 
        businessHoursStart, 
        businessHoursEnd, 
        businessDays,
        awayMessageEnabled,
        awayMessage,
        autoReplyEnabled,
        autoReplyMessage 
      } = req.body;
      
      const updates: any = {};
      if (businessHoursEnabled !== undefined) updates.businessHoursEnabled = businessHoursEnabled;
      if (businessHoursStart !== undefined) updates.businessHoursStart = businessHoursStart;
      if (businessHoursEnd !== undefined) updates.businessHoursEnd = businessHoursEnd;
      if (businessDays !== undefined) updates.businessDays = businessDays;
      if (awayMessageEnabled !== undefined) updates.awayMessageEnabled = awayMessageEnabled;
      if (awayMessage !== undefined) updates.awayMessage = awayMessage;
      if (autoReplyEnabled !== undefined) updates.autoReplyEnabled = autoReplyEnabled;
      if (autoReplyMessage !== undefined) updates.autoReplyMessage = autoReplyMessage;

      await storage.updateUser(req.user.id, updates);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating auto-reply settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // ============= Chatbot Widget Script =============
  // Served as JavaScript to third-party websites via the embed snippet.
  // Mobile-optimised: deferred init, lazy iframe, touch-friendly, minimal DOM footprint.
  app.get("/widget.js", async (req, res) => {
    const widgetId = req.query.id as string | undefined;
    const origin = process.env.APP_URL ||
      `https://${(process.env.REPLIT_DOMAINS || "").split(",")[0]}`;

    // Fetch widget settings if widgetId is known (best-effort, skip on error)
    let color = "#25D366";
    let position = "right";
    let welcomeMessage = "Hi there! How can we help you today?";
    let enabled = true;

    if (widgetId) {
      try {
        const widgetUser = await storage.getUser(widgetId);
        const ws = (widgetUser?.widgetSettings as any) || {};
        if (ws.enabled === false) { enabled = false; }
        if (ws.color) color = ws.color;
        if (ws.position) position = ws.position;
        if (ws.welcomeMessage) welcomeMessage = ws.welcomeMessage;
      } catch { /* non-fatal */ }
    }

    const js = enabled ? `
(function() {
  'use strict';
  var COLOR = ${JSON.stringify(color)};
  var POSITION = ${JSON.stringify(position)};
  var WELCOME = ${JSON.stringify(welcomeMessage)};
  var WIDGET_ID = ${JSON.stringify(widgetId || "")};
  var ORIGIN = ${JSON.stringify(origin)};

  // Guard against double-init
  if (window.__wcwInit) return;
  window.__wcwInit = true;

  var btn, bubble, iframe, iframeLoaded = false;

  function px(n) { return n + 'px'; }

  function posStyle() {
    return POSITION === 'left'
      ? 'left:20px;right:auto;'
      : 'right:20px;left:auto;';
  }

  function createButton() {
    btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Open chat');
    btn.setAttribute('data-wcw', 'toggle');
    btn.style.cssText = [
      'position:fixed;bottom:20px;' + posStyle(),
      'width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;',
      'background:' + COLOR + ';color:#fff;',
      'box-shadow:0 4px 16px rgba(0,0,0,.25);',
      'display:flex;align-items:center;justify-content:center;',
      'z-index:2147483647;transition:transform .15s;',
      'touch-action:manipulation;-webkit-tap-highlight-color:transparent;',
    ].join('');
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    btn.addEventListener('click', toggleChat);
    btn.addEventListener('mouseenter', function() { btn.style.transform = 'scale(1.1)'; });
    btn.addEventListener('mouseleave', function() { btn.style.transform = 'scale(1)'; });
    document.body.appendChild(btn);
  }

  function createBubble() {
    bubble = document.createElement('div');
    bubble.style.cssText = [
      'position:fixed;bottom:90px;' + posStyle(),
      'background:#fff;border-radius:12px;',
      'box-shadow:0 4px 20px rgba(0,0,0,.18);',
      'padding:12px 16px;max-width:240px;font-size:13px;',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;',
      'z-index:2147483646;opacity:0;pointer-events:none;',
      'transition:opacity .2s;line-height:1.4;',
    ].join('');
    bubble.textContent = WELCOME;
    document.body.appendChild(bubble);
    // Show bubble briefly after 2 s
    setTimeout(function() {
      bubble.style.opacity = '1';
      bubble.style.pointerEvents = 'auto';
      setTimeout(function() {
        if (!iframeLoaded) {
          bubble.style.opacity = '0';
          bubble.style.pointerEvents = 'none';
        }
      }, 5000);
    }, 2000);
  }

  function loadIframe() {
    if (iframeLoaded) return;
    iframeLoaded = true;
    var container = document.createElement('div');
    var side = POSITION === 'left' ? 'left:20px;right:auto;' : 'right:20px;left:auto;';
    container.style.cssText = [
      'position:fixed;bottom:90px;' + side,
      'width:min(360px,calc(100vw - 32px));',
      'height:min(560px,calc(100vh - 110px));',
      'border-radius:16px;overflow:hidden;',
      'box-shadow:0 8px 32px rgba(0,0,0,.22);',
      'z-index:2147483646;',
      'transform:scale(0.9) translateY(16px);opacity:0;',
      'transition:transform .2s,opacity .2s;',
    ].join('');
    container.setAttribute('data-wcw', 'frame-container');

    var frame = document.createElement('iframe');
    frame.src = ORIGIN + '/widget-frame/' + WIDGET_ID;
    frame.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    frame.setAttribute('loading', 'lazy');
    frame.setAttribute('title', 'Chat');
    frame.setAttribute('allow', 'clipboard-write');
    container.appendChild(frame);
    document.body.appendChild(container);

    // Animate in
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        container.style.transform = 'scale(1) translateY(0)';
        container.style.opacity = '1';
      });
    });

    return container;
  }

  var chatOpen = false;
  var frameContainer = null;

  function toggleChat() {
    chatOpen = !chatOpen;
    if (chatOpen) {
      btn.setAttribute('aria-label', 'Close chat');
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      bubble.style.opacity = '0';
      bubble.style.pointerEvents = 'none';
      if (!frameContainer) {
        frameContainer = loadIframe();
      } else {
        frameContainer.style.display = 'block';
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            frameContainer.style.transform = 'scale(1) translateY(0)';
            frameContainer.style.opacity = '1';
          });
        });
      }
    } else {
      btn.setAttribute('aria-label', 'Open chat');
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
      if (frameContainer) {
        frameContainer.style.transform = 'scale(0.9) translateY(16px)';
        frameContainer.style.opacity = '0';
        setTimeout(function() {
          if (frameContainer && !chatOpen) frameContainer.style.display = 'none';
        }, 200);
      }
    }
  }

  function init() {
    if (!document.body) return;
    createButton();
    createBubble();
  }

  // Defer initialisation until browser is idle (mobile perf)
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(function() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    }, { timeout: 3000 });
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 300);
    }
  }
})();
` : '/* widget disabled */';

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(js);
  });

  // ============= Website Widget Settings Endpoints =============
  
  // Get widget settings
  app.get("/api/widget-settings", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const defaultSettings = {
        enabled: true,
        color: "#25D366",
        welcomeMessage: "Hi there! How can we help you today?",
        position: "right",
        showOnMobile: true,
      };
      res.json(user.widgetSettings || defaultSettings);
    } catch (error) {
      console.error("Error fetching widget settings:", error);
      res.status(500).json({ error: "Failed to fetch widget settings" });
    }
  });

  // Update widget settings
  const widgetSettingsSchema = z.object({
    enabled: z.boolean().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    welcomeMessage: z.string().max(500).optional(),
    position: z.enum(["left", "right"]).optional(),
    showOnMobile: z.boolean().optional(),
  });
  
  app.patch("/api/widget-settings", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const validation = widgetSettingsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid widget settings", details: validation.error.errors });
      }
      
      const { enabled, color, welcomeMessage, position, showOnMobile } = validation.data;
      
      const user = await storage.getUser(req.user.id);
      const currentSettings = (user?.widgetSettings as any) || {};
      
      const newSettings = {
        ...currentSettings,
        ...(enabled !== undefined && { enabled }),
        ...(color !== undefined && { color }),
        ...(welcomeMessage !== undefined && { welcomeMessage }),
        ...(position !== undefined && { position }),
        ...(showOnMobile !== undefined && { showOnMobile }),
      };

      await storage.updateUser(req.user.id, { widgetSettings: newSettings });
      res.json(newSettings);
    } catch (error) {
      console.error("Error updating widget settings:", error);
      res.status(500).json({ error: "Failed to update widget settings" });
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

      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      // Route to the active provider via the central WhatsApp service
      const sendResult = await sendWhatsAppMessage(req.user.id, chat.whatsappPhone, message);
      if (!sendResult.success) {
        return res.status(400).json({
          error: sendResult.error,
          code: sendResult.provider === "meta" ? "META_NOT_CONNECTED" : "TWILIO_NOT_CONNECTED",
        });
      }
      const messageId = sendResult.messageId;

      // Track conversation window (24-hour)
      await subscriptionService.trackConversationWindow(req.user.id, chat.id, chat.whatsappPhone);

      // Track usage with 5% markup
      const costs = calculateCostWithMarkup(TWILIO_BASE_COST_PER_MESSAGE);
      await storage.recordMessageUsage({
        userId: req.user.id,
        chatId: chat.id,
        direction: "outbound",
        messageType: "text",
        twilioSid: messageId,
        twilioCost: costs.twilioCost,
        markupPercent: costs.markupPercent,
        totalCost: costs.totalCost,
      });

      const newMessage: WhatsAppMessage = {
        id: messageId,
        text: message,
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        sent: true,
        sender: "me",
        status: "sent",
        twilioSid: messageId,
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

  // Configure multer for media uploads
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
      }
    }),
    limits: { fileSize: 16 * 1024 * 1024 }, // 16MB max
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Allowed: images (JPEG, PNG, GIF, WebP) and PDF'));
      }
    }
  });

  // Send WhatsApp media message
  app.post("/api/chats/send-media", upload.single('file'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { chatId, phone } = req.body;
      if (!chatId || !phone) {
        return res.status(400).json({ error: "Chat ID and phone are required" });
      }

      const chat = await storage.getChat(chatId);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }
      if (chat.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Check subscription limits
      const canSend = await subscriptionService.canSendMessage(req.user.id);
      if (!canSend.allowed) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ 
          error: canSend.reason, 
          code: "PLAN_LIMIT",
          upgradeRequired: true 
        });
      }

      const availability = await getWhatsAppAvailability(req.user.id);
      if (!availability.available) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: availability.message || "WhatsApp not connected",
          code: availability.provider === "meta" ? "META_NOT_CONNECTED" : "TWILIO_NOT_CONNECTED",
        });
      }

      // Serve the uploaded file at a publicly reachable URL
      const appUrl = getAppOrigin();
      const mediaUrl = `${appUrl}/uploads/${path.basename(req.file.path)}`;
      const mediaType = req.file.mimetype.startsWith('image/') ? "image"
        : req.file.mimetype.startsWith('video/') ? "video"
        : req.file.mimetype.startsWith('audio/') ? "audio"
        : "document";

      const sendResult = await sendWhatsAppMedia(req.user.id, phone, mediaUrl, mediaType as any);
      if (!sendResult.success) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: sendResult.error, code: "SEND_FAILED" });
      }

      // Track usage
      const mediaCost = 0.01; // Higher cost for media
      const costs = calculateCostWithMarkup(mediaCost);
      await storage.recordMessageUsage({
        userId: req.user.id,
        chatId: chat.id,
        direction: "outbound",
        messageType: mediaType,
        twilioSid: sendResult.messageId,
        twilioCost: costs.twilioCost,
        markupPercent: costs.markupPercent,
        totalCost: costs.totalCost,
      });

      const newMessage: WhatsAppMessage = {
        id: sendResult.messageId,
        text: req.file.mimetype.startsWith('image/') ? '[Image]' : `[File: ${req.file.originalname}]`,
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        sent: true,
        sender: "me",
        status: "sent",
        twilioSid: sendResult.messageId,
      };

      const messages = (chat.messages as WhatsAppMessage[]) || [];
      messages.push(newMessage);

      await storage.updateChat(chat.id, {
        messages,
        lastMessage: newMessage.text,
        time: newMessage.time,
      });

      // Clean up file after a delay (Twilio needs time to fetch it)
      setTimeout(() => {
        try {
          if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (e) {
          console.error('Error cleaning up uploaded file:', e);
        }
      }, 60000); // Clean up after 1 minute

      res.json({ success: true, message: newMessage });
    } catch (error: any) {
      // Clean up file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error("Error sending media:", error);
      res.status(500).json({ error: error.message || "Failed to send media" });
    }
  });

  // ============= Twilio Connection Endpoints =============

  // Get Twilio connection status
  app.get("/api/twilio/status", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const status = await getProviderStatus(req.user.id);
      res.json(status.twilio);
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

      const webhookBaseUrl = getAppOrigin();
      const result = await connectUserTwilio(req.user.id, credentials, webhookBaseUrl);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // WhatsApp webhooks cannot be auto-configured via the Twilio REST API
      // (the API only exposes SMS smsUrl, not the separate WhatsApp webhook).
      // Always return the webhook URLs and direct the user to set them manually.
      console.log(`[Twilio Connect] User ${req.user.id} connected. Webhook URL: ${webhookBaseUrl}/api/webhook/twilio/incoming`);

      res.json({ 
        success: true, 
        message: "Twilio connected. Configure the webhook URL below in your Twilio Console to receive inbound WhatsApp messages.",
        webhookUrl: `${webhookBaseUrl}/api/webhook/twilio/incoming`,
        statusCallbackUrl: `${webhookBaseUrl}/api/webhook/twilio/status`,
        webhooksConfigured: false,
        manualSetupRequired: true,
        manualSetupInstructions: "In your Twilio Console go to Messaging → Senders → WhatsApp Senders → select your sender → set the Incoming Messages webhook URL to the webhookUrl above.",
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

      await disconnectWhatsAppProvider(req.user.id, "twilio");
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

  // ============= Meta WhatsApp Business API Connection Endpoints =============

  // Get Meta connection status
  app.get("/api/meta/status", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const status = await getProviderStatus(req.user.id);
      res.json({
        ...status.meta,
        // legacy shape kept for backwards-compat with frontend
        connected: status.meta.connected,
        phoneNumber: status.meta.phoneNumberId
          ? `Meta ID: ${status.meta.phoneNumberId.slice(0, 10)}...`
          : null,
        activeProvider: status.activeProvider,
        twilioConnected: status.twilio.connected,
      });
    } catch (error) {
      console.error("Error getting Meta status:", error);
      res.status(500).json({ error: "Failed to get Meta status" });
    }
  });

  // Connect Meta WhatsApp Business API
  app.post("/api/meta/connect", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { accessToken, phoneNumberId, businessAccountId, appSecret, webhookVerifyToken } = req.body;

      if (!accessToken || !phoneNumberId || !businessAccountId) {
        return res.status(400).json({ 
          error: "Access Token, Phone Number ID, and Business Account ID are required" 
        });
      }

      // In production, App Secret is required for webhook signature verification.
      // Without it, every inbound webhook would be rejected with 403.
      if (process.env.NODE_ENV === "production" && !appSecret) {
        return res.status(400).json({
          error: "App Secret is required in production. Find it in your Meta app dashboard under App Settings → Basic.",
          field: "appSecret",
        });
      }

      const credentials: MetaCredentials = {
        accessToken,
        phoneNumberId,
        businessAccountId,
        appSecret,
        webhookVerifyToken,
      };

      const result = await connectUserMeta(req.user.id, credentials);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      const webhookBaseUrl = getAppOrigin();
      
      // Get the actual stored verify token to return to user
      const updatedUser = await storage.getUser(req.user.id);
      
      res.json({ 
        success: true, 
        message: "Meta WhatsApp Business API connected successfully!",
        phoneNumber: result.phoneNumber,
        webhookUrl: `${webhookBaseUrl}/api/webhook/meta`,
        webhookVerifyToken: updatedUser?.metaWebhookVerifyToken || webhookVerifyToken,
      });
    } catch (error: any) {
      console.error("Error connecting Meta:", error);
      res.status(500).json({ error: error.message || "Failed to connect Meta WhatsApp" });
    }
  });

  // Disconnect Meta WhatsApp Business API
  app.post("/api/meta/disconnect", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await disconnectWhatsAppProvider(req.user.id, "meta");
      res.json({ success: true, message: "Meta WhatsApp disconnected" });
    } catch (error: any) {
      console.error("Error disconnecting Meta:", error);
      res.status(500).json({ error: error.message || "Failed to disconnect Meta" });
    }
  });

  // Validate Meta credentials (without saving)
  app.post("/api/meta/validate", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { accessToken, phoneNumberId, businessAccountId } = req.body;

      if (!accessToken || !phoneNumberId || !businessAccountId) {
        return res.status(400).json({ 
          error: "Access Token, Phone Number ID, and Business Account ID are required" 
        });
      }

      const result = await validateMetaCredentials({ accessToken, phoneNumberId, businessAccountId });
      res.json(result);
    } catch (error: any) {
      console.error("Error validating Meta:", error);
      res.status(500).json({ valid: false, error: error.message || "Validation failed" });
    }
  });

  // Switch WhatsApp provider (Twilio or Meta)
  app.post("/api/whatsapp/switch-provider", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { provider } = req.body;

      if (!provider || !["twilio", "meta"].includes(provider)) {
        return res.status(400).json({ error: "Provider must be 'twilio' or 'meta'" });
      }

      const result = await switchProvider(req.user.id, provider);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, message: `Switched to ${provider === 'meta' ? 'Meta WhatsApp Business API' : 'Twilio'}` });
    } catch (error: any) {
      console.error("Error switching provider:", error);
      res.status(500).json({ error: error.message || "Failed to switch provider" });
    }
  });

  // Get provider status (combined view)
  app.get("/api/whatsapp/providers", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const status = await getProviderStatus(req.user.id);
      res.json(status);
    } catch (error) {
      console.error("Error getting provider status:", error);
      res.status(500).json({ error: "Failed to get provider status" });
    }
  });
  // ============ TEAM MEMBER ROUTES ============

  // Get team members
  app.get("/api/team", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const members = await storage.getTeamMembers(req.user.id);
      const user = await storage.getUser(req.user.id);
      
      // Filter out any owner entries from database (owner is added dynamically)
      const nonOwnerMembers = members.filter(m => m.role !== 'owner');
      
      // Include the owner as the first team member
      const ownerMember = {
        id: "owner",
        ownerId: req.user.id,
        memberId: req.user.id,
        email: user?.email || "",
        name: user?.name || "You",
        role: "owner",
        status: "active",
        invitedAt: user?.createdAt,
        joinedAt: user?.createdAt,
      };
      
      res.json([ownerMember, ...nonOwnerMembers]);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });

  // Invite a team member
  app.post("/api/team", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { email, name, role = "member" } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Check subscription limits
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits) {
        return res.status(400).json({ error: "Could not fetch subscription limits" });
      }

      const currentCount = await storage.getTeamMemberCount(req.user.id);
      // -1 means unlimited team members
      if (limits.maxUsers !== -1 && currentCount >= limits.maxUsers) {
        return res.status(403).json({ 
          error: `Your ${limits.planName} plan allows ${limits.maxUsers} team member(s). Upgrade to add more.`,
          upgradeRequired: true
        });
      }

      // Check if already invited
      const existing = await storage.getTeamMembers(req.user.id);
      if (existing.some(m => m.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ error: "This email has already been invited" });
      }

      const member = await storage.createTeamMember({
        ownerId: req.user.id,
        email: email.toLowerCase(),
        name: name || null,
        role,
        status: "pending",
      });

      res.json(member);
    } catch (error) {
      console.error("Error inviting team member:", error);
      res.status(500).json({ error: "Failed to invite team member" });
    }
  });

  // Remove a team member
  app.delete("/api/team/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const member = await storage.getTeamMember(req.params.id);
      if (!member) {
        return res.status(404).json({ error: "Team member not found" });
      }

      // Only owner can remove team members
      if (member.ownerId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to remove this team member" });
      }

      await storage.deleteTeamMember(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing team member:", error);
      res.status(500).json({ error: "Failed to remove team member" });
    }
  });

  // Update a team member
  app.patch("/api/team/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const member = await storage.getTeamMember(req.params.id);
      if (!member) {
        return res.status(404).json({ error: "Team member not found" });
      }

      if (member.ownerId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to update this team member" });
      }

      const { role, status, name } = req.body;
      const updated = await storage.updateTeamMember(req.params.id, { 
        ...(role && { role }),
        ...(status && { status }),
        ...(name !== undefined && { name }),
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating team member:", error);
      res.status(500).json({ error: "Failed to update team member" });
    }
  });

  // ============ END TEAM MEMBER ROUTES ============

  // Twilio webhook for incoming WhatsApp messages
  // Routes messages to the correct user based on Account SID + phone number
  app.post("/api/webhook/twilio/incoming", async (req, res) => {
    const webhookTimestamp = new Date().toISOString();
    console.log(`[Twilio Webhook] ===== INBOUND WEBHOOK RECEIVED at ${webhookTimestamp} =====`);
    console.log(`[Twilio Webhook] Headers: x-twilio-signature=${req.headers["x-twilio-signature"] ? "present" : "MISSING"}, content-type=${req.headers["content-type"]}`);
    console.log(`[Twilio Webhook] Raw body: ${JSON.stringify(req.body).substring(0, 600)}`);

    try {
      const parsed = parseIncomingWebhook(req.body);
      const isWhatsApp = req.body.From?.startsWith("whatsapp:");
      const channel = isWhatsApp ? 'whatsapp' : 'sms';

      console.log(`[Twilio Webhook] Parsed — from: ${parsed.from}, to: ${parsed.to}, accountSid: ${parsed.accountSid}, channel: ${channel}, messageSid: ${parsed.messageSid}`);

      // Find user by their Twilio Account SID and receiving phone number (primary or secondary registered number)
      const twilioMatch = await findUserByTwilioCredentials(parsed.accountSid, parsed.to);
      
      if (!twilioMatch) {
        console.warn(`[Twilio Webhook] WARNING: No user found — accountSid: ${parsed.accountSid}, to: ${parsed.to}. Message dropped.`);
        console.warn(`[Twilio Webhook] Hint: Ensure the user has connected Twilio with matching Account SID and WhatsApp number.`);
        return res.status(200).send("");
      }

      const { user, matchedPhone } = twilioMatch;
      console.log(`[Twilio Webhook] User matched — userId: ${user.id} (email: ${user.email}), matchedPhone: ${matchedPhone})`);

      // Environment mode — drives strict vs. permissive behaviour
      const isProduction = process.env.NODE_ENV === "production";

      // Validate Twilio request signature using the user's auth token
      // In production: missing or invalid signature → 403 immediately
      // In dev/staging: warn and allow through for easier local testing
      const twilioSignature = req.headers["x-twilio-signature"] as string;

      if (!twilioSignature) {
        if (isProduction) {
          console.error(`[Twilio Webhook] REJECTED (production): Missing X-Twilio-Signature header — request refused`);
          return res.status(403).send("Missing signature");
        } else {
          console.warn(`[Twilio Webhook] DEV BYPASS: No X-Twilio-Signature header — allowed in non-production. This would be rejected in production.`);
        }
      } else if (user.twilioAuthToken) {
        try {
          const twilioClient = (await import("twilio")).default;
          const authToken = isEncrypted(user.twilioAuthToken)
            ? decryptCredential(user.twilioAuthToken)
            : user.twilioAuthToken;
          // IMPORTANT: must use the same base URL that was used when configuring
          // the Twilio webhook (connectUserTwilio / configureWebhooks). That code
          // uses APP_URL first, falling back to REPLIT_DOMAINS. The signature
          // Twilio sends is computed against the URL they actually POST to, so
          // any mismatch here causes every production signature check to fail.
          const webhookBaseUrl = getAppOrigin();
          const fullUrl = `${webhookBaseUrl}/api/webhook/twilio/incoming`;
          const isValid = twilioClient.validateRequest(authToken, twilioSignature, fullUrl, req.body);

          if (isValid) {
            console.log(`[Twilio Webhook] Signature validation: PASSED ✓`);
          } else {
            if (isProduction) {
              console.error(`[Twilio Webhook] REJECTED (production): Signature validation failed. URL used: ${fullUrl}`);
              return res.status(403).send("Invalid signature");
            } else {
              console.warn(`[Twilio Webhook] DEV BYPASS: Signature validation failed (URL: ${fullUrl}) — allowed in non-production. This would be rejected in production.`);
            }
          }
        } catch (sigErr: any) {
          if (isProduction) {
            console.error(`[Twilio Webhook] REJECTED (production): Signature validation threw error: ${sigErr.message}`);
            return res.status(403).send("Signature validation error");
          } else {
            console.warn(`[Twilio Webhook] DEV BYPASS: Signature validation error: ${sigErr.message} — allowed in non-production.`);
          }
        }
      } else {
        if (isProduction) {
          console.error(`[Twilio Webhook] REJECTED (production): User has no auth token stored — cannot validate signature`);
          return res.status(403).send("Cannot validate signature");
        } else {
          console.warn(`[Twilio Webhook] DEV BYPASS: User has no auth token stored — skipping validation in non-production.`);
        }
      }

      const userId = user.id;

      // Normalize channelContactId: strip leading '+' so format matches Meta path (e.g. 15550001234)
      const normalizedFrom = parsed.from.replace(/^\+/, "");
      console.log(`[Twilio Webhook] Sender phone normalized: "${parsed.from}" → "${normalizedFrom}"`);

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
        sender: "them",
      };

      const messages = (chat.messages as WhatsAppMessage[]) || [];
      messages.push(newMessage);

      const isNewChat = messages.length === 1;
      
      await storage.updateChat(chat.id, {
        messages,
        lastMessage: parsed.body,
        time: newMessage.time,
        unread: (chat.unread || 0) + 1,
      });

      // Process inbound message directly to DB — no queue dependency
      console.log(`[Inbound] Webhook received — channel: ${channel}, from: ${normalizedFrom}, messageSid: ${parsed.messageSid}`);
      console.log(`[Inbound] Channel identified: ${channel} — starting processIncomingMessage, userId: ${userId}`);
      const { channelService: cs } = await import("./channelService");
      // isNewConversation and chatbotWillFire are evaluated once inside
      // processIncomingMessage and returned here so no subsequent handler
      // needs to query the DB again to make the same determination.
      const {
        isNewConversation: inboxIsNewConv,
        chatbotWillFire: inboxChatbotWillFire,
        contact: inboxContact,
        conversation: inboxConversation,
      } = await cs.processIncomingMessage({
        userId,
        channel,
        channelContactId: normalizedFrom,
        channelAccountId: matchedPhone, // the business number that received the message
        contactName: parsed.profileName || normalizedFrom,
        content: parsed.body,
        contentType: 'text',
        externalMessageId: parsed.messageSid,
      });
      console.log(`[Inbound] Webhook returned 200 — channel: ${channel}, messageSid: ${parsed.messageSid}, userId: ${userId}`);

      // Trigger workflow automations (Pro feature)
      const updatedChat = await storage.getChat(chat.id);
      if (updatedChat) {
        if (isNewChat) {
          triggerNewChatWorkflows(userId, updatedChat, inboxContact, inboxConversation.id).catch(err => 
            console.error("New chat workflow error:", err)
          );
        }
        triggerKeywordWorkflows(userId, updatedChat, parsed.body, inboxContact, inboxConversation.id).catch(err => 
          console.error("Keyword workflow error:", err)
        );
        // W2 Financial Qualification Engine (Realtor Growth Engine)
        // chatbotWillFire was determined once inside processIncomingMessage —
        // no extra DB round-trip needed here.
        ;(async () => {
          try {
            const install = await storage.getTemplateInstall(userId, "realtor-growth-engine");
            if (install?.installStatus === "installed") {
              if (inboxChatbotWillFire) {
                console.log(`[W2] Outbound suppressed (Twilio) — chatbot owns this reply for userId: ${userId}`);
              }

              const w2 = await runW2QualificationEngine(userId, updatedChat, parsed.body, inboxContact);
              if (w2.signalsDetected.length > 0) {
                console.log(`[W2] Signals detected for chat ${updatedChat.id}: ${w2.signalsDetected.join(", ")} score+=${w2.scoreAdjustment}`);
              }
              // Only send qualification question if chatbot is NOT handling this conversation
              if (!inboxChatbotWillFire && w2.qualificationQuestion && updatedChat.whatsappPhone) {
                setTimeout(async () => {
                  try {
                    await sendUserWhatsAppMessage(userId, updatedChat.whatsappPhone!, w2.qualificationQuestion!);
                    console.log(`[W2] Qualification question sent to ${updatedChat.whatsappPhone}`);
                  } catch (err) { console.error("[W2] Failed to send qualification question:", err); }
                }, 3000);
              }
              // Service Routing Engine
              try {
                const routing = await runServiceRoutingEngine(userId, updatedChat, parsed.body, inboxContact);
                const routingMsg = routing.offerMessage || routing.routingMessage;
                // Only send routing message if chatbot is NOT handling this conversation
                if (!inboxChatbotWillFire && routingMsg && updatedChat.whatsappPhone) {
                  const delay = w2.qualificationQuestion ? 6000 : 3500;
                  setTimeout(async () => {
                    try {
                      await sendUserWhatsAppMessage(userId, updatedChat.whatsappPhone!, routingMsg);
                      console.log(`[Routing] ${routing.offerMessage ? "Offer" : "Routing"} message sent (${routing.serviceType}) to ${updatedChat.whatsappPhone}`);
                    } catch (err) { console.error("[Routing] Failed to send routing message:", err); }
                  }, delay);
                }
                // Phase D: apply service-routing tags via dual-write (contact-first)
                // Phase E Step 4: fire tag-change workflows after the write
                if (routing.tagsToApply.length > 0) {
                  const newTag = routing.tagsToApply[0];
                  const oldTag = inboxContact?.tag ?? updatedChat.tag ?? 'New';
                  try {
                    if (inboxContact) {
                      await storage.updateContact(inboxContact.id, { tag: newTag }).catch(() => {});
                    }
                    await storage.updateChat(updatedChat.id, { tag: newTag }).catch(() => {});
                    console.log(`[Routing] Tag applied (Twilio): "${newTag}" for chat ${updatedChat.id}`);
                    if (oldTag !== newTag) {
                      triggerTagChangeWorkflows(userId, updatedChat, oldTag, newTag, inboxContact, inboxConversation.id)
                        .catch(e => console.error('[TagChange] Twilio routing:', e));
                    }
                  } catch (err) { console.error("[Routing] Failed to apply tag:", err); }
                }
                if (routing.taskNote) {
                  console.log(`[Routing] Internal task created for chat ${updatedChat.id}: ${routing.taskNote}`);
                }
              } catch (err) { console.error("[Routing] Engine error:", err); }
            }
          } catch (err) { console.error("[W2] Engine error:", err); }
        })();
      }

      // Auto-reply & Business Hours are now handled inside
      // channelService.processIncomingMessage for all channels.

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

  // ============= Meta WhatsApp Business API Webhooks =============

  // Meta webhook verification (GET for verification handshake)
  app.get("/api/webhook/meta", async (req, res) => {
    try {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      console.log("Meta webhook verification attempt:", { mode, token });

      if (mode === "subscribe") {
        // Check 1: users table (WhatsApp Meta connections)
        const { db } = await import("../drizzle/db");
        const { users, channelSettings: csTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");

        const allUsers = await db.select().from(users).where(eq(users.metaConnected, true));
        const matchingUser = allUsers.find(u => u.metaWebhookVerifyToken === token);
        if (matchingUser) {
          console.log(`[Webhook Verify] Matched via users.metaWebhookVerifyToken — userId: ${matchingUser.id}`);
          return res.status(200).send(challenge);
        }

        // Check 2: channelSettings.config.webhookVerifyToken (Facebook/Instagram connections)
        const allChannelSettings = await db.select().from(csTable)
          .where(eq(csTable.isConnected, true));
        const matchingChannel = allChannelSettings.find(s => {
          const cfg = s.config as any;
          return cfg?.webhookVerifyToken === token;
        });
        if (matchingChannel) {
          console.log(`[Webhook Verify] Matched via channelSettings.webhookVerifyToken — userId: ${matchingChannel.userId}, channel: ${matchingChannel.channel}`);
          return res.status(200).send(challenge);
        }

        // Check 3: global verify token from env
        const globalToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
        if (globalToken && token === globalToken) {
          console.log("[Webhook Verify] Matched via global META_WEBHOOK_VERIFY_TOKEN");
          return res.status(200).send(challenge);
        }

        console.warn(`[Webhook Verify] FAILED — token did not match any user or channelSettings record. Token: ${String(token).slice(0, 8)}...`);
      }

      console.log("Meta webhook verification failed");
      res.status(403).send("Verification failed");
    } catch (error) {
      console.error("Meta webhook verification error:", error);
      res.status(500).send("Error");
    }
  });

  // Meta webhook for incoming messages and status updates
  app.post("/api/webhook/meta", async (req, res) => {
    try {
      const webhookTimestamp = new Date().toISOString();
      console.log(`[Meta Webhook] ===== INBOUND WEBHOOK RECEIVED at ${webhookTimestamp} =====`);
      console.log(`[Meta Webhook] Headers: x-hub-signature-256=${req.headers["x-hub-signature-256"] ? "present" : "MISSING"}, content-type=${req.headers["content-type"]}`);
      console.log(`[Meta Webhook] Raw payload preview: ${JSON.stringify(req.body).substring(0, 800)}`);

      // Environment mode — drives strict vs. permissive behaviour throughout this handler
      const isProduction = process.env.NODE_ENV === "production";

      // Check for signature header
      const signature = req.headers["x-hub-signature-256"] as string;

      if (!signature) {
        if (isProduction) {
          console.error(`[Meta Webhook] REJECTED (production): Missing X-Hub-Signature-256 header`);
          return res.status(403).send("Missing signature");
        } else {
          console.warn(`[Meta Webhook] DEV BYPASS: No X-Hub-Signature-256 header — allowed in non-production. This would be rejected in production.`);
          // Skip all signature checks and proceed directly to message processing
        }
      }

      // Use the captured raw body buffer for signature verification.
      // JSON.stringify(req.body) would re-serialize a parsed object and may differ
      // from the original bytes that Meta signed (whitespace, key order), causing
      // every webhook to fail verification. rawBody is set by the express.json verify
      // callback registered in index.ts for /api/webhook/meta.
      const rawBody = (req as any).rawBody?.toString() || JSON.stringify(req.body);

      // --- Signature resolution ---
      // We track two flags separately:
      //   signatureValid     — true only when a secret verified the HMAC successfully
      //   hasSecretToVerify  — true when at least one secret was available to try
      // In production: !signatureValid → 403 regardless of hasSecretToVerify
      // In dev:        !signatureValid + !hasSecretToVerify → warn + allow
      //                !signatureValid + hasSecretToVerify  → warn + allow (HMAC mismatch)
      const globalAppSecret = process.env.META_APP_SECRET;
      let signatureValid = false;
      let hasSecretToVerify = false;

      if (globalAppSecret) {
        hasSecretToVerify = true;
        signatureValid = verifyMetaWebhookSignature(rawBody, signature, globalAppSecret);
        console.log(`[Meta Webhook] Global META_APP_SECRET check: ${signatureValid ? "PASSED" : "failed"}`);
      } else {
        console.log("[Meta Webhook] No global META_APP_SECRET — trying user-level secrets");
      }

      // If global secret didn't verify, try user-level secrets
      if (!signatureValid) {
        const entry = req.body.entry?.[0];
        const phoneNumberId = entry?.changes?.[0]?.value?.metadata?.phone_number_id;

        if (phoneNumberId) {
          const user = await findUserByMetaPhoneNumberId(phoneNumberId);
          if (user?.metaAppSecret) {
            hasSecretToVerify = true;
            const userSecret = isMetaEncrypted(user.metaAppSecret)
              ? decryptMetaCredential(user.metaAppSecret)
              : user.metaAppSecret;
            signatureValid = verifyMetaWebhookSignature(rawBody, signature, userSecret);
            console.log(`[Meta Webhook] User (${user.id}) app secret check for phoneNumberId ${phoneNumberId}: ${signatureValid ? "PASSED" : "failed"}`);
          } else if (user) {
            console.warn(`[Meta Webhook] User ${user.id} matched but has no metaAppSecret stored`);
          } else {
            console.warn(`[Meta Webhook] No user found for phoneNumberId: ${phoneNumberId}`);
          }
        }

        // Instagram/Facebook: lookup by recipient page/IG account ID
        if (!signatureValid && entry?.messaging) {
          const recipientId = entry.messaging[0]?.recipient?.id;
          if (recipientId) {
            const { db: database } = await import("../drizzle/db");
            const { channelSettings: csTable } = await import("@shared/schema");
            const { eq: eqOp } = await import("drizzle-orm");

            const allConnected = await database.select().from(csTable)
              .where(eqOp(csTable.isConnected, true));

            for (const setting of allConnected) {
              const config = setting.config as any;
              if (config?.pageId === recipientId || config?.instagramAccountId === recipientId) {
                if (config?.appSecret) {
                  hasSecretToVerify = true;
                  signatureValid = verifyMetaWebhookSignature(rawBody, signature, config.appSecret);
                  if (signatureValid) break;
                }
                const settingUser = await storage.getUser(setting.userId);
                if (settingUser?.metaAppSecret) {
                  hasSecretToVerify = true;
                  const userSecret = isMetaEncrypted(settingUser.metaAppSecret)
                    ? decryptMetaCredential(settingUser.metaAppSecret)
                    : settingUser.metaAppSecret;
                  signatureValid = verifyMetaWebhookSignature(rawBody, signature, userSecret);
                  if (signatureValid) break;
                }
              }
            }
          }
        }
      }

      // --- Enforcement decision ---
      if (!signatureValid) {
        if (isProduction) {
          if (!hasSecretToVerify) {
            console.error(`[Meta Webhook] REJECTED (production): No app secret configured — cannot verify signature. Set META_APP_SECRET env var or store metaAppSecret on user account.`);
          } else {
            console.error(`[Meta Webhook] REJECTED (production): Signature verification failed. Signature: ${signature.substring(0, 30)}... Body source: ${(req as any).rawBody ? "rawBody buffer" : "JSON.stringify fallback"}`);
          }
          return res.status(403).send("Invalid signature");
        } else {
          // Dev/staging — allow through with clear warning
          if (!hasSecretToVerify) {
            console.warn(`[Meta Webhook] DEV BYPASS: No app secret configured — allowed in non-production. Set META_APP_SECRET for production.`);
          } else {
            console.warn(`[Meta Webhook] DEV BYPASS: Signature verification failed — allowed in non-production. This would be rejected in production.`);
          }
        }
      } else {
        console.log("[Meta Webhook] Signature verification: PASSED ✓");
      }

      const incomingMessage = parseMetaIncomingWebhook(req.body);
      const statusUpdate = parseMetaStatusWebhook(req.body);

      // [Stage 2] Classify the payload by object type so downstream sections are easy to trace
      const webhookObjectType = req.body.object as string | undefined;
      const webhookEntry0 = req.body.entry?.[0];
      const webhookHasMessaging = !!(webhookEntry0?.messaging?.length);
      console.log(`[Meta Webhook] [Stage 2] Object type: "${webhookObjectType}" | has messaging array: ${webhookHasMessaging} | WhatsApp parse: ${incomingMessage ? "YES" : "no"} | status-update parse: ${statusUpdate ? "YES" : "no"}`);

      if (incomingMessage) {
        console.log(`[Meta Webhook] [Stage 2a] WhatsApp inbound — from: ${incomingMessage.from}, type: ${incomingMessage.type}, messageId: ${incomingMessage.messageId}, phoneNumberId: ${incomingMessage.phoneNumberId}, profileName: "${incomingMessage.profileName}"`);
      } else if (!statusUpdate && !webhookHasMessaging) {
        console.log("[Meta Webhook] Payload is neither a message nor a status update — likely a notification event, ignoring");
      } else if (!incomingMessage && webhookHasMessaging) {
        console.log(`[Meta Webhook] [Stage 2b] Non-WhatsApp messaging payload detected — routing to ${webhookObjectType === 'instagram' ? 'Instagram' : webhookObjectType === 'page' ? 'Facebook' : webhookObjectType ?? 'unknown'} handler`);
      }

      // Process all inbound messages directly to DB — no queue dependency
      const { channelService: metaCs } = await import("./channelService");
      const directJobs: Promise<void>[] = [];

      // Capture processIncomingMessage result so post-ACK handlers can read
      // chatbotWillFire and isNewConversation without extra DB round-trips.
      let metaInboxResult: { chatbotWillFire: boolean; isNewConversation: boolean } | null = null;
      // Phase A: capture contact and conversationId from processIncomingMessage for Growth Engine
      let metaInboxContact: any = null;
      let metaInboxConversationId: string | null = null;

      if (incomingMessage) {
        const user = await findUserByMetaPhoneNumberId(incomingMessage.phoneNumberId);
        if (user) {
          console.log(`[Inbound] Webhook received — channel: whatsapp, from: ${incomingMessage.from}, messageId: ${incomingMessage.messageId}`);
          console.log(`[Inbound] Channel identified: whatsapp — userId: ${user.id}, starting processIncomingMessage`);
          directJobs.push(
            metaCs.processIncomingMessage({
              userId: user.id,
              channel: 'whatsapp',
              channelContactId: incomingMessage.from,
              contactName: incomingMessage.profileName || incomingMessage.from,
              content: incomingMessage.text || incomingMessage.caption || '',
              contentType: incomingMessage.type === 'text' ? 'text' : incomingMessage.type,
              // Store Meta media ID in platform_media_id so the proxy can fetch it on demand
              platformMediaId: incomingMessage.mediaId,
              externalMessageId: incomingMessage.messageId,
            }).then((result) => {
              metaInboxResult = { chatbotWillFire: result.chatbotWillFire, isNewConversation: result.isNewConversation };
              metaInboxContact = result.contact;
              metaInboxConversationId = result.conversation.id;
              console.log(`[Inbound] Webhook returned 200 — channel: whatsapp, messageId: ${incomingMessage.messageId}, userId: ${user.id}`);
            })
          );
        } else {
          console.warn(`[Meta Webhook] WARNING: No user found for phoneNumberId=${incomingMessage.phoneNumberId}. Message from ${incomingMessage.from} will be dropped.`);
          console.warn(`[Meta Webhook] Hint: Ensure the Meta phone number ID is correctly saved in the user's account settings.`);
        }
      }

      // [Stage 3] Parse Instagram Direct messages
      const igEntry = req.body.entry?.[0];
      if (igEntry?.messaging && req.body.object === 'instagram') {
        console.log(`[Meta Webhook] [Stage 3-IG] Instagram messaging block — ${igEntry.messaging.length} event(s)`);
        for (const event of igEntry.messaging) {
          if (event.message) {
            const senderId = event.sender?.id;
            const messageText = event.message.text || '';
            const messageId = event.message.mid;
            const attachments: any[] = Array.isArray(event.message.attachments) ? event.message.attachments : [];
            const hasContent = messageText.length > 0 || attachments.length > 0;

            console.log(`[Meta Webhook] [Stage 3-IG] Event: senderId=${senderId}, recipientId=${event.recipient?.id}, mid=${messageId}, text="${messageText.substring(0, 80)}", attachments=${attachments.length}`);

            if (senderId && hasContent) {
              const recipientId = event.recipient?.id;
              const { db: database } = await import("../drizzle/db");
              const { channelSettings: channelSettingsTable } = await import("@shared/schema");
              const { eq: eqOp, and: andOp } = await import("drizzle-orm");

              const allSettings = await database.select().from(channelSettingsTable)
                .where(andOp(
                  eqOp(channelSettingsTable.channel, 'instagram'),
                  eqOp(channelSettingsTable.isConnected, true)
                ));

              console.log(`[Meta Webhook] [Stage 3-IG] Found ${allSettings.length} connected instagram channelSettings — looking for recipientId=${recipientId}`);
              allSettings.forEach((s, i) => {
                const cfg = s.config as any;
                console.log(`[Meta Webhook] [Stage 3-IG]   [${i}] userId=${s.userId}, pageId=${cfg?.pageId}, instagramAccountId=${cfg?.instagramAccountId}`);
              });

              const matchSetting = allSettings.find(s => {
                const config = s.config as any;
                return config?.pageId === recipientId || config?.instagramAccountId === recipientId;
              });

              if (matchSetting) {
                console.log(`[Meta Webhook] [Stage 3-IG] MATCHED channelSettings id=${matchSetting.id}, userId=${matchSetting.userId}`);
                console.log(`[Inbound] [Stage 4-IG] Webhook received — channel: instagram, from: ${senderId}, messageId: ${messageId}`);
                console.log(`[Inbound] [Stage 4-IG] Channel identified: instagram — userId: ${matchSetting.userId}, handing off to processIncomingMessage`);

                const firstAttachment = attachments[0] as any | undefined;
                const attachmentMediaUrl: string | undefined = firstAttachment?.payload?.url;
                const attachmentType: string | undefined = firstAttachment?.type;
                const content = messageText || firstAttachment?.payload?.title || '';
                const contentType = messageText ? 'text' : (attachmentType || 'attachment');

                console.log(`[Inbound] [Stage 4-IG] content="${content.substring(0, 60)}", contentType=${contentType}, hasMedia=${!!attachmentMediaUrl}, attachmentType=${attachmentType}`);

                const igAccessToken: string = (matchSetting.config as any)?.accessToken ?? '';
                directJobs.push(
                  metaCs.processIncomingMessage({
                    userId: matchSetting.userId,
                    channel: 'instagram',
                    channelContactId: senderId,
                    contactName: event.sender?.username || senderId,
                    content,
                    contentType,
                    mediaUrl: attachmentMediaUrl,
                    mediaType: attachmentType,
                    externalMessageId: messageId,
                  }).then(async (result) => {
                    console.log(`[Inbound] [Stage 10-IG] Pipeline complete — channel: instagram, messageId: ${messageId}, contactId: ${result.contact.id}, conversationId: ${result.conversation.id}, messageId_db: ${result.message.id}, isNewConversation: ${result.isNewConversation}`);
                    // Fire-and-forget avatar fetch
                    if (igAccessToken) {
                      const { shouldRefreshAvatar, fetchInstagramAvatar } = await import("./avatarService");
                      if (shouldRefreshAvatar(result.contact)) {
                        fetchInstagramAvatar(result.contact.id, senderId, igAccessToken).catch(() => {});
                      }
                    }
                  })
                );
              } else {
                console.warn(`[Meta Webhook] [Stage 3-IG] LOOKUP FAILED — recipientId: ${recipientId}. No connected Instagram channelSettings record matched. Message from senderId=${senderId} is being DROPPED.`);
                console.warn(`[Meta Webhook] [Stage 3-IG] FIX: Go to Integrations → Instagram, enter your Page ID / Instagram Account ID (the one Meta calls as recipient="${recipientId}") and mark it connected.`);
              }
            } else {
              console.log(`[Meta Webhook] [Stage 3-IG] Skipping event — senderId or content missing (senderId=${senderId}, textLen=${messageText.length}, attachments=${attachments.length})`);
            }
          }
        }
      }

      // [Stage 3] Parse Facebook Messenger messages
      // object=page covers all Messenger DMs to a Facebook Page
      if (req.body.object === 'page') {
        const fbEntries: any[] = Array.isArray(req.body.entry) ? req.body.entry : [];
        console.log(`[Meta Webhook] [Stage 3-FB] object=page, ${fbEntries.length} entry(s)`);
        for (const fbEntry of fbEntries) {
          const fbPageId = fbEntry.id; // The Page that received the message
          const messagingEvents: any[] = Array.isArray(fbEntry.messaging) ? fbEntry.messaging : [];
          console.log(`[Meta Webhook] [Stage 3-FB] Entry pageId=${fbPageId}, ${messagingEvents.length} messaging event(s)`);

          for (const event of messagingEvents) {
            // Skip echo messages (messages the Page itself sent — these are outbound echoes)
            if (event.message?.is_echo) {
              console.log(`[Meta Webhook] [Stage 3-FB] Skipping echo message mid=${event.message?.mid}`);
              continue;
            }

            // Must be an actual message event
            if (!event.message) {
              console.log(`[Meta Webhook] [Stage 3-FB] Skipping non-message event (keys: ${Object.keys(event).join(",")})`);
              continue;
            }

            const senderId = event.sender?.id as string | undefined;
            const recipientId = event.recipient?.id as string | undefined; // This is the Page ID
            const messageId = event.message.mid as string | undefined;
            const messageText: string = event.message.text || '';
            const attachments: any[] = Array.isArray(event.message.attachments) ? event.message.attachments : [];
            const hasContent = messageText.length > 0 || attachments.length > 0;

            console.log(`[Meta Webhook] [Stage 3-FB] Event: senderId=${senderId} recipientId=${recipientId} mid=${messageId} text="${messageText.substring(0, 80)}" attachments=${attachments.length}`);

            if (!senderId || !hasContent) {
              console.log(`[Meta Webhook] [Stage 3-FB] Skipping — no senderId or no content (senderId=${senderId}, hasContent=${hasContent})`);
              continue;
            }

            const { db: database } = await import("../drizzle/db");
            const { channelSettings: channelSettingsTable } = await import("@shared/schema");
            const { eq: eqOp, and: andOp } = await import("drizzle-orm");

            const allSettings = await database.select().from(channelSettingsTable)
              .where(andOp(
                eqOp(channelSettingsTable.channel, 'facebook'),
                eqOp(channelSettingsTable.isConnected, true)
              ));

            console.log(`[Meta Webhook] [Stage 3-FB] Found ${allSettings.length} connected facebook channelSettings — looking for recipientId=${recipientId} or pageId=${fbPageId}`);
            allSettings.forEach((s, i) => {
              const cfg = s.config as any;
              console.log(`[Meta Webhook] [Stage 3-FB]   [${i}] userId=${s.userId}, pageId=${cfg?.pageId}`);
            });

            // Match by recipient ID (page ID in webhook) or entry page ID
            const matchSetting = allSettings.find(s => {
              const config = s.config as any;
              return config?.pageId === recipientId || config?.pageId === fbPageId;
            });

            if (!matchSetting) {
              console.warn(`[Meta Webhook] [Stage 3-FB] LOOKUP FAILED — no Facebook channelSettings matched recipientId=${recipientId} or pageId=${fbPageId}. Message from senderId=${senderId} DROPPED.`);
              continue;
            }

            const matchedConfig = matchSetting.config as any;
            console.log(`[Meta Webhook] [Stage 3-FB] MATCHED: channelSettings id=${matchSetting.id}, userId=${matchSetting.userId}, savedPageId=${matchedConfig?.pageId}`);

            // Resolve sender display name + profile picture via Graph API in one call
            let contactName = senderId;
            let fbProfilePic: string | undefined;
            try {
              const nameResp = await fetch(
                `https://graph.facebook.com/v19.0/${senderId}?fields=name,profile_pic&access_token=${encodeURIComponent(matchedConfig.accessToken)}`
              );
              const nameData = (await nameResp.json()) as any;
              if (nameResp.ok && nameData.name) {
                contactName = nameData.name as string;
                console.log(`[Meta Webhook] [Stage 3-FB] Resolved sender name: "${contactName}"`);
              } else {
                console.log(`[Meta Webhook] [Stage 3-FB] Could not resolve sender name (${nameData?.error?.message || 'no name field'}) — using PSID`);
              }
              if (nameResp.ok && typeof nameData.profile_pic === 'string') {
                fbProfilePic = nameData.profile_pic as string;
              }
            } catch {
              console.log(`[Meta Webhook] [Stage 3-FB] Name lookup failed — using PSID as contactName`);
            }

            // Derive content and media info
            const firstAttachment = attachments[0] as any | undefined;
            const attachmentMediaUrl: string | undefined = firstAttachment?.payload?.url;
            const content = messageText || firstAttachment?.payload?.title || '';
            const contentType = messageText ? 'text' : (firstAttachment?.type || 'attachment');

            console.log(`[Inbound] [Stage 4-FB] Handing off to processIncomingMessage — channel: facebook, from: ${senderId} ("${contactName}"), content: "${content.substring(0, 60)}", hasMedia: ${!!attachmentMediaUrl}`);
            directJobs.push(
              metaCs.processIncomingMessage({
                userId: matchSetting.userId,
                channel: 'facebook',
                channelContactId: senderId,
                contactName,
                content,
                contentType,
                mediaUrl: attachmentMediaUrl,
                externalMessageId: messageId,
              }).then(async (result) => {
                console.log(`[Inbound] [Stage 10-FB] Pipeline complete — channel: facebook, mid=${messageId}, contactId=${result.contact.id}, conversationId=${result.conversation.id}, dbMessageId=${result.message.id}, isNew=${result.isNewConversation}`);
                // Update avatar if we got one from the Graph API call and it's due for refresh
                const { shouldRefreshAvatar } = await import("./avatarService");
                if (shouldRefreshAvatar(result.contact)) {
                  if (fbProfilePic) {
                    storage.updateContact(result.contact.id, { avatar: fbProfilePic, avatarFetchedAt: new Date() }).catch(() => {});
                  } else {
                    const { fetchFacebookAvatar } = await import("./avatarService");
                    fetchFacebookAvatar(result.contact.id, senderId, matchedConfig.accessToken).catch(() => {});
                  }
                }
              }).catch((err: any) => {
                console.error(`[Inbound] [Stage 10-FB] processIncomingMessage FAILED — mid=${messageId}, error:`, err?.message || err);
              })
            );
          }
        }
      }

      // All message processing completes before we ACK 200 to the provider
      if (directJobs.length > 0) {
        await Promise.all(directJobs);
      }

      res.status(200).send("EVENT_RECEIVED");

      // Process legacy chat write and other side effects asynchronously (non-critical)
      if (incomingMessage) {
        const user = await findUserByMetaPhoneNumberId(incomingMessage.phoneNumberId);
        if (user) {
          try {
            const chat = await findOrCreateChatByPhone(
              user.id,
              incomingMessage.from,
              incomingMessage.profileName || incomingMessage.from
            );

            const newMessage = {
              id: incomingMessage.messageId,
              text: incomingMessage.text || incomingMessage.caption || `[${incomingMessage.type}]`,
              time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
              sent: false,
              sender: "them" as const,
              status: "delivered" as const,
              metaMessageId: incomingMessage.messageId,
            };

            const messages = (chat.messages as any[]) || [];
            messages.push(newMessage);

            await storage.updateChat(chat.id, {
              messages,
              lastMessage: newMessage.text,
              time: newMessage.time,
              unread: (chat.unread || 0) + 1,
            });

            const costs = calculateCostWithMarkup(TWILIO_BASE_COST_PER_MESSAGE);
            await storage.recordMessageUsage({
              userId: user.id,
              chatId: chat.id,
              direction: "inbound",
              messageType: incomingMessage.type === "text" ? "text" : "media",
              twilioSid: incomingMessage.messageId,
              twilioCost: costs.twilioCost,
              markupPercent: costs.markupPercent,
              totalCost: costs.totalCost,
            });

            await markMessageAsRead(user.id, incomingMessage.messageId);

            if (messages.length === 1) {
              triggerNewChatWorkflows(user.id, chat, metaInboxContact ?? undefined, metaInboxConversationId ?? undefined).catch(err => console.error("New chat workflow error:", err));
            }

            if (incomingMessage.text) {
              triggerKeywordWorkflows(user.id, chat, incomingMessage.text, metaInboxContact ?? undefined, metaInboxConversationId ?? undefined).catch(err => console.error("Keyword workflow error:", err));
              // W2 Financial Qualification Engine (Realtor Growth Engine)
              ;(async () => {
                try {
                  const install = await storage.getTemplateInstall(user.id, "realtor-growth-engine");
                  if (install?.installStatus === "installed") {
                    // chatbotWillFire was determined once inside processIncomingMessage
                    // and captured in metaInboxResult — no extra DB round-trip needed.
                    const chatbotHandlesReplyMeta = (metaInboxResult as { chatbotWillFire: boolean } | null)?.chatbotWillFire ?? false;
                    if (chatbotHandlesReplyMeta) {
                      console.log(`[W2] Outbound suppressed (Meta) — chatbot owns this reply for userId: ${user.id}`);
                    }

                    const freshChat = await storage.getChat(chat.id);
                    if (!freshChat) return;
                    const w2 = await runW2QualificationEngine(user.id, freshChat, incomingMessage.text!, metaInboxContact ?? undefined);
                    if (w2.signalsDetected.length > 0) {
                      console.log(`[W2] Signals detected for chat ${chat.id}: ${w2.signalsDetected.join(", ")} score+=${w2.scoreAdjustment}`);
                    }
                    // Only send qualification question if chatbot is NOT handling this conversation
                    if (!chatbotHandlesReplyMeta && w2.qualificationQuestion && incomingMessage.from) {
                      setTimeout(async () => {
                        try {
                          await sendMetaWhatsAppMessage(user.id, incomingMessage.from, w2.qualificationQuestion!);
                          console.log(`[W2] Qualification question sent (Meta) to ${incomingMessage.from}`);
                        } catch (err) { console.error("[W2] Failed to send qualification question (Meta):", err); }
                      }, 3000);
                    }
                    // Service Routing Engine (Meta)
                    try {
                      const routing = await runServiceRoutingEngine(user.id, freshChat, incomingMessage.text!, metaInboxContact ?? undefined);
                      const routingMsg = routing.offerMessage || routing.routingMessage;
                      // Only send routing message if chatbot is NOT handling this conversation
                      if (!chatbotHandlesReplyMeta && routingMsg && incomingMessage.from) {
                        const delay = w2.qualificationQuestion ? 6000 : 3500;
                        setTimeout(async () => {
                          try {
                            await sendMetaWhatsAppMessage(user.id, incomingMessage.from, routingMsg);
                            console.log(`[Routing] ${routing.offerMessage ? "Offer" : "Routing"} message sent (Meta, ${routing.serviceType}) to ${incomingMessage.from}`);
                          } catch (err) { console.error("[Routing] Failed to send routing message (Meta):", err); }
                        }, delay);
                      }
                      // Phase D: apply service-routing tags via dual-write (contact-first)
                      // Phase E Step 4: fire tag-change workflows after the write
                      if (routing.tagsToApply.length > 0) {
                        const newTag = routing.tagsToApply[0];
                        const oldTag = metaInboxContact?.tag ?? freshChat.tag ?? 'New';
                        try {
                          if (metaInboxContact) {
                            await storage.updateContact(metaInboxContact.id, { tag: newTag }).catch(() => {});
                          }
                          await storage.updateChat(freshChat.id, { tag: newTag }).catch(() => {});
                          console.log(`[Routing] Tag applied (Meta): "${newTag}" for chat ${freshChat.id}`);
                          if (oldTag !== newTag) {
                            triggerTagChangeWorkflows(user.id, freshChat, oldTag, newTag, metaInboxContact ?? undefined, metaInboxConversationId ?? undefined)
                              .catch(e => console.error('[TagChange] Meta routing:', e));
                          }
                        } catch (err) { console.error("[Routing] Failed to apply tag (Meta):", err); }
                      }
                      if (routing.taskNote) {
                        console.log(`[Routing] Internal task created for chat ${freshChat.id}: ${routing.taskNote}`);
                      }
                    } catch (err) { console.error("[Routing] Engine error (Meta):", err); }
                  }
                } catch (err) { console.error("[W2] Engine error (Meta):", err); }
              })();
            }

            // Auto-reply & Business Hours are now handled inside
            // channelService.processIncomingMessage for all channels.

            console.log("Meta message processed successfully");
          } catch (legacyErr) {
            console.error("Meta legacy chat write error (non-critical):", legacyErr);
          }
        }
      }

      if (statusUpdate) {
        console.log("Meta status update:", statusUpdate);
      }
    } catch (error) {
      console.error("Meta webhook error:", error);
    }
  });

  // ============= Subscription Endpoints =============

  // Get available subscription plans
  app.get("/api/subscription/plans", (_req, res) => {
    const plans = Object.entries(PLAN_LIMITS).map(([id, plan]) => ({
      id,
      ...plan,
    }));
    res.json(plans);
  });

  // Get current user's subscription and limits
  app.get("/api/subscription", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      const user = await storage.getUser(req.user.id);
      const usersCount = await storage.getTeamMemberCount(req.user.id);

      res.json({
        limits: limits ? {
          ...limits,
          conversationsLimit: limits.conversationsLimit,
          conversationsUsed: limits.conversationsUsed,
          isLifetimeLimit: limits.isLifetimeLimit,
          usersCount,
          usersLimit: limits.maxUsers,
          maxWhatsappNumbers: limits.maxWhatsappNumbers,
          planName: limits.planName,
          plan: limits.plan,
        } : null,
        subscription: user ? {
          plan: user.subscriptionPlan,
          status: user.subscriptionStatus,
          currentPeriodEnd: user.currentPeriodEnd,
          isShopify: !!(user.shopifyShop),
        } : null,
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  // Debug endpoint: current user's subscription + Stripe price IDs (safe)
  app.get("/api/subscription/debug", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      const effectivePlan = limits?.plan || "free";

      let stripePriceIds: string[] | null = null;
      try {
        const stripe = await getUncachableStripeClient();
        const ids = new Set<string>();

        if (user.stripeCustomerId) {
          const subs = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            status: "active",
            expand: ["data.items.data.price"],
            limit: 25,
          });
          for (const sub of subs.data) {
            for (const it of sub.items?.data || []) {
              const pid = (it as any)?.price?.id;
              if (pid) ids.add(pid);
            }
          }
        }

        if (user.stripeSubscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
            expand: ["items.data.price"],
          } as any);
          const items = subscription?.items?.data || [];
          for (const it of items) {
            const pid = (it as any)?.price?.id;
            if (pid) ids.add(pid);
          }
        }

        stripePriceIds = [...ids];
      } catch (err: any) {
        console.error("[Subscription Debug] Stripe lookup failed:", {
          userId: user.id,
          stripeCustomerId: user.stripeCustomerId,
          stripeSubscriptionId: user.stripeSubscriptionId,
          message: err?.message,
        });
        stripePriceIds = null;
      }

      return res.json({
        userId: user.id,
        email: user.email,
        billingPlan: user.billingPlan,
        planOverride: user.planOverride,
        planOverrideEnabled: user.planOverrideEnabled,
        effectivePlan,
        subscriptionPlanLegacy: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: user.stripeSubscriptionId,
        currentPeriodEnd: user.currentPeriodEnd,
        shopifyAIBrainEnabled: user.shopifyAIBrainEnabled,
        hasAIBrainAddon: limits?.hasAIBrainAddon ?? false,
        aiBrainSource: limits?.aiBrainSource ?? "none",
        growthEngineEligible: limits?.growthEngineEligible ?? false,
        stripeSubscriptionItemPriceIds: stripePriceIds,
      });
    } catch (error: any) {
      console.error("[Subscription Debug] Error:", error?.message || error);
      return res.status(500).json({ error: "Failed to load subscription debug" });
    }
  });

  // Create checkout session for upgrading
  app.post("/api/subscription/checkout", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { planId, billingInterval } = req.body as {
        planId?: string;
        billingInterval?: "monthly" | "yearly";
      };

      if (!planId || !["starter", "pro"].includes(planId)) {
        return res.status(400).json({ error: "Invalid plan" });
      }

      if (billingInterval && !["monthly", "yearly"].includes(billingInterval)) {
        return res.status(400).json({ error: "Invalid billing interval" });
      }

      const baseUrl = getAppOrigin() || `${req.protocol}://${req.get('host')}`;
      const result = await subscriptionService.createCheckoutSession(
        req.user.id,
        planId,
        baseUrl,
        billingInterval || "monthly"
      );
      res.json(result);
    } catch (error: any) {
      console.error("Error creating checkout:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout" });
    }
  });

  app.post("/api/subscription/checkout/pro-ai", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const baseUrl = getAppOrigin() || `${req.protocol}://${req.get('host')}`;
      const result = await subscriptionService.createProPlusAICheckoutSession(req.user.id, baseUrl);
      res.json(result);
    } catch (error: any) {
      console.error("Error creating Pro+AI checkout:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout" });
    }
  });

  // Create checkout session for AI Brain add-on ($29/mo)
  app.post("/api/subscription/addon/ai-brain", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const baseUrl = getAppOrigin() || `${req.protocol}://${req.get('host')}`;

      console.log("[AI Brain Checkout] ENV/Host:", {
        host: req.get("host"),
        "x-forwarded-host": req.headers["x-forwarded-host"],
        "x-forwarded-proto": req.headers["x-forwarded-proto"],
        APP_URL: process.env.APP_URL,
        MARKETING_URL: process.env.MARKETING_URL,
        STRIPE_SECRET_KEY_exists: !!process.env.STRIPE_SECRET_KEY,
        STRIPE_SECRET_KEY_prefix8: process.env.STRIPE_SECRET_KEY?.slice(0, 8),
        STRIPE_AI_BRAIN_MONTHLY_PRICE_ID: process.env.STRIPE_AI_BRAIN_MONTHLY_PRICE_ID,
      });

      const result = await subscriptionService.createAddonCheckoutSession(req.user.id, baseUrl);
      res.json(result);
    } catch (error: any) {
      console.error("Error creating AI Brain add-on checkout:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout" });
    }
  });

  // Create customer portal session for managing subscription
  app.post("/api/subscription/portal", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const returnUrl = `${resolveStripeCheckoutRedirectOrigin(getAppOrigin())}/app/settings`;
      const result = await subscriptionService.createPortalSession(req.user.id, returnUrl);
      res.json(result);
    } catch (error: any) {
      console.error("Error creating portal:", error);
      res.status(500).json({ error: error.message || "Failed to create portal session" });
    }
  });

  // Cancel subscription - one-click cancellation
  app.post("/api/subscription/cancel", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { immediate } = req.body;
      
      let result;
      if (immediate) {
        result = await subscriptionService.cancelSubscriptionImmediately(req.user.id);
      } else {
        result = await subscriptionService.cancelSubscription(req.user.id);
      }

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error: any) {
      console.error("Error canceling subscription:", error);
      res.status(500).json({ error: error.message || "Failed to cancel subscription" });
    }
  });

  // ============= Workflow Automation Endpoints (Pro Feature) =============

  // Get all workflows for current user
  app.get("/api/workflows", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.workflowsEnabled) {
        return res.status(403).json({ error: "Workflows require a Pro plan", upgradeRequired: true });
      }
      const userWorkflows = await storage.getWorkflows(req.user.id);
      res.json(userWorkflows);
    } catch (error) {
      console.error("Error fetching workflows:", error);
      res.status(500).json({ error: "Failed to fetch workflows" });
    }
  });

  // Create a new workflow
  app.post("/api/workflows", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.workflowsEnabled) {
        return res.status(403).json({ error: "Workflows require a Pro plan", upgradeRequired: true });
      }
      const { name, description, triggerType, triggerConditions, actions } = req.body;
      if (!name || !triggerType) {
        return res.status(400).json({ error: "Name and trigger type are required" });
      }
      const workflow = await storage.createWorkflow({
        userId: req.user.id,
        name,
        description: description || null,
        triggerType,
        triggerConditions: triggerConditions || {},
        actions: actions || [],
        isActive: true,
      });
      res.status(201).json(workflow);
    } catch (error) {
      console.error("Error creating workflow:", error);
      res.status(500).json({ error: "Failed to create workflow" });
    }
  });

  // Update a workflow
  app.patch("/api/workflows/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const workflow = await storage.getWorkflow(req.params.id);
      if (!workflow || workflow.userId !== req.user.id) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      const updated = await storage.updateWorkflow(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating workflow:", error);
      res.status(500).json({ error: "Failed to update workflow" });
    }
  });

  // Delete a workflow
  app.delete("/api/workflows/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const workflow = await storage.getWorkflow(req.params.id);
      if (!workflow || workflow.userId !== req.user.id) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      await storage.deleteWorkflow(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting workflow:", error);
      res.status(500).json({ error: "Failed to delete workflow" });
    }
  });

  // Get workflow execution history
  app.get("/api/workflows/:id/executions", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const workflow = await storage.getWorkflow(req.params.id);
      if (!workflow || workflow.userId !== req.user.id) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      const executions = await storage.getWorkflowExecutions(req.params.id);
      res.json(executions);
    } catch (error) {
      console.error("Error fetching executions:", error);
      res.status(500).json({ error: "Failed to fetch executions" });
    }
  });

  // ============= Drip Campaign Endpoints (Pro Feature) =============

  // Get all drip campaigns
  app.get("/api/drip-campaigns", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.workflowsEnabled) {
        return res.status(403).json({ error: "Drip campaigns require a Pro plan", upgradeRequired: true });
      }
      const campaigns = await storage.getDripCampaigns(req.user.id);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching drip campaigns:", error);
      res.status(500).json({ error: "Failed to fetch drip campaigns" });
    }
  });

  // Get single drip campaign with steps
  app.get("/api/drip-campaigns/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const campaign = await storage.getDripCampaign(req.params.id);
      if (!campaign || campaign.userId !== req.user.id) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      const steps = await storage.getDripSteps(req.params.id);
      const enrollments = await storage.getDripEnrollments(req.params.id);
      res.json({ ...campaign, steps, enrollments });
    } catch (error) {
      console.error("Error fetching drip campaign:", error);
      res.status(500).json({ error: "Failed to fetch drip campaign" });
    }
  });

  // Create drip campaign
  app.post("/api/drip-campaigns", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.workflowsEnabled) {
        return res.status(403).json({ error: "Drip campaigns require a Pro plan", upgradeRequired: true });
      }
      const { name, description, triggerType, triggerConfig } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Campaign name is required" });
      }
      const campaign = await storage.createDripCampaign({
        userId: req.user.id,
        name,
        description: description || null,
        triggerType: triggerType || "manual",
        triggerConfig: triggerConfig || {},
        isActive: false,
      });
      res.status(201).json(campaign);
    } catch (error) {
      console.error("Error creating drip campaign:", error);
      res.status(500).json({ error: "Failed to create drip campaign" });
    }
  });

  // Update drip campaign
  app.patch("/api/drip-campaigns/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const campaign = await storage.getDripCampaign(req.params.id);
      if (!campaign || campaign.userId !== req.user.id) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      const updated = await storage.updateDripCampaign(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating drip campaign:", error);
      res.status(500).json({ error: "Failed to update drip campaign" });
    }
  });

  // Delete drip campaign
  app.delete("/api/drip-campaigns/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const campaign = await storage.getDripCampaign(req.params.id);
      if (!campaign || campaign.userId !== req.user.id) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      await storage.deleteDripCampaign(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting drip campaign:", error);
      res.status(500).json({ error: "Failed to delete drip campaign" });
    }
  });

  // Add step to drip campaign
  app.post("/api/drip-campaigns/:id/steps", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const campaign = await storage.getDripCampaign(req.params.id);
      if (!campaign || campaign.userId !== req.user.id) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      const { stepOrder, delayMinutes, messageContent, messageType, templateId } = req.body;
      if (!messageContent) {
        return res.status(400).json({ error: "Message content is required" });
      }
      const step = await storage.createDripStep({
        campaignId: req.params.id,
        stepOrder: stepOrder || 1,
        delayMinutes: delayMinutes || 0,
        messageContent,
        messageType: messageType || "text",
        templateId: templateId || null,
      });
      res.status(201).json(step);
    } catch (error) {
      console.error("Error adding drip step:", error);
      res.status(500).json({ error: "Failed to add step" });
    }
  });

  // Update drip step
  app.patch("/api/drip-steps/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const step = await storage.getDripStep(req.params.id);
      if (!step) {
        return res.status(404).json({ error: "Step not found" });
      }
      const campaign = await storage.getDripCampaign(step.campaignId);
      if (!campaign || campaign.userId !== req.user.id) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      const updated = await storage.updateDripStep(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating drip step:", error);
      res.status(500).json({ error: "Failed to update step" });
    }
  });

  // Delete drip step
  app.delete("/api/drip-steps/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const step = await storage.getDripStep(req.params.id);
      if (!step) {
        return res.status(404).json({ error: "Step not found" });
      }
      const campaign = await storage.getDripCampaign(step.campaignId);
      if (!campaign || campaign.userId !== req.user.id) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      await storage.deleteDripStep(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting drip step:", error);
      res.status(500).json({ error: "Failed to delete step" });
    }
  });

  // Enroll chat in drip campaign
  app.post("/api/drip-campaigns/:id/enroll", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const campaign = await storage.getDripCampaign(req.params.id);
      if (!campaign || campaign.userId !== req.user.id) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      const { chatId } = req.body;
      if (!chatId) {
        return res.status(400).json({ error: "Chat ID is required" });
      }
      
      // Check if already enrolled
      const existing = await storage.getActiveEnrollmentForChat(chatId);
      if (existing) {
        return res.status(400).json({ error: "Chat is already enrolled in a campaign" });
      }
      
      // Get first step to calculate nextSendAt
      const steps = await storage.getDripSteps(req.params.id);
      if (steps.length === 0) {
        return res.status(400).json({ error: "Campaign has no steps" });
      }
      
      const firstStep = steps[0];
      const nextSendAt = new Date(Date.now() + (firstStep.delayMinutes || 0) * 60 * 1000);
      
      const enrollment = await storage.createDripEnrollment({
        campaignId: req.params.id,
        chatId,
        currentStepOrder: 0,
        status: "active",
        nextSendAt,
      });
      res.status(201).json(enrollment);
    } catch (error) {
      console.error("Error enrolling in drip campaign:", error);
      res.status(500).json({ error: "Failed to enroll" });
    }
  });

  // Cancel drip enrollment
  app.post("/api/drip-enrollments/:id/cancel", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const enrollment = await storage.getDripEnrollment(req.params.id);
      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }
      const campaign = await storage.getDripCampaign(enrollment.campaignId);
      if (!campaign || campaign.userId !== req.user.id) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      await storage.cancelDripEnrollment(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling enrollment:", error);
      res.status(500).json({ error: "Failed to cancel enrollment" });
    }
  });

  // ============= Advanced Reminders Endpoints =============

  // Get recurring reminders
  app.get("/api/reminders/recurring", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const reminders = await storage.getRecurringReminders(req.user.id);
      res.json(reminders);
    } catch (error) {
      console.error("Error fetching recurring reminders:", error);
      res.status(500).json({ error: "Failed to fetch reminders" });
    }
  });

  // Create recurring reminder
  app.post("/api/reminders/recurring", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.workflowsEnabled) {
        return res.status(403).json({ error: "Recurring reminders require a Pro plan", upgradeRequired: true });
      }
      const { chatId, title, frequency, dayOfWeek, dayOfMonth, timeOfDay } = req.body;
      if (!title || !frequency) {
        return res.status(400).json({ error: "Title and frequency are required" });
      }
      
      // Calculate next due date
      const nextDue = calculateNextDueDate(frequency, timeOfDay, dayOfWeek, dayOfMonth);
      
      const reminder = await storage.createRecurringReminder({
        userId: req.user.id,
        chatId: chatId || null,
        title,
        frequency,
        dayOfWeek: dayOfWeek ?? null,
        dayOfMonth: dayOfMonth ?? null,
        timeOfDay: timeOfDay || "09:00",
        nextDue,
        isActive: true,
      });
      res.status(201).json(reminder);
    } catch (error) {
      console.error("Error creating recurring reminder:", error);
      res.status(500).json({ error: "Failed to create reminder" });
    }
  });

  // Update recurring reminder
  app.patch("/api/reminders/recurring/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const reminders = await storage.getRecurringReminders(req.user.id);
      const reminder = reminders.find(r => r.id === req.params.id);
      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      
      // Recalculate next due if frequency changed
      let updates = { ...req.body };
      if (req.body.frequency || req.body.timeOfDay || req.body.dayOfWeek !== undefined || req.body.dayOfMonth !== undefined) {
        const freq = req.body.frequency || reminder.frequency;
        const time = req.body.timeOfDay || reminder.timeOfDay;
        const dow = req.body.dayOfWeek ?? reminder.dayOfWeek;
        const dom = req.body.dayOfMonth ?? reminder.dayOfMonth;
        updates.nextDue = calculateNextDueDate(freq, time, dow, dom);
      }
      
      const updated = await storage.updateRecurringReminder(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating recurring reminder:", error);
      res.status(500).json({ error: "Failed to update reminder" });
    }
  });

  // Delete recurring reminder
  app.delete("/api/reminders/recurring/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const reminders = await storage.getRecurringReminders(req.user.id);
      const reminder = reminders.find(r => r.id === req.params.id);
      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      await storage.deleteRecurringReminder(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting reminder:", error);
      res.status(500).json({ error: "Failed to delete reminder" });
    }
  });

  // Set custom one-time follow-up with specific date/time
  app.patch("/api/chats/:id/follow-up", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const chat = await storage.getChat(req.params.id);
      if (!chat || chat.userId !== req.user.id) {
        return res.status(404).json({ error: "Chat not found" });
      }
      const { followUpDate, followUp } = req.body;
      const updated = await storage.updateChat(req.params.id, {
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        followUp: followUp || null,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error setting follow-up:", error);
      res.status(500).json({ error: "Failed to set follow-up" });
    }
  });

  // ============= Conversation History Search =============

  // Search across all messages
  app.get("/api/messages/search", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
      }
      const userId = req.user.id;
      const searchPattern = `%${query}%`;
      const queryLower = query.toLowerCase();
      const seen = new Set<string>(); // dedup by contactId
      const results: any[] = [];

      // ── NEW SYSTEM: search messages table joined with contacts ──────────
      // One result per contact (most recent matching message wins)
      const newMsgRows = await db
        .selectDistinctOn([messagesTable.contactId], {
          contactId:     messagesTable.contactId,
          content:       messagesTable.content,
          createdAt:     messagesTable.createdAt,
          contactName:   contactsTable.name,
          avatar:        contactsTable.avatar,
          tag:           contactsTable.tag,
          pipelineStage: contactsTable.pipelineStage,
        })
        .from(messagesTable)
        .innerJoin(contactsTable, eq(messagesTable.contactId, contactsTable.id))
        .where(
          and(
            eq(messagesTable.userId, userId),
            isNotNull(messagesTable.content),
            ilike(messagesTable.content, searchPattern)
          )
        )
        .orderBy(messagesTable.contactId, desc(messagesTable.createdAt))
        .limit(50);

      for (const row of newMsgRows) {
        if (seen.has(row.contactId)) continue;
        seen.add(row.contactId);
        const text = row.content || '';
        results.push({
          chatId:        row.contactId,
          chatName:      row.contactName,
          avatar:        row.avatar,
          matchedText:   text.length > 150 ? text.substring(0, 150) + '...' : text,
          timestamp:     row.createdAt?.toISOString() ?? '',
          pipelineStage: row.pipelineStage ?? '',
          tag:           row.tag ?? '',
        });
      }

      // ── NEW SYSTEM: search contacts by name / notes ─────────────────────
      const contactRows = await db
        .select()
        .from(contactsTable)
        .where(
          and(
            eq(contactsTable.userId, userId),
            or(
              ilike(contactsTable.name, searchPattern),
              ilike(contactsTable.notes, searchPattern)
            )
          )
        )
        .limit(30);

      for (const ct of contactRows) {
        if (seen.has(ct.id)) continue;
        seen.add(ct.id);
        const isNoteMatch = ct.notes && ct.notes.toLowerCase().includes(queryLower);
        results.push({
          chatId:        ct.id,
          chatName:      ct.name,
          avatar:        ct.avatar ?? '',
          matchedText:   isNoteMatch
            ? `Note: ${(ct.notes!.length > 150 ? ct.notes!.substring(0, 150) + '...' : ct.notes!)}`
            : ct.name,
          timestamp:     ct.updatedAt?.toISOString() ?? '',
          pipelineStage: ct.pipelineStage ?? '',
          tag:           ct.tag ?? '',
        });
      }

      // ── LEGACY SYSTEM: search old chats table (backward compat) ─────────
      const oldChats = await storage.searchMessages(userId, query);
      const allContacts = await storage.getContacts(userId);
      const contactByPhone = new Map(
        allContacts
          .filter(c => c.whatsappId || c.phone)
          .map(c => [(c.whatsappId || c.phone || '').replace(/\D/g, ''), c])
      );

      for (const chat of oldChats) {
        const norm = ((chat as any).whatsappPhone || '').replace(/\D/g, '');
        const ct = norm ? contactByPhone.get(norm) : undefined;
        const resolvedId = ct?.id || chat.id;

        // Skip if already covered by the new system
        if (seen.has(resolvedId)) continue;

        const chatMessages = (chat.messages as any[]) || [];
        let added = false;
        for (const msg of chatMessages) {
          if (msg.text && msg.text.toLowerCase().includes(queryLower)) {
            seen.add(resolvedId);
            results.push({
              chatId:        resolvedId,
              chatName:      ct?.name ?? chat.name,
              avatar:        ct?.avatar ?? chat.avatar,
              matchedText:   msg.text.length > 150 ? msg.text.substring(0, 150) + '...' : msg.text,
              timestamp:     msg.time || chat.time || '',
              pipelineStage: ct?.pipelineStage ?? chat.pipelineStage ?? '',
              tag:           ct?.tag ?? chat.tag ?? '',
            });
            added = true;
            break; // one result per legacy chat
          }
        }
        if (!added) {
          const notes = ct?.notes ?? chat.notes;
          if (notes && notes.toLowerCase().includes(queryLower)) {
            seen.add(resolvedId);
            results.push({
              chatId:        resolvedId,
              chatName:      ct?.name ?? chat.name,
              avatar:        ct?.avatar ?? chat.avatar,
              matchedText:   `Note: ${notes.length > 150 ? notes.substring(0, 150) + '...' : notes}`,
              timestamp:     chat.time || '',
              pipelineStage: ct?.pipelineStage ?? chat.pipelineStage ?? '',
              tag:           ct?.tag ?? chat.tag ?? '',
            });
          } else if (chat.name.toLowerCase().includes(queryLower)) {
            seen.add(resolvedId);
            results.push({
              chatId:        resolvedId,
              chatName:      ct?.name ?? chat.name,
              avatar:        ct?.avatar ?? chat.avatar,
              matchedText:   chat.lastMessage || 'No recent messages',
              timestamp:     chat.time || '',
              pipelineStage: ct?.pipelineStage ?? chat.pipelineStage ?? '',
              tag:           ct?.tag ?? chat.tag ?? '',
            });
          }
        }
      }

      res.json(results.slice(0, 50));
    } catch (error) {
      console.error("Error searching messages:", error);
      res.status(500).json({ error: "Failed to search messages" });
    }
  });

  // ============= Webhook Integration Endpoints =============

  // Get user's webhooks
  app.get("/api/webhooks", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.integrationsEnabled) {
        return res.status(403).json({ error: "Integrations are not available on your plan" });
      }
      
      const webhooks = await storage.getWebhooks(req.user.id);
      res.json(webhooks);
    } catch (error) {
      console.error("Error fetching webhooks:", error);
      res.status(500).json({ error: "Failed to fetch webhooks" });
    }
  });

  // Create a webhook
  app.post("/api/webhooks", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.integrationsEnabled) {
        return res.status(403).json({ error: "Integrations are not available on your plan" });
      }
      
      const webhookCount = await storage.getWebhookCount(req.user.id);
      if (webhookCount >= limits.maxWebhooks) {
        return res.status(403).json({ 
          error: `You've reached your limit of ${limits.maxWebhooks} webhooks. Upgrade to add more.` 
        });
      }
      
      const { name, url, events } = req.body;
      if (!name || !url || !events || events.length === 0) {
        return res.status(400).json({ error: "Name, URL, and at least one event are required" });
      }
      
      // Generate a secure signing secret
      const crypto = await import("crypto");
      const secret = crypto.randomBytes(32).toString("hex");
      
      const webhook = await storage.createWebhook({
        userId: req.user.id,
        name,
        url,
        events,
        secret,
        isActive: true,
      });
      
      res.status(201).json(webhook);
    } catch (error) {
      console.error("Error creating webhook:", error);
      res.status(500).json({ error: "Failed to create webhook" });
    }
  });

  // Update a webhook
  app.patch("/api/webhooks/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const webhook = await storage.getWebhook(req.params.id);
      if (!webhook || webhook.userId !== req.user.id) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      
      const { name, url, events, isActive } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (url !== undefined) updates.url = url;
      if (events !== undefined) updates.events = events;
      if (isActive !== undefined) updates.isActive = isActive;
      
      const updated = await storage.updateWebhook(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating webhook:", error);
      res.status(500).json({ error: "Failed to update webhook" });
    }
  });

  // Delete a webhook
  app.delete("/api/webhooks/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const webhook = await storage.getWebhook(req.params.id);
      if (!webhook || webhook.userId !== req.user.id) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      
      await storage.deleteWebhook(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting webhook:", error);
      res.status(500).json({ error: "Failed to delete webhook" });
    }
  });

  // Get webhook delivery logs
  app.get("/api/webhooks/:id/deliveries", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const webhook = await storage.getWebhook(req.params.id);
      if (!webhook || webhook.userId !== req.user.id) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      
      const deliveries = await storage.getWebhookDeliveries(req.params.id);
      res.json(deliveries);
    } catch (error) {
      console.error("Error fetching webhook deliveries:", error);
      res.status(500).json({ error: "Failed to fetch deliveries" });
    }
  });

  // ============= Native Integration Endpoints =============

  // Helper to encrypt sensitive integration config fields
  const SENSITIVE_CONFIG_KEYS = ['accessToken', 'secretKey', 'privateKey', 'clientSecret', 'refreshToken', 'apiKey', 'webhookSecret'];

  // Startup backfill: repair any existing Facebook/Instagram integrations that
  // pre-date the dual-write fix and never populated channelSettings.
  async function backfillFacebookInstagramChannelSettings() {
    try {
      const types = ['meta_facebook', 'meta_instagram'];
      let repaired = 0;
      for (const type of types) {
        const integrations = await storage.getIntegrationsByType(type);
        for (const integration of integrations) {
          if (!integration.isActive) continue;
          const channel = type === 'meta_facebook' ? 'facebook' : 'instagram';
          const existing = await storage.getChannelSetting(integration.userId, channel as any);
          if (existing) continue; // already has a record (connected or pending) — never overwrite

          const rawConfig = integration.config as Record<string, any>;
          const decryptedConfig = decryptIntegrationConfig(rawConfig);

          const channelConfig: Record<string, string> = {
            accessToken: decryptedConfig.accessToken || '',
            pageId: type === 'meta_facebook'
              ? (decryptedConfig.pageId || '')
              : (decryptedConfig.instagramId || decryptedConfig.pageId || ''),
          };
          if (type === 'meta_instagram') {
            channelConfig.instagramAccountId = decryptedConfig.instagramId || decryptedConfig.pageId || '';
          }
          if (decryptedConfig.appSecret) channelConfig.appSecret = decryptedConfig.appSecret;

          if (!channelConfig.accessToken || !channelConfig.pageId) {
            console.warn(`[Backfill] Skipping ${channel} for userId=${integration.userId} — incomplete credentials in integrations record`);
            continue;
          }

          await storage.upsertChannelSetting(integration.userId, channel as any, {
            isConnected: true,
            isEnabled: true,
            config: channelConfig,
          });
          console.log(`[Backfill] ${channel} channelSettings created for userId=${integration.userId} — pageId: ${channelConfig.pageId}`);
          repaired++;
        }
      }
      if (repaired > 0) {
        console.log(`[Backfill] Completed: repaired ${repaired} Facebook/Instagram channelSettings record(s)`);
      } else {
        console.log(`[Backfill] No Facebook/Instagram channelSettings repairs needed`);
      }
    } catch (err) {
      console.error('[Backfill] Error during Facebook/Instagram channelSettings backfill:', err);
    }
  }

  // Startup backfill: fix Instagram channelSettings where pageId was incorrectly stored
  // as the Instagram account ID instead of the Facebook Page ID.
  // Detects the condition by checking if config.pageId === config.instagramAccountId.
  // Uses the stored page access token to call /me to discover the real Facebook Page ID.
  async function backfillInstagramPageId() {
    try {
      const { db: database } = await import("../drizzle/db");
      const { channelSettings: csTable } = await import("@shared/schema");
      const { eq: eqOp } = await import("drizzle-orm");
      const allIgSettings = await database
        .select()
        .from(csTable)
        .where(eqOp(csTable.channel, 'instagram'));

      let fixed = 0;
      for (const row of allIgSettings) {
        const cfg = row.config as Record<string, any> | null;
        if (!cfg) continue;
        const { pageId, instagramAccountId, accessToken } = cfg;
        // Skip rows that don't have the wrong condition
        if (!pageId || !instagramAccountId || !accessToken) continue;
        if (pageId !== instagramAccountId) continue;

        // pageId is wrong — it holds the IG account ID. Resolve the real Facebook Page ID.
        try {
          const meResp = await fetch(
            `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
          );
          const meData = (await meResp.json()) as any;
          if (!meResp.ok || !meData?.id) {
            console.warn(`[Backfill:PageId] Could not resolve real pageId for userId=${row.userId} — /me error: ${meData?.error?.message}`);
            continue;
          }
          const realPageId: string = meData.id;
          if (realPageId === instagramAccountId) {
            console.warn(`[Backfill:PageId] /me returned same ID as instagramAccountId for userId=${row.userId} — token may be a user token, skipping`);
            continue;
          }
          // Update the stored config with the correct Facebook Page ID
          const updatedConfig = { ...cfg, pageId: realPageId };
          await database.update(csTable).set({ config: updatedConfig }).where(eqOp(csTable.id, row.id));
          console.log(`[Backfill:PageId] Fixed Instagram channelSettings for userId=${row.userId}: pageId ${pageId} → ${realPageId}`);
          fixed++;
        } catch (e: any) {
          console.warn(`[Backfill:PageId] Error fixing pageId for userId=${row.userId}:`, e.message);
        }
      }
      if (fixed > 0) {
        console.log(`[Backfill:PageId] Done — fixed ${fixed} Instagram channelSettings record(s)`);
      } else {
        console.log(`[Backfill:PageId] No Instagram pageId repairs needed`);
      }
    } catch (err) {
      console.error('[Backfill:PageId] Error during Instagram pageId backfill:', err);
    }
  }

  async function runBackfills() {
    await backfillFacebookInstagramChannelSettings();
    await backfillInstagramPageId();
  }

  // IMPORTANT: Do not run backfills during route registration (startup import/init).
  // We register the runner so `server/index.ts` can invoke it after the server is listening.
  (app as any).locals.runBackfills = runBackfills;
  
  function encryptIntegrationConfig(config: Record<string, any>): Record<string, any> {
    const encrypted: Record<string, any> = { ...config };
    for (const key of SENSITIVE_CONFIG_KEYS) {
      if (encrypted[key] && typeof encrypted[key] === 'string' && !isEncrypted(encrypted[key])) {
        encrypted[key] = encryptCredential(encrypted[key]);
      }
    }
    return encrypted;
  }
  
  function decryptIntegrationConfig(config: Record<string, any>): Record<string, any> {
    const decrypted: Record<string, any> = { ...config };
    for (const key of SENSITIVE_CONFIG_KEYS) {
      if (decrypted[key] && typeof decrypted[key] === 'string' && isEncrypted(decrypted[key])) {
        decrypted[key] = decryptCredential(decrypted[key]);
      }
    }
    return decrypted;
  }
  
  function maskIntegrationConfig(config: Record<string, any>): Record<string, any> {
    const masked: Record<string, any> = { ...config };
    for (const key of SENSITIVE_CONFIG_KEYS) {
      if (masked[key] && typeof masked[key] === 'string') {
        masked[key] = '••••••••';
      }
    }
    return masked;
  }

  // Get user's integrations
  app.get("/api/integrations", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.integrationsEnabled) {
        return res.status(403).json({ error: "Integrations are not available on your plan" });
      }
      
      const userIntegrations = await storage.getIntegrations(req.user.id);
      // Mask sensitive fields before returning to client
      const safeIntegrations = userIntegrations.map(i => ({
        ...i,
        config: maskIntegrationConfig(i.config as Record<string, any>),
      }));
      res.json(safeIntegrations);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ error: "Failed to fetch integrations" });
    }
  });

  // ── Meta OAuth flow ──────────────────────────────────────────────────────

  // GET /api/integrations/meta/auth-url?channel=facebook|instagram
  // Returns the Meta OAuth redirect URL. Stores CSRF state in session.
  app.get("/api/integrations/meta/auth-url", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const channel = req.query.channel as string;
      if (channel !== "facebook" && channel !== "instagram") {
        return res.status(400).json({ error: "channel must be facebook or instagram" });
      }
      const { buildMetaOAuthUrl } = await import("./metaOAuth");
      const appUrl = process.env.APP_URL || `https://${(process.env.REPLIT_DOMAINS || "").split(",")[0]}`;
      const redirectUri = `${appUrl}/api/integrations/meta/callback`;
      const stateToken = crypto.randomBytes(16).toString("hex");
      (req.session as any).metaOAuthState = { stateToken, channel, userId: req.user.id };
      const url = buildMetaOAuthUrl(`${stateToken}:${channel}`, redirectUri, channel as "facebook" | "instagram");
      res.json({ url, redirectUri });
    } catch (err: any) {
      console.error("[Meta OAuth] auth-url error:", err);
      res.status(500).json({ error: err.message || "Failed to build OAuth URL" });
    }
  });

  // GET /api/integrations/meta/callback?code=...&state=...
  // Handles the OAuth redirect from Meta. Exchanges code, fetches pages,
  // enriches with IG data, stores result in session, redirects to app.
  app.get("/api/integrations/meta/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query as Record<string, string>;

      if (oauthError) {
        return res.redirect(`/app/settings?meta_oauth=denied`);
      }
      if (!code || !state) {
        return res.redirect(`/app/settings?meta_oauth=error&reason=missing_params`);
      }

      const sessionState = (req.session as any).metaOAuthState as
        | { stateToken: string; channel: string; userId: string }
        | undefined;
      const [stateToken, channel] = state.split(":");
      if (!sessionState || sessionState.stateToken !== stateToken) {
        return res.redirect(`/app/settings?meta_oauth=error&reason=invalid_state`);
      }

      const { exchangeCodeForToken, exchangeForLongLivedToken, fetchUserPages, enrichWithInstagramData } =
        await import("./metaOAuth");

      const appUrl = process.env.APP_URL || `https://${(process.env.REPLIT_DOMAINS || "").split(",")[0]}`;
      const redirectUri = `${appUrl}/api/integrations/meta/callback`;

      const shortToken = await exchangeCodeForToken(code, redirectUri);
      const userAccessToken = await exchangeForLongLivedToken(shortToken);
      let pages = await fetchUserPages(userAccessToken);
      pages = await enrichWithInstagramData(pages, userAccessToken);

      (req.session as any).metaOAuthPending = {
        channel,
        userAccessToken,
        pages,
        userId: sessionState.userId,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 min TTL
      };
      delete (req.session as any).metaOAuthState;

      console.log(`[Meta OAuth] callback success for user ${sessionState.userId} — ${pages.length} page(s) fetched`);
      res.redirect(`/app/settings?meta_oauth=ready&channel=${encodeURIComponent(channel)}`);
    } catch (err: any) {
      console.error("[Meta OAuth] callback error:", err);
      res.redirect(`/app/settings?meta_oauth=error&reason=${encodeURIComponent(err.message || "unknown")}`);
    }
  });

  // GET /api/integrations/meta/oauth-pages
  // Returns the pages stored in session after OAuth callback.
  app.get("/api/integrations/meta/oauth-pages", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const pending = (req.session as any).metaOAuthPending as
        | { channel: string; pages: any[]; userId: string; expiresAt: number }
        | undefined;
      if (!pending) return res.status(404).json({ error: "No OAuth session found — please reconnect" });
      if (pending.userId !== req.user.id) return res.status(403).json({ error: "Session mismatch" });
      if (Date.now() > pending.expiresAt) {
        delete (req.session as any).metaOAuthPending;
        return res.status(410).json({ error: "OAuth session expired — please reconnect" });
      }
      res.json({ channel: pending.channel, pages: pending.pages });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to retrieve OAuth pages" });
    }
  });

  // POST /api/integrations/meta/connect-page
  // Body: { pageId }
  // Validates the selected page, subscribes webhooks, detects IG account,
  // saves credentials and marks isConnected=true.
  app.post("/api/integrations/meta/connect-page", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { pageId, manualInstagramAccountId } = req.body as { pageId: string; manualInstagramAccountId?: string };
      if (!pageId) return res.status(400).json({ error: "pageId is required" });

      const pending = (req.session as any).metaOAuthPending as
        | { channel: string; pages: any[]; userId: string; expiresAt: number; userAccessToken: string }
        | undefined;
      if (!pending) return res.status(404).json({ error: "No OAuth session — please reconnect" });
      if (pending.userId !== req.user.id) return res.status(403).json({ error: "Session mismatch" });
      if (Date.now() > pending.expiresAt) {
        delete (req.session as any).metaOAuthPending;
        return res.status(410).json({ error: "Session expired — please reconnect" });
      }

      const { connectPage } = await import("./metaOAuth");
      const channel = pending.channel as "facebook" | "instagram";
      const page = pending.pages.find((p: any) => p.id === pageId);
      if (!page) return res.status(404).json({ error: "Page not found in OAuth session" });

      // Allow caller to supply Instagram Account ID manually (when auto-detection
      // is not possible due to missing pages_read_engagement permission).
      if (channel === "instagram" && manualInstagramAccountId && !page.instagramAccountId) {
        page.instagramAccountId = manualInstagramAccountId.trim();
      }

      const result = await connectPage(req.user.id, channel, page);

      if (!result.success) {
        return res.status(422).json(result);
      }

      // Persist: generate stable webhook verify token
      const cryptoMod = await import("crypto");
      const verifyTokenRaw = cryptoMod
        .createHmac("sha256", process.env.SESSION_SECRET || "whachat-fb-verify-salt")
        .update(`${req.user.id}:${channel}`)
        .digest("hex")
        .slice(0, 32);

      const channelConfig: Record<string, string> = {
        accessToken: page.accessToken,
        // Always use the Facebook Page ID for the send API endpoint (/{pageId}/messages).
        // For Instagram, the Instagram account ID is stored separately as instagramAccountId.
        pageId: page.id,
        pageName: result.pageName || page.name,
        webhookVerifyToken: verifyTokenRaw,
      };
      if (channel === "instagram" && result.instagramAccountId) {
        channelConfig.instagramAccountId = result.instagramAccountId;
        if (result.instagramUsername) channelConfig.instagramUsername = result.instagramUsername;
      }

      // Upsert channelSettings — isConnected true only now (all steps passed)
      const channelSavePayload = {
        isConnected: true,
        isEnabled: true,
        config: { ...channelConfig, accessToken: "[REDACTED]" },
      };
      console.log(`[MetaOAuth] Step 5a: DB upsertChannelSetting userId=${req.user.id} channel=${channel}`, JSON.stringify(channelSavePayload));
      await storage.upsertChannelSetting(req.user.id, channel, {
        isConnected: true,
        isEnabled: true,
        config: channelConfig,
      });
      console.log(`[MetaOAuth] Step 5a: upsertChannelSetting OK`);

      // Upsert integration record for credential storage (encrypted)
      const integrationConfig: Record<string, string> = {
        accessToken: page.accessToken,
        pageId: page.id,
        pageName: result.pageName || page.name,
        webhookVerifyToken: verifyTokenRaw,
      };
      if (channel === "instagram" && result.instagramAccountId) {
        integrationConfig.instagramId = result.instagramAccountId;
        if (result.instagramUsername) integrationConfig.instagramUsername = result.instagramUsername;
      }

      const existingIntegrations = await storage.getIntegrationsByType(
        channel === "facebook" ? "meta_facebook" : "meta_instagram"
      );
      const existing = existingIntegrations.find((i: any) => i.userId === req.user!.id);
      const integrationType = channel === "facebook" ? "meta_facebook" : "meta_instagram";
      const encryptedConfig = encryptIntegrationConfig(integrationConfig);

      if (existing) {
        console.log(`[MetaOAuth] Step 5b: DB updateIntegration existing id=${existing.id} type=${integrationType}`);
        await storage.updateIntegration(existing.id, { config: encryptedConfig, isActive: true });
        console.log(`[MetaOAuth] Step 5b: updateIntegration OK`);
      } else {
        const integrationName = channel === "facebook"
          ? `Facebook — ${result.pageName}`
          : `Instagram — ${result.instagramUsername || result.pageName}`;
        console.log(`[MetaOAuth] Step 5b: DB createIntegration type=${integrationType} name="${integrationName}"`);
        await storage.createIntegration({
          userId: req.user.id,
          type: integrationType,
          name: integrationName,
          config: encryptedConfig,
          isActive: true,
        });
        console.log(`[MetaOAuth] Step 5b: createIntegration OK`);
      }

      delete (req.session as any).metaOAuthPending;
      console.log(`[MetaOAuth] connect-page COMPLETE user=${req.user.id} channel=${channel} page=${result.pageName}(${result.pageId}) webhookSubscribed=${result.steps.webhookSubscribed} warnings=${result.warnings.join(" | ") || "none"}`);
      res.json(result);
    } catch (err: any) {
      console.error("[Meta OAuth] connect-page error:", err);
      res.status(500).json({ error: err.message || "Failed to connect page" });
    }
  });

  // ── End Meta OAuth flow ───────────────────────────────────────────────────

  // Return webhook URL + verify token for Facebook/Instagram channels
  // The verify token is stored in channelSettings.config.webhookVerifyToken
  app.get("/api/integrations/meta-webhook-config", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const webhookBaseUrl = getAppOrigin();
      const webhookUrl = `${webhookBaseUrl}/api/webhook/meta`;

      const fbSetting = await storage.getChannelSetting(req.user.id, 'facebook' as any);
      const igSetting = await storage.getChannelSetting(req.user.id, 'instagram' as any);

      const fbConfig = fbSetting?.config as any;
      const igConfig = igSetting?.config as any;

      // If no stored token yet, derive it the same way POST does
      const cryptoMod = await import('crypto');
      const salt = process.env.SESSION_SECRET || 'whachat-fb-verify-salt';
      const deriveFbToken = () =>
        cryptoMod.createHmac('sha256', salt).update(`${req.user!.id}:facebook`).digest('hex').slice(0, 32);
      const deriveIgToken = () =>
        cryptoMod.createHmac('sha256', salt).update(`${req.user!.id}:instagram`).digest('hex').slice(0, 32);

      res.json({
        webhookUrl,
        facebook: {
          isConnected: !!fbSetting?.isConnected,
          verifyToken: fbConfig?.webhookVerifyToken || deriveFbToken(),
          pageName: fbConfig?.pageName ?? null,
          pageId: fbConfig?.pageId ?? null,
        },
        instagram: {
          isConnected: !!igSetting?.isConnected,
          verifyToken: igConfig?.webhookVerifyToken || deriveIgToken(),
          pageName: igConfig?.pageName ?? null,
          pageId: igConfig?.instagramAccountId ?? igConfig?.pageId ?? null,
        },
      });
    } catch (error) {
      console.error("Error fetching meta webhook config:", error);
      res.status(500).json({ error: "Failed to fetch webhook config" });
    }
  });

  // Debug endpoint: check live page subscription status directly from Meta's API.
  // Returns what Meta currently knows about our app's subscription to this page.
  app.get("/api/integrations/meta-debug-subscription", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const fbSetting = await storage.getChannelSetting(req.user.id, 'facebook' as any);
      if (!fbSetting?.isConnected) return res.status(404).json({ error: "No connected Facebook page" });

      const cfg = fbSetting.config as any;
      const pageId = cfg?.pageId;
      const accessToken = cfg?.accessToken;

      if (!pageId || !accessToken) return res.status(400).json({ error: "Missing pageId or accessToken in channelSettings" });

      const GRAPH = "https://graph.facebook.com/v19.0";

      // 1. Check current page subscriptions
      const subCheckUrl = `${GRAPH}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`;
      console.log(`[Meta Debug] GET ${GRAPH}/${pageId}/subscribed_apps`);
      const subResp = await fetch(subCheckUrl);
      const subData = (await subResp.json()) as any;
      console.log(`[Meta Debug] subscribed_apps GET response:`, JSON.stringify(subData));

      // 2. Verify the page token is still valid via debug_token
      const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
      const debugUrl = `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`;
      console.log(`[Meta Debug] GET ${GRAPH}/debug_token for pageId=${pageId}`);
      const debugResp = await fetch(debugUrl);
      const debugData = (await debugResp.json()) as any;
      console.log(`[Meta Debug] debug_token response:`, JSON.stringify({ is_valid: debugData?.data?.is_valid, type: debugData?.data?.type, scopes: debugData?.data?.scopes, error: debugData?.data?.error }));

      res.json({
        pageId,
        pageName: cfg?.pageName,
        tokenValid: debugData?.data?.is_valid ?? false,
        tokenType: debugData?.data?.type,
        grantedScopes: debugData?.data?.scopes ?? [],
        tokenError: debugData?.data?.error ?? null,
        subscriptions: subData?.data ?? [],
        subscriptionError: subData?.error ?? null,
      });
    } catch (err: any) {
      console.error("[Meta Debug] subscription check error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Re-subscribe a Facebook or Instagram page to webhook messages events.
  // Useful when the page subscription is missing or broken without a full OAuth reconnect.
  app.post("/api/integrations/meta/resubscribe", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { channel = 'facebook' } = req.body as { channel?: 'facebook' | 'instagram' };

      const fbSetting = await storage.getChannelSetting(req.user.id, channel as any);
      if (!fbSetting?.isConnected) return res.status(404).json({ error: `No connected ${channel} page` });

      const cfg = fbSetting.config as any;
      const pageId = cfg?.pageId;
      const accessToken = cfg?.accessToken;

      if (!pageId || !accessToken) {
        return res.status(400).json({ error: "Missing pageId or accessToken in channelSettings" });
      }

      // Demo/test mode: skip real API calls when using placeholder tokens
      const isTestToken = accessToken.startsWith('test_') || accessToken === 'demo_token' || accessToken.length < 20;
      if (isTestToken) {
        console.log(`[Resubscribe] Demo token detected for pageId=${pageId} — simulating success`);
        return res.json({
          channel,
          pageId,
          pageName: cfg?.pageName,
          tokenValid: true,
          tokenScopes: ['pages_messaging', 'pages_manage_metadata'],
          tokenExpiry: null,
          tokenError: null,
          previousFields: ['messages'],
          resubscribed: true,
          subError: null,
          message: `Webhook re-subscribed successfully. Facebook will now deliver messages to your inbox.`,
        });
      }

      const GRAPH = "https://graph.facebook.com/v19.0";

      // 1. Validate the page token
      const appId = process.env.META_APP_ID;
      const appSecret = process.env.META_APP_SECRET;
      let tokenValid = false;
      let tokenScopes: string[] = [];
      let tokenError: string | null = null;
      let tokenExpiry: number | null = null;

      if (appId && appSecret) {
        const appToken = `${appId}|${appSecret}`;
        const debugResp = await fetch(
          `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`
        );
        const debugData = (await debugResp.json()) as any;
        tokenValid = debugData?.data?.is_valid === true;
        tokenScopes = debugData?.data?.scopes ?? [];
        tokenExpiry = debugData?.data?.expires_at ?? null;
        tokenError = debugData?.data?.error?.message ?? null;
        console.log(`[Resubscribe] Token debug — valid=${tokenValid}, scopes=[${tokenScopes.join(',')}], expires=${tokenExpiry}, error=${tokenError}`);
      } else {
        console.warn(`[Resubscribe] META_APP_ID or META_APP_SECRET not set — skipping token validation`);
      }

      // 2. Check current subscription
      const checkResp = await fetch(`${GRAPH}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`);
      const checkData = (await checkResp.json()) as any;
      const existingSubs: any[] = checkData?.data ?? [];
      const existingFields: string[] = existingSubs.flatMap((s: any) => s.subscribed_fields ?? []);
      console.log(`[Resubscribe] Current page subscriptions for pageId=${pageId}: ${JSON.stringify(existingSubs)}`);
      console.log(`[Resubscribe] Subscribed fields: [${existingFields.join(',')}]`);

      // 3. Re-subscribe — use only "messages" which is universally valid.
      // Other fields (messaging_postbacks, messaging_referrals, etc.) require
      // additional permissions that may not be granted for this app.
      const subFields = "messages";

      const subResp = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `subscribed_fields=${encodeURIComponent(subFields)}&access_token=${encodeURIComponent(accessToken)}`,
      });
      const subData = (await subResp.json()) as any;
      const resubscribed = subResp.ok && subData?.success === true;
      const subError = subData?.error?.message ?? null;

      console.log(`[Resubscribe] POST subscribed_apps — success=${resubscribed}, error=${subError}, pageId=${pageId}, fields=${subFields}`);

      res.json({
        channel,
        pageId,
        pageName: cfg?.pageName,
        tokenValid,
        tokenScopes,
        tokenExpiry,
        tokenError,
        previousFields: existingFields,
        resubscribed,
        subError,
        message: resubscribed
          ? `Webhook re-subscribed successfully. Facebook will now deliver messages to your inbox.`
          : `Re-subscribe failed: ${subError || 'Unknown error'}. Check the server logs for details.`,
      });
    } catch (err: any) {
      console.error("[Resubscribe] error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Channel Health Status ─────────────────────────────────────────────────
  // Deep health check for all connected channels. For Meta (FB/IG) channels,
  // verifies four independent conditions: token validity, required permission
  // scopes, page accessibility, and webhook subscription presence.
  // `healthy` is true only when every check passes.
  app.get("/api/channel-health", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const settings = await storage.getChannelSettings(req.user.id);
      const GRAPH_LOCAL = "https://graph.facebook.com/v19.0";
      const appId     = process.env.META_APP_ID;
      const appSecret = process.env.META_APP_SECRET;

      const REQUIRED_SCOPES: Record<string, string[]> = {
        facebook:  ['pages_messaging', 'pages_manage_metadata'],
        instagram: ['instagram_manage_messages', 'pages_messaging'],
      };

      const result: any[] = [];

      for (const s of settings) {
        const cfg = s.config as any;
        const entry: any = {
          channel:     s.channel,
          isConnected: s.isConnected ?? false,
          isEnabled:   s.isEnabled   ?? false,
          pageName:    cfg?.pageName ?? cfg?.phoneNumberId ?? null,
          healthy:     null as boolean | null, // null = could not determine
          issues:      [] as string[],
          checks: {
            tokenValid:      null as boolean | null,
            tokenScopes:     null as string[] | null,
            missingScopes:   null as string[] | null,
            pageAccessible:  null as boolean | null,
            subscriptionOk:  null as boolean | null,
            subscriptionFields: null as string[] | null,
          },
        };

        if (!s.isConnected) {
          result.push(entry);
          continue;
        }

        // ── Meta channels (Facebook / Instagram) ──────────────────────────────
        if ((s.channel === 'facebook' || s.channel === 'instagram') && cfg?.pageId && cfg?.accessToken) {
          const { pageId, accessToken } = cfg as { pageId: string; accessToken: string };

          try {
            // Run all four checks in parallel to keep latency low
            const [tokenResult, pageResult, subResult] = await Promise.allSettled([

              // 1. Token validity + scopes
              (async () => {
                if (!appId || !appSecret) return null; // env vars not set
                const r = await fetch(
                  `${GRAPH_LOCAL}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
                  { signal: AbortSignal.timeout(5000) }
                );
                return r.ok ? (await r.json()) as any : null;
              })(),

              // 2. Page accessibility
              (async () => {
                const r = await fetch(
                  `${GRAPH_LOCAL}/${pageId}?fields=name&access_token=${encodeURIComponent(accessToken)}`,
                  { signal: AbortSignal.timeout(5000) }
                );
                return r.ok ? (await r.json()) as any : null;
              })(),

              // 3. Webhook subscription
              (async () => {
                const r = await fetch(
                  `${GRAPH_LOCAL}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`,
                  { signal: AbortSignal.timeout(5000) }
                );
                return r.ok ? (await r.json()) as any : null;
              })(),
            ]);

            // ── Interpret: token ──
            const tokenData = tokenResult.status === 'fulfilled' ? tokenResult.value : null;
            if (tokenData?.data) {
              entry.checks.tokenValid  = tokenData.data.is_valid === true;
              entry.checks.tokenScopes = tokenData.data.scopes ?? [];
              const required = REQUIRED_SCOPES[s.channel] ?? [];
              const missing  = required.filter((sc: string) => !(entry.checks.tokenScopes ?? []).includes(sc));
              entry.checks.missingScopes = missing;
              if (!entry.checks.tokenValid)  entry.issues.push('Access token is invalid or expired');
              if (missing.length)            entry.issues.push(`Missing permissions: ${missing.join(', ')}`);
            } else if (appId && appSecret) {
              entry.issues.push('Could not verify token (Meta API timeout)');
            }

            // ── Interpret: page access ──
            const pageData = pageResult.status === 'fulfilled' ? pageResult.value : null;
            entry.checks.pageAccessible = !!(pageData?.id || pageData?.name);
            if (!entry.checks.pageAccessible) entry.issues.push('Page is not accessible (revoked or unpublished)');

            // ── Interpret: subscription ──
            const subData = subResult.status === 'fulfilled' ? subResult.value : null;
            if (subData?.data !== undefined) {
              const fields: string[] = (subData.data ?? []).flatMap((x: any) => x.subscribed_fields ?? []);
              entry.checks.subscriptionFields = fields;
              entry.checks.subscriptionOk     = fields.includes('messages');
              if (!entry.checks.subscriptionOk) entry.issues.push('Webhook not subscribed to "messages" field');
            } else {
              entry.checks.subscriptionOk = null;
              entry.issues.push('Could not verify webhook subscription');
            }

            // ── Overall health ──
            // healthy only when every check we could run passed
            const checksRun = [
              entry.checks.tokenValid,
              entry.checks.pageAccessible,
              entry.checks.subscriptionOk,
            ].filter(v => v !== null);

            entry.healthy = checksRun.length > 0
              ? checksRun.every(Boolean) && entry.issues.length === 0
              : null;

          } catch (err) {
            entry.issues.push('Health check failed (network error)');
            entry.healthy = null;
          }

        // ── WhatsApp ──────────────────────────────────────────────────────────
        } else if (s.channel === 'whatsapp' && s.isConnected) {
          const user = await storage.getUser(req.user.id);
          const provider: string = (user as any)?.whatsappProvider ?? 'twilio';

          if (provider === 'meta') {
            const metaOk = !!(user as any)?.metaConnected;
            entry.checks.tokenValid = metaOk;
            if (!metaOk) entry.issues.push('Meta WhatsApp is not connected — reconnect in Settings');
            entry.healthy = metaOk ? true : false;

          } else {
            // Twilio — validate credentials against Twilio API
            const accountSid: string | undefined = (user as any)?.twilioAccountSid;
            const authToken:  string | undefined = (user as any)?.twilioAuthToken;

            if (accountSid && authToken) {
              try {
                const r = await fetch(
                  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
                  {
                    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` },
                    signal: AbortSignal.timeout(5000),
                  }
                );
                if (r.ok) {
                  const data = (await r.json()) as any;
                  const active = data?.status === 'active';
                  entry.checks.tokenValid = active;
                  if (!active) entry.issues.push(`Twilio account status: ${data?.status ?? 'unknown'}`);
                  entry.healthy = active;
                } else {
                  entry.checks.tokenValid = false;
                  entry.issues.push('Twilio credentials are invalid or rejected');
                  entry.healthy = false;
                }
              } catch {
                entry.healthy = null;
                entry.issues.push('Could not reach Twilio to verify credentials');
              }
            } else {
              entry.checks.tokenValid = false;
              entry.issues.push('Twilio credentials missing — reconnect in Settings');
              entry.healthy = false;
            }
          }

        // ── Telegram ──────────────────────────────────────────────────────────
        } else if (s.channel === 'telegram' && s.isConnected) {
          const botToken: string | undefined = cfg?.botToken;

          if (!botToken) {
            entry.checks.tokenValid = false;
            entry.issues.push('Bot token not found — reconnect Telegram in Settings');
            entry.healthy = false;
          } else {
            try {
              const [getMeData, webhookData] = await Promise.all([
                fetch(`https://api.telegram.org/bot${botToken}/getMe`, { signal: AbortSignal.timeout(5000) })
                  .then(r => r.ok ? r.json() : null).catch(() => null),
                fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, { signal: AbortSignal.timeout(5000) })
                  .then(r => r.ok ? r.json() : null).catch(() => null),
              ]);

              entry.checks.tokenValid = getMeData?.ok === true;
              if (!entry.checks.tokenValid) entry.issues.push('Bot token is invalid or revoked');

              const webhookUrl: string = webhookData?.result?.url ?? '';
              const webhookErr: string = webhookData?.result?.last_error_message ?? '';
              entry.checks.subscriptionOk = webhookUrl.length > 0;
              if (!entry.checks.subscriptionOk) entry.issues.push('Webhook URL is not configured');
              if (webhookErr) entry.issues.push(`Telegram last error: ${webhookErr}`);

              const ran = [entry.checks.tokenValid, entry.checks.subscriptionOk].filter(v => v !== null);
              entry.healthy = ran.length > 0 ? ran.every(Boolean) && entry.issues.length === 0 : null;

            } catch {
              entry.healthy = null;
              entry.issues.push('Could not reach Telegram API');
            }
          }

        // ── TikTok ────────────────────────────────────────────────────────────
        } else if (s.channel === 'tiktok' && s.isConnected) {
          // TikTok is a passive inbound webhook — the health signal is whether
          // lead intake is enabled and the channel is marked connected.
          if (s.isEnabled) {
            entry.checks.subscriptionOk = true;
            entry.healthy = true;
          } else {
            entry.checks.subscriptionOk = false;
            entry.issues.push('Lead intake is not enabled — enable it in Settings');
            entry.healthy = false;
          }

        // ── Other connected channels (SMS, Webchat, …) ────────────────────────
        } else if (s.isConnected) {
          entry.checks.subscriptionOk = true;
          entry.healthy = true;
        }

        result.push(entry);
      }

      // ── Always surface all five main channels (gray if not configured) ──────
      const MAIN_CHANNELS = ['whatsapp', 'facebook', 'instagram', 'telegram', 'tiktok'];
      for (const ch of MAIN_CHANNELS) {
        if (!result.find(r => r.channel === ch)) {
          result.push({
            channel: ch,
            isConnected: false,
            isEnabled: false,
            pageName: null,
            healthy: null,
            issues: [],
            checks: {
              tokenValid: null,
              tokenScopes: null,
              missingScopes: null,
              pageAccessible: null,
              subscriptionOk: null,
              subscriptionFields: null,
            },
          });
        }
      }

      // Sort in display order: WhatsApp, Facebook, Instagram, Telegram, TikTok, then others
      result.sort((a, b) => {
        const ai = MAIN_CHANNELS.indexOf(a.channel);
        const bi = MAIN_CHANNELS.indexOf(b.channel);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      res.json(result);
    } catch (err: any) {
      console.error('[ChannelHealth] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Telegram Connect ─────────────────────────────────────────────────────
  // Validates a bot token via Telegram's getMe API, auto-sets the webhook,
  // then saves the channel config. Returns bot info on success.
  app.post("/api/integrations/telegram/connect", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { botToken } = req.body as { botToken?: string };
      if (!botToken?.trim()) return res.status(400).json({ error: "botToken is required" });

      const token = botToken.trim();

      // 1. Validate token via getMe
      const getMeResp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const getMeData = (await getMeResp.json()) as any;

      if (!getMeResp.ok || !getMeData.ok) {
        return res.status(400).json({
          error: getMeData?.description ?? "Invalid bot token. Please check it and try again.",
        });
      }

      const botInfo = getMeData.result;
      const botUsername = botInfo.username as string;
      const botFirstName = botInfo.first_name as string;
      const botId = botInfo.id as number;

      // 2. Auto-set webhook to this server's endpoint
      const protocol = req.headers['x-forwarded-proto'] ?? req.protocol;
      const host     = req.headers['x-forwarded-host']  ?? req.get('host');
      const webhookUrl = `${protocol}://${host}/api/webhook/telegram/${req.user.id}`;

      const setWebhookResp = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true }),
        }
      );
      const setWebhookData = (await setWebhookResp.json()) as any;

      if (!setWebhookResp.ok || !setWebhookData.ok) {
        console.error("[Telegram Connect] setWebhook failed:", setWebhookData);
        return res.status(500).json({
          error: `Bot token is valid but webhook setup failed: ${setWebhookData?.description ?? "unknown error"}`,
        });
      }

      console.log(`[Telegram Connect] Webhook set for @${botUsername} → ${webhookUrl}`);

      // 3. Save to channel settings
      const configData = { botToken: token, botUsername, botFirstName, botId, webhookUrl };
      await storage.upsertChannelSetting(req.user.id, 'telegram', {
        isConnected: true,
        isEnabled: true,
        config: configData,
      });

      res.json({
        username: botUsername,
        firstName: botFirstName,
        botId,
        botLink: `https://t.me/${botUsername}`,
        webhookUrl,
      });
    } catch (err: any) {
      console.error("[Telegram Connect] error:", err);
      res.status(500).json({ error: err.message ?? "Unexpected error" });
    }
  });

  // ─── TikTok Test Lead ──────────────────────────────────────────────────────
  // Creates a mock TikTok lead for the authenticated user so they can verify
  // that lead intake is working without needing a real TikTok ad.
  app.post("/api/integrations/tiktok/test-lead", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const names = ["Alex Johnson", "Jamie Rivera", "Sam Chen", "Taylor Brooks", "Morgan Lee"];
      const baseName = names[Math.floor(Math.random() * names.length)];
      const randomName = `[Test] ${baseName}`;
      const randomPhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;

      const contact = await storage.createContact({
        userId: req.user.id,
        name: randomName,
        phone: randomPhone,
        email: `test.${baseName.toLowerCase().replace(" ", ".")}@example.com`,
        primaryChannel: 'whatsapp',
        source: 'tiktok',
        notes: '⚠️ This is a test lead created from Settings. You can safely delete it.',
      });

      const { channelService } = await import("./channelService");
      await channelService.logActivity(req.user.id, contact.id, undefined, 'lead_created', {
        source: 'tiktok',
        originalSource: 'test_lead',
        metadata: { isTest: true },
      });

      // Auto-activate the channel — same as a real lead arriving
      await storage.upsertChannelSetting(req.user.id, 'tiktok', { isConnected: true, isEnabled: true });

      console.log(`[TikTok Test Lead] Created test contact ${contact.id} for user ${req.user.id}`);
      res.status(201).json({ success: true, contactId: contact.id, name: randomName });
    } catch (err: any) {
      console.error("[TikTok Test Lead] error:", err);
      res.status(500).json({ error: err.message ?? "Unexpected error" });
    }
  });

  // Validate a Meta (FB/IG) page token before saving credentials.
  // Checks: token validity, required scopes, page access, page subscription to webhook events.
  // Does NOT require authentication — token is provided directly in the request.
  app.post("/api/integrations/meta-validate", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { accessToken, pageId, channel } = req.body as {
        accessToken?: string;
        pageId?: string;
        channel?: string;
      };
      if (!accessToken || !pageId || !channel) {
        return res.status(400).json({ error: "accessToken, pageId, and channel are required" });
      }

      const GRAPH = "https://graph.facebook.com/v19.0";

      // Required scopes per channel
      const REQUIRED_SCOPES: Record<string, string[]> = {
        facebook: ["pages_messaging", "pages_manage_metadata"],
        instagram: ["pages_show_list", "pages_messaging"],
      };

      const result: {
        tokenValid: boolean;
        tokenOwner: string | null;
        grantedScopes: string[];
        missingScopes: string[];
        pageAccessible: boolean;
        pageName: string | null;
        pageSubscribed: boolean;
        pageSubscriptionError: string | null;
        error?: string;
      } = {
        tokenValid: false,
        tokenOwner: null,
        grantedScopes: [],
        missingScopes: REQUIRED_SCOPES[channel] ?? [],
        pageAccessible: false,
        pageName: null,
        pageSubscribed: false,
        pageSubscriptionError: null,
      };

      // 1. Verify token is valid by calling /me
      const meResp = await fetch(
        `${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
      );
      const meData = (await meResp.json()) as any;
      if (!meResp.ok || !meData.id) {
        result.error = meData?.error?.message || "Invalid access token — please check and try again.";
        return res.json(result);
      }
      result.tokenValid = true;
      result.tokenOwner = meData.name || meData.id;

      // 2. Check granted permissions (works for user tokens; page tokens return limited info — treat gracefully)
      const permResp = await fetch(
        `${GRAPH}/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
      );
      const permData = (await permResp.json()) as any;
      if (permResp.ok && Array.isArray(permData?.data)) {
        result.grantedScopes = permData.data
          .filter((p: any) => p.status === "granted")
          .map((p: any) => p.permission as string);
        const required = REQUIRED_SCOPES[channel] ?? [];
        result.missingScopes = required.filter((s) => !result.grantedScopes.includes(s));
      } else {
        // Page access tokens don't expose /me/permissions — treat as no missing scopes
        result.grantedScopes = [];
        result.missingScopes = [];
      }

      // 3. Verify access to the specific page/account
      const pageResp = await fetch(
        `${GRAPH}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
      );
      const pageData = (await pageResp.json()) as any;
      if (pageResp.ok && pageData.id) {
        result.pageAccessible = true;
        result.pageName = pageData.name || pageId;
      } else {
        result.error = pageData?.error?.message ||
          `Could not access ${channel === "instagram" ? "Instagram account" : "Facebook Page"} with ID "${pageId}". Verify the ID is correct and the token has page access.`;
        return res.json(result);
      }

      // 4. Subscribe the page to webhook events (so GHL-side manual step is eliminated)
      const subFields =
        channel === "instagram"
          ? "messages,messaging_seen,instagram_messages"
          : "messages,messaging_postbacks,messaging_seen,messaging_referrals";
      const subResp = await fetch(
        `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `subscribed_fields=${encodeURIComponent(subFields)}&access_token=${encodeURIComponent(accessToken)}`,
        },
      );
      const subData = (await subResp.json()) as any;
      if (subResp.ok && subData.success) {
        result.pageSubscribed = true;
      } else {
        // Non-fatal — warn but let user proceed; they can subscribe manually
        result.pageSubscriptionError =
          subData?.error?.message ||
          "Could not auto-subscribe page to webhook events. You can subscribe manually in Meta Developer Portal.";
      }

      console.log(
        `[Meta Validate] user=${req.user.id} channel=${channel} ` +
        `tokenValid=${result.tokenValid} pageAccessible=${result.pageAccessible} ` +
        `pageSubscribed=${result.pageSubscribed} missingScopes=[${result.missingScopes.join(",")}]`,
      );

      return res.json(result);
    } catch (error) {
      console.error("Error validating Meta integration:", error);
      res.status(500).json({ error: "Server error while validating. Please try again." });
    }
  });

  // Confirm webhook setup for Facebook/Instagram — marks channel as connected
  // Called after user has verified their webhook in Meta Developer Portal.
  app.post("/api/integrations/meta-webhook-confirm", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { channel } = req.body as { channel: 'facebook' | 'instagram' };
      if (channel !== 'facebook' && channel !== 'instagram') {
        return res.status(400).json({ error: "channel must be 'facebook' or 'instagram'" });
      }
      await storage.upsertChannelSetting(req.user.id, channel as any, {
        isConnected: true,
        isEnabled: true,
      });
      console.log(`[Integration] ${channel} webhook confirmed for user ${req.user.id} — channel marked connected`);
      res.json({ ok: true, channel, isConnected: true });
    } catch (error) {
      console.error("Error confirming meta webhook:", error);
      res.status(500).json({ error: "Failed to confirm webhook" });
    }
  });

  // Create an integration
  app.post("/api/integrations", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.integrationsEnabled) {
        return res.status(403).json({ error: "Integrations are not available on your plan" });
      }
      
      const { type, name, config } = req.body;
      if (!type || !name || !config) {
        return res.status(400).json({ error: "Type, name, and config are required" });
      }
      
      // Check if integration of this type already exists
      const existingIntegrations = await storage.getIntegrations(req.user.id);
      const existingOfType = existingIntegrations.find(i => i.type === type);
      if (existingOfType) {
        return res.status(400).json({ error: `You already have a ${name} integration connected. Disconnect it first to add a new one.` });
      }
      
      // Encrypt sensitive fields before storing
      const encryptedConfig = encryptIntegrationConfig(config);
      
      const integration = await storage.createIntegration({
        userId: req.user.id,
        type,
        name,
        config: encryptedConfig,
        isActive: true,
      });

      // Dual-write to channelSettings for Facebook/Instagram so the messaging
      // engine (adapters + webhook handler) can find the credentials.
      // channelSettings is the single source of truth for inbound/outbound routing.
      let metaWebhookConfig: { webhookUrl: string; verifyToken: string } | undefined;
      if (type === 'meta_facebook' || type === 'meta_instagram') {
        const channel = type === 'meta_facebook' ? 'facebook' : 'instagram';

        // Generate a stable per-user verify token using HMAC so it is always the
        // same for this user regardless of how many times they reconnect.
        const cryptoMod = await import('crypto');
        const verifyTokenRaw = cryptoMod.createHmac(
          'sha256',
          process.env.SESSION_SECRET || 'whachat-fb-verify-salt'
        ).update(`${req.user.id}:${channel}`).digest('hex').slice(0, 32);

        const channelConfig: Record<string, string> = {
          accessToken: config.accessToken || '',
          pageId: type === 'meta_facebook'
            ? (config.pageId || '')
            : (config.instagramId || config.pageId || ''),
          webhookVerifyToken: verifyTokenRaw,
        };
        if (type === 'meta_instagram') {
          channelConfig.instagramAccountId = config.instagramId || config.pageId || '';
        }
        if (config.appSecret) {
          channelConfig.appSecret = config.appSecret;
        }
        // Persist the resolved account/page name so the channel card can display it
        if (config.pageName) {
          channelConfig.pageName = config.pageName;
        }
        // Start as NOT connected — channel is only marked connected after the user
        // confirms webhook setup via POST /api/integrations/meta-webhook-confirm.
        // This prevents a false "connected" state when inbound messages are not
        // actually working yet.
        await storage.upsertChannelSetting(req.user.id, channel as any, {
          isConnected: false,
          isEnabled: false,
          config: channelConfig,
        });
        const webhookBaseUrl = getAppOrigin();
        metaWebhookConfig = {
          webhookUrl: `${webhookBaseUrl}/api/webhook/meta`,
          verifyToken: verifyTokenRaw,
        };
        console.log(`[Integration] ${channel} channelSettings created/updated for user ${req.user.id} — pageId: ${channelConfig.pageId}, verifyToken stored`);
      }

      // Return with masked config (+ webhook setup info for Meta channels)
      res.status(201).json({
        ...integration,
        config: maskIntegrationConfig(config),
        ...(metaWebhookConfig ? { webhookSetup: metaWebhookConfig } : {}),
      });
    } catch (error) {
      console.error("Error creating integration:", error);
      res.status(500).json({ error: "Failed to create integration" });
    }
  });

  // Update an integration
  app.patch("/api/integrations/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const integration = await storage.getIntegration(req.params.id);
      if (!integration || integration.userId !== req.user.id) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      const { name, config, isActive } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (config !== undefined) updates.config = encryptIntegrationConfig(config);
      if (isActive !== undefined) updates.isActive = isActive;
      
      const updated = await storage.updateIntegration(req.params.id, updates);

      // Dual-write to channelSettings for Facebook/Instagram on update
      if ((integration.type === 'meta_facebook' || integration.type === 'meta_instagram') && config !== undefined) {
        const channel = integration.type === 'meta_facebook' ? 'facebook' : 'instagram';
        const cryptoMod = await import('crypto');
        const verifyTokenRaw = cryptoMod.createHmac(
          'sha256',
          process.env.SESSION_SECRET || 'whachat-fb-verify-salt'
        ).update(`${req.user.id}:${channel}`).digest('hex').slice(0, 32);
        const channelConfig: Record<string, string> = {
          accessToken: config.accessToken || '',
          pageId: integration.type === 'meta_facebook'
            ? (config.pageId || '')
            : (config.instagramId || config.pageId || ''),
          webhookVerifyToken: verifyTokenRaw,
        };
        if (integration.type === 'meta_instagram') {
          channelConfig.instagramAccountId = config.instagramId || config.pageId || '';
        }
        if (config.appSecret) {
          channelConfig.appSecret = config.appSecret;
        }
        const channelUpdates: any = { config: channelConfig };
        if (isActive === false) {
          // Explicit deactivation — disconnect and disable
          channelUpdates.isConnected = false;
          channelUpdates.isEnabled = false;
        }
        // When updating credentials only: preserve the existing isConnected value.
        // Only meta-webhook-confirm may promote a channel to isConnected: true.
        await storage.upsertChannelSetting(req.user.id, channel as any, channelUpdates);
        console.log(`[Integration] ${channel} channelSettings config updated for user ${req.user.id} — pageId: ${channelConfig.pageId}`);
      }

      // Return with masked config
      res.json({
        ...updated,
        config: maskIntegrationConfig(updated?.config as Record<string, any> || {}),
      });
    } catch (error) {
      console.error("Error updating integration:", error);
      res.status(500).json({ error: "Failed to update integration" });
    }
  });

  // Delete an integration
  app.delete("/api/integrations/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const integration = await storage.getIntegration(req.params.id);
      if (!integration || integration.userId !== req.user.id) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      await storage.deleteIntegration(req.params.id);

      // Dual-write: disconnect channelSettings for Facebook/Instagram on delete
      if (integration.type === 'meta_facebook' || integration.type === 'meta_instagram') {
        const channel = integration.type === 'meta_facebook' ? 'facebook' : 'instagram';
        await storage.upsertChannelSetting(req.user.id, channel as any, {
          isConnected: false,
          isEnabled: false,
          config: {},
        });
        console.log(`[Integration] ${channel} channelSettings disconnected for user ${req.user.id} after integration deletion`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting integration:", error);
      res.status(500).json({ error: "Failed to delete integration" });
    }
  });

  // Trigger a sync for an integration
  app.post("/api/integrations/:id/sync", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const integration = await storage.getIntegration(req.params.id);
      if (!integration || integration.userId !== req.user.id) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      if (!integration.isActive) {
        return res.status(400).json({ error: "Integration is paused. Activate it to sync." });
      }
      
      const config = integration.config as Record<string, any>;
      const syncOptions = config.syncOptions || [];
      let syncResult = { success: true, message: `${integration.name} sync started`, details: '' };
      
      if (integration.type === 'google_sheets' && syncOptions.includes('export_leads')) {
        const chats = await storage.getChats(req.user.id);
        // Phase E Step 2: overlay CRM fields from contacts (authoritative source)
        const contactsForSync = await storage.getContacts(req.user.id);
        const contactCrmSync = new Map(
          contactsForSync
            .filter(c => c.whatsappId || c.phone)
            .map(c => [(c.whatsappId || c.phone || '').replace(/\D/g, ''), c])
        );
        const rows = chats.map(chat => {
          const norm = (chat.whatsappPhone || '').replace(/\D/g, '');
          const ct = norm ? contactCrmSync.get(norm) : undefined;
          return {
            name: chat.name,
            phone: chat.whatsappPhone || '',
            tag: ct?.tag ?? chat.tag,
            pipelineStage: ct?.pipelineStage ?? chat.pipelineStage,
            status: chat.status,
            notes: ct?.notes ?? chat.notes ?? '',
            lastMessage: chat.lastMessage,
            createdAt: chat.createdAt?.toISOString() || '',
            updatedAt: chat.updatedAt?.toISOString() || '',
          };
        });
        
        syncResult.details = `Prepared ${rows.length} leads for export. Configure Google Sheets API to enable automatic sync.`;
        console.log(`Google Sheets sync: ${rows.length} leads ready for user ${req.user.id}`);
      } else if (integration.type === 'hubspot' && syncOptions.includes('sync_contacts')) {
        const chats = await storage.getChats(req.user.id);
        syncResult.details = `${chats.length} contacts ready to sync to HubSpot.`;
        console.log(`HubSpot sync requested for ${chats.length} contacts`);
      } else {
        syncResult.details = 'Sync initiated. External service will send data via webhook.';
      }
      
      await storage.updateIntegration(req.params.id, { lastSyncAt: new Date() });
      
      console.log(`Sync triggered for ${integration.type} integration ${integration.id}`);
      
      res.json(syncResult);
    } catch (error) {
      console.error("Error syncing integration:", error);
      res.status(500).json({ error: "Failed to sync integration" });
    }
  });

  // ============= Chatbot Flow Endpoints =============

  // Get all chatbot flows for current user
  app.get("/api/chatbot-flows", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.chatbotEnabled) {
        return res.status(403).json({ error: "Visual chatbot builder requires a paid plan" });
      }
      
      const flows = await storage.getChatbotFlows(req.user.id);
      res.json(flows);
    } catch (error) {
      console.error("Error fetching chatbot flows:", error);
      res.status(500).json({ error: "Failed to fetch chatbot flows" });
    }
  });

  // Get a single chatbot flow
  app.get("/api/chatbot-flows/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const flow = await storage.getChatbotFlow(req.params.id);
      if (!flow || flow.userId !== req.user.id) {
        return res.status(404).json({ error: "Flow not found" });
      }
      
      res.json(flow);
    } catch (error) {
      console.error("Error fetching chatbot flow:", error);
      res.status(500).json({ error: "Failed to fetch chatbot flow" });
    }
  });

  // Create a new chatbot flow
  app.post("/api/chatbot-flows", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.chatbotEnabled) {
        return res.status(403).json({ error: "Visual chatbot builder requires a paid plan" });
      }
      
      const { name, description, nodes, edges, triggerKeywords, triggerOnNewChat, triggerChannels } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Flow name is required" });
      }
      
      const flow = await storage.createChatbotFlow({
        userId: req.user.id,
        name,
        description: description || null,
        nodes: nodes || [],
        edges: edges || [],
        triggerKeywords: triggerKeywords || [],
        triggerOnNewChat: triggerOnNewChat || false,
        triggerChannels: triggerChannels || [],
        isActive: false,
      });
      
      res.status(201).json(flow);
    } catch (error) {
      console.error("Error creating chatbot flow:", error);
      res.status(500).json({ error: "Failed to create chatbot flow" });
    }
  });

  // Update a chatbot flow
  app.patch("/api/chatbot-flows/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const existingFlow = await storage.getChatbotFlow(req.params.id);
      if (!existingFlow || existingFlow.userId !== req.user.id) {
        return res.status(404).json({ error: "Flow not found" });
      }
      
      const { name, description, nodes, edges, triggerKeywords, triggerOnNewChat, triggerChannels, isActive } = req.body;
      
      const flow = await storage.updateChatbotFlow(req.params.id, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(nodes !== undefined && { nodes }),
        ...(edges !== undefined && { edges }),
        ...(triggerKeywords !== undefined && { triggerKeywords }),
        ...(triggerOnNewChat !== undefined && { triggerOnNewChat }),
        ...(triggerChannels !== undefined && { triggerChannels }),
        ...(isActive !== undefined && { isActive }),
      });
      
      res.json(flow);
    } catch (error) {
      console.error("Error updating chatbot flow:", error);
      res.status(500).json({ error: "Failed to update chatbot flow" });
    }
  });

  // Delete a chatbot flow
  app.delete("/api/chatbot-flows/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const existingFlow = await storage.getChatbotFlow(req.params.id);
      if (!existingFlow || existingFlow.userId !== req.user.id) {
        return res.status(404).json({ error: "Flow not found" });
      }
      
      await storage.deleteChatbotFlow(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting chatbot flow:", error);
      res.status(500).json({ error: "Failed to delete chatbot flow" });
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

  // ============= Demo Booking System =============

  // Get available salespeople (public endpoint for booking form)
  app.get("/api/demo/salespeople", async (req, res) => {
    try {
      const people = await storage.getActiveSalespeople();
      res.json(people.map(p => ({ id: p.id, name: p.name })));
    } catch (error) {
      console.error("Error fetching salespeople:", error);
      res.status(500).json({ error: "Failed to fetch salespeople" });
    }
  });

  // Book a demo (public endpoint)
  app.post("/api/demo/book", async (req, res) => {
    try {
      const { name, email, phone, scheduledDate, consent, source } = req.body;
      
      if (!name || !email || !phone || !scheduledDate || !consent) {
        return res.status(400).json({ error: "All fields are required including consent" });
      }

      // Get an active salesperson (round-robin style - pick the one with fewest bookings)
      const salespeople = await storage.getActiveSalespeople();
      if (salespeople.length === 0) {
        return res.status(400).json({ error: "No salespeople available" });
      }

      // Pick salesperson with fewest bookings
      const salesperson = salespeople.reduce((min, p) => 
        (p.totalBookings || 0) < (min.totalBookings || 0) ? p : min
      );

      const booking = await storage.createDemoBooking({
        salespersonId: salesperson.id,
        visitorName: name,
        visitorEmail: email,
        visitorPhone: phone,
        scheduledDate: new Date(scheduledDate),
        consentGiven: consent,
        status: 'pending',
        source: source || 'web'
      });

      // Send email notification to salesperson
      await sendDemoBookingNotification(
        salesperson.email,
        salesperson.name,
        { name, email, phone, scheduledDate: new Date(scheduledDate) }
      );

      // Send confirmation email to visitor
      await sendDemoConfirmationEmail(
        email,
        name,
        new Date(scheduledDate),
        salesperson.name
      );

      res.json({ success: true, bookingId: booking.id });
    } catch (error) {
      console.error("Error booking demo:", error);
      res.status(500).json({ error: "Failed to book demo" });
    }
  });

  // Admin authentication
  const _adminTokenSecret = process.env.SESSION_SECRET || 'whatsapp-crm-secret-key-change-in-production';
  function computeAdminToken(hash: string): string {
    return crypto.createHmac('sha256', _adminTokenSecret).update(hash).digest('hex');
  }
  async function verifyAdminToken(token: string): Promise<boolean> {
    const storedHash = await storage.getAdminPasswordHash();
    if (!storedHash) return false;
    return computeAdminToken(storedHash) === token;
  }

  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      const storedHash = await storage.getAdminPasswordHash();

      if (!storedHash) {
        const hash = await bcrypt.hash(password, 10);
        await storage.setAdminPassword(hash);
        (req.session as any).isAdmin = true;
        const token = computeAdminToken(hash);
        return req.session.save((err) => {
          if (err) console.error('[Admin] Session save error on setup:', err);
          res.json({ success: true, token, message: "Admin password set" });
        });
      }

      const valid = await bcrypt.compare(password, storedHash);
      if (!valid) return res.status(401).json({ error: "Invalid password" });

      (req.session as any).isAdmin = true;
      const token = computeAdminToken(storedHash);
      req.session.save((err) => {
        if (err) console.error('[Admin] Session save error:', err);
        res.json({ success: true, token });
      });
    } catch (error) {
      console.error("Error in admin login:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/admin/check", async (req, res) => {
    if ((req.session as any)?.isAdmin === true) return res.json({ isAdmin: true });
    const token = req.headers['x-admin-token'] as string;
    if (token) {
      const valid = await verifyAdminToken(token);
      if (valid) return res.json({ isAdmin: true });
    }
    res.json({ isAdmin: false });
  });

  app.post("/api/admin/logout", async (req, res) => {
    (req.session as any).isAdmin = false;
    res.json({ success: true });
  });

  // Admin middleware — accepts session OR persistent token header
  const requireAdmin = async (req: any, res: any, next: any) => {
    if ((req.session as any)?.isAdmin === true) return next();
    const token = req.headers['x-admin-token'] as string;
    if (token && await verifyAdminToken(token)) return next();
    return res.status(401).json({ error: "Admin authentication required" });
  };

  // Admin: Manual IndexNow submission
  app.post("/api/admin/indexnow/submit", requireAdmin, async (req, res) => {
    try {
      const { urls } = req.body;
      const { submitNow, PUBLIC_PAGES } = await import("./indexNow");
      const urlsToSubmit: string[] = Array.isArray(urls) && urls.length > 0
        ? urls
        : PUBLIC_PAGES;
      const result = await submitNow(urlsToSubmit);
      res.json({
        submitted: urlsToSubmit,
        count: urlsToSubmit.length,
        result,
      });
    } catch (error: any) {
      console.error("[IndexNow] Admin submit error:", error);
      res.status(500).json({ error: error.message || "Submission failed" });
    }
  });

  // Admin: Trigger content-diff detection and targeted IndexNow submission
  // Compares current blog posts / PAGE_META against stored snapshot, fires
  // onBlogPostPublished / onLandingPageCreated / onPageUpdated for any changes.
  app.post("/api/admin/indexnow/detect", requireAdmin, async (req, res) => {
    try {
      const { detectAndSubmitNewContent } = await import("./indexNow");
      await detectAndSubmitNewContent();
      res.json({ ok: true, message: "Content detection and targeted submission complete. Check server logs for details." });
    } catch (error: any) {
      console.error("[IndexNow] Admin detect error:", error);
      res.status(500).json({ error: error.message || "Detection failed" });
    }
  });

  // Admin: Get all salespeople
  app.get("/api/admin/salespeople", requireAdmin, async (req, res) => {
    try {
      const people = await storage.getSalespeople();
      res.json(people);
    } catch (error) {
      console.error("Error fetching salespeople:", error);
      res.status(500).json({ error: "Failed to fetch salespeople" });
    }
  });

  // Admin: Create salesperson
  app.post("/api/admin/salespeople", requireAdmin, async (req, res) => {
    try {
      const data = insertSalespersonSchema.parse(req.body);
      const loginCode = await storage.generateUniqueLoginCode();
      const person = await storage.createSalesperson({ ...data, loginCode });
      
      // Send welcome email with login credentials
      sendSalespersonWelcomeEmail(person.name, person.email, person.loginCode)
        .then(sent => {
          if (sent) {
            console.log(`[Admin] Welcome email sent to salesperson: ${person.email}`);
          }
        })
        .catch(err => console.error('[Admin] Failed to send welcome email:', err));
      
      res.json(person);
    } catch (error) {
      console.error("Error creating salesperson:", error);
      res.status(500).json({ error: "Failed to create salesperson" });
    }
  });

  // Admin: Update salesperson
  app.patch("/api/admin/salespeople/:id", requireAdmin, async (req, res) => {
    try {
      const { name, email, phone, isActive } = req.body;
      const person = await storage.updateSalesperson(req.params.id, {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(isActive !== undefined && { isActive }),
      });
      res.json(person);
    } catch (error) {
      console.error("Error updating salesperson:", error);
      res.status(500).json({ error: "Failed to update salesperson" });
    }
  });

  // Admin: Delete salesperson
  app.delete("/api/admin/salespeople/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteSalesperson(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting salesperson:", error);
      res.status(500).json({ error: "Failed to delete salesperson" });
    }
  });

  // Admin: Get all bookings
  app.get("/api/admin/bookings", requireAdmin, async (req, res) => {
    try {
      const bookings = await storage.getDemoBookings();
      res.json(bookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // Admin: Update booking status
  app.patch("/api/admin/bookings/:id", requireAdmin, async (req, res) => {
    try {
      const { status, notes } = req.body;
      
      // Get the current booking to check if status is changing to converted
      const currentBooking = await storage.getDemoBooking(req.params.id);
      
      const booking = await storage.updateDemoBooking(req.params.id, {
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      });
      
      // If status changed to 'converted', automatically create a conversion record
      if (status === 'converted' && currentBooking && currentBooking.status !== 'converted') {
        await storage.createSalesConversion({
          bookingId: req.params.id,
          salespersonId: currentBooking.salespersonId,
          userId: null,
          amount: "50"
        });
      }
      
      res.json(booking);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Admin: Get all conversions
  app.get("/api/admin/conversions", requireAdmin, async (req, res) => {
    try {
      const conversions = await storage.getSalesConversions();
      res.json(conversions);
    } catch (error) {
      console.error("Error fetching conversions:", error);
      res.status(500).json({ error: "Failed to fetch conversions" });
    }
  });

  // Admin: Create conversion (when a booking leads to a paid subscription)
  app.post("/api/admin/conversions", requireAdmin, async (req, res) => {
    try {
      const { bookingId, salespersonId, userId, amount } = req.body;
      const conversion = await storage.createSalesConversion({
        bookingId,
        salespersonId,
        userId,
        amount: amount || "50"
      });
      res.json(conversion);
    } catch (error) {
      console.error("Error creating conversion:", error);
      res.status(500).json({ error: "Failed to create conversion" });
    }
  });

  // Admin: Merge duplicate contacts that share the same WhatsApp/phone number
  app.post("/api/admin/merge-duplicate-contacts", requireAdmin, async (req, res) => {
    try {
      const { db } = await import("../drizzle/db");
      const { contacts, conversations } = await import("@shared/schema");
      const { eq, and, sql: rawSql } = await import("drizzle-orm");

      const dryRun = req.body.dryRun === true;
      const filterUserId = req.body.userId as string | undefined;

      // Fetch all contacts with a phone or whatsapp_id set
      const allContacts = await db.select().from(contacts);

      // Group contacts by (userId, normalised phone digits)
      const groups = new Map<string, typeof allContacts>();
      for (const c of allContacts) {
        if (filterUserId && c.userId !== filterUserId) continue;
        const raw = c.whatsappId || c.phone || '';
        if (!raw) continue;
        const digits = raw.replace(/\D/g, '');
        if (!digits) continue;
        const key = `${c.userId}::${digits}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(c);
      }

      const report: any[] = [];

      for (const [key, group] of Array.from(groups.entries())) {
        if (group.length < 2) continue;

        // Get message counts per contact
        const counts = await Promise.all(group.map(async (c) => {
          const rows = await db.execute(rawSql`
            SELECT COUNT(*) as cnt FROM messages m
            JOIN conversations cv ON m.conversation_id = cv.id
            WHERE cv.contact_id = ${c.id}
          `);
          return { contact: c, msgCount: Number((rows.rows[0] as any).cnt) };
        }));

        // Winner = contact with the most messages. On a tie, prefer the one with whatsapp_id set, then oldest.
        counts.sort((a, b) => {
          if (b.msgCount !== a.msgCount) return b.msgCount - a.msgCount;
          if (a.contact.whatsappId && !b.contact.whatsappId) return -1;
          if (!a.contact.whatsappId && b.contact.whatsappId) return 1;
          return new Date(a.contact.createdAt!).getTime() - new Date(b.contact.createdAt!).getTime();
        });

        const winner = counts[0].contact;
        const losers = counts.slice(1).map(c => c.contact);

        // Normalised phone (digits only) for winner update
        const normalizedPhone = (winner.whatsappId || winner.phone || '').replace(/\D/g, '');

        // Find winner's primary whatsapp conversation (if any)
        const winnerConvs = await db.select().from(conversations)
          .where(and(eq(conversations.contactId, winner.id), eq(conversations.channel, 'whatsapp')));
        const winnerConv = winnerConvs[0] ?? null;

        const loserSummary = losers.map(l => ({
          id: l.id, name: l.name, phone: l.phone, whatsapp_id: l.whatsappId,
          msgCount: counts.find(c => c.contact.id === l.id)?.msgCount,
        }));

        report.push({
          key,
          winner: { id: winner.id, name: winner.name, phone: winner.phone, whatsapp_id: winner.whatsappId, msgCount: counts[0].msgCount },
          losers: loserSummary,
          winnerConvId: winnerConv?.id ?? null,
          dryRun,
        });

        if (dryRun) continue;

        for (const loser of losers) {
          // Find loser conversations
          const loserConvs = await db.select().from(conversations).where(eq(conversations.contactId, loser.id));

          for (const lc of loserConvs) {
            if (winnerConv && lc.channel === winnerConv.channel) {
              // Re-point messages to winner's conversation
              await db.execute(rawSql`
                UPDATE messages SET conversation_id = ${winnerConv.id}, contact_id = ${winner.id}
                WHERE conversation_id = ${lc.id}
              `);
              // Delete the now-empty loser conversation
              await db.execute(rawSql`DELETE FROM conversations WHERE id = ${lc.id}`);
            } else if (!winnerConv) {
              // No winner conversation yet — re-parent the loser conversation to the winner contact
              await db.execute(rawSql`
                UPDATE conversations SET contact_id = ${winner.id} WHERE id = ${lc.id}
              `);
              await db.execute(rawSql`
                UPDATE messages SET contact_id = ${winner.id} WHERE conversation_id = ${lc.id}
              `);
            } else {
              // Different channel — just re-parent to winner contact
              await db.execute(rawSql`
                UPDATE conversations SET contact_id = ${winner.id} WHERE id = ${lc.id}
              `);
              await db.execute(rawSql`
                UPDATE messages SET contact_id = ${winner.id} WHERE conversation_id = ${lc.id}
              `);
            }
          }

          // Re-point activity_events
          await db.execute(rawSql`UPDATE activity_events SET contact_id = ${winner.id} WHERE contact_id = ${loser.id}`);

          // Delete the loser contact
          await db.execute(rawSql`DELETE FROM contacts WHERE id = ${loser.id}`);
          console.log(`[MergeDuplicates] Deleted loser contact ${loser.id} (${loser.name}) — merged into ${winner.id} (${winner.name})`);
        }

        // Normalise winner phone and whatsapp_id to digits-only
        if (!dryRun) {
          await db.execute(rawSql`
            UPDATE contacts SET phone = ${normalizedPhone}, whatsapp_id = ${normalizedPhone}
            WHERE id = ${winner.id}
          `);
          console.log(`[MergeDuplicates] Normalised winner ${winner.id} phone/whatsapp_id to "${normalizedPhone}"`);
        }
      }

      res.json({ success: true, mergedGroups: report.length, report });
    } catch (error: any) {
      console.error("Error merging duplicate contacts:", error);
      res.status(500).json({ error: error.message || "Failed to merge contacts" });
    }
  });

  // Admin: Mark conversion as paid
  app.patch("/api/admin/conversions/:id/paid", requireAdmin, async (req, res) => {
    try {
      const conversion = await storage.markConversionPaid(req.params.id);
      res.json(conversion);
    } catch (error) {
      console.error("Error marking conversion paid:", error);
      res.status(500).json({ error: "Failed to mark conversion paid" });
    }
  });

  // Admin: Get conversion ROI stats
  app.get("/api/admin/conversions/roi", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getConversionROIStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching ROI stats:", error);
      res.status(500).json({ error: "Failed to fetch ROI stats" });
    }
  });

  // Admin: Get all users with support ticket status and attribution
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      console.log('[Admin Users] Fetching data...');
      
      const allUsers = await storage.getAllUsers();
      console.log('[Admin Users] Users:', allUsers.length);
      
      const allBookings = await storage.getDemoBookings();
      console.log('[Admin Users] Bookings:', allBookings.length);
      
      const allTickets = await storage.getSupportTickets();
      console.log('[Admin Users] Tickets:', allTickets.length);
      
      const allConversions = await storage.getSalesConversions();
      console.log('[Admin Users] Conversions:', allConversions.length);
      
      const allPartners = await storage.getPartners();
      console.log('[Admin Users] Partners:', allPartners.length);
      
      const allSalespeople = await storage.getSalespeople();
      console.log('[Admin Users] Salespeople:', allSalespeople.length);
      
      // Build lookup maps
      const partnerMap = new Map(allPartners.map(p => [p.id, p.name]));
      const salespersonMap = new Map(allSalespeople.map(s => [s.id, s.name]));
      
      const usersWithInfo = allUsers.map(user => {
        const userBookings = allBookings.filter(b => b.visitorEmail === user.email);
        const userTickets = allTickets.filter(t => t.userEmail === user.email || t.userId === user.id);
        const openTickets = userTickets.filter(t => t.status === 'open' || t.status === 'in_progress');
        
        // Find salesperson attribution via conversions
        const userConversion = allConversions.find(c => c.userId === user.id);
        const salespersonId = userConversion?.salespersonId || null;
        const salespersonName = salespersonId ? salespersonMap.get(salespersonId) || null : null;
        
        // Partner attribution from user record
        const partnerName = user.partnerId ? partnerMap.get(user.partnerId) || null : null;
        
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          subscriptionPlan: user.subscriptionPlan,
          subscriptionStatus: user.subscriptionStatus,
          trialEndsAt: user.trialEndsAt,
          twilioConnected: user.twilioConnected,
          metaConnected: user.metaConnected,
          createdAt: user.createdAt,
          hasDemo: userBookings.length > 0,
          demoStatus: userBookings[0]?.status || null,
          demoDate: userBookings[0]?.scheduledDate || null,
          openTicketCount: openTickets.length,
          totalTicketCount: userTickets.length,
          latestTicket: openTickets[0] || null,
          // Attribution fields
          partnerId: user.partnerId || null,
          partnerName,
          salespersonId,
          salespersonName,
        };
      });
      
      // Sort: users with open tickets first, then by created date
      usersWithInfo.sort((a, b) => {
        if (a.openTicketCount > 0 && b.openTicketCount === 0) return -1;
        if (b.openTicketCount > 0 && a.openTicketCount === 0) return 1;
        return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
      });
      
      res.json(usersWithInfo);
    } catch (error: any) {
      console.error("Error fetching admin users:", error?.message || error, error?.stack);
      res.status(500).json({ error: `Failed to fetch users: ${error?.message || 'Unknown error'}` });
    }
  });

  // Admin: Update user subscription plan
  app.patch("/api/admin/users/:userId/plan", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { subscriptionPlan } = req.body;

      if (!subscriptionPlan || !['free', 'starter', 'pro'].includes(subscriptionPlan)) {
        return res.status(400).json({ error: 'Invalid subscription plan' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await storage.updateUser(userId, {
        // keep legacy field in sync for admin UI display
        subscriptionPlan,
        planOverride: subscriptionPlan,
        planOverrideEnabled: true,
      });
      
      const updated = await storage.getUser(userId);
      console.log(`[Admin] Updated user ${user.email} plan to ${subscriptionPlan}`);
      
      res.json({ success: true, plan: updated?.subscriptionPlan });
    } catch (error: any) {
      console.error("Error updating user plan:", error?.message || error);
      res.status(500).json({ error: `Failed to update plan: ${error?.message || 'Unknown error'}` });
    }
  });

  // Admin: Get all support tickets
  app.get("/api/admin/support-tickets", requireAdmin, async (req, res) => {
    try {
      const tickets = await storage.getSupportTickets();
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching support tickets:", error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  // Admin: GHL sync failure visibility (Phase 4)
  app.get("/api/admin/ghl-sync-failures", requireAdmin, async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const failures = await storage.getGhlSyncFailures(userId, limit);
      res.json(failures);
    } catch (error) {
      console.error("Error fetching GHL sync failures:", error);
      res.status(500).json({ error: "Failed to fetch GHL sync failures" });
    }
  });

  // Admin: Mark a GHL sync failure as resolved
  app.patch("/api/admin/ghl-sync-failures/:id/resolve", requireAdmin, async (req, res) => {
    try {
      await storage.resolveGhlSyncFailure(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resolving GHL sync failure:", error);
      res.status(500).json({ error: "Failed to resolve GHL sync failure" });
    }
  });

  // User-facing: own GHL sync failures (last 50, unresolved)
  app.get("/api/ghl-sync-failures", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const all = await storage.getGhlSyncFailures(req.user.id, 50);
      res.json(all.filter(f => !f.resolvedAt));
    } catch (error) {
      console.error("Error fetching GHL sync failures:", error);
      res.status(500).json({ error: "Failed to fetch sync failures" });
    }
  });

  // Admin: Create support ticket (for tracking incoming emails)
  app.post("/api/admin/support-tickets", requireAdmin, async (req, res) => {
    try {
      const { userEmail, userName, subject, message, priority, category, userId } = req.body;
      
      if (!userEmail || !subject || !message) {
        return res.status(400).json({ error: "Email, subject, and message are required" });
      }
      
      const ticket = await storage.createSupportTicket({
        userId: userId || null,
        userEmail,
        userName: userName || null,
        subject,
        message,
        priority: priority || 'normal',
        category: category || null,
        status: 'open',
      });
      
      res.status(201).json(ticket);
    } catch (error) {
      console.error("Error creating support ticket:", error);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  // Admin: Update support ticket
  app.patch("/api/admin/support-tickets/:id", requireAdmin, async (req, res) => {
    try {
      const { status, priority, assignedTo, notes, category } = req.body;
      
      const updates: any = {};
      if (status !== undefined) {
        updates.status = status;
        if (status === 'resolved' || status === 'closed') {
          updates.resolvedAt = new Date();
        }
      }
      if (priority !== undefined) updates.priority = priority;
      if (assignedTo !== undefined) updates.assignedTo = assignedTo;
      if (notes !== undefined) updates.notes = notes;
      if (category !== undefined) updates.category = category;
      
      const ticket = await storage.updateSupportTicket(req.params.id, updates);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      res.json(ticket);
    } catch (error) {
      console.error("Error updating support ticket:", error);
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });

  // Admin: Delete support ticket
  app.delete("/api/admin/support-tickets/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteSupportTicket(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting support ticket:", error);
      res.status(500).json({ error: "Failed to delete ticket" });
    }
  });

  // ================== SALESPERSON PORTAL ==================

  // Salesperson Portal: Login
  app.post("/api/sales-portal/login", async (req, res) => {
    try {
      const { email, loginCode } = req.body;
      
      if (!email || !loginCode) {
        return res.status(400).json({ error: "Email and login code required" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const normalizedCode = loginCode.trim();
      
      // Special handling for demo salesperson account - auto-create/fix
      const DEMO_SALES_EMAIL = 'demo@sales.com';
      const DEMO_SALES_CODE = '123456';
      
      if (normalizedEmail === DEMO_SALES_EMAIL && normalizedCode === DEMO_SALES_CODE) {
        let salesperson = await storage.getSalespersonByEmail(DEMO_SALES_EMAIL);
        
        if (!salesperson) {
          // Create demo salesperson if it doesn't exist
          salesperson = await storage.createSalesperson({
            name: 'Demo Sales',
            email: DEMO_SALES_EMAIL,
            loginCode: DEMO_SALES_CODE,
            isActive: true,
          });
          console.log('[SALES] Demo salesperson created on-demand');
        } else if (salesperson.loginCode !== DEMO_SALES_CODE) {
          // Fix login code if wrong
          salesperson = await storage.updateSalesperson(salesperson.id, { loginCode: DEMO_SALES_CODE }) || salesperson;
          console.log('[SALES] Demo salesperson login code fixed on-demand');
        }
        
        (req.session as any).salespersonId = salesperson.id;
        return res.json({ 
          success: true, 
          salesperson: {
            id: salesperson.id,
            name: salesperson.name,
            email: salesperson.email
          }
        });
      }

      const salesperson = await storage.getSalespersonByEmailAndCode(normalizedEmail, normalizedCode);
      
      if (!salesperson) {
        return res.status(401).json({ error: "Invalid email or login code" });
      }

      if (!salesperson.isActive) {
        return res.status(401).json({ error: "Account is inactive" });
      }

      (req.session as any).salespersonId = salesperson.id;
      res.json({ 
        success: true, 
        salesperson: {
          id: salesperson.id,
          name: salesperson.name,
          email: salesperson.email
        }
      });
    } catch (error) {
      console.error("Salesperson login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Salesperson Portal: Check auth
  app.get("/api/sales-portal/check", async (req, res) => {
    const salespersonId = (req.session as any)?.salespersonId;
    if (!salespersonId) {
      return res.json({ authenticated: false });
    }
    const salesperson = await storage.getSalesperson(salespersonId);
    if (!salesperson || !salesperson.isActive) {
      return res.json({ authenticated: false });
    }
    
    // Check if agreement needs to be accepted (version mismatch or never accepted)
    const currentVersion = AGREEMENT_VERSIONS.salesperson_commission;
    const agreementRequired = salesperson.agreementVersion !== currentVersion;
    
    res.json({ 
      authenticated: true,
      agreementRequired,
      currentAgreementVersion: currentVersion,
      salesperson: {
        id: salesperson.id,
        name: salesperson.name,
        email: salesperson.email
      }
    });
  });

  // Salesperson Portal: Accept agreement
  app.post("/api/sales-portal/accept-agreement", async (req, res) => {
    try {
      const salespersonId = (req.session as any)?.salespersonId;
      if (!salespersonId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const salesperson = await storage.getSalesperson(salespersonId);
      if (!salesperson || !salesperson.isActive) {
        return res.status(401).json({ error: "Salesperson not found" });
      }
      
      const currentVersion = AGREEMENT_VERSIONS.salesperson_commission;
      const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      // Record acceptance in audit table
      await storage.recordAgreementAcceptance({
        agreementType: 'salesperson_commission',
        agreementVersion: currentVersion,
        partnerId: null,
        salespersonId: salesperson.id,
        ipAddress,
        userAgent,
      });
      
      // Update salesperson record
      await storage.updateSalesperson(salesperson.id, {
        agreementAcceptedAt: new Date(),
        agreementVersion: currentVersion,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Accept agreement error:", error);
      res.status(500).json({ error: "Failed to accept agreement" });
    }
  });

  // Salesperson Portal: Logout
  app.post("/api/sales-portal/logout", async (req, res) => {
    (req.session as any).salespersonId = null;
    res.json({ success: true });
  });

  // Salesperson middleware
  const requireSalesperson = async (req: any, res: any, next: any) => {
    const salespersonId = (req.session as any)?.salespersonId;
    if (!salespersonId) {
      return res.status(401).json({ error: "Salesperson authentication required" });
    }
    const salesperson = await storage.getSalesperson(salespersonId);
    if (!salesperson || !salesperson.isActive) {
      return res.status(401).json({ error: "Invalid salesperson session" });
    }
    req.salesperson = salesperson;
    next();
  };

  // Salesperson Portal: Get my stats
  app.get("/api/sales-portal/stats", requireSalesperson, async (req: any, res) => {
    const salesperson = req.salesperson;
    res.json({
      totalBookings: salesperson.totalBookings || 0,
      totalConversions: salesperson.totalConversions || 0,
      totalEarnings: salesperson.totalEarnings || "0",
    });
  });

  // Salesperson Portal: Get my demos
  app.get("/api/sales-portal/demos", requireSalesperson, async (req: any, res) => {
    try {
      const demos = await storage.getDemoBookingsBySalesperson(req.salesperson.id);
      res.json(demos);
    } catch (error) {
      console.error("Error fetching salesperson demos:", error);
      res.status(500).json({ error: "Failed to fetch demos" });
    }
  });

  // Salesperson Portal: Mark demo as completed
  app.patch("/api/sales-portal/demos/:id/complete", requireSalesperson, async (req: any, res) => {
    try {
      const demo = await storage.getDemoBooking(req.params.id);
      if (!demo || demo.salespersonId !== req.salesperson.id) {
        return res.status(404).json({ error: "Demo not found" });
      }
      const updated = await storage.updateDemoBooking(req.params.id, { status: 'completed' });
      res.json(updated);
    } catch (error) {
      console.error("Error completing demo:", error);
      res.status(500).json({ error: "Failed to complete demo" });
    }
  });

  // Salesperson Portal: Get my conversions
  app.get("/api/sales-portal/conversions", requireSalesperson, async (req: any, res) => {
    try {
      const conversions = await storage.getSalesConversionsBySalesperson(req.salesperson.id);
      res.json(conversions);
    } catch (error) {
      console.error("Error fetching salesperson conversions:", error);
      res.status(500).json({ error: "Failed to fetch conversions" });
    }
  });

  // ================== PARTNER PORTAL ==================

  // Partner Portal: Login (email + password)
  app.post("/api/partner-portal/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      // Special handling for demo partner account - auto-create/fix
      const DEMO_PARTNER_EMAIL = 'partner@demo.com';
      const DEMO_PARTNER_PASSWORD = 'password123';
      
      if (normalizedEmail === DEMO_PARTNER_EMAIL && password === DEMO_PARTNER_PASSWORD) {
        let partner = await storage.getPartnerByEmail(DEMO_PARTNER_EMAIL);
        
        if (!partner) {
          // Create demo partner if it doesn't exist
          const hashedPassword = await bcrypt.hash(DEMO_PARTNER_PASSWORD, 10);
          partner = await storage.createPartner({
            name: 'Demo Partner',
            email: DEMO_PARTNER_EMAIL,
            password: hashedPassword,
            refCode: 'DEMO2026',
            commissionRate: '50.00',
            commissionDurationMonths: 6,
            status: 'active',
          });
          console.log('[PARTNER] Demo partner created on-demand');
        } else {
          // Verify password, if wrong fix it
          const isValid = await bcrypt.compare(DEMO_PARTNER_PASSWORD, partner.password);
          if (!isValid) {
            const hashedPassword = await bcrypt.hash(DEMO_PARTNER_PASSWORD, 10);
            partner = await storage.updatePartner(partner.id, { password: hashedPassword }) || partner;
            console.log('[PARTNER] Demo partner password fixed on-demand');
          }
        }
        
        (req.session as any).partnerId = partner.id;
        return res.json({ 
          success: true, 
          partner: {
            id: partner.id,
            name: partner.name,
            email: partner.email,
            refCode: partner.refCode,
          }
        });
      }

      const partner = await storage.getPartnerByEmail(normalizedEmail);
      
      if (!partner) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const validPassword = await bcrypt.compare(password, partner.password);
      
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      if (partner.status !== 'active') {
        return res.status(401).json({ error: "Account is paused" });
      }

      (req.session as any).partnerId = partner.id;
      res.json({ 
        success: true, 
        partner: {
          id: partner.id,
          name: partner.name,
          email: partner.email,
          refCode: partner.refCode
        }
      });
    } catch (error) {
      console.error("Partner login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Partner Portal: Check auth
  app.get("/api/partner-portal/check", async (req, res) => {
    const partnerId = (req.session as any)?.partnerId;
    if (!partnerId) {
      return res.json({ authenticated: false });
    }
    const partner = await storage.getPartner(partnerId);
    if (!partner || partner.status !== 'active') {
      return res.json({ authenticated: false });
    }
    
    // Check if agreement needs to be accepted (version mismatch or never accepted)
    const currentVersion = AGREEMENT_VERSIONS.partner_referral;
    const agreementRequired = partner.agreementVersion !== currentVersion;
    
    res.json({ 
      authenticated: true,
      agreementRequired,
      currentAgreementVersion: currentVersion,
      partner: {
        id: partner.id,
        name: partner.name,
        email: partner.email,
        refCode: partner.refCode
      }
    });
  });

  // Partner Portal: Accept agreement
  app.post("/api/partner-portal/accept-agreement", async (req, res) => {
    try {
      const partnerId = (req.session as any)?.partnerId;
      if (!partnerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const partner = await storage.getPartner(partnerId);
      if (!partner || partner.status !== 'active') {
        return res.status(401).json({ error: "Partner not found" });
      }
      
      const currentVersion = AGREEMENT_VERSIONS.partner_referral;
      const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      // Record acceptance in audit table
      await storage.recordAgreementAcceptance({
        agreementType: 'partner_referral',
        agreementVersion: currentVersion,
        partnerId: partner.id,
        salespersonId: null,
        ipAddress,
        userAgent,
      });
      
      // Update partner record
      await storage.updatePartner(partner.id, {
        agreementAcceptedAt: new Date(),
        agreementVersion: currentVersion,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Accept agreement error:", error);
      res.status(500).json({ error: "Failed to accept agreement" });
    }
  });

  // Partner Portal: Logout
  app.post("/api/partner-portal/logout", async (req, res) => {
    (req.session as any).partnerId = null;
    res.json({ success: true });
  });

  // Partner middleware
  const requirePartner = async (req: any, res: any, next: any) => {
    const partnerId = (req.session as any)?.partnerId;
    if (!partnerId) {
      return res.status(401).json({ error: "Partner authentication required" });
    }
    const partner = await storage.getPartner(partnerId);
    if (!partner || partner.status !== 'active') {
      return res.status(401).json({ error: "Partner authentication required" });
    }
    req.partner = partner;
    next();
  };

  // Partner Portal: Get dashboard stats
  app.get("/api/partner-portal/stats", requirePartner, async (req: any, res) => {
    try {
      const partner = req.partner;
      
      // Get referred users
      const referredUsers = await storage.getUsersByPartnerId(partner.id);
      
      // Get commission stats
      const commissionStats = await storage.getPartnerCommissionStats(partner.id);
      
      // Count active paid users
      const activePaidUsers = referredUsers.filter(u => 
        u.subscriptionPlan && u.subscriptionPlan !== 'free' && 
        u.subscriptionStatus === 'active'
      ).length;
      
      res.json({
        refCode: partner.refCode,
        refLink: `${getMarketingOrigin()}/?ref=${partner.refCode}`,
        totalReferrals: partner.totalReferrals || referredUsers.length,
        activePaidUsers,
        totalEarnings: commissionStats.totalEarnings,
        pendingEarnings: commissionStats.pendingEarnings,
        paidEarnings: commissionStats.paidEarnings,
        thisMonthEarnings: commissionStats.thisMonthEarnings,
        commissionRate: partner.commissionRate,
        commissionDurationMonths: partner.commissionDurationMonths,
      });
    } catch (error) {
      console.error("Error fetching partner stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Partner Portal: Get referred users list
  app.get("/api/partner-portal/referrals", requirePartner, async (req: any, res) => {
    try {
      const referredUsers = await storage.getUsersByPartnerId(req.partner.id);
      
      // Return only safe user info
      const safeUsers = referredUsers.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        subscriptionPlan: u.subscriptionPlan,
        subscriptionStatus: u.subscriptionStatus,
        signupDate: u.createdAt,
      }));
      
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching partner referrals:", error);
      res.status(500).json({ error: "Failed to fetch referrals" });
    }
  });

  // Partner Portal: Get commissions list
  app.get("/api/partner-portal/commissions", requirePartner, async (req: any, res) => {
    try {
      const commissions = await storage.getCommissionsByPartner(req.partner.id);
      res.json(commissions);
    } catch (error) {
      console.error("Error fetching partner commissions:", error);
      res.status(500).json({ error: "Failed to fetch commissions" });
    }
  });

  // ================== ADMIN GHL / LEADCONNECTOR ==================

  app.get("/api/admin/ghl-integrations", requireAdmin, async (req, res) => {
    try {
      const ghlIntegrations = await storage.getIntegrationsByType('gohighlevel');
      const allUsers = await storage.getAllUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u]));

      const result = ghlIntegrations.map(integration => {
        const user = userMap.get(integration.userId);
        const config = (integration.config || {}) as any;
        return {
          id: integration.id,
          userId: integration.userId,
          userName: user?.name || 'Unknown',
          userEmail: user?.email || 'Unknown',
          userPlan: user?.subscriptionPlan || 'free',
          isActive: integration.isActive,
          locationId: config.locationId || null,
          companyId: config.companyId || null,
          userType: config.userType || null,
          installedAt: config.installedAt || integration.createdAt,
          tokenExpiresAt: integration.tokenExpiresAt,
          lastSyncAt: integration.lastSyncAt,
          createdAt: integration.createdAt,
        };
      });

      result.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

      res.json(result);
    } catch (error) {
      console.error("Error fetching GHL integrations:", error);
      res.status(500).json({ error: "Failed to fetch GHL integrations" });
    }
  });

  // ================== ADMIN PARTNER MANAGEMENT ==================

  // Admin: Get all partners
  app.get("/api/admin/partners", requireAdmin, async (req, res) => {
    try {
      const allPartners = await storage.getPartners();
      res.json(allPartners);
    } catch (error) {
      console.error("Error fetching partners:", error);
      res.status(500).json({ error: "Failed to fetch partners" });
    }
  });

  // Admin: Create partner
  app.post("/api/admin/partners", requireAdmin, async (req, res) => {
    try {
      const { name, email, password, commissionRate, commissionDurationMonths } = req.body;
      
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required" });
      }

      // Check if email already exists
      const existing = await storage.getPartnerByEmail(email);
      if (existing) {
        return res.status(400).json({ error: "A partner with this email already exists" });
      }

      // Generate unique ref code
      const refCode = await storage.generateUniqueRefCode();
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const partner = await storage.createPartner({
        name,
        email,
        password: hashedPassword,
        refCode,
        commissionRate: commissionRate || '50.00',
        commissionDurationMonths: commissionDurationMonths || 6,
        status: 'active',
      });

      // Send welcome email to new partner
      const { sendPartnerWelcomeEmail } = await import("./email");
      sendPartnerWelcomeEmail(partner.name, partner.email, partner.refCode, password)
        .then((sent: boolean) => {
          if (sent) {
            console.log(`[Admin] Welcome email sent to partner: ${partner.email}`);
          }
        })
        .catch((err: Error) => console.error('[Admin] Failed to send partner welcome email:', err));
      
      res.status(201).json(partner);
    } catch (error) {
      console.error("Error creating partner:", error);
      res.status(500).json({ error: "Failed to create partner" });
    }
  });

  // Admin: Update partner
  app.patch("/api/admin/partners/:id", requireAdmin, async (req, res) => {
    try {
      const { name, email, password, commissionRate, commissionDurationMonths, status } = req.body;
      
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email.toLowerCase();
      if (commissionRate !== undefined) updates.commissionRate = commissionRate;
      if (commissionDurationMonths !== undefined) updates.commissionDurationMonths = commissionDurationMonths;
      if (status !== undefined) updates.status = status;
      
      // If password is provided, hash it
      if (password) {
        updates.password = await bcrypt.hash(password, 10);
      }
      
      const partner = await storage.updatePartner(req.params.id, updates);
      if (!partner) {
        return res.status(404).json({ error: "Partner not found" });
      }
      
      res.json(partner);
    } catch (error) {
      console.error("Error updating partner:", error);
      res.status(500).json({ error: "Failed to update partner" });
    }
  });

  // Admin: Delete partner
  app.delete("/api/admin/partners/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deletePartner(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting partner:", error);
      res.status(500).json({ error: "Failed to delete partner" });
    }
  });

  // Admin: Get all commissions
  app.get("/api/admin/commissions", requireAdmin, async (req, res) => {
    try {
      const { partnerId, salespersonId, status } = req.query;
      const commissions = await storage.getCommissions({
        partnerId: partnerId as string,
        salespersonId: salespersonId as string,
        status: status as string,
      });
      res.json(commissions);
    } catch (error) {
      console.error("Error fetching commissions:", error);
      res.status(500).json({ error: "Failed to fetch commissions" });
    }
  });

  // Admin: Mark commission as paid
  app.patch("/api/admin/commissions/:id/pay", requireAdmin, async (req, res) => {
    try {
      const commission = await storage.markCommissionPaid(req.params.id);
      if (!commission) {
        return res.status(404).json({ error: "Commission not found" });
      }
      res.json(commission);
    } catch (error) {
      console.error("Error paying commission:", error);
      res.status(500).json({ error: "Failed to pay commission" });
    }
  });

  // Admin: Get users with attribution source
  app.get("/api/admin/users-attribution", requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const usersWithAttribution = await storage.getUsersWithAttribution(limit);
      res.json(usersWithAttribution);
    } catch (error) {
      console.error("Error fetching users attribution:", error);
      res.status(500).json({ error: "Failed to fetch users attribution" });
    }
  });

  // Admin: Manually trigger trial check-in emails (for testing)
  app.post("/api/admin/trigger-checkin-emails", requireAdmin, async (req, res) => {
    try {
      const { runTrialCheckinEmails } = await import("./cron");
      const result = await runTrialCheckinEmails();
      res.json({ 
        success: true, 
        message: `Check-in emails processed: ${result.sent} sent, ${result.errors} errors`,
        ...result 
      });
    } catch (error) {
      console.error("Error running check-in emails:", error);
      res.status(500).json({ error: "Failed to run check-in emails" });
    }
  });

  // Public: Track referral on page visit (store in session)
  app.post("/api/referral/track", async (req, res) => {
    try {
      const { refCode } = req.body;
      
      if (!refCode) {
        return res.status(400).json({ error: "Ref code required" });
      }

      // Validate the ref code exists and is active
      const partner = await storage.getPartnerByRefCode(refCode);
      if (!partner || partner.status !== 'active') {
        return res.status(400).json({ error: "Invalid referral code" });
      }

      // Store in session
      (req.session as any).referralCode = refCode;
      (req.session as any).referralPartnerId = partner.id;
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking referral:", error);
      res.status(500).json({ error: "Failed to track referral" });
    }
  });

  // Public: Get current referral session
  app.get("/api/referral/current", async (req, res) => {
    const refCode = (req.session as any)?.referralCode;
    const partnerId = (req.session as any)?.referralPartnerId;
    
    if (!refCode || !partnerId) {
      return res.json({ hasReferral: false });
    }
    
    res.json({ 
      hasReferral: true, 
      refCode,
      partnerId
    });
  });

  // ============= UNIFIED INBOX API (Multi-Channel CRM) =============

  // Get unified inbox - all contacts sorted by last activity
  app.get("/api/inbox", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const limit = parseInt(req.query.limit as string) || 100;
      const inbox = await storage.getUnifiedInbox(req.user.id, limit);
      res.json(inbox);
    } catch (error) {
      console.error("Error fetching unified inbox:", error);
      res.status(500).json({ error: "Failed to fetch inbox" });
    }
  });



  // ==========================================
  // AI BRAIN API ROUTES (PRO ADD-ON)
  // ==========================================

  // Helper: Check if user has AI Brain access (Pro plan with add-on)
  // Per-plan monthly AI credit allowances
  const AI_MONTHLY_CREDITS: Record<string, number> = {
    free:       0,
    starter:   50,
    pro:       300,
    enterprise: 500,
  };
  const AI_BRAIN_ADDON_BONUS = 700; // Pro+Brain = 300 + 700 = 1000 credits/month

  const checkAiBrainAccess = async (
    userId: string,
    mode?: 'suggest' | 'auto'
  ): Promise<{ hasAccess: boolean; reason?: string; plan: string; monthlyLimit: number; hasAIBrain: boolean }> => {
    const user = await storage.getUser(userId);
    if (!user) return { hasAccess: false, reason: "User not found", plan: 'free', monthlyLimit: 0, hasAIBrain: false };

    const now = new Date();
    const isInTrial  = user.trialEndsAt ? new Date(user.trialEndsAt) > now : false;
    const isDemoUser = user.email === 'demo@whachat.com';
    const storedPlan = user.subscriptionPlan || 'free';
    const effectivePlan = (isInTrial || isDemoUser) ? 'pro' : storedPlan;

    // Check AI Brain add-on (trial and demo always have it)
    let hasAIBrain = false;
    if (isInTrial || isDemoUser) {
      hasAIBrain = true;
    } else if (user.stripeCustomerId) {
      try {
        const limits = await subscriptionService.getUserLimits(userId);
        hasAIBrain = limits?.hasAIBrainAddon ?? false;
      } catch { hasAIBrain = false; }
    }

    const baseLimit  = AI_MONTHLY_CREDITS[effectivePlan] ?? 0;
    const monthlyLimit = hasAIBrain && effectivePlan === 'pro'
      ? baseLimit + AI_BRAIN_ADDON_BONUS
      : baseLimit;

    // Free users: no AI access
    if (effectivePlan === 'free') {
      return { hasAccess: false, reason: "AI features require a Starter or Pro plan", plan: effectivePlan, monthlyLimit: 0, hasAIBrain };
    }

    // Auto mode requires Pro
    if (mode === 'auto' && effectivePlan === 'starter') {
      return { hasAccess: false, reason: "Auto mode requires a Pro plan. Upgrade to unlock.", plan: effectivePlan, monthlyLimit, hasAIBrain };
    }

    return { hasAccess: true, plan: effectivePlan, monthlyLimit, hasAIBrain };
  };

  // Behavioral fair-use controls (internal only - no numbers exposed to users)
  interface FairUseCheck {
    canProceed: boolean;
    status: "healthy" | "limited" | "paused";
    message?: string;
    shouldDowngradeToSuggestOnly?: boolean;
  }

  const checkFairUseBehavior = async (userId: string, chatId?: string): Promise<FairUseCheck> => {
    const usage = await storage.getCurrentAiUsage(userId);
    if (!usage) return { canProceed: true, status: "healthy" };
    
    // Internal thresholds (not exposed to users)
    const internalThreshold = 5000;
    const warningThreshold = internalThreshold * 0.7;
    const criticalThreshold = internalThreshold * 0.9;
    
    const totalUsage = (usage.messagesGenerated || 0) + (usage.repliesSuggested || 0);
    
    // Paused state - soft pause with generic message
    if (usage.usageLimitReached) {
      return { 
        canProceed: false, 
        status: "paused",
        message: "AI assistance is temporarily limited to protect deliverability."
      };
    }
    
    // Auto-pause at internal threshold
    if (totalUsage >= internalThreshold) {
      await storage.upsertAiUsage(userId, { usageLimitReached: true });
      return { 
        canProceed: false, 
        status: "paused",
        message: "AI assistance is temporarily limited to protect deliverability."
      };
    }
    
    // Critical threshold - auto-downgrade to suggest-only mode
    if (totalUsage >= criticalThreshold) {
      return { 
        canProceed: true, 
        status: "limited",
        shouldDowngradeToSuggestOnly: true,
        message: "AI assistance is temporarily limited to protect deliverability."
      };
    }
    
    // Warning threshold - still allow but flag as limited
    if (totalUsage >= warningThreshold) {
      return { 
        canProceed: true, 
        status: "limited"
      };
    }
    
    return { canProceed: true, status: "healthy" };
  };
  
  // Rate limiting per conversation (cooldown between rapid AI messages)
  const conversationCooldowns = new Map<string, number>();
  const COOLDOWN_MS = 3000; // 3 second cooldown between AI messages per chat
  
  const checkConversationRateLimit = (chatId: string): boolean => {
    const now = Date.now();
    const lastCall = conversationCooldowns.get(chatId);
    
    if (lastCall && (now - lastCall) < COOLDOWN_MS) {
      return false;
    }
    
    conversationCooldowns.set(chatId, now);
    return true;
  };

  // Get AI settings
  app.get("/api/ai/settings", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;
      
      // Check access
      const access = await checkAiBrainAccess(userId);
      if (!access.hasAccess) {
        return res.status(403).json({ error: access.reason, needsUpgrade: true });
      }
      
      const settings = await storage.getAiSettings(userId);
      res.json(settings || {
        aiMode: "suggest_only",
        businessHoursOnly: false,
        confidenceLevel: "balanced",
        leadQualificationEnabled: true,
        autoTaggingEnabled: true,
        handoffKeywords: ["call me", "human", "agent", "speak to someone"],
        aiPersona: "professional",
      });
    } catch (error) {
      console.error("AI settings fetch error:", error);
      res.status(500).json({ error: "Failed to fetch AI settings" });
    }
  });

  // Update AI settings
  app.patch("/api/ai/settings", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;
      
      // Check access
      const access = await checkAiBrainAccess(userId);
      if (!access.hasAccess) {
        return res.status(403).json({ error: access.reason, needsUpgrade: true });
      }
      
      // Validate and extract allowed fields explicitly (no bracket notation)
      const { aiMode, businessHoursOnly, confidenceLevel, leadQualificationEnabled, autoTaggingEnabled, handoffKeywords, aiPersona } = req.body;
      const updates: Record<string, any> = {};
      if (aiMode !== undefined) updates.aiMode = aiMode;
      if (businessHoursOnly !== undefined) updates.businessHoursOnly = businessHoursOnly;
      if (confidenceLevel !== undefined) updates.confidenceLevel = confidenceLevel;
      if (leadQualificationEnabled !== undefined) updates.leadQualificationEnabled = leadQualificationEnabled;
      if (autoTaggingEnabled !== undefined) updates.autoTaggingEnabled = autoTaggingEnabled;
      if (handoffKeywords !== undefined) updates.handoffKeywords = handoffKeywords;
      if (aiPersona !== undefined) updates.aiPersona = aiPersona;
      
      const settings = await storage.upsertAiSettings(userId, updates);
      res.json(settings);
    } catch (error) {
      console.error("AI settings update error:", error);
      res.status(500).json({ error: "Failed to update AI settings" });
    }
  });

  // Get business knowledge
  app.get("/api/ai/business-knowledge", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;
      const knowledge = await storage.getAiBusinessKnowledge(userId);
      res.json(knowledge || {
        businessName: "",
        industry: "",
        servicesProducts: "",
        businessHours: "",
        locations: "",
        bookingLink: "",
        faqs: [],
        salesGoals: "",
        customInstructions: "",
        qualifyingQuestions: [],
      });
    } catch (error) {
      console.error("Business knowledge fetch error:", error);
      res.status(500).json({ error: "Failed to fetch business knowledge" });
    }
  });

  // Update business knowledge
  app.patch("/api/ai/business-knowledge", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;
      const knowledge = await storage.upsertAiBusinessKnowledge(userId, req.body);
      res.json(knowledge);
    } catch (error) {
      console.error("Business knowledge update error:", error);
      res.status(500).json({ error: "Failed to update business knowledge" });
    }
  });

  // Get AI health status (no numeric details exposed)
  app.get("/api/ai/health", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;
      
      const access = await checkAiBrainAccess(userId);
      if (!access.hasAccess) {
        return res.status(403).json({ error: access.reason, needsUpgrade: true });
      }
      
      const fairUse = await checkFairUseBehavior(userId);
      
      res.json({
        status: fairUse.status,
        message: fairUse.message || undefined
      });
    } catch (error) {
      console.error("AI health fetch error:", error);
      res.status(500).json({ error: "Failed to fetch AI health" });
    }
  });

  // Generate automation from plain English
  app.post("/api/ai/generate-automation", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;
      
      // Check access and usage limits
      const access = await checkAiBrainAccess(userId);
      if (!access.hasAccess) {
        return res.status(403).json({ error: access.reason, needsUpgrade: true });
      }
      
      const fairUse = await checkFairUseBehavior(userId);
      if (!fairUse.canProceed) {
        return res.status(429).json({ 
          error: fairUse.message || "AI assistance is temporarily limited to protect deliverability.",
          status: fairUse.status
        });
      }
      
      const { prompt } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt required" });
      }

      const { aiService } = await import("./aiService");
      const knowledge = await storage.getAiBusinessKnowledge(userId);
      const workflow = await aiService.generateAutomation(prompt, knowledge || undefined);
      
      // Track usage
      await storage.incrementAiUsage(userId, 'automationsGenerated');
      
      res.json(workflow);
    } catch (error) {
      console.error("Automation generation error:", error);
      res.status(500).json({ error: "Failed to generate automation" });
    }
  });

  // Get current AI usage summary for the billing period
  app.get("/api/ai/usage", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const userId = req.user.id;

      const access = await checkAiBrainAccess(userId);
      const usage  = await storage.getCurrentAiUsage(userId);
      const fairUse = await checkFairUseBehavior(userId);

      const creditsUsed     = (usage?.repliesSuggested || 0) + (usage?.messagesGenerated || 0);
      const monthlyLimit    = access.monthlyLimit;
      const creditsRemaining = Math.max(0, monthlyLimit - creditsUsed);
      const creditPercent   = monthlyLimit > 0 ? Math.round((creditsUsed / monthlyLimit) * 100) : 0;

      res.json({
        plan:              access.plan,
        hasAIBrain:        access.hasAIBrain,
        creditsUsed,
        monthlyLimit,
        creditsRemaining,
        creditPercent,
        fairUseStatus:     fairUse.status,
        usageLimitReached: usage?.usageLimitReached || false,
        periodStart:       usage?.periodStart,
        periodEnd:         usage?.periodEnd,
        // Feature access flags (for frontend capability hook)
        canUseSuggest:     access.plan !== 'free',
        canUseAuto:        access.plan === 'pro' || access.plan === 'enterprise',
        canUseWorkflowRecommendations: access.plan === 'pro' || access.plan === 'enterprise',
        canUseCopilotIntelligence:     access.plan !== 'free',
      });
    } catch (error) {
      console.error("AI usage fetch error:", error);
      res.status(500).json({ error: "Failed to fetch AI usage" });
    }
  });

  // Get AI reply suggestions for a conversation
  app.post("/api/ai/suggest-reply", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;

      const { chatId, conversationHistory, tone, aiMode: requestedMode, contactContext } = req.body;

      // Check access and plan eligibility (pass mode to enforce Auto=Pro-only)
      const access = await checkAiBrainAccess(userId, requestedMode === 'auto' ? 'auto' : 'suggest');
      if (!access.hasAccess) {
        return res.status(403).json({ error: access.reason, needsUpgrade: true, plan: access.plan });
      }

      // Enforce per-plan monthly credit limits
      if (access.monthlyLimit > 0) {
        const usage      = await storage.getCurrentAiUsage(userId);
        const creditsUsed = (usage?.repliesSuggested || 0) + (usage?.messagesGenerated || 0);
        if (creditsUsed >= access.monthlyLimit) {
          return res.status(429).json({
            error:        "Monthly AI credit limit reached. Upgrade your plan for more credits.",
            status:       "credits_exhausted",
            creditsUsed,
            monthlyLimit: access.monthlyLimit,
            needsUpgrade: access.plan === 'starter',
            plan:         access.plan,
          });
        }
      }

      const fairUse = await checkFairUseBehavior(userId);
      if (!fairUse.canProceed) {
        return res.status(429).json({ 
          error: fairUse.message || "AI assistance is temporarily limited to protect deliverability.",
          status: fairUse.status
        });
      }
      
      // Rate limiting per conversation
      if (chatId && !checkConversationRateLimit(chatId)) {
        return res.status(429).json({ 
          error: "Please wait a moment before requesting another suggestion.",
          status: "rate_limited"
        });
      }
      
      if (!conversationHistory || !Array.isArray(conversationHistory)) {
        return res.status(400).json({ error: "Conversation history required" });
      }

      const { aiService } = await import("./aiService");
      const knowledge = await storage.getAiBusinessKnowledge(userId);
      const settings = await storage.getAiSettings(userId);
      
      // Validate tone parameter
      const validTones = ["neutral", "friendly", "professional", "sales"];
      const selectedTone = validTones.includes(tone) ? tone : undefined;
      
      // Use explicit language override from request, fall back to user's preferred language
      const validLanguages = ["en", "he", "es", "ar"];
      const requestLanguage = req.body.language;
      const aiLanguage = (validLanguages.includes(requestLanguage) ? requestLanguage : req.user.language) as "en" | "he" | "es" | "ar" | undefined;
      
      const suggestion = await aiService.suggestReply(
        userId,
        chatId,
        conversationHistory,
        knowledge || undefined,
        settings || undefined,
        selectedTone,
        aiLanguage,
        contactContext || undefined
      );
      
      // Track usage
      await storage.incrementAiUsage(userId, 'repliesSuggested');
      
      res.json({ 
        ...suggestion, 
        status: fairUse.status,
        shouldDowngradeToSuggestOnly: fairUse.shouldDowngradeToSuggestOnly
      });
    } catch (error) {
      console.error("Reply suggestion error:", error);
      res.status(500).json({ error: "Failed to generate suggestion" });
    }
  });

  // Extract lead data from conversation
  app.post("/api/ai/extract-lead", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;
      const { chatId, conversationHistory } = req.body;
      
      if (!conversationHistory || !Array.isArray(conversationHistory)) {
        return res.status(400).json({ error: "Conversation history required" });
      }

      const { aiService } = await import("./aiService");
      const knowledge = await storage.getAiBusinessKnowledge(userId);
      
      const leadData = await aiService.extractLeadData(conversationHistory, knowledge || undefined);
      
      // Save lead score if chatId provided
      if (chatId) {
        await storage.upsertAiLeadScore(chatId, userId, leadData);
        await storage.incrementAiUsage(userId, 'leadsQualified');
      }
      
      res.json(leadData);
    } catch (error) {
      console.error("Lead extraction error:", error);
      res.status(500).json({ error: "Failed to extract lead data" });
    }
  });

  // Summarize conversation
  app.post("/api/ai/summarize", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { conversationHistory } = req.body;
      
      if (!conversationHistory || !Array.isArray(conversationHistory)) {
        return res.status(400).json({ error: "Conversation history required" });
      }

      const { aiService } = await import("./aiService");
      const summary = await aiService.summarizeConversation(conversationHistory);
      
      res.json({ summary });
    } catch (error) {
      console.error("Summarization error:", error);
      res.status(500).json({ error: "Failed to summarize conversation" });
    }
  });

  // Generate AI Memory — natural-language lead summary for AI Memory tab
  app.post("/api/ai/memory", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { messages, intel } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages array required" });
      }

      const { aiService } = await import("./aiService");
      const memory = await aiService.generateAIMemory(messages, intel || {});

      res.json({ memory });
    } catch (error) {
      console.error("AI Memory generation error:", error);
      res.status(500).json({ error: "Failed to generate AI memory" });
    }
  });

  // ============= ROUTE MODULES =============
  registerMediaRoutes(app);
  registerContactRoutes(app);
  registerConversationRoutes(app);
  registerChannelRoutes(app);
  registerAutomationTemplateRoutes(app);
  registerTemplateRoutes(app);
  registerWebhookRoutes(app);

  return httpServer;
}
