import type { Express } from "express";
import { storage } from "../storage";
import { getWhatsAppAvailability } from "../whatsappService";

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
      const result = await getWhatsAppAvailability(req.user.id);
      res.json(result);
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
