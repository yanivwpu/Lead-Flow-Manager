import type { Express } from "express";
import type { Channel, MessageTemplate, PresetCampaign } from "@shared/schema";
import {
  buildMetaCloudTemplateSendComponents,
  buildCarouselCrmDisplayCardsForPersist,
  buildMetaLibraryTemplateSendComponents,
  type CarouselCardRuntimeMedia,
  effectiveTemplateRowForLibrarySend,
  enrichMessageTemplateMediaFields,
  coerceTemplateCarouselDefaultMediaMap,
  runtimeCarouselRowsToDefaultMediaMap,
  getInboxTemplateSendBlockReason,
  inferMetaTemplateShape,
  normalizeTemplateVariableMap,
  parseMetaGraphTemplateForLibrary,
  resolveLibraryHeaderMediaDisplayUrl,
  substituteTemplateVariablesForDisplay,
} from "@shared/metaTemplateSend";
import { storage } from "../storage";
import { getMetaMessageTemplates, sendMetaWhatsAppTemplate } from "../userMeta";
import { classifyTemplateMediaUrlForLog } from "../templateSendMediaPreflight";
import {
  enumerateTemplateHttpsMediaLinks,
  validateProductionTemplateMediaUrl,
} from "../templateMediaProductionValidator";
import { hostLooksLikeTransientMetaCdn, normalizeTemplatePayloadMediaUrls } from "../templateMediaNormalization";
import { WA_TEMPLATE_MEDIA_NEEDS_CONVERSION_MESSAGE } from "../waTemplateMediaUserMessages";
import { isPersistableWhatsAppTemplateDefaultUrl } from "../templateMediaPersistPolicy";
import { getUserTwilioClient } from "../userTwilio";
import { subscriptionService } from "../subscriptionService";
import {
  extractPlaceholderKeysFromCampaignMessages,
  getPresetCampaignStepCount,
  parsePresetCampaignMessagesArray,
} from "@shared/campaignPlaceholders";
import { getPresetCampaignStatusLabel } from "@shared/presetCampaignLabels";
import {
  buildReEngagementAfterFailedSend,
  buildReEngagementAfterSuccessfulSend,
  parseConversationReEngagement,
} from "@shared/reEngagement";

/** When true, “launch” creates `active` and may enqueue sends. Until then, launch → `active_pending`. */
const PRESET_CAMPAIGN_SEND_ENGINE_READY = true;

const ALLOWED_PRESET_CAMPAIGN_STATUS = new Set([
  "draft",
  "active_pending",
  "active",
  "paused",
  "completed",
]);

/** Stored in `messages.content` — template label + optional resolved text header + body (CRM bubble). */
function buildOutboundTemplateDisplayContent(
  template: {
    name: string;
    bodyText: string | null | undefined;
    headerType: string | null | undefined;
    headerContent: string | null | undefined;
  },
  variableValues: Record<string, string>
): string {
  const lines: string[] = [`Template: ${template.name}`];
  const ht = (template.headerType || "").toLowerCase();
  const hc = template.headerContent;
  if (ht === "text" && (hc || "").trim()) {
    const renderedHeader = substituteTemplateVariablesForDisplay(hc, variableValues);
    if (renderedHeader) {
      lines.push("");
      lines.push(renderedHeader);
    }
  }
  /** Image/video/document URLs belong in `messages.media_url` + `template_variables.headerMediaUrl`, not body text. */
  const bodyRendered = substituteTemplateVariablesForDisplay(template.bodyText, variableValues);
  if (bodyRendered) {
    lines.push("");
    lines.push(bodyRendered);
  }
  return lines.join("\n").trim();
}

function headerTypeToMessageMediaType(
  headerType: string | null | undefined
): "image" | "video" | "document" | undefined {
  const h = (headerType || "").toLowerCase();
  if (h === "image") return "image";
  if (h === "video") return "video";
  if (h === "document") return "document";
  return undefined;
}

/** User-facing message — no tokens; Meta codes OK for support. */
function formatFriendlyMetaTemplateUserMessage(metaErr: unknown): string {
  const e = metaErr as {
    message?: string;
    metaErrorCode?: number;
    fetchFailureKind?: string;
    httpStatus?: number;
  };
  if (e.fetchFailureKind === "missing_token_or_phone_number_id") {
    return String(e.message || "Connect WhatsApp (Meta) in Settings.");
  }
  if (
    e.fetchFailureKind === "timeout" ||
    e.fetchFailureKind === "dns" ||
    e.fetchFailureKind === "connection" ||
    e.fetchFailureKind === "unknown_network"
  ) {
    return String(e.message || "Network error while contacting WhatsApp (Meta). Try again.");
  }
  const msg = String(e?.message || "");
  const code = e?.metaErrorCode;
  if (code === 132012 || msg.includes("132012")) {
    return "WhatsApp couldn’t send this template. Confirm it still matches your approved version in WhatsApp Manager, then try again.";
  }
  if (!msg) return "WhatsApp couldn’t send this template. Try again or verify the template in WhatsApp Manager.";
  return msg;
}

async function persistFailedOutboundTemplateMessage(args: {
  userId: string;
  contactId: string;
  template: MessageTemplate;
  templateLang: string;
  metaSendPath: "library_full" | "quick_send";
  libraryEffectiveTemplate: MessageTemplate;
  variableValues: Record<string, string>;
  optionalHeaderMediaUrl: string | null | undefined;
  optionalHeaderMediaFilename: string | null | undefined;
  optionalHeaderMediaMimeType: string | null | undefined;
  optionalHeaderMediaSizeBytes: number | undefined;
  carouselCardMediaNormalized: CarouselCardRuntimeMedia[];
  errorMessage: string;
  errorCode?: string | null;
  persistedHeaderDefaultMediaUrl?: string | null;
  persistedHeaderDefaultOriginalFilename?: string | null;
}): Promise<void> {
  const { conversationId } = await ensureWhatsAppConversationForContact(args.userId, args.contactId);
  const displaySource =
    args.metaSendPath === "library_full" ? args.libraryEffectiveTemplate : args.template;
  const resolvedHeaderMediaUrl = resolveLibraryHeaderMediaDisplayUrl(
    displaySource,
    args.variableValues,
    args.optionalHeaderMediaUrl ?? null,
    args.persistedHeaderDefaultMediaUrl ?? null
  );
  const displayContent = buildOutboundTemplateDisplayContent(
    {
      name: displaySource.name,
      bodyText: displaySource.bodyText,
      headerType: displaySource.headerType,
      headerContent: displaySource.headerContent,
    },
    args.variableValues
  );
  const preview = displayContent.substring(0, 100);

  const headerTypeLower = (displaySource.headerType || "").toLowerCase();
  const docOrigPersist =
    (args.optionalHeaderMediaFilename && String(args.optionalHeaderMediaFilename).trim()) ||
    (args.persistedHeaderDefaultOriginalFilename && String(args.persistedHeaderDefaultOriginalFilename).trim()) ||
    null;
  const headerMedia =
    resolvedHeaderMediaUrl && ["image", "video", "document"].includes(headerTypeLower)
      ? {
          url: resolvedHeaderMediaUrl,
          type: headerTypeLower,
          originalFilename: headerTypeLower === "document" ? docOrigPersist : null,
          mimeType: args.optionalHeaderMediaMimeType ?? null,
          sizeBytes:
            args.optionalHeaderMediaSizeBytes !== undefined ? args.optionalHeaderMediaSizeBytes : null,
        }
      : null;

  const ttCarousel =
    (args.template.templateType || "").toLowerCase() === "carousel" ||
    (Array.isArray(args.template.carouselCards) && (args.template.carouselCards as unknown[]).length > 0);
  let carouselCardsDisplay: ReturnType<typeof buildCarouselCrmDisplayCardsForPersist> | undefined;
  if (ttCarousel && Array.isArray(args.template.carouselCards)) {
    carouselCardsDisplay = buildCarouselCrmDisplayCardsForPersist({
      carouselCards: args.template.carouselCards as unknown[],
      variableValues: args.variableValues,
      carouselCardMedia:
        args.carouselCardMediaNormalized.length > 0 ? args.carouselCardMediaNormalized : undefined,
    });
  }

  const docFnFailed =
    (args.optionalHeaderMediaFilename && String(args.optionalHeaderMediaFilename).trim()) ||
    (args.persistedHeaderDefaultOriginalFilename && String(args.persistedHeaderDefaultOriginalFilename).trim()) ||
    "";
  const templateVariablesPayload = {
    ...normalizeTemplateVariableMap(args.variableValues),
    templateLanguage: args.templateLang,
    templateName: args.template.name,
    channel: "whatsapp",
    provider: "meta",
    headerType: displaySource.headerType ?? null,
    headerMediaUrl: resolvedHeaderMediaUrl,
    ...(headerMedia ? { headerMedia } : {}),
    ...(docFnFailed && (displaySource.headerType || "").toLowerCase() === "document"
      ? { headerDocumentFilename: docFnFailed }
      : {}),
    ...(carouselCardsDisplay && carouselCardsDisplay.length > 0
      ? { templateType: "carousel", carouselCardsDisplay }
      : {}),
  };

  const mediaMeta =
    resolvedHeaderMediaUrl && headerTypeToMessageMediaType(displaySource.headerType);

  await storage.createMessage({
    conversationId,
    contactId: args.contactId,
    userId: args.userId,
    direction: "outbound",
    content: displayContent,
    contentType: "template",
    templateId: args.template.id,
    templateVariables: templateVariablesPayload as any,
    ...(resolvedHeaderMediaUrl
      ? {
          mediaUrl: resolvedHeaderMediaUrl,
          ...(mediaMeta ? { mediaType: mediaMeta } : {}),
        }
      : {}),
    status: "failed",
    externalMessageId: null,
    errorMessage: args.errorMessage,
    errorCode: args.errorCode ?? undefined,
    sentAt: new Date(),
  });

  await storage.updateConversation(conversationId, {
    lastMessageAt: new Date(),
    lastMessagePreview: preview,
    lastMessageDirection: "outbound",
  });
}

async function ensureWhatsAppConversationForContact(
  userId: string,
  contactId: string
): Promise<{ conversationId: string; created: boolean }> {
  const wa: Channel = "whatsapp";
  const existing = await storage.getConversationByContactAndChannel(contactId, wa);
  if (existing) {
    return { conversationId: existing.id, created: false };
  }
  await subscriptionService.incrementConversationUsage(userId);
  const created = await storage.createConversation({
    userId,
    contactId,
    channel: "whatsapp",
    status: "open",
  });
  return { conversationId: created.id, created: true };
}

export function registerTemplateRoutes(app: Express): void {
  // ============= Meta Templates =============

  // Get Meta message templates
  app.get("/api/meta/templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const templates = await getMetaMessageTemplates(req.user.id);
      res.json(templates);
    } catch (error: any) {
      console.error("Error fetching Meta templates:", error);
      res.status(500).json({ error: error.message || "Failed to fetch templates" });
    }
  });

  // ============= Localized Automation Templates =============

  // Get localized automation templates (preset library)
  app.get("/api/automation-templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { language, category, industry } = req.query;
      const { getFilteredTemplates, CATEGORY_LABELS, INDUSTRY_LABELS } = await import(
        "@shared/localizedTemplates"
      );

      // Normalize locale codes like "en-US" → "en"; drop if unrecognized
      const VALID_LANGS = ["en", "he", "es"];
      const rawLang = typeof language === "string" ? language.split("-")[0].toLowerCase() : undefined;
      const normalizedLang = rawLang && VALID_LANGS.includes(rawLang) ? rawLang : undefined;

      const templates = getFilteredTemplates(
        normalizedLang as any,
        category as any,
        industry as any
      );

      res.json({ templates, categoryLabels: CATEGORY_LABELS, industryLabels: INDUSTRY_LABELS });
    } catch (error) {
      console.error("Error fetching automation templates:", error);
      res.status(500).json({ error: "Failed to fetch automation templates" });
    }
  });

  // ============= Preset campaigns (saved instances from localized presets) =============

  app.get("/api/preset-campaigns", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const rows = await storage.getPresetCampaignsForUser(req.user.id);
      const aggregates = await storage.getCampaignAggregatesForUser(req.user.id);
      res.json(
        rows.map((c) => {
          const agg = aggregates[c.id] ?? {
            enrollmentCount: 0,
            activeEnrollments: 0,
            completedEnrollments: 0,
            sentStepEvents: 0,
            failedStepEvents: 0,
          };
          return {
            ...c,
            stepCount: getPresetCampaignStepCount(c.messages),
            statusLabel: getPresetCampaignStatusLabel(c.status),
            executionStats: agg,
          };
        })
      );
    } catch (error) {
      console.error("Error fetching preset campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.post("/api/preset-campaigns", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const {
        sourcePresetId,
        name,
        language,
        category,
        industry,
        messages,
        placeholders,
        placeholderDefaults,
        aiEnabled,
        channel,
        launchImmediately,
      } = req.body as Record<string, unknown>;

      if (!sourcePresetId || !name || !category) {
        return res.status(400).json({
          error: "Missing required fields: sourcePresetId, name, category",
        });
      }

      const msgs = Array.isArray(messages) ? messages : [];
      const delays = (msgs as Array<{ delay?: string }>).map((m) => String(m?.delay ?? "0"));

      let status: string;
      if (!launchImmediately) {
        status = "draft";
      } else if (!PRESET_CAMPAIGN_SEND_ENGINE_READY) {
        status = "active_pending";
      } else {
        status = "active";
      }

      const audienceConfig: Record<string, unknown> = {
        audiencePlaceholder: true,
        note: "Audience targeting not configured",
      };
      if (launchImmediately && !PRESET_CAMPAIGN_SEND_ENGINE_READY) {
        audienceConfig.launchRequestedAt = new Date().toISOString();
        audienceConfig.sendEngineReady = false;
      }

      const campaign = await storage.createPresetCampaign({
        userId: req.user.id,
        name: String(name),
        sourcePresetId: String(sourcePresetId),
        status,
        channel:
          typeof channel === "string" && channel.trim() ? channel.trim() : "whatsapp",
        language: typeof language === "string" ? language : "en",
        category: String(category),
        industry: typeof industry === "string" ? industry : "general",
        messages: msgs as unknown[],
        delays,
        placeholders: Array.isArray(placeholders) ? placeholders : [],
        placeholderDefaults:
          typeof placeholderDefaults === "object" && placeholderDefaults !== null
            ? (placeholderDefaults as Record<string, unknown>)
            : {},
        aiEnabled: !!aiEnabled,
        audienceConfig,
      });

      const statusLabel = getPresetCampaignStatusLabel(campaign.status);
      const message =
        campaign.status === "draft"
          ? "Campaign saved as a draft. No messages were sent."
          : campaign.status === "active_pending"
            ? "Campaign saved. Manual enrollments can send steps; automated audience triggers are not enabled yet."
            : "Campaign saved. You can enroll contacts manually; the scheduler delivers steps on the configured delays.";

      res.json({
        campaign,
        statusLabel,
        message,
      });
    } catch (error) {
      console.error("Error creating preset campaign:", error);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  app.get("/api/preset-campaigns/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const row = await storage.getPresetCampaignForUser(req.params.id, req.user.id);
      if (!row) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const [enrollments, stepEvents, agg] = await Promise.all([
        storage.getCampaignEnrollmentsForCampaign(req.user.id, row.id, 100),
        storage.getRecentCampaignStepEventsForCampaign(req.user.id, row.id, 50),
        storage.getCampaignAggregatesForUser(req.user.id),
      ]);

      const totalSteps = getPresetCampaignStepCount(row.messages);

      const enrollmentsWithNames = await Promise.all(
        enrollments.map(async (e) => {
          const contact = await storage.getContact(e.contactId);
          return {
            ...e,
            contactName: contact?.name ?? "Unknown contact",
            totalSteps,
          };
        })
      );

      res.json({
        ...row,
        totalSteps,
        statusLabel: getPresetCampaignStatusLabel(row.status),
        executionStats: agg[row.id] ?? {
          enrollmentCount: 0,
          activeEnrollments: 0,
          completedEnrollments: 0,
          sentStepEvents: 0,
          failedStepEvents: 0,
        },
        enrollments: enrollmentsWithNames,
        recentStepEvents: stepEvents,
      });
    } catch (error) {
      console.error("Error fetching preset campaign:", error);
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  app.patch("/api/preset-campaigns/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const existing = await storage.getPresetCampaignForUser(req.params.id, req.user.id);
      if (!existing) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const body = req.body as Record<string, unknown>;
      const action = typeof body.action === "string" ? body.action : "";

      if (action === "pause") {
        if (existing.status !== "active_pending" && existing.status !== "active") {
          return res.status(400).json({
            error: "Only campaigns that are active or queued can be paused.",
          });
        }
        const prevAc =
          typeof existing.audienceConfig === "object" && existing.audienceConfig !== null
            ? (existing.audienceConfig as Record<string, unknown>)
            : {};
        const updated = await storage.updatePresetCampaign(req.params.id, req.user.id, {
          status: "paused",
          audienceConfig: {
            ...prevAc,
            previousStatusBeforePause: existing.status,
          } as Record<string, unknown>,
        });
        if (!updated) return res.status(404).json({ error: "Campaign not found" });
        return res.json({
          campaign: updated,
          statusLabel: getPresetCampaignStatusLabel(updated.status),
          message:
            "Campaign paused. Scheduled steps will not run until you resume.",
        });
      }

      if (action === "resume") {
        if (existing.status !== "paused") {
          return res.status(400).json({ error: "Only paused campaigns can be resumed." });
        }
        const ac =
          typeof existing.audienceConfig === "object" && existing.audienceConfig !== null
            ? ({ ...(existing.audienceConfig as Record<string, unknown>) } as Record<string, unknown>)
            : {};
        const prev =
          typeof ac.previousStatusBeforePause === "string"
            ? ac.previousStatusBeforePause
            : "active_pending";
        delete ac.previousStatusBeforePause;

        let nextStatus = prev;
        if (prev === "active" && !PRESET_CAMPAIGN_SEND_ENGINE_READY) {
          nextStatus = "active_pending";
        }

        const updated = await storage.updatePresetCampaign(req.params.id, req.user.id, {
          status: nextStatus,
          audienceConfig: ac as Record<string, unknown>,
        });
        if (!updated) return res.status(404).json({ error: "Campaign not found" });
        return res.json({
          campaign: updated,
          statusLabel: getPresetCampaignStatusLabel(updated.status),
          message:
            "Campaign resumed. Enrolled contacts will continue receiving scheduled steps when due.",
        });
      }

      const patch: Record<string, unknown> = {};
      if (typeof body.name === "string" && body.name.trim()) {
        patch.name = body.name.trim();
      }
      if (typeof body.status === "string" && ALLOWED_PRESET_CAMPAIGN_STATUS.has(body.status)) {
        patch.status = body.status;
      }
      if (typeof body.aiEnabled === "boolean") {
        patch.aiEnabled = body.aiEnabled;
      }
      if (Array.isArray(body.messages)) {
        const raw = body.messages as unknown[];
        if (raw.length === 0) {
          return res.status(400).json({ error: "Campaign must have at least one step." });
        }
        const prevSteps = parsePresetCampaignMessagesArray(existing.messages);
        const msgs = raw.map((item, idx) => {
          const prev =
            prevSteps[idx] && typeof prevSteps[idx] === "object" && prevSteps[idx] !== null
              ? { ...(prevSteps[idx] as Record<string, unknown>) }
              : {};
          const incoming =
            item && typeof item === "object" && item !== null
              ? { ...(item as Record<string, unknown>) }
              : {};
          const merged = { ...prev, ...incoming };
          const delayRaw = merged.delay;
          const delay =
            delayRaw === undefined || delayRaw === null
              ? "0"
              : String(delayRaw).trim() || "0";
          const content =
            typeof merged.content === "string" ? merged.content : "";
          const type =
            typeof merged.type === "string" ? merged.type : "text";
          return { ...merged, delay, content, type };
        });
        patch.messages = msgs;
        patch.delays = msgs.map((m) => String((m as { delay: string }).delay));
      }
      if (Array.isArray(body.placeholders)) {
        patch.placeholders = body.placeholders.map((p) => String(p));
      }
      if (
        body.placeholderDefaults &&
        typeof body.placeholderDefaults === "object" &&
        body.placeholderDefaults !== null
      ) {
        patch.placeholderDefaults = body.placeholderDefaults as Record<string, unknown>;
      }
      if (typeof body.channel === "string" && body.channel.trim()) {
        patch.channel = body.channel.trim();
      }
      if (typeof body.language === "string" && body.language.trim()) {
        patch.language = body.language.trim();
      }
      if (typeof body.category === "string") {
        patch.category = body.category;
      }
      if (typeof body.industry === "string") {
        patch.industry = body.industry;
      }

      if (patch.messages && !Array.isArray(body.placeholders)) {
        const mergedKeys = new Set<string>(
          extractPlaceholderKeysFromCampaignMessages(
            parsePresetCampaignMessagesArray(patch.messages)
          )
        );
        const defs =
          (patch.placeholderDefaults ??
            existing.placeholderDefaults) as Record<string, unknown> | null;
        if (defs && typeof defs === "object") {
          for (const k of Object.keys(defs)) mergedKeys.add(k);
        }
        patch.placeholders = Array.from(mergedKeys).sort();
      } else if (
        patch.placeholderDefaults !== undefined &&
        patch.messages === undefined &&
        !Array.isArray(body.placeholders)
      ) {
        const mergedKeys = new Set<string>(
          extractPlaceholderKeysFromCampaignMessages(parsePresetCampaignMessagesArray(existing.messages))
        );
        const defs = patch.placeholderDefaults as Record<string, unknown>;
        for (const k of Object.keys(defs)) mergedKeys.add(k);
        patch.placeholders = Array.from(mergedKeys).sort();
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const updated = await storage.updatePresetCampaign(
        req.params.id,
        req.user.id,
        patch as Partial<PresetCampaign>
      );
      if (!updated) return res.status(404).json({ error: "Campaign not found" });

      let warning: string | undefined;
      const affectsRunningEnrollments =
        patch.messages !== undefined ||
        patch.delays !== undefined ||
        patch.placeholderDefaults !== undefined ||
        patch.channel !== undefined ||
        patch.placeholders !== undefined;
      if (affectsRunningEnrollments) {
        const enrollments = await storage.getCampaignEnrollmentsForCampaign(
          req.user.id,
          req.params.id,
          400
        );
        const inflight = enrollments.filter((e) =>
          ["active", "paused", "failed"].includes(e.status)
        ).length;
        if (inflight > 0) {
          warning = ` ${inflight} enrollment(s) still in progress: upcoming sends use the updated steps and defaults. Delivered steps stay unchanged.`;
        }
      }

      const message = warning ? `Campaign updated.${warning}` : "Campaign updated.";

      res.json({
        campaign: updated,
        statusLabel: getPresetCampaignStatusLabel(updated.status),
        message,
        warning,
      });
    } catch (error) {
      console.error("Error updating preset campaign:", error);
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });

  app.delete("/api/preset-campaigns/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const removed = await storage.deletePresetCampaign(req.params.id, req.user.id);
      if (!removed) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting preset campaign:", error);
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  app.post("/api/preset-campaigns/:id/duplicate", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const copy = await storage.duplicatePresetCampaign(req.params.id, req.user.id);
      if (!copy) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      res.status(201).json({
        campaign: copy,
        statusLabel: getPresetCampaignStatusLabel(copy.status),
        message:
          "Duplicate saved as a draft. No messages were sent — audience automation is not running yet.",
      });
    } catch (error) {
      console.error("Error duplicating preset campaign:", error);
      res.status(500).json({ error: "Failed to duplicate campaign" });
    }
  });

  // ============= User Automation Templates (Saved from Presets) =============

  // Get user's saved automation templates
  app.get("/api/user-automation-templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { language, category, industry, isActive } = req.query;
      const templates = await storage.getUserAutomationTemplates(req.user.id, {
        language: language as string,
        category: category as string,
        industry: industry as string,
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      });

      res.json(templates);
    } catch (error) {
      console.error("Error fetching user automation templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Get single user automation template
  app.get("/api/user-automation-templates/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const template = await storage.getUserAutomationTemplate(req.params.id);
      if (!template || template.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json(template);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  // Save a preset template to user's library
  app.post("/api/user-automation-templates", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const {
        presetTemplateId,
        name,
        language,
        category,
        industry,
        messages,
        placeholders,
        placeholderDefaults,
        aiEnabled,
        triggerType,
        triggerConfig,
      } = req.body;

      if (!presetTemplateId || !name || !category) {
        return res
          .status(400)
          .json({ error: "Missing required fields: presetTemplateId, name, category" });
      }

      const template = await storage.createUserAutomationTemplate({
        userId: req.user.id,
        presetTemplateId,
        name,
        language: language || "en",
        category,
        industry: industry || "general",
        messages: messages || [],
        placeholders: placeholders || [],
        placeholderDefaults: placeholderDefaults || {},
        aiEnabled: aiEnabled || false,
        triggerType: triggerType || "manual",
        triggerConfig: triggerConfig || {},
      });

      res.json(template);
    } catch (error) {
      console.error("Error creating user automation template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  // Update user automation template
  app.patch("/api/user-automation-templates/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const existing = await storage.getUserAutomationTemplate(req.params.id);
      if (!existing || existing.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }

      const updated = await storage.updateUserAutomationTemplate(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  // Delete user automation template
  app.delete("/api/user-automation-templates/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const existing = await storage.getUserAutomationTemplate(req.params.id);
      if (!existing || existing.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }

      await storage.deleteUserAutomationTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // Activate automation template
  app.post("/api/user-automation-templates/:id/activate", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const existing = await storage.getUserAutomationTemplate(req.params.id);
      if (!existing || existing.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }

      const updated = await storage.updateUserAutomationTemplate(req.params.id, {
        isActive: true,
      });
      res.json({ success: true, template: updated });
    } catch (error) {
      console.error("Error activating template:", error);
      res.status(500).json({ error: "Failed to activate template" });
    }
  });

  // Deactivate automation template
  app.post("/api/user-automation-templates/:id/deactivate", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const existing = await storage.getUserAutomationTemplate(req.params.id);
      if (!existing || existing.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }

      const updated = await storage.updateUserAutomationTemplate(req.params.id, {
        isActive: false,
      });
      res.json({ success: true, template: updated });
    } catch (error) {
      console.error("Error deactivating template:", error);
      res.status(500).json({ error: "Failed to deactivate template" });
    }
  });

  // Get template usage analytics
  app.get("/api/user-automation-templates/:id/analytics", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const existing = await storage.getUserAutomationTemplate(req.params.id);
      if (!existing || existing.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }

      const stats = await storage.getTemplateUsageStats(req.user.id, req.params.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching template analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ============= Message Templates (Pro Feature) =============

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
      const defaultsRows = await storage.listTemplateCarouselMediaDefaultsByUser(req.user.id);
      const defaultsByTemplateId = new Map<string, ReturnType<typeof coerceTemplateCarouselDefaultMediaMap>>();
      for (const row of defaultsRows) {
        defaultsByTemplateId.set(row.templateId, coerceTemplateCarouselDefaultMediaMap(row.cardMedia));
      }
      const approvedNorm = templates.filter(
        (t) => (t.status || "").toLowerCase().trim() === "approved"
      ).length;
      const metaRows = templates.filter((t) => (t.twilioSid || "").startsWith("meta_")).length;
      const approvedMeta = templates.filter(
        (t) =>
          (t.twilioSid || "").startsWith("meta_") &&
          (t.status || "").toLowerCase().trim() === "approved"
      ).length;
      console.log(
        `[TEMPLATE_LIBRARY_QUERY] ${JSON.stringify({
          userId: req.user.id,
          rowCount: templates.length,
          approvedNormalized: approvedNorm,
          metaTwilioSidPrefix: metaRows,
          approvedMeta,
          responsePreviewIds: templates.slice(0, 12).map((t) => ({
            id: t.id,
            name: t.name,
            status: t.status,
            twilioSidPrefix: (t.twilioSid || "").slice(0, 16),
            templateType: t.templateType,
          })),
        })}`
      );
      res.setHeader("Cache-Control", "private, no-store, must-revalidate");
      res.json(
        templates.map((t) => ({
          ...enrichMessageTemplateMediaFields(t),
          carouselDefaultMedia: defaultsByTemplateId.get(t.id) ?? {},
          headerDefaultMediaUrl: (() => {
            const d = defaultsByTemplateId.get(t.id) ?? {};
            const header = (d as any)?.header as { mediaUrl?: string } | undefined;
            const u = typeof header?.mediaUrl === "string" ? header.mediaUrl.trim() : "";
            return u && /^https?:\/\//i.test(u) ? u : null;
          })(),
          headerDefaultOriginalFilename: (() => {
            const d = defaultsByTemplateId.get(t.id) ?? {};
            const header = (d as any)?.header as { originalFilename?: string | null } | undefined;
            const fn = typeof header?.originalFilename === "string" ? header.originalFilename.trim() : "";
            return fn ? fn.slice(0, 240) : null;
          })(),
        }))
      );
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  /**
   * Save per-card carousel header media defaults for a library template (https URLs only).
   */
  app.put("/api/templates/carousel-defaults", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        return res.status(403).json({ error: "Template messaging is a Pro feature" });
      }

      const templateId = typeof req.body?.templateId === "string" ? req.body.templateId.trim() : "";
      const rawCardMedia = req.body?.cardMedia;
      if (!templateId || !rawCardMedia || typeof rawCardMedia !== "object") {
        return res.status(400).json({ error: "templateId and cardMedia object are required" });
      }

      const template = await storage.getMessageTemplate(templateId);
      if (!template || template.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }

      const normalized = coerceTemplateCarouselDefaultMediaMap(rawCardMedia);
      for (const [k, v] of Object.entries(normalized)) {
        if (!isPersistableWhatsAppTemplateDefaultUrl(v.mediaUrl)) {
          return res.status(400).json({
            error:
              "Only stable public media URLs (e.g. your Cloudflare R2 pub host or /objects/uploads) can be saved. Remove Meta/WhatsApp CDN links, signed URLs, localhost, or /api/media/proxy links.",
            field: k,
          });
        }
      }
      await storage.upsertTemplateCarouselMediaDefaults(req.user.id, templateId, normalized as unknown as Record<string, unknown>);
      res.json({ success: true, carouselDefaultMedia: normalized });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "template_not_found_or_forbidden") {
        return res.status(404).json({ error: "Template not found" });
      }
      console.error("carousel-defaults:", error);
      res.status(500).json({ error: "Failed to save carousel defaults" });
    }
  });

  // Sync templates from active WhatsApp provider (Meta or Twilio)
  app.post("/api/templates/sync", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        return res.status(403).json({ error: "Template messaging is a Pro feature" });
      }

      // IMPORTANT: use full session user row (auth-core `getUser` omits WhatsApp provider + Meta fields)
      const user = await storage.getUserForSession(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Provider detection (supports Meta, Twilio, and future providers)
      const providerPref = (user.whatsappProvider || "").toString().trim().toLowerCase();
      const isMetaConnected = !!user.metaConnected;
      const isTwilioConnected = !!user.twilioConnected;
      const resolvedProvider =
        providerPref === "meta" || providerPref === "twilio"
          ? providerPref
          : isMetaConnected
            ? "meta"
            : isTwilioConnected
              ? "twilio"
              : "none";

      const wabaId = user.metaBusinessAccountId ? String(user.metaBusinessAccountId) : null;

      console.log(
        `[WA_TEMPLATE_SYNC] ${JSON.stringify({
          phase: "start",
          userId: req.user.id,
          provider: resolvedProvider,
          wabaId,
        })}`
      );

      let fetched = 0;
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      const skipLog: Array<{
        templateName: string;
        status: string;
        category: string;
        language: string;
        provider: string;
        skipReason: string;
      }> = [];

      function logMetaSkip(entry: (typeof skipLog)[0]) {
        skipLog.push(entry);
        console.warn(
          `[WA_TEMPLATE_SYNC_SKIP] ${JSON.stringify({
            ...entry,
            phase: "template_row_failed",
          })}`
        );
      }

      // ===== META SYNC =====
      if (resolvedProvider === "meta") {
        if (!user.metaConnected || !user.metaBusinessAccountId) {
          console.warn(
            `[WA_TEMPLATE_SYNC] ${JSON.stringify({
              phase: "error",
              provider: resolvedProvider,
              wabaId,
              error: "meta_not_connected",
            })}`
          );
          return res.status(400).json({
            error: "Meta WhatsApp account not connected",
          });
        }

        const rawTemplates = await getMetaMessageTemplates(req.user.id);
        const approvedTemplates = (rawTemplates || []).filter(
          (t: any) => String(t?.status || "").toLowerCase() === "approved"
        );
        fetched = approvedTemplates.length;

        console.log(
          `[WA_TEMPLATE_SYNC] ${JSON.stringify({
            phase: "fetched",
            provider: resolvedProvider,
            wabaId,
            templateCount: fetched,
          })}`
        );

        for (const t of approvedTemplates) {
          const status = (t.status || "pending").toLowerCase();
          const category = (t.category || "utility").toLowerCase();
          const language = t.language || "en";
          const templateName = String(t.name ?? "(unnamed)");

          let parsed: ReturnType<typeof parseMetaGraphTemplateForLibrary>;
          try {
            parsed = parseMetaGraphTemplateForLibrary({
              name: t.name,
              components: (Array.isArray(t.components) ? t.components : []) as Record<string, unknown>[],
            });
          } catch (parseErr: unknown) {
            const skipReason =
              parseErr instanceof Error ? parseErr.message : String(parseErr || "parse_failed");
            skipped++;
            logMetaSkip({
              templateName,
              status,
              category,
              language,
              provider: "meta",
              skipReason: `parseMetaGraphTemplateForLibrary: ${skipReason}`,
            });
            continue;
          }

          console.log(
            `[WA_TEMPLATE_SYNC] classified name=${templateName} templateType=${parsed.templateType} components=${parsed.componentTypesUpper.join(",")} carouselCards=${Array.isArray(parsed.carouselCards) ? parsed.carouselCards.length : 0}`
          );

          const hf = (parsed.headerFormat || parsed.headerType || "").toLowerCase();
          const isMediaHeader = ["image", "video", "document"].includes(hf);
          const approvedSampleMediaType = isMediaHeader ? hf : null;
          const mediaRuntimeRequired = isMediaHeader;

          /** Persist Meta parse results + media metadata columns used by `/api/templates` + library send flows. */
          const metaRowPayload = {
            name: t.name,
            language,
            status,
            category,
            templateType: parsed.templateType,
            carouselCards: parsed.carouselCards as any,
            bodyText: parsed.bodyText,
            headerType: parsed.headerType,
            headerFormat: parsed.headerFormat,
            headerContent: parsed.headerContent,
            approvedSampleMediaUrl: parsed.approvedSampleMediaUrl,
            approvedSampleMediaType,
            mediaRuntimeRequired,
            footerText: parsed.footerText,
            buttons: parsed.buttons as any,
            variables: parsed.variables as any,
            lastSyncedAt: new Date(),
          };

          try {
            const metaId = `meta_${t.id || t.name}_${language}`;
            const existing = await storage.getMessageTemplateByTwilioSid(req.user.id, metaId);

            if (existing) {
              await storage.updateMessageTemplate(existing.id, metaRowPayload);
              updated++;
              console.log(`[TemplateSync] Updated: ${templateName} [${status}]`);
            } else {
              await storage.createMessageTemplate({
                userId: req.user.id,
                twilioSid: metaId,
                ...metaRowPayload,
              });
              inserted++;
              console.log(`[WA_TEMPLATE_SYNC] Inserted: ${templateName} [${status}]`);
            }
          } catch (err: unknown) {
            skipped++;
            const skipReason = err instanceof Error ? err.message : String(err || "unknown_db_error");
            logMetaSkip({
              templateName,
              status,
              category,
              language,
              provider: "meta",
              skipReason,
            });
            console.error(`[WA_TEMPLATE_SYNC] DB error for template "${templateName}":`, err);
          }
        }

      // ===== TWILIO SYNC =====
      } else if (resolvedProvider === "twilio") {
        if (!user.twilioConnected || !user.twilioAccountSid || !user.twilioAuthToken) {
          console.warn(
            `[WA_TEMPLATE_SYNC] ${JSON.stringify({
              phase: "error",
              provider: resolvedProvider,
              error: "twilio_not_connected",
            })}`
          );
          return res.status(400).json({
            error: "Twilio WhatsApp account not connected",
          });
        }

        const client = await getUserTwilioClient(req.user.id);
        if (!client) {
          return res.status(400).json({ error: "Failed to initialize Twilio client." });
        }

        let contents: any[] = [];
        try {
          contents = await (client as any).contentV1.contentAndApprovals.list({ limit: 100 });
        } catch (err: any) {
          console.error(
            `[WA_TEMPLATE_SYNC] ${JSON.stringify({
              phase: "api_error",
              provider: resolvedProvider,
              error: err?.message || "twilio_content_api_error",
            })}`,
            err
          );
          return res.status(500).json({
            error: `Failed to fetch Twilio templates: ${err.message}`,
          });
        }

        fetched = contents.length;
        console.log(
          `[WA_TEMPLATE_SYNC] ${JSON.stringify({
            phase: "fetched",
            provider: resolvedProvider,
            templateCount: fetched,
          })}`
        );

        for (const t of contents) {
          try {
            const approvals = t.approvalRequests || {};
            const whatsapp = approvals.whatsapp || {};
            const status = (whatsapp.status || "pending").toLowerCase();
            const category = (whatsapp.category || "utility").toLowerCase();
            const language = whatsapp.language || "en";
            const name = whatsapp.name || t.friendlyName || t.sid;

            console.log(`[WA_TEMPLATE_SYNC] Twilio template: ${name} sid=${t.sid} status=${status}`);

            // Extract body text from types object
            let bodyText = "";
            const types = t.types || {};
            for (const typeVal of Object.values(types) as any[]) {
              if (typeVal?.body) {
                bodyText = typeVal.body;
                break;
              }
            }

            const variables: string[] = [];
            const vars = bodyText.match(/\{\{\d+\}\}/g) || [];
            vars.forEach((v: string) => {
              if (!variables.includes(v)) variables.push(v);
            });

            const existing = await storage.getMessageTemplateByTwilioSid(req.user.id, t.sid);

            if (existing) {
              await storage.updateMessageTemplate(existing.id, {
                name,
                status,
                category,
                bodyText,
                variables,
                lastSyncedAt: new Date(),
              });
              updated++;
            } else {
              await storage.createMessageTemplate({
                userId: req.user.id,
                twilioSid: t.sid,
                name,
                language,
                category,
                status,
                templateType: "text",
                bodyText,
                headerType: null,
                headerContent: null,
                footerText: null,
                buttons: [],
                carouselCards: [],
                variables,
              });
              inserted++;
            }
          } catch (err) {
            skipped++;
            console.error(`[WA_TEMPLATE_SYNC] Skipped Twilio template ${t.sid}:`, err);
          }
        }
      } else {
        // No provider connected (or unsupported provider saved)
        console.warn(
          `[WA_TEMPLATE_SYNC] ${JSON.stringify({
            phase: "error",
            provider: resolvedProvider,
            wabaId,
            error: "no_provider_connected",
          })}`
        );
        return res.status(400).json({ error: "No WhatsApp provider connected" });
      }

      console.log(
        `[WA_TEMPLATE_SYNC] ${JSON.stringify({
          phase: "done",
          provider: resolvedProvider,
          wabaId,
          templateCount: fetched,
          syncResult: { inserted, updated, skipped },
        })}`
      );

      const postSyncRows = await storage.getMessageTemplates(req.user.id);
      const dbSnapshot = {
        total: postSyncRows.length,
        approvedNormalized: postSyncRows.filter(
          (r) => (r.status || "").toLowerCase().trim() === "approved"
        ).length,
        metaProviderRows: postSyncRows.filter((r) => (r.twilioSid || "").startsWith("meta_")).length,
        approvedMetaRows: postSyncRows.filter(
          (r) =>
            (r.twilioSid || "").startsWith("meta_") &&
            (r.status || "").toLowerCase().trim() === "approved"
        ).length,
      };
      console.log(
        `[TEMPLATE_SYNC_RESULT] ${JSON.stringify({
          userId: req.user.id,
          provider: resolvedProvider,
          wabaId,
          fetchedFromProvider: fetched,
          inserted,
          updated,
          skipped,
          dbSnapshot,
        })}`
      );

      res.json({
        success: true,
        message: `Sync complete: ${inserted + updated} template(s) synced (${inserted} new, ${updated} updated${skipped > 0 ? `, ${skipped} skipped` : ""}).`,
        provider: resolvedProvider,
        templatesFound: fetched,
        inserted,
        updated,
        skipped,
        ...(skipLog.length > 0 ? { skipLog: skipLog.slice(0, 50) } : {}),
      });
    } catch (error: any) {
      console.error(
        `[WA_TEMPLATE_SYNC] ${JSON.stringify({
          phase: "unexpected_error",
          error: error?.message || "unknown",
        })}`,
        error
      );
      res.status(500).json({ error: error.message || "Failed to sync templates" });
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

      const rows = await storage.getRetargetableChats(req.user.id);

      console.log(
        `[RETARGET_ELIGIBILITY] ${JSON.stringify({
          phase: "response_summary",
          userId: req.user.id,
          eligibleConversationCount: rows.length,
        })}`
      );

      const retargetableChats = rows.map((r) => ({
        id: r.conversationId,
        conversationId: r.conversationId,
        contactId: r.contactId,
        name: r.name,
        avatar: r.avatar,
        displayHandle: r.displayHandle,
        whatsappPhone: r.whatsappPhone,
        channel: r.channel,
        windowExpiresAt: r.windowExpiresAt,
        lastMessagePreview: r.lastMessagePreview,
        lastMessageAt: r.lastMessageAt,
        daysSinceLastMessage: r.daysSinceLastMessage,
        reEngagementState: r.reEngagementState,
        lastTemplateSentAt: r.lastTemplateSentAt,
        lastTemplateName: r.lastTemplateName,
        lastTemplateStatus: r.lastTemplateStatus,
        replyWindowReopenedAt: r.replyWindowReopenedAt,
      }));

      res.json(retargetableChats);
    } catch (error) {
      console.error("Error fetching retargetable chats:", error);
      res.status(500).json({ error: "Failed to fetch retargetable chats" });
    }
  });

  /**
   * CRM field suggestions for template variable autofill (library / templates-page send review).
   * Accepts legacy `chatId` or unified CRM `contactId` (e.g. Campaigns / retargeting without a chats row).
   */
  app.get("/api/templates/variable-autofill", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        return res.status(403).json({ error: "Template messaging is a Pro feature" });
      }

      const chatId = typeof req.query.chatId === "string" ? req.query.chatId.trim() : "";
      const contactIdParam =
        typeof req.query.contactId === "string" ? req.query.contactId.trim() : "";

      let contact: Awaited<ReturnType<typeof storage.getContact>> | undefined;

      if (contactIdParam) {
        const c = await storage.getContact(contactIdParam);
        if (!c || c.userId !== req.user.id) {
          return res.status(404).json({ error: "Contact not found" });
        }
        contact = c;
      } else if (chatId) {
        const chat = await storage.getChat(chatId);
        if (!chat || chat.userId !== req.user.id) {
          return res.status(404).json({ error: "Chat not found" });
        }

        const channelKey =
          (chat.whatsappPhone || "").replace(/\D/g, "") || (chat.whatsappPhone || "");
        contact = channelKey
          ? await storage.getContactByChannelId(req.user.id, "whatsapp", channelKey)
          : undefined;
      } else {
        return res.status(400).json({ error: "chatId or contactId is required" });
      }

      if (!contact) {
        return res.json({
          contactId: null,
          suggestions: null,
        });
      }

      const rawTag = (contact.tag || "").trim();
      const tagsList = rawTag.includes(",")
        ? rawTag.split(",").map((t) => t.trim()).filter(Boolean)
        : rawTag
          ? [rawTag]
          : [];

      const customRaw =
        contact.customFields && typeof contact.customFields === "object"
          ? (contact.customFields as Record<string, unknown>)
          : {};
      const customFlat: Record<string, string> = {};
      for (const [k, v] of Object.entries(customRaw)) {
        if (v == null || v === "") continue;
        customFlat[k] = typeof v === "string" ? v : String(v);
      }

      const phoneFallback =
        contact.phone || contact.whatsappId || "";

      res.json({
        contactId: contact.id,
        suggestions: {
          name: contact.name || "",
          phone: phoneFallback,
          email: contact.email || "",
          stage: contact.pipelineStage || "",
          tag: rawTag,
          tags: tagsList,
          customFields: customFlat,
        },
      });
    } catch (error: unknown) {
      console.error("variable-autofill:", error);
      res.status(500).json({ error: "Failed to load contact suggestions" });
    }
  });

  /**
   * Recent outbound/inbound media URLs for a CRM conversation, for picking header assets when sending templates.
   * `chatId` (legacy) or `contactId` (unified CRM, e.g. retargeting).
   */
  app.get("/api/templates/recent-media", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        return res.status(403).json({ error: "Template messaging is a Pro feature" });
      }

      const chatId = typeof req.query.chatId === "string" ? req.query.chatId.trim() : "";
      const contactIdParam =
        typeof req.query.contactId === "string" ? req.query.contactId.trim() : "";
      if (!chatId && !contactIdParam) {
        return res.status(400).json({ error: "chatId or contactId is required" });
      }

      let contact: Awaited<ReturnType<typeof storage.getContact>> | undefined;

      if (contactIdParam) {
        const c = await storage.getContact(contactIdParam);
        if (!c || c.userId !== req.user.id) {
          return res.status(404).json({ error: "Contact not found" });
        }
        contact = c;
      } else {
        const chat = await storage.getChat(chatId);
        if (!chat || chat.userId !== req.user.id) {
          return res.status(404).json({ error: "Chat not found" });
        }

        const channelKey =
          (chat.whatsappPhone || "").replace(/\D/g, "") || (chat.whatsappPhone || "");
        contact = channelKey
          ? await storage.getContactByChannelId(req.user.id, "whatsapp", channelKey)
          : undefined;
      }

      if (!contact) {
        return res.json({ items: [] });
      }

      const wa: Channel = "whatsapp";
      const conv = await storage.getConversationByContactAndChannel(contact.id, wa);
      if (!conv) {
        return res.json({ items: [] });
      }

      const msgs = await storage.getMessages(conv.id, 80);
      const seen = new Set<string>();
      const items: Array<{
        url: string;
        mediaType: string | null;
        contentType: string | null;
        mediaFilename: string | null;
      }> = [];

      for (const m of msgs) {
        const raw = (m.mediaUrl || "").trim();
        if (!raw || !/^https?:\/\//i.test(raw)) continue;
        if (seen.has(raw)) continue;
        seen.add(raw);
        items.push({
          url: raw,
          mediaType: m.mediaType ?? null,
          contentType: m.contentType ?? null,
          mediaFilename: m.mediaFilename ?? null,
        });
        if (items.length >= 16) break;
      }

      res.json({ items });
    } catch (error: unknown) {
      console.error("recent-media:", error);
      res.status(500).json({ error: "Failed to load recent media" });
    }
  });

  /**
   * Last header media URL used when sending a given library template to a contact (prefill send modal).
   * `chatId` (legacy) or `contactId` (unified CRM).
   */
  app.get("/api/templates/template-send-defaults", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        return res.status(403).json({ error: "Template messaging is a Pro feature" });
      }

      const chatId = typeof req.query.chatId === "string" ? req.query.chatId.trim() : "";
      const contactIdParam =
        typeof req.query.contactId === "string" ? req.query.contactId.trim() : "";
      const templateId = typeof req.query.templateId === "string" ? req.query.templateId.trim() : "";
      if (!templateId || (!chatId && !contactIdParam)) {
        return res.status(400).json({ error: "templateId and either chatId or contactId are required" });
      }

      let contact: Awaited<ReturnType<typeof storage.getContact>> | undefined;

      if (contactIdParam) {
        const c = await storage.getContact(contactIdParam);
        if (!c || c.userId !== req.user.id) {
          return res.status(404).json({ error: "Contact not found" });
        }
        contact = c;
      } else {
        const chat = await storage.getChat(chatId);
        if (!chat || chat.userId !== req.user.id) {
          return res.status(404).json({ error: "Chat not found" });
        }

        const channelKey =
          (chat.whatsappPhone || "").replace(/\D/g, "") || (chat.whatsappPhone || "");
        contact = channelKey
          ? await storage.getContactByChannelId(req.user.id, "whatsapp", channelKey)
          : undefined;
      }

      if (!contact) {
        return res.json({ optionalHeaderMediaUrl: null });
      }

      const wa: Channel = "whatsapp";
      const conv = await storage.getConversationByContactAndChannel(contact.id, wa);
      if (!conv) {
        return res.json({ optionalHeaderMediaUrl: null });
      }

      const msgs = await storage.getMessages(conv.id, 150);
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.direction !== "outbound") continue;
        if ((m.contentType || "").toLowerCase() !== "template") continue;
        if (m.templateId !== templateId) continue;
        const tv = m.templateVariables as Record<string, unknown> | null | undefined;
        const fromTv = typeof tv?.headerMediaUrl === "string" ? tv.headerMediaUrl.trim() : "";
        const fromRow = typeof m.mediaUrl === "string" ? m.mediaUrl.trim() : "";
        const url = fromTv || fromRow;
        if (url && /^https?:\/\//i.test(url)) {
          return res.json({ optionalHeaderMediaUrl: url });
        }
      }

      return res.json({ optionalHeaderMediaUrl: null });
    } catch (error: unknown) {
      console.error("template-send-defaults:", error);
      res.status(500).json({ error: "Failed to load template send defaults" });
    }
  });

  // Send a template message via the active WhatsApp provider
  app.post("/api/templates/send", async (req, res) => {
    const sendRouteId = "POST /api/templates/send";
    const sendFinal = {
      routeReached: false,
      /** `true` after all URL preflights succeed or none required; `false` if preflight failed; `null` if not applicable yet. */
      preflightPassed: null as boolean | null,
      /** Meta Graph `POST /{phone-number-id}/messages` was invoked. */
      graphCalled: false,
      /** HTTP 2xx from Graph for the template send. */
      graphSucceeded: false,
      metaCode: null as number | string | null,
      metaMessage: null as string | null,
      fetchFailureKind: null as string | null,
      finalResponseStatus: 500,
      exitPhase: "not_started",
      templateName: null as string | null,
      templateType: null as string | null,
      headerFormat: null as string | null,
      mediaUrlBucket: null as string | null,
      mediaUrlHost: null as string | null,
      mediaUrlExt: null as string | null,
      preflightContentType: null as string | null,
      preflightContentLength: null as number | null,
      externalWamid: null as string | null,
    };
    const logCarouselSendFinalState = () => {
      console.log(`[CAROUSEL_SEND_FINAL_STATE] ${JSON.stringify(sendFinal)}`);
    };
    const logMediaTemplateFinalState = () => {
      console.log(`[MEDIA_TEMPLATE_SEND_FINAL_STATE] ${JSON.stringify(sendFinal)}`);
    };
    const reply = (status: number, body: Record<string, unknown>, exitPhase: string) => {
      sendFinal.finalResponseStatus = status;
      sendFinal.exitPhase = exitPhase;
      const mc = body.metaCode;
      if (typeof mc === "number" || typeof mc === "string") {
        sendFinal.metaCode = mc;
      }
      const ec = body.errorCode;
      if (typeof ec === "string" && sendFinal.metaCode == null) {
        sendFinal.metaCode = ec;
      }
      const err = body.error;
      if (typeof err === "string") {
        sendFinal.metaMessage = err;
      }
      logCarouselSendFinalState();
      logMediaTemplateFinalState();
      return res.status(status).json(body);
    };
    try {
      const rawBody = req.body as Record<string, unknown> | undefined;
      const bodyKeys =
        rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
          ? Object.keys(rawBody)
          : [];
      res.setHeader("X-WhatsApp-Template-Send-Handler", "server/routes/templates.ts");

      console.log(
        `[ROUTE_HIT] ${sendRouteId}`,
        JSON.stringify({
          hasUser: !!req.user,
          userId: req.user?.id ?? null,
          contentType: req.headers["content-type"] ?? null,
          bodyKeys,
          templateId: typeof rawBody?.templateId === "string" ? rawBody.templateId : null,
          sendSource: typeof rawBody?.sendSource === "string" ? rawBody.sendSource : null,
          hasChatId: typeof rawBody?.chatId === "string" && !!String(rawBody.chatId).trim(),
          hasContactId: typeof rawBody?.contactId === "string" && !!String(rawBody.contactId).trim(),
          carouselCardMediaLen: Array.isArray(rawBody?.carouselCardMedia)
            ? rawBody.carouselCardMedia.length
            : null,
        })
      );
      sendFinal.routeReached = true;

      if (!req.user) {
        console.warn(`[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=401 reason=unauthorized`);
        return reply(401, { error: "Unauthorized" }, "unauthorized");
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        console.warn(
          `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=403 reason=templates_disabled userId=${req.user.id}`
        );
        return reply(403, { error: "Template messaging is a Pro feature" }, "templates_pro_required");
      }

      const {
        templateId,
        chatId,
        contactId,
        variables,
        sendSource,
        optionalHeaderMediaUrl: optionalHeaderMediaBody,
        optionalHeaderMediaFilename: optionalHeaderMediaFilenameBody,
        optionalHeaderMediaMimeType: optionalHeaderMediaMimeTypeBody,
        optionalHeaderMediaSizeBytes: optionalHeaderMediaSizeBytesBody,
        carouselCardMedia: carouselCardMediaBody,
      } = req.body as {
        templateId?: string;
        chatId?: string;
        contactId?: string;
        variables?: Record<string, string>;
        sendSource?: string;
        /** Direct https URL when synced header media is empty (upload / library pick). */
        optionalHeaderMediaUrl?: string;
        /** Original filename for document-header sends (Meta `document.filename`). */
        optionalHeaderMediaFilename?: string;
        optionalHeaderMediaMimeType?: string;
        optionalHeaderMediaSizeBytes?: number;
        carouselCardMedia?: unknown;
      };

      let carouselCardMediaNormalized: CarouselCardRuntimeMedia[] = [];
      if (Array.isArray(carouselCardMediaBody)) {
        for (const row of carouselCardMediaBody) {
          if (!row || typeof row !== "object") continue;
          const r = row as Record<string, unknown>;
          const cardIndex = Number(r.cardIndex);
          const mediaUrl = typeof r.mediaUrl === "string" ? r.mediaUrl.trim() : "";
          if (!Number.isInteger(cardIndex) || cardIndex < 0) continue;
          if (!/^https?:\/\//i.test(mediaUrl)) continue;
          const originalFilename =
            typeof r.originalFilename === "string" && r.originalFilename.trim()
              ? r.originalFilename.trim().slice(0, 240)
              : null;
          carouselCardMediaNormalized.push({ cardIndex, mediaUrl, originalFilename });
        }
      }
      const sendSourceTag =
        typeof sendSource === "string" && sendSource.trim()
          ? sendSource.trim()
          : "unknown";

      /** Inbox + Campaign: quick-send only. Library flows: full Meta template shapes. */
      let metaSendPath: "library_full" | "quick_send" =
        sendSourceTag === "templates_library" || sendSourceTag === "templates_page"
          ? "library_full"
          : sendSourceTag === "inbox_picker" || sendSourceTag === "templates_campaign"
            ? "quick_send"
            : "quick_send";
      if (!templateId || (!chatId && !contactId)) {
        console.warn(
          `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=400 reason=missing_template_or_recipient userId=${req.user.id} templateId=${templateId ?? "null"}`
        );
        return reply(
          400,
          { error: "Template ID and either Chat ID or Contact ID are required" },
          "missing_template_or_recipient"
        );
      }

      const template = await storage.getMessageTemplate(templateId);
      if (!template || template.userId !== req.user.id) {
        console.warn(
          `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=404 reason=template_not_found userId=${req.user.id} templateId=${templateId}`
        );
        return reply(404, { error: "Template not found" }, "template_not_found");
      }
      sendFinal.templateName = template.name;
      sendFinal.templateType = (template.templateType || null) as any;
      sendFinal.headerFormat =
        (template.headerFormat || template.headerType || null) != null
          ? String(template.headerFormat || template.headerType || "").toLowerCase() || null
          : null;

      // Resolve recipient — either from legacy chats table or new contacts table
      let recipientPhone: string;
      let recipientName: string;
      let legacyChatId: string | null = chatId || null;
      /** Unified inbox / CRM contact for persisting into `messages` + `conversations` */
      let crmContactId: string | null = null;

      if (contactId) {
        const contact = await storage.getContact(contactId);
        if (!contact || contact.userId !== req.user.id) {
          console.warn(
            `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=404 reason=contact_not_found userId=${req.user.id} contactId=${contactId}`
          );
          return reply(404, { error: "Contact not found" }, "contact_not_found");
        }
        const phone = contact.whatsappId || contact.phone;
        if (!phone) {
          console.warn(
            `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=400 reason=contact_no_whatsapp userId=${req.user.id} contactId=${contactId}`
          );
          return reply(
            400,
            { error: "Contact does not have a WhatsApp number" },
            "contact_no_whatsapp"
          );
        }
        recipientPhone = phone;
        recipientName = contact.name;
        crmContactId = contact.id;
      } else {
        const chat = await storage.getChat(chatId);
        if (!chat || chat.userId !== req.user.id) {
          console.warn(
            `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=404 reason=chat_not_found userId=${req.user.id} chatId=${chatId}`
          );
          return reply(404, { error: "Chat not found" }, "chat_not_found");
        }
        if (!chat.whatsappPhone) {
          console.warn(
            `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=400 reason=chat_no_whatsapp userId=${req.user.id} chatId=${chatId}`
          );
          return reply(400, { error: "Chat does not have a WhatsApp number" }, "chat_no_whatsapp");
        }
        recipientPhone = chat.whatsappPhone;
        recipientName = chat.name;
        const channelKey =
          chat.whatsappPhone.replace(/\D/g, "") || chat.whatsappPhone || "";
        const matched = channelKey
          ? await storage.getContactByChannelId(req.user.id, "whatsapp", channelKey)
          : undefined;
        crmContactId = matched?.id ?? null;
      }

      let waConversationIdForReEngagement: string | null = null;
      if (crmContactId) {
        const ensured = await ensureWhatsAppConversationForContact(req.user.id, crmContactId);
        waConversationIdForReEngagement = ensured.conversationId;
      }

      const persistReEngagementSuccess = async () => {
        if (!waConversationIdForReEngagement) return;
        const conv = await storage.getConversation(waConversationIdForReEngagement);
        const prev = parseConversationReEngagement(conv?.reEngagement);
        await storage.updateConversation(waConversationIdForReEngagement, {
          reEngagement: buildReEngagementAfterSuccessfulSend(template.name, prev) as Record<string, unknown>,
        });
      };

      const persistReEngagementFailure = async () => {
        if (!waConversationIdForReEngagement) return;
        const conv = await storage.getConversation(waConversationIdForReEngagement);
        const prev = parseConversationReEngagement(conv?.reEngagement);
        await storage.updateConversation(waConversationIdForReEngagement, {
          reEngagement: buildReEngagementAfterFailedSend(template.name, prev) as Record<string, unknown>,
        });
      };

      // Full session row — auth-core `getUser` omits whatsappProvider / Meta fields (defaults wrongly to Twilio).
      const user = await storage.getUserForSession(req.user.id);
      if (!user) {
        console.warn(
          `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=404 reason=user_session_not_found userId=${req.user.id}`
        );
        return reply(404, { error: "User not found" }, "user_session_not_found");
      }

      const providerPref = (user.whatsappProvider || "").toString().trim().toLowerCase();
      const isMetaConnected = !!user.metaConnected;
      const isTwilioConnected = !!user.twilioConnected;
      const resolvedProvider =
        providerPref === "meta" || providerPref === "twilio"
          ? providerPref
          : isMetaConnected
            ? "meta"
            : isTwilioConnected
              ? "twilio"
              : "none";

      const phoneNumberId = user.metaPhoneNumberId ? String(user.metaPhoneNumberId) : null;
      const wabaId = user.metaBusinessAccountId ? String(user.metaBusinessAccountId) : null;
      const templateLang = (template.language && String(template.language).trim()) || "en";
      const recipientDigits = recipientPhone.replace(/[^\d]/g, "");
      const recipientLog =
        recipientDigits.length > 4
          ? `***${recipientDigits.slice(-4)}`
          : recipientDigits
            ? "(short)"
            : "(none)";

      const variableValues = normalizeTemplateVariableMap(variables || {});
      let optionalHeaderMediaUrl =
        typeof optionalHeaderMediaBody === "string" ? optionalHeaderMediaBody.trim() : undefined;
      const optionalHeaderMediaFilename =
        typeof optionalHeaderMediaFilenameBody === "string"
          ? optionalHeaderMediaFilenameBody.trim()
          : undefined;
      const optionalHeaderMediaMimeType =
        typeof optionalHeaderMediaMimeTypeBody === "string"
          ? optionalHeaderMediaMimeTypeBody.trim().slice(0, 120)
          : undefined;
      const optionalHeaderMediaSizeBytes =
        typeof optionalHeaderMediaSizeBytesBody === "number" &&
        Number.isFinite(optionalHeaderMediaSizeBytesBody)
          ? Math.max(0, Math.floor(optionalHeaderMediaSizeBytesBody))
          : undefined;

      let persistedHeaderDefaultMediaUrl: string | null = null;
      let persistedHeaderDefaultOriginalFilename: string | null = null;
      if (metaSendPath === "library_full") {
        try {
          const defRow = await storage.getTemplateCarouselMediaDefaults(req.user.id, template.id);
          const cm = defRow?.cardMedia as Record<string, unknown> | undefined;
          const hdr = cm?.header;
          if (hdr && typeof hdr === "object") {
            const h = hdr as Record<string, unknown>;
            const u = typeof h.mediaUrl === "string" ? h.mediaUrl.trim() : "";
            if (u && /^https?:\/\//i.test(u)) persistedHeaderDefaultMediaUrl = u;
            const of = typeof h.originalFilename === "string" ? h.originalFilename.trim() : "";
            if (of) persistedHeaderDefaultOriginalFilename = of.slice(0, 240);
          }
        } catch {
          /* non-fatal */
        }
      }

      let libraryEffectiveTemplate =
        metaSendPath === "library_full"
          ? effectiveTemplateRowForLibrarySend(
              template,
              optionalHeaderMediaUrl ?? null,
              persistedHeaderDefaultMediaUrl
            )
          : template;

      console.log(
        `[TEMPLATE_SEND_REQUEST] ${JSON.stringify({
          templateId: template.id,
          templateName: template.name,
          language: templateLang,
          contactId: crmContactId,
          channel: "whatsapp" as const,
          sendSource: sendSourceTag,
          metaSendPath,
          inboxQuickSendGuardSkipped: metaSendPath === "library_full",
          carouselCardCount: carouselCardMediaNormalized.length,
          carouselCardMediaUrls: carouselCardMediaNormalized.map((c) => ({
            cardIndex: c.cardIndex,
            urlBucket: classifyTemplateMediaUrlForLog(c.mediaUrl),
            urlHost: (() => {
              try {
                return new URL(c.mediaUrl).hostname;
              } catch {
                return "invalid";
              }
            })(),
          })),
          optionalHeaderMediaBucket: optionalHeaderMediaUrl
            ? classifyTemplateMediaUrlForLog(optionalHeaderMediaUrl)
            : null,
        })}`
      );

      let messageId = "";
      let sendStatus = "sent";

      if (resolvedProvider === "none") {
        console.warn(
          `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=400 reason=no_whatsapp_provider userId=${req.user.id}`
        );
        console.warn(
          `[WA_TEMPLATE_SEND] ${JSON.stringify({
            phase: "error",
            provider: resolvedProvider,
            templateName: template.name,
            language: templateLang,
            phoneNumberId,
            recipient: recipientLog,
            responseStatus: 400,
            metaError: "no_provider_connected",
          })}`
        );
        return reply(400, { error: "No WhatsApp provider connected" }, "no_whatsapp_provider");
      }

      if (resolvedProvider === "meta") {
        if (!user.metaConnected || !phoneNumberId) {
          console.warn(
            `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=400 reason=meta_not_connected userId=${req.user.id} metaConnected=${!!user.metaConnected} hasPhoneNumberId=${!!phoneNumberId}`
          );
          console.warn(
            `[WA_TEMPLATE_SEND] ${JSON.stringify({
              phase: "error",
              provider: resolvedProvider,
              templateName: template.name,
              language: templateLang,
              phoneNumberId,
              recipient: recipientLog,
              responseStatus: 400,
              metaError: "meta_not_connected",
            })}`
          );
          return reply(
            400,
            { error: "Meta WhatsApp account not connected" },
            "meta_not_connected"
          );
        }

        const templateShape = inferMetaTemplateShape({
          name: template.name,
          bodyText: template.bodyText,
          headerType: template.headerType,
          headerContent: template.headerContent,
          buttons: template.buttons,
          templateType: template.templateType,
          carouselCards: template.carouselCards,
          category: template.category,
        });

        let components: any[] | undefined;

        if (metaSendPath === "quick_send") {
          const inboxBlock = getInboxTemplateSendBlockReason(
            {
              name: template.name,
              bodyText: template.bodyText,
              headerType: template.headerType,
              headerContent: template.headerContent,
              buttons: template.buttons,
              templateType: template.templateType,
              carouselCards: template.carouselCards,
              category: template.category,
            },
            { logWhenBlocked: true, guardLogContext: "server_quick_send" }
          );
          if (inboxBlock.blocked) {
            console.warn(
              `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=400 reason=inbox_quick_send_guard metaSendPath=quick_send`
            );
            console.warn(
              `[WA_TEMPLATE_SEND] ${JSON.stringify({
                phase: "blocked_quick_send",
                sendSource: sendSourceTag,
                templateName: template.name,
                language: templateLang,
                shape: templateShape,
                provider: resolvedProvider,
                metaError: inboxBlock.reason,
              })}`
            );
            return reply(
              400,
              {
                error: inboxBlock.reason || "This template can't be sent from this shortcut.",
              },
              "inbox_quick_send_guard"
            );
          }
        }

        const built =
          metaSendPath === "quick_send"
            ? buildMetaCloudTemplateSendComponents(template, variableValues)
            : buildMetaLibraryTemplateSendComponents(libraryEffectiveTemplate, variableValues, {
                headerDocumentFilename:
                  (optionalHeaderMediaFilename && optionalHeaderMediaFilename.trim()) ||
                  persistedHeaderDefaultOriginalFilename ||
                  null,
                ...(carouselCardMediaNormalized.length > 0
                  ? { carouselCardMedia: carouselCardMediaNormalized }
                  : {}),
              });

        const resolvedShape =
          "shape" in built && built.shape ? built.shape : templateShape;

        if (built.error) {
          console.warn(
            `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=400 reason=meta_components_build_error metaSendPath=${metaSendPath}`
          );
          console.warn(
            `[WA_TEMPLATE_SEND] ${JSON.stringify({
              phase: "build_error",
              sendSource: sendSourceTag,
              metaSendPath,
              templateName: template.name,
              language: templateLang,
              shape: resolvedShape,
              provider: resolvedProvider,
              metaError: built.error,
            })}`
          );
          return reply(400, { error: built.error }, "meta_components_build_error");
        }

        components = built.components as any[] | undefined;

        const norm = await normalizeTemplatePayloadMediaUrls({
          userId: req.user.id,
          components: components as Record<string, unknown>[] | undefined,
          carouselMode: resolvedShape === "carousel",
          templateName: template.name,
        });
        if (!norm.ok) {
          console.warn(`[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=400 reason=media_normalize_failed`);
          return reply(
            400,
            {
              error: WA_TEMPLATE_MEDIA_NEEDS_CONVERSION_MESSAGE,
              errorCode: norm.errorCode,
              detail: norm.errorMessage,
            },
            "media_normalize_failed"
          );
        }

        const urlRemapMeta = norm.urlMap;
        if (Object.keys(urlRemapMeta).length > 0) {
          if (optionalHeaderMediaUrl) {
            const next = optionalHeaderMediaUrl.trim();
            const repl = urlRemapMeta[next] ?? urlRemapMeta[next.trim()];
            if (repl) {
              optionalHeaderMediaUrl = repl;
              if (metaSendPath === "library_full") {
                libraryEffectiveTemplate = effectiveTemplateRowForLibrarySend(
                  template,
                  optionalHeaderMediaUrl ?? null,
                  persistedHeaderDefaultMediaUrl
                );
              }
            }
          }
          for (let i = 0; i < carouselCardMediaNormalized.length; i++) {
            const row = carouselCardMediaNormalized[i];
            const prev = row.mediaUrl.trim();
            const repl = urlRemapMeta[prev];
            if (repl) carouselCardMediaNormalized[i] = { ...row, mediaUrl: repl };
          }
        }

        const componentSummary = Array.isArray(components)
          ? components.map((c: any) => ({
              type: c?.type,
              carouselCards:
                c?.type === "carousel" && Array.isArray(c?.cards) ? c.cards.length : undefined,
            }))
          : [];

        const mediaLinksForValidate = enumerateTemplateHttpsMediaLinks(
          components as Record<string, unknown>[] | undefined
        );
        if (mediaLinksForValidate.length > 0) {
          sendFinal.preflightPassed = false;
          console.log(
            `[WA_TEMPLATE_CAROUSEL_MEDIA_MODE] ${JSON.stringify({
              mode: "public_https_links_in_template_components",
              note: "Meta fetches each URL server-side. This path does not use WhatsApp media upload IDs in the payload.",
              distinctUrlCount: mediaLinksForValidate.length,
            })}`
          );
          for (let i = 0; i < mediaLinksForValidate.length; i++) {
            const ctx = mediaLinksForValidate[i];
            const url = ctx.url;
            const bucket = classifyTemplateMediaUrlForLog(url);
            sendFinal.mediaUrlBucket = bucket;
            sendFinal.mediaUrlHost = (() => {
              try {
                return new URL(url).hostname;
              } catch {
                return null;
              }
            })();
            sendFinal.mediaUrlExt = (() => {
              try {
                const p = new URL(url).pathname;
                const last = p.split("/").pop() || "";
                const dot = last.lastIndexOf(".");
                if (dot <= 0) return null;
                return last.slice(dot + 1).toLowerCase().slice(0, 16) || null;
              } catch {
                return null;
              }
            })();
            const matchCarousel = carouselCardMediaNormalized.find((c) => c.mediaUrl.trim() === url);
            const label = matchCarousel
              ? `carousel_card_${matchCarousel.cardIndex}_${ctx.paramType}`
              : `template_payload_media_${i}_${ctx.paramType}`;
            console.log(
              `[WA_MEDIA_UPLOAD_START] ${JSON.stringify({
                operation: "production_validate_public_url_before_meta_fetch",
                label,
                bucket,
                urlHost: (() => {
                  try {
                    return new URL(url).hostname;
                  } catch {
                    return "invalid";
                  }
                })(),
                paramType: ctx.paramType,
                inCarousel: ctx.inCarousel,
              })}`
            );
            const v = await validateProductionTemplateMediaUrl(ctx);
            if (!v.ok) {
              console.error(
                `[WA_MEDIA_UPLOAD_FAILED] ${JSON.stringify({
                  operation: "production_validate_public_url_before_meta_fetch",
                  label,
                  bucket,
                  errorCode: v.code,
                  detail: v.detail,
                })}`
              );
              await persistReEngagementFailure();
              if (crmContactId) {
                try {
                  await persistFailedOutboundTemplateMessage({
                    userId: req.user.id,
                    contactId: crmContactId,
                    template,
                    templateLang,
                    metaSendPath,
                    libraryEffectiveTemplate: libraryEffectiveTemplate as MessageTemplate,
                    variableValues,
                    optionalHeaderMediaUrl,
                    optionalHeaderMediaFilename,
                    optionalHeaderMediaMimeType,
                    optionalHeaderMediaSizeBytes,
                    carouselCardMediaNormalized,
                    errorMessage: WA_TEMPLATE_MEDIA_NEEDS_CONVERSION_MESSAGE,
                    errorCode: v.code,
                    persistedHeaderDefaultMediaUrl,
                    persistedHeaderDefaultOriginalFilename,
                  });
                } catch (persistFail: unknown) {
                  console.error(
                    `[WA_TEMPLATE_SEND_FAILED_PERSIST] ${JSON.stringify({
                      contactId: crmContactId,
                      templateName: template.name,
                      error: persistFail instanceof Error ? persistFail.message : String(persistFail),
                    })}`,
                    persistFail
                  );
                }
              }
              console.warn(
                `[SEND_ROUTE_EARLY_EXIT] ${sendRouteId} status=400 reason=media_url_production_validate_failed errorCode=${v.code}`
              );
              sendFinal.preflightPassed = false;
              sendFinal.metaMessage = WA_TEMPLATE_MEDIA_NEEDS_CONVERSION_MESSAGE;
              sendFinal.metaCode = v.code;
              return reply(
                400,
                {
                  error: WA_TEMPLATE_MEDIA_NEEDS_CONVERSION_MESSAGE,
                  errorCode: v.code,
                  detail: v.detail,
                  metaCode: null,
                },
                "media_url_production_validate_failed"
              );
            }
            sendFinal.preflightContentType = v.contentType;
            sendFinal.preflightContentLength = v.contentLength;
            console.log(
              `[WA_MEDIA_UPLOAD_SUCCESS] ${JSON.stringify({
                operation: "production_validate_public_url_before_meta_fetch",
                label,
                bucket,
                httpStatus: v.httpStatus,
                contentType: v.contentType,
                contentLength: v.contentLength,
              })}`
            );
          }
          sendFinal.preflightPassed = true;
        } else {
          sendFinal.preflightPassed = true;
        }

        console.log(
          `[WA_TEMPLATE_SEND] ${JSON.stringify({
            phase: "request",
            sendSource: sendSourceTag,
            metaSendPath,
            provider: resolvedProvider,
            templateName: template.name,
            language: templateLang,
            shape: resolvedShape,
            phoneNumberId,
            wabaId,
            contactId: crmContactId,
            recipient: recipientLog,
            carouselCardCount: carouselCardMediaNormalized.length,
            carouselCardMediaUrls: carouselCardMediaNormalized.map((c) => c.mediaUrl),
            componentSummary,
          })}`
        );

        try {
          sendFinal.graphCalled = true;
          const result = await sendMetaWhatsAppTemplate(
            req.user.id,
            recipientPhone,
            template.name,
            templateLang,
            components && components.length > 0 ? components : undefined
          );
          messageId = result.messageId;
          sendStatus = result.status;
          sendFinal.graphSucceeded = true;
          sendFinal.externalWamid = messageId || null;
          console.log(
            `[WA_TEMPLATE_SEND] ${JSON.stringify({
              phase: "success",
              sendSource: sendSourceTag,
              metaSendPath,
              provider: resolvedProvider,
              templateName: template.name,
              language: templateLang,
              shape: resolvedShape,
              phoneNumberId,
              contactId: crmContactId,
              recipient: recipientLog,
              carouselCardCount: carouselCardMediaNormalized.length,
              carouselCardMediaUrls: carouselCardMediaNormalized.map((c) => c.mediaUrl),
              responseStatus: result.httpStatus,
              messageId,
              componentSummary,
            })}`
          );
          await persistReEngagementSuccess();
        } catch (metaErr: any) {
          await persistReEngagementFailure();
          const rawHttp = typeof metaErr?.httpStatus === "number" ? metaErr.httpStatus : 0;
          const responseStatus =
            rawHttp >= 400 && rawHttp < 600
              ? rawHttp
              : rawHttp === 0
                ? 503
                : 500;
          const metaErrorRaw =
            metaErr?.message || "Failed to send template via Meta WhatsApp API";
          const metaErrorOut = formatFriendlyMetaTemplateUserMessage(metaErr);
          console.error(
            `[WA_TEMPLATE_SEND_FAILED] ${JSON.stringify({
              phase: "meta_send_catch",
              sendSource: sendSourceTag,
              metaSendPath,
              provider: resolvedProvider,
              templateName: template.name,
              language: templateLang,
              shape: resolvedShape,
              phoneNumberId,
              contactId: crmContactId,
              recipient: recipientLog,
              carouselCardCount: carouselCardMediaNormalized.length,
              carouselCardMediaUrls: carouselCardMediaNormalized.map((c) => c.mediaUrl),
              responseStatus,
              metaErrorRaw,
              metaErrorFriendly: metaErrorOut,
              metaErrorCode: metaErr?.metaErrorCode,
              metaErrorType: metaErr?.metaErrorType,
              fetchFailureKind: metaErr?.fetchFailureKind,
              componentSummary,
            })}`,
            metaErr
          );

          if (crmContactId) {
            try {
              await persistFailedOutboundTemplateMessage({
                userId: req.user.id,
                contactId: crmContactId,
                template,
                templateLang,
                metaSendPath,
                libraryEffectiveTemplate: libraryEffectiveTemplate as MessageTemplate,
                variableValues,
                optionalHeaderMediaUrl,
                optionalHeaderMediaFilename,
                optionalHeaderMediaMimeType,
                optionalHeaderMediaSizeBytes,
                carouselCardMediaNormalized,
                errorMessage: metaErrorOut,
                errorCode:
                  metaErr?.metaErrorCode != null
                    ? String(metaErr.metaErrorCode)
                    : metaErr?.fetchFailureKind
                      ? String(metaErr.fetchFailureKind)
                      : undefined,
                persistedHeaderDefaultMediaUrl,
                persistedHeaderDefaultOriginalFilename,
              });
            } catch (persistFail: unknown) {
              console.error(
                `[WA_TEMPLATE_SEND_FAILED_PERSIST] ${JSON.stringify({
                  contactId: crmContactId,
                  templateName: template.name,
                  error: persistFail instanceof Error ? persistFail.message : String(persistFail),
                })}`,
                persistFail
              );
            }
          }

          sendFinal.graphSucceeded = false;
          sendFinal.metaCode =
            metaErr?.metaErrorCode != null ? metaErr.metaErrorCode : metaErr?.fetchFailureKind ?? null;
          sendFinal.metaMessage = metaErrorRaw;
          sendFinal.fetchFailureKind =
            typeof metaErr?.fetchFailureKind === "string" ? metaErr.fetchFailureKind : null;
          return reply(
            responseStatus,
            {
              error: metaErrorOut,
              metaCode: metaErr?.metaErrorCode,
              errorCode:
                metaErr?.metaErrorCode != null
                  ? String(metaErr.metaErrorCode)
                  : metaErr?.fetchFailureKind ?? undefined,
            },
            "meta_graph_http_or_network_error"
          );
        }
      } else if (resolvedProvider === "twilio") {
        const twilioClient = await getUserTwilioClient(req.user.id);
        if (!twilioClient) {
          console.warn(
            `[WA_TEMPLATE_SEND] ${JSON.stringify({
              phase: "error",
              provider: resolvedProvider,
              templateName: template.name,
              language: templateLang,
              phoneNumberId: null,
              recipient: recipientLog,
              responseStatus: 400,
              metaError: "twilio_not_connected",
            })}`
          );
          return reply(400, { error: "Twilio is not connected" }, "twilio_not_connected");
        }

        console.log(
          `[WA_TEMPLATE_SEND] ${JSON.stringify({
            phase: "request",
            provider: resolvedProvider,
            templateName: template.name,
            language: templateLang,
            recipient: recipientLog,
          })}`
        );

        const toNumber = recipientPhone.startsWith("whatsapp:")
          ? recipientPhone
          : `whatsapp:${recipientPhone}`;
        const fromNumber = user.twilioWhatsappNumber?.startsWith("whatsapp:")
          ? user.twilioWhatsappNumber
          : `whatsapp:${user.twilioWhatsappNumber}`;

        const msgOptions: any = {
          from: fromNumber,
          to: toNumber,
          contentSid: template.twilioSid,
        };
        if (Object.keys(variableValues).length > 0) {
          msgOptions.contentVariables = JSON.stringify(variableValues);
        }

        try {
          const msg = await (twilioClient as any).messages.create(msgOptions);
          messageId = msg.sid;
          sendStatus = msg.status;
          console.log(
            `[WA_TEMPLATE_SEND] ${JSON.stringify({
              phase: "success",
              provider: resolvedProvider,
              templateName: template.name,
              language: templateLang,
              recipient: recipientLog,
              responseStatus: 200,
              messageId,
            })}`
          );
          const st = (sendStatus || "").toLowerCase();
          if (st === "failed" || st === "undelivered" || st === "canceled") {
            await persistReEngagementFailure();
          } else {
            await persistReEngagementSuccess();
          }
        } catch (twilioErr: any) {
          await persistReEngagementFailure();
          console.error(
            `[WA_TEMPLATE_SEND] ${JSON.stringify({
              phase: "error",
              provider: resolvedProvider,
              templateName: template.name,
              language: templateLang,
              recipient: recipientLog,
              responseStatus: twilioErr?.status || 500,
              metaError: twilioErr?.message || "twilio_send_failed",
            })}`,
            twilioErr
          );
          sendFinal.metaMessage = twilioErr?.message || "Failed to send template via Twilio";
          return reply(
            500,
            {
              error: twilioErr?.message || "Failed to send template via Twilio",
            },
            "twilio_send_failed"
          );
        }
      }

      let persistedMessageId: string | undefined;
      let persistedConversationId: string | undefined;

      if (crmContactId) {
        try {
          const { conversationId } = await ensureWhatsAppConversationForContact(
            req.user.id,
            crmContactId
          );
          persistedConversationId = conversationId;

          const displaySource =
            metaSendPath === "library_full" ? libraryEffectiveTemplate : template;
          const resolvedHeaderMediaUrl = resolveLibraryHeaderMediaDisplayUrl(
            displaySource,
            variableValues,
            optionalHeaderMediaUrl ?? null,
            persistedHeaderDefaultMediaUrl
          );
          const displayContent = buildOutboundTemplateDisplayContent(
            {
              name: displaySource.name,
              bodyText: displaySource.bodyText,
              headerType: displaySource.headerType,
              headerContent: displaySource.headerContent,
            },
            variableValues
          );
          const preview = displayContent.substring(0, 100);

          const headerTypeLower = (displaySource.headerType || "").toLowerCase();
          const docFilenameForBubble =
            (optionalHeaderMediaFilename && optionalHeaderMediaFilename.trim()) ||
            persistedHeaderDefaultOriginalFilename ||
            null;
          const headerMedia =
            resolvedHeaderMediaUrl && ["image", "video", "document"].includes(headerTypeLower)
              ? {
                  url: resolvedHeaderMediaUrl,
                  type: headerTypeLower,
                  originalFilename:
                    headerTypeLower === "document" ? docFilenameForBubble : null,
                  mimeType: optionalHeaderMediaMimeType ?? null,
                  sizeBytes:
                    optionalHeaderMediaSizeBytes !== undefined ? optionalHeaderMediaSizeBytes : null,
                }
              : null;

          const ttCarousel =
            (template.templateType || "").toLowerCase() === "carousel" ||
            (Array.isArray(template.carouselCards) && (template.carouselCards as unknown[]).length > 0);
          let carouselCardsDisplay: ReturnType<typeof buildCarouselCrmDisplayCardsForPersist> | undefined;
          if (ttCarousel && Array.isArray(template.carouselCards)) {
            carouselCardsDisplay = buildCarouselCrmDisplayCardsForPersist({
              carouselCards: template.carouselCards as unknown[],
              variableValues,
              carouselCardMedia:
                carouselCardMediaNormalized.length > 0 ? carouselCardMediaNormalized : undefined,
            });
          }

          const templateVariablesPayload = {
            ...normalizeTemplateVariableMap(variableValues),
            templateLanguage: templateLang,
            templateName: template.name,
            channel: "whatsapp",
            provider: resolvedProvider === "meta" ? "meta" : resolvedProvider,
            headerType: displaySource.headerType ?? null,
            headerMediaUrl: resolvedHeaderMediaUrl,
            ...(headerMedia ? { headerMedia } : {}),
            ...(docFilenameForBubble &&
            (displaySource.headerType || "").toLowerCase() === "document"
              ? { headerDocumentFilename: docFilenameForBubble }
              : {}),
            ...(carouselCardsDisplay && carouselCardsDisplay.length > 0
              ? { templateType: "carousel", carouselCardsDisplay }
              : {}),
          };

          const normalizedStatus = (sendStatus || "").toLowerCase();
          const outboundMsgStatus =
            normalizedStatus === "failed" || normalizedStatus === "undelivered"
              ? "failed"
              : normalizedStatus === "queued" ||
                  normalizedStatus === "accepted" ||
                  normalizedStatus === "scheduled"
                ? "pending"
                : "sent";

          const mediaMeta =
            resolvedHeaderMediaUrl && headerTypeToMessageMediaType(displaySource.headerType);

          const persisted = await storage.createMessage({
            conversationId,
            contactId: crmContactId,
            userId: req.user.id,
            direction: "outbound",
            content: displayContent,
            contentType: "template",
            templateId: template.id,
            templateVariables: templateVariablesPayload as any,
            ...(resolvedHeaderMediaUrl
              ? {
                  mediaUrl: resolvedHeaderMediaUrl,
                  ...(mediaMeta ? { mediaType: mediaMeta } : {}),
                }
              : {}),
            status: outboundMsgStatus,
            externalMessageId: messageId || null,
            sentAt: new Date(),
          });
          persistedMessageId = persisted.id;

          await storage.updateConversation(conversationId, {
            lastMessageAt: new Date(),
            lastMessagePreview: preview,
            lastMessageDirection: "outbound",
          });

          console.log(
            `[WA_TEMPLATE_SEND_PERSIST] ${JSON.stringify({
              conversationId,
              contactId: crmContactId,
              templateName: template.name,
              providerMessageId: messageId || null,
              persistedMessageId: persisted.id,
            })}`
          );

          if (carouselCardMediaNormalized.length > 0) {
            try {
              await storage.upsertTemplateCarouselMediaDefaults(
                req.user.id,
                template.id,
                runtimeCarouselRowsToDefaultMediaMap(carouselCardMediaNormalized) as unknown as Record<
                  string,
                  unknown
                >
              );
            } catch (carouselDefErr: unknown) {
              console.warn(
                `[WA_TEMPLATE_SEND_CAROUSEL_DEFAULTS] ${JSON.stringify({
                  phase: "error",
                  templateId: template.id,
                  error: carouselDefErr instanceof Error ? carouselDefErr.message : String(carouselDefErr),
                })}`
              );
            }
          }

          // Persist header media defaults for single media templates (image/video/document) using the same defaults table.
          // Stored under key `"header"` in `template_carousel_media_defaults.card_media` (no schema change).
          const htLower = (displaySource.headerType || "").toLowerCase();
          const headerHostTransient = (() => {
            if (!resolvedHeaderMediaUrl) return false;
            try {
              return hostLooksLikeTransientMetaCdn(new URL(resolvedHeaderMediaUrl).hostname);
            } catch {
              return false;
            }
          })();
          if (headerHostTransient) {
            console.warn(
              `[WA_TEMPLATE_SEND_HEADER_DEFAULTS] ${JSON.stringify({
                phase: "skipped_transient_cdn",
                templateId: template.id,
                hint: "never_persist_whatsapp_cdn_template_media",
              })}`
            );
          }
          if (
            resolvedHeaderMediaUrl &&
            ["image", "video", "document"].includes(htLower) &&
            !headerHostTransient
          ) {
            try {
              const existing = await storage.getTemplateCarouselMediaDefaults(req.user.id, template.id);
              const prev =
                existing && existing.cardMedia && typeof existing.cardMedia === "object"
                  ? (existing.cardMedia as Record<string, unknown>)
                  : {};
              const merged = {
                ...prev,
                header: {
                  mediaUrl: resolvedHeaderMediaUrl,
                  originalFilename:
                    htLower === "document" ? optionalHeaderMediaFilename ?? null : null,
                  headerFormat: htLower,
                },
              };
              await storage.upsertTemplateCarouselMediaDefaults(req.user.id, template.id, merged);
            } catch (headerDefErr: unknown) {
              console.warn(
                `[WA_TEMPLATE_SEND_HEADER_DEFAULTS] ${JSON.stringify({
                  phase: "error",
                  templateId: template.id,
                  headerType: htLower,
                  error: headerDefErr instanceof Error ? headerDefErr.message : String(headerDefErr),
                })}`
              );
            }
          }
        } catch (persistErr: any) {
          console.error(
            `[WA_TEMPLATE_SEND_PERSIST] ${JSON.stringify({
              phase: "error",
              contactId: crmContactId,
              templateName: template.name,
              error: persistErr?.message || "persist_failed",
            })}`,
            persistErr
          );
        }
      } else {
        console.warn(
          `[WA_TEMPLATE_SEND_PERSIST] ${JSON.stringify({
            phase: "skipped",
            reason: "no_crm_contact",
            templateName: template.name,
          })}`
        );
      }

      let sendId: string | undefined;
      if (legacyChatId) {
        const templateSend = await storage.createTemplateSend({
          userId: req.user.id,
          chatId: legacyChatId,
          templateId,
          variableValues: variableValues,
          status: sendStatus,
          twilioMessageSid: messageId || null,
        });
        sendId = templateSend.id;
        console.log(`[TemplateSend] DB record created — sendId=${sendId}`);
      } else {
        console.log(`[TemplateSend] No legacy chatId — skipping analytics record`);
      }

      return reply(
        200,
        {
          success: true,
          message: `Template "${template.name}" sent to ${recipientName}`,
          sendId,
          messageId,
          provider: resolvedProvider,
          persistedMessageId,
          conversationId: persistedConversationId,
        },
        "completed_ok"
      );
    } catch (error: any) {
      sendFinal.exitPhase = "fatal_unhandled_exception";
      sendFinal.metaMessage = error?.message || String(error);
      sendFinal.finalResponseStatus = 500;
      logCarouselSendFinalState();
      console.error(
        `[TEMPLATE_ROUTE_FATAL] POST /api/templates/send`,
        error?.message || error,
        error?.stack
      );
      console.error(
        `[WA_TEMPLATE_SEND] ${JSON.stringify({
          phase: "unexpected_error",
          metaError: error?.message || "unknown",
        })}`,
        error
      );
      res.status(500).json({ error: error.message || "Failed to send template" });
    }
  });

  console.log(
    "[BOOT] WhatsApp template API: POST /api/templates/send registered (server/routes/templates.ts)"
  );
}
