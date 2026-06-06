import type { Express } from "express";
import type { Channel } from "@shared/schema";
import { CHANNEL_INFO } from "@shared/schema";
import { parsePresetDelayToMs } from "@shared/campaignDelays";
import {
  contactHasChannelIdentifier,
  evaluatePresetCampaignEnrollability,
} from "@shared/campaignEnrollment";
import { storage } from "../storage";
import { getWhatsAppAvailability } from "../whatsappService";
import { contactBlocksCampaignSends, processCampaignEnrollmentStep } from "../campaignExecution";

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
          code: "already_enrolled",
          enrollment: dup,
        });
      }

      const gate = contactBlocksCampaignSends(contact);
      let conversationChannel: string | undefined;
      if (conversationId) {
        const conv = await storage.getConversation(conversationId);
        if (conv?.channel) conversationChannel = conv.channel;
      }

      const channelInfra = (campaign.channel || "whatsapp") as Channel;
      const infra = await assessChannelInfrastructure(req.user.id, channelInfra);

      const eligibility = evaluatePresetCampaignEnrollability({
        contact,
        campaign,
        conversationChannel,
        channelConnected: infra.ok,
        alreadyEnrolled: false,
        contactOptOut: gate.blocked,
        optOutReason: gate.reason,
      });

      if (!eligibility.eligible) {
        return res.status(400).json({
          error: eligibility.userMessage || "Cannot enroll this contact.",
          code: eligibility.code,
          needsSetup:
            eligibility.code === "missing_contact_channel_id" ||
            eligibility.code === "channel_not_connected" ||
            eligibility.code === "channel_mismatch",
        });
      }

      if (!contactHasChannelIdentifier(contact, channelInfra)) {
        const label = CHANNEL_INFO[channelInfra]?.label || channelInfra;
        return res.status(400).json({
          error: `Contact has no ${label} identifier. Add the required channel info before enrolling.`,
          code: "missing_contact_channel_id",
          needsSetup: true,
        });
      }

      if (!infra.ok) {
        return res.status(400).json({
          error: infra.reason,
          code: "channel_not_connected",
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

      await storage.createActivityEvent({
        userId: req.user.id,
        contactId,
        conversationId: conversationId ?? null,
        eventType: "note",
        actorType: "user",
        actorId: req.user.id,
        eventData: {
          kind: "campaign_enrolled",
          title: `Enrolled in ${campaign.name || "campaign"}`,
          content: `${campaign.name || "Campaign"} · ${CHANNEL_INFO[channelInfra]?.label || channelInfra}`,
          campaignId,
          enrollmentId: enrollment.id,
          channel: channelInfra,
        },
      });

      if (firstDelayMs === 0) {
        try {
          await processCampaignEnrollmentStep(enrollment.id);
        } catch (stepErr) {
          console.warn("[CAMPAIGN_ENROLL] immediate step failed", {
            enrollmentId: enrollment.id,
            error: stepErr instanceof Error ? stepErr.message : stepErr,
          });
        }
      }

      const fresh = await storage.getCampaignEnrollmentById(enrollment.id);
      res.status(201).json({ enrollment: fresh ?? enrollment });
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
          const messages = Array.isArray(c?.messages) ? c.messages : [];
          const totalSteps = messages.length;
          const failedStep =
            e.status === "failed"
              ? await storage.getLatestCampaignStepEventForEnrollment(e.id, "failed")
              : undefined;
          return {
            ...e,
            campaignName: c?.name ?? "(deleted campaign)",
            campaignChannel: c?.channel ?? null,
            campaignStatus: c?.status ?? null,
            totalSteps,
            failureReason: failedStep?.errorMessage ?? null,
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

  /** Re-queue the failed step at `currentStepIndex` using current campaign content. */
  app.post("/api/campaign-enrollments/:id/retry", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const row = await storage.getCampaignEnrollmentById(req.params.id);
      if (!row || row.userId !== req.user.id) return res.status(404).json({ error: "Enrollment not found" });
      if (row.status !== "failed") {
        return res.status(400).json({ error: "Only failed enrollments can be retried" });
      }
      const campaign = await storage.getPresetCampaignForUser(row.campaignId, req.user.id);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (campaign.status === "paused" || campaign.status === "completed") {
        return res.status(400).json({
          error: "Campaign is paused or completed — resume or reopen the campaign before retrying.",
        });
      }
      const messages = Array.isArray(campaign.messages) ? campaign.messages : [];
      if (row.currentStepIndex >= messages.length) {
        return res.status(400).json({ error: "Enrollment step is out of range for this campaign." });
      }
      const updated = await storage.updateCampaignEnrollment(row.id, {
        status: "active",
        nextRunAt: new Date(),
      });
      res.json({ enrollment: updated });
    } catch (err) {
      console.error("POST retry enrollment:", err);
      res.status(500).json({ error: "Failed to retry enrollment" });
    }
  });
}
