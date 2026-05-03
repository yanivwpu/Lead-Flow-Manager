import type { Express } from "express";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { sendRealtorOnboardingEmail, sendRealtorPaymentConfirmationEmail } from "./email";
import { getUncachableStripeClient } from "./stripeClient";
import { resolveStripeCheckoutRedirectOrigin } from "./stripeCheckoutRedirectBase";
import { subscriptionService } from "./subscriptionService";
import { z } from "zod";
import { getAppOrigin } from "./urlOrigins";
import { buildPostCheckoutSuccessUrl, buildStripeCancelUrl, sanitizeStripeReturnPath } from "./checkoutReturnPath";
import { isUserCalendlyBookingConnected } from "./calendlyBookingConnected";

const TEMPLATE_ID = "realtor-growth-engine";
const TEMPLATE_PRICE_CENTS = 19900;

export function registerTemplateRoutes(app: Express) {
  app.get("/api/templates/realtor-growth-engine/check-subscription", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const limits = await subscriptionService.getUserLimits(userId);
      const plan = (limits?.plan || "free").toLowerCase();
      const hasPro = plan === "pro" || plan === "scale";
      const hasAI = limits?.hasAIBrainAddon || false;

      res.json({ hasPro, hasAI, plan });
    } catch (error: any) {
      console.error("[Template] Subscription check error:", error);
      res.status(500).json({ error: "Failed to check subscription" });
    }
  });

  app.get("/api/templates/realtor-growth-engine", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      const template = await storage.getTemplateById(TEMPLATE_ID);
      const entitlement = await storage.getTemplateEntitlement(userId, TEMPLATE_ID);
      const install = await storage.getTemplateInstall(userId, TEMPLATE_ID);

      // Bypass for demo user or anyone else we want to grant immediate access
      if (user?.email === "demo@whachat.com" || user?.email?.includes("admin") || req.query.bypass === "true") {
        return res.json({
          template: template || {
            id: TEMPLATE_ID,
            name: "Realtor Growth Engine",
            description: "Premium real estate CRM automation template",
            isPremium: true,
            version: "1.0.0",
          },
          entitlement: {
            status: "installed",
            purchasedAt: new Date().toISOString(),
            onboardingSubmittedAt: new Date().toISOString(),
          },
          install: {
            installStatus: "installed",
            installedAt: new Date().toISOString(),
          },
          subscription: { hasPro: true, hasAI: true, active: true },
        });
      }

      const limits = await subscriptionService.getUserLimits(userId);
      const plan = (limits?.plan || "free").toLowerCase();
      const hasPro = plan === "pro" || plan === "scale";
      const hasAI = limits?.hasAIBrainAddon || false;
      const subscriptionActive = hasPro && hasAI;

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
        subscription: { hasPro, hasAI, active: subscriptionActive },
      });
    } catch (error: any) {
      console.error("[Template] Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template data" });
    }
  });

  app.post("/api/templates/realtor-growth-engine/purchase", requireAuth, async (req, res) => {
    try {
      const { redirectTo, cancelTo } = (req.body || {}) as { redirectTo?: string; cancelTo?: string };
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const existing = await storage.getTemplateEntitlement(userId, TEMPLATE_ID);
      if (existing && existing.status !== "locked") {
        return res.json({ success: true, alreadyPurchased: true });
      }

      const limits = await subscriptionService.getUserLimits(userId);
      const plan = (limits?.plan || "free").toLowerCase();
      const hasPro = plan === "pro" || plan === "scale";
      const hasAI = limits?.hasAIBrainAddon || false;

      if (user.email !== "demo@whachat.com" && (!hasPro || !hasAI)) {
        return res.status(403).json({
          error: "Active Pro + AI plan required",
          hasPro,
          hasAI,
        });
      }

      if (user.email === "demo@whachat.com") {
        const entitlement = await storage.upsertTemplateEntitlement(userId, TEMPLATE_ID, {
          status: "purchased",
          purchasedAt: new Date(),
        });
        const existingInstall = await storage.getTemplateInstall(userId, TEMPLATE_ID);
        if (!existingInstall) {
          await storage.createTemplateInstall({ userId, templateId: TEMPLATE_ID, installStatus: "pending" });
        }
        return res.json({ success: true, demo: true });
      }

      const stripe = await getUncachableStripeClient();

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId },
        });
        await storage.updateUser(userId, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }

      const baseUrl = resolveStripeCheckoutRedirectOrigin(getAppOrigin());
      const defaultRge = "/app/templates/realtor-growth-engine";
      const successPath = sanitizeStripeReturnPath(redirectTo, `${defaultRge}/onboarding?paid=true`);
      const cancelPath = sanitizeStripeReturnPath(cancelTo ?? redirectTo, defaultRge);
      const priceId = process.env.STRIPE_RGE_ONE_TIME_PRICE_ID;
      if (!priceId) {
        throw new Error("Missing STRIPE_RGE_ONE_TIME_PRICE_ID");
      }

      const successInterstitial = buildPostCheckoutSuccessUrl(baseUrl, successPath);
      const success_url = `${successInterstitial}&session_id={CHECKOUT_SESSION_ID}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "payment",
        success_url,
        cancel_url: buildStripeCancelUrl(baseUrl, cancelPath),
        metadata: { userId, templateId: TEMPLATE_ID },
      });

      if (!session.url) throw new Error("Failed to create checkout session");
      res.json({ success: true, url: session.url });
    } catch (error: any) {
      console.error("[Template] Purchase error:", error);
      res.status(500).json({ error: "Failed to process purchase" });
    }
  });

  app.post("/api/templates/realtor-growth-engine/verify-payment", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== "paid") {
        return res.status(400).json({ error: "Payment not completed" });
      }

      if (session.metadata?.userId !== userId) {
        return res.status(403).json({ error: "Session does not belong to this user" });
      }

      const entitlement = await storage.upsertTemplateEntitlement(userId, TEMPLATE_ID, {
        status: "purchased",
        purchasedAt: new Date(),
      });

      const existingInstall = await storage.getTemplateInstall(userId, TEMPLATE_ID);
      if (!existingInstall) {
        await storage.createTemplateInstall({ userId, templateId: TEMPLATE_ID, installStatus: "pending" });
      }

      const user = await storage.getUser(userId);
      if (user?.email) {
        sendRealtorPaymentConfirmationEmail(user.name || "", user.email).catch((err) =>
          console.error("[Template] Failed to send payment confirmation email:", err)
        );
      }

      res.json({ success: true, entitlement });
    } catch (error: any) {
      console.error("[Template] Verify payment error:", error);
      res.status(500).json({ error: "Failed to verify payment" });
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

      const limits = await subscriptionService.getUserLimits(userId);
      const plan = (limits?.plan || "free").toLowerCase();
      const hasPro = plan === "pro" || plan === "scale";
      const hasAI = limits?.hasAIBrainAddon || false;
      if (user.email !== "demo@whachat.com" && (!hasPro || !hasAI)) {
        return res.status(403).json({ error: "Active Pro + AI plan required", hasPro, hasAI });
      }

      if (entitlement.onboardingSubmittedAt) {
        return res.status(400).json({ error: "Onboarding already submitted" });
      }

      const { payload } = req.body;
      if (!payload) {
        return res.status(400).json({ error: "Payload is required" });
      }

      const onboardingSchema = z.object({
        isRegisteredEntity: z.enum(["yes", "no"]),
        legalName: z.string().min(2),
        country: z.string().min(2),
      });

      const validation = onboardingSchema.safeParse(payload);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid form data", details: validation.error.issues });
      }

      if (payload.isRegisteredEntity === "no") {
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
      const user = await storage.getUser(userId);

      const entitlement = await storage.getTemplateEntitlement(userId, TEMPLATE_ID);
      if (!entitlement || entitlement.status === "locked") {
        return res.status(403).json({ error: "Template not purchased" });
      }

      if (user && user.email !== "demo@whachat.com") {
        const limits = await subscriptionService.getUserLimits(userId);
        const plan = (limits?.plan || "free").toLowerCase();
        const hasPro = plan === "pro" || plan === "scale";
        const hasAI = limits?.hasAIBrainAddon || false;
        if (!hasPro || !hasAI) {
          return res.status(403).json({ error: "Active Pro + AI plan required", hasPro, hasAI });
        }
      }

      await installTemplateForUser(userId);
      const install = await storage.getTemplateInstall(userId, TEMPLATE_ID);

      res.json({ success: true, install });
    } catch (error: any) {
      console.error("[Template] Install error:", error);
      res.status(500).json({ error: "Failed to install template" });
    }
  });

  app.get("/api/templates/realtor-growth-engine/assets", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const assets = await storage.getTemplateAssets(TEMPLATE_ID);
      res.json({ assets });
    } catch (error: any) {
      console.error("[Template] Assets error:", error);
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  app.get("/api/templates/realtor-growth-engine/status", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;

      const entitlement = await storage.getTemplateEntitlement(userId, TEMPLATE_ID);
      const install = await storage.getTemplateInstall(userId, TEMPLATE_ID);
      const submission = await storage.getRealtorOnboardingSubmission(userId);

      const calendlyConnected = await isUserCalendlyBookingConnected(userId);

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
        calendlyConnected,
      });
    } catch (error: any) {
      console.error("[Template] Status error:", error);
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });
  app.get("/api/templates/realtor-growth-engine/preferences", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const prefs = await storage.getUserTemplateDataByKey(userId, TEMPLATE_ID, "preferences", "realtor_growth_engine_preferences");
      let def = (prefs?.definition as Record<string, unknown> | null) || null;
      if (def && (await isUserCalendlyBookingConnected(userId))) {
        def = { ...def };
        delete def.W3_bookingLink;
      }
      res.json({ preferences: def });
    } catch (error: any) {
      console.error("[Template] Preferences fetch error:", error);
      res.status(500).json({ error: "Failed to fetch preferences" });
    }
  });

  app.put("/api/templates/realtor-growth-engine/preferences", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { preferences } = req.body;
      if (!preferences || typeof preferences !== "object") {
        return res.status(400).json({ error: "Invalid preferences payload" });
      }
      const prefsIn = { ...preferences } as Record<string, unknown>;
      if (await isUserCalendlyBookingConnected(userId)) {
        delete prefsIn.W3_bookingLink;
      }
      const result = await storage.upsertUserTemplateData(
        userId, TEMPLATE_ID, "preferences", "realtor_growth_engine_preferences", prefsIn
      );
      res.json({ success: true, preferences: result.definition });
    } catch (error: any) {
      console.error("[Template] Preferences save error:", error);
      res.status(500).json({ error: "Failed to save preferences" });
    }
  });

  app.get("/api/templates/realtor-growth-engine/routing-config", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const data = await storage.getUserTemplateDataByKey(userId, TEMPLATE_ID, "routing_config", "realtor_service_routing");
      res.json({ services: data?.definition?.services || null });
    } catch (error: any) {
      console.error("[Template] Routing config fetch error:", error);
      res.status(500).json({ error: "Failed to fetch routing config" });
    }
  });

  app.put("/api/templates/realtor-growth-engine/routing-config", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { services } = req.body;
      if (!Array.isArray(services)) {
        return res.status(400).json({ error: "Invalid routing config: services must be an array" });
      }
      const result = await storage.upsertUserTemplateData(
        userId, TEMPLATE_ID, "routing_config", "realtor_service_routing", { services }
      );
      res.json({ success: true, services: (result.definition as any)?.services });
    } catch (error: any) {
      console.error("[Template] Routing config save error:", error);
      res.status(500).json({ error: "Failed to save routing config" });
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
