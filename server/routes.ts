import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertChatSchema, insertRegisteredPhoneSchema, PLAN_LIMITS, type SubscriptionPlan } from "@shared/schema";
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
import multer from "multer";
import path from "path";
import fs from "fs";
import { subscriptionService } from "./subscriptionService";
import { sendWelcomeEmail, sendContactFormEmail } from "./email";
import { triggerNewChatWorkflows, triggerKeywordWorkflows } from "./workflowEngine";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Temporary debug endpoint for checkout issues
  app.get("/api/debug/checkout-test/:email/:plan", async (req, res) => {
    try {
      const { email, plan } = req.params;
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ error: 'User not found', email });
      }
      const baseUrl = `https://${req.get('host')}`;
      const result = await subscriptionService.createCheckoutSession(user.id, plan as any, baseUrl);
      res.json({ success: true, checkoutUrl: result.url });
    } catch (error: any) {
      res.json({ 
        success: false, 
        error: error.message,
        type: error.type,
        code: error.code
      });
    }
  });

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
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { avatarUrl } = req.body;
      
      if (!avatarUrl) {
        return res.status(400).json({ error: "Avatar URL is required" });
      }

      // Validate that it's a data URL or a valid URL
      if (!avatarUrl.startsWith('data:image/') && !avatarUrl.startsWith('http')) {
        return res.status(400).json({ error: "Invalid avatar format" });
      }

      // Limit size (max ~500KB for base64)
      if (avatarUrl.length > 700000) {
        return res.status(400).json({ error: "Image too large. Please use an image under 500KB" });
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
        sender: "me",
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

  // ============ TEAM MEMBER ROUTES ============

  // Get team members
  app.get("/api/team", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const members = await storage.getTeamMembers(req.user.id);
      const user = await storage.getUser(req.user.id);
      
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
      
      res.json([ownerMember, ...members]);
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
      if (currentCount >= limits.maxUsers) {
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
