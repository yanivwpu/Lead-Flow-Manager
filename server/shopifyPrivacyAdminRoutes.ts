import type { Express, RequestHandler } from "express";
export function registerShopifyPrivacyAdminRoutes(app: Express, requireAdmin: RequestHandler, read = async () => (await import("./shopifyExternalErasure")).readPrivacyOperationsStatus()) {
  app.get("/api/admin/privacy-operations", requireAdmin, async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try { res.json(await read()); }
    catch { res.status(503).json({ error: "Privacy status unavailable" }); }
  });
}
