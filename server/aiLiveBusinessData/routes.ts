/**
 * Live Business Data registry API for AI Brain (informational UI).
 */

import type { Express, Request, Response } from "express";
import { LIVE_BUSINESS_DATA_REGISTRY } from "@shared/aiLiveBusinessData";
import { listLiveBusinessDataProviderViews } from "./registry";

export type LiveBusinessDataRouteDeps = {
  requireAiBrainPremium: (req: Request, res: Response) => Promise<boolean>;
};

export function registerLiveBusinessDataRoutes(
  app: Express,
  deps: LiveBusinessDataRouteDeps,
): void {
  app.get("/api/ai/live-business-data", async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (!(await deps.requireAiBrainPremium(req, res))) return;

      const providers = await listLiveBusinessDataProviderViews(req.user.id);
      // Knowledge Sources already have their own Teach AI section — omit from this panel.
      const liveProviders = providers.filter((p) => p.id !== "websiteKnowledge");

      res.json({
        providers: liveProviders,
        registryVersion: 1,
        knownProviderIds: LIVE_BUSINESS_DATA_REGISTRY.map((p) => p.id),
      });
    } catch (error) {
      console.error("[LiveBusinessData] list providers failed:", error);
      res.status(500).json({ error: "Failed to load Live Business Data" });
    }
  });
}
