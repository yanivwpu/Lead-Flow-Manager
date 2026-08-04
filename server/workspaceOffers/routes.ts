/**
 * Settings → Offers & Payment Links API.
 * Workspace-admin write access; tenant isolation by userId.
 */

import type { Express, Request, Response } from "express";
import { requireWorkspaceOffersAdmin } from "./offerAccess";
import {
  archiveWorkspaceOffer,
  createWorkspaceOffer,
  getWorkspaceOffer,
  listWorkspaceOffers,
  reorderWorkspaceOffers,
  updateWorkspaceOffer,
} from "./offerStore";

export function registerWorkspaceOfferRoutes(app: Express): void {
  app.get("/api/workspace-offers", async (req: Request, res: Response) => {
    try {
      const auth = await requireWorkspaceOffersAdmin(req, res);
      if (!auth) return;
      const offers = await listWorkspaceOffers(auth.workspaceUserId, {
        includeArchived: false,
      });
      res.json({ offers });
    } catch (error) {
      console.error("[WorkspaceOffers] list failed:", error);
      res.status(500).json({ error: "Failed to load offers" });
    }
  });

  app.post("/api/workspace-offers", async (req: Request, res: Response) => {
    try {
      const auth = await requireWorkspaceOffersAdmin(req, res);
      if (!auth) return;
      const result = await createWorkspaceOffer(auth.workspaceUserId, req.body);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.status(201).json({ offer: result.offer });
    } catch (error) {
      console.error("[WorkspaceOffers] create failed:", error);
      res.status(500).json({ error: "Failed to create offer" });
    }
  });

  app.get("/api/workspace-offers/:id", async (req: Request, res: Response) => {
    try {
      const auth = await requireWorkspaceOffersAdmin(req, res);
      if (!auth) return;
      const offer = await getWorkspaceOffer(auth.workspaceUserId, req.params.id);
      if (!offer || offer.archivedAt) {
        res.status(404).json({ error: "Offer not found" });
        return;
      }
      res.json({ offer });
    } catch (error) {
      console.error("[WorkspaceOffers] get failed:", error);
      res.status(500).json({ error: "Failed to load offer" });
    }
  });

  app.patch("/api/workspace-offers/:id", async (req: Request, res: Response) => {
    try {
      const auth = await requireWorkspaceOffersAdmin(req, res);
      if (!auth) return;
      const result = await updateWorkspaceOffer(
        auth.workspaceUserId,
        req.params.id,
        req.body,
      );
      if (!result.ok) {
        res.status(result.status || 400).json({ error: result.error });
        return;
      }
      res.json({ offer: result.offer });
    } catch (error) {
      console.error("[WorkspaceOffers] update failed:", error);
      res.status(500).json({ error: "Failed to update offer" });
    }
  });

  app.post("/api/workspace-offers/reorder", async (req: Request, res: Response) => {
    try {
      const auth = await requireWorkspaceOffersAdmin(req, res);
      if (!auth) return;
      const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : null;
      if (!orderedIds) {
        res.status(400).json({ error: "orderedIds array is required" });
        return;
      }
      const result = await reorderWorkspaceOffers(auth.workspaceUserId, orderedIds);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ offers: result.offers });
    } catch (error) {
      console.error("[WorkspaceOffers] reorder failed:", error);
      res.status(500).json({ error: "Failed to reorder offers" });
    }
  });

  app.delete("/api/workspace-offers/:id", async (req: Request, res: Response) => {
    try {
      const auth = await requireWorkspaceOffersAdmin(req, res);
      if (!auth) return;
      const result = await archiveWorkspaceOffer(auth.workspaceUserId, req.params.id);
      if (!result.ok) {
        res.status(result.status || 400).json({ error: result.error });
        return;
      }
      res.json({ ok: true, offer: result.offer });
    } catch (error) {
      console.error("[WorkspaceOffers] archive failed:", error);
      res.status(500).json({ error: "Failed to archive offer" });
    }
  });
}
