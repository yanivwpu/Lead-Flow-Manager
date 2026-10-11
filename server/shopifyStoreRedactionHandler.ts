import type { RequestHandler } from "express";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";

export function createShopifyStoreRedactionHandler(deps: {
  verify(body: Buffer | string, signature: string): boolean;
  redact(shop: string): Promise<unknown>;
}): RequestHandler {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    const signature = req.get("x-shopify-hmac-sha256");
    const headerShop = req.get("x-shopify-shop-domain");
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    if (!signature || !headerShop || !deps.verify(rawBody, signature))
      return res.status(401).json({ error: "Invalid webhook signature" });
    const shop = normalizeShopifyShopDomain(headerShop);
    const bodyShop = typeof req.body?.shop_domain === "string" ? normalizeShopifyShopDomain(req.body.shop_domain) : null;
    if (!shop || (req.body?.shop_domain != null && bodyShop !== shop))
      return res.status(400).json({ error: "Invalid shop domain" });
    try {
      await deps.redact(shop);
      console.info(JSON.stringify({ tag: "[ShopifyPrivacy]", event: "database_erasure_completed",
        at: new Date().toISOString(), externalErasurePending: true }));
      return res.status(200).json({ received: true, databaseErased: true, externalErasurePending: true });
    } catch {
      console.error("[ShopifyPrivacy] store_erasure_failed");
      return res.status(503).json({ error: "Webhook processing failed" });
    }
  };
}
