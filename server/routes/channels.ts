import type { Express } from "express";
import { storage } from "../storage";

export function registerChannelRoutes(app: Express): void {
  // Get all channel settings
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

  // Check WhatsApp availability — must be BEFORE /:channel
  app.get("/api/channels/whatsapp/availability", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const activeProvider = user.whatsappProvider || "twilio";

      if (activeProvider === "meta") {
        const isConnected = user.metaConnected || false;
        return res.json({
          available: isConnected,
          provider: "meta",
          reason: isConnected ? undefined : "Meta WhatsApp Business API not connected",
          message: isConnected ? undefined : "Connect Meta WhatsApp in Settings to send messages",
        });
      }

      const isConnected = user.twilioConnected || false;
      return res.json({
        available: isConnected,
        provider: "twilio",
        reason: isConnected ? undefined : "Twilio WhatsApp connection not found",
        message: isConnected ? undefined : "Connect Twilio in Settings to send messages",
      });
    } catch (error) {
      console.error("Error checking WhatsApp availability:", error);
      res.status(500).json({
        available: false,
        reason: "Failed to check availability",
        message: "Please try again or contact support",
      });
    }
  });

  // Update a channel setting
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
}
