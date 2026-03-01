import type { Express } from "express";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { sendRealtorOnboardingEmail } from "./email";
import { z } from "zod";

const TEMPLATE_ID = "realtor-growth-engine";

export function registerTemplateRoutes(app: Express) {
  app.get("/api/templates/realtor-growth-engine", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const template = await storage.getTemplateById(TEMPLATE_ID);
      const entitlement = await storage.getTemplateEntitlement(userId, TEMPLATE_ID);
      const install = await storage.getTemplateInstall(userId, TEMPLATE_ID);

      res.json({
        template: template || {
          id: TEMPLATE_ID,
          name: "Realtor Growth Engine",
          description: "Premium real estate CRM automation template",
          isPremium: true,
          version: "1.0.0",
        },
        entitlement: entitlement
          ? {
              status: entitlement.status,
              purchasedAt: entitlement.purchasedAt,
              onboardingSubmittedAt: entitlement.onboardingSubmittedAt,
            }
          : { status: "locked", purchasedAt: null, onboardingSubmittedAt: null },
        install: install
          ? { installStatus: install.installStatus, installedAt: install.installedAt }
          : { installStatus: null, installedAt: null },
      });
    } catch (error: any) {
      console.error("[Template] Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template data" });
    }
  });

  app.post("/api/templates/realtor-growth-engine/purchase", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;

      const entitlement = await storage.upsertTemplateEntitlement(userId, TEMPLATE_ID, {
        status: "purchased",
        purchasedAt: new Date(),
      });

      const existingInstall = await storage.getTemplateInstall(userId, TEMPLATE_ID);
      if (!existingInstall) {
        await storage.createTemplateInstall({
          userId,
          templateId: TEMPLATE_ID,
          installStatus: "pending",
        });
      }

      res.json({ success: true, entitlement });
    } catch (error: any) {
      console.error("[Template] Purchase error:", error);
      res.status(500).json({ error: "Failed to process purchase" });
    }
  });

  app.post("/api/templates/realtor-growth-engine/onboarding/submit", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);

      const entitlement = await storage.getTemplateEntitlement(userId, TEMPLATE_ID);
      if (!entitlement || entitlement.status === "locked") {
        return res.status(403).json({ error: "Template not purchased" });
      }

      if (entitlement.onboardingSubmittedAt) {
        return res.status(400).json({ error: "Onboarding already submitted" });
      }

      const { payload } = req.body;
      if (!payload) {
        return res.status(400).json({ error: "Payload is required" });
      }

      const onboardingSchema = z.object({
        isRegisteredEntity: z.enum(["yes", "no", "not_sure"]),
        legalName: z.string().min(2),
        country: z.string().min(2),
      });

      const validation = onboardingSchema.safeParse(payload);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid form data", details: validation.error.issues });
      }

      if (payload.isRegisteredEntity === "no" || payload.isRegisteredEntity === "not_sure") {
        return res.status(400).json({ error: "A registered business entity is required for this template. Meta requires business verification for WhatsApp API access." });
      }

      const normalized = {
        fullName: user?.name || "N/A",
        email: user?.email || "N/A",
        mobile: payload.desiredNumber || "N/A",
        legalBusinessName: payload.legalName,
        country: payload.country,
        website: payload.website || null,
        desiredWhatsappNumber: payload.desiredNumber || null,
        bmEmail: payload.bmEmail || null,
        timezone: payload.timezone || null,
        preferredCallWindows: payload.preferredCallWindows || null,
      };

      const fullPayload = {
        ...payload,
        fullName: user?.name,
        email: user?.email,
        hasRegisteredEntity: payload.isRegisteredEntity,
        legalBusinessName: payload.legalName,
        desiredWhatsappNumber: payload.desiredNumber,
        numberActiveOnWhatsapp: payload.isNumberActive,
        migrateOrNew: payload.willingToMigrate === "yes" ? "migrate" : "new",
        smsAccess: payload.hasSmsAccess,
        numberOwnership: "owner",
        hasBM: payload.hasMetaBM,
        teamSize: payload.teamType,
        seats: payload.estimatedSeats,
        notifications: payload.notificationsEnabled ? "enabled" : "disabled",
        leadSources: payload.leadSources,
        goals: payload.primaryGoal,
        notes: payload.additionalNotes,
      };

      const submission = await storage.createRealtorOnboardingSubmission({
        userId,
        templateId: TEMPLATE_ID,
        payload: fullPayload,
        normalized,
      });

      await storage.upsertTemplateEntitlement(userId, TEMPLATE_ID, {
        status: "submitted",
        onboardingSubmittedAt: new Date(),
      });

      sendRealtorOnboardingEmail(fullPayload, normalized, submission.id).catch((err) =>
        console.error("[Template] Failed to send onboarding email:", err)
      );

      try {
        await installTemplateForUser(userId);
      } catch (installErr) {
        console.error("[Template] Install failed (non-blocking):", installErr);
      }

      res.json({ success: true, submissionId: submission.id });
    } catch (error: any) {
      console.error("[Template] Onboarding submit error:", error);
      res.status(500).json({ error: "Failed to submit onboarding" });
    }
  });

  app.post("/api/templates/realtor-growth-engine/install", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;

      const entitlement = await storage.getTemplateEntitlement(userId, TEMPLATE_ID);
      if (!entitlement || entitlement.status === "locked") {
        return res.status(403).json({ error: "Template not purchased" });
      }

      await installTemplateForUser(userId);
      const install = await storage.getTemplateInstall(userId, TEMPLATE_ID);

      res.json({ success: true, install });
    } catch (error: any) {
      console.error("[Template] Install error:", error);
      res.status(500).json({ error: "Failed to install template" });
    }
  });

  app.get("/api/templates/realtor-growth-engine/status", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;

      const entitlement = await storage.getTemplateEntitlement(userId, TEMPLATE_ID);
      const install = await storage.getTemplateInstall(userId, TEMPLATE_ID);
      const submission = await storage.getRealtorOnboardingSubmission(userId);

      res.json({
        entitlement: entitlement
          ? {
              status: entitlement.status,
              purchasedAt: entitlement.purchasedAt,
              onboardingSubmittedAt: entitlement.onboardingSubmittedAt,
            }
          : null,
        install: install
          ? { installStatus: install.installStatus, installedAt: install.installedAt }
          : null,
        submission: submission
          ? {
              id: submission.id,
              submittedAt: submission.submittedAt,
              status: submission.status,
              normalized: submission.normalized,
            }
          : null,
      });
    } catch (error: any) {
      console.error("[Template] Status error:", error);
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });
  app.delete("/api/templates/realtor-growth-engine/reset", requireAuth, async (req, res) => {
    try {
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ error: "Reset not available in production" });
      }

      const userId = (req.user as any).id;
      await storage.resetTemplateForUser(userId, TEMPLATE_ID);

      console.log(`[Template] Reset template ${TEMPLATE_ID} for user ${userId}`);
      res.json({ success: true, message: "Template state fully reset. Refresh to start from locked state." });
    } catch (error: any) {
      console.error("[Template] Reset error:", error);
      res.status(500).json({ error: "Failed to reset template" });
    }
  });
}

async function installTemplateForUser(userId: string) {
  const TEMPLATE_ID_CONST = "realtor-growth-engine";
  let install = await storage.getTemplateInstall(userId, TEMPLATE_ID_CONST);

  if (!install) {
    install = await storage.createTemplateInstall({
      userId,
      templateId: TEMPLATE_ID_CONST,
      installStatus: "pending",
    });
  }

  if (install.installStatus === "installed") {
    return;
  }

  const installLog: string[] = [];

  try {
    const assets = await storage.getTemplateAssets(TEMPLATE_ID_CONST);

    for (const asset of assets) {
      const def = asset.definition as any;

      switch (asset.assetType) {
        case "pipeline": {
          const key = "pipeline";
          const existing = await storage.getUserTemplateDataByKey(userId, TEMPLATE_ID_CONST, "pipeline", key);
          if (!existing) {
            await storage.createUserTemplateData({
              userId,
              templateId: TEMPLATE_ID_CONST,
              assetType: "pipeline",
              assetKey: key,
              definition: def,
            });
            installLog.push(`Pipeline: ${def.name || "Realtor Pipeline"} with ${def.stages?.length || 0} stages — installed`);
          } else {
            installLog.push(`Pipeline: already exists, skipped`);
          }
          break;
        }
        case "tags": {
          const tags = def.tags || [];
          for (const tag of tags) {
            const tagKey = `tag_${tag.toLowerCase().replace(/\s+/g, '_')}`;
            const existing = await storage.getUserTemplateDataByKey(userId, TEMPLATE_ID_CONST, "tags", tagKey);
            if (!existing) {
              await storage.createUserTemplateData({
                userId,
                templateId: TEMPLATE_ID_CONST,
                assetType: "tags",
                assetKey: tagKey,
                definition: { tag },
              });
            }
          }
          installLog.push(`Tags: ${tags.length} tags installed`);
          break;
        }
        case "fields": {
          const fields = def.fields || [];
          for (const field of fields) {
            const fieldKey = `field_${field.key}`;
            const existing = await storage.getUserTemplateDataByKey(userId, TEMPLATE_ID_CONST, "fields", fieldKey);
            if (!existing) {
              await storage.createUserTemplateData({
                userId,
                templateId: TEMPLATE_ID_CONST,
                assetType: "fields",
                assetKey: fieldKey,
                definition: field,
              });
            }
          }
          installLog.push(`Fields: ${fields.length} lead fields installed`);
          break;
        }
        case "message_templates": {
          const templates = def.templates || [];
          for (const tpl of templates) {
            const tplKey = `msg_${tpl.key}`;
            const existing = await storage.getUserTemplateDataByKey(userId, TEMPLATE_ID_CONST, "message_templates", tplKey);
            if (!existing) {
              await storage.createUserTemplateData({
                userId,
                templateId: TEMPLATE_ID_CONST,
                assetType: "message_templates",
                assetKey: tplKey,
                definition: tpl,
              });
            }
          }
          installLog.push(`Message Templates: ${templates.length} templates installed`);
          break;
        }
        case "workflows": {
          const workflowDefs = def.workflows || [];
          for (const wf of workflowDefs) {
            const existing = await storage.getWorkflows(userId);
            const alreadyExists = existing.find(
              (w) => w.name === wf.name || (w.triggerConditions as any)?.templateKey === wf.key
            );
            if (!alreadyExists) {
              await storage.createWorkflow({
                userId,
                name: wf.name,
                description: `Realtor Growth Engine: ${wf.name}`,
                isActive: wf.enabledByDefault !== false,
                triggerType: wf.trigger?.type || "new_chat",
                triggerConditions: { ...wf.trigger, templateKey: wf.key, templateId: TEMPLATE_ID_CONST },
                actions: wf.actions || [],
              });
              installLog.push(`Workflow: ${wf.name} created`);
            } else {
              installLog.push(`Workflow: ${wf.name} already exists, skipped`);
            }
          }
          break;
        }
        case "ai_rules": {
          const key = "ai_rules";
          const existing = await storage.getUserTemplateDataByKey(userId, TEMPLATE_ID_CONST, "ai_rules", key);
          if (!existing) {
            await storage.createUserTemplateData({
              userId,
              templateId: TEMPLATE_ID_CONST,
              assetType: "ai_rules",
              assetKey: key,
              definition: def,
            });
            installLog.push(`AI Rules: scoring and classification rules installed`);
          } else {
            installLog.push(`AI Rules: already exists, skipped`);
          }
          break;
        }
      }
    }

    await storage.updateTemplateInstall(install.id, {
      installStatus: "installed",
      installedAt: new Date(),
      installLog: installLog.join("\n"),
    });

    console.log(`[Template] Successfully installed ${TEMPLATE_ID_CONST} for user ${userId}`);
  } catch (error: any) {
    await storage.updateTemplateInstall(install.id, {
      installStatus: "failed",
      installLog: [...installLog, `ERROR: ${error.message}`].join("\n"),
    });
    throw error;
  }
}
