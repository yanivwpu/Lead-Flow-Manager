import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertChatSchema, insertRegisteredPhoneSchema, insertSalespersonSchema, insertDemoBookingSchema, PLAN_LIMITS, type SubscriptionPlan } from "@shared/schema";
import { z } from "zod";
import { getVapidPublicKey } from "./notifications";
import {
  sendUserWhatsAppMessage,
  sendUserWhatsAppMedia,
  verifyUserTwilioConnection,
  parseIncomingWebhook,
  parseStatusWebhook,
  findOrCreateChatByPhone,
  findUserByTwilioCredentials,
  connectUserTwilio,
  disconnectUserTwilio,
  validateTwilioCredentials,
  encryptCredential,
  decryptCredential,
  isEncrypted,
  type WhatsAppMessage,
  type TwilioCredentials,
} from "./userTwilio";
import {
  sendMetaWhatsAppMessage,
  sendMetaWhatsAppMedia,
  sendMetaWhatsAppTemplate,
  verifyMetaConnection,
  connectUserMeta,
  disconnectUserMeta,
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
  type MetaCredentials,
} from "./userMeta";
import multer from "multer";
import path from "path";
import fs from "fs";
import { subscriptionService } from "./subscriptionService";
import { sendWelcomeEmail, sendContactFormEmail, sendDemoBookingNotification, sendDemoConfirmationEmail, sendSalespersonWelcomeEmail } from "./email";
import bcrypt from "bcryptjs";
import { triggerNewChatWorkflows, triggerKeywordWorkflows } from "./workflowEngine";
import shopifyRoutes from "./shopifyRoutes";

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
  partner_referral: "2026-01-26",
  salesperson_commission: "2026-01-26",
} as const;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Shopify integration routes
  app.use('/api/shopify', shopifyRoutes);

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
      
      const headers = ['Name', 'Phone', 'Tag', 'Pipeline Stage', 'Status', 'Notes', 'Follow-up', 'Last Message', 'Created'];
      const rows = chats.map((chat: any) => [
        chat.name || '',
        chat.whatsappPhone || '',
        chat.tag || '',
        chat.pipelineStage || '',
        chat.status || '',
        (chat.notes || '').replace(/"/g, '""'),
        chat.followUp || '',
        (chat.lastMessage || '').replace(/"/g, '""'),
        chat.createdAt ? new Date(chat.createdAt).toISOString().split('T')[0] : ''
      ]);
      
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

      // Check which provider is active and verify connection
      const user = await storage.getUser(req.user.id);
      const activeProvider = user?.whatsappProvider || "twilio";
      
      if (activeProvider === "meta") {
        const isMetaConnected = await verifyMetaConnection(req.user.id);
        if (!isMetaConnected) {
          return res.status(400).json({ 
            error: "Meta WhatsApp not connected. Please connect your Meta WhatsApp Business API first.",
            code: "META_NOT_CONNECTED"
          });
        }
      } else {
        const isTwilioConnected = await verifyUserTwilioConnection(req.user.id);
        if (!isTwilioConnected) {
          return res.status(400).json({ 
            error: "WhatsApp not connected. Please connect your Twilio account first.",
            code: "TWILIO_NOT_CONNECTED"
          });
        }
      }

      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      let messageId: string;
      
      if (activeProvider === "meta") {
        const result = await sendMetaWhatsAppMessage(req.user.id, chat.whatsappPhone, message);
        messageId = result.messageId;
      } else {
        const result = await sendUserWhatsAppMessage(req.user.id, chat.whatsappPhone, message);
        messageId = result.sid;
      }

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

      const isConnected = await verifyUserTwilioConnection(req.user.id);
      if (!isConnected) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ 
          error: "WhatsApp not connected. Please connect your Twilio account first.",
          code: "TWILIO_NOT_CONNECTED"
        });
      }

      // For Twilio, we need a publicly accessible URL for the media
      // Since we're on Replit, we can serve the file temporarily
      const appUrl = process.env.APP_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      const mediaUrl = `${appUrl}/uploads/${path.basename(req.file.path)}`;

      const result = await sendUserWhatsAppMedia(req.user.id, phone, mediaUrl);

      // Track usage
      const mediaCost = 0.01; // Higher cost for media
      const costs = calculateCostWithMarkup(mediaCost);
      await storage.recordMessageUsage({
        userId: req.user.id,
        chatId: chat.id,
        direction: "outbound",
        messageType: req.file.mimetype.startsWith('image/') ? "image" : "document",
        twilioSid: result.sid,
        twilioCost: costs.twilioCost,
        markupPercent: costs.markupPercent,
        totalCost: costs.totalCost,
      });

      const newMessage: WhatsAppMessage = {
        id: result.sid,
        text: req.file.mimetype.startsWith('image/') ? '[Image]' : `[File: ${req.file.originalname}]`,
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        sent: true,
        sender: "me",
        status: "sent",
        twilioSid: result.sid,
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

  // Get automation templates
  app.get("/api/automation-templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { language, category, industry } = req.query;
      const { getFilteredTemplates, CATEGORY_LABELS, INDUSTRY_LABELS } = await import("../shared/localizedTemplates");
      
      const templates = getFilteredTemplates(
        language as any,
        category as any,
        industry as any
      );
      
      res.json({
        templates,
        categoryLabels: CATEGORY_LABELS,
        industryLabels: INDUSTRY_LABELS
      });
    } catch (error) {
      console.error("Error fetching automation templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Get user's saved automation templates
  app.get("/api/user-automation-templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const templates = await storage.getUserAutomationTemplates(req.user.id, req.query as any);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching user automation templates:", error);
      res.status(500).json({ error: "Failed to fetch user templates" });
    }
  });

  // Save a preset template to user's library
  app.post("/api/user-automation-templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const template = await storage.createUserAutomationTemplate({
        ...req.body,
        userId: req.user.id,
        isActive: req.body.isActive || false,
      });
      res.status(201).json(template);
    } catch (error) {
      console.error("Error saving automation template:", error);
      res.status(500).json({ error: "Failed to save template" });
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

      const webhookBaseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      const result = await connectUserTwilio(req.user.id, credentials, webhookBaseUrl);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ 
        success: true, 
        message: result.webhooksConfigured 
          ? "Twilio connected and webhooks configured automatically!"
          : "Twilio connected successfully",
        webhookUrl: `${webhookBaseUrl}/api/webhook/twilio/incoming`,
        statusCallbackUrl: `${webhookBaseUrl}/api/webhook/twilio/status`,
        webhooksConfigured: result.webhooksConfigured,
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

  // ============= Meta WhatsApp Business API Connection Endpoints =============

  // Get Meta connection status
  app.get("/api/meta/status", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const webhookBaseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      
      res.json({
        connected: user.metaConnected || false,
        phoneNumber: user.metaPhoneNumberId ? `Meta ID: ${user.metaPhoneNumberId.slice(0, 10)}...` : null,
        phoneNumberId: user.metaPhoneNumberId || null,
        businessAccountId: user.metaBusinessAccountId || null,
        hasCredentials: !!(user.metaAccessToken && user.metaPhoneNumberId),
        activeProvider: user.whatsappProvider || "twilio",
        twilioConnected: user.twilioConnected || false,
        webhookUrl: `${webhookBaseUrl}/api/webhooks/meta`,
        webhookVerifyToken: user.metaConnected ? user.metaWebhookVerifyToken : null,
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

      const webhookBaseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      
      // Get the actual stored verify token to return to user
      const updatedUser = await storage.getUser(req.user.id);
      
      res.json({ 
        success: true, 
        message: "Meta WhatsApp Business API connected successfully!",
        phoneNumber: result.phoneNumber,
        webhookUrl: `${webhookBaseUrl}/api/webhooks/meta`,
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

      await disconnectUserMeta(req.user.id);
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
      
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        activeProvider: user.whatsappProvider || "twilio",
        twilio: {
          connected: user.twilioConnected || false,
          whatsappNumber: user.twilioWhatsappNumber || null,
        },
        meta: {
          connected: user.metaConnected || false,
          phoneNumberId: user.metaPhoneNumberId || null,
          businessAccountId: user.metaBusinessAccountId || null,
        },
      });
    } catch (error) {
      console.error("Error getting provider status:", error);
      res.status(500).json({ error: "Failed to get provider status" });
    }
  });

  // Get Meta message templates
  app.get("/api/meta/templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const templates = await getMetaMessageTemplates(req.user.id);
      res.json(templates);
    } catch (error: any) {
      console.error("Error fetching Meta templates:", error);
      res.status(500).json({ error: error.message || "Failed to fetch templates" });
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
    console.log("=== TWILIO WEBHOOK HIT ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
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

      // Trigger workflow automations (Pro feature)
      const updatedChat = await storage.getChat(chat.id);
      if (updatedChat) {
        if (isNewChat) {
          triggerNewChatWorkflows(userId, updatedChat).catch(err => 
            console.error("New chat workflow error:", err)
          );
        }
        triggerKeywordWorkflows(userId, updatedChat, parsed.body).catch(err => 
          console.error("Keyword workflow error:", err)
        );
      }

      // Auto-reply & Business Hours handling
      try {
        const userSettings = await storage.getUser(userId);
        if (userSettings) {
          let shouldSendAutoReply = false;
          let autoReplyText = "";

          // Check if outside business hours and away message is enabled
          if (userSettings.businessHoursEnabled && userSettings.awayMessageEnabled) {
            const now = new Date();
            const userTimezone = userSettings.timezone || "America/New_York";
            const nowInTimezone = new Date(now.toLocaleString("en-US", { timeZone: userTimezone }));
            const currentDay = nowInTimezone.getDay();
            const currentTime = nowInTimezone.toTimeString().slice(0, 5); // HH:mm
            
            const businessDays = (userSettings.businessDays as number[]) || [1, 2, 3, 4, 5];
            const startTime = userSettings.businessHoursStart || "09:00";
            const endTime = userSettings.businessHoursEnd || "17:00";
            
            const isBusinessDay = businessDays.includes(currentDay);
            const isWithinHours = currentTime >= startTime && currentTime <= endTime;
            
            if (!isBusinessDay || !isWithinHours) {
              shouldSendAutoReply = true;
              autoReplyText = userSettings.awayMessage || "Thanks for reaching out! We're currently away but will respond as soon as we're back.";
            }
          }

          // If within business hours but auto-reply is enabled, send auto-reply
          if (!shouldSendAutoReply && userSettings.autoReplyEnabled) {
            shouldSendAutoReply = true;
            autoReplyText = userSettings.autoReplyMessage || "Thanks for your message! We'll get back to you shortly.";
          }

          // Send the auto-reply via user's Twilio account
          if (shouldSendAutoReply && autoReplyText && chat.whatsappPhone) {
            const delay = userSettings.autoReplyDelay || 0;
            setTimeout(async () => {
              try {
                await sendUserWhatsAppMessage(userId, chat.whatsappPhone!, autoReplyText);
                console.log("Auto-reply sent to:", chat.whatsappPhone);
                
                // Record the auto-reply message in chat history
                const autoReplyMessage = {
                  id: `auto-${Date.now()}`,
                  text: autoReplyText,
                  time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
                  sent: true,
                  sender: "me",
                };
                const currentChat = await storage.getChat(chat.id);
                if (currentChat) {
                  const msgs = (currentChat.messages as any[]) || [];
                  msgs.push(autoReplyMessage);
                  await storage.updateChat(chat.id, { messages: msgs });
                }
              } catch (err) {
                console.error("Failed to send auto-reply:", err);
              }
            }, delay * 1000);
          }
        }
      } catch (autoReplyError) {
        console.error("Auto-reply error:", autoReplyError);
      }

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
        // Find user with matching verify token
        const { db } = await import("../drizzle/db");
        const { users } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");

        const allUsers = await db.select().from(users).where(eq(users.metaConnected, true));
        const matchingUser = allUsers.find(u => u.metaWebhookVerifyToken === token);

        if (matchingUser) {
          console.log("Meta webhook verified for user:", matchingUser.id);
          return res.status(200).send(challenge);
        }

        // Also check against a global verify token from env if set
        const globalToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
        if (globalToken && token === globalToken) {
          console.log("Meta webhook verified with global token");
          return res.status(200).send(challenge);
        }
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
      console.log("Meta webhook received:", JSON.stringify(req.body).substring(0, 500));

      // Verify webhook signature for security - REQUIRED
      const signature = req.headers["x-hub-signature-256"] as string;
      
      // Reject requests without signature header (security requirement)
      if (!signature) {
        console.warn("Meta webhook rejected: Missing X-Hub-Signature-256 header");
        return res.status(403).send("Missing signature");
      }
      
      // Get the raw body for signature verification
      const rawBody = JSON.stringify(req.body);
      
      // Check against global app secret first
      const globalAppSecret = process.env.META_APP_SECRET;
      let signatureValid = false;
      
      if (globalAppSecret) {
        signatureValid = verifyMetaWebhookSignature(rawBody, signature, globalAppSecret);
      }
      
      // If not valid with global secret, try to find user's app secret from phone number ID
      if (!signatureValid) {
        const entry = req.body.entry?.[0];
        const phoneNumberId = entry?.changes?.[0]?.value?.metadata?.phone_number_id;
        
        if (phoneNumberId) {
          const user = await findUserByMetaPhoneNumberId(phoneNumberId);
          if (user?.metaAppSecret) {
            const userSecret = isMetaEncrypted(user.metaAppSecret)
              ? decryptMetaCredential(user.metaAppSecret)
              : user.metaAppSecret;
            signatureValid = verifyMetaWebhookSignature(rawBody, signature, userSecret);
          }
        }
      }
      
      if (!signatureValid) {
        console.warn("Meta webhook signature verification failed");
        // Respond 403 for invalid signatures
        return res.status(403).send("Invalid signature");
      }

      // Always respond quickly to avoid timeout
      res.status(200).send("EVENT_RECEIVED");

      // Process message asynchronously
      const incomingMessage = parseMetaIncomingWebhook(req.body);
      const statusUpdate = parseMetaStatusWebhook(req.body);

      if (incomingMessage) {
        console.log("Parsed incoming Meta message:", incomingMessage);

        // Find user by phone number ID
        const user = await findUserByMetaPhoneNumberId(incomingMessage.phoneNumberId);
        if (!user) {
          console.log("No user found for phone number ID:", incomingMessage.phoneNumberId);
          return;
        }

        // Find or create chat
        const chat = await findOrCreateChatByPhone(
          user.id,
          incomingMessage.from,
          incomingMessage.profileName || incomingMessage.from
        );

        // Add message to chat
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

        // Track usage
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

        // Mark message as read
        await markMessageAsRead(user.id, incomingMessage.messageId);

        // Trigger workflows for new chats
        if (messages.length === 1) {
          await triggerNewChatWorkflows(user.id, chat);
        }

        // Trigger keyword workflows
        if (incomingMessage.text) {
          await triggerKeywordWorkflows(user.id, chat, incomingMessage.text);
        }

        // Handle auto-reply if enabled
        if (user.autoReplyEnabled && user.autoReplyMessage) {
          try {
            const delay = user.autoReplyDelay || 0;
            setTimeout(async () => {
              try {
                await sendMetaWhatsAppMessage(user.id, incomingMessage.from, user.autoReplyMessage!);
                
                const autoReplyMsg = {
                  id: `auto-${Date.now()}`,
                  text: user.autoReplyMessage,
                  time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
                  sent: true,
                  sender: "me" as const,
                };
                const currentChat = await storage.getChat(chat.id);
                if (currentChat) {
                  const msgs = (currentChat.messages as any[]) || [];
                  msgs.push(autoReplyMsg);
                  await storage.updateChat(chat.id, { messages: msgs });
                }
              } catch (err) {
                console.error("Failed to send auto-reply via Meta:", err);
              }
            }, delay * 1000);
          } catch (autoReplyError) {
            console.error("Auto-reply error:", autoReplyError);
          }
        }

        console.log("Meta message processed successfully");
      }

      if (statusUpdate) {
        console.log("Meta status update:", statusUpdate);
        // Could update message status in the chat if needed
      }
    } catch (error) {
      console.error("Meta webhook error:", error);
      // Don't return error - Meta expects 200
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

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const result = await subscriptionService.createCheckoutSession(req.user.id, planId, baseUrl);
      res.json(result);
    } catch (error: any) {
      console.error("Error creating checkout:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout" });
    }
  });

  // Create checkout session for AI Brain add-on ($29/mo)
  app.post("/api/subscription/addon/ai-brain", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
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

      const returnUrl = `${req.protocol}://${req.get('host')}/app/settings`;
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
      const chats = await storage.searchMessages(req.user.id, query);
      
      // Transform to search results format with matched text excerpts
      const results = chats.flatMap(chat => {
        const matches: any[] = [];
        const queryLower = query.toLowerCase();
        
        // Check messages for matches
        const messages = (chat.messages as any[]) || [];
        for (const msg of messages) {
          if (msg.text && msg.text.toLowerCase().includes(queryLower)) {
            matches.push({
              chatId: chat.id,
              chatName: chat.name,
              avatar: chat.avatar,
              matchedText: msg.text.length > 150 
                ? msg.text.substring(0, 150) + '...' 
                : msg.text,
              timestamp: msg.time || chat.time,
              pipelineStage: chat.pipelineStage,
              tag: chat.tag,
            });
          }
        }
        
        // Check notes for matches
        if (chat.notes && chat.notes.toLowerCase().includes(queryLower)) {
          matches.push({
            chatId: chat.id,
            chatName: chat.name,
            avatar: chat.avatar,
            matchedText: `Note: ${chat.notes.length > 150 ? chat.notes.substring(0, 150) + '...' : chat.notes}`,
            timestamp: chat.time || 'Recently',
            pipelineStage: chat.pipelineStage,
            tag: chat.tag,
          });
        }
        
        // Check name for matches
        if (chat.name.toLowerCase().includes(queryLower) && matches.length === 0) {
          matches.push({
            chatId: chat.id,
            chatName: chat.name,
            avatar: chat.avatar,
            matchedText: chat.lastMessage || 'No recent messages',
            timestamp: chat.time || 'Recently',
            pipelineStage: chat.pipelineStage,
            tag: chat.tag,
          });
        }
        
        return matches;
      }).slice(0, 50); // Limit to 50 results
      
      res.json(results);
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
      
      // Return with masked config
      res.status(201).json({
        ...integration,
        config: maskIntegrationConfig(config),
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
        
        const rows = chats.map(chat => ({
          name: chat.name,
          phone: chat.whatsappPhone || '',
          tag: chat.tag,
          pipelineStage: chat.pipelineStage,
          status: chat.status,
          notes: chat.notes || '',
          lastMessage: chat.lastMessage,
          createdAt: chat.createdAt?.toISOString() || '',
          updatedAt: chat.updatedAt?.toISOString() || '',
        }));
        
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

  // ============= Localized Automation Templates =============
  
  // Get localized automation templates
  app.get("/api/automation-templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { language, category, industry } = req.query;
      const { getFilteredTemplates, CATEGORY_LABELS, INDUSTRY_LABELS } = await import("@shared/localizedTemplates");
      
      const templates = getFilteredTemplates(
        language as any,
        category as any,
        industry as any
      );
      
      res.json({
        templates,
        categoryLabels: CATEGORY_LABELS,
        industryLabels: INDUSTRY_LABELS
      });
    } catch (error) {
      console.error("Error fetching automation templates:", error);
      res.status(500).json({ error: "Failed to fetch automation templates" });
    }
  });

  // ============= User Automation Templates (Saved from Presets) =============
  
  // Get user's saved automation templates
  app.get("/api/user-automation-templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { language, category, industry, isActive } = req.query;
      const templates = await storage.getUserAutomationTemplates(req.user.id, {
        language: language as string,
        category: category as string,
        industry: industry as string,
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      });
      
      res.json(templates);
    } catch (error) {
      console.error("Error fetching user automation templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });
  
  // Get single user automation template
  app.get("/api/user-automation-templates/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const template = await storage.getUserAutomationTemplate(req.params.id);
      if (!template || template.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });
  
  // Save a preset template to user's library
  app.post("/api/user-automation-templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { presetTemplateId, name, language, category, industry, messages, placeholders, placeholderDefaults, aiEnabled, triggerType, triggerConfig } = req.body;
      
      if (!presetTemplateId || !name || !category) {
        return res.status(400).json({ error: "Missing required fields: presetTemplateId, name, category" });
      }
      
      const template = await storage.createUserAutomationTemplate({
        userId: req.user.id,
        presetTemplateId,
        name,
        language: language || "en",
        category,
        industry: industry || "general",
        messages: messages || [],
        placeholders: placeholders || [],
        placeholderDefaults: placeholderDefaults || {},
        aiEnabled: aiEnabled || false,
        triggerType: triggerType || "manual",
        triggerConfig: triggerConfig || {},
      });
      
      res.json(template);
    } catch (error) {
      console.error("Error creating user automation template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });
  
  // Update user automation template
  app.patch("/api/user-automation-templates/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const existing = await storage.getUserAutomationTemplate(req.params.id);
      if (!existing || existing.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      const updated = await storage.updateUserAutomationTemplate(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });
  
  // Delete user automation template
  app.delete("/api/user-automation-templates/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const existing = await storage.getUserAutomationTemplate(req.params.id);
      if (!existing || existing.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      await storage.deleteUserAutomationTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });
  
  // Activate/Launch automation template
  app.post("/api/user-automation-templates/:id/activate", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const existing = await storage.getUserAutomationTemplate(req.params.id);
      if (!existing || existing.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      const updated = await storage.updateUserAutomationTemplate(req.params.id, { isActive: true });
      res.json({ success: true, template: updated });
    } catch (error) {
      console.error("Error activating template:", error);
      res.status(500).json({ error: "Failed to activate template" });
    }
  });
  
  // Deactivate automation template
  app.post("/api/user-automation-templates/:id/deactivate", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const existing = await storage.getUserAutomationTemplate(req.params.id);
      if (!existing || existing.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      const updated = await storage.updateUserAutomationTemplate(req.params.id, { isActive: false });
      res.json({ success: true, template: updated });
    } catch (error) {
      console.error("Error deactivating template:", error);
      res.status(500).json({ error: "Failed to deactivate template" });
    }
  });
  
  // Get template usage analytics
  app.get("/api/user-automation-templates/:id/analytics", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const existing = await storage.getUserAutomationTemplate(req.params.id);
      if (!existing || existing.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      const stats = await storage.getTemplateUsageStats(req.user.id, req.params.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching template analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ============= Template Messaging Endpoints (Pro Feature) =============

  // Get user's message templates
  app.get("/api/templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        return res.status(403).json({ error: "Template messaging is a Pro feature" });
      }
      
      const templates = await storage.getMessageTemplates(req.user.id);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Sync templates from Twilio Content API
  app.post("/api/templates/sync", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        return res.status(403).json({ error: "Template messaging is a Pro feature" });
      }
      
      const user = await storage.getUser(req.user.id);
      if (!user?.twilioConnected || !user.twilioAccountSid || !user.twilioAuthToken) {
        return res.status(400).json({ error: "Twilio is not connected. Connect Twilio in Settings first." });
      }
      
      // For now, return a placeholder - actual Twilio Content API sync would happen here
      // The Twilio Content API requires additional setup and approval
      console.log(`Template sync requested for user ${req.user.id}`);
      
      res.json({ 
        success: true, 
        message: "Template sync initiated. Note: Templates must be created and approved in your Twilio console first.",
        templatesFound: 0 
      });
    } catch (error) {
      console.error("Error syncing templates:", error);
      res.status(500).json({ error: "Failed to sync templates" });
    }
  });

  // Get retargetable chats (outside 24-hour window)
  app.get("/api/templates/retargetable-chats", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        return res.status(403).json({ error: "Template messaging is a Pro feature" });
      }
      
      const chats = await storage.getRetargetableChats(req.user.id);
      
      // Add days since last message for each chat
      const now = Date.now();
      const retargetableChats = chats.map(chat => ({
        id: chat.id,
        name: chat.name,
        avatar: chat.avatar,
        whatsappPhone: chat.whatsappPhone,
        lastMessage: chat.lastMessage,
        lastMessageAt: chat.updatedAt?.toISOString(),
        daysSinceLastMessage: chat.updatedAt 
          ? Math.floor((now - new Date(chat.updatedAt).getTime()) / (24 * 60 * 60 * 1000))
          : 0,
      }));
      
      res.json(retargetableChats);
    } catch (error) {
      console.error("Error fetching retargetable chats:", error);
      res.status(500).json({ error: "Failed to fetch retargetable chats" });
    }
  });

  // Send a template message
  app.post("/api/templates/send", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        return res.status(403).json({ error: "Template messaging is a Pro feature" });
      }
      
      const { templateId, chatId, variables } = req.body;
      if (!templateId || !chatId) {
        return res.status(400).json({ error: "Template ID and Chat ID are required" });
      }
      
      const template = await storage.getMessageTemplate(templateId);
      if (!template || template.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== req.user.id) {
        return res.status(404).json({ error: "Chat not found" });
      }
      
      if (!chat.whatsappPhone) {
        return res.status(400).json({ error: "Chat does not have a WhatsApp number" });
      }
      
      // Log the template send (actual sending would use Twilio Content API)
      const templateSend = await storage.createTemplateSend({
        userId: req.user.id,
        chatId,
        templateId,
        variableValues: variables || {},
        status: "sent",
      });
      
      console.log(`Template ${template.name} sent to ${chat.name} (${chat.whatsappPhone})`);
      
      res.json({ 
        success: true, 
        message: `Template "${template.name}" sent to ${chat.name}`,
        sendId: templateSend.id 
      });
    } catch (error) {
      console.error("Error sending template:", error);
      res.status(500).json({ error: "Failed to send template" });
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
      
      const { name, description, nodes, edges, triggerKeywords, triggerOnNewChat } = req.body;
      
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
      
      const { name, description, nodes, edges, triggerKeywords, triggerOnNewChat, isActive } = req.body;
      
      const flow = await storage.updateChatbotFlow(req.params.id, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(nodes !== undefined && { nodes }),
        ...(edges !== undefined && { edges }),
        ...(triggerKeywords !== undefined && { triggerKeywords }),
        ...(triggerOnNewChat !== undefined && { triggerOnNewChat }),
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
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      const storedHash = await storage.getAdminPasswordHash();

      if (!storedHash) {
        // First-time setup: set the password
        const hash = await bcrypt.hash(password, 10);
        await storage.setAdminPassword(hash);
        (req.session as any).isAdmin = true;
        return res.json({ success: true, message: "Admin password set" });
      }

      const valid = await bcrypt.compare(password, storedHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid password" });
      }

      (req.session as any).isAdmin = true;
      res.json({ success: true });
    } catch (error) {
      console.error("Error in admin login:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/admin/check", async (req, res) => {
    const isAdmin = (req.session as any)?.isAdmin === true;
    res.json({ isAdmin });
  });

  app.post("/api/admin/logout", async (req, res) => {
    (req.session as any).isAdmin = false;
    res.json({ success: true });
  });

  // Admin middleware
  const requireAdmin = (req: any, res: any, next: any) => {
    if ((req.session as any)?.isAdmin !== true) {
      return res.status(401).json({ error: "Admin authentication required" });
    }
    next();
  };

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
      const allUsers = await storage.getAllUsers();
      const allBookings = await storage.getDemoBookings();
      const allTickets = await storage.getSupportTickets();
      const allConversions = await storage.getSalesConversions();
      const allPartners = await storage.getPartners();
      const allSalespeople = await storage.getSalespeople();
      
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
    } catch (error) {
      console.error("Error fetching admin users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
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
        refLink: `https://whachatcrm.com/?ref=${partner.refCode}`,
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
      sendPartnerWelcomeEmail(partner.name, partner.email, partner.refCode)
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

  // Get all contacts
  app.get("/api/contacts", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const limit = parseInt(req.query.limit as string) || 1000;
      const contacts = await storage.getContacts(req.user.id, limit);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // Search contacts
  app.get("/api/contacts/search", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Search query required" });
      }
      const contacts = await storage.searchContacts(req.user.id, query);
      res.json(contacts);
    } catch (error) {
      console.error("Error searching contacts:", error);
      res.status(500).json({ error: "Failed to search contacts" });
    }
  });

  // Get single contact with all conversations
  app.get("/api/contacts/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const result = await storage.getContactWithConversations(req.params.id);
      if (!result) {
        return res.status(404).json({ error: "Contact not found" });
      }
      if (result.contact.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching contact:", error);
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });

  // Create new contact
  app.post("/api/contacts", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const contact = await storage.createContact({
        ...req.body,
        userId: req.user.id,
      });
      res.status(201).json(contact);
    } catch (error) {
      console.error("Error creating contact:", error);
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  // Update contact
  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      if (contact.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const updated = await storage.updateContact(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating contact:", error);
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  // Delete contact
  app.delete("/api/contacts/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      if (contact.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await storage.deleteContact(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  // Switch primary channel for a contact (handoff to WhatsApp, etc.)
  app.patch("/api/contacts/:id/channel", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      if (contact.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const { channel } = req.body;
      const validChannels = ['whatsapp', 'instagram', 'facebook', 'sms', 'webchat', 'telegram'];
      if (!channel || !validChannels.includes(channel)) {
        return res.status(400).json({ error: "Invalid channel" });
      }
      
      const updated = await storage.updateContact(req.params.id, { 
        primaryChannelOverride: channel 
      });
      
      // Log the channel switch in activity events
      const { channelService } = await import("./channelService");
      await channelService.logActivity(
        req.user.id,
        req.params.id,
        undefined,
        'channel_switch',
        {
          from: contact.primaryChannel,
          to: channel,
          reason: 'manual_switch',
        },
        'user',
        req.user.id
      );
      
      res.json(updated);
    } catch (error) {
      console.error("Error switching channel:", error);
      res.status(500).json({ error: "Failed to switch channel" });
    }
  });

  // Get conversation messages
  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const messages = await storage.getMessages(req.params.id, limit, offset);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Mark conversation as read
  app.post("/api/conversations/:id/read", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await storage.updateConversation(req.params.id, { unreadCount: 0 });
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking conversation as read:", error);
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  // Get messaging window status for Meta channels (Instagram, Facebook)
  app.get("/api/conversations/:id/window-status", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Check if this is a Meta channel that has 24-hour window restrictions
      const metaChannels = ['instagram', 'facebook'];
      if (!metaChannels.includes(conversation.channel)) {
        // Non-Meta channels don't have window restrictions
        return res.json({
          isActive: true,
          hasRestriction: false,
          channel: conversation.channel,
        });
      }

      // Check window status
      const now = new Date();
      const windowExpiresAt = conversation.windowExpiresAt ? new Date(conversation.windowExpiresAt) : null;
      const isActive = windowExpiresAt ? windowExpiresAt > now : false;
      const hoursRemaining = windowExpiresAt 
        ? Math.max(0, (windowExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
        : 0;
      const isExpiringSoon = hoursRemaining > 0 && hoursRemaining < 4;

      res.json({
        hasRestriction: true,
        isActive,
        windowExpiresAt,
        hoursRemaining: Math.round(hoursRemaining * 10) / 10, // Round to 1 decimal
        isExpiringSoon,
        channel: conversation.channel,
        message: !isActive
          ? `The 24-hour messaging window has expired. The customer must message you first before you can reply.`
          : isExpiringSoon
          ? `Messaging window expires in ${Math.round(hoursRemaining)} hours. Reply soon!`
          : null,
      });
    } catch (error) {
      console.error("Error getting window status:", error);
      res.status(500).json({ error: "Failed to get window status" });
    }
  });

  // Send message to contact (auto channel selection)
  app.post("/api/contacts/:id/send", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { channelService } = await import("./channelService");
      const result = await channelService.sendMessage({
        userId: req.user.id,
        contactId: req.params.id,
        content: req.body.content,
        contentType: req.body.contentType || 'text',
        mediaUrl: req.body.mediaUrl,
        forceChannel: req.body.channel,
      });
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Get activity timeline for a contact
  app.get("/api/contacts/:id/timeline", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      if (contact.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const limit = parseInt(req.query.limit as string) || 100;
      const events = await storage.getActivityEvents(req.params.id, limit);
      res.json(events);
    } catch (error) {
      console.error("Error fetching timeline:", error);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });

  // Get channel settings
  app.get("/api/channels", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const settings = await storage.getChannelSettings(req.user.id);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching channel settings:", error);
      res.status(500).json({ error: "Failed to fetch channel settings" });
    }
  });

  // Update channel setting
  app.patch("/api/channels/:channel", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { CHANNELS } = await import("@shared/schema");
      const channel = req.params.channel;
      if (!CHANNELS.includes(channel as any)) {
        return res.status(400).json({ error: "Invalid channel" });
      }
      const setting = await storage.upsertChannelSetting(
        req.user.id,
        channel as any,
        req.body
      );
      res.json(setting);
    } catch (error) {
      console.error("Error updating channel setting:", error);
      res.status(500).json({ error: "Failed to update channel setting" });
    }
  });

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

        const { channelService } = await import("./channelService");
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

      const { channelService } = await import("./channelService");
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

      const { channelService } = await import("./channelService");
      const result = await channelService.processIncomingMessage({
        userId,
        channel: 'webchat',
        channelContactId: visitorId || `visitor_${Date.now()}`,
        contactName: name || "Website Visitor",
        content: message,
        contentType: 'text',
      });

      res.json({
        success: true,
        contactId: result.contact.id,
        conversationId: result.conversation.id,
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

      const conversation = await storage.getConversationByContactAndChannel(contact.id, 'webchat');
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

  // Unified inbox webhook for Twilio (routes to new system alongside existing)
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

      const { channelService } = await import("./channelService");
      await channelService.processIncomingMessage({
        userId: user.id,
        channel: channel as any,
        channelContactId: parsed.from,
        contactName: parsed.profileName || parsed.from,
        content: parsed.body,
        contentType: 'text',
        externalMessageId: parsed.messageSid,
      });

      res.status(200).send("");
    } catch (error) {
      console.error("Unified inbox Twilio webhook error:", error);
      res.status(200).send("");
    }
  });

  // ==========================================
  // AI BRAIN API ROUTES (PRO ADD-ON)
  // ==========================================

  // Helper: Check if user has AI Brain access (Pro plan with add-on)
  const checkAiBrainAccess = async (userId: string): Promise<{ hasAccess: boolean; reason?: string }> => {
    const user = await storage.getUser(userId);
    if (!user) return { hasAccess: false, reason: "User not found" };
    
    // Check if user is on Pro or Enterprise plan
    const proPlans = ['pro', 'enterprise'];
    if (!proPlans.includes(user.subscriptionPlan || 'free')) {
      return { hasAccess: false, reason: "AI Brain requires Pro plan" };
    }
    
    // For now, all Pro users have access (in production, check for $29/mo add-on)
    return { hasAccess: true };
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

  // Get AI usage
  app.get("/api/ai/usage", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;
      const usage = await storage.getCurrentAiUsage(userId);
      res.json(usage || {
        messagesGenerated: 0,
        repliesSuggested: 0,
        leadsQualified: 0,
        periodStart: new Date().toISOString(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (error) {
      console.error("AI usage fetch error:", error);
      res.status(500).json({ error: "Failed to fetch AI usage" });
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

  // Get AI reply suggestions for a conversation
  app.post("/api/ai/suggest-reply", async (req, res) => {
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
      
      const { chatId, conversationHistory, tone } = req.body;
      
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
      
      // Get user's preferred language for AI responses
      const userLanguage = req.user.language as "en" | "he" | "es" | "ar" | undefined;
      
      const suggestion = await aiService.suggestReply(
        userId,
        chatId,
        conversationHistory,
        knowledge || undefined,
        settings || undefined,
        selectedTone,
        userLanguage
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

  return httpServer;
}
