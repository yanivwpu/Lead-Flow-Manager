import type { Express, Request, Response } from "express";
import { getBusinessProfileForUser, saveBusinessProfileForUser } from "../businessProfileService";

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
      const result = await saveBusinessProfileForUser(req.user.id, req.body ?? {});
      if (!result.ok) {
        return res.status(result.status).json({
          error: result.error,
          ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
          ...(result.code ? { code: result.code } : {}),
        });
      }
      res.json(result.profile);
    } catch (error) {
      console.error("[business-profile] PATCH failed", error);
      res.status(500).json({ error: "Failed to update business profile" });
    }
  });
}
