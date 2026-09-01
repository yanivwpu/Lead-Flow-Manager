/**
 * Production subscription checkout + start-trial HTTP routes.
 * Kept in a dedicated module so route-level tests can execute the same handlers
 * Railway runs for POST /api/subscription/checkout.
 */
import type { Express, Request, Response } from "express";
import type { SubscriptionPlan } from "@shared/schema";
import { storage } from "./storage";
import { subscriptionService } from "./subscriptionService";
import { startInternalProAiTrialForUser } from "./trialEntitlements";
import { rejectStripeIfShopifyUser } from "./shopifyBillingGuard";
import { getAppOrigin } from "./urlOrigins";
import { sanitizeStripeReturnPath } from "./checkoutReturnPath";
import { STARTER_CHECKOUT_RETIRED_CODE } from "./stripePlanPriceIds";

function blockStripeForShopify(req: Request, res: Response, context: string) {
  return rejectStripeIfShopifyUser(req, res, context, (id) => storage.getUser(id));
}

export function registerSubscriptionCheckoutRoutes(app: Express): void {
  /** One-time internal Pro trial. Expired/used trials are rejected; this never calls Stripe. */
  app.post("/api/subscription/start-trial", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const result = await startInternalProAiTrialForUser(req.user.id);
      if (!result.ok) {
        if (result.reason === "not_found") {
          return res.status(404).json({ error: "User not found", code: result.reason });
        }
        const status = result.reason === "already_active" ? 409 : 400;
        return res.status(status).json({
          error: result.reason === "already_active" ? "Trial already active" : "Trial not available",
          code: result.reason,
        });
      }
      return res.json({
        started: true,
        trialEndsAt: result.trialEndsAt,
        plan: "pro",
      });
    } catch (error: any) {
      console.error("Error starting trial:", error);
      return res.status(500).json({ error: error.message || "Failed to start trial" });
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

      const baseUrl = getAppOrigin() || `${req.protocol}://${req.get("host")}`;
      const successPath = sanitizeStripeReturnPath(redirectTo, "/app/inbox");
      const cancelPath = sanitizeStripeReturnPath(cancelTo ?? redirectTo, successPath);
      const result = await subscriptionService.createCheckoutSession(
        req.user.id,
        planId as SubscriptionPlan,
        baseUrl,
        billingInterval || "monthly",
        { successReturnPath: successPath, cancelReturnPath: cancelPath },
      );
      res.json(result);
    } catch (error: any) {
      console.error("Error creating checkout:", error);
      if (error?.code === STARTER_CHECKOUT_RETIRED_CODE) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
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
      const baseUrl = getAppOrigin() || `${req.protocol}://${req.get("host")}`;
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

  // Legacy plan + AI Brain bundle — Pro routes to Pro-only checkout; Starter is rejected.
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
      if (error?.code === STARTER_CHECKOUT_RETIRED_CODE) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      if (error?.code === "PLAN_AI_BUNDLE_NOT_FREE") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || "Failed to create checkout" });
    }
  });
}
