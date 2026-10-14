import type { Express } from "express";
import { salesCatalogSearchSchema } from "@shared/salesCatalog";
import { requireWorkspaceOffersAdmin } from "../workspaceOffers/offerAccess";
import type { SalesCatalogService } from "./service";

export function registerSalesCatalogRoutes(
  app: Express,
  service: SalesCatalogService,
  authorize = requireWorkspaceOffersAdmin,
): void {
  app.get("/api/sales-catalog", async (req, res) => {
    const auth = await authorize(req, res);
    if (!auth) return;
    res.set("Cache-Control", "private, no-store");
    const parsed = salesCatalogSearchSchema.safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid catalog filters" });
    try {
      res.json(await service.search(auth.workspaceUserId, parsed.data));
    } catch {
      res.status(500).json({ error: "Failed to load catalog" });
    }
  });
  app.get("/api/sales-catalog/:id", async (req, res) => {
    const auth = await authorize(req, res);
    if (!auth) return;
    res.set("Cache-Control", "private, no-store");
    try {
      const item = await service.lookup(auth.workspaceUserId, req.params.id);
      if (!item)
        return res.status(404).json({ error: "Catalog item not found" });
      res.json({ item });
    } catch {
      res.status(500).json({ error: "Failed to load catalog item" });
    }
  });
}
