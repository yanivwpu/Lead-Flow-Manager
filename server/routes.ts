import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertChatSchema } from "@shared/schema";
import { z } from "zod";
import { getVapidPublicKey } from "./notifications";
import {
  sendWhatsAppMessage,
  verifyTwilioConnection,
  parseIncomingWebhook,
  parseStatusWebhook,
  findOrCreateChatByPhone,
  getTwilioAccountSid,
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

      const isConnected = await verifyTwilioConnection();
      if (!isConnected) {
        return res.status(400).json({ error: "WhatsApp messaging not available" });
      }

      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      const result = await sendWhatsAppMessage(chat.whatsappPhone, message);

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

      // In multi-tenant SaaS, we match incoming messages by phone number
      // For now, find the first user who has a chat with this phone number
      // TODO: Implement proper phone number registration per user
      const { db } = await import("../drizzle/db");
      const { chats, users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      // Find existing chat with this phone number
      const existingChats = await db.select().from(chats).where(eq(chats.whatsappPhone, parsed.from));
      
      let chat;
      if (existingChats.length > 0) {
        chat = existingChats[0];
      } else {
        // If no existing chat, get the first user to create a demo chat
        // In production, this would need proper phone number routing
        const allUsers = await db.select().from(users).limit(1);
        if (allUsers.length === 0) {
          console.log("No users in system for incoming message");
          return res.status(200).send("");
        }
        chat = await findOrCreateChatByPhone(allUsers[0].id, parsed.from, parsed.profileName);
      }

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
