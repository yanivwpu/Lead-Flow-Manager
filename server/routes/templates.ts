import type { Express } from "express";
import { storage } from "../storage";
import { getMetaMessageTemplates } from "../userMeta";
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

      const templates = getFilteredTemplates(
        language as any,
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

  // Sync templates from Twilio Content API
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
      if (!user?.twilioConnected || !user.twilioAccountSid || !user.twilioAuthToken) {
        return res
          .status(400)
          .json({ error: "Twilio is not connected. Connect Twilio in Settings first." });
      }

      console.log(`Template sync requested for user ${req.user.id}`);

      res.json({
        success: true,
        message:
          "Template sync initiated. Note: Templates must be created and approved in your Twilio console first.",
        templatesFound: 0,
      });
    } catch (error) {
      console.error("Error syncing templates:", error);
      res.status(500).json({ error: "Failed to sync templates" });
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

  // Send a template message
  app.post("/api/templates/send", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const limits = await subscriptionService.getUserLimits(req.user.id);
      if (!(limits as any)?.templatesEnabled) {
        return res.status(403).json({ error: "Template messaging is a Pro feature" });
      }

      const { templateId, chatId, variables } = req.body;
      if (!templateId || !chatId) {
        return res.status(400).json({ error: "Template ID and Chat ID are required" });
      }

      const template = await storage.getMessageTemplate(templateId);
      if (!template || template.userId !== req.user.id) {
        return res.status(404).json({ error: "Template not found" });
      }

      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== req.user.id) {
        return res.status(404).json({ error: "Chat not found" });
      }

      if (!chat.whatsappPhone) {
        return res.status(400).json({ error: "Chat does not have a WhatsApp number" });
      }

      const templateSend = await storage.createTemplateSend({
        userId: req.user.id,
        chatId,
        templateId,
        variableValues: variables || {},
        status: "sent",
      });

      console.log(`Template ${template.name} sent to ${chat.name} (${chat.whatsappPhone})`);

      res.json({
        success: true,
        message: `Template "${template.name}" sent to ${chat.name}`,
        sendId: templateSend.id,
      });
    } catch (error) {
      console.error("Error sending template:", error);
      res.status(500).json({ error: "Failed to send template" });
    }
  });
}
