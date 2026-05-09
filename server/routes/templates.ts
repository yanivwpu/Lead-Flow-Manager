import type { Express } from "express";
import type { Channel } from "@shared/schema";
import {
  buildMetaCloudTemplateSendComponents,
  buildMetaLibraryTemplateSendComponents,
  effectiveTemplateRowForLibrarySend,
  getInboxTemplateSendBlockReason,
  inferMetaTemplateShape,
  normalizeTemplateVariableMap,
  parseMetaGraphTemplateForLibrary,
  resolveLibraryHeaderMediaDisplayUrl,
  substituteTemplateVariablesForDisplay,
} from "@shared/metaTemplateSend";
import { storage } from "../storage";
import { getMetaMessageTemplates, sendMetaWhatsAppTemplate } from "../userMeta";
import { getUserTwilioClient } from "../userTwilio";
import { subscriptionService } from "../subscriptionService";
import { getPresetCampaignStatusLabel } from "@shared/presetCampaignLabels";

/** When true, “launch” creates `active` and may enqueue sends. Until then, launch → `active_pending`. */
const PRESET_CAMPAIGN_SEND_ENGINE_READY = false;

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
  const e = metaErr as { message?: string; metaErrorCode?: number };
  const msg = String(e?.message || "");
  const code = e?.metaErrorCode;
  if (code === 132012 || msg.includes("132012")) {
    return "WhatsApp couldn’t send this template. Confirm it still matches your approved version in WhatsApp Manager, then try again.";
  }
  if (!msg) return "WhatsApp couldn’t send this template. Try again or verify the template in WhatsApp Manager.";
  return msg;
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
      res.json(
        rows.map((c) => ({
          ...c,
          statusLabel: getPresetCampaignStatusLabel(c.status),
        }))
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
            ? "Campaign is active in your account. Automated audience sends are not scheduled yet — delivery setup comes next."
            : "Campaign saved.";

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
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
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
          try {
            const status = (t.status || "pending").toLowerCase();
            const category = (t.category || "utility").toLowerCase();
            const language = t.language || "en";
            const metaId = `meta_${t.id || t.name}_${language}`;

            const parsed = parseMetaGraphTemplateForLibrary({
              name: t.name,
              components: t.components as Record<string, unknown>[],
            });

            console.log(
              `[WA_TEMPLATE_SYNC] classified name=${String(t.name)} templateType=${parsed.templateType} components=${parsed.componentTypesUpper.join(",")} carouselCards=${Array.isArray(parsed.carouselCards) ? parsed.carouselCards.length : 0}`
            );

            const existing = await storage.getMessageTemplateByTwilioSid(req.user.id, metaId);

            if (existing) {
              await storage.updateMessageTemplate(existing.id, {
                name: t.name,
                status,
                category,
                templateType: parsed.templateType,
                carouselCards: parsed.carouselCards as any,
                bodyText: parsed.bodyText,
                headerType: parsed.headerType,
                headerContent: parsed.headerContent,
                footerText: parsed.footerText,
                buttons: parsed.buttons as any,
                variables: parsed.variables as any,
                lastSyncedAt: new Date(),
              });
              updated++;
              console.log(`[TemplateSync] Updated: ${t.name} [${status}]`);
            } else {
              await storage.createMessageTemplate({
                userId: req.user.id,
                twilioSid: metaId,
                name: t.name,
                language,
                category,
                status,
                templateType: parsed.templateType,
                bodyText: parsed.bodyText,
                headerType: parsed.headerType,
                headerContent: parsed.headerContent,
                footerText: parsed.footerText,
                buttons: parsed.buttons as any,
                carouselCards: parsed.carouselCards as any,
                variables: parsed.variables as any,
              });
              inserted++;
              console.log(`[WA_TEMPLATE_SYNC] Inserted: ${t.name} [${status}]`);
            }
          } catch (err) {
            skipped++;
            console.error(`[WA_TEMPLATE_SYNC] Skipped template "${t.name}":`, err);
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

      res.json({
        success: true,
        message: `Sync complete: ${inserted + updated} template(s) synced (${inserted} new, ${updated} updated${skipped > 0 ? `, ${skipped} skipped` : ""}).`,
        provider: resolvedProvider,
        templatesFound: fetched,
        inserted,
        updated,
        skipped,
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
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        return res.status(403).json({ error: "Template messaging is a Pro feature" });
      }

      const { templateId, chatId, contactId, variables, sendSource, optionalHeaderMediaUrl: optionalHeaderMediaBody } =
        req.body as {
          templateId?: string;
          chatId?: string;
          contactId?: string;
          variables?: Record<string, string>;
          sendSource?: string;
          /** Direct https URL when synced header media is empty (upload / library pick). */
          optionalHeaderMediaUrl?: string;
        };
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
        return res.status(400).json({ error: "Template ID and either Chat ID or Contact ID are required" });
      }

      const template = await storage.getMessageTemplate(templateId);
      if (!template || template.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Resolve recipient — either from legacy chats table or new contacts table
      let recipientPhone: string;
      let recipientName: string;
      let legacyChatId: string | null = chatId || null;
      /** Unified inbox / CRM contact for persisting into `messages` + `conversations` */
      let crmContactId: string | null = null;

      if (contactId) {
        const contact = await storage.getContact(contactId);
        if (!contact || contact.userId !== req.user.id) {
          return res.status(404).json({ error: "Contact not found" });
        }
        const phone = contact.whatsappId || contact.phone;
        if (!phone) {
          return res.status(400).json({ error: "Contact does not have a WhatsApp number" });
        }
        recipientPhone = phone;
        recipientName = contact.name;
        crmContactId = contact.id;
      } else {
        const chat = await storage.getChat(chatId);
        if (!chat || chat.userId !== req.user.id) {
          return res.status(404).json({ error: "Chat not found" });
        }
        if (!chat.whatsappPhone) {
          return res.status(400).json({ error: "Chat does not have a WhatsApp number" });
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

      // Full session row — auth-core `getUser` omits whatsappProvider / Meta fields (defaults wrongly to Twilio).
      const user = await storage.getUserForSession(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
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
      const optionalHeaderMediaUrl =
        typeof optionalHeaderMediaBody === "string" ? optionalHeaderMediaBody.trim() : undefined;
      const libraryEffectiveTemplate =
        metaSendPath === "library_full"
          ? effectiveTemplateRowForLibrarySend(template, optionalHeaderMediaUrl ?? null)
          : template;

      let messageId = "";
      let sendStatus = "sent";

      if (resolvedProvider === "none") {
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
        return res.status(400).json({ error: "No WhatsApp provider connected" });
      }

      if (resolvedProvider === "meta") {
        if (!user.metaConnected || !phoneNumberId) {
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
          return res.status(400).json({ error: "Meta WhatsApp account not connected" });
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
          const inboxBlock = getInboxTemplateSendBlockReason({
            name: template.name,
            bodyText: template.bodyText,
            headerType: template.headerType,
            headerContent: template.headerContent,
            buttons: template.buttons,
            templateType: template.templateType,
            carouselCards: template.carouselCards,
            category: template.category,
          });
          if (inboxBlock.blocked) {
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
            return res.status(400).json({
              error: inboxBlock.reason || "This template can't be sent from this shortcut.",
            });
          }
        }

        const built =
          metaSendPath === "quick_send"
            ? buildMetaCloudTemplateSendComponents(template, variableValues)
            : buildMetaLibraryTemplateSendComponents(libraryEffectiveTemplate, variableValues);

        const resolvedShape =
          "shape" in built && built.shape ? built.shape : templateShape;

        if (built.error) {
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
          return res.status(400).json({ error: built.error });
        }

        components = built.components as any[] | undefined;

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
            recipient: recipientLog,
            components,
          })}`
        );

        try {
          const result = await sendMetaWhatsAppTemplate(
            req.user.id,
            recipientPhone,
            template.name,
            templateLang,
            components && components.length > 0 ? components : undefined
          );
          messageId = result.messageId;
          sendStatus = result.status;
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
              recipient: recipientLog,
              responseStatus: result.httpStatus,
              messageId,
              components,
            })}`
          );
        } catch (metaErr: any) {
          const responseStatus =
            typeof metaErr?.httpStatus === "number" ? metaErr.httpStatus : 500;
          const metaErrorRaw =
            metaErr?.message || "Failed to send template via Meta WhatsApp API";
          const metaErrorOut =
            metaSendPath === "library_full"
              ? formatFriendlyMetaTemplateUserMessage(metaErr)
              : metaErrorRaw;
          console.error(
            `[WA_TEMPLATE_SEND] ${JSON.stringify({
              phase: "error",
              sendSource: sendSourceTag,
              metaSendPath,
              provider: resolvedProvider,
              templateName: template.name,
              language: templateLang,
              shape: resolvedShape,
              phoneNumberId,
              recipient: recipientLog,
              responseStatus,
              metaError: metaErrorRaw,
              metaErrorCode: metaErr?.metaErrorCode,
              metaErrorType: metaErr?.metaErrorType,
              components,
            })}`,
            metaErr
          );
          return res.status(responseStatus >= 400 && responseStatus < 600 ? responseStatus : 500).json({
            error: metaErrorOut,
            metaCode: metaErr?.metaErrorCode,
          });
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
          return res.status(400).json({ error: "Twilio is not connected" });
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
        } catch (twilioErr: any) {
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
          return res.status(500).json({
            error: twilioErr?.message || "Failed to send template via Twilio",
          });
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
            optionalHeaderMediaUrl ?? null
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

          const templateVariablesPayload = {
            ...normalizeTemplateVariableMap(variableValues),
            templateLanguage: templateLang,
            templateName: template.name,
            channel: "whatsapp",
            provider: resolvedProvider === "meta" ? "meta" : resolvedProvider,
            headerType: displaySource.headerType ?? null,
            headerMediaUrl: resolvedHeaderMediaUrl,
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

      res.json({
        success: true,
        message: `Template "${template.name}" sent to ${recipientName}`,
        sendId,
        messageId,
        provider: resolvedProvider,
        persistedMessageId,
        conversationId: persistedConversationId,
      });
    } catch (error: any) {
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
}
