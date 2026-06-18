import type { Express } from "express";
import { agentPageSettingsPatchSchema } from "@shared/agent/agentPageSchema";
import { buildAgentPageSlug } from "@shared/agent/agentPageSlug";
import { getRequestOrigin } from "../urlOrigins";
import { buildAgentPageSettingsResponse } from "../agentPage/agentPageService";
import { patchAgentPageSettings } from "../agentPage/agentPageDb";
import {
  isAgentPageSlugConflictError,
  prepareAgentPageSettingsPatch,
} from "../agentPage/agentPageSettingsPatch";

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

      const appOrigin = getRequestOrigin(req);
      const prepared = await prepareAgentPageSettingsPatch(
        req.user.id,
        req.body,
        (body) => agentPageSettingsPatchSchema.safeParse(body),
        () => buildAgentPageSettingsResponse(req.user.id, appOrigin),
      );

      if (!prepared.ok) {
        return res.status(prepared.status).json({ error: prepared.error, code: prepared.code });
      }

      const patch = prepared.patch;
      await patchAgentPageSettings(req.user.id, {
        agentPageEnabled: patch.agentPageEnabled,
        agentPageSlug: patch.agentPageSlug,
        agentPageUseCustomBio: patch.agentPageUseCustomBio,
        agentPageBio: patch.agentPageBio,
        agentPageMarketArea: patch.agentPageMarketArea,
        agentPagePreferredLeadCapture: patch.agentPagePreferredLeadCapture,
        agentPageShowHomeValueCta: patch.agentPageShowHomeValueCta,
      });

      const settings = await buildAgentPageSettingsResponse(req.user.id, appOrigin);
      res.json(settings);
    } catch (error) {
      if (isAgentPageSlugConflictError(error)) {
        return res.status(409).json({ error: "That agent slug is already taken", code: "slug_taken" });
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error("[agent-page] PATCH failed", error);
      res.status(500).json({ error: message || "Failed to update agent page settings" });
    }
  });

  app.post("/api/agent-page/suggest-slug", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const settings = await buildAgentPageSettingsResponse(req.user.id, getRequestOrigin(req));
      const slug = buildAgentPageSlug(
        settings?.businessProfileDisplayName || "agent",
        req.user.id,
      );
      res.json({ slug });
    } catch (error) {
      console.error("[agent-page] suggest-slug failed", error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message || "Failed to suggest slug" });
    }
  });
}
