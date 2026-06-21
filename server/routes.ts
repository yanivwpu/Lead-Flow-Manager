import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { db } from "../drizzle/db";
import {
  messages as messagesTable,
  contacts as contactsTable,
  users,
  channelSettings,
  conversations,
} from "@shared/schema";
import { eq, and, or, isNotNull, ilike, desc, sql } from "drizzle-orm";
import { registerContactRoutes } from "./routes/contacts";
import { registerSchedulingRoutes } from "./routes/scheduling";
import { registerConversationRoutes } from "./routes/conversations";
import { registerChannelRoutes } from "./routes/channels";
import { registerTemplateRoutes as registerAutomationTemplateRoutes } from "./routes/templates";
import { registerCampaignEnrollmentRoutes } from "./routes/campaignEnrollments";
import { registerWebhookRoutes } from "./routes/webhooks";
import { registerInventoryRoutes } from "./routes/inventory";
import { registerPublicListingRoutes } from "./routes/publicListings";
import { registerPublicAgentPageRoutes } from "./routes/publicAgentPage";
import { registerAgentPageSettingsRoutes } from "./routes/agentPageSettings";
import { registerPublicListingSitemapRoutes } from "./routes/publicListingsSitemap";
import { registerBusinessProfileRoutes } from "./routes/businessProfile";
import {
  getWhatsAppAvailability,
  sendWhatsAppMessage,
  sendWhatsAppMedia,
  disconnectWhatsAppProvider,
  getProviderStatus,
  syncWhatsAppChannelRowFromCanonicalMeta,
  isCanonicalWhatsAppFullyConnected,
  logWhatsAppChannelState,
  type WhatsAppProvider,
} from "./whatsappService";
import { storage } from "./storage";
import { evaluateAutomationSendGuard } from "./automationSendGuard";
import { devLog } from "./devLog";
import {
  insertChatSchema,
  insertRegisteredPhoneSchema,
  insertSalespersonSchema,
  insertDemoBookingSchema,
  PLAN_LIMITS,
  type Message,
  type SubscriptionPlan,
  type Conversation,
  type Contact,
} from "@shared/schema";
import { deriveAdminUserChannelConnections } from "@shared/adminChannelConnectionStatus";
import { isConversationHandoffActive } from "@shared/handoffActivity";
import {
  parseConversationReEngagement,
  buildReEngagementAfterMetaDeliveryFailure,
  retargetTemplateNameFromOutboundMessage,
  type ConversationReEngagement,
} from "@shared/reEngagement";
import {
  formatMetaTemplateDeliveryFailureLine,
  reEngagementTemplateDeliveryFailureHint,
} from "./waMetaDeliveryHints";
import {
  WA_OUTBOUND_UPLOAD_MULTER_MAX_BYTES,
  waUploadFileSizeCheck,
  waUploadTooLargeMessage,
} from "@shared/whatsappMediaLimits";
import { z } from "zod";
import { getVapidPublicKey } from "./notifications";
import {
  parseIncomingWebhook,
  parseStatusWebhook,
  findOrCreateChatByPhone,
  findUserByTwilioCredentials,
  connectUserTwilio,
  validateTwilioCredentials,
  encryptCredential,
  decryptCredential,
  isEncrypted,
  isLegacyCalendlyWorkflowChat,
  LEGACY_CHAT_CALENDLY_PREFIX,
  type WhatsAppMessage,
  type TwilioCredentials,
} from "./userTwilio";
import { getAccessTokenExpiryFromDebug } from "./whatsappEmbeddedSignup";
import { fetchMetaGraphJsonWithRetries } from "./metaChannelHealthUtils";
import {
  connectUserMeta,
  validateMetaCredentials,
  switchProvider,
  parseMetaIncomingWebhook,
  parseMetaStatusWebhook,
  findUserByMetaPhoneNumberId,
  getMetaMessageTemplates,
  markMessageAsRead,
  computeMetaWebhookSignature,
  verifyMetaWebhookSignature,
  decryptCredential as decryptMetaCredential,
  isEncrypted as isMetaEncrypted,
  getMediaUrl,
  downloadMedia,
  type MetaCredentials,
} from "./userMeta";
import multer from "multer";
import path from "path";
import fs from "fs";
import { subscriptionService, getEffectivePlanForUser } from "./subscriptionService";
import { computeTrialStatus, isProAiTrialActive, hasActivePaidPlan } from "./trialEntitlements";
import {
  businessKnowledgeFromAiRecord,
  detectStrongAutoIntent,
  evaluateFullAutoSend,
  isSubstantiveTextForAiAutoSend,
  normalizeBusinessAiMode,
  shouldBypassAutoGuardsForInbound,
  toConversationMessages,
  type ChatTurn,
} from "./aiAutoSendGate";
import { getStageSignals } from "../client/src/lib/leadScoring";
import {
  resolveAiRouting,
  routingAllowsSchedulingLink,
  routingShouldTriggerHandoff,
  stripSchedulingUrlsFromReply,
} from "@shared/aiRouting";
import { detectHighConfidenceBookingIntent } from "@shared/bookingIntent";
import {
  scrapeGuidedWebsiteKnowledgePages,
  combineScrapedText,
  WebsiteKnowledgeScrapeError,
} from "./websiteKnowledgeScraper";
import { putWebsiteKnowledgeDraft, takeWebsiteKnowledgeDraft } from "./websiteKnowledgeDraftCache";
import { finalizeWebsiteKnowledgeSummaryText } from "./websiteKnowledgeSummaryNormalize";
import { getUncachableStripeClient } from "./stripeClient";
import { sanitizeStripeReturnPath } from "./checkoutReturnPath";
import { resolveStripeCheckoutRedirectOrigin } from "./stripeCheckoutRedirectBase";
import { getAppOrigin } from "./urlOrigins";
import { isShopifyShopDomain } from "@shared/shopifyBilling";
import { rejectStripeIfShopifyUser } from "./shopifyBillingGuard";
import { getMarketingOrigin } from "./urlOrigins";
import { sendWelcomeEmail, sendContactFormEmail, sendDemoBookingNotification, sendDemoConfirmationEmail, sendSalespersonWelcomeEmail } from "./email";
import bcrypt from "bcryptjs";
import { dispatchInboundMessagingAutomation } from "./automationEventDispatcher";
import { evaluateChatbotInboundArbitration } from "./chatbotEngine";
import { runW2QualificationEngine, runServiceRoutingEngine } from "./workflowEngine";
import { evaluateGrowthEngineAccess, isGrowthEngineWorkflow } from "./growthEngineEntitlements";
import {
  GE_SETUP_STATUS,
  RGE_TEMPLATE_ID,
  isCalendarMissingForSetupTask,
} from "./growthEngineSetupService";
import { DEFAULT_SALES_TASK_PAYOUT_DOLLARS, getEffectiveTaskPayoutDollars } from "./salespersonTaskPayout";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import shopifyRoutes from "./shopifyRoutes";
import ghlRoutes from "./ghlRoutes";
import {
  normalizeWooCommerceStoreUrl,
  verifyWooCommerceRestCredentials,
  fetchWooCommerceSampleOrders,
} from "./woocommerceIntegration";
import { createWooCommerceWebhookHandler } from "./woocommerceWebhook";
import {
  calendlyCreateWebhookSubscription,
  calendlyDeleteWebhookSubscription,
  calendlyGetCurrentUser,
  calendlyGetWebhookSubscription,
  calendlyGetOrganization,
  calendlyListEventTypes,
  calendlyListWebhookSubscriptions,
} from "./calendlyApi";
import {
  isUserCalendlyBookingConnected,
  applyCalendlyBookingLinkForAi,
  calendlySyncModeConfigPatch,
  resolveCalendlySyncModeFromConfig,
} from "./calendlyBookingConnected";
import { pollCalendlyBookingsForUser } from "./calendlySyncService";
import { hubspotValidatePrivateAppToken } from "./hubspotApi";
import { pushLeadsToHubSpot } from "./hubspotSync";
import { SALESPERSON_AGREEMENT_VERSION } from "@shared/salespersonAgreement";

import { registerTemplateRoutes } from "./templateRoutes";
import { registerMediaRoutes } from "./routes/media";
import { registerWhatsappIntegrationRoutes } from "./routes/whatsappIntegrationRoutes";

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
  partner_referral: "2026-02-14",
  salesperson_commission: SALESPERSON_AGREEMENT_VERSION,
} as const;

/** Safe webhook payload summary for Railway logs — no secrets. */
function summarizeMetaWebhookInbound(body: unknown): {
  object: string | null;
  entryIds: string[];
  changesFields: string[];
  phoneNumberIdFromPayload: string | null;
  messagingEventKinds: string[];
  messagingRecipientIds: string[];
} {
  const b = body as Record<string, unknown> | null | undefined;
  const object =
    typeof b?.object === "string"
      ? b.object
      : b?.object != null && (typeof b.object === "number" || typeof b.object === "bigint")
        ? String(b.object)
        : null;
  const entries = Array.isArray(b?.entry) ? (b!.entry as unknown[]) : [];
  const entryIds = entries
    .map((e) => {
      const ent = e as Record<string, unknown> | undefined;
      return ent?.id != null ? String(ent.id) : "";
    })
    .filter((s) => s.length > 0);
  const changesFields: string[] = [];
  let phoneNumberIdFromPayload: string | null = null;
  const messagingEventKinds: string[] = [];
  const messagingRecipientIds: string[] = [];
  for (const e of entries) {
    const ent = e as Record<string, unknown>;
    const changes = Array.isArray(ent?.changes) ? (ent.changes as unknown[]) : [];
    for (const ch of changes) {
      const c = ch as Record<string, unknown>;
      if (c?.field) changesFields.push(String(c.field));
      const value = c?.value as Record<string, unknown> | undefined;
      const meta = value?.metadata as Record<string, unknown> | undefined;
      const fromMeta = meta?.phone_number_id;
      const fromMsgs =
        Array.isArray(value?.messages) && (value!.messages as unknown[]).length > 0
          ? (((value!.messages as unknown[])[0] as Record<string, unknown>)?.metadata as Record<string, unknown>)
              ?.phone_number_id
          : undefined;
      const pid = fromMeta ?? fromMsgs ?? null;
      if (pid != null && !phoneNumberIdFromPayload) phoneNumberIdFromPayload = String(pid);
    }

    // Facebook/Instagram "messaging" webhook payloads
    const messaging = Array.isArray(ent?.messaging) ? (ent.messaging as unknown[]) : [];
    for (const m of messaging) {
      const msg = m as Record<string, unknown>;
      const kind =
        msg?.message
          ? "message"
          : msg?.postback
            ? "postback"
            : msg?.delivery
              ? "delivery"
              : msg?.read
                ? "read"
                : msg?.reaction
                  ? "reaction"
                  : "unknown";
      messagingEventKinds.push(kind);
      const recipient = msg?.recipient as Record<string, unknown> | undefined;
      if (recipient?.id != null) messagingRecipientIds.push(String(recipient.id));
    }
  }
  return {
    object,
    entryIds,
    changesFields: [...new Set(changesFields)],
    phoneNumberIdFromPayload,
    messagingEventKinds: [...new Set(messagingEventKinds)],
    messagingRecipientIds: [...new Set(messagingRecipientIds)],
  };
}

type InstagramSenderProfile = {
  displayName: string;
  username: string | null;
  name: string | null;
  profilePic: string | null;
  fieldsReturned: string[];
};

function isRawNumericId(value: string | null | undefined): boolean {
  return !!value && /^\d{8,}$/.test(value.trim());
}

function normalizeInstagramDisplayName(profile: {
  username?: unknown;
  name?: unknown;
}): { displayName: string; username: string | null; name: string | null } {
  const username = typeof profile.username === "string" && profile.username.trim()
    ? profile.username.trim().replace(/^@+/, "")
    : null;
  const name = typeof profile.name === "string" && profile.name.trim()
    ? profile.name.trim()
    : null;
  return {
    displayName: username ? `@${username}` : name || "Instagram User",
    username,
    name,
  };
}

async function fetchInstagramSenderProfile(
  senderId: string,
  accessToken: string
): Promise<InstagramSenderProfile | null> {
  const token = (accessToken || "").trim();
  if (!senderId || !token) return null;
  console.info("[Meta Webhook] [IG PROFILE] fetch attempted", {
    senderId,
    fields: ["id", "username", "name", "profile_pic"],
  });
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(senderId)}?fields=${encodeURIComponent("id,username,name,profile_pic")}&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    const returned = ["id", "username", "name", "profile_pic"].filter((f) => data[f] != null);
    if (!resp.ok) {
      console.warn("[Meta Webhook] [IG PROFILE] fetch failed", {
        senderId,
        status: resp.status,
        errorCode: (data.error as any)?.code ?? null,
        errorSubcode: (data.error as any)?.error_subcode ?? null,
        errorType: (data.error as any)?.type ?? null,
        fieldsReturned: returned,
      });
      return null;
    }
    const display = normalizeInstagramDisplayName(data);
    const profilePic =
      typeof data.profile_pic === "string" && data.profile_pic.trim()
        ? data.profile_pic.trim()
        : null;
    console.info("[Meta Webhook] [IG PROFILE] fetch success", {
      senderId,
      fieldsReturned: returned,
      hasUsername: !!display.username,
      hasName: !!display.name,
      hasProfilePic: !!profilePic,
    });
    return {
      ...display,
      profilePic,
      fieldsReturned: returned,
    };
  } catch (err: unknown) {
    console.warn("[Meta Webhook] [IG PROFILE] fetch failed", {
      senderId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function buildInstagramContactPatchFromProfile(
  contact: Contact,
  senderId: string,
  profile: InstagramSenderProfile | null
): Partial<Contact> {
  const patch: Partial<Contact> = {
    instagramId: senderId,
    source: "instagram",
    primaryChannel: "instagram",
    lastIncomingChannel: "instagram",
  };
  const displayName = profile?.displayName || "Instagram User";
  const currentName = (contact.name || "").trim();
  if (!currentName || currentName === senderId || isRawNumericId(currentName) || currentName === "Instagram User") {
    patch.name = displayName;
  }
  if (profile?.profilePic) {
    patch.avatar = profile.profilePic;
    patch.avatarFetchedAt = new Date();
  } else if (!contact.avatarFetchedAt) {
    patch.avatarFetchedAt = new Date();
  }
  return patch;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Object storage routes for file uploads
  registerObjectStorageRoutes(app);

  // Shopify integration routes
  app.use('/api/shopify', shopifyRoutes);

  // LeadConnector integration routes
  app.use('/api/ext', ghlRoutes);

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

  /** Approximate country for cookie / analytics consent (CDN / edge headers when present). */
  app.get("/api/geo", (req, res) => {
    try {
      const headerCandidates: Array<[string, string]> = [
        ["cf-ipcountry", "cf-ipcountry"],
        ["x-vercel-ip-country", "x-vercel-ip-country"],
        ["cloudfront-viewer-country", "cloudfront-viewer-country"],
        ["x-country-code", "x-country-code"],
        ["fastly-client-country", "fastly-client-country"],
        ["x-geo-country", "x-geo-country"],
        ["x-appengine-country", "x-appengine-country"],
      ];

      let country: string | null = null;
      let source = "unknown";

      for (const [header, label] of headerCandidates) {
        const rawHeader = req.headers[header];
        const raw =
          typeof rawHeader === "string"
            ? rawHeader
            : Array.isArray(rawHeader)
              ? rawHeader[0]
              : "";
        const normalized = raw.trim().toUpperCase();
        if (normalized && normalized !== "XX" && /^[A-Z]{2}$/.test(normalized)) {
          country = normalized;
          source = label;
          break;
        }
      }

      res.json({ country, source });
    } catch {
      res.json({ country: null, source: "error" });
    }
  });

  /**
   * Temporary diagnostics for subscription + Meta connection issues (schema drift, Stripe mapping).
   * Enable with ENABLE_DEBUG_SUBSCRIPTION_ENDPOINT=true — requires authenticated session.
   */
  if (process.env.ENABLE_DEBUG_SUBSCRIPTION_ENDPOINT === "true") {
    app.get("/api/debug/user-subscription-state", async (req: any, res: any) => {
      try {
        if (!req.user?.id) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        const uid = req.user.id as string;
        const snapshot = await storage.getUserSubscriptionDebugSnapshot(uid);
        const full = await storage.getUserForSession(uid);
        const now = new Date();
        res.json({
          ...snapshot,
          effectivePlan: full ? getEffectivePlanForUser(full, now) : null,
          hasActivePaidPlan: full ? hasActivePaidPlan(full, now) : null,
          proAiTrialActive: full ? isProAiTrialActive(full, now) : null,
        });
      } catch (e: any) {
        console.error("[GET /api/debug/user-subscription-state]", e);
        res.status(500).json({ error: e?.message || "Failed to load debug snapshot" });
      }
    });
  }

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
      // Phase E Step 2: overlay CRM fields from contacts (authoritative source)
      const contactsForExport = await storage.getContacts(req.user.id);
      const contactCrmByPhone = new Map(
        contactsForExport
          .filter(c => c.whatsappId || c.phone)
          .map(c => [(c.whatsappId || c.phone || '').replace(/\D/g, ''), c])
      );
      const headers = ['Name', 'Phone', 'Tag', 'Pipeline Stage', 'Status', 'Notes', 'Follow-up', 'Last Message', 'Created'];
      const rows = chats.map((chat: any) => {
        const rawPhone = chat.whatsappPhone || '';
        const norm = isLegacyCalendlyWorkflowChat(rawPhone) ? "" : rawPhone.replace(/\D/g, "");
        const ct = norm ? contactCrmByPhone.get(norm) : undefined;
        const phoneColumn = isLegacyCalendlyWorkflowChat(rawPhone)
          ? rawPhone.slice(LEGACY_CHAT_CALENDLY_PREFIX.length)
          : rawPhone;
        return [
          chat.name || '',
          phoneColumn,
          (ct?.tag ?? chat.tag) || '',
          (ct?.pipelineStage ?? chat.pipelineStage) || '',
          chat.status || '',
          ((ct?.notes ?? chat.notes) || '').replace(/"/g, '""'),
          (ct?.followUp ?? chat.followUp) || '',
          (chat.lastMessage || '').replace(/"/g, '""'),
          chat.createdAt ? new Date(chat.createdAt).toISOString().split('T')[0] : ''
        ];
      });
      
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
          await subscriptionService.incrementConversationUsage(req.user.id);
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

      // Enforce monthly conversation limit before creating
      const limitCheck = await subscriptionService.checkAndDecrementConversation(req.user.id);
      if (!limitCheck.allowed) {
        return res.status(429).json({ 
          code: "CONVERSATION_LIMIT",
          error: "You've reached your monthly conversation limit",
          message: `Your ${limitCheck.planName} plan includes ${limitCheck.limit} conversations per month. Upgrade your plan or wait until your next billing cycle.`,
          limit: limitCheck.limit,
          used: limitCheck.used,
          planName: limitCheck.planName,
          remaining: 0,
          upgradeRequired: true 
        });
      }

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

  const ACCOUNT_DELETE_SUCCESS_MESSAGE =
    "Your account deletion request has been received. Access may be disabled and data deletion will be processed according to our Privacy Policy.";

  async function handleAccountDeletionRequest(req: any, res: any) {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id as string;

      await storage.requestAccountDeletion(userId);

      const fresh = await storage.getUserForSession(userId);
      if (fresh?.twilioConnected) {
        await disconnectWhatsAppProvider(userId, "twilio").catch((e: unknown) =>
          console.warn("[account/delete-request] Twilio disconnect:", e)
        );
      }
      if (fresh?.metaConnected) {
        await disconnectWhatsAppProvider(userId, "meta").catch((e: unknown) =>
          console.warn("[account/delete-request] Meta disconnect:", e)
        );
      }

      req.logout((logoutErr: unknown) => {
        if (logoutErr) {
          console.error("[account/delete-request] logout:", logoutErr);
        }
        req.session.destroy((destroyErr: unknown) => {
          if (destroyErr) {
            console.error("[account/delete-request] session destroy:", destroyErr);
          }
          res.status(200).json({
            success: true,
            message: ACCOUNT_DELETE_SUCCESS_MESSAGE,
          });
        });
      });
    } catch (error) {
      console.error("Account deletion request error:", error);
      res.status(500).json({ error: "Failed to submit account deletion request" });
    }
  }

  /** Self-service account deletion request (pending; no immediate purge). */
  app.post("/api/account/delete-request", handleAccountDeletionRequest);
  app.delete("/api/account", handleAccountDeletionRequest);

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

  // ============= Chatbot Widget Script =============
  // Served as JavaScript to third-party websites via the embed snippet.
  // Mobile-optimised: deferred init, lazy iframe, touch-friendly, minimal DOM footprint.
  app.get("/widget.js", async (req, res) => {
    const widgetId = req.query.id as string | undefined;
    const origin = process.env.APP_URL ||
      `https://${(process.env.REPLIT_DOMAINS || "").split(",")[0]}`;

    // Fetch widget settings if widgetId is known (best-effort, skip on error)
    let color = "#25D366";
    let position = "right";
    let welcomeMessage = "Hi there! How can we help you today?";
    let enabled = true;
    let triggerType: "always" | "delay" | "scroll" | "exit_intent" = "always";
    let triggerDelaySeconds = 5;
    let triggerScrollPercent = 50;
    let showOnDesktop = true;
    let showOnMobile = true;
    let pageRules: { urlContains: string; greeting: string; prefilledMessage: string }[] = [];

    if (widgetId) {
      try {
        const widgetUser = await storage.getUser(widgetId);
        const ws = (widgetUser?.widgetSettings as any) || {};
        if (ws.enabled === false) { enabled = false; }
        if (ws.color) color = ws.color;
        if (ws.position) position = ws.position;
        if (ws.welcomeMessage) welcomeMessage = ws.welcomeMessage;
        const tt = ws.triggerType;
        if (tt === "delay" || tt === "scroll" || tt === "exit_intent" || tt === "always") {
          triggerType = tt;
        }
        if (typeof ws.triggerDelaySeconds === "number" && !Number.isNaN(ws.triggerDelaySeconds)) {
          triggerDelaySeconds = Math.min(3600, Math.max(0, Math.floor(ws.triggerDelaySeconds)));
        }
        if (typeof ws.triggerScrollPercent === "number" && !Number.isNaN(ws.triggerScrollPercent)) {
          triggerScrollPercent = Math.min(100, Math.max(1, Math.floor(ws.triggerScrollPercent)));
        }
        if (ws.showOnDesktop === false) showOnDesktop = false;
        if (ws.showOnMobile === false) showOnMobile = false;
        if (Array.isArray(ws.pageRules)) {
          pageRules = ws.pageRules.map((r: any) => ({
            urlContains: String(r?.urlContains ?? "").slice(0, 500),
            greeting: String(r?.greeting ?? "").slice(0, 500),
            prefilledMessage: String(r?.prefilledMessage ?? "").slice(0, 2000),
          }));
        }
      } catch { /* non-fatal */ }
    }

    const js = enabled ? `
(function() {
  'use strict';
  var COLOR = ${JSON.stringify(color)};
  var POSITION = ${JSON.stringify(position)};
  var DEFAULT_WELCOME = ${JSON.stringify(welcomeMessage)};
  var WIDGET_ID = ${JSON.stringify(widgetId || "")};
  var ORIGIN = ${JSON.stringify(origin)};
  var TRIGGER = ${JSON.stringify(triggerType)};
  var DELAY_SEC = ${JSON.stringify(triggerDelaySeconds)};
  var SCROLL_PCT = ${JSON.stringify(triggerScrollPercent)};
  var SHOW_DESKTOP = ${JSON.stringify(showOnDesktop)};
  var SHOW_MOBILE = ${JSON.stringify(showOnMobile)};
  var PAGE_RULES = ${JSON.stringify(pageRules)};

  if (window.__wcwInit) return;
  window.__wcwInit = true;

  var btn, bubble, iframeLoaded = false;
  var revealed = false;

  function isMobileViewport() {
    try {
      return window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
    } catch (e) {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    }
  }

  function allowDevice() {
    var m = isMobileViewport();
    if (m && !SHOW_MOBILE) return false;
    if (!m && !SHOW_DESKTOP) return false;
    return true;
  }

  function activeRule() {
    var rules = PAGE_RULES || [];
    for (var i = 0; i < rules.length; i++) {
      var q = (rules[i].urlContains || '').trim();
      if (q && window.location.href.indexOf(q) !== -1) return rules[i];
    }
    return null;
  }

  function welcomeText() {
    var r = activeRule();
    if (r && r.greeting) return r.greeting;
    return DEFAULT_WELCOME;
  }

  function prefillText() {
    var r = activeRule();
    if (r && r.prefilledMessage) return String(r.prefilledMessage);
    return '';
  }

  function iframeSrc() {
    var base = ORIGIN + '/widget-frame/' + WIDGET_ID;
    var qs = [];
    var pr = prefillText();
    if (pr) qs.push('prefill=' + encodeURIComponent(pr));
    var gr = welcomeText();
    if (gr) qs.push('greeting=' + encodeURIComponent(gr));
    try {
      if (typeof window !== 'undefined' && window.location && window.location.href) {
        qs.push('parentUrl=' + encodeURIComponent(window.location.href));
      }
    } catch (e) {}
    return qs.length ? (base + '?' + qs.join('&')) : base;
  }

  function posStyle() {
    return POSITION === 'left'
      ? 'left:20px;right:auto;'
      : 'right:20px;left:auto;';
  }

  function createButton() {
    btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Open chat');
    btn.setAttribute('data-wcw', 'toggle');
    btn.style.cssText = [
      'position:fixed;bottom:20px;' + posStyle(),
      'width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;',
      'background:' + COLOR + ';color:#fff;',
      'box-shadow:0 4px 16px rgba(0,0,0,.25);',
      'display:flex;align-items:center;justify-content:center;',
      'z-index:2147483647;transition:transform .15s;',
      'touch-action:manipulation;-webkit-tap-highlight-color:transparent;',
    ].join('');
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    btn.addEventListener('click', toggleChat);
    btn.addEventListener('mouseenter', function() { btn.style.transform = 'scale(1.1)'; });
    btn.addEventListener('mouseleave', function() { btn.style.transform = 'scale(1)'; });
    document.body.appendChild(btn);
  }

  function createBubble() {
    bubble = document.createElement('div');
    bubble.style.cssText = [
      'position:fixed;bottom:90px;' + posStyle(),
      'background:#fff;border-radius:12px;',
      'box-shadow:0 4px 20px rgba(0,0,0,.18);',
      'padding:12px 16px;max-width:240px;font-size:13px;',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;',
      'z-index:2147483646;opacity:0;pointer-events:none;',
      'transition:opacity .2s;line-height:1.4;',
    ].join('');
    bubble.textContent = welcomeText();
    document.body.appendChild(bubble);
    setTimeout(function() {
      bubble.style.opacity = '1';
      bubble.style.pointerEvents = 'auto';
      setTimeout(function() {
        if (!iframeLoaded) {
          bubble.style.opacity = '0';
          bubble.style.pointerEvents = 'none';
        }
      }, 5000);
    }, 2000);
  }

  function loadIframe() {
    if (iframeLoaded) return;
    iframeLoaded = true;
    var container = document.createElement('div');
    var side = POSITION === 'left' ? 'left:20px;right:auto;' : 'right:20px;left:auto;';
    container.style.cssText = [
      'position:fixed;bottom:90px;' + side,
      'width:min(360px,calc(100vw - 32px));',
      'height:min(560px,calc(100vh - 110px));',
      'border-radius:16px;overflow:hidden;',
      'box-shadow:0 8px 32px rgba(0,0,0,.22);',
      'z-index:2147483646;',
      'transform:scale(0.9) translateY(16px);opacity:0;',
      'transition:transform .2s,opacity .2s;',
    ].join('');
    container.setAttribute('data-wcw', 'frame-container');

    var frame = document.createElement('iframe');
    frame.src = iframeSrc();
    frame.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    frame.setAttribute('loading', 'lazy');
    frame.setAttribute('title', 'Chat');
    frame.setAttribute('allow', 'clipboard-write');
    container.appendChild(frame);
    document.body.appendChild(container);

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        container.style.transform = 'scale(1) translateY(0)';
        container.style.opacity = '1';
      });
    });

    return container;
  }

  var chatOpen = false;
  var frameContainer = null;

  function toggleChat() {
    chatOpen = !chatOpen;
    if (chatOpen) {
      btn.setAttribute('aria-label', 'Close chat');
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      bubble.style.opacity = '0';
      bubble.style.pointerEvents = 'none';
      if (!frameContainer) {
        frameContainer = loadIframe();
      } else {
        var fr = frameContainer.querySelector('iframe');
        if (fr) fr.src = iframeSrc();
        frameContainer.style.display = 'block';
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            frameContainer.style.transform = 'scale(1) translateY(0)';
            frameContainer.style.opacity = '1';
          });
        });
      }
    } else {
      btn.setAttribute('aria-label', 'Open chat');
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
      if (frameContainer) {
        frameContainer.style.transform = 'scale(0.9) translateY(16px)';
        frameContainer.style.opacity = '0';
        setTimeout(function() {
          if (frameContainer && !chatOpen) frameContainer.style.display = 'none';
        }, 200);
      }
    }
  }

  function scrollDepthPercent() {
    var h = document.documentElement;
    var st = window.pageYOffset != null ? window.pageYOffset : h.scrollTop;
    var sh = h.scrollHeight - h.clientHeight;
    if (sh <= 0) return 100;
    return Math.round((st / sh) * 100);
  }

  function isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }

  function reveal() {
    if (revealed) return;
    if (!allowDevice()) return;
    revealed = true;
    createButton();
    createBubble();
  }

  function scheduleReveal() {
    if (!allowDevice()) return;
    if (TRIGGER === 'always') {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(function() { reveal(); }, { timeout: 3000 });
      } else {
        setTimeout(reveal, 0);
      }
      return;
    }
    if (TRIGGER === 'delay') {
      var sec = Math.max(0, parseInt(String(DELAY_SEC), 10) || 0);
      setTimeout(reveal, sec * 1000);
      return;
    }
    if (TRIGGER === 'scroll') {
      function onScroll() {
        if (scrollDepthPercent() >= (parseInt(String(SCROLL_PCT), 10) || 50)) {
          window.removeEventListener('scroll', onScroll, true);
          reveal();
        }
      }
      window.addEventListener('scroll', onScroll, { passive: true, capture: true });
      setTimeout(onScroll, 0);
      return;
    }
    if (TRIGGER === 'exit_intent') {
      if (isTouchDevice()) {
        function onScrollExit() {
          if (scrollDepthPercent() >= (parseInt(String(SCROLL_PCT), 10) || 50)) {
            window.removeEventListener('scroll', onScrollExit, true);
            reveal();
          }
        }
        window.addEventListener('scroll', onScrollExit, { passive: true, capture: true });
        setTimeout(onScrollExit, 0);
      } else {
        function onLeave(e) {
          if (e.clientY <= 0) {
            document.documentElement.removeEventListener('mouseleave', onLeave);
            reveal();
          }
        }
        document.documentElement.addEventListener('mouseleave', onLeave);
      }
      return;
    }
    reveal();
  }

  function boot() {
    if (!document.body) return;
    scheduleReveal();
  }

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(function() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
      } else {
        boot();
      }
    }, { timeout: 3000 });
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      setTimeout(boot, 300);
    }
  }
})();
` : '/* widget disabled */';

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(js);
  });

  // ============= Website Widget Settings Endpoints =============
  
  const defaultWidgetPageRules = [
    { urlContains: "/pricing", greeting: "Questions about pricing?", prefilledMessage: "Hi! I have a question about your pricing." },
    { urlContains: "/contact", greeting: "Let us get in touch", prefilledMessage: "Hi! I would like to get in touch." },
    { urlContains: "/services", greeting: "Tell us what you need", prefilledMessage: "Hi! I am interested in your services." },
  ];

  const baseWidgetSettings = {
    enabled: true,
    color: "#25D366",
    welcomeMessage: "Hi there! How can we help you today?",
    position: "right" as const,
    showOnMobile: true,
    showOnDesktop: true,
    triggerType: "always" as const,
    triggerDelaySeconds: 5,
    triggerScrollPercent: 50,
    pageRules: defaultWidgetPageRules,
  };

  function mergeWidgetSettingsFromDb(stored: unknown) {
    const s = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
    return {
      ...baseWidgetSettings,
      ...s,
      pageRules: Array.isArray(s.pageRules) ? s.pageRules : baseWidgetSettings.pageRules,
    };
  }

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
      res.json(mergeWidgetSettingsFromDb(user.widgetSettings));
    } catch (error) {
      console.error("Error fetching widget settings:", error);
      res.status(500).json({ error: "Failed to fetch widget settings" });
    }
  });

  // Update widget settings
  const widgetPageRuleSchema = z.object({
    urlContains: z.string().max(500),
    greeting: z.string().max(500),
    prefilledMessage: z.string().max(2000),
  });

  const widgetSettingsSchema = z.object({
    enabled: z.boolean().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    welcomeMessage: z.string().max(500).optional(),
    position: z.enum(["left", "right"]).optional(),
    showOnMobile: z.boolean().optional(),
    showOnDesktop: z.boolean().optional(),
    triggerType: z.enum(["always", "delay", "scroll", "exit_intent"]).optional(),
    triggerDelaySeconds: z.number().int().min(0).max(3600).optional(),
    triggerScrollPercent: z.number().int().min(1).max(100).optional(),
    pageRules: z.array(widgetPageRuleSchema).max(30).optional(),
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
      
      const user = await storage.getUser(req.user.id);
      const currentSettings = mergeWidgetSettingsFromDb(user?.widgetSettings);
      
      const patch = Object.fromEntries(
        Object.entries(validation.data).filter(([, v]) => v !== undefined)
      ) as Record<string, unknown>;
      
      const newSettings = { ...currentSettings, ...patch };

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

      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      // Route to the active provider via the central WhatsApp service
      const sendResult = await sendWhatsAppMessage(req.user.id, chat.whatsappPhone, message);
      if (!sendResult.success) {
        return res.status(400).json({
          error: sendResult.error,
          code: sendResult.provider === "meta" ? "META_NOT_CONNECTED" : "TWILIO_NOT_CONNECTED",
        });
      }
      const messageId = sendResult.messageId;

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
    limits: { fileSize: WA_OUTBOUND_UPLOAD_MULTER_MAX_BYTES },
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

      const sizeCheck = waUploadFileSizeCheck(req.file.mimetype, req.file.size);
      if (!sizeCheck.ok) {
        return res.status(413).json({ error: waUploadTooLargeMessage(sizeCheck.kind) });
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

      const availability = await getWhatsAppAvailability(req.user.id);
      if (!availability.available) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: availability.message || "WhatsApp not connected",
          code: availability.provider === "meta" ? "META_NOT_CONNECTED" : "TWILIO_NOT_CONNECTED",
        });
      }

      // Serve the uploaded file at a publicly reachable URL
      const appUrl = getAppOrigin();
      const mediaUrl = `${appUrl}/uploads/${path.basename(req.file.path)}`;
      const mediaType = req.file.mimetype.startsWith('image/') ? "image"
        : req.file.mimetype.startsWith('video/') ? "video"
        : req.file.mimetype.startsWith('audio/') ? "audio"
        : "document";

      const sendResult = await sendWhatsAppMedia(req.user.id, phone, mediaUrl, mediaType as any);
      if (!sendResult.success) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: sendResult.error, code: "SEND_FAILED" });
      }

      // Track usage
      const mediaCost = 0.01; // Higher cost for media
      const costs = calculateCostWithMarkup(mediaCost);
      await storage.recordMessageUsage({
        userId: req.user.id,
        chatId: chat.id,
        direction: "outbound",
        messageType: mediaType,
        twilioSid: sendResult.messageId,
        twilioCost: costs.twilioCost,
        markupPercent: costs.markupPercent,
        totalCost: costs.totalCost,
      });

      const newMessage: WhatsAppMessage = {
        id: sendResult.messageId,
        text: req.file.mimetype.startsWith('image/') ? '[Image]' : `[File: ${req.file.originalname}]`,
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        sent: true,
        sender: "me",
        status: "sent",
        twilioSid: sendResult.messageId,
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
      
      const status = await getProviderStatus(req.user.id);
      res.json(status.twilio);
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

      const webhookBaseUrl = getAppOrigin();
      const result = await connectUserTwilio(req.user.id, credentials, webhookBaseUrl);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // WhatsApp webhooks cannot be auto-configured via the Twilio REST API
      // (the API only exposes SMS smsUrl, not the separate WhatsApp webhook).
      // Always return the webhook URLs and direct the user to set them manually.
      console.log(`[Twilio Connect] User ${req.user.id} connected. Webhook URL: ${webhookBaseUrl}/api/webhook/twilio/incoming`);

      res.json({ 
        success: true, 
        message: "Twilio connected. Configure the webhook URL below in your Twilio Console to receive inbound WhatsApp messages.",
        webhookUrl: `${webhookBaseUrl}/api/webhook/twilio/incoming`,
        statusCallbackUrl: `${webhookBaseUrl}/api/webhook/twilio/status`,
        webhooksConfigured: false,
        manualSetupRequired: true,
        manualSetupInstructions: "In your Twilio Console go to Messaging → Senders → WhatsApp Senders → select your sender → set the Incoming Messages webhook URL to the webhookUrl above.",
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

      await disconnectWhatsAppProvider(req.user.id, "twilio");
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
      
      const status = await getProviderStatus(req.user.id);
      res.json({
        ...status.meta,
        // legacy shape kept for backwards-compat with frontend
        connected: status.meta.connected,
        phoneNumber: status.meta.phoneNumberId
          ? `Meta ID: ${status.meta.phoneNumberId.slice(0, 10)}...`
          : null,
        activeProvider: status.activeProvider,
        twilioConnected: status.twilio.connected,
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

      // In production, App Secret is required for webhook signature verification.
      // Without it, every inbound webhook would be rejected with 403.
      if (process.env.NODE_ENV === "production" && !appSecret) {
        return res.status(400).json({
          error: "App Secret is required in production. Find it in your Meta app dashboard under App Settings → Basic.",
          field: "appSecret",
        });
      }

      const credentials: MetaCredentials = {
        accessToken,
        phoneNumberId,
        businessAccountId,
        appSecret,
        webhookVerifyToken,
      };

      let tokenExpiresAt: Date | null = null;
      try {
        tokenExpiresAt = await getAccessTokenExpiryFromDebug(accessToken);
      } catch {
        /* expiration hint is optional for legacy manual tokens */
      }

      const result = await connectUserMeta(req.user.id, credentials, {
        connectionType: "manual_legacy",
        tokenExpiresAt,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      const webhookBaseUrl = getAppOrigin();
      
      // Get the actual stored verify token to return to user
      const updatedUser = await storage.getUser(req.user.id);
      
      res.json({ 
        success: true, 
        message: "Meta WhatsApp Business API connected successfully!",
        phoneNumber: result.phoneNumber,
        webhookUrl: `${webhookBaseUrl}/api/webhook/meta`,
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

      await disconnectWhatsAppProvider(req.user.id, "meta");
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
      
      const status = await getProviderStatus(req.user.id);
      res.json(status);
    } catch (error) {
      console.error("Error getting provider status:", error);
      res.status(500).json({ error: "Failed to get provider status" });
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
      // -1 = unlimited (Pro). Same seat math as GET /api/subscription usersCount + limits.usersLimit.
      if (limits.maxUsers !== -1 && currentCount >= limits.maxUsers) {
        return res.status(403).json({
          error:
            limits.plan === "free"
              ? "Your Free plan includes 1 user. Upgrade to Starter to invite team members."
              : limits.plan === "starter"
                ? "Starter includes up to 3 users. Upgrade to Pro for unlimited team members."
                : `Your ${limits.planName} plan does not allow more team members right now.`,
          upgradeRequired: true,
          plan: limits.plan,
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
    const webhookTimestamp = new Date().toISOString();
    console.log(`[Twilio Webhook] ===== INBOUND WEBHOOK RECEIVED at ${webhookTimestamp} =====`);
    console.log(`[Twilio Webhook] Headers: x-twilio-signature=${req.headers["x-twilio-signature"] ? "present" : "MISSING"}, content-type=${req.headers["content-type"]}`);
    console.log(`[Twilio Webhook] Raw body: ${JSON.stringify(req.body).substring(0, 600)}`);

    try {
      const parsed = parseIncomingWebhook(req.body);
      const isWhatsApp = req.body.From?.startsWith("whatsapp:");
      const channel = isWhatsApp ? 'whatsapp' : 'sms';

      console.log(`[Twilio Webhook] Parsed — from: ${parsed.from}, to: ${parsed.to}, accountSid: ${parsed.accountSid}, channel: ${channel}, messageSid: ${parsed.messageSid}`);

      // Find user by their Twilio Account SID and receiving phone number (primary or secondary registered number)
      const twilioMatch = await findUserByTwilioCredentials(parsed.accountSid, parsed.to);
      
      if (!twilioMatch) {
        console.warn(`[Twilio Webhook] WARNING: No user found — accountSid: ${parsed.accountSid}, to: ${parsed.to}. Message dropped.`);
        console.warn(`[Twilio Webhook] Hint: Ensure the user has connected Twilio with matching Account SID and WhatsApp number.`);
        return res.status(200).send("");
      }

      const { user, matchedPhone } = twilioMatch;
      console.log(`[Twilio Webhook] User matched — userId: ${user.id} (email: ${user.email}), matchedPhone: ${matchedPhone})`);

      // Environment mode — drives strict vs. permissive behaviour
      const isProduction = process.env.NODE_ENV === "production";

      // Validate Twilio request signature using the user's auth token
      // In production: missing or invalid signature → 403 immediately
      // In dev/staging: warn and allow through for easier local testing
      const twilioSignature = req.headers["x-twilio-signature"] as string;

      if (!twilioSignature) {
        if (isProduction) {
          console.error(`[Twilio Webhook] REJECTED (production): Missing X-Twilio-Signature header — request refused`);
          return res.status(403).send("Missing signature");
        } else {
          console.warn(`[Twilio Webhook] DEV BYPASS: No X-Twilio-Signature header — allowed in non-production. This would be rejected in production.`);
        }
      } else if (user.twilioAuthToken) {
        try {
          const twilioClient = (await import("twilio")).default;
          const authToken = isEncrypted(user.twilioAuthToken)
            ? decryptCredential(user.twilioAuthToken)
            : user.twilioAuthToken;
          // IMPORTANT: must use the same base URL that was used when configuring
          // the Twilio webhook (connectUserTwilio / configureWebhooks). That code
          // uses APP_URL first, falling back to REPLIT_DOMAINS. The signature
          // Twilio sends is computed against the URL they actually POST to, so
          // any mismatch here causes every production signature check to fail.
          const webhookBaseUrl = getAppOrigin();
          const fullUrl = `${webhookBaseUrl}/api/webhook/twilio/incoming`;
          const isValid = twilioClient.validateRequest(authToken, twilioSignature, fullUrl, req.body);

          if (isValid) {
            console.log(`[Twilio Webhook] Signature validation: PASSED ✓`);
          } else {
            if (isProduction) {
              console.error(`[Twilio Webhook] REJECTED (production): Signature validation failed. URL used: ${fullUrl}`);
              return res.status(403).send("Invalid signature");
            } else {
              console.warn(`[Twilio Webhook] DEV BYPASS: Signature validation failed (URL: ${fullUrl}) — allowed in non-production. This would be rejected in production.`);
            }
          }
        } catch (sigErr: any) {
          if (isProduction) {
            console.error(`[Twilio Webhook] REJECTED (production): Signature validation threw error: ${sigErr.message}`);
            return res.status(403).send("Signature validation error");
          } else {
            console.warn(`[Twilio Webhook] DEV BYPASS: Signature validation error: ${sigErr.message} — allowed in non-production.`);
          }
        }
      } else {
        if (isProduction) {
          console.error(`[Twilio Webhook] REJECTED (production): User has no auth token stored — cannot validate signature`);
          return res.status(403).send("Cannot validate signature");
        } else {
          console.warn(`[Twilio Webhook] DEV BYPASS: User has no auth token stored — skipping validation in non-production.`);
        }
      }

      const userId = user.id;

      // Normalize channelContactId: strip leading '+' so format matches Meta path (e.g. 15550001234)
      const normalizedFrom = parsed.from.replace(/^\+/, "");
      console.log(`[Twilio Webhook] Sender phone normalized: "${parsed.from}" → "${normalizedFrom}"`);

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

      // Process inbound message directly to DB — no queue dependency
      console.log(`[Inbound] Webhook received — channel: ${channel}, from: ${normalizedFrom}, messageSid: ${parsed.messageSid}`);
      console.log(`[Inbound] Channel identified: ${channel} — starting processIncomingMessage, userId: ${userId}`);
      const { channelService: cs } = await import("./channelService");
      // isNewConversation and chatbotWillFire are evaluated once inside
      // processIncomingMessage and returned here so no subsequent handler
      // needs to query the DB again to make the same determination.
      const twilioMimeToContent = (ct: string | undefined): "image" | "video" | "audio" | "document" => {
        if (!ct) return "image";
        if (ct.startsWith("image/")) return "image";
        if (ct.startsWith("video/")) return "video";
        if (ct.startsWith("audio/")) return "audio";
        return "document";
      };
      const hasTwilioMedia = !!parsed.mediaUrl && parsed.numMedia > 0;
      const inboxResult = await cs.processIncomingMessage({
        userId,
        channel,
        channelContactId: normalizedFrom,
        channelAccountId: matchedPhone, // the business number that received the message
        contactName: parsed.profileName || normalizedFrom,
        content: parsed.body || (hasTwilioMedia ? "" : ""),
        contentType: hasTwilioMedia ? twilioMimeToContent(parsed.mediaContentType) : "text",
        mediaUrl: parsed.mediaUrl,
        mediaFilename: hasTwilioMedia ? `mms-${parsed.messageSid}` : undefined,
        externalMessageId: parsed.messageSid,
      });
      const {
        isNewConversation: inboxIsNewConv,
        chatbotWillFire: inboxChatbotWillFire,
        contact: inboxContact,
        conversation: inboxConversation,
      } = inboxResult;
      if (!inboxResult.success || !inboxContact || !inboxConversation) {
        console.error("[inbound-processing] Twilio processing returned incomplete state", {
          messageSid: parsed.messageSid,
          userId,
          errors: inboxResult.errors,
        });
        return res.status(200).send("");
      }
      console.log(`[Inbound] Webhook returned 200 — channel: ${channel}, messageSid: ${parsed.messageSid}, userId: ${userId}`);

      // Trigger workflow automations (Pro feature) — centralized dispatcher
      const updatedChat = await storage.getChat(chat.id);
      if (updatedChat) {
        const inboundBody = parsed.body || "";
        const bookingIntent = detectHighConfidenceBookingIntent(inboundBody);
        dispatchInboundMessagingAutomation({
          userId,
          isNewChat,
          updatedChat,
          messageBody: inboundBody,
          contact: inboxContact,
          conversationId: inboxConversation.id,
          skipKeywordWorkflows: inboxChatbotWillFire && !bookingIntent,
        }).catch((err) => console.error("[AutomationDispatcher] inbound workflows:", err));
        // W2 Financial Qualification Engine (Realtor Growth Engine)
        // chatbotWillFire was determined once inside processIncomingMessage —
        // no extra DB round-trip needed here.
        ;(async () => {
          try {
            const install = await storage.getTemplateInstall(userId, "realtor-growth-engine");
            if (install?.installStatus === "installed") {
              if (inboxChatbotWillFire) {
                console.log(`[W2] Outbound suppressed (Twilio) — chatbot owns this reply for userId: ${userId}`);
              }

              const w2 = await runW2QualificationEngine(userId, updatedChat, parsed.body, inboxContact);
              if (w2.signalsDetected.length > 0) {
                console.log(`[W2] Signals detected for chat ${updatedChat.id}: ${w2.signalsDetected.join(", ")} score+=${w2.scoreAdjustment}`);
              }
              // Service Routing Engine
              try {
                const routing = await runServiceRoutingEngine(userId, updatedChat, parsed.body, inboxContact);
                const routingMsg = routing.offerMessage || routing.routingMessage;
                if (!inboxChatbotWillFire && inboxContact?.id && updatedChat.whatsappPhone) {
                  const snap = inboxContact.lastIncomingAt ?? null;
                  const { scheduleW2FollowUpTimers } = await import("./automationTimerHandlers");
                  await scheduleW2FollowUpTimers({
                    userId,
                    contactId: inboxContact.id,
                    qualificationText: w2.qualificationQuestion || null,
                    routingText: routingMsg || null,
                    twilioDigits: updatedChat.whatsappPhone.replace(/\D/g, ""),
                    metaFrom: undefined,
                    snapshotInboundAt: snap,
                  }).catch((e) => console.error("[W2] schedule timers:", e));
                }
                // Phase D: apply service-routing tags via dual-write (contact-first)
                if (routing.tagsToApply.length > 0) {
                  const newTag = routing.tagsToApply[0];
                  try {
                    if (inboxContact) {
                      await storage.updateContact(inboxContact.id, { tag: newTag }).catch(() => {});
                      void import("./hubspotAutoSync").then(({ scheduleHubSpotAutoSync }) =>
                        scheduleHubSpotAutoSync(userId, inboxContact.id)
                      );
                    }
                    await storage.updateChat(updatedChat.id, { tag: newTag }).catch(() => {});
                    console.log(`[Routing] Tag applied (Twilio): "${newTag}" for chat ${updatedChat.id}`);
                  } catch (err) { console.error("[Routing] Failed to apply tag:", err); }
                }
                if (routing.taskNote) {
                  console.log(`[Routing] Internal task created for chat ${updatedChat.id}: ${routing.taskNote}`);
                }
              } catch (err) { console.error("[Routing] Engine error:", err); }
            }
          } catch (err) { console.error("[W2] Engine error:", err); }
        })();
      }

      // Auto-reply & Business Hours are now handled inside
      // channelService.processIncomingMessage for all channels.

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
        // Check 1: users table (WhatsApp Meta connections)
        const allUsers = await db.select().from(users).where(eq(users.metaConnected, true));
        const matchingUser = allUsers.find(u => u.metaWebhookVerifyToken === token);
        if (matchingUser) {
          console.log(`[Webhook Verify] Matched via users.metaWebhookVerifyToken — userId: ${matchingUser.id}`);
          return res.status(200).send(challenge);
        }

        // Check 2: channelSettings.config.webhookVerifyToken (Facebook/Instagram connections)
        const allChannelSettings = await db.select().from(channelSettings)
          .where(eq(channelSettings.isConnected, true));
        const matchingChannel = allChannelSettings.find(s => {
          const cfg = s.config as any;
          return cfg?.webhookVerifyToken === token;
        });
        if (matchingChannel) {
          console.log(`[Webhook Verify] Matched via channelSettings.webhookVerifyToken — userId: ${matchingChannel.userId}, channel: ${matchingChannel.channel}`);
          return res.status(200).send(challenge);
        }

        // Check 3: global verify token from env
        const globalToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
        if (globalToken && token === globalToken) {
          console.log("[Webhook Verify] Matched via global META_WEBHOOK_VERIFY_TOKEN");
          return res.status(200).send(challenge);
        }

        console.warn(`[Webhook Verify] FAILED — token did not match any user or channelSettings record. Token: ${String(token).slice(0, 8)}...`);
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
      const entryList = Array.isArray(req.body?.entry) ? req.body.entry : [];
      let messagingEventTotal = 0;
      for (const ent of entryList) {
        messagingEventTotal += Array.isArray((ent as any)?.messaging)
          ? (ent as any).messaging.length
          : 0;
      }
      devLog("[Meta Webhook] incoming request", {
        object: (req.body as any)?.object ?? null,
        entryCount: entryList.length,
        messagingEventCount: messagingEventTotal,
        firstEntryId: (entryList[0] as any)?.id ?? null,
      });

      const webhookTimestamp = new Date().toISOString();
      devLog(`[Meta Webhook] ===== INBOUND WEBHOOK RECEIVED at ${webhookTimestamp} =====`);
      devLog(`[Meta Webhook] Headers: x-hub-signature-256=${req.headers["x-hub-signature-256"] ? "present" : "MISSING"}, content-type=${req.headers["content-type"]}`);
      devLog(`[Meta Webhook] Raw payload preview: ${JSON.stringify(req.body).substring(0, 800)}`);

      const inboundPreview = summarizeMetaWebhookInbound(req.body);
      let resolvedUserId: string | null = null;
      if (inboundPreview.phoneNumberIdFromPayload) {
        try {
          const u = await findUserByMetaPhoneNumberId(inboundPreview.phoneNumberIdFromPayload);
          resolvedUserId = u?.id ?? null;
        } catch {
          resolvedUserId = null;
        }
      }
      console.log(
        `[Meta Webhook Inbound] ${JSON.stringify({
          ts: webhookTimestamp,
          object: inboundPreview.object,
          entryIds: inboundPreview.entryIds,
          changesFields: inboundPreview.changesFields,
          phoneNumberIdFromPayload: inboundPreview.phoneNumberIdFromPayload,
          messagingEventKinds: inboundPreview.messagingEventKinds,
          messagingRecipientIds: inboundPreview.messagingRecipientIds,
          resolvedUserId,
          resolvedChannel:
            inboundPreview.object === "instagram"
              ? "instagram"
              : inboundPreview.object === "page"
                ? "facebook"
                : inboundPreview.object === "whatsapp_business_account"
                  ? "whatsapp"
                  : "unknown",
          signatureHeaderPresent: !!req.headers["x-hub-signature-256"],
          messagingEventCount: messagingEventTotal,
          entryCount: entryList.length,
        })}`
      );

      const configuredMetaAppId = (process.env.META_APP_ID || "").trim();
      const webhookObjectType = req.body.object as string | undefined;
      if (webhookObjectType === "instagram" || webhookObjectType === "page") {
        try {
          const recipientIds = new Set(
            inboundPreview.messagingRecipientIds
              .map((x) => String(x || "").trim())
              .filter(Boolean)
          );
          const entryIds = new Set(
            inboundPreview.entryIds
              .map((x) => String(x || "").trim())
              .filter(Boolean)
          );
          const allConnected = await db.select().from(channelSettings)
            .where(eq(channelSettings.isConnected, true));
          const matches = allConnected
            .map((setting) => {
              const config = (setting.config || {}) as Record<string, unknown>;
              const pageId = typeof config.pageId === "string" ? config.pageId : null;
              const instagramAccountId =
                typeof config.instagramAccountId === "string"
                  ? config.instagramAccountId
                  : typeof config.instagramId === "string"
                    ? config.instagramId
                    : null;
              const storedMetaAppId =
                typeof config.metaAppId === "string"
                  ? config.metaAppId
                  : typeof config.appId === "string"
                    ? config.appId
                    : null;
              const matchedBy =
                (pageId && (recipientIds.has(pageId) || entryIds.has(pageId)))
                  ? "pageId"
                  : (instagramAccountId && (recipientIds.has(instagramAccountId) || entryIds.has(instagramAccountId)))
                    ? "instagramAccountId"
                    : null;
              if (!matchedBy) return null;
              return {
                settingId: setting.id,
                userId: setting.userId,
                channel: setting.channel,
                matchedBy,
                pageId,
                instagramAccountId,
                storedMetaAppId,
                configuredMetaAppId: configuredMetaAppId || null,
                storedMatchesConfigured:
                  !!storedMetaAppId && !!configuredMetaAppId && storedMetaAppId === configuredMetaAppId,
                configHasAppSecret: !!config.appSecret,
              };
            })
            .filter(Boolean);

          console.info(
            `[Meta Webhook] app ownership diagnostics ${JSON.stringify({
              object: webhookObjectType,
              configuredMetaAppId: configuredMetaAppId || null,
              configuredInstagramAppId: process.env.INSTAGRAM_APP_ID?.trim() || null,
              entryIds: inboundPreview.entryIds,
              messagingRecipientIds: inboundPreview.messagingRecipientIds,
              matchedChannelSettings: matches,
              note:
                "Incoming webhooks are signed by the app that owns the webhook product/subscription. Instagram object payloads try META_APP_SECRET first, then optional INSTAGRAM_APP_SECRET.",
            })}`
          );
        } catch (e) {
          console.warn("[Meta Webhook] app ownership diagnostics failed", e);
        }
      }

      // Environment mode — drives strict vs. permissive behaviour throughout this handler
      const isProduction = process.env.NODE_ENV === "production";

      // Check for signature header
      const signature = req.headers["x-hub-signature-256"] as string;

      if (!signature) {
        if (isProduction) {
          console.error(`[Meta Webhook] REJECTED (production): Missing X-Hub-Signature-256 header`);
          return res.status(403).send("Missing signature");
        } else {
          console.warn(`[Meta Webhook] DEV BYPASS: No X-Hub-Signature-256 header — allowed in non-production. This would be rejected in production.`);
          // Skip all signature checks and proceed directly to message processing
        }
      }

      // Use the captured raw body buffer for signature verification.
      // JSON.stringify(req.body) would re-serialize a parsed object and may differ
      // from the original bytes that Meta signed (whitespace, key order), causing
      // webhooks to fail verification. rawBody is set by the express.json verify
      // callback registered in index.ts for /api/webhook/meta.
      const rawBodyBuffer = Buffer.isBuffer((req as any).rawBody)
        ? ((req as any).rawBody as Buffer)
        : null;
      const rawBody = rawBodyBuffer?.toString("utf8") || JSON.stringify(req.body);
      const verificationPayload = rawBodyBuffer ?? Buffer.from(rawBody, "utf8");

      // Extra diagnostics for Instagram DMs: log the raw bytes (truncated) so we can
      // confirm which object type and entry shape Meta is sending in production.
      if (webhookObjectType === "instagram") {
        devLog("[Meta Webhook] [IG RAW] rawBody (first 4000 chars)", rawBody.slice(0, 4000));
      }

      // --- Signature resolution ---
      // We track two flags separately:
      //   signatureValid     — true only when a secret verified the HMAC successfully
      //   hasSecretToVerify  — true when at least one secret was available to try
      // In production: !signatureValid → 403 regardless of hasSecretToVerify
      // In dev:        !signatureValid + !hasSecretToVerify → warn + allow
      //                !signatureValid + hasSecretToVerify  → warn + allow (HMAC mismatch)
      const globalAppSecretRaw = process.env.META_APP_SECRET;
      const globalAppSecret = globalAppSecretRaw?.trim();
      const instagramAppSecretRaw = process.env.INSTAGRAM_APP_SECRET;
      const instagramAppSecret = instagramAppSecretRaw?.trim();
      const receivedSignatureHash =
        typeof signature === "string" ? signature.replace(/^sha256=/, "") : "";
      let signatureValid = false;
      let hasSecretToVerify = false;
      let matchedSecretSource: string | null = null;

      let globalComputedSignaturePrefix: string | null = null;
      if (globalAppSecret) {
        try {
          globalComputedSignaturePrefix = computeMetaWebhookSignature(
            verificationPayload,
            globalAppSecret
          ).slice(0, 12);
        } catch {
          globalComputedSignaturePrefix = null;
        }
      }
      let instagramComputedSignaturePrefix: string | null = null;
      if (webhookObjectType === "instagram" && instagramAppSecret) {
        try {
          instagramComputedSignaturePrefix = computeMetaWebhookSignature(
            verificationPayload,
            instagramAppSecret
          ).slice(0, 12);
        } catch {
          instagramComputedSignaturePrefix = null;
        }
      }

      console.info(
        `[Meta Webhook] signature diagnostics ${JSON.stringify({
          object: webhookObjectType ?? null,
          metaAppSecretExists: !!globalAppSecretRaw,
          metaAppSecretLength: globalAppSecretRaw?.length ?? 0,
          metaAppSecretTrimmedLength: globalAppSecret?.length ?? 0,
          instagramAppSecretExists: !!instagramAppSecretRaw,
          instagramAppSecretLength: instagramAppSecretRaw?.length ?? 0,
          instagramAppSecretTrimmedLength: instagramAppSecret?.length ?? 0,
          rawBodyExists: !!rawBodyBuffer,
          rawBodyByteLength: rawBodyBuffer?.length ?? 0,
          xHubSignature256Exists: !!signature,
          computedSignaturePrefix: globalComputedSignaturePrefix,
          metaAppSecretComputedSignaturePrefix: globalComputedSignaturePrefix,
          instagramAppSecretComputedSignaturePrefix: instagramComputedSignaturePrefix,
          receivedSignaturePrefix: receivedSignatureHash.slice(0, 12) || null,
          bodySource: rawBodyBuffer ? "rawBody buffer" : "JSON.stringify fallback",
        })}`
      );

      if (globalAppSecret) {
        hasSecretToVerify = true;
        signatureValid = verifyMetaWebhookSignature(verificationPayload, signature, globalAppSecret);
        if (signatureValid) matchedSecretSource = "META_APP_SECRET";
        devLog(`[Meta Webhook] Global META_APP_SECRET check: ${signatureValid ? "PASSED" : "failed"}`);
      } else {
        devLog("[Meta Webhook] No global META_APP_SECRET — WhatsApp may try user-level secrets; Facebook/Instagram will not");
      }

      if (!signatureValid && webhookObjectType === "instagram" && instagramAppSecret) {
        hasSecretToVerify = true;
        signatureValid = verifyMetaWebhookSignature(verificationPayload, signature, instagramAppSecret);
        if (signatureValid) matchedSecretSource = "INSTAGRAM_APP_SECRET";
        console.info(
          `[Meta Webhook] Instagram secret check ${JSON.stringify({
            secretSource: "INSTAGRAM_APP_SECRET",
            length: instagramAppSecretRaw?.length ?? 0,
            trimmedLength: instagramAppSecret.length,
            computedSignaturePrefix: instagramComputedSignaturePrefix,
            matched: signatureValid,
          })}`
        );
      } else if (!signatureValid && webhookObjectType === "instagram") {
        console.info(
          `[Meta Webhook] Instagram secret check skipped ${JSON.stringify({
            secretSource: "INSTAGRAM_APP_SECRET",
            exists: !!instagramAppSecretRaw,
            length: instagramAppSecretRaw?.length ?? 0,
          })}`
        );
      }

      // If app-level secrets didn't verify, try legacy user-level secrets only for WhatsApp payloads.
      // Facebook/Instagram webhooks are app-owned subscriptions:
      // - page object uses META_APP_SECRET
      // - instagram object may use the Instagram API product's INSTAGRAM_APP_SECRET
      // We intentionally do not try per-user/per-channel fallback secrets for page/IG because that
      // could mask that the webhook belongs to the wrong Meta app.
      if (!signatureValid) {
        const entry = req.body.entry?.[0];
        const phoneNumberId = entry?.changes?.[0]?.value?.metadata?.phone_number_id;

        if (webhookObjectType === "whatsapp_business_account" && phoneNumberId) {
          const user = await findUserByMetaPhoneNumberId(phoneNumberId);
          if (user?.metaAppSecret) {
            hasSecretToVerify = true;
            const userSecret = isMetaEncrypted(user.metaAppSecret)
              ? decryptMetaCredential(user.metaAppSecret)
              : user.metaAppSecret;
            signatureValid = verifyMetaWebhookSignature(verificationPayload, signature, userSecret.trim());
            devLog(`[Meta Webhook] User (${user.id}) app secret check for phoneNumberId ${phoneNumberId}: ${signatureValid ? "PASSED" : "failed"}`);
          } else if (user) {
            console.warn(`[Meta Webhook] User ${user.id} matched but has no metaAppSecret stored`);
          } else {
            console.warn(`[Meta Webhook] No user found for phoneNumberId: ${phoneNumberId}`);
          }
        }

        if (!signatureValid && (webhookObjectType === "instagram" || webhookObjectType === "page")) {
          console.info(
            `[Meta Webhook] No per-user fallback app secret attempted for ${webhookObjectType}; page signatures must match META_APP_SECRET and instagram signatures may match INSTAGRAM_APP_SECRET. META_APP_ID=${configuredMetaAppId || "(unset)"} INSTAGRAM_APP_ID=${process.env.INSTAGRAM_APP_ID?.trim() || "(unset)"}`
          );
        }
      }

      // --- Enforcement decision ---
      if (!signatureValid) {
        if (isProduction) {
          if (!hasSecretToVerify) {
            console.error(`[Meta Webhook] REJECTED (production): No app secret configured — cannot verify signature. Set META_APP_SECRET env var or store metaAppSecret on user account.`);
          } else {
            console.error(
              `[Meta Webhook] REJECTED (production): Signature verification failed. Signature prefix: ${receivedSignatureHash.slice(0, 12) || "missing"}... Body source: ${rawBodyBuffer ? "rawBody buffer" : "JSON.stringify fallback"}`
            );
          }
          return res.status(403).send("Invalid signature");
        } else {
          // Dev/staging — allow through with clear warning
          if (!hasSecretToVerify) {
            console.warn(`[Meta Webhook] DEV BYPASS: No app secret configured — allowed in non-production. Set META_APP_SECRET for production.`);
          } else {
            console.warn(`[Meta Webhook] DEV BYPASS: Signature verification failed — allowed in non-production. This would be rejected in production.`);
          }
        }
      } else {
        console.info(
          `[Meta Webhook] Signature verification: PASSED ${JSON.stringify({
            secretSource: matchedSecretSource || "unknown",
          })}`
        );
      }

      const incomingMessage = parseMetaIncomingWebhook(req.body);
      const statusUpdate = parseMetaStatusWebhook(req.body);

      // [Stage 2] Classify the payload by object type so downstream sections are easy to trace
      const webhookEntry0 = req.body.entry?.[0];
      const webhookHasMessaging = !!(webhookEntry0?.messaging?.length);
      devLog(`[Meta Webhook] [Stage 2] Object type: "${webhookObjectType}" | has messaging array: ${webhookHasMessaging} | WhatsApp parse: ${incomingMessage ? "YES" : "no"} | status-update parse: ${statusUpdate ? "YES" : "no"}`);

      if (incomingMessage) {
        devLog(`[Meta Webhook] [Stage 2a] WhatsApp inbound — from: ${incomingMessage.from}, type: ${incomingMessage.type}, messageId: ${incomingMessage.messageId}, phoneNumberId: ${incomingMessage.phoneNumberId}, profileName: "${incomingMessage.profileName}"`);
      } else if (!statusUpdate && !webhookHasMessaging) {
        devLog("[Meta Webhook] Payload is neither a message nor a status update — likely a notification event, ignoring");
      } else if (!incomingMessage && webhookHasMessaging) {
        devLog(`[Meta Webhook] [Stage 2b] Non-WhatsApp messaging payload detected — routing to ${webhookObjectType === 'instagram' ? 'Instagram' : webhookObjectType === 'page' ? 'Facebook' : webhookObjectType ?? 'unknown'} handler`);
      }

      // Process all inbound messages directly to DB — no queue dependency
      const { channelService: metaCs } = await import("./channelService");
      const directJobs: Promise<void>[] = [];

      // Capture processIncomingMessage result so post-ACK handlers can read
      // chatbotWillFire and isNewConversation without extra DB round-trips.
      let metaInboxResult: { chatbotWillFire: boolean; isNewConversation: boolean } | null = null;
      // Phase A: capture contact and conversationId from processIncomingMessage for Growth Engine
      let metaInboxContact: any = null;
      let metaInboxConversationId: string | null = null;

      if (incomingMessage) {
        const user = await findUserByMetaPhoneNumberId(incomingMessage.phoneNumberId);
        if (user) {
          devLog(`[Inbound] Webhook received — channel: whatsapp, from: ${incomingMessage.from}, messageId: ${incomingMessage.messageId}`);
          devLog(`[Inbound] Channel identified: whatsapp — userId: ${user.id}, starting processIncomingMessage`);
          directJobs.push(
            metaCs.processIncomingMessage({
              userId: user.id,
              channel: 'whatsapp',
              channelContactId: incomingMessage.from,
              contactName: incomingMessage.profileName || incomingMessage.from,
              content:
                (incomingMessage.text || incomingMessage.caption || '').trim() ||
                (incomingMessage.type === 'sticker'
                  ? 'Sticker received'
                  : incomingMessage.type !== 'text' && incomingMessage.mediaId
                    ? 'Media received'
                    : ''),
              contentType: incomingMessage.type === 'text' ? 'text' : incomingMessage.type,
              // Store Meta media ID in platform_media_id so the proxy can fetch it on demand
              platformMediaId: incomingMessage.mediaId,
              externalMessageId: incomingMessage.messageId,
            }).then((result) => {
              metaInboxResult = { chatbotWillFire: result.chatbotWillFire, isNewConversation: result.isNewConversation };
              metaInboxContact = result.contact;
              metaInboxConversationId = result.conversation?.id ?? null;
              if (!result.success || !result.contact || !result.conversation) {
                console.error("[inbound-processing] Meta WhatsApp processing returned incomplete state", {
                  messageId: incomingMessage.messageId,
                  userId: user.id,
                  errors: result.errors,
                });
              }
              devLog(`[Inbound] Webhook returned 200 — channel: whatsapp, messageId: ${incomingMessage.messageId}, userId: ${user.id}`);
            })
          );
        } else {
          console.warn(`[Meta Webhook] WARNING: No user found for phoneNumberId=${incomingMessage.phoneNumberId}. Message from ${incomingMessage.from} will be dropped.`);
          console.warn(`[Meta Webhook] Hint: Ensure the Meta phone number ID is correctly saved in the user's account settings.`);
        }
      }

      // [Stage 3] Parse Instagram Direct messages
      const igEntries: any[] = Array.isArray(req.body.entry) ? req.body.entry : [];
      if (req.body.object === 'instagram') {
        devLog(`[Meta Webhook] [Stage 3-IG] object=instagram, ${igEntries.length} entry(s)`);
      }
      for (const igEntry of igEntries) {
        const igEvents: any[] = Array.isArray(igEntry?.messaging) ? igEntry.messaging : [];
        if (!igEvents.length || req.body.object !== 'instagram') continue;

        devLog(`[Meta Webhook] [Stage 3-IG] Entry id=${igEntry?.id ?? null}, ${igEvents.length} messaging event(s)`);
        for (const event of igEvents) {
          if (event.message) {
            const senderId = event.sender?.id;
            const messageText = event.message.text || '';
            const messageId = event.message.mid;
            const attachments: any[] = Array.isArray(event.message.attachments) ? event.message.attachments : [];
            const hasContent = messageText.length > 0 || attachments.length > 0;

            devLog(`[Meta Webhook] [Stage 3-IG] Event: senderId=${senderId}, recipientId=${event.recipient?.id}, mid=${messageId}, text="${messageText.substring(0, 80)}", attachments=${attachments.length}`);

            if (senderId && hasContent) {
              const recipientId = event.recipient?.id;
              const allSettings = await db.select().from(channelSettings)
                .where(and(
                  eq(channelSettings.channel, 'instagram'),
                  eq(channelSettings.isConnected, true)
                ));

              devLog(`[Meta Webhook] [Stage 3-IG] Found ${allSettings.length} connected instagram channelSettings — looking for recipientId=${recipientId}`);
              allSettings.forEach((s, i) => {
                const cfg = s.config as any;
                devLog(`[Meta Webhook] [Stage 3-IG]   [${i}] userId=${s.userId}, pageId=${cfg?.pageId}, instagramAccountId=${cfg?.instagramAccountId}`);
              });

              const matchSetting = allSettings.find(s => {
                const config = s.config as any;
                return config?.pageId === recipientId || config?.instagramAccountId === recipientId;
              });

              if (matchSetting) {
                devLog(`[Meta Webhook] [Stage 3-IG] MATCHED channelSettings id=${matchSetting.id}, userId=${matchSetting.userId}`);
                devLog(`[Inbound] [Stage 4-IG] Webhook received — channel: instagram, from: ${senderId}, messageId: ${messageId}`);
                devLog(`[Inbound] [Stage 4-IG] Channel identified: instagram — userId: ${matchSetting.userId}, handing off to processIncomingMessage`);

                const firstAttachment = attachments[0] as any | undefined;
                const attachmentMediaUrl: string | undefined = firstAttachment?.payload?.url;
                const attachmentType: string | undefined = firstAttachment?.type;
                const content = messageText || firstAttachment?.payload?.title || '';
                const contentType = messageText ? 'text' : (attachmentType || 'attachment');

                devLog(`[Inbound] [Stage 4-IG] content="${content.substring(0, 60)}", contentType=${contentType}, hasMedia=${!!attachmentMediaUrl}, attachmentType=${attachmentType}`);

                const igAccessToken: string = (matchSetting.config as any)?.accessToken ?? '';
                const igProfile = igAccessToken
                  ? await fetchInstagramSenderProfile(senderId, igAccessToken)
                  : null;
                const igContactName = igProfile?.displayName || "Instagram User";
                directJobs.push(
                  metaCs.processIncomingMessage({
                    userId: matchSetting.userId,
                    channel: 'instagram',
                    channelContactId: senderId,
                    contactName: igContactName,
                    content,
                    contentType,
                    mediaUrl: attachmentMediaUrl,
                    attachmentType,
                    externalMessageId: messageId,
                  }).then(async (result) => {
                    if (!result.success || !result.contact || !result.conversation || !result.message) {
                      console.error("[inbound-processing] Instagram processing returned incomplete state", {
                        messageId,
                        userId: matchSetting.userId,
                        errors: result.errors,
                      });
                      return;
                    }
                    const contact = result.contact;
                    const conversation = result.conversation;
                    const message = result.message;
                    devLog(`[Inbound] [Stage 10-IG] Pipeline complete — channel: instagram, messageId: ${messageId}, contactId: ${contact.id}, conversationId: ${conversation.id}, messageId_db: ${message.id}, isNewConversation: ${result.isNewConversation}`);
                    const profilePatch = buildInstagramContactPatchFromProfile(contact, senderId, igProfile);
                    if (Object.keys(profilePatch).length > 0) {
                      await storage.updateContact(contact.id, profilePatch).catch((err) => {
                        console.warn("[Meta Webhook] [IG PROFILE] contact profile update failed", {
                          contactId: contact.id,
                          senderId,
                          error: err instanceof Error ? err.message : String(err),
                        });
                      });
                    }
                    // Fallback avatar-only refresh if profile fetch returned no picture and the cached avatar is stale.
                    if (igAccessToken && !igProfile?.profilePic) {
                      const { shouldRefreshAvatar, fetchInstagramAvatar } = await import("./avatarService");
                      if (shouldRefreshAvatar(contact)) {
                        fetchInstagramAvatar(contact.id, senderId, igAccessToken).catch(() => {});
                      }
                    }
                  })
                );
              } else {
                console.warn(`[Meta Webhook] [Stage 3-IG] LOOKUP FAILED — recipientId: ${recipientId}. No connected Instagram channelSettings record matched. Message from senderId=${senderId} is being DROPPED.`);
                console.warn(`[Meta Webhook] [Stage 3-IG] FIX: Go to Integrations → Instagram, enter your Page ID / Instagram Account ID (the one Meta calls as recipient="${recipientId}") and mark it connected.`);
                // Print a compact raw payload snippet for troubleshooting recipient id mismatches.
                console.warn("[Meta Webhook] [Stage 3-IG] rawBody snippet", rawBody.slice(0, 1200));
              }
            } else {
              devLog(`[Meta Webhook] [Stage 3-IG] Skipping event — senderId or content missing (senderId=${senderId}, textLen=${messageText.length}, attachments=${attachments.length})`);
            }
          }
        }
      } // end IG entries loop

      // [Stage 3] Parse Facebook Messenger messages
      // object=page covers all Messenger DMs to a Facebook Page
      if (req.body.object === 'page') {
        const fbEntries: any[] = Array.isArray(req.body.entry) ? req.body.entry : [];
        devLog(`[FB-WEBHOOK] received object=page entries=${fbEntries.length}`);
        devLog(`[Meta Webhook] [Stage 3-FB] object=page, ${fbEntries.length} entry(s)`);
        for (const fbEntry of fbEntries) {
          const fbPageId = fbEntry.id; // The Page that received the message
          const messagingEvents: any[] = Array.isArray(fbEntry.messaging) ? fbEntry.messaging : [];
          devLog(`[Meta Webhook] [Stage 3-FB] Entry pageId=${fbPageId}, ${messagingEvents.length} messaging event(s)`);

          for (const event of messagingEvents) {
            // Skip echo messages (messages the Page itself sent — these are outbound echoes)
            if (event.message?.is_echo) {
              devLog(`[Meta Webhook] [Stage 3-FB] Skipping echo message mid=${event.message?.mid}`);
              continue;
            }

            // Must be an actual message event
            if (!event.message) {
              devLog(`[Meta Webhook] [Stage 3-FB] Skipping non-message event (keys: ${Object.keys(event).join(",")})`);
              continue;
            }

            const senderId = event.sender?.id as string | undefined;
            const recipientId = event.recipient?.id as string | undefined; // This is the Page ID
            const messageId = event.message.mid as string | undefined;
            const messageText: string = event.message.text || '';
            const attachments: any[] = Array.isArray(event.message.attachments) ? event.message.attachments : [];
            const hasContent = messageText.length > 0 || attachments.length > 0;

            devLog(`[Meta Webhook] [Stage 3-FB] Event: senderId=${senderId} recipientId=${recipientId} mid=${messageId} text="${messageText.substring(0, 80)}" attachments=${attachments.length}`);
            // Some Instagram DM deliveries can surface via object="page" depending on product configuration.
            // If Meta sends any IG hints in the event, log them so we can adjust routing if needed.
            const igHints = {
              is_instagram: (event as any)?.is_instagram ?? null,
              instagram_scoped_id: (event as any)?.instagram_scoped_id ?? null,
              messageTags: (event as any)?.message?.tags ?? null,
            };
            if (igHints.is_instagram || igHints.instagram_scoped_id) {
              devLog("[Meta Webhook] [Stage 3-FB] Instagram-like event hints detected", {
                fbPageId,
                recipientId,
                senderId,
                mid: messageId,
                igHints,
              });
            }

            if (!senderId || !hasContent) {
              devLog(`[Meta Webhook] [Stage 3-FB] Skipping — no senderId or no content (senderId=${senderId}, hasContent=${hasContent})`);
              continue;
            }

            const allSettings = await db.select().from(channelSettings)
              .where(and(
                eq(channelSettings.channel, 'facebook'),
                eq(channelSettings.isConnected, true)
              ));

            devLog(`[Meta Webhook] [Stage 3-FB] Found ${allSettings.length} connected facebook channelSettings — looking for recipientId=${recipientId} or pageId=${fbPageId}`);
            allSettings.forEach((s, i) => {
              const cfg = s.config as any;
              devLog(`[Meta Webhook] [Stage 3-FB]   [${i}] userId=${s.userId}, pageId=${cfg?.pageId}`);
            });

            // Match by recipient ID (page ID in webhook) or entry page ID
            const matchSetting = allSettings.find(s => {
              const config = s.config as any;
              return config?.pageId === recipientId || config?.pageId === fbPageId;
            });

            if (!matchSetting) {
              console.warn(`[FB-WEBHOOK] no channel_settings match — recipientId=${recipientId} pageId=${fbPageId} senderId=${senderId} (dropped)`);
              console.warn(`[Meta Webhook] [Stage 3-FB] LOOKUP FAILED — no Facebook channelSettings matched recipientId=${recipientId} or pageId=${fbPageId}. Message from senderId=${senderId} DROPPED.`);
              continue;
            }

            const matchedConfig = matchSetting.config as any;
            devLog(`[FB-WEBHOOK] matched userId=${matchSetting.userId} pageId=${matchedConfig?.pageId} senderId=${senderId} mid=${messageId}`);
            devLog(`[Meta Webhook] [Stage 3-FB] MATCHED: channelSettings id=${matchSetting.id}, userId=${matchSetting.userId}, savedPageId=${matchedConfig?.pageId}`);

            // Resolve sender display name + profile picture via Graph API in one call
            let contactName = senderId;
            let fbProfilePic: string | undefined;
            try {
              const nameResp = await fetch(
                `https://graph.facebook.com/v19.0/${senderId}?fields=name,profile_pic&access_token=${encodeURIComponent(matchedConfig.accessToken)}`
              );
              const nameData = (await nameResp.json()) as any;
              if (nameResp.ok && nameData.name) {
                contactName = nameData.name as string;
                devLog(`[Meta Webhook] [Stage 3-FB] Resolved sender name: "${contactName}"`);
              } else {
                devLog(`[Meta Webhook] [Stage 3-FB] Could not resolve sender name (${nameData?.error?.message || 'no name field'}) — using PSID`);
              }
              if (nameResp.ok && typeof nameData.profile_pic === 'string') {
                fbProfilePic = nameData.profile_pic as string;
              }
            } catch {
              devLog(`[Meta Webhook] [Stage 3-FB] Name lookup failed — using PSID as contactName`);
            }

            // Derive content and media info
            const firstAttachment = attachments[0] as any | undefined;
            const attachmentMediaUrl: string | undefined = firstAttachment?.payload?.url;
            const content = messageText || firstAttachment?.payload?.title || '';
            const contentType = messageText ? 'text' : (firstAttachment?.type || 'attachment');

            devLog(`[Inbound] [Stage 4-FB] Handing off to processIncomingMessage — channel: facebook, from: ${senderId} ("${contactName}"), content: "${content.substring(0, 60)}", hasMedia: ${!!attachmentMediaUrl}`);
            directJobs.push(
              metaCs.processIncomingMessage({
                userId: matchSetting.userId,
                channel: 'facebook',
                channelContactId: senderId,
                contactName,
                content,
                contentType,
                mediaUrl: attachmentMediaUrl,
                attachmentType: firstAttachment?.type,
                externalMessageId: messageId,
              }).then(async (result) => {
                if (!result.success || !result.contact || !result.conversation || !result.message) {
                  console.error("[inbound-processing] Facebook processing returned incomplete state", {
                    messageId,
                    userId: matchSetting.userId,
                    errors: result.errors,
                  });
                  return;
                }
                devLog(`[FB-WEBHOOK] message saved contactId=${result.contact.id} conversationId=${result.conversation.id} dbMessageId=${result.message.id}`);
                devLog(`[Inbound] [Stage 10-FB] Pipeline complete — channel: facebook, mid=${messageId}, contactId=${result.contact.id}, conversationId=${result.conversation.id}, dbMessageId=${result.message.id}, isNew=${result.isNewConversation}`);
                // Update avatar if we got one from the Graph API call and it's due for refresh
                const { shouldRefreshAvatar } = await import("./avatarService");
                if (shouldRefreshAvatar(result.contact)) {
                  if (fbProfilePic) {
                    storage.updateContact(result.contact.id, { avatar: fbProfilePic, avatarFetchedAt: new Date() }).catch(() => {});
                  } else {
                    const { fetchFacebookAvatar } = await import("./avatarService");
                    fetchFacebookAvatar(result.contact.id, senderId, matchedConfig.accessToken).catch(() => {});
                  }
                }
              }).catch((err: any) => {
                console.error(`[FB-WEBHOOK] processIncomingMessage FAILED mid=${messageId}`, err?.message || err, err?.stack);
                console.error(`[Inbound] [Stage 10-FB] processIncomingMessage FAILED — mid=${messageId}, error:`, err?.message || err);
              })
            );
          }
        }
      }

      // All message processing completes before we ACK 200 to the provider
      if (directJobs.length > 0) {
        await Promise.all(directJobs);
      }

      res.status(200).send("EVENT_RECEIVED");

      // Process legacy chat write and other side effects asynchronously (non-critical)
      if (incomingMessage) {
        const user = await findUserByMetaPhoneNumberId(incomingMessage.phoneNumberId);
        if (user) {
          try {
            const chat = await findOrCreateChatByPhone(
              user.id,
              incomingMessage.from,
              incomingMessage.profileName || incomingMessage.from
            );

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

            await markMessageAsRead(user.id, incomingMessage.messageId);

            if (messages.length === 1 || incomingMessage.text) {
              const metaInboundText = incomingMessage.text || "";
              const metaBookingIntent = detectHighConfidenceBookingIntent(metaInboundText);
              dispatchInboundMessagingAutomation({
                userId: user.id,
                isNewChat: messages.length === 1,
                updatedChat: chat,
                messageBody: metaInboundText,
                contact: metaInboxContact ?? undefined,
                conversationId: metaInboxConversationId ?? "",
                skipKeywordWorkflows:
                  ((metaInboxResult as { chatbotWillFire: boolean } | null)?.chatbotWillFire ?? false) &&
                  !metaBookingIntent,
              }).catch((err) => console.error("[AutomationDispatcher] Meta inbound workflows:", err));
            }

            if (incomingMessage.text) {
              // W2 Financial Qualification Engine (Realtor Growth Engine)
              ;(async () => {
                try {
                  const install = await storage.getTemplateInstall(user.id, "realtor-growth-engine");
                  if (install?.installStatus === "installed") {
                    const chatbotHandlesReplyMeta = (metaInboxResult as { chatbotWillFire: boolean } | null)?.chatbotWillFire ?? false;
                    if (chatbotHandlesReplyMeta) {
                      devLog(`[W2] Outbound suppressed (Meta) — chatbot owns this reply for userId: ${user.id}`);
                    }

                    const freshChat = await storage.getChat(chat.id);
                    if (!freshChat) return;
                    const w2 = await runW2QualificationEngine(user.id, freshChat, incomingMessage.text!, metaInboxContact ?? undefined);
                    if (w2.signalsDetected.length > 0) {
                      devLog(`[W2] Signals detected for chat ${chat.id}: ${w2.signalsDetected.join(", ")} score+=${w2.scoreAdjustment}`);
                    }
                    try {
                      const routing = await runServiceRoutingEngine(user.id, freshChat, incomingMessage.text!, metaInboxContact ?? undefined);
                      const routingMsg = routing.offerMessage || routing.routingMessage;
                      if (!chatbotHandlesReplyMeta && metaInboxContact?.id && incomingMessage.from) {
                        const snap = metaInboxContact.lastIncomingAt ?? null;
                        const { scheduleW2FollowUpTimers } = await import("./automationTimerHandlers");
                        await scheduleW2FollowUpTimers({
                          userId: user.id,
                          contactId: metaInboxContact.id,
                          qualificationText: w2.qualificationQuestion || null,
                          routingText: routingMsg || null,
                          twilioDigits: undefined,
                          metaFrom: incomingMessage.from,
                          snapshotInboundAt: snap,
                        }).catch((e) => console.error("[W2] schedule timers (Meta):", e));
                      }
                      if (routing.tagsToApply.length > 0) {
                        const newTag = routing.tagsToApply[0];
                        try {
                          if (metaInboxContact) {
                            await storage.updateContact(metaInboxContact.id, { tag: newTag }).catch(() => {});
                            void import("./hubspotAutoSync").then(({ scheduleHubSpotAutoSync }) =>
                              scheduleHubSpotAutoSync(user.id, metaInboxContact.id)
                            );
                          }
                          await storage.updateChat(freshChat.id, { tag: newTag }).catch(() => {});
                          devLog(`[Routing] Tag applied (Meta): "${newTag}" for chat ${freshChat.id}`);
                        } catch (err) { console.error("[Routing] Failed to apply tag (Meta):", err); }
                      }
                      if (routing.taskNote) {
                        devLog(`[Routing] Internal task created for chat ${freshChat.id}: ${routing.taskNote}`);
                      }
                    } catch (err) { console.error("[Routing] Engine error (Meta):", err); }
                  }
                } catch (err) { console.error("[W2] Engine error (Meta):", err); }
              })();
            }

            // Auto-reply & Business Hours are now handled inside
            // channelService.processIncomingMessage for all channels.

            devLog("Meta message processed successfully");
          } catch (legacyErr) {
            console.error("Meta legacy chat write error (non-critical):", legacyErr);
          }
        }
      }

      if (statusUpdate) {
        devLog("Meta status update:", statusUpdate);
        const incomingRaw = String(statusUpdate.status || "").toLowerCase();
        const allowed = new Set(["sent", "delivered", "read", "failed"]);
        const incoming = allowed.has(incomingRaw)
          ? (incomingRaw as "sent" | "delivered" | "read" | "failed")
          : null;
        console.log(
          `[Meta WA Status] ${JSON.stringify({
            messageId: statusUpdate.messageId,
            status: statusUpdate.status,
            recipientId: statusUpdate.recipientId,
            phoneNumberId: statusUpdate.phoneNumberId,
            errorCode: statusUpdate.errorCode,
            errorTitle: statusUpdate.errorTitle,
            errorDetail: statusUpdate.errorDetail,
          })}`
        );
        if (incoming) {
          void (async () => {
            try {
              const owner = await findUserByMetaPhoneNumberId(statusUpdate.phoneNumberId);
              if (!owner) {
                console.warn(
                  `[Meta WA Status] No user for phone_number_id=${statusUpdate.phoneNumberId}`
                );
                return;
              }
              const row = await storage.getMessageByExternalId(statusUpdate.messageId);
              if (!row || row.userId !== owner.id) {
                console.warn(
                  `[Meta WA Status] No local message for wamid=${statusUpdate.messageId} (user=${owner.id})`
                );
                return;
              }
              const tsSec = Number(statusUpdate.timestamp);
              const ts = Number.isFinite(tsSec) ? new Date(tsSec * 1000) : new Date();
              const cur = (row.status || "pending").toLowerCase();

              if (incoming === "failed") {
                const errLine = formatMetaTemplateDeliveryFailureLine({
                  errorTitle: statusUpdate.errorTitle,
                  errorDetail: statusUpdate.errorDetail,
                  errorCode: statusUpdate.errorCode,
                });
                console.warn(
                  `[Meta WA Status] template_or_media_failure persisted ${JSON.stringify({
                    messageId: statusUpdate.messageId,
                    localMessageId: row.id,
                    errorCode: statusUpdate.errorCode,
                  })}`
                );
                await storage.updateMessage(row.id, {
                  status: "failed",
                  errorMessage: errLine,
                  errorCode: statusUpdate.errorCode != null ? String(statusUpdate.errorCode) : undefined,
                });

                const contentType = String(row.contentType || "").toLowerCase();
                const isOutboundTemplate =
                  row.direction === "outbound" && contentType === "template";
                if (isOutboundTemplate) {
                  try {
                    const conv = await storage.getConversation(row.conversationId);
                    if (conv && conv.userId === owner.id) {
                      const ch = (conv.channel || "").toLowerCase();
                      if (ch === "whatsapp") {
                        const re = parseConversationReEngagement(conv.reEngagement);
                        if (re?.state !== "blocked") {
                          const hint = reEngagementTemplateDeliveryFailureHint({
                            errorTitle: statusUpdate.errorTitle,
                            errorDetail: statusUpdate.errorDetail,
                            errorCode: statusUpdate.errorCode,
                          });
                          const prev: ConversationReEngagement =
                            re ??
                            ({
                              state: "template_sent_awaiting_reply",
                              lastTemplateName: retargetTemplateNameFromOutboundMessage(row) ?? undefined,
                              lastTemplateSentAt: row.sentAt
                                ? new Date(row.sentAt).toISOString()
                                : row.createdAt
                                  ? new Date(row.createdAt).toISOString()
                                  : new Date().toISOString(),
                              lastTemplateStatus: "sent",
                            } as ConversationReEngagement);
                          await storage.updateConversation(row.conversationId, {
                            reEngagement: buildReEngagementAfterMetaDeliveryFailure(prev, {
                              errorCode: statusUpdate.errorCode,
                              userHint: hint,
                            }) as Conversation["reEngagement"],
                          });
                        }
                      }
                    }
                  } catch (reErr) {
                    console.error("[Meta WA Status] re-engagement sync after template failure", reErr);
                  }
                }
                return;
              }

              const patch: Record<string, unknown> = {};
              if (incoming === "read") {
                patch.status = "read";
                patch.readAt = ts;
              } else if (incoming === "delivered") {
                if (cur !== "read") {
                  patch.status = "delivered";
                  patch.deliveredAt = ts;
                }
              } else if (incoming === "sent") {
                if (cur !== "delivered" && cur !== "read") {
                  patch.status = "sent";
                  if (!row.sentAt) patch.sentAt = ts;
                }
              }

              if (Object.keys(patch).length > 0) {
                await storage.updateMessage(row.id, patch as Partial<Message>);
              }
            } catch (e) {
              console.error("[Meta WA Status] persist error", e);
            }
          })();
        }
      }
    } catch (error) {
      console.error("Meta webhook error:", error);
    }
  });

  // ============= Subscription Endpoints =============

  const blockStripeForShopify = (req: Request, res: Response, context: string) =>
    rejectStripeIfShopifyUser(req, res, context, (id) => storage.getUser(id));

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
      // IMPORTANT: use full user row for accurate trial/AI entitlement state.
      const user = await storage.getUserForSession(req.user.id);
      const usersCount = await storage.getTeamMemberCount(req.user.id);
      const now = new Date();

      const shopQuery = typeof req.query.shop === "string" ? req.query.shop.trim() : "";
      const shopQueryLooksShopify = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shopQuery);
      const isShopify = !!(user?.shopifyShop) || shopQueryLooksShopify;
      const paidProOrAi = user ? hasActivePaidPlan(user, now) : false;
      const showTrialUrgency =
        !!limits?.isInTrial && !paidProOrAi && (user?.trialPlan || "pro_ai") === "pro_ai";

      const response = {
        limits: limits
          ? {
              ...limits,
              conversationsLimit: limits.conversationsLimit,
              conversationsUsed: limits.conversationsUsed,
              isLifetimeLimit: limits.isLifetimeLimit,
              usersCount,
              usersLimit: limits.maxUsers,
              maxWhatsappNumbers: limits.maxWhatsappNumbers,
              planName: limits.planName,
              plan: limits.plan,
              effectivePlan: limits.plan,
              effectiveHasAIBrain: limits.effectiveHasAIBrain,
            }
          : null,
        subscription: user
          ? {
              plan: user.subscriptionPlan,
              subscriptionPlan: user.subscriptionPlan,
              effectivePlan: limits?.plan ?? "free",
              subscriptionStatus: user.subscriptionStatus,
              currentPeriodEnd: user.currentPeriodEnd,
              hasAIBrainAddon: limits?.hasAIBrainAddon ?? false,
              effectiveHasAIBrain: limits?.effectiveHasAIBrain ?? false,
              trialStatus: computeTrialStatus(user, now),
              trialStartedAt: user.trialStartedAt,
              trialEndsAt: user.trialEndsAt,
              trialDaysRemaining: limits?.trialDaysRemaining ?? 0,
              trialIncludesAIBrain: isProAiTrialActive(user, now),
              trialPlan: user.trialPlan ?? null,
              isShopify,
              upgradeProvider: isShopify ? ("shopify" as const) : ("stripe" as const),
              shopifyBillingTrialDays: isShopify ? 14 : undefined,
              /** Hide countdown promotions when user already pays for Pro (or higher). */
              isPaidSubscriber: paidProOrAi,
              showTrialUrgency,
            }
          : null,
      } as const;

      console.log(
        `[SubscriptionResponse] ${JSON.stringify({
          userId: req.user.id,
          plan: response?.limits?.plan ?? "free",
          effectivePlan: response?.subscription?.effectivePlan ?? response?.limits?.plan ?? "free",
          trialActive: !!response?.limits?.isInTrial,
          trialEndsAt: response?.subscription?.trialEndsAt ?? null,
          hasAIBrainAddon: !!response?.limits?.hasAIBrainAddon,
          aiEnabled: !!response?.limits?.effectiveHasAIBrain,
          growthEngineEligible: !!response?.limits?.growthEngineEligible,
          overrides: limits
            ? {
                planOverrideEnabled: limits.planOverrideEnabled,
                planOverride: limits.planOverride,
                aiBrainEntitlementOverrideEnabled: limits.aiBrainEntitlementOverrideEnabled,
                aiBrainEntitlementOverrideGrant: limits.aiBrainEntitlementOverrideGrant,
                growthEngineEntitlementOverrideEnabled: limits.growthEngineEntitlementOverrideEnabled,
                growthEngineEntitlementOverrideGrant: limits.growthEngineEntitlementOverrideGrant,
              }
            : null,
        })}`,
      );

      res.json(response);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  // Debug endpoint: current user's subscription + Stripe price IDs (safe)
  app.get("/api/subscription/debug", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      const effectivePlan = limits?.plan || "free";

      let stripePriceIds: string[] | null = null;
      try {
        const stripe = await getUncachableStripeClient();
        const ids = new Set<string>();

        if (user.stripeCustomerId) {
          const subs = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            status: "active",
            expand: ["data.items.data.price"],
            limit: 25,
          });
          for (const sub of subs.data) {
            for (const it of sub.items?.data || []) {
              const pid = (it as any)?.price?.id;
              if (pid) ids.add(pid);
            }
          }
        }

        if (user.stripeSubscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
            expand: ["items.data.price"],
          } as any);
          const items = subscription?.items?.data || [];
          for (const it of items) {
            const pid = (it as any)?.price?.id;
            if (pid) ids.add(pid);
          }
        }

        stripePriceIds = [...ids];
      } catch (err: any) {
        console.error("[Subscription Debug] Stripe lookup failed:", {
          userId: user.id,
          stripeCustomerId: user.stripeCustomerId,
          stripeSubscriptionId: user.stripeSubscriptionId,
          message: err?.message,
        });
        stripePriceIds = null;
      }

      return res.json({
        userId: user.id,
        email: user.email,
        billingPlan: user.billingPlan,
        planOverride: user.planOverride,
        planOverrideEnabled: user.planOverrideEnabled,
        effectivePlan,
        subscriptionPlanLegacy: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: user.stripeSubscriptionId,
        currentPeriodEnd: user.currentPeriodEnd,
        shopifyAIBrainEnabled: user.shopifyAIBrainEnabled,
        hasAIBrainAddon: limits?.hasAIBrainAddon ?? false,
        aiBrainSource: limits?.aiBrainSource ?? "none",
        aiBrainBasePlanEligible: limits?.aiBrainBasePlanEligible ?? false,
        growthEngineEligible: limits?.growthEngineEligible ?? false,
        stripeSubscriptionItemPriceIds: stripePriceIds,
      });
    } catch (error: any) {
      console.error("[Subscription Debug] Error:", error?.message || error);
      return res.status(500).json({ error: "Failed to load subscription debug" });
    }
  });

  // Create checkout session for upgrading
  app.post("/api/subscription/checkout", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (await blockStripeForShopify(req, res, "subscription/checkout")) return;

      const { planId, billingInterval, redirectTo, cancelTo } = req.body as {
        planId?: string;
        billingInterval?: "monthly" | "yearly";
        redirectTo?: string;
        cancelTo?: string;
      };

      if (!planId || !["starter", "pro"].includes(planId)) {
        return res.status(400).json({ error: "Invalid plan" });
      }

      if (billingInterval && !["monthly", "yearly"].includes(billingInterval)) {
        return res.status(400).json({ error: "Invalid billing interval" });
      }

      const baseUrl = getAppOrigin() || `${req.protocol}://${req.get('host')}`;
      const successPath = sanitizeStripeReturnPath(redirectTo, "/app/inbox");
      const cancelPath = sanitizeStripeReturnPath(cancelTo ?? redirectTo, successPath);
      const result = await subscriptionService.createCheckoutSession(
        req.user.id,
        planId,
        baseUrl,
        billingInterval || "monthly",
        { successReturnPath: successPath, cancelReturnPath: cancelPath }
      );
      res.json(result);
    } catch (error: any) {
      console.error("Error creating checkout:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout" });
    }
  });

  app.post("/api/subscription/checkout/pro-ai", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (await blockStripeForShopify(req, res, "subscription/checkout/pro-ai")) return;

      const { redirectTo, cancelTo } = (req.body || {}) as { redirectTo?: string; cancelTo?: string };
      const baseUrl = getAppOrigin() || `${req.protocol}://${req.get('host')}`;
      const successPath = sanitizeStripeReturnPath(
        redirectTo,
        "/app/templates/realtor-growth-engine",
      );
      const cancelPath = sanitizeStripeReturnPath(cancelTo ?? redirectTo, successPath);
      const result = await subscriptionService.createProPlusAICheckoutSession(req.user.id, baseUrl, {
        successReturnPath: successPath,
        cancelReturnPath: cancelPath,
      });
      res.json(result);
    } catch (error: any) {
      console.error("Error creating Pro+AI checkout:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout" });
    }
  });

  // Starter or Pro monthly + AI Brain bundle (effective plan Free only)
  app.post("/api/subscription/checkout/plan-ai-bundle", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (await blockStripeForShopify(req, res, "subscription/checkout/plan-ai-bundle")) return;

      const { plan, redirectTo, cancelTo } = (req.body || {}) as {
        plan?: string;
        redirectTo?: string;
        cancelTo?: string;
      };
      if (plan !== "starter" && plan !== "pro") {
        return res.status(400).json({ error: "plan must be starter or pro" });
      }

      const baseUrl = getAppOrigin() || `${req.protocol}://${req.get("host")}`;
      const successPath = sanitizeStripeReturnPath(redirectTo, "/app/ai-brain");
      const cancelPath = sanitizeStripeReturnPath(cancelTo ?? redirectTo, successPath);
      const result = await subscriptionService.createPlanAIBundleCheckoutSession(
        req.user.id,
        plan,
        baseUrl,
        { successReturnPath: successPath, cancelReturnPath: cancelPath },
      );
      res.json(result);
    } catch (error: any) {
      console.error("Error creating plan + AI bundle checkout:", error);
      if (error?.code === "PLAN_AI_BUNDLE_NOT_FREE") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || "Failed to create checkout" });
    }
  });

  // Create checkout session for AI Brain add-on ($29/mo)
  app.post("/api/subscription/addon/ai-brain", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (await blockStripeForShopify(req, res, "subscription/addon/ai-brain")) return;

      const baseUrl = getAppOrigin() || `${req.protocol}://${req.get('host')}`;
      const { redirectTo, cancelTo } = (req.body || {}) as { redirectTo?: string; cancelTo?: string };
      const successPath = sanitizeStripeReturnPath(redirectTo, "/app/ai-brain");
      const cancelPath = sanitizeStripeReturnPath(cancelTo ?? redirectTo, successPath);

      console.log("[AI Brain Checkout] ENV/Host:", {
        host: req.get("host"),
        "x-forwarded-host": req.headers["x-forwarded-host"],
        "x-forwarded-proto": req.headers["x-forwarded-proto"],
        APP_URL: process.env.APP_URL,
        MARKETING_URL: process.env.MARKETING_URL,
        STRIPE_SECRET_KEY_exists: !!process.env.STRIPE_SECRET_KEY,
        STRIPE_SECRET_KEY_prefix8: process.env.STRIPE_SECRET_KEY?.slice(0, 8),
        STRIPE_AI_BRAIN_MONTHLY_PRICE_ID: process.env.STRIPE_AI_BRAIN_MONTHLY_PRICE_ID,
      });

      const result = await subscriptionService.createAddonCheckoutSession(req.user.id, baseUrl, {
        successReturnPath: successPath,
        cancelReturnPath: cancelPath,
      });
      res.json(result);
    } catch (error: any) {
      console.error("Error creating AI Brain add-on checkout:", error);
      if (error?.code === "AI_BRAIN_PLAN_INELIGIBLE") {
        return res.status(400).json({ error: error.message });
      }
      if (error?.code === "AI_BRAIN_TRIAL_INCLUDES_BRAIN") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || "Failed to create checkout" });
    }
  });

  // Create customer portal session for managing subscription
  app.post("/api/subscription/portal", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (await blockStripeForShopify(req, res, "subscription/portal")) return;

      const returnUrl = `${resolveStripeCheckoutRedirectOrigin(getAppOrigin())}/app/settings`;
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
      if (await blockStripeForShopify(req, res, "subscription/cancel")) return;

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
        return res.status(403).json({ error: "Automations require Starter or Pro", upgradeRequired: true });
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
        return res.status(403).json({ error: "Automations require Starter or Pro", upgradeRequired: true });
      }
      const { name, description, triggerType, triggerConditions, actions } = req.body;
      if (!name || !triggerType) {
        return res.status(400).json({ error: "Name and trigger type are required" });
      }
      const tc = triggerConditions || {};
      if (
        isGrowthEngineWorkflow({
          triggerConditions: tc,
          description: description || null,
        })
      ) {
        const ge = await evaluateGrowthEngineAccess(req.user.id);
        if (!ge.ok) {
          return res.status(403).json({
            error: ge.message,
            code: ge.reason,
            growthEngine: true,
            hasPro: ge.hasProTier,
            hasAI: ge.hasAIBrainAddon,
            workflowsEnabled: ge.workflowsEnabled,
          });
        }
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
      const nextIsActive = req.body.isActive !== undefined ? req.body.isActive : workflow.isActive;
      const activating = nextIsActive === true && workflow.isActive === false;
      if (activating) {
        const nextTriggerConditions =
          req.body.triggerConditions !== undefined
            ? { ...(workflow.triggerConditions as object), ...req.body.triggerConditions }
            : workflow.triggerConditions;
        const nextWorkflow = {
          ...workflow,
          ...req.body,
          triggerConditions: nextTriggerConditions,
          isActive: nextIsActive,
        };
        if (isGrowthEngineWorkflow(nextWorkflow)) {
          const ge = await evaluateGrowthEngineAccess(req.user.id);
          if (!ge.ok) {
            return res.status(403).json({
              error: ge.message,
              code: ge.reason,
              growthEngine: true,
              hasPro: ge.hasProTier,
              hasAI: ge.hasAIBrainAddon,
              workflowsEnabled: ge.workflowsEnabled,
            });
          }
        }
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
        return res.status(403).json({ error: "Automations require Starter or Pro", upgradeRequired: true });
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
        return res.status(403).json({ error: "Automations require Starter or Pro", upgradeRequired: true });
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
        return res.status(403).json({ error: "This feature requires Starter or Pro", upgradeRequired: true });
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
      const userId = req.user.id;
      const searchPattern = `%${query}%`;
      const queryLower = query.toLowerCase();
      const seen = new Set<string>(); // dedup by contactId
      const results: any[] = [];

      // ── NEW SYSTEM: search messages table joined with contacts ──────────
      // One result per contact (most recent matching message wins)
      const newMsgRows = await db
        .selectDistinctOn([messagesTable.contactId], {
          contactId:     messagesTable.contactId,
          content:       messagesTable.content,
          createdAt:     messagesTable.createdAt,
          contactName:   contactsTable.name,
          avatar:        contactsTable.avatar,
          tag:           contactsTable.tag,
          pipelineStage: contactsTable.pipelineStage,
        })
        .from(messagesTable)
        .innerJoin(contactsTable, eq(messagesTable.contactId, contactsTable.id))
        .where(
          and(
            eq(messagesTable.userId, userId),
            isNotNull(messagesTable.content),
            ilike(messagesTable.content, searchPattern)
          )
        )
        .orderBy(messagesTable.contactId, desc(messagesTable.createdAt))
        .limit(50);

      for (const row of newMsgRows) {
        if (seen.has(row.contactId)) continue;
        seen.add(row.contactId);
        const text = row.content || '';
        results.push({
          chatId:        row.contactId,
          chatName:      row.contactName,
          avatar:        row.avatar,
          matchedText:   text.length > 150 ? text.substring(0, 150) + '...' : text,
          timestamp:     row.createdAt?.toISOString() ?? '',
          pipelineStage: row.pipelineStage ?? '',
          tag:           row.tag ?? '',
        });
      }

      // ── NEW SYSTEM: search contacts by name / notes ─────────────────────
      const contactRows = await db
        .select()
        .from(contactsTable)
        .where(
          and(
            eq(contactsTable.userId, userId),
            or(
              ilike(contactsTable.name, searchPattern),
              ilike(contactsTable.notes, searchPattern)
            )
          )
        )
        .limit(30);

      for (const ct of contactRows) {
        if (seen.has(ct.id)) continue;
        seen.add(ct.id);
        const isNoteMatch = ct.notes && ct.notes.toLowerCase().includes(queryLower);
        results.push({
          chatId:        ct.id,
          chatName:      ct.name,
          avatar:        ct.avatar ?? '',
          matchedText:   isNoteMatch
            ? `Note: ${(ct.notes!.length > 150 ? ct.notes!.substring(0, 150) + '...' : ct.notes!)}`
            : ct.name,
          timestamp:     ct.updatedAt?.toISOString() ?? '',
          pipelineStage: ct.pipelineStage ?? '',
          tag:           ct.tag ?? '',
        });
      }

      // ── LEGACY SYSTEM: search old chats table (backward compat) ─────────
      const oldChats = await storage.searchMessages(userId, query);
      const allContacts = await storage.getContacts(userId);
      const contactByPhone = new Map(
        allContacts
          .filter(c => c.whatsappId || c.phone)
          .map(c => [(c.whatsappId || c.phone || '').replace(/\D/g, ''), c])
      );

      for (const chat of oldChats) {
        const rawPhone = ((chat as any).whatsappPhone || "") as string;
        const norm = isLegacyCalendlyWorkflowChat(rawPhone) ? "" : rawPhone.replace(/\D/g, "");
        const ct = norm ? contactByPhone.get(norm) : undefined;
        const resolvedId = ct?.id || chat.id;

        // Skip if already covered by the new system
        if (seen.has(resolvedId)) continue;

        const chatMessages = (chat.messages as any[]) || [];
        let added = false;
        for (const msg of chatMessages) {
          if (msg.text && msg.text.toLowerCase().includes(queryLower)) {
            seen.add(resolvedId);
            results.push({
              chatId:        resolvedId,
              chatName:      ct?.name ?? chat.name,
              avatar:        ct?.avatar ?? chat.avatar,
              matchedText:   msg.text.length > 150 ? msg.text.substring(0, 150) + '...' : msg.text,
              timestamp:     msg.time || chat.time || '',
              pipelineStage: ct?.pipelineStage ?? chat.pipelineStage ?? '',
              tag:           ct?.tag ?? chat.tag ?? '',
            });
            added = true;
            break; // one result per legacy chat
          }
        }
        if (!added) {
          const notes = ct?.notes ?? chat.notes;
          if (notes && notes.toLowerCase().includes(queryLower)) {
            seen.add(resolvedId);
            results.push({
              chatId:        resolvedId,
              chatName:      ct?.name ?? chat.name,
              avatar:        ct?.avatar ?? chat.avatar,
              matchedText:   `Note: ${notes.length > 150 ? notes.substring(0, 150) + '...' : notes}`,
              timestamp:     chat.time || '',
              pipelineStage: ct?.pipelineStage ?? chat.pipelineStage ?? '',
              tag:           ct?.tag ?? chat.tag ?? '',
            });
          } else if (chat.name.toLowerCase().includes(queryLower)) {
            seen.add(resolvedId);
            results.push({
              chatId:        resolvedId,
              chatName:      ct?.name ?? chat.name,
              avatar:        ct?.avatar ?? chat.avatar,
              matchedText:   chat.lastMessage || 'No recent messages',
              timestamp:     chat.time || '',
              pipelineStage: ct?.pipelineStage ?? chat.pipelineStage ?? '',
              tag:           ct?.tag ?? chat.tag ?? '',
            });
          }
        }
      }

      res.json(results.slice(0, 50));
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
  const SENSITIVE_CONFIG_KEYS = [
    "accessToken",
    "secretKey",
    "privateKey",
    "clientSecret",
    "refreshToken",
    "apiKey",
    "webhookSecret",
    "webhookSigningKey",
    "consumerKey",
    "consumerSecret",
  ];

  // Startup backfill: repair any existing Facebook/Instagram integrations that
  // pre-date the dual-write fix and never populated channelSettings.
  async function backfillFacebookInstagramChannelSettings() {
    try {
      const types = ['meta_facebook', 'meta_instagram'];
      let repaired = 0;
      for (const type of types) {
        const integrations = await storage.getIntegrationsByType(type);
        for (const integration of integrations) {
          if (!integration.isActive) continue;
          const channel = type === 'meta_facebook' ? 'facebook' : 'instagram';
          const existing = await storage.getChannelSetting(integration.userId, channel as any);
          if (existing) continue; // already has a record (connected or pending) — never overwrite

          const rawConfig = integration.config as Record<string, any>;
          const decryptedConfig = decryptIntegrationConfig(rawConfig);

          const channelConfig: Record<string, string> = {
            accessToken: decryptedConfig.accessToken || '',
            pageId: type === 'meta_facebook'
              ? (decryptedConfig.pageId || '')
              : (decryptedConfig.instagramId || decryptedConfig.pageId || ''),
          };
          if (type === 'meta_instagram') {
            channelConfig.instagramAccountId = decryptedConfig.instagramId || decryptedConfig.pageId || '';
          }
          if (decryptedConfig.appSecret) channelConfig.appSecret = decryptedConfig.appSecret;

          if (!channelConfig.accessToken || !channelConfig.pageId) {
            console.warn(`[Backfill] Skipping ${channel} for userId=${integration.userId} — incomplete credentials in integrations record`);
            continue;
          }

          await storage.upsertChannelSetting(integration.userId, channel as any, {
            isConnected: true,
            isEnabled: true,
            config: channelConfig,
          });
          console.log(`[Backfill] ${channel} channelSettings created for userId=${integration.userId} — pageId: ${channelConfig.pageId}`);
          repaired++;
        }
      }
      if (repaired > 0) {
        console.log(`[Backfill] Completed: repaired ${repaired} Facebook/Instagram channelSettings record(s)`);
      } else {
        console.log(`[Backfill] No Facebook/Instagram channelSettings repairs needed`);
      }
    } catch (err) {
      console.error('[Backfill] Error during Facebook/Instagram channelSettings backfill:', err);
    }
  }

  // Startup backfill: fix Instagram channelSettings where pageId was incorrectly stored
  // as the Instagram account ID instead of the Facebook Page ID.
  // Detects the condition by checking if config.pageId === config.instagramAccountId.
  // Uses the stored page access token to call /me to discover the real Facebook Page ID.
  async function backfillInstagramPageId() {
    try {
      const allIgSettings = await db
        .select()
        .from(channelSettings)
        .where(eq(channelSettings.channel, 'instagram'));

      let fixed = 0;
      for (const row of allIgSettings) {
        const cfg = row.config as Record<string, any> | null;
        if (!cfg) continue;
        const { pageId, instagramAccountId, accessToken } = cfg;
        // Skip rows that don't have the wrong condition
        if (!pageId || !instagramAccountId || !accessToken) continue;
        if (pageId !== instagramAccountId) continue;

        // pageId is wrong — it holds the IG account ID. Resolve the real Facebook Page ID.
        try {
          const meResp = await fetch(
            `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
          );
          const meData = (await meResp.json()) as any;
          if (!meResp.ok || !meData?.id) {
            console.warn(`[Backfill:PageId] Could not resolve real pageId for userId=${row.userId} — /me error: ${meData?.error?.message}`);
            continue;
          }
          const realPageId: string = meData.id;
          if (realPageId === instagramAccountId) {
            console.warn(`[Backfill:PageId] /me returned same ID as instagramAccountId for userId=${row.userId} — token may be a user token, skipping`);
            continue;
          }
          // Update the stored config with the correct Facebook Page ID
          const updatedConfig = { ...cfg, pageId: realPageId };
          await db.update(channelSettings).set({ config: updatedConfig }).where(eq(channelSettings.id, row.id));
          console.log(`[Backfill:PageId] Fixed Instagram channelSettings for userId=${row.userId}: pageId ${pageId} → ${realPageId}`);
          fixed++;
        } catch (e: any) {
          console.warn(`[Backfill:PageId] Error fixing pageId for userId=${row.userId}:`, e.message);
        }
      }
      if (fixed > 0) {
        console.log(`[Backfill:PageId] Done — fixed ${fixed} Instagram channelSettings record(s)`);
      } else {
        console.log(`[Backfill:PageId] No Instagram pageId repairs needed`);
      }
    } catch (err) {
      console.error('[Backfill:PageId] Error during Instagram pageId backfill:', err);
    }
  }

  async function runBackfills() {
    const { applyStartupSchemaPatches } = await import("./startupSchemaPatches");
    const { publicListingSchemaReady } = await applyStartupSchemaPatches();
    if (!publicListingSchemaReady) {
      console.error(
        "[Startup] Public listing and agent page routes will return 503 until schema patches 0045–0047 succeed",
      );
    }
    await backfillFacebookInstagramChannelSettings();
    await backfillInstagramPageId();
  }

  // IMPORTANT: Do not run backfills during route registration (startup import/init).
  // We register the runner so `server/index.ts` can invoke it after the server is listening.
  (app as any).locals.runBackfills = runBackfills;
  
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

  function calendlyErrorMessage(
    data: { message?: string; title?: string; details?: { message?: string }[] } | undefined,
    fallback: string
  ): string {
    return data?.message || data?.title || (Array.isArray(data?.details) && data.details[0]?.message) || fallback;
  }

  function isCalendlyExistingHookError(data: unknown, rawBody = ""): boolean {
    const text = `${JSON.stringify(data || {})} ${rawBody}`.toLowerCase();
    return text.includes("hook with this url already exists") || (text.includes("hook") && text.includes("url already exists"));
  }

  function maskCalendlyWebhookResponse(data: any) {
    if (!data?.resource || typeof data.resource !== "object") return data;
    return {
      ...data,
      resource: {
        ...data.resource,
        signing_key: data.resource.signing_key ? "[present]" : undefined,
      },
    };
  }

  async function resolveCalendlyExistingHook(params: {
    token: string;
    orgUri: string;
    webhookUrl: string;
    requestedSigningKey: string;
    log: (event: string, payload: Record<string, unknown>) => void;
  }): Promise<
    | { ok: true; uri: string; signingKey: string; events: string[]; recreated: boolean; message: string }
    | { ok: false; error: string }
  > {
    const requiredEvents = ["invitee.created", "invitee.canceled"];
    const listed = await calendlyListWebhookSubscriptions(params.token, params.orgUri);
    const hooks = listed.data?.collection || [];
    const existing = hooks.find((h) => h.callback_url === params.webhookUrl);
    params.log("existing_hook_found", {
      ok: listed.ok,
      status: listed.status,
      count: hooks.length,
      callbackUrlUsed: params.webhookUrl,
      found: Boolean(existing),
      existingEvents: existing?.events || [],
      hasInviteeCreated: existing?.events?.includes("invitee.created") || false,
      hasInviteeCanceled: existing?.events?.includes("invitee.canceled") || false,
      hasInviteeRescheduled: existing?.events?.includes("invitee.rescheduled") || false,
    });
    if (!listed.ok || !existing?.uri) {
      return { ok: false, error: "Calendly says the webhook exists, but it could not be listed. Check token webhook scopes." };
    }

    const existingEvents = Array.isArray(existing.events) ? existing.events : [];
    const hasRequiredEvents = requiredEvents.every((e) => existingEvents.includes(e));
    const detailed = await calendlyGetWebhookSubscription(params.token, existing.uri);
    const detailedSigningKey = detailed.data?.resource?.signing_key || "";

    if (hasRequiredEvents && detailedSigningKey) {
      params.log("existing_hook_linked", {
        uri: existing.uri,
        events: existingEvents,
        signingKeyRecovered: true,
        hasInviteeRescheduled: existingEvents.includes("invitee.rescheduled"),
      });
      return {
        ok: true,
        uri: existing.uri,
        signingKey: detailedSigningKey,
        events: existingEvents,
        recreated: false,
        message: "Existing Calendly webhook found and linked.",
      };
    }

    const reason = !hasRequiredEvents ? "missing_required_events" : "missing_signing_key";
    const del = await calendlyDeleteWebhookSubscription(params.token, existing.uri);
    params.log("existing_hook_recreated_if_needed", {
      oldUri: existing.uri,
      reason,
      deleteOk: del.ok,
      deleteStatus: del.status,
    });
    if (!del.ok) {
      return {
        ok: false,
        error: "Existing Calendly webhook needs repair, but Calendly did not allow deleting it. Remove the webhook in Calendly or reconnect Calendly.",
      };
    }

    const recreated = await calendlyCreateWebhookSubscription(params.token, {
      url: params.webhookUrl,
      events: requiredEvents,
      organization: params.orgUri,
      scope: "organization",
      signing_key: params.requestedSigningKey,
    });
    params.log("existing_hook_recreated_if_needed", {
      recreateOk: recreated.ok,
      recreateStatus: recreated.status,
      callbackUrlUsed: params.webhookUrl,
      events: requiredEvents,
      response: maskCalendlyWebhookResponse(recreated.data),
    });
    if (!recreated.ok || !recreated.data?.resource?.uri) {
      return { ok: false, error: calendlyErrorMessage(recreated.data as any, "Calendly webhook recreation failed.") };
    }
    return {
      ok: true,
      uri: recreated.data.resource.uri,
      signingKey: recreated.data.resource.signing_key || params.requestedSigningKey,
      events: requiredEvents,
      recreated: true,
      message: "Existing Calendly webhook found and linked.",
    };
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

  // ── Meta OAuth flow ──────────────────────────────────────────────────────

  // GET /api/integrations/meta/auth-url?channel=facebook|instagram
  // Returns the Meta OAuth redirect URL. Stores CSRF state in session.
  app.get("/api/integrations/meta/auth-url", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const channel = req.query.channel as string;
      if (channel !== "facebook" && channel !== "instagram") {
        return res.status(400).json({ error: "channel must be facebook or instagram" });
      }
      const { buildMetaOAuthUrl } = await import("./metaOAuth");
      const appUrl = getAppOrigin().replace(/\/+$/, "");
      // Dedicated stable callbacks per channel (must be in Meta “Valid OAuth Redirect URIs”)
      const redirectUri =
        channel === "facebook"
          ? `${appUrl}/api/integrations/facebook/callback`
          : `${appUrl}/api/integrations/instagram/callback`;
      const stateToken = crypto.randomBytes(16).toString("hex");
      (req.session as any).metaOAuthState = { stateToken, channel, userId: req.user.id, redirectUri };
      console.log("[Meta OAuth] auth-url", {
        channel,
        redirectUri,
        host: req.get("host"),
        origin: req.get("origin") || req.get("referer") || null,
      });
      const url = buildMetaOAuthUrl(`${stateToken}:${channel}`, redirectUri, channel as "facebook" | "instagram");
      res.json({ url, redirectUri });
    } catch (err: any) {
      console.error("[Meta OAuth] auth-url error:", err);
      res.status(500).json({ error: err.message || "Failed to build OAuth URL" });
    }
  });

  async function handleMetaOAuthCallback(req: any, res: any, callbackHint: "facebook" | "instagram" | "legacy_meta") {
    try {
      const { code, state, error: oauthError } = req.query as Record<string, string>;

      if (oauthError) {
        return res.redirect(`/app/settings?meta_oauth=denied`);
      }
      if (!code || !state) {
        return res.redirect(`/app/settings?meta_oauth=error&reason=missing_params`);
      }

      const sessionState = (req.session as any).metaOAuthState as
        | { stateToken: string; channel: string; userId: string; redirectUri?: string }
        | undefined;
      const [stateToken, channel] = state.split(":");
      if (!sessionState || sessionState.stateToken !== stateToken) {
        return res.redirect(`/app/settings?meta_oauth=error&reason=invalid_state`);
      }
      if (channel !== "facebook" && channel !== "instagram") {
        return res.redirect(`/app/settings?meta_oauth=error&reason=invalid_channel`);
      }

      const { exchangeCodeForToken, exchangeForLongLivedToken, fetchUserPages, enrichWithInstagramData } =
        await import("./metaOAuth");

      const redirectUri =
        typeof sessionState.redirectUri === "string" && sessionState.redirectUri.length > 0
          ? sessionState.redirectUri
          : `${getAppOrigin().replace(/\/+$/, "")}/api/integrations/${channel}/callback`;

      console.log("[Meta OAuth] callback", {
        callbackHint,
        channel,
        redirectUriUsed: redirectUri,
        host: req.get("host"),
        origin: req.get("origin") || req.get("referer") || null,
      });

      const shortToken = await exchangeCodeForToken(code, redirectUri);
      const userAccessToken = await exchangeForLongLivedToken(shortToken);
      let pages = await fetchUserPages(userAccessToken);
      pages = await enrichWithInstagramData(pages, userAccessToken);

      (req.session as any).metaOAuthPending = {
        channel,
        userAccessToken,
        pages,
        userId: sessionState.userId,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 min TTL
      };
      delete (req.session as any).metaOAuthState;

      console.log(`[Meta OAuth] callback success for user ${sessionState.userId} — ${pages.length} page(s) fetched`);
      return res.redirect(`/app/settings?meta_oauth=ready&channel=${encodeURIComponent(channel)}`);
    } catch (err: any) {
      console.error("[Meta OAuth] callback error:", err);
      return res.redirect(`/app/settings?meta_oauth=error&reason=${encodeURIComponent(err.message || "unknown")}`);
    }
  }

  // Dedicated stable callbacks (preferred)
  app.get("/api/integrations/facebook/callback", (req, res) => handleMetaOAuthCallback(req, res, "facebook"));
  app.get("/api/integrations/instagram/callback", (req, res) => handleMetaOAuthCallback(req, res, "instagram"));

  // Legacy callback path (keep for older clients / old Meta app settings)
  app.get("/api/integrations/meta/callback", (req, res) => handleMetaOAuthCallback(req, res, "legacy_meta"));

  // GET /api/integrations/meta/oauth-pages
  // Returns the pages stored in session after OAuth callback.
  app.get("/api/integrations/meta/oauth-pages", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const pending = (req.session as any).metaOAuthPending as
        | { channel: string; pages: any[]; userId: string; expiresAt: number }
        | undefined;
      if (!pending) return res.status(404).json({ error: "No OAuth session found — please reconnect" });
      if (pending.userId !== req.user.id) return res.status(403).json({ error: "Session mismatch" });
      if (Date.now() > pending.expiresAt) {
        delete (req.session as any).metaOAuthPending;
        return res.status(410).json({ error: "OAuth session expired — please reconnect" });
      }
      res.json({ channel: pending.channel, pages: pending.pages });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to retrieve OAuth pages" });
    }
  });

  // POST /api/integrations/meta/connect-page
  // Body: { pageId }
  // Validates the selected page, subscribes webhooks, detects IG account,
  // saves credentials and marks isConnected=true.
  app.post("/api/integrations/meta/connect-page", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { pageId, manualInstagramAccountId } = req.body as { pageId: string; manualInstagramAccountId?: string };
      if (!pageId) return res.status(400).json({ error: "pageId is required" });

      const pending = (req.session as any).metaOAuthPending as
        | { channel: string; pages: any[]; userId: string; expiresAt: number; userAccessToken: string }
        | undefined;
      if (!pending) return res.status(404).json({ error: "No OAuth session — please reconnect" });
      if (pending.userId !== req.user.id) return res.status(403).json({ error: "Session mismatch" });
      if (Date.now() > pending.expiresAt) {
        delete (req.session as any).metaOAuthPending;
        return res.status(410).json({ error: "Session expired — please reconnect" });
      }

      const { connectPage } = await import("./metaOAuth");
      const channel = pending.channel as "facebook" | "instagram";
      const page = pending.pages.find((p: any) => p.id === pageId);
      if (!page) return res.status(404).json({ error: "Page not found in OAuth session" });

      // Allow caller to supply Instagram Account ID manually (when auto-detection
      // is not possible due to missing pages_read_engagement permission).
      if (channel === "instagram" && manualInstagramAccountId && !page.instagramAccountId) {
        page.instagramAccountId = manualInstagramAccountId.trim();
      }

      const result = await connectPage(req.user.id, channel, page);

      if (!result.success) {
        return res.status(422).json(result);
      }

      // Persist: generate stable webhook verify token
      const cryptoMod = await import("crypto");
      const verifyTokenRaw = cryptoMod
        .createHmac("sha256", process.env.SESSION_SECRET || "whachat-fb-verify-salt")
        .update(`${req.user.id}:${channel}`)
        .digest("hex")
        .slice(0, 32);

      const channelConfig: Record<string, string> = {
        accessToken: page.accessToken,
        // Always use the Facebook Page ID for the send API endpoint (/{pageId}/messages).
        // For Instagram, the Instagram account ID is stored separately as instagramAccountId.
        pageId: page.id,
        pageName: result.pageName || page.name,
        webhookVerifyToken: verifyTokenRaw,
      };
      if (process.env.META_APP_ID?.trim()) {
        channelConfig.metaAppId = process.env.META_APP_ID.trim();
      }
      if (channel === "instagram" && result.instagramAccountId) {
        channelConfig.instagramAccountId = result.instagramAccountId;
        if (result.instagramUsername) channelConfig.instagramUsername = result.instagramUsername;
      }

      // Upsert channelSettings — isConnected true only now (all steps passed)
      const channelSavePayload = {
        isConnected: true,
        isEnabled: true,
        config: { ...channelConfig, accessToken: "[REDACTED]" },
      };
      console.log(`[MetaOAuth] Step 5a: DB upsertChannelSetting userId=${req.user.id} channel=${channel}`, JSON.stringify(channelSavePayload));
      await storage.upsertChannelSetting(req.user.id, channel, {
        isConnected: true,
        isEnabled: true,
        config: channelConfig,
      });
      console.log(`[MetaOAuth] Step 5a: upsertChannelSetting OK`);

      // Upsert integration record for credential storage (encrypted)
      const integrationConfig: Record<string, string> = {
        accessToken: page.accessToken,
        pageId: page.id,
        pageName: result.pageName || page.name,
        webhookVerifyToken: verifyTokenRaw,
      };
      if (process.env.META_APP_ID?.trim()) {
        integrationConfig.metaAppId = process.env.META_APP_ID.trim();
      }
      if (channel === "instagram" && result.instagramAccountId) {
        integrationConfig.instagramId = result.instagramAccountId;
        if (result.instagramUsername) integrationConfig.instagramUsername = result.instagramUsername;
      }

      const existingIntegrations = await storage.getIntegrationsByType(
        channel === "facebook" ? "meta_facebook" : "meta_instagram"
      );
      const existing = existingIntegrations.find((i: any) => i.userId === req.user!.id);
      const integrationType = channel === "facebook" ? "meta_facebook" : "meta_instagram";
      const encryptedConfig = encryptIntegrationConfig(integrationConfig);

      if (existing) {
        console.log(`[MetaOAuth] Step 5b: DB updateIntegration existing id=${existing.id} type=${integrationType}`);
        await storage.updateIntegration(existing.id, { config: encryptedConfig, isActive: true });
        console.log(`[MetaOAuth] Step 5b: updateIntegration OK`);
      } else {
        const integrationName = channel === "facebook"
          ? `Facebook — ${result.pageName}`
          : `Instagram — ${result.instagramUsername || result.pageName}`;
        console.log(`[MetaOAuth] Step 5b: DB createIntegration type=${integrationType} name="${integrationName}"`);
        await storage.createIntegration({
          userId: req.user.id,
          type: integrationType,
          name: integrationName,
          config: encryptedConfig,
          isActive: true,
        });
        console.log(`[MetaOAuth] Step 5b: createIntegration OK`);
      }

      delete (req.session as any).metaOAuthPending;
      console.log(`[MetaOAuth] connect-page COMPLETE user=${req.user.id} channel=${channel} page=${result.pageName}(${result.pageId}) webhookSubscribed=${result.steps.webhookSubscribed} warnings=${result.warnings.join(" | ") || "none"}`);
      res.json(result);
    } catch (err: any) {
      console.error("[Meta OAuth] connect-page error:", err);
      res.status(500).json({ error: err.message || "Failed to connect page" });
    }
  });

  // ── End Meta OAuth flow ───────────────────────────────────────────────────

  // Return webhook URL + verify token for Facebook/Instagram channels
  // The verify token is stored in channelSettings.config.webhookVerifyToken
  app.get("/api/integrations/meta-webhook-config", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const webhookBaseUrl = getAppOrigin();
      const webhookUrl = `${webhookBaseUrl}/api/webhook/meta`;

      const fbSetting = await storage.getChannelSetting(req.user.id, 'facebook' as any);
      const igSetting = await storage.getChannelSetting(req.user.id, 'instagram' as any);

      const fbConfig = fbSetting?.config as any;
      const igConfig = igSetting?.config as any;

      // If no stored token yet, derive it the same way POST does
      const cryptoMod = await import('crypto');
      const salt = process.env.SESSION_SECRET || 'whachat-fb-verify-salt';
      const deriveFbToken = () =>
        cryptoMod.createHmac('sha256', salt).update(`${req.user!.id}:facebook`).digest('hex').slice(0, 32);
      const deriveIgToken = () =>
        cryptoMod.createHmac('sha256', salt).update(`${req.user!.id}:instagram`).digest('hex').slice(0, 32);

      res.json({
        webhookUrl,
        facebook: {
          isConnected: !!fbSetting?.isConnected,
          verifyToken: fbConfig?.webhookVerifyToken || deriveFbToken(),
          pageName: fbConfig?.pageName ?? null,
          pageId: fbConfig?.pageId ?? null,
        },
        instagram: {
          isConnected: !!igSetting?.isConnected,
          verifyToken: igConfig?.webhookVerifyToken || deriveIgToken(),
          pageName: igConfig?.pageName ?? null,
          pageId: igConfig?.instagramAccountId ?? igConfig?.pageId ?? null,
        },
      });
    } catch (error) {
      console.error("Error fetching meta webhook config:", error);
      res.status(500).json({ error: "Failed to fetch webhook config" });
    }
  });

  // Debug endpoint: check live page subscription status directly from Meta's API.
  // Returns what Meta currently knows about our app's subscription to this page.
  app.get("/api/integrations/meta-debug-subscription", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const fbSetting = await storage.getChannelSetting(req.user.id, 'facebook' as any);
      if (!fbSetting?.isConnected) return res.status(404).json({ error: "No connected Facebook page" });

      const cfg = fbSetting.config as any;
      const pageId = cfg?.pageId;
      const accessToken = cfg?.accessToken;

      if (!pageId || !accessToken) return res.status(400).json({ error: "Missing pageId or accessToken in channelSettings" });

      const GRAPH = "https://graph.facebook.com/v19.0";

      // 1. Check current page subscriptions
      const subCheckUrl = `${GRAPH}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`;
      console.log(`[Meta Debug] GET ${GRAPH}/${pageId}/subscribed_apps`);
      const subResp = await fetch(subCheckUrl);
      const subData = (await subResp.json()) as any;
      console.log(`[Meta Debug] subscribed_apps GET response:`, JSON.stringify(subData));

      // 2. Verify the page token is still valid via debug_token
      const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
      const debugUrl = `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`;
      console.log(`[Meta Debug] GET ${GRAPH}/debug_token for pageId=${pageId}`);
      const debugResp = await fetch(debugUrl);
      const debugData = (await debugResp.json()) as any;
      console.log(`[Meta Debug] debug_token response:`, JSON.stringify({ is_valid: debugData?.data?.is_valid, type: debugData?.data?.type, scopes: debugData?.data?.scopes, error: debugData?.data?.error }));

      res.json({
        pageId,
        pageName: cfg?.pageName,
        tokenValid: debugData?.data?.is_valid ?? false,
        tokenType: debugData?.data?.type,
        grantedScopes: debugData?.data?.scopes ?? [],
        tokenError: debugData?.data?.error ?? null,
        subscriptions: subData?.data ?? [],
        subscriptionError: subData?.error ?? null,
      });
    } catch (err: any) {
      console.error("[Meta Debug] subscription check error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Re-subscribe a Facebook or Instagram page to webhook messages events.
  // Useful when the page subscription is missing or broken without a full OAuth reconnect.
  app.post("/api/integrations/meta/resubscribe", async (req, res) => {
    const requestedChannel = (req.body as { channel?: string })?.channel;
    console.log("[Meta Resubscribe] refresh requested", {
      userId: req.user?.id ?? null,
      authenticated: !!req.user,
      channel: requestedChannel ?? "(default facebook)",
    });

    try {
      if (!req.user) {
        console.warn("[Meta Resubscribe] rejected — unauthorized");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { channel = "facebook" } = req.body as { channel?: "facebook" | "instagram" };

      const fbSetting = await storage.getChannelSetting(req.user.id, channel as any);
      if (!fbSetting?.isConnected) {
        console.warn("[Meta Resubscribe] no connected channelSettings", {
          userId: req.user.id,
          channel,
          hasRow: !!fbSetting,
          isConnected: fbSetting?.isConnected,
        });
        return res.status(404).json({ error: `No connected ${channel} page` });
      }

      const cfg = fbSetting.config as Record<string, unknown>;
      const pageId = (cfg?.pageId ?? cfg?.page_id) as string | undefined;
      const accessToken = (cfg?.accessToken ??
        cfg?.pageAccessToken ??
        cfg?.page_access_token) as string | undefined;

      const pageIdPresent = !!pageId;
      const pageAccessTokenPresent = !!accessToken && String(accessToken).length > 0;

      console.log("[Meta Resubscribe] channelSettings snapshot", {
        userId: req.user.id,
        channel,
        pageIdPresent,
        pageAccessTokenPresent,
      });

      if (!pageId || !accessToken) {
        console.warn("[Meta Resubscribe] missing credentials in config", {
          userId: req.user.id,
          channel,
          pageIdPresent,
          pageAccessTokenPresent,
        });
        return res.status(400).json({
          error: "Missing pageId or page access token in channel settings. Reconnect Facebook Messenger.",
        });
      }

      const webhookCallbackHint = `${String(getAppOrigin() || "").replace(/\/+$/, "") || "(APP_URL unset)"}/api/webhook/meta`;
      console.log("[Meta Resubscribe] expected Meta webhook callback URL (App Dashboard)", { webhookCallbackHint });

      // Demo/test mode: skip real API calls when using placeholder tokens
      const isTestToken =
        accessToken.startsWith("test_") || accessToken === "demo_token" || accessToken.length < 20;
      if (isTestToken) {
        console.log("[Meta Resubscribe] demo token — simulating success", { pageId });
        return res.json({
          channel,
          pageId,
          pageName: cfg?.pageName,
          tokenValid: true,
          tokenScopes: ["pages_messaging", "pages_manage_metadata"],
          tokenExpiry: null,
          tokenError: null,
          previousFields: ["messages"],
          resubscribed: true,
          subFieldsUsed: "messages",
          subError: null,
          message: `Webhook re-subscribed successfully. Facebook will now deliver messages to your inbox.`,
        });
      }

      const GRAPH = "https://graph.facebook.com/v19.0";

      // 1. Validate the page token (optional — requires app id + secret)
      const appId = process.env.META_APP_ID;
      const appSecret = process.env.META_APP_SECRET;
      let tokenValid = false;
      let tokenScopes: string[] = [];
      let tokenError: string | null = null;
      let tokenExpiry: number | null = null;

      if (appId && appSecret) {
        const appToken = `${appId}|${appSecret}`;
        const debugResp = await fetch(
          `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
        );
        const debugData = (await debugResp.json()) as any;
        tokenValid = debugData?.data?.is_valid === true;
        tokenScopes = debugData?.data?.scopes ?? [];
        tokenExpiry = debugData?.data?.expires_at ?? null;
        tokenError = debugData?.data?.error?.message ?? null;
        console.log("[Meta Resubscribe] Meta debug_token", {
          httpOk: debugResp.ok,
          tokenValid,
          scopesCount: tokenScopes.length,
          tokenError,
        });
      } else {
        console.warn("[Meta Resubscribe] META_APP_ID or META_APP_SECRET not set — skipping debug_token");
      }

      // 2. Current subscriptions (read-only)
      const checkResp = await fetch(
        `${GRAPH}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`,
      );
      const checkData = (await checkResp.json()) as any;
      const existingSubs: any[] = checkData?.data ?? [];
      const existingFields: string[] = existingSubs.flatMap((s: any) => s.subscribed_fields ?? []);
      console.log("[Meta Resubscribe] GET subscribed_apps (before)", {
        httpOk: checkResp.ok,
        pageId,
        subscriptionRows: existingSubs.length,
        mergedFieldsSample: existingFields.slice(0, 12),
        graphError: checkData?.error?.message ?? null,
      });

      // 3. POST subscribed_apps — broaden fields for Instagram to include IG-specific delivery where supported.
      // Use fallbacks because Meta can reject unknown fields depending on app/page configuration.
      const tryFieldsList =
        channel === "instagram"
          ? [
              "messages,messaging_postbacks,messaging_optins,messaging_referrals,messaging_seen,instagram_messages",
              "messages,messaging_postbacks,messaging_seen,instagram_messages",
              "messages,messaging_postbacks",
              "messages",
            ]
          : [
              "messages,messaging_postbacks,messaging_optins,messaging_referrals,messaging_seen",
              "messages,messaging_postbacks,messaging_seen,messaging_referrals",
              "messages,messaging_postbacks",
              "messages",
            ];
      let resubscribed = false;
      let subError: string | null = null;
      let subData: any = null;
      let subFieldsUsed = "";

      for (const subFields of tryFieldsList) {
        const subResp = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `subscribed_fields=${encodeURIComponent(subFields)}&access_token=${encodeURIComponent(accessToken)}`,
        });
        subData = (await subResp.json().catch(() => ({}))) as any;
        subError = subData?.error?.message ?? null;
        resubscribed =
          subResp.ok && subData?.success === true && subData?.error == null;

        console.log("[Meta Resubscribe] POST subscribed_apps", {
          subscribed_fields: subFields,
          httpStatus: subResp.status,
          httpOk: subResp.ok,
          bodySuccess: subData?.success,
          errorCode: subData?.error?.code,
          errorType: subData?.error?.type,
          errorMessage: subError,
        });

        if (resubscribed) {
          subFieldsUsed = subFields;
          break;
        }
        if (subFields === "messages,messaging_postbacks") {
          console.warn("[Meta Resubscribe] messages+messaging_postbacks failed; retrying messages only", {
            errorMessage: subError,
          });
        }
      }

      console.log("[Meta Resubscribe] done", {
        userId: req.user.id,
        pageId,
        resubscribed,
        subFieldsUsed: subFieldsUsed || tryFieldsList[tryFieldsList.length - 1],
        subError,
      });

      res.json({
        channel,
        pageId,
        pageName: cfg?.pageName,
        webhookCallbackHint,
        tokenValid,
        tokenScopes,
        tokenExpiry,
        tokenError,
        previousFields: existingFields,
        resubscribed,
        subFieldsUsed: subFieldsUsed || null,
        subError,
        message: resubscribed
          ? `Webhook re-subscribed successfully. Meta will now deliver ${channel === "instagram" ? "Instagram DMs" : "Messenger messages"} to your inbox.`
          : `Re-subscribe failed: ${subError || "Unknown error"}. Verify Meta App webhook URL matches ${webhookCallbackHint} and check logs.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Meta Resubscribe] unexpected error", { message: msg });
      res.status(500).json({ error: msg });
    }
  });

  // TEMP DEBUG: inspect stored Meta FB/IG page subscriptions and config (no secrets).
  // Use this when "connected" UI is true but no inbound webhooks are arriving.
  app.get("/api/debug/meta/subscribed-apps", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const channelParam = String((req.query as any)?.channel || "instagram");
      const channel = channelParam === "facebook" ? "facebook" : "instagram";

      const GRAPH = "https://graph.facebook.com/v19.0";
      const fbSetting = await storage.getChannelSetting(req.user.id, "facebook" as any);
      const igSetting = await storage.getChannelSetting(req.user.id, "instagram" as any);

      const pickCfg = (s: any) => (s?.config ? (s.config as any) : null);
      const fbCfg = pickCfg(fbSetting);
      const igCfg = pickCfg(igSetting);

      const sanitizeConfig = (cfg: any) => {
        if (!cfg) return null;
        const {
          accessToken,
          pageAccessToken,
          page_access_token,
          appSecret,
          webhookVerifyToken,
          verifyToken,
          ...rest
        } = cfg;
        const token = accessToken ?? pageAccessToken ?? page_access_token;
        return {
          ...rest,
          accessTokenPresent: !!token,
          accessTokenLength: typeof token === "string" ? token.length : 0,
          appSecretPresent: !!appSecret,
          webhookVerifyTokenPresent: !!(webhookVerifyToken || verifyToken),
        };
      };

      const selectedSetting = channel === "instagram" ? igSetting : fbSetting;
      const selectedCfg = channel === "instagram" ? igCfg : fbCfg;
      const pageId: string | undefined = selectedCfg?.pageId ?? selectedCfg?.page_id;
      const instagramAccountId: string | undefined =
        channel === "instagram" ? (selectedCfg?.instagramAccountId ?? selectedCfg?.instagramId ?? selectedCfg?.instagram_id) : undefined;

      const accessToken: string | undefined =
        selectedCfg?.accessToken ?? selectedCfg?.pageAccessToken ?? selectedCfg?.page_access_token;

      const responsePayload: any = {
        userId: req.user.id,
        channel,
        pageId: pageId ?? null,
        instagramAccountId: instagramAccountId ?? null,
        facebookChannelSettings: fbSetting
          ? { id: fbSetting.id, isConnected: fbSetting.isConnected, isEnabled: fbSetting.isEnabled, config: sanitizeConfig(fbCfg) }
          : null,
        instagramChannelSettings: igSetting
          ? { id: igSetting.id, isConnected: igSetting.isConnected, isEnabled: igSetting.isEnabled, config: sanitizeConfig(igCfg) }
          : null,
        pageTokenDebug: null as any,
        subscribedApps: null as any,
        subscribedAppsError: null as any,
        pageIgLink: null as any,
      };

      if (!pageId || !accessToken) {
        responsePayload.subscribedAppsError = "Missing pageId or stored page access token in channelSettings config";
        console.warn("[Meta Debug] subscribed_apps skipped — missing pageId/token", {
          userId: req.user.id,
          channel,
          pageIdPresent: !!pageId,
          tokenPresent: !!accessToken,
        });
        return res.json(responsePayload);
      }

      // 1) GET /{page-id}/subscribed_apps using STORED PAGE token (no secrets returned)
      const subUrl = `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`;
      console.log("[Meta Debug] GET subscribed_apps", { channel, pageId });
      const subResp = await fetch(subUrl);
      const subData = (await subResp.json().catch(() => ({}))) as any;
      const subscribedAppIds = Array.isArray(subData?.data)
        ? subData.data
            .map((x: any) => String(x?.id ?? x?.app_id ?? "").trim())
            .filter(Boolean)
        : [];
      const configuredMetaAppId = (process.env.META_APP_ID || "").trim();
      responsePayload.subscribedApps = {
        httpOk: subResp.ok,
        status: subResp.status,
        body: subData,
        appIds: subscribedAppIds,
        configuredMetaAppId: configuredMetaAppId || null,
        hasConfiguredMetaAppId: !!configuredMetaAppId && subscribedAppIds.includes(configuredMetaAppId),
      };
      if (!subResp.ok) {
        responsePayload.subscribedAppsError = subData?.error ?? subData ?? `HTTP ${subResp.status}`;
        console.warn("[Meta Debug] subscribed_apps GET failed", {
          channel,
          pageId,
          status: subResp.status,
          error: subData?.error?.message ?? null,
        });
      }

      // 2) For Instagram: confirm Page -> IG business account link matches stored instagramAccountId
      if (channel === "instagram") {
        const linkUrl =
          `${GRAPH}/${encodeURIComponent(pageId)}` +
          `?fields=instagram_business_account,connected_instagram_account` +
          `&access_token=${encodeURIComponent(accessToken)}`;
        const linkResp = await fetch(linkUrl);
        const linkData = (await linkResp.json().catch(() => ({}))) as any;
        const linkedIgId: string | undefined =
          linkData?.instagram_business_account?.id || linkData?.connected_instagram_account?.id;
        responsePayload.pageIgLink = {
          httpOk: linkResp.ok,
          status: linkResp.status,
          linkedIgBusinessAccountId: linkData?.instagram_business_account?.id ?? null,
          linkedConnectedInstagramAccountId: linkData?.connected_instagram_account?.id ?? null,
          linkedResolvedId: linkedIgId ?? null,
          storedInstagramAccountId: instagramAccountId ?? null,
          matchesStored: !!linkedIgId && !!instagramAccountId && linkedIgId === instagramAccountId,
          error: linkData?.error ?? null,
        };
      }

      // 3) debug_token for the stored PAGE access token (requires META_APP_ID + META_APP_SECRET)
      const appId = process.env.META_APP_ID;
      const appSecret = process.env.META_APP_SECRET;
      if (appId && appSecret) {
        const appToken = `${appId}|${appSecret}`;
        const debugUrl =
          `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}` +
          `&access_token=${encodeURIComponent(appToken)}`;
        const dbgResp = await fetch(debugUrl);
        const dbg = (await dbgResp.json().catch(() => ({}))) as any;
        const td = dbg?.data ?? {};
        responsePayload.pageTokenDebug = {
          httpOk: dbgResp.ok,
          status: dbgResp.status,
          is_valid: td?.is_valid ?? null,
          type: td?.type ?? null,
          app_id: td?.app_id ?? null,
          expires_at: td?.expires_at ?? null,
          data_access_expires_at: td?.data_access_expires_at ?? null,
          scopes: Array.isArray(td?.scopes) ? td.scopes : [],
          granular_scopes: Array.isArray(td?.granular_scopes) ? td.granular_scopes : [],
          error: td?.error ?? dbg?.error ?? null,
        };
      } else {
        responsePayload.pageTokenDebug = {
          error: "META_APP_ID or META_APP_SECRET not set on server; cannot call debug_token",
        };
      }

      // Log a compact summary server-side (no secrets)
      console.log("[Meta Debug] subscription snapshot", {
        userId: req.user.id,
        channel,
        pageId,
        instagramAccountId: instagramAccountId ?? null,
        pageTokenType: responsePayload.pageTokenDebug?.type ?? null,
        pageTokenScopesCount: Array.isArray(responsePayload.pageTokenDebug?.scopes)
          ? responsePayload.pageTokenDebug.scopes.length
          : null,
        subscribedAppsHttpOk: responsePayload.subscribedApps?.httpOk ?? null,
        subscribedAppsStatus: responsePayload.subscribedApps?.status ?? null,
        subscribedAppIds,
        configuredMetaAppId: configuredMetaAppId || null,
        hasConfiguredMetaAppId: responsePayload.subscribedApps?.hasConfiguredMetaAppId ?? null,
      });

      return res.json(responsePayload);
    } catch (err: any) {
      console.error("[Meta Debug] /api/debug/meta/subscribed-apps error:", err);
      return res.status(500).json({ error: err?.message || "Internal error" });
    }
  });

  // TEMP DEBUG: force clean unsubscribe + re-subscribe for IG page webhooks.
  // This is intentionally narrow to avoid accidentally modifying other pages.
  app.post("/api/debug/meta/force-resubscribe-ig", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      // Optional allow-list for destructive Meta debug (comma-separated page IDs).
      // If unset, any Instagram-connected page stored on the user may be modified (still auth-only).
      const allowedPages = (process.env.META_DEBUG_ALLOWED_PAGE_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const GRAPH = "https://graph.facebook.com/v19.0";
      const subscribedFields = "messages,messaging_postbacks,message_reads";

      const igSetting = await storage.getChannelSetting(req.user.id, "instagram" as any);
      const cfg = (igSetting?.config as any) ?? null;
      const pageId: string | undefined = cfg?.pageId ?? cfg?.page_id;
      const accessToken: string | undefined = cfg?.accessToken ?? cfg?.pageAccessToken ?? cfg?.page_access_token;

      if (!igSetting?.isConnected) {
        return res.status(400).json({ error: "Instagram channel is not connected for this user." });
      }
      if (!pageId || !accessToken) {
        return res.status(400).json({ error: "Missing pageId or stored PAGE access token for Instagram channel." });
      }
      if (allowedPages.length > 0 && !allowedPages.includes(pageId)) {
        return res.status(400).json({
          error: `pageId not in META_DEBUG_ALLOWED_PAGE_IDS allow-list (set env to enable this debug route for specific pages).`,
          pageId,
        });
      }

      console.log("[Meta Debug] force-resubscribe IG starting", {
        userId: req.user.id,
        pageId,
        subscribed_fields: subscribedFields,
      });

      // 1) DELETE /{page-id}/subscribed_apps (clear)
      const delUrl = `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`;
      const delResp = await fetch(delUrl, { method: "DELETE" });
      const delData = (await delResp.json().catch(() => ({}))) as any;
      console.log("[Meta Debug] DELETE subscribed_apps response (full)", JSON.stringify(delData));

      // 2) POST /{page-id}/subscribed_apps (re-subscribe)
      const postUrl = `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps`;
      const postResp = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `subscribed_fields=${encodeURIComponent(subscribedFields)}&access_token=${encodeURIComponent(accessToken)}`,
      });
      const postData = (await postResp.json().catch(() => ({}))) as any;
      console.log("[Meta Debug] POST subscribed_apps response (full)", JSON.stringify(postData));

      // 3) GET /{page-id}/subscribed_apps (verify)
      const getUrl = `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`;
      const getResp = await fetch(getUrl);
      const getData = (await getResp.json().catch(() => ({}))) as any;

      console.log("[Meta Debug] force-resubscribe IG done", {
        userId: req.user.id,
        pageId,
        deleteHttpOk: delResp.ok,
        deleteStatus: delResp.status,
        postHttpOk: postResp.ok,
        postStatus: postResp.status,
        getHttpOk: getResp.ok,
        getStatus: getResp.status,
      });

      return res.json({
        userId: req.user.id,
        pageId,
        subscribed_fields: subscribedFields,
        delete: { httpOk: delResp.ok, status: delResp.status, body: delData },
        post: { httpOk: postResp.ok, status: postResp.status, body: postData },
        get: { httpOk: getResp.ok, status: getResp.status, body: getData },
        note:
          "No secrets are returned. If IG DMs still do not hit /api/webhook/meta after this, the blocker is almost certainly Meta App mode/review/product configuration rather than page subscription.",
      });
    } catch (err: any) {
      console.error("[Meta Debug] /api/debug/meta/force-resubscribe-ig error:", err);
      return res.status(500).json({ error: err?.message || "Internal error" });
    }
  });

  // TEMP DEBUG: verify we can read Instagram DM conversations via Graph API (polling viability).
  app.get("/api/debug/meta/ig-conversations", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const GRAPH = "https://graph.facebook.com/v19.0";

      const igSetting = await storage.getChannelSetting(req.user.id, "instagram" as any);
      const cfg = (igSetting?.config as any) ?? null;

      const pageId: string | undefined = cfg?.pageId ?? cfg?.page_id;
      const instagramAccountId: string | undefined =
        cfg?.instagramAccountId ?? cfg?.instagramId ?? cfg?.instagram_id;
      const accessToken: string | undefined =
        cfg?.accessToken ?? cfg?.pageAccessToken ?? cfg?.page_access_token;

      if (!igSetting?.isConnected) {
        return res.status(400).json({ error: "Instagram channel is not connected for this user." });
      }
      if (!instagramAccountId) {
        return res.status(400).json({ error: "Missing instagramAccountId in Instagram channelSettings config." });
      }
      if (!accessToken) {
        return res.status(400).json({ error: "Missing stored PAGE access token in Instagram channelSettings config." });
      }

      const url =
        `${GRAPH}/${encodeURIComponent(instagramAccountId)}/conversations` +
        `?fields=participants,messages.limit(5){from,text,created_time}` +
        `&access_token=${encodeURIComponent(accessToken)}`;

      const resp = await fetch(url);
      const body = (await resp.json().catch(() => ({}))) as any;

      const responsePayload = {
        instagramAccountId,
        pageId: pageId ?? null,
        httpOk: resp.ok,
        status: resp.status,
        body,
      };

      console.log("[Meta Debug] IG conversations response", JSON.stringify(responsePayload));
      return res.json(responsePayload);
    } catch (err: any) {
      console.error("[Meta Debug] /api/debug/meta/ig-conversations error:", err);
      return res.status(500).json({ error: err?.message || "Internal error" });
    }
  });

  // ─── Channel Health Status ─────────────────────────────────────────────────
  // Deep health check for all connected channels. For Meta (FB/IG) channels,
  // verifies token (debug_token), page probe, and webhook subscription with retries.
  // Transient Meta timeouts do not mark the integration disconnected; see `warnings` + `healthState`.
  app.get("/api/channel-health", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const userSession = await storage.getUserForSession(req.user.id);
      const legacyWaRow = await storage.getChannelSetting(req.user.id, "whatsapp");
      const legacyChannelConnected = !!legacyWaRow?.isConnected;
      await syncWhatsAppChannelRowFromCanonicalMeta(req.user.id);
      const settings = await storage.getChannelSettings(req.user.id);
      const waCanon = userSession ? isCanonicalWhatsAppFullyConnected(userSession) : false;

      let rows = [...settings];
      if (!rows.some((r) => r.channel === "whatsapp")) {
        rows.push({
          id: "__synthetic_whatsapp__",
          userId: req.user.id,
          channel: "whatsapp",
          isEnabled: waCanon,
          isConnected: waCanon,
          config: {},
          fallbackEnabled: false,
          fallbackPriority: 0,
          dailyLimit: null,
          messagesSentToday: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any);
      }

      const GRAPH_LOCAL = "https://graph.facebook.com/v19.0";
      const appId     = process.env.META_APP_ID;
      const appSecret = process.env.META_APP_SECRET;

      const REQUIRED_SCOPES: Record<string, string[]> = {
        facebook:  ['pages_messaging', 'pages_manage_metadata'],
        instagram: ['instagram_manage_messages', 'pages_messaging'],
      };

      const result: any[] = [];

      for (const s of rows) {
        const cfg = s.config as any;
        const legacyRowConnected = !!(s.isConnected ?? false);
        const effectiveConnected =
          s.channel === "whatsapp"
            ? legacyRowConnected || waCanon
            : legacyRowConnected;

        const entry: any = {
          channel:     s.channel,
          isConnected: effectiveConnected,
          isEnabled:   s.isEnabled   ?? false,
          pageName:
            s.channel === "whatsapp"
              ? cfg?.pageName ??
                cfg?.displayPhoneNumber ??
                cfg?.phoneNumberId ??
                userSession?.metaDisplayPhoneNumber ??
                null
              : cfg?.pageName ?? cfg?.phoneNumberId ?? null,
          healthy:     null as boolean | null, // null = could not determine
          issues:      [] as string[],
          /** Non-blocking notices (e.g. Meta introspection timeout while Page API still works). */
          warnings:    [] as string[],
          /** Aggregate UX hint; inbox uses this for softer banners. */
          healthState: "unknown" as "healthy" | "degraded" | "unhealthy" | "unknown",
          checks: {
            tokenValid:      null as boolean | null,
            tokenScopes:     null as string[] | null,
            missingScopes:   null as string[] | null,
            pageAccessible:  null as boolean | null,
            subscriptionOk:  null as boolean | null,
            subscriptionFields: null as string[] | null,
          },
        };

        if (!effectiveConnected) {
          result.push(entry);
          continue;
        }

        // ── Meta channels (Facebook / Instagram) ──────────────────────────────
        if ((s.channel === "facebook" || s.channel === "instagram") && cfg?.pageId && cfg?.accessToken) {
          const { pageId, accessToken } = cfg as { pageId: string; accessToken: string };
          const tokenSource = "channel_settings.page_access_token";

          try {
            const [tokenRes, pageRes, subRes] = await Promise.all([
              appId && appSecret
                ? fetchMetaGraphJsonWithRetries({
                    url: `${GRAPH_LOCAL}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
                    logTag: "debug_token",
                    tokenSource,
                    extraLog: { userId: req.user.id, channel: s.channel, pageId },
                  })
                : Promise.resolve({
                    ok: false,
                    status: 0,
                    json: null,
                    outcome: "network" as const,
                    attempts: 0,
                    totalLatencyMs: 0,
                  }),
              fetchMetaGraphJsonWithRetries({
                url: `${GRAPH_LOCAL}/${pageId}?fields=name&access_token=${encodeURIComponent(accessToken)}`,
                logTag: "page_probe",
                tokenSource,
                extraLog: { userId: req.user.id, channel: s.channel, pageId },
              }),
              fetchMetaGraphJsonWithRetries({
                url: `${GRAPH_LOCAL}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`,
                logTag: "subscribed_apps",
                tokenSource,
                extraLog: { userId: req.user.id, channel: s.channel, pageId },
              }),
            ]);

            let tokenIntrospectionTransient = false;

            // ── Token introspection (app token) — never conflate timeout with invalid token ──
            if (appId && appSecret && tokenRes.ok && tokenRes.json && typeof tokenRes.json === "object") {
              const td = (tokenRes.json as { data?: { is_valid?: boolean; scopes?: string[] } }).data;
              if (td) {
                entry.checks.tokenValid = td.is_valid === true;
                entry.checks.tokenScopes = td.scopes ?? [];
                const required = REQUIRED_SCOPES[s.channel] ?? [];
                const missing = required.filter((sc: string) => !(entry.checks.tokenScopes ?? []).includes(sc));
                entry.checks.missingScopes = missing;
                if (!entry.checks.tokenValid) entry.issues.push("Access token is invalid or expired");
                if (missing.length) entry.issues.push(`Missing permissions: ${missing.join(", ")}`);
              } else {
                entry.checks.tokenValid = false;
                entry.issues.push("Token debug response missing data");
              }
            } else if (appId && appSecret) {
              if (tokenRes.outcome === "timeout" || tokenRes.outcome === "network") {
                tokenIntrospectionTransient = true;
                entry.checks.tokenValid = null;
              } else {
                entry.checks.tokenValid = false;
                entry.issues.push("Access token verification failed");
              }
            } else {
              entry.checks.tokenValid = null;
              entry.warnings.push(
                "Meta app credentials are not configured on the server; token introspection was skipped."
              );
            }

            // ── Page probe (same user token) — source of truth when introspection is flaky ──
            const pageJson = pageRes.ok && pageRes.json && typeof pageRes.json === "object" ? (pageRes.json as any) : null;
            const pageTransient = !pageRes.ok && (pageRes.outcome === "timeout" || pageRes.outcome === "network");
            if (pageJson && (pageJson.id || pageJson.name)) {
              entry.checks.pageAccessible = true;
            } else if (pageTransient) {
              entry.checks.pageAccessible = null;
              entry.warnings.push("Meta Page API temporarily unreachable.");
            } else {
              entry.checks.pageAccessible = false;
              entry.issues.push("Page is not accessible (revoked or unpublished)");
            }

            // ── Webhook subscription ──
            const subJson = subRes.ok && subRes.json && typeof subRes.json === "object" ? (subRes.json as any) : null;
            let subscriptionTransient = false;
            if (subJson?.data !== undefined) {
              const fields: string[] = (subJson.data ?? []).flatMap((x: any) => x.subscribed_fields ?? []);
              entry.checks.subscriptionFields = fields;
              entry.checks.subscriptionOk = fields.includes("messages");
              if (!entry.checks.subscriptionOk) {
                entry.issues.push('Webhook not subscribed to "messages" field');
              }
            } else {
              entry.checks.subscriptionOk = null;
              subscriptionTransient = !subRes.ok && (subRes.outcome === "timeout" || subRes.outcome === "network");
              if (subscriptionTransient) {
                entry.warnings.push("Could not verify webhook subscription (Meta API timeout).");
              } else {
                entry.issues.push("Could not verify webhook subscription");
              }
            }

            // If Graph debug_token flaked but Page API accepts the same token, treat session as valid (degraded).
            if (
              (entry.checks.tokenValid === null || entry.checks.tokenValid === undefined) &&
              tokenIntrospectionTransient &&
              entry.checks.pageAccessible === true
            ) {
              entry.checks.tokenValid = true;
              entry.warnings.push(
                "Meta verification temporarily unavailable (token introspection); session validated via Page API."
              );
              console.log(
                `[META_TOKEN_VERIFY] ${JSON.stringify({
                  phase: "inferred_valid_from_page",
                  userId: req.user.id,
                  channel: s.channel,
                  pageId,
                  tokenSource,
                })}`
              );
            }

            const missing = (entry.checks.missingScopes ?? []) as string[];
            const definitiveFailure =
              entry.checks.tokenValid === false ||
              missing.length > 0 ||
              entry.checks.pageAccessible === false ||
              entry.checks.subscriptionOk === false;

            const runnable = [entry.checks.tokenValid, entry.checks.pageAccessible, entry.checks.subscriptionOk].filter(
              (v) => v !== null && v !== undefined
            ) as boolean[];
            const allKnownPass = runnable.length > 0 && runnable.every(Boolean) && entry.issues.length === 0;

            if (definitiveFailure) {
              entry.healthy = false;
              entry.healthState = "unhealthy";
            } else if (allKnownPass) {
              entry.healthy = true;
              entry.healthState = entry.warnings.length ? "degraded" : "healthy";
            } else if (entry.issues.length > 0) {
              entry.healthy = false;
              entry.healthState = "unhealthy";
            } else {
              entry.healthy = null;
              entry.healthState = entry.warnings.length ? "degraded" : "unknown";
            }

            if (definitiveFailure) {
              console.warn(
                `[META_HEALTHCHECK] ${JSON.stringify({
                  severity: "definitive_integration_failure",
                  userId: req.user.id,
                  channel: s.channel,
                  pageId,
                  tokenSource,
                  note: "Outbound sends are not gated on this inbox health API; fix integration before relying on IG/FB delivery.",
                })}`
              );
            }
          } catch (err) {
            entry.warnings.push("Health check encountered an unexpected error (treated as transient).");
            entry.healthy = null;
            entry.healthState = "degraded";
            console.warn(
              `[META_HEALTHCHECK] ${JSON.stringify({
                phase: "unexpected_catch",
                userId: req.user.id,
                channel: s.channel,
                error: err instanceof Error ? err.message : String(err),
              })}`
            );
          }

        // ── WhatsApp ──────────────────────────────────────────────────────────
        } else if (s.channel === 'whatsapp') {
          const provider: string = (userSession as any)?.whatsappProvider ?? 'twilio';

          if (provider === 'meta') {
            const metaFullyOk = waCanon;
            entry.checks.tokenValid = metaFullyOk;
            entry.checks.subscriptionOk = !!(userSession as any)?.metaWebhookSubscribed;
            if (!metaFullyOk) entry.issues.push('Meta WhatsApp is not fully connected — check Settings');
            entry.healthy = metaFullyOk ? true : false;
            entry.healthState = metaFullyOk ? "healthy" : "unhealthy";

          } else {
            // Twilio — validate credentials against Twilio API
            const accountSid: string | undefined = (userSession as any)?.twilioAccountSid;
            const authToken:  string | undefined = (userSession as any)?.twilioAuthToken;

            if (accountSid && authToken) {
              try {
                const r = await fetch(
                  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
                  {
                    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` },
                    signal: AbortSignal.timeout(5000),
                  }
                );
                if (r.ok) {
                  const data = (await r.json()) as any;
                  const active = data?.status === 'active';
                  entry.checks.tokenValid = active;
                  if (!active) entry.issues.push(`Twilio account status: ${data?.status ?? 'unknown'}`);
                  entry.healthy = active;
                  entry.healthState = active ? "healthy" : "unhealthy";
                } else {
                  entry.checks.tokenValid = false;
                  entry.issues.push('Twilio credentials are invalid or rejected');
                  entry.healthy = false;
                  entry.healthState = "unhealthy";
                }
              } catch {
                entry.healthy = null;
                entry.healthState = "degraded";
                entry.warnings.push("Twilio verification temporarily unavailable (network timeout).");
              }
            } else {
              entry.checks.tokenValid = false;
              entry.issues.push('Twilio credentials missing — reconnect in Settings');
              entry.healthy = false;
              entry.healthState = "unhealthy";
            }
          }

        // ── Telegram ──────────────────────────────────────────────────────────
        } else if (s.channel === 'telegram' && s.isConnected) {
          const botToken: string | undefined = cfg?.botToken;

          if (!botToken) {
            entry.checks.tokenValid = false;
            entry.issues.push('Bot token not found — reconnect Telegram in Settings');
            entry.healthy = false;
            entry.healthState = "unhealthy";
          } else {
            try {
              const [getMeData, webhookData] = await Promise.all([
                fetch(`https://api.telegram.org/bot${botToken}/getMe`, { signal: AbortSignal.timeout(5000) })
                  .then(r => r.ok ? r.json() : null).catch(() => null),
                fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, { signal: AbortSignal.timeout(5000) })
                  .then(r => r.ok ? r.json() : null).catch(() => null),
              ]);

              entry.checks.tokenValid = getMeData?.ok === true;
              if (!entry.checks.tokenValid) entry.issues.push('Bot token is invalid or revoked');

              const webhookUrl: string = webhookData?.result?.url ?? '';
              const webhookErr: string = webhookData?.result?.last_error_message ?? '';
              entry.checks.subscriptionOk = webhookUrl.length > 0;
              if (!entry.checks.subscriptionOk) entry.issues.push('Webhook URL is not configured');
              if (webhookErr) entry.issues.push(`Telegram last error: ${webhookErr}`);

              const ran = [entry.checks.tokenValid, entry.checks.subscriptionOk].filter(v => v !== null);
              entry.healthy = ran.length > 0 ? ran.every(Boolean) && entry.issues.length === 0 : null;
              entry.healthState =
                entry.healthy === true ? "healthy" : entry.healthy === false ? "unhealthy" : "degraded";

            } catch {
              entry.healthy = null;
              entry.healthState = "degraded";
              entry.warnings.push("Telegram API temporarily unreachable.");
            }
          }

        // ── TikTok ────────────────────────────────────────────────────────────
        } else if (s.channel === 'tiktok' && s.isConnected) {
          // TikTok is a passive inbound webhook — the health signal is whether
          // lead intake is enabled and the channel is marked connected.
          if (s.isEnabled) {
            entry.checks.subscriptionOk = true;
            entry.healthy = true;
            entry.healthState = "healthy";
          } else {
            entry.checks.subscriptionOk = false;
            entry.issues.push('Lead intake is not enabled — enable it in Settings');
            entry.healthy = false;
            entry.healthState = "unhealthy";
          }

        // ── Other connected channels (SMS, Webchat, …) ────────────────────────
        } else if (s.isConnected) {
          entry.checks.subscriptionOk = true;
          entry.healthy = true;
          entry.healthState = "healthy";
        }

        if (!entry.healthState || entry.healthState === "unknown") {
          if (entry.healthy === true) entry.healthState = "healthy";
          else if (entry.healthy === false) entry.healthState = "unhealthy";
        }

        result.push(entry);
      }

      // ── Always surface all five main channels (gray if not configured) ──────
      const MAIN_CHANNELS = ['whatsapp', 'facebook', 'instagram', 'telegram', 'tiktok'];
      for (const ch of MAIN_CHANNELS) {
        if (!result.find(r => r.channel === ch)) {
          result.push({
            channel: ch,
            isConnected: false,
            isEnabled: false,
            pageName: null,
            healthy: null,
            issues: [],
            warnings: [],
            healthState: "unknown",
            checks: {
              tokenValid: null,
              tokenScopes: null,
              missingScopes: null,
              pageAccessible: null,
              subscriptionOk: null,
              subscriptionFields: null,
            },
          });
        }
      }

      // Sort in display order: WhatsApp, Facebook, Instagram, Telegram, TikTok, then others
      result.sort((a, b) => {
        const ai = MAIN_CHANNELS.indexOf(a.channel);
        const bi = MAIN_CHANNELS.indexOf(b.channel);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      if (userSession) {
        const row = settings.find((x) => x.channel === "whatsapp");
        const finalConnected =
          waCanon || !!row?.isConnected;
        logWhatsAppChannelState({
          userId: req.user.id,
          activeProvider: (userSession.whatsappProvider as WhatsAppProvider) || "twilio",
          metaConnected: !!userSession.metaConnected,
          webhookSubscribed: !!userSession.metaWebhookSubscribed,
          legacyChannelConnected,
          finalConnected,
        });
      }

      res.json(result);
    } catch (err: any) {
      console.error('[ChannelHealth] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Telegram Connect ─────────────────────────────────────────────────────
  // Validates a bot token via Telegram's getMe API, auto-sets the webhook,
  // then saves the channel config. Returns bot info on success.
  app.post("/api/integrations/telegram/connect", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { botToken } = req.body as { botToken?: string };
      if (!botToken?.trim()) return res.status(400).json({ error: "botToken is required" });

      const token = botToken.trim();

      // 1. Validate token via getMe
      const getMeResp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const getMeData = (await getMeResp.json()) as any;

      if (!getMeResp.ok || !getMeData.ok) {
        return res.status(400).json({
          error: getMeData?.description ?? "Invalid bot token. Please check it and try again.",
        });
      }

      const botInfo = getMeData.result;
      const botUsername = botInfo.username as string;
      const botFirstName = botInfo.first_name as string;
      const botId = botInfo.id as number;

      // 2. Auto-set webhook to this server's endpoint
      const protocol = req.headers['x-forwarded-proto'] ?? req.protocol;
      const host     = req.headers['x-forwarded-host']  ?? req.get('host');
      const webhookUrl = `${protocol}://${host}/api/webhook/telegram/${req.user.id}`;

      const setWebhookResp = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true }),
        }
      );
      const setWebhookData = (await setWebhookResp.json()) as any;

      if (!setWebhookResp.ok || !setWebhookData.ok) {
        console.error("[Telegram Connect] setWebhook failed:", setWebhookData);
        return res.status(500).json({
          error: `Bot token is valid but webhook setup failed: ${setWebhookData?.description ?? "unknown error"}`,
        });
      }

      console.log(`[Telegram Connect] Webhook set for @${botUsername} → ${webhookUrl}`);

      // 3. Save to channel settings
      const configData = { botToken: token, botUsername, botFirstName, botId, webhookUrl };
      await storage.upsertChannelSetting(req.user.id, 'telegram', {
        isConnected: true,
        isEnabled: true,
        config: configData,
      });

      res.json({
        username: botUsername,
        firstName: botFirstName,
        botId,
        botLink: `https://t.me/${botUsername}`,
        webhookUrl,
      });
    } catch (err: any) {
      console.error("[Telegram Connect] error:", err);
      res.status(500).json({ error: err.message ?? "Unexpected error" });
    }
  });

  // ─── WooCommerce (REST API keys) ───────────────────────────────────────────
  app.post("/api/integrations/woocommerce/connect", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!limits?.integrationsEnabled) {
        return res.status(403).json({ error: "Integrations are not available on your plan" });
      }

      const { storeUrl, consumerKey, consumerSecret } = req.body as {
        storeUrl?: string;
        consumerKey?: string;
        consumerSecret?: string;
      };

      const ck = typeof consumerKey === "string" ? consumerKey.trim() : "";
      const cs = typeof consumerSecret === "string" ? consumerSecret.trim() : "";
      const rawUrl = typeof storeUrl === "string" ? storeUrl.trim() : "";

      if (!rawUrl || !ck || !cs) {
        return res.status(400).json({ error: "Store URL, Consumer Key, and Consumer Secret are required" });
      }

      const normalizedUrl = normalizeWooCommerceStoreUrl(rawUrl);
      if (!normalizedUrl) {
        return res.status(400).json({ error: "Invalid store URL" });
      }

      try {
        const verify = await verifyWooCommerceRestCredentials(normalizedUrl, ck, cs);
        if (!verify.ok) {
          return res.status(400).json({ error: "Invalid credentials or store URL" });
        }

        const userIntegrations = await storage.getIntegrations(req.user.id);
        const existingWoo = userIntegrations.find((i) => i.type === "woocommerce");
        const priorCfg =
          existingWoo?.config && typeof existingWoo.config === "object"
            ? decryptIntegrationConfig(existingWoo.config as Record<string, any>)
            : {};
        const webhookSecret =
          typeof priorCfg.webhookSecret === "string" && priorCfg.webhookSecret.trim()
            ? priorCfg.webhookSecret.trim()
            : crypto.randomBytes(32).toString("hex");
        const syncOptions = Array.isArray(priorCfg.syncOptions) && priorCfg.syncOptions.length
          ? priorCfg.syncOptions
          : ["new_orders", "new_customers"];

        const plainConfig: Record<string, unknown> = {
          storeUrl: normalizedUrl,
          consumerKey: ck,
          consumerSecret: cs,
          webhookSecret,
          status: "connected",
          syncOptions,
        };
        const encryptedConfig = encryptIntegrationConfig(plainConfig as Record<string, any>);
        let row;
        if (existingWoo) {
          row = await storage.updateIntegration(existingWoo.id, {
            name: "WooCommerce",
            config: encryptedConfig as any,
            isActive: true,
          });
        } else {
          row = await storage.createIntegration({
            userId: req.user.id,
            type: "woocommerce",
            name: "WooCommerce",
            config: encryptedConfig as any,
            isActive: true,
          });
        }

        if (!row) {
          return res.status(500).json({ error: "Failed to save integration" });
        }

        let sampleOrders: { id: number; status: string; dateCreated: string | null }[] = [];
        try {
          sampleOrders = await fetchWooCommerceSampleOrders(normalizedUrl, ck, cs);
        } catch {
          sampleOrders = [];
        }

        const safe = {
          ...row,
          config: maskIntegrationConfig(row.config as Record<string, any>),
        };

        return res.status(201).json({
          ok: true,
          integration: safe,
          sampleOrders,
          webhook: {
            url: `${getAppOrigin()}/api/webhooks/woocommerce/${req.user.id}`,
            secret: webhookSecret,
          },
        });
      } catch (err: any) {
        console.error("[WooCommerce Connect] upstream or save error");
        return res.status(502).json({
          error: "Unable to reach your store. Check the URL, SSL, and firewall rules, then try again.",
        });
      }
    } catch (err: any) {
      console.error("[WooCommerce Connect] error:", err?.message ?? err);
      return res.status(500).json({ error: err?.message ?? "Unexpected error" });
    }
  });

  app.post(
    "/api/webhooks/woocommerce/:userId",
    createWooCommerceWebhookHandler(decryptIntegrationConfig),
  );

  // ─── TikTok Test Lead ──────────────────────────────────────────────────────
  // Creates a mock TikTok lead for the authenticated user so they can verify
  // that lead intake is working without needing a real TikTok ad.
  app.post("/api/integrations/tiktok/test-lead", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const names = ["Alex Johnson", "Jamie Rivera", "Sam Chen", "Taylor Brooks", "Morgan Lee"];
      const baseName = names[Math.floor(Math.random() * names.length)];
      const randomName = `[Test] ${baseName}`;
      const randomPhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;

      const contact = await storage.createContact({
        userId: req.user.id,
        name: randomName,
        phone: randomPhone,
        email: `test.${baseName.toLowerCase().replace(" ", ".")}@example.com`,
        primaryChannel: 'whatsapp',
        source: 'tiktok',
        notes: '⚠️ This is a test lead created from Settings. You can safely delete it.',
      });

      const { channelService } = await import("./channelService");
      await channelService.logActivity(req.user.id, contact.id, undefined, 'lead_created', {
        source: 'tiktok',
        originalSource: 'test_lead',
        metadata: { isTest: true },
      });

      // Auto-activate the channel — same as a real lead arriving
      await storage.upsertChannelSetting(req.user.id, 'tiktok', { isConnected: true, isEnabled: true });

      console.log(`[TikTok Test Lead] Created test contact ${contact.id} for user ${req.user.id}`);
      res.status(201).json({ success: true, contactId: contact.id, name: randomName });
    } catch (err: any) {
      console.error("[TikTok Test Lead] error:", err);
      res.status(500).json({ error: err.message ?? "Unexpected error" });
    }
  });

  // Validate a Meta (FB/IG) page token before saving credentials.
  // Checks: token validity, required scopes, page access, page subscription to webhook events.
  // Does NOT require authentication — token is provided directly in the request.
  app.post("/api/integrations/meta-validate", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { accessToken, pageId, channel } = req.body as {
        accessToken?: string;
        pageId?: string;
        channel?: string;
      };
      if (!accessToken || !pageId || !channel) {
        return res.status(400).json({ error: "accessToken, pageId, and channel are required" });
      }

      const GRAPH = "https://graph.facebook.com/v19.0";

      // Required scopes per channel
      const REQUIRED_SCOPES: Record<string, string[]> = {
        facebook: ["pages_messaging", "pages_manage_metadata"],
        instagram: ["pages_show_list", "pages_messaging"],
      };

      const result: {
        tokenValid: boolean;
        tokenOwner: string | null;
        grantedScopes: string[];
        missingScopes: string[];
        pageAccessible: boolean;
        pageName: string | null;
        pageSubscribed: boolean;
        pageSubscriptionError: string | null;
        error?: string;
      } = {
        tokenValid: false,
        tokenOwner: null,
        grantedScopes: [],
        missingScopes: REQUIRED_SCOPES[channel] ?? [],
        pageAccessible: false,
        pageName: null,
        pageSubscribed: false,
        pageSubscriptionError: null,
      };

      // 1. Verify token is valid by calling /me
      const meResp = await fetch(
        `${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
      );
      const meData = (await meResp.json()) as any;
      if (!meResp.ok || !meData.id) {
        result.error = meData?.error?.message || "Invalid access token — please check and try again.";
        return res.json(result);
      }
      result.tokenValid = true;
      result.tokenOwner = meData.name || meData.id;

      // 2. Check granted permissions (works for user tokens; page tokens return limited info — treat gracefully)
      const permResp = await fetch(
        `${GRAPH}/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
      );
      const permData = (await permResp.json()) as any;
      if (permResp.ok && Array.isArray(permData?.data)) {
        result.grantedScopes = permData.data
          .filter((p: any) => p.status === "granted")
          .map((p: any) => p.permission as string);
        const required = REQUIRED_SCOPES[channel] ?? [];
        result.missingScopes = required.filter((s) => !result.grantedScopes.includes(s));
      } else {
        // Page access tokens don't expose /me/permissions — treat as no missing scopes
        result.grantedScopes = [];
        result.missingScopes = [];
      }

      // 3. Verify access to the specific page/account
      const pageResp = await fetch(
        `${GRAPH}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
      );
      const pageData = (await pageResp.json()) as any;
      if (pageResp.ok && pageData.id) {
        result.pageAccessible = true;
        result.pageName = pageData.name || pageId;
      } else {
        result.error = pageData?.error?.message ||
          `Could not access ${channel === "instagram" ? "Instagram account" : "Facebook Page"} with ID "${pageId}". Verify the ID is correct and the token has page access.`;
        return res.json(result);
      }

      // 4. Subscribe the page to webhook events (so GHL-side manual step is eliminated)
      const subFields =
        channel === "instagram"
          ? "messages,messaging_seen,instagram_messages"
          : "messages,messaging_postbacks,messaging_seen,messaging_referrals";
      const subResp = await fetch(
        `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `subscribed_fields=${encodeURIComponent(subFields)}&access_token=${encodeURIComponent(accessToken)}`,
        },
      );
      const subData = (await subResp.json()) as any;
      if (subResp.ok && subData.success) {
        result.pageSubscribed = true;
      } else {
        // Non-fatal — warn but let user proceed; they can subscribe manually
        result.pageSubscriptionError =
          subData?.error?.message ||
          "Could not auto-subscribe page to webhook events. You can subscribe manually in Meta Developer Portal.";
      }

      console.log(
        `[Meta Validate] user=${req.user.id} channel=${channel} ` +
        `tokenValid=${result.tokenValid} pageAccessible=${result.pageAccessible} ` +
        `pageSubscribed=${result.pageSubscribed} missingScopes=[${result.missingScopes.join(",")}]`,
      );

      return res.json(result);
    } catch (error) {
      console.error("Error validating Meta integration:", error);
      res.status(500).json({ error: "Server error while validating. Please try again." });
    }
  });

  // Confirm webhook setup for Facebook/Instagram — marks channel as connected
  // Called after user has verified their webhook in Meta Developer Portal.
  app.post("/api/integrations/meta-webhook-confirm", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { channel } = req.body as { channel: 'facebook' | 'instagram' };
      if (channel !== 'facebook' && channel !== 'instagram') {
        return res.status(400).json({ error: "channel must be 'facebook' or 'instagram'" });
      }
      await storage.upsertChannelSetting(req.user.id, channel as any, {
        isConnected: true,
        isEnabled: true,
      });
      console.log(`[Integration] ${channel} webhook confirmed for user ${req.user.id} — channel marked connected`);
      res.json({ ok: true, channel, isConnected: true });
    } catch (error) {
      console.error("Error confirming meta webhook:", error);
      res.status(500).json({ error: "Failed to confirm webhook" });
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

      let finalConfig: Record<string, any> = { ...config };
      let calendlyExtra: {
        calendlyEventTypes?: string[];
        calendlyWebhookStatus?: string;
        calendlyWebhookError?: string;
        message?: string;
      } = {};

      if (type === "calendly") {
        const token = String(config.accessToken || "").trim();
        const logCalendlyConnect = (event: string, payload: Record<string, unknown>) => {
          console.log(
            JSON.stringify({
              tag: "[CalendlyConnect]",
              event,
              userId: req.user!.id,
              ...payload,
            })
          );
        };
        if (!token) {
          return res.status(400).json({
            error: "Enter a Calendly personal access token.",
            errorCode: "invalid_token",
          });
        }

        logCalendlyConnect("endpoint_test", { endpoint: "GET /users/me" });
        const me = await calendlyGetCurrentUser(token);
        const meResource = me.data?.resource;
        logCalendlyConnect("pat_validation_result", {
          ok: me.ok,
          status: me.status,
          resolvedUserUri: meResource?.uri || null,
          resolvedOrganizationUri: meResource?.current_organization || null,
          calendlyResponseBody: me.ok ? { hasResource: !!meResource } : me.data,
        });
        if (me.status === 401) {
          return res.status(400).json({
            error: "Invalid Calendly token. Check that you copied the full personal access token.",
            errorCode: "invalid_token",
          });
        }
        if (me.status === 403) {
          return res.status(400).json({
            error: "Calendly token is missing required scopes. Create a new personal access token with webhook and event type access.",
            errorCode: "missing_scopes",
          });
        }
        if (!me.ok) {
          return res.status(400).json({
            error: calendlyErrorMessage(me.data as any, "Could not validate Calendly token."),
            errorCode: "invalid_token",
          });
        }

        const orgUri = meResource?.current_organization;
        if (!orgUri) {
          logCalendlyConnect("organization_not_found", { resolvedUserUri: meResource?.uri || null });
          return res.status(400).json({
            error: "Calendly organization not found for this token.",
            errorCode: "organization_not_found",
          });
        }

        logCalendlyConnect("endpoint_test", { endpoint: "GET /organizations/:uuid", organizationUri: orgUri });
        const org = await calendlyGetOrganization(token, orgUri);
        logCalendlyConnect("organization_lookup_result", {
          ok: org.ok,
          status: org.status,
          organizationUri: org.data?.resource?.uri || orgUri,
          calendlyResponseBody: org.ok ? { hasResource: !!org.data?.resource } : org.data,
        });
        if (org.status === 403) {
          return res.status(400).json({
            error: "Calendly token is missing organization access. Create a new personal access token with organization access.",
            errorCode: "missing_scopes",
          });
        }
        if (!org.ok || !org.data?.resource?.uri) {
          return res.status(400).json({
            error: "Calendly organization not found for this token.",
            errorCode: "organization_not_found",
          });
        }

        let eventNames: string[] | undefined;
        let calendlyPrimaryEventTypeName = "";
        const userScheduling = meResource?.scheduling_url;
        let calendlyPrimarySchedulingUrl =
          typeof userScheduling === "string" && /^https?:\/\//i.test(userScheduling) ? userScheduling.trim() : "";

        logCalendlyConnect("endpoint_test", { endpoint: "GET /event_types", organizationUri: orgUri });
        const et = await calendlyListEventTypes(token, orgUri);
        const coll = (et.data as { collection?: { name?: string; scheduling_url?: string }[] })?.collection;
        const schedulingUrls = Array.isArray(coll)
          ? coll.map((x) => x.scheduling_url).filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
          : [];
        logCalendlyConnect("event_types_result", {
          ok: et.ok,
          status: et.status,
          detectedSchedulingUrlCount: schedulingUrls.length,
          calendlyResponseBody: et.ok
            ? { eventTypeCount: Array.isArray(coll) ? coll.length : 0 }
            : et.data,
        });
        if (et.status === 403) {
          return res.status(400).json({
            error: "Calendly token is missing event type access. Create a new personal access token with event type access.",
            errorCode: "missing_scopes",
          });
        }
        if (et.ok && Array.isArray(coll)) {
          eventNames = coll.map((x) => x.name).filter(Boolean).slice(0, 20) as string[];
          if (!calendlyPrimarySchedulingUrl && schedulingUrls[0]) {
            calendlyPrimarySchedulingUrl = schedulingUrls[0].trim();
          }
          const primaryMatch = coll.find(
            (x) =>
              typeof x.scheduling_url === "string" &&
              x.scheduling_url.trim() === calendlyPrimarySchedulingUrl,
          );
          calendlyPrimaryEventTypeName =
            (typeof primaryMatch?.name === "string" && primaryMatch.name.trim()) ||
            (typeof coll[0]?.name === "string" && coll[0].name.trim()) ||
            "";
        }

        const webhookUrl = `https://app.whachatcrm.com/api/webhooks/calendly/${req.user.id}`;
        const calendlyWebhookEvents = ["invitee.created", "invitee.canceled"];
        const requestedSigningKey =
          String(config.webhookSigningKey || "").trim() ||
          String(process.env.CALENDLY_WEBHOOK_SIGNING_KEY || "").trim() ||
          crypto.randomBytes(32).toString("hex");
        const webhookPayload: {
          url: string;
          events: string[];
          organization: string;
          scope: string;
          signing_key: string;
        } = {
          url: webhookUrl,
          // Calendly represents reschedules as invitee.canceled (rescheduled=true) + invitee.created.
          events: calendlyWebhookEvents,
          organization: orgUri,
          scope: "organization",
          signing_key: requestedSigningKey,
        };
        logCalendlyConnect("webhook_subscription_payload", {
          callbackUrlUsed: webhookUrl,
          scopeValue: webhookPayload.scope,
          webhookSubscriptionPayload: { ...webhookPayload, signing_key: "[present]" },
        });

        logCalendlyConnect("endpoint_test", { endpoint: "POST /webhook_subscriptions", organizationUri: orgUri });
        const sub = await calendlyCreateWebhookSubscription(token, webhookPayload);
        logCalendlyConnect("webhook_subscription_result", {
          ok: sub.ok,
          status: sub.status,
          callbackUrlUsed: webhookUrl,
          calendlyResponseBody: maskCalendlyWebhookResponse(sub.data),
          calendlyRawErrorResponse: sub.ok ? undefined : sub.rawBody,
        });

        const resource = sub.data?.resource;
        let signingKey = resource?.signing_key || requestedSigningKey;
        let webhookUri = resource?.uri || "";
        let webhookRegistrationError = !sub.ok
          ? calendlyErrorMessage(sub.data as any, "Calendly webhook registration failed.")
          : !webhookUri
            ? "Calendly webhook registration did not return a subscription URI."
            : "";
        let webhookLinkedMessage = "";

        if (!sub.ok && isCalendlyExistingHookError(sub.data, sub.rawBody)) {
          const resolved = await resolveCalendlyExistingHook({
            token,
            orgUri,
            webhookUrl,
            requestedSigningKey,
            log: logCalendlyConnect,
          });
          if (resolved.ok) {
            signingKey = resolved.signingKey;
            webhookUri = resolved.uri;
            webhookRegistrationError = "";
            webhookLinkedMessage = resolved.message;
          } else {
            webhookRegistrationError = resolved.error;
          }
        }

        finalConfig = {
          ...config,
          accessToken: token,
          ...(signingKey ? { webhookSigningKey: signingKey } : {}),
          ...(webhookUri ? { calendlyWebhookSubscriptionUri: webhookUri } : {}),
          calendlyOrganizationUri: orgUri,
          calendlyUserUri: meResource?.uri,
          calendlyUserEmail: meResource?.email || "",
          calendlyUserName: meResource?.name || "",
          calendlyWebhookCallbackUrl: webhookUrl,
          calendlyWebhookStatus: webhookRegistrationError ? "failed" : "connected",
          ...(webhookRegistrationError ? { calendlyWebhookError: webhookRegistrationError } : { calendlyWebhookError: null }),
          connectionStatus: "connected",
          calendlyPrimarySchedulingUrl,
          calendlyPrimaryEventTypeName,
          ...calendlySyncModeConfigPatch(!webhookRegistrationError, !!webhookRegistrationError),
        };
        calendlyExtra = {
          calendlyEventTypes: eventNames,
          ...(webhookLinkedMessage ? { message: webhookLinkedMessage } : {}),
          ...(webhookRegistrationError
            ? {
                calendlyWebhookStatus: "failed",
                calendlyWebhookError: webhookRegistrationError,
                calendlySyncMode: "polling",
                calendlySyncMessage:
                  "Booking link is connected. Booking confirmations will sync by polling (Calendly webhooks unavailable on this plan).",
              }
            : { calendlyWebhookStatus: "connected", calendlySyncMode: "webhook" }),
        };
      }

      if (type === "hubspot") {
        const token = String(config.accessToken || "").trim();
        if (!token) {
          return res.status(400).json({ error: "Private app access token is required" });
        }
        const tokenOk = await hubspotValidatePrivateAppToken(token);
        if (!tokenOk) {
          return res.status(400).json({ error: "Invalid HubSpot token" });
        }
        const syncOptions = ["sync_contacts"];
        finalConfig = {
          ...config,
          accessToken: token,
          syncOptions,
          connectionStatus: "connected",
        };
      }

      // Encrypt sensitive fields before storing
      const encryptedConfig = encryptIntegrationConfig(finalConfig);
      
      const integration = await storage.createIntegration({
        userId: req.user.id,
        type,
        name,
        config: encryptedConfig,
        isActive: true,
      });

      if (type === "calendly" && calendlyExtra?.calendlySyncMode === "polling") {
        const connectUserId = req.user.id;
        setImmediate(() => {
          pollCalendlyBookingsForUser(connectUserId, { manual: true, backfillDays: 7 }).catch((err) =>
            console.error("[CalendlyPoll] connect_initial_poll_failed", connectUserId, err),
          );
        });
      }

      // Dual-write to channelSettings for Facebook/Instagram so the messaging
      // engine (adapters + webhook handler) can find the credentials.
      // channelSettings is the single source of truth for inbound/outbound routing.
      let metaWebhookConfig: { webhookUrl: string; verifyToken: string } | undefined;
      if (type === 'meta_facebook' || type === 'meta_instagram') {
        const channel = type === 'meta_facebook' ? 'facebook' : 'instagram';

        // Generate a stable per-user verify token using HMAC so it is always the
        // same for this user regardless of how many times they reconnect.
        const cryptoMod = await import('crypto');
        const verifyTokenRaw = cryptoMod.createHmac(
          'sha256',
          process.env.SESSION_SECRET || 'whachat-fb-verify-salt'
        ).update(`${req.user.id}:${channel}`).digest('hex').slice(0, 32);

        const channelConfig: Record<string, string> = {
          accessToken: config.accessToken || '',
          pageId: type === 'meta_facebook'
            ? (config.pageId || '')
            : (config.instagramId || config.pageId || ''),
          webhookVerifyToken: verifyTokenRaw,
        };
        if (type === 'meta_instagram') {
          channelConfig.instagramAccountId = config.instagramId || config.pageId || '';
        }
        if (config.appSecret) {
          channelConfig.appSecret = config.appSecret;
        }
        // Persist the resolved account/page name so the channel card can display it
        if (config.pageName) {
          channelConfig.pageName = config.pageName;
        }
        // Start as NOT connected — channel is only marked connected after the user
        // confirms webhook setup via POST /api/integrations/meta-webhook-confirm.
        // This prevents a false "connected" state when inbound messages are not
        // actually working yet.
        await storage.upsertChannelSetting(req.user.id, channel as any, {
          isConnected: false,
          isEnabled: false,
          config: channelConfig,
        });
        const webhookBaseUrl = getAppOrigin();
        metaWebhookConfig = {
          webhookUrl: `${webhookBaseUrl}/api/webhook/meta`,
          verifyToken: verifyTokenRaw,
        };
        console.log(`[Integration] ${channel} channelSettings created/updated for user ${req.user.id} — pageId: ${channelConfig.pageId}, verifyToken stored`);
      }

      // Return with masked config (+ webhook setup info for Meta channels)
      res.status(201).json({
        ...integration,
        config: maskIntegrationConfig(finalConfig),
        ...(metaWebhookConfig ? { webhookSetup: metaWebhookConfig } : {}),
        ...(type === "calendly" ? calendlyExtra : {}),
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

      // Dual-write to channelSettings for Facebook/Instagram on update
      if ((integration.type === 'meta_facebook' || integration.type === 'meta_instagram') && config !== undefined) {
        const channel = integration.type === 'meta_facebook' ? 'facebook' : 'instagram';
        const cryptoMod = await import('crypto');
        const verifyTokenRaw = cryptoMod.createHmac(
          'sha256',
          process.env.SESSION_SECRET || 'whachat-fb-verify-salt'
        ).update(`${req.user.id}:${channel}`).digest('hex').slice(0, 32);
        const channelConfig: Record<string, string> = {
          accessToken: config.accessToken || '',
          pageId: integration.type === 'meta_facebook'
            ? (config.pageId || '')
            : (config.instagramId || config.pageId || ''),
          webhookVerifyToken: verifyTokenRaw,
        };
        if (integration.type === 'meta_instagram') {
          channelConfig.instagramAccountId = config.instagramId || config.pageId || '';
        }
        if (config.appSecret) {
          channelConfig.appSecret = config.appSecret;
        }
        const channelUpdates: any = { config: channelConfig };
        if (isActive === false) {
          // Explicit deactivation — disconnect and disable
          channelUpdates.isConnected = false;
          channelUpdates.isEnabled = false;
        }
        // When updating credentials only: preserve the existing isConnected value.
        // Only meta-webhook-confirm may promote a channel to isConnected: true.
        await storage.upsertChannelSetting(req.user.id, channel as any, channelUpdates);
        console.log(`[Integration] ${channel} channelSettings config updated for user ${req.user.id} — pageId: ${channelConfig.pageId}`);
      }

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

  /**
   * Facebook Messenger disconnect by user/channel — does not require an integration UUID.
   * Clears facebook channel_settings only; does not touch WhatsApp/WABA, Instagram, or SMS.
   */
  app.post("/api/integrations/facebook/disconnect", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = req.user.id;
      const allIntegrations = await storage.getIntegrations(userId);
      const facebookIntegrations = allIntegrations.filter((i) => i.type === "meta_facebook");
      const hadIntegrationRow = facebookIntegrations.length > 0;
      const clearedFields: string[] = [];

      for (const fb of facebookIntegrations) {
        await storage.deleteIntegration(fb.id);
        clearedFields.push(`integration:${fb.id}`);
      }

      await storage.upsertChannelSetting(userId, "facebook", {
        isConnected: false,
        isEnabled: false,
        config: {},
      });

      clearedFields.push("channel_settings:facebook(pageId,pageAccessToken,pageName,...)");
      const channelSettingsUpdated = true;

      console.log(
        `[FacebookDisconnect] ${JSON.stringify({
          userId,
          hadIntegrationRow,
          clearedFields,
          channelSettingsUpdated,
        })}`,
      );

      return res.json({ success: true, hadIntegrationRow, clearedFields });
    } catch (error) {
      console.error("Error disconnecting Facebook Messenger:", error);
      return res.status(500).json({ error: "Failed to disconnect Facebook Messenger" });
    }
  });

  app.get("/api/integrations/:id/calendly-webhooks", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const integration = await storage.getIntegration(req.params.id);
      if (!integration || integration.userId !== req.user.id || integration.type !== "calendly") {
        return res.status(404).json({ error: "Calendly integration not found" });
      }

      const config = decryptIntegrationConfig((integration.config || {}) as Record<string, any>);
      const token = typeof config.accessToken === "string" ? config.accessToken.trim() : "";
      const organizationUri =
        typeof config.calendlyOrganizationUri === "string" ? config.calendlyOrganizationUri.trim() : "";
      if (!token || !organizationUri) {
        return res.status(400).json({
          error: "Calendly token or organization is missing. Reconnect Calendly, then sync again.",
        });
      }

      const listed = await calendlyListWebhookSubscriptions(token, organizationUri);
      const callbackUrl = `https://app.whachatcrm.com/api/webhooks/calendly/${req.user.id}`;
      const subscriptions = (listed.data?.collection || []).map((s) => ({
        uri: s.uri || "",
        callbackUrl: s.callback_url || "",
        events: Array.isArray(s.events) ? s.events : [],
        organization: s.organization || "",
        scope: s.scope || "",
        state: s.state || "",
        createdAt: s.created_at || null,
        updatedAt: s.updated_at || null,
        matchesProductionCallback: s.callback_url === callbackUrl,
        includesInviteeCreated: Array.isArray(s.events) && s.events.includes("invitee.created"),
      }));

      console.log(
        JSON.stringify({
          tag: "[CalendlyWebhookSubscriptions]",
          userId: req.user.id,
          integrationId: integration.id,
          status: listed.status,
          ok: listed.ok,
          count: subscriptions.length,
          expectedCallbackUrl: callbackUrl,
          hasMatchingInviteeCreated: subscriptions.some(
            (s) => s.matchesProductionCallback && s.includesInviteeCreated
          ),
        })
      );

      return res.status(listed.ok ? 200 : 502).json({
        ok: listed.ok,
        status: listed.status,
        expectedCallbackUrl: callbackUrl,
        subscriptions,
        error: listed.ok ? undefined : calendlyErrorMessage(listed.data as any, "Could not list Calendly webhooks."),
      });
    } catch (error) {
      console.error("Error listing Calendly webhook subscriptions:", error);
      return res.status(500).json({ error: "Failed to list Calendly webhook subscriptions" });
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

      if (integration.type === "calendly") {
        const raw = integration.config as Record<string, any>;
        const dec = decryptIntegrationConfig(raw);
        const token = typeof dec.accessToken === "string" ? dec.accessToken.trim() : "";
        const whUri = typeof dec.calendlyWebhookSubscriptionUri === "string" ? dec.calendlyWebhookSubscriptionUri : "";
        if (token && whUri) {
          const del = await calendlyDeleteWebhookSubscription(token, whUri);
          if (!del.ok) {
            console.warn(`[Calendly] Unsubscribe failed (${del.status}) for user ${req.user.id}`, del.data);
          }
        }
      }

      await storage.deleteIntegration(req.params.id);

      // Dual-write: disconnect channelSettings for Facebook/Instagram on delete
      if (integration.type === 'meta_facebook' || integration.type === 'meta_instagram') {
        const channel = integration.type === 'meta_facebook' ? 'facebook' : 'instagram';
        await storage.upsertChannelSetting(req.user.id, channel as any, {
          isConnected: false,
          isEnabled: false,
          config: {},
        });
        console.log(`[Integration] ${channel} channelSettings disconnected for user ${req.user.id} after integration deletion`);
      }

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
      
      const rawIntegrationConfig = integration.config as Record<string, any>;
      const config = decryptIntegrationConfig(rawIntegrationConfig);
      const syncOptions = config.syncOptions || [];
      let syncResult: {
        success: boolean;
        message: string;
        details: string;
        lastHubSpotSync?: Record<string, unknown>;
        error?: string;
      } = { success: true, message: `${integration.name} sync started`, details: "" };

      if (integration.type === "google_sheets" && syncOptions.includes("export_leads")) {
        const chats = await storage.getChats(req.user.id);
        // Phase E Step 2: overlay CRM fields from contacts (authoritative source)
        const contactsForSync = await storage.getContacts(req.user.id);
        const contactCrmSync = new Map(
          contactsForSync
            .filter(c => c.whatsappId || c.phone)
            .map(c => [(c.whatsappId || c.phone || '').replace(/\D/g, ''), c])
        );
        const rows = chats.map(chat => {
          const rawPhone = chat.whatsappPhone || "";
          const norm = isLegacyCalendlyWorkflowChat(rawPhone) ? "" : rawPhone.replace(/\D/g, "");
          const ct = norm ? contactCrmSync.get(norm) : undefined;
          const phoneField = isLegacyCalendlyWorkflowChat(rawPhone)
            ? rawPhone.slice(LEGACY_CHAT_CALENDLY_PREFIX.length)
            : rawPhone;
          return {
            name: chat.name,
            phone: phoneField,
            tag: ct?.tag ?? chat.tag,
            pipelineStage: ct?.pipelineStage ?? chat.pipelineStage,
            status: chat.status,
            notes: ct?.notes ?? chat.notes ?? '',
            lastMessage: chat.lastMessage,
            createdAt: chat.createdAt?.toISOString() || '',
            updatedAt: chat.updatedAt?.toISOString() || '',
          };
        });
        
        syncResult.details = `Prepared ${rows.length} leads for export. Configure Google Sheets API to enable automatic sync.`;
        console.log(`Google Sheets sync: ${rows.length} leads ready for user ${req.user.id}`);
      } else if (integration.type === "calendly") {
        const token = String(config.accessToken || "").trim();
        let orgUri = String(config.calendlyOrganizationUri || "").trim();
        if (!token) {
          return res.status(400).json({
            success: false,
            error: "Invalid Calendly token. Reconnect Calendly with a valid personal access token.",
            message: "Calendly webhook retry failed",
            details: "",
          });
        }

        const me = await calendlyGetCurrentUser(token);
        const meResource = me.data?.resource;
        if (!me.ok) {
          return res.status(400).json({
            success: false,
            error:
              me.status === 401
                ? "Invalid Calendly token. Reconnect Calendly with a valid personal access token."
                : "Could not refresh Calendly account details. Reconnect Calendly if this continues.",
            message: "Calendly refresh failed",
            details: "",
          });
        }
        if (!orgUri && meResource?.current_organization) {
          orgUri = meResource.current_organization;
        }
        if (!orgUri) {
          return res.status(400).json({
            success: false,
            error: "Calendly organization not found. Reconnect Calendly to resolve the organization.",
            message: "Calendly webhook retry failed",
            details: "",
          });
        }

        let refreshedBookingUrl =
          typeof meResource?.scheduling_url === "string" && /^https?:\/\//i.test(meResource.scheduling_url)
            ? meResource.scheduling_url.trim()
            : String(config.calendlyPrimarySchedulingUrl || "").trim();
        const eventTypes = await calendlyListEventTypes(token, orgUri);
        const eventTypeRows = eventTypes.data?.collection;
        if (eventTypes.ok && Array.isArray(eventTypeRows)) {
          const fromEventType = eventTypeRows
            .map((x) => x.scheduling_url)
            .find((u) => typeof u === "string" && /^https?:\/\//i.test(u));
          if (!refreshedBookingUrl && fromEventType) {
            refreshedBookingUrl = fromEventType.trim();
          }
        }

        const refreshCalendlyConfigPatch = () => ({
          ...config,
          calendlyOrganizationUri: orgUri,
          calendlyUserUri: meResource?.uri || config.calendlyUserUri,
          calendlyUserEmail: meResource?.email || config.calendlyUserEmail || "",
          calendlyUserName: meResource?.name || config.calendlyUserName || "",
          calendlyPrimarySchedulingUrl: refreshedBookingUrl,
          connectionStatus: "connected",
        });

        if (resolveCalendlySyncModeFromConfig(config) === "polling") {
          await storage.updateIntegration(req.params.id, {
            lastSyncAt: new Date(),
            config: encryptIntegrationConfig({
              ...refreshCalendlyConfigPatch(),
              ...calendlySyncModeConfigPatch(false, true),
            }),
          });
          const pollResult = await pollCalendlyBookingsForUser(req.user.id, { manual: true });
          return res.json({
            success: true,
            message: "Calendly polling sync active",
            details: pollResult.ok
              ? `Imported ${pollResult.imported} booking(s)${pollResult.canceled ? `, ${pollResult.canceled} cancellation(s)` : ""} from Calendly. Booking confirmations will continue syncing by polling.`
              : `Polling sync is active but the latest import did not complete: ${pollResult.error || "unknown error"}. Your booking link remains connected.`,
            calendlySyncMode: "polling",
            calendlyWebhookStatus: String(config.calendlyWebhookStatus || "failed"),
            poll: pollResult,
          });
        }

        const webhookUrl = `https://app.whachatcrm.com/api/webhooks/calendly/${req.user.id}`;
        const calendlyWebhookEvents = ["invitee.created", "invitee.canceled"];
        const requestedSigningKey =
          String(config.webhookSigningKey || "").trim() ||
          String(process.env.CALENDLY_WEBHOOK_SIGNING_KEY || "").trim() ||
          crypto.randomBytes(32).toString("hex");
        const payload: {
          url: string;
          events: string[];
          organization: string;
          scope: string;
          signing_key: string;
        } = {
          url: webhookUrl,
          // Calendly represents reschedules as invitee.canceled (rescheduled=true) + invitee.created.
          events: calendlyWebhookEvents,
          organization: orgUri,
          scope: "organization",
          signing_key: requestedSigningKey,
        };
        console.log(
          JSON.stringify({
            tag: "[CalendlyConnect]",
            event: "webhook_retry_payload",
            userId: req.user.id,
            callbackUrlUsed: webhookUrl,
            scopeValue: payload.scope,
            webhookPostPayload: { ...payload, signing_key: "[present]" },
          })
        );
        const sub = await calendlyCreateWebhookSubscription(token, payload);
        console.log(
          JSON.stringify({
            tag: "[CalendlyConnect]",
            event: "webhook_retry_result",
            userId: req.user.id,
            ok: sub.ok,
            status: sub.status,
            calendlyResponseBody:
              sub.data?.resource && typeof sub.data.resource === "object"
                ? {
                    ...sub.data,
                    resource: {
                      ...sub.data.resource,
                      signing_key: sub.data.resource.signing_key ? "[present]" : undefined,
                    },
                  }
                : sub.data,
            calendlyRawErrorResponse: sub.ok ? undefined : sub.rawBody,
          })
        );
        const resource = sub.data?.resource;
        if (!sub.ok || !resource?.uri) {
          if (!sub.ok && isCalendlyExistingHookError(sub.data, sub.rawBody)) {
            const resolved = await resolveCalendlyExistingHook({
              token,
              orgUri,
              webhookUrl,
              requestedSigningKey,
              log: (event, payload) => {
                console.log(
                  JSON.stringify({
                    tag: "[CalendlyConnect]",
                    event,
                    userId: req.user!.id,
                    ...payload,
                  })
                );
              },
            });
            if (resolved.ok) {
              await storage.updateIntegration(req.params.id, {
                lastSyncAt: new Date(),
                config: encryptIntegrationConfig({
                  ...config,
                  calendlyOrganizationUri: orgUri,
                  calendlyUserUri: meResource?.uri || config.calendlyUserUri,
                  calendlyUserEmail: meResource?.email || config.calendlyUserEmail || "",
                  calendlyUserName: meResource?.name || config.calendlyUserName || "",
                  calendlyPrimarySchedulingUrl: refreshedBookingUrl,
                  webhookSigningKey: resolved.signingKey,
                  calendlyWebhookSubscriptionUri: resolved.uri,
                  calendlyWebhookCallbackUrl: webhookUrl,
                  calendlyWebhookStatus: "connected",
                  calendlyWebhookError: null,
                  connectionStatus: "connected",
                  ...calendlySyncModeConfigPatch(true, false),
                }),
              });
              return res.json({
                success: true,
                message: "Existing Calendly webhook found and linked.",
                details: "Booking sync is active for booking confirmations and cancellations.",
                calendlySyncMode: "webhook",
                calendlyWebhookStatus: "connected",
              });
            }
          }
          const d = sub.data as { message?: string; title?: string; details?: { message?: string }[] };
          const errMsg =
            d?.message ||
            d?.title ||
            (Array.isArray(d?.details) && d.details[0]?.message) ||
            "Calendly webhook registration failed.";
          await storage.updateIntegration(req.params.id, {
            lastSyncAt: new Date(),
            config: encryptIntegrationConfig({
              ...config,
              calendlyOrganizationUri: orgUri,
              calendlyUserUri: meResource?.uri || config.calendlyUserUri,
              calendlyUserEmail: meResource?.email || config.calendlyUserEmail || "",
              calendlyUserName: meResource?.name || config.calendlyUserName || "",
              calendlyPrimarySchedulingUrl: refreshedBookingUrl,
              calendlyWebhookStatus: "failed",
              calendlyWebhookError: errMsg,
              calendlyWebhookCallbackUrl: webhookUrl,
              connectionStatus: "connected",
              ...calendlySyncModeConfigPatch(false, true),
            }),
          });
          const pollResult = await pollCalendlyBookingsForUser(req.user.id, { manual: true });
          return res.json({
            success: true,
            message: "Calendly polling sync active",
            details: pollResult.ok
              ? `Imported ${pollResult.imported} booking(s)${pollResult.canceled ? `, ${pollResult.canceled} cancellation(s)` : ""} from Calendly. Booking confirmations will continue syncing by polling.`
              : `Polling sync is active but the latest import did not complete: ${pollResult.error || "unknown error"}. Your booking link remains connected.`,
            calendlySyncMode: "polling",
            calendlyWebhookStatus: "failed",
            poll: pollResult,
          });
        }
        await storage.updateIntegration(req.params.id, {
          lastSyncAt: new Date(),
          config: encryptIntegrationConfig({
            ...config,
            calendlyOrganizationUri: orgUri,
            calendlyUserUri: meResource?.uri || config.calendlyUserUri,
            calendlyUserEmail: meResource?.email || config.calendlyUserEmail || "",
            calendlyUserName: meResource?.name || config.calendlyUserName || "",
            calendlyPrimarySchedulingUrl: refreshedBookingUrl,
            webhookSigningKey: resource.signing_key || requestedSigningKey,
            calendlyWebhookSubscriptionUri: resource.uri,
            calendlyWebhookCallbackUrl: webhookUrl,
            calendlyWebhookStatus: "connected",
            calendlyWebhookError: null,
            connectionStatus: "connected",
            ...calendlySyncModeConfigPatch(true, false),
          }),
        });
        return res.json({
          success: true,
          message: "Calendly refreshed",
          details: "Booking link was refreshed and webhook subscription is active for booking confirmations and cancellations.",
          calendlySyncMode: "webhook",
          calendlyWebhookStatus: "connected",
        });
      } else if (integration.type === "hubspot") {
        if (config.connectionStatus !== "connected") {
          return res.status(400).json({
            success: false,
            error: "HubSpot is not connected. Disconnect and reconnect with a valid token.",
          });
        }
        if (!syncOptions.includes("sync_contacts")) {
          return res.status(400).json({
            success: false,
            error: 'Enable "Sync Contacts" for this integration to push contacts to HubSpot.',
          });
        }
        const token = typeof config.accessToken === "string" ? config.accessToken.trim() : "";
        if (!token) {
          return res.status(400).json({
            success: false,
            error: "Missing HubSpot token. Disconnect and reconnect the integration.",
          });
        }
        const chats = await storage.getChats(req.user.id);
        const contactsForSync = await storage.getContacts(req.user.id);
        const contactCrmSync = new Map(
          contactsForSync
            .filter((c) => c.whatsappId || c.phone)
            .map((c) => [(c.whatsappId || c.phone || "").replace(/\D/g, ""), c])
        );

        const leads = chats.map((chat) => {
          const rawPhone = chat.whatsappPhone || "";
          const norm = isLegacyCalendlyWorkflowChat(rawPhone) ? "" : rawPhone.replace(/\D/g, "");
          const ct = norm ? contactCrmSync.get(norm) : undefined;
          const phoneField = isLegacyCalendlyWorkflowChat(rawPhone)
            ? rawPhone.slice(LEGACY_CHAT_CALENDLY_PREFIX.length)
            : rawPhone;
          const email = ct?.email?.trim() || undefined;
          const phone = phoneField || ct?.phone || undefined;
          const name = ((ct?.name || chat.name || "").trim() || "WhatsApp lead").slice(0, 500);
          const pipelineStage = (ct?.pipelineStage ?? chat.pipelineStage)?.trim() || undefined;
          const tag = (ct?.tag ?? chat.tag)?.trim() || undefined;
          return { email: email || undefined, phone, name, pipelineStage, tag };
        });

        let outcome;
        try {
          outcome = await pushLeadsToHubSpot(token, leads);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "HubSpot sync failed";
          console.error(`HubSpot sync error for user ${req.user.id}:`, msg);
          return res.status(502).json({
            success: false,
            error: msg,
            message: "HubSpot sync failed",
            details: "",
          });
        }

        const lastHubSpotSync = {
          at: new Date().toISOString(),
          pushed: outcome.pushed,
          failed: outcome.failed,
          skipped: outcome.skipped,
          errors: outcome.errors,
          summary: outcome.summary,
        };

        const mergedHubspotConfig = encryptIntegrationConfig({
          ...config,
          lastHubSpotSync,
        });

        await storage.updateIntegration(req.params.id, {
          lastSyncAt: new Date(),
          config: mergedHubspotConfig,
        });

        syncResult = {
          success: outcome.failed === 0,
          message:
            outcome.failed === 0
              ? "HubSpot sync completed"
              : "HubSpot sync completed with errors",
          details: outcome.summary,
          lastHubSpotSync,
        };

        console.log(
          `HubSpot sync user=${req.user.id} pushed=${outcome.pushed} failed=${outcome.failed} skipped=${outcome.skipped}`
        );
        return res.json(syncResult);
      } else {
        syncResult.details = "Sync initiated. External service will send data via webhook.";
      }

      await storage.updateIntegration(req.params.id, { lastSyncAt: new Date() });
      
      console.log(`Sync triggered for ${integration.type} integration ${integration.id}`);
      
      res.json(syncResult);
    } catch (error) {
      console.error("Error syncing integration:", error);
      res.status(500).json({ error: "Failed to sync integration" });
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
      
      const { name, description, nodes, edges, triggerKeywords, triggerOnNewChat, triggerChannels } = req.body;
      
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
        triggerChannels: triggerChannels || [],
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
      
      const { name, description, nodes, edges, triggerKeywords, triggerOnNewChat, triggerChannels, isActive } = req.body;
      
      const flow = await storage.updateChatbotFlow(req.params.id, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(nodes !== undefined && { nodes }),
        ...(edges !== undefined && { edges }),
        ...(triggerKeywords !== undefined && { triggerKeywords }),
        ...(triggerOnNewChat !== undefined && { triggerOnNewChat }),
        ...(triggerChannels !== undefined && { triggerChannels }),
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

      // Assign to salesperson with fewest bookings
      const { pickSalespersonForDemoAssignment } = await import("./demoAssignmentService");
      const assigned = await pickSalespersonForDemoAssignment();
      if (!assigned) {
        return res.status(400).json({ error: "No salespeople available" });
      }
      const salesperson = await storage.getSalesperson(assigned.id);
      if (!salesperson) {
        return res.status(400).json({ error: "No salespeople available" });
      }

      const booking = await storage.createDemoBooking({
        salespersonId: salesperson.id,
        visitorName: name,
        visitorEmail: email,
        visitorPhone: phone,
        scheduledDate: new Date(scheduledDate),
        consentGiven: consent,
        status: "pending_acceptance",
        assignedAt: new Date(),
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
  const _adminTokenSecret = process.env.SESSION_SECRET || 'whatsapp-crm-secret-key-change-in-production';
  function computeAdminToken(hash: string): string {
    return crypto.createHmac('sha256', _adminTokenSecret).update(hash).digest('hex');
  }
  async function verifyAdminToken(token: string): Promise<boolean> {
    const storedHash = await storage.getAdminPasswordHash();
    if (!storedHash) return false;
    return computeAdminToken(storedHash) === token;
  }

  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      const storedHash = await storage.getAdminPasswordHash();

      if (!storedHash) {
        const hash = await bcrypt.hash(password, 10);
        await storage.setAdminPassword(hash);
        (req.session as any).isAdmin = true;
        const token = computeAdminToken(hash);
        return req.session.save((err) => {
          if (err) console.error('[Admin] Session save error on setup:', err);
          res.json({ success: true, token, message: "Admin password set" });
        });
      }

      const valid = await bcrypt.compare(password, storedHash);
      if (!valid) return res.status(401).json({ error: "Invalid password" });

      (req.session as any).isAdmin = true;
      const token = computeAdminToken(storedHash);
      req.session.save((err) => {
        if (err) console.error('[Admin] Session save error:', err);
        res.json({ success: true, token });
      });
    } catch (error) {
      console.error("Error in admin login:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/admin/check", async (req, res) => {
    if ((req.session as any)?.isAdmin === true) return res.json({ isAdmin: true });
    const token = req.headers['x-admin-token'] as string;
    if (token) {
      const valid = await verifyAdminToken(token);
      if (valid) return res.json({ isAdmin: true });
    }
    res.json({ isAdmin: false });
  });

  app.post("/api/admin/logout", async (req, res) => {
    (req.session as any).isAdmin = false;
    res.json({ success: true });
  });

  // Admin middleware — accepts session OR persistent token header
  const requireAdmin = async (req: any, res: any, next: any) => {
    if ((req.session as any)?.isAdmin === true) return next();
    const token = req.headers['x-admin-token'] as string;
    if (token && await verifyAdminToken(token)) return next();
    return res.status(401).json({ error: "Admin authentication required" });
  };

  /**
   * Preflight-only matrix: validates optional `WA_MATRIX_*` public URLs (HTTPS, MIME, length, no CDN/proxy).
   * Does not call Graph. Set env URLs to exercise image / PDF / video / carousel-style image checks.
   */
  app.get("/api/admin/wa-template-media-matrix", requireAdmin, async (_req, res) => {
    try {
      const { getBundledFfmpegPath } = await import("./templateVideoTranscode");
      const { validateProductionTemplateMediaUrl } = await import("./templateMediaProductionValidator");
      const matrix: Record<string, unknown> = {
        ffmpegAvailable: !!getBundledFfmpegPath(),
        r2PublicBaseConfigured: !!(process.env.CLOUDFLARE_R2_PUBLIC_URL || "").trim(),
        graphAccepted: "not_called",
        webhookDelivered: "not_observed (run a live send against WABA to test)",
        finalStatus: "preflight_only",
      };
      const cases: Array<{
        key: string;
        envKey: string;
        paramType: "image" | "video" | "document";
        inCarousel: boolean;
      }> = [
        { key: "image_template", envKey: "WA_MATRIX_IMAGE_URL", paramType: "image", inCarousel: false },
        { key: "pdf_template", envKey: "WA_MATRIX_PDF_URL", paramType: "document", inCarousel: false },
        { key: "video_template", envKey: "WA_MATRIX_VIDEO_URL", paramType: "video", inCarousel: false },
        { key: "carousel_card_image", envKey: "WA_MATRIX_CAROUSEL_IMAGE_URL", paramType: "image", inCarousel: true },
      ];
      for (const c of cases) {
        const url = (process.env[c.envKey] || "").trim();
        if (!url) {
          matrix[c.key] = { skipped: true, hint: `Set ${c.envKey} to a public https URL` };
          continue;
        }
        const v = await validateProductionTemplateMediaUrl({
          url,
          inCarousel: c.inCarousel,
          paramType: c.paramType,
        });
        matrix[c.key] = v.ok
          ? {
              preflightPassed: true,
              httpStatus: v.httpStatus,
              contentType: v.contentType,
              contentLength: v.contentLength,
            }
          : { preflightPassed: false, errorCode: v.code, detail: v.detail };
      }
      matrix.text_template = {
        skipped: true,
        note: "Text templates have no media URL — no preflight row",
      };
      res.json(matrix);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: msg });
    }
  });

  // Admin: Manual IndexNow submission
  app.post("/api/admin/indexnow/submit", requireAdmin, async (req, res) => {
    try {
      const { urls } = req.body;
      const { submitNow, PUBLIC_PAGES } = await import("./indexNow");
      const urlsToSubmit: string[] = Array.isArray(urls) && urls.length > 0
        ? urls
        : PUBLIC_PAGES;
      const result = await submitNow(urlsToSubmit);
      res.json({
        submitted: urlsToSubmit,
        count: urlsToSubmit.length,
        result,
      });
    } catch (error: any) {
      console.error("[IndexNow] Admin submit error:", error);
      res.status(500).json({ error: error.message || "Submission failed" });
    }
  });

  // Admin: Trigger content-diff detection and targeted IndexNow submission
  // Compares current blog posts / PAGE_META against stored snapshot, fires
  // onBlogPostPublished / onLandingPageCreated / onPageUpdated for any changes.
  app.post("/api/admin/indexnow/detect", requireAdmin, async (req, res) => {
    try {
      const { detectAndSubmitNewContent } = await import("./indexNow");
      await detectAndSubmitNewContent();
      res.json({ ok: true, message: "Content detection and targeted submission complete. Check server logs for details." });
    } catch (error: any) {
      console.error("[IndexNow] Admin detect error:", error);
      res.status(500).json({ error: error.message || "Detection failed" });
    }
  });

  app.get("/api/admin/inventory/compliance-diagnostics", requireAdmin, async (_req, res) => {
    try {
      const { getInventoryComplianceDiagnostics } = await import("./inventory/inventoryComplianceDiagnostics");
      const diagnostics = await getInventoryComplianceDiagnostics();
      res.json(diagnostics);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[admin] inventory compliance diagnostics failed", msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/admin/inventory/resync-all", requireAdmin, async (_req, res) => {
    try {
      const { listAllConnectedInventorySourceIds } = await import("./inventory/inventoryComplianceDiagnostics");
      const { startInventorySourceSync } = await import("./inventory/inventorySyncService");
      const sources = await listAllConnectedInventorySourceIds();
      let started = 0;
      let skipped = 0;
      const details: { id: string; provider: string; started: boolean; reason?: string }[] = [];

      for (const source of sources) {
        const outcome = await startInventorySourceSync(source.userId, source.id);
        if (outcome.started) {
          started += 1;
          details.push({ id: source.id, provider: source.provider, started: true });
        } else {
          skipped += 1;
          details.push({
            id: source.id,
            provider: source.provider,
            started: false,
            reason: outcome.reason,
          });
        }
      }

      res.json({ sources: sources.length, started, skipped, details });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[admin] inventory resync-all failed", msg);
      res.status(500).json({ error: msg });
    }
  });

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
      const raw = { ...req.body } as Record<string, unknown>;
      if (raw.role === "demo") raw.role = "sales";
      if (raw.taskPayoutAmount === "" || raw.taskPayoutAmount === undefined) delete raw.taskPayoutAmount;
      if (raw.calendarLink === "") raw.calendarLink = null;
      const data = insertSalespersonSchema.parse(raw);
      const loginCode = await storage.generateUniqueLoginCode();
      const person = await storage.createSalesperson({ ...data, loginCode });
      
      // Send welcome email with login credentials
      sendSalespersonWelcomeEmail(
        person.name,
        person.email,
        person.loginCode,
        person.role ?? "sales",
        getEffectiveTaskPayoutDollars(person)
      )
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
      const { name, email, phone, isActive, calendarLink, role, taskPayoutAmount } = req.body as Record<string, unknown>;
      if (role !== undefined && role !== null) {
        const r = String(role);
        const normalized = r === "demo" ? "sales" : r;
        if (!["sales", "setup", "both"].includes(normalized)) {
          return res.status(400).json({ error: "Invalid role (use sales, setup, or both)" });
        }
      }
      let resolvedTaskPayout: string | null | undefined;
      if (Object.prototype.hasOwnProperty.call(req.body, "taskPayoutAmount")) {
        if (taskPayoutAmount === null || taskPayoutAmount === "" || taskPayoutAmount === undefined) {
          resolvedTaskPayout = null;
        } else {
          const n = Number(taskPayoutAmount);
          if (!Number.isFinite(n) || n < 0) {
            return res.status(400).json({ error: "Invalid task payout amount" });
          }
          resolvedTaskPayout = n.toFixed(2);
        }
      }
      const person = await storage.updateSalesperson(req.params.id, {
        ...(name !== undefined && { name: name as string }),
        ...(email !== undefined && { email: email as string }),
        ...(phone !== undefined && { phone: phone as string | null }),
        ...(isActive !== undefined && { isActive: !!isActive }),
        ...(calendarLink !== undefined && {
          calendarLink: calendarLink === "" || calendarLink === null ? null : String(calendarLink),
        }),
        ...(role !== undefined &&
          role !== null && {
            role: (String(role) === "demo" ? "sales" : String(role)) as "sales" | "setup" | "both",
          }),
        ...(resolvedTaskPayout !== undefined && { taskPayoutAmount: resolvedTaskPayout }),
      });
      res.json(person);
    } catch (error) {
      console.error("Error updating salesperson:", error);
      res.status(500).json({ error: "Failed to update salesperson" });
    }
  });

  // Admin: Update Growth Engine concierge / setup task (internal ops)
  app.patch("/api/admin/growth-engine-setup-tasks/:id", requireAdmin, async (req, res) => {
    try {
      const task = await storage.getGrowthEngineSetupTaskById(req.params.id);
      if (!task) return res.status(404).json({ error: "Task not found" });
      const prevStatus = task.status;
      const { status, sessionBookedAt, salespersonId, internalNotes } = req.body as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      if (internalNotes !== undefined) {
        updates.internalNotes = internalNotes === null || internalNotes === "" ? null : String(internalNotes);
      }
      if (salespersonId !== undefined) {
        updates.salespersonId =
          salespersonId === null || salespersonId === "" ? null : String(salespersonId);
      }
      if (sessionBookedAt !== undefined) {
        updates.sessionBookedAt = sessionBookedAt ? new Date(String(sessionBookedAt)) : null;
      }
      if (status !== undefined) {
        const s = String(status);
        if (!Object.values(GE_SETUP_STATUS).includes(s as (typeof GE_SETUP_STATUS)[keyof typeof GE_SETUP_STATUS])) {
          return res.status(400).json({ error: "Invalid status" });
        }
        updates.status = s;
        if (s === GE_SETUP_STATUS.sessionBooked && (updates.sessionBookedAt == null || updates.sessionBookedAt === undefined)) {
          updates.sessionBookedAt = new Date();
        }
        if (s === GE_SETUP_STATUS.setupCompleted) {
          updates.completedAt = task.completedAt || new Date();
        }
      }
      const updated = await storage.updateGrowthEngineSetupTask(task.id, updates as any);
      if (
        updates.status === GE_SETUP_STATUS.setupCompleted &&
        prevStatus !== GE_SETUP_STATUS.setupCompleted &&
        updated?.salespersonId
      ) {
        const sp = await storage.getSalesperson(updated.salespersonId);
        if (sp) {
          await storage.creditSalespersonSetupTaskCompletion(sp.id, { taskPayoutAmount: sp.taskPayoutAmount });
        }
      }
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating GE setup task:", error);
      res.status(500).json({ error: "Failed to update task" });
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
      const { status, notes, salespersonId } = req.body as {
        status?: string;
        notes?: string;
        salespersonId?: string | null;
      };
      const { DEMO_BOOKING_STATUS } = await import("@shared/salesCompensation");

      // Get the current booking to check if status is changing to converted
      const currentBooking = await storage.getDemoBooking(req.params.id);

      const bookingUpdates: Record<string, unknown> = {};
      if (status !== undefined) bookingUpdates.status = status;
      if (notes !== undefined) bookingUpdates.notes = notes;
      if (salespersonId !== undefined) {
        bookingUpdates.salespersonId = salespersonId || null;
        if (salespersonId) {
          bookingUpdates.status = DEMO_BOOKING_STATUS.pendingAcceptance;
          bookingUpdates.assignedAt = new Date();
          bookingUpdates.acceptedAt = null;
        }
      }

      const booking = await storage.updateDemoBooking(req.params.id, bookingUpdates as any);
      
      // If status changed to 'converted', automatically create a conversion record
      if (status === 'converted' && currentBooking && currentBooking.status !== 'converted') {
        const { SALES_CONVERSION_PAYOUT_DOLLARS } = await import("@shared/salesCompensation");
        await storage.createSalesConversion({
          bookingId: req.params.id,
          salespersonId: currentBooking.salespersonId,
          userId: null,
          amount: String(SALES_CONVERSION_PAYOUT_DOLLARS),
          demoDate: currentBooking.scheduledDate,
          conversionDate: new Date(),
          payoutEligible: true,
          eligibilityNotes: "Manually marked converted by admin",
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
      const { SALES_CONVERSION_PAYOUT_DOLLARS } = await import("@shared/salesCompensation");
      const conversion = await storage.createSalesConversion({
        bookingId,
        salespersonId,
        userId,
        amount: amount || String(SALES_CONVERSION_PAYOUT_DOLLARS),
        conversionDate: new Date(),
        payoutEligible: true,
      });
      res.json(conversion);
    } catch (error) {
      console.error("Error creating conversion:", error);
      res.status(500).json({ error: "Failed to create conversion" });
    }
  });

  // Admin: Merge duplicate contacts that share the same WhatsApp/phone number
  app.post("/api/admin/merge-duplicate-contacts", requireAdmin, async (req, res) => {
    try {
      const dryRun = req.body.dryRun === true;
      const filterUserId = req.body.userId as string | undefined;

      // Fetch all contacts with a phone or whatsapp_id set
      const allContacts = await db.select().from(contactsTable);

      // Group contacts by (userId, normalised phone digits)
      const groups = new Map<string, typeof allContacts>();
      for (const c of allContacts) {
        if (filterUserId && c.userId !== filterUserId) continue;
        const raw = c.whatsappId || c.phone || '';
        if (!raw) continue;
        const digits = raw.replace(/\D/g, '');
        if (!digits) continue;
        const key = `${c.userId}::${digits}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(c);
      }

      const report: any[] = [];

      for (const [key, group] of Array.from(groups.entries())) {
        if (group.length < 2) continue;

        // Get message counts per contact
        const counts = await Promise.all(group.map(async (c) => {
          const rows = await db.execute(sql`
            SELECT COUNT(*) as cnt FROM messages m
            JOIN conversations cv ON m.conversation_id = cv.id
            WHERE cv.contact_id = ${c.id}
          `);
          return { contact: c, msgCount: Number((rows.rows[0] as any).cnt) };
        }));

        // Winner = contact with the most messages. On a tie, prefer the one with whatsapp_id set, then oldest.
        counts.sort((a, b) => {
          if (b.msgCount !== a.msgCount) return b.msgCount - a.msgCount;
          if (a.contact.whatsappId && !b.contact.whatsappId) return -1;
          if (!a.contact.whatsappId && b.contact.whatsappId) return 1;
          return new Date(a.contact.createdAt!).getTime() - new Date(b.contact.createdAt!).getTime();
        });

        const winner = counts[0].contact;
        const losers = counts.slice(1).map(c => c.contact);

        // Normalised phone (digits only) for winner update
        const normalizedPhone = (winner.whatsappId || winner.phone || '').replace(/\D/g, '');

        // Find winner's primary whatsapp conversation (if any)
        const winnerConvs = await db.select().from(conversations)
          .where(and(eq(conversations.contactId, winner.id), eq(conversations.channel, 'whatsapp')));
        const winnerConv = winnerConvs[0] ?? null;

        const loserSummary = losers.map(l => ({
          id: l.id, name: l.name, phone: l.phone, whatsapp_id: l.whatsappId,
          msgCount: counts.find(c => c.contact.id === l.id)?.msgCount,
        }));

        report.push({
          key,
          winner: { id: winner.id, name: winner.name, phone: winner.phone, whatsapp_id: winner.whatsappId, msgCount: counts[0].msgCount },
          losers: loserSummary,
          winnerConvId: winnerConv?.id ?? null,
          dryRun,
        });

        if (dryRun) continue;

        for (const loser of losers) {
          // Find loser conversations
          const loserConvs = await db.select().from(conversations).where(eq(conversations.contactId, loser.id));

          for (const lc of loserConvs) {
            if (winnerConv && lc.channel === winnerConv.channel) {
              // Re-point messages to winner's conversation
              await db.execute(sql`
                UPDATE messages SET conversation_id = ${winnerConv.id}, contact_id = ${winner.id}
                WHERE conversation_id = ${lc.id}
              `);
              // Delete the now-empty loser conversation
              await db.execute(sql`DELETE FROM conversations WHERE id = ${lc.id}`);
            } else if (!winnerConv) {
              // No winner conversation yet — re-parent the loser conversation to the winner contact
              await db.execute(sql`
                UPDATE conversations SET contact_id = ${winner.id} WHERE id = ${lc.id}
              `);
              await db.execute(sql`
                UPDATE messages SET contact_id = ${winner.id} WHERE conversation_id = ${lc.id}
              `);
            } else {
              // Different channel — just re-parent to winner contact
              await db.execute(sql`
                UPDATE conversations SET contact_id = ${winner.id} WHERE id = ${lc.id}
              `);
              await db.execute(sql`
                UPDATE messages SET contact_id = ${winner.id} WHERE conversation_id = ${lc.id}
              `);
            }
          }

          // Re-point activity_events
          await db.execute(sql`UPDATE activity_events SET contact_id = ${winner.id} WHERE contact_id = ${loser.id}`);

          // Delete the loser contact
          await db.execute(sql`DELETE FROM contacts WHERE id = ${loser.id}`);
          console.log(`[MergeDuplicates] Deleted loser contact ${loser.id} (${loser.name}) — merged into ${winner.id} (${winner.name})`);
        }

        // Normalise winner phone and whatsapp_id to digits-only
        if (!dryRun) {
          await db.execute(sql`
            UPDATE contacts SET phone = ${normalizedPhone}, whatsapp_id = ${normalizedPhone}
            WHERE id = ${winner.id}
          `);
          console.log(`[MergeDuplicates] Normalised winner ${winner.id} phone/whatsapp_id to "${normalizedPhone}"`);
        }
      }

      res.json({ success: true, mergedGroups: report.length, report });
    } catch (error: any) {
      console.error("Error merging duplicate contacts:", error);
      res.status(500).json({ error: error.message || "Failed to merge contacts" });
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
      console.log('[Admin Users] Fetching data...');
      
      const allUsers = await storage.getAllUsers();
      console.log('[Admin Users] Users:', allUsers.length);
      
      const allBookings = await storage.getDemoBookings();
      console.log('[Admin Users] Bookings:', allBookings.length);
      
      const allTickets = await storage.getSupportTickets();
      console.log('[Admin Users] Tickets:', allTickets.length);
      
      let allConversions: Awaited<ReturnType<typeof storage.getSalesConversions>> = [];
      try {
        allConversions = await storage.getSalesConversions();
        console.log('[Admin Users] Conversions:', allConversions.length);
      } catch (convErr: unknown) {
        console.warn(
          "[Admin Users] Conversions unavailable; continuing without salesperson attribution",
          (convErr as { message?: string })?.message ?? convErr,
        );
      }
      
      const allPartners = await storage.getPartners();
      console.log('[Admin Users] Partners:', allPartners.length);
      
      const allSalespeople = await storage.getSalespeople();
      console.log('[Admin Users] Salespeople:', allSalespeople.length);

      const allChannelSettingsRows = await db.select().from(channelSettings);
      const channelSettingsByUserId = new Map<string, typeof allChannelSettingsRows>();
      for (const row of allChannelSettingsRows) {
        const list = channelSettingsByUserId.get(row.userId) ?? [];
        list.push(row);
        channelSettingsByUserId.set(row.userId, list);
      }
      console.log('[Admin Users] Channel settings rows:', allChannelSettingsRows.length);

      const geTasks = await storage.listGrowthEngineSetupTasksForTemplate(RGE_TEMPLATE_ID);
      const geByUserId = new Map(geTasks.map((t) => [t.userId, t]));
      const salespersonCalendarById = new Map(allSalespeople.map((s) => [s.id, s.calendarLink]));
      
      // Build lookup maps
      const partnerMap = new Map(allPartners.map(p => [p.id, p.name]));
      const salespersonMap = new Map(allSalespeople.map(s => [s.id, s.name]));

      // Best-effort Stripe price IDs (same approach as /api/subscription/debug)
      const shouldLookupStripe = allUsers.some(
        (u: any) => !!u?.stripeCustomerId || !!u?.stripeSubscriptionId,
      );
      const stripe = shouldLookupStripe ? await getUncachableStripeClient().catch(() => null) : null;
      const getStripePriceIdsForUser = async (user: any): Promise<string[] | null> => {
        if (!stripe) return null;
        const ids = new Set<string>();
        try {
          if (user?.stripeCustomerId) {
            const subs = await stripe.subscriptions.list({
              customer: user.stripeCustomerId,
              status: "active",
              expand: ["data.items.data.price"],
              limit: 25,
            });
            for (const sub of subs.data) {
              for (const it of sub.items?.data || []) {
                const pid = (it as any)?.price?.id;
                if (pid) ids.add(pid);
              }
            }
          }

          if (user?.stripeSubscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
              expand: ["items.data.price"],
            } as any);
            const items = (subscription as any)?.items?.data || [];
            for (const it of items) {
              const pid = (it as any)?.price?.id;
              if (pid) ids.add(pid);
            }
          }

          return [...ids];
        } catch (err: any) {
          console.warn("[Admin Users] Stripe price-id lookup failed", {
            userId: user?.id,
            stripeCustomerId: user?.stripeCustomerId,
            stripeSubscriptionId: user?.stripeSubscriptionId,
            message: err?.message,
          });
          return null;
        }
      };
      
      const usersWithInfo = await Promise.all(allUsers.map(async user => {
        const geTask = geByUserId.get(user.id);
        const userBookings = allBookings.filter(b => b.visitorEmail === user.email);
        const userTickets = allTickets.filter(t => t.userEmail === user.email || t.userId === user.id);
        const openTickets = userTickets.filter(t => t.status === 'open' || t.status === 'in_progress');

        // Find salesperson attribution via conversions
        const userConversion = allConversions.find(c => c.userId === user.id);
        const salespersonId = userConversion?.salespersonId || null;
        const salespersonName = salespersonId ? salespersonMap.get(salespersonId) || null : null;

        // Partner attribution from user record
        const partnerName = user.partnerId ? partnerMap.get(user.partnerId) || null : null;

        const now = new Date();

        // Source of truth: subscriptionService.getUserLimits()
        let limits: Awaited<ReturnType<typeof subscriptionService.getUserLimits>> | null = null;
        try {
          limits = await subscriptionService.getUserLimits(user.id);
        } catch (err: any) {
          console.warn("[Admin Users] getUserLimits failed", { userId: user.id, message: err?.message });
          limits = null;
        }

        const effectivePlan = limits?.plan || getEffectivePlanForUser(user, now);
        const conversationsLimit =
          limits?.conversationsLimit ??
          PLAN_LIMITS[effectivePlan as SubscriptionPlan]?.conversationsPerMonth ??
          0;
        const conversationsUsed =
          limits?.conversationsUsed ??
          (user as any)?.monthlyConversations ??
          0;
        const stripeSubscriptionItemPriceIds = await getStripePriceIdsForUser(user);

        const channelConnections = deriveAdminUserChannelConnections({
          user: {
            whatsappProvider: user.whatsappProvider,
            metaConnected: user.metaConnected,
            metaIntegrationStatus: user.metaIntegrationStatus,
            metaWebhookSubscribed: user.metaWebhookSubscribed,
            metaLastErrorCode: user.metaLastErrorCode,
            metaLastErrorMessage: user.metaLastErrorMessage,
            metaTokenExpiresAt: user.metaTokenExpiresAt,
            metaVerifiedName: user.metaVerifiedName,
            metaDisplayPhoneNumber: user.metaDisplayPhoneNumber,
            twilioConnected: user.twilioConnected,
            twilioWhatsappNumber: user.twilioWhatsappNumber,
          },
          channelSettings: (channelSettingsByUserId.get(user.id) ?? []).map((row) => ({
            channel: row.channel,
            isConnected: row.isConnected,
            isEnabled: row.isEnabled,
            config: row.config,
          })),
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          effectivePlan,
          billingPlan: user.billingPlan || "free",
          planOverride: user.planOverride ?? null,
          planOverrideEnabled: !!user.planOverrideEnabled,
          aiBrainEntitlementOverrideEnabled: !!user.aiBrainEntitlementOverrideEnabled,
          aiBrainEntitlementOverrideGrant: !!user.aiBrainEntitlementOverrideGrant,
          growthEngineEntitlementOverrideEnabled: !!user.growthEngineEntitlementOverrideEnabled,
          growthEngineEntitlementOverrideGrant: !!user.growthEngineEntitlementOverrideGrant,
          subscriptionPlanLegacy: user.subscriptionPlan,
          subscriptionStatus: user.subscriptionStatus,
          trialEndsAt: user.trialEndsAt,
          isInTrial: !!limits?.isInTrial,
          twilioConnected: user.twilioConnected,
          metaConnected: user.metaConnected,
          createdAt: user.createdAt,
          hasDemo: userBookings.length > 0,
          demoStatus: userBookings[0]?.status || null,
          demoDate: userBookings[0]?.scheduledDate || null,
          openTicketCount: openTickets.length,
          totalTicketCount: userTickets.length,
          latestTicket: openTickets[0] || null,
          // Usage
          conversationsUsed,
          conversationsLimit,
          // AI Brain / Growth Engine (same as /api/subscription/debug source-of-truth)
          hasAIBrainAddon: limits?.hasAIBrainAddon ?? false,
          aiBrainSource: limits?.aiBrainSource ?? "none",
          aiBrainBasePlanEligible: limits?.aiBrainBasePlanEligible ?? false,
          growthEngineEligible: limits?.growthEngineEligible ?? false,
          // Stripe IDs (from user record)
          stripeCustomerId: (user as any)?.stripeCustomerId ?? null,
          stripeSubscriptionId: (user as any)?.stripeSubscriptionId ?? null,
          stripeSubscriptionItemPriceIds,
          // Attribution fields
          partnerId: user.partnerId || null,
          partnerName,
          salespersonId,
          salespersonName,
          growthEngineSetup: geTask
            ? {
                id: geTask.id,
                status: geTask.status,
                salespersonId: geTask.salespersonId,
                assignedSalespersonName: geTask.salespersonId
                  ? salespersonMap.get(geTask.salespersonId) ?? null
                  : null,
                onboardingSubmittedAt: geTask.onboardingSubmittedAt,
                sessionBookedAt: geTask.sessionBookedAt,
                completedAt: geTask.completedAt,
                internalNotes: geTask.internalNotes,
              }
            : null,
          rgeConciergeCalendarWarning: geTask
            ? isCalendarMissingForSetupTask(
                geTask,
                geTask.salespersonId ? salespersonCalendarById.get(geTask.salespersonId) ?? null : null,
              )
            : false,
          channelConnections,
        };
      }));
      
      // Sort: users with open tickets first, then by created date
      usersWithInfo.sort((a, b) => {
        if (a.openTicketCount > 0 && b.openTicketCount === 0) return -1;
        if (b.openTicketCount > 0 && a.openTicketCount === 0) return 1;
        return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
      });
      
      res.json(usersWithInfo);
    } catch (error: any) {
      console.error("Error fetching admin users:", error?.message || error, error?.stack);
      res.status(500).json({ error: `Failed to fetch users: ${error?.message || 'Unknown error'}` });
    }
  });

  // Admin: Update user subscription plan
  app.patch("/api/admin/users/:userId/plan", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { subscriptionPlan } = req.body;

      if (!subscriptionPlan || !['free', 'starter', 'pro'].includes(subscriptionPlan)) {
        return res.status(400).json({ error: 'Invalid subscription plan' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await storage.updateUser(userId, {
        planOverride: subscriptionPlan,
        planOverrideEnabled: true,
      });
      
      const updated = await storage.getUser(userId);
      if (updated && subscriptionPlan !== "free") {
        try {
          const { tryRecordDemoConversionForUser } = await import("./salesConversionAttribution");
          await tryRecordDemoConversionForUser(updated, new Date());
        } catch (attrErr) {
          console.error("[Admin] demo conversion attribution error:", attrErr);
        }
      }
      console.log(
        JSON.stringify({
          tag: "ADMIN_PLAN_OVERRIDE_SET",
          targetUserId: userId,
          targetEmail: user.email,
          planOverride: subscriptionPlan,
        }),
      );
      
      res.json({ success: true, planOverride: updated?.planOverride, planOverrideEnabled: updated?.planOverrideEnabled });
    } catch (error: any) {
      console.error("Error updating user plan:", error?.message || error);
      res.status(500).json({ error: `Failed to update plan: ${error?.message || 'Unknown error'}` });
    }
  });

  // Admin: internal access overrides (plan / AI Brain / Growth Engine) — does not modify Stripe or Shopify billing.
  app.patch("/api/admin/users/:userId/access-overrides", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const body = (req.body || {}) as Record<string, unknown>;

      const existing = await storage.getUserForSession(userId);
      if (!existing) {
        return res.status(404).json({ error: "User not found" });
      }

      const updates: Record<string, unknown> = {};

      if (body.clearPlanOverride === true) {
        updates.planOverrideEnabled = false;
      } else if (typeof body.planOverride === "string" && ["free", "starter", "pro"].includes(body.planOverride)) {
        updates.planOverride = body.planOverride;
        updates.planOverrideEnabled = true;
      }

      if (typeof body.aiBrainEntitlementOverride === "string") {
        const aiMode = body.aiBrainEntitlementOverride;
        if (aiMode === "inherit") {
          updates.aiBrainEntitlementOverrideEnabled = false;
          updates.aiBrainEntitlementOverrideGrant = false;
        } else if (aiMode === "on") {
          updates.aiBrainEntitlementOverrideEnabled = true;
          updates.aiBrainEntitlementOverrideGrant = true;
        } else if (aiMode === "off") {
          updates.aiBrainEntitlementOverrideEnabled = true;
          updates.aiBrainEntitlementOverrideGrant = false;
        }
      }

      if (typeof body.growthEngineEntitlementOverride === "string") {
        const geMode = body.growthEngineEntitlementOverride;
        if (geMode === "inherit") {
          updates.growthEngineEntitlementOverrideEnabled = false;
          updates.growthEngineEntitlementOverrideGrant = false;
        } else if (geMode === "on") {
          updates.growthEngineEntitlementOverrideEnabled = true;
          updates.growthEngineEntitlementOverrideGrant = true;
        } else if (geMode === "off") {
          updates.growthEngineEntitlementOverrideEnabled = true;
          updates.growthEngineEntitlementOverrideGrant = false;
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          error:
            "No valid fields. Send clearPlanOverride and/or planOverride, aiBrainEntitlementOverride, growthEngineEntitlementOverride.",
        });
      }

      await storage.updateUser(userId, updates as any);
      console.log(
        JSON.stringify({
          tag: "ADMIN_ACCESS_OVERRIDES_PATCH",
          targetUserId: userId,
          targetEmail: existing.email,
          updates,
        }),
      );

      res.json({ ok: true, userId });
    } catch (error: any) {
      console.error("Error patching access overrides:", error?.message || error);
      res.status(500).json({ error: error?.message || "Failed to update overrides" });
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

  // Admin: GHL sync failure visibility (Phase 4)
  app.get("/api/admin/ghl-sync-failures", requireAdmin, async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const failures = await storage.getGhlSyncFailures(userId, limit);
      res.json(failures);
    } catch (error) {
      console.error("Error fetching GHL sync failures:", error);
      res.status(500).json({ error: "Failed to fetch GHL sync failures" });
    }
  });

  // Admin: Mark a GHL sync failure as resolved
  app.patch("/api/admin/ghl-sync-failures/:id/resolve", requireAdmin, async (req, res) => {
    try {
      await storage.resolveGhlSyncFailure(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resolving GHL sync failure:", error);
      res.status(500).json({ error: "Failed to resolve GHL sync failure" });
    }
  });

  // User-facing: own GHL sync failures (last 50, unresolved)
  app.get("/api/ghl-sync-failures", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const all = await storage.getGhlSyncFailures(req.user.id, 50);
      res.json(all.filter(f => !f.resolvedAt));
    } catch (error) {
      console.error("Error fetching GHL sync failures:", error);
      res.status(500).json({ error: "Failed to fetch sync failures" });
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
            role: 'both',
          });
          console.log('[SALES] Demo salesperson created on-demand');
        } else if (salesperson.loginCode !== DEMO_SALES_CODE) {
          // Fix login code if wrong
          salesperson = await storage.updateSalesperson(salesperson.id, { loginCode: DEMO_SALES_CODE }) || salesperson;
          console.log('[SALES] Demo salesperson login code fixed on-demand');
        } else if (salesperson.role !== "both") {
          salesperson = await storage.updateSalesperson(salesperson.id, { role: "both" }) || salesperson;
          console.log('[SALES] Demo salesperson role upgraded to both for portal testing');
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
    const effectiveTaskPayoutDollars = getEffectiveTaskPayoutDollars(salesperson);
    const hasCustomTaskPayout =
      salesperson.taskPayoutAmount != null && String(salesperson.taskPayoutAmount).trim() !== "";

    res.json({ 
      authenticated: true,
      agreementRequired,
      currentAgreementVersion: currentVersion,
      defaultTaskPayoutDollars: DEFAULT_SALES_TASK_PAYOUT_DOLLARS,
      effectiveTaskPayoutDollars,
      hasCustomTaskPayout,
      salesperson: {
        id: salesperson.id,
        name: salesperson.name,
        email: salesperson.email,
        role: salesperson.role || "sales",
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
      const ipAddress =
        req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";
      const acceptedAt = new Date();

      const acceptance = await storage.recordAgreementAcceptance({
        agreementType: "salesperson_commission",
        agreementVersion: currentVersion,
        partnerId: null,
        salespersonId: salesperson.id,
        ipAddress,
        userAgent,
        acceptedAt,
      });

      await storage.updateSalesperson(salesperson.id, {
        agreementAcceptedAt: acceptedAt,
        agreementVersion: currentVersion,
      });

      res.json({
        success: true,
        acceptance: {
          salespersonId: acceptance.salespersonId,
          acceptedAt: acceptance.acceptedAt,
          ipAddress: acceptance.ipAddress,
          userAgent: acceptance.userAgent,
          agreementVersion: acceptance.agreementVersion,
        },
      });
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
    const pendingSetupTasks = await storage.countOpenGrowthEngineSetupTasksForSalesperson(salesperson.id);
    const effectiveTaskPayoutDollars = getEffectiveTaskPayoutDollars(salesperson);
    const hasCustomTaskPayout =
      salesperson.taskPayoutAmount != null && String(salesperson.taskPayoutAmount).trim() !== "";
    const [convRows, commissionRows] = await Promise.all([
      storage.getSalesConversionsBySalesperson(salesperson.id),
      storage.getCommissionsBySalesperson(salesperson.id),
    ]);
    const conversionPayoutsTotal = convRows.reduce(
      (s, c) =>
        c.payoutEligible !== false ? s + parseFloat(String(c.amount ?? 0)) : s,
      0,
    );
    const subscriptionCommissionsTotal = commissionRows.reduce(
      (s, c) => s + parseFloat(String(c.amount ?? 0)),
      0,
    );
    const setupTaskPayoutsTotal = parseFloat(String(salesperson.setupTaskEarningsTotal ?? 0));
    res.json({
      totalBookings: salesperson.totalBookings || 0,
      totalConversions: salesperson.totalConversions || 0,
      totalEarnings: salesperson.totalEarnings || "0",
      pendingSetupTasks,
      setupTasksCompleted: salesperson.setupTasksCompleted ?? 0,
      defaultTaskPayoutDollars: DEFAULT_SALES_TASK_PAYOUT_DOLLARS,
      effectiveTaskPayoutDollars,
      hasCustomTaskPayout,
      conversionPayoutsTotal: conversionPayoutsTotal.toFixed(2),
      demoConversionBonusesTotal: conversionPayoutsTotal.toFixed(2),
      subscriptionCommissionsTotal: subscriptionCommissionsTotal.toFixed(2),
      setupTaskPayoutsTotal: setupTaskPayoutsTotal.toFixed(2),
    });
  });

  // Salesperson Portal: Growth Engine setup / concierge tasks (setup or both roles)
  app.get("/api/sales-portal/setup-tasks", requireSalesperson, async (req: any, res) => {
    try {
      const role = req.salesperson.role || "sales";
      if (role !== "setup" && role !== "both") {
        return res.json([]);
      }
      const { readRgeSetupTaskMeta, parseGrowthEngineSessionBookingMeta } = await import(
        "./growthEngineSetupService"
      );
      const tasks = await storage.listGrowthEngineSetupTasksForSalesperson(req.salesperson.id);
      const enriched = await Promise.all(
        tasks.map(async (t) => {
          const u = await storage.getUser(t.userId);
          const meta = readRgeSetupTaskMeta(t.internalNotes);
          const sessionBooking = parseGrowthEngineSessionBookingMeta(t.internalNotes);
          const submission = await storage.getRealtorOnboardingSubmission(t.userId).catch(() => undefined);
          return {
            ...t,
            userEmail: u?.email ?? null,
            userName: u?.name ?? null,
            onboardingSummary: meta?.onboarding ?? submission?.payload ?? null,
            sessionBooking,
          };
        }),
      );
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching setup tasks:", error);
      res.status(500).json({ error: "Failed to fetch setup tasks" });
    }
  });

  app.patch("/api/sales-portal/setup-tasks/:id/complete", requireSalesperson, async (req: any, res) => {
    try {
      const role = req.salesperson.role || "sales";
      if (role !== "setup" && role !== "both") {
        return res.status(403).json({ error: "Not authorized for setup tasks" });
      }
      const task = await storage.getGrowthEngineSetupTaskById(req.params.id);
      if (!task || task.salespersonId !== req.salesperson.id) {
        return res.status(404).json({ error: "Task not found" });
      }
      if (task.status === GE_SETUP_STATUS.setupCompleted) {
        return res.json(task);
      }
      const prevStatus = task.status;
      const updated = await storage.updateGrowthEngineSetupTask(task.id, {
        status: GE_SETUP_STATUS.setupCompleted,
        completedAt: new Date(),
      });
      if (prevStatus !== GE_SETUP_STATUS.setupCompleted && updated?.salespersonId) {
        await storage.creditSalespersonSetupTaskCompletion(req.salesperson.id, {
          taskPayoutAmount: req.salesperson.taskPayoutAmount,
        });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error completing setup task:", error);
      res.status(500).json({ error: "Failed to complete setup task" });
    }
  });

  // Salesperson Portal: Get my demos
  app.get("/api/sales-portal/demos", requireSalesperson, async (req: any, res) => {
    try {
      const { processExpiredDemoAcceptances } = await import("./demoAssignmentService");
      await processExpiredDemoAcceptances();
      const demos = await storage.getDemoBookingsBySalesperson(req.salesperson.id);
      res.json(demos);
    } catch (error) {
      console.error("Error fetching salesperson demos:", error);
      res.status(500).json({ error: "Failed to fetch demos" });
    }
  });

  app.patch("/api/sales-portal/demos/:id/accept", requireSalesperson, async (req: any, res) => {
    try {
      const { DEMO_BOOKING_STATUS } = await import("@shared/salesCompensation");
      const demo = await storage.getDemoBooking(req.params.id);
      if (!demo || demo.salespersonId !== req.salesperson.id) {
        return res.status(404).json({ error: "Demo not found" });
      }
      const status = demo.status === "pending" ? "pending_acceptance" : demo.status;
      if (status !== DEMO_BOOKING_STATUS.pendingAcceptance) {
        return res.status(400).json({ error: "Demo is not awaiting acceptance" });
      }
      const updated = await storage.updateDemoBooking(req.params.id, {
        status: DEMO_BOOKING_STATUS.accepted,
        acceptedAt: new Date(),
      } as any);
      res.json(updated);
    } catch (error) {
      console.error("Error accepting demo:", error);
      res.status(500).json({ error: "Failed to accept demo" });
    }
  });

  app.patch("/api/sales-portal/demos/:id/decline", requireSalesperson, async (req: any, res) => {
    try {
      const { isDemoAwaitingAcceptance } = await import("@shared/salesCompensation");
      const { reason } = req.body as { reason?: string };
      if (!reason?.trim()) {
        return res.status(400).json({ error: "Decline reason is required" });
      }
      const demo = await storage.getDemoBooking(req.params.id);
      if (!demo || demo.salespersonId !== req.salesperson.id) {
        return res.status(404).json({ error: "Demo not found" });
      }
      if (!isDemoAwaitingAcceptance(demo.status)) {
        return res.status(400).json({ error: "Demo is not awaiting acceptance" });
      }
      const { reassignDemoBookingToPool } = await import("./demoAssignmentService");
      const result = await reassignDemoBookingToPool(req.params.id, {
        declineReason: reason.trim(),
        excludeSalespersonId: req.salesperson.id,
        declinedBySalespersonId: req.salesperson.id,
      });
      const updated = await storage.getDemoBooking(req.params.id);
      res.json({ ...result, booking: updated });
    } catch (error) {
      console.error("Error declining demo:", error);
      res.status(500).json({ error: "Failed to decline demo" });
    }
  });

  // Salesperson Portal: Mark demo as completed (no demo completion payout)
  app.patch("/api/sales-portal/demos/:id/complete", requireSalesperson, async (req: any, res) => {
    try {
      const { DEMO_BOOKING_STATUS } = await import("@shared/salesCompensation");
      const demo = await storage.getDemoBooking(req.params.id);
      if (!demo || demo.salespersonId !== req.salesperson.id) {
        return res.status(404).json({ error: "Demo not found" });
      }
      if (demo.status !== DEMO_BOOKING_STATUS.accepted && demo.status !== "pending") {
        return res.status(400).json({ error: "Only accepted demos can be marked complete" });
      }
      const updated = await storage.updateDemoBooking(req.params.id, { status: DEMO_BOOKING_STATUS.completed });
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

  // Salesperson Portal: Legacy subscription commission rows (pre-2026 payout policy; retained for history)
  app.get("/api/sales-portal/commissions", requireSalesperson, async (req: any, res) => {
    try {
      const rows = await storage.getCommissionsBySalesperson(req.salesperson.id);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching salesperson commissions:", error);
      res.status(500).json({ error: "Failed to fetch commissions" });
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
        refLink: `${getMarketingOrigin()}/?ref=${partner.refCode}`,
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

  // ================== ADMIN GHL / LEADCONNECTOR ==================

  app.get("/api/admin/ghl-integrations", requireAdmin, async (req, res) => {
    try {
      const ghlIntegrations = await storage.getIntegrationsByType('gohighlevel');
      const allUsers = await storage.getAllUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u]));

      const result = ghlIntegrations.map(integration => {
        const user = userMap.get(integration.userId);
        const config = (integration.config || {}) as any;
        return {
          id: integration.id,
          userId: integration.userId,
          userName: user?.name || 'Unknown',
          userEmail: user?.email || 'Unknown',
          userPlan: user?.subscriptionPlan || 'free',
          isActive: integration.isActive,
          locationId: config.locationId || null,
          companyId: config.companyId || null,
          userType: config.userType || null,
          installedAt: config.installedAt || integration.createdAt,
          tokenExpiresAt: integration.tokenExpiresAt,
          lastSyncAt: integration.lastSyncAt,
          createdAt: integration.createdAt,
        };
      });

      result.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

      res.json(result);
    } catch (error) {
      console.error("Error fetching GHL integrations:", error);
      res.status(500).json({ error: "Failed to fetch GHL integrations" });
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
      sendPartnerWelcomeEmail(partner.name, partner.email, partner.refCode, password)
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

  // Admin: Manually trigger onboarding activation emails (for testing)
  app.post("/api/admin/trigger-checkin-emails", requireAdmin, async (req, res) => {
    try {
      const { runActivationEmails } = await import("./activationEmailService");
      const result = await runActivationEmails();
      res.json({
        success: true,
        message: `Activation emails processed: day3=${result.day3Sent}, day10=${result.day10Sent}, errors=${result.errors}`,
        sent: result.day3Sent + result.day10Sent,
        ...result,
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
    const t0 = Date.now();
    const userId = req.user?.id ?? null;
    devLog("[InboxEvidence:GET /api/inbox] start", { userId });
    try {
      if (!req.user) {
        console.warn("[InboxEvidence:GET /api/inbox] unauthorized — no req.user");
        return res.status(401).json({ error: "Unauthorized" });
      }
      const limit = parseInt(req.query.limit as string) || 100;
      const inbox = await storage.getUnifiedInbox(req.user.id, limit);
      const ms = Date.now() - t0;
      const rowCount = Array.isArray(inbox) ? inbox.length : -1;
      devLog("[InboxEvidence:GET /api/inbox] end", {
        userId: req.user.id,
        rowCount,
        returnedZero: rowCount === 0,
        ms,
      });
      res.json(inbox);
    } catch (error) {
      const ms = Date.now() - t0;
      console.error("[InboxEvidence:GET /api/inbox] error", { userId, ms, error });
      console.error("Error fetching unified inbox:", error);
      res.status(500).json({ error: "Failed to fetch inbox" });
    }
  });



  // ==========================================
  // AI BRAIN API ROUTES (PRO ADD-ON)
  // ==========================================

  // Helper: Check if user has AI Brain access (Pro plan with add-on)
  // Per-plan monthly AI credit allowances
  const AI_MONTHLY_CREDITS: Record<string, number> = {
    free:       0,
    starter:   50,
    pro:       300,
    enterprise: 500,
  };
  const AI_BRAIN_ADDON_BONUS = 700; // Pro+Brain = 300 + 700 = 1000 credits/month

  const checkAiBrainAccess = async (
    userId: string,
    mode?: 'suggest' | 'auto'
  ): Promise<{ hasAccess: boolean; reason?: string; plan: string; monthlyLimit: number; hasAIBrain: boolean }> => {
    // Source of truth: subscriptionService.getUserLimits() (paid + override + trial).
    const limits = await subscriptionService.getUserLimits(userId);
    if (!limits) {
      return {
        hasAccess: false,
        reason: "User not found",
        plan: "free",
        monthlyLimit: 0,
        hasAIBrain: false,
      };
    }

    const effectivePlan = limits.plan || "free";
    const hasAIBrain = !!limits.effectiveHasAIBrain;

    const baseLimit = AI_MONTHLY_CREDITS[effectivePlan] ?? 0;
    const monthlyLimit =
      hasAIBrain && effectivePlan === "pro" ? baseLimit + AI_BRAIN_ADDON_BONUS : baseLimit;

    // Free users: no AI access
    if (effectivePlan === 'free') {
      return { hasAccess: false, reason: "AI features require a Starter or Pro plan", plan: effectivePlan, monthlyLimit: 0, hasAIBrain };
    }

    // Auto mode requires Pro
    if (mode === 'auto' && effectivePlan === 'starter') {
      return { hasAccess: false, reason: "Auto mode requires a Pro plan. Upgrade to unlock.", plan: effectivePlan, monthlyLimit, hasAIBrain };
    }

    return { hasAccess: true, plan: effectivePlan, monthlyLimit, hasAIBrain };
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
  
  // Rate limiting per conversation (cooldown between rapid AI messages).
  // Bucket by request mode so Copilot's suggest-only call (no aiMode) does not block
  // the composer's full-auto call (aiMode: auto) on the same inbound — same millisecond.
  const conversationCooldowns = new Map<string, number>();
  const COOLDOWN_MS = 3000; // 3 second cooldown between AI messages per chat per bucket
  
  const checkConversationRateLimit = (chatId: string, requestedMode?: string): boolean => {
    const now = Date.now();
    const modeBucket = requestedMode === "auto" ? "auto" : "suggest";
    const key = `${chatId}:${modeBucket}`;
    const lastCall = conversationCooldowns.get(key);
    
    if (lastCall && (now - lastCall) < COOLDOWN_MS) {
      return false;
    }
    
    conversationCooldowns.set(key, now);
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
      const limits = await subscriptionService.getUserLimits(userId);
      if (!limits?.effectiveHasAIBrain) {
        return res.status(403).json({
          error: "AI Brain add-on is required for business profile and premium intelligence settings.",
          needsUpgrade: true,
          code: "AI_BRAIN_REQUIRED",
        });
      }
      const knowledge = await storage.getAiBusinessKnowledge(userId);
      const defaults = {
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
      };
      const base = knowledge || defaults;
      const calendlyBookingConnected = await isUserCalendlyBookingConnected(userId);
      res.json({
        ...base,
        bookingLink: "",
        calendlyBookingConnected,
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
      const limits = await subscriptionService.getUserLimits(userId);
      if (!limits?.effectiveHasAIBrain) {
        return res.status(403).json({
          error: "AI Brain add-on is required for business profile and premium intelligence settings.",
          needsUpgrade: true,
          code: "AI_BRAIN_REQUIRED",
        });
      }
      const raw = (req.body || {}) as Record<string, unknown>;
      const { bookingLink: _ignoredBookingLink, ...bodyWithoutManualBooking } = raw;
      const body = { ...bodyWithoutManualBooking, bookingLink: "" };
      const knowledge = await storage.upsertAiBusinessKnowledge(userId, body);
      res.json(knowledge);
    } catch (error) {
      console.error("Business knowledge update error:", error);
      res.status(500).json({ error: "Failed to update business knowledge" });
    }
  });

  async function requireAiBrainPremium(req: Request, res: Response): Promise<boolean> {
    const limits = await subscriptionService.getUserLimits(req.user!.id);
    if (!limits?.effectiveHasAIBrain) {
      res.status(403).json({
        error: "AI Brain add-on is required for website knowledge.",
        needsUpgrade: true,
        code: "AI_BRAIN_REQUIRED",
      });
      return false;
    }
    return true;
  }

  app.post("/api/ai/website-knowledge/scan", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      if (!(await requireAiBrainPremium(req, res))) return;

      const body = (req.body || {}) as Record<string, unknown>;
      const slotDefs = [
        { key: "homepage", label: "Homepage", bodyKey: "homepageUrl" },
        { key: "productServices", label: "Product / Services", bodyKey: "productServicesUrl" },
        { key: "about", label: "About", bodyKey: "aboutUrl" },
        { key: "faq", label: "FAQ", bodyKey: "faqUrl" },
        { key: "shippingPolicy", label: "Shipping policy", bodyKey: "shippingPolicyUrl" },
        { key: "returnPolicy", label: "Return policy", bodyKey: "returnPolicyUrl" },
        { key: "terms", label: "Terms", bodyKey: "termsUrl" },
        { key: "privacy", label: "Privacy policy", bodyKey: "privacyPolicyUrl" },
        { key: "other", label: "Other", bodyKey: "otherUrl" },
      ] as const;

      const slots = slotDefs.map((def) => ({
        key: def.key,
        label: def.label,
        urlRaw: typeof body[def.bodyKey] === "string" ? (body[def.bodyKey] as string) : "",
      }));

      const anyProvided = slots.some((s) => s.urlRaw.trim());
      if (!anyProvided) {
        return res.status(400).json({
          error: "Provide at least one URL to scan.",
          code: "NO_URLS",
        });
      }

      let pages: Awaited<ReturnType<typeof scrapeGuidedWebsiteKnowledgePages>>["pages"];
      let pageResults: Awaited<ReturnType<typeof scrapeGuidedWebsiteKnowledgePages>>["results"];
      try {
        const out = await scrapeGuidedWebsiteKnowledgePages(slots);
        pages = out.pages;
        pageResults = out.results;
      } catch (e: unknown) {
        if (e instanceof WebsiteKnowledgeScrapeError) {
          return res.status(400).json({ error: e.message, code: e.code });
        }
        if (e instanceof Error && e.name === "AbortError") {
          return res.status(408).json({ error: "Request timed out", code: "TIMEOUT" });
        }
        console.error("[WebsiteKnowledge] scan error:", e);
        return res.status(500).json({ error: "Scan failed" });
      }

      if (pages.length === 0) {
        return res.status(400).json({
          error:
            "Could not fetch any of the provided pages. Check the URLs and try again.",
          code: "NO_PAGES_FETCHED",
          pageResults,
        });
      }

      const combined = combineScrapedText(pages);
      const { aiService } = await import("./aiService");
      const summaryRaw = await aiService.summarizeWebsiteKnowledgeForBrain(combined);
      const summary = finalizeWebsiteKnowledgeSummaryText(summaryRaw);

      const homepageScanned = pageResults.find((r) => r.key === "homepage" && r.status === "scanned");
      const primaryUrl = homepageScanned?.finalUrl ?? pages[0]?.url ?? "";

      const scanId = putWebsiteKnowledgeDraft({
        userId: req.user.id,
        url: primaryUrl,
        summary,
        sourceUrls: pages.map((p) => p.url),
      });

      res.json({
        scanId,
        previewSummary: summary,
        sourceUrls: pages.map((p) => p.url),
        pageResults,
      });
    } catch (error) {
      console.error("Website knowledge scan error:", error);
      res.status(500).json({ error: "Scan failed" });
    }
  });

  app.post("/api/ai/website-knowledge/save", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      if (!(await requireAiBrainPremium(req, res))) return;

      const { scanId, summaryOverride } = (req.body || {}) as {
        scanId?: string;
        summaryOverride?: string;
      };
      if (!scanId || typeof scanId !== "string") {
        return res.status(400).json({ error: "scanId is required" });
      }

      const draft = takeWebsiteKnowledgeDraft(scanId, req.user.id);
      if (!draft) {
        return res.status(410).json({
          error: "This scan has expired or was already saved. Please run Scan again.",
          code: "SCAN_EXPIRED",
        });
      }

      let summaryText = finalizeWebsiteKnowledgeSummaryText(draft.summary);
      if (typeof summaryOverride === "string" && summaryOverride.trim()) {
        summaryText = finalizeWebsiteKnowledgeSummaryText(summaryOverride.trim()).slice(0, 8000);
      } else {
        summaryText = summaryText.slice(0, 8000);
      }

      await storage.upsertAiBusinessKnowledge(req.user.id, {
        websiteKnowledgeUrl: draft.url,
        websiteKnowledgeSummary: summaryText,
        websiteKnowledgeSourceUrls: draft.sourceUrls,
        websiteKnowledgeUpdatedAt: new Date(),
      });

      const row = await storage.getAiBusinessKnowledge(req.user.id);
      res.json({
        ok: true,
        websiteKnowledgeUrl: row?.websiteKnowledgeUrl ?? null,
        websiteKnowledgeSummary: row?.websiteKnowledgeSummary ?? null,
        websiteKnowledgeSourceUrls: row?.websiteKnowledgeSourceUrls ?? [],
        websiteKnowledgeUpdatedAt: row?.websiteKnowledgeUpdatedAt ?? null,
      });
    } catch (error) {
      console.error("Website knowledge save error:", error);
      res.status(500).json({ error: "Failed to save" });
    }
  });

  app.patch("/api/ai/website-knowledge", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      if (!(await requireAiBrainPremium(req, res))) return;

      const { summary } = (req.body || {}) as { summary?: string };
      if (typeof summary !== "string" || !summary.trim()) {
        return res.status(400).json({ error: "summary is required" });
      }
      const s = summary.trim().slice(0, 8000);

      const existing = await storage.getAiBusinessKnowledge(req.user.id);
      if (!existing?.websiteKnowledgeUrl && !existing?.websiteKnowledgeSummary) {
        return res.status(400).json({
          error: "Nothing to edit yet. Scan a website and save it first.",
          code: "NO_WEBSITE_KNOWLEDGE",
        });
      }

      await storage.upsertAiBusinessKnowledge(req.user.id, {
        websiteKnowledgeSummary: s,
        websiteKnowledgeUpdatedAt: new Date(),
      });

      const row = await storage.getAiBusinessKnowledge(req.user.id);
      res.json({
        ok: true,
        websiteKnowledgeSummary: row?.websiteKnowledgeSummary ?? null,
        websiteKnowledgeUpdatedAt: row?.websiteKnowledgeUpdatedAt ?? null,
      });
    } catch (error) {
      console.error("Website knowledge patch error:", error);
      res.status(500).json({ error: "Failed to update" });
    }
  });

  app.delete("/api/ai/website-knowledge", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      if (!(await requireAiBrainPremium(req, res))) return;

      await storage.upsertAiBusinessKnowledge(req.user.id, {
        websiteKnowledgeUrl: null,
        websiteKnowledgeSummary: null,
        websiteKnowledgeSourceUrls: [],
        websiteKnowledgeUpdatedAt: null,
      });

      res.json({ ok: true });
    } catch (error) {
      console.error("Website knowledge delete error:", error);
      res.status(500).json({ error: "Failed to delete" });
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
      const knowledgeRaw = await storage.getAiBusinessKnowledge(userId);
      const knowledge = await applyCalendlyBookingLinkForAi(userId, knowledgeRaw);
      const workflow = await aiService.generateAutomation(prompt, knowledge || undefined);
      
      // Track usage
      await storage.incrementAiUsage(userId, 'automationsGenerated');
      
      res.json(workflow);
    } catch (error) {
      console.error("Automation generation error:", error);
      res.status(500).json({ error: "Failed to generate automation" });
    }
  });

  // Get current AI usage summary for the billing period
  app.get("/api/ai/usage", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const userId = req.user.id;

      const access = await checkAiBrainAccess(userId);
      const usage  = await storage.getCurrentAiUsage(userId);
      const fairUse = await checkFairUseBehavior(userId);

      const creditsUsed     = (usage?.repliesSuggested || 0) + (usage?.messagesGenerated || 0);
      const monthlyLimit    = access.monthlyLimit;
      const creditsRemaining = Math.max(0, monthlyLimit - creditsUsed);
      const creditPercent   = monthlyLimit > 0 ? Math.round((creditsUsed / monthlyLimit) * 100) : 0;

      res.json({
        plan:              access.plan,
        hasAIBrain:        access.hasAIBrain,
        creditsUsed,
        monthlyLimit,
        creditsRemaining,
        creditPercent,
        fairUseStatus:     fairUse.status,
        usageLimitReached: usage?.usageLimitReached || false,
        periodStart:       usage?.periodStart,
        periodEnd:         usage?.periodEnd,
        // Feature access flags (for frontend capability hook)
        canUseSuggest:     access.plan !== 'free',
        canUseAuto:        access.plan === 'pro' || access.plan === 'enterprise',
        canUseWorkflowRecommendations: access.plan === 'pro' || access.plan === 'enterprise',
        canUseCopilotIntelligence:     access.plan !== 'free',
      });
    } catch (error) {
      console.error("AI usage fetch error:", error);
      res.status(500).json({ error: "Failed to fetch AI usage" });
    }
  });

  // Get AI reply suggestions for a conversation
  app.post("/api/ai/suggest-reply", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;

      const { chatId, conversationHistory, tone, aiMode: requestedMode, contactContext, contactId: bodyContactId } =
        req.body;

      let resolvedContactId: string | null =
        typeof bodyContactId === "string" && bodyContactId.trim() ? bodyContactId.trim() : null;
      if (!resolvedContactId && typeof chatId === "string" && chatId.trim()) {
        try {
          const conv = await storage.getConversation(chatId.trim());
          resolvedContactId = conv?.contactId ?? null;
        } catch {
          resolvedContactId = null;
        }
      }
      const resolvedConversationId =
        typeof chatId === "string" && chatId.trim() ? chatId.trim() : null;

      let buyerMatchingTraceId: string | null = null;
      let copilotTraceProfile: Awaited<
        ReturnType<
          typeof import("./buyerPreferenceService").readBuyerPreferenceProfile
        >
      > | null = null;
      let copilotMatchListings: import("@shared/buyerMatchingTrace").BuyerMatchingListingSummary[] =
        [];
      let copilotMatchCount = 0;
      let copilotQualification: import("@shared/buyerQualification").BuyerQualificationContext | null =
        null;

      // Check access and plan eligibility (pass mode to enforce Auto=Pro-only)
      const access = await checkAiBrainAccess(userId, requestedMode === 'auto' ? 'auto' : 'suggest');
      if (!access.hasAccess) {
        return res.status(403).json({ error: access.reason, needsUpgrade: true, plan: access.plan });
      }

      // Enforce per-plan monthly credit limits
      if (access.monthlyLimit > 0) {
        const usage      = await storage.getCurrentAiUsage(userId);
        const creditsUsed = (usage?.repliesSuggested || 0) + (usage?.messagesGenerated || 0);
        if (creditsUsed >= access.monthlyLimit) {
          return res.status(429).json({
            error:        "Your plan's AI Assist limit for this period has been reached. Upgrade for more capacity.",
            status:       "credits_exhausted",
            creditsUsed,
            monthlyLimit: access.monthlyLimit,
            needsUpgrade: access.plan === 'starter',
            plan:         access.plan,
          });
        }
      }

      const fairUse = await checkFairUseBehavior(userId);
      if (!fairUse.canProceed) {
        return res.status(429).json({ 
          error: fairUse.message || "AI assistance is temporarily limited to protect deliverability.",
          status: fairUse.status
        });
      }
      
      // Rate limiting per conversation
      if (chatId && !checkConversationRateLimit(chatId, requestedMode)) {
        return res.status(429).json({ 
          error: "Please wait a moment before requesting another suggestion.",
          status: "rate_limited"
        });
      }
      
      if (!conversationHistory || !Array.isArray(conversationHistory)) {
        return res.status(400).json({ error: "Conversation history required" });
      }

      const historyTurns = conversationHistory as ChatTurn[];
      const lastInbound = (() => {
        const inbound = historyTurns.filter((m) => m.role === "user").map((m) => m.content || "");
        return (inbound[inbound.length - 1] || "").trim();
      })();

      const forceAutoBypass =
        !!lastInbound &&
        shouldBypassAutoGuardsForInbound({
          conversationHistory: historyTurns,
          lastInbound,
        });

      const { aiService } = await import("./aiService");
      const knowledgeRaw = await storage.getAiBusinessKnowledge(userId);
      const knowledge = await applyCalendlyBookingLinkForAi(userId, knowledgeRaw);
      const settings = await storage.getAiSettings(userId);

      const inboundContentsEarly = historyTurns.filter((m) => m.role === "user").map((m) => m.content || "");
      const joinedInboundEarly = inboundContentsEarly.join("\n");
      const scoringKnowledgeEarly = businessKnowledgeFromAiRecord(knowledge as Record<string, unknown>);
      const stageSignalsEarly = getStageSignals(toConversationMessages(historyTurns), scoringKnowledgeEarly);
      const aiRouting = resolveAiRouting({
        inbound: lastInbound,
        joinedInbound: joinedInboundEarly,
        history: historyTurns.map((m) => ({ role: m.role, content: m.content })),
        handoffKeywords: settings?.handoffKeywords ?? undefined,
        industry: knowledge?.industry ?? undefined,
        industrySignals: {
          viewingIntent: stageSignalsEarly.viewingIntent,
          strongIntent: stageSignalsEarly.strongIntent,
        },
      });

      console.info("[AI-ROUTING]", {
        userId,
        chatId: chatId ?? null,
        decision: aiRouting.decision,
        confidence: aiRouting.confidence,
        reason: aiRouting.reason,
        needsRoutingClarification: aiRouting.needsRoutingClarification,
        signals: aiRouting.signals,
      });

      // ── Human handoff: hard block AI reply generation/autosend ──────────────
      // Follow-up force phrases bypass stale handoff so customers get a reply when nudging.
      if (chatId && !forceAutoBypass) {
        try {
          const conv = await storage.getConversation(chatId);
          if (conv?.contactId) {
            const events = await storage.getActivityEvents(conv.contactId, 120);
            if (isConversationHandoffActive(events, chatId)) {
              console.info("[AI-AUTO] triggered", false);
              console.info("[AI-AUTO] blocked", "handoff_triggered");
              return res.json({
                suggestion: "",
                confidence: 0,
                status: "handoff",
                autoSendAllowed: false,
                autoSendReason: "handoff_triggered",
                contactId: resolvedContactId,
                conversationId: resolvedConversationId,
              });
            }
          }
        } catch {
          // ignore
        }
      }

      let routingHandoffLogged = false;
      if (lastInbound && !forceAutoBypass && routingShouldTriggerHandoff(aiRouting)) {
        try {
          if (chatId) {
            const conv = await storage.getConversation(chatId);
            if (conv?.contactId) {
              console.info("[HANDOFF_TRIGGERED]", {
                contactId: conv.contactId,
                routingDecision: aiRouting.decision,
                reason: aiRouting.reason,
                message: lastInbound.slice(0, 500),
              });
              await storage.createActivityEvent({
                userId,
                contactId: conv.contactId,
                conversationId: chatId,
                eventType: "ai_handoff",
                eventData: {
                  routingDecision: aiRouting.decision,
                  routingReason: aiRouting.reason,
                  message: lastInbound.slice(0, 500),
                  reason: "ai_routing_assign_agent",
                },
                actorType: "system",
              });
              routingHandoffLogged = true;
            }
          }
        } catch {
          // ignore
        }
      }
      
      // Validate tone parameter
      const validTones = ["neutral", "friendly", "professional", "sales"];
      const selectedTone = validTones.includes(tone) ? tone : undefined;
      
      // Use explicit language override from request, fall back to user's preferred language
      const validLanguages = ["en", "he", "es", "ar"];
      const requestLanguage = req.body.language;
      const aiLanguage = (validLanguages.includes(requestLanguage) ? requestLanguage : req.user.language) as
        | "en"
        | "he"
        | "es"
        | "ar"
        | undefined;

      const businessMode = normalizeBusinessAiMode((settings as any)?.aiMode);
      const wantsAuto = requestedMode === "auto";

      const userInboundTurns = historyTurns.filter((m) => m.role === "user").length;
      const isNewConversationHeuristic = userInboundTurns <= 1;

      let chatbotArb = { flowMatched: false as boolean, reason: "skipped_no_chat_id" as string };
      if (chatId) {
        try {
          const convArb = await storage.getConversation(chatId);
          if (convArb?.contactId) {
            chatbotArb = await evaluateChatbotInboundArbitration({
              userId,
              contactId: convArb.contactId,
              conversationId: chatId,
              channel: convArb.channel || "whatsapp",
              message: lastInbound,
              isNewConversation: isNewConversationHeuristic,
            });
          } else {
            chatbotArb = { flowMatched: false, reason: "conversation_missing_contact" };
          }
        } catch {
          chatbotArb = { flowMatched: false, reason: "arbitration_fetch_failed" };
        }
      }

      const substantiveInbound = isSubstantiveTextForAiAutoSend(lastInbound);
      const skipAiModelForAutoNonText =
        wantsAuto && !substantiveInbound && !forceAutoBypass;

      let suggestion: { suggestion?: string; confidence?: number } = {
        suggestion: "",
        confidence: 0,
      };

      let enrichedContactContext = contactContext as Record<string, unknown> | undefined;
      if (chatId) {
        try {
          const convForPrefs = await storage.getConversation(chatId);
          if (convForPrefs?.contactId) {
            const contactForPrefs = await storage.getContact(convForPrefs.contactId);
            if (contactForPrefs) {
              const { resolveBuyerMatchingTraceId } = await import("./buyerMatchingTraceRegistry");
              let lastInboundMessageId: string | null = null;
              if (convForPrefs.id) {
                const recentMessages = await storage.getMessages(convForPrefs.id, 40);
                const lastInbound = [...recentMessages]
                  .reverse()
                  .find((m) => m.direction === "inbound");
                lastInboundMessageId = lastInbound?.id ?? null;
              }
              buyerMatchingTraceId = resolveBuyerMatchingTraceId(
                convForPrefs.contactId,
                lastInboundMessageId,
                convForPrefs.id,
              );

              const {
                shouldRunBuyerPreferencePipeline,
                syncBuyerPreferencesForInboundMessage,
                readBuyerPreferenceProfile,
              } = await import("./buyerPreferenceService");
              const { buildBuyerPreferenceAiContext } = await import(
                "@shared/buyerPreferenceDisplay"
              );
              const historyTurns = conversationHistory as Array<{ role: string; content?: string }>;
              const lastUserInbound =
                historyTurns.filter((m) => m.role === "user").pop()?.content?.trim() || "";
              const isBookingSuggestRoute =
                aiRouting.decision === "BOOK_APPOINTMENT" && !aiRouting.needsRoutingClarification;

              const {
                shouldRunSellerPreferencePipeline,
                syncSellerPreferencesForInboundMessage,
                buildSellerPreferenceAiContext,
                shouldSkipBuyerPipelineForSellerLead,
                readSellerPreferenceProfile,
              } = await import("./sellerPreferenceService");
              const sellerGate = await shouldRunSellerPreferencePipeline(
                userId,
                contactForPrefs,
                lastUserInbound,
              );
              const skipBuyerForSeller = shouldSkipBuyerPipelineForSellerLead(sellerGate.sellerIntent);

              const prefGate = await shouldRunBuyerPreferencePipeline(userId, contactForPrefs);
              const contextPatch: Record<string, unknown> = { ...(contactContext || {}) };

              if (sellerGate.ok && lastUserInbound) {
                const sellerProfile = isBookingSuggestRoute
                  ? readSellerPreferenceProfile(contactForPrefs)
                  : await syncSellerPreferencesForInboundMessage({
                      contact: contactForPrefs,
                      inboundText: lastUserInbound,
                      conversationId: convForPrefs.id,
                      sellerIntent: sellerGate.sellerIntent,
                    });
                const { assessSellerQualification, formatSellerQualificationContextForAi } =
                  await import("@shared/sellerQualification");
                const sellerQualification = assessSellerQualification({
                  profile: sellerProfile,
                  inboundText: lastUserInbound,
                  sellerIntent: sellerGate.sellerIntent,
                });
                contextPatch.sellerQualificationContext =
                  formatSellerQualificationContextForAi(sellerQualification);
                contextPatch.sellerIntent = sellerGate.sellerIntent;
                const sellerAiCtx = buildSellerPreferenceAiContext(sellerProfile);
                if (sellerAiCtx.sellerPreferences) {
                  contextPatch.sellerPreferences = sellerAiCtx.sellerPreferences;
                }
              }

              let profile = isBookingSuggestRoute
                ? readBuyerPreferenceProfile(contactForPrefs)
                : skipBuyerForSeller
                  ? readBuyerPreferenceProfile(contactForPrefs)
                  : await syncBuyerPreferencesForInboundMessage({
                      contact: contactForPrefs,
                      inboundText: lastUserInbound,
                      conversationId: convForPrefs.id,
                      messageId: lastInboundMessageId ?? undefined,
                    });

              copilotTraceProfile = profile;

              if (prefGate.ok && !isBookingSuggestRoute && !skipBuyerForSeller) {
                const {
                  assessBuyerQualification,
                  formatQualificationContextForAi,
                } = await import("@shared/buyerQualification");
                const {
                  findMatchingListingsForContact,
                  getInventoryMatchSummaryForContact,
                } = await import("./inventory/inventoryMatchingService");
                const {
                  summarizeListingsForTrace,
                  traceBuyerMatchingCopilotDecision,
                } = await import("@shared/buyerMatchingTrace");
                const matchResult = await findMatchingListingsForContact(
                  convForPrefs.contactId,
                  userId,
                  { traceId: buyerMatchingTraceId ?? undefined },
                );
                copilotMatchListings = summarizeListingsForTrace(matchResult.matches ?? []);
                copilotMatchCount = matchResult.matchCount;
                const cf = (contactForPrefs.customFields || {}) as Record<string, unknown>;
                const qualification = assessBuyerQualification({
                  profile,
                  inboundText: lastUserInbound,
                  matchCount: matchResult.matchCount,
                  buyRentIntent:
                    typeof contactContext?.intent === "string"
                      ? contactContext.intent
                      : typeof cf.intent === "string"
                        ? cf.intent
                        : null,
                  leadType: typeof cf.leadType === "string" ? cf.leadType : null,
                });
                contextPatch.buyerQualificationContext =
                  formatQualificationContextForAi(qualification);
                contextPatch.copilotDecisionReason = qualification.copilotDecisionReason;
                copilotQualification = qualification;

                if (buyerMatchingTraceId) {
                  traceBuyerMatchingCopilotDecision({
                    traceId: buyerMatchingTraceId,
                    contactId: convForPrefs.contactId,
                    userId,
                    source: "suggest-reply:pre_ai",
                    profile,
                    listings: copilotMatchListings,
                    matchCount: copilotMatchCount,
                    copilotDecisionReason: qualification.copilotDecisionReason,
                    primaryRecommendation: qualification.suggestedQuestion,
                    qualificationState: qualification.level,
                  });
                }

                const aiPrefCtx = buildBuyerPreferenceAiContext(profile);
                if (aiPrefCtx.buyerPreferences) {
                  contextPatch.buyerPreferences = aiPrefCtx.buyerPreferences;
                }
                if (aiPrefCtx.budget) contextPatch.budget = aiPrefCtx.budget;
                else delete contextPatch.budget;
                if (aiPrefCtx.timeline) contextPatch.timeline = aiPrefCtx.timeline;
                else delete contextPatch.timeline;
                if (aiPrefCtx.financing) contextPatch.financing = aiPrefCtx.financing;
                else delete contextPatch.financing;

                const inventorySummary = await getInventoryMatchSummaryForContact(
                  convForPrefs.contactId,
                  userId,
                  { qualificationLevel: qualification.level },
                );
                if (inventorySummary) {
                  contextPatch.inventoryMatchSummary = inventorySummary;
                }
              }
              if (lastUserInbound) {
                const { detectListingFollowUp } = await import(
                  "@shared/inventory/inventoryListingFollowUp"
                );
                const { buildListingComposerMessage } = await import(
                  "@shared/inventory/inventoryComposerDraft"
                );
                const {
                  getInventoryListingWithFlyerFields,
                  createDirectShareLinkForUserListing,
                } = await import("./inventory/inventoryDb");
                const { inventoryListingToMatchInput } = await import(
                  "./inventory/inventoryMatchingService"
                );
                const { getAppOrigin } = await import("./urlOrigins");
                const followUp = detectListingFollowUp(historyTurns, lastUserInbound);
                if (followUp.active && followUp.listingId) {
                  const listingRow = await getInventoryListingWithFlyerFields(userId, followUp.listingId);
                  if (listingRow) {
                    const listing = inventoryListingToMatchInput(listingRow);
                    let followUpViewUrl: string | null = null;
                    try {
                      const share = await createDirectShareLinkForUserListing(
                        userId,
                        followUp.listingId,
                        getAppOrigin(),
                      );
                      followUpViewUrl = share.shareUrl;
                    } catch {
                      followUpViewUrl = null;
                    }
                    const composer = buildListingComposerMessage({
                      listing: {
                        listingId: listingRow.id,
                        publicSlug: listingRow.publicSlug,
                        priceCents: listing.priceCents,
                        beds: listing.beds,
                        baths: listing.baths,
                        city: listing.city,
                        state: listing.state,
                        propertyType: listing.propertyType,
                        listingUrl: listing.listingUrl,
                        description: listing.description,
                        photos: listing.photos,
                      },
                      contactFirstName: (contactForPrefs.name || "").trim().split(/\s+/)[0],
                      featureHints: [],
                      viewUrl: followUpViewUrl,
                    });
                    contextPatch.listingFollowUp = `Listing already recommended in thread:\n${composer.text}`;
                  }
                }
              }
              if (Object.keys(contextPatch).length > 0) {
                enrichedContactContext = contextPatch;
              }
            }
          }
        } catch {
          /* non-fatal — suggest without preference memory */
        }
      }

      if (!skipAiModelForAutoNonText) {
        suggestion = await aiService.suggestReply(
          userId,
          chatId,
          conversationHistory,
          knowledge || undefined,
          settings || undefined,
          selectedTone,
          aiLanguage,
          enrichedContactContext || undefined,
          aiRouting,
        );
      }

      if (suggestion.suggestion && !routingAllowsSchedulingLink(aiRouting)) {
        suggestion.suggestion = stripSchedulingUrlsFromReply(suggestion.suggestion);
      }

      let autoSendAllowed = false;
      let autoSendReason = wantsAuto ? "not_evaluated" : "not_requested";
      let contactIdForLog: string | null = null;

      if (wantsAuto && chatId) {
        try {
          const conv = await storage.getConversation(chatId);
          contactIdForLog = conv?.contactId ?? null;
        } catch {
          contactIdForLog = null;
        }
      }

      let autoSendStrongIntent = false;
      if (wantsAuto) {
        const history = conversationHistory as Array<{ role: string; content?: string }>;
        const inboundContents = history.filter((m) => m.role === "user").map((m) => m.content || "");
        const joinedInbound = inboundContents.join("\n");
        const lastInboundForIntent = inboundContents[inboundContents.length - 1]?.trim() || "";
        autoSendStrongIntent = detectStrongAutoIntent(joinedInbound, lastInboundForIntent);

        if (skipAiModelForAutoNonText) {
          autoSendAllowed = false;
          autoSendReason = chatbotArb.flowMatched
            ? "non_text_inbound_chatbot_active"
            : "non_text_inbound";
        } else if (routingHandoffLogged || routingShouldTriggerHandoff(aiRouting)) {
          autoSendAllowed = false;
          autoSendReason = "routing_assign_agent";
        } else if (chatbotArb.flowMatched) {
          autoSendAllowed = false;
          autoSendReason = "chatbot_flow_active";
        } else {
          const scoringKnowledge = businessKnowledgeFromAiRecord(knowledge as any);
          const gate = evaluateFullAutoSend({
            businessMode,
            conversationHistory,
            suggestion: suggestion.suggestion || "",
            confidence: typeof suggestion.confidence === "number" ? suggestion.confidence : 0,
            businessKnowledge: scoringKnowledge,
          });
          autoSendAllowed = gate.allowed;
          autoSendReason = gate.reason;
          if (autoSendAllowed && chatId && contactIdForLog) {
            const conv = await storage.getConversation(chatId);
            const guard = await evaluateAutomationSendGuard({
              userId,
              contactId: contactIdForLog,
              conversationId: chatId,
              channel: conv?.channel || undefined,
              source: "ai_auto",
              idempotencyKey: `ai_auto:${userId}:${chatId}:${String(suggestion.suggestion || "").slice(0, 160)}`,
            });
            if (!guard.ok) {
              autoSendAllowed = false;
              autoSendReason = `automation_send_guard:${guard.reason}`;
            }
          }
        }

        console.info("[AI-AUTO-ARBITRATION]", {
          flowMatched: chatbotArb.flowMatched,
          aiAutoSuppressed:
            (wantsAuto && chatbotArb.flowMatched && !autoSendAllowed) ||
            (wantsAuto && skipAiModelForAutoNonText),
          reason: autoSendReason,
          chatbotReason: chatbotArb.reason,
          substantiveInbound,
          skipAiModelForAutoNonText,
        });

        console.info("[AI-AUTO]", {
          userId,
          chatId: chatId ?? null,
          contactId: contactIdForLog ?? "unknown",
          requestedMode,
          businessMode,
          autoTriggered: autoSendAllowed,
          reason: autoSendReason,
          confidence: suggestion.confidence,
          strongIntent: autoSendStrongIntent,
          forceBypass: forceAutoBypass,
          suggestionLen: (suggestion.suggestion || "").trim().length,
          hasBusinessKnowledge: !!knowledgeRaw,
          fairUseStatus: fairUse.status,
        });
        console.info("[AI-AUTO] triggered", autoSendAllowed);
        console.info("[AI-AUTO] blocked", autoSendAllowed ? "(none)" : autoSendReason);
      }

      // Track usage
      await storage.incrementAiUsage(userId, "repliesSuggested");

      if (
        buyerMatchingTraceId &&
        copilotTraceProfile &&
        (suggestion.suggestion || "").trim()
      ) {
        const { traceBuyerMatchingCopilotDecision } = await import("@shared/buyerMatchingTrace");
        traceBuyerMatchingCopilotDecision({
          traceId: buyerMatchingTraceId,
          contactId: resolvedContactId ?? "unknown",
          userId,
          source: "suggest-reply:post_ai",
          profile: copilotTraceProfile,
          listings: copilotMatchListings,
          matchCount: copilotMatchCount,
          copilotDecisionReason:
            copilotQualification?.copilotDecisionReason ??
            (typeof enrichedContactContext?.copilotDecisionReason === "string"
              ? enrichedContactContext.copilotDecisionReason
              : "unknown"),
          primaryRecommendation: copilotQualification?.suggestedQuestion ?? null,
          qualificationState: copilotQualification?.level ?? null,
          aiSuggestion: suggestion.suggestion,
        });
      }

      res.json({
        ...suggestion,
        status: fairUse.status,
        shouldDowngradeToSuggestOnly: fairUse.shouldDowngradeToSuggestOnly,
        autoSendAllowed,
        autoSendReason,
        contactId: resolvedContactId,
        conversationId: resolvedConversationId,
        buyerMatchingTraceId: buyerMatchingTraceId ?? undefined,
        copilotDecisionReason:
          typeof enrichedContactContext?.copilotDecisionReason === "string"
            ? enrichedContactContext.copilotDecisionReason
            : undefined,
        flowMatched: chatbotArb.flowMatched,
        aiRouting: {
          decision: aiRouting.decision,
          confidence: aiRouting.confidence,
          reason: aiRouting.reason,
          needsRoutingClarification: aiRouting.needsRoutingClarification,
          signals: aiRouting.signals,
        },
        aiAutoSuppressed:
          wantsAuto &&
          (!autoSendAllowed) &&
          (chatbotArb.flowMatched || skipAiModelForAutoNonText),
        suppressionReason: wantsAuto ? autoSendReason : undefined,
        ...(wantsAuto ? { autoSendStrongIntent } : {}),
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
      const knowledgeRaw = await storage.getAiBusinessKnowledge(userId);
      const knowledge = await applyCalendlyBookingLinkForAi(userId, knowledgeRaw);

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

  // Generate AI Memory — natural-language lead summary for AI Memory tab
  app.post("/api/ai/memory", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;
      const limits = await subscriptionService.getUserLimits(userId);
      if (!limits?.effectiveHasAIBrain) {
        return res.status(403).json({
          error: "AI Brain add-on is required for AI Memory.",
          needsUpgrade: true,
          code: "AI_BRAIN_REQUIRED",
        });
      }
      const { messages, intel } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages array required" });
      }

      const { aiService } = await import("./aiService");
      const memory = await aiService.generateAIMemory(messages, intel || {});

      res.json({ memory });
    } catch (error) {
      console.error("AI Memory generation error:", error);
      res.status(500).json({ error: "Failed to generate AI memory" });
    }
  });

  // ============= ROUTE MODULES =============
  registerMediaRoutes(app);
  registerWhatsappIntegrationRoutes(app);
  registerContactRoutes(app);
  registerSchedulingRoutes(app);
  registerConversationRoutes(app);
  registerChannelRoutes(app);
  registerAutomationTemplateRoutes(app);
  registerCampaignEnrollmentRoutes(app);
  registerTemplateRoutes(app);
  registerWebhookRoutes(app);
  registerInventoryRoutes(app);
  registerPublicListingRoutes(app);
  registerPublicAgentPageRoutes(app);
  registerAgentPageSettingsRoutes(app);
  registerPublicListingSitemapRoutes(app);
  registerBusinessProfileRoutes(app);

  return httpServer;
}
