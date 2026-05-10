import type { Express } from "express";
import type { Channel } from "@shared/schema";
import { CHANNEL_INFO } from "@shared/schema";
import { parsePresetDelayToMs } from "@shared/campaignDelays";
import { storage } from "../storage";
import { getWhatsAppAvailability } from "../whatsappService";
import { contactBlocksCampaignSends } from "../campaignExecution";

function contactHasChannelIdentifier(contact: {
  phone?: string | null;
  whatsappId?: string | null;
  instagramId?: string | null;
  facebookId?: string | null;
  telegramId?: string | null;
  primaryChannel?: string | null;
  lastIncomingChannel?: string | null;
  source?: string | null;
}, channel: Channel): boolean {
  if (channel === "whatsapp") return !!(contact.phone || contact.whatsappId);
  if (channel === "instagram") return !!contact.instagramId;
  if (channel === "facebook") return !!contact.facebookId;
  if (channel === "sms") return !!contact.phone;
  if (channel === "telegram") return !!contact.telegramId;
  if (channel === "webchat") {
    return (
      contact.lastIncomingChannel === "webchat" ||
      contact.primaryChannel === "webchat" ||
      contact.source === "webchat"
    );
  }
  return false;
}

async function assessChannelInfrastructure(userId: string, channel: Channel): Promise<{ ok: boolean; reason?: string }> {
  if (channel === "whatsapp") {
    const wa = await getWhatsAppAvailability(userId);
    if (!wa.available) {
      return {
        ok: false,
        reason: wa.reason || "WhatsApp is not connected for this workspace.",
      };
    }
    return { ok: true };
  }

  const setting = await storage.getChannelSetting(userId, channel);
  const cfg = setting?.config as Record<string, unknown> | undefined;
  const connected = !!(setting?.isConnected && cfg && typeof cfg === "object");
  if (!connected) {
    const label = CHANNEL_INFO[channel]?.label || channel;
    return {
      ok: false,
      reason: `${label} is not connected. Connect it under Integrations before enrolling contacts.`,
    };
  }
  return { ok: true };
}

export function registerCampaignEnrollmentRoutes(app: Express): void {
  app.post("/api/campaign-enrollments", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const campaignId = typeof req.body?.campaignId === "string" ? req.body.campaignId : "";
      const contactId = typeof req.body?.contactId === "string" ? req.body.contactId : "";
      const conversationId =
        typeof req.body?.conversationId === "string" && req.body.conversationId.trim()
          ? req.body.conversationId.trim()
          : undefined;

      if (!campaignId || !contactId) {
        return res.status(400).json({ error: "campaignId and contactId are required" });
      }

      const campaign = await storage.getPresetCampaignForUser(campaignId, req.user.id);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const contact = await storage.getContact(contactId);
      if (!contact || contact.userId !== req.user.id) {
        return res.status(404).json({ error: "Contact not found" });
      }

      const dup = await storage.getActiveEnrollmentForContactCampaign(req.user.id, contactId, campaignId);
      if (dup) {
        return res.status(409).json({
          error: "This contact already has an active enrollment for this campaign.",
          enrollment: dup,
        });
      }

      const gate = contactBlocksCampaignSends(contact);
      if (gate.blocked) {
        return res.status(400).json({ error: gate.reason || "Cannot enroll this contact." });
      }

      const channel = (campaign.channel || "whatsapp") as Channel;
      if (!contactHasChannelIdentifier(contact, channel)) {
        const label = CHANNEL_INFO[channel]?.label || channel;
        return res.status(400).json({
          error: `Contact has no ${label} identifier. Add the required channel info before enrolling.`,
          needsSetup: true,
        });
      }

      const infra = await assessChannelInfrastructure(req.user.id, channel);
      if (!infra.ok) {
        return res.status(400).json({
          error: infra.reason,
          needsSetup: true,
        });
      }

      const messages = Array.isArray(campaign.messages) ? campaign.messages : [];
      if (messages.length === 0) {
        return res.status(400).json({ error: "This campaign has no steps to send." });
      }

      const firstDelayMs = parsePresetDelayToMs(
        typeof (messages[0] as { delay?: string })?.delay === "string"
          ? (messages[0] as { delay?: string }).delay
          : "0"
      );
      const nextRunAt = new Date(Date.now() + firstDelayMs);

      const enrollment = await storage.createCampaignEnrollment({
        userId: req.user.id,
        campaignId,
        contactId,
        conversationId: conversationId ?? null,
        status: "active",
        currentStepIndex: 0,
        nextRunAt,
      });

      res.status(201).json({ enrollment });
    } catch (err) {
      console.error("POST /api/campaign-enrollments:", err);
      res.status(500).json({ error: "Failed to create enrollment" });
    }
  });

  app.get("/api/campaign-enrollments", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const contactId = typeof req.query.contactId === "string" ? req.query.contactId : "";
      if (!contactId) {
        return res.status(400).json({ error: "contactId query parameter is required" });
      }

      const rows = await storage.getCampaignEnrollmentsForContact(req.user.id, contactId);
      const enriched = await Promise.all(
        rows.map(async (e) => {
          const c = await storage.getPresetCampaignForUser(e.campaignId, req.user.id);
          return {
            ...e,
            campaignName: c?.name ?? "(deleted campaign)",
            campaignChannel: c?.channel ?? null,
            campaignStatus: c?.status ?? null,
          };
        })
      );

      res.json({ enrollments: enriched });
    } catch (err) {
      console.error("GET /api/campaign-enrollments:", err);
      res.status(500).json({ error: "Failed to list enrollments" });
    }
  });

  app.post("/api/campaign-enrollments/:id/pause", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const row = await storage.getCampaignEnrollmentById(req.params.id);
      if (!row || row.userId !== req.user.id) return res.status(404).json({ error: "Enrollment not found" });
      if (row.status !== "active") {
        return res.status(400).json({ error: "Only active enrollments can be paused" });
      }
      const updated = await storage.updateCampaignEnrollment(row.id, { status: "paused" });
      res.json({ enrollment: updated });
    } catch (err) {
      console.error("POST pause enrollment:", err);
      res.status(500).json({ error: "Failed to pause enrollment" });
    }
  });

  app.post("/api/campaign-enrollments/:id/resume", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const row = await storage.getCampaignEnrollmentById(req.params.id);
      if (!row || row.userId !== req.user.id) return res.status(404).json({ error: "Enrollment not found" });
      if (row.status !== "paused") {
        return res.status(400).json({ error: "Only paused enrollments can be resumed" });
      }
      const updated = await storage.updateCampaignEnrollment(row.id, {
        status: "active",
        nextRunAt: new Date(),
      });
      res.json({ enrollment: updated });
    } catch (err) {
      console.error("POST resume enrollment:", err);
      res.status(500).json({ error: "Failed to resume enrollment" });
    }
  });

  app.post("/api/campaign-enrollments/:id/cancel", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const row = await storage.getCampaignEnrollmentById(req.params.id);
      if (!row || row.userId !== req.user.id) return res.status(404).json({ error: "Enrollment not found" });
      if (row.status === "completed" || row.status === "cancelled") {
        return res.status(400).json({ error: "Enrollment is already finished" });
      }
      const updated = await storage.updateCampaignEnrollment(row.id, {
        status: "cancelled",
        nextRunAt: null,
      });
      res.json({ enrollment: updated });
    } catch (err) {
      console.error("POST cancel enrollment:", err);
      res.status(500).json({ error: "Failed to cancel enrollment" });
    }
  });
}
