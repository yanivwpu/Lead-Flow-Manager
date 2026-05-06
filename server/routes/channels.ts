import type { Express } from "express";
import { storage } from "../storage";
import {
  getWhatsAppAvailability,
  syncWhatsAppChannelRowFromCanonicalMeta,
  isCanonicalWhatsAppFullyConnected,
  logWhatsAppChannelState,
  type WhatsAppProvider,
} from "../whatsappService";
import { db } from "../../drizzle/db";
import { messages as messagesTable } from "@shared/schema";
import { and, eq } from "drizzle-orm";

export function registerChannelRoutes(app: Express): void {
  /** Activation onboarding: channel connection + first outbound message (for checklist UI). */
  app.get("/api/activation-status", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUserForSession(req.user.id);
      const legacyRowBefore = await storage.getChannelSetting(req.user.id, "whatsapp");
      const legacyChannelConnected = !!legacyRowBefore?.isConnected;
      await syncWhatsAppChannelRowFromCanonicalMeta(req.user.id);
      const settings = await storage.getChannelSettings(req.user.id);
      const legacyAfterSync = settings.some((s) => s.channel === "whatsapp" && !!s.isConnected);
      const canonicalWa = user ? isCanonicalWhatsAppFullyConnected(user) : false;
      const whatsappConnected = canonicalWa || legacyAfterSync;
      if (user) {
        const activeProvider = (user.whatsappProvider as WhatsAppProvider) || "twilio";
        logWhatsAppChannelState({
          userId: req.user.id,
          activeProvider,
          metaConnected: !!user.metaConnected,
          webhookSubscribed: !!user.metaWebhookSubscribed,
          legacyChannelConnected,
          finalConnected: whatsappConnected,
        });
      }
      const instagramConnected = settings.some((s) => s.channel === "instagram" && !!s.isConnected);
      const facebookConnected = settings.some((s) => s.channel === "facebook" && !!s.isConnected);
      const metaConnected = instagramConnected || facebookConnected;
      const hasAnyMessagingChannel = whatsappConnected || metaConnected;

      const [outbound] = await db
        .select({ id: messagesTable.id })
        .from(messagesTable)
        .where(
          and(eq(messagesTable.userId, req.user.id), eq(messagesTable.direction, "outbound")),
        )
        .limit(1);

      const hasSentFirstMessage = !!outbound;

      res.json({
        whatsappConnected,
        instagramConnected,
        facebookConnected,
        metaConnected,
        hasAnyMessagingChannel,
        hasSentFirstMessage,
        checklistComplete:
          whatsappConnected && metaConnected && hasSentFirstMessage,
      });
    } catch (error) {
      console.error("Error fetching activation status:", error);
      res.status(500).json({ error: "Failed to fetch activation status" });
    }
  });

  // Get all channel settings
  app.get("/api/channels", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUserForSession(req.user.id);
      const legacyRowBefore = await storage.getChannelSetting(req.user.id, "whatsapp");
      const legacyChannelConnected = !!legacyRowBefore?.isConnected;
      await syncWhatsAppChannelRowFromCanonicalMeta(req.user.id);
      const settings = await storage.getChannelSettings(req.user.id);
      const legacyAfterSync = settings.some((s) => s.channel === "whatsapp" && !!s.isConnected);
      const canonicalWa = user ? isCanonicalWhatsAppFullyConnected(user) : false;
      const finalConnected = canonicalWa || legacyAfterSync;
      if (user) {
        const activeProvider = (user.whatsappProvider as WhatsAppProvider) || "twilio";
        logWhatsAppChannelState({
          userId: req.user.id,
          activeProvider,
          metaConnected: !!user.metaConnected,
          webhookSubscribed: !!user.metaWebhookSubscribed,
          legacyChannelConnected,
          finalConnected,
        });
      }
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
