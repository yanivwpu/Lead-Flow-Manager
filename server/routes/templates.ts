import type { Express } from "express";
import { storage } from "../storage";
import { getMetaMessageTemplates, sendMetaWhatsAppTemplate } from "../userMeta";
import { getUserTwilioClient } from "../userTwilio";
import { subscriptionService } from "../subscriptionService";

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

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const provider = user.whatsappProvider || "twilio";
      console.log(`[TemplateSync] Started — userId=${req.user.id} provider=${provider}`);

      let fetched = 0;
      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      // ===== META SYNC =====
      if (provider === "meta") {
        if (!user.metaConnected || !user.metaBusinessAccountId) {
          return res.status(400).json({
            error: "Meta WhatsApp is not connected. Connect Meta in Settings first.",
          });
        }

        console.log(`[TemplateSync] Meta Business Account ID: ${user.metaBusinessAccountId}`);

        const rawTemplates = await getMetaMessageTemplates(req.user.id);
        fetched = rawTemplates.length;

        console.log(
          `[TemplateSync] Meta returned ${fetched} template(s): ${rawTemplates
            .map((t: any) => `${t.name}[${t.status}/${t.language}]`)
            .join(", ")}`
        );

        for (const t of rawTemplates) {
          try {
            const status = (t.status || "pending").toLowerCase();
            const category = (t.category || "utility").toLowerCase();
            const language = t.language || "en";
            const metaId = `meta_${t.id || t.name}_${language}`;

            // Extract components
            let bodyText = "";
            let headerType: string | null = null;
            let headerContent: string | null = null;
            let footerText: string | null = null;
            let buttons: any[] = [];
            const variables: string[] = [];

            for (const comp of t.components || []) {
              if (comp.type === "BODY") {
                bodyText = comp.text || "";
                const vars = bodyText.match(/\{\{\d+\}\}/g) || [];
                vars.forEach((v: string) => {
                  if (!variables.includes(v)) variables.push(v);
                });
              } else if (comp.type === "HEADER") {
                headerType = (comp.format || "").toLowerCase() || null;
                if (comp.format === "TEXT") {
                  headerContent = comp.text || null;
                } else if (comp.example?.header_handle?.[0]) {
                  headerContent = comp.example.header_handle[0];
                }
              } else if (comp.type === "FOOTER") {
                footerText = comp.text || null;
              } else if (comp.type === "BUTTONS") {
                buttons = comp.buttons || [];
              }
            }

            const existing = await storage.getMessageTemplateByTwilioSid(req.user.id, metaId);

            if (existing) {
              await storage.updateMessageTemplate(existing.id, {
                name: t.name,
                status,
                category,
                bodyText,
                headerType,
                headerContent,
                footerText,
                buttons,
                variables,
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
                templateType: "text",
                bodyText,
                headerType,
                headerContent,
                footerText,
                buttons,
                carouselCards: [],
                variables,
              });
              inserted++;
              console.log(`[TemplateSync] Inserted: ${t.name} [${status}]`);
            }
          } catch (err) {
            skipped++;
            console.error(`[TemplateSync] Skipped template "${t.name}":`, err);
          }
        }

      // ===== TWILIO SYNC =====
      } else {
        if (!user.twilioConnected || !user.twilioAccountSid || !user.twilioAuthToken) {
          return res.status(400).json({
            error: "Twilio is not connected. Connect Twilio in Settings first.",
          });
        }

        console.log(`[TemplateSync] Twilio Account SID: ${user.twilioAccountSid}`);

        const client = await getUserTwilioClient(req.user.id);
        if (!client) {
          return res.status(400).json({ error: "Failed to initialize Twilio client." });
        }

        let contents: any[] = [];
        try {
          contents = await (client as any).contentV1.contentAndApprovals.list({ limit: 100 });
        } catch (err: any) {
          console.error(`[TemplateSync] Twilio Content API error:`, err);
          return res.status(500).json({
            error: `Failed to fetch Twilio templates: ${err.message}`,
          });
        }

        fetched = contents.length;
        console.log(`[TemplateSync] Twilio returned ${fetched} template(s)`);

        for (const t of contents) {
          try {
            const approvals = t.approvalRequests || {};
            const whatsapp = approvals.whatsapp || {};
            const status = (whatsapp.status || "pending").toLowerCase();
            const category = (whatsapp.category || "utility").toLowerCase();
            const language = whatsapp.language || "en";
            const name = whatsapp.name || t.friendlyName || t.sid;

            console.log(`[TemplateSync] Twilio template: ${name} sid=${t.sid} status=${status}`);

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
            console.error(`[TemplateSync] Skipped Twilio template ${t.sid}:`, err);
          }
        }
      }

      console.log(
        `[TemplateSync] Done — fetched=${fetched} inserted=${inserted} updated=${updated} skipped=${skipped}`
      );

      res.json({
        success: true,
        message: `Sync complete: ${inserted + updated} template(s) synced (${inserted} new, ${updated} updated${skipped > 0 ? `, ${skipped} skipped` : ""}).`,
        provider,
        templatesFound: fetched,
        inserted,
        updated,
        skipped,
      });
    } catch (error: any) {
      console.error("[TemplateSync] Unexpected error:", error);
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

      const chats = await storage.getRetargetableChats(req.user.id);

      const now = Date.now();
      const retargetableChats = chats.map((chat) => ({
        id: chat.id,
        name: chat.name,
        avatar: chat.avatar,
        whatsappPhone: chat.whatsappPhone,
        lastMessage: chat.lastMessage,
        lastMessageAt: chat.updatedAt?.toISOString(),
        daysSinceLastMessage: chat.updatedAt
          ? Math.floor((now - new Date(chat.updatedAt).getTime()) / (24 * 60 * 60 * 1000))
          : 0,
      }));

      res.json(retargetableChats);
    } catch (error) {
      console.error("Error fetching retargetable chats:", error);
      res.status(500).json({ error: "Failed to fetch retargetable chats" });
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

      const { templateId, chatId, contactId, variables } = req.body;
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
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const provider = user.whatsappProvider || "twilio";
      const variableValues: Record<string, string> = variables || {};

      console.log(`[TemplateSend] template=${template.name} recipient=${recipientName} phone=${recipientPhone} provider=${provider}`);
      console.log(`[TemplateSend] variables=${JSON.stringify(variableValues)}`);

      let messageId = "";
      let sendStatus = "sent";

      if (provider === "meta") {
        // Build components array from variable values
        // Variables are stored as ["{{1}}", "{{2}}"] — sort by number and build params
        const sortedVars = (template.variables as string[] || [])
          .slice()
          .sort((a, b) => {
            const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
            const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
            return na - nb;
          });

        const components: any[] = [];
        if (sortedVars.length > 0) {
          const bodyParams = sortedVars.map((v) => ({
            type: "text",
            text: variableValues[v] || "",
          }));
          components.push({ type: "body", parameters: bodyParams });
        }

        console.log(`[TemplateSend] Meta components: ${JSON.stringify(components)}`);

        const result = await sendMetaWhatsAppTemplate(
          req.user.id,
          recipientPhone,
          template.name,
          template.language || "en",
          components.length > 0 ? components : undefined
        );
        messageId = result.messageId;
        sendStatus = result.status;
        console.log(`[TemplateSend] Meta API success — messageId=${messageId}`);

      } else {
        // Twilio: use the Content API template SID
        const twilioClient = await getUserTwilioClient(req.user.id);
        if (!twilioClient) {
          return res.status(400).json({ error: "Twilio is not connected." });
        }

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

        const msg = await (twilioClient as any).messages.create(msgOptions);
        messageId = msg.sid;
        sendStatus = msg.status;
        console.log(`[TemplateSend] Twilio success — sid=${messageId} status=${sendStatus}`);
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
        provider,
      });
    } catch (error: any) {
      console.error("[TemplateSend] Error:", error);
      res.status(500).json({ error: error.message || "Failed to send template" });
    }
  });
}
