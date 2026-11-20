import type { Express } from "express";
import { agentPageSettingsPatchSchema } from "@shared/agent/agentPageSchema";
import { buildAgentPageSlug } from "@shared/agent/agentPageSlug";
import { getAppOrigin } from "../urlOrigins";
import { buildAgentPageSettingsResponse } from "../agentPage/agentPageService";
import { patchAgentPageSettings } from "../agentPage/agentPageDb";
import {
  isAgentPageSlugConflictError,
  prepareAgentPageSettingsPatch,
} from "../agentPage/agentPageSettingsPatch";
import { hasAgentPagePublicationAccess } from "../agentPage/agentPagePublication";
import { isRgeInstalledForUser } from "../buyerPreferenceService";

export function registerAgentPageSettingsRoutes(app: Express): void {
  app.get("/api/agent-page", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const appOrigin = getAppOrigin();
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

      const appOrigin = getAppOrigin();
      const prepared = await prepareAgentPageSettingsPatch(
        req.user.id,
        req.body,
        (body) => agentPageSettingsPatchSchema.safeParse(body),
        () => buildAgentPageSettingsResponse(req.user!.id, appOrigin),
      );

      if (!prepared.ok) {
        return res.status(prepared.status).json({ error: prepared.error, code: prepared.code });
      }

      const patch = prepared.patch;
      if (patch.agentPageEnabled === true && !(await hasAgentPagePublicationAccess(req.user.id))) {
        return res.status(403).json({
          error: "Publishing an Agent Page requires active Realtor Growth Engine access",
          code: "rge_required",
        });
      }
      // Listing publication master switch is RGE-only (UI lives in Realtor Growth Engine).
      if (patch.publishListingsPublicly !== undefined) {
        const rgeInstalled = await isRgeInstalledForUser(req.user.id);
        if (!rgeInstalled) {
          return res.status(403).json({
            error: "Publish listings publicly requires Realtor Growth Engine",
            code: "rge_required",
          });
        }
      }
      await patchAgentPageSettings(req.user.id, {
        agentPageEnabled: patch.agentPageEnabled,
        agentPageSlug: patch.agentPageSlug,
        agentPageUseCustomBio: patch.agentPageUseCustomBio,
        agentPageBio: patch.agentPageBio,
        agentPageMarketArea: patch.agentPageMarketArea,
        agentPagePreferredLeadCapture: patch.agentPagePreferredLeadCapture,
        agentPageShowHomeValueCta: patch.agentPageShowHomeValueCta,
        publishListingsPublicly: patch.publishListingsPublicly,
        publicWebsite: patch.publicWebsite,
        facebookUrl: patch.facebookUrl,
        instagramUrl: patch.instagramUrl,
        linkedinUrl: patch.linkedinUrl,
        youtubeUrl: patch.youtubeUrl,
      });

      const settings = await buildAgentPageSettingsResponse(req.user.id, appOrigin);
      res.json(settings);
    } catch (error) {
      if (isAgentPageSlugConflictError(error)) {
        return res.status(409).json({ error: "That agent slug is already taken", code: "slug_taken" });
      }
      console.error("[agent-page] PATCH failed", error);
      res.status(500).json({ error: "Failed to update agent page settings" });
    }
  });

  app.post("/api/agent-page/suggest-slug", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const settings = await buildAgentPageSettingsResponse(req.user.id, getAppOrigin());
      const slug = buildAgentPageSlug(
        settings?.businessProfileDisplayName || "agent",
        req.user.id,
      );
      res.json({ slug });
    } catch (error) {
      console.error("[agent-page] suggest-slug failed", error);
      res.status(500).json({ error: "Failed to suggest slug" });
    }
  });
}
