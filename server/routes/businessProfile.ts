import type { Express, Request, Response } from "express";
import { businessProfilePatchSchema } from "@shared/businessProfileSchema";
import {
  businessProfileKnowledgePatch,
  getBusinessProfileForUser,
} from "../businessProfileService";
import { storage } from "../storage";

export function registerBusinessProfileRoutes(app: Express): void {
  app.get("/api/business-profile", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const profile = await getBusinessProfileForUser(req.user.id);
      res.json(profile);
    } catch (error) {
      console.error("[business-profile] GET failed", error);
      res.status(500).json({ error: "Failed to load business profile" });
    }
  });

  app.patch("/api/business-profile", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const parsed = businessProfilePatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      }

      const patch = parsed.data;
      const knowledgeUpdates = businessProfileKnowledgePatch({
        displayName: patch.displayName ?? undefined,
        businessName: patch.businessName ?? undefined,
        companyLogo: patch.companyLogo ?? undefined,
        publicPhone: patch.publicPhone ?? undefined,
        publicEmail: patch.publicEmail === "" ? null : patch.publicEmail ?? undefined,
        publicWebsite: patch.publicWebsite === "" ? null : patch.publicWebsite ?? undefined,
        aboutText: patch.aboutText ?? undefined,
      });

      if (Object.keys(knowledgeUpdates).length > 0) {
        await storage.upsertAiBusinessKnowledge(req.user.id, knowledgeUpdates);
      }

      const profile = await getBusinessProfileForUser(req.user.id);
      res.json(profile);
    } catch (error) {
      console.error("[business-profile] PATCH failed", error);
      res.status(500).json({ error: "Failed to update business profile" });
    }
  });
}
