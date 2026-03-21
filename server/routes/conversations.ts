import type { Express } from "express";
import { storage } from "../storage";

export function registerConversationRoutes(app: Express): void {
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

  // Update conversation (status, etc.)
  app.patch("/api/conversations/:id", async (req, res) => {
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
      const allowed = ['status'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      const updated = await storage.updateConversation(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating conversation:", error);
      res.status(500).json({ error: "Failed to update conversation" });
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

      // WhatsApp also enforces a 24-hour messaging window, same as Instagram/Facebook.
      // Channels without any window restriction (SMS, Telegram, webchat, etc.) can
      // always send; we return isActive:true with no restriction for those.
      const windowChannels = ['whatsapp', 'instagram', 'facebook'];
      if (!windowChannels.includes(conversation.channel)) {
        return res.json({
          isActive: true,
          hasRestriction: false,
          channel: conversation.channel,
        });
      }

      const now = new Date();
      const windowExpiresAt = conversation.windowExpiresAt
        ? new Date(conversation.windowExpiresAt)
        : null;
      const isActive = windowExpiresAt ? windowExpiresAt > now : false;
      const hoursRemaining = windowExpiresAt
        ? Math.max(0, (windowExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
        : 0;
      const isExpiringSoon = hoursRemaining > 0 && hoursRemaining < 4;

      res.json({
        hasRestriction: true,
        isActive,
        windowExpiresAt,
        hoursRemaining: Math.round(hoursRemaining * 10) / 10,
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
}
