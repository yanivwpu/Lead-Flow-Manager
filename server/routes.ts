import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertChatSchema } from "@shared/schema";
import { z } from "zod";
import { getVapidPublicKey } from "./notifications";
import {
  sendWhatsAppMessage,
  verifyTwilioCredentials,
  parseIncomingWebhook,
  parseStatusWebhook,
  findUserByTwilioAccount,
  findOrCreateChatByPhone,
  type WhatsAppMessage,
} from "./twilio";

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
        hasCredentials: !!(user.twilioAccountSid && user.twilioAuthToken),
        whatsappNumber: user.twilioWhatsappNumber || null,
      });
    } catch (error) {
      console.error("Error fetching Twilio status:", error);
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  // Save Twilio credentials
  app.post("/api/twilio/connect", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { accountSid, authToken, whatsappNumber } = req.body;

      if (!accountSid || !authToken || !whatsappNumber) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const isValid = await verifyTwilioCredentials(accountSid, authToken);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid Twilio credentials" });
      }

      await storage.updateUser(req.user.id, {
        twilioAccountSid: accountSid,
        twilioAuthToken: authToken,
        twilioWhatsappNumber: whatsappNumber,
        twilioConnected: true,
      });

      res.json({ success: true, message: "Twilio connected successfully" });
    } catch (error) {
      console.error("Error connecting Twilio:", error);
      res.status(500).json({ error: "Failed to connect Twilio" });
    }
  });

  // Disconnect Twilio
  app.post("/api/twilio/disconnect", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await storage.updateUser(req.user.id, {
        twilioAccountSid: null,
        twilioAuthToken: null,
        twilioWhatsappNumber: null,
        twilioConnected: false,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Twilio:", error);
      res.status(500).json({ error: "Failed to disconnect" });
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

      const user = await storage.getUser(req.user.id);
      if (!user || !user.twilioConnected) {
        return res.status(400).json({ error: "Twilio not connected" });
      }

      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      const result = await sendWhatsAppMessage(user, chat.whatsappPhone, message);

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

  // Twilio webhook for incoming WhatsApp messages
  app.post("/api/webhook/twilio/incoming", async (req, res) => {
    try {
      const parsed = parseIncomingWebhook(req.body);
      console.log("Incoming WhatsApp message:", parsed);

      const user = await findUserByTwilioAccount(parsed.accountSid);
      if (!user) {
        console.log("No user found for account:", parsed.accountSid);
        return res.status(200).send("");
      }

      const chat = await findOrCreateChatByPhone(user.id, parsed.from, parsed.profileName);

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

  return httpServer;
}
