import { Router } from "express";
import { parseShopifySupportContactAction, type ShopifyContactSnapshot, type ShopifySupportContactAction } from "@shared/shopifyContactPrivacy";

export function createShopifySupportContactRouter(deps: {
  read(userId: string): Promise<ShopifyContactSnapshot>;
  save(userId: string, action: ShopifySupportContactAction): Promise<boolean>;
}) {
  const router = Router();
  router.use("/support-contact", (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    if (!req.user) return res.status(401).json({ error: "Sign in to manage your support contact." });
    if (req.method === "POST" && (req.get("origin") !== `${req.protocol}://${req.get("host")}` ||
        req.get("sec-fetch-site") === "cross-site" || req.is("application/json") !== "application/json")) {
      return res.status(403).json({ error: "Open the app and try again." });
    }
    next();
  });
  router.get("/support-contact", async (req, res) => {
    try { res.json(await deps.read((req.user as { id: string }).id)); }
    catch { res.status(503).json({ error: "Support contact is temporarily unavailable." }); }
  });
  router.post("/support-contact", async (req, res) => {
    const action = parseShopifySupportContactAction(req.body);
    if (!action) return res.status(400).json({ error: "Enter a valid business email address." });
    try {
      if (!await deps.save((req.user as { id: string }).id, action)) return res.status(409).json({ error: "Reopen the app from your connected Shopify store." });
      res.json({ saved: true });
    } catch { res.status(503).json({ error: "Could not save. Please try again." }); }
  });
  return router;
}
