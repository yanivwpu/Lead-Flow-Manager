import type { Express } from "express";
import { z } from "zod";
import { agentPageSettingsPatchSchema } from "@shared/agent/agentPageSchema";
import { buildAgentPageSlug } from "@shared/agent/agentPageSlug";
import { getRequestOrigin } from "../urlOrigins";
import { buildAgentPageSettingsResponse } from "../agentPage/agentPageService";
import { patchAgentPageSettings } from "../agentPage/agentPageDb";

export function registerAgentPageSettingsRoutes(app: Express): void {
  app.get("/api/agent-page", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const appOrigin = getRequestOrigin(req);
      const settings = await buildAgentPageSettingsResponse(req.user.id, appOrigin);
      if (!settings) return res.status(404).json({ error: "Profile not found" });
      res.json(settings);
    } catch (error) {
      console.error("[agent-page] GET failed", error);
      res.status(500).json({ error: "Failed to load agent page settings" });
    }
  });

  app.patch("/api/agent-page", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const parsed = agentPageSettingsPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const patch = parsed.data;
      let slug = patch.agentPageSlug;
      if (slug === undefined && patch.agentPageEnabled === true) {
        const current = await buildAgentPageSettingsResponse(req.user.id, getRequestOrigin(req));
        if (current && !current.agentPageSlug) {
          const auto = buildAgentPageSlug(current.resolvedDisplayName, req.user.id);
          if (auto) slug = auto;
        }
      }

      if (patch.agentPageEnabled === true) {
        const current = await buildAgentPageSettingsResponse(req.user.id, getRequestOrigin(req));
        if (!current?.publishListingsPublicly) {
          return res.status(400).json({
            error: "Enable workspace public listing publishing in Business Profile first",
            code: "publish_listings_required",
          });
        }
      }

      await patchAgentPageSettings(req.user.id, {
        agentPageEnabled: patch.agentPageEnabled,
        agentPageSlug: slug !== undefined ? slug : patch.agentPageSlug,
        agentPageDisplayName: patch.agentPageDisplayName,
        agentPageBio: patch.agentPageBio,
        agentPageMarketArea: patch.agentPageMarketArea,
        agentPagePreferredLeadCapture: patch.agentPagePreferredLeadCapture,
        agentPageShowHomeValueCta: patch.agentPageShowHomeValueCta,
      });

      const settings = await buildAgentPageSettingsResponse(req.user.id, getRequestOrigin(req));
      res.json(settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("unique") || message.includes("duplicate")) {
        return res.status(409).json({ error: "That agent slug is already taken", code: "slug_taken" });
      }
      console.error("[agent-page] PATCH failed", error);
      res.status(500).json({ error: "Failed to update agent page settings" });
    }
  });

  app.post("/api/agent-page/suggest-slug", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const body = z.object({ displayName: z.string().max(120).optional() }).safeParse(req.body ?? {});
      const settings = await buildAgentPageSettingsResponse(req.user.id, getRequestOrigin(req));
      const name = body.success ? body.data.displayName : undefined;
      const slug = buildAgentPageSlug(
        name || settings?.resolvedDisplayName || "agent",
        req.user.id,
      );
      res.json({ slug });
    } catch (error) {
      console.error("[agent-page] suggest-slug failed", error);
      res.status(500).json({ error: "Failed to suggest slug" });
    }
  });
}
