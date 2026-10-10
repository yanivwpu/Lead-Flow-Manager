import { Router, type Request } from "express";
import type { ShopifyOnboardingSnapshot } from "@shared/shopifyOnboarding";
import { parseShopifyActivationEvent } from "@shared/shopifyOnboarding";

type Merchant = { id: string; shopifyShop?: string | null; shopifyAccessToken?: string | null;
  shopifySubscriptionStatus?: string | null; deletionRequestedAt?: Date | string | null };
type Dependencies<T extends Merchant> = {
  readMerchant(id: string): Promise<T | undefined>;
  describe(user: T): Promise<ShopifyOnboardingSnapshot>;
  claim(user: T): Promise<{ granted: boolean; reason: string }>;
  emit(shop: string, event: "trial_activated" | "trial_failed" |
    "first_app_page_reached" | "first_successful_render" | "first_channel_setup",
    detail: { page?: "start" | "inbox" | "integrations" | "other";
      reason?: "ledger_not_ready" | "provisioning_failed"; source: "recovery" | "browser" }): void;
};

function sameOriginJson(req: Request): boolean {
  return req.is("application/json") === "application/json" &&
    req.get("origin") === `${req.protocol}://${req.get("host")}` &&
    req.get("sec-fetch-site") !== "cross-site";
}

/** Session-derived shop only: callers cannot claim a trial for an arbitrary shop. */
export function createShopifyOnboardingRouter<T extends Merchant>(deps: Dependencies<T>) {
  const router = Router();
  router.use((req, res, next) => {
    if (!["/onboarding", "/onboarding/retry", "/activation-events"].includes(req.path)) return next();
    res.set("Cache-Control", "no-store");
    if (!req.user) return res.status(401).json({ state: "reconnect_required" });
    if (req.method === "POST" && !sameOriginJson(req))
      return res.status(403).json({ error: "Open the app and try again." });
    next();
  });

  async function merchant(req: Request) {
    const user = await deps.readMerchant((req.user as { id: string }).id);
    if (!user?.shopifyShop || !user.shopifyAccessToken || user.deletionRequestedAt ||
        user.shopifySubscriptionStatus === "uninstalled") return undefined;
    return user;
  }

  router.get("/onboarding", async (req, res) => {
    try {
      const user = await merchant(req);
      if (!user) return res.status(409).json({ state: "reconnect_required" });
      res.json(await deps.describe(user));
    } catch {
      res.status(503).json({ state: "recovery_required" });
    }
  });

  router.post("/onboarding/retry", async (req, res) => {
    let recoveryShop: string | undefined;
    try {
      const user = await merchant(req);
      if (!user) return res.status(409).json({ state: "reconnect_required" });
      recoveryShop = user.shopifyShop!;
      const before = await deps.describe(user);
      // Used/blocked trials and paid accounts never enter provisioning.
      if (before.state !== "recovery_required") return res.json(before);
      const session = req.session as typeof req.session & { shopifyTrialRetryAt?: number };
      const now = Date.now();
      if (session.shopifyTrialRetryAt && now - session.shopifyTrialRetryAt < 3000) {
        res.set("Retry-After", "3");
        return res.status(429).json({ state: "recovery_required" });
      }
      session.shopifyTrialRetryAt = now;
      const result = await deps.claim(user);
      const current = await merchant(req);
      if (!current) return res.status(409).json({ state: "reconnect_required" });
      const after = await deps.describe(current);
      if (result.granted) deps.emit(user.shopifyShop!, "trial_activated", { source: "recovery" });
      if (after.state === "recovery_required") {
        deps.emit(user.shopifyShop!, "trial_failed", {
          source: "recovery", reason: result.reason === "ledger_not_ready" ? "ledger_not_ready" : "provisioning_failed",
        });
        return res.status(503).json(after);
      }
      res.json(after);
    } catch {
      // A transaction that failed/rolled back is safe to retry through the same atomic claim.
      if (recoveryShop) deps.emit(recoveryShop, "trial_failed", { source: "recovery", reason: "provisioning_failed" });
      res.status(503).json({ state: "recovery_required" });
    }
  });

  router.post("/activation-events", async (req, res) => {
    try {
      const event = parseShopifyActivationEvent(req.body);
      if (!event) return res.status(400).json({ error: "Invalid activation event" });
      const user = await merchant(req);
      if (!user) return res.status(409).json({ state: "reconnect_required" });
      // Browser milestones are observations, never entitlement or provisioning authority.
      const session = req.session as typeof req.session & { shopifyActivationEvents?: string[] };
      const seen = session.shopifyActivationEvents ?? [];
      if (!seen.includes(event.event)) {
        deps.emit(user.shopifyShop!, event.event, { page: event.page, source: "browser" });
        session.shopifyActivationEvents = [...seen, event.event];
      }
      res.status(204).end();
    } catch {
      res.status(503).json({ error: "Activation telemetry temporarily unavailable" });
    }
  });
  return router;
}
